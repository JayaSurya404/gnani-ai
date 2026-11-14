/**
 * VoiceNexus AI — Webhook Staff Notification Adapter
 * Dispatches secure signed HTTP POST webhooks to external business systems (Slack, Teams, CRM).
 * Includes HMAC-SHA256 signature generation, verification, and duplicate replay protection.
 */

import crypto from "crypto";
import type { StaffNotificationAdapter } from "./adapter-interface";
import type { StaffNotificationPayload, StaffNotificationResult } from "../types";

export interface WebhookAdapterOptions {
  mockMode?: boolean;
  timeoutMs?: number;
  signingSecret?: string;
}

export class WebhookReplayProtector {
  private seenIds: Map<string, number> = new Map();
  private maxAgeMs: number;

  constructor(maxAgeMs = 300_000) {
    this.maxAgeMs = maxAgeMs;
  }

  public isReplay(id: string): boolean {
    const now = Date.now();
    this.prune(now);
    if (this.seenIds.has(id)) {
      return true;
    }
    this.seenIds.set(id, now);
    return false;
  }

  private prune(now: number): void {
    for (const [id, timestamp] of this.seenIds.entries()) {
      if (now - timestamp > this.maxAgeMs) {
        this.seenIds.delete(id);
      }
    }
  }

  public clear(): void {
    this.seenIds.clear();
  }
}

export const defaultWebhookReplayProtector = new WebhookReplayProtector();

/**
 * Verifies an HMAC-SHA256 signature from a VoiceNexus webhook payload.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  currentTimestamp?: number;
}): { valid: boolean; reason?: string } {
  const {
    rawBody,
    signatureHeader,
    secret,
    toleranceSeconds = 300,
    currentTimestamp = Math.floor(Date.now() / 1000)
  } = params;

  if (!signatureHeader || !secret) {
    return { valid: false, reason: "Missing signature header or secret" };
  }

  let receivedHash: string | null = null;
  let timestamp: number | null = null;

  if (signatureHeader.startsWith("sha256=")) {
    receivedHash = signatureHeader.slice(7);
  } else if (signatureHeader.includes("t=") && signatureHeader.includes("v1=")) {
    const parts = signatureHeader.split(",");
    for (const part of parts) {
      const [k, v] = part.trim().split("=");
      if (k === "t") timestamp = parseInt(v, 10);
      if (k === "v1") receivedHash = v;
    }
  } else {
    receivedHash = signatureHeader;
  }

  if (!receivedHash) {
    return { valid: false, reason: "Unable to parse signature from header" };
  }

  if (timestamp !== null) {
    if (Math.abs(currentTimestamp - timestamp) > toleranceSeconds) {
      return {
        valid: false,
        reason: `Timestamp outside acceptable tolerance window of ${toleranceSeconds}s`
      };
    }
  }

  const signedPayload = timestamp !== null ? `${timestamp}.${rawBody}` : rawBody;
  const expectedHash = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");

  try {
    const expectedBuf = Buffer.from(expectedHash, "hex");
    const receivedBuf = Buffer.from(receivedHash, "hex");
    if (expectedBuf.length !== receivedBuf.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }
    const isValid = crypto.timingSafeEqual(expectedBuf, receivedBuf);
    return isValid ? { valid: true } : { valid: false, reason: "Signature mismatch" };
  } catch (err: unknown) {
    return {
      valid: false,
      reason: `Verification error: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

export class WebhookAdapter implements StaffNotificationAdapter {
  public readonly providerName = "WEBHOOK_ADAPTER";
  private mockMode: boolean;
  private timeoutMs: number;
  private signingSecret?: string;

  constructor(options: WebhookAdapterOptions = {}) {
    this.mockMode = options.mockMode ?? (process.env.NODE_ENV === "test");
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.signingSecret = options.signingSecret;
  }

  public isConfigured(): boolean {
    return true;
  }

  public async send(payload: StaffNotificationPayload): Promise<StaffNotificationResult> {
    const targetUrl = payload.recipient;
    if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
      return {
        success: false,
        provider: this.providerName,
        delivered: false,
        error: `Invalid webhook destination URL: ${targetUrl}`
      };
    }

    if (this.mockMode) {
      const messageId = `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return {
        success: true,
        provider: this.providerName,
        providerMessageId: messageId,
        delivered: true
      };
    }

    try {
      const secret = this.signingSecret || process.env.WEBHOOK_SIGNING_SECRET || "voicenexus-webhook-secret";
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        event: payload.eventType,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        callSessionId: payload.callSessionId,
        organizationId: payload.organizationId,
        leadId: payload.leadId,
        timestamp: new Date().toISOString()
      });

      const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VoiceNexus-Signature": `sha256=${signature}`,
          "X-VoiceNexus-Timestamp": String(timestamp)
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          success: false,
          provider: this.providerName,
          delivered: false,
          error: `Webhook returned HTTP ${res.status}: ${res.statusText}`
        };
      }

      return {
        success: true,
        provider: this.providerName,
        providerMessageId: `webhook-delivery-${Date.now()}`,
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
