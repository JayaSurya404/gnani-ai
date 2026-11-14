import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPhoneVariants, normalizePhone } from "@/lib/phone";
import { synthesizeGnaniAudio } from "@/lib/telephony/gnani-tts";
import { storeSessionAudio } from "@/lib/telephony/audio-cache";
import { dispatchCallEventToLeadNexus } from "@/lib/integrations/reverse-sync-dispatcher";
import { checkAndReconcileActiveCalls } from "@/lib/telephony/active-call-reconciliation";
import { resolveCanonicalVoice, normalizeLanguageCode } from "@/lib/voice-profiles";
import { getSessionContext } from "@/lib/permissions";
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
    const fromNumber = process.env.TWILIO_VOICE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "Twilio telephony is not configured on this server. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VOICE_NUMBER are required.",
          missingConfig: true,
        },
        { status: 503 }
      );
    }

    const session = await getSessionContext();
    if (session.isEvaluator) {
      return NextResponse.json(
        {
          success: false,
          error: "Live carrier calling is restricted to authorized business owners.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      organizationId: reqOrgId,
      customerPhone,
      customerName,
      leadId,
      agentId,
      voice,
      language = "ta-IN",
      skipWindowCheck = false,
      mode = "STREAM", // "STREAM" | "TURN_BASED"
    } = body;
    const sayLang = normalizeLanguageCode(language);
    const resolvedVoiceConfig = resolveCanonicalVoice(voice, sayLang);

    if (!customerPhone || typeof customerPhone !== "string") {
      return NextResponse.json(
        { success: false, error: "customerPhone in E.164 format is required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(customerPhone);
    const variants = getPhoneVariants(normalizedPhone);

    // Get organization
    let organizationId = reqOrgId;
    if (!organizationId) {
      const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
      organizationId = org?.id;
    }

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "No organization found" }, { status: 400 });
    }

    // 1. Strict Do-Not-Call (DNC) Suppression & Sample Contact Guard
    if (leadId) {
      const { data: targetLead } = await supabase
        .from("leads")
        .select("id, status, do_not_call, source, notes, summary")
        .eq("id", leadId)
        .maybeSingle();

      if (targetLead?.do_not_call === true || targetLead?.status === "DO_NOT_CALL") {
        return NextResponse.json(
          {
            success: false,
            error: `Outbound call blocked: lead is registered on the Do-Not-Call list.`,
            isDncSuppressed: true,
          },
          { status: 403 }
        );
      }

      const isSampleLead = targetLead?.source === "SAMPLE_LEAD" ||
        targetLead?.notes?.includes("[TEST_CONTACT]") ||
        targetLead?.summary?.includes("[TEST_CONTACT]");

      if (isSampleLead && normalizedPhone !== "+916382868845") {
        return NextResponse.json(
          {
            success: false,
            error: "Security Policy Violation: Sample/test contact calls may only be placed to verified destination +916382868845.",
          },
          { status: 403 }
        );
      }
    }

    const { data: dncLeads, error: dncError } = await supabase
      .from("leads")
      .select("id, status, do_not_call")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("phone", variants);

    if (dncError) {
      return NextResponse.json(
        { success: false, error: "Failed to verify DNC compliance. Outbound call blocked." },
        { status: 503 }
      );
    }

    const isDnc = dncLeads && dncLeads.some((l) => l.do_not_call === true || l.status === "DO_NOT_CALL");
    if (isDnc) {
      return NextResponse.json(
        {
          success: false,
          error: `Outbound call blocked: recipient ${normalizedPhone} is registered on the Do-Not-Call list.`,
          isDncSuppressed: true,
        },
        { status: 403 }
      );
    }

    // 2. Regulatory Calling Window Check (9 AM - 9 PM)
    if (!skipWindowCheck) {
      const currentHour = new Date().getHours();
      // Allow calls only between 9 AM (9) and 9 PM (21)
      if (currentHour < 9 || currentHour >= 21) {
        return NextResponse.json(
          {
            success: false,
            error: "Outbound call blocked by regulatory calling window (TCCCPR: only permitted between 9:00 AM and 9:00 PM).",
            windowRestricted: true,
          },
          { status: 403 }
        );
      }
    }

    // 3. Concurrency / In-Flight Call Check with Carrier-Level Reconciliation
    const client = twilio(accountSid, authToken);
    const activeCheck = await checkAndReconcileActiveCalls(
      supabase,
      client,
      organizationId,
      variants
    );

    if (activeCheck.hasGenuinelyActiveCall) {
      return NextResponse.json(
        {
          success: false,
          error: "An active call is already in progress with this recipient.",
          activeCallId: activeCheck.blockingCallSessionId,
          twilioCallSid: activeCheck.twilioCallSid,
          reason: activeCheck.reason,
        },
        { status: 409 }
      );
    }

    // 4. Generate unique canonical database session UUID
    const sessionDbId = crypto.randomUUID();
    const sessionId = sessionDbId;

    // Persist call session in database immediately so all webhooks and segments link to it
    const { error: sessionInsertErr } = await supabase
      .from("call_sessions")
      .insert({
        id: sessionDbId,
        organization_id: organizationId,
        lead_id: leadId || null,
        agent_id: agentId || null,
        direction: "OUTBOUND",
        channel: "TELEPHONY",
        customer_phone: normalizedPhone,
        customer_name: customerName || null,
        status: "INITIATING",
        start_time: new Date().toISOString(),
      });

    if (sessionInsertErr) {
      console.error("[Telephony Outbound] Failed to insert initial call_sessions:", sessionInsertErr);
    }

    // 5. Construct Webhook Base URL
    const appUrl =
      process.env.TWILIO_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://voicenexus.app";

    // 6. Build TwiML Webhook URL for Twilio to fetch instructions
    // Note: Twilio Free Trial accounts strictly disallow long query strings, raw inline 'twiml',
    // call recording parameters, and granular lifecycle event arrays on calls.create.
    // We pass only concise query parameters to keep the URL compact and compliant.
    // 6. Pre-synthesize opening greeting via Gnani Timbre TTS so outbound-twiml responds in < 15ms
    let businessName = "Kaveri Solar";
    let custName = (customerName || "").replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();
    let interest = "";

    try {
      let resolvedBusinessId: string | null = null;
      if (leadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("name, primary_interest, business_id")
          .eq("id", leadId)
          .maybeSingle();

        if (lead) {
          if (lead.name) custName = lead.name.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();
          if (lead.primary_interest) interest = lead.primary_interest;
          if (lead.business_id) resolvedBusinessId = lead.business_id;
        }
      }
      custName = custName.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();

      if (resolvedBusinessId) {
        const { data: bData } = await supabase
          .from("businesses")
          .select("name")
          .eq("id", resolvedBusinessId)
          .maybeSingle();
        if (bData?.name) businessName = bData.name;
      } else if (organizationId) {
        const { data: bData } = await supabase
          .from("businesses")
          .select("name")
          .eq("organization_id", organizationId)
          .limit(1)
          .maybeSingle();
        if (bData?.name) businessName = bData.name;
      }
    } catch (err) {
      console.warn("[Telephony Outbound] Could not fetch business context for pre-synthesis:", err);
    }

    const persona = resolvedVoiceConfig.personaName;
    let greetingText = "";

    if (sayLang.startsWith("ta")) {
      if (custName && interest) {
        greetingText = `வணக்கம் ${custName}! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். நீங்கள் ${interest} குறித்து வினவியிருந்தீர்கள். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
      } else if (custName) {
        greetingText = `வணக்கம் ${custName}! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
      } else {
        greetingText = `வணக்கம்! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
      }
    } else if (sayLang.startsWith("hi")) {
      if (custName && interest) {
        greetingText = `नमस्ते ${custName}! मैं ${businessName} से ${persona} बोल रही हूँ। आपने ${interest} के बारे में जानकारी माँगी थी। क्या हम 2 मिनट बात कर सकते हैं?`;
      } else if (custName) {
        greetingText = `नमस्ते ${custName}! मैं ${businessName} से ${persona} बोल रही हूँ। क्या हम 2 मिनट बात कर सकते हैं?`;
      } else {
        greetingText = `नमस्ते! मैं ${businessName} से ${persona} बोल रही हूँ। आपकी सोलर आवश्यकताओं के लिए क्या हम बात कर सकते हैं?`;
      }
    } else if (sayLang.startsWith("te")) {
      if (custName && interest) {
        greetingText = `నమస్కారం ${custName}! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. మీరు ${interest} గురించి విచారించారు. మీ అవసరాలను తెలుసుకోవడానికి 2 నిమిషాలు మాట్లాడవచ్చా?`;
      } else if (custName) {
        greetingText = `నమస్కారం ${custName}! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. 2 నిమిషాలు మాట్లాడవచ్చా?`;
      } else {
        greetingText = `నమస్కారం! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. మీ సోలార్ అవసరాల గురించి మాట్లాడవచ్చా?`;
      }
    } else if (sayLang.startsWith("kn")) {
      if (custName && interest) {
        greetingText = `ನಮಸ್ಕಾರ ${custName}! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನೀವು ${interest} ಬಗ್ಗೆ ವಿಚಾರಿಸಿದ್ದೀರಿ. ನಿಮ್ಮ ಅಗತ್ಯಗಳನ್ನು ತಿಳಿಯಲು 2 ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?`;
      } else if (custName) {
        greetingText = `ನಮಸ್ಕಾರ ${custName}! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. 2 ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?`;
      } else {
        greetingText = `ನಮಸ್ಕಾರ! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಸೌರ ವಿದ್ಯುತ್ ಅಗತ್ಯಗಳ ಬಗ್ಗೆ ಮಾತನಾಡಬಹುದೇ?`;
      }
    } else if (sayLang.startsWith("ml")) {
      if (custName && interest) {
        greetingText = `നമസ്കാരം ${custName}! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. നിങ്ങൾ ${interest} സംബന്ധിച്ച് അന്വേഷിച്ചിരുന്നു. നിങ്ങളുടെ ആവശ്യങ്ങൾ അറിയാൻ 2 മിനിറ്റ് സംസാരിക്കാമോ?`;
      } else if (custName) {
        greetingText = `നമസ്കാരം ${custName}! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. 2 മിനിറ്റ് സംസാരിക്കാമോ?`;
      } else {
        greetingText = `നമസ്കാരം! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. നിങ്ങളുടെ സോളാർ ആവശ്യങ്ങളെക്കുറിച്ച് സംസാരിക്കാമോ?`;
      }
    } else if (sayLang.includes("auto") || sayLang.includes("indic")) {
      if (custName && interest) {
        greetingText = `Hello and வணக்கம் ${custName}! This is ${persona} from ${businessName}. You enquired regarding ${interest}. Do you have two minutes to discuss?`;
      } else {
        greetingText = `Hello and வணக்கம்! This is ${persona} from ${businessName}. Do you have two minutes to discuss your solar energy requirements?`;
      }
    } else {
      if (custName && interest) {
        greetingText = `Hello ${custName}! This is ${persona} calling from ${businessName}. You recently enquired regarding ${interest}. Do you have two minutes to discuss your requirements?`;
      } else if (custName) {
        greetingText = `Hello ${custName}! This is ${persona} calling from ${businessName}. Do you have two minutes to discuss your requirements?`;
      } else {
        greetingText = `Hello! This is ${persona} from ${businessName}. May I speak with you for two minutes regarding your enquiry?`;
      }
    }

    try {
      const audioId = await synthesizeGnaniAudio({
        text: greetingText,
        language: sayLang,
        model: resolvedVoiceConfig.model,
        voice: resolvedVoiceConfig.canonicalVoice,
        timeoutMs: 12000,
      });
      if (audioId) {
        storeSessionAudio(sessionId, audioId, greetingText, sayLang);
      }
    } catch (ttsErr) {
      console.warn("[Telephony Outbound] Pre-synthesis failed, fallback will be used:", ttsErr);
    }

    // Pre-populate in-memory session tenant cache so Turn 1 needs zero DB queries
    try {
      const cacheMap = (globalThis as unknown as { __vn_session_context_cache?: Map<string, unknown> }).__vn_session_context_cache;
      if (cacheMap) {
        cacheMap.set(sessionId, {
          session: {
            id: sessionId,
            organization_id: organizationId,
            lead_id: leadId || null,
            customer_phone: normalizedPhone,
            customer_name: custName || null,
          },
          orgId: organizationId,
          phone: normalizedPhone,
          customerName: custName || "Customer",
          personaName: persona,
          selectedVoice: persona,
          canonicalVoice: resolvedVoiceConfig.canonicalVoice,
          selectedModel: resolvedVoiceConfig.model,
          selectedLanguage: sayLang,
          greetingSent: true,
          tenantContext: {
            businessName,
            businessCity: null,
            businessState: null,
            businessDescription: null,
            products: [],
          },
          leadContext: {
            primaryInterest: interest || undefined,
          },
          businessRecord: { id: "", name: businessName, city: null, state: null, description: null, phone: null },
          timestamp: Date.now(),
        });
      }
    } catch {
      // Safe ignore
    }

    const queryParams = new URLSearchParams({
      sessionId,
      mode,
      language: sayLang,
      voice: persona,
      model: resolvedVoiceConfig.model,
    });
    if (leadId) queryParams.set("leadId", leadId);

    const twimlWebhookUrl = `${appUrl}/api/telephony/outbound-twiml?${queryParams.toString()}`;

    // 7. Initiate Call via Twilio SDK with Adaptive Trial/Full Parameter Handling
    const statusCallbackUrl = `${appUrl}/api/telephony/status`;
    let twilioCall;
    try {
      // First attempt: Include statusCallback for real-time carrier status delivery (supported on paid/full accounts)
      const fullCallOptions = {
        to: normalizedPhone,
        from: fromNumber,
        url: twimlWebhookUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      };

      twilioCall = await client.calls.create(fullCallOptions);
    } catch (firstErr: unknown) {
      const errObj = firstErr as { code?: number; status?: number; message?: string };
      const isDisallowedParam =
        errObj.status === 422 ||
        errObj.code === 21215 ||
        (typeof errObj.message === "string" &&
          (errObj.message.toLowerCase().includes("trial") ||
           errObj.message.toLowerCase().includes("disallowed parameter")));

      if (isDisallowedParam) {
        console.warn("[Telephony Outbound] Trial parameter restriction encountered. Retrying with trial-compliant { to, from, url }...");
        try {
          // Fallback attempt: Twilio Free Trial compliant concise parameters
          const trialCallOptions = {
            to: normalizedPhone,
            from: fromNumber,
            url: twimlWebhookUrl,
          };
          twilioCall = await client.calls.create(trialCallOptions);
        } catch (trialErr: unknown) {
          console.error("[Telephony Outbound] Trial calls.create failed:", trialErr);
          await supabase
            .from("call_sessions")
            .update({ status: "FAILED", updated_at: new Date().toISOString() })
            .eq("id", sessionDbId);

          const err = trialErr as { code?: number; message?: string; moreInfo?: string };
          const isTrialRestriction =
            err.code === 21215 ||
            err.code === 21216 ||
            err.code === 21606 ||
            err.code === 21608 ||
            err.code === 573002 ||
            err.code === 14111 ||
            (typeof err.message === "string" &&
              (err.message.toLowerCase().includes("trial") ||
               err.message.toLowerCase().includes("unverified")));

          const userErrorMessage = isTrialRestriction
            ? `Twilio Free Trial restriction: Outbound calls can only be placed to verified numbers. Please add ${normalizedPhone} to Verified Caller IDs in your Twilio Console (Phone Numbers > Manage > Verified Caller IDs) and complete OTP verification.`
            : err.message || "Twilio call creation failed";

          return NextResponse.json(
            {
              success: false,
              error: userErrorMessage,
              errorCode: err.code,
              isTrialRestriction,
              moreInfo: err.moreInfo || "https://www.twilio.com/docs/errors",
            },
            { status: isTrialRestriction ? 403 : 502 }
          );
        }
      } else {
        console.error("[Telephony Outbound] Twilio SDK calls.create failed:", firstErr);
        await supabase
          .from("call_sessions")
          .update({ status: "FAILED", updated_at: new Date().toISOString() })
          .eq("id", sessionDbId);

        const err = firstErr as { code?: number; message?: string; moreInfo?: string };
        const isTrialRestriction =
          err.code === 21215 ||
          err.code === 21216 ||
          err.code === 21606 ||
          err.code === 21608 ||
          err.code === 573002 ||
          err.code === 14111 ||
          (typeof err.message === "string" &&
            (err.message.toLowerCase().includes("trial") ||
             err.message.toLowerCase().includes("unverified")));

        const userErrorMessage = isTrialRestriction
          ? `Twilio Free Trial restriction: Outbound calls can only be placed to verified numbers. Please add ${normalizedPhone} to Verified Caller IDs in your Twilio Console (Phone Numbers > Manage > Verified Caller IDs) and complete OTP verification.`
          : err.message || "Twilio call creation failed";

        return NextResponse.json(
          {
            success: false,
            error: userErrorMessage,
            errorCode: err.code,
            isTrialRestriction,
            moreInfo: err.moreInfo || "https://www.twilio.com/docs/errors",
          },
          { status: isTrialRestriction ? 403 : 502 }
        );
      }
    }

    // 8. Update call session in database with Twilio SID
    await supabase
      .from("call_sessions")
      .update({
        recording_url: `twilio:${twilioCall.sid}`,
        status: "INITIATING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionDbId);

    // 9. Record Call Event
    await supabase.from("call_events").insert({
      call_session_id: sessionDbId,
      event_type: "OUTBOUND_CALL_INITIATED",
      payload: {
        to: normalizedPhone,
        from: fromNumber,
        twilioCallSid: twilioCall.sid,
        twilioStatus: twilioCall.status,
      },
    } as never);

    // 10. Bidirectional Customer Journey Dispatch
    if (leadId) {
      try {
        await dispatchCallEventToLeadNexus({
          event: "CALL_INITIATED",
          organizationId,
          leadId,
          customerName: customerName || "Customer",
          customerPhone: normalizedPhone,
          callSessionId: sessionDbId,
          twilioCallSid: twilioCall.sid,
          status: "INITIATING",
          language,
          voice,
        });
      } catch (dispatchErr) {
        console.warn("[Telephony Outbound] Failed to dispatch reverse sync event:", dispatchErr);
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: sessionDbId,
      twilioCallSid: twilioCall.sid,
      status: twilioCall.status,
      direction: "OUTBOUND",
      to: normalizedPhone,
      from: fromNumber,
    });
  } catch (err: unknown) {
    console.error("[Telephony Outbound] Exception:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
