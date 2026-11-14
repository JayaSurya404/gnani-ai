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

async function seed() {
  console.log('--- Seeding Aadhira Solar Tech into Database ---');

  // 1. Get first organization
  const { data: org, error: orgErr } = await supabase.from('organizations').select('id, name').limit(1).single();
  if (orgErr || !org) throw new Error('No organization found');
  console.log('Target Organization:', org.id, org.name);

  // 2. Update business
  const { data: biz, error: bizErr } = await supabase.from('businesses').select('id').eq('organization_id', org.id).limit(1).single();
  if (bizErr || !biz) throw new Error('No business found');

  await supabase.from('businesses').update({
    name: 'Aadhira Solar Tech',
    legal_name: 'Aadhira Clean Energy Private Limited',
    tagline: 'Premier Rooftop Solar EPC & Captive Power Solutions',
    description: 'Over 12MW of commissioned industrial, commercial, and residential rooftop capacity across Tamil Nadu, Karnataka, and Telangana. MNRE-approved EPC with turnkey net metering approvals.',
    phone: '+91 98401 23456',
    email: 'consult@aadhirasolar.in',
    website: 'https://aadhirasolar.in',
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
  }).eq('id', biz.id);
  console.log('[✓] Business updated:', biz.id, 'Aadhira Solar Tech');

  // 3. Upsert business_pages
  const { data: existingPage } = await supabase.from('business_pages').select('id').eq('slug', 'aadhira-solar').maybeSingle();
  if (existingPage) {
    await supabase.from('business_pages').update({
      business_id: biz.id,
      title: 'Aadhira Solar Tech — Verified Solar Consultation Portal',
      hero_headline: 'Slash Your Electricity Bills by up to 85% with High-Yield Solar',
      hero_subheadline: 'Tier-1 bifacial panels, 25-year performance warranty, direct PM Surya Ghar subsidy assistance, and rapid 7-day commissioning.',
      published: true,
      theme_config: {
        whatsapp: '+919840123456',
        instagram: 'https://instagram.com/aadhirasolar',
        facebook: 'https://facebook.com/aadhirasolar',
        linkedin: 'https://linkedin.com/company/aadhirasolar',
      },
    }).eq('id', existingPage.id);
    console.log('[✓] Business page updated:', existingPage.id);
  } else {
    const { data: newPage, error: pErr } = await supabase.from('business_pages').insert({
      business_id: biz.id,
      slug: 'aadhira-solar',
      title: 'Aadhira Solar Tech — Verified Solar Consultation Portal',
      meta_description: 'Official verified public portal for Aadhira Solar Tech. Instant consultation and transparent turnkey rooftop solar quotations.',
      hero_headline: 'Slash Your Electricity Bills by up to 85% with High-Yield Solar',
      hero_subheadline: 'Tier-1 bifacial panels, 25-year performance warranty, direct PM Surya Ghar subsidy assistance, and rapid 7-day commissioning.',
      published: true,
      theme_config: {
        whatsapp: '+919840123456',
        instagram: 'https://instagram.com/aadhirasolar',
        facebook: 'https://facebook.com/aadhirasolar',
        linkedin: 'https://linkedin.com/company/aadhirasolar',
      },
    }).select().single();
    if (pErr) throw pErr;
    console.log('[✓] Business page created:', newPage.id);
  }

  // 4. Upsert products
  const products = [
    {
      business_id: biz.id,
      name: '3kW Residential Surya Package',
      sku: 'RES-3KW-MNRE',
      description: 'Ideal for 2-3 BHK homes consuming 300-450 units/month. Includes PM Surya Ghar subsidy guidance up to ₹78,000.',
      price_amount: 195000,
      price_display: '₹1,95,000 (Before Subsidy)',
      currency: 'INR',
      category: 'Residential',
      is_active: true,
    },
    {
      business_id: biz.id,
      name: '10kW Commercial Rooftop System',
      sku: 'COM-10KW-POLY',
      description: 'Engineered for commercial offices, clinics, and educational institutions. Estimated annual electricity savings: ₹1,80,000.',
      price_amount: 540000,
      price_display: '₹5,40,000 Turnkey',
      currency: 'INR',
      category: 'Commercial',
      is_active: true,
    },
    {
      business_id: biz.id,
      name: '50kW Industrial High-Yield Array',
      sku: 'IND-50KW-BIFACIAL',
      description: 'Bifacial glass-to-glass monocrystalline panels with string inverter, SCADA cloud monitoring, and 5-year comprehensive AMC.',
      price_amount: 2450000,
      price_display: '₹24,50,000 Installed',
      currency: 'INR',
      category: 'Industrial',
      is_active: true,
    },
  ];

  for (const prod of products) {
    const { data: existing } = await supabase.from('products').select('id').eq('sku', prod.sku).maybeSingle();
    if (existing) {
      await supabase.from('products').update(prod).eq('id', existing.id);
      console.log('[✓] Product updated:', prod.sku);
    } else {
      await supabase.from('products').insert(prod);
      console.log('[✓] Product created:', prod.sku);
    }
  }

  console.log('--- Seeding Complete Successfully ---');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

