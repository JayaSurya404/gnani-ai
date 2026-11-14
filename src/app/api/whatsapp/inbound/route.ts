import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioWebhook } from "@/lib/telephony/webhook-auth";
import { normalizePhone, getPhoneVariants } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    if (!supabase) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>System unavailable.</Message></Response>`,
        { status: 503, headers: { "Content-Type": "text/xml" } }
      );
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
      console.warn("[WhatsApp Inbound] Signature verification failed:", verification.reason);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
        { status: 403, headers: { "Content-Type": "text/xml" } }
      );
    }

    const rawFrom = params.From || ""; // e.g. "whatsapp:+919876543210"
    const bodyText = (params.Body || "").trim();
    const messageSid = params.MessageSid || "";
    const profileName = params.ProfileName || "WhatsApp Contact";

    const cleanFrom = rawFrom.replace("whatsapp:", "").trim();
    const normalizedPhone = normalizePhone(cleanFrom);
    const variants = getPhoneVariants(normalizedPhone);

    // Identify organization
    const { data: defaultOrg } = await supabase.from("organizations").select("id").limit(1).single();
    const organizationId = defaultOrg?.id;

    if (!organizationId) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Check opt-out keywords
    const isOptOut = /^(stop|unsubscribe|cancel|optout|quit)$/i.test(bodyText);

    let replyMessage = "";

    if (isOptOut) {
      // Find and update or insert DNC lead
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", organizationId)
        .in("phone", variants)
        .limit(1)
        .single();

      if (existingLead) {
        await supabase
          .from("leads")
          .update({
            status: "DO_NOT_CALL",
            do_not_call: true,
            notes: "Opted out via WhatsApp STOP keyword (" + messageSid + ")",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLead.id);
      } else {
        await supabase.from("leads").insert({
          organization_id: organizationId,
          phone: normalizedPhone,
          name: profileName,
          status: "DO_NOT_CALL",
          do_not_call: true,
          source: "WHATSAPP_OPT_OUT",
          notes: "Customer sent STOP keyword via WhatsApp",
        });
      }

      await supabase.from("telephony_events").insert({
        organization_id: organizationId,
        event_type: "WHATSAPP_DNC_OPT_OUT",
        event_payload: { from: cleanFrom, messageSid },
      });

      replyMessage = "You have been unsubscribed from VoiceNexus AI messages. Reply START to resubscribe.";
    } else {
      // Standard customer message
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", organizationId)
        .in("phone", variants)
        .limit(1)
        .single();

      if (existingLead) {
        await supabase
          .from("leads")
          .update({
            notes: `Last WhatsApp (${new Date().toLocaleTimeString()}): "${bodyText}"`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLead.id);
      } else {
        await supabase.from("leads").insert({
          organization_id: organizationId,
          phone: normalizedPhone,
          name: profileName,
          status: "NEW",
          source: "INBOUND_WHATSAPP",
          notes: `Inbound inquiry: "${bodyText}"`,
        });
      }

      replyMessage = "Thank you for contacting VoiceNexus AI! Our team and automated voice representative are reviewing your inquiry and will follow up shortly.";
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMessage}</Message>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (err: unknown) {
    console.error("[WhatsApp Inbound] Error processing incoming message:", err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
