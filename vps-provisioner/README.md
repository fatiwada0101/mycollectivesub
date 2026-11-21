# MyCollectiveSub — Zero-SSH VPS WireGuard Provisioner

Run this tiny, zero-dependency Node.js daemon **once** on any Ubuntu 22.04 / 24.04 VPS (Hostinger, DigitalOcean, Hetzner, Vultr, etc.). After installing it once and pasting its URL + API Secret into **Super Admin → Locations & Fleet → VPS Hubs**, you will **never need SSH** to add or remove MikroTik routers again.

## Quick Install on Any Fresh or Existing VPS

Copy `vps-provisioner/server.mjs` and `vps-provisioner/install.sh` to the VPS and run:

```bash
sudo bash install.sh
```

> **Safe on existing WireGuard hubs:** `install.sh` checks for existing `/etc/wireguard/server_private.key` and `/etc/wireguard/wg0.conf` before creating anything, so running it on an already-active Hostinger VPS preserves your existing WireGuard keys and connected routers (e.g., `Sabon Layi`) with zero downtime.

## Registering Additional VPS Nodes (Multi-VPS)

1. Run `sudo bash install.sh` on VPS #2 (optionally setting `WG_SUBNET=10.101.0.0/24`).
2. Copy the printed **Public IP**, **Provisioner URL**, and **API Secret**.
3. Open **Super Admin → Locations & Fleet → VPS Hubs** → **Add VPS Hub** → click **Test & Save**.
4. The cloud dashboard automatically fetches the VPS WireGuard public key via `/health`. Every new router assigned to that VPS will auto-register its tunnel peer and forwarding port with zero SSH.

## Local Dry-Run Testing (No Root Required)

```bash
DRY_RUN=1 PROVISIONER_API_SECRET=test-secret node vps-provisioner/server.mjs
```
