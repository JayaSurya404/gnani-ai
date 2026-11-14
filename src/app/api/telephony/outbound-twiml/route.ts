import twilio from "twilio";
import { synthesizeGnaniAudio, getTwilioSayAttributes } from "@/lib/telephony/gnani-tts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAudio, getPublicAudioUrl } from "@/lib/telephony/audio-cache";
import { resolveCanonicalVoice, normalizeLanguageCode } from "@/lib/voice-profiles";

export const dynamic = "force-dynamic";

async function handleTwimlRequest(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") || "call_" + Math.random().toString(36).slice(2, 10);
    const organizationId = url.searchParams.get("organizationId") || "";
    const customerPhone = url.searchParams.get("customerPhone") || "";
    const mode = url.searchParams.get("mode") || "TURN_BASED";
    const language = url.searchParams.get("language") || "ta-IN";
    const leadId = url.searchParams.get("leadId") || "";
    const agentId = url.searchParams.get("agentId") || "";
    const agentName = url.searchParams.get("agentName") || "VoiceNexus AI";
    const systemPrompt = url.searchParams.get("systemPrompt") || "";
    const voice = url.searchParams.get("voice") || "Asmita";

    const appUrl =
      process.env.TWILIO_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://voicenexus.app";

    if (mode === "TURN_BASED") {
      const sayLang = normalizeLanguageCode(language);
      const resolvedVoiceConfig = resolveCanonicalVoice(voice, sayLang);
      const persona = resolvedVoiceConfig.personaName;
      const supabase = createAdminClient();

      let businessName = "VoiceNexus AI";
      let customerName = "";
      let interest = "";
      let resolvedOrgId = organizationId;

      // Dynamic Context Discovery from Supabase
      if (supabase) {
        try {
          let resolvedBusinessId: string | null = null;

          // Check if session has lead or org
          if (sessionId) {
            const { data: session } = await supabase
              .from("call_sessions")
              .select("id, organization_id, lead_id, customer_name")
              .eq("id", sessionId)
              .maybeSingle();

            if (session) {
              if (session.organization_id) resolvedOrgId = session.organization_id;
              if (session.customer_name) customerName = session.customer_name.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();
              if (!leadId && session.lead_id) {
                // Use session lead
                const { data: lead } = await supabase
                  .from("leads")
                  .select("name, business_id, primary_interest")
                  .eq("id", session.lead_id)
                  .maybeSingle();

                if (lead) {
                  if (lead.name) customerName = lead.name.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();
                  if (lead.primary_interest) interest = lead.primary_interest;
                  if (lead.business_id) resolvedBusinessId = lead.business_id;
                }
              }
            }
          }

          if (leadId && !interest) {
            const { data: lead } = await supabase
              .from("leads")
              .select("name, business_id, primary_interest")
              .eq("id", leadId)
              .maybeSingle();

            if (lead) {
              if (lead.name) customerName = lead.name.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();
              if (lead.primary_interest) interest = lead.primary_interest;
              if (lead.business_id) resolvedBusinessId = lead.business_id;
            }
          }

          customerName = customerName.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/\[.*?\]\s*/g, "").trim();

          if (resolvedBusinessId) {
            const { data: bData } = await supabase
              .from("businesses")
              .select("name")
              .eq("id", resolvedBusinessId)
              .maybeSingle();
            if (bData?.name) businessName = bData.name;
          } else if (resolvedOrgId) {
            const { data: bData } = await supabase
              .from("businesses")
              .select("name")
              .eq("organization_id", resolvedOrgId)
              .limit(1)
              .maybeSingle();
            if (bData?.name) businessName = bData.name;
          }
        } catch (dbErr) {
          console.warn("[Outbound TwiML] Dynamic tenant lookup bypassed:", dbErr);
        }

        // Ensure in-memory tenant context cache is populated for Turn 1
        try {
          const cacheMap = (globalThis as unknown as { __vn_session_context_cache?: Map<string, unknown> }).__vn_session_context_cache;
          if (cacheMap && !cacheMap.has(sessionId)) {
            cacheMap.set(sessionId, {
              session: {
                id: sessionId,
                organization_id: resolvedOrgId || null,
                lead_id: leadId || null,
                customer_phone: customerPhone || null,
                customer_name: customerName || null,
              },
              orgId: resolvedOrgId || null,
              phone: customerPhone || "",
              customerName: customerName || "Customer",
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
      }

      // Build context-aware initial greeting in selected language
      let initialGreeting = "";
      if (sayLang.startsWith("ta")) {
        if (customerName && interest) {
          initialGreeting = `வணக்கம் ${customerName}! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். நீங்கள் ${interest} குறித்து வினவியிருந்தீர்கள். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
        } else if (customerName) {
          initialGreeting = `வணக்கம் ${customerName}! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
        } else {
          initialGreeting = `வணக்கம்! நான் ${businessName} நிறுவனத்திலிருந்து ${persona} பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`;
        }
      } else if (sayLang.startsWith("hi")) {
        if (customerName && interest) {
          initialGreeting = `नमस्ते ${customerName}! मैं ${businessName} से ${persona} बोल रही हूँ। आपने ${interest} के बारे में जानकारी माँगी थी। क्या हम 2 मिनट बात कर सकते हैं?`;
        } else if (customerName) {
          initialGreeting = `नमस्ते ${customerName}! मैं ${businessName} से ${persona} बोल रही हूँ। क्या हम 2 मिनट बात कर सकते हैं?`;
        } else {
          initialGreeting = `नमस्ते! मैं ${businessName} से ${persona} बोल रही हूँ। आपकी सोलर आवश्यकताओं के लिए क्या हम बात कर सकते हैं?`;
        }
      } else if (sayLang.startsWith("te")) {
        if (customerName && interest) {
          initialGreeting = `నమస్కారం ${customerName}! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. మీరు ${interest} గురించి విచారించారు. మీ అవసరాలను తెలుసుకోవడానికి 2 నిమిషాలు మాట్లాడవచ్చா?`;
        } else if (customerName) {
          initialGreeting = `నమస్కారం ${customerName}! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. 2 నిమిషాలు మాట్లాడవచ్చா?`;
        } else {
          initialGreeting = `నమస్కారం! నేను ${businessName} నుండి ${persona} మాట్లాడుతున్నాను. మీ సోలార్ అవసరాల గురించి మాట్లాడవచ్చா?`;
        }
      } else if (sayLang.startsWith("kn")) {
        if (customerName && interest) {
          initialGreeting = `ನಮಸ್ಕಾರ ${customerName}! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನೀವು ${interest} ಬಗ್ಗೆ ವಿಚಾರಿಸಿದ್ದೀರಿ. ನಿಮ್ಮ ಅಗತ್ಯಗಳನ್ನು ತಿಳಿಯಲು 2 ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?`;
        } else if (customerName) {
          initialGreeting = `ನಮಸ್ಕಾರ ${customerName}! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. 2 ನಿಮಿಷ ಮಾತನಾಡಬಹುದೇ?`;
        } else {
          initialGreeting = `ನಮಸ್ಕಾರ! ನಾನು ${businessName}ನಿಂದ ${persona} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಸೌರ ವಿದ್ಯುತ್ ಅಗತ್ಯಗಳ ಬಗ್ಗೆ ಮಾತನಾಡಬಹುದೇ?`;
        }
      } else if (sayLang.startsWith("ml")) {
        if (customerName && interest) {
          initialGreeting = `നമസ്കാരം ${customerName}! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. നിങ്ങൾ ${interest} സംബന്ധിച്ച് അന്വേഷിച്ചിരുന്നു. നിങ്ങളുടെ ആവശ്യങ്ങൾ അറിയാൻ 2 മിനിറ്റ് സംസാരിക്കാമോ?`;
        } else if (customerName) {
          initialGreeting = `നമസ്കാരം ${customerName}! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. 2 മിനിറ്റ് സംസാരിക്കാമോ?`;
        } else {
          initialGreeting = `നമസ്കാരം! ഞാൻ ${businessName}ൽ നിന്ന് ${persona} സംസാരിക്കുന്നു. നിങ്ങളുടെ സോളാർ ആവശ്യങ്ങളെക്കുറിച്ച് സംസാരിക്കാമോ?`;
        }
      } else if (sayLang.includes("auto") || sayLang.includes("indic")) {
        if (customerName && interest) {
          initialGreeting = `Hello and வணக்கம் ${customerName}! This is ${persona} from ${businessName}. You enquired regarding ${interest}. Do you have two minutes to discuss?`;
        } else {
          initialGreeting = `Hello and வணக்கம்! This is ${persona} from ${businessName}. Do you have two minutes to discuss your solar energy requirements?`;
        }
      } else {
        if (customerName && interest) {
          initialGreeting = `Hello ${customerName}! This is ${persona} calling from ${businessName}. You recently enquired regarding ${interest}. Do you have two minutes to discuss your requirements?`;
        } else if (customerName) {
          initialGreeting = `Hello ${customerName}! This is ${persona} calling from ${businessName}. Do you have two minutes to discuss your requirements?`;
        } else {
          initialGreeting = `Hello! This is ${persona} from ${businessName} powered by VoiceNexus AI. May I speak with you for two minutes regarding your enquiry?`;
        }
      }

      let audioId: string | null = null;

      // 1. Check if audio was pre-warmed for this session
      const prewarmed = getSessionAudio(sessionId);
      if (prewarmed) {
        audioId = prewarmed.audioId;
        initialGreeting = prewarmed.text;
      } else {
        // Fast attempt to synthesize if not prewarmed (bounded to 6000ms)
        try {
          audioId = await synthesizeGnaniAudio({
            text: initialGreeting,
            language: sayLang,
            model: resolvedVoiceConfig.model,
            voice: resolvedVoiceConfig.canonicalVoice,
            timeoutMs: 6000,
          });
        } catch (ttsErr) {
          console.warn("[Outbound TwiML] Fast TTS synthesis bypassed:", ttsErr);
        }
      }

      // 2. Persist opening greeting turn to transcript_segments
      if (sessionId && supabase) {
        try {
          await supabase.from("transcript_segments").insert({
            call_session_id: sessionId,
            speaker: "AGENT",
            language: sayLang,
            text: initialGreeting,
            confidence: 1.0,
            start_offset_ms: 0,
            end_offset_ms: 3000,
          });
        } catch (segErr) {
          console.warn("[Outbound TwiML] Failed to record initial transcript segment:", segErr);
        }
      }

      // 3. Generate Canonical TwiML: Sequential Play then Gather for complete greeting delivery and active listening
      const voiceResponse = new twilio.twiml.VoiceResponse();
      const turnUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(sessionId)}&callSessionId=${encodeURIComponent(sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(persona)}&model=${encodeURIComponent(resolvedVoiceConfig.model)}&turnSeq=1`;

      // Step A: Play greeting audio cleanly to completion
      if (audioId) {
        voiceResponse.play(getPublicAudioUrl(audioId, appUrl));
      } else {
        const sayAttrs = getTwilioSayAttributes(sayLang);
        voiceResponse.say(sayAttrs, initialGreeting);
      }

      // Step B: Gather caller speech for first turn immediately after greeting
      voiceResponse.gather({
        input: ["speech"],
        action: turnUrl,
        method: "POST",
        speechTimeout: "auto",
        timeout: 8,
        language: sayLang as never,
      });

      // Step C: If caller was silent during 8-second listening window, redirect to turn handler for polite retry
      voiceResponse.redirect({ method: "POST" }, `${turnUrl}&emptyTurns=1`);

      return new Response(voiceResponse.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // Default: Full Bidirectional Media Streams (<Stream>)
    const voiceGatewayWsUrl =
      process.env.VOICE_GATEWAY_WS_URL ||
      process.env.NEXT_PUBLIC_VOICE_GATEWAY_WS_URL ||
      "wss://gateway.voicenexus.app/ws/twilio";

    const voiceResponse = new twilio.twiml.VoiceResponse();
    const connect = voiceResponse.connect();
    const stream = connect.stream({ url: voiceGatewayWsUrl });
    stream.parameter({ name: "sessionId", value: sessionId });
    stream.parameter({ name: "organizationId", value: organizationId });
    stream.parameter({ name: "leadId", value: leadId });
    stream.parameter({ name: "agentId", value: agentId });
    stream.parameter({ name: "agentName", value: agentName });
    stream.parameter({ name: "systemPrompt", value: systemPrompt });
    stream.parameter({ name: "voice", value: voice });
    stream.parameter({ name: "language", value: language });
    stream.parameter({ name: "direction", value: "OUTBOUND" });
    stream.parameter({ name: "customerPhone", value: customerPhone });

    return new Response(voiceResponse.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err: unknown) {
    console.error("[Outbound TwiML Webhook] Error:", err);
    const errorResponse = new twilio.twiml.VoiceResponse();
    const url = new URL(req.url);
    const reqLang = url.searchParams.get("language") || "ta-IN";
    const sayAttrs = getTwilioSayAttributes(reqLang);
    if (reqLang.startsWith("ta")) {
      errorResponse.say(
        sayAttrs,
        "மன்னிக்கவும், ஒரு சிறிய தொழில்நுட்பக் கோளாறு ஏற்பட்டுள்ளது. எங்கள் பிரதிநிதி உங்களை விரைவில் தொடர்புகொள்வார். நன்றி!"
      );
    } else {
      errorResponse.say(
        sayAttrs,
        "We apologize, but we are experiencing a temporary technical difficulty. Our specialist will call you back shortly. Thank you!"
      );
    }
    errorResponse.hangup();
    return new Response(errorResponse.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
}

export async function GET(req: Request) {
  return handleTwimlRequest(req);
}

export async function POST(req: Request) {
  return handleTwimlRequest(req);
}
