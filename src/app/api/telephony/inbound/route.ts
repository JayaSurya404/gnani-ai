import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/telephony/webhook-auth";
import { normalizePhone, getPhoneVariants } from "@/lib/phone";
import { synthesizeGnaniAudio } from "@/lib/telephony/gnani-tts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>System unavailable.</Say></Response>`,
        { status: 503, headers: { "Content-Type": "text/xml" } }
      );
    }

    const signature = req.headers.get("x-twilio-signature");
    const fullUrl = req.url;

    // Parse form-urlencoded body from Twilio
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
      console.warn("[Telephony Inbound] Signature verification failed:", verification.reason);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected" /></Response>`,
        { status: 403, headers: { "Content-Type": "text/xml" } }
      );
    }

    const fromNumber = params.From || "";
    const toNumber = params.To || "";
    const callSid = params.CallSid || "";

    const normalizedCaller = normalizePhone(fromNumber);
    const variants = getPhoneVariants(normalizedCaller);

    // 2. Identify Organization from To number
    const { data: phoneRow } = await supabase
      .from("telephony_phone_numbers")
      .select("organization_id, assigned_agent_id")
      .eq("phone_number", toNumber)
      .limit(1)
      .single();

    let organizationId = phoneRow?.organization_id;
    const agentId = phoneRow?.assigned_agent_id;

    if (!organizationId) {
      const { data: defaultOrg } = await supabase.from("organizations").select("id").limit(1).single();
      organizationId = defaultOrg?.id;
    }

    if (!organizationId) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Unassigned telephone number.</Say><Hangup/></Response>`,
        { status: 404, headers: { "Content-Type": "text/xml" } }
      );
    }

    // 3. Lookup existing Lead
    const { data: leadRow } = await supabase
      .from("leads")
      .select("id, name, status, do_not_call")
      .eq("organization_id", organizationId)
      .in("phone", variants)
      .limit(1)
      .single();

    const leadId = leadRow?.id || null;
    const customerName = leadRow?.name || null;

    // 4. Create Call Session
    const sessionId = "call_in_" + Math.random().toString(36).slice(2, 10);
    await supabase.from("call_sessions").insert({
      id: sessionId,
      organization_id: organizationId,
      lead_id: leadId,
      agent_id: agentId,
      direction: "INBOUND",
      channel: "TELEPHONY",
      customer_phone: normalizedCaller,
      customer_name: customerName,
      status: "IN_PROGRESS",
      start_time: new Date().toISOString(),
      twilio_call_sid: callSid,
      telephony_provider: "TWILIO",
      caller_number: fromNumber,
      callee_number: toNumber,
    });

    // 5. Log Telephony Event
    await supabase.from("telephony_events").insert({
      organization_id: organizationId,
      call_session_id: sessionId,
      twilio_call_sid: callSid,
      event_type: "INBOUND_CALL_CONNECTED",
      event_payload: { from: fromNumber, to: toNumber, callSid },
    });

    const appUrl =
      process.env.TWILIO_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://voicenexus.app";

    const urlObj = new URL(req.url);
    const mode = urlObj.searchParams.get("mode") || process.env.INBOUND_CALL_MODE || "TURN_BASED";
    const language = urlObj.searchParams.get("language") || "ta-IN";
    const sayLang = language.startsWith("ta") ? "ta-IN" : "en-IN";

    // 6. Trial Turn-Based Voice (<Gather> + Gnani Timbre <Play>) OR Stream (<Stream>)
    if (mode === "TURN_BASED") {
      const initialGreeting = language.startsWith("ta")
        ? "வணக்கம்! வாய்ஸ்நெக்ஸஸ் ஏஐ வணிக உதவிக்கு அழைத்ததற்கு நன்றி. இன்று உங்களுக்கு எப்படி உதவ முடியும்?"
        : "Hello! This is the VoiceNexus AI assistant. Thank you for calling our business line. How can I help you today?";
      const turnUrl = `${appUrl}/api/telephony/turn?sessionId=${sessionId}&language=${language}`;

      // Synthesize opening greeting via Gnani Timbre TTS
      const audioId = await synthesizeGnaniAudio({
        text: initialGreeting,
        language: sayLang,
        voice: language.startsWith("ta") ? "Asmita" : "Kaveri",
      });

      const audioPlaybackTag = audioId
        ? `<Play>${appUrl}/api/telephony/audio/${audioId}</Play>`
        : `<Say language="${sayLang}">${initialGreeting}</Say>`;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${audioPlaybackTag}
  <Gather input="speech" action="${turnUrl}" method="POST" speechTimeout="auto" language="${sayLang}">
  </Gather>
  <Say language="${sayLang}">We did not hear any speech. Thank you for calling VoiceNexus. Goodbye.</Say>
  <Hangup/>
</Response>`;

      return new Response(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Default: Connect to persistent voice gateway WebSocket stream (Paid/Upgraded accounts)
    const voiceGatewayWsUrl =
      process.env.VOICE_GATEWAY_WS_URL ||
      process.env.NEXT_PUBLIC_VOICE_GATEWAY_WS_URL ||
      "wss://gateway.voicenexus.app/ws/twilio";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${voiceGatewayWsUrl}">
      <Parameter name="sessionId" value="${sessionId}" />
      <Parameter name="organizationId" value="${organizationId}" />
      <Parameter name="leadId" value="${leadId || ""}" />
      <Parameter name="agentId" value="${agentId || ""}" />
      <Parameter name="direction" value="INBOUND" />
      <Parameter name="customerPhone" value="${normalizedCaller}" />
      <Parameter name="ctx_customerName" value="${encodeURIComponent(customerName || "")}" />
    </Stream>
  </Connect>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err: unknown) {
    console.error("[Telephony Inbound] Exception:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An internal error occurred.</Say><Hangup/></Response>`,
      { status: 500, headers: { "Content-Type": "text/xml" } }
    );
  }
}
