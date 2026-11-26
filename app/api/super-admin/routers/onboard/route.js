import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import {
  selectVpsHubWithCapacity,
  allocateRouterSlotForHub,
  registerRouterPeerOnVps,
  removeRouterPeerFromVps,
  testVpsHubConnection,
  isValidWgPublicKey,
  DEFAULT_WG_SUBNET,
} from '@/lib/vps-hub.js';
import {
  generateApiPassword,
  generateBootstrapToken,
  hashBootstrapToken,
  resolvePublicBaseUrl,
} from '@/lib/zero-touch-onboarding.js';
import { logger } from '@/lib/logger.js';

/**
 * POST /api/super-admin/routers/onboard
 *
 * Unified Zero-Touch Router Onboarding endpoint supporting TWO zero-SSH flows:
 *
 * 1. mode = "local_connector" (Mikroticket-style Local Plug & Play App):
 *    The Local Connector already connected to 192.168.88.1 over local Wi-Fi,
 *    created `wg-vps`, and sends `{ router_name, wg_public_key, vps_hub_id, location_id }`.
 *    This route:
 *      - Allocates a conflict-free (tunnelIp, externalPort) on the selected VPS Hub
 *      - Calls the VPS Provisioner API over HTTPS to register the WireGuard peer (ZERO SSH!)
 *      - Inserts/updates the router record in `public.routers` with fresh API credentials
 *      - Returns `{ router, vps, credentials }` so the Local Connector finishes configuring
 *        WireGuard + MAC-cookie (4w2d) + Strict First-Login Wall-Clock Expiry v3!
 *
 * 2. mode = "bootstrap_script" (Web-Only 1-Line Zero-Touch Bootstrap):
 *    Creates a pending router slot + 15-minute single-use signed token and returns a
 *    single `/tool fetch` WinBox command that configures everything and calls back
 *    `/api/onboarding/bootstrap` to auto-register the router's WireGuard key on the VPS.
 */
export async function POST(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === 'local_connector' ? 'local_connector' : 'bootstrap_script';
    const routerName = String(body.router_name || body.name || '').trim();
    const identity = String(body.identity || routerName).trim();
    const locationId = body.location_id || null;
    const dnsName = String(body.dns_name || 'hotspot.mycollectivesub.net').trim();
    const apiUsername = String(body.api_username || 'mycollectivesub').trim();
    const apiPassword = String(body.api_password || '').trim() || generateApiPassword(20);
    const pollingSecret = generateBootstrapToken().slice(0, 48);

    if (!routerName) {
      return NextResponse.json({ success: false, error: 'router_name is required' }, { status: 400 });
    }

    // 1. Resolve target VPS Hub with automatic multi-VPS capacity overflow (or stage deferred VPS for bootstrap_script)
    let hub = null;
    let slot = null;
    let overflowedFromHub = null;
    try {
      const selection = await selectVpsHubWithCapacity(body.vps_hub_id || null, {
        allowOverflow: body.allow_overflow !== false,
      });
      hub = selection.hub;
      overflowedFromHub = selection.overflowedFrom
        ? { id: selection.overflowedFrom.id, name: selection.overflowedFrom.name }
        : null;

      // Ensure we know the VPS WireGuard public key (auto-fetch via /health if missing)
      if (!hub.wg_public_key) {
        const health = await testVpsHubConnection(hub);
        if (!health.wgPublicKey) {
          return NextResponse.json(
            { success: false, error: `VPS hub "${hub.name}" did not return a WireGuard public key on /health` },
            { status: 502 }
          );
        }
        hub = { ...hub, wg_public_key: health.wgPublicKey, wg_port: health.wgPort || hub.wg_port, wg_subnet: health.wgSubnet || hub.wg_subnet };
        await supabaseAdmin
          .from('vps_hubs')
          .update({ wg_public_key: health.wgPublicKey, status: 'online', last_health_at: new Date().toISOString() })
          .eq('id', hub.id);
      }

      // 2. Allocate conflict-free (wg_tunnel_ip, external_port)
      slot = await allocateRouterSlotForHub(hub);
    } catch (hubErr) {
      if (mode === 'bootstrap_script' && !body.vps_hub_id && /No active VPS hub/i.test(hubErr.message || '')) {
        hub = null;
        slot = null;
      } else {
        throw hubErr;
      }
    }

    // ── MODE A: Local Plug & Play Connector (Mikroticket-style) ─────────────
    if (mode === 'local_connector') {
      const wgPublicKey = String(body.wg_public_key || '').trim();
      if (!isValidWgPublicKey(wgPublicKey)) {
        return NextResponse.json(
          { success: false, error: 'Valid 44-character base64 wg_public_key is required for local_connector mode' },
          { status: 400 }
        );
      }

      // Register peer on the VPS Hub automatically via HTTPS API (ZERO SSH!)
      await registerRouterPeerOnVps(hub, {
        publicKey: wgPublicKey,
        tunnelIp: slot.wg_tunnel_ip,
        externalPort: slot.external_port,
        targetPort: 443,
        routerName,
      });

      const { data: savedRouter, error: insertErr } = await supabaseAdmin
        .from('routers')
        .insert({
          name: routerName,
          identity,
          location_id: locationId,
          connection_mode: 'direct',
          ip_address: hub.public_ip,
          port: Number(slot.external_port),
          username: apiUsername,
          password: apiPassword,
          use_ssl: true,
          dns_name: dnsName,
          hotspot_server_name: 'hotspot1',
          status: 'online',
          is_active: true,
          vps_hub_id: hub.id,
          wg_tunnel_ip: slot.wg_tunnel_ip,
          wg_public_key: wgPublicKey,
          polling_secret: pollingSecret,
          onboarding_status: 'active',
        })
        .select()
        .single();

      if (insertErr) {
        // Roll back VPS WireGuard peer + DNAT rule so we never leak an orphaned peer
        await removeRouterPeerFromVps(hub, {
          publicKey: wgPublicKey,
          tunnelIp: slot.wg_tunnel_ip,
          externalPort: slot.external_port,
          targetPort: 443,
        }).catch(() => {});
        throw insertErr;
      }

      logger.info('Zero-touch local router onboarded:', {
        router_id: savedRouter.id,
        vps_hub: hub.name,
        tunnel_ip: slot.wg_tunnel_ip,
        external_port: slot.external_port,
      });

      return NextResponse.json({
        success: true,
        mode: 'local_connector',
        router: savedRouter,
        vps: {
          id: hub.id,
          name: hub.name,
          public_ip: hub.public_ip,
          wg_port: Number(hub.wg_port) || 51820,
          wg_public_key: hub.wg_public_key,
          wg_subnet: hub.wg_subnet || DEFAULT_WG_SUBNET,
          wg_tunnel_ip: slot.wg_tunnel_ip,
          external_port: Number(slot.external_port),
          overflowed_from_hub: overflowedFromHub,
        },
        credentials: {
          username: apiUsername,
          password: apiPassword,
        },
        defaults_applied: {
          expiry_policy: 'first_login',
          offline_wall_clock_expiry: true,
          mac_cookie_auto_reconnect: true,
          mac_cookie_timeout: '4w2d',
          sweep_interval: '10s',
        },
      });
    }

    // ── MODE B: 1-Line Cloud Bootstrap Token (Web-Only Fallback, works even before a VPS Hub is added) ──
    const rawToken = generateBootstrapToken();
    const tokenHash = hashBootstrapToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data: pendingRouter, error: pendingErr } = await supabaseAdmin
      .from('routers')
      .insert({
        name: routerName,
        identity,
        location_id: locationId,
        connection_mode: 'direct',
        ip_address: hub?.public_ip || null,
        port: Number(slot?.external_port) || 443,
        username: apiUsername,
        password: apiPassword,
        use_ssl: true,
        dns_name: dnsName,
        hotspot_server_name: 'hotspot1',
        status: 'offline',
        is_active: true,
        vps_hub_id: hub?.id || null,
        wg_tunnel_ip: slot?.wg_tunnel_ip || null,
        polling_secret: pollingSecret,
        onboarding_status: 'pending_bootstrap',
        bootstrap_token_hash: tokenHash,
        bootstrap_expires_at: expiresAt,
      })
      .select()
      .single();

    if (pendingErr) throw pendingErr;

    const baseUrl = resolvePublicBaseUrl(request);
    const preserveExisting = body.preserve_existing !== false;
    const scriptUrl = `${baseUrl}/api/onboarding/bootstrap?token=${rawToken}${preserveExisting ? '' : '&preserve=0'}`;
    const oneLineCommand = `/tool fetch url="${scriptUrl}" dst-path="mcs-onboard.rsc" mode=https check-certificate=no; /import mcs-onboard.rsc; /file remove mcs-onboard.rsc`;

    return NextResponse.json({
      success: true,
      mode: 'bootstrap_script',
      awaiting_vps: !hub,
      router: pendingRouter,
      vps: hub
        ? {
            id: hub.id,
            name: hub.name,
            public_ip: hub.public_ip,
            wg_subnet: hub.wg_subnet || DEFAULT_WG_SUBNET,
            wg_tunnel_ip: slot.wg_tunnel_ip,
            external_port: Number(slot.external_port),
            overflowed_from_hub: overflowedFromHub,
          }
        : null,
      bootstrap: {
        expires_at: expiresAt,
        script_url: scriptUrl,
        one_line_command: oneLineCommand,
      },
      defaults_applied: {
        expiry_policy: 'first_login',
        offline_wall_clock_expiry: true,
        mac_cookie_auto_reconnect: true,
        mac_cookie_timeout: '4w2d',
        sweep_interval: '10s',
      },
    });
  } catch (err) {
    logger.error('POST /api/super-admin/routers/onboard error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
