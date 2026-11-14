export type LeadTemperature = "HOT" | "WARM" | "COLD";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "FOLLOW_UP" | "CONVERTED" | "LOST" | "DO_NOT_CALL";
export type CallStatus = "QUEUED" | "INITIATING" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "BUSY" | "NO_ANSWER" | "FAILED" | "CANCELED";
export type LanguageMode = "AUTO" | "ENGLISH" | "TAMIL" | "TANGLISH";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  temperature: LeadTemperature;
  status: LeadStatus;
  score: number;
  source: string;
  primaryInterest: string;
  location?: string;
  lastActivityAt: string;
  summary?: string;
  notes?: string;
  doNotCall?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  industry?: string;
  description?: string;
  languageMode: LanguageMode;
  voiceId: string;
  voiceName: string;
  activeVersion: string;
  activeVersionId?: string;
  systemPrompt?: string;
  greetingMessage?: string;
  turnTimeoutMs?: number;
  maxDurationSeconds?: number;
  versionCount?: number;
  status: "ACTIVE" | "DRAFT" | "PAUSED" | "ARCHIVED";
  callCount: number;
  avgDurationSec: number;
  updatedAt: string;
}

export interface CallRecord {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  agentId: string;
  agentName: string;
  status: CallStatus;
  durationSeconds: number;
  disposition?: string;
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";
  confidence?: number;
  createdAt: string;
  summary?: string;
}

export interface WorkspaceMetrics {
  totalLeads: number;
  hotLeads: number;
  totalCalls: number;
  avgCallDurationSec: number;
  conversionRate: number;
  qualifiedRate: number;
}

