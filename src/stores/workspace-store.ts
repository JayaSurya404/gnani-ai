"use client";

import { create } from "zustand";
import type { Lead, Agent, CallRecord, WorkspaceMetrics } from "@/lib/types";

export interface ProductService {
  id: string;
  name: string;
  desc: string;
  price: string;
}

export interface CampaignLink {
  id: string;
  name: string;
  channel: string;
  clicks: number;
  leads: number;
  rate: string;
  slug: string;
}

export interface RecoveryItem {
  id: string;
  phone: string;
  activity: string;
  time: string;
  recovered: boolean;
}

export interface AutomationRule {
  id: string;
  title: string;
  trigger: string;
  action: string;
  status: "ACTIVE" | "PAUSED";
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "AGENT";
}

interface WorkspaceState {
  // Primary collections
  leads: Lead[];
  agents: Agent[];
  calls: CallRecord[];
  products: ProductService[];
  campaigns: CampaignLink[];
  recoveryItems: RecoveryItem[];
  automations: AutomationRule[];
  teamMembers: TeamMember[];

  // Active call state
  activeCallId: string | null;
  isSyntheticData: boolean;

  // Actions
  initWorkspaceData: (data: {
    leads: Lead[];
    agents: Agent[];
    calls: CallRecord[];
    isSynthetic?: boolean;
  }) => void;
  addLead: (lead: Omit<Lead, "id" | "lastActivityAt">) => Lead;
  updateLeadStatus: (id: string, status: Lead["status"]) => void;
  deleteLead: (id: string) => void;

  updateAgentPrompt: (id: string, prompt: string) => void;
  publishAgentVersion: (id: string, newVersion: string) => void;

  addCallRecord: (call: Omit<CallRecord, "id" | "createdAt">) => void;

  addProduct: (product: Omit<ProductService, "id">) => void;
  addCampaign: (campaign: Omit<CampaignLink, "id" | "clicks" | "leads" | "rate">) => void;
  reengageLead: (recoveryId: string) => void;
  toggleAutomation: (id: string) => void;
  addAutomation: (rule: Omit<AutomationRule, "id">) => void;
  inviteMember: (member: Omit<TeamMember, "id">) => void;

  // Derived metrics
  getMetrics: () => WorkspaceMetrics;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  leads: [],
  agents: [],
  calls: [],
  activeCallId: null,
  isSyntheticData: false,

  initWorkspaceData: (data) => {
    set({
      leads: data.leads,
      agents: data.agents,
      calls: data.calls,
      isSyntheticData: data.isSynthetic ?? false,
    });
  },

  products: [
    {
      id: "prod-1",
      name: "3kW Residential Solar Inverter System",
      desc: "Mono PERC panels suitable for 2-3 BHK homes. Monthly generation ~360-400 units.",
      price: "₹1,85,000 – ₹2,10,000",
    },
    {
      id: "prod-2",
      name: "5kW Hybrid Rooftop Solar System",
      desc: "High efficiency grid-tied inverter with battery backup provision and bi-directional meter.",
      price: "₹2,95,000 – ₹3,30,000",
    },
    {
      id: "prod-3",
      name: "Commercial & Industrial (10kW – 50kW) EPC",
      desc: "Turnkey solar EPC for schools, factories, and commercial establishments.",
      price: "Custom quotation",
    },
  ],

  campaigns: [
    { id: "camp-1", name: "Google Ads (Solar 5kW)", channel: "Google Search", clicks: 1240, leads: 84, rate: "68%", slug: "gads-5kw" },
    { id: "camp-2", name: "PM Surya Ghar WhatsApp Push", channel: "WhatsApp Direct", clicks: 620, leads: 72, rate: "74%", slug: "wa-subsidy" },
    { id: "camp-3", name: "Coimbatore Industrial Expo", channel: "QR Code / Offline", clicks: 310, leads: 38, rate: "58%", slug: "cbe-expo" },
  ],

  recoveryItems: [
    { id: "rec-1", phone: "+91 97901 54321", activity: "Viewed 5kW system for 4 mins, entered phone, closed tab", time: "45 mins ago", recovered: false },
    { id: "rec-2", phone: "+91 94432 98765", activity: "Clicked 'Calculate Subsidy', submitted pin code 641001", time: "2 hours ago", recovered: false },
  ],

  automations: [
    {
      id: "auto-1",
      title: "Post-Call Survey Assignment",
      trigger: "When call outcome disposition equals 'INTERESTED'",
      action: "Create high-priority site survey task for Field Engineer and notify via email",
      status: "ACTIVE",
    },
    {
      id: "auto-2",
      title: "High-Intent Lead Immediate Dial",
      trigger: "When visitor submits form with score >= 85",
      action: "Queue browser or outbound voice call within 5 minutes (subject to business hours)",
      status: "ACTIVE",
    },
    {
      id: "auto-3",
      title: "DNC Auto-Compliance",
      trigger: "When caller requests opt-out or disposition is 'DO_NOT_CALL'",
      action: "Immediately flag lead as DO_NOT_CALL and suppress all outbound actions",
      status: "ACTIVE",
    },
  ],

  teamMembers: [
    { id: "mem-1", name: "Surya", email: "surya@voicenexus.ai", role: "OWNER" },
    { id: "mem-2", name: "Praveen", email: "praveen@aadhirasolar.com", role: "MANAGER" },
    { id: "mem-3", name: "Meena", email: "meena@aadhirasolar.com", role: "AGENT" },
  ],

  addLead: (leadInput) => {
    const newLead: Lead = {
      ...leadInput,
      id: `lead-${Date.now()}`,
      lastActivityAt: "Just now",
    };
    set((state) => ({ leads: [newLead, ...state.leads] }));
    return newLead;
  },

  updateLeadStatus: (id, status) => {
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? { ...l, status } : l)),
    }));
  },

  deleteLead: (id) => {
    set((state) => ({
      leads: state.leads.filter((l) => l.id !== id),
    }));
  },

  updateAgentPrompt: (id) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, updatedAt: "Just now" } : a
      ),
    }));
  },

  publishAgentVersion: (id, newVersion) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, activeVersion: newVersion, updatedAt: "Just now" } : a
      ),
    }));
  },

  addCallRecord: (callInput) => {
    const newRecord: CallRecord = {
      ...callInput,
      id: `call-${Date.now()}`,
      createdAt: "Just now",
    };
    set((state) => ({ calls: [newRecord, ...state.calls] }));
  },

  addProduct: (productInput) => {
    const newProduct: ProductService = {
      ...productInput,
      id: `prod-${Date.now()}`,
    };
    set((state) => ({ products: [...state.products, newProduct] }));
  },

  addCampaign: (campaignInput) => {
    const newCampaign: CampaignLink = {
      ...campaignInput,
      id: `camp-${Date.now()}`,
      clicks: 0,
      leads: 0,
      rate: "0%",
    };
    set((state) => ({ campaigns: [newCampaign, ...state.campaigns] }));
  },

  reengageLead: (recoveryId) => {
    const recovery = get().recoveryItems.find((r) => r.id === recoveryId);
    if (!recovery) return;

    // Create a new lead from the recovery record
    get().addLead({
      name: "Recovered Prospect",
      phone: recovery.phone,
      temperature: "HOT",
      status: "NEW",
      score: 82,
      source: "Lead Recovery Re-engagement",
      primaryInterest: "Rooftop Solar Inquiry (Recovered)",
      summary: recovery.activity,
    });

    // Mark as recovered
    set((state) => ({
      recoveryItems: state.recoveryItems.map((r) =>
        r.id === recoveryId ? { ...r, recovered: true } : r
      ),
    }));
  },

  toggleAutomation: (id) => {
    set((state) => ({
      automations: state.automations.map((a) =>
        a.id === id
          ? { ...a, status: a.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }
          : a
      ),
    }));
  },

  addAutomation: (ruleInput) => {
    const newRule: AutomationRule = {
      ...ruleInput,
      id: `auto-${Date.now()}`,
    };
    set((state) => ({ automations: [newRule, ...state.automations] }));
  },

  inviteMember: (memberInput) => {
    const newMember: TeamMember = {
      ...memberInput,
      id: `mem-${Date.now()}`,
    };
    set((state) => ({ teamMembers: [...state.teamMembers, newMember] }));
  },

  getMetrics: () => {
    const { leads, calls } = get();
    const hotLeads = leads.filter((l) => l.temperature === "HOT").length;
    const qualifiedLeads = leads.filter((l) => l.status === "QUALIFIED").length;
    const totalCalls = calls.length;
    const avgDuration =
      totalCalls > 0
        ? Math.round(calls.reduce((acc, c) => acc + c.durationSeconds, 0) / totalCalls)
        : 0;

    return {
      totalLeads: leads.length,
      hotLeads,
      totalCalls,
      avgCallDurationSec: avgDuration,
      conversionRate: leads.length > 0 ? Number(((qualifiedLeads / leads.length) * 100).toFixed(1)) : 0,
      qualifiedRate: totalCalls > 0 ? Number(((qualifiedLeads / totalCalls) * 100).toFixed(1)) : 0,
    };
  },
}));
