import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Returns shared project demonstration credentials for Kaveri Solar & Construction Owner.
 * Powered by server-only environment variables DEV_COMPANY_EMAIL and DEV_COMPANY_PASSWORD.
 */
export async function GET() {
  if (process.env.OWNER_CREDENTIAL_FILL_ENABLED === "false") {
    return new Response(null, { status: 404 });
  }

  const email = process.env.DEV_COMPANY_EMAIL || "";
  const password = process.env.DEV_COMPANY_PASSWORD || "";

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Demo credentials are not configured on this server." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { success: true, email, password },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

export async function POST() {
  return GET();
}
