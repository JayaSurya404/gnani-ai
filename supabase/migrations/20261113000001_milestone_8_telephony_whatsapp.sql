-- =====================================================================
-- VOICENEXUS AI — MILESTONE 8: TELEPHONY & WHATSAPP INTEGRATION
-- Migration: 20261113000001_milestone_8_telephony_whatsapp.sql
-- Description: Extends call_sessions and notification_dispatches with
-- Twilio metadata, provisions telephony_phone_numbers and telephony_events
-- with organization-level RLS, idempotency, and audit trails.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTEND CALL_SESSIONS WITH TELEPHONY METADATA
-- ---------------------------------------------------------------------

DO $$
BEGIN
  -- Twilio Call SID
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'twilio_call_sid') THEN
    ALTER TABLE public.call_sessions ADD COLUMN twilio_call_sid TEXT UNIQUE;
  END IF;

  -- Parent Call SID (for transfers and child legs)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'parent_call_sid') THEN
    ALTER TABLE public.call_sessions ADD COLUMN parent_call_sid TEXT;
  END IF;

  -- Telephony Provider
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'telephony_provider') THEN
    ALTER TABLE public.call_sessions ADD COLUMN telephony_provider TEXT NOT NULL DEFAULT 'BROWSER_WEBRTC'
      CHECK (telephony_provider IN ('BROWSER_WEBRTC', 'TWILIO', 'EXOTEL', 'PLIVO'));
  END IF;

  -- Caller Number (E.164)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'caller_number') THEN
    ALTER TABLE public.call_sessions ADD COLUMN caller_number TEXT;
  END IF;

  -- Callee Number (E.164)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'callee_number') THEN
    ALTER TABLE public.call_sessions ADD COLUMN callee_number TEXT;
  END IF;

  -- Recording SID (Twilio RE...)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'recording_sid') THEN
    ALTER TABLE public.call_sessions ADD COLUMN recording_sid TEXT;
  END IF;

  -- Recording Duration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'recording_duration_seconds') THEN
    ALTER TABLE public.call_sessions ADD COLUMN recording_duration_seconds INT;
  END IF;

  -- Transfer Status Lifecycle
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'transfer_status') THEN
    ALTER TABLE public.call_sessions ADD COLUMN transfer_status TEXT NOT NULL DEFAULT 'NONE'
      CHECK (transfer_status IN ('NONE', 'REQUESTED', 'INITIATED', 'COMPLETED', 'FAILED'));
  END IF;

  -- Transfer Target (Supervisor phone / SIP URI)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'transfer_target') THEN
    ALTER TABLE public.call_sessions ADD COLUMN transfer_target TEXT;
  END IF;

  -- Telephony Cost & Currency
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'telephony_cost') THEN
    ALTER TABLE public.call_sessions ADD COLUMN telephony_cost NUMERIC(6, 4) NOT NULL DEFAULT 0.0000;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'call_sessions' AND column_name = 'telephony_currency') THEN
    ALTER TABLE public.call_sessions ADD COLUMN telephony_currency TEXT NOT NULL DEFAULT 'USD';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_call_sessions_twilio_sid ON public.call_sessions(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_sessions_caller ON public.call_sessions(caller_number);
CREATE INDEX IF NOT EXISTS idx_call_sessions_callee ON public.call_sessions(callee_number);

-- ---------------------------------------------------------------------
-- 2. EXTEND NOTIFICATION_DISPATCHES WITH WHATSAPP METADATA
-- ---------------------------------------------------------------------

DO $$
BEGIN
  -- Twilio Message SID (SM... or MM...)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_dispatches' AND column_name = 'twilio_message_sid') THEN
    ALTER TABLE public.notification_dispatches ADD COLUMN twilio_message_sid TEXT UNIQUE;
  END IF;

  -- WhatsApp Conversation ID
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_dispatches' AND column_name = 'whatsapp_conversation_id') THEN
    ALTER TABLE public.notification_dispatches ADD COLUMN whatsapp_conversation_id TEXT;
  END IF;

  -- Delivery Status Details (error codes, carrier feedback, timestamps)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notification_dispatches' AND column_name = 'delivery_status_details') THEN
    ALTER TABLE public.notification_dispatches ADD COLUMN delivery_status_details JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_dispatches_twilio_sid ON public.notification_dispatches(twilio_message_sid);

-- ---------------------------------------------------------------------
-- 3. TELEPHONY PHONE NUMBERS (ORGANIZATION NUMBER REGISTRY)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.telephony_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE, -- E.164 format (+91..., +1...)
  provider TEXT NOT NULL DEFAULT 'TWILIO' CHECK (provider IN ('TWILIO', 'EXOTEL', 'TATA_TELE')),
  provider_sid TEXT,
  number_type TEXT NOT NULL DEFAULT 'TOLL_FREE'
    CHECK (number_type IN ('LOCAL', 'NATIONAL', 'TOLL_FREE', '140_SERIES', '160_SERIES', 'INTERNATIONAL_TRIAL')),
  friendly_name TEXT NOT NULL,
  assigned_agent_id UUID REFERENCES public.voice_agents(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  capabilities JSONB NOT NULL DEFAULT '{"voice": true, "sms": false, "whatsapp": false}'::jsonb,
  dlt_principal_entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telephony_numbers_org ON public.telephony_phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_telephony_numbers_e164 ON public.telephony_phone_numbers(phone_number);

-- ---------------------------------------------------------------------
-- 4. TELEPHONY EVENTS (AUDIT LOG FOR WEBHOOK STATUS EVENTS)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.telephony_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_session_id UUID REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  twilio_call_sid TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'initiated', 'ringing', 'answered', 'completed', 'recording', 'transfer'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telephony_events_sid ON public.telephony_events(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_telephony_events_session ON public.telephony_events(call_session_id);
CREATE INDEX IF NOT EXISTS idx_telephony_events_org ON public.telephony_events(organization_id);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------

ALTER TABLE public.telephony_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

-- Telephony Phone Numbers RLS
DROP POLICY IF EXISTS "telephony_numbers_select_member" ON public.telephony_phone_numbers;
CREATE POLICY "telephony_numbers_select_member" ON public.telephony_phone_numbers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "telephony_numbers_manage_admin" ON public.telephony_phone_numbers;
CREATE POLICY "telephony_numbers_manage_admin" ON public.telephony_phone_numbers
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Telephony Events RLS
DROP POLICY IF EXISTS "telephony_events_select_member" ON public.telephony_events;
CREATE POLICY "telephony_events_select_member" ON public.telephony_events
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS "telephony_events_manage_member" ON public.telephony_events;
CREATE POLICY "telephony_events_manage_member" ON public.telephony_events
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- 6. PRIVILEGES & SECURITY BOUNDARIES
-- ---------------------------------------------------------------------

REVOKE ALL ON public.telephony_phone_numbers FROM PUBLIC, anon;
REVOKE ALL ON public.telephony_events FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telephony_phone_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telephony_events TO authenticated;

