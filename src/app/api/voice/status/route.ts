import { NextResponse } from "next/server";
import { getOfficialVoices } from "@/lib/voice-profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const gnaniKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const groqKey = process.env.GROQ_API_KEY || "";
  const gatewayHttpUrl = process.env.NEXT_PUBLIC_VOICE_GATEWAY_URL || "http://localhost:8080";

  let gatewayStatus = "OFFLINE";
  let gatewayDetails = null;

  try {
    const res = await fetch(`${gatewayHttpUrl}/api/diagnostic`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      gatewayStatus = "ONLINE";
      gatewayDetails = await res.json();
    }
  } catch {
    // Gateway not responding or unreachable
    gatewayStatus = "STANDBY";
  }

  return NextResponse.json({
    voiceGateway: {
      status: gatewayStatus,
      wsUrl: process.env.NEXT_PUBLIC_VOICE_GATEWAY_WS_URL || "ws://localhost:8080",
      details: gatewayDetails,
    },
    providers: {
      gnani: {
        configured: Boolean(gnaniKey),
        keyLength: gnaniKey ? gnaniKey.length : 0,
        sttEndpoint: "wss://api.vachana.ai/stt/v3/stream",
        ttsEndpoint: "wss://api.vachana.ai/api/v1/tts",
        models: {
          stt: ["prisma-v3.0", "prisma-v2.5"],
          tts: ["timbre-v2.5", "timbre-v3.0"],
        },
      },
      llm: {
        configured: Boolean(geminiKey || groqKey),
        activeProvider: geminiKey ? "GEMINI" : groqKey ? "GROQ" : "UNCONFIGURED_RULE_BASED",
        model: geminiKey
          ? "gemini-2.5-flash"
          : groqKey
          ? "llama-3.3-70b-versatile"
          : "deterministic-domain-engine",
      },
    },
    supportedVoices: getOfficialVoices().map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      languageCode: v.languageCode,
      gender: v.gender,
      model: v.model,
      voiceType: v.voiceType,
      providerVoiceId: v.providerVoiceId,
      consentRef: v.consent.consentRef,
    })),
    timestamp: new Date().toISOString(),
  });
}

