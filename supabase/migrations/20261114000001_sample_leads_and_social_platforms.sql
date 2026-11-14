-- =====================================================================
-- VOICENEXUS AI — SAMPLE LEADS & MULTI-CHANNEL SOCIAL PLATFORMS
-- Migration: 20261114000001_sample_leads_and_social_platforms.sql
-- Description: Adds is_test_contact flag and partial unique index on leads
-- to safely isolate simulated test contacts from real customer leads.
-- Documents 13-channel social media schema for business profiles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ADD IS_TEST_CONTACT TO LEADS
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'leads' 
      AND column_name = 'is_test_contact'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN is_test_contact BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN public.leads.is_test_contact IS 'Flag identifying simulated sample/test leads created for demonstration or validation.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. CREATE PERFORMANCE AND PARTIAL UNIQUE INDEXES
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_leads_is_test_contact ON public.leads(is_test_contact);

-- Partial index ensuring real inbound contacts maintain uniqueness per organization,
-- while multiple sample leads can safely share a single verified telephony testing number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_org_phone_genuine 
  ON public.leads(organization_id, phone) 
  WHERE (is_test_contact = FALSE AND phone IS NOT NULL);

-- ---------------------------------------------------------------------
-- 3. SOCIAL MEDIA CHANNELS SCHEMA DOCUMENTATION
-- ---------------------------------------------------------------------
-- Business profiles store verified and active social channel URLs in:
-- businesses.theme_config->'social_links'
--
-- Supported 13 Channels:
--   1.  whatsapp   (wa.me / api.whatsapp.com)
--   2.  instagram  (instagram.com)
--   3.  facebook   (facebook.com / fb.com)
--   4.  telegram   (t.me / telegram.me)
--   5.  twitter    (twitter.com / x.com)
--   6.  snapchat   (snapchat.com)
--   7.  youtube    (youtube.com / youtu.be)
--   8.  linkedin   (linkedin.com)
--   9.  threads    (threads.net)
--   10. pinterest  (pinterest.com)
--   11. tiktok     (tiktok.com)
--   12. github     (github.com)
--   13. discord    (discord.gg / discord.com)
-- =====================================================================
