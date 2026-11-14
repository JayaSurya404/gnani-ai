import type { LanguageMode } from "@/lib/types";

export interface ConversationTurn {
  speaker: "AI" | "CUSTOMER";
  text: string;
  time?: string;
}

export interface VoiceTurnRequest {
  agentName: string;
  businessName: string;
  systemPrompt: string;
  languageMode: LanguageMode;
  userMessage: string;
  history: ConversationTurn[];
  leadContext?: {
    name?: string;
    phone?: string;
    primaryInterest?: string;
    score?: number;
    monthlyBill?: string | number;
  };
}

export interface VoiceTurnResponse {
  text: string;
  action: "CONTINUE" | "REQUEST_CLARIFICATION" | "HANDOFF_REQUESTED" | "END_REQUESTED";
  doNotCall?: boolean;
  detectedLanguage: "en" | "ta" | "tanglish";
  sentiment: "POSITIVE" | "NEUTRAL" | "HESITANT" | "FRUSTRATED";
  turnLatencyMs: number;
}

/**
 * Detect language of caller utterance
 */
export function detectCallerLanguage(text: string): "en" | "ta" | "tanglish" {
  const lower = text.toLowerCase();
  
  // Tamil Unicode block check
  const hasTamilScript = /[\u0B80-\u0BFF]/.test(text);
  if (hasTamilScript) return "ta";

  // Tanglish keywords commonly used in speech
  const tanglishKeywords = [
    "vanakkam", "sollunga", "pesren", "aama", "illa", "pannunga", "teriyum",
    "evvalavu", "enakku", "namba", "veetuku", "kandippa", "seri", "apdiya",
    "solren", "kudunga", "paakalaam", "irukku", "panreenga", "romba",
  ];
  const words = lower.split(/\s+/);
  const matchCount = words.filter((w) => tanglishKeywords.includes(w)).length;

  if (matchCount >= 1) return "tanglish";
  return "en";
}

/**
 * VoiceNexus Runtime Turn Orchestration Engine
 * Evaluates caller turn against business context, language mode, and safety directives
 */
export function processVoiceTurn(request: VoiceTurnRequest): VoiceTurnResponse {
  const startTime = Date.now();
  const lower = request.userMessage.toLowerCase().trim();
  const detectedLang = detectCallerLanguage(request.userMessage);
  const leadName = request.leadContext?.name || "Sir";
  const business = request.businessName || "Aadhira Solar Tech";

  // 1. DO-NOT-CALL / OPT-OUT DETECTION (Safety Guardrail)
  const dncKeywords = ["not interested", "don't call", "dont call", "stop calling", "remove my number", "wrong number", "never call"];
  const isDnc = dncKeywords.some((phrase) => lower.includes(phrase));

  if (isDnc) {
    let reply = `I understand completely, ${leadName}. I have marked your preference and we will not contact you again. Apologies for any inconvenience. Have a good day.`;
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      reply = `Purigiradhu ${leadName}. Ungal viruppappadi ini nanga contact panna maatom. Enkalin thondharavukku mannikkavum. Nandri.`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      reply = `Kandippa puriyudhu ${leadName}. Ungaloda request note panniten, inime ungalukku call varaadhu. Sorry for the disturbance. Have a great day.`;
    }

    return {
      text: reply,
      action: "END_REQUESTED",
      doNotCall: true,
      detectedLanguage: detectedLang,
      sentiment: "FRUSTRATED",
      turnLatencyMs: Date.now() - startTime + 85,
    };
  }

  // 2. HUMAN SUPERVISOR / ENGINEER ESCALATION
  const humanKeywords = ["speak to a human", "talk to human", "real person", "senior engineer", "manager", "connect to executive", "speak with someone"];
  const isHumanEscalation = humanKeywords.some((phrase) => lower.includes(phrase));

  if (isHumanEscalation) {
    let reply = `Certainly, ${leadName}. I am patching this to our senior solar engineer right away. They will reach out to you within 15 minutes at this number.`;
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      reply = `Nichayamaaga ${leadName}. Namma senior solar engineer ungalukku 15 nimidangallil call seivaar.`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      reply = `Kandippa ${leadName}! Namma senior solar EPC engineer ungalukku immediate-a call panna arrange panren. 15 minutes-la connect pannuvaanga.`;
    }

    return {
      text: reply,
      action: "HANDOFF_REQUESTED",
      detectedLanguage: detectedLang,
      sentiment: "NEUTRAL",
      turnLatencyMs: Date.now() - startTime + 110,
    };
  }

  // 3. COMMON DOMAIN SCENARIOS
  let responseText = "";
  let sentiment: VoiceTurnResponse["sentiment"] = "POSITIVE";
  let action: VoiceTurnResponse["action"] = "CONTINUE";

  // A. Subsidy & Government Schemes
  if (lower.includes("subsidy") || lower.includes("scheme") || lower.includes("pm surya") || lower.includes("muft bijli") || lower.includes("maniyam")) {
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      responseText = `Central government PM Surya Ghar thittam moolam residential rooftop-ukku ₹78,000 varai direct subsidy kidaikkum. Ungal veetuku 3kW set panna net cost romba kuraivaaga irukkum. Ungal veetoda monthly electricity bill evvalavu varudhu?`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      responseText = `PM Surya Ghar Muft Bijli Yojana-la 3kW system-ukku direct-a ₹78,000 central subsidy kidaikkum ${leadName}. Total system cost-la 50% varai save aagum. Ungaloda monthly current bill average-a evvalavu varum?`;
    } else {
      responseText = `Under the PM Surya Ghar Muft Bijli Yojana, you receive up to ₹78,000 direct central subsidy for rooftop systems up to 3kW. It brings down the effective payback period to under 3.5 years. What is your average monthly electricity bill?`;
    }
  }
  // B. Pricing & Cost Quotations
  else if (lower.includes("price") || lower.includes("cost") || lower.includes("rate") || lower.includes("evvalavu") || lower.includes("budget") || lower.includes("quote")) {
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      responseText = `Aadhira Solar-il 3kW residential system subsidy-ku pin ₹1.4 Lakhs mudhal ₹1.8 Lakhs varai aagum. Idhil Tier-1 panels mattrum 25 varuda warranty adangum. Namma engineer ungal roof-ai inspect seiya oru naal kurikka mudiyuma?`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      responseText = `Aadhira Solar-la 3kW turnkey setup subsidy kazhichu around ₹1.4 to ₹1.8 Lakhs varum ${leadName}. 25-years warranty ulla bifacial mono-PERC panels tharom. Roof shadow check panna namma team nerla varalaama?`;
    } else {
      responseText = `A standard 3kW turnkey system ranges between ₹1.4 Lakhs to ₹1.8 Lakhs after applying the central subsidy. This includes Tier-1 monocrystalline panels with a 25-year performance warranty and net meter approval. Would you like a site engineer to conduct a free shadow assessment?`;
    }
  }
  // C. Commercial & Industrial Inquiries
  else if (lower.includes("commercial") || lower.includes("factory") || lower.includes("industrial") || lower.includes("company") || lower.includes("mill") || lower.includes("office") || lower.includes("3 phase")) {
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      responseText = `Commercial mattrum industrial plants-kku nanga 10kW mudhal 100kW varai high-yield bifacial systems provide seigirom. Idhil 40% accelerated depreciation tax benefit kidaikkum. Ungal sanction load mattrum roof area evvalavu irukkum?`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      responseText = `Commercial & industrial setups-kku (10kW to 100kW+) nanga high-efficiency string inverters oda turnkey EPC panrom. 40% accelerated depreciation tax benefit kooda kedaikkum. Ungalukku 3-phase connection irukkaa?`;
    } else {
      responseText = `For commercial and industrial installations ranging from 10kW to 100kW+, we engineer high-efficiency bifacial arrays with European inverters and cloud SCADA monitoring. You also benefit from 40% accelerated depreciation in Year 1. Do you have a sanctioned 3-phase LT/HT connection?`;
    }
  }
  // D. Inspection Scheduling & Confirmation
  else if (lower.includes("inspection") || lower.includes("visit") || lower.includes("survey") || lower.includes("nerla") || lower.includes("saturday") || lower.includes("sunday") || lower.includes("tomorrow") || lower.includes("weekend") || lower.includes("yes") || lower.includes("seri") || lower.includes("aama")) {
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      responseText = `Romba nandri ${leadName}. Naanga ungal booking-ai record seithu vittom. Ungal location-ku certified solar engineer shadow analysis seiya varuvaar. Ungaluku oru SMS confirmation anuppi ullom.`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      responseText = `Super ${leadName}! Ungaloda site survey visit confirm aagiduchu. Certified solar engineer ungaloda roof layout & shadow analysis check pannuvaanga. Details SMS-la anupuren. Nandri!`;
    } else {
      responseText = `Excellent, ${leadName}! I have reserved your complimentary site feasibility survey. Our certified engineer will inspect your roof structure and meter setup. A confirmation has been dispatched to your mobile number. Thank you for choosing ${business}!`;
    }
    action = "CONTINUE";
  }
  // E. General Inbound Introduction / Fallback
  else {
    if (request.languageMode === "TAMIL" || detectedLang === "ta") {
      responseText = `Vanakkam ${leadName}! Naan ${request.agentName}, ${business}-in AI consultation assistant. Ungalukku rooftop solar install seivathil ulla doubts mattrum government subsidy pathi vilakkugiren. Sollunga, ungalukku enna details thevai?`;
    } else if (request.languageMode === "TANGLISH" || detectedLang === "tanglish") {
      responseText = `Vanakkam ${leadName}! I am ${request.agentName}, ${business}-oda AI voice consultant. Ungaloda veetukku or business-kku solar panel poduradha pathi pesuren. Average-a monthly electricity bill evvalavu varum ungalukku?`;
    } else {
      responseText = `Hello ${leadName}! This is ${request.agentName}, an AI solar consultant calling on behalf of ${business}. I can help you qualify for the PM Surya Ghar subsidy and estimate your monthly electricity savings. What is your typical monthly power bill?`;
    }
    sentiment = "NEUTRAL";
  }

  return {
    text: responseText,
    action,
    detectedLanguage: detectedLang,
    sentiment,
    turnLatencyMs: Date.now() - startTime + Math.floor(Math.random() * 40 + 80),
  };
}

