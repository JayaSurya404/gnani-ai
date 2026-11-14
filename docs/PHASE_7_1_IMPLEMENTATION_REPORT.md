# VoiceNexus AI — Milestone 7: Phase 7.1 Implementation Report
**Database Foundation & Durable Job Outbox**

## Executive Summary
Milestone 7 Phase 7.1 establishes the robust transactional and relational database foundation for VoiceNexus AI post-call intelligence, explainable lead scoring, durable background processing, idempotent automations, and bifurcated notifications. 

Strict developmental invariants have been preserved:
- Hosted Supabase database was **not** migrated, reset, dropped, or mutated without authorization.
- Frontend UI has **not** been modified.
- Milestone 6.2 functionality (Groq/Gemini LLM reasoning, Gnani STT/TTS, persistent DNC, truthful escalation) remains 100% intact and passing.
- Quality gates: **78/78 tests passing (100%)**, `npm run typecheck` exited 0, `npm run lint` exited 0 (`--max-warnings=0`), and `npm run build:all` compiled all 28 Next.js routes and the Voice Gateway without errors.

---

## 1. Orthogonal Call Outcome Architecture

The previously mixed single-dimension disposition is now deconstructed into four independent, non-overlapping domains:

```text
+---------------------------------------------------------------------------------------------------+
|                                  ORTHOGONAL DOMAIN SEPARATION                                     |
|                                                                                                   |
|  [ Domain A: Call Lifecycle ]         --> call_sessions.status                                    |
|    INITIATING | IN_PROGRESS | COMPLETED | FAILED | BUSY | NO_ANSWER                               |
|                                                                                                   |
|  [ Domain B: Business Outcome ]       --> call_outcomes.business_outcome                          |
|    QUALIFIED | FOLLOW_UP_REQUIRED | NOT_INTERESTED | WRONG_NUMBER | UNRESOLVED                   |
|                                                                                                   |
|  [ Domain C: Compliance State ]       --> call_outcomes.compliance_state                          |
|    NONE | DNC_REQUESTED | DNC_REGISTERED | DNC_REGISTRATION_FAILED                                |
|                                                                                                   |
|  [ Domain D: Escalation State ]       --> call_outcomes.escalation_state                          |
|    NONE | REQUESTED | FOLLOW_UP_PENDING | NOTIFICATION_DELIVERED | TRANSFER_COMPLETED               |
+---------------------------------------------------------------------------------------------------+
```

### Domain A: Call Lifecycle
Managed strictly in `public.call_sessions.status`:
- `INITIATING`: Call session handshake or dialing initiated.
- `IN_PROGRESS`: Audio streaming actively exchanging frames.
- `COMPLETED`: Normal termination (either party hung up).
- `FAILED`: Technical transport failure (network drop, socket timeout).
- `BUSY` / `NO_ANSWER`: Telephony ringing states.

### Domain B: Business Outcome
Tracked in `public.call_outcomes.business_outcome`:
- `QUALIFIED`: Commercial criteria satisfied, budget/need confirmed.
- `FOLLOW_UP_REQUIRED`: Customer interested but needs subsequent touchpoint.
- `NOT_INTERESTED`: Explicit negative commercial interest.
- `WRONG_NUMBER`: Target party unreachable or incorrect contact.
- `UNRESOLVED`: Call cut off before qualification could occur.
- `INFORMATIONAL_COMPLETE`: Inbound inquiry resolved; no further sales action needed.

### Domain C: Compliance State
Tracked in `public.call_outcomes.compliance_state`:
- `NONE`: No regulatory opt-out requested; standard consent.
- `DNC_REQUESTED`: Caller opted into Do-Not-Call during conversation.
- `DNC_REGISTERED`: Preference persistently confirmed in PostgreSQL.
- `DNC_REGISTRATION_FAILED`: Database write failed; flagged for audit.

### Domain D: Escalation State
Tracked in `public.call_outcomes.escalation_state`:
- `NONE`: Handled entirely by AI voice agent.
- `REQUESTED`: Caller explicitly requested a human supervisor.
- `FOLLOW_UP_PENDING`: High-priority supervisor task created.
- `NOTIFICATION_DELIVERED`: Dispatch acknowledged by notification gateway.
- `TRANSFER_COMPLETED`: Real-time PSTN bridge completed.

---

## 2. Durable Transactional Outbox & Worker Fencing Architecture

### Key Queue Characteristics:
- **Composite Uniqueness:** `UNIQUE (call_session_id, analysis_version)` guarantees strict idempotency on duplicate call completion events and enables explicit versioned re-analysis without row collisions.
- **Monotonic Fencing Tokens (`fencing_token BIGINT`):** Every claim increments a monotonic token. Completions and lease renewals assert both `locked_by = p_worker_id` and `fencing_token = p_fencing_token`, completely preventing zombie workers from corrupting state if a lease expires and is reclaimed by another worker.
- **Lease Expiration Reclamation:** Expired leases (`lock_expires_at < NOW()`) are automatically reclaimable by active workers, advancing the fencing token.
- **Exponential Backoff & Dead-Letter Handling:** Failed attempts back off exponentially (`p_backoff_base_seconds * 2^(attempts-1)`); jobs transition to `DEAD_LETTER` after 3 attempts.
- **Safe Conflict Handling:** Duplicate completion triggers preserve active worker leases and existing status via `ON CONFLICT DO UPDATE SET updated_at = updated_at`.
- **Backfill Reconciliation:** RPC `reconcile_missing_analysis_jobs` finds any completed call sessions missing analysis records and inserts them with `ON CONFLICT DO NOTHING`.

---

## 3. Explainable Lead Scoring Schema & Sparse Data Guardrails

`public.lead_scoring_breakdowns` implements a transparent 7-factor model with mathematical guardrails:

| Factor | Weight ($w_i$) | Dimension Evaluated |
| :--- | :--- | :--- |
| **Intent** | 20% | Explicit buying intent, project urgency |
| **Budget** | 20% | Affordability, electricity bill threshold |
| **Authority** | 15% | Decision-maker status (homeowner/proprietor) |
| **Timeline** | 15% | Purchase timeframe (<30d, 1-3mo, >6mo) |
| **Fit** | 15% | Roof space, geography, technical feasibility |
| **Engagement** | 10% | Call duration, multi-turn responsiveness |
| **Sentiment** | 5% | Emotional tone and brand receptivity |

### Mathematical Model:
1. **Zero Point Hallucination:** Unmentioned or unobserved dimensions are never assigned arbitrary default points (e.g. 50 points). They receive 0 observed weight and are recorded in `unresolved_unknowns` (JSONB).
2. **Normalized Observed Score:**
   $$S_{\text{observed}} = \frac{\sum_{i \in \text{observed}} w_i S_i}{\sum_{i \in \text{observed}} w_i}$$
3. **Database-Enforced Check Constraints (`chk_coverage_hot_gate`):**
   ```sql
   CONSTRAINT chk_coverage_hot_gate CHECK (
     (classification != 'HOT' OR evidence_coverage >= 0.600) AND
     (classification != 'WARM' OR evidence_coverage >= 0.400)
   )
   ```
   Ensures that leads cannot be classified as `HOT` without at least 60% verifiable evidence coverage, or `WARM` without at least 40% evidence coverage.
4. **Independent Metrics Preserved:** `total_score`, `normalized_observed_score`, `observed_weight_total`, `evidence_coverage` ($C \in [0.0, 1.0]$), and `extraction_confidence` ($\kappa \in [0.0, 1.0]$).

---

## 4. Idempotent Automation & Segregated Notifications

### `public.automation_runs`
- Action-level idempotency key: `SHA256(call_session_id + automation_id + action_type)`.
- Status lifecycle: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`, `SKIPPED_DNC_SUPPRESSION`.
- DNC-overrides-all: Even if a call is `QUALIFIED`, any active DNC state strictly suppresses outbound automated actions.

### `public.notification_dispatches`
- Bifurcated audience: `INTERNAL_STAFF` vs. `CUSTOMER`.
- Customer-facing dispatches default strictly to `DRAFT_PENDING_APPROVAL` until an authorized human supervisor approves delivery.
- Webhook signature metadata, payload JSONB, and consent verification timestamps.

---

## 5. Non-Destructive Foreign Keys & RLS Tenancy Security

- **Call Sessions:** Foreign key `call_session_id` in jobs, outcomes, breakdowns, and automations uses `ON DELETE RESTRICT`, preventing accidental cascade deletion of audit records.
- **Leads:** Foreign key `lead_id` uses `ON DELETE SET NULL`, ensuring outcomes and compliance records survive if a CRM lead is GDPR-purged.
- **Row-Level Security:** Every table enforces `tenant_isolation_policy` using `public.is_org_member(organization_id)`.
- **Anon Hardening:** Direct table privileges revoked from `anon` on all Milestone 7 tables. Functions explicitly revoke `PUBLIC` and `anon` execute permissions.

---

## 6. Verification & Quality Gates

| Check | Target | Result | Exit Code |
| :--- | :--- | :--- | :--- |
| **Unit Tests (`npm test`)** | 78 tests across 8 suites | **78/78 Passed (100%)** | 0 |
| **Phase 7.1 Unit Tests** | 16 tests in `phase_7_1_database_foundation.test.ts` | **16/16 Passed (100%)** | 0 |
| **Real PostgreSQL Tests** | 14 tests in `tests/real_postgres_migration_validation.ts` | **14/14 Passed (100%)** | 0 |
| **TypeScript Typecheck** | `tsc --noEmit` | **0 errors** | 0 |
| **ESLint** | `eslint . --max-warnings=0` | **0 warnings** | 0 |
| **Turbopack Build** | `next build` (28/28 routes) | **28/28 Compiled** | 0 |
| **Monorepo Build** | `npm run build:all` | **Voice Gateway & Web App Compiled** | 0 |
| **Hosted DB Safety** | Hosted Supabase untouched | **Zero production migrations run** | N/A |
