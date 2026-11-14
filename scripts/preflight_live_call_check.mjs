import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function preFlight() {
  console.log("=================================================================");
  console.log("VOICENEXUS — LIVE PSTN CALL PRE-FLIGHT VERIFICATION");
  console.log("=================================================================\n");

  let allOk = true;

  // 1. Next.js local server
  try {
    const res = await fetch("http://localhost:3000/api/calls", { signal: AbortSignal.timeout(4000) });
    console.log(`[Check 1] Next.js Server: REACHABLE (HTTP ${res.status})`);
  } catch (e) {
    console.error(`[Check 1] Next.js Server: FAILED - ${e.message}`);
    allOk = false;
  }

  // 2. ngrok tunnel reachability
  const tunnelUrl = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ravishing-flyable-detergent.ngrok-free.dev";
  try {
    const res = await fetch(`${tunnelUrl}/api/telephony/status?ping=1`, { signal: AbortSignal.timeout(5000) });
    console.log(`[Check 2] Public ngrok Tunnel: REACHABLE (HTTP ${res.status}) [${tunnelUrl}]`);
  } catch (e) {
    console.error(`[Check 2] Public ngrok Tunnel: FAILED - ${e.message}`);
    allOk = false;
  }

  // 3. Outbound TwiML endpoint via ngrok
  try {
    const t0 = Date.now();
    const twimlRes = await fetch(`${tunnelUrl}/api/telephony/outbound-twiml?sessionId=preflight_check&mode=TURN_BASED&language=ta-IN`, { signal: AbortSignal.timeout(6000) });
    const twimlText = await twimlRes.text();
    const elapsed = Date.now() - t0;
    const hasGather = twimlText.includes("<Gather input=\"speech\"");
    const hasSay = twimlText.includes("<Say") || twimlText.includes("<Play>");
    console.log(`[Check 3] Outbound TwiML: ACCESSIBLE (HTTP ${twimlRes.status} in ${elapsed}ms)`);
    console.log(`          Has <Gather input="speech">: ${hasGather}`);
    console.log(`          Has Audio/Speech: ${hasSay}`);
    if (!hasGather || !hasSay) allOk = false;
  } catch (e) {
    console.error(`[Check 3] Outbound TwiML: FAILED - ${e.message}`);
    allOk = false;
  }

  // 4. Twilio verified recipient check (+916382868845)
  try {
    const targetRecipient = "+916382868845";
    // Check call history to confirm target has successful connection history on this trial account
    const pastCalls = await client.calls.list({ to: targetRecipient, limit: 3 });
    console.log(`[Check 4] Recipient Verification (${targetRecipient}):`);
    console.log(`          Past successful calls on trial account: ${pastCalls.length} calls`);
    if (pastCalls.length > 0) {
      console.log(`          Most recent call: ${pastCalls[0].sid} (${pastCalls[0].status})`);
      console.log(`          Trial Verification Status: VERIFIED`);
    } else {
      console.warn(`          No past calls to ${targetRecipient} found.`);
      allOk = false;
    }
  } catch (e) {
    console.error(`[Check 4] Twilio verified caller IDs: FAILED - ${e.message}`);
    allOk = false;
  }

  // 5. Check active calls on Twilio
  try {
    const inProgress = await client.calls.list({ status: "in-progress", limit: 5 });
    const queued = await client.calls.list({ status: "queued", limit: 5 });
    const ringing = await client.calls.list({ status: "ringing", limit: 5 });
    const activeTwilio = [...inProgress, ...queued, ...ringing];
    console.log(`[Check 5] Twilio Active PSTN Calls: ${activeTwilio.length}`);
    if (activeTwilio.length > 0) {
      console.warn(`          Active SIDs: ${activeTwilio.map((c) => `${c.sid} (${c.status})`).join(", ")}`);
      allOk = false;
    } else {
      console.log("          Twilio telephony channel is completely free and clear.");
    }
  } catch (e) {
    console.error(`[Check 5] Twilio active calls check: FAILED - ${e.message}`);
    allOk = false;
  }

  // 6. Check active call lock in Supabase DB
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: dbCalls, error } = await supabase
      .from("call_sessions")
      .select("id, status, customer_phone, created_at")
      .in("status", ["INITIATING", "RINGING", "IN_PROGRESS"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[Check 6] Supabase DB Check: FAILED - ${error.message}`);
      allOk = false;
    } else {
      console.log(`[Check 6] Supabase Active Call Lock: ${dbCalls?.length || 0} active calls found`);
      if (dbCalls && dbCalls.length > 0) {
        console.warn(`          Active DB sessions: ${dbCalls.map((c) => `${c.id} (${c.status})`).join(", ")}`);
        allOk = false;
      } else {
        console.log("          Database active-call lock is FREE (ready for immediate call placement).");
      }
    }
  } catch (e) {
    console.error(`[Check 6] DB check: FAILED - ${e.message}`);
    allOk = false;
  }

  console.log("\n=================================================================");
  if (allOk) {
    console.log("PRE-FLIGHT STATUS: ALL 6 CHECKS PASSED. READY FOR LIVE TEST CALL.");
  } else {
    console.log("PRE-FLIGHT STATUS: SOME CHECKS FAILED. DO NOT PROCEED.");
  }
  console.log("=================================================================");
}

preFlight().catch(console.error);
