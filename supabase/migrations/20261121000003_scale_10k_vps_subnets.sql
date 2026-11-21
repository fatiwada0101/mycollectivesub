-- ============================================================================
-- Migration: Scale VPS Hubs to 1,000+ Routers per VPS (/16 default) &
--            10,000+ Fleet Capacity via Multi-VPS Auto-Overflow
-- Idempotent (safe to re-apply multiple times).
-- ============================================================================

-- 1. Expand defaults for newly enrolled VPS hubs:
--    - /16 WireGuard subnet (65,023 clean usable tunnel IPs per VPS)
--    - 10,000 forwarding ports (8443-18442, automatically skipping reserved port 9443)
--    - max_routers soft cap (default 1000 per KVM 1; triggers auto-overflow to Hub #2/#3...)
ALTER TABLE public.vps_hubs
  ADD COLUMN IF NOT EXISTS max_routers INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE public.vps_hubs
  ALTER COLUMN wg_subnet SET DEFAULT '10.100.0.0/16';

ALTER TABLE public.vps_hubs
  ALTER COLUMN port_range_end SET DEFAULT 18442;

-- 2. Replace allocate_vps_router_slot with full CIDR-aware IPv4 allocator
--    Supports /16, /20, /24 (and any valid IPv4 CIDR /16../29), skips hub gateway (.1),
--    skips .0/.255 last octets on wider-than-/24 subnets, and protects reserved ports (9443, 51820, 443, 80, 22).
CREATE OR REPLACE FUNCTION public.allocate_vps_router_slot(p_vps_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hub public.vps_hubs%ROWTYPE;
  v_cidr CIDR;
  v_prefix_len INTEGER;
  v_base_ip INET;
  v_max_offset BIGINT;
  v_selected_ip TEXT := NULL;
  v_selected_port INTEGER := NULL;
  v_used_ips TEXT[];
  v_used_ports INTEGER[];
BEGIN
  SELECT * INTO v_hub FROM public.vps_hubs WHERE id = p_vps_hub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VPS hub not found';
  END IF;

  v_cidr := COALESCE(NULLIF(trim(v_hub.wg_subnet), ''), '10.100.0.0/16')::CIDR;
  v_prefix_len := masklen(v_cidr);
  IF v_prefix_len < 16 OR v_prefix_len > 29 THEN
    RAISE EXCEPTION 'Unsupported WireGuard CIDR prefix /% on VPS hub % (supported: /16 to /29)', v_prefix_len, v_hub.name;
  END IF;

  v_base_ip := host(network(v_cidr))::INET;
  v_max_offset := (1::BIGINT << (32 - v_prefix_len)) - 2;

  SELECT
    COALESCE(array_agg(wg_tunnel_ip) FILTER (WHERE wg_tunnel_ip IS NOT NULL), ARRAY[]::TEXT[]),
    COALESCE(array_agg(port) FILTER (WHERE port IS NOT NULL), ARRAY[]::INTEGER[])
  INTO v_used_ips, v_used_ports
  FROM public.routers
  WHERE vps_hub_id = p_vps_hub_id
     OR (v_hub.public_ip IS NOT NULL AND v_hub.public_ip <> '' AND ip_address = v_hub.public_ip);

  -- Pick lowest free tunnel IP (offset 0 = network, offset 1 = VPS hub gateway)
  -- For subnets wider than /24 (e.g. /16, /20), skip .0 and .255 host octets for clean cross-vendor compatibility.
  SELECT host(v_base_ip + gs)
  INTO v_selected_ip
  FROM generate_series(2::BIGINT, LEAST(v_max_offset, 65534::BIGINT)) AS gs
  WHERE (v_prefix_len >= 24 OR split_part(host(v_base_ip + gs), '.', 4)::INTEGER NOT IN (0, 255))
    AND NOT (host(v_base_ip + gs) = ANY(v_used_ips))
  LIMIT 1;

  IF v_selected_ip IS NULL THEN
    RAISE EXCEPTION 'No free WireGuard tunnel IPs left in % on VPS hub %', v_hub.wg_subnet, v_hub.name;
  END IF;

  -- Pick lowest free external forwarding port, permanently protecting VPS system/provisioner ports
  SELECT gs
  INTO v_selected_port
  FROM generate_series(v_hub.port_range_start, v_hub.port_range_end) AS gs
  WHERE gs NOT IN (22, 80, 443, 9443, COALESCE(v_hub.wg_port, 51820))
    AND NOT (gs = ANY(v_used_ports))
  LIMIT 1;

  IF v_selected_port IS NULL THEN
    RAISE EXCEPTION 'No free external ports (%-%) left on VPS hub %', v_hub.port_range_start, v_hub.port_range_end, v_hub.name;
  END IF;

  RETURN jsonb_build_object(
    'vps_hub_id', v_hub.id,
    'public_ip', v_hub.public_ip,
    'wg_tunnel_ip', v_selected_ip,
    'wg_prefix_len', v_prefix_len,
    'wg_gateway_ip', host(v_base_ip + 1),
    'external_port', v_selected_port,
    'wg_port', v_hub.wg_port,
    'wg_public_key', v_hub.wg_public_key,
    'wg_subnet', v_hub.wg_subnet,
    'max_routers', COALESCE(v_hub.max_routers, 1000)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_vps_router_slot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_vps_router_slot(UUID) TO service_role;
