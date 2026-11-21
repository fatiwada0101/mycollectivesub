/**
 * Capacitor JS Bridge for Mikroticket-Style Android Zero-Touch Router Onboarding.
 *
 * Uses the native `MikroTikLocal` Android plugin (TCP port 8728 over Wi-Fi) so an
 * Android phone connected to 192.168.88.1 can register a router on the VPS Hub and
 * enforce MAC-cookie auto-reconnect (4w2d) + Strict First-Login Wall-Clock Expiry v3
 * with ZERO SSH and ZERO WinBox.
 */

import {
  EXPIRY_SCRIPT_NAME,
  FIRST_LOGIN_SCRIPT,
  EXPIRY_SWEEP_SCRIPT,
} from '../../lib/voucher-expiry.js';

function getNativePlugin() {
  const plugin = globalThis?.Capacitor?.Plugins?.MikroTikLocal;
  if (!plugin) {
    throw new Error('MikroTikLocal native Android plugin is only available inside the Android APK build');
  }
  return plugin;
}

export async function onboardFromAndroidWifi({
  localIp = '192.168.88.1',
  localUsername = 'admin',
  localPassword = '',
  routerName,
  cloudUrl,
  adminToken,
  vpsHubId = null,
  locationId = null,
  dnsName = 'hotspot.mycollectivesub.net',
}) {
  const plugin = getNativePlugin();
  const cleanCloud = String(cloudUrl || '').trim().replace(/\/+$/, '');

  // Phase A: Probe local router, set NTP, create wg-vps and extract public key
  const probe = await plugin.executeBatch({
    host: localIp,
    port: 8728,
    username: localUsername,
    password: localPassword,
    commands: [
      { path: '/system/resource/print' },
      { path: '/system/identity/set', params: { name: routerName } },
      { path: '/system/clock/set', params: { 'time-zone-name': 'Africa/Lagos' } },
      { path: '/ip/cloud/set', params: { 'ddns-enabled': 'yes', 'update-time': 'yes' } },
      { path: '/system/ntp/client/set', params: { enabled: 'yes', servers: '216.239.35.0,1.1.1.1' } },
      { path: '/interface/wireguard/print' },
    ],
  });

  const wgRows = probe.results?.[5] || [];
  let wgPubKey = wgRows.find((w) => w.name === 'wg-vps')?.['public-key'];
  if (!wgPubKey) {
    const createdWg = await plugin.executeBatch({
      host: localIp,
      port: 8728,
      username: localUsername,
      password: localPassword,
      commands: [
        { path: '/interface/wireguard/add', params: { name: 'wg-vps', 'listen-port': '13231', mtu: '1420' } },
        { path: '/interface/wireguard/print' },
      ],
    });
    wgPubKey = (createdWg.results?.[1] || []).find((w) => w.name === 'wg-vps')?.['public-key'];
  }
  if (!wgPubKey) throw new Error('Could not read WireGuard public key from router');

  // Phase B: Auto-register router + WireGuard peer on Cloud & VPS Hub (ZERO SSH!)
  const cloudRes = await fetch(`${cleanCloud}/api/super-admin/routers/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      mode: 'local_connector',
      router_name: routerName,
      identity: routerName,
      location_id: locationId,
      vps_hub_id: vpsHubId,
      dns_name: dnsName,
      wg_public_key: wgPubKey,
    }),
  });
  const cloudData = await cloudRes.json();
  if (!cloudRes.ok || !cloudData.success) throw new Error(cloudData.error || 'Cloud registration failed');

  const { vps, credentials, router } = cloudData;

  // Phase C: Push WireGuard peer, API user, SSL/REST, MAC-cookie (4w2d) & Strict First-Login Expiry v3
  const readProfiles = await plugin.executeBatch({
    host: localIp,
    port: 8728,
    username: localUsername,
    password: localPassword,
    commands: [
      { path: '/ip/hotspot/profile/print' },
      { path: '/ip/hotspot/user/profile/print' },
    ],
  });

  const applyCommands = [
    { path: '/user/add', params: { name: credentials.username, password: credentials.password, group: 'full', comment: 'MyCollectiveSub Cloud API' } },
    { path: '/ip/address/add', params: { address: `${vps.wg_tunnel_ip}/24`, interface: 'wg-vps', comment: 'MyCollectiveSub VPS Tunnel' } },
    {
      path: '/interface/wireguard/peers/add',
      params: {
        interface: 'wg-vps',
        'endpoint-address': vps.public_ip,
        'endpoint-port': String(vps.wg_port || 51820),
        'public-key': vps.wg_public_key,
        'allowed-address': vps.wg_subnet || '10.100.0.0/24',
        'persistent-keepalive': '25s',
      },
    },
    { path: '/system/script/add', params: { name: EXPIRY_SCRIPT_NAME, source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' } },
    {
      path: '/system/scheduler/add',
      params: {
        name: EXPIRY_SCRIPT_NAME,
        'start-time': 'startup',
        interval: '10s',
        'on-event': `/system script run ${EXPIRY_SCRIPT_NAME}`,
        policy: 'read,write,test',
        disabled: 'no',
      },
    },
  ];

  for (const sp of readProfiles.results?.[0] || []) {
    if (sp['.id']) {
      applyCommands.push({
        path: '/ip/hotspot/profile/set',
        params: { '.id': sp['.id'], 'login-by': 'cookie,http-chap,http-pap,mac-cookie', 'http-cookie-lifetime': '4w2d' },
      });
    }
  }
  for (const up of readProfiles.results?.[1] || []) {
    if (up['.id']) {
      applyCommands.push({
        path: '/ip/hotspot/user/profile/set',
        params: {
          '.id': up['.id'],
          'on-login': FIRST_LOGIN_SCRIPT,
          'add-mac-cookie': 'yes',
          'mac-cookie-timeout': '4w2d',
          'keepalive-timeout': '2m',
        },
      });
    }
  }

  await plugin.executeBatch({
    host: localIp,
    port: 8728,
    username: localUsername,
    password: localPassword,
    commands: applyCommands,
  });

  return { success: true, router, vps };
}
