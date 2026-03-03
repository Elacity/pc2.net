#!/bin/bash
#
# PC2 Local Quick Start
# 
# One command to run PC2 on your computer:
#   curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash
#
# Or if you already cloned the repo:
#   ./scripts/start-local.sh
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

# Print banner
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
echo -e "${PURPLE}║            ${NC}🌐  T H E   W O R L D   C O M P U T E R  🌐${PURPLE}            ║${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}║                  ${YELLOW}Presented by Elacity Labs${PURPLE}                      ║${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
fi

echo -e "${CYAN}Detected: ${OS}${NC}"
echo ""

# Load nvm if available
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
}

# Check for Node.js
check_node() {
    # Try to load nvm first (in case it's installed but not in PATH)
    load_nvm
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Node.js $(node -v) is too old (need v18+)${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ Node.js not found${NC}"
        return 1
    fi
}

# Install Node.js via nvm (no admin required)
install_node() {
    echo -e "${CYAN}Installing Node.js...${NC}"
    echo ""
    
    # Use nvm - works on both macOS and Linux without admin rights
    echo -e "${CYAN}Installing nvm (Node Version Manager)...${NC}"
    
    # Install nvm
    export NVM_DIR="$HOME/.nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load nvm immediately
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node.js 20
    echo -e "${CYAN}Installing Node.js 20...${NC}"
    nvm install 20
    nvm use 20
    nvm alias default 20
    
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
    echo ""
    echo -e "${YELLOW}Note: Node.js installed via nvm. To use in new terminals, run: source ~/.nvm/nvm.sh${NC}"
}

# Check for git
check_git() {
    if command -v git &> /dev/null; then
        echo -e "${GREEN}✓ Git installed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Git not found${NC}"
        return 1
    fi
}

# Install git
install_git() {
    echo -e "${CYAN}Installing Git...${NC}"
    
    if [[ "$OS" == "macos" ]]; then
        echo -e "${YELLOW}Git is required. On macOS, it usually comes with Xcode Command Line Tools.${NC}"
        echo -e "${YELLOW}Please run this command and follow the prompts:${NC}"
        echo ""
        echo -e "${CYAN}  xcode-select --install${NC}"
        echo ""
        echo -e "${YELLOW}Then re-run this script.${NC}"
        exit 1
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        else
            echo -e "${RED}Please install git manually and re-run this script.${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ Git installed${NC}"
}

# Check for pm2
check_pm2() {
    if command -v pm2 &> /dev/null; then
        echo -e "${GREEN}✓ PM2 process manager installed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ PM2 not found${NC}"
        return 1
    fi
}

# Install pm2
install_pm2() {
    echo -e "${CYAN}Installing PM2 process manager...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✓ PM2 installed${NC}"
}

# Install build dependencies for native modules (Debian/Ubuntu only)
install_build_deps() {
    # Only run on Debian/Ubuntu systems
    if [[ ! -f /etc/debian_version ]]; then
        return 0
    fi
    
    echo -e "${CYAN}Installing build dependencies for native modules (Debian/Ubuntu)...${NC}"
    
    # Check if we need sudo
    if [[ $EUID -ne 0 ]]; then
        SUDO="sudo"
    else
        SUDO=""
    fi
    
    # Install build-essential, python3, and native module dependencies
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq \
        build-essential \
        python3 \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        2>&1 | grep -v "is already the newest version" || true
    
    echo -e "${GREEN}✓ Build dependencies installed${NC}"
}

# Main installation
main() {
    echo -e "${CYAN}Checking requirements...${NC}"
    echo ""
    
    # Check and install Git
    if ! check_git; then
        install_git
    fi
    
    # Install build dependencies for native modules (Debian/Ubuntu only)
    # This must happen BEFORE npm install to ensure native modules compile correctly
    install_build_deps
    
    # Check and install Node.js
    if ! check_node; then
        install_node
        # Refresh PATH
        export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
        hash -r 2>/dev/null || true
    fi
    
    # Check and install PM2
    if ! check_pm2; then
        install_pm2
    fi
    
    echo ""
    
    # Determine if we're in the repo or need to clone
    PC2_DIR=""
    
    if [[ -d "pc2-node" ]]; then
        # In repo root (has pc2-node subdirectory)
        PC2_DIR="$(pwd)/pc2-node"
        echo -e "${GREEN}✓ Found PC2 in current directory${NC}"
    elif [[ -f "package.json" ]] && grep -q '"@elastos/pc2-node"' package.json 2>/dev/null; then
        # Actually inside the pc2-node directory
        PC2_DIR="$(pwd)"
        echo -e "${GREEN}✓ Already in PC2 directory${NC}"
    elif [[ -d "$HOME/pc2.net/pc2-node" ]]; then
        # Already cloned
        PC2_DIR="$HOME/pc2.net/pc2-node"
        echo -e "${GREEN}✓ Found existing PC2 installation${NC}"
    else
        # Need to clone
        echo -e "${CYAN}Downloading PC2...${NC}"
        cd "$HOME"
        if [[ -n "${PC2_BRANCH}" ]]; then
            git clone -b "${PC2_BRANCH}" https://github.com/Elacity/pc2.net.git
            echo -e "${GREEN}✓ Downloaded PC2 (branch: ${PC2_BRANCH})${NC}"
        else
            git clone https://github.com/Elacity/pc2.net.git
            echo -e "${GREEN}✓ Downloaded PC2${NC}"
        fi
        PC2_DIR="$HOME/pc2.net/pc2-node"
    fi
    
    echo ""
    echo -e "${CYAN}Setting up PC2...${NC}"
    cd "$PC2_DIR"
    
    # Install all dependencies from root (sets up workspace links)
    echo -e "${CYAN}Installing all dependencies (this takes a few minutes)...${NC}"
    ROOT_DIR="$(dirname "$PC2_DIR")"
    cd "$ROOT_DIR"
    
    # Create particle-auth .env if it doesn't exist (required for build)
    PARTICLE_ENV="$ROOT_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        echo -e "${CYAN}Setting up Particle Network configuration...${NC}"
        cat > "$PARTICLE_ENV" << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        echo -e "${GREEN}✓ Particle Network configured${NC}"
    fi
    # Use --ignore-scripts to skip husky prepare hook, --legacy-peer-deps for conflicts
    if ! npm install --legacy-peer-deps --ignore-scripts 2>&1; then
        echo -e "${YELLOW}⚠ Root install had issues, trying individual installs...${NC}"
        # Fallback: install in gui and pc2-node separately
        cd "$ROOT_DIR/src/gui"
        npm install --legacy-peer-deps --ignore-scripts 2>&1 || true
    fi
    
    # Also ensure pc2-node has its dependencies
    cd "$PC2_DIR"
    if ! npm install --legacy-peer-deps --ignore-scripts 2>&1; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    
    # Rebuild native modules (skipped by --ignore-scripts)
    # This compiles node-pty, better-sqlite3, canvas, etc. for this platform
    echo -e "${CYAN}Building native modules...${NC}"
    cd "$ROOT_DIR"
    npm rebuild 2>&1 || true
    cd "$PC2_DIR"
    npm rebuild 2>&1 || true
    echo -e "${GREEN}✓ Native modules built${NC}"
    
    # Build
    echo -e "${CYAN}Building PC2...${NC}"
    if ! npm run build 2>&1; then
        echo -e "${RED}❌ Build failed. Check errors above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Build complete${NC}"
    
    # Install WireGuard for fast remote access
    if ! command -v wg &> /dev/null; then
        echo -e "${CYAN}Installing WireGuard for fast remote access...${NC}"
        if [[ "$OS" == "macos" ]]; then
            if ! command -v brew &> /dev/null; then
                echo -e "${CYAN}Installing Homebrew (macOS package manager)...${NC}"
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null
                # Add Homebrew to PATH for this session
                if [[ -x /opt/homebrew/bin/brew ]]; then
                    eval "$(/opt/homebrew/bin/brew shellenv)"
                elif [[ -x /usr/local/bin/brew ]]; then
                    eval "$(/usr/local/bin/brew shellenv)"
                fi
                echo -e "${GREEN}✓ Homebrew installed${NC}"
            fi
            brew install wireguard-tools 2>&1 || true
        elif [[ "$OS" == "linux" ]]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get install -y -qq wireguard-tools 2>&1 || true
            elif command -v yum &> /dev/null; then
                sudo yum install -y wireguard-tools 2>&1 || true
            fi
        fi
        if command -v wg &> /dev/null; then
            echo -e "${GREEN}✓ WireGuard installed${NC}"
        fi
    else
        echo -e "${GREEN}✓ WireGuard tools detected${NC}"
    fi

    # Configure passwordless sudo for wg-quick (required for background PM2 process)
    if command -v wg &> /dev/null; then
        WG_QUICK_PATH=$(which wg-quick 2>/dev/null)
        if [[ -n "$WG_QUICK_PATH" ]] && [[ ! -f /etc/sudoers.d/wireguard ]]; then
            echo -e "${CYAN}Configuring WireGuard permissions...${NC}"
            sudo sh -c "echo '$(whoami) ALL=(ALL) NOPASSWD: ${WG_QUICK_PATH}' > /etc/sudoers.d/wireguard && chmod 440 /etc/sudoers.d/wireguard"
            echo -e "${GREEN}✓ WireGuard permissions configured${NC}"
        fi
    fi

    # Install AmneziaWG stealth transport (DPI-resistant fallback)
    # On macOS, install to Homebrew prefix (no sudo needed).
    # On Linux, install to /usr/local/bin (sudo only on Linux where user expects it).
    if ! command -v amneziawg-go &> /dev/null; then
        echo -e "${CYAN}Installing AmneziaWG stealth transport (DPI-resistant fallback)...${NC}"

        if [[ "$OS" == "macos" ]]; then
            AWG_BIN_DIR="$(brew --prefix 2>/dev/null)/bin"
            [[ -z "$AWG_BIN_DIR" || "$AWG_BIN_DIR" == "/bin" ]] && AWG_BIN_DIR="/usr/local/bin"
        else
            AWG_BIN_DIR="/usr/local/bin"
        fi

        if ! command -v go &> /dev/null; then
            echo -e "${YELLOW}Go compiler not found -- installing Go to build AmneziaWG...${NC}"
            if [[ "$OS" == "macos" ]]; then
                brew install go 2>&1 || true
            elif command -v apt-get &> /dev/null; then
                sudo apt-get install -y -qq golang-go 2>&1 || true
            elif command -v yum &> /dev/null; then
                sudo yum install -y golang 2>&1 || true
            fi
        fi

        if command -v go &> /dev/null; then
            echo -e "${CYAN}Building amneziawg-go from source...${NC}"
            AWG_BUILD_DIR=$(mktemp -d)
            (cd "$AWG_BUILD_DIR" && git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git 2>&1 && cd amneziawg-go && make 2>&1 && cp amneziawg-go "$AWG_BIN_DIR/amneziawg-go" && chmod 755 "$AWG_BIN_DIR/amneziawg-go") || true
            rm -rf "$AWG_BUILD_DIR"
        fi

        if command -v amneziawg-go &> /dev/null; then
            echo -e "${GREEN}✓ AmneziaWG binary installed${NC}"
        else
            echo -e "${YELLOW}⚠ AmneziaWG build failed -- stealth transport will not be available${NC}"
        fi
    else
        echo -e "${GREEN}✓ AmneziaWG binary detected${NC}"
    fi

    # Install awg-quick (AmneziaWG interface manager)
    if ! command -v awg-quick &> /dev/null; then
        echo -e "${CYAN}Installing AmneziaWG tools (awg-quick)...${NC}"

        if [[ "$OS" == "macos" ]]; then
            AWG_BIN_DIR="$(brew --prefix 2>/dev/null)/bin"
            [[ -z "$AWG_BIN_DIR" || "$AWG_BIN_DIR" == "/bin" ]] && AWG_BIN_DIR="/usr/local/bin"
            AWG_QUICK_SCRIPT="darwin.bash"
        else
            AWG_BIN_DIR="/usr/local/bin"
            AWG_QUICK_SCRIPT="linux.bash"
        fi

        AWG_TOOLS_TMP=$(mktemp -d)
        git clone --depth 1 https://github.com/amnezia-vpn/amnezia-wg-tools.git "$AWG_TOOLS_TMP" 2>&1 || true
        if [[ -d "$AWG_TOOLS_TMP/src" ]]; then
            (cd "$AWG_TOOLS_TMP/src" && make 2>&1 && cp wg "$AWG_BIN_DIR/awg" && cp "wg-quick/$AWG_QUICK_SCRIPT" "$AWG_BIN_DIR/awg-quick" && chmod 755 "$AWG_BIN_DIR/awg" "$AWG_BIN_DIR/awg-quick") || true
        fi
        rm -rf "$AWG_TOOLS_TMP"

        if command -v awg-quick &> /dev/null; then
            echo -e "${GREEN}✓ AmneziaWG tools installed${NC}"
        else
            echo -e "${YELLOW}⚠ AmneziaWG tools build failed -- stealth transport will not be available${NC}"
        fi
    else
        echo -e "${GREEN}✓ AmneziaWG tools detected${NC}"
    fi

    # Patch awg-quick: upstream bugs:
    # 1. References /var/run/wireguard/ instead of /var/run/amneziawg/ for name/sock files
    # 2. Calls 'wg' (standard WireGuard CLI) instead of 'awg' (AmneziaWG CLI),
    #    which can't parse obfuscation parameters (Jc, Jmin, S1, H1, etc.)
    if command -v awg-quick &> /dev/null; then
        AWG_QUICK_PATH=$(which awg-quick 2>/dev/null)
        if grep -q '/var/run/wireguard/\$INTERFACE.name' "$AWG_QUICK_PATH" 2>/dev/null || grep -q 'cmd wg ' "$AWG_QUICK_PATH" 2>/dev/null; then
            echo -e "${CYAN}Patching awg-quick (fixing upstream bugs)...${NC}"
            sudo sed -i.bak \
                -e 's|/var/run/wireguard/\$INTERFACE\.name|/var/run/amneziawg/\$INTERFACE.name|g' \
                -e 's|/var/run/wireguard/\$REAL_INTERFACE\.sock|/var/run/amneziawg/\$REAL_INTERFACE.sock|g' \
                -e 's|cmd wg setconf|cmd awg setconf|g' \
                -e 's|cmd wg showconf|cmd awg showconf|g' \
                -e 's|wg show interfaces|awg show interfaces|g' \
                -e 's|wg show "\$REAL_INTERFACE"|awg show "\$REAL_INTERFACE"|g' \
                "$AWG_QUICK_PATH"
            sudo rm -f "${AWG_QUICK_PATH}.bak"
            echo -e "${GREEN}✓ awg-quick patched${NC}"
        fi
    fi

    # Configure passwordless sudo for AmneziaWG operations:
    # - awg-quick for interface management
    # - killall amneziawg-go for cleaning stale processes
    # - rm for cleaning stale runtime files
    if command -v awg-quick &> /dev/null; then
        AWG_QUICK_PATH=$(which awg-quick 2>/dev/null)
        KILLALL_PATH=$(which killall 2>/dev/null || echo "/usr/bin/killall")
        if [[ -x "$AWG_QUICK_PATH" ]]; then
            echo -e "${CYAN}Configuring AmneziaWG permissions...${NC}"
            sudo sh -c "cat > /etc/sudoers.d/amneziawg << 'SUDOEOF'
$(whoami) ALL=(ALL) NOPASSWD:SETENV: ${AWG_QUICK_PATH}
$(whoami) ALL=(ALL) NOPASSWD: ${KILLALL_PATH} amneziawg-go
$(whoami) ALL=(ALL) NOPASSWD: /bin/rm -rf /var/run/amneziawg/
SUDOEOF
chmod 440 /etc/sudoers.d/amneziawg"
            echo -e "${GREEN}✓ AmneziaWG permissions configured${NC}"
        fi
    fi

    # ============================================================
    # Install sing-box (VLESS Reality TCP stealth transport)
    # ============================================================
    if command -v sing-box &> /dev/null || test -x /usr/local/bin/sing-box; then
        echo -e "${GREEN}✓ sing-box already installed${NC}"
    else
        echo -e "${CYAN}Installing sing-box (VLESS Reality transport)...${NC}"
        SINGBOX_VERSION="1.13.0"
        if [[ "$OS" == "macos" ]]; then
            if command -v brew &> /dev/null; then
                brew install sing-box 2>&1 || true
            fi
            if ! command -v sing-box &> /dev/null; then
                ARCH=$(uname -m)
                [[ "$ARCH" == "arm64" ]] && SB_ARCH="arm64" || SB_ARCH="amd64"
                SB_TMP=$(mktemp -d)
                curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-darwin-${SB_ARCH}.tar.gz" -o "$SB_TMP/sing-box.tar.gz"
                (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && cp sing-box-*/sing-box /usr/local/bin/sing-box && chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
                rm -rf "$SB_TMP"
            fi
        else
            ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
            SB_TMP=$(mktemp -d)
            wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -O "$SB_TMP/sing-box.tar.gz" 2>/dev/null || curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -o "$SB_TMP/sing-box.tar.gz"
            (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && cp sing-box-*/sing-box /usr/local/bin/sing-box && chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
            rm -rf "$SB_TMP"
        fi
        if command -v sing-box &> /dev/null || test -x /usr/local/bin/sing-box; then
            echo -e "${GREEN}✓ sing-box installed${NC}"
        else
            echo -e "${YELLOW}⚠ sing-box installation failed (VLESS Reality will be unavailable)${NC}"
        fi
    fi

    # Detect if running on VPS (no DISPLAY) or local machine
    # Also get public IP for VPS users
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
    PUBLIC_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || curl -s --max-time 3 icanhazip.com 2>/dev/null || echo "")
    
    # Determine the best URL to show
    if [[ -z "$DISPLAY" ]] && [[ -n "$SSH_CONNECTION" ]]; then
        # Running on VPS via SSH - show public IP
        ACCESS_URL="http://${PUBLIC_IP}:4200"
        ACCESS_NOTE="(your VPS public IP)"
    elif [[ -n "$LOCAL_IP" ]] && [[ "$LOCAL_IP" != "127."* ]]; then
        # Has a local network IP - show both localhost and LAN
        ACCESS_URL="http://localhost:4200"
        ACCESS_NOTE="or http://${LOCAL_IP}:4200 (LAN)"
    else
        # Default to localhost
        ACCESS_URL="http://localhost:4200"
        ACCESS_NOTE=""
    fi
    
    # Stop any existing pc2 process
    pm2 delete pc2 2>/dev/null || true
    
    # Start with pm2
    echo -e "${CYAN}Starting PC2 with PM2 process manager...${NC}"
    pm2 start npm --name "pc2" -- start
    
    # Wait a moment for server to start
    sleep 3
    
    echo ""
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║         ${CYAN}🌟 🌟 🌟   S U C C E S S !   🌟 🌟 🌟${GREEN}                   ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║     ${NC}Welcome to ${CYAN}ElastOS${NC}: The World Computer${GREEN}                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║                  ${YELLOW}Presented by Elacity Labs${GREEN}                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}📋 NEXT STEP:${GREEN}                                                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}1. Open your web browser (Chrome, Safari, Firefox)${GREEN}             ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}2. Go to this address:${GREEN}                                         ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║      ${YELLOW}➜  ${ACCESS_URL}${GREEN}                                  ║${NC}"
    if [[ -n "$ACCESS_NOTE" ]]; then
    echo -e "${GREEN}║         ${NC}${ACCESS_NOTE}${GREEN}                                    ║${NC}"
    fi
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}3. Connect your wallet to claim your personal cloud${GREEN}            ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Your data. Your AI. Your sovereignty.${GREEN}                         ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}USEFUL COMMANDS:${GREEN}                                              ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 logs pc2${GREEN}      - View server logs                         ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 restart pc2${GREEN}   - Restart the server                       ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 stop pc2${GREEN}      - Stop the server                          ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 status${GREEN}        - Check server status                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}   ⬆️  SCROLL UP if you don't see the instructions above ⬆️${NC}"
    echo ""
    
    # Show logs (follow mode)
    echo -e "${CYAN}Showing server logs (Ctrl+C to exit logs, server keeps running):${NC}"
    echo ""
    pm2 logs pc2
}

# Run
main
