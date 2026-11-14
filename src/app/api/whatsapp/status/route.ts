import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/telephony/webhook-auth";
import type { NotificationDispatchStatus, Database } from "@/types/database";

export const dynamic = "force-dynamic";

function mapWhatsAppStatus(twilioStatus: string): NotificationDispatchStatus {
  switch (twilioStatus.toLowerCase()) {
    case "read":
    case "delivered":
      return "DELIVERED";
    case "sent":
    case "sending":
      return "SENT";
    case "queued":
      return "QUEUED";
    case "failed":
    case "undelivered":
    default:
      return "FAILED";
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database client unavailable" }, { status: 503 });
    }

    const signature = req.headers.get("x-twilio-signature");
    const fullUrl = req.url;

    // Parse form-urlencoded body from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // 1. Signature Verification
    const verification = verifyTwilioWebhook({
      url: fullUrl,
      signature,
      params,
      skipInDevelopment: true,
    });

    if (!verification.isValid) {
      console.warn("[WhatsApp Status] Signature verification failed:", verification.reason);
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const messageSid = params.MessageSid || params.SmsSid;
    const messageStatus = params.MessageStatus || params.SmsStatus || "";
    const errorCode = params.ErrorCode;
    const errorMessage = params.ErrorMessage;

    if (!messageSid) {
      return NextResponse.json({ error: "Missing MessageSid" }, { status: 400 });
    }

    const appStatus = mapWhatsAppStatus(messageStatus);

    // 2. Find notification dispatch by provider_message_id or twilio_message_sid
    const { data: dispatch } = await supabase
      .from("notification_dispatches")
      .select("id, organization_id, status")
      .or(`twilio_message_sid.eq.${messageSid},provider_message_id.eq.${messageSid}`)
      .limit(1)
      .single();

    if (dispatch) {
      const updateData: Database["public"]["Tables"]["notification_dispatches"]["Update"] = {
        status: appStatus,
        delivery_status_details: params,
        updated_at: new Date().toISOString(),
      };

      if (appStatus === "DELIVERED") {
        updateData.delivered_at = new Date().toISOString();
      } else if (appStatus === "SENT" && !dispatch.status.includes("DELIVERED")) {
        updateData.sent_at = new Date().toISOString();
      }

      if (errorCode) {
        updateData.error_details = {
          code: errorCode,
          message: errorMessage,
        };
      }

      await supabase.from("notification_dispatches").update(updateData).eq("id", dispatch.id);

      // Log in telephony_events for auditability
      await supabase.from("telephony_events").insert({
        organization_id: dispatch.organization_id,
        event_type: `WHATSAPP_${appStatus}`,
        event_payload: { messageSid, messageStatus, errorCode, errorMessage },
      });
    }

    return NextResponse.json({ success: true, messageSid, status: appStatus });
  } catch (err: unknown) {
    console.error("[WhatsApp Status] Exception in webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
