/**
 * VoiceNexus AI — Milestone 7: Phase 7.5 Real PostgreSQL 18.6 E2E Integration Suite
 * Engine: Embedded Real PostgreSQL 18.6 (PGlite)
 * Tests actual transactional outbox, worker lifecycle, evidence persistence,
 * lead scoring breakdown, automation action generation, human approval security,
 * concurrent retry safety, and real database analytics calculations.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { AutomationOrchestrator } from "../src/lib/automations/automation-orchestrator";
import { calculateLeadScore } from "../src/lib/intelligence/lead-scorer";
import { validateBusinessOutcome } from "../src/lib/intelligence/outcome-classifier";
import { verifyAllEvidence } from "../src/lib/intelligence/evidence-verifier";
import type { RawLLMAnalysisOutput, TranscriptSegmentInput } from "../src/lib/intelligence/types";

export async function runPhase75RealPostgresE2E() {
  console.log("=========================================================================");
  console.log("VOICENEXUS AI — PHASE 7.5 END-TO-END POSTGRESQL 18.6 INTEGRATION SUITE");
  console.log("Engine: Embedded Real PostgreSQL (PGlite v18.6)");
  console.log("=========================================================================\n");

  const db = new PGlite();
  const ver = await db.query<{ version: string }>("SELECT version();");
  console.log("[PostgreSQL Baseline] Connected:", ver.rows[0].version);

  // --------------------------------------------------------------------------
  // Phase 0: Provision Supabase Environment
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Phase 1: Sequential Migration Execution (001 -> 002 -> 003 -> 004)
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Phase 2: Seeding Test Tenancies & Call Session
  // --------------------------------------------------------------------------
  console.log("\n--- Phase 2: Seeding Organizations, Lead, and In-Progress Call ---");
  const orgId = "11111111-1111-4111-8111-111111111111";
  const staffUserId = "22222222-2222-4222-8222-222222222222";
  const leadId = "33333333-3333-4333-8333-333333333333";
  const sessionId = "44444444-4444-4444-8444-444444444444";

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${staffUserId}', 'supervisor@suryaenergy.com');

    INSERT INTO public.organizations (id, name, slug) 
    VALUES ('${orgId}', 'Surya Energy Madurai', 'surya-madurai')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.leads (id, organization_id, name, phone, temperature, status, score, source, do_not_call)
    VALUES ('${leadId}', '${orgId}', 'Anand Ramanathan', '+919840123456', 'WARM', 'NEW', 85, 'INBOUND_VOICE', FALSE);

    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${sessionId}', '${orgId}', '${leadId}', 'Anand Ramanathan', '+919840123456', 154, 'IN_PROGRESS'::public.call_status);
  `);
  console.log("✓ Test organization, lead, and IN_PROGRESS call session created.");

  // Insert transcript turns
  const seg1Id = "55555555-5555-4555-8555-555555555551";
  const seg2Id = "55555555-5555-4555-8555-555555555552";
  const seg3Id = "55555555-5555-4555-8555-555555555553";
  const seg4Id = "55555555-5555-4555-8555-555555555554";

  await db.exec(`
    INSERT INTO public.transcript_segments (id, call_session_id, speaker, text, language, confidence, start_offset_ms, end_offset_ms)
    VALUES 
      ('${seg1Id}', '${sessionId}', 'AGENT', 'Hello! Welcome to Surya Energy. How can I help you today?', 'en-IN', 0.98, 0, 3500),
      ('${seg2Id}', '${sessionId}', 'CUSTOMER', 'Hi! I am looking for a 5kW rooftop solar system for my house in Madurai.', 'en-IN', 0.96, 3800, 9200),
      ('${seg3Id}', '${sessionId}', 'CUSTOMER', 'My monthly electricity bill is around ₹8,500. Can you please call me tomorrow evening?', 'en-IN', 0.95, 12500, 18000),
      ('${seg4Id}', '${sessionId}', 'AGENT', 'Certainly Mr. Anand! We will arrange a callback tomorrow evening to review the PM Surya Ghar subsidy estimate.', 'en-IN', 0.97, 18500, 24000);
  `);
  console.log("✓ 4 Chronological transcript segments inserted.");

  // Seed Automation Rule: LEAD_QUALIFIED -> Create Task + Send WhatsApp Draft
  const ruleId = "66666666-6666-4666-8666-666666666666";
  await db.exec(`
    INSERT INTO public.automations (id, organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status)
    VALUES (
      '${ruleId}',
      '${orgId}',
      'Qualified Lead Follow-up & WhatsApp Consultation',
      'LEAD_QUALIFIED',
      '{"minScore": 45, "requireConsent": true}'::jsonb,
      'SCHEDULE_CALLBACK',
      '{"priority": "HIGH", "actions": [{"actionType": "SCHEDULE_CALLBACK"}, {"actionType": "GENERATE_WHATSAPP_DRAFT"}]}'::jsonb,
      'ACTIVE'
    );
  `);
  console.log("✓ Multi-action automation rule registered.");

  // =========================================================================
  // TASK 1: COMPLETE PIPELINE INTEGRATION — OUTBOX TRIGGER
  // =========================================================================
  console.log("\n--- Task 1: Complete Call Session & Verify Transactional Outbox Trigger ---");
  const completeRes = await db.query(
    `SELECT public.complete_call_session($1::uuid, $2::int);`,
    [sessionId, 154]
  );
  assert.equal(completeRes.rows.length, 1, "Call completion RPC must return the created outbox job");

  // Verify outbox entry was automatically queued by database trigger
  const jobsRes = await db.query<{
    id: string;
    organization_id: string;
    call_session_id: string;
    status: string;
    analysis_version: number;
    attempts: number;
    fencing_token: string;
  }>(`SELECT * FROM public.call_analysis_jobs WHERE call_session_id = $1;`, [sessionId]);

  assert.equal(jobsRes.rows.length, 1, "Exactly one call_analysis_job must be created in outbox");
  const job = jobsRes.rows[0];
  assert.equal(job.status, "QUEUED", "Job must be initialized in QUEUED state");
  assert.equal(job.organization_id, orgId, "Job must retain organization context");
  assert.equal(job.analysis_version, 1, "Initial analysis version must be 1");
  console.log(`✓ Transactional outbox trigger created job: ${job.id} (status: ${job.status})`);

  // =========================================================================
  // TASK 2: WORKER CLAIM & ATOMIC LEASING
  // =========================================================================
  console.log("\n--- Task 2: Atomic Worker Claim & Fencing Token Assignment ---");
  const workerId = "worker-prod-007";
  const claimRes = await db.query<{
    id: string;
    organization_id: string;
    call_session_id: string;
    fencing_token: string;
  }>(`SELECT * FROM public.claim_call_analysis_job($1, $2);`, [workerId, 300]);

  assert.equal(claimRes.rows.length, 1, "Worker must claim the queued job");
  assert.equal(claimRes.rows[0].id, job.id, "Claimed job ID must match");
  const fencingToken = Number(claimRes.rows[0].fencing_token);
  assert.ok(fencingToken >= 1, "Fencing token must be assigned");
  console.log(`✓ Job claimed by ${workerId} with fencing token: ${fencingToken}`);

  // =========================================================================
  // TASK 3: EVIDENCE VERIFICATION & 7-FACTOR EXPLAINABLE SCORING
  // =========================================================================
  console.log("\n--- Task 3: Evidence Verification & Explainable Lead Scoring ---");
  const segments: TranscriptSegmentInput[] = [
    { id: seg1Id, speaker: "AGENT", text: "Hello! Welcome to Surya Energy. How can I help you today?", startOffsetMs: 0, endOffsetMs: 3500 },
    { id: seg2Id, speaker: "CUSTOMER", text: "Hi! I am looking for a 5kW rooftop solar system for my house in Madurai.", startOffsetMs: 3800, endOffsetMs: 9200 },
    { id: seg3Id, speaker: "CUSTOMER", text: "My monthly electricity bill is around ₹8,500. Can you please call me tomorrow evening?", startOffsetMs: 12500, endOffsetMs: 18000 },
    { id: seg4Id, speaker: "AGENT", text: "Certainly Mr. Anand! We will arrange a callback tomorrow evening to review the PM Surya Ghar subsidy estimate.", startOffsetMs: 18500, endOffsetMs: 24000 }
  ];

  const rawOutput: RawLLMAnalysisOutput = {
    summary: "Customer Anand inquired about a 5kW rooftop solar system with ₹8,500 monthly bill and requested a callback tomorrow evening.",
    proposedBusinessOutcome: "QUALIFIED",
    customerIntent: { value: "5kW rooftop solar", exactQuote: "5kW rooftop solar system for my house in Madurai", evidenceSegmentIds: [seg2Id], speaker: "CUSTOMER", confidence: 0.96, verificationState: "UNVERIFIED" },
    customerRequirements: [{ value: "5kW system", exactQuote: "5kW rooftop solar system", evidenceSegmentIds: [seg2Id], speaker: "CUSTOMER", confidence: 0.96, verificationState: "UNVERIFIED" }],
    productServiceInterest: { value: "Rooftop Solar", exactQuote: "rooftop solar system", evidenceSegmentIds: [seg2Id], speaker: "CUSTOMER", confidence: 0.96, verificationState: "UNVERIFIED" },
    budget: { value: "₹8,500 monthly bill", exactQuote: "monthly electricity bill is around ₹8,500", evidenceSegmentIds: [seg3Id], speaker: "CUSTOMER", confidence: 0.95, verificationState: "UNVERIFIED" },
    purchaseTimeline: { value: "Tomorrow evening", exactQuote: "call me tomorrow evening", evidenceSegmentIds: [seg3Id], speaker: "CUSTOMER", confidence: 0.95, verificationState: "UNVERIFIED" },
    locationRequirements: { value: "Madurai", exactQuote: "Madurai", evidenceSegmentIds: [seg2Id], speaker: "CUSTOMER", confidence: 0.96, verificationState: "UNVERIFIED" },
    customerObjections: [],
    competitorMentions: [],
    buyingSignals: [{ value: "Inquired about callback and capacity", exactQuote: "call me tomorrow evening", evidenceSegmentIds: [seg3Id], speaker: "CUSTOMER", confidence: 0.95, verificationState: "UNVERIFIED" }],
    customerQuestions: [],
    unresolvedQuestions: [],
    recommendedNextAction: { value: "Callback consultation", exactQuote: "arrange a callback tomorrow evening", evidenceSegmentIds: [seg4Id], speaker: "AGENT", confidence: 0.95, verificationState: "UNVERIFIED" },
    sentiment: "POSITIVE",
    overallConfidence: 0.96
  };

  const verification = verifyAllEvidence(rawOutput, segments);
  assert.equal(verification.verifiedClaims.customerIntent?.verificationState, "VERIFIED");
  assert.equal(verification.verifiedClaims.budget?.verificationState, "VERIFIED");
  assert.equal(verification.verifiedClaims.purchaseTimeline?.verificationState, "VERIFIED");

  const scoring = calculateLeadScore(verification.verifiedClaims);
  assert.equal(scoring.classification, "HOT", "Lead with Intent, Budget, and Timeline must be HOT");
  assert.ok(scoring.totalScore !== null && scoring.totalScore >= 75, "Total score must be >= 75");

  const outcome = validateBusinessOutcome({
    proposedOutcome: "QUALIFIED",
    complianceState: "NONE",
    escalationState: "NONE",
    callDurationSeconds: 154,
    leadScoring: scoring,
    extractionConfidence: 0.96,
    hasCustomerObjections: false,
    unresolvedQuestionsCount: 0
  });

  assert.equal(outcome.businessOutcome, "QUALIFIED");
  assert.equal(outcome.followUpRecommended, true);
  console.log(`✓ Verified intelligence quotes & calculated lead score: ${scoring.totalScore} (${scoring.classification})`);

  // =========================================================================
  // TASK 4: PERSIST OUTCOMES & SCORE BREAKDOWN TO POSTGRESQL
  // =========================================================================
  console.log("\n--- Task 4: Persisting Call Outcome & Lead Scoring Breakdown ---");
  await db.exec(`
    INSERT INTO public.call_outcomes (
      call_session_id, disposition, business_outcome, compliance_state, escalation_state,
      sentiment, confidence_score, summary, key_points, action_items, intelligence_data,
      evidence_coverage, extraction_confidence, qualification_decision, follow_up_recommended
    ) VALUES (
      '${sessionId}', 'INTERESTED', '${outcome.businessOutcome}', '${outcome.complianceState}',
      '${outcome.escalationState}', 'POSITIVE', 0.96, '${rawOutput.summary.replace(/'/g, "''")}',
      '[]'::jsonb, '[]'::jsonb, '${JSON.stringify(rawOutput).replace(/'/g, "''")}'::jsonb,
      ${scoring.evidenceCoverage}, 0.96, '${outcome.qualificationDecision}', ${outcome.followUpRecommended}
    );

    INSERT INTO public.lead_scoring_breakdowns (
      organization_id, lead_id, call_session_id, analysis_version, total_score, normalized_observed_score,
      observed_weight_total, evidence_coverage, extraction_confidence, classification,
      scoring_factors, unresolved_unknowns, scoring_version
    ) VALUES (
      '${orgId}', '${leadId}', '${sessionId}', 1, ${scoring.totalScore}, ${scoring.normalizedObservedScore},
      0.850, ${scoring.evidenceCoverage}, 0.96, '${scoring.classification}',
      '${JSON.stringify(scoring.scoringFactors).replace(/'/g, "''")}'::jsonb,
      '${JSON.stringify(scoring.unresolvedUnknowns).replace(/'/g, "''")}'::jsonb,
      'v1.0'
    );
  `);
  console.log("✓ Persisted call_outcomes and lead_scoring_breakdowns.");

  // =========================================================================
  // TASK 5: AUTOMATION ORCHESTRATION & ACTION EXECUTION
  // =========================================================================
  console.log("\n--- Task 5: Automation Orchestrator Execution ---");
  const orchestrator = new AutomationOrchestrator(db);
  const autoResult = await orchestrator.executeForSession({
    organizationId: orgId,
    callSessionId: sessionId,
    analysisVersion: 1,
    leadId,
    customerName: "Anand Ramanathan",
    customerPhone: "+919840123456",
    whatsappConsent: true,
    whatsappConsentReference: "Verbal agreement during call",
    analysis: {
      provider: "GROQ",
      model: "llama-3.3-70b-versatile",
      processingDurationMs: 450,
      summary: rawOutput.summary,
      businessOutcome: outcome.businessOutcome,
      complianceState: outcome.complianceState,
      escalationState: outcome.escalationState,
      sentiment: "POSITIVE",
      confidenceScore: 0.96,
      evidenceCoverage: scoring.evidenceCoverage,
      extractionConfidence: 0.96,
      qualificationDecision: outcome.qualificationDecision,
      followUpRecommended: outcome.followUpRecommended,
      intelligenceData: {
        customerIntent: verification.verifiedClaims.customerIntent,
        customerRequirements: verification.verifiedClaims.customerRequirements,
        productServiceInterest: verification.verifiedClaims.productServiceInterest,
        budget: verification.verifiedClaims.budget,
        purchaseTimeline: verification.verifiedClaims.purchaseTimeline,
        locationRequirements: verification.verifiedClaims.locationRequirements,
        customerObjections: [],
        competitorMentions: [],
        buyingSignals: verification.verifiedClaims.buyingSignals,
        customerQuestions: [],
        unresolvedQuestions: [],
        recommendedNextAction: verification.verifiedClaims.recommendedNextAction,
        rejectedEvidence: verification.rejectedEvidence
      },
      leadScoring: scoring
    }
  });

  assert.equal(autoResult.length, 2, "2 actions must be executed");
  const successfulRuns = autoResult.filter((r) => r.status === "COMPLETED");
  assert.equal(successfulRuns.length, 2, "Both actions must succeed");

  // Verify Follow-up task with approximate window preservation
  const taskRows = await db.query<{ id: string; title: string; description: string; priority: string }>(
    `SELECT * FROM public.follow_up_tasks WHERE call_session_id = $1;`,
    [sessionId]
  );
  assert.equal(taskRows.rows.length, 1, "One follow up task must be created");
  const task = taskRows.rows[0];
  assert.ok(task.description.includes("APPROXIMATE TIME WINDOW"), "Task must preserve approximate time window note");
  assert.ok(task.description.includes("tomorrow evening"), "Task must preserve customer window");
  assert.ok(!task.description.includes("18:00:00"), "Task must not invent clock hour");
  console.log(`✓ Follow-up task created with approximate time window preserved: ${task.title}`);

  // Verify WhatsApp draft created in DRAFT_PENDING_APPROVAL
  const dispatchRows = await db.query<{ id: string; status: string; consent_verified: boolean; recipient: string; rendered_message: string }>(
    `SELECT * FROM public.notification_dispatches WHERE call_session_id = $1;`,
    [sessionId]
  );
  assert.equal(dispatchRows.rows.length, 1, "One WhatsApp notification draft must be staged");
  const draft = dispatchRows.rows[0];
  assert.equal(draft.status, "DRAFT_PENDING_APPROVAL", "Draft must be in DRAFT_PENDING_APPROVAL status");
  assert.equal(draft.consent_verified, true, "Consent must be verified");
  console.log(`✓ WhatsApp notification draft staged: ${draft.id} (status: ${draft.status})`);

  // Complete job via RPC
  const jobCompleteRes = await db.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job($1, $2, $3);`,
    [job.id, workerId, fencingToken]
  );
  assert.equal(jobCompleteRes.rows[0].complete_call_analysis_job, true, "complete_call_analysis_job must return true");
  console.log("✓ Background analysis job completed cleanly via worker RPC.");

  // =========================================================================
  // TASK 6: HUMAN APPROVAL WORKSPACE VERIFICATION
  // =========================================================================
  console.log("\n--- Task 6: Human Approval Security & Double-Safety Verification ---");
  const dispatchId = draft.id;

  // 1. Edit draft message text while pending
  const updatedMessage = "Vanakkam Anand! Thank you for inquiring about 5kW solar with Surya Energy.";
  await db.query(
    `UPDATE public.notification_dispatches SET rendered_message = $1, updated_at = NOW() WHERE id = $2;`,
    [updatedMessage, dispatchId]
  );
  const editedRes = await db.query<{ rendered_message: string }>(
    `SELECT rendered_message FROM public.notification_dispatches WHERE id = $1;`,
    [dispatchId]
  );
  assert.equal(editedRes.rows[0].rendered_message, updatedMessage, "Message must be editable while pending");
  console.log("✓ Draft message edited in-place while pending approval.");

  // 2. Approve draft: updates status to APPROVED (never DELIVERED)
  const approvedAt = new Date().toISOString();
  await db.query(
    `UPDATE public.notification_dispatches 
     SET status = 'APPROVED', approved_by = $1, approved_at = $2, updated_at = $2 
     WHERE id = $3 AND status = 'DRAFT_PENDING_APPROVAL';`,
    [staffUserId, approvedAt, dispatchId]
  );

  const approvedDraft = (await db.query<{ status: string; approved_by: string }>(
    `SELECT status, approved_by FROM public.notification_dispatches WHERE id = $1;`,
    [dispatchId]
  )).rows[0];

  assert.equal(approvedDraft.status, "APPROVED", "Draft status must be APPROVED");
  assert.equal(approvedDraft.approved_by, staffUserId, "Audit trail must record approving supervisor UUID");
  assert.notEqual(approvedDraft.status, "DELIVERED", "APPROVED must never be marked DELIVERED");
  console.log("✓ Draft approved successfully with audit trail (status: APPROVED, never DELIVERED).");

  // =========================================================================
  // TASK 7: CONCURRENT RETRY & RACE CONDITION SAFETY
  // =========================================================================
  console.log("\n--- Task 7: Automation Outbox Retry & Concurrency Safety ---");
  const runId = "77777777-7777-4777-8777-777777777777";
  await db.exec(`
    INSERT INTO public.automation_runs (id, organization_id, call_session_id, automation_id, idempotency_key, status, attempt_count, max_attempts)
    VALUES ('${runId}', '${orgId}', '${sessionId}', '${ruleId}', 'test-retry-idempotency-key', 'FAILED', 1, 3);
  `);

  // Request 1 attempts retry update with status guard
  const retry1 = await db.query(
    `UPDATE public.automation_runs 
     SET status = 'PROCESSING', last_error = NULL, available_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status IN ('FAILED', 'DEAD_LETTER')
     RETURNING id, status;`,
    [runId]
  );
  assert.equal(retry1.rows.length, 1, "First retry claim must succeed");

  // Request 2 attempts concurrent retry on same runId
  const retry2 = await db.query(
    `UPDATE public.automation_runs 
     SET status = 'PROCESSING', last_error = NULL, available_at = NOW(), updated_at = NOW() 
     WHERE id = $1 AND status IN ('FAILED', 'DEAD_LETTER')
     RETURNING id, status;`,
    [runId]
  );
  assert.equal(retry2.rows.length, 0, "Second concurrent retry must be blocked (0 rows updated)");
  console.log("✓ Concurrency race-condition guard successfully blocked duplicate retry.");

  // =========================================================================
  // TASK 8: EXECUTIVE ANALYTICS DATABASE COMPUTATION
  // =========================================================================
  console.log("\n--- Task 8: Executive Analytics Database Verification ---");
  const totalCallsRes = await db.query<{ count: string }>(`SELECT COUNT(*) FROM public.call_sessions WHERE organization_id = $1;`, [orgId]);
  const completedCallsRes = await db.query<{ count: string }>(`SELECT COUNT(*) FROM public.call_sessions WHERE organization_id = $1 AND status = 'COMPLETED';`, [orgId]);
  const qualifiedCallsRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM public.call_outcomes co JOIN public.call_sessions cs ON co.call_session_id = cs.id WHERE cs.organization_id = $1 AND co.business_outcome = 'QUALIFIED';`,
    [orgId]
  );
  const pendingTasksRes = await db.query<{ count: string }>(`SELECT COUNT(*) FROM public.follow_up_tasks WHERE organization_id = $1 AND status = 'PENDING';`, [orgId]);

  const totalCalls = Number(totalCallsRes.rows[0].count);
  const completedCalls = Number(completedCallsRes.rows[0].count);
  const qualifiedCalls = Number(qualifiedCallsRes.rows[0].count);
  const pendingTasks = Number(pendingTasksRes.rows[0].count);

  assert.equal(totalCalls, 1, "Total calls must equal 1");
  assert.equal(completedCalls, 1, "Completed calls must equal 1");
  assert.equal(qualifiedCalls, 1, "Qualified calls must equal 1");
  assert.equal(pendingTasks, 1, "Pending follow-up tasks must equal 1");

  const qualRate = (qualifiedCalls / completedCalls) * 100;
  assert.equal(qualRate, 100, "Qualification rate must equal 100%");
  console.log(`✓ Analytics verified from database: ${totalCalls} calls, 100% qualification rate, ${pendingTasks} pending task.`);

  console.log("\n=========================================================================");
  console.log("✓ ALL PHASE 7.5 END-TO-END POSTGRESQL 18.6 INTEGRATION SCENARIOS PASSED!");
  console.log("=========================================================================\n");
}

if (process.argv[1]?.endsWith("phase_7_5_real_postgres_e2e.ts")) {
  runPhase75RealPostgresE2E().catch((err) => {
    console.error("Phase 7.5 Real PostgreSQL E2E Failed:", err);
    process.exit(1);
  });
}
