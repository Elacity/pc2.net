#!/bin/bash
# =============================================================================
# PC2 WireGuard Server Setup
#
# Sets up a WireGuard VPN server on a PC2 supernode to provide high-performance
# NAT traversal for PC2 nodes running on home hardware (Jetson, Raspberry Pi, etc).
#
# The WireGuard tunnel replaces the Boson ActiveProxy relay for HTTP traffic,
# giving near-localhost performance while Boson remains as automatic fallback.
#
# Usage: ./setup-wireguard-server.sh [--subnet 10.100.0.0/16] [--port 51820]
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

WG_INTERFACE="wg0"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.100.0.0/16}"
WG_SERVER_IP="10.100.0.1"
WG_DIR="/etc/wireguard"
WG_DATA_DIR="${HOME}/pc2/wireguard"

print_header() { echo -e "\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n"; }
print_step()   { echo -e "${GREEN}▶${NC} $1"; }
print_warn()   { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()  { echo -e "${RED}✗${NC} $1"; }
print_ok()     { echo -e "${GREEN}✓${NC} $1"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)    WG_PORT="$2"; shift 2 ;;
    --subnet)  WG_SUBNET="$2"; shift 2 ;;
    --help)
      echo "Usage: $0 [--port 51820] [--subnet 10.100.0.0/16]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

print_header "PC2 WireGuard Server Setup"

if [ "$EUID" -ne 0 ]; then
  print_error "This script must be run as root (sudo)."
  exit 1
fi

KERNEL_VERSION=$(uname -r | cut -d. -f1-2)
KERNEL_MAJOR=$(echo "$KERNEL_VERSION" | cut -d. -f1)
KERNEL_MINOR=$(echo "$KERNEL_VERSION" | cut -d. -f2)

print_step "Kernel: $(uname -r)"

if (( KERNEL_MAJOR > 5 || (KERNEL_MAJOR == 5 && KERNEL_MINOR >= 6) )); then
  print_ok "Kernel $KERNEL_VERSION has built-in WireGuard support"
  WG_PKG="wireguard-tools"
else
  print_warn "Kernel $KERNEL_VERSION predates built-in WireGuard (5.6+), will install DKMS module"
  WG_PKG="wireguard"
fi

# Detect primary network interface for NAT masquerade
NET_IFACE=$(ip -4 route show default | awk '{print $5}' | head -1)
if [ -z "$NET_IFACE" ]; then
  print_error "Could not detect primary network interface."
  exit 1
fi
print_step "Primary interface: $NET_IFACE"

# ---------------------------------------------------------------------------
# Install WireGuard
# ---------------------------------------------------------------------------

print_header "Installing WireGuard"

if command -v wg &>/dev/null; then
  print_ok "WireGuard tools already installed ($(wg --version 2>/dev/null || echo 'unknown version'))"
else
  print_step "Installing $WG_PKG..."
  apt-get update -qq
  apt-get install -y -qq "$WG_PKG"
  print_ok "WireGuard installed"
fi

# ---------------------------------------------------------------------------
# Generate server keypair
# ---------------------------------------------------------------------------

print_header "Generating Server Keys"

mkdir -p "$WG_DIR" "$WG_DATA_DIR"
chmod 700 "$WG_DIR" "$WG_DATA_DIR"

PRIVKEY_FILE="$WG_DIR/server-private.key"
PUBKEY_FILE="$WG_DIR/server-public.key"

if [ -f "$PRIVKEY_FILE" ] && [ -f "$PUBKEY_FILE" ]; then
  print_ok "Server keypair already exists"
  print_step "Public key: $(cat "$PUBKEY_FILE")"
else
  wg genkey | tee "$PRIVKEY_FILE" | wg pubkey > "$PUBKEY_FILE"
  chmod 600 "$PRIVKEY_FILE"
  chmod 644 "$PUBKEY_FILE"
  print_ok "Keypair generated"
  print_step "Public key: $(cat "$PUBKEY_FILE")"
fi

SERVER_PRIVKEY=$(cat "$PRIVKEY_FILE")

# ---------------------------------------------------------------------------
# Configure wg0 interface
# ---------------------------------------------------------------------------

print_header "Configuring WireGuard Interface"

WG_CONF="$WG_DIR/$WG_INTERFACE.conf"

if [ -f "$WG_CONF" ]; then
  print_warn "Config $WG_CONF already exists. Backing up to ${WG_CONF}.bak"
  cp "$WG_CONF" "${WG_CONF}.bak"
fi

cat > "$WG_CONF" << EOF
[Interface]
Address = ${WG_SERVER_IP}/16
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVKEY}

# Allow forwarding traffic from wg0 to the internet (for nodes that need it)
# and masquerade so responses come back through the tunnel.
PostUp   = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -A FORWARD -o ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${NET_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -D FORWARD -o ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${NET_IFACE} -j MASQUERADE
EOF

chmod 600 "$WG_CONF"
print_ok "Config written to $WG_CONF"

# ---------------------------------------------------------------------------
# Enable IP forwarding
# ---------------------------------------------------------------------------

print_header "Enabling IP Forwarding"

SYSCTL_CONF="/etc/sysctl.d/99-wireguard.conf"
echo "net.ipv4.ip_forward = 1" > "$SYSCTL_CONF"
sysctl -p "$SYSCTL_CONF" > /dev/null

if [ "$(cat /proc/sys/net/ipv4/ip_forward)" = "1" ]; then
  print_ok "IP forwarding enabled"
else
  print_error "Failed to enable IP forwarding"
  exit 1
fi

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------

print_header "Configuring Firewall"

if command -v ufw &>/dev/null; then
  ufw allow "${WG_PORT}/udp" comment 'PC2 WireGuard' 2>/dev/null || true
  print_ok "UFW: opened UDP port $WG_PORT"
else
  print_warn "UFW not found. Ensure UDP port $WG_PORT is open in your firewall."
fi

# ---------------------------------------------------------------------------
# Start WireGuard
# ---------------------------------------------------------------------------

print_header "Starting WireGuard"

# Bring down first if already running
wg-quick down "$WG_INTERFACE" 2>/dev/null || true

wg-quick up "$WG_INTERFACE"
systemctl enable "wg-quick@${WG_INTERFACE}" 2>/dev/null || true

print_ok "WireGuard interface $WG_INTERFACE is up"
echo ""
wg show "$WG_INTERFACE"

# ---------------------------------------------------------------------------
# Create peer data directory for the gateway API
# ---------------------------------------------------------------------------

WG_PEERS_FILE="$WG_DATA_DIR/wg-peers.json"
if [ ! -f "$WG_PEERS_FILE" ]; then
  echo '{"nextIP": 2, "peers": {}}' > "$WG_PEERS_FILE"
  chmod 644 "$WG_PEERS_FILE"
  print_ok "Created peer registry: $WG_PEERS_FILE"
fi

# Also symlink/copy for the web gateway data dir if it exists
GATEWAY_DATA="/root/pc2/web-gateway/data"
if [ -d "$GATEWAY_DATA" ]; then
  ln -sf "$WG_PEERS_FILE" "$GATEWAY_DATA/wg-peers.json" 2>/dev/null || \
    cp "$WG_PEERS_FILE" "$GATEWAY_DATA/wg-peers.json"
  print_ok "Linked peer registry to gateway data dir"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

PUBLIC_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo "<your-public-ip>")

print_header "WireGuard Server Ready"

echo -e "  Interface:    ${BLUE}${WG_INTERFACE}${NC}"
echo -e "  Server IP:    ${BLUE}${WG_SERVER_IP}/16${NC}"
echo -e "  Listen Port:  ${BLUE}${WG_PORT}/UDP${NC}"
echo -e "  Public Key:   ${BLUE}$(cat "$PUBKEY_FILE")${NC}"
echo -e "  Public IP:    ${BLUE}${PUBLIC_IP}${NC}"
echo -e "  Peer File:    ${BLUE}${WG_PEERS_FILE}${NC}"
echo ""
echo "  Nodes can connect with:"
echo "    Endpoint = ${PUBLIC_IP}:${WG_PORT}"
echo "    ServerPublicKey = $(cat "$PUBKEY_FILE")"
echo ""
echo "  Useful commands:"
echo "    wg show ${WG_INTERFACE}              # Show tunnel status"
echo "    wg show ${WG_INTERFACE} dump         # Show all peers"
echo "    journalctl -u wg-quick@${WG_INTERFACE}  # View logs"
echo ""
print_ok "Setup complete. The web gateway API will handle peer provisioning."
