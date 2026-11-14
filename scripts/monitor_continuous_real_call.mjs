import fs from "fs";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx !== -1) {
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET_LEAD_ID = "de8bf0a4-cc40-4487-82e7-b7488027ff7c";
const TARGET_PHONE = "+916382868845";

async function executeContinuousLiveCall() {
  console.log("=== VOICE NEXUS: INITIATING CONTINUOUS MULTI-TURN REAL CALL ===");
  console.log(`Target Lead:  ${TARGET_LEAD_ID}`);
  console.log(`Target Phone: +91****8845`);
  console.log("Mode: TURN_BASED | Language: ta-IN | Voice: Asmita\n");

  const dispatchStart = Date.now();
  const res = await fetch("http://localhost:3000/api/telephony/outbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: TARGET_LEAD_ID,
      customerPhone: TARGET_PHONE,
      customerName: "Chitresh Kumar",
      language: "ta-IN",
      voice: "Asmita",
      mode: "TURN_BASED",
      skipWindowCheck: true,
    }),
  });

  const data = await res.json();
  const dispatchDurationMs = Date.now() - dispatchStart;
  console.log(`Dispatch Response (${dispatchDurationMs}ms):`, JSON.stringify(data, null, 2));

  if (!res.ok || !data.success) {
    console.error("FATAL: Outbound call initiation failed:", data.error || res.statusText);
    process.exit(1);
  }

  const sessionId = data.sessionId || data.callSessionId;
  const twilioCallSid = data.twilioCallSid || data.callSid;

  console.log(`\n======================================================`);
  console.log(`REAL CARRIER CALL INITIATED!`);
  console.log(`Session ID:      ${sessionId}`);
  console.log(`Twilio Call SID: ${twilioCallSid}`);
  console.log(`======================================================\n`);
  console.log("Monitoring continuous live call lifecycle across all turns (up to 300 seconds)...\n");

  const seenSegments = new Set();
  const seenEvents = new Set();
  const startTime = Date.now();
  let lastTwilioStatus = "";
  let callerTurnCount = 0;
  let aiTurnCount = 0;

  // Poll loop: allows full continuous multi-turn dialogue until the caller hangs up
  while (Date.now() - startTime < 300000) {
    try {
      // 1. Check Twilio Carrier Status
      if (twilioCallSid && !twilioCallSid.startsWith("simulated")) {
        try {
          const twCall = await client.calls(twilioCallSid).fetch();
          if (twCall.status !== lastTwilioStatus) {
            lastTwilioStatus = twCall.status;
            console.log(`[Twilio Carrier Status] => ${twCall.status.toUpperCase()} (duration: ${twCall.duration || 0}s)`);
          }
          if (["completed", "busy", "no-answer", "failed", "canceled"].includes(twCall.status)) {
            console.log(`\n>>> Carrier Call Ended: ${twCall.status.toUpperCase()} (Total duration: ${twCall.duration || 0}s) <<<`);
            break;
          }
        } catch {
          // Transient network ignore
        }
      }

      // 2. Poll Supabase for Transcript Segments
      const { data: segments } = await supabase
        .from("transcript_segments")
        .select("*")
        .eq("call_session_id", sessionId)
        .order("created_at", { ascending: true });

      if (segments) {
        for (const seg of segments) {
          if (!seenSegments.has(seg.id)) {
            seenSegments.add(seg.id);
            const timeStr = new Date(seg.created_at).toLocaleTimeString("en-US", { hour12: false });
            if (seg.speaker === "CALLER") {
              callerTurnCount++;
              console.log(`\n🎤 [Turn ${callerTurnCount} CALLER SPEECH] [${timeStr}]: "${seg.text}" (${seg.language || "ta-IN"})`);
            } else {
              aiTurnCount++;
              console.log(`🤖 [Turn ${aiTurnCount} AI RESPONSE] [${timeStr}]: "${seg.text}" (${seg.language || "ta-IN"})`);
            }
          }
        }
      }

      // 3. Poll Supabase for Call Events
      const { data: events } = await supabase
        .from("call_events")
        .select("*")
        .eq("call_session_id", sessionId)
        .order("created_at", { ascending: true });

      if (events) {
        for (const ev of events) {
          if (!seenEvents.has(ev.id)) {
            seenEvents.add(ev.id);
            const timeStr = new Date(ev.created_at).toLocaleTimeString("en-US", { hour12: false });
            if (ev.event_type === "AGENT_RESPONSE") {
              const p = ev.payload || {};
              console.log(`⚡ [AI Synthesis Metric] AudioId=${p.audioId || "none"} | Provider=${p.ttsProvider} | Duration=${p.ttsDurationMs}ms`);
            } else if (ev.event_type !== "USER_TRANSCRIPT") {
              console.log(`ℹ️ [Event ${timeStr}] ${ev.event_type}`);
            }
          }
        }
      }
    } catch {
      // Safe polling loop
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  // Final summary retrieval
  console.log("\n=== POST-CALL VERIFICATION SUMMARY ===");
  const { data: finalSession } = await supabase.from("call_sessions").select("*").eq("id", sessionId).single();
  console.log("Final Session Record:", JSON.stringify(finalSession, null, 2));

  const { data: allSegments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("call_session_id", sessionId)
    .order("created_at", { ascending: true });

  console.log(`\nTotal Spoken Turns Recorded: ${allSegments?.length || 0}`);
  for (const s of allSegments || []) {
    console.log(`- [${s.speaker}] ${s.created_at}: "${s.text}"`);
  }

  console.log(`\nTotal Caller Turns: ${callerTurnCount}`);
  console.log(`Total AI Responses: ${aiTurnCount}`);
}

executeContinuousLiveCall().catch((err) => {
  console.error("Live call execution fatal error:", err);
  process.exit(1);
});
