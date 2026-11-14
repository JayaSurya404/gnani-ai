import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationChannel, NotificationDispatchStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");
    const status = url.searchParams.get("status"); // DRAFT_PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED
    const channel = url.searchParams.get("channel") || "WHATSAPP";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    let targetOrgId: string | null = orgId;
    if (!targetOrgId) {
      const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
      targetOrgId = org?.id ?? null;
    }

    if (!targetOrgId) {
      return NextResponse.json({ success: true, drafts: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    let query = supabase
      .from("notification_dispatches")
      .select(`
        id,
        organization_id,
        call_session_id,
        lead_id,
        audience,
        channel,
        recipient,
        consent_verified,
        consent_reference,
        rendered_message,
        status,
        provider,
        idempotency_key,
        error_details,
        approved_by,
        approved_at,
        sent_at,
        delivered_at,
        created_at,
        updated_at,
        leads (
          id,
          name,
          phone,
          status,
          score,
          do_not_call
        ),
        call_sessions (
          id,
          customer_name,
          customer_phone,
          duration_seconds,
          status
        )
      `, { count: "exact" })
      .eq("organization_id", targetOrgId)
      .eq("audience", "CUSTOMER");

    if (channel) {
      query = query.eq("channel", channel as NotificationChannel);
    }

    if (status) {
      query = query.eq("status", status as NotificationDispatchStatus);
    }

    query = query.order("created_at", { ascending: false })
                 .range(offset, offset + limit - 1);

    const { data: drafts, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const total = count ?? drafts?.length ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      drafts: drafts || [],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
