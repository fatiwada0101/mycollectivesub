import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createProvisionerServer, isValidWgPublicKey } from '../vps-provisioner/server.mjs';
import { computeFreeRouterSlot, maskVpsHub } from '../lib/vps-hub.js';
import {
  generateZeroTouchRouterScript,
  generateBootstrapToken,
  hashBootstrapToken,
} from '../lib/zero-touch-onboarding.js';
import {
  encodeWordLength,
  decodeWordLength,
  encodeSentence,
  parseSentences,
  RouterOsBinaryClient,
} from '../lib/routeros-api.js';
import { EXPIRY_SCRIPT_NAME, LOGIN_MARKER } from '../lib/voucher-expiry.js';

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
  const [middlewareSrc, locationsSrc, vpsBootstrapSrc, vpsInstallerSrc, desktopMainSrc, androidPluginSrc, androidBridgeSrc] = await Promise.all([
    read('middleware.js'),
    read('app/super-admin/components/LocationsTab.js'),
    read('app/api/super-admin/vps-hubs/bootstrap/route.js'),
    read('app/api/onboarding/vps-installer/route.js'),
    read('desktop/main.mjs'),
    read('mobile/android/MikroTikLocalPlugin.java'),
    read('mobile/src/mikrotik-native.js'),
  ]);
  assert.ok(middlewareSrc.includes("'/api/onboarding/'"), 'onboarding callbacks must be CSRF-exempt');
  assert.ok(locationsSrc.includes('ZeroTouchHubPanel'), 'ZeroTouchHubPanel must be mounted inside LocationsTab');
  assert.ok(vpsBootstrapSrc.includes('#cloud-config'), 'VPS bootstrap must produce cloud-init YAML');
  assert.ok(vpsInstallerSrc.includes('mycollectivesub-vps-provisioner.service'), 'VPS installer must register systemd provisioner');
  assert.ok(desktopMainSrc.includes('onboardLocalRouter'), 'Desktop wrapper must delegate to onboardLocalRouter');
  assert.ok(androidPluginSrc.includes('executeBatch'), 'Android native plugin must expose executeBatch over port 8728');
  assert.ok(androidBridgeSrc.includes('FIRST_LOGIN_SCRIPT') && androidBridgeSrc.includes('EXPIRY_SWEEP_SCRIPT'), 'Android bridge must enforce strict First-Login Expiry v3 defaults');
});
