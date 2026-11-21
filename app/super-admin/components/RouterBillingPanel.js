'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function RouterBillingPanel({
  adminHeaders = () => ({}),
  showToast = () => {},
  onUpdated = () => {},
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMessageSettings, setShowMessageSettings] = useState(false);
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

  const adminHeadersRef = useRef(adminHeaders);
  adminHeadersRef.current = adminHeaders;

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/router-billing', { headers: adminHeadersRef.current() });
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
  }, []);

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
        showToast(data.error || 'Could not update billing settings', 'error');
        return;
      }
      setSettings(data.settings);
      showToast(
        data.settings.enabled
          ? `Monthly billing guard enabled (${data.paused_count}/${data.total} router(s) paused)`
          : 'Monthly billing guard turned OFF — all routers running normal auto-expiry',
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
        showToast(data.error || 'Router update failed', 'error');
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
    <div>
      {/* Calm Unpaid Reminder Bar (only shown if any router actually has an active notice) */}
      {pausedRouters.length > 0 && (
        <div className="ux-alert-bar">
          <div>
            <strong>Subscription Notice ({pausedRouters.length}):</strong>{' '}
            {pausedRouters[0].billing_state?.noticeMessage || settings.notice_message}{' '}
            <span style={{ opacity: 0.85 }}>({pausedRouters.map((r) => r.name).join(', ')})</span>
          </div>
          <button
            type="button"
            className="ux-btn ux-btn-amber ux-btn-sm"
            onClick={() => setExpanded(true)}
          >
            Review Routers
          </button>
        </div>
      )}

      <div className="ux-panel">
        {/* Clean Header Bar */}
        <div className="ux-panel-header">
          <div
            className="ux-panel-title-wrap"
            style={{ cursor: 'pointer', flex: 1 }}
            onClick={() => setExpanded((v) => !v)}
          >
            <div className={`ux-icon-badge ${settings.enabled ? 'amber' : ''}`}>
              💳
            </div>
            <div>
              <h3 className="ux-title">
                Monthly Router Billing
                <span className={`ux-pill ${settings.enabled ? 'amber' : ''}`}>
                  <span className="ux-dot" />
                  {settings.enabled ? 'Active' : 'Off'}
                </span>
              </h3>
              <p className="ux-subtitle">
                Optional: pause voucher expiry or show a renew reminder when a router&apos;s monthly fee is unpaid.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Toggle monthly router billing enforcement"
              disabled={savingGlobal}
              className={`ux-switch amber ${settings.enabled ? 'on' : ''}`}
              onClick={() => handleSaveGlobal({ ...settings, enabled: !settings.enabled })}
              title={settings.enabled ? 'Turn OFF globally' : 'Turn ON for all routers'}
            >
              <span className="ux-switch-knob" />
            </button>
            <button
              type="button"
              className="ux-btn ux-btn-secondary ux-btn-sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Close ✕' : 'Manage'}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="ux-panel-body" style={{ display: 'grid', gap: '14px' }}>
            {/* Global Mode Selector Card */}
            <div className="ux-form-card" style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>What happens when a router is unpaid?</div>
                  <div className="ux-subtitle">Applies to all routers following the global switch. You can exempt individual routers below.</div>
                </div>
                {(settings.enabled || pausedRouters.length > 0) && (
                  <button
                    type="button"
                    className="ux-btn ux-btn-success ux-btn-sm"
                    disabled={savingGlobal}
                    onClick={() => handleSaveGlobal({ action: 'disable_all' })}
                  >
                    Turn Off &amp; Resume All
                  </button>
                )}
              </div>

              <div className="ux-choice-grid">
                <button
                  type="button"
                  className={`ux-choice-card ${settings.mode === 'pause_expiry' ? 'selected' : ''}`}
                  onClick={() => handleSaveGlobal({ ...settings, mode: 'pause_expiry' })}
                  disabled={savingGlobal}
                >
                  <span className="ux-choice-title">
                    Pause Voucher Expiry
                    {settings.mode === 'pause_expiry' && <span className="ux-pill blue">Selected</span>}
                  </span>
                  <span className="ux-choice-desc">
                    Stops vouchers from expiring on unpaid routers and displays a renew banner until paid.
                  </span>
                </button>

                <button
                  type="button"
                  className={`ux-choice-card ${settings.mode === 'notice_only' ? 'selected' : ''}`}
                  onClick={() => handleSaveGlobal({ ...settings, mode: 'notice_only' })}
                  disabled={savingGlobal}
                >
                  <span className="ux-choice-title">
                    Show Renew Banner Only
                    {settings.mode === 'notice_only' && <span className="ux-pill blue">Selected</span>}
                  </span>
                  <span className="ux-choice-desc">
                    Displays a subscription reminder while keeping normal automatic voucher expiry running.
                  </span>
                </button>
              </div>

              {/* Progressive Disclosure: Customize Notice & Grace Period */}
              <div>
                <button
                  type="button"
                  className="ux-link-btn"
                  onClick={() => setShowMessageSettings((v) => !v)}
                >
                  {showMessageSettings
                    ? '▾ Hide message & grace period'
                    : `▸ Customize notice message & grace period (${settings.grace_period_days}d grace)`}
                </button>

                {showMessageSettings && (
                  <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: '10px' }}>
                      <div>
                        <label className="ux-label">Grace Days</label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          className="ux-input"
                          value={settings.grace_period_days}
                          onChange={(e) => setSettings((p) => ({ ...p, grace_period_days: Number(e.target.value) || 0 }))}
                        />
                      </div>
                      <div>
                        <label className="ux-label">Renew Notice Message</label>
                        <input
                          type="text"
                          className="ux-input"
                          value={settings.notice_message}
                          onChange={(e) => setSettings((p) => ({ ...p, notice_message: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="ux-btn ux-btn-primary ux-btn-sm"
                        disabled={savingGlobal}
                        onClick={() => handleSaveGlobal(settings)}
                      >
                        {savingGlobal ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Per-Router Simple Controls */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800 }}>Routers ({routers.length})</span>
                <span className="ux-subtitle">Switch: Auto = follows global • Off = exempt • On = always enforce</span>
              </div>

              {loading && routers.length === 0 ? (
                <div className="ux-subtitle">Loading routers...</div>
              ) : routers.length === 0 ? (
                <div className="ux-row-card" style={{ justifyContent: 'center' }}>
                  <span className="ux-subtitle">No routers registered yet.</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {routers.map((r) => {
                    const st = r.billing_state || {};
                    const busy = busyRouterId === r.id;
                    const override = r.billing_enforcement_override || 'inherit';
                    const isUnpaid = r.subscription_status === 'past_due' || r.subscription_status === 'suspended' || st.isOverdue;
                    const dueText = r.subscription_expires_at
                      ? `Due ${new Date(r.subscription_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'No due date';

                    return (
                      <div key={r.id} className={`ux-row-card ${st.showSubscribeNotice ? 'highlight-amber' : ''}`}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '13.5px' }}>{r.name}</strong>
                            <span
                              className={`ux-pill ${
                                st.shouldPauseExpiry
                                  ? 'red'
                                  : st.showSubscribeNotice
                                    ? 'amber'
                                    : st.effectiveStatus === 'exempt'
                                      ? 'blue'
                                      : 'green'
                              }`}
                            >
                              {st.shouldPauseExpiry
                                ? 'Expiry Paused'
                                : st.showSubscribeNotice
                                  ? 'Renew Notice'
                                  : st.effectiveStatus === 'exempt'
                                    ? 'Exempt'
                                    : 'Normal'}
                            </span>
                          </div>
                          <div className="ux-subtitle" style={{ marginTop: '3px' }}>
                            {isUnpaid ? 'Unpaid' : 'Paid'} • {dueText}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* Clean 3-way Segmented Override (Auto | Off | On) */}
                          <div className="ux-seg" role="group" aria-label={`Enforcement override for ${r.name}`}>
                            {[
                              { val: 'inherit', label: 'Auto', cls: '' },
                              { val: 'force_off', label: 'Off', cls: 'off' },
                              { val: 'force_on', label: 'On', cls: 'on' },
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                disabled={busy}
                                className={`ux-seg-btn ${override === opt.val ? `active ${opt.cls}` : ''}`}
                                onClick={() =>
                                  handleRouterAction(
                                    r.id,
                                    { billing_enforcement_override: opt.val },
                                    `${r.name}: set to ${opt.label}`
                                  )
                                }
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {isUnpaid ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="ux-btn ux-btn-success ux-btn-sm"
                              onClick={() =>
                                handleRouterAction(
                                  r.id,
                                  { action: 'mark_paid_30d' },
                                  `"${r.name}" marked Paid (+30d) — auto-expiry active`
                                )
                              }
                            >
                              Mark Paid (+30d)
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              className="ux-btn ux-btn-secondary ux-btn-sm"
                              onClick={() =>
                                handleRouterAction(
                                  r.id,
                                  { action: 'mark_unpaid' },
                                  `"${r.name}" marked Unpaid`
                                )
                              }
                            >
                              Mark Unpaid
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
