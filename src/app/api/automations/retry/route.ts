import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const body = await req.json();
    const { runId } = body;

    if (!runId) {
      return NextResponse.json({ success: false, error: "Missing required runId" }, { status: 400 });
    }

    // 1. Fetch current run record
    const { data: run, error: fetchErr } = await supabase
      .from("automation_runs")
      .select("id, organization_id, call_session_id, automation_id, idempotency_key, status, attempt_count, max_attempts")
      .eq("id", runId)
      .single();

    if (fetchErr || !run) {
      return NextResponse.json({ success: false, error: "Automation run not found" }, { status: 404 });
    }

    // Organization Isolation Check
    if (body.organizationId && run.organization_id !== body.organizationId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cross-organization retry denied." },
        { status: 403 }
      );
    }

    // Role-based authorization
    if (body.userRole && !["OWNER", "ADMIN", "SUPERVISOR", "STAFF"].includes(String(body.userRole).toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Insufficient permissions to retry automations." },
        { status: 403 }
      );
    }

    // Only FAILED or DEAD_LETTER runs can be manually retried
    if (run.status !== "FAILED" && run.status !== "DEAD_LETTER") {
      return NextResponse.json(
        { success: false, error: `Cannot retry run in '${run.status}' state. Only FAILED or DEAD_LETTER runs can be retried.` },
        { status: 400 }
      );
    }

    // 2. Atomically reset to PROCESSING with race-condition guard (.in("status", ...))
    const { data: updatedRun, error: updateErr } = await supabase
      .from("automation_runs")
      .update({
        status: "PROCESSING",
        last_error: null,
        available_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", runId)
      .in("status", ["FAILED", "DEAD_LETTER"])
      .select()
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    if (!updatedRun) {
      return NextResponse.json(
        { success: false, error: "Concurrent retry conflict: Run is already being processed or retried." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Automation run queued for retry.",
      run: updatedRun
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

