# VoiceNexus AI — Autonomous Indic Voice Intelligence Platform
### Transforming Web Enquiries into Verified Business Phone Conversations
**Gnani AI Great Indian AI Internship Challenge Submission**

**Live App**: [https://gnaniai404.onrender.com](https://gnaniai404.onrender.com) | [https://gnaniai404.vercel.app](https://gnaniai404.vercel.app) • **GitHub**: [https://github.com/JayaSurya404/gnani-ai](https://github.com/JayaSurya404/gnani-ai)

---

### 1. Problem Statement & Existing Challenges
Indian enterprises face a critical conversion bottleneck: over 70% of inbound web enquiries go cold within an hour because sales teams cannot place immediate follow-ups. Manual outreach suffers from regional language barriers, inconsistent qualification, and delayed CRM logging. Meanwhile, conventional robocalls fail because rigid pre-recorded audio and robotic English text-to-speech prompt immediate customer hang-ups.

### 2. Proposed Solution
**VoiceNexus AI** is a multi-tenant voice intelligence platform that bridges digital lead capture and natural telephone conversations in regional Indian languages. When a prospect submits an enquiry, VoiceNexus AI analyzes buyer intent, synthesizes a factually grounded call plan, and enables business owners to dispatch carrier-grade outbound calls powered by conversational Indic voice AI.

### 3. End-to-End Workflow
1. **Lead Ingestion & Scoring**: Inbound enquiries from public business pages or APIs are scored (0–100) based on intent and checked against Do-Not-Call (DNC) registries.
2. **Contextual Call Plan Synthesis**: Generative AI drafts a tailored opening greeting, objective, and discovery questions grounded in the prospect's requirements.
3. **Carrier Telephone Dispatch**: The business owner triggers an outbound call via Twilio Voice PSTN directly to the customer's phone.
4. **Conversational Turn Loop**: Twilio captures caller speech and streams it to the VoiceNexus turn engine. Google Gemini (`gemini-flash-lite-latest`) reasons within a 2.2s budget, strictly grounded in verified business facts (pricing, warranties, PM Surya Ghar subsidies).
5. **Indic Speech Synthesis**: Gnani AI Timbre synthesizes human-like voice responses in 750ms–1400ms, returning sequential TwiML audio that plays seamlessly to the caller.
6. **Post-Call Intelligence**: A background worker analyzes the completed call across 13 dimensions, assigns explainable qualification scores, logs transcripts, and drafts owner-approved WhatsApp notifications.

### 4. Verified Gnani AI Integration
VoiceNexus AI directly integrates official Gnani AI speech models:
- **Gnani Timbre TTS (`timbre-v2.5` & `timbre-v3.0`)**: Realtime speech synthesis via `wss://api.vachana.ai/api/v1/tts` and REST endpoint `https://api.vachana.ai/api/v1/tts/inference`. Features 14 verified Indic personas including *Asmita* (warm Tamil), *Deepak* (Hindi), *Chitra* (Telugu), *Vidya* (Kannada), and *Shivani* (multilingual Indic code-mixing).
- **Gnani Prisma STT (`prisma-v3.0` & `prisma-v2.5`)**: Speech recognition via `wss://api.vachana.ai/stt/v3/stream` and REST endpoint `https://api.vachana.ai/stt/v3` with automatic language identification (`indic-auto`) and real-time streaming transcripts.

### 5. Technical Architecture & Stack
- **Frontend**: Next.js 16 App Router, React 19, Tailwind CSS, installable PWA shell.
- **Backend & Gateway**: Next.js Route Handlers, Fastify WebSocket Gateway (Node.js 24).
- **Database & Security**: Supabase PostgreSQL (26 tables), strict Row Level Security (RLS) tenant isolation.
- **Telephony & Speech**: Twilio Voice PSTN, Gnani Timbre TTS, Gnani Prisma STT, in-memory audio gateway.
- **LLM Reasoning**: Google Gemini Flash Lite with Groq LPU failover.

### 6. Target Users & Real-World Impact
Designed for Indian SMEs, renewable energy installers, healthcare clinics, and service providers. VoiceNexus AI delivers high-touch, regional-language customer qualification without expensive call centers, converting passive website visits into revenue-generating customer relationships.
