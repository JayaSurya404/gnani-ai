import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { generateAgentTurn } from "../services/voice-gateway/src/providers/llm-provider.js";

describe("Phase 6.1 Complete Voice Conversation & Quality Suite", () => {
  const baseSystemPrompt = `You are Asmita, an AI Solar Technical Consultant for Aadhira Solar Tech in Chennai.
Your mission is to qualify prospects for residential rooftop solar with PM Surya Ghar subsidy (₹78,000 subsidy).
Technical specs: We install Tier-1 Mono PERC bifacial solar modules, IP65 smart hybrid inverters, with a 25-year warranty.
Financing: Zero-downpayment 0% EMI options with energy bill savings payback.
Pricing: A benchmark 3kW residential rooftop setup costs approximately ₹1.45L to ₹1.70L after the central subsidy deduction.
Always greet prospects warmly as Aadhira Solar Tech consultant.`;

  // Test 1: Natural business greeting
  test("1. handles natural business greeting in Tamil and English", async () => {
    const enGreeting = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "Hello, good morning.",
    });
    assert.match(enGreeting.text, /VoiceNexus AI|Aadhira Solar|சோலார்|அஸ்மிதா|வணக்கம்|assist/i);

    const taGreeting = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "வணக்கம்! நல்ல காலை.",
    });
    assert.match(taGreeting.text, /வணக்கம்|உதவவா/);
  });

  // Test 2: Customer asking about pricing and subsidies
  test("2. answers pricing and PM Surya Ghar subsidy queries with factual benchmark data", async () => {
    const pricingTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "How much does a 3kW residential rooftop system cost after the central subsidy?",
    });

    assert.ok(
      pricingTurn.text.includes("1.45") || pricingTurn.text.includes("78,000"),
      "Must state factual pricing"
    );
    assert.ok(!pricingTurn.text.includes("free of charge"), "Must not invent unrealistic zero-cost claims");
  });

  // Test 3: Customer asking about product specifications
  test("3. answers technical product specification inquiries factually", async () => {
    const specTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "What panel specifications, inverter brands, and warranties do you offer?",
    });

    assert.match(
      specTurn.text,
      /Mono[-‑\s]?PERC/i,
      "Must mention Mono PERC technology (supporting standard space, hyphen, or Unicode non-breaking hyphen)"
    );
    assert.match(specTurn.text, /25[-‑\s]?(?:year|ஆண்டு|வருட)/i, "Must mention 25-year warranty");
  });

  // Test 4: Customer asking for a callback
  test("4. processes callback request and flags isCallbackRequested without arguing", async () => {
    const callbackTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "I am in a meeting right now. Please call me back tomorrow.",
    });

    assert.equal(callbackTurn.isCallbackRequested, true);
    assert.match(callbackTurn.text, /callback|convenient time/i);
  });

  // Test 5: Customer expressing objections (budget / expensive)
  test("5. handles budget objections by presenting 0% EMI and energy bill payback", async () => {
    const objectionTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "This seems too expensive for our current budget.",
    });

    assert.ok(objectionTurn.text.includes("EMI") || objectionTurn.text.includes("savings"), "Must offer EMI or bill savings");
  });

  // Test 6: Customer asking for a human representative
  test("6. executes immediate human escalation upon caller request", async () => {
    const escalationTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "Can I speak directly to your senior technical project engineer?",
    });

    assert.equal(escalationTurn.isEscalated, true);
    assert.equal(escalationTurn.model, "escalation-guardrail");
    assert.match(escalationTurn.text, /supervisor|paused|follow up/i);
  });

  // Test 7: Customer opting out (DNC)
  test("7. enforces instant Do-Not-Call (DNC) opt-out without rebuttal", async () => {
    const dncTurn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "I am not interested. Stop calling and remove my number from your list.",
    });

    assert.equal(dncTurn.isDnc, true);
    assert.equal(dncTurn.model, "compliance-safety-guardrail");
    assert.match(dncTurn.text, /Do-Not-Call/i);
  });

  // Test 8: Multi-turn contextual memory across previous turns
  test("8. preserves multi-turn contextual memory across conversation history", async () => {
    const turn1 = {
      role: "user" as const,
      content: "I want to ask about solar panel specifications for my house in Chennai.",
    };
    const turn2 = {
      role: "assistant" as const,
      content: "We provide Tier-1 Mono PERC bifacial solar modules with a 25-year warranty.",
    };

    const followUp = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [turn1, turn2],
      callerUtterance: "What did I ask about earlier?",
    });

    assert.ok(
      followUp.text.toLowerCase().includes("earlier") ||
      followUp.text.toLowerCase().includes("solar panel") ||
      followUp.text.toLowerCase().includes("specifications"),
      `Expected followUp to recall earlier turn, got: ${followUp.text}`
    );
  });

  // Test 9: Explicit disclosure when LLM credentials are unconfigured
  test("9. explicitly labels unconfigured mode when GEMINI_API_KEY and GROQ_API_KEY are missing", async () => {
    const turn = await generateAgentTurn({
      systemPrompt: baseSystemPrompt,
      conversationHistory: [],
      callerUtterance: "Can you provide a general overview of your commercial EPC capabilities?",
      preferredProvider: "UNCONFIGURED_RULE_BASED",
    });

    assert.equal(turn.provider, "UNCONFIGURED_RULE_BASED");
    assert.equal(turn.isUnconfigured, true);
    assert.ok(turn.unconfiguredNotice?.includes("GEMINI_API_KEY or GROQ_API_KEY"));
  });
});

