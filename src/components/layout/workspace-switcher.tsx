"use client";

import React, { useState, useEffect, useTransition } from "react";
import { ChevronDown, Building2, Plus, Check, Loader2 } from "lucide-react";
import {
  getUserOrganizations,
  switchOrganizationAction,
  createOrganizationAction,
  type UserOrganization,
} from "@/actions/organization";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>("default");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadOrgs() {
      try {
        const orgs = await getUserOrganizations();
        if (orgs && orgs.length > 0) {
          setOrganizations(orgs);
          // Check cookie or default to first
          setActiveOrgId(orgs[0].id);
        }
      } catch (err) {
        console.error("Failed to load organizations:", err);
      }
    }
    loadOrgs();
  }, []);

  const activeOrg =
    organizations.find((o) => o.id === activeOrgId) ||
    organizations[0] || {
      id: "loading",
      name: "VoiceNexus Workspace",
      slug: "workspace",
      plan: "GROWTH",
      role: "OWNER" as const,
    };

  const handleSwitchOrg = (orgId: string) => {
    setActiveOrgId(orgId);
    setIsOpen(false);
    startTransition(async () => {
      await switchOrganizationAction(orgId);
      window.location.reload();
    });
  };

  const handleCreateOrg = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const orgName = (formData.get("name") as string)?.trim();
    if (!orgName) return;

    startTransition(async () => {
      const res = await createOrganizationAction(formData);
      if (res.success && res.orgId) {
        const newOrg: UserOrganization = {
          id: res.orgId,
          name: orgName,
          slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          plan: "GROWTH",
          role: "OWNER",
        };
        setOrganizations((prev) => [...prev, newOrg]);
        setActiveOrgId(res.orgId);
        setIsCreateModalOpen(false);
      } else {
        const tempId = `org-${Date.now()}`;
        const newOrg: UserOrganization = {
          id: tempId,
          name: orgName,
          slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          plan: "GROWTH",
          role: "OWNER",
        };
        setOrganizations((prev) => [...prev, newOrg]);
        setActiveOrgId(tempId);
        setIsCreateModalOpen(false);
      }
    });
  };

  if (compact) {
    return (
      <div
        onClick={() => setIsOpen(!isOpen)}
        title={activeOrg.name}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7065E8]/10 text-[#5347C8] ring-1 ring-[#7065E8]/20 hover:bg-[#7065E8]/15 cursor-pointer transition-all"
      >
        <Building2 className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white/80 p-2.5 text-left transition hover:bg-white hover:border-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#7065E8]/30"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7065E8]/10 text-[#5347C8] ring-1 ring-[#7065E8]/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col truncate">
            <span className="truncate text-xs font-bold text-[#192238]">
              {activeOrg.name}
            </span>
            <span className="text-[10px] text-[#778198]">
              {activeOrg.plan} Plan • {activeOrg.role}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#778198] transition-transform ${
            isOpen ? "rotate-180 text-[#192238]" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xl p-1.5 shadow-xl">
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#778198]">
              Your Organizations
            </div>

            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {organizations.map((org) => {
                const isSelected = org.id === activeOrgId;
                return (
                  <button
                    key={org.id}
                    onClick={() => handleSwitchOrg(org.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-[#7065E8]/10 text-[#5347C8] font-semibold"
                        : "text-[#192238] hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-[#778198]" />
                      <span className="truncate">{org.name}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#7065E8]" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-1.5 pt-1.5 border-t border-slate-200/80">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsCreateModalOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#7065E8] hover:bg-[#7065E8]/10 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#7065E8]" />
                <span>Create New Organization</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Organization Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white border border-slate-200 text-[#192238] rounded-2xl shadow-xl">
          <form onSubmit={handleCreateOrg}>
            <DialogHeader>
              <DialogTitle className="text-base text-[#192238] font-bold">Create New Organization</DialogTitle>
              <DialogDescription className="text-xs text-[#778198]">
                Set up a new isolated multi-tenant workspace for your enterprise business.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#192238]">
                  Organization / Company Name
                </label>
                <Input
                  name="name"
                  required
                  placeholder="e.g. Kongu Renewable Energies"
                  className="bg-white border-slate-200 text-xs text-[#192238]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-[#7065E8] hover:bg-[#5347C8] text-white text-xs shadow-md shadow-[#7065E8]/20"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Creating...
                  </>
                ) : (
                  "Create Workspace"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
