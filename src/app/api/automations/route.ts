import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");

    let targetOrgId: string | null = orgId;
    if (!targetOrgId) {
      const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
      targetOrgId = org?.id ?? null;
    }

    if (!targetOrgId) {
      return NextResponse.json({ success: true, rules: [], recentRuns: [] });
    }

    // 1. Fetch active/paused automation rules
    const { data: rules, error: rulesErr } = await supabase
      .from("automations")
      .select("id, organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status, created_at, updated_at")
      .eq("organization_id", targetOrgId)
      .order("created_at", { ascending: true });

    if (rulesErr) {
      return NextResponse.json({ success: false, error: rulesErr.message }, { status: 500 });
    }

    // 2. Fetch recent automation execution runs
    const { data: runs, error: runsErr } = await supabase
      .from("automation_runs")
      .select(`
        id,
        organization_id,
        call_session_id,
        automation_id,
        idempotency_key,
        status,
        attempt_count,
        max_attempts,
        available_at,
        last_error,
        result_metadata,
        started_at,
        completed_at,
        created_at,
        call_sessions (
          customer_name,
          customer_phone
        ),
        automations (
          title,
          action_type
        )
      `)
      .eq("organization_id", targetOrgId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsErr) {
      return NextResponse.json({ success: false, error: runsErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      rules: rules || [],
      recentRuns: runs || []
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const body = await req.json();
    const { organizationId, title, triggerEvent, triggerConditions, actionType, actionConfig } = body;

    if (!title || !triggerEvent || !actionType) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { data: rule, error } = await supabase
      .from("automations")
      .insert({
        organization_id: organizationId,
        title,
        trigger_event: triggerEvent,
        trigger_conditions: triggerConditions || {},
        action_type: actionType,
        action_config: actionConfig || {},
        status: "ACTIVE"
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

