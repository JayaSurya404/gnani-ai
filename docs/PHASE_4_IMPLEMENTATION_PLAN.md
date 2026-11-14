# VoiceNexus AI — Phase 4 Implementation Plan & Architecture
## Lead Intelligence, Business Catalog & Multi-Channel Recovery (LeadNexus Capabilities)

**Document Version:** 1.0.0  
**Phase Status:** Complete  
**Quality Status:** Production Typecheck, ESLint, Unit Tests & Build Passed  

---

## 1. Executive Summary & Architectural Overview

Phase 4 bridges the core LeadNexus capabilities into the unified VoiceNexus greenfield SaaS platform. It establishes a multi-tenant business presence, an interactive public solar ROI calculator and landing page, high-security server-side lead ingestion, algorithmic lead qualification and scoring, real-time visitor telemetry, and an abandoned-form recovery loop.

All capabilities are built upon the existing 26-table canonical Supabase PostgreSQL schema established in Phase 3.

```mermaid
flowchart TD
    Visitor[Prospective Customer] -->|Visits /p/slug| PublicPage[Public Landing Page /p/slug]
    PublicPage -->|Telemetry Beacon| VisitorAPI[/api/visitor]
    VisitorAPI -->|Partial Details| RecoveryDB[(lead_recovery_records)]
    
    PublicPage -->|Submits Form| EnquiryAPI[/api/enquiry]
    EnquiryAPI --> ScoringEngine[Lead Intelligence Engine]
    ScoringEngine -->|Intent, Heat, Pitch| LeadsDB[(leads & lead_intelligence)]
    EnquiryAPI -->|Reconcile| RecoveryDB
    EnquiryAPI -->|Audit Trail| EventsDB[(lead_events)]
    
    Operator[Sales Rep / Workspace Member] -->|Manages Pipeline| CRM[/leads & LeadDetailDrawer]
    CRM -->|Reviews Intelligence| Calls[/calls AI Voice Gateway]
    CRM -->|Re-engages Dropoffs| RecoveryQueue[/recovery]
```

---

## 2. Implemented Modules Specification

### Module A: Business Profile Management & Product Catalog
- **Routes:** `/(workspace)/business-pages`, `/(workspace)/settings`
- **Capabilities:**
  - Interactive profile editor: corporate legal name, verified phone, operating hours, HQ city, and unique public slug (`/p/[slug]`).
  - Instant live toggle between `PUBLISHED (LIVE)` and `DRAFT`.
  - Shareable link generator with one-click clipboard copying.
  - Product catalog management for industrial, commercial, and residential solutions with pricing metrics, warranty specs, and capacity.

### Module B: Public Business Landing Pages (`/p/[slug]`)
- **Route:** `/p/[slug]` (outside auth route group)
- **Architecture:** Next.js dynamic server component with client-side interactive widgets.
- **Capabilities:**
  - Database-driven lookup via public slug with graceful fallback to demo fixtures (`aadhira-solar`, `solar-solutions`, etc.).
  - Verified business credentials badge (MNRE Verified EPC, state headquarters, verified contact number).
  - **Instant Solar ROI Calculator:**
    - Live slider for monthly electricity expenditure (₹1,000 to ₹100,000+).
    - Computes estimated monthly units consumed, recommended system size in kW, projected 85% bill savings, 25-year return, and Central Government PM Surya Ghar Muft Bijli Yojana subsidy.
  - Interactive product cards displaying specifications, warranty terms, and pricing.
  - High-converting, mobile-responsive inbound enquiry form with instant feedback.

### Module C: Lead Capture & Ingestion Engine
- **Endpoint:** `POST /api/enquiry`
- **Security & Integrity:**
  - Strict input sanitization and phone normalization (`+91` format).
  - In-memory rate limiting (max 5 requests per minute per IP) to prevent spamming.
  - **Lead Deduplication Logic:**
    - Queries existing leads by `phone` within the organization.
    - If existing: updates `last_activity_at`, updates requirement, logs a `REPEAT_ENQUIRY` event, recalculates intelligence score.
    - If new: inserts lead into `leads` table and records initial `FORM_SUBMIT` event.
  - **Recovery Reconciliation:**
    - Detects whether this phone/email previously triggered an `ABANDONED_FORM` recovery record.
    - Marks matching records in `lead_recovery_records` as `is_recovered = true` with `recovered_at = NOW()`.

### Module D: Lead Management CRM & Drawer
- **Route:** `/(workspace)/leads`
- **Components:** `src/components/leads/lead-detail-drawer.tsx`
- **Capabilities:**
  - Clickable table rows sliding open a high-density detail drawer without leaving the view.
  - Real-time pipeline stage transitions (`NEW` -> `CONTACTED` -> `QUALIFIED` -> `CONVERTED` -> `LOST` -> `DO_NOT_CALL`).
  - Internal consultation notes editor with immediate persistence.
  - AI Intelligence panel highlighting intent score, buyer temperature, and AI-generated pitch recommendation.
  - Direct deep-link to trigger an AI Voice Agent call (`/calls?leadId=...`).

### Module E: Visitor Telemetry & Abandonment Tracking
- **Telemetry Client:** `src/lib/visitor-tracker.ts`
- **Ingestion Endpoint:** `POST /api/visitor`
- **Tracking Capabilities:**
  - Anonymous session generation (`v_session_...`) stored in browser `sessionStorage`.
  - Dispatches `PAGE_VIEW` on entry.
  - Leverages browser `navigator.sendBeacon` and `beforeunload` listeners to detect users who entered contact details but abandoned before submission.
  - Automatically calculates dwell time in seconds and creates an actionable recovery record in `lead_recovery_records`.

### Module F: Lead Intelligence & Scoring Engine
- **Library:** `src/lib/lead-intelligence.ts`
- **Scoring Dimensions:**
  - **Base Intent Points (0 - 40):** Requirement tier (Industrial Captive vs. Residential Rooftop vs. General Enquiry).
  - **Budget / Energy Scale Points (0 - 35):** Monthly bill bracket (>₹50,000 grants +35 points).
  - **Engagement Points (0 - 25):** Dwell time (>45s) and active interaction with the Solar ROI calculator (+10 points).
- **Outputs:**
  - `score`: Clamped integer (10 to 100).
  - `temperature`: `HOT` (≥75), `WARM` (≥45), `COLD` (<45).
  - `intentClassification`: `INDUSTRIAL_CAPTIVE`, `COMMERCIAL_EPC`, `RESIDENTIAL_ROOFTOP`, or `EXPLORATORY`.
  - `salesPitchGuidance`: Algorithmic script guidance for voice agent turns or human account executives.

### Module G: Lead Recovery Queue
- **Route:** `/(workspace)/recovery`
- **Capabilities:**
  - Filterable queue of abandoned visitors and lost opportunities.
  - Displays dwell duration, abandoned URL, capture timestamp, and computed recovery score.
  - One-click trigger to generate instant re-engagement SMS/call campaigns.

---

## 3. Data Integrity & Verification Summary

| Gate | Target | Result |
| :--- | :--- | :--- |
| **TypeScript Typecheck** | `tsc --noEmit` | **0 errors (Pass)** |
| **ESLint Audit** | `eslint . --max-warnings=0` | **0 warnings / 0 errors (Pass)** |
| **Unit Test Suites** | 3 suites, 10 unit tests | **10 passed, 0 failed (Pass)** |
| **Next.js Production Build** | Next.js 16 Turbopack (23 routes) | **Generated successfully (Pass)** |

