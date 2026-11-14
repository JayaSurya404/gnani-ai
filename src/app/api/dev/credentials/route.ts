import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  const email = process.env.DEV_COMPANY_EMAIL || "";
  const password = process.env.DEV_COMPANY_PASSWORD || "";

  if (!email || !password) {
    return NextResponse.json({ success: false, error: "No dev credentials configured" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    email,
    password,
  });
}
