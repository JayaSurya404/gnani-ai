/**
 * VoiceNexus AI — Business Automation Orchestrator
 * Coordinates rule evaluation, atomic execution, action-level idempotency,
 * retry backoff, dead-letter transitions, and audit tracking in public.automation_runs.
 */

import {
  type AutomationRule,
  type AutomationActionItem,
  type CallAutomationContext,
  type AutomationRunResult,
  type ActionResult,
  buildActionIdempotencyKey
} from "./types";
import { evaluateAutomationRule } from "./rule-engine";
import { ActionExecutor } from "./action-executor";
import type { DbQueryRunner } from "@/lib/workers/call-analysis-worker";
import type { AutomationRunStatus } from "@/types/database";

export const DEFAULT_ENTERPRISE_RULES: Array<Omit<AutomationRule, "id" | "organizationId">> = [
  {
    title: "Qualified Solar Lead Consultation Task",
    triggerEvent: "LEAD_QUALIFIED",
    triggerConditions: {
      minScore: 45
    },
    actionType: "CREATE_FOLLOW_UP_TASK",
    actionConfig: {
      taskTitleTemplate: "Solar Consultation & Site Survey: {{customer_name}}",
      taskPriority: "HIGH",
      dueInHours: 6
    },
    priority: 10,
    status: "ACTIVE"
  },
  {
    title: "Customer Requested Callback Scheduling",
    triggerEvent: "CALLBACK_REQUESTED",
    triggerConditions: {},
    actionType: "SCHEDULE_CALLBACK",
    actionConfig: {
      callbackReasonTemplate: "Follow-up consultation requested by {{customer_name}}",
      defaultDueHours: 24,
      taskPriority: "HIGH"
    },
    priority: 20,
    status: "ACTIVE"
  },
  {
    title: "Urgent Supervisor Escalation Follow-up",
    triggerEvent: "ESCALATION_REQUESTED",
    triggerConditions: {},
    actionType: "CREATE_FOLLOW_UP_TASK",
    actionConfig: {
      taskTitleTemplate: "URGENT: Supervisor Review Required for {{customer_name}}",
      taskPriority: "HIGH",
      dueInHours: 2
    },
    priority: 5,
    status: "ACTIVE"
  },
  {
    title: "Internal Sales Alert on High Intent Lead",
    triggerEvent: "HIGH_INTENT_DETECTED",
    triggerConditions: {
      minScore: 75
    },
    actionType: "NOTIFY_INTERNAL_STAFF",
    actionConfig: {
      notificationChannel: "CONSOLE",
      recipientStaffContact: "sales-leads-channel",
      alertTemplate: "🔥 High Intent Lead Alert: {{customer_name}} scored {{business_outcome}}!",
      severity: "CRITICAL"
    },
    priority: 15,
    status: "ACTIVE"
  },
  {
    title: "Draft Personalized Customer WhatsApp Proposal",
    triggerEvent: "LEAD_QUALIFIED",
    triggerConditions: {
      requireConsent: true
    },
    actionType: "GENERATE_WHATSAPP_DRAFT",
    actionConfig: {
      whatsappTemplateKey: "solar_estimate_v1"
    },
    priority: 30,
    status: "ACTIVE"
  },
  {
    title: "Do-Not-Call Lead Status Synchronization",
    triggerEvent: "DISPOSITION_EQUALS",
    triggerConditions: {
      disposition: "DO_NOT_CALL"
    },
    actionType: "UPDATE_LEAD_STATUS",
    actionConfig: {
      targetLeadStatus: "DO_NOT_CALL"
    },
    priority: 1,
    status: "ACTIVE"
  }
];

export class AutomationOrchestrator {
  private db: DbQueryRunner;
  private executor: ActionExecutor;

  constructor(db: DbQueryRunner) {
    this.db = db;
    this.executor = new ActionExecutor(db);
  }

  /**
   * Executes business automations for a completed call session.
   * Dispatches and tracks each action with action-level idempotency and audit logs.
   */
  public async executeForSession(
    context: CallAutomationContext
  ): Promise<AutomationRunResult[]> {
    const results: AutomationRunResult[] = [];
    const { organizationId, callSessionId } = context;
    const analysisVersion = context.analysisVersion || 1;

    // 1. Fetch active rules for the organization
    let rules = await this.fetchActiveRules(organizationId);

    // If organization has no rules configured, seed default enterprise rules
    if (rules.length === 0) {
      rules = await this.seedDefaultRules(organizationId);
    }

    // Sort by priority (lowest number = highest priority)
    rules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    // 2. Evaluate each rule
    for (const rule of rules) {
      // Check rule trigger & conditions first
      const evalResult = evaluateAutomationRule(rule, context);
      if (!evalResult.matches) {
        continue;
      }

      // Determine action items: support both multi-action rules and single action rules
      const actions: AutomationActionItem[] =
        rule.actions && rule.actions.length > 0
          ? rule.actions
          : rule.actionType
            ? [
                {
                  actionId: "default",
                  actionType: rule.actionType,
                  actionConfig: rule.actionConfig || {}
                }
              ]
            : [];

      for (let i = 0; i < actions.length; i++) {
        const actionItem = actions[i];
        const actionIdentifier = actionItem.actionId || (actions.length > 1 ? `action-${i + 1}` : "default");
        const t0 = Date.now();

        // Action-level idempotency key:
        // auto:${callSessionId}:${ruleId}:${actionType}:${actionIdentifier}:v${analysisVersion}
        const idempotencyKey = buildActionIdempotencyKey({
          callSessionId,
          ruleId: rule.id,
          actionType: actionItem.actionType,
          actionIdentifier,
          analysisVersion
        });

        // Check if already completed in public.automation_runs
        const existingRunRes = await this.db.query<{
          id: string;
          status: AutomationRunStatus;
          result_metadata: Record<string, unknown>;
        }>(
          `SELECT id, status, result_metadata FROM public.automation_runs
           WHERE idempotency_key = $1;`,
          [idempotencyKey]
        );

        const existingRun = existingRunRes.rows[0];

        if (existingRun && (existingRun.status === "COMPLETED" || existingRun.status === "SKIPPED_DNC")) {
          // Idempotency: Already completed; skip to avoid duplicate action
          results.push({
            ruleId: rule.id,
            ruleTitle: rule.title,
            actionType: actionItem.actionType,
            idempotencyKey,
            status: existingRun.status,
            result: existingRun.result_metadata as unknown as ActionResult,
            durationMs: Date.now() - t0
          });
          continue;
        }

        // Record start of processing in automation_runs
        await this.db.query(
          `INSERT INTO public.automation_runs (
             organization_id,
             call_session_id,
             automation_id,
             idempotency_key,
             status,
             attempt_count,
             started_at,
             available_at
           ) VALUES ($1, $2, $3, $4, 'PROCESSING', 1, NOW(), NOW())
           ON CONFLICT (idempotency_key) DO UPDATE SET
             status = 'PROCESSING',
             attempt_count = public.automation_runs.attempt_count + 1,
             started_at = NOW(),
             updated_at = NOW();`,
          [organizationId, callSessionId, rule.id, idempotencyKey]
        );

        try {
          // Execute the action with strict safety guardrails
          const actionResult = await this.executor.executeAction(rule, context, actionItem, idempotencyKey);

          let finalStatus: AutomationRunStatus = "COMPLETED";
          if (actionResult.skipped && actionResult.skipReason?.includes("Do-Not-Call")) {
            finalStatus = "SKIPPED_DNC";
          } else if (!actionResult.success) {
            finalStatus = "FAILED";
          }

          // Atomically update status in automation_runs
          await this.db.query(
            `UPDATE public.automation_runs
             SET status = $1,
                 last_error = CASE WHEN $1 = 'FAILED' THEN $4 ELSE last_error END,
                 result_metadata = $2,
                 completed_at = CASE WHEN $1 IN ('COMPLETED', 'SKIPPED_DNC') THEN NOW() ELSE completed_at END,
                 available_at = CASE WHEN $1 = 'FAILED' THEN NOW() + (60 * POWER(2, GREATEST(0, attempt_count - 1)) || ' seconds')::INTERVAL ELSE available_at END,
                 updated_at = NOW()
             WHERE idempotency_key = $3;`,
            [finalStatus, JSON.stringify(actionResult), idempotencyKey, actionResult.error || null]
          );

          results.push({
            ruleId: rule.id,
            ruleTitle: rule.title,
            actionType: actionItem.actionType,
            idempotencyKey,
            status: finalStatus,
            result: actionResult,
            durationMs: Date.now() - t0
          });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Record failure and schedule exponential retry backoff
          await this.db.query(
            `UPDATE public.automation_runs
             SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'FAILED' END,
                 last_error = $1,
                 available_at = NOW() + (60 * POWER(2, GREATEST(0, attempt_count - 1)) || ' seconds')::INTERVAL,
                 updated_at = NOW()
             WHERE idempotency_key = $2;`,
            [errorMsg, idempotencyKey]
          );

          results.push({
            ruleId: rule.id,
            ruleTitle: rule.title,
            actionType: actionItem.actionType,
            idempotencyKey,
            status: "FAILED",
            result: {
              actionType: actionItem.actionType,
              success: false,
              error: errorMsg
            },
            durationMs: Date.now() - t0
          });
        }
      }
    }

    return results;
  }

  /**
   * Fetches active automation rules for an organization.
   */
  private async fetchActiveRules(organizationId: string): Promise<AutomationRule[]> {
    const res = await this.db.query<{
      id: string;
      organization_id: string;
      title: string;
      trigger_event: string;
      trigger_conditions: Record<string, unknown>;
      action_type: string;
      action_config: Record<string, unknown>;
      status: string;
    }>(
      `SELECT id, organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status
       FROM public.automations
       WHERE organization_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at ASC;`,
      [organizationId]
    );

    return res.rows.map((r) => {
      const config = (r.action_config || {}) as Record<string, unknown>;
      return {
        id: r.id,
        organizationId: r.organization_id,
        title: r.title,
        triggerEvent: r.trigger_event as AutomationRule["triggerEvent"],
        triggerConditions: (r.trigger_conditions || {}) as AutomationRule["triggerConditions"],
        actionType: r.action_type as AutomationRule["actionType"],
        actionConfig: config as AutomationRule["actionConfig"],
        actions: Array.isArray(config.actions) ? (config.actions as AutomationActionItem[]) : undefined,
        status: r.status as "ACTIVE" | "PAUSED"
      };
    });
  }

  /**
   * Seeds default enterprise rules for an organization if empty.
   */
  private async seedDefaultRules(organizationId: string): Promise<AutomationRule[]> {
    const seededRules: AutomationRule[] = [];

    for (const def of DEFAULT_ENTERPRISE_RULES) {
      const insertRes = await this.db.query<{ id: string }>(
        `INSERT INTO public.automations (
           organization_id,
           title,
           trigger_event,
           trigger_conditions,
           action_type,
           action_config,
           status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING id;`,
        [
          organizationId,
          def.title,
          def.triggerEvent,
          JSON.stringify(def.triggerConditions),
          def.actionType,
          JSON.stringify(def.actionConfig)
        ]
      );

      seededRules.push({
        id: insertRes.rows[0].id,
        organizationId,
        ...def
      });
    }

    return seededRules;
  }

  /**
   * Approves a customer-facing notification dispatch (human-in-the-loop requirement).
   */
  public async approveCustomerNotification(options: {
    dispatchId: string;
    approvedByUserId: string;
    targetStatus?: "APPROVED" | "QUEUED" | "DELIVERED";
  }): Promise<{ success: boolean; status: string; error?: string }> {
    const { dispatchId, approvedByUserId, targetStatus = "APPROVED" } = options;

    const dispatchRes = await this.db.query<{
      id: string;
      status: string;
      audience: string;
      channel: string;
      consent_verified: boolean;
    }>(
      `SELECT id, status, audience, channel, consent_verified
       FROM public.notification_dispatches
       WHERE id = $1;`,
      [dispatchId]
    );

    if (dispatchRes.rows.length === 0) {
      return { success: false, status: "NOT_FOUND", error: "Notification dispatch not found" };
    }

    const dispatch = dispatchRes.rows[0];

    if (!dispatch.consent_verified) {
      return {
        success: false,
        status: "CONSENT_NOT_VERIFIED",
        error: "Cannot approve notification: customer WhatsApp consent is not verified"
      };
    }

    await this.db.query(
      `UPDATE public.notification_dispatches
       SET status = $1,
           approved_by = $2,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $3;`,
      [targetStatus, approvedByUserId, dispatchId]
    );

    return {
      success: true,
      status: targetStatus
    };
  }
}
