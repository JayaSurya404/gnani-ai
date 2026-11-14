# VoiceNexus AI — System Architecture Specification

## 1. System Vision & Architectural Overview

VoiceNexus AI is an enterprise multi-tenant voice intelligence platform that bridges digital lead capture and natural telephone conversations in regional Indian languages. It combines Next.js 16 full-stack capabilities with dedicated real-time speech gateways, carrier-grade telephony, and verified Gnani AI models.

```mermaid
flowchart TD
    subgraph ClientTier["1. Client Tier"]
        WebClient["Web Browser / PWA\n(Desktop & Mobile)"]
        PublicForm["Public Business Page\n(/p/kaveri-solar-construction)"]
        PhoneUser["Carrier Telephony Phone\n(Customer Device)"]
    end

    subgraph AppTier["2. Next.js 16 Application Tier (Render / Vercel)"]
        AppRouter["Next.js App Router\n(SSR, Server Actions, Route Handlers)"]
        TelephonyRoutes["Telephony Webhooks\n(/api/telephony/outbound, turn, audio)"]
        TurnEngine["LLM Turn Orchestrator\n(Gemini Flash Lite / Groq Failover)"]
        PostCallWorker["Post-Call Intelligence Agent\n(13 Dimensions, 7-Factor Lead Scoring)"]
        AudioGateway["In-Memory Audio Gateway\n(Zero-Latency WAV Streaming)"]
    end

    subgraph VoiceGatewayTier["3. Persistent Voice Gateway Tier (Fastify / Port 8081)"]
        FastifyGateway["Fastify WebSocket Gateway\n(services/voice-gateway)"]
        AudioTranscoder["Audio Codec Transcoder\n(G.711 μ-law 8kHz <-> Linear PCM16 16kHz)"]
        BargeInDetector["Realtime Barge-In Controller"]
    end

    subgraph ProviderTier["4. External Provider Tier"]
        TwilioPSTN["Twilio Voice PSTN\n(Carrier Telephony & TwiML)"]
        GnaniTimbre["Gnani Timbre TTS\n(wss://api.vachana.ai/api/v1/tts)\n(timbre-v2.5 / timbre-v3.0)"]
        GnaniPrisma["Gnani Prisma STT\n(wss://api.vachana.ai/stt/v3/stream)\n(prisma-v3.0 / indic-auto)"]
        GeminiGroq["Google Gemini / Groq\n(Factual Business Grounding)"]
    end

    subgraph DataTier["5. Data & Storage Tier (Supabase)"]
        PostgresDB[("Supabase PostgreSQL\n(26 Tables, Strict RLS Policies)")]
        AuthService["Supabase Auth (SSR Cookies, RLS Context)"]
        StorageBucket["Supabase Storage (Recordings, Artifacts)"]
    end

    %% Client Interactions
    PublicForm -->|Inbound Lead Submission| AppRouter
    WebClient -->|Authenticated Workspace Session| AppRouter
    WebClient <-->|Microphone / Speaker Audio Worklet| FastifyGateway

    %% Telephony Flow
    AppRouter -->|Dispatch Outbound Call| TwilioPSTN
    TwilioPSTN <-->|Webhook Calls / TwiML Loop| TelephonyRoutes
    PhoneUser <-->|Carrier Voice PSTN| TwilioPSTN

    %% Gateway & Providers
    TelephonyRoutes --> TurnEngine
    TurnEngine --> GeminiGroq
    TurnEngine --> GnaniTimbre
    GnaniTimbre --> AudioGateway
    AudioGateway -->|Serve Synthesized Audio| TelephonyRoutes

    FastifyGateway <--> AudioTranscoder
    AudioTranscoder <--> GnaniPrisma
    AudioTranscoder <--> GnaniTimbre
    FastifyGateway <--> BargeInDetector

    %% Persistence
    AppRouter --> PostgresDB
    AppRouter --> AuthService
    PostCallWorker --> PostgresDB
    FastifyGateway --> PostgresDB
```

---

## 2. Runtime Separation of Concerns

### A. Next.js 16 Application Runtime
- **Role**: Primary application server hosting user interface, authentication, business catalog, lead management, and telephony webhook handlers.
- **Outbound Dispatcher (`/api/telephony/outbound`)**:
  - Validates organization context, lead ID, language, and selected voice persona.
  - Verifies Do-Not-Call (DNC) registry and destination phone allowlist.
  - Initiates carrier PSTN calls via Twilio REST API pointing to `/api/telephony/outbound-twiml`.
- **Telephony Turn Handler (`/api/telephony/turn`)**:
  - Receives recognized speech from Twilio `<Gather>`.
  - Dispatches contextual prompt to Google Gemini (`gemini-flash-lite-latest`) within a 2.2-second budget.
  - Requests low-latency audio synthesis from Gnani Timbre TTS (`timbre-v2.5` *Asmita* / regional voice).
  - Caches audio in-memory and returns sequential TwiML `<Play>` followed by `<Gather>`.
- **Post-Call Background Agent**:
  - Automatically triggered upon Twilio `completed` webhook event.
  - Evaluates call transcript across 13 analytical dimensions.
  - Computes explainable 7-factor lead score (0–100) and drafts owner-approved WhatsApp notifications.

### B. Persistent Fastify Voice Gateway (`services/voice-gateway`)
- **Role**: High-concurrency Node.js 24 Fastify daemon running on port 8081 for real-time bidirectional browser voice conversations.
- **Audio Codec Transcoding**: Converts browser 16-bit Float32 PCM (16 kHz) and Twilio G.711 μ-law (8 kHz) without quality degradation.
- **Streaming Speech-to-Text**: Maintains persistent WebSocket to Gnani Prisma STT (`wss://api.vachana.ai/stt/v3/stream`) supporting real-time partial transcripts and instant caller barge-in.
- **Streaming Speech Synthesis**: Streams syntheses from Gnani Timbre TTS (`wss://api.vachana.ai/api/v1/tts`) directly to the client audio sink.

---

## 3. The Carrier Telephony Conversational Turn Loop

VoiceNexus AI employs a sequential TwiML conversational loop to guarantee reliable multi-turn conversations on carrier networks:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Phone)
    participant Twilio as Twilio PSTN Gateway
    participant VN as VoiceNexus API (/api/telephony)
    participant Gemini as Gemini Flash Lite
    participant Gnani as Gnani Timbre TTS

    Customer->>Twilio: Answers Outbound Call
    Twilio->>VN: HTTP POST /outbound-twiml
    VN->>Gnani: Synthesize Opening Greeting (Asmita, ta-IN)
    Gnani-->>VN: 16kHz WAV Audio Buffer (1,100ms)
    VN-->>Twilio: TwiML: <Play audioUrl/> + <Gather timeout="8" speechTimeout="auto"/>
    Twilio->>Customer: Plays Greeting Audio
    Twilio->>Customer: Opens 8-Second Speech Capture Window

    Customer->>Twilio: Speaks Requirement ("என் வீட்டுக்கு சோலார் வேணும்")
    Twilio->>VN: HTTP POST /turn (SpeechResult)
    VN->>Gemini: Reason on Speech + Lead Context + Subsidies
    Gemini-->>VN: Response: "5kW சிஸ்டம் பொருத்தமா இருக்கும்..." (950ms)
    VN->>Gnani: Synthesize Response (timbre-v2.5 Asmita)
    Gnani-->>VN: Response WAV Audio (1,250ms)
    VN-->>Twilio: TwiML: <Play audioUrl/> + <Gather timeout="8"/>
    Twilio->>Customer: Plays Response Audio
    Note over Customer,Twilio: Multi-turn loop continues until customer disconnects

    Customer->>Twilio: Hangs Up
    Twilio->>VN: HTTP POST /status (CallDuration, CallSid, Completed)
    VN->>VN: Background Post-Call Analysis & 7-Factor Lead Scoring
```

---

## 4. Multi-Tenant Database & Security Model

VoiceNexus AI enforces strict organization-level tenant isolation across 26 Supabase PostgreSQL tables:

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
    ORGANIZATIONS ||--o{ BUSINESSES : owns
    ORGANIZATIONS ||--o{ LEADS : manages
    ORGANIZATIONS ||--o{ VOICE_AGENTS : configures
    ORGANIZATIONS ||--o{ CALL_SESSIONS : dispatches
    ORGANIZATIONS ||--o{ AUTOMATIONS : defines

    BUSINESSES ||--o{ BUSINESS_PAGES : publishes
    BUSINESSES ||--o{ PRODUCTS : catalogs

    LEADS ||--o{ LEAD_EVENTS : tracks
    LEADS ||--o{ CALL_SESSIONS : participates
    LEADS ||--o{ FOLLOW_UP_TASKS : schedules

    VOICE_AGENTS ||--o{ AGENT_VERSIONS : versions

    CALL_SESSIONS ||--o{ TRANSCRIPT_SEGMENTS : records
    CALL_SESSIONS ||--o{ CALL_OUTCOMES : evaluates
```

### Security & Row Level Security (RLS) Guarantees
- Every database row carries an `organization_id` foreign key.
- Supabase Row Level Security (RLS) policies restrict all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` queries to authenticated users holding active membership in that organization.
- Privileged operations (carrier call dispatch, webhook signature validation, credential autofill) execute exclusively in server-only route handlers using the Supabase Service Role key.
