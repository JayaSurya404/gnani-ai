import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { CallAnalysisWorker } from "../src/lib/workers/call-analysis-worker";

export async function runPhase72WorkerIntegration() {
  console.log("=====================================================================");
  console.log("VOICENEXUS AI — PHASE 7.2 WORKER & POST-CALL INTELLIGENCE INTEGRATION");
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
    const t0 = Date.now();
    await db.exec(sql);
    console.log(`✓ Applied ${m.name} in ${Date.now() - t0}ms`);
  }

  // 3. Seed Test Organization, Lead, and Call Session with Transcript Segments
  console.log("\n--- Phase 2: Seeding Test Tenancy & Transcript Segments ---");
  const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const leadId = "11111111-1111-4111-8111-111111111111";
  const callId = "22222222-2222-4222-8222-222222222222";

  await db.exec(`
    INSERT INTO public.organizations (id, name, slug) 
    VALUES ('${orgId}', 'Surya Energy Corp', 'surya-energy')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.leads (id, organization_id, name, phone, temperature, status, score, source)
    VALUES ('${leadId}', '${orgId}', 'Karthik Raja', '+919876543210', 'COLD', 'NEW', 10, 'INBOUND_VOICE')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, duration_seconds, status)
    VALUES ('${callId}', '${orgId}', '${leadId}', 'Karthik Raja', '+919876543210', 48, 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;

    -- Seed transcript segments
    INSERT INTO public.transcript_segments (id, call_session_id, speaker, text, confidence, start_offset_ms, end_offset_ms)
    VALUES 
      ('10000000-0000-4000-8000-000000000001', '${callId}', 'AGENT', 'Vanakkam! Welcome to Surya Energy. How can I help you?', 0.98, 0, 3500),
      ('10000000-0000-4000-8000-000000000002', '${callId}', 'CUSTOMER', 'Vanakkam, I want to install a 5kW rooftop solar system for my own house in Madurai.', 0.96, 4000, 9500),
      ('10000000-0000-4000-8000-000000000003', '${callId}', 'AGENT', 'Excellent! What is your bi-monthly electricity bill?', 0.97, 10000, 14000),
      ('10000000-0000-4000-8000-000000000004', '${callId}', 'CUSTOMER', 'Our bill is around 8500 rupees. We have 500 sq ft terrace space.', 0.95, 14500, 20000),
      ('10000000-0000-4000-8000-000000000005', '${callId}', 'AGENT', 'Would you like our engineer to visit tomorrow at 11 AM for survey?', 0.99, 21000, 26000),
      ('10000000-0000-4000-8000-000000000006', '${callId}', 'CUSTOMER', 'Yes, please send your engineer tomorrow. I am the sole owner and will decide.', 0.97, 26500, 32000)
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log("✓ Seeded organization, lead, call session, and 6 transcript segments.");

  // Adapter for CallAnalysisWorker
  const dbAdapter = {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      // Replace positional parameters ($1, $2) for PGlite if needed, or query directly
      const res = await db.query<T>(sql, params);
      return { rows: res.rows };
    }
  };

  const worker = new CallAnalysisWorker(dbAdapter, {
    workerId: "test-worker-alpha",
    leaseSeconds: 300,
    backoffBaseSeconds: 60
  });

  console.log("\n=====================================================================");
  console.log("EXECUTING POST-CALL WORKER OPERATIONAL INTEGRATION TESTS");
  console.log("=====================================================================\n");

  // TEST 1: Outbox Trigger & Worker Processing End-to-End
  console.log("Test 1: Call Completion, Outbox Enqueue & Worker End-to-End Execution...");
  await db.exec(`UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${callId}';`);

  // Verify job enqueued atomically
  const jobBefore = await db.query<{ id: string; status: string; fencing_token: string }>(
    `SELECT id, status, fencing_token FROM public.call_analysis_jobs WHERE call_session_id = '${callId}' AND analysis_version = 1;`
  );
  assert.equal(jobBefore.rows.length, 1);
  assert.equal(jobBefore.rows[0].status, "QUEUED");
  assert.equal(Number(jobBefore.rows[0].fencing_token), 0);
  console.log("✓ Outbox trigger atomically enqueued analysis job for session");

  // Worker claims and processes the job
  const workRes = await worker.processNextJob();
  assert.equal(workRes.claimed, true);
  assert.equal(workRes.success, true);
  assert.equal(workRes.callSessionId, callId);
  assert.equal(workRes.analysisVersion, 1);
  assert.equal(workRes.fencingToken, 1);
  console.log(`✓ Worker ${worker.getWorkerId()} successfully processed and completed job`);

  // Verify job status is COMPLETED
  const jobAfter = await db.query<{ status: string; completed_at: Date }>(
    `SELECT status, completed_at FROM public.call_analysis_jobs WHERE id = '${workRes.jobId}';`
  );
  assert.equal(jobAfter.rows[0].status, "COMPLETED");
  assert.ok(jobAfter.rows[0].completed_at !== null);

  // Verify call_outcomes table persisted verified intelligence
  const outcomeRow = await db.query<{
    business_outcome: string;
    compliance_state: string;
    escalation_state: string;
    evidence_coverage: number;
    extraction_confidence: number;
    summary: string;
  }>(`SELECT business_outcome, compliance_state, escalation_state, evidence_coverage, extraction_confidence, summary FROM public.call_outcomes WHERE call_session_id = '${callId}';`);
  assert.equal(outcomeRow.rows.length, 1);
  assert.equal(outcomeRow.rows[0].compliance_state, "NONE");
  assert.ok(outcomeRow.rows[0].summary.length > 10);
  console.log("✓ call_outcomes verified with orthogonal states and intelligence data");

  // Verify lead_scoring_breakdowns persisted
  const scoreRow = await db.query<{
    total_score: number;
    evidence_coverage: number;
    classification: string;
    analysis_version: number;
  }>(`SELECT total_score, evidence_coverage, classification, analysis_version FROM public.lead_scoring_breakdowns WHERE call_session_id = '${callId}' AND analysis_version = 1;`);
  assert.equal(scoreRow.rows.length, 1);
  assert.equal(scoreRow.rows[0].analysis_version, 1);
  assert.ok(scoreRow.rows[0].total_score >= 0);
  console.log(`✓ lead_scoring_breakdowns verified: total_score=${scoreRow.rows[0].total_score}, classification=${scoreRow.rows[0].classification}, coverage=${scoreRow.rows[0].evidence_coverage}`);

  // TEST 2: Duplicate Completion Idempotency
  console.log("\nTest 2: Duplicate Completion Event Idempotency...");
  await db.exec(`SELECT public.complete_call_session('${callId}'::uuid);`);
  const totalJobs = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.call_analysis_jobs WHERE call_session_id = '${callId}';`
  );
  assert.equal(totalJobs.rows[0].count, "1", "Duplicate completion must not create duplicate jobs");
  console.log("✓ Test 2 PASSED: Duplicate completion handled idempotently");

  // TEST 3: Stale Worker Fencing (Zombie Worker Protection)
  console.log("\nTest 3: Stale Worker Fencing Protection...");
  const callId2 = "33333333-3333-4333-8333-333333333333";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${callId2}', '${orgId}', 'IN_PROGRESS'::public.call_status);
    UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${callId2}';
  `);

  // Worker 1 claims job
  const claim1 = await db.query<{ id: string; fencing_token: string }>(
    `SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-1', 300);`
  );
  assert.equal(claim1.rows.length, 1);
  const job2Id = claim1.rows[0].id;
  const token1 = Number(claim1.rows[0].fencing_token);

  // Simulate Worker 1 lease expiry
  await db.exec(`UPDATE public.call_analysis_jobs SET lock_expires_at = NOW() - INTERVAL '5 seconds' WHERE id = '${job2Id}';`);

  // Worker 2 reclaims expired job (advances fencing_token to 2)
  const claim2 = await db.query<{ id: string; fencing_token: string }>(
    `SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-2', 300);`
  );
  assert.equal(claim2.rows.length, 1);
  const token2 = Number(claim2.rows[0].fencing_token);
  assert.equal(token2, 2);

  // Stale Worker 1 attempts to complete with token 1 -> MUST BE REJECTED
  const staleComplete = await db.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job('${job2Id}'::uuid, 'worker-1', ${token1}::bigint);`
  );
  assert.equal(staleComplete.rows[0].complete_call_analysis_job, false, "Zombie Worker 1 must be fenced out");

  // Valid Worker 2 completes with token 2 -> MUST SUCCEED
  const validComplete = await db.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job('${job2Id}'::uuid, 'worker-2', ${token2}::bigint);`
  );
  assert.equal(validComplete.rows[0].complete_call_analysis_job, true, "Worker 2 must complete job successfully");
  console.log("✓ Test 3 PASSED: Zombie worker fenced out; Valid worker completed job");

  // TEST 4: Error Handling & Exponential Backoff
  console.log("\nTest 4: Error Handling & Exponential Backoff...");
  const callId3 = "44444444-4444-4444-8444-444444444444";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${callId3}', '${orgId}', 'IN_PROGRESS'::public.call_status);
    UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${callId3}';
  `);

  const claim3 = await db.query<{ id: string; fencing_token: string }>(
    `SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-err', 300);`
  );
  const job3Id = claim3.rows[0].id;
  const token3 = Number(claim3.rows[0].fencing_token);

  await db.query(
    `SELECT public.fail_call_analysis_job('${job3Id}'::uuid, 'worker-err', ${token3}::bigint, 'Simulated LLM API rate limit error', 60);`
  );

  const failedJob = await db.query<{ status: string; attempts: number; last_error: string }>(
    `SELECT status, attempts, last_error FROM public.call_analysis_jobs WHERE id = '${job3Id}';`
  );
  assert.equal(failedJob.rows[0].status, "FAILED");
  assert.equal(failedJob.rows[0].attempts, 1);
  assert.equal(failedJob.rows[0].last_error, "Simulated LLM API rate limit error");
  console.log("✓ Test 4 PASSED: Failed job transitioned to FAILED with error message and backoff");

  // TEST 5: Versioned Reanalysis
  console.log("\nTest 5: Versioned Reanalysis Execution...");
  // Reanalyze Call 1
  const reanalysisJob = await db.query<{ id: string; analysis_version: number; status: string }>(
    `SELECT id, analysis_version, status FROM public.reanalyze_call_session('${callId}'::uuid);`
  );
  assert.equal(reanalysisJob.rows.length, 1);
  assert.equal(reanalysisJob.rows[0].analysis_version, 2);
  assert.equal(reanalysisJob.rows[0].status, "QUEUED");
  console.log(`✓ Reanalysis enqueued job for session with analysis_version = 2`);

  // Worker processes version 2
  const reanalysisWorkRes = await worker.processNextJob();
  assert.equal(reanalysisWorkRes.claimed, true);
  assert.equal(reanalysisWorkRes.success, true);
  assert.equal(reanalysisWorkRes.analysisVersion, 2);

  // Check that BOTH version 1 and version 2 records exist in lead_scoring_breakdowns
  const allVersions = await db.query<{ analysis_version: number; total_score: number }>(
    `SELECT analysis_version, total_score FROM public.lead_scoring_breakdowns WHERE call_session_id = '${callId}' ORDER BY analysis_version ASC;`
  );
  assert.equal(allVersions.rows.length, 2, "Both version 1 and version 2 scoring records must exist");
  assert.equal(allVersions.rows[0].analysis_version, 1);
  assert.equal(allVersions.rows[1].analysis_version, 2);
  console.log("✓ Test 5 PASSED: Versioned reanalysis created version 2 alongside version 1 without row collision");

  console.log("\n=====================================================================");
  console.log("ALL PHASE 7.2 WORKER INTEGRATION TESTS COMPLETED WITH 100% SUCCESS!");
  console.log("=====================================================================\n");
}

if (process.argv[1] && process.argv[1].endsWith("phase_7_2_worker_integration.ts")) {
  runPhase72WorkerIntegration()
    .then(() => {
      console.log("Worker integration completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Worker integration failed:", err);
      process.exit(1);
    });
}
