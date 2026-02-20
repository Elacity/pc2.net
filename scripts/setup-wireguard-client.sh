#!/bin/bash
# =============================================================================
# PC2 WireGuard Client Setup
#
# One-command setup for PC2 nodes running on home hardware (Jetson, Raspberry Pi,
# any Linux box) to establish a high-performance WireGuard tunnel to a PC2
# supernode. This replaces the slow Boson ActiveProxy relay with a kernel-level
# encrypted UDP tunnel.
#
# Supports:
#   - NVIDIA Jetson (JetPack 5.x/6.x, Ubuntu 20.04/22.04, kernel 5.10+/5.15+)
#   - Raspberry Pi (Raspberry Pi OS Bullseye/Bookworm, Ubuntu for Pi)
#   - Any Linux with kernel 5.6+ (WireGuard built-in)
#   - Older kernels via DKMS fallback
#
# Usage:
#   ./setup-wireguard-client.sh --gateway https://demo.ela.city --username alice
#   ./setup-wireguard-client.sh --auto   (reads from PC2 node config)
#
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() { echo -e "\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n${BLUE}  $1${NC}\n${BLUE}════════════════════════════════════════════════════════════════${NC}\n"; }
print_step()   { echo -e "${GREEN}▶${NC} $1"; }
print_warn()   { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()  { echo -e "${RED}✗${NC} $1"; }
print_ok()     { echo -e "${GREEN}✓${NC} $1"; }

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------

GATEWAY_URL="${GATEWAY_URL:-}"
USERNAME="${PC2_USERNAME:-}"
NODE_ID="${PC2_NODE_ID:-}"
PC2_DATA_DIR="${PC2_DATA_DIR:-$HOME/.pc2}"
WG_DIR="$PC2_DATA_DIR/wireguard"
WG_INTERFACE="wg0"
AUTO_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --gateway)   GATEWAY_URL="$2"; shift 2 ;;
    --username)  USERNAME="$2"; shift 2 ;;
    --node-id)   NODE_ID="$2"; shift 2 ;;
    --data-dir)  PC2_DATA_DIR="$2"; WG_DIR="$PC2_DATA_DIR/wireguard"; shift 2 ;;
    --auto)      AUTO_MODE=true; shift ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --gateway URL      Supernode gateway URL (e.g., https://demo.ela.city)"
      echo "  --username NAME    PC2 username"
      echo "  --node-id ID       PC2 node ID (base58 public key)"
      echo "  --data-dir PATH    PC2 data directory (default: ~/.pc2)"
      echo "  --auto             Auto-detect from PC2 node config"
      echo ""
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Auto-detect from PC2 node config
# ---------------------------------------------------------------------------

if [ "$AUTO_MODE" = true ] || [ -z "$USERNAME" ]; then
  # Try to read from PC2 node data directory
  USERNAME_FILE="$PC2_DATA_DIR/username.json"
  IDENTITY_FILE="$PC2_DATA_DIR/identity.json"

  if [ -z "$USERNAME" ] && [ -f "$USERNAME_FILE" ]; then
    USERNAME=$(python3 -c "import json; print(json.load(open('$USERNAME_FILE')).get('username',''))" 2>/dev/null || true)
    if [ -n "$USERNAME" ]; then
      print_ok "Auto-detected username: $USERNAME"
    fi
  fi

  if [ -z "$NODE_ID" ] && [ -f "$IDENTITY_FILE" ]; then
    NODE_ID=$(python3 -c "import json; print(json.load(open('$IDENTITY_FILE')).get('nodeId',''))" 2>/dev/null || true)
    if [ -n "$NODE_ID" ]; then
      print_ok "Auto-detected nodeId: ${NODE_ID:0:12}..."
    fi
  fi

  if [ -z "$GATEWAY_URL" ]; then
    GATEWAY_URL="https://demo.ela.city"
    print_step "Using default gateway: $GATEWAY_URL"
  fi
fi

# Validate required parameters
if [ -z "$USERNAME" ]; then
  print_error "Username required. Use --username or --auto"
  exit 1
fi

if [ -z "$GATEWAY_URL" ]; then
  print_error "Gateway URL required. Use --gateway"
  exit 1
fi

# ---------------------------------------------------------------------------
# System detection
# ---------------------------------------------------------------------------

print_header "PC2 WireGuard Client Setup"

# Detect OS and architecture
OS_ID="unknown"
OS_VERSION=""
ARCH=$(uname -m)

if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="$ID"
  OS_VERSION="$VERSION_ID"
fi

# Detect if running on Jetson
IS_JETSON=false
if [ -f /etc/nv_tegra_release ]; then
  IS_JETSON=true
  JETPACK_VERSION=$(dpkg -l 2>/dev/null | grep nvidia-jetpack | awk '{print $3}' | head -1 || echo "unknown")
  print_step "Platform: NVIDIA Jetson (JetPack $JETPACK_VERSION, $ARCH)"
elif [ -f /proc/device-tree/model ] && grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
  PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
  print_step "Platform: $PI_MODEL ($ARCH)"
else
  print_step "Platform: $OS_ID $OS_VERSION ($ARCH)"
fi

KERNEL_VERSION=$(uname -r | cut -d. -f1-2)
KERNEL_MAJOR=$(echo "$KERNEL_VERSION" | cut -d. -f1)
KERNEL_MINOR=$(echo "$KERNEL_VERSION" | cut -d. -f2)
print_step "Kernel: $(uname -r)"

# ---------------------------------------------------------------------------
# Install WireGuard tools
# ---------------------------------------------------------------------------

print_header "Installing WireGuard"

if command -v wg &>/dev/null && command -v wg-quick &>/dev/null; then
  print_ok "WireGuard tools already installed"
else
  if (( KERNEL_MAJOR > 5 || (KERNEL_MAJOR == 5 && KERNEL_MINOR >= 6) )); then
    print_step "Kernel $KERNEL_VERSION has built-in WireGuard -- installing tools only"
    WG_PKG="wireguard-tools"
  else
    print_step "Kernel $KERNEL_VERSION needs DKMS WireGuard module"
    WG_PKG="wireguard"
  fi

  if [ "$EUID" -eq 0 ]; then
    apt-get update -qq
    apt-get install -y -qq "$WG_PKG"
  else
    print_step "Installing with sudo..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq "$WG_PKG"
  fi

  if command -v wg &>/dev/null; then
    print_ok "WireGuard installed successfully"
  else
    print_error "Failed to install WireGuard. Please install manually:"
    echo "  sudo apt install wireguard-tools"
    exit 1
  fi
fi

# Verify kernel module loads
if ! lsmod | grep -q wireguard 2>/dev/null; then
  if [ "$EUID" -eq 0 ]; then
    modprobe wireguard 2>/dev/null || true
  else
    sudo modprobe wireguard 2>/dev/null || true
  fi
fi

# ---------------------------------------------------------------------------
# Generate keypair
# ---------------------------------------------------------------------------

print_header "Generating WireGuard Keys"

mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"

PRIVKEY_FILE="$WG_DIR/private.key"
PUBKEY_FILE="$WG_DIR/public.key"

if [ -f "$PRIVKEY_FILE" ] && [ -f "$PUBKEY_FILE" ]; then
  print_ok "Keypair already exists"
else
  wg genkey | tee "$PRIVKEY_FILE" | wg pubkey > "$PUBKEY_FILE"
  chmod 600 "$PRIVKEY_FILE"
  chmod 644 "$PUBKEY_FILE"
  print_ok "New keypair generated"
fi

PUBLIC_KEY=$(cat "$PUBKEY_FILE")
PRIVATE_KEY=$(cat "$PRIVKEY_FILE")
print_step "Public key: ${PUBLIC_KEY:0:12}..."

# ---------------------------------------------------------------------------
# Provision with supernode
# ---------------------------------------------------------------------------

print_header "Provisioning WireGuard Tunnel"

PROVISION_FILE="$WG_DIR/provision.json"

# Check for cached provision
if [ -f "$PROVISION_FILE" ]; then
  CACHED_IP=$(python3 -c "import json; print(json.load(open('$PROVISION_FILE')).get('assignedIP',''))" 2>/dev/null || true)
  if [ -n "$CACHED_IP" ]; then
    print_ok "Using cached provision: $CACHED_IP"
    ASSIGNED_IP="$CACHED_IP"
    SERVER_PUBKEY=$(python3 -c "import json; print(json.load(open('$PROVISION_FILE')).get('serverPublicKey',''))" 2>/dev/null)
    SERVER_ENDPOINT=$(python3 -c "import json; print(json.load(open('$PROVISION_FILE')).get('serverEndpoint',''))" 2>/dev/null)
    SERVER_IP=$(python3 -c "import json; print(json.load(open('$PROVISION_FILE')).get('serverIP',''))" 2>/dev/null)
  fi
fi

if [ -z "${ASSIGNED_IP:-}" ]; then
  print_step "Requesting tunnel from $GATEWAY_URL..."

  PROVISION_BODY="{\"username\":\"$USERNAME\",\"publicKey\":\"$PUBLIC_KEY\""
  if [ -n "$NODE_ID" ]; then
    PROVISION_BODY="$PROVISION_BODY,\"nodeId\":\"$NODE_ID\""
  fi
  PROVISION_BODY="$PROVISION_BODY}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$PROVISION_BODY" \
    "$GATEWAY_URL/api/wg/register" 2>&1)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" != "200" ]; then
    print_error "Provisioning failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
    echo ""
    echo "Common issues:"
    echo "  - Username not registered yet: register first via the PC2 node"
    echo "  - WireGuard not enabled on gateway: ask the supernode operator to run setup-wireguard-server.sh"
    echo "  - Network issue: check that $GATEWAY_URL is reachable"
    exit 1
  fi

  ASSIGNED_IP=$(echo "$RESPONSE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['assignedIP'])" 2>/dev/null)
  SERVER_PUBKEY=$(echo "$RESPONSE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['serverPublicKey'])" 2>/dev/null)
  SERVER_ENDPOINT=$(echo "$RESPONSE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['serverEndpoint'])" 2>/dev/null)
  SERVER_IP=$(echo "$RESPONSE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('serverIP','10.100.0.1'))" 2>/dev/null)

  if [ -z "$ASSIGNED_IP" ] || [ -z "$SERVER_PUBKEY" ] || [ -z "$SERVER_ENDPOINT" ]; then
    print_error "Invalid provisioning response: $RESPONSE_BODY"
    exit 1
  fi

  # Cache the provision
  echo "$RESPONSE_BODY" > "$PROVISION_FILE"
  print_ok "Provisioned: $ASSIGNED_IP via $SERVER_ENDPOINT"
fi

# ---------------------------------------------------------------------------
# Configure WireGuard interface
# ---------------------------------------------------------------------------

print_header "Configuring WireGuard Interface"

WG_CONF="$WG_DIR/${WG_INTERFACE}.conf"

cat > "$WG_CONF" << EOF
[Interface]
Address = ${ASSIGNED_IP}/32
PrivateKey = ${PRIVATE_KEY}

[Peer]
PublicKey = ${SERVER_PUBKEY}
Endpoint = ${SERVER_ENDPOINT}
AllowedIPs = ${SERVER_IP}/32
PersistentKeepalive = 25
EOF

chmod 600 "$WG_CONF"
print_ok "Config written to $WG_CONF"

# ---------------------------------------------------------------------------
# Bring up the tunnel
# ---------------------------------------------------------------------------

print_header "Starting WireGuard Tunnel"

# Bring down if already running
if [ "$EUID" -eq 0 ]; then
  wg-quick down "$WG_CONF" 2>/dev/null || true
  wg-quick up "$WG_CONF"
else
  sudo wg-quick down "$WG_CONF" 2>/dev/null || true
  sudo wg-quick up "$WG_CONF"
fi

print_ok "WireGuard interface $WG_INTERFACE is up"

# ---------------------------------------------------------------------------
# Verify connectivity
# ---------------------------------------------------------------------------

print_header "Verifying Tunnel"

print_step "Pinging supernode through tunnel ($SERVER_IP)..."
if ping -c 3 -W 3 "$SERVER_IP" &>/dev/null; then
  print_ok "Tunnel verified -- supernode reachable at $SERVER_IP"
else
  print_warn "Ping to $SERVER_IP failed -- tunnel may need a moment to establish"
  print_step "Retrying in 3 seconds..."
  sleep 3
  if ping -c 3 -W 5 "$SERVER_IP" &>/dev/null; then
    print_ok "Tunnel verified on retry"
  else
    print_warn "Tunnel not responding to ping (this may be normal if ICMP is filtered)"
    print_step "The tunnel may still work for TCP traffic"
  fi
fi

# Show interface status
echo ""
if [ "$EUID" -eq 0 ]; then
  wg show "$WG_INTERFACE" 2>/dev/null || true
else
  sudo wg show "$WG_INTERFACE" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Create systemd service for auto-start (optional)
# ---------------------------------------------------------------------------

if [ "$EUID" -eq 0 ] || command -v sudo &>/dev/null; then
  SERVICE_FILE="/etc/systemd/system/pc2-wireguard.service"

  SERVICE_CONTENT="[Unit]
Description=PC2 WireGuard Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$(which wg-quick) up ${WG_CONF}
ExecStop=$(which wg-quick) down ${WG_CONF}

[Install]
WantedBy=multi-user.target"

  if [ "$EUID" -eq 0 ]; then
    echo "$SERVICE_CONTENT" > "$SERVICE_FILE"
    systemctl daemon-reload
    systemctl enable pc2-wireguard 2>/dev/null || true
    print_ok "Systemd service created and enabled (auto-starts on boot)"
  else
    echo "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable pc2-wireguard 2>/dev/null || true
    print_ok "Systemd service created and enabled (auto-starts on boot)"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print_header "WireGuard Client Ready"

echo -e "  Username:     ${BLUE}${USERNAME}${NC}"
echo -e "  Assigned IP:  ${BLUE}${ASSIGNED_IP}${NC}"
echo -e "  Server:       ${BLUE}${SERVER_ENDPOINT}${NC}"
echo -e "  Interface:    ${BLUE}${WG_INTERFACE}${NC}"
echo -e "  Config:       ${BLUE}${WG_CONF}${NC}"
echo ""
echo "  Your PC2 node is now reachable from the supernode at:"
echo -e "    ${GREEN}http://${ASSIGNED_IP}:4200${NC}"
echo ""
echo "  Once the PC2 node registers this endpoint, your domain will be:"
echo -e "    ${GREEN}https://${USERNAME}.ela.city${NC}"
echo ""
echo "  Useful commands:"
echo "    sudo wg show $WG_INTERFACE          # Show tunnel status"
echo "    ping $SERVER_IP                      # Test tunnel connectivity"
echo "    sudo systemctl restart pc2-wireguard # Restart tunnel"
echo "    sudo systemctl status pc2-wireguard  # Check service status"
echo ""
print_ok "Setup complete. Your PC2 node now has a high-performance tunnel to the supernode."
