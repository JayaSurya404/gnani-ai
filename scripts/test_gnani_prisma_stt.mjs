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
console.log("Gnani API Key present? Length:", apiKey ? apiKey.length : 0);

// Helper to synthesize audio via Gnani TTS to get real speech audio
async function synthesizeTamil() {
  const timbreWsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(timbreWsUrl, {
      headers: { "x-api-key-id": apiKey },
    });
    const chunks = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        text: "வணக்கம், நான் ஆதிரா சோலார் பேனல் பற்றி தெரிந்து கொள்ள வேண்டும்.",
        voice: "Asmita",
        model: "timbre-v2.5",
        language: "ta-IN",
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

async function testPrismaSTT() {
  console.log("1. Synthesizing Tamil speech audio via Gnani Timbre...");
  const audioBuffer = await synthesizeTamil();
  console.log("Generated audio bytes:", audioBuffer.length);

  console.log("\n2. Sending audio to Gnani Prisma v3.0 REST endpoint (https://api.vachana.ai/stt/v3)...");
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("audio_file", blob, "test.wav");
  formData.append("model", "prisma-v3.0");
  formData.append("language_code", "indic-auto");

  const res = await fetch("https://api.vachana.ai/stt/v3", {
    method: "POST",
    headers: {
      "X-API-Key-ID": apiKey,
    },
    body: formData,
  });

  console.log("Prisma STT HTTP Status:", res.status);
  const data = await res.json();
  console.log("Prisma STT Response:", JSON.stringify(data, null, 2));
}

testPrismaSTT().catch((err) => {
  console.error("Test failed:", err);
});

