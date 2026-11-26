#!/usr/bin/env bash
# ==============================================================================
# MyCollectiveSub — 1-Command Zero-SSH VPS WireGuard Hub Installer
# Run ONCE on any fresh Ubuntu 22.04 / 24.04 VPS (Hostinger, DigitalOcean, etc.)
# After this finishes, paste the printed URL + API Secret into Super Admin ->
# Locations & Fleet -> VPS Hubs. You will NEVER need SSH to add routers again.
# ==============================================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo bash install.sh)"
  exit 1
fi

INSTALL_DIR="/opt/mycollectivesub-provisioner"
WG_IFACE="${WG_INTERFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.100.0.0/16}"
WG_HUB_IP="${WG_HUB_IP:-10.100.0.1/16}"
PORT_RANGE_START="${PORT_RANGE_START:-8443}"
PORT_RANGE_END="${PORT_RANGE_END:-18442}"
API_PORT="${PROVISIONER_PORT:-9443}"
PUBLIC_IP="$(curl -4 -fsSL https://api.ipify.org || hostname -I | awk '{print $1}')"
WAN_IFACE="$(ip route show default | awk '/default/ {print $5; exit}')"

echo "=== Installing MyCollectiveSub Zero-SSH VPS Hub on ${PUBLIC_IP} (WAN: ${WAN_IFACE}) ==="

# 1. System packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard wireguard-tools iptables-persistent ufw curl openssl ca-certificates

# 2. Install Node.js 20 LTS if missing
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 3. Enable IPv4 forwarding & scale conntrack for 1,000+ concurrent router tunnels
sysctl -w net.ipv4.ip_forward=1
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -w net.netfilter.nf_conntrack_max=262144 2>/dev/null || true
grep -q '^net.netfilter.nf_conntrack_max=' /etc/sysctl.conf || echo 'net.netfilter.nf_conntrack_max=262144' >> /etc/sysctl.conf

# 4. Initialize WireGuard hub (idempotent — preserves existing keys & peers!)
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard
if [[ -f "/etc/wireguard/${WG_IFACE}.conf" ]]; then
  EXISTING_PRIV="$(grep -E '^[[:space:]]*PrivateKey[[:space:]]*=' "/etc/wireguard/${WG_IFACE}.conf" | head -n1 | sed 's/^[^=]*=[[:space:]]*//' | tr -d '[:space:]' || true)"
  if [[ -n "${EXISTING_PRIV}" ]]; then
    umask 077
    printf '%s\n' "${EXISTING_PRIV}" > /etc/wireguard/server_private.key
    printf '%s\n' "${EXISTING_PRIV}" | wg pubkey > /etc/wireguard/server_public.key
  fi
fi
if [[ ! -f /etc/wireguard/server_private.key ]]; then
  umask 077
  wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
fi
SERVER_PRIV="$(cat /etc/wireguard/server_private.key)"
SERVER_PUB="$(wg show "${WG_IFACE}" public-key 2>/dev/null || cat /etc/wireguard/server_public.key)"

if [[ ! -f "/etc/wireguard/${WG_IFACE}.conf" ]]; then
  cat <<EOF > "/etc/wireguard/${WG_IFACE}.conf"
[Interface]
Address = ${WG_HUB_IP}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
PostUp = iptables -A FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${WAN_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${WAN_IFACE} -j MASQUERADE
EOF
  chmod 600 "/etc/wireguard/${WG_IFACE}.conf"
fi

systemctl enable "wg-quick@${WG_IFACE}"
systemctl is-active --quiet "wg-quick@${WG_IFACE}" || systemctl start "wg-quick@${WG_IFACE}"

# 5. Install provisioner server & generate self-signed TLS cert + API secret
mkdir -p "${INSTALL_DIR}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/server.mjs" ]]; then
  cp "${SCRIPT_DIR}/server.mjs" "${INSTALL_DIR}/server.mjs"
else
  echo "ERROR: server.mjs not found alongside install.sh. Copy vps-provisioner/server.mjs first."
  exit 1
fi

if [[ ! -f "${INSTALL_DIR}/api.secret" ]]; then
  umask 077
  openssl rand -hex 32 > "${INSTALL_DIR}/api.secret"
fi
API_SECRET="$(cat "${INSTALL_DIR}/api.secret")"

if [[ ! -f "${INSTALL_DIR}/tls.crt" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${INSTALL_DIR}/tls.key" \
    -out "${INSTALL_DIR}/tls.crt" \
    -days 3650 \
    -subj "/CN=${PUBLIC_IP}" \
    -addext "subjectAltName=IP:${PUBLIC_IP}"
  chmod 600 "${INSTALL_DIR}/tls.key"
fi

# 6. Create systemd service
cat <<EOF > /etc/systemd/system/mycollectivesub-vps-provisioner.service
[Unit]
Description=MyCollectiveSub Zero-SSH WireGuard Provisioner API
After=network-online.target wg-quick@${WG_IFACE}.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
Environment=PROVISIONER_PORT=${API_PORT}
Environment=PROVISIONER_API_SECRET=${API_SECRET}
Environment=VPS_PUBLIC_IP=${PUBLIC_IP}
Environment=WG_INTERFACE=${WG_IFACE}
Environment=WG_PORT=${WG_PORT}
Environment=WG_SUBNET=${WG_SUBNET}
Environment=WG_CONF_PATH=/etc/wireguard/${WG_IFACE}.conf
Environment=WG_PUBLIC_KEY_PATH=/etc/wireguard/server_public.key
Environment=TLS_CERT_PATH=${INSTALL_DIR}/tls.crt
Environment=TLS_KEY_PATH=${INSTALL_DIR}/tls.key
Environment=SKIP_PER_PORT_UFW=1
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mycollectivesub-vps-provisioner
systemctl restart mycollectivesub-vps-provisioner

# 7. Firewall rules (10,000 router forwarding ports open in a single UFW range rule)
ufw allow 22/tcp
ufw allow "${WG_PORT}/udp"
ufw allow "${API_PORT}/tcp"
ufw allow "${PORT_RANGE_START}:${PORT_RANGE_END}/tcp"
ufw --force enable

echo ""
echo "=============================================================================="
echo "  MyCollectiveSub Zero-SSH VPS Hub Installed Successfully!"
echo "=============================================================================="
echo "  Paste these values ONCE into Super Admin -> Locations & Fleet -> VPS Hubs:"
echo ""
echo "  Public IP       : ${PUBLIC_IP}"
echo "  Provisioner URL : https://${PUBLIC_IP}:${API_PORT}"
echo "  API Secret      : ${API_SECRET}"
echo "  WG Public Key   : ${SERVER_PUB}"
echo "  WG Port         : ${WG_PORT}"
echo "  WG Subnet       : ${WG_SUBNET}"
echo "=============================================================================="
