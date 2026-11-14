"use client";

import React from "react";
import Link from "next/link";
import { VoiceNexusLogo } from "@/components/brand/logo";
import {
  PhoneCall,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Zap,
  Globe2,
  BarChart3,
  CheckCircle2,
  Mic,
  Headphones,
  Users,
  Building2,
  Lock,
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
            <a href="#features" className="hover:text-slate-900 transition-colors">Platform Capabilities</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#multilingual" className="hover:text-slate-900 transition-colors">Indian Languages</a>
            <a href="#security" className="hover:text-slate-900 transition-colors">Security & Multi-Tenancy</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/p/voicenexus-demo" target="_blank" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="text-xs font-medium text-slate-600 hover:text-slate-900">
                Public Portal Demo
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="sm" className="text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-900">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-sm shadow-orange-500/20">
                Launch Workspace
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-gradient-to-b from-orange-400/10 via-amber-200/5 to-transparent blur-3xl" />
          <div className="absolute top-1/2 right-0 h-[400px] w-[400px] rounded-full bg-orange-500/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50/80 px-3.5 py-1 text-xs font-semibold text-orange-800 shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
              <span>Enterprise Voice AI for Indian Businesses</span>
              <span className="text-orange-400">•</span>
              <span className="text-orange-700 font-medium">Real Carrier Telephony + Native Speech</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl sm:leading-[1.12]">
              Turn Inbound Interest into Carrier Phone Conversations in Seconds
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              Autonomous AI agents speak fluent Tamil, English, and regional Indian languages. Qualify leads directly on real mobile carrier lines with explainable intent scoring and owner-approved follow-ups.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-500/25">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Explore Live Demo Workspace
                </Button>
              </Link>
              <Link href="/p/voicenexus-demo" target="_blank" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-6 text-sm font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-800">
                  <Globe2 className="mr-2 h-4 w-4 text-orange-600" />
                  View Public Demo Portal
                </Button>
              </Link>
            </div>

            {/* Quick trust metrics */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Zero Hallucination Guardrails</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Sub-800ms Latency Loop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>100% Isolated PostgreSQL RLS</span>
              </div>
            </div>
          </div>

          {/* Interactive Platform Preview Card */}
          <div className="mt-14 rounded-3xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xl shadow-slate-900/5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Lead Intelligence</div>
                  <div className="text-[11px] text-slate-500">Instant score, budget, and intent</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Dedicated Call Center</div>
                  <div className="text-[11px] text-slate-500">Pre-call review & carrier dispatch</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Globe2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Public Inbound Portal</div>
                  <div className="text-[11px] text-slate-500">Customizer with live mobile preview</div>
                </div>
              </div>
            </div>

            {/* Conversation Flow Preview */}
            <div className="mt-6 rounded-2xl bg-slate-900 text-white p-6 font-mono text-xs overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-sans font-bold text-sm text-slate-200">Live Call Turn Sequence</span>
                </div>
                <span className="font-sans text-[11px] text-slate-400">Carrier PSTN + Gnani Timbre TTS</span>
              </div>
              <div className="space-y-3 font-sans text-xs">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono text-[10px] font-bold">AI (Asmita)</span>
                  <p className="text-slate-300">வணக்கம்! நான் Aadhira Solar Tech நிறுவனத்திலிருந்து அஸ்மிதா பேசுறேன். உங்கள் தேவைகளை தெரிஞ்சுக்க பேசலாமா?</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px] font-bold">Caller</span>
                  <p className="text-slate-200 font-medium">பேசலாம், எனக்கு 10kW கமர்ஷியல் சோலார் பத்தி தெரிஞ்சுக்கணும்.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 font-mono text-[10px] font-bold">AI (Asmita)</span>
                  <p className="text-slate-300">நிச்சயமாகங்க! எங்கள் 10kW கமர்ஷியல் சிஸ்டம் மூலம் மாதாந்திர மின் கட்டணத்தை 80% வரை குறைக்கலாம். உங்கள் அலுவலகம் எந்த ஊரில் அமைந்துள்ளது?</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Grid */}
      <section id="features" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600">Enterprise Capabilities</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Built for Real Indian Business Conversions</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Every customer inquiry is unique. VoiceNexus provides end-to-end tooling from first web click to completed carrier telephone conversation.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                <Mic className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Gnani AI Speech Integration</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Connects directly to Gnani Prisma STT and Timbre TTS. High-accuracy phonetic models tailored for Indian accents, regional dialects, and code-mixed speech.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Headphones className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Single Call Center Workspace</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Clean separation of concerns: Lead management focuses strictly on intelligence and activity history, while the dedicated Calls page handles preparation, dispatch, and monitoring.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Explainable Lead Scoring</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Transparent temperature attribution (Hot, Warm, Cold) based on budget, urgency, and technical feasibility so your sales team always calls the highest-yield leads first.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                <Globe2 className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Public Business Page Customizer</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Launch branded, mobile-first consultation portals with zero coding. Real-time preview with desktop/mobile view toggle, product catalogs, and verified contact badges.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Strict Tenant Isolation</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Multi-tenant architecture powered by Supabase PostgreSQL Row Level Security. Separate workspaces for each business with scoped leads, call sessions, and agent prompts.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-slate-200/80 p-6 bg-[#FAF9F5]/40 hover:bg-white hover:shadow-lg transition-all space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Zap className="h-5 w-5" />
              </div>
              <h4 className="font-bold text-base text-slate-900">Pre-Call Plan & Safety Checks</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Before dialing a phone number, view AI-suggested questions, objection handling strategies, and DNC registry verification to maintain professional compliance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 border-t border-slate-200/80 bg-[#FAF9F5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600">Step-by-Step Flow</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">From Web Enquiry to Closed Sale</h3>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="text-2xl font-black text-orange-600 font-mono">01</div>
              <h4 className="font-bold text-sm text-slate-900">Inbound Capture</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Prospect discovers your verified public business page and submits their requirements.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="text-2xl font-black text-orange-600 font-mono">02</div>
              <h4 className="font-bold text-sm text-slate-900">Intent Scoring</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                AI analyzes timeline, capacity, and location, instantly classifying lead temperature and generating a call plan.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="text-2xl font-black text-orange-600 font-mono">03</div>
              <h4 className="font-bold text-sm text-slate-900">Carrier Phone Call</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                AI agent calls the prospect on real mobile network, speaking fluent Tamil or English with sub-second turn latency.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
              <div className="text-2xl font-black text-orange-600 font-mono">04</div>
              <h4 className="font-bold text-sm text-slate-900">Outcome & Follow-up</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Call transcript, business outcome, and recommended next steps are logged automatically in your CRM.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Multilingual Support Section */}
      <section id="multilingual" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 ring-1 ring-orange-200">
                <Globe2 className="h-3.5 w-3.5 text-orange-600" />
                <span>Pan-Indian Multilingual Engine</span>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                Native Voices Engineered for Regional Business Nuances
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                VoiceNexus supports dynamic language switching and natural code-mixing. Whether your customer prefers formal Tamil, Tanglish, standard Indian English, Hindi, or Telugu, our voice models adapt immediately.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-medium text-slate-700">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-orange-600">தமிழ்</span>
                  <span>Tamil & Tanglish (Asmita / Selvi)</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-orange-600">EN</span>
                  <span>Indian English (Priya / Neerja)</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-orange-600">हिंदी</span>
                  <span>Hindi & Hinglish (Aditi / Swara)</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-orange-600">తెలుగు</span>
                  <span>Telugu (Chitra / Rohini)</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-[#FAF9F5] p-6 space-y-4">
              <h3 className="font-bold text-sm text-slate-900">Supported Speech Models</h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80">
                  <div>
                    <div className="font-bold text-slate-900">Gnani Timbre 3.0</div>
                    <div className="text-[11px] text-slate-500">Native Indian neural speech synthesis</div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">Production Active</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80">
                  <div>
                    <div className="font-bold text-slate-900">Gnani Prisma STT</div>
                    <div className="text-[11px] text-slate-500">Streaming ASR with Indian telephony acoustic models</div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">Production Active</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200/80">
                  <div>
                    <div className="font-bold text-slate-900">Google Gemini 2.5 Flash</div>
                    <div className="text-[11px] text-slate-500">Low-latency turn orchestration & intent reasoning</div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">Production Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Multi-Tenancy */}
      <section id="security" className="py-20 border-t border-slate-200/80 bg-[#FAF9F5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-600">Enterprise Security</h2>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Isolated Workspaces with Zero Bleed</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Every business organization receives complete cryptographic and database row isolation. Leads, call logs, and customer transcripts are never shared across tenants.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-2">
              <Lock className="h-6 w-6 text-orange-600 mx-auto" />
              <div className="font-bold text-sm text-slate-900">PostgreSQL RLS</div>
              <div className="text-xs text-slate-500">Row-level security policies enforced on every database query</div>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600 mx-auto" />
              <div className="font-bold text-sm text-slate-900">Carrier Compliance</div>
              <div className="text-xs text-slate-500">Strict DNC registry checking and automatic caller consent disclaimers</div>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-2">
              <Building2 className="h-6 w-6 text-blue-600 mx-auto" />
              <div className="font-bold text-sm text-slate-900">Workspace Switcher</div>
              <div className="text-xs text-slate-500">Instantly switch between production and demo organizations</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <VoiceNexusLogo />
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/login" className="hover:text-slate-900 transition-colors">Workspace Login</Link>
            <Link href="/register" className="hover:text-slate-900 transition-colors">Register Business</Link>
            <Link href="/p/voicenexus-demo" target="_blank" className="hover:text-slate-900 transition-colors">Public Portal</Link>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} VoiceNexus AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
