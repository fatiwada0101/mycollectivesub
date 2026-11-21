import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = fs.existsSync(path.join(__dirname, 'router-connector'))
  ? __dirname
  : path.resolve(__dirname, '..');

const { onboardLocalRouter } = await import(path.join(rootDir, 'lib', 'routeros-api.js'));

let localServer = null;
let mainWindow = null;

function startLocalBridge() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const sendJson = (status, data) => {
        const body = JSON.stringify(data);
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
      };
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
          const html = fs.readFileSync(path.join(rootDir, 'router-connector', 'index.html'), 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        }

        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

        if (req.method === 'POST' && url.pathname === '/api/cloud-login') {
          const cleanCloud = String(body.cloudUrl || '').trim().replace(/\/+$/, '');
          const authRes = await fetch(`${cleanCloud}/api/super-admin/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: body.password }),
          });
          const authData = await authRes.json().catch(() => ({}));
          if (!authRes.ok || !authData.token) {
            return sendJson(authRes.status || 401, { success: false, error: authData.error || 'Login failed' });
          }
          const headers = { Authorization: `Bearer ${authData.token}` };
          const [hubsRes, locsRes] = await Promise.all([
            fetch(`${cleanCloud}/api/super-admin/vps-hubs`, { headers }).then((r) => r.json()).catch(() => ({ hubs: [] })),
            fetch(`${cleanCloud}/api/super-admin/locations`, { headers }).then((r) => r.json()).catch(() => ({ locations: [] })),
          ]);
          return sendJson(200, { success: true, token: authData.token, hubs: hubsRes.hubs || [], locations: locsRes.locations || [] });
        }

        if (req.method === 'POST' && url.pathname === '/api/onboard') {
          const steps = [];
          const result = await onboardLocalRouter({ ...body, onProgress: (ev) => steps.push(ev) });
          return sendJson(200, { ...result, steps });
        }

        return sendJson(404, { success: false, error: 'Not found' });
      } catch (err) {
        return sendJson(500, { success: false, error: err.message });
      }
    });

    server.listen(0, '127.0.0.1', () => {
      localServer = server;
      resolve(server.address().port);
    });
  });
}

app.whenReady().then(async () => {
  const port = await startLocalBridge();
  mainWindow = new BrowserWindow({
    width: 860,
    height: 780,
    title: 'MyCollectiveSub Plug & Play Router Connector',
    backgroundColor: '#0b162a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
});

app.on('window-all-closed', () => {
  try { localServer?.close(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});
