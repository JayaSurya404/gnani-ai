/**
 * VoiceNexus AI — Gnani Prisma v3.0 Multilingual Speech-to-Text Adapter
 * Connects directly to https://api.vachana.ai/stt/v3 using indic-auto language identification.
 */

export interface PrismaTranscriptionResult {
  success: boolean;
  transcript: string;
  detectedLanguageCode?: string; // e.g. "ta-IN", "hi-IN", "en-IN", "te-IN", "kn-IN", "ml-IN"
  model: string;
  processingTimeMs?: number;
  error?: string;
}

export interface PrismaTranscriptionOptions {
  languageCode?: string; // default "indic-auto" for automatic language identification
  outputFormat?: "codemix" | "transcribe" | "verbatim" | "transliterate";
  timeoutMs?: number;
}

/**
 * Transcribes audio using Gnani Prisma v3.0 REST endpoint.
 * Automatically identifies caller language when languageCode is set to "indic-auto".
 */
export async function transcribeWithGnaniPrisma(
  audioBuffer: Buffer,
  options?: PrismaTranscriptionOptions
): Promise<PrismaTranscriptionResult> {
  const apiKey = process.env.GNANI_API_KEY_ID || process.env.GNANI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      transcript: "",
      model: "prisma-v3.0",
      error: "GNANI_API_KEY_ID is missing from environment",
    };
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return {
      success: false,
      transcript: "",
      model: "prisma-v3.0",
      error: "Audio buffer is empty",
    };
  }

  const endpoint = process.env.GNANI_PRISMA_REST_URL || "https://api.vachana.ai/stt/v3";
  const timeoutMs = options?.timeoutMs || 10000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });
    formData.append("audio_file", blob, "audio.wav");
    formData.append("model", "prisma-v3.0");
    formData.append("language_code", options?.languageCode || "indic-auto");
    formData.append("output_format", options?.outputFormat || "codemix");

    const startTime = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-Key-ID": apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[GnaniPrismaSTT] Provider returned HTTP ${res.status}:`, errText);
      return {
        success: false,
        transcript: "",
        model: "prisma-v3.0",
        error: `Provider HTTP ${res.status}: ${errText.slice(0, 150)}`,
      };
    }

    const data = await res.json();
    const latency = Date.now() - startTime;

    const transcript = (data.transcript || "").trim();
    const detectedLang = data.detected_language_code || data.language_code || "ta-IN";

    return {
      success: true,
      transcript,
      detectedLanguageCode: detectedLang,
      model: data.model || "prisma-v3.0",
      processingTimeMs: Math.round((data.processing_time || 0) * 1000) || latency,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const e = err as Error;
    console.warn("[GnaniPrismaSTT] Transcription request failed:", e.message);
    return {
      success: false,
      transcript: "",
      model: "prisma-v3.0",
      error: e.name === "AbortError" ? "Request timed out" : e.message,
    };
  }
}
