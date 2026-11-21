import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { validateAdminAuth, adminUnauthorizedResponse } from '@/lib/admin-auth.js';
import { generateBootstrapToken, hashBootstrapToken } from '@/lib/zero-touch-onboarding.js';
import {
  maskVpsHub,
  suggestNextVpsSubnet,
  parseCidrSubnet,
  DEFAULT_PORT_RANGE_START,
  DEFAULT_PORT_RANGE_END,
  DEFAULT_MAX_ROUTERS_PER_HUB,
} from '@/lib/vps-hub.js';
import { logger } from '@/lib/logger.js';

/**
 * POST /api/super-admin/vps-hubs/bootstrap
 *
 * Creates a pending VPS Hub enrollment with a single-use 60-minute 256-bit token
 * and returns:
 *   1. `cloud_init_yaml`: Paste into Hostinger / DigitalOcean / Hetzner / Vultr
 *      "User Data / Startup Script" when ordering a new VPS -> ZERO SSH EVER!
 *   2. `one_line_command`: Single `curl | sudo bash` command for an existing Ubuntu VPS.
 *
 * When the VPS executes the script, it installs WireGuard + the provisioner daemon
 * and automatically POSTs its Public IP, WireGuard Public Key, and API Secret back
 * to `/api/onboarding/vps-installer` to self-register in Super Admin.
 */
export async function POST(request) {
  try {
    if (!(await validateAdminAuth(request))) return adminUnauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const { data: existingHubs } = await supabaseAdmin.from('vps_hubs').select('wg_subnet');
    let wgSubnet;
    try {
      wgSubnet = parseCidrSubnet(String(body.wg_subnet || '').trim() || suggestNextVpsSubnet(existingHubs || [])).cidr;
    } catch (cidrErr) {
      return NextResponse.json({ success: false, error: cidrErr.message }, { status: 400 });
    }
    const wgPort = Number(body.wg_port) || 51820;
    const portStart = Number(body.port_range_start) || DEFAULT_PORT_RANGE_START;
    const portEnd = Number(body.port_range_end) || DEFAULT_PORT_RANGE_END;
    if (!Number.isInteger(wgPort) || wgPort < 1024 || wgPort > 65535) {
      return NextResponse.json({ success: false, error: 'wg_port must be between 1024 and 65535' }, { status: 400 });
    }
    if (!Number.isInteger(portStart) || !Number.isInteger(portEnd) || portStart < 1024 || portEnd > 65535 || portStart > portEnd) {
      return NextResponse.json({ success: false, error: 'port_range_start and port_range_end must be 1024-65535 with start <= end' }, { status: 400 });
    }
    const maxRouters = Math.max(1, Number(body.max_routers) || DEFAULT_MAX_ROUTERS_PER_HUB);
    const isDefault = Boolean(body.is_default);

    if (!name) {
      return NextResponse.json({ success: false, error: 'VPS hub name is required' }, { status: 400 });
    }

    const rawToken = generateBootstrapToken();
    const tokenHash = hashBootstrapToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (isDefault) {
      await supabaseAdmin
        .from('vps_hubs')
        .update({ is_default: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: hub, error } = await supabaseAdmin
      .from('vps_hubs')
      .insert({
        name,
        public_ip: '',
        provisioner_url: '',
        api_secret: '',
        wg_interface: 'wg0',
        wg_port: wgPort,
        wg_subnet: wgSubnet,
        port_range_start: portStart,
        port_range_end: portEnd,
        max_routers: maxRouters,
        is_active: true,
        is_default: isDefault,
        status: 'pending_bootstrap',
        bootstrap_token_hash: tokenHash,
        bootstrap_expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    const reqOrigin = new URL(request.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || reqOrigin).replace(/\/+$/, '');
    const installerUrl = `${baseUrl}/api/onboarding/vps-installer?token=${rawToken}`;
    const oneLineCommand = `curl -fsSL "${installerUrl}" | sudo bash`;
    const cloudInitYaml = [
      '#cloud-config',
      'package_update: true',
      'runcmd:',
      `  - [ bash, -lc, 'curl -fsSL "${installerUrl}" | bash' ]`,
    ].join('\n');

    logger.info('Created zero-SSH VPS bootstrap token:', { hub_id: hub.id, name: hub.name });

    return NextResponse.json({
      success: true,
      hub: maskVpsHub(hub),
      bootstrap: {
        expires_at: expiresAt,
        installer_url: installerUrl,
        one_line_command: oneLineCommand,
        cloud_init_yaml: cloudInitYaml,
      },
    });
  } catch (err) {
    logger.error('POST /api/super-admin/vps-hubs/bootstrap error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
