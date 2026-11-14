import WebSocket from "ws";
import { GATEWAY_CONFIG } from "../config.js";

export interface TimbreSynthesisOptions {
  text: string;
  voice: string; // "Asmita", "Trisha", "Kaveri", "Shivani", etc.
  model?: "timbre-v2.5" | "timbre-v3.0";
  language?: string; // "ta-IN", "en-IN", "hi-IN", "indic-auto"
  speed?: number; // 0.8 - 1.2
  container?: "wav" | "raw";
  sampleRate?: number;
}

export interface TimbreAudioChunk {
  chunkIndex: number;
  base64Audio: string;
  isFinal: boolean;
}

export interface TimbreSynthesisCallbacks {
  onStart?: (requestId: string) => void;
  onAudioChunk?: (chunk: TimbreAudioChunk) => void;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export class TimbreStreamingClient {
  private ws: WebSocket | null = null;
  private isAborted = false;

  public async synthesize(
    options: TimbreSynthesisOptions,
    callbacks: TimbreSynthesisCallbacks = {}
  ): Promise<void> {
    if (!GATEWAY_CONFIG.gnaniApiKey) {
      const err = new Error("Timbre TTS synthesis failed: GNANI_API_KEY_ID is unconfigured.");
      callbacks.onError?.(err);
      return;
    }

    if (!options.text || !options.text.trim()) {
      callbacks.onComplete?.();
      return;
    }

    this.isAborted = false;

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(GATEWAY_CONFIG.timbreWsUrl, {
          headers: {
            "x-api-key-id": GATEWAY_CONFIG.gnaniApiKey,
          },
        });

        const timer = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.abort();
            callbacks.onError?.(new Error("Timbre TTS synthesis timed out after 12000ms."));
            resolve();
          }
        }, 12000);

        this.ws.on("open", () => {
          if (this.isAborted) {
            this.ws?.terminate();
            resolve();
            return;
          }

          const payload = {
            text: options.text.trim(),
            voice: options.voice || "Asmita",
            model: options.model || "timbre-v2.5",
            language: options.language || "ta-IN",
            speed: options.speed ?? 1.0,
            audio_config: {
              sample_rate: options.sampleRate || 16000,
              num_channels: 1,
              sample_width: 2,
              encoding: "linear_pcm",
              container: options.container || "wav",
            },
          };

          this.ws?.send(JSON.stringify(payload));
        });

        this.ws.on("message", (data: WebSocket.RawData) => {
          if (this.isAborted) return;

          try {
            const parsed = JSON.parse(data.toString());
            const msgType = parsed.type;

            if (msgType === "start") {
              callbacks.onStart?.(parsed.request_id || "");
            } else if (msgType === "audio" && parsed.data) {
              const audioBase64 = parsed.data.audio || "";
              const chunkIdx = parsed.data.chunk_index || 0;
              if (audioBase64) {
                callbacks.onAudioChunk?.({
                  chunkIndex: chunkIdx,
                  base64Audio: audioBase64,
                  isFinal: false,
                });
              }
            } else if (msgType === "complete") {
              if (parsed.data && parsed.data.audio) {
                callbacks.onAudioChunk?.({
                  chunkIndex: parsed.data.chunk_index || 0,
                  base64Audio: parsed.data.audio,
                  isFinal: true,
                });
              }
              if (!parsed.data || parsed.data.is_final) {
                clearTimeout(timer);
                callbacks.onComplete?.();
                this.closeSocket();
                resolve();
              }
            }
          } catch {
            // Non-JSON frames
          }
        });

        this.ws.on("error", (err: Error) => {
          clearTimeout(timer);
          if (!this.isAborted) {
            callbacks.onError?.(err);
          }
          this.closeSocket();
          resolve();
        });

        this.ws.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
      } catch (err) {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        resolve();
      }
    });
  }

  public abort() {
    this.isAborted = true;
    this.closeSocket();
  }

  private closeSocket() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.terminate();
        }
      } catch {
        // Socket cleanup safe ignore
      }
      this.ws = null;
    }
  }
}

