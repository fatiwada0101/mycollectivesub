/**
 * Pure Node.js MikroTik RouterOS Local Client (Zero npm dependencies).
 *
 * Supports BOTH:
 *   1. RouterOS Binary API (TCP port 8728 / TLS port 8729) — enabled by default
 *      on brand-new factory MikroTik routers even before SSL/REST is configured.
 *   2. RouterOS REST API (HTTPS 443 / HTTP 80) — automatic fallback when Binary
 *      API is closed or unavailable.
 *
 * Used by the Local Plug & Play Router Connector (`router-connector/`) to deliver
 * true Mikroticket-style zero-touch onboarding when connected to the router's Wi-Fi.
 */

import net from 'node:net';
import tls from 'node:tls';
import { Agent } from 'undici';
import {
  EXPIRY_SCRIPT_NAME,
  FIRST_LOGIN_SCRIPT,
  EXPIRY_SWEEP_SCRIPT,
} from './voucher-expiry.js';

const localTlsAgent = new Agent({ connect: { rejectUnauthorized: false } });

// ── RouterOS Binary API Word-Length Encoding / Decoding ────────────────────

export function encodeWordLength(len) {
  if (len < 0) throw new Error('Word length cannot be negative');
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) {
    return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.from([0xf0, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
}

export function decodeWordLength(buf, offset = 0) {
  if (offset >= buf.length) return null;
  const b0 = buf[offset];
  if ((b0 & 0x80) === 0x00) {
    return { length: b0, bytesRead: 1 };
  }
  if ((b0 & 0xc0) === 0x80) {
    if (offset + 2 > buf.length) return null;
    return { length: ((b0 & 0x3f) << 8) | buf[offset + 1], bytesRead: 2 };
  }
  if ((b0 & 0xe0) === 0xc0) {
    if (offset + 3 > buf.length) return null;
    return {
      length: ((b0 & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2],
      bytesRead: 3,
    };
  }
  if ((b0 & 0xf0) === 0xe0) {
    if (offset + 4 > buf.length) return null;
    return {
      length: ((b0 & 0x0f) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3],
      bytesRead: 4,
    };
  }
  if (b0 === 0xf0) {
    if (offset + 5 > buf.length) return null;
    const length =
      ((buf[offset + 1] << 24) >>> 0) +
      (buf[offset + 2] << 16) +
      (buf[offset + 3] << 8) +
      buf[offset + 4];
    return { length, bytesRead: 5 };
  }
  throw new Error(`Invalid RouterOS API length prefix byte: 0x${b0.toString(16)}`);
}

export function encodeSentence(words) {
  const parts = [];
  for (const w of words) {
    const wordBuf = Buffer.from(String(w), 'utf8');
    parts.push(encodeWordLength(wordBuf.length), wordBuf);
  }
  parts.push(Buffer.from([0x00])); // Sentence terminator
  return Buffer.concat(parts);
}

export function parseSentences(buffer) {
  const sentences = [];
  let current = [];
  let offset = 0;

  while (offset < buffer.length) {
    const lenInfo = decodeWordLength(buffer, offset);
    if (!lenInfo) break;
    const { length, bytesRead } = lenInfo;
    if (offset + bytesRead + length > buffer.length) break;

    if (length === 0) {
      if (current.length > 0) sentences.push(current);
      current = [];
      offset += bytesRead;
    } else {
      const word = buffer.subarray(offset + bytesRead, offset + bytesRead + length).toString('utf8');
      current.push(word);
      offset += bytesRead + length;
    }
  }

  return {
    sentences,
    remaining: current.length > 0 ? buffer.subarray(findLastSentenceEnd(buffer, offset)) : buffer.subarray(offset),
  };
}

function findLastSentenceEnd(buffer, currentOffset) {
  // Replay cleanly from start to find exact byte offset after the last complete sentence
  let offset = 0;
  let lastComplete = 0;
  while (offset < currentOffset) {
    const lenInfo = decodeWordLength(buffer, offset);
    if (!lenInfo) break;
    const { length, bytesRead } = lenInfo;
    if (offset + bytesRead + length > buffer.length) break;
    offset += bytesRead + length;
    if (length === 0) lastComplete = offset;
  }
  return lastComplete;
}

function sentenceToObject(words) {
  const type = words[0] || '';
  const data = {};
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith('=')) {
      const idx = w.indexOf('=', 1);
      if (idx > 0) {
        data[w.slice(1, idx)] = w.slice(idx + 1);
      } else {
        data[w.slice(1)] = '';
      }
    }
  }
  return { type, data };
}

// ── Binary API Client (Port 8728 / 8729) ───────────────────────────────────

export class RouterOsBinaryClient {
  constructor({ host, port = 8728, useTls = false, timeoutMs = 8000 }) {
    this.host = host;
    this.port = Number(port) || 8728;
    this.useTls = Boolean(useTls);
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.rxBuffer = Buffer.alloc(0);
    this.pending = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { this.socket?.destroy(); } catch {}
        reject(new Error(`Timeout connecting to MikroTik API ${this.host}:${this.port}`));
      }, this.timeoutMs);

      const onConnect = () => {
        clearTimeout(timer);
        resolve();
      };

      const onError = (err) => {
        clearTimeout(timer);
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          p.reject(err);
        } else {
          reject(err);
        }
      };

      this.socket = this.useTls
        ? tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false }, onConnect)
        : net.createConnection({ host: this.host, port: this.port }, onConnect);

      this.socket.on('error', onError);
      this.socket.on('data', (chunk) => this._onData(chunk));
      this.socket.on('close', () => {
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          p.reject(new Error('RouterOS API socket closed unexpectedly'));
        }
      });
    });
  }

  _onData(chunk) {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
    const { sentences, remaining } = parseSentences(this.rxBuffer);
    this.rxBuffer = remaining;

    if (!this.pending) return;
    for (const words of sentences) {
      const { type, data } = sentenceToObject(words);
      if (type === '!re') {
        this.pending.rows.push(data);
      } else if (type === '!trap' || type === '!fatal') {
        this.pending.traps.push(data.message || 'RouterOS command failed');
      } else if (type === '!done') {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        if (p.traps.length > 0) {
          p.reject(new Error(p.traps.join('; ')));
        } else {
          p.resolve({ rows: p.rows, done: data });
        }
      }
    }
  }

  async command(cmd, params = {}) {
    if (!this.socket) throw new Error('RouterOS client is not connected');
    if (this.pending) throw new Error('Concurrent RouterOS commands not supported on single socket');

    const words = [cmd];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      // In RouterOS Binary API, query words start with '?' and only '.tag' omits the leading '='.
      // Attribute words including '.id' MUST be prefixed with '=' (e.g. '=.id=*1').
      if (k.startsWith('?') || k === '.tag') {
        words.push(`${k}=${v}`);
      } else {
        words.push(`=${k}=${v}`);
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`RouterOS command "${cmd}" timed out`));
      }, this.timeoutMs);

      this.pending = { rows: [], traps: [], resolve, reject, timer };
      this.socket.write(encodeSentence(words));
    });
  }

  async login(username, password) {
    await this.command('/login', { name: username, password: password || '' });
  }

  close() {
    try { this.socket?.end(); this.socket?.destroy(); } catch {}
    this.socket = null;
  }
}

// ── REST API Adapter (Port 443 / 80 Fallback) ──────────────────────────────

class RouterOsRestAdapter {
  constructor({ host, port = 443, protocol = 'https', username, password, timeoutMs = 8000 }) {
    this.baseUrl = `${protocol}://${host}:${port}/rest`;
    this.headers = {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password || ''}`).toString('base64'),
      'Content-Type': 'application/json',
    };
    this.isHttps = protocol === 'https';
    this.timeoutMs = timeoutMs;
    this.transport = `rest-${protocol}:${port}`;
  }

  async command(path, params = {}) {
    // Convert Binary API style path like '/ip/hotspot/user/profile/print' into REST call
    const cleanPath = String(path).replace(/^\/+/, '');
    const segments = cleanPath.split('/');
    const action = segments[segments.length - 1];
    const resourcePath = '/' + segments.slice(0, -1).join('/');

    let method = 'POST';
    let url = `${this.baseUrl}/${cleanPath}`;
    let body = params;

    if (action === 'print') {
      method = 'GET';
      url = `${this.baseUrl}${resourcePath}`;
      body = undefined;
    } else if (action === 'set' && params['.id']) {
      method = 'PATCH';
      const { ['.id']: id, ...rest } = params;
      url = `${this.baseUrl}${resourcePath}/${encodeURIComponent(id)}`;
      body = rest;
    } else if (action === 'add') {
      method = 'PUT';
      url = `${this.baseUrl}${resourcePath}`;
      body = params;
    } else if (action === 'remove' && params['.id']) {
      method = 'DELETE';
      url = `${this.baseUrl}${resourcePath}/${encodeURIComponent(params['.id'])}`;
      body = undefined;
    }

    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: this.isHttps ? localTlsAgent : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`REST ${cleanPath} failed (${res.status}): ${text.slice(0, 180)}`);
    const json = text ? JSON.parse(text) : null;
    return {
      rows: Array.isArray(json) ? json : (json ? [json] : []),
      done: Array.isArray(json) ? {} : (json || {}),
    };
  }

  close() {}
}

/**
 * Automatically connects to a local MikroTik router using IP + username + password.
 * Tries Binary API (8728) -> REST HTTPS (443) -> REST HTTP (80).
 */
export async function connectLocalMikroTik({ host, username = 'admin', password = '', port = null }) {
  const cleanHost = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!cleanHost) throw new Error('Router IP address is required');

  const attempts = port
    ? [{ kind: Number(port) === 8728 || Number(port) === 8729 ? 'binary' : 'rest', port: Number(port), tls: Number(port) === 8729 || Number(port) === 443 }]
    : [
        { kind: 'binary', port: 8728, tls: false },
        { kind: 'rest', port: 443, tls: true },
        { kind: 'rest', port: 80, tls: false },
        { kind: 'binary', port: 8729, tls: true },
      ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      if (attempt.kind === 'binary') {
        const client = new RouterOsBinaryClient({ host: cleanHost, port: attempt.port, useTls: attempt.tls, timeoutMs: 6000 });
        await client.connect();
        await client.login(username, password);
        client.transport = `${attempt.tls ? 'api-ssl' : 'api'}:${attempt.port}`;
        return client;
      } else {
        const client = new RouterOsRestAdapter({
          host: cleanHost,
          port: attempt.port,
          protocol: attempt.tls ? 'https' : 'http',
          username,
          password,
          timeoutMs: 6000,
        });
        await client.command('/system/resource/print');
        return client;
      }
    } catch (err) {
      errors.push(`${attempt.kind}:${attempt.port} (${err.message})`);
    }
  }

  throw new Error(`Could not connect to MikroTik at ${cleanHost}. Tried: ${errors.join(' | ')}`);
}

/**
 * High-level Mikroticket-style Local Plug & Play Router Onboarding.
 * Runs on a laptop/desktop connected to the router's local Wi-Fi/LAN.
 *
 * 1. Connects locally using IP + username + password (works even on brand-new routers)
 * 2. Verifies RouterOS >= 7.12 and reads router identity/board
 * 3. Creates dedicated Cloud API user + self-signed SSL cert + enables www-ssl (:443)
 * 4. Creates/reuses WireGuard interface `wg-vps` and reads its public key
 * 5. Calls Cloud `/api/super-admin/routers/onboard` (which registers the peer on the VPS Hub with ZERO SSH)
 * 6. Configures WireGuard IP + VPS peer + firewall rule + NTP sync (`Africa/Lagos`)
 * 7. Enforces MAC-cookie auto-reconnect (`4w2d`) + Strict First-Login Wall-Clock Expiry v3 (`# AN voucher expiry v3` + 10s sweep) across ALL profiles
 * 8. Triggers cloud post-tunnel verification & portal sync
 */
export async function onboardLocalRouter({
  localIp,
  localUsername = 'admin',
  localPassword = '',
  routerName,
  cloudUrl,
  adminToken,
  vpsHubId = null,
  locationId = null,
  dnsName = 'hotspot.mycollectivesub.net',
  alreadyConfigured = true,
  onProgress = () => {},
}) {
  const cleanCloud = String(cloudUrl || '').trim().replace(/\/+$/, '');
  if (!cleanCloud) throw new Error('Cloud dashboard URL is required');
  if (!adminToken) throw new Error('Super Admin authentication token is required');

  const logStep = (step, status, detail) => onProgress({ step, status, detail, timestamp: new Date().toISOString() });

  logStep('connect', 'running', `Connecting to local MikroTik at ${localIp}...`);
  const router = await connectLocalMikroTik({ host: localIp, username: localUsername, password: localPassword });

  try {
    // Step 1: Check RouterOS version
    const { rows: resRows } = await router.command('/system/resource/print');
    const resource = resRows[0] || {};
    const version = String(resource.version || '');
    const [major, minor] = version.split('.').map(Number);
    if (!major || major < 7 || (major === 7 && minor < 12)) {
      throw new Error(`RouterOS ${version || 'unknown'} detected. RouterOS 7.12+ is required for WireGuard & strict first-login expiry.`);
    }
    logStep('connect', 'done', `Connected via ${router.transport} (${resource['board-name'] || 'MikroTik'}, RouterOS ${version})`);

    // Step 2: Identity + NTP Clock Sync
    logStep('clock', 'running', 'Configuring identity & NTP clock sync (Africa/Lagos)...');
    const safeName = String(routerName || resource['board-name'] || 'MyCollectiveSub-Router').trim();
    await router.command('/system/identity/set', { name: safeName });
    await router.command('/system/clock/set', { 'time-zone-name': 'Africa/Lagos' }).catch(() => {});
    await router.command('/ip/cloud/set', { 'ddns-enabled': 'yes', 'update-time': 'yes' }).catch(() => {});
    await router.command('/system/ntp/client/set', { enabled: 'yes', servers: '216.239.35.0,1.1.1.1' }).catch(() => {});
    logStep('clock', 'done', `Identity "${safeName}" & NTP configured`);

    // Step 3: WireGuard Interface & Public Key Extraction
    logStep('wireguard_key', 'running', 'Initializing WireGuard interface (wg-vps) on router...');
    let { rows: wgRows } = await router.command('/interface/wireguard/print');
    let wgIface = wgRows.find((w) => w.name === 'wg-vps');
    if (!wgIface) {
      await router.command('/interface/wireguard/add', { name: 'wg-vps', 'listen-port': '13231', mtu: '1420' });
      ({ rows: wgRows } = await router.command('/interface/wireguard/print'));
      wgIface = wgRows.find((w) => w.name === 'wg-vps');
    }
    const routerWgPubKey = wgIface?.['public-key'];
    if (!routerWgPubKey) throw new Error('Could not read WireGuard public key from router');
    logStep('wireguard_key', 'done', `Router WireGuard key ready (${routerWgPubKey.slice(0, 12)}...)`);

    // Step 4: Register Router & Peer on Cloud + VPS Hub (Zero SSH!)
    logStep('vps_register', 'running', 'Registering router automatically on Cloud & VPS Hub (zero SSH)...');
    const cloudRes = await fetch(`${cleanCloud}/api/super-admin/routers/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        mode: 'local_connector',
        router_name: safeName,
        identity: safeName,
        location_id: locationId || null,
        vps_hub_id: vpsHubId || null,
        dns_name: dnsName,
        wg_public_key: routerWgPubKey,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const cloudData = await cloudRes.json();
    if (!cloudRes.ok || !cloudData.success) {
      throw new Error(cloudData.error || `Cloud onboarding failed (HTTP ${cloudRes.status})`);
    }
    const { vps, credentials, router: savedRouter } = cloudData;
    logStep('vps_register', 'done', `Assigned ${vps.wg_tunnel_ip} -> ${vps.public_ip}:${vps.external_port}`);

    // Step 5: Dedicated Cloud API User & HTTPS REST SSL (:443)
    logStep('rest_ssl', 'running', 'Creating dedicated Cloud API user & enabling HTTPS REST (:443)...');
    const { rows: existingUsers } = await router.command('/user/print');
    const apiUser = existingUsers.find((u) => u.name === credentials.username);
    if (apiUser?.['.id']) {
      await router.command('/user/set', { '.id': apiUser['.id'], password: credentials.password, group: 'full' });
    } else {
      await router.command('/user/add', { name: credentials.username, password: credentials.password, group: 'full', comment: 'MyCollectiveSub Cloud API' });
    }

    const { rows: certs } = await router.command('/certificate/print');
    if (!certs.some((c) => c.name === 'mcs-api-cert')) {
      await router.command('/certificate/add', {
        name: 'mcs-api-cert',
        'common-name': 'mycollectivesub-router',
        'key-size': '2048',
        'days-valid': '3650',
        'key-usage': 'tls-server',
      });
      await router.command('/certificate/sign', { number: 'mcs-api-cert' }).catch(() => {});
    }
    const { rows: services } = await router.command('/ip/service/print');
    const wwwSsl = services.find((s) => s.name === 'www-ssl');
    if (wwwSsl?.['.id']) {
      await router.command('/ip/service/set', { '.id': wwwSsl['.id'], certificate: 'mcs-api-cert', port: '443', disabled: 'no' });
    }
    logStep('rest_ssl', 'done', 'HTTPS REST API (:443) enabled');

    // Step 6: Finish WireGuard Tunnel + Firewall Allow
    logStep('wireguard_up', 'running', `Bringing up WireGuard tunnel to ${vps.public_ip}:${vps.wg_port}...`);
    const { rows: ipAddrs } = await router.command('/ip/address/print');
    for (const addr of ipAddrs.filter((a) => a.interface === 'wg-vps')) {
      if (addr['.id']) await router.command('/ip/address/remove', { '.id': addr['.id'] }).catch(() => {});
    }
    const wgSubnetStr = String(vps.wg_subnet || '10.100.0.0/16');
    const [wgNetPart, wgMaskPart] = wgSubnetStr.split('/');
    const wgPrefixLen = Number(wgMaskPart) >= 16 && Number(wgMaskPart) <= 29 ? Number(wgMaskPart) : 16;

    await router.command('/ip/address/add', {
      address: `${vps.wg_tunnel_ip}/${wgPrefixLen}`,
      interface: 'wg-vps',
      comment: 'MyCollectiveSub VPS Tunnel',
    });

    const { rows: peers } = await router.command('/interface/wireguard/peers/print');
    for (const p of peers.filter((x) => x.interface === 'wg-vps')) {
      if (p['.id']) await router.command('/interface/wireguard/peers/remove', { '.id': p['.id'] }).catch(() => {});
    }
    await router.command('/interface/wireguard/peers/add', {
      interface: 'wg-vps',
      'endpoint-address': vps.public_ip,
      'endpoint-port': String(vps.wg_port || 51820),
      'public-key': vps.wg_public_key,
      'allowed-address': wgSubnetStr,
      'persistent-keepalive': '25s',
      comment: 'MyCollectiveSub VPS Hub',
    });

    const { rows: fwRules } = await router.command('/ip/firewall/filter/print');
    if (!fwRules.some((r) => r.comment === 'MCS Allow WG API')) {
      await router.command('/ip/firewall/filter/add', {
        chain: 'input',
        'in-interface': 'wg-vps',
        protocol: 'tcp',
        'dst-port': '443',
        action: 'accept',
        'place-before': '0',
        comment: 'MCS Allow WG API',
      }).catch(() => {});
    }
    logStep('wireguard_up', 'done', 'WireGuard cloud tunnel active');

    // Step 7: Enforce Default MAC-Cookie Auto-Reconnect + Strict First-Login Wall-Clock Expiry v3
    logStep('expiry_defaults', 'running', 'Applying MAC-cookie reconnect (4w2d) & strict First-Login Expiry v3 to all profiles...');
    const { rows: hsServerProfs } = await router.command('/ip/hotspot/profile/print');
    for (const sp of hsServerProfs) {
      if (!sp['.id']) continue;
      await router.command('/ip/hotspot/profile/set', {
        '.id': sp['.id'],
        'login-by': 'cookie,http-chap,http-pap,mac-cookie',
        'http-cookie-lifetime': '4w2d',
      });
    }

    const { rows: hsUserProfs } = await router.command('/ip/hotspot/user/profile/print');
    for (const up of hsUserProfs) {
      if (!up['.id']) continue;
      const existing = up['on-login'] || '';
      const unrelated = existing.replace(/# AN voucher expiry v\d+[\s\S]*?# End AN voucher expiry v\d+\s*/g, '');
      await router.command('/ip/hotspot/user/profile/set', {
        '.id': up['.id'],
        'on-login': FIRST_LOGIN_SCRIPT + '\n' + unrelated,
        'add-mac-cookie': 'yes',
        'mac-cookie-timeout': '4w2d',
        'keepalive-timeout': '2m',
      });
    }

    const { rows: sysScripts } = await router.command('/system/script/print');
    const existingSweep = sysScripts.find((s) => s.name === EXPIRY_SCRIPT_NAME);
    if (existingSweep?.['.id']) {
      await router.command('/system/script/set', { '.id': existingSweep['.id'], source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
    } else {
      await router.command('/system/script/add', { name: EXPIRY_SCRIPT_NAME, source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
    }

    const { rows: sysScheds } = await router.command('/system/scheduler/print');
    const existingSched = sysScheds.find((s) => s.name === EXPIRY_SCRIPT_NAME);
    const schedPayload = {
      'start-time': 'startup',
      interval: '10s',
      'on-event': `/system script run ${EXPIRY_SCRIPT_NAME}`,
      policy: 'read,write,test',
      disabled: 'no',
    };
    if (existingSched?.['.id']) {
      await router.command('/system/scheduler/set', { '.id': existingSched['.id'], ...schedPayload });
    } else {
      await router.command('/system/scheduler/add', { name: EXPIRY_SCRIPT_NAME, ...schedPayload });
    }

    // Install 60s self-healing VPS failover watchdog so replacing an expired VPS auto-reconnects this router
    if (savedRouter?.polling_secret) {
      const hubGw = wgNetPart.replace(/\.\d+$/, '.1');
      const syncUrl = `${cleanCloud}/api/onboarding/vps-sync`;
      const sec = savedRouter.polling_secret;
      const watchdogSource = `:if ([/ping ${hubGw} count=2] = 0) do={ :do { /interface wireguard disable [find where name="wg-vps"]; :delay 2s; /interface wireguard enable [find where name="wg-vps"] } on-error={}; :do { :local wgK [/interface wireguard get [find where name="wg-vps"] public-key]; /tool fetch url="${syncUrl}" http-method=post http-header-field="Content-Type: application/json" http-data=("{\\"secret\\":\\"${sec}\\",\\"wg_public_key\\":\\"" . $wgK . "\\"}") mode=https check-certificate=no keep-result=no } on-error={}; :do { /tool fetch url="${syncUrl}?secret=${sec}" dst-path="mcs-vps-sync.rsc" mode=https check-certificate=no; /import mcs-vps-sync.rsc; /file remove mcs-vps-sync.rsc } on-error={} }`;
      const existingWd = sysScripts.find((s) => s.name === 'an-watchdog-script');
      if (existingWd?.['.id']) {
        await router.command('/system/script/set', { '.id': existingWd['.id'], source: watchdogSource, policy: 'read,write,test' }).catch(() => {});
      } else {
        await router.command('/system/script/add', { name: 'an-watchdog-script', source: watchdogSource, policy: 'read,write,test' }).catch(() => {});
      }
      const existingWdSched = sysScheds.find((s) => s.name === 'an-power-watchdog');
      const wdSchedPayload = { 'start-time': 'startup', interval: '60s', 'on-event': '/system script run an-watchdog-script', policy: 'read,write,test', disabled: 'no' };
      if (existingWdSched?.['.id']) {
        await router.command('/system/scheduler/set', { '.id': existingWdSched['.id'], ...wdSchedPayload }).catch(() => {});
      } else {
        await router.command('/system/scheduler/add', { name: 'an-power-watchdog', ...wdSchedPayload }).catch(() => {});
      }
    }
    logStep('expiry_defaults', 'done', `MAC-cookie, First-Login Expiry v3 (${hsUserProfs.length} profiles, 10s sweep) & VPS Failover Watchdog installed`);

    // Step 8: Verify Cloud Tunnel (and optionally run full Auto-Setup only for brand-new unconfigured routers)
    logStep('cloud_sync', 'running', alreadyConfigured
      ? 'Waiting 4s for WireGuard handshake & testing cloud tunnel (preserving existing Hotspot config)...'
      : 'Waiting 4s for tunnel handshake & running full cloud auto-setup...');
    await new Promise((r) => setTimeout(r, 4000));
    let autoSetupOk = false;
    try {
      if (alreadyConfigured) {
        const testRes = await fetch(`${cleanCloud}/api/mikrotik/test-connection?router_id=${encodeURIComponent(savedRouter.id)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          signal: AbortSignal.timeout(15000),
        });
        const testData = await testRes.json().catch(() => ({}));
        autoSetupOk = Boolean(testRes.ok && (testData.connected || testData.success));
      } else {
        const setupRes = await fetch(`${cleanCloud}/api/mikrotik/auto-setup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ router_id: savedRouter.id }),
          signal: AbortSignal.timeout(45000),
        });
        autoSetupOk = setupRes.ok;
      }
    } catch {}
    logStep(
      'cloud_sync',
      'done',
      autoSetupOk
        ? (alreadyConfigured
            ? 'Cloud tunnel online! Existing Hotspot preserved — ready to generate & sell vouchers immediately.'
            : 'Cloud tunnel verified & full Hotspot + branded portal synced!')
        : 'Router registered (tunnel will finish handshaking shortly)'
    );

    return {
      success: true,
      router: savedRouter,
      vps,
      autoSetupOk,
    };
  } finally {
    router.close();
  }
}
