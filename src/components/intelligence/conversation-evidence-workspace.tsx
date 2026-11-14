"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Search,
  User,
  Bot,
  Volume2,
  Clock,
  CheckCircle2,
  Play,
  Pause,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TranscriptSegmentItem {
  id: string;
  speaker: string; // "CUSTOMER" | "AGENT" | "AI"
  text: string;
  language?: string | null;
  confidence?: number | null;
  startOffsetMs?: number | null;
  endOffsetMs?: number | null;
  createdAt?: string;
}

interface ConversationEvidenceWorkspaceProps {
  segments: TranscriptSegmentItem[];
  recordingUrl?: string | null;
  highlightSegmentId?: string | null;
  highlightQuote?: string | null;
  className?: string;
}

export function ConversationEvidenceWorkspace({
  segments,
  recordingUrl,
  highlightSegmentId,
  highlightQuote,
  className,
}: ConversationEvidenceWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<"ALL" | "CUSTOMER" | "AGENT">("ALL");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeSegmentId = highlightSegmentId || selectedSegmentId;

  // Sync external highlight trigger scrolling without cascading state renders
  useEffect(() => {
    if (highlightSegmentId) {
      const el = document.getElementById(`segment-${highlightSegmentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightSegmentId]);

  // Format millisecond offset to mm:ss
  const formatOffset = (ms?: number | null) => {
    if (ms === undefined || ms === null) return "--:--";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // Filter segments
  const filteredSegments = segments.filter((seg) => {
    const isCustomer = seg.speaker.toUpperCase().includes("CUSTOMER") || seg.speaker.toUpperCase().includes("USER");
    if (speakerFilter === "CUSTOMER" && !isCustomer) return false;
    if (speakerFilter === "AGENT" && isCustomer) return false;

    if (searchTerm.trim()) {
      return seg.text.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleToggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  return (
    <Card className={cn("border-[#222C3E] bg-[#0E131F]", className)}>
      <CardHeader className="p-4 pb-3 border-b border-[#222C3E]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            <CardTitle className="text-sm font-semibold text-white">
              Conversation Evidence Transcript
            </CardTitle>
            <span className="text-[11px] font-mono text-slate-400">
              ({segments.length} turns)
            </span>
          </div>

          {/* Audio Player (or explicit notice) */}
          <div>
            {recordingUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#222C3E] bg-[#121824] px-3 py-1.5">
                <audio
                  ref={audioRef}
                  src={recordingUrl}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleToggleAudio}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? "Pause Recording" : "Play Recording"}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#121824]/60 px-2.5 py-1 text-[11px] text-slate-400">
                <Volume2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Audio recording not available for this session</span>
              </div>
            )}
          </div>
        </div>

        {/* Search & Speaker Filter Controls */}
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search in transcript dialogue..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8.5 pl-8 text-xs bg-[#121824] border-[#222C3E] text-slate-200 placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#222C3E] bg-[#121824] p-0.5">
            {[
              { id: "ALL" as const, label: "All Speakers" },
              { id: "CUSTOMER" as const, label: "Customer Only" },
              { id: "AGENT" as const, label: "AI Agent Only" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSpeakerFilter(f.id)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium transition",
                  speakerFilter === f.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3 max-h-[560px] overflow-y-auto">
        {filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <MessageSquare className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-xs font-medium">No transcript turns match your filter.</p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="mt-2 text-xs text-indigo-400 hover:underline"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          filteredSegments.map((seg, idx) => {
            const isCustomer =
              seg.speaker.toUpperCase().includes("CUSTOMER") || seg.speaker.toUpperCase().includes("USER");
            const isHighlighted = activeSegmentId === seg.id;
            const containsQuote = highlightQuote && seg.text.toLowerCase().includes(highlightQuote.toLowerCase());

            return (
              <div
                key={seg.id || idx}
                id={`segment-${seg.id}`}
                onClick={() => setSelectedSegmentId(seg.id)}
                className={cn(
                  "rounded-xl border p-3.5 transition cursor-pointer space-y-1.5",
                  isHighlighted || containsQuote
                    ? "border-indigo-500 bg-indigo-950/30 ring-2 ring-indigo-500/40"
                    : isCustomer
                    ? "border-[#222C3E] bg-[#121824]/80 hover:bg-[#161D2B]"
                    : "border-indigo-900/40 bg-indigo-950/20 hover:bg-indigo-950/30"
                )}
              >
                {/* Speaker Label & Offset */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {isCustomer ? (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-slate-700 bg-slate-800 text-slate-300">
                        <User className="h-2.5 w-2.5" /> Customer
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-indigo-500/40 bg-indigo-500/10 text-indigo-300">
                        <Bot className="h-2.5 w-2.5 text-indigo-400" /> VoiceNexus AI
                      </Badge>
                    )}

                    {seg.language && (
                      <span className="text-[10px] font-mono text-slate-500">
                        {seg.language}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px] tabular-nums">
                    {seg.confidence !== null && seg.confidence !== undefined && (
                      <span className="text-slate-500">
                        {Math.round(seg.confidence * 100)}% conf
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5 text-slate-500" />
                      {formatOffset(seg.startOffsetMs)}
                    </span>
                  </div>
                </div>

                {/* Turn Dialogue Text */}
                <p className="text-xs leading-relaxed text-slate-200">
                  {seg.text}
                </p>

                {(isHighlighted || containsQuote) && (
                  <div className="pt-1 flex items-center gap-1 text-[10px] font-semibold text-indigo-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Referenced post-call evidence claim</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

