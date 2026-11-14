# LEADNEXUS + VOICENEXUS UNIFIED BUSINESS LEAD INTELLIGENCE
## Comprehensive Architecture & Integration Audit (Milestone Phase 1)

**Date:** November 13, 2026  
**Document:** Mandatory Milestone Audit & Implementation Plan  
**Repositories Inspected:**
- LeadNexus: `https://github.com/JayaSurya404/leadnexus` (HEAD revision, 387 files)
- VoiceNexus: `https://github.com/JayaSurya404/voicenexus` (HEAD revision, 346 files)
- Greenfield Workspace: `d:\gnani-ai` (Next.js 16.2.12 App Router, Supabase PostgreSQL, Fastify Gateway)
- Production Targets: `https://leadnexus333.vercel.app/` & `https://voicenexus333.vercel.app/`

---

## 1. Existing Architecture Assessment & Reconciliation

### A. Architecture Reconciliation: Documented vs. Working Implementations
An inspection of the repositories reveals an important architectural divergence that must be reconciled:

| Component | VoiceNexus v1 Documentation (`JayaSurya404/voicenexus`) | Greenfield Working Source (`d:\gnani-ai`) | Reconciled Active Architecture for Milestone |
| :--- | :--- | :--- | :--- |
| **Telephony Transport** | Bidirectional Media Streams (`<Connect><Stream>`) | Turn-based TwiML (`<Gather input="speech">` + `<Play>`) | **Turn-based TwiML Gather/Play** is the active trial-compatible deployment. Twilio Media Streams is strictly gated on trial tiers (Error 21215/21216). |
| **Speech-to-Text (STT)**| Gemini Live bidirectional audio streaming | Gnani Prisma STT v3 & Twilio Cloud Speech | **Gnani Prisma STT v3** for streaming/audio analysis; Twilio native speech recognition on PSTN line. |
| **Text-to-Speech (TTS)**| Gemini Live native audio generation | Gnani Timbre TTS v2.5/v3.0 WebSocket API | **Gnani Timbre TTS** (`wss://api.vachana.ai/api/v1/tts`) using native voices (`Asmita` for Tamil `ta-IN`, `Kaveri`/`Arun` for Indian English `en-IN`). |
| **Reasoning Engine** | Gemini Live model inference | Groq LPU (Llama 3.3 70B, ~230ms) + Gemini 2.5 Flash failover | **Groq LPU + Gemini 2.5 Flash** dual-provider failover. |
| **Audio Caching** | Ephemeral memory only | Two-tier cache: process-global `globalThis` + local disk `.audio-cache/` | **Two-Tier Audio Storage** ensuring zero-timeout (<15ms) TwiML generation and cross-worker persistence. |

*Verdict*: We strictly preserve the active Twilio trial-compatible turn-based voice and Gnani speech architecture. We will **not** attempt to introduce incompatible `<Stream>` verbs into the trial tier.

---

## 2. Current Integration Status

### A. LeadNexus → VoiceNexus Forward Handoff (Existing & Inspected)
In `JayaSurya404/leadnexus`:
- **Trigger**: Business owner clicks "Send to VoiceNexus" in the CRM, invoking `queueVoiceNexusLeadAction(leadId)` in `src/actions/integrations/queue-voicenexus-lead.ts`.
- **Eligibility Check**: Verifies owner role and confirms lead visibility is `OWNER_VISIBLE`, `DIRECT_CONTACT`, or `RECOVERED` (strictly excluding `ADMIN_ONLY` unreleased recovery leads).
- **Contract Schema**: Validates against `voiceNexusHandoffSchema` (`schemaVersion: "1.0"`, `event: "LEAD_HANDOFF_REQUESTED"`).
- **Outbox Persistence**: Queues payload into `outbox_events` with status `PENDING`.
- **HMAC Delivery**: `deliverVoiceNexusEvent` signs canonical request using `signIntegrationRequest` with `VOICENEXUS_SHARED_SECRET`:
  - `x-integration-timestamp`: Unix seconds
  - `x-integration-request-id`: Event UUID
  - `x-integration-signature`: `v1=${digest}`
  - Canonical String: `["voicenexus-integration-v1", timestamp, method, path, requestId, bodyDigest].join("\n")`
- **Receiver**: VoiceNexus exposes `POST /api/v1/integrations/leadnexus/route.ts` which verifies signature within 300s window, imports lead via `importLeadNexusHandoff`, and responds with HTTP 201/200 (`duplicate: true`).

### B. VoiceNexus → LeadNexus Reverse Synchronization (Currently Gapped)
In both `JayaSurya404/voicenexus` and `d:\gnani-ai`:
- **Current State**: **Non-Existent**. When VoiceNexus dials the prospect, transcribes audio, analyzes conversation outcomes, or schedules follow-ups, **no event is dispatched back to LeadNexus**.
- **Impact**: LeadNexus CRM remains stuck at the original handoff state. The business owner cannot see call attempts, duration, transcripts, AI summaries, or qualification outcomes from the LeadNexus dashboard.

---

## 3. Missing Functionality Identified

1. **Reverse Sync Dispatcher (VoiceNexus Side)**:
   - Needs an automated event dispatcher triggered by telephony lifecycle events and post-call analysis completion.
   - Must emit authenticated HMAC-SHA256 payloads to LeadNexus for:
     `CALL_INITIATED`, `CALL_RINGING`, `CALL_ANSWERED`, `CALL_COMPLETED`, `CALL_FAILED`, `CALL_NO_ANSWER`, `CALL_ANALYSIS_COMPLETED`, `FOLLOW_UP_CREATED`.
2. **Reverse Sync Receiver (LeadNexus Side)**:
   - Needs `POST /api/v1/integrations/voicenexus/events` to ingest call events, verify VoiceNexus HMAC signature, enforce idempotency, and update the lead's activity timeline.
3. **Unified Customer Context Display in VoiceNexus**:
   - The Lead Detail Drawer in VoiceNexus currently displays contact information and generated call plan, but lacks the original LeadNexus customer enquiry message, product SKU, and visitor attribution.
4. **Lead Timeline Synchronization in LeadNexus**:
   - LeadNexus CRM lead detail screen must render VoiceNexus call attempts, durations, AI qualification summaries, and follow-up recommendations.
5. **Bidirectional Lead Status Sync**:
   - Post-call outcomes (`QUALIFIED`, `LOST`, `DO_NOT_CALL`) must automatically update `leads.status` and `leads.last_activity_at` across both dashboards.
6. **Public Business Page Direct Channels (`/p/[slug]`)**:
   - Must render direct WhatsApp click-to-chat action (`https://wa.me/...`), Instagram, Facebook, and LinkedIn links.
7. **Product-Specific Enquiry Flow**:
   - Clicking "Enquire on this Package" on a product card must pre-select `product_id` and retain package SKU context.

---

## 4. Proposed Database & API Changes (Non-Destructive)

### A. Database Additions
No existing tables will be dropped or destructively modified.
1. **Enrich `public.leads`**:
   - `external_source`: Source identifier (`LEADNEXUS`, `DIRECT_PUBLIC`, `MANUAL`).
   - `external_id`: Canonical LeadNexus lead UUID.
   - `external_synced_at`: Timestamp of latest bidirectional sync.
2. **Enrich `public.businesses`**:
   - `whatsapp_number`: Direct WhatsApp contact.
   - `instagram_url`, `facebook_url`, `linkedin_url`: Verified social channels.
3. **Table `public.integration_events`** (Audit Trail):
   - `id`: UUID primary key.
   - `business_id`: UUID reference to `businesses`.
   - `lead_id`: UUID reference to `leads`.
   - `direction`: `INBOUND` | `OUTBOUND`.
   - `event_type`: Event name string.
   - `payload`: JSONB payload.
   - `status`: `PENDING` | `DELIVERED` | `FAILED`.
   - `attempt_count`: Integer.
   - `created_at`: Timestamp.

### B. New API Endpoints & Contracts
1. **Reverse Sync Contract (`voiceNexusCallEventSchema`)**:
   ```typescript
   {
     schemaVersion: "1.0",
     event: "CALL_INITIATED" | "CALL_ANSWERED" | "CALL_COMPLETED" | "CALL_FAILED" | "CALL_ANALYSIS_COMPLETED" | "FOLLOW_UP_CREATED",
     eventId: string (UUID),
     timestamp: string (ISO8601),
     business: { id: string, name: string, slug: string },
     lead: { id: string, name: string, phone: string },
     call: {
       callSid: string,
       direction: "OUTBOUND",
       status: string,
       durationSeconds: number,
       startedAt?: string,
       endedAt?: string,
       language: string,
       voice: string,
       summary?: string,
       qualificationDecision?: string,
       confidenceScore?: number,
       followUpRecommended?: boolean,
       followUpDate?: string
     }
   }
   ```
2. **Endpoints**:
   - `POST /api/v1/integrations/leadnexus/events` (Reverse sync webhook receiver on LeadNexus).
   - `POST /api/v1/integrations/leadnexus` (Forward handoff receiver on VoiceNexus — preserved).

---

## 5. Security & Multi-Tenancy Assessment

1. **HMAC-SHA256 Verification**:
   All server-to-server payloads must include `x-integration-signature`, `x-integration-timestamp`, and `x-integration-request-id`. Validated with `crypto.timingSafeEqual`.
2. **Replay Protection**:
   Timestamp window of 300 seconds (5 minutes). Replay protector tracks event UUIDs.
3. **Tenant & Visibility Scoping**:
   Every lead query enforces `organization_id` / `business_id`. Unreleased `ADMIN_ONLY` leads in LeadNexus recovery are never queued for VoiceNexus.
4. **Do-Not-Call (DNC) Strictness**:
   If a customer requests DNC, both LeadNexus and VoiceNexus immediately set `do_not_call = true` and `status = 'DO_NOT_CALL'`. Outbound dialer rejects any DNC number.
5. **Zero Secret Exposure**:
   Shared integration secrets (`LEADNEXUS_SHARED_SECRET`, `VOICENEXUS_SHARED_SECRET`) remain strictly server-side.

---

## 6. Implementation Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION ROADMAP                                │
│                                                                             │
│  [Phase 1] Architecture Audit & Reconciliation (THIS DOCUMENT)              │
│       │                                                                     │
│       ▼                                                                     │
│  [Phase 2] Bidirectional Contract & Shared Signing Engine                   │
│       │    (leadnexus-contract.ts, integration-signing.ts)                  │
│       ▼                                                                     │
│  [Phase 3] LeadNexus Inbound Webhook Receiver                               │
│       │    (/api/v1/integrations/leadnexus/events)                          │
│       ▼                                                                     │
│  [Phase 4] VoiceNexus Reverse Sync Dispatcher                               │
│       │    (outbound, status, turn & post-call hooks)                       │
│       ▼                                                                     │
│  [Phase 5] Dual-Context Lead Detail Timeline in Both Workspaces             │
│       │    (Enquiry + Scoring + Strategy + Transcripts + Outcomes)          │
│       ▼                                                                     │
│  [Phase 6] Public Page Direct Channels & Product-Specific Enquiries         │
│       │    (WhatsApp click-to-chat, social links, package pre-selection)    │
│       ▼                                                                     │
│  [Phase 7] End-to-End Acceptance Test & Verification Runbook                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Files That Need Modification / Creation

1. `src/lib/integrations/contract.ts`: Unified Zod schemas for forward handoff and reverse call synchronization.
2. `src/lib/integrations/signing.ts`: Canonical HMAC request signing and verification.
3. `src/lib/integrations/reverse-sync-dispatcher.ts`: Automated dispatcher sending call events to LeadNexus.
4. `src/app/api/v1/integrations/leadnexus/events/route.ts`: Inbound event receiver for call status & outcomes.
5. `src/app/api/v1/integrations/leadnexus/route.ts`: Preserved forward handoff receiver.
6. `src/app/api/telephony/outbound/route.ts`: Emits `CALL_INITIATED` event upon dispatch.
7. `src/app/api/telephony/status/route.ts`: Emits `CALL_RINGING`, `CALL_ANSWERED`, `CALL_COMPLETED` events.
8. `src/app/api/calls/[id]/analyze/route.ts`: Emits `CALL_ANALYSIS_COMPLETED` and `FOLLOW_UP_CREATED` events.
9. `src/components/leads/lead-detail-drawer.tsx`: Enriched with full LeadNexus enquiry context, attribution, and post-call timeline.
10. `src/app/p/[slug]/public-page-client.tsx`: Enhanced with WhatsApp direct chat, social channels, and product-specific enquiry triggers.

---

## 8. Test Plan

1. **Unit Tests**:
   - HMAC signing & verification with valid/invalid signatures, expired timestamps, and tampered bodies.
   - Idempotency & duplicate event rejection.
   - Zod schema validation for all 8 call event types.
2. **Integration Tests (No PSTN Calls)**:
   - Synthetic LeadNexus enquiry submission → Forward handoff dispatch.
   - Synthetic VoiceNexus call lifecycle simulation → Reverse event delivery to LeadNexus.
   - Confirmation of identical business ID and lead ID across both records.
   - Verification that DNC leads are blocked from dispatch.
3. **End-to-End Acceptance Test**:
   - Single controlled test with verified mobile (`+916382868845`) only upon explicit user approval.
   - Full flow: Public enquiry → CRM record → Contextual AI call plan → Live phone call with Tamil greeting → Call outcome & transcript appearing in both LeadNexus and VoiceNexus.

