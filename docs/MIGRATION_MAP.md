# VoiceNexus AI — Migration Map & Unification Strategy

This document outlines the migration decisions (`reuse`, `adapt`, `rewrite`, `defer`) for incorporating capabilities from the four reference repositories into the new greenfield VoiceNexus AI platform.

---

## 1. Migration Decision Matrix

| Domain Module | Reference Origin | Decision | Justification & Action |
|---|---|---|---|
| **Audio Codec (`mulaw <-> pcm16`, resampler)** | `voicenexus/services/voice-gateway/src/audio/codec.ts` | **`reuse`** | Bitwise math for μ-law expansion, companding, and linear interpolation resampling is pure, robust, and heavily tested. Reused directly in the voice gateway. |
| **Call State Machine** | `voicenexus/services/voice-gateway/src/calls/state-machine.ts` | **`reuse`** | Formal transition table (`QUEUED` -> `INITIATING` -> `RINGING` -> `IN_PROGRESS` -> terminal states) with validation guards works cleanly and prevents race conditions. |
| **Twilio Media Streaming & Barge-in** | `ai-phone-call-app/services/twilio-gateway/src/twilio-media.ts` | **`reuse`** | Proven Twilio media chunk transmission (`sendTwilioAudio`) and barge-in audio clearing (`clearTwilioAudio` emitting Twilio `clear` event) works reliably. |
| **Twilio Media Stream TwiML Generator** | `ai-phone-call-app/services/twilio-gateway/src/media-stream-twiml.ts` | **`reuse`** | Clean generation of `<Connect><Stream url="..." /></Connect>`. |
| **Workspace Shell & Navigation Layout** | `LegalBridge/client/src/components/layout/` | **`adapt`** | Adapt the collapsible desktop sidebar, responsive mobile drawer, and breadcrumb navigation structure. Replace legal domain visuals with VoiceNexus design tokens and typography. |
| **Lead Status & Ownership Actions** | `leadnexus/src/actions/leads/` | **`adapt`** | Adapt actions for updating lead status and adding notes, scoping them to the new unified `organizations` and `memberships` table instead of standalone `businesses`. |
| **Lead Intelligence Scoring Engine** | `leadnexus/supabase/migrations/20260812020001_lead_intelligence_rules.sql` | **`adapt`** | Adapt deterministic scoring rules (page views, product views, form submission, CTA clicks) into the unified schema, enhanced with LLM analysis. |
| **Post-Call Outcome Schema & Extraction** | `voicenexus/services/voice-gateway/src/calls/outcome.ts` | **`adapt`** | Adapt Zod schema to output structured evidence-based outcomes, objections, follow-ups, and confidence scores into the unified `call_outcomes` table. |
| **Browser Test Agent (Web Mic Demo)** | `voicenexus/services/voice-gateway/src/browser-test/session.ts` | **`adapt`** | Adapt session to use the new modular STT -> LLM -> TTS pipeline (Gnani Prisma + Gemini/Groq + Gnani Timbre) instead of Gemini Live direct audio. |
| **Twilio Outbound Calling Service** | `voicenexus/services/voice-gateway/src/twilio/outbound.ts` | **`adapt`** | Adapt outbound calling with strict allowlists, DNC check, AI disclosure requirements, and organization balance verification. |
| **Public Business Profile & Tracking** | `leadnexus/src/actions/business/`, `public/` | **`adapt`** | Adapt public enquiry capture page and visitor session tracking into the unified App Router structure under `src/app/(public)/`. |
| **Voice Speech Pipeline (STT -> LLM -> TTS)** | Greenfield | **`rewrite`** | Decouple from monolithic multimodal sockets. Implement provider interfaces (`STTProvider`, `TTSProvider`, `LLMProvider`) supporting Gnani Prisma v3, Timbre v1, and Gemini/Groq. |
| **Voice Profile & Cloning Studio** | Greenfield | **`rewrite`** | Build full voice profile catalog with Gnani prebuilt voices, plus custom voice cloning embedding generator (`/api/v1/tts/voice-clone/embeddings`) with explicit owner consent. |
| **Database & Tenancy Model** | Greenfield | **`rewrite`** | Create a single canonical PostgreSQL schema with organization-level RLS, replacing the two incompatible schemas from LeadNexus and VoiceNexus. |
| **AI Agent Studio & Versioning** | Greenfield | **`rewrite`** | Build a unified Agent Studio where business owners configure instructions, language directives (Tanglish/Tamil/English), voice assignment, and knowledge context. |
| **Outbox Webhooks / Cross-App Handoff** | `leadnexus/supabase/migrations/20260812080001_voicenexus_handoff.sql` | **`defer`** | In the unified platform, LeadNexus and VoiceNexus share one database. Cross-app HTTP webhook handoff is obsolete; replaced by direct database relations. |
| **Evon v3.3 Self-Hosted Inference** | Open weights on Hugging Face | **`defer`** | Deferred until dedicated GPU infrastructure is provisioned. Initial text reasoning runs on Gemini / Groq. |
| **Exotel Telephony Integration** | Mentioned in future scope | **`defer`** | Primary telephony provider is Twilio. Keep telephony interface modular for future providers. |

---

## 2. Canonical Database Unification Plan

The new application replaces the disparate tables of the two previous databases with one canonical schema:

```
[organizations] 1 --- * [organization_memberships] * --- 1 [profiles]
       |
       +--- 1 --- * [businesses]
       |                 |
       |                 +--- 1 --- * [products_services]
       |                 +--- 1 --- * [campaigns]
       |                 +--- 1 --- * [visitor_sessions] --- 1 --- * [visitor_activities]
       |                 +--- 1 --- * [leads]
       |                                |
       |                                +--- 1 --- 1 [lead_intelligence]
       |                                +--- 1 --- * [lead_recovery_tasks]
       |                                +--- 1 --- * [lead_notes]
       |
       +--- 1 --- * [agents]
       |                 |
       |                 +--- 1 --- * [agent_versions]
       |
       +--- 1 --- * [voice_profiles]
       |                 |
       |                 +--- 1 --- * [voice_consent_records]
       |
       +--- 1 --- * [calls]
                         |
                         +--- 1 --- * [call_events]
                         +--- 1 --- * [call_transcripts]
                         +--- 1 --- 1 [call_outcomes]
                         +--- 1 --- * [follow_up_tasks]
```

### Table Mapping Table

| Domain | Legacy Table (LeadNexus) | Legacy Table (VoiceNexus) | Canonical VoiceNexus AI Table | RLS Policy Key |
|---|---|---|---|---|
| Identity | `profiles` | `profiles`, `organizations`, `organization_members` | `profiles`, `organizations`, `organization_memberships` | `organization_id` |
| Business | `businesses`, `products_services` | N/A | `businesses`, `products_services` | `organization_id` |
| Attribution | `campaigns`, `visitor_sessions`, `visitor_activities` | N/A | `campaigns`, `visitor_sessions`, `visitor_activities` | `organization_id` |
| CRM | `leads`, `lead_recovery_tasks` | `leads` (partial) | `leads`, `lead_intelligence`, `lead_recovery_tasks`, `lead_notes` | `organization_id` |
| Agents | N/A | `agent_configurations`, `agent_versions` | `agents`, `agent_versions` | `organization_id` |
| Voice | N/A | `voice_profiles` (stub) | `voice_profiles`, `voice_consent_records` | `organization_id` |
| Telephony | N/A | `calls`, `call_transcripts`, `call_outcomes` | `calls`, `call_events`, `call_transcripts`, `call_outcomes` | `organization_id` |
| Operations | `lead_recovery_tasks` | `follow_up_tasks` | `follow_up_tasks`, `audit_events`, `integration_states` | `organization_id` |

---

## 3. Component & UI Migration Strategy

1. **Workspace Shell**:
   - Source: `LegalBridge/client/src/components/layout/workspace-shell.tsx`
   - Transformation: Retain the responsive collapsible sidebar and mobile drawer pattern. Inject VoiceNexus AI navigation structure:
     - **Workspace**: Overview (Dashboard), Leads & CRM, Business Pages, Campaigns, Lead Recovery.
     - **AI Intelligence**: AI Agent Studio, Agent Playground, Voice Calls, Conversations, Call History.
     - **Operations**: Analytics, Automations, Integrations, Settings.
2. **Design Tokens & Theme**:
   - Palette: Deep graphite (`#0F1117`), dark slate card surfaces (`#181B26`), refined indigo accent (`#4F46E5` / `#6366F1`), crisp emerald for positive qualification (`#10B981`), amber for warm leads (`#F59E0B`), rose for DNC/objections (`#EF4444`).
   - Typography: Clean, legible modern sans-serif scale with tabular numbers for data grids.
3. **Data Grids & Filters**:
   - Unified lead table with instant search, hot/warm/cold filter, source attribution tag, and one-click call trigger.

