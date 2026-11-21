# Implementation Plan — Zero-Touch MikroTik Onboarding & Multi-VPS Auto-Provisioner

## 1. Objective & Design Principles

Upgrade MyCollectiveSub so adding a brand-new MikroTik router (even behind MTN/Airtel/Starlink CGNAT) or registering a brand-new VPS requires **zero SSH commands, zero manual WinBox script edits, and zero manual expiry setup**, while maintaining **zero regression** across all existing routers, payments, vouchers, and tests.

### Non-Negotiable Engineering Invariants
1. **Default Strict First-Login Wall-Clock Expiry Everywhere:** Every router onboarded through this system automatically enables `# AN voucher expiry v3` on **all** hotspot user profiles and schedules `an-voucher-expiry-v1` every `10s` at startup, so vouchers start counting on first login and strictly expire whether online or offline.
2. **Default Seamless MAC-Cookie Auto-Reconnect:** Every hotspot server profile gets `login-by=cookie,http-chap,http-pap,mac-cookie` + `http-cookie-lifetime=4w2d`, and every user profile gets `add-mac-cookie=true`, `mac-cookie-timeout=4w2d`, `keepalive-timeout=2m`.
3. **Never Touch Unlimited Accounts:** System accounts without `limit-uptime` (`admin`, `default-trial`) are never modified or disabled.
4. **Security First:**
   - RLS enabled on every new Supabase table (`vps_hubs`).
   - VPS `api_secret` never returned in plaintext to browsers; router bootstrap tokens stored only as SHA-256 hashes with 15-minute expiry and single-use consumption.
   - Constant-time secret comparisons (`crypto.timingSafeEqual`).
   - Zero additions to `app/super-admin/page.js` (modular components only).

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  LOCAL WIFI / LAN (Standing next to brand-new MikroTik 192.168.88.1)      │
│                                                                            │
│   ┌─────────────────────────────────────────┐                              │
│   │  Local Router Connector (Desktop/Phone) │  Binary API :8728 / REST :443│
│   │  User enters ONLY: IP + User + Password │ ───────────────────────────► │
│   └───────────────────┬─────────────────────┘       MikroTik RouterOS 7+   │
│                       │ HTTPS (Admin JWT)             1. Enable SSL/REST   │
│                       ▼                               2. Create wg-vps     │
│   ┌─────────────────────────────────────────┐         3. Set NTP + Clock   │
│   │  MyCollectiveSub Cloud (Next.js/Vercel) │         4. Hotspot + MAC     │
│   │  - /api/super-admin/vps-hubs            │         5. Expiry v3 + 10s   │
│   │  - /api/super-admin/routers/onboard     │         6. Walled Garden     │
│   │  - /api/onboarding/bootstrap            │         7. Watchdog          │
│   └───────────────────┬─────────────────────┘                  │           │
│                       │ HTTPS Bearer API (Zero SSH)            │ WireGuard │
│                       ▼                                        │ UDP 51820 │
│   ┌─────────────────────────────────────────┐                  │           │
│   │  VPS Hub (1..N Ubuntu VPS Nodes)        │ ◄────────────────┘           │
│   │  vps-provisioner/server.mjs (:9443)     │                              │
│   │  - wg set wg0 peer <pubkey> allowed-ips │                              │
│   │  - iptables DNAT :8443+ -> 10.100.0.X   │                              │
│   │  - Persists wg0.conf + netfilter rules  │                              │
│   └─────────────────────────────────────────┘                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Breakdown

### 3.1 Database Layer (`supabase/migrations/20261121000001_zero_touch_vps_hubs.sql`)
- **`public.vps_hubs`** table: stores multiple VPS endpoints (`name`, `public_ip`, `provisioner_url`, `api_secret`, `wg_interface`, `wg_port`, `wg_public_key`, `wg_subnet`, `port_range_start`, `port_range_end`, `is_active`, `is_default`, `status`, `last_health_at`).
- **`public.routers` extensions** (`ADD COLUMN IF NOT EXISTS`): `vps_hub_id`, `wg_tunnel_ip`, `wg_public_key`, `onboarding_status`, `bootstrap_token_hash`, `bootstrap_expires_at`.
- **RLS Policies:** Row Level Security enabled on `vps_hubs`; `service_role` full access; `anon` and `authenticated` revoked.
- **RPC `allocate_vps_router_slot(p_vps_hub_id UUID)`:** Locks the VPS hub row (`FOR UPDATE`), scans existing `routers` assigned to that hub (or same `public_ip`), and returns the next free `(tunnel_ip, external_port)` inside the hub's subnet & port range.

### 3.2 VPS WireGuard Auto-Provisioner (`vps-provisioner/`)
- **`server.mjs`:** Pure Node.js HTTP/HTTPS server requiring zero `npm install`:
  - `GET /health`: returns `{ ok, wgInterface, wgPort, wgPublicKey, wgSubnet, peerCount, uptimeSec }`.
  - `GET /api/peers`: lists active peers and last handshake timestamps.
  - `POST /api/peers/register`: validates WireGuard base64 44-char public key, IPv4 tunnel address, and port (`1024..65535`); applies `wg set` live without restarting `wg0` (zero disruption to other connected routers!), updates `/etc/wireguard/wg0.conf` idempotently, installs `iptables` `PREROUTING DNAT` + `FORWARD` rules + `ufw allow`, and persists rules.
  - `POST /api/peers/remove`: cleanly removes peer from live `wg0`, config file, and `iptables`.
  - `DRY_RUN=1` support for automated testing on non-Linux hosts.
- **`install.sh`:** One-command bootstrap for any fresh Ubuntu 22.04/24.04 VPS (Hostinger, DigitalOcean, Hetzner, Vultr, etc.). Installs WireGuard + Node 20 + systemd unit + firewall, generates keys & `API_SECRET`, and outputs the exact values to paste once in Super Admin.

### 3.3 Cloud Multi-VPS & Zero-Touch APIs
- **`lib/vps-hub.js`:**
  - `testVpsHubConnection(hub)` — calls `/health` and captures `wg_public_key`.
  - `allocateRouterSlot(vpsHub)` — computes next available `(tunnelIp, externalPort)` checking DB records & avoiding collisions (fallback when RPC isn't yet applied).
  - `registerRouterPeerOnVps(vpsHub, { publicKey, tunnelIp, externalPort, routerName })` — calls VPS `/api/peers/register`.
  - `removeRouterPeerFromVps(vpsHub, { publicKey, tunnelIp, externalPort })` — cleans up VPS on router deletion.
- **`lib/zero-touch-onboarding.js`:**
  - `generateZeroTouchRouterScript(opts)` — produces a safe, idempotent RouterOS v7.12+ script configuring: dedicated API user, SSL cert + `www-ssl`, WireGuard `wg-vps` + peer + firewall allow, NTP clock sync (`Africa/Lagos`), Hotspot server + server profiles (`mac-cookie`, `4w2d`), user profiles (`add-mac-cookie=yes`, `4w2d`, `2m`), verbatim `# AN voucher expiry v3` + `an-voucher-expiry-v1` 10s scheduler, power-cut watchdog, and optional cloud completion callback.
- **Routes:**
  - `app/api/super-admin/vps-hubs/route.js` — CRUD + live `/health` probe & auto-sync of `wg_public_key`.
  - `app/api/super-admin/routers/onboard/route.js` — handles both **Local Connector onboarding** (takes router's WireGuard public key, auto-registers on VPS, saves router to `routers`, returns final RouterOS config & triggers cloud post-setup) and **Cloud 1-Line Bootstrap generation** (creates 15-min single-use hashed token).
  - `app/api/onboarding/bootstrap/route.js` — `GET` serves the personalized `.rsc` script for a valid token; `POST` receives the router's newly generated WireGuard public key from `/tool fetch`, registers it on the VPS hub automatically, activates the router record, and clears the single-use token.

### 3.4 Pure-Node RouterOS Local Client & Plug-and-Play Connector (`lib/routeros-api.js` + `router-connector/`)
- **`lib/routeros-api.js`:**
  - Implements MikroTik RouterOS Binary API wire protocol (word length encoding 1–5 bytes, sentence framing, `!re` / `!done` / `!trap` parsing, RouterOS 6.43+/7.x login over TCP `8728` and TLS `8729`) plus automatic fallback to RouterOS REST API (`https :443` / `http :80`).
  - Exposes `connectLocalRouter({ host, username, password })` and high-level `onboardLocalRouter(...)` which runs the full 8-step Mikroticket-style sequence directly from the user's laptop/device over the router's Wi-Fi!
- **`router-connector/`:**
  - `server.mjs` + `index.html` + `Launch-Router-Connector.bat` — launches locally on `http://127.0.0.1:4782`, authenticates with your MyCollectiveSub cloud Super Admin, lets you pick a VPS Hub, enter `Router IP + Username + Password + Name`, and runs live end-to-end onboarding with step-by-step streaming status.

### 3.5 Modular Super Admin UI (`app/super-admin/components/ZeroTouchHubPanel.js`)
- Mounted cleanly inside `LocationsTab.js` (zero edits to `app/super-admin/page.js`).
- Two tabs inside the panel:
  1. **VPS Hubs (Multi-VPS):** Add/test/remove VPS hubs, copy 1-command Ubuntu installer, view live WG public key and status.
  2. **Zero-Touch Router Onboarding:** Choose **Local Plug & Play Connector** instructions/launch OR generate a **1-Line Router Bootstrap** command with strict First-Login Expiry v3 + MAC-Cookie Auto-Reconnect enabled by default.

---

## 4. Verification & Zero-Regression Plan

1. **Automated Unit & Integration Suite (`test/zero-touch-onboarding.test.mjs`):**
   - RouterOS Binary API word-length encoder/decoder across all 5 byte-length boundaries (`<128`, `<16384`, `<2097152`, etc.) + full mock TCP server login & command execution test.
   - VPS Provisioner HTTP server (`DRY_RUN=1`) tests: auth rejection (401), `/health`, `/api/peers/register` validation & dry-run success, `/api/peers/remove`.
   - Conflict-free tunnel IP + port slot allocator tests (skips existing routers, handles custom subnets/port ranges, rejects exhausted ranges cleanly).
   - Zero-touch RouterOS script tests: verifies WireGuard peer, NTP, `mac-cookie`, `4w2d`, `# AN voucher expiry v3`, `an-voucher-expiry-v1` 10s scheduler, `admin` protection, and callback URL.
   - SQL migration test in PGlite: verifies idempotency (running twice succeeds) and RLS enabled on `vps_hubs`.
2. **Existing Regression Suites:** `npm test` (all 31 feature tests + 54+ unit tests + new zero-touch tests) and `npm run build` (all Next.js routes compiling cleanly with zero TypeScript/build errors).
