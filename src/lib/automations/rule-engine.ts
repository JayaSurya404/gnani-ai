/**
 * VoiceNexus AI — Automation Rule Evaluation Engine
 * Evaluates triggers and conditions against validated post-call intelligence.
 */

import {
  AutomationRule,
  CallAutomationContext,
  AutomationRuleSchema
} from "./types";
import type { CallDisposition } from "@/types/database";

export interface RuleEvaluationResult {
  matches: boolean;
  reason?: string;
  matchedTrigger?: string;
}

/**
 * Maps modern business outcome to legacy disposition for backward compatibility
 */
function getLegacyDisposition(context: CallAutomationContext): CallDisposition {
  const { complianceState, businessOutcome } = context.analysis;
  if (complianceState === "DNC_REQUESTED" || complianceState === "DNC_REGISTERED") {
    return "DO_NOT_CALL";
  }
  switch (businessOutcome) {
    case "QUALIFIED":
      return "INTERESTED";
    case "FOLLOW_UP_REQUIRED":
      return "CALLBACK_REQUESTED";
    case "NOT_INTERESTED":
      return "NOT_INTERESTED";
    case "WRONG_NUMBER":
      return "WRONG_NUMBER";
    case "INFORMATIONAL_COMPLETE":
      return "INTERESTED";
    default:
      return "VOICEMAIL";
  }
}

/**
 * Validates and evaluates a single automation rule against the call context.
 */
export function evaluateAutomationRule(
  rule: AutomationRule,
  context: CallAutomationContext
): RuleEvaluationResult {
  // 1. Validate rule schema using Zod
  const validation = AutomationRuleSchema.safeParse(rule);
  if (!validation.success) {
    return {
      matches: false,
      reason: `Rule schema validation failed: ${validation.error.message}`
    };
  }

  // 2. Check rule status
  if (rule.status !== "ACTIVE") {
    return { matches: false, reason: "Rule is PAUSED or INACTIVE" };
  }

  // 3. Multi-tenant isolation: verify organization ID match
  if (rule.organizationId !== context.organizationId) {
    return { matches: false, reason: "Organization ID mismatch (tenant isolation violation)" };
  }

  const { analysis } = context;
  const conditions = rule.triggerConditions || {};

  // 4. Evaluate primary trigger
  let triggerMatched = false;

  switch (rule.triggerEvent) {
    case "CALL_COMPLETED":
      triggerMatched = true;
      break;

    case "LEAD_QUALIFIED":
      triggerMatched =
        analysis.businessOutcome === "QUALIFIED" ||
        analysis.qualificationDecision === "QUALIFIED";
      break;

    case "HIGH_INTENT_DETECTED":
      triggerMatched =
        analysis.leadScoring.classification === "HOT" ||
        (analysis.intelligenceData.buyingSignals && analysis.intelligenceData.buyingSignals.length > 0);
      break;

    case "CALLBACK_REQUESTED":
      triggerMatched =
        analysis.businessOutcome === "FOLLOW_UP_REQUIRED" ||
        Boolean(analysis.intelligenceData.purchaseTimeline?.exactQuote?.toLowerCase().includes("call")) ||
        Boolean(analysis.intelligenceData.recommendedNextAction?.value?.toLowerCase().includes("call"));
      break;

    case "UNRESOLVED_OBJECTION":
      triggerMatched =
        Boolean(analysis.intelligenceData.customerObjections && analysis.intelligenceData.customerObjections.length > 0);
      break;

    case "ESCALATION_REQUESTED":
    case "CUSTOMER_REQUESTS_HUMAN":
      triggerMatched =
        analysis.escalationState === "REQUESTED" ||
        analysis.escalationState === "FOLLOW_UP_PENDING";
      break;

    case "LEAD_SCORE_THRESHOLD": {
      const minThreshold = conditions.minScore ?? 75;
      triggerMatched = (analysis.leadScoring.totalScore ?? 0) >= minThreshold;
      break;
    }

    case "UNANSWERED_QUESTION":
      triggerMatched =
        (analysis.intelligenceData.unresolvedQuestions && analysis.intelligenceData.unresolvedQuestions.length > 0) ||
        (analysis.leadScoring.unresolvedUnknowns && analysis.leadScoring.unresolvedUnknowns.length > 0);
      break;

    case "DISPOSITION_EQUALS": {
      const legacyDisp = getLegacyDisposition(context);
      triggerMatched =
        conditions.disposition === legacyDisp ||
        conditions.disposition === analysis.businessOutcome;
      break;
    }

    default:
      triggerMatched = false;
  }

  if (!triggerMatched) {
    return { matches: false, reason: `Trigger condition not met for ${rule.triggerEvent}` };
  }

  // 5. Evaluate additional conditions
  if (conditions.sentiment && analysis.sentiment !== conditions.sentiment) {
    return { matches: false, reason: `Sentiment ${analysis.sentiment} does not match required ${conditions.sentiment}` };
  }

  if (conditions.minScore !== undefined && (analysis.leadScoring.totalScore ?? 0) < conditions.minScore) {
    return { matches: false, reason: `Total score ${analysis.leadScoring.totalScore} is below minScore ${conditions.minScore}` };
  }

  if (conditions.maxScore !== undefined && (analysis.leadScoring.totalScore ?? 0) > conditions.maxScore) {
    return { matches: false, reason: `Total score ${analysis.leadScoring.totalScore} is above maxScore ${conditions.maxScore}` };
  }

  if (conditions.minConfidence !== undefined && analysis.confidenceScore < conditions.minConfidence) {
    return { matches: false, reason: `Confidence score ${analysis.confidenceScore} is below minConfidence ${conditions.minConfidence}` };
  }

  if (conditions.allowedOutcomes && !conditions.allowedOutcomes.includes(analysis.businessOutcome)) {
    return { matches: false, reason: `Business outcome ${analysis.businessOutcome} not in allowed outcomes` };
  }

  if (conditions.disallowedCompliance && conditions.disallowedCompliance.includes(analysis.complianceState)) {
    return { matches: false, reason: `Compliance state ${analysis.complianceState} is in disallowed compliance list` };
  }

  if (conditions.requireConsent) {
    const hasConsent = Boolean(context.whatsappConsent || context.lead?.whatsapp_consent);
    if (!hasConsent) {
      return { matches: false, reason: "Rule requires explicit customer consent, which was not granted" };
    }
  }

  if (conditions.minBuyingSignals !== undefined) {
    const signalCount = analysis.intelligenceData.buyingSignals?.length || 0;
    if (signalCount < conditions.minBuyingSignals) {
      return { matches: false, reason: `Observed buying signals (${signalCount}) below required ${conditions.minBuyingSignals}` };
    }
  }

  if (conditions.hasUnresolvedUnknowns) {
    const unknowns = (analysis.leadScoring.unresolvedUnknowns?.length || 0) + (analysis.intelligenceData.unresolvedQuestions?.length || 0);
    if (unknowns === 0) {
      return { matches: false, reason: "Rule requires unresolved unknowns, but none were observed" };
    }
  }

  return {
    matches: true,
    matchedTrigger: rule.triggerEvent
  };
}

