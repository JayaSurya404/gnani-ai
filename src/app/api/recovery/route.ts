import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organizationId");

    let query = supabase
      .from("lead_recovery_records")
      .select("*")
      .order("created_at", { ascending: false });

    if (orgId) {
      query = query.eq("organization_id", orgId);
    }

    const { data: records, error } = await query.limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const items = (records || []).map((r) => ({
      id: r.id,
      phone: r.phone || "Unknown Phone",
      email: r.email,
      activity: r.activity_summary || "Visitor viewed page and abandoned form",
      dwellTimeSeconds: r.dwell_time_seconds,
      recoveryScore: r.recovery_score,
      time: new Date(r.created_at).toLocaleDateString("en-IN"),
      recovered: r.is_recovered,
      recoveredLeadId: r.recovered_lead_id,
    }));

    return NextResponse.json({ success: true, items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ success: false, error: "Missing record ID" }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { data, error } = await supabase
      .from("lead_recovery_records")
      .update({
        is_recovered: true,
        activity_summary: `Re-engagement initiated via CRM on ${new Date().toLocaleDateString("en-IN")}`,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", body.id)
      .select("id, is_recovered")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: false, error: error?.message || "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, record: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

