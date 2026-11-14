import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/actions/organization";
import { calculateLeadIntelligence } from "@/lib/lead-intelligence";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const { searchParams } = new URL(req.url);
    let orgId = searchParams.get("organizationId");
    if (!orgId) {
      orgId = await getActiveOrganizationId();
    }

    if (!orgId) {
      console.warn("[/api/leads] No active organization found for session");
      return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
    }

    const search = searchParams.get("search");

    let query = supabase
      .from("leads")
      .select("*")
      .is("deleted_at", null)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,primary_interest.ilike.%${search}%`);
    }

    const excludeDnc = searchParams.get("excludeDnc") === "true";
    if (excludeDnc) {
      query = query.eq("do_not_call", false).neq("status", "DO_NOT_CALL");
    }

    const { data: dbLeads, error } = await query.limit(100);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const leads = (dbLeads || []).map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email ?? undefined,
      temperature: l.temperature,
      status: l.status,
      score: l.score,
      source: l.source,
      primaryInterest: l.primary_interest ?? "General Consultation",
      location: l.location ?? undefined,
      lastActivityAt: l.last_activity_at ? new Date(l.last_activity_at).toLocaleDateString() : new Date().toLocaleDateString(),
      summary: l.summary ?? undefined,
      notes: l.notes ?? undefined,
      doNotCall: l.do_not_call ?? false,
    }));

    return NextResponse.json({ success: true, leads });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const { name, phone, email, primaryInterest = "Solar Consultation", organizationId } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, error: "Name and phone number are required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    let resolvedOrgId = organizationId;
    if (!resolvedOrgId) {
      resolvedOrgId = await getActiveOrganizationId();
      if (!resolvedOrgId) {
        return NextResponse.json({ success: false, error: "No active organization found." }, { status: 400 });
      }
    }

    const cleanPhone = String(phone).replace(/[^0-9+]/g, "").trim();

    // Compute deterministic intelligence
    const intelligence = calculateLeadIntelligence({
      name: String(name).trim(),
      phone: cleanPhone,
      email: email ? String(email).trim() : null,
      primaryInterest: String(primaryInterest),
      source: "Manual CRM Entry",
    });

    const { data: newLead, error: insertErr } = await supabase
      .from("leads")
      .insert({
        organization_id: resolvedOrgId,
        name: String(name).trim(),
        phone: cleanPhone,
        email: email ? String(email).trim() : null,
        primary_interest: String(primaryInterest),
        source: "Manual CRM Entry",
        score: intelligence.score,
        temperature: intelligence.temperature,
        status: "NEW",
        do_not_call: false,
        summary: intelligence.qualificationSummary,
      } as never)
      .select("*")
      .single();

    if (insertErr || !newLead) {
      return NextResponse.json({ success: false, error: insertErr?.message || "Failed to create lead" }, { status: 500 });
    }

    // Insert lead event
    await supabase.from("lead_events").insert({
      organization_id: resolvedOrgId,
      lead_id: newLead.id,
      event_type: "MANUAL_ENTRY",
      title: "Lead Created Manually in CRM",
      description: `Lead added by workspace operator. Initial score: ${intelligence.score}/100.`,
      metadata: { intelligence },
    } as never);

    return NextResponse.json({
      success: true,
      lead: {
        id: newLead.id,
        name: newLead.name,
        phone: newLead.phone,
        email: newLead.email ?? undefined,
        temperature: newLead.temperature,
        status: newLead.status,
        score: newLead.score,
        source: newLead.source,
        primaryInterest: newLead.primary_interest,
        lastActivityAt: new Date().toLocaleDateString(),
        summary: newLead.summary,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

