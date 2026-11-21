'use client';

import { useState, useEffect, useCallback } from 'react';

export default function RouterBillingPanel({
  adminHeaders = () => ({}),
  showToast = () => {},
  onUpdated = () => {},
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [busyRouterId, setBusyRouterId] = useState(null);
  const [settings, setSettings] = useState({
    enabled: false,
    mode: 'pause_expiry',
    default_monthly_fee: 15000,
    grace_period_days: 3,
    notice_message:
      'Monthly subscription unpaid — voucher auto-expiry is currently paused on this router. Renew your monthly subscription to restore automatic voucher expiry.',
  });
  const [routers, setRouters] = useState([]);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/router-billing', { headers: adminHeaders() });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setRouters(data.routers || []);
      }
    } catch (e) {
      console.warn('Router billing load warning:', e.message);
    } finally {
      setLoading(false);
    }
  }, [adminHeaders]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const pausedRouters = routers.filter((r) => r.billing_state?.showSubscribeNotice);

  const handleSaveGlobal = async (overridePayload = null) => {
    setSavingGlobal(true);
    try {
      const payload = overridePayload || settings;
      const res = await fetch('/api/super-admin/router-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not update billing enforcement', 'error');
        return;
      }
      setSettings(data.settings);
      showToast(
        data.settings.enabled
          ? `✓ Monthly fee enforcement ENABLED (${data.paused_count}/${data.total} router(s) paused)`
          : '✓ Monthly fee enforcement DISABLED — all routers restored to normal auto-expiry',
        'success'
      );
      await loadBilling();
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleRouterAction = async (routerId, payload, successLabel) => {
    setBusyRouterId(routerId);
    try {
      const res = await fetch('/api/super-admin/router-billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ router_id: routerId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Router billing update failed', 'error');
        return;
      }
      showToast(successLabel, 'success');
      await loadBilling();
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyRouterId(null);
    }
  };

  return (
    <div style={{ margin: '12px 0 8px' }}>
      {/* Prominent Subscribe Banner if ANY router currently has expiry paused / unpaid notice */}
      {pausedRouters.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '13px 16px',
            borderRadius: '12px',
            background: 'rgba(217, 119, 6, 0.16)',
            border: '1px solid rgba(251, 191, 36, 0.55)',
            color: '#fef3c7',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: '13px', lineHeight: 1.45 }}>
            <strong style={{ color: '#fde68a' }}>
              ⚠️ Subscription Notice ({pausedRouters.length} router{pausedRouters.length > 1 ? 's' : ''}):
            </strong>{' '}
            {pausedRouters[0].billing_state?.noticeMessage || settings.notice_message}{' '}
            <span style={{ opacity: 0.9 }}>
              ({pausedRouters.map((r) => r.name).join(', ')})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              background: '#d97706',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Manage Subscriptions
          </button>
        </div>
      )}

      {/* Collapsible Control Panel */}
      <div
        style={{
          borderRadius: '16px',
          background: '#0f1b30',
          border: settings.enabled
            ? '1px solid rgba(251, 191, 36, 0.45)'
            : '1px solid rgba(148, 163, 184, 0.25)',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        <div
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: settings.enabled ? 'rgba(245, 158, 11, 0.22)' : 'rgba(148, 163, 184, 0.16)',
                  border: settings.enabled ? '1px solid rgba(251, 191, 36, 0.5)' : '1px solid rgba(148, 163, 184, 0.35)',
                  color: settings.enabled ? '#fde68a' : '#cbd5e1',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                }}
              >
                {settings.enabled ? 'Enforcement ON' : 'Optional • Currently OFF'}
              </span>
              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#fff' }}>
                Monthly Router Subscription &amp; Expiry-Pause Control
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              Optional SaaS toggle: when enabled, unpaid routers pause voucher auto-expiry (or show a subscribe notice). Toggle ON/OFF globally or per individual router.
            </p>
          </div>
          <button
            type="button"
            style={{
              background: 'rgba(2, 132, 199, 0.28)',
              color: '#e0f2fe',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              borderRadius: '9px',
              padding: '8px 13px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Hide Controls ▲' : 'Configure Billing Toggle ▼'}
          </button>
        </div>

        {expanded && (
          <div style={{ padding: '14px 20px 20px', borderTop: '1px solid rgba(148, 163, 184, 0.18)' }}>
            {/* Master Global Switch Row */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                    Master Switch (Applies to All Connected Routers)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Off by default. Turn ON to enforce monthly subscription fees across all routers (exempt individual routers below anytime).
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={savingGlobal}
                    onClick={() => handleSaveGlobal({ ...settings, enabled: !settings.enabled })}
                    style={{
                      background: settings.enabled ? '#d97706' : '#0284c7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '9px',
                      padding: '8px 14px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {savingGlobal ? 'Applying...' : settings.enabled ? 'Turn OFF Globally' : 'Turn ON for All Routers'}
                  </button>
                  <button
                    type="button"
                    disabled={savingGlobal}
                    onClick={() => handleSaveGlobal({ action: 'disable_all' })}
                    style={{
                      background: 'rgba(22, 163, 74, 0.2)',
                      color: '#86efac',
                      border: '1px solid rgba(74, 222, 128, 0.4)',
                      borderRadius: '9px',
                      padding: '8px 13px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Disable All &amp; Resume Expiry
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Action When Unpaid</label>
                  <select
                    value={settings.mode}
                    onChange={(e) => setSettings((p) => ({ ...p, mode: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '12.5px' }}
                  >
                    <option value="pause_expiry">Pause Voucher Auto-Expiry + Show Subscribe Banner</option>
                    <option value="notice_only">Show Subscribe Warning Banner Only (Keep Expiry Running)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Grace Period (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={settings.grace_period_days}
                    onChange={(e) => setSettings((p) => ({ ...p, grace_period_days: Number(e.target.value) || 0 }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Message Shown When Unpaid</label>
                  <input
                    type="text"
                    value={settings.notice_message}
                    onChange={(e) => setSettings((p) => ({ ...p, notice_message: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '12.5px' }}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    disabled={savingGlobal}
                    onClick={() => handleSaveGlobal(settings)}
                    style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {savingGlobal ? 'Syncing Routers...' : 'Save Settings & Sync Routers'}
                  </button>
                </div>
              </div>
            </div>

            {/* Individual Router Overrides */}
            <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#fff', marginBottom: '8px' }}>
              Individual Router Controls ({routers.length})
            </div>

            {loading ? (
              <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>Loading routers...</div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {routers.map((r) => {
                  const st = r.billing_state || {};
                  const busy = busyRouterId === r.id;
                  const dueText = r.subscription_expires_at
                    ? new Date(r.subscription_expires_at).toLocaleDateString()
                    : 'No due date set';

                  return (
                    <div
                      key={r.id}
                      style={{
                        background: st.showSubscribeNotice ? 'rgba(217, 119, 6, 0.12)' : 'rgba(15, 23, 42, 0.55)',
                        border: st.showSubscribeNotice ? '1px solid rgba(251, 191, 36, 0.45)' : '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '10px',
                        padding: '11px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{r.name}</span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: st.shouldPauseExpiry
                                ? 'rgba(239, 68, 68, 0.22)'
                                : st.effectiveStatus === 'exempt'
                                  ? 'rgba(56, 189, 248, 0.2)'
                                  : 'rgba(22, 163, 74, 0.2)',
                              color: st.shouldPauseExpiry
                                ? '#fca5a5'
                                : st.effectiveStatus === 'exempt'
                                  ? '#7dd3fc'
                                  : '#86efac',
                            }}
                          >
                            {st.shouldPauseExpiry
                              ? 'Expiry Paused (Unpaid)'
                              : st.showSubscribeNotice
                                ? 'Subscribe Notice Active'
                                : st.effectiveStatus === 'exempt'
                                  ? 'Exempt (Always Normal)'
                                  : 'Normal Auto-Expiry'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                          Plan Status: <code>{r.subscription_status || 'active'}</code> • Due: <code>{dueText}</code> • Override: <code>{r.billing_enforcement_override || 'inherit'}</code>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          disabled={busy}
                          value={r.billing_enforcement_override || 'inherit'}
                          onChange={(e) =>
                            handleRouterAction(
                              r.id,
                              { billing_enforcement_override: e.target.value },
                              `Updated enforcement override for "${r.name}"`
                            )
                          }
                          style={{ padding: '6px 8px', borderRadius: '7px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '11.5px' }}
                        >
                          <option value="inherit">Follow Global Switch</option>
                          <option value="force_off">Toggle OFF (Exempt)</option>
                          <option value="force_on">Toggle ON (Enforce)</option>
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRouterAction(r.id, { action: 'mark_paid_30d' }, `✓ Marked "${r.name}" Paid (+30d) & resumed auto-expiry`)}
                          style={{ background: 'rgba(22, 163, 74, 0.22)', color: '#86efac', border: '1px solid rgba(74, 222, 128, 0.45)', borderRadius: '7px', padding: '6px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Mark Paid (+30d)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRouterAction(r.id, { action: 'mark_unpaid' }, `Marked "${r.name}" Past Due`)}
                          style={{ background: 'rgba(217, 119, 6, 0.22)', color: '#fde68a', border: '1px solid rgba(251, 191, 36, 0.45)', borderRadius: '7px', padding: '6px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Mark Unpaid
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
