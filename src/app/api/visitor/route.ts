import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";
    const ipRateLimit = checkRateLimit(`visitor:${ip}`, 30, 60);

    if (!ipRateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Too many tracking events" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const {
      eventType,
      organizationId,
      visitorSessionId,
      url: pageUrl,
      phone,
      email,
      dwellTimeSeconds = 0,
      activitySummary,
    } = body;

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    if (eventType === "ABANDONED_FORM") {
      // Must have at least a phone or email and organizationId
      if (!organizationId || (!phone && !email)) {
        return NextResponse.json({ success: true, message: "Skipped empty abandoned snapshot" });
      }

      const cleanPhone = phone ? String(phone).replace(/[^0-9+]/g, "").trim() : null;

      // Upsert into lead_recovery_records
      const recoveryScore = cleanPhone ? 65 : 40;

      const { data, error } = await supabase
        .from("lead_recovery_records")
        .insert({
          organization_id: organizationId,
          visitor_session_id: visitorSessionId || null,
          phone: cleanPhone,
          email: email ? String(email).trim() : null,
          abandoned_url: pageUrl ? String(pageUrl).slice(0, 500) : null,
          activity_summary: activitySummary || `Visitor abandoned form on ${pageUrl || "public page"} after ${dwellTimeSeconds}s.`,
          dwell_time_seconds: Math.min(3600, Math.max(0, Number(dwellTimeSeconds) || 0)),
          recovery_score: recoveryScore,
          is_recovered: false,
        } as never)
        .select("id")
        .maybeSingle();

      if (error) {
        console.warn("[VisitorAPI] Recovery record error:", error.message);
      }

      return NextResponse.json({ success: true, recoveryId: data?.id });
    }

    if (eventType === "PAGE_VIEW") {
      // Page view telemetry
      return NextResponse.json({ success: true, message: "Page view recorded" });
    }

    return NextResponse.json({ success: true, message: "Event ignored" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VisitorAPI] Unexpected error:", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
