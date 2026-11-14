import WebSocket from "ws";
import crypto from "node:crypto";
import type { SayAttributes } from "twilio/lib/twiml/VoiceResponse";
import { storeAudio, uploadAudioToCdn } from "./audio-cache";
import { resolveCanonicalVoice, normalizeLanguageCode } from "@/lib/voice-profiles";

export interface GnaniSynthesisOptions {
  text: string;
  voice?: string; // "Asmita", "Kaveri", "Shivani", "Ananya", "Chitra", etc.
  language?: string; // "ta-IN", "en-IN", "hi-IN", "te-IN", "kn-IN", "ml-IN", "indic-auto"
  model?: "timbre-v2.5" | "timbre-v3.0";
  speed?: number;
  timeoutMs?: number;
}

/**
 * Validates the structural integrity of a Linear PCM WAV buffer.
 * Ensures RIFF/WAVE header, 16-bit PCM format, supported sample rate,
 * valid channel count, and non-empty audio payload.
 */
export function validateWavBuffer(buf: Buffer): { isValid: boolean; error?: string } {
  if (!buf || buf.length < 44) {
    return { isValid: false, error: "Buffer smaller than 44-byte WAV header" };
  }
  const riff = buf.slice(0, 4).toString("ascii");
  if (riff !== "RIFF") {
    return { isValid: false, error: `Invalid RIFF chunk identifier: ${riff}` };
  }
  const wave = buf.slice(8, 12).toString("ascii");
  if (wave !== "WAVE") {
    return { isValid: false, error: `Invalid WAVE format identifier: ${wave}` };
  }
  const fmt = buf.slice(12, 16).toString("ascii");
  if (fmt !== "fmt ") {
    return { isValid: false, error: `Missing fmt subchunk: ${fmt}` };
  }
  const audioFormat = buf.readUInt16LE(20);
  if (audioFormat !== 1) {
    return { isValid: false, error: `Unsupported audio format ${audioFormat} (expected 1 for Linear PCM)` };
  }
  const numChannels = buf.readUInt16LE(22);
  if (numChannels < 1 || numChannels > 2) {
    return { isValid: false, error: `Unexpected channel count: ${numChannels}` };
  }
  const sampleRate = buf.readUInt32LE(24);
  if (sampleRate < 8000 || sampleRate > 48000) {
    return { isValid: false, error: `Unexpected sample rate: ${sampleRate} Hz` };
  }
  const bitsPerSample = buf.readUInt16LE(34);
  if (bitsPerSample !== 16) {
    return { isValid: false, error: `Unexpected bits per sample: ${bitsPerSample}` };
  }
  const dataSize = buf.length - 44;
  if (dataSize < 1000) {
    return { isValid: false, error: `Audio payload too small: ${dataSize} bytes` };
  }
  return { isValid: true };
}

/**
 * Maps language code to verified Twilio <Say> attributes (language + voice).
 * Guaranteed same-language fallback.
 * Verified against Twilio Google TTS engine catalog:
 * - ta-IN (Tamil): Google.ta-IN-Standard-C (Female)
 * - hi-IN (Hindi): Google.hi-IN-Standard-A (Female)
 * - en-IN (Indian English): Google.en-IN-Standard-A (Female)
 * - te-IN (Telugu): Google.te-IN-Standard-A (Female)
 * - kn-IN (Kannada): Google.kn-IN-Standard-A (Female)
 * - ml-IN (Malayalam): Google.ml-IN-Standard-A (Female)
 */
export function getTwilioSayAttributes(langCode: string): SayAttributes {
  if (!langCode) {
    return { language: "en-IN", voice: "Google.en-IN-Standard-A" };
  }
  const norm = normalizeLanguageCode(langCode);
  switch (norm) {
    case "ta-IN":
      return { language: "ta-IN", voice: "Google.ta-IN-Standard-C" };
    case "hi-IN":
      return { language: "hi-IN", voice: "Google.hi-IN-Standard-A" };
    case "te-IN":
      return { language: "te-IN", voice: "Google.te-IN-Standard-A" };
    case "kn-IN":
      return { language: "kn-IN", voice: "Google.kn-IN-Standard-A" };
    case "ml-IN":
      return { language: "ml-IN", voice: "Google.ml-IN-Standard-A" };
    case "indic-auto":
      return { language: "ta-IN", voice: "Google.ta-IN-Standard-C" };
    case "en-IN":
    default:
      return { language: "en-IN", voice: "Google.en-IN-Standard-A" };
  }
}

/**
 * Synthesizes speech using official Gnani AI Timbre WebSocket API,
 * stores the resulting WAV in memory/disk cache, and returns an ephemeral audio ID.
 *
 * Enforces strict integrity checks:
 * - Resolves voice and model using authoritative voice registry to prevent model/voice mismatch errors.
 * - Discards all partial chunks upon timeout or premature close (never stores incomplete audio).
 * - Verifies RIFF/WAVE header, PCM format, sample rate, channels, and payload size.
 * - Patches header data sizes for compliant playback.
 */
export async function synthesizeGnaniAudio(options: GnaniSynthesisOptions): Promise<string | null> {
  const apiKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
  if (!apiKey || !options.text || !options.text.trim()) {
    return null;
  }

  // Canonical resolution: guarantees valid providerVoiceId and correct model
  const resolved = resolveCanonicalVoice(options.voice, options.language);
  const selectedVoice = resolved.canonicalVoice;
  const selectedModel = options.model || resolved.model;
  const selectedLang = options.language || resolved.languageCode;

  const timbreWsUrl = process.env.GNANI_TIMBRE_WS_URL || "wss://api.vachana.ai/api/v1/tts";
  const timeoutMs = options.timeoutMs || 10000;
  const audioId = "aud_" + crypto.randomBytes(16).toString("hex");

  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let isCompleted = false;
    let isTimedOut = false;
    const audioChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      isTimedOut = true;
      try {
        ws?.terminate();
      } catch {
        // Safe ignore
      }
      // Critical Integrity Requirement: Discard all partial chunks upon timeout.
      // Never store or serve truncated audio.
      const discardedBytes = audioChunks.reduce((acc, c) => acc + c.length, 0);
      audioChunks.length = 0;
      console.warn(`[GnaniTTS] Synthesis timed out after ${timeoutMs}ms for voice ${selectedVoice} (${selectedModel}). Discarded ${discardedBytes} incomplete bytes.`);
      resolve(null);
    }, timeoutMs);

    try {
      ws = new WebSocket(timbreWsUrl, {
        headers: { "x-api-key-id": apiKey },
      });

      ws.on("open", () => {
        if (isTimedOut) return;

        const payload = {
          text: options.text.trim(),
          voice: selectedVoice,
          model: selectedModel,
          language: selectedLang,
          speed: options.speed ?? 1.0,
          audio_config: {
            sample_rate: 16000,
            num_channels: 1,
            sample_width: 2,
            encoding: "linear_pcm",
            container: "wav",
          },
        };
        ws?.send(JSON.stringify(payload));
      });

      ws.on("message", (data: WebSocket.RawData) => {
        if (isTimedOut || isCompleted) return;

        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.data && parsed.data.audio) {
            const buf = Buffer.from(parsed.data.audio, "base64");
            audioChunks.push(buf);
          }

          if (parsed.type === "complete") {
            isCompleted = true;
            clearTimeout(timer);
            try {
              ws?.close();
            } catch {
              // Safe ignore
            }

            if (audioChunks.length === 0) {
              console.warn(`[GnaniTTS] Received complete event with zero audio chunks for voice ${selectedVoice}.`);
              resolve(null);
              return;
            }

            const fullBuffer = Buffer.concat(audioChunks);
            audioChunks.length = 0; // Clear memory chunks

            // Validate full audio integrity
            const validation = validateWavBuffer(fullBuffer);
            if (!validation.isValid) {
              console.warn(`[GnaniTTS] WAV validation failed for ${selectedVoice}: ${validation.error}`);
              resolve(null);
              return;
            }

            // Patch RIFF/WAVE header chunk sizes to ensure strict player compliance
            try {
              fullBuffer.writeUInt32LE(fullBuffer.length - 8, 4); // RIFF chunk size
              fullBuffer.writeUInt32LE(fullBuffer.length - 44, 40); // data subchunk size
            } catch {
              // Safe ignore
            }

            storeAudio(audioId, fullBuffer, "audio/wav");

            // Background CDN persistence for permanent storage/dashboard access
            uploadAudioToCdn(audioId, fullBuffer).catch((err) => {
              console.warn(`[GnaniTTS] Background CDN sync note for ${audioId}:`, err);
            });

            // Immediately resolve with audioId for zero-latency local audio gateway delivery
            resolve(audioId);
          } else if (parsed.type === "error" || parsed.status === "error") {
            isCompleted = true;
            clearTimeout(timer);
            try {
              ws?.close();
            } catch {
              // Safe ignore
            }
            console.warn(`[GnaniTTS] Provider returned error for voice ${selectedVoice} (${selectedModel}):`, parsed.message || parsed);
            resolve(null);
          }
        } catch {
          // Ignore non-JSON frames
        }
      });

      ws.on("error", (err) => {
        if (isTimedOut || isCompleted) return;
        isCompleted = true;
        clearTimeout(timer);
        audioChunks.length = 0;
        console.warn(`[GnaniTTS] WebSocket synthesis error for ${selectedVoice}:`, err.message);
        resolve(null);
      });

      ws.on("close", () => {
        if (isTimedOut || isCompleted) return;
        isCompleted = true;
        clearTimeout(timer);
        audioChunks.length = 0;
        console.warn(`[GnaniTTS] WebSocket closed before synthesis completed for ${selectedVoice}.`);
        resolve(null);
      });
    } catch (err: unknown) {
      if (isTimedOut || isCompleted) return;
      isCompleted = true;
      clearTimeout(timer);
      audioChunks.length = 0;
      console.warn(`[GnaniTTS] Failed to initialize WebSocket for ${selectedVoice}:`, err);
      resolve(null);
    }
  });
}
