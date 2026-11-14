import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { GATEWAY_CONFIG, getSafeDiagnostic } from "./config.js";
import { BrowserVoiceSession } from "./gateway-session.js";
import { TwilioVoiceSession } from "./twilio-session.js";

export function createGatewayApp() {
  const app = Fastify({
    logger: false,
  });

  // Enable CORS
  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Register WebSocket plugin
  app.register(websocket, {
    options: {
      maxPayload: 10 * 1024 * 1024, // 10MB
    },
  });

  let activeSessionCount = 0;

  // Root / Health
  app.get("/health", async () => {
    return {
      service: "@voicenexus/voice-gateway",
      status: "READY",
      uptime: process.uptime(),
      activeSessions: activeSessionCount,
      timestamp: new Date().toISOString(),
    };
  });

  // Diagnostic Endpoint (Safe, zero credentials exposed)
  app.get("/api/diagnostic", async () => {
    return getSafeDiagnostic();
  });

  // Browser WebSocket Voice Session Route
  app.register(async function (fastify) {
    fastify.get("/ws/browser", { websocket: true }, (socket) => {
      activeSessionCount++;

      // Create new managed session
      new BrowserVoiceSession(socket);

      socket.on("close", () => {
        activeSessionCount = Math.max(0, activeSessionCount - 1);
      });
    });

    // Twilio Bi-directional Media Stream WebSocket Route
    fastify.get("/ws/twilio", { websocket: true }, (socket) => {
      activeSessionCount++;

      // Create new managed Twilio telephony session
      new TwilioVoiceSession(socket);

      socket.on("close", () => {
        activeSessionCount = Math.max(0, activeSessionCount - 1);
      });
    });
  });

  return app;
}

export async function startGateway() {
  const app = createGatewayApp();
  try {
    await app.listen({
      port: GATEWAY_CONFIG.port,
      host: GATEWAY_CONFIG.host,
    });
    console.log(`[VoiceGateway] Persistent Media Gateway online at ws://${GATEWAY_CONFIG.host}:${GATEWAY_CONFIG.port}/ws/browser`);
    return app;
  } catch (err) {
    console.error("[VoiceGateway] Failed to start gateway:", err);
    process.exit(1);
  }
}

// Start if executed directly
if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  startGateway();
}
