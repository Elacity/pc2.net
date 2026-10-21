#!/bin/bash
#
# PC2 WSL Installation Script
# For Windows Subsystem for Linux (WSL2)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-wsl.sh | bash
#
# Prerequisites:
#   - Windows 10 (build 19041+) or Windows 11
#   - WSL2 with Ubuntu (wsl --install from PowerShell)
#
# What this does:
#   1. Validates WSL2 environment
#   2. Enables systemd if needed (requires WSL restart)
#   3. Installs Node.js 24, PM2, build tools
#   4. Clones and builds PC2
#   5. Installs transport binaries (WireGuard, AmneziaWG, sing-box)
#   6. Configures PM2 persistence across WSL restarts
#   7. Starts PC2
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

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
    echo -e "${PURPLE}║        ${NC}🌐  Personal Cloud Computer (Windows/WSL2)  🌐${PURPLE}             ║${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}║                  ${YELLOW}Presented by Elacity Labs${PURPLE}                      ║${NC}"
    echo -e "${PURPLE}║                                                                   ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step()  { echo -e "${CYAN}▶${NC} $1"; }
print_ok()    { echo -e "${GREEN}✓${NC} $1"; }
print_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Validate WSL environment
# ─────────────────────────────────────────────────────────────────────────────

validate_wsl() {
    print_step "Validating WSL environment..."

    if ! grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
        print_error "This script is for WSL (Windows Subsystem for Linux)."
        echo -e "  ${NC}For macOS/Linux, use: ${CYAN}curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash${NC}"
        echo -e "  ${NC}For ARM devices, use: ${CYAN}curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash${NC}"
        exit 1
    fi

    # Check WSL version (WSL2 required for networking)
    if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]] || [[ -d /run/WSL ]]; then
        print_ok "WSL2 detected"
    else
        print_warn "Cannot confirm WSL2. If you're on WSL1, networking may not work."
        echo -e "  ${NC}Upgrade: Open PowerShell as admin and run: ${CYAN}wsl --set-version Ubuntu 2${NC}"
    fi

    # Check available RAM
    TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
    if [[ $TOTAL_RAM_MB -lt 2048 ]]; then
        print_warn "Low RAM detected (${TOTAL_RAM_MB}MB). PC2 needs at least 2GB."
        echo -e "  ${NC}Increase WSL memory in ${CYAN}%USERPROFILE%\\.wslconfig${NC}:"
        echo -e "  ${NC}  [wsl2]"
        echo -e "  ${NC}  memory=4GB"
    else
        print_ok "RAM: ${TOTAL_RAM_MB}MB available"
    fi

    # Check available disk space
    AVAIL_GB=$(df -BG "$HOME" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')
    if [[ -n "$AVAIL_GB" ]] && [[ "$AVAIL_GB" -lt 10 ]]; then
        print_warn "Low disk space (${AVAIL_GB}GB free). PC2 needs ~5GB."
    else
        print_ok "Disk: ${AVAIL_GB:-unknown}GB available"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Check and enable systemd
# ─────────────────────────────────────────────────────────────────────────────

check_systemd() {
    print_step "Checking systemd..."

    if systemctl --version &>/dev/null && [[ "$(ps -p 1 -o comm=)" == "systemd" ]]; then
        print_ok "systemd is enabled and running"
        SYSTEMD_AVAILABLE=true
        return 0
    fi

    SYSTEMD_AVAILABLE=false

    # Check if /etc/wsl.conf already has systemd enabled
    if grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
        print_warn "systemd is configured but not running. Please restart WSL:"
        echo -e "  ${NC}1. Open PowerShell on Windows"
        echo -e "  ${NC}2. Run: ${CYAN}wsl --shutdown${NC}"
        echo -e "  ${NC}3. Reopen Ubuntu and run this script again"
        exit 1
    fi

    print_warn "systemd is not enabled. PM2 auto-start on boot requires systemd."
    echo ""
    echo -e "  ${NC}To enable systemd (recommended), this script will add to ${CYAN}/etc/wsl.conf${NC}:"
    echo -e "  ${NC}  [boot]"
    echo -e "  ${NC}  systemd=true"
    echo ""

    read -r -p "  Enable systemd now? (y/N): " ENABLE_SYSTEMD
    if [[ "$ENABLE_SYSTEMD" =~ ^[Yy]$ ]]; then
        if [[ -f /etc/wsl.conf ]]; then
            # Append to existing file if [boot] section doesn't exist
            if ! grep -q "\[boot\]" /etc/wsl.conf 2>/dev/null; then
                echo -e "\n[boot]\nsystemd=true" | sudo tee -a /etc/wsl.conf > /dev/null
            fi
        else
            echo -e "[boot]\nsystemd=true" | sudo tee /etc/wsl.conf > /dev/null
        fi
        print_ok "systemd enabled in /etc/wsl.conf"
        echo ""
        echo -e "  ${YELLOW}You must restart WSL for systemd to take effect:${NC}"
        echo -e "  ${NC}1. Open PowerShell on Windows"
        echo -e "  ${NC}2. Run: ${CYAN}wsl --shutdown${NC}"
        echo -e "  ${NC}3. Reopen Ubuntu and run this script again"
        echo ""
        echo -e "  ${NC}(The script will continue without systemd for now, but PM2 won't auto-start on boot.)${NC}"
        echo ""
    else
        print_warn "Skipping systemd. PC2 will work but won't auto-start after WSL restart."
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Install build dependencies
# ─────────────────────────────────────────────────────────────────────────────

install_build_deps() {
    print_step "Installing build dependencies..."

    if [[ $EUID -ne 0 ]]; then
        SUDO="sudo"
    else
        SUDO=""
    fi

    # node-pty requires: build-essential, python3
    # canvas requires: libcairo2-dev, libpango1.0-dev, libjpeg-dev, libgif-dev, librsvg2-dev
    # sharp requires: libvips-dev (or installs its own)
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq \
        build-essential \
        python3 \
        git \
        curl \
        ffmpeg \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        2>&1 | grep -v "is already the newest version" || true

    print_ok "Build dependencies installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Install Node.js via nvm
# ─────────────────────────────────────────────────────────────────────────────

install_node() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    if command -v node &>/dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$NODE_VERSION" -ge 24 ]]; then
            print_ok "Node.js $(node -v) already installed"
            return 0
        fi
    fi

    print_step "Installing Node.js 24 via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 24
    nvm use 24
    nvm alias default 24
    print_ok "Node.js $(node -v) installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Install PM2
# ─────────────────────────────────────────────────────────────────────────────

install_pm2() {
    if command -v pm2 &>/dev/null; then
        print_ok "PM2 already installed"
        return 0
    fi

    print_step "Installing PM2 process manager..."
    npm install -g pm2
    print_ok "PM2 installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Clone and build PC2
# ─────────────────────────────────────────────────────────────────────────────

clone_and_build() {
    PC2_DIR="$HOME/pc2.net"

    if [[ -d "$PC2_DIR/pc2-node" ]]; then
        print_ok "PC2 already cloned at $PC2_DIR"
        cd "$PC2_DIR"
        print_step "Pulling latest changes..."
        git pull --ff-only 2>/dev/null || true
    else
        print_step "Cloning PC2..."
        BRANCH="${PC2_BRANCH:-main}"
        git clone -b "$BRANCH" https://github.com/Elacity/pc2.net.git "$PC2_DIR"
        cd "$PC2_DIR"
        print_ok "PC2 downloaded (branch: $BRANCH)"
    fi

    # Create particle-auth .env if missing
    PARTICLE_ENV="$PC2_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        print_step "Configuring Particle Network..."
        cat > "$PARTICLE_ENV" << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        print_ok "Particle Network configured"
    fi

    print_step "Installing dependencies (this takes a few minutes)..."
    cd "$PC2_DIR"
    npm install --legacy-peer-deps --ignore-scripts 2>&1 || true
    cd "$PC2_DIR/pc2-node"
    if ! npm install --legacy-peer-deps --ignore-scripts 2>&1; then
        print_error "Failed to install dependencies"
        exit 1
    fi

    print_step "Building native modules (node-pty, @photostructure/sqlite, canvas)..."
    cd "$PC2_DIR"
    npm rebuild 2>&1 || true
    cd "$PC2_DIR/pc2-node"
    npm rebuild 2>&1 || true

    # Verify node-pty compiled successfully (most common WSL failure)
    if ! node -e "require('node-pty')" 2>/dev/null; then
        print_warn "node-pty failed to compile. Terminal app may not work."
        echo -e "  ${NC}Common fix: ${CYAN}sudo apt-get install -y build-essential python3${NC}"
        echo -e "  ${NC}Then re-run: ${CYAN}cd $PC2_DIR/pc2-node && npm rebuild${NC}"
    else
        print_ok "node-pty compiled successfully"
    fi

    print_step "Building PC2..."
    cd "$PC2_DIR/pc2-node"
    if ! npm run build 2>&1; then
        print_error "Build failed. Check errors above."
        exit 1
    fi
    print_ok "Build complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Install transport binaries
# ─────────────────────────────────────────────────────────────────────────────

install_transports() {
    print_step "Installing transport binaries..."

    ARCH=$(uname -m)
    [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]] && DEB_ARCH="amd64" || DEB_ARCH="arm64"

    # WireGuard
    if ! command -v wg &>/dev/null; then
        print_step "Installing WireGuard..."
        sudo apt-get install -y -qq wireguard-tools 2>&1 || true
    fi
    if command -v wg &>/dev/null; then
        print_ok "WireGuard installed"
        # Passwordless sudo for wg-quick
        WG_QUICK_PATH=$(which wg-quick 2>/dev/null)
        if [[ -n "$WG_QUICK_PATH" ]] && [[ ! -f /etc/sudoers.d/wireguard ]]; then
            sudo sh -c "echo '$(whoami) ALL=(ALL) NOPASSWD: ${WG_QUICK_PATH}' > /etc/sudoers.d/wireguard && chmod 440 /etc/sudoers.d/wireguard"
            print_ok "WireGuard permissions configured"
        fi
    else
        print_warn "WireGuard not available (will use relay fallback)"
    fi

    # sing-box (VLESS Reality)
    if ! command -v sing-box &>/dev/null && ! test -x /usr/local/bin/sing-box; then
        print_step "Installing sing-box (VLESS Reality transport)..."
        SINGBOX_VERSION="1.13.0"
        SB_TMP=$(mktemp -d)
        wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${DEB_ARCH}.tar.gz" \
            -O "$SB_TMP/sing-box.tar.gz" 2>/dev/null || \
        curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${DEB_ARCH}.tar.gz" \
            -o "$SB_TMP/sing-box.tar.gz"
        (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && sudo cp sing-box-*/sing-box /usr/local/bin/sing-box && sudo chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
        rm -rf "$SB_TMP"
    fi
    if command -v sing-box &>/dev/null || test -x /usr/local/bin/sing-box; then
        print_ok "sing-box installed"
    else
        print_warn "sing-box not available (VLESS Reality will be unavailable)"
    fi

    # AmneziaWG + awg-quick (built from source, needs Go)
    if ! command -v amneziawg-go &>/dev/null; then
        if command -v go &>/dev/null; then
            print_step "Building AmneziaWG from source..."
            AWG_BUILD_DIR=$(mktemp -d)
            (cd "$AWG_BUILD_DIR" && git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git 2>&1 && \
             cd amneziawg-go && make 2>&1 && sudo cp amneziawg-go /usr/local/bin/ && sudo chmod 755 /usr/local/bin/amneziawg-go) || true
            rm -rf "$AWG_BUILD_DIR"
        else
            print_warn "Go compiler not found. Skipping AmneziaWG (stealth transport)."
            echo -e "  ${NC}Install later: ${CYAN}sudo apt-get install -y golang-go && bash scripts/fix-networking.sh${NC}"
        fi
    fi
    if command -v amneziawg-go &>/dev/null; then
        print_ok "AmneziaWG installed"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 8: Configure PM2 persistence
# ─────────────────────────────────────────────────────────────────────────────

configure_persistence() {
    print_step "Configuring PM2 persistence..."

    if [[ "$SYSTEMD_AVAILABLE" == "true" ]]; then
        pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || true
        print_ok "PM2 auto-start configured (systemd)"
    else
        # Without systemd, add PM2 resurrect to .bashrc as a fallback
        BASHRC_MARKER="# PC2: auto-resurrect PM2 processes"
        if ! grep -q "$BASHRC_MARKER" "$HOME/.bashrc" 2>/dev/null; then
            cat >> "$HOME/.bashrc" << 'BASHRC_EOF'

# PC2: auto-resurrect PM2 processes
# Starts PM2 processes saved with 'pm2 save' when a new WSL terminal opens
if command -v pm2 &>/dev/null && [[ -z "$(pm2 jlist 2>/dev/null | grep -o '"name":"pc2"')" ]]; then
    pm2 resurrect 2>/dev/null || true
fi
BASHRC_EOF
            print_ok "PM2 auto-resurrect added to ~/.bashrc"
            print_warn "Without systemd, PC2 starts when you open a Ubuntu terminal."
            echo -e "  ${NC}Enable systemd for true background service (see docs/deployment/WSL_GUIDE.md)"
        else
            print_ok "PM2 auto-resurrect already in ~/.bashrc"
        fi
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 9: Start PC2
# ─────────────────────────────────────────────────────────────────────────────

start_pc2() {
    PC2_DIR="$HOME/pc2.net/pc2-node"
    PC2_ROOT="$HOME/pc2.net"
    cd "$PC2_ROOT"

    pm2 delete pc2 2>/dev/null || true
    print_step "Starting PC2..."
    # v1.2.7+: prefer ecosystem.config.cjs over `pm2 start npm` so the
    # process is registered with the env/restart/log config the project
    # ships. This also matches what update.sh does, so in-app updates
    # via `pm2 startOrRestart ecosystem.config.cjs --only pc2 --update-env`
    # find a matching entry. Falls back to the old form if the file is
    # missing (e.g. pre-v1.2.7 checkout).
    if [[ -f "$PC2_ROOT/ecosystem.config.cjs" ]]; then
        pm2 start "$PC2_ROOT/ecosystem.config.cjs"
    else
        cd "$PC2_DIR"
        pm2 start npm --name "pc2" -- start
    fi
    pm2 save

    sleep 3

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║         ${CYAN}   S U C C E S S !   PC2 is running on WSL${GREEN}                ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║     ${NC}Welcome to ${CYAN}ElastOS${NC}: The World Computer${GREEN}                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║                  ${YELLOW}Presented by Elacity Labs${GREEN}                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}NEXT STEP:${GREEN}                                                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Open your Windows browser (Chrome, Edge, Firefox) to:${GREEN}             ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║      ${YELLOW}-->  http://localhost:4200${GREEN}                                  ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Connect your wallet to claim your personal cloud.${GREEN}                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}USEFUL COMMANDS:${GREEN}                                                ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 logs pc2       ${GREEN}- View server logs                         ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 restart pc2    ${GREEN}- Restart the server                       ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 stop pc2       ${GREEN}- Stop the server                          ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 status         ${GREEN}- Check server status                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    if [[ "$SYSTEMD_AVAILABLE" != "true" ]]; then
    echo -e "${GREEN}║   ${YELLOW}NOTE:${NC} Without systemd, PC2 starts when you open Ubuntu.${GREEN}        ║${NC}"
    echo -e "${GREEN}║   ${NC}Enable systemd for auto-start: see WSL_GUIDE.md${GREEN}                  ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    fi
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    print_banner

    validate_wsl
    echo ""

    check_systemd
    echo ""

    install_build_deps
    echo ""

    install_node
    install_pm2
    echo ""

    clone_and_build
    echo ""

    install_transports
    echo ""

    configure_persistence
    echo ""

    start_pc2

    echo -e "${CYAN}Showing server logs (Ctrl+C to exit logs, server keeps running):${NC}"
    echo ""
    pm2 logs pc2
}

main
