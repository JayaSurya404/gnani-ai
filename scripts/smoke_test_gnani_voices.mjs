import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";

const apiKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
if (!apiKey) {
  console.error("Missing GNANI_API_KEY or GNANI_API_KEY_ID");
  process.exit(1);
}

const wsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";

const testCases = [
  // Tamil (ta-IN) on timbre-v2.5
  { lang: "ta-IN", voice: "Asmita", model: "timbre-v2.5", text: "வணக்கம்! நான் காவேரி சோலார் நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன்." },
  { lang: "ta-IN", voice: "Trisha", model: "timbre-v2.5", text: "வணக்கம் சார்! திரிஷா பேசுகிறேன். உங்கள் சோலார் தேவைகளை அறியலாமா?" },
  { lang: "ta-IN", voice: "Brinda", model: "timbre-v2.5", text: "வணக்கம், பிரிந்தா பேசுகிறேன். உங்கள் மின் கட்டணத்தைக் குறைக்க உதவவா?" },
  
  // English (en-IN) on timbre-v2.5
  { lang: "en-IN", voice: "Kaveri", model: "timbre-v2.5", text: "Hello! This is Kaveri from Kaveri Solar and Construction. How can I assist you today?" },
  { lang: "en-IN", voice: "Pranav", model: "timbre-v2.5", text: "Hello! Pranav here from technical advisory. I am following up on your solar inquiry." },
  { lang: "en-IN", voice: "Devika", model: "timbre-v2.5", text: "Good morning! This is Devika from customer support. May I discuss your solar setup?" },

  // Hindi (hi-IN) on timbre-v2.5
  { lang: "hi-IN", voice: "Nalini", model: "timbre-v2.5", text: "नमस्ते! मैं नलिनी बोल रही हूँ कावेरी सोलर से। क्या हम सोलर पर बात कर सकते हैं?" },
  { lang: "hi-IN", voice: "Deepak", model: "timbre-v2.5", text: "नमस्ते जी, दीपक बात कर रहा हूँ कावेरी सोलर से। आपकी क्या सहायता कर सकता हूँ?" },

  // Telugu (te-IN) on timbre-v2.5
  { lang: "te-IN", voice: "Chitra", model: "timbre-v2.5", text: "నమస్కారం! నేను కావేరి సోలార్ నుండి చిత్రా మాట్లాడుతున్నాను. మీ సోలార్ అవసరాలు తెలుసుకోవచ్చా?" },
  { lang: "te-IN", voice: "Suresh", model: "timbre-v2.5", text: "నమస్కారం సార్, సురేష్ మాట్లాడుతున్నాను. మీ వ్యవసాయ సోలార్ పంప్ గురించి మాట్లాడదామా?" },

  // Kannada (kn-IN) on timbre-v2.5
  { lang: "kn-IN", voice: "Ananya", model: "timbre-v2.5", text: "ನಮಸ್ಕಾರ! ನಾನು ಕಾವೇರಿ ಸೋಲಾರ್‌ನಿಂದ ಅನನ್ಯ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಸೋಲಾರ್ ಅಗತ್ಯಗಳನ್ನು ತಿಳಿಯಬಹುದೇ?" },

  // Malayalam (ml-IN) on timbre-v2.5
  { lang: "ml-IN", voice: "Arya", model: "timbre-v2.5", text: "നമസ്കാരം! ഞാൻ കാവേരി സോളാറിൽ നിന്ന് ആര്യ സംസാരിക്കുന്നു. നിങ്ങളുടെ സോളാർ ആവശ്യങ്ങളെക്കുറിച്ച് സംസാരിക്കാമോ?" },

  // Auto Code-Switching on timbre-v3.0
  { lang: "indic-auto", voice: "Shivani", model: "timbre-v3.0", text: "Hello and Vanakkam! I am Shivani from Kaveri Solar. I can assist you across Indian languages." },
  { lang: "indic-auto", voice: "Avinash", model: "timbre-v3.0", text: "Good day! Avinash here from Kaveri Solar technical solutions. How can we optimize your power costs?" },
];

function validateWavHeader(buf) {
  if (!buf || buf.length < 44) return { valid: false, reason: "Too small (< 44 bytes)" };
  const riff = buf.slice(0, 4).toString("ascii");
  const wave = buf.slice(8, 12).toString("ascii");
  const fmt = buf.slice(12, 16).toString("ascii");
  if (riff !== "RIFF" || wave !== "WAVE" || fmt !== "fmt ") {
    return { valid: false, reason: `Invalid header chunks: riff=${riff}, wave=${wave}, fmt=${fmt}` };
  }
  const format = buf.readUInt16LE(20);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataSize = buf.length - 44;
  return {
    valid: true,
    format,
    channels,
    sampleRate,
    bitsPerSample,
    dataSize,
  };
}

async function testVoice(tc) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let ws = null;
    let isDone = false;
    const chunks = [];

    const timeout = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      try { ws?.terminate(); } catch {}
      resolve({
        tc,
        success: false,
        error: "TIMEOUT_10S",
        durationMs: Date.now() - startTime,
      });
    }, 10000);

    try {
      ws = new WebSocket(wsUrl, {
        headers: { "x-api-key-id": apiKey },
      });

      ws.on("open", () => {
        const payload = {
          text: tc.text,
          voice: tc.voice,
          model: tc.model,
          language: tc.lang,
          speed: 1.0,
          audio_config: {
            sample_rate: 16000,
            num_channels: 1,
            sample_width: 2,
            encoding: "linear_pcm",
            container: "wav",
          },
        };
        ws.send(JSON.stringify(payload));
      });

      ws.on("message", (raw) => {
        if (isDone) return;
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.data && msg.data.audio) {
            chunks.push(Buffer.from(msg.data.audio, "base64"));
          }
          if (msg.type === "complete") {
            isDone = true;
            clearTimeout(timeout);
            try { ws.close(); } catch {}

            const durationMs = Date.now() - startTime;
            if (chunks.length === 0) {
              resolve({ tc, success: false, error: "ZERO_CHUNKS", durationMs });
              return;
            }

            const buf = Buffer.concat(chunks);
            const wavCheck = validateWavHeader(buf);

            // Save sample to disk for audit
            const outDir = path.join("public", "samples", "voices");
            fs.mkdirSync(outDir, { recursive: true });
            const outPath = path.join(outDir, `${tc.lang}_${tc.voice}_${tc.model}.wav`);
            fs.writeFileSync(outPath, buf);

            resolve({
              tc,
              success: wavCheck.valid,
              bytes: buf.length,
              wavDetails: wavCheck,
              durationMs,
              savedTo: outPath,
              error: wavCheck.valid ? null : wavCheck.reason,
            });
          } else if (msg.type === "error" || msg.status === "error") {
            isDone = true;
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolve({
              tc,
              success: false,
              error: msg.message || JSON.stringify(msg),
              durationMs: Date.now() - startTime,
            });
          }
        } catch {
          // ignore
        }
      });

      ws.on("error", (err) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeout);
        resolve({
          tc,
          success: false,
          error: `WS_ERROR: ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });

      ws.on("close", (code, reason) => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeout);
        resolve({
          tc,
          success: false,
          error: `WS_CLOSED: ${code} ${reason?.toString() || ""}`,
          durationMs: Date.now() - startTime,
        });
      });
    } catch (err) {
      if (isDone) return;
      isDone = true;
      clearTimeout(timeout);
      resolve({
        tc,
        success: false,
        error: `EXCEPTION: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    }
  });
}

async function run() {
  console.log("=================================================");
  console.log("GNANI TIMBRE PROVIDER VOICE SMOKE TESTS");
  console.log(`Endpoint: ${wsUrl}`);
  console.log(`Test Count: ${testCases.length}`);
  console.log("=================================================\n");

  const results = [];
  for (const tc of testCases) {
    process.stdout.write(`Testing ${tc.lang} | ${tc.voice} (${tc.model})... `);
    const res = await testVoice(tc);
    results.push(res);
    if (res.success) {
      console.log(`[PASS] ${res.bytes} bytes, ${res.durationMs}ms, sampleRate=${res.wavDetails.sampleRate}Hz`);
    } else {
      console.log(`[FAIL] ${res.error} (${res.durationMs}ms)`);
    }
  }

  console.log("\n=================================================");
  console.log("SUMMARY REPORT");
  console.log("=================================================");
  const passed = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  console.log(`Passed: ${passed.length} / ${results.length}`);
  console.log(`Failed: ${failed.length} / ${results.length}`);

  if (failed.length > 0) {
    console.log("\nFailed voices:");
    failed.forEach((f) => {
      console.log(`  - ${f.tc.lang} / ${f.tc.voice} (${f.tc.model}): ${f.error}`);
    });
  }
}

run();
