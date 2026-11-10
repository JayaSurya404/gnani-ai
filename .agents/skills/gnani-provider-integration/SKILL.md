---
name: gnani-provider-integration
description: Integrates Gnani AI Prisma speech recognition and Timbre speech synthesis into VoiceNexus through secure server-side adapters. Use when reading Gnani docs, testing API credentials, implementing STT/TTS REST or streaming, handling audio formats, or diagnosing provider errors.
---

# Gnani Provider Integration Skill

## Scope and eligibility
The internship challenge FAQ says the eligible platform is the direct API platform at `https://app.gnani.ai/voice`; Gnani Agent Builder and its Agent Builder APIs are outside the challenge scope. Evon v3.3 is not hosted on that API platform; its weights must be requested and self-hosted. Do not claim Evon is available through the Prisma/Timbre API key.

Official sources to consult at implementation time:
- `https://docs.gnani.ai/`
- `https://docs.gnani.ai/llms.txt`
- `https://www.gnani.ai/internship`
- `https://www.gnani.ai/resources/prisma-v3`

## Mandatory workflow
1. Read the current official docs and the exact API product enabled in the user's account.
2. Inspect the account's API key metadata and permitted model IDs in the dashboard. Never ask the user to paste the key into chat.
3. Confirm the authentication scheme, request body, accepted MIME types, sample rates, channel count, maximum request length, response encoding, rate limits and streaming protocol from the current docs.
4. Run one small synthetic-audio STT smoke test and one short TTS smoke test from a local server-side script.
5. Save redacted request metadata and provider status only; never log the key, raw customer audio or sensitive transcripts.
6. Implement an internal provider interface and adapter with timeouts, input validation, bounded payloads, retries only for transient errors, and safe error mapping.
7. Add mocked unit tests and at least one explicitly user-triggered live smoke test.

## Provider boundary
Use separate interfaces, for example:
- `SpeechToTextProvider.transcribe(...)`
- `TextToSpeechProvider.synthesize(...)`
- `StreamingSpeechToTextProvider.openSession(...)` only when documented and actually needed.

Normalize results to internal types. Do not leak vendor-specific response shapes into business logic.

## Security
- Credentials remain server-only. Never use `NEXT_PUBLIC_` for API secrets.
- Use secret environment variables or the host's secret manager.
- Never commit `.env` files or paste secrets into logs, screenshots, issue trackers or prompts.
- Use synthetic recordings for development and demos unless explicit consent and retention rules permit otherwise.

## Model selection and truthful claims
- Select the exact Prisma/Timbre model identifier available to the account; do not infer it from a marketing page.
- Marketing pages may describe newer model versions than the account API exposes. The tested API response and dashboard are authoritative for this project.
- Mark provider health as `VERIFIED` only after an actual successful provider request.
- Clearly label LLM provider separately. Gemini/Groq text reasoning is external to Gnani unless the account explicitly provides an eligible Gnani LLM endpoint.
- Do not use Agent Builder APIs for the internship submission.

## Audio correctness
- Inspect codec, sample rate, channels, frame duration and binary/base64 requirements at each boundary.
- Do not assume Twilio μ-law 8 kHz can be sent directly to a Gnani endpoint requiring PCM16 or another format.
- Resample and encode explicitly; test clipping, duration, channel count, packet order and playback.
- For streaming, bound buffers, handle backpressure, detect disconnects, close sessions and recover from provider timeouts.
