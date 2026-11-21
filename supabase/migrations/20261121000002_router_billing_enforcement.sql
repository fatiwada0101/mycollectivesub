-- ============================================================================
-- Migration: Optional Router Monthly Subscription Billing & Expiry-Pause Toggle
-- Idempotent (safe to re-apply). Global enforcement defaults to OFF.
-- ============================================================================

ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS subscription_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS billing_enforcement_override TEXT NOT NULL DEFAULT 'inherit';
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS expiry_paused_by_billing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS billing_notice_message TEXT;

CREATE INDEX IF NOT EXISTS idx_routers_subscription_status ON public.routers(subscription_status, expiry_paused_by_billing);
