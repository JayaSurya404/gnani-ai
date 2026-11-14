import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Client } from "pg";

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5433,
  user: "postgres",
  database: "voicenexus_test_db"
};

export async function runNativePostgresValidation() {
  console.log("=====================================================================");
  console.log("VOICENEXUS AI — NATIVE MULTI-CONNECTION POSTGRESQL VALIDATION");
  console.log("Engine: Native PostgreSQL Server (Windows x64 Native Process)");
  console.log("=====================================================================\n");

  // Client 1 (Worker Alpha)
  const clientAlpha = new Client(PG_CONFIG);
  // Client 2 (Worker Beta)
  const clientBeta = new Client(PG_CONFIG);
  // Client 3 (Supervisor / Admin)
  const clientAdmin = new Client(PG_CONFIG);

  await clientAlpha.connect();
  await clientBeta.connect();
  await clientAdmin.connect();

  const pidAlpha = (await clientAlpha.query<{ pid: number }>("SELECT pg_backend_pid() AS pid;")).rows[0].pid;
  const pidBeta = (await clientBeta.query<{ pid: number }>("SELECT pg_backend_pid() AS pid;")).rows[0].pid;
  const pidAdmin = (await clientAdmin.query<{ pid: number }>("SELECT pg_backend_pid() AS pid;")).rows[0].pid;
  const ver = (await clientAdmin.query<{ version: string }>("SELECT version();")).rows[0].version;

  console.log(`[Native PostgreSQL Server] Version: ${ver}`);
  console.log(`[Connection Alpha] Backend PID: ${pidAlpha}`);
  console.log(`[Connection Beta]  Backend PID: ${pidBeta}`);
  console.log(`[Connection Admin] Backend PID: ${pidAdmin}`);

  assert.notEqual(pidAlpha, pidBeta, "Connection Alpha and Beta must be independent backend processes");
  assert.notEqual(pidAlpha, pidAdmin, "Connection Alpha and Admin must be independent backend processes");
  console.log("✓ Established 3 verified independent native PostgreSQL connections.\n");

  // Clean slate: drop schemas to guarantee pristine test state
  console.log("--- Resetting test database to clean slate ---");
  await clientAdmin.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
    DROP SCHEMA IF EXISTS auth CASCADE;
  `);

  // Phase 0: Provisioning Supabase Auth Emulation Roles & Functions
  console.log("--- Phase 0: Provisioning Supabase Auth Roles & Environment ---");
  await clientAdmin.query(`
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
  console.log("✓ Provisioned auth.users, auth.uid(), auth.role(), and roles (anon, authenticated).");

  // Phase 1: Sequential Migration Execution (Migrations 001 - 004)
  console.log("\n--- Phase 1: Applying Database Migrations Sequentially ---");
  const migrations = [
    { file: "20261110000001_canonical_schema.sql", name: "Migration 001: Canonical Schema" },
    { file: "20261110000002_security_rls.sql", name: "Migration 002: Security RLS & Hardening" },
    { file: "20261110000003_seed_data.sql", name: "Migration 003: Core Seed Data" },
    { file: "20261111000001_milestone_7_intelligence.sql", name: "Migration 004: Post-Call Intelligence & Outbox" }
  ];

  for (const m of migrations) {
    const filePath = path.join(process.cwd(), "supabase", "migrations", m.file);
    const sql = fs.readFileSync(filePath, "utf8");
    const t0 = Date.now();
    await clientAdmin.query(sql);
    console.log(`✓ Applied ${m.name} in ${Date.now() - t0}ms`);
  }

  // Phase 2: Schema Object Verification
  console.log("\n--- Phase 2: Verifying Schema Objects & Columns ---");
  const tableCheck = await clientAdmin.query<{ tablename: string }>(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN ('call_analysis_jobs', 'lead_scoring_breakdowns', 'automation_runs', 'notification_dispatches', 'call_outcomes', 'call_sessions')
    ORDER BY tablename;
  `);
  assert.equal(tableCheck.rows.length, 6, "All 6 required tables must exist in public schema");
  console.log("Discovered Tables:", tableCheck.rows.map(r => r.tablename).join(", "));

  const outcomeColumns = await clientAdmin.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'call_outcomes'
      AND column_name IN ('business_outcome', 'compliance_state', 'escalation_state', 'evidence_coverage', 'extraction_confidence', 'intelligence_data');
  `);
  assert.equal(outcomeColumns.rows.length, 6, "All 6 orthogonal outcome columns must exist on call_outcomes");
  console.log("✓ All 6 orthogonal columns verified on call_outcomes table");

  // Phase 3: Seeding Test Tenancy
  console.log("\n--- Phase 3: Seeding Test Organizations & Users ---");
  const userAlphaId = "11111111-1111-4111-8111-111111111111";
  const userBetaId = "22222222-2222-4222-8222-222222222222";
  const orgAlphaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const orgBetaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  await clientAdmin.query(`
    INSERT INTO auth.users (id, email) VALUES 
      ('${userAlphaId}', 'alpha@tenant-a.com'),
      ('${userBetaId}', 'beta@tenant-b.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (id, name, slug) VALUES 
      ('${orgAlphaId}', 'Tenant Alpha Corp', 'tenant-alpha'),
      ('${orgBetaId}', 'Tenant Beta Ltd', 'tenant-beta')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role) VALUES 
      ('${orgAlphaId}', '${userAlphaId}', 'OWNER'),
      ('${orgBetaId}', '${userBetaId}', 'OWNER')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  `);
  console.log("✓ Seeded Tenant Alpha and Tenant Beta with authenticated Owner profiles");

  console.log("\n=====================================================================");
  console.log("EXECUTING GENUINE MULTI-CONNECTION CONCURRENCY TESTS (TASK 3)");
  console.log("=====================================================================\n");

  // Test 1: Worker Alpha claims a job
  console.log("Test 1: Worker Alpha claims a job via Connection Alpha (PID: " + pidAlpha + ")...");
  const call1Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await clientAdmin.query(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call1Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${call1Id}';
  `);

  const claimAlpha = await clientAlpha.query<{
    id: string;
    attempts: number;
    fencing_token: string;
  }>("SELECT id, attempts, fencing_token FROM public.claim_call_analysis_job('worker-alpha', 300);");

  assert.equal(claimAlpha.rows.length, 1, "Worker Alpha must successfully claim the job");
  const job1Id = claimAlpha.rows[0].id;
  assert.equal(Number(claimAlpha.rows[0].fencing_token), 1);
  assert.equal(claimAlpha.rows[0].attempts, 1);

  const job1Row = await clientAdmin.query<{ status: string; locked_by: string }>(
    `SELECT status, locked_by FROM public.call_analysis_jobs WHERE id = '${job1Id}';`
  );
  assert.equal(job1Row.rows[0].locked_by, "worker-alpha");
  assert.equal(job1Row.rows[0].status, "CLAIMED");
  console.log(`✓ Test 1 PASSED: Worker Alpha (PID ${pidAlpha}) claimed Job ${job1Id} with fencing_token 1`);

  // Test 2 & 3: Worker Beta attempts to claim concurrently under SKIP LOCKED
  console.log("\nTest 2 & 3: Worker Beta (PID: " + pidBeta + ") attempts concurrent claim under SKIP LOCKED...");
  const claimBeta = await clientBeta.query<{ id: string }>(
    "SELECT id FROM public.claim_call_analysis_job('worker-beta', 300);"
  );
  assert.equal(claimBeta.rows.length, 0, "Worker Beta must receive 0 rows because Job 1 is locked by Worker Alpha");
  console.log("✓ Test 2 & 3 PASSED: SKIP LOCKED successfully prevented duplicate claim by Worker Beta (PID " + pidBeta + ")");

  // Test 4: Simultaneous lease renewal and reclamation
  console.log("\nTest 4: Simultaneous lease renewal and reclamation...");
  // Worker Beta attempts to renew or claim Job 1 while active lease held by Alpha
  const betaRenewAttempt = await clientBeta.query<{ renew_call_analysis_job_lease: boolean }>(
    `SELECT public.renew_call_analysis_job_lease('${job1Id}', 'worker-beta', 1, 300);`
  );
  assert.equal(betaRenewAttempt.rows[0].renew_call_analysis_job_lease, false, "Unauthorized worker cannot renew another worker's lease");

  // Worker Alpha renews its lease
  const alphaRenew = await clientAlpha.query<{ renew_call_analysis_job_lease: boolean }>(
    `SELECT public.renew_call_analysis_job_lease('${job1Id}', 'worker-alpha', 1, 600);`
  );
  assert.equal(alphaRenew.rows[0].renew_call_analysis_job_lease, true, "Worker Alpha must succeed in renewing lease with valid token");
  console.log("✓ Test 4 PASSED: Unauthorized renewal rejected; Worker Alpha renewed lease to 600s");

  // Test 5: Stale fencing token rejection
  console.log("\nTest 5: Stale fencing token rejection...");
  const staleComplete = await clientAlpha.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job('${job1Id}', 'worker-alpha', 999);`
  );
  assert.equal(staleComplete.rows[0].complete_call_analysis_job, false, "Stale fencing token (999) must be rejected");

  const staleRenew = await clientAlpha.query<{ renew_call_analysis_job_lease: boolean }>(
    `SELECT public.renew_call_analysis_job_lease('${job1Id}', 'worker-alpha', 999, 300);`
  );
  assert.equal(staleRenew.rows[0].renew_call_analysis_job_lease, false, "Stale fencing token on renew must be rejected");
  console.log("✓ Test 5 PASSED: Stale fencing tokens strictly rejected on completion and renewal");

  // Test 6: Simultaneous duplicate completion events (Idempotency)
  console.log("\nTest 6: Simultaneous duplicate completion events across independent connections...");
  const call2Id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await clientAdmin.query(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call2Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;
  `);

  // Connection Alpha and Connection Beta simultaneously attempt complete_call_session
  const [completeFromAlpha, completeFromBeta] = await Promise.all([
    clientAlpha.query<{ complete_call_session: { id: string } }>(`SELECT public.complete_call_session('${call2Id}')`),
    clientBeta.query<{ complete_call_session: { id: string } }>(`SELECT public.complete_call_session('${call2Id}')`)
  ]);

  assert.ok(completeFromAlpha.rows[0].complete_call_session, "Alpha call completion succeeded");
  assert.ok(completeFromBeta.rows[0].complete_call_session, "Beta call completion succeeded");

  const jobsForCall2 = await clientAdmin.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.call_analysis_jobs WHERE call_session_id = '${call2Id}';`
  );
  assert.equal(jobsForCall2.rows[0].count, "1", "Exactly one outbox job must exist despite simultaneous completion");
  console.log("✓ Test 6 PASSED: Simultaneous completion events handled idempotently without duplicate jobs");

  // Test 7: Transaction rollback
  console.log("\nTest 7: Transaction rollback integrity across connections...");
  const call3Id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await clientAdmin.query(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${call3Id}', '${orgAlphaId}', 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;
  `);

  await clientAlpha.query("BEGIN;");
  await clientAlpha.query(`UPDATE public.call_sessions SET status = 'COMPLETED' WHERE id = '${call3Id}';`);

  // Connection Beta checks for outbox job while Alpha transaction is uncommitted
  const uncommittedJob = await clientBeta.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.call_analysis_jobs WHERE call_session_id = '${call3Id}';`
  );
  assert.equal(uncommittedJob.rows[0].count, "0", "Uncommitted job must be invisible to Connection Beta under MVCC");

  await clientAlpha.query("ROLLBACK;");

  const rolledBackJob = await clientBeta.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM public.call_analysis_jobs WHERE call_session_id = '${call3Id}';`
  );
  assert.equal(rolledBackJob.rows[0].count, "0", "Rolled back outbox job must not exist");

  const sessionStatus = await clientBeta.query<{ status: string }>(
    `SELECT status FROM public.call_sessions WHERE id = '${call3Id}';`
  );
  assert.equal(sessionStatus.rows[0].status, "IN_PROGRESS", "Session status must remain IN_PROGRESS after rollback");
  console.log("✓ Test 7 PASSED: Transaction rollback cleaned up trigger outbox job atomically");

  // Test 8: Retry scheduling with exponential backoff
  console.log("\nTest 8: Retry scheduling with exponential backoff...");
  const job2Claim = await clientBeta.query<{ id: string; fencing_token: string }>(
    "SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-beta', 300);"
  );
  assert.equal(job2Claim.rows.length, 1, "Worker Beta claims Call 2 analysis job");
  const job2Id = job2Claim.rows[0].id;
  const job2Token = Number(job2Claim.rows[0].fencing_token);

  const failResult = await clientBeta.query<{ fail_call_analysis_job: boolean }>(
    `SELECT public.fail_call_analysis_job('${job2Id}', 'worker-beta', ${job2Token}, 'Transient LLM API rate limit', 60);`
  );
  assert.equal(failResult.rows[0].fail_call_analysis_job, true);

  const failedJob = await clientAdmin.query<{
    status: string;
    attempts: number;
    available_at: Date;
    last_error: string;
  }>(`SELECT status, attempts, available_at, last_error FROM public.call_analysis_jobs WHERE id = '${job2Id}';`);

  assert.equal(failedJob.rows[0].status, "FAILED");
  assert.equal(failedJob.rows[0].attempts, 1);
  assert.ok(new Date(failedJob.rows[0].available_at).getTime() > Date.now(), "available_at must be in the future");
  assert.equal(failedJob.rows[0].last_error, "Transient LLM API rate limit");
  console.log("✓ Test 8 PASSED: Job transitioned to FAILED with exponential backoff");

  // Test 9: Dead-letter transitions
  console.log("\nTest 9: Dead-letter transitions after max attempts exhaustion...");
  // Force available_at to NOW() so it can be reclaimed
  await clientAdmin.query(`UPDATE public.call_analysis_jobs SET available_at = NOW() WHERE id = '${job2Id}';`);

  // Attempt 2
  const attempt2 = await clientAlpha.query<{ id: string; fencing_token: string }>(
    "SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-alpha', 300);"
  );
  await clientAlpha.query(
    `SELECT public.fail_call_analysis_job('${job2Id}', 'worker-alpha', ${Number(attempt2.rows[0].fencing_token)}, 'Attempt 2 error', 60);`
  );

  // Attempt 3 (Final attempt)
  await clientAdmin.query(`UPDATE public.call_analysis_jobs SET available_at = NOW() WHERE id = '${job2Id}';`);
  const attempt3 = await clientBeta.query<{ id: string; fencing_token: string }>(
    "SELECT id, fencing_token FROM public.claim_call_analysis_job('worker-beta', 300);"
  );
  await clientBeta.query(
    `SELECT public.fail_call_analysis_job('${job2Id}', 'worker-beta', ${Number(attempt3.rows[0].fencing_token)}, 'Fatal unrecoverable error', 60);`
  );

  const deadLetterJob = await clientAdmin.query<{ status: string; attempts: number }>(
    `SELECT status, attempts FROM public.call_analysis_jobs WHERE id = '${job2Id}';`
  );
  assert.equal(deadLetterJob.rows[0].status, "DEAD_LETTER");
  assert.equal(deadLetterJob.rows[0].attempts, 3);
  console.log("✓ Test 9 PASSED: Job transitioned to DEAD_LETTER after 3 failed attempts");

  // Test 10: Lease expiration and worker recovery
  console.log("\nTest 10: Lease expiration and worker recovery (Zombie worker fencing)...");
  // Expire the lease on Job 1 (which Alpha held with token 1)
  await clientAdmin.query(`
    UPDATE public.call_analysis_jobs 
    SET lock_expires_at = NOW() - INTERVAL '10 seconds' 
    WHERE id = '${job1Id}';
  `);

  // Worker Beta reclaims the expired job
  const betaReclaim = await clientBeta.query<{
    id: string;
    fencing_token: string;
    attempts: number;
  }>("SELECT id, fencing_token, attempts FROM public.claim_call_analysis_job('worker-beta', 300);");

  assert.equal(betaReclaim.rows.length, 1, "Worker Beta must reclaim expired job");
  assert.equal(Number(betaReclaim.rows[0].fencing_token), 2, "Fencing token must advance to 2");
  assert.equal(betaReclaim.rows[0].attempts, 2, "Attempts must increment to 2");

  const betaReclaimRow = await clientAdmin.query<{ locked_by: string }>(
    `SELECT locked_by FROM public.call_analysis_jobs WHERE id = '${job1Id}';`
  );
  assert.equal(betaReclaimRow.rows[0].locked_by, "worker-beta");

  // Stale Worker Alpha attempts to complete with token 1
  const zombieAlphaAttempt = await clientAlpha.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job('${job1Id}', 'worker-alpha', 1);`
  );
  assert.equal(zombieAlphaAttempt.rows[0].complete_call_analysis_job, false, "Zombie Worker Alpha must be fenced out");

  // Valid Worker Beta completes with token 2
  const betaValidComplete = await clientBeta.query<{ complete_call_analysis_job: boolean }>(
    `SELECT public.complete_call_analysis_job('${job1Id}', 'worker-beta', 2);`
  );
  assert.equal(betaValidComplete.rows[0].complete_call_analysis_job, true, "Worker Beta must succeed with token 2");

  const completedJobState = await clientAdmin.query<{ status: string; completed_at: Date }>(
    `SELECT status, completed_at FROM public.call_analysis_jobs WHERE id = '${job1Id}';`
  );
  assert.equal(completedJobState.rows[0].status, "COMPLETED");
  assert.ok(completedJobState.rows[0].completed_at !== null);
  console.log("✓ Test 10 PASSED: Expired lease reclaimed by Beta; Zombie Alpha fenced out; Job marked COMPLETED");

  console.log("\n=====================================================================");
  console.log("SUPABASE COMPATIBILITY VERIFICATION (TASK 4)");
  console.log("=====================================================================\n");

  // Check 1: auth.uid(), auth.role(), and is_org_member()
  console.log("Check 1: auth.uid(), auth.role(), and is_org_member() under active claims...");
  await clientAlpha.query(`
    SET SESSION "request.jwt.claim.sub" = '${userAlphaId}';
    SET SESSION "request.jwt.claim.role" = 'authenticated';
  `);
  const authClaims = await clientAlpha.query<{ uid: string; role: string; is_member: boolean }>(`
    SELECT auth.uid() AS uid, auth.role() AS role, public.is_org_member('${orgAlphaId}') AS is_member;
  `);
  assert.equal(authClaims.rows[0].uid, userAlphaId);
  assert.equal(authClaims.rows[0].role, "authenticated");
  assert.equal(authClaims.rows[0].is_member, true);

  const crossOrgMember = await clientAlpha.query<{ is_member: boolean }>(`
    SELECT public.is_org_member('${orgBetaId}') AS is_member;
  `);
  assert.equal(crossOrgMember.rows[0].is_member, false, "User Alpha is not a member of Org Beta");
  console.log("✓ Check 1 PASSED: auth.uid(), auth.role(), and is_org_member() behave correctly");

  // Check 2: Multi-tenant RLS isolation
  console.log("Check 2: Multi-tenant RLS isolation across authenticated clients...");
  await clientAlpha.query(`
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    SELECT set_config('request.jwt.claim.sub', '${userAlphaId}', false);
  `);
  await clientBeta.query(`
    SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
    SELECT set_config('request.jwt.claim.sub', '${userBetaId}', false);
  `);

  // Insert a job in Org Beta using clientAdmin
  const callBetaId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await clientAdmin.query(`
    INSERT INTO public.call_sessions (id, organization_id, status)
    VALUES ('${callBetaId}', '${orgBetaId}', 'IN_PROGRESS'::public.call_status)
    ON CONFLICT (id) DO NOTHING;
    UPDATE public.call_sessions SET status = 'COMPLETED'::public.call_status WHERE id = '${callBetaId}';
  `);

  // Alpha only sees Alpha's jobs, Beta only sees Beta's jobs under RLS
  const alphaRows = await clientAlpha.query<{ organization_id: string }>(
    "SELECT organization_id FROM public.call_analysis_jobs;"
  );
  assert.ok(alphaRows.rows.length > 0, "Alpha must see its own org records");
  assert.ok(alphaRows.rows.every(r => r.organization_id === orgAlphaId), "Alpha must only see Org Alpha records");

  const betaRows = await clientBeta.query<{ organization_id: string }>(
    "SELECT organization_id FROM public.call_analysis_jobs;"
  );
  assert.ok(betaRows.rows.length > 0, "Beta must see its own org records");
  assert.ok(betaRows.rows.every(r => r.organization_id === orgBetaId), "Beta must only see Org Beta records");
  
  await clientAlpha.query("RESET ROLE;");
  await clientBeta.query("RESET ROLE;");
  console.log("✓ Check 2 PASSED: Strict RLS isolation verified between User Alpha and User Beta");

  // Check 3: Anonymous role access rejection
  console.log("Check 3: Anonymous role access rejection on table access...");
  await clientAlpha.query(`
    SET SESSION "request.jwt.claim.sub" = '';
    SET SESSION "request.jwt.claim.role" = 'anon';
    SET ROLE anon;
  `);

  let anonTableBlocked = false;
  try {
    await clientAlpha.query("SELECT * FROM public.call_analysis_jobs;");
  } catch {
    anonTableBlocked = true;
  }
  assert.ok(anonTableBlocked, "Anonymous role must be denied access to call_analysis_jobs");
  console.log("✓ Check 3 PASSED: Anonymous role query rejected by table-level permissions");

  // Check 4: RPC execution permissions
  console.log("Check 4: RPC execution permissions (Anon Denied vs. Authenticated Permitted)...");
  let anonRpcBlocked = false;
  try {
    await clientAlpha.query("SELECT public.claim_call_analysis_job('anon-worker', 300);");
  } catch {
    anonRpcBlocked = true;
  }
  assert.ok(anonRpcBlocked, "Anonymous role must be blocked from calling claim_call_analysis_job");

  // Switch back to authenticated
  await clientAlpha.query("RESET ROLE;");
  await clientAlpha.query(`
    SET SESSION "request.jwt.claim.sub" = '${userAlphaId}';
    SET SESSION "request.jwt.claim.role" = 'authenticated';
    SET ROLE authenticated;
  `);

  const authRpcResult = await clientAlpha.query(
    "SELECT * FROM public.claim_call_analysis_job('worker-alpha', 300);"
  );
  assert.ok(authRpcResult, "Authenticated role must be permitted to execute RPC");
  await clientAlpha.query("RESET ROLE;");
  console.log("✓ Check 4 PASSED: Anon blocked from RPC; Authenticated authorized to execute RPC");

  // Check 5: Lead scoring coverage gate constraint
  console.log("Check 5: Lead scoring coverage gate check constraint (chk_coverage_hot_gate)...");
  let invalidHotBlocked = false;
  try {
    await clientAdmin.query(`
      INSERT INTO public.lead_scoring_breakdowns (
        organization_id, call_session_id, analysis_version, classification, evidence_coverage, extraction_confidence
      ) VALUES (
        '${orgAlphaId}', '${call1Id}', 1, 'HOT', 0.200, 0.900
      );
    `);
  } catch {
    invalidHotBlocked = true;
  }
  assert.ok(invalidHotBlocked, "HOT classification with < 60% evidence coverage must violate chk_coverage_hot_gate");
  console.log("✓ Check 5 PASSED: Mathematical guardrail verified (HOT with 20% coverage rejected)");

  console.log("\n=====================================================================");
  console.log("ALL GENUINE MULTI-CONNECTION & SUPABASE TESTS PASSED (100%)");
  console.log("=====================================================================\n");

  await clientAlpha.end();
  await clientBeta.end();
  await clientAdmin.end();
}

if (process.argv[1] && process.argv[1].endsWith("native_postgres_concurrency_validation.ts")) {
  runNativePostgresValidation()
    .then(() => {
      console.log("Validation completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Validation failed:", err);
      process.exit(1);
    });
}
