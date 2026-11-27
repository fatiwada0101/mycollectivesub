import { EXPIRY_SCRIPT_NAME, FIRST_LOGIN_SCRIPT, EXPIRY_SWEEP_SCRIPT } from './voucher-expiry.js';

function desiredOnLoginScript(existing = '') {
  const unrelated = String(existing || '').replace(/# AN voucher expiry v\d+[\s\S]*?# End AN voucher expiry v\d+\s*/g, '');
  return FIRST_LOGIN_SCRIPT + '\n' + unrelated;
}

async function ensureRouterExpiryPrerequisites(request, prefetchedProfiles = null) {
  const [resource, clock, ntp] = await Promise.all([
    request('/system/resource'),
    request('/system/clock'),
    request('/system/ntp/client'),
  ]);
  const [major, minor] = String(resource.version).split('.').map(Number);
  if (major < 7 || (major === 7 && minor < 12) || !major) throw new Error('First-login voucher expiry requires RouterOS 7.12 or later');
  const routerTime = Date.parse(`${clock.date}T${clock.time}${clock['gmt-offset'] || '+00:00'}`);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(clock.date) || !Number.isFinite(routerTime) || Math.abs(routerTime - Date.now()) > 300000) {
    throw new Error('Synchronize the router clock before generating vouchers');
  }
  if (ntp.status !== 'synchronized') throw new Error('Wait for the router NTP clock to synchronize before generating vouchers');
  const profiles = Array.isArray(prefetchedProfiles) ? prefetchedProfiles : await request('/ip/hotspot/user/profile');
  return Array.isArray(profiles) ? profiles : [];
}

async function ensureSweepScriptAndScheduler(request) {
  const [scripts, schedulers] = await Promise.all([
    request('/system/script'),
    request('/system/scheduler'),
  ]);
  let scriptChanged = false;
  const script = (Array.isArray(scripts) ? scripts : []).find(s => s.name === EXPIRY_SCRIPT_NAME);
  if (script && script.source !== EXPIRY_SWEEP_SCRIPT) {
    await request(`/system/script/${encodeURIComponent(script['.id'])}`, 'PATCH', { source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
    scriptChanged = true;
  } else if (!script) {
    await request('/system/script', 'PUT', { name: EXPIRY_SCRIPT_NAME, source: EXPIRY_SWEEP_SCRIPT, policy: 'read,write,test' });
    scriptChanged = true;
  }
  const scheduler = (Array.isArray(schedulers) ? schedulers : []).find(s => s.name === EXPIRY_SCRIPT_NAME);
  const schedule = { 'start-time': 'startup', interval: '10s', 'on-event': `/system script run ${EXPIRY_SCRIPT_NAME}`, policy: 'read,write,test', disabled: 'false' };
  const schedulerMatches = Boolean(
    scheduler &&
    scheduler['start-time'] === schedule['start-time'] &&
    scheduler.interval === schedule.interval &&
    scheduler['on-event'] === schedule['on-event'] &&
    (scheduler.disabled === 'false' || scheduler.disabled === false)
  );
  if (scheduler && !schedulerMatches) {
    await request(`/system/scheduler/${encodeURIComponent(scheduler['.id'])}`, 'PATCH', schedule);
  } else if (!scheduler) {
    await request('/system/scheduler', 'PUT', { name: EXPIRY_SCRIPT_NAME, ...schedule });
  }
  const scriptHasRun = Number(script?.['run-count'] || 0) > 0;
  return { needsVerifyRun: scriptChanged || !scriptHasRun };
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
export async function installFirstLoginExpiry(request, profileName, prefetchedProfiles = null) {
  const profiles = await ensureRouterExpiryPrerequisites(request, prefetchedProfiles);
  const profile = profiles.find(p => p.name === profileName);
  if (!profile) throw new Error(`Hotspot user profile "${profileName}" does not exist`);
  const { needsVerifyRun } = await ensureSweepScriptAndScheduler(request);
  await patchProfileFirstLoginExpiry(request, profile);
  // Execute once on initial install/upgrade to expose script syntax/permission errors before issuing vouchers.
  if (needsVerifyRun) {
    await request('/system/script/run', 'POST', { number: EXPIRY_SCRIPT_NAME });
  }
}

// Enforces first-login wall-clock expiry + MAC-cookie reconnect across EVERY
// hotspot user profile on the router (current, legacy, default, and custom).
export async function installFirstLoginExpiryForAllProfiles(request) {
  const profiles = await ensureRouterExpiryPrerequisites(request);
  const { needsVerifyRun } = await ensureSweepScriptAndScheduler(request);
  let patchedCount = 0;
  for (const profile of profiles) {
    if (!profile?.['.id']) continue;
    if (await patchProfileFirstLoginExpiry(request, profile)) patchedCount++;
  }
  if (needsVerifyRun) {
    await request('/system/script/run', 'POST', { number: EXPIRY_SCRIPT_NAME });
  }
  return { totalProfiles: profiles.length, patchedCount };
}
