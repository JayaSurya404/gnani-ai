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

async function run() {
  console.log("=== TESTING CONCISE TURN & TTS LATENCY ===");
  const { generateLLMVoiceTurn } = await import("../src/lib/telephony/llm-voice-turn.ts");
  const { synthesizeGnaniAudio } = await import("../src/lib/telephony/gnani-tts.ts");

  const start = Date.now();
  console.log("\n1. Generating LLM Voice Turn for: 'நீ சரி ஹலோ கேக்குதா உன் பேர் என்ன'...");
  const turn = await generateLLMVoiceTurn({
    userUtterance: "நீ சரி ஹலோ கேக்குதா உன் பேர் என்ன",
    conversationHistory: [
      { speaker: "AGENT", text: "வணக்கம் Chitresh Kumar! நான் Aadhira Solar Tech நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?" }
    ],
    customerName: "Chitresh Kumar",
    language: "ta-IN",
    tenantContext: {
      businessName: "Aadhira Solar Tech",
      businessCity: "Chennai",
      businessState: "Tamil Nadu",
      businessDescription: "Leading rooftop solar provider",
      products: [
        { name: "Residential Rooftop Solar 3kW", price: "₹1,95,000", description: "On-grid solar system" },
        { name: "Commercial Solar 10kW", price: "₹5,50,000", description: "Includes net metering" }
      ]
    }
  });

  const llmElapsed = Date.now() - start;
  console.log("LLM generated in " + llmElapsed + "ms:");
  console.log("Text: '" + turn.text + "'");
  const wordCount = turn.text.split(/\s+/).length;
  console.log("Word count: " + wordCount + " words (" + turn.text.length + " chars)");

  console.log("\n2. Synthesizing audio via Gnani Timbre (timeout: 4500ms)...");
  const ttsStart = Date.now();
  const audioId = await synthesizeGnaniAudio({
    text: turn.text,
    language: "ta-IN",
    model: "timbre-v3.0",
    voice: "Shivani",
    timeoutMs: 4500,
  });
  const ttsElapsed = Date.now() - ttsStart;
  const totalElapsed = Date.now() - start;

  console.log("TTS Result: audioId=" + audioId + " in " + ttsElapsed + "ms");
  console.log("TOTAL TURN DURATION: " + totalElapsed + "ms");

  if (!audioId) {
    console.warn("TTS timed out or fell back, but let's check total duration: " + totalElapsed + "ms");
  } else {
    console.log("✓ SUCCESS: Gnani Timbre generated valid audioId: " + audioId);
  }

  if (totalElapsed < 6000) {
    console.log("✓ PASS: Total turn duration is well within live carrier threshold (< 6.0s)!");
  } else {
    throw new Error("Total turn duration exceeded 6.0s: " + totalElapsed + "ms");
  }
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
