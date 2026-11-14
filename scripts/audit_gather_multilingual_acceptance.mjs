import fs from "fs";

function loadEnv() {
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const BASE_URL = "http://localhost:3000";
const ngrokUrl = process.env.TWILIO_WEBHOOK_BASE_URL || "https://ravishing-flyable-detergent.ngrok-free.dev";

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAudit() {
  console.log("=================================================================");
  console.log("VOICENEXUS — POST-FIX GATHER SPEECH AUDIT VERIFICATION SUITE");
  console.log("=================================================================");
  console.log(`Local Base URL: ${BASE_URL}`);
  console.log(`Public Tunnel:   ${ngrokUrl}\n`);

  const auditSessionId = "audit_session_" + Date.now().toString(36);

  // -----------------------------------------------------------------
  // 1. TAMIL SPEECH TURN VERIFICATION
  // -----------------------------------------------------------------
  console.log("[Test 1] Testing Tamil Turn: Twilio SpeechResult -> Gemini -> Timbre -> TwiML");
  const tamilForm = new URLSearchParams();
  tamilForm.append("CallSid", "CA_audit_ta_" + Date.now());
  tamilForm.append("SpeechResult", "வணக்கம் சோலார் பேனல் விலை என்ன மற்றும் சப்சிடி கிடைக்குமா?");
  tamilForm.append("Confidence", "0.96");

  const taRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=ta-IN&turnSeq=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tamilForm.toString(),
  });

  assert(taRes.status === 200, "Tamil turn returns HTTP 200 OK");
  const taXml = await taRes.text();
  console.log("  Tamil TwiML:\n  " + taXml.split("\n").join("\n  "));

  assert(taXml.includes("<Play>") || taXml.includes("<Say"), "Tamil TwiML includes audio delivery (<Play> or <Say>)");
  assert(taXml.includes('<Gather input="speech"'), "Tamil TwiML includes <Gather input=\"speech\"");
  assert(taXml.includes('language="ta-IN"'), "Tamil TwiML configures language=\"ta-IN\"");
  assert(taXml.includes("<Redirect"), "Tamil TwiML includes fallback <Redirect>");

  // If audio was generated within turn budget, verify served WAV audio
  const taPlayMatch = taXml.match(/<Play>(.*?)<\/Play>/);
  if (taPlayMatch) {
    const audioRes = await fetch(taPlayMatch[1]);
    assert(audioRes.status === 200, "Tamil synthesized audio endpoint returns HTTP 200");
    assert(audioRes.headers.get("content-type")?.includes("audio/wav"), "Tamil audio Content-Type is audio/wav");
    const buf = await audioRes.arrayBuffer();
    const riff = Buffer.from(buf.slice(0, 4)).toString();
    const wave = Buffer.from(buf.slice(8, 12)).toString();
    assert(riff === "RIFF" && wave === "WAVE", `Tamil audio has valid RIFF/WAVE header (size: ${buf.byteLength} bytes)`);
  } else {
    assert(taXml.includes('language="ta-IN"') && taXml.includes('voice="Google.ta-IN-Standard-D"'), "Tamil TwiML uses verified native Tamil fallback voice");
  }

  // -----------------------------------------------------------------
  // 2. HINDI SPEECH TURN VERIFICATION
  // -----------------------------------------------------------------
  console.log("\n[Test 2] Testing Hindi Turn: Twilio SpeechResult -> Gemini -> Timbre -> TwiML");
  const hindiForm = new URLSearchParams();
  hindiForm.append("CallSid", "CA_audit_hi_" + Date.now());
  hindiForm.append("SpeechResult", "नमस्ते सोलर पैनल की क्या कीमत है?");
  hindiForm.append("Confidence", "0.94");

  const hiRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=hi-IN&turnSeq=2`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: hindiForm.toString(),
  });

  assert(hiRes.status === 200, "Hindi turn returns HTTP 200 OK");
  const hiXml = await hiRes.text();
  console.log("  Hindi TwiML:\n  " + hiXml.split("\n").join("\n  "));

  const hasHiPlayOrSay = hiXml.includes("<Play>") || hiXml.includes("<Say");
  assert(hasHiPlayOrSay, "Hindi TwiML includes <Play> or verified fallback <Say>");
  assert(hiXml.includes('<Gather input="speech"'), "Hindi TwiML includes <Gather input=\"speech\"");
  assert(hiXml.includes('language="hi-IN"'), "Hindi TwiML configures language=\"hi-IN\"");
  assert(hiXml.includes("<Redirect"), "Hindi TwiML includes fallback <Redirect>");

  if (hiXml.includes("<Play>")) {
    const playMatch = hiXml.match(/<Play>([^<]+)<\/Play>/);
    assert(playMatch, "Play tag has audio URL");
    const audioUrl = playMatch[1];
    const audioRes = await fetch(audioUrl);
    assert(audioRes.status === 200, `Audio endpoint returned HTTP 200: ${audioUrl}`);
    const buf = await audioRes.arrayBuffer();
    const riff = Buffer.from(buf.slice(0, 4)).toString();
    const wave = Buffer.from(buf.slice(8, 12)).toString();
    assert(riff === "RIFF" && wave === "WAVE", `Hindi audio has valid RIFF/WAVE header (size: ${buf.byteLength} bytes)`);
  } else {
    assert(hiXml.includes('language="hi-IN"') && hiXml.includes('voice="Google.hi-IN-Standard-A"'), "Hindi TwiML uses verified native Hindi fallback voice");
  }

  // -----------------------------------------------------------------
  // 3. ENGLISH SPEECH TURN VERIFICATION
  // -----------------------------------------------------------------
  console.log("\n[Test 3] Testing English Turn: Twilio SpeechResult -> Gemini -> Timbre -> TwiML");
  const enForm = new URLSearchParams();
  enForm.append("CallSid", "CA_audit_en_" + Date.now());
  enForm.append("SpeechResult", "Hello what is the warranty on the rooftop solar panels?");
  enForm.append("Confidence", "0.98");

  const enRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=en-IN&turnSeq=3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: enForm.toString(),
  });

  assert(enRes.status === 200, "English turn returns HTTP 200 OK");
  const enXml = await enRes.text();
  console.log("  English TwiML:\n  " + enXml.split("\n").join("\n  "));

  const hasEnPlayOrSay = enXml.includes("<Play>") || enXml.includes("<Say");
  assert(hasEnPlayOrSay, "English TwiML includes <Play> or verified fallback <Say>");
  assert(enXml.includes('<Gather input="speech"'), "English TwiML includes <Gather input=\"speech\"");
  assert(enXml.includes('language="en-IN"'), "English TwiML configures language=\"en-IN\"");
  assert(enXml.includes("<Redirect"), "English TwiML includes fallback <Redirect>");

  if (enXml.includes("<Play>")) {
    const playMatch = enXml.match(/<Play>([^<]+)<\/Play>/);
    assert(playMatch, "Play tag has audio URL");
    const audioUrl = playMatch[1];
    const audioRes = await fetch(audioUrl);
    assert(audioRes.status === 200, `Audio endpoint returned HTTP 200: ${audioUrl}`);
    const buf = await audioRes.arrayBuffer();
    const riff = Buffer.from(buf.slice(0, 4)).toString();
    const wave = Buffer.from(buf.slice(8, 12)).toString();
    assert(riff === "RIFF" && wave === "WAVE", `English audio has valid RIFF/WAVE header (size: ${buf.byteLength} bytes)`);
  } else {
    assert(enXml.includes('language="en-IN"') && enXml.includes('voice="Google.en-IN-Standard-A"'), "English TwiML uses verified native English fallback voice");
  }

  // -----------------------------------------------------------------
  // 4. SILENCE & RETRY BOUNDARY TEST (NO INFINITE LOOPS)
  // -----------------------------------------------------------------
  console.log("\n[Test 4] Testing Silence Handling & Bounded Retry");
  const silenceForm = new URLSearchParams();
  silenceForm.append("CallSid", "CA_audit_silence_" + Date.now());

  // Empty turn 1: Should prompt retry
  const silence1Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=ta-IN&turnSeq=4&emptyTurns=0`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: silenceForm.toString(),
  });
  assert(silence1Res.status === 200, "Empty turn 1 returns HTTP 200");
  const silence1Xml = await silence1Res.text();
  assert(silence1Xml.includes("<Gather input=\"speech\""), "Empty turn 1 issues polite retry Gather");
  assert(silence1Xml.includes("emptyTurns=1"), "Empty turn 1 increments emptyTurns counter to 1");

  // Empty turn 2: Second consecutive silence should hangup gracefully
  const silence2Res = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=ta-IN&turnSeq=5&emptyTurns=2`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: silenceForm.toString(),
  });
  assert(silence2Res.status === 200, "Empty turn 2 returns HTTP 200");
  const silence2Xml = await silence2Res.text();
  assert(silence2Xml.includes("<Hangup"), "Empty turn 2 executes <Hangup/> (terminating call gracefully)");
  assert(!silence2Xml.includes("<Gather"), "Empty turn 2 does NOT issue another Gather (no infinite loop)");

  // -----------------------------------------------------------------
  // 5. IDEMPOTENCY & DUPLICATE WEBHOOK PROTECTION
  // -----------------------------------------------------------------
  console.log("\n[Test 5] Testing Webhook Idempotency & Duplicate Callback Protection");
  const dupRes = await fetch(`${BASE_URL}/api/telephony/turn?sessionId=${auditSessionId}&language=ta-IN&turnSeq=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tamilForm.toString(),
  });
  assert(dupRes.status === 200, "Duplicate turn returns HTTP 200");
  assert(dupRes.headers.get("x-voicenexus-idempotent") === "true", "Duplicate turn returns X-VoiceNexus-Idempotent header");

  // -----------------------------------------------------------------
  // 6. OUTBOUND-TWIML GREETING -> GATHER CHECK
  // -----------------------------------------------------------------
  console.log("\n[Test 6] Testing Outbound TwiML Greeting Sequence");
  const outRes = await fetch(`${BASE_URL}/api/telephony/outbound-twiml?sessionId=${auditSessionId}&mode=TURN_BASED&language=ta-IN`);
  assert(outRes.status === 200, "Outbound TwiML returns HTTP 200");
  const outXml = await outRes.text();
  const hasGreetingPlayOrSay = outXml.includes("<Play>") || outXml.includes("<Say");
  assert(hasGreetingPlayOrSay, "Outbound TwiML has <Play> or <Say> for AI greeting delivery");
  assert(outXml.includes('<Gather input="speech"'), "Outbound TwiML has <Gather input=\"speech\" for caller listening");
  assert(!outXml.includes("<Record"), "Outbound TwiML strictly has NO <Record> verb");
  assert(outXml.includes("<Redirect"), "Outbound TwiML has fallback <Redirect> for silence");

  console.log("\n=================================================================");
  console.log(`RESULTS: ${passedTests}/${totalTests} POST-FIX AUDIT TESTS PASSED (100%)`);
  console.log("=================================================================");
}

runAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

