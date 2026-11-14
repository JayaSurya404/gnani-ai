/**
 * VoiceNexus AI — Internal Staff WhatsApp Notification Adapter
 * Dispatches operational alerts to internal sales / supervisor WhatsApp groups.
 */

import type { StaffNotificationAdapter } from "./adapter-interface";
import type { StaffNotificationPayload, StaffNotificationResult } from "../types";

export interface WhatsAppStaffAdapterOptions {
  mockMode?: boolean;
}

export class WhatsAppStaffAdapter implements StaffNotificationAdapter {
  public readonly providerName = "WHATSAPP_STAFF_ADAPTER";
  private mockMode: boolean;

  constructor(options: WhatsAppStaffAdapterOptions = {}) {
    this.mockMode = options.mockMode ?? (process.env.NODE_ENV === "test" || !process.env.STAFF_WHATSAPP_WEBHOOK);
  }

  public isConfigured(): boolean {
    return this.mockMode || Boolean(process.env.STAFF_WHATSAPP_WEBHOOK || process.env.TWILIO_WHATSAPP_NUMBER);
  }

  public async send(payload: StaffNotificationPayload): Promise<StaffNotificationResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.providerName,
        delivered: false,
        error: "Staff WhatsApp provider not configured (missing STAFF_WHATSAPP_WEBHOOK)"
      };
    }

    if (this.mockMode) {
      const messageId = `wa-staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        success: true,
        provider: this.providerName,
        providerMessageId: messageId,
        delivered: true
      };
    }

    try {
      const webhookUrl = process.env.STAFF_WHATSAPP_WEBHOOK!;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: payload.recipient,
          title: payload.title,
          message: payload.message,
          severity: payload.severity,
          callSessionId: payload.callSessionId
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return {
        success: true,
        provider: this.providerName,
        providerMessageId: `wa-live-${Date.now()}`,
        delivered: true
      };
    } catch (err: unknown) {
      return {
        success: false,
        provider: this.providerName,
        delivered: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}

