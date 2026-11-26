import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { registerRouterPeerOnVps, isValidWgPublicKey } from '@/lib/vps-hub.js';
import { hashBootstrapToken, generateZeroTouchRouterScript, resolvePublicBaseUrl } from '@/lib/zero-touch-onboarding.js';
import { logger } from '@/lib/logger.js';

/**
 * GET /api/onboarding/bootstrap?token=<rawToken>
 * Serves the personalized, idempotent RouterOS v7.12+ zero-touch onboarding script (.rsc)
 * for a pending router with a valid, unexpired 256-bit bootstrap token.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = String(searchParams.get('token') || '').trim();
    if (!token || token.length < 32) {
      return new NextResponse('# Error: Invalid bootstrap token\n', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }

    const tokenHash = hashBootstrapToken(token);
    const { data: router, error } = await supabaseAdmin
      .from('routers')
      .select('*, vps_hubs(*)')
      .eq('bootstrap_token_hash', tokenHash)
      .maybeSingle();

    if (error || !router) {
      return new NextResponse('# Error: Bootstrap token not found or already used\n', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    if (router.bootstrap_expires_at && Date.parse(router.bootstrap_expires_at) <= Date.now()) {
      return new NextResponse('# Error: Bootstrap token expired. Generate a new one in Super Admin.\n', { status: 410, headers: { 'Content-Type': 'text/plain' } });
    }

    const hub = router.vps_hubs;
    if (!hub || !hub.public_ip || !hub.wg_public_key) {
      return new NextResponse('# Error: Assigned VPS hub is missing WireGuard configuration\n', { status: 500, headers: { 'Content-Type': 'text/plain' } });
    }

    const baseUrl = resolvePublicBaseUrl(request);
    const callbackUrl = `${baseUrl}/api/onboarding/bootstrap`;
    const vpsSyncUrl = `${baseUrl}/api/onboarding/vps-sync`;
    const heartbeatUrl = router.polling_secret
      ? `${baseUrl}/api/mikrotik/heartbeat?secret=${encodeURIComponent(router.polling_secret)}&preserve_ip=1`
      : '';

    const preserveExisting = searchParams.get('preserve') !== '0';

    const rsc = generateZeroTouchRouterScript({
      routerName: router.name,
      apiUsername: router.username || 'mycollectivesub',
      apiPassword: router.password || '',
      vpsPublicIp: hub.public_ip,
      vpsWgPort: hub.wg_port || 51820,
      vpsWgPublicKey: hub.wg_public_key,
      vpsWgSubnet: hub.wg_subnet || '10.100.0.0/16',
      tunnelIp: router.wg_tunnel_ip,
      dnsName: router.dns_name || 'hotspot.mycollectivesub.net',
      preserveExistingConfig: preserveExisting,
      callbackUrl,
      bootstrapToken: token,
      heartbeatUrl,
      vpsSyncUrl,
      pollingSecret: router.polling_secret || '',
    });

    return new NextResponse(rsc, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error('GET /api/onboarding/bootstrap error:', { error: err.message });
    return new NextResponse(`# Error: ${err.message}\n`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

/**
 * POST /api/onboarding/bootstrap
 * Automated callback executed by the MikroTik router itself via `/tool fetch` at the end
 * of the bootstrap script. Sends `{ token, wg_public_key }` so the cloud backend registers
 * the router's WireGuard peer on the VPS Hub automatically with ZERO SSH and consumes the token.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    const wgPublicKey = String(body.wg_public_key || '').trim();

    if (!token || !isValidWgPublicKey(wgPublicKey)) {
      return NextResponse.json({ success: false, error: 'Valid token and wg_public_key are required' }, { status: 400 });
    }

    const tokenHash = hashBootstrapToken(token);
    const { data: router, error } = await supabaseAdmin
      .from('routers')
      .select('*, vps_hubs(*)')
      .eq('bootstrap_token_hash', tokenHash)
      .maybeSingle();

    if (error || !router) {
      return NextResponse.json({ success: false, error: 'Invalid or already consumed bootstrap token' }, { status: 404 });
    }

    if (router.bootstrap_expires_at && Date.parse(router.bootstrap_expires_at) <= Date.now()) {
      return NextResponse.json({ success: false, error: 'Bootstrap token expired' }, { status: 410 });
    }

    const hub = router.vps_hubs;
    if (!hub) {
      return NextResponse.json({ success: false, error: 'VPS hub record missing' }, { status: 500 });
    }

    // Atomically consume single-use token (optimistic lock prevents concurrent double-registration)
    const { data: claimedRows, error: claimErr } = await supabaseAdmin
      .from('routers')
      .update({
        wg_public_key: wgPublicKey,
        onboarding_status: 'active',
        status: 'online',
        bootstrap_token_hash: null,
        bootstrap_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', router.id)
      .eq('bootstrap_token_hash', tokenHash)
      .select('id');

    if (claimErr) throw claimErr;
    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Bootstrap token already consumed' }, { status: 409 });
    }

    try {
      await registerRouterPeerOnVps(hub, {
        publicKey: wgPublicKey,
        tunnelIp: router.wg_tunnel_ip,
        externalPort: router.port,
        targetPort: 443,
        routerName: router.name,
      });
    } catch (vpsErr) {
      // Restore bootstrap token so router can retry cleanly if VPS was momentarily unreachable
      await supabaseAdmin
        .from('routers')
        .update({
          onboarding_status: 'pending_bootstrap',
          status: 'offline',
          bootstrap_token_hash: tokenHash,
          bootstrap_expires_at: router.bootstrap_expires_at || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', router.id);
      throw vpsErr;
    }

    logger.info('Bootstrap callback completed — VPS peer registered:', {
      router_id: router.id,
      vps_hub: hub.name,
      tunnel_ip: router.wg_tunnel_ip,
      port: router.port,
    });

    return NextResponse.json({
      success: true,
      router_id: router.id,
      tunnel_ip: router.wg_tunnel_ip,
      external_port: router.port,
    });
  } catch (err) {
    logger.error('POST /api/onboarding/bootstrap error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
