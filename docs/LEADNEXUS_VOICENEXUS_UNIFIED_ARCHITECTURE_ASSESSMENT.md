# LEADNEXUS + VOICENEXUS AI — UNIFIED BUSINESS LEAD INTELLIGENCE & AI CALLING PLATFORM
## Phase 1: Comprehensive Architecture and Integration Assessment

**Date:** November 13, 2026  
**Document:** Architecture & Integration Assessment (Phase 1 Deliverable)  
**Target Architecture:** Unified Multi-Tenant SaaS Platform  
**Platform Roles:**  
- **LeadNexus**: Business discovery, public business profile (`/p/[slug]`), enquiry capture, and CRM workspace.  
- **VoiceNexus**: AI-powered customer communication, qualification, Gnani speech orchestration, and real telephone calling.  

---

## 1. Existing Architecture Assessment

### A. Greenfield Implementation Status
VoiceNexus AI (`d:\gnani-ai`) is implemented as an integrated, multi-tenant B2B platform combining proven LeadNexus domain concepts (public pages, visitor tracking, lead scoring, lead recovery) and VoiceNexus voice systems (Fastify persistent media gateway, Twilio telephony, Gnani Prisma STT, Gnani Timbre TTS, and post-call intelligence).

### B. Core Technology Stack
- **Framework**: Next.js 16.2.12 App Router (Turbopack), React 19, TypeScript 5.8.
- **Styling & Design System**: iOS Liquid Glass Light Theme (`#F3F5FA` background, `#192238` slate foreground, `#7065E8` royal violet, translucent glass cards with `backdrop-filter: blur(24px)`).
- **Canonical Database**: Hosted Supabase PostgreSQL (`bgiorhtaiqwffkdfrugj.supabase.co`) with Row Level Security (RLS) enforcing multi-tenant organization isolation.
- **Voice Telephony Engine**: 
  - Twilio PSTN REST API (`Calls.json` with trial-compliant dynamic TwiML webhooks).
  - Twilio Programmable Voice (`<Gather input="speech">` + `<Play>` audio).
- **Speech Providers**:
  - **Gnani Prisma v3**: Speech-to-Text (STT) for Indian English and Tamil transcription.
  - **Gnani Timbre v2.5/v3.0**: Text-to-Speech (TTS) via WebSocket API (`wss://api.vachana.ai/api/v1/tts`) using native voices (`Asmita` for Tamil, `Kaveri`/`Arun` for Indian English).
- **Reasoning Engines**: Dual-provider LLM failover using Groq LPU (Llama 3.3 70B Versatile, 230ms turn latency) and Google Gemini 2.5 Flash, backed by deterministic rule failover.
- **Audio Cache Architecture**: Two-tier caching (process-global `globalThis.__vn_audio_registry` + persistent local disk `.audio-cache/`) with pre-warmed audio synthesis before call signaling.

---

## 2. Current LeadNexus Public-Page Functionality

### A. Location & Implementation
- **Route**: `src/app/p/[slug]/page.tsx` (Server Component) and `public-page-client.tsx` (Client Component).
- **Data Flow**:
  1. Resolves `slug` against `public.business_pages` in Supabase PostgreSQL.
  2. If published, joins associated `public.businesses` and active `public.products`.
  3. If not yet seeded in Supabase, falls back to the MNRE-approved demo profile (`aadhira-solar`).
  4. Returns `404 Not Found` for unrecognized slugs.

### B. Supported Public Page Capabilities
- **Business Profile**: Name, legal name, tagline, description, phone number, email address, physical location (city, state, country).
- **Interactive Solar ROI Calculator**:
  - Dynamic monthly bill slider (₹1,000 to ₹50,000).
  - Calculates estimated units consumed per month (based on Tamil Nadu tariff ~₹8.50/unit).
  - Recommends rooftop system size (kW) and shadow-free roof area.
  - Computes 85% bill savings (monthly and annual).
  - Displays PM Surya Ghar government subsidy eligibility (up to ₹78,000 for residential).
- **Product & Package Catalog**:
  - Displays structured packages (e.g. 3kW Residential Surya Package, 10kW Commercial System, 50kW Industrial Array) with turnkey pricing, descriptions, and SKU tags.
- **Enquiry Submission Pipeline (`POST /api/enquiry`)**:
  - Validates full name, E.164 phone number, email address, and interest.
  - Enforces client IP rate limiting (5 req/min) and phone rate limiting (3 req/5min) with bot honeypot detection.
  - Evaluates lead intent signals (monthly bill, dwell time, calculator interaction).
  - Persists record to `public.leads` and `public.lead_intelligence`.
- **Visitor Telemetry (`POST /api/visitor`)**:
  - Automatically emits `PAGE_VIEW` on mount.
  - Emits `ABANDONED_FORM` on unload if user entered partial contact details without submitting.

---

## 3. Current Owner-Dashboard Functionality

The authenticated owner workspace provides 5 streamlined business views with no developer clutter:

1. **Overview (`/dashboard`)**:
   - Real-time business KPIs: Total Enquiries, High-Intent Leads, PSTN AI Calls, Qualification Rate.
   - Quick action shortcuts (Add Enquiry, Edit Public Page, Dispatch Call).
   - Recent Inquiries feed and Recent Calls summary with live database polling.
2. **Leads CRM (`/leads`)**:
   - High-density data table with full-text search across name, phone, and email.
   - Multi-factor filtering: by Stage (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`, `DO_NOT_CALL`) and Temperature (`HOT`, `WARM`, `COLD`).
   - Manual Add Enquiry modal.
   - CSV export capability.
   - Direct click-to-open Lead Detail Drawer.
3. **Public Page Manager (`/business-pages`)**:
   - Business headline and subheadline editor.
   - Public URL slug manager with live status toggle (Published / Draft).
   - Shareable QR code card and direct link copy button.
   - Solar packages catalog preview.
4. **Calls Workspace (`/calls`)**:
   - Complete telephony call log with direction, phone number, duration, and status.
   - Sentiment badges and recording indicators.
   - Call Details & Transcript Drawer displaying turn-by-turn dialogue in Tamil and English.
   - Dispatch Outbound Call modal for ad-hoc customer calls.
5. **Settings (`/settings`)**:
   - Tab 1: Business Profile (name, legal name, email, phone, address).
   - Tab 2: Twilio Telephony configuration and status.
   - Tab 3: Gnani Speech & Languages (Tamil `ta-IN`, English `en-IN`, Hindi `hi-IN`).
   - Tab 4: Team & Security (RLS audit, tenant membership).

---

## 4. Current VoiceNexus Lead Functionality

### A. How VoiceNexus Imports, Stores, Analyzes, and Calls Leads
1. **Canonical Lead Identity**:
   Leads captured via the public page or manual entry are stored in `public.leads`. VoiceNexus does not maintain a second database or parallel table.
2. **Lead Intent Analysis (`POST /api/leads/[id]/analyze`)**:
   - Triggered from the Lead Detail Drawer.
   - Evaluates enquiry signals (bill amount, interest type, calculator interaction).
   - Assigns explainable score (0–100), temperature (`HOT`/`WARM`/`COLD`), priority level, and estimated deal value.
   - Updates `leads.score`, `leads.temperature`, and writes to `lead_intelligence`.
3. **Contextual AI Call Plan Synthesis (`POST /api/leads/[id]/plan`)**:
   - Synthesizes a structured conversation roadmap grounded in the prospect's actual enquiry:
     - **Objective**: Exact qualification goal (e.g. qualify roof suitability and 3-phase power for 5kW solar).
     - **Opening Greeting**: Personalized greeting in Tamil or English mentioning the prospect's name, company, and specific enquiry interest.
     - **Discovery Questions**: 4 targeted questions covering monthly bill, roof type, PM Surya Ghar subsidy interest, and site visit timeline.
     - **Anticipated Objections**: 2 specific objections (e.g. subsidy payout timeline, monsoon generation) with pre-scripted responses.
     - **Escalation Trigger**: Clear condition for transfer to senior solar engineer.
   - **Editable**: The business owner can modify the opening greeting and questions directly in the drawer before placing the call.
4. **AI Outbound Calling (`POST /api/telephony/outbound`)**:
   - Initiates a call using Twilio PSTN to the customer's phone.
   - Enforces DNC checks and regulatory calling windows (9 AM – 9 PM).
   - Pre-synthesizes the opening greeting via Gnani Timbre TTS and caches the audio buffer in shared storage.
   - Twilio requests `/api/telephony/outbound-twiml`, which returns trial-compliant TwiML (`<Gather><Play>...</Play></Gather>`) in under 15ms.
   - When the customer speaks, Twilio captures speech via `<Gather>` and posts to `/api/telephony/turn`.
   - The reasoning engine generates the next response, Gnani Timbre synthesizes it, and the conversation continues naturally.

---

## 5. Existing Database and API Relationship

Both applications operate against a **single canonical PostgreSQL database** on Supabase:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SUPABASE POSTGRESQL CANONICAL SCHEMA                     │
│                                                                             │
│  organizations (Tenant Root)                                                │
│        │ 1:N                                                                │
│        ▼                                                                    │
│  businesses (Business Profiles)                                             │
│        │ 1:1                     │ 1:N                     │ 1:N            │
│        ▼                         ▼                         ▼                │
│  business_pages               products                   leads              │
│  (Slug, Title, Published)     (SKU, Price, Category)       │ 1:1            │
│                                                            ▼                │
│                                                      lead_intelligence      │
│                                                      (Score, Intent, Pitch) │
│                                                            │ 1:N            │
│                                                            ▼                │
│                                                      call_sessions          │
│                                                      (Status, Duration, SID)│
│                                                            │ 1:1            │
│                                                            ▼                │
│                                                      call_outcomes          │
│                                                      (Summary, Disposition) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key API Relationships:
- **Lead Capture**: `POST /api/enquiry` → writes to `leads` + `lead_intelligence`.
- **Visitor Tracking**: `POST /api/visitor` → writes to `lead_recovery_records`.
- **CRM Operations**: `GET /api/leads`, `GET /api/leads/[id]` → reads from `leads` joined with `business_id`.
- **Intelligence**: `POST /api/leads/[id]/analyze`, `POST /api/leads/[id]/plan` → reads/updates `leads` & `lead_intelligence`.
- **Telephony Dispatch**: `POST /api/telephony/outbound` → creates `call_sessions` row with `lead_id` and `business_id`.
- **Telephony Turn**: `POST /api/telephony/turn` → updates `call_events` and logs user/agent dialogue.
- **Call Outcome Finalization**: `POST /api/calls/[id]/analyze` → generates structured `call_outcomes`.

---

## 6. Integration Gaps Identified

| # | Gap Area | Current State | Required Target State |
| :--- | :--- | :--- | :--- |
| **1** | **Social & Direct Contact Links** | Public page displays phone, email, and location, but lacks WhatsApp direct chat link, Instagram, Facebook, and LinkedIn. | Add `whatsapp_number`, `instagram_url`, `facebook_url`, `linkedin_url` to business profile and render verified action buttons on `/p/[slug]`. |
| **2** | **Product & Service Management** | Products are rendered on public page via default constants; `/business-pages` lacks product CRUD modals. | Add Product Management section to Owner Dashboard with Add/Edit/Delete modals wired to `public.products`. |
| **3** | **Product-Specific Enquiries** | Enquiry form captures general interest text. | Clicking "Enquire on this Package" on a product card pre-selects the product ID, auto-populates package details, and links enquiry directly to `products.id`. |
| **4** | **Unified Customer Interaction Timeline** | Lead Detail Drawer displays customer info, scoring, call plan, and call button, but lacks a chronological activity timeline. | Add an interactive timeline in the Lead Drawer displaying: (1) Form submitted, (2) Page dwell & calculator actions, (3) Owner notes, (4) VoiceNexus call sessions with audio player and transcript expander. |
| **5** | **Post-Call Lead Status Synchronization** | When a call completes and outcome is generated, `call_outcomes` is populated, but `leads.status` is not automatically updated. | Automatically transition `leads.status` (e.g. `NEW` → `CONTACTED` or `QUALIFIED`) and update `leads.last_activity_at` upon call outcome persistence. |
| **6** | **Live Database Seeding** | Hosted Supabase has `businesses` but `business_pages` and `products` rows are empty, causing fallback to hardcoded constants. | Seed canonical `business_pages` (slug: `aadhira-solar`) and `products` (3 packages) directly in hosted Supabase so all data is 100% database-driven. |

---

## 7. Proposed Implementation Phases

### Phase 1: Architecture & Integration Assessment (Completed — This Document)
- Complete system audit, data mapping, and gap analysis.
- Produce verification evidence and wait for user approval.

### Phase 2: Database Seeding & Schema Enrichment (Non-Destructive)
- Seed canonical `business_pages` row for `aadhira-solar` linked to Organization `c81e8a53-b2db-4162-b8bd-484b6f11a0fa` and Business `da529808-d579-40cc-85bf-03aba897820b`.
- Seed 3 active products in `public.products` (Residential, Commercial, Industrial).
- Add social links and WhatsApp fields to business profile configuration.

### Phase 3: Enhanced Public Business Profile (`/p/[slug]`)
- Render direct WhatsApp click-to-chat action (`https://wa.me/...`).
- Render social links (Instagram, Facebook, LinkedIn, Website).
- Enable product-specific enquiry triggers ("Book This Package" pre-fills requirement and product ID).
- Preserve exact customer enquiry message.

### Phase 4: Owner Dashboard Product & Enquiry Management
- Add Product/Service management tab in Owner Dashboard (Create, Edit, Toggle Active).
- Provide Enquiry Management view showing raw enquiry messages, dwell time, and attribution.

### Phase 5: Unified Lead Interaction Timeline & Bidirectional Sync
- In Lead Detail Drawer (`lead-detail-drawer.tsx`):
  - Add **Customer Activity Timeline** displaying all touchpoints chronologically:
    1. Enquiry submitted from public page (with exact message and product).
    2. Calculator interaction details.
    3. VoiceNexus AI call attempts (with start time, duration, status).
    4. Call transcript preview and disposition outcome.
    5. Team notes and manual status updates.
- In Post-Call Processing:
  - Synchronize call outcomes back to `leads`: update `status`, `last_activity_at`, and append outcome summary to lead activity.

### Phase 6: End-to-End Acceptance Demonstration
- Step 1: Submit new customer enquiry from public page `/p/aadhira-solar` for verified customer phone.
- Step 2: Verify enquiry appears in LeadNexus CRM (`/leads`) with complete context.
- Step 3: Open Lead Drawer in VoiceNexus, review score, and generate contextual call plan.
- Step 4: Dispatch authorized AI call via Twilio.
- Step 5: Answer call, converse with Asmita in Tamil/English.
- Step 6: Verify call recording, transcript, and outcome synchronize across both LeadNexus CRM and VoiceNexus Calls workspace.

---

## 8. Security and Migration Risks

1. **Multi-Tenant Data Isolation**:
   Every database query must strictly enforce `organization_id` filtering. No lead, product, or call record may be readable across different organizations. Supabase RLS policies already enforce this on hosted tables.
2. **Do-Not-Call (DNC) Compliance**:
   If a customer opts out during a phone call or requests DNC, the system must immediately flag `leads.do_not_call = true` and `leads.status = 'DO_NOT_CALL'`. Outbound call dispatch must reject calling any DNC-flagged number.
3. **Twilio Free Trial Parameter Boundary**:
   Outbound PSTN calls must strictly use `{ to, from, url }` with concise query identifiers. Under no circumstances should raw inline `twiml` or `<Stream>` media streams be passed to `calls.create` on trial tiers.
4. **Zero Key Exposure**:
   All Gnani API credentials, Twilio Auth Tokens, Groq/Gemini keys, and Supabase service role keys must remain server-side only. Client components must interact strictly through authenticated Next.js API route handlers.
5. **Safe Database Operations**:
   No tables will be dropped or re-created. All schema enrichments will use non-destructive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or standard inserts.

