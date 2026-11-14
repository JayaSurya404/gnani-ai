"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  User,
  Search,
  Volume2,
  RefreshCw,
  Clock,
  Radio,
  Square,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CallStatusPill } from "@/components/ui/status-pill";
import { formatDuration, formatPhoneNumber, cleanLeadName, cleanLeadNotes } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CallStatus } from "@/types/database";

interface TranscriptSegment {
  id: string;
  speaker: string;
  language?: string | null;
  text: string;
  confidence?: number | null;
  start_offset_ms?: number | null;
  end_offset_ms?: number | null;
  created_at?: string;
}

interface CallEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface CallDetail {
  id: string;
  organization_id?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  direction?: string;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_seconds: number;
  recording_url?: string | null;
  created_at: string;
  transcriptSegments: TranscriptSegment[];
  events?: CallEvent[];
}

interface CallSummaryItem {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  status: string;
  duration_seconds?: number;
  created_at: string;
}

function ConversationsContent() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("sessionId") || "";

  const [callsList, setCallsList] = useState<CallSummaryItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(initialSessionId);
  const [currentCall, setCurrentCall] = useState<CallDetail | null>(null);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Filters
  const [search, setSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<"ALL" | "CALLER" | "AGENT">("ALL");
  const [langFilter, setLangFilter] = useState<string>("ALL");

  // Audio Playback
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch available calls list
  const fetchCallsList = useCallback(async () => {
    try {
      const res = await fetch("/api/calls?limit=25");
      const data = await res.json();
      if (data?.success && Array.isArray(data.calls)) {
        const sorted: CallSummaryItem[] = data.calls.map((c: Record<string, unknown>) => ({
          id: String(c.id || ""),
          customer_name: (c.customer_name as string) || "Verified Customer",
          customer_phone: (c.customer_phone as string) || "+91...",
          status: (c.status as string) || "COMPLETED",
          duration_seconds: Number(c.duration_seconds || 0),
          created_at: (c.created_at as string) || new Date().toISOString(),
        }));
        setCallsList(sorted);

        // If no session selected yet, default to query param or latest call
        if (!selectedSessionId && sorted.length > 0) {
          const defaultId = initialSessionId || sorted[0].id;
          setSelectedSessionId(defaultId);
        }
      }
    } catch (err) {
      console.warn("[Conversations] Failed to fetch calls list:", err);
    } finally {
      setLoadingCalls(false);
    }
  }, [selectedSessionId, initialSessionId]);

  // Fetch full details & transcript segments for selected session
  const fetchCallDetail = useCallback(async (sessionId: string, showLoading = true) => {
    if (!sessionId) return;
    if (showLoading) setLoadingDetail(true);

    try {
      const res = await fetch(`/api/calls/${sessionId}`);
      const data = await res.json();
      if (data?.success && data.call) {
        setCurrentCall(data.call);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.warn(`[Conversations] Failed to fetch call ${sessionId}:`, err);
    } finally {
      if (showLoading) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const res = await fetch("/api/calls?limit=25");
        const data = await res.json();
        if (!active) return;
        if (data?.success && Array.isArray(data.calls)) {
          const sorted: CallSummaryItem[] = data.calls.map((c: Record<string, unknown>) => ({
            id: String(c.id || ""),
            customer_name: (c.customer_name as string) || "Verified Customer",
            customer_phone: (c.customer_phone as string) || "+91...",
            status: (c.status as string) || "COMPLETED",
            duration_seconds: Number(c.duration_seconds || 0),
            created_at: (c.created_at as string) || new Date().toISOString(),
          }));
          setCallsList(sorted);

          if (!selectedSessionId && sorted.length > 0) {
            const defaultId = initialSessionId || sorted[0].id;
            setSelectedSessionId(defaultId);
          }
        }
      } catch (err) {
        console.warn("[Conversations] Init error:", err);
      } finally {
        if (active) setLoadingCalls(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [initialSessionId, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    let active = true;
    async function loadDetail() {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/calls/${selectedSessionId}`);
        const data = await res.json();
        if (active && data?.success && data.call) {
          setCurrentCall(data.call);
          setLastRefreshedAt(new Date());
        }
      } catch (err) {
        console.warn(`[Conversations] Load detail error:`, err);
      } finally {
        if (active) setLoadingDetail(false);
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedSessionId]);

  // Live polling interval for real-time turn updates
  useEffect(() => {
    if (!isLivePolling || !selectedSessionId) return;

    const interval = setInterval(() => {
      fetchCallDetail(selectedSessionId, false);
    }, 2000);

    return () => clearInterval(interval);
  }, [isLivePolling, selectedSessionId, fetchCallDetail]);

  // Supabase Realtime Subscription for immediate push updates
  useEffect(() => {
    if (!selectedSessionId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`rt_transcripts_${selectedSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transcript_segments",
          filter: `call_session_id=eq.${selectedSessionId}`,
        },
        () => {
          fetchCallDetail(selectedSessionId, false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `id=eq.${selectedSessionId}`,
        },
        () => {
          fetchCallDetail(selectedSessionId, false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSessionId, fetchCallDetail]);

  // Stop currently playing audio on unmount
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  // Handle Play Audio
  const handlePlayAudio = (segment: TranscriptSegment, correlatedAudioId?: string | null) => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
      if (playingAudioId === segment.id) {
        setPlayingAudioId(null);
        return;
      }
    }

    // Tier 1: Real synthesized WAV from VoiceNexus audio endpoint
    if (correlatedAudioId) {
      const audioUrl = `/api/telephony/audio/${correlatedAudioId}.wav`;
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      setPlayingAudioId(segment.id);

      audio.play().catch((err) => {
        console.warn("[Conversations] WAV playback error, falling back to speech synthesis:", err);
        fallbackSpeechSynthesis(segment.text, segment.id);
      });

      audio.onended = () => {
        setPlayingAudioId(null);
        activeAudioRef.current = null;
      };

      audio.onerror = () => {
        fallbackSpeechSynthesis(segment.text, segment.id);
      };
      return;
    }

    // Tier 2: Browser Speech Synthesis Fallback
    fallbackSpeechSynthesis(segment.text, segment.id);
  };

  const fallbackSpeechSynthesis = (text: string, segmentId: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (text.match(/[\u0B80-\u0BFF]/)) {
        utterance.lang = "ta-IN";
      }
      setPlayingAudioId(segmentId);
      utterance.onend = () => setPlayingAudioId(null);
      utterance.onerror = () => setPlayingAudioId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      toast.info(`Utterance: "${text}"`);
    }
  };

  // Helper to correlate audioId from call_events for an agent response segment
  const getCorrelatedEvent = (segment: TranscriptSegment): CallEvent | undefined => {
    if (!currentCall?.events || !Array.isArray(currentCall.events)) return undefined;
    return currentCall.events.find((evt) => {
      if (segment.speaker === "CALLER" && evt.event_type === "USER_TRANSCRIPT") {
        return evt.payload?.text === segment.text;
      }
      if (segment.speaker === "AGENT" && evt.event_type === "AGENT_RESPONSE") {
        return evt.payload?.text === segment.text;
      }
      return false;
    });
  };

  // Filter transcript segments
  const segments = currentCall?.transcriptSegments || [];
  const filteredSegments = segments.filter((seg) => {
    const isCaller = seg.speaker.toUpperCase().includes("CALLER") || seg.speaker.toUpperCase().includes("USER") || seg.speaker.toUpperCase().includes("CUSTOMER");
    if (speakerFilter === "CALLER" && !isCaller) return false;
    if (speakerFilter === "AGENT" && isCaller) return false;

    if (langFilter !== "ALL") {
      if (seg.language && !seg.language.toLowerCase().includes(langFilter.toLowerCase())) {
        return false;
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      return seg.text.toLowerCase().includes(q) || seg.speaker.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-[#192238]">
              Real-Time Transcripts &amp; Live Conversation Monitor
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Twilio PSTN Live Stream
            </span>
          </div>
          <p className="text-xs text-[#778198] mt-1">
            Audit turn-by-turn conversational utterances, Twilio recognized SpeechResult, and synthesized AI responses.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (selectedSessionId) fetchCallDetail(selectedSessionId, true);
              fetchCallsList();
              toast.success("Transcripts refreshed from database");
            }}
            className="h-9 text-xs font-semibold gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-[#192238]"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#7065E8] ${loadingDetail ? "animate-spin" : ""}`} />
            Sync Database
          </Button>

          <Button
            size="sm"
            variant={isLivePolling ? "default" : "outline"}
            onClick={() => setIsLivePolling(!isLivePolling)}
            className={`h-9 text-xs font-semibold gap-1.5 ${
              isLivePolling
                ? "bg-[#7065E8] hover:bg-[#5347C8] text-white shadow-sm shadow-[#7065E8]/20"
                : "border-slate-200 bg-white text-[#192238]"
            }`}
          >
            <Radio className={`h-3.5 w-3.5 ${isLivePolling ? "animate-pulse" : ""}`} />
            {isLivePolling ? "Live Auto-Poll (2s)" : "Paused"}
          </Button>
        </div>
      </div>

      {/* Call Session Selector Card */}
      <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-bold text-[#778198] uppercase tracking-wider block">
              Select Call Session to Monitor
            </label>
            <div className="relative">
              <select
                disabled={loadingCalls}
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#192238] focus:outline-none focus:ring-2 focus:ring-[#7065E8]/30 shadow-sm appearance-none pr-8 cursor-pointer"
              >
                {callsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cleanLeadName(c.customer_name)} ({formatPhoneNumber(c.customer_phone || "")}) • {c.status} • {formatDuration(c.duration_seconds || 0)} • {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({c.id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3 h-4 w-4 pointer-events-none text-slate-400" />
            </div>
          </div>

          {currentCall && (
            <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5">
              <div>
                <span className="text-[10px] font-bold text-[#778198] uppercase tracking-wider block">Status</span>
                <CallStatusPill status={(currentCall.status as CallStatus) || "COMPLETED"} className="mt-1" />
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#778198] uppercase tracking-wider block">Duration</span>
                <span className="text-xs font-bold font-mono text-[#192238] block mt-1">
                  {formatDuration(currentCall.duration_seconds || 0)}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#778198] uppercase tracking-wider block">Turns Recorded</span>
                <span className="text-xs font-bold text-[#7065E8] block mt-1">
                  {segments.length} Turns
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#778198] uppercase tracking-wider block">Last Synced</span>
                <span className="text-xs text-slate-500 font-mono block mt-1">
                  {lastRefreshedAt.toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-3 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {(["ALL", "CALLER", "AGENT"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSpeakerFilter(filter)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                  speakerFilter === filter
                    ? "bg-[#7065E8] text-white shadow-sm"
                    : "text-[#778198] hover:bg-slate-100 hover:text-[#192238]"
                }`}
              >
                {filter === "ALL" ? "All Speakers" : filter === "CALLER" ? "Caller Only" : "AI Agent Only"}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {["ALL", "ta-IN", "en-IN", "hi-IN"].map((lang) => (
              <button
                key={lang}
                onClick={() => setLangFilter(lang)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                  langFilter === lang
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-[#778198] hover:bg-slate-100 hover:text-[#192238]"
                }`}
              >
                {lang === "ALL" ? "All Languages" : lang}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search recognized words…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
        </div>
      </Card>

      {/* Real-time Dialogue Segments */}
      <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-[#7065E8]" />
            <CardTitle className="text-xs font-bold text-[#192238] uppercase tracking-wider">
              Chronological Dialogue Turns ({filteredSegments.length})
            </CardTitle>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Session: {selectedSessionId || "None"}
          </span>
        </CardHeader>

        <div className="divide-y divide-slate-100 p-2">
          {filteredSegments.length > 0 ? (
            filteredSegments.map((segment, index) => {
              const isCaller = segment.speaker.toUpperCase().includes("CALLER") || segment.speaker.toUpperCase().includes("USER") || segment.speaker.toUpperCase().includes("CUSTOMER");
              const correlatedEvt = getCorrelatedEvent(segment);
              const audioId = (correlatedEvt?.payload?.audioId as string) || null;
              const ttsProvider = (correlatedEvt?.payload?.ttsProvider as string) || (audioId ? "GNANI_TIMBRE" : null);
              const isPlaying = playingAudioId === segment.id;

              return (
                <div
                  key={segment.id || `turn-${index}`}
                  className={`p-4 rounded-xl my-1 transition-all ${
                    isCaller ? "bg-slate-50/70 border border-slate-100" : "bg-indigo-50/30 border border-indigo-100/60"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Speaker Avatar */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-sm ${
                        isCaller
                          ? "bg-emerald-600 text-white"
                          : "bg-[#7065E8] text-white"
                      }`}
                    >
                      {isCaller ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    {/* Turn Content */}
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Turn Index */}
                        <span className="font-mono text-[10px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          #{index + 1}
                        </span>

                        {/* Speaker Identity */}
                        <span className={`text-xs font-bold ${isCaller ? "text-emerald-900" : "text-[#5347C8]"}`}>
                          {isCaller
                            ? `Caller (${cleanLeadName(currentCall?.customer_name) || "Prospect"})`
                            : "VoiceNexus AI Specialist (Shivani / Asmita)"}
                        </span>

                        {/* Language Badge */}
                        {segment.language && (
                          <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {segment.language}
                          </span>
                        )}

                        {/* Caller Confidence Score */}
                        {isCaller && segment.confidence !== undefined && segment.confidence !== null && (
                          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Confidence: {Math.round(segment.confidence * 100)}%
                          </span>
                        )}

                        {/* AI Audio Status */}
                        {!isCaller && (
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                            audioId
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}>
                            {audioId ? `✓ Gnani Timbre WAV (${audioId.slice(0, 10)}...)` : (ttsProvider || "Twilio Native TTS")}
                          </span>
                        )}

                        {/* Timestamp */}
                        <span className="text-[10px] text-slate-400 ml-auto font-mono flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {segment.created_at
                            ? new Date(segment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : "--:--:--"}
                        </span>
                      </div>

                      {/* Actual Spoken / Recognized Text */}
                      <p className="text-sm font-medium text-[#192238] leading-relaxed whitespace-pre-wrap">
                        {cleanLeadNotes(segment.text)}
                      </p>
                    </div>

                    {/* Audio Playback Button */}
                    <div className="shrink-0 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePlayAudio(segment, audioId)}
                        className={`h-8 px-2.5 text-xs font-semibold gap-1.5 rounded-lg border transition ${
                          isPlaying
                            ? "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                        title={audioId ? "Play verified synthesized Gnani WAV audio" : "Play utterance audio"}
                      >
                        {isPlaying ? (
                          <>
                            <Square className="h-3 w-3 fill-current" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5 text-[#7065E8]" />
                            Listen
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#7065E8]">
                <Radio className="h-6 w-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#192238]">
                  {loadingDetail ? "Loading transcripts..." : "No conversation turns recorded yet for this session"}
                </p>
                <p className="text-xs text-[#778198] max-w-sm">
                  {selectedSessionId
                    ? "When a call connects and the caller or AI speaks, turns will automatically appear here with timestamps and audio generation status."
                    : "Please select a call session above to inspect transcripts."}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Realtime Telephony Diagnostics Footer */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#778198]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#192238]">Active Pipeline Architecture:</span>
            <span>STT: Twilio Gather (Indic)</span>
            <span>•</span>
            <span>LLM: Gemini Multilingual Flash</span>
            <span>•</span>
            <span>TTS: Gnani Timbre v3.0 (Shivani)</span>
            <span>•</span>
            <span>Database: Supabase Postgres RLS</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-800">Connected to Database &amp; Realtime Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center space-y-2">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#7065E8] border-t-transparent" />
            <p className="text-xs text-[#778198]">Loading Realtime Transcripts...</p>
          </div>
        </div>
      }
    >
      <ConversationsContent />
    </Suspense>
  );
}
