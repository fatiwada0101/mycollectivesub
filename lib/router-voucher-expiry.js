import { EXPIRY_SCRIPT_NAME, FIRST_LOGIN_SCRIPT, EXPIRY_SWEEP_SCRIPT } from './voucher-expiry.js';

function desiredOnLoginScript(existing = '') {
  const unrelated = String(existing || '').replace(/# AN voucher expiry v\d+[\s\S]*?# End AN voucher expiry v\d+\s*/g, '');
  return FIRST_LOGIN_SCRIPT + '\n' + unrelated;
}

async function ensureRouterExpiryPrerequisites(request) {
  const resource = await request('/system/resource');
  const [major, minor] = String(resource.version).split('.').map(Number);
  if (major < 7 || (major === 7 && minor < 12) || !major) throw new Error('First-login voucher expiry requires RouterOS 7.12 or later');
  const clock = await request('/system/clock');
  const routerTime = Date.parse(`${clock.date}T${clock.time}${clock['gmt-offset'] || '+00:00'}`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(clock.date) || !Number.isFinite(routerTime) || Math.abs(routerTime - Date.now()) > 300000) {
    throw new Error('Synchronize the router clock before generating vouchers');
  }
  const ntp = await request('/system/ntp/client');
  if (ntp.status !== 'synchronized') throw new Error('Wait for the router NTP clock to synchronize before generating vouchers');
  const profiles = await request('/ip/hotspot/user/profile');
  return Array.isArray(profiles) ? profiles : [];
}

async function ensureSweepScriptAndScheduler(request) {
  const scripts = await request('/system/script');
  const script = (Array.isArray(scripts) ? scripts : []).find(s => s.name === EXPIRY_SCRIPT_NAME);
  if (script && script.source !== EXPIRY_SWEEP_SCRIPT) {
    await request(`/system/script/${encodeURIComponent(script['.id'])}`, 'PATCH', { source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
  } else if (!script) {
    await request('/system/script', 'PUT', { name: EXPIRY_SCRIPT_NAME, source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
  }
  const schedulers = await request('/system/scheduler');
  const scheduler = (Array.isArray(schedulers) ? schedulers : []).find(s => s.name === EXPIRY_SCRIPT_NAME);
  const schedule = { 'start-time': 'startup', interval: '10s', 'on-event': `/system script run ${EXPIRY_SCRIPT_NAME}`, policy: 'read,write,test', disabled: 'false' };
  if (scheduler) await request(`/system/scheduler/${encodeURIComponent(scheduler['.id'])}`, 'PATCH', schedule);
  else await request('/system/scheduler', 'PUT', { name: EXPIRY_SCRIPT_NAME, ...schedule });
}

async function patchProfileFirstLoginExpiry(request, profile) {
  // Preserve unrelated vendor login hooks. Avoid appending a second copy on retries.
  const existing = profile['on-login'] || '';
  const desired = desiredOnLoginScript(existing);
  const macCookieEnabled = profile['add-mac-cookie'] === 'true' || profile['add-mac-cookie'] === true;
  const macCookieTimeoutOk = ['4w2d', '30d'].includes(profile['mac-cookie-timeout']);
  if (existing !== desired || profile['keepalive-timeout'] !== '2m' || !macCookieEnabled || !macCookieTimeoutOk) {
    await request(`/ip/hotspot/user/profile/${encodeURIComponent(profile['.id'])}`, 'PATCH', {
      'on-login': desired,
      'keepalive-timeout': '2m',
      'add-mac-cookie': 'true',
      'mac-cookie-timeout': '4w2d',
    });
    return true;
  }
  return false;
}

// request(path, method, body) is injected so the installer is testable without a router.
export async function installFirstLoginExpiry(request, profileName) {
  const profiles = await ensureRouterExpiryPrerequisites(request);
  const profile = profiles.find(p => p.name === profileName);
  if (!profile) throw new Error(`Hotspot user profile "${profileName}" does not exist`);
  await ensureSweepScriptAndScheduler(request);
  await patchProfileFirstLoginExpiry(request, profile);
  // Execute once to expose script syntax/permission errors before issuing vouchers.
  await request('/system/script/run', 'POST', { number: EXPIRY_SCRIPT_NAME });
}

// Enforces first-login wall-clock expiry + MAC-cookie reconnect across EVERY
// hotspot user profile on the router (current, legacy, default, and custom).
export async function installFirstLoginExpiryForAllProfiles(request) {
  const profiles = await ensureRouterExpiryPrerequisites(request);
  await ensureSweepScriptAndScheduler(request);
  let patchedCount = 0;
  for (const profile of profiles) {
    if (!profile?.['.id']) continue;
    if (await patchProfileFirstLoginExpiry(request, profile)) patchedCount++;
  }
  await request('/system/script/run', 'POST', { number: EXPIRY_SCRIPT_NAME });
  return { totalProfiles: profiles.length, patchedCount };
}
