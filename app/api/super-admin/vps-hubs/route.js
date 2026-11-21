import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import {
  maskVpsHub,
  normalizeProvisionerUrl,
  assertSafePublicProvisionerUrl,
  testVpsHubConnection,
  suggestNextVpsSubnet,
  parseCidrSubnet,
  DEFAULT_WG_SUBNET,
  DEFAULT_PORT_RANGE_START,
  DEFAULT_PORT_RANGE_END,
  DEFAULT_MAX_ROUTERS_PER_HUB,
} from '@/lib/vps-hub.js';
import { logger } from '@/lib/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMissingTableError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || msg.includes('vps_hubs') && (msg.includes('does not exist') || msg.includes('schema cache'));
}

export async function GET(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const { data, error } = await supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          needs_migration: true,
          migration_file: 'supabase/migrations/20261121000001_zero_touch_vps_hubs.sql',
          hubs: [],
        });
      }
      throw error;
    }

    const { data: routerRows } = await supabaseAdmin
      .from('routers')
      .select('id, vps_hub_id, ip_address');

    const maskedHubs = (data || []).map((hub) => {
      const count = (routerRows || []).filter(
        (r) => r.vps_hub_id === hub.id || (!r.vps_hub_id && hub.public_ip && r.ip_address === hub.public_ip)
      ).length;
      return maskVpsHub(hub, count);
    });

    const totalCapacity = maskedHubs.filter((h) => h.is_active).reduce((sum, h) => sum + (h.effective_capacity || 0), 0);
    const totalRoutersOnHubs = maskedHubs.reduce((sum, h) => sum + (h.router_count || 0), 0);
    const onlineHubsCount = maskedHubs.filter((h) => h.is_active && h.status === 'online').length;

    return NextResponse.json({
      success: true,
      hubs: maskedHubs,
      fleet_summary: {
        total_hubs: maskedHubs.length,
        online_hubs: onlineHubsCount,
        total_routers_on_hubs: totalRoutersOnHubs,
        total_capacity: totalCapacity,
        remaining_capacity: Math.max(0, totalCapacity - totalRoutersOnHubs),
        suggested_next_subnet: suggestNextVpsSubnet(data || []),
        default_max_routers_per_hub: DEFAULT_MAX_ROUTERS_PER_HUB,
      },
    });
  } catch (err) {
    logger.error('GET /api/super-admin/vps-hubs error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const publicIp = String(body.public_ip || '').trim();
    const provisionerUrl = normalizeProvisionerUrl(body.provisioner_url || (publicIp ? `https://${publicIp}:9443` : ''));
    const apiSecret = String(body.api_secret || '').trim();

    if (!name || !publicIp || !provisionerUrl || !apiSecret) {
      return NextResponse.json(
        { success: false, error: 'name, public_ip, provisioner_url, and api_secret are required' },
        { status: 400 }
      );
    }

    try {
      assertSafePublicProvisionerUrl(provisionerUrl);
    } catch (urlErr) {
      return NextResponse.json({ success: false, error: urlErr.message }, { status: 400 });
    }

    let wgPublicKey = String(body.wg_public_key || '').trim();
    let wgPort = Number(body.wg_port) || 51820;
    const { data: existingHubs } = await supabaseAdmin.from('vps_hubs').select('wg_subnet');
    let wgSubnet;
    try {
      wgSubnet = parseCidrSubnet(String(body.wg_subnet || '').trim() || suggestNextVpsSubnet(existingHubs || []) || DEFAULT_WG_SUBNET).cidr;
    } catch (cidrErr) {
      return NextResponse.json({ success: false, error: cidrErr.message }, { status: 400 });
    }
    const portStart = Number(body.port_range_start) || DEFAULT_PORT_RANGE_START;
    const portEnd = Number(body.port_range_end) || DEFAULT_PORT_RANGE_END;
    if (!Number.isInteger(portStart) || !Number.isInteger(portEnd) || portStart < 1024 || portEnd > 65535 || portStart > portEnd) {
      return NextResponse.json({ success: false, error: 'port_range_start and port_range_end must be between 1024 and 65535 with start <= end' }, { status: 400 });
    }
    if (!Number.isInteger(wgPort) || wgPort < 1024 || wgPort > 65535) {
      return NextResponse.json({ success: false, error: 'wg_port must be between 1024 and 65535' }, { status: 400 });
    }
    let wgInterface = String(body.wg_interface || 'wg0').replace(/[^a-zA-Z0-9_-]/g, '') || 'wg0';
    const maxRouters = Math.max(1, Number(body.max_routers) || DEFAULT_MAX_ROUTERS_PER_HUB);
    let status = 'unknown';
    let lastHealthAt = null;
    let health = null;

    if (body.skip_health_check !== true) {
      try {
        health = await testVpsHubConnection({ provisioner_url: provisionerUrl, api_secret: apiSecret, public_ip: publicIp });
        if (health.ok) {
          status = 'online';
          lastHealthAt = new Date().toISOString();
          if (health.wgPublicKey) wgPublicKey = health.wgPublicKey;
          if (health.wgPort) wgPort = health.wgPort;
          if (health.wgSubnet) wgSubnet = health.wgSubnet;
          if (health.wgInterface) wgInterface = health.wgInterface;
        }
      } catch (healthErr) {
        status = 'offline';
        health = { ok: false, error: healthErr.message };
      }
    }

    if (body.is_default) {
      await supabaseAdmin.from('vps_hubs').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: created, error } = await supabaseAdmin
      .from('vps_hubs')
      .insert({
        name,
        public_ip: publicIp,
        provisioner_url: provisionerUrl,
        api_secret: apiSecret,
        wg_interface: wgInterface,
        wg_port: wgPort,
        wg_public_key: wgPublicKey || null,
        wg_subnet: wgSubnet,
        port_range_start: portStart,
        port_range_end: portEnd,
        max_routers: maxRouters,
        is_active: body.is_active !== false,
        is_default: Boolean(body.is_default),
        status,
        last_health_at: lastHealthAt,
      })
      .select()
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: false,
          needs_migration: true,
          error: 'Run migration supabase/migrations/20261121000001_zero_touch_vps_hubs.sql in Supabase SQL Editor first.',
        }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      hub: maskVpsHub(created),
      health,
    });
  } catch (err) {
    logger.error('POST /api/super-admin/vps-hubs error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Valid VPS hub UUID is required' }, { status: 400 });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.public_ip !== undefined) updates.public_ip = String(body.public_ip).trim();
    if (body.provisioner_url !== undefined) {
      try {
        updates.provisioner_url = assertSafePublicProvisionerUrl(body.provisioner_url);
      } catch (urlErr) {
        return NextResponse.json({ success: false, error: urlErr.message }, { status: 400 });
      }
    }
    if (typeof body.api_secret === 'string' && body.api_secret.trim()) updates.api_secret = body.api_secret.trim();
    if (body.wg_interface !== undefined) updates.wg_interface = String(body.wg_interface).trim() || 'wg0';
    if (body.wg_port !== undefined) updates.wg_port = Number(body.wg_port) || 51820;
    if (body.wg_public_key !== undefined) updates.wg_public_key = String(body.wg_public_key).trim() || null;
    if (body.wg_subnet !== undefined) {
      try {
        updates.wg_subnet = parseCidrSubnet(String(body.wg_subnet).trim() || DEFAULT_WG_SUBNET).cidr;
      } catch (cidrErr) {
        return NextResponse.json({ success: false, error: cidrErr.message }, { status: 400 });
      }
    }
    if (body.port_range_start !== undefined) updates.port_range_start = Number(body.port_range_start) || DEFAULT_PORT_RANGE_START;
    if (body.port_range_end !== undefined) updates.port_range_end = Number(body.port_range_end) || DEFAULT_PORT_RANGE_END;
    if (updates.port_range_start !== undefined && updates.port_range_end !== undefined && updates.port_range_start > updates.port_range_end) {
      return NextResponse.json({ success: false, error: 'port_range_start cannot exceed port_range_end' }, { status: 400 });
    }
    if (body.max_routers !== undefined) updates.max_routers = Math.max(1, Number(body.max_routers) || DEFAULT_MAX_ROUTERS_PER_HUB);
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
    if (body.is_default !== undefined) {
      updates.is_default = Boolean(body.is_default);
      if (updates.is_default) {
        await supabaseAdmin.from('vps_hubs').update({ is_default: false }).neq('id', id);
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('vps_hubs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, hub: maskVpsHub(updated) });
  } catch (err) {
    logger.error('PUT /api/super-admin/vps-hubs error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH — Run live /health check against a stored VPS hub and auto-sync its WireGuard public key
export async function PATCH(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Valid VPS hub UUID is required' }, { status: 400 });
    }

    const { data: hub, error } = await supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!hub) return NextResponse.json({ success: false, error: 'VPS hub not found' }, { status: 404 });

    try {
      const health = await testVpsHubConnection(hub);
      const updates = {
        status: health.ok ? 'online' : 'offline',
        last_health_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (health.wgPublicKey) updates.wg_public_key = health.wgPublicKey;
      if (health.wgPort) updates.wg_port = health.wgPort;
      if (health.wgSubnet) updates.wg_subnet = health.wgSubnet;

      const { data: refreshed } = await supabaseAdmin
        .from('vps_hubs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      return NextResponse.json({
        success: true,
        health,
        hub: maskVpsHub(refreshed || { ...hub, ...updates }),
      });
    } catch (healthErr) {
      await supabaseAdmin
        .from('vps_hubs')
        .update({ status: 'offline', updated_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({
        success: false,
        error: healthErr.message,
        health: { ok: false, error: healthErr.message },
      }, { status: 502 });
    }
  } catch (err) {
    logger.error('PATCH /api/super-admin/vps-hubs error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Valid VPS hub UUID is required' }, { status: 400 });
    }

    const { data: deletedHub } = await supabaseAdmin
      .from('vps_hubs')
      .select('id, is_default')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from('vps_hubs').delete().eq('id', id);
    if (error) throw error;

    // If the deleted hub was default, automatically promote the next active online hub
    if (deletedHub?.is_default) {
      const { data: remaining } = await supabaseAdmin
        .from('vps_hubs')
        .select('id, status')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (remaining && remaining.length > 0) {
        const nextDefault = remaining.find((h) => h.status === 'online') || remaining[0];
        await supabaseAdmin.from('vps_hubs').update({ is_default: true }).eq('id', nextDefault.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/super-admin/vps-hubs error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
