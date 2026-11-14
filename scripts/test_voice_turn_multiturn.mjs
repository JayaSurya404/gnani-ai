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

async function runMultiturnTests() {
  console.log('================================================================');
  console.log('PHASE 4: MULTI-TURN SPEECH RECOGNITION & CONVERSATION TEST');
  console.log('Target Server:', BASE_URL);
  console.log('================================================================\n');

  const testSessionId = crypto.randomUUID();
  const testPhone = '+916382868845';

  try {
    // 0. Set up initial call session in DB
    await supabase.from('call_sessions').insert({
      id: testSessionId,
      organization_id: TEST_ORG_ID,
      customer_phone: testPhone,
      customer_name: 'Chitresh Kumar',
      status: 'IN_PROGRESS',
      direction: 'OUTBOUND',
      channel: 'TELEPHONY',
      recording_url: 'twilio:CAtestmultiturntwilio0000000001',
      start_time: new Date().toISOString(),
    });

    // -------------------------------------------------------------------------
    // TEST 1, 2, 3, 4, 5, 6, 7: Turn 1 with valid SpeechResult
    // -------------------------------------------------------------------------
    console.log('--- Turn 1: Valid Tamil SpeechResult from Caller ---');
    const turn1Payload = new URLSearchParams({
      SpeechResult: 'சோலார் வீட்ல போடலாம்னு இருக்கேன், ரெண்டு ஃப்ளோர் வீடு',
      Confidence: '0.85',
      CallSid: 'CAtestmultiturntwilio0000000001',
      From: testPhone,
      To: '+17372324091',
    });

    const turn1Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&language=ta-IN`, {
      method: 'POST',
      headers: {
        'User-Agent': 'TwilioProxy/1.1',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: turn1Payload.toString(),
    });

    const turn1Xml = await turn1Res.text();
    const isXml = turn1Res.headers.get('content-type')?.includes('text/xml');
    console.log(`Turn 1 HTTP: ${turn1Res.status}, Content-Type: ${turn1Res.headers.get('content-type')}`);
    console.log(`Turn 1 TwiML XML:\n${turn1Xml.slice(0, 300)}...`);

    // Verify next Gather listening step
    const hasGather = turn1Xml.includes('<Gather') && turn1Xml.includes('input="speech"');
    // Verify session ID in action URL
    const hasSameSessionId = turn1Xml.includes(testSessionId);
    // Extract Audio ID
    const audioMatch = turn1Xml.match(/aud_[a-z0-9]+/i);
    const audioId = audioMatch ? audioMatch[0] : null;

    results.test1_speech_received = {
      status: turn1Res.status === 200 && isXml ? 'PASS' : 'FAIL',
      httpStatus: turn1Res.status,
      contentType: turn1Res.headers.get('content-type'),
    };

    results.test6_next_gather_present = {
      status: hasGather ? 'PASS' : 'FAIL',
      hasGather,
    };

    results.test7_session_id_retained = {
      status: hasSameSessionId ? 'PASS' : 'FAIL',
      sessionId: testSessionId,
      retainedInXml: hasSameSessionId,
    };

    // -------------------------------------------------------------------------
    // TEST 3 & 4: Caller and Agent transcripts saved to database
    // -------------------------------------------------------------------------
    console.log('\n--- Checking Database Transcripts for Turn 1 ---');
    const { data: segmentsTurn1 } = await supabase
      .from('transcript_segments')
      .select('speaker, text, confidence')
      .eq('call_session_id', testSessionId)
      .order('created_at', { ascending: true });

    const callerSegment = segmentsTurn1?.find((s) => s.speaker === 'CALLER');
    const agentSegment = segmentsTurn1?.find((s) => s.speaker === 'AGENT');

    console.log(`Caller Segment: "${callerSegment?.text}"`);
    console.log(`Agent Segment: "${agentSegment?.text}"`);

    // Check that Agent response is NOT the static fallback greeting
    const isRepeatedGreeting = agentSegment?.text?.includes('Ungalukku rooftop solar install seivathil ulla doubts');

    results.test3_caller_transcript_saved = {
      status: callerSegment?.text?.includes('சோலார்') ? 'PASS' : 'FAIL',
      callerText: callerSegment?.text,
      confidence: callerSegment?.confidence,
    };

    results.test2_speech_reached_llm = {
      status: agentSegment && !isRepeatedGreeting ? 'PASS' : 'FAIL',
      llmResponseText: agentSegment?.text,
      isRepeatedFallbackGreeting: isRepeatedGreeting,
    };

    results.test4_agent_response_generated = {
      status: agentSegment?.text ? 'PASS' : 'FAIL',
      text: agentSegment?.text,
    };

    // -------------------------------------------------------------------------
    // TEST 5: Gnani TTS audio generation & playability
    // -------------------------------------------------------------------------
    console.log('\n--- Checking Gnani TTS Audio Playability ---');
    if (audioId) {
      const audioRes = await fetch(`${BASE_URL}/api/telephony/audio/${audioId}`);
      const audioBuffer = await audioRes.arrayBuffer();
      const audioType = audioRes.headers.get('content-type');
      console.log(`Audio ID: ${audioId}, Status: ${audioRes.status}, Content-Type: ${audioType}, Bytes: ${audioBuffer.byteLength}`);

      results.test5_playable_audio_generated = {
        status: audioRes.status === 200 && audioBuffer.byteLength > 5000 ? 'PASS' : 'FAIL',
        audioId,
        bytes: audioBuffer.byteLength,
        contentType: audioType,
      };
    } else {
      results.test5_playable_audio_generated = { status: 'FAIL', reason: 'No audio ID found in XML' };
    }

    // -------------------------------------------------------------------------
    // TEST 8: Empty SpeechResult triggers polite retry (not instant hangup)
    // -------------------------------------------------------------------------
    console.log('\n--- Turn 2: Empty SpeechResult (Caller Silence) ---');
    const emptyPayload = new URLSearchParams({
      SpeechResult: '',
      CallSid: 'CAtestmultiturntwilio0000000001',
      From: testPhone,
    });

    const emptyRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&language=ta-IN&emptyTurns=0`, {
      method: 'POST',
      headers: {
        'User-Agent': 'TwilioProxy/1.1',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: emptyPayload.toString(),
    });

    const emptyXml = await emptyRes.text();
    console.log(`Empty Speech TwiML:\n${emptyXml.slice(0, 300)}...`);

    const hasRetryGather = emptyXml.includes('<Gather') && emptyXml.includes('emptyTurns=1');
    results.test8_empty_speech_retry = {
      status: hasRetryGather ? 'PASS' : 'FAIL',
      includesRetryGather: hasRetryGather,
      actionHasEmptyTurnsIncrement: emptyXml.includes('emptyTurns=1'),
    };

    // -------------------------------------------------------------------------
    // TEST 9: Invalid session ID handled safely without 500 crash
    // -------------------------------------------------------------------------
    console.log('\n--- Turn 3: Unknown / Invalid Session ID Handling ---');
    const invalidPayload = new URLSearchParams({
      SpeechResult: 'ஹலோ',
      CallSid: 'CAunknownsession9999999999999999',
    });

    const invalidRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=unknown-uuid-999&language=ta-IN`, {
      method: 'POST',
      headers: {
        'User-Agent': 'TwilioProxy/1.1',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: invalidPayload.toString(),
    });

    results.test9_invalid_session_handled_safely = {
      status: invalidRes.status === 200 ? 'PASS' : 'FAIL',
      httpStatus: invalidRes.status,
    };
    console.log(`Invalid Session Status: ${invalidRes.status}`);

    // -------------------------------------------------------------------------
    // TEST 10: Multiple turns preserve conversation history
    // -------------------------------------------------------------------------
    console.log('\n--- Turn 4: Follow-up question preserving conversation context ---');
    const turn4Payload = new URLSearchParams({
      SpeechResult: '3kW பேக்கேஜ் விலை மற்றும் மானியம் எவ்வளவு கிடைக்கும்?',
      Confidence: '0.92',
      CallSid: 'CAtestmultiturntwilio0000000001',
      From: testPhone,
    });

    const turn4Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${testSessionId}&language=ta-IN`, {
      method: 'POST',
      headers: {
        'User-Agent': 'TwilioProxy/1.1',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: turn4Payload.toString(),
    });

    const { data: allSegments } = await supabase
      .from('transcript_segments')
      .select('speaker, text')
      .eq('call_session_id', testSessionId)
      .order('created_at', { ascending: true });

    console.log(`Total turns recorded in DB: ${allSegments?.length}`);
    allSegments?.forEach((s, idx) => console.log(` [${idx + 1}] ${s.speaker}: ${s.text}`));

    const hasMultiTurns = allSegments && allSegments.length >= 4;
    const latestAgentTurn = allSegments?.[allSegments.length - 1];

    results.test10_multiturn_history_preserved = {
      status: hasMultiTurns && turn4Res.status === 200 ? 'PASS' : 'FAIL',
      totalRecordedSegments: allSegments?.length,
      latestAgentAnswer: latestAgentTurn?.text,
    };
  } finally {
    // Clean up test session and transcript segments
    console.log('\n--- Cleaning up automated test records ---');
    await supabase.from('transcript_segments').delete().eq('call_session_id', testSessionId);
    await supabase.from('call_events').delete().eq('call_session_id', testSessionId);
    await supabase.from('call_sessions').delete().eq('id', testSessionId);
    console.log(`Test session ${testSessionId} cleaned up.\n`);
  }

  console.log('================================================================');
  console.log('PHASE 4 TEST SUMMARY:');
  console.log('================================================================');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('scripts/multiturn_test_results.json', JSON.stringify(results, null, 2));
}

runMultiturnTests();

