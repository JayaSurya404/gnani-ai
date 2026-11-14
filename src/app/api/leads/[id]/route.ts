import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, maskPhone, maskEmail } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    // 1. Fetch Lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (leadErr || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // 2. Fetch Chronological Lead Events
    const { data: events } = await supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    // 3. Fetch Call Sessions with Outcomes & Transcripts
    const { data: calls } = await supabase
      .from("call_sessions")
      .select(`
        id,
        direction,
        channel,
        status,
        start_time,
        end_time,
        duration_seconds,
        recording_url,
        created_at,
        call_outcomes (
          disposition,
          sentiment,
          confidence_score,
          summary,
          key_points,
          action_items,
          qualification_decision,
          follow_up_recommended
        ),
        transcript_segments (
          id,
          speaker,
          language,
          text,
          confidence,
          start_offset_ms
        )
      `)
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    // 4. Fetch Follow-up Tasks
    const { data: followUps } = await supabase
      .from("follow_up_tasks")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    const session = await getSessionContext();
    const sanitizedLead = {
      ...lead,
      phone: session.isEvaluator ? maskPhone(lead.phone) : lead.phone,
      email: session.isEvaluator ? (lead.email ? maskEmail(lead.email) : null) : lead.email,
    };

    return NextResponse.json({
      success: true,
      lead: sanitizedLead,
      events: events || [],
      calls: calls || [],
      followUps: followUps || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionContext();
    if (session.isEvaluator) {
      return NextResponse.json(
        { success: false, error: "Action forbidden: Evaluator preview account has read-only permissions." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const { status, summary, notes, doNotCall } = body;

    const admin = createAdminClient();
    const supabase = admin ?? (await createClient());

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updatePayload.status = status;
    }
    if (summary !== undefined) {
      updatePayload.summary = summary;
    }
    if (notes !== undefined) {
      updatePayload.notes = notes;
    }
    if (doNotCall !== undefined) {
      updatePayload.do_not_call = Boolean(doNotCall);
    }

    const { data: updated, error } = await supabase
      .from("leads")
      .update(updatePayload as never)
      .eq("id", id)
      .select("id, status, summary, notes, do_not_call, organization_id")
      .maybeSingle();

    if (error || !updated) {
      return NextResponse.json({ success: false, error: error?.message || "Lead not found" }, { status: 404 });
    }

    // Insert an audit lead_event
    if (status) {
      await supabase.from("lead_events").insert({
        organization_id: updated.organization_id,
        lead_id: id,
        event_type: "STATUS_CHANGE",
        title: `Status Changed to ${status}`,
        description: `Lead progression status updated to ${status}.`,
        metadata: { newStatus: status, notes: summary },
      } as never);
    }

    if (notes) {
      await supabase.from("lead_events").insert({
        organization_id: updated.organization_id,
        lead_id: id,
        event_type: "NOTE_ADDED",
        title: "Owner Note Added",
        description: notes,
        metadata: { notes },
      } as never);
    }

    return NextResponse.json({
      success: true,
      lead: updated,
      message: "Lead updated successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

