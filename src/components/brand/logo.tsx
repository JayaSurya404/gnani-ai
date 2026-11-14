import React from "react";

interface LogoProps {
  className?: string;
  compact?: boolean;
}

export function VoiceNexusLogo({ className = "", compact = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Brand Icon Mark */}
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] via-[#EA580C] to-[#0F172A] p-0.5 shadow-md shadow-orange-500/20 ring-1 ring-white/60">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-white"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-40"
          />
          <path
            d="M8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="2.5" fill="white" />
        </svg>
      </div>

      {/* Brand Wordmark */}
      {!compact && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[17px] font-bold tracking-tight text-[#0F172A]">
              Voice<span className="text-[#F97316]">Nexus</span>
            </span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-orange-700 ring-1 ring-orange-200 uppercase">
              AI
            </span>
          </div>
          <span className="text-[11px] font-medium tracking-tight text-slate-500">
            Autonomous Voice & Lead Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
