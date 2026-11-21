import { Agent } from 'undici';
import { supabaseAdmin } from './supabase-server.js';

const vpsTlsAgent = new Agent({
  connect: { rejectUnauthorized: false },
});

const WG_KEY_RE = /^[A-Za-z0-9+/]{43}=$/;

export function isValidWgPublicKey(key) {
  return typeof key === 'string' && WG_KEY_RE.test(key.trim());
}

export function normalizeProvisionerUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function maskVpsHub(hub) {
  if (!hub) return null;
  const secret = String(hub.api_secret || '');
  const masked = secret.length > 8
    ? `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`
    : (secret ? '••••••••' : '');
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
    wg_subnet: hub.wg_subnet || '10.100.0.0/24',
    port_range_start: Number(hub.port_range_start) || 8443,
    port_range_end: Number(hub.port_range_end) || 8999,
    is_active: hub.is_active !== false,
    is_default: Boolean(hub.is_default),
    status: hub.status || 'unknown',
    last_health_at: hub.last_health_at || null,
    created_at: hub.created_at || null,
    updated_at: hub.updated_at || null,
  };
}

/**
 * Pure conflict-free slot allocator for (wg_tunnel_ip, external_port) on a VPS hub.
 */
export function computeFreeRouterSlot(hub, existingRouters = []) {
  const subnet = String(hub?.wg_subnet || '10.100.0.0/24').split('/')[0];
  const parts = subnet.split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid WireGuard subnet "${hub?.wg_subnet}" on VPS hub`);
  }
  const prefix = parts.slice(0, 3).join('.');
  const portStart = Number(hub?.port_range_start) || 8443;
  const portEnd = Number(hub?.port_range_end) || 8999;

  const relevant = (existingRouters || []).filter(
    (r) => r.vps_hub_id === hub.id || (hub.public_ip && r.ip_address === hub.public_ip)
  );
  const usedIps = new Set(relevant.map((r) => r.wg_tunnel_ip).filter(Boolean));
  const usedPorts = new Set(relevant.map((r) => Number(r.port)).filter((n) => Number.isInteger(n) && n > 0));

  let tunnelIp = null;
  for (let octet = 2; octet <= 254; octet++) {
    const candidate = `${prefix}.${octet}`;
    if (!usedIps.has(candidate)) {
      tunnelIp = candidate;
      break;
    }
  }
  if (!tunnelIp) {
    throw new Error(`No free WireGuard tunnel IPs left in ${hub.wg_subnet} on VPS hub "${hub.name}"`);
  }

  let externalPort = null;
  for (let port = portStart; port <= portEnd; port++) {
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
    external_port: externalPort,
    wg_port: Number(hub.wg_port) || 51820,
    wg_public_key: hub.wg_public_key || '',
    wg_subnet: hub.wg_subnet || '10.100.0.0/24',
  };
}

async function vpsRequest(hub, path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const baseUrl = normalizeProvisionerUrl(hub?.provisioner_url);
  if (!baseUrl) throw new Error('VPS hub provisioner_url is not configured');
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
    wgSubnet: data?.wgSubnet || hub.wg_subnet || '10.100.0.0/24',
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

export async function getDefaultOrSpecificVpsHub(vpsHubId = null) {
  if (vpsHubId) {
    const { data, error } = await supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .eq('id', vpsHubId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Selected VPS hub not found');
    return data;
  }

  const { data: hubs, error } = await supabaseAdmin
    .from('vps_hubs')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!hubs || hubs.length === 0) {
    throw new Error('No active VPS hub configured. Add a VPS hub in Locations & Fleet -> VPS Hubs first.');
  }
  return hubs[0];
}
