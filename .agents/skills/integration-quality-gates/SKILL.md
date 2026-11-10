---
name: integration-quality-gates
description: Verifies end-to-end functionality, security, provider integrations, PWA behavior and production readiness for the VoiceNexus platform. Use after feature implementation, before deployments, and when auditing regressions.
---

# Integration and Quality Gates Skill

## Verification levels
Label evidence precisely:
- `UNIT_TESTED`: isolated function/component tested.
- `INTEGRATION_TESTED`: internal components tested together, external calls mocked or controlled.
- `PROVIDER_VERIFIED`: real provider API request succeeded.
- `BROWSER_VERIFIED`: real browser workflow passed.
- `PSTN_VERIFIED`: a manually initiated, consented telephone call completed end-to-end.
- `DEPLOYED`: the exact tested revision is deployed.

Never treat one level as proof of a higher level.

## Required checks per milestone
- TypeScript/typecheck.
- Lint with zero unexplained warnings.
- Unit and integration tests.
- Production build.
- Browser tests for desktop and mobile breakpoints.
- Authorization and cross-tenant security tests for data features.
- Secret scan and `.env`/backup exclusion check.
- API failure, timeout and retry tests.
- PWA installability, manifest, service-worker scope and offline fallback checks.

## Voice-specific gates
- Real Prisma STT response from synthetic audio.
- Real Timbre TTS audio response playable in browser.
- LLM output validated against a strict schema.
- Transcript and outcomes persisted and linked to the correct lead/call.
- Provider failures do not become successful calls.
- Caller opt-out and AI disclosure are tested.
- Twilio real-call acceptance is manual, user-initiated and uses a verified test recipient.

## Deployment safety
- Do not deploy or provision paid infrastructure without explicit approval.
- Keep long-lived WebSocket voice services on a persistent WebSocket-capable service.
- Verify health endpoints and exact deployed commit.
- Inspect Render credit balance, service plan, estimated usage and billing alerts before creating paid services.
- Keep a rollback path and record environment variable names without printing values.
