import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrganizationId } from "@/actions/organization";
import { getPhoneVariants } from "@/lib/phone";
import { reconcileOrganizationInFlightCalls } from "@/lib/telephony/active-call-reconciliation";
import type { CallStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");
    const search = url.searchParams.get("search")?.trim();
    const outcome = url.searchParams.get("outcome");
    const status = url.searchParams.get("status");
    const temperature = url.searchParams.get("temperature");
    const complianceState = url.searchParams.get("complianceState");
    const escalationState = url.searchParams.get("escalationState");
    const isDnc = url.searchParams.get("isDnc");
    const isEscalation = url.searchParams.get("isEscalation");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // Resolve active organization context
    let targetOrgId: string | null = orgId;
    if (!targetOrgId) {
      targetOrgId = await getActiveOrganizationId();
    }

    if (!targetOrgId) {
      console.warn("[/api/calls] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    // Reconcile any in-flight calls against live carrier status (Twilio REST API)
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (accountSid && authToken) {
        const twClient = twilio(accountSid, authToken);
        await reconcileOrganizationInFlightCalls(supabase, twClient, targetOrgId);
      }
    } catch (recErr) {
      console.warn("[Calls API] Background reconciliation skipped:", recErr);
    }

    // Build base query
    let query = supabase
      .from("call_sessions")
      .select(`
        id,
        organization_id,
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
        call_outcomes (
          id,
          disposition,
          sentiment,
          confidence_score,
          summary,
          key_points,
          action_items,
          qualification_decision,
          follow_up_recommended,
          created_at
        ),
        leads (
          id,
          name,
          phone,
          temperature,
          status,
          score,
          do_not_call
        )
      `, { count: "exact" })
      .eq("organization_id", targetOrgId);

    // Apply filters
    if (status) {
      query = query.eq("status", status as CallStatus);
    }

    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    // Ordering
    const ascending = sortOrder === "asc";
    if (sortBy === "duration") {
      query = query.order("duration_seconds", { ascending });
    } else {
      query = query.order("created_at", { ascending });
    }

    // Range pagination
    query = query.range(offset, offset + limit - 1);

    const { data: rawSessions, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let sessions = rawSessions || [];

    // In-memory filters for joined relations if specified
    if (outcome) {
      sessions = sessions.filter((s) => {
        const outcomes = Array.isArray(s.call_outcomes) ? s.call_outcomes : (s.call_outcomes ? [s.call_outcomes] : []);
        return outcomes.some((o: { business_outcome?: string }) => o?.business_outcome === outcome);
      });
    }

    if (complianceState) {
      sessions = sessions.filter((s) => {
        const outcomes = Array.isArray(s.call_outcomes) ? s.call_outcomes : (s.call_outcomes ? [s.call_outcomes] : []);
        return outcomes.some((o: { compliance_state?: string }) => o?.compliance_state === complianceState);
      });
    }

    if (escalationState) {
      sessions = sessions.filter((s) => {
        const outcomes = Array.isArray(s.call_outcomes) ? s.call_outcomes : (s.call_outcomes ? [s.call_outcomes] : []);
        return outcomes.some((o: { escalation_state?: string }) => o?.escalation_state === escalationState);
      });
    }

    if (isDnc === "true") {
      sessions = sessions.filter((s) => {
        const leadDnc = (s.leads as { do_not_call?: boolean } | null)?.do_not_call === true;
        const outcomes = Array.isArray(s.call_outcomes) ? s.call_outcomes : (s.call_outcomes ? [s.call_outcomes] : []);
        const outcomeDnc = outcomes.some((o: { compliance_state?: string }) =>
          o?.compliance_state === "DNC_REQUESTED" || o?.compliance_state === "DNC_REGISTERED"
        );
        return leadDnc || outcomeDnc;
      });
    }

    if (isEscalation === "true") {
      sessions = sessions.filter((s) => {
        const outcomes = Array.isArray(s.call_outcomes) ? s.call_outcomes : (s.call_outcomes ? [s.call_outcomes] : []);
        return outcomes.some((o: { escalation_state?: string }) =>
          o?.escalation_state === "REQUESTED" || o?.escalation_state === "FOLLOW_UP_PENDING"
        );
      });
    }

    if (temperature) {
      sessions = sessions.filter((s) => {
        const leadTemp = (s.leads as { temperature?: string } | null)?.temperature;
        return leadTemp === temperature;
      });
    }

    const total = count ?? sessions.length;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      calls: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
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

    let orgId = body.organizationId;
    if (!orgId) {
      orgId = await getActiveOrganizationId();
    }
    if (!orgId) {
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ success: false, error: "No organization found" }, { status: 400 });
    }

    const direction = body.direction || "OUTBOUND";

    // Task 1: Strict Outbound Do-Not-Call (DNC) Compliance Check
    if (direction === "OUTBOUND") {
      const phone = body.customerPhone;
      const leadId = body.leadId;

      if (phone || leadId) {
        let dncCheckQuery = supabase
          .from("leads")
          .select("id, do_not_call, status")
          .eq("organization_id", orgId)
          .is("deleted_at", null);

        if (leadId) {
          dncCheckQuery = dncCheckQuery.eq("id", leadId);
        } else if (phone) {
          const variants = getPhoneVariants(phone);
          dncCheckQuery = dncCheckQuery.in("phone", variants);
        }

        const { data: matchedLeads, error: dncCheckErr } = await dncCheckQuery;
        if (dncCheckErr) {
          return NextResponse.json(
            { success: false, error: "Failed to verify Do-Not-Call suppression status; outbound call blocked for compliance." },
            { status: 503 }
          );
        }

        const isDnc = matchedLeads && matchedLeads.some(
          (l) => l.do_not_call === true || l.status === "DO_NOT_CALL"
        );
        if (isDnc) {
          return NextResponse.json(
            {
              success: false,
              error: "Outbound call blocked: recipient is registered on Do-Not-Call (DNC) list.",
              isDncSuppressed: true,
            },
            { status: 403 }
          );
        }
      }
    }

    const { data: session, error } = await supabase
      .from("call_sessions")
      .insert({
        organization_id: orgId,
        lead_id: body.leadId || null,
        agent_id: body.agentId || null,
        direction,
        channel: body.channel || "BROWSER_WEBRTC",
        customer_phone: body.customerPhone || null,
        customer_name: body.customerName || "Web Caller",
        status: "IN_PROGRESS",
        start_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
