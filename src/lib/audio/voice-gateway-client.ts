/**
 * VoiceNexus AI — Voice Gateway WebSocket Client
 * Connects browser to Fastify Voice Gateway managing bidirectional voice streaming.
 */

export type CallConnectionState = 
  | "DISCONNECTED" 
  | "CONNECTING" 
  | "CONNECTED" 
  | "CALL_ACTIVE" 
  | "ERROR";

export type AgentState = "idle" | "listening" | "thinking" | "speaking";

export interface GatewaySessionConfig {
  sessionId?: string;
  organizationId?: string;
  agentId?: string;
  agentName?: string;
  systemPrompt?: string;
  voice?: string;
  model?: "timbre-v2.5" | "timbre-v3.0";
  language?: string;
  customerContext?: Record<string, string>;
}

export interface TranscriptEvent {
  speaker: "user" | "agent";
  text: string;
  isFinal: boolean;
  turn?: number;
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  llmProvider?: string;
  llmModel?: string;
  isDnc?: boolean;
  isEscalated?: boolean;
  isCallbackRequested?: boolean;
  isUnconfigured?: boolean;
  unconfiguredNotice?: string;
}

export interface VoiceGatewayCallbacks {
  onStateChange?: (state: CallConnectionState) => void;
  onAgentState?: (state: AgentState) => void;
  onTranscript?: (event: TranscriptEvent) => void;
  onAudioChunk?: (base64Audio: string, chunkIndex: number) => void;
  onBargeIn?: () => void;
  onError?: (err: Error) => void;
}

export class VoiceGatewayClient {
  private ws: WebSocket | null = null;
  private gatewayUrl: string;
  private callbacks: VoiceGatewayCallbacks;
  private state: CallConnectionState = "DISCONNECTED";

  constructor(callbacks: VoiceGatewayCallbacks = {}, customGatewayUrl?: string) {
    this.callbacks = callbacks;
    this.gatewayUrl =
      customGatewayUrl ||
      process.env.NEXT_PUBLIC_VOICE_GATEWAY_WS_URL ||
      "ws://localhost:8080";
  }

  public async startCall(config: GatewaySessionConfig): Promise<boolean> {
    if (this.state === "CALL_ACTIVE" || this.state === "CONNECTING") {
      return true;
    }

    this.setState("CONNECTING");

    return new Promise((resolve) => {
      try {
        const wsUrl = `${this.gatewayUrl}/ws/browser`;
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          if (this.state === "CONNECTING") {
            this.setState("ERROR");
            this.callbacks.onError?.(new Error(`Voice Gateway connection timeout at ${wsUrl}`));
            this.endCall();
            resolve(false);
          }
        }, 8000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.setState("CONNECTED");

          // Send init handshake
          const initPayload = {
            type: "init",
            sessionId: config.sessionId || "sess_" + Math.random().toString(36).slice(2, 10),
            organizationId: config.organizationId,
            agentId: config.agentId,
            agentName: config.agentName,
            systemPrompt: config.systemPrompt,
            voice: config.voice || "Asmita",
            model: config.model || "timbre-v2.5",
            language: config.language || "ta-IN",
            customerContext: config.customerContext,
          };

          this.ws?.send(JSON.stringify(initPayload));
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "session_ready") {
              this.setState("CALL_ACTIVE");
              this.callbacks.onAgentState?.("listening");
              resolve(true);
            } else if (msg.type === "agent_state") {
              this.callbacks.onAgentState?.(msg.state as AgentState);
            } else if (msg.type === "interim_transcript") {
              this.callbacks.onTranscript?.({
                speaker: "user",
                text: msg.text,
                isFinal: false,
              });
            } else if (msg.type === "transcript") {
              this.callbacks.onTranscript?.({
                speaker: msg.speaker,
                text: msg.text,
                isFinal: true,
                turn: msg.turn,
                sttLatencyMs: msg.sttLatencyMs,
                llmLatencyMs: msg.llmLatencyMs,
                llmProvider: msg.llmProvider,
                llmModel: msg.llmModel,
                isDnc: msg.isDnc,
                isEscalated: msg.isEscalated,
                isCallbackRequested: msg.isCallbackRequested,
                isUnconfigured: msg.isUnconfigured,
                unconfiguredNotice: msg.unconfiguredNotice,
              });
            } else if (msg.type === "audio_chunk") {
              this.callbacks.onAudioChunk?.(msg.data, msg.chunkIndex);
            } else if (msg.type === "barge_in") {
              this.callbacks.onBargeIn?.();
            } else if (msg.type === "error") {
              this.callbacks.onError?.(new Error(msg.message || "Voice Gateway error"));
            }
          } catch {
            // Ignore non-JSON
          }
        };

        this.ws.onerror = () => {
          clearTimeout(connectionTimeout);
          this.setState("ERROR");
          this.callbacks.onError?.(new Error(`WebSocket error connecting to ${this.gatewayUrl}`));
          resolve(false);
        };

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout);
          this.setState("DISCONNECTED");
          this.callbacks.onAgentState?.("idle");
        };
      } catch (err) {
        this.setState("ERROR");
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        resolve(false);
      }
    });
  }

  public sendAudioBuffer(pcm16Buffer: ArrayBufferLike) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm16Buffer);
    }
  }

  public sendInterrupt() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }

  public endCall() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "end" }));
          this.ws.close(1000, "User Hung Up");
        }
      } catch {
        // Safe close
      }
      this.ws = null;
    }
    this.setState("DISCONNECTED");
    this.callbacks.onAgentState?.("idle");
  }

  public getState(): CallConnectionState {
    return this.state;
  }

  private setState(newState: CallConnectionState) {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }
}
