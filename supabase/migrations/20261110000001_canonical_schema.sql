-- =====================================================================
-- VoiceNexus AI — Migration 001: Canonical PostgreSQL Schema
-- Platform: Supabase PostgreSQL 15+
-- Domain: Multi-Tenant VoiceNexus Business SaaS
-- =====================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Domain Enums
DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('SUPERADMIN', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.organization_role AS ENUM ('OWNER', 'MANAGER', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_temperature AS ENUM ('HOT', 'WARM', 'COLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.lead_status AS ENUM (
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'FOLLOW_UP',
    'CONVERTED',
    'LOST',
    'DO_NOT_CALL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.call_status AS ENUM (
    'QUEUED',
    'INITIATING',
    'RINGING',
    'IN_PROGRESS',
    'COMPLETED',
    'BUSY',
    'NO_ANSWER',
    'FAILED',
    'CANCELED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.language_mode AS ENUM ('AUTO', 'ENGLISH', 'TAMIL', 'TANGLISH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.call_disposition AS ENUM (
    'INTERESTED',
    'NOT_INTERESTED',
    'CALLBACK_REQUESTED',
    'DO_NOT_CALL',
    'WRONG_NUMBER',
    'VOICEMAIL',
    'ESCALATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sentiment_type AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Generic Updated-At Trigger Function
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. IDENTITY & TENANCY DOMAIN
-- ---------------------------------------------------------------------

-- User Profiles (linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  platform_role public.platform_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Multi-Tenant Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'STARTER',
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Memberships (RBAC: OWNER, MANAGER, AGENT)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL DEFAULT 'AGENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_member UNIQUE (organization_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2. BUSINESS PROFILE & PUBLIC CATALOG DOMAIN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  tagline TEXT,
  description TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  business_hours JSONB DEFAULT '{"timezone":"Asia/Kolkata","monday":{"open":"09:00","close":"18:00"}}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- Automatically create/update profile and provision initial organization & owner
-- on auth.users insert/update (works for confirmed and unconfirmed email flows)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_name TEXT;
  v_org_slug TEXT;
  v_org_id UUID;
  v_base_slug TEXT;
BEGIN
  -- 1. Create or update profile
  INSERT INTO public.profiles (id, full_name, avatar_url, platform_role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'USER'::public.platform_role
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();

  -- 2. If organization_name is provided in user metadata and user has no organization yet, provision it atomically
  v_org_name := TRIM(NEW.raw_user_meta_data->>'organization_name');
  IF v_org_name IS NOT NULL AND LENGTH(v_org_name) > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) THEN
      v_base_slug := LOWER(REGEXP_REPLACE(v_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
      v_base_slug := TRIM(BOTH '-' FROM v_base_slug);
      IF LENGTH(v_base_slug) = 0 THEN
        v_base_slug := 'org';
      END IF;
      v_org_slug := v_base_slug || '-' || SUBSTRING(MD5(NEW.id::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6);

      INSERT INTO public.organizations (name, slug, plan)
      VALUES (v_org_name, v_org_slug, 'STARTER')
      RETURNING id INTO v_org_id;

      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, NEW.id, 'OWNER'::public.organization_role);

      -- Default business profile
      INSERT INTO public.businesses (organization_id, name, country)
      VALUES (v_org_id, v_org_name, 'India');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.business_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_description TEXT,
  hero_headline TEXT,
  hero_subheadline TEXT,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  theme_config JSONB NOT NULL DEFAULT '{"accentColor":"#6366F1","darkTheme":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  category TEXT,
  price_amount NUMERIC(12, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  price_display TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  pricing_model TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3. CRM & LEAD INTELLIGENCE DOMAIN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  channel TEXT NOT NULL,
  source TEXT,
  medium TEXT,
  budget NUMERIC(12, 2),
  clicks_count INT NOT NULL DEFAULT 0,
  leads_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_campaign_slug UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS public.tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  short_code TEXT NOT NULL UNIQUE,
  clicks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  temperature public.lead_temperature NOT NULL DEFAULT 'WARM',
  status public.lead_status NOT NULL DEFAULT 'NEW',
  score INT NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  source TEXT NOT NULL DEFAULT 'Direct',
  primary_interest TEXT,
  location TEXT,
  summary TEXT,
  notes TEXT,
  do_not_call BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Visitor Activity',
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE UNIQUE,
  intent_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  objections_raised JSONB NOT NULL DEFAULT '[]'::jsonb,
  buying_stage TEXT,
  recommended_next_action TEXT,
  qualification_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_estimate TEXT,
  urgency_rating TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_recovery_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visitor_session_id TEXT,
  phone TEXT,
  email TEXT,
  abandoned_url TEXT,
  activity_summary TEXT,
  dwell_time_seconds INT NOT NULL DEFAULT 0,
  recovery_score INT NOT NULL DEFAULT 50 CHECK (recovery_score >= 0 AND recovery_score <= 100),
  is_recovered BOOLEAN NOT NULL DEFAULT FALSE,
  recovered_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. AI AGENT STUDIO & VOICE PROFILES DOMAIN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  language_mode public.language_mode NOT NULL DEFAULT 'AUTO',
  primary_language TEXT NOT NULL DEFAULT 'en-IN',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  active_version_id UUID,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.voice_agents(id) ON DELETE CASCADE,
  version_number TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  greeting_message TEXT NOT NULL,
  turn_timeout_ms INT NOT NULL DEFAULT 2500,
  max_duration_seconds INT NOT NULL DEFAULT 600,
  tools_enabled JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_context TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agent_version UNIQUE (agent_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.agent_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.voice_agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  gender TEXT,
  provider TEXT NOT NULL DEFAULT 'gnani',
  provider_voice_id TEXT NOT NULL,
  is_custom_clone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voice_profile_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_profile_id UUID NOT NULL REFERENCES public.voice_profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  speaker_name TEXT NOT NULL,
  speaker_identity_doc_ref TEXT,
  consent_text TEXT NOT NULL,
  consent_audio_url TEXT,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- 5. CALLING & REALTIME SPEECH DOMAIN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.voice_agents(id) ON DELETE SET NULL,
  agent_version_id UUID REFERENCES public.agent_versions(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'OUTBOUND',
  channel TEXT NOT NULL DEFAULT 'BROWSER_WEBRTC',
  customer_phone TEXT,
  customer_name TEXT,
  status public.call_status NOT NULL DEFAULT 'INITIATING',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INT NOT NULL DEFAULT 0,
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  language TEXT,
  text TEXT NOT NULL,
  confidence NUMERIC(4, 3),
  start_offset_ms INT,
  end_offset_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.call_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE UNIQUE,
  disposition public.call_disposition,
  sentiment public.sentiment_type,
  confidence_score NUMERIC(4, 3),
  summary TEXT,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualification_decision TEXT,
  follow_up_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 6. BUSINESS OPERATIONS & AUDIT DOMAIN
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  call_session_id UUID REFERENCES public.call_sessions(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONNECTED',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_provider UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 7. PERFORMANCE INDEXES (FOREIGN KEYS & HIGH-TRAFFIC QUERY PATHS)
-- ---------------------------------------------------------------------

-- Organization Members
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- Businesses & Catalog
CREATE INDEX IF NOT EXISTS idx_businesses_org ON public.businesses(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_pages_biz ON public.business_pages(business_id);
CREATE INDEX IF NOT EXISTS idx_business_pages_slug ON public.business_pages(slug);
CREATE INDEX IF NOT EXISTS idx_products_biz ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_services_biz ON public.services(business_id);

-- Campaigns & Tracking
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON public.campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_campaign ON public.tracking_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_short ON public.tracking_links(short_code);

-- Leads & Intelligence
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON public.leads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON public.leads(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(temperature);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON public.lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_recovery_org ON public.lead_recovery_records(organization_id, is_recovered);

-- AI Agents & Versions
CREATE INDEX IF NOT EXISTS idx_voice_agents_org ON public.voice_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON public.agent_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_org ON public.voice_profiles(organization_id);

-- Calls & Transcripts
CREATE INDEX IF NOT EXISTS idx_calls_org_status ON public.call_sessions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_lead ON public.call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON public.call_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_call ON public.transcript_segments(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_outcomes_call ON public.call_outcomes(call_session_id);

-- Operations & Audit
CREATE INDEX IF NOT EXISTS idx_tasks_org_status ON public.follow_up_tasks(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_automations_org ON public.automations(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 8. AUTOMATIC UPDATED_AT TRIGGERS
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER trg_organization_members_updated_at BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_businesses_updated_at ON public.businesses;
CREATE TRIGGER trg_businesses_updated_at BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_voice_agents_updated_at ON public.voice_agents;
CREATE TRIGGER trg_voice_agents_updated_at BEFORE UPDATE ON public.voice_agents
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_call_sessions_updated_at ON public.call_sessions;
CREATE TRIGGER trg_call_sessions_updated_at BEFORE UPDATE ON public.call_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Active version foreign key constraint added after agent_versions table exists
DO $$ BEGIN
  ALTER TABLE public.voice_agents
  ADD CONSTRAINT fk_voice_agents_active_version
  FOREIGN KEY (active_version_id) REFERENCES public.agent_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
