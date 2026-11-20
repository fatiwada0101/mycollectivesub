'use client';

import { useState, useCallback, useEffect } from 'react';

// ─── GitBook-Style Reusable copy-to-clipboard button ──────────────
function CopyBlock({ code, label, language = 'routeros' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div style={{
      marginBottom: 18,
      borderRadius: 10,
      overflow: 'hidden',
      border: '1px solid #1E293B',
      background: '#030712',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
    }}>
      {/* GitBook Code Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: '#0F172A',
        borderBottom: '1px solid #1E293B',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          </div>
          {label && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.2px' }}>
              {label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11,
            color: '#38BDF8',
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            fontWeight: 700,
            textTransform: 'uppercase',
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '3px 8px',
            borderRadius: 5,
            border: '1px solid rgba(56, 189, 248, 0.25)',
          }}>
            {language}
          </span>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#10B981' : '#1E293B',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 700,
              padding: '5px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Code Text Area */}
      <pre
        style={{
          padding: '16px 20px',
          fontSize: 12.5,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          color: '#F8FAFC',
          lineHeight: 1.65,
          overflowX: 'auto',
          maxHeight: 450,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#030712',
        }}
      >
        {code}
      </pre>
    </div>
  );
}

// ─── GitBook-Style Step number badge ──────────────────────────────
function StepBadge({ number, color = '#2563EB' }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: '#2563EB',
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: 900,
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
    }}>
      {number}
    </span>
  );
}

// ─── GitBook-Style Collapsible section ───────────────────────────
function CollapsibleSection({ title, icon, subtitle, color = '#F59E0B', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        marginBottom: 20,
        background: '#0F172A',
        border: '1px solid #1E293B',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: '#131C31',
          borderBottom: open ? '1px solid #1E293B' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.2px' }}>{title}</h3>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8' }}>{subtitle}</p>}
          </div>
        </div>
        <span style={{
          fontSize: 14,
          color: '#94A3B8',
          fontWeight: 700,
          transition: 'transform 0.2s ease',
          transform: open ? 'rotate(180deg)' : 'none',
        }}>
          ▼
        </span>
      </div>
      {open && (
        <div style={{ padding: '22px 24px', background: '#0B0F19', color: '#E2E8F0', fontSize: 14, lineHeight: 1.75 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── GitBook-Style Callout Block ──────────────────────────────────
function GitbookCallout({ type = 'info', title, children }) {
  const configs = {
    info: { border: '#38BDF8', bg: '#0F1E36', titleColor: '#38BDF8', icon: 'ℹ️' },
    warning: { border: '#F59E0B', bg: '#1E170A', titleColor: '#FBBF24', icon: '⚠️' },
    success: { border: '#10B981', bg: '#081D15', titleColor: '#34D399', icon: '✅' },
    danger: { border: '#EF4444', bg: '#1F1113', titleColor: '#F87171', icon: '⛔' },
    tip: { border: '#A78BFA', bg: '#19122E', titleColor: '#C4B5FD', icon: '💡' },
  };
  const c = configs[type] || configs.info;

  return (
    <div style={{
      borderLeft: `4px solid ${c.border}`,
      background: c.bg,
      borderRadius: '0 8px 8px 0',
      padding: '14px 18px',
      marginBottom: 16,
      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      borderRight: '1px solid rgba(255, 255, 255, 0.05)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    }}>
      {title && (
        <strong style={{ color: c.titleColor, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span>{c.icon}</span> {title}
        </strong>
      )}
      <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function SetupDocsTab({
  routersList = [],
  selectedRouterId = '',
  pollingConfig = {},
  onNavigateTab = null,
}) {
  const [activeGuide, setActiveGuide] = useState('overview');

  const isPrivateHost = (ip) =>
    !ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip.trim());

  const activeRouter = routersList.find(r => r.id === selectedRouterId) || routersList[0] || null;
  const inferredVpsHost = !isPrivateHost(activeRouter?.ip_address)
    ? activeRouter.ip_address.trim()
    : '2.25.15.1';
  const inferredApiUser =
    activeRouter?.username && activeRouter.username !== 'admin'
      ? activeRouter.username
      : 'mycollectivesub';

  const [vpsHost, setVpsHost] = useState(inferredVpsHost);
  const [vpnSubnet, setVpnSubnet] = useState('10.100.0');
  const [apiUsername, setApiUsername] = useState(inferredApiUser);
  const [apiPassword, setApiPassword] = useState('');
  const [showApiPassword, setShowApiPassword] = useState(true);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 14; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setApiPassword(res);
  };

  const activeSecret = activeRouter?.polling_secret || 'YOUR_ROUTER_SECRET';
  const activeRouterName = activeRouter?.name || 'My Collective Sub Router';
  const appHostname = typeof window !== 'undefined' ? window.location.host : 'www.mycollectivesub.com.ng';
  const appProtocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';

  const cleanSubnet = (vpnSubnet || '10.100.0').replace(/\.$/, '');
  const vpsHubIp = `${cleanSubnet}.1`;

  // Sequential router numbering starting at Router 1 (10.100.0.2, port 8443)
  const nextRouterNumber = routersList.length + 1;
  const defaultNextVpnIp = `${cleanSubnet}.${nextRouterNumber + 1}`;
  const defaultNextVpsPort = String(8442 + nextRouterNumber);

  // New Router Interactive Generator State (100% reactive & synchronized)
  const [newRouterName, setNewRouterName] = useState(`Katsina Hub ${nextRouterNumber}`);
  const [newRouterVpnIp, setNewRouterVpnIp] = useState(defaultNextVpnIp);
  const [newRouterVpsPort, setNewRouterVpsPort] = useState(defaultNextVpsPort);
  const [newRouterPublicKey, setNewRouterPublicKey] = useState('');
  const [vpsPublicKey, setVpsPublicKey] = useState('');
  const [savedPresets, setSavedPresets] = useState([]);
  const [activePresetId, setActivePresetId] = useState('custom');
  const [presetFeedback, setPresetFeedback] = useState('');

  // ── Auto-load persisted router configuration & saved presets on mount ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // 1. Load saved presets list
      const savedRaw = localStorage.getItem('an_router_deployment_presets');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed)) setSavedPresets(parsed);
      }
      // 2. Load current working draft
      const draftRaw = localStorage.getItem('an_current_new_router_config');
      if (draftRaw) {
        const d = JSON.parse(draftRaw);
        if (d.name) setNewRouterName(d.name);
        if (d.vpsHost) setVpsHost(d.vpsHost);
        if (d.vpnSubnet) setVpnSubnet(d.vpnSubnet);
        if (d.vpnIp) setNewRouterVpnIp(d.vpnIp);
        if (d.vpsPort) setNewRouterVpsPort(d.vpsPort);
        if (d.apiUsername) setApiUsername(d.apiUsername);
        if (d.password) setApiPassword(d.password);
        if (d.routerPublicKey) setNewRouterPublicKey(d.routerPublicKey);
        if (d.vpsPublicKey) setVpsPublicKey(d.vpsPublicKey);
      }
    } catch (e) {
      console.warn('Error restoring router config from localStorage:', e);
    }
  }, []);

  // ── Auto-save current working configuration to localStorage on change ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const config = {
        name: newRouterName,
        vpsHost,
        vpnSubnet: cleanSubnet,
        vpnIp: newRouterVpnIp,
        vpsPort: newRouterVpsPort,
        apiUsername,
        password: apiPassword,
        routerPublicKey: newRouterPublicKey,
        vpsPublicKey: vpsPublicKey,
        updatedAt: Date.now(),
      };
      localStorage.setItem('an_current_new_router_config', JSON.stringify(config));
    } catch (e) {}
  }, [newRouterName, vpsHost, cleanSubnet, newRouterVpnIp, newRouterVpsPort, apiUsername, apiPassword, newRouterPublicKey, vpsPublicKey]);

  // Save current configuration as a permanent named preset (with completion validation)
  const isRouterConfigFinished = Boolean(
    newRouterPublicKey &&
    newRouterPublicKey.trim().length === 44 &&
    !newRouterPublicKey.includes('<')
  );

  const handleSaveAsPreset = () => {
    const name = (newRouterName || `Katsina Hub ${nextRouterNumber}`).trim();
    if (!isRouterConfigFinished) {
      const confirmSave = confirm(
        '⚠️ Router Public Key (44 characters) has not been pasted yet from Phase 1.\n\nWould you still like to save this as an in-progress preset?'
      );
      if (!confirmSave) return;
    }

    const newPreset = {
      id: 'preset_' + Date.now(),
      name,
      vpsHost: (vpsHost || '2.25.15.1').trim(),
      vpnSubnet: cleanSubnet,
      vpnIp: newRouterVpnIp || defaultNextVpnIp,
      vpsPort: newRouterVpsPort || defaultNextVpsPort,
      apiUsername: (apiUsername || 'mycollectivesub').trim(),
      password: apiPassword || '',
      routerPublicKey: newRouterPublicKey || '',
      vpsPublicKey: vpsPublicKey || '',
      isCompleted: isRouterConfigFinished,
      createdAt: new Date().toISOString(),
    };

    const updated = [...savedPresets.filter(p => p.name !== name), newPreset];
    setSavedPresets(updated);
    setActivePresetId(newPreset.id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('an_router_deployment_presets', JSON.stringify(updated));
    }

    if (isRouterConfigFinished) {
      setPresetFeedback(`✅ Completed preset "${name}" saved! Ready for 1-click import in Locations & Fleet.`);
    } else {
      setPresetFeedback(`📝 Saved in-progress draft "${name}". Paste the 44-char key from Phase 1 to finalize.`);
    }
    setTimeout(() => setPresetFeedback(''), 5000);
  };

  // Load a saved preset into the generator
  const handleSelectPreset = (presetId) => {
    setActivePresetId(presetId);
    if (presetId === 'custom') return;
    const p = savedPresets.find(item => item.id === presetId);
    if (p) {
      if (p.name) setNewRouterName(p.name);
      if (p.vpsHost) setVpsHost(p.vpsHost);
      if (p.vpnSubnet) setVpnSubnet(p.vpnSubnet);
      if (p.vpnIp) setNewRouterVpnIp(p.vpnIp);
      if (p.vpsPort) setNewRouterVpsPort(p.vpsPort);
      if (p.apiUsername) setApiUsername(p.apiUsername);
      if (p.password) setApiPassword(p.password);
      if (p.routerPublicKey !== undefined) setNewRouterPublicKey(p.routerPublicKey);
      if (p.vpsPublicKey !== undefined) setVpsPublicKey(p.vpsPublicKey);
      setPresetFeedback(`Loaded preset "${p.name}" (Port ${p.vpsPort})`);
      setTimeout(() => setPresetFeedback(''), 3000);
    }
  };

  // Delete a saved preset
  const handleDeletePreset = (presetId) => {
    const updated = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(updated);
    setActivePresetId('custom');
    if (typeof window !== 'undefined') {
      localStorage.setItem('an_router_deployment_presets', JSON.stringify(updated));
    }
    setPresetFeedback('Preset removed.');
    setTimeout(() => setPresetFeedback(''), 3000);
  };

  // Keep defaults updated when routersList loads
  useEffect(() => {
    if (routersList.length > 0) {
      const nextNum = routersList.length + 1;
      setNewRouterName(prev => (!prev || /^((Branch Router|Katsina Hub) \d+)$/.test(prev)) ? `Katsina Hub ${nextNum}` : prev);
      setNewRouterVpnIp(prev => (!prev || prev.startsWith(`${cleanSubnet}.`)) ? `${cleanSubnet}.${nextNum + 1}` : prev);
      setNewRouterVpsPort(prev => (!prev || (Number(prev) >= 8443 && Number(prev) <= 8499)) ? String(8442 + nextNum) : prev);
      if (!isPrivateHost(activeRouter?.ip_address)) {
        setVpsHost(prev => prev === '2.25.15.1' ? activeRouter.ip_address.trim() : prev);
      }
    }
  }, [routersList.length, cleanSubnet, activeRouter?.ip_address]);

  const nextVpnIp = newRouterVpnIp || defaultNextVpnIp;
  const nextVpsPort = newRouterVpsPort || defaultNextVpsPort;
  const cleanVpsHost = (vpsHost || '2.25.15.1').trim();
  const apiUser = (apiUsername || 'mycollectivesub').trim();
  const pw = apiPassword || 'YOUR_STRONG_API_PASSWORD';
  const heartbeatUrl = `${appProtocol}//${appHostname}/api/mikrotik/heartbeat?secret=${activeSecret}&preserve_ip=1`;

  // ── Guide navigation pills ────────────────────────────
  const guides = [
    { id: 'overview', label: '📖 Overview', color: '#60A5FA' },
    { id: 'master-config', label: '⚡ Master 1-Shot Config', color: '#F59E0B' },
    { id: 'quick-recovery', label: '🔧 Quick Recovery (Already Online)', color: '#A78BFA' },
    { id: 'vps-setup', label: '🖥️ VPS & WireGuard', color: '#34A853' },
    { id: 'mikrotik-setup', label: '📡 MikroTik REST API', color: '#C084FC' },
    { id: 'watchdog', label: '🔋 Power-Cut Watchdog', color: '#EF4444' },
    { id: 'add-router', label: '➕ Add New Router', color: '#06B6D4' },
  ];

  // ═══════════════════════════════════════════════════════
  // MASTER 1-SHOT CONFIG SCRIPT (Ubuntu 26.04 + RouterOS 7.20 verified)
  // ═══════════════════════════════════════════════════════
  const masterConfigScript = `# ═══════════════════════════════════════════════════════════
# MY COLLECTIVE SUB — MASTER 1-SHOT MikroTik Configuration
# ═══════════════════════════════════════════════════════════
# Paste this ENTIRE block into WinBox → Terminal. Safe to re-run.
# Requires the wg-vps WireGuard tunnel (Phases 1–3) to be up.
# Includes: Firewall TCP 443 over wg-vps, SSL cert, API user,
# Cloud DDNS, direct-IP NTP, WireGuard keepalive, and watchdog (${vpsHubIp}).
# ═══════════════════════════════════════════════════════════

# ─── 1. Allow REST API (TCP 443) over WireGuard in the router firewall ───
# Without this, ping works but REST API calls "time out".
:do { /ip firewall filter remove [find comment="Allow REST API over WireGuard"] } on-error={}
:do {
  /ip firewall filter add chain=input in-interface=wg-vps protocol=tcp dst-port=443 action=accept place-before=0 comment="Allow REST API over WireGuard"
} on-error={
  /ip firewall filter add chain=input in-interface=wg-vps protocol=tcp dst-port=443 action=accept comment="Allow REST API over WireGuard"
}

# ─── 2. Self-signed SSL certificate for HTTPS REST API ───
# Without a certificate assigned to www-ssl, you get "sslv3 alert handshake failure".
:if ([:len [/certificate find name=local-cert]] = 0) do={
  /certificate add name=local-cert common-name=router days-valid=3650 key-size=2048
  /certificate sign local-cert
}
/ip service set www-ssl certificate=local-cert disabled=no port=443
:do { /ip service set api-ssl certificate=local-cert disabled=no } on-error={}

# ─── 3. Dedicated REST API user ───
:if ([:len [/user find name="${apiUser}"]] = 0) do={
  /user add name="${apiUser}" group=full password="${pw}"
} else={
  /user set [find name="${apiUser}"] password="${pw}"
}

# ─── 4. Enable MikroTik Cloud DDNS & direct-IP NTP (fixes 1970 clock after power loss) ───
/ip cloud set ddns-enabled=yes update-time=yes
:do { /system ntp client set enabled=yes servers=216.239.35.0,1.1.1.1 } on-error={
  :do { /system ntp client set enabled=yes primary-ntp=216.239.35.0 secondary-ntp=1.1.1.1 } on-error={}
}

# ─── 5. WireGuard persistent keepalive (prevents ISP CGNAT timeout) ───
:do { /interface wireguard peers set [find interface=wg-vps] persistent-keepalive=25s } on-error={}

# ─── 6. Auto-Recovery Watchdog (pings hub ${vpsHubIp}) ───
:do { /system scheduler remove [find name="an-power-watchdog"] } on-error={}
:do { /system script remove [find name="an-watchdog-script"] } on-error={}
/system script add name="an-watchdog-script" policy=read,write,test source={
  :local vpsIp "${vpsHubIp}"
  :local pingCount [/ping $vpsIp count=2]
  :if ($pingCount = 0) do={
    :log warning "Watchdog: WireGuard hub unreachable. Cycling wg-vps..."
    :do {
      /interface wireguard disable [find name="wg-vps"]
      :delay 2s
      /interface wireguard enable [find name="wg-vps"]
    } on-error={}
    :do { /ip cloud force-update } on-error={}
  }
  :do {
    /tool fetch url="${heartbeatUrl}" mode=https check-certificate=no keep-result=no
  } on-error={}
}
/system scheduler add name="an-power-watchdog" start-time=startup interval=60s on-event="/system script run an-watchdog-script" policy=read,write,test

:log info "=== My Collective Sub: Master config applied ==="
:put ""
:put "SUCCESS! Router is now configured for:"
:put "  - Firewall TCP 443 allowed over wg-vps"
:put "  - REST API on HTTPS 443 (SSL cert: local-cert)"
:put "  - API user: ${apiUser}"
:put "  - Cloud DDNS + direct-IP NTP"
:put "  - WireGuard keepalive 25s + watchdog (hub ${vpsHubIp})"
:put ""
:put "Next: Locations & Fleet -> Add Router (${cleanVpsHost}:${nextVpsPort})"`;

  // ═══════════════════════════════════════════════════════
  // VPS SETUP SCRIPTS
  // ═══════════════════════════════════════════════════════
  const vpsInstallScript = `# ═══════════════════════════════════════════════════════════
# VPS WireGuard Hub Setup — Ubuntu 22.04 / 24.04 / 26.04 LTS
# SSH in first:  ssh root@${cleanVpsHost}
# ═══════════════════════════════════════════════════════════
# IMPORTANT: Do NOT install iptables-persistent — on Ubuntu 26.04
# it conflicts with ufw and aborts the install.
# All NAT & port-forward rules live in wg0.conf PostUp/PostDown.
# ═══════════════════════════════════════════════════════════

# 1. Install WireGuard only
apt-get update && apt-get install -y wireguard

# 2. Persistent IP forwarding (Ubuntu 26.04 uses /etc/sysctl.d, no /etc/sysctl.conf)
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl --system > /dev/null

# 3. Allow UFW forwarding + open SSH, WireGuard & router API ports
sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
ufw allow 22/tcp
ufw allow 51820/udp
ufw allow 8443:8499/tcp
ufw --force enable
ufw reload

# 4. Auto-detect primary WAN interface (eth0, ens3, enp1s0, etc.)
WAN_IFACE=$(ip -o -4 route show to default | awk '{print $5}' | head -n1)
echo "Detected WAN interface: $WAN_IFACE"

# 5. Generate VPS keys (re-uses existing keys if already present)
mkdir -p /etc/wireguard && cd /etc/wireguard && umask 077
[ -f server_private.key ] || (wg genkey | tee server_private.key | wg pubkey > server_public.key)
SERVER_PRIV=$(cat server_private.key)
SERVER_PUB=$(cat server_public.key)

# 6. Create wg0.conf (skipped if it exists so existing router peers are safe)
#    Includes "POSTROUTING -o wg0 MASQUERADE" (return-path fix so external
#    dashboard traffic gets replies through the tunnel instead of the ISP WAN).
if [ -f /etc/wireguard/wg0.conf ]; then
  echo "wg0.conf already exists — keeping existing config and peers"
else
cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
Address = ${vpsHubIp}/24
ListenPort = 51820
PrivateKey = $SERVER_PRIV
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $WAN_IFACE -j MASQUERADE; iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $WAN_IFACE -j MASQUERADE; iptables -t nat -D POSTROUTING -o wg0 -j MASQUERADE
EOF
fi

# 7. Enable & start WireGuard
systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0
wg show

echo "=========================================="
echo "VPS WireGuard Public Key: $SERVER_PUB"
echo "=========================================="
echo "Paste this key into 'VPS WireGuard Public Key' under Add New Router."`;

  const wg0ConfTemplate = `# /etc/wireguard/wg0.conf (generated & updated automatically by the scripts)
[Interface]
Address = ${vpsHubIp}/24
ListenPort = 51820
PrivateKey = <VPS_PRIVATE_KEY>

# Base NAT + return-path fix ("POSTROUTING -o wg0 -j MASQUERADE" is REQUIRED)
# Plus persisted router port-forwards:
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE; iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE; iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8443 -j DNAT --to-destination ${cleanSubnet}.2:443; iptables -A FORWARD -p tcp -d ${cleanSubnet}.2 --dport 443 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE; iptables -t nat -D POSTROUTING -o wg0 -j MASQUERADE; iptables -t nat -D PREROUTING -i eth0 -p tcp --dport 8443 -j DNAT --to-destination ${cleanSubnet}.2:443; iptables -D FORWARD -p tcp -d ${cleanSubnet}.2 --dport 443 -j ACCEPT

# ─── Peers ───
[Peer]
# Router 1 (VPS port 8443 -> ${cleanSubnet}.2:443)
PublicKey = <ROUTER_1_PUBLIC_KEY>
AllowedIPs = ${cleanSubnet}.2/32

[Peer]
# Router 2 (VPS port 8444 -> ${cleanSubnet}.3:443)
PublicKey = <ROUTER_2_PUBLIC_KEY>
AllowedIPs = ${cleanSubnet}.3/32`;

  // ═══════════════════════════════════════════════════════
  // ADD NEW ROUTER SCRIPTS (SYNCHRONIZED & EXECUTABLE)
  // ═══════════════════════════════════════════════════════

  // Phase 1: MikroTik Create WireGuard Interface (single-line, no "\" continuation issues)
  const addRouterPhase1Script = `# ═══════════════════════════════════════════════════════
# Phase 1: Create WireGuard Interface on the NEW Router
# WinBox → New Terminal (single-line commands, zero "\\" prompt hangs)
# ═══════════════════════════════════════════════════════

:if ([:len [/interface wireguard find name=wg-vps]] = 0) do={ /interface wireguard add name=wg-vps listen-port=13231 mtu=1420 }

:put "COPY the 44-char public-key below (this is the ROUTER key, NOT the VPS key):"
/interface wireguard print where name=wg-vps`;

  // Phase 2: VPS 1-Shot Zero-Downtime Hot-Add Bash Script
  const addRouterVpsScript = `# ═══════════════════════════════════════════════════════
# Phase 2: Register Router on VPS (1-shot, zero downtime)
# SSH:  ssh root@${cleanVpsHost}   then paste this ENTIRE block
# ═══════════════════════════════════════════════════════

ROUTER_NAME="${newRouterName || `Katsina Hub ${nextRouterNumber}`}"
ROUTER_KEY="${(newRouterPublicKey || '').trim() || '<PASTE_ROUTER_PUBLIC_KEY>'}"
ROUTER_IP="${nextVpnIp}"
VPS_PORT="${nextVpsPort}"
CONF=/etc/wireguard/wg0.conf
WAN_IFACE=$(ip -o -4 route show to default | awk '{print $5}' | head -n1)

# 0. Validate router public key (must be the 44-char base64 key from Phase 1)
KEYLEN=$(printf %s "$ROUTER_KEY" | wc -c)
if [ "$KEYLEN" -ne 44 ]; then
  echo "ERROR: Router public key is missing or invalid ($KEYLEN chars)."
  echo "Copy the router's public-key from WinBox (Phase 1) and paste it above first."
else

# 1. Clean any leftover invalid placeholder lines if an earlier draft failed
sed -i '/PASTE_ROUTER_PUBLIC_KEY/,+1d; /PASTE_MIKROTIK_PUBLIC_KEY_HERE/,+1d' $CONF

# 2. Authorize peer LIVE without restarting WireGuard (zero downtime for other routers)
wg set wg0 peer "$ROUTER_KEY" allowed-ips "$ROUTER_IP/32"
grep -q "$ROUTER_KEY" $CONF || cat <<EOF >> $CONF

[Peer]
# $ROUTER_NAME
PublicKey = $ROUTER_KEY
AllowedIPs = $ROUTER_IP/32
EOF

# 3. Live port forward (idempotent) + return-path MASQUERADE on wg0
iptables -t nat -C PREROUTING -i $WAN_IFACE -p tcp --dport $VPS_PORT -j DNAT --to-destination $ROUTER_IP:443 2>/dev/null || iptables -t nat -A PREROUTING -i $WAN_IFACE -p tcp --dport $VPS_PORT -j DNAT --to-destination $ROUTER_IP:443
iptables -C FORWARD -p tcp -d $ROUTER_IP --dport 443 -j ACCEPT 2>/dev/null || iptables -A FORWARD -p tcp -d $ROUTER_IP --dport 443 -j ACCEPT
iptables -t nat -C POSTROUTING -o wg0 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE
ufw allow $VPS_PORT/tcp

# 4. Persist rules in wg0.conf PostUp/PostDown (works on Ubuntu 26.04 without iptables-persistent)
grep -q "dport $VPS_PORT " $CONF || {
  sed -i "/^PostUp =/ s|$|; iptables -t nat -A PREROUTING -i $WAN_IFACE -p tcp --dport $VPS_PORT -j DNAT --to-destination $ROUTER_IP:443; iptables -A FORWARD -p tcp -d $ROUTER_IP --dport 443 -j ACCEPT|" $CONF
  sed -i "/^PostDown =/ s|$|; iptables -t nat -D PREROUTING -i $WAN_IFACE -p tcp --dport $VPS_PORT -j DNAT --to-destination $ROUTER_IP:443; iptables -D FORWARD -p tcp -d $ROUTER_IP --dport 443 -j ACCEPT|" $CONF
}
grep -q "POSTROUTING -o wg0" $CONF || {
  sed -i "/^PostUp =/ s|$|; iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE|" $CONF
  sed -i "/^PostDown =/ s|$|; iptables -t nat -D POSTROUTING -o wg0 -j MASQUERADE|" $CONF
}

echo ""
echo "SUCCESS: $ROUTER_NAME registered ($ROUTER_IP, VPS port $VPS_PORT)"
wg show wg0
echo "Note: Run Phase 3 on MikroTik (/ping ${vpsHubIp} count=3) to trigger the handshake."
ping -c 3 $ROUTER_IP
fi`;

  // Phase 3: MikroTik Connect to VPS & Verify Tunnel (single-line commands)
  const addRouterPhase3Script = `# ═══════════════════════════════════════════════════════
# Phase 3: Connect Router to VPS Hub & Trigger Handshake
# Run on the NEW MikroTik Router via WinBox → Terminal
# ═══════════════════════════════════════════════════════

# 1. Assign WireGuard Tunnel IP
:if ([:len [/ip address find interface=wg-vps]] = 0) do={ /ip address add address=${nextVpnIp}/24 interface=wg-vps } else={ /ip address set [find interface=wg-vps] address=${nextVpnIp}/24 }

# 2. Add/update VPS peer (uses the VPS public key, NOT the router key)
:if ([:len [/interface wireguard peers find interface=wg-vps]] = 0) do={ /interface wireguard peers add interface=wg-vps public-key="${(vpsPublicKey || '').trim() || '<VPS_PUBLIC_KEY>'}" endpoint-address="${cleanVpsHost}" endpoint-port=51820 allowed-address=${cleanSubnet}.0/24 persistent-keepalive=25s } else={ /interface wireguard peers set [find interface=wg-vps] public-key="${(vpsPublicKey || '').trim() || '<VPS_PUBLIC_KEY>'}" endpoint-address="${cleanVpsHost}" endpoint-port=51820 allowed-address=${cleanSubnet}.0/24 persistent-keepalive=25s }

# 3. Verify VPS reachability & force immediate WireGuard handshake
/ping ${cleanVpsHost} count=2
/ping ${vpsHubIp} count=3
/interface wireguard peers print`;

  // ═══════════════════════════════════════════════════════
  // REST API ONLY SETUP
  // ═══════════════════════════════════════════════════════
  const restApiSetupScript = `# ═══════════════════════════════════════════════════════
# MikroTik REST API Setup (Minimal) — WinBox → Terminal
# ═══════════════════════════════════════════════════════

# 1. Firewall: allow TCP 443 over wg-vps (otherwise REST calls time out)
:do { /ip firewall filter remove [find comment="Allow REST API over WireGuard"] } on-error={}
:do { /ip firewall filter add chain=input in-interface=wg-vps protocol=tcp dst-port=443 action=accept place-before=0 comment="Allow REST API over WireGuard" } on-error={ /ip firewall filter add chain=input in-interface=wg-vps protocol=tcp dst-port=443 action=accept comment="Allow REST API over WireGuard" }

# 2. Generate & assign self-signed SSL cert (required — else "sslv3 alert handshake failure")
:if ([:len [/certificate find name=local-cert]] = 0) do={
  /certificate add name=local-cert common-name=router days-valid=3650 key-size=2048
  /certificate sign local-cert
}
/ip service set www-ssl certificate=local-cert disabled=no port=443
:do { /ip service set api-ssl certificate=local-cert disabled=no } on-error={}

# 3. Dedicated API user
:if ([:len [/user find name="${apiUser}"]] = 0) do={
  /user add name="${apiUser}" group=full password="${pw}"
} else={
  /user set [find name="${apiUser}"] password="${pw}"
}

:put "REST API active on HTTPS 443 — user: ${apiUser}"
:put "Test inside VPS:  curl -sk -u ${apiUser}:${pw} https://${nextVpnIp}/rest/system/resource"
:put "Test from PC/App: curl -sk -u ${apiUser}:${pw} https://${cleanVpsHost}:${nextVpsPort}/rest/system/resource"`;

  // ═══════════════════════════════════════════════════════
  // WATCHDOG-ONLY SCRIPT
  // ═══════════════════════════════════════════════════════
  const watchdogOnlyScript = `# ═══════════════════════════════════════════════════════
# Power-Cut Auto-Recovery Watchdog (Standalone)
# For: ${activeRouterName}   |   WireGuard hub: ${vpsHubIp}
# Paste into WinBox → Terminal (safe to re-run)
# ═══════════════════════════════════════════════════════

# 1. Enable Cloud Time Sync (fixes 1970 clock after power loss)
/ip cloud set ddns-enabled=yes update-time=yes

# 2. Configure NTP with direct IPs (works before DNS resolves)
:do { /system ntp client set enabled=yes servers=216.239.35.0,1.1.1.1 } on-error={
  :do { /system ntp client set enabled=yes primary-ntp=216.239.35.0 secondary-ntp=1.1.1.1 } on-error={}
}

# 3. Set WireGuard keepalive to prevent NAT mapping timeout
:do { /interface wireguard peers set [find interface=wg-vps] persistent-keepalive=25s } on-error={}

# 4. Remove old watchdog (fixes any older script pinging the wrong hub IP)
:do { /system scheduler remove [find name="an-power-watchdog"] } on-error={}
:do { /system script remove [find name="an-watchdog-script"] } on-error={}

# 5. Create the recovery script pointing to hub ${vpsHubIp}
/system script add name="an-watchdog-script" policy=read,write,test source={
  :local vpsIp "${vpsHubIp}"
  :local pingCount [/ping $vpsIp count=2]
  :if ($pingCount = 0) do={
    :log warning "Watchdog: VPS hub unreachable. Cycling WireGuard..."
    :do {
      /interface wireguard disable [find name="wg-vps"]
      :delay 2s
      /interface wireguard enable [find name="wg-vps"]
    } on-error={}
    :do { /ip cloud force-update } on-error={}
  }
  :do {
    /tool fetch url="${heartbeatUrl}" mode=https check-certificate=no keep-result=no
  } on-error={}
}

# 6. Run on boot + every 60 seconds
/system scheduler add name="an-power-watchdog" start-time=startup interval=60s on-event="/system script run an-watchdog-script" policy=read,write,test

:log info "Power-Cut Auto-Recovery Watchdog installed!"
:put "Watchdog active (hub ${vpsHubIp}). Router reconnects in 30-60s after power cuts."`;


  return (
    <div className="sa-tab-body">

      {/* ── GitBook Style Documentation Header ── */}
      <div
        style={{
          background: '#0F172A',
          border: '1px solid #1E293B',
          borderRadius: 14,
          padding: '24px 26px',
          marginBottom: 24,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 18,
          borderBottom: '1px solid #1E293B',
          paddingBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: '#1E293B',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}>
              📖
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.3px' }}>
                Setup & Deployment Docs
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#94A3B8', lineHeight: 1.5 }}>
                Official operational runbooks, copy-paste terminal scripts, and multi-router fleet configurations.
              </p>
            </div>
          </div>

          {/* Active router context chip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#0B0F19',
            border: '1px solid #1E293B',
            borderRadius: 8,
            padding: '8px 14px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: activeRouter?.status === 'online' ? '#10B981' : '#EF4444',
              boxShadow: `0 0 8px ${activeRouter?.status === 'online' ? '#10B981' : '#EF4444'}`,
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F8FAFC' }}>
              Target: {activeRouterName}
            </span>
            <span style={{ fontSize: 11, color: '#38BDF8', fontFamily: 'monospace' }}>
              ({activeRouter?.ip_address || 'Cloud'}:{activeRouter?.port || 443})
            </span>
          </div>
        </div>

        {/* GitBook Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          background: '#0B0F19',
          border: '1px solid #1E293B',
          borderRadius: 10,
          padding: 6,
        }}>
          {guides.map(g => {
            const isActive = activeGuide === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setActiveGuide(g.id)}
                style={{
                  background: isActive ? '#1E293B' : 'transparent',
                  border: isActive ? '1px solid #38BDF8' : '1px solid transparent',
                  borderRadius: 7,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════ */}
      {/* OVERVIEW GUIDE                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'overview' && (
        <div>
          {/* Architecture diagram */}
          <CollapsibleSection
            title="Architecture Overview"
            icon="🏗️"
            subtitle="How the platform connects to MikroTik routers"
            color="#60A5FA"
            defaultOpen={true}
          >
            <CopyBlock
              label="Network Architecture Diagram"
              language="ascii"
              code={`
┌──────────────────────────────────┐
│   Vercel (Next.js Cloud App)     │
│   ${appHostname.padEnd(30, ' ')} │
└──────────┬───────────────────────┘
           │  HTTPS REST API Calls
           ▼
┌──────────────────────────────────┐
│   Hostinger VPS (${cleanVpsHost})
│   Ubuntu + WireGuard (${vpsHubIp})
│                                  │
│   Port 8443 → ${cleanSubnet}.2:443    │  ← Router 1
│   Port 8444 → ${cleanSubnet}.3:443    │  ← Router 2
│   Port ${nextVpsPort}  → ${nextVpnIp}:443    │  ← Router ${nextRouterNumber} (next)
│                                  │
│   WireGuard VPN: UDP 51820       │
└──────────┬───────────────────────┘
           │  Encrypted WireGuard Tunnel (+ wg0 MASQUERADE)
           ▼
┌──────────────────────────────────┐
│   MikroTik Routers               │
│   (Behind ISP CGNAT / NAT)       │
│                                  │
│   Router 1: ${cleanSubnet}.2 (VPN)    │
│   Router 2: ${cleanSubnet}.3 (VPN)    │
│                                  │
│   Firewall: Allow TCP 443 wg-vps │
│   REST API on HTTPS:443 (TLS)    │
└──────────────────────────────────┘`}
            />

            {/* Port forwarding table */}
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 12.5, color: '#E2E8F0',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E293B', background: '#131C31' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>VPS Public Port</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>Forwards To</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {routersList.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #1E293B' }}>
                      <td style={{ padding: '8px 14px' }}>
                        <code style={{ color: '#F59E0B' }}>{r.port || (8443 + i)}</code>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <code style={{ color: '#4ADE80' }}>{cleanSubnet}.{i + 2}:443</code>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {r.status === 'online' ? '🟢' : '🔴'} {r.name} — MikroTik REST API
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: '1px solid #1E293B' }}>
                    <td style={{ padding: '8px 14px' }}><code style={{ color: '#F59E0B' }}>51820</code> (UDP)</td>
                    <td style={{ padding: '8px 14px' }}>—</td>
                    <td style={{ padding: '8px 14px' }}>WireGuard VPN listen port</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 14px' }}><code style={{ color: '#F59E0B' }}>22</code> (TCP)</td>
                    <td style={{ padding: '8px 14px' }}>—</td>
                    <td style={{ padding: '8px 14px' }}>SSH access</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          {/* Quick decision tree */}
          <CollapsibleSection
            title="Which Guide Do I Need?"
            icon="🧭"
            subtitle="Quick decision tree based on your situation"
            color="#34A853"
            defaultOpen={true}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}>
              {[
                {
                  emoji: '🆕',
                  title: 'Setting Up a Brand New Router',
                  desc: 'First time configuring a MikroTik for this platform',
                  action: 'Use the Master 1-Shot Config — it does everything in one paste.',
                  color: '#F59E0B',
                  guide: 'master-config',
                },
                {
                  emoji: '🖥️',
                  title: 'VPS Was Wiped / New VPS Setup',
                  desc: 'Hostinger VPS expired or you need to start from scratch',
                  action: 'Go to VPS & WireGuard guide for full restore procedure.',
                  color: '#34A853',
                  guide: 'vps-setup',
                },
                {
                  emoji: '⚡',
                  title: 'Router Shows Offline After Power Cut',
                  desc: 'Power went out and the router isn\'t reconnecting',
                  action: 'Install the Power-Cut Watchdog to permanently fix this.',
                  color: '#EF4444',
                  guide: 'watchdog',
                },
                {
                  emoji: '➕',
                  title: 'Adding Another Router to the Fleet',
                  desc: 'Expanding to a new location with a new MikroTik',
                  action: 'Follow the Add New Router guide — VPS + Router steps.',
                  color: '#06B6D4',
                  guide: 'add-router',
                },
              ].map((card) => (
                <div
                  key={card.guide}
                  onClick={() => setActiveGuide(card.guide)}
                  style={{
                    background: '#131C31',
                    border: '1px solid #1E293B',
                    borderRadius: 12,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{card.emoji}</span>
                    <strong style={{ fontSize: 13, color: card.color }}>{card.title}</strong>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                    {card.desc}
                  </p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#E2E8F0', fontWeight: 600 }}>
                    → {card.action}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Timing comparison */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid #1E293B', borderLeft: '4px solid #F59E0B',
            borderRadius: 14,
            padding: '18px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>⏱️</span>
              <strong style={{ fontSize: 14, color: '#F59E0B' }}>Recovery Time Comparison</strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid #7F1D1D',
                borderRadius: 10,
                padding: '14px 16px',
              }}>
                <strong style={{ color: '#FCA5A5', fontSize: 12 }}>❌ Without Watchdog</strong>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#EF4444', margin: '6px 0 4px' }}>1–3 hours</div>
                <p style={{ margin: 0, fontSize: 11, color: '#CBD5E1', lineHeight: 1.4 }}>
                  Router boots with 1970 clock → WireGuard rejects handshakes → Waits for slow NTP/DNS → Eventually syncs
                </p>
              </div>
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid #065F46',
                borderRadius: 10,
                padding: '14px 16px',
              }}>
                <strong style={{ color: '#86EFAC', fontSize: 12 }}>✅ With Watchdog</strong>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#22C55E', margin: '6px 0 4px' }}>30–60 sec</div>
                <p style={{ margin: 0, fontSize: 11, color: '#CBD5E1', lineHeight: 1.4 }}>
                  Boot → Cloud time sync instantly → WireGuard keepalive reconnects → Heartbeat pings cloud server
                </p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* MASTER 1-SHOT CONFIG                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'master-config' && (
        <div>
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid #1E293B', borderLeft: '4px solid #F59E0B',
            borderRadius: 14,
            padding: '18px 22px',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>⚡</span>
              <div>
                <strong style={{ fontSize: 15, color: '#F59E0B' }}>Master 1-Shot Configuration</strong>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#CBD5E1' }}>
                  Paste this ONE script into WinBox Terminal and it configures EVERYTHING.
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 8,
              marginTop: 10,
            }}>
              {[
                { icon: '🛡️', text: 'Allow TCP 443 over wg-vps' },
                { icon: '🔐', text: 'Self-signed SSL cert (local-cert)' },
                { icon: '👤', text: `API user (${apiUser})` },
                { icon: '☁️', text: 'Cloud DDNS & time sync' },
                { icon: '🕐', text: 'NTP with direct IPs' },
                { icon: '🌐', text: 'WireGuard 25s keepalive' },
                { icon: '⚡', text: `Watchdog (${vpsHubIp})` },
                { icon: '📡', text: 'Boot heartbeat to cloud' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 11.5,
                  color: '#E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Prerequisites */}
          <CollapsibleSection
            title="Prerequisites"
            icon="✅"
            subtitle="What you need before running the script"
            color="#60A5FA"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li><strong>WinBox</strong> installed on your computer (<a href="https://mikrotik.com/download" target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA' }}>Download from MikroTik</a>)</li>
                <li><strong>Connect to router</strong> via WinBox (MAC or IP address)</li>
                <li><strong>WireGuard tunnel</strong> already set up between router and VPS (see <span onClick={() => setActiveGuide('add-router')} style={{ color: '#06B6D4', cursor: 'pointer', textDecoration: 'underline' }}>Add New Router</span> guide if not)</li>
                <li>API Credentials: Pre-configured below as <code style={{ color: '#38BDF8', background: '#1E293B', padding: '2px 6px', borderRadius: 4 }}>{apiUser}</code> / <code style={{ color: '#34D399', background: '#1E293B', padding: '2px 6px', borderRadius: 4 }}>{pw}</code> — automatically injected!</li>
              </ol>
            </div>
          </CollapsibleSection>

          {/* Steps */}
          <CollapsibleSection
            title="Step-by-Step Instructions"
            icon="📝"
            subtitle="How to run the master config"
            color="#F59E0B"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <StepBadge number={1} />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Open WinBox & Connect</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                    Launch WinBox → Click on your router&apos;s MAC address → Login as admin
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <StepBadge number={2} />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Open Terminal</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                    In WinBox, click <strong>&quot;New Terminal&quot;</strong> in the left menu to open the RouterOS command line
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <StepBadge number={3} />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Copy & Paste the Script</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                    Click &quot;📋 Copy&quot; below → Right-click in WinBox terminal → Paste (wait a few seconds for <code style={{ color: '#4ADE80' }}>progress: done</code> while the SSL cert signs)
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <StepBadge number={4} />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Register in Admin Dashboard</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1', lineHeight: 1.5 }}>
                    Go to <strong>Locations & Fleet</strong> → Click <strong>Add Router</strong> with VPS IP <code style={{ color: '#38BDF8' }}>{cleanVpsHost}</code>, port <code style={{ color: '#F59E0B' }}>{nextVpsPort}</code>, and credentials above
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Interactive API Credentials Generator */}
          <div style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 13.5, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🔑 REST API Credentials Configurator
                </strong>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  All scripts below automatically sync with these values — no manual editing needed!
                </span>
              </div>
              <button
                type="button"
                onClick={generateRandomPassword}
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  color: '#38BDF8',
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                🎲 Generate Password
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={apiUsername}
                onChange={e => setApiUsername(e.target.value)}
                style={{
                  background: '#030712',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '8px 14px',
                  color: '#38BDF8',
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 700,
                }}
                placeholder="API Username (e.g. mycollectivesub)"
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type={showApiPassword ? 'text' : 'password'}
                  value={apiPassword}
                  onChange={e => setApiPassword(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '8px 14px',
                    color: '#34D399',
                    fontFamily: 'monospace',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                  placeholder="Enter password..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiPassword(!showApiPassword)}
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#CBD5E1',
                    padding: '8px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {showApiPassword ? '👁️ Hide' : '👁️ Show'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#FBBF24', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡</span> <strong>Remember these credentials!</strong> Use <code style={{ color: '#38BDF8' }}>{apiUser}</code> / <code style={{ color: '#34D399' }}>{pw}</code> when adding the router in <strong>Locations & Fleet</strong>.
            </div>
          </div>

          <CopyBlock
            label="⚡ Master 1-Shot Config — Copy & Paste into WinBox Terminal"
            language="RouterOS Script"
            code={masterConfigScript}
          />

          {/* Important notes */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid #7F1D1D',
            borderRadius: 12,
            padding: '14px 18px',
            marginTop: 8,
          }}>
            <strong style={{ color: '#FCA5A5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span> Important Reminders
            </strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#CBD5E1', lineHeight: 1.6 }}>
              <li>API credentials are automatically set to: <code style={{ color: '#38BDF8' }}>{apiUser}</code> / <code style={{ color: '#34D399' }}>{pw}</code></li>
              <li>Firewall rule <code style={{ color: '#4ADE80' }}>Allow REST API over WireGuard</code> ensures TCP 443 isn&apos;t silently dropped while ping works</li>
              <li>Watchdog is pinned to hub IP <code style={{ color: '#38BDF8' }}>{vpsHubIp}</code> so it won&apos;t endlessly restart <code>wg-vps</code></li>
              <li>Safe to run multiple times — updates existing rules, user password, and watchdog cleanly</li>
            </ul>
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* VPS & WIREGUARD SETUP                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'vps-setup' && (
        <div>
          <CollapsibleSection
            title="VPS Requirements & Target Hub"
            icon="📋"
            subtitle="Configure your Hostinger VPS public IP & WireGuard subnet"
            color="#34A853"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                    VPS Public IP / Hostname
                  </label>
                  <input
                    type="text"
                    value={vpsHost}
                    onChange={e => setVpsHost(e.target.value)}
                    placeholder="2.25.15.1"
                    style={{
                      width: '100%',
                      background: '#030712',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#38BDF8',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 13.5,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                    WireGuard Subnet Prefix (Hub = .1)
                  </label>
                  <input
                    type="text"
                    value={vpnSubnet}
                    onChange={e => setVpnSubnet(e.target.value)}
                    placeholder="10.100.0"
                    style={{
                      width: '100%',
                      background: '#030712',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: '#4ADE80',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 13.5,
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}>
                {[
                  { label: 'Provider', value: 'Hostinger VPS' },
                  { label: 'OS Supported', value: 'Ubuntu 22.04 / 24.04 / 26.04' },
                  { label: 'VPS Public IP', value: cleanVpsHost },
                  { label: 'Hub Tunnel IP', value: `${vpsHubIp}/24` },
                  { label: 'WireGuard Port', value: 'UDP 51820' },
                  { label: 'Router API Range', value: 'TCP 8443–8499' },
                ].map((item, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #1E293B',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 600, marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{
                background: 'rgba(56, 189, 248, 0.07)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 10,
                padding: '12px 16px',
                marginTop: 14,
                fontSize: 12,
                color: '#CBD5E1',
                lineHeight: 1.6,
              }}>
                <strong style={{ color: '#38BDF8' }}>✅ Ubuntu 26.04 &amp; Return-Path Fixes Built In:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>Skips <code>iptables-persistent</code> (conflicts with <code>ufw</code> on Ubuntu 26.04) and persists NAT rules cleanly inside <code>/etc/wireguard/wg0.conf</code>.</li>
                  <li>Writes <code>net.ipv4.ip_forward=1</code> to <code>/etc/sysctl.d/99-wireguard.conf</code> and sets <code>DEFAULT_FORWARD_POLICY=&quot;ACCEPT&quot;</code> in <code>/etc/default/ufw</code>.</li>
                  <li>Includes <code>iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE</code> so MikroTik replies return through the tunnel instead of leaking out the router&apos;s ISP WAN.</li>
                </ul>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid #7F1D1D',
                borderRadius: 10,
                padding: '12px 16px',
                marginTop: 12,
                fontSize: 12,
                color: '#FCA5A5',
              }}>
                <strong>⚠️ CRITICAL:</strong> Enable <strong>Auto-Renewal</strong> on Hostinger and ensure <strong>UDP 51820</strong> + <strong>TCP 8443–8499</strong> are also open in Hostinger&apos;s Cloud Firewall panel (if enabled).
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="WireGuard Config File (wg0.conf)"
            icon="🔐"
            subtitle="/etc/wireguard/wg0.conf reference on the VPS"
            color="#C084FC"
            defaultOpen={false}
          >
            <CopyBlock
              label="📄 WireGuard Server Config Reference (auto-generated by script below)"
              language="INI"
              code={wg0ConfTemplate}
            />
            <p style={{ fontSize: 11.5, color: '#CBD5E1', margin: '4px 8px', lineHeight: 1.5 }}>
              The setup script below generates keys and writes this file automatically — including <code>POSTROUTING -o wg0 -j MASQUERADE</code>.
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title="Full VPS Setup / Restore Procedure (1-Paste)"
            icon="🔄"
            subtitle="Run on a fresh Ubuntu 22.04 / 24.04 / 26.04 VPS as root"
            color="#34A853"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <StepBadge number={1} color="#34A853" />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>SSH into VPS</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1' }}>
                    <code style={{ color: '#4ADE80' }}>ssh root@{cleanVpsHost}</code>
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <StepBadge number={2} color="#34A853" />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Paste the 1-shot install script below</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1' }}>
                    Installs WireGuard, enables forwarding, writes <code style={{ color: '#4ADE80' }}>/etc/wireguard/wg0.conf</code>, and starts <code>wg-quick@wg0</code>.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <StepBadge number={3} color="#34A853" />
                <div>
                  <strong style={{ fontSize: 14, color: '#FFFFFF' }}>Copy the printed VPS WireGuard Public Key</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1' }}>
                    Paste it into the <strong>VPS WireGuard Public Key</strong> box in the <strong>Add New Router</strong> tab.
                  </p>
                </div>
              </div>
            </div>

            <CopyBlock
              label="🖥️ VPS Full Install & Enable Script (run as root)"
              language="bash"
              code={vpsInstallScript}
            />
          </CollapsibleSection>

          {/* UFW ports reference */}
          <CollapsibleSection
            title="Firewall (UFW) Port Reference"
            icon="🛡️"
            subtitle="All required ports and their purpose"
            color="#60A5FA"
            defaultOpen={false}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 12.5, color: '#E2E8F0',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E293B', background: '#131C31' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>Port</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>Protocol</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>Purpose</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#60A5FA', fontWeight: 800 }}>UFW Command</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { port: '22', proto: 'TCP', purpose: 'SSH access', cmd: 'ufw allow 22/tcp' },
                    { port: '51820', proto: 'UDP', purpose: 'WireGuard VPN', cmd: 'ufw allow 51820/udp' },
                    { port: '8443', proto: 'TCP', purpose: `Router 1 REST API (${cleanSubnet}.2:443)`, cmd: 'ufw allow 8443/tcp' },
                    { port: '8444', proto: 'TCP', purpose: `Router 2 REST API (${cleanSubnet}.3:443)`, cmd: 'ufw allow 8444/tcp' },
                    { port: '8443:8499', proto: 'TCP', purpose: 'Full fleet router range', cmd: 'ufw allow 8443:8499/tcp' },
                  ].map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1E293B' }}>
                      <td style={{ padding: '8px 14px' }}><code style={{ color: '#F59E0B' }}>{row.port}</code></td>
                      <td style={{ padding: '8px 14px' }}>{row.proto}</td>
                      <td style={{ padding: '8px 14px' }}>{row.purpose}</td>
                      <td style={{ padding: '8px 14px' }}><code style={{ color: '#4ADE80', fontSize: 11 }}>{row.cmd}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* MIKROTIK REST API SETUP                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'mikrotik-setup' && (
        <div>
          <CollapsibleSection
            title="What is the MikroTik REST API?"
            icon="💡"
            subtitle="Understanding how the platform communicates with routers"
            color="#C084FC"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
              <p>
                MikroTik RouterOS 7+ includes a built-in <strong style={{ color: '#C084FC' }}>REST API</strong> that allows
                external applications to manage the router over HTTPS. This is how the <strong>My Collective Sub</strong> platform
                creates vouchers, manages sessions, pushes login pages, and monitors router health — all remotely.
              </p>
              <p style={{ marginTop: 8 }}>
                Two router prerequisites are essential so REST calls never time out or fail SSL handshakes:
                allowing <code style={{ color: '#4ADE80' }}>TCP 443</code> in-interface <code style={{ color: '#38BDF8' }}>wg-vps</code> in the router firewall,
                and signing a self-signed certificate (<code style={{ color: '#F59E0B' }}>local-cert</code>) assigned to <code>www-ssl</code>.
              </p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="REST API Setup (Standalone Script)"
            icon="🔧"
            subtitle="Minimal script to enable firewall rule, SSL cert, and REST API"
            color="#C084FC"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <StepBadge number={1} color="#C084FC" />
                <div>
                  <strong style={{ color: '#FFFFFF' }}>Open WinBox → New Terminal</strong>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <StepBadge number={2} color="#C084FC" />
                <div>
                  <strong style={{ color: '#FFFFFF' }}>Paste the script below</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1' }}>
                    Wait for <code style={{ color: '#4ADE80' }}>progress: done</code> while RouterOS signs the SSL certificate.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <StepBadge number={3} color="#C084FC" />
                <div>
                  <strong style={{ color: '#FFFFFF' }}>Test &amp; Save in Dashboard</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#CBD5E1' }}>
                    Test <code style={{ color: '#4ADE80' }}>https://{cleanVpsHost}:{nextVpsPort}/rest/system/resource</code> from your PC (not from inside the VPS itself, since local curls bypass <code>PREROUTING -i eth0</code>). In the dashboard, click <strong>Save</strong> before clicking <strong>Test Connection</strong>!
                  </p>
                </div>
              </div>
            </div>

            <CopyBlock
              label="🔧 REST API Setup Script — Paste in WinBox Terminal"
              language="RouterOS Script"
              code={restApiSetupScript}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Testing & Troubleshooting the REST API"
            icon="🧪"
            subtitle="How to verify both the WireGuard tunnel and external VPS forwarding"
            color="#06B6D4"
            defaultOpen={false}
          >
            <div style={{ padding: '0 8px' }}>
              <CopyBlock
                label="Verify from VPS vs External PC (curl)"
                language="bash"
                code={`# 1. Test INSIDE VPS directly to the WireGuard tunnel IP:
curl -sk -u "${apiUser}:${pw}" https://${nextVpnIp}/rest/system/resource

# 2. Test OUTSIDE VPS (Windows PowerShell / Vercel) via the forwarded VPS port:
curl -sk -u "${apiUser}:${pw}" https://${cleanVpsHost}:${nextVpsPort}/rest/system/resource

# Note: Running curl to ${cleanVpsHost}:${nextVpsPort} FROM INSIDE the VPS returns empty
# because PREROUTING -i eth0 only matches external incoming traffic.`}
              />

              <CopyBlock
                label="Register & Test in Admin Dashboard"
                language="text"
                code={`1. Go to Locations & Fleet -> Add New Router (or MikroTik Config -> Default / Primary Router)
2. Enter IP: ${cleanVpsHost}, Port: ${nextVpsPort}, User: ${apiUser}, Password: ${pw}, Use SSL: Checked
3. Click "Save Router" or "Save Configuration" FIRST
4. Click "Test Connection" — green Online badge confirms end-to-end connectivity!`}
              />
            </div>
          </CollapsibleSection>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* POWER-CUT WATCHDOG                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'watchdog' && (
        <div>
          {/* Problem explanation */}
          <CollapsibleSection
            title="The Problem: MikroTik Clock Reset"
            icon="🕒"
            subtitle="Why routers go offline after power cuts"
            color="#EF4444"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                marginBottom: 12,
              }}>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid #7F1D1D',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <strong style={{ color: '#FCA5A5', fontSize: 12 }}>🕒 Clock Reset (1970)</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                    MikroTik hAP ax² has no battery RTC. Power loss resets clock to Jan 1, 1970.
                  </p>
                </div>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid #7F1D1D',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <strong style={{ color: '#FCA5A5', fontSize: 12 }}>🔒 WireGuard Rejection</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                    WireGuard drops handshakes as &quot;replay attacks&quot; because the timestamp is decades in the past.
                  </p>
                </div>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid #7F1D1D',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <strong style={{ color: '#FCA5A5', fontSize: 12 }}>⏳ Slow NTP Recovery</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                    Default NTP uses DNS hostnames that may not resolve until the ISP modem finishes booting.
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Solution */}
          <CollapsibleSection
            title="The Solution: Auto-Recovery Watchdog"
            icon="⚡"
            subtitle="What the watchdog script does and how it fixes the problem"
            color="#22C55E"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li><strong style={{ color: '#22C55E' }}>Cloud Time Sync</strong> — Uses MikroTik Cloud (IP-based, no DNS needed) to fix the clock immediately on boot</li>
                <li><strong style={{ color: '#22C55E' }}>Direct IP NTP</strong> — Configures NTP with <code>216.239.35.0</code> and <code>1.1.1.1</code> (no DNS resolution required)</li>
                <li><strong style={{ color: '#22C55E' }}>WireGuard Keepalive</strong> — Sets 25-second persistent keepalive to prevent NAT mapping timeout</li>
                <li><strong style={{ color: '#22C55E' }}>Interface Cycling</strong> — If VPS is unreachable, disables and re-enables the WireGuard tunnel</li>
                <li><strong style={{ color: '#22C55E' }}>Cloud Heartbeat</strong> — Pings the cloud server to report &quot;I&apos;m back online&quot; with current IP</li>
                <li><strong style={{ color: '#22C55E' }}>Runs on Boot + Every 60s</strong> — Triggers immediately after power restoration, then maintains health</li>
              </ol>
            </div>
          </CollapsibleSection>

          {/* The script */}
          <CopyBlock
            label={`⚡ Watchdog Script for ${activeRouterName} — Copy & Paste into WinBox Terminal`}
            language="RouterOS Script"
            code={watchdogOnlyScript}
          />

          {/* Verify installation */}
          <CollapsibleSection
            title="Verify Watchdog Installation"
            icon="✅"
            subtitle="How to confirm the watchdog is running"
            color="#60A5FA"
            defaultOpen={false}
          >
            <CopyBlock
              label="Check if watchdog is installed & running"
              language="RouterOS"
              code={`# Check the scheduled task
/system scheduler print where name="an-power-watchdog"

# Check the script exists
/system script print where name="an-watchdog-script"

# Manually trigger the watchdog to test
/system script run an-watchdog-script

# Check router logs for watchdog activity
/log print where topics~"script"`}
            />
          </CollapsibleSection>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* QUICK RECOVERY — ALREADY ONLINE ROUTERS               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'quick-recovery' && (
        <div>
          {/* When to use */}
          <div style={{
            background: '#0F172A',
            border: '1px solid #1E293B', borderLeft: '4px solid #A78BFA',
            borderRadius: 14,
            padding: '18px 22px',
            marginBottom: 20,
          }}>
            <strong style={{ color: '#A78BFA', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span>🔧</span> When to Use This Script
            </strong>
            <p style={{ margin: 0, fontSize: 13, color: '#E2E8F0', lineHeight: 1.6 }}>
              Use this for routers that are <strong style={{ color: '#4ADE80' }}>already online and working</strong> — they already have
              REST API, WireGuard, and credentials configured. They just need the <strong style={{ color: '#FBBF24' }}>power-cut
              auto-recovery watchdog</strong> so they come back online in 30-60 seconds instead of 1-3 hours after future blackouts.
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginTop: 14,
            }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid #7F1D1D',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <strong style={{ color: '#FCA5A5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⛔ Without Script
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                  Power cut → clock resets to 1970 → WireGuard rejects handshakes → <strong style={{ color: '#EF4444' }}>1 to 3 hours</strong> to recover
                </p>
              </div>
              <div style={{
                background: '#0F172A',
                border: '1px solid #065F46',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <strong style={{ color: '#86EFAC', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✅ With Script
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                  Power cut → watchdog syncs clock via direct IP → WireGuard reconnects → <strong style={{ color: '#22C55E' }}>30 to 60 seconds</strong> to recover
                </p>
              </div>
            </div>
          </div>

          {/* What it does NOT touch */}
          <CollapsibleSection
            title="What This Script Does NOT Change"
            icon="ℹ️"
            subtitle="Safe for already-configured routers"
            color="#60A5FA"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>❌ Does <strong>NOT</strong> change your REST API settings (port, user, password)</li>
                <li>❌ Does <strong>NOT</strong> change your WireGuard tunnel config (keys, endpoints)</li>
                <li>❌ Does <strong>NOT</strong> touch SSL certificates, hotspot config, or user profiles</li>
                <li>❌ Does <strong>NOT</strong> modify your IP addresses or routing tables</li>
                <li style={{ color: '#4ADE80' }}>✅ <strong>ONLY</strong> adds: Cloud time sync, direct NTP, WireGuard keepalive, and a boot watchdog script</li>
              </ul>
            </div>
          </CollapsibleSection>

          {/* The script */}
          <CopyBlock
            label={`🔧 Power-Cut Recovery Script for ${activeRouterName} — Copy & Paste into WinBox Terminal`}
            language="RouterOS Script"
            code={watchdogOnlyScript}
          />

          {/* How to apply */}
          <CollapsibleSection
            title="How to Apply (2 Minutes)"
            icon="📋"
            subtitle="Step-by-step for already-online routers"
            color="#F59E0B"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2.2 }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, listStyle: 'none', marginLeft: -20, padding: '6px 0' }}>
                  <StepBadge number="1" color="#A78BFA" />
                  <span>Open <strong>WinBox</strong> and connect to your router (use the same IP/credentials you already have)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, listStyle: 'none', marginLeft: -20, padding: '6px 0' }}>
                  <StepBadge number="2" color="#A78BFA" />
                  <span>Open <strong>New Terminal</strong> (menu on left side)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, listStyle: 'none', marginLeft: -20, padding: '6px 0' }}>
                  <StepBadge number="3" color="#A78BFA" />
                  <span>Click the <strong style={{ color: '#4ADE80' }}>📋 Copy</strong> button above to copy the script</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, listStyle: 'none', marginLeft: -20, padding: '6px 0' }}>
                  <StepBadge number="4" color="#A78BFA" />
                  <span><strong>Right-click</strong> inside the terminal to paste, then press <strong>Enter</strong></span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, listStyle: 'none', marginLeft: -20, padding: '6px 0' }}>
                  <StepBadge number="5" color="#A78BFA" />
                  <span>You should see: <code style={{ color: '#4ADE80' }}>✅ Watchdog active!</code> — that&apos;s it, you&apos;re done!</span>
                </li>
              </ol>
            </div>
          </CollapsibleSection>

          {/* Verify */}
          <CollapsibleSection
            title="Verify It's Working"
            icon="✅"
            subtitle="Run these commands to confirm installation"
            color="#22C55E"
            defaultOpen={false}
          >
            <CopyBlock
              label="Verification Commands"
              language="RouterOS"
              code={`# Check the scheduled task exists
/system scheduler print where name="an-power-watchdog"

# Check the script exists
/system script print where name="an-watchdog-script"

# Manually trigger the watchdog to test
/system script run an-watchdog-script

# Check router logs for watchdog activity
/log print where topics~"script"`}
            />
          </CollapsibleSection>

          {/* Already installed? */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid #1E293B', borderLeft: '4px solid #F59E0B',
            borderRadius: 14,
            padding: '16px 20px',
            marginTop: 8,
          }}>
            <strong style={{ color: '#FBBF24', fontSize: 12 }}>💡 Already Installed?</strong>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#CBD5E1', lineHeight: 1.5 }}>
              Running this script again is <strong style={{ color: '#4ADE80' }}>completely safe</strong> — it removes the old watchdog first before re-creating it.
              You can re-run it anytime to update the heartbeat URL or watchdog behavior.
            </p>
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADD NEW ROUTER                                        */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeGuide === 'add-router' && (
        <div>
          {/* ── Top Hero Card ── */}
          <div style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderLeft: '4px solid #06B6D4',
            borderRadius: 14,
            padding: '20px 24px',
            marginBottom: 22,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>➕</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.3px' }}>
                      Deploying: {newRouterName || `Katsina Hub ${nextRouterNumber}`}
                    </h3>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: isRouterConfigFinished ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isRouterConfigFinished ? '#34D399' : '#FBBF24',
                      border: isRouterConfigFinished ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                    }}>
                      {isRouterConfigFinished ? '🟢 Config Complete (44-char Key Ready)' : '🟡 In Progress (Pending 44-char Key)'}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 13, color: '#94A3B8' }}>
                    VPN IP: <code style={{ color: '#38BDF8', fontWeight: 700 }}>{newRouterVpnIp}</code> •
                    VPS: <code style={{ color: '#F59E0B', fontWeight: 700 }}>{cleanVpsHost}:{newRouterVpsPort}</code> •
                    API User: <code style={{ color: '#34D399', fontWeight: 700 }}>{apiUser}</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewRouterName(`Katsina Hub ${nextRouterNumber}`);
                  setNewRouterVpnIp(defaultNextVpnIp);
                  setNewRouterVpsPort(defaultNextVpsPort);
                  setApiUsername(inferredApiUser);
                  generateRandomPassword();
                }}
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#94A3B8',
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                🔄 Reset Defaults
              </button>
            </div>
          </div>

          {/* ── Interactive Synchronizer & Configurator Form ── */}
          <div style={{
            background: '#0F172A',
            border: '1px solid #1E293B',
            borderRadius: 14,
            padding: '22px 24px',
            marginBottom: 24,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <strong style={{ fontSize: 15, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚡ New Router Dynamic Synchronizer
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#94A3B8' }}>
                  Customize the VPS and router details below. <strong style={{ color: '#38BDF8' }}>All scripts across Phases 1–5 update automatically in real time!</strong>
                </p>
              </div>
            </div>

            {/* ── Saved Presets & Dropdown Bar ── */}
            <div style={{
              background: '#0B0F19',
              border: '1px solid #1E293B',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                <span style={{ fontSize: 14 }}>📁</span>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#E2E8F0', whiteSpace: 'nowrap' }}>
                  Saved Router Presets:
                </label>
                <select
                  value={activePresetId}
                  onChange={e => handleSelectPreset(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#38BDF8',
                    padding: '6px 10px',
                    fontSize: 12.5,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <option value="custom">✨ Active Configuration (Current Draft)</option>
                  {savedPresets.map(p => (
                    <option key={p.id} value={p.id}>
                      📌 {p.name} — Port {p.vpsPort} (IP: {p.vpnIp})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSaveAsPreset}
                  style={{
                    background: '#10B981',
                    border: 'none',
                    borderRadius: 6,
                    color: '#FFFFFF',
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Save current router configuration so it appears in Locations & Fleet dropdown"
                >
                  💾 Save as Preset
                </button>
                {activePresetId !== 'custom' && (
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(activePresetId)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #7F1D1D',
                      borderRadius: 6,
                      color: '#F87171',
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Delete this saved preset"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {presetFeedback && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 8,
                padding: '8px 14px',
                marginBottom: 14,
                fontSize: 12.5,
                color: '#34D399',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>✓</span> {presetFeedback}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}>
              {/* Field 1: Router Name */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
                  1. Router Name / Branch
                </label>
                <input
                  type="text"
                  value={newRouterName}
                  onChange={e => setNewRouterName(e.target.value)}
                  placeholder="e.g. Katsina Hub 1"
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#F8FAFC',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Identifier used on VPS and in Locations &amp; Fleet.
                </span>
              </div>

              {/* Field 2: VPS Public IP */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
                  2. VPS Public IP / Host
                </label>
                <input
                  type="text"
                  value={vpsHost}
                  onChange={e => setVpsHost(e.target.value)}
                  placeholder="2.25.15.1"
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#38BDF8',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Public IPv4 of your Hostinger Ubuntu VPS.
                </span>
              </div>

              {/* Field 3: WireGuard VPN IP */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
                  3. WireGuard Tunnel IP
                </label>
                <input
                  type="text"
                  value={newRouterVpnIp}
                  onChange={e => setNewRouterVpnIp(e.target.value)}
                  placeholder={`${cleanSubnet}.2`}
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#38BDF8',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Hub is <code>{vpsHubIp}</code>; Router 1 = <code>{cleanSubnet}.2</code>, Router 2 = <code>{cleanSubnet}.3</code>.
                </span>
              </div>

              {/* Field 4: VPS Port Forward */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
                  4. VPS Forwarding Port (External)
                </label>
                <input
                  type="text"
                  value={newRouterVpsPort}
                  onChange={e => setNewRouterVpsPort(e.target.value)}
                  placeholder="8443"
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#F59E0B',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Sequential port (Router 1 = 8443, Router 2 = 8444, Router 3 = 8445).
                </span>
              </div>

              {/* Field 5: REST API Username */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
                  5. REST API Username
                </label>
                <input
                  type="text"
                  value={apiUsername}
                  onChange={e => setApiUsername(e.target.value)}
                  placeholder="mycollectivesub"
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '9px 12px',
                    color: '#34D399',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Dedicated RouterOS REST API account created in Phase 4.
                </span>
              </div>

              {/* Field 6: REST API User Password */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#CBD5E1' }}>
                    6. REST API Password ({apiUser})
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#38BDF8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    🎲 Generate
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type={showApiPassword ? 'text' : 'password'}
                    value={apiPassword}
                    onChange={e => setApiPassword(e.target.value)}
                    placeholder="Enter password..."
                    style={{
                      flex: 1,
                      background: '#030712',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '9px 12px',
                      color: '#34D399',
                      fontSize: 13,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiPassword(!showApiPassword)}
                    style={{
                      background: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#94A3B8',
                      padding: '9px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    title={showApiPassword ? 'Hide password' : 'Show password'}
                  >
                    {showApiPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Baked directly into Phase 4 Master Config &amp; Locations registration.
                </span>
              </div>
            </div>

            {/* Public Keys */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              background: '#0B0F19',
              border: '1px solid #1E293B',
              borderRadius: 10,
              padding: '14px 16px',
            }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#A78BFA', marginBottom: 4 }}>
                  🔑 Router WireGuard Public Key (44 chars from Phase 1)
                </label>
                <input
                  type="text"
                  value={newRouterPublicKey}
                  onChange={e => setNewRouterPublicKey(e.target.value)}
                  placeholder="Paste the 44-char public-key from WinBox (e.g. CjuD...=)"
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#A78BFA',
                    fontSize: 12.5,
                    fontFamily: 'monospace',
                  }}
                />
                <span style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, display: 'block' }}>
                  Run Phase 1 in WinBox first, copy its <code>public-key</code> here → Phase 2 validates it is 44 chars!
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>
                  🌐 VPS WireGuard Public Key (from /etc/wireguard/server_public.key)
                </label>
                <input
                  type="text"
                  value={vpsPublicKey}
                  onChange={e => setVpsPublicKey(e.target.value)}
                  placeholder="Paste VPS server_public.key..."
                  style={{
                    width: '100%',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#94A3B8',
                    fontSize: 12.5,
                    fontFamily: 'monospace',
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
                  Auto-fills into Phase 3 so your MikroTik connects to <code>{cleanVpsHost}:51820</code>.
                </span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PHASE 1: MIKROTIK - CREATE WIREGUARD INTERFACE         */}
          {/* ═══════════════════════════════════════════════════════ */}
          <CollapsibleSection
            title="Phase 1: Create WireGuard on Router (WinBox Terminal)"
            icon="📡"
            subtitle="Single-line RouterOS command (no \\ prompt hangs) to generate the router's WireGuard key"
            color="#C084FC"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>Open <strong>WinBox</strong> and connect to the new router (via MAC address or <code>192.168.88.1</code>).</li>
                <li>Click <strong>&quot;New Terminal&quot;</strong> in the left sidebar menu.</li>
                <li>Paste the single-line command block below and press <strong>Enter</strong>:</li>
              </ol>
            </div>

            <CopyBlock
              label="📡 MikroTik — Create wg-vps & Output Public Key"
              language="RouterOS Script"
              code={addRouterPhase1Script}
            />

            <GitbookCallout type="tip" title="Do Not Confuse Router Key vs VPS Key">
              Copy the 44-character <code>public-key</code> printed in WinBox (e.g. <code>CjuDBj...=</code>) into
              the <strong>&quot;Router WireGuard Public Key&quot;</strong> box above.
              <strong> Never run Phase 2 with a placeholder string</strong> — Phase 2 verifies it is 44 characters before writing to <code>wg0.conf</code>.
            </GitbookCallout>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PHASE 2: VPS - 1-SHOT ZERO-DOWNTIME REGISTRATION      */}
          {/* ═══════════════════════════════════════════════════════ */}
          <CollapsibleSection
            title="Phase 2: Register on Hostinger VPS (1-Shot SSH Bash Script)"
            icon="🖥️"
            subtitle="Zero downtime + return-path wg0 MASQUERADE + wg0.conf persistence (Ubuntu 26.04 ready)"
            color="#34A853"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>
                  Open your terminal (PowerShell / Terminal) and SSH into your VPS:
                  <div style={{ margin: '6px 0' }}>
                    <code style={{ color: '#4ADE80', background: '#030712', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
                      ssh root@{cleanVpsHost}
                    </code>
                  </div>
                </li>
                <li>
                  Click <strong>📋 Copy</strong> below, paste into your VPS SSH terminal, and press <strong>Enter</strong>.
                </li>
              </ol>
            </div>

            <CopyBlock
              label={`🖥️ VPS 1-Shot Script — Add ${newRouterName || 'New Router'} (Port ${newRouterVpsPort})`}
              language="bash"
              code={addRouterVpsScript}
            />

            <GitbookCallout type="success" title="Return-Path Fix & Zero Downtime Built In">
              Uses <code>wg set wg0 peer</code> so existing routers experience <strong>zero downtime</strong>, applies <code>POSTROUTING -o wg0 -j MASQUERADE</code> so external dashboard connections return through the tunnel cleanly, and persists everything inside <code>wg0.conf</code> (no <code>iptables-persistent</code> needed).
            </GitbookCallout>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PHASE 3: MIKROTIK - CONNECT TO VPS & TEST PING         */}
          {/* ═══════════════════════════════════════════════════════ */}
          <CollapsibleSection
            title="Phase 3: Connect to VPS & Trigger Handshake (WinBox Terminal)"
            icon="🔌"
            subtitle="Single-line commands assign the tunnel IP and force an immediate WireGuard handshake"
            color="#60A5FA"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>Make sure <strong>VPS WireGuard Public Key</strong> above is filled in (not the router&apos;s own key!).</li>
                <li>Go back to <strong>WinBox → New Terminal</strong> on the new router, paste, and press <strong>Enter</strong>:</li>
              </ol>
            </div>

            <CopyBlock
              label={`📡 MikroTik — Connect to ${cleanVpsHost}:51820 & Ping ${vpsHubIp}`}
              language="RouterOS Script"
              code={addRouterPhase3Script}
            />

            <GitbookCallout type="info" title="Why MikroTik Must Ping First">
              Because MikroTik is behind ISP NAT/CGNAT, the VPS cannot initiate to the router until the router sends a packet first. Running <code>/ping {vpsHubIp} count=3</code> from MikroTik brings the handshake up immediately (0% loss = tunnel is LIVE!).
            </GitbookCallout>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PHASE 4: MIKROTIK - MASTER 1-SHOT CONFIG               */}
          {/* ═══════════════════════════════════════════════════════ */}
          <CollapsibleSection
            title="Phase 4: Run Master 1-Shot Config (WinBox Terminal)"
            icon="⚡"
            subtitle="Opens TCP 443 over wg-vps, signs SSL cert, sets NTP/DDNS, and installs watchdog"
            color="#F59E0B"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 14 }}>
              <div style={{
                background: '#0F1E36',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <span style={{ fontSize: 13, color: '#E2E8F0' }}>
                  Pre-configured for user <code style={{ color: '#38BDF8', fontWeight: 700 }}>{apiUser}</code> with password <code style={{ color: '#34D399', fontWeight: 700 }}>{pw}</code>. Wait a few seconds after pasting until you see <code style={{ color: '#4ADE80' }}>progress: done</code>.
                </span>
              </div>

              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>Still in <strong>WinBox → New Terminal</strong> on the new router.</li>
                <li>Click <strong>📋 Copy</strong> below, paste into the terminal, and press <strong>Enter</strong>:</li>
              </ol>
            </div>

            <CopyBlock
              label={`⚡ Master 1-Shot Config for ${newRouterName || 'New Router'} (${apiUser} configured)`}
              language="RouterOS Script"
              code={masterConfigScript}
            />

            <GitbookCallout type="tip" title="Fixes Built Into Phase 4">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>🛡️ <strong>Firewall TCP 443 over WireGuard:</strong> Prevents &quot;ping works, HTTPS times out&quot; caused by MikroTik&apos;s default input drop rule.</li>
                <li>🔐 <strong>Self-Signed SSL Cert (<code>local-cert</code>):</strong> Prevents TLS handshake failures on <code>www-ssl</code>.</li>
                <li>👤 <strong>REST API User:</strong> Creates/updates <code>{apiUser}</code> in group <code>full</code>.</li>
                <li>🔋 <strong>Watchdog ({vpsHubIp}):</strong> Pings the real hub IP and auto-recovers 30–60s after power cuts.</li>
              </ul>
            </GitbookCallout>
          </CollapsibleSection>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PHASE 5: ADMIN DASHBOARD - REGISTER IN FLEET          */}
          {/* ═══════════════════════════════════════════════════════ */}
          <CollapsibleSection
            title="Phase 5: Register in Admin Dashboard (Locations & Fleet)"
            icon="🌐"
            subtitle="Save the new router in Supabase before clicking Test Connection"
            color="#38BDF8"
            defaultOpen={true}
          >
            <div style={{ padding: '0 8px', marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#E2E8F0', lineHeight: 1.6 }}>
                Open <strong>Locations &amp; Fleet</strong> from the left sidebar and click <strong>➕ Add Router</strong> (always <strong>Save</strong> before clicking <strong>Test Connection</strong>). Enter these exact values:
              </p>

              {/* Exact Credentials Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Location / Router Name</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC', marginTop: 4 }}>
                    {newRouterName || `Katsina Hub ${nextRouterNumber}`}
                  </div>
                </div>

                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Host / IP Address</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#38BDF8', marginTop: 4, fontFamily: 'monospace' }}>
                    {cleanVpsHost}
                  </div>
                </div>

                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Port</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B', marginTop: 4, fontFamily: 'monospace' }}>
                    {newRouterVpsPort}
                  </div>
                </div>

                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Username</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC', marginTop: 4, fontFamily: 'monospace' }}>
                    {apiUser}
                  </div>
                </div>

                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>Password</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(pw);
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#34D399',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: 700,
                        padding: 0,
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#34D399', marginTop: 4, fontFamily: 'monospace' }}>
                    {pw}
                  </div>
                </div>

                <div style={{ background: '#030712', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>SSL &amp; Mode</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#A78BFA', marginTop: 4 }}>
                    Use SSL: Yes • Mode: Direct REST
                  </div>
                </div>
              </div>

              {/* Quick Jump Action Button */}
              <div style={{
                marginBottom: 18,
                padding: '14px 18px',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div>
                  <strong style={{ fontSize: 13.5, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🚀 1-Click Fast Register in Locations &amp; Fleet
                  </strong>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94A3B8' }}>
                    Auto-fills {cleanVpsHost}:{newRouterVpsPort}, {apiUser}, and password into the Locations &amp; Fleet registration modal!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isRouterConfigFinished) {
                      const proceed = confirm(
                        '⚠️ Note: You have not pasted the 44-char Router Public Key in Phase 1 yet.\n\nDo you want to proceed to Locations & Fleet anyway?'
                      );
                      if (!proceed) return;
                    }
                    const preset = {
                      id: 'deploy_' + Date.now(),
                      name: newRouterName || `Katsina Hub ${nextRouterNumber}`,
                      vpsHost: cleanVpsHost,
                      vpnSubnet: cleanSubnet,
                      vpnIp: newRouterVpnIp,
                      vpsPort: newRouterVpsPort,
                      apiUsername: apiUser,
                      password: pw,
                      routerPublicKey: newRouterPublicKey,
                      vpsPublicKey: vpsPublicKey,
                      isCompleted: true,
                    };
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('an_selected_import_router', JSON.stringify(preset));
                      localStorage.setItem('an_auto_open_add_router', 'true');
                    }
                    if (onNavigateTab) {
                      onNavigateTab('locations');
                    } else {
                      alert('Router profile saved! Open Locations & Fleet in the left sidebar to add.');
                    }
                  }}
                  style={{
                    background: '#2563EB',
                    border: 'none',
                    borderRadius: 8,
                    color: '#FFFFFF',
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  🚀 Auto-Fill &amp; Open Locations &amp; Fleet
                </button>
              </div>

              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#E2E8F0', lineHeight: 2 }}>
                <li>Click <strong>&quot;Save Router&quot;</strong> first (if you ever see <em>&quot;Failed to save router-specific config&quot;</em> on MikroTik Config after deleting a router, refresh the page <code>F5</code>).</li>
                <li>Click <strong>&quot;Test Connection&quot;</strong> — the status badge turns green: <strong style={{ color: '#4ADE80' }}>● Online (RouterOS 7.x)</strong>.</li>
              </ol>
            </div>
          </CollapsibleSection>

          {/* ── Completion Checklist ── */}
          <div style={{
            background: '#0F172A',
            border: '1px solid #065F46',
            borderRadius: 14,
            padding: '20px 24px',
            marginTop: 10,
          }}>
            <strong style={{ color: '#4ADE80', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span>✅</span> Router Deployment Verification Checklist
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {[
                `WireGuard wg-vps created on router (44-char key copied)`,
                `VPS 1-shot script ran on ${cleanVpsHost} (port ${newRouterVpsPort} + wg0 MASQUERADE)`,
                `Phase 3 ping from MikroTik to hub ${vpsHubIp} succeeded (0% loss)`,
                `Phase 4 firewall rule (TCP 443 over wg-vps) & local-cert applied`,
                `API user "${apiUser}" configured with matching password`,
                `Registered in Locations & Fleet (${cleanVpsHost}:${newRouterVpsPort})`,
                `Test Connection showed green ● Online badge`,
                `Power-cut watchdog verified pinging hub ${vpsHubIp}`,
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: '#E2E8F0',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontSize: 14, color: '#4ADE80' }}>☑</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
