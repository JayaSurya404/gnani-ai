# VoiceNexus AI — Reference Repository Audit

## Executive Summary

VoiceNexus AI is a greenfield, multi-tenant B2B platform combining lead capture, attribution, and scoring (from LeadNexus) with real-time AI voice calling, audio streaming, and evidence-based post-call analytics (from VoiceNexus and AI Phone Call App), presented in a premium enterprise SaaS interface (inspired by LegalBridge's workspace structure and layout composition).

This audit documents the findings from inspecting the four reference repositories via read-only GitHub API and repository tree inspection.

---

## 1. Reference Repositories Overview

| Repository | Purpose & Focus | Technologies | Key Strengths | Gaps / Limitations to Avoid |
|---|---|---|---|---|
| **VoiceNexus**<br>`JayaSurya404/voicenexus` | Voice calling platform, Fastify media gateway, Browser Test Agent, Gemini Live audio, Supabase persistence | Next.js 16, Fastify, WebSockets, Supabase, Twilio Media Streams, Gemini Live API | Robust audio codec (`mulaw <-> pcm16`), strict call state machine, Zod outcome extraction, browser mic test agent | Coupled tightly to Gemini Live API instead of modular STT->LLM->TTS; lacked native Gnani Prisma/Timbre support; separate database from LeadNexus |
| **LeadNexus**<br>`JayaSurya404/leadnexus` | Lead management, business profiles, visitor tracking, attribution, lead recovery, rules-based scoring | Next.js 15/16, Supabase, PostgreSQL RPCs, Tailwind CSS | Clear domain model for public business pages, product catalog, visitor session/activity tracking, rules-based HOT/WARM/COLD scoring | Lacked calling capabilities; had separate tenant model (`business_id` without full organization hierarchy); needed manual handoff export to VoiceNexus |
| **AI Phone Call App**<br>`JayaSurya404/ai-phone-call-app` | Telephony media stream gateway, low-level Twilio integration, audio buffering, barge-in / clear | Fastify, Twilio SDK, WebSockets, Node.js | Fastify formbody webhook parsing, TwiML `<Connect><Stream>` generation, Twilio media frame handling, barge-in buffer clearing (`clearTwilioAudio`) | Specialized standalone microservice; lacked persistent database CRM integration; single-tenant configuration |
| **LegalBridge**<br>`JayaSurya404/LegalBridge` | Frontend architecture & UI reference for enterprise SaaS workspace shell | Next.js 16, React 19, Tailwind CSS, Radix UI, Framer Motion, Lucide React | Polished collapsible sidebar, responsive mobile drawer, breadcrumb navigation, structured data tables, clean client/server separation | Legal-domain specific visuals and branding; must not copy legal domain content; use as layout composition reference only |

---

## 2. Detailed Inventory of Reference Implementations

### A. VoiceNexus (`JayaSurya404/voicenexus`)
- **Location & Tree**: 346 files total.
- **Key Modules & Exact Paths**:
  - `services/voice-gateway/src/audio/codec.ts`: Bitwise μ-law to PCM16 expansion and PCM16 to μ-law compression (`mulawToPcm16`, `pcm16ToMulaw`, `resamplePcm16`). Handles 8 kHz μ-law from Twilio to 16 kHz or 24 kHz linear PCM and back with linear interpolation. **Status: IMPLEMENTED & TESTED**. Highly reusable.
  - `services/voice-gateway/src/calls/state-machine.ts`: Strict state transition matrix (`QUEUED` -> `INITIATING` -> `RINGING` -> `IN_PROGRESS` -> `COMPLETED`/`FAILED`/`BUSY`/`NO_ANSWER`/`CANCELED`). **Status: IMPLEMENTED & TESTED**. Reusable directly.
  - `services/voice-gateway/src/calls/outcome.ts`: Zod schema for post-call analysis (`outcomeSchema`), capturing `summary`, `customer_need`, `requirements`, `budget_information`, `timeline`, `decision_authority`, `objections`, `disposition`, `sentiment`, `confidence`, `recommended_next_action`. **Status: IMPLEMENTED**. Adaptable to Gnani/Gemini orchestrator.
  - `services/voice-gateway/src/browser-test/session.ts`: WebSocket browser testing session allowing microphone and speaker streaming in the browser without PSTN charges. **Status: IMPLEMENTED & TESTED**. Reusable for the browser demo.
  - `services/voice-gateway/src/twilio/media-session.ts`: Bidirectional Twilio Media Streams handler with backpressure, mark events, and silence detection. **Status: IMPLEMENTED & TESTED**. Adaptable for the modular voice loop.
  - `services/voice-gateway/src/twilio/outbound.ts`: Outbound call initiation using Twilio REST client, generating media stream TwiML. **Status: IMPLEMENTED**. Reusable with verification checks.
  - `src/features/agents/`: Web UI components for configuring agent instructions, voices, and temperature. **Status: IMPLEMENTED**. Adaptable to unified Agent Studio.
  - `supabase/migrations/`: Multi-tenant schema with organizations, memberships, agent configurations, calls, transcripts, and outcomes. **Status: IMPLEMENTED**. To be unified with LeadNexus schema.

### B. LeadNexus (`JayaSurya404/leadnexus`)
- **Location & Tree**: 387 files total.
- **Key Modules & Exact Paths**:
  - `src/actions/intelligence/analyze-lead.ts`: Invokes lead intelligence scoring. **Status: IMPLEMENTED**. Adaptable.
  - `supabase/migrations/20260812020001_lead_intelligence_rules.sql`: Deterministic PostgreSQL function `analyze_lead_rules(p_lead_id)` calculating visitor interaction score, HOT/WARM/COLD classification, and buying intent. **Status: IMPLEMENTED & TESTED**. Highly adaptable.
  - `src/actions/leads/add-owner-lead-note.ts` & `update-owner-lead-status.ts`: Lead status updates (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, etc.) and internal team notes. **Status: IMPLEMENTED**. Reusable.
  - `src/actions/business/`: Actions for updating business profile, public page SEO, business hours, brand colors, and contact templates. **Status: IMPLEMENTED**. Reusable.
  - `src/actions/recovery/ignore-lead.ts` & `send-to-owner.ts`: Lead recovery triage workflow for abandoned or dropped visitor sessions. **Status: IMPLEMENTED**. Reusable.
  - `src/actions/links/create-tracking-link.ts`: UTM parameter generation and campaign link click tracking. **Status: IMPLEMENTED**. Reusable.

### C. AI Phone Call App (`JayaSurya404/ai-phone-call-app`)
- **Location & Tree**: 320 files total.
- **Key Modules & Exact Paths**:
  - `services/twilio-gateway/src/twilio-media.ts`: Functions `sendTwilioAudio(ws, streamSid, pcm16Chunk)` and `clearTwilioAudio(ws, streamSid)` for low-latency audio transmission and barge-in / interruption buffer purging via Twilio `clear` events. **Status: IMPLEMENTED & TESTED**. Highly reusable.
  - `services/twilio-gateway/src/media-stream-twiml.ts`: TwiML generator producing `<Connect><Stream url="..." /></Connect>`. **Status: IMPLEMENTED**. Reusable.
  - `services/twilio-gateway/src/language-profiles.ts`: Language code mappings and Tanglish/Tamil conversational profiles. **Status: IMPLEMENTED**. Adaptable to Gnani Timbre/Prisma language codes.

### D. LegalBridge (`JayaSurya404/LegalBridge`)
- **Location & Tree**: 322 files total.
- **Key Modules & Exact Paths**:
  - `client/src/components/layout/workspace-shell.tsx`: Workspace shell container with responsive sidebar state (collapsible), mobile navigation drawer (Radix Dialog), top navigation header, and main content area. **Status: IMPLEMENTED & TESTED**. Layout composition pattern to be adapted for VoiceNexus AI.
  - `client/src/components/ui/`: Radix-based UI primitives (button, dialog, tabs, dropdown, sonner toast). **Status: IMPLEMENTED**. Clean component structure.
  - `client/src/app/(workspace)/`: Route organization separating public/auth routes from authenticated workspace routes. **Status: IMPLEMENTED**. Reusable architecture pattern.

---

## 3. Provider Integration Status in References

| Provider | Documented / Implemented in References | Verification Status | Reality in Greenfield VoiceNexus AI |
|---|---|---|---|
| **Gnani Prisma STT** | Mentioned in requirements; not fully wired in legacy VoiceNexus (which used Gemini Live directly) | `UNVERIFIED` in legacy repos | Must implement fresh server-side adapter: REST endpoint `https://api.vachana.ai/stt/v3` and streaming `wss://api.vachana.ai/stt/v3/stream`. |
| **Gnani Timbre TTS** | Mentioned in requirements; not fully wired in legacy VoiceNexus | `UNVERIFIED` in legacy repos | Must implement fresh server-side adapter: REST `https://api.vachana.ai/api/v1/tts/inference` and streaming `wss://api.vachana.ai/api/v1/tts`. |
| **Gnani Voice Cloning** | Referenced in Gnani docs | `UNVERIFIED` in legacy repos | Must implement embedding creation `https://api.vachana.ai/api/v1/tts/voice-clone/embeddings`, consent management, and profile storage. |
| **Twilio Telephony** | Implemented in VoiceNexus and ai-phone-call-app; tested with real verified Indian mobile | `PSTN_VERIFIED` in previous testing | Verified PSTN calling to consented test numbers. Must enforce caller ID verification, DNC rules, and owner approval. |
| **Gemini / Groq LLM** | Implemented for post-call analysis and chat turns | `PROVIDER_VERIFIED` | Used as primary reasoning engine for conversation turns and structured JSON outcome analysis. |
| **Evon v3.3** | Open weights referenced on Hugging Face | `EXTERNAL_HOSTED_ONLY` | Not an official hosted API on `api.vachana.ai`. Must not be claimed as available on standard API key. |

---

## 4. Architectural Gaps in Legacy Systems Addressed in VoiceNexus AI

1. **Fragmented Tenancy**: LeadNexus had `business_id` scoping; VoiceNexus had `organization_id` scoping. In VoiceNexus AI, an `Organization` owns one or more `Business Profiles`, and all leads, campaigns, agents, and calls are strictly partitioned by `organization_id` with Postgres RLS.
2. **Coupled Voice Loop**: VoiceNexus previously used Gemini Live directly for audio-in/audio-out, preventing native integration with Gnani Prisma and Timbre. VoiceNexus AI introduces an explicit decoupled pipeline: `Audio Input -> STT Provider (Gnani Prisma) -> Turn Orchestrator -> LLM Provider -> TTS Provider (Gnani Timbre) -> Audio Output`.
3. **Data Silos**: Previously, LeadNexus leads had to be exported or queued via webhooks into VoiceNexus. In VoiceNexus AI, lead intelligence and voice calling exist in the same unified database and product workspace.
4. **UI Cohesion**: Previous apps had disparate styles (purple-gradient AI theme in VoiceNexus v1, green-accented CRM in LeadNexus). VoiceNexus AI unifies everything under a cohesive, high-contrast, professional B2B design system.

