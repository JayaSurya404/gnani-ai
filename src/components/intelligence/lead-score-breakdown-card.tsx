"use client";

import React from "react";
import {
  Flame,
  Zap,
  Snowflake,
  HelpCircle,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Quote,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ScoringFactorDetail {
  points: number;
  maxPoints: number;
  weight?: number;
  observedScore?: number;
  status: "VERIFIED" | "INFERRED" | "UNKNOWN" | "REJECTED";
  quote?: string | null;
  evidenceSegmentIds?: string[];
  notes?: string;
}

export interface LeadScoreBreakdownData {
  totalScore: number | null;
  classification: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
  evidenceCoverage: number;
  extractionConfidence: number;
  analysisVersion?: number;
  scoringVersion?: string;
  isDnc?: boolean;
  scoringFactors: {
    purchaseIntent?: ScoringFactorDetail;
    budgetReadiness?: ScoringFactorDetail;
    purchaseTimeline?: ScoringFactorDetail;
    technicalFit?: ScoringFactorDetail;
    customerEngagement?: ScoringFactorDetail;
    decisionAuthority?: ScoringFactorDetail;
    nextStepWillingness?: ScoringFactorDetail;
    [key: string]: ScoringFactorDetail | undefined;
  };
  unresolvedUnknowns?: string[];
}

interface LeadScoreBreakdownCardProps {
  data: LeadScoreBreakdownData;
  onSelectEvidence?: (segmentId: string, quote?: string) => void;
  className?: string;
}

const FACTOR_METADATA = [
  { key: "purchaseIntent", label: "Purchase Intent", max: 25, desc: "Need clarity, project motivation & energy problem" },
  { key: "budgetReadiness", label: "Budget Readiness", max: 20, desc: "Electricity bill, monthly spend & financing willingness" },
  { key: "purchaseTimeline", label: "Purchase Timeline", max: 15, desc: "Urgency, installation window & target timeframe" },
  { key: "technicalFit", label: "Technical / Property Fit", max: 15, desc: "Roof suitability, 3-phase grid & ownership structure" },
  { key: "customerEngagement", label: "Customer Engagement", max: 10, desc: "Call duration, responsiveness & question asking" },
  { key: "decisionAuthority", label: "Decision Authority", max: 10, desc: "Sole homeowner, joint family or business signer" },
  { key: "nextStepWillingness", label: "Next-Step Willingness", max: 5, desc: "Agreed to site survey, quotation or follow-up" },
] as const;

export function LeadScoreBreakdownCard({
  data,
  onSelectEvidence,
  className
}: LeadScoreBreakdownCardProps) {
  const {
    totalScore = 0,
    classification = "UNCLASSIFIED",
    evidenceCoverage = 0,
    extractionConfidence = 0,
    scoringFactors = {},
    unresolvedUnknowns = [],
    analysisVersion = 1,
    scoringVersion = "v1.0",
    isDnc = false
  } = data;

  const score = totalScore ?? 0;
  const coveragePct = Math.round((evidenceCoverage > 1 ? evidenceCoverage : evidenceCoverage * 100));
  const confidencePct = Math.round((extractionConfidence > 1 ? extractionConfidence : extractionConfidence * 100));

  // Visual meter color
  const getScoreColor = () => {
    if (score >= 70) return { text: "text-rose-400", bg: "bg-rose-500", border: "border-rose-500/30", badge: "bg-rose-500/10 text-rose-400 border-rose-500/30" };
    if (score >= 40) return { text: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500/30", badge: "bg-amber-500/10 text-amber-400 border-amber-500/30" };
    if (score > 0) return { text: "text-sky-400", bg: "bg-sky-500", border: "border-sky-500/30", badge: "bg-sky-500/10 text-sky-400 border-sky-500/30" };
    return { text: "text-slate-400", bg: "bg-slate-500", border: "border-slate-500/30", badge: "bg-slate-500/10 text-slate-400 border-slate-500/30" };
  };

  const colors = getScoreColor();

  const getClassificationIcon = () => {
    switch (classification) {
      case "HOT":
        return <Flame className="h-3.5 w-3.5 text-rose-400" />;
      case "WARM":
        return <Zap className="h-3.5 w-3.5 text-amber-400" />;
      case "COLD":
        return <Snowflake className="h-3.5 w-3.5 text-sky-400" />;
      default:
        return <HelpCircle className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <Card className={cn("border-[#222C3E] bg-[#0E131F]", className)}>
      <CardHeader className="p-4 pb-3 border-b border-[#222C3E]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-400" />
            <CardTitle className="text-sm font-semibold text-white">
              Explainable Lead Qualification Score
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-mono border-slate-700 text-slate-400">
              Analysis v{analysisVersion}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono border-slate-700 text-slate-400">
              Scoring {scoringVersion}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-5">
        {/* DNC Compliance State Banner: Kept separate from buying intent */}
        {isDnc && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">Do-Not-Call (DNC) Registered</p>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                Caller requested Do-Not-Call opt-out. Outbound marketing &amp; sales tasks are prohibited by regulatory policy. Intent scoring reflects actual customer statements before opt-out.
              </p>
            </div>
          </div>
        )}

        {/* Primary Score Summary Header */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border border-[#222C3E] bg-[#121824]">
          {/* Main Score Display */}
          <div className="flex items-center gap-3">
            <div className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border font-bold", colors.border, colors.badge)}>
              <span className={cn("text-2xl font-black tabular-nums", colors.text)}>{score}</span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400">/ 100</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                {getClassificationIcon()}
                <span className={cn("text-xs font-bold uppercase tracking-wider", colors.text)}>
                  {classification} LEAD
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {score >= 70 ? "High commercial probability" : score >= 40 ? "Moderate interest; needs nurturing" : "Low intent or unverified fit"}
              </p>
            </div>
          </div>

          {/* Evidence Coverage Ratio */}
          <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-[#222C3E] pt-2 sm:pt-0 sm:pl-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Evidence Coverage</span>
              <span className="font-mono font-bold text-white tabular-nums">{coveragePct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#182132]">
              <div
                className="h-1.5 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, coveragePct))}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Observed vs unstated dimensions</p>
          </div>

          {/* Extraction Confidence */}
          <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-[#222C3E] pt-2 sm:pt-0 sm:pl-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Extraction Confidence</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">{confidencePct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#182132]">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, confidencePct))}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Model certainty on grounded quotes</p>
          </div>
        </div>

        {/* 7 Scoring Factors Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Factor-by-Factor Points Breakdown
            </h4>
            <span className="text-[10px] text-slate-500">7 Core Qualification Dimensions</span>
          </div>

          <div className="space-y-2">
            {FACTOR_METADATA.map((factor) => {
              const factorData = scoringFactors[factor.key];
              const pointsEarned = factorData?.points ?? 0;
              const maxPoints = factor.max;
              const isUnknown = !factorData || factorData.status === "UNKNOWN" || pointsEarned === 0;
              const pct = Math.round((pointsEarned / maxPoints) * 100);
              const quote = factorData?.quote;
              const segmentId = factorData?.evidenceSegmentIds?.[0];

              return (
                <div
                  key={factor.key}
                  className="rounded-lg border border-[#222C3E]/80 bg-[#121824]/60 p-2.5 transition hover:border-[#222C3E] hover:bg-[#121824]"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {isUnknown ? (
                        <span className="inline-block h-2 w-2 rounded-full bg-slate-600" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      )}
                      <span className={cn("font-medium", isUnknown ? "text-slate-400" : "text-white")}>
                        {factor.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isUnknown ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-700 bg-slate-800/40 text-slate-400 font-mono">
                          UNKNOWN (0 pts)
                        </Badge>
                      ) : (
                        <span className="font-mono text-xs font-bold text-white tabular-nums">
                          {pointsEarned} <span className="text-slate-500 font-normal">/ {maxPoints}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Factor Progress Bar */}
                  <div className="mt-1.5 h-1 w-full rounded-full bg-[#182132]">
                    <div
                      className={cn(
                        "h-1 rounded-full transition-all",
                        isUnknown ? "bg-slate-700" : pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-sky-500"
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, isUnknown ? 0 : pct))}%` }}
                    />
                  </div>

                  {/* Supporting Grounded Quote if present */}
                  {quote ? (
                    <div className="mt-2 flex items-start gap-1.5 rounded bg-[#182132]/60 px-2 py-1 text-[11px] text-slate-300">
                      <Quote className="h-3 w-3 shrink-0 text-indigo-400 mt-0.5" />
                      <span className="italic flex-1">&ldquo;{quote}&rdquo;</span>
                      {segmentId && onSelectEvidence && (
                        <button
                          type="button"
                          onClick={() => onSelectEvidence(segmentId, quote)}
                          className="shrink-0 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 underline"
                        >
                          View Transcript
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Missing Information / Unresolved Unknowns */}
        {unresolvedUnknowns && unresolvedUnknowns.length > 0 && (
          <div className="rounded-lg border border-slate-700/60 bg-[#121824]/40 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Unresolved Unknowns &amp; Information Gaps ({unresolvedUnknowns.length})</span>
            </div>
            <p className="text-[11px] text-slate-400">
              The conversation concluded without definitive facts on the following items. Recommended for follow-up inquiry:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5 pl-1 pt-1">
              {unresolvedUnknowns.map((unknown, idx) => (
                <li key={idx} className="font-mono text-slate-300">{unknown}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

