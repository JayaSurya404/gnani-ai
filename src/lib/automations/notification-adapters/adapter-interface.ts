/**
 * VoiceNexus AI — Internal Staff Notification Adapter Interface
 */

import type { StaffNotificationPayload, StaffNotificationResult } from "../types";

export interface StaffNotificationAdapter {
  readonly providerName: string;
  isConfigured(): boolean;
  send(payload: StaffNotificationPayload): Promise<StaffNotificationResult>;
}

