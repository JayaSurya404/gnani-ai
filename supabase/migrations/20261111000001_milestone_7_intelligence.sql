-- =====================================================================
-- VoiceNexus AI — Migration 004: Post-Call Intelligence & Durable Outbox
-- Platform: Supabase PostgreSQL 15+
-- Domain: Post-Call Intelligence, Explainable Lead Scoring, Durable Outbox & Notification Records
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTEND CALL OUTCOMES TABLE (ORTHOGONAL DOMAINS)
-- ---------------------------------------------------------------------

-- Business outcome: Objective commercial result of the conversation
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS business_outcome TEXT NOT NULL DEFAULT 'UNRESOLVED'
  CHECK (business_outcome IN ('QUALIFIED', 'FOLLOW_UP_REQUIRED', 'NOT_INTERESTED', 'WRONG_NUMBER', 'UNRESOLVED', 'INFORMATIONAL_COMPLETE'));

-- Compliance state: Independent regulatory tracking under TRAI / TCPA rules
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS compliance_state TEXT NOT NULL DEFAULT 'NONE'
  CHECK (compliance_state IN ('NONE', 'DNC_REQUESTED', 'DNC_REGISTERED', 'DNC_REGISTRATION_FAILED'));

-- Escalation state: Operational human supervision & handoff tracking
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS escalation_state TEXT NOT NULL DEFAULT 'NONE'
  CHECK (escalation_state IN ('NONE', 'REQUESTED', 'FOLLOW_UP_PENDING', 'NOTIFICATION_DELIVERED', 'TRANSFER_COMPLETED'));

-- Structured grounded intelligence data (13 dimensions with turn quotes)
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS intelligence_data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Evidence coverage metric: Proportion of factors backed by observable transcript turns (0.0 to 1.0)
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS evidence_coverage NUMERIC(4, 3) NOT NULL DEFAULT 0.000
  CHECK (evidence_coverage >= 0.000 AND evidence_coverage <= 1.000);

-- Extraction confidence: Model extraction & audio transcription confidence (0.0 to 1.0)
ALTER TABLE public.call_outcomes 
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000
  CHECK (extraction_confidence >= 0.000 AND extraction_confidence <= 1.000);

-- ---------------------------------------------------------------------
-- 2. DURABLE POST-CALL ANALYSIS JOBS (TRANSACTIONAL OUTBOX)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.call_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE RESTRICT,
  analysis_version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'CLAIMED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  lock_expires_at TIMESTAMPTZ,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_call_analysis_job_version UNIQUE (call_session_id, analysis_version)
);

-- ---------------------------------------------------------------------
-- 3. LEAD SCORING BREAKDOWNS (EXPLAINABLE QUALIFICATION)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_scoring_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE RESTRICT,
  analysis_version INT NOT NULL DEFAULT 1,
  total_score INT CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 100)),
  normalized_observed_score NUMERIC(5, 2),
  observed_weight_total NUMERIC(4, 3) NOT NULL DEFAULT 0.000,
  evidence_coverage NUMERIC(4, 3) NOT NULL DEFAULT 0.000 CHECK (evidence_coverage >= 0.000 AND evidence_coverage <= 1.000),
  extraction_confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (extraction_confidence >= 0.000 AND extraction_confidence <= 1.000),
  classification TEXT NOT NULL DEFAULT 'UNCLASSIFIED'
    CHECK (classification IN ('HOT', 'WARM', 'COLD', 'UNCLASSIFIED')),
  scoring_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  unresolved_unknowns JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_version TEXT NOT NULL DEFAULT 'v1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lead_scoring_call_version UNIQUE (call_session_id, analysis_version),
  CONSTRAINT chk_coverage_hot_gate CHECK (
    (classification != 'HOT' OR evidence_coverage >= 0.600) AND
    (classification != 'WARM' OR evidence_coverage >= 0.400)
  )
);

-- ---------------------------------------------------------------------
-- 4. AUTOMATION EXECUTION HISTORY (ACTION-LEVEL IDEMPOTENCY)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE RESTRICT,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'SKIPPED_DNC', 'DEAD_LETTER')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  last_error TEXT,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 5. NOTIFICATION DISPATCHES (STAGING & AUDIT QUEUE)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_session_id UUID REFERENCES public.call_sessions(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  audience TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (audience IN ('CUSTOMER', 'INTERNAL_STAFF')),
  channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP', 'SMS', 'EMAIL')),
  recipient TEXT NOT NULL,
  consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
  consent_reference TEXT,
  rendered_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT_PENDING_APPROVAL'
    CHECK (status IN ('DRAFT_PENDING_APPROVAL', 'APPROVED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'REJECTED')),
  provider TEXT NOT NULL DEFAULT 'MOCK_CONSOLE',
  provider_message_id TEXT,
  idempotency_key TEXT UNIQUE,
  error_details JSONB,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  webhook_verification_metadata JSONB,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 6. PERFORMANCE INDEXES
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_jobs_status_available ON public.call_analysis_jobs(status, available_at, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_org_call ON public.call_analysis_jobs(organization_id, call_session_id);
CREATE INDEX IF NOT EXISTS idx_scoring_lead ON public.lead_scoring_breakdowns(lead_id);
CREATE INDEX IF NOT EXISTS idx_scoring_call_version ON public.lead_scoring_breakdowns(call_session_id, analysis_version);
CREATE INDEX IF NOT EXISTS idx_auto_runs_key ON public.automation_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_auto_runs_status ON public.automation_runs(status, available_at);
CREATE INDEX IF NOT EXISTS idx_notif_org_status ON public.notification_dispatches(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_idempotency ON public.notification_dispatches(idempotency_key);

-- ---------------------------------------------------------------------
-- 7. TRANSACTIONAL OUTBOX TRIGGER
-- ---------------------------------------------------------------------

-- Automatically creates the post-call analysis job in the same transaction when call_sessions status becomes COMPLETED
CREATE OR REPLACE FUNCTION public.trg_call_session_completed_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'COMPLETED'::public.call_status AND (OLD.status IS DISTINCT FROM 'COMPLETED'::public.call_status) THEN
    INSERT INTO public.call_analysis_jobs (
      organization_id,
      call_session_id,
      analysis_version,
      status,
      available_at
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      1,
      'QUEUED',
      NOW()
    )
    ON CONFLICT (call_session_id, analysis_version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_completed_enqueue_analysis ON public.call_sessions;
CREATE TRIGGER trg_call_completed_enqueue_analysis
  AFTER UPDATE OF status ON public.call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_call_session_completed_outbox();

-- ---------------------------------------------------------------------
-- 8. DATABASE RPC & WORKER FOUNDATION FUNCTIONS
-- ---------------------------------------------------------------------

-- RPC 1: Atomic Call Completion with Transactional Outbox Job Creation
CREATE OR REPLACE FUNCTION public.complete_call_session(
  p_call_session_id UUID,
  p_duration_seconds INT DEFAULT 0
)
RETURNS public.call_analysis_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.call_sessions%ROWTYPE;
  v_job public.call_analysis_jobs%ROWTYPE;
BEGIN
  -- Update call session atomically
  UPDATE public.call_sessions
  SET status = 'COMPLETED'::public.call_status,
      end_time = COALESCE(end_time, NOW()),
      duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
      updated_at = NOW()
  WHERE id = p_call_session_id
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call session not found: %', p_call_session_id;
  END IF;

  -- Insert or fetch analysis job safely without resetting status or stealing active leases
  INSERT INTO public.call_analysis_jobs (
    organization_id,
    call_session_id,
    analysis_version,
    status,
    available_at
  )
  VALUES (
    v_session.organization_id,
    v_session.id,
    1,
    'QUEUED',
    NOW()
  )
  ON CONFLICT (call_session_id, analysis_version)
  DO UPDATE SET updated_at = public.call_analysis_jobs.updated_at
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- RPC 1b: Explicit Versioned Reanalysis
CREATE OR REPLACE FUNCTION public.reanalyze_call_session(
  p_call_session_id UUID
)
RETURNS public.call_analysis_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.call_sessions%ROWTYPE;
  v_next_version INT;
  v_job public.call_analysis_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.call_sessions WHERE id = p_call_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call session not found: %', p_call_session_id;
  END IF;

  SELECT COALESCE(MAX(analysis_version), 0) + 1 INTO v_next_version
  FROM public.call_analysis_jobs
  WHERE call_session_id = p_call_session_id;

  INSERT INTO public.call_analysis_jobs (
    organization_id,
    call_session_id,
    analysis_version,
    status,
    available_at
  )
  VALUES (
    v_session.organization_id,
    v_session.id,
    v_next_version,
    'QUEUED',
    NOW()
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- RPC 2: Atomic Worker Job Claim with FOR UPDATE SKIP LOCKED & Fencing Token Generation
CREATE OR REPLACE FUNCTION public.claim_call_analysis_job(
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  call_session_id UUID,
  analysis_version INT,
  attempts INT,
  max_attempts INT,
  fencing_token BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Select next eligible queued, retryable, or expired-lease job skipping locked rows
  SELECT j.id INTO v_job_id
  FROM public.call_analysis_jobs j
  WHERE (
    j.status IN ('QUEUED', 'FAILED')
    OR (j.status IN ('CLAIMED', 'PROCESSING') AND j.lock_expires_at < NOW())
  )
    AND j.attempts < j.max_attempts
    AND j.available_at <= NOW()
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.call_analysis_jobs
    SET status = 'CLAIMED',
        locked_by = p_worker_id,
        lock_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        fencing_token = public.call_analysis_jobs.fencing_token + 1,
        attempts = public.call_analysis_jobs.attempts + 1,
        started_at = COALESCE(public.call_analysis_jobs.started_at, NOW()),
        updated_at = NOW()
    WHERE public.call_analysis_jobs.id = v_job_id
    RETURNING public.call_analysis_jobs.id,
              public.call_analysis_jobs.organization_id,
              public.call_analysis_jobs.call_session_id,
              public.call_analysis_jobs.analysis_version,
              public.call_analysis_jobs.attempts,
              public.call_analysis_jobs.max_attempts,
              public.call_analysis_jobs.fencing_token;
  END IF;
END;
$$;

-- RPC 3: Lease Renewal with Fencing Token Verification
CREATE OR REPLACE FUNCTION public.renew_call_analysis_job_lease(
  p_job_id UUID,
  p_worker_id TEXT,
  p_fencing_token BIGINT,
  p_lease_seconds INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.call_analysis_jobs
  SET lock_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND locked_by = p_worker_id
    AND fencing_token = p_fencing_token
    AND status IN ('CLAIMED', 'PROCESSING')
    AND lock_expires_at > NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- RPC 4: Complete Job with Fencing Check
CREATE OR REPLACE FUNCTION public.complete_call_analysis_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_fencing_token BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.call_analysis_jobs
  SET status = 'COMPLETED',
      completed_at = NOW(),
      locked_by = NULL,
      lock_expires_at = NULL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND locked_by = p_worker_id
    AND fencing_token = p_fencing_token
    AND status IN ('CLAIMED', 'PROCESSING')
    AND lock_expires_at >= NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- RPC 5: Fail Job with Exponential Backoff or Dead-Letter Transition
CREATE OR REPLACE FUNCTION public.fail_call_analysis_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_fencing_token BIGINT,
  p_error TEXT,
  p_retry_delay_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.call_analysis_jobs%ROWTYPE;
  v_next_status TEXT;
  v_next_available TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_job FROM public.call_analysis_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND 
     OR v_job.locked_by IS DISTINCT FROM p_worker_id 
     OR v_job.fencing_token IS DISTINCT FROM p_fencing_token THEN
    RETURN FALSE;
  END IF;

  IF v_job.attempts >= v_job.max_attempts THEN
    v_next_status := 'DEAD_LETTER';
    v_next_available := NOW();
  ELSE
    v_next_status := 'FAILED';
    -- Exponential backoff: delay * (2 ^ (attempts - 1))
    v_next_available := NOW() + (p_retry_delay_seconds * POWER(2, GREATEST(0, v_job.attempts - 1)) || ' seconds')::INTERVAL;
  END IF;

  UPDATE public.call_analysis_jobs
  SET status = v_next_status,
      last_error = p_error,
      available_at = v_next_available,
      locked_by = NULL,
      lock_expires_at = NULL,
      updated_at = NOW()
  WHERE id = p_job_id;

  RETURN TRUE;
END;
$$;

-- RPC 6: Backfill Reconciliation for Completed Calls Missing Analysis Jobs
CREATE OR REPLACE FUNCTION public.reconcile_missing_analysis_jobs(p_limit INT DEFAULT 50)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enqueued INT := 0;
BEGIN
  INSERT INTO public.call_analysis_jobs (
    organization_id,
    call_session_id,
    analysis_version,
    status,
    available_at
  )
  SELECT 
    cs.organization_id,
    cs.id,
    1,
    'QUEUED',
    NOW()
  FROM public.call_sessions cs
  LEFT JOIN public.call_analysis_jobs caj 
    ON caj.call_session_id = cs.id AND caj.analysis_version = 1
  WHERE cs.status = 'COMPLETED'::public.call_status
    AND caj.id IS NULL
  LIMIT p_limit
  ON CONFLICT (call_session_id, analysis_version) DO NOTHING;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;
  RETURN v_enqueued;
END;
$$;

-- ---------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------

ALTER TABLE public.call_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scoring_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;

-- Jobs
DROP POLICY IF EXISTS "jobs_select_member" ON public.call_analysis_jobs;
CREATE POLICY "jobs_select_member" ON public.call_analysis_jobs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "jobs_manage_member" ON public.call_analysis_jobs;
CREATE POLICY "jobs_manage_member" ON public.call_analysis_jobs
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Lead Scoring Breakdowns
DROP POLICY IF EXISTS "scoring_select_member" ON public.lead_scoring_breakdowns;
CREATE POLICY "scoring_select_member" ON public.lead_scoring_breakdowns
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "scoring_manage_member" ON public.lead_scoring_breakdowns;
CREATE POLICY "scoring_manage_member" ON public.lead_scoring_breakdowns
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Automation Runs
DROP POLICY IF EXISTS "runs_select_member" ON public.automation_runs;
CREATE POLICY "runs_select_member" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "runs_manage_member" ON public.automation_runs;
CREATE POLICY "runs_manage_member" ON public.automation_runs
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Notification Dispatches
DROP POLICY IF EXISTS "notif_select_member" ON public.notification_dispatches;
CREATE POLICY "notif_select_member" ON public.notification_dispatches
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "notif_manage_member" ON public.notification_dispatches;
CREATE POLICY "notif_manage_member" ON public.notification_dispatches
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- 10. PRIVILEGE BOUNDARIES & SECURITY HARDENING
-- ---------------------------------------------------------------------

-- Revoke all table-level access from anon and PUBLIC
REVOKE ALL ON public.call_analysis_jobs FROM PUBLIC, anon;
REVOKE ALL ON public.lead_scoring_breakdowns FROM PUBLIC, anon;
REVOKE ALL ON public.automation_runs FROM PUBLIC, anon;
REVOKE ALL ON public.notification_dispatches FROM PUBLIC, anon;

-- Grant authenticated permissions for tenant workspace operations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_analysis_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_scoring_breakdowns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_dispatches TO authenticated;

-- Revoke execution from PUBLIC and anon on RPCs
REVOKE ALL ON FUNCTION public.complete_call_session(UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reanalyze_call_session(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_call_analysis_job(TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.renew_call_analysis_job_lease(UUID, TEXT, BIGINT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_call_analysis_job(UUID, TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_call_analysis_job(UUID, TEXT, BIGINT, TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_missing_analysis_jobs(INT) FROM PUBLIC, anon;

-- Grant authenticated execution on RPCs
GRANT EXECUTE ON FUNCTION public.complete_call_session(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reanalyze_call_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_call_analysis_job(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_call_analysis_job_lease(UUID, TEXT, BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_call_analysis_job(UUID, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_call_analysis_job(UUID, TEXT, BIGINT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_analysis_jobs(INT) TO authenticated;
