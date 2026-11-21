# Zero-Touch MikroTik Onboarding & Expiry — Engineering Knowledge Base

This knowledge base captures the proven architecture, protocol details, security boundaries, and lessons learned so any engineer or AI agent working on MyCollectiveSub (or a future ISP platform) can maintain or extend the system without regressions.

---

## 1. How Mikroticket-Style Local Onboarding Actually Works

A cloud web app (Vercel / browser) cannot connect directly to a brand-new MikroTik router at `192.168.88.1` for three reasons:
1. **CGNAT / Private LAN:** The router sits on a local private subnet behind MTN/Airtel/Starlink NAT with no public IP.
2. **Browser Security Policies:** HTTPS origins cannot make insecure HTTP or self-signed HTTPS calls to private RFC1918 IPs (`Private Network Access` + `Mixed Content` + `CORS`).
3. **Factory-Default Services:** Out of the box, MikroTik RouterOS has Binary API (`8728`) and HTTP (`80`) enabled, while HTTPS REST (`443` `www-ssl`) has no SSL certificate configured yet.

**How Local Onboarding solves all three:**
- A **local connector process** (desktop app, local Node connector, or native mobile APK) runs on a device connected directly to the MikroTik router's Wi-Fi or LAN.
- It connects to `192.168.88.1:8728` (Binary API) or `:80`/`:443` (REST API) using only the **IP + username + password** provided by the admin.
- It enables HTTPS REST (`www-ssl` with a self-signed certificate), creates a dedicated API user, generates a **WireGuard** interface (`wg-vps`), reads the router's newly generated WireGuard public key, and calls the cloud backend.
- The cloud backend calls the selected **VPS Hub Provisioner API** over HTTPS (zero SSH!) to register that WireGuard public key + assign a unique tunnel IP (`10.100.0.X`) and port (`8443+`).
- The local connector finishes pushing the WireGuard peer, NTP clock sync, Hotspot + MAC-cookie auto-reconnect, strict First-Login Wall-Clock Expiry v3 (`on-login` + 10s sweep), walled garden, and watchdog.
- Within ~10–15 seconds, the WireGuard tunnel is up and the cloud app manages the router globally from anywhere in the world.

---

## 2. RouterOS Binary API Wire Protocol (`lib/routeros-api.js`)

Used by the Local Connector when talking to factory-default routers over port `8728` (or TLS `8729`):

- **Word Framing:** Every API token ("word") is prefixed by a variable-length big-endian integer:
  - `len < 0x80` → 1 byte `[len]`
  - `len < 0x4000` → 2 bytes `[(len >> 8) | 0x80, len & 0xff]`
  - `len < 0x200000` → 3 bytes `[(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]`
  - `len < 0x10000000` → 4 bytes `[(len >> 24) | 0xe0, ...]`
  - `len >= 0x10000000` → 5 bytes `[0xf0, ...4 bytes]`
- **Sentence Framing:** A list of words terminated by a single zero-length word (`0x00`).
- **Authentication (RouterOS 6.43+ & all v7):** Single sentence `/login`, `=name=<user>`, `=password=<pass>` → returns `!done` (or `!trap` on bad credentials).
- **Replies:** `!re` (data rows with `=key=value` attributes), `!done` (end of reply), `!trap` (command error), `!fatal` (disconnect).

---

## 3. VPS WireGuard Provisioner Design (`vps-provisioner/`)

### Why `wg set` Instead of `systemctl restart wg-quick@wg0`
Restarting `wg-quick@wg0` disconnects every other MikroTik router currently connected to that VPS! Instead, our provisioner:
1. Applies the new peer **live in memory** via `wg set <iface> peer <pubkey> allowed-ips <tunnelIp>/32` — **0ms interruption** to existing routers.
2. Appends/updates the `[Peer]` block in `/etc/wireguard/<iface>.conf` so it survives VPS reboots.
3. Adds idempotent `iptables` DNAT (`PREROUTING -p tcp --dport <extPort> -j DNAT --to-destination <tunnelIp>:443`) + `FORWARD` allow + `ufw allow <extPort>/tcp` + persists rules with `netfilter-persistent save`.

### Multi-VPS Scaling
- Each Ubuntu VPS runs one instance of `vps-provisioner/server.mjs` and is registered once in Supabase `public.vps_hubs`.
- Typical safe capacity per KVM VPS: `250` routers per `/24` WireGuard subnet (`10.100.0.2`–`10.100.0.254`, ports `8443`–`8695`).
- Adding a 2nd VPS automatically gives another 250+ router capacity with zero SSH per router.

---

## 4. Default Voucher Expiry & MAC-Cookie Invariants (Mandatory on Every Router)

Every newly onboarded router MUST enforce all 6 invariants out of the box (full spec in [MikroTik_First_Login_Expiry_and_MAC_Cookie_Guide.pdf](../MikroTik_First_Login_Expiry_and_MAC_Cookie_Guide.pdf)):

1. **Unused Stock Never Expires Before First Login:** Router comment `ANV1|<seconds>|0|<note>` and DB `expiry_policy='first_login'`, `activated_at=NULL`, `expires_at=NULL`.
2. **Strict Wall-Clock Cutoff Online OR Offline:** `FIRST_LOGIN_SCRIPT` (`# AN voucher expiry v3`) locks `deadline = now + seconds` on first authentication; `EXPIRY_SWEEP_SCRIPT` (`an-voucher-expiry-v1`) runs every `10s` from startup and disables expired users, kicks active sessions, and deletes `/ip/hotspot/cookie` entries even while clients are offline.
3. **Auto-Coverage of Legacy & Manual Vouchers:** v3 `on-login` automatically reads `limit-uptime` (`[:typeof $anLim] = "time"` → `[:tonsec $anLim] / 1000000000`) for any non-`ANV1|` voucher and converts it to strict wall-clock expiry on first login.
4. **Unlimited Account Safety:** Users with no `limit-uptime` and no `ANV1|` comment (`admin`, `default-trial`) are skipped and never disabled.
5. **Seamless Wi-Fi Off/On Reconnect:** Server profiles carry `login-by=cookie,http-chap,http-pap,mac-cookie` + `http-cookie-lifetime=4w2d`; all user profiles carry `add-mac-cookie=true`, `mac-cookie-timeout=4w2d`, `keepalive-timeout=2m`.
6. **Zero Loopholes on Admin Kick & Logout:** Manual kicks call `removeHotspotCookiesForUsers()`; logout forms submit `erase-cookie=true`.

---

## 5. Security Checklist

- **VPS Secrets:** `vps_hubs.api_secret` is stored server-side only (RLS blocks `anon` & `authenticated`). GET endpoints return `api_secret_masked` and `has_secret: true` — never raw secrets.
- **Bootstrap Tokens:** Single-use 256-bit random tokens, stored hashed (`SHA-256`) with 15-minute TTL (`bootstrap_expires_at`), immediately invalidated after `POST /api/onboarding/bootstrap` completes.
- **Input Validation:** WireGuard public keys must match `/^[A-Za-z0-9+/]{43}=$/`; IPv4 addresses and ports are strictly validated before passing to `execFileSync` (never shell string interpolation — prevents command injection on the VPS!).
- **No Shell Injection:** `vps-provisioner/server.mjs` uses `execFileSync(bin, argsArray)` exclusively (no `execSync` shell interpolation).

---

## 6. Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| Local Connector cannot reach `192.168.88.1:8728` | Laptop isn't on the router's Wi-Fi/LAN, or `/ip service api` is disabled | Connect to router Wi-Fi/LAN; Local Connector automatically falls back to REST `:443`/`:80` |
| WireGuard tunnel shows no handshake | UDP `51820` blocked on VPS firewall, or wrong VPS Public Key | Run `GET /health` from Super Admin VPS Hubs panel to verify VPS key & firewall |
| Router onboarded but vouchers won't activate | Router NTP clock not yet synchronized (`status != synchronized`) | Verify router has WAN internet access and NTP servers `216.239.35.0,1.1.1.1` are reachable |
| Client still asked for PIN after Wi-Fi toggle | Client logged in *before* `add-mac-cookie=yes`, or phone randomizes MAC per connection | One fresh login mints the MAC cookie (RouterOS `/ip/hotspot/cookie` is read-only) |
