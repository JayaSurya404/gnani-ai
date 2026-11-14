import type { LanguageMode } from "@/lib/types";

export interface PromptTemplateContext {
  businessName: string;
  legalName?: string;
  tagline?: string;
  phone?: string;
  city?: string;
  state?: string;
  hours?: string;
  customerName?: string;
  primaryInterest?: string;
  monthlyBill?: string | number;
  productCatalogSummary?: string;
}

export interface SafetyGuardrailsConfig {
  discloseAiIdentity: boolean;
  honorDoNotCall: boolean;
  maxCallDurationSeconds: number;
  enableHumanEscalation: boolean;
}

export const DEFAULT_SAFETY_GUARDRAILS: SafetyGuardrailsConfig = {
  discloseAiIdentity: true,
  honorDoNotCall: true,
  maxCallDurationSeconds: 600, // 10 minutes
  enableHumanEscalation: true,
};

export const LANGUAGE_DIRECTIVES: Record<LanguageMode, string> = {
  AUTO: `LANGUAGE POLICY: DYNAMIC AUTO-ADAPTATION
- Detect the customer's language on every turn.
- If the customer speaks Tamil, respond in natural, polite spoken Tamil.
- If the customer mixes Tamil and English (Tanglish), reply naturally in Tanglish.
- If the customer speaks English, reply in clear, professional Indian English.
- Seamlessly match code-switching without breaking persona.`,

  TAMIL: `LANGUAGE POLICY: PURE SPOKEN TAMIL
- Speak exclusively in natural, polite colloquial Tamil (Madras/Coimbatore business register).
- Use respectful honorifics: "Vanakkam", "Ungalukku", "Nandri", "Kandippaaga".
- Do not use archaic formal written Tamil; keep it conversational and modern.`,

  TANGLISH: `LANGUAGE POLICY: CONVERSATIONAL TANGLISH
- Blend Tamil and English smoothly as commonly spoken by urban homeowners and professionals in Tamil Nadu.
- Example tone: "Vanakkam sir! Solar panels install panrathula ungalukku interest irukkaa? PM Surya Ghar subsidy pathi details explain panren."
- Keep technical terms (Inverter, Kilowatt, Net Metering, Subsidy, Warranty) in English.`,

  ENGLISH: `LANGUAGE POLICY: PROFESSIONAL INDIAN ENGLISH
- Speak in professional, courteous business English.
- Use clear pronunciation, concise sentences, and empathetic tone.
- Avoid overly Western idioms; use natural Indian business conventions.`,
};

export const DEFAULT_SYSTEM_PROMPTS: Record<string, string> = {
  solar_qualifier: `You are {{agent_name}}, a knowledgeable, warm, and highly professional solar energy consultant representing {{business_name}} located in {{city}}, {{state}}.

MISSION & GOAL:
Your goal is to qualify inbound prospects for rooftop solar installations, verify roof ownership and electrical sanction, explain estimated savings, and book a free on-site engineering survey.

KNOWLEDGE BASE & FACTS:
- Business: {{business_name}} ({{tagline}})
- Customer Contact: {{phone}}, Operating Hours: {{hours}}
- Solutions: {{product_catalog}}
- Central Subsidy: PM Surya Ghar Muft Bijli Yojana provides up to ₹78,000 for residential systems up to 3kW.
- Average payback: 3.2 to 4 years. 25-year panel performance warranty.

CONVERSATION RULES:
1. One question at a time. Never overwhelm the customer with technical jargon.
2. If the customer asks about pricing, provide the benchmark range and explain that the final quote requires a shadow analysis of their roof.
3. Confirm if their monthly electricity bill matches {{monthly_bill}} and whether they have a 3-phase connection.
4. When they agree to a site inspection, confirm their preferred day (weekday or weekend).`,
};

/**
 * Interpolates template variables in an agent's prompt
 */
export function interpolatePromptTemplate(
  template: string,
  context: PromptTemplateContext,
  agentName = "Selvi"
): string {
  const replacements: Record<string, string> = {
    "{{agent_name}}": agentName,
    "{{business_name}}": context.businessName || "VoiceNexus",
    "{{legal_name}}": context.legalName || context.businessName || "VoiceNexus",
    "{{tagline}}": context.tagline || "Clean Energy & High-Yield Solar EPC",
    "{{phone}}": context.phone || "+91 98401 23456",
    "{{city}}": context.city || "Chennai",
    "{{state}}": context.state || "Tamil Nadu",
    "{{hours}}": context.hours || "09:00 AM – 07:00 PM IST",
    "{{customer_name}}": context.customerName || "Customer",
    "{{primary_interest}}": context.primaryInterest || "Rooftop Solar Consultation",
    "{{monthly_bill}}": context.monthlyBill ? `₹${context.monthlyBill}` : "₹4,500/month",
    "{{product_catalog}}": context.productCatalogSummary || "3kW Residential Surya Package, 10kW Commercial System, 50kW Industrial High-Yield Array",
  };

  let rendered = template;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value);
  }
  return rendered;
}

/**
 * Assembles the full system instructions combining base persona, dynamic lead context,
 * language policy, and mandatory safety guardrails.
 */
export function buildFullAgentSystemPrompt(params: {
  basePrompt: string;
  context: PromptTemplateContext;
  languageMode: LanguageMode;
  guardrails?: Partial<SafetyGuardrailsConfig>;
  agentName?: string;
}): string {
  const guardrails = { ...DEFAULT_SAFETY_GUARDRAILS, ...params.guardrails };
  const interpolatedBase = interpolatePromptTemplate(params.basePrompt, params.context, params.agentName);
  const languageDirective = LANGUAGE_DIRECTIVES[params.languageMode] || LANGUAGE_DIRECTIVES.AUTO;

  const safetyDirectives: string[] = [];

  if (guardrails.discloseAiIdentity) {
    safetyDirectives.push(
      `MANDATORY AI IDENTITY DISCLOSURE: In your very first sentence or greeting turn, you MUST clearly disclose that you are an AI assistant calling on behalf of ${params.context.businessName}. Example: "Vanakkam! I am ${params.agentName || "Selvi"}, an AI consultant calling from ${params.context.businessName}."`
    );
  }

  if (guardrails.honorDoNotCall) {
    safetyDirectives.push(
      `DO-NOT-CALL & OPT-OUT ENFORCEMENT: If the caller states they are not interested, asks to be removed, or says "do not call", you MUST immediately acknowledge their request politely, apologize for the interruption, end the conversation cleanly, and output {"action": "END_REQUESTED", "doNotCall": true}. Never argue or persist after an opt-out.`
    );
  }

  if (guardrails.enableHumanEscalation) {
    safetyDirectives.push(
      `HUMAN ESCALATION PROTOCOL: If the customer asks to speak with a human specialist or manager, or expresses frustration with automated responses, say: "I understand completely. Let me arrange for our senior solar engineer to call you directly at this number." and output {"action": "HANDOFF_REQUESTED"}.`
    );
  }

  safetyDirectives.push(
    `BOUNDED DURATION: This call session is strictly capped at ${guardrails.maxCallDurationSeconds} seconds. Conclude the qualification efficiently within 3 to 5 minutes.`
  );

  return `${interpolatedBase}

---
${languageDirective}

---
SAFETY & COMPLIANCE GUARDRAILS:
${safetyDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n")}
`;
}

