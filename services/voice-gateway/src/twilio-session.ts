import WebSocket from "ws";
import { PrismaStreamingClient } from "./providers/gnani-prisma.js";
import { TimbreStreamingClient } from "./providers/gnani-timbre.js";
import { generateAgentTurn, LLMMessage } from "./providers/llm-provider.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GATEWAY_CONFIG } from "./config.js";
import { normalizePhone, getPhoneVariants } from "./phone-utils.js";
import {
  decodeMuLaw8kToPcm16k,
  encodePcm16kToMuLaw8k,
  chunkMuLawFrames,
} from "./audio-codecs.js";

export interface TwilioStartMessage {
  event: "start";
  sequenceNumber: string;
  start: {
    accountSid: string;
    streamSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
    customParameters?: Record<string, string>;
  };
  streamSid: string;
}

export interface TwilioMediaMessage {
  event: "media";
  sequenceNumber: string;
  media: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64 mu-law
  };
  streamSid: string;
}

export interface TwilioStopMessage {
  event: "stop";
  sequenceNumber: string;
  stop: {
    accountSid: string;
    callSid: string;
  };
  streamSid: string;
}

export interface TwilioDtmfMessage {
  event: "dtmf";
  sequenceNumber: string;
  dtmf: {
    track: string;
    digit: string;
  };
  streamSid: string;
}

export class TwilioVoiceSession {
  private ws: WebSocket;
  private prismaClient: PrismaStreamingClient | null = null;
  private timbreClient: TimbreStreamingClient | null = null;
  public supabase: SupabaseClient | null = null;

  public streamSid: string = "";
  public callSid: string = "";
  public accountSid: string = "";

  public sessionId: string = "";
  public organizationId: string = "";
  public leadId: string = "";
  public agentId: string = "";
  public agentName: string = "VoiceNexus AI";
  public systemPrompt: string = "";
  public voice: string = "Asmita";
  public model: "timbre-v2.5" | "timbre-v3.0" = "timbre-v2.5";
  public language: string = "ta-IN";
  public direction: "INBOUND" | "OUTBOUND" = "OUTBOUND";
  public customerPhone: string = "";
  public customerContext: Record<string, string> = {};

  private conversationHistory: LLMMessage[] = [];
  private isProcessingTurn = false;
  private isSpeaking = false;
  private isDnc = false;
  private isEscalated = false;
  private turnCount = 0;
  private sessionStartTime: number;
  private isClosed = false;

  constructor(ws: WebSocket, customSupabase?: SupabaseClient) {
    this.ws = ws;
    this.sessionId = "sess_tw_" + Math.random().toString(36).slice(2, 10);
    this.sessionStartTime = Date.now();

    if (customSupabase) {
      this.supabase = customSupabase;
    } else if (GATEWAY_CONFIG.supabaseUrl && GATEWAY_CONFIG.supabaseServiceKey) {
      this.supabase = createClient(GATEWAY_CONFIG.supabaseUrl, GATEWAY_CONFIG.supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }

    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.ws.on("message", async (data: WebSocket.RawData) => {
      try {
        const rawStr = data.toString();
        const msg = JSON.parse(rawStr);

        switch (msg.event) {
          case "connected":
            console.log(`[TwilioVoiceSession] Twilio stream connection initiated.`);
            break;

          case "start":
            await this.handleStart(msg as TwilioStartMessage);
            break;

          case "media":
            this.handleMedia(msg as TwilioMediaMessage);
            break;

          case "dtmf":
            await this.handleDtmf(msg as TwilioDtmfMessage);
            break;

          case "stop":
            console.log(`[TwilioVoiceSession] Call stopped by Twilio (CallSid: ${this.callSid}).`);
            await this.close();
            break;

          default:
            break;
        }
      } catch (err) {
        console.error("[TwilioVoiceSession] Error parsing message:", err);
      }
    });

    this.ws.on("close", async () => {
      console.log(`[TwilioVoiceSession] Socket closed for CallSid: ${this.callSid}`);
      await this.cleanup();
    });

    this.ws.on("error", async (err) => {
      console.error(`[TwilioVoiceSession] Socket error for CallSid: ${this.callSid}:`, err);
      await this.cleanup();
    });
  }

  private async handleStart(msg: TwilioStartMessage) {
    this.streamSid = msg.start.streamSid || msg.streamSid;
    this.callSid = msg.start.callSid;
    this.accountSid = msg.start.accountSid;

    const params = msg.start.customParameters || {};
    if (params.sessionId) this.sessionId = params.sessionId;
    if (params.organizationId) this.organizationId = params.organizationId;
    if (params.leadId) this.leadId = params.leadId;
    if (params.agentId) this.agentId = params.agentId;
    if (params.agentName) this.agentName = params.agentName;
    if (params.systemPrompt) this.systemPrompt = params.systemPrompt;
    if (params.voice) this.voice = params.voice;
    if (params.model === "timbre-v3.0" || params.model === "timbre-v2.5") this.model = params.model;
    if (params.language) this.language = params.language;
    if (params.direction === "INBOUND" || params.direction === "OUTBOUND") this.direction = params.direction;
    if (params.customerPhone) this.customerPhone = params.customerPhone;

    // Load customer context from params
    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith("ctx_")) {
        this.customerContext[k.replace("ctx_", "")] = v;
      }
    }
    if (this.customerPhone) {
      this.customerContext.phone = this.customerPhone;
    }

    console.log(`[TwilioVoiceSession] Started: CallSid=${this.callSid}, StreamSid=${this.streamSid}, Org=${this.organizationId}, Phone=${this.customerPhone}`);

    // Check Do-Not-Call suppression for outbound calls
    const isSuppressed = await this.checkExistingDnc();
    if (isSuppressed && this.direction === "OUTBOUND") {
      console.warn(`[TwilioVoiceSession] Outbound call to ${this.customerPhone} suppressed by DNC.`);
      this.triggerBargeIn();
      await this.speak("This number is registered on our Do Not Call list. The call will now terminate.");
      await this.close();
      return;
    }

    // Initialize Prisma STT client (16kHz PCM input)
    this.prismaClient = new PrismaStreamingClient(
      {
        languageCode: this.language,
        model: this.language === "indic-auto" ? "prisma-v3.0" : "prisma-v2.5",
        sampleRate: 16000,
        enablePartials: true,
      },
      {
        onConnected: () => {
          console.log(`[TwilioVoiceSession] Gnani Prisma STT connected for ${this.callSid}`);
        },
        onSpeechStart: () => {
          // Instant caller barge-in!
          if (this.isSpeaking) {
            this.triggerBargeIn();
          }
        },
        onTranscript: async (event) => {
          if (event.isFinal && event.text && event.text.trim()) {
            await this.handleUserUtterance(event.text.trim(), event.latencyMs);
          }
        },
        onError: (err) => {
          console.error(`[TwilioVoiceSession] STT error:`, err);
        },
      }
    );

    await this.prismaClient.connect();
    this.timbreClient = new TimbreStreamingClient();

    // Persist call session start in Supabase
    await this.persistCallStart();

    // Initial greeting for outbound calls if configured
    if (this.direction === "OUTBOUND") {
      const greeting = this.language.startsWith("ta")
        ? "வணக்கம்! நான் VoiceNexus AI உதவியாளர். உங்களுக்கு எப்படி உதவ முடியும்?"
        : "Hello! This is VoiceNexus AI assistant. How may I assist you today?";
      await this.speak(greeting);
    }
  }

  private handleMedia(msg: TwilioMediaMessage) {
    if (!msg.media || !msg.media.payload) return;
    try {
      // Decode 8kHz 8-bit mu-law buffer from Twilio
      const mulawBuf = Buffer.from(msg.media.payload, "base64");
      // Transcode: upsample to 16kHz 16-bit linear PCM for Gnani Prisma STT
      const pcm16Buf = decodeMuLaw8kToPcm16k(mulawBuf);

      if (this.prismaClient && this.prismaClient.isOpen()) {
        this.prismaClient.sendAudioChunk(pcm16Buf);
      }
    } catch (err) {
      console.error("[TwilioVoiceSession] Transcoding error on media chunk:", err);
    }
  }

  private async handleDtmf(msg: TwilioDtmfMessage) {
    const digit = msg.dtmf?.digit;
    console.log(`[TwilioVoiceSession] DTMF digit received: ${digit}`);
    if (digit === "9") {
      // Opt-out standard key
      await this.handleUserUtterance("Please put me on the do not call list.");
    } else if (digit === "0") {
      // Escalation standard key
      await this.handleUserUtterance("I want to speak with a human agent.");
    }
  }

  public triggerBargeIn() {
    if (this.isSpeaking) {
      console.log(`[TwilioVoiceSession] Barge-in triggered. Clearing Twilio audio buffer.`);
      this.isSpeaking = false;
      this.timbreClient?.abort();

      // Clear Twilio audio buffer on caller device immediately!
      this.sendToTwilio({
        event: "clear",
        streamSid: this.streamSid,
      });
    }
  }

  private async handleUserUtterance(text: string, sttLatencyMs?: number) {
    if (this.isProcessingTurn || this.isDnc || this.isEscalated) return;
    this.isProcessingTurn = true;
    this.turnCount++;

    console.log(`[TwilioVoiceSession] Caller utterance (Turn ${this.turnCount}): "${text}" (STT: ${sttLatencyMs ?? 0}ms)`);

    // Append to conversation history
    this.conversationHistory.push({ role: "user", content: text });

    // Generate LLM turn using existing provider
    const turnResult = await generateAgentTurn({
      systemPrompt: this.systemPrompt || "You are a professional VoiceNexus business voice representative.",
      conversationHistory: this.conversationHistory,
      callerUtterance: text,
      customerContext: this.customerContext,
    });

    let spokenResponse = turnResult.text;

    // Handle DNC
    if (turnResult.isDnc) {
      this.isDnc = true;
      const dncRes = await this.persistDncOptOut();
      const isTamil = this.language.startsWith("ta");
      spokenResponse = dncRes.success
        ? (isTamil
            ? "புரிந்துகொண்டேன். உங்கள் எண் எங்கள் அழைப்பு தவிர்ப்பு பட்டியலில் சேர்க்கப்பட்டு எதிர்கால பிரச்சாரங்களிலிருந்து நீக்கப்பட்டுள்ளது. நன்றி, வணக்கம்."
            : "Understood. Your phone number has been placed on our Do Not Call list and removed from future campaigns. Thank you, goodbye.")
        : (isTamil
            ? "புரிந்துகொண்டேன். இந்த அழைப்பு நிறுத்தப்பட்டுள்ளது. எங்கள் குழு உங்கள் எண்ணை நீக்கும். நன்றி."
            : "Understood. We have registered your request and the call is ending. Thank you.");
    }

    // Handle human escalation
    if (turnResult.isEscalated && !this.isDnc) {
      this.isEscalated = true;
      await this.persistEscalation();
      const isTamil = this.language.startsWith("ta");
      spokenResponse = isTamil
        ? "நிச்சயமாக, உங்கள் அழைப்பை எங்கள் குழுவின் மனித மேற்பார்வையாளருக்கு மாற்றுகிறேன். ஒரு நிமிடம் காத்திருங்கள்."
        : "Certainly, I am connecting you with a human supervisor right now. Please hold the line.";
    }

    this.conversationHistory.push({ role: "assistant", content: spokenResponse });

    // Synthesize and stream to Twilio
    await this.speak(spokenResponse);

    this.isProcessingTurn = false;

    // If DNC, terminate call after speaking
    if (this.isDnc) {
      setTimeout(() => this.close(), 1000);
    }
  }

  /**
   * Synthesizes text via Gnani Timbre TTS, transcodes PCM16 16k -> mu-law 8k,
   * frames into 160-byte chunks and sends to Twilio.
   */
  public async speak(text: string): Promise<void> {
    if (!text || !text.trim() || this.isClosed) return;
    this.isSpeaking = true;

    try {
      await this.timbreClient?.synthesize(
        {
          text,
          voice: this.voice,
          model: this.model,
          language: this.language,
          container: "raw", // Raw PCM16 without WAV headers
          sampleRate: 16000,
        },
        {
          onAudioChunk: (chunk) => {
            if (!this.isSpeaking || this.isClosed) return;

            const pcmBuffer = Buffer.from(chunk.base64Audio, "base64");
            const mulawBuffer = encodePcm16kToMuLaw8k(pcmBuffer);
            const frames = chunkMuLawFrames(mulawBuffer, 160);

            for (const frame of frames) {
              if (!this.isSpeaking || this.isClosed) break;
              this.sendToTwilio({
                event: "media",
                streamSid: this.streamSid,
                media: {
                  payload: frame.toString("base64"),
                },
              });
            }
          },
          onComplete: () => {
            this.isSpeaking = false;
          },
          onError: (err) => {
            console.error("[TwilioVoiceSession] Timbre TTS streaming error:", err);
            this.isSpeaking = false;
          },
        }
      );
    } catch (err) {
      console.error("[TwilioVoiceSession] Error in speak:", err);
      this.isSpeaking = false;
    }
  }

  private sendToTwilio(msg: Record<string, any>) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async checkExistingDnc(): Promise<boolean> {
    if (!this.supabase || !this.customerPhone || !this.organizationId) return false;
    try {
      const normalized = normalizePhone(this.customerPhone);
      const variants = getPhoneVariants(normalized);

      const { data, error } = await this.supabase
        .from("leads")
        .select("id, status")
        .eq("organization_id", this.organizationId)
        .eq("status", "DO_NOT_CALL")
        .in("phone", variants)
        .limit(1);

      if (error) {
        console.warn("[TwilioVoiceSession] Error checking DNC leads:", error.message);
        return false;
      }
      return !!(data && data.length > 0);
    } catch (err) {
      console.warn("[TwilioVoiceSession] DNC check exception:", err);
      return false;
    }
  }

  private async persistDncOptOut(): Promise<{ success: boolean; leadId?: string }> {
    if (!this.supabase || !this.organizationId || !this.customerPhone) {
      return { success: false };
    }
    try {
      const normalized = normalizePhone(this.customerPhone);
      const variants = getPhoneVariants(normalized);

      // Check existing lead
      const { data: existing } = await this.supabase
        .from("leads")
        .select("id")
        .eq("organization_id", this.organizationId)
        .in("phone", variants)
        .limit(1);

      let targetLeadId: string | null = null;
      if (existing && existing.length > 0) {
        targetLeadId = existing[0].id;
        await this.supabase
          .from("leads")
          .update({
            status: "DO_NOT_CALL",
            notes: "Caller requested Do-Not-Call opt-out during Twilio call " + this.callSid,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetLeadId);
      } else {
        const { data: newLead } = await this.supabase
          .from("leads")
          .insert({
            organization_id: this.organizationId,
            phone: normalized,
            full_name: this.customerContext.customerName || "Inbound Telephony Caller",
            status: "DO_NOT_CALL",
            source: "TELEPHONY_OPT_OUT",
            notes: "Automatic DNC registration from Twilio call " + this.callSid,
          })
          .select("id")
          .single();
        targetLeadId = newLead?.id ?? null;
      }

      // Log telephony event
      await this.supabase.from("telephony_events").insert({
        organization_id: this.organizationId,
        call_session_id: this.sessionId,
        twilio_call_sid: this.callSid,
        event_type: "DNC_OPT_OUT",
        event_payload: { phone: normalized, leadId: targetLeadId },
      });

      return { success: true, leadId: targetLeadId ?? undefined };
    } catch (err) {
      console.error("[TwilioVoiceSession] Failed to persist DNC opt-out:", err);
      return { success: false };
    }
  }

  private async persistEscalation(): Promise<void> {
    if (!this.supabase || !this.organizationId) return;
    try {
      await this.supabase
        .from("call_sessions")
        .update({
          transfer_status: "REQUESTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.sessionId);

      await this.supabase.from("telephony_events").insert({
        organization_id: this.organizationId,
        call_session_id: this.sessionId,
        twilio_call_sid: this.callSid,
        event_type: "HUMAN_TRANSFER_REQUESTED",
        event_payload: { turnCount: this.turnCount },
      });
    } catch (err) {
      console.warn("[TwilioVoiceSession] Failed to persist escalation:", err);
    }
  }

  private async persistCallStart(): Promise<void> {
    if (!this.supabase || !this.organizationId) return;
    try {
      await this.supabase.from("call_sessions").upsert({
        id: this.sessionId,
        organization_id: this.organizationId,
        lead_id: this.leadId || null,
        agent_id: this.agentId || null,
        direction: this.direction,
        channel: "TELEPHONY",
        customer_phone: this.customerPhone || null,
        customer_name: this.customerContext.customerName || null,
        status: "IN_PROGRESS",
        start_time: new Date(this.sessionStartTime).toISOString(),
        twilio_call_sid: this.callSid || null,
        telephony_provider: "TWILIO",
        caller_number: this.direction === "INBOUND" ? this.customerPhone : null,
        callee_number: this.direction === "OUTBOUND" ? this.customerPhone : null,
      });

      await this.supabase.from("telephony_events").insert({
        organization_id: this.organizationId,
        call_session_id: this.sessionId,
        twilio_call_sid: this.callSid,
        event_type: "STREAM_STARTED",
        event_payload: { streamSid: this.streamSid, direction: this.direction },
      });
    } catch (err) {
      console.warn("[TwilioVoiceSession] Failed to persist call start:", err);
    }
  }

  private async persistCallEnd(): Promise<void> {
    if (!this.supabase || !this.organizationId) return;
    try {
      const durationSeconds = Math.max(1, Math.round((Date.now() - this.sessionStartTime) / 1000));

      await this.supabase
        .from("call_sessions")
        .update({
          status: "COMPLETED",
          end_time: new Date().toISOString(),
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.sessionId);

      // Persist conversation transcript lines as call_events
      for (let i = 0; i < this.conversationHistory.length; i++) {
        const item = this.conversationHistory[i];
        await this.supabase.from("call_events").insert({
          call_session_id: this.sessionId,
          event_type: item.role === "user" ? "USER_TRANSCRIPT" : "AGENT_RESPONSE",
          payload: { text: item.content, turn: i + 1 },
        });
      }

      // Enqueue in transactional outbox for post-call analysis
      await this.supabase.from("call_analysis_jobs").insert({
        organization_id: this.organizationId,
        call_session_id: this.sessionId,
        status: "QUEUED",
        priority: 10,
        fencing_token: 0,
      });

      console.log(`[TwilioVoiceSession] Call completed and analysis job queued: ${this.sessionId}`);
    } catch (err) {
      console.warn("[TwilioVoiceSession] Failed to persist call end:", err);
    }
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    this.triggerBargeIn();
    await this.persistCallEnd();
    await this.cleanup();

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private async cleanup() {
    if (this.prismaClient) {
      this.prismaClient.close();
      this.prismaClient = null;
    }
    if (this.timbreClient) {
      this.timbreClient.abort();
      this.timbreClient = null;
    }
  }
}
