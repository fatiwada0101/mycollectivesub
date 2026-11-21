import crypto from 'node:crypto';
import {
  EXPIRY_SCRIPT_NAME,
  FIRST_LOGIN_SCRIPT,
  EXPIRY_SWEEP_SCRIPT,
  LOGIN_MARKER,
} from './voucher-expiry.js';

export function generateBootstrapToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashBootstrapToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function generateApiPassword(length = 20) {
  // RouterOS-friendly URL/CLI-safe password without quotes, backslashes, or $
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#_-';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function escapeRouterOsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

/**
 * Generates a complete, idempotent RouterOS v7.12+ zero-touch onboarding script (.rsc).
 *
 * Defaults baked into EVERY onboarded router:
 *   1. Dedicated full-group REST API user + self-signed TLS cert + www-ssl (port 443)
 *   2. Outbound WireGuard tunnel (wg-vps) -> selected VPS Hub with 25s keepalive (works behind CGNAT)
 *   3. NTP clock synchronization (Africa/Lagos + Google/Cloudflare IP fallback + IP Cloud time)
 *   4. Hotspot server profiles: login-by=cookie,http-chap,http-pap,mac-cookie, http-cookie-lifetime=4w2d
 *   5. ALL Hotspot user profiles: add-mac-cookie=yes, mac-cookie-timeout=4w2d, keepalive-timeout=2m,
 *      plus strict First-Login Wall-Clock Expiry v3 (# AN voucher expiry v3) on-login hook
 *   6. 10-second startup sweep scheduler (an-voucher-expiry-v1) expiring vouchers online OR offline
 *   7. Power-cut WireGuard auto-recovery watchdog (an-power-watchdog)
 *   8. Optional HTTPS callback posting the router's newly generated WireGuard public key back to
 *      the cloud app so the VPS Hub auto-registers the peer with ZERO SSH.
 */
export function generateZeroTouchRouterScript({
  routerName = 'MyCollectiveSub-Router',
  apiUsername = 'mycollectivesub',
  apiPassword = '',
  vpsPublicIp,
  vpsWgPort = 51820,
  vpsWgPublicKey,
  vpsWgSubnet = '10.100.0.0/16',
  tunnelIp,
  dnsName = 'hotspot.mycollectivesub.net',
  timeZone = 'Africa/Lagos',
  preserveExistingConfig = true,
  callbackUrl = '',
  bootstrapToken = '',
  heartbeatUrl = '',
  vpsSyncUrl = '',
  pollingSecret = '',
}) {
  if (!vpsPublicIp || !vpsWgPublicKey || !tunnelIp) {
    throw new Error('vpsPublicIp, vpsWgPublicKey, and tunnelIp are required to generate the zero-touch script');
  }

  const safeIdentity = escapeRouterOsString(String(routerName).replace(/[^\w .-]/g, '').trim() || 'MyCollectiveSub-Router');
  const safeApiUser = escapeRouterOsString(apiUsername || 'mycollectivesub');
  const safeApiPass = escapeRouterOsString(apiPassword || generateApiPassword());
  const safeDnsName = escapeRouterOsString(dnsName || 'hotspot.mycollectivesub.net');
  const safeTz = escapeRouterOsString(timeZone || 'Africa/Lagos');
  const [subnetIpPart, subnetMaskPart] = String(vpsWgSubnet || '10.100.0.0/16').split('/');
  const wgPrefixLen = Number(subnetMaskPart) >= 16 && Number(subnetMaskPart) <= 29 ? Number(subnetMaskPart) : 16;
  const hubGatewayIp = subnetIpPart.replace(/\.\d+$/, '.1');
  const onLoginEscaped = escapeRouterOsString(FIRST_LOGIN_SCRIPT);
  const sweepEscaped = escapeRouterOsString(EXPIRY_SWEEP_SCRIPT);

  const lines = [
    '# ============================================================================',
    `# MyCollectiveSub Zero-Touch Onboarding Script (${LOGIN_MARKER})`,
    `# Router: ${safeIdentity} | Tunnel: ${tunnelIp} -> ${vpsPublicIp}:${vpsWgPort}`,
    '# Enforces: WireGuard Cloud Tunnel + MAC-Cookie Reconnect (4w2d) +',
    '#           Strict First-Login Wall-Clock Expiry (Online & Offline, 10s sweep)',
    '# ============================================================================',
    '',
    '# 1. Identity & NTP Clock Sync (required for first-login wall-clock expiry)',
    `/system identity set name="${safeIdentity}"`,
    `/system clock set time-zone-name="${safeTz}"`,
    '/ip cloud set ddns-enabled=yes update-time=yes',
    ':do { /system ntp client set enabled=yes servers=216.239.35.0,1.1.1.1 } on-error={',
    '  :do { /system ntp client set enabled=yes primary-ntp=216.239.35.0 secondary-ntp=1.1.1.1 } on-error={}',
    '}',
    '',
    '# 2. Dedicated Cloud API Admin User & HTTPS REST API (www-ssl :443)',
    `:if ([:len [/user find where name="${safeApiUser}"]] = 0) do={`,
    `  /user add name="${safeApiUser}" password="${safeApiPass}" group=full comment="MyCollectiveSub Cloud API"`,
    '} else={',
    `  /user set [find where name="${safeApiUser}"] password="${safeApiPass}" group=full`,
    '}',
    ':if ([:len [/certificate find where name="mcs-api-cert"]] = 0) do={',
    '  /certificate add name="mcs-api-cert" common-name="mycollectivesub-router" key-size=2048 days-valid=3650 key-usage=tls-server',
    '  /certificate sign "mcs-api-cert"',
    '}',
    '/ip service set www-ssl certificate="mcs-api-cert" port=443 disabled=no',
    '',
    '# 3. Outbound WireGuard Cloud Tunnel (wg-vps -> VPS Hub)',
    ':if ([:len [/interface wireguard find where name="wg-vps"]] = 0) do={',
    '  /interface wireguard add name="wg-vps" listen-port=13231 mtu=1420',
    '}',
    ':do { /ip address remove [find where interface="wg-vps"] } on-error={}',
    `/ip address add address="${tunnelIp}/${wgPrefixLen}" interface="wg-vps" comment="MyCollectiveSub VPS Tunnel"`,
    ':do { /interface wireguard peers remove [find where interface="wg-vps"] } on-error={}',
    `/interface wireguard peers add interface="wg-vps" endpoint-address="${escapeRouterOsString(vpsPublicIp)}" endpoint-port=${Number(vpsWgPort) || 51820} public-key="${escapeRouterOsString(vpsWgPublicKey)}" allowed-address="${escapeRouterOsString(vpsWgSubnet)}" persistent-keepalive=25s comment="MyCollectiveSub VPS Hub"`,
    ':if ([:len [/ip firewall filter find where comment="MCS Allow WG API"]] = 0) do={',
    '  /ip firewall filter add chain=input in-interface="wg-vps" protocol=tcp dst-port=443 action=accept place-before=0 comment="MCS Allow WG API"',
    '}',
    '',
    '# 4. Seamless MAC-Cookie Auto-Reconnect (All Server Profiles — preserves existing Hotspot setup)',
    '/ip hotspot profile set [find] login-by=cookie,http-chap,http-pap,mac-cookie http-cookie-lifetime=4w2d',
    preserveExistingConfig
      ? `:do { /ip hotspot profile set [find where default=no and dns-name=""] dns-name="${safeDnsName}" } on-error={}`
      : `:do { /ip hotspot profile set [find where default=no] dns-name="${safeDnsName}" } on-error={}`,
    '',
    '# 5. Strict First-Login Wall-Clock Expiry v3 + MAC-Cookie (ALL User Profiles — preserves existing vendor hooks)',
    `:local mcsOnLogin "${onLoginEscaped}"`,
    ':foreach pId in=[/ip hotspot user profile find] do={',
    '  :local curHook [/ip hotspot user profile get $pId on-login]',
    '  :local curStr ""',
    '  :if ([:typeof $curHook] = "str") do={ :set curStr $curHook }',
    '  :if ([:typeof [:find $curStr "# AN voucher expiry v3"]] != "num") do={',
    '    :local finalHook $mcsOnLogin',
    '    :if (([:len $curStr] > 0) && ([:typeof [:find $curStr "# AN voucher expiry v"]] != "num")) do={',
    '      :set finalHook ($mcsOnLogin . "\\n" . $curStr)',
    '    }',
    '    /ip hotspot user profile set $pId on-login=$finalHook',
    '  }',
    '  /ip hotspot user profile set $pId add-mac-cookie=yes mac-cookie-timeout=4w2d keepalive-timeout=2m',
    '}',
    '',
    '# 6. 10-Second Offline/Online Expiry Sweep Script & Startup Scheduler',
    `:local mcsSweep "${sweepEscaped}"`,
    `:if ([:len [/system script find where name="${EXPIRY_SCRIPT_NAME}"]] = 0) do={`,
    `  /system script add name="${EXPIRY_SCRIPT_NAME}" policy=read,write,test source=$mcsSweep`,
    '} else={',
    `  /system script set [find where name="${EXPIRY_SCRIPT_NAME}"] policy=read,write,test source=$mcsSweep`,
    '}',
    `:if ([:len [/system scheduler find where name="${EXPIRY_SCRIPT_NAME}"]] = 0) do={`,
    `  /system scheduler add name="${EXPIRY_SCRIPT_NAME}" start-time=startup interval=10s policy=read,write,test on-event="/system script run ${EXPIRY_SCRIPT_NAME}" disabled=no`,
    '} else={',
    `  /system scheduler set [find where name="${EXPIRY_SCRIPT_NAME}"] start-time=startup interval=10s policy=read,write,test on-event="/system script run ${EXPIRY_SCRIPT_NAME}" disabled=no`,
    '}',
    '',
    '# 7. Power-Cut & Expired-VPS Auto-Recovery Watchdog (runs every 60s)',
    ':do { /system scheduler remove [find where name="an-power-watchdog"] } on-error={}',
    ':do { /system script remove [find where name="an-watchdog-script"] } on-error={}',
    (() => {
      const failoverCommands = vpsSyncUrl && pollingSecret
        ? `; :do { :local wgK [/interface wireguard get [find where name=\\"wg-vps\\"] public-key]; /tool fetch url=\\"${escapeRouterOsString(vpsSyncUrl)}\\" http-method=post http-header-field=\\"Content-Type: application/json\\" http-data=(\\"{\\\\\\"secret\\\\\\":\\\\\\"${escapeRouterOsString(pollingSecret)}\\\\\\",\\\\\\"wg_public_key\\\\\\":\\\\\\"\\" . \\$wgK . \\"\\\\\\"}\\") mode=https check-certificate=no keep-result=no } on-error={}; :do { /tool fetch url=\\"${escapeRouterOsString(vpsSyncUrl)}?secret=${escapeRouterOsString(pollingSecret)}\\" dst-path=\\"mcs-vps-sync.rsc\\" mode=https check-certificate=no; /import mcs-vps-sync.rsc; /file remove mcs-vps-sync.rsc } on-error={}`
        : '';
      const hbCmd = heartbeatUrl
        ? `; :do { /tool fetch url=\\"${escapeRouterOsString(heartbeatUrl)}\\" mode=https check-certificate=no keep-result=no } on-error={}`
        : '';
      return `/system script add name="an-watchdog-script" policy=read,write,test source=":if ([/ping ${hubGatewayIp} count=2] = 0) do={ :do { /interface wireguard disable [find where name=\\"wg-vps\\"]; :delay 2s; /interface wireguard enable [find where name=\\"wg-vps\\"] } on-error={}${failoverCommands} }${hbCmd}"`;
    })(),
    '/system scheduler add name="an-power-watchdog" start-time=startup interval=60s policy=read,write,test on-event="/system script run an-watchdog-script" disabled=no',
  ];

  if (callbackUrl && bootstrapToken) {
    lines.push(
      '',
      '# 8. Auto-Register Router WireGuard Public Key on VPS Hub (Zero SSH)',
      ':local wgPubKey [/interface wireguard get [find where name="wg-vps"] public-key]',
      `:local cbPayload ("{\\"token\\":\\"${escapeRouterOsString(bootstrapToken)}\\",\\"wg_public_key\\":\\"" . $wgPubKey . "\\"}")`,
      `/tool fetch url="${escapeRouterOsString(callbackUrl)}" http-method=post http-header-field="Content-Type: application/json" http-data=$cbPayload mode=https check-certificate=no keep-result=no`
    );
  }

  lines.push(
    '',
    `:log info "MyCollectiveSub Zero-Touch Onboarding complete for ${safeIdentity}"`,
    `:put "SUCCESS: ${safeIdentity} onboarded with WireGuard + MAC-Cookie + Strict First-Login Expiry v3!"`
  );

  return lines.join('\n');
}
