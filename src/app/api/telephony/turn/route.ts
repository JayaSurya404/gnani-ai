import twilio from "twilio";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/telephony/webhook-auth";
import { generateLLMVoiceTurn, detectLanguageFromUtterance, type TenantProductInfo } from "@/lib/telephony/llm-voice-turn";
import { normalizePhone, getPhoneVariants } from "@/lib/phone";
import { synthesizeGnaniAudio, getTwilioSayAttributes } from "@/lib/telephony/gnani-tts";
import { getPublicAudioUrl } from "@/lib/telephony/audio-cache";
import { transcribeWithGnaniPrisma } from "@/lib/telephony/gnani-prisma-stt";
import { resolveCanonicalVoice, normalizeLanguageCode } from "@/lib/voice-profiles";

export const dynamic = "force-dynamic";

const LIVE_TURN_TTS_TIMEOUT_MS = parseInt(
  process.env.LIVE_TURN_TTS_TIMEOUT_MS || "6000",
  10
);

interface CachedTurnResponse {
  responseXml: string;
  statusCode: number;
  timestamp: number;
}

interface CachedSessionTenantContext {
  session: { id: string; organization_id: string | null; lead_id: string | null; customer_phone: string | null; customer_name: string | null } | null;
  orgId: string | null;
  phone: string;
  customerName: string;
  personaName?: string;
  selectedVoice?: string;
  canonicalVoice?: string;
  selectedModel?: "timbre-v2.5" | "timbre-v3.0";
  selectedLanguage?: string;
  greetingSent?: boolean;
  tenantContext: {
    businessName: string;
    businessCity: string | null;
    businessState: string | null;
    businessDescription: string | null;
    products: TenantProductInfo[];
  };
  leadContext?: { primaryInterest?: string; notes?: string };
  businessRecord: { id: string; name: string; city: string | null; state: string | null; description: string | null; phone: string | null } | null;
  timestamp: number;
}

declare global {
  var __vn_turn_idempotency_map: Map<string, CachedTurnResponse> | undefined;
  var __vn_turn_inflight_set: Set<string> | undefined;
  var __vn_session_context_cache: Map<string, CachedSessionTenantContext> | undefined;
}

const turnIdempotencyMap: Map<string, CachedTurnResponse> =
  globalThis.__vn_turn_idempotency_map || new Map();
if (!globalThis.__vn_turn_idempotency_map) {
  globalThis.__vn_turn_idempotency_map = turnIdempotencyMap;
}

const turnInFlightSet: Set<string> =
  globalThis.__vn_turn_inflight_set || new Set();
if (!globalThis.__vn_turn_inflight_set) {
  globalThis.__vn_turn_inflight_set = turnInFlightSet;
}

const sessionContextCache: Map<string, CachedSessionTenantContext> =
  globalThis.__vn_session_context_cache || new Map();
if (!globalThis.__vn_session_context_cache) {
  globalThis.__vn_session_context_cache = sessionContextCache;
}

export async function POST(req: Request) {
  const turnStart = Date.now();
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>System unavailable.</Say><Hangup/></Response>`,
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

    // Verify webhook signature (skip in dev if needed)
    const verification = verifyTwilioWebhook({
      url: fullUrl,
      signature,
      params,
      skipInDevelopment: true,
    });

    if (!verification.isValid) {
      console.warn("[Telephony Turn] Invalid Twilio signature:", verification.reason);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`,
        { status: 403, headers: { "Content-Type": "text/xml" } }
      );
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") || url.searchParams.get("callSessionId") || "";
    const languageParam = url.searchParams.get("language") || "ta-IN";
    const voiceParam = url.searchParams.get("voice") || "";
    const modelParam = url.searchParams.get("model") || "";
    const emptyTurns = parseInt(url.searchParams.get("emptyTurns") || "0", 10);
    const turnSeq = parseInt(url.searchParams.get("turnSeq") || "1", 10);

    let speechResult = (params.SpeechResult || "").trim();
    const callSid = params.CallSid || "";
    const fromPhone = params.From || "";

    console.log(
      `[Telephony Turn] Webhook received: CallSid=${callSid} | SessionId=${sessionId} | Turn=${turnSeq} | EmptyTurns=${emptyTurns} | Lang=${languageParam} | Voice=${voiceParam}`
    );

    const lockedLang = normalizeLanguageCode(languageParam);
    let detectedLanguage = lockedLang;
    let sttProvider = "TWILIO_GATHER";

    // If Twilio provided a caller speech recording (<Record>), transcribe directly via Gnani Prisma v3.0 STT
    if (params.RecordingUrl) {
      const recordingDuration = parseFloat(params.RecordingDuration || "0");
      // Enforce minimum threshold (0.3s) and documented Prisma v3 REST limit (maximum 30s)
      if (recordingDuration > 0.3 && recordingDuration <= 30) {
        try {
          const rawUrl = params.RecordingUrl;
          const wavUrl = rawUrl.endsWith(".wav") ? rawUrl : `${rawUrl}.wav`;
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken = process.env.TWILIO_AUTH_TOKEN;
          const authHeader = accountSid && authToken
            ? "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64")
            : undefined;

          // Bounded retry with backoff: Twilio docs warn that RecordingUrl may return 404
          // for the first 200-800ms while the audio file is being finalized on S3/CDN.
          let audioBuffer: Buffer | null = null;
          const maxAttempts = 4;
          const retryDelaysMs = [250, 450, 750];

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              const audioRes = await fetch(wavUrl, {
                headers: authHeader ? { Authorization: authHeader } : {},
                signal: AbortSignal.timeout(4000),
              });

              if (audioRes.ok) {
                const arrayBuf = await audioRes.arrayBuffer();
                // Enforce maximum buffer size (10MB limit for Prisma REST)
                if (arrayBuf.byteLength > 500 && arrayBuf.byteLength <= 10 * 1024 * 1024) {
                  audioBuffer = Buffer.from(arrayBuf);
                  break;
                }
              } else if (audioRes.status === 404) {
                console.log(`[Telephony Turn] Recording audio not ready yet (attempt ${attempt}/${maxAttempts} HTTP 404). Retrying with backoff...`);
              } else {
                console.warn(`[Telephony Turn] Recording fetch attempt ${attempt} returned HTTP ${audioRes.status}`);
              }
            } catch (fetchErr) {
              console.warn(`[Telephony Turn] Recording fetch attempt ${attempt} failed:`, fetchErr instanceof Error ? fetchErr.message : fetchErr);
            }

            if (attempt < maxAttempts) {
              const delay = retryDelaysMs[attempt - 1] || 500;
              await new Promise((r) => setTimeout(r, delay));
            }
          }

          if (audioBuffer) {
            const prismaRes = await transcribeWithGnaniPrisma(audioBuffer, {
              languageCode: lockedLang === "indic-auto" ? "indic-auto" : lockedLang,
              timeoutMs: 6000,
            });

            if (prismaRes.success && prismaRes.transcript) {
              speechResult = prismaRes.transcript.trim();
              sttProvider = "GNANI_PRISMA_V3";
              if (lockedLang === "indic-auto" && prismaRes.detectedLanguageCode) {
                detectedLanguage = normalizeLanguageCode(prismaRes.detectedLanguageCode);
              }
            }
          }
        } catch (sttErr) {
          console.warn("[Telephony Turn] Failed to fetch or transcribe caller audio with Gnani Prisma STT:", sttErr);
        }
      }
    }

    if (speechResult && lockedLang === "indic-auto") {
      detectedLanguage = detectLanguageFromUtterance(speechResult, "indic-auto").code;
    }

    const sayLang = detectedLanguage;

    console.log(
      `[Telephony Turn] SpeechResult extracted: "${speechResult || "(none - silence)"}" | Confidence=${params.Confidence || "N/A"} | Language=${sayLang} | Provider=${sttProvider}`
    );

    const appUrl =
      process.env.TWILIO_WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://voicenexus.app";

    // Robust Idempotency: Check if this specific turn sequence & speech was already processed
    const speechHash = speechResult
      ? crypto.createHash("md5").update(speechResult.trim()).digest("hex").slice(0, 10)
      : `empty_${emptyTurns}`;
    const idempotencyKey = `${sessionId || callSid}:turn:${turnSeq}:${speechHash}`;

    const now = Date.now();
    for (const [k, v] of turnIdempotencyMap.entries()) {
      if (now - v.timestamp > 5 * 60 * 1000) {
        turnIdempotencyMap.delete(k);
      }
    }

    const cachedTurn = turnIdempotencyMap.get(idempotencyKey);
    if (cachedTurn) {
      return new Response(cachedTurn.responseXml, {
        status: cachedTurn.statusCode,
        headers: { "Content-Type": "text/xml; charset=utf-8", "X-VoiceNexus-Idempotent": "true" },
      });
    }

    // Concurrent Callback Protection: If an identical turn is already in-flight, wait for it to populate cache
    if (turnInFlightSet.has(idempotencyKey)) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const readyTurn = turnIdempotencyMap.get(idempotencyKey);
        if (readyTurn) {
          return new Response(readyTurn.responseXml, {
            status: readyTurn.statusCode,
            headers: { "Content-Type": "text/xml; charset=utf-8", "X-VoiceNexus-Idempotent": "true" },
          });
        }
      }
    }

    turnInFlightSet.add(idempotencyKey);

    try {
      // Fast in-memory cache lookup for tenant context (drops ~1.5s DB overhead on turn 2+)
      const cacheKey = sessionId || callSid;
      let cachedCtx = cacheKey ? sessionContextCache.get(cacheKey) : null;
      if (cachedCtx && Date.now() - cachedCtx.timestamp > 10 * 60 * 1000) {
        sessionContextCache.delete(cacheKey);
        cachedCtx = null;
      }

      let session = cachedCtx?.session || null;
      let orgId = cachedCtx?.orgId || null;
      let phone = cachedCtx?.phone || fromPhone;
      let customerName = cachedCtx?.customerName || "Customer";
      let businessRecord = cachedCtx?.businessRecord || null;
      let leadContext = cachedCtx?.leadContext;
      let tenantContext = cachedCtx?.tenantContext;

      if (!cachedCtx) {
        // Lookup call session safely
        const { data: dbSession } = await supabase
          .from("call_sessions")
          .select("id, organization_id, lead_id, agent_id, customer_phone, customer_name")
          .eq("id", sessionId)
          .limit(1)
          .maybeSingle();

        session = dbSession;

        if (!session && callSid) {
          const { data: byRecording } = await supabase
            .from("call_sessions")
            .select("id, organization_id, lead_id, agent_id, customer_phone, customer_name")
            .eq("recording_url", `twilio:${callSid}`)
            .limit(1)
            .maybeSingle();
          session = byRecording;
        }

        orgId = session?.organization_id || null;
        phone = session?.customer_phone || fromPhone;
        customerName = (session?.customer_name || "Customer")
          .replace(/\[TEST_CONTACT\]\s*/gi, "")
          .replace(/\[.*?\]\s*/g, "")
          .trim() || "Customer";

        // Fetch Dynamic Tenant & Business Profile Context (Strictly Scoped)
        if (session?.lead_id) {
          let leadQuery = supabase
            .from("leads")
            .select("name, business_id, primary_interest, notes")
            .eq("id", session.lead_id);
          if (orgId) {
            leadQuery = leadQuery.eq("organization_id", orgId);
          }
          const { data: leadData } = await leadQuery.maybeSingle();

          if (leadData) {
            leadContext = {
              primaryInterest: leadData.primary_interest || undefined,
              notes: leadData.notes
                ? leadData.notes.replace(/\[TEST_CONTACT\]\s*/gi, "").replace(/SAMPLE_LEAD/gi, "").trim()
                : undefined,
            };
            if (leadData.business_id) {
              let bQuery = supabase
                .from("businesses")
                .select("id, name, city, state, description, phone")
                .eq("id", leadData.business_id);
              if (orgId) {
                bQuery = bQuery.eq("organization_id", orgId);
              }
              const { data: bData } = await bQuery.maybeSingle();
              businessRecord = bData;
            }
          }
        }

        if (!businessRecord && orgId) {
          const { data: bData } = await supabase
            .from("businesses")
            .select("id, name, city, state, description, phone")
            .eq("organization_id", orgId)
            .limit(1)
            .maybeSingle();
          businessRecord = bData;
        }

        let products: TenantProductInfo[] = [];
        if (businessRecord?.id) {
          const { data: pList } = await supabase
            .from("products")
            .select("name, sku, price_display, description")
            .eq("business_id", businessRecord.id)
            .eq("is_active", true)
            .limit(6);
          if (pList) {
            products = pList.map((p) => ({
              name: p.name,
              sku: p.sku,
              price: p.price_display,
              description: p.description,
            }));
          }
        }

        tenantContext = {
          businessName: businessRecord?.name || "Consultation Services",
          businessCity: businessRecord?.city || null,
          businessState: businessRecord?.state || null,
          businessDescription: businessRecord?.description || null,
          products,
        };

        if (cacheKey) {
          sessionContextCache.set(cacheKey, {
            session,
            orgId,
            phone,
            customerName,
            tenantContext,
            leadContext,
            businessRecord,
            timestamp: Date.now(),
          });
          if (session?.id && session.id !== cacheKey) {
            sessionContextCache.set(session.id, {
              session,
              orgId,
              phone,
              customerName,
              tenantContext,
              leadContext,
              businessRecord,
              timestamp: Date.now(),
            });
          }
        }
      }

      if (!tenantContext) {
        tenantContext = {
          businessName: "Kaveri Solar",
          businessCity: null,
          businessState: null,
          businessDescription: null,
          products: [],
        };
      }

      // Authoritative Voice & Persona Resolution for Turn
      const effectiveVoice = voiceParam || cachedCtx?.selectedVoice || "";
      const resolvedVoiceConfig = resolveCanonicalVoice(effectiveVoice, sayLang);
      const personaName = resolvedVoiceConfig.personaName;
      const canonicalVoice = resolvedVoiceConfig.canonicalVoice;
      const voiceModel = (modelParam as "timbre-v2.5" | "timbre-v3.0") || resolvedVoiceConfig.model;

    // 2. Handle Empty Speech / Silence with Sequential Retry
    if (!speechResult) {
      if (emptyTurns === 0) {
        // First silence: Polite check-in prompt in locked conversation language
        let retryText = "I'm sorry, I couldn't hear that clearly. Could you please repeat your requirement?";
        if (sayLang.startsWith("ta")) {
          retryText = "மன்னிக்கவும், உங்கள் குரல் தெளிவாகக் கேட்கவில்லை. தயவுசெய்து உங்கள் தேவையை மீண்டும் கூற முடியுமா?";
        } else if (sayLang.startsWith("hi")) {
          retryText = "माफ़ कीजिए, आपकी आवाज़ स्पष्ट नहीं आई। क्या आप अपनी आवश्यकता दोबारा बता सकते हैं?";
        } else if (sayLang.startsWith("te")) {
          retryText = "క్షమించండి, మీ స్వరం స్పష్టంగా వినిపించలేదు. దయచేసి మీ అవసరాన్ని మళ్ళీ చెప్పగలరా?";
        } else if (sayLang.startsWith("kn")) {
          retryText = "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಅಗತ್ಯವನ್ನು ಪುನಃ ತಿಳಿಸಬಹುದೇ?";
        } else if (sayLang.startsWith("ml")) {
          retryText = "ക്ഷമിക്കണം, നിങ്ങളുടെ ശബ്ദം വ്യക്തമായി കേട്ടില്ല. ദയവായി നിങ്ങളുടെ ആവശ്യം വീണ്ടും പറയാമോ?";
        }

        let retryAudioId: string | null = null;
        try {
          retryAudioId = await synthesizeGnaniAudio({
            text: retryText,
            language: sayLang,
            model: voiceModel,
            voice: canonicalVoice,
            timeoutMs: LIVE_TURN_TTS_TIMEOUT_MS,
          });
        } catch {
          // Fallback to Twilio Say
        }

        const retryResponse = new twilio.twiml.VoiceResponse();
        const nextSpeechUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${turnSeq + 1}&emptyTurns=0`;
        const retryTimeoutUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${turnSeq + 1}&emptyTurns=1`;

        // Sequential: Play retry audio completely, then Gather
        if (retryAudioId) {
          retryResponse.play(getPublicAudioUrl(retryAudioId, appUrl));
        } else {
          const sayAttrs = getTwilioSayAttributes(sayLang);
          retryResponse.say(sayAttrs, retryText);
        }

        retryResponse.gather({
          input: ["speech"],
          action: nextSpeechUrl,
          method: "POST",
          speechTimeout: "auto",
          timeout: 8,
          language: sayLang as never,
        });

        retryResponse.redirect({ method: "POST" }, retryTimeoutUrl);

        const retryXml = retryResponse.toString();
        turnIdempotencyMap.set(idempotencyKey, {
          responseXml: retryXml,
          statusCode: 200,
          timestamp: Date.now(),
        });

        return new Response(retryXml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      } else if (emptyTurns === 1) {
        // Second silence: Friendly re-engagement prompt in locked conversation language
        let retryText = "Hello, are you still there? Please let me know what details you need regarding solar installation.";
        if (sayLang.startsWith("ta")) {
          retryText = "ஹலோ, லைன்ல இருக்கீங்களா? உங்களுக்கு சோலார் சிஸ்டம் பற்றி என்ன விவரங்கள் தேவை சொல்லுங்க.";
        } else if (sayLang.startsWith("hi")) {
          retryText = "नमस्ते, क्या आप लाइन पर हैं? सोलर सिस्टम के बारे में आपको क्या जानकारी चाहिए बताइए।";
        } else if (sayLang.startsWith("te")) {
          retryText = "హలో, లైన్‌లో ఉన్నారా? సోలార్ సిస్టమ్ గురించి మీకు ఏ వివరాలు కావాలో చెప్పండి.";
        } else if (sayLang.startsWith("kn")) {
          retryText = "ಹಲೋ, ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಾ? ಸೌರ ವಿದ್ಯುತ್ ವ್ಯವಸ್ಥೆಯ ಬಗ್ಗೆ ನಿಮಗೆ ಯಾವ ವಿವರಗಳು ಬೇಕು ತಿಳಿಸಿ.";
        } else if (sayLang.startsWith("ml")) {
          retryText = "ഹലോ, ലൈനിലുണ്ടോ? സോളാർ സിസ്റ്റത്തെക്കുറിച്ച് എന്ത് വിവരങ്ങളാണ് വേണ്ടതെന്ന് പറയൂ.";
        }

        let retryAudioId: string | null = null;
        try {
          retryAudioId = await synthesizeGnaniAudio({
            text: retryText,
            language: sayLang,
            model: voiceModel,
            voice: canonicalVoice,
            timeoutMs: LIVE_TURN_TTS_TIMEOUT_MS,
          });
        } catch {
          // Fallback to Twilio Say
        }

        const retryResponse = new twilio.twiml.VoiceResponse();
        const nextSpeechUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${turnSeq + 1}&emptyTurns=0`;
        const retryTimeoutUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${turnSeq + 1}&emptyTurns=2`;

        if (retryAudioId) {
          retryResponse.play(getPublicAudioUrl(retryAudioId, appUrl));
        } else {
          const sayAttrs = getTwilioSayAttributes(sayLang);
          retryResponse.say(sayAttrs, retryText);
        }

        retryResponse.gather({
          input: ["speech"],
          action: nextSpeechUrl,
          method: "POST",
          speechTimeout: "auto",
          timeout: 8,
          language: sayLang as never,
        });

        retryResponse.redirect({ method: "POST" }, retryTimeoutUrl);

        const retryXml = retryResponse.toString();
        turnIdempotencyMap.set(idempotencyKey, {
          responseXml: retryXml,
          statusCode: 200,
          timestamp: Date.now(),
        });

        return new Response(retryXml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      } else {
        // Third consecutive silence (24+ seconds total inaction): Graceful conclusion in locked language
        let farewellText = `Thank you for your time. A specialist from ${tenantContext.businessName} will follow up with you shortly. Goodbye.`;
        if (sayLang.startsWith("ta")) {
          farewellText = `நன்றி, ${tenantContext.businessName} நிறுவனத்திலிருந்து எங்கள் பொறியாளர் உங்களை விரைவில் தொடர்புகொள்வார். வணக்கம்.`;
        } else if (sayLang.startsWith("hi")) {
          farewellText = `धन्यवाद, ${tenantContext.businessName} से हमारे इंजीनियर आपसे जल्द ही संपर्क करेंगे। नमस्कार।`;
        } else if (sayLang.startsWith("te")) {
          farewellText = `ధన్యవాదాలు, ${tenantContext.businessName} ఇంజనీర్ త్వరలో మిమ్మల్ని సంప్రదిస్తారు. నమస్కారం.`;
        } else if (sayLang.startsWith("kn")) {
          farewellText = `ಧನ್ಯವಾದಗಳು, ${tenantContext.businessName} ಇಂಜಿನಿಯರ್ ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ. ನಮಸ್ಕಾರ.`;
        } else if (sayLang.startsWith("ml")) {
          farewellText = `നന്ദി, ${tenantContext.businessName} എൻജിനീയർ ഉടൻ തന്നെ ബന്ധപ്പെടും. നമസ്കാരം.`;
        }

        const farewellResponse = new twilio.twiml.VoiceResponse();
        const sayAttrs = getTwilioSayAttributes(sayLang);
        farewellResponse.say(sayAttrs, farewellText);
        farewellResponse.hangup();

        const farewellXml = farewellResponse.toString();
        turnIdempotencyMap.set(idempotencyKey, {
          responseXml: farewellXml,
          statusCode: 200,
          timestamp: Date.now(),
        });

        return new Response(farewellXml, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
    }

    // 3. Fetch Prior Conversation History for Grounded LLM Context
    const conversationHistory: { speaker: string; text: string }[] = [];
    let callerRecordPromise: Promise<void> | null = null;

    if (session) {
      try {
        const { data: pastSegments } = await supabase
          .from("transcript_segments")
          .select("speaker, text, created_at")
          .eq("call_session_id", session.id)
          .order("created_at", { ascending: true })
          .limit(30);

        if (pastSegments && pastSegments.length > 0) {
          pastSegments.forEach((s) => {
            conversationHistory.push({ speaker: s.speaker, text: s.text });
          });
        }
      } catch (histErr) {
        console.warn("[Telephony Turn] Failed to fetch prior conversation history:", histErr);
      }

      // 4. Asynchronously record caller speech without blocking LLM invocation
      callerRecordPromise = (async () => {
        try {
          await Promise.all([
            supabase.from("call_events").insert({
              call_session_id: session.id,
              event_type: "USER_TRANSCRIPT",
              payload: { text: speechResult, mode: "TURN_BASED_VOICE", provider: sttProvider, detectedLanguage, callSid, confidence: params.Confidence || "0.95" },
            } as never),
            supabase.from("transcript_segments").insert({
              call_session_id: session.id,
              speaker: "CALLER",
              language: detectedLanguage,
              text: speechResult,
              confidence: parseFloat(params.Confidence || "0.95"),
            }),
          ]);
          console.log(`[Telephony Turn] Caller transcript persisted for session ${session.id}: "${speechResult}"`);
        } catch (recErr) {
          console.warn("[Telephony Turn] Caller record background error:", recErr);
        }
      })();
    }

    // 5. Generate Grounded AI Response using Real LLM (Gemini) with Dynamic Tenant Context
    const geminiStart = Date.now();
    const turnResponse = await generateLLMVoiceTurn({
      userUtterance: speechResult,
      conversationHistory,
      customerName,
      personaName,
      language: sayLang,
      tenantContext,
      leadContext,
    });
    const geminiDurationMs = Date.now() - geminiStart;
    console.log(`[Telephony Turn] Gemini response received in ${geminiDurationMs}ms: "${turnResponse.text}"`);

    // 6. Handle Do-Not-Call (DNC) Opt-Out
    if (turnResponse.isDnc) {
      if (orgId && phone) {
        const norm = normalizePhone(phone);
        const variants = getPhoneVariants(norm);
        const { data: updatedRows } = await supabase
          .from("leads")
          .update({
            status: "DO_NOT_CALL",
            do_not_call: true,
            notes: `Caller opted out in turn-based call ${callSid}`,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", orgId)
          .in("phone", variants)
          .select("id");

        // If no lead existed for this number, insert a DNC record to suppress future outbound campaigns
        if (!updatedRows || updatedRows.length === 0) {
          await supabase.from("leads").insert({
            organization_id: orgId,
            business_id: businessRecord?.id || null,
            name: customerName !== "Customer" ? customerName : "Suppressed Contact",
            phone: norm,
            status: "DO_NOT_CALL",
            do_not_call: true,
            source: "VOICE_CALL_DNC",
            notes: `Caller opted out during live call ${callSid}`,
          });
        }

        if (session) {
          await supabase.from("call_events").insert({
            call_session_id: session.id,
            event_type: "DNC_OPT_OUT",
            payload: { phone: norm, mode: "TRIAL_TURN_BASED_VOICE", callSid },
          } as never);
        }
      }

      const dncResponse = new twilio.twiml.VoiceResponse();
      const sayAttrs = getTwilioSayAttributes(sayLang);
      dncResponse.say(sayAttrs, turnResponse.text);
      dncResponse.hangup();

      const dncXml = dncResponse.toString();
      turnIdempotencyMap.set(idempotencyKey, {
        responseXml: dncXml,
        statusCode: 200,
        timestamp: Date.now(),
      });

      return new Response(dncXml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // 7. Handle Human Escalation (with Live Supervisor Transfer when configured)
    if (turnResponse.isEscalation) {
      const supervisorPhone =
        process.env.SUPERVISOR_PHONE_NUMBER ||
        process.env.ESCALATION_PHONE_NUMBER ||
        businessRecord?.phone ||
        null;

      if (session) {
        await supabase.from("call_events").insert({
          call_session_id: session.id,
          event_type: "HANDOFF_REQUESTED",
          payload: { text: turnResponse.text, callSid, supervisorPhone },
        } as never);

        if (supervisorPhone) {
          await supabase
            .from("call_sessions")
            .update({
              transfer_status: "INITIATED",
              transfer_target: supervisorPhone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        }
      }

      const escResponse = new twilio.twiml.VoiceResponse();
      const sayAttrs = getTwilioSayAttributes(sayLang);
      escResponse.say(sayAttrs, turnResponse.text);

      if (supervisorPhone) {
        const transferCallbackUrl = `${appUrl}/api/telephony/transfer-complete?sessionId=${encodeURIComponent(session?.id || sessionId)}`;
        const dial = escResponse.dial({
          action: transferCallbackUrl,
          callerId: process.env.TWILIO_VOICE_NUMBER || "",
        });
        dial.number(supervisorPhone);
      } else {
        escResponse.hangup();
      }

      const escXml = escResponse.toString();
      turnIdempotencyMap.set(idempotencyKey, {
        responseXml: escXml,
        statusCode: 200,
        timestamp: Date.now(),
      });

      return new Response(escXml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    // 8. Synthesize AI Response via Gnani Timbre TTS (with bounded turn budget)
    let audioId: string | null = null;
    const ttsStart = Date.now();
    const elapsedBeforeTts = Date.now() - turnStart;
    // Twilio carrier webhook timeout is ~4200ms. Enforce strict budget so response returns within 3500ms max.
    const remainingBudgetMs = Math.max(1200, 3500 - elapsedBeforeTts);
    const effectiveTtsTimeout = Math.min(LIVE_TURN_TTS_TIMEOUT_MS, remainingBudgetMs);

    try {
      audioId = await synthesizeGnaniAudio({
        text: turnResponse.text,
        language: sayLang,
        model: voiceModel,
        voice: canonicalVoice,
        timeoutMs: effectiveTtsTimeout,
      });
    } catch (ttsErr) {
      console.warn(`[Telephony Turn] TTS synthesis fallback (after ${Date.now() - ttsStart}ms):`, ttsErr);
    }
    const ttsDurationMs = Date.now() - ttsStart;
    const ttsProvider = audioId ? "GNANI_TIMBRE_PLAY" : "TWILIO_SAY_FALLBACK";
    const ttsOutcome = audioId ? "SUCCESS" : "FALLBACK";

    // 9. Asynchronously record Agent Response and Transcript in background without delaying TwiML return
    if (session) {
      Promise.all([
        supabase.from("call_events").insert({
          call_session_id: session.id,
          event_type: "AGENT_RESPONSE",
          payload: {
            text: turnResponse.text,
            mode: "TRIAL_TURN_BASED_VOICE",
            model: turnResponse.model,
            audioId: audioId || null,
            ttsOutcome,
            ttsProvider,
            ttsDurationMs,
          },
        } as never),
        supabase.from("transcript_segments").insert({
          call_session_id: session.id,
          speaker: "AGENT",
          language: sayLang,
          text: turnResponse.text,
          confidence: 1.0,
        }),
      ])
        .then(() => {
          console.log(
            `[Telephony Turn] AI transcript persisted for session ${session.id}: "${turnResponse.text}" | AudioStatus=${ttsOutcome} (${ttsProvider})`
          );
        })
        .catch((agentErr) => {
          console.warn("[Telephony Turn] Agent transcript persistence error:", agentErr);
        });
    }

    if (callerRecordPromise) {
      callerRecordPromise.catch((recErr) => {
        console.warn("[Telephony Turn] Caller record background error:", recErr);
      });
    }

    // 10. Construct Canonical TwiML: Sequential Play then Gather for continuous multi-turn dialogue without speech cutoff
    const voiceResponse = new twilio.twiml.VoiceResponse();
    const nextTurnSeq = turnSeq + 1;
    const nextActionUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${nextTurnSeq}&emptyTurns=0`;
    const timeoutRedirectUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(session?.id || sessionId)}&callSessionId=${encodeURIComponent(session?.id || sessionId)}&language=${encodeURIComponent(sayLang)}&voice=${encodeURIComponent(personaName)}&model=${encodeURIComponent(voiceModel)}&turnSeq=${nextTurnSeq}&emptyTurns=1`;

    // Step A: Play complete AI response audio cleanly to caller
    if (audioId) {
      voiceResponse.play(getPublicAudioUrl(audioId, appUrl));
    } else {
      const sayAttrs = getTwilioSayAttributes(sayLang);
      voiceResponse.say(sayAttrs, turnResponse.text);
    }

    // Step B: Gather caller speech for next turn immediately after audio finishes
    voiceResponse.gather({
      input: ["speech"],
      action: nextActionUrl,
      method: "POST",
      speechTimeout: "auto",
      timeout: 8,
      language: sayLang as never,
    });

    // Step C: Fallback redirect if caller stays silent during 8-second listening window
    voiceResponse.redirect({ method: "POST" }, timeoutRedirectUrl);

    const mainXml = voiceResponse.toString();
    const totalTurnDurationMs = Date.now() - turnStart;
    console.log(
      `[Telephony Turn Diagnostic] Correlation: ${sessionId || callSid} | Turn: ${turnSeq} | Speech: ${Boolean(speechResult)} (chars: ${speechResult.length}) | Confidence: ${params.Confidence || "N/A"} | Gemini: ${geminiDurationMs}ms (status: success) | TTS: ${ttsProvider} in ${ttsDurationMs}ms (outcome: ${ttsOutcome}, audioId: ${audioId || "none"}) | TwiML: HTTP 200 (${mainXml.length} chars) | Total: ${totalTurnDurationMs}ms`
    );

    turnIdempotencyMap.set(idempotencyKey, {
      responseXml: mainXml,
      statusCode: 200,
      timestamp: Date.now(),
    });

    return new Response(mainXml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } finally {
    turnInFlightSet.delete(idempotencyKey);
  }
} catch (err: unknown) {
  console.error("[Telephony Turn] Error caught in turn handler:", err);
  const errorResponse = new twilio.twiml.VoiceResponse();
  const url = new URL(req.url);
  const reqLang = url.searchParams.get("language") || "ta-IN";
  const reqVoice = url.searchParams.get("voice") || "";
  const reqModel = url.searchParams.get("model") || "";
  const reqSessionId = url.searchParams.get("sessionId") || url.searchParams.get("callSessionId") || "";
  const currentSeq = parseInt(url.searchParams.get("turnSeq") || "1", 10);
  const nextSeq = currentSeq + 1;

  const appUrl =
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://voicenexus.app";

  const sayAttrs = getTwilioSayAttributes(reqLang);
  let promptText = "I'm sorry, I couldn't hear that clearly. Could you please repeat your requirement?";
  if (reqLang.startsWith("ta")) {
    promptText = "மன்னிக்கவும், உங்கள் குரல் தெளிவாகக் கேட்கவில்லை. தயவுசெய்து உங்கள் தேவையை மீண்டும் கூறுங்கள்.";
  } else if (reqLang.startsWith("hi")) {
    promptText = "माफ़ कीजिए, आपकी आवाज़ स्पष्ट नहीं आई। कृपया अपनी बात फिर से दोहराएं।";
  } else if (reqLang.startsWith("te")) {
    promptText = "క్షమించండి, మీ స్వరం స్పష్టంగా వినిపించలేదు. దయచేసి మళ్ళీ చెప్పండి.";
  } else if (reqLang.startsWith("kn")) {
    promptText = "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಪುನಃ ತಿಳಿಸಿ.";
  } else if (reqLang.startsWith("ml")) {
    promptText = "ക്ഷമിക്കണം, നിങ്ങളുടെ ശബ്ദം വ്യക്തമായി കേട്ടില്ല. ദയവായി വീണ്ടും പറയൂ.";
  }

  errorResponse.say(sayAttrs, promptText);

  // Keep the live carrier conversation alive with sequential Gather instead of hanging up
  const nextSpeechUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(reqSessionId)}&callSessionId=${encodeURIComponent(reqSessionId)}&language=${encodeURIComponent(reqLang)}&voice=${encodeURIComponent(reqVoice)}&model=${encodeURIComponent(reqModel)}&turnSeq=${nextSeq}&emptyTurns=0`;
  const retryTimeoutUrl = `${appUrl}/api/telephony/turn?sessionId=${encodeURIComponent(reqSessionId)}&callSessionId=${encodeURIComponent(reqSessionId)}&language=${encodeURIComponent(reqLang)}&voice=${encodeURIComponent(reqVoice)}&model=${encodeURIComponent(reqModel)}&turnSeq=${nextSeq}&emptyTurns=1`;

  errorResponse.gather({
    input: ["speech"],
    action: nextSpeechUrl,
    method: "POST",
    speechTimeout: "auto",
    timeout: 8,
    language: reqLang as never,
  });

  errorResponse.redirect({ method: "POST" }, retryTimeoutUrl);

  return new Response(errorResponse.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
}
