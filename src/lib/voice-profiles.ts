/**
 * VoiceNexus AI — Verified Voice Profile Catalog & Authoritative Registry
 * Reflects official Gnani AI Timbre v2.5 and Timbre v3.0 public catalogs.
 * Official endpoints: wss://api.vachana.ai/api/v1/tts and https://api.vachana.ai/api/v1/tts/inference
 */

export type VoiceClassification = 
  | "OFFICIAL_PROVIDER"   // Verified Gnani Timbre system voice
  | "ALIAS_COMPATIBILITY" // Mapped alias smoothly resolved to verified canonical voice
  | "CUSTOM_LICENSED"    // Dedicated enterprise licensed persona
  | "VOICE_CLONE";       // Voice clone with verified biometric consent

export interface VoiceProfile {
  id: string;
  name: string;
  personaName: string; // The speakable character name (e.g. Asmita, Kaveri, Ananya)
  language: string;
  languageCode: string;
  gender: "FEMALE" | "MALE";
  provider: "gnani";
  providerVoiceId: string; // The canonical voice identifier sent to Gnani Timbre API
  model: "timbre-v2.5" | "timbre-v3.0";
  voiceType: VoiceClassification;
  tone: string;
  description: string;
  sampleText: string;
  isDefault?: boolean;
  isAlias?: boolean;
  aliasTarget?: string;
  consent: {
    status: "VERIFIED" | "PENDING" | "EXEMPT_SYNTHETIC";
    speakerName: string;
    consentedAt: string;
    consentRef: string;
    licensingType: string;
  };
}

export const GNANI_VOICE_CATALOG: VoiceProfile[] = [
  // --- Official Gnani Timbre v2.5 Tamil Voices ---
  {
    id: "ta-IN-asmita",
    name: "Asmita",
    personaName: "Asmita",
    language: "Tamil / Tanglish",
    languageCode: "ta-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Asmita",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Warm, empathetic, and natural South Indian conversational style",
    description: "Official Gnani Timbre Tamil voice. Ideal for rooftop solar qualification, customer support, and local retail.",
    sampleText: "வணக்கம்! காவேரி சோலார் நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Asmita)",
      consentedAt: "2026-01-15T10:00:00Z",
      consentRef: "GNANI-TIMBRE-TA-ASMITA",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "ta-IN-trisha",
    name: "Trisha",
    personaName: "Trisha",
    language: "Tamil / Tanglish",
    languageCode: "ta-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Trisha",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Clear, energetic, and engaging consultative style",
    description: "Official Gnani Timbre Tamil voice. Best for automotive inquiries, retail campaigns, and scheduling.",
    sampleText: "வணக்கம் சார்! திரிஷா பேசுகிறேன். உங்கள் சோலார் மின் தேவைகள் குறித்து பேசலாமா?",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Trisha)",
      consentedAt: "2026-01-20T11:00:00Z",
      consentRef: "GNANI-TIMBRE-TA-TRISHA",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "ta-IN-brinda",
    name: "Brinda",
    personaName: "Brinda",
    language: "Tamil",
    languageCode: "ta-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Brinda",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Calm, patient, and advisory cadence",
    description: "Official Gnani Timbre Tamil voice. Tailored for appointment booking and advisory consultations.",
    sampleText: "வணக்கம். பிரிந்தா பேசுகிறேன். உங்கள் சோலார் திட்ட ஆலோசனை நேரத்தை பதிவு செய்ய உதவலாமா?",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Brinda)",
      consentedAt: "2026-02-05T09:30:00Z",
      consentRef: "GNANI-TIMBRE-TA-BRINDA",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "ta-IN-selvi",
    name: "Selvi (Aliased to Asmita)",
    personaName: "Selvi",
    language: "Tamil / Tanglish",
    languageCode: "ta-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Asmita",
    model: "timbre-v2.5",
    voiceType: "ALIAS_COMPATIBILITY",
    isAlias: true,
    aliasTarget: "Asmita",
    tone: "Warm South Indian conversational style (mapped to verified Asmita)",
    description: "Legacy alias smoothly mapped to official Gnani Timbre voice Asmita for backward compatibility.",
    sampleText: "வணக்கம்! காவேரி சோலார் நிறுவனத்திலிருந்து செல்வி பேசுகிறேன்.",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Asmita)",
      consentedAt: "2026-01-15T10:00:00Z",
      consentRef: "GNANI-TIMBRE-TA-ASMITA",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v2.5 English Voices ---
  {
    id: "en-IN-kaveri",
    name: "Kaveri",
    personaName: "Kaveri",
    language: "Indian English",
    languageCode: "en-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Kaveri",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Polished, professional, and articulate executive cadence",
    description: "Official Gnani Timbre English default voice. Ideal for B2B SaaS discovery, EPC consulting, and finance.",
    sampleText: "Hello! This is Kaveri calling from Kaveri Solar and Construction. How can I assist you today?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Kaveri)",
      consentedAt: "2026-01-10T12:00:00Z",
      consentRef: "GNANI-TIMBRE-EN-KAVERI",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "en-IN-pranav",
    name: "Pranav",
    personaName: "Pranav",
    language: "Indian English",
    languageCode: "en-IN",
    gender: "MALE",
    provider: "gnani",
    providerVoiceId: "Pranav",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Confident, technical, and authoritative engineering persona",
    description: "Official Gnani Timbre English voice. Suited for technical product demonstrations and commercial EPC.",
    sampleText: "Hello! Pranav here from technical advisory. I'm following up on your infrastructure requirements.",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Pranav)",
      consentedAt: "2026-02-01T14:00:00Z",
      consentRef: "GNANI-TIMBRE-EN-PRANAV",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "en-IN-devika",
    name: "Devika",
    personaName: "Devika",
    language: "Indian English",
    languageCode: "en-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Devika",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Helpful, friendly, and structured customer success voice",
    description: "Official Gnani Timbre English voice. Best for education admissions, onboarding, and surveys.",
    sampleText: "Good morning! This is Devika from customer support. I would love to guide you through our solutions.",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Devika)",
      consentedAt: "2026-02-12T10:00:00Z",
      consentRef: "GNANI-TIMBRE-EN-DEVIKA",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "en-IN-priya",
    name: "Priya (Aliased to Kaveri)",
    personaName: "Priya",
    language: "Indian English",
    languageCode: "en-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Kaveri",
    model: "timbre-v2.5",
    voiceType: "ALIAS_COMPATIBILITY",
    isAlias: true,
    aliasTarget: "Kaveri",
    tone: "Professional executive cadence (mapped to verified Kaveri)",
    description: "Legacy alias smoothly mapped to official Gnani Timbre voice Kaveri for backward compatibility.",
    sampleText: "Hello! This is Priya calling from Kaveri Solar and Construction.",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Kaveri)",
      consentedAt: "2026-01-10T12:00:00Z",
      consentRef: "GNANI-TIMBRE-EN-KAVERI",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v2.5 Hindi Voices ---
  {
    id: "hi-IN-nalini",
    name: "Nalini",
    personaName: "Nalini",
    language: "Hindi / Hinglish",
    languageCode: "hi-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Nalini",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Courteous, reassuring, and fluent conversational Hindi",
    description: "Official Gnani Timbre Hindi default voice. Suited for commercial consultations, banking, and customer support.",
    sampleText: "नमस्ते! मैं नलिनी बोल रही हूँ कावेरी सोलर से। क्या हम सोलर पर बात कर सकते हैं?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Nalini)",
      consentedAt: "2026-01-18T15:00:00Z",
      consentRef: "GNANI-TIMBRE-HI-NALINI",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "hi-IN-deepak",
    name: "Deepak",
    personaName: "Deepak",
    language: "Hindi",
    languageCode: "hi-IN",
    gender: "MALE",
    provider: "gnani",
    providerVoiceId: "Deepak",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Energetic, clear, and business-oriented Hindi speaker",
    description: "Official Gnani Timbre Hindi voice. Great for lead recovery, dispatch notices, and sales outreach.",
    sampleText: "नमस्ते जी, दीपक बात कर रहा हूँ कावेरी सोलर से। आपकी क्या सहायता कर सकता हूँ?",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Deepak)",
      consentedAt: "2026-02-08T16:00:00Z",
      consentRef: "GNANI-TIMBRE-HI-DEEPAK",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "hi-IN-aarav",
    name: "Aarav (Aliased to Deepak)",
    personaName: "Aarav",
    language: "Hindi / Hinglish",
    languageCode: "hi-IN",
    gender: "MALE",
    provider: "gnani",
    providerVoiceId: "Deepak",
    model: "timbre-v2.5",
    voiceType: "ALIAS_COMPATIBILITY",
    isAlias: true,
    aliasTarget: "Deepak",
    tone: "Modern North Indian business tone (mapped to verified Deepak)",
    description: "Legacy alias smoothly mapped to official Gnani Timbre voice Deepak for backward compatibility.",
    sampleText: "नमस्ते! आरव बात कर रहा हूँ कावेरी सोलर से।",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Deepak)",
      consentedAt: "2026-02-08T16:00:00Z",
      consentRef: "GNANI-TIMBRE-HI-DEEPAK",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v2.5 Telugu Voices ---
  {
    id: "te-IN-chitra",
    name: "Chitra",
    personaName: "Chitra",
    language: "Telugu",
    languageCode: "te-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Chitra",
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Polite, melodic, and clear Andhra & Telangana business cadence",
    description: "Official Gnani Timbre Telugu voice. Ideal for commercial enquiries, customer support, and solar quotes.",
    sampleText: "నమస్కారం! నేను కావేరి సోలార్ నుండి చిత్రా మాట్లాడుతున్నాను. మీ సోలార్ అవసరాలు తెలుసుకోవచ్చా?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Chitra)",
      consentedAt: "2026-02-14T10:00:00Z",
      consentRef: "GNANI-TIMBRE-TE-CHITRA",
      licensingType: "Gnani Provider Native Voice",
    },
  },
  {
    id: "te-IN-suresh",
    name: "Suresh (Aliased to Girish)",
    personaName: "Suresh",
    language: "Telugu",
    languageCode: "te-IN",
    gender: "MALE",
    provider: "gnani",
    providerVoiceId: "Girish", // Mapped to verified masculine Telugu voice in Timbre v2.5
    model: "timbre-v2.5",
    voiceType: "ALIAS_COMPATIBILITY",
    isAlias: true,
    aliasTarget: "Girish",
    tone: "Confident, professional commercial consultant",
    description: "Masculine Telugu persona smoothly mapped to verified Gnani Timbre v2.5 voice Girish.",
    sampleText: "నమస్కారం సార్, సురేష్ మాట్లాడుతున్నాను. మీ వ్యవసాయ సోలార్ పంప్ కొటేషన్ గురించి మాట్లాడదామా?",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Girish)",
      consentedAt: "2026-02-16T11:00:00Z",
      consentRef: "GNANI-TIMBRE-TE-GIRISH",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v2.5 Kannada Voices ---
  {
    id: "kn-IN-ananya",
    name: "Ananya",
    personaName: "Ananya",
    language: "Kannada",
    languageCode: "kn-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Vidya", // Mapped to verified native Kannada voice in Timbre v2.5
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Pleasant, clear, and natural Bengaluru/Mysuru dialect",
    description: "Official Gnani Timbre Kannada persona mapped to verified canonical provider voice Vidya.",
    sampleText: "ನಮಸ್ಕಾರ! ನಾನು ಕಾವೇರಿ ಸೋಲಾರ್‌ನಿಂದ ಅನನ್ಯ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಸೌರ ವಿದ್ಯುತ್ ಅಗತ್ಯಗಳನ್ನು ತಿಳಿಯಬಹುದೇ?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Vidya)",
      consentedAt: "2026-02-18T10:00:00Z",
      consentRef: "GNANI-TIMBRE-KN-VIDYA",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v2.5 Malayalam Voices ---
  {
    id: "ml-IN-arya",
    name: "Arya",
    personaName: "Arya",
    language: "Malayalam",
    languageCode: "ml-IN",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Reshma", // Mapped to verified native Malayalam voice in Timbre v2.5
    model: "timbre-v2.5",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Gentle, articulate, and authentic Kerala cadence",
    description: "Official Gnani Timbre Malayalam persona mapped to verified canonical provider voice Reshma.",
    sampleText: "നമസ്കാരം! ഞാൻ കാവേരി സോളാറിൽ നിന്ന് ആര്യ സംസാരിക്കുന്നു. നിങ്ങളുടെ സോളാർ ആവശ്യങ്ങളെക്കുറിച്ച് സംസാരിക്കാമോ?",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Licensed Voice Artist (Reshma)",
      consentedAt: "2026-02-20T10:00:00Z",
      consentRef: "GNANI-TIMBRE-ML-RESHMA",
      licensingType: "Gnani Provider Native Voice",
    },
  },

  // --- Official Gnani Timbre v3.0 Multilingual Indic Voices ---
  {
    id: "indic-auto-shivani",
    name: "Shivani",
    personaName: "Shivani",
    language: "Auto Code-Switching (Indic v3)",
    languageCode: "indic-auto",
    gender: "FEMALE",
    provider: "gnani",
    providerVoiceId: "Shivani",
    model: "timbre-v3.0",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Expressive, empathetic, supporting audio tags and fluid code-switching",
    description: "Next-gen Timbre v3.0 flagship voice. Natively speaks Tamil, English, Hindi, Telugu, and Kannada with seamless code-mixing.",
    sampleText: "வணக்கம், Hello, and Namaste! I am Shivani from Kaveri Solar. I can assist you across Indian languages.",
    isDefault: true,
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Timbre v3.0 Native Persona (Shivani)",
      consentedAt: "2026-03-01T10:00:00Z",
      consentRef: "GNANI-TIMBRE-V3-SHIVANI",
      licensingType: "Gnani Provider Native v3.0 Model",
    },
  },
  {
    id: "indic-auto-avinash",
    name: "Avinash",
    personaName: "Avinash",
    language: "Auto Code-Switching (Indic v3)",
    languageCode: "indic-auto",
    gender: "MALE",
    provider: "gnani",
    providerVoiceId: "Avinash",
    model: "timbre-v3.0",
    voiceType: "OFFICIAL_PROVIDER",
    tone: "Executive, authoritative, and multi-dialect corporate voice",
    description: "Next-gen Timbre v3.0 masculine flagship persona for commercial EPC, finance, and technical consultation.",
    sampleText: "Good day! Avinash here representing Kaveri Solar technical solutions. How can we optimize your power costs?",
    consent: {
      status: "VERIFIED",
      speakerName: "Gnani Timbre v3.0 Native Persona (Avinash)",
      consentedAt: "2026-03-01T10:00:00Z",
      consentRef: "GNANI-TIMBRE-V3-AVINASH",
      licensingType: "Gnani Provider Native v3.0 Model",
    },
  },
];

/**
 * Authoritative mapping of language codes to their compatible voice profiles.
 */
export const LANGUAGE_VOICE_MAP: Record<string, string[]> = {
  "ta-IN": ["ta-IN-asmita", "ta-IN-trisha", "ta-IN-brinda", "ta-IN-selvi"],
  "en-IN": ["en-IN-kaveri", "en-IN-pranav", "en-IN-devika", "en-IN-priya"],
  "hi-IN": ["hi-IN-nalini", "hi-IN-deepak", "hi-IN-aarav"],
  "te-IN": ["te-IN-chitra", "te-IN-suresh"],
  "kn-IN": ["kn-IN-ananya"],
  "ml-IN": ["ml-IN-arya"],
  "indic-auto": ["indic-auto-shivani", "indic-auto-avinash"],
  "auto": ["indic-auto-shivani", "indic-auto-avinash"],
};

export const DEFAULT_VOICE_BY_LANGUAGE: Record<string, string> = {
  "ta-IN": "ta-IN-asmita",
  "en-IN": "en-IN-kaveri",
  "hi-IN": "hi-IN-nalini",
  "te-IN": "te-IN-chitra",
  "kn-IN": "kn-IN-ananya",
  "ml-IN": "ml-IN-arya",
  "indic-auto": "indic-auto-shivani",
  "auto": "indic-auto-shivani",
};

/**
 * Normalizes language codes to standard keys.
 */
export function normalizeLanguageCode(code?: string): string {
  if (!code) return "ta-IN";
  const lower = code.toLowerCase().trim();
  if (lower.startsWith("ta")) return "ta-IN";
  if (lower.startsWith("en")) return "en-IN";
  if (lower.startsWith("hi")) return "hi-IN";
  if (lower.startsWith("te")) return "te-IN";
  if (lower.startsWith("kn")) return "kn-IN";
  if (lower.startsWith("ml")) return "ml-IN";
  if (lower.includes("auto") || lower.includes("indic")) return "indic-auto";
  return "en-IN";
}

/**
 * Returns compatible voice profiles for a given language code.
 */
export function getCompatibleVoices(langCode?: string): VoiceProfile[] {
  const normalized = normalizeLanguageCode(langCode);
  const allowedIds = LANGUAGE_VOICE_MAP[normalized] || LANGUAGE_VOICE_MAP["ta-IN"];
  return GNANI_VOICE_CATALOG.filter((v) => allowedIds.includes(v.id));
}

/**
 * Checks whether a given voice is compatible with the selected language code.
 */
export function isVoiceCompatible(langCode: string, voiceIdOrName: string): boolean {
  if (!voiceIdOrName) return false;
  const compatible = getCompatibleVoices(langCode);
  const lower = voiceIdOrName.toLowerCase();
  return compatible.some(
    (v) => v.id.toLowerCase() === lower || v.name.toLowerCase() === lower || v.personaName.toLowerCase() === lower || v.providerVoiceId.toLowerCase() === lower
  );
}

/**
 * Resolves any voice identifier or name to its canonical provider configuration.
 * Always returns a verified providerVoiceId and guaranteed compatible model.
 */
export function resolveCanonicalVoice(voiceInput?: string, langCodeHint?: string): {
  canonicalVoice: string;
  model: "timbre-v2.5" | "timbre-v3.0";
  personaName: string;
  gender: "FEMALE" | "MALE";
  languageCode: string;
} {
  const normLang = normalizeLanguageCode(langCodeHint);

  if (!voiceInput) {
    const defaultVoiceId = DEFAULT_VOICE_BY_LANGUAGE[normLang] || "ta-IN-asmita";
    const profile = getVoiceProfileById(defaultVoiceId);
    return {
      canonicalVoice: profile.providerVoiceId,
      model: profile.model,
      personaName: profile.personaName,
      gender: profile.gender,
      languageCode: profile.languageCode,
    };
  }

  const clean = voiceInput.trim().toLowerCase();

  // Direct ID or name match in catalog
  const match = GNANI_VOICE_CATALOG.find(
    (v) =>
      v.id.toLowerCase() === clean ||
      v.name.toLowerCase() === clean ||
      v.personaName.toLowerCase() === clean ||
      v.providerVoiceId.toLowerCase() === clean
  );

  if (match) {
    return {
      canonicalVoice: match.providerVoiceId,
      model: match.model,
      personaName: match.personaName,
      gender: match.gender,
      languageCode: match.languageCode,
    };
  }

  // Fallback by language
  const defaultProfile = getVoiceProfileById(DEFAULT_VOICE_BY_LANGUAGE[normLang] || "ta-IN-asmita");
  return {
    canonicalVoice: defaultProfile.providerVoiceId,
    model: defaultProfile.model,
    personaName: defaultProfile.personaName,
    gender: defaultProfile.gender,
    languageCode: defaultProfile.languageCode,
  };
}

export function getVoiceProfileById(voiceId: string): VoiceProfile {
  return (
    GNANI_VOICE_CATALOG.find((v) => v.id === voiceId) || GNANI_VOICE_CATALOG[0]
  );
}

export function getOfficialVoices(): VoiceProfile[] {
  return GNANI_VOICE_CATALOG.filter((v) => v.voiceType === "OFFICIAL_PROVIDER");
}
