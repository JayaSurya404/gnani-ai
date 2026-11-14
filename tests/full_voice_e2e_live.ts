/**
 * VoiceNexus AI — Full Voice Pipeline End-to-End Live Verification
 * Tests the complete loop:
 * Client WebSocket Connection → Session Init with CRM Context →
 * User Utterance Dispatch → Real Generative LLM Reasoning (Groq/Gemini) →
 * Real Gnani Timbre TTS Streaming Synthesis → Client Audio Chunks Reception.
 */

import { WebSocket } from "ws";
import assert from "node:assert/strict";
import { createGatewayApp } from "../services/voice-gateway/src/index.js";

interface GatewayTranscriptEvent {
  type: string;
  speaker: string;
  text: string;
  llmProvider?: string;
  llmModel?: string;
  llmLatencyMs?: number;
  turn?: number;
}

async function runFullPipelineLiveTest() {
  console.log("==================================================================");
  console.log("VOICENEXUS AI — FULL LIVE VOICE PIPELINE VERIFICATION");
  console.log("==================================================================");

  const testPort = 8097;
  const app = createGatewayApp();
  await app.listen({ port: testPort, host: "127.0.0.1" });
  console.log(`✔ Fastify Voice Gateway online on port ${testPort}`);

  try {
    const wsClient = new WebSocket(`ws://127.0.0.1:${testPort}/ws/browser`);

    let sessionReadyReceived = false;
    let agentTranscript: GatewayTranscriptEvent | null = null;
    let audioChunksCount = 0;
    let audioTotalBytes = 0;
    let audioEndReceived = false;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        wsClient.terminate();
        reject(new Error("Timeout waiting for live voice pipeline response (25s)"));
      }, 25000);

      wsClient.on("open", () => {
        console.log("✔ Step 1: WebSocket connected to /ws/browser");
        // Initialize session with direct CRM context
        wsClient.send(
          JSON.stringify({
            type: "init",
            sessionId: "live_e2e_pipeline_session",
            agentName: "Asmita",
            systemPrompt:
              "You are Asmita, an AI Solar Technical Consultant for Aadhira Solar Tech in Chennai. A benchmark 3kW residential rooftop system costs approximately ₹1.45L to ₹1.70L after central subsidy deduction. Answer factually in 1 concise spoken sentence.",
            voice: "Asmita",
            model: "timbre-v2.5",
            language: "ta-IN",
            customerContext: {
              customerName: "Dr. Kalanithi",
              monthlyBill: "₹6,500",
              customerInterest: "3kW Residential Solar",
            },
          })
        );
      });

      wsClient.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === "session_ready") {
            sessionReadyReceived = true;
            console.log("✔ Step 2: session_ready received from Voice Gateway. STT & TTS ready.");
            console.log("  → Sending live user utterance over WebSocket...");

            // Send user inquiry to gateway
            wsClient.send(
              JSON.stringify({
                type: "utterance",
                text: "How much does a 3kW residential rooftop system cost after the central subsidy?",
              })
            );
          }

          if (msg.type === "agent_state") {
            console.log(`  → Agent state: ${msg.state}`);
          }

          if (msg.type === "transcript" && msg.speaker === "agent") {
            agentTranscript = msg as GatewayTranscriptEvent;
            console.log(`✔ Step 3: Real Generative AI Response received!`);
            console.log(`   Provider: ${msg.llmProvider}`);
            console.log(`   Model: ${msg.llmModel}`);
            console.log(`   LLM Latency: ${msg.llmLatencyMs} ms`);
            console.log(`   Agent Utterance: "${msg.text}"`);
          }

          if (msg.type === "audio_chunk") {
            audioChunksCount++;
            const buf = Buffer.from(msg.data, "base64");
            audioTotalBytes += buf.length;
            if (audioChunksCount === 1) {
              console.log(`✔ Step 4: First Gnani Timbre audio chunk received! (TTFB: ${msg.ttsLatencyMs} ms)`);
            }
          }

          if (msg.type === "audio_end") {
            audioEndReceived = true;
            console.log(`✔ Step 5: audio_end event received!`);
            console.log(`   Total synthesized chunks: ${audioChunksCount}`);
            console.log(`   Total audio bytes received: ${audioTotalBytes} bytes`);
            console.log(`   Total TTS synthesis duration: ${msg.totalLatencyMs} ms`);
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // ignore non-json
        }
      });

      wsClient.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Verification assertions
    assert.ok(sessionReadyReceived, "Session ready must be received");
    const receivedTranscript = agentTranscript as GatewayTranscriptEvent | null;
    assert.ok(receivedTranscript, "Agent transcript must be received");
    assert.ok(
      receivedTranscript.llmProvider === "GROQ" || receivedTranscript.llmProvider === "GEMINI",
      "Must use live LLM provider"
    );
    assert.ok(audioChunksCount > 5, `Expected at least 5 audio chunks, got ${audioChunksCount}`);
    assert.ok(audioTotalBytes > 10000, `Expected at least 10KB audio, got ${audioTotalBytes} bytes`);
    assert.ok(audioEndReceived, "audio_end event must be received");

    wsClient.close();
    console.log("✔ Step 6: Client WebSocket cleanly disconnected");
  } finally {
    await app.close();
    console.log("✔ Fastify Voice Gateway cleanly closed");
  }

  console.log("\n==================================================================");
  console.log("FULL VOICE PIPELINE LIVE E2E VERIFICATION COMPLETED SUCCESSFULLY!");
  console.log("==================================================================");
}

runFullPipelineLiveTest().catch((err) => {
  console.error("FATAL PIPELINE VERIFICATION ERROR:", err);
  process.exit(1);
});
