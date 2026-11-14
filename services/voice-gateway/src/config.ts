import { config as loadDotenv } from "node:process";
import * as fs from "node:fs";
import * as path from "node:path";

// Load .env.local from project root if present
function loadEnv() {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      break;
    }
  }
}

loadEnv();

export interface VoiceGatewayConfig {
  port: number;
  host: string;
  gnaniApiKey: string;
  prismaWsUrl: string;
  timbreWsUrl: string;
  voiceGatewaySecret: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  llmProvider: "AUTO" | "GROQ" | "GEMINI";
}

export const GATEWAY_CONFIG: VoiceGatewayConfig = {
  port: parseInt(process.env.VOICE_GATEWAY_PORT || process.env.PORT || "8080", 10),
  host: process.env.VOICE_GATEWAY_HOST || "0.0.0.0",
  gnaniApiKey: process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY || "",
  prismaWsUrl: process.env.GNANI_PRISMA_WS_URL || "wss://api.vachana.ai/stt/v3/stream",
  timbreWsUrl: process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts",
  voiceGatewaySecret: process.env.VOICE_GATEWAY_SECRET || "voicenexus_gateway_default_dev_secret",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  llmProvider: (process.env.LLM_PROVIDER as "AUTO" | "GROQ" | "GEMINI") || "AUTO",
};

export function getSafeDiagnostic() {
  const activeLlm = GATEWAY_CONFIG.groqApiKey
    ? "GROQ"
    : GATEWAY_CONFIG.geminiApiKey
    ? "GEMINI"
    : "UNCONFIGURED_RULE_BASED";
  const activeModel = GATEWAY_CONFIG.groqApiKey
    ? GATEWAY_CONFIG.groqModel
    : GATEWAY_CONFIG.geminiApiKey
    ? GATEWAY_CONFIG.geminiModel
    : "deterministic-turn-orchestrator";

  return {
    gateway: {
      port: GATEWAY_CONFIG.port,
      host: GATEWAY_CONFIG.host,
      service: "@voicenexus/voice-gateway",
      status: "ONLINE",
    },
    providers: {
      gnani: {
        configured: GATEWAY_CONFIG.gnaniApiKey.length > 0,
        keyLength: GATEWAY_CONFIG.gnaniApiKey.length,
        prismaWsUrl: GATEWAY_CONFIG.prismaWsUrl,
        timbreWsUrl: GATEWAY_CONFIG.timbreWsUrl,
        models: {
          stt: ["prisma-v3.0", "prisma-v2.5"],
          tts: ["timbre-v2.5", "timbre-v3.0"],
        },
      },
      llm: {
        configured: Boolean(GATEWAY_CONFIG.geminiApiKey || GATEWAY_CONFIG.groqApiKey),
        activeProvider: activeLlm,
        model: activeModel,
      },
      supabase: {
        configured: Boolean(GATEWAY_CONFIG.supabaseUrl && GATEWAY_CONFIG.supabaseServiceKey),
      },
    },
    timestamp: new Date().toISOString(),
  };
}

