import { NextResponse } from 'next/server.js';
import { Agent } from 'undici';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import {
  allocateRouterSlotForHub,
  registerRouterPeerOnVps,
  removeRouterPeerFromVps,
  testVpsHubConnection,
  isValidWgPublicKey,
  getHubGatewayIp,
  DEFAULT_WG_SUBNET,
} from '@/lib/vps-hub.js';
import { generateBootstrapToken } from '@/lib/zero-touch-onboarding.js';
import { logger } from '@/lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const routerTlsAgent = new Agent({ connect: { rejectUnauthorized: false } });

/**
 * Best-effort live instant cutover for a router whose OLD VPS is still online.
 * Schedules a 1-shot 2-second self-deleting RouterOS task that pulls `/api/onboarding/vps-sync`
 * directly on the router, atomically switching BOTH tunnel IP and WireGuard peer locally
 * without breaking mid-flight when the old tunnel drops.
 * If the old VPS is already unreachable, fails fast and the router's 60s watchdog takes over.
 */
async function tryLiveRouterCutover(router, targetHub, pollingSecret, baseUrl) {
  if (!router?.ip_address || !router?.port || router.connection_mode === 'polling' || !pollingSecret) {
    return false;
  }
  const isHttps = router.use_ssl !== false;
  const protocol = isHttps ? 'https' : 'http';
  const base = `${protocol}://${router.ip_address}:${router.port}/rest`;
  const auth = 'Basic ' + Buffer.from(`${router.username || 'admin'}:${router.password || ''}`).toString('base64');
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };
  const rawSubnet = targetHub.wg_subnet || DEFAULT_WG_SUBNET;
  const hubGw = getHubGatewayIp(rawSubnet);
  const syncUrl = `${baseUrl}/api/onboarding/vps-sync`;

  const mt = async (path, method = 'GET', body = undefined) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: isHttps ? routerTlsAgent : undefined,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  };

  try {
    // 1. Update an-watchdog-script first so future pings target the new hub gateway
    const scripts = await mt('/system/script');
    const wd = (Array.isArray(scripts) ? scripts : []).find((s) => s.name === 'an-watchdog-script');
    if (wd?.['.id']) {
      const wdSource = `:if ([/ping ${hubGw} count=2] = 0) do={ :do { /interface wireguard disable [find where name="wg-vps"]; :delay 2s; /interface wireguard enable [find where name="wg-vps"] } on-error={}; :do { :local wgK [/interface wireguard get [find where name="wg-vps"] public-key]; /tool fetch url="${syncUrl}" http-method=post http-header-field="Content-Type: application/json" http-data=("{\\"secret\\":\\"${pollingSecret}\\",\\"wg_public_key\\":\\"" . $wgK . "\\"}") mode=https check-certificate=no keep-result=no } on-error={}; :do { /tool fetch url="${syncUrl}?secret=${pollingSecret}" dst-path="mcs-vps-sync.rsc" mode=https check-certificate=no; /import mcs-vps-sync.rsc; /file remove mcs-vps-sync.rsc } on-error={} }`;
      await mt(`/system/script/${encodeURIComponent(wd['.id'])}`, 'PATCH', { source: wdSource });
    }

    // 2. Schedule an atomic 2s one-shot local cutover task that imports /api/onboarding/vps-sync and removes itself
    const scheds = await mt('/system/scheduler');
    const oldTask = (Array.isArray(scheds) ? scheds : []).find((s) => s.name === 'an-vps-cutover');
    if (oldTask?.['.id']) {
      await mt(`/system/scheduler/${encodeURIComponent(oldTask['.id'])}`, 'DELETE').catch(() => {});
    }
    const cutoverEvent = `:do { /tool fetch url="${syncUrl}?secret=${pollingSecret}" dst-path="mcs-vps-sync.rsc" mode=https check-certificate=no; /import mcs-vps-sync.rsc; /file remove mcs-vps-sync.rsc } on-error={}; :do { /system scheduler remove [find where name="an-vps-cutover"] } on-error={}`;
    await mt('/system/scheduler', 'PUT', {
      name: 'an-vps-cutover',
      interval: '2s',
      'on-event': cutoverEvent,
      policy: 'read,write,test',
      disabled: 'false',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/super-admin/vps-hubs/migrate
 *
 * 1-Click VPS Failover / Migration:
 * Moves all active routers (or routers from a specific expired VPS hub) onto a new
 * online target VPS Hub:
 *   1. Auto-assigns fresh conflict-free (wg_tunnel_ip, external_port) on the new VPS
 *   2. Registers each router's saved WireGuard public key on the new VPS via API (ZERO SSH!)
 *   3. Updates `public.routers` so every router's 60s self-healing watchdog automatically
 *      switches over to the new VPS within 60 seconds — even if the old VPS already died!
 */
export async function POST(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const targetHubId = String(body.target_vps_hub_id || '').trim();
    const sourceHubId = body.source_vps_hub_id ? String(body.source_vps_hub_id).trim() : null;

    if (!UUID_RE.test(targetHubId)) {
      return NextResponse.json({ success: false, error: 'Valid target_vps_hub_id UUID is required' }, { status: 400 });
    }
    if (sourceHubId && !UUID_RE.test(sourceHubId)) {
      return NextResponse.json({ success: false, error: 'Invalid source_vps_hub_id UUID' }, { status: 400 });
    }

    let { data: targetHub, error: hubErr } = await supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .eq('id', targetHubId)
      .maybeSingle();

    if (hubErr) throw hubErr;
    if (!targetHub) {
      return NextResponse.json({ success: false, error: 'Target VPS hub not found' }, { status: 404 });
    }

    // Ensure target VPS is online & has a valid WG public key persisted in DB for vps-sync failover
    if (!targetHub.wg_public_key || !targetHub.public_ip) {
      const health = await testVpsHubConnection(targetHub);
      if (!health.ok || !health.wgPublicKey) {
        return NextResponse.json({ success: false, error: 'Target VPS hub is not online yet' }, { status: 502 });
      }
      const resolvedPublicIp = health.publicIp || targetHub.public_ip;
      const resolvedSubnet = health.wgSubnet || targetHub.wg_subnet;
      await supabaseAdmin
        .from('vps_hubs')
        .update({
          wg_public_key: health.wgPublicKey,
          public_ip: resolvedPublicIp,
          wg_subnet: resolvedSubnet,
          status: 'online',
          last_health_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetHub.id);
      targetHub = {
        ...targetHub,
        wg_public_key: health.wgPublicKey,
        public_ip: resolvedPublicIp,
        wg_subnet: resolvedSubnet,
        status: 'online',
      };
    }

    let query = supabaseAdmin.from('routers').select('*').eq('is_active', true);
    if (sourceHubId) {
      query = query.eq('vps_hub_id', sourceHubId);
    } else {
      query = query.or(`vps_hub_id.is.null,vps_hub_id.neq.${targetHubId}`);
    }

    const { data: routersToMove, error: routersErr } = await query;
    if (routersErr) throw routersErr;

    const reqOrigin = new URL(request.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || reqOrigin).replace(/\/+$/, '');

    const results = [];
    for (const router of routersToMove || []) {
      let peerRegistered = false;
      let slot = null;
      try {
        slot = await allocateRouterSlotForHub(targetHub);

        if (isValidWgPublicKey(router.wg_public_key)) {
          await registerRouterPeerOnVps(targetHub, {
            publicKey: router.wg_public_key,
            tunnelIp: slot.wg_tunnel_ip,
            externalPort: slot.external_port,
            targetPort: 443,
            routerName: router.name,
          });
          peerRegistered = true;
        }

        const effectiveSecret = router.polling_secret || generateBootstrapToken().slice(0, 48);

        const { error: updErr } = await supabaseAdmin
          .from('routers')
          .update({
            vps_hub_id: targetHub.id,
            ip_address: targetHub.public_ip,
            port: Number(slot.external_port),
            wg_tunnel_ip: slot.wg_tunnel_ip,
            ...(router.polling_secret ? {} : { polling_secret: effectiveSecret }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', router.id);

        if (updErr) {
          if (peerRegistered) {
            await removeRouterPeerFromVps(targetHub, {
              publicKey: router.wg_public_key,
              tunnelIp: slot.wg_tunnel_ip,
              externalPort: slot.external_port,
              targetPort: 443,
            }).catch(() => {});
          }
          throw updErr;
        }

        // If the old VPS is still alive, trigger an atomic 2s local cutover directly on the router!
        const liveSwitched = peerRegistered
          ? await tryLiveRouterCutover(router, targetHub, effectiveSecret, baseUrl)
          : false;

        results.push({
          router_id: router.id,
          name: router.name,
          success: true,
          wg_tunnel_ip: slot.wg_tunnel_ip,
          external_port: Number(slot.external_port),
          peer_registered: peerRegistered,
          live_switched: liveSwitched,
          note: liveSwitched
            ? 'Switched live to the new VPS immediately.'
            : peerRegistered
              ? 'Registered on new VPS; router watchdog will switch over automatically within 60s.'
              : 'Assigned slot on new VPS; router watchdog will self-register its key & switch over within 60s.',
        });
      } catch (rErr) {
        results.push({
          router_id: router.id,
          name: router.name,
          success: false,
          error: rErr.message,
        });
      }
    }

    const migratedCount = results.filter((r) => r.success).length;

    // Only promote targetHub to default if there were no routers to move OR at least one succeeded
    if ((routersToMove || []).length === 0 || migratedCount > 0) {
      await supabaseAdmin.from('vps_hubs').update({ is_default: false }).neq('id', targetHub.id);
      await supabaseAdmin.from('vps_hubs').update({ is_default: true }).eq('id', targetHub.id);
    }

    logger.info('VPS hub failover/migration completed:', { target_hub: targetHub.name, migratedCount, total: results.length });

    return NextResponse.json({
      success: true,
      target_hub: { id: targetHub.id, name: targetHub.name, public_ip: targetHub.public_ip },
      migrated_count: migratedCount,
      total_routers: results.length,
      results,
    });
  } catch (err) {
    logger.error('POST /api/super-admin/vps-hubs/migrate error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
