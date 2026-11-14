import { z } from "zod";

// =====================================================================
// VoiceNexus <-> LeadNexus Canonical Integration Contracts
// Protocol Version: voicenexus-integration-v1
// =====================================================================

export const INTEGRATION_PROTOCOL_VERSION = "voicenexus-integration-v1";

// ---------------------------------------------------------------------
// 1. FORWARD HANDOFF CONTRACT: LeadNexus -> VoiceNexus
// ---------------------------------------------------------------------

export const leadNexusHandoffSchema = z.object({
  schemaVersion: z.literal("1.0"),
  event: z.literal("LEAD_HANDOFF_REQUESTED"),
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  business: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
  }),
  lead: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    phone: z.string().min(8),
    email: z.string().email().optional().nullable(),
    temperature: z.enum(["HOT", "WARM", "COLD"]).default("WARM"),
    status: z.enum([
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "FOLLOW_UP",
      "CONVERTED",
      "LOST",
      "DO_NOT_CALL",
    ]).default("NEW"),
    score: z.number().int().min(0).max(100).default(50),
    source: z.string().default("LeadNexus"),
    primaryInterest: z.string().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    productSku: z.string().optional().nullable(),
    productName: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    doNotCall: z.boolean().default(false),
    createdAt: z.string().datetime().optional(),
    attribution: z.object({
      utmSource: z.string().optional().nullable(),
      utmMedium: z.string().optional().nullable(),
      utmCampaign: z.string().optional().nullable(),
      dwellTimeSeconds: z.number().int().min(0).optional(),
      hasInteractedWithCalculator: z.boolean().optional(),
      monthlyBill: z.string().optional().nullable(),
      systemSize: z.string().optional().nullable(),
    }).optional(),
  }),
});

export type LeadNexusHandoffPayload = z.infer<typeof leadNexusHandoffSchema>;

// ---------------------------------------------------------------------
// 2. REVERSE SYNC CONTRACT: VoiceNexus -> LeadNexus
// ---------------------------------------------------------------------

export const callEventTypeEnum = z.enum([
  "CALL_INITIATED",
  "CALL_RINGING",
  "CALL_ANSWERED",
  "CALL_COMPLETED",
  "CALL_FAILED",
  "CALL_NO_ANSWER",
  "CALL_BUSY",
  "CALL_ANALYSIS_COMPLETED",
  "FOLLOW_UP_CREATED",
]);

export type CallEventType = z.infer<typeof callEventTypeEnum>;

export const voiceNexusCallEventSchema = z.object({
  schemaVersion: z.literal("1.0"),
  event: callEventTypeEnum,
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().optional(),
  }),
  business: z.object({
    id: z.string().uuid(),
    name: z.string().optional(),
    slug: z.string().optional(),
  }),
  lead: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
    status: z.string().optional(),
  }),
  call: z.object({
    callSessionId: z.string().uuid(),
    twilioCallSid: z.string().optional().nullable(),
    direction: z.enum(["OUTBOUND", "INBOUND"]).default("OUTBOUND"),
    status: z.string(),
    durationSeconds: z.number().int().min(0).default(0),
    startedAt: z.string().datetime().optional().nullable(),
    endedAt: z.string().datetime().optional().nullable(),
    language: z.string().default("ta-IN"),
    voice: z.string().default("Asmita"),
    recordingUrl: z.string().optional().nullable(),
  }),
  outcome: z.object({
    disposition: z.string().optional().nullable(),
    sentiment: z.string().optional().nullable(),
    businessOutcome: z.string().optional().nullable(),
    qualificationDecision: z.string().optional().nullable(),
    confidenceScore: z.number().min(0).max(1).optional().nullable(),
    summary: z.string().optional().nullable(),
    keyPoints: z.array(z.string()).optional(),
    actionItems: z.array(z.string()).optional(),
    followUpRecommended: z.boolean().optional(),
  }).optional().nullable(),
  followUp: z.object({
    taskId: z.string().uuid().optional(),
    title: z.string(),
    description: z.string().optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  }).optional().nullable(),
});

export type VoiceNexusCallEventPayload = z.infer<typeof voiceNexusCallEventSchema>;

