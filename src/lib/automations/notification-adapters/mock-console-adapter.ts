/**
 * VoiceNexus AI — Mock Console Staff Notification Adapter
 * Safe default adapter for development, staging, and automated test environments.
 */

import type { StaffNotificationAdapter } from "./adapter-interface";
import type { StaffNotificationPayload, StaffNotificationResult } from "../types";

export class MockConsoleAdapter implements StaffNotificationAdapter {
  public readonly providerName = "MOCK_CONSOLE";

  public isConfigured(): boolean {
    return true;
  }

  public async send(payload: StaffNotificationPayload): Promise<StaffNotificationResult> {
    const messageId = `mock-console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Structured audit logging
    if (process.env.NODE_ENV !== "test") {
      console.log(`[MockConsoleAdapter] Staff Alert Dispatched [${payload.severity}] -> ${payload.recipient}:`, {
        title: payload.title,
        message: payload.message,
        eventType: payload.eventType,
        callSessionId: payload.callSessionId,
        messageId
      });
    }

    return {
      success: true,
      provider: this.providerName,
      providerMessageId: messageId,
      delivered: true
    };
  }
}

