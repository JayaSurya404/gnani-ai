# VoiceNexus AI — Architecture Decision Records (ADRs)

## ADR-031: Ultra-Fast LLM Model Prioritization, Dynamic Latency Budgeting, and Fault-Tolerant Carrier Webhooks
- **Status:** Accepted (Milestone 11.2)
- **Context:** Following Milestone 11, real outbound carrier calls encountered an issue where Turn 1 greeting succeeded, caller spoke, but Turn 2 AI response was inaudible and Twilio terminated the call with "TwinML server cannot be reached". Forensic analysis of Twilio call history and server access logs revealed:
  1. `gemini-2.5-flash` had exceeded its free quota limit on Google AI Studio (`HTTP 429 Quota Exceeded`).
  2. The model retry array in `llm-voice-turn.ts` hardcoded `"gemini-2.5-flash"` twice consecutively and then fell back to `"gemini-flash-latest"` with a 2.8s timeout, consuming 3.6s–4.3s on dead LLM retries before falling back to domain template text.
  3. Gnani TTS synthesis added ~960ms, resulting in a total webhook turnaround of 4,740ms–6,324ms.
  4. Twilio `<Gather action="...">` PSTN carrier webhooks enforce a strict timeout of ~4.0s–4.2s. When a response exceeds 4.2s, Twilio treats it as a failed application/server endpoint, announces an error, and terminates the call.
  5. In `turn/route.ts`, unexpected exceptions in the catch block triggered `errorResponse.hangup()`, immediately terminating the carrier call.
- **Decision:**
  1. **Quota-Safe Model Routing:** Exclude `"gemini-2.5-flash"` completely from candidate models. Prioritize `"gemini-flash-lite-latest"` (~950ms turnaround with active quota) and fall back to `"gemini-3.5-flash-lite"` / `"gemini-3.1-flash-lite"`.
  2. **Hard LLM Latency Ceiling (2,200ms):** Enforce `AbortSignal.timeout(1800)` per candidate and a cumulative 2,200ms budget. If LLM exceeds 2,200ms, fast-fail immediately to domain template text (0ms) so carrier turnaround stays strictly within budget.
  3. **Dynamic TTS Budgeting:** In `turn/route.ts`, calculate `Math.max(1200, 3500 - elapsedBeforeTts)`. If Gnani TTS takes longer than the remaining time before 3.5s, fall back to instant Twilio `<Say>` (`Google.ta-IN-Standard-C`).
  4. **Eliminate Premature Disconnection:** Replace `errorResponse.hangup()` in the turn route catch block with a polite same-language reprompt and renewed `<Gather>` loop.

## ADR-001: Monorepo Architecture with Fastify Voice Gateway

## ADR-002: Next.js 16 Request Interception via `src/proxy.ts`

## ADR-003: Multi-Tenant PostgreSQL RLS with SECURITY DEFINER Helper Functions

## ADR-004: Dual-Mode Data Access with Strict Production Fixture Prohibition

## ADR-005: Dual-Layer Defense for Anonymous Public Enquiries

## ADR-006: Atomic Organization Provisioning via PostgreSQL Auth Trigger

## ADR-007: Lead Ingestion Deduplication and Recovery Reconciliation

## ADR-008: Public Route Separation (`/p/[slug]`) and Beacon Telemetry

## ADR-009: Immutable Prompt Versioning and Atomic Pointer Updates

## ADR-010: Dynamic Lead Context Injection with Mandatory Guardrails

## ADR-011: Dedicated Fastify Runtime for Real-Time Media Streams

## ADR-012: Incremental Audio Chunk Streaming with Client-Side Barge-in Abort

## ADR-013: Multi-Tenant Business Fixture Regional Isolation

## ADR-014: Persistent Do-Not-Call (DNC) Suppression & Regulatory Fail-Safe

## ADR-015: Truthful Escalation Lifecycle States & Spoken Acknowledgment

## ADR-016: Orthogonal Separation of Call Outcome, Compliance, Escalation, and Lifecycle

## ADR-017: Durable Transactional Outbox Job Queue & Lease Fencing

## ADR-018: Decoupled DNC Compliance Suppression vs Commercial Outcome Classification

## ADR-019: Explainable Lead Scoring Coverage Gating and Neutral Missing Data

## ADR-020: Bifurcated Notification Staging & Mandatory Human Approval for Customer WhatsApp

## ADR-021: Telephony Turn Barge-In Disablement and CDN Audio Serving

## ADR-022: Natural Telephony Prompting & Strict Role-Alternating History Normalization

## ADR-023: Telephony Spoken Turn Length Budget & Bounded Synthesis Timeout

## ADR-024: Verified Twilio Voice Identifiers & Balanced 6.0s Turn Synthesis Budget

## ADR-025: In-Memory Audio Gateway for Live Turns & CDN Edge 404 Prevention

## ADR-026: Sequential Play-Gather Telephony Execution and Fast Timbre v2.5

## ADR-027: Canonical Organization Tenancy Isolation and Role-Based Separation

## ADR-028: Fresh Indian Business Workspace (Kaveri Solar & Construction) & 13-Platform Social Media Integration

## ADR-030: Authoritative Voice & Language Compatibility Registry and Carrier TwiML Fault Isolation

## ADR-031: Ultra-Fast LLM Model Prioritization, Dynamic Latency Budgeting, and Fault-Tolerant Carrier Webhooks
- **Status:** Accepted (Milestone 11.2)
- **Context:** Following Milestone 11, real outbound carrier calls encountered an issue where Turn 1 greeting succeeded, caller spoke, but Turn 2 AI response was inaudible and Twilio terminated the call with "TwinML server cannot be reached". Forensic analysis of Twilio call history and server access logs revealed:
  1. `gemini-2.5-flash` had exceeded its free quota limit on Google AI Studio (`HTTP 429 Quota Exceeded`).
  2. The model retry array in `llm-voice-turn.ts` hardcoded `"gemini-2.5-flash"` twice consecutively and then fell back to `"gemini-flash-latest"` with a 2.8s timeout, consuming 3.6s–4.3s on dead LLM retries before falling back to domain template text.
  3. Gnani TTS synthesis added ~960ms, resulting in a total webhook turnaround of 4,740ms–6,324ms.
  4. Twilio `<Gather action="...">` PSTN carrier webhooks enforce a strict timeout of ~4.0s–4.2s. When a response exceeds 4.2s, Twilio treats it as a failed application/server endpoint, announces an error, and terminates the call.
  5. In `turn/route.ts`, unexpected exceptions in the catch block triggered `errorResponse.hangup()`, immediately terminating the carrier call.
- **Decision:**
  1. **Quota-Safe Model Routing:** Exclude `"gemini-2.5-flash"` completely from candidate models. Prioritize `"gemini-flash-lite-latest"` (~950ms turnaround with active quota) and fall back to `"gemini-3.5-flash-lite"` / `"gemini-3.1-flash-lite"`.
  2. **Hard LLM Latency Ceiling (2,200ms):** Enforce `AbortSignal.timeout(1800)` per candidate and a cumulative 2,200ms budget. If LLM exceeds 2,200ms, fast-fail immediately to domain template text (0ms) so carrier turnaround stays strictly within budget.
  3. **Dynamic TTS Budgeting:** In `turn/route.ts`, calculate `Math.max(1200, 3500 - elapsedBeforeTts)`. If Gnani TTS takes longer than the remaining time before 3.5s, fall back to instant Twilio `<Say>` (`Google.ta-IN-Standard-C`).
  4. **Eliminate Premature Disconnection:** Replace `errorResponse.hangup()` in the turn route catch block with a polite same-language reprompt and renewed `<Gather>` loop.
