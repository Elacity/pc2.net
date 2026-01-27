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

# Main installation
main() {
    echo -e "${CYAN}Checking requirements...${NC}"
    echo ""
    
    # Check and install Git
    if ! check_git; then
        install_git
    fi
    
    # Check and install Node.js
    if ! check_node; then
        install_node
        # Refresh PATH
        export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
        hash -r 2>/dev/null || true
    fi
    
    echo ""
    
    # Determine if we're in the repo or need to clone
    PC2_DIR=""
    
    if [[ -f "package.json" ]] && grep -q "pc2-node" package.json 2>/dev/null; then
        # Already in pc2-node directory
        PC2_DIR="$(pwd)"
        echo -e "${GREEN}✓ Already in PC2 directory${NC}"
    elif [[ -d "pc2-node" ]]; then
        # In repo root
        PC2_DIR="$(pwd)/pc2-node"
        echo -e "${GREEN}✓ Found PC2 in current directory${NC}"
    elif [[ -d "$HOME/pc2.net/pc2-node" ]]; then
        # Already cloned
        PC2_DIR="$HOME/pc2.net/pc2-node"
        echo -e "${GREEN}✓ Found existing PC2 installation${NC}"
    else
        # Need to clone
        echo -e "${CYAN}Downloading PC2...${NC}"
        cd "$HOME"
        git clone https://github.com/Elacity/pc2.net.git
        PC2_DIR="$HOME/pc2.net/pc2-node"
        echo -e "${GREEN}✓ Downloaded PC2${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Setting up PC2...${NC}"
    cd "$PC2_DIR"
    
    # Install all dependencies from root (sets up workspace links)
    echo -e "${CYAN}Installing all dependencies (this takes a few minutes)...${NC}"
    ROOT_DIR="$(dirname "$PC2_DIR")"
    cd "$ROOT_DIR"
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
    echo -e "${CYAN}Building native modules...${NC}"
    npm rebuild 2>&1 || true
    echo -e "${GREEN}✓ Native modules built${NC}"
    
    # Build
    echo -e "${CYAN}Building PC2...${NC}"
    if ! npm run build 2>&1; then
        echo -e "${RED}❌ Build failed. Check errors above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Build complete${NC}"
    
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
    echo -e "${GREEN}║      ${YELLOW}➜  http://localhost:4200${GREEN}                                  ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}3. Connect your wallet to claim your personal cloud${GREEN}            ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Your data. Your AI. Your sovereignty.${GREEN}                         ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Keep this terminal open. Press ${YELLOW}Ctrl+C${NC} to stop.${GREEN}                ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}   ⬆️  SCROLL UP if you don't see the instructions above ⬆️${NC}"
    echo ""
    
    # Start the server
    npm start
}

# Run
main
