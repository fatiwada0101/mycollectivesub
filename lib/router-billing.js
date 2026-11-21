import { supabaseAdmin } from './supabase-server.js';
import { buildMikroTikRequest } from './mikrotik.js';
import { EXPIRY_SCRIPT_NAME } from './voucher-expiry.js';

export const ROUTER_BILLING_SETTINGS_KEY = 'router_billing_enforcement';

export const DEFAULT_ROUTER_BILLING_SETTINGS = {
  enabled: false, // Strictly optional — OFF by default
  mode: 'pause_expiry', // 'pause_expiry' | 'notice_only'
  default_monthly_fee: 15000,
  grace_period_days: 3,
  notice_message:
    'Monthly subscription unpaid — voucher auto-expiry is currently paused on this router. Renew your monthly subscription to restore automatic voucher expiry.',
};

export async function getRouterBillingSettings() {
  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', ROUTER_BILLING_SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && typeof data.value === 'object') {
      return {
        ...DEFAULT_ROUTER_BILLING_SETTINGS,
        ...data.value,
        enabled: Boolean(data.value.enabled),
        mode: data.value.mode === 'notice_only' ? 'notice_only' : 'pause_expiry',
        default_monthly_fee: Number(data.value.default_monthly_fee ?? DEFAULT_ROUTER_BILLING_SETTINGS.default_monthly_fee) || 0,
        grace_period_days: Math.max(0, Number(data.value.grace_period_days ?? DEFAULT_ROUTER_BILLING_SETTINGS.grace_period_days) || 0),
        notice_message: String(data.value.notice_message || DEFAULT_ROUTER_BILLING_SETTINGS.notice_message).trim(),
      };
    }
  } catch {}
  return { ...DEFAULT_ROUTER_BILLING_SETTINGS };
}

export async function saveRouterBillingSettings(partial = {}) {
  const current = await getRouterBillingSettings();
  const merged = {
    ...current,
    ...(partial.enabled !== undefined ? { enabled: Boolean(partial.enabled) } : {}),
    ...(partial.mode !== undefined ? { mode: partial.mode === 'notice_only' ? 'notice_only' : 'pause_expiry' } : {}),
    ...(partial.default_monthly_fee !== undefined ? { default_monthly_fee: Math.max(0, Number(partial.default_monthly_fee) || 0) } : {}),
    ...(partial.grace_period_days !== undefined ? { grace_period_days: Math.max(0, Number(partial.grace_period_days) || 0) } : {}),
    ...(typeof partial.notice_message === 'string' && partial.notice_message.trim()
      ? { notice_message: partial.notice_message.trim() }
      : {}),
  };

  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert(
      {
        key: ROUTER_BILLING_SETTINGS_KEY,
        value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) throw error;
  return merged;
}

/**
 * Pure deterministic evaluator for whether a router's monthly subscription
 * enforcement is active and whether its voucher expiry scheduler should be paused.
 */
export function evaluateRouterBillingState(router, globalSettings = DEFAULT_ROUTER_BILLING_SETTINGS, nowMs = Date.now()) {
  const settings = { ...DEFAULT_ROUTER_BILLING_SETTINGS, ...(globalSettings || {}) };
  const override = router?.billing_enforcement_override || 'inherit'; // 'inherit' | 'force_on' | 'force_off'
  const subStatus = router?.subscription_status || 'active'; // 'active' | 'past_due' | 'suspended' | 'exempt'

  // Explicitly exempted individual router or forced OFF
  if (override === 'force_off' || subStatus === 'exempt') {
    return {
      enforcementActive: false,
      isOverdue: false,
      shouldPauseExpiry: false,
      showSubscribeNotice: false,
      noticeMessage: null,
      effectiveStatus: 'exempt',
      daysOverdue: 0,
    };
  }

  const enforcementActive = override === 'force_on' ? true : Boolean(settings.enabled);
  if (!enforcementActive) {
    return {
      enforcementActive: false,
      isOverdue: false,
      shouldPauseExpiry: false,
      showSubscribeNotice: false,
      noticeMessage: null,
      effectiveStatus: subStatus === 'active' ? 'active' : 'monitoring_off',
      daysOverdue: 0,
    };
  }

  let isOverdue = subStatus === 'past_due' || subStatus === 'suspended';
  let daysOverdue = 0;

  if (router?.subscription_expires_at) {
    const dueMs = Date.parse(router.subscription_expires_at);
    const graceMs = (Number(settings.grace_period_days) || 0) * 86400 * 1000;
    if (Number.isFinite(dueMs) && nowMs > dueMs + graceMs) {
      isOverdue = true;
      daysOverdue = Math.max(1, Math.floor((nowMs - dueMs) / (86400 * 1000)));
    }
  }

  if (!isOverdue) {
    return {
      enforcementActive: true,
      isOverdue: false,
      shouldPauseExpiry: false,
      showSubscribeNotice: false,
      noticeMessage: null,
      effectiveStatus: 'paid',
      daysOverdue: 0,
    };
  }

  const shouldPauseExpiry = settings.mode !== 'notice_only';
  const noticeMessage = router?.billing_notice_message || settings.notice_message;

  return {
    enforcementActive: true,
    isOverdue: true,
    shouldPauseExpiry,
    showSubscribeNotice: true,
    noticeMessage,
    effectiveStatus: shouldPauseExpiry ? 'expiry_paused' : 'subscribe_notice',
    daysOverdue,
  };
}

/**
 * Safely pauses or resumes ONLY the `an-voucher-expiry-v1` scheduler on a MikroTik router.
 * Never deletes scripts, vouchers, or active user sessions — 100% reversible in 1 click.
 */
export async function applyRouterExpiryPauseState(routerId, shouldPause) {
  const { url: listUrl, headers, config } = await buildMikroTikRequest('/rest/system/scheduler', routerId);
  if (!config.isConfigured) {
    return { applied: false, reason: 'Router not configured' };
  }

  const res = await fetch(listUrl, { headers, signal: AbortSignal.timeout(7000) });
  if (!res.ok) {
    throw new Error(`Router scheduler read failed (${res.status})`);
  }
  const schedulers = await res.json();
  const target = (Array.isArray(schedulers) ? schedulers : []).find((s) => s.name === EXPIRY_SCRIPT_NAME);

  if (!target?.['.id']) {
    return { applied: false, reason: `Scheduler "${EXPIRY_SCRIPT_NAME}" not installed on this router` };
  }

  const desiredDisabled = shouldPause ? 'true' : 'false';
  const alreadyMatches = String(target.disabled) === desiredDisabled;

  if (!alreadyMatches) {
    const { url: patchUrl, headers: patchHeaders } = await buildMikroTikRequest(
      `/rest/system/scheduler/${encodeURIComponent(target['.id'])}`,
      routerId
    );
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: patchHeaders,
      body: JSON.stringify({ disabled: desiredDisabled }),
      signal: AbortSignal.timeout(7000),
    });
    if (!patchRes.ok) {
      throw new Error(`Could not update scheduler state (${patchRes.status})`);
    }
  }

  // When resuming normal expiry, execute one immediate sweep so overdue vouchers expire right away
  if (!shouldPause) {
    try {
      const { url: runUrl, headers: runHeaders } = await buildMikroTikRequest('/rest/system/script/run', routerId);
      await fetch(runUrl, {
        method: 'POST',
        headers: runHeaders,
        body: JSON.stringify({ number: EXPIRY_SCRIPT_NAME }),
        signal: AbortSignal.timeout(7000),
      });
    } catch {}
  }

  return { applied: true, paused: shouldPause, changed: !alreadyMatches };
}

/**
 * Evaluates and synchronizes billing enforcement across all active routers (or one specific router).
 */
export async function syncRoutersBillingState({ settings = null, routerId = null } = {}) {
  const activeSettings = settings || (await getRouterBillingSettings());
  let query = supabaseAdmin.from('routers').select('*').eq('is_active', true).order('created_at', { ascending: true });
  if (routerId) query = query.eq('id', routerId);

  const { data: routers, error } = await query;
  if (error) throw error;

  const results = [];
  for (const router of routers || []) {
    const state = evaluateRouterBillingState(router, activeSettings);
    let routerSync = { applied: false, skipped: true };

    // Push to MikroTik whenever enforcement requires pausing OR restoring a previously paused router
    const needsRouterPush = state.shouldPauseExpiry || Boolean(router.expiry_paused_by_billing);
    if (needsRouterPush && router.connection_mode !== 'polling') {
      try {
        routerSync = await applyRouterExpiryPauseState(router.id, state.shouldPauseExpiry);
      } catch (err) {
        routerSync = { applied: false, error: err.message };
      }
    }

    if (Boolean(router.expiry_paused_by_billing) !== state.shouldPauseExpiry) {
      await supabaseAdmin
        .from('routers')
        .update({
          expiry_paused_by_billing: state.shouldPauseExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', router.id);
    }

    results.push({
      router_id: router.id,
      name: router.name,
      ...state,
      router_sync: routerSync,
    });
  }

  return {
    settings: activeSettings,
    total: results.length,
    paused_count: results.filter((r) => r.shouldPauseExpiry).length,
    results,
  };
}
