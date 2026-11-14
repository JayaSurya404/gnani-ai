-- =====================================================================
-- VoiceNexus AI — Migration 002: Row Level Security & Access Control
-- Platform: Supabase PostgreSQL 15+
-- Domain: Strict Multi-Tenant Isolation with Non-Recursive Policies
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- Avoid recursive RLS query loops by using stable functions with fixed search_path.
-- ---------------------------------------------------------------------

-- Returns all organization IDs that the CURRENT authenticated user belongs to.
-- Zero parameters to prevent any IDOR/parameter injection via Supabase RPC.
CREATE OR REPLACE FUNCTION public.get_user_organization_ids()
RETURNS SETOF pg_catalog.uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE user_id OPERATOR(pg_catalog.=) (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_uuid pg_catalog.uuid)
RETURNS pg_catalog.bool
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_members
    WHERE organization_id OPERATOR(pg_catalog.=) org_uuid 
      AND user_id OPERATOR(pg_catalog.=) (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(
  org_uuid pg_catalog.uuid, 
  required_roles public.organization_role[]
)
RETURNS pg_catalog.bool
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_members
    WHERE organization_id OPERATOR(pg_catalog.=) org_uuid 
      AND user_id OPERATOR(pg_catalog.=) (SELECT auth.uid())
      AND role::pg_catalog.text OPERATOR(pg_catalog.=) ANY(required_roles::pg_catalog.text[])
  );
$$;

-- Restrict function execution strictly to authenticated users (Zero anonymous access)
REVOKE ALL ON FUNCTION public.get_user_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_organization_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids() TO authenticated;

REVOKE ALL ON FUNCTION public.is_org_member(pg_catalog.uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(pg_catalog.uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(pg_catalog.uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.has_org_role(pg_catalog.uuid, public.organization_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(pg_catalog.uuid, public.organization_role[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(pg_catalog.uuid, public.organization_role[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ON ALL DOMAIN TABLES
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_recovery_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profile_consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_outcomes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. PROFILES POLICIES
-- ---------------------------------------------------------------------

-- Users can view their own profile OR profiles of teammates in their organizations
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR id IN (
      SELECT om.user_id FROM public.organization_members om
      WHERE om.organization_id IN (SELECT public.get_user_organization_ids())
    )
  );

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ---------------------------------------------------------------------
-- 4. ORGANIZATIONS POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "org_select_member" ON public.organizations;
CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "org_insert_authenticated" ON public.organizations;
CREATE POLICY "org_insert_authenticated" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "org_update_owner" ON public.organizations;
CREATE POLICY "org_update_owner" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['OWNER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(id, ARRAY['OWNER']::public.organization_role[]));

DROP POLICY IF EXISTS "org_delete_owner" ON public.organizations;
CREATE POLICY "org_delete_owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.has_org_role(id, ARRAY['OWNER']::public.organization_role[]));

-- ---------------------------------------------------------------------
-- 5. ORGANIZATION MEMBERS POLICIES (NON-RECURSIVE, NO PRIVILEGE ESCALATION)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
CREATE POLICY "org_members_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (SELECT public.get_user_organization_ids())
  );

DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;
CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      -- OWNER can invite any role (OWNER, MANAGER, AGENT)
      public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[])
    )
    OR (
      -- MANAGER can invite only MANAGER or AGENT (cannot appoint OWNER)
      public.has_org_role(organization_id, ARRAY['MANAGER']::public.organization_role[])
      AND role IN ('MANAGER'::public.organization_role, 'AGENT'::public.organization_role)
    )
    OR (
      -- Initial self-assignment when user creates a brand new organization
      user_id = (SELECT auth.uid())
      AND role = 'OWNER'::public.organization_role
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id
      )
    )
  );

DROP POLICY IF EXISTS "org_members_update" ON public.organization_members;
CREATE POLICY "org_members_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[]));

DROP POLICY IF EXISTS "org_members_delete" ON public.organization_members;
CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[])
    OR (
      -- Allow self-removal (leaving an organization) provided user is not the sole OWNER
      user_id = (SELECT auth.uid())
      AND (
        role != 'OWNER'::public.organization_role
        OR (
          SELECT COUNT(*) FROM public.organization_members om
          WHERE om.organization_id = organization_members.organization_id
            AND om.role = 'OWNER'::public.organization_role
        ) > 1
      )
    )
  );

-- ---------------------------------------------------------------------
-- 6. BUSINESS PROFILE & CATALOG POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "biz_select_member" ON public.businesses;
CREATE POLICY "biz_select_member" ON public.businesses
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Anonymous visitors can only select businesses that have an active published business page
DROP POLICY IF EXISTS "biz_select_anon" ON public.businesses;
CREATE POLICY "biz_select_anon" ON public.businesses
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.business_pages bp
      WHERE bp.business_id = businesses.id AND bp.published = TRUE
    )
  );

DROP POLICY IF EXISTS "biz_insert_admin" ON public.businesses;
CREATE POLICY "biz_insert_admin" ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "biz_update_admin" ON public.businesses;
CREATE POLICY "biz_update_admin" ON public.businesses
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "biz_delete_owner" ON public.businesses;
CREATE POLICY "biz_delete_owner" ON public.businesses
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[]));

-- Business Pages
DROP POLICY IF EXISTS "pages_select_member" ON public.business_pages;
CREATE POLICY "pages_select_member" ON public.business_pages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_pages.business_id AND public.is_org_member(b.organization_id)));

DROP POLICY IF EXISTS "pages_select_anon" ON public.business_pages;
CREATE POLICY "pages_select_anon" ON public.business_pages
  FOR SELECT TO anon
  USING (published = TRUE);

DROP POLICY IF EXISTS "pages_manage_admin" ON public.business_pages;
CREATE POLICY "pages_manage_admin" ON public.business_pages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_pages.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_pages.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

-- Products & Services
DROP POLICY IF EXISTS "products_select_member" ON public.products;
CREATE POLICY "products_select_member" ON public.products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = products.business_id AND public.is_org_member(b.organization_id)));

DROP POLICY IF EXISTS "products_select_anon" ON public.products;
CREATE POLICY "products_select_anon" ON public.products
  FOR SELECT TO anon
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_pages bp ON bp.business_id = b.id
      WHERE b.id = products.business_id AND bp.published = TRUE
    )
  );

DROP POLICY IF EXISTS "products_manage_admin" ON public.products;
CREATE POLICY "products_manage_admin" ON public.products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = products.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = products.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

DROP POLICY IF EXISTS "services_select_member" ON public.services;
CREATE POLICY "services_select_member" ON public.services
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND public.is_org_member(b.organization_id)));

DROP POLICY IF EXISTS "services_select_anon" ON public.services;
CREATE POLICY "services_select_anon" ON public.services
  FOR SELECT TO anon
  USING (
    is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_pages bp ON bp.business_id = b.id
      WHERE b.id = services.business_id AND bp.published = TRUE
    )
  );

DROP POLICY IF EXISTS "services_manage_admin" ON public.services;
CREATE POLICY "services_manage_admin" ON public.services
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND public.has_org_role(b.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

-- ---------------------------------------------------------------------
-- 7. CAMPAIGNS & TRACKING POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "campaigns_select_member" ON public.campaigns;
CREATE POLICY "campaigns_select_member" ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "campaigns_manage_admin" ON public.campaigns;
CREATE POLICY "campaigns_manage_admin" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "tracking_links_select_member" ON public.tracking_links;
CREATE POLICY "tracking_links_select_member" ON public.tracking_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = tracking_links.campaign_id AND public.is_org_member(c.organization_id)));

DROP POLICY IF EXISTS "tracking_links_manage_admin" ON public.tracking_links;
CREATE POLICY "tracking_links_manage_admin" ON public.tracking_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = tracking_links.campaign_id AND public.has_org_role(c.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = tracking_links.campaign_id AND public.has_org_role(c.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

-- ---------------------------------------------------------------------
-- 8. LEADS & LEAD INTELLIGENCE POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "leads_select_member" ON public.leads;
CREATE POLICY "leads_select_member" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "leads_insert_member" ON public.leads;
CREATE POLICY "leads_insert_member" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

-- Anonymous public enquiry submission with strict sanity bounds
-- Anonymous submissions cannot manipulate score, temperature, assigned_to, notes, summary, do_not_call, or status
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
CREATE POLICY "leads_insert_anon" ON public.leads
  FOR INSERT TO anon
  WITH CHECK (
    LENGTH(TRIM(phone)) >= 8
    AND LENGTH(TRIM(name)) >= 2
    AND (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    AND do_not_call = FALSE
    AND status = 'NEW'::public.lead_status
    AND temperature = 'COLD'::public.lead_temperature
    AND score = 0
    AND notes IS NULL
    AND summary IS NULL
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_pages bp ON bp.business_id = b.id
      WHERE b.organization_id = leads.organization_id
        AND bp.published = TRUE
    )
  );

DROP POLICY IF EXISTS "leads_update_member" ON public.leads;
CREATE POLICY "leads_update_member" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "leads_delete_admin" ON public.leads;
CREATE POLICY "leads_delete_admin" ON public.leads
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

-- Lead Events
DROP POLICY IF EXISTS "lead_events_select_member" ON public.lead_events;
CREATE POLICY "lead_events_select_member" ON public.lead_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "lead_events_insert_member" ON public.lead_events;
CREATE POLICY "lead_events_insert_member" ON public.lead_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "lead_events_insert_anon" ON public.lead_events;
CREATE POLICY "lead_events_insert_anon" ON public.lead_events
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN ('PAGE_VIEW', 'FORM_SUBMIT', 'CALCULATOR_USE')
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_events.lead_id
        AND l.organization_id = lead_events.organization_id
    )
  );

-- Lead Intelligence
DROP POLICY IF EXISTS "lead_intelligence_select_member" ON public.lead_intelligence;
CREATE POLICY "lead_intelligence_select_member" ON public.lead_intelligence
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_intelligence.lead_id AND public.is_org_member(l.organization_id)));

DROP POLICY IF EXISTS "lead_intelligence_manage_member" ON public.lead_intelligence;
CREATE POLICY "lead_intelligence_manage_member" ON public.lead_intelligence
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_intelligence.lead_id AND public.is_org_member(l.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_intelligence.lead_id AND public.is_org_member(l.organization_id)));

-- Lead Recovery Records
DROP POLICY IF EXISTS "lead_recovery_select_member" ON public.lead_recovery_records;
CREATE POLICY "lead_recovery_select_member" ON public.lead_recovery_records
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "lead_recovery_insert_member" ON public.lead_recovery_records;
CREATE POLICY "lead_recovery_insert_member" ON public.lead_recovery_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "lead_recovery_insert_anon" ON public.lead_recovery_records;
CREATE POLICY "lead_recovery_insert_anon" ON public.lead_recovery_records
  FOR INSERT TO anon
  WITH CHECK (
    (LENGTH(TRIM(phone)) >= 8 OR (email IS NOT NULL AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'))
    AND is_recovered = FALSE
    AND recovered_lead_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      JOIN public.business_pages bp ON bp.business_id = b.id
      WHERE b.organization_id = lead_recovery_records.organization_id
        AND bp.published = TRUE
    )
  );

DROP POLICY IF EXISTS "lead_recovery_update_member" ON public.lead_recovery_records;
CREATE POLICY "lead_recovery_update_member" ON public.lead_recovery_records
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- 9. AI AGENT STUDIO & VOICE PROFILES POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "agents_select_member" ON public.voice_agents;
CREATE POLICY "agents_select_member" ON public.voice_agents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "agents_manage_admin" ON public.voice_agents;
CREATE POLICY "agents_manage_admin" ON public.voice_agents
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

-- Agent Versions & Knowledge Sources
DROP POLICY IF EXISTS "versions_select_member" ON public.agent_versions;
CREATE POLICY "versions_select_member" ON public.agent_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_versions.agent_id AND public.is_org_member(a.organization_id)));

DROP POLICY IF EXISTS "versions_manage_admin" ON public.agent_versions;
CREATE POLICY "versions_manage_admin" ON public.agent_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_versions.agent_id AND public.has_org_role(a.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_versions.agent_id AND public.has_org_role(a.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

DROP POLICY IF EXISTS "knowledge_select_member" ON public.agent_knowledge_sources;
CREATE POLICY "knowledge_select_member" ON public.agent_knowledge_sources
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_knowledge_sources.agent_id AND public.is_org_member(a.organization_id)));

DROP POLICY IF EXISTS "knowledge_manage_admin" ON public.agent_knowledge_sources;
CREATE POLICY "knowledge_manage_admin" ON public.agent_knowledge_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_knowledge_sources.agent_id AND public.has_org_role(a.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_agents a WHERE a.id = agent_knowledge_sources.agent_id AND public.has_org_role(a.organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[])));

-- Voice Profiles & Consents
DROP POLICY IF EXISTS "voice_profiles_select_member" ON public.voice_profiles;
CREATE POLICY "voice_profiles_select_member" ON public.voice_profiles
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "voice_profiles_manage_admin" ON public.voice_profiles;
CREATE POLICY "voice_profiles_manage_admin" ON public.voice_profiles
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "voice_consents_select_member" ON public.voice_profile_consents;
CREATE POLICY "voice_consents_select_member" ON public.voice_profile_consents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "voice_consents_manage_owner" ON public.voice_profile_consents;
CREATE POLICY "voice_consents_manage_owner" ON public.voice_profile_consents
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER']::public.organization_role[]));

-- ---------------------------------------------------------------------
-- 10. CALLING, TRANSCRIPTS & OUTCOMES POLICIES (STRICT ZERO ANON ACCESS)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "calls_select_member" ON public.call_sessions;
CREATE POLICY "calls_select_member" ON public.call_sessions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "calls_manage_member" ON public.call_sessions;
CREATE POLICY "calls_manage_member" ON public.call_sessions
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Call Events
DROP POLICY IF EXISTS "call_events_select_member" ON public.call_events;
CREATE POLICY "call_events_select_member" ON public.call_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = call_events.call_session_id AND public.is_org_member(c.organization_id)));

DROP POLICY IF EXISTS "call_events_insert_member" ON public.call_events;
CREATE POLICY "call_events_insert_member" ON public.call_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = call_events.call_session_id AND public.is_org_member(c.organization_id)));

-- Transcript Segments (Strict Member Access Only - Zero Anon Access)
DROP POLICY IF EXISTS "transcripts_select_member" ON public.transcript_segments;
CREATE POLICY "transcripts_select_member" ON public.transcript_segments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = transcript_segments.call_session_id AND public.is_org_member(c.organization_id)));

DROP POLICY IF EXISTS "transcripts_insert_member" ON public.transcript_segments;
CREATE POLICY "transcripts_insert_member" ON public.transcript_segments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = transcript_segments.call_session_id AND public.is_org_member(c.organization_id)));

-- Call Outcomes (Strict Member Access Only - Zero Anon Access)
DROP POLICY IF EXISTS "outcomes_select_member" ON public.call_outcomes;
CREATE POLICY "outcomes_select_member" ON public.call_outcomes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = call_outcomes.call_session_id AND public.is_org_member(c.organization_id)));

DROP POLICY IF EXISTS "outcomes_manage_member" ON public.call_outcomes;
CREATE POLICY "outcomes_manage_member" ON public.call_outcomes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = call_outcomes.call_session_id AND public.is_org_member(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.call_sessions c WHERE c.id = call_outcomes.call_session_id AND public.is_org_member(c.organization_id)));

-- ---------------------------------------------------------------------
-- 11. OPERATIONS, AUTOMATIONS & AUDIT POLICIES
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "tasks_select_member" ON public.follow_up_tasks;
CREATE POLICY "tasks_select_member" ON public.follow_up_tasks
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "tasks_manage_member" ON public.follow_up_tasks;
CREATE POLICY "tasks_manage_member" ON public.follow_up_tasks
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Automations (Admin Only)
DROP POLICY IF EXISTS "automations_select_member" ON public.automations;
CREATE POLICY "automations_select_member" ON public.automations
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "automations_manage_admin" ON public.automations;
CREATE POLICY "automations_manage_admin" ON public.automations
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

-- Integrations (Owner/Manager Only)
DROP POLICY IF EXISTS "integrations_select_admin" ON public.integration_connections;
CREATE POLICY "integrations_select_admin" ON public.integration_connections
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "integrations_manage_admin" ON public.integration_connections;
CREATE POLICY "integrations_manage_admin" ON public.integration_connections
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

-- Audit Logs (Read-only for Owner/Manager; Insert for all authenticated actions)
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_logs;
CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, ARRAY['OWNER', 'MANAGER']::public.organization_role[]));

DROP POLICY IF EXISTS "audit_insert_action" ON public.audit_logs;
CREATE POLICY "audit_insert_action" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- ---------------------------------------------------------------------
-- 12. TABLE-LEVEL AND COLUMN-LEVEL PRIVILEGE HARDENING FOR ANON ROLE
-- Defense-in-depth: revoke broad permissions and grant only explicitly permitted columns.
-- ---------------------------------------------------------------------

-- Completely revoke all privileges on sensitive and internal tables from anon
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.organization_members FROM anon;
REVOKE ALL ON public.campaigns FROM anon;
REVOKE ALL ON public.tracking_links FROM anon;
REVOKE ALL ON public.lead_intelligence FROM anon;
REVOKE ALL ON public.voice_agents FROM anon;
REVOKE ALL ON public.agent_versions FROM anon;
REVOKE ALL ON public.agent_knowledge_sources FROM anon;
REVOKE ALL ON public.voice_profiles FROM anon;
REVOKE ALL ON public.voice_profile_consents FROM anon;
REVOKE ALL ON public.call_sessions FROM anon;
REVOKE ALL ON public.call_events FROM anon;
REVOKE ALL ON public.transcript_segments FROM anon;
REVOKE ALL ON public.call_outcomes FROM anon;
REVOKE ALL ON public.follow_up_tasks FROM anon;
REVOKE ALL ON public.automations FROM anon;
REVOKE ALL ON public.integration_connections FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;

-- Revoke all table-level privileges on leads, events, and recovery records
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.lead_events FROM anon;
REVOKE ALL ON public.lead_recovery_records FROM anon;

-- Grant INSERT ONLY on explicitly safe public enquiry columns to anon
-- Notice: score, temperature, status, assigned_to, notes, summary, do_not_call, deleted_at CANNOT be inserted by anon
GRANT INSERT (
  organization_id,
  business_id,
  campaign_id,
  name,
  phone,
  email,
  primary_interest,
  source
) ON public.leads TO anon;

GRANT INSERT (
  organization_id,
  lead_id,
  event_type,
  metadata
) ON public.lead_events TO anon;

GRANT INSERT (
  organization_id,
  visitor_session_id,
  phone,
  email,
  abandoned_url,
  activity_summary,
  dwell_time_seconds
) ON public.lead_recovery_records TO anon;

-- Grant read-only access to published catalog/page information for public visitors
REVOKE ALL ON public.businesses FROM anon;
GRANT SELECT (id, organization_id, name, tagline, description, address_line1, city, state, pincode, country, phone, email, website) ON public.businesses TO anon;

REVOKE ALL ON public.business_pages FROM anon;
GRANT SELECT (id, business_id, slug, title, meta_description, hero_headline, hero_subheadline, published, theme_config) ON public.business_pages TO anon;

REVOKE ALL ON public.products FROM anon;
GRANT SELECT (id, business_id, name, sku, description, category, price_amount, price_display, currency, is_active) ON public.products TO anon;

REVOKE ALL ON public.services FROM anon;
GRANT SELECT (id, business_id, name, description, category, pricing_model, is_active) ON public.services TO anon;
