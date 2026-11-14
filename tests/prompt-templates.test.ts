import test from "node:test";
import assert from "node:assert/strict";
import { validatePrompt, resolvePromptVariables } from "../src/lib/prompt-builder";
import { buildFullAgentSystemPrompt, interpolatePromptTemplate } from "../src/lib/prompt-templates";

test("Prompt Builder & Template Suite", async (t) => {
  await t.test("validates a compliant system prompt with variable tokens", () => {
    const prompt = `You are an AI consultant calling from {{business_name}} to assist {{customer_name}} regarding their inquiry for {{customer_interest}}. Please state your AI identity and verify their power bill.`;
    const res = validatePrompt(prompt);
    assert.equal(res.isValid, true);
    assert.equal(res.errors.length, 0);
    assert.ok(res.detectedVariables.includes("{{business_name}}"));
    assert.ok(res.detectedVariables.includes("{{customer_name}}"));
  });

  await t.test("rejects an empty or excessively short prompt", () => {
    const res = validatePrompt("Too short");
    assert.equal(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes("too brief")));
  });

  await t.test("detects unclosed placeholder tokens", () => {
    const res = validatePrompt("You are an assistant for {{business_name and you should help {{customer");
    assert.equal(res.isValid, false);
    assert.ok(res.errors.some((e) => e.includes("unclosed")));
  });

  await t.test("resolves context variables correctly into prompt text", () => {
    const template = "Welcome to {{business_name}}, {{customer_name}}! We received your request for {{customer_interest}} in {{city}}.";
    const resolved = resolvePromptVariables(template, {
      businessName: "Aadhira Solar Tech",
      customerName: "Karthik Subramanian",
      customerInterest: "10kW Commercial System",
      city: "Chennai",
    });
    assert.ok(resolved.includes("Aadhira Solar Tech"));
    assert.ok(resolved.includes("Karthik Subramanian"));
    assert.ok(resolved.includes("10kW Commercial System"));
    assert.ok(resolved.includes("Chennai"));
    assert.equal(resolved.includes("{{"), false);
  });

  await t.test("injects mandatory AI identity and DNC guardrails into system instructions", () => {
    const full = buildFullAgentSystemPrompt({
      basePrompt: "Help the customer with solar questions.",
      context: { businessName: "Aadhira Solar" },
      languageMode: "TANGLISH",
      guardrails: { discloseAiIdentity: true, honorDoNotCall: true },
      agentName: "Selvi",
    });
    assert.ok(full.includes("MANDATORY AI IDENTITY DISCLOSURE"));
    assert.ok(full.includes("DO-NOT-CALL & OPT-OUT ENFORCEMENT"));
    assert.ok(full.includes("LANGUAGE POLICY: CONVERSATIONAL TANGLISH"));
  });

  await t.test("interpolates base prompt template with context values", () => {
    const raw = "Agent {{agent_name}} from {{business_name}} calling {{customer_name}}.";
    const out = interpolatePromptTemplate(raw, {
      businessName: "Aadhira Solar Tech",
      customerName: "Suresh",
    }, "Selvi");
    assert.equal(out, "Agent Selvi from Aadhira Solar Tech calling Suresh.");
  });
});
