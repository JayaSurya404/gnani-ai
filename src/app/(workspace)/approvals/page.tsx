"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  ShieldAlert,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatPhoneNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface NotificationDraftItem {
  id: string;
  recipient: string;
  rendered_message: string;
  status: string;
  consent_verified: boolean;
  consent_reference?: string | null;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  call_session_id?: string | null;
  leads?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    company?: string | null;
    do_not_call?: boolean;
  } | null;
  call_sessions?: {
    id: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    duration_seconds?: number;
    status: string;
  } | null;
}

export default function ApprovalsPage() {
  const [drafts, setDrafts] = useState<NotificationDraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("DRAFT_PENDING_APPROVAL");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Edit Modal State
  const [editingDraft, setEditingDraft] = useState<NotificationDraftItem | null>(null);
  const [editedText, setEditedText] = useState("");

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ channel: "WHATSAPP" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/approvals?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setDrafts(data.drafts || []);
      }
    } catch {
      toast.error("Failed to load approval drafts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ channel: "WHATSAPP" });
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    fetch(`/api/approvals?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.success) {
          setDrafts(data.drafts || []);
        }
      })
      .catch(() => {
        if (!active) return;
        toast.error("Failed to load approval drafts");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [statusFilter]);

  // Execute Approval action
  const handleAction = async (dispatchId: string, action: "APPROVE" | "REJECT" | "CANCEL", extra?: Record<string, unknown>) => {
    setIsProcessing(dispatchId);
    try {
      const res = await fetch(`/api/approvals/${dispatchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Action failed");
      } else {
        if (action === "APPROVE") {
          toast.success("Notification draft approved! Ready for dispatch.");
        } else if (action === "REJECT") {
          toast.info("Draft rejected.");
        } else {
          toast.info("Draft cancelled.");
        }
        fetchDrafts();
      }
    } catch {
      toast.error("Network error during draft processing");
    } finally {
      setIsProcessing(null);
    }
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingDraft || !editedText.trim()) return;
    setIsProcessing(editingDraft.id);
    try {
      const res = await fetch(`/api/approvals/${editingDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EDIT", editedMessage: editedText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to save edit");
      } else {
        toast.success("Draft message updated successfully!");
        setEditingDraft(null);
        fetchDrafts();
      }
    } catch {
      toast.error("Network error while editing draft");
    } finally {
      setIsProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT_PENDING_APPROVAL":
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">PENDING APPROVAL</Badge>;
      case "APPROVED":
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">APPROVED</Badge>;
      case "REJECTED":
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-[10px]">REJECTED</Badge>;
      case "CANCELLED":
        return <Badge className="bg-slate-700/40 text-slate-400 border-slate-700 text-[10px]">CANCELLED</Badge>;
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
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            Human Approval Workspace
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit and approve customer-facing WhatsApp follow-up drafts generated by the AI post-call intelligence engine.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={fetchDrafts}
          className="border-[#222C3E] text-xs h-9 gap-1.5 self-start sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-[#222C3E] pb-3">
        {[
          { id: "DRAFT_PENDING_APPROVAL", label: "Pending Approval" },
          { id: "APPROVED", label: "Approved" },
          { id: "REJECTED", label: "Rejected" },
          { id: "CANCELLED", label: "Cancelled" },
          { id: "ALL", label: "All Drafts" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              statusFilter === tab.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 bg-[#121824] border border-[#222C3E]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Drafts List */}
      <div className="space-y-3.5">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-32 w-full animate-pulse rounded-xl border border-[#222C3E] bg-[#121824]" />
          ))
        ) : drafts.length === 0 ? (
          <Card className="border-[#222C3E] bg-[#0E131F] p-12 text-center text-slate-400">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
            <h3 className="text-sm font-semibold text-white">Inbox Zero: No pending approvals</h3>
            <p className="text-xs text-slate-500 mt-1">
              All customer WhatsApp notification drafts have been reviewed or none are currently queued.
            </p>
          </Card>
        ) : (
          drafts.map((draft) => {
            const isDnc = draft.leads?.do_not_call === true;
            const hasConsent = draft.consent_verified === true;
            const isPending = draft.status === "DRAFT_PENDING_APPROVAL";

            return (
              <Card key={draft.id} className="border-[#222C3E] bg-[#0E131F] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white">
                        {draft.leads?.name || draft.call_sessions?.customer_name || "Customer Draft"}
                      </h4>
                      <span className="font-mono text-xs text-slate-400">
                        {formatPhoneNumber(draft.recipient)}
                      </span>
                      {getStatusBadge(draft.status)}
                      <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px]">
                        WhatsApp
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      {hasConsent ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Consent Verified ({draft.consent_reference || "CRM"})
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400 font-semibold">
                          <AlertCircle className="h-3 w-3" /> Consent Missing
                        </span>
                      )}

                      {isDnc && (
                        <span className="flex items-center gap-1 text-rose-400 font-semibold">
                          <ShieldAlert className="h-3 w-3" /> DNC Registered
                        </span>
                      )}

                      <span>Drafted: {new Date(draft.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions for Pending Drafts */}
                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingDraft(draft);
                          setEditedText(draft.rendered_message || "");
                        }}
                        disabled={isProcessing === draft.id}
                        className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        <Edit3 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(draft.id, "REJECT")}
                        disabled={isProcessing === draft.id}
                        className="h-8 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAction(draft.id, "APPROVE")}
                        disabled={isProcessing === draft.id || isDnc || !hasConsent}
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    </div>
                  )}
                </div>

                {/* Rendered Message Draft Preview */}
                <div className="rounded-lg border border-[#222C3E] bg-[#121824] p-3 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                  {draft.rendered_message}
                </div>

                {/* Audit details if approved */}
                {draft.approved_by && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono pt-1">
                    <span>Approved By: {draft.approved_by}</span>
                    <span>•</span>
                    <span>Approved At: {draft.approved_at ? new Date(draft.approved_at).toLocaleString() : "N/A"}</span>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Edit Draft Dialog */}
      {editingDraft && (
        <Dialog open={Boolean(editingDraft)} onOpenChange={(open) => !open && setEditingDraft(null)}>
          <DialogContent className="border-[#222C3E] bg-[#0E131F] text-white sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Edit WhatsApp Draft Message</DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Refine the personalized message text before providing supervisor approval.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2">
              <label className="text-xs font-medium text-slate-300">Message Content</label>
              <textarea
                rows={6}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full rounded-md border border-[#222C3E] bg-[#121824] p-3 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingDraft(null)}
                className="border-slate-700 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editedText.trim() || isProcessing === editingDraft.id}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

