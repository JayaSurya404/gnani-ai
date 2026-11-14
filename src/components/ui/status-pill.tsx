import * as React from "react";
import { cn } from "@/lib/utils";
import type { LeadTemperature, LeadStatus, CallStatus } from "@/lib/types";

export function TemperaturePill({
  temperature,
  score,
  className,
}: {
  temperature: LeadTemperature;
  score?: number;
  className?: string;
}) {
  const configs: Record<LeadTemperature, { label: string; bg: string; text: string; ring: string; dot: string }> = {
    HOT: {
      label: "HOT LEAD",
      bg: "bg-rose-50",
      text: "text-rose-700",
      ring: "ring-rose-200",
      dot: "bg-rose-500",
    },
    WARM: {
      label: "WARM LEAD",
      bg: "bg-amber-50",
      text: "text-amber-800",
      ring: "ring-amber-200",
      dot: "bg-amber-500",
    },
    COLD: {
      label: "COLD LEAD",
      bg: "bg-slate-50",
      text: "text-slate-600",
      ring: "ring-slate-200",
      dot: "bg-slate-400",
    },
  };

  const config = configs[temperature] || configs.COLD;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset select-none",
        config.bg,
        config.text,
        config.ring,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
      {score !== undefined && (
        <span className="ml-0.5 font-bold tabular-nums">({score})</span>
      )}
    </span>
  );
}

export function LeadStatusPill({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  const configs: Record<LeadStatus, { label: string; style: string }> = {
    NEW: { label: "New", style: "bg-[#7065E8]/10 text-[#5347C8] ring-[#7065E8]/25" },
    CONTACTED: { label: "Contacted", style: "bg-sky-50 text-sky-700 ring-sky-200" },
    QUALIFIED: { label: "Qualified", style: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    FOLLOW_UP: { label: "Follow-up", style: "bg-amber-50 text-amber-800 ring-amber-200" },
    CONVERTED: { label: "Converted", style: "bg-teal-50 text-teal-800 ring-teal-200" },
    LOST: { label: "Lost", style: "bg-slate-100 text-slate-600 ring-slate-200" },
    DO_NOT_CALL: { label: "Do Not Call", style: "bg-rose-50 text-rose-700 ring-rose-200" },
  };

  const config = configs[status] || configs.NEW;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset select-none",
        config.style,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function CallStatusPill({
  status,
  className,
}: {
  status: CallStatus;
  className?: string;
}) {
  const configs: Record<CallStatus, { label: string; style: string; pulse?: boolean }> = {
    QUEUED: { label: "Queued", style: "bg-slate-100 text-slate-700 ring-slate-200" },
    INITIATING: { label: "Initiating", style: "bg-amber-50 text-amber-700 ring-amber-200", pulse: true },
    RINGING: { label: "Ringing", style: "bg-amber-100 text-amber-800 ring-amber-300", pulse: true },
    IN_PROGRESS: { label: "Live Call", style: "bg-emerald-100 text-emerald-800 ring-emerald-300", pulse: true },
    COMPLETED: { label: "Completed", style: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    BUSY: { label: "Busy", style: "bg-slate-100 text-slate-600 ring-slate-200" },
    NO_ANSWER: { label: "No Answer", style: "bg-amber-50 text-amber-700 ring-amber-200" },
    FAILED: { label: "Failed", style: "bg-rose-50 text-rose-700 ring-rose-200" },
    CANCELED: { label: "Canceled", style: "bg-slate-100 text-slate-600 ring-slate-200" },
  };

  const config = configs[status] || configs.QUEUED;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset select-none",
        config.style,
        className
      )}
    >
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {config.label}
    </span>
  );
}
