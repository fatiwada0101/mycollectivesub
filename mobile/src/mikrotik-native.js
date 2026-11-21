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

  // Phase C: Inspect existing router config so all writes are 100% idempotent & preserve existing setup
  const state = await plugin.executeBatch({
    host: localIp,
    port: 8728,
    username: localUsername,
    password: localPassword,
    commands: [
      { path: '/ip/hotspot/profile/print' },
      { path: '/ip/hotspot/user/profile/print' },
      { path: '/user/print' },
      { path: '/certificate/print' },
      { path: '/ip/service/print' },
      { path: '/ip/address/print' },
      { path: '/interface/wireguard/peers/print' },
      { path: '/ip/firewall/filter/print' },
      { path: '/system/script/print' },
      { path: '/system/scheduler/print' },
    ],
  });

  const [
    hsServerProfs = [],
    hsUserProfs = [],
    existingUsers = [],
    certs = [],
    services = [],
    ipAddrs = [],
    wgPeers = [],
    fwRules = [],
    sysScripts = [],
    sysScheds = [],
  ] = state.results || [];

  const wgSubnetStr = String(vps.wg_subnet || '10.100.0.0/16');
  const [wgNetPart, wgMaskPart] = wgSubnetStr.split('/');
  const wgPrefixLen = Number(wgMaskPart) >= 16 && Number(wgMaskPart) <= 29 ? Number(wgMaskPart) : 16;
  const hubGw = wgNetPart.replace(/\.\d+$/, '.1');

  const applyCommands = [];

  // 1. Dedicated API user (upsert)
  const existingApiUser = existingUsers.find((u) => u.name === credentials.username);
  if (existingApiUser?.['.id']) {
    applyCommands.push({ path: '/user/set', params: { '.id': existingApiUser['.id'], password: credentials.password, group: 'full' } });
  } else {
    applyCommands.push({ path: '/user/add', params: { name: credentials.username, password: credentials.password, group: 'full', comment: 'MyCollectiveSub Cloud API' } });
  }

  // 2. Self-signed TLS cert & HTTPS REST (:443)
  if (!certs.some((c) => c.name === 'mcs-api-cert')) {
    applyCommands.push(
      { path: '/certificate/add', params: { name: 'mcs-api-cert', 'common-name': 'mycollectivesub-router', 'key-size': '2048', 'days-valid': '3650', 'key-usage': 'tls-server' } },
      { path: '/certificate/sign', params: { number: 'mcs-api-cert' } }
    );
  }
  const wwwSsl = services.find((s) => s.name === 'www-ssl');
  if (wwwSsl?.['.id']) {
    applyCommands.push({ path: '/ip/service/set', params: { '.id': wwwSsl['.id'], certificate: 'mcs-api-cert', port: '443', disabled: 'no' } });
  }

  // 3. WireGuard tunnel IP, peer & firewall rule (idempotent replace)
  for (const addr of ipAddrs.filter((a) => a.interface === 'wg-vps')) {
    if (addr['.id']) applyCommands.push({ path: '/ip/address/remove', params: { '.id': addr['.id'] } });
  }
  applyCommands.push({
    path: '/ip/address/add',
    params: { address: `${vps.wg_tunnel_ip}/${wgPrefixLen}`, interface: 'wg-vps', comment: 'MyCollectiveSub VPS Tunnel' },
  });

  for (const p of wgPeers.filter((x) => x.interface === 'wg-vps')) {
    if (p['.id']) applyCommands.push({ path: '/interface/wireguard/peers/remove', params: { '.id': p['.id'] } });
  }
  applyCommands.push({
    path: '/interface/wireguard/peers/add',
    params: {
      interface: 'wg-vps',
      'endpoint-address': vps.public_ip,
      'endpoint-port': String(vps.wg_port || 51820),
      'public-key': vps.wg_public_key,
      'allowed-address': wgSubnetStr,
      'persistent-keepalive': '25s',
      comment: 'MyCollectiveSub VPS Hub',
    },
  });

  if (!fwRules.some((r) => r.comment === 'MCS Allow WG API')) {
    applyCommands.push({
      path: '/ip/firewall/filter/add',
      params: { chain: 'input', 'in-interface': 'wg-vps', protocol: 'tcp', 'dst-port': '443', action: 'accept', 'place-before': '0', comment: 'MCS Allow WG API' },
    });
  }

  // 4. 10-second strict wall-clock expiry sweep script & scheduler (upsert)
  const existingSweep = sysScripts.find((s) => s.name === EXPIRY_SCRIPT_NAME);
  if (existingSweep?.['.id']) {
    applyCommands.push({ path: '/system/script/set', params: { '.id': existingSweep['.id'], source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' } });
  } else {
    applyCommands.push({ path: '/system/script/add', params: { name: EXPIRY_SCRIPT_NAME, source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' } });
  }
  const existingExpSched = sysScheds.find((s) => s.name === EXPIRY_SCRIPT_NAME);
  const expSchedParams = { 'start-time': 'startup', interval: '10s', 'on-event': `/system script run ${EXPIRY_SCRIPT_NAME}`, policy: 'read,write,test', disabled: 'no' };
  if (existingExpSched?.['.id']) {
    applyCommands.push({ path: '/system/scheduler/set', params: { '.id': existingExpSched['.id'], ...expSchedParams } });
  } else {
    applyCommands.push({ path: '/system/scheduler/add', params: { name: EXPIRY_SCRIPT_NAME, ...expSchedParams } });
  }

  // 5. 60-second self-healing VPS failover watchdog (upsert)
  if (router?.polling_secret) {
    const syncUrl = `${cleanCloud}/api/onboarding/vps-sync`;
    const sec = router.polling_secret;
    const watchdogSource = `:if ([/ping ${hubGw} count=2] = 0) do={ :do { /interface wireguard disable [find where name="wg-vps"]; :delay 2s; /interface wireguard enable [find where name="wg-vps"] } on-error={}; :do { :local wgK [/interface wireguard get [find where name="wg-vps"] public-key]; /tool fetch url="${syncUrl}" http-method=post http-header-field="Content-Type: application/json" http-data=("{\\"secret\\":\\"${sec}\\",\\"wg_public_key\\":\\"" . $wgK . "\\"}") mode=https check-certificate=no keep-result=no } on-error={}; :do { /tool fetch url="${syncUrl}?secret=${sec}" dst-path="mcs-vps-sync.rsc" mode=https check-certificate=no; /import mcs-vps-sync.rsc; /file remove mcs-vps-sync.rsc } on-error={} }`;
    const existingWd = sysScripts.find((s) => s.name === 'an-watchdog-script');
    if (existingWd?.['.id']) {
      applyCommands.push({ path: '/system/script/set', params: { '.id': existingWd['.id'], source: watchdogSource, policy: 'read,write,test' } });
    } else {
      applyCommands.push({ path: '/system/script/add', params: { name: 'an-watchdog-script', source: watchdogSource, policy: 'read,write,test' } });
    }
    const existingWdSched = sysScheds.find((s) => s.name === 'an-power-watchdog');
    const wdSchedParams = { 'start-time': 'startup', interval: '60s', 'on-event': '/system script run an-watchdog-script', policy: 'read,write,test', disabled: 'no' };
    if (existingWdSched?.['.id']) {
      applyCommands.push({ path: '/system/scheduler/set', params: { '.id': existingWdSched['.id'], ...wdSchedParams } });
    } else {
      applyCommands.push({ path: '/system/scheduler/add', params: { name: 'an-power-watchdog', ...wdSchedParams } });
    }
  }

  // 6. MAC-cookie auto-reconnect (4w2d) + Strict First-Login Expiry v3 (preserving unrelated vendor hooks)
  for (const sp of hsServerProfs) {
    if (sp['.id']) {
      applyCommands.push({
        path: '/ip/hotspot/profile/set',
        params: { '.id': sp['.id'], 'login-by': 'cookie,http-chap,http-pap,mac-cookie', 'http-cookie-lifetime': '4w2d' },
      });
    }
  }
  for (const up of hsUserProfs) {
    if (up['.id']) {
      const existingHook = up['on-login'] || '';
      const unrelated = existingHook.replace(/# AN voucher expiry v\d+[\s\S]*?# End AN voucher expiry v\d+\s*/g, '');
      applyCommands.push({
        path: '/ip/hotspot/user/profile/set',
        params: {
          '.id': up['.id'],
          'on-login': FIRST_LOGIN_SCRIPT + '\n' + unrelated,
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
