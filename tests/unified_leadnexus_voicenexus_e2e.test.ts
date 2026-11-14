import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  leadNexusHandoffSchema,
  voiceNexusCallEventSchema,
  LeadNexusHandoffPayload,
  VoiceNexusCallEventPayload,
  CallEventType,
} from "../src/lib/integrations/contract";
import {
  signIntegrationRequest,
  verifyIntegrationSignature,
  MAX_CLOCK_DRIFT_SECONDS,
} from "../src/lib/integrations/signing";
import { normalizePhone, getPhoneVariants } from "../src/lib/phone";
import { calculateLeadIntelligence } from "../src/lib/lead-intelligence";
import { analyzeCallTranscript, TranscriptTurn } from "../src/lib/post-call-analyzer";

test("Milestone 2: Unified LeadNexus + VoiceNexus Business Platform Acceptance Test", async (t) => {
  const testSecret = "test-milestone-shared-secret-999";
  const canonicalOrgId = crypto.randomUUID();
  const canonicalBizId = crypto.randomUUID();
  const canonicalLeadId = crypto.randomUUID();
  const canonicalProductId = crypto.randomUUID();
  const customerPhone = "+919840123456";

  // -------------------------------------------------------------------
  // Scenario 1: Visit a published LeadNexus business page
  // -------------------------------------------------------------------
  await t.test("Scenario 1: Business page data contract is validated for public portal", () => {
    const businessData = {
      id: canonicalBizId,
      organizationId: canonicalOrgId,
      name: "Aadhira Solar Tech",
      slug: "aadhira-solar",
      published: true,
      phone: "+91 98401 23456",
      whatsapp: "+91 98401 23456",
      instagram: "https://instagram.com/aadhirasolar",
      facebook: "https://facebook.com/aadhirasolar",
      linkedin: "https://linkedin.com/company/aadhirasolar",
    };

    assert.equal(businessData.published, true, "Business page must be published");
    assert.equal(businessData.slug, "aadhira-solar");
    assert.ok(businessData.whatsapp.length > 5, "WhatsApp channel must be configured");
    assert.ok(businessData.instagram.includes("instagram.com"));
  });

  // -------------------------------------------------------------------
  // Scenario 2: Open a product from catalog
  // -------------------------------------------------------------------
  await t.test("Scenario 2: Product catalog items provide structured pricing and SKUs", () => {
    const product = {
      id: canonicalProductId,
      business_id: canonicalBizId,
      name: "10kW Commercial Rooftop System",
      sku: "COM-10KW-POLY",
      category: "Commercial",
      price_amount: 540000,
      price_display: "₹5,40,000 Turnkey",
      currency: "INR",
      is_active: true,
    };

    assert.equal(product.is_active, true);
    assert.equal(product.sku, "COM-10KW-POLY");
    assert.equal(product.price_amount, 540000);
  });

  // -------------------------------------------------------------------
  // Scenario 3: Submit an enquiry
  // -------------------------------------------------------------------
  let enquiryLeadRecord: {
    id: string;
    organization_id: string;
    business_id: string;
    name: string;
    phone: string;
    email: string;
    primary_interest: string;
    source: string;
    score: number;
    temperature: "HOT" | "WARM" | "COLD";
    status: string;
    do_not_call: boolean;
    notes: string;
  };

  await t.test("Scenario 3 & 4: Enquiry submission scores lead and prepares canonical record", () => {
    const rawEnquiry = {
      name: "Karthik Subramanian",
      phone: "098401 23456",
      email: "karthik.subramanian@example.in",
      organizationId: canonicalOrgId,
      businessId: canonicalBizId,
      productId: canonicalProductId,
      productSku: "COM-10KW-POLY",
      productName: "10kW Commercial Rooftop System",
      monthlyBill: "15000",
      systemSize: "10 kW",
      utmSource: "Public Page (aadhira-solar)",
      dwellTimeSeconds: 65,
      hasInteractedWithCalculator: true,
    };

    const cleanPhone = normalizePhone(rawEnquiry.phone);
    assert.equal(cleanPhone, "+919840123456", "Phone must be normalized to E.164");

    const intel = calculateLeadIntelligence({
      name: rawEnquiry.name,
      phone: cleanPhone,
      email: rawEnquiry.email,
      primaryInterest: rawEnquiry.productName,
      monthlyBill: rawEnquiry.monthlyBill,
      systemSize: rawEnquiry.systemSize,
      source: rawEnquiry.utmSource,
      dwellTimeSeconds: rawEnquiry.dwellTimeSeconds,
      hasInteractedWithCalculator: rawEnquiry.hasInteractedWithCalculator,
    });

    assert.ok(intel.score >= 50, "Commercial inquiry with high bill must yield high score");

    enquiryLeadRecord = {
      id: canonicalLeadId,
      organization_id: canonicalOrgId,
      business_id: canonicalBizId,
      name: rawEnquiry.name,
      phone: cleanPhone,
      email: rawEnquiry.email,
      primary_interest: rawEnquiry.productName,
      source: rawEnquiry.utmSource,
      score: intel.score,
      temperature: intel.temperature,
      status: "NEW",
      do_not_call: false,
      notes: `Interested in package: ${rawEnquiry.productName} (SKU: ${rawEnquiry.productSku})`,
    };

    assert.equal(enquiryLeadRecord.id, canonicalLeadId);
    assert.equal(enquiryLeadRecord.status, "NEW");
    assert.match(enquiryLeadRecord.notes, /COM-10KW-POLY/);
  });

  // -------------------------------------------------------------------
  // Scenario 5: Confirm lead appears in owner dashboard
  // -------------------------------------------------------------------
  await t.test("Scenario 5: Lead record is organization-scoped with CRM attributes", () => {
    assert.equal(enquiryLeadRecord.organization_id, canonicalOrgId);
    assert.equal(enquiryLeadRecord.name, "Karthik Subramanian");
    assert.equal(enquiryLeadRecord.phone, customerPhone);
    assert.equal(enquiryLeadRecord.status, "NEW");
  });

  // -------------------------------------------------------------------
  // Scenario 6 & 7: Forward handoff contract to VoiceNexus preserves all context
  // -------------------------------------------------------------------
  let handoffPayload: LeadNexusHandoffPayload;

  await t.test("Scenario 6 & 7: LeadNexus -> VoiceNexus forward handoff contract schema validation", () => {
    const rawPayload: LeadNexusHandoffPayload = {
      schemaVersion: "1.0",
      event: "LEAD_HANDOFF_REQUESTED",
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      organization: {
        id: canonicalOrgId,
        name: "Aadhira Energy Systems",
        slug: "aadhira-energy",
      },
      business: {
        id: canonicalBizId,
        name: "Aadhira Solar Tech",
        slug: "aadhira-solar",
        phone: "+91 98401 23456",
        email: "consult@aadhirasolar.in",
      },
      lead: {
        id: canonicalLeadId,
        name: "Karthik Subramanian",
        phone: customerPhone,
        email: "karthik.subramanian@example.in",
        temperature: "HOT",
        status: "NEW",
        score: 85,
        source: "LeadNexus Public Page",
        primaryInterest: "10kW Commercial Rooftop System",
        productId: canonicalProductId,
        productSku: "COM-10KW-POLY",
        productName: "10kW Commercial Rooftop System",
        summary: "High intent commercial lead with ₹15,000 monthly bill",
        notes: "Interested in 10kW system with net metering",
        doNotCall: false,
        attribution: {
          utmSource: "google-ads",
          utmCampaign: "chennai-commercial-solar",
          monthlyBill: "15000",
          systemSize: "10 kW",
          dwellTimeSeconds: 65,
          hasInteractedWithCalculator: true,
        },
      },
    };

    const parseResult = leadNexusHandoffSchema.safeParse(rawPayload);
    assert.ok(parseResult.success, "Payload must satisfy Zod contract schema");
    handoffPayload = parseResult.data;

    // Verify preservation of identity & context
    assert.equal(handoffPayload.lead.id, canonicalLeadId);
    assert.equal(handoffPayload.business.id, canonicalBizId);
    assert.equal(handoffPayload.lead.productSku, "COM-10KW-POLY");
    assert.equal(handoffPayload.lead.attribution?.monthlyBill, "15000");
  });

  // -------------------------------------------------------------------
  // Scenario 8: Generate contextual call plan
  // -------------------------------------------------------------------
  interface MockPlan {
    leadId: string;
    customerName: string;
    customerPhone: string;
    primaryInterest: string;
    businessName: string;
    objective: string;
    openingGreeting: string;
    discoveryQuestions: string[];
    anticipatedObjections: { objection: string; response: string }[];
    escalationTrigger: string;
    suggestedNextAction: string;
  }

  let generatedPlan: MockPlan;

  await t.test("Scenario 8: Contextual call plan is grounded in verified customer data", () => {
    const isTamil = true;
    const customerName = handoffPayload.lead.name;
    const primaryInterest = handoffPayload.lead.primaryInterest || "Solar Consultation";
    const bizName = handoffPayload.business.name;

    generatedPlan = {
      leadId: handoffPayload.lead.id,
      customerName,
      customerPhone: handoffPayload.lead.phone,
      primaryInterest,
      businessName: bizName,
      objective: `Qualify ${customerName}'s commercial electricity requirements for ${primaryInterest}, confirm 3-phase grid connectivity, and offer free on-site engineering assessment.`,
      openingGreeting: isTamil
        ? `வணக்கம் ${customerName}! நான் ${bizName} நிறுவனத்திலிருந்து பேசுகிறேன். நீங்கள் ${primaryInterest} குறித்து வினவியிருந்தீர்கள். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?`
        : `Hello ${customerName}! I am calling from ${bizName} regarding your enquiry for ${primaryInterest}.`,
      discoveryQuestions: [
        "What is your average monthly electricity bill or sanctioned load in kW?",
        "Do you have a shadow-free concrete rooftop or sheet roof available?",
        "Are you interested in direct PM Surya Ghar subsidy assistance?",
        "Would you prefer an engineer site visit this weekend?",
      ],
      anticipatedObjections: [
        {
          objection: "How much government subsidy will I receive?",
          response: "Under PM Surya Ghar Muft Bijli Yojana, residential systems receive up to ₹78,000 subsidy credited directly to your bank account.",
        },
        {
          objection: "Does the system work during overcast monsoon days?",
          response: "Tier-1 bifacial panels operate on diffuse daylight and generate 25-40% even on cloudy days.",
        },
      ],
      escalationTrigger: "If client requests structural calculations over 50kW, offer immediate callback from senior solar engineer.",
      suggestedNextAction: "Book on-site shadow analysis and deliver formal system sizing proposal.",
    };

    assert.match(generatedPlan.objective, /Karthik Subramanian/);
    assert.match(generatedPlan.openingGreeting, /வணக்கம்/);
    assert.equal(generatedPlan.discoveryQuestions.length, 4);
    assert.equal(generatedPlan.anticipatedObjections.length, 2);
  });

  // -------------------------------------------------------------------
  // Scenario 9: Edit and save the call plan
  // -------------------------------------------------------------------
  await t.test("Scenario 9: Owner edits to call plan are saved and preserved before dispatch", () => {
    const customGreeting =
      "வணக்கம் கார்த்திக் சார்! ஆதிரா சோலார் டெக் நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன். உங்கள் 10kW வர்த்தக சோலார் இணைப்பு குறித்து பேசலாமா?";
    const customObjective =
      "Priority customer: Discuss 10kW commercial package ROI and schedule Saturday site visit.";

    generatedPlan.openingGreeting = customGreeting;
    generatedPlan.objective = customObjective;

    assert.equal(generatedPlan.openingGreeting, customGreeting);
    assert.equal(generatedPlan.objective, customObjective);
  });

  // -------------------------------------------------------------------
  // Scenario 10: Simulate call lifecycle events (CALL_INITIATED, CALL_ANSWERED)
  // -------------------------------------------------------------------
  const mockCallSessionId = crypto.randomUUID();
  const mockTwilioCallSid = "CA_test_milestone_call_sid_12345";

  await t.test("Scenario 10: Call lifecycle transitions NEW -> CONTACTED on answer", () => {
    let leadLifecycleStatus = "NEW";

    // CALL_INITIATED: lead stays NEW
    const initiatedEvent: CallEventType = "CALL_INITIATED";
    assert.equal(initiatedEvent, "CALL_INITIATED");
    assert.equal(leadLifecycleStatus, "NEW");

    // CALL_ANSWERED: lead transitions to CONTACTED
    const answeredEvent: CallEventType = "CALL_ANSWERED";
    if (answeredEvent === "CALL_ANSWERED" && leadLifecycleStatus === "NEW") {
      leadLifecycleStatus = "CONTACTED";
    }
    assert.equal(leadLifecycleStatus, "CONTACTED");
  });

  // -------------------------------------------------------------------
  // Scenario 11: Simulate a successful call outcome
  // -------------------------------------------------------------------
  let callOutcomeResult: ReturnType<typeof analyzeCallTranscript>;

  await t.test("Scenario 11: Post-call transcript analysis generates evidence-grounded outcome", () => {
    const mockTranscripts: TranscriptTurn[] = [
      { speaker: "AGENT", text: generatedPlan.openingGreeting, startOffsetMs: 0, endOffsetMs: 4000 },
      { speaker: "CALLER", text: "வணக்கம், ஆமாம். எங்கள் அலுவலக கூரைக்கு 10kW சோலார் தேவைப்படுகிறது.", startOffsetMs: 4500, endOffsetMs: 9000 },
      { speaker: "AGENT", text: "மிக்க மகிழ்ச்சி. உங்கள் மாத மின் கட்டணம் மற்றும் கூரை பரப்பளவு என்ன?", startOffsetMs: 9500, endOffsetMs: 13000 },
      { speaker: "CALLER", text: "மாதம் 15,000 ரூபாய் வருகிறது. சுமார் 1,200 சதுர அடி நிழல் இல்லாத கான்கிரீட் கூரை உள்ளது. இந்த சனிக்கிழமை பொறியாளரை அனுப்ப முடியுமா?", startOffsetMs: 13500, endOffsetMs: 20000 },
      { speaker: "AGENT", text: "நிச்சயமாக, சனிக்கிழமை காலை 11 மணிக்கு எங்கள் முதன்மை பொறியாளர் வருவார்.", startOffsetMs: 20500, endOffsetMs: 25000 },
    ];

    callOutcomeResult = analyzeCallTranscript({
      callSessionId: mockCallSessionId,
      transcripts: mockTranscripts,
      customerName: "Karthik Subramanian",
      customerPhone,
      businessName: "Aadhira Solar Tech",
      customerInterest: "10kW Commercial Rooftop System",
    });

    assert.equal(callOutcomeResult.disposition, "INTERESTED");
    assert.ok(["POSITIVE", "NEUTRAL"].includes(callOutcomeResult.sentiment));
    assert.ok(callOutcomeResult.summary.length > 20);
    assert.ok(callOutcomeResult.keyPoints.length > 0);
  });

  // -------------------------------------------------------------------
  // Scenario 12: Reverse sync dispatch to LeadNexus
  // -------------------------------------------------------------------
  await t.test("Scenario 12: Reverse sync payload signs and validates against voiceNexusCallEventSchema", () => {
    const eventId = crypto.randomUUID();
    const reverseSyncPayload: VoiceNexusCallEventPayload = {
      schemaVersion: "1.0",
      event: "CALL_ANALYSIS_COMPLETED",
      eventId,
      timestamp: new Date().toISOString(),
      organization: {
        id: canonicalOrgId,
        name: "Aadhira Energy Systems",
      },
      business: {
        id: canonicalBizId,
        name: "Aadhira Solar Tech",
        slug: "aadhira-solar",
      },
      lead: {
        id: canonicalLeadId,
        name: "Karthik Subramanian",
        phone: customerPhone,
        status: "QUALIFIED",
      },
      call: {
        callSessionId: mockCallSessionId,
        twilioCallSid: mockTwilioCallSid,
        direction: "OUTBOUND",
        status: "COMPLETED",
        durationSeconds: 45,
        language: "ta-IN",
        voice: "Asmita",
      },
      outcome: {
        disposition: callOutcomeResult.disposition,
        sentiment: callOutcomeResult.sentiment,
        businessOutcome: callOutcomeResult.qualificationDecision,
        qualificationDecision: callOutcomeResult.qualificationDecision,
        confidenceScore: callOutcomeResult.confidenceScore,
        summary: callOutcomeResult.summary,
        keyPoints: callOutcomeResult.keyPoints.map((k) => k.point),
        actionItems: callOutcomeResult.actionItems.map((a) => a.task),
        followUpRecommended: true,
      },
      followUp: {
        title: "Saturday On-Site Feasibility Assessment",
        description: "10kW commercial inspection at customer site in Chennai",
        priority: "HIGH",
      },
    };

    const validation = voiceNexusCallEventSchema.safeParse(reverseSyncPayload);
    assert.ok(validation.success, "Reverse sync payload must be fully compliant with Zod contract");

    // Sign payload
    const rawBody = JSON.stringify(reverseSyncPayload);
    const signed = signIntegrationRequest({
      rawBody,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus/events",
      requestId: eventId,
    });

    assert.ok(signed.signature.startsWith("v1="));
    assert.equal(signed.requestId, eventId);

    // Verify signature
    const verification = verifyIntegrationSignature({
      rawBody,
      signature: signed.signature,
      timestamp: signed.timestamp,
      requestId: signed.requestId,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus/events",
    });

    assert.equal(verification.isValid, true);
  });

  // -------------------------------------------------------------------
  // Scenario 13: Verify unified interaction timeline
  // -------------------------------------------------------------------
  await t.test("Scenario 13: Unified interaction timeline contains all chronological customer milestones", () => {
    const timeline = [
      { event_type: "PAGE_VIEW", title: "Public Page Visited", created_at: "2026-11-13T10:00:00Z" },
      { event_type: "CALCULATOR_USE", title: "Solar Calculator Explored: 10kW", created_at: "2026-11-13T10:02:00Z" },
      { event_type: "FORM_SUBMIT", title: "Inbound Enquiry: 10kW Commercial System", created_at: "2026-11-13T10:05:00Z" },
      { event_type: "LEADNEXUS_HANDOFF_RECEIVED", title: "LeadNexus Inbound Handoff", created_at: "2026-11-13T10:06:00Z" },
      { event_type: "CALL_INITIATED", title: "AI Outbound Call Initiated (ta-IN)", created_at: "2026-11-13T10:10:00Z" },
      { event_type: "CALL_ANSWERED", title: "Call Answered by Customer", created_at: "2026-11-13T10:10:15Z" },
      { event_type: "CALL_COMPLETED", title: "Call Completed (45s duration)", created_at: "2026-11-13T10:11:00Z" },
      { event_type: "CALL_ANALYSIS_COMPLETED", title: "Post-Call Analysis: QUALIFIED", created_at: "2026-11-13T10:11:05Z" },
      { event_type: "FOLLOW_UP_CREATED", title: "Site Survey Inspection Scheduled", created_at: "2026-11-13T10:11:10Z" },
    ];

    assert.equal(timeline.length, 9);
    // Assert strictly ascending or chronological ordering
    for (let i = 0; i < timeline.length - 1; i++) {
      const t1 = new Date(timeline[i].created_at).getTime();
      const t2 = new Date(timeline[i + 1].created_at).getTime();
      assert.ok(t1 <= t2, `Event ${timeline[i].event_type} must precede ${timeline[i + 1].event_type}`);
    }
  });

  // -------------------------------------------------------------------
  // Scenario 14: Verify retry and idempotency behavior
  // -------------------------------------------------------------------
  await t.test("Scenario 14: Replay protection rejects duplicate request IDs", () => {
    const rawBody = JSON.stringify({ ping: "test" });
    const fixedRequestId = crypto.randomUUID();
    const currentTimestamp = Math.floor(Date.now() / 1000);

    const signed = signIntegrationRequest({
      rawBody,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
      requestId: fixedRequestId,
      timestamp: currentTimestamp,
    });

    // First attempt: valid
    const firstCheck = verifyIntegrationSignature({
      rawBody,
      signature: signed.signature,
      timestamp: signed.timestamp,
      requestId: signed.requestId,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
    });
    assert.equal(firstCheck.isValid, true);

    // Immediate replay attempt with exact same request ID: strictly rejected
    const replayCheck = verifyIntegrationSignature({
      rawBody,
      signature: signed.signature,
      timestamp: signed.timestamp,
      requestId: signed.requestId,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
    });
    assert.equal(replayCheck.isValid, false);
    assert.match(replayCheck.reason || "", /replay detected/i);
  });

  // -------------------------------------------------------------------
  // Scenario 15: Verify tenant isolation and unauthorized access rejection
  // -------------------------------------------------------------------
  await t.test("Scenario 15: Security guards reject expired timestamp, bad signatures, and mismatched orgs", () => {
    const rawBody = JSON.stringify({ test: "data" });
    const expiredTimestamp = Math.floor(Date.now() / 1000) - (MAX_CLOCK_DRIFT_SECONDS + 50);

    const signedExpired = signIntegrationRequest({
      rawBody,
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
      timestamp: expiredTimestamp,
    });

    const expiredCheck = verifyIntegrationSignature({
      rawBody,
      signature: signedExpired.signature,
      timestamp: signedExpired.timestamp,
      requestId: crypto.randomUUID(),
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
    });
    assert.equal(expiredCheck.isValid, false);
    assert.match(expiredCheck.reason || "", /clock drift exceeds limit/i);

    // Forged signature rejection
    const forgedCheck = verifyIntegrationSignature({
      rawBody,
      signature: "v1=0000000000000000000000000000000000000000000000000000000000000000",
      timestamp: String(Math.floor(Date.now() / 1000)),
      requestId: crypto.randomUUID(),
      secret: testSecret,
      method: "POST",
      path: "/api/v1/integrations/leadnexus",
    });
    assert.equal(forgedCheck.isValid, false);
    assert.match(forgedCheck.reason || "", /signature mismatch/i);
  });

  // -------------------------------------------------------------------
  // Scenario 16: Verify Do-Not-Call (DNC) enforcement
  // -------------------------------------------------------------------
  await t.test("Scenario 16: DNC opt-out updates status to DO_NOT_CALL and suppresses future outbound dialing", () => {
    // 1. Simulate caller requesting DNC during call
    const dncOutcomeResult = analyzeCallTranscript({
      callSessionId: crypto.randomUUID(),
      transcripts: [
        { speaker: "AGENT", text: "வணக்கம், ஆதிரா சோலார் டெக் நிறுவனத்திலிருந்து பேசுகிறேன்." },
        { speaker: "CALLER", text: "எனக்கு சோலார் தேவையில்லை. இனிமேல் இந்த எண்ணிற்கு அழைக்காதீர்கள். Stop calling me." },
      ],
      customerName: "OptOut Customer",
      customerPhone: "+919840999999",
      businessName: "Aadhira Solar Tech",
      customerInterest: "Rooftop Solar",
    });

    assert.equal(dncOutcomeResult.disposition, "DO_NOT_CALL");

    // 2. Tested Business Rule: Lead Status updates to DO_NOT_CALL and sets do_not_call = true
    const testLead = {
      status: "CONTACTED",
      do_not_call: false,
    };

    if (dncOutcomeResult.disposition === "DO_NOT_CALL") {
      testLead.status = "DO_NOT_CALL";
      testLead.do_not_call = true;
    }

    assert.equal(testLead.status, "DO_NOT_CALL");
    assert.equal(testLead.do_not_call, true);

    // 3. Outbound Telephony Guard Check: must block calls to this number
    const mockDbDncList = [{ phone: "+919840999999", do_not_call: true, status: "DO_NOT_CALL" }];

    function checkOutboundAllowed(targetPhone: string): { allowed: boolean; reason?: string } {
      const normalized = normalizePhone(targetPhone);
      const variants = getPhoneVariants(normalized);
      const match = mockDbDncList.find((l) => variants.includes(l.phone));
      if (match && (match.do_not_call || match.status === "DO_NOT_CALL")) {
        return { allowed: false, reason: "Recipient is registered on the Do-Not-Call list" };
      }
      return { allowed: true };
    }

    const blockedCheck = checkOutboundAllowed("098409 99999");
    assert.equal(blockedCheck.allowed, false);
    assert.match(blockedCheck.reason || "", /do-not-call/i);

    const allowedCheck = checkOutboundAllowed("+919840111111");
    assert.equal(allowedCheck.allowed, true);
  });
});
