# VoiceNexus Platform — Persistent Project Rules

## Product intent
Build one multi-tenant SaaS application that unifies the useful LeadNexus and VoiceNexus workflows: lead capture and intelligence, business workspaces, AI agent configuration, voice conversations, call outcomes, follow-up and analytics.

## Reference repositories
Use local, read-only reference clones under `.reference/` when available:
- `.reference/voicenexus`: architecture, auth, Supabase, gateway, Twilio and call lifecycle.
- `.reference/leadnexus`: business profiles, public pages, lead capture, attribution, scoring and recovery.
- `.reference/ai-phone-call-app`: Expo/mobile, Twilio media-stream and audio codec implementation.
- `.reference/LegalBridge`: selected frontend workspace layout and component patterns only.
Never modify the reference clones. Never copy entire reference applications wholesale. Extract and adapt bounded domain modules with a migration note.

## Architecture invariants
- Keep one product, one authenticated workspace model and one canonical database for the new platform.
- Keep domain boundaries explicit: organizations, businesses, leads, campaigns, agents, calls, transcripts, outcomes and follow-ups.
- Keep the persistent voice gateway separate from the Next.js web runtime. Use a WebSocket-capable persistent host for live media.
- Use provider interfaces for STT, LLM, TTS and telephony. Do not bind business logic directly to one vendor SDK.
- The intended modular voice loop is STT -> turn/agent orchestration -> LLM -> TTS. Streaming implementations must handle partial transcripts, playback buffering, interruption/barge-in, timeouts and cleanup.
- Twilio transports telephone calls; it is not replaced by Gnani speech models.
- Build the browser microphone demo before relying on paid PSTN calls.

## Security and cost rules
- Never ask the user to paste API keys, auth tokens, database URLs, Twilio credentials or Render tokens into chat or source files.
- Never expose secrets through `NEXT_PUBLIC_*`, client bundles, logs, screenshots or committed `.env` files.
- Use `.env.example` with names and blank values only; validate server-only environment variables at startup.
- Verify tenant isolation and Row Level Security for every organization-owned table. Never rely on the UI alone for authorization.
- Do not create, delete, pause, migrate or reset hosted databases without explicit user approval and a reviewed backup/migration plan.
- Do not deploy paid services, upgrade plans, add phone credits or create billable resources without explicit approval.
- Enforce call destination allowlists, do-not-call handling, AI identity disclosure, call duration/concurrency limits and idempotent call creation.

## Implementation discipline
- Inspect before editing. Write a migration map before porting code.
- Do not claim integrations work until a real request has been made and the response validated. Clearly distinguish mocks, local simulations and live providers.
- Do not fabricate charts, call records, lead activity, provider status or success states. Demo fixtures must be labelled as synthetic.
- Preserve existing functionality when refactoring. Prefer small, testable changes over wholesale rewrites.
- After each milestone run the available typecheck, lint, unit tests and production build. Add tests for provider failures and security boundaries.
- Keep UI responsive, keyboard accessible and reduced-motion aware. Every visible control must have a real action or be clearly disabled with an explanation.
- Update `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` and `docs/STATUS.md` as decisions and milestones are completed.

## Required delivery format for each milestone
1. What was inspected.
2. Files created/changed.
3. What works end-to-end and how it was verified.
4. What remains incomplete or mocked.
5. Commands run and their results.
6. Any decision or approval needed from the user.
