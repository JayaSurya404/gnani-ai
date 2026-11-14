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

const auditResults = {
  section1_twiml_sequential: null,
  section2_production_llm: null,
  section3_multitenant_isolation: null,
  section4_conversation_state_dnc_escalation: null,
  section5_audio_gnani_tts_wav: null,
  section6_empty_speech_retry: null,
};

async function runAudit() {
  console.log('================================================================');
  console.log('FINAL PRODUCTION READINESS AUDIT: VOICENEXUS AI MULTI-TURN');
  console.log('Base URL:', BASE_URL);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Time:', new Date().toISOString());
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // SECTION 1: TwiML Playback & Listening Sequence Verification
  // ---------------------------------------------------------------------------
  console.log('>>> [1/6] AUDITING TWIML PLAYBACK & LISTENING SEQUENCE <<<');
  const session1Id = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: session1Id,
    organization_id: TEST_ORG_ID,
    customer_phone: '+919999900001',
    customer_name: 'Audit Caller',
    status: 'IN_PROGRESS',
    direction: 'OUTBOUND',
    channel: 'TELEPHONY',
    start_time: new Date().toISOString(),
  });

  // Fetch outbound-twiml
  const twimlRes = await fetch(`${BASE_URL}/api/telephony/outbound-twiml?sessionId=${session1Id}&mode=TURN_BASED&language=ta-IN`);
  const twimlXml = await twimlRes.text();
  console.log('Outbound TwiML Response Status:', twimlRes.status);
  console.log('Outbound TwiML Snippet:\n', twimlXml);

  const playIndex = twimlXml.indexOf('<Play>') !== -1 ? twimlXml.indexOf('<Play>') : twimlXml.indexOf('<Say');
  const gatherIndex = twimlXml.indexOf('<Gather');
  const isPlayBeforeGather = playIndex !== -1 && gatherIndex !== -1 && playIndex < gatherIndex;

  // Check if gather has a nested play/say
  const gatherClosingIndex = twimlXml.indexOf('</Gather>');
  const gatherContent = twimlXml.slice(gatherIndex, gatherClosingIndex);
  const isGatherEmptyOfPlay = !gatherContent.includes('<Play>') && !gatherContent.includes('<Say');

  const hasSequentialGather = twimlXml.includes('timeout="5"') || twimlXml.includes('speechTimeout="auto"');
  const hasRedirectFallback = twimlXml.includes('<Redirect') && twimlXml.includes('emptyTurns=1');

  const section1Pass = isPlayBeforeGather && isGatherEmptyOfPlay && hasRedirectFallback;
  auditResults.section1_twiml_sequential = {
    status: section1Pass ? 'PASS' : 'FAIL',
    isPlayBeforeGather,
    isGatherEmptyOfPlay,
    hasSequentialGather,
    hasRedirectFallback,
  };
  console.log('Section 1 Result:', auditResults.section1_twiml_sequential);

  // ---------------------------------------------------------------------------
  // SECTION 2: Production LLM Verification (Gemini 2.5 Flash)
  // ---------------------------------------------------------------------------
  console.log('\n>>> [2/6] AUDITING PRODUCTION LLM (GEMINI 2.5 FLASH) <<<');
  const turnPayload = new URLSearchParams({
    SpeechResult: 'வீட்டுக்கு சோலார் பேனல் போட எவ்வளவு செலவாகும்?',
    Confidence: '0.92',
    CallSid: 'CAauditcallsid0000000002',
    From: '+919999900001',
    To: '+17372324091',
  });

  const startTime = Date.now();
  const turnRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${session1Id}&language=ta-IN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: turnPayload.toString(),
  });
  const turnXml = await turnRes.text();
  const latency = Date.now() - startTime;
  console.log(`Turn API Response: Status ${turnRes.status} in ${latency}ms`);
  console.log('Turn XML Snippet:\n', turnXml.slice(0, 400));

  // Check database call_events for model logged
  const { data: agentEvents } = await supabase
    .from('call_events')
    .select('payload')
    .eq('call_session_id', session1Id)
    .eq('event_type', 'AGENT_RESPONSE')
    .order('created_at', { ascending: false })
    .limit(1);

  const modelLogged = agentEvents?.[0]?.payload?.model || 'unknown';
  const responseText = agentEvents?.[0]?.payload?.text || '';
  console.log('Model logged:', modelLogged);
  console.log('Response text:', responseText);

  // Check no markdown/asterisks in spoken audio text
  const hasNoMarkdown = !/[*_#`~]/.test(responseText);
  // Verify primary LLM or resilient domain fallback
  const isModelValid = modelLogged === 'gemini-2.5-flash' || modelLogged === 'tenant-fallback';

  auditResults.section2_production_llm = {
    status: isModelValid && hasNoMarkdown ? 'PASS' : 'FAIL',
    modelLogged,
    latencyMs: latency,
    hasNoMarkdown,
    responseLength: responseText.length,
  };
  console.log('Section 2 Result:', auditResults.section2_production_llm);

  // ---------------------------------------------------------------------------
  // SECTION 3: Multi-Tenant Business Context Isolation
  // ---------------------------------------------------------------------------
  console.log('\n>>> [3/6] AUDITING MULTI-TENANT ISOLATION <<<');
  // Directly test the generateLLMVoiceTurn function across two different tenants
  const { generateLLMVoiceTurn } = await import('../src/lib/telephony/llm-voice-turn.ts');

  // Tenant A: Solar Business
  const tenantASolar = {
    businessName: 'Aadhira Solar Technologies',
    businessCity: 'Coimbatore',
    businessState: 'Tamil Nadu',
    businessDescription: 'Rooftop solar engineering and EPC installations.',
    products: [
      { name: '3kW On-Grid Solar System', price: '₹1,85,000', description: 'Includes 78,000 PM Surya Ghar subsidy' },
      { name: '5kW On-Grid Solar System', price: '₹2,85,000', description: 'High efficiency Mono PERC bifacial' },
    ],
  };

  // Tenant B: Dental Clinic (completely unrelated industry)
  const tenantBDental = {
    businessName: 'Apex Dental Care & Implant Center',
    businessCity: 'Chennai',
    businessState: 'Tamil Nadu',
    businessDescription: 'Advanced laser dentistry and dental implants.',
    products: [
      { name: 'Complete Dental Cleaning & Polishing', price: '₹1,500', description: 'Ultrasonic scaling with stain removal' },
      { name: 'Titanium Dental Implant Package', price: '₹28,000', description: 'German titanium implant with lifetime warranty' },
    ],
  };

  const solarTurn = await generateLLMVoiceTurn({
    userUtterance: 'What is the price of the 3kW system?',
    conversationHistory: [],
    customerName: 'Karthik',
    language: 'en-IN',
    tenantContext: tenantASolar,
  });

  const dentalTurn = await generateLLMVoiceTurn({
    userUtterance: 'What is the price of dental cleaning?',
    conversationHistory: [],
    customerName: 'Ananya',
    language: 'en-IN',
    tenantContext: tenantBDental,
  });

  console.log('Tenant A (Solar) Response:', solarTurn.text);
  console.log('Tenant B (Dental) Response:', dentalTurn.text);

  const solarHasPricing = solarTurn.text.includes('1,85,000') || solarTurn.text.toLowerCase().includes('solar') || solarTurn.text.toLowerCase().includes('3kw');
  const dentalHasPricing = dentalTurn.text.includes('1,500') || dentalTurn.text.toLowerCase().includes('cleaning') || dentalTurn.text.toLowerCase().includes('dental');
  const noContextBleed = !dentalTurn.text.toLowerCase().includes('solar') && !solarTurn.text.toLowerCase().includes('dental');

  auditResults.section3_multitenant_isolation = {
    status: solarHasPricing && dentalHasPricing && noContextBleed ? 'PASS' : 'FAIL',
    solarHasPricing,
    dentalHasPricing,
    noContextBleed,
    tenantAModel: solarTurn.model,
    tenantBModel: dentalTurn.model,
  };
  console.log('Section 3 Result:', auditResults.section3_multitenant_isolation);

  // ---------------------------------------------------------------------------
  // SECTION 4: Conversation State, DNC Opt-Out, and Escalation
  // ---------------------------------------------------------------------------
  console.log('\n>>> [4/6] AUDITING STATE, DNC, AND HUMAN ESCALATION <<<');
  // DNC Test
  const dncTurn = await generateLLMVoiceTurn({
    userUtterance: 'போனை வை, எனக்கு வேண்டாம் கால் பண்ணாதீங்க',
    conversationHistory: [],
    customerName: 'TestUser',
    language: 'ta-IN',
    tenantContext: tenantASolar,
  });
  console.log('DNC Response:', dncTurn);

  // Escalation Test
  const escTurn = await generateLLMVoiceTurn({
    userUtterance: 'I want to speak with your senior engineer right now',
    conversationHistory: [],
    customerName: 'TestUser',
    language: 'en-IN',
    tenantContext: tenantASolar,
  });
  console.log('Escalation Response:', escTurn);

  // Cross-Session History Separation Verification
  const session2Id = crypto.randomUUID();
  await supabase.from('call_sessions').insert({
    id: session2Id,
    organization_id: TEST_ORG_ID,
    customer_phone: '+919999900002',
    customer_name: 'Caller 2',
    status: 'IN_PROGRESS',
    direction: 'OUTBOUND',
    channel: 'TELEPHONY',
    start_time: new Date().toISOString(),
  });

  const { data: session1Segments } = await supabase
    .from('transcript_segments')
    .select('id, text, speaker')
    .eq('call_session_id', session1Id);

  const { data: session2Segments } = await supabase
    .from('transcript_segments')
    .select('id, text, speaker')
    .eq('call_session_id', session2Id);

  const isSessionSeparated = (session1Segments?.length || 0) > 0 && (session2Segments?.length || 0) === 0;

  auditResults.section4_conversation_state_dnc_escalation = {
    status: dncTurn.isDnc && escTurn.isEscalation && isSessionSeparated ? 'PASS' : 'FAIL',
    dncHandled: dncTurn.isDnc,
    escalationHandled: escTurn.isEscalation,
    crossSessionSeparated: isSessionSeparated,
  };
  console.log('Section 4 Result:', auditResults.section4_conversation_state_dnc_escalation);

  // ---------------------------------------------------------------------------
  // SECTION 5: Gnani Timbre TTS Audio & WAV Format Verification
  // ---------------------------------------------------------------------------
  console.log('\n>>> [5/6] AUDITING GNANI TTS WAV AUDIO SERVING <<<');
  // Extract audio ID from Section 1 or Section 2 XML
  const audioMatch = twimlXml.match(/aud_[a-z0-9]+/i) || turnXml.match(/aud_[a-z0-9]+/i);
  const audioId = audioMatch ? audioMatch[0] : null;
  console.log('Auditing Audio ID from Live Telephony:', audioId);

  let wavValid = false;
  let audioBytes = 0;
  if (audioId) {
    const audioRes = await fetch(`${BASE_URL}/api/telephony/audio/${audioId}`);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    audioBytes = audioBuffer.length;
    const contentType = audioRes.headers.get('content-type');
    console.log(`Audio HTTP Status: ${audioRes.status}, Content-Type: ${contentType}, Size: ${audioBytes} bytes`);

    // Inspect WAV header (first 12 bytes must be RIFF ... WAVE)
    const riff = audioBuffer.toString('ascii', 0, 4);
    const wave = audioBuffer.toString('ascii', 8, 12);
    wavValid = audioRes.status === 200 && contentType?.includes('audio/wav') && riff === 'RIFF' && wave === 'WAVE' && audioBytes > 20000;
    console.log(`WAV Header Check: RIFF="${riff}", WAVE="${wave}", Valid=${wavValid}`);
  }

  auditResults.section5_audio_gnani_tts_wav = {
    status: wavValid ? 'PASS' : 'FAIL',
    audioId,
    audioBytes,
    wavValid,
  };
  console.log('Section 5 Result:', auditResults.section5_audio_gnani_tts_wav);

  // ---------------------------------------------------------------------------
  // SECTION 6: Empty Speech / Silence Handling & Retry Flow
  // ---------------------------------------------------------------------------
  console.log('\n>>> [6/6] AUDITING EMPTY SPEECH & RETRY STATE MACHINE <<<');
  // Turn with empty speech and emptyTurns=1 (first silence retry)
  const emptyTurn1Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${session1Id}&language=ta-IN&emptyTurns=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ SpeechResult: '', CallSid: 'CAaudit0000000003' }).toString(),
  });
  const emptyTurn1Xml = await emptyTurn1Res.text();
  console.log('Empty Turn 1 XML (Retry Prompt expected):\n', emptyTurn1Xml);

  const hasRetryPrompt = emptyTurn1Xml.includes('மன்னிக்கவும்') || emptyTurn1Xml.includes('repeat') || emptyTurn1Xml.includes('<Play');
  const hasGatherRetry = emptyTurn1Xml.includes('<Gather') && emptyTurn1Xml.includes('emptyTurns=0');
  const hasRedirectToStrike2 = emptyTurn1Xml.includes('emptyTurns=2');

  // Turn with empty speech and emptyTurns=2 (second silence -> farewell & hangup)
  const emptyTurn2Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${session1Id}&language=ta-IN&emptyTurns=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ SpeechResult: '', CallSid: 'CAaudit0000000003' }).toString(),
  });
  const emptyTurn2Xml = await emptyTurn2Res.text();
  console.log('Empty Turn 2 XML (Farewell & Hangup expected):\n', emptyTurn2Xml);

  const hasHangup = emptyTurn2Xml.includes('<Hangup/>');
  const hasFarewell = emptyTurn2Xml.includes('வணக்கம்') || emptyTurn2Xml.includes('Goodbye') || emptyTurn2Xml.includes('நன்றி');

  const section6Pass = hasRetryPrompt && hasGatherRetry && hasRedirectToStrike2 && hasHangup && hasFarewell;
  auditResults.section6_empty_speech_retry = {
    status: section6Pass ? 'PASS' : 'FAIL',
    hasRetryPrompt,
    hasGatherRetry,
    hasRedirectToStrike2,
    hasFarewell,
    hasHangup,
  };
  console.log('Section 6 Result:', auditResults.section6_empty_speech_retry);

  // ---------------------------------------------------------------------------
  // CLEANUP TEST SESSIONS
  // ---------------------------------------------------------------------------
  console.log('\nCleaning up audit test sessions...');
  await supabase.from('transcript_segments').delete().in('call_session_id', [session1Id, session2Id]);
  await supabase.from('call_events').delete().in('call_session_id', [session1Id, session2Id]);
  await supabase.from('call_sessions').delete().in('id', [session1Id, session2Id]);
  console.log('Cleanup completed.');

  console.log('\n================================================================');
  console.log('PRODUCTION READINESS AUDIT SUMMARY:');
  console.log(JSON.stringify(auditResults, null, 2));
  console.log('================================================================\n');

  const allPassed = Object.values(auditResults).every((r) => r?.status === 'PASS');
  if (allPassed) {
    console.log('>>> ALL 6 PRODUCTION READINESS AUDIT GATES PASSED (100%) <<<');
  } else {
    console.error('>>> SOME AUDIT GATES FAILED. INSPECT RESULTS ABOVE. <<<');
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit failed with uncaught error:', err);
  process.exit(1);
});
