import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
  console.log("=================================================================");
  console.log("FORENSIC INVESTIGATION — THIRD REAL LIVE CALL");
  console.log("=================================================================\n");

  const sessionId = "ea4b3ca0-62a2-4b25-80b3-035da8e96af9";

  // 1. Fetch Call Session
  const { data: session, error: sessErr } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  console.log("[1] Call Session:", session || sessErr);

  // 2. Fetch Transcript Segments
  const { data: segments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("call_session_id", sessionId)
    .order("created_at", { ascending: true });

  console.log(`\n[2] Transcript Segments (${segments?.length || 0}):`);
  segments?.forEach((s, idx) => {
    console.log(`  Segment ${idx + 1}:`);
    console.log(`    Speaker: ${s.speaker}`);
    console.log(`    Content: ${s.content}`);
    console.log(`    Confidence: ${s.confidence}`);
    console.log(`    Language: ${s.language}`);
    console.log(`    Timestamp: ${s.created_at}`);
  });

  // 3. Fetch Call Events
  const { data: events } = await supabase
    .from("call_events")
    .select("*")
    .eq("call_session_id", sessionId)
    .order("created_at", { ascending: true });

  console.log(`\n[3] Call Events (${events?.length || 0}):`);
  events?.forEach((e, idx) => {
    console.log(`  Event ${idx + 1}: [${e.event_type}] ${JSON.stringify(e.payload || e.metadata || {})}`);
  });

  // 4. Extract Twilio Call SID
  const twSidMatch = session?.recording_url?.match(/CA[a-zA-Z0-9]{32}/i);
  const twSid = twSidMatch ? twSidMatch[0] : null;
  console.log(`\n[4] Twilio Call SID: ${twSid}`);

  if (twSid) {
    const twCall = await client.calls(twSid).fetch();
    console.log(`  Twilio Call Status: ${twCall.status}`);
    console.log(`  Duration: ${twCall.duration}s`);
    console.log(`  Start: ${twCall.startTime}`);
    console.log(`  End: ${twCall.endTime}`);
    console.log(`  From: ${twCall.from}`);
    console.log(`  To: ${twCall.to}`);

    // Check notifications for this call
    try {
      const notifs = await client.calls(twSid).notifications.list();
      console.log(`  Twilio Notifications count: ${notifs.length}`);
      notifs.forEach((n) => {
        console.log(`    [Notif ${n.errorCode}] ${n.messageText} | Url: ${n.requestUrl} | Status: ${n.responseStatusCode}`);
      });
    } catch (e) {
      console.warn("  Could not fetch notifications:", e.message);
    }
  }
}

inspect().catch(console.error);
