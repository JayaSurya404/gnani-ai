import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import fs from 'fs';
import { checkAndReconcileActiveCalls } from '../src/lib/telephony/active-call-reconciliation.ts';

function loadEnv() {
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuth = process.env.TWILIO_AUTH_TOKEN;

const supabase = createClient(supabaseUrl, serviceKey);
const realTwilioClient = twilio(twilioSid, twilioAuth);

// Mock Organization ID and Test Phone Numbers
const TEST_ORG_ID = 'c81e8a53-b2db-4162-b8bd-484b6f11a0fa';
const TEST_PHONE_A = '+919999900001';
const TEST_PHONE_B = '+919999900002';
const VARIANTS_A = [TEST_PHONE_A, '9999900001'];
const VARIANTS_B = [TEST_PHONE_B, '9999900002'];

const results = {};

async function cleanupTestSession(sessionId) {
  if (sessionId) {
    await supabase.from('call_sessions').delete().eq('id', sessionId);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: CONCURRENCY CHECK & CARRIER RECONCILIATION');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: No existing call -> new call is allowed
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: No existing call -> new call is allowed ---');
  // Ensure no active calls for TEST_PHONE_A
  const test1Check = await checkAndReconcileActiveCalls(
    supabase,
    realTwilioClient,
    TEST_ORG_ID,
    VARIANTS_A
  );
  if (!test1Check.hasGenuinelyActiveCall) {
    results.test1_no_existing_call = { status: 'PASS', allowed: true };
    console.log('Test 1 PASS: Allowed as expected.\n');
  } else {
    results.test1_no_existing_call = { status: 'FAIL', result: test1Check };
    console.error('Test 1 FAIL:', test1Check);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Existing ringing call -> new call is blocked
  // ---------------------------------------------------------------------------
  console.log('--- Test 2: Existing ringing call -> new call is blocked ---');
  const sess2Id = crypto.randomUUID();
  // Create an active session with mock Twilio client that returns ringing
  await supabase.from('call_sessions').insert({
    id: sess2Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'RINGING',
    recording_url: 'twilio:CA0123456789abcdef0123456789abcd02',
    start_time: new Date().toISOString(),
  });

  const mockTwilioRinging = {
    calls: () => ({
      fetch: async () => ({
        status: 'ringing',
        duration: null,
      }),
    }),
  };

  const test2Check = await checkAndReconcileActiveCalls(
    supabase,
    mockTwilioRinging,
    TEST_ORG_ID,
    VARIANTS_A
  );

  await cleanupTestSession(sess2Id);

  if (test2Check.hasGenuinelyActiveCall && test2Check.blockingCallSessionId === sess2Id) {
    results.test2_ringing_blocked = {
      status: 'PASS',
      blocked: true,
      reason: test2Check.reason,
    };
    console.log('Test 2 PASS: Blocked genuinely ringing call.\n');
  } else {
    results.test2_ringing_blocked = { status: 'FAIL', result: test2Check };
    console.error('Test 2 FAIL:', test2Check);
  }

  // Test 3:
  const sess3Id = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: sess3Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'IN_PROGRESS',
    recording_url: 'twilio:CA0123456789abcdef0123456789abcd03',
    start_time: new Date().toISOString(),
  });

  const mockTwilioInProgress = {
    calls: () => ({
      fetch: async () => ({
        status: 'in-progress',
        duration: '15',
      }),
    }),
  };

  const test3Check = await checkAndReconcileActiveCalls(
    supabase,
    mockTwilioInProgress,
    TEST_ORG_ID,
    VARIANTS_A
  );

  await cleanupTestSession(sess3Id);

  if (test3Check.hasGenuinelyActiveCall && test3Check.blockingCallSessionId === sess3Id) {
    results.test3_in_progress_blocked = {
      status: 'PASS',
      blocked: true,
      reason: test3Check.reason,
    };
    console.log('Test 3 PASS: Blocked genuinely in-progress call.\n');
  } else {
    results.test3_in_progress_blocked = { status: 'FAIL', result: test3Check };
    console.error('Test 3 FAIL:', test3Check);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Completed call -> new call is allowed
  // ---------------------------------------------------------------------------
  console.log('--- Test 4: Completed call -> new call is allowed ---');
  const sess4Id = crypto.randomUUID();
  // Call session with COMPLETED status
  await supabase.from('call_sessions').insert({
    id: sess4Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'COMPLETED',
    recording_url: 'twilio:CAmockcompleted000000000000001',
    duration_seconds: 35,
    start_time: new Date(Date.now() - 300000).toISOString(),
    end_time: new Date(Date.now() - 265000).toISOString(),
  });

  const test4Check = await checkAndReconcileActiveCalls(
    supabase,
    realTwilioClient,
    TEST_ORG_ID,
    VARIANTS_A
  );

  await cleanupTestSession(sess4Id);

  if (!test4Check.hasGenuinelyActiveCall) {
    results.test4_completed_allowed = { status: 'PASS', allowed: true };
    console.log('Test 4 PASS: Completed call ignored, new call allowed.\n');
  } else {
    results.test4_completed_allowed = { status: 'FAIL', result: test4Check };
    console.error('Test 4 FAIL:', test4Check);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Failed call -> new call is allowed
  // ---------------------------------------------------------------------------
  console.log('--- Test 5: Failed call -> new call is allowed ---');
  const sess5Id = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: sess5Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'FAILED',
    start_time: new Date(Date.now() - 600000).toISOString(),
    end_time: new Date(Date.now() - 599000).toISOString(),
  });

  const test5Check = await checkAndReconcileActiveCalls(
    supabase,
    realTwilioClient,
    TEST_ORG_ID,
    VARIANTS_A
  );

  await cleanupTestSession(sess5Id);

  if (!test5Check.hasGenuinelyActiveCall) {
    results.test5_failed_allowed = { status: 'PASS', allowed: true };
    console.log('Test 5 PASS: Failed call ignored, new call allowed.\n');
  } else {
    results.test5_failed_allowed = { status: 'FAIL', result: test5Check };
    console.error('Test 5 FAIL:', test5Check);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: No-answer or busy call -> new call is allowed after finalization
  // ---------------------------------------------------------------------------
  console.log('--- Test 6: No-answer or busy call -> new call is allowed ---');
  const sess6Id = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: sess6Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'NO_ANSWER',
    start_time: new Date(Date.now() - 120000).toISOString(),
    end_time: new Date(Date.now() - 90000).toISOString(),
  });

  const test6Check = await checkAndReconcileActiveCalls(
    supabase,
    realTwilioClient,
    TEST_ORG_ID,
    VARIANTS_A
  );

  await cleanupTestSession(sess6Id);

  if (!test6Check.hasGenuinelyActiveCall) {
    results.test6_no_answer_allowed = { status: 'PASS', allowed: true };
    console.log('Test 6 PASS: NO_ANSWER call allowed.\n');
  } else {
    results.test6_no_answer_allowed = { status: 'FAIL', result: test6Check };
    console.error('Test 6 FAIL:', test6Check);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Stale database session with Twilio SID -> safely reconciled
  // ---------------------------------------------------------------------------
  console.log('--- Test 7: Stale database session -> safely reconciled ---');
  const sess7Id = crypto.randomUUID();
  // A session that is still INITIATING in DB, but Twilio says completed
  await supabase.from('call_sessions').insert({
    id: sess7Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'INITIATING',
    recording_url: 'twilio:CA0123456789abcdef0123456789abcd07',
    start_time: new Date(Date.now() - 1800000).toISOString(), // 30 mins ago
  });

  const mockTwilioStaleCompleted = {
    calls: () => ({
      fetch: async () => ({
        status: 'completed',
        duration: '22',
        endTime: new Date(Date.now() - 1700000).toISOString(),
      }),
    }),
  };

  const test7Check = await checkAndReconcileActiveCalls(
    supabase,
    mockTwilioStaleCompleted,
    TEST_ORG_ID,
    VARIANTS_A
  );

  // Check DB to verify session was reconciled to COMPLETED
  const { data: updatedSess7 } = await supabase
    .from('call_sessions')
    .select('status, duration_seconds')
    .eq('id', sess7Id)
    .single();

  await cleanupTestSession(sess7Id);

  if (!test7Check.hasGenuinelyActiveCall && updatedSess7?.status === 'COMPLETED' && updatedSess7?.duration_seconds === 22) {
    results.test7_stale_reconciled = {
      status: 'PASS',
      reconciledStatus: updatedSess7.status,
      duration: updatedSess7.duration_seconds,
      newCallAllowed: true,
    };
    console.log('Test 7 PASS: Stale session reconciled to COMPLETED and new call allowed.\n');
  } else {
    results.test7_stale_reconciled = {
      status: 'FAIL',
      test7Check,
      updatedSess7,
    };
    console.error('Test 7 FAIL:', test7Check, updatedSess7);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Different phone number -> not blocked by another recipient's call
  // ---------------------------------------------------------------------------
  console.log("--- Test 8: Different phone number -> not blocked ---");
  const sess8Id = crypto.randomUUID();
  // Phone A has a genuinely active call
  await supabase.from('call_sessions').insert({
    id: sess8Id,
    organization_id: TEST_ORG_ID,
    customer_phone: TEST_PHONE_A,
    status: 'IN_PROGRESS',
    recording_url: 'twilio:CA0123456789abcdef0123456789abcd08',
    start_time: new Date().toISOString(),
  });

  const mockTwilioActiveOther = {
    calls: () => ({
      fetch: async () => ({
        status: 'in-progress',
        duration: '10',
      }),
    }),
  };

  // Now query for Phone B
  const test8Check = await checkAndReconcileActiveCalls(
    supabase,
    mockTwilioActiveOther,
    TEST_ORG_ID,
    VARIANTS_B
  );

  await cleanupTestSession(sess8Id);

  if (!test8Check.hasGenuinelyActiveCall) {
    results.test8_different_phone_not_blocked = {
      status: 'PASS',
      allowedPhoneB: true,
    };
    console.log("Test 8 PASS: Phone B allowed while Phone A is active.\n");
  } else {
    results.test8_different_phone_not_blocked = { status: 'FAIL', result: test8Check };
    console.error('Test 8 FAIL:', test8Check);
  }

  // ---------------------------------------------------------------------------
  // LIVE RECONCILIATION OF THE ACTUAL BLOCKING RECORD (39091357-60ae-4a1d-b2b9-9f65eb37e01e)
  // ---------------------------------------------------------------------------
  console.log('--- RECONCILING ACTUAL BLOCKING USER RECORD WITH LIVE TWILIO API ---');
  const targetVariants = ['+916382868845', '6382868845'];
  const liveCheck = await checkAndReconcileActiveCalls(
    supabase,
    realTwilioClient,
    TEST_ORG_ID,
    targetVariants
  );

  const { data: verifiedRecord } = await supabase
    .from('call_sessions')
    .select('id, status, duration_seconds, end_time, recording_url')
    .eq('id', '39091357-60ae-4a1d-b2b9-9f65eb37e01e')
    .single();

  results.live_blocking_record_reconciled = {
    blockingSessionId: '39091357-60ae-4a1d-b2b9-9f65eb37e01e',
    previousStatus: 'INITIATING',
    reconciledStatus: verifiedRecord?.status,
    durationSeconds: verifiedRecord?.duration_seconds,
    endTime: verifiedRecord?.end_time,
    isNowBlocked: liveCheck.hasGenuinelyActiveCall,
    safeToCallNow: !liveCheck.hasGenuinelyActiveCall,
  };

  console.log('Live Reconciliation Result:\n', results.live_blocking_record_reconciled);

  console.log('\n================================================================');
  console.log('SUMMARY OF ALL TEST RESULTS:');
  console.log('================================================================');
  console.log(JSON.stringify(results, null, 2));
}

runTests();
