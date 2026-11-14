"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export interface VersionSnapshot {
  id: string;
  versionNumber: string;
  systemPrompt: string;
  greetingMessage: string;
  turnTimeoutMs: number;
  maxDurationSeconds: number;
  notes: string;
  createdAt: string;
  isActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeVersion: VersionSnapshot | null;
  selectedVersion: VersionSnapshot | null;
  onRollback: (versionId: string) => void;
  isRollingBack: boolean;
}

export function VersionDiffModal({
  isOpen,
  onClose,
  activeVersion,
  selectedVersion,
  onRollback,
  isRollingBack,
}: Props) {
  if (!isOpen || !selectedVersion) return null;

  const isCurrentActive = activeVersion?.id === selectedVersion.id;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-[#0E1420] border-[#222C3E] text-slate-100 max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-[#222C3E] pb-3">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                Version Snapshot Comparison
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  {selectedVersion.versionNumber}
                </span>
                {isCurrentActive && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                    CURRENT ACTIVE
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Created on {new Date(selectedVersion.createdAt).toLocaleString("en-IN")} • {selectedVersion.notes}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 flex-1 overflow-y-auto">
          {/* Active Version Column */}
          <div className="rounded-lg border border-[#222C3E] bg-[#07090E] p-3 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#1E2738] mb-3">
              <span className="text-xs font-bold text-emerald-400">
                Currently Live ({activeVersion?.versionNumber || "v1.0"})
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Live in Production</span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Greeting Turn</span>
                <p className="p-2 rounded bg-[#0E1420] text-slate-300 font-mono text-[11px] mt-1 border border-[#1E2738]">
                  {activeVersion?.greetingMessage || "N/A"}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">System Instructions</span>
                <pre className="p-2.5 rounded bg-[#0E1420] text-slate-300 font-mono text-[10px] mt-1 border border-[#1E2738] whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {activeVersion?.systemPrompt || "N/A"}
                </pre>
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 border-t border-[#1E2738] pt-2">
                <span>Timeout: {activeVersion?.turnTimeoutMs}ms</span>
                <span>Max Duration: {activeVersion?.maxDurationSeconds}s</span>
              </div>
            </div>
          </div>

          {/* Selected Historical Snapshot Column */}
          <div className="rounded-lg border border-indigo-500/30 bg-[#07090E] p-3 flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20 mb-3">
              <span className="text-xs font-bold text-indigo-400">
                Comparison Snapshot ({selectedVersion.versionNumber})
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Immutable</span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Greeting Turn</span>
                <p className="p-2 rounded bg-[#0E1420] text-indigo-200 font-mono text-[11px] mt-1 border border-indigo-500/20">
                  {selectedVersion.greetingMessage}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">System Instructions</span>
                <pre className="p-2.5 rounded bg-[#0E1420] text-indigo-200 font-mono text-[10px] mt-1 border border-indigo-500/20 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {selectedVersion.systemPrompt}
                </pre>
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 border-t border-[#1E2738] pt-2">
                <span>Timeout: {selectedVersion.turnTimeoutMs}ms</span>
                <span>Max Duration: {selectedVersion.maxDurationSeconds}s</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-[#222C3E] pt-3 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>

          {!isCurrentActive && (
            <Button
              size="sm"
              disabled={isRollingBack}
              onClick={() => onRollback(selectedVersion.id)}
              className="bg-amber-600 hover:bg-amber-500 text-xs gap-1.5 text-white font-medium"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isRollingBack ? "Rolling back..." : `Rollback to ${selectedVersion.versionNumber}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
