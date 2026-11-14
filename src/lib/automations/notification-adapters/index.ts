/**
 * VoiceNexus AI — Notification Adapters Registry
 */

import { MockConsoleAdapter } from "./mock-console-adapter";
import { EmailAdapter } from "./email-adapter";
import { WhatsAppStaffAdapter } from "./whatsapp-staff-adapter";
import { WebhookAdapter } from "./webhook-adapter";
import type { StaffNotificationAdapter } from "./adapter-interface";

export * from "./adapter-interface";
export * from "./mock-console-adapter";
export * from "./email-adapter";
export * from "./whatsapp-staff-adapter";
export * from "./whatsapp-twilio-adapter";
export * from "./webhook-adapter";

export function getStaffNotificationAdapter(channel: string): StaffNotificationAdapter {
  switch (channel.toUpperCase()) {
    case "EMAIL":
      return new EmailAdapter();
    case "WHATSAPP":
      return new WhatsAppStaffAdapter();
    case "WEBHOOK":
      return new WebhookAdapter();
    case "CONSOLE":
    default:
      return new MockConsoleAdapter();
  }
}

