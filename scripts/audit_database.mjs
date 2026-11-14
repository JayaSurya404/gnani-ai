import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv() {
  if (fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function runAudit() {
  console.log('=== SUPABASE DATABASE AUDIT ===');
  console.log('Target URL:', supabaseUrl);

  const tables = [
    'organizations',
    'memberships',
    'businesses',
    'business_pages',
    'products',
    'leads',
    'campaign_attributions',
    'visitor_events',
    'call_sessions',
    'call_events',
    'call_outcomes',
    'transcript_segments',
    'lead_intelligence',
    'follow_up_tasks',
    'lead_events'
  ];

  console.log('\n--- TABLE ROW COUNTS & EXISTENCE ---');
  const tableStatus = {};
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      tableStatus[table] = { status: 'MISSING/ERROR', error: error.message };
      console.log(`[x] ${table}: ERROR - ${error.message}`);
    } else {
      tableStatus[table] = { status: 'EXISTS', count };
      console.log(`[✓] ${table}: ${count} rows`);
    }
  }

  console.log('\n--- VERIFY FOREIGN KEYS & ORPHAN CHECKS ---');
  // Check orphan businesses (no valid organization)
  const { data: businesses } = await supabase.from('businesses').select('id, organization_id, name');
  const { data: orgs } = await supabase.from('organizations').select('id, name');
  const orgIds = new Set((orgs || []).map(o => o.id));

  const orphanBusinesses = (businesses || []).filter(b => !orgIds.has(b.organization_id));
  console.log(`Total Organizations: ${orgs?.length || 0}`);
  console.log(`Total Businesses: ${businesses?.length || 0}`);
  console.log(`Orphan Businesses (missing org): ${orphanBusinesses.length}`);

  // Check orphan leads (missing org or business)
  const { data: leads } = await supabase.from('leads').select('id, organization_id, business_id, email, phone, full_name');
  const businessIds = new Set((businesses || []).map(b => b.id));
  const orphanLeadsOrg = (leads || []).filter(l => !orgIds.has(l.organization_id));
  const orphanLeadsBiz = (leads || []).filter(l => !businessIds.has(l.business_id));
  console.log(`Total Leads: ${leads?.length || 0}`);
  console.log(`Orphan Leads (invalid org_id): ${orphanLeadsOrg.length}`);
  console.log(`Orphan Leads (invalid business_id): ${orphanLeadsBiz.length}`);

  // Check duplicate leads within same organization vs across organizations
  const phoneMapByOrg = new Map();
  let dupesWithinOrg = 0;
  let sharedAcrossOrgs = 0;
  const phoneToOrgs = new Map();

  for (const l of (leads || [])) {
    if (!l.phone) continue;
    const orgKey = `${l.organization_id}:${l.phone}`;
    if (phoneMapByOrg.has(orgKey)) {
      dupesWithinOrg++;
    } else {
      phoneMapByOrg.set(orgKey, l.id);
    }

    if (!phoneToOrgs.has(l.phone)) {
      phoneToOrgs.set(l.phone, new Set());
    }
    phoneToOrgs.get(l.phone).add(l.organization_id);
  }

  for (const orgSet of phoneToOrgs.values()) {
    if (orgSet.size > 1) {
      sharedAcrossOrgs++;
    }
  }

  console.log(`Duplicate phone leads within same org: ${dupesWithinOrg}`);
  console.log(`Phones existing across multiple distinct orgs (multi-tenant): ${sharedAcrossOrgs}`);

  // Check products table structure & FKs
  const { data: prods, error: pErr } = await supabase.from('products').select('*').limit(3);
  console.log('\n--- SAMPLE PRODUCT STRUCTURE ---');
  if (prods && prods.length > 0) {
    console.log('Product columns:', Object.keys(prods[0]).join(', '));
    console.log('Sample product:', JSON.stringify(prods[0], null, 2));
  } else {
    console.log('No products found or error:', pErr?.message);
  }

  // Check leads table columns
  const { data: sampleLeads } = await supabase.from('leads').select('*').limit(1);
  console.log('\n--- SAMPLE LEAD STRUCTURE ---');
  if (sampleLeads && sampleLeads.length > 0) {
    console.log('Lead columns:', Object.keys(sampleLeads[0]).join(', '));
  }

  // Check campaign_attributions & visitor_events
  const { data: sampleAttr } = await supabase.from('campaign_attributions').select('*').limit(1);
  console.log('\n--- CAMPAIGN ATTRIBUTION STRUCTURE ---');
  if (sampleAttr && sampleAttr.length > 0) {
    console.log('Attribution columns:', Object.keys(sampleAttr[0]).join(', '));
  } else {
    console.log('No attribution rows found.');
  }

  // Check call_sessions & call_outcomes
  const { data: sampleCall } = await supabase.from('call_sessions').select('*').limit(1);
  console.log('\n--- CALL SESSION STRUCTURE ---');
  if (sampleCall && sampleCall.length > 0) {
    console.log('Call session columns:', Object.keys(sampleCall[0]).join(', '));
  }

  console.log('\n=== AUDIT COMPLETE ===');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
