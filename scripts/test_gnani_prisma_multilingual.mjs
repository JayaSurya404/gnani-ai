import fs from "fs";
import WebSocket from "ws";

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

async function synthesizeText(text, voice, lang) {
  const timbreWsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(timbreWsUrl, {
      headers: { "x-api-key-id": apiKey },
    });
    const chunks = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        text,
        voice,
        model: "timbre-v2.5",
        language: lang,
        audio_config: { sample_rate: 16000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" }
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
      else reject(new Error("TTS timeout"));
    }, 8000);
  });
}

async function transcribePrisma(audioBuffer) {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("audio_file", blob, "test.wav");
  formData.append("model", "prisma-v3.0");
  formData.append("language_code", "indic-auto");

  const res = await fetch("https://api.vachana.ai/stt/v3", {
    method: "POST",
    headers: { "X-API-Key-ID": apiKey },
    body: formData,
  });
  return await res.json();
}

async function run() {
  console.log("=== GNANI PRISMA v3.0 MULTILINGUAL STT TEST ===");

  // 1. English
  console.log("\n[1] Testing English Speech...");
  const enBuf = await synthesizeText("Hello, I am interested in rooftop solar installation for my house.", "Kaveri", "en-IN");
  const enStt = await transcribePrisma(enBuf);
  console.log("English STT result:", {
    transcript: enStt.transcript,
    detected_language: enStt.detected_language_code,
    latency: enStt.processing_time
  });

  // 2. Hindi
  console.log("\n[2] Testing Hindi Speech...");
  const hiBuf = await synthesizeText("नमस्ते, मुझे सोलर पैनल लगवाने की जानकारी चाहिए।", "Kavya", "hi-IN");
  const hiStt = await transcribePrisma(hiBuf);
  console.log("Hindi STT result:", {
    transcript: hiStt.transcript,
    detected_language: hiStt.detected_language_code,
    latency: hiStt.processing_time
  });
}

run().catch(console.error);

