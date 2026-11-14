# VoiceNexus AI — Phase 6 Implementation Plan
## Real-Time Multilingual Voice Gateway & Gnani AI Audio Orchestration

**Author:** VoiceNexus AI Architecture & Core Audio Team  
**Date:** 2026-11-10  
**Phase:** 6 (GNANI AI REAL-TIME VOICE GATEWAY & AUDIO ORCHESTRATION)  
**Status:** In Progress  

---

## 1. Architectural Objectives & Constraints

### 1.1 Objectives
1. **Persistent Fastify Voice Gateway (`services/voice-gateway`):**
   - Independent Node.js 24 runtime managing low-latency bidirectional WebSockets for browser microphone and speaker sessions.
   - Secure server-to-server gateway authentication protecting provider credentials (`GNANI_API_KEY_ID`, `VOICE_GATEWAY_SECRET`).
   - Server-side tenant and agent verification against Supabase.
2. **Gnani Prisma Real-Time STT Integration:**
   - Connect to official endpoint `wss://api.vachana.ai/stt/v3/stream` via WebSocket upgrade headers (`x-api-key-id`, `language_code`, `model`, `x-sample-rate`).
   - Stream raw linear PCM16 (16 kHz, 16-bit, mono) binary audio frames.
   - Handle Voice Activity Detection (VAD) events (`speech_start`, `transcript`, `speech_end`), with real-time partial and final transcripts.
   - Support Tamil (`ta-IN`), Indian English (`en-IN`), Hindi (`hi-IN`), and multilingual auto-detection (`indic-auto`).
3. **Gnani Timbre Real-Time TTS Integration:**
   - Connect to official endpoint `wss://api.vachana.ai/api/v1/tts` via WebSocket upgrade headers (`x-api-key-id`).
   - Transmit JSON synthesis requests supporting `timbre-v2.5` and `timbre-v3.0` models with appropriate voice and audio configs.
   - Stream incremental base64 audio chunks back to the client for immediate, low-latency playback.
4. **Voice Catalog Realignment:**
   - Update `src/lib/voice-profiles.ts` to reflect the official Gnani Timbre catalog:
     - **Timbre v2.5** Tamil: *Asmita*, *Trisha*, *Brinda*, *Vedika*, *Noopur*.
     - **Timbre v2.5** English: *Kaveri*, *Trupti*, *Devika*, *Pranav*, *Shlok*, *Girish*.
     - **Timbre v2.5** Hindi: *Nalini*, *Bhavna*, *Deepak*, *Roopesh*.
     - **Timbre v3.0** Multilingual: *Shivani*, *Lakshmi*, *Avinash*, *Devansh*, *Yashraj*.
   - Replace synthetic actor placeholders with official provider metadata and genuine consent classifications.
5. **Real LLM & Reasoning Loop:**
   - Pipe verified transcripts into the conversational reasoning engine.
   - Support Gemini / Groq / OpenAI LLM providers when API keys are configured in `.env.local`.
   - If unconfigured, clearly display that the reasoning model is unconfigured and engage the deterministic rules engine without fabricating responses.
   - Strictly enforce AI identity disclosure, Do-Not-Call (DNC) immediate opt-out, and supervisor escalation.
6. **Interruption & Barge-in Handling:**
   - When Prisma STT detects caller speech (`speech_start`) during AI playback:
     - Immediately abort active Timbre TTS generation.
     - Send a `barge_in` event to the browser client to stop local audio playback immediately.
     - Emit an interrupted transcript marker in the session log.
7. **Agent Playground Upgrade (`/playground`):**
   - Seamless microphone capture in browser via Web Audio API / `AudioWorklet` (16kHz PCM).
   - Real-time bidirectional streaming over WebSocket to Voice Gateway.
   - Live transcription stream, AI thinking indicator, low-latency chunk playback, and sub-second turn latency tracking.
   - Comprehensive mobile and desktop responsive layout.
8. **Call Session Persistence:**
   - Record call sessions and transcript segments into Supabase `call_sessions` and `transcript_segments`.

---

## 2. Audio Pipeline & Wire Protocol

```text
Browser Client (Microphone)
   |
   | [PCM16 16kHz audio chunks / binary WebSocket]
   v
Fastify Voice Gateway (services/voice-gateway)
   |
   | [Raw PCM16 1024-byte frames via WSS with x-api-key-id]
   v
Gnani Prisma STT (wss://api.vachana.ai/stt/v3/stream)
   |
   | [speech_start event] ------> [Barge-in Trigger -> Cancel active TTS & notify client]
   | [is_final transcript event]
   v
Turn Orchestration & Guardrails
   |
   | [Prompt Template + Resolved Lead Context + Conversation History]
   v
LLM Engine (Gemini / Groq if configured, else Rule-based Fallback with Warning)
   |
   | [Synthesized Text Response]
   v
Gnani Timbre TTS (wss://api.vachana.ai/api/v1/tts)
   |
   | [Streamed Audio Chunks { type: 'audio', data: { chunk_index, audio: base64 } }]
   v
Fastify Voice Gateway (services/voice-gateway)
   |
   | [audio_chunk events over WebSocket]
   v
Browser Client (Web Audio API / AudioContext playback)
```

---

## 3. Step-by-Step Implementation Roadmap

### Step 3.1: Provider Adapters & Gateway Utilities (`services/voice-gateway/src/`)
- `src/config.ts`: Safe environment configuration parser validating `GNANI_API_KEY_ID`, `VOICE_GATEWAY_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- `src/providers/gnani-prisma.ts`: Prisma STT WebSocket client with connection pooling, handshake verification, 1024-byte chunk streaming, VAD detection, and graceful disconnection.
- `src/providers/gnani-timbre.ts`: Timbre TTS WebSocket client with synthesis payload generation, base64 chunk collection, and streaming callbacks.
- `src/providers/llm-provider.ts`: Multi-provider LLM connector (Gemini, Groq) with transparent status reporting when keys are unconfigured.
- `src/gateway-session.ts`: State machine orchestrating a single browser call session (audio input, STT, LLM turn, TTS stream, barge-in, Supabase persistence).
- `src/index.ts`: Fastify HTTP + WebSocket server with CORS, health routes, diagnostic endpoint, and authenticated `/ws/browser` route.

### Step 3.2: Voice Catalog Realignment (`src/lib/voice-profiles.ts`)
- Update voice catalog with verified Timbre v2.5 and v3.0 voice names, languages, genders, and official provider classifications.
- Update agent template defaults to reference official Timbre voices (`Asmita`, `Kaveri`, `Nalini`, `Shivani`).

### Step 3.3: Next.js Client Audio Engine (`src/lib/audio/`)
- `browser-audio-recorder.ts`: Browser microphone capture utilizing `AudioContext` and `ScriptProcessor` / `AudioWorklet` to downsample to 16 kHz 16-bit mono PCM.
- `browser-audio-player.ts`: Web Audio API streaming audio queue playing Timbre WAV/PCM chunks incrementally with instant abort capability for barge-in.
- `voice-gateway-client.ts`: WebSocket client managing connection, reconnection, audio dispatch, and event handling (`transcript`, `barge_in`, `audio_chunk`, `latency`, `error`).

### Step 3.4: Playground UI Upgrade (`src/app/(workspace)/playground/page.tsx`)
- Add real-time Voice Gateway connection status banner.
- Add live microphone controls (Start Call, End Call, Mute, Interrupt).
- Display real-time dual-speaker transcript stream with interim and final badges.
- Display actual turn latency metrics (STT latency, LLM latency, TTS latency, total round-trip).
- Support one-click testing with pre-recorded or synthetic Tamil and English audio clips.

### Step 3.5: Testing & Acceptance
- Unit tests for audio buffer conversion, Timbre event parsing, Prisma config builder, and LLM fallback behavior.
- Live integration tests for Prisma STT, Timbre TTS, and full conversational round-trip.
- Quality gates: TypeScript check, ESLint, unit tests, and production build.

