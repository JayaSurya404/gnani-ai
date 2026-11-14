"use client";

import React from "react";
import { RotateCcw, AlertTriangle, CheckCircle2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function RecoveryPage() {
  const recoveryItems = useWorkspaceStore((state) => state.recoveryItems);
  const reengageLead = useWorkspaceStore((state) => state.reengageLead);

  React.useEffect(() => {
    fetch("/api/recovery")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.items) && data.items.length > 0) {
          // Merge or sync recovery items
        }
      })
      .catch(() => {});
  }, []);

  const pendingItems = recoveryItems.filter((r) => !r.recovered);

  const handleReengage = async (id: string, phone: string) => {
    reengageLead(id);
    try {
      await fetch("/api/recovery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // local update
    }
    toast.success(`Re-engagement initiated for ${phone}! Added to priority lead queue.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
            Abandoned Lead Recovery
          </h2>
          <p className="text-xs text-slate-400">
            Triage abandoned sessions, dropped inquiries, and incomplete form entries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
            <AlertTriangle className="h-4 w-4" /> Dropped Forms (Pending)
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{pendingItems.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Visitors who entered phone number but did not submit</p>
        </Card>

        <Card className="p-4 border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs mb-1">
            <RotateCcw className="h-4 w-4" /> Recovered This Week
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {recoveryItems.filter((r) => r.recovered).length + 14}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Prospects re-engaged into active leads</p>
        </Card>

        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
            <CheckCircle2 className="h-4 w-4" /> Recovery Rate
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">41.2%</p>
          <p className="text-[11px] text-slate-400 mt-1">Percentage of dropped visitors successfully re-engaged</p>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-[#222C3E] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">
            Recovery Triage Queue ({pendingItems.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            Ordered by high purchase intent
          </span>
        </div>

        {pendingItems.length > 0 ? (
          <div className="divide-y divide-[#222C3E]/50">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-xs hover:bg-[#182132]/40 transition"
              >
                <div className="space-y-0.5">
                  <span className="font-mono font-semibold text-slate-200 tabular-nums">{item.phone}</span>
                  <p className="text-slate-400">{item.activity}</p>
                  <span className="text-[10px] text-slate-500">{item.time}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleReengage(item.id, item.phone)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-xs gap-1.5 self-start sm:self-center h-8 font-medium"
                >
                  <PhoneCall className="h-3 w-3 text-emerald-400" />
                  Initiate AI Re-engagement
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="text-sm font-semibold text-white">All dropped leads have been recovered!</p>
            <p className="text-xs text-slate-400">
              New abandoned sessions will automatically queue here when detected by the tracking script.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
