import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";

function loadEnv() {
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(twilioAccountSid, twilioAuthToken);

const sessionId = "28c59707-46ef-40a9-ac3f-b22d2af870ba";

async function main() {
  console.log("=== INSPECTING SESSION:", sessionId, "===");
  const { data: session } = await sb.from("call_sessions").select("*").eq("id", sessionId).single();
  console.log("\n--- CALL SESSION RECORD ---");
  console.log(JSON.stringify(session, null, 2));

  const { data: segments } = await sb
    .from("transcript_segments")
    .select("*")
    .eq("call_session_id", sessionId)
    .order("created_at", { ascending: true });
  console.log("\n--- TRANSCRIPT SEGMENTS ---");
  console.log(JSON.stringify(segments, null, 2));

  const { data: events } = await sb
    .from("call_events")
    .select("*")
    .eq("call_session_id", sessionId)
    .order("created_at", { ascending: true });
  console.log("\n--- CALL EVENTS ---");
  console.log(JSON.stringify(events, null, 2));

  const callSid = session?.external_call_id || "CAbecba2e8dc75930115fc18ca32d8c838";
  console.log("\n--- TWILIO CALL METADATA (CallSid:", callSid, ") ---");
  try {
    const call = await twilioClient.calls(callSid).fetch();
    console.log("Twilio Call Details:", {
      sid: call.sid,
      status: call.status,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime,
      from: call.from,
      to: call.to,
      direction: call.direction,
      answeredBy: call.answeredBy,
    });

    const notifs = await twilioClient.calls(callSid).notifications.list();
    console.log("Twilio Notifications/Errors count:", notifs.length);
    if (notifs.length > 0) {
      console.log("Notifications:", JSON.stringify(notifs, null, 2));
    }
  } catch (err) {
    console.warn("Twilio call fetch error:", err.message);
  }
}

main();
