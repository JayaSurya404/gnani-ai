"use client";

import React, { useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  User,
  Check,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FollowUpTaskItem {
  id: string;
  organizationId: string;
  leadId?: string | null;
  callSessionId?: string | null;
  assignedTo?: string | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority: string; // "LOW" | "MEDIUM" | "HIGH"
  status: string; // "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  createdAt?: string;
  leads?: {
    id: string;
    name: string;
    phone: string;
    status: string;
    do_not_call: boolean;
  } | null;
  call_sessions?: {
    id: string;
    customer_name?: string | null;
    customer_phone?: string | null;
  } | null;
}

interface TasksWorkspaceProps {
  tasks: FollowUpTaskItem[];
  onTaskUpdated?: () => void;
  onSelectCall?: (callSessionId: string) => void;
  className?: string;
}

export function TasksWorkspace({
  tasks,
  onTaskUpdated,
  onSelectCall,
  className,
}: TasksWorkspaceProps) {
  const [filterType, setFilterType] = useState<"ALL" | "CALLBACK" | "FOLLOW_UP" | "SUPERVISOR">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [rescheduleTask, setRescheduleTask] = useState<FollowUpTaskItem | null>(null);
  const [newDueDate, setNewDueDate] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const filteredTasks = tasks.filter((task) => {
    const isCallback = task.title.toLowerCase().includes("callback");
    const isSupervisor = task.title.toLowerCase().includes("supervisor");

    if (filterType === "CALLBACK" && !isCallback) return false;
    if (filterType === "SUPERVISOR" && !isSupervisor) return false;
    if (filterType === "FOLLOW_UP" && (isCallback || isSupervisor)) return false;

    if (filterStatus === "PENDING" && task.status !== "PENDING" && task.status !== "IN_PROGRESS") return false;
    if (filterStatus === "COMPLETED" && task.status !== "COMPLETED") return false;

    return true;
  });

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to update task status");
      } else {
        toast.success(`Task marked as ${newStatus.toLowerCase()}!`);
        onTaskUpdated?.();
      }
    } catch {
      toast.error("Network error while updating task");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleTask || !newDueDate) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${rescheduleTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: new Date(newDueDate).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to reschedule task");
      } else {
        toast.success("Task rescheduled successfully!");
        setRescheduleTask(null);
        setNewDueDate("");
        onTaskUpdated?.();
      }
    } catch {
      toast.error("Network error while rescheduling task");
    } finally {
      setIsUpdating(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority.toUpperCase()) {
      case "HIGH":
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px]">HIGH PRIORITY</Badge>;
      case "MEDIUM":
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">MEDIUM</Badge>;
      default:
        return <Badge className="bg-slate-700/40 text-slate-300 border-slate-700 text-[10px]">LOW</Badge>;
    }
  };

  return (
    <Card className={cn("border-[#222C3E] bg-[#0E131F]", className)}>
      <CardHeader className="p-4 pb-3 border-b border-[#222C3E]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            <CardTitle className="text-sm font-semibold text-white">
              Follow-Up Tasks &amp; Scheduled Callbacks
            </CardTitle>
            <span className="text-[11px] font-mono text-slate-400">
              ({tasks.length} total)
            </span>
          </div>

          {/* Type Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "ALL" as const, label: "All Tasks" },
              { id: "CALLBACK" as const, label: "Callbacks" },
              { id: "SUPERVISOR" as const, label: "Supervisor Reviews" },
              { id: "FOLLOW_UP" as const, label: "Sales Follow-ups" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-medium transition",
                  filterType === f.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 bg-[#121824] border border-[#222C3E]"
                )}
              >
                {f.label}
              </button>
            ))}

            {/* Status Filters */}
            <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
              {[
                { id: "ALL" as const, label: "All" },
                { id: "PENDING" as const, label: "Pending" },
                { id: "COMPLETED" as const, label: "Done" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilterStatus(s.id)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-medium transition",
                    filterStatus === s.id
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
            <CheckCircle2 className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-xs font-medium">No tasks found matching current filter.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isDnc = task.leads?.do_not_call === true;
            const isCompleted = task.status === "COMPLETED";
            const isApproximate = task.description?.includes("APPROXIMATE TIME WINDOW");

            return (
              <div
                key={task.id}
                className={cn(
                  "rounded-xl border p-3.5 transition space-y-2.5",
                  isCompleted
                    ? "border-slate-800 bg-[#121824]/40 opacity-75"
                    : "border-[#222C3E] bg-[#121824] hover:border-slate-600"
                )}
              >
                {/* Header row: title, priority, DNC badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={cn("text-xs font-bold", isCompleted ? "line-through text-slate-400" : "text-white")}>
                        {task.title}
                      </h4>
                      {getPriorityBadge(task.priority)}
                      {isDnc && (
                        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px] gap-1 py-0">
                          <ShieldAlert className="h-2.5 w-2.5" /> DNC Registered
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      {task.leads?.name && (
                        <span className="flex items-center gap-1 font-medium text-slate-300">
                          <User className="h-3 w-3 text-slate-500" />
                          {task.leads.name} ({task.leads.phone})
                        </span>
                      )}

                      {task.dueDate && (
                        <span className="flex items-center gap-1 font-mono tabular-nums text-indigo-300">
                          <Clock className="h-3 w-3 text-indigo-400" />
                          Due: {new Date(task.dueDate).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCompleted ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateStatus(task.id, "COMPLETED")}
                          disabled={isUpdating}
                          className="h-7 text-[11px] px-2.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <Check className="h-3 w-3 mr-1" /> Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRescheduleTask(task);
                            setNewDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "");
                          }}
                          disabled={isUpdating}
                          className="h-7 text-[11px] px-2 text-slate-300 border-slate-700 hover:bg-slate-800"
                        >
                          Reschedule
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                        COMPLETED
                      </Badge>
                    )}

                    {task.callSessionId && onSelectCall && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelectCall(task.callSessionId!)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                        title="View Source Call"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Description & Approximate Window Notes */}
                {task.description && (
                  <div className="rounded bg-[#182132]/60 p-2.5 text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {task.description}
                  </div>
                )}

                {isApproximate && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Approximate customer window preserved without hallucinated exact time.</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      {/* Reschedule Modal */}
      {rescheduleTask && (
        <Dialog open={Boolean(rescheduleTask)} onOpenChange={(open) => !open && setRescheduleTask(null)}>
          <DialogContent className="border-[#222C3E] bg-[#0E131F] text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Reschedule Task</DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Update the target execution timestamp for: {rescheduleTask.title}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-2">
              <label className="text-xs font-medium text-slate-300">New Due Date &amp; Time</label>
              <Input
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="bg-[#121824] border-[#222C3E] text-xs text-white"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRescheduleTask(null)}
                className="border-slate-700 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleReschedule}
                disabled={!newDueDate || isUpdating}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs"
              >
                Save New Time
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

