import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TwilioWhatsAppAdapter } from "@/lib/automations/notification-adapters/whatsapp-twilio-adapter";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dispatchId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    // 1. Fetch dispatch record
    const { data: dispatch, error: fetchErr } = await supabase
      .from("notification_dispatches")
      .select("id, organization_id, lead_id, recipient, rendered_message, status, consent_verified, leads ( do_not_call, status )")
      .eq("id", dispatchId)
      .single();

    if (fetchErr || !dispatch) {
      return NextResponse.json({ success: false, error: "Notification dispatch not found" }, { status: 404 });
    }

    // Must be in APPROVED or DRAFT_PENDING_APPROVAL status
    if (dispatch.status !== "APPROVED" && dispatch.status !== "DRAFT_PENDING_APPROVAL") {
      return NextResponse.json(
        { success: false, error: `Cannot send dispatch in '${dispatch.status}' status.` },
        { status: 400 }
      );
    }

    // Safety checks
    if (!dispatch.consent_verified) {
      return NextResponse.json(
        { success: false, error: "Send blocked: Customer WhatsApp consent is not verified." },
        { status: 403 }
      );
    }

    const isDnc =
      (dispatch.leads as { do_not_call?: boolean; status?: string } | null)?.do_not_call === true ||
      (dispatch.leads as { do_not_call?: boolean; status?: string } | null)?.status === "DO_NOT_CALL";

    if (isDnc) {
      return NextResponse.json(
        { success: false, error: "Send blocked: Recipient is registered on Do-Not-Call (DNC) list." },
        { status: 403 }
      );
    }

    // 2. Dispatch via Twilio WhatsApp Adapter
    const adapter = new TwilioWhatsAppAdapter();
    const result = await adapter.sendDirect({
      recipient: dispatch.recipient,
      message: dispatch.rendered_message,
    });

    const now = new Date().toISOString();

    if (result.success && result.messageSid) {
      // Update record to SENT
      await supabase
        .from("notification_dispatches")
        .update({
          status: "SENT",
          twilio_message_sid: result.messageSid,
          provider_message_id: result.messageSid,
          sent_at: now,
          updated_at: now,
        })
        .eq("id", dispatchId);

      // Record telephony event
      await supabase.from("telephony_events").insert({
        organization_id: dispatch.organization_id,
        event_type: "WHATSAPP_MESSAGE_SENT",
        event_payload: { dispatchId, messageSid: result.messageSid, recipient: dispatch.recipient },
      });

      return NextResponse.json({
        success: true,
        messageSid: result.messageSid,
        status: "SENT",
      });
    } else {
      // Record failure
      await supabase
        .from("notification_dispatches")
        .update({
          status: "FAILED",
          error_details: { error: result.error, isSandboxRestriction: result.isSandboxRestriction },
          updated_at: now,
        })
        .eq("id", dispatchId);

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to dispatch WhatsApp message",
          isSandboxRestriction: result.isSandboxRestriction,
        },
        { status: result.isSandboxRestriction ? 403 : 502 }
      );
    }
  } catch (err: unknown) {
    console.error("[Approval Send] Exception:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
