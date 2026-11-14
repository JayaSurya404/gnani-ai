export interface PromptSections {
  systemInstructions: string;
  businessContext: string;
  agentPersonality: string;
  conversationObjectives: string[];
  languageInstructions: string;
  qualificationRules: string[];
  objectionHandling: Array<{ objection: string; response: string }>;
  safetyBoundaries: string[];
  humanHandoffInstructions: string;
  conversationClosing: string;
}

export interface PromptValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedVariables: string[];
  wordCount: number;
}

export const VALID_PLACEHOLDERS = [
  "{{business_name}}",
  "{{customer_name}}",
  "{{business_industry}}",
  "{{customer_interest}}",
  "{{preferred_language}}",
  "{{appointment_time}}",
  "{{phone}}",
  "{{city}}",
  "{{state}}",
  "{{hours}}",
  "{{agent_name}}",
  "{{monthly_bill}}",
];

/**
 * Validates a prompt string for placeholder syntax, malformed tokens, and minimum length
 */
export function validatePrompt(promptText: string): PromptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!promptText || promptText.trim().length === 0) {
    return {
      isValid: false,
      errors: ["Prompt cannot be empty."],
      warnings: [],
      detectedVariables: [],
      wordCount: 0,
    };
  }

  const trimmed = promptText.trim();
  const wordCount = trimmed.split(/\s+/).length;

  if (wordCount < 15) {
    errors.push(`Prompt is too brief (${wordCount} words). A functional system prompt requires at least 15 words.`);
  }

  // Check for malformed placeholders like {{unclosed or single {var}
  const unclosedDouble = /{{[^}]*$/g.test(trimmed) || /{{[^{}]*{{/.test(trimmed);
  if (unclosedDouble) {
    errors.push("Malformed variable placeholder: Detected unclosed '{{' opening tag.");
  }

  // Extract all {{token}} matches
  const tokenRegex = /{{([^{}]+)}}/g;
  const matches = trimmed.match(tokenRegex) || [];
  const detectedVariables = Array.from(new Set(matches));

  for (const token of detectedVariables) {
    if (!VALID_PLACEHOLDERS.includes(token)) {
      warnings.push(`Unrecognized placeholder '${token}'. Standard variables are: ${VALID_PLACEHOLDERS.slice(0, 6).join(", ")}.`);
    }
  }

  // Safety checks
  const lower = trimmed.toLowerCase();
  if (!lower.includes("ai") && !lower.includes("assistant")) {
    warnings.push("Recommended safety rule: Prompt should instruct the agent to identify itself as an AI assistant.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedVariables,
    wordCount,
  };
}

/**
 * Assembles modular sections into a unified markdown system instruction prompt
 */
export function composeSystemPromptFromSections(sections: PromptSections, agentName = "Selvi"): string {
  const parts: string[] = [];

  // 1. Role & Identity
  parts.push(`### SYSTEM ROLE & IDENTITY
You are ${agentName}, an intelligent voice consultant. ${sections.agentPersonality.trim()}
${sections.systemInstructions.trim()}`);

  // 2. Business Context
  if (sections.businessContext.trim()) {
    parts.push(`### BUSINESS CONTEXT
${sections.businessContext.trim()}`);
  }

  // 3. Conversation Objectives
  if (sections.conversationObjectives.length > 0) {
    parts.push(`### CONVERSATION OBJECTIVES
${sections.conversationObjectives.map((obj, i) => `${i + 1}. ${obj.trim()}`).join("\n")}`);
  }

  // 4. Language Instructions
  if (sections.languageInstructions.trim()) {
    parts.push(`### LANGUAGE POLICY
${sections.languageInstructions.trim()}`);
  }

  // 5. Qualification Rules
  if (sections.qualificationRules.length > 0) {
    parts.push(`### QUALIFICATION PROTOCOL
${sections.qualificationRules.map((q) => `- ${q.trim()}`).join("\n")}`);
  }

  // 6. Objection Handling
  if (sections.objectionHandling.length > 0) {
    parts.push(`### OBJECTION HANDLING
${sections.objectionHandling.map((o) => `* **Customer Objection:** "${o.objection}"\n  **Guidance:** ${o.response}`).join("\n\n")}`);
  }

  // 7. Safety Boundaries & Human Escalation
  const safetyList = [...sections.safetyBoundaries];
  if (sections.humanHandoffInstructions.trim()) {
    safetyList.push(`Human Handoff Protocol: ${sections.humanHandoffInstructions.trim()}`);
  }
  if (safetyList.length > 0) {
    parts.push(`### SAFETY & ESCALATION BOUNDARIES
${safetyList.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n")}`);
  }

  // 8. Closing
  if (sections.conversationClosing.trim()) {
    parts.push(`### CONVERSATION CLOSING
${sections.conversationClosing.trim()}`);
  }

  return parts.join("\n\n");
}

/**
 * Resolves template variables in a prompt with given entity context
 */
export function resolvePromptVariables(
  templatePrompt: string,
  context: {
    businessName?: string;
    customerName?: string;
    businessIndustry?: string;
    customerInterest?: string;
    preferredLanguage?: string;
    appointmentTime?: string;
    phone?: string;
    city?: string;
    state?: string;
    hours?: string;
    agentName?: string;
    monthlyBill?: string | number;
  }
): string {
  const map: Record<string, string> = {
    "{{business_name}}": context.businessName || "VoiceNexus Business",
    "{{customer_name}}": context.customerName || "Customer",
    "{{business_industry}}": context.businessIndustry || "Enterprise Services",
    "{{customer_interest}}": context.customerInterest || "General Inquiry",
    "{{preferred_language}}": context.preferredLanguage || "English",
    "{{appointment_time}}": context.appointmentTime || "Tomorrow at 11:00 AM IST",
    "{{phone}}": context.phone || "+91 98401 23456",
    "{{city}}": context.city || "Chennai",
    "{{state}}": context.state || "Tamil Nadu",
    "{{hours}}": context.hours || "09:00 AM – 07:00 PM IST",
    "{{agent_name}}": context.agentName || "Selvi",
    "{{monthly_bill}}": context.monthlyBill ? `₹${context.monthlyBill}` : "₹4,500/month",
  };

  let resolved = templatePrompt;
  for (const [token, value] of Object.entries(map)) {
    resolved = resolved.split(token).join(value);
  }
  return resolved;
}
