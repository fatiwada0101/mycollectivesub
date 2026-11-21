# MyCollectiveSub — Local Plug & Play Router Connector

Mikroticket-style local onboarding tool: connect your laptop to a brand-new MikroTik router's Wi-Fi/LAN, enter **Router IP + Username + Password**, select your **VPS Hub**, and click **Auto-Configure & Connect Router**.

## How to Run

### Windows (1 Click)
Double-click `Launch-Router-Connector.bat` (or run `npm run connector` from the project root).

### macOS / Linux
```bash
npm run connector
```
Then open `http://127.0.0.1:4782` in your browser.

## What It Applies Automatically (Zero SSH, Zero WinBox)
1. Connects directly to `192.168.88.1` via MikroTik Binary API (`8728`) or REST (`443`/`80`).
2. Sets router identity and synchronizes NTP clock (`Africa/Lagos`).
3. Creates a WireGuard interface (`wg-vps`), reads its public key, and calls your MyCollectiveSub cloud app to auto-register the peer & port on your chosen VPS Hub (no SSH required).
4. Creates a dedicated Cloud API admin user + self-signed TLS certificate + enables `www-ssl` (`443`).
5. Enables **MAC-Cookie Auto-Reconnect** (`login-by=cookie,http-chap,http-pap,mac-cookie`, `http-cookie-lifetime=4w2d`, `add-mac-cookie=yes`, `mac-cookie-timeout=4w2d`, `keepalive-timeout=2m`).
6. Installs **Strict First-Login Wall-Clock Expiry v3** (`# AN voucher expiry v3` on all user profiles + `an-voucher-expiry-v1` 10-second sweep scheduler) so every voucher starts counting on first login and expires on schedule even while offline.
7. Triggers cloud Auto-Setup (Walled Garden, plans, and branded captive portal login page) over the live cloud tunnel.
