import type {
  BusinessOutcome,
  ComplianceState,
  EscalationState
} from "@/types/database";
import type { LeadScoringResult } from "./types";

export interface OutcomeClassificationContext {
  proposedOutcome: BusinessOutcome;
  complianceState: ComplianceState;
  escalationState: EscalationState;
  callDurationSeconds: number;
  leadScoring: LeadScoringResult;
  extractionConfidence: number;
  hasCustomerObjections: boolean;
  unresolvedQuestionsCount: number;
}

export interface ValidatedOutcome {
  businessOutcome: BusinessOutcome;
  complianceState: ComplianceState;
  escalationState: EscalationState;
  qualificationDecision: string;
  followUpRecommended: boolean;
}

/**
 * Deterministically validates and enforces application-level guardrails on the LLM-proposed business outcome.
 */
export function validateBusinessOutcome(context: OutcomeClassificationContext): ValidatedOutcome {
  const {
    proposedOutcome,
    complianceState,
    escalationState,
    callDurationSeconds,
    leadScoring,
    extractionConfidence,
    unresolvedQuestionsCount
  } = context;

  // 1. Compliance State Integrity: DNC must never be cleared or weakened by LLM analysis
  const effectiveCompliance: ComplianceState = complianceState;
  const isDnc = effectiveCompliance === "DNC_REQUESTED" || effectiveCompliance === "DNC_REGISTERED";

  // 2. Escalation State Integrity: Escalation remains independent of business outcome
  const effectiveEscalation: EscalationState =
    escalationState === "REQUESTED" ? "FOLLOW_UP_PENDING" : escalationState;
  const isEscalated = effectiveEscalation === "FOLLOW_UP_PENDING";

  // 3. Business Outcome Determination: Preserves actual customer conversation
  let businessOutcome: BusinessOutcome;

  // Rule 3.1: Premature or Empty Sessions
  if (callDurationSeconds < 10 && (leadScoring.evidenceCoverage === 0 || leadScoring.totalScore === null)) {
    businessOutcome = "UNRESOLVED";
  }
  // Rule 3.2: Low Confidence Extraction Guardrail
  else if (extractionConfidence < 0.45) {
    businessOutcome = "UNRESOLVED";
  }
  // Rule 3.3: Commercial Qualification Validation
  else if (proposedOutcome === "QUALIFIED") {
    const isQualifiable =
      leadScoring.classification === "HOT" ||
      (leadScoring.classification === "WARM" &&
        (leadScoring.totalScore ?? 0) >= 60 &&
        leadScoring.evidenceCoverage >= 0.500);

    if (isQualifiable) {
      businessOutcome = "QUALIFIED";
    } else {
      // Downgrade if evidence was incomplete
      businessOutcome = (leadScoring.totalScore ?? 0) >= 40 ? "FOLLOW_UP_REQUIRED" : "UNRESOLVED";
    }
  }
  // Rule 3.4: Informational Inquiries
  else if (proposedOutcome === "INFORMATIONAL_COMPLETE") {
    if (unresolvedQuestionsCount > 0) {
      businessOutcome = "FOLLOW_UP_REQUIRED";
    } else {
      businessOutcome = "INFORMATIONAL_COMPLETE";
    }
  }
  // Rule 3.5: Negative Interest
  else if (proposedOutcome === "NOT_INTERESTED") {
    businessOutcome = "NOT_INTERESTED";
  }
  // Rule 3.6: Wrong Number
  else if (proposedOutcome === "WRONG_NUMBER") {
    businessOutcome = "WRONG_NUMBER";
  }
  // Rule 3.7: Follow-up Required
  else if (proposedOutcome === "FOLLOW_UP_REQUIRED") {
    businessOutcome = "FOLLOW_UP_REQUIRED";
  }
  // Default
  else {
    businessOutcome = "UNRESOLVED";
  }

  // 4. Follow-up Recommendation & DNC Suppression:
  // DNC must strictly suppress all prohibited marketing follow-ups
  let followUpRecommended: boolean;
  if (isDnc) {
    // Prohibited marketing follow-ups are strictly suppressed by DNC
    followUpRecommended = false;
  } else if (isEscalated) {
    // Supervisor follow-up is mandatory
    followUpRecommended = true;
  } else if (businessOutcome === "QUALIFIED" || businessOutcome === "FOLLOW_UP_REQUIRED") {
    followUpRecommended = true;
  } else if (businessOutcome === "UNRESOLVED" && extractionConfidence < 0.45) {
    followUpRecommended = true;
  } else {
    followUpRecommended = false;
  }

  // 5. Qualification Decision Formulation
  let qualificationDecision: string;
  if (businessOutcome === "QUALIFIED") {
    if (isDnc) {
      qualificationDecision = `QUALIFIED - DNC REGISTERED (MARKETING SUPPRESSED) [SCORE: ${leadScoring.totalScore}]`;
    } else if (isEscalated) {
      qualificationDecision = `QUALIFIED - SUPERVISOR ESCALATION PENDING [SCORE: ${leadScoring.totalScore}]`;
    } else {
      qualificationDecision = `QUALIFIED - LEAD SCORE ${leadScoring.totalScore} (${leadScoring.classification}) WITH ${Math.round(leadScoring.evidenceCoverage * 100)}% EVIDENCE COVERAGE`;
    }
  } else if (businessOutcome === "NOT_INTERESTED") {
    if (isDnc) {
      qualificationDecision = "NOT INTERESTED - DO NOT CALL (DNC ENFORCED)";
    } else {
      qualificationDecision = "NOT INTERESTED - CUSTOMER DECLINED OFFER";
    }
  } else if (businessOutcome === "FOLLOW_UP_REQUIRED") {
    if (isDnc) {
      qualificationDecision = "FOLLOW-UP REQUIRED - DNC ACTIVE (OUTBOUND MARKETING SUPPRESSED)";
    } else if (isEscalated) {
      qualificationDecision = "FOLLOW-UP REQUIRED - SUPERVISOR ESCALATION PENDING";
    } else {
      qualificationDecision = "FOLLOW-UP REQUIRED - PENDING SALES REPRESENTATIVE TOUCHPOINT";
    }
  } else if (businessOutcome === "INFORMATIONAL_COMPLETE") {
    if (isEscalated) {
      qualificationDecision = "INFORMATIONAL COMPLETE - ESCALATION PENDING";
    } else {
      qualificationDecision = "INFORMATIONAL COMPLETE - INQUIRY RESOLVED WITHOUT ACTIVE SALES PURSUIT";
    }
  } else if (businessOutcome === "WRONG_NUMBER") {
    qualificationDecision = "WRONG NUMBER - CONTACT UNREACHABLE";
  } else {
    if (callDurationSeconds < 10) {
      qualificationDecision = "UNRESOLVED - CALL DISCONNECTED PREMATURELY";
    } else if (extractionConfidence < 0.45) {
      qualificationDecision = "UNRESOLVED - EXTRACTION CONFIDENCE INSUFFICIENT FOR AUTOMATION";
    } else {
      qualificationDecision = "UNRESOLVED - INCOMPLETE EVIDENCE OR AMBIGUOUS INTENT";
    }
  }

  return {
    businessOutcome,
    complianceState: effectiveCompliance,
    escalationState: effectiveEscalation,
    qualificationDecision,
    followUpRecommended
  };
}
