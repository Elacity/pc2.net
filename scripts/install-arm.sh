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
PC2_DIR="${PC2_DIR:-$HOME/pc2.net}"
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
        JETPACK_VERSION=$(dpkg -l 2>/dev/null | grep nvidia-jetpack | awk '{print $3}' | head -1 || echo "unknown")
        print_step "Platform: NVIDIA Jetson (JetPack $JETPACK_VERSION)"
    elif [ -f /proc/device-tree/model ] && grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
        PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
        print_step "Platform: $PI_MODEL"
    else
        . /etc/os-release 2>/dev/null || true
        print_step "Platform: ${ID:-linux} ${VERSION_ID:-} ($(uname -m))"
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

    print_step "Installing PM2 process manager..."
    sudo npm install -g pm2
    print_ok "PM2 installed"
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
                    print_step "Building wireguard-go from source (takes 1-2 minutes)..."
                    TMPDIR_WG=$(mktemp -d)
                    if git clone --depth 1 https://git.zx2c4.com/wireguard-go "$TMPDIR_WG/wireguard-go" 2>/dev/null; then
                        cd "$TMPDIR_WG/wireguard-go"
                        if make 2>/dev/null; then
                            sudo cp wireguard-go /usr/local/bin/
                            sudo chmod +x /usr/local/bin/wireguard-go
                            print_ok "wireguard-go built and installed"
                            WG_MODE="userspace"
                        else
                            print_warn "wireguard-go build failed"
                        fi
                        cd "$HOME"
                    else
                        print_warn "Failed to clone wireguard-go repository"
                    fi
                    rm -rf "$TMPDIR_WG"
                else
                    print_warn "Go compiler not available, cannot build wireguard-go"
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
# Clone and build PC2
# ─────────────────────────────────────────────────────────────────────────────

install_pc2() {
    echo ""
    print_step "Installing PC2 to ${PC2_DIR}..."

    if [ -d "$PC2_DIR" ]; then
        print_warn "Existing installation found. Updating..."
        cd "$PC2_DIR"
        git pull origin "$REPO_BRANCH"
    else
        git clone -b "$REPO_BRANCH" "$REPO_URL" "$PC2_DIR"
        cd "$PC2_DIR"
    fi

    # Create particle-auth .env if it doesn't exist (required for build)
    PARTICLE_ENV="$PC2_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        print_step "Setting up Particle Network configuration..."
        mkdir -p "$PC2_DIR/packages/particle-auth"
        cat > "$PARTICLE_ENV" << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        print_ok "Particle Network configured"
    fi

    print_step "Installing dependencies (this takes a few minutes on ARM)..."
    npm install --legacy-peer-deps --ignore-scripts || true

    cd pc2-node
    npm install --legacy-peer-deps || true
    cd ..

    # Rebuild native modules (canvas is optional — if it fails, thumbnails just won't work)
    print_step "Building native modules..."
    npm rebuild 2>&1 || true
    cd pc2-node
    npm rebuild sharp 2>&1 || true
    npm rebuild canvas 2>&1 || print_warn "Canvas compilation failed (thumbnails for PDFs/text disabled). This is optional and non-critical."
    npm rebuild 2>&1 || true
    cd ..

    print_step "Building PC2..."
    npm run build:pc2

    print_ok "PC2 installed and built"
}

# ─────────────────────────────────────────────────────────────────────────────
# Start PC2 with PM2
# ─────────────────────────────────────────────────────────────────────────────

start_pc2() {
    echo ""
    print_step "Starting PC2 with PM2..."

    cd "$PC2_DIR"

    # Stop any existing instance
    pm2 delete pc2 2>/dev/null || true

    # Start with ecosystem config
    pm2 start ecosystem.config.cjs

    # Save PM2 process list so it survives reboot
    pm2 save

    # Set up PM2 to start on boot (sudo credentials are already cached from earlier steps)
    NODE_BIN_DIR=$(dirname "$(which node)")
    PM2_BIN=$(which pm2)
    sudo env PATH=$PATH:$NODE_BIN_DIR $PM2_BIN startup systemd -u $USER --hp $HOME 2>/dev/null || true
    pm2 save 2>/dev/null || true

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
    echo -e "${GREEN}║                                                                   ║${NC}"
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
    install_prerequisites
    install_nodejs
    install_pm2
    install_wireguard
    install_pc2
    start_pc2
    print_success
}

main
