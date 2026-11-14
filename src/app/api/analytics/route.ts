import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrganizationId } from "@/actions/organization";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");
    const range = url.searchParams.get("range") || "30D";

    let targetOrgId: string | null = orgId;
    if (!targetOrgId) {
      targetOrgId = await getActiveOrganizationId();
    }

    if (!targetOrgId) {
      console.warn("[/api/analytics] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    // Determine date cutoff based on range
    let cutoffDate: string | null = null;
    const now = new Date();
    if (range === "7D") {
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (range === "30D") {
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (range === "90D") {
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    }

    // 1. Fetch Call Sessions Metrics
    let callQuery = supabase
      .from("call_sessions")
      .select("id, status, duration_seconds, created_at")
      .eq("organization_id", targetOrgId);

    if (cutoffDate) {
      callQuery = callQuery.gte("created_at", cutoffDate);
    }

    const { data: callRows, error: callErr } = await callQuery;
    if (callErr) {
      return NextResponse.json({ success: false, error: callErr.message }, { status: 500 });
    }

    const totalCalls = callRows?.length ?? 0;
    const completedCalls = callRows?.filter((c) => c.status === "COMPLETED").length ?? 0;
    const failedCalls = callRows?.filter((c) => c.status === "FAILED").length ?? 0;
    const totalDuration = callRows?.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) ?? 0;
    const avgCallDurationSec = completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0;

    // 2. Fetch Call Outcomes Metrics
    let outcomesQuery = supabase
      .from("call_outcomes")
      .select("id, business_outcome, compliance_state, escalation_state, confidence_score, evidence_coverage, created_at, call_sessions!inner(organization_id)")
      .eq("call_sessions.organization_id", targetOrgId);

    if (cutoffDate) {
      outcomesQuery = outcomesQuery.gte("created_at", cutoffDate);
    }

    const { data: outcomeRows } = await outcomesQuery;

    const outcomeDistribution: Record<string, number> = {};
    let dncRegistrations = 0;
    let escalationRequests = 0;
    let qualifiedCalls = 0;

    if (outcomeRows && outcomeRows.length > 0) {
      for (const o of outcomeRows) {
        outcomeDistribution[o.business_outcome] = (outcomeDistribution[o.business_outcome] || 0) + 1;
        if (o.business_outcome === "QUALIFIED") qualifiedCalls++;
        if (o.compliance_state === "DNC_REQUESTED" || o.compliance_state === "DNC_REGISTERED") dncRegistrations++;
        if (o.escalation_state === "REQUESTED" || o.escalation_state === "FOLLOW_UP_PENDING") escalationRequests++;
      }
    }

    const qualificationRate = totalCalls > 0 ? Number(((qualifiedCalls / totalCalls) * 100).toFixed(1)) : 0;

    // 3. Fetch Leads Metrics
    let leadsQuery = supabase
      .from("leads")
      .select("id, temperature, status, score, do_not_call, created_at")
      .eq("organization_id", targetOrgId);

    if (cutoffDate) {
      leadsQuery = leadsQuery.gte("created_at", cutoffDate);
    }

    const { data: leadRows } = await leadsQuery;
    const totalLeads = leadRows?.length ?? 0;
    const hotLeads = leadRows?.filter((l) => l.temperature === "HOT").length ?? 0;
    const warmLeads = leadRows?.filter((l) => l.temperature === "WARM").length ?? 0;
    const coldLeads = leadRows?.filter((l) => l.temperature === "COLD").length ?? 0;
    const dncLeads = leadRows?.filter((l) => l.do_not_call === true).length ?? 0;

    // 4. Fetch Tasks Metrics
    let tasksQuery = supabase
      .from("follow_up_tasks")
      .select("id, status, title, created_at")
      .eq("organization_id", targetOrgId);

    if (cutoffDate) {
      tasksQuery = tasksQuery.gte("created_at", cutoffDate);
    }

    const { data: taskRows } = await tasksQuery;
    const pendingFollowUps = taskRows?.filter((t) => t.status === "PENDING").length ?? 0;
    const callbackTasks = taskRows?.filter((t) => t.title.toLowerCase().includes("callback")).length ?? 0;
    const completedTasks = taskRows?.filter((t) => t.status === "COMPLETED").length ?? 0;

    // 5. Fetch Automation Runs Metrics
    let runsQuery = supabase
      .from("automation_runs")
      .select("id, status, created_at")
      .eq("organization_id", targetOrgId);

    if (cutoffDate) {
      runsQuery = runsQuery.gte("created_at", cutoffDate);
    }

    const { data: runRows } = await runsQuery;
    const totalAutomationRuns = runRows?.length ?? 0;
    const completedAutomationRuns = runRows?.filter((r) => r.status === "COMPLETED").length ?? 0;
    const skippedDncRuns = runRows?.filter((r) => r.status === "SKIPPED_DNC").length ?? 0;
    const failedAutomationRuns = runRows?.filter((r) => r.status === "FAILED" || r.status === "DEAD_LETTER").length ?? 0;
    const automationSuccessRate = totalAutomationRuns > 0
      ? Number((((completedAutomationRuns + skippedDncRuns) / totalAutomationRuns) * 100).toFixed(1))
      : 100.0;

    // 6. Fetch Analysis Jobs Failures
    let jobsQuery = supabase
      .from("call_analysis_jobs")
      .select("id, status, created_at")
      .eq("organization_id", targetOrgId);

    if (cutoffDate) {
      jobsQuery = jobsQuery.gte("created_at", cutoffDate);
    }

    const { data: jobRows } = await jobsQuery;
    const totalJobs = jobRows?.length ?? 0;
    const failedJobs = jobRows?.filter((j) => j.status === "FAILED").length ?? 0;
    const analysisProcessingFailures = failedJobs;

    return NextResponse.json({
      success: true,
      range,
      metrics: {
        calls: {
          totalCalls,
          completedCalls,
          failedCalls,
          avgCallDurationSec,
          totalDurationSec: totalDuration,
          qualifiedCalls,
          qualificationRate
        },
        leads: {
          totalLeads,
          hotLeads,
          warmLeads,
          coldLeads,
          dncLeads,
          distribution: {
            HOT: hotLeads,
            WARM: warmLeads,
            COLD: coldLeads
          }
        },
        operations: {
          pendingFollowUps,
          callbackTasks,
          completedTasks,
          dncRegistrations,
          escalationRequests
        },
        automations: {
          totalRuns: totalAutomationRuns,
          completedRuns: completedAutomationRuns,
          skippedDncRuns,
          failedRuns: failedAutomationRuns,
          successRate: automationSuccessRate
        },
        intelligence: {
          totalAnalysisJobs: totalJobs,
          analysisProcessingFailures,
          outcomeDistribution
        }
      }
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

