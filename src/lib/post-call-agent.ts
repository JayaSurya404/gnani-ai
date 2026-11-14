import {
  type TranscriptSegmentInput,
  type ValidatedCallAnalysisResult,
  type PostCallAgentOptions,
  type RawLLMAnalysisOutput,
  RawLLMAnalysisOutputSchema
} from "./intelligence/types";
import { POST_CALL_SYSTEM_PROMPT, buildPostCallUserPrompt } from "./intelligence/prompt";
import { verifyAllEvidence } from "./intelligence/evidence-verifier";
import { calculateLeadScore } from "./intelligence/lead-scorer";
import { validateBusinessOutcome } from "./intelligence/outcome-classifier";
import type { ComplianceState, EscalationState } from "@/types/database";

export interface AnalyzeCallContext {
  callSessionId: string;
  organizationId: string;
  segments: TranscriptSegmentInput[];
  complianceState?: ComplianceState;
  escalationState?: EscalationState;
  durationSeconds?: number;
  customerName?: string;
  customerPhone?: string;
  businessName?: string;
  options?: PostCallAgentOptions;
}

/**
 * Strips markdown code block wrappers if provider wraps JSON in ```json ... ```
 */
function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Call Groq Chat Completions API in JSON Mode
 */
async function callGroqIntelligence(
  userPrompt: string,
  model = process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  timeoutMs = 15000
): Promise<{ rawJson: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  // Use only independently verified active Groq models; never include unverified models like llama-3.3-70b-versatile
  const modelsToTry = [model];
  if (model !== "openai/gpt-oss-20b") {
    modelsToTry.push("openai/gpt-oss-20b");
  }
  if (model !== "qwen/qwen3.8-27b") {
    modelsToTry.push("qwen/qwen3.8-27b");
  }

  for (const m of modelsToTry) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Connection: "close",
        },
        body: JSON.stringify({
          model: m,
          messages: [
            { role: "system", content: POST_CALL_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 6000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return { rawJson: content.trim(), model: m };
        }
      }
    } catch {
      // Continue to fallback model
    }
  }

  return null;
}

/**
 * Call Google Gemini GenerateContent API in JSON Mode
 */
async function callGeminiIntelligence(
  userPrompt: string,
  model = process.env.GEMINI_MODEL || "gemini-2.5-flash",
  timeoutMs = 15000
): Promise<{ rawJson: string; model: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const normalizedModel = model === "gemini-3.8-flash" ? "gemini-2.5-flash" : model;
  const modelsToTry = [normalizedModel];
  if (normalizedModel !== "gemini-2.5-flash") {
    modelsToTry.push("gemini-2.5-flash");
  }

  for (const m of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "close",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: POST_CALL_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 3500,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content && content.trim()) {
          return { rawJson: content.trim(), model: m };
        }
      }
    } catch {
      // Continue to next model in fallback list
    }
  }

  return null;
}

/**
 * Default fallback analysis when no LLM provider is available or transcript is empty.
 */
function createDeterministicFallbackOutput(segments: TranscriptSegmentInput[]): RawLLMAnalysisOutput {
  if (!segments || segments.length === 0) {
    return {
      summary: "No voice transcript was recorded during this call session.",
      proposedBusinessOutcome: "UNRESOLVED",
      customerIntent: null,
      customerRequirements: [],
      productServiceInterest: null,
      budget: null,
      purchaseTimeline: null,
      locationRequirements: null,
      customerObjections: [],
      competitorMentions: [],
      buyingSignals: [],
      customerQuestions: [],
      unresolvedQuestions: [],
      recommendedNextAction: null,
      sentiment: "NEUTRAL",
      overallConfidence: 0.8
    };
  }

  const customerSegments = segments.filter(
    (s) => s.speaker?.toUpperCase() === "CUSTOMER" || s.speaker?.toUpperCase() === "CALLER" || s.speaker?.toUpperCase() === "USER"
  );
  const text = customerSegments.map((s) => s.text).join(" ").toLowerCase();

  const isDnc = /(stop calling|do not call|don't call|pesadheenga|remove my number|unsubscribe)/i.test(text);
  const isInterested = /(solar|rooftop|quote|quotation|price|subsidy|install|panels)/i.test(text);

  const firstCustSeg = customerSegments[0];
  const intentClaim = firstCustSeg
    ? {
        value: isDnc ? "Do-Not-Call Opt-Out" : isInterested ? "Solar Inquiry" : "General Call Inquiry",
        evidenceSegmentIds: [firstCustSeg.id],
        exactQuote: firstCustSeg.text.slice(0, 100),
        speaker: "CUSTOMER" as const,
        confidence: 0.8,
        verificationState: "UNVERIFIED" as const
      }
    : null;

  return {
    summary: `Call session with ${segments.length} transcript turns captured.`,
    proposedBusinessOutcome: isDnc ? "NOT_INTERESTED" : isInterested ? "FOLLOW_UP_REQUIRED" : "UNRESOLVED",
    customerIntent: intentClaim,
    customerRequirements: [],
    productServiceInterest: isInterested
      ? {
          value: "Solar Rooftop System",
          evidenceSegmentIds: firstCustSeg ? [firstCustSeg.id] : [],
          exactQuote: firstCustSeg ? firstCustSeg.text.slice(0, 100) : "",
          speaker: "CUSTOMER",
          confidence: 0.8,
          verificationState: "UNVERIFIED"
        }
      : null,
    budget: null,
    purchaseTimeline: null,
    locationRequirements: null,
    customerObjections: [],
    competitorMentions: [],
    buyingSignals: [],
    customerQuestions: [],
    unresolvedQuestions: [],
    recommendedNextAction: {
      value: isDnc ? "Suppress outbound calls" : "Follow up with customer",
      evidenceSegmentIds: [],
      exactQuote: "",
      speaker: "AGENT",
      confidence: 0.8,
      verificationState: "UNVERIFIED"
    },
    sentiment: isDnc ? "NEGATIVE" : "NEUTRAL",
    overallConfidence: 0.75
  };
}

/**
 * AI Post-Call Intelligence Agent
 * Executes generative conversation analysis, rigorous quote verification, explainable lead scoring,
 * and deterministic business outcome validation.
 */
export async function analyzeCallWithAI(context: AnalyzeCallContext): Promise<ValidatedCallAnalysisResult> {
  const startTime = Date.now();
  const {
    segments,
    complianceState = "NONE",
    escalationState = "NONE",
    durationSeconds = 0,
    customerName,
    customerPhone,
    businessName,
    options = {}
  } = context;

  const userPrompt = buildPostCallUserPrompt(segments, {
    customerName,
    customerPhone,
    businessName,
  });

  let rawOutput: RawLLMAnalysisOutput | null = null;
  let providerUsed = "DETERMINISTIC_FALLBACK";
  let modelUsed = "rule-based";

  // Check if mock completion was explicitly supplied (for deterministic unit testing)
  if (options.mockCompletion) {
    rawOutput = options.mockCompletion;
    providerUsed = "MOCK_PROVIDER";
    modelUsed = "mock-model";
  } else {
    // Attempt Primary Provider (Groq -> Gemini failover or explicit preference)
    const preferredProvider = options.preferredProvider || "AUTO";
    const timeoutMs = options.timeoutMs || 20000;

    if (preferredProvider === "GROQ" || preferredProvider === "AUTO") {
      const groqRes = await callGroqIntelligence(userPrompt, options.preferredModel, timeoutMs);
      if (groqRes) {
        try {
          const parsed = JSON.parse(cleanJsonOutput(groqRes.rawJson));
          const validated = RawLLMAnalysisOutputSchema.safeParse(parsed);
          if (validated.success) {
            rawOutput = validated.data;
            providerUsed = "GROQ";
            modelUsed = groqRes.model;
          }
        } catch {
          // Fall through to secondary provider
        }
      }
    }

    if (!rawOutput && (preferredProvider === "GEMINI" || preferredProvider === "AUTO")) {
      const geminiRes = await callGeminiIntelligence(userPrompt, options.preferredModel, timeoutMs);
      if (geminiRes) {
        try {
          const parsed = JSON.parse(cleanJsonOutput(geminiRes.rawJson));
          const validated = RawLLMAnalysisOutputSchema.safeParse(parsed);
          if (validated.success) {
            rawOutput = validated.data;
            providerUsed = "GEMINI";
            modelUsed = geminiRes.model;
          }
        } catch {
          // Fall through to fallback
        }
      }
    }

    // If both providers unavailable or unparseable, fall back to safe deterministic output
    if (!rawOutput) {
      rawOutput = createDeterministicFallbackOutput(segments);
      providerUsed = "DETERMINISTIC_FALLBACK";
      modelUsed = "deterministic-parser";
    }
  }

  // Task 4: Verify quotes and evidence against actual transcript segments
  const verification = verifyAllEvidence(rawOutput, segments);

  // Task 6: Calculate Explainable Lead Scoring based ONLY on verified evidence
  const leadScoring = calculateLeadScore({
    customerIntent: verification.verifiedClaims.customerIntent,
    budget: verification.verifiedClaims.budget,
    purchaseTimeline: verification.verifiedClaims.purchaseTimeline,
    locationRequirements: verification.verifiedClaims.locationRequirements,
    customerRequirements: verification.verifiedClaims.customerRequirements,
    customerQuestions: verification.verifiedClaims.customerQuestions,
    buyingSignals: verification.verifiedClaims.buyingSignals,
    customerObjections: verification.verifiedClaims.customerObjections,
    recommendedNextAction: verification.verifiedClaims.recommendedNextAction,
    complianceState,
    extractionConfidence: verification.overallExtractionConfidence
  });

  // Task 5: Deterministically validate business outcome with DNC/escalation precedence
  const validatedOutcome = validateBusinessOutcome({
    proposedOutcome: rawOutput.proposedBusinessOutcome,
    complianceState,
    escalationState,
    callDurationSeconds: durationSeconds,
    leadScoring,
    extractionConfidence: verification.overallExtractionConfidence,
    hasCustomerObjections: verification.verifiedClaims.customerObjections.length > 0,
    unresolvedQuestionsCount: verification.verifiedClaims.unresolvedQuestions.length
  });

  const durationMs = Date.now() - startTime;

  return {
    summary: rawOutput.summary,
    businessOutcome: validatedOutcome.businessOutcome,
    complianceState: validatedOutcome.complianceState,
    escalationState: validatedOutcome.escalationState,
    sentiment: rawOutput.sentiment,
    confidenceScore: verification.overallExtractionConfidence,
    evidenceCoverage: leadScoring.evidenceCoverage,
    extractionConfidence: verification.overallExtractionConfidence,
    qualificationDecision: validatedOutcome.qualificationDecision,
    followUpRecommended: validatedOutcome.followUpRecommended,
    intelligenceData: {
      customerIntent: verification.verifiedClaims.customerIntent,
      customerRequirements: verification.verifiedClaims.customerRequirements,
      productServiceInterest: verification.verifiedClaims.productServiceInterest,
      budget: verification.verifiedClaims.budget,
      purchaseTimeline: verification.verifiedClaims.purchaseTimeline,
      locationRequirements: verification.verifiedClaims.locationRequirements,
      customerObjections: verification.verifiedClaims.customerObjections,
      competitorMentions: verification.verifiedClaims.competitorMentions,
      buyingSignals: verification.verifiedClaims.buyingSignals,
      customerQuestions: verification.verifiedClaims.customerQuestions,
      unresolvedQuestions: verification.verifiedClaims.unresolvedQuestions,
      recommendedNextAction: verification.verifiedClaims.recommendedNextAction,
      rejectedEvidence: verification.rejectedEvidence.map((r) => ({
        field: r.field,
        reason: r.reason,
        quote: r.quote
      }))
    },
    leadScoring,
    provider: providerUsed,
    model: modelUsed,
    processingDurationMs: durationMs
  };
}
