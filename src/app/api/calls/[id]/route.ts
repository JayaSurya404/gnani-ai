import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callSessionId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");

    // 1. Fetch Call Session
    let sessionQuery = supabase
      .from("call_sessions")
      .select(`
        id,
        organization_id,
        business_id,
        lead_id,
        agent_id,
        direction,
        channel,
        customer_phone,
        customer_name,
        status,
        start_time,
        end_time,
        duration_seconds,
        recording_url,
        created_at,
        updated_at
      `)
      .eq("id", callSessionId);

    if (orgId) {
      sessionQuery = sessionQuery.eq("organization_id", orgId);
    }

    const { data: session, error: sessErr } = await sessionQuery.single();

    if (sessErr || !session) {
      return NextResponse.json({ success: false, error: "Call session not found" }, { status: 404 });
    }

    // 2. Fetch Associated Lead
    let lead: Record<string, unknown> | null = null;
    if (session.lead_id) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("id, name, phone, email, temperature, status, score, do_not_call, primary_interest, location")
        .eq("id", session.lead_id)
        .single();
      lead = leadData;
    }

    // 3. Fetch Chronological Transcript Segments
    const { data: transcriptSegments } = await supabase
      .from("transcript_segments")
      .select("id, speaker, language, text, confidence, start_offset_ms, end_offset_ms, created_at")
      .eq("call_session_id", callSessionId)
      .order("created_at", { ascending: true });

    // 3b. Fetch Call Events (including audio generation status, STT provider, and timestamps)
    const { data: callEvents } = await supabase
      .from("call_events")
      .select("id, event_type, payload, created_at")
      .eq("call_session_id", callSessionId)
      .order("created_at", { ascending: true });

    // 4. Fetch Verified Call Outcome
    const { data: outcome } = await supabase
      .from("call_outcomes")
      .select(`
        id,
        disposition,
        business_outcome,
        compliance_state,
        escalation_state,
        sentiment,
        confidence_score,
        summary,
        key_points,
        action_items,
        intelligence_data,
        evidence_coverage,
        extraction_confidence,
        qualification_decision,
        follow_up_recommended,
        created_at
      `)
      .eq("call_session_id", callSessionId)
      .maybeSingle();

    // 5. Fetch Lead Scoring Breakdown
    const { data: leadScoring } = await supabase
      .from("lead_scoring_breakdowns")
      .select(`
        id,
        analysis_version,
        total_score,
        normalized_observed_score,
        observed_weight_total,
        evidence_coverage,
        extraction_confidence,
        classification,
        scoring_factors,
        unresolved_unknowns,
        scoring_version,
        created_at
      `)
      .eq("call_session_id", callSessionId)
      .order("analysis_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 6. Fetch Associated Follow-up Tasks & Callbacks
    const { data: tasks } = await supabase
      .from("follow_up_tasks")
      .select("id, title, description, due_date, priority, status, assigned_to, created_at")
      .eq("call_session_id", callSessionId)
      .order("created_at", { ascending: false });

    // 7. Fetch Automation Runs
    const { data: automationRuns } = await supabase
      .from("automation_runs")
      .select(`
        id,
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
        created_at
      `)
      .eq("call_session_id", callSessionId)
      .order("created_at", { ascending: false });

    // 8. Fetch Customer Notification Drafts
    const { data: notificationDispatches } = await supabase
      .from("notification_dispatches")
      .select(`
        id,
        audience,
        channel,
        recipient,
        consent_verified,
        consent_reference,
        rendered_message,
        status,
        provider,
        idempotency_key,
        approved_by,
        approved_at,
        sent_at,
        delivered_at,
        created_at
      `)
      .eq("call_session_id", callSessionId)
      .order("created_at", { ascending: false });

    // 9. Fetch Call Analysis Job Status
    const { data: analysisJob } = await supabase
      .from("call_analysis_jobs")
      .select("id, status, attempts, max_attempts, analysis_version, last_error, available_at, completed_at")
      .eq("call_session_id", callSessionId)
      .order("analysis_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      call: {
        ...session,
        lead,
        transcriptSegments: transcriptSegments || [],
        events: callEvents || [],
        outcome: outcome || null,
        leadScoring: leadScoring || null,
        tasks: tasks || [],
        automationRuns: automationRuns || [],
        notificationDispatches: notificationDispatches || [],
        analysisJob: analysisJob || null
      }
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

