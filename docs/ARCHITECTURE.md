# VoiceNexus AI — System Architecture Specification

## 1. System Vision & Architecture Overview

VoiceNexus AI is an enterprise B2B SaaS platform that unifies inbound lead intelligence with proactive, multilingual voice agent orchestration. 

```text
+-----------------------------------------------------------------------------------+
|                                  CLIENT TIER                                      |
|                                                                                   |
|   +--------------------------+    +-------------------------+    +------------+   |
|   | Desktop / Mobile PWA App |    | Public Business / Forms |    | PSTN Phone |   |
|   | (Next.js 16 App Router)  |    | (Lead Capture / Events) |    | (Twilio)   |   |
|   +-------------+------------+    +------------+------------+    +-----+------+   |
+-----------------|------------------------------|-----------------------|----------+
                  | HTTPS / WSS                  | HTTPS                 | Twilio Stream
                  v                              v                       v
+------------------------------------------------+       +--------------------------+
|            NEXT.JS APPLICATION TIER            |       |  PERSISTENT GATEWAY TIER |
|                (Hosted on Vercel)              |       |   (Fastify / Node 24)    |
|                                                |       |    (Render / Container)  |
|  * Server Actions & Route Handlers             |       |                          |
|  * Lead Intelligence Agent                     |       |  * Bidirectional Audio   |
|  * Post-Call Analysis Agent                    |       |  * Twilio Media Handler  |
|  * Follow-up Planner Agent                     |       |  * Browser Mic Session   |
|  * Auth & Workspace Shell                      |       |  * Codec: PCM16 / μ-law  |
|  * Secure Server Provider Clients              |       |  * Turn Orchestration    |
+-----------------------+------------------------+       +------------+-------------+
                        |                                             |
                        |   Postgres / Auth / Realtime                |
                        +----------------------+----------------------+
                                               |
                                               v
+-----------------------------------------------------------------------------------+
|                               SUPABASE PLATFORM                                   |
|                                                                                   |
|  * PostgreSQL Database (Multi-Tenant, Row-Level Security, B-Tree & GIN Indexes)  |
|  * Supabase Auth (SSR Cookies, JWT Verification, Role Claims)                    |
|  * Supabase Realtime (Live Transcript Stream, Call Status Updates)                |
|  * Supabase Storage (Encrypted Voice Embeddings, Audio Recordings)                |
+-----------------------------------------------------------------------------------+
                                               |
                                               v
+-----------------------------------------------------------------------------------+
|                           EXTERNAL PROVIDER INTEGRATIONS                          |
|                                                                                   |
|  +--------------------+   +--------------------+   +--------------------------+   |
|  |   Gnani Prisma     |   |   Gnani Timbre     |   |   Gemini / Groq LLM      |   |
|  |   STT (v3 REST /   |   |   TTS (v1 REST /   |   |   (Reasoning, Prompts,   |   |
|  |   v3 Stream)       |   |   v1 Stream /      |   |   Structured Post-Call   |   |
|  |   api.vachana.ai   |   |   Voice Cloning)   |   |   Outcome Extraction)    |   |
|  +--------------------+   +--------------------+   +--------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Runtime Separation of Concerns

### A. Next.js 16 Web Application (Vercel)
- Handles UI rendering, PWA shell, SSR routing, user authentication sessions, and Server Actions.
- Directs lead capture, campaign attribution, and rules-based scoring.
- Executes offline-safe and asynchronous AI workloads:
  - Lead Intelligence scoring.
  - Post-Call Analysis generation from persisted transcripts.
  - Follow-up recommendation generation.
- Never runs persistent, long-lived WebSocket media streams (which would violate Vercel serverless execution limits).

### B. Persistent Fastify Voice Gateway (Render)
- Dedicated Node.js 24 runtime with low latency for realtime media.
- Manages bidirectional WebSocket connections for:
  - Twilio Media Streams (`<Connect><Stream>`).
  - Browser Test Agent sessions (microphone and speaker in browser).
- Audio processing pipeline:
  - μ-law 8 kHz <-> linear PCM16 16 kHz conversion with anti-aliased resampling.
  - Jitter buffering and frame pacing.
  - Interruption / barge-in detection (cancelling pending TTS playback and sending Twilio `clear` event).
- Directly orchestrates the conversational turn loop with Gnani Prisma STT, Gemini/Groq LLM, and Gnani Timbre TTS.
- Persists call events, transcripts, and status updates directly to Supabase using verified server privilege.

---

## 3. The Modular Speech Loop

```text
[Caller / Mic] 
      | (Audio Frames: Twilio μ-law 8kHz OR Browser PCM 16kHz)
      v
[Gateway Audio Router]
      | (PCM16 16kHz Stream)
      v
[Gnani Prisma STT (v3 Stream)]
      | (Partial transcripts for barge-in; Final transcript on speech end)
      v
[Turn Orchestrator]
      | (Transcript + Agent Prompt + Language Directive + Lead Context)
      v
[LLM Reasoning Engine (Gemini / Groq)]
      | (Streamed token response + Control signals e.g. handoff/end)
      v
[Gnani Timbre TTS (v1 Stream / REST)]
      | (Synthesized PCM16 audio chunks in requested voice)
      v
[Gateway Audio Router]
      | (Resampled to Twilio μ-law 8kHz OR Browser AudioBuffer)
      v
[Caller / Speaker]
```

### Safety & Interruption (Barge-in) Rules:
1. When Prisma STT detects caller speech while the AI is speaking:
   - Immediately abort active Timbre TTS generation.
   - Send a `clear` message to Twilio Media Stream to flush the telephony audio buffer immediately.
   - Emit an `interrupted` event to the transcript log.
2. Mandatory AI identity disclosure on turn 1 ("Hello, I am the VoiceNexus AI assistant for [Business Name]...").

---

## 3.1 Authoritative Voice & Language Compatibility Registry (Milestone 11)

VoiceNexus AI enforces strict, compile-time and runtime voice-to-language mappings backed by official Gnani AI Timbre provider capabilities (`src/lib/voice-profiles.ts`).

### Voice Catalog & Dialect Matrix:

| Dialect Code | Language / Script | Supported Personas (Gender) | Model Invariant | Provider Canonical Mapping |
| :--- | :--- | :--- | :--- | :--- |
| `ta-IN` | Tamil / Tanglish | Asmita (F), Trisha (F), Brinda (F), Selvi (F) | `timbre-v2.5` | `Asmita`, `Trisha`, `Brinda`, `Selvi` -> `Asmita` |
| `en-IN` | Indian English | Kaveri (F), Pranav (M), Devika (F), Priya (F) | `timbre-v2.5` | `Kaveri`, `Pranav`, `Devika`, `Priya` -> `Kaveri` |
| `hi-IN` | Hindi / Hinglish | Nalini (F), Deepak (M), Aarav (M) | `timbre-v2.5` | `Nalini`, `Deepak`, `Aarav` -> `Deepak` |
| `te-IN` | Telugu | Chitra (F), Suresh (M) | `timbre-v2.5` | `Chitra`, `Suresh` -> `Girish` |
| `kn-IN` | Kannada | Ananya (F) | `timbre-v2.5` | `Ananya` -> `Vidya` |
| `ml-IN` | Malayalam | Arya (F) | `timbre-v2.5` | `Arya` -> `Reshma` |
| `indic-auto` | Multilingual Indic | Shivani (F), Avinash (M) | `timbre-v3.0` | `Shivani`, `Avinash` (native 10+ language switching) |

### Strict Model Invariant:
- **Language-Specific Voices:** MUST strictly use `timbre-v2.5`. Sending `timbre-v3.0` for language personas triggers Gnani Pydantic validation errors.
- **Multilingual Indic Voices:** MUST strictly use `timbre-v3.0`. Sending `timbre-v2.5` for multilingual personas triggers provider rejection.
- **Alias Resolution:** Aliases (`Selvi`, `Priya`, `Aarav`, `Suresh`, `Ananya`, `Arya`) are resolved to verified canonical provider names before network dispatch, guaranteeing zero provider failures.
- **Sequential Carrier Loop:** TwiML generates `<Play>${audioUrl}</Play>` followed by `<Gather input="speech" timeout="8"/>`, ensuring full audio playout without speech clipping, with 3-stage polite silence recovery.
- **Same-Language Fallback:** If Gnani Timbre TTS times out, Twilio executes `<Say>` in the exact same language using Google TTS (`Google.ta-IN-Standard-C`, `Google.en-IN-Standard-A`, `Google.hi-IN-Standard-A`, `Google.te-IN-Standard-A`, `Google.kn-IN-Standard-A`, `Google.ml-IN-Standard-A`), never falling back across languages.
3. Immediate adherence to caller opt-out ("Please do not call me again") -> mark lead as `DO_NOT_CALL` and cleanly end call.

---

## 4. Multi-Tenancy & Authorization Model

### Data Isolation
- Every core entity contains an `organization_id` foreign key referencing `public.organizations(id)`.
- PostgreSQL Row Level Security (RLS) is enabled on every table.
- Non-recursive policies avoid cyclic evaluation loops on `organization_members` by utilizing `SECURITY DEFINER` helper functions with `SET search_path = ''`:
  - `public.get_user_organization_ids(user_uuid uuid)`: Returns all organization UUIDs for the user.
  - `public.is_org_member(org_uuid uuid)`: Evaluates membership using cached `(SELECT auth.uid())`.
  - `public.has_org_role(org_uuid uuid, required_roles public.organization_role[])`: Verifies role requirements.

```sql
-- High-performance RLS pattern applied across all tenant tables
CREATE POLICY "leads_select_member" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "leads_update_member" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
```

### Roles:
1. `OWNER`: Full administrative access, organization profile, team management, billing, role assignment.
2. `MANAGER`: Can configure agents, manage leads, view call logs, launch campaigns, configure automations.
3. `AGENT`: Can view leads, update lead status, initiate browser test calls, and review call transcripts.
4. `ANONYMOUS (Public)`: Strictly restricted to published `business_pages`, active catalog items, and creating web enquiry leads/visitor tracking records. Zero access to transcripts, call recordings, agent prompts, voice consents, or organization members.

### Next.js 16 Request Interception (`src/proxy.ts`):
- Uses Node.js native proxy interception convention (`src/proxy.ts`).
- Executes `@supabase/ssr` `createServerClient` to refresh authentication cookies and persist session tokens across browser tabs and refreshes.
- Enforces route protection on all workspace URLs, redirecting unauthenticated users to `/login` when live auth is enabled, while redirecting authenticated users away from auth pages to `/dashboard`.

---

## 5. Security & Secret Management

- **Zero Secret Exposure**:
  - `NEXT_PUBLIC_*` is strictly restricted to publishable identifiers (e.g. Supabase URL, Supabase Anon Key).
  - All provider secrets (`GNANI_API_KEY`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VOICE_GATEWAY_SECRET`) are server-only.
- **Signed Server-to-Server Commands**:
  - Calls initiated from the Next.js web application to the Voice Gateway carry an HMAC-SHA256 signature generated with `VOICE_GATEWAY_SECRET` with short timestamp expiration (60 seconds) to prevent replay attacks.
- **Twilio Webhook Verification**:
  - All inbound webhooks from Twilio validate the `X-Twilio-Signature` using `twilio.validateRequest`.

---

## 6. PWA Architecture

- **Manifest**: Located at `public/manifest.json`, providing application name, icons, standalone display mode, and theme colors.
- **Service Worker**: Cache-first for static application shell and icons; network-first for navigation.
- **Offline Safety**: Authentication, AI inference, and voice calling explicitly check for network connectivity. When offline, an informative fallback state is presented with retry affordance, never exposing stale or corrupted data.

---

## 7. Post-Call Intelligence & Transactional Outbox Architecture (Milestone 7)

```text
+---------------------------------------------------------------------------------------------------+
|                                      POST-CALL ARCHITECTURE                                       |
|                                                                                                   |
|  +------------------+         Trigger: status = 'COMPLETED'          +-------------------------+  |
|  |  call_sessions   | ---------------------------------------------> |   call_analysis_jobs    |  |
|  |  (Lifecycle)     |                                                |   (Transactional Queue) |  |
|  +--------+---------+                                                +------------+------------+  |
|           |                                                                       |               |
|           | ON DELETE RESTRICT                                                    | FOR UPDATE    |
|           v                                                                       | SKIP LOCKED   |
|  +------------------+                                                             v               |
|  |  call_outcomes   | <--------------------------------------------+   +-----------------------+  |
|  |  (4 Orthogonal   |                                              |   |  Analysis Worker      |  |
|  |   Domains)       |                                              |   |  (Phase 7.2)          |  |
|  +--------+---------+                                              |   +-----------+-----------+  |
|           |                                                        |               |              |
|           |                                                        +---------------+              |
|           v                                                                        v              |
|  +-------------------------+    +-----------------------+              +-----------------------+  |
|  | lead_scoring_breakdowns |    |    automation_runs    |              | notification_         |  |
|  | (7-Factor Scoring, C, κ)|    | (Idempotent Actions)  |              | dispatches (Audience) |  |
|  +-------------------------+    +-----------------------+              +-----------------------+  |
+---------------------------------------------------------------------------------------------------+
```

### Orthogonal Outcome Architecture
Call results are deconstructed into four non-overlapping domains:
1. **Call Lifecycle:** `call_sessions.status` (`INITIATING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `BUSY`, `NO_ANSWER`).
2. **Business Outcome:** `call_outcomes.business_outcome` (`QUALIFIED`, `FOLLOW_UP_REQUIRED`, `NOT_INTERESTED`, `WRONG_NUMBER`, `UNRESOLVED`, `INFORMATIONAL_COMPLETE`).
3. **Compliance State:** `call_outcomes.compliance_state` (`NONE`, `DNC_REQUESTED`, `DNC_REGISTERED`, `DNC_REGISTRATION_FAILED`).
4. **Escalation State:** `call_outcomes.escalation_state` (`NONE`, `REQUESTED`, `FOLLOW_UP_PENDING`, `NOTIFICATION_DELIVERED`, `TRANSFER_COMPLETED`).

### Transactional Outbox Job Queue
- **Enqueue:** Trigger `trg_call_completed_enqueue_analysis` enqueues a job into `call_analysis_jobs` in the exact transaction that sets `call_sessions.status = 'COMPLETED'`.
- **Claim:** Background workers execute RPC `claim_call_analysis_job(worker_id, lease_seconds)` using `SELECT ... FOR UPDATE SKIP LOCKED` supporting lease recovery when `lock_expires_at < NOW()`.
- **Fencing:** Worker identity verification (`locked_by = p_worker_id`) in `complete_call_analysis_job` and `renew_call_analysis_job_lease` prevents zombie worker overwrites.
- **Backoff:** RPC `fail_call_analysis_job` applies exponential backoff ($delay \times 2^{attempts-1}$) and automatically routes jobs exceeding max attempts to `DEAD_LETTER`.
- **Reconciliation:** RPC `reconcile_missing_analysis_jobs(limit)` catches any completed calls missing queue entries.

---

## 8. Canonical Multi-Tenancy & Indic Multilingual Speech Engine (Milestone 9)

### Organization Isolation Model
VoiceNexus AI enforces strict organization-level tenant isolation across every database table, API route, and workspace store:
- **Canonical Organizations:** Exactly two canonical organizations are maintained:
  1. `Aadhira Solar Tech` (`c81e8a53-b2db-4162-b8bd-484b6f11a0fa`, slug `aadhira-solar`): Production organization containing real verified leads and carrier telephone call histories.
  2. `VoiceNexus Indian Business Demo` (`206a4ebf-df6a-45e1-b22e-cf1068d6fdba`, slug `voicenexus-demo`): Demo organization seeded with 12 rich Indian business scenarios across Tamil Nadu, Karnataka, Kerala, Gujarat, Maharashtra, and Telangana.
- **Server-Side Tenancy Guard:** All API endpoints (`/api/leads`, `/api/calls`, `/api/business`, `/api/products`, `/api/agents`, `/api/analytics`) invoke `getActiveOrganizationId()` derived from secure session cookies, rejecting unauthenticated requests and preventing cross-tenant data leaks.
- **Client Store Hygiene:** Default Zustand workspace store initializations contain strictly empty arrays (`leads: []`, `calls: []`, `agents: []`) and fetch live organization data via API, preventing synthetic mock data contamination.

### Indic Multilingual Speech Engine Catalog
Gnani Timbre voice synthesis profiles are verified and cataloged for the following Indic languages:
- **Tamil (`ta-IN`):** `Asmita` (`ta-IN-asmita`, timbre-v2.5, fast 750ms synthesis), `Kaveri` (`ta-IN-kaveri`, timbre-v2.5).
- **Hindi (`hi-IN`):** `Radha` (`hi-IN-radha`, timbre-v2.5), `Shivani` (`hi-IN-shivani`, timbre-v3.0).
- **English (`en-IN`):** `Priya` (`en-IN-priya`, timbre-v2.5).
- **Telugu (`te-IN`):** `Chitra` (`te-IN-chitra`, timbre-v2.5), `Suresh` (`te-IN-suresh`, timbre-v2.5).
- **Kannada (`kn-IN`):** `Ananya` (`kn-IN-ananya`, timbre-v2.5).
- **Malayalam (`ml-IN`):** `Arya` (`ml-IN-arya`, timbre-v2.5).

---

## 9. Fresh Indian Business Workspace Architecture & Multi-Channel Social Integration (Milestone 10)

### Clean-Slate Workspace Model
- **Company Owner Identity:** Single owner user `Kaveri Solar Admin` (`admin@kaverisolar.in`, `03585034-60f5-4537-8157-02fae83257b4`) with confirmed email status and role `OWNER`.
- **Primary Business Workspace:** `Kaveri Solar & Construction` (`c7426aa9-de0d-4d59-94fe-64dbef6f9ac4`), Business ID `cb995c80-9bd5-46d9-b1d5-4ad6c0f263e0`, based in Coimbatore, Tamil Nadu.
- **Dedicated Public Portal:** `/p/kaveri-solar-construction` with verified MNRE certification badges, solar ROI calculator, and dynamic multi-channel social links.
- **Server-Validated Tenancy Resolution:** `src/actions/organization.ts` validates authenticated identity via `auth.getUser()` and validates the active organization against live user memberships, quarantining stale cookies from deleted organizations and preventing empty dataset fallbacks.

### Multi-Channel Social Media Architecture (13 Platforms)
Social platform handles and URLs are stored within `businesses.theme_config->'social_links'`:
- **Supported Channels:** `whatsapp`, `instagram`, `facebook`, `telegram`, `twitter`, `snapchat`, `youtube`, `linkedin`, `threads`, `pinterest`, `tiktok`, `github`, `discord`.
- **Validation Engine:** `src/lib/social-links.ts` enforces HTTPS protocol and platform-specific hostname validation patterns via `isValidSocialUrl`.
- **Dynamic Display:** The public portal renders verified badges for platforms with active, valid URLs (WhatsApp and Instagram) and automatically suppresses empty or unconfigured channels.
- **Live Preview:** Workspace Business Page Customizer (`/business-pages`) provides real-time URL validation and live button preview for both desktop and mobile viewports.

### Sample Contact & Telephony Safety Architecture
- **Safety Metadata:** 12 Indian sample leads are persisted with `source: 'SAMPLE_LEAD'` and `[TEST_CONTACT]` identifiers in `summary` and `notes`.
- **Verified Destination Binding:** All 12 sample contacts share the verified carrier destination phone number `+91 6382868845`, enabling comprehensive UI and CRM testing with realistic profiles while protecting against unverified outbound PSTN dispatches.
- **Telephony Dispatch Guard:** `/api/telephony/outbound` enforces that sample contact dispatches are strictly confined to the verified developer phone number, rejecting attempts to dial arbitrary sample destinations.



