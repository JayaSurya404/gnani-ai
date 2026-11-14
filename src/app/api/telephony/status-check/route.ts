import { NextResponse } from "next/server";
import twilio from "twilio";

export const dynamic = "force-dynamic";

export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const voiceNumber = process.env.TWILIO_VOICE_NUMBER;
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || "+14155238886";
  const voiceGatewayWsUrl =
    process.env.VOICE_GATEWAY_WS_URL ||
    process.env.NEXT_PUBLIC_VOICE_GATEWAY_WS_URL ||
    "wss://gateway.voicenexus.app/ws/twilio";

  const isConfigured = Boolean(accountSid && authToken && voiceNumber);

  if (!isConfigured) {
    return NextResponse.json({
      configured: false,
      accountSidConfigured: Boolean(accountSid),
      authTokenConfigured: Boolean(authToken),
      voiceNumberConfigured: Boolean(voiceNumber),
      whatsappNumberConfigured: Boolean(whatsappNumber),
      voiceNumber: voiceNumber ? `${voiceNumber.slice(0, 4)}...${voiceNumber.slice(-4)}` : null,
      whatsappNumber,
      voiceGatewayWsUrl,
      accountType: "UNCONFIGURED",
      trialRestrictions: {
        mediaStreamsRestrictedOnTrial: true,
        unverifiedRecipientsBlocked: true,
        whatsappSandboxRequiresOptIn: true,
      },
    });
  }

  // Attempt live Twilio account inquiry
  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.v2010.accounts(accountSid!).fetch();

    const isTrial = account.type.toLowerCase() === "trial";

    return NextResponse.json({
      configured: true,
      accountSidConfigured: true,
      authTokenConfigured: true,
      voiceNumberConfigured: true,
      whatsappNumberConfigured: true,
      accountFriendlyName: account.friendlyName,
      accountType: account.type, // "Trial" or "Full"
      accountStatus: account.status, // "active", etc.
      isTrial,
      voiceNumber,
      whatsappNumber,
      voiceGatewayWsUrl,
      trialRestrictions: {
        mediaStreamsRestrictedOnTrial: isTrial,
        unverifiedRecipientsBlocked: isTrial,
        whatsappSandboxRequiresOptIn: true,
        explanation: isTrial
          ? "Twilio Free Trial accounts do not support bidirectional WebSocket media streams (<Stream>) or calling unverified numbers. Paid account upgrade with payment method is required for live bidirectional telephone conversations."
          : "Full account: bidirectional live calling and international routing enabled.",
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Failed to query Twilio account API";
    return NextResponse.json({
      configured: true,
      accountSidConfigured: true,
      authTokenConfigured: true,
      voiceNumberConfigured: true,
      whatsappNumberConfigured: true,
      voiceNumber,
      whatsappNumber,
      voiceGatewayWsUrl,
      error: errMsg,
      accountType: "ERROR",
      trialRestrictions: {
        mediaStreamsRestrictedOnTrial: true,
        unverifiedRecipientsBlocked: true,
        whatsappSandboxRequiresOptIn: true,
      },
    });
  }
}
