# VoiceNexus AI — Installation & Setup Guide

This guide provides step-by-step instructions for running VoiceNexus AI locally and deploying it to production.

---

## 1. Prerequisites

Before setting up the project, ensure you have the following installed and configured:

- **Node.js**: Version `>= 24.0.0` (required for native Node test runner and ES module features).
- **npm**: Version `>= 10.0.0`.
- **Git**: Installed and configured.
- **Supabase Account**: A hosted Supabase PostgreSQL database project.
- **Twilio Account**: Twilio Voice phone number with international voice dialing enabled.
- **Gnani AI Credentials**: Access to Gnani AI Vachana platform (`api.vachana.ai`) with a valid API key.
- **LLM API Key**: Google Gemini API key (`gemini-flash-lite-latest`) or Groq API key (`openai/gpt-oss-20b`).

---

## 2. Local Environment Setup

### Step 1: Clone Repository
```bash
git clone https://github.com/JayaSurya404/gnani-ai.git
cd gnani-ai
```

### Step 2: Install Dependencies
Install all root workspace dependencies and sub-workspace packages:
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in the required server-only variables in `.env.local`:

```env
# Application URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_VOICE_GATEWAY_URL=http://localhost:8081
NEXT_PUBLIC_VOICE_GATEWAY_WS_URL=ws://localhost:8081

# Supabase Public & Server Credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Voice Gateway Server Secret
VOICE_GATEWAY_SECRET=your-internal-gateway-secret

# Gnani AI Speech APIs
GNANI_API_KEY_ID=your-gnani-api-key-id
GNANI_API_KEY=your-gnani-api-key
GNANI_PRISMA_WS_URL=wss://api.vachana.ai/stt/v3/stream
GNANI_TIMBRE_WS_URL=wss://api.vachana.ai/api/v1/tts

# LLM Reasoning Providers
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-flash-lite-latest
GROQ_API_KEY=your-groq-api-key

# Twilio Telephony
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_VOICE_NUMBER=+1234567890
TWILIO_WEBHOOK_BASE_URL=https://your-tunnel-url.ngrok-free.dev

# Shared Project Demonstration Credentials
DEV_COMPANY_EMAIL=admin@kaverisolar.in
DEV_COMPANY_PASSWORD=YourStrongPasswordHere
OWNER_CREDENTIAL_FILL_ENABLED=true
```

> [!WARNING]
> Never commit `.env.local` to version control. Keep all credentials strictly server-side.

---

## 3. Database Migration

Apply the SQL migrations located in `supabase/migrations/` in chronological order using the Supabase CLI or SQL Editor:

1. `20261110000001_canonical_schema.sql` — Core multi-tenant tables, organizations, leads, products, calls.
2. `20261110000002_security_rls.sql` — Row Level Security (RLS) policies isolating tenant workspaces.
3. `20261110000003_seed_data.sql` — Initial schema fixtures.
4. `20261111000001_milestone_7_intelligence.sql` — Outbox, call outcomes, intelligence dimensions.
5. `20261113000001_milestone_8_telephony_whatsapp.sql` — WhatsApp approvals and telephony enhancements.
6. `20261114000001_sample_leads_and_social_platforms.sql` — Kaveri Solar & Construction verified business data.

---

## 4. Running the Application

### Development Mode (Next.js Application)
```bash
npm run dev
```
The application will be accessible at `http://localhost:3000`.

### Full Stack Development (Web + Persistent Voice Gateway)
To run both the Next.js frontend/backend and the persistent WebSocket voice gateway concurrently:
```bash
npm run dev:all
```
- Next.js Web: `http://localhost:3000`
- Fastify Voice Gateway: `ws://localhost:8081`

---

## 5. Telephony Tunneling (Twilio Webhooks)

When testing outbound and inbound calls locally, Twilio needs a public HTTPS URL to reach your webhook endpoints.

1. Start ngrok on port 3000:
   ```bash
   ngrok http 3000
   ```
2. Copy the forwarding URL (e.g., `https://your-subdomain.ngrok-free.dev`).
3. Set `TWILIO_WEBHOOK_BASE_URL=https://your-subdomain.ngrok-free.dev` in `.env.local`.
4. In the Twilio Console under your active phone number, set the Voice webhook to:
   `https://your-subdomain.ngrok-free.dev/api/telephony/inbound` (HTTP POST).

---

## 6. Verification & Quality Gates

Run the automated test suites and quality gates to verify system integrity:

```bash
# 1. TypeScript Strict Typecheck
npm run typecheck

# 2. ESLint Static Code Analysis
npm run lint

# 3. Automated Test Suite (190 integration and unit tests)
npm test

# 4. Next.js Production Build
npm run build
```

---

## 7. Production Deployment

### Render (Web Service)
- **Runtime**: Node.js 24
- **Build Command**: `npm install --include=dev && npm run build`
- **Start Command**: `npm run start`
- **Health Check Path**: `/api/health`
- **Environment Variables**: Configure the server-only variables outlined in `render.yaml` via the Render Dashboard.

### Vercel (Frontend & Edge Proxy)
- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- Configure `NEXT_PUBLIC_APP_URL` and backend rewrite settings.
