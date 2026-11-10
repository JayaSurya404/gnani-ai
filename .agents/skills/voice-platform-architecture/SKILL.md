---
name: voice-platform-architecture
description: Plans and evolves the unified VoiceNexus SaaS architecture, selectively migrating LeadNexus and VoiceNexus capabilities, shaping domain modules, repository structure, API contracts and deployment boundaries. Use for repository audits, architecture decisions, feature migration and system integration.
---

# VoiceNexus Platform Architecture Skill

## Mission
Build a unified product from existing work without performing a blind repository merge. The new repository is the source of truth. Reference repositories are read-only.

## Required audit before implementation
1. Inventory routes, packages, services, database tables, migrations, provider adapters, tests and deployment files in the new repo.
2. Inventory relevant reference files in `.reference/` and record exact source paths.
3. Create `docs/MIGRATION_MAP.md` with `reuse`, `adapt`, `rewrite`, `defer` decisions and reasons.
4. Identify overlapping models and propose one canonical organization/business/lead identity model.
5. Identify the smallest vertical slice that proves the product end-to-end.

## Suggested domain boundaries
- Identity and tenancy: users, organizations, memberships, roles, sessions.
- Business: business profiles, service catalogue, public pages, business settings.
- Lead intelligence: leads, sources, events, campaign attribution, scoring, recovery and notes.
- Agent platform: agent definitions, versions, prompts, tools, knowledge sources and test sessions.
- Voice: call sessions, telephony events, audio sessions, transcripts and recordings metadata.
- Outcomes: qualification, summary, objections, next action, handoff and follow-up tasks.
- Integrations: provider connections, webhooks, idempotency keys, delivery attempts and audit events.

Do not create one mega-table or merge unrelated concepts merely because they appear in both legacy products.

## Design principles
- Multi-tenant by organization; business records are scoped to an organization.
- Server-side authorization and database RLS must agree.
- Domain services should depend on interfaces, not UI code or vendor SDKs.
- Provider adapters should normalize vendor responses into internal contracts.
- Keep web serverless routes separate from long-lived WebSocket media runtime.
- Prefer an outbox/idempotent delivery pattern for cross-module events and webhook integration.
- Use explicit call state transitions and auditable lifecycle events.

## Migration discipline
- Never copy `.env`, secrets, generated build output, backup dumps, Git history or local database state.
- Preserve original references and document provenance in migration notes.
- Use additive, reversible database migrations where practical.
- Never run destructive hosted migrations without explicit approval and verified backup.
- Do not port features that are not needed for the first coherent release.

## First vertical slice
A synthetic website enquiry becomes a lead, an owner chooses an AI agent, the browser demo captures audio, STT returns a real transcript, the LLM responds, TTS returns playable audio, and the app persists the conversation and a transparent qualification result.
