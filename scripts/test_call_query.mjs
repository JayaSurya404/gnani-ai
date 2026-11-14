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
        process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}
loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testQuery() {
  const { data: calls, error } = await supabase
    .from('call_sessions')
    .select(`
      id,
      direction,
      channel,
      status,
      start_time,
      end_time,
      duration_seconds,
      recording_url,
      created_at,
      call_outcomes (
        disposition,
        sentiment,
        confidence_score,
        summary,
        key_points,
        action_items,
        qualification_decision,
        follow_up_recommended
      ),
      transcript_segments (
        id,
        speaker,
        language,
        text,
        confidence,
        start_offset_ms
      )
    `)
    .eq('lead_id', '52b4a6fc-a03e-4932-a94e-2266c6fdfb18');

  console.log('Result:', { callsCount: calls?.length, error: error?.message });
  if (calls && calls.length > 0) {
    console.log('Call details:', JSON.stringify(calls[0], null, 2));
  }
}

testQuery().catch(console.error);
