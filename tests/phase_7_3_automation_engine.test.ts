/**
 * VoiceNexus AI — Phase 7.3 Automation Engine Unit Test Suite
 * Tests rule evaluation, callback scheduling extraction, WhatsApp draft generation,
 * notification adapters, DNC preemption, consent validation, and human approval workflow.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { evaluateAutomationRule } from "../src/lib/automations/rule-engine";
import {
  type AutomationRule,
  type CallAutomationContext,
  buildActionIdempotencyKey,
  AutomationRuleSchema
} from "../src/lib/automations/types";
import {
  extractCallbackScheduling,
  buildCallbackTaskPayload
} from "../src/lib/automations/callback-scheduler";
import { generateCustomerWhatsAppDraft } from "../src/lib/automations/whatsapp-draft-generator";
import {
  MockConsoleAdapter,
  EmailAdapter,
  WhatsAppStaffAdapter,
  WebhookAdapter,
  verifyWebhookSignature,
  WebhookReplayProtector
} from "../src/lib/automations/notification-adapters";
import { ActionExecutor } from "../src/lib/automations/action-executor";
import type { DbQueryRunner } from "../src/lib/workers/call-analysis-worker";
import type { ValidatedCallAnalysisResult } from "../src/lib/intelligence/types";

const mockAnalysisBase: ValidatedCallAnalysisResult = {
  summary: "Customer inquired about 5kW solar system with ₹8,500 monthly bill.",
  businessOutcome: "QUALIFIED",
  complianceState: "NONE",
  escalationState: "NONE",
  sentiment: "POSITIVE",
  confidenceScore: 0.95,
  evidenceCoverage: 0.8,
  extractionConfidence: 0.95,
  qualificationDecision: "QUALIFIED",
  followUpRecommended: true,
  intelligenceData: {
    customerIntent: {
      value: "Install rooftop solar system",
      evidenceSegmentIds: ["seg-1"],
      exactQuote: "I want to install solar",
      speaker: "CUSTOMER",
      confidence: 1.0,
      verificationState: "VERIFIED"
    },
    customerRequirements: [
      {
        value: "5kW on-grid rooftop solar",
        evidenceSegmentIds: ["seg-2"],
        exactQuote: "5kW on-grid system",
        speaker: "CUSTOMER",
        confidence: 0.95,
        verificationState: "VERIFIED"
      }
    ],
    productServiceInterest: null,
    budget: {
      value: "₹8,500 monthly",
      evidenceSegmentIds: ["seg-3"],
      exactQuote: "₹8,500 electricity bill",
      speaker: "CUSTOMER",
      confidence: 0.9,
      verificationState: "VERIFIED"
    },
    purchaseTimeline: {
      value: "Within 3 weeks",
      evidenceSegmentIds: ["seg-4"],
      exactQuote: "call me tomorrow at 4 pm",
      speaker: "CUSTOMER",
      confidence: 0.9,
      verificationState: "VERIFIED"
    },
    locationRequirements: null,
    customerObjections: [],
    competitorMentions: [],
    buyingSignals: [
      {
        value: "Requested site survey",
        evidenceSegmentIds: ["seg-5"],
        exactQuote: "please come and inspect the roof",
        speaker: "CUSTOMER",
        confidence: 0.95,
        verificationState: "VERIFIED"
      }
    ],
    customerQuestions: [],
    unresolvedQuestions: [],
    recommendedNextAction: {
      value: "Schedule site inspection",
      evidenceSegmentIds: [],
      exactQuote: "",
      speaker: "AGENT",
      confidence: 0.9,
      verificationState: "VERIFIED"
    },
    rejectedEvidence: []
  },
  leadScoring: {
    totalScore: 85,
    normalizedObservedScore: 85.0,
    observedWeightTotal: 1.0,
    evidenceCoverage: 0.8,
    extractionConfidence: 0.95,
    classification: "HOT",
    scoringFactors: {},
    unresolvedUnknowns: [],
    scoringVersion: "v1.0"
  },
  provider: "GROQ",
  model: "openai/gpt-oss-20b",
  processingDurationMs: 450
};

function createMockContext(overrides: Partial<CallAutomationContext> = {}): CallAutomationContext {
  return {
    organizationId: "11111111-1111-1111-1111-111111111111",
    callSessionId: "22222222-2222-2222-2222-222222222222",
    leadId: "33333333-3333-3333-3333-333333333333",
    customerName: "Karthik Subramanian",
    customerPhone: "+91 98400 12345",
    whatsappConsent: true,
    whatsappConsentReference: "CONSENT-APP-12345",
    language: "en",
    analysis: { ...mockAnalysisBase },
    lead: {
      id: "33333333-3333-3333-3333-333333333333",
      organization_id: "11111111-1111-1111-1111-111111111111",
      name: "Karthik Subramanian",
      phone: "+91 98400 12345",
      status: "NEW",
      score: 85,
      do_not_call: false,
      whatsapp_consent: true
    },
    ...overrides
  };
}

describe("Phase 7.3 — Business Automation Engine Suite", () => {
  // --------------------------------------------------------------------------
  // TEST 1: Qualified lead follow-up
  // --------------------------------------------------------------------------
  test("1. evaluates LEAD_QUALIFIED trigger and matches qualified call outcome", () => {
    const context = createMockContext();
    const rule: AutomationRule = {
      id: "44444444-4444-4444-4444-444444444444",
      organizationId: context.organizationId,
      title: "Qualified Solar Lead Follow-up",
      triggerEvent: "LEAD_QUALIFIED",
      triggerConditions: { minScore: 50 },
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: { taskTitleTemplate: "Consultation for {{customer_name}}" },
      status: "ACTIVE"
    };

    const res = evaluateAutomationRule(rule, context);
    assert.equal(res.matches, true);
    assert.equal(res.matchedTrigger, "LEAD_QUALIFIED");
  });

  // --------------------------------------------------------------------------
  // TEST 2: Callback requested with exact time
  // --------------------------------------------------------------------------
  test("2. extracts exact callback time when explicitly stated in customer conversation", () => {
    const context = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        intelligenceData: {
          ...mockAnalysisBase.intelligenceData,
          purchaseTimeline: {
            value: "Tomorrow 4 PM",
            evidenceSegmentIds: ["seg-4"],
            exactQuote: "please call me tomorrow at 4 pm",
            speaker: "CUSTOMER",
            confidence: 0.95,
            verificationState: "VERIFIED"
          }
        }
      }
    });

    const extraction = extractCallbackScheduling(context);
    assert.equal(extraction.isRequested, true);
    assert.equal(extraction.scheduleStatus, "EXACT_TIME");
    assert.equal(extraction.requestedTime, "16:00:00");
    assert.equal(extraction.timezone, "Asia/Kolkata");
    assert.ok(extraction.resolvedDueDate.includes("16:00:00") || extraction.requestedTime === "16:00:00");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Missing callback time (approximate time window without hallucination)
  // --------------------------------------------------------------------------
  test("3. handles approximate callback time without hallucinating an exact hour", () => {
    const context = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        intelligenceData: {
          ...mockAnalysisBase.intelligenceData,
          purchaseTimeline: {
            value: "Tomorrow evening",
            evidenceSegmentIds: ["seg-4"],
            exactQuote: "call me tomorrow evening",
            speaker: "CUSTOMER",
            confidence: 0.95,
            verificationState: "VERIFIED"
          }
        }
      }
    });

    const extraction = extractCallbackScheduling(context);
    assert.equal(extraction.isRequested, true);
    assert.equal(extraction.scheduleStatus, "APPROXIMATE_TIME");
    assert.equal(extraction.requestedTime, null, "Must NOT hallucinate an exact hour like 18:00:00");
    assert.ok(extraction.unresolvedSchedulingNotes?.includes("tomorrow evening"));

    const taskPayload = buildCallbackTaskPayload(context, extraction);
    assert.ok(taskPayload.description.includes("APPROXIMATE TIME WINDOW"));
    assert.ok(taskPayload.description.includes("tomorrow evening"));
  });

  // --------------------------------------------------------------------------
  // TEST 4: Supervisor follow-up on escalation
  // --------------------------------------------------------------------------
  test("4. evaluates ESCALATION_REQUESTED trigger and prioritizes supervisor review", () => {
    const context = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        escalationState: "FOLLOW_UP_PENDING"
      }
    });

    const rule: AutomationRule = {
      id: "55555555-5555-5555-5555-555555555555",
      organizationId: context.organizationId,
      title: "Urgent Supervisor Escalation",
      triggerEvent: "ESCALATION_REQUESTED",
      triggerConditions: {},
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: { taskTitleTemplate: "URGENT: Review {{customer_name}}" },
      status: "ACTIVE"
    };

    const res = evaluateAutomationRule(rule, context);
    assert.equal(res.matches, true);
    assert.equal(res.matchedTrigger, "ESCALATION_REQUESTED");
  });

  // --------------------------------------------------------------------------
  // TEST 5: DNC suppression
  // --------------------------------------------------------------------------
  test("5. enforces DNC suppression on callbacks and promotional tasks", () => {
    const context = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        complianceState: "DNC_REGISTERED"
      },
      lead: {
        id: "33333333-3333-3333-3333-333333333333",
        organization_id: "11111111-1111-1111-1111-111111111111",
        name: "DNC Customer",
        phone: "+91 98400 12345",
        status: "DO_NOT_CALL",
        score: 0,
        do_not_call: true
      }
    });

    // Callback scheduling check
    const extraction = extractCallbackScheduling(context);
    assert.equal(extraction.isRequested, false);
    assert.equal(extraction.scheduleStatus, "SUPPRESSED_DNC");

    // WhatsApp draft generation check
    const draft = generateCustomerWhatsAppDraft(context);
    assert.equal(draft.generated, false);
    assert.equal(draft.skippedDnc, true);
    assert.equal(draft.status, "REJECTED");
  });

  // --------------------------------------------------------------------------
  // TEST 6: WhatsApp consent validation
  // --------------------------------------------------------------------------
  test("6. blocks WhatsApp message draft generation when customer consent is missing", () => {
    const context = createMockContext({
      whatsappConsent: false,
      whatsappConsentReference: null,
      lead: {
        id: "33333333-3333-3333-3333-333333333333",
        organization_id: "11111111-1111-1111-1111-111111111111",
        name: "No Consent Lead",
        phone: "+91 98400 12345",
        status: "QUALIFIED",
        score: 85,
        do_not_call: false,
        whatsapp_consent: false
      }
    });

    const draft = generateCustomerWhatsAppDraft(context);
    assert.equal(draft.generated, false);
    assert.equal(draft.consentMissing, true);
    assert.equal(draft.status, "REJECTED");
  });

  // --------------------------------------------------------------------------
  // TEST 7: Customer WhatsApp draft generation with multi-lingual support
  // --------------------------------------------------------------------------
  test("7. generates grounded WhatsApp message draft in Tamil and English defaulting to DRAFT_PENDING_APPROVAL", () => {
    const enContext = createMockContext({ language: "en" });
    const enDraft = generateCustomerWhatsAppDraft(enContext);
    assert.equal(enDraft.generated, true);
    assert.equal(enDraft.status, "DRAFT_PENDING_APPROVAL");
    assert.ok(enDraft.renderedMessage.includes("VoiceNexus Solar"));
    assert.ok(enDraft.renderedMessage.includes("5kW on-grid rooftop solar"));
    assert.ok(enDraft.renderedMessage.includes("₹78,000"));

    const taContext = createMockContext({ language: "ta" });
    const taDraft = generateCustomerWhatsAppDraft(taContext);
    assert.equal(taDraft.generated, true);
    assert.equal(taDraft.status, "DRAFT_PENDING_APPROVAL");
    assert.ok(taDraft.renderedMessage.includes("வணக்கம்"));
    assert.ok(taDraft.renderedMessage.includes("5kW on-grid rooftop solar"));

    const tanglishContext = createMockContext({ language: "tanglish" });
    const tanglishDraft = generateCustomerWhatsAppDraft(tanglishContext);
    assert.equal(tanglishDraft.generated, true);
    assert.equal(tanglishDraft.status, "DRAFT_PENDING_APPROVAL");
    assert.ok(tanglishDraft.renderedMessage.includes("Vanakkam"));
  });

  // --------------------------------------------------------------------------
  // TEST 8: Multi-tenant isolation
  // --------------------------------------------------------------------------
  test("8. strictly rejects automation execution when organization ID does not match rule", () => {
    const context = createMockContext({
      organizationId: "11111111-1111-1111-1111-111111111111"
    });

    const alienRule: AutomationRule = {
      id: "66666666-6666-6666-6666-666666666666",
      organizationId: "99999999-9999-9999-9999-999999999999", // Different Org!
      title: "Alien Organization Rule",
      triggerEvent: "CALL_COMPLETED",
      triggerConditions: {},
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: {},
      status: "ACTIVE"
    };

    const res = evaluateAutomationRule(alienRule, context);
    assert.equal(res.matches, false);
    assert.ok(res.reason?.includes("tenant isolation"));
  });

  // --------------------------------------------------------------------------
  // TEST 9: Notification Adapters (Mock, Email, Staff WhatsApp, Signed Webhook)
  // --------------------------------------------------------------------------
  test("9. verifies internal staff notification adapters including signed HMAC webhook", async () => {
    const mockAdapter = new MockConsoleAdapter();
    const mockRes = await mockAdapter.send({
      organizationId: "org-1",
      callSessionId: "call-1",
      eventType: "NEW_QUALIFIED_LEAD",
      recipient: "console",
      title: "Test Alert",
      message: "Lead qualified",
      severity: "INFO"
    });
    assert.equal(mockRes.success, true);
    assert.equal(mockRes.delivered, true);
    assert.ok(mockRes.providerMessageId?.startsWith("mock-console-"));

    const emailAdapter = new EmailAdapter({ mockMode: true });
    const emailRes = await emailAdapter.send({
      organizationId: "org-1",
      callSessionId: "call-1",
      eventType: "NEW_QUALIFIED_LEAD",
      recipient: "sales@voicenexus.ai",
      title: "Email Alert",
      message: "Lead qualified",
      severity: "INFO"
    });
    assert.equal(emailRes.success, true);
    assert.ok(emailRes.providerMessageId?.startsWith("email-mock-"));

    const waAdapter = new WhatsAppStaffAdapter({ mockMode: true });
    const waRes = await waAdapter.send({
      organizationId: "org-1",
      callSessionId: "call-1",
      eventType: "SUPERVISOR_ESCALATION",
      recipient: "+91 99999 88888",
      title: "Escalation Alert",
      message: "Caller needs manager",
      severity: "CRITICAL"
    });
    assert.equal(waRes.success, true);
    assert.ok(waRes.providerMessageId?.startsWith("wa-staff-"));

    const webhookAdapter = new WebhookAdapter({ mockMode: true });
    const webhookRes = await webhookAdapter.send({
      organizationId: "org-1",
      callSessionId: "call-1",
      eventType: "LEAD_QUALIFIED",
      recipient: "https://crm.external.com/webhooks/voicenexus",
      title: "Webhook Push",
      message: "Payload",
      severity: "INFO"
    });
    assert.equal(webhookRes.success, true);
    assert.ok(webhookRes.providerMessageId?.startsWith("webhook-"));
  });

  // --------------------------------------------------------------------------
  // TEST 10: Lead Status Preservation under DNC
  // --------------------------------------------------------------------------
  test("10. preserves DO_NOT_CALL compliance state and rejects downgrade to QUALIFIED", () => {
    const context = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        complianceState: "DNC_REGISTERED"
      },
      lead: {
        id: "33333333-3333-3333-3333-333333333333",
        organization_id: "11111111-1111-1111-1111-111111111111",
        name: "Preserved DNC Lead",
        phone: "+91 98400 12345",
        status: "DO_NOT_CALL",
        score: 0,
        do_not_call: true
      }
    });

    const rule: AutomationRule = {
      id: "77777777-7777-7777-7777-777777777777",
      organizationId: context.organizationId,
      title: "Auto-Promote Lead Status",
      triggerEvent: "CALL_COMPLETED",
      triggerConditions: {
        disallowedCompliance: ["DNC_REGISTERED", "DNC_REQUESTED"]
      },
      actionType: "UPDATE_LEAD_STATUS",
      actionConfig: { targetLeadStatus: "QUALIFIED" },
      status: "ACTIVE"
    };

    const res = evaluateAutomationRule(rule, context);
    assert.equal(res.matches, false);
    assert.ok(res.reason?.includes("disallowed compliance"));
  });

  // --------------------------------------------------------------------------
  // TEST 11: High-Intent and Score Threshold Triggers
  // --------------------------------------------------------------------------
  test("11. evaluates HIGH_INTENT_DETECTED and LEAD_SCORE_THRESHOLD triggers accurately", () => {
    const context = createMockContext();

    const highIntentRule: AutomationRule = {
      id: "88888888-8888-8888-8888-888888888888",
      organizationId: context.organizationId,
      title: "High Intent Alert",
      triggerEvent: "HIGH_INTENT_DETECTED",
      triggerConditions: {},
      actionType: "NOTIFY_INTERNAL_STAFF",
      actionConfig: { alertTemplate: "High intent!" },
      status: "ACTIVE"
    };

    assert.equal(evaluateAutomationRule(highIntentRule, context).matches, true);

    const scoreThresholdRule: AutomationRule = {
      id: "99999999-9999-9999-9999-999999999999",
      organizationId: context.organizationId,
      title: "Score Threshold 80+",
      triggerEvent: "LEAD_SCORE_THRESHOLD",
      triggerConditions: { minScore: 80 },
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: {},
      status: "ACTIVE"
    };

    assert.equal(evaluateAutomationRule(scoreThresholdRule, context).matches, true);

    const unreachedScoreRule: AutomationRule = {
      ...scoreThresholdRule,
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      triggerConditions: { minScore: 95 } // context is 85
    };

    assert.equal(evaluateAutomationRule(unreachedScoreRule, context).matches, false);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Unanswered Questions & Objections Triggers
  // --------------------------------------------------------------------------
  test("12. evaluates UNANSWERED_QUESTION and UNRESOLVED_OBJECTION triggers", () => {
    const contextWithUnknowns = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        intelligenceData: {
          ...mockAnalysisBase.intelligenceData,
          customerObjections: [
            {
              value: "Concerned about roof waterproofing warranty",
              evidenceSegmentIds: ["seg-9"],
              exactQuote: "will this leak my roof?",
              speaker: "CUSTOMER",
              confidence: 0.9,
              verificationState: "VERIFIED"
            }
          ],
          unresolvedQuestions: [
            {
              value: "Exact battery backup inverter options",
              evidenceSegmentIds: ["seg-10"],
              exactQuote: "what battery is included?",
              speaker: "CUSTOMER",
              confidence: 0.85,
              verificationState: "VERIFIED"
            }
          ]
        },
        leadScoring: {
          ...mockAnalysisBase.leadScoring,
          unresolvedUnknowns: ["Battery backup inverter capacity"]
        }
      }
    });

    const objectionRule: AutomationRule = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      organizationId: contextWithUnknowns.organizationId,
      title: "Objection Resolution Task",
      triggerEvent: "UNRESOLVED_OBJECTION",
      triggerConditions: {},
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: {},
      status: "ACTIVE"
    };

    assert.equal(evaluateAutomationRule(objectionRule, contextWithUnknowns).matches, true);

    const unansweredRule: AutomationRule = {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      organizationId: contextWithUnknowns.organizationId,
      title: "Answer Open Technical Inquiries",
      triggerEvent: "UNANSWERED_QUESTION",
      triggerConditions: {},
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: {},
      status: "ACTIVE"
    };

    assert.equal(evaluateAutomationRule(unansweredRule, contextWithUnknowns).matches, true);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Action-Level Idempotency Key Construction
  // --------------------------------------------------------------------------
  test("13. constructs distinct action-level idempotency keys across actions and versions", () => {
    const key1 = buildActionIdempotencyKey({
      callSessionId: "call-1",
      ruleId: "rule-A",
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionIdentifier: "task-1",
      analysisVersion: 1
    });

    const key2 = buildActionIdempotencyKey({
      callSessionId: "call-1",
      ruleId: "rule-A",
      actionType: "NOTIFY_INTERNAL_STAFF",
      actionIdentifier: "alert-1",
      analysisVersion: 1
    });

    const keyV2 = buildActionIdempotencyKey({
      callSessionId: "call-1",
      ruleId: "rule-A",
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionIdentifier: "task-1",
      analysisVersion: 2
    });

    assert.equal(key1, "auto:call-1:rule-A:CREATE_FOLLOW_UP_TASK:task-1:v1");
    assert.equal(key2, "auto:call-1:rule-A:NOTIFY_INTERNAL_STAFF:alert-1:v1");
    assert.equal(keyV2, "auto:call-1:rule-A:CREATE_FOLLOW_UP_TASK:task-1:v2");
    assert.notEqual(key1, key2);
    assert.notEqual(key1, keyV2);
  });

  // --------------------------------------------------------------------------
  // TEST 14: Multi-Action Rule Schema Validation
  // --------------------------------------------------------------------------
  test("14. validates multi-action rules and rejects rules with no actions", () => {
    const validMultiActionRule = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      title: "Multi Action Lead Qualified Flow",
      triggerEvent: "LEAD_QUALIFIED",
      triggerConditions: {},
      actions: [
        {
          actionId: "action-task",
          actionType: "CREATE_FOLLOW_UP_TASK",
          actionConfig: { taskTitleTemplate: "Call customer" }
        },
        {
          actionId: "action-alert",
          actionType: "NOTIFY_INTERNAL_STAFF",
          actionConfig: { alertTemplate: "Qualified lead alert" }
        }
      ]
    };

    const parsed = AutomationRuleSchema.safeParse(validMultiActionRule);
    assert.equal(parsed.success, true);

    const invalidRule = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      title: "Invalid Rule With No Actions",
      triggerEvent: "LEAD_QUALIFIED",
      triggerConditions: {}
    };

    const invalidParsed = AutomationRuleSchema.safeParse(invalidRule);
    assert.equal(invalidParsed.success, false);
  });

  // --------------------------------------------------------------------------
  // TEST 15: Callback Safety When Not Requested
  // --------------------------------------------------------------------------
  test("15. skips callback creation safely when customer intent does not request a callback", async () => {
    const contextNoCallback = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        businessOutcome: "INFORMATIONAL_COMPLETE",
        followUpRecommended: false,
        intelligenceData: {
          ...mockAnalysisBase.intelligenceData,
          purchaseTimeline: null,
          recommendedNextAction: null
        }
      }
    });

    const extraction = extractCallbackScheduling(contextNoCallback);
    assert.equal(extraction.isRequested, false);

    // Verify ActionExecutor skips callback creation when isRequested is false
    const mockDb: DbQueryRunner = {
      query: async <T>() => ({ rows: [] as T[] })
    };
    const executor = new ActionExecutor(mockDb);
    const callbackRule: AutomationRule = {
      id: "cb-rule-1",
      organizationId: contextNoCallback.organizationId,
      title: "Callback Rule",
      triggerEvent: "CALLBACK_REQUESTED",
      triggerConditions: {},
      actionType: "SCHEDULE_CALLBACK",
      actionConfig: {},
      status: "ACTIVE"
    };

    const result = await executor.executeAction(callbackRule, contextNoCallback);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.ok(result.skipReason?.includes("customer did not request a callback"));
  });

  // --------------------------------------------------------------------------
  // TEST 16: Webhook Signature Verification and Duplicate Replay Prevention
  // --------------------------------------------------------------------------
  test("16. verifies HMAC-SHA256 signatures and detects duplicate webhook replay", () => {
    const secret = "test-webhook-secret-key-12345";
    const rawBody = JSON.stringify({ event: "LEAD_QUALIFIED", leadId: "lead-1" });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    // 1. Valid signature
    const validCheck = verifyWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      secret
    });
    assert.equal(validCheck.valid, true);

    // 2. Tampered body
    const tamperedCheck = verifyWebhookSignature({
      rawBody: JSON.stringify({ event: "LEAD_QUALIFIED", leadId: "lead-tampered" }),
      signatureHeader: `sha256=${signature}`,
      secret
    });
    assert.equal(tamperedCheck.valid, false);

    // 3. Replay Protection
    const replayProtector = new WebhookReplayProtector(5000);
    const eventId = "evt_unique_12345";

    assert.equal(replayProtector.isReplay(eventId), false, "First delivery should not be a replay");
    assert.equal(replayProtector.isReplay(eventId), true, "Second delivery of same eventId must be detected as replay");
  });

  // --------------------------------------------------------------------------
  // TEST 17: DNC Action Boundary Enforcement (Prohibited vs Allowed)
  // --------------------------------------------------------------------------
  test("17. strictly enforces DNC boundary: prohibits marketing while allowing compliance alerts", async () => {
    const dncContext = createMockContext({
      analysis: {
        ...mockAnalysisBase,
        complianceState: "DNC_REGISTERED",
        escalationState: "NONE"
      },
      lead: {
        id: "lead-dnc",
        organization_id: "org-1",
        name: "Test DNC Lead",
        phone: "+919999999999",
        status: "DO_NOT_CALL",
        score: 0,
        do_not_call: true,
        whatsapp_consent: true
      }
    });

    const mockDb: DbQueryRunner = {
      query: async <T>() => ({ rows: [{ id: "mock-id" }] as unknown as T[] })
    };
    const executor = new ActionExecutor(mockDb);

    // Prohibited 1: Promotional WhatsApp
    const waRule: AutomationRule = {
      id: "rule-wa",
      organizationId: "org-1",
      title: "Draft WhatsApp",
      triggerEvent: "LEAD_QUALIFIED",
      triggerConditions: {},
      actionType: "GENERATE_WHATSAPP_DRAFT",
      actionConfig: {},
      status: "ACTIVE"
    };
    const waRes = await executor.executeAction(waRule, dncContext);
    assert.equal(waRes.skipped, true);
    assert.ok(waRes.skipReason?.includes("Do-Not-Call"));

    // Prohibited 2: Sales follow-up task
    const salesRule: AutomationRule = {
      id: "rule-sales",
      organizationId: "org-1",
      title: "Sales Task",
      triggerEvent: "LEAD_QUALIFIED",
      triggerConditions: {},
      actionType: "CREATE_FOLLOW_UP_TASK",
      actionConfig: { taskPriority: "HIGH" },
      status: "ACTIVE"
    };
    const salesRes = await executor.executeAction(salesRule, dncContext);
    assert.equal(salesRes.skipped, true);
    assert.ok(salesRes.skipReason?.includes("Do-Not-Call"));

    // Allowed: Internal compliance alert
    const staffRule: AutomationRule = {
      id: "rule-staff",
      organizationId: "org-1",
      title: "Compliance Alert",
      triggerEvent: "DISPOSITION_EQUALS",
      triggerConditions: {},
      actionType: "NOTIFY_INTERNAL_STAFF",
      actionConfig: { notificationChannel: "CONSOLE" },
      status: "ACTIVE"
    };
    const staffRes = await executor.executeAction(staffRule, dncContext);
    assert.equal(staffRes.success, true);
    assert.equal(staffRes.skipped, undefined);
  });
});
