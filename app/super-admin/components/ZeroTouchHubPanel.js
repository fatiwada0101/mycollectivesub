'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function ZeroTouchHubPanel({
  adminHeaders = () => ({}),
  showToast = () => {},
  locations = [],
  onRouterOnboarded = () => {},
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('router'); // 'router' | 'servers'
  const [hubs, setHubs] = useState([]);
  const [fleetSummary, setFleetSummary] = useState(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loadingHubs, setLoadingHubs] = useState(false);

  // Router onboarding state
  const [onboardForm, setOnboardForm] = useState({
    router_name: '',
    router_state: 'existing', // 'existing' | 'fresh'
    location_id: '',
    vps_hub_id: '',
    dns_name: 'hotspot.mycollectivesub.net',
  });
  const [showRouterAdvanced, setShowRouterAdvanced] = useState(false);
  const [showLaptopHelper, setShowLaptopHelper] = useState(false);
  const [generatingBootstrap, setGeneratingBootstrap] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [checkingRouter, setCheckingRouter] = useState(false);
  const [routerVerifiedOnline, setRouterVerifiedOnline] = useState(false);

  // Server (VPS) management state
  const [serverAddMode, setServerAddMode] = useState(null); // null | 'auto' | 'manual'
  const [showServerAdvanced, setShowServerAdvanced] = useState(false);
  const [scriptTab, setScriptTab] = useState('existing'); // 'existing' | 'fresh'
  const [enrollingVps, setEnrollingVps] = useState(false);
  const [savingHub, setSavingHub] = useState(false);
  const [testingHubId, setTestingHubId] = useState(null);
  const [migratingHubId, setMigratingHubId] = useState(null);
  const [vpsBootstrap, setVpsBootstrap] = useState(null);

  const [vpsAutoForm, setVpsAutoForm] = useState({
    name: '',
    wg_subnet: '10.100.0.0/16',
    max_routers: 1000,
    is_default: true,
  });

  const [hubForm, setHubForm] = useState({
    name: '',
    public_ip: '',
    provisioner_url: '',
    api_secret: '',
    wg_subnet: '10.100.0.0/16',
    port_range_start: 8443,
    port_range_end: 18442,
    max_routers: 1000,
    is_default: true,
  });

  const adminHeadersRef = useRef(adminHeaders);
  adminHeadersRef.current = adminHeaders;

  const fetchHubs = useCallback(async () => {
    setLoadingHubs(true);
    try {
      const res = await fetch('/api/super-admin/vps-hubs', { headers: adminHeadersRef.current() });
      const data = await res.json();
      if (data.success) {
        const list = data.hubs || [];
        setHubs(list);
        setFleetSummary(data.fleet_summary || null);
        setNeedsMigration(Boolean(data.needs_migration));
        const nextSubnet = data.fleet_summary?.suggested_next_subnet;
        if (nextSubnet) {
          setVpsAutoForm((prev) => ({
            ...prev,
            wg_subnet: prev.name ? prev.wg_subnet : nextSubnet,
            is_default: list.length === 0,
          }));
          setHubForm((prev) => ({
            ...prev,
            wg_subnet: prev.name ? prev.wg_subnet : nextSubnet,
            is_default: list.length === 0,
          }));
        }
      }
    } catch (e) {
      console.warn('Cloud servers load warning:', e.message);
    } finally {
      setLoadingHubs(false);
    }
  }, []);

  // Load summary badge silently on mount so header pill shows accurate live status
  useEffect(() => {
    fetchHubs();
  }, [fetchHubs]);

  const onlineHubs = hubs.filter((h) => h.status === 'online');
  const totalUsed = fleetSummary?.total_routers_on_hubs ?? 0;
  const totalCap = fleetSummary?.total_capacity ?? 0;
  const fleetPct = totalCap > 0 ? Math.min(100, Math.round((totalUsed / totalCap) * 100)) : 0;

  const openPanel = (tab) => {
    setActiveTab(tab);
    setExpanded(true);
    fetchHubs();
  };

  const copyText = (text, label) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast(`Copied ${label}`, 'success');
    }
  };

  const handleGenerateBootstrap = async (e) => {
    e.preventDefault();
    if (!onboardForm.router_name.trim()) {
      showToast('Enter a router name first (e.g. Katsina Branch 2)', 'error');
      return;
    }
    setGeneratingBootstrap(true);
    setBootstrapResult(null);
    setRouterVerifiedOnline(false);
    try {
      const res = await fetch('/api/super-admin/routers/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          mode: 'bootstrap_script',
          router_name: onboardForm.router_name.trim(),
          vps_hub_id: onboardForm.vps_hub_id || null,
          location_id: onboardForm.location_id || null,
          dns_name: onboardForm.dns_name.trim() || 'hotspot.mycollectivesub.net',
          preserve_existing: onboardForm.router_state !== 'fresh',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not generate setup command', 'error');
        return;
      }
      setBootstrapResult(data);
      showToast(`Setup line ready for "${data.router.name}"`, 'success');
      onRouterOnboarded?.();
      fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGeneratingBootstrap(false);
    }
  };

  const handleCheckConnected = async () => {
    if (!bootstrapResult?.router?.id) return;
    setCheckingRouter(true);
    try {
      const res = await fetch(`/api/mikrotik/test-connection?router_id=${encodeURIComponent(bootstrapResult.router.id)}`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (data.connected || data.success) {
        setRouterVerifiedOnline(true);
        showToast(`"${bootstrapResult.router.name}" is online and ready to sell vouchers!`, 'success');
        onRouterOnboarded?.();
      } else {
        showToast('Not online yet — paste the line in Router Terminal and wait ~10 seconds, then try again.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCheckingRouter(false);
    }
  };

  const handleAutoEnrollVps = async (e) => {
    e.preventDefault();
    if (!vpsAutoForm.name.trim()) {
      showToast('Give your server a name (e.g. Hostinger Hub 1)', 'error');
      return;
    }
    setEnrollingVps(true);
    setVpsBootstrap(null);
    try {
      const res = await fetch('/api/super-admin/vps-hubs/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(vpsAutoForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not generate server setup script', 'error');
        return;
      }
      setVpsBootstrap(data);
      showToast(`Setup script ready for "${data.hub.name}"`, 'success');
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setEnrollingVps(false);
    }
  };

  const handleSaveManualHub = async (e) => {
    e.preventDefault();
    if (!hubForm.name.trim() || !hubForm.public_ip.trim() || !hubForm.api_secret.trim()) {
      showToast('Enter Server Name, Public IP, and API Secret', 'error');
      return;
    }
    setSavingHub(true);
    try {
      const payload = {
        ...hubForm,
        provisioner_url: hubForm.provisioner_url.trim() || `https://${hubForm.public_ip.trim()}:9443`,
      };
      const res = await fetch('/api/super-admin/vps-hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not save server', 'error');
        return;
      }
      showToast(
        data.health?.ok
          ? `"${data.hub.name}" connected and online!`
          : `"${data.hub.name}" saved (${data.health?.error || 'pending connection'})`,
        data.health?.ok ? 'success' : 'info'
      );
      setHubForm({
        name: '',
        public_ip: '',
        provisioner_url: '',
        api_secret: '',
        wg_subnet: fleetSummary?.suggested_next_subnet || '10.100.0.0/16',
        port_range_start: 8443,
        port_range_end: 18442,
        max_routers: 1000,
        is_default: false,
      });
      setServerAddMode(null);
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingHub(false);
    }
  };

  const handleTestHub = async (hubId) => {
    setTestingHubId(hubId);
    try {
      const res = await fetch('/api/super-admin/vps-hubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ id: hubId }),
      });
      const data = await res.json();
      if (data.success && data.health?.ok) {
        showToast(`Online (${data.health.latencyMs}ms, ${data.health.peerCount} active tunnels)`, 'success');
      } else {
        showToast(`Unreachable: ${data.error || 'Check server port 9443'}`, 'error');
      }
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTestingHubId(null);
    }
  };

  const handleMigrateToHub = async (hub) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Move all active routers to "${hub.name}" (${hub.public_ip})? Connected routers will switch automatically within 60 seconds.`)
    ) return;
    setMigratingHubId(hub.id);
    try {
      const res = await fetch('/api/super-admin/vps-hubs/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ target_vps_hub_id: hub.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not switch routers', 'error');
        return;
      }
      showToast(`Switched ${data.migrated_count}/${data.total_routers} router(s) to "${hub.name}". Reconnecting within 60s.`, 'success');
      await fetchHubs();
      onRouterOnboarded?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMigratingHubId(null);
    }
  };

  const handleDeleteHub = async (hub) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove server "${hub.name}"?`)) return;
    try {
      const res = await fetch(`/api/super-admin/vps-hubs?id=${encodeURIComponent(hub.id)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed "${hub.name}"`, 'success');
        await fetchHubs();
      } else {
        showToast(data.error || 'Remove failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="ux-panel">
      {/* Clean Header Bar */}
      <div className="ux-panel-header">
        <div
          className="ux-panel-title-wrap"
          style={{ cursor: 'pointer', flex: 1 }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className={`ux-icon-badge ${onlineHubs.length > 0 ? 'green' : ''}`}>
            ⚡
          </div>
          <div>
            <h3 className="ux-title">
              Easy Router Setup
              {onlineHubs.length > 0 ? (
                <span className="ux-pill green">
                  <span className="ux-dot" />
                  {onlineHubs.length} Cloud {onlineHubs.length === 1 ? 'Server' : 'Servers'} Online
                  {totalCap > 0 ? ` • ${totalUsed}/${totalCap.toLocaleString()}` : ''}
                </span>
              ) : (
                <span className="ux-pill blue">Zero SSH</span>
              )}
            </h3>
            <p className="ux-subtitle">
              Connect already-configured or new MikroTik routers in 1 step, and scale across cloud servers automatically.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ux-btn ux-btn-primary ux-btn-sm"
            onClick={() => openPanel('router')}
          >
            + Connect Router
          </button>
          <button
            type="button"
            className="ux-btn ux-btn-secondary ux-btn-sm"
            onClick={() => openPanel('servers')}
          >
            Cloud Servers ({hubs.length})
          </button>
          {expanded && (
            <button
              type="button"
              className="ux-btn ux-btn-secondary ux-btn-sm"
              onClick={() => setExpanded(false)}
              aria-label="Collapse setup panel"
            >
              Close ✕
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ux-panel-body">
          {/* Clean Segmented Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="ux-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'router'}
                className={`ux-tab ${activeTab === 'router' ? 'active' : ''}`}
                onClick={() => setActiveTab('router')}
              >
                Connect Router
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'servers'}
                className={`ux-tab ${activeTab === 'servers' ? 'active' : ''}`}
                onClick={() => setActiveTab('servers')}
              >
                Cloud Servers
                <span className={`ux-pill ${onlineHubs.length > 0 ? 'green' : ''}`}>{hubs.length}</span>
              </button>
            </div>
          </div>

          {needsMigration && (
            <div className="ux-alert-bar" style={{ marginTop: 0 }}>
              <span>Database setup pending — apply migration <code>20261121000001_zero_touch_vps_hubs.sql</code>.</span>
            </div>
          )}

          {/* ── TAB 1: CONNECT A ROUTER ── */}
          {activeTab === 'router' && (
            <div className="ux-form-card">
              {hubs.length === 0 && !bootstrapResult?.bootstrap?.one_line_command && (
                <div className="ux-alert-bar" style={{ marginTop: 0, marginBottom: '12px' }}>
                  <span>
                    No Cloud Server added yet — you can generate and run the 1-line MikroTik command now, and it will auto-connect within 60s when you add a Cloud Server later.
                  </span>
                  <button
                    type="button"
                    className="ux-btn ux-btn-secondary ux-btn-sm"
                    onClick={() => {
                      setActiveTab('servers');
                      setServerAddMode('auto');
                    }}
                  >
                    + Add Cloud Server
                  </button>
                </div>
              )}

              {bootstrapResult?.bootstrap?.one_line_command ? (
                /* Clean 3-Step Result Card */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                        {routerVerifiedOnline ? '🎉 Router Connected!' : `Ready to Connect "${bootstrapResult.router.name}"`}
                      </h4>
                      <p className="ux-subtitle">
                        {bootstrapResult.vps
                          ? <>Assigned server: <strong>{bootstrapResult.vps.name}</strong> ({bootstrapResult.vps.public_ip}:{bootstrapResult.vps.external_port})</>
                          : <>Staged without a Cloud Server — paste the command now, then add a Cloud Server later to auto-link within 60s.</>}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ux-btn ux-btn-secondary ux-btn-sm"
                      onClick={() => {
                        setBootstrapResult(null);
                        setRouterVerifiedOnline(false);
                        setOnboardForm((p) => ({ ...p, router_name: '' }));
                      }}
                    >
                      + Connect Another
                    </button>
                  </div>

                  <div className="ux-code-wrap">
                    <div className="ux-code-top">
                      <span>1-Line MikroTik Terminal Command</span>
                      <button
                        type="button"
                        className="ux-btn ux-btn-primary ux-btn-sm"
                        onClick={() => copyText(bootstrapResult.bootstrap.one_line_command, 'setup command')}
                      >
                        Copy Line
                      </button>
                    </div>
                    <pre className="ux-code-body">{bootstrapResult.bootstrap.one_line_command}</pre>
                  </div>

                  <div className="ux-steps">
                    <div className="ux-step-row">
                      <span className="ux-step-num">1</span>
                      <span>Connect to the router&apos;s Wi-Fi and open <code>http://192.168.88.1</code> (WebFig) or WinBox.</span>
                    </div>
                    <div className="ux-step-row">
                      <span className="ux-step-num">2</span>
                      <span>Open <strong>Terminal</strong>, paste the line above, and press <strong>Enter</strong>.</span>
                    </div>
                    <div className="ux-step-row">
                      <span className="ux-step-num">3</span>
                      <span>Wait ~10 seconds, then verify the connection below.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`ux-btn ${routerVerifiedOnline ? 'ux-btn-success' : 'ux-btn-primary'}`}
                      onClick={handleCheckConnected}
                      disabled={checkingRouter}
                    >
                      {checkingRouter
                        ? 'Checking...'
                        : routerVerifiedOnline
                          ? '✓ Router Is Online — Ready for Vouchers'
                          : 'Check Connection Now'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Clean 3-Field Form */
                <form onSubmit={handleGenerateBootstrap} style={{ display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div>
                      <label className="ux-label">Router Name</label>
                      <input
                        type="text"
                        className="ux-input"
                        value={onboardForm.router_name}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, router_name: e.target.value }))}
                        placeholder="e.g. Katsina Branch 2"
                        required
                      />
                    </div>
                    <div>
                      <label className="ux-label">Location (Optional)</label>
                      <select
                        className="ux-input"
                        value={onboardForm.location_id}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, location_id: e.target.value }))}
                      >
                        <option value="">Unassigned</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="ux-label">Is this router already set up?</label>
                    <div className="ux-choice-grid">
                      <button
                        type="button"
                        className={`ux-choice-card ${onboardForm.router_state === 'existing' ? 'selected' : ''}`}
                        onClick={() => setOnboardForm((p) => ({ ...p, router_state: 'existing' }))}
                      >
                        <span className="ux-choice-title">
                          Already Configured
                          <span className="ux-pill green">Recommended</span>
                        </span>
                        <span className="ux-choice-desc">
                          Keeps existing Hotspot, DNS &amp; users untouched. Just links to cloud so you can sell vouchers.
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`ux-choice-card ${onboardForm.router_state === 'fresh' ? 'selected' : ''}`}
                        onClick={() => setOnboardForm((p) => ({ ...p, router_state: 'fresh' }))}
                      >
                        <span className="ux-choice-title">
                          Brand-New Router
                          {onboardForm.router_state === 'fresh' && <span className="ux-pill blue">Selected</span>}
                        </span>
                        <span className="ux-choice-desc">
                          Fresh MikroTik out of the box. Configures Hotspot DNS and full cloud setup automatically.
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Progressive Disclosure: Advanced Options */}
                  <div>
                    <button
                      type="button"
                      className="ux-link-btn"
                      onClick={() => setShowRouterAdvanced((v) => !v)}
                    >
                      {showRouterAdvanced ? '▾ Hide advanced options' : '▸ Advanced options (Cloud server & DNS)'}
                    </button>

                    {showRouterAdvanced && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '10px' }}>
                        <div>
                          <label className="ux-label">Cloud Server</label>
                          <select
                            className="ux-input"
                            value={onboardForm.vps_hub_id}
                            onChange={(e) => setOnboardForm((p) => ({ ...p, vps_hub_id: e.target.value }))}
                          >
                            <option value="">Auto-Select (Recommended — Auto-scales)</option>
                            {hubs.map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({h.router_count ?? 0}/{(h.effective_capacity ?? h.max_routers ?? 1000).toLocaleString()} routers)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="ux-label">Hotspot DNS Name</label>
                          <input
                            type="text"
                            className="ux-input"
                            value={onboardForm.dns_name}
                            onChange={(e) => setOnboardForm((p) => ({ ...p, dns_name: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      className="ux-btn ux-btn-primary"
                      disabled={generatingBootstrap}
                    >
                      {generatingBootstrap ? 'Generating...' : 'Get 1-Line Setup Command'}
                    </button>

                    <button
                      type="button"
                      className="ux-link-btn"
                      onClick={() => setShowLaptopHelper((v) => !v)}
                    >
                      {showLaptopHelper ? 'Hide Laptop Connector' : 'Prefer IP + Password (No Terminal)? ▸'}
                    </button>
                  </div>

                  {showLaptopHelper && (
                    <div className="ux-row-card" style={{ marginTop: '2px' }}>
                      <div style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
                        <strong>Laptop Plug &amp; Play Connector</strong> — Connect your laptop to the router&apos;s Wi-Fi and run{' '}
                        <code>npm run connector</code> (or double-click <code>router-connector/Launch-Router-Connector.bat</code>), then type <code>192.168.88.1</code> &amp; password.
                      </div>
                      <button
                        type="button"
                        className="ux-btn ux-btn-secondary ux-btn-sm"
                        onClick={() => copyText('npm run connector', 'connector command')}
                      >
                        Copy Command
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* Subtle 1-Line Guarantee Footer */}
              <div className="ux-footer-strip">
                <span>✓ Starts on first login</span>
                <span>✓ Offline expiry (10s)</span>
                <span>✓ Auto-reconnects Wi-Fi</span>
                <span>✓ 60s VPS auto-failover</span>
              </div>
            </div>
          )}

          {/* ── TAB 2: CLOUD SERVERS (MULTI-VPS HUBS) ── */}
          {activeTab === 'servers' && (
            <div style={{ display: 'grid', gap: '14px' }}>
              {/* Fleet Capacity Card */}
              <div className="ux-form-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800 }}>
                      Fleet Capacity: {totalUsed.toLocaleString()} / {totalCap.toLocaleString()} routers
                    </div>
                    <div className="ux-subtitle">
                      Each server holds up to 1,000 routers by default. Add more servers anytime to auto-scale past 10,000+.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="ux-btn ux-btn-primary ux-btn-sm"
                      onClick={() => {
                        setServerAddMode((m) => (m === 'auto' ? null : 'auto'));
                        setVpsBootstrap(null);
                      }}
                    >
                      {serverAddMode === 'auto' ? 'Cancel' : '+ Add Cloud Server'}
                    </button>
                  </div>
                </div>
                {totalCap > 0 && (
                  <div className="ux-progress-track">
                    <div className="ux-progress-fill" style={{ width: `${Math.max(fleetPct, totalUsed > 0 ? 4 : 0)}%` }} />
                  </div>
                )}
              </div>

              {/* Add Server — Automatic (Default) */}
              {serverAddMode === 'auto' && (
                <div className="ux-form-card">
                  <form onSubmit={handleAutoEnrollVps} style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800 }}>Connect a New Ubuntu VPS (Once)</h4>
                        <p className="ux-subtitle">
                          Installs WireGuard automatically and registers itself here — no SSH password stored.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ux-link-btn"
                        onClick={() => setServerAddMode('manual')}
                      >
                        Enter details manually ▸
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <label className="ux-label">Server Name</label>
                        <input
                          type="text"
                          className="ux-input"
                          value={vpsAutoForm.name}
                          onChange={(e) => setVpsAutoForm((p) => ({ ...p, name: e.target.value }))}
                          placeholder="e.g. Hostinger Server 1"
                          required
                        />
                      </div>
                      <button type="submit" className="ux-btn ux-btn-primary" disabled={enrollingVps}>
                        {enrollingVps ? 'Preparing...' : 'Get Setup Script'}
                      </button>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="ux-link-btn"
                        onClick={() => setShowServerAdvanced((v) => !v)}
                      >
                        {showServerAdvanced ? '▾ Hide advanced network settings' : `▸ Advanced (Auto subnet ${vpsAutoForm.wg_subnet}, max ${vpsAutoForm.max_routers} routers)`}
                      </button>
                      {showServerAdvanced && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '10px' }}>
                          <div>
                            <label className="ux-label">WireGuard Subnet</label>
                            <input
                              type="text"
                              className="ux-input"
                              value={vpsAutoForm.wg_subnet}
                              onChange={(e) => setVpsAutoForm((p) => ({ ...p, wg_subnet: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="ux-label">Max Routers Before Auto-Overflow</label>
                            <input
                              type="number"
                              min={50}
                              max={10000}
                              className="ux-input"
                              value={vpsAutoForm.max_routers}
                              onChange={(e) => setVpsAutoForm((p) => ({ ...p, max_routers: Number(e.target.value) || 1000 }))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </form>

                  {/* Clean Toggleable Script Output */}
                  {vpsBootstrap?.bootstrap && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--ux-border)' }}>
                      <div className="ux-tabs" style={{ marginBottom: '10px' }}>
                        <button
                          type="button"
                          className={`ux-tab ${scriptTab === 'existing' ? 'active' : ''}`}
                          onClick={() => setScriptTab('existing')}
                        >
                          Existing VPS (Paste Once in SSH)
                        </button>
                        <button
                          type="button"
                          className={`ux-tab ${scriptTab === 'fresh' ? 'active' : ''}`}
                          onClick={() => setScriptTab('fresh')}
                        >
                          Brand-New VPS (Startup Script)
                        </button>
                      </div>

                      {scriptTab === 'existing' ? (
                        <div className="ux-code-wrap">
                          <div className="ux-code-top">
                            <span>Run once in your VPS terminal (zero downtime for active routers)</span>
                            <button
                              type="button"
                              className="ux-btn ux-btn-primary ux-btn-sm"
                              onClick={() => copyText(vpsBootstrap.bootstrap.one_line_command, 'VPS command')}
                            >
                              Copy Command
                            </button>
                          </div>
                          <pre className="ux-code-body">{vpsBootstrap.bootstrap.one_line_command}</pre>
                        </div>
                      ) : (
                        <div className="ux-code-wrap">
                          <div className="ux-code-top">
                            <span>Paste into Cloud-Init / Startup Script when ordering a new VPS</span>
                            <button
                              type="button"
                              className="ux-btn ux-btn-primary ux-btn-sm"
                              onClick={() => copyText(vpsBootstrap.bootstrap.cloud_init_yaml, 'Cloud-Init YAML')}
                            >
                              Copy YAML
                            </button>
                          </div>
                          <pre className="ux-code-body">{vpsBootstrap.bootstrap.cloud_init_yaml}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Add Server — Manual Entry */}
              {serverAddMode === 'manual' && (
                <form onSubmit={handleSaveManualHub} className="ux-form-card" style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800 }}>Manual Server Entry</h4>
                    <button type="button" className="ux-link-btn" onClick={() => setServerAddMode('auto')}>
                      ← Back to Automatic Setup
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                    <div>
                      <label className="ux-label">Server Name</label>
                      <input type="text" className="ux-input" value={hubForm.name} onChange={(e) => setHubForm((p) => ({ ...p, name: e.target.value }))} placeholder="Hostinger Hub 1" />
                    </div>
                    <div>
                      <label className="ux-label">Public IP</label>
                      <input type="text" className="ux-input" value={hubForm.public_ip} onChange={(e) => setHubForm((p) => ({ ...p, public_ip: e.target.value }))} placeholder="2.25.15.1" />
                    </div>
                    <div>
                      <label className="ux-label">API Secret</label>
                      <input type="password" className="ux-input" value={hubForm.api_secret} onChange={(e) => setHubForm((p) => ({ ...p, api_secret: e.target.value }))} placeholder="64-character secret" />
                    </div>
                    <div>
                      <label className="ux-label">Max Routers</label>
                      <input type="number" min={50} max={10000} className="ux-input" value={hubForm.max_routers} onChange={(e) => setHubForm((p) => ({ ...p, max_routers: Number(e.target.value) || 1000 }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="ux-btn ux-btn-primary" disabled={savingHub}>
                      {savingHub ? 'Testing & Saving...' : 'Test & Save Server'}
                    </button>
                    <button type="button" className="ux-btn ux-btn-secondary" onClick={() => setServerAddMode(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Server List */}
              {loadingHubs && hubs.length === 0 ? (
                <div className="ux-subtitle">Loading servers...</div>
              ) : hubs.length === 0 ? (
                <div className="ux-row-card" style={{ justifyContent: 'center', padding: '22px' }}>
                  <span className="ux-subtitle">No cloud servers added yet. Click <strong>+ Add Cloud Server</strong> above to connect your first VPS.</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {hubs.map((hub) => {
                    const used = hub.router_count ?? 0;
                    const cap = hub.effective_capacity ?? hub.max_routers ?? 1000;
                    const isOnline = hub.status === 'online';
                    return (
                      <div key={hub.id} className="ux-row-card">
                        <div style={{ minWidth: '200px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '14px' }}>{hub.name}</strong>
                            <span className={`ux-pill ${isOnline ? 'green' : 'amber'}`}>
                              <span className="ux-dot" />
                              {isOnline ? 'Online' : hub.status === 'pending_bootstrap' ? 'Waiting for script' : hub.status}
                            </span>
                            {hub.is_default && <span className="ux-pill blue">Default</span>}
                          </div>
                          <div className="ux-subtitle" style={{ marginTop: '4px' }}>
                            {hub.public_ip ? <code>{hub.public_ip}</code> : 'Pending IP'} •{' '}
                            <strong>{used.toLocaleString()} / {cap.toLocaleString()}</strong> routers
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="ux-btn ux-btn-success ux-btn-sm"
                            onClick={() => handleMigrateToHub(hub)}
                            disabled={migratingHubId === hub.id || !hub.public_ip || !isOnline}
                            title="Switch all routers onto this server automatically within 60 seconds"
                          >
                            {migratingHubId === hub.id ? 'Switching...' : 'Move All Routers Here'}
                          </button>
                          <button
                            type="button"
                            className="ux-btn ux-btn-secondary ux-btn-sm"
                            onClick={() => handleTestHub(hub.id)}
                            disabled={testingHubId === hub.id || !hub.public_ip}
                          >
                            {testingHubId === hub.id ? 'Testing...' : 'Check'}
                          </button>
                          <button
                            type="button"
                            className="ux-btn ux-btn-danger-ghost ux-btn-sm"
                            onClick={() => handleDeleteHub(hub)}
                          >
                            Remove
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
      )}
    </div>
  );
}
