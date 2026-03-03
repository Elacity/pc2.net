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

IS_JETSON=false
if [ -f /etc/nv_tegra_release ]; then
  IS_JETSON=true
fi

if command -v wg &>/dev/null && command -v wg-quick &>/dev/null; then
  print_ok "WireGuard tools already installed"
else
  apt-get update -qq

  if (( KERNEL_MAJOR > 5 || (KERNEL_MAJOR == 5 && KERNEL_MINOR >= 6) )) && [ "$IS_JETSON" = false ]; then
    print_step "Kernel $KERNEL_VERSION has built-in WireGuard -- installing tools only"
    apt-get install -y -qq wireguard-tools
  elif [ "$IS_JETSON" = true ]; then
    print_step "NVIDIA Jetson detected -- installing tools only (custom kernel)"
    apt-get install -y -qq wireguard-tools
  else
    print_step "Kernel $KERNEL_VERSION needs DKMS WireGuard module"
    apt-get install -y -qq wireguard
  fi

  if command -v wg &>/dev/null; then
    print_ok "WireGuard tools installed successfully"
  else
    print_error "Failed to install WireGuard tools"
    echo "  Try manually: apt install wireguard-tools"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Step 2: Load WireGuard kernel module (or install userspace fallback)
#
# NVIDIA Jetson ships a custom kernel without the WireGuard module.
# Building it from source requires downloading the BSP and compiling
# three kernel modules (wireguard.ko, libchacha20poly1305.ko, poly1305-neon.ko).
# See: https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson
#
# As a zero-effort fallback, we install wireguard-go (userspace implementation).
# It's slower than kernel WireGuard but still far faster than Boson relay.
# wg-quick auto-detects and uses it when the kernel module is absent.
# ---------------------------------------------------------------------------

WG_MODE="kernel"

if lsmod | grep -q wireguard 2>/dev/null; then
  print_ok "WireGuard kernel module already loaded"
elif modprobe wireguard 2>/dev/null && lsmod | grep -q wireguard 2>/dev/null; then
  print_ok "WireGuard kernel module loaded"
else
  # Kernel module not available -- need userspace fallback
  WG_MODE="none"

  if [ "$IS_JETSON" = true ]; then
    print_warn "Jetson custom kernel does not include WireGuard module"
  else
    print_warn "WireGuard kernel module not available"
  fi

  if command -v wireguard-go &>/dev/null; then
    print_ok "wireguard-go (userspace) already installed"
    WG_MODE="userspace"
  else
    print_step "Installing wireguard-go (userspace WireGuard)..."

    # Try apt first (available on some distros)
    if apt-get install -y -qq wireguard-go 2>/dev/null && command -v wireguard-go &>/dev/null; then
      print_ok "wireguard-go installed via apt"
      WG_MODE="userspace"
    else
      # Build from source -- requires Go
      if ! command -v go &>/dev/null; then
        print_step "Installing Go compiler for wireguard-go build..."
        apt-get install -y -qq golang-go 2>/dev/null || apt-get install -y -qq golang 2>/dev/null || true
      fi

      if command -v go &>/dev/null; then
        print_step "Building wireguard-go from source..."
        TMPDIR_WG=$(mktemp -d)
        if git clone --depth 1 https://git.zx2c4.com/wireguard-go "$TMPDIR_WG/wireguard-go" 2>/dev/null; then
          cd "$TMPDIR_WG/wireguard-go"
          if make 2>/dev/null; then
            cp wireguard-go /usr/local/bin/
            chmod +x /usr/local/bin/wireguard-go
            print_ok "wireguard-go built and installed to /usr/local/bin/"
            WG_MODE="userspace"
          else
            print_warn "wireguard-go build failed"
          fi
          cd - >/dev/null
        else
          print_warn "Failed to clone wireguard-go repository"
        fi
        rm -rf "$TMPDIR_WG"
      else
        print_warn "Go compiler not available, cannot build wireguard-go"
      fi
    fi
  fi

  if [ "$WG_MODE" = "userspace" ]; then
    print_ok "WireGuard will use userspace mode (wireguard-go)"
    echo ""
    if [ "$IS_JETSON" = true ]; then
      print_step "For best performance, you can build the kernel module:"
      echo "  See: https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson"
      echo ""
    fi
  else
    print_warn "WireGuard not available -- will fall back to Boson relay"
    echo "  The node will still work but with slower connectivity."
    if [ "$IS_JETSON" = true ]; then
      echo ""
      echo "  To enable WireGuard on Jetson, build the kernel module:"
      echo "  https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson"
      echo ""
      echo "  Or install wireguard-go manually:"
      echo "  https://git.zx2c4.com/wireguard-go"
    fi
  fi
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

if command -v wg-quick &>/dev/null; then
  SUDOERS_FILE="/etc/sudoers.d/pc2-wireguard"
  WG_QUICK_PATH=$(which wg-quick)

  if [ -f "$SUDOERS_FILE" ] && grep -q "SETENV" "$SUDOERS_FILE" 2>/dev/null; then
    print_ok "Sudoers rule already exists (with SETENV)"
  else
    # Regenerate if missing or if old rule lacks SETENV (needed for wireguard-go)
    rm -f "$SUDOERS_FILE" 2>/dev/null
    cat > "$SUDOERS_FILE" << EOF
# Allow any user to manage WireGuard via wg-quick without a password.
# This enables the PC2 node process to activate WireGuard tunnels
# automatically after the setup wizard completes.
# SETENV allows passing WG_QUICK_USERSPACE_IMPLEMENTATION through sudo -E
# which is required for wireguard-go (userspace mode) on Jetson/ARM devices.
ALL ALL=(root) NOPASSWD: SETENV: ${WG_QUICK_PATH} up *, ${WG_QUICK_PATH} down *
EOF
    chmod 440 "$SUDOERS_FILE"

    if visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
      print_ok "Sudoers rule configured: passwordless wg-quick for all users"
    else
      print_error "Invalid sudoers file, removing"
      rm -f "$SUDOERS_FILE"
      exit 1
    fi
  fi
else
  print_warn "wg-quick not found, skipping sudoers configuration"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

print_header "Setup Complete"

if [ "$WG_MODE" = "kernel" ]; then
  echo "  WireGuard (kernel mode) is ready. Best performance."
elif [ "$WG_MODE" = "userspace" ]; then
  echo "  WireGuard (userspace/wireguard-go) is ready."
  echo "  Performance is good. For maximum speed, build the kernel module."
else
  echo "  WireGuard is NOT available. The node will use Boson relay (slower)."
fi
echo ""
echo "  The PC2 node can manage tunnels automatically."
echo ""
echo "  Next steps:"
echo -e "    ${BLUE}1.${NC} Start the node:  ${YELLOW}pm2 start ecosystem.config.cjs${NC}"
echo -e "    ${BLUE}2.${NC} Open:            ${YELLOW}http://localhost:4200${NC}"
echo -e "    ${BLUE}3.${NC} Complete the setup wizard (choose your username)"
echo -e "    ${BLUE}4.${NC} Your domain will be live with WireGuard automatically!"
echo ""
print_ok "Ready to start."
