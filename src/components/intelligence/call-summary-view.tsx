"use client";

import React from "react";
import {
  FileText,
  Target,
  Wrench,
  Package,
  IndianRupee,
  Calendar,
  MapPin,
  AlertCircle,
  Users,
  Sparkles,
  HelpCircle,
  ArrowRightCircle,
  Quote,
  CheckCircle,
  Clock,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface IntelligenceItem {
  value: string;
  exactQuote?: string;
  evidenceSegmentIds?: string[];
  confidence?: number;
  verificationState?: "VERIFIED" | "INFERRED" | "UNKNOWN" | "REJECTED";
}

export interface CallIntelligenceViewData {
  summary?: string | null;
  businessOutcome?: string;
  complianceState?: string;
  escalationState?: string;
  sentiment?: string;
  customerIntent?: IntelligenceItem | null;
  customerRequirements?: IntelligenceItem[];
  productServiceInterest?: IntelligenceItem | null;
  budget?: IntelligenceItem | null;
  purchaseTimeline?: IntelligenceItem | null;
  locationRequirements?: IntelligenceItem | null;
  customerObjections?: IntelligenceItem[];
  competitorMentions?: IntelligenceItem[];
  buyingSignals?: IntelligenceItem[];
  customerQuestions?: IntelligenceItem[];
  unresolvedQuestions?: IntelligenceItem[];
  recommendedNextAction?: IntelligenceItem | null;
}

interface CallSummaryViewProps {
  intelligence: CallIntelligenceViewData;
  onSelectEvidence?: (segmentId: string, quote?: string) => void;
  className?: string;
}

export function CallSummaryView({
  intelligence,
  onSelectEvidence,
  className,
}: CallSummaryViewProps) {
  const {
    summary = "No conversation summary available.",
    businessOutcome,
    complianceState,
    escalationState,
    sentiment,
    customerIntent,
    customerRequirements = [],
    productServiceInterest,
    budget,
    purchaseTimeline,
    locationRequirements,
    customerObjections = [],
    competitorMentions = [],
    buyingSignals = [],
    customerQuestions = [],
    unresolvedQuestions = [],
    recommendedNextAction,
  } = intelligence;

  const renderStatusBadge = (state?: string) => {
    switch (state) {
      case "VERIFIED":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] gap-1 py-0">
            <CheckCircle className="h-2.5 w-2.5" /> Verified
          </Badge>
        );
      case "INFERRED":
        return (
          <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px] gap-1 py-0">
            <Eye className="h-2.5 w-2.5" /> Inferred
          </Badge>
        );
      case "UNRESOLVED":
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] gap-1 py-0">
            <Clock className="h-2.5 w-2.5" /> Unresolved
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-700/40 text-slate-400 border-slate-700 text-[10px] py-0">
            Unknown
          </Badge>
        );
    }
  };

  const renderClaimRow = (
    label: string,
    icon: React.ReactNode,
    item?: IntelligenceItem | null,
    fallbackText = "Not mentioned by customer"
  ) => {
    const hasValue = Boolean(item && item.value && item.value.trim());
    const quote = item?.exactQuote;
    const segmentId = item?.evidenceSegmentIds?.[0];

    return (
      <div className="rounded-lg border border-[#222C3E]/80 bg-[#121824]/60 p-3 space-y-1.5 transition hover:border-[#222C3E]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {icon}
            <span className="font-medium text-slate-300">{label}</span>
          </div>
          {hasValue ? renderStatusBadge(item?.verificationState || "VERIFIED") : renderStatusBadge("UNKNOWN")}
        </div>

        <p className={cn("text-xs font-semibold", hasValue ? "text-white" : "text-slate-500 italic")}>
          {hasValue ? item!.value : fallbackText}
        </p>

        {quote && (
          <div className="flex items-start gap-1.5 rounded bg-[#182132]/60 px-2 py-1 text-[11px] text-slate-300">
            <Quote className="h-3 w-3 shrink-0 text-indigo-400 mt-0.5" />
            <span className="italic flex-1">&ldquo;{quote}&rdquo;</span>
            {segmentId && onSelectEvidence && (
              <button
                type="button"
                onClick={() => onSelectEvidence(segmentId, quote)}
                className="shrink-0 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 underline"
              >
                Jump to Turn
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMultiList = (
    label: string,
    icon: React.ReactNode,
    items: IntelligenceItem[],
    emptyText = "None detected in conversation"
  ) => {
    return (
      <div className="rounded-lg border border-[#222C3E]/80 bg-[#121824]/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {icon}
            <span className="font-medium text-slate-300">{label}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-slate-500 italic">{emptyText}</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((it, idx) => (
              <div key={idx} className="rounded bg-[#182132]/40 p-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">{it.value}</span>
                  {renderStatusBadge(it.verificationState || "VERIFIED")}
                </div>
                {it.exactQuote && (
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-300">
                    <Quote className="h-3 w-3 shrink-0 text-indigo-400 mt-0.5" />
                    <span className="italic flex-1">&ldquo;{it.exactQuote}&rdquo;</span>
                    {it.evidenceSegmentIds?.[0] && onSelectEvidence && (
                      <button
                        type="button"
                        onClick={() => onSelectEvidence(it.evidenceSegmentIds![0], it.exactQuote)}
                        className="shrink-0 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Jump
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Executive Summary Card */}
      <Card className="border-[#222C3E] bg-[#0E131F]">
        <CardHeader className="p-4 pb-2 border-b border-[#222C3E]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-400" />
              <CardTitle className="text-sm font-semibold text-white">
                Executive Conversation Summary
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {businessOutcome && (
                <Badge variant="outline" className="text-[10px] font-semibold border-indigo-500/40 bg-indigo-500/10 text-indigo-300">
                  {businessOutcome}
                </Badge>
              )}
              {complianceState && complianceState !== "NONE" && (
                <Badge variant="outline" className="text-[10px] font-semibold border-rose-500/40 bg-rose-500/10 text-rose-300">
                  {complianceState}
                </Badge>
              )}
              {escalationState && escalationState !== "NONE" && (
                <Badge variant="outline" className="text-[10px] font-semibold border-amber-500/40 bg-amber-500/10 text-amber-300">
                  {escalationState}
                </Badge>
              )}
              {sentiment && (
                <Badge variant="outline" className="text-[10px] font-semibold border-slate-700 text-slate-300">
                  {sentiment}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs leading-relaxed text-slate-200">
            {summary}
          </p>

          {/* Recommended Next Action Banner */}
          {recommendedNextAction?.value && (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
              <ArrowRightCircle className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <div>
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                  Recommended Next Action:
                </span>
                <p className="font-semibold text-indigo-200 mt-0.5">
                  {recommendedNextAction.value}
                </p>
                {recommendedNextAction.exactQuote && (
                  <p className="italic text-[11px] text-indigo-300/80 mt-1">
                    &ldquo;{recommendedNextAction.exactQuote}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 13 Structured Intelligence Dimensions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Customer Intent */}
        {renderClaimRow("Primary Customer Intent", <Target className="h-3.5 w-3.5 text-indigo-400" />, customerIntent)}

        {/* Product / Service Interest */}
        {renderClaimRow("Product & Service Interest", <Package className="h-3.5 w-3.5 text-sky-400" />, productServiceInterest)}

        {/* Budget Readiness */}
        {renderClaimRow("Budget & Monthly Energy Spend", <IndianRupee className="h-3.5 w-3.5 text-emerald-400" />, budget)}

        {/* Purchase Timeline */}
        {renderClaimRow("Target Purchase Timeline", <Calendar className="h-3.5 w-3.5 text-amber-400" />, purchaseTimeline)}

        {/* Location & Property Fit */}
        {renderClaimRow("Location & Property Fit", <MapPin className="h-3.5 w-3.5 text-purple-400" />, locationRequirements)}

        {/* Customer Requirements List */}
        {renderMultiList("Technical Requirements", <Wrench className="h-3.5 w-3.5 text-cyan-400" />, customerRequirements)}

        {/* Buying Signals */}
        {renderMultiList("Verified Buying Signals", <Sparkles className="h-3.5 w-3.5 text-emerald-400" />, buyingSignals)}

        {/* Customer Objections */}
        {renderMultiList("Customer Objections Raised", <AlertCircle className="h-3.5 w-3.5 text-amber-400" />, customerObjections)}

        {/* Competitor Mentions */}
        {renderMultiList("Competitor Mentions", <Users className="h-3.5 w-3.5 text-rose-400" />, competitorMentions)}

        {/* Customer Questions */}
        {renderMultiList("Questions Asked by Customer", <HelpCircle className="h-3.5 w-3.5 text-blue-400" />, customerQuestions)}

        {/* Unresolved Questions */}
        {renderMultiList("Unresolved Inquiries (Needs Staff Review)", <Clock className="h-3.5 w-3.5 text-amber-400" />, unresolvedQuestions)}
      </div>
    </div>
  );
}

