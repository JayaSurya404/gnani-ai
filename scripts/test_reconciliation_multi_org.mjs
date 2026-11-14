import { createClient } from "@supabase/supabase-js";
import fs from "fs";

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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function run() {
  console.log("=== MULTI-CALL & ACTIVE-STATE RECONCILIATION VERIFICATION ===");
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  const orgId = org?.id;

  // Test A: Confirm multiple concurrent calls in same org are independently reconciled
  console.log("\n[Test A] Multiple calls in same organization");
  const sid1 = `CAmulti_test_1_${Date.now()}`;
  const sid2 = `CAmulti_test_2_${Date.now()}`;
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();

  await supabase.from("call_sessions").insert([
    {
      id: id1,
      organization_id: orgId,
      direction: "OUTBOUND",
      channel: "TELEPHONY",
      customer_phone: "+919999911111",
      status: "INITIATING",
      recording_url: `twilio:${sid1}`,
      start_time: new Date().toISOString(),
    },
    {
      id: id2,
      organization_id: orgId,
      direction: "OUTBOUND",
      channel: "TELEPHONY",
      customer_phone: "+919999922222",
      status: "INITIATING",
      recording_url: `twilio:${sid2}`,
      start_time: new Date().toISOString(),
    },
  ]);

  // Reconcile call 1 via callback
  const f1 = new URLSearchParams();
  f1.append("CallSid", sid1);
  f1.append("CallStatus", "completed");
  f1.append("CallDuration", "42");
  await fetch(`${BASE_URL}/api/telephony/status`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: f1.toString(),
  });

  // Verify call 1 is COMPLETED and call 2 is still INITIATING (no bleed)
  const { data: r1 } = await supabase.from("call_sessions").select("status, duration_seconds").eq("id", id1).single();
  const { data: r2 } = await supabase.from("call_sessions").select("status, duration_seconds").eq("id", id2).single();

  assert(r1?.status === "COMPLETED" && r1?.duration_seconds === 42, "Call 1 updated to COMPLETED with 42s duration");
  assert(r2?.status === "INITIATING", "Call 2 remained INITIATING (no crosstalk between same-org calls)");

  // Reconcile call 2 via callback
  const f2 = new URLSearchParams();
  f2.append("CallSid", sid2);
  f2.append("CallStatus", "busy");
  await fetch(`${BASE_URL}/api/telephony/status`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: f2.toString(),
  });

  const { data: r2Updated } = await supabase.from("call_sessions").select("status").eq("id", id2).single();
  assert(r2Updated?.status === "BUSY", "Call 2 updated to BUSY independently");

  // Cleanup Test A
  await supabase.from("call_events").delete().in("call_session_id", [id1, id2]);
  await supabase.from("call_sessions").delete().in("id", [id1, id2]);

  // Test B: Verify genuinely active call is NOT marked completed by GET /api/telephony/status
  console.log("\n[Test B] Active call safety: non-terminal state never marked completed");
  const activeId = crypto.randomUUID();
  await supabase.from("call_sessions").insert({
    id: activeId,
    organization_id: orgId,
    direction: "OUTBOUND",
    channel: "TELEPHONY",
    customer_phone: "+919999933333",
    status: "IN_PROGRESS",
    start_time: new Date().toISOString(),
  });

  const activeRes = await fetch(`${BASE_URL}/api/telephony/status?sessionId=${activeId}`);
  const activeData = await activeRes.json();
  assert(activeData.success === true, "GET /api/telephony/status returned 200");
  assert(activeData.session?.status === "IN_PROGRESS", `Active call preserves IN_PROGRESS status (got: ${activeData.session?.status})`);

  // Cleanup Test B
  await supabase.from("call_sessions").delete().eq("id", activeId);

  // Test C: Concurrency Lock Release Verification
  console.log("\n[Test C] Concurrency lock release after call completes");
  // Check our real Chitresh Kumar lead phone number (+916382868845)
  // Candidate in-flight call query
  const { data: inFlightCandidates } = await supabase
    .from("call_sessions")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("customer_phone", "+916382868845")
    .in("status", ["INITIATING", "RINGING", "IN_PROGRESS"]);

  assert(
    !inFlightCandidates || inFlightCandidates.length === 0,
    `No in-flight blocking calls remain for +916382868845 (found: ${inFlightCandidates?.length || 0})`
  );

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);
  console.log(`========================================`);

  if (passed === total) process.exit(0);
  else process.exit(1);
}

run().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});

