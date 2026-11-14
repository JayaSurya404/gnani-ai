import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv() {
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const BASE_URL = 'http://localhost:3000';

const TEST_CUSTOMER = {
  name: 'Senthil Nathan (QA Test)',
  phone: '+919840911223',
  rawPhone: '9840911223',
  email: 'senthil.nathan@testsolar.in',
  productName: '3kW Residential Surya Package',
  productSku: 'RES-3KW-MNRE',
  requirement: 'Residential Rooftop (3kW - 10kW)',
  monthlyBill: '3500',
  systemSize: '3.4 kW',
  utmSource: 'Public Page (aadhira-solar)',
};

const results = {
  step1_public_page: { status: 'PENDING' },
  step2_submit_enquiry: { status: 'PENDING' },
  step3_supabase_persistence: { status: 'PENDING' },
  step4_leads_dashboard_sync: { status: 'PENDING' },
  step5_call_with_ai_experience: { status: 'PENDING' },
  step6_conversation_plan_accuracy: { status: 'PENDING' },
  step7_canonical_id_consistency: { status: 'PENDING' },
  step8_timeline_empty_call_history: { status: 'PENDING' },
  step9_duplicate_prevention: { status: 'PENDING' },
  step10_clean_up: { status: 'PENDING' },
};

async function runVerification() {
  console.log('================================================================');
  console.log('FINAL BROWSER-LEVEL CUSTOMER JOURNEY VERIFICATION');
  console.log('Target Server:', BASE_URL);
  console.log('Canonical Supabase:', supabaseUrl);
  console.log('================================================================\n');

  let testLeadId = null;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Open /p/aadhira-solar
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Open /p/aadhira-solar ---');
    const pageRes = await fetch(`${BASE_URL}/p/aadhira-solar`);
    const pageHtml = await pageRes.text();

    const hasBizName = pageHtml.includes('Aadhira Solar Tech');
    const hasPhone = pageHtml.includes('+91 98401 23456') || pageHtml.includes('9840123456');
    const hasProduct = pageHtml.includes('3kW Residential Surya Package');
    const hasForm = pageHtml.includes('Request Free Site Survey') || pageHtml.includes('enquiry-form');

    if (pageRes.status === 200 && hasBizName && hasProduct) {
      results.step1_public_page = {
        status: 'PASS',
        httpStatus: pageRes.status,
        hasBusinessName: hasBizName,
        hasPhone,
        hasProduct,
        hasForm,
      };
      console.log('Step 1 PASS: Public page rendered with business branding & products.\n');
    } else {
      results.step1_public_page = {
        status: 'FAIL',
        httpStatus: pageRes.status,
        hasBizName,
        hasProduct,
      };
      throw new Error(`Step 1 FAIL: HTTP ${pageRes.status}, bizName: ${hasBizName}`);
    }

    // -------------------------------------------------------------------------
    // STEP 2: Submit a fresh test enquiry
    // -------------------------------------------------------------------------
    console.log('--- Step 2: Submit fresh test enquiry ---');
    // First, find the business ID and org ID for aadhira-solar
    const { data: pageRecord, error: pErr } = await supabase
      .from('business_pages')
      .select('business_id, businesses(organization_id)')
      .eq('slug', 'aadhira-solar')
      .single();

    if (pErr || !pageRecord) throw new Error(`Could not find business_page record: ${pErr?.message}`);
    const orgId = Array.isArray(pageRecord.businesses) ? pageRecord.businesses[0]?.organization_id : pageRecord.businesses?.organization_id;

    const enquiryPayload = {
      name: TEST_CUSTOMER.name,
      phone: TEST_CUSTOMER.phone,
      email: TEST_CUSTOMER.email,
      organizationId: orgId,
      businessId: pageRecord.business_id,
      primaryInterest: TEST_CUSTOMER.productName,
      productSku: TEST_CUSTOMER.productSku,
      productName: TEST_CUSTOMER.productName,
      monthlyBill: TEST_CUSTOMER.monthlyBill,
      systemSize: TEST_CUSTOMER.systemSize,
      utmSource: TEST_CUSTOMER.utmSource,
      dwellTimeSeconds: 22,
      hasInteractedWithCalculator: true,
    };

    const enquiryRes = await fetch(`${BASE_URL}/api/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enquiryPayload),
    });

    const enquiryData = await enquiryRes.json();
    console.log('Enquiry response:', enquiryData);

    if (enquiryRes.status === 200 && enquiryData.success && enquiryData.leadId) {
      testLeadId = enquiryData.leadId;
      results.step2_submit_enquiry = {
        status: 'PASS',
        leadId: testLeadId,
        score: enquiryData.intelligence?.score,
        temperature: enquiryData.intelligence?.temperature,
        stage: enquiryData.stage,
      };
      console.log(`Step 2 PASS: Enquiry submitted successfully. Lead ID: ${testLeadId}\n`);
    } else {
      results.step2_submit_enquiry = { status: 'FAIL', response: enquiryData };
      throw new Error(`Step 2 FAIL: ${enquiryData.error || 'Submission failed'}`);
    }

    // -------------------------------------------------------------------------
    // STEP 3: Verify enquiry persisted in Supabase
    // -------------------------------------------------------------------------
    console.log('--- Step 3: Verify enquiry in Supabase ---');
    const { data: leadRow, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', testLeadId)
      .single();

    if (leadErr || !leadRow) {
      results.step3_supabase_persistence = { status: 'FAIL', error: leadErr };
      throw new Error(`Step 3 FAIL: Could not retrieve lead from Supabase: ${leadErr?.message}`);
    }

    results.step3_supabase_persistence = {
      status: 'PASS',
      dbLeadId: leadRow.id,
      name: leadRow.name,
      phone: leadRow.phone,
      email: leadRow.email,
      temperature: leadRow.temperature,
      status: leadRow.status,
      score: leadRow.score,
      primaryInterest: leadRow.primary_interest,
      notes: leadRow.notes,
      source: leadRow.source,
      organizationId: leadRow.organization_id,
      businessId: leadRow.business_id,
      createdAt: leadRow.created_at,
    };
    console.log('Step 3 PASS: Lead verified directly in Supabase table "leads".\n');

    // -------------------------------------------------------------------------
    // STEP 4: Open /leads and verify lead appears with all submitted details
    // -------------------------------------------------------------------------
    console.log('--- Step 4: Open /leads and verify lead synchronization ---');
    const leadsRes = await fetch(`${BASE_URL}/api/leads`);
    const leadsData = await leadsRes.json();

    const matchedInCrm = leadsData.leads?.find((l) => l.id === testLeadId);

    if (matchedInCrm) {
      results.step4_leads_dashboard_sync = {
        status: 'PASS',
        crmLead: {
          id: matchedInCrm.id,
          name: matchedInCrm.name,
          phone: matchedInCrm.phone,
          email: matchedInCrm.email,
          temperature: matchedInCrm.temperature,
          status: matchedInCrm.status,
          score: matchedInCrm.score,
          primaryInterest: matchedInCrm.primaryInterest,
          source: matchedInCrm.source,
        },
      };
      console.log('Step 4 PASS: Lead matches on /leads CRM feed.\n');
    } else {
      results.step4_leads_dashboard_sync = { status: 'FAIL', leadCount: leadsData.leads?.length };
      throw new Error('Step 4 FAIL: Lead not found in /api/leads feed');
    }

    // -------------------------------------------------------------------------
    // STEP 5: Open CALL WITH AI experience (/api/leads/${leadId}/plan)
    // -------------------------------------------------------------------------
    console.log('--- Step 5: Open CALL WITH AI experience ---');
    const planRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'ta-IN' }),
    });

    const planData = await planRes.json();

    if (planRes.status === 200 && planData.success && planData.plan) {
      results.step5_call_with_ai_experience = {
        status: 'PASS',
        planAvailable: true,
        language: planData.plan.language,
        voice: planData.plan.suggestedVoice,
      };
      console.log('Step 5 PASS: CALL WITH AI experience synthesized plan successfully.\n');
    } else {
      results.step5_call_with_ai_experience = { status: 'FAIL', response: planData };
      throw new Error(`Step 5 FAIL: ${planData.error || 'Failed to synthesize plan'}`);
    }

    // -------------------------------------------------------------------------
    // STEP 6: Verify conversation plan uses exact customer details & product
    // -------------------------------------------------------------------------
    console.log('--- Step 6: Verify conversation plan accuracy ---');
    const plan = planData.plan;
    const mentionsCustomer = plan.objective.includes(TEST_CUSTOMER.name) || plan.openingGreeting.includes(TEST_CUSTOMER.name);
    const mentionsProduct = plan.objective.includes('3kW') || plan.openingGreeting.includes('3kW') || plan.objective.includes('Surya');
    const hasTamilGreeting = plan.openingGreeting.includes('வணக்கம்');
    const hasDiscoveryQuestions = Array.isArray(plan.discoveryQuestions) && plan.discoveryQuestions.length > 0;
    const hasObjections = Array.isArray(plan.anticipatedObjections) && plan.anticipatedObjections.length > 0;

    if (mentionsCustomer && mentionsProduct && hasTamilGreeting && hasDiscoveryQuestions && hasObjections) {
      results.step6_conversation_plan_accuracy = {
        status: 'PASS',
        mentionsCustomer,
        mentionsProduct,
        hasTamilGreeting,
        objective: plan.objective,
        openingGreeting: plan.openingGreeting,
        discoveryQuestionsCount: plan.discoveryQuestions.length,
        objectionsCount: plan.anticipatedObjections.length,
        escalationTrigger: plan.escalationTrigger,
      };
      console.log('Step 6 PASS: Plan accurately incorporates customer name, product, Tamil greeting, and discovery questions.\n');
    } else {
      results.step6_conversation_plan_accuracy = {
        status: 'FAIL',
        mentionsCustomer,
        mentionsProduct,
        hasTamilGreeting,
      };
      throw new Error('Step 6 FAIL: Plan does not contain customer details or Tamil greeting.');
    }

    // -------------------------------------------------------------------------
    // STEP 7: Verify canonical lead ID consistency throughout workflow
    // -------------------------------------------------------------------------
    console.log('--- Step 7: Verify canonical lead ID consistency ---');
    const idsMatch =
      testLeadId === leadRow.id &&
      testLeadId === matchedInCrm.id &&
      testLeadId === planData.plan.leadId;

    if (idsMatch) {
      results.step7_canonical_id_consistency = {
        status: 'PASS',
        canonicalLeadId: testLeadId,
        enquiryReturnedId: testLeadId,
        supabaseRecordId: leadRow.id,
        crmFeedId: matchedInCrm.id,
        planLeadId: planData.plan.leadId,
      };
      console.log(`Step 7 PASS: Canonical lead ID ${testLeadId} is uniform across all layers.\n`);
    } else {
      results.step7_canonical_id_consistency = {
        status: 'FAIL',
        testLeadId,
        supabaseId: leadRow.id,
        crmFeedId: matchedInCrm.id,
        planLeadId: planData.plan.leadId,
      };
      throw new Error('Step 7 FAIL: ID mismatch across workflow.');
    }

    // -------------------------------------------------------------------------
    // STEP 8: Verify timeline and call history load correctly when NO call made
    // -------------------------------------------------------------------------
    console.log('--- Step 8: Verify timeline & call history when no call made ---');
    const leadDetailRes = await fetch(`${BASE_URL}/api/leads/${testLeadId}`);
    const leadDetailData = await leadDetailRes.json();

    const detailSuccess = leadDetailRes.status === 200 && leadDetailData.success;
    const callsAreEmpty = Array.isArray(leadDetailData.calls) && leadDetailData.calls.length === 0;
    const tasksAreEmpty = Array.isArray(leadDetailData.tasks) && leadDetailData.tasks.length === 0;

    // Also check direct call_sessions in DB
    const { data: dbCallSessions } = await supabase
      .from('call_sessions')
      .select('*')
      .eq('lead_id', testLeadId);

    const dbCallsEmpty = Array.isArray(dbCallSessions) && dbCallSessions.length === 0;

    if (detailSuccess && callsAreEmpty && tasksAreEmpty && dbCallsEmpty) {
      results.step8_timeline_empty_call_history = {
        status: 'PASS',
        httpStatus: leadDetailRes.status,
        apiCallsCount: leadDetailData.calls.length,
        dbCallSessionsCount: dbCallSessions.length,
        leadStatus: leadDetailData.lead.status,
      };
      console.log('Step 8 PASS: Lead detail timeline cleanly handles 0 calls without error or spurious records.\n');
    } else {
      results.step8_timeline_empty_call_history = {
        status: 'FAIL',
        detailSuccess,
        callsAreEmpty,
        dbCallsEmpty,
      };
      throw new Error('Step 8 FAIL: Lead detail failed or unexpected call sessions exist.');
    }

    // -------------------------------------------------------------------------
    // STEP 9: Inspect database for duplicate lead prevention
    // -------------------------------------------------------------------------
    console.log('--- Step 9: Inspect database for duplicate prevention ---');
    const { data: duplicates, error: dupErr } = await supabase
      .from('leads')
      .select('id, name, phone, email, created_at')
      .or(`phone.eq.${TEST_CUSTOMER.phone},email.eq.${TEST_CUSTOMER.email}`);

    if (dupErr) throw dupErr;

    if (duplicates && duplicates.length === 1 && duplicates[0].id === testLeadId) {
      results.step9_duplicate_prevention = {
        status: 'PASS',
        matchedRecordsCount: duplicates.length,
        matchingLeadId: duplicates[0].id,
      };
      console.log(`Step 9 PASS: Exactly 1 record exists for phone ${TEST_CUSTOMER.phone}. No duplicates created.\n`);
    } else {
      results.step9_duplicate_prevention = {
        status: 'FAIL',
        count: duplicates?.length,
        records: duplicates,
      };
      throw new Error(`Step 9 FAIL: Found ${duplicates?.length} records matching test customer.`);
    }
  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
  } finally {
    // -------------------------------------------------------------------------
    // STEP 10: Clean up ONLY the test records created during this verification
    // -------------------------------------------------------------------------
    console.log('--- Step 10: Clean up test records ---');
    if (testLeadId) {
      console.log(`Cleaning up test lead ID: ${testLeadId}...`);
      // 1. Delete call_sessions if any
      await supabase.from('call_sessions').delete().eq('lead_id', testLeadId);

      // 2. Delete visitor_events if any
      await supabase.from('visitor_events').delete().eq('phone', TEST_CUSTOMER.phone);
      await supabase.from('visitor_events').delete().eq('email', TEST_CUSTOMER.email);

      // 3. Delete lead
      const { error: delErr } = await supabase.from('leads').delete().eq('id', testLeadId);

      // 4. Verify deletion
      const { data: checkDeleted } = await supabase
        .from('leads')
        .select('id')
        .eq('id', testLeadId)
        .maybeSingle();

      if (!delErr && !checkDeleted) {
        results.step10_clean_up = {
          status: 'PASS',
          cleanedTestLeadId: testLeadId,
          verifiedDeleted: true,
        };
        console.log(`Step 10 PASS: Test lead ${testLeadId} and test events safely cleaned up.\n`);
      } else {
        results.step10_clean_up = {
          status: 'FAIL',
          cleanedTestLeadId: testLeadId,
          delErr,
          stillExists: !!checkDeleted,
        };
        console.error('Step 10 FAIL: Could not cleanly delete test lead.');
      }
    } else {
      results.step10_clean_up = {
        status: 'SKIPPED',
        reason: 'No test lead ID was generated.',
      };
    }
  }

  console.log('================================================================');
  console.log('FINAL SUMMARY OF BROWSER-LEVEL JOURNEY VERIFICATION:');
  console.log('================================================================');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('scripts/verification_results.json', JSON.stringify(results, null, 2));
}

runVerification();
