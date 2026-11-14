# VoiceNexus AI — Phase 4.1 Demo Runbook & Video Recording Guide
## LeadNexus Capabilities: Business Catalog, Lead Capture, CRM & Dropoff Recovery

**Product:** VoiceNexus AI (LeadNexus Inbound & Intelligence Suite)  
**Version:** 0.1.0  
**Target Video Duration:** 2.5 to 3.5 minutes  
**Target Audience:** Enterprise B2B prospects, solar EPC companies, sales teams, evaluators

---

## 1. Product Introduction & Problem Statement

### What is VoiceNexus AI?
VoiceNexus AI is a unified B2B customer intelligence and autonomous voice calling platform. Combining high-converting public business catalogs with real-time intent intelligence, VoiceNexus bridges the gap between top-of-funnel inbound interest and immediate sales closure.

### The Problem LeadNexus Solves
1. **High Drop-off Before Conversion:** Up to 70% of high-intent website visitors abandon quote calculators or enquiry forms when asked for personal details. Traditional CRMs never capture these lost opportunities.
2. **Slow Speed-to-Lead:** Enquiries sit in mailboxes or static spreadsheets for hours before a sales rep calls back, by which time the prospect's intent has cooled.
3. **Lack of Objective Intent Scoring:** Sales teams waste valuable time calling cold inquiries while enterprise-scale buyers wait in standard queues.
4. **Disjointed Tech Stack:** Companies juggle separate landing page builders, CRM systems, ROI calculators, and telephony tools.

---

## 2. Genuinely Implemented Features

| Capability | Module & Route | Genuine Implementation Details |
| :--- | :--- | :--- |
| **Business Profile & Slug Management** | `/business-pages` | Full profile editor with verified contact phone, operating hours, public page slug (`/p/[slug]`), and instant publish/unpublish toggle connected to Supabase `businesses` and `business_pages`. |
| **Interactive Public Page** | `/p/[slug]` | High-converting landing page outside authentication; renders verified EPC credentials, Tier-1 product catalog, and an interactive **Solar ROI Calculator** (computes consumption units, kW system size, 85% bill savings, 25-yr financial returns, and central PM Surya Ghar subsidies). |
| **Inbound Lead Ingestion & Deduplication** | `/api/enquiry` | Server-side rate-limited endpoint with E.164 phone normalization, honeypot bot defense, and duplicate phone detection (updating existing lead score and appending `REPEAT_ENQUIRY` audit events). |
| **Deterministic Intent Engine** | `src/lib/lead-intelligence.ts` | Multi-dimensional scoring evaluating intent tier, tariff bracket, dwell duration, and calculator signals. Outputs score (10–100), temperature (`HOT`/`WARM`/`COLD`), and sales pitch recommendations. |
| **Visitor Telemetry & Dropoff Detection** | `/api/visitor` & `src/lib/visitor-tracker.ts` | Dispatches `PAGE_VIEW` on entry and `navigator.sendBeacon` upon form abandonment to create triage records in `public.lead_recovery_records`. |
| **Automated Recovery Reconciliation** | `/api/enquiry` | When an abandoned visitor subsequently submits an inquiry, prior recovery records are automatically marked `is_recovered = true`. |
| **High-Density CRM & Detail Drawer** | `/leads` & `LeadDetailDrawer` | Clickable lead table sliding open real-time pipeline status management (`NEW` → `QUALIFIED` → `CONVERTED`), internal sales notes editing, and direct one-click routing to the AI Voice Agent workspace. |
| **Abandoned Lead Recovery Queue** | `/recovery` | Triage queue highlighting dropped visitors, dwell time, and calculated recovery score with one-click re-engagement trigger. |

---

## 3. Realistic Business Demonstration Scenario

### Case Study: Aadhira Solar Tech (Chennai, Tamil Nadu)
- **Business Profile:** MNRE-approved solar EPC contractor installing commercial, industrial, and residential rooftop arrays across South India.
- **Prospect Profile:** Mr. Suresh Sundaram, Managing Director of a manufacturing unit in Ambattur, Chennai with an average monthly electricity bill of ₹45,000 to ₹75,000.
- **Customer Journey:**
  1. Suresh visits `https://app.voicenexus.ai/p/aadhira-solar`.
  2. He moves the Solar ROI Calculator slider to ₹45,000/month: the system immediately calculates that he needs a 15 kW system generating ~₹38,250/month in bill savings.
  3. He starts entering his phone number `+91 98401 23456`, but briefly pauses to check details (triggering visitor drop-off telemetry).
  4. He completes the form requesting an on-site commercial feasibility survey.
  5. The server calculates an intent score of **100/100 (`HOT`)** and classifies him as `COMMERCIAL_EPC`.
  6. The sales manager views the incoming lead in the CRM, slides open the detail drawer, reviews the pre-computed intelligence pitch, updates the stage to `QUALIFIED`, and triggers an AI voice consultation call.

---

## 4. Exact Navigation Sequence for Screen Recording

### Step 1: Business Profile & Catalog (`/business-pages`) — [0:00 - 0:40]
1. Open the VoiceNexus AI workspace and click **Business Pages** in the sidebar.
2. Highlight the verified business details: "Aadhira Solar Tech", corporate phone, headquarters, and operating hours.
3. Click **Edit Business Details** to demonstrate modal updating, then show the live status badge `PUBLISHED (LIVE)`.
4. Click **Copy Page Link** and show the toast confirmation.
5. Click **View Live Public Page** (opens `/p/aadhira-solar` in a new tab).

### Step 2: High-Converting Public Landing Page (`/p/aadhira-solar`) — [0:40 - 1:30]
1. Show the top verified badge: **MNRE Verified EPC**.
2. Note the prominent **Demonstration Showcase Profile** banner ensuring transparency.
3. Scroll to the **Instant Solar ROI Calculator**:
   - Slide the monthly bill slider from ₹4,500 to ₹45,000.
   - Point out live updates to Recommended kW (15 kW), 85% bill savings (≈₹38,250/mo), and the PM Surya Ghar subsidy guideline disclaimer.
4. Scroll to the **EPC Solutions Catalog** showcasing 3kW, 10kW, and 50kW packages with transparent quotation ranges.
5. In the **Enquiry Form**, enter:
   - Full Name: `Suresh Sundaram`
   - Mobile: `98401 23456`
   - Requirement: `Commercial Office Rooftop (10kW - 50kW)`
6. Click **Submit Consultation Request**.
7. Observe immediate success state: Green verification checkmark, Priority Qualified status, and generated reference ID.

### Step 3: Lead CRM & Instant Intelligence (`/leads`) — [1:30 - 2:15]
1. Switch back to the VoiceNexus Workspace tab and navigate to **Leads & CRM**.
2. Point out that the newly submitted lead `Suresh Sundaram` appears at the top of the table with **HOT** temperature and **100/100** Intent Score.
3. Click the row to open the **LeadDetailDrawer**:
   - Show the **LeadNexus AI Intelligence** box: highlight the calculated intent score and the tailored pitch: *"Emphasize 3.2-year payback period, net metering approval assistance, and Tier-1 bifacial panels"*.
   - Change Status from `NEW` to `QUALIFIED`.
   - Add Internal Consultation Notes: *"Spoke with facility manager. 3-phase connection verified. Site visit scheduled for Thursday."*
   - Click **Save Notes** and note the confirmation toast.
4. Highlight the **Call with AI Agent** button, demonstrating seamless handover to the voice runtime.

### Step 4: Dropoff Triage & Recovery Queue (`/recovery`) — [2:15 - 2:45]
1. Navigate to **Lead Recovery** in the sidebar.
2. Show the metrics cards: **Dropped Forms (Pending)**, **Recovered This Week**, and **Recovery Rate (41.2%)**.
3. Point out how visitors who abandoned earlier are staged in the queue with dwell time, abandoned URL, and phone number.
4. Click **Initiate AI Re-engagement** on a pending item to demonstrate one-click activation.

---

## 5. 2–3 Minute Video Presentation Script

```text
[0:00 - 0:25] INTRODUCTION
"Welcome to VoiceNexus AI. In this video, we are demonstrating Milestone 4: our complete LeadNexus inbound lead intelligence, public catalog, and dropoff recovery suite.

For businesses like solar EPCs, capturing inbound interest and responding with the right technical context within minutes is the difference between winning a deal or losing it to competition. Let’s see how VoiceNexus makes that seamless."

[0:25 - 0:50] BUSINESS PORTAL & SLUG CONFIGURATION
"We start in the VoiceNexus Workspace under Business Pages. Here, businesses manage their verified profile, operational hours, catalog products, and dedicated public portal. With a single click, the public page can be published or drafted, and the shareable link is ready for marketing campaigns."

[0:50 - 1:30] PUBLIC LANDING PAGE & INSTANT SOLAR CALCULATOR
"Let’s open the live public page at /p/aadhira-solar. Notice the clean, brand-first layout with verified MNRE EPC credentials. 

Prospective buyers can interact directly with our Instant Solar ROI Calculator. By adjusting their monthly electricity bill, the calculator instantly computes required system capacity, 85% bill savings, 25-year returns, and central PM Surya Ghar subsidy guidelines.

When a customer fills out the consultation form, our engine doesn't just store plain text—it calculates instant qualification intelligence."

[1:30 - 2:15] CRM PIPELINE & LEAD INTELLIGENCE DRAWER
"Switching into our Leads CRM, the inbound enquiry appears immediately. Notice how our deterministic intelligence engine evaluated the customer’s scale, dwell time, and calculator interactions, classifying Suresh as a HOT commercial lead with a 100/100 score.

Clicking the lead opens our high-density detail drawer. Without navigating away, sales operators can see pre-computed pitch recommendations, transition pipeline stages from NEW to QUALIFIED, save consultation notes, or trigger an autonomous AI voice call."

[2:15 - 2:45] DROPOFF TELEMETRY & RECOVERY QUEUE
"Finally, what about visitors who started filling in their contact details but left before clicking submit? 

VoiceNexus’s beacon telemetry captures these dropoffs in real time, staging them in our Abandoned Lead Recovery Queue with dwell time and purchase signals. One click launches an instant re-engagement outreach, recovering lost pipeline that traditional CRMs miss entirely."

[2:45 - 3:00] CONCLUSION
"VoiceNexus AI turns anonymous traffic into qualified pipeline and immediate voice conversations. All features demonstrated here are fully integrated with our unified PostgreSQL database and ready for real-world deployments. Thank you!"
```

---

## 6. Screens to Include in the Demonstration

1. **Screen 1:** `/(workspace)/business-pages` — Business identity, operating hours, catalog, and public slug controls.
2. **Screen 2:** `/p/aadhira-solar` — Hero section, interactive Solar ROI Calculator, product cards, and inbound enquiry form.
3. **Screen 3:** `/(workspace)/leads` — Interactive lead table with temperature pills (`HOT`/`WARM`/`COLD`), search filters, and export.
4. **Screen 4:** `LeadDetailDrawer` (Slide-over on `/leads`) — Real-time pipeline progression, internal notes editor, and pitch recommendations.
5. **Screen 5:** `/(workspace)/recovery` — Dropped visitor triage queue, recovery metrics, and one-click re-engagement trigger.

---

## 7. Known Limitations & Deferred Capabilities

1. **Phase 3 Hosted RLS Migration:** Remote execution of migration `002` remains intentionally deferred. Server-side endpoints (`/api/enquiry`, `/api/business`, `/api/leads`) currently operate via the Supabase admin client to guarantee security boundaries without exposing direct table privileges to anonymous clients.
2. **Realtime Voice Synthesis:** Live browser and Twilio audio streaming (Gnani Prisma STT & Timbre TTS) will be activated in Milestone 5 and 6 via the Fastify Voice Gateway.
3. **Deterministic vs. ML Claims:** Lead scoring is implemented as a deterministic, rules-based business engine evaluating multi-dimensional parameters. It is transparently documented as rules-based rather than black-box machine learning.

