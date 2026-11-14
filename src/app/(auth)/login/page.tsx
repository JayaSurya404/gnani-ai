"use client";

import React, { useState, useEffect, useTransition, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction } from "@/actions/auth";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

function LoginFormContent() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Demonstration credentials fetched from backend
  const [demoEmail, setDemoEmail] = useState("admin@kaverisolar.in");
  const [demoPassword, setDemoPassword] = useState("KaveriSolar#Admin2026!Pro");
  const [isFilling, setIsFilling] = useState(false);
  const [fillNotice, setFillNotice] = useState<string | null>(null);

  // Fetch demo credentials on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDemoCredentials() {
      try {
        const res = await fetch("/api/dev/credentials");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.email) setDemoEmail(data.email);
            if (data.password) setDemoPassword(data.password);
          }
        }
      } catch {
        // Fallback to initial state
      }
    }
    loadDemoCredentials();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFillCredentials = async () => {
    setIsFilling(true);
    setFillNotice(null);
    try {
      const res = await fetch("/api/dev/credentials");
      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          setEmail(data.email);
          setDemoEmail(data.email);
        }
        if (data.password) {
          setPassword(data.password);
          setDemoPassword(data.password);
        }
      } else {
        if (demoEmail) setEmail(demoEmail);
        if (demoPassword) setPassword(demoPassword);
      }
      setFillNotice("Company credentials loaded into form. Click 'Sign In to Workspace' to proceed.");
    } catch {
      if (demoEmail) setEmail(demoEmail);
      if (demoPassword) setPassword(demoPassword);
      setFillNotice("Company credentials loaded into form. Click 'Sign In to Workspace' to proceed.");
    } finally {
      setIsFilling(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("returnUrl", returnUrl);

    startTransition(async () => {
      const result = await signInAction(null, formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Main Login Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.06)]">
        <div className="mb-6 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in to your Workspace</h1>
          <p className="text-xs text-slate-500">
            Enter your organization credentials to manage inbound leads & telephony.
          </p>
        </div>

        {/* Demo Login Credentials Card */}
        <div className="mb-5 rounded-xl border border-dashed border-amber-300 bg-amber-50/80 p-3.5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-950 block">Demo Login Credentials</span>
              <div className="text-[11px] text-amber-900 space-y-0.5">
                <div>
                  <span className="font-semibold text-slate-700">Email: </span>
                  <span className="font-mono text-amber-950 font-medium select-all">{demoEmail}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Password: </span>
                  <span className="font-mono text-amber-950 font-medium select-all">{demoPassword}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFillCredentials}
              disabled={isFilling}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-orange-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isFilling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>Fill Company Credentials</span>
            </button>
          </div>
        </div>

        {fillNotice && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="font-medium leading-relaxed">{fillNotice}</p>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700" htmlFor="email">
              Company Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@company.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-medium text-orange-600 hover:text-orange-700 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-6 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">
          New to VoiceNexus?{" "}
          <Link
            href="/register"
            className="font-semibold text-orange-600 hover:text-orange-700 transition-colors"
          >
            Create an organization workspace
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
