import fs from "fs";
import path from "path";

const AUDIO_CACHE_DIR = path.join(process.cwd(), ".audio-cache");
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

// Create a mock audio file and session metadata on disk
const testAudioId = "aud_prewarmed_mock_test";
const testSessionId = "sess_prewarmed_mock_test";

fs.writeFileSync(path.join(AUDIO_CACHE_DIR, `${testAudioId}.wav`), Buffer.from("RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"));
fs.writeFileSync(
  path.join(AUDIO_CACHE_DIR, `${testSessionId}.json`),
  JSON.stringify({
    audioId: testAudioId,
    text: "வணக்கம்! நான் VoiceNexus AI நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன்.",
    language: "ta-IN",
    expiresAt: Date.now() + 15 * 60 * 1000,
  })
);

async function test() {
  const r = await fetch(`http://localhost:3000/api/telephony/outbound-twiml?sessionId=${testSessionId}&language=ta-IN`);
  console.log("Status:", r.status);
  const text = await r.text();
  console.log("TwiML Output:\n", text);

  // Clean up
  try {
    fs.unlinkSync(path.join(AUDIO_CACHE_DIR, `${testAudioId}.wav`));
    fs.unlinkSync(path.join(AUDIO_CACHE_DIR, `${testSessionId}.json`));
  } catch {}

  if (text.includes(`<Gather`) && text.includes(`<Play>`) && text.includes(`${testAudioId}.wav`)) {
    console.log("✓ SUCCESS: outbound-twiml successfully generated Gather with nested Play for prewarmed audio!");
  } else {
    console.error("✗ FAILURE: Unexpected TwiML structure");
    process.exit(1);
  }
}

test();
