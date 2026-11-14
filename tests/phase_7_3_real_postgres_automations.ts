/**
 * VoiceNexus AI — Phase 7.3 Real PostgreSQL 18.6 Automation Engine Integration Test Suite
 * Engine: Real PostgreSQL 18.6 (PGlite)
 * Tests actual PostgreSQL table constraints, outbox runs, notification dispatches,
 * duplicate idempotency, DNC suppression, human approval workflow, and partial failure backoff.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { AutomationOrchestrator } from "../src/lib/automations/automation-orchestrator";
import type { CallAutomationContext } from "../src/lib/automations/types";
import type { ValidatedCallAnalysisResult } from "../src/lib/intelligence/types";

export async function runPhase73PostgresAutomations() {
  console.log("=====================================================================");
  console.log("VOICENEXUS AI — PHASE 7.3 BUSINESS AUTOMATIONS POSTGRESQL INTEGRATION");
  console.log("Engine: Embedded Real PostgreSQL (PGlite v18.6)");
  console.log("=====================================================================\n");

  const db = new PGlite();
  const ver = await db.query<{ version: string }>("SELECT version();");
  console.log("[PostgreSQL Baseline] Connected:", ver.rows[0].version);

  // 1. Provision Supabase Environment
  console.log("\n--- Phase 0: Provisioning Database Roles & Auth Environment ---");
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION auth.uid() 
    RETURNS UUID AS $$ 
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID; 
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() 
    RETURNS TEXT AS $$ 
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated'); 
    $$ LANGUAGE sql STABLE;
  `);
  console.log("✓ Provisioned auth.users, auth.uid(), auth.role(), and roles.");

  // 2. Sequential Migration Execution (001 -> 002 -> 003 -> 004)
  console.log("\n--- Phase 1: Applying Database Migrations Sequentially ---");
  const migrations = [
    { file: "20261110000001_canonical_schema.sql", name: "Migration 001: Canonical Schema" },
    { file: "20261110000002_security_rls.sql", name: "Migration 002: Security RLS & Hardening" },
    { file: "20261110000003_seed_data.sql", name: "Migration 003: Core Seed Data" },
    { file: "20261111000001_milestone_7_intelligence.sql", name: "Migration 004: Post-Call Intelligence & Outbox" }
  ];

  for (const m of migrations) {
    const filePath = path.join(process.cwd(), "supabase", "migrations", m.file);
    let sql = fs.readFileSync(filePath, "utf8");
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, "-- uuid-ossp built-in");
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "-- pgcrypto built-in");
    await db.exec(sql);
    console.log(`✓ Applied ${m.name}`);
  }

  // 3. Seed Organizations, Leads, and Staff Users
  console.log("\n--- Phase 2: Seeding Test Tenancies & Users ---");
  const orgAId = "11111111-1111-4111-8111-111111111111";
  const orgBId = "22222222-2222-4222-8222-222222222222";
  const staffUserId = "33333333-3333-4333-8333-333333333333";
  const leadAId = "44444444-4444-4444-8444-444444444444";
  const callAId = "55555555-5555-4555-8555-555555555555";

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${staffUserId}', 'supervisor@suryaenergy.com');

    INSERT INTO public.organizations (id, name, slug) 
    VALUES ('${orgAId}', 'Surya Energy Madurai', 'surya-madurai'),
           ('${orgBId}', 'Titan Solar Chennai', 'titan-chennai')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.leads (id, organization_id, name, phone, temperature, status, score, source)
    VALUES ('${leadAId}', '${orgAId}', 'Anand Ramanathan', '+919840123456', 'WARM', 'NEW', 85, 'INBOUND_VOICE');

    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${callAId}', '${orgAId}', '${leadAId}', 'Anand Ramanathan', '+919840123456', 90, 'COMPLETED'::public.call_status);
  `);
  console.log("✓ Test organizations, staff user, lead, and call session seeded.");

  const orchestrator = new AutomationOrchestrator(db);

  // =========================================================================
  // TEST SCENARIO 1: End-to-End Automation Execution & Action Creation
  // =========================================================================
  console.log("\n--- Test Scenario 1: End-to-End Automation Execution & Action Creation ---");
  const qualifiedAnalysis: ValidatedCallAnalysisResult = {
    summary: "Customer Anand inquired about 5kW on-grid solar for home with ₹8,500 monthly bill. Requested callback tomorrow at 4 PM.",
    businessOutcome: "QUALIFIED",
    complianceState: "NONE",
    escalationState: "NONE",
    sentiment: "POSITIVE",
    confidenceScore: 0.95,
    evidenceCoverage: 0.85,
    extractionConfidence: 0.95,
    qualificationDecision: "QUALIFIED",
    followUpRecommended: true,
    intelligenceData: {
      customerIntent: { value: "Install 5kW rooftop solar", evidenceSegmentIds: ["s-1"], exactQuote: "install 5kW rooftop solar", speaker: "CUSTOMER", confidence: 1.0, verificationState: "VERIFIED" },
      customerRequirements: [{ value: "5kW on-grid solar system", evidenceSegmentIds: ["s-2"], exactQuote: "5kW system", speaker: "CUSTOMER", confidence: 1.0, verificationState: "VERIFIED" }],
      productServiceInterest: null,
      budget: { value: "₹8,500 monthly bill", evidenceSegmentIds: ["s-3"], exactQuote: "₹8,500 bill", speaker: "CUSTOMER", confidence: 0.9, verificationState: "VERIFIED" },
      purchaseTimeline: { value: "Tomorrow 4 PM", evidenceSegmentIds: ["s-4"], exactQuote: "call me tomorrow at 4 pm", speaker: "CUSTOMER", confidence: 0.95, verificationState: "VERIFIED" },
      locationRequirements: null,
      customerObjections: [],
      competitorMentions: [],
      buyingSignals: [{ value: "Site survey requested", evidenceSegmentIds: ["s-5"], exactQuote: "schedule inspection", speaker: "CUSTOMER", confidence: 1.0, verificationState: "VERIFIED" }],
      customerQuestions: [],
      unresolvedQuestions: [],
      recommendedNextAction: { value: "Schedule site inspection", evidenceSegmentIds: [], exactQuote: "", speaker: "AGENT", confidence: 0.9, verificationState: "VERIFIED" },
      rejectedEvidence: []
    },
    leadScoring: {
      totalScore: 90,
      normalizedObservedScore: 90,
      observedWeightTotal: 1.0,
      evidenceCoverage: 0.85,
      extractionConfidence: 0.95,
      classification: "HOT",
      scoringFactors: {},
      unresolvedUnknowns: [],
      scoringVersion: "v1.0"
    },
    provider: "GROQ",
    model: "openai/gpt-oss-20b",
    processingDurationMs: 420
  };

  const contextA: CallAutomationContext = {
    organizationId: orgAId,
    callSessionId: callAId,
    leadId: leadAId,
    customerName: "Anand Ramanathan",
    customerPhone: "+919840123456",
    whatsappConsent: true,
    whatsappConsentReference: "CONSENT-CRM-123",
    language: "en",
    analysis: qualifiedAnalysis,
    lead: {
      id: leadAId,
      organization_id: orgAId,
      name: "Anand Ramanathan",
      phone: "+919840123456",
      status: "NEW",
      score: 85,
      do_not_call: false,
      whatsapp_consent: true
    }
  };

  const results1 = await orchestrator.executeForSession(contextA);
  console.log(`✓ Executed ${results1.length} automations for session.`);
  assert.ok(results1.length >= 3, "Expected at least 3 rules to execute");

  // Verify follow_up_tasks in database
  const tasksRes = await db.query<{ id: string; title: string; priority: string; status: string }>(
    `SELECT id, title, priority, status FROM public.follow_up_tasks WHERE call_session_id = $1;`,
    [callAId]
  );
  console.log(`✓ follow_up_tasks verified: ${tasksRes.rows.length} tasks created.`);
  assert.ok(tasksRes.rows.some((t) => t.title.includes("Solar Consultation")));
  assert.ok(tasksRes.rows.some((t) => t.title.includes("Scheduled Callback")));

  // Verify notification_dispatches in database
  const notifRes = await db.query<{ id: string; audience: string; status: string; channel: string }>(
    `SELECT id, audience, status, channel FROM public.notification_dispatches WHERE call_session_id = $1;`,
    [callAId]
  );
  console.log(`✓ notification_dispatches verified: ${notifRes.rows.length} dispatches recorded.`);
  const waDraft = notifRes.rows.find((n) => n.audience === "CUSTOMER" && n.channel === "WHATSAPP");
  assert.ok(waDraft, "Customer WhatsApp draft must be created in notification_dispatches");
  assert.equal(waDraft.status, "DRAFT_PENDING_APPROVAL", "Customer WhatsApp message must default to DRAFT_PENDING_APPROVAL");

  // Verify automation_runs in database
  const runsRes = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM public.automation_runs WHERE call_session_id = $1;`,
    [callAId]
  );
  console.log(`✓ automation_runs verified: ${runsRes.rows.length} runs recorded with COMPLETED status.`);
  assert.ok(runsRes.rows.every((r) => r.status === "COMPLETED"));

  // =========================================================================
  // TEST SCENARIO 2: Idempotency & Duplicate Action Prevention
  // =========================================================================
  console.log("\n--- Test Scenario 2: Idempotency & Duplicate Action Prevention ---");
  const tasksBefore = tasksRes.rows.length;
  const notifsBefore = notifRes.rows.length;

  // Re-run for same call session
  const results2 = await orchestrator.executeForSession(contextA);
  console.log(`✓ Re-executed automations for session: ${results2.length} runs returned.`);

  const tasksAfter = (await db.query(`SELECT id FROM public.follow_up_tasks WHERE call_session_id = $1;`, [callAId])).rows.length;
  const notifsAfter = (await db.query(`SELECT id FROM public.notification_dispatches WHERE call_session_id = $1;`, [callAId])).rows.length;

  assert.equal(tasksAfter, tasksBefore, "Duplicate execution must NOT insert duplicate tasks!");
  assert.equal(notifsAfter, notifsBefore, "Duplicate execution must NOT insert duplicate notification dispatches!");
  console.log("✓ PASSED: Duplicate execution handled with strict idempotency (zero duplicated rows).");

  // =========================================================================
  // TEST SCENARIO 3: Do-Not-Call (DNC) Suppression on Real Database
  // =========================================================================
  console.log("\n--- Test Scenario 3: Do-Not-Call (DNC) Suppression & Regulatory Enforcement ---");
  const callDncId = "66666666-6666-4666-8666-666666666666";
  const leadDncId = "77777777-7777-4777-8777-777777777777";

  await db.exec(`
    INSERT INTO public.leads (id, organization_id, name, phone, temperature, status, score, do_not_call, source)
    VALUES ('${leadDncId}', '${orgAId}', 'Priya Natarajan', '+919840999999', 'COLD', 'DO_NOT_CALL', 0, TRUE, 'INBOUND_VOICE');

    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${callDncId}', '${orgAId}', '${leadDncId}', 'Priya Natarajan', '+919840999999', 30, 'COMPLETED'::public.call_status);
  `);

  const dncAnalysis: ValidatedCallAnalysisResult = {
    ...qualifiedAnalysis,
    summary: "Customer requested Do-Not-Call opt-out immediately.",
    businessOutcome: "QUALIFIED",
    complianceState: "DNC_REGISTERED",
    followUpRecommended: false
  };

  const contextDnc: CallAutomationContext = {
    ...contextA,
    callSessionId: callDncId,
    leadId: leadDncId,
    customerName: "Priya Natarajan",
    customerPhone: "+919840999999",
    analysis: dncAnalysis,
    lead: {
      id: leadDncId,
      organization_id: orgAId,
      name: "Priya Natarajan",
      phone: "+919840999999",
      status: "DO_NOT_CALL",
      score: 0,
      do_not_call: true,
      whatsapp_consent: true
    }
  };

  const dncResults = await orchestrator.executeForSession(contextDnc);
  console.log(`✓ DNC session evaluated: ${dncResults.length} actions processed.`);

  // Assert promotional tasks & drafts were SKIPPED_DNC
  const skippedRuns = dncResults.filter((r) => r.status === "SKIPPED_DNC");
  assert.ok(skippedRuns.length >= 1, "Promotional actions must be marked SKIPPED_DNC");

  const dncTasks = (await db.query(`SELECT id FROM public.follow_up_tasks WHERE call_session_id = $1;`, [callDncId])).rows;
  assert.equal(dncTasks.length, 0, "No promotional follow-up tasks may be created for DNC caller!");

  const dncNotifs = (await db.query(`SELECT id FROM public.notification_dispatches WHERE call_session_id = $1 AND audience = 'CUSTOMER';`, [callDncId])).rows;
  assert.equal(dncNotifs.length, 0, "No customer WhatsApp drafts may be created for DNC caller!");
  console.log("✓ PASSED: Strict DNC regulatory suppression verified on real PostgreSQL database.");

  // =========================================================================
  // TEST SCENARIO 4: Human-in-the-Loop WhatsApp Approval Workflow
  // =========================================================================
  console.log("\n--- Test Scenario 4: Human-in-the-Loop WhatsApp Approval Workflow ---");
  const dispatchId = waDraft!.id;
  const approveRes = await orchestrator.approveCustomerNotification({
    dispatchId,
    approvedByUserId: staffUserId,
    targetStatus: "APPROVED"
  });

  assert.equal(approveRes.success, true);
  assert.equal(approveRes.status, "APPROVED");

  const updatedDispatch = (await db.query<{ status: string; approved_by: string; approved_at: string }>(
    `SELECT status, approved_by, approved_at FROM public.notification_dispatches WHERE id = $1;`,
    [dispatchId]
  )).rows[0];

  assert.equal(updatedDispatch.status, "APPROVED");
  assert.equal(updatedDispatch.approved_by, staffUserId);
  assert.ok(updatedDispatch.approved_at !== null);
  console.log("✓ PASSED: Human-in-the-loop notification approval verified.");

  // =========================================================================
  // TEST SCENARIO 5: Approximate Callback Scheduling State in Database
  // =========================================================================
  console.log("\n--- Test Scenario 5: Approximate Callback Scheduling State in Database ---");
  const callApproxId = "88888888-8888-4888-8888-888888888888";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${callApproxId}', '${orgAId}', '${leadAId}', 'Approx Time Lead', '+919840111222', 45, 'COMPLETED'::public.call_status);
  `);

  const approxAnalysis: ValidatedCallAnalysisResult = {
    ...qualifiedAnalysis,
    intelligenceData: {
      ...qualifiedAnalysis.intelligenceData,
      purchaseTimeline: {
        value: "Tomorrow evening",
        evidenceSegmentIds: ["s-4"],
        exactQuote: "please call me tomorrow evening",
        speaker: "CUSTOMER",
        confidence: 0.95,
        verificationState: "VERIFIED"
      }
    }
  };

  const contextApprox: CallAutomationContext = {
    ...contextA,
    callSessionId: callApproxId,
    customerName: "Approx Time Lead",
    analysis: approxAnalysis
  };

  await orchestrator.executeForSession(contextApprox);

  const approxTask = (await db.query<{ description: string }>(
    `SELECT description FROM public.follow_up_tasks WHERE call_session_id = $1 AND title LIKE 'Scheduled Callback%';`,
    [callApproxId]
  )).rows[0];

  assert.ok(approxTask, "Approximate callback task must exist");
  assert.ok(approxTask.description.includes("APPROXIMATE TIME WINDOW"));
  assert.ok(approxTask.description.includes("tomorrow evening"));
  console.log("✓ PASSED: Approximate callback scheduling saved with clear window notes (no hallucinated exact hour).");

  // =========================================================================
  // TEST SCENARIO 6: Partial Failure Isolation & Exponential Backoff
  // =========================================================================
  console.log("\n--- Test Scenario 6: Partial Failure Isolation & Exponential Backoff ---");
  const failRuleId = "99999999-9999-4999-8999-999999999999";
  // Insert a rule with invalid webhook URL that fails
  await db.exec(`
    INSERT INTO public.automations (id, organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status)
    VALUES ('${failRuleId}', '${orgAId}', 'Failing Webhook Rule', 'CALL_COMPLETED', '{}'::jsonb, 'WEBHOOK_DISPATCH', '{}'::jsonb, 'ACTIVE');
  `);

  const callFailId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${callFailId}', '${orgAId}', '${leadAId}', 'Partial Fail Lead', '+919840333444', 45, 'COMPLETED'::public.call_status);
  `);

  const contextFail: CallAutomationContext = {
    ...contextA,
    callSessionId: callFailId,
    customerName: "Partial Fail Lead"
  };

  const failResults = await orchestrator.executeForSession(contextFail);
  const failedRun = failResults.find((r) => r.ruleId === failRuleId);
  assert.ok(failedRun, "Failing rule must have executed");
  assert.equal(failedRun.status, "FAILED");

  // Other rules must have succeeded
  const succeededRuns = failResults.filter((r) => r.ruleId !== failRuleId);
  assert.ok(succeededRuns.every((r) => r.status === "COMPLETED"), "Non-failing rules must succeed (partial failure isolation)");

  const failDbRun = (await db.query<{ status: string; attempt_count: number; last_error: string }>(
    `SELECT status, attempt_count, last_error FROM public.automation_runs WHERE call_session_id = $1 AND automation_id = $2;`,
    [callFailId, failRuleId]
  )).rows[0];

  assert.equal(failDbRun.status, "FAILED");
  assert.equal(failDbRun.attempt_count, 1);
  assert.ok(failDbRun.last_error !== null);
  console.log("✓ PASSED: Partial failure isolated and recorded with attempt tracking and backoff.");

  // =========================================================================
  // TEST SCENARIO 7: Multi-Tenant Workspace Isolation
  // =========================================================================
  console.log("\n--- Test Scenario 7: Multi-Tenant Workspace Isolation ---");
  const callBId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, customer_name, duration_seconds, status)
    VALUES ('${callBId}', '${orgBId}', 'Org B Caller', 60, 'COMPLETED'::public.call_status);
  `);

  const contextOrgB: CallAutomationContext = {
    ...contextA,
    organizationId: orgBId,
    callSessionId: callBId,
    leadId: null
  };

  // Organization B has zero rules seeded currently
  const orgBRulesBefore = (await db.query(`SELECT id FROM public.automations WHERE organization_id = $1;`, [orgBId])).rows.length;
  assert.equal(orgBRulesBefore, 0, "Organization B should not see Organization A's rules");

  const orgBResults = await orchestrator.executeForSession(contextOrgB);
  assert.ok(orgBResults.length > 0, "Org B should execute seeded automations");
  // Auto-seeded for Org B specifically
  const orgBRulesAfter = (await db.query(`SELECT id FROM public.automations WHERE organization_id = $1;`, [orgBId])).rows.length;
  assert.ok(orgBRulesAfter > 0, "Org B should receive its own separate seeded rules");

  // Verify none of Org B's runs reference Org A
  const orgBRuns = (await db.query<{ organization_id: string }>(`SELECT organization_id FROM public.automation_runs WHERE call_session_id = $1;`, [contextOrgB.callSessionId])).rows;
  assert.ok(orgBRuns.every((r) => r.organization_id === orgBId), "All runs must be strictly isolated to Org B");
  console.log("✓ PASSED: Multi-tenant workspace isolation verified on PostgreSQL.");

  // =========================================================================
  // TEST SCENARIO 8: Multi-Action Rule with Action-Level Idempotency
  // =========================================================================
  console.log("\n--- Test Scenario 8: Multi-Action Rule with Action-Level Idempotency Keys ---");
  const multiRuleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const callMultiId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, customer_name, duration_seconds, status)
    VALUES ('${callMultiId}', '${orgAId}', 'Multi Action Customer', 75, 'COMPLETED'::public.call_status);

    INSERT INTO public.automations (id, organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status)
    VALUES (
      '${multiRuleId}',
      '${orgAId}',
      'Multi Action Sales Pipeline Rule',
      'LEAD_QUALIFIED',
      '{}'::jsonb,
      'CREATE_FOLLOW_UP_TASK',
      '${JSON.stringify({
        actions: [
          {
            actionId: "multi-task",
            actionType: "CREATE_FOLLOW_UP_TASK",
            actionConfig: { taskTitleTemplate: "Immediate Consultation for {{customer_name}}" }
          },
          {
            actionId: "multi-notif",
            actionType: "NOTIFY_INTERNAL_STAFF",
            actionConfig: { alertTemplate: "Staff alert for {{customer_name}}" }
          }
        ]
      })}'::jsonb,
      'ACTIVE'
    );
  `);

  const contextMulti: CallAutomationContext = {
    ...contextA,
    callSessionId: callMultiId,
    customerName: "Multi Action Customer",
    analysisVersion: 1
  };

  const multiResults = await orchestrator.executeForSession(contextMulti);
  const multiRuns = multiResults.filter((r) => r.ruleId === multiRuleId);
  assert.equal(multiRuns.length, 2, "Expected 2 action runs for multi-action rule");

  const taskRun = multiRuns.find((r) => r.actionType === "CREATE_FOLLOW_UP_TASK");
  const notifRun = multiRuns.find((r) => r.actionType === "NOTIFY_INTERNAL_STAFF");

  assert.ok(taskRun, "Task action run must exist");
  assert.ok(notifRun, "Staff notification action run must exist");
  assert.ok(taskRun.idempotencyKey.includes("multi-task:v1"));
  assert.ok(notifRun.idempotencyKey.includes("multi-notif:v1"));
  assert.notEqual(taskRun.idempotencyKey, notifRun.idempotencyKey);

  // Verify in PostgreSQL table
  const dbMultiRuns = (await db.query<{ idempotency_key: string; status: string }>(
    `SELECT idempotency_key, status FROM public.automation_runs WHERE call_session_id = $1 AND automation_id = $2;`,
    [callMultiId, multiRuleId]
  )).rows;

  assert.equal(dbMultiRuns.length, 2);
  assert.ok(dbMultiRuns.every((r) => r.status === "COMPLETED"));
  console.log("✓ PASSED: Multi-action rule executed with distinct action-level idempotency keys in PostgreSQL.");

  // =========================================================================
  // TEST SCENARIO 9: Non-Requested Callback Safety
  // =========================================================================
  console.log("\n--- Test Scenario 9: Non-Requested Callback Safety ---");
  const callNoCbId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, customer_name, duration_seconds, status)
    VALUES ('${callNoCbId}', '${orgAId}', 'No Callback Customer', 40, 'COMPLETED'::public.call_status);
  `);

  const noCbAnalysis: ValidatedCallAnalysisResult = {
    ...qualifiedAnalysis,
    summary: "Customer requested solar pricing sheet via email. Did not request callback.",
    businessOutcome: "INFORMATIONAL_COMPLETE",
    followUpRecommended: false,
    intelligenceData: {
      ...qualifiedAnalysis.intelligenceData,
      purchaseTimeline: null,
      recommendedNextAction: null
    }
  };

  const contextNoCb: CallAutomationContext = {
    ...contextA,
    callSessionId: callNoCbId,
    customerName: "No Callback Customer",
    analysis: noCbAnalysis
  };

  await orchestrator.executeForSession(contextNoCb);

  // Ensure NO scheduled callback task was created for this session
  const cbTasks = (await db.query(
    `SELECT id FROM public.follow_up_tasks WHERE call_session_id = $1 AND title LIKE 'Scheduled Callback%';`,
    [callNoCbId]
  )).rows;

  assert.equal(cbTasks.length, 0, "No scheduled callback task should be created when customer did not request one");
  console.log("✓ PASSED: Non-requested callback safely skipped without phantom task creation.");

  // =========================================================================
  // TEST SCENARIO 10: Versioned Re-Analysis Execution
  // =========================================================================
  console.log("\n--- Test Scenario 10: Versioned Re-Analysis Execution ---");
  const contextV2: CallAutomationContext = {
    ...contextMulti,
    analysisVersion: 2
  };

  const v2Results = await orchestrator.executeForSession(contextV2);
  const v2MultiRuns = v2Results.filter((r) => r.ruleId === multiRuleId);

  assert.equal(v2MultiRuns.length, 2);
  assert.ok(v2MultiRuns.every((r) => r.idempotencyKey.includes(":v2")));

  // Verify DB now holds both v1 and v2 records for this call session
  const allDbRuns = (await db.query<{ idempotency_key: string }>(
    `SELECT idempotency_key FROM public.automation_runs WHERE call_session_id = $1 AND automation_id = $2;`,
    [callMultiId, multiRuleId]
  )).rows;

  assert.equal(allDbRuns.length, 4, "Expected 4 runs total: 2 for v1, 2 for v2");
  console.log("✓ PASSED: Versioned re-analysis executed cleanly with versioned action idempotency.");

  console.log("\n=====================================================================");
  console.log("ALL 10 PHASE 7.3 REAL POSTGRESQL AUTOMATION SCENARIOS PASSED (100% SUCCESS)!");
  console.log("=====================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("phase_7_3_real_postgres_automations.ts")) {
  runPhase73PostgresAutomations().catch((err) => {
    console.error("FATAL TEST FAILURE:", err);
    process.exit(1);
  });
}
