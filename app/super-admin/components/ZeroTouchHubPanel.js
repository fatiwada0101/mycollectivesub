'use client';

import { useState, useEffect, useCallback } from 'react';

export default function ZeroTouchHubPanel({
  adminHeaders = () => ({}),
  showToast = () => {},
  locations = [],
  onRouterOnboarded = () => {},
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeView, setActiveView] = useState('onboard'); // 'onboard' | 'vps'
  const [hubs, setHubs] = useState([]);
  const [fleetSummary, setFleetSummary] = useState(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [testingHubId, setTestingHubId] = useState(null);
  const [migratingHubId, setMigratingHubId] = useState(null);
  const [savingHub, setSavingHub] = useState(false);
  const [showAddHub, setShowAddHub] = useState(false);
  const [showAutoEnrollVps, setShowAutoEnrollVps] = useState(false);
  const [enrollingVps, setEnrollingVps] = useState(false);
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

  const [onboardForm, setOnboardForm] = useState({
    router_name: '',
    vps_hub_id: '',
    location_id: '',
    dns_name: 'hotspot.mycollectivesub.net',
    router_state: 'existing', // 'existing' (safe preserve) | 'fresh' (full setup)
  });
  const [generatingBootstrap, setGeneratingBootstrap] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [checkingRouter, setCheckingRouter] = useState(false);

  const fetchHubs = useCallback(async () => {
    setLoadingHubs(true);
    try {
      const res = await fetch('/api/super-admin/vps-hubs', { headers: adminHeaders() });
      const data = await res.json();
      if (data.success) {
        setHubs(data.hubs || []);
        setFleetSummary(data.fleet_summary || null);
        setNeedsMigration(Boolean(data.needs_migration));
        const nextSubnet = data.fleet_summary?.suggested_next_subnet;
        if (nextSubnet) {
          setVpsAutoForm((prev) => ({
            ...prev,
            wg_subnet: prev.name ? prev.wg_subnet : nextSubnet,
            is_default: (data.hubs || []).length === 0,
          }));
          setHubForm((prev) => ({
            ...prev,
            wg_subnet: prev.name ? prev.wg_subnet : nextSubnet,
            is_default: (data.hubs || []).length === 0,
          }));
        }
      }
    } catch (e) {
      console.warn('VPS hubs load warning:', e.message);
    } finally {
      setLoadingHubs(false);
    }
  }, [adminHeaders]);

  useEffect(() => {
    if (expanded) fetchHubs();
  }, [expanded, fetchHubs]);

  const onlineHubs = hubs.filter((h) => h.status === 'online');

  const handleSaveHub = async (e) => {
    e.preventDefault();
    if (!hubForm.name.trim() || !hubForm.public_ip.trim() || !hubForm.api_secret.trim()) {
      showToast('Please enter Hub Name, Public IP, and API Secret', 'error');
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
        showToast(data.error || 'Could not register VPS hub', 'error');
        return;
      }
      showToast(
        data.health?.ok
          ? `✓ VPS Hub "${data.hub.name}" is online & ready — no SSH needed again!`
          : `VPS Hub "${data.hub.name}" saved (health check: ${data.health?.error || 'pending'})`,
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
      setShowAddHub(false);
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSavingHub(false);
    }
  };

  const handleAutoEnrollVps = async (e) => {
    e.preventDefault();
    if (!vpsAutoForm.name.trim()) {
      showToast('Give your VPS hub a name first (e.g. Hostinger Hub 1)', 'error');
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
        showToast(data.error || 'Could not generate VPS auto-enroll script', 'error');
        return;
      }
      setVpsBootstrap(data);
      showToast(`✓ One-time setup script ready for "${data.hub.name}"`, 'success');
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setEnrollingVps(false);
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
        showToast(`✓ VPS online (${data.health.latencyMs}ms, ${data.health.peerCount} router tunnels)`, 'success');
      } else {
        showToast(`VPS unreachable: ${data.error || 'Verify port 9443 is open'}`, 'error');
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
      !window.confirm(`Switch all active routers to "${hub.name}" (${hub.public_ip})? Routers will automatically failover to this VPS within 60 seconds with zero SSH.`)
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
        showToast(data.error || 'Migration failed', 'error');
        return;
      }
      showToast(
        `✓ Moved ${data.migrated_count}/${data.total_routers} router(s) to "${hub.name}". Routers will reconnect automatically within 60s!`,
        'success'
      );
      await fetchHubs();
      onRouterOnboarded?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setMigratingHubId(null);
    }
  };

  const handleDeleteHub = async (hub) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove VPS Hub "${hub.name}"?`)) return;
    try {
      const res = await fetch(`/api/super-admin/vps-hubs?id=${encodeURIComponent(hub.id)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed VPS hub "${hub.name}"`, 'success');
        await fetchHubs();
      } else {
        showToast(data.error || 'Delete failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleGenerateBootstrap = async (e) => {
    e.preventDefault();
    if (!onboardForm.router_name.trim()) {
      showToast('Enter a router name first (e.g. Branch 2 Router)', 'error');
      return;
    }
    setGeneratingBootstrap(true);
    setBootstrapResult(null);
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
      showToast(`✓ 1-Line Setup Command ready for "${data.router.name}"`, 'success');
      onRouterOnboarded?.();
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
        showToast(`🎉 "${bootstrapResult.router.name}" is ONLINE and ready to generate vouchers!`, 'success');
        onRouterOnboarded?.();
      } else {
        showToast('Not connected yet — make sure you pasted the 1 line in Router Terminal and waited ~10s.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCheckingRouter(false);
    }
  };

  const copyText = (text, label) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast(`✓ Copied ${label}`, 'success');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 11px',
    borderRadius: '9px',
    border: '1px solid #334155',
    background: '#0b1324',
    color: '#fff',
    fontSize: '13px',
  };

  return (
    <div
      style={{
        margin: '20px 0 8px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #0b1f3a 0%, #102a52 65%, #0c3562 100%)',
        border: '1px solid rgba(56, 189, 248, 0.38)',
        overflow: 'hidden',
        color: '#f8fafc',
      }}
    >
      {/* Header Banner */}
      <div
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          padding: '16px 20px',
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
                background: 'rgba(14, 165, 233, 0.22)',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                color: '#7dd3fc',
                fontSize: '10.5px',
                fontWeight: 800,
                padding: '2px 9px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Easy Router Onboarding • Zero SSH
            </span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
              Connect New or Existing MikroTik Routers &amp; VPS Hubs
            </h3>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: '#bae6fd' }}>
            Connect already-configured routers (preserving existing Hotspot &amp; users) or brand-new routers in seconds — no SSH needed.
          </p>
        </div>
        <button
          type="button"
          style={{
            background: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '9px 15px',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Hide Setup Hub ▲' : 'Open Easy Setup Hub ▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '14px 20px 20px', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
          {/* 3-Step Friendly Status Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            <div
              onClick={() => setActiveView('vps')}
              style={{
                cursor: 'pointer',
                background: onlineHubs.length > 0 ? 'rgba(22, 163, 74, 0.14)' : 'rgba(2, 132, 199, 0.16)',
                border: onlineHubs.length > 0 ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '11px',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: onlineHubs.length > 0 ? '#4ade80' : '#7dd3fc', textTransform: 'uppercase' }}>
                Step 1 • Cloud VPS Hub {onlineHubs.length > 0 ? '✓ Ready' : '(Do Once)'}
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '3px' }}>
                {onlineHubs.length > 0
                  ? `${onlineHubs.length} VPS hub online — zero SSH ever needed again.`
                  : 'Connect your VPS once (no SSH needed for routers after).'}
              </div>
            </div>

            <div
              onClick={() => setActiveView('onboard')}
              style={{
                cursor: 'pointer',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                borderRadius: '11px',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>
                Step 2 • Connect Any Router
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '3px' }}>
                Works 100% from web (1-line paste) OR Laptop Plug &amp; Play.
              </div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(74, 222, 128, 0.25)',
                borderRadius: '11px',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#86efac', textTransform: 'uppercase' }}>
                Step 3 • Default Voucher Rules
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '3px' }}>
                Starts on first login • Expires online &amp; offline (10s) • Auto-reconnects on Wi-Fi toggle.
              </div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveView('onboard')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: activeView === 'onboard' ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,0.28)',
                background: activeView === 'onboard' ? 'rgba(2, 132, 199, 0.35)' : 'rgba(15, 23, 42, 0.45)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              ⚡ Connect a Router ({onlineHubs.length > 0 ? 'Ready' : 'Needs Step 1'})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('vps')}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: activeView === 'vps' ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,0.28)',
                background: activeView === 'vps' ? 'rgba(2, 132, 199, 0.35)' : 'rgba(15, 23, 42, 0.45)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              🌐 VPS Hubs ({hubs.length})
            </button>
          </div>

          {needsMigration && (
            <div
              style={{
                background: 'rgba(217, 119, 6, 0.16)',
                border: '1px solid rgba(251, 191, 36, 0.5)',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '14px',
                fontSize: '12.5px',
                color: '#fef3c7',
              }}
            >
              <strong>Database Migration Needed:</strong> Run <code>supabase/migrations/20261121000001_zero_touch_vps_hubs.sql</code>.
            </div>
          )}

          {/* VIEW 1: CONNECT A ROUTER */}
          {activeView === 'onboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '14px' }}>
              {/* Option 1: 100% Web-Only (Works from Phone or Laptop Browser, No App Install) */}
              <form
                onSubmit={handleGenerateBootstrap}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Easiest • 100% Web (No App Install Needed)
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#fff' }}>
                  Connect Router via 1-Line Command
                </h4>
                <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Works from any phone or laptop browser. Generates one safe line you paste into the router&apos;s Terminal — zero VPS SSH required.
                </p>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                      1. Router Name
                    </label>
                    <input
                      type="text"
                      value={onboardForm.router_name}
                      onChange={(e) => setOnboardForm((p) => ({ ...p, router_name: e.target.value }))}
                      placeholder="e.g. Katsina Branch 2"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                      2. Is this router already configured?
                    </label>
                    <select
                      value={onboardForm.router_state}
                      onChange={(e) => setOnboardForm((p) => ({ ...p, router_state: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="existing">Already Configured — Keep Hotspot, Users &amp; DNS (Just connect to Cloud &amp; generate vouchers)</option>
                      <option value="fresh">Brand-New Router — Set up Hotspot DNS &amp; Full Cloud Profile</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                        3. VPS Hub
                      </label>
                      <select
                        value={onboardForm.vps_hub_id}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, vps_hub_id: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Auto-Select (Auto-Scale across Online Hubs)</option>
                        {hubs.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.router_count ?? 0}/{h.effective_capacity ?? h.max_routers ?? 1000} routers • {h.public_ip || 'pending'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                        4. Location (Optional)
                      </label>
                      <select
                        value={onboardForm.location_id}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, location_id: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Unassigned</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {hubs.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => { setActiveView('vps'); setShowAutoEnrollVps(true); }}
                      style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '9px', padding: '10px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    >
                      First: Connect Your VPS Hub Once →
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={generatingBootstrap}
                      style={{
                        background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '9px',
                        padding: '10px 14px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: generatingBootstrap ? 'not-allowed' : 'pointer',
                        opacity: generatingBootstrap ? 0.6 : 1,
                      }}
                    >
                      {generatingBootstrap ? 'Preparing Setup Command...' : 'Get 1-Line Setup Command'}
                    </button>
                  )}
                </div>

                {bootstrapResult?.bootstrap?.one_line_command && (
                  <div style={{ marginTop: '14px', background: '#070d1a', borderRadius: '10px', padding: '12px', border: '1px solid #0284c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                      <span style={{ fontSize: '11.5px', color: '#7dd3fc', fontWeight: 700 }}>
                        Tunnel: {bootstrapResult.vps.wg_tunnel_ip} → {bootstrapResult.vps.public_ip}:{bootstrapResult.vps.external_port}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(bootstrapResult.bootstrap.one_line_command, '1-line router command')}
                        style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Copy Line
                      </button>
                    </div>
                    <code style={{ fontSize: '11px', color: '#e2e8f0', wordBreak: 'break-all', display: 'block', marginBottom: '10px' }}>
                      {bootstrapResult.bootstrap.one_line_command}
                    </code>
                    <div style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.55, marginBottom: '10px' }}>
                      <strong>How to apply (10 seconds):</strong><br />
                      1. Connect to the router&apos;s Wi-Fi and open <code>http://192.168.88.1</code> (WebFig) or WinBox.<br />
                      2. Click <strong>Terminal</strong>, paste the line above, and press <strong>Enter</strong>.<br />
                      3. Click the button below — your router will appear <strong>Online</strong> ready to generate vouchers!
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckConnected}
                      disabled={checkingRouter}
                      style={{ width: '100%', background: 'rgba(22, 163, 74, 0.25)', color: '#86efac', border: '1px solid #22c55e', borderRadius: '8px', padding: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {checkingRouter ? 'Checking Router Connection...' : '✓ Verify Router Is Online Now'}
                    </button>
                  </div>
                )}
              </form>

              {/* Option 2: Laptop Plug & Play Connector (Zero WinBox — IP + Password Only) */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Zero WinBox • IP &amp; Password Only
                  </div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#fff' }}>
                    Laptop Plug &amp; Play Connector
                  </h4>
                  <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>
                    Don&apos;t want to open WinBox or paste any command? Connect your laptop to the router&apos;s Wi-Fi and launch the local connector — just type <code>192.168.88.1</code>, username, and password.
                  </p>
                  <div
                    style={{
                      background: '#070d1a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontFamily: 'Consolas, monospace',
                      fontSize: '12px',
                      color: '#7dd3fc',
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>npm run connector</span>
                    <button
                      type="button"
                      onClick={() => copyText('npm run connector', 'connector command')}
                      style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Copy
                    </button>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: '#94a3b8' }}>
                    Windows shortcut: double-click <code>router-connector/Launch-Router-Connector.bat</code>. Opens in your normal browser at <code>http://127.0.0.1:4782</code>.
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(22, 163, 74, 0.1)',
                    border: '1px solid rgba(74, 222, 128, 0.25)',
                    borderRadius: '9px',
                    padding: '10px 12px',
                    fontSize: '11.5px',
                    color: '#bbf7d0',
                    lineHeight: 1.65,
                  }}
                >
                  <strong style={{ color: '#fff', display: 'block', marginBottom: '2px' }}>Applied Automatically on Every Router:</strong>
                  ✓ Safe Mode preserves existing Hotspot, DNS &amp; users<br />
                  ✓ Vouchers start counting only on first login<br />
                  ✓ Strict wall-clock expiry online OR offline (10s sweep)<br />
                  ✓ Seamless Wi-Fi off/on reconnect via MAC-cookie (4w2d)<br />
                  ✓ Unlimited accounts (<code>admin</code>) never touched
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: MULTI-VPS HUBS MANAGER */}
          {activeView === 'vps' && (
            <div>
              {/* Fleet Capacity & 10,000+ Auto-Scaling Summary Banner */}
              <div
                style={{
                  background: 'rgba(14, 165, 233, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '11px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '12px', color: '#e0f2fe', lineHeight: 1.5 }}>
                  <strong>Auto-Scaling Fleet Capacity:</strong>{' '}
                  <code>{fleetSummary?.total_routers_on_hubs ?? 0}</code> /{' '}
                  <code>{(fleetSummary?.total_capacity ?? 0).toLocaleString()}</code> routers across{' '}
                  <strong>{hubs.length}</strong> VPS hub(s). Every new VPS defaults to a <code>/16</code> subnet (65,023 IPs, 10,000 ports, 1,000 routers/KVM 1) — add more hubs anytime to scale past <strong>10,000+ routers</strong> with automatic overflow.
                </div>
                {fleetSummary?.suggested_next_subnet && (
                  <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700, background: 'rgba(7,13,26,0.55)', padding: '4px 9px', borderRadius: '999px', border: '1px solid rgba(56,189,248,0.35)' }}>
                    Next Auto Subnet: {fleetSummary.suggested_next_subnet}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#cbd5e1' }}>
                  <strong>Done once per VPS:</strong> After connecting a VPS hub here, every router registers automatically with <strong>zero SSH</strong>.
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { setShowAutoEnrollVps((v) => !v); setShowAddHub(false); }}
                    style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '9px', padding: '8px 13px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    {showAutoEnrollVps ? 'Close Auto-Enroll' : '⚡ Auto-Enroll VPS (Recommended)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddHub((v) => !v); setShowAutoEnrollVps(false); }}
                    style={{ background: 'rgba(2, 132, 199, 0.35)', color: '#e0f2fe', border: '1px solid #38bdf8', borderRadius: '9px', padding: '8px 13px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    {showAddHub ? 'Cancel' : '+ Manual Entry'}
                  </button>
                </div>
              </div>

              {showAutoEnrollVps && (
                <form
                  onSubmit={handleAutoEnrollVps}
                  style={{
                    background: 'rgba(15, 23, 42, 0.72)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    borderRadius: '12px',
                    padding: '14px',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#7dd3fc', fontWeight: 700, marginBottom: '8px' }}>
                    One-Time VPS Setup — No SSH password stored! Just run the generated script once (or paste Cloud-Init when buying a brand-new VPS). The VPS self-registers its IP, WireGuard key, and secret automatically.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>VPS Hub Name</label>
                      <input
                        type="text"
                        value={vpsAutoForm.name}
                        onChange={(e) => setVpsAutoForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Hostinger Hub 1"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>WireGuard Subnet (Auto /16)</label>
                      <input
                        type="text"
                        value={vpsAutoForm.wg_subnet}
                        onChange={(e) => setVpsAutoForm((p) => ({ ...p, wg_subnet: e.target.value }))}
                        placeholder="10.100.0.0/16"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Max Routers (Auto-Overflow Cap)</label>
                      <input
                        type="number"
                        min={50}
                        max={10000}
                        value={vpsAutoForm.max_routers}
                        onChange={(e) => setVpsAutoForm((p) => ({ ...p, max_routers: Number(e.target.value) || 1000 }))}
                        style={inputStyle}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={enrollingVps}
                      style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '9px', padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    >
                      {enrollingVps ? 'Generating...' : 'Generate One-Time VPS Script'}
                    </button>
                  </div>

                  {vpsBootstrap?.bootstrap && (
                    <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                      <div style={{ background: '#070d1a', borderRadius: '8px', padding: '10px', border: '1px solid #0284c7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700 }}>
                            For a Brand-New VPS Order — Paste into &ldquo;Startup Script / Cloud-Init&rdquo; (Zero SSH Ever!)
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(vpsBootstrap.bootstrap.cloud_init_yaml, 'Cloud-Init YAML')}
                            style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Copy YAML
                          </button>
                        </div>
                        <pre style={{ margin: 0, fontSize: '11px', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                          {vpsBootstrap.bootstrap.cloud_init_yaml}
                        </pre>
                      </div>

                      <div style={{ background: '#070d1a', borderRadius: '8px', padding: '10px', border: '1px solid rgba(148,163,184,0.35)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#bae6fd', fontWeight: 700 }}>
                            For Your Existing Ubuntu VPS — Paste Once, Then Never SSH Again (Zero Downtime!)
                          </span>
                          <button
                            type="button"
                            onClick={() => copyText(vpsBootstrap.bootstrap.one_line_command, '1-line VPS installer')}
                            style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Copy Command
                          </button>
                        </div>
                        <code style={{ fontSize: '11px', color: '#e2e8f0', wordBreak: 'break-all', display: 'block' }}>
                          {vpsBootstrap.bootstrap.one_line_command}
                        </code>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {showAddHub && (
                <form
                  onSubmit={handleSaveHub}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '12px',
                    padding: '14px',
                    marginBottom: '14px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Hub Name</label>
                    <input type="text" value={hubForm.name} onChange={(e) => setHubForm((p) => ({ ...p, name: e.target.value }))} placeholder="Hostinger Hub 1" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>VPS Public IP</label>
                    <input type="text" value={hubForm.public_ip} onChange={(e) => setHubForm((p) => ({ ...p, public_ip: e.target.value }))} placeholder="2.25.15.1" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Provisioner URL</label>
                    <input type="text" value={hubForm.provisioner_url} onChange={(e) => setHubForm((p) => ({ ...p, provisioner_url: e.target.value }))} placeholder="https://2.25.15.1:9443" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>API Secret</label>
                    <input type="password" value={hubForm.api_secret} onChange={(e) => setHubForm((p) => ({ ...p, api_secret: e.target.value }))} placeholder="Paste 64-char secret" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>WireGuard Subnet (/16 = 65k IPs)</label>
                    <input type="text" value={hubForm.wg_subnet} onChange={(e) => setHubForm((p) => ({ ...p, wg_subnet: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Max Routers Cap</label>
                    <input type="number" min={50} max={10000} value={hubForm.max_routers} onChange={(e) => setHubForm((p) => ({ ...p, max_routers: Number(e.target.value) || 1000 }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="submit" disabled={savingHub} style={{ width: '100%', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '9px', padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                      {savingHub ? 'Testing & Saving...' : 'Test & Save VPS Hub'}
                    </button>
                  </div>
                </form>
              )}

              {loadingHubs ? (
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>Loading VPS hubs...</div>
              ) : hubs.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#cbd5e1', padding: '14px', background: 'rgba(15,23,42,0.45)', borderRadius: '10px' }}>
                  No VPS hubs connected yet. Click <strong>⚡ Auto-Enroll VPS (Recommended)</strong> above to connect your existing VPS once (or a brand-new VPS with zero SSH).
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {hubs.map((hub) => (
                    <div
                      key={hub.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                          {hub.name} {hub.is_default && <span style={{ fontSize: '10.5px', color: '#38bdf8' }}>★ Default</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                          IP: <code>{hub.public_ip || 'waiting for VPS callback'}</code> • Subnet: <code>{hub.wg_subnet}</code> • Ports: <code>{hub.port_range_start}-{hub.port_range_end}</code> • Capacity:{' '}
                          <strong style={{ color: hub.is_full ? '#f87171' : '#7dd3fc' }}>
                            {hub.router_count ?? 0} / {(hub.effective_capacity ?? hub.max_routers ?? 1000).toLocaleString()} routers
                          </strong>{' '}
                          • Status:{' '}
                          <strong style={{ color: hub.status === 'online' ? '#4ade80' : '#fbbf24' }}>{hub.status}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleMigrateToHub(hub)}
                          disabled={migratingHubId === hub.id || !hub.public_ip || hub.status !== 'online'}
                          style={{ background: 'rgba(22, 163, 74, 0.22)', color: '#86efac', border: '1px solid rgba(74, 222, 128, 0.45)', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: !hub.public_ip || hub.status !== 'online' ? 0.45 : 1 }}
                        >
                          {migratingHubId === hub.id ? 'Switching...' : 'Move All Routers Here'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTestHub(hub.id)}
                          disabled={testingHubId === hub.id || !hub.public_ip}
                          style={{ background: 'rgba(2, 132, 199, 0.35)', color: '#e0f2fe', border: '1px solid #38bdf8', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: !hub.public_ip ? 0.5 : 1 }}
                        >
                          {testingHubId === hub.id ? 'Testing...' : 'Test & Sync Key'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHub(hub)}
                          style={{ background: 'rgba(220, 38, 38, 0.2)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
