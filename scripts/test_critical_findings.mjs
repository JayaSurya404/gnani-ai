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
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey);

const BASE_URL = 'http://localhost:3000';
const TEST_ORG_ID = 'c81e8a53-b2db-4162-b8bd-484b6f11a0fa';

const results = {};

async function runCriticalFindingsTests() {
  console.log('================================================================');
  console.log('CRITICAL FINDINGS REGRESSION TEST SUITE: VOICENEXUS AI');
  console.log('Target Server:', BASE_URL);
  console.log('Time:', new Date().toISOString());
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Audio Endpoint Security & Path Traversal Prevention
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Audio Endpoint Security & Path Traversal ---');
  // Attempt directory traversal
  const traversalRes = await fetch(`${BASE_URL}/api/telephony/audio/..%2F..%2Fpackage.json`);
  console.log('Traversal attempt HTTP status:', traversalRes.status);

  // Attempt malformed ID
  const invalidIdRes = await fetch(`${BASE_URL}/api/telephony/audio/bad_id!@#$`);
  console.log('Invalid character attempt HTTP status:', invalidIdRes.status);

  // Attempt short ID
  const shortIdRes = await fetch(`${BASE_URL}/api/telephony/audio/123`);
  console.log('Short ID attempt HTTP status:', shortIdRes.status);

  const securityProtected =
    (traversalRes.status === 400 || traversalRes.status === 404) &&
    (invalidIdRes.status === 400 || invalidIdRes.status === 404) &&
    (shortIdRes.status === 400 || shortIdRes.status === 404);

  results.test1_audio_security = {
    status: securityProtected ? 'PASS' : 'FAIL',
    traversalStatus: traversalRes.status,
    invalidIdStatus: invalidIdRes.status,
    shortIdStatus: shortIdRes.status,
  };
  console.log('Test 1 Result:', results.test1_audio_security);

  // ---------------------------------------------------------------------------
  // TEST 2: Webhook Idempotency (Duplicate Delivery vs Legitimate Repeat)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Webhook Idempotency & Repeat Speech Handling ---');
  const testSessionId = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: testSessionId,
    organization_id: TEST_ORG_ID,
    customer_phone: '+919999900088',
    customer_name: 'Idempotency Tester',
    status: 'IN_PROGRESS',
    direction: 'OUTBOUND',
    channel: 'TELEPHONY',
    start_time: new Date().toISOString(),
  });

  // Turn 1 delivery 1
  const turn1Payload = new URLSearchParams({
    SpeechResult: 'ஆம், எனக்கு சோலார் தேவை',
    Confidence: '0.95',
    CallSid: 'CAtest_idem_0001',
    From: '+919999900088',
  });

  const turn1Res1 = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&turnSeq=1&language=ta-IN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: turn1Payload.toString(),
  });
  const turn1Xml1 = await turn1Res1.text();
  const isIdem1Header = turn1Res1.headers.get('x-voicenexus-idempotent');

  // Turn 1 delivery 2 (identical duplicate webhook)
  const turn1Res2 = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&turnSeq=1&language=ta-IN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: turn1Payload.toString(),
  });
  const turn1Xml2 = await turn1Res2.text();
  const isIdem2Header = turn1Res2.headers.get('x-voicenexus-idempotent');

  console.log('Turn 1 First Delivery Idempotent Header:', isIdem1Header);
  console.log('Turn 1 Duplicate Delivery Idempotent Header:', isIdem2Header);

  // Check database: Only 1 CALLER segment should exist for Turn 1
  const { data: turn1Segments } = await supabase
    .from('transcript_segments')
    .select('id, text, speaker')
    .eq('call_session_id', testSessionId)
    .eq('speaker', 'CALLER');

  const duplicateDeduplicated =
    turn1Res2.status === 200 &&
    isIdem2Header === 'true' &&
    turn1Xml1 === turn1Xml2 &&
    (turn1Segments?.length || 0) === 1;

  // Now Turn 2: Caller legitimately repeats the exact same answer "ஆம், எனக்கு சோலார் தேவை"
  const turn2Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&turnSeq=2&language=ta-IN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: turn1Payload.toString(),
  });
  await turn2Res.text();
  const isIdemTurn2 = turn2Res.headers.get('x-voicenexus-idempotent');

  const { data: turn2Segments } = await supabase
    .from('transcript_segments')
    .select('id, text, speaker')
    .eq('call_session_id', testSessionId)
    .eq('speaker', 'CALLER');

  const legitimateRepeatPreserved =
    turn2Res.status === 200 &&
    isIdemTurn2 !== 'true' && // NOT discarded
    (turn2Segments?.length || 0) === 2; // Second segment legitimately recorded

  results.test2_webhook_idempotency = {
    status: duplicateDeduplicated && legitimateRepeatPreserved ? 'PASS' : 'FAIL',
    duplicateDeduplicated,
    legitimateRepeatPreserved,
    totalCallerSegments: turn2Segments?.length || 0,
  };
  console.log('Test 2 Result:', results.test2_webhook_idempotency);

  // ---------------------------------------------------------------------------
  // TEST 3: DNC Server-Side Enforcement (Manual & Outbound Initiation)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Server-Side DNC Enforcement ---');
  // Create a temporary lead with do_not_call = true
  const dncLeadId = crypto.randomUUID();
  const dncPhone = '+919999900099';
  await supabase.from('leads').insert({
    id: dncLeadId,
    organization_id: TEST_ORG_ID,
    name: 'Temporary DNC Lead',
    phone: dncPhone,
    status: 'DO_NOT_CALL',
    do_not_call: true,
    source: 'TEST',
  });

  // Attempt outbound call to this DNC lead by phone
  const outboundByPhoneRes = await fetch(`${BASE_URL}/api/telephony/outbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organizationId: TEST_ORG_ID,
      customerPhone: dncPhone,
      customerName: 'Temporary DNC Lead',
      skipWindowCheck: true,
    }),
  });
  const outboundByPhoneJson = await outboundByPhoneRes.json();
  console.log('Outbound by phone DNC response:', outboundByPhoneRes.status, outboundByPhoneJson);

  // Attempt outbound call to this DNC lead by leadId
  const outboundByLeadRes = await fetch(`${BASE_URL}/api/telephony/outbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organizationId: TEST_ORG_ID,
      leadId: dncLeadId,
      customerPhone: '+919999900098', // Different phone string, but same leadId
      skipWindowCheck: true,
    }),
  });
  const outboundByLeadJson = await outboundByLeadRes.json();
  console.log('Outbound by leadId DNC response:', outboundByLeadRes.status, outboundByLeadJson);

  const dncSuppressed =
    outboundByPhoneRes.status === 403 &&
    outboundByPhoneJson.isDncSuppressed === true &&
    outboundByLeadRes.status === 403 &&
    outboundByLeadJson.isDncSuppressed === true;

  results.test3_dnc_enforcement = {
    status: dncSuppressed ? 'PASS' : 'FAIL',
    byPhoneBlocked: outboundByPhoneRes.status === 403,
    byLeadIdBlocked: outboundByLeadRes.status === 403,
  };
  console.log('Test 3 Result:', results.test3_dnc_enforcement);

  // Clean up temporary DNC lead
  await supabase.from('leads').delete().eq('id', dncLeadId);

  // ---------------------------------------------------------------------------
  // TEST 4: Gemini Fallback Grounding & Accurate Provider Attribution
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Grounded Fallback & Provider Attribution ---');
  const { generateLLMVoiceTurn } = await import('../src/lib/telephony/llm-voice-turn.ts');

  const customTenant = {
    businessName: 'Cauvery Solar Energy Solutions',
    businessCity: 'Tiruchirappalli',
    products: [
      { name: 'Cauvery 2kW Solar Rooftop Kit', price: '₹1,40,000' },
      { name: 'Cauvery 10kW Commercial System', price: '₹5,20,000' },
    ],
  };

  // Test dynamic tenant grounding (mocking provider failover by passing utterance)
  const turnResult = await generateLLMVoiceTurn({
    userUtterance: 'விலை மற்றும் பேக்கேஜ் விவரங்கள் சொல்லுங்கள்',
    conversationHistory: [],
    customerName: 'Senthil',
    language: 'ta-IN',
    tenantContext: customTenant,
  });

  console.log('Turn Output:', turnResult);

  // Verify that fallback or LLM includes the custom tenant's real product
  const containsTenantProduct =
    turnResult.text.includes('1,40,000') ||
    turnResult.text.includes('Cauvery') ||
    turnResult.text.includes('கிடைக்கும்');

  // Verify that it never mentions default Aadhira Solar when given a different tenant
  const noAadhiraLeak = !turnResult.text.includes('ஆதிரா') && !turnResult.text.includes('Aadhira');

  // Verify that model name is explicitly and accurately logged
  const hasAccurateModel = turnResult.model === 'gemini-2.5-flash' || turnResult.model === 'tenant-fallback';

  results.test4_gemini_fallback = {
    status: containsTenantProduct && noAadhiraLeak && hasAccurateModel ? 'PASS' : 'FAIL',
    containsTenantProduct,
    noAadhiraLeak,
    attributedModel: turnResult.model,
  };
  console.log('Test 4 Result:', results.test4_gemini_fallback);

  // ---------------------------------------------------------------------------
  // TEST 5: Human Escalation Live Dial TwiML Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Human Escalation Live Dial TwiML ---');
  const escPayload = new URLSearchParams({
    SpeechResult: 'மேனேஜர் கிட்ட பேசு, மனிதரிடம் பேசு',
    Confidence: '0.90',
    CallSid: 'CAtest_esc_0001',
    From: '+919999900088',
  });

  const escRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&turnSeq=3&language=ta-IN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: escPayload.toString(),
  });
  const escXml = await escRes.text();
  console.log('Escalation XML Snippet:\n', escXml);

  const hasEscalationSpeech = escXml.includes('பொறியாளர்') || escXml.includes('engineer') || escXml.includes('representative');
  const hasValidTerminationOrDial = escXml.includes('<Hangup/>') || escXml.includes('<Dial');

  results.test5_human_escalation = {
    status: hasEscalationSpeech && hasValidTerminationOrDial ? 'PASS' : 'FAIL',
    hasEscalationSpeech,
    hasValidTerminationOrDial,
  };
  console.log('Test 5 Result:', results.test5_human_escalation);

  // Clean up test session
  await supabase.from('transcript_segments').delete().eq('call_session_id', testSessionId);
  await supabase.from('call_events').delete().eq('call_session_id', testSessionId);
  await supabase.from('call_sessions').delete().eq('id', testSessionId);
  console.log('\nCleaned up test session records.');

  console.log('\n================================================================');
  console.log('CRITICAL FINDINGS TEST SUMMARY:');
  console.log(JSON.stringify(results, null, 2));
  console.log('================================================================\n');

  const allPassed = Object.values(results).every((r) => r?.status === 'PASS');
  if (allPassed) {
    console.log('>>> ALL 5 CRITICAL FINDINGS REGRESSION TESTS PASSED (100%) <<<');
  } else {
    console.error('>>> SOME REGRESSION TESTS FAILED. <<<');
    process.exit(1);
  }
}

runCriticalFindingsTests().catch((err) => {
  console.error('Test failed with uncaught exception:', err);
  process.exit(1);
});
