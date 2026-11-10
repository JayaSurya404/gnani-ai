# VoiceNexus AI — Project Rules

The GitHub repository and local folder are named `gnani-ai`. The product being built is **VoiceNexus AI**, a new application for the Great Indian AI Internship Challenge.

## Greenfield repository rule
- This repository is a clean, new implementation. Do not clone or copy an old repository into this workspace.
- Treat all legacy repositories as read-only reference material accessible through their public GitHub URLs:
  - VoiceNexus architecture and voice workflows: https://github.com/JayaSurya404/voicenexus
  - LeadNexus CRM and lead intelligence: https://github.com/JayaSurya404/leadnexus
  - Twilio/mobile/audio reference: https://github.com/JayaSurya404/ai-phone-call-app
  - Frontend structure and UI reference: https://github.com/JayaSurya404/LegalBridge
- Inspect repository trees, READMEs and only the source files relevant to a feature. Do not require local reference clones. If source inspection is blocked, report the exact blocker and ask before cloning anything outside this workspace.
- LegalBridge is a layout and component-composition reference only. Do not copy its legal-domain content or visuals. Create a distinct VoiceNexus brand and design system.
- Selectively adapt proven domain logic after understanding it. Do not blindly merge entire projects or databases.

## Product goal
Build one integrated multi-tenant business platform that combines useful LeadNexus and VoiceNexus capabilities:
- Business workspaces and profiles
- Lead capture, CRM, campaign attribution, visitor events, intent scoring and recovery
- AI Agent Studio and agent versioning
- Browser voice conversations using Gnani speech APIs
- Call records, transcripts, evidence-based outcomes and owner-approved follow-up
- Twilio telephony when a funded/eligible account is available

## Architecture invariants
- Use one coherent authentication/workspace model and one canonical database for the new application.
- Keep domain boundaries explicit: organizations, memberships, businesses, leads, campaigns, agents, calls, transcripts, outcomes, follow-ups and integrations.
- Keep a persistent WebSocket voice gateway separate from the Next.js web runtime when implementing realtime calling.
- Use provider interfaces for STT, LLM, TTS and telephony; avoid coupling business logic to a vendor SDK.
- Expected modular voice loop: STT -> turn/agent orchestration -> LLM -> TTS.
- Gnani Prisma and Timbre are speech providers. Twilio is telephony transport and is not replaced by Gnani.
- Start with a browser microphone demo before paid PSTN calls.
- Do not assume the user's Gnani API key includes hosted Evon inference. Verify the actual account and model access. Evon weights are a separate Hugging Face workflow and require suitable inference hardware or hosting.

## Security and cost
- Never ask the user to paste API keys, auth tokens, database URLs or provider secrets into chat or source code.
- Never expose credentials via `NEXT_PUBLIC_*`, client bundles, logs, screenshots or committed `.env` files.
- Use `.env.example` with blank values only and validate server-only environment variables.
- Enforce Supabase RLS and server-side authorization for every organization-owned record.
- Do not create, delete, pause, reset or migrate hosted databases without explicit approval and a reviewed backup/migration plan.
- Do not deploy paid services, upgrade accounts, add Twilio credits or create billable resources without explicit approval.
- Enforce AI identity disclosure, consent, do-not-call handling, human escalation, destination allowlists, bounded call duration/concurrency and idempotent call creation.

## Implementation discipline
- Inspect and plan before implementing. Create a migration map with `reuse`, `adapt`, `rewrite` and `defer` decisions.
- Use synthetic customer data for demos. Label fixtures as synthetic.
- Do not claim an integration works until a real provider request succeeds and its response is validated.
- Clearly distinguish simulated, mocked, browser-tested and real PSTN-tested functionality.
- Every visible control must work or be visibly disabled with an explanation.
- After each milestone run typecheck, lint, tests and production build where available.
- Update `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` and `docs/STATUS.md` as the project evolves.

## Milestone report format
1. What was inspected.
2. Files created or changed.
3. What works end-to-end and how it was verified.
4. What remains incomplete or mocked.
5. Commands run and results.
6. Any decision or approval needed.
