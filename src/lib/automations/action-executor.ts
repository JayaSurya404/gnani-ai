/**
 * VoiceNexus AI — Action Execution Engine
 * Executes automation actions with strict DNC suppression, escalation preservation,
 * duplicate prevention, and transactional persistence.
 */

import type {
  AutomationRule,
  AutomationActionItem,
  ActionConfig,
  CallAutomationContext,
  ActionResult
} from "./types";
import { extractCallbackScheduling, buildCallbackTaskPayload } from "./callback-scheduler";
import { generateCustomerWhatsAppDraft } from "./whatsapp-draft-generator";
import { getStaffNotificationAdapter } from "./notification-adapters";
import type { DbQueryRunner } from "@/lib/workers/call-analysis-worker";
import type { LeadStatus } from "@/types/database";

export class ActionExecutor {
  private db: DbQueryRunner;

  constructor(db: DbQueryRunner) {
    this.db = db;
  }

  /**
   * Executes a matched automation action with mandatory defense-in-depth safeguards.
   */
  public async executeAction(
    rule: AutomationRule,
    context: CallAutomationContext,
    actionItem?: AutomationActionItem,
    idempotencyKey?: string
  ): Promise<ActionResult> {
    const actionType = actionItem?.actionType || rule.actionType!;
    const actionConfig: ActionConfig = actionItem?.actionConfig || rule.actionConfig || {};
    const { analysis, lead } = context;

    // =========================================================================
    // DEFENSE-IN-DEPTH SAFEGUARD 1: DNC Preemption
    // =========================================================================
    const isDnc =
      analysis.complianceState === "DNC_REQUESTED" ||
      analysis.complianceState === "DNC_REGISTERED" ||
      lead?.do_not_call === true;

    const isEscalation =
      analysis.escalationState === "REQUESTED" ||
      analysis.escalationState === "FOLLOW_UP_PENDING" ||
      rule.triggerEvent === "ESCALATION_REQUESTED" ||
      rule.triggerEvent === "CUSTOMER_REQUESTS_HUMAN";

    // Promotional marketing actions are strictly prohibited under DNC
    if (isDnc) {
      if (
        actionType === "GENERATE_WHATSAPP_DRAFT" ||
        actionType === "SCHEDULE_CALLBACK" ||
        (actionType === "CREATE_FOLLOW_UP_TASK" && !isEscalation) ||
        (actionType === "UPDATE_LEAD_STATUS" && actionConfig.targetLeadStatus !== "DO_NOT_CALL")
      ) {
        return {
          actionType,
          success: true,
          skipped: true,
          skipReason: "Action prohibited by Do-Not-Call (DNC) regulatory compliance rules."
        };
      }
    }

    // =========================================================================
    // EXECUTE SPECIFIC ACTION
    // =========================================================================
    switch (actionType) {
      case "CREATE_FOLLOW_UP_TASK":
        return this.executeCreateFollowUpTask(rule, context, actionConfig, idempotencyKey);

      case "SCHEDULE_CALLBACK":
        return this.executeScheduleCallback(rule, context, actionConfig, idempotencyKey);

      case "UPDATE_LEAD_STATUS":
        return this.executeUpdateLeadStatus(rule, context, actionConfig);

      case "NOTIFY_INTERNAL_STAFF":
        return this.executeNotifyInternalStaff(rule, context, actionConfig, idempotencyKey);

      case "GENERATE_WHATSAPP_DRAFT":
        return this.executeGenerateWhatsAppDraft(rule, context, actionConfig, idempotencyKey);

      case "WEBHOOK_DISPATCH":
        return this.executeWebhookDispatch(rule, context, actionConfig);

      default:
        return {
          actionType,
          success: false,
          error: `Unsupported action type: ${actionType}`
        };
    }
  }

  /**
   * ACTION 1: CREATE_FOLLOW_UP_TASK
   */
  private async executeCreateFollowUpTask(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig,
    idempotencyKey?: string
  ): Promise<ActionResult> {
    const { organizationId, callSessionId, leadId, customerName, analysis } = context;

    // Stable action-level tag
    const taskTag = idempotencyKey ? `[Idempotency: ${idempotencyKey}]` : `[Rule: ${rule.id}]`;

    // Check for duplicate task for this call session and action
    const existingTask = await this.db.query<{ id: string }>(
      `SELECT id FROM public.follow_up_tasks
       WHERE call_session_id = $1 AND organization_id = $2 AND description LIKE $3
       LIMIT 1;`,
      [callSessionId, organizationId, `%${taskTag}%`]
    );

    if (existingTask.rows.length > 0) {
      return {
        actionType: "CREATE_FOLLOW_UP_TASK",
        success: true,
        skipped: true,
        skipReason: "Task already created for this session and rule (duplicate prevention)",
        createdTaskId: existingTask.rows[0].id
      };
    }

    // Resolve title and description with grounded evidence
    const title = (config.taskTitleTemplate || "Follow up with {{customer_name}}")
      .replace(/{{customer_name}}/g, customerName);

    const isEscalation =
      analysis.escalationState === "REQUESTED" ||
      analysis.escalationState === "FOLLOW_UP_PENDING";

    const priority = isEscalation ? "HIGH" : (config.taskPriority || "MEDIUM");
    const dueHours = config.dueInHours || (isEscalation ? 2 : 24);
    const dueDate = new Date(Date.now() + dueHours * 60 * 60 * 1000).toISOString();

    const groundedNotes = [
      taskTag,
      `[Rule: ${rule.id}] ${rule.title}`,
      `Outcome: ${analysis.businessOutcome} | Escalation: ${analysis.escalationState}`,
      `Summary: ${analysis.summary}`
    ];

    if (analysis.intelligenceData.customerRequirements?.length) {
      groundedNotes.push(`Requirements: ${analysis.intelligenceData.customerRequirements.map((r) => r.value).join(", ")}`);
    }

    if (analysis.intelligenceData.budget?.exactQuote) {
      groundedNotes.push(`Budget Quote: "${analysis.intelligenceData.budget.exactQuote}"`);
    }

    const description = groundedNotes.join("\n");

    const insertRes = await this.db.query<{ id: string }>(
      `INSERT INTO public.follow_up_tasks (
         organization_id,
         lead_id,
         call_session_id,
         assigned_to,
         title,
         description,
         due_date,
         priority,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
       RETURNING id;`,
      [
        organizationId,
        leadId || null,
        callSessionId,
        config.assignedToUserId || null,
        title,
        description,
        dueDate,
        priority
      ]
    );

    return {
      actionType: "CREATE_FOLLOW_UP_TASK",
      success: true,
      createdTaskId: insertRes.rows[0]?.id
    };
  }

  /**
   * ACTION 2: SCHEDULE_CALLBACK
   */
  private async executeScheduleCallback(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig,
    idempotencyKey?: string
  ): Promise<ActionResult> {
    const { organizationId, callSessionId, leadId } = context;

    const extraction = extractCallbackScheduling(context, config.defaultDueHours || 24);

    if (extraction.scheduleStatus === "SUPPRESSED_DNC") {
      return {
        actionType: "SCHEDULE_CALLBACK",
        success: true,
        skipped: true,
        skipReason: "Callback scheduling suppressed: caller is registered on Do-Not-Call (DNC)"
      };
    }

    if (!extraction.isRequested) {
      return {
        actionType: "SCHEDULE_CALLBACK",
        success: true,
        skipped: true,
        skipReason: "Callback scheduling skipped: customer did not request a callback in call evidence"
      };
    }

    // Stable action-level tag
    const callbackTag = idempotencyKey ? `[Idempotency: ${idempotencyKey}]` : `[Rule: ${rule.id}]`;

    // Check for duplicate callback task
    const existingCallback = await this.db.query<{ id: string }>(
      `SELECT id FROM public.follow_up_tasks
       WHERE call_session_id = $1 AND organization_id = $2 AND description LIKE $3
       LIMIT 1;`,
      [callSessionId, organizationId, `%${callbackTag}%`]
    );

    if (existingCallback.rows.length > 0) {
      return {
        actionType: "SCHEDULE_CALLBACK",
        success: true,
        skipped: true,
        skipReason: "Callback task already scheduled for this call session",
        scheduledCallbackId: existingCallback.rows[0].id
      };
    }

    const payload = buildCallbackTaskPayload(context, extraction, {
      priority: config.taskPriority || "MEDIUM",
      reasonTemplate: config.callbackReasonTemplate,
      assignedTo: config.assignedToUserId
    });

    const description = `${callbackTag}\n${payload.description}`;

    const insertRes = await this.db.query<{ id: string }>(
      `INSERT INTO public.follow_up_tasks (
         organization_id,
         lead_id,
         call_session_id,
         assigned_to,
         title,
         description,
         due_date,
         priority,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
       RETURNING id;`,
      [
        organizationId,
        leadId || null,
        callSessionId,
        payload.assignedTo,
        payload.title,
        description,
        payload.dueDate,
        payload.priority
      ]
    );

    return {
      actionType: "SCHEDULE_CALLBACK",
      success: true,
      scheduledCallbackId: insertRes.rows[0]?.id,
      metadata: {
        scheduleStatus: extraction.scheduleStatus,
        requestedTime: extraction.requestedTime,
        resolvedDueDate: extraction.resolvedDueDate,
        unresolvedSchedulingNotes: extraction.unresolvedSchedulingNotes
      }
    };
  }

  /**
   * ACTION 3: UPDATE_LEAD_STATUS
   */
  private async executeUpdateLeadStatus(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig
  ): Promise<ActionResult> {
    const { leadId, organizationId, analysis, lead } = context;
    const targetStatus = config.targetLeadStatus || "QUALIFIED";

    if (!leadId) {
      return {
        actionType: "UPDATE_LEAD_STATUS",
        success: true,
        skipped: true,
        skipReason: "No lead associated with call session; skipped lead status update"
      };
    }

    // Preservation rule: If lead is already marked DO_NOT_CALL, never overwrite to another status
    if (lead?.do_not_call && targetStatus !== "DO_NOT_CALL") {
      return {
        actionType: "UPDATE_LEAD_STATUS",
        success: true,
        skipped: true,
        skipReason: "Lead is already registered DO_NOT_CALL; cannot downgrade compliance state"
      };
    }

    const isDnc =
      targetStatus === "DO_NOT_CALL" ||
      analysis.complianceState === "DNC_REQUESTED" ||
      analysis.complianceState === "DNC_REGISTERED";

    await this.db.query(
      `UPDATE public.leads
       SET status = $1,
           do_not_call = CASE WHEN $2 = TRUE THEN TRUE ELSE do_not_call END,
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4;`,
      [targetStatus, isDnc, leadId, organizationId]
    );

    return {
      actionType: "UPDATE_LEAD_STATUS",
      success: true,
      updatedLeadStatus: targetStatus as LeadStatus
    };
  }

  /**
   * ACTION 4: NOTIFY_INTERNAL_STAFF
   */
  private async executeNotifyInternalStaff(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig,
    idempotencyKey?: string
  ): Promise<ActionResult> {
    const { organizationId, callSessionId, leadId, customerName, analysis } = context;

    const channel = config.notificationChannel || "CONSOLE";
    const adapter = getStaffNotificationAdapter(channel);

    const title = `[VoiceNexus Alert] ${rule.title} - ${customerName}`;
    const message = (config.alertTemplate || "Call {{call_session_id}} completed with outcome {{business_outcome}}")
      .replace(/{{customer_name}}/g, customerName)
      .replace(/{{call_session_id}}/g, callSessionId)
      .replace(/{{business_outcome}}/g, analysis.businessOutcome)
      .replace(/{{summary}}/g, analysis.summary);

    const recipient = config.recipientStaffContact || config.recipientStaffId || "staff-alerts";

    // Dispatch via provider adapter
    const dispatchResult = await adapter.send({
      organizationId,
      callSessionId,
      leadId,
      eventType: rule.triggerEvent,
      recipient,
      title,
      message,
      severity: config.severity || "INFO"
    });

    const dispatchStatus = dispatchResult.delivered ? "DELIVERED" : (dispatchResult.success ? "SENT" : "FAILED");
    const notifIdempotencyKey = idempotencyKey ? `notif:${idempotencyKey}` : `notif-staff-${callSessionId}-${rule.id}`;

    // Persist in notification_dispatches
    const insertRes = await this.db.query<{ id: string }>(
      `INSERT INTO public.notification_dispatches (
         organization_id,
         call_session_id,
         lead_id,
         audience,
         channel,
         recipient,
         consent_verified,
         rendered_message,
         status,
         provider,
         provider_message_id,
         idempotency_key,
         error_details,
         sent_at,
         delivered_at
       ) VALUES ($1, $2, $3, 'INTERNAL_STAFF', $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (idempotency_key) DO UPDATE SET
         status = EXCLUDED.status,
         error_details = EXCLUDED.error_details,
         updated_at = NOW()
       RETURNING id;`,
      [
        organizationId,
        callSessionId,
        leadId || null,
        channel === "CONSOLE" ? "EMAIL" : channel, // Schema check constraint
        recipient,
        message,
        dispatchStatus,
        dispatchResult.provider,
        dispatchResult.providerMessageId || null,
        notifIdempotencyKey,
        dispatchResult.error ? JSON.stringify({ error: dispatchResult.error }) : null,
        dispatchResult.success ? new Date().toISOString() : null,
        dispatchResult.delivered ? new Date().toISOString() : null
      ]
    );

    return {
      actionType: "NOTIFY_INTERNAL_STAFF",
      success: dispatchResult.success,
      error: dispatchResult.error,
      notificationDispatchId: insertRes.rows[0]?.id
    };
  }

  /**
   * ACTION 5: GENERATE_WHATSAPP_DRAFT
   */
  private async executeGenerateWhatsAppDraft(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig,
    idempotencyKey?: string
  ): Promise<ActionResult> {
    const { organizationId, callSessionId, leadId, customerPhone } = context;

    const draft = generateCustomerWhatsAppDraft(context, config.whatsappMessageTemplate);

    if (draft.skippedDnc) {
      return {
        actionType: "GENERATE_WHATSAPP_DRAFT",
        success: true,
        skipped: true,
        skipReason: "WhatsApp draft generation suppressed by Do-Not-Call (DNC)"
      };
    }

    if (draft.consentMissing) {
      return {
        actionType: "GENERATE_WHATSAPP_DRAFT",
        success: true,
        skipped: true,
        skipReason: "WhatsApp draft generation blocked: customer has not granted WhatsApp consent"
      };
    }

    const notifIdempotencyKey = idempotencyKey ? `wa:${idempotencyKey}` : `notif-cust-wa-${callSessionId}-${rule.id}`;

    // Persist draft in public.notification_dispatches with status DRAFT_PENDING_APPROVAL
    const insertRes = await this.db.query<{ id: string }>(
      `INSERT INTO public.notification_dispatches (
         organization_id,
         call_session_id,
         lead_id,
         audience,
         channel,
         recipient,
         consent_verified,
         consent_reference,
         rendered_message,
         status,
         provider,
         idempotency_key
       ) VALUES ($1, $2, $3, 'CUSTOMER', 'WHATSAPP', $4, $5, $6, $7, 'DRAFT_PENDING_APPROVAL', 'MOCK_CONSOLE', $8)
       ON CONFLICT (idempotency_key) DO UPDATE SET
         rendered_message = EXCLUDED.rendered_message,
         updated_at = NOW()
       RETURNING id;`,
      [
        organizationId,
        callSessionId,
        leadId || null,
        customerPhone || draft.recipient || "unspecified",
        draft.consentVerified,
        draft.consentReference,
        draft.renderedMessage,
        notifIdempotencyKey
      ]
    );

    return {
      actionType: "GENERATE_WHATSAPP_DRAFT",
      success: true,
      notificationDispatchId: insertRes.rows[0]?.id,
      metadata: {
        language: draft.language,
        status: draft.status,
        requiresHumanApproval: true,
        templateKey: draft.templateKey
      }
    };
  }

  /**
   * ACTION 6: WEBHOOK_DISPATCH
   */
  private async executeWebhookDispatch(
    rule: AutomationRule,
    context: CallAutomationContext,
    config: ActionConfig
  ): Promise<ActionResult> {
    const webhookUrl = config.webhookUrl;

    if (!webhookUrl) {
      return {
        actionType: "WEBHOOK_DISPATCH",
        success: false,
        error: "Missing required webhookUrl in actionConfig"
      };
    }

    const adapter = getStaffNotificationAdapter("WEBHOOK");
    const res = await adapter.send({
      organizationId: context.organizationId,
      callSessionId: context.callSessionId,
      leadId: context.leadId,
      eventType: rule.triggerEvent,
      recipient: webhookUrl,
      title: rule.title,
      message: context.analysis.summary,
      severity: "INFO",
      metadata: {
        outcome: context.analysis.businessOutcome,
        leadScore: context.analysis.leadScoring.totalScore
      }
    });

    return {
      actionType: "WEBHOOK_DISPATCH",
      success: res.success,
      error: res.error
    };
  }
}
