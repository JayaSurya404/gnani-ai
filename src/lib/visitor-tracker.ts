"use client";

const VISITOR_ID_KEY = "vn_visitor_session_id";

export function getOrCreateVisitorSessionId(): string {
  if (typeof window === "undefined") return "";

  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = "vid_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return "vid_fallback_" + Date.now();
  }
}

export interface TrackEventOptions {
  organizationId: string;
  eventType: "PAGE_VIEW" | "ABANDONED_FORM" | "CALCULATOR_USE" | "CTA_CLICK";
  phone?: string;
  email?: string;
  dwellTimeSeconds?: number;
  activitySummary?: string;
  metadata?: Record<string, unknown>;
}

export async function sendVisitorEvent(options: TrackEventOptions): Promise<void> {
  if (typeof window === "undefined") return;

  const visitorSessionId = getOrCreateVisitorSessionId();
  const pageUrl = window.location.href;

  try {
    const payload = {
      ...options,
      visitorSessionId,
      url: pageUrl,
    };

    if (navigator.sendBeacon && options.eventType === "ABANDONED_FORM") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/visitor", blob);
    } else {
      await fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    // Non-blocking telemetry
    console.debug("[VisitorTracker] Telemetry error:", err);
  }
}

