import type {
  TranscriptSegmentInput,
  GroundedEvidenceClaim,
  RawLLMAnalysisOutput
} from "./types";

export interface VerificationAudit {
  field: string;
  reason: string;
  quote: string;
  providedSegmentIds: string[];
}

export interface VerificationResult {
  verifiedClaims: {
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
  };
  rejectedEvidence: VerificationAudit[];
  overallExtractionConfidence: number;
}

/**
 * Normalizes string for robust, whitespace- and punctuation-insensitive quote matching.
 */
export function normalizeQuoteText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”…]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Determines whether a speaker identifier represents the external caller / customer.
 */
export function isCustomerSpeaker(speaker?: string): boolean {
  if (!speaker) return false;
  const s = speaker.toUpperCase().trim();
  return s === "CUSTOMER" || s === "CALLER" || s === "USER";
}

/**
 * Verifies a single GroundedEvidenceClaim against the actual transcript segments.
 */
export function verifyClaim(
  claim: GroundedEvidenceClaim<string> | null,
  segmentsMap: Map<string, TranscriptSegmentInput>,
  fieldName: string,
  requiresCustomerSpeaker = true
): { verifiedClaim: GroundedEvidenceClaim<string> | null; rejection?: VerificationAudit } {
  if (!claim) {
    return { verifiedClaim: null };
  }

  // If claim value is empty, treat as null
  if (!claim.value || !claim.value.trim()) {
    return { verifiedClaim: null };
  }

  // If no segment IDs provided or no quote provided
  if (!claim.evidenceSegmentIds || claim.evidenceSegmentIds.length === 0 || !claim.exactQuote || !claim.exactQuote.trim()) {
    return {
      verifiedClaim: {
        ...claim,
        verificationState: "UNVERIFIED"
      }
    };
  }

  // Verify that all referenced segments exist
  for (const segId of claim.evidenceSegmentIds) {
    if (!segmentsMap.has(segId)) {
      return {
        verifiedClaim: {
          ...claim,
          verificationState: "REJECTED"
        },
        rejection: {
          field: fieldName,
          reason: `Invalid segment ID: '${segId}' does not exist in session transcript.`,
          quote: claim.exactQuote,
          providedSegmentIds: claim.evidenceSegmentIds
        }
      };
    }
  }

  // Verify speaker validity if customer claim
  if (requiresCustomerSpeaker) {
    for (const segId of claim.evidenceSegmentIds) {
      const seg = segmentsMap.get(segId)!;
      if (!isCustomerSpeaker(seg.speaker)) {
        return {
          verifiedClaim: {
            ...claim,
            verificationState: "REJECTED"
          },
          rejection: {
            field: fieldName,
            reason: `Speaker mismatch: Segment '${segId}' speaker is '${seg.speaker}', but customer statement was claimed.`,
            quote: claim.exactQuote,
            providedSegmentIds: claim.evidenceSegmentIds
          }
        };
      }
    }
  }

  // Combine text from referenced segments
  const combinedSegmentText = claim.evidenceSegmentIds
    .map((id) => segmentsMap.get(id)!.text)
    .join(" ");

  const normQuote = normalizeQuoteText(claim.exactQuote);
  const normSource = normalizeQuoteText(combinedSegmentText);

  // Exact or normalized substring match
  if (!normSource.includes(normQuote)) {
    return {
      verifiedClaim: {
        ...claim,
        verificationState: "REJECTED"
      },
      rejection: {
        field: fieldName,
        reason: `Hallucinated quote: Quoted text '${claim.exactQuote}' not found in cited segment text.`,
        quote: claim.exactQuote,
        providedSegmentIds: claim.evidenceSegmentIds
      }
    };
  }

  return {
    verifiedClaim: {
      ...claim,
      verificationState: "VERIFIED"
    }
  };
}

/**
 * Verifies all 13 dimensions of the LLM output against the session transcript segments.
 */
export function verifyAllEvidence(
  raw: RawLLMAnalysisOutput,
  segments: TranscriptSegmentInput[]
): VerificationResult {
  const segmentsMap = new Map<string, TranscriptSegmentInput>();
  for (const s of segments) {
    segmentsMap.set(s.id, s);
  }

  const rejectedEvidence: VerificationAudit[] = [];
  const confidenceValues: number[] = [];

  function checkSingle(claim: GroundedEvidenceClaim<string> | null, field: string, reqCustomer: boolean) {
    const res = verifyClaim(claim, segmentsMap, field, reqCustomer);
    if (res.rejection) rejectedEvidence.push(res.rejection);
    if (res.verifiedClaim && res.verifiedClaim.verificationState === "VERIFIED") {
      confidenceValues.push(res.verifiedClaim.confidence);
    }
    return res.verifiedClaim;
  }

  function checkList(claims: GroundedEvidenceClaim<string>[], field: string, reqCustomer: boolean) {
    const list: GroundedEvidenceClaim<string>[] = [];
    for (const c of claims) {
      const res = verifyClaim(c, segmentsMap, field, reqCustomer);
      if (res.rejection) rejectedEvidence.push(res.rejection);
      if (res.verifiedClaim) {
        list.push(res.verifiedClaim);
        if (res.verifiedClaim.verificationState === "VERIFIED") {
          confidenceValues.push(res.verifiedClaim.confidence);
        }
      }
    }
    return list;
  }

  const verifiedClaims = {
    customerIntent: checkSingle(raw.customerIntent, "customerIntent", true),
    customerRequirements: checkList(raw.customerRequirements, "customerRequirements", true),
    productServiceInterest: checkSingle(raw.productServiceInterest, "productServiceInterest", false),
    budget: checkSingle(raw.budget, "budget", true),
    purchaseTimeline: checkSingle(raw.purchaseTimeline, "purchaseTimeline", true),
    locationRequirements: checkSingle(raw.locationRequirements, "locationRequirements", true),
    customerObjections: checkList(raw.customerObjections, "customerObjections", true),
    competitorMentions: checkList(raw.competitorMentions, "competitorMentions", true),
    buyingSignals: checkList(raw.buyingSignals, "buyingSignals", true),
    customerQuestions: checkList(raw.customerQuestions, "customerQuestions", true),
    unresolvedQuestions: checkList(raw.unresolvedQuestions, "unresolvedQuestions", false),
    recommendedNextAction: checkSingle(raw.recommendedNextAction, "recommendedNextAction", false),
  };

  // Compute overall extraction confidence
  let overallExtractionConfidence = raw.overallConfidence;
  if (confidenceValues.length > 0) {
    const sum = confidenceValues.reduce((a, b) => a + b, 0);
    overallExtractionConfidence = Number((sum / confidenceValues.length).toFixed(3));
  }
  // Penalize confidence if hallucinations or rejected quotes were detected
  if (rejectedEvidence.length > 0) {
    overallExtractionConfidence = Math.max(0.1, Number((overallExtractionConfidence * Math.pow(0.85, rejectedEvidence.length)).toFixed(3)));
  }

  return {
    verifiedClaims,
    rejectedEvidence,
    overallExtractionConfidence
  };
}

