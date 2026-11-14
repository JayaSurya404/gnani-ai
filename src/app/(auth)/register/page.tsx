"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { signUpAction } from "@/actions/auth";
import {
  Building2,
  Lock,
  Mail,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signUpAction(null, formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.message) {
        setSuccessMessage(result.message);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.06)]">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Create Organization Workspace</h1>
        <p className="text-xs text-slate-500">
          Get started with your multi-tenant VoiceNexus AI workspace
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <p className="leading-relaxed">{successMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700" htmlFor="fullName">
            Your Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="e.g. Chitresh Kumar"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Organization Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700" htmlFor="organizationName">
            Organization / Company Name
          </label>
          <div className="relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id="organizationName"
              name="organizationName"
              type="text"
              required
              placeholder="e.g. Kaveri Solar Solutions"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Work Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700" htmlFor="email">
            Work Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700" htmlFor="password">
            Password (at least 8 characters)
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-200/60">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Organization data is isolated using Supabase Row Level Security (RLS).</span>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating your organization...</span>
            </>
          ) : (
            <>
              <span>Create Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer links */}
      <div className="mt-6 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">
        Already have an organization?{" "}
        <Link
          href="/login"
          className="font-semibold text-orange-600 hover:text-orange-700 transition-colors"
        >
          Sign in here
        </Link>
      </div>
    </div>
  );
}
