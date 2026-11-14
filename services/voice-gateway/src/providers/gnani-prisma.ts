import WebSocket from "ws";
import { GATEWAY_CONFIG } from "../config.js";

export interface PrismaConfig {
  languageCode?: string; // "ta-IN" | "en-IN" | "hi-IN" | "indic-auto"
  model?: string; // "prisma-v3.0" | "prisma-v2.5"
  sampleRate?: number; // 16000
  enablePartials?: boolean;
}

export interface PrismaTranscriptEvent {
  text: string;
  isFinal: boolean;
  latencyMs?: number;
  segmentId?: string;
  utteranceId?: string;
  confidence?: number;
}

export interface PrismaClientCallbacks {
  onConnected?: (config: Record<string, unknown>) => void;
  onSpeechStart?: (utteranceId: string) => void;
  onTranscript?: (event: PrismaTranscriptEvent) => void;
  onError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
}

export class PrismaStreamingClient {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private isClosed = false;
  private config: PrismaConfig;
  private callbacks: PrismaClientCallbacks;
  private connectionTimer: NodeJS.Timeout | null = null;

  constructor(config: PrismaConfig = {}, callbacks: PrismaClientCallbacks = {}) {
    this.config = {
      languageCode: config.languageCode || "ta-IN",
      model: config.model || "prisma-v2.5",
      sampleRate: config.sampleRate || 16000,
      enablePartials: config.enablePartials ?? true,
    };
    this.callbacks = callbacks;
  }

  public async connect(): Promise<boolean> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    if (!GATEWAY_CONFIG.gnaniApiKey) {
      const err = new Error("Prisma STT connection failed: GNANI_API_KEY_ID is unconfigured.");
      this.callbacks.onError?.(err);
      return false;
    }

    this.isConnecting = true;
    this.isClosed = false;

    return new Promise((resolve) => {
      try {
        const headers: Record<string, string> = {
          "x-api-key-id": GATEWAY_CONFIG.gnaniApiKey,
          "language_code": this.config.languageCode || "ta-IN",
          "model": this.config.model || "prisma-v2.5",
          "x-sample-rate": String(this.config.sampleRate || 16000),
          "x-format": "verbatim",
        };

        if (this.config.enablePartials) {
          headers["x-partials-enabled"] = "true";
        }

        this.ws = new WebSocket(GATEWAY_CONFIG.prismaWsUrl, { headers });

        this.connectionTimer = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            this.ws?.terminate();
            this.callbacks.onError?.(new Error("Prisma STT connection timeout after 8000ms."));
            resolve(false);
          }
        }, 8000);

        this.ws.on("open", () => {
          this.isConnecting = false;
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          resolve(true);
        });

        this.ws.on("message", (data: WebSocket.RawData) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (err: Error) => {
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          this.callbacks.onError?.(err);
          resolve(false);
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          if (this.connectionTimer) clearTimeout(this.connectionTimer);
          this.callbacks.onClose?.(code, reason.toString());
        });
      } catch (error) {
        if (this.connectionTimer) clearTimeout(this.connectionTimer);
        this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        resolve(false);
      }
    });
  }

  private handleMessage(data: WebSocket.RawData) {
    try {
      const parsed = JSON.parse(data.toString());
      const msgType = parsed.type;

      if (msgType === "connected") {
        this.callbacks.onConnected?.(parsed.config || {});
      } else if (msgType === "speech_start") {
        this.callbacks.onSpeechStart?.(parsed.utterance_id || "");
      } else if (msgType === "transcript") {
        this.callbacks.onTranscript?.({
          text: (parsed.text || "").trim(),
          isFinal: Boolean(parsed.is_final),
          latencyMs: parsed.latency,
          segmentId: parsed.segment_id,
          utteranceId: parsed.utterance_id,
          confidence: parsed.confidence,
        });
      }
    } catch {
      // Ignore non-JSON control messages
    }
  }

  public sendAudioChunk(chunk: Buffer): boolean {
    if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.ws.send(chunk);
      return true;
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  public close() {
    this.isClosed = true;
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, "Normal Closure");
        }
      } catch {
        this.ws.terminate();
      }
      this.ws = null;
    }
  }

  public isOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }
}

