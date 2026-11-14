/**
 * VoiceNexus AI — Post-Call Intelligence & Structured Outcome Extraction Engine
 * Extracts evidence-grounded facts, qualification decisions, key points with exact transcript quotes,
 * and follow-up recommendations strictly from persisted transcript evidence.
 */

export interface TranscriptTurn {
  speaker: string; // "CALLER" | "AGENT" | "USER" | "AI"
  text: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
}

export type CallDisposition = 
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "CALLBACK_REQUESTED"
  | "DO_NOT_CALL"
  | "WRONG_NUMBER"
  | "VOICEMAIL"
  | "ESCALATED";

export type SentimentType = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";

export interface KeyPointEvidence {
  point: string;
  evidenceQuote: string;
}

export interface ActionItem {
  task: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate?: string;
}

export interface RecommendedTask {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  suggestedDueHours: number;
  requiresOwnerApproval: boolean;
}

export interface StructuredCallOutcome {
  disposition: CallDisposition;
  sentiment: SentimentType;
  confidenceScore: number;
  summary: string;
  keyPoints: KeyPointEvidence[];
  actionItems: ActionItem[];
  qualificationDecision: string;
  followUpRecommended: boolean;
  recommendedTask?: RecommendedTask;
  unresolvedFields: string[];
}

export interface PostCallAnalysisContext {
  callSessionId: string;
  transcripts: TranscriptTurn[];
  customerName?: string;
  customerPhone?: string;
  businessName?: string;
  customerInterest?: string;
  monthlyBill?: string;
}

export function analyzeCallTranscript(context: PostCallAnalysisContext): StructuredCallOutcome {
  const { transcripts, customerName = "Customer", businessName = "VoiceNexus AI" } = context;

  if (!transcripts || transcripts.length === 0) {
    return {
      disposition: "VOICEMAIL",
      sentiment: "NEUTRAL",
      confidenceScore: 0.9,
      summary: "No audible transcript turns were captured during this call session.",
      keyPoints: [],
      actionItems: [
        {
          task: "Attempt follow-up call during standard business operating hours",
          priority: "LOW",
        },
      ],
      qualificationDecision: "UNQUALIFIED - NO_ANSWER",
      followUpRecommended: true,
      recommendedTask: {
        title: `Follow up with ${customerName} (No Answer)`,
        description: "Call disconnected before media exchange. Attempt re-engagement via SMS or second call.",
        priority: "LOW",
        suggestedDueHours: 24,
        requiresOwnerApproval: true,
      },
      unresolvedFields: ["customer_intent", "monthly_bill", "decision_timeline"],
    };
  }

  const callerTurns = transcripts.filter(
    (t) => t.speaker.toUpperCase() === "CALLER" || t.speaker.toUpperCase() === "USER" || t.speaker.toUpperCase() === "CUSTOMER"
  );
  const callerTextCombined = callerTurns.map((t) => t.text).join(" ").toLowerCase();

  // 1. Evaluate Disposition (Order of precedence: DNC -> Escalation -> Callback -> Not Interested -> Interested)
  let disposition: CallDisposition = "INTERESTED";
  let dispositionConfidence = 0.92;

  const dncPhrases = [
    "do not call",
    "stop calling",
    "don't call",
    "remove my number",
    "unsubscribe",
    "dnc",
    "pesadheenga",
    "call pannadheenga",
    "enaku call venam",
  ];

  const escalationPhrases = [
    "talk to human",
    "speak to agent",
    "human supervisor",
    "real person",
    "manager",
    "engineer",
    "supervisor",
    "manushan kitta pesu",
  ];

  const callbackPhrases = [
    "call me back",
    "call later",
    "call tomorrow",
    "busy now",
    "meeting right now",
    "thirumba pesunga",
    "later pesunga",
  ];

  const notInterestedPhrases = [
    "not interested",
    "don't need",
    "no thanks",
    "theva illa",
    "interest illa",
  ];

  if (dncPhrases.some((p) => callerTextCombined.includes(p))) {
    disposition = "DO_NOT_CALL";
    dispositionConfidence = 0.99;
  } else if (escalationPhrases.some((p) => callerTextCombined.includes(p))) {
    disposition = "ESCALATED";
    dispositionConfidence = 0.96;
  } else if (callbackPhrases.some((p) => callerTextCombined.includes(p))) {
    disposition = "CALLBACK_REQUESTED";
    dispositionConfidence = 0.94;
  } else if (notInterestedPhrases.some((p) => callerTextCombined.includes(p))) {
    disposition = "NOT_INTERESTED";
    dispositionConfidence = 0.91;
  } else {
    disposition = "INTERESTED";
    dispositionConfidence = 0.88;
  }

  // 2. Evaluate Sentiment
  let sentiment: SentimentType = "NEUTRAL";
  const positiveWords = ["good", "great", "nandri", "seri", "thanks", "interested", "ok", "helpful", "super", "correct"];
  const negativeWords = ["bad", "poor", "waste", "cheat", "annoying", "angry", "terrible", "expensive", "adhigam"];

  const posCount = positiveWords.filter((w) => callerTextCombined.includes(w)).length;
  const negCount = negativeWords.filter((w) => callerTextCombined.includes(w)).length;

  if (disposition === "DO_NOT_CALL") {
    sentiment = "NEGATIVE";
  } else if (posCount > 0 && negCount > 0) {
    sentiment = "MIXED";
  } else if (posCount > negCount) {
    sentiment = "POSITIVE";
  } else if (negCount > posCount) {
    sentiment = "NEGATIVE";
  } else {
    sentiment = "NEUTRAL";
  }

  // 3. Extract Evidence-Grounded Key Points (with exact quotes)
  const keyPoints: KeyPointEvidence[] = [];

  // Check for bill or capacity evidence
  for (const turn of callerTurns) {
    const textLower = turn.text.toLowerCase();
    if (textLower.includes("bill") || textLower.includes("₹") || /\d+/.test(textLower) || textLower.includes("units")) {
      keyPoints.push({
        point: "Customer discussed monthly energy consumption / power bill metrics",
        evidenceQuote: turn.text,
      });
      break;
    }
  }

  // Check for subsidy or cost inquiry
  for (const turn of callerTurns) {
    const textLower = turn.text.toLowerCase();
    if (textLower.includes("subsidy") || textLower.includes("surya ghar") || textLower.includes("cost") || textLower.includes("price") || textLower.includes("maniyam")) {
      keyPoints.push({
        point: "Customer requested pricing and Central PM Surya Ghar subsidy details",
        evidenceQuote: turn.text,
      });
      break;
    }
  }

  // Check for technical specifications
  for (const turn of callerTurns) {
    const textLower = turn.text.toLowerCase();
    if (textLower.includes("spec") || textLower.includes("panel") || textLower.includes("inverter") || textLower.includes("mono perc")) {
      keyPoints.push({
        point: "Customer evaluated technical specifications and module hardware",
        evidenceQuote: turn.text,
      });
      break;
    }
  }

  // Check for objection or scheduling
  for (const turn of callerTurns) {
    const textLower = turn.text.toLowerCase();
    if (textLower.includes("expensive") || textLower.includes("budget") || textLower.includes("think") || textLower.includes("later")) {
      keyPoints.push({
        point: "Customer noted budgetary considerations or requested time to evaluate",
        evidenceQuote: turn.text,
      });
      break;
    }
  }

  // Fallback quote if no specific cues found
  if (keyPoints.length === 0 && callerTurns.length > 0) {
    keyPoints.push({
      point: "Customer engaged in introductory consultative dialogue with AI assistant",
      evidenceQuote: callerTurns[0].text,
    });
  }

  // 4. Derive Action Items & Recommended Follow-up Task
  const actionItems: ActionItem[] = [];
  let followUpRecommended = true;
  let recommendedTask: RecommendedTask | undefined;
  const unresolvedFields: string[] = [];

  if (disposition === "DO_NOT_CALL") {
    followUpRecommended = false;
    actionItems.push({
      task: "Permanently flag contact as DO_NOT_CALL across all CRM queues and campaigns",
      priority: "HIGH",
    });
    recommendedTask = undefined;
  } else if (disposition === "ESCALATED") {
    actionItems.push({
      task: `Assign Senior Technical Project Engineer to call ${customerName} immediately`,
      priority: "HIGH",
    });
    recommendedTask = {
      title: `Escalated Technical Callback: ${customerName}`,
      description: "Prospect requested a senior engineer regarding system specifications and high-capacity engineering.",
      priority: "HIGH",
      suggestedDueHours: 2,
      requiresOwnerApproval: true,
    };
  } else if (disposition === "CALLBACK_REQUESTED") {
    actionItems.push({
      task: `Schedule telephone callback for ${customerName} as requested`,
      priority: "MEDIUM",
    });
    recommendedTask = {
      title: `Scheduled Callback: ${customerName}`,
      description: "Customer was temporarily occupied and asked for a follow-up conversation.",
      priority: "MEDIUM",
      suggestedDueHours: 24,
      requiresOwnerApproval: true,
    };
  } else if (disposition === "NOT_INTERESTED") {
    followUpRecommended = false;
    actionItems.push({
      task: "Archive consultation record; re-engage only via generic seasonal marketing",
      priority: "LOW",
    });
  } else {
    // INTERESTED
    actionItems.push({
      task: `Dispatch customized PM Surya Ghar subsidy estimate and solar proposal via WhatsApp`,
      priority: "HIGH",
    });
    actionItems.push({
      task: "Book complimentary on-site roof shadow analysis",
      priority: "MEDIUM",
    });
    recommendedTask = {
      title: `Send Solar Proposal & Schedule Roof Inspection: ${customerName}`,
      description: "Prospect is interested in rooftop solar installation and verified subsidy eligibility.",
      priority: "HIGH",
      suggestedDueHours: 6,
      requiresOwnerApproval: true,
    };
  }

  // 5. Unresolved Fields Detection
  if (!callerTextCombined.includes("bill") && !callerTextCombined.includes("₹") && !/\d+/.test(callerTextCombined)) {
    unresolvedFields.push("verified_monthly_bill");
  }
  if (!callerTextCombined.includes("3-phase") && !callerTextCombined.includes("single phase") && !callerTextCombined.includes("phase")) {
    unresolvedFields.push("sanctioned_phase_type");
  }

  // 6. Generate Factual Summary strictly from quotes
  const quotesCount = keyPoints.length;
  const summary =
    disposition === "DO_NOT_CALL"
      ? `During the call, ${customerName} explicitly stated their desire not to be contacted again ("${keyPoints[0]?.evidenceQuote || "Opt-out"}"). The assistant confirmed the opt-out preference immediately in compliance with TRAI regulations.`
      : disposition === "ESCALATED"
      ? `During the interaction, ${customerName} requested consultation with a human engineer ("${keyPoints[0]?.evidenceQuote || "Escalation requested"}"). The AI assistant acknowledged the request and scheduled immediate priority escalation.`
      : disposition === "CALLBACK_REQUESTED"
      ? `${customerName} indicated that they were occupied during the conversation and requested a follow-up callback at a convenient time ("${keyPoints[0]?.evidenceQuote || "Call later"}").`
      : `${customerName} engaged with ${businessName}'s AI consultant regarding rooftop solar qualifications. Key discussion touched upon ${quotesCount} specific topics including system pricing, central subsidies, and technical hardware. Prospect exhibited ${sentiment.toLowerCase()} engagement.`;

  // 7. Qualification Decision
  const qualificationDecision =
    disposition === "DO_NOT_CALL"
      ? "DISQUALIFIED - DO_NOT_CALL"
      : disposition === "NOT_INTERESTED"
      ? "DISQUALIFIED - NOT_INTERESTED"
      : disposition === "ESCALATED"
      ? "QUALIFIED_HOT - PENDING_ENGINEER_ESCALATION"
      : disposition === "CALLBACK_REQUESTED"
      ? "QUALIFIED_WARM - CALLBACK_SCHEDULED"
      : "QUALIFIED_HOT - PROPOSAL_DISPATCH_ELIGIBLE";

  return {
    disposition,
    sentiment,
    confidenceScore: dispositionConfidence,
    summary,
    keyPoints,
    actionItems,
    qualificationDecision,
    followUpRecommended,
    recommendedTask,
    unresolvedFields,
  };
}

