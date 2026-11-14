"use client";

import React, { useState } from "react";
import {
  Clock,
  ShieldAlert,
  Calendar,
  Sparkles,
  MessageSquare,
  Workflow,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CallSummaryView, type CallIntelligenceViewData } from "./call-summary-view";
import { LeadScoreBreakdownCard, type LeadScoreBreakdownData } from "./lead-score-breakdown-card";
import { ConversationEvidenceWorkspace, type TranscriptSegmentItem } from "./conversation-evidence-workspace";
import { TasksWorkspace, type FollowUpTaskItem } from "./tasks-workspace";
import { formatDuration, formatPhoneNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface CallDetailData {
  id: string;
  organizationId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  status: string;
  durationSeconds: number;
  recordingUrl?: string | null;
  createdAt: string;
  lead?: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    temperature: string;
    status: string;
    score: number;
    do_not_call: boolean;
  } | null;
  transcriptSegments: TranscriptSegmentItem[];
  outcome?: {
    business_outcome?: string;
    compliance_state?: string;
    escalation_state?: string;
    sentiment?: string;
    confidence_score?: number;
    summary?: string;
    intelligence_data?: Record<string, unknown>;
  } | null;
  leadScoring?: {
    total_score?: number | null;
    classification?: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
    evidence_coverage?: number;
    extraction_confidence?: number;
    scoring_factors?: Record<string, unknown>;
    unresolved_unknowns?: string[];
    analysis_version?: number;
    scoring_version?: string;
  } | null;
  tasks?: FollowUpTaskItem[];
  automationRuns?: Array<{
    id: string;
    automation_id: string;
    idempotency_key: string;
    status: string;
    attempt_count: number;
    last_error?: string | null;
    created_at: string;
  }>;
  analysisJob?: {
    id: string;
    status: string;
    analysis_version: number;
    attempts: number;
    last_error?: string | null;
  } | null;
}

interface CallDetailWorkspaceProps {
  call: CallDetailData;
  onClose?: () => void;
  onRefresh?: () => void;
  className?: string;
}

export function CallDetailWorkspace({
  call,
  onClose,
  onRefresh,
  className,
}: CallDetailWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"INTELLIGENCE" | "TRANSCRIPT" | "OPERATIONS">("INTELLIGENCE");
  const [highlightSegmentId, setHighlightSegmentId] = useState<string | null>(null);
  const [highlightQuote, setHighlightQuote] = useState<string | null>(null);

  const {
    customerName = "Anonymous Caller",
    customerPhone,
    durationSeconds = 0,
    recordingUrl,
    createdAt,
    lead,
    transcriptSegments = [],
    outcome,
    leadScoring,
    tasks = [],
    automationRuns = [],
    analysisJob,
  } = call;

  const isDnc =
    lead?.do_not_call === true ||
    outcome?.compliance_state === "DNC_REQUESTED" ||
    outcome?.compliance_state === "DNC_REGISTERED";

  const isEscalation =
    outcome?.escalation_state === "REQUESTED" ||
    outcome?.escalation_state === "FOLLOW_UP_PENDING";

  // Handle clicking evidence quote from summary: switches tab to transcript and focuses target turn
  const handleSelectEvidence = (segmentId: string, quote?: string) => {
    setHighlightSegmentId(segmentId);
    setHighlightQuote(quote || null);
    setActiveTab("TRANSCRIPT");
  };

  // Format intelligence data
  const intelligenceData = (outcome?.intelligence_data || {}) as Record<string, unknown>;
  const intelligenceViewData: CallIntelligenceViewData = {
    summary: outcome?.summary,
    businessOutcome: outcome?.business_outcome,
    complianceState: outcome?.compliance_state,
    escalationState: outcome?.escalation_state,
    sentiment: outcome?.sentiment,
    customerIntent: intelligenceData.customerIntent as CallIntelligenceViewData["customerIntent"],
    customerRequirements: intelligenceData.customerRequirements as CallIntelligenceViewData["customerRequirements"],
    productServiceInterest: intelligenceData.productServiceInterest as CallIntelligenceViewData["productServiceInterest"],
    budget: intelligenceData.budget as CallIntelligenceViewData["budget"],
    purchaseTimeline: intelligenceData.purchaseTimeline as CallIntelligenceViewData["purchaseTimeline"],
    locationRequirements: intelligenceData.locationRequirements as CallIntelligenceViewData["locationRequirements"],
    customerObjections: intelligenceData.customerObjections as CallIntelligenceViewData["customerObjections"],
    competitorMentions: intelligenceData.competitorMentions as CallIntelligenceViewData["competitorMentions"],
    buyingSignals: intelligenceData.buyingSignals as CallIntelligenceViewData["buyingSignals"],
    customerQuestions: intelligenceData.customerQuestions as CallIntelligenceViewData["customerQuestions"],
    unresolvedQuestions: intelligenceData.unresolvedQuestions as CallIntelligenceViewData["unresolvedQuestions"],
    recommendedNextAction: intelligenceData.recommendedNextAction as CallIntelligenceViewData["recommendedNextAction"],
  };

  const leadScoreData: LeadScoreBreakdownData = {
    totalScore: leadScoring?.total_score ?? lead?.score ?? null,
    classification: (leadScoring?.classification as LeadScoreBreakdownData["classification"]) ?? (lead?.temperature as LeadScoreBreakdownData["classification"]) ?? "UNCLASSIFIED",
    evidenceCoverage: leadScoring?.evidence_coverage ?? 0.8,
    extractionConfidence: leadScoring?.extraction_confidence ?? 0.95,
    analysisVersion: leadScoring?.analysis_version ?? 1,
    scoringVersion: leadScoring?.scoring_version ?? "v1.0",
    isDnc,
    scoringFactors: (leadScoring?.scoring_factors || {}) as unknown as LeadScoreBreakdownData["scoringFactors"],
    unresolvedUnknowns: leadScoring?.unresolved_unknowns || [],
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Top Header Card */}
      <Card className="border-[#222C3E] bg-[#0E131F]">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-white">
                  {customerName || "Customer Call"}
                </h2>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {customerPhone ? formatPhoneNumber(customerPhone) : "Phone unlisted"}
                </span>

                {/* Outcome Badges */}
                {outcome?.business_outcome && (
                  <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-xs font-semibold">
                    {outcome.business_outcome}
                  </Badge>
                )}

                {isDnc && (
                  <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs font-semibold gap-1">
                    <ShieldAlert className="h-3 w-3" /> DNC Opt-Out
                  </Badge>
                )}

                {isEscalation && (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-semibold gap-1">
                    <AlertTriangle className="h-3 w-3" /> Escalation Requested
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Duration: {formatDuration(durationSeconds)}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  {new Date(createdAt).toLocaleString()}
                </span>
                {analysisJob && (
                  <span className="text-[11px] font-mono text-slate-400">
                    Job: <span className="text-indigo-400">{analysisJob.status}</span> (v{analysisJob.analysis_version})
                  </span>
                )}
              </div>
            </div>

            {/* Actions & Tab Switcher */}
            <div className="flex items-center gap-2 self-start md:self-center">
              {onRefresh && (
                <Button size="sm" variant="outline" onClick={onRefresh} className="h-8 text-xs border-slate-700">
                  <RotateCcw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              )}
              {onClose && (
                <Button size="sm" variant="ghost" onClick={onClose} className="h-8 text-xs text-slate-400">
                  Back to List
                </Button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex items-center gap-1 border-t border-[#222C3E] pt-3">
            {[
              { id: "INTELLIGENCE" as const, label: "AI Intelligence & Scoring", icon: Sparkles },
              { id: "TRANSCRIPT" as const, label: "Evidence Transcript", icon: MessageSquare },
              { id: "OPERATIONS" as const, label: `Tasks & Automations (${tasks.length + automationRuns.length})`, icon: Workflow },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    activeTab === tab.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tab 1: AI Intelligence & Scoring */}
      {activeTab === "INTELLIGENCE" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <CallSummaryView
              intelligence={intelligenceViewData}
              onSelectEvidence={handleSelectEvidence}
            />
          </div>
          <div className="lg:col-span-1">
            <LeadScoreBreakdownCard
              data={leadScoreData}
              onSelectEvidence={handleSelectEvidence}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Conversation Evidence Workspace */}
      {activeTab === "TRANSCRIPT" && (
        <ConversationEvidenceWorkspace
          segments={transcriptSegments}
          recordingUrl={recordingUrl}
          highlightSegmentId={highlightSegmentId}
          highlightQuote={highlightQuote}
        />
      )}

      {/* Tab 3: Operations (Tasks & Automation Runs) */}
      {activeTab === "OPERATIONS" && (
        <div className="space-y-5">
          {/* Follow-up Tasks */}
          <TasksWorkspace tasks={tasks} onTaskUpdated={onRefresh} />

          {/* Automation Runs Audit */}
          <Card className="border-[#222C3E] bg-[#0E131F]">
            <CardHeader className="p-4 pb-2 border-b border-[#222C3E]">
              <CardTitle className="text-sm font-semibold text-white">
                Durable Automation Execution History ({automationRuns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {automationRuns.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No business automation runs for this session.</p>
              ) : (
                automationRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between rounded-lg border border-[#222C3E] bg-[#121824] p-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-mono text-slate-300 text-[11px]">{run.idempotency_key}</p>
                      <p className="text-[10px] text-slate-500">
                        Attempts: {run.attempt_count} • Executed: {new Date(run.created_at).toLocaleString()}
                      </p>
                      {run.last_error && (
                        <p className="text-[10px] text-rose-400 font-mono">Error: {run.last_error}</p>
                      )}
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] uppercase font-bold",
                        run.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                        run.status === "SKIPPED_DNC" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                        "bg-rose-500/10 text-rose-400 border-rose-500/30"
                      )}
                    >
                      {run.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

