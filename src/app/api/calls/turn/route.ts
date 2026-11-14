import { NextRequest, NextResponse } from "next/server";
import { processVoiceTurn, VoiceTurnRequest } from "@/lib/voice-agent-runtime";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    const limit = checkRateLimit(`call_turn:${ip}`, 60, 60);

    if (!limit.allowed) {
      return NextResponse.json({ success: false, error: "Too many conversational turns" }, { status: 429 });
    }

    const body: VoiceTurnRequest = await req.json().catch(() => null);
    if (!body || !body.userMessage) {
      return NextResponse.json({ success: false, error: "Missing user message" }, { status: 400 });
    }

    const response = processVoiceTurn(body);

    return NextResponse.json({
      success: true,
      turn: response,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

