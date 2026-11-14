"use client";

import React, { useState } from "react";
import { Plus, Copy, Check } from "lucide-react";
import { toast } from "sonner";
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
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function CampaignsPage() {
  const campaigns = useWorkspaceStore((state) => state.campaigns);
  const addCampaign = useWorkspaceStore((state) => state.addCampaign);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("Google Search");
  const [slug, setSlug] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (campaignId: string, campaignSlug: string) => {
    const url = `https://voicenexus.ai/p/kaveri-solar-construction?utm_source=${campaignSlug}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
      setCopiedId(campaignId);
      toast.success("Tracking URL copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.info(`URL: ${url}`);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error("Please fill in campaign name and UTM slug");
      return;
    }

    addCampaign({
      name: name.trim(),
      channel,
      slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    });

    toast.success(`Campaign "${name}" created!`);
    setIsModalOpen(false);
    setName("");
    setSlug("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">
            Campaigns & Attribution Tracking
          </h2>
          <p className="text-xs text-slate-400">
            Generate UTM tracking links and attribute inbound leads to marketing channels.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-xs gap-1.5 h-9 font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Tracking Link
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-[#222C3E] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="p-3.5 pl-4">Campaign Name</th>
                <th className="p-3.5">Channel</th>
                <th className="p-3.5">Clicks</th>
                <th className="p-3.5">Leads Captured</th>
                <th className="p-3.5">Qualified Rate</th>
                <th className="p-3.5 pr-4 text-right">Link Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222C3E]/50">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-[#182132]/60 transition-colors">
                  <td className="p-3.5 pl-4">
                    <span className="font-semibold text-slate-200 block">{c.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">utm_source={c.slug}</span>
                  </td>
                  <td className="p-3.5 text-slate-400">{c.channel}</td>
                  <td className="p-3.5 text-slate-200 font-mono tabular-nums">{c.clicks}</td>
                  <td className="p-3.5 text-emerald-400 font-mono font-semibold tabular-nums">{c.leads}</td>
                  <td className="p-3.5 text-indigo-400 font-semibold tabular-nums">{c.rate}</td>
                  <td className="p-3.5 pr-4 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(c.id, c.slug)}
                      className="h-8 px-2.5 text-xs gap-1.5 text-slate-300 hover:text-white"
                    >
                      {copiedId === c.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      {copiedId === c.id ? "Copied" : "Copy URL"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Campaign Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create Campaign Tracking Link</DialogTitle>
              <DialogDescription>
                Generate a trackable link with UTM attribution to measure lead conversion per channel.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Campaign Name *</label>
                <Input
                  required
                  placeholder="e.g. Chennai Metro Station Banner Ad"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Traffic Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full rounded-lg border border-[#222C3E] bg-[#0E1420] px-3 py-2 text-xs text-slate-200"
                >
                  <option value="Google Search">Google Search (PPC)</option>
                  <option value="WhatsApp Direct">WhatsApp Direct / Group</option>
                  <option value="Facebook / Instagram">Facebook / Instagram Ads</option>
                  <option value="QR Code / Offline">QR Code / Offline Exhibition</option>
                  <option value="Referral Partner">Referral Partner</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">UTM Campaign Slug *</label>
                <Input
                  required
                  placeholder="e.g. metro-banner-may"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-xs font-medium"
              >
                Generate Link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
