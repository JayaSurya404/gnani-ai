-- =====================================================================
-- VoiceNexus AI — Migration 003: Synthetic Development Seed Data
-- Platform: Supabase PostgreSQL 15+
-- Domain: Aadhira Solar Tech Demo Environment (Strictly Synthetic)
-- =====================================================================

DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_biz_id UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;
  v_camp_id UUID := 'c0000000-0000-0000-0000-000000000001'::UUID;
  v_agent_id UUID := 'd0000000-0000-0000-0000-000000000001'::UUID;
  v_ver_id UUID := 'e0000000-0000-0000-0000-000000000001'::UUID;
  v_lead1_id UUID := 'f0000000-0000-0000-0000-000000000001'::UUID;
  v_lead2_id UUID := 'f0000000-0000-0000-0000-000000000002'::UUID;
  v_lead3_id UUID := 'f0000000-0000-0000-0000-000000000003'::UUID;
  v_call1_id UUID := '90000000-0000-0000-0000-000000000001'::UUID;
BEGIN

  -- 1. Create Organization
  INSERT INTO public.organizations (id, name, slug, plan, logo_url, is_active)
  VALUES (
    v_org_id,
    'Aadhira Solar Tech',
    'aadhira-solar',
    'ENTERPRISE',
    NULL,
    TRUE
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Create Business Profile
  INSERT INTO public.businesses (
    id, organization_id, name, legal_name, tagline, description,
    phone, email, website, city, state, pincode, country
  ) VALUES (
    v_biz_id,
    v_org_id,
    'Aadhira Solar Tech',
    'Aadhira Renewable Solutions Private Limited',
    'Clean Solar Power for Homes and Commercial Rooftops across Tamil Nadu',
    'MNRE-approved channel partner providing turnkey rooftop solar EPC installations, PM Surya Ghar subsidy assistance, and net-metering commissioning.',
    '+91 422 245 8900',
    'contact@aadhirasolar.com',
    'https://aadhirasolar.com',
    'Coimbatore',
    'Tamil Nadu',
    '641001',
    'India'
  ) ON CONFLICT (id) DO NOTHING;

  -- 3. Business Page
  INSERT INTO public.business_pages (
    business_id, slug, title, meta_description, hero_headline, hero_subheadline, published, theme_config
  ) VALUES (
    v_biz_id,
    'aadhira-solar',
    'Aadhira Solar Tech — Clean Energy for Tamil Nadu',
    'Calculate your PM Surya Ghar subsidy and book an instant site survey.',
    'Switch to Solar and Cut Electricity Bills by up to 90%',
    'MNRE-approved rooftop installations with up to ₹78,000 direct central government subsidy.',
    TRUE,
    '{"accentColor":"#6366F1","darkTheme":true}'::jsonb
  ) ON CONFLICT (slug) DO NOTHING;

  -- 4. Products & Services
  INSERT INTO public.products (business_id, name, sku, description, category, price_amount, price_display, is_active)
  VALUES
    (v_biz_id, '3kW Residential Solar Inverter System', 'AST-RES-3KW', 'Mono PERC panels suitable for 2-3 BHK homes. Monthly generation ~360-400 units.', 'Residential', 195000.00, '₹1,85,000 – ₹2,10,000', TRUE),
    (v_biz_id, '5kW Hybrid Rooftop Solar System', 'AST-HYB-5KW', 'High efficiency grid-tied inverter with battery backup provision and bi-directional meter.', 'Residential Hybrid', 310000.00, '₹2,95,000 – ₹3,30,000', TRUE),
    (v_biz_id, 'Commercial & Industrial (10kW – 50kW) EPC', 'AST-COMM-50KW', 'Turnkey solar EPC for schools, factories, and commercial establishments.', 'Commercial EPC', NULL, 'Custom quotation', TRUE)
  ON CONFLICT DO NOTHING;

  -- 5. Campaign
  INSERT INTO public.campaigns (id, organization_id, name, slug, channel, source, budget, clicks_count, leads_count, is_active)
  VALUES
    (v_camp_id, v_org_id, 'Google Ads (Solar 5kW)', 'gads-5kw', 'Google Search', 'google-cpc', 25000.00, 1240, 84, TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- 6. AI Voice Agent
  INSERT INTO public.voice_agents (
    id, organization_id, business_id, name, role_title, language_mode,
    primary_language, status, voice_id, voice_name
  ) VALUES (
    v_agent_id,
    v_org_id,
    v_biz_id,
    'Kavitha — Solar Consultant',
    'Senior Solar Sales & Qualification Specialist',
    'AUTO',
    'en-IN',
    'ACTIVE',
    'gnani-ta-female-1',
    'Kavitha (Tamil / Indian English)'
  ) ON CONFLICT (id) DO NOTHING;

  -- 7. Agent Version
  INSERT INTO public.agent_versions (
    id, agent_id, version_number, system_prompt, greeting_message,
    turn_timeout_ms, max_duration_seconds, tools_enabled, knowledge_context
  ) VALUES (
    v_ver_id,
    v_agent_id,
    'v2.4',
    'You are Kavitha, senior solar advisor at Aadhira Solar Tech in Coimbatore. Speak politely in clear English, Tamil, or Tanglish depending on the customer preference. Explain the PM Surya Ghar subsidy clearly.',
    'Vanakkam! I am Kavitha from Aadhira Solar Tech. I noticed your interest in our 5kW rooftop solar system. Do you have 2 minutes to discuss your potential monthly savings?',
    2500,
    600,
    '["check_subsidy_eligibility", "schedule_site_survey", "escalate_to_human"]'::jsonb,
    'PM Surya Ghar: Up to ₹30,000 for 1kW, ₹60,000 for 2kW, ₹78,000 for 3kW and above. Bi-directional net meters handled directly by Aadhira Solar.'
  ) ON CONFLICT (id) DO NOTHING;

  -- Update agent active version pointer
  UPDATE public.voice_agents SET active_version_id = v_ver_id WHERE id = v_agent_id;

  -- 8. Synthetic Leads
  INSERT INTO public.leads (
    id, organization_id, business_id, campaign_id, name, phone, email,
    temperature, status, score, source, primary_interest, location, summary
  ) VALUES
    (v_lead1_id, v_org_id, v_biz_id, v_camp_id, 'Karthik Subramanian', '+91 98401 23456', 'karthik.subramanian@gmail.com', 'HOT', 'QUALIFIED', 92, 'Google Ads (Solar 5kW)', '5kW Hybrid Rooftop Solar', 'RS Puram, Coimbatore', 'Interested in 5kW rooftop solar for duplex home. Current bi-monthly TNEB bill is ~₹8,400. Inquired about PM Surya Ghar subsidy.'),
    (v_lead2_id, v_org_id, v_biz_id, v_camp_id, 'Deepa Natarajan', '+91 98842 87654', 'deepa.n@aarushitex.com', 'WARM', 'CONTACTED', 68, 'Website Enquiry Form', '3kW Grid-Tied System', 'Peelamedu, Coimbatore', 'Requested quote for residential rooftop. Needs clarification on shadow-free area requirements.'),
    (v_lead3_id, v_org_id, v_biz_id, v_camp_id, 'Suresh Kumar', '+91 94433 11223', 'suresh.k@gmail.com', 'COLD', 'NEW', 38, 'PM Surya Ghar WhatsApp Push', 'Subsidy Information', 'Gandhipuram, Coimbatore', 'Inquired about subsidy timeline. Currently waiting for monsoon season to finish.')
  ON CONFLICT (id) DO NOTHING;

  -- 9. Lead Intelligence
  INSERT INTO public.lead_intelligence (
    lead_id, intent_signals, objections_raised, buying_stage,
    recommended_next_action, qualification_reasons, budget_estimate, urgency_rating
  ) VALUES (
    v_lead1_id,
    '["Mentioned current bi-monthly bill of ₹8,400", "Asked specifically about PM Surya Ghar subsidy timeline", "Confirmed 650 sq ft shadow-free terrace"]'::jsonb,
    '["Wants clarification on battery replacement warranty cycle", "Inquired about monsoon grid stability"]'::jsonb,
    'Evaluation / Ready to Purchase',
    'Schedule technical site survey and roof measurement with Senior Field Engineer',
    '["Owns independent house with RCC roof", "Bi-monthly bill > ₹5,000", "Decision maker is ready for site survey"]'::jsonb,
    '₹3,00,000 – ₹3,50,000',
    'HIGH'
  ) ON CONFLICT (lead_id) DO NOTHING;

  -- 10. Sample Synthetic Call Session & Outcome
  INSERT INTO public.call_sessions (
    id, organization_id, business_id, lead_id, agent_id, agent_version_id,
    direction, channel, customer_phone, customer_name, status,
    start_time, end_time, duration_seconds
  ) VALUES (
    v_call1_id,
    v_org_id,
    v_biz_id,
    v_lead1_id,
    v_agent_id,
    v_ver_id,
    'OUTBOUND',
    'BROWSER_WEBRTC',
    '+91 98401 23456',
    'Karthik Subramanian',
    'COMPLETED',
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '4 hours' + INTERVAL '245 seconds',
    245
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.call_outcomes (
    call_session_id, disposition, sentiment, confidence_score,
    summary, key_points, action_items, qualification_decision, follow_up_recommended
  ) VALUES (
    v_call1_id,
    'INTERESTED',
    'POSITIVE',
    0.94,
    'Customer confirmed high electricity bills (₹8,400 bimonthly) and wants a 5kW hybrid system with 4 hours battery backup. Agreed to technical site survey for this Thursday at 11:00 AM.',
    '["Home is independent duplex in RS Puram", "Has approximately 650 sq ft shadow-free rooftop", "Eligible for ₹78,000 central subsidy under PM Surya Ghar", "Prefers DCR mono PERC modules with 25-year performance warranty"]'::jsonb,
    '["Assign Field Engineer Rajesh for site survey Thursday 11 AM", "Send formal 5kW hybrid system proposal via WhatsApp and email", "Send PM Surya Ghar national portal registration checklist"]'::jsonb,
    'QUALIFIED_HIGH_INTENT',
    TRUE
  ) ON CONFLICT (call_session_id) DO NOTHING;

  INSERT INTO public.transcript_segments (call_session_id, speaker, language, text, confidence, start_offset_ms, end_offset_ms)
  VALUES
    (v_call1_id, 'AGENT', 'ta-IN', 'Vanakkam Mr. Karthik! I am Kavitha from Aadhira Solar Tech.', 0.98, 0, 3200),
    (v_call1_id, 'CUSTOMER', 'ta-IN', 'Vanakkam Kavitha. Yes, I submitted an inquiry for rooftop solar yesterday.', 0.95, 3400, 7100),
    (v_call1_id, 'AGENT', 'ta-IN', 'Great! I see you are interested in our 5kW system. How much is your average EB bill right now?', 0.97, 7300, 12200),
    (v_call1_id, 'CUSTOMER', 'en-IN', 'It comes around 8,000 to 8,500 rupees every two months. Summer time it goes up to 11,000.', 0.96, 12500, 18400)
  ON CONFLICT DO NOTHING;

  -- 11. Follow-up Task
  INSERT INTO public.follow_up_tasks (
    organization_id, lead_id, call_session_id, title, description,
    due_date, priority, status
  ) VALUES (
    v_org_id,
    v_lead1_id,
    v_call1_id,
    'Site survey & roof shadow analysis (RS Puram)',
    'Conduct 650 sq ft roof inspection, measure panel azimuth, verify TNEB meter board capacity.',
    NOW() + INTERVAL '2 days',
    'HIGH',
    'PENDING'
  ) ON CONFLICT DO NOTHING;

  -- 12. Automations
  INSERT INTO public.automations (
    organization_id, title, trigger_event, trigger_conditions, action_type, action_config, status
  ) VALUES
    (v_org_id, 'Post-Call Survey Assignment', 'CALL_COMPLETED', '{"disposition":"INTERESTED"}'::jsonb, 'CREATE_TASK', '{"priority":"HIGH","assigneeRole":"ENGINEER"}'::jsonb, 'ACTIVE'),
    (v_org_id, 'High-Intent Lead Immediate Dial', 'LEAD_SUBMITTED', '{"scoreMin":85}'::jsonb, 'QUEUE_CALL', '{"windowMinutes":5}'::jsonb, 'ACTIVE'),
    (v_org_id, 'DNC Auto-Compliance', 'CALL_COMPLETED', '{"disposition":"DO_NOT_CALL"}'::jsonb, 'FLAG_DNC', '{"suppressOutbound":true}'::jsonb, 'ACTIVE')
  ON CONFLICT DO NOTHING;

END $$;

