import {
  LayoutDashboard,
  Users,
  Globe,
  PhoneCall,
  MessageSquare,
  Settings,
  LucideIcon,
} from "lucide-react";
import type { Lead, Agent, CallRecord, WorkspaceMetrics } from "./types";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  exact?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "MAIN",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { title: "Leads", href: "/leads", icon: Users, badge: "Active" },
      { title: "Public Page", href: "/business-pages", icon: Globe },
      { title: "Calls", href: "/calls", icon: PhoneCall },
      { title: "Conversations", href: "/conversations", icon: MessageSquare, badge: "Live" },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const SYNTHETIC_METRICS: WorkspaceMetrics = {
  totalLeads: 24,
  hotLeads: 8,
  totalCalls: 18,
  avgCallDurationSec: 142,
  conversionRate: 33.4,
  qualifiedRate: 68.2,
};

export const SYNTHETIC_LEADS: Lead[] = [
  {
    id: "lead-001",
    name: "Karthik Subramanian",
    phone: "+916382868845",
    email: "karthik.subramanian@gmail.com",
    temperature: "HOT",
    status: "QUALIFIED",
    score: 92,
    source: "Public Solar Consultation Page",
    primaryInterest: "5kW Rooftop Solar Installation",
    location: "Chennai, Tamil Nadu",
    lastActivityAt: "10 mins ago",
    summary: "Requested urgent site inspection; 3-phase connection already available. Looking for PM Surya Ghar subsidy.",
  },
  {
    id: "lead-002",
    name: "Priya Sundaram",
    phone: "+919841234567",
    email: "priya.sundaram@outlook.com",
    temperature: "HOT",
    status: "NEW",
    score: 88,
    source: "Direct Inbound Form",
    primaryInterest: "Commercial Energy Audit",
    location: "Coimbatore, Tamil Nadu",
    lastActivityAt: "25 mins ago",
    summary: "Looking for peak demand reduction for manufacturing unit.",
  },
  {
    id: "lead-003",
    name: "Vignesh Rajendran",
    phone: "+919884112233",
    email: "vignesh.r@yahoo.com",
    temperature: "WARM",
    status: "CONTACTED",
    score: 68,
    source: "Public Page Inbound",
    primaryInterest: "3kW Residential Solar Inverter",
    location: "Madurai, Tamil Nadu",
    lastActivityAt: "2 hours ago",
    summary: "Comparing subsidy options; prefers evening phone consultation.",
  },
  {
    id: "lead-004",
    name: "Ananya Narayanan",
    phone: "+919790887766",
    temperature: "WARM",
    status: "FOLLOW_UP",
    score: 61,
    source: "Campaign Form",
    primaryInterest: "Annual Maintenance Contract",
    location: "Salem, Tamil Nadu",
    lastActivityAt: "5 hours ago",
    summary: "Existing 10kW system needs inverter replacement quote.",
  },
  {
    id: "lead-005",
    name: "Rajesh Kannan",
    phone: "+919444123890",
    temperature: "COLD",
    status: "LOST",
    score: 34,
    source: "Organic Search",
    primaryInterest: "General Pricing Inquiry",
    location: "Trichy, Tamil Nadu",
    lastActivityAt: "1 day ago",
    summary: "Browsed catalog page once; no specific requirement entered.",
  },
];

export const SYNTHETIC_AGENTS: Agent[] = [
  {
    id: "agent-001",
    name: "Selvi — Solar Specialist",
    role: "Senior Lead Qualification Specialist",
    languageMode: "AUTO",
    voiceId: "gnani_female_ta_01",
    voiceName: "Kavitha (Gnani Timbre Ta/Tanglish)",
    activeVersion: "v1.4.2",
    status: "ACTIVE",
    callCount: 14,
    avgDurationSec: 154,
    updatedAt: "2 hours ago",
  },
  {
    id: "agent-002",
    name: "Arun — Commercial Inquiries",
    role: "Enterprise B2B Qualifier",
    languageMode: "ENGLISH",
    voiceId: "gnani_male_en_02",
    voiceName: "Arun (Gnani Timbre Professional En)",
    activeVersion: "v2.1.0",
    status: "ACTIVE",
    callCount: 8,
    avgDurationSec: 186,
    updatedAt: "Yesterday",
  },
];

export const SYNTHETIC_CALLS: CallRecord[] = [
  {
    id: "call-901",
    leadId: "lead-001",
    leadName: "Karthik Subramanian",
    leadPhone: "+91 91638 28688",
    agentId: "agent-001",
    agentName: "VoiceNexus AI Specialist",
    status: "COMPLETED",
    durationSeconds: 168,
    disposition: "INTERESTED",
    sentiment: "POSITIVE",
    confidence: 0.94,
    createdAt: "Today, 11:24 AM",
    summary: "Confirmed 5kW grid-tied system interest. Agreed to Saturday site survey.",
  },
  {
    id: "call-902",
    leadId: "lead-003",
    leadName: "Vignesh Rajendran",
    leadPhone: "+91 98841 12233",
    agentId: "agent-001",
    agentName: "VoiceNexus AI Specialist",
    status: "COMPLETED",
    durationSeconds: 132,
    disposition: "FOLLOW_UP",
    sentiment: "NEUTRAL",
    confidence: 0.82,
    createdAt: "Today, 09:45 AM",
    summary: "Discussed PM Surya Ghar subsidy; requested detailed quotation.",
  },
];
