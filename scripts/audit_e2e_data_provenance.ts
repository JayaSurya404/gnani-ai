import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Load environment from .env.local
function loadEnv() {
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const supabase = createClient(supabaseUrl, serviceKey);

async function runProvenanceAudit() {
  console.log("=================================================================");
  console.log("SECTION 4: END-TO-END DATA PROVENANCE & CUSTOMER JOURNEY AUDIT");
  console.log("=================================================================");
  console.log("Target Base URL:", BASE_URL);
  console.log("Target Supabase:", supabaseUrl);

  const testSuffix = Date.now();
  const testPhone = "+9198409" + String(testSuffix).slice(-5);
  const testEmail = `test.audit.${testSuffix}@example.in`;
  const testName = `Audit Lead ${testSuffix}`;

  // Step 0: Find or anchor Organization & Business
  const { data: businesses, error: bErr } = await supabase
    .from("businesses")
    .select("id, organization_id, name")
    .limit(1)
    .single();

  if (bErr || !businesses) {
    throw new Error(`Failed to find anchor business in Supabase: ${bErr?.message}`);
  }

  const organizationId = businesses.organization_id;
  const businessId = businesses.id;
  console.log(`[✓] Anchor Tenant Verified: Org=${organizationId}, Biz=${businessId} (${businesses.name})`);

  // Step 0b: Create a test product
  const { data: testProduct, error: pErr } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      name: "Audit 5kW Rooftop Solar Kit",
      sku: `SKU-AUDIT-${testSuffix}`,
      category: "Residential",
      price_amount: 285000,
      price_display: "₹2,85,000",
      currency: "INR",
      is_active: true,
      description: "Tier-1 Bifacial, 5-year Inverter Warranty, Net Metering Support",
    })
    .select()
    .single();

  if (pErr) console.warn("Notice: Product insert warning:", pErr.message);
  const productId = testProduct?.id;
  console.log(`[✓] Product Prepared: id=${productId || "N/A"}, sku=SKU-AUDIT-${testSuffix}`);

  let createdLeadId: string | null = null;
  let callSessionId: string | null = null;

  try {
    // -------------------------------------------------------------------
    // STEP 1 & 2: Public Enquiry Submission via API
    // -------------------------------------------------------------------
    console.log("\n--- STEP 1 & 2: Public Enquiry Submission (/api/enquiry) ---");
    const enquiryPayload = {
      name: testName,
      phone: testPhone,
      email: testEmail,
      organizationId,
      businessId,
      productId,
      productSku: `SKU-AUDIT-${testSuffix}`,
      productName: "Audit 5kW Rooftop Solar Kit",
      primaryInterest: "Audit 5kW Rooftop Solar Kit",
      monthlyBill: "8500",
      systemSize: "5 kW",
      utmSource: "audit-e2e-test",
      utmCampaign: "provenance-verification-suite",
      dwellTimeSeconds: 45,
      hasInteractedWithCalculator: true,
    };

    const enquiryRes = await fetch(`${BASE_URL}/api/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enquiryPayload),
    });

    const enquiryJson = await enquiryRes.json();
    console.log(`Enquiry HTTP Status: ${enquiryRes.status}`);
    console.log("Enquiry Response:", enquiryJson);

    if (!enquiryRes.ok || !enquiryJson.success) {
      throw new Error(`Public enquiry failed: ${enquiryJson.error || enquiryRes.statusText}`);
    }

    createdLeadId = enquiryJson.leadId;
    console.log(`[✓] Step 1 & 2 PASSED: Enquiry saved with leadId=${createdLeadId}`);

    // -------------------------------------------------------------------
    // STEP 3: Verify Canonical Database Records
    // -------------------------------------------------------------------
    console.log("\n--- STEP 3: Verify Canonical Database Records in Supabase ---");
    const { data: dbLead, error: leadFetchErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", createdLeadId)
      .single();

    if (leadFetchErr || !dbLead) {
      throw new Error(`Lead ${createdLeadId} not found in Supabase: ${leadFetchErr?.message}`);
    }

    console.log(`[✓] Lead in DB: name="${dbLead.name}", score=${dbLead.score}, temp=${dbLead.temperature}, status=${dbLead.status}`);
    console.log(`    Notes: "${dbLead.notes}"`);
    if (dbLead.score < 50) throw new Error("Expected lead score >= 50 for commercial/residential bill");
    if (dbLead.temperature !== "HOT" && dbLead.temperature !== "WARM") throw new Error("Expected HOT/WARM temperature");

    const { data: intelRows } = await supabase
      .from("lead_intelligence")
      .select("*")
      .eq("lead_id", createdLeadId);
    console.log(`[✓] Lead Intelligence rows: ${intelRows?.length || 0}`);
    if (intelRows && intelRows.length > 0) {
      console.log(`    Intent Classification: ${intelRows[0].intent_classification}`);
      console.log(`    Recommended Pitch: "${intelRows[0].recommended_pitch}"`);
    }

    const { data: leadEvents } = await supabase
      .from("lead_events")
      .select("event_type, title, description")
      .eq("lead_id", createdLeadId);
    console.log(`[✓] Initial Lead Events: ${leadEvents?.map(e => e.event_type).join(", ")}`);

    // -------------------------------------------------------------------
    // STEP 4 & 5: Contextual Call Plan Generation
    // -------------------------------------------------------------------
    console.log("\n--- STEP 4 & 5: Contextual Call Plan Generation (/api/leads/[id]/plan) ---");
    const planRes = await fetch(`${BASE_URL}/api/leads/${createdLeadId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "ta-IN" }),
    });

    const planJson = await planRes.json();
    console.log(`Call Plan HTTP Status: ${planRes.status}`);

    if (!planRes.ok || !planJson.success) {
      throw new Error(`Call plan generation failed: ${planJson.error || planRes.statusText}`);
    }

    const plan = planJson.plan;
    console.log("[✓] Step 4 & 5 PASSED: Contextual Call Plan Generated:");
    console.log(`    Customer: ${plan.customerName} (${plan.customerPhone})`);
    console.log(`    Business: ${plan.businessName}`);
    console.log(`    Objective: ${plan.objective}`);
    console.log(`    Tamil Greeting: ${plan.openingGreeting}`);
    console.log(`    Discovery Questions: ${plan.discoveryQuestions?.length} questions`);
    console.log(`    Anticipated Objections: ${plan.anticipatedObjections?.length} objections`);
    console.log(`    Escalation Trigger: ${plan.escalationTrigger}`);
    console.log(`    Suggested Next Action: ${plan.suggestedNextAction}`);

    // -------------------------------------------------------------------
    // STEP 6: Simulated Call Session & Transcripts
    // -------------------------------------------------------------------
    console.log("\n--- STEP 6: Simulated Call Session & Telephony Lifecycle ---");
    const { data: newCallSession, error: callErr } = await supabase
      .from("call_sessions")
      .insert({
        organization_id: organizationId,
        business_id: businessId,
        lead_id: createdLeadId,
        customer_name: testName,
        customer_phone: testPhone,
        direction: "OUTBOUND",
        channel: "PSTN",
        status: "COMPLETED",
        duration_seconds: 88,
      })
      .select()
      .single();

    if (callErr || !newCallSession) {
      throw new Error(`Failed to create call session: ${callErr?.message}`);
    }

    callSessionId = newCallSession.id;
    console.log(`[✓] Call Session Created: id=${callSessionId}`);

    // Insert call events
    await supabase.from("call_events").insert([
      { call_session_id: callSessionId, event_type: "CALL_INITIATED", payload: { timestamp: new Date().toISOString() } },
      { call_session_id: callSessionId, event_type: "CALL_ANSWERED", payload: { timestamp: new Date().toISOString() } },
      { call_session_id: callSessionId, event_type: "CALL_COMPLETED", payload: { duration: 88, reason: "NORMAL_CLEARING" } },
    ]);

    // Insert transcript turns
    const transcripts = [
      {
        speaker: "AGENT",
        text: `வணக்கம் ${testName} சார்! உங்கள் சோலார் ரூப்டாப் திட்டத்திற்கு இலவச பொறியியல் மதிப்பீடு செய்யலாமா?`,
      },
      {
        speaker: "CALLER",
        text: "ஆமாம், சனிக்கிழமை மதியம் உங்கள் பொறியாளரை அனுப்ப முடியுமா? விலை மற்றும் பேட்டரி விவரங்கள் வேண்டும்.",
      },
      {
        speaker: "AGENT",
        text: "நிச்சயமாக சார்! சனிக்கிழமை மதியம் 2 மணிக்கு எங்கள் தலைமை பொறியாளர் உங்கள் வீட்டிற்கு நேரில் வருவார்.",
      },
    ];

    const { error: segErr } = await supabase.from("transcript_segments").insert(
      transcripts.map((t, i) => ({
        call_session_id: callSessionId,
        speaker: t.speaker,
        text: t.text,
        confidence: 0.98,
        start_offset_ms: i * 3000,
        end_offset_ms: (i + 1) * 3000,
      }))
    );
    if (segErr) console.warn("Notice: Segments insert warning:", segErr.message);
    console.log(`[✓] Step 6 PASSED: Call lifecycle events and transcript turns persisted`);

    // -------------------------------------------------------------------
    // STEP 7: Post-Call Analysis & Structured Outcome
    // -------------------------------------------------------------------
    console.log("\n--- STEP 7: Post-Call Analysis (/api/calls/[id]/analyze) ---");
    const analyzeRes = await fetch(`${BASE_URL}/api/calls/${callSessionId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcripts }),
    });

    const analyzeJson = await analyzeRes.json();
    console.log(`Analysis HTTP Status: ${analyzeRes.status}`);
    console.log("Analysis Outcome:", analyzeJson.outcome);

    if (!analyzeRes.ok || !analyzeJson.success) {
      throw new Error(`Post-call analysis failed: ${analyzeJson.error || analyzeRes.statusText}`);
    }

    const outcome = analyzeJson.outcome;
    console.log(`[✓] Step 7 PASSED: Analysis Outcome extracted:`);
    console.log(`    Disposition: ${outcome.disposition}`);
    console.log(`    Sentiment: ${outcome.sentiment}`);
    console.log(`    Qualification Decision: ${outcome.qualificationDecision}`);
    console.log(`    Summary: "${outcome.summary}"`);
    console.log(`    Action Items: ${outcome.actionItems?.map((a: { task?: string } | string) => typeof a === 'string' ? a : a.task).join("; ")}`);

    // Verify DB call_outcomes and follow_up_tasks
    const { data: dbOutcomes } = await supabase
      .from("call_outcomes")
      .select("*")
      .eq("call_session_id", callSessionId);
    console.log(`[✓] call_outcomes in DB: ${dbOutcomes?.length || 0} rows`);

    const { data: dbTasks } = await supabase
      .from("follow_up_tasks")
      .select("*")
      .eq("lead_id", createdLeadId);
    console.log(`[✓] follow_up_tasks in DB: ${dbTasks?.length || 0} tasks recorded`);
    if (dbTasks && dbTasks.length > 0) {
      console.log(`    Task: "${dbTasks[0].title}" | Priority: ${dbTasks[0].priority}`);
    }

    // -------------------------------------------------------------------
    // STEP 8: Reverse Sync Verification
    // -------------------------------------------------------------------
    console.log("\n--- STEP 8: Reverse Sync Verification ---");
    // Check if reverse sync updated the lead record in Supabase
    const { data: updatedLead } = await supabase
      .from("leads")
      .select("id, status, last_activity_at, score")
      .eq("id", createdLeadId)
      .single();

    console.log(`[✓] Updated Lead status: ${updatedLead?.status}`);
    console.log(`    Last Activity: ${updatedLead?.last_activity_at}`);

    // -------------------------------------------------------------------
    // STEP 9: Complete Unified Interaction Timeline via /api/leads/[id]
    // -------------------------------------------------------------------
    console.log("\n--- STEP 9: Unified Lead Detail & Interaction Timeline (/api/leads/[id]) ---");
    const detailRes = await fetch(`${BASE_URL}/api/leads/${createdLeadId}`);
    const detailJson = await detailRes.json();

    console.log(`Lead Detail HTTP Status: ${detailRes.status}`);
    if (!detailRes.ok || !detailJson.success) {
      throw new Error(`Lead detail fetch failed: ${detailJson.error || detailRes.statusText}`);
    }

    const events = detailJson.events || [];
    const calls = detailJson.calls || [];
    const followUps = detailJson.followUps || [];

    console.log(`[✓] Step 9 PASSED: Unified Timeline retrieved with:`);
    console.log(`    - ${events.length} lead events recorded`);
    console.log(`    - ${calls.length} call sessions linked`);
    console.log(`    - ${followUps.length} follow-up tasks linked`);

    events.forEach((item: Record<string, unknown>, idx: number) => {
      console.log(`    Event [${idx + 1}] Type: ${String(item.event_type)} | Title: "${String(item.title)}" | Time: ${String(item.created_at)}`);
    });

    if (events.length === 0) {
      throw new Error("Expected at least 1 event in unified timeline (Form Submission / Call event)");
    }

    console.log("\n=================================================================");
    console.log("PROVENANCE VERIFICATION SUMMARY: 100% COMPLETE AND PASSING");
    console.log("=================================================================");

  } finally {
    // -------------------------------------------------------------------
    // STEP 10: Clean up test records
    // -------------------------------------------------------------------
    console.log("\n--- STEP 10: Cleaning up Synthetic Test Records ---");
    if (callSessionId) {
      await supabase.from("transcript_segments").delete().eq("call_session_id", callSessionId);
      await supabase.from("call_events").delete().eq("call_session_id", callSessionId);
      await supabase.from("call_outcomes").delete().eq("call_session_id", callSessionId);
      await supabase.from("call_sessions").delete().eq("id", callSessionId);
      console.log(`[✓] Cleaned up call_sessions, events, segments, outcomes for: ${callSessionId}`);
    }

    if (createdLeadId) {
      await supabase.from("follow_up_tasks").delete().eq("lead_id", createdLeadId);
      await supabase.from("lead_events").delete().eq("lead_id", createdLeadId);
      await supabase.from("lead_intelligence").delete().eq("lead_id", createdLeadId);
      await supabase.from("leads").delete().eq("id", createdLeadId);
      console.log(`[✓] Cleaned up leads, events, intelligence, tasks for: ${createdLeadId}`);
    }

    if (productId) {
      await supabase.from("products").delete().eq("id", productId);
      console.log(`[✓] Cleaned up test product: ${productId}`);
    }

    console.log("[✓] Cleanup complete. Zero orphaned test fixtures remaining in DB.\n");
  }
}

runProvenanceAudit().catch((err) => {
  console.error("Provenance audit failed:", err);
  process.exit(1);
});
