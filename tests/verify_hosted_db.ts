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

const EXPECTED_TABLES = [
  "profiles",
  "organizations",
  "organization_members",
  "businesses",
  "business_pages",
  "products",
  "services",
  "campaigns",
  "tracking_links",
  "leads",
  "lead_events",
  "lead_intelligence",
  "lead_recovery_records",
  "voice_agents",
  "agent_versions",
  "agent_knowledge_sources",
  "voice_profiles",
  "voice_profile_consents",
  "call_sessions",
  "call_events",
  "transcript_segments",
  "call_outcomes",
  "follow_up_tasks",
  "automations",
  "integration_connections",
  "audit_logs",
];

async function verifyHostedDatabase() {
  console.log("=== Phase 3 Database Verification on Hosted Supabase ===");
  console.log("Target Project URL:", url ? new URL(url).hostname : "MISSING");
  
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  console.log("\n--- 1. Table Verification across all 26 Domain Tables (via Admin Client) ---");
  let verifiedCount = 0;
  const missingTables: string[] = [];

  for (const table of EXPECTED_TABLES) {
    const { data, error } = await adminClient.from(table).select("*").limit(1);
    if (!error) {
      verifiedCount++;
      console.log(`  [OK] public.${table} exists (rows: ${data?.length ?? 0})`);
    } else {
      missingTables.push(table);
      console.log(`  [FAIL] public.${table} error: ${error.code} - ${error.message}`);
    }
  }

  console.log(`\nTable Verification Summary: ${verifiedCount}/${EXPECTED_TABLES.length} tables verified.`);
  if (missingTables.length > 0) {
    console.error("Missing tables:", missingTables);
  }

  console.log("\n--- 2. Public Catalog Read Access for Anon Role ---");
  const { data: pubPages, error: pubPagesErr } = await anonClient.from("business_pages").select("id, slug, title, published");
  console.log("Anon select on business_pages:", !pubPagesErr ? `SUCCESS (${pubPages?.length ?? 0} rows)` : `FAIL: ${pubPagesErr.message}`);

  const { data: pubLeads, error: pubLeadsErr } = await anonClient.from("leads").select("*");
  console.log("Anon select on leads (Must be denied/empty):", pubLeadsErr ? `PROTECTED (Error: ${pubLeadsErr.message})` : `LEAK? Rows: ${pubLeads?.length}`);

  const { data: pubCalls, error: pubCallsErr } = await anonClient.from("call_sessions").select("*");
  console.log("Anon select on call_sessions (Must be denied/empty):", pubCallsErr ? `PROTECTED (Error: ${pubCallsErr.message})` : `LEAK? Rows: ${pubCalls?.length}`);
}

verifyHostedDatabase().catch((e) => console.error("Verification failed with exception:", e));

