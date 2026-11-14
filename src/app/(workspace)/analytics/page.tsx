"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  PhoneCall,
  CheckCircle2,
  Calendar,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Workflow,
  Users,
  Flame,
  Zap,
  Snowflake,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface AnalyticsMetrics {
  calls: {
    totalCalls: number;
    completedCalls: number;
    failedCalls: number;
    avgCallDurationSec: number;
    qualifiedCalls: number;
    qualificationRate: number;
    dncRegisteredCalls?: number;
    escalatedCalls?: number;
  };
  leads: {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    dncLeads?: number;
    distribution?: { HOT: number; WARM: number; COLD: number };
    unclassifiedLeads?: number;
  };
  operations: {
    pendingFollowUps: number;
    callbackTasks: number;
    completedTasks: number;
    dncRegistrations: number;
    escalationRequests: number;
  };
  automations: {
    totalRuns: number;
    completedRuns: number;
    skippedDncRuns: number;
    failedRuns: number;
    successRate: number;
  };
  intelligence: {
    totalAnalysisJobs: number;
    analysisProcessingFailures: number;
    outcomeDistribution: Record<string, number>;
  };
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<"7D" | "30D" | "90D" | "ALL">("30D");
  const [data, setData] = useState<AnalyticsMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}`);
      const result = await res.json();
      if (res.ok && result.success) {
        setData(result.metrics);
      }
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let active = true;
    fetch(`/api/analytics?range=${range}`)
      .then((res) => res.json())
      .then((result) => {
        if (!active) return;
        if (result?.success) {
          setData(result.metrics);
        }
      })
      .catch(() => {
        if (!active) return;
        toast.error("Failed to load analytics");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range]);

  const calls = data?.calls || {
    totalCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    avgCallDurationSec: 0,
    qualifiedCalls: 0,
    qualificationRate: 0,
  };

  const leads = data?.leads || {
    totalLeads: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    dncLeads: 0,
    distribution: { HOT: 0, WARM: 0, COLD: 0 },
  };

  const operations = data?.operations || {
    pendingFollowUps: 0,
    callbackTasks: 0,
    completedTasks: 0,
    dncRegistrations: 0,
    escalationRequests: 0,
  };

  const automations = data?.automations || {
    totalRuns: 0,
    completedRuns: 0,
    skippedDncRuns: 0,
    failedRuns: 0,
    successRate: 100,
  };

  const intelligence = data?.intelligence || {
    totalAnalysisJobs: 0,
    analysisProcessingFailures: 0,
    outcomeDistribution: {},
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-400" />
            Business &amp; Voice Intelligence Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit live conversation metrics, post-call qualification outcomes, lead distributions, and automation reliability.
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-1.5 self-start sm:self-center">
          <div className="flex items-center gap-1 rounded-xl border border-[#222C3E] bg-[#121824] p-1">
            {[
              { id: "7D" as const, label: "7 Days" },
              { id: "30D" as const, label: "30 Days" },
              { id: "90D" as const, label: "90 Days" },
              { id: "ALL" as const, label: "All Time" },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition",
                  range === r.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchAnalytics}
            disabled={loading}
            className="border-[#222C3E] text-xs h-8.5 w-8.5 p-0"
            title="Refresh Analytics"
          >
            <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* 4 Primary KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <Card className="border-[#222C3E] bg-[#0E131F] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Voice Calls</span>
            <PhoneCall className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-white tabular-nums">{calls.totalCalls}</p>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Completed: <span className="font-bold text-white">{calls.completedCalls}</span></span>
            <span>Avg: <span className="font-bold text-indigo-300">{formatDuration(calls.avgCallDurationSec)}</span></span>
          </div>
        </Card>

        {/* Qualified Leads */}
        <Card className="border-[#222C3E] bg-[#0E131F] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Qualified Leads</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 tabular-nums">{calls.qualifiedCalls}</p>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Qualification Rate:</span>
            <span className="font-bold text-emerald-400 font-mono">{calls.qualificationRate}%</span>
          </div>
        </Card>

        {/* Pending Operations */}
        <Card className="border-[#222C3E] bg-[#0E131F] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pending Follow-Ups</span>
            <Calendar className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400 tabular-nums">{operations.pendingFollowUps}</p>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Callbacks: <span className="font-bold text-white">{operations.callbackTasks}</span></span>
            <span>Done: <span className="font-bold text-slate-300">{operations.completedTasks}</span></span>
          </div>
        </Card>

        {/* Automation Success Rate */}
        <Card className="border-[#222C3E] bg-[#0E131F] p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Automation Health</span>
            <Workflow className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-2xl font-black text-sky-400 tabular-nums font-mono">{automations.successRate}%</p>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Executed: <span className="font-bold text-white">{automations.totalRuns}</span></span>
            <span>DNC Skipped: <span className="font-bold text-amber-300">{automations.skippedDncRuns}</span></span>
          </div>
        </Card>
      </div>

      {/* Grid: Lead Temperatures vs Outcomes Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lead Temperature Distribution */}
        <Card className="border-[#222C3E] bg-[#0E131F]">
          <CardHeader className="p-4 pb-2 border-b border-[#222C3E]">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              Lead Buying Temperature Distribution
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Categorized via explainable 7-factor conversation intent scoring
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3.5">
            {[
              { label: "HOT Leads (Score 70–100)", count: leads.hotLeads, color: "bg-rose-500", icon: <Flame className="h-3.5 w-3.5 text-rose-400" /> },
              { label: "WARM Leads (Score 40–69)", count: leads.warmLeads, color: "bg-amber-500", icon: <Zap className="h-3.5 w-3.5 text-amber-400" /> },
              { label: "COLD Leads (Score 0–39)", count: leads.coldLeads, color: "bg-sky-500", icon: <Snowflake className="h-3.5 w-3.5 text-sky-400" /> },
            ].map((item) => {
              const total = leads.totalLeads || 1;
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                      {item.icon} {item.label}
                    </span>
                    <span className="font-mono text-white tabular-nums font-bold">
                      {item.count} <span className="text-slate-500 font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#182132]">
                    <div className={cn("h-2 rounded-full transition-all", item.color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Business Outcome Distribution */}
        <Card className="border-[#222C3E] bg-[#0E131F]">
          <CardHeader className="p-4 pb-2 border-b border-[#222C3E]">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Verified Call Business Outcomes
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Discrete classification extracted from post-call evidence
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5">
            {Object.keys(intelligence.outcomeDistribution).length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">
                No analyzed calls in selected date range.
              </p>
            ) : (
              Object.entries(intelligence.outcomeDistribution).map(([outcome, count]) => {
                const total = calls.totalCalls || 1;
                const cnt = count as number;
                const pct = Math.round((cnt / total) * 100);
                return (
                  <div key={outcome} className="flex items-center justify-between rounded-lg border border-[#222C3E] bg-[#121824] px-3 py-2 text-xs">
                    <span className="font-medium text-slate-200">{outcome}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white tabular-nums">{cnt}</span>
                      <span className="text-[10px] text-slate-500">({pct}%)</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compliance & Escalation Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-300">Do-Not-Call (DNC) Registrations</p>
              <p className="text-[11px] text-amber-200/70">Callers opted out of further commercial outreach</p>
            </div>
          </div>
          <span className="text-2xl font-black text-amber-400 font-mono tabular-nums">
            {operations.dncRegistrations}
          </span>
        </Card>

        <Card className="border-rose-500/30 bg-rose-500/5 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-rose-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-300">Human Supervisor Escalations</p>
              <p className="text-[11px] text-rose-200/70">Urgent manager intervention requested during call</p>
            </div>
          </div>
          <span className="text-2xl font-black text-rose-400 font-mono tabular-nums">
            {operations.escalationRequests}
          </span>
        </Card>
      </div>
    </div>
  );
}
