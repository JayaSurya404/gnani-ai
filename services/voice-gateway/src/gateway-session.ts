import WebSocket from "ws";
import { PrismaStreamingClient } from "./providers/gnani-prisma.js";
import { TimbreStreamingClient } from "./providers/gnani-timbre.js";
import { generateAgentTurn, LLMMessage } from "./providers/llm-provider.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GATEWAY_CONFIG } from "./config.js";
import { normalizePhone, getPhoneVariants } from "./phone-utils.js";

export interface SessionInitMessage {
  type: "init";
  sessionId?: string;
  organizationId?: string;
  leadId?: string;
  agentId?: string;
  agentName?: string;
  systemPrompt?: string;
  voice?: string; // e.g. "Asmita", "Kaveri", "Shivani"
  model?: "timbre-v2.5" | "timbre-v3.0";
  language?: string; // "ta-IN", "en-IN", "hi-IN", "indic-auto"
  direction?: "INBOUND" | "OUTBOUND";
  customerContext?: {
    leadId?: string;
    customerName?: string;
    phone?: string;
    monthlyBill?: string;
    customerInterest?: string;
  };
}

export class BrowserVoiceSession {
  private clientWs: WebSocket;
  private prismaClient: PrismaStreamingClient | null = null;
  private timbreClient: TimbreStreamingClient | null = null;
  public supabase: SupabaseClient | null = null;

  public sessionId: string;
  public organizationId: string = "";
  public leadId: string = "";
  public agentId: string = "";
  public agentName: string = "VoiceNexus AI";
  public systemPrompt: string = "";
  public voice: string = "Asmita";
  public model: "timbre-v2.5" | "timbre-v3.0" = "timbre-v2.5";
  public language: string = "ta-IN";
  public direction: "INBOUND" | "OUTBOUND" = "INBOUND";
  public customerContext: Record<string, string> = {};

  private conversationHistory: LLMMessage[] = [];
  private isProcessingTurn = false;
  private isSpeaking = false;
  private isDnc = false;
  private isEscalated = false;
  private turnCount = 0;
  private sessionStartTime: number;

  constructor(ws: WebSocket, customSupabase?: SupabaseClient) {
    this.clientWs = ws;
    this.sessionId = "sess_" + Math.random().toString(36).slice(2, 10);
    this.sessionStartTime = Date.now();

    if (customSupabase) {
      this.supabase = customSupabase;
    } else if (GATEWAY_CONFIG.supabaseUrl && GATEWAY_CONFIG.supabaseServiceKey) {
      this.supabase = createClient(GATEWAY_CONFIG.supabaseUrl, GATEWAY_CONFIG.supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }

    this.setupClientListeners();
  }

  private setupClientListeners() {
    this.clientWs.on("message", async (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        // Raw PCM16 16kHz binary frame from browser mic
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.handleAudioChunk(buf);
        return;
      }

      // JSON control message
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "init") {
          await this.handleInit(msg);
        } else if (msg.type === "audio" && msg.data) {
          const buf = Buffer.from(msg.data, "base64");
          this.handleAudioChunk(buf);
        } else if (msg.type === "interrupt" || msg.type === "barge_in") {
          this.triggerBargeIn();
        } else if (msg.type === "utterance" && typeof msg.text === "string") {
          await this.handleUserUtterance(msg.text);
        } else if (msg.type === "end") {
          this.close();
        }
      } catch (err) {
        this.sendError("Invalid JSON message", err);
      }
    });

    this.clientWs.on("close", () => {
      this.cleanup();
    });

    this.clientWs.on("error", () => {
      this.cleanup();
    });
  }

  private async handleInit(msg: SessionInitMessage) {
    if (msg.sessionId) this.sessionId = msg.sessionId;
    if (msg.organizationId) this.organizationId = msg.organizationId;
    if (msg.leadId) this.leadId = msg.leadId;
    if (msg.agentId) this.agentId = msg.agentId;
    if (msg.agentName) this.agentName = msg.agentName;
    if (msg.systemPrompt) this.systemPrompt = msg.systemPrompt;
    if (msg.voice) this.voice = msg.voice;
    if (msg.model) this.model = msg.model;
    if (msg.language) this.language = msg.language;
    if (msg.direction) this.direction = msg.direction;
    if (msg.customerContext) {
      this.customerContext = msg.customerContext as Record<string, string>;
      if (msg.customerContext.leadId && !this.leadId) {
        this.leadId = msg.customerContext.leadId;
      }
    }

    // Check if phone or lead is already registered on Do-Not-Call list (survives restart & new sessions)
    const isSuppressed = await this.checkExistingDnc();
    if (isSuppressed && this.direction === "OUTBOUND") {
      // For outbound marketing calls, immediately suppress and abort session
      this.close();
      return;
    }

    // 1. Initialize Prisma STT
    this.prismaClient = new PrismaStreamingClient(
      {
        languageCode: this.language,
        model: this.language === "indic-auto" ? "prisma-v3.0" : "prisma-v2.5",
        sampleRate: 16000,
        enablePartials: true,
      },
      {
        onConnected: (cfg) => {
          this.sendToClient({
            type: "stt_connected",
            provider: "gnani_prisma",
            config: cfg,
          });
        },
        onSpeechStart: () => {
          // Barge-in: if the AI is currently speaking, abort immediately!
          if (this.isSpeaking) {
            this.triggerBargeIn();
          }
        },
        onTranscript: async (event) => {
          if (!event.isFinal) {
            this.sendToClient({
              type: "interim_transcript",
              speaker: "user",
              text: event.text,
            });
          } else if (event.text) {
            await this.handleUserUtterance(event.text, event.latencyMs);
          }
        },
        onError: (err) => {
          this.sendToClient({
            type: "stt_error",
            message: err.message,
          });
        },
      }
    );

    const connected = await this.prismaClient.connect();

    this.timbreClient = new TimbreStreamingClient();

    // 2. Notify client that session is ready
    this.sendToClient({
      type: "session_ready",
      sessionId: this.sessionId,
      sttReady: connected,
      voice: this.voice,
      model: this.model,
      language: this.language,
      timestamp: new Date().toISOString(),
    });

    // 3. Persist call session to Supabase if configured
    this.persistCallStart();
  }

  private handleAudioChunk(chunk: Buffer) {
    if (this.prismaClient && this.prismaClient.isOpen()) {
      this.prismaClient.sendAudioChunk(chunk);
    }
  }

  public triggerBargeIn() {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.timbreClient?.abort();
      this.sendToClient({
        type: "barge_in",
        timestamp: Date.now(),
        message: "Playback interrupted by user speech",
      });
    }
  }

  private async handleUserUtterance(text: string, sttLatencyMs?: number) {
    if (this.isProcessingTurn || this.isDnc || this.isEscalated) return;
    this.isProcessingTurn = true;
    this.turnCount++;

    // 1. Emit final user transcript to client
    this.sendToClient({
      type: "transcript",
      speaker: "user",
      text,
      isFinal: true,
      turn: this.turnCount,
      sttLatencyMs,
    });

    // 2. Notify client AI is thinking
    this.sendToClient({
      type: "agent_state",
      state: "thinking",
    });

    // 3. Generate Agent Turn
    const turnResult = await generateAgentTurn({
      systemPrompt: this.systemPrompt || "You are a helpful VoiceNexus business voice consultant.",
      conversationHistory: this.conversationHistory,
      callerUtterance: text,
      customerContext: this.customerContext,
    });

    let dncPersisted = false;
    let escalationHandled = false;

    if (turnResult.isDnc) {
      this.isDnc = true;
      const dncRes = await this.persistDncOptOut();
      dncPersisted = dncRes.success;

      // Truthful spoken confirmation based on actual DB outcome
      const isTamil = this.language.startsWith("ta");
      if (dncPersisted) {
        turnResult.text = isTamil
          ? "புரிந்துகொண்டேன். உங்கள் எண் எங்கள் அழைப்பு தவிர்ப்பு பட்டியலில் சேர்க்கப்பட்டு எதிர்கால பிரச்சாரங்களிலிருந்து நீக்கப்பட்டுள்ளது. நன்றி, வணக்கம்."
          : "Understood. Your number has been registered on our Do-Not-Call list and removed from future campaigns. Thank you, and goodbye.";
      } else {
        turnResult.text = isTamil
          ? "புரிந்துகொண்டேன். உங்கள் கோரிக்கையின்படி இந்த அழைப்பு உடனடியாக நிறுத்தப்பட்டுள்ளது. அழைப்பு பட்டியலிலிருந்து நீக்குவதை எங்கள் குழு சரிபார்க்கும். நன்றி, வணக்கம்."
          : "Understood. I have stopped this call immediately per your request. Our team will verify your number is removed from our calling list. Thank you, and goodbye.";
      }
    }

    if (turnResult.isEscalated) {
      this.isEscalated = true;
      const escRes = await this.persistSupervisorEscalation();
      escalationHandled = escRes.success;

      // Truthfully spoken confirmation: only confirm follow-up if DB record was actually persisted
      const isTamil = this.language.startsWith("ta");
      if (escalationHandled) {
        turnResult.text = isTamil
          ? "புரிந்துகொண்டேன். இந்த தானியங்கி உரையாடலை நிறுத்திவிட்டு, எங்கள் மேற்பார்வையாளர் குழு உங்களை தொடர்பு கொள்ளுமாறு அவசர பதிவை செய்துள்ளேன். உங்கள் நேரத்திற்கு நன்றி."
          : "I understand. I have paused this automated session and logged an urgent request for our supervisory team to follow up with you. Thank you for your patience.";
      } else {
        turnResult.text = isTamil
          ? "புரிந்துகொண்டேன். உங்கள் கோரிக்கையின்படி இந்த தானியங்கி அழைப்பு நிறுத்தப்பட்டுள்ளது. உதவிக்கு எங்கள் ஆதரவு குழுவை நேரடியாக தொடர்பு கொள்ளவும்."
          : "I understand. I have paused this automated call per your request. Please contact our support team directly for immediate assistance.";
      }

      this.sendToClient({
        type: "escalation_state",
        escalationRequested: true,
        pendingFollowUpCreated: escalationHandled,
        followUpTaskId: escRes.taskId,
        notificationDelivered: false,
        liveTransferCompleted: false,
        message: escalationHandled
          ? "Automated session paused; follow-up task queued for supervisory team."
          : "Automated session paused; follow-up task creation failed. Direct contact required.",
      });
    }

    // Append to conversation history
    this.conversationHistory.push({ role: "user", content: text });
    this.conversationHistory.push({ role: "assistant", content: turnResult.text });

    // 4. Emit agent response transcript to client
    this.sendToClient({
      type: "transcript",
      speaker: "agent",
      text: turnResult.text,
      isFinal: true,
      turn: this.turnCount,
      llmProvider: turnResult.provider,
      llmModel: turnResult.model,
      llmLatencyMs: turnResult.latencyMs,
      isDnc: turnResult.isDnc,
      dncPersisted,
      isEscalated: turnResult.isEscalated,
      escalationPendingFollowUp: escalationHandled,
      isCallbackRequested: turnResult.isCallbackRequested,
      isUnconfigured: turnResult.isUnconfigured,
      unconfiguredNotice: turnResult.unconfiguredNotice,
    });

    // 5. Synthesize speech using Timbre
    this.isSpeaking = true;
    this.sendToClient({
      type: "agent_state",
      state: "speaking",
    });

    const ttsStartTime = Date.now();

    await this.timbreClient?.synthesize(
      {
        text: turnResult.text,
        voice: this.voice,
        model: this.model,
        language: this.language,
        speed: 1.0,
        container: "wav",
        sampleRate: 16000,
      },
      {
        onAudioChunk: (chunk) => {
          if (!this.isSpeaking) return; // Barge-in interrupted
          this.sendToClient({
            type: "audio_chunk",
            chunkIndex: chunk.chunkIndex,
            data: chunk.base64Audio,
            isFinal: chunk.isFinal,
            ttsLatencyMs: Date.now() - ttsStartTime,
          });
        },
        onComplete: () => {
          this.isSpeaking = false;
          this.sendToClient({
            type: "audio_end",
            totalLatencyMs: Date.now() - ttsStartTime,
          });
          if (this.isDnc) {
            this.sendToClient({
              type: "agent_state",
              state: "ended",
            });
            this.close();
          } else if (this.isEscalated) {
            this.sendToClient({
              type: "agent_state",
              state: "transferred",
            });
          } else {
            this.sendToClient({
              type: "agent_state",
              state: "listening",
            });
          }
        },
        onError: (err) => {
          this.isSpeaking = false;
          this.sendToClient({
            type: "tts_error",
            message: err.message,
          });
          this.sendToClient({
            type: "agent_state",
            state: "listening",
          });
        },
      }
    );

    this.isProcessingTurn = false;

    // 6. Persist transcripts to Supabase
    this.persistTurn(text, turnResult.text);
  }

  private sendToClient(payload: Record<string, unknown>) {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(payload));
    }
  }

  private sendError(message: string, error?: unknown) {
    this.sendToClient({
      type: "error",
      message,
      details: error instanceof Error ? error.message : String(error || ""),
    });
  }

  public async checkExistingDnc(): Promise<boolean> {
    if (!this.supabase) {
      if (this.direction === "OUTBOUND") {
        this.isDnc = true;
        this.sendToClient({
          type: "dnc_suppression_active",
          message: "Fail-safe: Database client unavailable. Outbound call suppressed.",
        });
        return true;
      }
      return false;
    }

    const phone = this.customerContext.phone;
    const leadId = this.leadId || this.customerContext.leadId;
    if (!phone && !leadId) return false;

    try {
      let query = this.supabase
        .from("leads")
        .select("id, do_not_call, status")
        .is("deleted_at", null);

      if (this.organizationId) {
        query = query.eq("organization_id", this.organizationId);
      }

      if (leadId) {
        query = query.eq("id", leadId);
      } else if (phone) {
        const variants = getPhoneVariants(phone);
        query = query.in("phone", variants);
      }

      const { data: matchedLeads, error } = await query;
      if (error) {
        throw error;
      }

      if (matchedLeads && matchedLeads.length > 0) {
        const isDnc = matchedLeads.some(
          (l) => l.do_not_call === true || l.status === "DO_NOT_CALL"
        );
        if (isDnc) {
          this.isDnc = true;
          this.sendToClient({
            type: "dnc_suppression_active",
            phone,
            message: "This number is registered on the Do-Not-Call list. Automated AI calling is suppressed.",
          });
          return true;
        }
      }
    } catch (err) {
      console.error("[VoiceGateway] Existing DNC check error:", err);
      if (this.direction === "OUTBOUND") {
        // Fail safe: reject unverified outbound calls when DB lookup errors
        this.isDnc = true;
        this.sendToClient({
          type: "dnc_suppression_active",
          phone,
          message: "Fail-safe: Database lookup failed to verify DNC eligibility. Outbound call suppressed.",
        });
        return true;
      }
    }
    return false;
  }

  public async persistDncOptOut(): Promise<{ success: boolean; updatedLeads: number; error?: string }> {
    if (!this.supabase) {
      return { success: false, updatedLeads: 0, error: "Database client unconfigured" };
    }

    const phone = this.customerContext.phone;
    const leadId = this.leadId || this.customerContext.leadId;
    const orgId = this.organizationId;

    try {
      let updatedLeads = 0;

      // 1. Update all matching lead records within organization (handles duplicate customer records idempotently)
      if (leadId || phone) {
        let updateQuery = this.supabase
          .from("leads")
          .update({
            do_not_call: true,
            status: "DO_NOT_CALL",
            last_activity_at: new Date().toISOString(),
          });

        if (orgId) {
          updateQuery = updateQuery.eq("organization_id", orgId);
        }

        if (leadId) {
          updateQuery = updateQuery.eq("id", leadId);
        } else if (phone) {
          const variants = getPhoneVariants(phone);
          updateQuery = updateQuery.in("phone", variants);
        }

        const { data: updated, error: leadErr } = await updateQuery.select("id");
        if (leadErr) {
          console.error("[VoiceGateway] Failed to update lead DNC:", leadErr.message);
          throw leadErr;
        } else if (updated) {
          updatedLeads = updated.length;
        }
      }

      // 2. Caller without prior lead: persist a new DNC opt-out lead so future campaigns/sessions suppress them
      if (updatedLeads === 0 && phone && orgId) {
        const normPhone = normalizePhone(phone);
        const { data: inserted, error: insertErr } = await this.supabase
          .from("leads")
          .insert({
            organization_id: orgId,
            name: this.customerContext.customerName || "Caller (DNC Opt-Out)",
            phone: normPhone,
            status: "DO_NOT_CALL",
            do_not_call: true,
            score: 0,
            source: "Inbound Voice DNC Opt-Out",
            summary: "Caller requested immediate Do-Not-Call (DNC) opt-out without prior CRM profile.",
          })
          .select("id");

        if (insertErr) {
          console.error("[VoiceGateway] Failed to insert DNC lead:", insertErr.message);
          throw insertErr;
        } else if (inserted && inserted.length > 0) {
          updatedLeads = inserted.length;
          if (inserted[0]?.id) {
            this.leadId = inserted[0].id;
          }
        }
      }

      // 3. Persist outcome in call_outcomes table
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.sessionId);
      if (isUuid) {
        await this.supabase.from("call_outcomes").upsert(
          {
            call_session_id: this.sessionId,
            disposition: "DO_NOT_CALL",
            sentiment: "NEGATIVE",
            confidence_score: 0.99,
            summary: "Caller requested immediate Do-Not-Call (DNC) opt-out. Automated AI turns ceased.",
            action_items: ["Suppress phone number from all active and future outbound campaigns."],
            follow_up_recommended: false,
          },
          { onConflict: "call_session_id" }
        );

        // 4. Update call_sessions status to DO_NOT_CALL
        await this.supabase
          .from("call_sessions")
          .update({
            status: "DO_NOT_CALL",
            end_time: new Date().toISOString(),
          })
          .eq("id", this.sessionId);
      }

      return { success: true, updatedLeads };
    } catch (err) {
      console.error("[VoiceGateway] DNC persistence failure:", err);
      return { success: false, updatedLeads: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async persistSupervisorEscalation(): Promise<{ success: boolean; taskId?: string; error?: string }> {
    if (!this.supabase || !this.organizationId) {
      return { success: false, error: "Database client or organizationId unavailable" };
    }

    const leadId = this.leadId || this.customerContext.leadId || null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.sessionId);
    const customerName = this.customerContext.customerName || "Customer";

    try {
      // 1. Insert Pending Follow-up Task in public.follow_up_tasks (Pending Human Follow-up State)
      const dueIn2Hours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { data: task, error: taskErr } = await this.supabase
        .from("follow_up_tasks")
        .insert({
          organization_id: this.organizationId,
          lead_id: leadId,
          call_session_id: isUuid ? this.sessionId : null,
          title: `URGENT: Supervisor Callback for ${customerName}`,
          description: "Caller requested immediate supervisor escalation during live voice session. Automated AI conversation paused. Live telephony transfer deferred; follow-up callback required.",
          priority: "HIGH",
          status: "PENDING",
          due_date: dueIn2Hours,
        })
        .select("id")
        .single();

      if (taskErr) {
        console.error("[VoiceGateway] Follow-up task creation error:", taskErr.message);
        throw taskErr;
      }

      // 2. Persist outcome in call_outcomes
      if (isUuid) {
        await this.supabase.from("call_outcomes").upsert(
          {
            call_session_id: this.sessionId,
            disposition: "ESCALATED",
            sentiment: "NEUTRAL",
            confidence_score: 0.95,
            summary: "Caller requested human supervisor escalation. Automated AI paused; pending supervisor follow-up task created.",
            action_items: [`Initiate supervisor callback for ${customerName}`],
            follow_up_recommended: true,
          },
          { onConflict: "call_session_id" }
        );

        // 3. Update call_sessions status
        await this.supabase
          .from("call_sessions")
          .update({
            status: "COMPLETED",
            end_time: new Date().toISOString(),
          })
          .eq("id", this.sessionId);
      }

      return { success: true, taskId: task?.id };
    } catch (err) {
      console.error("[VoiceGateway] Escalation persistence failure:", err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async persistCallStart() {
    if (!this.supabase || !this.organizationId) return;
    try {
      // Validate UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.sessionId);
      await this.supabase.from("call_sessions").insert({
        ...(isUuid ? { id: this.sessionId } : {}),
        organization_id: this.organizationId,
        agent_id: this.agentId || null,
        direction: "INBOUND",
        channel: "BROWSER_WEBRTC",
        status: "IN_PROGRESS",
        start_time: new Date(this.sessionStartTime).toISOString(),
        customer_name: this.customerContext.customerName || "Web Caller",
        customer_phone: this.customerContext.phone || null,
      });
    } catch {
      // Non-blocking persistence
    }
  }

  private async persistTurn(userText: string, agentText: string) {
    if (!this.supabase || !this.organizationId) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.sessionId);
    if (!isUuid) return;

    try {
      await this.supabase.from("transcript_segments").insert([
        {
          call_session_id: this.sessionId,
          speaker: "CALLER",
          text: userText,
          confidence: 0.95,
          start_offset_ms: Math.max(0, Date.now() - this.sessionStartTime - 3000),
          end_offset_ms: Math.max(0, Date.now() - this.sessionStartTime - 1000),
        },
        {
          call_session_id: this.sessionId,
          speaker: "AGENT",
          text: agentText,
          confidence: 1.0,
          start_offset_ms: Math.max(0, Date.now() - this.sessionStartTime - 1000),
          end_offset_ms: Math.max(0, Date.now() - this.sessionStartTime),
        },
      ]);
    } catch {
      // Non-blocking persistence
    }
  }

  private async persistCallEnd() {
    if (!this.supabase || !this.organizationId) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.sessionId);
    if (!isUuid) return;

    try {
      const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
      await this.supabase
        .from("call_sessions")
        .update({
          status: "COMPLETED",
          end_time: new Date().toISOString(),
          duration_seconds: duration,
        })
        .eq("id", this.sessionId);
    } catch {
      // Non-blocking persistence
    }
  }

  public close() {
    this.persistCallEnd();
    this.cleanup();
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.close(1000, "Session Ended");
    }
  }

  private cleanup() {
    this.isSpeaking = false;
    this.prismaClient?.close();
    this.timbreClient?.abort();
    this.prismaClient = null;
    this.timbreClient = null;
  }
}

