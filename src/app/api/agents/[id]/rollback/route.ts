import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || !body.targetVersionId) {
      return NextResponse.json({ success: false, error: "Target version ID is required for rollback." }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // 1. Verify target version belongs to this agent
    const { data: targetVersion, error: vErr } = await supabase
      .from("agent_versions")
      .select("*")
      .eq("id", body.targetVersionId)
      .eq("agent_id", id)
      .maybeSingle();

    if (vErr || !targetVersion) {
      return NextResponse.json({
        success: false,
        error: "Target version snapshot does not belong to this agent or does not exist.",
      }, { status: 404 });
    }

    // 2. Atomically update agent active_version_id
    const { data: updatedAgent, error: aErr } = await supabase
      .from("voice_agents")
      .update({
        active_version_id: targetVersion.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .select("id, name, active_version_id")
      .single();

    if (aErr || !updatedAgent) {
      return NextResponse.json({ success: false, error: aErr?.message || "Failed to rollback agent version" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      activeVersionId: targetVersion.id,
      versionNumber: targetVersion.version_number,
      message: `Agent ${updatedAgent.name} successfully rolled back to version ${targetVersion.version_number}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

