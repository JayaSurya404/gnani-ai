---
name: realtime-voice-orchestration
description: Builds and tests browser and Twilio voice-agent sessions using streaming STT, LLM turn orchestration and TTS. Use for WebSocket media gateways, audio codecs, call state machines, turn-taking, barge-in, transcription, telephony and cleanup.
---

# Realtime Voice Orchestration Skill

## Preferred development order
1. Build a browser microphone/speaker demo with synthetic leads.
2. Validate provider STT and TTS independently.
3. Implement turn orchestration with a text LLM.
4. Add realtime streaming and interruption only after the single-turn path works.
5. Connect Twilio trial calling to one verified, consented destination.
6. Complete manual end-to-end acceptance before claiming PSTN support.

## Session responsibilities
- Authenticate and authorize call start requests.
- Enforce destination allowlists, DNC state, organization limits and idempotency.
- Snapshot the agent configuration and business context at call start.
- Open STT, LLM and TTS sessions through provider interfaces.
- Preserve sequence numbers and append transcript events.
- Handle speech start/end, partial/final transcripts, silence, interruption and barge-in.
- Buffer audio with strict bounds and backpressure.
- Close every socket, timer, provider session and telephony leg exactly once.
- Persist a terminal state and run post-call analysis only from persisted transcript evidence.

## Safety and conversation policy
- Disclose that the caller is an AI assistant at the beginning of a call.
- Respect opt-out and do-not-call requests immediately.
- Do not impersonate a human or invent prices, availability, appointments or completed actions.
- Confirm critical details such as dates, times, addresses and numbers.
- Escalate to a human when requested or when confidence is insufficient.
- Do not autonomously make financial commitments or other consequential decisions.

## Testing
- Unit-test codec conversion, chunk boundaries, partial transcript assembly, state transitions and idempotency.
- Test disconnect before media, provider failure, caller interruption, telephony failure, timeout and duplicate webhook delivery.
- Keep simulator and browser-test records visibly separate from real PSTN calls.
- Never let automated tests place paid PSTN calls.
- A successful provider health check does not prove end-to-end calling. Record manual acceptance evidence separately.
