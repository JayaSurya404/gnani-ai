import React from "react";
import Link from "next/link";
import { VoiceNexusLogo } from "@/components/brand/logo";
import { ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full bg-[#FAF9F5] text-[#0F172A] flex flex-col justify-between selection:bg-orange-500/20 selection:text-orange-700">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-orange-500/5 via-amber-500/5 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-rose-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <Link href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg">
          <VoiceNexusLogo />
        </Link>
        <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-600 bg-white border border-slate-200/80 shadow-sm px-3 py-1.5 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Organization data is isolated using Supabase Row Level Security (RLS).</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px]">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/80 py-6 px-6 text-center text-xs text-slate-500 bg-white/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium">VoiceNexus AI — Autonomous Voice & Lead Intelligence</span>
          </div>
          <p>© {new Date().getFullYear()} VoiceNexus AI. All rights reserved. Strict tenant data privacy enforced.</p>
        </div>
      </footer>
    </div>
  );
}

