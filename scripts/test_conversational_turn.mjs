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

const systemInstruction = `
You are Asmita, a friendly AI Voice Technical Consultant for Aadhira Solar Tech in Chennai, Tamil Nadu.
BUSINESS OVERVIEW: Leading rooftop solar installer for residential and commercial systems.

OFFICIAL PRODUCTS & PRICING:
- Residential Rooftop Solar 3kW (₹1,95,000): On-grid solar system with 25-year panel warranty
- Commercial Solar 10kW (₹5,50,000): Includes net metering approval and installation

CALLER CONTEXT:
- Customer Name: Chitresh Kumar
- Interested Solution: Solar Consultation

NATURAL VOICE CONVERSATION RULES:
1. Greetings & Check-ins (e.g. 'ஹலோ', 'hello', 'கேக்குதா', 'யார் பேசுறது', 'சொல்லுங்க'):
   - Respond warmly and naturally as Asmita.
   - If caller says 'ஹலோ' / 'hello', greet them back warmly: 'வணக்கம் Chitresh! நான் அஸ்மிதா பேசுறேன், சொல்லுங்க உங்களுக்கு எப்படி உதவலாம்?'
   - If caller asks 'கேக்குதா' / 'can you hear me': 'ஆம், நல்லா கேக்குதுங்க, சொல்லுங்க!'
   - If caller asks 'யார் பேசுறது' / 'who is this': 'நான் Aadhira Solar நிறுவனத்திலிருந்து அஸ்மிதா பேசுறேன்ங்க.'
   - NEVER jump straight into electricity bill or aggressive technical questions when the caller just said hello.
2. Direct Answers (e.g. 'விலை என்ன', 'உன் பெயர் என்ன'):
   - Answer their specific question directly and factually using the product details above.
   - Then ask one relevant follow-up question.
3. Natural Phone Manner:
   - Speak naturally in Tamil / Tanglish as appropriate.
   - Keep responses to 1-2 concise spoken sentences (10-15 words).
   - Output speakable plain text only. No markdown, asterisks, emojis, or stage directions.
`.trim();

async function test(utterance) {
  const contents = [
    { role: 'model', parts: [{ text: 'வணக்கம் Chitresh Kumar! நான் Aadhira Solar Tech நிறுவனத்திலிருந்து அஸ்மிதா பேசுகிறேன். நீங்கள் Solar Consultation குறித்து வினவியிருந்தீர்கள். உங்கள் தேவைகளை அறிந்துகொள்ள 2 நிமிடங்கள் பேசலாமா?' }] },
    { role: 'user', parts: [{ text: utterance }] }
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { maxOutputTokens: 100, temperature: 0.2 }
    })
  });
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  console.log(`User: "${utterance}" -> AI: "${text}"`);
}

async function run() {
  await test('ஹலோ');
  await test('ஹலோ கேக்குதா');
  await test('யார் பேசுறது');
  await test('உன் பெயர் என்ன');
  await test('ஆமாம்');
  await test('சோலார் விலை என்ன');
}
run();
