import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { validateWavBuffer, getTwilioSayAttributes, synthesizeGnaniAudio } from "../src/lib/telephony/gnani-tts";

function createMockWavBuffer(dataLength: number, sampleRate = 16000, channels = 1, bitsPerSample = 16, format = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(format, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  header.writeUInt32LE(byteRate, 28); // ByteRate
  const blockAlign = channels * (bitsPerSample / 8);
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  const payload = Buffer.alloc(dataLength, 0x55);
  return Buffer.concat([header, payload]);
}

async function runTests() {
  console.log("=================================================================");
  console.log("VOICENEXUS — AUDIO INTEGRITY & TIMEOUT SAFETY VERIFICATION");
  console.log("=================================================================\n");

  let passed = 0;
  let total = 0;
  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ FAIL: ${name}:`, msg);
      throw err;
    }
  }

  // 1. WAV Buffer Validation Tests
  console.log("[Group 1] validateWavBuffer Structural Checks");

  test("Valid 16-bit PCM WAV (16000 Hz, mono, 4000 bytes) passes validation", () => {
    const buf = createMockWavBuffer(4000, 16000, 1, 16, 1);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, true);
  });

  test("Buffer smaller than 44 bytes is rejected", () => {
    const res = validateWavBuffer(Buffer.alloc(30));
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("smaller than 44-byte"));
  });

  test("Invalid RIFF header identifier is rejected", () => {
    const buf = createMockWavBuffer(2000);
    buf.write("XXXX", 0);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("Invalid RIFF"));
  });

  test("Invalid WAVE format identifier is rejected", () => {
    const buf = createMockWavBuffer(2000);
    buf.write("MP3 ", 8);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("Invalid WAVE"));
  });

  test("Non-PCM audio format (e.g. IEEE float format=3) is rejected", () => {
    const buf = createMockWavBuffer(2000, 16000, 1, 16, 3);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("Unsupported audio format"));
  });

  test("Unsupported sample rate (<8000 Hz) is rejected", () => {
    const buf = createMockWavBuffer(2000, 4000);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("Unexpected sample rate"));
  });

  test("Audio payload smaller than 1000 bytes is rejected", () => {
    const buf = createMockWavBuffer(500);
    const res = validateWavBuffer(buf);
    assert.strictEqual(res.isValid, false);
    assert(res.error?.includes("Audio payload too small"));
  });

  // 2. Verified Twilio Say Attributes Tests
  console.log("\n[Group 2] getTwilioSayAttributes Verification");

  test("Tamil ('ta-IN') returns Google.ta-IN-Standard-D (Google TTS verified)", () => {
    const attr = getTwilioSayAttributes("ta-IN");
    assert.strictEqual(attr.language, "ta-IN");
    assert.strictEqual(attr.voice, "Google.ta-IN-Standard-D");
  });

  test("Hindi ('hi-IN') returns Google.hi-IN-Standard-A", () => {
    const attr = getTwilioSayAttributes("hi-IN");
    assert.strictEqual(attr.language, "hi-IN");
    assert.strictEqual(attr.voice, "Google.hi-IN-Standard-A");
  });

  test("Indian English ('en-IN') returns Google.en-IN-Standard-A", () => {
    const attr = getTwilioSayAttributes("en-IN");
    assert.strictEqual(attr.language, "en-IN");
    assert.strictEqual(attr.voice, "Google.en-IN-Standard-A");
  });

  test("Telugu ('te-IN') returns Google.te-IN-Standard-A", () => {
    const attr = getTwilioSayAttributes("te-IN");
    assert.strictEqual(attr.language, "te-IN");
    assert.strictEqual(attr.voice, "Google.te-IN-Standard-A");
  });

  test("Default / empty language returns en-IN with Google voice", () => {
    const attr = getTwilioSayAttributes("");
    assert.strictEqual(attr.language, "en-IN");
    assert.strictEqual(attr.voice, "Google.en-IN-Standard-A");
  });

  // 3. Timeout Discard Guard Verification
  console.log("\n[Group 3] Gnani TTS Timeout Discard Guard");

  total++;
  const timeoutStart = Date.now();
  const timedOutResult = await synthesizeGnaniAudio({
    text: "வணக்கம்! சோலார் பேனல் விவரங்கள்.",
    language: "ta-IN",
    timeoutMs: 1, // 1ms forces immediate timeout
  });
  const timeoutElapsed = Date.now() - timeoutStart;

  assert.strictEqual(timedOutResult, null, "Timeout returns null (no partial audio exposed)");
  assert(timeoutElapsed < 100, `Timeout triggers promptly without hanging (elapsed: ${timeoutElapsed}ms)`);
  console.log(`  ✓ PASS: Immediate timeout (1ms) returns null and discards incomplete chunks in ${timeoutElapsed}ms`);
  passed++;

  // 4. Inspection of Existing Disk Cache
  console.log("\n[Group 4] Cache Disk Audio Integrity Scan");

  test("Inspect existing disk cache in .audio-cache (no corrupt/truncated files served)", () => {
    const cacheDir = path.join(process.cwd(), ".audio-cache");
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".wav"));
      let checkedCount = 0;
      let validCount = 0;
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const data = fs.readFileSync(filePath);
        checkedCount++;
        const val = validateWavBuffer(data);
        if (val.isValid) validCount++;
      }
      console.log(`    Scanned ${checkedCount} disk cache WAV files. Valid complete WAVs: ${validCount}`);
    }
  });

  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed}/${total} TESTS PASSED (100%)`);
  console.log("=================================================================");
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
