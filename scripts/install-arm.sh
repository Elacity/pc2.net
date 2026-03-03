#!/bin/bash
#
# PC2 ARM Installation Script
# For Raspberry Pi 4/5 and Jetson Orin Nano
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
#
# What this does:
#   1. Installs Node.js 20, PM2, build tools
#   2. Clones PC2 and builds it
#   3. Installs WireGuard (kernel module or wireguard-go fallback for Jetson)
#   4. Configures permissions so PC2 can manage WireGuard tunnels automatically
#   5. Starts PC2 with PM2
#
# After this, just:
#   1. Open http://<device-ip>:4200 in your browser
#   2. Login with your wallet
#   3. Choose your domain name in the setup wizard
#   4. PC2 automatically activates WireGuard and your domain goes live
#
# That's it. One command. The wizard handles the rest.
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
# When run via sudo, $HOME is /root. Resolve the REAL user's home to avoid
# creating a duplicate installation under /root/pc2.net.
if [ -n "$SUDO_USER" ]; then
    REAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    REAL_USER="$SUDO_USER"
else
    REAL_HOME="$HOME"
    REAL_USER="$(whoami)"
fi
PC2_DIR="${PC2_DIR:-$REAL_HOME/pc2.net}"
PC2_PORT="${PC2_PORT:-4200}"
REPO_URL="https://github.com/Elacity/pc2.net.git"
REPO_BRANCH="${PC2_BRANCH:-main}"

# Print banner
print_banner() {
    echo ""
    echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}███████╗██╗      █████╗ ███████╗████████╗ ██████╗ ███████╗${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}██╔════╝██║     ██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}█████╗  ██║     ███████║███████╗   ██║   ██║   ██║███████╗${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}██╔══╝  ██║     ██╔══██║╚════██║   ██║   ██║   ██║╚════██║${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}███████╗███████╗██║  ██║███████║   ██║   ╚██████╔╝███████║${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║   ${CYAN}╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚══════╝${PURPLE}    ║${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}║            ${NC}🌐  Personal Cloud Computer (ARM)  🌐${PURPLE}                 ║${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}║       ${NC}Raspberry Pi 4/5  •  Jetson Orin Nano  •  ARM64${PURPLE}            ║${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step()  { echo -e "${GREEN}▶${NC} $1"; }
print_ok()    { echo -e "${GREEN}✓${NC} $1"; }
print_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# ─────────────────────────────────────────────────────────────────────────────
# Check architecture
# ─────────────────────────────────────────────────────────────────────────────

check_arch() {
    ARCH=$(uname -m)
    echo -e "${CYAN}Detected architecture: ${ARCH}${NC}"

    if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv7l" && "$ARCH" != "arm64" ]]; then
        print_warn "This script is optimized for ARM devices. Detected: ${ARCH}. Continuing anyway..."
    else
        print_ok "ARM architecture confirmed"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Detect platform (Jetson, Pi, generic Linux)
# ─────────────────────────────────────────────────────────────────────────────

IS_JETSON=false

detect_platform() {
    if [ -f /etc/nv_tegra_release ]; then
        IS_JETSON=true

        # Detect JetPack version from multiple sources
        JETPACK_VERSION=""
        L4T_VERSION=""

        # Source 1: nvidia-jetpack metapackage (not always installed)
        JETPACK_VERSION=$(dpkg -l 2>/dev/null | grep nvidia-jetpack | awk '{print $3}' | head -1)

        # Source 2: nvidia-l4t-core package version (more reliable)
        if [ -z "$JETPACK_VERSION" ]; then
            L4T_VERSION=$(dpkg -l 2>/dev/null | grep nvidia-l4t-core | awk '{print $3}' | head -1 | grep -oP '^\d+\.\d+')
        fi

        # Source 3: /etc/nv_tegra_release (always present)
        if [ -z "$L4T_VERSION" ]; then
            L4T_VERSION=$(head -1 /etc/nv_tegra_release | grep -oP 'R\K\d+' 2>/dev/null)
            [ -n "$L4T_VERSION" ] && L4T_VERSION="${L4T_VERSION}.0"
        fi

        # Map L4T version to JetPack version
        if [ -z "$JETPACK_VERSION" ] && [ -n "$L4T_VERSION" ]; then
            L4T_MAJOR=$(echo "$L4T_VERSION" | cut -d. -f1)
            case "$L4T_MAJOR" in
                36) JETPACK_VERSION="6.x (L4T ${L4T_VERSION})" ;;
                35) JETPACK_VERSION="5.x (L4T ${L4T_VERSION})" ;;
                32) JETPACK_VERSION="4.x (L4T ${L4T_VERSION})" ;;
                *)  JETPACK_VERSION="unknown (L4T ${L4T_VERSION})" ;;
            esac
        fi

        JETSON_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null | sed 's/NVIDIA //' || echo "Jetson")
        print_step "Platform: ${JETSON_MODEL} (JetPack ${JETPACK_VERSION:-unknown})"

        # Warn if JetPack is old
        if [ -n "$L4T_VERSION" ]; then
            L4T_MAJOR=$(echo "$L4T_VERSION" | cut -d. -f1)
            if [ "$L4T_MAJOR" -lt 35 ] 2>/dev/null; then
                print_warn "JetPack ${JETPACK_VERSION} is old -- JetPack 6.x (L4T R36+) recommended for best performance"
            fi
        fi
    elif [ -f /proc/device-tree/model ] && grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
        PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
        print_step "Platform: $PI_MODEL"
    else
        . /etc/os-release 2>/dev/null || true
        print_step "Platform: ${ID:-linux} ${VERSION_ID:-} ($(uname -m))"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Optimize Jetson power mode for best performance
#
# Jetson Orin Nano ships with multiple power modes. The install script
# checks the current mode and upgrades to 25W if running at a lower
# setting, then locks clocks with jetson_clocks for consistent throughput.
# ─────────────────────────────────────────────────────────────────────────────

optimize_jetson_power() {
    if [ "$IS_JETSON" != true ]; then
        return
    fi

    if ! command -v nvpmodel &>/dev/null; then
        return
    fi

    CURRENT_MODE=$(nvpmodel -q 2>/dev/null | grep "NV Power Mode" | sed 's/.*: //')
    CURRENT_MODE_ID=$(nvpmodel -q 2>/dev/null | tail -1 | tr -d '[:space:]')

    if [ -z "$CURRENT_MODE" ]; then
        return
    fi

    print_step "Jetson power mode: ${CURRENT_MODE} (ID=${CURRENT_MODE_ID})"

    # Parse available modes to find the best one
    # Priority: 25W (ID varies) > current if already >= 25W
    BEST_MODE_ID=""
    HAS_25W=$(nvpmodel -p --verbose -f /etc/nvpmodel.conf 2>&1 | grep "POWER_MODEL.*NAME=25W" | grep -oP 'ID=\K[0-9]+')
    HAS_MAXN=$(nvpmodel -p --verbose -f /etc/nvpmodel.conf 2>&1 | grep -i "POWER_MODEL.*NAME=MAXN" | grep -oP 'ID=\K[0-9]+' | head -1)

    case "$CURRENT_MODE" in
        *25W*|*MAXN*)
            print_ok "Jetson already running at optimal power mode ($CURRENT_MODE)"
            ;;
        *)
            if [ -n "$HAS_25W" ]; then
                BEST_MODE_ID="$HAS_25W"
                print_step "Switching Jetson to 25W mode for best performance..."
                if nvpmodel -m "$BEST_MODE_ID" 2>/dev/null; then
                    print_ok "Jetson power mode set to 25W"
                else
                    print_warn "Failed to switch power mode (may need reboot)"
                fi
            elif [ -n "$HAS_MAXN" ]; then
                BEST_MODE_ID="$HAS_MAXN"
                print_step "Switching Jetson to MAXN mode for best performance..."
                if nvpmodel -m "$BEST_MODE_ID" 2>/dev/null; then
                    print_ok "Jetson power mode set to MAXN"
                else
                    print_warn "Failed to switch power mode (may need reboot)"
                fi
            else
                print_warn "Could not detect higher power mode -- staying at $CURRENT_MODE"
            fi
            ;;
    esac

    # Lock clocks at maximum for consistent server performance
    if command -v jetson_clocks &>/dev/null; then
        jetson_clocks 2>/dev/null && print_ok "Jetson clocks locked at maximum frequency" || true

        # Make jetson_clocks persistent across reboots via rc.local
        if ! grep -q "jetson_clocks" /etc/rc.local 2>/dev/null; then
            if [ ! -f /etc/rc.local ]; then
                cat > /etc/rc.local << 'RCLOCAL_EOF'
#!/bin/bash
jetson_clocks 2>/dev/null || true
exit 0
RCLOCAL_EOF
                chmod +x /etc/rc.local
            else
                sed -i '/^exit 0/i jetson_clocks 2>/dev/null || true' /etc/rc.local 2>/dev/null || true
            fi
            print_ok "Jetson clocks will persist across reboots"
        fi
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install system prerequisites
# ─────────────────────────────────────────────────────────────────────────────

install_prerequisites() {
    echo ""
    print_step "Installing system prerequisites..."

    sudo apt-get update -qq

    sudo apt-get install -y -qq git curl build-essential python3 \
        libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
        pkg-config

    # Increase file descriptor limit for IPFS (default 1024 is too low for multi-GB files)
    if ! grep -q "nofile 65536" /etc/security/limits.conf 2>/dev/null; then
        echo '* soft nofile 65536' | sudo tee -a /etc/security/limits.conf > /dev/null
        echo '* hard nofile 65536' | sudo tee -a /etc/security/limits.conf > /dev/null
        print_ok "File descriptor limit increased to 65536"
    fi
    # Also set via systemd for PM2-managed processes
    if ! grep -q "DefaultLimitNOFILE=65536" /etc/systemd/system.conf 2>/dev/null; then
        sudo sh -c 'echo "DefaultLimitNOFILE=65536" >> /etc/systemd/system.conf'
    fi

    print_ok "Prerequisites installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Node.js 20
# ─────────────────────────────────────────────────────────────────────────────

install_nodejs() {
    echo ""
    print_step "Checking Node.js..."

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
        if [ "$NODE_VERSION" -ge 20 ]; then
            print_ok "Node.js $(node -v) already installed"
            return
        fi
    fi

    print_step "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs

    print_ok "Node.js $(node -v) installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Install PM2
# ─────────────────────────────────────────────────────────────────────────────

install_pm2() {
    echo ""
    if command -v pm2 &> /dev/null; then
        print_ok "PM2 already installed"
        return
    fi

    print_step "Installing PM2 process manager and Yarn..."
    sudo npm install -g pm2 yarn
    print_ok "PM2 and Yarn installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Install WireGuard (kernel module or wireguard-go userspace fallback)
#
# This is critical for Jetson: NVIDIA ships a custom kernel without the
# WireGuard module. Rather than requiring users to rebuild their kernel,
# we install wireguard-go as an automatic fallback. The PC2 node detects
# this and uses it transparently.
# ─────────────────────────────────────────────────────────────────────────────

WG_MODE="none"

install_wireguard() {
    echo ""
    print_step "Setting up WireGuard for NAT traversal..."

    # Install wireguard tools (wg, wg-quick)
    if command -v wg &>/dev/null && command -v wg-quick &>/dev/null; then
        print_ok "WireGuard tools already installed"
    else
        sudo apt-get install -y -qq wireguard-tools
        if command -v wg &>/dev/null; then
            print_ok "WireGuard tools installed"
        else
            print_warn "Failed to install WireGuard tools -- will fall back to Boson relay"
            return
        fi
    fi

    # Try to load kernel module
    if lsmod | grep -q wireguard 2>/dev/null; then
        print_ok "WireGuard kernel module already loaded"
        WG_MODE="kernel"
    elif modprobe wireguard 2>/dev/null && lsmod | grep -q wireguard 2>/dev/null; then
        print_ok "WireGuard kernel module loaded"
        WG_MODE="kernel"
    elif modinfo wireguard &>/dev/null 2>&1; then
        print_ok "WireGuard kernel module available"
        WG_MODE="kernel"
    else
        # Kernel module not available -- install wireguard-go
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

            # Try apt first
            if sudo apt-get install -y -qq wireguard-go 2>/dev/null && command -v wireguard-go &>/dev/null; then
                print_ok "wireguard-go installed via apt"
                WG_MODE="userspace"
            else
                # Build from source -- requires Go
                if ! command -v go &>/dev/null; then
                    print_step "Installing Go compiler for wireguard-go build..."
                    sudo apt-get install -y -qq golang-go 2>/dev/null || sudo apt-get install -y -qq golang 2>/dev/null || true
                fi

                if command -v go &>/dev/null; then
                    GO_VERSION=$(go version 2>/dev/null | grep -oP 'go\K[0-9]+\.[0-9]+' || echo "0.0")
                    print_step "Building wireguard-go from source (Go $GO_VERSION, takes 1-2 minutes)..."
                    TMPDIR_WG=$(mktemp -d)
                    WG_BUILT=false

                    if git clone --depth 1 https://git.zx2c4.com/wireguard-go "$TMPDIR_WG/wireguard-go" 2>/dev/null; then
                        cd "$TMPDIR_WG/wireguard-go"
                        # Try make first (uses Makefile), fall back to direct go build
                        if make 2>&1; then
                            sudo cp wireguard-go /usr/local/bin/
                            sudo chmod +x /usr/local/bin/wireguard-go
                            WG_BUILT=true
                        elif go build -o wireguard-go 2>&1; then
                            sudo cp wireguard-go /usr/local/bin/
                            sudo chmod +x /usr/local/bin/wireguard-go
                            WG_BUILT=true
                        else
                            print_warn "wireguard-go source build failed (Go version may be too old, need 1.20+)"
                        fi
                        cd "$HOME"
                    fi
                    rm -rf "$TMPDIR_WG"

                    # If source build failed, try upgrading Go and retrying
                    if [ "$WG_BUILT" = false ]; then
                        print_step "Trying newer Go version via snap..."
                        if sudo snap install go --classic 2>/dev/null; then
                            export PATH="/snap/bin:$PATH"
                            TMPDIR_WG2=$(mktemp -d)
                            if git clone --depth 1 https://git.zx2c4.com/wireguard-go "$TMPDIR_WG2/wireguard-go" 2>/dev/null; then
                                cd "$TMPDIR_WG2/wireguard-go"
                                if make 2>&1 || go build -o wireguard-go 2>&1; then
                                    sudo cp wireguard-go /usr/local/bin/
                                    sudo chmod +x /usr/local/bin/wireguard-go
                                    WG_BUILT=true
                                fi
                                cd "$HOME"
                            fi
                            rm -rf "$TMPDIR_WG2"
                        fi
                    fi

                    if [ "$WG_BUILT" = true ]; then
                        print_ok "wireguard-go built and installed"
                        WG_MODE="userspace"
                    else
                        print_warn "Could not build wireguard-go -- will fall back to Boson relay"
                    fi
                else
                    print_warn "Go compiler not available, cannot build wireguard-go"
                    print_step "Installing Go compiler..."
                    sudo apt-get install -y -qq golang-go 2>/dev/null || sudo snap install go --classic 2>/dev/null || true
                    if command -v go &>/dev/null; then
                        print_step "Retrying wireguard-go build..."
                        TMPDIR_WG=$(mktemp -d)
                        if git clone --depth 1 https://git.zx2c4.com/wireguard-go "$TMPDIR_WG/wireguard-go" 2>/dev/null; then
                            cd "$TMPDIR_WG/wireguard-go"
                            if make 2>&1 || go build -o wireguard-go 2>&1; then
                                sudo cp wireguard-go /usr/local/bin/
                                sudo chmod +x /usr/local/bin/wireguard-go
                                print_ok "wireguard-go built and installed"
                                WG_MODE="userspace"
                            else
                                print_warn "wireguard-go build failed even with fresh Go"
                            fi
                            cd "$HOME"
                        fi
                        rm -rf "$TMPDIR_WG"
                    fi
                fi
            fi
        fi
    fi

    # Configure passwordless sudo for wg-quick so the PC2 node can
    # activate WireGuard tunnels automatically (no manual steps needed)
    if command -v wg-quick &>/dev/null; then
        SUDOERS_FILE="/etc/sudoers.d/pc2-wireguard"
        WG_QUICK_PATH=$(which wg-quick)

        if [ -f "$SUDOERS_FILE" ] && grep -q "SETENV" "$SUDOERS_FILE" 2>/dev/null; then
            print_ok "WireGuard permissions already configured"
        else
            sudo rm -f "$SUDOERS_FILE" 2>/dev/null
            sudo tee "$SUDOERS_FILE" > /dev/null << SUDOERS_EOF
# PC2: Allow wg-quick without password (SETENV for wireguard-go on Jetson)
ALL ALL=(root) NOPASSWD: SETENV: ${WG_QUICK_PATH} up *, ${WG_QUICK_PATH} down *
SUDOERS_EOF
            sudo chmod 440 "$SUDOERS_FILE"

            if sudo visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
                print_ok "WireGuard permissions configured"
            else
                print_error "Invalid sudoers file, removing"
                sudo rm -f "$SUDOERS_FILE"
            fi
        fi
    fi

    # Summary
    if [ "$WG_MODE" = "kernel" ]; then
        print_ok "WireGuard ready (kernel mode -- best performance)"
    elif [ "$WG_MODE" = "userspace" ]; then
        print_ok "WireGuard ready (userspace/wireguard-go -- good performance)"
        if [ "$IS_JETSON" = true ]; then
            echo -e "  ${CYAN}Tip: For max speed, build the kernel module:${NC}"
            echo "  https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson"
        fi
    else
        print_warn "WireGuard not available -- PC2 will use Boson relay (slower but works)"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install AmneziaWG stealth transport (DPI-resistant fallback)
#
# AmneziaWG is a WireGuard fork that adds transport-layer obfuscation,
# making tunnels undetectable by Deep Packet Inspection (used by China GFW,
# Russian ISP blocks, etc). It uses the same Go compiler already needed
# for wireguard-go, so this adds minimal overhead.
# ─────────────────────────────────────────────────────────────────────────────

AWG_READY=false

install_amneziawg() {
    echo ""
    print_step "Setting up AmneziaWG stealth transport (optional DPI-resistant fallback)..."

    # Check if already installed
    if command -v amneziawg-go &>/dev/null || test -x /usr/local/bin/amneziawg-go; then
        print_ok "AmneziaWG binary already installed"
        AWG_READY=true
    else
        GO_CMD="go"
        GO_MIN_VER="1.24"

        # Check if system Go exists and is new enough (amneziawg-go requires Go 1.24+)
        if command -v go &>/dev/null; then
            SYS_GO_VER=$(go version 2>/dev/null | grep -oP '\d+\.\d+' | head -1)
            if [[ "$(printf '%s\n' "$GO_MIN_VER" "$SYS_GO_VER" | sort -V | head -1)" != "$GO_MIN_VER" ]]; then
                print_warn "System Go ($SYS_GO_VER) is too old for amneziawg-go (needs $GO_MIN_VER+)"
                GO_CMD=""
            fi
        fi

        # Install recent Go if needed
        if [[ -z "$GO_CMD" ]] || ! command -v go &>/dev/null; then
            print_step "Installing Go $GO_MIN_VER for AmneziaWG build..."
            GO_INSTALL_VER="1.24.4"
            GO_TMP=$(mktemp -d)
            ARCH=$(dpkg --print-architecture 2>/dev/null || echo "arm64")
            if wget -q "https://go.dev/dl/go${GO_INSTALL_VER}.linux-${ARCH}.tar.gz" -O "$GO_TMP/go.tar.gz" 2>/dev/null || \
               curl -sL "https://go.dev/dl/go${GO_INSTALL_VER}.linux-${ARCH}.tar.gz" -o "$GO_TMP/go.tar.gz"; then
                sudo rm -rf /usr/local/go-awg
                sudo tar -C /usr/local -xzf "$GO_TMP/go.tar.gz"
                sudo mv /usr/local/go /usr/local/go-awg
                GO_CMD="/usr/local/go-awg/bin/go"
                print_ok "Go ${GO_INSTALL_VER} installed to /usr/local/go-awg"
            else
                print_warn "Failed to download Go ${GO_INSTALL_VER}"
            fi
            rm -rf "$GO_TMP"
        fi

        if [[ -n "$GO_CMD" ]]; then
            print_step "Building amneziawg-go from source (takes 1-2 minutes)..."
            AWG_BUILD_TMP=$(mktemp -d)
            if git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git "$AWG_BUILD_TMP/amneziawg-go" 2>/dev/null; then
                if sudo bash -c "export PATH='$(dirname $GO_CMD)':\$PATH && cd '$AWG_BUILD_TMP/amneziawg-go' && make" 2>&1; then
                    if test -x "$AWG_BUILD_TMP/amneziawg-go/amneziawg-go"; then
                        sudo cp "$AWG_BUILD_TMP/amneziawg-go/amneziawg-go" /usr/local/bin/amneziawg-go
                        sudo chmod 755 /usr/local/bin/amneziawg-go
                    fi
                fi
            fi
            sudo rm -rf "$AWG_BUILD_TMP"
            if test -x /usr/local/bin/amneziawg-go; then
                print_ok "AmneziaWG binary built and installed"
                AWG_READY=true
            else
                print_warn "AmneziaWG build failed -- stealth transport will not be available"
            fi
        else
            print_warn "Go compiler not available, cannot build AmneziaWG"
        fi
    fi

    # Install awg-quick (AmneziaWG interface manager)
    if command -v awg-quick &>/dev/null || test -x /usr/local/bin/awg-quick; then
        print_ok "AmneziaWG tools already installed"
    else
        print_step "Building AmneziaWG tools (awg, awg-quick)..."
        AWG_TOOLS_TMP=$(mktemp -d)
        if git clone --depth 1 https://github.com/amnezia-vpn/amnezia-wg-tools.git "$AWG_TOOLS_TMP" 2>/dev/null; then
            if [[ -d "$AWG_TOOLS_TMP/src" ]]; then
                (cd "$AWG_TOOLS_TMP/src" && make 2>&1 && sudo make install 2>&1) || true
            fi
        fi
        rm -rf "$AWG_TOOLS_TMP"
        if command -v awg-quick &>/dev/null || test -x /usr/local/bin/awg-quick; then
            print_ok "AmneziaWG tools installed"
        else
            print_warn "AmneziaWG tools build failed"
            AWG_READY=false
        fi
    fi

    # Configure passwordless sudo for awg-quick
    if command -v awg-quick &>/dev/null || test -x /usr/local/bin/awg-quick; then
        SUDOERS_FILE="/etc/sudoers.d/pc2-amneziawg"
        AWG_QUICK_PATH=$(which awg-quick 2>/dev/null || echo "/usr/local/bin/awg-quick")

        if [ -f "$SUDOERS_FILE" ]; then
            print_ok "AmneziaWG permissions already configured"
        else
            sudo tee "$SUDOERS_FILE" > /dev/null << SUDOERS_EOF
# PC2: Allow awg-quick without password (SETENV for amneziawg-go)
ALL ALL=(root) NOPASSWD: SETENV: ${AWG_QUICK_PATH} up *, ${AWG_QUICK_PATH} down *
SUDOERS_EOF
            sudo chmod 440 "$SUDOERS_FILE"

            if sudo visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
                print_ok "AmneziaWG permissions configured"
            else
                print_error "Invalid sudoers file, removing"
                sudo rm -f "$SUDOERS_FILE"
            fi
        fi
    fi

    if [ "$AWG_READY" = true ]; then
        print_ok "AmneziaWG stealth transport ready (DPI-resistant fallback)"
    else
        print_warn "AmneziaWG not available -- not a problem unless you're behind DPI (China/Russia)"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install sing-box (VLESS Reality TCP stealth transport)
# ─────────────────────────────────────────────────────────────────────────────
install_singbox() {
    echo ""
    print_step "Setting up sing-box (VLESS Reality TCP stealth transport)..."

    SINGBOX_VERSION="1.13.0"
    if command -v sing-box &>/dev/null || test -x /usr/local/bin/sing-box; then
        INSTALLED_VER=$(sing-box version 2>/dev/null | head -1 | awk '{print $NF}')
        if [ "$INSTALLED_VER" = "$SINGBOX_VERSION" ]; then
            print_ok "sing-box ${SINGBOX_VERSION} already installed"
            return
        fi
        print_step "Upgrading sing-box from ${INSTALLED_VER} to ${SINGBOX_VERSION}..."
    fi
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "arm64")
    SB_TMP=$(mktemp -d)

    print_step "Downloading sing-box v${SINGBOX_VERSION} for ${ARCH}..."
    wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -O "$SB_TMP/sing-box.tar.gz" 2>/dev/null || \
        curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -o "$SB_TMP/sing-box.tar.gz"

    (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && sudo cp sing-box-*/sing-box /usr/local/bin/sing-box && sudo chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
    rm -rf "$SB_TMP"

    if command -v sing-box &>/dev/null || test -x /usr/local/bin/sing-box; then
        print_ok "sing-box installed (VLESS Reality transport available)"
    else
        print_warn "sing-box installation failed (VLESS Reality will be unavailable)"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install voice AI tools (Whisper STT + Piper TTS + ffmpeg)
# Opt-in only — enable with INSTALL_VOICE=1
# Whisper uses ~500MB+ GPU memory which competes with Ollama on Jetson
# ─────────────────────────────────────────────────────────────────────────────

VOICE_READY=false

install_voice_tools() {
    if [ "${INSTALL_VOICE:-0}" != "1" ]; then
        return
    fi

    echo ""
    print_step "Installing voice AI tools (Whisper STT + Piper TTS)..."

    # ffmpeg (required for audio format conversion)
    if command -v ffmpeg &>/dev/null; then
        print_ok "ffmpeg already installed"
    else
        sudo apt-get install -y -qq ffmpeg
        if command -v ffmpeg &>/dev/null; then
            print_ok "ffmpeg installed"
        else
            print_warn "ffmpeg install failed — voice pipeline will not work"
            return
        fi
    fi

    # ── Whisper.cpp (STT) ──
    WHISPER_DIR="${WHISPER_DIR:-$HOME/whisper.cpp}"
    if [ -f "$WHISPER_DIR/build/bin/whisper-server" ]; then
        print_ok "whisper.cpp already built"
    else
        print_step "Building whisper.cpp from source (CUDA-accelerated if available)..."
        sudo apt-get install -y -qq cmake libcurl4-openssl-dev 2>/dev/null || true

        if [ -d "$WHISPER_DIR" ]; then
            cd "$WHISPER_DIR" && git pull
        else
            git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
        fi

        cd "$WHISPER_DIR"
        mkdir -p build && cd build

        # Detect CUDA for Jetson GPU acceleration
        if command -v nvcc &>/dev/null || [ -d /usr/local/cuda ]; then
            print_step "CUDA detected — building with GPU acceleration"
            cmake .. -DGGML_CUDA=ON -DWHISPER_BUILD_SERVER=ON
        else
            cmake .. -DWHISPER_BUILD_SERVER=ON
        fi

        cmake --build . --config Release -j$(nproc) 2>&1

        if [ -f "$WHISPER_DIR/build/bin/whisper-server" ]; then
            print_ok "whisper.cpp built successfully"
        else
            print_warn "whisper.cpp build failed"
            cd "$HOME"
            return
        fi
    fi

    # Download base.en model if not present
    WHISPER_MODEL="$WHISPER_DIR/models/ggml-base.en.bin"
    if [ -f "$WHISPER_MODEL" ]; then
        print_ok "Whisper model already downloaded"
    else
        print_step "Downloading Whisper base.en model (~142MB)..."
        cd "$WHISPER_DIR"
        bash models/download-ggml-model.sh base.en
        if [ -f "$WHISPER_MODEL" ]; then
            print_ok "Whisper model downloaded"
        else
            print_warn "Whisper model download failed"
        fi
    fi

    # Create whisper-server systemd service
    WHISPER_SERVICE="/etc/systemd/system/whisper-server.service"
    if [ ! -f "$WHISPER_SERVICE" ]; then
        print_step "Creating whisper-server systemd service..."
        sudo tee "$WHISPER_SERVICE" > /dev/null << WHISPER_EOF
[Unit]
Description=Whisper.cpp STT Server
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$WHISPER_DIR/build/bin/whisper-server -m $WHISPER_MODEL --host 127.0.0.1 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
WHISPER_EOF

        sudo systemctl daemon-reload
        sudo systemctl enable whisper-server
        sudo systemctl start whisper-server
        print_ok "whisper-server service created and started (port 8080)"
    else
        print_ok "whisper-server service already configured"
        sudo systemctl restart whisper-server 2>/dev/null || true
    fi

    # ── Piper TTS ──
    PIPER_DIR="${PIPER_DIR:-$HOME/piper}"
    if command -v piper &>/dev/null || [ -f "$PIPER_DIR/piper" ]; then
        print_ok "Piper TTS already installed"
    else
        print_step "Installing Piper TTS..."

        # Try pip install first (simpler)
        if command -v pip3 &>/dev/null; then
            pip3 install piper-tts 2>/dev/null || true
        fi

        if command -v piper &>/dev/null; then
            print_ok "Piper installed via pip"
        else
            # Download prebuilt binary for ARM
            print_step "Downloading Piper binary for ARM64..."
            mkdir -p "$PIPER_DIR"
            cd "$PIPER_DIR"
            PIPER_RELEASE="https://github.com/rhasspy/piper/releases/latest/download/piper_linux_aarch64.tar.gz"
            curl -sSL "$PIPER_RELEASE" | tar xz --strip-components=1 2>/dev/null || true

            if [ -f "$PIPER_DIR/piper" ]; then
                sudo ln -sf "$PIPER_DIR/piper" /usr/local/bin/piper
                print_ok "Piper installed from binary"
            else
                print_warn "Piper TTS installation failed — AI responses will be text-only"
                cd "$HOME"
                return
            fi
        fi
    fi

    # Download default voice model
    PIPER_VOICE_DIR="$PIPER_DIR/voices"
    PIPER_VOICE_FILE="$PIPER_VOICE_DIR/en_US-ryan-high.onnx"
    if [ -f "$PIPER_VOICE_FILE" ]; then
        print_ok "Piper voice model already downloaded"
    else
        print_step "Downloading Piper voice model (en_US-ryan-high)..."
        mkdir -p "$PIPER_VOICE_DIR"
        curl -sSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx" \
            -o "$PIPER_VOICE_FILE" 2>/dev/null || true
        curl -sSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ryan/high/en_US-ryan-high.onnx.json" \
            -o "${PIPER_VOICE_FILE}.json" 2>/dev/null || true

        if [ -f "$PIPER_VOICE_FILE" ]; then
            print_ok "Piper voice model downloaded"
        else
            print_warn "Voice model download failed — TTS will not work"
        fi
    fi

    VOICE_READY=true
    print_ok "Voice AI tools installed"
    cd "$HOME"
}

# ─────────────────────────────────────────────────────────────────────────────
# Clone and build PC2
# ─────────────────────────────────────────────────────────────────────────────

install_pc2() {
    echo ""
    print_step "Installing PC2 to ${PC2_DIR}..."

    # When running via sudo, clone/pull as the real user to keep correct ownership
    RUN_AS=""
    if [ -n "$SUDO_USER" ]; then
        RUN_AS="sudo -u $REAL_USER"
    fi

    if [ -d "$PC2_DIR" ]; then
        print_warn "Existing installation found. Updating..."
        cd "$PC2_DIR"
        $RUN_AS git pull origin "$REPO_BRANCH"
    else
        $RUN_AS git clone -b "$REPO_BRANCH" "$REPO_URL" "$PC2_DIR"
        cd "$PC2_DIR"
    fi

    # Create particle-auth .env if it doesn't exist (required for build)
    PARTICLE_ENV="$PC2_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        print_step "Setting up Particle Network configuration..."
        $RUN_AS mkdir -p "$PC2_DIR/packages/particle-auth"
        $RUN_AS tee "$PARTICLE_ENV" > /dev/null << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        print_ok "Particle Network configured"
    fi

    # Fix particle-auth build script — replace yarn with npm (yarn conflicts with cmdtest on Ubuntu/JetPack)
    if grep -q "yarn install" "$PC2_DIR/package.json" 2>/dev/null; then
        sed -i 's/yarn install/npm install --legacy-peer-deps/g; s/yarn build/npm run build/g' "$PC2_DIR/package.json"
        print_ok "Fixed particle-auth build script (yarn → npm)"
    fi

    print_step "Installing dependencies (this takes a few minutes on ARM)..."
    $RUN_AS npm install --legacy-peer-deps --ignore-scripts || true

    cd pc2-node
    $RUN_AS npm install --legacy-peer-deps || true
    cd ..

    # Rebuild native modules (canvas is optional — if it fails, thumbnails just won't work)
    print_step "Building native modules..."
    $RUN_AS npm rebuild 2>&1 || true
    cd pc2-node
    $RUN_AS npm rebuild sharp 2>&1 || true
    $RUN_AS npm rebuild canvas 2>&1 || print_warn "Canvas compilation failed (thumbnails for PDFs/text disabled). This is optional and non-critical."
    $RUN_AS npm rebuild 2>&1 || true
    cd ..

    print_step "Building PC2..."
    $RUN_AS npm run build:pc2

    print_ok "PC2 installed and built"
}

# ─────────────────────────────────────────────────────────────────────────────
# Start PC2 with PM2
# ─────────────────────────────────────────────────────────────────────────────

start_pc2() {
    echo ""
    print_step "Starting PC2 with PM2..."

    cd "$PC2_DIR"

    if [ -n "$SUDO_USER" ]; then
        # Running under sudo -- execute PM2 as the real user to avoid
        # creating a root-owned PM2 instance that hijacks port 4200
        sudo -u "$REAL_USER" bash -c "cd '$PC2_DIR' && pm2 delete pc2 2>/dev/null; pm2 start ecosystem.config.cjs && pm2 save"

        NODE_BIN_DIR=$(dirname "$(which node)")
        PM2_BIN=$(which pm2)
        env PATH=$PATH:$NODE_BIN_DIR $PM2_BIN startup systemd -u "$REAL_USER" --hp "$REAL_HOME" 2>/dev/null || true
        sudo -u "$REAL_USER" pm2 save 2>/dev/null || true
    else
        pm2 delete pc2 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save

        NODE_BIN_DIR=$(dirname "$(which node)")
        PM2_BIN=$(which pm2)
        sudo env PATH=$PATH:$NODE_BIN_DIR $PM2_BIN startup systemd -u $USER --hp $HOME 2>/dev/null || true
        pm2 save 2>/dev/null || true
    fi

    print_ok "PC2 running with PM2"
}

# ─────────────────────────────────────────────────────────────────────────────
# Success message
# ─────────────────────────────────────────────────────────────────────────────

print_success() {
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    echo ""
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║         ${CYAN}🌟 🌟 🌟   S U C C E S S !   🌟 🌟 🌟${GREEN}                   ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║     ${NC}PC2 is installed and running!${GREEN}                                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    if [ "$WG_MODE" = "kernel" ]; then
    echo -e "${GREEN}║     ${NC}WireGuard: ${CYAN}kernel mode (fastest)${GREEN}                            ║${NC}"
    elif [ "$WG_MODE" = "userspace" ]; then
    echo -e "${GREEN}║     ${NC}WireGuard: ${CYAN}userspace mode (wireguard-go)${GREEN}                    ║${NC}"
    else
    echo -e "${GREEN}║     ${NC}WireGuard: ${YELLOW}not available (using Boson relay)${GREEN}               ║${NC}"
    fi
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}📋 NEXT STEP:${GREEN}                                                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}1. Open your browser and go to:${GREEN}                                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║      ${YELLOW}➜  http://${LOCAL_IP}:${PC2_PORT}${GREEN}                               ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}2. Login with your wallet (MetaMask, WalletConnect, etc.)${GREEN}        ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}3. Choose your domain name in the setup wizard${GREEN}                   ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}4. ${CYAN}That's it!${NC} WireGuard activates automatically.${GREEN}               ║${NC}"
    echo -e "${GREEN}║      ${NC}Your node will be live at ${CYAN}https://yourname.ela.city${GREEN}        ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}USEFUL COMMANDS:${GREEN}                                              ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 logs pc2        ${GREEN}- View server logs                         ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 restart pc2     ${GREEN}- Restart the server                       ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 stop pc2        ${GREEN}- Stop the server                          ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 status          ${GREEN}- Check server status                      ║${NC}"
    echo -e "${GREEN}║     ${NC}sudo wg show wg0    ${GREEN}- Check WireGuard tunnel                   ║${NC}"
    if [ "$VOICE_READY" = true ]; then
    echo -e "${GREEN}║     ${NC}systemctl status whisper-server${GREEN} - Check voice STT            ║${NC}"
    fi
    echo -e "${GREEN}║                                                                   ║${NC}"
    if [ "$VOICE_READY" = true ]; then
    echo -e "${GREEN}║     ${NC}Voice AI: ${CYAN}enabled (Whisper + Piper)${GREEN}                           ║${NC}"
    fi
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    print_banner
    check_arch
    detect_platform
    optimize_jetson_power

    # Safety: if running via sudo and there's a rogue /root/pc2.net from a
    # previous bad install, warn and clean it up to prevent port conflicts
    if [ -n "$SUDO_USER" ] && [ -d "/root/pc2.net" ] && [ "$PC2_DIR" != "/root/pc2.net" ]; then
        print_warn "Found rogue PC2 installation at /root/pc2.net (from previous sudo install)"
        print_step "Cleaning up to prevent port 4200 conflict..."
        (cd /root/pc2.net && pm2 delete pc2 2>/dev/null) || true
        rm -rf /root/pc2.net
        print_ok "Rogue installation removed"
    fi
    install_prerequisites
    install_nodejs
    install_pm2
    install_wireguard
    install_amneziawg
    install_singbox
    install_voice_tools
    install_pc2
    start_pc2
    print_success
}

main
