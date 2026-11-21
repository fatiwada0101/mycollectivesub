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
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [testingHubId, setTestingHubId] = useState(null);
  const [savingHub, setSavingHub] = useState(false);
  const [showAddHub, setShowAddHub] = useState(false);
  const [showAutoEnrollVps, setShowAutoEnrollVps] = useState(false);
  const [enrollingVps, setEnrollingVps] = useState(false);
  const [vpsBootstrap, setVpsBootstrap] = useState(null);
  const [vpsAutoForm, setVpsAutoForm] = useState({
    name: '',
    wg_subnet: '10.100.0.0/24',
    is_default: true,
  });

  const [hubForm, setHubForm] = useState({
    name: '',
    public_ip: '',
    provisioner_url: '',
    api_secret: '',
    wg_subnet: '10.100.0.0/24',
    port_range_start: 8443,
    port_range_end: 8999,
    is_default: true,
  });

  const [onboardForm, setOnboardForm] = useState({
    router_name: '',
    vps_hub_id: '',
    location_id: '',
    dns_name: 'hotspot.mycollectivesub.net',
  });
  const [generatingBootstrap, setGeneratingBootstrap] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);

  const fetchHubs = useCallback(async () => {
    setLoadingHubs(true);
    try {
      const res = await fetch('/api/super-admin/vps-hubs', { headers: adminHeaders() });
      const data = await res.json();
      if (data.success) {
        setHubs(data.hubs || []);
        setNeedsMigration(Boolean(data.needs_migration));
        if ((data.hubs || []).length > 0 && !onboardForm.vps_hub_id) {
          const def = data.hubs.find((h) => h.is_default) || data.hubs[0];
          setOnboardForm((prev) => ({ ...prev, vps_hub_id: def.id }));
        }
      }
    } catch (e) {
      console.warn('VPS hubs load warning:', e.message);
    } finally {
      setLoadingHubs(false);
    }
  }, [adminHeaders, onboardForm.vps_hub_id]);

  useEffect(() => {
    if (expanded) fetchHubs();
  }, [expanded, fetchHubs]);

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
          ? `✓ VPS Hub "${data.hub.name}" connected & WireGuard key synced!`
          : `VPS Hub "${data.hub.name}" saved (health check: ${data.health?.error || 'pending'})`,
        data.health?.ok ? 'success' : 'info'
      );
      setHubForm({
        name: '',
        public_ip: '',
        provisioner_url: '',
        api_secret: '',
        wg_subnet: '10.100.0.0/24',
        port_range_start: 8443,
        port_range_end: 8999,
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
      showToast('Enter a name for the new VPS hub', 'error');
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
      showToast(`✓ Cloud-Init & 1-Line installer generated for "${data.hub.name}"`, 'success');
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
        showToast(`✓ VPS online (${data.health.latencyMs}ms, ${data.health.peerCount} peers)`, 'success');
      } else {
        showToast(`VPS unreachable: ${data.error || 'Check port 9443 & API secret'}`, 'error');
      }
      await fetchHubs();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTestingHubId(null);
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
      showToast('Enter a router name first', 'error');
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
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Could not generate zero-touch bootstrap', 'error');
        return;
      }
      setBootstrapResult(data);
      showToast(`✓ Zero-touch command ready for ${data.router.name} (${data.vps.public_ip}:${data.vps.external_port})`, 'success');
      onRouterOnboarded?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGeneratingBootstrap(false);
    }
  };

  const copyText = (text, label) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast(`Copied ${label} to clipboard!`, 'success');
    }
  };

  return (
    <div
      style={{
        margin: '20px 0 8px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #0b1f3a 0%, #102a52 65%, #0c3562 100%)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
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
                padding: '2px 8px',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Zero-SSH • Plug &amp; Play
            </span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
              Zero-Touch Router Onboarding &amp; Multi-VPS Hubs
            </h3>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: '#bae6fd' }}>
            Auto-register MikroTik routers on 1 or multiple VPS hubs with zero SSH. Strict First-Login Wall-Clock Expiry v3 (online &amp; offline) + MAC-Cookie Auto-Reconnect (4w2d) applied by default.
          </p>
        </div>
        <button
          type="button"
          style={{
            background: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Hide Panel ▲' : 'Open Zero-Touch Hub ▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '8px', margin: '14px 0 16px', flexWrap: 'wrap' }}>
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
              ⚡ Onboard New Router (Zero SSH)
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
              🌐 Multi-VPS Hubs ({hubs.length})
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
              <strong>One-Time Database Setup Required:</strong> Run{' '}
              <code>supabase/migrations/20261121000001_zero_touch_vps_hubs.sql</code> in Supabase SQL Editor to enable the <code>vps_hubs</code> table and atomic tunnel slot allocator.
            </div>
          )}

          {/* VIEW 1: ZERO-TOUCH ROUTER ONBOARDING */}
          {activeView === 'onboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
              {/* Option A: Mikroticket-Style Local Plug & Play Connector */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Recommended • Mikroticket-Style (IP + Password Only)
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', color: '#fff' }}>
                  Local Plug &amp; Play Router Connector
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Connect your laptop to the new MikroTik router&apos;s Wi-Fi/LAN and launch the Local Connector. Type only the local IP (<code>192.168.88.1</code>), username, and password — zero WinBox and zero VPS SSH required.
                </p>
                <div
                  style={{
                    background: '#070d1a',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '12px',
                    color: '#7dd3fc',
                    marginBottom: '10px',
                  }}
                >
                  npm run connector<br />
                  <span style={{ color: '#94a3b8' }}># or double-click router-connector/Launch-Router-Connector.bat</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#86efac', lineHeight: 1.6 }}>
                  ✓ Auto-enables HTTPS REST &amp; WireGuard on factory routers (port 8728)<br />
                  ✓ Auto-registers WireGuard peer &amp; port on selected VPS Hub<br />
                  ✓ Defaults Strict First-Login Expiry v3 (online &amp; offline, 10s sweep)<br />
                  ✓ Defaults MAC-Cookie Auto-Reconnect (4w2d) on all profiles
                </div>
              </div>

              {/* Option B: 1-Line Cloud Bootstrap */}
              <form
                onSubmit={handleGenerateBootstrap}
                style={{
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Web-Only Alternative • 1-Line Terminal Fetch
                </div>
                <h4 style={{ margin: '0 0 10px', fontSize: '14.5px', color: '#fff' }}>
                  Generate Zero-SSH Bootstrap Command
                </h4>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Router Name</label>
                    <input
                      type="text"
                      value={onboardForm.router_name}
                      onChange={(e) => setOnboardForm((p) => ({ ...p, router_name: e.target.value }))}
                      placeholder="e.g. Katsina Branch 2"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>VPS Hub</label>
                      <select
                        value={onboardForm.vps_hub_id}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, vps_hub_id: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '12.5px' }}
                      >
                        <option value="">Default Active Hub</option>
                        {hubs.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.public_ip})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Location</label>
                      <select
                        value={onboardForm.location_id}
                        onChange={(e) => setOnboardForm((p) => ({ ...p, location_id: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '12.5px' }}
                      >
                        <option value="">Unassigned</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={generatingBootstrap || hubs.length === 0}
                    style={{
                      background: '#0284c7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '9px',
                      padding: '9px 14px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: generatingBootstrap || hubs.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: generatingBootstrap || hubs.length === 0 ? 0.55 : 1,
                    }}
                  >
                    {generatingBootstrap ? 'Allocating Slot & Generating...' : 'Generate 1-Line Bootstrap Command'}
                  </button>
                </div>

                {bootstrapResult?.bootstrap?.one_line_command && (
                  <div style={{ marginTop: '12px', background: '#070d1a', borderRadius: '8px', padding: '10px', border: '1px solid #0284c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700 }}>
                        Assigned {bootstrapResult.vps.wg_tunnel_ip} → {bootstrapResult.vps.public_ip}:{bootstrapResult.vps.external_port} (expires in 15m)
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(bootstrapResult.bootstrap.one_line_command, '1-line command')}
                        style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Copy
                      </button>
                    </div>
                    <code style={{ fontSize: '11px', color: '#e2e8f0', wordBreak: 'break-all', display: 'block' }}>
                      {bootstrapResult.bootstrap.one_line_command}
                    </code>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* VIEW 2: MULTI-VPS HUBS MANAGER */}
          {activeView === 'vps' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#cbd5e1' }}>
                  Auto-enroll any new Ubuntu VPS with Cloud-Init (zero SSH) or connect an existing VPS Hub.
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { setShowAutoEnrollVps((v) => !v); setShowAddHub(false); }}
                    style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '9px', padding: '7px 13px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    {showAutoEnrollVps ? 'Close Cloud-Init' : '⚡ Auto-Enroll VPS (Zero SSH)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddHub((v) => !v); setShowAutoEnrollVps(false); }}
                    style={{ background: 'rgba(2, 132, 199, 0.35)', color: '#e0f2fe', border: '1px solid #38bdf8', borderRadius: '9px', padding: '7px 13px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    {showAddHub ? 'Cancel' : '+ Manual VPS Entry'}
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
                    Zero-SSH VPS Auto-Enrollment — paste Cloud-Init YAML when ordering a brand-new VPS (or run 1-line curl once on an existing VPS). The VPS self-registers its IP, WireGuard Key, and API Secret automatically!
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>New VPS Hub Name</label>
                      <input
                        type="text"
                        value={vpsAutoForm.name}
                        onChange={(e) => setVpsAutoForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Hostinger Hub 2"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>WireGuard Subnet</label>
                      <input
                        type="text"
                        value={vpsAutoForm.wg_subnet}
                        onChange={(e) => setVpsAutoForm((p) => ({ ...p, wg_subnet: e.target.value }))}
                        placeholder="10.100.0.0/24"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={enrollingVps}
                      style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '9px', padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    >
                      {enrollingVps ? 'Generating...' : 'Generate Cloud-Init & 1-Line Installer'}
                    </button>
                  </div>

                  {vpsBootstrap?.bootstrap && (
                    <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                      <div style={{ background: '#070d1a', borderRadius: '8px', padding: '10px', border: '1px solid #0284c7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 700 }}>
                            Option 1 — Cloud-Init User Data (Brand-New VPS Order: ZERO SSH)
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
                            Option 2 — 1-Line Auto-Register Command (Existing Ubuntu VPS)
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
                    <input
                      type="text"
                      value={hubForm.name}
                      onChange={(e) => setHubForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Hostinger Hub 1"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>VPS Public IP</label>
                    <input
                      type="text"
                      value={hubForm.public_ip}
                      onChange={(e) => setHubForm((p) => ({ ...p, public_ip: e.target.value }))}
                      placeholder="2.25.15.1"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>Provisioner URL</label>
                    <input
                      type="text"
                      value={hubForm.provisioner_url}
                      onChange={(e) => setHubForm((p) => ({ ...p, provisioner_url: e.target.value }))}
                      placeholder="https://2.25.15.1:9443"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>API Secret (from install.sh)</label>
                    <input
                      type="password"
                      value={hubForm.api_secret}
                      onChange={(e) => setHubForm((p) => ({ ...p, api_secret: e.target.value }))}
                      placeholder="Paste 64-char secret"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px' }}>WireGuard Subnet</label>
                    <input
                      type="text"
                      value={hubForm.wg_subnet}
                      onChange={(e) => setHubForm((p) => ({ ...p, wg_subnet: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #334155', background: '#0b1324', color: '#fff', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={savingHub}
                      style={{ width: '100%', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '9px', padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                    >
                      {savingHub ? 'Testing & Saving...' : 'Test & Save VPS Hub'}
                    </button>
                  </div>
                </form>
              )}

              {loadingHubs ? (
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>Loading VPS hubs...</div>
              ) : hubs.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', padding: '12px', background: 'rgba(15,23,42,0.45)', borderRadius: '10px' }}>
                  No VPS hubs registered yet. Click <strong>+ Register VPS Hub</strong> after running <code>vps-provisioner/install.sh</code> once on your VPS.
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
                          IP: <code>{hub.public_ip}</code> • Subnet: <code>{hub.wg_subnet}</code> • Ports: <code>{hub.port_range_start}-{hub.port_range_end}</code> • Status:{' '}
                          <strong style={{ color: hub.status === 'online' ? '#4ade80' : '#fbbf24' }}>{hub.status}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleTestHub(hub.id)}
                          disabled={testingHubId === hub.id}
                          style={{ background: 'rgba(2, 132, 199, 0.35)', color: '#e0f2fe', border: '1px solid #38bdf8', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
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
