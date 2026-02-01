#!/bin/bash
#
# PC2 ARM Installation Script
# For Raspberry Pi 4/5 and Jetson Nano
#
# Usage:
#   curl -sSL https://pc2.net/install-arm | bash
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
PC2_DIR="${PC2_DIR:-$HOME/pc2}"
PC2_PORT="${PC2_PORT:-4200}"
REPO_URL="https://github.com/Elacity/pc2.net.git"

# Print banner
print_banner() {
    echo -e "${PURPLE}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🌐 PC2 - Personal Cloud Computer (ARM)                            ║"
    echo "║                                                                     ║"
    echo "║   For Raspberry Pi 4/5 and Jetson Nano                              ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

# Check architecture
check_arch() {
    ARCH=$(uname -m)
    echo -e "${CYAN}Detected architecture: ${ARCH}${NC}"
    
    if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv7l" && "$ARCH" != "arm64" ]]; then
        echo -e "${YELLOW}Warning: This script is optimized for ARM devices.${NC}"
        echo -e "${YELLOW}Detected: ${ARCH}. Continuing anyway...${NC}"
    else
        echo -e "${GREEN}✓ ARM architecture confirmed${NC}"
    fi
}

# Check for required tools
check_prerequisites() {
    echo ""
    echo -e "${CYAN}Checking prerequisites...${NC}"
    
    # Check for git
    if ! command -v git &> /dev/null; then
        echo -e "${YELLOW}Installing git...${NC}"
        sudo apt-get update && sudo apt-get install -y git
    fi
    echo -e "${GREEN}✓ Git installed${NC}"
    
    # Check for curl
    if ! command -v curl &> /dev/null; then
        echo -e "${YELLOW}Installing curl...${NC}"
        sudo apt-get install -y curl
    fi
    echo -e "${GREEN}✓ Curl installed${NC}"
}

# Install Node.js 20
install_nodejs() {
    echo ""
    echo -e "${CYAN}Checking Node.js...${NC}"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
        if [ "$NODE_VERSION" -ge 20 ]; then
            echo -e "${GREEN}✓ Node.js $(node -v) already installed${NC}"
            return
        fi
    fi
    
    echo -e "${YELLOW}Installing Node.js 20...${NC}"
    
    # Use NodeSource for ARM
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
}

# Install build tools
install_build_tools() {
    echo ""
    echo -e "${CYAN}Installing build tools...${NC}"
    
    sudo apt-get install -y build-essential python3
    
    echo -e "${GREEN}✓ Build tools installed${NC}"
}

# Clone and build PC2
install_pc2() {
    echo ""
    echo -e "${CYAN}Installing PC2 to ${PC2_DIR}...${NC}"
    
    # Clone repository
    if [ -d "$PC2_DIR" ]; then
        echo -e "${YELLOW}Existing installation found. Updating...${NC}"
        cd "$PC2_DIR"
        git pull origin main
    else
        git clone "$REPO_URL" "$PC2_DIR"
        cd "$PC2_DIR"
    fi
    
    # Create particle-auth .env if it doesn't exist (required for build)
    PARTICLE_ENV="$PC2_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        echo -e "${CYAN}Setting up Particle Network configuration...${NC}"
        mkdir -p "$PC2_DIR/packages/particle-auth"
        cat > "$PARTICLE_ENV" << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        echo -e "${GREEN}✓ Particle Network configured${NC}"
    fi
    
    # Install dependencies and build from root
    echo -e "${CYAN}Installing dependencies...${NC}"
    npm install --legacy-peer-deps --ignore-scripts || true
    
    # Also install pc2-node dependencies
    cd pc2-node
    npm install --legacy-peer-deps --ignore-scripts || true
    cd ..
    
    echo -e "${CYAN}Building PC2...${NC}"
    npm run build:pc2
    
    echo -e "${GREEN}✓ PC2 installed${NC}"
}

# Create systemd service
create_service() {
    echo ""
    echo -e "${CYAN}Creating systemd service for auto-start...${NC}"
    
    # Create service file
    sudo tee /etc/systemd/system/pc2.service > /dev/null << EOF
[Unit]
Description=PC2 Personal Cloud Computer
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PC2_DIR/pc2-node
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$PC2_PORT

[Install]
WantedBy=multi-user.target
EOF

    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable pc2
    sudo systemctl start pc2
    
    echo -e "${GREEN}✓ PC2 service created and started${NC}"
}

# Get local IP address
get_local_ip() {
    hostname -I | awk '{print $1}'
}

# Print success message
print_success() {
    LOCAL_IP=$(get_local_ip)
    
    echo ""
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🎉 PC2 Installation Complete!                                     ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
    echo ""
    echo -e "${CYAN}Access your PC2:${NC}"
    echo ""
    echo -e "   Local:   ${GREEN}http://localhost:${PC2_PORT}${NC}"
    echo -e "   Network: ${GREEN}http://${LOCAL_IP}:${PC2_PORT}${NC}"
    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo ""
    echo "   View logs:     sudo journalctl -u pc2 -f"
    echo "   Stop PC2:      sudo systemctl stop pc2"
    echo "   Start PC2:     sudo systemctl start pc2"
    echo "   Restart PC2:   sudo systemctl restart pc2"
    echo "   Check status:  sudo systemctl status pc2"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo ""
    echo "   1. Open http://${LOCAL_IP}:${PC2_PORT} in your browser"
    echo "   2. Login with your wallet (MetaMask, WalletConnect, etc.)"
    echo "   3. Start using your sovereign personal cloud!"
    echo ""
    echo -e "${YELLOW}For remote access, enable Active Proxy in Settings → PC2${NC}"
    echo ""
}

# Main installation
main() {
    print_banner
    check_arch
    check_prerequisites
    install_nodejs
    install_build_tools
    install_pc2
    create_service
    print_success
}

# Run
main
