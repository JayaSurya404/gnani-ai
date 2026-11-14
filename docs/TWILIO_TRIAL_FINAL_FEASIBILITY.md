# VOICENEXUS AI — TWILIO TRIAL VOICE FINAL FEASIBILITY & ARCHITECTURE REPORT

**Date:** November 13, 2026  
**Document:** Final Feasibility & Acceptance Analysis  
**Application Runtime:** Next.js 16 (`http://localhost:3000`)  
**Media Voice Gateway:** Fastify Persistent Gateway (`ws://localhost:8081`)  
**Public Tunnel:** `https://ravishing-flyable-detergent.ngrok-free.dev`  
**Twilio Trial Caller ID:** `+17372324091`  
**Verified Recipient / Caller Mobile:** `+916382868845`  

---

## 1. Outbound vs. Inbound Trial Feasibility Matrix (Tasks 1 & 2)

| Testing Path | Trial Tier Feasibility | Architecture & Flow | Restrictions / Requirements |
| :--- | :--- | :--- | :--- |
| **INBOUND TRIAL AI CALL** | **100% FEASIBLE & SUPPORTED** | Verified phone (`+916382868845`) dials trial number (`+17372324091`) → Twilio triggers `POST /api/telephony/inbound` → VoiceNexus returns `<Play>` (Gnani Timbre) + `<Gather>` (Speech) → Caller speaks → Multi-turn LLM reasoning via `/api/telephony/turn` | Caller must be verified in Twilio Console. Webhook URL must be set in Twilio Console on phone number. |
| **OUTBOUND AI CALL (Webhook URL)** | **CONDITIONALLY SUPPORTED** | VoiceNexus calls `Calls.json` with `{ to, from, url }` → Phone rings → Twilio fetches dynamic TwiML from `/api/telephony/outbound-twiml` | Strict parameter limits: No inline `twiml`, no `record`, no lifecycle event arrays. Requires international geo-permissions enabled. |
| **FULL BIDIRECTIONAL MEDIA STREAMS** | **STRICTLY BLOCKED ON TRIAL** | Twilio `<Connect><Stream url="wss://...">` for direct low-latency full-duplex streaming with Gnani Prisma STT | Hard error `21215`/`21216` on Free Trial accounts. Requires account upgrade with payment method. |

---

## 2. In-Depth Analysis of Outbound URL Restrictions (Task 1)

Reference: [Twilio Try out Voice Documentation](https://www.twilio.com/docs/usage/trials/try-out-voice)

1. **Why the Previous Outbound Call Failed**:
   In our initial outbound implementation, `src/app/api/telephony/outbound/route.ts` passed:
   - `twiml: twiml` (inline raw XML string)
   - `record: false`
   - `statusCallbackEvent: ["initiated", "ringing", "answered", "completed"]`
   
   Twilio's `POST /Calls.json` endpoint on trial tiers strictly checks parameters before attempting call dispatch. Because trial accounts forbid inline TwiML strings, call recording parameters, and granular event subscriptions, Twilio rejected the request with HTTP 400 (`code: 0`):
   ```
   "Invalid or disallowed parameters provided - trial accounts have limited parameter access, upgrade your account to unlock full functionality"
   ```

2. **Trial Outbound with Custom Webhook `Url`**:
   - The trial REST API accepts `to`, `from`, `url`, and basic `statusCallback`.
   - In the Twilio Console under "Try out Voice", the "Custom" scenario allows developers to point calls to an external webhook URL (such as our ngrok tunnel).
   - We have refactored `src/app/api/telephony/outbound/route.ts` to strictly emit `{ to, from, url, statusCallback }` and moved dynamic TwiML generation to `src/app/api/telephony/outbound-twiml/route.ts`.

---

## 3. Inbound Custom TwiML: The Most Reliable Trial Path (Task 2)

While outbound PSTN calls from US trial numbers to Indian mobiles can face carrier and regulatory filtering, **Inbound Calling** on a trial number is fully permitted by Twilio when originating from a verified number:

```
[User dials +17372324091 from +916382868845]
                      │
                      ▼
[Twilio verifies caller ID is authorized]
                      │
                      ▼
[Twilio requests POST /api/telephony/inbound]
                      │
                      ▼
[VoiceNexus speaks Gnani Timbre Greeting] <── <Play url="/api/telephony/audio/{id}">
                      │
                      ▼
[User speaks Tamil or English]            ──> Twilio <Gather input="speech" language="...">
                      │
                      ▼
[Twilio posts text to /api/telephony/turn]
                      │
                      ▼
[Groq/Gemini evaluates business response]
                      │
                      ▼
[Gnani Timbre synthesizes response audio] <── <Play url="/api/telephony/audio/{id}">
                      │
                      ▼
[Loop continues until caller hangs up]    ──> Status callback enqueues Post-Call Intelligence!
```

### Twilio Console Inbound Configuration:
1. In the Twilio Console, navigate to **Phone Numbers → Manage → [Active Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)**.
2. Click on the assigned trial number (`+17372324091`).
3. Scroll to **Voice Configuration**, and under **A Call Comes In**:
   - Configure with: **Webhook**
   - URL: `https://ravishing-flyable-detergent.ngrok-free.dev/api/telephony/inbound`
   - HTTP Method: `POST`
4. Click **Save Configuration**.

---

## 4. Validation of Gather, Play, and Speech Models (Task 3)

### A. Speech Recognition Language Support
- **Tamil (`ta-IN`)**: Twilio `<Gather input="speech" language="ta-IN">` natively supports Tamil (India). Twilio maps `ta-IN` to Google Cloud Speech STT models.
- **English (`en-IN`)**: Twilio `<Gather input="speech" language="en-IN">` natively supports Indian English.
- **Dynamic Tanglish / Code-Switching**: When callers speak conversational Tanglish, Twilio returns the recognized words in Latin/Tamil script, and the VoiceNexus turn orchestrator (`processVoiceTurn`) successfully resolves intents.

### B. Gnani Timbre Audio & Public Playback
- Synthesis: Gnani Timbre WebSocket API (`wss://api.vachana.ai/api/v1/tts`) generates a 16kHz 16-bit mono PCM WAV buffer.
- In-Memory Cache: `src/lib/telephony/audio-cache.ts` caches audio buffers with a 5-minute TTL.
- Public Endpoint: `GET https://ravishing-flyable-detergent.ngrok-free.dev/api/telephony/audio/[id]` serves standard `Content-Type: audio/wav` with proper `Content-Length`. Twilio `<Play>` fetches and plays this audio over the telephone line.

### C. Multi-Turn Dialogue & Safety Guardrails
- **No Infinite Loops**: If a caller stays silent, Twilio `<Gather>` times out (`speechTimeout="auto"`), VoiceNexus plays a polite goodbye prompt, and executes `<Hangup/>`.
- **Hop Limitation**: Twilio enforces a maximum of 10 consecutive redirects. Because each conversational turn requires user speech input via `<Gather>`, it is treated as a user interaction rather than a redirect hop.
- **Trial Duration Limit**: Twilio terminates trial calls at 10 minutes.

---

## 5. Dashboard Implementation (Task 4)

In [src/app/(workspace)/telephony/page.tsx](file:///d:/gnani-ai/src/app/(workspace)/telephony/page.tsx), the interface now clearly distinguishes between inbound and outbound calling:

1. **INBOUND TRIAL AI CALL (Direct Mobile Test)**:
   - Shows the assigned trial number to dial: `+17372324091`.
   - Confirms verified caller ID: `+916382868845`.
   - Displays the active Inbound Webhook URL with a one-click **Copy** button.
   - Explains the complete trial-compatible Gather/Play voice flow.

2. **OUTBOUND AI CALL (REST API Dispatcher)**:
   - Explicitly labeled as requiring appropriate Twilio permissions and clean trial parameters.
   - Allows switching between **Trial Turn-Based Voice (`<Gather>` Speech)** and **Full Bidirectional Voice (`<Stream>` WSS)**.
   - Displays real-time architecture details (Input, Reasoning, Speech, Transport).

3. **WHATSAPP BUSINESS SANDBOX DISPATCH**:
   - Dispatches test messages to sandbox-joined devices and displays live Message SIDs and delivery statuses.

---

## 6. Remaining Paid-Account Capabilities

Upgrading the Twilio account with a payment method will unlock:
1. **Full Bidirectional Streaming (`<Connect><Stream>`)**: Direct low-latency WebSocket connection to `@voicenexus/voice-gateway` on `/ws/twilio`, enabling **Gnani Prisma STT** to process carrier audio directly with real-time barge-in.
2. **Calling Unverified Numbers**: Ability to call any customer without pre-registering them as a Verified Caller ID.
3. **Purchasing Local Indian Numbers (+91)**: Ability to purchase local Indian geographical numbers (subject to local telecom regulatory documentation).
4. **Trial Preamble Removal**: Elimination of Twilio's introductory message on voice calls.

---

## 7. Exact Manual Testing Instructions

### Test A: Inbound Trial Voice Call (Recommended Trial Path)
1. In Twilio Console under **Phone Numbers → Active Numbers → +17372324091**, set the Voice Webhook to:
   ```
   https://ravishing-flyable-detergent.ngrok-free.dev/api/telephony/inbound
   ```
   *(Method: POST)*.
2. Open your phone's dialer on **`+916382868845`** and dial **`+17372324091`**.
3. When the call connects:
   - Twilio will announce its trial notice.
   - VoiceNexus will answer and speak the Gnani Timbre greeting (*"Hello! This is the VoiceNexus AI assistant..."*).
   - Speak your question (e.g. *"What is the solar panel subsidy?"*).
   - Listen to the AI assistant's synthesized response.
4. Hang up and verify that `/telephony` and `/history` display the completed call record with transcript and intelligence scoring.

### Test B: Outbound Trial Voice Call (Remediated Webhook Path)
1. On [http://localhost:3000/telephony](http://localhost:3000/telephony), in the **OUTBOUND AI CALL** card:
   - Mode: **Trial Turn-Based Voice (`<Gather>` Speech)**.
   - Recipient: `+916382868845`.
   - Check **Bypass regulatory window**.
   - Click **CALL MY VERIFIED PHONE**.
2. VoiceNexus will dispatch the call via `Calls.json` with clean trial parameters (`to`, `from`, `url`).

### Test C: WhatsApp Sandbox Test
1. Send the join keyword from your WhatsApp on `+916382868845` to `+1 415 523 8886`.
2. In the **WhatsApp Sandbox Dispatch** card on `/telephony`, click **Dispatch WhatsApp Test Message**.
3. Verify receipt on your phone, and reply with `"STOP"` to test DNC opt-out handling.

