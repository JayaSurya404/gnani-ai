import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Verify demo access is not explicitly disabled
  const demoEnabled = process.env.DEMO_ACCESS_ENABLED !== "false";
  if (!demoEnabled) {
    return new Response(null, { status: 404 });
  }

  // 2. Client IP rate limiting (15 requests per minute)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const rateLimitKey = `demo_credentials:${clientIp}`;
  const limit = checkRateLimit(rateLimitKey, 15, 60);

  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many credential requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.resetSeconds) },
      }
    );
  }

  const email = process.env.DEMO_EVALUATOR_EMAIL || "preview@voicenexus.ai";
  let password = process.env.DEMO_EVALUATOR_PASSWORD || "VnEval#2026!Preview9845";
  if (!password || password === "VnEval" || password.length < 10) {
    password = "VnEval#2026!Preview9845";
  }

  // Security guard: Never return owner credentials
  if (email.toLowerCase().includes("kaverisolar.in") || email.toLowerCase().includes("admin@")) {
    return NextResponse.json(
      { success: false, error: "Invalid evaluator configuration." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    email,
    password,
  });
}
