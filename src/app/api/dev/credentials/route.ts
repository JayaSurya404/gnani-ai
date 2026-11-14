import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison to prevent timing-attack side-channels
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to equalize execution time and prevent length leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET() {
  // GET is restricted in production
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  const email = process.env.DEV_COMPANY_EMAIL || "";
  const password = process.env.DEV_COMPANY_PASSWORD || "";

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "No dev credentials configured" }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, email, password },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export async function POST(req: NextRequest) {
  // 1. Feature flag guard
  const isEnabled = process.env.OWNER_CREDENTIAL_FILL_ENABLED === "true" || process.env.NODE_ENV !== "production";
  if (!isEnabled || process.env.OWNER_CREDENTIAL_FILL_ENABLED === "false") {
    return new Response(null, { status: 404 });
  }

  // 2. Sliding window rate limiting (10 attempts per minute per IP)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const rateLimitKey = `owner_credential_unlock:${clientIp}`;
  const limit = checkRateLimit(rateLimitKey, 10, 60);

  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many unlock attempts. Please wait a moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.resetSeconds),
          "Cache-Control": "no-store, no-cache",
        },
      }
    );
  }

  // 3. Parse payload
  const body = await req.json().catch(() => null);
  const submittedKey = typeof body?.key === "string" ? body.key.trim() : "";

  // 4. Constant-time key verification
  const expectedKey = process.env.OWNER_CREDENTIAL_FILL_KEY || "";
  if (!expectedKey) {
    return new Response(null, { status: 404 });
  }

  const isValid = timingSafeEqualStr(submittedKey, expectedKey);
  if (!isValid) {
    return NextResponse.json(
      { success: false, error: "Invalid administrator access key. Access denied." },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  // 5. Retrieve existing Owner credentials from server-only environment
  const email = process.env.DEV_COMPANY_EMAIL || "";
  const password = process.env.DEV_COMPANY_PASSWORD || "";

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Owner credentials are not configured on this server." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Return Owner credentials securely with Cache-Control: no-store
  return NextResponse.json(
    {
      success: true,
      email,
      password,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
