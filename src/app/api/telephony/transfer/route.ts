import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import twilio from "twilio";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: "Twilio credentials unconfigured" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { callSessionId, twilioCallSid, supervisorPhone, reason = "Caller requested human assistance" } = body;

    if (!supervisorPhone) {
      return NextResponse.json(
        { success: false, error: "supervisorPhone is required for live transfer" },
        { status: 400 }
      );
    }

    // Lookup session if only callSessionId was passed
    let targetCallSid = twilioCallSid;
    let sessionId = callSessionId;
    let organizationId = "";

    if (!targetCallSid && sessionId) {
      const { data: session } = await supabase
        .from("call_sessions")
        .select("twilio_call_sid, organization_id")
        .eq("id", sessionId)
        .single();
      targetCallSid = session?.twilio_call_sid;
      organizationId = session?.organization_id || "";
    } else if (targetCallSid) {
      const { data: session } = await supabase
        .from("call_sessions")
        .select("id, organization_id")
        .eq("twilio_call_sid", targetCallSid)
        .single();
      sessionId = session?.id;
      organizationId = session?.organization_id || "";
    }

    if (!targetCallSid) {
      return NextResponse.json(
        { success: false, error: "Could not find active Twilio CallSid for transfer" },
        { status: 404 }
      );
    }

    // Stage 1 & 2: Record Transfer Requested & Task Created
    if (sessionId) {
      await supabase
        .from("call_sessions")
        .update({
          transfer_status: "INITIATED",
          transfer_target: supervisorPhone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      await supabase.from("telephony_events").insert({
        organization_id: organizationId,
        call_session_id: sessionId,
        twilio_call_sid: targetCallSid,
        event_type: "TRANSFER_INITIATED",
        event_payload: { target: supervisorPhone, reason },
      });
    }

    const appUrl =
      process.env.TWILIO_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://voicenexus.app";
    const transferCallbackUrl = `${appUrl}/api/telephony/transfer-complete?sessionId=${sessionId || ""}`;

    // TwiML redirecting caller to human supervisor
    const transferTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we connect you to our supervisory representative.</Say>
  <Dial action="${transferCallbackUrl}" callerId="${process.env.TWILIO_VOICE_NUMBER || ""}">
    <Number>${supervisorPhone}</Number>
  </Dial>
</Response>`;

    // Stage 5: Update in-progress live call via Twilio REST API
    const client = twilio(accountSid, authToken);
    await client.calls(targetCallSid).update({
      twiml: transferTwiml,
    });

    return NextResponse.json({
      success: true,
      stage: "INITIATED",
      callSid: targetCallSid,
      supervisorPhone,
      message: "Live call redirected to supervisor.",
    });
  } catch (err: unknown) {
    console.error("[Telephony Transfer] Exception:", err);
    const message = err instanceof Error ? err.message : "Failed to execute transfer";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
