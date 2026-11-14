import { NextResponse } from "next/server";
import { TwilioWhatsAppAdapter } from "@/lib/automations/notification-adapters/whatsapp-twilio-adapter";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recipient, message } = body;

    if (!recipient || !message) {
      return NextResponse.json(
        { success: false, error: "Recipient and message are required" },
        { status: 400 }
      );
    }

    const adapter = new TwilioWhatsAppAdapter();
    const result = await adapter.sendDirect({
      recipient,
      message,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageSid: result.messageSid,
        status: result.status,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          isSandboxRestriction: result.isSandboxRestriction,
        },
        { status: result.isSandboxRestriction ? 403 : 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
