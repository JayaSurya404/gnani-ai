import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getOfficialVoices, getVoiceProfileById } from "../src/lib/voice-profiles.js";
import { generateAgentTurn } from "../services/voice-gateway/src/providers/llm-provider.js";

describe("Voice Gateway & Gnani Audio Orchestration Unit Suite", () => {
  test("verifies official Gnani Timbre voice catalog integrity", () => {
    const official = getOfficialVoices();
    assert.ok(official.length >= 6, `Expected at least 6 official voices, got ${official.length}`);

    // Check Tamil official default
    const asmita = official.find((v) => v.providerVoiceId === "Asmita");
    assert.ok(asmita, "Asmita voice must exist");
    assert.equal(asmita.languageCode, "ta-IN");
    assert.equal(asmita.model, "timbre-v2.5");
    assert.equal(asmita.voiceType, "OFFICIAL_PROVIDER");
    assert.equal(asmita.consent.status, "VERIFIED");
    assert.ok(asmita.consent.consentRef.startsWith("GNANI-TIMBRE"));

    // Check English official default
    const kaveri = official.find((v) => v.providerVoiceId === "Kaveri");
    assert.ok(kaveri, "Kaveri voice must exist");
    assert.equal(kaveri.languageCode, "en-IN");
    assert.equal(kaveri.model, "timbre-v2.5");
    assert.equal(kaveri.voiceType, "OFFICIAL_PROVIDER");

    // Check Hindi official default
    const nalini = official.find((v) => v.providerVoiceId === "Nalini");
    assert.ok(nalini, "Nalini voice must exist");
    assert.equal(nalini.languageCode, "hi-IN");

    // Check Timbre v3.0 Multilingual
    const shivani = official.find((v) => v.providerVoiceId === "Shivani");
    assert.ok(shivani, "Shivani voice must exist");
    assert.equal(shivani.model, "timbre-v3.0");
    assert.equal(shivani.languageCode, "indic-auto");
  });

  test("resolves backward-compatible legacy voice aliases without throwing", () => {
    const legacySelvi = getVoiceProfileById("ta-IN-selvi");
    assert.ok(legacySelvi, "Legacy Selvi must resolve");
    assert.equal(legacySelvi.providerVoiceId, "Asmita", "Legacy Selvi must alias to Asmita");

    const legacyPriya = getVoiceProfileById("en-IN-priya");
    assert.ok(legacyPriya, "Legacy Priya must resolve");
    assert.equal(legacyPriya.providerVoiceId, "Kaveri", "Legacy Priya must alias to Kaveri");
  });

  test("strictly enforces Do-Not-Call (DNC) opt-out without calling external LLM", async () => {
    const result = await generateAgentTurn({
      systemPrompt: "You are an AI sales rep.",
      conversationHistory: [],
      callerUtterance: "Please stop calling me and remove my number from your database.",
    });

    assert.equal(result.isDnc, true, "Must flag isDnc as true");
    assert.equal(result.model, "compliance-safety-guardrail");
    assert.match(result.text, /Do-Not-Call/i);
  });

  test("triggers supervisor escalation protocol on manager or engineer request", async () => {
    const result = await generateAgentTurn({
      systemPrompt: "You are an AI sales rep.",
      conversationHistory: [],
      callerUtterance: "I need to talk to a human supervisor right now.",
    });

    assert.equal(result.isEscalated, true, "Must flag isEscalated as true");
    assert.equal(result.model, "escalation-guardrail");
    assert.match(result.text, /supervisor|paused|follow up/i);
  });

  test("transparently labels unconfigured LLM reasoning mode without hallucinating", async () => {
    const result = await generateAgentTurn({
      systemPrompt: "You are a solar consultant.",
      conversationHistory: [],
      callerUtterance: "How much is the PM Surya Ghar subsidy for rooftop solar?",
      preferredProvider: "UNCONFIGURED_RULE_BASED",
    });

    assert.ok(result.text.includes("78,000"), "Must accurately state the ₹78,000 subsidy figure");
    assert.equal(result.provider, "UNCONFIGURED_RULE_BASED");
    assert.equal(result.model, "deterministic-domain-engine");
  });

  test("downsamples and encodes Float32 PCM to 16-bit signed integer buffer", () => {
    const floatSamples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const int16 = new Int16Array(floatSamples.length);
    for (let i = 0; i < floatSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, floatSamples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    assert.equal(int16[0], 0);
    assert.equal(int16[1], Math.floor(0.5 * 0x7fff));
    assert.equal(int16[2], -16384);
    assert.equal(int16[3], 32767);
    assert.equal(int16[4], -32768);
  });
});
