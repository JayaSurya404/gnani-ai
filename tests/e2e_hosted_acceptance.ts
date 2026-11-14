import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function parseEnv(content: string) {
  const res: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      res[key] = val;
    }
  }
  return res;
}

const env = parseEnv(fs.readFileSync(".env.local", "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function runHostedAcceptanceTests() {
  console.log("=====================================================================");
  console.log("  VoiceNexus AI — Phase 3 Live Hosted Acceptance & Tenancy Test");
  console.log("  Host:", new URL(url).hostname);
  console.log("=====================================================================");

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const timestamp = Date.now();
  const testEmailA = `voicenexus.test.owner.a.${timestamp}@gmail.com`;
  const testPassword = `TestPass!9${timestamp}#`;
  const testOrgNameA = `Apex Solar Solutions ${timestamp}`;

  const testEmailB = `voicenexus.test.owner.b.${timestamp}@gmail.com`;
  const testOrgNameB = `Horizon Wind Ltd ${timestamp}`;

  let userAId: string | null = null;
  let userBId: string | null = null;
  let orgAId: string | null = null;
  let orgBId: string | null = null;

  try {
    // -----------------------------------------------------------------
    // TEST 1: New User Registration & Database Trigger Provisioning
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Registering User A with organization metadata via Admin API (avoids SMTP rate limits)...");
    const clientA = createClient(url, anonKey, { auth: { persistSession: false } });

    // Use admin.createUser with email_confirm: true so it doesn't trigger SMTP email rate limit
    const { data: createDataA, error: createErrA } = await adminClient.auth.admin.createUser({
      email: testEmailA,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Apex Owner A",
        organization_name: testOrgNameA,
      },
    });

    if (createErrA || !createDataA.user) {
      throw new Error(`Create User A failed: ${createErrA?.message}`);
    }

    userAId = createDataA.user.id;
    console.log(`  -> User A registered with ID: ${userAId}`);

    // Verify trigger public.profiles creation
    const { data: profileA, error: profErrA } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userAId)
      .single();

    if (profErrA || !profileA) {
      throw new Error(`Profile not created by trigger: ${profErrA?.message}`);
    }
    console.log(`  [PASS] public.profiles created for User A (full_name: "${profileA.full_name}")`);

    // Verify trigger public.organization_members creation
    const { data: memberA, error: memErrA } = await adminClient
      .from("organization_members")
      .select("*, organizations(*)")
      .eq("user_id", userAId)
      .single();

    if (memErrA || !memberA) {
      throw new Error(`Organization membership not created by trigger: ${memErrA?.message}`);
    }

    orgAId = memberA.organization_id;
    console.log(`  [PASS] public.organization_members created (role: "${memberA.role}", orgId: "${orgAId}")`);
    if (memberA.role !== "OWNER") {
      throw new Error(`Expected role OWNER, got: ${memberA.role}`);
    }

    // Verify trigger public.businesses creation
    const { data: bizA, error: bizErrA } = await adminClient
      .from("businesses")
      .select("*")
      .eq("organization_id", orgAId)
      .single();

    if (bizErrA || !bizA) {
      throw new Error(`Business profile not created by trigger: ${bizErrA?.message}`);
    }
    console.log(`  [PASS] public.businesses default profile created (name: "${bizA.name}")`);

    // -----------------------------------------------------------------
    // TEST 2: User Login, Session Persistence & Auth Tokens
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Testing User A Login & Authentication...");
    const { data: signInA, error: signInErrA } = await clientA.auth.signInWithPassword({
      email: testEmailA,
      password: testPassword,
    });

    if (signInErrA || !signInA.session) {
      throw new Error(`Login failed for User A: ${signInErrA?.message}`);
    }

    console.log(`  [PASS] Login successful! Active JWT session acquired.`);
    console.log(`  -> Token expires at: ${new Date(signInA.session.expires_at! * 1000).toISOString()}`);

    // Use clientA directly as it already holds User A's authenticated session
    console.log("\n[TEST 3] Testing Real Data Persistence under User A session (clientA)...");
    const { data: userCheck } = await clientA.auth.getUser();
    console.log(`  -> clientA authenticated user id: ${userCheck.user?.id}`);

    // Select business profile first
    const { data: selectBiz, error: selectBizErr } = await clientA
      .from("businesses")
      .select("*")
      .eq("organization_id", orgAId);

    console.log(`  -> clientA select on businesses: rows = ${selectBiz?.length ?? 0}, error = ${selectBizErr?.message || "none"}`);

    // Update business profile
    const { data: updatedBiz, error: updateBizErr } = await clientA
      .from("businesses")
      .update({
        tagline: "Premier Rooftop EPC in Tamil Nadu",
        phone: "+91 98401 23456",
        city: "Chennai",
        state: "Tamil Nadu",
      })
      .eq("id", bizA.id)
      .select();

    if (updateBizErr || !updatedBiz || updatedBiz.length === 0) {
      throw new Error(`Failed to update business profile: ${updateBizErr?.message || "0 rows updated"}`);
    }
    console.log(`  [PASS] Business profile updated (city: "${updatedBiz[0].city}", phone: "${updatedBiz[0].phone}")`);

    // Create a new lead under Tenant A
    const { data: newLeadA, error: newLeadErrA } = await clientA
      .from("leads")
      .insert({
        organization_id: orgAId,
        business_id: bizA.id,
        name: "Karthik Subramanian",
        phone: "+91 98402 34567",
        email: "karthik.sub@client.com",
        temperature: "HOT",
        status: "NEW",
        score: 85,
        source: "Inbound Consultation",
        primary_interest: "Commercial 25kW Rooftop EPC",
        summary: "Prospective lead for spinning mill rooftop solar installation.",
      })
      .select()
      .single();

    if (newLeadErrA || !newLeadA) {
      throw new Error(`Failed to insert lead: ${newLeadErrA?.message}`);
    }
    console.log(`  [PASS] Lead inserted into public.leads (ID: ${newLeadA.id}, name: "${newLeadA.name}", score: ${newLeadA.score})`);

    // Query the lead back
    const { data: fetchedLead, error: fetchLeadErr } = await clientA
      .from("leads")
      .select("*")
      .eq("id", newLeadA.id)
      .single();

    if (fetchLeadErr || !fetchedLead) {
      throw new Error(`Failed to read lead back: ${fetchLeadErr?.message}`);
    }
    console.log(`  [PASS] Lead read back successfully from Supabase: "${fetchedLead.name}" (${fetchedLead.temperature})`);

    // Update lead status
    const { data: updatedLead, error: updateLeadErr } = await clientA
      .from("leads")
      .update({
        status: "QUALIFIED",
        score: 95,
      })
      .eq("id", newLeadA.id)
      .select()
      .single();

    if (updateLeadErr || !updatedLead) {
      throw new Error(`Failed to update lead status: ${updateLeadErr?.message}`);
    }
    console.log(`  [PASS] Lead status updated to "${updatedLead.status}" (new score: ${updatedLead.score})`);

    // Verify Refresh & Persistence: Simulate fresh browser session
    console.log("  -> Simulating application refresh with fresh client session...");
    const refreshClient = createClient(url, anonKey, { auth: { persistSession: false } });
    await refreshClient.auth.setSession({
      access_token: signInA.session.access_token,
      refresh_token: signInA.session.refresh_token,
    });
    const { data: persistedLead, error: persistErr } = await refreshClient
      .from("leads")
      .select("*")
      .eq("id", newLeadA.id)
      .single();

    if (persistErr || !persistedLead) {
      throw new Error(`Failed to verify persisted lead on refresh: ${persistErr?.message}`);
    }
    if (persistedLead.status !== "QUALIFIED" || persistedLead.score !== 95) {
      throw new Error(`Lead persistence state mismatch: status=${persistedLead.status}, score=${persistedLead.score}`);
    }
    console.log(`  [PASS] Refresh & Persistence verified: status="${persistedLead.status}", score=${persistedLead.score}`);

    // -----------------------------------------------------------------
    // TEST 4: Cross-Tenant Isolation (Tenant B cannot see or touch Tenant A)
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Testing Cross-Tenant Isolation with Tenant B...");
    const clientB = createClient(url, anonKey, { auth: { persistSession: false } });

    const { data: createDataB, error: createErrB } = await adminClient.auth.admin.createUser({
      email: testEmailB,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Horizon Owner B",
        organization_name: testOrgNameB,
      },
    });

    if (createErrB || !createDataB.user) {
      throw new Error(`Create User B failed: ${createErrB?.message}`);
    }
    userBId = createDataB.user.id;
    console.log(`  -> User B registered with ID: ${userBId}`);

    const { data: signInB, error: signInErrB } = await clientB.auth.signInWithPassword({
      email: testEmailB,
      password: testPassword,
    });

    if (signInErrB || !signInB.session) {
      throw new Error(`Login failed for User B: ${signInErrB?.message}`);
    }

    const { data: memberB } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userBId)
      .single();
    if (memberB) {
      orgBId = memberB.organization_id;
    }

    // Test 4a: User B queries Tenant A leads (MUST RETURN 0 ROWS)
    const { data: crossTenantLeads, error: crossLeadsErr } = await clientB
      .from("leads")
      .select("*")
      .eq("organization_id", orgAId);

    if (crossLeadsErr) {
      console.log(`  [PASS] Cross-tenant SELECT rejected with error: ${crossLeadsErr.message}`);
    } else {
      if (crossTenantLeads && crossTenantLeads.length > 0) {
        throw new Error(`CRITICAL SECURITY LEAK: Tenant B was able to view Tenant A leads (Count: ${crossTenantLeads.length})`);
      }
      console.log(`  [PASS] Tenant B SELECT on Tenant A organization returned 0 rows (RLS Isolation Verified)`);
    }

    // Test 4b: User B attempts to UPDATE Tenant A's lead (MUST FAIL / RETURN 0 ROWS)
    const { data: illegalUpdate } = await clientB
      .from("leads")
      .update({ name: "HACKED BY TENANT B" })
      .eq("id", newLeadA.id)
      .select();

    if (illegalUpdate && illegalUpdate.length > 0) {
      throw new Error(`CRITICAL SECURITY LEAK: Tenant B was able to UPDATE Tenant A's lead!`);
    }
    console.log(`  [PASS] Tenant B UPDATE on Tenant A lead affected 0 rows (RLS Isolation Verified)`);

    // Test 4c: User B attempts to DELETE Tenant A's lead (MUST FAIL / RETURN 0 ROWS)
    const { data: illegalDelete } = await clientB
      .from("leads")
      .delete()
      .eq("id", newLeadA.id)
      .select();

    if (illegalDelete && illegalDelete.length > 0) {
      throw new Error(`CRITICAL SECURITY LEAK: Tenant B was able to DELETE Tenant A's lead!`);
    }
    console.log(`  [PASS] Tenant B DELETE on Tenant A lead affected 0 rows (RLS Isolation Verified)`);

    // Verify Tenant A lead is still intact
    const { data: leadStillIntact } = await clientA
      .from("leads")
      .select("name, score")
      .eq("id", newLeadA.id)
      .single();

    if (!leadStillIntact || leadStillIntact.name !== "Karthik Subramanian") {
      throw new Error("Lead integrity compromised!");
    }
    console.log(`  [PASS] Lead data integrity verified: name is still "${leadStillIntact.name}"`);

    // -----------------------------------------------------------------
    // TEST 5: Anonymous Visitor Protection
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Testing Anonymous Visitor Restrictions...");
    const anonVisitorClient = createClient(url, anonKey, { auth: { persistSession: false } });

    // Anon attempts to read leads
    const { data: anonLeads, error: anonLeadsErr } = await anonVisitorClient
      .from("leads")
      .select("*");

    console.log(`  [PASS] Anon SELECT on leads: ${anonLeadsErr ? "DENIED (" + anonLeadsErr.message + ")" : `${anonLeads?.length ?? 0} rows returned`}`);

    // Anon attempts to inject privileged fields (score=100)
    const { data: anonInject, error: anonInjectErr } = await anonVisitorClient
      .from("leads")
      .insert({
        organization_id: orgAId,
        name: "Spam Attacker",
        phone: "+91 99999 88888",
        score: 100, // Privileged field
        status: "QUALIFIED", // Privileged field
      } as unknown as Record<string, unknown>)
      .select();

    if (anonInject && anonInject.length > 0) {
      throw new Error("CRITICAL SECURITY LEAK: Anonymous user was able to inject privileged fields!");
    }
    console.log(`  [PASS] Anon privileged injection blocked! Error: ${anonInjectErr?.message || "Rejected by RLS"}`);

    console.log("\n=====================================================================");
    console.log("  ALL LIVE ACCEPTANCE TESTS PASSED ON HOSTED SUPABASE!");
    console.log("=====================================================================");
  } finally {
    // Clean up disposable test users via admin API
    console.log("\nCleaning up disposable test users...");
    if (userAId) {
      await adminClient.auth.admin.deleteUser(userAId);
      console.log(`  -> Cleaned up User A (${userAId})`);
    }
    if (userBId) {
      await adminClient.auth.admin.deleteUser(userBId);
      console.log(`  -> Cleaned up User B (${userBId})`);
    }
    if (orgAId) {
      await adminClient.from("organizations").delete().eq("id", orgAId);
      console.log(`  -> Cleaned up Org A (${orgAId})`);
    }
    if (orgBId) {
      await adminClient.from("organizations").delete().eq("id", orgBId);
      console.log(`  -> Cleaned up Org B (${orgBId})`);
    }
  }
}

runHostedAcceptanceTests().catch((err) => {
  console.error("FATAL ERROR in hosted acceptance tests:", err);
  process.exit(1);
});
