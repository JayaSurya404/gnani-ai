import WebSocket from "ws";
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

const apiKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
const wsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";

async function testTimbreV3(text, voice = "Shivani", lang = "hi-IN", model = "timbre-v3.0") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { "x-api-key-id": apiKey },
    });
    const chunks = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        text,
        voice,
        model,
        language: lang,
        speed: 1.0,
        audio_config: {
          sample_rate: 16000,
          num_channels: 1,
          sample_width: 2,
          encoding: "linear_pcm",
          container: "wav"
        }
      }));
    });
    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.data?.audio) chunks.push(Buffer.from(parsed.data.audio, "base64"));
        if (parsed.type === "complete" && !parsed.data) {
          ws.close();
          resolve(Buffer.concat(chunks));
        }
      } catch {}
    });
    ws.on("error", reject);
    setTimeout(() => {
      ws.terminate();
      if (chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new Error("Timeout synthesizing " + lang));
    }, 8000);
  });
}

async function run() {
  console.log("=== TESTING GNANI TIMBRE v3.0 (SHIVANI) ===");
  
  // Hindi
  console.log("\n[1] Synthesizing Hindi with Shivani (timbre-v3.0)...");
  try {
    const hiBuf = await testTimbreV3("नमस्ते, वॉइसनेक्सस एआई में आपका स्वागत है।", "Shivani", "hi-IN");
    console.log("✓ Hindi synthesis success! Bytes:", hiBuf.length);
  } catch (e) {
    console.error("✗ Hindi failed:", e.message);
  }

  // Tamil
  console.log("\n[2] Synthesizing Tamil with Shivani (timbre-v3.0)...");
  try {
    const taBuf = await testTimbreV3("வணக்கம், வாய்ஸ்நெக்ஸஸ் ஏஐ உங்களை வரவேற்கிறது.", "Shivani", "ta-IN");
    console.log("✓ Tamil synthesis success! Bytes:", taBuf.length);
  } catch (e) {
    console.error("✗ Tamil failed:", e.message);
  }

  // English
  console.log("\n[3] Synthesizing English with Shivani (timbre-v3.0)...");
  try {
    const enBuf = await testTimbreV3("Hello! Welcome to VoiceNexus AI.", "Shivani", "en-IN");
    console.log("✓ English synthesis success! Bytes:", enBuf.length);
  } catch (e) {
    console.error("✗ English failed:", e.message);
  }

  // Telugu
  console.log("\n[4] Synthesizing Telugu with Shivani (timbre-v3.0)...");
  try {
    const teBuf = await testTimbreV3("నమస్కారం, వాయిస్ నెక్సస్ AI కి స్వాగతం.", "Shivani", "te-IN");
    console.log("✓ Telugu synthesis success! Bytes:", teBuf.length);
  } catch (e) {
    console.error("✗ Telugu failed:", e.message);
  }

  // Kannada
  console.log("\n[5] Synthesizing Kannada with Shivani (timbre-v3.0)...");
  try {
    const knBuf = await testTimbreV3("ನಮಸ್ಕಾರ, ವಾಯ್ಸ್ ನೆಕ್ಸಸ್ AI ಗೆ ಸುಸ್ವಾಗತ.", "Shivani", "kn-IN");
    console.log("✓ Kannada synthesis success! Bytes:", knBuf.length);
  } catch (e) {
    console.error("✗ Kannada failed:", e.message);
  }

  // Malayalam
  console.log("\n[6] Synthesizing Malayalam with Shivani (timbre-v3.0)...");
  try {
    const mlBuf = await testTimbreV3("നമസ്കാരം, വോയ്‌സ് നെക്സസ് AI-ലേക്ക് സ്വാഗതം.", "Shivani", "ml-IN");
    console.log("✓ Malayalam synthesis success! Bytes:", mlBuf.length);
  } catch (e) {
    console.error("✗ Malayalam failed:", e.message);
  }
}

run();

