import twilio from "twilio";
import type { StaffNotificationAdapter } from "./adapter-interface";
import type { StaffNotificationPayload, StaffNotificationResult } from "../types";

export interface WhatsAppSendOptions {
  recipient: string; // e.g. "+919876543210" or "whatsapp:+919876543210"
  message: string;
  mediaUrl?: string[];
  statusCallback?: string;
  isSandbox?: boolean;
}

export interface WhatsAppSendResult {
  success: boolean;
  provider: string;
  messageSid?: string;
  status?: string;
  error?: string;
  isSandboxRestriction?: boolean;
}

export class TwilioWhatsAppAdapter implements StaffNotificationAdapter {
  public readonly providerName = "TWILIO_WHATSAPP";
  private client: twilio.Twilio | null = null;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || "+14155238886";

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client && this.fromNumber);
  }

  /**
   * Dispatches WhatsApp message to customer or staff member
   */
  public async sendDirect(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    if (!this.client) {
      return {
        success: false,
        provider: this.providerName,
        error: "Twilio WhatsApp credentials unconfigured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing).",
      };
    }

    let to = options.recipient.trim();
    if (!to.startsWith("whatsapp:")) {
      to = `whatsapp:${to}`;
    }

    let from = this.fromNumber.trim();
    if (!from.startsWith("whatsapp:")) {
      from = `whatsapp:${from}`;
    }

    try {
      const appUrl =
        process.env.TWILIO_WEBHOOK_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "https://voicenexus.app";
      const statusCallback = options.statusCallback || `${appUrl}/api/whatsapp/status`;

      const msg = await this.client.messages.create({
        from,
        to,
        body: options.message,
        mediaUrl: options.mediaUrl,
        statusCallback,
      });

      return {
        success: true,
        provider: this.providerName,
        messageSid: msg.sid,
        status: msg.status,
      };
    } catch (err: unknown) {
      console.error("[TwilioWhatsAppAdapter] Failed to send WhatsApp message:", err);
      const twErr = err as { code?: number; message?: string };
      const isSandboxRestriction =
        twErr.code === 63016 || // Message failed to send because phone number is not opted in to Sandbox
        twErr.code === 63007 || // Twilio WhatsApp daily sandbox limit
        twErr.code === 63032 || // Template approval required outside 24h window
        (typeof twErr.message === "string" && twErr.message.toLowerCase().includes("sandbox"));

      return {
        success: false,
        provider: this.providerName,
        error: twErr.message || "Failed to send WhatsApp message",
        isSandboxRestriction,
      };
    }
  }

  /**
   * Implements StaffNotificationAdapter send interface
   */
  public async send(payload: StaffNotificationPayload): Promise<StaffNotificationResult> {
    const formattedMessage = `*${payload.title}*\n\n${payload.message}\n\n_Priority: ${payload.severity}_`;
    const res = await this.sendDirect({
      recipient: payload.recipient,
      message: formattedMessage,
    });

    return {
      success: res.success,
      provider: this.providerName,
      providerMessageId: res.messageSid,
      delivered: res.success,
      error: res.error,
    };
  }
}
