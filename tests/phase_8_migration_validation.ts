import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

async function testMigrations() {
  console.log("=========================================================================");
  console.log("VOICENEXUS AI — MILESTONE 8 MIGRATION VALIDATION SUITE (PGlite v18.6)");
  console.log("=========================================================================\n");

  const db = new PGlite();

  // Provision mock auth and roles
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;

    CREATE OR REPLACE FUNCTION auth.uid() 
    RETURNS UUID AS $$ 
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID; 
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() 
    RETURNS TEXT AS $$ 
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated'); 
    $$ LANGUAGE sql STABLE;
  `);

  const files = [
    "20261110000001_canonical_schema.sql",
    "20261110000002_security_rls.sql",
    "20261110000003_seed_data.sql",
    "20261111000001_milestone_7_intelligence.sql",
    "20261113000001_milestone_8_telephony_whatsapp.sql"
  ];

  for (const f of files) {
    const filePath = path.join(process.cwd(), "supabase", "migrations", f);
    let sql = fs.readFileSync(filePath, "utf8");
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, "-- uuid");
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "-- pgcrypto");
    await db.exec(sql);
    console.log(`✓ Applied ${f}`);
  }

  // Verify new call_sessions columns
  const colsRes = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'call_sessions' 
      AND column_name IN ('twilio_call_sid', 'parent_call_sid', 'telephony_provider', 'caller_number', 'callee_number', 'recording_sid', 'recording_duration_seconds', 'transfer_status', 'transfer_target', 'telephony_cost', 'telephony_currency');
  `);
  console.log(`✓ call_sessions telephony columns verified (${colsRes.rows.length} columns)`);
  assert.equal(colsRes.rows.length, 11, "All 11 telephony columns must exist on call_sessions");

  // Verify new notification_dispatches columns
  const notifColsRes = await db.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'notification_dispatches' 
      AND column_name IN ('twilio_message_sid', 'whatsapp_conversation_id', 'delivery_status_details');
  `);
  console.log(`✓ notification_dispatches WhatsApp columns verified (${notifColsRes.rows.length} columns)`);
  assert.equal(notifColsRes.rows.length, 3, "All 3 WhatsApp columns must exist on notification_dispatches");

  // Verify telephony tables
  const tablesRes = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('telephony_phone_numbers', 'telephony_events');
  `);
  console.log(`✓ Telephony tables verified: ${tablesRes.rows.map(r => r.table_name).join(', ')}`);
  assert.equal(tablesRes.rows.length, 2, "Both telephony tables must exist");

  // Verify RLS is enabled
  const rlsRes = await db.query<{ relname: string; relrowsecurity: boolean }>(`
    SELECT relname, relrowsecurity FROM pg_class 
    WHERE relname IN ('telephony_phone_numbers', 'telephony_events');
  `);
  assert.ok(rlsRes.rows.every(r => r.relrowsecurity), "RLS must be enabled on all telephony tables");
  console.log("✓ RLS is enabled on all new tables.");

  console.log("\n=========================================================================");
  console.log("✓ ALL MILESTONE 8 MIGRATIONS PASSED ON REAL POSTGRESQL 18.6!");
  console.log("=========================================================================\n");
}

if (process.argv[1]?.endsWith("phase_8_migration_validation.ts")) {
  testMigrations().catch((err) => {
    console.error("Migration validation failed:", err);
    process.exit(1);
  });
}
