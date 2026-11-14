import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dispatchId } = await params;
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const body = await req.json();
    const action = body.action as "APPROVE" | "REJECT" | "CANCEL" | "EDIT";

    if (!action) {
      return NextResponse.json({ success: false, error: "Missing required action" }, { status: 400 });
    }

    // 1. Fetch current notification dispatch with lead DNC status
    const { data: dispatch, error: fetchErr } = await supabase
      .from("notification_dispatches")
      .select("id, organization_id, lead_id, channel, audience, status, consent_verified, rendered_message, leads ( do_not_call )")
      .eq("id", dispatchId)
      .single();

    if (fetchErr || !dispatch) {
      return NextResponse.json({ success: false, error: "Notification dispatch not found" }, { status: 404 });
    }

    // Organization Isolation Check: Prevent IDOR / cross-tenant tampering
    if (body.organizationId && dispatch.organization_id !== body.organizationId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cross-organization access denied." },
        { status: 403 }
      );
    }

    // Role-based authorization: Viewers or unauthorized roles cannot approve/reject/edit drafts
    if (body.userRole && !["OWNER", "ADMIN", "SUPERVISOR", "STAFF"].includes(String(body.userRole).toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Insufficient role permissions to manage customer notifications." },
        { status: 403 }
      );
    }

    // 2. Process Action
    switch (action) {
      case "APPROVE": {
        // Only OWNER, ADMIN, SUPERVISOR can approve
        if (body.userRole && !["OWNER", "ADMIN", "SUPERVISOR"].includes(String(body.userRole).toUpperCase())) {
          return NextResponse.json(
            { success: false, error: "Unauthorized: Insufficient role permissions to approve customer notifications." },
            { status: 403 }
          );
        }
        // Safe check 1: Duplicate approval check
        if (dispatch.status === "APPROVED") {
          return NextResponse.json(
            { success: false, error: "Notification draft has already been approved." },
            { status: 400 }
          );
        }

        if (dispatch.status !== "DRAFT_PENDING_APPROVAL") {
          return NextResponse.json(
            { success: false, error: `Cannot approve draft in '${dispatch.status}' status. Only DRAFT_PENDING_APPROVAL drafts can be approved.` },
            { status: 400 }
          );
        }

        // Safe check 2: Customer consent re-verification on server
        if (!dispatch.consent_verified) {
          return NextResponse.json(
            { success: false, error: "Approval blocked: Customer WhatsApp consent is not verified." },
            { status: 403 }
          );
        }

        // Safe check 3: Do-Not-Call (DNC) re-verification on server
        const isDnc = (dispatch.leads as { do_not_call?: boolean } | null)?.do_not_call === true;
        if (isDnc) {
          return NextResponse.json(
            { success: false, error: "Approval blocked: Customer is registered on Do-Not-Call (DNC) list." },
            { status: 403 }
          );
        }

        const approvedBy = body.approvedBy || "supervisor";
        const now = new Date().toISOString();

        // Update to APPROVED without advancing to DELIVERED
        const { data: approvedDispatch, error: approveErr } = await supabase
          .from("notification_dispatches")
          .update({
            status: "APPROVED",
            approved_by: approvedBy,
            approved_at: now,
            updated_at: now
          })
          .eq("id", dispatchId)
          .select()
          .single();

        if (approveErr) {
          return NextResponse.json({ success: false, error: approveErr.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: "Notification draft approved. Ready for scheduled delivery.",
          dispatch: approvedDispatch
        });
      }

      case "REJECT": {
        const { data: rejectedDispatch, error: rejectErr } = await supabase
          .from("notification_dispatches")
          .update({
            status: "REJECTED",
            updated_at: new Date().toISOString()
          })
          .eq("id", dispatchId)
          .select()
          .single();

        if (rejectErr) {
          return NextResponse.json({ success: false, error: rejectErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, dispatch: rejectedDispatch });
      }

      case "CANCEL": {
        const { data: cancelledDispatch, error: cancelErr } = await supabase
          .from("notification_dispatches")
          .update({
            status: "REJECTED",
            updated_at: new Date().toISOString()
          })
          .eq("id", dispatchId)
          .select()
          .single();

        if (cancelErr) {
          return NextResponse.json({ success: false, error: cancelErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, dispatch: cancelledDispatch });
      }

      case "EDIT": {
        const editedMessage = body.editedMessage?.trim();
        if (!editedMessage) {
          return NextResponse.json({ success: false, error: "Edited message cannot be empty" }, { status: 400 });
        }

        if (dispatch.status !== "DRAFT_PENDING_APPROVAL") {
          return NextResponse.json(
            { success: false, error: "Only pending drafts can be edited." },
            { status: 400 }
          );
        }

        const { data: editedDispatch, error: editErr } = await supabase
          .from("notification_dispatches")
          .update({
            rendered_message: editedMessage,
            updated_at: new Date().toISOString()
          })
          .eq("id", dispatchId)
          .select()
          .single();

        if (editErr) {
          return NextResponse.json({ success: false, error: editErr.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, dispatch: editedDispatch });
      }

      default:
        return NextResponse.json({ success: false, error: `Unsupported action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
