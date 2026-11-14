import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionContext();
  return NextResponse.json({
    success: true,
    userId: session.userId,
    email: session.email,
    role: session.role,
    organizationId: session.organizationId,
  });
}
