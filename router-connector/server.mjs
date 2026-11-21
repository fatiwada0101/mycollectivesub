#!/usr/bin/env node
/**
 * MyCollectiveSub — Local Plug & Play Router Connector (Mikroticket-Style)
 *
 * Runs locally on a laptop/desktop connected to a brand-new MikroTik router's Wi-Fi/LAN.
 * Binds strictly to 127.0.0.1:4782 so only the local operator can access it.
 *
 * Start with:
 *   npm run connector
 * or double-click router-connector/Launch-Router-Connector.bat on Windows.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onboardLocalRouter } from '../lib/routeros-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CONNECTOR_PORT || 4782);
const HOST = '127.0.0.1';

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (req.method === 'POST' && url.pathname === '/api/cloud-login') {
      const { cloudUrl, password } = await readJson(req);
      const cleanCloud = String(cloudUrl || '').trim().replace(/\/+$/, '');
      if (!cleanCloud || !password) {
        return sendJson(res, 400, { success: false, error: 'Cloud URL and Super Admin password are required' });
      }

      const authRes = await fetch(`${cleanCloud}/api/super-admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(12000),
      });
      const authData = await authRes.json().catch(() => ({}));
      if (!authRes.ok || !authData.token) {
        return sendJson(res, authRes.status || 401, {
          success: false,
          error: authData.error || 'Super Admin login failed',
        });
      }

      const headers = { Authorization: `Bearer ${authData.token}` };
      const [hubsRes, locsRes] = await Promise.all([
        fetch(`${cleanCloud}/api/super-admin/vps-hubs`, { headers, signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({ hubs: [] })),
        fetch(`${cleanCloud}/api/super-admin/locations`, { headers, signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({ locations: [] })),
      ]);

      return sendJson(res, 200, {
        success: true,
        token: authData.token,
        hubs: hubsRes.hubs || [],
        needsMigration: Boolean(hubsRes.needs_migration),
        locations: locsRes.locations || [],
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/onboard') {
      const payload = await readJson(req);
      const steps = [];
      const result = await onboardLocalRouter({
        localIp: payload.localIp,
        localUsername: payload.localUsername || 'admin',
        localPassword: payload.localPassword || '',
        routerName: payload.routerName,
        cloudUrl: payload.cloudUrl,
        adminToken: payload.adminToken,
        vpsHubId: payload.vpsHubId || null,
        locationId: payload.locationId || null,
        dnsName: payload.dnsName || 'hotspot.mycollectivesub.net',
        onProgress: (ev) => steps.push(ev),
      });
      return sendJson(res, 200, { ...result, steps });
    }

    return sendJson(res, 404, { success: false, error: 'Not found' });
  } catch (err) {
    return sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n=============================================================`);
  console.log(`  MyCollectiveSub Local Router Connector Ready!`);
  console.log(`  Open in browser: http://${HOST}:${PORT}`);
  console.log(`  1. Connect your laptop to the MikroTik router's Wi-Fi/LAN`);
  console.log(`  2. Enter Router IP + Username + Password -> Click Onboard`);
  console.log(`=============================================================\n`);
});
