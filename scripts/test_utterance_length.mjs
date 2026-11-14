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

const key = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;

const prompt = `
You are Asmita, an AI Voice Technical Consultant for Aadhira Solar Tech in Chennai.
TELEPHONY CONVERSATION RULES:
1. Speak naturally in Tamil.
2. STRICT LENGTH: Output EXACTLY ONE short spoken sentence (maximum 8 to 12 words).
3. If caller asks if you can hear or asks your name (e.g. 'கேக்குதா', 'உன் பேர் என்ன'):
   Reassure them and state your name concisely: 'ஆம், நல்லா கேக்குதுங்க! நான் அஸ்மிதா, சொல்லுங்க உங்களுக்கு எப்படி உதவலாம்?'
4. Speakable plain text only. No markdown.
`.trim();

const contents = [
  { role: "model", parts: [{ text: "வணக்கம் Chitresh Kumar! நான் Aadhira Solar Tech நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?" }] },
  { role: "user", parts: [{ text: "நீ சரி ஹலோ கேக்குதா உன் பேர் என்ன" }] }
];

async function main() {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents,
      generationConfig: { maxOutputTokens: 60, temperature: 0.2 }
    })
  });
  const j = await res.json();
  const t = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  console.log("AI Output:", t);
  console.log("Word count:", t?.split(/\s+/).length, "| Char count:", t?.length);
}

main();
