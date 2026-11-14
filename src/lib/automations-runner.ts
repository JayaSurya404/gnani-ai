/**
 * VoiceNexus AI — Business Automations Engine
 * Evaluates triggers on post-call outcomes and orchestrates owner-approved follow-up tasks,
 * CRM status progression, and draft notification generation.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { StructuredCallOutcome } from "./post-call-analyzer";

export interface AutomationRule {
  id: string;
  organizationId: string;
  title: string;
  triggerEvent: string; // e.g. "CALL_COMPLETED" | "DISPOSITION_EQUALS"
  triggerConditions: {
    disposition?: string;
    sentiment?: string;
    scoreThreshold?: number;
  };
  actionType: "CREATE_FOLLOW_UP_TASK" | "UPDATE_LEAD_STATUS" | "DISPATCH_NOTIFICATION";
  actionConfig: {
    taskTitleTemplate?: string;
    taskPriority?: "LOW" | "MEDIUM" | "HIGH";
    dueInHours?: number;
    targetLeadStatus?: string;
    notificationChannel?: "WHATSAPP" | "SMS" | "EMAIL";
    notificationTemplate?: string;
  };
  status: "ACTIVE" | "PAUSED";
}

export interface AutomationExecutionResult {
  automationId: string;
  title: string;
  actionExecuted: string;
  createdTaskId?: string;
  updatedLeadStatus?: string;
  dispatchedNotification?: {
    channel: string;
    recipient: string;
    message: string;
    status: "DRAFT_PENDING_APPROVAL";
  };
}

export const DEFAULT_BUSINESS_AUTOMATIONS: Array<Omit<AutomationRule, "id" | "organizationId">> = [
  {
    title: "Instant Solar Proposal Task on Interested Lead",
    triggerEvent: "DISPOSITION_EQUALS",
    triggerConditions: { disposition: "INTERESTED" },
    actionType: "CREATE_FOLLOW_UP_TASK",
    actionConfig: {
      taskTitleTemplate: "Dispatch 3D Solar Proposal & Book Roof Survey for {{customer_name}}",
      taskPriority: "HIGH",
      dueInHours: 6,
    },
    status: "ACTIVE",
  },
  {
    title: "Senior Engineer Escalation Callback within 2 Hours",
    triggerEvent: "DISPOSITION_EQUALS",
    triggerConditions: { disposition: "ESCALATED" },
    actionType: "CREATE_FOLLOW_UP_TASK",
    actionConfig: {
      taskTitleTemplate: "URGENT: Senior Technical Specialist Callback for {{customer_name}}",
      taskPriority: "HIGH",
      dueInHours: 2,
    },
    status: "ACTIVE",
  },
  {
    title: "Strict Do-Not-Call Removal & Lead Disqualification",
    triggerEvent: "DISPOSITION_EQUALS",
    triggerConditions: { disposition: "DO_NOT_CALL" },
    actionType: "UPDATE_LEAD_STATUS",
    actionConfig: {
      targetLeadStatus: "DO_NOT_CALL",
    },
    status: "ACTIVE",
  },
  {
    title: "Draft WhatsApp Subsidy Estimate for Qualified Prospects",
    triggerEvent: "DISPOSITION_EQUALS",
    triggerConditions: { disposition: "INTERESTED" },
    actionType: "DISPATCH_NOTIFICATION",
    actionConfig: {
      notificationChannel: "WHATSAPP",
      notificationTemplate:
        "Hello {{customer_name}}, thank you for speaking with Kaveri Solar & Construction. Your quotation and government subsidy estimate has been prepared. Review your proposal here: {{proposal_link}}",
    },
    status: "ACTIVE",
  },
];

export async function executeAutomationsForCall(
  supabase: SupabaseClient,
  context: {
    organizationId: string;
    callSessionId: string;
    leadId?: string;
    customerName: string;
    customerPhone?: string;
    outcome: StructuredCallOutcome;
  }
): Promise<AutomationExecutionResult[]> {
  const results: AutomationExecutionResult[] = [];
  const { organizationId, callSessionId, leadId, customerName, customerPhone, outcome } = context;

  // 1. Fetch active automations for the organization
  const { data: dbAutomations } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE");

  let activeRules: AutomationRule[] = (dbAutomations || []).map((a) => ({
    id: a.id,
    organizationId: a.organization_id,
    title: a.title,
    triggerEvent: a.trigger_event,
    triggerConditions: a.trigger_conditions || {},
    actionType: a.action_type as AutomationRule["actionType"],
    actionConfig: a.action_config || {},
    status: a.status as "ACTIVE" | "PAUSED",
  }));

  // If organization has no automations, provision defaults
  if (activeRules.length === 0) {
    const toInsert = DEFAULT_BUSINESS_AUTOMATIONS.map((tpl) => ({
      organization_id: organizationId,
      title: tpl.title,
      trigger_event: tpl.triggerEvent,
      trigger_conditions: tpl.triggerConditions,
      action_type: tpl.actionType,
      action_config: tpl.actionConfig,
      status: "ACTIVE",
    }));

    const { data: seeded } = await supabase.from("automations").insert(toInsert).select();
    if (seeded) {
      activeRules = seeded.map((a) => ({
        id: a.id,
        organizationId: a.organization_id,
        title: a.title,
        triggerEvent: a.trigger_event,
        triggerConditions: a.trigger_conditions || {},
        actionType: a.action_type as AutomationRule["actionType"],
        actionConfig: a.action_config || {},
        status: a.status as "ACTIVE" | "PAUSED",
      }));
    }
  }

  // 2. Evaluate each rule
  for (const rule of activeRules) {
    let matches = false;

    if (rule.triggerEvent === "DISPOSITION_EQUALS") {
      matches = rule.triggerConditions.disposition === outcome.disposition;
    } else if (rule.triggerEvent === "CALL_COMPLETED") {
      matches = true;
    }

    if (!matches) continue;

    // Execute Action A: Create Follow-up Task
    if (rule.actionType === "CREATE_FOLLOW_UP_TASK") {
      const title = (rule.actionConfig.taskTitleTemplate || "Follow up with {{customer_name}}")
        .replace(/{{customer_name}}/g, customerName);
      
      const dueHours = rule.actionConfig.dueInHours || 24;
      const dueDate = new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString();

      const { data: task } = await supabase
        .from("follow_up_tasks")
        .insert({
          organization_id: organizationId,
          lead_id: leadId || null,
          call_session_id: callSessionId,
          title,
          description: `Generated by automation "${rule.title}". Call disposition: ${outcome.disposition}. Summary: ${outcome.summary}`,
          priority: rule.actionConfig.taskPriority || "MEDIUM",
          status: "PENDING",
          due_date: dueDate,
        })
        .select()
        .single();

      results.push({
        automationId: rule.id,
        title: rule.title,
        actionExecuted: "CREATE_FOLLOW_UP_TASK",
        createdTaskId: task?.id,
      });
    }

    // Execute Action B: Update Lead Status
    if (rule.actionType === "UPDATE_LEAD_STATUS" && leadId) {
      const targetStatus = rule.actionConfig.targetLeadStatus || "QUALIFIED";
      await supabase
        .from("leads")
        .update({
          status: targetStatus,
          ...(targetStatus === "DO_NOT_CALL" ? { do_not_call: true } : {}),
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      results.push({
        automationId: rule.id,
        title: rule.title,
        actionExecuted: "UPDATE_LEAD_STATUS",
        updatedLeadStatus: targetStatus,
      });
    }

    // Execute Action C: Dispatch Draft Notification (strictly suppressed for DO_NOT_CALL)
    if (rule.actionType === "DISPATCH_NOTIFICATION") {
      if (outcome.disposition === "DO_NOT_CALL") {
        results.push({
          automationId: rule.id,
          title: rule.title,
          actionExecuted: "SKIPPED_DNC_SUPPRESSION",
        });
        continue;
      }

      const channel = rule.actionConfig.notificationChannel || "WHATSAPP";
      const message = (rule.actionConfig.notificationTemplate || "Hello {{customer_name}}, proposal ready.")
        .replace(/{{customer_name}}/g, customerName)
        .replace(/{{proposal_link}}/g, `https://voicenexus.ai/p/quote-${callSessionId.slice(0, 8)}`);

      results.push({
        automationId: rule.id,
        title: rule.title,
        actionExecuted: "DISPATCH_NOTIFICATION",
        dispatchedNotification: {
          channel,
          recipient: customerPhone || "+91 98400 12345",
          message,
          status: "DRAFT_PENDING_APPROVAL",
        },
      });
    }
  }

  return results;
}

// Re-export modern Milestone 7.3 automation engine
export * from "./automations/types";
export * from "./automations/rule-engine";
export * from "./automations/action-executor";
export * from "./automations/callback-scheduler";
export * from "./automations/whatsapp-draft-generator";
export * from "./automations/notification-adapters";
export * from "./automations/automation-orchestrator";


