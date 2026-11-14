"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Search,
  ArrowUpDown,
  Sparkles,
  PhoneCall,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CallStatusPill } from "@/components/ui/status-pill";
import { CallDetailWorkspace, type CallDetailData } from "@/components/intelligence/call-detail-workspace";
import { formatDuration, formatPhoneNumber } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

export interface CallListItem {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  duration_seconds?: number | null;
  status?: string;
  created_at?: string;
  call_outcomes?: Array<{
    business_outcome?: string;
    compliance_state?: string;
    escalation_state?: string;
    summary?: string | null;
    sentiment?: string | null;
    confidence_score?: number | null;
  }>;
  leads?: {
    name?: string | null;
    phone?: string | null;
    temperature?: string | null;
    score?: number | null;
    do_not_call?: boolean;
  } | null;
  call_analysis_jobs?: Array<{
    status?: string;
    attempts?: number;
  }>;
}

export default function HistoryPage() {
  const storeCalls = useWorkspaceStore((state) => state.calls);

  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedCallDetail, setSelectedCallDetail] = useState<CallDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [dncOnly, setDncOnly] = useState(false);
  const [escalationOnly, setEscalationOnly] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "duration">("createdAt");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch calls from API
  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "15",
        sortBy,
        sortOrder,
      });

      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      if (temperatureFilter !== "ALL") params.set("temperature", temperatureFilter);
      if (dncOnly) params.set("isDnc", "true");
      if (escalationOnly) params.set("isEscalation", "true");

      const res = await fetch(`/api/calls?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success && data.calls) {
        if (data.calls.length > 0) {
          setCalls(data.calls);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalCount(data.pagination?.total || data.calls.length);
        } else {
          // If server database is empty, fall back to synthetic store calls for seamless demo
          setCalls(storeCalls.map((c) => ({
            id: c.id,
            customer_name: c.leadName,
            customer_phone: c.leadPhone,
            duration_seconds: c.durationSeconds,
            status: c.status,
            created_at: c.createdAt,
            call_outcomes: [{
              business_outcome: "QUALIFIED",
              compliance_state: "NONE",
              escalation_state: "NONE",
              summary: c.summary,
              sentiment: "POSITIVE",
              confidence_score: 0.92
            }],
            leads: {
              name: c.leadName,
              phone: c.leadPhone,
              temperature: "HOT",
              score: 85,
              do_not_call: false
            }
          })));
          setTotalPages(1);
          setTotalCount(storeCalls.length);
        }
      }
    } catch {
      // Fallback on network/DB failure
      setCalls(storeCalls.map((c) => ({
        id: c.id,
        customer_name: c.leadName,
        customer_phone: c.leadPhone,
        duration_seconds: c.durationSeconds,
        status: c.status,
        created_at: c.createdAt,
        call_outcomes: [{
          business_outcome: "QUALIFIED",
          compliance_state: "NONE",
          escalation_state: "NONE",
          summary: c.summary,
          sentiment: "POSITIVE",
          confidence_score: 0.92
        }],
        leads: {
          name: c.leadName,
          phone: c.leadPhone,
          temperature: "HOT",
          score: 85,
          do_not_call: false
        }
      })));
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, searchTerm, outcomeFilter, temperatureFilter, dncOnly, escalationOnly, storeCalls]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      limit: "15",
      sortBy,
      sortOrder,
    });

    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
    if (temperatureFilter !== "ALL") params.set("temperature", temperatureFilter);
    if (dncOnly) params.set("isDnc", "true");
    if (escalationOnly) params.set("isEscalation", "true");

    fetch(`/api/calls?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.success && data?.calls) {
          if (data.calls.length > 0) {
            setCalls(data.calls);
            setTotalPages(data.pagination?.totalPages || 1);
            setTotalCount(data.pagination?.total || data.calls.length);
          }
        }
      })
      .catch(() => {
        if (!active) return;
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, sortBy, sortOrder, searchTerm, outcomeFilter, temperatureFilter, dncOnly, escalationOnly]);

  // Fetch full details for selected call
  const handleSelectCall = useCallback(async (callId: string) => {
    setSelectedCallId(callId);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/calls/${callId}`);
      const data = await res.json();
      if (res.ok && data.success && data.call) {
        setSelectedCallDetail({
          id: data.call.id,
          organizationId: data.call.organization_id,
          customerName: data.call.customer_name,
          customerPhone: data.call.customer_phone,
          status: data.call.status,
          durationSeconds: data.call.duration_seconds || 0,
          recordingUrl: data.call.recording_url,
          createdAt: data.call.created_at,
          lead: data.call.lead,
          transcriptSegments: (data.call.transcriptSegments || []).map((s: {
            id: string;
            speaker: string;
            text: string;
            language?: string;
            confidence?: number;
            start_offset_ms?: number;
            end_offset_ms?: number;
            created_at?: string;
          }) => ({
            id: s.id,
            speaker: s.speaker,
            text: s.text,
            language: s.language,
            confidence: s.confidence,
            startOffsetMs: s.start_offset_ms,
            endOffsetMs: s.end_offset_ms,
            createdAt: s.created_at
          })),
          outcome: data.call.outcome,
          leadScoring: data.call.leadScoring,
          tasks: (data.call.tasks || []).map((t: {
            id: string;
            title: string;
            description?: string | null;
            due_date?: string | null;
            priority?: string;
            status?: string;
            assigned_to?: string | null;
            created_at?: string;
          }) => ({
            id: t.id,
            organizationId: data.call.organization_id,
            title: t.title,
            description: t.description,
            dueDate: t.due_date,
            priority: t.priority,
            status: t.status,
            assignedTo: t.assigned_to,
            createdAt: t.created_at
          })),
          automationRuns: data.call.automationRuns || [],
          analysisJob: data.call.analysisJob || null
        });
      } else {
        // Fallback for store demo call
        const found = storeCalls.find((c) => c.id === callId);
        if (found) {
          setSelectedCallDetail({
            id: found.id,
            organizationId: "default",
            customerName: found.leadName,
            customerPhone: found.leadPhone,
            status: found.status,
            durationSeconds: found.durationSeconds,
            createdAt: found.createdAt,
            lead: {
              id: "lead-demo",
              name: found.leadName,
              phone: found.leadPhone,
              temperature: "HOT",
              status: "QUALIFIED",
              score: 90,
              do_not_call: false
            },
            transcriptSegments: [
              { id: "s-1", speaker: "AI", text: "Hello! This is VoiceNexus AI calling on behalf of Kaveri Solar & Construction.", startOffsetMs: 0, endOffsetMs: 3500 },
              { id: "s-2", speaker: "CUSTOMER", text: "Hi, I inquired about 5kW rooftop solar for my home with ₹8,500 monthly bill. Please call me tomorrow evening.", startOffsetMs: 3600, endOffsetMs: 9200 },
              { id: "s-3", speaker: "AI", text: "Understood! We can schedule a technician site survey and share the PM Surya Ghar subsidy estimate.", startOffsetMs: 9500, endOffsetMs: 14000 }
            ],
            outcome: {
              business_outcome: "QUALIFIED",
              compliance_state: "NONE",
              escalation_state: "NONE",
              sentiment: "POSITIVE",
              confidence_score: 0.95,
              summary: found.summary,
              intelligence_data: {
                customerIntent: { value: "5kW rooftop solar", exactQuote: "5kW rooftop solar for my home", verificationState: "VERIFIED" },
                budget: { value: "₹8,500 monthly bill", exactQuote: "₹8,500 monthly bill", verificationState: "VERIFIED" },
                purchaseTimeline: { value: "Tomorrow evening", exactQuote: "call me tomorrow evening", verificationState: "VERIFIED" },
                buyingSignals: [{ value: "Requested site survey", exactQuote: "schedule inspection", verificationState: "VERIFIED" }],
                recommendedNextAction: { value: "Schedule site inspection", exactQuote: "technician site survey", verificationState: "VERIFIED" }
              }
            },
            leadScoring: {
              total_score: 88,
              classification: "HOT",
              evidence_coverage: 0.85,
              extraction_confidence: 0.95,
              analysis_version: 1,
              scoring_version: "v1.0",
              scoring_factors: {
                purchaseIntent: { points: 25, maxPoints: 25, status: "VERIFIED", quote: "5kW rooftop solar for my home" },
                budgetReadiness: { points: 20, maxPoints: 20, status: "VERIFIED", quote: "₹8,500 monthly bill" },
                purchaseTimeline: { points: 15, maxPoints: 15, status: "VERIFIED", quote: "call me tomorrow evening" }
              }
            },
            tasks: [
              {
                id: "task-1",
                organizationId: "default",
                title: "Scheduled Callback: " + found.leadName,
                description: "[Scheduling Note: APPROXIMATE TIME WINDOW — Customer requested tomorrow evening]\nFollow-up consultation",
                dueDate: "2026-11-14T18:00:00.000Z",
                priority: "HIGH",
                status: "PENDING"
              }
            ],
            automationRuns: [
              {
                id: "run-1",
                automation_id: "auto-1",
                idempotency_key: `auto:${callId}:rule-1:CREATE_FOLLOW_UP_TASK:task-1:v1`,
                status: "COMPLETED",
                attempt_count: 1,
                created_at: "2026-11-13T10:00:00.000Z"
              }
            ]
          });
        }
      }
    } catch {
      toast.error("Failed to load call details");
    } finally {
      setDetailLoading(false);
    }
  }, [storeCalls]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-indigo-400" />
            Call Intelligence Center
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit recorded conversations, AI summaries, transcript evidence, explainable lead qualification, and automated business workflows.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={fetchCalls}
          className="border-[#222C3E] text-xs h-9 gap-1.5 self-start sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refresh Calls
        </Button>
      </div>

      {/* If a call is selected or loading, display state or CallDetailWorkspace */}
      {detailLoading ? (
        <Card className="border-[#222C3E] bg-[#0E131F] p-12 text-center text-slate-400">
          <RotateCcw className="mx-auto h-8 w-8 animate-spin text-indigo-400 mb-2" />
          <p className="text-sm font-medium">Loading call intelligence and evidence...</p>
        </Card>
      ) : selectedCallDetail ? (
        <CallDetailWorkspace
          call={selectedCallDetail}
          onClose={() => {
            setSelectedCallId(null);
            setSelectedCallDetail(null);
          }}
          onRefresh={() => selectedCallId && handleSelectCall(selectedCallId)}
        />
      ) : (
        <>
          {/* Search & Filter Toolbar */}
          <Card className="border-[#222C3E] bg-[#0E131F] p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search caller name, phone number..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="h-8.5 pl-8 text-xs bg-[#121824] border-[#222C3E] text-slate-200"
                />
              </div>

              {/* Outcome Filter */}
              <div>
                <select
                  value={outcomeFilter}
                  onChange={(e) => {
                    setOutcomeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-8.5 w-full rounded-md border border-[#222C3E] bg-[#121824] px-2 text-xs text-slate-300"
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="FOLLOW_UP_REQUIRED">Follow-Up Required</option>
                  <option value="INFORMATIONAL_COMPLETE">Informational Complete</option>
                  <option value="NOT_INTERESTED">Not Interested</option>
                  <option value="WRONG_NUMBER">Wrong Number</option>
                  <option value="UNRESOLVED">Unresolved</option>
                </select>
              </div>

              {/* Lead Temperature Filter */}
              <div>
                <select
                  value={temperatureFilter}
                  onChange={(e) => {
                    setTemperatureFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-8.5 w-full rounded-md border border-[#222C3E] bg-[#121824] px-2 text-xs text-slate-300"
                >
                  <option value="ALL">All Temperatures</option>
                  <option value="HOT">Hot Leads</option>
                  <option value="WARM">Warm Leads</option>
                  <option value="COLD">Cold Leads</option>
                </select>
              </div>

              {/* Toggle Compliance & Escalation Filters */}
              <div className="flex items-center gap-1.5 lg:col-span-2">
                <Button
                  size="sm"
                  variant={dncOnly ? "default" : "outline"}
                  onClick={() => {
                    setDncOnly(!dncOnly);
                    setPage(1);
                  }}
                  className={`h-8 text-xs px-2.5 ${dncOnly ? "bg-rose-600 text-white" : "border-[#222C3E] text-slate-400"}`}
                >
                  <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                  DNC Only
                </Button>

                <Button
                  size="sm"
                  variant={escalationOnly ? "default" : "outline"}
                  onClick={() => {
                    setEscalationOnly(!escalationOnly);
                    setPage(1);
                  }}
                  className={`h-8 text-xs px-2.5 ${escalationOnly ? "bg-amber-600 text-white" : "border-[#222C3E] text-slate-400"}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Escalated
                </Button>

                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as "createdAt" | "duration");
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-[#222C3E] bg-[#121824] px-2 text-xs text-slate-300 ml-auto"
                >
                  <option value="createdAt">Date</option>
                  <option value="duration">Duration</option>
                </select>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                  }}
                  className="h-8 text-xs text-slate-400"
                >
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  {sortOrder === "desc" ? "Desc" : "Asc"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Calls List Table / Cards */}
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 w-full animate-pulse rounded-xl border border-[#222C3E] bg-[#121824]" />
                ))}
              </div>
            ) : calls.length === 0 ? (
              <Card className="border-[#222C3E] bg-[#0E131F] p-12 text-center text-slate-400">
                <PhoneCall className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                <h3 className="text-sm font-semibold text-white">No call records found</h3>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search terms.</p>
              </Card>
            ) : (
              calls.map((call) => {
                const outcomeObj = Array.isArray(call.call_outcomes)
                  ? call.call_outcomes[0]
                  : call.call_outcomes;
                const leadObj = call.leads;
                const isDnc =
                  leadObj?.do_not_call === true ||
                  outcomeObj?.compliance_state === "DNC_REQUESTED" ||
                  outcomeObj?.compliance_state === "DNC_REGISTERED";
                const isEscalation =
                  outcomeObj?.escalation_state === "REQUESTED" ||
                  outcomeObj?.escalation_state === "FOLLOW_UP_PENDING";
                const score = leadObj?.score ?? (outcomeObj?.confidence_score ? Math.round(outcomeObj.confidence_score * 100) : null);

                return (
                  <Card
                    key={call.id}
                    onClick={() => handleSelectCall(call.id)}
                    className="cursor-pointer border-[#222C3E] bg-[#0E131F] p-4 transition hover:border-indigo-500/60 hover:bg-[#121824] hover:shadow-lg hover:shadow-indigo-500/5"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="text-sm font-bold text-white hover:text-indigo-300">
                            {call.customer_name || leadObj?.name || "Anonymous Customer"}
                          </h4>
                          <span className="font-mono text-xs text-slate-400 tabular-nums">
                            {call.customer_phone ? formatPhoneNumber(call.customer_phone) : "Unlisted"}
                          </span>

                          <CallStatusPill status={(call.status || "COMPLETED") as "INITIATING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"} />

                          {outcomeObj?.business_outcome && (
                            <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold">
                              {outcomeObj.business_outcome}
                            </Badge>
                          )}

                          {isDnc && (
                            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] gap-1 font-semibold">
                              <ShieldAlert className="h-2.5 w-2.5" /> DNC
                            </Badge>
                          )}

                          {isEscalation && (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
                              <AlertTriangle className="h-2.5 w-2.5" /> Escalated
                            </Badge>
                          )}
                        </div>

                        {outcomeObj?.summary && (
                          <p className="text-xs text-slate-300 line-clamp-1">
                            {outcomeObj.summary}
                          </p>
                        )}
                      </div>

                      {/* Right metadata: duration, date, score */}
                      <div className="flex items-center gap-4 shrink-0 self-end md:self-center text-xs text-slate-400">
                        {score !== null && (
                          <div className="flex items-center gap-1.5 rounded-lg border border-[#222C3E] bg-[#121824] px-2.5 py-1">
                            <Sparkles className="h-3 w-3 text-indigo-400" />
                            <span className="font-mono font-bold text-white tabular-nums">{score}</span>
                            <span className="text-[10px] text-slate-500">/ 100</span>
                          </div>
                        )}

                        <span className="flex items-center gap-1 font-mono tabular-nums text-slate-300">
                          <Clock className="h-3 w-3 text-slate-500" />
                          {formatDuration(call.duration_seconds || 0)}
                        </span>

                        <span className="text-[11px] text-slate-500">
                          {call.created_at ? new Date(call.created_at).toLocaleDateString() : ""}
                        </span>

                        <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400 hover:text-indigo-300 p-0 font-medium">
                          Inspect &rarr;
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#222C3E] pt-3 text-xs text-slate-400">
              <span>Showing Page {page} of {totalPages} ({totalCount} total calls)</span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs border-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 text-xs border-slate-700"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
