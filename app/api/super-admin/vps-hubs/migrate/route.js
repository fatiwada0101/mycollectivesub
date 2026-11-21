import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import {
  allocateRouterSlotForHub,
  registerRouterPeerOnVps,
  testVpsHubConnection,
  isValidWgPublicKey,
} from '@/lib/vps-hub.js';
import { generateBootstrapToken } from '@/lib/zero-touch-onboarding.js';
import { logger } from '@/lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const results = [];
    for (const router of routersToMove || []) {
      try {
        const slot = await allocateRouterSlotForHub(targetHub);
        let peerRegistered = false;

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

        const { error: updErr } = await supabaseAdmin
          .from('routers')
          .update({
            vps_hub_id: targetHub.id,
            ip_address: targetHub.public_ip,
            port: Number(slot.external_port),
            wg_tunnel_ip: slot.wg_tunnel_ip,
            ...(router.polling_secret ? {} : { polling_secret: generateBootstrapToken().slice(0, 48) }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', router.id);

        if (updErr) throw updErr;

        results.push({
          router_id: router.id,
          name: router.name,
          success: true,
          wg_tunnel_ip: slot.wg_tunnel_ip,
          external_port: Number(slot.external_port),
          peer_registered: peerRegistered,
          note: peerRegistered
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

    // Mark target hub as default
    await supabaseAdmin.from('vps_hubs').update({ is_default: false }).neq('id', targetHub.id);
    await supabaseAdmin.from('vps_hubs').update({ is_default: true }).eq('id', targetHub.id);

    const migratedCount = results.filter((r) => r.success).length;
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
