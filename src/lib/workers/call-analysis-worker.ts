import { analyzeCallWithAI } from "../post-call-agent";
import type { TranscriptSegmentInput, ValidatedCallAnalysisResult } from "../intelligence/types";
import type { ComplianceState, EscalationState, CallDisposition } from "@/types/database";
import { AutomationOrchestrator } from "../automations/automation-orchestrator";

export interface DbQueryRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface WorkerOptions {
  workerId?: string;
  leaseSeconds?: number;
  backoffBaseSeconds?: number;
}

export interface WorkerProcessResult {
  claimed: boolean;
  jobId?: string;
  callSessionId?: string;
  analysisVersion?: number;
  fencingToken?: number;
  success?: boolean;
  fencedOut?: boolean;
  error?: string;
  durationMs?: number;
}

/**
 * Maps modern business outcome to legacy disposition for 100% backward compatibility
 */
function mapToLegacyDisposition(businessOutcome: string, complianceState: ComplianceState): CallDisposition {
  if (complianceState === "DNC_REQUESTED" || complianceState === "DNC_REGISTERED") {
    return "DO_NOT_CALL";
  }
  switch (businessOutcome) {
    case "QUALIFIED":
      return "INTERESTED";
    case "FOLLOW_UP_REQUIRED":
      return "CALLBACK_REQUESTED";
    case "NOT_INTERESTED":
      return "NOT_INTERESTED";
    case "WRONG_NUMBER":
      return "WRONG_NUMBER";
    case "INFORMATIONAL_COMPLETE":
      return "INTERESTED";
    default:
      return "VOICEMAIL";
  }
}

/**
 * Durable Call Analysis Background Worker
 * Handles atomic claiming with SKIP LOCKED, lease renewal, zombie worker fencing,
 * AI intelligence execution, and idempotent transactional persistence.
 */
export class CallAnalysisWorker {
  private db: DbQueryRunner;
  private workerId: string;
  private leaseSeconds: number;
  private backoffBaseSeconds: number;
  private isRunning = false;
  private stopRequested = false;

  constructor(db: DbQueryRunner, options: WorkerOptions = {}) {
    this.db = db;
    this.workerId = options.workerId || `worker-${Math.random().toString(36).slice(2, 9)}`;
    this.leaseSeconds = options.leaseSeconds || 300;
    this.backoffBaseSeconds = options.backoffBaseSeconds || 60;
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Claims and processes the next eligible call analysis job in the queue.
   */
  public async processNextJob(): Promise<WorkerProcessResult> {
    const t0 = Date.now();

    // 1. Claim next eligible job via atomic PostgreSQL RPC
    const claimRes = await this.db.query<{
      id: string;
      organization_id: string;
      call_session_id: string;
      analysis_version: number;
      attempts: number;
      max_attempts: number;
      fencing_token: string | number;
    }>(
      `SELECT * FROM public.claim_call_analysis_job($1, $2);`,
      [this.workerId, this.leaseSeconds]
    );

    if (claimRes.rows.length === 0) {
      return { claimed: false };
    }

    const job = claimRes.rows[0];
    const jobId = job.id;
    const orgId = job.organization_id;
    const sessionId = job.call_session_id;
    const analysisVersion = job.analysis_version;
    const fencingToken = Number(job.fencing_token);

    // Set up active lease renewal heartbeat
    let leaseRenewTimer: NodeJS.Timeout | null = null;
    const renewalIntervalMs = Math.max(10000, (this.leaseSeconds * 1000) / 3);

    leaseRenewTimer = setInterval(async () => {
      try {
        await this.db.query(
          `SELECT public.renew_call_analysis_job_lease($1, $2, $3, $4);`,
          [jobId, this.workerId, fencingToken, this.leaseSeconds]
        );
      } catch {
        // Heartbeat failure handled gracefully
      }
    }, renewalIntervalMs);

    try {
      // 2. Load call session and verify organization ownership
      const sessionRes = await this.db.query<{
        id: string;
        organization_id: string;
        lead_id: string | null;
        customer_phone: string | null;
        customer_name: string | null;
        duration_seconds: number;
        status: string;
      }>(
        `SELECT id, organization_id, lead_id, customer_phone, customer_name, duration_seconds, status
         FROM public.call_sessions
         WHERE id = $1 AND organization_id = $2;`,
        [sessionId, orgId]
      );

      if (sessionRes.rows.length === 0) {
        throw new Error(`Call session ${sessionId} not found or tenant organization mismatch.`);
      }

      const session = sessionRes.rows[0];

      // 3. Check existing outcomes for compliance/escalation state
      const existingOutcomeRes = await this.db.query<{
        compliance_state: ComplianceState;
        escalation_state: EscalationState;
      }>(
        `SELECT compliance_state, escalation_state FROM public.call_outcomes WHERE call_session_id = $1;`,
        [sessionId]
      );

      const existingCompliance: ComplianceState = existingOutcomeRes.rows[0]?.compliance_state || "NONE";
      const existingEscalation: EscalationState = existingOutcomeRes.rows[0]?.escalation_state || "NONE";

      // 4. Load transcript segments for session
      const segmentsRes = await this.db.query<TranscriptSegmentInput>(
        `SELECT id, speaker, text, confidence, start_offset_ms as "startOffsetMs", end_offset_ms as "endOffsetMs"
         FROM public.transcript_segments
         WHERE call_session_id = $1
         ORDER BY start_offset_ms ASC NULLS LAST, created_at ASC;`,
        [sessionId]
      );

      const segments: TranscriptSegmentInput[] = segmentsRes.rows || [];

      // 5. Run AI Post-Call Intelligence Agent
      const analysis: ValidatedCallAnalysisResult = await analyzeCallWithAI({
        callSessionId: sessionId,
        organizationId: orgId,
        segments,
        complianceState: existingCompliance,
        escalationState: existingEscalation,
        durationSeconds: session.duration_seconds || 0,
        customerName: session.customer_name || undefined,
        customerPhone: session.customer_phone || undefined
      });

      // 6. Persist verified results transactionally
      await this.persistAnalysisResults(session, analysisVersion, analysis);

      // 6b. Execute business automations for the session
      try {
        const orchestrator = new AutomationOrchestrator(this.db);
        await orchestrator.executeForSession({
          organizationId: orgId,
          callSessionId: sessionId,
          analysisVersion,
          leadId: session.lead_id,
          customerName: session.customer_name || "Customer",
          customerPhone: session.customer_phone,
          analysis
        });
      } catch (autoErr) {
        // Automation errors are safely isolated and tracked in public.automation_runs
        console.warn(`[CallAnalysisWorker] Automation execution note for session ${sessionId}:`, autoErr);
      }

      // Stop lease renewal heartbeat
      if (leaseRenewTimer) {
        clearInterval(leaseRenewTimer);
        leaseRenewTimer = null;
      }

      // 7. Complete job with worker fencing token check
      const completeRes = await this.db.query<{ complete_call_analysis_job: boolean }>(
        `SELECT public.complete_call_analysis_job($1, $2, $3);`,
        [jobId, this.workerId, fencingToken]
      );

      const completed = completeRes.rows[0]?.complete_call_analysis_job;

      if (!completed) {
        // Fenced out! Another worker took over after lease expired.
        return {
          claimed: true,
          jobId,
          callSessionId: sessionId,
          analysisVersion,
          fencingToken,
          success: false,
          fencedOut: true,
          error: "Worker fenced out: lease expired and job reclaimed by another worker.",
          durationMs: Date.now() - t0
        };
      }

      return {
        claimed: true,
        jobId,
        callSessionId: sessionId,
        analysisVersion,
        fencingToken,
        success: true,
        durationMs: Date.now() - t0
      };
    } catch (err: unknown) {
      if (leaseRenewTimer) {
        clearInterval(leaseRenewTimer);
        leaseRenewTimer = null;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);

      // Fail job and schedule exponential backoff retry via RPC
      try {
        await this.db.query(
          `SELECT public.fail_call_analysis_job($1, $2, $3, $4, $5);`,
          [jobId, this.workerId, fencingToken, errorMessage, this.backoffBaseSeconds]
        );
      } catch {
        // Ignore secondary failure
      }

      return {
        claimed: true,
        jobId,
        callSessionId: sessionId,
        analysisVersion,
        fencingToken,
        success: false,
        error: errorMessage,
        durationMs: Date.now() - t0
      };
    }
  }

  /**
   * Persists call outcome and lead scoring breakdown records idempotently.
   */
  private async persistAnalysisResults(
    session: { id: string; organization_id: string; lead_id: string | null },
    analysisVersion: number,
    analysis: ValidatedCallAnalysisResult
  ): Promise<void> {
    const legacyDisposition = mapToLegacyDisposition(analysis.businessOutcome, analysis.complianceState);

    // Format key points with exact quotes for backward-compatible UI displays
    const keyPoints = [
      ...(analysis.intelligenceData.customerIntent
        ? [{ point: analysis.intelligenceData.customerIntent.value, evidenceQuote: analysis.intelligenceData.customerIntent.exactQuote }]
        : []),
      ...analysis.intelligenceData.customerRequirements.map((r) => ({ point: r.value, evidenceQuote: r.exactQuote })),
      ...(analysis.intelligenceData.budget
        ? [{ point: `Budget: ${analysis.intelligenceData.budget.value}`, evidenceQuote: analysis.intelligenceData.budget.exactQuote }]
        : []),
      ...analysis.intelligenceData.buyingSignals.map((s) => ({ point: `Signal: ${s.value}`, evidenceQuote: s.exactQuote }))
    ];

    const actionItems = analysis.intelligenceData.recommendedNextAction
      ? [{ task: analysis.intelligenceData.recommendedNextAction.value, priority: "HIGH" }]
      : [];

    // 1. Upsert call_outcomes
    await this.db.query(
      `INSERT INTO public.call_outcomes (
         call_session_id,
         disposition,
         business_outcome,
         compliance_state,
         escalation_state,
         sentiment,
         confidence_score,
         summary,
         key_points,
         action_items,
         intelligence_data,
         evidence_coverage,
         extraction_confidence,
         qualification_decision,
         follow_up_recommended
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (call_session_id) DO UPDATE SET
         disposition = EXCLUDED.disposition,
         business_outcome = EXCLUDED.business_outcome,
         compliance_state = EXCLUDED.compliance_state,
         escalation_state = EXCLUDED.escalation_state,
         sentiment = EXCLUDED.sentiment,
         confidence_score = EXCLUDED.confidence_score,
         summary = EXCLUDED.summary,
         key_points = EXCLUDED.key_points,
         action_items = EXCLUDED.action_items,
         intelligence_data = EXCLUDED.intelligence_data,
         evidence_coverage = EXCLUDED.evidence_coverage,
         extraction_confidence = EXCLUDED.extraction_confidence,
         qualification_decision = EXCLUDED.qualification_decision,
         follow_up_recommended = EXCLUDED.follow_up_recommended;`,
      [
        session.id,
        legacyDisposition,
        analysis.businessOutcome,
        analysis.complianceState,
        analysis.escalationState,
        analysis.sentiment,
        analysis.confidenceScore,
        analysis.summary,
        JSON.stringify(keyPoints),
        JSON.stringify(actionItems),
        JSON.stringify(analysis.intelligenceData),
        analysis.evidenceCoverage,
        analysis.extractionConfidence,
        analysis.qualificationDecision,
        analysis.followUpRecommended
      ]
    );

    // 2. Upsert lead_scoring_breakdowns (strictly bound to analysis_version)
    // Note: observed_weight_total is stored as NUMERIC(4, 3) ratio in the database schema (0.000 - 1.000)
    const observedWeightRatio = analysis.leadScoring.observedWeightTotal > 1
      ? Math.min(1.0, Number((analysis.leadScoring.observedWeightTotal / 100).toFixed(3)))
      : Math.min(1.0, Math.max(0, analysis.leadScoring.observedWeightTotal));

    await this.db.query(
      `INSERT INTO public.lead_scoring_breakdowns (
         organization_id,
         lead_id,
         call_session_id,
         analysis_version,
         total_score,
         normalized_observed_score,
         observed_weight_total,
         evidence_coverage,
         extraction_confidence,
         classification,
         scoring_factors,
         unresolved_unknowns,
         scoring_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (call_session_id, analysis_version) DO UPDATE SET
         total_score = EXCLUDED.total_score,
         normalized_observed_score = EXCLUDED.normalized_observed_score,
         observed_weight_total = EXCLUDED.observed_weight_total,
         evidence_coverage = EXCLUDED.evidence_coverage,
         extraction_confidence = EXCLUDED.extraction_confidence,
         classification = EXCLUDED.classification,
         scoring_factors = EXCLUDED.scoring_factors,
         unresolved_unknowns = EXCLUDED.unresolved_unknowns,
         scoring_version = EXCLUDED.scoring_version;`,
      [
        session.organization_id,
        session.lead_id,
        session.id,
        analysisVersion,
        analysis.leadScoring.totalScore,
        analysis.leadScoring.normalizedObservedScore,
        observedWeightRatio,
        analysis.leadScoring.evidenceCoverage,
        analysis.leadScoring.extractionConfidence,
        analysis.leadScoring.classification,
        JSON.stringify(analysis.leadScoring.scoringFactors),
        JSON.stringify(analysis.leadScoring.unresolvedUnknowns),
        analysis.leadScoring.scoringVersion
      ]
    );

    // 3. Update lead score in public.leads if lead_id is present and not suppressed by DNC
    if (session.lead_id && analysis.complianceState !== "DNC_REQUESTED" && analysis.complianceState !== "DNC_REGISTERED") {
      if (analysis.leadScoring.totalScore !== null) {
        await this.db.query(
          `UPDATE public.leads
           SET score = $1,
               temperature = $2,
               updated_at = NOW()
           WHERE id = $3 AND organization_id = $4;`,
          [
            analysis.leadScoring.totalScore,
            analysis.leadScoring.classification === "UNCLASSIFIED" ? "COLD" : analysis.leadScoring.classification,
            session.lead_id,
            session.organization_id
          ]
        );
      }
    }
  }

  /**
   * Starts a continuous worker polling loop.
   */
  public async start(pollIntervalMs = 2000): Promise<void> {
    this.isRunning = true;
    this.stopRequested = false;

    while (this.isRunning && !this.stopRequested) {
      try {
        const res = await this.processNextJob();
        if (!res.claimed) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
      } catch {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }
    this.isRunning = false;
  }

  /**
   * Signals the worker to stop processing new jobs gracefully.
   */
  public stop(): void {
    this.stopRequested = true;
  }
}
