import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { generateAgentTurn } from "../services/voice-gateway/src/providers/llm-provider.js";
import { BrowserVoiceSession } from "../services/voice-gateway/src/gateway-session.js";

interface SessionInternalAccess {
  handleInit: (msg: unknown) => Promise<void>;
  handleUserUtterance: (text: string) => Promise<void>;
  isDnc: boolean;
  isEscalated: boolean;
}

describe("Milestone 6.2 — Safety Guardrails & Provider Failover Suite", () => {
  const systemPrompt = "You are a helpful VoiceNexus AI consultant.";

  // 1. DNC intercept before any LLM network request
  test("1. executes instantaneous Do-Not-Call (DNC) intercept without network LLM delay", async () => {
    const result = await generateAgentTurn({
      systemPrompt,
      conversationHistory: [],
      callerUtterance: "Please do not call this number again. Remove me from your calling list.",
    });

    assert.equal(result.isDnc, true, "Must flag isDnc as true");
    assert.equal(result.model, "compliance-safety-guardrail");
    assert.match(result.text, /Do-Not-Call/i);
    assert.ok(result.latencyMs < 50, `Guardrail should return under 50ms, took ${result.latencyMs}ms`);
  });

  // 2. Human escalation before any LLM network request
  test("2. executes instantaneous human escalation protocol without network LLM delay", async () => {
    const result = await generateAgentTurn({
      systemPrompt,
      conversationHistory: [],
      callerUtterance: "I demand to talk to a human supervisor or senior manager right now.",
    });

    assert.equal(result.isEscalated, true, "Must flag isEscalated as true");
    assert.equal(result.model, "escalation-guardrail");
    assert.match(result.text, /supervisor|paused|follow up/i);
    assert.ok(result.latencyMs < 50, `Escalation should return under 50ms, took ${result.latencyMs}ms`);
  });

  // 3. Provider timeout handling
  test("3. handles provider network timeout gracefully without crashing", async () => {
    // Mock global fetch to simulate timeout
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    };

    try {
      const result = await generateAgentTurn({
        systemPrompt,
        conversationHistory: [],
        callerUtterance: "What is your commercial solar pricing?",
        preferredProvider: "GROQ",
      });

      // Must fall back to safe deterministic engine
      assert.equal(result.provider, "UNCONFIGURED_RULE_BASED");
      assert.equal(result.model, "deterministic-domain-engine");
      assert.ok(result.text.length > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Invalid provider response handling
  test("4. handles invalid/malformed HTTP provider responses without throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });
    };

    try {
      const result = await generateAgentTurn({
        systemPrompt,
        conversationHistory: [],
        callerUtterance: "How much is the rooftop solar cost?",
        preferredProvider: "GROQ",
      });

      assert.equal(result.provider, "UNCONFIGURED_RULE_BASED");
      assert.equal(result.model, "deterministic-domain-engine");
      assert.ok(result.text.includes("1.45") || result.text.includes("78,000"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Groq unavailable and Gemini available failover
  test("5. fails over to Gemini when Groq is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("api.groq.com")) {
        // Groq fails with 500
        return new Response(JSON.stringify({ error: { message: "Internal server error" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        // Gemini succeeds
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Gemini successfully answered your solar enquiry." }] },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url);
    };

    try {
      const result = await generateAgentTurn({
        systemPrompt,
        conversationHistory: [],
        callerUtterance: "Tell me about solar systems.",
        preferredProvider: "GROQ", // Groq requested first
      });

      assert.equal(result.provider, "GEMINI");
      assert.equal(result.text, "Gemini successfully answered your solar enquiry.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Gemini unavailable and Groq available failover
  test("6. fails over to Groq when Gemini is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        // Gemini fails with 503 high demand
        return new Response(JSON.stringify({ error: { message: "Model overloaded" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("api.groq.com")) {
        // Groq succeeds
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Groq successfully answered your enquiry." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url);
    };

    try {
      const result = await generateAgentTurn({
        systemPrompt,
        conversationHistory: [],
        callerUtterance: "Tell me about solar systems.",
        preferredProvider: "GEMINI", // Gemini requested first
      });

      assert.equal(result.provider, "GROQ");
      assert.equal(result.text, "Groq successfully answered your enquiry.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7 & 8. Both providers unavailable -> safe deterministic fallback
  test("7. safely enters deterministic domain engine when both providers are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "All providers offline" }), { status: 503 });
    };

    try {
      const result = await generateAgentTurn({
        systemPrompt,
        conversationHistory: [],
        callerUtterance: "What is the PM Surya Ghar subsidy?",
      });

      assert.equal(result.provider, "UNCONFIGURED_RULE_BASED");
      assert.equal(result.model, "deterministic-domain-engine");
      assert.equal(result.isUnconfigured, true);
      assert.ok(result.text.includes("78,000"), "Deterministic engine provides accurate grounded subsidy figures");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 9. No additional AI response after DNC
  test("8. enforces session freeze with no additional AI turn generated after DNC opt-out", async () => {
    const sentMessages: string[] = [];

    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        const parsed = JSON.parse(data) as { type: string };
        sentMessages.push(parsed.type);
      },
      close: () => {},
      on: () => {},
    } as unknown as import("ws").WebSocket;

    const session = new BrowserVoiceSession(mockWs);
    const sessionAccess = session as unknown as SessionInternalAccess;

    // Initialize session
    await sessionAccess.handleInit({
      type: "init",
      sessionId: "dnc-freeze-test",
    });

    // User triggers DNC
    await sessionAccess.handleUserUtterance("Stop calling me and remove my number.");
    assert.equal(sessionAccess.isDnc, true, "Session must flag DNC active");

    const countAfterDnc = sentMessages.filter((t) => t === "transcript").length;

    // Subsequent user utterance should be ignored
    await sessionAccess.handleUserUtterance("Are you still there?");
    const countAfterSecond = sentMessages.filter((t) => t === "transcript").length;

    assert.equal(countAfterSecond, countAfterDnc, "Must not generate any additional AI transcript after DNC");
    session.close();
  });

  // 10. No additional AI response while human escalation is active
  test("9. freezes automated AI turns while supervisor escalation handoff is active", async () => {
    const sentMessages: string[] = [];

    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        const parsed = JSON.parse(data) as { type: string };
        sentMessages.push(parsed.type);
      },
      close: () => {},
      on: () => {},
    } as unknown as import("ws").WebSocket;

    const session = new BrowserVoiceSession(mockWs);
    const sessionAccess = session as unknown as SessionInternalAccess;

    // Initialize session
    await sessionAccess.handleInit({
      type: "init",
      sessionId: "escalation-freeze-test",
    });

    // User triggers escalation
    await sessionAccess.handleUserUtterance("Transfer me to a human manager.");
    assert.equal(sessionAccess.isEscalated, true, "Session must flag escalation active");

    const countAfterEscalation = sentMessages.filter((t) => t === "transcript").length;

    // Subsequent user utterance should be blocked
    await sessionAccess.handleUserUtterance("Hello manager?");
    const countAfterSubsequent = sentMessages.filter((t) => t === "transcript").length;

    assert.equal(countAfterSubsequent, countAfterEscalation, "Must not generate additional AI turns during escalation");
    session.close();
  });
});
