import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server.js';
import { supabaseAdmin } from '@/lib/supabase-server.js';
import { hashBootstrapToken } from '@/lib/zero-touch-onboarding.js';
import { isValidWgPublicKey, normalizeProvisionerUrl } from '@/lib/vps-hub.js';
import { logger } from '@/lib/logger.js';

/**
 * GET /api/onboarding/vps-installer?token=<rawToken>
 * Serves a self-contained Ubuntu 22.04/24.04 bash installer embedding `vps-provisioner/server.mjs`
 * and an automatic callback to self-register the VPS Hub in Supabase (ZERO SSH copy-paste!).
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = String(searchParams.get('token') || '').trim();
    if (!token || token.length < 32) {
      return new NextResponse('#!/usr/bin/env bash\necho "Invalid VPS bootstrap token"\nexit 1\n', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const tokenHash = hashBootstrapToken(token);
    const { data: hub, error } = await supabaseAdmin
      .from('vps_hubs')
      .select('*')
      .eq('bootstrap_token_hash', tokenHash)
      .maybeSingle();

    if (error || !hub) {
      return new NextResponse('#!/usr/bin/env bash\necho "VPS bootstrap token not found or already used"\nexit 1\n', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (hub.bootstrap_expires_at && Date.parse(hub.bootstrap_expires_at) <= Date.now()) {
      return new NextResponse('#!/usr/bin/env bash\necho "VPS bootstrap token expired. Generate a new one in Super Admin."\nexit 1\n', {
        status: 410,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const serverSource = await fs.readFile(path.join(process.cwd(), 'vps-provisioner', 'server.mjs'), 'utf8');
    const serverSourceB64 = Buffer.from(serverSource, 'utf8').toString('base64');

    const reqOrigin = new URL(request.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || reqOrigin).replace(/\/+$/, '');
    const callbackUrl = `${baseUrl}/api/onboarding/vps-installer`;

    const wgSubnet = hub.wg_subnet || '10.100.0.0/24';
    const wgHubIp = `${wgSubnet.split('/')[0].replace(/\.\d+$/, '.1')}/24`;
    const wgPort = Number(hub.wg_port) || 51820;
    const portStart = Number(hub.port_range_start) || 8443;
    const portEnd = Number(hub.port_range_end) || 8999;

    const bashScript = `#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo/root"
  exit 1
fi

INSTALL_DIR="/opt/mycollectivesub-provisioner"
WG_IFACE="wg0"
WG_PORT="${wgPort}"
WG_SUBNET="${wgSubnet}"
WG_HUB_IP="${wgHubIp}"
API_PORT="9443"
PUBLIC_IP="$(curl -4 -fsSL https://api.ipify.org || hostname -I | awk '{print $1}')"
WAN_IFACE="$(ip route show default | awk '/default/ {print $5; exit}')"

echo "=== Auto-Enrolling MyCollectiveSub VPS Hub (${hub.name.replace(/["`$\\]/g, '')}) on \${PUBLIC_IP} ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard wireguard-tools iptables-persistent ufw curl openssl ca-certificates

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

sysctl -w net.ipv4.ip_forward=1
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard
if [[ ! -f /etc/wireguard/server_private.key ]]; then
  umask 077
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi
SERVER_PRIV="$(cat /etc/wireguard/server_private.key)"
SERVER_PUB="$(cat /etc/wireguard/server_public.key)"

if [[ ! -f "/etc/wireguard/\${WG_IFACE}.conf" ]]; then
  cat <<EOF > "/etc/wireguard/\${WG_IFACE}.conf"
[Interface]
Address = \${WG_HUB_IP}
ListenPort = \${WG_PORT}
PrivateKey = \${SERVER_PRIV}
PostUp = iptables -A FORWARD -i \${WG_IFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o \${WAN_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i \${WG_IFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o \${WAN_IFACE} -j MASQUERADE
EOF
  chmod 600 "/etc/wireguard/\${WG_IFACE}.conf"
fi

systemctl enable "wg-quick@\${WG_IFACE}"
systemctl is-active --quiet "wg-quick@\${WG_IFACE}" || systemctl start "wg-quick@\${WG_IFACE}"

mkdir -p "\${INSTALL_DIR}"
echo "${serverSourceB64}" | base64 -d > "\${INSTALL_DIR}/server.mjs"

if [[ ! -f "\${INSTALL_DIR}/api.secret" ]]; then
  umask 077
  openssl rand -hex 32 > "\${INSTALL_DIR}/api.secret"
fi
API_SECRET="$(cat "\${INSTALL_DIR}/api.secret")"

if [[ ! -f "\${INSTALL_DIR}/tls.crt" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes \\
    -keyout "\${INSTALL_DIR}/tls.key" \\
    -out "\${INSTALL_DIR}/tls.crt" \\
    -days 3650 \\
    -subj "/CN=\${PUBLIC_IP}" \\
    -addext "subjectAltName=IP:\${PUBLIC_IP}"
  chmod 600 "\${INSTALL_DIR}/tls.key"
fi

cat <<EOF > /etc/systemd/system/mycollectivesub-vps-provisioner.service
[Unit]
Description=MyCollectiveSub Zero-SSH WireGuard Provisioner API
After=network-online.target wg-quick@\${WG_IFACE}.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=\${INSTALL_DIR}
Environment=PROVISIONER_PORT=\${API_PORT}
Environment=PROVISIONER_API_SECRET=\${API_SECRET}
Environment=VPS_PUBLIC_IP=\${PUBLIC_IP}
Environment=WG_INTERFACE=\${WG_IFACE}
Environment=WG_PORT=\${WG_PORT}
Environment=WG_SUBNET=\${WG_SUBNET}
Environment=WG_CONF_PATH=/etc/wireguard/\${WG_IFACE}.conf
Environment=WG_PUBLIC_KEY_PATH=/etc/wireguard/server_public.key
Environment=TLS_CERT_PATH=\${INSTALL_DIR}/tls.crt
Environment=TLS_KEY_PATH=\${INSTALL_DIR}/tls.key
ExecStart=/usr/bin/node \${INSTALL_DIR}/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mycollectivesub-vps-provisioner
systemctl restart mycollectivesub-vps-provisioner

ufw allow 22/tcp
ufw allow "\${WG_PORT}/udp"
ufw allow "\${API_PORT}/tcp"
ufw allow "${portStart}:${portEnd}/tcp"
ufw --force enable

sleep 2
echo "=== Reporting VPS Hub credentials back to MyCollectiveSub Cloud ==="
curl -fsSL -X POST "${callbackUrl}" \\
  -H "Content-Type: application/json" \\
  -d "{\\"token\\":\\"${token}\\",\\"public_ip\\":\\"\${PUBLIC_IP}\\",\\"provisioner_url\\":\\"https://\${PUBLIC_IP}:\${API_PORT}\\",\\"api_secret\\":\\"\${API_SECRET}\\",\\"wg_public_key\\":\\"\${SERVER_PUB}\\",\\"wg_port\\":\${WG_PORT},\\"wg_subnet\\":\\"\${WG_SUBNET}\\"}"

echo ""
echo "SUCCESS: VPS Hub auto-registered on MyCollectiveSub! You never need SSH again."
`;

    return new NextResponse(bashScript, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error('GET /api/onboarding/vps-installer error:', { error: err.message });
    return new NextResponse(`#!/usr/bin/env bash\necho "Installer error: ${err.message}"\nexit 1\n`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * POST /api/onboarding/vps-installer
 * Automated callback sent by the VPS at the end of `cloud-init` / `install.sh`.
 * Validates the single-use token, saves the VPS public IP, WG public key, and API secret,
 * marks the hub online, and consumes the token.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    const publicIp = String(body.public_ip || '').trim();
    const provisionerUrl = normalizeProvisionerUrl(body.provisioner_url || (publicIp ? `https://${publicIp}:9443` : ''));
    const apiSecret = String(body.api_secret || '').trim();
    const wgPublicKey = String(body.wg_public_key || '').trim();

    if (!token || !publicIp || !provisionerUrl || !apiSecret || !isValidWgPublicKey(wgPublicKey)) {
      return NextResponse.json(
        { success: false, error: 'token, public_ip, provisioner_url, api_secret, and valid wg_public_key are required' },
        { status: 400 }
      );
    }

    const tokenHash = hashBootstrapToken(token);
    const { data: hub, error } = await supabaseAdmin
      .from('vps_hubs')
      .select('id, name, bootstrap_expires_at')
      .eq('bootstrap_token_hash', tokenHash)
      .maybeSingle();

    if (error || !hub) {
      return NextResponse.json({ success: false, error: 'Invalid or already consumed VPS bootstrap token' }, { status: 404 });
    }

    if (hub.bootstrap_expires_at && Date.parse(hub.bootstrap_expires_at) <= Date.now()) {
      return NextResponse.json({ success: false, error: 'VPS bootstrap token expired' }, { status: 410 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('vps_hubs')
      .update({
        public_ip: publicIp,
        provisioner_url: provisionerUrl,
        api_secret: apiSecret,
        wg_public_key: wgPublicKey,
        wg_port: Number(body.wg_port) || 51820,
        wg_subnet: String(body.wg_subnet || '10.100.0.0/24').trim(),
        status: 'online',
        last_health_at: new Date().toISOString(),
        bootstrap_token_hash: null,
        bootstrap_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hub.id);

    if (updateErr) throw updateErr;

    logger.info('VPS Hub self-registered via Zero-SSH installer:', { hub_id: hub.id, public_ip: publicIp });

    return NextResponse.json({ success: true, hub_id: hub.id, public_ip: publicIp });
  } catch (err) {
    logger.error('POST /api/onboarding/vps-installer error:', { error: err.message });
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
