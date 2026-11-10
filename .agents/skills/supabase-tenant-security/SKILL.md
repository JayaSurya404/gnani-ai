---
name: supabase-tenant-security
description: Designs and reviews VoiceNexus Supabase Auth, PostgreSQL schema, RLS, migrations, Realtime and Storage with organization-level tenant isolation. Use for any database, authentication, authorization, migration or Supabase integration change.
---

# Supabase Tenant Security Skill

## Before changing Supabase
- Read current Supabase documentation and load the official Supabase skill if installed.
- Inspect existing migrations and generated database types before proposing schema changes.
- Distinguish publishable client keys from privileged server-side secret keys.
- Never expose service-role/secret keys in browser bundles or `NEXT_PUBLIC_*` variables.

## Tenancy model
- Every organization-owned row must carry an organization identifier or have an unambiguous secure parent relationship.
- Enforce tenant isolation with RLS policies, not client-side filters alone.
- Check role and active membership server-side for privileged operations.
- Ensure Realtime subscriptions are scoped to rows the authenticated user may access.
- Test cross-tenant reads, writes, updates and deletes explicitly.

## Migrations
- Use versioned, ordered, reviewed migrations.
- Prefer additive changes and expand/contract for breaking schema changes.
- Add indexes for foreign keys and common tenant-filtered access patterns.
- Never reset, drop or overwrite a hosted project without explicit user approval and a verified backup.
- Do not assume a local migration has been applied remotely; inspect remote migration history.

## Auth and secrets
- Use the current recommended Next.js SSR pattern from Supabase docs.
- Validate users and claims server-side; do not treat a client session object as authorization proof.
- Use narrowly scoped access tokens for management tooling where available.
- Keep database URLs, secret API keys and service credentials in server-only environment variables.

## Verification checklist
- Authenticated owner can access their own organization records.
- Another organization cannot read or mutate those rows.
- Anonymous access is limited to explicitly public business-page data.
- Privileged functions validate organization membership and role.
- Realtime and Storage policies do not bypass tenant isolation.
- Migration can be applied to a clean local database and has a documented rollback/recovery strategy.
