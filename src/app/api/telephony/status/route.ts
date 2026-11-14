import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/telephony/webhook-auth";
import { dispatchCallEventToLeadNexus } from "@/lib/integrations/reverse-sync-dispatcher";
import { analyzeCallTranscript } from "@/lib/post-call-analyzer";
import type { CallStatus, Json } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * GET: Reconcile and inspect live call status for a specific sessionId or callSid.
 * Queries Supabase and verifies against Twilio REST API if session is still in-flight.
 */
export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const callSid = url.searchParams.get("callSid");

    if (!sessionId && !callSid) {
      return NextResponse.json({ error: "Missing sessionId or callSid parameter" }, { status: 400 });
    }

    let query = supabase.from("call_sessions").select("*");
    if (sessionId) {
      query = query.eq("id", sessionId);
    } else if (callSid) {
      query = query.or(`recording_url.eq.twilio:${callSid},recording_url.ilike.%${callSid}%`);
    }

    const { data: session } = await query.maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    // If session is still INITIATING, RINGING, or IN_PROGRESS, reconcile against Twilio REST API
    if (["INITIATING", "RINGING", "IN_PROGRESS"].includes(session.status)) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twSidMatch = session.recording_url?.match(/CA[a-zA-Z0-9]{32}/i);
      const effectiveTwSid = callSid || (twSidMatch ? twSidMatch[0] : null);

      if (effectiveTwSid && accountSid && authToken) {
        try {
          const client = twilio(accountSid, authToken);
          const twCall = await client.calls(effectiveTwSid).fetch();
          const twStatus = (twCall.status || "").toLowerCase();

          if (["completed", "canceled", "busy", "no-answer", "failed"].includes(twStatus)) {
            const mappedStatus = mapTwilioCallStatus(twStatus);
            const duration = parseInt(twCall.duration || "0", 10);
            const endTime = twCall.endTime ? new Date(twCall.endTime).toISOString() : new Date().toISOString();

            await supabase
              .from("call_sessions")
              .update({
                status: mappedStatus,
                duration_seconds: duration,
                end_time: endTime,
                updated_at: new Date().toISOString(),
              })
              .eq("id", session.id);

            // Log event
            await supabase.from("call_events").insert({
              call_session_id: session.id,
              event_type: `CALL_STATUS_${mappedStatus}`,
              payload: { reconciledVia: "GET_STATUS_POLL", twilioStatus: twStatus },
            } as never);

            session.status = mappedStatus;
            session.duration_seconds = duration;
            session.end_time = endTime;
          }
        } catch (fetchErr) {
          console.warn("[Telephony Status GET] Live Twilio status query note:", fetchErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        durationSeconds: session.duration_seconds,
        startTime: session.start_time,
        endTime: session.end_time,
        customerPhone: session.customer_phone,
        customerName: session.customer_name,
        recordingUrl: session.recording_url,
      },
    });
  } catch (err) {
    console.error("[Telephony Status GET] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function mapTwilioCallStatus(twilioStatus: string): CallStatus {
  switch (twilioStatus.toLowerCase()) {
    case "queued":
      return "QUEUED";
    case "initiated":
      return "INITIATING";
    case "ringing":
      return "RINGING";
    case "in-progress":
      return "IN_PROGRESS";
    case "completed":
      return "COMPLETED";
    case "busy":
      return "BUSY";
    case "no-answer":
      return "NO_ANSWER";
    case "canceled":
      return "CANCELED";
    case "failed":
    default:
      return "FAILED";
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const signature = req.headers.get("x-twilio-signature");
    const fullUrl = req.url;

    // Parse form-urlencoded data from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // 1. Signature Verification
    const verification = verifyTwilioWebhook({
      url: fullUrl,
      signature,
      params,
      skipInDevelopment: true,
    });

    if (!verification.isValid) {
      console.warn("[Telephony Status] Signature verification failed:", verification.reason);
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const callSid = params.CallSid;
    const twilioStatus = params.CallStatus || "completed";
    const callDuration = parseInt(params.CallDuration || params.Duration || "0", 10);
    const recordingUrl = params.RecordingUrl || null;

    if (!callSid) {
      return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
    }

    const appStatus = mapTwilioCallStatus(twilioStatus);

    // 2. Find matching call session by recording_url tag or direct query
    let { data: session } = await supabase
      .from("call_sessions")
      .select("id, organization_id, status, lead_id, customer_name, customer_phone")
      .eq("recording_url", `twilio:${callSid}`)
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: fallbackSession } = await supabase
        .from("call_sessions")
        .select("id, organization_id, status, lead_id, customer_name, customer_phone")
        .ilike("recording_url", `%${callSid}%`)
        .limit(1)
        .maybeSingle();
      session = fallbackSession;
    }

    if (session) {
      // Idempotency: if session is already finalized with this terminal status, skip duplicate side-effects
      const isTerminal = ["COMPLETED", "FAILED", "BUSY", "NO_ANSWER", "CANCELED"].includes(appStatus);
      if (session.status === appStatus && isTerminal) {
        return NextResponse.json({
          success: true,
          callSid,
          mappedStatus: appStatus,
          idempotent: true,
          message: `Session ${session.id} is already in ${appStatus}, duplicate processing skipped.`,
        });
      }

      const updatePayload: Record<string, unknown> = {
        status: appStatus,
        updated_at: new Date().toISOString(),
      };

      if (callDuration > 0) {
        updatePayload.duration_seconds = callDuration;
      }
      if (recordingUrl) {
        updatePayload.recording_url = recordingUrl;
      }
      if (appStatus === "COMPLETED" || appStatus === "FAILED" || appStatus === "BUSY" || appStatus === "NO_ANSWER") {
        updatePayload.end_time = new Date().toISOString();
      }

      await supabase.from("call_sessions").update(updatePayload as never).eq("id", session.id);

      // Log call event
      await supabase.from("call_events").insert({
        call_session_id: session.id,
        event_type: `CALL_STATUS_${appStatus}`,
        payload: params,
      } as never);

      // 3. Bidirectional Reverse Sync to LeadNexus
      if (session.lead_id) {
        let mappedEventType:
          | "CALL_RINGING"
          | "CALL_ANSWERED"
          | "CALL_COMPLETED"
          | "CALL_FAILED"
          | "CALL_NO_ANSWER"
          | "CALL_BUSY"
          | null = null;

        if (appStatus === "RINGING") mappedEventType = "CALL_RINGING";
        else if (appStatus === "IN_PROGRESS") mappedEventType = "CALL_ANSWERED";
        else if (appStatus === "COMPLETED") mappedEventType = "CALL_COMPLETED";
        else if (appStatus === "FAILED") mappedEventType = "CALL_FAILED";
        else if (appStatus === "NO_ANSWER") mappedEventType = "CALL_NO_ANSWER";
        else if (appStatus === "BUSY") mappedEventType = "CALL_BUSY";

        if (mappedEventType) {
          try {
            await dispatchCallEventToLeadNexus({
              event: mappedEventType,
              organizationId: session.organization_id,
              leadId: session.lead_id,
              customerName: session.customer_name || "Customer",
              customerPhone: session.customer_phone || "",
              callSessionId: session.id,
              twilioCallSid: callSid,
              status: appStatus,
              durationSeconds: callDuration,
              recordingUrl,
            });

            // Update lead status when answered
            if (appStatus === "IN_PROGRESS") {
              const { data: leadRow } = await supabase
                .from("leads")
                .select("status")
                .eq("id", session.lead_id)
                .maybeSingle();
              if (leadRow?.status === "NEW") {
                await supabase
                  .from("leads")
                  .update({
                    status: "CONTACTED",
                    last_activity_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as never)
                  .eq("id", session.lead_id);
              }
            } else if (appStatus === "COMPLETED" || appStatus === "FAILED" || appStatus === "NO_ANSWER" || appStatus === "BUSY") {
              await supabase
                .from("leads")
                .update({
                  last_activity_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as never)
                .eq("id", session.lead_id);

              // 4. Automatic Post-Call Intelligence Analysis upon Completion
              if (appStatus === "COMPLETED") {
                try {
                  const { data: dbSegments } = await supabase
                    .from("transcript_segments")
                    .select("speaker, text, start_offset_ms, end_offset_ms")
                    .eq("call_session_id", session.id)
                    .order("created_at", { ascending: true });

                  if (dbSegments && dbSegments.length > 0) {
                    const outcome = analyzeCallTranscript({
                      callSessionId: session.id,
                      transcripts: dbSegments.map((s) => ({
                        speaker: s.speaker,
                        text: s.text,
                        startOffsetMs: s.start_offset_ms ?? undefined,
                        endOffsetMs: s.end_offset_ms ?? undefined,
                      })),
                      customerName: session.customer_name || "Customer",
                      customerPhone: session.customer_phone || undefined,
                      businessName: "Aadhira Solar Tech",
                      customerInterest: "Rooftop Solar",
                    });

                    await supabase.from("call_outcomes").upsert(
                      {
                        call_session_id: session.id,
                        disposition: outcome.disposition,
                        sentiment: outcome.sentiment,
                        confidence_score: outcome.confidenceScore,
                        summary: outcome.summary,
                        key_points: outcome.keyPoints as unknown as Json,
                        action_items: outcome.actionItems as unknown as Json,
                        qualification_decision: outcome.qualificationDecision,
                        follow_up_recommended: outcome.followUpRecommended,
                      },
                      { onConflict: "call_session_id" }
                    );

                    let nextStatus = "CONTACTED";
                    if (outcome.disposition === "DO_NOT_CALL") nextStatus = "DO_NOT_CALL";
                    else if (outcome.disposition === "INTERESTED") nextStatus = "QUALIFIED";
                    else if (outcome.disposition === "CALLBACK_REQUESTED") nextStatus = "FOLLOW_UP";

                    await supabase.from("leads").update({
                      status: nextStatus,
                      summary: outcome.summary,
                      last_activity_at: new Date().toISOString(),
                    } as never).eq("id", session.lead_id);

                    if (outcome.followUpRecommended) {
                      await supabase.from("follow_up_tasks").insert({
                        organization_id: session.organization_id,
                        lead_id: session.lead_id,
                        call_session_id: session.id,
                        title: `Follow-up: ${session.customer_name || "Customer"} (${outcome.disposition})`,
                        priority: outcome.sentiment === "POSITIVE" ? "HIGH" : "MEDIUM",
                        status: "PENDING",
                        assigned_to_role: "SALES_REPRESENTATIVE",
                      } as never);
                    }
                  }
                } catch (analysisErr) {
                  console.warn("[Telephony Status] Auto post-call analysis warning:", analysisErr);
                }
              }
            }
          } catch (syncErr) {
            console.warn("[Telephony Status] Reverse sync failed:", syncErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true, callSid, mappedStatus: appStatus });
  } catch (err: unknown) {
    console.error("[Telephony Status] Error processing callback:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
