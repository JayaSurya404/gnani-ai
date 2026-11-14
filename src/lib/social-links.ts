export interface SocialLinkDefinition {
  key: string;
  name: string;
  placeholder: string;
  expectedHost?: string;
  badgeBg: string;
  badgeText: string;
  badgeRing: string;
}

export const SUPPORTED_SOCIAL_PLATFORMS: SocialLinkDefinition[] = [
  {
    key: "whatsapp",
    name: "WhatsApp",
    placeholder: "https://wa.me/916382868845",
    expectedHost: "wa.me",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    badgeRing: "ring-emerald-200",
  },
  {
    key: "instagram",
    name: "Instagram",
    placeholder: "https://www.instagram.com/_jaya__surya__/",
    expectedHost: "instagram.com",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    badgeRing: "ring-rose-200",
  },
  {
    key: "facebook",
    name: "Facebook",
    placeholder: "https://facebook.com/your-business-page",
    expectedHost: "facebook.com",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    badgeRing: "ring-blue-200",
  },
  {
    key: "telegram",
    name: "Telegram",
    placeholder: "https://t.me/your-channel",
    expectedHost: "t.me",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-700",
    badgeRing: "ring-sky-200",
  },
  {
    key: "twitter",
    name: "X / Twitter",
    placeholder: "https://x.com/your-handle",
    expectedHost: "x.com",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-900",
    badgeRing: "ring-slate-300",
  },
  {
    key: "snapchat",
    name: "Snapchat",
    placeholder: "https://snapchat.com/add/your-username",
    expectedHost: "snapchat.com",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-800",
    badgeRing: "ring-amber-200",
  },
  {
    key: "youtube",
    name: "YouTube",
    placeholder: "https://youtube.com/@your-channel",
    expectedHost: "youtube.com",
    badgeBg: "bg-red-50",
    badgeText: "text-red-700",
    badgeRing: "ring-red-200",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    placeholder: "https://linkedin.com/company/your-company",
    expectedHost: "linkedin.com",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-800",
    badgeRing: "ring-blue-200",
  },
  {
    key: "threads",
    name: "Threads",
    placeholder: "https://threads.net/@your-handle",
    expectedHost: "threads.net",
    badgeBg: "bg-stone-100",
    badgeText: "text-stone-900",
    badgeRing: "ring-stone-300",
  },
  {
    key: "pinterest",
    name: "Pinterest",
    placeholder: "https://pinterest.com/your-board",
    expectedHost: "pinterest.com",
    badgeBg: "bg-red-50",
    badgeText: "text-red-800",
    badgeRing: "ring-red-200",
  },
  {
    key: "tiktok",
    name: "TikTok",
    placeholder: "https://tiktok.com/@your-handle",
    expectedHost: "tiktok.com",
    badgeBg: "bg-teal-50",
    badgeText: "text-teal-800",
    badgeRing: "ring-teal-200",
  },
  {
    key: "github",
    name: "GitHub",
    placeholder: "https://github.com/your-org",
    expectedHost: "github.com",
    badgeBg: "bg-zinc-100",
    badgeText: "text-zinc-900",
    badgeRing: "ring-zinc-300",
  },
  {
    key: "discord",
    name: "Discord",
    placeholder: "https://discord.gg/your-invite",
    expectedHost: "discord.gg",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-700",
    badgeRing: "ring-indigo-200",
  },
];

export function isValidSocialUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length < 5) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
