import { Agent } from 'undici';
import { supabaseAdmin } from './supabase-server.js';

const vpsTlsAgent = new Agent({
  connect: { rejectUnauthorized: false },
});

const WG_KEY_RE = /^[A-Za-z0-9+/]{43}=$/;

export const DEFAULT_WG_SUBNET = '10.100.0.0/16';
export const DEFAULT_PORT_RANGE_START = 8443;
export const DEFAULT_PORT_RANGE_END = 18442;
export const DEFAULT_MAX_ROUTERS_PER_HUB = 1000;
export const RESERVED_VPS_PORTS = new Set([22, 80, 443, 9443]);

export function isValidWgPublicKey(key) {
  return typeof key === 'string' && WG_KEY_RE.test(key.trim());
}

export function normalizeProvisionerUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * SSRF guard for VPS Provisioner URLs: allows only public http/https endpoints
 * and blocks loopback, link-local/cloud metadata (169.254.169.254), and RFC1918 IPs.
 */
export function assertSafePublicProvisionerUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) throw new Error('VPS hub provisioner_url is required');

  // Reject any explicit non-HTTP(S) scheme BEFORE auto-prepending https://
  if (
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) ||
    /^(?:file|javascript|data|ftp|gopher|dict|ldap):/i.test(raw)
  ) {
    throw new Error('VPS provisioner_url must use https:// or http://');
  }

  const normalized = normalizeProvisionerUrl(raw);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Invalid VPS provisioner_url');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('VPS provisioner_url must use https:// or http://');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::') {
    throw new Error('VPS provisioner_url cannot target localhost or local addresses');
  }

  // Reject single-label internal hostnames (e.g. "metadata", "redis", "internal")
  if (!host.includes('.') && !host.includes(':')) {
    throw new Error(`VPS provisioner_url must use a public IP or fully-qualified domain name (${host})`);
  }

  // Block IPv6 link-local / unique-local
  if (host.includes(':')) {
    if (/^(fe[89ab]|fc|fd|::ffff:127\.|::ffff:10\.|::ffff:169\.254\.|::ffff:192\.168\.|::ffff:172\.(1[6-9]|2\d|3[01])\.)/i.test(host)) {
      throw new Error('VPS provisioner_url cannot target private or link-local IPv6 addresses');
    }
    return normalized;
  }

  // Block private / loopback / metadata IPv4 ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    const blocked =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (blocked) {
      throw new Error(`VPS provisioner_url cannot target private, loopback, or metadata IP (${host})`);
    }
  }

  return normalized;
}

export function ipv4ToInt(ip) {
  const parts = String(ip || '').trim().split('.');
  if (parts.length !== 4) throw new Error(`Invalid IPv4 address "${ip}"`);
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid IPv4 octet "${part}" in "${ip}"`);
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`Invalid IPv4 octet "${part}" in "${ip}"`);
    }
    value = ((value << 8) | n) >>> 0;
  }
  return value >>> 0;
}

export function intToIpv4(num) {
  const n = num >>> 0;
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

/**
 * Parses an IPv4 CIDR string (e.g. "10.100.0.0/16" or "10.100.0.0/24").
 * Supports /16 through /29.
 */
export function parseCidrSubnet(rawCidr = DEFAULT_WG_SUBNET) {
  const text = String(rawCidr || DEFAULT_WG_SUBNET).trim();
  const [ipPart, maskPart] = text.split('/');
  const prefixLen = maskPart === undefined ? 16 : Number(maskPart);
  if (!Number.isInteger(prefixLen) || prefixLen < 16 || prefixLen > 29) {
    throw new Error(`Unsupported WireGuard CIDR "${rawCidr}" (supported: /16 to /29)`);
  }
  const rawInt = ipv4ToInt(ipPart);
  const hostBits = 32 - prefixLen;
  const mask = hostBits === 32 ? 0 : ((0xffffffff << hostBits) >>> 0);
  const networkInt = (rawInt & mask) >>> 0;
  const totalBlockSize = 2 ** hostBits;
  const maxHostOffset = totalBlockSize - 2; // excludes network (0) and broadcast (size - 1)
  // Offset 1 is always reserved for the VPS hub gateway (e.g. 10.100.0.1).
  // For subnets wider than /24 (/16, /20, etc.), we also skip .0 and .255 last octets
  // so every assigned tunnel IP is universally clean across all MikroTik / firewall setups.
  let totalUsableHosts;
  if (prefixLen >= 24) {
    totalUsableHosts = Math.max(0, maxHostOffset - 1);
  } else {
    const numSlash24Blocks = 2 ** (24 - prefixLen);
    // First /24 has 253 router slots (.2..254); each subsequent /24 has 254 slots (.1..254)
    totalUsableHosts = 253 + (numSlash24Blocks - 1) * 254;
  }

  const networkIp = intToIpv4(networkInt);
  const gatewayIp = intToIpv4((networkInt + 1) >>> 0);
  return {
    cidr: `${networkIp}/${prefixLen}`,
    networkInt,
    networkIp,
    prefixLen,
    gatewayIp,
    gatewayCidr: `${gatewayIp}/${prefixLen}`,
    maxHostOffset,
    totalUsableHosts,
  };
}

export function getHubCidrMask(wgSubnet = DEFAULT_WG_SUBNET) {
  try {
    return parseCidrSubnet(wgSubnet).prefixLen;
  } catch {
    return 16;
  }
}

export function getHubGatewayIp(wgSubnet = DEFAULT_WG_SUBNET) {
  try {
    return parseCidrSubnet(wgSubnet).gatewayIp;
  } catch {
    return '10.100.0.1';
  }
}

export function getHubGatewayCidr(wgSubnet = DEFAULT_WG_SUBNET) {
  try {
    return parseCidrSubnet(wgSubnet).gatewayCidr;
  } catch {
    return '10.100.0.1/16';
  }
}

export function countUsablePorts(portStart = DEFAULT_PORT_RANGE_START, portEnd = DEFAULT_PORT_RANGE_END, wgPort = 51820) {
  const start = Number(portStart) || DEFAULT_PORT_RANGE_START;
  const end = Number(portEnd) || DEFAULT_PORT_RANGE_END;
  if (end < start) return 0;
  let count = end - start + 1;
  const reserved = new Set([...RESERVED_VPS_PORTS, Number(wgPort) || 51820]);
  for (const p of reserved) {
    if (p >= start && p <= end) count -= 1;
  }
  return Math.max(0, count);
}

export function getHubCapacityMetrics(hub, routerCount = 0) {
  const wgSubnet = hub?.wg_subnet || DEFAULT_WG_SUBNET;
  let subnetCapacity = 65023;
  let prefixLen = 16;
  try {
    const parsed = parseCidrSubnet(wgSubnet);
    subnetCapacity = parsed.totalUsableHosts;
    prefixLen = parsed.prefixLen;
  } catch {}

  const portCapacity = countUsablePorts(
    hub?.port_range_start ?? DEFAULT_PORT_RANGE_START,
    hub?.port_range_end ?? DEFAULT_PORT_RANGE_END,
    hub?.wg_port ?? 51820
  );
  const maxRouters = Math.max(1, Number(hub?.max_routers) || DEFAULT_MAX_ROUTERS_PER_HUB);
  const hardwareHardLimit = Math.min(subnetCapacity, portCapacity);
  const effectiveCapacity = Math.min(maxRouters, hardwareHardLimit);
  const used = Math.max(0, Number(routerCount) || 0);
  const remaining = Math.max(0, effectiveCapacity - used);

  return {
    wg_prefix_len: prefixLen,
    subnet_capacity: subnetCapacity,
    port_capacity: portCapacity,
    max_routers: maxRouters,
    effective_capacity: effectiveCapacity,
    router_count: used,
    remaining_slots: remaining,
    utilization_pct: effectiveCapacity > 0 ? Math.min(100, Math.round((used / effectiveCapacity) * 100)) : 100,
    is_full: remaining <= 0,
  };
}

/**
 * Automatically picks the next unused non-overlapping /16 WireGuard subnet
 * (10.100.0.0/16, 10.101.0.0/16, ..., 10.254.0.0/16) so adding 10+ VPS hubs
 * to scale past 10,000+ routers requires zero manual IP planning.
 */
export function suggestNextVpsSubnet(existingHubs = []) {
  const usedSecondOctets = new Set();
  for (const hub of existingHubs || []) {
    const ipPart = String(hub?.wg_subnet || '').split('/')[0];
    const parts = ipPart.split('.');
    if (parts.length === 4 && parts[0] === '10') {
      const oct2 = Number(parts[1]);
      if (Number.isInteger(oct2)) usedSecondOctets.add(oct2);
    }
  }
  for (let oct2 = 100; oct2 <= 254; oct2++) {
    if (!usedSecondOctets.has(oct2)) {
      return `10.${oct2}.0.0/16`;
    }
  }
  return '10.200.0.0/16';
}

export function maskVpsHub(hub, routerCount = null) {
  if (!hub) return null;
  const secret = String(hub.api_secret || '');
  const masked = secret.length > 8
    ? `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`
    : (secret ? '••••••••' : '');
  const resolvedCount = routerCount !== null ? Number(routerCount) : Number(hub.router_count || 0);
  const capacity = getHubCapacityMetrics(hub, resolvedCount);
  return {
    id: hub.id,
    name: hub.name,
    public_ip: hub.public_ip,
    provisioner_url: hub.provisioner_url,
    has_secret: Boolean(secret),
    api_secret_masked: masked,
    wg_interface: hub.wg_interface || 'wg0',
    wg_port: Number(hub.wg_port) || 51820,
    wg_public_key: hub.wg_public_key || '',
    wg_subnet: hub.wg_subnet || DEFAULT_WG_SUBNET,
    port_range_start: Number(hub.port_range_start) || DEFAULT_PORT_RANGE_START,
    port_range_end: Number(hub.port_range_end) || DEFAULT_PORT_RANGE_END,
    max_routers: capacity.max_routers,
    router_count: capacity.router_count,
    subnet_capacity: capacity.subnet_capacity,
    port_capacity: capacity.port_capacity,
    effective_capacity: capacity.effective_capacity,
    remaining_slots: capacity.remaining_slots,
    utilization_pct: capacity.utilization_pct,
    is_full: capacity.is_full,
    is_active: hub.is_active !== false,
    is_default: Boolean(hub.is_default),
    status: hub.status || 'unknown',
    last_health_at: hub.last_health_at || null,
    created_at: hub.created_at || null,
    updated_at: hub.updated_at || null,
  };
}

/**
 * Pure conflict-free CIDR-aware slot allocator for (wg_tunnel_ip, external_port) on a VPS hub.
 * Supports /16 (65,023 routers), /20 (4,063 routers), /24 (253 routers), etc.,
 * skips hub gateway (.1), skips .0/.255 last octets on wider-than-/24 subnets,
 * and permanently protects reserved VPS ports (22, 80, 443, 9443, wg_port).
 */
export function computeFreeRouterSlot(hub, existingRouters = []) {
  const parsed = parseCidrSubnet(hub?.wg_subnet || DEFAULT_WG_SUBNET);
  const portStart = Number(hub?.port_range_start) || DEFAULT_PORT_RANGE_START;
  const portEnd = Number(hub?.port_range_end) || DEFAULT_PORT_RANGE_END;
  const wgPort = Number(hub?.wg_port) || 51820;

  const relevant = (existingRouters || []).filter(
    (r) => r.vps_hub_id === hub.id || (hub.public_ip && r.ip_address === hub.public_ip)
  );
  const usedIps = new Set(relevant.map((r) => r.wg_tunnel_ip).filter(Boolean));
  const usedPorts = new Set(relevant.map((r) => Number(r.port)).filter((n) => Number.isInteger(n) && n > 0));

  let tunnelIp = null;
  for (let offset = 2; offset <= parsed.maxHostOffset; offset++) {
    const candidateInt = (parsed.networkInt + offset) >>> 0;
    const lastOctet = candidateInt & 255;
    if (parsed.prefixLen < 24 && (lastOctet === 0 || lastOctet === 255)) {
      continue;
    }
    const candidate = intToIpv4(candidateInt);
    if (!usedIps.has(candidate)) {
      tunnelIp = candidate;
      break;
    }
  }
  if (!tunnelIp) {
    throw new Error(`No free WireGuard tunnel IPs left in ${parsed.cidr} on VPS hub "${hub.name}"`);
  }

  let externalPort = null;
  for (let port = portStart; port <= portEnd; port++) {
    if (RESERVED_VPS_PORTS.has(port) || port === wgPort) continue;
    if (!usedPorts.has(port)) {
      externalPort = port;
      break;
    }
  }
  if (!externalPort) {
    throw new Error(`No free external ports (${portStart}-${portEnd}) left on VPS hub "${hub.name}"`);
  }

  return {
    vps_hub_id: hub.id,
    public_ip: hub.public_ip,
    wg_tunnel_ip: tunnelIp,
    wg_prefix_len: parsed.prefixLen,
    wg_gateway_ip: parsed.gatewayIp,
    external_port: externalPort,
    wg_port: wgPort,
    wg_public_key: hub.wg_public_key || '',
    wg_subnet: parsed.cidr,
    max_routers: Math.max(1, Number(hub?.max_routers) || DEFAULT_MAX_ROUTERS_PER_HUB),
  };
}

/**
 * Pure multi-VPS auto-scaling hub selector.
 * Picks the preferred/default hub if it has free capacity (< max_routers and free subnet/port slots).
 * If that hub is full and `allowOverflow` is true, automatically overflows to the least-loaded
 * active VPS hub with remaining capacity (preferring online hubs), enabling effortless 10,000+ scaling.
 */
export function selectHubForRouter(hubs = [], existingRouters = [], { preferredHubId = null, allowOverflow = true } = {}) {
  const activeHubs = (hubs || []).filter((h) => h && h.is_active !== false);
  if (activeHubs.length === 0) {
    throw new Error('No active VPS hub configured. Add a VPS hub in Locations & Fleet -> VPS Hubs first.');
  }

  const annotated = activeHubs.map((hub) => {
    const count = (existingRouters || []).filter(
      (r) => r.vps_hub_id === hub.id || (!r.vps_hub_id && hub.public_ip && r.ip_address === hub.public_ip)
    ).length;
    const metrics = getHubCapacityMetrics(hub, count);
    return { hub, metrics };
  });

  if (preferredHubId) {
    const preferred = annotated.find((item) => item.hub.id === preferredHubId);
    if (!preferred) {
      throw new Error('Selected VPS hub not found or inactive');
    }
    if (!preferred.metrics.is_full) {
      return { hub: preferred.hub, metrics: preferred.metrics, overflowedFrom: null };
    }
    if (!allowOverflow) {
      throw new Error(
        `VPS hub "${preferred.hub.name}" is at capacity (${preferred.metrics.router_count}/${preferred.metrics.effective_capacity} routers). Add another VPS hub or increase max_routers.`
      );
    }
  }

  // Filter hubs that still have capacity
  const available = annotated.filter((item) => !item.metrics.is_full);
  if (available.length === 0) {
    const totalCap = annotated.reduce((sum, item) => sum + item.metrics.effective_capacity, 0);
    throw new Error(
      `All ${annotated.length} active VPS hub(s) are at full capacity (${totalCap} routers). Add another VPS hub in Locations & Fleet -> VPS Hubs to automatically scale higher.`
    );
  }

  // Prefer: online status first -> default hub (only if not overflowing away from a full default) -> least loaded -> oldest
  available.sort((a, b) => {
    const aOnline = a.hub.status === 'online' ? 0 : 1;
    const bOnline = b.hub.status === 'online' ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;

    if (!preferredHubId) {
      const aDef = a.hub.is_default ? 0 : 1;
      const bDef = b.hub.is_default ? 0 : 1;
      if (aDef !== bDef) return aDef - bDef;
    }

    if (a.metrics.router_count !== b.metrics.router_count) {
      return a.metrics.router_count - b.metrics.router_count;
    }
    return String(a.hub.created_at || '').localeCompare(String(b.hub.created_at || ''));
  });

  const chosen = available[0];
  const overflowSource = preferredHubId
    ? annotated.find((item) => item.hub.id === preferredHubId)?.hub || null
    : (annotated.find((item) => item.hub.is_default && item.metrics.is_full)?.hub || null);

  return {
    hub: chosen.hub,
    metrics: chosen.metrics,
    overflowedFrom: overflowSource && overflowSource.id !== chosen.hub.id ? overflowSource : null,
  };
}

async function vpsRequest(hub, path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const baseUrl = assertSafePublicProvisionerUrl(hub?.provisioner_url);
  if (!hub?.api_secret) throw new Error('VPS hub api_secret is not configured');

  const url = `${baseUrl}${path}`;
  const isHttps = url.startsWith('https://');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${hub.api_secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    dispatcher: isHttps ? vpsTlsAgent : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json?.error || `VPS Provisioner HTTP ${res.status}`);
  }
  return json;
}

export async function testVpsHubConnection(hub) {
  const start = Date.now();
  const data = await vpsRequest(hub, '/health', { method: 'GET', timeoutMs: 7000 });
  return {
    ok: Boolean(data?.ok || data?.success),
    latencyMs: Date.now() - start,
    publicIp: data?.publicIp || hub.public_ip || null,
    wgInterface: data?.wgInterface || hub.wg_interface || 'wg0',
    wgPort: Number(data?.wgPort) || Number(hub.wg_port) || 51820,
    wgSubnet: data?.wgSubnet || hub.wg_subnet || DEFAULT_WG_SUBNET,
    wgPublicKey: data?.wgPublicKey || hub.wg_public_key || '',
    peerCount: Number(data?.peerCount) || 0,
    uptimeSec: Number(data?.uptimeSec) || 0,
    dryRun: Boolean(data?.dryRun),
  };
}

export async function allocateRouterSlotForHub(hub) {
  try {
    const { data, error } = await supabaseAdmin.rpc('allocate_vps_router_slot', {
      p_vps_hub_id: hub.id,
    });
    if (!error && data && data.wg_tunnel_ip && data.external_port) {
      return data;
    }
  } catch {}

  const { data: existingRouters } = await supabaseAdmin
    .from('routers')
    .select('id, ip_address, port, vps_hub_id, wg_tunnel_ip');

  return computeFreeRouterSlot(hub, existingRouters || []);
}

export async function registerRouterPeerOnVps(hub, { publicKey, tunnelIp, externalPort, targetPort = 443, routerName = '' }) {
  if (!isValidWgPublicKey(publicKey)) {
    throw new Error('Invalid router WireGuard public key');
  }
  return vpsRequest(hub, '/api/peers/register', {
    method: 'POST',
    body: {
      publicKey: publicKey.trim(),
      tunnelIp,
      externalPort: Number(externalPort),
      targetPort: Number(targetPort) || 443,
      routerName,
    },
    timeoutMs: 10000,
  });
}

export async function removeRouterPeerFromVps(hub, { publicKey, tunnelIp, externalPort, targetPort = 443 }) {
  if (!isValidWgPublicKey(publicKey)) return { success: false, skipped: true };
  return vpsRequest(hub, '/api/peers/remove', {
    method: 'POST',
    body: {
      publicKey: publicKey.trim(),
      tunnelIp,
      externalPort: Number(externalPort),
      targetPort: Number(targetPort) || 443,
    },
    timeoutMs: 8000,
  });
}

export async function selectVpsHubWithCapacity(preferredHubId = null, { allowOverflow = true } = {}) {
  const [{ data: hubs, error: hubsErr }, { data: routers, error: routersErr }] = await Promise.all([
    supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('routers')
      .select('id, ip_address, vps_hub_id'),
  ]);

  if (hubsErr) throw hubsErr;
  if (routersErr) throw routersErr;

  return selectHubForRouter(hubs || [], routers || [], { preferredHubId, allowOverflow });
}

export async function getDefaultOrSpecificVpsHub(vpsHubId = null) {
  const { hub } = await selectVpsHubWithCapacity(vpsHubId, { allowOverflow: true });
  return hub;
}

/**
 * Automatically attaches any routers staged with `vps_hub_id IS NULL` (awaiting a VPS Hub)
 * onto the given active VPS Hub: allocates conflict-free tunnel IPs/ports, registers WireGuard peers
 * if `wg_public_key` is already reported, and updates Supabase so their 60s watchdog auto-connects.
 */
export async function attachAwaitingRoutersToHub(hub) {
  if (!hub?.id || !hub?.public_ip) return { attached: 0, staged: 0 };

  const { data: awaiting, error } = await supabaseAdmin
    .from('routers')
    .select('id, name, wg_public_key, onboarding_status')
    .is('vps_hub_id', null)
    .in('onboarding_status', ['awaiting_vps', 'pending_bootstrap']);

  if (error || !Array.isArray(awaiting) || awaiting.length === 0) {
    return { attached: 0, staged: 0 };
  }

  let attached = 0;
  let staged = 0;
  for (const r of awaiting) {
    try {
      const slot = await allocateRouterSlotForHub(hub);
      if (isValidWgPublicKey(r.wg_public_key)) {
        await registerRouterPeerOnVps(hub, {
          publicKey: r.wg_public_key,
          tunnelIp: slot.wg_tunnel_ip,
          externalPort: slot.external_port,
          targetPort: 443,
          routerName: r.name,
        });
        await supabaseAdmin
          .from('routers')
          .update({
            vps_hub_id: hub.id,
            ip_address: hub.public_ip,
            port: Number(slot.external_port),
            wg_tunnel_ip: slot.wg_tunnel_ip,
            onboarding_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        attached += 1;
      } else {
        await supabaseAdmin
          .from('routers')
          .update({
            vps_hub_id: hub.id,
            ip_address: hub.public_ip,
            port: Number(slot.external_port),
            wg_tunnel_ip: slot.wg_tunnel_ip,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id);
        staged += 1;
      }
    } catch {
      // Non-fatal per router (e.g., if hub hits capacity)
    }
  }

  return { attached, staged };
}
