#!/usr/bin/env node
/**
 * MyCollectiveSub — Zero-SSH VPS WireGuard Auto-Provisioner
 *
 * Pure Node.js (v18+/v20+, zero npm dependencies).
 * Run once as a systemd service on any Ubuntu/Debian VPS hub.
 * Allows the MyCollectiveSub cloud app to register/remove MikroTik routers
 * live without SSH and without restarting wg0 (zero downtime for other routers).
 *
 * Endpoints (all require Authorization: Bearer <PROVISIONER_API_SECRET>):
 *   GET  /health               -> VPS WireGuard public key, subnet, peer count, status
 *   GET  /api/peers            -> List peers & latest handshakes
 *   POST /api/peers/register   -> Add/update WireGuard peer + iptables DNAT port mapping
 *   POST /api/peers/remove     -> Remove WireGuard peer + iptables DNAT port mapping
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WG_KEY_RE = /^[A-Za-z0-9+/]{43}=$/;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isValidWgPublicKey(key) {
  return typeof key === 'string' && WG_KEY_RE.test(key.trim());
}

export function isValidIpv4(ip) {
  return typeof ip === 'string' && IPV4_RE.test(ip.trim());
}

export function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1024 && n <= 65535;
}

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 32768) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function upsertPeerInWgConf(confPath, { publicKey, tunnelIp, routerName }) {
  let content = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf8') : '';
  const startMarker = `# BEGIN PEER ${publicKey}`;
  const endMarker = `# END PEER ${publicKey}`;
  const blockRe = new RegExp(`${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g');
  content = content.replace(blockRe, '').trimEnd();

  const safeLabel = String(routerName || 'mikrotik').replace(/[\r\n]/g, ' ').slice(0, 64);
  const block = [
    startMarker,
    `# Router: ${safeLabel} (${tunnelIp})`,
    '[Peer]',
    `PublicKey = ${publicKey}`,
    `AllowedIPs = ${tunnelIp}/32`,
    endMarker,
  ].join('\n');

  fs.writeFileSync(confPath, `${content}\n\n${block}\n`, { mode: 0o600 });
}

function removePeerFromWgConf(confPath, publicKey) {
  if (!fs.existsSync(confPath)) return;
  const content = fs.readFileSync(confPath, 'utf8');
  const startMarker = `# BEGIN PEER ${publicKey}`;
  const endMarker = `# END PEER ${publicKey}`;
  const blockRe = new RegExp(`\\n*${startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g');
  const updated = content.replace(blockRe, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  fs.writeFileSync(confPath, updated, { mode: 0o600 });
}

function ensureIptablesRule(table, chain, args) {
  const tableArgs = table ? ['-t', table] : [];
  try {
    execFileSync('iptables', [...tableArgs, '-C', chain, ...args], { stdio: 'ignore' });
  } catch {
    execFileSync('iptables', [...tableArgs, '-A', chain, ...args], { stdio: 'ignore' });
  }
}

function deleteIptablesRule(table, chain, args) {
  const tableArgs = table ? ['-t', table] : [];
  try {
    execFileSync('iptables', [...tableArgs, '-D', chain, ...args], { stdio: 'ignore' });
  } catch {}
}

export function createProvisionerServer(options = {}) {
  const cfg = {
    apiSecret: options.apiSecret ?? process.env.PROVISIONER_API_SECRET ?? '',
    wgInterface: options.wgInterface ?? process.env.WG_INTERFACE ?? 'wg0',
    wgPort: Number(options.wgPort ?? process.env.WG_PORT ?? 51820),
    wgSubnet: options.wgSubnet ?? process.env.WG_SUBNET ?? '10.100.0.0/16',
    wgConfPath: options.wgConfPath ?? process.env.WG_CONF_PATH ?? '/etc/wireguard/wg0.conf',
    wgPublicKeyPath: options.wgPublicKeyPath ?? process.env.WG_PUBLIC_KEY_PATH ?? '/etc/wireguard/server_public.key',
    natStatePath: options.natStatePath ?? process.env.NAT_STATE_PATH ?? '/opt/mycollectivesub-provisioner/peers-nat.json',
    publicIp: options.publicIp ?? process.env.VPS_PUBLIC_IP ?? '',
    provisionerPort: Number(options.provisionerPort ?? process.env.PROVISIONER_PORT ?? 9443),
    skipPerPortUfw: Boolean(options.skipPerPortUfw ?? (process.env.SKIP_PER_PORT_UFW === '1' || process.env.SKIP_PER_PORT_UFW === 'true')),
    dryRun: Boolean(options.dryRun ?? (process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true')),
    dryRunPublicKey: options.dryRunPublicKey ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  };

  if (!cfg.apiSecret) {
    throw new Error('PROVISIONER_API_SECRET must be set before starting the VPS provisioner');
  }

  // In-memory state used in DRY_RUN mode for deterministic CI/unit tests
  const dryPeers = new Map();

  function getServerPublicKey() {
    if (cfg.dryRun) return cfg.dryRunPublicKey;
    try {
      const key = execFileSync('wg', ['show', cfg.wgInterface, 'public-key'], { encoding: 'utf8' }).trim();
      if (isValidWgPublicKey(key)) return key;
    } catch {}
    if (fs.existsSync(cfg.wgPublicKeyPath)) {
      return fs.readFileSync(cfg.wgPublicKeyPath, 'utf8').trim();
    }
    return '';
  }

  function listPeers() {
    if (cfg.dryRun) {
      return Array.from(dryPeers.values());
    }
    try {
      const dump = execFileSync('wg', ['show', cfg.wgInterface, 'dump'], { encoding: 'utf8' });
      const lines = dump.trim().split('\n').slice(1); // Skip interface header row
      return lines.filter(Boolean).map((line) => {
        const [publicKey, _psk, endpoint, allowedIps, latestHandshake, rxBytes, txBytes, keepalive] = line.split('\t');
        return {
          publicKey,
          endpoint: endpoint === '(none)' ? null : endpoint,
          allowedIps,
          latestHandshakeSec: Number(latestHandshake) || 0,
          rxBytes: Number(rxBytes) || 0,
          txBytes: Number(txBytes) || 0,
          persistentKeepalive: keepalive,
        };
      });
    } catch {
      return [];
    }
  }

  function applyPeerNatRules(tunnelIp, externalPort, dstPort = 443) {
    ensureIptablesRule('nat', 'PREROUTING', [
      '-p', 'tcp', '--dport', String(externalPort),
      '-j', 'DNAT', '--to-destination', `${tunnelIp}:${dstPort}`,
    ]);
    ensureIptablesRule(null, 'FORWARD', [
      '-p', 'tcp', '-d', tunnelIp, '--dport', String(dstPort), '-j', 'ACCEPT',
    ]);
    ensureIptablesRule('nat', 'POSTROUTING', [
      '-o', cfg.wgInterface, '-j', 'MASQUERADE',
    ]);
  }

  function loadNatState() {
    try {
      if (!fs.existsSync(cfg.natStatePath)) return {};
      return JSON.parse(fs.readFileSync(cfg.natStatePath, 'utf8') || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveNatState(state) {
    try {
      fs.writeFileSync(cfg.natStatePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    } catch {}
  }

  if (!cfg.dryRun) {
    const saved = loadNatState();
    for (const entry of Object.values(saved)) {
      if (isValidIpv4(entry?.tunnelIp) && isValidPort(entry?.externalPort)) {
        try {
          applyPeerNatRules(entry.tunnelIp, entry.externalPort, Number(entry.targetPort) || 443);
        } catch {}
      }
    }
  }

  function registerPeer({ publicKey, tunnelIp, externalPort, targetPort = 443, routerName = '' }) {
    if (!isValidWgPublicKey(publicKey)) throw new Error('Invalid WireGuard public key format');
    if (!isValidIpv4(tunnelIp)) throw new Error('Invalid WireGuard tunnel IPv4 address');
    if (!isValidPort(externalPort)) throw new Error('Invalid external forwarding port (must be 1024-65535)');
    const extPortNum = Number(externalPort);
    const reservedPorts = new Set([22, 80, 443, cfg.provisionerPort || 9443, cfg.wgPort || 51820]);
    if (reservedPorts.has(extPortNum)) {
      throw new Error(`Invalid external forwarding port: port ${extPortNum} is reserved by the VPS hub`);
    }
    const dstPort = Number(targetPort) || 443;
    if (!Number.isInteger(dstPort) || dstPort < 1 || dstPort > 65535) throw new Error('Invalid target router port');

    if (cfg.dryRun) {
      const record = {
        publicKey,
        tunnelIp,
        externalPort: Number(externalPort),
        targetPort: dstPort,
        routerName,
        registeredAt: new Date().toISOString(),
      };
      dryPeers.set(publicKey, record);
      return { success: true, dryRun: true, peer: record };
    }

    // 1. Apply peer live on wg0 with zero downtime to existing routers
    execFileSync('wg', ['set', cfg.wgInterface, 'peer', publicKey, 'allowed-ips', `${tunnelIp}/32`], { stdio: 'ignore' });

    // 2. Persist peer cleanly in /etc/wireguard/wg0.conf
    upsertPeerInWgConf(cfg.wgConfPath, { publicKey, tunnelIp, routerName });

    // 3. Idempotent iptables DNAT + FORWARD + WireGuard return MASQUERADE + boot-safe state file
    applyPeerNatRules(tunnelIp, externalPort, dstPort);
    const natState = loadNatState();
    natState[publicKey] = { publicKey, tunnelIp, externalPort: Number(externalPort), targetPort: dstPort, routerName };
    saveNatState(natState);
    if (!cfg.skipPerPortUfw) {
      try {
        execFileSync('ufw', ['allow', `${externalPort}/tcp`], { stdio: 'ignore' });
      } catch {}
    }
    try {
      execFileSync('netfilter-persistent', ['save'], { stdio: 'ignore' });
    } catch {}

    return {
      success: true,
      peer: { publicKey, tunnelIp, externalPort: Number(externalPort), targetPort: dstPort, routerName },
      vpsPublicKey: getServerPublicKey(),
    };
  }

  function removePeer({ publicKey, tunnelIp, externalPort, targetPort = 443 }) {
    if (!isValidWgPublicKey(publicKey)) throw new Error('Invalid WireGuard public key format');

    if (cfg.dryRun) {
      const existed = dryPeers.delete(publicKey);
      return { success: true, dryRun: true, removed: existed };
    }

    try {
      execFileSync('wg', ['set', cfg.wgInterface, 'peer', publicKey, 'remove'], { stdio: 'ignore' });
    } catch {}
    removePeerFromWgConf(cfg.wgConfPath, publicKey);

    const natState = loadNatState();
    if (natState[publicKey]) {
      delete natState[publicKey];
      saveNatState(natState);
    }

    if (isValidIpv4(tunnelIp) && isValidPort(externalPort)) {
      const dstPort = Number(targetPort) || 443;
      deleteIptablesRule('nat', 'PREROUTING', [
        '-p', 'tcp', '--dport', String(externalPort),
        '-j', 'DNAT', '--to-destination', `${tunnelIp}:${dstPort}`,
      ]);
      deleteIptablesRule(null, 'FORWARD', [
        '-p', 'tcp', '-d', tunnelIp, '--dport', String(dstPort), '-j', 'ACCEPT',
      ]);
      try {
        execFileSync('netfilter-persistent', ['save'], { stdio: 'ignore' });
      } catch {}
    }

    return { success: true, removed: true };
  }

  const handler = async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!constantTimeEqual(token, cfg.apiSecret)) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized' });
      }

      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        const peers = listPeers();
        return sendJson(res, 200, {
          success: true,
          ok: true,
          dryRun: cfg.dryRun,
          publicIp: cfg.publicIp || null,
          wgInterface: cfg.wgInterface,
          wgPort: cfg.wgPort,
          wgSubnet: cfg.wgSubnet,
          wgPublicKey: getServerPublicKey(),
          peerCount: peers.length,
          uptimeSec: Math.floor(process.uptime()),
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/peers') {
        return sendJson(res, 200, { success: true, peers: listPeers() });
      }

      if (req.method === 'POST' && url.pathname === '/api/peers/register') {
        const body = await readJsonBody(req);
        const result = registerPeer(body);
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && url.pathname === '/api/peers/remove') {
        const body = await readJsonBody(req);
        const result = removePeer(body);
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { success: false, error: 'Not found' });
    } catch (err) {
      const status = /Invalid|required/i.test(err.message) ? 400 : 500;
      return sendJson(res, status, { success: false, error: err.message });
    }
  };

  if (options.tlsCertPath && options.tlsKeyPath) {
    return https.createServer(
      {
        cert: fs.readFileSync(options.tlsCertPath),
        key: fs.readFileSync(options.tlsKeyPath),
      },
      handler
    );
  }
  return http.createServer(handler);
}

// Run standalone when executed directly (`node server.mjs`)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PROVISIONER_PORT || 9443);
  const host = process.env.PROVISIONER_HOST || '0.0.0.0';
  const server = createProvisionerServer({
    tlsCertPath: process.env.TLS_CERT_PATH,
    tlsKeyPath: process.env.TLS_KEY_PATH,
  });
  server.listen(port, host, () => {
    console.log(`[vps-provisioner] Listening on ${host}:${port} (wg=${process.env.WG_INTERFACE || 'wg0'}, dryRun=${process.env.DRY_RUN === '1'})`);
  });
}
