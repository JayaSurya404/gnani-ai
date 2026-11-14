/**
 * VoiceNexus AI — Business Automations & Notification Engine Types
 * Provides strict TypeScript definitions and Zod schemas for rule evaluation,
 * actions, triggers, callback scheduling, and multi-channel notifications.
 */

import { z } from "zod";
import type {
  BusinessOutcome,
  ComplianceState,
  SentimentType,
  LeadStatus,
  AutomationRunStatus
} from "@/types/database";
import type { ValidatedCallAnalysisResult } from "@/lib/intelligence/types";

// ============================================================================
// 1. TRIGGER TYPES & SCHEMAS
// ============================================================================

export type AutomationTriggerType =
  | "CALL_COMPLETED"
  | "LEAD_QUALIFIED"
  | "HIGH_INTENT_DETECTED"
  | "CALLBACK_REQUESTED"
  | "UNRESOLVED_OBJECTION"
  | "ESCALATION_REQUESTED"
  | "CUSTOMER_REQUESTS_HUMAN"
  | "LEAD_SCORE_THRESHOLD"
  | "UNANSWERED_QUESTION"
  | "DISPOSITION_EQUALS"; // Backward compatibility

export const AutomationTriggerTypeSchema = z.enum([
  "CALL_COMPLETED",
  "LEAD_QUALIFIED",
  "HIGH_INTENT_DETECTED",
  "CALLBACK_REQUESTED",
  "UNRESOLVED_OBJECTION",
  "ESCALATION_REQUESTED",
  "CUSTOMER_REQUESTS_HUMAN",
  "LEAD_SCORE_THRESHOLD",
  "UNANSWERED_QUESTION",
  "DISPOSITION_EQUALS"
]);

export interface TriggerConditions {
  disposition?: string;
  sentiment?: SentimentType;
  minScore?: number;
  maxScore?: number;
  minConfidence?: number;
  allowedOutcomes?: BusinessOutcome[];
  disallowedCompliance?: ComplianceState[];
  requireConsent?: boolean;
  minBuyingSignals?: number;
  hasUnresolvedUnknowns?: boolean;
  objectionSeverity?: "HIGH" | "MEDIUM" | "LOW";
}

export const TriggerConditionsSchema = z.object({
  disposition: z.string().optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]).optional(),
  minScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().min(0).max(100).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  allowedOutcomes: z.array(z.enum([
    "QUALIFIED",
    "FOLLOW_UP_REQUIRED",
    "NOT_INTERESTED",
    "WRONG_NUMBER",
    "UNRESOLVED",
    "INFORMATIONAL_COMPLETE"
  ])).optional(),
  disallowedCompliance: z.array(z.enum([
    "NONE",
    "DNC_REQUESTED",
    "DNC_REGISTERED",
    "DNC_REGISTRATION_FAILED"
  ])).optional(),
  requireConsent: z.boolean().optional(),
  minBuyingSignals: z.number().min(0).optional(),
  hasUnresolvedUnknowns: z.boolean().optional(),
  objectionSeverity: z.enum(["HIGH", "MEDIUM", "LOW"]).optional()
}).default({});

// ============================================================================
// 2. ACTION TYPES & SCHEMAS
// ============================================================================

export type AutomationActionType =
  | "CREATE_FOLLOW_UP_TASK"
  | "SCHEDULE_CALLBACK"
  | "UPDATE_LEAD_STATUS"
  | "NOTIFY_INTERNAL_STAFF"
  | "GENERATE_WHATSAPP_DRAFT"
  | "WEBHOOK_DISPATCH";

export const AutomationActionTypeSchema = z.enum([
  "CREATE_FOLLOW_UP_TASK",
  "SCHEDULE_CALLBACK",
  "UPDATE_LEAD_STATUS",
  "NOTIFY_INTERNAL_STAFF",
  "GENERATE_WHATSAPP_DRAFT",
  "WEBHOOK_DISPATCH"
]);

export interface ActionConfig {
  // Follow-up Task Config
  taskTitleTemplate?: string;
  taskDescriptionTemplate?: string;
  taskPriority?: "LOW" | "MEDIUM" | "HIGH";
  dueInHours?: number;
  assignedToUserId?: string;

  // Callback Scheduling Config
  callbackReasonTemplate?: string;
  defaultDueHours?: number;
  timezone?: string;

  // Lead Status Config
  targetLeadStatus?: LeadStatus;

  // Internal Staff Notification Config
  notificationChannel?: "WHATSAPP" | "SMS" | "EMAIL" | "CONSOLE";
  recipientStaffId?: string;
  recipientStaffContact?: string;
  alertTemplate?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";

  // WhatsApp Draft Config
  whatsappTemplateKey?: string;
  whatsappMessageTemplate?: string;
  language?: "en" | "ta" | "tanglish";

  // Webhook Config
  webhookUrl?: string;
  webhookSecret?: string;
  headers?: Record<string, string>;
}

export const ActionConfigSchema = z.object({
  taskTitleTemplate: z.string().optional(),
  taskDescriptionTemplate: z.string().optional(),
  taskPriority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueInHours: z.number().min(0).optional(),
  assignedToUserId: z.string().min(1).optional(),

  callbackReasonTemplate: z.string().optional(),
  defaultDueHours: z.number().min(0).optional(),
  timezone: z.string().optional(),

  targetLeadStatus: z.enum([
    "NEW",
    "CONTACTED",
    "QUALIFIED",
    "FOLLOW_UP",
    "CONVERTED",
    "LOST",
    "DO_NOT_CALL"
  ]).optional(),

  notificationChannel: z.enum(["WHATSAPP", "SMS", "EMAIL", "CONSOLE"]).optional(),
  recipientStaffId: z.string().optional(),
  recipientStaffContact: z.string().optional(),
  alertTemplate: z.string().optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),

  whatsappTemplateKey: z.string().optional(),
  whatsappMessageTemplate: z.string().optional(),
  language: z.enum(["en", "ta", "tanglish"]).optional(),

  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional()
}).default({});

export interface AutomationActionItem {
  actionId?: string;
  actionType: AutomationActionType;
  actionConfig: ActionConfig;
}

export const AutomationActionItemSchema = z.object({
  actionId: z.string().min(1).optional(),
  actionType: AutomationActionTypeSchema,
  actionConfig: ActionConfigSchema
});

// ============================================================================
// 3. AUTOMATION RULE ENTITY
// ============================================================================

export interface AutomationRule {
  id: string;
  organizationId: string;
  title: string;
  triggerEvent: AutomationTriggerType;
  triggerConditions: TriggerConditions;
  actionType?: AutomationActionType;
  actionConfig?: ActionConfig;
  actions?: AutomationActionItem[];
  priority?: number; // 1 = highest, defaults to 100
  status: "ACTIVE" | "PAUSED";
  createdAt?: string;
  updatedAt?: string;
}

export const AutomationRuleSchema = z.object({
  id: z.string().min(1).optional(),
  organizationId: z.string().min(1),
  title: z.string().min(3).max(200),
  triggerEvent: AutomationTriggerTypeSchema,
  triggerConditions: TriggerConditionsSchema,
  actionType: AutomationActionTypeSchema.optional(),
  actionConfig: ActionConfigSchema.optional(),
  actions: z.array(AutomationActionItemSchema).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  status: z.enum(["ACTIVE", "PAUSED"]).default("ACTIVE")
}).refine(
  (data) => Boolean(data.actionType || (data.actions && data.actions.length > 0)),
  { message: "Rule must provide either actionType or an array of actions" }
);

// ============================================================================
// 4. EXECUTION CONTEXT & RESULTS
// ============================================================================

export interface CallAutomationContext {
  organizationId: string;
  callSessionId: string;
  analysisVersion?: number; // Defaults to 1 for versioned reanalysis
  leadId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  whatsappConsent?: boolean;
  whatsappConsentReference?: string | null;
  language?: string | null;
  analysis: ValidatedCallAnalysisResult;
  lead?: {
    id: string;
    organization_id: string;
    name: string;
    phone: string;
    status: LeadStatus;
    score: number;
    do_not_call: boolean;
    whatsapp_consent?: boolean;
  } | null;
}

/**
 * Builds a deterministic, stable action-level idempotency key.
 * Distinguishes call session, automation rule, action type, stable action identifier, and analysis version.
 */
export function buildActionIdempotencyKey(params: {
  callSessionId: string;
  ruleId: string;
  actionType: string;
  actionIdentifier?: string;
  analysisVersion?: number;
}): string {
  const { callSessionId, ruleId, actionType, actionIdentifier = "default", analysisVersion = 1 } = params;
  return `auto:${callSessionId}:${ruleId}:${actionType}:${actionIdentifier}:v${analysisVersion}`;
}

export interface ActionResult {
  actionType: AutomationActionType;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  createdTaskId?: string;
  scheduledCallbackId?: string;
  updatedLeadStatus?: LeadStatus;
  notificationDispatchId?: string;
  webhookStatusCode?: number;
  metadata?: Record<string, unknown>;
}

export interface AutomationRunResult {
  ruleId: string;
  ruleTitle: string;
  actionType: AutomationActionType;
  idempotencyKey: string;
  status: AutomationRunStatus;
  result: ActionResult;
  durationMs: number;
}

// ============================================================================
// 5. CALLBACK SCHEDULING TYPES
// ============================================================================

export type CallbackScheduleStatus =
  | "EXACT_TIME"
  | "APPROXIMATE_TIME"
  | "UNSPECIFIED_TIME"
  | "SUPPRESSED_DNC";

export interface CallbackExtractionResult {
  isRequested: boolean;
  scheduleStatus: CallbackScheduleStatus;
  requestedDate?: string | null; // YYYY-MM-DD
  requestedTime?: string | null; // HH:mm:ss
  timezone: string;
  resolvedDueDate: string; // ISO-8601
  unresolvedSchedulingNotes?: string | null;
  evidenceQuote?: string | null;
  evidenceSegmentId?: string | null;
}

// ============================================================================
// 6. NOTIFICATION ADAPTER TYPES
// ============================================================================

export interface StaffNotificationPayload {
  organizationId: string;
  callSessionId: string;
  leadId?: string | null;
  eventType: string;
  recipient: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  metadata?: Record<string, unknown>;
}

export interface StaffNotificationResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  delivered: boolean;
  error?: string;
}
