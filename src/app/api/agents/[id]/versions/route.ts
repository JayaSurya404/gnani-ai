import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validatePrompt } from "@/lib/prompt-builder";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { data: agent } = await supabase
      .from("voice_agents")
      .select("id, active_version_id")
      .eq("id", id)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const { data: versions, error } = await supabase
      .from("agent_versions")
      .select("*")
      .eq("agent_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const items = (versions || []).map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      systemPrompt: v.system_prompt,
      greetingMessage: v.greeting_message,
      turnTimeoutMs: v.turn_timeout_ms,
      maxDurationSeconds: v.max_duration_seconds,
      notes: v.notes || "Version snapshot",
      createdAt: v.created_at,
      isActive: v.id === agent.active_version_id,
    }));

    return NextResponse.json({ success: true, versions: items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || !body.systemPrompt) {
      return NextResponse.json({ success: false, error: "System prompt is required." }, { status: 400 });
    }

    // Validate prompt syntax and minimum content
    const validation = validatePrompt(body.systemPrompt);
    if (!validation.isValid) {
      return NextResponse.json({
        success: false,
        error: `Prompt validation failed: ${validation.errors.join("; ")}`,
      }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // Verify agent exists
    const { data: agent } = await supabase
      .from("voice_agents")
      .select("id, active_version_id")
      .eq("id", id)
      .maybeSingle();

    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    // Query existing versions to calculate next version number
    const { data: existingVersions } = await supabase
      .from("agent_versions")
      .select("version_number")
      .eq("agent_id", id);

    let nextVerNumber = "v1.0";
    if (existingVersions && existingVersions.length > 0) {
      const numbers = existingVersions.map((v) => {
        const clean = v.version_number.replace(/^v/i, "");
        const parts = clean.split(".").map(Number);
        return parts[0] * 100 + (parts[1] || 0);
      });
      const maxVal = Math.max(...numbers);
      const major = Math.floor(maxVal / 100);
      const minor = (maxVal % 100) + 1;
      nextVerNumber = `v${major}.${minor}`;
    }

    // Insert immutable snapshot into agent_versions
    const { data: newVersion, error: vErr } = await supabase
      .from("agent_versions")
      .insert({
        agent_id: id,
        version_number: nextVerNumber,
        system_prompt: body.systemPrompt,
        greeting_message: body.greetingMessage || "Hello! How can I assist you today?",
        turn_timeout_ms: body.turnTimeoutMs || 2500,
        max_duration_seconds: body.maxDurationSeconds || 600,
        notes: body.notes || `Published update ${nextVerNumber}`,
      } as never)
      .select("*")
      .single();

    if (vErr || !newVersion) {
      return NextResponse.json({ success: false, error: vErr?.message || "Failed to create version snapshot" }, { status: 500 });
    }

    // If publishing, update active_version_id
    if (body.publish !== false) {
      await supabase
        .from("voice_agents")
        .update({
          active_version_id: newVersion.id,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
    }

    return NextResponse.json({
      success: true,
      version: {
        id: newVersion.id,
        versionNumber: newVersion.version_number,
        systemPrompt: newVersion.system_prompt,
        greetingMessage: newVersion.greeting_message,
        turnTimeoutMs: newVersion.turn_timeout_ms,
        maxDurationSeconds: newVersion.max_duration_seconds,
        notes: newVersion.notes,
        createdAt: newVersion.created_at,
        isActive: body.publish !== false,
      },
      message: `Version ${nextVerNumber} created and published successfully.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

