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
  console.log("=== TESTING LIVE TURN ROUTE WITH USER UTTERANCE ===");
  const start = Date.now();
  const formData = new URLSearchParams();
  formData.append("CallSid", "CA_test_session_28c59707_fix");
  formData.append("SpeechResult", "நீ சரி ஹலோ கேக்குதா உன் பேர் என்ன");
  formData.append("Confidence", "0.82");

  const turnRes = await fetch("http://localhost:3000/api/telephony/turn?sessionId=sess_turn_speed_test&language=ta-IN&turnSeq=1", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString()
  });

  const duration = Date.now() - start;
  console.log("Turn HTTP Status:", turnRes.status, "in", duration, "ms");
  const xml = await turnRes.text();
  console.log("Generated TwiML:\n", xml);

  if (turnRes.status !== 200) {
    throw new Error(`Turn returned status ${turnRes.status}`);
  }

  const hasPlay = xml.includes("<Play>");
  const hasSay = xml.includes("<Say");
  console.log("Has <Play>:", hasPlay, "| Has <Say>:", hasSay);
  console.log("Total Response Time:", duration, "ms");

  if (duration < 6500) {
    console.log("✓ PASS: Turn completed within 6.5s carrier safety limit!");
  } else {
    console.warn("Notice: Turn took", duration, "ms");
  }
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
