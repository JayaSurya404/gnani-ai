import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/actions/organization";
import { DEFAULT_SYSTEM_PROMPTS } from "@/lib/prompt-templates";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { searchParams } = new URL(req.url);
    let orgId = searchParams.get("organizationId");
    if (!orgId) {
      orgId = await getActiveOrganizationId();
    }

    if (!orgId) {
      console.warn("[/api/agents] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    const { data: dbAgents, error } = await supabase
      .from("voice_agents")
      .select("*, agent_versions(*)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const agents = (dbAgents || []).map((a) => {
      const versions = Array.isArray(a.agent_versions) ? a.agent_versions : [];
      const activeVer = versions.find((v: { id: string }) => v.id === a.active_version_id) || versions[0];
      return {
        id: a.id,
        name: a.name,
        role: a.role_title,
        languageMode: a.language_mode,
        voiceId: a.voice_id,
        voiceName: a.voice_name,
        status: a.status,
        activeVersion: activeVer?.version_number || "v1.0",
        systemPrompt: activeVer?.system_prompt || DEFAULT_SYSTEM_PROMPTS.solar_qualifier,
        greetingMessage: activeVer?.greeting_message || "Vanakkam! I am an AI consultant calling from Aadhira Solar.",
        turnTimeoutMs: activeVer?.turn_timeout_ms || 2500,
        maxDurationSeconds: activeVer?.max_duration_seconds || 600,
        versionCount: versions.length,
        updatedAt: new Date(a.updated_at).toLocaleDateString(),
      };
    });

    return NextResponse.json({ success: true, agents });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.name || !body.roleTitle) {
      return NextResponse.json({ success: false, error: "Agent name and role are required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    let resolvedOrgId = body.organizationId;
    if (!resolvedOrgId) {
      resolvedOrgId = await getActiveOrganizationId();
      if (!resolvedOrgId) {
        return NextResponse.json({ success: false, error: "No active organization found" }, { status: 400 });
      }
    }

    // Insert voice_agent
    const { data: newAgent, error: aErr } = await supabase
      .from("voice_agents")
      .insert({
        organization_id: resolvedOrgId,
        name: String(body.name).trim(),
        role_title: String(body.roleTitle).trim(),
        language_mode: body.languageMode || "AUTO",
        primary_language: body.languageMode === "TAMIL" ? "ta-IN" : "en-IN",
        voice_id: body.voiceId || "ta-IN-selvi",
        voice_name: body.voiceName || "Selvi (Warm Tamil/Tanglish)",
        status: "ACTIVE",
      } as never)
      .select("id")
      .single();

    if (aErr || !newAgent) {
      return NextResponse.json({ success: false, error: aErr?.message || "Failed to create agent" }, { status: 500 });
    }

    // Insert initial version v1.0
    const initialPrompt = body.systemPrompt || DEFAULT_SYSTEM_PROMPTS.solar_qualifier;
    const initialGreeting = body.greetingMessage || "Vanakkam! I am an AI consultant calling from Aadhira Solar Tech.";

    const { data: newVersion, error: vErr } = await supabase
      .from("agent_versions")
      .insert({
        agent_id: newAgent.id,
        version_number: "v1.0",
        system_prompt: initialPrompt,
        greeting_message: initialGreeting,
        turn_timeout_ms: body.turnTimeoutMs || 2500,
        max_duration_seconds: body.maxDurationSeconds || 600,
        notes: "Initial v1.0 baseline snapshot",
      } as never)
      .select("id")
      .single();

    if (vErr || !newVersion) {
      console.warn("Failed to create initial version:", vErr?.message);
    } else {
      // Set active_version_id
      await supabase
        .from("voice_agents")
        .update({ active_version_id: newVersion.id } as never)
        .eq("id", newAgent.id);
    }

    return NextResponse.json({
      success: true,
      agentId: newAgent.id,
      versionId: newVersion?.id,
      versionNumber: "v1.0",
      message: "Agent and initial v1.0 version created successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

