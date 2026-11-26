import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createProvisionerServer, isValidWgPublicKey } from '../vps-provisioner/server.mjs';
import {
  computeFreeRouterSlot,
  maskVpsHub,
  parseCidrSubnet,
  suggestNextVpsSubnet,
  selectHubForRouter,
  getHubCapacityMetrics,
  assertSafePublicProvisionerUrl,
} from '../lib/vps-hub.js';
import {
  generateZeroTouchRouterScript,
  generateBootstrapToken,
  hashBootstrapToken,
  resolvePublicBaseUrl,
} from '../lib/zero-touch-onboarding.js';
import {
  encodeWordLength,
  decodeWordLength,
  encodeSentence,
  parseSentences,
  RouterOsBinaryClient,
} from '../lib/routeros-api.js';
import { EXPIRY_SCRIPT_NAME, LOGIN_MARKER } from '../lib/voucher-expiry.js';
import { evaluateRouterBillingState, DEFAULT_ROUTER_BILLING_SETTINGS } from '../lib/router-billing.js';

const read = (file) => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const VALID_WG_KEY_1 = 'kL8x9P2mN4qR7tV1wY5zA3bC6dE8fG0hJ2kL4mN6pQ8=';
const VALID_WG_KEY_2 = 'mN4qR7tV1wY5zA3bC6dE8fG0hJ2kL4mN6pQ8kL8x9P2=';

test('SQL migration is idempotent, enables RLS on vps_hubs, and allocates conflict-free tunnel slots', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.routers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        ip_address TEXT,
        port INTEGER DEFAULT 443
      );
    `);

    const sql = await read('supabase/migrations/20261121000001_zero_touch_vps_hubs.sql');
    await db.exec(sql);
    await db.exec(sql); // Must be safe to re-apply

    // Verify RLS is enabled on public.vps_hubs
    const rls = (await db.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'vps_hubs'")).rows[0];
    assert.equal(rls.relrowsecurity, true, 'RLS must be enabled on vps_hubs');

    // Insert VPS hub + existing router occupying 10.100.0.2 and port 8443
    const hub = (await db.query(
      `INSERT INTO public.vps_hubs (name, public_ip, provisioner_url, api_secret, wg_public_key, wg_subnet, port_range_start, port_range_end, is_default)
       VALUES ('Hub 1', '2.25.15.1', 'https://2.25.15.1:9443', 'super-secret-value', $1, '10.100.0.0/24', 8443, 8445, true)
       RETURNING id`,
      [VALID_WG_KEY_1]
    )).rows[0];

    await db.query(
      `INSERT INTO public.routers (name, ip_address, port, vps_hub_id, wg_tunnel_ip)
       VALUES ('Sabon Layi', '2.25.15.1', 8443, $1, '10.100.0.2')`,
      [hub.id]
    );

    const slot = (await db.query('SELECT public.allocate_vps_router_slot($1) AS slot', [hub.id])).rows[0].slot;
    assert.equal(slot.wg_tunnel_ip, '10.100.0.3');
    assert.equal(slot.external_port, 8444);
    assert.equal(slot.public_ip, '2.25.15.1');
    assert.equal(slot.wg_public_key, VALID_WG_KEY_1);
  } finally {
    await db.close();
  }
});

test('VPS WireGuard Auto-Provisioner authenticates requests, validates inputs, and registers/removes peers in DRY_RUN mode', async () => {
  const secret = 'unit-test-provisioner-secret-123456';
  const server = createProvisionerServer({
    apiSecret: secret,
    dryRun: true,
    dryRunPublicKey: VALID_WG_KEY_1,
    publicIp: '2.25.15.1',
    wgSubnet: '10.100.0.0/24',
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Unauthorized request must fail with 401
    const unauth = await fetch(`${baseUrl}/health`);
    assert.equal(unauth.status, 401);

    // Authorized /health returns WG public key & metadata
    const healthRes = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.wgPublicKey, VALID_WG_KEY_1);
    assert.equal(health.peerCount, 0);

    // Invalid WG key must fail with 400 (shell injection guard)
    const badKey = await fetch(`${baseUrl}/api/peers/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: 'bad; rm -rf /', tunnelIp: '10.100.0.3', externalPort: 8444 }),
    });
    assert.equal(badKey.status, 400);

    // Valid peer registration succeeds
    const reg = await fetch(`${baseUrl}/api/peers/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: VALID_WG_KEY_2,
        tunnelIp: '10.100.0.3',
        externalPort: 8444,
        routerName: 'Kano Branch 2',
      }),
    });
    assert.equal(reg.status, 200);
    const regJson = await reg.json();
    assert.equal(regJson.success, true);
    assert.equal(regJson.peer.tunnelIp, '10.100.0.3');

    // Peer shows up in /api/peers
    const list = await (await fetch(`${baseUrl}/api/peers`, { headers: { Authorization: `Bearer ${secret}` } })).json();
    assert.equal(list.peers.length, 1);
    assert.equal(list.peers[0].publicKey, VALID_WG_KEY_2);

    // Removing peer cleans it up
    const rem = await fetch(`${baseUrl}/api/peers/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: VALID_WG_KEY_2, tunnelIp: '10.100.0.3', externalPort: 8444 }),
    });
    assert.equal(rem.status, 200);
    const listAfter = await (await fetch(`${baseUrl}/api/peers`, { headers: { Authorization: `Bearer ${secret}` } })).json();
    assert.equal(listAfter.peers.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('VPS slot allocator avoids IP/port collisions and maskVpsHub never leaks api_secret', () => {
  assert.equal(isValidWgPublicKey(VALID_WG_KEY_1), true);
  assert.equal(isValidWgPublicKey('not-a-valid-key'), false);

  const hub = {
    id: 'hub-1',
    name: 'Hostinger 1',
    public_ip: '2.25.15.1',
    provisioner_url: 'https://2.25.15.1:9443',
    api_secret: 'abcdef1234567890secret9999',
    wg_subnet: '10.100.0.0/24',
    port_range_start: 8443,
    port_range_end: 8445,
  };

  const masked = maskVpsHub(hub);
  assert.equal(masked.api_secret, undefined);
  assert.equal(masked.has_secret, true);
  assert.ok(!masked.api_secret_masked.includes('secret'));

  const slot = computeFreeRouterSlot(hub, [
    { id: 'r1', ip_address: '2.25.15.1', port: 8443, vps_hub_id: 'hub-1', wg_tunnel_ip: '10.100.0.2' },
    { id: 'r2', ip_address: '2.25.15.1', port: 8444, vps_hub_id: null, wg_tunnel_ip: '10.100.0.3' },
  ]);
  assert.equal(slot.wg_tunnel_ip, '10.100.0.4');
  assert.equal(slot.external_port, 8445);

  assert.throws(() => computeFreeRouterSlot(hub, [
    { id: 'r1', ip_address: '2.25.15.1', port: 8443, wg_tunnel_ip: '10.100.0.2' },
    { id: 'r2', ip_address: '2.25.15.1', port: 8444, wg_tunnel_ip: '10.100.0.3' },
    { id: 'r3', ip_address: '2.25.15.1', port: 8445, wg_tunnel_ip: '10.100.0.4' },
  ]), /No free external ports/);
});

test('Zero-touch RouterOS script enforces WireGuard, MAC-cookie (4w2d), and strict First-Login Expiry v3 defaults', () => {
  const token = generateBootstrapToken();
  assert.equal(token.length, 64);
  assert.equal(hashBootstrapToken(token).length, 64);
  assert.notEqual(hashBootstrapToken(token), token);

  const script = generateZeroTouchRouterScript({
    routerName: 'Kano Hub 2',
    apiUsername: 'mycollectivesub',
    apiPassword: 'StrongPassword123',
    vpsPublicIp: '2.25.15.1',
    vpsWgPort: 51820,
    vpsWgPublicKey: VALID_WG_KEY_1,
    vpsWgSubnet: '10.100.0.0/24',
    tunnelIp: '10.100.0.5',
    callbackUrl: 'https://www.mycollectivesub.si/api/onboarding/bootstrap',
    bootstrapToken: token,
  });

  assert.ok(script.includes('/interface wireguard add name="wg-vps"'));
  assert.ok(script.includes('endpoint-address="2.25.15.1" endpoint-port=51820'));
  assert.ok(script.includes('persistent-keepalive=25s'));
  assert.ok(script.includes('login-by=cookie,http-chap,http-pap,mac-cookie http-cookie-lifetime=4w2d'));
  assert.ok(script.includes('add-mac-cookie=yes mac-cookie-timeout=4w2d keepalive-timeout=2m'));
  assert.ok(script.includes(LOGIN_MARKER), 'must embed v3 on-login expiry marker');
  assert.ok(script.includes(EXPIRY_SCRIPT_NAME), 'must install 10s sweep script & scheduler');
  assert.ok(script.includes('interval=10s'), 'must schedule 10-second offline expiry sweep');
  assert.ok(script.includes('limit-uptime'), 'v3 script must auto-convert non-ANV1 limit-uptime vouchers');
  assert.ok(script.includes('and dns-name=""'), 'default preserveExistingConfig must not overwrite existing hotspot dns-name');
  assert.ok(script.includes('curHook'), 'default preserveExistingConfig must preserve unrelated vendor on-login hooks');
  assert.ok(script.includes('/api/onboarding/bootstrap'), 'must include zero-SSH VPS callback');
});

test('RouterOS Binary API client encodes/decodes word lengths and executes commands against a TCP server', async () => {
  for (const len of [0, 1, 127, 128, 16383, 16384, 2097151, 2097152]) {
    const encoded = encodeWordLength(len);
    const decoded = decodeWordLength(encoded, 0);
    assert.equal(decoded.length, len);
    assert.equal(decoded.bytesRead, encoded.length);
  }

  // Spin up mock RouterOS Binary API server on ephemeral localhost port
  const mockServer = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { sentences, remaining } = parseSentences(buf);
      buf = remaining;
      for (const words of sentences) {
        const cmd = words[0];
        if (cmd === '/login') {
          const pass = words.find((w) => w.startsWith('=password='))?.slice(10);
          if (pass === 'okpass') {
            socket.write(encodeSentence(['!done']));
          } else {
            socket.write(encodeSentence(['!trap', '=message=invalid user name or password']));
            socket.write(encodeSentence(['!done']));
          }
        } else if (cmd === '/system/resource/print') {
          socket.write(encodeSentence(['!re', '=version=7.20.8 (long-term)', '=board-name=RB750Gr3']));
          socket.write(encodeSentence(['!done']));
        } else if (cmd === '/interface/wireguard/print') {
          socket.write(encodeSentence(['!re', '=.id=*1', '=name=wg-vps', `=public-key=${VALID_WG_KEY_2}`]));
          socket.write(encodeSentence(['!done']));
        }
      }
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const { port } = mockServer.address();

  try {
    const badClient = new RouterOsBinaryClient({ host: '127.0.0.1', port, timeoutMs: 3000 });
    await badClient.connect();
    await assert.rejects(badClient.login('admin', 'wrong'), /invalid user name or password/);
    badClient.close();

    const client = new RouterOsBinaryClient({ host: '127.0.0.1', port, timeoutMs: 3000 });
    await client.connect();
    await client.login('admin', 'okpass');
    const res = await client.command('/system/resource/print');
    assert.equal(res.rows[0].version, '7.20.8 (long-term)');
    assert.equal(res.rows[0]['board-name'], 'RB750Gr3');

    const wg = await client.command('/interface/wireguard/print');
    assert.equal(wg.rows[0]['public-key'], VALID_WG_KEY_2);
    client.close();
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test('Zero-regression architecture guards: CSRF exemption, Phase 3 cloud-init/desktop/mobile scaffolding, and modular UI', async () => {
  const [middlewareSrc, locationsSrc, vpsBootstrapSrc, vpsInstallerSrc, vpsSyncSrc, vpsMigrateSrc, desktopMainSrc, androidPluginSrc, androidBridgeSrc] = await Promise.all([
    read('middleware.js'),
    read('app/super-admin/components/LocationsTab.js'),
    read('app/api/super-admin/vps-hubs/bootstrap/route.js'),
    read('app/api/onboarding/vps-installer/route.js'),
    read('app/api/onboarding/vps-sync/route.js'),
    read('app/api/super-admin/vps-hubs/migrate/route.js'),
    read('desktop/main.mjs'),
    read('mobile/android/MikroTikLocalPlugin.java'),
    read('mobile/src/mikrotik-native.js'),
  ]);
  assert.ok(middlewareSrc.includes("'/api/onboarding/'"), 'onboarding callbacks must be CSRF-exempt');
  assert.ok(locationsSrc.includes('ZeroTouchHubPanel'), 'ZeroTouchHubPanel must be mounted inside LocationsTab');
  assert.ok(vpsBootstrapSrc.includes('#cloud-config'), 'VPS bootstrap must produce cloud-init YAML');
  assert.ok(vpsInstallerSrc.includes('mycollectivesub-vps-provisioner.service'), 'VPS installer must register systemd provisioner');
  assert.ok(vpsSyncSrc.includes('endpoint-address') && vpsSyncSrc.includes('registerRouterPeerOnVps'), 'VPS sync must support automatic router failover');
  assert.ok(vpsMigrateSrc.includes('allocateRouterSlotForHub') && vpsMigrateSrc.includes('registerRouterPeerOnVps'), 'VPS migrate must move routers seamlessly to a replacement VPS');
  assert.ok(desktopMainSrc.includes('onboardLocalRouter'), 'Desktop wrapper must delegate to onboardLocalRouter');
  assert.ok(androidPluginSrc.includes('executeBatch'), 'Android native plugin must expose executeBatch over port 8728');
  assert.ok(androidBridgeSrc.includes('FIRST_LOGIN_SCRIPT') && androidBridgeSrc.includes('EXPIRY_SWEEP_SCRIPT'), 'Android bridge must enforce strict First-Login Expiry v3 defaults');
});

test('Optional monthly router billing enforcement toggles cleanly globally and per individual router', async () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const unpaidRouter = {
    id: 'r1',
    name: 'Branch 1',
    subscription_status: 'past_due',
    subscription_expires_at: '2026-11-10T00:00:00Z',
    billing_enforcement_override: 'inherit',
  };
  const paidRouter = {
    id: 'r2',
    name: 'Branch 2',
    subscription_status: 'active',
    subscription_expires_at: '2026-12-20T00:00:00Z',
    billing_enforcement_override: 'inherit',
  };

  // 1. Default global OFF -> never pauses any router
  assert.equal(DEFAULT_ROUTER_BILLING_SETTINGS.enabled, false);
  const offState = evaluateRouterBillingState(unpaidRouter, DEFAULT_ROUTER_BILLING_SETTINGS, now);
  assert.equal(offState.enforcementActive, false);
  assert.equal(offState.shouldPauseExpiry, false);
  assert.equal(offState.showSubscribeNotice, false);

  // 2. Global ON (pause_expiry) -> unpaid pauses expiry + shows notice; paid stays normal
  const onPause = { ...DEFAULT_ROUTER_BILLING_SETTINGS, enabled: true, mode: 'pause_expiry' };
  const unpaidState = evaluateRouterBillingState(unpaidRouter, onPause, now);
  assert.equal(unpaidState.shouldPauseExpiry, true);
  assert.equal(unpaidState.showSubscribeNotice, true);
  assert.ok(unpaidState.noticeMessage.length > 10);

  const paidState = evaluateRouterBillingState(paidRouter, onPause, now);
  assert.equal(paidState.shouldPauseExpiry, false);
  assert.equal(paidState.showSubscribeNotice, false);

  // 3. Global ON (notice_only) -> shows subscribe notice WITHOUT pausing expiry
  const onNoticeOnly = { ...DEFAULT_ROUTER_BILLING_SETTINGS, enabled: true, mode: 'notice_only' };
  const noticeState = evaluateRouterBillingState(unpaidRouter, onNoticeOnly, now);
  assert.equal(noticeState.shouldPauseExpiry, false);
  assert.equal(noticeState.showSubscribeNotice, true);

  // 4. Individual router override OFF (exempt) -> stays normal even when global is ON
  const exemptState = evaluateRouterBillingState({ ...unpaidRouter, billing_enforcement_override: 'force_off' }, onPause, now);
  assert.equal(exemptState.shouldPauseExpiry, false);
  assert.equal(exemptState.effectiveStatus, 'exempt');

  // 5. Individual router override ON -> enforces even when global is OFF
  const forceOnState = evaluateRouterBillingState({ ...unpaidRouter, billing_enforcement_override: 'force_on' }, DEFAULT_ROUTER_BILLING_SETTINGS, now);
  assert.equal(forceOnState.shouldPauseExpiry, true);
  assert.equal(forceOnState.showSubscribeNotice, true);

  // 6. Billing SQL migration is idempotent in PGlite
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE public.routers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);');
    const sql = await read('supabase/migrations/20261121000002_router_billing_enforcement.sql');
    await db.exec(sql);
    await db.exec(sql);
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='routers'")).rows.map((r) => r.column_name);
    assert.ok(cols.includes('billing_enforcement_override'));
    assert.ok(cols.includes('expiry_paused_by_billing'));
  } finally {
    await db.close();
  }
});

test('/16 CIDR scaling (1,000+ per VPS), reserved port 9443 guard, and 10,000+ multi-VPS auto-overflow', async () => {
  // 1. Parse /16 and /24 capacities accurately
  const s16 = parseCidrSubnet('10.100.0.0/16');
  assert.equal(s16.prefixLen, 16);
  assert.equal(s16.gatewayIp, '10.100.0.1');
  assert.equal(s16.gatewayCidr, '10.100.0.1/16');
  assert.equal(s16.totalUsableHosts, 65023);

  const s24 = parseCidrSubnet('10.100.0.0/24');
  assert.equal(s24.prefixLen, 24);
  assert.equal(s24.totalUsableHosts, 253);

  // 2. Non-overlapping /16 subnet auto-suggestion for 10,000+ fleet scaling
  assert.equal(suggestNextVpsSubnet([]), '10.100.0.0/16');
  assert.equal(suggestNextVpsSubnet([{ wg_subnet: '10.100.0.0/16' }]), '10.101.0.0/16');
  assert.equal(
    suggestNextVpsSubnet([{ wg_subnet: '10.100.0.0/24' }, { wg_subnet: '10.101.0.0/16' }]),
    '10.102.0.0/16'
  );

  // 3. JS slot allocator crosses /24 boundary cleanly (skips .0.255 and .1.0) & skips reserved port 9443
  const bigHub = {
    id: 'hub-16',
    name: 'KVM1-Hub-1',
    public_ip: '2.25.15.1',
    wg_subnet: '10.100.0.0/16',
    port_range_start: 9442,
    port_range_end: 18442,
    max_routers: 1000,
    is_active: true,
    is_default: true,
    status: 'online',
  };
  const occupied253 = [];
  for (let i = 2; i <= 254; i++) {
    occupied253.push({ id: `r-${i}`, vps_hub_id: 'hub-16', wg_tunnel_ip: `10.100.0.${i}`, port: 9442 });
  }
  const slotAcrossOctet = computeFreeRouterSlot(bigHub, occupied253);
  assert.equal(slotAcrossOctet.wg_tunnel_ip, '10.100.1.1', 'must roll cleanly past .0.254 -> .1.1 skipping .0.255 and .1.0');
  assert.equal(slotAcrossOctet.wg_prefix_len, 16);
  assert.equal(slotAcrossOctet.external_port, 9444, 'must skip reserved provisioner API port 9443');

  // 4. Multi-VPS automatic overflow when Hub 1 reaches max_routers (scales cleanly to 10,000+)
  const hub1 = { ...bigHub, id: 'h1', name: 'Hub 1', max_routers: 2, is_default: true, status: 'online' };
  const hub2 = { ...bigHub, id: 'h2', name: 'Hub 2', public_ip: '2.25.15.2', wg_subnet: '10.101.0.0/16', max_routers: 1000, is_default: false, status: 'online' };
  const twoOnHub1 = [
    { id: 'r1', vps_hub_id: 'h1' },
    { id: 'r2', vps_hub_id: 'h1' },
  ];
  const overflowPick = selectHubForRouter([hub1, hub2], twoOnHub1, { preferredHubId: null, allowOverflow: true });
  assert.equal(overflowPick.hub.id, 'h2', 'must automatically overflow from full Hub 1 to Hub 2');
  assert.equal(overflowPick.overflowedFrom?.id, 'h1');

  const metrics = getHubCapacityMetrics(hub2, 250);
  assert.equal(metrics.effective_capacity, 1000);
  assert.equal(metrics.remaining_slots, 750);

  // 5. RouterOS script uses dynamic /16 mask when hub is /16
  const script16 = generateZeroTouchRouterScript({
    routerName: 'Scale-Router-300',
    vpsPublicIp: '2.25.15.1',
    vpsWgPublicKey: VALID_WG_KEY_1,
    vpsWgSubnet: '10.100.0.0/16',
    tunnelIp: '10.100.1.46',
  });
  assert.ok(script16.includes('address="10.100.1.46/16"'), 'must emit dynamic /16 WireGuard address');
  assert.ok(script16.includes('allowed-address="10.100.0.0/16"'));

  // 6. PGlite verifies SQL migration 20261121000003 idempotency, /16 multi-octet rollover, and 9443 skip
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE TABLE public.routers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        ip_address TEXT,
        port INTEGER DEFAULT 443
      );
    `);
    const sql1 = await read('supabase/migrations/20261121000001_zero_touch_vps_hubs.sql');
    const sql3 = await read('supabase/migrations/20261121000003_scale_10k_vps_subnets.sql');
    await db.exec(sql1);
    await db.exec(sql3);
    await db.exec(sql3); // Idempotent re-apply

    const hub = (await db.query(
      `INSERT INTO public.vps_hubs (name, public_ip, provisioner_url, api_secret, wg_public_key, port_range_start)
       VALUES ('Scale Hub 1', '2.25.15.10', 'https://2.25.15.10:9443', 'secret', $1, 9442)
       RETURNING id, wg_subnet, port_range_end, max_routers`,
      [VALID_WG_KEY_1]
    )).rows[0];

    assert.equal(hub.wg_subnet, '10.100.0.0/16');
    assert.equal(hub.port_range_end, 18442);
    assert.equal(hub.max_routers, 1000);

    // Fill 10.100.0.2 .. 10.100.0.254 + port 9442
    await db.query(
      `INSERT INTO public.routers (name, ip_address, port, vps_hub_id, wg_tunnel_ip)
       SELECT 'R-' || gs, '2.25.15.10', CASE WHEN gs = 2 THEN 9442 ELSE 10000 + gs END, $1, '10.100.0.' || gs
       FROM generate_series(2, 254) AS gs`,
      [hub.id]
    );

    const pgSlot = (await db.query('SELECT public.allocate_vps_router_slot($1) AS slot', [hub.id])).rows[0].slot;
    assert.equal(pgSlot.wg_tunnel_ip, '10.100.1.1', 'SQL RPC must cross /24 boundary to 10.100.1.1');
    assert.equal(pgSlot.wg_prefix_len, 16);
    assert.equal(pgSlot.wg_gateway_ip, '10.100.0.1');
    assert.equal(pgSlot.external_port, 9444, 'SQL RPC must skip reserved port 9443');
    assert.equal(pgSlot.max_routers, 1000);
  } finally {
    await db.close();
  }
});

test('Bugbot deep-dive regression guards: Binary API =.id framing, RouterOS \\$wgK escaping, reserved port 9443 block, auth username, and billing-pause cron safety', async () => {
  // 1. Binary API transmits '=.id=*1' (with leading '=') and '.tag=t1' (without leading '=')
  let capturedWords = null;
  const mockServer = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { sentences, remaining } = parseSentences(buf);
      buf = remaining;
      for (const words of sentences) {
        if (words[0] === '/ip/hotspot/user/profile/set') capturedWords = words;
        socket.write(encodeSentence(['!done']));
      }
    });
  });
  await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
  try {
    const client = new RouterOsBinaryClient({ host: '127.0.0.1', port: mockServer.address().port, timeoutMs: 3000 });
    await client.connect();
    await client.command('/ip/hotspot/user/profile/set', { '.id': '*1', '.tag': 't1', 'add-mac-cookie': 'yes' });
    client.close();
    assert.ok(capturedWords.includes('=.id=*1'), 'RouterOS Binary API must encode .id as =.id=*1');
    assert.ok(!capturedWords.includes('.id=*1'), 'RouterOS Binary API must NOT emit bare .id=*1');
    assert.ok(capturedWords.includes('.tag=t1'), 'RouterOS Binary API must emit .tag without leading =');
  } finally {
    await new Promise((r) => mockServer.close(r));
  }

  // 2. Watchdog source="..." escapes \$wgK so RouterOS does not interpolate it to empty on .rsc import
  const wdScript = generateZeroTouchRouterScript({
    routerName: 'Failover-Test',
    vpsPublicIp: '2.25.15.1',
    vpsWgPublicKey: VALID_WG_KEY_1,
    vpsWgSubnet: '10.100.0.0/16',
    tunnelIp: '10.100.0.8',
    vpsSyncUrl: 'https://www.mycollectivesub.si/api/onboarding/vps-sync',
    pollingSecret: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
  });
  assert.ok(wdScript.includes('\\. \\$wgK') || wdScript.includes('. \\$wgK'), 'watchdog source must escape \\$wgK inside outer double quotes');
  assert.ok(!wdScript.includes('. $wgK .'), 'watchdog source must NOT leave unescaped $wgK inside outer double quotes');

  // 3. Provisioner rejects reserved port 9443 & 51820 as defense-in-depth
  const secret = 'bugbot-test-secret-123456';
  const provServer = createProvisionerServer({ apiSecret: secret, dryRun: true, wgPort: 51820, provisionerPort: 9443 });
  await new Promise((r) => provServer.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${provServer.address().port}`;
    for (const badPort of [9443, 51820]) {
      const res = await fetch(`${base}/api/peers/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: VALID_WG_KEY_2, tunnelIp: '10.100.0.9', externalPort: badPort }),
      });
      assert.equal(res.status, 400, `Provisioner must reject reserved port ${badPort}`);
    }
  } finally {
    await new Promise((r) => provServer.close(r));
  }

  // 4. Static security & integrity invariants across connectors, routes, and expiry cron
  const [connServer, connHtml, deskMain, mikrotikSrc, vpsSyncSrc, migrateSrc, onboardSrc, bootstrapSrc, vpsInstSrc] = await Promise.all([
    read('router-connector/server.mjs'),
    read('router-connector/index.html'),
    read('desktop/main.mjs'),
    read('lib/mikrotik.js'),
    read('app/api/onboarding/vps-sync/route.js'),
    read('app/api/super-admin/vps-hubs/migrate/route.js'),
    read('app/api/super-admin/routers/onboard/route.js'),
    read('app/api/onboarding/bootstrap/route.js'),
    read('app/api/onboarding/vps-installer/route.js'),
  ]);
  assert.ok(connServer.includes('username: adminUser'), 'local connector must send username to /api/super-admin/auth');
  assert.ok(deskMain.includes('username: adminUser'), 'desktop app must send username to /api/super-admin/auth');
  assert.ok(connHtml.includes('id="adminUser"'), 'local connector UI must provide Super Admin username input');
  assert.ok(mikrotikSrc.includes('expiry_paused_by_billing'), 'cleanupExpiredHotspotUsers must respect billing expiry pause');
  assert.ok(vpsSyncSrc.includes('\\\\$wgK'), 'vps-sync refreshed watchdog must escape \\$wgK');
  assert.ok(migrateSrc.includes('UUID_RE.test(targetHubId)'), 'vps migrate must validate targetHubId UUID before .or() filter');
  assert.ok(onboardSrc.includes('removeRouterPeerFromVps'), 'onboard route must roll back VPS peer on DB insert failure');
  assert.ok(bootstrapSrc.includes(".eq('bootstrap_token_hash', tokenHash)"), 'bootstrap callback must atomically claim single-use token');
  assert.ok(vpsInstSrc.includes('EXISTING_ADDR'), 'vps-installer must preserve existing wg0.conf subnet mask on live VPS');

  // 5. Round 2 deep-dive guards: SSRF protection, offline-router billing reconciliation, wallet transfer filter safety, live atomic cutover
  assert.equal(assertSafePublicProvisionerUrl('https://2.25.15.1:9443'), 'https://2.25.15.1:9443');
  assert.equal(assertSafePublicProvisionerUrl('vps1.mycollectivesub.si:9443'), 'https://vps1.mycollectivesub.si:9443');
  for (const ssrfUrl of [
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1:9443',
    'http://localhost:3000',
    'http://10.0.0.1:9443',
    'http://192.168.1.1:9443',
    'http://172.16.0.5:9443',
    'http://[::1]:9443',
    'file:///etc/passwd',
  ]) {
    assert.throws(() => assertSafePublicProvisionerUrl(ssrfUrl), `SSRF guard must block ${ssrfUrl}`);
  }

  const [billingLib, routerHealthCron, walletTransfer, validateRoute] = await Promise.all([
    read('lib/router-billing.js'),
    read('app/api/cron/router-health/route.js'),
    read('app/api/wallet/transfer/route.js'),
    read('app/api/vouchers/validate/route.js'),
  ]);
  assert.ok(billingLib.includes('canCommitPausedFlag'), 'router-billing must not mark DB synced when offline MikroTik push fails');
  assert.ok(routerHealthCron.includes('syncRoutersBillingState'), 'router-health cron must reconcile due-date billing enforcement & offline routers');
  assert.ok(!walletTransfer.includes('.or(`email.ilike.'), 'wallet transfer must not interpolate user input into PostgREST .or()');
  assert.ok(migrateSrc.includes('an-vps-cutover') && migrateSrc.includes('routerTlsAgent'), 'vps migrate must support atomic live cutover over self-signed TLS');
  assert.ok(vpsSyncSrc.includes('[:pick $curPeers 0]'), 'vps-sync must safely index RouterOS find arrays');
  assert.ok(validateRoute.includes('toRouterUptime'), 'voucher validate auto-provision must use universal durationSeconds mapping');

  // 6. Pre-configured router hardening: no invalid place-before=0 in .rsc, free WireGuard listen-port loop, and localhost URL bypass
  assert.ok(!scriptOrPlaceBeforeHasZero(wdScript), 'zero-touch .rsc script must not use place-before=0 without an interactive print');
  assert.ok(wdScript.includes('place-before=$mcsFirstFw') && wdScript.includes('wgListenPort'), 'zero-touch .rsc must resolve firewall .id dynamically and avoid port collisions');
  const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    assert.equal(resolvePublicBaseUrl(new Request('https://www.mycollectivesub.si/api/test')), 'https://www.mycollectivesub.si');
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.mycollectivesub.si/';
    assert.equal(resolvePublicBaseUrl(new Request('https://www.mycollectivesub.si/api/test')), 'https://custom.mycollectivesub.si');
  } finally {
    if (prevAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;
  }
});

function scriptOrPlaceBeforeHasZero(rsc) {
  return /\bplace-before=0\b/.test(rsc);
}
