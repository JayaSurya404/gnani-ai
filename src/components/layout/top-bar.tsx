"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Globe, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  onOpenMobileNav: () => void;
}

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  const pathname = usePathname();
  const [portalSlug, setPortalSlug] = useState("kaveri-solar-construction");

  useEffect(() => {
    fetch("/api/business")
      .then((r) => r.json())
      .then((data) => {
        if (data?.page?.slug) {
          setPortalSlug(data.page.slug);
        }
      })
      .catch(() => { });
  }, []);

  const getPageTitle = (path: string) => {
    const clean = path.replace("/", "").split("/")[0];
    switch (clean) {
      case "dashboard":
      case "":
        return { section: "Platform", title: "Overview" };
      case "leads":
        return { section: "CRM", title: "Leads & Intelligence" };
      case "business-pages":
        return { section: "Acquisition", title: "Public Consultation Page" };
      case "calls":
        return { section: "Telephony", title: "Call Center & Transcripts" };
      case "conversations":
        return { section: "Telephony", title: "Live Turn Conversations" };
      case "settings":
        return { section: "Workspace", title: "Settings & Configuration" };
      default:
        return { section: "VoiceNexus", title: clean.toUpperCase() };
    }
  };

  const { section, title } = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 sm:px-6 backdrop-blur-md select-none shadow-xs">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          aria-label="Toggle navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 md:hidden hover:bg-slate-50 hover:text-slate-900 shadow-xs focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex flex-col min-w-0 truncate">
          <div className="hidden xs:flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span>VoiceNexus AI</span>
            <span>/</span>
            <span className="text-orange-700 font-semibold">{section}</span>
          </div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Link to Public Page */}
        <Link href={`/p/${portalSlug}`} target="_blank" rel="noopener noreferrer">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5 font-medium border-slate-200 hover:border-orange-500 hover:text-orange-600"
          >
            <Globe className="h-3.5 w-3.5 text-orange-600" />
            <span className="hidden sm:inline">View Public Portal</span>
          </Button>
        </Link>

        {/* Quick Call Action */}
        <Link href="/calls">
          <Button
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
          >
            <PhoneCall className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Call Center</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
