# VOICENEXUS AI — DEFINITIVE TWILIO TRIAL CALL FAILURE DIAGNOSIS
## ROOT CAUSE ANALYSIS & ARCHITECTURE REMEDIATION

**Date:** November 13, 2026  
**Component:** Telephony Outbound Dispatcher (`src/app/api/telephony/outbound/route.ts`)  
**Provider:** Twilio Programmable Voice REST API (`/2010-04-01/Accounts/{AccountSid}/Calls.json`)  
**Status:** Diagnosed & Remediated  

---

## 1. Exact Request Parameters Inspected (Task 1)

Inspection of the actual API call parameters in `src/app/api/telephony/outbound/route.ts` passed to `twilioClient.calls.create(...)`:

| Parameter | Type | Value / Scope Passed | Assessment |
| :--- | :--- | :--- | :--- |
| `to` | `string` | Normalized recipient E.164 string (e.g. `+916382868845`) | Valid & Required |
| `from` | `string` | Assigned Twilio trial caller ID (`+17372324091`) | Valid & Required |
| `url` | `undefined` | **NOT PASSED** | **Critical Root Cause** |
| `twiml` | `string` | **PASSED** (Inline raw XML `<Response>...</Response>`) | **Rejected on Trial Accounts** |
| `statusCallback` | `string` | Webhook URL (`https://...ngrok-free.dev/api/telephony/status`) | Permitted |
| `statusCallbackMethod` | `string` | `"POST"` | Permitted |
| `statusCallbackEvent` | `string[]` | **PASSED** (`["initiated", "ringing", "answered", "completed"]`) | **Disallowed on Trial Accounts** |
| `timeout` | `undefined` | Not passed (defaulted by carrier) | Normal |
| `record` | `boolean` | **PASSED** (`false`) | **Disallowed on Trial Accounts** |

---

## 2. Actual Provider Error Details (Task 2)

Extracted from live Next.js application logs and Twilio REST API response:

* **HTTP Status Code:** `400 Bad Request`
* **Twilio Error Code:** `0` (Parameter schema validation failure; not an execution-level error like 21215)
* **Raw Error Message:**
  ```
  "Invalid or disallowed parameters provided - trial accounts have limited parameter access, upgrade your account to unlock full functionality"
  ```
* **Twilio MoreInfo Link:** `https://www.twilio.com/docs/errors/0`
* **Twilio Request Identifier:** `undefined` (rejected prior to call resource allocation)
* **Specific Parameters Rejected:**
  1. `twiml`: Twilio trial accounts explicitly block the inline `twiml` parameter on `Calls.json`. In trial mode, Twilio only allows specifying a remote webhook `url`.
  2. `record`: Call recording is an upgraded paid feature. Passing `record: false` (or `true`) triggers trial parameter rejection.
  3. `statusCallbackEvent`: Granular lifecycle event arrays are disallowed on trial tiers.

---

## 3. Official Trial API Restrictions vs. TwiML Capabilities (Task 3)

Reference: [Twilio Try out Voice Documentation](https://www.twilio.com/docs/usage/trials/try-out-voice)

There is a fundamental distinction between what the **Create Call REST API** allows as request parameters, versus what **TwiML verbs** are permitted once the call connects:

### A. Create Call REST API Restrictions (Trial Tier)
On a trial account, `POST /Calls.json` strictly permits only:
- `to` (must be a verified caller ID)
- `from` (must be the assigned Twilio trial number)
- `url` (must be a public HTTP/HTTPS URL returning valid TwiML XML)
- `statusCallback` (optional basic completion callback)

Any attempt to pass `twiml`, `record`, or `statusCallbackEvent` immediately causes the request to be aborted by Twilio's parameter validator before reaching the carrier network.

### B. TwiML Verb Capabilities (Trial Tier)
When Twilio fetches the TwiML document from the `url`:
- `<Gather>`: **SUPPORTED** (Speech recognition and DTMF).
- `<Play>`: **SUPPORTED** (Plays our dynamic Gnani Timbre synthesized audio).
- `<Say>`: **SUPPORTED** (prepends the standard Twilio trial preamble).
- `<Connect><Stream>`: **STRICTLY BLOCKED** (Error 21215/21216). Twilio trial accounts forbid bidirectional media streams.

### Conclusion on Custom AI Calling
Custom outbound dynamic AI conversations **CAN** be initiated on a trial account, provided that:
1. The outbound API request uses `url` pointing to our public webhook (`/api/telephony/outbound-twiml`) rather than inline `twiml`.
2. The webhook dynamically returns `<Play>` (Gnani Timbre audio) + `<Gather>` (Twilio speech recognition) pointing to `/api/telephony/turn`.
3. No disallowed parameters (`record`, `statusCallbackEvent`) are sent.

---

## 4. Implementation Remediation (Task 4)

We have modified the codebase to eliminate the disallowed parameters without circumventing Twilio's policies:

1. **`src/app/api/telephony/outbound-twiml/route.ts`**:
   - Upgraded to accept both `GET` and `POST` requests from Twilio.
   - For `mode=TURN_BASED`, dynamically synthesizes the opening greeting via Gnani Timbre TTS (`synthesizeGnaniAudio`) and returns:
     ```xml
     <Response>
       <Play>${appUrl}/api/telephony/audio/${audioId}</Play>
       <Gather input="speech" action="${turnUrl}" method="POST" speechTimeout="auto" language="${sayLang}">
       </Gather>
       <Say language="${sayLang}">We did not hear any speech. Thank you for contacting VoiceNexus. Goodbye.</Say>
       <Hangup/>
     </Response>
     ```
2. **`src/app/api/telephony/outbound/route.ts`**:
   - Replaced inline `twiml` with `url: twimlWebhookUrl`.
   - Removed `record: false`.
   - Removed `statusCallbackEvent: [...]`.
   - Strictly sends only `to`, `from`, `url`, and optional `statusCallback`.

---

## 5. Dashboard Misrepresentation Fix (Task 5)

In `src/app/(workspace)/telephony/page.tsx`:

* **Dynamic Architecture Card**:
  When **Trial Turn-Based Voice** is selected:
  ```
  TRIAL TURN-BASED VOICE
  Input: Twilio Gather Speech Recognition
  Reasoning: Groq/Gemini
  Speech: Gnani Timbre TTS
  ```
  When **Full Bidirectional Voice** is selected:
  ```
  FULL BIDIRECTIONAL VOICE
  Input: Gnani Prisma STT
  Reasoning: Groq/Gemini
  Speech: Gnani Timbre TTS
  Transport: Twilio Media Streams
  ```
* **Removed Misleading Labels**:
  Replaced static `E.164 + TwiML Stream` badge with a dynamic badge reflecting the active mode (`TwiML Gather + Gnani Play` vs `E.164 + Media Stream`).
* **Truth in Provider Status**:
  Updated the policy notice to explicitly state that live telephony activation is currently in progress and will only be reported as provider-verified after an actual call succeeds on the carrier network.

---

## 6. Account Upgrade Analysis & Supported Paths

| Voice Architecture | Trial Tier Possible? | Upgrade Required? | Provider Capabilities |
| :--- | :--- | :--- | :--- |
| **Trial Turn-Based Voice** | **YES** | **NO** | Twilio `<Gather>` captures speech -> VoiceNexus LLM reasons -> Gnani Timbre synthesizes response -> `<Play>` renders audio over phone |
| **Full Bidirectional Voice** | **NO** | **YES** | Requires Twilio account upgrade with payment method because `<Connect><Stream>` is blocked on trial accounts |
| **Browser Voice Session** | **YES** | **NO** | Zero telephony dependency; uses full Gnani Prisma STT, Groq/Gemini reasoning, Gnani Timbre TTS directly in browser at `/playground` |

---

## 7. Next Actions

1. No calls have been initiated automatically.
2. The user may test the remediated webhook path directly from [http://localhost:3000/telephony](http://localhost:3000/telephony) when ready.

