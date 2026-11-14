import type {
  LeadScoringResult,
  ScoringFactorBreakdown,
  GroundedEvidenceClaim
} from "./types";
import type { ComplianceState } from "@/types/database";

export interface LeadScoringInput {
  customerIntent: GroundedEvidenceClaim<string> | null;
  budget: GroundedEvidenceClaim<string> | null;
  purchaseTimeline: GroundedEvidenceClaim<string> | null;
  locationRequirements: GroundedEvidenceClaim<string> | null;
  customerRequirements: GroundedEvidenceClaim<string>[];
  customerQuestions: GroundedEvidenceClaim<string>[];
  buyingSignals: GroundedEvidenceClaim<string>[];
  customerObjections: GroundedEvidenceClaim<string>[];
  recommendedNextAction: GroundedEvidenceClaim<string> | null;
  complianceState?: ComplianceState;
  extractionConfidence?: number;
}

const FACTOR_WEIGHTS = {
  purchaseIntent: 25,
  budgetReadiness: 20,
  purchaseTimeline: 15,
  technicalPropertyFit: 15,
  customerEngagement: 10,
  decisionMakingAuthority: 10,
  nextStepWillingness: 5
};

export function calculateLeadScore(input: LeadScoringInput): LeadScoringResult {
  const factors: Record<string, ScoringFactorBreakdown> = {};
  const unresolvedUnknowns: string[] = [];
  const extractionConfidence = input.extractionConfidence ?? 0.85;

  // Helper to extract verified evidence
  function getVerifiedEvidence(claim: GroundedEvidenceClaim<string> | null) {
    if (claim && claim.verificationState === "VERIFIED") {
      return {
        isVerified: true,
        text: (claim.value || "").toLowerCase(),
        quote: claim.exactQuote,
        segmentIds: claim.evidenceSegmentIds
      };
    }
    return null;
  }

  // Factor 1: Purchase Intent (25 max points)
  const intentEv = getVerifiedEvidence(input.customerIntent);
  if (intentEv) {
    let points = 12; // Base observed intent
    const text = intentEv.text;
    if (/(install|buy|purchase|quote|quotation|proposal|book|order|urgent|interested)/i.test(text)) {
      points = 25;
    } else if (/(explore|research|know more|curious|general inquiry)/i.test(text)) {
      points = 15;
    } else if (/(not interested|don't want|cancel|stop|wrong person)/i.test(text)) {
      points = 0;
    }

    factors.purchaseIntent = {
      name: "Purchase Intent",
      maxPoints: FACTOR_WEIGHTS.purchaseIntent,
      awardedPoints: points,
      observed: true,
      justification: `Customer intent verified via transcript quote: "${intentEv.quote}"`,
      evidenceQuotes: [intentEv.quote],
      evidenceSegmentIds: intentEv.segmentIds
    };
  } else {
    factors.purchaseIntent = {
      name: "Purchase Intent",
      maxPoints: FACTOR_WEIGHTS.purchaseIntent,
      awardedPoints: 0,
      observed: false,
      justification: "No verified customer statement regarding purchase intent was observed in transcript.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("purchase_intent");
  }

  // Factor 2: Budget Readiness (20 max points)
  const budgetEv = getVerifiedEvidence(input.budget);
  if (budgetEv) {
    let points = 10;
    const text = budgetEv.text;
    if (/(lakh|lakhs|₹|inr|crore|3000|4000|5000|6000|8000|10000|high bill|ready to invest|financed)/i.test(text)) {
      points = 20;
    } else if (/(expensive|tight budget|subsidy only|free|low cost)/i.test(text)) {
      points = 10;
    }

    factors.budgetReadiness = {
      name: "Budget Readiness",
      maxPoints: FACTOR_WEIGHTS.budgetReadiness,
      awardedPoints: points,
      observed: true,
      justification: `Budget/bill verified via transcript quote: "${budgetEv.quote}"`,
      evidenceQuotes: [budgetEv.quote],
      evidenceSegmentIds: budgetEv.segmentIds
    };
  } else {
    factors.budgetReadiness = {
      name: "Budget Readiness",
      maxPoints: FACTOR_WEIGHTS.budgetReadiness,
      awardedPoints: 0,
      observed: false,
      justification: "Customer did not state electricity bill or budget details during call.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("budget_readiness");
  }

  // Factor 3: Purchase Timeline (15 max points)
  const timelineEv = getVerifiedEvidence(input.purchaseTimeline);
  if (timelineEv) {
    let points = 10;
    const text = timelineEv.text;
    if (/(immediate|this week|this month|within 30 days|asap|urgent|next week)/i.test(text)) {
      points = 15;
    } else if (/(1-3 months|within 3 months|few months|couple of months|quarter)/i.test(text)) {
      points = 10;
    } else if (/(next year|6 months|later|after house construction|not now)/i.test(text)) {
      points = 5;
    }

    factors.purchaseTimeline = {
      name: "Purchase Timeline",
      maxPoints: FACTOR_WEIGHTS.purchaseTimeline,
      awardedPoints: points,
      observed: true,
      justification: `Timeline verified via transcript quote: "${timelineEv.quote}"`,
      evidenceQuotes: [timelineEv.quote],
      evidenceSegmentIds: timelineEv.segmentIds
    };
  } else {
    factors.purchaseTimeline = {
      name: "Purchase Timeline",
      maxPoints: FACTOR_WEIGHTS.purchaseTimeline,
      awardedPoints: 0,
      observed: false,
      justification: "Customer did not state an installation timeline.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("purchase_timeline");
  }

  // Factor 4: Technical & Property Fit (15 max points)
  const locEv = getVerifiedEvidence(input.locationRequirements);
  const verifiedReqs = input.customerRequirements.filter((r) => r.verificationState === "VERIFIED");
  if (locEv || verifiedReqs.length > 0) {
    let points = 10;
    const quotes: string[] = [];
    const segIds: string[] = [];

    if (locEv) {
      quotes.push(locEv.quote);
      segIds.push(...locEv.segmentIds);
    }
    for (const req of verifiedReqs) {
      quotes.push(req.exactQuote);
      segIds.push(...req.evidenceSegmentIds);
    }

    const allText = (locEv ? locEv.text + " " : "") + verifiedReqs.map((r) => r.value).join(" ").toLowerCase();
    if (/(own house|independent house|rooftop|terrace|concrete roof|3kw|5kw|10kw|residential)/i.test(allText)) {
      points = 15;
    } else if (/(flat|apartment|rental|tenant|no space)/i.test(allText)) {
      points = 5;
    }

    factors.technicalPropertyFit = {
      name: "Technical & Property Fit",
      maxPoints: FACTOR_WEIGHTS.technicalPropertyFit,
      awardedPoints: points,
      observed: true,
      justification: `Property specifications verified: ${quotes.join("; ")}`,
      evidenceQuotes: quotes,
      evidenceSegmentIds: segIds
    };
  } else {
    factors.technicalPropertyFit = {
      name: "Technical & Property Fit",
      maxPoints: FACTOR_WEIGHTS.technicalPropertyFit,
      awardedPoints: 0,
      observed: false,
      justification: "Rooftop or property specifications were not discussed.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("technical_property_fit");
  }

  // Factor 5: Customer Engagement (10 max points)
  const verifiedQuestions = input.customerQuestions.filter((q) => q.verificationState === "VERIFIED");
  const verifiedBuyingSignals = input.buyingSignals.filter((s) => s.verificationState === "VERIFIED");
  if (verifiedQuestions.length > 0 || verifiedBuyingSignals.length > 0) {
    const totalEngageEvents = verifiedQuestions.length + verifiedBuyingSignals.length;
    let points = 6;
    if (totalEngageEvents >= 3) {
      points = 10;
    } else if (totalEngageEvents >= 1) {
      points = 8;
    }

    const quotes = [
      ...verifiedQuestions.map((q) => q.exactQuote),
      ...verifiedBuyingSignals.map((s) => s.exactQuote)
    ];
    const segIds = [
      ...verifiedQuestions.flatMap((q) => q.evidenceSegmentIds),
      ...verifiedBuyingSignals.flatMap((s) => s.evidenceSegmentIds)
    ];

    factors.customerEngagement = {
      name: "Customer Engagement",
      maxPoints: FACTOR_WEIGHTS.customerEngagement,
      awardedPoints: points,
      observed: true,
      justification: `Customer actively asked questions and showed engagement across ${totalEngageEvents} verified signals.`,
      evidenceQuotes: quotes,
      evidenceSegmentIds: segIds
    };
  } else {
    factors.customerEngagement = {
      name: "Customer Engagement",
      maxPoints: FACTOR_WEIGHTS.customerEngagement,
      awardedPoints: 0,
      observed: false,
      justification: "No active questions or positive engagement signals were verified.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("customer_engagement");
  }

  // Factor 6: Decision-Making Authority (10 max points)
  // Check if caller verified that they own the property or are sole decision maker
  let authPoints = 0;
  let authObserved = false;
  let authQuote = "";
  let authSegIds: string[] = [];

  for (const signal of [...verifiedBuyingSignals, ...(input.customerIntent ? [input.customerIntent] : [])]) {
    if (signal && signal.verificationState === "VERIFIED") {
      const txt = (signal.value + " " + signal.exactQuote).toLowerCase();
      if (/(owner|my house|my roof|my property|i decide|i own)/i.test(txt)) {
        authPoints = 10;
        authObserved = true;
        authQuote = signal.exactQuote;
        authSegIds = signal.evidenceSegmentIds;
        break;
      } else if (/(spouse|wife|husband|father|partner|family decision)/i.test(txt)) {
        authPoints = 5;
        authObserved = true;
        authQuote = signal.exactQuote;
        authSegIds = signal.evidenceSegmentIds;
        break;
      }
    }
  }

  if (authObserved) {
    factors.decisionMakingAuthority = {
      name: "Decision-Making Authority",
      maxPoints: FACTOR_WEIGHTS.decisionMakingAuthority,
      awardedPoints: authPoints,
      observed: true,
      justification: `Decision authority verified via quote: "${authQuote}"`,
      evidenceQuotes: [authQuote],
      evidenceSegmentIds: authSegIds
    };
  } else {
    factors.decisionMakingAuthority = {
      name: "Decision-Making Authority",
      maxPoints: FACTOR_WEIGHTS.decisionMakingAuthority,
      awardedPoints: 0,
      observed: false,
      justification: "Decision-maker status was not explicitly confirmed by the caller.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("decision_making_authority");
  }

  // Factor 7: Next-Step Willingness (5 max points)
  const nextEv = getVerifiedEvidence(input.recommendedNextAction);
  if (nextEv) {
    let points = 3;
    const txt = nextEv.text;
    if (/(inspection|site visit|call back|send quote|whatsapp details|proposal|survey)/i.test(txt)) {
      points = 5;
    } else if (/(refused|no visit|don't send)/i.test(txt)) {
      points = 0;
    }

    factors.nextStepWillingness = {
      name: "Next-Step Willingness",
      maxPoints: FACTOR_WEIGHTS.nextStepWillingness,
      awardedPoints: points,
      observed: true,
      justification: `Next-step agreement verified via quote: "${nextEv.quote}"`,
      evidenceQuotes: [nextEv.quote],
      evidenceSegmentIds: nextEv.segmentIds
    };
  } else {
    factors.nextStepWillingness = {
      name: "Next-Step Willingness",
      maxPoints: FACTOR_WEIGHTS.nextStepWillingness,
      awardedPoints: 0,
      observed: false,
      justification: "Customer did not commit to a specific next step.",
      evidenceQuotes: [],
      evidenceSegmentIds: []
    };
    unresolvedUnknowns.push("next_step_willingness");
  }

  // Compute normalized score across observed factors only
  let observedWeightTotal = 0;
  let observedPointsTotal = 0;

  for (const f of Object.values(factors)) {
    if (f.observed) {
      observedWeightTotal += f.maxPoints;
      observedPointsTotal += f.awardedPoints;
    }
  }

  // Evidence coverage is observed weight / 100
  const evidenceCoverage = Number((observedWeightTotal / 100).toFixed(3));

  let totalScore: number | null = null;
  let normalizedObservedScore: number | null = null;

  if (observedWeightTotal > 0) {
    totalScore = Math.min(100, Math.max(0, observedPointsTotal));
    normalizedObservedScore = Number(((observedPointsTotal / observedWeightTotal) * 100).toFixed(2));
  }

  // Determine classification according to rigorous gate rules
  let classification: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED" = "UNCLASSIFIED";

  const isNegativeIntent = factors.purchaseIntent?.observed && factors.purchaseIntent.awardedPoints === 0;

  if (isNegativeIntent) {
    // Explicit negative intent expressed by customer (zero interest)
    classification = "COLD";
  } else if (totalScore !== null) {
    const budgetOrAuthVerified =
      (factors.budgetReadiness?.observed && factors.budgetReadiness.awardedPoints >= 15) ||
      (factors.decisionMakingAuthority?.observed && factors.decisionMakingAuthority.awardedPoints >= 10);

    if (totalScore >= 75 && evidenceCoverage >= 0.600 && budgetOrAuthVerified) {
      classification = "HOT";
    } else if (totalScore >= 45 && evidenceCoverage >= 0.400) {
      classification = "WARM";
    } else if (evidenceCoverage >= 0.400 && totalScore < 45) {
      classification = "COLD";
    } else {
      // Insufficient evidence coverage (< 40%) without explicit negative intent
      classification = "UNCLASSIFIED";
    }
  }

  // Strictly enforce check constraint chk_coverage_hot_gate:
  // (classification != 'HOT' OR evidence_coverage >= 0.600) AND (classification != 'WARM' OR evidence_coverage >= 0.400)
  if (classification === "HOT" && evidenceCoverage < 0.600) {
    classification = evidenceCoverage >= 0.400 ? "WARM" : "UNCLASSIFIED";
  }
  if (classification === "WARM" && evidenceCoverage < 0.400) {
    classification = "UNCLASSIFIED";
  }

  return {
    totalScore,
    normalizedObservedScore,
    observedWeightTotal,
    evidenceCoverage,
    extractionConfidence,
    classification,
    scoringFactors: factors,
    unresolvedUnknowns,
    scoringVersion: "v1.0"
  };
}

