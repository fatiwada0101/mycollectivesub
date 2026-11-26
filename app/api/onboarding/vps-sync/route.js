import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { registerRouterPeerOnVps, isValidWgPublicKey, getHubCidrMask, getHubGatewayIp, DEFAULT_WG_SUBNET } from '@/lib/vps-hub.js';
import { escapeRouterOsString, resolvePublicBaseUrl, buildWatchdogScriptSource } from '@/lib/zero-touch-onboarding.js';
import { logger } from '@/lib/logger.js';

/**
 * GET /api/onboarding/vps-sync?secret=<router_polling_secret>
 *
 * Self-healing VPS Failover endpoint called by a router's 60s `an-watchdog-script`
 * ONLY when the router can no longer reach its previous WireGuard VPS hub.
 *
 * If the admin switched this router to a brand-new VPS Hub (e.g. after an old VPS expired),
 * this returns a minimal RouterOS `.rsc` script updating ONLY `wg-vps` (tunnel IP, new VPS IP,
 * new VPS WireGuard public key) — preserving Hotspot, users, bridge, and expiry scripts 100%.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = String(searchParams.get('secret') || '').trim();
    if (!secret || secret.length < 16) {
      return new NextResponse('# Invalid router secret\n', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    const { data: router, error } = await supabaseAdmin
      .from('routers')
      .select('id, name, port, wg_tunnel_ip, wg_public_key, vps_hub_id, vps_hubs(*)')
      .eq('polling_secret', secret)
      .maybeSingle();

    if (error || !router) {
      return new NextResponse('# Router not found\n', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    const hub = router.vps_hubs;
    if (!hub || !hub.public_ip || !hub.wg_public_key || !router.wg_tunnel_ip) {
      return new NextResponse('# No target VPS hub assigned yet\n', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const safeIp = escapeRouterOsString(hub.public_ip);
    const safeKey = escapeRouterOsString(hub.wg_public_key);
    const rawSubnet = hub.wg_subnet || DEFAULT_WG_SUBNET;
    const safeSubnet = escapeRouterOsString(rawSubnet);
    const prefixLen = getHubCidrMask(rawSubnet);
    const hubGwIp = getHubGatewayIp(rawSubnet);
    const safeTunnelIp = escapeRouterOsString(router.wg_tunnel_ip);
    const wgPort = Number(hub.wg_port) || 51820;

    const baseUrl = resolvePublicBaseUrl(request);
    const vpsSyncUrl = `${baseUrl}/api/onboarding/vps-sync`;
    const heartbeatUrl = `${baseUrl}/api/mikrotik/heartbeat?secret=${encodeURIComponent(secret)}&preserve_ip=1`;
    const refreshedWatchdog = buildWatchdogScriptSource({ hubGatewayIp: hubGwIp, vpsSyncUrl, pollingSecret: secret, heartbeatUrl });

    // Only touch wg-vps if endpoint, port, public-key, or tunnel IP actually changed (idempotent, zero churn!)
    const script = [
      '# MyCollectiveSub Self-Healing VPS Failover Sync',
      ':if ([:len [/interface wireguard find where name="wg-vps"]] = 0) do={',
      '  :local wgListenPort 13231',
      '  :while ([:len [/interface wireguard find where listen-port=$wgListenPort]] > 0) do={ :set wgListenPort ($wgListenPort + 1) }',
      '  /interface wireguard add name="wg-vps" listen-port=$wgListenPort mtu=1420',
      '}',
      ':local curPeers [/interface wireguard peers find where interface="wg-vps"]',
      ':local curAddrs [/ip address find where interface="wg-vps"]',
      ':local needsUpdate true',
      ':if (([:len $curPeers] = 1) && ([:len $curAddrs] = 1)) do={',
      '  :local pId [:pick $curPeers 0]',
      '  :local aId [:pick $curAddrs 0]',
      `  :if (([/interface wireguard peers get $pId endpoint-address] = "${safeIp}") && ([/interface wireguard peers get $pId endpoint-port] = ${wgPort}) && ([/interface wireguard peers get $pId public-key] = "${safeKey}") && ([/ip address get $aId address] = "${safeTunnelIp}/${prefixLen}")) do={`,
      '    :set needsUpdate false',
      '  }',
      '}',
      ':if ($needsUpdate = true) do={',
      '  :do { /ip address remove [find where interface="wg-vps"] } on-error={}',
      `  /ip address add address="${safeTunnelIp}/${prefixLen}" interface="wg-vps" comment="MyCollectiveSub VPS Tunnel"`,
      '  :do { /interface wireguard peers remove [find where interface="wg-vps"] } on-error={}',
      `  /interface wireguard peers add interface="wg-vps" endpoint-address="${safeIp}" endpoint-port=${wgPort} public-key="${safeKey}" allowed-address="${safeSubnet}" persistent-keepalive=25s comment="MyCollectiveSub VPS Hub"`,
      `  :do { /system script set [find where name="an-watchdog-script"] source="${refreshedWatchdog}" } on-error={}`,
      `  :log info "MyCollectiveSub: Auto-switched WireGuard tunnel to VPS ${safeIp}:${wgPort} (${safeSubnet})"`,
      '}',
    ].join('\n');

    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error('GET /api/onboarding/vps-sync error:', { error: err.message });
    return new NextResponse(`# Error: ${err.message}\n`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

/**
 * POST /api/onboarding/vps-sync
 * Router self-reports its WireGuard public key during failover (`{ secret, wg_public_key }`)
 * so the cloud backend ensures its peer is registered on the router's assigned VPS Hub.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const secret = String(body.secret || '').trim();
    const wgPublicKey = String(body.wg_public_key || '').trim();

    if (!secret || secret.length < 16 || !isValidWgPublicKey(wgPublicKey)) {
      return NextResponse.json({ success: false, error: 'Valid secret and wg_public_key are required' }, { status: 400 });
    }

    const { data: router, error } = await supabaseAdmin
      .from('routers')
      .select('id, name, port, wg_tunnel_ip, wg_public_key, vps_hub_id, vps_hubs(*)')
      .eq('polling_secret', secret)
      .maybeSingle();

    if (error || !router) {
      return NextResponse.json({ success: false, error: 'Router not found' }, { status: 404 });
    }

    const hub = router.vps_hubs;
    if (!hub || !router.wg_tunnel_ip) {
      return NextResponse.json({ success: false, error: 'No VPS hub assigned to this router' }, { status: 400 });
    }

    await registerRouterPeerOnVps(hub, {
      publicKey: wgPublicKey,
      tunnelIp: router.wg_tunnel_ip,
      externalPort: router.port,
      targetPort: 443,
      routerName: router.name,
    });

    if (router.wg_public_key !== wgPublicKey) {
      await supabaseAdmin
        .from('routers')
        .update({ wg_public_key: wgPublicKey, updated_at: new Date().toISOString() })
        .eq('id', router.id);
    }

    return NextResponse.json({
      success: true,
      router_id: router.id,
      vps_public_ip: hub.public_ip,
      wg_tunnel_ip: router.wg_tunnel_ip,
      external_port: router.port,
    });
  } catch (err) {
    logger.error('POST /api/onboarding/vps-sync error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
