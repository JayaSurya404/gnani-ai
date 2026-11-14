import { z } from "zod";
import type {
  BusinessOutcome,
  ComplianceState,
  EscalationState,
  SentimentType,
  AnalysisJobStatus
} from "@/types/database";

export interface TranscriptSegmentInput {
  id: string;
  speaker: string; // "CUSTOMER" | "AGENT" | "CALLER" | "USER" | "AI"
  text: string;
  confidence?: number | null;
  startOffsetMs?: number | null;
  endOffsetMs?: number | null;
}

export type VerificationState = "VERIFIED" | "UNVERIFIED" | "REJECTED";

export interface GroundedEvidenceClaim<T = string> {
  value: T;
  evidenceSegmentIds: string[];
  exactQuote: string;
  speaker: "CUSTOMER" | "AGENT" | "UNKNOWN";
  confidence: number; // 0.0 - 1.0
  verificationState: VerificationState;
}

export const GroundedEvidenceClaimSchema = z.object({
  value: z.string(),
  evidenceSegmentIds: z.array(z.string()).default([]),
  exactQuote: z.string().default(""),
  speaker: z.enum(["CUSTOMER", "AGENT", "UNKNOWN"]).default("CUSTOMER"),
  confidence: z.number().min(0).max(1).default(1.0),
  verificationState: z.enum(["VERIFIED", "UNVERIFIED", "REJECTED"]).default("UNVERIFIED"),
});

export const RawLLMAnalysisOutputSchema = z.object({
  summary: z.union([
    z.string().min(5),
    z.object({ value: z.string().min(5) }).transform((v) => v.value)
  ]),
  proposedBusinessOutcome: z.preprocess(
    (val) => (typeof val === "object" && val && "value" in val ? (val as { value: unknown }).value : val),
    z.enum([
      "QUALIFIED",
      "FOLLOW_UP_REQUIRED",
      "NOT_INTERESTED",
      "WRONG_NUMBER",
      "UNRESOLVED",
      "INFORMATIONAL_COMPLETE"
    ])
  ),
  customerIntent: GroundedEvidenceClaimSchema.nullable().default(null),
  customerRequirements: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  productServiceInterest: GroundedEvidenceClaimSchema.nullable().default(null),
  budget: GroundedEvidenceClaimSchema.nullable().default(null),
  purchaseTimeline: GroundedEvidenceClaimSchema.nullable().default(null),
  locationRequirements: GroundedEvidenceClaimSchema.nullable().default(null),
  customerObjections: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  competitorMentions: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  buyingSignals: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  customerQuestions: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  unresolvedQuestions: z.preprocess(
    (val) => (val === null || val === undefined ? [] : Array.isArray(val) ? val : [val]),
    z.array(GroundedEvidenceClaimSchema)
  ).default([]),
  recommendedNextAction: z.preprocess(
    (val) =>
      typeof val === "string"
        ? { value: val, evidenceSegmentIds: [], exactQuote: "", speaker: "AGENT", confidence: 0.85 }
        : val,
    GroundedEvidenceClaimSchema.nullable().default(null)
  ),
  sentiment: z.preprocess(
    (val) => (typeof val === "string" ? val.toUpperCase() : "NEUTRAL"),
    z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]).default("NEUTRAL")
  ),
  overallConfidence: z.preprocess(
    (val) => (typeof val === "number" ? val : 0.85),
    z.number().min(0).max(1).default(0.85)
  )
});

export type RawLLMAnalysisOutput = z.infer<typeof RawLLMAnalysisOutputSchema>;

export interface ScoringFactorBreakdown {
  name: string;
  maxPoints: number;
  awardedPoints: number;
  observed: boolean;
  justification: string;
  evidenceQuotes: string[];
  evidenceSegmentIds: string[];
}

export interface LeadScoringResult {
  totalScore: number | null;
  normalizedObservedScore: number | null;
  observedWeightTotal: number;
  evidenceCoverage: number; // 0.0 - 1.0
  extractionConfidence: number; // 0.0 - 1.0
  classification: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
  scoringFactors: Record<string, ScoringFactorBreakdown>;
  unresolvedUnknowns: string[];
  scoringVersion: string;
}

export interface ValidatedCallAnalysisResult {
  summary: string;
  businessOutcome: BusinessOutcome;
  complianceState: ComplianceState;
  escalationState: EscalationState;
  sentiment: SentimentType;
  confidenceScore: number;
  evidenceCoverage: number;
  extractionConfidence: number;
  qualificationDecision: string;
  followUpRecommended: boolean;
  intelligenceData: {
    customerIntent: GroundedEvidenceClaim<string> | null;
    customerRequirements: GroundedEvidenceClaim<string>[];
    productServiceInterest: GroundedEvidenceClaim<string> | null;
    budget: GroundedEvidenceClaim<string> | null;
    purchaseTimeline: GroundedEvidenceClaim<string> | null;
    locationRequirements: GroundedEvidenceClaim<string> | null;
    customerObjections: GroundedEvidenceClaim<string>[];
    competitorMentions: GroundedEvidenceClaim<string>[];
    buyingSignals: GroundedEvidenceClaim<string>[];
    customerQuestions: GroundedEvidenceClaim<string>[];
    unresolvedQuestions: GroundedEvidenceClaim<string>[];
    recommendedNextAction: GroundedEvidenceClaim<string> | null;
    rejectedEvidence: Array<{ field: string; reason: string; quote: string }>;
  };
  leadScoring: LeadScoringResult;
  provider: string;
  model: string;
  processingDurationMs: number;
}

export interface PostCallAgentOptions {
  preferredProvider?: "GROQ" | "GEMINI" | "AUTO";
  preferredModel?: string;
  timeoutMs?: number;
  mockCompletion?: RawLLMAnalysisOutput;
}

export interface CallAnalysisJobRecord {
  id: string;
  organization_id: string;
  call_session_id: string;
  analysis_version: number;
  status: AnalysisJobStatus;
  attempts: number;
  max_attempts: number;
  fencing_token: number;
}

