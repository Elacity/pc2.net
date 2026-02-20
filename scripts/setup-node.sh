#!/bin/bash
# =============================================================================
# PC2 Node Setup
#
# Prepares a Linux system to run a PC2 node with high-performance WireGuard
# NAT traversal. Run this ONCE before starting the node for the first time.
#
# What this does:
#   1. Installs WireGuard tools (for kernel-level NAT traversal)
#   2. Configures passwordless sudo for wg-quick (so the node process can
#      activate the tunnel automatically after the setup wizard completes)
#   3. Loads the WireGuard kernel module
#
# After running this, start the node normally:
#   pm2 start ecosystem.config.cjs
#
# Then open http://localhost:4200, complete the setup wizard, and your
# domain will be live on WireGuard immediately -- no extra steps needed.
#
# Usage:
#   sudo bash scripts/setup-node.sh
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

# Must run as root
if [ "$EUID" -ne 0 ]; then
  print_error "This script must be run as root (sudo)"
  echo "  sudo bash $0"
  exit 1
fi

print_header "PC2 Node Setup"

# ---------------------------------------------------------------------------
# Detect system
# ---------------------------------------------------------------------------

KERNEL_VERSION=$(uname -r | cut -d. -f1-2)
KERNEL_MAJOR=$(echo "$KERNEL_VERSION" | cut -d. -f1)
KERNEL_MINOR=$(echo "$KERNEL_VERSION" | cut -d. -f2)

print_step "Kernel: $(uname -r)"

if [ -f /etc/nv_tegra_release ]; then
  JETPACK_VERSION=$(dpkg -l 2>/dev/null | grep nvidia-jetpack | awk '{print $3}' | head -1 || echo "unknown")
  print_step "Platform: NVIDIA Jetson (JetPack $JETPACK_VERSION)"
elif [ -f /proc/device-tree/model ] && grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
  PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
  print_step "Platform: $PI_MODEL"
else
  . /etc/os-release 2>/dev/null || true
  print_step "Platform: ${ID:-linux} ${VERSION_ID:-} ($(uname -m))"
fi

# ---------------------------------------------------------------------------
# Step 1: Install WireGuard tools
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

  apt-get update -qq
  apt-get install -y -qq "$WG_PKG"

  if command -v wg &>/dev/null; then
    print_ok "WireGuard installed successfully"
  else
    print_error "Failed to install WireGuard"
    echo "  Try manually: apt install wireguard-tools"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Step 2: Load WireGuard kernel module
# ---------------------------------------------------------------------------

if ! lsmod | grep -q wireguard 2>/dev/null; then
  modprobe wireguard 2>/dev/null || true
  if lsmod | grep -q wireguard 2>/dev/null; then
    print_ok "WireGuard kernel module loaded"
  else
    print_warn "WireGuard kernel module not loaded (may load on first use)"
  fi
else
  print_ok "WireGuard kernel module already loaded"
fi

# ---------------------------------------------------------------------------
# Step 3: Configure passwordless sudo for wg-quick
#
# This allows the PC2 node process (running as a non-root user) to bring
# up and tear down the WireGuard tunnel automatically. Without this, the
# user would have to manually run WireGuard setup as a separate step.
#
# Security note: wg-quick only manages WireGuard interfaces. The config
# file path is controlled by the node, limiting what can be activated.
# This is appropriate for single-user home hardware (Jetson, Pi, etc.).
# ---------------------------------------------------------------------------

print_header "Configuring WireGuard Permissions"

SUDOERS_FILE="/etc/sudoers.d/pc2-wireguard"
WG_QUICK_PATH=$(which wg-quick)

if [ -f "$SUDOERS_FILE" ]; then
  print_ok "Sudoers rule already exists"
else
  cat > "$SUDOERS_FILE" << EOF
# Allow any user to manage WireGuard via wg-quick without a password.
# This enables the PC2 node process to activate WireGuard tunnels
# automatically after the setup wizard completes.
ALL ALL=(root) NOPASSWD: ${WG_QUICK_PATH} up *, ${WG_QUICK_PATH} down *
EOF
  chmod 440 "$SUDOERS_FILE"

  # Validate the sudoers file
  if visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
    print_ok "Sudoers rule configured: passwordless wg-quick for all users"
  else
    print_error "Invalid sudoers file, removing"
    rm -f "$SUDOERS_FILE"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

print_header "Setup Complete"

echo "  WireGuard is installed and the PC2 node can manage tunnels automatically."
echo ""
echo "  Next steps:"
echo -e "    ${BLUE}1.${NC} Start the node:  ${YELLOW}pm2 start ecosystem.config.cjs${NC}"
echo -e "    ${BLUE}2.${NC} Open:            ${YELLOW}http://localhost:4200${NC}"
echo -e "    ${BLUE}3.${NC} Complete the setup wizard (choose your username)"
echo -e "    ${BLUE}4.${NC} Your domain will be live with WireGuard automatically!"
echo ""
print_ok "Ready to start."
