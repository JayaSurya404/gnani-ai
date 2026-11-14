import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { data: agent, error } = await supabase
      .from("voice_agents")
      .select("*, agent_versions(*)")
      .eq("id", id)
      .maybeSingle();

    if (error || !agent) {
      return NextResponse.json({ success: false, error: error?.message || "Agent not found" }, { status: 404 });
    }

    const versions = (Array.isArray(agent.agent_versions) ? agent.agent_versions : []).sort(
      (a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role_title,
        languageMode: agent.language_mode,
        voiceId: agent.voice_id,
        voiceName: agent.voice_name,
        status: agent.status,
        activeVersionId: agent.active_version_id,
        versions: versions.map((v: { id: string; version_number: string; system_prompt: string; greeting_message: string; turn_timeout_ms: number; max_duration_seconds: number; notes: string; created_at: string }) => ({
          id: v.id,
          versionNumber: v.version_number,
          systemPrompt: v.system_prompt,
          greetingMessage: v.greeting_message,
          turnTimeoutMs: v.turn_timeout_ms,
          maxDurationSeconds: v.max_duration_seconds,
          notes: v.notes,
          createdAt: v.created_at,
          isActive: v.id === agent.active_version_id,
        })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionContext();
    if (session.isEvaluator) {
      return NextResponse.json(
        { success: false, error: "Action forbidden: Evaluator preview account has read-only permissions." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name) updatePayload.name = String(body.name).trim();
    if (body.roleTitle) updatePayload.role_title = String(body.roleTitle).trim();
    if (body.languageMode) updatePayload.language_mode = body.languageMode;
    if (body.voiceId) updatePayload.voice_id = body.voiceId;
    if (body.voiceName) updatePayload.voice_name = body.voiceName;
    if (body.status) updatePayload.status = body.status;
    if (body.activeVersionId) updatePayload.active_version_id = body.activeVersionId;

    const { data: updated, error } = await supabase
      .from("voice_agents")
      .update(updatePayload as never)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error || !updated) {
      return NextResponse.json({ success: false, error: error?.message || "Failed to update agent" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      agent: updated,
      message: "Agent updated successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

