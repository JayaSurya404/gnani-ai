import fs from 'fs';

function loadEnv() {
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const geminiKey = process.env.GEMINI_API_KEY;

async function testPrompt(userText) {
  const systemInstruction = `
You are Asmita, an AI Voice Technical Consultant for Aadhira Solar Tech in Chennai.
You are speaking on a live telephone call with customer Chitresh Kumar.
The customer has a 2-floor residential house in Chennai and wants solar installation.

KNOWLEDGE BASE:
- Packages: 3kW Residential Surya Package (₹1.95 Lakhs before subsidy), 10kW Commercial (₹5.4 Lakhs), 50kW Industrial (₹24.5 Lakhs).
- PM Surya Ghar Central Government Subsidy: Up to ₹78,000 direct subsidy for 3kW residential systems. Net investment after subsidy is approximately ₹1.2 Lakhs to ₹1.4 Lakhs.
- 25-year performance warranty on Tier-1 bifacial panels.
- Saves up to 85% on monthly EB bills.
- Offers free site inspection and roof shadow feasibility survey in Chennai.

SPOKEN CONVERSATION RULES:
1. Speak in natural conversational Tamil (or Tanglish if user speaks English/Tanglish).
2. Keep your response strictly to 1 or 2 spoken sentences (maximum 35 words).
3. Do NOT include markdown, asterisks, bullet points, or stage directions in parentheses like (with a smile).
4. Acknowledge what the customer said, answer directly, and ask one natural question (like their monthly EB bill or if they want an engineer to inspect the roof).
`.trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const t1 = Date.now();
  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = rawText.replace(/\([^)]*\)/g, '').replace(/[\*_#]/g, '').trim();
  console.log(`\nCaller: "${userText}"`);
  console.log(`Asmita (${t1 - t0}ms): "${clean}"`);
}

await testPrompt('சோலார் வீட்ல போடலாம்னு இருக்கேன், ரெண்டு ஃப்ளோர் வீடு');
await testPrompt('விலை மற்றும் மானியம் எவ்வளவு கிடைக்கும்?');
await testPrompt('சரி சனிக்கிழமை இன்ஸ்பெக்ஷன் வாங்க');

