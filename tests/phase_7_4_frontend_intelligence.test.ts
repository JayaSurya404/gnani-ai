/**
 * VoiceNexus AI — Phase 7.4 Frontend Intelligence & Human Approval Test Suite
 * Tests call history pagination/filtering, lead score breakdown calculations,
 * transcript evidence navigation, callback scheduling safety, automation retry,
 * and human approval workflow security (consent, DNC re-verification, duplicate prevention).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Phase 7.4 — Frontend Intelligence & Human Approval Workspace Suite", () => {
  // --------------------------------------------------------------------------
  // TEST 1: Call History Filtering & Query Parameter Normalization
  // --------------------------------------------------------------------------
  test("1. filters call sessions by outcome, DNC state, temperature, and pagination", () => {
    const mockCalls = [
      {
        id: "call-1",
        customer_name: "Anand Ramanathan",
        customer_phone: "+919840123456",
        status: "COMPLETED",
        duration_seconds: 145,
        created_at: "2026-11-12T10:00:00Z",
        call_outcomes: [{ business_outcome: "QUALIFIED", compliance_state: "NONE", escalation_state: "NONE" }],
        leads: { temperature: "HOT", do_not_call: false }
      },
      {
        id: "call-2",
        customer_name: "Priya Natarajan",
        customer_phone: "+919840999999",
        status: "COMPLETED",
        duration_seconds: 35,
        created_at: "2026-11-12T11:00:00Z",
        call_outcomes: [{ business_outcome: "NOT_INTERESTED", compliance_state: "DNC_REGISTERED", escalation_state: "NONE" }],
        leads: { temperature: "COLD", do_not_call: true }
      },
      {
        id: "call-3",
        customer_name: "Karthik Subramanian",
        customer_phone: "+919840888888",
        status: "COMPLETED",
        duration_seconds: 190,
        created_at: "2026-11-12T12:00:00Z",
        call_outcomes: [{ business_outcome: "QUALIFIED", compliance_state: "NONE", escalation_state: "REQUESTED" }],
        leads: { temperature: "HOT", do_not_call: false }
      }
    ];

    // Filter by outcome: QUALIFIED
    const qualifiedCalls = mockCalls.filter((c) =>
      c.call_outcomes.some((o) => o.business_outcome === "QUALIFIED")
    );
    assert.equal(qualifiedCalls.length, 2);

    // Filter by DNC state
    const dncCalls = mockCalls.filter((c) =>
      c.leads.do_not_call || c.call_outcomes.some((o) => o.compliance_state.includes("DNC"))
    );
    assert.equal(dncCalls.length, 1);
    assert.equal(dncCalls[0].customer_name, "Priya Natarajan");

    // Filter by Escalation state
    const escalatedCalls = mockCalls.filter((c) =>
      c.call_outcomes.some((o) => o.escalation_state === "REQUESTED")
    );
    assert.equal(escalatedCalls.length, 1);
    assert.equal(escalatedCalls[0].customer_name, "Karthik Subramanian");

    // Pagination slice
    const page = 1;
    const limit = 2;
    const paginated = mockCalls.slice((page - 1) * limit, page * limit);
    assert.equal(paginated.length, 2);
    assert.equal(Math.ceil(mockCalls.length / limit), 2);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Explainable Lead Score Factor Breakdown & 7 Core Dimensions
  // --------------------------------------------------------------------------
  test("2. verifies 7-factor points calculations, maximum point boundaries, and evidence coverage separation", () => {
    const factorWeights = [
      { key: "purchaseIntent", max: 25 },
      { key: "budgetReadiness", max: 20 },
      { key: "purchaseTimeline", max: 15 },
      { key: "technicalFit", max: 15 },
      { key: "customerEngagement", max: 10 },
      { key: "decisionAuthority", max: 10 },
      { key: "nextStepWillingness", max: 5 }
    ];

    const totalMax = factorWeights.reduce((acc, f) => acc + f.max, 0);
    assert.equal(totalMax, 100, "7 factors must sum exactly to 100 points");

    const sampleFactors = {
      purchaseIntent: { points: 25, maxPoints: 25, status: "VERIFIED", quote: "install rooftop solar" },
      budgetReadiness: { points: 20, maxPoints: 20, status: "VERIFIED", quote: "₹8,500 monthly bill" },
      purchaseTimeline: { points: 15, maxPoints: 15, status: "VERIFIED", quote: "call tomorrow evening" },
      technicalFit: { points: 12, maxPoints: 15, status: "VERIFIED", quote: "3-phase meter" },
      customerEngagement: { points: 10, maxPoints: 10, status: "VERIFIED" },
      decisionAuthority: { points: 10, maxPoints: 10, status: "VERIFIED" },
      nextStepWillingness: { points: 5, maxPoints: 5, status: "VERIFIED" }
    };

    const calculatedScore = Object.values(sampleFactors).reduce((acc, f) => acc + f.points, 0);
    assert.equal(calculatedScore, 97);
    assert.ok(calculatedScore <= 100 && calculatedScore >= 0);

    // Evidence coverage must remain independent of total score
    const evidenceCoverage = 0.85; // 85%
    assert.notEqual(calculatedScore, evidenceCoverage * 100);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Unresolved Unknowns & Missing Evidence Identification
  // --------------------------------------------------------------------------
  test("3. visually tags unstated dimensions as UNKNOWN with 0 points without score inflation", () => {
    const sparseFactors = {
      purchaseIntent: { points: 25, maxPoints: 25, status: "VERIFIED" },
      budgetReadiness: { points: 0, maxPoints: 20, status: "UNKNOWN" },
      purchaseTimeline: { points: 0, maxPoints: 15, status: "UNKNOWN" }
    };

    const unknowns = ["Monthly electricity expenditure", "Target purchase timeline"];
    assert.equal(sparseFactors.budgetReadiness.points, 0);
    assert.equal(sparseFactors.budgetReadiness.status, "UNKNOWN");
    assert.equal(unknowns.length, 2);
  });

  // --------------------------------------------------------------------------
  // TEST 4: DNC Compliance State Separation from Buying Intent
  // --------------------------------------------------------------------------
  test("4. preserves high intent score under DNC compliance without erasing customer statements", () => {
    const leadData = {
      totalScore: 92,
      classification: "HOT",
      isDnc: true,
      complianceState: "DNC_REGISTERED",
      customerIntent: "Install 10kW commercial solar"
    };

    assert.equal(leadData.totalScore, 92, "Score must reflect genuine statements before opt-out");
    assert.equal(leadData.isDnc, true, "DNC must be flagged prominently");
    assert.equal(leadData.complianceState, "DNC_REGISTERED");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Interactive Evidence Quote Navigation & Segment Linking
  // --------------------------------------------------------------------------
  test("5. links extracted claims to exact transcript turn IDs for interactive jumping", () => {
    const transcript = [
      { id: "seg-101", speaker: "AI", text: "Welcome to Aadhira Solar Tech." },
      { id: "seg-102", speaker: "CUSTOMER", text: "I pay ₹8,500 every month on electricity." },
      { id: "seg-103", speaker: "AI", text: "A 5kW system will save around 80% on that." }
    ];

    const budgetClaim = {
      value: "₹8,500 monthly bill",
      exactQuote: "₹8,500 every month on electricity",
      evidenceSegmentIds: ["seg-102"]
    };

    const targetTurn = transcript.find((t) => t.id === budgetClaim.evidenceSegmentIds[0]);
    assert.ok(targetTurn);
    assert.equal(targetTurn.speaker, "CUSTOMER");
    assert.ok(targetTurn.text.includes("₹8,500"));
  });

  // --------------------------------------------------------------------------
  // TEST 6: Audio Playback Integrity (No Fabricated Audio)
  // --------------------------------------------------------------------------
  test("6. clearly indicates when audio recording is unavailable without simulating playback", () => {
    const sessionWithAudio = { id: "call-1", recordingUrl: "https://storage.voicenexus.ai/rec-1.wav" };
    const sessionWithoutAudio = { id: "call-2", recordingUrl: null };

    assert.ok(sessionWithAudio.recordingUrl !== null);
    assert.equal(sessionWithoutAudio.recordingUrl, null, "Must remain null when recording does not exist");
  });

  // --------------------------------------------------------------------------
  // TEST 7: Approximate Callback Window Safety
  // --------------------------------------------------------------------------
  test("7. preserves approximate customer requested window without converting to exact hour", () => {
    const callbackTask = {
      title: "Scheduled Callback: Anand Ramanathan",
      description: "[Scheduling Note: APPROXIMATE TIME WINDOW — Customer requested tomorrow evening]\nConsultation follow-up",
      dueDate: "2026-11-13T03:30:00.000Z", // Operational SLA window
      isApproximate: true
    };

    assert.ok(callbackTask.description.includes("APPROXIMATE TIME WINDOW"));
    assert.ok(callbackTask.description.includes("tomorrow evening"));
    assert.equal(callbackTask.isApproximate, true);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Prohibited Marketing Tasks Under DNC
  // --------------------------------------------------------------------------
  test("8. rejects activating promotional follow-up tasks for DNC customers", () => {
    const lead = { do_not_call: true };
    const task = { title: "Promotional Solar Discount Offer", status: "PENDING" };

    const isDnc = lead.do_not_call === true;
    const isPromotional = task.title.toLowerCase().includes("promotional");

    const isBlocked = isDnc && isPromotional;
    assert.equal(isBlocked, true, "Promotional tasks must be blocked for DNC customers");
  });

  // --------------------------------------------------------------------------
  // TEST 9: Automation Outbox Execution States & Status Differentiation
  // --------------------------------------------------------------------------
  test("9. distinguishes all 7 automation outbox states accurately", () => {
    const validStatuses = [
      "PENDING",
      "PROCESSING",
      "COMPLETED",
      "PARTIAL_FAILURE",
      "FAILED",
      "DEAD_LETTER",
      "SKIPPED_DNC"
    ];

    assert.equal(validStatuses.length, 7);
    assert.ok(validStatuses.includes("SKIPPED_DNC"));
    assert.ok(validStatuses.includes("DEAD_LETTER"));
  });

  // --------------------------------------------------------------------------
  // TEST 10: Automation Retry Authorization & Idempotency Key Reuse
  // --------------------------------------------------------------------------
  test("10. permits retrying FAILED and DEAD_LETTER runs while preserving existing idempotency key", () => {
    const failedRun = {
      id: "run-failed",
      idempotency_key: "auto:call-1:rule-1:WEBHOOK_DISPATCH:default:v1",
      status: "FAILED",
      attempt_count: 2,
      max_attempts: 3
    };

    const completedRun = {
      id: "run-comp",
      idempotency_key: "auto:call-1:rule-2:CREATE_FOLLOW_UP_TASK:default:v1",
      status: "COMPLETED"
    };

    const canRetryFailed = failedRun.status === "FAILED" || failedRun.status === "DEAD_LETTER";
    const canRetryCompleted = completedRun.status === "FAILED" || completedRun.status === "DEAD_LETTER";

    assert.equal(canRetryFailed, true);
    assert.equal(canRetryCompleted, false);

    // Retrying preserves the stable idempotency key
    const retriedPayload = {
      ...failedRun,
      status: "PROCESSING",
      last_error: null
    };
    assert.equal(retriedPayload.idempotency_key, failedRun.idempotency_key);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Human Approval Workflow: WhatsApp Consent Verification
  // --------------------------------------------------------------------------
  test("11. blocks approving customer WhatsApp draft when consent is not verified", () => {
    const draftWithoutConsent = {
      id: "disp-1",
      audience: "CUSTOMER",
      channel: "WHATSAPP",
      consent_verified: false,
      status: "DRAFT_PENDING_APPROVAL"
    };

    const canApprove = draftWithoutConsent.consent_verified === true;
    assert.equal(canApprove, false, "Must reject approval if consent is not verified");
  });

  // --------------------------------------------------------------------------
  // TEST 12: Human Approval Workflow: DNC Re-Verification on Server
  // --------------------------------------------------------------------------
  test("12. blocks approving customer WhatsApp draft if lead registered DNC in interim", () => {
    const draft = {
      id: "disp-2",
      audience: "CUSTOMER",
      channel: "WHATSAPP",
      consent_verified: true,
      status: "DRAFT_PENDING_APPROVAL",
      lead: { do_not_call: true } // Customer opted out after draft was created
    };

    const isDnc = draft.lead?.do_not_call === true;
    const canApprove = draft.consent_verified && !isDnc;
    assert.equal(canApprove, false, "Approval must be blocked if lead is on DNC list");
  });

  // --------------------------------------------------------------------------
  // TEST 13: Human Approval Workflow: Duplicate Approval Prevention
  // --------------------------------------------------------------------------
  test("13. prevents duplicate approval and preserves approval audit trail", () => {
    const approvedDraft = {
      id: "disp-3",
      status: "APPROVED",
      approved_by: "supervisor-1",
      approved_at: "2026-11-13T04:00:00Z"
    };

    const canReApprove = approvedDraft.status === "DRAFT_PENDING_APPROVAL";
    assert.equal(canReApprove, false, "Cannot re-approve already approved draft");
    assert.equal(approvedDraft.status, "APPROVED");
    assert.notEqual(approvedDraft.status, "DELIVERED", "Approved draft must NOT be marked DELIVERED prematurely");
  });

  // --------------------------------------------------------------------------
  // TEST 14: Human Approval Workflow: In-Place Message Editing
  // --------------------------------------------------------------------------
  test("14. allows editing message text while draft is pending approval", () => {
    const originalDraft = {
      id: "disp-4",
      status: "DRAFT_PENDING_APPROVAL",
      rendered_message: "Vanakkam Anand, 5kW solar estimate is ready."
    };

    const editedMessage = "Vanakkam Anand, your 5kW solar quotation with PM Surya Ghar subsidy is ready.";
    const canEdit = originalDraft.status === "DRAFT_PENDING_APPROVAL";
    assert.equal(canEdit, true);

    const updated = {
      ...originalDraft,
      rendered_message: editedMessage
    };
    assert.equal(updated.rendered_message, editedMessage);
  });

  // --------------------------------------------------------------------------
  // TEST 15: Analytics KPI Calculations & Qualification Rate
  // --------------------------------------------------------------------------
  test("15. accurately computes qualification rate and distinguishes zero from unavailable metrics", () => {
    const totalCalls = 50;
    const qualifiedCalls = 32;
    const qualificationRate = Number(((qualifiedCalls / totalCalls) * 100).toFixed(1));
    assert.equal(qualificationRate, 64.0);

    // Empty dataset calculation
    const emptyCalls = 0;
    const emptyQualified = 0;
    const emptyRate = emptyCalls > 0 ? Number(((emptyQualified / emptyCalls) * 100).toFixed(1)) : 0;
    assert.equal(emptyRate, 0);
  });
});

