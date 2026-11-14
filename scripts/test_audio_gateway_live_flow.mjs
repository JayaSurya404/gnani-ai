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

async function main() {
  console.log("=== 1. INITIATING LIVE TURN REQUEST VIA DEV SERVER ===");
  const start = Date.now();
  const formData = new URLSearchParams();
  formData.append("CallSid", "CA_test_gateway_flow_verification");
  formData.append("SpeechResult", "வணக்கம் உங்க பேர் என்ன");
  formData.append("Confidence", "0.90");

  const turnRes = await fetch("http://localhost:3000/api/telephony/turn?sessionId=sess_gateway_flow_test&language=ta-IN&turnSeq=1", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString()
  });

  const duration = Date.now() - start;
  console.log("Turn HTTP Status:", turnRes.status, "in", duration, "ms");
  const xml = await turnRes.text();
  console.log("Generated TwiML:\n", xml);

  if (turnRes.status !== 200) {
    throw new Error(`Turn failed with status ${turnRes.status}`);
  }

  // 2. Verify URL in <Play>
  const playMatch = xml.match(/<Play>([^<]+)<\/Play>/);
  if (!playMatch) {
    throw new Error(`No <Play> tag found in TwiML!\nTwiML:\n${xml}`);
  }
  const audioUrl = playMatch[1];
  console.log("\nExtracted Audio URL:", audioUrl);

  const isLocalGateway = audioUrl.includes("/api/telephony/audio/");
  const isDirectSupabase = audioUrl.includes(".supabase.co/storage/");
  console.log("Is Local Gateway URL:", isLocalGateway, "| Is Direct Supabase URL:", isDirectSupabase);

  if (!isLocalGateway) {
    throw new Error(`Audio URL is NOT pointing to local audio gateway! URL: ${audioUrl}`);
  }

  // 3. Fetch that exact audio URL through ngrok with Twilio user-agent
  console.log("\n=== 2. FETCHING AUDIO FROM NGROK USING TWILIO USER-AGENT ===");
  const audioStart = Date.now();
  const audioRes = await fetch(audioUrl, {
    headers: {
      "User-Agent": "TwilioProxy/1.1",
      "Accept": "*/*"
    }
  });

  const audioFetchDuration = Date.now() - audioStart;
  console.log("Audio HTTP Status:", audioRes.status, "in", audioFetchDuration, "ms");
  console.log("Audio Content-Type:", audioRes.headers.get("content-type"));
  console.log("Audio Content-Length:", audioRes.headers.get("content-length"));
  console.log("Audio Accept-Ranges:", audioRes.headers.get("accept-ranges"));

  if (audioRes.status !== 200) {
    throw new Error(`Audio fetch failed with status ${audioRes.status}`);
  }

  if (!audioRes.headers.get("content-type")?.includes("audio/wav")) {
    throw new Error(`Audio Content-Type is not audio/wav: ${audioRes.headers.get("content-type")}`);
  }

  // 4. Validate WAV structure and playback compatibility
  console.log("\n=== 3. VALIDATING WAV PAYLOAD AND PLAYBACK COMPATIBILITY ===");
  const arrayBuf = await audioRes.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  console.log("Received Buffer Size:", buf.length, "bytes");

  if (buf.length < 1000) {
    throw new Error(`Buffer too small: ${buf.length}`);
  }

  const riff = buf.subarray(0, 4).toString();
  const wave = buf.subarray(8, 12).toString();
  const formatTag = buf.readUInt16LE(20);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataSize = buf.readUInt32LE(40);

  console.log("RIFF Header:", riff, "(expected RIFF)");
  console.log("WAVE Header:", wave, "(expected WAVE)");
  console.log("Audio Format Tag:", formatTag, "(expected 1 for linear PCM)");
  console.log("Channels:", channels, "(expected 1 for mono)");
  console.log("Sample Rate:", sampleRate, "Hz (expected 16000)");
  console.log("Bits Per Sample:", bitsPerSample, "(expected 16)");
  console.log("Audio Data Chunk Size:", dataSize, "bytes");

  if (riff !== "RIFF" || wave !== "WAVE" || formatTag !== 1) {
    throw new Error("Invalid WAV header!");
  }

  const durationSec = dataSize / (sampleRate * channels * (bitsPerSample / 8));
  console.log("Playable Audio Duration:", durationSec.toFixed(2), "seconds");

  // 5. Test subsequent retrieval to verify cache persistence (not pruned prematurely)
  console.log("\n=== 4. TESTING PERSISTENCE ACROSS SUBSEQUENT RETRIEVALS ===");
  const repeatRes = await fetch(audioUrl, {
    headers: { "User-Agent": "TwilioProxy/1.1" }
  });
  console.log("Subsequent Fetch Status:", repeatRes.status, "Content-Length:", repeatRes.headers.get("content-length"));
  if (repeatRes.status !== 200) {
    throw new Error(`Subsequent audio fetch failed with status ${repeatRes.status}`);
  }

  console.log("\n✓ ALL 5 VERIFICATION CHECKS PASSED SUCCESSFULLY!");
}

main().catch(err => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
