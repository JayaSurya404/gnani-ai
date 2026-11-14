import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    const formData = await req.formData();
    const dialStatus = formData.get("DialCallStatus")?.toString() || "";
    const dialDuration = formData.get("DialCallDuration")?.toString() || "0";

    const isSuccess = dialStatus.toLowerCase() === "completed" || dialStatus.toLowerCase() === "answered";

    if (supabase && sessionId) {
      const { data: session } = await supabase
        .from("call_sessions")
        .select("organization_id")
        .eq("id", sessionId)
        .single();

      const orgId = session?.organization_id || "";

      await supabase
        .from("call_sessions")
        .update({
          transfer_status: isSuccess ? "COMPLETED" : "FAILED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (orgId) {
        await supabase.from("telephony_events").insert({
          organization_id: orgId,
          call_session_id: sessionId,
          event_type: isSuccess ? "TRANSFER_COMPLETED" : "TRANSFER_FAILED",
          event_payload: { dialStatus, dialDuration },
        });
      }
    }

    const message = isSuccess
      ? "Thank you for speaking with our team. Goodbye."
      : "We were unable to reach our representative right now. A follow-up task has been logged. Thank you.";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
  <Hangup/>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
      { status: 500, headers: { "Content-Type": "text/xml" } }
    );
  }
}
