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

const geminiKey = process.env.GEMINI_API_KEY;
console.log("Gemini API Key present? Length:", geminiKey ? geminiKey.length : 0);

async function testGeminiTurn(utterance, language) {
  const systemPrompt = `You are Shivani, an AI Voice Technical Consultant for Aadhira Solar Technologies.
OFFICIAL PRODUCTS:
- 3kW Residential Solar Package (₹1,95,000 Before Subsidy, ₹78,000 PM Surya Ghar Subsidy)
- 5kW Commercial Rooftop System (₹3,20,000)

RULES:
1. Speak in natural conversational ${language}. Keep response strictly to 1 or 2 short spoken sentences (max 30 words).
2. Answer the caller's specific question using the product catalog and ask one relevant qualification question.
3. No markdown, asterisks, bullet points or formatting.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: utterance }] }],
      generationConfig: { maxOutputTokens: 120, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } }
    })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function run() {
  const tests = [
    { lang: "Tamil", text: "வணக்கம், 3kW சோலார் பேனல் விலை என்ன மற்றும் மானியம் கிடைக்குமா?" },
    { lang: "Hindi", text: "नमस्ते, 3kW सोलर पैनल की कीमत क्या है और सब्सिडी कितनी मिलेगी?" },
    { lang: "Telugu", text: "నమస్కారం, 3kW సోలార్ ప్యానెల్ ధర ఎంత మరియు సబ్సిడీ వస్తుందా?" },
    { lang: "English", text: "Hello, what is the price and subsidy for a 3kW residential rooftop system?" },
  ];

  for (const t of tests) {
    try {
      console.log(`\nTesting ${t.lang}...`);
      const ans = await testGeminiTurn(t.text, t.lang);
      console.log(`[${t.lang} Answer]:`, ans);
    } catch (e) {
      console.error(`[${t.lang} Failed]:`, e.message);
    }
  }
}

run();

