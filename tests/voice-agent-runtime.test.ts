import test from "node:test";
import assert from "node:assert/strict";
import { processVoiceTurn, detectCallerLanguage } from "../src/lib/voice-agent-runtime";

test("Voice Agent Runtime & Turn Orchestration Suite", async (t) => {
  await t.test("detects Tanglish, Tamil, and English speech patterns", () => {
    assert.equal(detectCallerLanguage("Vanakkam sir! Solar cost evvalavu aagum?"), "tanglish");
    assert.equal(detectCallerLanguage("வணக்கம், நான் சூரிய மின்கலங்களை விரும்புகிறேன்"), "ta");
    assert.equal(detectCallerLanguage("Hello, what is the warranty on these monocrystalline panels?"), "en");
  });

  await t.test("strictly enforces Do-Not-Call (DNC) opt-out on cancellation phrases", () => {
    const res = processVoiceTurn({
      agentName: "Selvi",
      businessName: "Aadhira Solar Tech",
      systemPrompt: "You are an assistant.",
      languageMode: "AUTO",
      userMessage: "Please stop calling me, I am not interested.",
      history: [],
      leadContext: { name: "Anand" },
    });
    assert.equal(res.action, "END_REQUESTED");
    assert.equal(res.doNotCall, true);
    assert.equal(res.sentiment, "FRUSTRATED");
    assert.ok(res.text.toLowerCase().includes("not contact you again"));
  });

  await t.test("triggers human escalation protocol on supervisor or engineer request", () => {
    const res = processVoiceTurn({
      agentName: "Selvi",
      businessName: "Aadhira Solar Tech",
      systemPrompt: "You are an assistant.",
      languageMode: "ENGLISH",
      userMessage: "I want to speak with a human senior engineer.",
      history: [],
      leadContext: { name: "Deepak" },
    });
    assert.equal(res.action, "HANDOFF_REQUESTED");
    assert.ok(res.text.includes("senior solar engineer"));
  });

  await t.test("answers PM Surya Ghar subsidy queries accurately with benchmark figures", () => {
    const res = processVoiceTurn({
      agentName: "Selvi",
      businessName: "Aadhira Solar Tech",
      systemPrompt: "You are a solar consultant.",
      languageMode: "ENGLISH",
      userMessage: "How much government subsidy do I get under PM Surya Ghar scheme?",
      history: [],
      leadContext: { name: "Rajesh" },
    });
    assert.equal(res.action, "CONTINUE");
    assert.ok(res.text.includes("78,000"));
    assert.equal(res.sentiment, "POSITIVE");
  });
});

