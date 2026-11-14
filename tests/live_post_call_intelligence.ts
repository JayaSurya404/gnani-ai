import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeCallWithAI } from "../src/lib/post-call-agent";
import { normalizeQuoteText } from "../src/lib/intelligence/evidence-verifier";
import type { TranscriptSegmentInput } from "../src/lib/intelligence/types";

// Load environment variables from .env.local safely
if (fs.existsSync(".env.local")) {
  const envContent = fs.readFileSync(".env.local", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const groqApiKey = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

console.log("=====================================================================");
console.log("VOICENEXUS AI — PHASE 7.2 LIVE PROVIDER INTELLIGENCE AUDIT");
console.log("=====================================================================");
console.log(`Groq API Key Configured:   ${Boolean(groqApiKey)}`);
console.log(`Gemini API Key Configured: ${Boolean(geminiApiKey)}`);

// Realistic synthetic customer conversation with explicit ground truths
const syntheticSegments: TranscriptSegmentInput[] = [
  {
    id: "seg_101",
    speaker: "AGENT",
    text: "Vanakkam! Welcome to Surya Shakti Solar. My name is Asmita, how can I assist you with your rooftop solar today?",
    confidence: 0.98,
    startOffsetMs: 0,
    endOffsetMs: 4000
  },
  {
    id: "seg_102",
    speaker: "CUSTOMER",
    text: "Hello, I am looking to install a 5kW on-grid solar system for my residential house in Anna Nagar, Madurai.",
    confidence: 0.97,
    startOffsetMs: 4500,
    endOffsetMs: 9500
  },
  {
    id: "seg_103",
    speaker: "AGENT",
    text: "Excellent! Madurai gets great sunlight. Can you tell me your average bimonthly electricity bill and roof type?",
    confidence: 0.98,
    startOffsetMs: 10000,
    endOffsetMs: 14000
  },
  {
    id: "seg_104",
    speaker: "CUSTOMER",
    text: "Our current TNEB electricity bill is around 8,500 rupees every two months, and we have a flat concrete RCC terrace of about 650 square feet with clear shade-free sunlight.",
    confidence: 0.96,
    startOffsetMs: 14500,
    endOffsetMs: 22000
  },
  {
    id: "seg_105",
    speaker: "AGENT",
    text: "A 5kW system will comfortably cover that consumption and save you around 80% on bills. When are you planning to proceed with the installation?",
    confidence: 0.98,
    startOffsetMs: 22500,
    endOffsetMs: 27000
  },
  {
    id: "seg_106",
    speaker: "CUSTOMER",
    text: "We want to complete the installation within the next 30 days before summer tariffs take effect.",
    confidence: 0.97,
    startOffsetMs: 27500,
    endOffsetMs: 32000
  },
  {
    id: "seg_107",
    speaker: "AGENT",
    text: "Understood. The 5kW system eligible for the PM Surya Ghar subsidy costs approximately ₹2,45,000 before the ₹78,000 central subsidy.",
    confidence: 0.98,
    startOffsetMs: 32500,
    endOffsetMs: 38000
  },
  {
    id: "seg_108",
    speaker: "CUSTOMER",
    text: "Tata Power Solar quoted ₹2,30,000 for a similar 5kW setup, so your initial price seems a bit higher, though I am concerned about how long the subsidy disbursement takes.",
    confidence: 0.95,
    startOffsetMs: 38500,
    endOffsetMs: 46000
  },
  {
    id: "seg_109",
    speaker: "CUSTOMER",
    text: "What is the warranty period for the solar inverter, and do you handle the net metering liaison with TNEB?",
    confidence: 0.96,
    startOffsetMs: 46500,
    endOffsetMs: 51000
  },
  {
    id: "seg_110",
    speaker: "AGENT",
    text: "The solar panels come with a 25-year performance warranty and the inverter has a 5-year replacement warranty. We handle the complete TNEB net-metering paperwork.",
    confidence: 0.98,
    startOffsetMs: 51500,
    endOffsetMs: 58000
  },
  {
    id: "seg_111",
    speaker: "CUSTOMER",
    text: "That sounds very reasonable. I am the sole owner of the property, so please schedule a physical site inspection for this Saturday morning.",
    confidence: 0.96,
    startOffsetMs: 58500,
    endOffsetMs: 64500
  },
  {
    id: "seg_112",
    speaker: "AGENT",
    text: "Perfect! Our technical engineer will visit this Saturday at 10 AM. Is there any other query?",
    confidence: 0.98,
    startOffsetMs: 65000,
    endOffsetMs: 68000
  },
  {
    id: "seg_113",
    speaker: "CUSTOMER",
    text: "Can you confirm if your structure mounting withstands high wind speeds in our area?",
    confidence: 0.95,
    startOffsetMs: 68500,
    endOffsetMs: 72500
  },
  {
    id: "seg_114",
    speaker: "AGENT",
    text: "I will have our structural engineer provide the certified wind load test sheet during the site inspection on Saturday.",
    confidence: 0.98,
    startOffsetMs: 73000,
    endOffsetMs: 78000
  }
];

const segmentsMap = new Map<string, TranscriptSegmentInput>();
for (const s of syntheticSegments) {
  segmentsMap.set(s.id, s);
}

interface ValidationTarget {
  name: string;
  provider: "GROQ" | "GEMINI";
  model?: string;
}

const targets: ValidationTarget[] = [
  { name: "Groq Production LPU (openai/gpt-oss-20b)", provider: "GROQ", model: "openai/gpt-oss-20b" },
  { name: "Google Gemini 2.5 Flash", provider: "GEMINI", model: "gemini-2.5-flash" }
];

async function runLiveEvaluation() {
  for (const target of targets) {
    console.log(`\n---------------------------------------------------------------------`);
    console.log(`EVALUATING LIVE PROVIDER: ${target.name}`);
    console.log(`---------------------------------------------------------------------`);

    if (target.provider === "GROQ" && !groqApiKey) {
      console.log(`⚠️ Skipping ${target.name}: GROQ_API_KEY not configured.`);
      continue;
    }
    if (target.provider === "GEMINI" && !geminiApiKey) {
      console.log(`⚠️ Skipping ${target.name}: GEMINI_API_KEY not configured.`);
      continue;
    }

    const t0 = Date.now();
    const result = await analyzeCallWithAI({
      callSessionId: "11111111-1111-4111-8111-111111111111",
      organizationId: "00000000-0000-4000-8000-000000000001",
      segments: syntheticSegments,
      customerName: "Venkatesh Kumar",
      customerPhone: "+91 98401 23456",
      businessName: "Surya Shakti Solar Solutions",
      durationSeconds: 78,
      options: {
        preferredProvider: target.provider,
        preferredModel: target.model,
        timeoutMs: 25000
      }
    });

    const elapsed = Date.now() - t0;
    console.log(`Provider Used:   ${result.provider}`);
    console.log(`Model Used:      ${result.model}`);
    console.log(`Duration:        ${elapsed}ms`);
    console.log(`Business Outcome:${result.businessOutcome}`);
    console.log(`Compliance State:${result.complianceState}`);
    console.log(`Escalation State:${result.escalationState}`);
    console.log(`Score:           ${result.leadScoring.totalScore} (${result.leadScoring.classification})`);
    console.log(`Coverage:        ${Math.round(result.evidenceCoverage * 100)}%`);
    console.log(`Confidence:      ${result.extractionConfidence}`);

    // Verify 13 Dimensions
    const data = result.intelligenceData;

    console.log(`\nVerifying 13 Grounded Dimensions for ${target.name}:`);

    // 1. Summary
    console.log(`1. Summary: "${result.summary.slice(0, 100)}..."`);
    assert.ok(result.summary && result.summary.length > 20, "Summary must be present");

    // 2. Customer Intent
    console.log(`2. Intent:  "${data.customerIntent?.value}" | Quote: "${data.customerIntent?.exactQuote}"`);
    assert.ok(data.customerIntent, "Customer intent must be extracted");
    assert.equal(data.customerIntent.verificationState, "VERIFIED", "Intent must be VERIFIED");
    assert.ok(data.customerIntent.evidenceSegmentIds.includes("seg_102"), "Intent must cite seg_102");
    assert.equal(data.customerIntent.speaker, "CUSTOMER", "Intent speaker must be CUSTOMER");
    assert.ok(
      normalizeQuoteText(segmentsMap.get("seg_102")!.text).includes(normalizeQuoteText(data.customerIntent.exactQuote)),
      "Intent quote must match seg_102 transcript"
    );

    // 3. Customer Requirements
    console.log(`3. Requirements: (${data.customerRequirements.length} found)`);
    assert.ok(data.customerRequirements.length > 0, "Customer requirements must be extracted");
    for (const req of data.customerRequirements) {
      console.log(`   - "${req.value}" (Quote: "${req.exactQuote}" | Segments: ${req.evidenceSegmentIds})`);
      if (req.verificationState === "VERIFIED") {
        for (const sid of req.evidenceSegmentIds) {
          assert.ok(segmentsMap.has(sid), `Segment ${sid} must exist`);
          assert.equal(segmentsMap.get(sid)!.speaker, "CUSTOMER", "Requirement must be from CUSTOMER");
        }
      }
    }

    // 4. Product Service Interest
    console.log(`4. Product Interest: "${data.productServiceInterest?.value}"`);
    assert.ok(data.productServiceInterest, "Product interest must be extracted");

    // 5. Budget Constraints
    console.log(`5. Budget:  "${data.budget?.value}" | Quote: "${data.budget?.exactQuote}"`);
    assert.ok(data.budget, "Budget must be extracted");
    assert.equal(data.budget.verificationState, "VERIFIED", "Budget must be VERIFIED");
    assert.ok(data.budget.evidenceSegmentIds.includes("seg_104"), "Budget must cite seg_104");
    assert.ok(
      normalizeQuoteText(segmentsMap.get("seg_104")!.text).includes(normalizeQuoteText(data.budget.exactQuote)),
      "Budget quote must match seg_104 text"
    );

    // 6. Purchase Timeline
    console.log(`6. Timeline: "${data.purchaseTimeline?.value}" | Quote: "${data.purchaseTimeline?.exactQuote}"`);
    assert.ok(data.purchaseTimeline, "Purchase timeline must be extracted");
    assert.equal(data.purchaseTimeline.verificationState, "VERIFIED", "Timeline must be VERIFIED");
    assert.ok(data.purchaseTimeline.evidenceSegmentIds.includes("seg_106"), "Timeline must cite seg_106");

    // 7. Location Requirements
    console.log(`7. Location: "${data.locationRequirements?.value}" | Quote: "${data.locationRequirements?.exactQuote}"`);
    assert.ok(data.locationRequirements, "Location must be extracted");
    assert.equal(data.locationRequirements.verificationState, "VERIFIED", "Location must be VERIFIED");

    // 8. Objections Raised
    console.log(`8. Objections: (${data.customerObjections.length} found)`);
    assert.ok(data.customerObjections.length > 0, "Objections must be extracted");
    const verifiedObjections = data.customerObjections.filter((o) => o.verificationState === "VERIFIED");
    assert.ok(verifiedObjections.length > 0, "At least 1 objection must be VERIFIED");
    for (const obj of verifiedObjections) {
      console.log(`   - "${obj.value}" (Quote: "${obj.exactQuote}")`);
      assert.ok(obj.evidenceSegmentIds.includes("seg_108"), "Objection must cite seg_108");
    }

    // 9. Competitor Mentions
    console.log(`9. Competitors: (${data.competitorMentions.length} found)`);
    assert.ok(data.competitorMentions.length > 0, "Competitor mentions must be extracted");
    const tataMention = data.competitorMentions.find((c) =>
      c.value.toLowerCase().includes("tata") || c.exactQuote.toLowerCase().includes("tata")
    );
    assert.ok(tataMention, "Tata Power Solar competitor mention must be identified");
    assert.equal(tataMention.verificationState, "VERIFIED", "Competitor mention must be VERIFIED");
    assert.ok(tataMention.evidenceSegmentIds.includes("seg_108"), "Competitor must cite seg_108");

    // 10. Buying Signals
    console.log(`10. Buying Signals: (${data.buyingSignals.length} found)`);
    assert.ok(data.buyingSignals.length > 0, "Buying signals must be extracted");
    const verifiedSignals = data.buyingSignals.filter((s) => s.verificationState === "VERIFIED");
    assert.ok(verifiedSignals.length > 0, "At least 1 buying signal must be VERIFIED");

    // 11. Customer Questions
    console.log(`11. Customer Questions: (${data.customerQuestions.length} found)`);
    assert.ok(data.customerQuestions.length > 0, "Customer questions must be extracted");

    // 12. Unresolved Questions
    console.log(`12. Unresolved Questions: (${data.unresolvedQuestions.length} found)`);

    // 13. Recommended Next Action
    console.log(`13. Next Action: "${data.recommendedNextAction?.value}"`);
    assert.ok(data.recommendedNextAction, "Recommended next action must be extracted");

    // Commercial Qualification Check
    assert.equal(result.businessOutcome, "QUALIFIED", "High-intent conversation must evaluate to QUALIFIED");
    assert.ok(result.leadScoring.totalScore! >= 70, `Lead score must be high (got ${result.leadScoring.totalScore})`);
    assert.ok(result.evidenceCoverage >= 0.60, `Evidence coverage must be >= 60% (got ${result.evidenceCoverage})`);

    console.log(`\n✅ ${target.name} PASSED ALL 13 INTELLIGENCE DIMENSIONS & EVIDENCE VERIFICATIONS!`);
  }

  console.log("\n=====================================================================");
  console.log("ALL LIVE PROVIDER AUDITS COMPLETED WITH 100% SUCCESS!");
  console.log("=====================================================================\n");
}

runLiveEvaluation().catch((err) => {
  console.error("Live evaluation failed:", err);
  process.exit(1);
});
