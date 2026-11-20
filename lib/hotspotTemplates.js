/**
 * Hotspot Login Page Templates — 5 Beautiful Responsive Designs + Factory Default + Companion Pages
 * Each template produces a standalone HTML string with embedded CSS,
 * strictly optimized to <= 3600 bytes (< 4096 bytes RouterOS script limit).
 *
 * MikroTik variables used:
 *   $(link-login-only)    — form action URL
 *   $(link-orig)          — original destination
 *   $(link-orig-esc)      — URL-encoded original destination
 *   $(link-login-only-esc)— URL-encoded login URL
 *   $(mac)                — client MAC
 *   $(ip)                 — client IP
 *   $(error)              — error message (empty if none)
 *   $(username)           — last entered username
 *   $(if error)…$(endif)  — conditional error block
 *   $(link-redirect)      — destination after login
 *   $(uptime)             — connection duration
 *   $(session-time-left)  — remaining session time
 *   $(bytes-in-nice)      — uploaded traffic
 *   $(bytes-out-nice)     — downloaded traffic
 *   $(link-logout)        — logout URL
 */

// ─── TEMPLATE REGISTRY ──────────────────────────────────────
export const TEMPLATE_REGISTRY = [
  {
    id: 'mycollective-blue',
    name: 'My Collective Blue',
    emoji: '🌐',
    description: 'Signature crisp light-blue MYCOLLECTIVESUB portal with flyer plan cards, inline SVG logo & WhatsApp support bar',
    thumbnailCss: 'background: linear-gradient(155deg, #f4f9ff 0%, #dceeff 55%, #0088ff 100%);',
    accentColor: '#0088ff',
  },
  {
    id: 'midnight-glass',
    name: 'Midnight Glass',
    emoji: '🌙',
    description: 'Dark glassmorphism with frosted card, purple glow orbs, and gradient accents',
    thumbnailCss: 'background: linear-gradient(135deg, #0f0a1e 0%, #1a1035 50%, #2d1b69 100%);',
    accentColor: '#7c3aed',
  },
  {
    id: 'sunrise-gradient',
    name: 'Sunrise Gradient',
    emoji: '🌅',
    description: 'Warm orange-to-pink gradient, white clean card, soft shadows',
    thumbnailCss: 'background: linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%);',
    accentColor: '#f97316',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    emoji: '🌊',
    description: 'Cool teal-blue waves, rounded card, aqua gradient accents',
    thumbnailCss: 'background: linear-gradient(135deg, #0d9488 0%, #0ea5e9 50%, #6366f1 100%);',
    accentColor: '#0ea5e9',
  },
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    emoji: '⚡',
    description: 'Electric dark background, neon green-cyan borders, cyberpunk aesthetic',
    thumbnailCss: 'background: linear-gradient(135deg, #0a0a0a 0%, #0d1117 50%, #1a1a2e 100%);',
    accentColor: '#00ff88',
  },
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    emoji: '✨',
    description: 'Ultra-clean white card, soft gradient, Apple-inspired simplicity',
    thumbnailCss: 'background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);',
    accentColor: '#3b82f6',
  },
  {
    id: 'factory-default',
    name: 'MikroTik Factory Default',
    emoji: '📟',
    description: 'Clean standard MikroTik RouterOS factory login page with simple username & password form',
    thumbnailCss: 'background: #ECE9D8; border: 1px solid #7A7A7A;',
    accentColor: '#4b5563',
  },
];

// ─── SHARED HELPERS ──────────────────────────────────────────

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildLogoHtml(logoUrl) {
  if (!logoUrl) return '';
  return `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:50px;height:50px;object-fit:contain;border-radius:12px;margin:0 auto 10px;display:block" onerror="this.style.display='none'">`;
}

function buildFooterHtml(contactFooter, color = '#71717a') {
  if (!contactFooter) return '';
  return `<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,0.15);font-size:11px;color:${color};text-align:center">${escapeHtml(contactFooter)}</div>`;
}

export function getDefaultBuyUrl() {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/packages`;
  }
  return 'https://www.mycollectivesub.si/packages';
}

/**
 * Inline onsubmit handler for captive portal forms.
 * CRITICAL: This must be inline on the <form> element, NOT in an external <script> block,
 * because iOS CNA, Android restricted WebViews, and Samsung/Xiaomi captive portal browsers
 * often do NOT execute external <script> blocks. Inline event handlers are far more reliable.
 */
function buildFormOnSubmit() {
  return `onsubmit="var b=this.querySelector('button[type=submit]');if(b){b.disabled=true;b.textContent='Connecting...';}"`;
}

function buildScript() {
  return `<script>
try{var c=document.getElementById('code');
var q=new URLSearchParams(location.search).get('code')||new URLSearchParams(location.search).get('username');if(q&&c){c.value=q;}
}catch(e){}
</script>`;
}

function buildMeta(title) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>`;
}

function buildCollectiveSvg() {
  return `<svg class="logo-svg" viewBox="0 0 100 88" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="38" cy="14" r="6" fill="#062b66"/><path d="M77 27C66 13 42 12 27 25C19 32 17 42 21 49" stroke="#062b66" stroke-width="10" stroke-linecap="round"/><circle cx="67" cy="64" r="6" fill="#0095ff"/><path d="M22 52C29 70 53 77 73 66C77 64 80 61 82 57" stroke="#0095ff" stroke-width="10" stroke-linecap="round"/><path d="M19 46l6 5M22 51l5 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M36 42a22 22 0 0 1 32 0" stroke="#0095ff" stroke-width="4.5" stroke-linecap="round"/><path d="M41 48a15 15 0 0 1 22 0" stroke="#045ec4" stroke-width="4.5" stroke-linecap="round"/><path d="M46 54a8 8 0 0 1 12 0" stroke="#062b66" stroke-width="4.5" stroke-linecap="round"/><circle cx="52" cy="60" r="3.2" fill="#0088ff"/></svg>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 0 (DEFAULT): MY COLLECTIVE BLUE (Flyer Signature)
// ═══════════════════════════════════════════════════════════════
export function generateMyCollectiveBlueTemplate(opts = {}) {
  const accent = opts.primaryColor || '#0088ff';
  const navy = '#062b66';
  const rawName = (opts.businessName || opts.wifiSsid || 'MYCOLLECTIVESUB').trim();
  const isCollective = !rawName || /collective/i.test(rawName);
  const buy = opts.buyUrl || getDefaultBuyUrl();
  const buyHref = `${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)`;
  const logoHtml = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="Logo" class="logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span style="display:none">${buildCollectiveSvg()}</span>`
    : buildCollectiveSvg();
  const brandHtml = isCollective
    ? `<span style="color:${navy}">MYCOLLECTIVE</span><span style="color:#0095ff">SUB</span>`
    : `<span style="color:${navy}">${escapeHtml(rawName)}</span>`;
  const customFooter = (opts.contactFooter || '').trim();
  const hasDefaultNumbers = !customFooter || (customFooter.includes('08123725673') && customFooter.includes('08038107462'));
  const contactHtml = hasDefaultNumbers
    ? `<a class="ci" href="tel:08123725673"><span class="ph">&#9742;</span>08123725673</a><span class="dv">|</span><a class="ci" href="https://wa.me/2348038107462"><span class="wa">WhatsApp</span>08038107462</a>`
    : `<span class="ct-txt">${escapeHtml(customFooter)}</span>`;
  const calSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${navy}" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18" stroke-linecap="round"/><circle cx="8" cy="14" r="1" fill="${navy}"/><circle cx="12" cy="14" r="1" fill="${navy}"/><circle cx="16" cy="14" r="1" fill="${navy}"/><circle cx="8" cy="18" r="1" fill="${navy}"/><circle cx="12" cy="18" r="1" fill="${navy}"/></svg>`;

  return `${buildMeta(rawName || 'MYCOLLECTIVESUB')}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(160deg,#f7fbff 0%,#e6f2ff 55%,#d5ebff 100%);color:${navy};font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:14px;position:relative;overflow-x:hidden}
body::before{content:"";position:fixed;top:-60px;left:-60px;width:190px;height:190px;background:linear-gradient(135deg,${navy},#0095ff);border-radius:0 0 140px 0;opacity:.9;z-index:0}
body::after{content:"";position:fixed;bottom:-70px;right:-60px;width:210px;height:140px;background:linear-gradient(135deg,#0095ff,${navy});border-radius:120px 0 0 0;opacity:.85;z-index:0}
.wr{width:100%;max-width:460px;position:relative;z-index:1;text-align:center}
.hd{padding:4px 8px 10px}
.logo-svg,.logo-img{width:62px;height:56px;margin:0 auto 4px;display:block;object-fit:contain}
.bm{font-size:21px;font-weight:900;letter-spacing:.3px;line-height:1.1}
.ds{display:flex;align-items:center;justify-content:center;gap:8px;margin:4px 0 3px;font-size:12px;font-weight:700;color:${navy}}
.ds span{height:1.5px;width:44px;background:#7cb7ef}
.tg{font-size:11px;font-weight:600;color:#1e4079;margin-bottom:10px}
.ban{display:inline-flex;align-items:center;gap:9px;background:linear-gradient(90deg,#032d74,${accent});color:#fff;padding:5px 18px 5px 6px;border-radius:999px;font-size:14px;font-weight:800;box-shadow:0 6px 16px rgba(0,115,230,.24);margin-bottom:12px}
.bw{width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center}
.cd{background:rgba(255,255,255,.96);border:1.5px solid #cfe5ff;border-radius:20px;padding:16px;box-shadow:0 12px 28px rgba(6,43,102,.09);margin-bottom:12px}
.er{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:10px}
.lb{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;color:#3b5d94;margin-bottom:5px;text-align:left}
input{width:100%;padding:11px 12px;font-size:17px;font-weight:800;background:#f4f9ff;border:1.5px solid #bdd9fa;border-radius:12px;color:${navy};text-align:center;letter-spacing:2.5px;outline:none;font-family:monospace;text-transform:uppercase}
input:focus{border-color:${accent};box-shadow:0 0 0 3px rgba(0,136,255,.16);background:#fff}
.bt{width:100%;padding:12px;margin-top:10px;font-size:14px;font-weight:800;background:linear-gradient(90deg,${navy},${accent});color:#fff;border:none;border-radius:12px;cursor:pointer;box-shadow:0 6px 16px rgba(0,115,230,.25)}
.bt:active{transform:scale(.98)}
.by{display:block;margin-top:9px;padding:9px;background:#eef6ff;border:1px solid #bfdbfe;border-radius:11px;color:#035ec8;font-size:12px;font-weight:800;text-decoration:none}
.pg{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
@media(min-width:460px){.pg{grid-template-columns:repeat(4,1fr)}}
.pc{background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d5e8ff;box-shadow:0 6px 16px rgba(6,43,102,.08);text-decoration:none;display:flex;flex-direction:column;justify-content:space-between}
.pt{padding:9px 6px 6px}
.pi{width:24px;height:24px;margin:0 auto 3px}
.pl{font-size:14px;font-weight:900;color:${navy};line-height:1.15}
.pw{background:linear-gradient(180deg,#0099ff,#0354b8);padding:7px 6px 8px;border-radius:40% 40% 0 0/12px 12px 0 0}
.ps{font-size:10px;font-weight:700;color:#fff;margin-bottom:4px;line-height:1}
.pp{display:inline-block;background:#fff;color:${navy};font-size:14px;font-weight:900;padding:3px 12px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.fm{display:inline-block;background:linear-gradient(90deg,${navy},${accent});color:#fff;font-size:10px;font-weight:800;padding:4px 16px;border-radius:999px;letter-spacing:.3px;margin-bottom:6px}
.ft{background:rgba(255,255,255,.94);border:1px solid #cfe5ff;border-radius:999px;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(6,43,102,.07)}
.ci{display:inline-flex;align-items:center;gap:5px;color:${navy};font-size:12px;font-weight:800;text-decoration:none}
.ph{width:19px;height:19px;border-radius:50%;background:${navy};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px}
.wa{background:#16a34a;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:999px}
.dv{color:#94a3b8;font-size:12px}
.ct-txt{font-size:11px;font-weight:700;color:${navy}}
.in{margin-top:8px;font-size:10px;color:#5b7399}
</style></head><body>
<div class="wr">
<div class="hd">
${logoHtml}
<div class="bm">${brandHtml}</div>
<div class="ds"><span></span><em>Digital Services</em><span></span></div>
<div class="tg">Connecting People. Connecting Possibilities.</div>
<div class="ban"><span class="bw"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="19.5" r="1.2" fill="${accent}"/></svg></span><span>Wi-Fi / Data Subscription</span></div>
</div>
<div class="cd">
$(if error)<div class="er">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="ENTER VOUCHER CODE" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">Connect to Internet</button>
</form>
<a class="by" href="${buyHref}">&#128722; Buy a Data Plan Online &rarr;</a>
</div>
<div class="pg">
<a class="pc" href="${buyHref}"><div class="pt"><div class="pi"><svg viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"><path d="M3 10a13 13 0 0 1 18 0"/><path d="M7 14a8 8 0 0 1 10 0"/><path d="M10.5 17.5a3 3 0 0 1 3 0"/><circle cx="12" cy="20" r="1" fill="${accent}"/></svg></div><div class="pl" style="font-size:17px">1GB</div></div><div class="pw"><div class="ps">24 Hours</div><span class="pp">N100</span></div></a>
<a class="pc" href="${buyHref}"><div class="pt"><div class="pi"><svg viewBox="0 0 24 24" fill="none" stroke="${navy}" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9.5 3h5" stroke-linecap="round"/></svg></div><div class="pl">12 Hours</div></div><div class="pw"><span class="pp">N250</span></div></a>
<a class="pc" href="${buyHref}"><div class="pt"><div class="pi">${calSvg}</div><div class="pl">3 Days</div></div><div class="pw"><span class="pp">N800</span></div></a>
<a class="pc" href="${buyHref}"><div class="pt"><div class="pi">${calSvg}</div><div class="pl">7 Days</div></div><div class="pw"><span class="pp">N2,000</span></div></a>
</div>
<div><div class="fm">For More Information</div></div>
<div class="ft">${contactHtml}</div>
<div class="in">MAC: $(mac) &bull; IP: $(ip)</div>
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 1: MIDNIGHT GLASS
// ═══════════════════════════════════════════════════════════════
export function generateMidnightGlassTemplate(opts = {}) {
  const accent = opts.primaryColor || '#7c3aed';
  const name = opts.businessName || opts.wifiSsid || 'African Network Wi-Fi';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `${buildMeta(name)}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f0a1e;color:#e4e4e7;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;position:relative}
body::before{content:"";position:absolute;width:220px;height:220px;background:radial-gradient(circle,rgba(124,58,237,0.27),transparent 70%);top:-40px;right:-20px;border-radius:50%;animation:fl 8s infinite}
body::after{content:"";position:absolute;width:150px;height:150px;background:radial-gradient(circle,rgba(236,72,153,0.27),transparent 70%);bottom:-20px;left:-20px;border-radius:50%;animation:fl 6s infinite reverse}
@keyframes fl{50%{transform:translateY(-18px)}}
.cd{width:100%;max-width:380px;background:rgba(255,255,255,0.06);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:28px 20px;box-shadow:0 16px 36px rgba(0,0,0,0.5);position:relative;z-index:1;text-align:center}
.ic{width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,${accent},${accent}88);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:22px}
h1{font-size:19px;font-weight:800;color:#fff;margin-bottom:4px}
.sb{font-size:12px;color:#a1a1aa;margin-bottom:14px}
.er{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;padding:8px 10px;border-radius:12px;font-size:12px;margin-bottom:12px}
.lb{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;margin-bottom:6px;text-align:left}
input{width:100%;padding:12px;font-size:17px;font-weight:800;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.14);border-radius:14px;color:#fff;text-align:center;letter-spacing:2.5px;outline:none;font-family:monospace;text-transform:uppercase}
input:focus{border-color:${accent};box-shadow:0 0 0 3px rgba(124,58,237,0.2)}
.bt{width:100%;padding:13px;margin-top:12px;font-size:14px;font-weight:800;background:linear-gradient(135deg,${accent},${accent}dd);color:#fff;border:none;border-radius:14px;cursor:pointer}
.bt:active{transform:scale(0.98)}
.by{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1)}
.by a{display:block;color:#c4b5fd;font-size:12px;font-weight:700;text-decoration:none;padding:9px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:12px}
.in{margin-top:10px;font-size:10px;color:#52525b}
</style></head><body>
<div class="cd">
${buildLogoHtml(opts.logoUrl)}
<div class="ic">&#9889;</div>
<h1>${escapeHtml(name)}</h1>
<p class="sb">Enter your voucher code to connect</p>
$(if error)<div class="er">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="12345" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">&#9889; Connect to Internet</button>
</form>
<div class="by"><a href="${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)">&#128722; Buy a Data Plan &rarr;</a></div>
<div class="in">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(opts.contactFooter)}
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 2: SUNRISE GRADIENT
// ═══════════════════════════════════════════════════════════════
export function generateSunriseGradientTemplate(opts = {}) {
  const accent = opts.primaryColor || '#f97316';
  const name = opts.businessName || opts.wifiSsid || 'African Network Wi-Fi';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `${buildMeta(name)}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(135deg,#fef3c7 0%,#fdba74 40%,${accent} 80%,#ec4899 100%);font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.cd{width:100%;max-width:380px;background:#fff;border-radius:24px;padding:32px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.15);text-align:center}
.ic{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,${accent},#ec4899);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;box-shadow:0 6px 18px rgba(249,115,22,0.35)}
h1{font-size:20px;font-weight:800;color:#1e293b;margin-bottom:4px}
.sb{font-size:12px;color:#64748b;margin-bottom:18px}
.er{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px;border-radius:12px;font-size:12px;margin-bottom:14px}
.lb{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px;text-align:left}
input{width:100%;padding:13px;font-size:18px;font-weight:800;background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;color:#1e293b;text-align:center;letter-spacing:2.5px;outline:none;font-family:monospace;text-transform:uppercase}
input:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}22}
.bt{width:100%;padding:14px;margin-top:14px;font-size:14px;font-weight:800;background:linear-gradient(135deg,${accent},#ea580c);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 18px rgba(249,115,22,0.35)}
.bt:active{transform:scale(0.98)}
.by{margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9}
.by a{display:flex;align-items:center;justify-content:center;gap:6px;color:${accent};font-size:12px;font-weight:700;text-decoration:none;padding:10px;background:${accent}0d;border:1px solid #e2e8f0;border-radius:12px}
.in{margin-top:12px;font-size:10px;color:#94a3b8}
</style></head><body>
<div class="cd">
${buildLogoHtml(opts.logoUrl)}
<div class="ic">&#9728;&#65039;</div>
<h1>${escapeHtml(name)}</h1>
<p class="sb">Enter your voucher code to connect</p>
$(if error)<div class="er">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="12345" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">&#9728;&#65039; Connect to Internet</button>
</form>
<div class="by"><a href="${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)">&#128722; Buy a Data Plan &rarr;</a></div>
<div class="in">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(opts.contactFooter, '#94a3b8')}
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 3: OCEAN BREEZE
// ═══════════════════════════════════════════════════════════════
export function generateOceanBreezeTemplate(opts = {}) {
  const accent = opts.primaryColor || '#0ea5e9';
  const name = opts.businessName || opts.wifiSsid || 'African Network Wi-Fi';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `${buildMeta(name)}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(160deg,#0c4a6e 0%,#0369a1 40%,${accent} 80%,#06b6d4 100%);font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.cd{width:100%;max-width:380px;background:rgba(255,255,255,0.12);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:24px;padding:30px 22px;box-shadow:0 20px 50px rgba(0,0,0,0.25);text-align:center}
.ic{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,${accent},#06b6d4);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:24px;box-shadow:0 8px 24px rgba(14,165,233,0.4)}
h1{font-size:20px;font-weight:800;color:#fff;margin-bottom:4px}
.sb{font-size:12px;color:#bae6fd;margin-bottom:18px}
.er{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;padding:10px;border-radius:12px;font-size:12px;margin-bottom:14px}
.lb{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#e0f2fe;margin-bottom:8px;text-align:left}
input{width:100%;padding:13px;font-size:18px;font-weight:800;background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.2);border-radius:14px;color:#fff;text-align:center;letter-spacing:2.5px;outline:none;font-family:monospace}
input:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,0.3)}
.bt{width:100%;padding:14px;margin-top:14px;font-size:14px;font-weight:800;background:linear-gradient(135deg,${accent},#0284c7);color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 18px rgba(14,165,233,0.4)}
.bt:active{transform:scale(0.98)}
.by{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.14)}
.by a{display:flex;align-items:center;justify-content:center;gap:6px;color:#e0f2fe;font-size:12px;font-weight:700;text-decoration:none;padding:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:12px}
.in{margin-top:12px;font-size:10px;color:#bae6fd}
</style></head><body>
<div class="cd">
${buildLogoHtml(opts.logoUrl)}
<div class="ic">&#127754;</div>
<h1>${escapeHtml(name)}</h1>
<p class="sb">Enter your voucher code to connect</p>
$(if error)<div class="er">&#9888; $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="12345" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">&#127754; Connect to Internet</button>
</form>
<div class="by"><a href="${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)">&#128722; Buy a Data Plan &rarr;</a></div>
<div class="in">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(opts.contactFooter, '#bae6fd')}
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 4: NEON PULSE
// ═══════════════════════════════════════════════════════════════
export function generateNeonPulseTemplate(opts = {}) {
  const accent = opts.primaryColor || '#00ff88';
  const name = opts.businessName || opts.wifiSsid || 'African Network Wi-Fi';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `${buildMeta(name)}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#eee;font-family:monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.cd{width:100%;max-width:380px;background:#111;border:1.5px solid rgba(0,255,0,0.4);border-radius:8px;padding:30px 22px;box-shadow:0 0 30px rgba(0,255,0,0.08);text-align:center}
.ic{width:50px;height:50px;border:2px solid ${accent};border-radius:6px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:${accent};box-shadow:0 0 16px rgba(0,255,0,0.2)}
h1{font-size:18px;font-weight:700;color:${accent};margin-bottom:4px;letter-spacing:2px;text-transform:uppercase}
.sb{font-size:11px;color:#777;margin-bottom:18px;letter-spacing:1px}
.er{background:rgba(255,0,0,0.08);border:1px solid rgba(255,0,0,0.33);color:#ff6b6b;padding:10px;border-radius:4px;font-size:11px;margin-bottom:14px}
.lb{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:6px;text-align:left}
input{width:100%;padding:12px;font-size:18px;font-weight:700;background:#050505;border:1.5px solid #333;border-radius:4px;color:${accent};text-align:center;letter-spacing:3px;outline:none;font-family:monospace}
input:focus{border-color:${accent};box-shadow:0 0 14px rgba(0,255,0,0.2)}
.bt{width:100%;padding:13px;margin-top:14px;font-size:13px;font-weight:700;background:transparent;color:${accent};border:1.5px solid ${accent};border-radius:4px;cursor:pointer;letter-spacing:1px;text-transform:uppercase}
.bt:hover{background:${accent};color:#000}
.by{margin-top:16px;padding-top:14px;border-top:1px solid #222}
.by a{display:flex;align-items:center;justify-content:center;gap:6px;color:${accent};font-size:11px;font-weight:700;text-decoration:none;padding:10px;border:1px dashed rgba(0,255,0,0.27);border-radius:4px}
.in{margin-top:12px;font-size:9px;color:#444;letter-spacing:1px}
</style></head><body>
<div class="cd">
${buildLogoHtml(opts.logoUrl)}
<div class="ic">&#9889;</div>
<h1>${escapeHtml(name)}</h1>
<p class="sb">// ENTER ACCESS CODE //</p>
$(if error)<div class="er">[!] $(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">&gt; Access Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="12345" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">[CONNECT] &gt;&gt;</button>
</form>
<div class="by"><a href="${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)">&#128722; Buy Plan &rarr;</a></div>
<div class="in">MAC: $(mac) // IP: $(ip)</div>
${buildFooterHtml(opts.contactFooter, '#555')}
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 5: CLEAN MINIMAL
// ═══════════════════════════════════════════════════════════════
export function generateCleanMinimalTemplate(opts = {}) {
  const accent = opts.primaryColor || '#3b82f6';
  const name = opts.businessName || opts.wifiSsid || 'African Network Wi-Fi';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `${buildMeta(name)}<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:linear-gradient(160deg,#f8fafc 0%,#e2e8f0 100%);font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.cd{width:100%;max-width:380px;background:#fff;border-radius:24px;padding:34px 24px;box-shadow:0 10px 40px rgba(0,0,0,0.06);text-align:center}
.ic{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,${accent},${accent}cc);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px;color:#fff;box-shadow:0 4px 14px ${accent}33}
h1{font-size:21px;font-weight:700;color:#0f172a;margin-bottom:4px}
.sb{font-size:13px;color:#64748b;margin-bottom:20px}
.er{background:#fef2f2;border:1px solid #fee2e2;color:#dc2626;padding:10px;border-radius:12px;font-size:12px;margin-bottom:14px}
.lb{display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:8px;text-align:left}
input{width:100%;padding:13px;font-size:18px;font-weight:700;background:#f8fafc;border:2px solid #e2e8f0;border-radius:14px;color:#0f172a;text-align:center;letter-spacing:2.5px;outline:none;font-family:monospace;text-transform:uppercase}
input:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}22}
.bt{width:100%;padding:14px;margin-top:14px;font-size:14px;font-weight:700;background:${accent};color:#fff;border:none;border-radius:14px;cursor:pointer;box-shadow:0 3px 12px ${accent}33}
.bt:active{transform:scale(0.98)}
.by{margin-top:18px;padding-top:14px;border-top:1px solid #f1f5f9}
.by a{display:flex;align-items:center;justify-content:center;gap:6px;color:${accent};font-size:12px;font-weight:700;text-decoration:none;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px}
.in{margin-top:12px;font-size:10px;color:#94a3b8}
</style></head><body>
<div class="cd">
${buildLogoHtml(opts.logoUrl)}
<div class="ic">&#128246;</div>
<h1>${escapeHtml(name)}</h1>
<p class="sb">Enter your voucher code to connect</p>
$(if error)<div class="er">$(error)</div>$(endif)
<form name="login" action="$(link-login-only)" method="post" ${buildFormOnSubmit()}>
<input type="hidden" name="dst" value="$(link-orig)">
<input type="hidden" name="popup" value="true">
<label class="lb">Voucher Code</label>
<input type="text" id="code" name="username" value="$(username)" placeholder="12345" autofocus required autocomplete="off">
<input type="hidden" name="password" id="pass" value="">
<button type="submit" class="bt">Connect to Internet</button>
</form>
<div class="by"><a href="${buy}?mac=$(mac)&ip=$(ip)&router=$(identity)&server=$(server-name)&link-login-only=$(link-login-only-esc)&link-orig=$(link-orig-esc)">&#128722; Buy a Data Plan &rarr;</a></div>
<div class="in">MAC: $(mac) &bull; IP: $(ip)</div>
${buildFooterHtml(opts.contactFooter, '#94a3b8')}
</div>
${buildScript()}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 6: FACTORY DEFAULT
// ═══════════════════════════════════════════════════════════════
export function generateFactoryDefaultTemplate(opts = {}) {
  const name = opts.businessName || opts.wifiSsid || 'Internet Hotspot';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(name)} - Log in</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;background:#ECE9D8;margin:0;padding:30px 16px;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}
.bx{background:#FFF;border:1px solid #7A7A7A;box-shadow:2px 2px 10px rgba(0,0,0,0.15);padding:20px 24px;width:100%;max-width:360px;text-align:center;border-radius:4px}
h2{font-size:16px;color:#333;margin:0 0 14px;font-weight:700}
.er{color:#C00;background:#FFF0F0;border:1px solid #FCC;padding:6px;margin-bottom:12px;font-size:11px;border-radius:3px}
table{margin:0 auto 14px;border-collapse:collapse}
td{padding:5px 4px;font-size:12px}
td.l{text-align:right;font-weight:700;color:#444}
input[type="text"],input[type="password"]{border:1px solid #7F9DB9;padding:6px 8px;font-size:13px;width:170px;border-radius:2px}
.bt{background:linear-gradient(to bottom,#FAFAFA,#E1E1E1);border:1px solid #707070;color:#000;font-size:12px;font-weight:700;padding:6px 18px;cursor:pointer;border-radius:3px}
.in{margin-top:16px;font-size:10px;color:#777;border-top:1px solid #E5E5E5;padding-top:10px}
</style></head><body>
<div class="bx">
<h2>${escapeHtml(name)}</h2>
$(if error)<div class="er">$(error)</div>$(endif)
<form name="sendin" action="$(link-login-only)" method="post">
<input type="hidden" name="username" /><input type="hidden" name="password" /><input type="hidden" name="dst" value="$(link-orig)" /><input type="hidden" name="popup" value="true" />
</form>
<form name="login" action="$(link-login-only)" method="post" onsubmit="if(!this.password.value&&this.username.value){this.password.value=this.username.value.trim();}">
<input type="hidden" name="dst" value="$(link-orig)" /><input type="hidden" name="popup" value="true" />
<table>
<tr><td class="l">Voucher:</td><td><input type="text" name="username" value="$(username)" autofocus autocomplete="off" /></td></tr>
<tr><td class="l">Password:</td><td><input type="password" name="password" autocomplete="off" /></td></tr>
<tr><td></td><td><input type="submit" class="bt" value="Log In" /></td></tr>
</table>
</form>
<div class="in">IP: $(ip) &bull; MAC: $(mac)</div>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// COMPANION TEMPLATE: alogin.html (Post-Login Redirect)
// Prevents 404 after login success
// ═══════════════════════════════════════════════════════════════
export function generateHotspotAloginHtml(opts = {}) {
  const name = opts.businessName || opts.wifiSsid || 'My Collective Sub Wi-Fi';
  const isLight = !opts.templateId || opts.templateId === 'mycollective-blue' || opts.templateId === 'clean-minimal';
  const accent = opts.primaryColor || (isLight ? '#0088ff' : '#7c3aed');
  const bg = isLight ? 'linear-gradient(160deg,#f5faff,#dceeff)' : '#0f0a1e';
  const cardBg = isLight ? '#fff' : 'rgba(255,255,255,0.06)';
  const bd = isLight ? '#cfe5ff' : 'rgba(255,255,255,0.12)';
  const fg = isLight ? '#062b66' : '#fff';
  const sub = isLight ? '#475569' : '#a1a1aa';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected - ${escapeHtml(name)}</title>
<meta http-equiv="refresh" content="2; url=$(link-redirect)">
<style>
body{background:${bg};color:${fg};font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}
.cd{background:${cardBg};border:1px solid ${bd};border-radius:24px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 12px 30px rgba(6,43,102,0.1)}
.ic{font-size:36px;margin-bottom:12px}
h1{font-size:20px;font-weight:800;margin-bottom:6px}
p{font-size:12px;color:${sub};margin-bottom:20px}
a{display:inline-block;padding:12px 24px;background:${accent};color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px}
</style></head><body>
<div class="cd">
<div class="ic">&#127881;</div>
<h1>Connected to Internet</h1>
<p>Your session is active. Redirecting you to the web...</p>
<a href="$(link-redirect)">Continue Browsing &rarr;</a>
</div>
<script>setTimeout(function(){location.href='$(link-redirect)';},1500);</script>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// COMPANION TEMPLATE: status.html (Connected Dashboard upon Refresh)
// Prevents 404 when refresh occurs on authenticated devices
// ═══════════════════════════════════════════════════════════════
export function generateHotspotStatusHtml(opts = {}) {
  const name = opts.businessName || opts.wifiSsid || 'My Collective Sub Wi-Fi';
  const isLight = !opts.templateId || opts.templateId === 'mycollective-blue' || opts.templateId === 'clean-minimal';
  const accent = opts.primaryColor || (isLight ? '#0088ff' : '#7c3aed');
  const bg = isLight ? 'linear-gradient(160deg,#f5faff,#dceeff)' : '#0f0a1e';
  const cardBg = isLight ? '#fff' : 'rgba(255,255,255,0.06)';
  const bd = isLight ? '#cfe5ff' : 'rgba(255,255,255,0.12)';
  const fg = isLight ? '#062b66' : '#fff';
  const rowFg = isLight ? '#475569' : '#d4d4d8';
  const rowBd = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)';
  const outBg = isLight ? '#fef2f2' : 'rgba(239,68,68,0.13)';
  const outFg = isLight ? '#dc2626' : '#fca5a5';
  const outBd = isLight ? '#fecaca' : 'rgba(239,68,68,0.27)';
  const buy = opts.buyUrl || getDefaultBuyUrl();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Status - ${escapeHtml(name)}</title>
<style>
body{background:${bg};color:${fg};font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}
.cd{background:${cardBg};border:1px solid ${bd};border-radius:24px;padding:28px 22px;max-width:380px;width:100%;box-shadow:0 12px 30px rgba(6,43,102,0.1)}
.ic{font-size:32px;margin-bottom:8px}
h1{font-size:18px;font-weight:800;margin-bottom:4px}
.st{display:inline-block;background:rgba(16,185,129,0.13);color:#059669;border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;margin-bottom:14px}
table{width:100%;margin:10px 0;font-size:12px;border-collapse:collapse;color:${rowFg}}
td{padding:7px 4px;border-bottom:1px solid ${rowBd};text-align:left}
td:last-child{text-align:right;font-weight:700;color:${fg}}
.bt{display:block;width:100%;padding:12px;margin-top:12px;border-radius:12px;text-decoration:none;font-weight:700;font-size:12px;border:none;cursor:pointer}
.bt-out{background:${outBg};color:${outFg};border:1px solid ${outBd}}
.bt-by{background:${accent};color:#fff;margin-top:8px}
</style></head><body>
<div class="cd">
<div class="ic">&#128246;</div>
<h1>${escapeHtml(name)}</h1>
<div class="st">&#9679; Connected &amp; Online</div>
<table>
<tr><td>Voucher / User</td><td>$(username)</td></tr>
<tr><td>IP Address</td><td>$(ip)</td></tr>
<tr><td>Connected Time</td><td>$(uptime)</td></tr>
$(if session-time-left)<tr><td>Time Remaining</td><td>$(session-time-left)</td></tr>$(endif)
<tr><td>Downloaded</td><td>$(bytes-out-nice)</td></tr>
<tr><td>Uploaded</td><td>$(bytes-in-nice)</td></tr>
</table>
<form action="$(link-logout)" name="logout">
<input type="hidden" name="erase-cookie" value="true">
<button type="submit" class="bt bt-out">&#128682; Disconnect / Log Out</button>
</form>
<a href="${buy}" class="bt bt-by">&#128722; Buy More Data &rarr;</a>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// COMPANION TEMPLATE: logout.html (Logged Out Page)
// Prevents 404 after disconnection
// ═══════════════════════════════════════════════════════════════
export function generateHotspotLogoutHtml(opts = {}) {
  const name = opts.businessName || opts.wifiSsid || 'My Collective Sub Wi-Fi';
  const isLight = !opts.templateId || opts.templateId === 'mycollective-blue' || opts.templateId === 'clean-minimal';
  const accent = opts.primaryColor || (isLight ? '#0088ff' : '#7c3aed');
  const bg = isLight ? 'linear-gradient(160deg,#f5faff,#dceeff)' : '#0f0a1e';
  const cardBg = isLight ? '#fff' : 'rgba(255,255,255,0.06)';
  const bd = isLight ? '#cfe5ff' : 'rgba(255,255,255,0.12)';
  const fg = isLight ? '#062b66' : '#fff';
  const sub = isLight ? '#475569' : '#a1a1aa';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logged Out - ${escapeHtml(name)}</title>
<style>
body{background:${bg};color:${fg};font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}
.cd{background:${cardBg};border:1px solid ${bd};border-radius:24px;padding:32px 24px;max-width:380px;width:100%;box-shadow:0 12px 30px rgba(6,43,102,0.1)}
.ic{font-size:36px;margin-bottom:10px}
h1{font-size:18px;font-weight:800;margin-bottom:6px}
p{font-size:12px;color:${sub};margin-bottom:18px}
a{display:inline-block;padding:12px 24px;background:${accent};color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:13px}
</style></head><body>
<div class="cd">
<div class="ic">&#128274;</div>
<h1>Logged Out</h1>
<p>You have been disconnected from the Wi-Fi hotspot.</p>
<a href="$(link-login)">Log In Again &rarr;</a>
</div>
</body></html>`;
}

// ─── TEMPLATE ROUTER ─────────────────────────────────────────
/**
 * Generate hotspot login HTML for a given template.
 * @param {string} templateId — one of the TEMPLATE_REGISTRY ids
 * @param {object} opts — { wifiSsid, buyUrl, businessName, logoUrl, contactFooter, primaryColor }
 * @returns {string} Complete standalone HTML
 */
export function getTemplateGenerator(templateId) {
  switch (templateId) {
    case 'factory-default':  return generateFactoryDefaultTemplate;
    case 'sunrise-gradient': return generateSunriseGradientTemplate;
    case 'ocean-breeze':     return generateOceanBreezeTemplate;
    case 'neon-pulse':       return generateNeonPulseTemplate;
    case 'clean-minimal':    return generateCleanMinimalTemplate;
    case 'midnight-glass':   return generateMidnightGlassTemplate;
    case 'mycollective-blue':
    default:                 return generateMyCollectiveBlueTemplate;
  }
}
