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

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log("=== PHASE 5 COMPREHENSIVE VERIFICATION SUITE ===");
  console.log(`Target: ${BASE_URL}\n`);

  // Get test organization
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  const orgId = org?.id;

  // -------------------------------------------------------------
  // Test 1: GET /api/telephony/status Endpoint
  // -------------------------------------------------------------
  console.log("[Test 1] Testing GET /api/telephony/status Endpoint");
  const testSessionId = "d85fa59e-af99-4642-8f0d-e7d33b098015"; // The live test call from earlier
  const res1 = await fetch(`${BASE_URL}/api/telephony/status?sessionId=${testSessionId}`);
  const data1 = await res1.json();
  assert(res1.status === 200, "GET /api/telephony/status returns 200 OK");
  assert(data1.success === true, "Response has success: true");
  assert(data1.session?.status === "COMPLETED", `Session status correctly resolved to COMPLETED (got: ${data1.session?.status})`);
  assert(data1.session?.durationSeconds === 10, `Duration correctly retrieved as 10s (got: ${data1.session?.durationSeconds})`);

  // -------------------------------------------------------------
  // Test 2: Status Callback Handling for Terminal States
  // -------------------------------------------------------------
  console.log("\n[Test 2] Testing POST /api/telephony/status for Terminal States");
  const statusesToTest = ["completed", "failed", "busy", "no-answer", "canceled"];
  for (const st of statusesToTest) {
    const mockSid = `CAmock_${Date.now()}_${st}`;
    const testSessionDbId = crypto.randomUUID();

    // Insert synthetic session
    await supabase.from("call_sessions").insert({
      id: testSessionDbId,
      organization_id: orgId,
      direction: "OUTBOUND",
      channel: "TELEPHONY",
      customer_phone: "+919999999999",
      status: "INITIATING",
      recording_url: `twilio:${mockSid}`,
      start_time: new Date().toISOString(),
    });

    const form = new URLSearchParams();
    form.append("CallSid", mockSid);
    form.append("CallStatus", st);
    form.append("CallDuration", "15");

    const statusRes = await fetch(`${BASE_URL}/api/telephony/status`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    await statusRes.json();
    assert(statusRes.status === 200, `POST status callback for '${st}' returns 200 OK`);

    const { data: updated } = await supabase
      .from("call_sessions")
      .select("status, duration_seconds")
      .eq("id", testSessionDbId)
      .single();

    let expectedMapped = st.toUpperCase().replace("-", "_");
    assert(updated?.status === expectedMapped, `Session updated in DB to '${expectedMapped}' (got: ${updated?.status})`);

    // Cleanup synthetic session
    await supabase.from("call_events").delete().eq("call_session_id", testSessionDbId);
    await supabase.from("call_sessions").delete().eq("id", testSessionDbId);
  }

  // -------------------------------------------------------------
  // Test 3: Idempotent Status Callbacks
  // -------------------------------------------------------------
  console.log("\n[Test 3] Testing Idempotent Repeated Status Callbacks");
  const idemSid = `CAidem_${Date.now()}`;
  const idemSessionId = crypto.randomUUID();

  await supabase.from("call_sessions").insert({
    id: idemSessionId,
    organization_id: orgId,
    direction: "OUTBOUND",
    channel: "TELEPHONY",
    customer_phone: "+919999999999",
    status: "INITIATING",
    recording_url: `twilio:${idemSid}`,
    start_time: new Date().toISOString(),
  });

  const formIdem = new URLSearchParams();
  formIdem.append("CallSid", idemSid);
  formIdem.append("CallStatus", "completed");
  formIdem.append("CallDuration", "25");

  // First callback
  const firstRes = await fetch(`${BASE_URL}/api/telephony/status`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formIdem.toString(),
  });
  const firstData = await firstRes.json();
  assert(firstData.success === true && !firstData.idempotent, "First callback executes state transition");

  // Second (repeated) callback
  const secondRes = await fetch(`${BASE_URL}/api/telephony/status`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formIdem.toString(),
  });
  const secondData = await secondRes.json();
  assert(secondData.success === true && secondData.idempotent === true, "Second repeated callback returns idempotent: true");

  // Cleanup
  await supabase.from("call_events").delete().eq("call_session_id", idemSessionId);
  await supabase.from("call_sessions").delete().eq("id", idemSessionId);

  // -------------------------------------------------------------
  // Test 4: Natural Bilingual Fallback TwiML
  // -------------------------------------------------------------
  console.log("\n[Test 4] Testing Natural Bilingual Fallback TwiML");
  // Test turn endpoint error handling (pass malformed form-data to trigger catch)
  const turnErrRes = await fetch(`${BASE_URL}/api/telephony/turn?language=ta-IN`, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=missing" },
    body: "garbage",
  });
  const turnXml = await turnErrRes.text();
  assert(turnErrRes.status === 200, "Error fallback returns HTTP 200 so Twilio executes fallback speech");
  assert(
    turnXml.includes("மன்னிக்கவும்") && turnXml.includes("கோளாறு"),
    "Tamil polite fallback spoken on Tamil turn error"
  );
  assert(!turnXml.includes("An internal error occurred"), "Deprecated cryptic error message removed");

  // Verify that any <Say> tag never contains a raw URL
  const sayMatches = turnXml.match(/<Say[^>]*>(.*?)<\/Say>/g);
  for (const s of sayMatches || []) {
    assert(!s.includes("http://") && !s.includes("https://"), "No raw URL spoken inside <Say>");
  }

  // Test English fallback
  const turnEnErrRes = await fetch(`${BASE_URL}/api/telephony/turn?language=en-IN`, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=missing" },
    body: "garbage",
  });
  const turnEnXml = await turnEnErrRes.text();
  assert(
    turnEnXml.includes("We apologize") && turnEnXml.includes("technical difficulty"),
    "English polite fallback spoken on English turn error"
  );

  // -------------------------------------------------------------
  // Test 5: Reconcile In-Flight Calls via GET /api/calls
  // -------------------------------------------------------------
  console.log("\n[Test 5] Testing Background Sweep in GET /api/calls");
  const callsRes = await fetch(`${BASE_URL}/api/calls`);
  const callsData = await callsRes.json();
  assert(callsRes.status === 200, "GET /api/calls returns 200 OK");
  assert(Array.isArray(callsData.calls), "Returned calls is an array");
  // Check that no call in the list is stuck at INITIATING older than 60s
  const now = Date.now();
  const staleInitiating = callsData.calls.filter((c) => {
    if (c.status === "INITIATING") {
      const age = (now - new Date(c.created_at || c.start_time).getTime()) / 1000;
      return age > 60;
    }
    return false;
  });
  assert(staleInitiating.length === 0, `Zero stale initiating calls in /calls response (found: ${staleInitiating.length})`);

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`========================================`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
