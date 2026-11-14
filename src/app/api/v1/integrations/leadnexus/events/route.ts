import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { voiceNexusCallEventSchema } from "@/lib/integrations/contract";
import { verifyIntegrationSignature } from "@/lib/integrations/signing";
import type { LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-integration-signature");
    const timestamp = req.headers.get("x-integration-timestamp");
    const requestId = req.headers.get("x-integration-request-id");

    const secret =
      process.env.VOICENEXUS_SHARED_SECRET ||
      process.env.LEADNEXUS_SHARED_SECRET ||
      "voicenexus-local-dev-secret-333";

    const path = new URL(req.url).pathname;

    // 1. Verify HMAC Signature
    const verification = verifyIntegrationSignature({
      rawBody,
      signature,
      timestamp,
      requestId,
      secret,
      method: "POST",
      path,
    });

    if (!verification.isValid) {
      return NextResponse.json(
        { success: false, error: verification.reason || "Unauthorized signature" },
        { status: 401 }
      );
    }

    // 2. Validate JSON Schema
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const validation = voiceNexusCallEventSchema.safeParse(parsedJson);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validation.error.format() },
        { status: 422 }
      );
    }

    const payload = validation.data;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database client unavailable" },
        { status: 503 }
      );
    }

    // 3. Fetch current lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, status, score, do_not_call, organization_id")
      .eq("id", payload.lead.id)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: "Referenced lead not found" },
        { status: 404 }
      );
    }

    // 4. Determine Lead Status Updates via Explicit Business Rules
    let nextStatus: LeadStatus = lead.status as LeadStatus;
    let markDnc = lead.do_not_call;

    if (payload.event === "CALL_ANSWERED" && lead.status === "NEW") {
      nextStatus = "CONTACTED";
    } else if (
      (payload.event === "CALL_FAILED" ||
        payload.event === "CALL_NO_ANSWER" ||
        payload.event === "CALL_BUSY") &&
      lead.status === "NEW"
    ) {
      nextStatus = "CONTACTED";
    } else if (payload.event === "CALL_ANALYSIS_COMPLETED" && payload.outcome) {
      const disposition = payload.outcome.disposition;
      const businessOutcome = payload.outcome.businessOutcome;

      if (disposition === "DO_NOT_CALL") {
        nextStatus = "DO_NOT_CALL";
        markDnc = true;
      } else if (disposition === "INTERESTED" && businessOutcome === "QUALIFIED") {
        nextStatus = "QUALIFIED";
      } else if (disposition === "CALLBACK_REQUESTED") {
        nextStatus = "FOLLOW_UP";
      } else if (disposition === "NOT_INTERESTED" || disposition === "WRONG_NUMBER") {
        nextStatus = "LOST";
      }
    }

    // 5. Update Lead Status and Last Activity
    const leadUpdates: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (nextStatus !== lead.status) {
      leadUpdates.status = nextStatus;
    }
    if (markDnc && !lead.do_not_call) {
      leadUpdates.do_not_call = true;
    }

    await supabase.from("leads").update(leadUpdates as never).eq("id", lead.id);

    // 6. Record Event in Timeline
    let eventTitle = `AI Phone Call: ${payload.event.replace(/_/g, " ")}`;
    if (payload.event === "CALL_INITIATED") {
      eventTitle = `Outbound Call Initiated (${payload.call.language})`;
    } else if (payload.event === "CALL_ANSWERED") {
      eventTitle = "Call Answered by Customer";
    } else if (payload.event === "CALL_COMPLETED") {
      eventTitle = `Call Completed (${payload.call.durationSeconds}s duration)`;
    } else if (payload.event === "CALL_ANALYSIS_COMPLETED") {
      eventTitle = `Post-Call Intelligence Analysis (${payload.outcome?.disposition || "Resolved"})`;
    } else if (payload.event === "FOLLOW_UP_CREATED") {
      eventTitle = `Follow-Up Scheduled: ${payload.followUp?.title || "Pending"}`;
    }

    await supabase.from("lead_events").insert({
      organization_id: lead.organization_id,
      lead_id: lead.id,
      event_type: payload.event,
      title: eventTitle,
      description: payload.outcome?.summary || `Telephony status: ${payload.call.status}`,
      metadata: {
        eventId: payload.eventId,
        callSessionId: payload.call.callSessionId,
        twilioCallSid: payload.call.twilioCallSid,
        durationSeconds: payload.call.durationSeconds,
        disposition: payload.outcome?.disposition,
        sentiment: payload.outcome?.sentiment,
        businessOutcome: payload.outcome?.businessOutcome,
        recordingUrl: payload.call.recordingUrl,
        followUp: payload.followUp,
      },
    } as never);

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      status: nextStatus,
      event: payload.event,
      message: "Lead journey updated successfully from VoiceNexus telephony event.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

