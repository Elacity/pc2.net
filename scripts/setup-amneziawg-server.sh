#!/bin/bash
# =============================================================================
# PC2 AmneziaWG Server Setup
#
# Sets up an AmneziaWG (obfuscated WireGuard) interface on a PC2 supernode.
# Runs alongside the standard WireGuard wg0 interface on a separate subnet
# and port, providing DPI-resistant stealth tunnels for users behind censorship.
#
# AmneziaWG uses the same cryptography as WireGuard but adds transport-layer
# obfuscation (randomized headers, padded packets, junk traffic) that makes
# the tunnel undetectable by Deep Packet Inspection systems.
#
# Usage: ./setup-amneziawg-server.sh [--subnet 10.101.0.0/16] [--port 51821]
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

AWG_INTERFACE="${AWG_INTERFACE:-awg0}"
AWG_PORT="${AWG_PORT:-51821}"
AWG_SUBNET="${AWG_SUBNET:-10.101.0.0/16}"
AWG_SERVER_IP="${AWG_SERVER_IP:-10.101.0.1}"
AWG_DIR="/etc/amneziawg"
AWG_DATA_DIR="${HOME}/pc2/amneziawg"

# Obfuscation parameters (interface-level, shared by all peers)
AWG_Jc="${AWG_Jc:-5}"
AWG_Jmin="${AWG_Jmin:-50}"
AWG_Jmax="${AWG_Jmax:-1000}"
AWG_S1="${AWG_S1:-20}"
AWG_S2="${AWG_S2:-20}"
AWG_S3="${AWG_S3:-20}"
AWG_S4="${AWG_S4:-10}"
AWG_H1="${AWG_H1:-$(shuf -i 100000000-999999999 -n 1)}"
AWG_H2="${AWG_H2:-$(shuf -i 100000000-999999999 -n 1)}"
AWG_H3="${AWG_H3:-$(shuf -i 100000000-999999999 -n 1)}"
AWG_H4="${AWG_H4:-$(shuf -i 100000000-999999999 -n 1)}"

print_header() { echo -e "\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n"; }
print_step()   { echo -e "${GREEN}▶${NC} $1"; }
print_warn()   { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()  { echo -e "${RED}✗${NC} $1"; }
print_ok()     { echo -e "${GREEN}✓${NC} $1"; }

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)    AWG_PORT="$2"; shift 2 ;;
    --subnet)  AWG_SUBNET="$2"; shift 2 ;;
    --help)
      echo "Usage: $0 [--port 51821] [--subnet 10.101.0.0/16]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

print_header "PC2 AmneziaWG Server Setup (Stealth Transport)"

if [ "$EUID" -ne 0 ]; then
  print_error "This script must be run as root (sudo)."
  exit 1
fi

NET_IFACE=$(ip -4 route show default | awk '{print $5}' | head -1)
if [ -z "$NET_IFACE" ]; then
  print_error "Could not detect primary network interface."
  exit 1
fi
print_step "Primary interface: $NET_IFACE"

# ---------------------------------------------------------------------------
# Install AmneziaWG
# ---------------------------------------------------------------------------

print_header "Installing AmneziaWG"

AWG_GO_PATH="/usr/local/bin/amneziawg-go"
AWG_QUICK_PATH="/usr/local/bin/awg-quick"
AWG_TOOL_PATH="/usr/local/bin/awg"

install_from_source() {
  print_step "Building AmneziaWG from source..."

  if ! command -v go &>/dev/null; then
    print_step "Installing Go compiler..."
    apt-get update -qq
    apt-get install -y -qq golang-go git make 2>/dev/null || {
      local GO_VERSION="1.22.5"
      local ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
      wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -O /tmp/go.tar.gz
      rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
      export PATH=$PATH:/usr/local/go/bin
      rm /tmp/go.tar.gz
    }
  fi

  local BUILD_DIR=$(mktemp -d)

  # Build amneziawg-go (userspace daemon)
  print_step "Building amneziawg-go..."
  cd "$BUILD_DIR"
  git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git 2>/dev/null
  cd amneziawg-go
  make
  cp amneziawg-go "$AWG_GO_PATH"
  chmod 755 "$AWG_GO_PATH"
  print_ok "amneziawg-go installed to $AWG_GO_PATH"

  # Build amneziawg-tools (awg, awg-quick)
  print_step "Building amneziawg-tools..."
  cd "$BUILD_DIR"
  git clone --depth 1 https://github.com/amnezia-vpn/amnezia-wg-tools.git 2>/dev/null
  cd amnezia-wg-tools/src
  make
  cp wg "$AWG_TOOL_PATH"
  cp wg-quick/linux.bash "$AWG_QUICK_PATH"
  chmod 755 "$AWG_TOOL_PATH" "$AWG_QUICK_PATH"

  # awg-quick needs to find awg in PATH
  if [ ! -L /usr/bin/awg ] && [ ! -f /usr/bin/awg ]; then
    ln -sf "$AWG_TOOL_PATH" /usr/bin/awg
  fi

  print_ok "awg-tools installed"

  rm -rf "$BUILD_DIR"
}

# Check if AmneziaWG tools are already installed
if [ -x "$AWG_GO_PATH" ] && [ -x "$AWG_TOOL_PATH" ]; then
  print_ok "AmneziaWG tools already installed"
else
  install_from_source
fi

# Verify installation
if ! [ -x "$AWG_GO_PATH" ]; then
  print_error "amneziawg-go not found at $AWG_GO_PATH"
  exit 1
fi
if ! [ -x "$AWG_TOOL_PATH" ]; then
  print_error "awg tool not found at $AWG_TOOL_PATH"
  exit 1
fi

# ---------------------------------------------------------------------------
# Generate server keypair
# ---------------------------------------------------------------------------

print_header "Generating AmneziaWG Server Keys"

mkdir -p "$AWG_DIR" "$AWG_DATA_DIR"
chmod 700 "$AWG_DIR" "$AWG_DATA_DIR"

PRIVKEY_FILE="$AWG_DIR/server-private.key"
PUBKEY_FILE="$AWG_DIR/server-public.key"
PARAMS_FILE="$AWG_DIR/obfuscation-params.json"

if [ -f "$PRIVKEY_FILE" ] && [ -f "$PUBKEY_FILE" ]; then
  print_ok "Server keypair already exists"
  print_step "Public key: $(cat "$PUBKEY_FILE")"
else
  # Use standard wg tools for key generation (same curve25519 keys)
  wg genkey | tee "$PRIVKEY_FILE" | wg pubkey > "$PUBKEY_FILE"
  chmod 600 "$PRIVKEY_FILE"
  chmod 644 "$PUBKEY_FILE"
  print_ok "Keypair generated"
  print_step "Public key: $(cat "$PUBKEY_FILE")"
fi

SERVER_PRIVKEY=$(cat "$PRIVKEY_FILE")

# Save obfuscation parameters for the web gateway API to distribute
cat > "$PARAMS_FILE" << EOF
{
  "Jc": ${AWG_Jc},
  "Jmin": ${AWG_Jmin},
  "Jmax": ${AWG_Jmax},
  "S1": ${AWG_S1},
  "S2": ${AWG_S2},
  "S3": ${AWG_S3},
  "S4": ${AWG_S4},
  "H1": ${AWG_H1},
  "H2": ${AWG_H2},
  "H3": ${AWG_H3},
  "H4": ${AWG_H4}
}
EOF
chmod 644 "$PARAMS_FILE"
print_ok "Obfuscation parameters saved to $PARAMS_FILE"

# ---------------------------------------------------------------------------
# Configure awg0 interface
# ---------------------------------------------------------------------------

print_header "Configuring AmneziaWG Interface"

AWG_CONF="$AWG_DIR/$AWG_INTERFACE.conf"

if [ -f "$AWG_CONF" ]; then
  print_warn "Config $AWG_CONF already exists. Backing up to ${AWG_CONF}.bak"
  cp "$AWG_CONF" "${AWG_CONF}.bak"
fi

cat > "$AWG_CONF" << EOF
[Interface]
Address = ${AWG_SERVER_IP}/16
ListenPort = ${AWG_PORT}
PrivateKey = ${SERVER_PRIVKEY}
MTU = 1280
Jc = ${AWG_Jc}
Jmin = ${AWG_Jmin}
Jmax = ${AWG_Jmax}
S1 = ${AWG_S1}
S2 = ${AWG_S2}
S3 = ${AWG_S3}
S4 = ${AWG_S4}
H1 = ${AWG_H1}
H2 = ${AWG_H2}
H3 = ${AWG_H3}
H4 = ${AWG_H4}

PostUp   = iptables -A FORWARD -i ${AWG_INTERFACE} -j ACCEPT; iptables -A FORWARD -o ${AWG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${NET_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${AWG_INTERFACE} -j ACCEPT; iptables -D FORWARD -o ${AWG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${NET_IFACE} -j MASQUERADE
EOF

chmod 600 "$AWG_CONF"
print_ok "Config written to $AWG_CONF"

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------

print_header "Configuring Firewall"

if command -v ufw &>/dev/null; then
  ufw allow "${AWG_PORT}/udp" comment 'PC2 AmneziaWG (Stealth)' 2>/dev/null || true
  print_ok "UFW: opened UDP port $AWG_PORT"
else
  print_warn "UFW not found. Ensure UDP port $AWG_PORT is open in your firewall."
fi

# ---------------------------------------------------------------------------
# Start AmneziaWG
# ---------------------------------------------------------------------------

print_header "Starting AmneziaWG"

# Bring down first if already running
WG_QUICK_USERSPACE_IMPLEMENTATION=amneziawg-go awg-quick down "$AWG_CONF" 2>/dev/null || true

WG_QUICK_USERSPACE_IMPLEMENTATION=amneziawg-go awg-quick up "$AWG_CONF"

print_ok "AmneziaWG interface $AWG_INTERFACE is up"
echo ""
awg show "$AWG_INTERFACE" 2>/dev/null || echo "(awg show not available, using wg show)"
wg show "$AWG_INTERFACE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Create peer data directory for the gateway API
# ---------------------------------------------------------------------------

AWG_PEERS_FILE="$AWG_DATA_DIR/awg-peers.json"
if [ ! -f "$AWG_PEERS_FILE" ]; then
  echo '{"nextIP": 2, "peers": {}}' > "$AWG_PEERS_FILE"
  chmod 644 "$AWG_PEERS_FILE"
  print_ok "Created peer registry: $AWG_PEERS_FILE"
fi

# Symlink for the web gateway data dir
GATEWAY_DATA="/root/pc2/web-gateway/data"
if [ -d "$GATEWAY_DATA" ]; then
  ln -sf "$AWG_PEERS_FILE" "$GATEWAY_DATA/awg-peers.json" 2>/dev/null || \
    cp "$AWG_PEERS_FILE" "$GATEWAY_DATA/awg-peers.json"
  ln -sf "$PARAMS_FILE" "$GATEWAY_DATA/awg-params.json" 2>/dev/null || \
    cp "$PARAMS_FILE" "$GATEWAY_DATA/awg-params.json"
  print_ok "Linked peer registry and params to gateway data dir"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

PUBLIC_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo "<your-public-ip>")

print_header "AmneziaWG Server Ready (Stealth Transport)"

echo -e "  Interface:    ${BLUE}${AWG_INTERFACE}${NC}"
echo -e "  Server IP:    ${BLUE}${AWG_SERVER_IP}/16${NC}"
echo -e "  Listen Port:  ${BLUE}${AWG_PORT}/UDP${NC}"
echo -e "  Public Key:   ${BLUE}$(cat "$PUBKEY_FILE")${NC}"
echo -e "  Public IP:    ${BLUE}${PUBLIC_IP}${NC}"
echo -e "  Peer File:    ${BLUE}${AWG_PEERS_FILE}${NC}"
echo -e "  Params File:  ${BLUE}${PARAMS_FILE}${NC}"
echo ""
echo "  Obfuscation Parameters:"
echo "    Jc=${AWG_Jc}  Jmin=${AWG_Jmin}  Jmax=${AWG_Jmax}"
echo "    S1=${AWG_S1}  S2=${AWG_S2}  S3=${AWG_S3}  S4=${AWG_S4}"
echo "    H1=${AWG_H1}  H2=${AWG_H2}  H3=${AWG_H3}  H4=${AWG_H4}"
echo ""
echo "  Nodes can connect with:"
echo "    Endpoint = ${PUBLIC_IP}:${AWG_PORT}"
echo "    ServerPublicKey = $(cat "$PUBKEY_FILE")"
echo ""
print_ok "Setup complete. The web gateway API will handle peer provisioning."
