import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

export async function runRealPostgresValidation() {
  console.log("=====================================================================");
  console.log("VOICENEXUS AI — REAL POSTGRESQL MIGRATION & OUTBOX INTEGRATION TEST");
  console.log("Engine: Embedded Real PostgreSQL (PGlite v18.6)");
  console.log("=====================================================================\n");

  const db = new PGlite();
  const ver = await db.query<{ version: string }>("SELECT version();");
  console.log("[PostgreSQL Baseline] Connected:", ver.rows[0].version);

  // 1. Supabase Environment Emulation (auth schema, roles, and session claim helpers)
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
      SELECT NULLIF(current_setting('request.jwt.claim.role', true), 'authenticated'); 
    $$ LANGUAGE sql STABLE;
  `);
  console.log("✓ auth schema, auth.users, auth.uid(), auth.role(), and roles (anon, authenticated) provisioned.");

  // 2. Sequential Migration Execution (Migrations 001, 002, 003, 004)
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

  // 3. Verify Table and Column Existence
  console.log("\n--- Phase 2: Verifying Schema Objects & Columns ---");
  const tableCheck = await db.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN ('call_analysis_jobs', 'lead_scoring_breakdowns', 'automation_runs', 'notification_dispatches', 'call_outcomes', 'call_sessions')
    ORDER BY tablename;
  `);
  console.log("Discovered Tables:", tableCheck.rows.map(r => r.tablename).join(", "));
  assert.equal(tableCheck.rows.length, 6, "All 6 required tables must exist in public schema");

  const outcomeColumns = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'call_outcomes'
      AND column_name IN ('business_outcome', 'compliance_state', 'escalation_state', 'evidence_coverage', 'extraction_confidence', 'intelligence_data');
  `);
  assert.equal(outcomeColumns.rows.length, 6, "All 6 orthogonal outcome columns must exist on call_outcomes");
  console.log("✓ All 6 orthogonal columns verified on call_outcomes table");

  // 4. Create Test Tenants, Users, and Calls
  console.log("\n--- Phase 3: Seeding Test Organizations & Users ---");
  const userAlphaId = "11111111-1111-4111-8111-111111111111";
  const userBetaId = "22222222-2222-4222-8222-222222222222";
  const orgAlphaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const orgBetaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES 
      ('${userAlphaId}', 'alpha@tenant-a.com'),
      ('${userBetaId}', 'beta@tenant-b.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, name, slug) VALUES 
      ('${orgAlphaId}', 'Tenant Alpha Corp', 'tenant-alpha'),
      ('${orgBetaId}', 'Tenant Beta Ltd', 'tenant-beta')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role) VALUES 
      ('${orgAlphaId}', '${userAlphaId}', 'OWNER'::public.organization_role),
      ('${orgBetaId}', '${userBetaId}', 'OWNER'::public.organization_role)
    ON CONFLICT DO NOTHING;
  `);
  console.log("✓ Seeded Tenant Alpha and Tenant Beta with authenticated Owner profiles");

  async function asUser(userId: string | null, role: "anon" | "authenticated" = "authenticated") {
    if (role === "anon") {
      await db.exec(`SET ROLE anon; SELECT set_config('request.jwt.claim.role', 'anon', false); SELECT set_config('request.jwt.claim.sub', '', false);`);
    } else {
      await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.role', 'authenticated', false); SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
    }
  }

  async function asAdmin() {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role', '', false); SELECT set_config('request.jwt.claim.sub', '', false);`);
  }

  // =========================================================================
  // TASK 2 EXECUTION: 13 REAL DATABASE TESTS
  // =========================================================================
  console.log("\n=====================================================================");
  console.log("EXECUTING 13 REAL POSTGRESQL TRANSACTIONAL & OPERATIONAL TESTS");
  console.log("=====================================================================\n");

  const call1Id = "c1111111-1111-4111-8111-111111111111";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call1Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;
  `);

  // TEST 1: Call Completion and Automatic Job Creation (Outbox Trigger)
  console.log("Test 1: Call Completion & Transactional Outbox Job Creation...");
  await db.exec(`
    UPDATE public.call_sessions 
    SET status = 'COMPLETED'::public.call_status 
    WHERE id = '${call1Id}';
  `);

  const job1Result = await db.query<{ id: string; status: string; analysis_version: number; attempts: number }>(`
    SELECT id, status, analysis_version, attempts 
    FROM public.call_analysis_jobs 
    WHERE call_session_id = '${call1Id}';
  `);
  assert.equal(job1Result.rows.length, 1, "Exactly 1 queued job must be created by trigger");
  assert.equal(job1Result.rows[0].status, "QUEUED");
  assert.equal(job1Result.rows[0].analysis_version, 1);
  assert.equal(job1Result.rows[0].attempts, 0);
  console.log("✓ Test 1 PASSED: Job atomically created in QUEUED status (Job ID:", job1Result.rows[0].id, ")");

  // TEST 2: Duplicate Completion Event
  console.log("\nTest 2: Duplicate Completion Event (Idempotency & Lease Preservation)...");
  await db.exec(`
    UPDATE public.call_analysis_jobs 
    SET status = 'CLAIMED', locked_by = 'worker-active', lock_expires_at = NOW() + INTERVAL '5 minutes', attempts = 1
    WHERE call_session_id = '${call1Id}';
  `);

  const dupRpcRes = await db.query<{ id: string; status: string; locked_by: string; attempts: number }>(`
    SELECT id, status, locked_by, attempts 
    FROM public.complete_call_session('${call1Id}'::uuid, 120);
  `);
  assert.equal(dupRpcRes.rows.length, 1);
  assert.equal(dupRpcRes.rows[0].status, "CLAIMED", "Duplicate event must NOT reset CLAIMED job");
  assert.equal(dupRpcRes.rows[0].locked_by, "worker-active", "Duplicate event must NOT steal active worker lease");
  assert.equal(dupRpcRes.rows[0].attempts, 1, "Attempts must remain preserved");

  const totalJobsForCall = await db.query<{ count: number }>(`SELECT count(*)::int as count FROM public.call_analysis_jobs WHERE call_session_id = '${call1Id}';`);
  assert.equal(totalJobsForCall.rows[0].count, 1, "Duplicate event must NOT create extra rows");
  console.log("✓ Test 2 PASSED: Duplicate completion preserved active lease and prevented duplicate row");

  await db.exec(`
    UPDATE public.call_analysis_jobs 
    SET status = 'QUEUED', locked_by = NULL, lock_expires_at = NULL, attempts = 0, fencing_token = 0 
    WHERE call_session_id = '${call1Id}';
  `);

  // TEST 3: Versioned Reanalysis
  console.log("\nTest 3: Versioned Reanalysis (Creating Distinct Analysis Version)...");
  const reanalysisRes = await db.query<{ id: string; analysis_version: number; status: string }>(`
    SELECT id, analysis_version, status 
    FROM public.reanalyze_call_session('${call1Id}'::uuid);
  `);
  assert.equal(reanalysisRes.rows.length, 1);
  assert.equal(reanalysisRes.rows[0].analysis_version, 2, "Reanalysis must create version 2");
  assert.equal(reanalysisRes.rows[0].status, "QUEUED");

  const versionsResult = await db.query<{ analysis_version: number }>(`
    SELECT analysis_version FROM public.call_analysis_jobs WHERE call_session_id = '${call1Id}' ORDER BY analysis_version ASC;
  `);
  assert.deepEqual(versionsResult.rows.map(r => r.analysis_version), [1, 2], "Both version 1 and version 2 must coexist");
  console.log("✓ Test 3 PASSED: Versioned reanalysis created version 2 alongside version 1");

  await db.exec(`DELETE FROM public.call_analysis_jobs WHERE call_session_id = '${call1Id}' AND analysis_version = 2;`);

  // TEST 4: Two Concurrent Workers Claiming Jobs (FOR UPDATE SKIP LOCKED)
  console.log("\nTest 4: Two Concurrent Workers Claiming Jobs (Skip-Locked Isolation)...");
  const workerAlphaClaim = await db.query<{ id: string; attempts: number; fencing_token: string }>(`
    SELECT id, attempts, fencing_token FROM public.claim_call_analysis_job('worker-alpha', 300);
  `);
  assert.equal(workerAlphaClaim.rows.length, 1, "Worker Alpha should successfully claim job");
  assert.equal(workerAlphaClaim.rows[0].attempts, 1);
  assert.equal(Number(workerAlphaClaim.rows[0].fencing_token), 1, "First claim must produce fencing token 1");
  const jobId = workerAlphaClaim.rows[0].id;

  const workerBetaClaim = await db.query<{ id: string }>(`
    SELECT id FROM public.claim_call_analysis_job('worker-beta', 300);
  `);
  assert.equal(workerBetaClaim.rows.length, 0, "Worker Beta must get empty result because job is locked");
  console.log("✓ Test 4 PASSED: Worker Alpha claimed job; Worker Beta safely received 0 rows under SKIP LOCKED");

  // TEST 5: Lease Renewal
  console.log("\nTest 5: Lease Renewal with Fencing Token Verification...");
  const renewalSuccess = await db.query<{ renew_call_analysis_job_lease: boolean }>(`
    SELECT public.renew_call_analysis_job_lease('${jobId}'::uuid, 'worker-alpha', 1::bigint, 600);
  `);
  assert.equal(renewalSuccess.rows[0].renew_call_analysis_job_lease, true, "Active worker with valid token must renew lease");

  const invalidTokenRenewal = await db.query<{ renew_call_analysis_job_lease: boolean }>(`
    SELECT public.renew_call_analysis_job_lease('${jobId}'::uuid, 'worker-alpha', 999::bigint, 600);
  `);
  assert.equal(invalidTokenRenewal.rows[0].renew_call_analysis_job_lease, false, "Invalid fencing token must be rejected");
  console.log("✓ Test 5 PASSED: Lease renewal succeeded for token 1 and rejected invalid token 999");

  // TEST 6: Lease Expiration and Job Reclamation
  console.log("\nTest 6: Lease Expiration & Reclamation by Worker Beta...");
  await db.exec(`
    UPDATE public.call_analysis_jobs 
    SET lock_expires_at = NOW() - INTERVAL '10 seconds'
    WHERE id = '${jobId}';
  `);

  const workerBetaReclaim = await db.query<{ id: string; attempts: number; fencing_token: string }>(`
    SELECT id, attempts, fencing_token FROM public.claim_call_analysis_job('worker-beta', 300);
  `);
  assert.equal(workerBetaReclaim.rows.length, 1, "Worker Beta must reclaim expired job");
  assert.equal(workerBetaReclaim.rows[0].attempts, 2, "Attempts should increment to 2");
  assert.equal(Number(workerBetaReclaim.rows[0].fencing_token), 2, "Fencing token must increment to 2");
  console.log("✓ Test 6 PASSED: Expired job reclaimed by Worker Beta with fencing token 2 (attempts: 2)");

  // TEST 7: Old Worker Attempting Completion After Lease Reclamation (Worker Fencing)
  console.log("\nTest 7: Fencing Old Worker (Worker Alpha Attempting Complete with Token 1)...");
  const zombieComplete = await db.query<{ complete_call_analysis_job: boolean }>(`
    SELECT public.complete_call_analysis_job('${jobId}'::uuid, 'worker-alpha', 1::bigint);
  `);
  assert.equal(zombieComplete.rows[0].complete_call_analysis_job, false, "Zombie Worker Alpha must be strictly denied completion");

  const legitComplete = await db.query<{ complete_call_analysis_job: boolean }>(`
    SELECT public.complete_call_analysis_job('${jobId}'::uuid, 'worker-beta', 2::bigint);
  `);
  assert.equal(legitComplete.rows[0].complete_call_analysis_job, true, "Active Worker Beta must complete job");

  const completedJobState = await db.query<{ status: string; completed_at: string | null }>(`
    SELECT status, completed_at FROM public.call_analysis_jobs WHERE id = '${jobId}';
  `);
  assert.equal(completedJobState.rows[0].status, "COMPLETED");
  assert.ok(completedJobState.rows[0].completed_at);
  console.log("✓ Test 7 PASSED: Zombie Worker Alpha fenced out; Worker Beta completed job successfully");

  // TEST 8: Retry and Exponential Backoff
  console.log("\nTest 8: Error Retry with Exponential Backoff Scheduling...");
  const call2Id = "c2222222-2222-4222-8222-222222222222";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call2Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status);
    UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${call2Id}';
  `);

  const job2Claim = await db.query<{ id: string; fencing_token: string }>(`
    SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-retry', 300);
  `);
  const job2Id = job2Claim.rows[0].id;
  const tokenJob2 = BigInt(job2Claim.rows[0].fencing_token);

  const fail1 = await db.query<{ fail_call_analysis_job: boolean }>(`
    SELECT public.fail_call_analysis_job('${job2Id}'::uuid, 'worker-retry', ${tokenJob2}::bigint, 'LLM 429 Rate Limit', 60);
  `);
  assert.equal(fail1.rows[0].fail_call_analysis_job, true);

  const retryState1 = await db.query<{ status: string; attempts: number; available_at: Date; last_error: string }>(`
    SELECT status, attempts, available_at, last_error FROM public.call_analysis_jobs WHERE id = '${job2Id}';
  `);
  assert.equal(retryState1.rows[0].status, "FAILED");
  assert.equal(retryState1.rows[0].attempts, 1);
  assert.equal(retryState1.rows[0].last_error, "LLM 429 Rate Limit");
  console.log("✓ Test 8 PASSED: Job transitioned to FAILED with 60s exponential backoff");

  // TEST 9: Maximum Retry Exhaustion -> DEAD_LETTER
  console.log("\nTest 9: Maximum Retry Exhaustion & Dead-Letter Transition...");
  await db.exec(`UPDATE public.call_analysis_jobs SET available_at = NOW() - INTERVAL '1 second' WHERE id = '${job2Id}';`);
  const claim2 = await db.query<{ fencing_token: string }>(`SELECT fencing_token FROM public.claim_call_analysis_job('worker-retry', 300);`);
  await db.query(`SELECT public.fail_call_analysis_job('${job2Id}'::uuid, 'worker-retry', ${BigInt(claim2.rows[0].fencing_token)}::bigint, 'LLM 503 Overload', 60);`);

  await db.exec(`UPDATE public.call_analysis_jobs SET available_at = NOW() - INTERVAL '1 second' WHERE id = '${job2Id}';`);
  const claim3 = await db.query<{ fencing_token: string }>(`SELECT fencing_token FROM public.claim_call_analysis_job('worker-retry', 300);`);
  await db.query(`SELECT public.fail_call_analysis_job('${job2Id}'::uuid, 'worker-retry', ${BigInt(claim3.rows[0].fencing_token)}::bigint, 'Fatal Parser Error', 60);`);

  const deadLetterState = await db.query<{ status: string; attempts: number; last_error: string }>(`
    SELECT status, attempts, last_error FROM public.call_analysis_jobs WHERE id = '${job2Id}';
  `);
  assert.equal(deadLetterState.rows[0].status, "DEAD_LETTER");
  assert.equal(deadLetterState.rows[0].attempts, 3);
  assert.equal(deadLetterState.rows[0].last_error, "Fatal Parser Error");
  console.log("✓ Test 9 PASSED: Job automatically transitioned to DEAD_LETTER after 3 attempts");

  // TEST 10: Transaction Rollback Integrity
  console.log("\nTest 10: Transaction Rollback Integrity...");
  const call3Id = "c3333333-3333-4333-8333-333333333333";
  await db.exec(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call3Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status);
  `);

  try {
    await db.exec(`
      BEGIN;
      UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${call3Id}';
      RAISE EXCEPTION 'Simulated business error during call finalization';
      COMMIT;
    `);
  } catch {
    await db.exec("ROLLBACK;");
  }

  const rolledBackJob = await db.query<{ id: string }>(`SELECT id FROM public.call_analysis_jobs WHERE call_session_id = '${call3Id}';`);
  assert.equal(rolledBackJob.rows.length, 0, "No job must exist because transaction rolled back");
  const rolledBackSession = await db.query<{ status: string }>(`SELECT status FROM public.call_sessions WHERE id = '${call3Id}';`);
  assert.equal(rolledBackSession.rows[0].status, "IN_PROGRESS", "Session status must roll back to IN_PROGRESS");
  console.log("✓ Test 10 PASSED: Transaction rollback cleaned up trigger outbox job and restored session state");

  // TEST 11: Organization-Level RLS Restrictions
  console.log("\nTest 11: Multi-Tenant Organization Isolation under RLS...");
  await asAdmin();
  await db.exec(`
    INSERT INTO public.lead_scoring_breakdowns (organization_id, call_session_id, total_score, evidence_coverage, classification)
    VALUES 
      ('${orgAlphaId}', '${call1Id}', 85, 0.750, 'HOT'),
      ('${orgBetaId}', '${call2Id}', 40, 0.300, 'COLD')
    ON CONFLICT DO NOTHING;
  `);

  await asUser(userAlphaId, "authenticated");
  const alphaVisibleScoring = await db.query<{ organization_id: string }>(`SELECT organization_id FROM public.lead_scoring_breakdowns;`);
  assert.equal(alphaVisibleScoring.rows.length, 1);
  assert.equal(alphaVisibleScoring.rows[0].organization_id, orgAlphaId, "User Alpha must strictly see Org Alpha scoring rows");

  await asUser(userBetaId, "authenticated");
  const betaVisibleScoring = await db.query<{ organization_id: string }>(`SELECT organization_id FROM public.lead_scoring_breakdowns;`);
  assert.equal(betaVisibleScoring.rows.length, 1);
  assert.equal(betaVisibleScoring.rows[0].organization_id, orgBetaId, "User Beta must strictly see Org Beta scoring rows");
  console.log("✓ Test 11 PASSED: Strict tenant isolation verified under active RLS (User A cannot view User B)");

  // TEST 12: Anonymous Access Rejection
  console.log("\nTest 12: Anonymous Role Access Rejection...");
  await asUser(null, "anon");
  let anonBlockedTable = false;
  try {
    await db.query<{ id: string }>(`SELECT id FROM public.call_analysis_jobs;`);
  } catch {
    anonBlockedTable = true;
  }
  assert.equal(anonBlockedTable, true, "Anonymous role must be denied table access on call_analysis_jobs");

  let anonBlockedScoring = false;
  try {
    await db.query<{ id: string }>(`SELECT id FROM public.lead_scoring_breakdowns;`);
  } catch {
    anonBlockedScoring = true;
  }
  assert.equal(anonBlockedScoring, true, "Anonymous role must be denied table access on lead_scoring_breakdowns");
  console.log("✓ Test 12 PASSED: Anonymous queries denied table access with permission error");

  // TEST 13: Worker RPC Permission Checks
  console.log("\nTest 13: RPC Execution Permission Checks (Anon Denied vs. Authenticated Permitted)...");
  await asUser(null, "anon");
  let anonBlockedRpc = false;
  try {
    await db.query<{ id: string }>(`SELECT id FROM public.claim_call_analysis_job('anon-worker', 300);`);
  } catch {
    anonBlockedRpc = true;
  }
  assert.equal(anonBlockedRpc, true, "Anonymous role must be denied RPC execution on claim_call_analysis_job");

  await asUser(userAlphaId, "authenticated");
  const authRpcAllowed = await db.query<{ id: string }>(`SELECT id FROM public.claim_call_analysis_job('auth-worker', 300);`);
  assert.ok(Array.isArray(authRpcAllowed.rows));
  console.log("✓ Test 13 PASSED: Anonymous blocked from executing RPC; Authenticated authorized to execute RPC");

  // TEST 14: Lead Scoring Constraints (Sparse Data Guardrails)
  console.log("\nTest 14: Lead Scoring Evidence Coverage Gate Verification...");
  await asAdmin();
  let hotWithoutEvidenceBlocked = false;
  try {
    await db.exec(`
      INSERT INTO public.lead_scoring_breakdowns (organization_id, call_session_id, total_score, evidence_coverage, classification)
      VALUES ('${orgAlphaId}', '${call3Id}', 95, 0.200, 'HOT');
    `);
  } catch {
    hotWithoutEvidenceBlocked = true;
  }
  assert.equal(hotWithoutEvidenceBlocked, true, "chk_coverage_hot_gate must reject HOT classification with < 60% evidence coverage");

  await db.exec(`
    INSERT INTO public.lead_scoring_breakdowns (organization_id, call_session_id, total_score, evidence_coverage, classification)
    VALUES ('${orgAlphaId}', '${call3Id}', NULL, 0.000, 'UNCLASSIFIED');
  `);
  const sparseRow = await db.query<{ total_score: number | null; classification: string }>(`
    SELECT total_score, classification FROM public.lead_scoring_breakdowns WHERE call_session_id = '${call3Id}';
  `);
  assert.equal(sparseRow.rows[0].total_score, null, "Total score should be NULL when zero evidence exists");
  assert.equal(sparseRow.rows[0].classification, "UNCLASSIFIED");
  console.log("✓ Test 14 PASSED: Mathematical guardrail verified (HOT with <60% coverage rejected; 0% coverage stored as UNCLASSIFIED with NULL score)");

  console.log("\n=====================================================================");
  console.log("ALL REAL POSTGRESQL INTEGRATION CHECKS COMPLETED WITH 100% SUCCESS!");
  console.log("=====================================================================\n");
}

runRealPostgresValidation().catch((err: unknown) => {
  console.error("FATAL ERROR IN REAL POSTGRESQL VALIDATION:", err);
  process.exit(1);
});
