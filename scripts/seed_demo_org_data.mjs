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

const DEMO_ORG_ID = '206a4ebf-df6a-45e1-b22e-cf1068d6fdba';
const DEMO_BIZ_ID = 'dc05b471-95ae-4fd8-9949-a0e94ea2d43e';

async function seedDemoData() {
  console.log('--- Seeding Demo Organization Data ---');

  // 1. Update business
  const { error: bErr } = await supabase.from('businesses').update({
    name: 'VoiceNexus Business Solutions',
    legal_name: 'VoiceNexus Technologies Private Limited',
    tagline: 'AI-Powered Multilingual Voice & Inbound Lead Intelligence',
    description: 'Transforming inbound website visitors into booked customer meetings in seconds. Built for Indian businesses with native Tamil, Hindi, and English voice agents.',
    phone: '+91 6382868845',
    email: 'demo@voicenexus.ai',
    website: 'https://voicenexus.ai',
    address_line1: 'Avinashi Road, Peelamedu',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641004',
    country: 'India',
    business_hours: {
      timezone: 'Asia/Kolkata',
      instagram: 'https://www.instagram.com/_jaya__surya__/',
      contactPhone: '+91 6382868845',
      monday_friday: '09:00 - 18:30 IST',
      saturday: '09:30 - 14:00 IST'
    }
  }).eq('id', DEMO_BIZ_ID);

  if (bErr) throw bErr;
  console.log('[✓] Demo business updated');

  // 2. Upsert business page
  const { data: existingPage } = await supabase.from('business_pages').select('id').eq('slug', 'voicenexus-demo').maybeSingle();
  if (existingPage) {
    await supabase.from('business_pages').update({
      business_id: DEMO_BIZ_ID,
      title: 'VoiceNexus AI — Verified Indian Business Consultation Portal',
      hero_headline: 'Instant AI Voice Callbacks for High-Intent Inquiries',
      hero_subheadline: 'Experience human-like Tamil and English voice interactions, verified lead scoring, and automated CRM synchronization.',
      published: true,
      theme_config: {
        contactPhone: '+91 6382868845',
        instagram: 'https://www.instagram.com/_jaya__surya__/',
        themePreset: 'warm-ivory',
        primaryColor: '#F97316'
      }
    }).eq('id', existingPage.id);
    console.log('[✓] Demo business page updated:', existingPage.id);
  } else {
    const { data: newPage, error: npErr } = await supabase.from('business_pages').insert({
      business_id: DEMO_BIZ_ID,
      slug: 'voicenexus-demo',
      title: 'VoiceNexus AI — Verified Indian Business Consultation Portal',
      meta_description: 'Experience VoiceNexus AI voice intelligence live. Instant callbacks, lead attribution, and CRM sync.',
      hero_headline: 'Instant AI Voice Callbacks for High-Intent Inquiries',
      hero_subheadline: 'Experience human-like Tamil and English voice interactions, verified lead scoring, and automated CRM synchronization.',
      published: true,
      theme_config: {
        contactPhone: '+91 6382868845',
        instagram: 'https://www.instagram.com/_jaya__surya__/',
        themePreset: 'warm-ivory',
        primaryColor: '#F97316'
      }
    }).select().single();
    if (npErr) throw npErr;
    console.log('[✓] Demo business page created:', newPage.id);
  }

  // 3. Upsert demo products
  const demoProducts = [
    {
      business_id: DEMO_BIZ_ID,
      name: '5kW Commercial Rooftop Solar Array',
      sku: 'VN-SOLAR-5KW',
      description: 'High-efficiency monocrystalline PERC panels for retail stores, clinics, and bank branches. Estimated monthly generation: 650 units.',
      price_amount: 285000,
      price_display: '₹2,85,000 Turnkey',
      currency: 'INR',
      category: 'Commercial',
      is_active: true
    },
    {
      business_id: DEMO_BIZ_ID,
      name: '25kW Industrial Power Pack',
      sku: 'VN-SOLAR-25KW',
      description: 'Engineered for small-scale factories, cold stores, and workshops with 415V three-phase grid-tie inverters and surge suppression.',
      price_amount: 1180000,
      price_display: '₹11,80,000 Installed',
      currency: 'INR',
      category: 'Industrial',
      is_active: true
    },
    {
      business_id: DEMO_BIZ_ID,
      name: 'Energy Audit & MNRE Subsidy Advisory',
      sku: 'VN-SOLAR-AUDIT',
      description: 'Comprehensive electrical site survey, shadow analysis, structure load assessment, and PM Surya Ghar portal submission.',
      price_amount: 15000,
      price_display: '₹15,000 per Site',
      currency: 'INR',
      category: 'Services',
      is_active: true
    }
  ];

  for (const prod of demoProducts) {
    const { data: existing } = await supabase.from('products').select('id').eq('sku', prod.sku).maybeSingle();
    if (existing) {
      await supabase.from('products').update(prod).eq('id', existing.id);
    } else {
      await supabase.from('products').insert(prod);
    }
  }
  console.log('[✓] Demo products upserted');

  // 4. Delete existing demo leads (if any) to avoid duplication
  const { data: oldDemoLeads } = await supabase.from('leads').select('id').eq('organization_id', DEMO_ORG_ID);
  if (oldDemoLeads && oldDemoLeads.length > 0) {
    const leadIds = oldDemoLeads.map(l => l.id);
    await supabase.from('lead_events').delete().in('lead_id', leadIds);
    await supabase.from('leads').delete().in('id', leadIds);
    console.log(`[✓] Cleaned up ${leadIds.length} existing demo leads`);
  }

  // 5. Seed 12 Indian Sample Leads
  const indianLeads = [
    {
      name: 'Karthik Subramanian',
      phone: '+919840100001',
      email: 'karthik.subramanian@texmill.co.in',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 94,
      source: 'Google Ads (coimbatore-industrial-solar)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Coimbatore',
      summary: 'Managing Director of a weaving mill in Peelamedu consuming 4,200 units/month. Wants immediate 25kW rooftop quote to offset peak tariff.',
      notes: 'Requested a Tamil-speaking consultant. Has 3,500 sq ft flat RCC roof with unshaded south exposure.',
      events: [
        { type: 'PAGE_VIEW', title: 'Visited Solar Consultation Portal', desc: 'Landed from Google Ads campaign "coimbatore-industrial-solar" via mobile device.' },
        { type: 'FORM_SUBMIT', title: 'Submitted Commercial Solar Enquiry', desc: 'Specified 4,200 units monthly electricity bill (₹36,000/mo) and 25kW capacity requirement.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 94/100 (HOT)', desc: 'High ROI motivation, available roof area, budget allocated for current financial year.' }
      ]
    },
    {
      name: 'Priya Raman',
      phone: '+919840100002',
      email: 'priya.raman@careclinic.org',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 88,
      source: 'Public Page Inbound',
      primary_interest: '5kW Commercial Rooftop Solar Array',
      city: 'Chennai',
      summary: 'Director of Dr. Raman Multi-Speciality Clinic in Anna Nagar. Power backup needed for diagnostic refrigeration.',
      notes: 'Interested in hybrid inverter with lithium battery storage for zero downtime during grid cuts.',
      events: [
        { type: 'PAGE_VIEW', title: 'Reviewed Product Catalog', desc: 'Spent 4m 12s reviewing 5kW Commercial System specs and inverter warranties.' },
        { type: 'FORM_SUBMIT', title: 'Web Callback Requested', desc: 'Requested callback after 4:00 PM IST. Noted requirement for battery storage.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 88/100 (HOT)', desc: 'Healthcare sector customer with mission-critical power needs and immediate procurement intent.' }
      ]
    },
    {
      name: 'Arjun Nair',
      phone: '+919840100003',
      email: 'arjun.nair@techpark.in',
      temperature: 'HOT',
      status: 'NEW',
      score: 91,
      source: 'LinkedIn Sponsored (green-campus-init)',
      primary_interest: '50kW Industrial High-Yield Array',
      city: 'Bengaluru',
      summary: 'Facilities VP at Whitefield Tech Hub. Evaluating solar canopy for 40-car parking area to achieve ESG rating.',
      notes: 'Requires bifacial glass-to-glass panels with cloud SCADA integration.',
      events: [
        { type: 'PAGE_VIEW', title: 'Downloaded ESG Solar Whitepaper', desc: 'Visitor from Bengaluru IP reviewed corporate solar case studies.' },
        { type: 'FORM_SUBMIT', title: 'High-Capacity RFP Submitted', desc: 'Attached tentative single-line diagram and transformer capacity (500 kVA).' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 91/100 (HOT)', desc: 'Large ticket commercial opportunity. Board approval already sanctioned.' }
      ]
    },
    {
      name: 'Divya Srinivasan',
      phone: '+919840100004',
      email: 'divya@srinivasanschools.edu.in',
      temperature: 'WARM',
      status: 'CONTACTED',
      score: 76,
      source: 'Referral (Alumni Network)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Madurai',
      summary: 'Trustee at CBSE Higher Secondary School campus. Looking to power computer labs and smart classrooms from solar.',
      notes: 'Prefers installations during summer vacation in May. Needs safety compliance certificates for educational institution.',
      events: [
        { type: 'FORM_SUBMIT', title: 'Direct Referral Submission', desc: 'Referred by alumni member. Inquired about net metering with TANGEDCO.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 76/100 (WARM)', desc: 'High trust referral with clear timeline tied to school academic calendar.' }
      ]
    },
    {
      name: 'Rahul Menon',
      phone: '+919840100005',
      email: 'rahul.menon@cochincoldchain.com',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 85,
      source: 'Google Search (kerala-cold-storage-solar)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Kochi',
      summary: 'Proprietor of marine exports refrigeration warehouse in Willingdon Island. High continuous daytime baseline load.',
      notes: 'Coastal area requires C5-M marine corrosion-resistant mounting structure and IP66 inverters.',
      events: [
        { type: 'PAGE_VIEW', title: 'Explored Industrial Specs', desc: 'Reviewed anti-corrosion galvanized structures and salt-mist test certifications.' },
        { type: 'FORM_SUBMIT', title: 'Inbound Engineering Request', desc: 'Submitted transformer capacity and requested onsite feasibility inspection.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 85/100 (HOT)', desc: 'High daytime energy consumption makes solar ROI exceptionally fast (sub-3 years).' }
      ]
    },
    {
      name: 'Meera Krishnan',
      phone: '+919840100006',
      email: 'meera.k@salemsilks.com',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 92,
      source: 'Instagram Ad (solar-for-msme)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Salem',
      summary: 'Second-generation founder of powerloom textile unit. Electricity bill currently ₹48,000/mo.',
      notes: 'Tamil voice consultation conducted. Client is comparing 2 competing EPC quotes. Follow-up meeting scheduled.',
      events: [
        { type: 'PAGE_VIEW', title: 'Watched Instagram Video Ad', desc: 'Clicked through from Instagram Reel showcasing 25kW textile installation in Tiruppur.' },
        { type: 'FORM_SUBMIT', title: 'Lead Form Completed', desc: 'Confirmed ownership of 4,000 sq ft tin shed roof.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 92/100 (HOT)', desc: 'Direct owner decision maker with proven cash flow and accelerated depreciation tax incentive interest.' }
      ]
    },
    {
      name: 'Sanjay Patel',
      phone: '+919840100007',
      email: 'sanjay.patel@gujaratchemicals.net',
      temperature: 'WARM',
      status: 'QUALIFIED',
      score: 79,
      source: 'B2B Trade Directory',
      primary_interest: 'Energy Audit & MNRE Subsidy Advisory',
      city: 'Ahmedabad',
      summary: 'Plant Manager at Vatva GIDC specialty chemical plant. Seeking rooftop audit before green audit inspection.',
      notes: 'Requires hazardous area classification certification for electrical switchgear.',
      events: [
        { type: 'FORM_SUBMIT', title: 'Trade Directory Inbound', desc: 'Submitted chemical plant site layout and requested technical feasibility visit.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 79/100 (WARM)', desc: 'Compliance-driven purchase with established corporate audit timeline.' }
      ]
    },
    {
      name: 'Ananya Reddy',
      phone: '+919840100008',
      email: 'ananya.reddy@hitechrealty.com',
      temperature: 'WARM',
      status: 'NEW',
      score: 72,
      source: 'Website Chat Widget',
      primary_interest: '5kW Commercial Rooftop Solar Array',
      city: 'Hyderabad',
      summary: 'Boutique hotel partner in Gachibowli. Considering solar water heating plus 5kW PV for lighting circuit.',
      notes: 'Wants aesthetic black-frame panels that blend seamlessly with modern facade architecture.',
      events: [
        { type: 'PAGE_VIEW', title: 'Visited Public Page via Mobile', desc: 'Scrolled through public business page gallery and customer reviews.' },
        { type: 'FORM_SUBMIT', title: 'Instant Consultation Form', desc: 'Requested evening telephone consultation in English.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 72/100 (WARM)', desc: 'Hospitality aesthetic requirements require premium panel finishes.' }
      ]
    },
    {
      name: 'Vikram Shah',
      phone: '+919840100009',
      email: 'vikram.shah@mumbailogistics.in',
      temperature: 'COLD',
      status: 'LOST',
      score: 38,
      source: 'Cold Outreach Inbound',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Mumbai',
      summary: 'Bhiwandi warehouse leaseholder. Landlord approval for roof drilling is uncertain.',
      notes: 'Lease expiring in 14 months. Advised to re-engage after warehouse lease renewal is executed.',
      events: [
        { type: 'FORM_SUBMIT', title: 'Initial Query Submitted', desc: 'Inquired about non-penetrating ballast mounting structures.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 38/100 (COLD)', desc: 'Lease tenure restriction poses high feasibility hurdle. Marked for re-engagement.' }
      ]
    },
    {
      name: 'Nila Selvan',
      phone: '+919840100010',
      email: 'nila.selvan@trichyresidence.in',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 89,
      source: 'Public Page Inbound',
      primary_interest: '3kW Residential Surya Package',
      city: 'Tiruchirappalli',
      summary: 'Independent villa owner in KK Nagar. Looking for PM Surya Ghar subsidy application assistance.',
      notes: 'Eligible for ₹78,000 central subsidy. TNEB consumer number and Aadhaar linked bank account ready.',
      events: [
        { type: 'PAGE_VIEW', title: 'Checked PM Surya Ghar Calculator', desc: 'Calculated subsidy savings and payback period (2.4 years).' },
        { type: 'FORM_SUBMIT', title: 'Residential Subsidy Application Form', desc: 'Submitted TNEB electricity consumer card details.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 89/100 (HOT)', desc: 'Immediate residential buyer with complete subsidy documentation.' }
      ]
    },
    {
      name: 'Farhan Ahmed',
      phone: '+919840100011',
      email: 'farhan@tiruppurgarments.com',
      temperature: 'WARM',
      status: 'CONTACTED',
      score: 68,
      source: 'Local Trade Expo (Tiruppur KNIT-TECH)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Tiruppur',
      summary: 'Partner at export garment embroidery unit. Inquiring about peak hour power factor improvement with solar.',
      notes: 'Met at KNIT-TECH stall. Shared digital brochure via WhatsApp.',
      events: [
        { type: 'FORM_SUBMIT', title: 'Expo Lead Card Captured', desc: 'Scanned digital business card at VoiceNexus trade booth.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 68/100 (WARM)', desc: 'Owner shows genuine interest; waiting on second partner review.' }
      ]
    },
    {
      name: 'Lakshmi Narayanan',
      phone: '+919840100012',
      email: 'lakshmi.narayanan@cauverymills.in',
      temperature: 'HOT',
      status: 'QUALIFIED',
      score: 87,
      source: 'Google Ads (delta-rice-mill-solar)',
      primary_interest: '25kW Industrial Power Pack',
      city: 'Thanjavur',
      summary: 'Managing Partner of modernized paddy processing mill. Needs daytime captive power during harvesting season.',
      notes: 'Desires Tamil language voice updates. High diesel generator fuel consumption makes solar urgent.',
      events: [
        { type: 'PAGE_VIEW', title: 'Landed on Agro-Solar Solutions Page', desc: 'Viewed case studies of rice mill diesel offset savings.' },
        { type: 'FORM_SUBMIT', title: 'Agricultural Mill Consultation Form', desc: 'Provided 63 kVA sanctioned demand and daytime run hours.' },
        { type: 'AI_ANALYSIS_COMPLETED', title: 'AI Intent Scored: 87/100 (HOT)', desc: 'High diesel replacement value yields under 2.8 year capital amortization.' }
      ]
    }
  ];

  for (const lead of indianLeads) {
    const { data: createdLead, error: lErr } = await supabase.from('leads').insert({
      organization_id: DEMO_ORG_ID,
      business_id: DEMO_BIZ_ID,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      temperature: lead.temperature,
      status: lead.status,
      score: lead.score,
      source: lead.source,
      primary_interest: lead.primary_interest,
      location: lead.city,
      summary: lead.summary,
      notes: lead.notes,
      do_not_call: false,
      last_activity_at: new Date().toISOString()
    }).select().single();

    if (lErr) {
      console.error(`Error inserting lead ${lead.name}:`, lErr);
      continue;
    }

    // Insert events for this lead
    const eventsToInsert = lead.events.map((ev, idx) => ({
      lead_id: createdLead.id,
      organization_id: DEMO_ORG_ID,
      event_type: ev.type,
      title: ev.title,
      description: ev.desc,
      metadata: {
        city: lead.city,
        score: lead.score,
        primaryInterest: lead.primary_interest,
        isDemoLead: true
      },
      created_at: new Date(Date.now() - (lead.events.length - idx) * 3600000).toISOString()
    }));

    const { error: evErr } = await supabase.from('lead_events').insert(eventsToInsert);
    if (evErr) console.error(`Error inserting events for ${lead.name}:`, evErr);
  }

  console.log(`[✓] Successfully seeded 12 Indian Sample Leads with rich timelines for Demo Organization!`);
}

seedDemoData().catch(err => {
  console.error('Seed demo data failed:', err);
  process.exit(1);
});
