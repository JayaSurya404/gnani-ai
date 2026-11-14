# VoiceNexus AI — Core Agent Specifications

This document defines the strict contracts, input/output schemas, prompt strategies, and safety constraints for the four backend AI agents in VoiceNexus AI.

---

## 1. Lead Intelligence Agent

### Purpose
Analyzes customer inquiry context, source attribution, visitor events, and form data to produce an objective, evidence-based lead intelligence assessment before any outreach or call is initiated.

### Input Schema (TypeScript / Zod)
```typescript
export interface LeadIntelligenceInput {
  leadId: string;
  businessProfile: {
    name: string;
    industry: string;
    productsOrServices: Array<{ id: string; name: string; description: string; priceRange?: string }>;
  };
  contactInfo: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
  };
  source: {
    channel: string;
    utmCampaign?: string;
    utmSource?: string;
    referrer?: string;
  };
  behaviorEvents: Array<{
    eventType: "PAGE_VIEW" | "PRODUCT_VIEW" | "FORM_SUBMISSION" | "CTA_CLICK" | "DIRECT_CONTACT_CLICK";
    target?: string;
    timestamp: string;
  }>;
  inquiryText?: string;
}
```

### Output Schema (Zod / JSON)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": [
    "score",
    "temperature",
    "primaryInterest",
    "buyingIntent",
    "knownFacts",
    "missingInformation",
    "riskFlags",
    "recommendedQualificationQuestions"
  ],
  "properties": {
    "score": { "type": "integer", "minimum": 0, "maximum": 100 },
    "temperature": { "type": "string", "enum": ["HOT", "WARM", "COLD"] },
    "primaryInterest": { "type": "string" },
    "buyingIntent": { "type": "string", "enum": ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] },
    "knownFacts": { "type": "array", "items": { "type": "string" } },
    "missingInformation": { "type": "array", "items": { "type": "string" } },
    "riskFlags": { "type": "array", "items": { "type": "string" } },
    "recommendedQualificationQuestions": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 4
    }
  }
}
```

### Behavioral Rules
- Never hallucinate budget, timeline, or decision authority not present in the input.
- Classify `HOT` only when the customer explicitly requested contact, visited pricing/product pages multiple times, or submitted a detailed requirement.
- Explicitly list `missingInformation` that the Voice Conversation Agent should ask about.

---

## 2. Voice Conversation Agent

### Purpose
Conducts live, bidirectional spoken conversations over Twilio telephony or browser microphone sessions, dynamically adjusting between English, Tamil, and Tanglish while adhering strictly to business knowledge.

### Input Context
- **System Instruction**: Business identity, agent persona, objective, permitted answers.
- **Language Directive**:
  - `AUTO`: Match customer's language turn-by-turn (English, Tamil, Tanglish).
  - `TAMIL`: Natural conversational Tamil.
  - `TANGLISH`: Conversational Tamil-English mix.
  - `ENGLISH`: Professional business English.
- **Knowledge Base**: Approved product catalog, pricing parameters, operating hours, FAQs.
- **Lead Context**: Customer name, primary interest, missing information from Lead Intelligence Agent.
- **Conversation History**: Chronological turns with speaker tags (`CUSTOMER` / `AI`).

### Control Metadata Contract
Each turn outputs text for Gnani Timbre TTS along with control metadata:
```typescript
export interface VoiceAgentTurnResponse {
  spokenText: string;
  languageDetected: "en" | "ta" | "tanglish";
  controlSignal: "CONTINUE" | "REQUEST_CLARIFICATION" | "HUMAN_HANDOFF" | "END_CALL";
  leadUpdates?: {
    identifiedNeed?: string;
    budgetRange?: string;
    timeline?: string;
    preferredCallbackTime?: string;
  };
}
```

### Critical Conversational Safety Rules
1. **AI Disclosure**: Turn 1 MUST identify the caller as the AI representative of the business.
2. **Opt-Out (DNC)**: If the caller says "do not call", "remove my number", or expresses firm refusal, the agent must politely acknowledge, emit `END_CALL`, and flag `DO_NOT_CALL`.
3. **No Financial Commitments**: The agent must never finalize prices, offer unauthorized discounts, or sign contracts.
4. **Single-Question Rule**: Ask only one clear question per turn to keep voice interaction natural.

---

## 3. Post-Call Analysis Agent

### Purpose
Analyzes the complete, persisted call transcript to extract an evidence-based summary, qualification outcome, sentiment, customer objections, and key question-and-answer pairs.

### Output Schema (Zod / JSON)
```typescript
export const outcomeSchema = z.object({
  summary: z.string().min(1).max(2000),
  customerNeed: z.string().min(1).max(1000),
  requirements: z.array(z.string()).max(10),
  budgetInformation: z.string().nullable(),
  timeline: z.string().nullable(),
  decisionAuthority: z.string().nullable(),
  objections: z.array(z.string()).max(10),
  questionsAsked: z.array(z.string()).max(20),
  importantAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    transcriptEvidenceTurn: z.number().int().optional()
  })).max(20),
  disposition: z.enum([
    "INTERESTED",
    "FOLLOW_UP",
    "NOT_INTERESTED",
    "NO_ANSWER",
    "WRONG_NUMBER",
    "DO_NOT_CALL",
    "UNKNOWN"
  ]),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]),
  interestLevel: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]),
  confidence: z.number().min(0).max(1),
  recommendedNextAction: z.string(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
});
```

### Grounding Rules
- Every finding in `requirements` and `objections` must be directly referenced from the transcript.
- If a caller did not pick up, the disposition is `NO_ANSWER`, not `NOT_INTERESTED`.
- If the call dropped prematurely, confidence is capped at 0.4.

---

## 4. Follow-up Planner Agent

### Purpose
Transforms verified post-call outcomes and lead intelligence into concrete, owner-approved action items, calendar reminders, or recovery workflows.

### Output Schema (Zod / JSON)
```typescript
export interface FollowUpPlan {
  leadId: string;
  callId?: string;
  proposedAction: "MANUAL_CALL" | "SEND_WHATSAPP" | "SEND_EMAIL" | "PREPARE_QUOTE" | "CLOSE_LOST";
  dueTimestamp: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assigneeRole: "OWNER" | "MANAGER" | "AGENT";
  actionSummary: string;
  draftMessageBody?: string;
  requiresOwnerApproval: boolean;
}
```

### Operational Rules
- `requiresOwnerApproval` is always `true` for any outbound customer communication (WhatsApp/Email/SMS).
- Never execute external side effects autonomously without explicit owner review.

