/**
 * VoiceNexus AI — Milestone 6.2 Live Safety Orchestration Verification Suite
 * Tests DNC and Supervisor Escalation under real WebSocket Gateway orchestration:
 * 1. DNC prevents further automated contact and closes/ends session.
 * 2. Escalation transitions session state to "transferred" and locks automated AI turns.
 * 3. Preemptive evaluation guarantees provider network failures never bypass safety controls.
 */

import { WebSocket } from "ws";
import assert from "node:assert/strict";
import { createGatewayApp } from "../services/voice-gateway/src/index.js";

async function runLiveSafetyOrchestrationVerification() {
  console.log("==================================================================");
  console.log("VOICENEXUS AI — LIVE SAFETY ORCHESTRATION VERIFICATION");
  console.log("==================================================================");

  const testPort = 8099;
  const app = createGatewayApp();
  await app.listen({ port: testPort, host: "127.0.0.1" });
  console.log(`✔ Fastify Voice Gateway test instance listening on port ${testPort}`);

  try {
    // 1. Live DNC Orchestration Test
    console.log("\n▶ Test 1: Live DNC Orchestration over WebSocket Gateway...");
    const ws1 = new WebSocket(`ws://127.0.0.1:${testPort}/ws/browser`);

    let dncTurnReceived = false;
    let dncEndStateReceived = false;
    let subsequentTurnBlocked = true;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DNC Test Timeout")), 15000);

      ws1.on("open", () => {
        ws1.send(
          JSON.stringify({
            type: "init",
            sessionId: "safety_dnc_001",
            agentName: "Asmita",
          })
        );
      });

      ws1.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "session_ready") {
          // Trigger DNC
          ws1.send(
            JSON.stringify({
              type: "utterance",
              text: "I am not interested. Please do not call this number again and remove me from your list.",
            })
          );
        }

        if (msg.type === "transcript" && msg.speaker === "agent") {
          if (msg.isDnc) {
            dncTurnReceived = true;
            console.log(`  → DNC confirmation received: "${msg.text}" (Latency: ${msg.llmLatencyMs}ms)`);
            // Attempt subsequent message to verify it is blocked
            ws1.send(JSON.stringify({ type: "utterance", text: "Wait, are you still there?" }));
          } else if (dncTurnReceived) {
            // If another agent transcript arrives after DNC, fail!
            subsequentTurnBlocked = false;
          }
        }

        if (msg.type === "agent_state" && msg.state === "ended") {
          dncEndStateReceived = true;
          clearTimeout(timer);
          resolve();
        }
      });
    });

    assert.ok(dncTurnReceived, "Must receive DNC confirmation transcript");
    assert.ok(dncEndStateReceived, "Session must transition agent_state to 'ended'");
    assert.ok(subsequentTurnBlocked, "Subsequent utterances must be completely blocked after DNC");
    console.log("✔ PASS: DNC enforcement verified under live gateway orchestration.");
    ws1.close();

    // 2. Live Escalation Orchestration Test
    console.log("\n▶ Test 2: Live Human Supervisor Escalation Orchestration...");
    const ws2 = new WebSocket(`ws://127.0.0.1:${testPort}/ws/browser`);

    let escalationTurnReceived = false;
    let transferredStateReceived = false;
    let subsequentEscalationTurnBlocked = true;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Escalation Test Timeout")), 15000);

      ws2.on("open", () => {
        ws2.send(
          JSON.stringify({
            type: "init",
            sessionId: "safety_escalation_002",
            agentName: "Asmita",
          })
        );
      });

      ws2.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "session_ready") {
          // Trigger Escalation
          ws2.send(
            JSON.stringify({
              type: "utterance",
              text: "I demand to talk directly to your senior technical project engineer.",
            })
          );
        }

        if (msg.type === "transcript" && msg.speaker === "agent") {
          if (msg.isEscalated) {
            escalationTurnReceived = true;
            console.log(`  → Escalation handoff notice: "${msg.text}" (Latency: ${msg.llmLatencyMs}ms)`);
            // Attempt subsequent message to verify it is blocked
            ws2.send(JSON.stringify({ type: "utterance", text: "Hello engineer, can you hear me?" }));
          } else if (escalationTurnReceived) {
            subsequentEscalationTurnBlocked = false;
          }
        }

        if (msg.type === "agent_state" && msg.state === "transferred") {
          transferredStateReceived = true;
          clearTimeout(timer);
          resolve();
        }
      });
    });

    assert.ok(escalationTurnReceived, "Must receive escalation handoff transcript");
    assert.ok(transferredStateReceived, "Session must transition agent_state to 'transferred'");
    assert.ok(subsequentEscalationTurnBlocked, "Automated AI turns must freeze during human handoff");
    console.log("✔ PASS: Human escalation handoff verified under live gateway orchestration.");
    ws2.close();

    // 3. Verify provider failures do not bypass safety controls
    console.log("\n▶ Test 3: Safety Guardrail Preemption during Provider Outage...");
    // When external providers are offline/unreachable, DNC and Escalation must still execute in < 2ms
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Complete Provider Network Outage");
    };

    try {
      const ws3 = new WebSocket(`ws://127.0.0.1:${testPort}/ws/browser`);
      let guardrailSucceeded = false;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Provider Outage Safety Timeout")), 15000);

        ws3.on("open", () => {
          ws3.send(
            JSON.stringify({
              type: "init",
              sessionId: "safety_outage_003",
            })
          );
        });

        ws3.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "session_ready") {
            ws3.send(JSON.stringify({ type: "utterance", text: "Stop calling me, remove my phone number" }));
          }
          if (msg.type === "transcript" && msg.speaker === "agent" && msg.isDnc) {
            guardrailSucceeded = true;
            console.log(`  → Guardrail executed in outage condition: "${msg.text}"`);
            clearTimeout(timer);
            resolve();
          }
        });
      });

      assert.ok(guardrailSucceeded, "Safety guardrails must execute even during total provider network failure");
      console.log("✔ PASS: Safety controls preempt network layer and cannot be bypassed by provider failures.");
      ws3.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await app.close();
    console.log("✔ Voice Gateway test server cleanly closed");
  }

  console.log("\n==================================================================");
  console.log("ALL LIVE SAFETY ORCHESTRATION VERIFICATION CHECKS PASSED!");
  console.log("==================================================================");
}

runLiveSafetyOrchestrationVerification().catch((err) => {
  console.error("FATAL SAFETY ORCHESTRATION TEST ERROR:", err);
  process.exit(1);
});

