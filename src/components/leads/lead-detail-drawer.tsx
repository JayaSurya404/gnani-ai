"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Sparkles,
  PhoneCall,
  Save,
  FileText,
  Loader2,
  Globe,
  Clock,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Phone,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemperaturePill, LeadStatusPill } from "@/components/ui/status-pill";
import { formatPhoneNumber, cleanLeadName, cleanLeadNotes, formatLeadSource } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/lib/types";

interface Props {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface CallSummary {
  id: string;
  status: string;
  duration_seconds: number;
  created_at: string;
  call_outcomes?: {
    disposition?: string;
    sentiment?: string;
    summary?: string;
    qualification_decision?: string;
  };
}

export default function LeadDetailDrawer({ lead, isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"profile" | "timeline" | "notes" | "calls">("profile");
  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead?.status || "NEW");
  const [ownerNotes, setOwnerNotes] = useState(cleanLeadNotes(lead?.notes || lead?.summary || ""));
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Timeline and call history
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [priorCalls, setPriorCalls] = useState<CallSummary[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    if (!lead || !isOpen) return;

    const t = setTimeout(() => {
      setCurrentStatus(lead.status || "NEW");
      setOwnerNotes(cleanLeadNotes(lead.notes || lead.summary || ""));
      setIsLoadingDetails(true);
    }, 0);

    fetch(`/api/leads/${lead.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) {
          if (data.events) setTimelineEvents(data.events);
          if (data.calls) {
            setPriorCalls(
              data.calls.map((c: Record<string, unknown>) => ({
                id: String(c.id),
                status: String(c.status || "COMPLETED"),
                duration_seconds: Number(c.duration_seconds || 0),
                created_at: String(c.created_at),
                call_outcomes: Array.isArray(c.call_outcomes) ? c.call_outcomes[0] : c.call_outcomes,
              }))
            );
          }
          if (data.lead?.status) setCurrentStatus(data.lead.status);
          if (data.lead?.notes) setOwnerNotes(cleanLeadNotes(data.lead.notes));
        }
      })
      .catch((err) => console.error("Error fetching lead details:", err))
      .finally(() => setIsLoadingDetails(false));

    return () => clearTimeout(t);
  }, [lead, isOpen]);

  if (!isOpen || !lead) return null;

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: ownerNotes,
          status: currentStatus,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        toast.success("Lead notes & status updated successfully");
        // Re-fetch events so the new note shows up in the timeline
        const ref = await fetch(`/api/leads/${lead.id}`);
        const rData = await ref.json();
        if (rData?.events) setTimelineEvents(rData.events);
      } else {
        toast.error(data?.error || "Failed to save notes");
      }
    } catch {
      toast.error("Network error while saving notes");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "PAGE_VIEW":
        return <Globe className="h-3.5 w-3.5 text-blue-600" />;
      case "FORM_SUBMIT":
        return <FileText className="h-3.5 w-3.5 text-orange-600" />;
      case "AI_ANALYSIS_COMPLETED":
        return <Sparkles className="h-3.5 w-3.5 text-purple-600" />;
      case "NOTE_ADDED":
        return <Tag className="h-3.5 w-3.5 text-amber-600" />;
      case "STATUS_CHANGE":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Drawer Header */}
        <div className="border-b border-slate-200/80 px-6 py-5 bg-[#FAF9F5]/70 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">{cleanLeadName(lead.name)}</h2>
              <TemperaturePill temperature={lead.temperature} score={lead.score} />
              <LeadStatusPill status={currentStatus} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-mono">
                <Phone className="h-3 w-3 text-slate-400" />
                {formatPhoneNumber(lead.phone)}
              </span>
              {lead.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  {lead.location}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dedicated Call Center CTA Banner */}
        <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/50 border-b border-orange-200/80 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white shadow-xs">
              <PhoneCall className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Initiate Carrier Phone Call</div>
              <div className="text-[11px] text-slate-600">Review call plan, select voice agent & dial via Call Center</div>
            </div>
          </div>
          <Link href={`/calls?leadId=${lead.id}`}>
            <Button size="sm" className="h-8 gap-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs">
              <span>Open in Call Center</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white gap-2">
          <button
            onClick={() => setActiveTab("profile")}
            className={`py-3 text-xs font-bold border-b-2 px-3 transition-colors ${activeTab === "profile"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            Lead Intelligence
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-3 text-xs font-bold border-b-2 px-3 transition-colors flex items-center gap-1.5 ${activeTab === "timeline"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            <span>Activity Timeline</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 font-mono">
              {timelineEvents.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`py-3 text-xs font-bold border-b-2 px-3 transition-colors ${activeTab === "notes"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            Owner Notes & Status
          </button>
          <button
            onClick={() => setActiveTab("calls")}
            className={`py-3 text-xs font-bold border-b-2 px-3 transition-colors flex items-center gap-1.5 ${activeTab === "calls"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
          >
            <span>Call History</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 font-mono">
              {priorCalls.length}
            </span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <>
              {/* TAB 1: Lead Intelligence Profile */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  {/* Lead Summary Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Inbound Enquiry Summary
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                      {cleanLeadNotes(lead.summary) || "Inbound consultation requested through public web portal. High intent commercial requirement."}
                    </p>
                  </div>

                  {/* Attributes Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">Primary Requirement</div>
                      <div className="text-xs font-bold text-slate-900">{lead.primaryInterest}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">Acquisition Source</div>
                      <div className="text-xs font-bold text-slate-900">{formatLeadSource(lead.source)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">Contact Email</div>
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {lead.email || "Not specified"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase">DNC Compliance</div>
                      <div className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Eligible for Calling</span>
                      </div>
                    </div>
                  </div>

                  {/* Intent & Scoring Breakdown */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-orange-600" />
                        <span className="text-xs font-bold text-slate-900">Explainable AI Scoring Breakdown</span>
                      </div>
                      <span className="text-sm font-black text-orange-600 tabular-nums">{lead.score}/100</span>
                    </div>

                    <div className="space-y-2 pt-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Commercial Feasibility</span>
                        <span className="font-semibold text-slate-900">High (Clear roof specifications)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Timeline Urgency</span>
                        <span className="font-semibold text-slate-900">Immediate (&lt; 14 days)</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Decision Authority</span>
                        <span className="font-semibold text-slate-900">Direct Owner / Managing Partner</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Activity Timeline */}
              {activeTab === "timeline" && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-slate-500">
                    Chronological audit log of public page visits and submissions
                  </div>

                  {timelineEvents.length > 0 ? (
                    <div className="relative border-l-2 border-slate-200 ml-3.5 space-y-6 py-2">
                      {timelineEvents.map((event) => (
                        <div key={event.id} className="relative pl-6 space-y-1">
                          <div className="absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-slate-200">
                            {getEventIcon(event.event_type)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">{event.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {event.description && (
                            <p className="text-xs text-slate-600 leading-relaxed">{event.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-xs text-slate-400">
                      No public page timeline recorded yet.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Owner Notes & Status */}
              {activeTab === "notes" && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-900">Pipeline Progression Stage</label>
                    <select
                      value={currentStatus}
                      onChange={(e) => setCurrentStatus(e.target.value as LeadStatus)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="NEW">NEW (Awaiting First Call)</option>
                      <option value="CONTACTED">CONTACTED (Call Dispatched)</option>
                      <option value="QUALIFIED">QUALIFIED (Requirements Confirmed)</option>
                      <option value="CONVERTED">CONVERTED (Quotation Accepted)</option>
                      <option value="LOST">LOST (Unqualified / Declined)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-900">Internal CRM Notes</label>
                    <textarea
                      rows={5}
                      value={ownerNotes}
                      onChange={(e) => setOwnerNotes(e.target.value)}
                      placeholder="Add key insights, customer preferences, site visit notes, or competitor quotes..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
                    />
                  </div>

                  <Button
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                    className="w-full h-10 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white gap-2 shadow-sm"
                  >
                    {isSavingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Save Notes & Update Stage</span>
                  </Button>
                </div>
              )}

              {/* TAB 4: Call History */}
              {activeTab === "calls" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Telephone conversations logged with this prospect
                    </span>
                    <Link href={`/calls?leadId=${lead.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs font-medium text-orange-600 border-orange-200 hover:bg-orange-50 gap-1">
                        <span>Open in Call Center</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>

                  {priorCalls.length > 0 ? (
                    <div className="space-y-3">
                      {priorCalls.map((call) => (
                        <div key={call.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {new Date(call.created_at).toLocaleDateString()} at{" "}
                              {new Date(call.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
                              {call.status} ({call.duration_seconds}s)
                            </span>
                          </div>
                          {call.call_outcomes?.summary && (
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                              {cleanLeadNotes(call.call_outcomes.summary)}
                            </p>
                          )}
                          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Disposition: {call.call_outcomes?.disposition || "Connected"}</span>
                            <Link href={`/calls?leadId=${lead.id}`} className="text-orange-600 font-semibold hover:underline">
                              View Full Transcript
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 rounded-2xl border border-dashed border-slate-200 p-6 space-y-2">
                      <PhoneCall className="h-8 w-8 text-slate-300 mx-auto" />
                      <div className="text-xs font-bold text-slate-700">No calls dispatched yet</div>
                      <p className="text-[11px] text-slate-500">
                        You can prepare and launch an AI voice conversation directly from the Call Center.
                      </p>
                      <Link href={`/calls?leadId=${lead.id}`}>
                        <Button size="sm" className="mt-2 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white">
                          Start Call in Call Center
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
