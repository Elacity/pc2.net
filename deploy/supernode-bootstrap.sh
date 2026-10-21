#!/bin/bash
#
# PC2 Supernode Bootstrap Script
#
# Sets up a complete PC2 supernode on a fresh Ubuntu VPS.
# Installs and configures: Boson DHT, IPFS Relay, WireGuard, AmneziaWG,
# VLESS Reality, Web Gateway, App Registry, Nginx, SSL, Firewall.
#
# Usage:
#   curl -sL https://ela.city/supernode.sh | bash -s -- --domain mysupernode.example.com
#   OR
#   ./supernode-bootstrap.sh --domain mysupernode.example.com [--region EU] [--name "My Supernode"]
#
# Requirements:
#   - Ubuntu 22.04+ (x86_64)
#   - Root access
#   - Public IPv4 address
#   - 4+ CPU cores, 8+ GB RAM, 50+ GB disk
#   - Ports 80, 443, 8090, 8443, 39001, 51820, 51821 available
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SUPERNODE_DIR="/root/pc2"
DATA_DIR="${SUPERNODE_DIR}/data"
LOG_FILE="/var/log/pc2-supernode-bootstrap.log"

# Known bootstrap supernodes for initial sync
BOOTSTRAP_SUPERNODES=(
  "https://69.164.241.210"
  "https://38.242.211.112"
)

# Minimum requirements
MIN_CORES=4
MIN_RAM_GB=8
MIN_DISK_GB=50

# WireGuard subnet — each supernode gets a unique /16
# The bootstrap script auto-assigns based on available range
WG_PORT=51820
AWG_PORT=51821
VLESS_PORT=8443
BOSON_PORT=39001
PROXY_PORT=8090

# Parse arguments
DOMAIN=""
REGION="unknown"
SN_NAME=""
SUPERNODE_SECRET=""
SKIP_SPEC_CHECK=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --name) SN_NAME="$2"; shift 2 ;;
    --secret) SUPERNODE_SECRET="$2"; shift 2 ;;
    --skip-spec-check) SKIP_SPEC_CHECK=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ============================================================================
# Logging
# ============================================================================

exec > >(tee -a "$LOG_FILE") 2>&1

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_ok() { log "OK: $*"; }
log_warn() { log "WARN: $*"; }
log_err() { log "ERROR: $*"; }
log_step() { echo ""; log "=== STEP: $* ==="; }

# ============================================================================
# Step 0: Pre-flight checks
# ============================================================================

log_step "Pre-flight checks"

if [[ $EUID -ne 0 ]]; then
  log_err "This script must be run as root"
  exit 1
fi

# Detect OS
if [[ ! -f /etc/os-release ]]; then
  log_err "Cannot detect OS — /etc/os-release missing"
  exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]] && [[ "$ID" != "debian" ]]; then
  log_err "This script requires Ubuntu or Debian (found: $ID)"
  exit 1
fi

UBUNTU_MAJOR="${VERSION_ID%%.*}"
if [[ "$UBUNTU_MAJOR" -lt 22 ]] && [[ "$ID" == "ubuntu" ]]; then
  log_warn "Ubuntu 22.04+ recommended (found: $VERSION_ID)"
fi

ARCH=$(uname -m)
if [[ "$ARCH" != "x86_64" ]]; then
  log_err "x86_64 required (found: $ARCH). ARM support coming soon."
  exit 1
fi

# Detect public IP
PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --max-time 5 https://ifconfig.me 2>/dev/null || echo "")
if [[ -z "$PUBLIC_IP" ]]; then
  log_err "Cannot detect public IP. Ensure this VPS has internet access."
  exit 1
fi
log_ok "Public IP: $PUBLIC_IP"

if [[ -z "$SN_NAME" ]]; then
  SN_NAME="Supernode-${PUBLIC_IP}"
fi

# System specs
CPU_CORES=$(nproc)
RAM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo)
DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')

log "System: ${CPU_CORES} cores, ${RAM_GB} GB RAM, ${DISK_GB} GB free disk"

if [[ "$SKIP_SPEC_CHECK" != "true" ]]; then
  SPEC_PASS=true
  if [[ "$CPU_CORES" -lt "$MIN_CORES" ]]; then
    log_warn "CPU cores ($CPU_CORES) below minimum ($MIN_CORES)"
    SPEC_PASS=false
  fi
  if [[ "$RAM_GB" -lt "$MIN_RAM_GB" ]]; then
    log_warn "RAM (${RAM_GB}GB) below minimum (${MIN_RAM_GB}GB)"
    SPEC_PASS=false
  fi
  if [[ "$DISK_GB" -lt "$MIN_DISK_GB" ]]; then
    log_warn "Disk (${DISK_GB}GB free) below minimum (${MIN_DISK_GB}GB)"
    SPEC_PASS=false
  fi
  if [[ "$SPEC_PASS" == "false" ]]; then
    log_err "System does not meet minimum requirements. Use --skip-spec-check to override."
    exit 1
  fi
  log_ok "System meets minimum requirements"
fi

# ============================================================================
# Step 1: Install system dependencies
# ============================================================================

log_step "Installing system dependencies"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq \
  curl wget git build-essential \
  ufw nginx certbot python3-certbot-nginx \
  jq wireguard-tools \
  openjdk-17-jre-headless \
  > /dev/null 2>&1

# Install Node.js 20.x if not present
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 18 ]]; then
  log "Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
log_ok "Node.js $(node -v)"

# Install Go 1.21+ for AmneziaWG compilation
GO_VERSION="1.21.13"
if ! command -v go &>/dev/null || [[ $(go version | grep -oP '\d+\.\d+' | head -1) < "1.21" ]]; then
  log "Installing Go ${GO_VERSION}..."
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  export PATH="/usr/local/go/bin:$PATH"
  echo 'export PATH="/usr/local/go/bin:$PATH"' >> /root/.bashrc
fi
log_ok "Go $(go version | awk '{print $3}')"

# Create directory structure
mkdir -p "$SUPERNODE_DIR"/{data,web-gateway,ipfs-relay,boson,app-registry}
mkdir -p "$DATA_DIR"

# ============================================================================
# Step 2: Generate node identity
# ============================================================================

log_step "Generating supernode identity"

# Generate Ed25519 keypair for Boson identity
IDENTITY_FILE="${SUPERNODE_DIR}/data/supernode-identity.json"
if [[ ! -f "$IDENTITY_FILE" ]]; then
  NODE_ID=$(openssl rand -hex 32)
  cat > "$IDENTITY_FILE" << EOF
{
  "nodeId": "${NODE_ID}",
  "publicIP": "${PUBLIC_IP}",
  "name": "${SN_NAME}",
  "region": "${REGION}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  log_ok "Generated identity: ${NODE_ID:0:16}..."
else
  NODE_ID=$(jq -r '.nodeId' "$IDENTITY_FILE")
  log_ok "Using existing identity: ${NODE_ID:0:16}..."
fi

# ============================================================================
# Step 3: Configure firewall
# ============================================================================

log_step "Configuring firewall"

ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null 2>&1
ufw default allow outgoing > /dev/null 2>&1
ufw allow 22/tcp comment 'SSH' > /dev/null 2>&1
ufw allow 80/tcp comment 'HTTP' > /dev/null 2>&1
ufw allow 443/tcp comment 'HTTPS' > /dev/null 2>&1
ufw allow ${WG_PORT}/udp comment 'WireGuard' > /dev/null 2>&1
ufw allow ${AWG_PORT}/udp comment 'AmneziaWG' > /dev/null 2>&1
ufw allow ${VLESS_PORT}/tcp comment 'VLESS Reality' > /dev/null 2>&1
ufw allow ${BOSON_PORT}/udp comment 'Boson DHT' > /dev/null 2>&1
ufw allow ${PROXY_PORT}/tcp comment 'Active Proxy' > /dev/null 2>&1
ufw allow 4003/tcp comment 'IPFS Relay TCP' > /dev/null 2>&1
ufw allow 4004/tcp comment 'IPFS Relay WS' > /dev/null 2>&1
ufw allow 4500/tcp comment 'App Registry' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

log_ok "Firewall configured ($(ufw status | grep -c ALLOW) rules)"

# ============================================================================
# Step 4: Enable IP forwarding
# ============================================================================

log_step "Enabling IP forwarding"

sysctl -w net.ipv4.ip_forward=1 > /dev/null 2>&1
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
log_ok "IP forwarding enabled"

# ============================================================================
# Step 5: Setup WireGuard
# ============================================================================

log_step "Setting up WireGuard"

WG_DIR="/etc/wireguard"
WG_INTERFACE="wg0"
WG_SUBNET="10.100.0.0/16"
WG_SERVER_IP="10.100.0.1"

# Allocate unique subnet based on node identity hash
# Each supernode gets a different /16 to avoid IP conflicts
SUBNET_OCTET=$(( $(echo -n "$PUBLIC_IP" | md5sum | cut -c1-4 | xargs -I{} printf '%d' 0x{}) % 200 + 2 ))
WG_SUBNET="10.${SUBNET_OCTET}.0.0/16"
WG_SERVER_IP="10.${SUBNET_OCTET}.0.1"

if [[ ! -f "${WG_DIR}/wg-private.key" ]]; then
  wg genkey | tee "${WG_DIR}/wg-private.key" | wg pubkey > "${WG_DIR}/wg-public.key"
  chmod 600 "${WG_DIR}/wg-private.key"
fi

WG_PRIVATE_KEY=$(cat "${WG_DIR}/wg-private.key")
WG_PUBLIC_KEY=$(cat "${WG_DIR}/wg-public.key")

DEFAULT_IFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)

cat > "${WG_DIR}/${WG_INTERFACE}.conf" << EOF
[Interface]
Address = ${WG_SERVER_IP}/16
ListenPort = ${WG_PORT}
PrivateKey = ${WG_PRIVATE_KEY}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
EOF

systemctl enable wg-quick@${WG_INTERFACE} > /dev/null 2>&1
systemctl restart wg-quick@${WG_INTERFACE} 2>/dev/null || wg-quick up ${WG_INTERFACE} 2>/dev/null || true

log_ok "WireGuard ${WG_INTERFACE} on ${WG_SUBNET} (pubkey: ${WG_PUBLIC_KEY:0:20}...)"

# ============================================================================
# Step 6: Setup AmneziaWG (compile from source)
# ============================================================================

log_step "Setting up AmneziaWG"

AWG_INTERFACE="awg0"
AWG_SUBNET_OCTET=$(( SUBNET_OCTET + 1 ))
AWG_SUBNET="10.${AWG_SUBNET_OCTET}.0.0/16"
AWG_SERVER_IP="10.${AWG_SUBNET_OCTET}.0.1"

AWG_DIR="/etc/amnezia/amneziawg"
mkdir -p "$AWG_DIR"

# Build amneziawg-go from source
if [[ ! -f /usr/local/bin/amneziawg-go ]]; then
  log "Compiling amneziawg-go from source..."
  cd /tmp
  rm -rf amneziawg-go
  git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git > /dev/null 2>&1
  cd amneziawg-go
  make > /dev/null 2>&1
  cp amneziawg-go /usr/local/bin/
  cd /tmp && rm -rf amneziawg-go
  log_ok "amneziawg-go compiled"
fi

# Build awg-tools from source
if [[ ! -f /usr/local/bin/awg ]]; then
  log "Compiling awg-tools from source..."
  cd /tmp
  rm -rf amneziawg-tools
  git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-tools.git > /dev/null 2>&1
  cd amneziawg-tools/src
  make > /dev/null 2>&1
  cp wg /usr/local/bin/awg
  cp wg-quick/linux.bash /usr/local/bin/awg-quick
  chmod +x /usr/local/bin/awg /usr/local/bin/awg-quick
  cd /tmp && rm -rf amneziawg-tools
  log_ok "awg-tools compiled"
fi

# Generate keys
if [[ ! -f "${AWG_DIR}/awg-private.key" ]]; then
  awg genkey | tee "${AWG_DIR}/awg-private.key" | awg pubkey > "${AWG_DIR}/awg-public.key"
  chmod 600 "${AWG_DIR}/awg-private.key"
fi

AWG_PRIVATE_KEY=$(cat "${AWG_DIR}/awg-private.key")
AWG_PUBLIC_KEY=$(cat "${AWG_DIR}/awg-public.key")

cat > "${AWG_DIR}/${AWG_INTERFACE}.conf" << EOF
[Interface]
Address = ${AWG_SERVER_IP}/16
ListenPort = ${AWG_PORT}
PrivateKey = ${AWG_PRIVATE_KEY}
Jc = 4
Jmin = 20
Jmax = 100
S1 = 55
S2 = 122
H1 = 789543135
H2 = 1156503820
H3 = 1277159579
H4 = 1626498337
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
EOF

# Systemd service for AmneziaWG (userspace)
cat > /etc/systemd/system/awg-quick@.service << 'EOF'
[Unit]
Description=AmneziaWG Tunnel (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/amneziawg-go %i
ExecStartPost=/usr/local/bin/awg-quick up %i
ExecStop=/usr/local/bin/awg-quick down %i
ExecStopPost=/bin/kill $MAINPID
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable awg-quick@${AWG_INTERFACE} > /dev/null 2>&1
systemctl restart awg-quick@${AWG_INTERFACE} 2>/dev/null || true

log_ok "AmneziaWG ${AWG_INTERFACE} on ${AWG_SUBNET} (pubkey: ${AWG_PUBLIC_KEY:0:20}...)"

# ============================================================================
# Step 7: Setup VLESS Reality (sing-box)
# ============================================================================

log_step "Setting up VLESS Reality"

VLESS_DIR="/etc/vless-reality"
mkdir -p "$VLESS_DIR"

# Install sing-box
if [[ ! -f /usr/local/bin/sing-box ]]; then
  log "Installing sing-box..."
  SINGBOX_VERSION="1.13.0"
  wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-amd64.tar.gz" -O /tmp/sing-box.tar.gz
  tar -xzf /tmp/sing-box.tar.gz -C /tmp
  cp /tmp/sing-box-${SINGBOX_VERSION}-linux-amd64/sing-box /usr/local/bin/
  chmod +x /usr/local/bin/sing-box
  rm -rf /tmp/sing-box* 
  log_ok "sing-box ${SINGBOX_VERSION} installed"
fi

# Generate VLESS Reality credentials
if [[ ! -f "${VLESS_DIR}/credentials.json" ]]; then
  REALITY_KEYS=$(sing-box generate reality-keypair 2>/dev/null || echo '{"PrivateKey":"","PublicKey":""}')
  REALITY_PRIVATE=$(echo "$REALITY_KEYS" | grep -oP 'PrivateKey: \K\S+' || echo "")
  REALITY_PUBLIC=$(echo "$REALITY_KEYS" | grep -oP 'PublicKey: \K\S+' || echo "")
  REALITY_SHORT_ID=$(openssl rand -hex 8)

  cat > "${VLESS_DIR}/credentials.json" << EOF
{
  "privateKey": "${REALITY_PRIVATE}",
  "publicKey": "${REALITY_PUBLIC}",
  "shortId": "${REALITY_SHORT_ID}",
  "serverName": "www.microsoft.com"
}
EOF
  chmod 600 "${VLESS_DIR}/credentials.json"
fi

REALITY_PRIVATE=$(jq -r '.privateKey' "${VLESS_DIR}/credentials.json")
REALITY_PUBLIC=$(jq -r '.publicKey' "${VLESS_DIR}/credentials.json")
REALITY_SHORT_ID=$(jq -r '.shortId' "${VLESS_DIR}/credentials.json")

# Peers file
[[ ! -f "${VLESS_DIR}/peers.json" ]] && echo '{"peers":[]}' > "${VLESS_DIR}/peers.json"

# Peer management script
cat > "${VLESS_DIR}/manage-peers.sh" << 'PEERSCRIPT'
#!/bin/bash
ACTION=$1
UUID=$2
PEERS_FILE="/etc/vless-reality/peers.json"
CONFIG_FILE="/etc/vless-reality/config.json"
CREDS_FILE="/etc/vless-reality/credentials.json"

case "$ACTION" in
  add)
    [[ -z "$UUID" ]] && echo "Usage: manage-peers.sh add <uuid>" && exit 1
    if jq -e ".peers | map(.uuid) | index(\"$UUID\")" "$PEERS_FILE" > /dev/null 2>&1; then
      echo "Peer $UUID already exists"
      exit 0
    fi
    jq ".peers += [{\"uuid\": \"$UUID\", \"addedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]" "$PEERS_FILE" > /tmp/peers.tmp && mv /tmp/peers.tmp "$PEERS_FILE"
    ;;
  remove)
    [[ -z "$UUID" ]] && echo "Usage: manage-peers.sh remove <uuid>" && exit 1
    jq ".peers = [.peers[] | select(.uuid != \"$UUID\")]" "$PEERS_FILE" > /tmp/peers.tmp && mv /tmp/peers.tmp "$PEERS_FILE"
    ;;
  list)
    jq '.peers' "$PEERS_FILE"
    exit 0
    ;;
  *) echo "Usage: manage-peers.sh {add|remove|list} [uuid]"; exit 1 ;;
esac

# Rebuild sing-box config with all current peers
PRIVATE_KEY=$(jq -r '.privateKey' "$CREDS_FILE")
SHORT_ID=$(jq -r '.shortId' "$CREDS_FILE")
SERVER_NAME=$(jq -r '.serverName' "$CREDS_FILE")
USERS=$(jq '[.peers[] | {uuid: .uuid, flow: "xtls-rprx-vision"}]' "$PEERS_FILE")

cat > "$CONFIG_FILE" << CONF
{
  "log": {"level": "warn"},
  "inbounds": [{
    "type": "vless",
    "listen": "::",
    "listen_port": 8443,
    "users": ${USERS},
    "tls": {
      "enabled": true,
      "server_name": "${SERVER_NAME}",
      "reality": {
        "enabled": true,
        "handshake": {"server": "${SERVER_NAME}", "server_port": 443},
        "private_key": "${PRIVATE_KEY}",
        "short_id": ["${SHORT_ID}"]
      }
    }
  }],
  "outbounds": [{"type": "direct"}]
}
CONF

systemctl restart pc2-vless-reality 2>/dev/null || true
echo "Peers updated, service restarted"
PEERSCRIPT
chmod +x "${VLESS_DIR}/manage-peers.sh"

# Initial sing-box config
cat > "${VLESS_DIR}/config.json" << EOF
{
  "log": {"level": "warn"},
  "inbounds": [{
    "type": "vless",
    "listen": "::",
    "listen_port": ${VLESS_PORT},
    "users": [],
    "tls": {
      "enabled": true,
      "server_name": "www.microsoft.com",
      "reality": {
        "enabled": true,
        "handshake": {"server": "www.microsoft.com", "server_port": 443},
        "private_key": "${REALITY_PRIVATE}",
        "short_id": ["${REALITY_SHORT_ID}"]
      }
    }
  }],
  "outbounds": [{"type": "direct"}]
}
EOF

# Systemd service
cat > /etc/systemd/system/pc2-vless-reality.service << EOF
[Unit]
Description=PC2 VLESS Reality Transport
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/sing-box run -c ${VLESS_DIR}/config.json
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pc2-vless-reality > /dev/null 2>&1
systemctl restart pc2-vless-reality 2>/dev/null || true

log_ok "VLESS Reality on port ${VLESS_PORT} (pubkey: ${REALITY_PUBLIC:0:20}...)"

# ============================================================================
# Step 8: Setup IPFS Relay
# ============================================================================

log_step "Setting up IPFS Relay"

RELAY_DIR="${SUPERNODE_DIR}/ipfs-relay"

# Copy the IPFS relay from the repo if available, otherwise create minimal
if [[ ! -f "${RELAY_DIR}/package.json" ]]; then
  cat > "${RELAY_DIR}/package.json" << 'EOF'
{
  "name": "pc2-ipfs-relay",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@libp2p/circuit-relay-v2": "^2.1.5",
    "@libp2p/dcutr": "^2.0.12",
    "@libp2p/identify": "^3.0.12",
    "@libp2p/kad-dht": "^14.1.2",
    "@libp2p/tcp": "^10.0.14",
    "@libp2p/websockets": "^9.0.14",
    "@chainsafe/libp2p-noise": "^16.1.0",
    "@chainsafe/libp2p-yamux": "^7.0.1",
    "libp2p": "^2.4.3"
  }
}
EOF
fi

cd "$RELAY_DIR" && npm install --omit=dev > /dev/null 2>&1

# Create relay service file
cat > /etc/systemd/system/pc2-ipfs-relay.service << EOF
[Unit]
Description=PC2 IPFS Relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${RELAY_DIR}
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Only start if index.js exists (it's deployed separately or will be synced)
if [[ -f "${RELAY_DIR}/index.js" ]]; then
  systemctl daemon-reload
  systemctl enable pc2-ipfs-relay > /dev/null 2>&1
  systemctl restart pc2-ipfs-relay 2>/dev/null || true
  log_ok "IPFS Relay started"
else
  log_warn "IPFS Relay index.js not found — will be deployed separately"
fi

# ============================================================================
# Step 9: Setup App Registry (mirror)
# ============================================================================

log_step "Setting up App Registry mirror"

REGISTRY_DIR="${SUPERNODE_DIR}/app-registry"

if [[ ! -f "${REGISTRY_DIR}/package.json" ]]; then
  cat > "${REGISTRY_DIR}/package.json" << 'EOF'
{
  "name": "pc2-app-registry",
  "version": "1.0.0",
  "type": "module"
}
EOF
fi

# Sync registry.json from bootstrap supernodes
REGISTRY_SYNCED=false
for SN_URL in "${BOOTSTRAP_SUPERNODES[@]}"; do
  SYNC_URL="${SN_URL/https/http}:4500/api/registry/apps"
  log "Trying to sync registry from ${SYNC_URL}..."
  if curl -s --max-time 10 -k "$SYNC_URL" -o "${REGISTRY_DIR}/registry.json" 2>/dev/null; then
    if jq -e '.apps' "${REGISTRY_DIR}/registry.json" > /dev/null 2>&1; then
      REGISTRY_SYNCED=true
      APP_COUNT=$(jq '.apps | length' "${REGISTRY_DIR}/registry.json")
      log_ok "Synced ${APP_COUNT} apps from ${SN_URL}"
      break
    fi
  fi
done

if [[ "$REGISTRY_SYNCED" != "true" ]]; then
  log_warn "Could not sync registry — creating empty registry"
  echo '{"apps":[],"version":"1.0.0","updatedAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "${REGISTRY_DIR}/registry.json"
fi

# Create registry sync cron (every 5 minutes from primary)
cat > /etc/cron.d/pc2-registry-sync << EOF
*/5 * * * * root curl -s --max-time 10 -k ${BOOTSTRAP_SUPERNODES[0]}:4500/api/registry/apps -o ${REGISTRY_DIR}/registry.json.tmp 2>/dev/null && mv ${REGISTRY_DIR}/registry.json.tmp ${REGISTRY_DIR}/registry.json 2>/dev/null || true
EOF

# Only start if index.js exists
if [[ -f "${REGISTRY_DIR}/index.js" ]]; then
  cat > /etc/systemd/system/pc2-app-registry.service << EOF
[Unit]
Description=PC2 App Registry
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${REGISTRY_DIR}
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5
Environment=REGISTRY_PORT=4500

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable pc2-app-registry > /dev/null 2>&1
  systemctl restart pc2-app-registry 2>/dev/null || true
  log_ok "App Registry on port 4500"
else
  log_warn "App Registry index.js not found — using cron sync only"
fi

# ============================================================================
# Step 10: Setup Web Gateway
# ============================================================================

log_step "Setting up Web Gateway"

GW_DIR="${SUPERNODE_DIR}/web-gateway"

if [[ ! -f "${GW_DIR}/package.json" ]]; then
  cat > "${GW_DIR}/package.json" << 'EOF'
{
  "name": "pc2-web-gateway",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {}
}
EOF
fi

cd "$GW_DIR" && npm install --omit=dev > /dev/null 2>&1

# Gateway environment file
cat > "${GW_DIR}/.env" << EOF
GATEWAY_ID=gateway-${PUBLIC_IP}
PORT=3080
PUBLIC_IP=${PUBLIC_IP}
DOMAIN=${DOMAIN:-ela.city}
DATA_DIR=${DATA_DIR}
REGISTRY_FILE=${DATA_DIR}/registry.json
WG_ENABLED=true
WG_INTERFACE=${WG_INTERFACE}
WG_SUBNET=${WG_SUBNET}
WG_SERVER_IP=${WG_SERVER_IP}
WG_PORT=${WG_PORT}
AWG_ENABLED=true
AWG_INTERFACE=${AWG_INTERFACE}
AWG_SUBNET=${AWG_SUBNET}
AWG_SERVER_IP=${AWG_SERVER_IP}
AWG_PORT=${AWG_PORT}
VLESS_ENABLED=true
SUPERNODE_SECRET=${SUPERNODE_SECRET}
REGISTRY_SYNC_AUTO=true
EOF

# Gateway systemd service
cat > /etc/systemd/system/pc2-web-gateway.service << EOF
[Unit]
Description=PC2 Web Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${GW_DIR}
EnvironmentFile=${GW_DIR}/.env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

if [[ -f "${GW_DIR}/index.js" ]]; then
  systemctl daemon-reload
  systemctl enable pc2-web-gateway > /dev/null 2>&1
  systemctl restart pc2-web-gateway 2>/dev/null || true
  log_ok "Web Gateway on port 3080"
else
  log_warn "Web Gateway index.js not found — deploy with: scp deploy/web-gateway/index.js root@${PUBLIC_IP}:${GW_DIR}/"
fi

# ============================================================================
# Step 11: Setup Nginx reverse proxy + SSL
# ============================================================================

log_step "Setting up Nginx + SSL"

# Nginx config
cat > /etc/nginx/sites-available/pc2-gateway << EOF
server {
    listen 80;
    server_name ${DOMAIN:-_} *.${DOMAIN:-ela.city};
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN:-_} *.${DOMAIN:-ela.city};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN:-ela.city}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN:-ela.city}/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pc2-gateway /etc/nginx/sites-enabled/

if [[ -n "$DOMAIN" ]]; then
  # Try to get SSL certificate
  log "Requesting SSL certificate for ${DOMAIN}..."
  if certbot certonly --nginx -d "${DOMAIN}" -d "*.${DOMAIN}" --non-interactive --agree-tos --email "admin@${DOMAIN}" 2>/dev/null; then
    log_ok "SSL certificate obtained for ${DOMAIN}"
  else
    log_warn "SSL certificate request failed — will need manual setup"
    # Create self-signed cert as fallback
    mkdir -p /etc/letsencrypt/live/${DOMAIN}
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
      -out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
      -subj "/CN=${DOMAIN}" 2>/dev/null
    log_warn "Using self-signed certificate"
  fi
else
  # No domain — use self-signed cert for IP access
  mkdir -p /etc/letsencrypt/live/ela.city
  if [[ ! -f /etc/letsencrypt/live/ela.city/fullchain.pem ]]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/letsencrypt/live/ela.city/privkey.pem \
      -out /etc/letsencrypt/live/ela.city/fullchain.pem \
      -subj "/CN=${PUBLIC_IP}" 2>/dev/null
  fi
  log_warn "No domain specified — using self-signed cert for ${PUBLIC_IP}"
fi

nginx -t > /dev/null 2>&1 && systemctl restart nginx
log_ok "Nginx configured"

# ============================================================================
# Step 12: Register with existing supernodes
# ============================================================================

log_step "Registering with existing supernodes"

# Build our supernode info payload
REGISTER_PAYLOAD=$(cat << EOF
{
  "id": "${NODE_ID}",
  "address": "${PUBLIC_IP}",
  "port": ${BOSON_PORT},
  "proxyPort": ${PROXY_PORT},
  "gatewayUrl": "https://${PUBLIC_IP}",
  "name": "${SN_NAME}",
  "region": "${REGION}",
  "secret": "${SUPERNODE_SECRET}"
}
EOF
)

REGISTERED=0
for SN_URL in "${BOOTSTRAP_SUPERNODES[@]}"; do
  log "Registering with ${SN_URL}..."
  RESP=$(curl -s --max-time 10 -k \
    -X POST "${SN_URL}/api/supernodes/register" \
    -H "Content-Type: application/json" \
    -d "$REGISTER_PAYLOAD" 2>/dev/null || echo '{"error":"unreachable"}')
  
  if echo "$RESP" | jq -e '.success' > /dev/null 2>&1; then
    log_ok "Registered with ${SN_URL}"
    REGISTERED=$((REGISTERED + 1))
  else
    ERR=$(echo "$RESP" | jq -r '.error // "unknown error"')
    log_warn "Failed to register with ${SN_URL}: ${ERR}"
  fi
done

log "Registered with ${REGISTERED}/${#BOOTSTRAP_SUPERNODES[@]} supernodes"

# Setup heartbeat cron (every 2 minutes)
cat > /etc/cron.d/pc2-supernode-heartbeat << EOF
*/2 * * * * root for SN in ${BOOTSTRAP_SUPERNODES[*]}; do curl -s --max-time 5 -k -X POST "\${SN}/api/supernodes/heartbeat" -H "Content-Type: application/json" -d '{"id":"${NODE_ID}","address":"${PUBLIC_IP}","port":${BOSON_PORT},"proxyPort":${PROXY_PORT},"gatewayUrl":"https://${PUBLIC_IP}","name":"${SN_NAME}","region":"${REGION}"}' > /dev/null 2>&1; done
EOF

log_ok "Heartbeat cron configured (every 2 min)"

# ============================================================================
# Summary
# ============================================================================

log_step "Setup Complete"

echo ""
echo "================================================================"
echo "  PC2 Supernode Bootstrap Complete"
echo "================================================================"
echo ""
echo "  Public IP:      ${PUBLIC_IP}"
echo "  Name:           ${SN_NAME}"
echo "  Region:         ${REGION}"
echo "  Node ID:        ${NODE_ID:0:16}..."
echo ""
echo "  Services:"
echo "    WireGuard:    ${WG_INTERFACE} on :${WG_PORT} (${WG_SUBNET})"
echo "    AmneziaWG:    ${AWG_INTERFACE} on :${AWG_PORT} (${AWG_SUBNET})"
echo "    VLESS Reality: on :${VLESS_PORT}"
echo "    Web Gateway:  on :3080 (behind Nginx :443)"
echo "    IPFS Relay:   on :4003/:4004"
echo "    App Registry: on :4500 (mirror, 5-min sync)"
echo "    Boson DHT:    on :${BOSON_PORT}"
echo ""
echo "  WireGuard Public Key:  ${WG_PUBLIC_KEY}"
echo "  AmneziaWG Public Key:  ${AWG_PUBLIC_KEY}"
echo "  VLESS Reality Pubkey:  ${REALITY_PUBLIC}"
echo "  VLESS Short ID:        ${REALITY_SHORT_ID}"
echo ""
echo "  Registration: ${REGISTERED}/${#BOOTSTRAP_SUPERNODES[@]} supernodes"
echo ""
echo "  Next steps:"
echo "    1. Deploy gateway code:  scp deploy/web-gateway/index.js root@${PUBLIC_IP}:${GW_DIR}/"
echo "    2. Deploy IPFS relay:    scp deploy/ipfs-relay/index.js root@${PUBLIC_IP}:${RELAY_DIR}/"
echo "    3. Deploy app registry:  scp deploy/app-registry/index.js root@${PUBLIC_IP}:${REGISTRY_DIR}/"
echo "    4. Set up Boson DHT:     (requires Java — see docs/pc2-infrastructure/)"
echo "    5. Check health:         curl -k https://${PUBLIC_IP}/api/health"
echo ""
echo "  Logs: tail -f ${LOG_FILE}"
echo "================================================================"
