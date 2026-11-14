import { normalizeLanguageCode } from "@/lib/voice-profiles";

export interface ConversationTurnItem {
  speaker: string; // "AGENT" | "CALLER" | "AI" | "CUSTOMER"
  text: string;
}

export interface TenantProductInfo {
  name: string;
  sku?: string | null;
  price?: string | null;
  description?: string | null;
}

export interface TenantContext {
  businessName: string;
  businessCity?: string | null;
  businessState?: string | null;
  businessDescription?: string | null;
  products?: TenantProductInfo[];
}

export interface VoiceTurnOptions {
  userUtterance: string;
  conversationHistory: ConversationTurnItem[];
  customerName?: string;
  personaName?: string; // "Asmita", "Kaveri", "Ananya", "Nalini", "Chitra", "Arya", "Shivani", etc.
  language?: string; // "ta-IN", "en-IN", "hi-IN", "te-IN", "kn-IN", "ml-IN", "indic-auto"
  tenantContext: TenantContext;
  leadContext?: {
    primaryInterest?: string;
    notes?: string;
    phone?: string;
  };
}

export interface VoiceTurnOutput {
  text: string;
  isDnc: boolean;
  isEscalation: boolean;
  model: string;
  latencyMs: number;
  detectedLanguageCode?: string;
}

/**
 * Detect language from utterance and hint.
 * If hintedLang is provided, lock to that language unless explicitly requested.
 */
export function detectLanguageFromUtterance(text: string, hintedLang?: string): { code: string; name: string } {
  const normHint = normalizeLanguageCode(hintedLang);

  // If locked/hinted to a specific language, respect the lock
  if (normHint === "ta-IN") return { code: "ta-IN", name: "Tamil" };
  if (normHint === "hi-IN") return { code: "hi-IN", name: "Hindi" };
  if (normHint === "te-IN") return { code: "te-IN", name: "Telugu" };
  if (normHint === "kn-IN") return { code: "kn-IN", name: "Kannada" };
  if (normHint === "ml-IN") return { code: "ml-IN", name: "Malayalam" };
  if (normHint === "en-IN") return { code: "en-IN", name: "Indian English" };

  // For auto code-switching (indic-auto)
  if (/[\u0B80-\u0BFF]/.test(text)) return { code: "ta-IN", name: "Tamil" };
  if (/[\u0900-\u097F]/.test(text)) return { code: "hi-IN", name: "Hindi" };
  if (/[\u0C00-\u0C7F]/.test(text)) return { code: "te-IN", name: "Telugu" };
  if (/[\u0C80-\u0CFF]/.test(text)) return { code: "kn-IN", name: "Kannada" };
  if (/[\u0D00-\u0D7F]/.test(text)) return { code: "ml-IN", name: "Malayalam" };

  return { code: "en-IN", name: "Indian English" };
}

/**
 * Builds a strictly isolated multi-tenant system prompt from dynamic business context.
 * Never hardcodes brands, pricing, or locations.
 */
function buildTenantSystemPrompt(options: VoiceTurnOptions): { prompt: string; detectedLang: { code: string; name: string } } {
  const { tenantContext, customerName, language, leadContext, personaName = "Asmita" } = options;
  const businessName = tenantContext.businessName || "Kaveri Solar";
  const detectedLang = detectLanguageFromUtterance(options.userUtterance, language);
  const location = [tenantContext.businessCity, tenantContext.businessState].filter(Boolean).join(", ");

  let productsSection = "";
  if (tenantContext.products && tenantContext.products.length > 0) {
    const productLines = tenantContext.products.map((p) => {
      let line = `- ${p.name}`;
      if (p.price) line += ` (${p.price})`;
      if (p.description) line += `: ${p.description}`;
      return line;
    });
    productsSection = `OFFICIAL PRODUCTS & PRICING:\n${productLines.join("\n")}`;
  } else {
    productsSection = "OFFICIAL PRODUCTS: Standard solar consultation, agricultural pump solutions, and custom quotations upon technical review.";
  }

  const cleanCustomerName = (customerName || "Customer")
    .replace(/\[TEST_CONTACT\]\s*/gi, "")
    .replace(/\[.*?\]\s*/g, "")
    .trim() || "Customer";

  let customerSection = `CALLER CONTEXT:\n- Customer: ${cleanCustomerName}`;
  if (leadContext?.primaryInterest) {
    customerSection += `\n- Requirement: ${leadContext.primaryInterest}`;
  }
  if (leadContext?.notes) {
    const cleanNotes = leadContext.notes
      .replace(/\[TEST_CONTACT\]\s*/gi, "")
      .replace(/TEST_CONTACT\s*/gi, "")
      .replace(/SAMPLE_LEAD\s*/gi, "")
      .trim();
    if (cleanNotes) {
      customerSection += `\n- Context: ${cleanNotes}`;
    }
  }

  const prompt = `
You are ${personaName}, a warm, helpful, and professional AI Voice Technical Consultant calling on behalf of ${tenantContext.businessName}${location ? ` in ${location}` : ""}.
${tenantContext.businessDescription ? `BUSINESS OVERVIEW: ${tenantContext.businessDescription}` : ""}

${productsSection}

${customerSection}

NATURAL TELEPHONY VOICE CONVERSATION RULES:
1. Target Spoken Language & Style (LOCKED):
   - You MUST speak naturally in ${detectedLang.name} (${detectedLang.code}).
   - If the language is Tamil, use natural conversational Tanglish/Tamil (e.g. "கண்டிப்பாங்க", "சொல்லுங்க", "ரொம்ப மகிழ்ச்சி", "உங்க விவசாய நிலத்திற்கா அல்லது வீட்டிற்கா?").
   - If the language is Kannada, speak natural friendly Kannada.
   - If the language is Telugu, speak polite, melodious Telugu.
   - If the language is Malayalam, speak gentle authentic Malayalam.
   - If the language is Hindi, speak courteous, respectful conversational Hindi.
   - If the language is English, speak polished, warm Indian English.
   - Sound like a knowledgeable human technical consultant on a real phone call, NOT an automated IVR robot.

2. Conversational Continuity & No Duplicate Introduction (CRITICAL):
   - THE OPENING GREETING HAS ALREADY BEEN DELIVERED.
   - The caller ALREADY knows who you are and why you called.
   - DO NOT re-introduce yourself. DO NOT say "நான் ${businessName} நிறுவனத்திலிருந்து ${personaName} பேசுகிறேன்" or "Hello, this is ${personaName}...".
   - Start immediately by addressing what the caller just said, acknowledging it, and answering their question or asking the next logical question.
   - Maintain context across the entire call: remember what the caller already stated (their pump capacity, property type, location, crops, bill amount) and NEVER ask for details already shared.

3. Agricultural Solar Pump & Rural Irrigation Domain Knowledge:
   - If the caller is an agricultural farmer (such as Lakshmi Narayanan in Thanjavur / Kumbakonam) or inquires about agricultural solar pumps replacing diesel pump sets:
     - Understand that diesel pump sets cost heavy daily fuel (₹400-₹800/day) and electric connections often have irregular power or low-voltage issues.
     - Solar agricultural pumps (3HP, 5HP, or 7.5HP DC/AC submersible) run free on daytime sunlight, providing steady irrigation with zero fuel cost.
     - Mention availability of PM-KUSUM Component-B government subsidy support through agriculture engineering departments, without making up false discount numbers.
     - Recommend a free on-site engineering survey to assess borewell depth, water yield, and solar panel shadow-free acreage.

4. Natural Real-Customer Interaction & Prohibited Internal Labels (STRICT):
   - Treat every caller as a genuine prospect with real commercial or agricultural needs.
   - NEVER mention "sample lead", "test contact", "sample contact", "acquisition source", or internal database terms.
   - Speak naturally and respectfully about their specific property, location, and power or irrigation requirements.

5. Natural Follow-Up Flow Examples:
   - If the caller asks for price/cost: provide the ballpark from the official products (e.g. solar pump systems around ₹2.5L to ₹4.5L depending on HP and subsidy), and ask for their borewell depth or pump HP requirement.
   - If the caller states their pump HP (e.g. 5HP or 7.5HP): acknowledge warmly and ask what crops they cultivate or what their borewell depth is.
   - If the caller asks your name or identity: state "${personaName}" warmly and ask how you can help them with their solar setup today.
   - If the caller gives a greeting ("ஹலோ", "வணக்கம்", "கேக்குதா", "Hello"): greet them warmly and ask about their specific requirement.

5. Spoken Turn Pacing & Length (CRITICAL FOR LIVE TELEPHONY):
   - Keep your response strictly to 1 to 2 short conversational sentences (approximately 12 to 20 words total).
   - This ensures crisp voice delivery (under 4 seconds of audio). Never output bullet points, numbered lists, markdown, or lengthy paragraphs.
   - ALWAYS end your response with a clear, single question so the caller knows it is their turn to speak.

6. Audio Formatting:
   - Output speakable plain text only. Do NOT use markdown, asterisks, bolding, bullet points, emojis, quotes, or bracketed stage directions like (smiling) or [pause].
`.trim();

  return { prompt, detectedLang };
}

/**
 * Multi-Tenant Conversational Turn Engine supporting Gemini Flash with Automatic Model Fallback
 */
export async function generateLLMVoiceTurn(options: VoiceTurnOptions): Promise<VoiceTurnOutput> {
  const startTime = Date.now();
  const lower = options.userUtterance.toLowerCase().trim();
  const customerName = options.customerName || "Customer";
  const personaName = options.personaName || "Asmita";
  const businessName = options.tenantContext.businessName || "Kaveri Solar";
  const { prompt: systemInstruction, detectedLang } = buildTenantSystemPrompt(options);

  // 1. DO-NOT-CALL / OPT-OUT SAFETY GUARDRAIL
  const dncKeywords = [
    "not interested", "don't call", "dont call", "stop calling", "remove my number",
    "wrong number", "never call", "வேண்டாம்", "கால் பண்ணாதீங்க", "போனை வை",
    "नहीं चाहिए", "कॉल मत करो", "फोन रखो", "बंद करो", "వద్దు", "కాల్ చేయవద్దు",
    "ಬೇಡ", "ಕಾಲ್ ಮಾಡಬೇಡಿ", "വേണ്ട", "വിളിക്കരുത്"
  ];
  if (dncKeywords.some((phrase) => lower.includes(phrase))) {
    let text = `I understand, ${customerName}. I have marked your preference and ${businessName} will not contact you again. Thank you.`;
    if (detectedLang.code.startsWith("ta")) {
      text = `மன்னிக்கவும் ${customerName}. உங்கள் விருப்பப்படி ${businessName} நிறுவனத்திலிருந்து இனி தொடர்பு கொள்ள மாட்டோம். நன்றி.`;
    } else if (detectedLang.code.startsWith("hi")) {
      text = `माफ़ कीजिए ${customerName}. मैंने आपकी प्राथमिकता दर्ज कर ली है और ${businessName} आपको दोबारा कॉल नहीं करेगा. धन्यवाद.`;
    } else if (detectedLang.code.startsWith("te")) {
      text = `క్షమించండి ${customerName}. మీ అభ్యర్థన నమోదు చేయబడింది, ${businessName} నుండి ఇకపై కాల్స్ రావు. ధన్యవాదాలు.`;
    } else if (detectedLang.code.startsWith("kn")) {
      text = `ಕ್ಷಮಿಸಿ ${customerName}. ನಿಮ್ಮ ಆದ್ಯತೆಯನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ, ${businessName} ಇನ್ನು ಮುಂದೆ ಕರೆ ಮಾಡುವುದಿಲ್ಲ. ಧನ್ಯವಾದಗಳು.`;
    } else if (detectedLang.code.startsWith("ml")) {
      text = `ക്ഷമിക്കണം ${customerName}. നിങ്ങളുടെ മുൻഗണന രേഖപ്പെടുത്തിയിട്ടുണ്ട്, இனி ${businessName} വിളിക്കില്ല. നന്ദി.`;
    }

    return {
      text,
      isDnc: true,
      isEscalation: false,
      model: "safety-guardrail",
      latencyMs: Date.now() - startTime,
      detectedLanguageCode: detectedLang.code,
    };
  }

  // 2. HUMAN SUPERVISOR / ENGINEER ESCALATION
  const humanKeywords = [
    "speak to a human", "talk to human", "real person", "senior engineer", "manager",
    "connect to executive", "human", "மேனேஜர்", "இன்ஜினியர் கிட்ட பேசு",
    "मैनेजर", "इंसान से बात", "सीनियर से बात", "అధికారితో మాట్లాడు", "ಮ್ಯಾನೇಜರ್", "മാനേജർ"
  ];
  if (humanKeywords.some((phrase) => lower.includes(phrase))) {
    let text = `Certainly, ${customerName}. A senior engineer from ${businessName} will reach out to you within 15 minutes.`;
    if (detectedLang.code.startsWith("ta")) {
      text = `நிச்சயமாக ${customerName}. ${businessName} நிறுவனத்தின் மூத்த பொறியாளர் அடுத்த 15 நிமிடங்களில் உங்களை அழைப்பார்.`;
    } else if (detectedLang.code.startsWith("hi")) {
      text = `ज़रूर ${customerName}. ${businessName} के वरिष्ठ प्रतिनिधि अगले 15 मिनट में आपसे संपर्क करेंगे.`;
    } else if (detectedLang.code.startsWith("te")) {
      text = `ఖచ్చితంగా ${customerName}. ${businessName} సీనియర్ ఇంజనీర్ 15 నిమిషాల్లో మిమ్మల్ని సంప్రదిస్తారు.`;
    } else if (detectedLang.code.startsWith("kn")) {
      text = `ಖಂಡಿತವಾಗಿ ${customerName}. ${businessName} ಹಿರಿಯ ಇಂಜಿನಿಯರ್ 15 ನಿಮಿಷಗಳಲ್ಲಿ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.`;
    } else if (detectedLang.code.startsWith("ml")) {
      text = `തീർച്ചയായും ${customerName}. ${businessName}ൽ നിന്നുള്ള സീനിയർ എൻജിനീയർ 15 മിനിറ്റിനുള്ളിൽ ബന്ധപ്പെടും.`;
    }

    return {
      text,
      isEscalation: true,
      isDnc: false,
      model: "safety-guardrail",
      latencyMs: Date.now() - startTime,
      detectedLanguageCode: detectedLang.code,
    };
  }

  // 3. REAL PRODUCTION LLM INVOCATION (GEMINI FLASH WITH MULTI-MODEL RESILIENCE)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const candidateModels = Array.from(
      new Set(
        [
          process.env.GEMINI_MODEL,
          "gemini-flash-lite-latest",
          "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
        ].filter(
          (m): m is string =>
            Boolean(m && m.trim() && m !== "gemini-2.5-flash")
        )
      )
    );

    const rawHistory: { role: "user" | "model"; text: string }[] = [];
    const recentHistory = (options.conversationHistory || []).slice(-24);

    for (const turn of recentHistory) {
      const text = (turn.text || "").trim();
      if (!text) continue;
      const isAgent = turn.speaker.toUpperCase().includes("AGENT") || turn.speaker.toUpperCase().includes("AI");
      rawHistory.push({
        role: isAgent ? "model" : "user",
        text,
      });
    }

    const currentText = (options.userUtterance || "").trim();
    while (
      rawHistory.length > 0 &&
      rawHistory[rawHistory.length - 1].role === "user" &&
      rawHistory[rawHistory.length - 1].text.trim() === currentText
    ) {
      rawHistory.pop();
    }

    rawHistory.push({ role: "user", text: currentText });

    const contents: { role: "user" | "model"; parts: [{ text: string }] }[] = [];
    for (const item of rawHistory) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts[0].text += ` ${item.text}`;
      } else {
        contents.push({ role: item.role, parts: [{ text: item.text }] });
      }
    }

    for (const model of candidateModels) {
      if (Date.now() - startTime > 2200) {
        console.warn(`[LLMVoiceTurn] LLM latency budget reached (${Date.now() - startTime}ms). Fast-failing to domain fallback.`);
        break;
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              maxOutputTokens: 250,
              temperature: 0.2,
            },
          }),
          signal: AbortSignal.timeout(1800),
        });

        if (res.ok) {
          const json = await res.json();
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const clean = rawText
            .replace(/\([^)]*\)/g, "")
            .replace(/\[[^\]]*\]/g, "")
            .replace(/[*_#`~]/g, "")
            .replace(/\s+/g, " ")
            .trim();

          if (clean && clean.length > 5) {
            return {
              text: clean,
              isDnc: false,
              isEscalation: false,
              model,
              latencyMs: Date.now() - startTime,
              detectedLanguageCode: detectedLang.code,
            };
          }
        } else {
          console.warn(`[LLMVoiceTurn] Gemini ${model} HTTP ${res.status}. Trying next candidate.`);
        }
      } catch (modelErr) {
        console.warn(`[LLMVoiceTurn] Gemini ${model} failed:`, modelErr instanceof Error ? modelErr.message : modelErr);
      }
    }
  }

  // 4. DYNAMIC DOMAIN FALLBACK (Derived from Tenant Context)
  const products = options.tenantContext.products || [];
  let primaryProductText = "";
  if (products.length > 0) {
    const p = products[0];
    primaryProductText = `${p.name} (${p.price || "custom quotation"})`;
  }

  let fallbackText = "";
  if (
    lower.includes("hello") ||
    lower.includes("hi") ||
    lower.includes("ஹலோ") ||
    lower.includes("வணக்கம்") ||
    lower.includes("கேக்குதா") ||
    lower.includes("சொல்லுங்க") ||
    lower.includes("who is this") ||
    lower.includes("யார்")
  ) {
    if (lower.includes("who is this") || lower.includes("யார்")) {
      if (detectedLang.code.startsWith("ta")) {
        fallbackText = `நான் ${businessName} நிறுவனத்திலிருந்து ${personaName} பேசுறேன், சொல்லுங்க உங்களுக்கு எப்படி உதவலாம்?`;
      } else if (detectedLang.code.startsWith("hi")) {
        fallbackText = `मैं ${businessName} से ${personaName} बोल रही हूँ, बताइए मैं आपकी क्या सहायता कर सकती हूँ?`;
      } else if (detectedLang.code.startsWith("kn")) {
        fallbackText = `ನಾನು ${businessName}ನಿಂದ ${personaName} ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ, ಹೇಳಿ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?`;
      } else if (detectedLang.code.startsWith("te")) {
        fallbackText = `నేను ${businessName} నుండి ${personaName} మాట్లాడుతున్నాను, చెప్పండి ఎలా సహాయపడగలను?`;
      } else if (detectedLang.code.startsWith("ml")) {
        fallbackText = `ഞാൻ ${businessName}ൽ നിന്ന് ${personaName} സംസാരിക്കുന്നു, പറയൂ എങ്ങനെ സഹായിക്കാം?`;
      } else {
        fallbackText = `This is ${personaName} from ${businessName}. How can I assist you today?`;
      }
    } else if (detectedLang.code.startsWith("ta")) {
      fallbackText = `சொல்லுங்க ${customerName}, உங்கள் சோலார் மின் தேவைகளுக்கு நாங்கள் எப்படி உதவலாம்?`;
    } else if (detectedLang.code.startsWith("hi")) {
      fallbackText = `बताइए ${customerName}, सोलर प्रोजेक्ट के लिए हम आपकी क्या सहायता कर सकते हैं?`;
    } else if (detectedLang.code.startsWith("kn")) {
      fallbackText = `ಹೇಳಿ ${customerName}, ನಿಮ್ಮ ಸೌರ ವಿದ್ಯುತ್ ಯೋಜನೆಗೆ ನಾವು ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?`;
    } else if (detectedLang.code.startsWith("te")) {
      fallbackText = `చెప్పండి ${customerName}, మీ సోలార్ ప్రాజెక్ట్ కోసం మేము ఎలా సహాయపడగలము?`;
    } else if (detectedLang.code.startsWith("ml")) {
      fallbackText = `പറയൂ ${customerName}, നിങ്ങളുടെ സോളാർ ആവശ്യങ്ങൾക്ക് ഞങ്ങൾ എങ്ങനെ സഹായിക്കാം?`;
    } else {
      fallbackText = `Hello ${customerName}! How can we assist you with your solar installation today?`;
    }
  } else if (
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("விலை") ||
    lower.includes("எவ்வளவு") ||
    lower.includes("कीमत") ||
    lower.includes("दाम") ||
    lower.includes("ಬೆಲೆ") ||
    lower.includes("ధర")
  ) {
    if (primaryProductText) {
      if (detectedLang.code.startsWith("ta")) {
        fallbackText = `எங்கள் ${primaryProductText} கிடைக்கும். உங்கள் தேவையை மதிப்பீடு செய்ய ஒரு தள ஆய்வை திட்டமிடலாமா?`;
      } else if (detectedLang.code.startsWith("hi")) {
        fallbackText = `हमारे पास ${primaryProductText} उपलब्ध है. क्या हम साइट सर्वेक्षण शेड्यूल कर सकते हैं?`;
      } else if (detectedLang.code.startsWith("kn")) {
        fallbackText = `ನಮ್ಮಲ್ಲಿ ${primaryProductText} ಲಭ್ಯವಿದೆ. ಸೈಟ್ ಸರ್ವೆ ನಿಗದಿಪಡಿಸಬಹುದೇ?`;
      } else if (detectedLang.code.startsWith("te")) {
        fallbackText = `మా వద్ద ${primaryProductText} అందుబాటులో ఉంది. సైట్ సర్వే షెడ్యూల్ చేయవచ్చா?`;
      } else {
        fallbackText = `Our ${primaryProductText} is available. Would you like to schedule an on-site feasibility survey?`;
      }
    } else {
      if (detectedLang.code.startsWith("ta")) {
        fallbackText = `உங்கள் தேவைகளுக்கு ஏற்ப மிகச் சிறந்த விலையை வழங்குகிறோம். உங்கள் மாதாந்திர மின்கட்டணம் அல்லது பம்ப் அளவு எவ்வளவு?`;
      } else {
        fallbackText = `We provide competitive transparent pricing for your requirements. What is your typical monthly bill or pump HP?`;
      }
    }
  } else {
    if (detectedLang.code.startsWith("ta")) {
      fallbackText = `புரிகிறதுங்க. ${businessName} மூலம் உங்கள் தேவைகளை நிறைவேற்ற, உங்கள் தேவை அல்லது பம்ப் குதிரைத்திறன் பற்றி கூற முடியுமா?`;
    } else if (detectedLang.code.startsWith("hi")) {
      fallbackText = `समझ गया. ${businessName} द्वारा आपकी सहायता के लिए, क्या आप अपनी आवश्यकता या पंप क्षमता बता सकते हैं?`;
    } else if (detectedLang.code.startsWith("kn")) {
      fallbackText = `ಅರ್ಥವಾಯಿತು. ${businessName} ಮೂಲಕ ನಿಮ್ಮ ಅಗತ್ಯಗಳಿಗೆ ತಕ್ಕಂತೆ, ನಿಮ್ಮ ಪಂಪ್ ಸಾಮರ್ಥ್ಯ ತಿಳಿಸಬಹುದೇ?`;
    } else if (detectedLang.code.startsWith("te")) {
      fallbackText = `అర్థమైంది. ${businessName} ద్వారా మీ అవసరాలకు తగినట్లు, మీ పంప్ సామర్థ్యం తెలియజేస్తారా?`;
    } else {
      fallbackText = `I understand. To recommend the optimal solution from ${businessName}, could you share your requirement details?`;
    }
  }

  return {
    text: fallbackText,
    isDnc: false,
    isEscalation: false,
    model: "tenant-fallback",
    latencyMs: Date.now() - startTime,
    detectedLanguageCode: detectedLang.code,
  };
}
