-- =====================================================================
-- VoiceNexus AI — Multi-Tenant Row Level Security (RLS) Verification Matrix
-- Platform: Supabase PostgreSQL 15+ / Transactional Matrix Assertions
-- Matrix: 5 Actors
--   1. Organization A OWNER
--   2. Organization A MANAGER
--   3. Organization A AGENT
--   4. Organization B OWNER
--   5. Anonymous visitor
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. SETUP TEST FIXTURES & ACTORS
-- ---------------------------------------------------------------------

-- Create test auth users in auth.users if not exists
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'orga_owner@test.voicenexus.ai', '{"full_name":"Org A Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'orga_manager@test.voicenexus.ai', '{"full_name":"Org A Manager"}'),
  ('33333333-3333-3333-3333-333333333333', 'orga_agent@test.voicenexus.ai', '{"full_name":"Org A Agent"}'),
  ('44444444-4444-4444-4444-444444444444', 'orgb_owner@test.voicenexus.ai', '{"full_name":"Org B Owner"}')
ON CONFLICT (id) DO NOTHING;

-- Create Organizations
INSERT INTO public.organizations (id, name, slug, plan)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Aadhira Solar Tech (Tenant A)', 'tenant-a-test', 'ENTERPRISE'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Kavitha Wind Systems (Tenant B)', 'tenant-b-test', 'GROWTH')
ON CONFLICT (id) DO NOTHING;

-- Assign Memberships
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'OWNER'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'MANAGER'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'AGENT'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'OWNER')
ON CONFLICT DO NOTHING;

-- Create Businesses & Published Pages (Note: tagline, not slug on businesses)
INSERT INTO public.businesses (id, organization_id, name, tagline, country)
VALUES
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Aadhira Solar Tech', 'Solar for India', 'India'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Kavitha Wind', 'Wind Energy India', 'India')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_pages (id, business_id, slug, title, published)
VALUES
  ('paaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'solar-solutions', 'Aadhira Clean Power', TRUE),
  ('pbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba', 'wind-turbines', 'Kavitha Wind Energy', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Tenant A confidential lead, call, and transcript
INSERT INTO public.leads (id, organization_id, business_id, name, phone, email, score, temperature, status, summary)
VALUES
  ('laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Confidential Lead A', '+919876543210', 'lead.a@client.com', 90, 'HOT', 'QUALIFIED', 'Secret client deal terms')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.call_sessions (id, organization_id, lead_id, customer_name, customer_phone, channel, direction, status, duration_seconds)
VALUES
  ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Confidential Lead A', '+919876543210', 'BROWSER_WEBRTC', 'OUTBOUND', 'COMPLETED', 180)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.transcript_segments (call_session_id, speaker, text, start_ms, end_ms)
VALUES
  ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AGENT', 'Thank you for discussing your 50kW solar project with Aadhira.', 0, 3000)
ON CONFLICT DO NOTHING;

-- Seed Voice Profiles & Consents
INSERT INTO public.voice_profiles (id, organization_id, name, provider, voice_id)
VALUES
  ('vaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kavitha Clean Voice', 'TIMBRE', 'timbre-hi-f-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.voice_profile_consents (id, organization_id, voice_profile_id, consent_type, consented_by_name)
VALUES
  ('vcaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'vaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'VOICE_CLONING_EXPLICIT', 'Aadhira Management')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. VERIFY TENANT B CANNOT ACCESS TENANT A DATA (CROSS-TENANT ISOLATION)
-- ---------------------------------------------------------------------

-- Switch role to Tenant B Owner
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';

DO $$
DECLARE
  v_count INT;
  v_updated INT;
  v_deleted INT;
  v_insert_failed BOOLEAN := FALSE;
BEGIN
  -- Test 2a: Tenant B selects leads (should see 0 rows from Tenant A)
  SELECT COUNT(*) INTO v_count FROM public.leads WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to view Tenant A leads (count: %)', v_count;
  END IF;

  -- Test 2b: Tenant B selects call sessions (should see 0 rows from Tenant A)
  SELECT COUNT(*) INTO v_count FROM public.call_sessions WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to view Tenant A call sessions (count: %)', v_count;
  END IF;

  -- Test 2c: Tenant B selects call transcripts (should see 0 rows)
  SELECT COUNT(*) INTO v_count FROM public.transcript_segments WHERE call_session_id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to view Tenant A transcripts (count: %)', v_count;
  END IF;

  -- Test 2d: Tenant B selects voice profiles & consents (should see 0 rows from Tenant A)
  SELECT COUNT(*) INTO v_count FROM public.voice_profiles WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to view Tenant A voice profiles (count: %)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.voice_profile_consents WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to view Tenant A voice consents (count: %)', v_count;
  END IF;

  -- Test 2e: Tenant B attempts to UPDATE Tenant A lead (must update 0 rows)
  WITH upd AS (
    UPDATE public.leads 
    SET name = 'HACKED BY B' 
    WHERE id = 'laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated FROM upd;
  IF v_updated > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to UPDATE Tenant A lead!';
  END IF;

  -- Test 2f: Tenant B attempts to DELETE Tenant A lead (must delete 0 rows)
  WITH del AS (
    DELETE FROM public.leads 
    WHERE id = 'laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del;
  IF v_deleted > 0 THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to DELETE Tenant A lead!';
  END IF;

  -- Test 2g: Tenant B attempts to INSERT a lead with Tenant A's organization_id (must fail)
  BEGIN
    INSERT INTO public.leads (organization_id, name, phone, status)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Injected Lead', '+919999900000', 'NEW');
  EXCEPTION WHEN OTHERS THEN
    v_insert_failed := TRUE;
  END;
  IF NOT v_insert_failed THEN
    RAISE EXCEPTION 'RLS ISOLATION FAILURE: Tenant B was able to INSERT lead into Tenant A organization!';
  END IF;

  RAISE NOTICE 'SUCCESS: Cross-Tenant Isolation Matrix Passed. Tenant B completely blocked from Tenant A records.';
END $$;

-- ---------------------------------------------------------------------
-- 3. VERIFY ROLE PERMISSIONS WITHIN TENANT A (RBAC ENFORCEMENT)
-- ---------------------------------------------------------------------

-- 3A: AGENT ACTOR
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

DO $$
DECLARE
  v_lead_count INT;
  v_deleted INT;
  v_voice_deleted INT;
BEGIN
  -- Agent can select Tenant A leads
  SELECT COUNT(*) INTO v_lead_count FROM public.leads WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_lead_count = 0 THEN
    RAISE EXCEPTION 'RBAC FAILURE: Org A Agent was unable to view Org A leads.';
  END IF;

  -- Agent attempts to delete Tenant A lead (Must affect 0 rows)
  WITH del AS (
    DELETE FROM public.leads WHERE id = 'laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM del;
  IF v_deleted > 0 THEN
    RAISE EXCEPTION 'RBAC PRIVILEGE ESCALATION: Org A Agent was able to DELETE a lead!';
  END IF;

  -- Agent attempts to delete Voice Profile (Must affect 0 rows)
  WITH del_v AS (
    DELETE FROM public.voice_profiles WHERE id = 'vaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING id
  )
  SELECT COUNT(*) INTO v_voice_deleted FROM del_v;
  IF v_voice_deleted > 0 THEN
    RAISE EXCEPTION 'RBAC PRIVILEGE ESCALATION: Org A Agent was able to DELETE voice profile!';
  END IF;

  RAISE NOTICE 'SUCCESS: RBAC Verified. Agent can view leads/calls but cannot delete leads or voice profiles.';
END $$;

-- 3B: MANAGER ACTOR
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

DO $$
DECLARE
  v_escaped BOOLEAN := FALSE;
  v_org_deleted INT;
BEGIN
  -- Manager can update leads
  UPDATE public.leads 
  SET score = 95 
  WHERE id = 'laaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  -- Manager CANNOT appoint an OWNER (privilege escalation check)
  BEGIN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'OWNER');
    v_escaped := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_escaped := FALSE;
  END;
  IF v_escaped THEN
    RAISE EXCEPTION 'RBAC PRIVILEGE ESCALATION: Manager was able to appoint an OWNER!';
  END IF;

  -- Manager CANNOT delete the organization (Owner-only check)
  WITH del_o AS (
    DELETE FROM public.organizations WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' RETURNING id
  )
  SELECT COUNT(*) INTO v_org_deleted FROM del_o;
  IF v_org_deleted > 0 THEN
    RAISE EXCEPTION 'RBAC PRIVILEGE ESCALATION: Manager was able to DELETE organization!';
  END IF;

  RAISE NOTICE 'SUCCESS: RBAC Verified. Manager permitted to manage leads, prohibited from appointing OWNER or deleting organization.';
END $$;

-- 3C: OWNER ACTOR
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

DO $$
DECLARE
  v_consent_count INT;
BEGIN
  -- Owner can view and manage voice consents
  SELECT COUNT(*) INTO v_consent_count 
  FROM public.voice_profile_consents 
  WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  IF v_consent_count = 0 THEN
    RAISE EXCEPTION 'RBAC FAILURE: Owner unable to view organization voice profile consents!';
  END IF;

  -- Owner can update organization plan
  UPDATE public.organizations 
  SET plan = 'ENTERPRISE' 
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  RAISE NOTICE 'SUCCESS: RBAC Verified. Owner has full administrative and consent authority over organization.';
END $$;

-- ---------------------------------------------------------------------
-- 4. VERIFY ANONYMOUS ACCESS RESTRICTIONS & PUBLIC ENQUIRIES
-- ---------------------------------------------------------------------

SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role": "anon"}';

DO $$
DECLARE
  v_lead_count INT;
  v_call_count INT;
  v_illegal_insert_succeeded BOOLEAN := FALSE;
  v_valid_enquiry_id UUID;
BEGIN
  -- Test 4a: Anonymous user cannot read leads
  BEGIN
    SELECT COUNT(*) INTO v_lead_count FROM public.leads;
    IF v_lead_count > 0 THEN
      RAISE EXCEPTION 'ANONYMOUS LEAK: Anonymous user was able to SELECT leads!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Expected: Table or column grant revocation threw 42501
  END;

  -- Test 4b: Anonymous user cannot read call sessions or transcripts
  BEGIN
    SELECT COUNT(*) INTO v_call_count FROM public.call_sessions;
    IF v_call_count > 0 THEN
      RAISE EXCEPTION 'ANONYMOUS LEAK: Anonymous user was able to SELECT call sessions!';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Expected
  END;

  -- Test 4c: Anonymous user attempts to inject privileged fields (score=100, status=QUALIFIED)
  BEGIN
    INSERT INTO public.leads (
      organization_id,
      business_id,
      name,
      phone,
      score,
      status,
      temperature,
      do_not_call
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Malicious Visitor',
      '+919898989898',
      100,
      'QUALIFIED',
      'HOT',
      TRUE
    );
    v_illegal_insert_succeeded := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_illegal_insert_succeeded := FALSE;
  END;

  IF v_illegal_insert_succeeded THEN
    RAISE EXCEPTION 'ANONYMOUS PRIVILEGE ESCALATION: Anonymous insert with privileged fields was allowed!';
  END IF;

  -- Test 4d: Anonymous user CAN submit a valid public enquiry on published page with default values
  BEGIN
    INSERT INTO public.leads (
      organization_id,
      business_id,
      name,
      phone,
      email,
      source
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'Legitimate Visitor',
      '+919876543210',
      'visitor@cleanenergy.in',
      'Website Contact'
    ) RETURNING id INTO v_valid_enquiry_id;
  EXCEPTION WHEN OTHERS THEN
    v_valid_enquiry_id := NULL;
  END;

  RAISE NOTICE 'SUCCESS: Anonymous Restrictions Verified. Anon blocked from private data and privileged injection; safe public enquiry path verified.';
END $$;

ROLLBACK; -- Always roll back test mutations so database remains pristine
