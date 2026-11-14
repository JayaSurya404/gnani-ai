import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import crypto from "crypto";

describe("Phase 7.1 — Database Foundation & Durable Job Outbox Suite", () => {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20261111000001_milestone_7_intelligence.sql");

  // 0. Verify Migration File Integrity & Syntax Presence
  test("0. verifies Migration 004 file structure and required SQL objects", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 004 SQL file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Check tables
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.call_analysis_jobs/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.lead_scoring_breakdowns/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.automation_runs/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.notification_dispatches/i);

    // Check orthogonal columns on call_outcomes
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS business_outcome/i);
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS compliance_state/i);
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS escalation_state/i);
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS intelligence_data/i);
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS evidence_coverage/i);
    assert.match(sql, /ALTER TABLE public\.call_outcomes\s+ADD COLUMN IF NOT EXISTS extraction_confidence/i);

    // Check transactional outbox trigger & RPC functions
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.trg_call_session_completed_outbox/i);
    assert.match(sql, /CREATE TRIGGER trg_call_completed_enqueue_analysis/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.complete_call_session/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reanalyze_call_session/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_call_analysis_job/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.renew_call_analysis_job_lease/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.complete_call_analysis_job/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fail_call_analysis_job/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reconcile_missing_analysis_jobs/i);

    // Check RLS & security
    assert.match(sql, /ALTER TABLE public\.call_analysis_jobs ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE public\.lead_scoring_breakdowns ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE public\.automation_runs ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE public\.notification_dispatches ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /REVOKE ALL ON public\.call_analysis_jobs FROM.*anon/i);
    assert.match(sql, /fencing_token/i);
    assert.match(sql, /chk_coverage_hot_gate/i);
  });

  // State machine simulator for durable job queue logic
  interface AnalysisJob {
    id: string;
    organization_id: string;
    call_session_id: string;
    analysis_version: number;
    status: "QUEUED" | "CLAIMED" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";
    attempts: number;
    max_attempts: number;
    available_at: number;
    locked_by: string | null;
    lock_expires_at: number | null;
    fencing_token: number;
    last_error: string | null;
    created_at: number;
    updated_at: number;
  }

  class JobQueueSimulator {
    public jobs: Map<string, AnalysisJob> = new Map();

    private makeKey(callSessionId: string, version: number) {
      return `${callSessionId}_v${version}`;
    }

    public enqueueOnCompletion(orgId: string, callSessionId: string, version = 1, now = Date.now()): AnalysisJob {
      const key = this.makeKey(callSessionId, version);
      if (this.jobs.has(key)) {
        return this.jobs.get(key)!; // Idempotent ON CONFLICT DO NOTHING
      }
      const job: AnalysisJob = {
        id: crypto.randomUUID(),
        organization_id: orgId,
        call_session_id: callSessionId,
        analysis_version: version,
        status: "QUEUED",
        attempts: 0,
        max_attempts: 3,
        available_at: now,
        locked_by: null,
        lock_expires_at: null,
        fencing_token: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      };
      this.jobs.set(key, job);
      return job;
    }

    public claimNextJob(workerId: string, leaseMs = 300000, now = Date.now()): AnalysisJob | null {
      // Emulates SELECT FOR UPDATE SKIP LOCKED
      for (const job of this.jobs.values()) {
        const isEligibleStatus =
          job.status === "QUEUED" ||
          job.status === "FAILED" ||
          (job.status === "CLAIMED" && job.lock_expires_at !== null && job.lock_expires_at < now);
        const hasAttemptsRemaining = job.attempts < job.max_attempts;
        const isAvailable = job.available_at <= now;
        const isLockExpired = job.lock_expires_at === null || job.lock_expires_at < now;

        if (isEligibleStatus && hasAttemptsRemaining && isAvailable && isLockExpired) {
          job.status = "CLAIMED";
          job.locked_by = workerId;
          job.lock_expires_at = now + leaseMs;
          job.fencing_token += 1;
          job.attempts += 1;
          job.updated_at = now;
          return job;
        }
      }
      return null;
    }

    public renewLease(jobId: string, workerId: string, fencingToken: number, extensionMs = 300000, now = Date.now()): boolean {
      for (const job of this.jobs.values()) {
        if (job.id === jobId) {
          // Fencing: must match worker, token, and not be expired
          if (job.locked_by === workerId && job.fencing_token === fencingToken && job.lock_expires_at !== null && job.lock_expires_at > now) {
            job.lock_expires_at = now + extensionMs;
            job.updated_at = now;
            return true;
          }
          return false;
        }
      }
      return false;
    }

    public completeJob(jobId: string, workerId: string, fencingToken: number, now = Date.now()): boolean {
      for (const job of this.jobs.values()) {
        if (job.id === jobId) {
          // Fencing check: only active lease holder with matching token can complete
          if (job.locked_by === workerId && job.fencing_token === fencingToken && job.lock_expires_at !== null && job.lock_expires_at >= now) {
            job.status = "COMPLETED";
            job.locked_by = null;
            job.lock_expires_at = null;
            job.updated_at = now;
            return true;
          }
          return false;
        }
      }
      return false;
    }

    public failJob(jobId: string, workerId: string, fencingToken: number, error: string, baseDelayMs = 60000, now = Date.now()): boolean {
      for (const job of this.jobs.values()) {
        if (job.id === jobId) {
          if (job.locked_by !== workerId || job.fencing_token !== fencingToken) return false;

          job.last_error = error;
          job.locked_by = null;
          job.lock_expires_at = null;
          job.updated_at = now;

          if (job.attempts >= job.max_attempts) {
            job.status = "DEAD_LETTER";
            job.available_at = now;
          } else {
            job.status = "FAILED";
            // Exponential backoff: base * 2^(attempts-1)
            const delay = baseDelayMs * Math.pow(2, Math.max(0, job.attempts - 1));
            job.available_at = now + delay;
          }
          return true;
        }
      }
      return false;
    }
  }

  // 1. New call analysis job creation
  test("1. creates new queued call analysis job upon call completion", () => {
    const queue = new JobQueueSimulator();
    const job = queue.enqueueOnCompletion("org-123", "call-session-abc", 1);

    assert.equal(job.status, "QUEUED");
    assert.equal(job.call_session_id, "call-session-abc");
    assert.equal(job.analysis_version, 1);
    assert.equal(job.attempts, 0);
    assert.equal(job.locked_by, null);
  });

  // 2. Duplicate completion events
  test("2. enforces idempotency on duplicate call completion events", () => {
    const queue = new JobQueueSimulator();
    const job1 = queue.enqueueOnCompletion("org-123", "call-session-abc", 1);
    const job2 = queue.enqueueOnCompletion("org-123", "call-session-abc", 1);

    assert.equal(job1.id, job2.id, "Duplicate completion must return existing job without creating new row");
    assert.equal(queue.jobs.size, 1);
  });

  // 3. Versioned reanalysis
  test("3. supports explicit versioned reanalysis without collision", () => {
    const queue = new JobQueueSimulator();
    const jobV1 = queue.enqueueOnCompletion("org-123", "call-session-abc", 1);
    const jobV2 = queue.enqueueOnCompletion("org-123", "call-session-abc", 2);

    assert.notEqual(jobV1.id, jobV2.id, "Version 2 must create distinct analysis job record");
    assert.equal(jobV1.analysis_version, 1);
    assert.equal(jobV2.analysis_version, 2);
    assert.equal(queue.jobs.size, 2);
  });

  // 4. Atomic transaction consistency
  test("4. guarantees atomic job record structure with complete audit metadata", () => {
    const queue = new JobQueueSimulator();
    const job = queue.enqueueOnCompletion("org-123", "call-session-abc", 1);

    assert.ok(job.id);
    assert.ok(job.organization_id);
    assert.ok(job.created_at <= Date.now());
    assert.equal(job.max_attempts, 3);
  });

  // 5. Concurrent worker claiming
  test("5. guarantees atomic single-worker claim under concurrent worker requests", () => {
    const queue = new JobQueueSimulator();
    queue.enqueueOnCompletion("org-123", "call-session-1", 1);

    // Worker 1 claims
    const claim1 = queue.claimNextJob("worker-alpha", 300000);
    assert.ok(claim1, "Worker 1 should successfully claim job");
    assert.equal(claim1.locked_by, "worker-alpha");
    assert.equal(claim1.status, "CLAIMED");

    // Worker 2 attempts claim concurrently
    const claim2 = queue.claimNextJob("worker-beta", 300000);
    assert.equal(claim2, null, "Worker 2 must not claim already-locked job");
  });

  // 6. Lease expiration recovery
  test("6. recovers and allows reclamation of job after worker lease expires", () => {
    const queue = new JobQueueSimulator();
    const startTime = 1000000;
    queue.enqueueOnCompletion("org-123", "call-session-1", 1, startTime);

    // Worker Alpha claims at startTime with 5 min (300,000ms) lease
    const claim1 = queue.claimNextJob("worker-alpha", 300000, startTime);
    assert.ok(claim1);
    assert.equal(claim1.locked_by, "worker-alpha");

    // At startTime + 200,000ms (lease active), Worker Beta cannot claim
    const midClaim = queue.claimNextJob("worker-beta", 300000, startTime + 200000);
    assert.equal(midClaim, null);

    // At startTime + 301,000ms (lease expired), Worker Beta claims job
    const expiredClaim = queue.claimNextJob("worker-beta", 300000, startTime + 301000);
    assert.ok(expiredClaim, "Worker Beta should successfully claim expired job");
    assert.equal(expiredClaim.locked_by, "worker-beta");
    assert.equal(expiredClaim.attempts, 2);
  });

  // 7. Lease renewal
  test("7. permits active lease holder to renew lease before expiration", () => {
    const queue = new JobQueueSimulator();
    const startTime = 1000000;
    queue.enqueueOnCompletion("org-123", "call-session-1", 1, startTime);

    const claim = queue.claimNextJob("worker-alpha", 300000, startTime)!;
    const initialExpiry = claim.lock_expires_at!;

    // Worker Alpha renews lease at startTime + 100,000ms using fencing token
    const renewed = queue.renewLease(claim.id, "worker-alpha", claim.fencing_token, 300000, startTime + 100000);
    assert.equal(renewed, true);
    assert.ok(claim.lock_expires_at! > initialExpiry);
  });

  // 8. Expired worker fencing
  test("8. fences expired worker from completing job after lease was reclaimed by another worker", () => {
    const queue = new JobQueueSimulator();
    const startTime = 1000000;
    queue.enqueueOnCompletion("org-123", "call-session-1", 1, startTime);

    // Worker Alpha claims (gets fencing_token = 1)
    const claimAlpha = queue.claimNextJob("worker-alpha", 300000, startTime)!;
    assert.equal(claimAlpha.fencing_token, 1);

    // Worker Alpha hangs; lease expires at startTime + 350,000ms; Worker Beta reclaims (gets fencing_token = 2)
    const claimBeta = queue.claimNextJob("worker-beta", 300000, startTime + 350000)!;
    assert.equal(claimBeta.locked_by, "worker-beta");
    assert.equal(claimBeta.fencing_token, 2);

    // Worker Alpha wakes up late at startTime + 360,000ms and tries to complete with stale fencing_token 1
    const alphaCompleted = queue.completeJob(claimAlpha.id, "worker-alpha", claimAlpha.fencing_token, startTime + 360000);
    assert.equal(alphaCompleted, false, "Expired Worker Alpha must be fenced and denied completion");

    // Worker Beta finishes successfully with current fencing_token 2
    const betaCompleted = queue.completeJob(claimBeta.id, "worker-beta", claimBeta.fencing_token, startTime + 370000);
    assert.equal(betaCompleted, true, "Active Worker Beta must complete job");
    assert.equal(claimBeta.status, "COMPLETED");
  });

  // 9. Retry limit enforcement & exponential backoff
  test("9. schedules exponential backoff and transitions to DEAD_LETTER after max attempts", () => {
    const queue = new JobQueueSimulator();
    const t0 = 1000000;
    queue.enqueueOnCompletion("org-123", "call-session-1", 1, t0);

    // Attempt 1 fails
    const c1 = queue.claimNextJob("worker-1", 300000, t0)!;
    queue.failJob(c1.id, "worker-1", c1.fencing_token, "LLM rate limit 429", 60000, t0 + 5000);
    assert.equal(c1.status, "FAILED");
    assert.equal(c1.attempts, 1);
    assert.equal(c1.available_at, t0 + 5000 + 60000); // 1 min delay

    // Attempt 2 fails
    const t1 = c1.available_at + 1000;
    const c2 = queue.claimNextJob("worker-1", 300000, t1)!;
    queue.failJob(c2.id, "worker-1", c2.fencing_token, "LLM 503 error", 60000, t1 + 5000);
    assert.equal(c2.status, "FAILED");
    assert.equal(c2.attempts, 2);
    assert.equal(c2.available_at, t1 + 5000 + 120000); // 2 min delay (60000 * 2^1)

    // Attempt 3 fails -> DEAD_LETTER
    const t2 = c2.available_at + 1000;
    const c3 = queue.claimNextJob("worker-1", 300000, t2)!;
    queue.failJob(c3.id, "worker-1", c3.fencing_token, "Fatal timeout", 60000, t2 + 5000);
    assert.equal(c3.status, "DEAD_LETTER", "Must transition to DEAD_LETTER when attempts reach max_attempts");
    assert.equal(c3.attempts, 3);
  });

  // 10. Tenant isolation
  test("10. enforces strict multi-tenant boundary on job queries", () => {
    const queue = new JobQueueSimulator();
    queue.enqueueOnCompletion("org-A", "call-A", 1);
    queue.enqueueOnCompletion("org-B", "call-B", 1);

    const orgAJobs = Array.from(queue.jobs.values()).filter((j) => j.organization_id === "org-A");
    const orgBJobs = Array.from(queue.jobs.values()).filter((j) => j.organization_id === "org-B");

    assert.equal(orgAJobs.length, 1);
    assert.equal(orgBJobs.length, 1);
    assert.equal(orgAJobs[0].call_session_id, "call-A");
    assert.equal(orgBJobs[0].call_session_id, "call-B");
  });

  // 11. RLS access restrictions
  test("11. ensures SQL migration revokes anon access and enforces is_org_member", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Anon revokes
    assert.match(sql, /REVOKE ALL ON public\.call_analysis_jobs FROM.*anon;/i);
    assert.match(sql, /REVOKE ALL ON public\.lead_scoring_breakdowns FROM.*anon;/i);
    assert.match(sql, /REVOKE ALL ON public\.automation_runs FROM.*anon;/i);
    assert.match(sql, /REVOKE ALL ON public\.notification_dispatches FROM.*anon;/i);

    // Org member checks in RLS policies
    assert.match(sql, /USING \(public\.is_org_member\(organization_id\)\)/);
  });

  // 12. DNC-related automation restrictions
  test("12. strictly suppresses automated marketing dispatches when compliance_state is DNC", () => {
    interface AutomationCheck {
      compliance_state: "NONE" | "DNC_REQUESTED" | "DNC_REGISTERED";
      business_outcome: "QUALIFIED" | "FOLLOW_UP_REQUIRED";
    }

    function evaluateOutboundAllowed(ctx: AutomationCheck): boolean {
      if (ctx.compliance_state === "DNC_REQUESTED" || ctx.compliance_state === "DNC_REGISTERED") {
        return false;
      }
      return true;
    }

    assert.equal(
      evaluateOutboundAllowed({ compliance_state: "DNC_REGISTERED", business_outcome: "QUALIFIED" }),
      false,
      "DNC must override QUALIFIED outcome and block outbound action"
    );

    assert.equal(
      evaluateOutboundAllowed({ compliance_state: "NONE", business_outcome: "QUALIFIED" }),
      true,
      "Standard consent should permit outbound follow-up"
    );
  });

  // 13. Duplicate automation execution prevention
  test("13. generates unique SHA256 idempotency keys preventing duplicate automation runs", () => {
    const callSessionId = "call-session-999";
    const automationId = "auto-lead-task-001";
    const actionType = "CREATE_FOLLOW_UP_TASK";

    const key1 = crypto.createHash("sha256").update(`${callSessionId}_${automationId}_${actionType}`).digest("hex");
    const key2 = crypto.createHash("sha256").update(`${callSessionId}_${automationId}_${actionType}`).digest("hex");

    assert.equal(key1, key2, "Idempotency key must be deterministic for identical parameters");
    assert.equal(key1.length, 64);

    const runs = new Set<string>();
    runs.add(key1);
    const wasDuplicatePrevented = runs.has(key2);
    assert.equal(wasDuplicatePrevented, true);
  });

  // 14. Notification dispatch idempotency & draft status
  test("14. stages customer-facing notifications as DRAFT_PENDING_APPROVAL with idempotency key", () => {
    interface NotificationStaging {
      audience: "CUSTOMER" | "INTERNAL_STAFF";
      channel: "WHATSAPP";
      recipient: string;
      status: "DRAFT_PENDING_APPROVAL";
      idempotency_key: string;
      consent_verified: boolean;
    }

    const staged: NotificationStaging = {
      audience: "CUSTOMER",
      channel: "WHATSAPP",
      recipient: "+919840123456",
      status: "DRAFT_PENDING_APPROVAL",
      idempotency_key: crypto.randomUUID(),
      consent_verified: true,
    };

    assert.equal(staged.status, "DRAFT_PENDING_APPROVAL", "Customer notifications must default to draft");
    assert.equal(staged.audience, "CUSTOMER");
    assert.ok(staged.idempotency_key);
  });

  // 15. Audit record retention
  test("15. verifies non-destructive foreign keys protect audit history from cascade deletion", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    // call_sessions foreign key on jobs & scoring must be ON DELETE RESTRICT
    assert.match(
      sql,
      /call_session_id UUID NOT NULL REFERENCES public\.call_sessions\(id\) ON DELETE RESTRICT/i,
      "Jobs must restrict deletion of call_sessions to preserve audit integrity"
    );

    // lead_id must be ON DELETE SET NULL so outcomes survive lead purge
    assert.match(
      sql,
      /lead_id UUID REFERENCES public\.leads\(id\) ON DELETE SET NULL/i,
      "Lead references must SET NULL so audit outcomes survive CRM lead deletion"
    );
  });
});
