import crypto from "crypto";
import { signIntegrationRequest } from "./signing";
import {
  CallEventType,
  VoiceNexusCallEventPayload,
  voiceNexusCallEventSchema,
} from "./contract";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DispatchCallEventOptions {
  event: CallEventType;
  organizationId: string;
  businessId?: string;
  leadId: string;
  customerName: string;
  customerPhone: string;
  callSessionId: string;
  twilioCallSid?: string | null;
  direction?: "OUTBOUND" | "INBOUND";
  status: string;
  durationSeconds?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  language?: string;
  voice?: string;
  recordingUrl?: string | null;
  outcome?: {
    disposition?: string | null;
    sentiment?: string | null;
    businessOutcome?: string | null;
    qualificationDecision?: string | null;
    confidenceScore?: number | null;
    summary?: string | null;
    keyPoints?: string[];
    actionItems?: string[];
    followUpRecommended?: boolean;
  } | null;
  followUp?: {
    taskId?: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  } | null;
}

export async function dispatchCallEventToLeadNexus(options: DispatchCallEventOptions): Promise<{
  success: boolean;
  eventId: string;
  deliveredLocally: boolean;
  deliveredRemotely: boolean;
  error?: string;
}> {
  const eventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const payload: VoiceNexusCallEventPayload = {
    schemaVersion: "1.0",
    event: options.event,
    eventId,
    timestamp,
    organization: {
      id: options.organizationId,
    },
    business: {
      id: options.businessId || options.organizationId,
    },
    lead: {
      id: options.leadId,
      name: options.customerName,
      phone: options.customerPhone,
      status: options.status,
    },
    call: {
      callSessionId: options.callSessionId,
      twilioCallSid: options.twilioCallSid || null,
      direction: options.direction || "OUTBOUND",
      status: options.status,
      durationSeconds: options.durationSeconds || 0,
      startedAt: options.startedAt || null,
      endedAt: options.endedAt || null,
      language: options.language || "ta-IN",
      voice: options.voice || "Asmita",
      recordingUrl: options.recordingUrl || null,
    },
    outcome: options.outcome || null,
    followUp: options.followUp || null,
  };

  // Validate payload against schema
  const validation = voiceNexusCallEventSchema.safeParse(payload);
  if (!validation.success) {
    console.error("[ReverseSync] Invalid call event payload:", validation.error.format());
    return {
      success: false,
      eventId,
      deliveredLocally: false,
      deliveredRemotely: false,
      error: "Payload validation failed",
    };
  }

  let deliveredLocally = false;
  let deliveredRemotely = false;

  // 1. Local Database Persistence (public.lead_events)
  try {
    const supabase = createAdminClient();
    if (supabase) {
      let eventTitle = `AI Phone Call: ${options.event.replace(/_/g, " ")}`;
      if (options.event === "CALL_INITIATED") {
        eventTitle = `Outbound Call Initiated (${options.language || "ta-IN"})`;
      } else if (options.event === "CALL_ANSWERED") {
        eventTitle = "Call Answered by Customer";
      } else if (options.event === "CALL_COMPLETED") {
        eventTitle = `Call Completed (${options.durationSeconds || 0}s duration)`;
      } else if (options.event === "CALL_ANALYSIS_COMPLETED") {
        eventTitle = `Post-Call Intelligence Analysis (${options.outcome?.disposition || "Resolved"})`;
      } else if (options.event === "FOLLOW_UP_CREATED") {
        eventTitle = `Follow-Up Scheduled: ${options.followUp?.title || "Pending"}`;
      }

      let description = options.outcome?.summary || `Telephony status: ${options.status}`;
      if (options.event === "CALL_FAILED" || options.event === "CALL_NO_ANSWER" || options.event === "CALL_BUSY") {
        description = `Call did not connect. Disposition: ${options.event}. Scheduled for retry.`;
      }

      await supabase.from("lead_events").insert({
        organization_id: options.organizationId,
        lead_id: options.leadId,
        event_type: options.event,
        title: eventTitle,
        description,
        metadata: {
          eventId,
          callSessionId: options.callSessionId,
          twilioCallSid: options.twilioCallSid,
          durationSeconds: options.durationSeconds,
          disposition: options.outcome?.disposition,
          sentiment: options.outcome?.sentiment,
          businessOutcome: options.outcome?.businessOutcome,
          recordingUrl: options.recordingUrl,
          followUp: options.followUp,
        },
      } as never);

      deliveredLocally = true;
    }
  } catch (localErr) {
    console.warn("[ReverseSync] Local lead_event insert failed:", localErr);
  }

  // 2. Dispatch to Remote / API Webhook if configured
  const remoteUrl = process.env.LEADNEXUS_WEBHOOK_URL;
  const secret =
    process.env.VOICENEXUS_SHARED_SECRET ||
    process.env.LEADNEXUS_SHARED_SECRET ||
    "voicenexus-local-dev-secret-333";

  if (remoteUrl) {
    try {
      const endpoint = `${remoteUrl.replace(/\/$/, "")}/api/v1/integrations/leadnexus/events`;
      const rawBody = JSON.stringify(payload);
      const urlObj = new URL(endpoint);
      const signed = signIntegrationRequest({
        rawBody,
        secret,
        method: "POST",
        path: urlObj.pathname,
        requestId: eventId,
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: signed.headers,
        body: rawBody,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        deliveredRemotely = true;
      } else {
        console.warn(`[ReverseSync] Remote webhook returned HTTP ${response.status}`);
      }
    } catch (remoteErr) {
      console.warn("[ReverseSync] Remote webhook dispatch failed:", remoteErr);
    }
  }

  return {
    success: deliveredLocally || deliveredRemotely,
    eventId,
    deliveredLocally,
    deliveredRemotely,
  };
}

