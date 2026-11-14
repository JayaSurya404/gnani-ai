"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, User, LogOut, LogIn } from "lucide-react";
import { VoiceNexusLogo } from "@/components/brand/logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { NAVIGATION_SECTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOutAction } from "@/actions/auth";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

interface UserProfile {
  name: string;
  email: string;
  role: string;
  isAuthenticated: boolean;
}

export function Sidebar({ collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile>({
    name: "Jaya Surya",
    email: "chitrasivakumar280@gmail.com",
    role: "Owner",
    isAuthenticated: false,
  });

  useEffect(() => {
    async function checkUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const fullName =
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "Workspace Member";

          setProfile({
            name: fullName,
            email: user.email || "",
            role: "Owner",
            isAuthenticated: true,
          });
        }
      } catch {
        // Fallback to default
      }
    }
    checkUser();
  }, []);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-slate-200/80 bg-white/75 backdrop-blur-2xl transition-all duration-300 ease-in-out select-none shadow-[2px_0_20px_rgba(112,101,232,0.03)]",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Brand Header */}
      <div className={cn("flex h-16 items-center border-b border-slate-200/80 px-4", collapsed && "justify-center px-2")}>
        <Link href="/dashboard" className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#7065E8] rounded-xl p-1" onClick={onNavigate}>
          <VoiceNexusLogo compact={collapsed} />
        </Link>
      </div>

      {/* Workspace Switcher */}
      <div className={cn("p-3 border-b border-slate-200/60", collapsed && "p-2 flex justify-center")}>
        <WorkspaceSwitcher compact={collapsed} />
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {NAVIGATION_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <nav className="space-y-1" aria-label={section.title}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.title : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all relative min-h-[42px]",
                      isActive
                        ? "bg-orange-50 text-orange-800 font-bold shadow-xs ring-1 ring-orange-200"
                        : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900",
                      collapsed && "justify-center px-2 py-2.5"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform group-hover:scale-110",
                        isActive ? "text-orange-600" : "text-slate-400 group-hover:text-slate-900"
                      )}
                      aria-hidden="true"
                    />
                    {!collapsed && (
                      <span className="flex-1 truncate tracking-tight">{item.title}</span>
                    )}
                    {!collapsed && item.badge && (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                          isActive
                            ? "bg-orange-600 text-white"
                            : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Collapse Toggle (Desktop only) */}
      <div className="hidden md:flex border-t border-slate-200/80 p-3 justify-end">
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-white hover:text-slate-900 shadow-xs focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {/* User Status Bar */}
      <div className={cn("border-t border-slate-200/80 p-3 bg-white/40", collapsed && "p-2 flex justify-center")}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 ring-1 ring-orange-200">
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="truncate text-xs font-semibold text-slate-900">
                  {profile.name} ({profile.role})
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  {profile.email}
                </span>
              </div>
            )}
          </div>

          {!collapsed && (
            <div>
              {profile.isAuthenticated ? (
                <button
                  onClick={() => signOutAction()}
                  title="Sign out of VoiceNexus AI"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <Link
                  href="/login"
                  title="Sign in to VoiceNexus account"
                  className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
