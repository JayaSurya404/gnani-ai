import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const type = url.searchParams.get("type"); // "CALLBACK" | "FOLLOW_UP" | "SUPERVISOR"
    const callSessionId = url.searchParams.get("callSessionId");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    let targetOrgId: string | null = orgId;
    if (!targetOrgId) {
      const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
      targetOrgId = org?.id ?? null;
    }

    if (!targetOrgId) {
      return NextResponse.json({ success: true, tasks: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    let query = supabase
      .from("follow_up_tasks")
      .select(`
        id,
        organization_id,
        lead_id,
        call_session_id,
        assigned_to,
        title,
        description,
        due_date,
        priority,
        status,
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
      .eq("organization_id", targetOrgId);

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (callSessionId) {
      query = query.eq("call_session_id", callSessionId);
    }

    if (type === "CALLBACK") {
      query = query.ilike("title", "%Scheduled Callback%");
    } else if (type === "SUPERVISOR") {
      query = query.ilike("title", "%Supervisor%");
    } else if (type === "FOLLOW_UP") {
      query = query.not("title", "ilike", "%Scheduled Callback%");
    }

    query = query.order("due_date", { ascending: true, nullsFirst: false })
                 .range(offset, offset + limit - 1);

    const { data: tasks, count, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const total = count ?? tasks?.length ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      tasks: tasks || [],
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

