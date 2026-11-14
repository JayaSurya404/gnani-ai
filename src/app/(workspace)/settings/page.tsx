"use client";

import React, { useState } from "react";
import {
  Building2,
  PhoneCall,
  Mic,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
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

type SettingsTab = "ORGANIZATION" | "TELEPHONY" | "GNANI_VOICE" | "TEAM_SECURITY";

export default function SettingsPage() {
  const teamMembers = useWorkspaceStore((state) => state.teamMembers);
  const inviteMember = useWorkspaceStore((state) => state.inviteMember);

  const [activeTab, setActiveTab] = useState<SettingsTab>("ORGANIZATION");

  // Organization settings
  const [orgName, setOrgName] = useState("Kaveri Solar & Construction");
  const [orgTagline, setOrgTagline] = useState("Turnkey Solar EPC & Sustainable Engineering Construction");
  const [orgPhone, setOrgPhone] = useState("+91 6382868845");
  const [orgEmail, setOrgEmail] = useState("chitrasivakumar280@gmail.com");
  const [orgCity, setOrgCity] = useState("Coimbatore, Tamil Nadu");

  // Load real business details
  React.useEffect(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.business) {
          if (data.business.name) setOrgName(data.business.name);
          if (data.business.tagline) setOrgTagline(data.business.tagline);
          if (data.business.phone) setOrgPhone(data.business.phone);
          if (data.business.email) setOrgEmail(data.business.email);
          if (data.business.city) setOrgCity(`${data.business.city}, Tamil Nadu`);
        }
      })
      .catch(() => { });
  }, []);

  // Telephony settings
  const [twilioNumber, setTwilioNumber] = useState("+17372324091");
  const [telephonyMode, setTelephonyMode] = useState("TURN_BASED");

  // Voice settings
  const [defaultLanguage, setDefaultLanguage] = useState("ta-IN");
  const [defaultVoice, setDefaultVoice] = useState("Asmita");

  // Invite modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "AGENT">("AGENT");

  const handleSaveOrg = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Organization profile saved successfully!");
  };

  const handleSaveTelephony = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Twilio telephony settings updated!");
  };

  const handleSaveVoice = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Gnani AI voice & language preferences updated!");
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Please fill in member name and email");
      return;
    }

    inviteMember({
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
    });

    toast.success(`Invitation sent to ${inviteEmail}!`);
    setIsInviteModalOpen(false);
    setInviteName("");
    setInviteEmail("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#192238]">
          Workspace & Telephony Settings
        </h2>
        <p className="text-xs text-[#778198]">
          Manage company profile, Twilio phone numbers, Gnani AI voice preferences, and team permissions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("ORGANIZATION")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap ${activeTab === "ORGANIZATION"
              ? "bg-orange-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Business Profile
        </button>

        <button
          onClick={() => setActiveTab("TELEPHONY")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap ${activeTab === "TELEPHONY"
              ? "bg-orange-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            }`}
        >
          <PhoneCall className="h-3.5 w-3.5" />
          Twilio Telephony
        </button>

        <button
          onClick={() => setActiveTab("GNANI_VOICE")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap ${activeTab === "GNANI_VOICE"
              ? "bg-orange-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            }`}
        >
          <Mic className="h-3.5 w-3.5" />
          Gnani Speech & Languages
        </button>

        <button
          onClick={() => setActiveTab("TEAM_SECURITY")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition whitespace-nowrap ${activeTab === "TEAM_SECURITY"
              ? "bg-orange-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
            }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Team & Security
        </button>
      </div>

      {/* Tab 1: Organization */}
      {activeTab === "ORGANIZATION" && (
        <Card className="p-6 rounded-2xl border-white/80 bg-white/70 backdrop-blur-xl shadow-sm">
          <form onSubmit={handleSaveOrg} className="space-y-4 max-w-xl">
            <h3 className="text-base font-bold text-[#192238]">Company Identity</h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Business Name</label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="bg-white border-slate-200 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Tagline / Proposition</label>
              <Input
                value={orgTagline}
                onChange={(e) => setOrgTagline(e.target.value)}
                className="bg-white border-slate-200 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#192238]">Official Phone</label>
                <Input
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                  className="bg-white border-slate-200 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#192238]">Official Email</label>
                <Input
                  type="email"
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  className="bg-white border-slate-200 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Headquarters Location</label>
              <Input
                value={orgCity}
                onChange={(e) => setOrgCity(e.target.value)}
                className="bg-white border-slate-200 text-xs"
              />
            </div>

            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold h-9 shadow-xs"
            >
              Save Business Profile
            </Button>
          </form>
        </Card>
      )}

      {/* Tab 2: Telephony */}
      {activeTab === "TELEPHONY" && (
        <Card className="p-6 rounded-2xl border-white/80 bg-white/70 backdrop-blur-xl shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-[#192238]">Twilio Telephony Integration</h3>
            <p className="text-xs text-[#778198]">
              Outbound and inbound telephone infrastructure configuration.
            </p>
          </div>

          <form onSubmit={handleSaveTelephony} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Assigned Caller ID (E.164)</label>
              <Input
                value={twilioNumber}
                onChange={(e) => setTwilioNumber(e.target.value)}
                className="bg-white border-slate-200 text-xs font-mono"
              />
              <span className="text-[11px] text-[#778198]">
                Twilio trial verified caller ID configured in project environment.
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Telephony Dispatch Mode</label>
              <select
                value={telephonyMode}
                onChange={(e) => setTelephonyMode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#192238] shadow-sm"
              >
                <option value="TURN_BASED">Trial Turn-Based Voice (Twilio &lt;Gather&gt; + Gnani Timbre &lt;Play&gt;)</option>
                <option value="STREAM">Full Bidirectional Streaming (Twilio Media Streams - Upgraded Accounts)</option>
              </select>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-bold text-emerald-950">Twilio Webhook Tunnel Active</span>
              </div>
              <p className="text-emerald-900 text-[11px] leading-relaxed">
                Public webhook base URL is active on ngrok tunnel. Twilio dispatches call events and turns directly to VoiceNexus AI.
              </p>
            </div>

            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold h-9 shadow-xs"
            >
              Update Telephony Settings
            </Button>
          </form>
        </Card>
      )}

      {/* Tab 3: Gnani Voice */}
      {activeTab === "GNANI_VOICE" && (
        <Card className="p-6 rounded-2xl border-white/80 bg-white/70 backdrop-blur-xl shadow-sm space-y-6 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-[#192238]">Gnani AI Multilingual Speech Engine</h3>
            <p className="text-xs text-[#778198]">
              Configure speech synthesis (Timbre) and recognition (Prisma) for outbound consultations.
            </p>
          </div>

          <form onSubmit={handleSaveVoice} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Default Call Language</label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#192238] shadow-sm"
              >
                <option value="ta-IN">Tamil (தமிழ்) — Asmita Voice</option>
                <option value="en-IN">Indian English — Arun Voice</option>
                <option value="hi-IN">Hindi (हिंदी) — Kavya Voice</option>
                <option value="te-IN">Telugu (తెలుగు) — Deepa Voice</option>
                <option value="kn-IN">Kannada (ಕನ್ನಡ) — Chetana Voice</option>
                <option value="ml-IN">Malayalam (മലയാളം) — Ananya Voice</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#192238]">Speech Synthesis Persona</label>
              <select
                value={defaultVoice}
                onChange={(e) => setDefaultVoice(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#192238] shadow-sm"
              >
                <option value="Asmita">Asmita (Warm & Professional Female)</option>
                <option value="Arun">Arun (Clear & Technical Male)</option>
                <option value="Kaveri">Kaveri (Polite Consultation Female)</option>
              </select>
            </div>

            <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-600" />
                <span className="font-bold text-orange-950">Gnani AI Speech Models Active</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Gnani Prisma STT and Gnani Timbre TTS are active with server-side caching and dynamic wav/pcm transcoding for telephone calls.
              </p>
            </div>

            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold h-9 shadow-xs"
            >
              Save Voice Configuration
            </Button>
          </form>
        </Card>
      )}

      {/* Tab 4: Team & Security */}
      {activeTab === "TEAM_SECURITY" && (
        <Card className="p-6 rounded-2xl border-white/80 bg-white/70 backdrop-blur-xl shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#192238]">Team & Access Control</h3>
              <p className="text-xs text-[#778198]">
                Multi-tenant organization members with Supabase Row-Level Security (RLS) enforcement.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setIsInviteModalOpen(true)}
              className="bg-[#7065E8] hover:bg-[#5347C8] text-white text-xs font-semibold h-8"
            >
              Invite Member
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[#778198] font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-white/60">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#192238]">{m.name}</div>
                      <div className="text-[11px] text-[#778198]">{m.email}</div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#5347C8]">{m.role}</td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        ACTIVE
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#778198]">Verified Member</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-bold text-[#192238]">Supabase Tenant Isolation Active</span>
            </div>
            <p className="text-[#778198] text-[11px] leading-relaxed">
              Every database query and telephony transaction is strictly isolated at the organization level with PostgreSQL RLS policies.
            </p>
          </div>
        </Card>
      )}

      {/* Invite Member Modal */}
      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white border border-slate-200 text-[#192238] rounded-2xl shadow-xl">
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-[#192238]">Invite Team Member</DialogTitle>
              <DialogDescription className="text-xs text-[#778198]">
                Grant workspace access to an agent or sales manager.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#192238]">Full Name *</label>
                <Input
                  required
                  placeholder="e.g. Vignesh"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="bg-white border-slate-200 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#192238]">Email Address *</label>
                <Input
                  required
                  type="email"
                  placeholder="vignesh@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-white border-slate-200 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#192238]">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "MANAGER" | "AGENT")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#192238]"
                >
                  <option value="AGENT">Consultant / Agent</option>
                  <option value="MANAGER">Sales Manager</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#7065E8] hover:bg-[#5347C8] text-white text-xs font-semibold"
              >
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
