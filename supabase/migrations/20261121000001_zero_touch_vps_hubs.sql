-- ============================================================================
-- Migration: Zero-Touch Multi-VPS WireGuard Hubs & Router Auto-Onboarding
-- Idempotent (safe to re-apply multiple times). Strict RLS enabled.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vps_hubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  public_ip TEXT NOT NULL DEFAULT '',
  provisioner_url TEXT NOT NULL DEFAULT '',
  api_secret TEXT NOT NULL DEFAULT '',
  wg_interface TEXT NOT NULL DEFAULT 'wg0',
  wg_port INTEGER NOT NULL DEFAULT 51820,
  wg_public_key TEXT,
  wg_subnet TEXT NOT NULL DEFAULT '10.100.0.0/24',
  port_range_start INTEGER NOT NULL DEFAULT 8443,
  port_range_end INTEGER NOT NULL DEFAULT 8999,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_health_at TIMESTAMPTZ,
  bootstrap_token_hash TEXT,
  bootstrap_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vps_hubs ADD COLUMN IF NOT EXISTS bootstrap_token_hash TEXT;
ALTER TABLE public.vps_hubs ADD COLUMN IF NOT EXISTS bootstrap_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vps_hubs_active ON public.vps_hubs(is_active, is_default);
CREATE INDEX IF NOT EXISTS idx_vps_hubs_bootstrap_hash ON public.vps_hubs(bootstrap_token_hash) WHERE bootstrap_token_hash IS NOT NULL;

-- Strict Row Level Security: VPS api_secret must NEVER be readable by anon or authenticated clients
ALTER TABLE public.vps_hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_vps_hubs" ON public.vps_hubs;
CREATE POLICY "service_role_all_vps_hubs"
  ON public.vps_hubs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.vps_hubs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vps_hubs TO service_role;

-- Extend public.routers with zero-touch tunnel & enrollment metadata
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS vps_hub_id UUID REFERENCES public.vps_hubs(id) ON DELETE SET NULL;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS wg_tunnel_ip TEXT;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS wg_public_key TEXT;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS bootstrap_token_hash TEXT;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS bootstrap_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_routers_vps_hub ON public.routers(vps_hub_id);
CREATE INDEX IF NOT EXISTS idx_routers_bootstrap_hash ON public.routers(bootstrap_token_hash) WHERE bootstrap_token_hash IS NOT NULL;

-- Atomic, race-condition-safe slot allocator for (wg_tunnel_ip, external_port) on a VPS hub
CREATE OR REPLACE FUNCTION public.allocate_vps_router_slot(p_vps_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hub public.vps_hubs%ROWTYPE;
  v_prefix TEXT;
  v_host_octet INTEGER;
  v_port_iter INTEGER;
  v_candidate_ip TEXT;
  v_selected_ip TEXT := NULL;
  v_selected_port INTEGER := NULL;
  v_used_ips TEXT[];
  v_used_ports INTEGER[];
BEGIN
  SELECT * INTO v_hub FROM public.vps_hubs WHERE id = p_vps_hub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VPS hub not found';
  END IF;

  -- Extract /24 prefix (e.g. '10.100.0' from '10.100.0.0/24')
  v_prefix := regexp_replace(split_part(v_hub.wg_subnet, '/', 1), '\.\d+$', '');

  SELECT
    COALESCE(array_agg(wg_tunnel_ip) FILTER (WHERE wg_tunnel_ip IS NOT NULL), ARRAY[]::TEXT[]),
    COALESCE(array_agg(port) FILTER (WHERE port IS NOT NULL), ARRAY[]::INTEGER[])
  INTO v_used_ips, v_used_ports
  FROM public.routers
  WHERE vps_hub_id = p_vps_hub_id OR ip_address = v_hub.public_ip;

  -- Pick lowest free tunnel IP (.2 .. .254; .1 is the VPS hub itself)
  FOR v_host_octet IN 2..254 LOOP
    v_candidate_ip := v_prefix || '.' || v_host_octet::TEXT;
    IF NOT (v_candidate_ip = ANY(v_used_ips)) THEN
      v_selected_ip := v_candidate_ip;
      EXIT;
    END IF;
  END LOOP;

  IF v_selected_ip IS NULL THEN
    RAISE EXCEPTION 'No free WireGuard tunnel IPs left on VPS hub %', v_hub.name;
  END IF;

  -- Pick lowest free external forwarding port
  FOR v_port_iter IN v_hub.port_range_start..v_hub.port_range_end LOOP
    IF NOT (v_port_iter = ANY(v_used_ports)) THEN
      v_selected_port := v_port_iter;
      EXIT;
    END IF;
  END LOOP;

  IF v_selected_port IS NULL THEN
    RAISE EXCEPTION 'No free external ports left on VPS hub %', v_hub.name;
  END IF;

  RETURN jsonb_build_object(
    'vps_hub_id', v_hub.id,
    'public_ip', v_hub.public_ip,
    'wg_tunnel_ip', v_selected_ip,
    'external_port', v_selected_port,
    'wg_port', v_hub.wg_port,
    'wg_public_key', v_hub.wg_public_key,
    'wg_subnet', v_hub.wg_subnet
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_vps_router_slot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_vps_router_slot(UUID) TO service_role;
