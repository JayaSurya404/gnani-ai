"use client";

import React from "react";
import Link from "next/link";
import { VoiceNexusLogo } from "@/components/brand/logo";
import {
  PhoneCall,
  PhoneForwarded,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Globe2,
  BarChart3,
  CheckCircle2,
  Mic,
  Users,
  Building2,
  Lock,
  Layers,
  FileText,
  ExternalLink,
  Bot,
  SunMedium,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0F172A] selection:bg-orange-500/20 selection:text-orange-700 flex flex-col justify-between">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-[#FAF9F5]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <VoiceNexusLogo />
          </Link>

          <div className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600">
            <a href="#about" className="hover:text-slate-900 transition-colors">What is VoiceNexus</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#modules" className="hover:text-slate-900 transition-colors">Product Modules</a>
            <a href="#use-case" className="hover:text-slate-900 transition-colors">Kaveri Solar Case Study</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Security &amp; Isolation</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/p/kaveri-solar-construction" target="_blank" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="text-xs font-semibold text-slate-700 hover:text-slate-900 gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-orange-600" />
                Live Business Page
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-900">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs shadow-orange-500/20">
                Launch Workspace
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* SECTION A: HERO */}
      <section className="relative overflow-hidden pt-14 pb-20 lg:pt-24 lg:pb-32">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1100px] rounded-full bg-gradient-to-b from-orange-400/15 via-amber-200/10 to-transparent blur-3xl" />
          <div className="absolute top-1/3 right-0 h-[450px] w-[450px] rounded-full bg-orange-500/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            {/* Pill Badges */}
            <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-orange-200 bg-orange-50/90 px-4 py-1.5 text-xs font-semibold text-orange-900 shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <span>VoiceNexus AI</span>
              <span className="text-orange-300">•</span>
              <span className="text-orange-700">Multilingual Inbound Qualification &amp; Business Calling</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl sm:leading-[1.12]">
              Turn Business Enquiries Into Meaningful Customer Conversations
            </h1>

            {/* Subhead */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              A comprehensive business communication platform combining lead capture, intelligent scoring, and human-like AI voice conversations in Tamil, English, Hindi, and regional Indian languages.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-500/25">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Explore Sample Workspace
                </Button>
              </Link>
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-900">
                  <Building2 className="mr-2 h-4 w-4 text-slate-700" />
                  Create Your Workspace
                </Button>
              </Link>
              <Link href="/p/kaveri-solar-construction" target="_blank" className="w-full sm:w-auto">
                <Button size="lg" variant="ghost" className="w-full sm:w-auto h-12 px-5 text-sm font-semibold text-slate-700 hover:text-slate-900">
                  <ExternalLink className="mr-2 h-4 w-4 text-orange-600" />
                  View Live Business Page
                </Button>
              </Link>
            </div>

            {/* Core Capability Badges */}
            <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Owner-Controlled Calling (No Automated Spam)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Native Indic Speech (Gnani Timbre &amp; Prisma)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Complete Tenant Isolation</span>
              </div>
            </div>
          </div>

          {/* Platform Capability Overview Card */}
          <div className="mt-14 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xl shadow-slate-900/5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-6">
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-orange-50/60 border border-orange-100">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Smart Lead CRM</div>
                  <div className="text-[11px] text-slate-500">Pipeline, scores &amp; temperatures</div>
                </div>
              </div>
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">AI Calling Workspace</div>
                  <div className="text-[11px] text-slate-500">Pre-call review &amp; live telephone desk</div>
                </div>
              </div>
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Public Business Page</div>
                  <div className="text-[11px] text-slate-500">Branded enquiry showcase &amp; catalog</div>
                </div>
              </div>
            </div>

            {/* Quick Preview Call Transcript Banner */}
            <div className="mt-6 rounded-2xl bg-slate-950 text-white p-5 sm:p-6 font-sans text-xs overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold text-sm text-slate-100">Live Telephony Interaction</span>
                  <span className="text-[11px] text-slate-400">• Kumbakonam Agricultural Pump Consultation</span>
                </div>
                <span className="text-[11px] font-mono text-orange-400 bg-orange-950/80 px-2 py-0.5 rounded border border-orange-800/60">
                  Tamil • Asmita Voice
                </span>
              </div>
              <div className="space-y-3 font-sans text-xs">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-orange-600/30 text-orange-300 font-mono text-[10px] font-bold border border-orange-500/30">
                    AI Agent (Asmita)
                  </span>
                  <p className="text-slate-200">
                    வணக்கம் லக்ஷ்மி நாராயணன் ஐயா! நான் காவேரி சோலார் நிறுவனத்திலிருந்து அஸ்மிதா பேசுறேன். உங்கள் விவசாய நிலத்துக்கு 5HP சோலார் பம்ப் அமைப்பது பத்தி விசாரிச்சிருந்தீங்க. அத பத்தி பேசலாமா?
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">
                    Customer (Lakshmi)
                  </span>
                  <p className="text-slate-100 font-medium">
                    பேசலாம்மா, இப்போ டீசல் என்ஜினுக்கு செலவு அதிகம் ஆகுது. PM-KUSUM அரசு மானியம் பத்தி தெரிஞ்சுக்கணும்.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-orange-600/30 text-orange-300 font-mono text-[10px] font-bold border border-orange-500/30">
                    AI Agent (Asmita)
                  </span>
                  <p className="text-slate-200">
                    நிச்சயமாகங்க ஐயா! PM-KUSUM திட்டத்தில் 60% வரை மானியம் கிடைக்குது. எங்கள் பொறியாளர் குழு இந்த சனிக்கிழமை உங்கள் நிலத்திற்கு வந்து இலவச ஆய்வு மேற்கொள்ள ஏற்பாடு செய்யட்டுமா?
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: WHAT IS VOICENEXUS AI? */}
      <section id="about" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Complete Platform Overview</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              What is VoiceNexus AI?
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              VoiceNexus AI is an integrated business communication platform designed for regional enterprises. It connects web-based customer inquiries to intelligent, natural phone calls in Indian languages with zero manual friction.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Point 1 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 font-bold">
                1
              </div>
              <h3 className="font-bold text-base text-slate-900">Enquiry Capture Across Channels</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Capture high-intent customer requirements automatically through branded public consultation pages, digital campaigns, website forms, or direct CRM entry.
              </p>
            </div>

            {/* Point 2 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
                2
              </div>
              <h3 className="font-bold text-base text-slate-900">Lead Intelligence &amp; Scoring</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Centralize customer requirements, geographic locations, and budget indications. Each lead is classified into Hot, Warm, or Cold with explainable intent metrics.
              </p>
            </div>

            {/* Point 3 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold">
                3
              </div>
              <h3 className="font-bold text-base text-slate-900">Multilingual Voice AI Agents</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                AI agents converse naturally in Tamil, English, Hindi, Telugu, and Kannada using Gnani Timbre neural speech synthesis and Prisma acoustic recognition.
              </p>
            </div>

            {/* Point 4 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold">
                4
              </div>
              <h3 className="font-bold text-base text-slate-900">Conversational Qualification</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Rather than sending robotic robocalls, the AI asks relevant discovery questions, answers customer technical inquiries factually, and assesses project readiness.
              </p>
            </div>

            {/* Point 5 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold">
                5
              </div>
              <h3 className="font-bold text-base text-slate-900">Automated CRM Records &amp; Tasks</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every conversation generates speaker-diarized transcripts, structured outcomes (disposition, key points, next steps), and schedules owner follow-up tasks.
              </p>
            </div>

            {/* Point 6 */}
            <div className="rounded-2xl border border-slate-200/90 p-6 bg-[#FAF9F5]/50 space-y-3 hover:bg-white hover:shadow-md transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 font-bold">
                6
              </div>
              <h3 className="font-bold text-base text-slate-900">Responsible Owner Dispatch</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Calls are manually reviewed and initiated by authenticated business operators with DNC registry verification and clear AI identity disclosure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION C: HOW IT WORKS (8-STEP WORKFLOW) */}
      <section id="how-it-works" className="py-20 border-t border-slate-200/80 bg-[#FAF9F5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">End-to-End Execution Flow</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              How VoiceNexus AI Works
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              From web inquiry to qualified customer conversion in eight structured steps.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 01
                </span>
                <Users className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Lead Arrives</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Prospect discovers the verified business page, selects interest, and submits contact info with requirements.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 02
                </span>
                <Building2 className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Business Profile Configured</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Company catalog, products (e.g. 5HP Solar Agricultural Pump), pricing tiers, and government subsidies are grounded.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 03
                </span>
                <Bot className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Voice Agent Assigned</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Select language (Tamil, English, Hindi, etc.) and matching voice persona (Asmita, Selvi, Neerja) with prompt parameters.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 04
                </span>
                <PhoneForwarded className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Outbound Call Initiated</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Authenticated business owner reviews pre-call plan and manually dispatches the carrier call to the prospect.
              </p>
            </div>

            {/* Step 5 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 05
                </span>
                <Mic className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Natural Voice Conversation</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Real-time conversational turns powered by Gnani speech synthesis and Gemini LLM orchestration on carrier lines.
              </p>
            </div>

            {/* Step 6 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 06
                </span>
                <BarChart3 className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Lead Qualification &amp; Intent</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                AI assesses site specifications (borewell depth, electricity access), timeline, and budget feasibility.
              </p>
            </div>

            {/* Step 7 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 07
                </span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Structured Outcome &amp; Transcript</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Complete verbatim dialogue turns, disposition, sentiment rating, and action items are permanently saved.
              </p>
            </div>

            {/* Step 8 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                  Step 08
                </span>
                <CheckCircle2 className="h-4 w-4 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-900">Owner CRM Follow-up</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Lead status updates to QUALIFIED, follow-up site visit reminder created, and team assigned for immediate closing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION D: MAIN PRODUCT MODULES */}
      <section id="modules" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Enterprise Product Suite</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Main Product Modules
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every tool required to manage customer relationships and voice outreach inside one unified workspace.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Module 1 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Smart Lead CRM</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pipeline management with temperature tagging (Hot, Warm, Cold), numeric intent scoring, multi-attribute filtering, DNC registry enforcement, and chronological customer interaction history.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-orange-600" /> Transparent intent calculation</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-orange-600" /> Do-Not-Call (DNC) safeguards</li>
              </ul>
            </div>

            {/* Module 2 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <PhoneCall className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">AI Calling Workspace</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dedicated call desk for preparing call plans, reviewing customer context, selecting regional voice personas, dispatching carrier phone calls, and monitoring in-flight call sessions.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" /> Pre-call discovery questions</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" /> Real-time call duration &amp; status</li>
              </ul>
            </div>

            {/* Module 3 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Mic className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Multilingual Voice AI Engine</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deep integration with Gnani Timbre neural speech synthesis and Prisma telephony speech recognition. Accurately handles Tamil, Tanglish, Indian English, Hindi, and Telugu.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-blue-600" /> Authentic Indian phonetics</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-blue-600" /> Verified canonical voice registry</li>
              </ul>
            </div>

            {/* Module 4 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                <Globe2 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Business Website Builder</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Launch verified, mobile-first public consultation portals with zero code. Display turnkey product catalogs, regional pricing, social profiles, and instant enquiry capture forms.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-purple-600" /> Live mobile &amp; desktop preview</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-purple-600" /> Direct CRM lead synchronization</li>
              </ul>
            </div>

            {/* Module 5 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Conversation Intelligence</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Inspect verbatim turn-by-turn transcripts, speaker segmentation, sentiment attribution, structured call outcomes, key discussion points, and audio playback.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-amber-600" /> Evidence-based disposition</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-amber-600" /> Full speaker diarization</li>
              </ul>
            </div>

            {/* Module 6 */}
            <div className="rounded-2xl border border-slate-200 p-6 space-y-3.5 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Analytics &amp; Insights</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Monitor conversion funnels, call completion rates, average call durations, regional geographic distributions, and outbound campaign performance metrics.
              </p>
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-rose-600" /> Real-time conversion metrics</li>
                <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-rose-600" /> Geographic breakdown</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION E: REALISTIC BUSINESS USE CASE (KAVERI SOLAR & CONSTRUCTION) */}
      <section id="use-case" className="py-20 border-t border-slate-200/80 bg-[#FAF9F5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Context Column */}
            <div className="lg:col-span-5 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1 text-xs font-semibold text-orange-900">
                <SunMedium className="h-3.5 w-3.5 text-orange-600" />
                <span>Featured Business Deployment</span>
              </div>

              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
                Kaveri Solar &amp; Construction
              </h2>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Turnkey Solar EPC &amp; Agricultural Water Pumps • Thanjavur &amp; Coimbatore
              </p>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Kaveri Solar provides turnkey solar pumping systems to agricultural landholders across Tamil Nadu. In rural regions, high diesel costs push farmers to seek solar alternatives under government initiatives like PM-KUSUM.
              </p>

              {/* Customer Scenario Callout */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>Customer Lead Profile</span>
                  <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                    HOT LEAD (Score: 85/100)
                  </span>
                </div>
                <div className="text-slate-600 space-y-1 text-[11px]">
                  <div><strong>Customer:</strong> Lakshmi Narayanan</div>
                  <div><strong>Location:</strong> Near Kumbakonam, Thanjavur, Tamil Nadu</div>
                  <div><strong>Requirement:</strong> Replace diesel pump set with 5HP solar agricultural pump</div>
                  <div><strong>Scheme:</strong> PM-KUSUM 60% government subsidy</div>
                </div>
              </div>

              <div className="pt-1 flex flex-wrap gap-2 text-xs">
                <Link href="/p/kaveri-solar-construction" target="_blank">
                  <Button size="sm" variant="outline" className="text-xs font-semibold gap-1.5 border-slate-300 bg-white">
                    <ExternalLink className="h-3.5 w-3.5 text-orange-600" />
                    Visit Kaveri Solar Public Page
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="sm" className="text-xs font-semibold gap-1.5 bg-orange-600 hover:bg-orange-700 text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                    Inspect Lead in Workspace
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right Conversation Simulation Column */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-orange-600" />
                    <span className="font-bold text-xs text-slate-900">Tamil Voice Agent Interaction</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Carrier Call Verified
                  </span>
                </div>

                <div className="space-y-3 font-sans text-xs">
                  {/* Turn 1 */}
                  <div className="p-3.5 rounded-2xl bg-orange-50/70 border border-orange-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-orange-900">AI Agent (Asmita — VoiceNexus)</span>
                      <span className="text-[10px] text-orange-700 font-mono">Turn 1</span>
                    </div>
                    <p className="text-slate-800 leading-relaxed font-medium">
                      &quot;வணக்கம் லக்ஷ்மி நாராயணன் ஐயா! நான் காவேரி சோலார் நிறுவனத்திலிருந்து அஸ்மிதா பேசுறேன். கும்பகோணம் பக்கத்துல உங்க விவசாய நிலத்துக்கு 5HP சோலார் பம்ப் அமைப்பது பத்தி விசாரிச்சிருந்தீங்க. அத பத்தி பேசலாமா?&quot;
                    </p>
                    <p className="text-[11px] text-slate-500 italic">
                      [Hello Mr. Lakshmi Narayanan! I am Asmita calling from Kaveri Solar. You enquired about setting up a 5HP solar pump for your farmland near Kumbakonam. May we discuss your requirements?]
                    </p>
                  </div>

                  {/* Turn 2 */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-slate-900">Lakshmi Narayanan (Farmer)</span>
                      <span className="text-[10px] text-slate-500 font-mono">Turn 2</span>
                    </div>
                    <p className="text-slate-800 leading-relaxed font-medium">
                      &quot;வணக்கம்மா, ஆமாங்க. இப்போ டீசல் என்ஜின் ஓட்டுறதுக்கு செலவு ரொம்ப அதிகமாகுது. 5HP சோலார் பம்ப் செட்டுக்கு எவ்வளவு செலவாகும்? அரசு மானியம் கிடைக்குமா?&quot;
                    </p>
                    <p className="text-[11px] text-slate-500 italic">
                      [Hello, yes. Running diesel engines has become very expensive now. How much will a 5HP solar pump set cost? Is government subsidy available?]
                    </p>
                  </div>

                  {/* Turn 3 */}
                  <div className="p-3.5 rounded-2xl bg-orange-50/70 border border-orange-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-orange-900">AI Agent (Asmita — VoiceNexus)</span>
                      <span className="text-[10px] text-orange-700 font-mono">Turn 3</span>
                    </div>
                    <p className="text-slate-800 leading-relaxed font-medium">
                      &quot;கண்டிப்பாங்க ஐயா! PM-KUSUM திட்டத்தின் கீழ் மத்திய மற்றும் மாநில அரசுகள் மூலம் 60% வரை மானியம் பெற வாய்ப்புள்ளது. எங்கள் சோலார் பம்புகளுக்கு 5 வருட வாரண்டியும், சோலார் பேனல்களுக்கு 25 வருட வாரண்டியும் தரோம். உங்க தோட்டத்தில் போர்வெல் ஆழம் எவ்வளவுங்க?&quot;
                    </p>
                    <p className="text-[11px] text-slate-500 italic">
                      [Certainly sir! Under PM-KUSUM, up to 60% subsidy is available. We offer 5-year warranty on pumps and 25-year warranty on panels. What is your borewell depth?]
                    </p>
                  </div>

                  {/* Turn 4 */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-slate-900">Lakshmi Narayanan (Farmer)</span>
                      <span className="text-[10px] text-slate-500 font-mono">Turn 4</span>
                    </div>
                    <p className="text-slate-800 leading-relaxed font-medium">
                      &quot;சுமார் 180 அடி ஆழம் இருக்கும்மா. நேரடியா வந்து பார்த்து மதிப்பீடு செய்ய முடியுமா?&quot;
                    </p>
                    <p className="text-[11px] text-slate-500 italic">
                      [It is about 180 feet deep. Can someone come directly to inspect and give an estimate?]
                    </p>
                  </div>
                </div>

                {/* Outcome Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Logged Outcome: <strong>QUALIFIED</strong></span>
                  <span className="text-emerald-700 font-semibold">Site Inspection Scheduled</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION F: SECURITY, WORKSPACE ISOLATION & GOVERNANCE */}
      <section id="security" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-600">Enterprise Data Governance</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Security &amp; Workspace Isolation
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every business receives its own authenticated workspace. Leads, call recordings, customer transcripts, and agent prompts are completely isolated.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-[#FAF9F5]/50 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Strict Multi-Tenant Isolation</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                When you create a workspace, your organization data is segregated at the database level. New registrations cannot access Kaveri Solar or any other organization&apos;s customer records.
              </p>
            </div>

            <div className="p-6 bg-[#FAF9F5]/50 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Owner-Controlled Telephony</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Telephony dispatches require explicit authentication by an authorized business owner. Do-Not-Call (DNC) numbers are suppressed automatically to maintain compliance.
              </p>
            </div>

            <div className="p-6 bg-[#FAF9F5]/50 rounded-2xl border border-slate-200/90 space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Auditability &amp; Identity Disclosure</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every call opens with transparent AI identity disclosure and recording notification. Transcripts and outcomes are immutably logged for supervisor review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION G: FINAL CALL TO ACTION */}
      <section className="py-20 border-t border-slate-200/80 bg-gradient-to-b from-[#FAF9F5] to-orange-50/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Experience a smarter way to manage business enquiries and customer conversations.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Explore the live Kaveri Solar sample workspace or register your organization to launch your own multilingual voice agents.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-12 px-7 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-500/25">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Explore Sample Workspace
                </Button>
              </Link>
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-900">
                  <Building2 className="mr-2 h-4 w-4 text-slate-700" />
                  Create Your Workspace
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="ghost" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900">
                  Sign In
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <VoiceNexusLogo />
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-600">
            <Link href="/login" className="hover:text-slate-900 transition-colors">Workspace Login</Link>
            <Link href="/register" className="hover:text-slate-900 transition-colors">Register Business</Link>
            <Link href="/p/kaveri-solar-construction" target="_blank" className="hover:text-slate-900 transition-colors">Kaveri Solar Public Page</Link>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} VoiceNexus AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
