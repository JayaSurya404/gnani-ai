/**
 * VoiceNexus AI — Callback Scheduling Engine
 * Extracts scheduling intents from post-call evidence without hallucinating exact times.
 * Supports exact time, approximate time (e.g. "tomorrow evening"), and handles DNC suppression.
 */

import type {
  CallAutomationContext,
  CallbackExtractionResult,
  CallbackScheduleStatus
} from "./types";

export interface ScheduledCallbackTaskPayload {
  organizationId: string;
  leadId?: string | null;
  callSessionId: string;
  assignedTo?: string | null;
  title: string;
  description: string;
  dueDate: string; // ISO-8601
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING";
  scheduleStatus: CallbackScheduleStatus;
  unresolvedSchedulingNotes?: string | null;
}

/**
 * Extracts callback scheduling details strictly from validated post-call evidence.
 */
export function extractCallbackScheduling(
  context: CallAutomationContext,
  defaultDueHours = 24
): CallbackExtractionResult {
  const { analysis, lead } = context;

  // 1. Strict DNC Preemption: never schedule a callback for a DNC caller
  if (
    analysis.complianceState === "DNC_REQUESTED" ||
    analysis.complianceState === "DNC_REGISTERED" ||
    lead?.do_not_call === true
  ) {
    return {
      isRequested: false,
      scheduleStatus: "SUPPRESSED_DNC",
      timezone: "Asia/Kolkata",
      resolvedDueDate: new Date().toISOString(),
      unresolvedSchedulingNotes: "Callback strictly prohibited: customer registered Do-Not-Call (DNC)"
    };
  }

  // 2. Locate timeline or scheduling evidence in post-call data
  const timelineClaim = analysis.intelligenceData.purchaseTimeline;
  const quote = timelineClaim?.exactQuote || "";
  const quoteLower = quote.toLowerCase();

  const isCallbackRequested =
    analysis.businessOutcome === "FOLLOW_UP_REQUIRED" ||
    quoteLower.includes("call") ||
    quoteLower.includes("contact") ||
    quoteLower.includes("reach") ||
    Boolean(analysis.intelligenceData.recommendedNextAction?.value?.toLowerCase().includes("call"));

  const now = new Date();

  // 3. Check for approximate time expressions ("evening", "morning", "afternoon", "tomorrow evening")
  const isApproximateTime =
    quoteLower.includes("evening") ||
    quoteLower.includes("morning") ||
    quoteLower.includes("afternoon") ||
    quoteLower.includes("sometime") ||
    quoteLower.includes("later this week") ||
    quoteLower.includes("next week");

  // Check for explicit time patterns like "4 pm", "10:30 am", "16:00"
  const exactTimeMatch = quoteLower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);

  if (exactTimeMatch) {
    // Exact time extracted from evidence
    const hourRaw = parseInt(exactTimeMatch[1], 10);
    const minute = exactTimeMatch[2] ? parseInt(exactTimeMatch[2], 10) : 0;
    const meridiem = exactTimeMatch[3].toLowerCase();
    let hour = hourRaw;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // default tomorrow
    dueDate.setHours(hour, minute, 0, 0);

    return {
      isRequested: true,
      scheduleStatus: "EXACT_TIME",
      requestedDate: dueDate.toISOString().slice(0, 10),
      requestedTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      timezone: "Asia/Kolkata",
      resolvedDueDate: dueDate.toISOString(),
      unresolvedSchedulingNotes: null,
      evidenceQuote: quote,
      evidenceSegmentId: timelineClaim?.evidenceSegmentIds?.[0] || null
    };
  }

  if (isApproximateTime) {
    // DO NOT hallucinate an exact hour! Mark as APPROXIMATE_TIME.
    const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow baseline
    dueDate.setHours(9, 0, 0, 0); // Standard start of business day window

    return {
      isRequested: true,
      scheduleStatus: "APPROXIMATE_TIME",
      requestedDate: dueDate.toISOString().slice(0, 10),
      requestedTime: null, // Left null to avoid hallucinated exact hour
      timezone: "Asia/Kolkata",
      resolvedDueDate: dueDate.toISOString(),
      unresolvedSchedulingNotes: `Customer requested approximate time window: "${quote}". Exact callback time was unstated.`,
      evidenceQuote: quote,
      evidenceSegmentId: timelineClaim?.evidenceSegmentIds?.[0] || null
    };
  }

  // Unspecified time window (default due in hours)
  const defaultDueDate = new Date(now.getTime() + defaultDueHours * 60 * 60 * 1000);

  return {
    isRequested: isCallbackRequested,
    scheduleStatus: "UNSPECIFIED_TIME",
    requestedDate: null,
    requestedTime: null,
    timezone: "Asia/Kolkata",
    resolvedDueDate: defaultDueDate.toISOString(),
    unresolvedSchedulingNotes: isCallbackRequested ? "Callback requested without explicit date or time stated." : null,
    evidenceQuote: quote || null,
    evidenceSegmentId: timelineClaim?.evidenceSegmentIds?.[0] || null
  };
}

/**
 * Builds the follow_up_tasks row payload for a callback request.
 */
export function buildCallbackTaskPayload(
  context: CallAutomationContext,
  extraction: CallbackExtractionResult,
  options: {
    priority?: "LOW" | "MEDIUM" | "HIGH";
    reasonTemplate?: string;
    assignedTo?: string | null;
  } = {}
): ScheduledCallbackTaskPayload {
  const { customerName, callSessionId, organizationId, leadId, analysis } = context;

  const defaultReason = analysis.summary || "Customer requested follow-up callback.";
  const reason = options.reasonTemplate
    ? options.reasonTemplate.replace(/{{customer_name}}/g, customerName)
    : `Callback for ${customerName}: ${defaultReason}`;

  let noteSection = "";
  if (extraction.scheduleStatus === "APPROXIMATE_TIME") {
    noteSection = `\n[Scheduling Note: APPROXIMATE TIME WINDOW — ${extraction.unresolvedSchedulingNotes}]`;
  } else if (extraction.scheduleStatus === "EXACT_TIME") {
    noteSection = `\n[Scheduled Exact Time: ${extraction.requestedTime} ${extraction.timezone}]`;
  }

  if (extraction.evidenceQuote) {
    noteSection += `\n[Customer Quote: "${extraction.evidenceQuote}"]`;
  }

  return {
    organizationId,
    leadId: leadId || null,
    callSessionId,
    assignedTo: options.assignedTo || null,
    title: `Scheduled Callback: ${customerName}`,
    description: `${reason}${noteSection}`,
    dueDate: extraction.resolvedDueDate,
    priority: options.priority || "MEDIUM",
    status: "PENDING",
    scheduleStatus: extraction.scheduleStatus,
    unresolvedSchedulingNotes: extraction.unresolvedSchedulingNotes
  };
}

