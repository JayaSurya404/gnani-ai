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

export async function checkTestLead(phone = '+919840911223') {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .or(`phone.eq.${phone},phone.eq.9840911223`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leads:', error);
    return null;
  }

  return leads;
}

export async function checkCallSessions(leadId) {
  const { data: calls, error } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('lead_id', leadId);

  if (error) {
    console.error('Error fetching call sessions:', error);
    return null;
  }
  return calls;
}

export async function cleanUpLead(leadId) {
  if (!leadId) return { success: false, reason: 'No leadId provided' };

  // 1. Delete any call sessions if any exist
  await supabase.from('call_sessions').delete().eq('lead_id', leadId);

  // 2. Delete the lead
  const { error: delError } = await supabase.from('leads').delete().eq('id', leadId);
  if (delError) {
    return { success: false, error: delError };
  }

  return { success: true };
}

// If executed directly from command line
if (process.argv[1].endsWith('verify_customer_journey.mjs')) {
  const mode = process.argv[2] || 'inspect';

  if (mode === 'inspect') {
    const leads = await checkTestLead();
    console.log(JSON.stringify({ foundCount: leads?.length || 0, leads }, null, 2));
  } else if (mode === 'cleanup') {
    const leads = await checkTestLead();
    if (!leads || leads.length === 0) {
      console.log('No test leads found to clean up.');
    } else {
      for (const lead of leads) {
        console.log(`Cleaning up test lead ${lead.id} (${lead.name})...`);
        const res = await cleanUpLead(lead.id);
        console.log(`Cleanup result for ${lead.id}:`, res);
      }
    }
  }
}

