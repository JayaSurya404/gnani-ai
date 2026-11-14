"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Flame,
  PhoneCall,
  TrendingUp,
  ArrowRight,
  Globe,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TemperaturePill, LeadStatusPill } from "@/components/ui/status-pill";
import { formatPhoneNumber, formatDuration } from "@/lib/utils";
import type { Lead, CallRecord } from "@/lib/types";

export default function DashboardPage() {
  const [realLeads, setRealLeads] = useState<Lead[]>([]);
  const [realCalls, setRealCalls] = useState<CallRecord[]>([]);
  const [businessName, setBusinessName] = useState("Kaveri Solar & Construction");
  const [portalSlug, setPortalSlug] = useState("kaveri-solar-construction");

  useEffect(() => {
    // 1. Fetch real leads
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.leads)) {
          setRealLeads(data.leads);
        }
      })
      .catch(() => {});

    // 2. Fetch real calls
    fetch("/api/calls")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.calls)) {
          const mapped: CallRecord[] = data.calls.map((s: Record<string, unknown>) => {
            const outcome = Array.isArray(s.call_outcomes) ? s.call_outcomes[0] : (s.call_outcomes as Record<string, unknown> | undefined);
            return {
              id: String(s.id),
              leadId: String(s.lead_id || s.id),
              leadName: String(s.customer_name || "Customer"),
              leadPhone: String(s.customer_phone || "+91..."),
              agentId: "agent-001",
              agentName: "VoiceNexus AI Specialist",
              status: (s.status as CallRecord["status"]) || "COMPLETED",
              durationSeconds: Number(s.duration_seconds || 0),
              disposition: (outcome?.disposition as CallRecord["disposition"]) || "QUALIFIED",
              sentiment: (outcome?.sentiment as CallRecord["sentiment"]) || "POSITIVE",
              confidence: 0.92,
              createdAt: s.start_time ? new Date(String(s.start_time)).toLocaleString() : new Date(String(s.created_at)).toLocaleString(),
              summary: String(outcome?.summary || "Outbound consultation completed over carrier telephone network."),
            };
          });
          setRealCalls(mapped);
        }
      })
      .catch(() => {});

    // 3. Fetch active business
    fetch("/api/business")
      .then((r) => r.json())
      .then((data) => {
        if (data?.business?.name) setBusinessName(data.business.name);
        if (data?.page?.slug) setPortalSlug(data.page.slug);
      })
      .catch(() => {});
  }, []);

  const hotLeads = realLeads.filter((l) => l.temperature === "HOT");
  const qualifiedLeads = realLeads.filter((l) => l.status === "QUALIFIED" || l.status === "CONVERTED");
  const conversionRate = realLeads.length > 0 ? Math.round((qualifiedLeads.length / realLeads.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                VoiceNexus AI Intelligence
              </span>
              <span className="text-xs text-slate-500 font-medium">• {businessName}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome to your Workspace
            </h2>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Every customer enquiry deserves a better conversation. Review incoming inquiries, inspect explainable intent scoring, and connect with prospects via carrier telephony.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={`/p/${portalSlug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-900">
                <Globe className="h-3.5 w-3.5 text-orange-600" />
                Public Inbound Portal
              </Button>
            </Link>
            <Link href="/calls">
              <Button size="sm" className="h-9 gap-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs">
                <PhoneCall className="h-3.5 w-3.5" />
                Open Call Center
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Metric 1: Total Leads */}
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Enquiries</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {realLeads.length}
              </span>
              <span className="text-xs font-medium text-emerald-600">
                Database active
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Captured across web &amp; public portal</p>
          </CardContent>
        </Card>

        {/* Metric 2: Hot Leads */}
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High Intent Leads</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {hotLeads.length}
              </span>
              <span className="text-xs font-medium text-rose-600">
                Priority outreach
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Scores ≥ 80 with high commercial urgency</p>
          </CardContent>
        </Card>

        {/* Metric 3: Total Calls */}
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">PSTN AI Calls</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <PhoneCall className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {realCalls.length}
              </span>
              <span className="text-xs font-medium text-emerald-600">
                100% reconciled
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Dispatched via Twilio &amp; Gnani Timbre</p>
          </CardContent>
        </Card>

        {/* Metric 4: Conversion Rate */}
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Qualification Rate</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {conversionRate}%
              </span>
              <span className="text-xs font-medium text-orange-600">
                {qualifiedLeads.length} of {realLeads.length} qualified
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Confirmed buyer requirements</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid: Recent Leads & Recent Telephony Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Inbound Leads Queue */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Recent Inbound Inquiries
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Prospects who requested a consultation or quotation
                </CardDescription>
              </div>
              <Link href="/leads">
                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:bg-orange-50 gap-1">
                  View All CRM
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {realLeads.length > 0 ? (
                  realLeads.slice(0, 6).map((lead) => (
                    <div
                      key={lead.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-orange-50/20 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/leads?leadId=${lead.id}`}
                            className="font-bold text-sm text-slate-900 hover:text-orange-600 transition-colors"
                          >
                            {lead.name}
                          </Link>
                          <TemperaturePill temperature={lead.temperature} score={lead.score} />
                          <LeadStatusPill status={lead.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatPhoneNumber(lead.phone)} • <span className="font-medium text-slate-800">{lead.primaryInterest}</span>
                          {lead.location && ` • ${lead.location}`}
                        </p>
                        {lead.summary && (
                          <p className="text-xs text-slate-500 line-clamp-1 italic">
                            &ldquo;{lead.summary}&rdquo;
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/leads?leadId=${lead.id}`}>
                          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                            Inspect Lead
                          </Button>
                        </Link>
                        <Link href={`/calls?leadId=${lead.id}`}>
                          <Button size="sm" className="h-8 px-3 text-xs font-semibold gap-1.5 bg-orange-600 hover:bg-orange-700 text-white shadow-xs">
                            <PhoneCall className="h-3.5 w-3.5" />
                            Call in Call Center
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No leads in this organization yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Telephony & Call Highlights */}
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900">
                  Recent Calls
                </CardTitle>
                <Link href="/calls">
                  <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold text-orange-600 hover:bg-orange-50 p-1 px-2">
                    All Calls
                  </Button>
                </Link>
              </div>
              <CardDescription className="text-xs text-slate-500">
                PSTN telephone calls recorded in database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {realCalls.length > 0 ? (
                realCalls.slice(0, 4).map((call) => (
                  <div
                    key={call.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{call.leadName}</span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
                        Completed ({formatDuration(call.durationSeconds)})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {call.summary}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>{call.createdAt}</span>
                      <Link href="/calls" className="font-medium text-orange-600 hover:underline">
                        View Transcript
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  No telephone calls recorded yet.
                </div>
              )}

              <div className="rounded-xl border border-orange-200/80 bg-orange-50/50 p-3.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  <span className="text-xs font-bold text-orange-950">Carrier Telephony Engine</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Real telephone calling using Gnani AI Tamil, Hindi, and English speech models connected directly to carrier networks via Twilio.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
