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

const gnaniKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

console.log("=== LIVE MULTILINGUAL REAL-PROVIDER INTEGRATION VERIFICATION ===");
console.log("Gnani Key present:", !!gnaniKey, "| Gemini Key present:", !!geminiKey);

// 1. Helper to synthesize caller speech via Gnani Timbre to produce real WAV audio
async function synthesizeCallerSpeech(text, lang) {
  const timbreWsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(timbreWsUrl, {
      headers: { "x-api-key-id": gnaniKey },
    });
    const chunks = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        text,
        voice: "Shivani",
        model: "timbre-v3.0",
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

// 2. Helper to test Prisma v3.0 STT
async function testPrismaSTT(audioBuffer) {
  const { transcribeWithGnaniPrisma } = await import("../src/lib/telephony/gnani-prisma-stt.ts");
  return transcribeWithGnaniPrisma(audioBuffer, { languageCode: "indic-auto" });
}

// 3. Helper to test LLM
async function testLLM(userUtterance, lang) {
  const { generateLLMVoiceTurn } = await import("../src/lib/telephony/llm-voice-turn.ts");
  return generateLLMVoiceTurn({
    userUtterance,
    conversationHistory: [],
    customerName: "Karthik Subramanian",
    language: lang,
    tenantContext: {
      businessName: "Aadhira Solar Tech",
      businessCity: "Chennai",
      businessState: "Tamil Nadu",
      products: [
        { name: "5kW Hybrid Rooftop Solar System", price: "₹2,75,000", description: "Eligible for PM Surya Ghar subsidy" }
      ]
    }
  });
}

// 4. Helper to test AI Response TTS using Gnani Timbre v3.0 WebSocket
async function testAITTS(text, lang) {
  const timbreWsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(timbreWsUrl, {
      headers: { "x-api-key-id": gnaniKey },
    });
    const chunks = [];
    ws.on("open", () => {
      ws.send(JSON.stringify({
        text: text.trim(),
        voice: "Shivani",
        model: "timbre-v3.0",
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
          const buf = Buffer.concat(chunks);
          resolve(`aud_${buf.length}_bytes`);
        }
      } catch {}
    });
    ws.on("error", reject);
    setTimeout(() => {
      ws.terminate();
      if (chunks.length > 0) resolve(`aud_${Buffer.concat(chunks).length}_bytes`);
      else reject(new Error("AI TTS timeout"));
    }, 8000);
  });
}

async function runTurn(langCode, sampleCallerSpokenText) {
  console.log(`\n----------------------------------------`);
  console.log(`RUNNING FULL MULTILINGUAL TURN [${langCode}]`);
  console.log(`Caller Spoken Utterance: "${sampleCallerSpokenText}"`);

  // Step A: Real audio generation representing caller's voice
  const t0 = Date.now();
  const callerAudio = await synthesizeCallerSpeech(sampleCallerSpokenText, langCode);
  console.log(`1. Caller Audio Generated: ${callerAudio.length} bytes WAV (${Date.now() - t0}ms)`);

  // Step B: Gnani Prisma v3.0 STT
  const t1 = Date.now();
  const sttResult = await testPrismaSTT(callerAudio);
  console.log(`2. Gnani Prisma v3.0 STT Result (${Date.now() - t1}ms):`);
  console.log(`   - Transcript: "${sttResult.transcript}"`);
  console.log(`   - Detected Lang: ${sttResult.detectedLanguageCode}`);
  console.log(`   - Model: ${sttResult.model}`);

  if (!sttResult.success || !sttResult.transcript) {
    throw new Error(`Prisma STT failed: ${sttResult.error}`);
  }

  // Step C: Grounded LLM Response
  const t2 = Date.now();
  const llmResult = await testLLM(sttResult.transcript, sttResult.detectedLanguageCode);
  console.log(`3. Gemini LLM Turn Result (${Date.now() - t2}ms):`);
  console.log(`   - Response: "${llmResult.text}"`);
  console.log(`   - Model: ${llmResult.model}`);
  console.log(`   - Detected Lang: ${llmResult.detectedLanguageCode}`);

  if (!llmResult.text) {
    throw new Error("LLM returned empty text");
  }

  // Step D: Gnani Timbre v3.0 TTS Spoken Response
  const t3 = Date.now();
  const audioId = await testAITTS(llmResult.text, llmResult.detectedLanguageCode || langCode);
  console.log(`4. Gnani Timbre v3.0 TTS Result (${Date.now() - t3}ms):`);
  console.log(`   - Audio ID: ${audioId}`);

  if (!audioId) {
    throw new Error("Gnani Timbre TTS failed to return audio ID");
  }

  console.log(`✓ COMPLETE TURN SUCCESSFUL [${langCode}] in ${Date.now() - t0}ms total`);
}

async function run() {
  try {
    await runTurn("ta-IN", "வணக்கம், சோலார் பேனல் விலை என்ன? சப்ஸிடி கிடைக்குமா?");
    await runTurn("hi-IN", "नमस्ते, सोलर पैनल की क्या कीमत है और क्या सब्सिडी मिलेगी?");
    await runTurn("en-IN", "Hello, how much does the 5kW rooftop solar cost and what is included?");
    console.log("\n========================================================");
    console.log("ALL REAL MULTILINGUAL INTEGRATION TURNS PASSED (100%)");
    console.log("========================================================");
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  }
}

run();
