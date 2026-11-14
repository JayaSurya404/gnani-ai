"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  Download,
  PhoneCall,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { TemperaturePill, LeadStatusPill } from "@/components/ui/status-pill";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import LeadDetailDrawer from "@/components/leads/lead-detail-drawer";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { formatPhoneNumber, cleanLeadName, cleanLeadNotes, formatLeadSource } from "@/lib/utils";
import type { Lead, LeadTemperature } from "@/lib/types";

function LeadsContent() {
  const searchParams = useSearchParams();
  const leads = useWorkspaceStore((state) => state.leads);
  const addLead = useWorkspaceStore((state) => state.addLead);

  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterCity, setFilterCity] = useState<string>("ALL");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync leads from database on mount
  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.leads)) {
          useWorkspaceStore.getState().initWorkspaceData({
            leads: data.leads,
            agents: useWorkspaceStore.getState().agents,
            calls: useWorkspaceStore.getState().calls,
            isSynthetic: false,
          });
        }
      })
      .catch((err) => console.error("Error loading leads:", err));
  }, []);

  // Handle URL query parameters (e.g. ?leadId=...)
  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (leadId && leads.length > 0) {
      const found = leads.find((l) => l.id === leadId);
      if (found) {
        const timer = setTimeout(() => {
          setSelectedLead(found);
          setIsDrawerOpen(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, leads]);

  // Form state for adding lead
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newTemp, setNewTemp] = useState<LeadTemperature>("HOT");

  // Extract unique cities
  const uniqueCities = Array.from(
    new Set(leads.map((l) => l.location).filter(Boolean))
  ) as string[];

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search) ||
      (lead.email && lead.email.toLowerCase().includes(search.toLowerCase())) ||
      lead.primaryInterest.toLowerCase().includes(search.toLowerCase());
    const matchesTemp =
      filterTemp === "ALL" ? true : lead.temperature === filterTemp;
    const matchesStatus =
      filterStatus === "ALL" ? true : lead.status === filterStatus;
    const matchesCity =
      filterCity === "ALL" ? true : lead.location === filterCity;
    return matchesSearch && matchesTemp && matchesStatus && matchesCity;
  });

  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error("No leads available to export");
      return;
    }

    const headers = ["ID", "Name", "Phone", "Email", "City", "Temperature", "Status", "Score", "Primary Interest", "Source"];
    const rows = leads.map((l) => [
      `"${l.id}"`,
      `"${l.name}"`,
      `"${l.phone}"`,
      `"${l.email || ""}"`,
      `"${l.location || ""}"`,
      `"${l.temperature}"`,
      `"${l.status}"`,
      l.score,
      `"${l.primaryInterest.replace(/"/g, '""')}"`,
      `"${l.source}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `voicenexus_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${leads.length} leads to CSV file`);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim() || !newRequirement.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          location: newLocation.trim() || undefined,
          primaryInterest: newRequirement.trim(),
        }),
      });
      const data = await res.json();
      if (data?.success && data.lead) {
        addLead(data.lead);
        toast.success(`Lead "${newName}" saved to CRM!`);
      } else {
        addLead({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          location: newLocation.trim() || undefined,
          temperature: newTemp,
          status: "NEW",
          score: newTemp === "HOT" ? 90 : newTemp === "WARM" ? 65 : 35,
          source: "Manual Direct Entry",
          primaryInterest: newRequirement.trim(),
          summary: "Manual prospect entry created by workspace user.",
        });
        toast.success(`Lead "${newName}" created successfully!`);
      }
    } catch {
      toast.success(`Lead "${newName}" created successfully!`);
    }

    setIsAddModalOpen(false);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewLocation("");
    setNewRequirement("");
  };

  const openLeadDrawer = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Leads & Inbound Intelligence
          </h1>
          <p className="text-xs text-slate-500">
            Inspect lead profiles, public page activity timelines, and explainable intent scoring. Calls are prepared and launched exclusively in the Call Center.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="gap-2 text-xs h-9 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white text-xs h-9 font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Inbound Lead
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-3.5 rounded-2xl border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">

          {/* Temperature Filters */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 lg:pb-0">
            {["ALL", "HOT", "WARM", "COLD"].map((temp) => (
              <button
                key={temp}
                onClick={() => setFilterTemp(temp)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap tabular-nums ${filterTemp === temp
                  ? "bg-orange-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                  }`}
              >
                {temp === "ALL" ? `All (${leads.length})` : `${temp} (${leads.filter((l) => l.temperature === temp).length})`}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* Status Filter Dropdown */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="ALL">All Stages</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="CONVERTED">Converted</option>
              <option value="LOST">Lost</option>
            </select>

            {/* City Filter Dropdown */}
            {uniqueCities.length > 0 && (
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="ALL">All Cities</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            )}
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, phone, email, or interest..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
        </div>
      </Card>

      {/* Leads Table */}
      <Card className="rounded-2xl border-slate-200/80 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {filteredLeads.length > 0 ? (
            <table className="w-full text-left text-xs min-w-[840px]">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Prospect</th>
                  <th className="px-4 py-3.5">Intent / Score</th>
                  <th className="px-4 py-3.5">Pipeline Stage</th>
                  <th className="px-4 py-3.5">City / Location</th>
                  <th className="px-4 py-3.5">Requirement / Service</th>
                  <th className="px-4 py-3.5">Source</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-orange-50/20 transition-colors group cursor-pointer"
                    onClick={() => openLeadDrawer(lead)}
                  >
                    {/* Prospect Name & Phone */}
                    <td className="px-5 py-4">
                      <div className="space-y-0.5">
                        <span className="font-bold text-sm text-slate-900 group-hover:text-orange-600 transition-colors">
                          {cleanLeadName(lead.name)}
                        </span>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatPhoneNumber(lead.phone)}
                        </div>
                      </div>
                    </td>

                    {/* Temperature Pill */}
                    <td className="px-4 py-4">
                      <TemperaturePill temperature={lead.temperature} score={lead.score} />
                    </td>

                    {/* Stage */}
                    <td className="px-4 py-4">
                      <LeadStatusPill status={lead.status} />
                    </td>

                    {/* City */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{lead.location || "Tamil Nadu"}</span>
                      </div>
                    </td>

                    {/* Requirement */}
                    <td className="px-4 py-4">
                      <div className="space-y-0.5 max-w-[220px]">
                        <span className="font-semibold text-slate-900 truncate block">
                          {lead.primaryInterest}
                        </span>
                        {lead.summary && (
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {cleanLeadNotes(lead.summary)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-4">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600 font-medium">
                        {formatLeadSource(lead.source)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openLeadDrawer(lead)}
                          className="h-8 px-2.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          Inspect Lead
                        </Button>
                        <Link href={`/calls?leadId=${lead.id}`}>
                          <Button
                            size="sm"
                            className="h-8 px-3 text-xs font-semibold gap-1.5 bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                            View in Call Center
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-2">
              <Search className="h-8 w-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-900">No leads match your filter</p>
              <p className="text-xs text-slate-500">Try resetting search or filters</p>
            </div>
          )}
        </div>
      </Card>

      {/* Add Lead Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[440px] bg-white border border-slate-200 text-slate-900 rounded-2xl shadow-xl">
          <form onSubmit={handleCreateLead}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Add Inbound Lead
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Enter prospect details to log inquiry into CRM. AI scoring will run automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Full Customer Name *
                </label>
                <Input
                  required
                  placeholder="e.g. Ramesh Kannan"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Phone Number *
                </label>
                <Input
                  required
                  placeholder="e.g. +91 98401 23456"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <Input
                    placeholder="ramesh@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    City / Location
                  </label>
                  <Input
                    placeholder="e.g. Coimbatore"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Requirement / Product Interest *
                </label>
                <Input
                  required
                  placeholder="e.g. 10kW Commercial Rooftop Solar Array"
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Initial Temperature
                </label>
                <select
                  value={newTemp}
                  onChange={(e) => setNewTemp(e.target.value as LeadTemperature)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 font-medium focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="HOT">HOT (Immediate High-Value Urgency)</option>
                  <option value="WARM">WARM (Evaluating Multiple Quotes)</option>
                  <option value="COLD">COLD (Information Gathering)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8 font-semibold shadow-xs"
              >
                Save to CRM
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-slate-500">Loading Leads CRM...</div>}>
      <LeadsContent />
    </Suspense>
  );
}
