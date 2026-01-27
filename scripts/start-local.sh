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
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}║                                                             ║${NC}"
echo -e "${PURPLE}║   ${CYAN}🌐 PC2 - Personal Cloud Computer${PURPLE}                         ║${NC}"
echo -e "${PURPLE}║   ${NC}Your data. Your AI. Your sovereignty.${PURPLE}                   ║${NC}"
echo -e "${PURPLE}║                                                             ║${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
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

# Check for Node.js
check_node() {
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

# Install Node.js
install_node() {
    echo -e "${CYAN}Installing Node.js...${NC}"
    echo ""
    
    if [[ "$OS" == "macos" ]]; then
        # Check for Homebrew
        if ! command -v brew &> /dev/null; then
            echo -e "${CYAN}Installing Homebrew first...${NC}"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            
            # Add Homebrew to PATH for Apple Silicon Macs
            if [[ -f /opt/homebrew/bin/brew ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            fi
        fi
        
        echo -e "${CYAN}Installing Node.js via Homebrew...${NC}"
        brew install node@20
        brew link node@20 --force --overwrite 2>/dev/null || true
        
    elif [[ "$OS" == "linux" ]]; then
        echo -e "${CYAN}Installing Node.js via NodeSource...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    echo -e "${GREEN}✓ Node.js installed${NC}"
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
        xcode-select --install 2>/dev/null || true
        # Or via Homebrew if available
        if command -v brew &> /dev/null; then
            brew install git
        fi
    elif [[ "$OS" == "linux" ]]; then
        sudo apt-get update
        sudo apt-get install -y git
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
    
    # Install dependencies
    echo -e "${CYAN}Installing dependencies (this may take a minute)...${NC}"
    npm install --silent 2>&1 | tail -5
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    
    # Build
    echo -e "${CYAN}Building PC2...${NC}"
    npm run build --silent 2>&1 | tail -3
    echo -e "${GREEN}✓ Build complete${NC}"
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}║                                                             ║${NC}"
    echo -e "${GREEN}║   ${NC}🎉 PC2 is ready!${GREEN}                                         ║${NC}"
    echo -e "${GREEN}║                                                             ║${NC}"
    echo -e "${GREEN}║   ${CYAN}Open in your browser:${GREEN}                                   ║${NC}"
    echo -e "${GREEN}║                                                             ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}➜  http://localhost:4200${GREEN}                                ║${NC}"
    echo -e "${GREEN}║                                                             ║${NC}"
    echo -e "${GREEN}║   ${NC}Press Ctrl+C to stop${GREEN}                                     ║${NC}"
    echo -e "${GREEN}║                                                             ║${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Start the server
    npm start
}

# Run
main
