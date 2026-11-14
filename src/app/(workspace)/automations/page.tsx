"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Workflow,
  Plus,
  RotateCcw,
  ShieldAlert,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface AutomationRuleItem {
  id: string;
  title: string;
  trigger_event: string;
  action_type: string;
  action_config?: Record<string, unknown> | null;
  conditions?: Record<string, unknown> | null;
  is_active: boolean;
  status?: string;
  created_at: string;
}

export interface AutomationRunItem {
  id: string;
  automation_id: string;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error?: string | null;
  created_at: string;
  completed_at?: string | null;
  automations?: {
    title: string;
    action_type: string;
  } | null;
  call_sessions?: {
    customer_name?: string | null;
    customer_phone?: string | null;
  } | null;
}

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<AutomationRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);

  // New Rule Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("LEAD_QUALIFIED");
  const [actionType, setActionType] = useState("CREATE_FOLLOW_UP_TASK");
  const [minScore, setMinScore] = useState("45");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch automations from server
  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automations");
      const data = await res.json();
      if (res.ok && data.success) {
        setRules(data.rules || []);
        setRecentRuns(data.recentRuns || []);
      }
    } catch {
      toast.error("Failed to load automation rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/automations")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.success) {
          setRules(data.rules || []);
          setRecentRuns(data.recentRuns || []);
        }
      })
      .catch(() => {
        if (!active) return;
        toast.error("Failed to load automation rules");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Handle manual retry of a failed or dead-letter run
  const handleRetryRun = async (runId: string) => {
    setIsRetrying(runId);
    try {
      const res = await fetch("/api/automations/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Retry failed");
      } else {
        toast.success("Automation run safely queued for retry!");
        fetchAutomations();
      }
    } catch {
      toast.error("Network error during automation retry");
    } finally {
      setIsRetrying(null);
    }
  };

  // Handle create new rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title for the rule");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          triggerEvent,
          triggerConditions: {
            minScore: minScore ? parseInt(minScore, 10) : undefined,
          },
          actionType,
          actionConfig: {},
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to create automation rule");
      } else {
        toast.success(`Rule "${title}" created and activated!`);
        setIsModalOpen(false);
        setTitle("");
        fetchAutomations();
      }
    } catch {
      toast.error("Network error during rule creation");
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">COMPLETED</Badge>;
      case "SKIPPED_DNC":
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] gap-1">
            <ShieldAlert className="h-2.5 w-2.5" /> SKIPPED_DNC
          </Badge>
        );
      case "PROCESSING":
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">PROCESSING</Badge>;
      case "FAILED":
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px]">FAILED</Badge>;
      case "DEAD_LETTER":
        return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">DEAD_LETTER</Badge>;
      default:
        return <Badge className="bg-slate-700/40 text-slate-400 border-slate-700 text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl flex items-center gap-2">
            <Workflow className="h-6 w-6 text-indigo-400" />
            Automation Center &amp; Outbox Engine
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure business rules, track durable action runs, audit DNC suppressions, and execute idempotent retries.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAutomations}
            className="border-[#222C3E] text-xs h-9 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-xs gap-1.5 h-9 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Rule
          </Button>
        </div>
      </div>

      {/* Grid: Configured Rules vs Execution Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Rules */}
        <div className="space-y-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Organization Rules ({rules.length})
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">Priority Order</span>
          </div>

          <div className="space-y-2.5">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-24 w-full animate-pulse rounded-xl border border-[#222C3E] bg-[#121824]" />
              ))
            ) : rules.length === 0 ? (
              <Card className="border-[#222C3E] bg-[#0E131F] p-6 text-center text-slate-400">
                <Workflow className="mx-auto h-6 w-6 text-slate-600 mb-2" />
                <p className="text-xs font-medium">No active automation rules.</p>
                <p className="text-[11px] text-slate-500 mt-1">Default enterprise rules will execute on call completion.</p>
              </Card>
            ) : (
              rules.map((rule) => (
                <Card key={rule.id} className="border-[#222C3E] bg-[#0E131F] p-3.5 transition hover:border-[#222C3E] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-white">{rule.title}</h4>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        rule.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-700/40 text-slate-400"
                      )}
                    >
                      {rule.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-indigo-300">
                      <span className="text-slate-500">Trigger:</span>
                      <span className="font-mono">{rule.trigger_event}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <span className="text-slate-500">Action:</span>
                      <span className="font-mono text-emerald-400">{rule.action_type}</span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Execution History Outbox */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Durable Execution History Outbox ({recentRuns.length})
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">public.automation_runs</span>
          </div>

          <div className="space-y-2.5">
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-xl border border-[#222C3E] bg-[#121824]" />
              ))
            ) : recentRuns.length === 0 ? (
              <Card className="border-[#222C3E] bg-[#0E131F] p-8 text-center text-slate-400">
                <Clock className="mx-auto h-6 w-6 text-slate-600 mb-2" />
                <p className="text-xs font-medium">No automation execution runs recorded yet.</p>
                <p className="text-[11px] text-slate-500 mt-1">Runs are triggered automatically upon post-call analysis completion.</p>
              </Card>
            ) : (
              recentRuns.map((run) => {
                const canRetry = run.status === "FAILED" || run.status === "DEAD_LETTER";
                return (
                  <Card key={run.id} className="border-[#222C3E] bg-[#0E131F] p-3.5 transition hover:border-[#222C3E]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-white font-mono">
                            {run.idempotency_key}
                          </p>
                          {getStatusBadge(run.status)}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                          {run.call_sessions?.customer_name && (
                            <span className="text-slate-300">
                              Caller: {run.call_sessions.customer_name}
                            </span>
                          )}
                          <span>Attempts: {run.attempt_count}/{run.max_attempts}</span>
                          <span>{new Date(run.created_at).toLocaleTimeString()}</span>
                        </div>

                        {run.last_error && (
                          <p className="text-[10px] text-rose-400 font-mono pt-0.5">
                            Error: {run.last_error}
                          </p>
                        )}
                      </div>

                      {/* Retry Button if Failed */}
                      {canRetry && (
                        <div className="shrink-0 self-end sm:self-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetryRun(run.id)}
                            disabled={isRetrying === run.id}
                            className="h-7 text-[11px] border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                          >
                            <RefreshCw className={cn("h-3 w-3 mr-1", isRetrying === run.id && "animate-spin")} />
                            {isRetrying === run.id ? "Retrying..." : "Safe Retry"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Create Automation Rule Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="border-[#222C3E] bg-[#0E131F] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Create Automation Rule</DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Define owner-approved triggers, threshold conditions, and automated actions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRule} className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Rule Title</label>
              <Input
                type="text"
                placeholder="e.g. Qualified Lead Solar Consultation"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#121824] border-[#222C3E] text-xs text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Trigger Event</label>
                <select
                  value={triggerEvent}
                  onChange={(e) => setTriggerEvent(e.target.value)}
                  className="w-full h-8.5 rounded-md border border-[#222C3E] bg-[#121824] px-2 text-xs text-slate-300"
                >
                  <option value="LEAD_QUALIFIED">LEAD_QUALIFIED</option>
                  <option value="CALLBACK_REQUESTED">CALLBACK_REQUESTED</option>
                  <option value="ESCALATION_REQUESTED">ESCALATION_REQUESTED</option>
                  <option value="HIGH_INTENT_DETECTED">HIGH_INTENT_DETECTED</option>
                  <option value="UNANSWERED_QUESTION">UNANSWERED_QUESTION</option>
                  <option value="CALL_COMPLETED">CALL_COMPLETED</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Action Type</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full h-8.5 rounded-md border border-[#222C3E] bg-[#121824] px-2 text-xs text-slate-300"
                >
                  <option value="CREATE_FOLLOW_UP_TASK">CREATE_FOLLOW_UP_TASK</option>
                  <option value="SCHEDULE_CALLBACK">SCHEDULE_CALLBACK</option>
                  <option value="NOTIFY_INTERNAL_STAFF">NOTIFY_INTERNAL_STAFF</option>
                  <option value="GENERATE_WHATSAPP_DRAFT">GENERATE_WHATSAPP_DRAFT</option>
                  <option value="WEBHOOK_DISPATCH">WEBHOOK_DISPATCH</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Minimum Score Threshold (0–100)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="bg-[#121824] border-[#222C3E] text-xs text-white"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="border-slate-700 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreating}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs"
              >
                {isCreating ? "Saving..." : "Create Rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
