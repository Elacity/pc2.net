#!/bin/bash
#
# ElastOS PC2 - Personal Cloud Compute
# One-liner installer script
#
# Usage:
#   curl -sSL https://elastos.pc2.net/install.sh | bash
#
# Or with custom port:
#   curl -sSL https://elastos.pc2.net/install.sh | bash -s -- --port 8080
#
# Requirements:
#   - Docker (will be installed if not present)
#   - Docker Compose (will be installed if not present)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
PC2_DIR="${PC2_DIR:-$HOME/pc2}"
PC2_PORT="${PC2_PORT:-4100}"
PC2_WS_PORT="${PC2_WS_PORT:-4200}"
PC2_NODE_NAME="${PC2_NODE_NAME:-My Personal Cloud}"

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --port) PC2_PORT="$2"; shift ;;
        --ws-port) PC2_WS_PORT="$2"; shift ;;
        --dir) PC2_DIR="$2"; shift ;;
        --name) PC2_NODE_NAME="$2"; shift ;;
        --help) 
            echo "ElastOS PC2 Installer"
            echo ""
            echo "Usage: install-pc2.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT       Web interface port (default: 4100)"
            echo "  --ws-port PORT    WebSocket port (default: 4200)"
            echo "  --dir PATH        Installation directory (default: ~/pc2)"
            echo "  --name NAME       Node name (default: 'My Personal Cloud')"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Print banner
print_banner() {
    echo -e "${PURPLE}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🌐 ElastOS PC2 - Personal Cloud Compute                           ║"
    echo "║                                                                     ║"
    echo "║   Your data. Your servers. Your identity.                           ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Docker if not present
install_docker() {
    echo -e "${YELLOW}Installing Docker...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${RED}Please install Docker Desktop for Mac from: https://www.docker.com/products/docker-desktop${NC}"
        exit 1
    fi
    
    # Linux installation
    curl -fsSL https://get.docker.com | sh
    
    # Add current user to docker group
    sudo usermod -aG docker "$USER"
    
    echo -e "${GREEN}Docker installed successfully${NC}"
    echo -e "${YELLOW}NOTE: You may need to log out and back in for group changes to take effect${NC}"
}

# Install Docker Compose if not present
install_docker_compose() {
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    
    # Try to use Docker Compose V2 (docker compose) first
    if docker compose version >/dev/null 2>&1; then
        echo -e "${GREEN}Docker Compose V2 is available${NC}"
        return
    fi
    
    # Install Docker Compose V2 plugin
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
}

# Main installation
main() {
    print_banner
    
    echo -e "${CYAN}Checking prerequisites...${NC}"
    echo ""
    
    # Check for Docker
    if ! command_exists docker; then
        echo -e "${YELLOW}Docker not found. Installing...${NC}"
        install_docker
    else
        echo -e "${GREEN}✓ Docker is installed${NC}"
    fi
    
    # Check for Docker Compose
    if ! docker compose version >/dev/null 2>&1; then
        echo -e "${YELLOW}Docker Compose not found. Installing...${NC}"
        install_docker_compose
    else
        echo -e "${GREEN}✓ Docker Compose is installed${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Setting up PC2 in ${PC2_DIR}...${NC}"
    
    # Create installation directory
    mkdir -p "$PC2_DIR"
    cd "$PC2_DIR"
    
    # Create data directory
    mkdir -p data
    
    # Download docker-compose.yml
    echo -e "${CYAN}Downloading configuration...${NC}"
    
    cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'

services:
  pc2:
    image: elastos/pc2:latest
    container_name: pc2-node
    restart: unless-stopped
    
    ports:
      - "${PC2_PORT}:4100"
      - "${PC2_WS_PORT}:4200"
    
    volumes:
      - ./data:/data
    
    environment:
      - NODE_ENV=production
      - PC2_PORT=4100
      - PC2_WS_PORT=4200
      - PC2_NODE_NAME=${PC2_NODE_NAME}
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4100/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

networks:
  default:
    name: pc2-network
COMPOSE_EOF

    # Create .env file with configuration
    cat > .env << ENV_EOF
PC2_PORT=${PC2_PORT}
PC2_WS_PORT=${PC2_WS_PORT}
PC2_NODE_NAME=${PC2_NODE_NAME}
ENV_EOF
    
    echo -e "${GREEN}✓ Configuration created${NC}"
    
    # Pull the latest image
    echo ""
    echo -e "${CYAN}Pulling PC2 image...${NC}"
    docker compose pull || docker-compose pull
    
    # Start the service
    echo ""
    echo -e "${CYAN}Starting PC2...${NC}"
    docker compose up -d || docker-compose up -d
    
    # Wait for startup
    echo ""
    echo -e "${CYAN}Waiting for PC2 to start...${NC}"
    sleep 5
    
    # Show logs to capture setup token
    echo ""
    echo -e "${PURPLE}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🎉 PC2 INSTALLATION COMPLETE!                                     ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Check the logs below for your SETUP TOKEN${NC}"
    echo ""
    echo -e "${CYAN}Getting setup token from logs...${NC}"
    echo ""
    
    # Show recent logs
    docker compose logs --tail=50 pc2 2>/dev/null || docker-compose logs --tail=50 pc2
    
    echo ""
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🌐 Your PC2 is now running!                                       ║"
    echo "║                                                                     ║"
    echo "║   Web Interface: http://localhost:${PC2_PORT}                        ║"
    echo "║                                                                     ║"
    echo "║   Next Steps:                                                       ║"
    echo "║   1. Copy the PC2-SETUP-xxxxx token from the logs above             ║"
    echo "║   2. Open http://localhost:${PC2_PORT} in your browser               ║"
    echo "║   3. Connect your wallet (MetaMask/Essentials)                      ║"
    echo "║   4. Enter your PC2 URL and setup token to claim ownership          ║"
    echo "║                                                                     ║"
    echo "║   Useful Commands:                                                  ║"
    echo "║   - View logs:    cd ${PC2_DIR} && docker compose logs -f           ║"
    echo "║   - Stop PC2:     cd ${PC2_DIR} && docker compose down              ║"
    echo "║   - Restart PC2:  cd ${PC2_DIR} && docker compose restart           ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

# Run main function
main

