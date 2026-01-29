#!/bin/bash
# =============================================================================
# PC2 Supernode Setup Script
# 
# This script automates the setup of a PC2 Supernode on Ubuntu 22.04/24.04
# It handles:
#   1. Installing dependencies (Java 17, required packages)
#   2. Building Boson.Core and Active Proxy
#   3. Configuring the node with your public IP
#   4. Setting up systemd service for auto-start
#   5. Registering with the PC2 network
#
# Usage: ./setup-supernode.sh [--public-ip YOUR_IP] [--name "Your Node Name"]
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PC2_DIR="${HOME}/pc2"
BOSON_DIR="${PC2_DIR}/boson"
DATA_DIR="${BOSON_DIR}/data"
CONFIG_DIR="${BOSON_DIR}/config"
LIB_DIR="${BOSON_DIR}/lib"

# Default ports
DHT_PORT=39001
PROXY_PORT=8090
PORT_RANGE_START=25000
PORT_RANGE_END=30000

# Parse arguments
PUBLIC_IP=""
NODE_NAME="PC2 Supernode"

while [[ $# -gt 0 ]]; do
  case $1 in
    --public-ip)
      PUBLIC_IP="$2"
      shift 2
      ;;
    --name)
      NODE_NAME="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--public-ip YOUR_IP] [--name \"Your Node Name\"]"
      echo ""
      echo "Options:"
      echo "  --public-ip   Your server's public IPv4 address"
      echo "  --name        Friendly name for your node"
      echo ""
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Functions
print_header() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "${GREEN}▶${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

check_root() {
  if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root. Consider using a non-root user."
  fi
}

detect_public_ip() {
  if [ -z "$PUBLIC_IP" ]; then
    print_step "Detecting public IP address..."
    PUBLIC_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo "")
    
    if [ -z "$PUBLIC_IP" ]; then
      print_error "Could not detect public IP. Please specify with --public-ip"
      exit 1
    fi
    
    print_success "Detected public IP: $PUBLIC_IP"
    echo ""
    read -p "Is this correct? [Y/n] " confirm
    if [[ "$confirm" =~ ^[Nn] ]]; then
      read -p "Enter your public IP: " PUBLIC_IP
    fi
  fi
}

check_system() {
  print_header "System Check"
  
  # Check OS
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    print_step "OS: $NAME $VERSION"
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
      print_warning "This script is tested on Ubuntu. Other distros may work but are not officially supported."
    fi
  fi
  
  # Check memory
  MEM_GB=$(free -g | awk '/^Mem:/{print $2}')
  print_step "Memory: ${MEM_GB}GB"
  if [ "$MEM_GB" -lt 4 ]; then
    print_warning "Recommended: 8GB+ RAM"
  fi
  
  # Check disk
  DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
  print_step "Free disk: ${DISK_GB}GB"
  if [ "$DISK_GB" -lt 20 ]; then
    print_error "Insufficient disk space. Need at least 50GB free."
    exit 1
  fi
}

install_dependencies() {
  print_header "Installing Dependencies"
  
  print_step "Updating package lists..."
  sudo apt update -qq
  
  print_step "Installing Java 17..."
  sudo apt install -y openjdk-17-jdk-headless
  
  print_step "Installing build tools..."
  sudo apt install -y git curl ufw
  
  # Verify Java
  JAVA_VERSION=$(java -version 2>&1 | head -1)
  print_success "Java installed: $JAVA_VERSION"
}

configure_firewall() {
  print_header "Configuring Firewall"
  
  print_step "Opening port ${DHT_PORT}/UDP (Boson DHT)..."
  sudo ufw allow ${DHT_PORT}/udp comment 'PC2 Boson DHT'
  
  print_step "Opening port ${PROXY_PORT}/TCP (Active Proxy)..."
  sudo ufw allow ${PROXY_PORT}/tcp comment 'PC2 Active Proxy'
  
  print_step "Opening port range ${PORT_RANGE_START}-${PORT_RANGE_END}/TCP (Port Mapping)..."
  sudo ufw allow ${PORT_RANGE_START}:${PORT_RANGE_END}/tcp comment 'PC2 Port Mapping'
  
  # Enable firewall if not already
  if ! sudo ufw status | grep -q "Status: active"; then
    print_warning "Enabling UFW firewall..."
    sudo ufw --force enable
  fi
  
  print_success "Firewall configured"
}

clone_and_build() {
  print_header "Building Boson.Core"
  
  mkdir -p "$PC2_DIR"
  cd "$PC2_DIR"
  
  # Clone repositories
  print_step "Cloning Boson.Parent..."
  [ ! -d "Boson.Parent" ] && git clone --depth 1 https://github.com/bosonnetwork/Boson.Parent.git
  
  print_step "Cloning Boson.Dependencies..."
  [ ! -d "Boson.Dependencies" ] && git clone --depth 1 https://github.com/bosonnetwork/Boson.Dependencies.git
  
  print_step "Cloning Boson.Core..."
  if [ ! -d "Boson.Core" ]; then
    git clone https://github.com/bosonnetwork/Boson.Core.git
    cd Boson.Core
    git checkout release-v2.0.7
    cd ..
  fi
  
  # Build
  print_step "Building Boson.Parent..."
  cd Boson.Parent
  ./mvnw install -DskipTests -Dgpg.skip=true -q
  cd ..
  
  print_step "Building Boson.Dependencies..."
  cd Boson.Dependencies
  ./mvnw install -DskipTests -Dgpg.skip=true -q
  cd ..
  
  print_step "Building Boson.Core..."
  cd Boson.Core
  ./mvnw package -DskipTests -Dgpg.skip=true -q
  cd ..
  
  print_success "Build complete"
}

deploy_binaries() {
  print_header "Deploying Binaries"
  
  print_step "Creating directory structure..."
  mkdir -p "$BOSON_DIR"/{bin,lib,config,data}
  mkdir -p "$DATA_DIR"/accesscontrol/{defaults,acls}
  
  print_step "Copying JAR files..."
  cp "$PC2_DIR"/Boson.Core/cmds/target/lib/*.jar "$LIB_DIR"/
  
  # Download Vert.x dependencies
  print_step "Downloading Vert.x dependencies..."
  cd "$LIB_DIR"
  [ ! -f "vertx-web-client-4.5.0.jar" ] && curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-web-client/4.5.0/vertx-web-client-4.5.0.jar
  [ ! -f "vertx-web-common-4.5.0.jar" ] && curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-web-common/4.5.0/vertx-web-common-4.5.0.jar
  [ ! -f "vertx-uri-template-4.5.0.jar" ] && curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-uri-template/4.5.0/vertx-uri-template-4.5.0.jar
  
  print_success "Binaries deployed"
}

create_config() {
  print_header "Creating Configuration"
  
  print_step "Generating node configuration..."
  
  cat > "$CONFIG_DIR/default.conf" << EOF
{
  "ipv4": true,
  "ipv6": false,
  "address4": "${PUBLIC_IP}",
  "port": ${DHT_PORT},
  "dataDir": "${DATA_DIR}",
  
  "bootstraps": [
    {"id": "HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ", "address": "155.138.245.211", "port": 39001},
    {"id": "6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ", "address": "45.32.138.246", "port": 39001},
    {"id": "J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E", "address": "69.164.241.210", "port": 39001}
  ],
  
  "services": [
    {
      "class": "io.bosonnetwork.service.activeproxy.ActiveProxy",
      "configuration": {
        "host": "${PUBLIC_IP}",
        "port": ${PROXY_PORT},
        "portMappingRange": "${PORT_RANGE_START}-${PORT_RANGE_END}"
      }
    }
  ]
}
EOF

  print_success "Configuration created at $CONFIG_DIR/default.conf"
}

create_systemd_service() {
  print_header "Creating Systemd Service"
  
  SERVICE_FILE="/etc/systemd/system/pc2-boson.service"
  
  print_step "Creating service file..."
  
  sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=PC2 Boson DHT Super Node - ${NODE_NAME}
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${BOSON_DIR}
ExecStart=/usr/bin/java -cp "${LIB_DIR}/*" -Dio.bosonnetwork.environment=production io.bosonnetwork.launcher.Main -c ${CONFIG_DIR}/default.conf
Restart=always
RestartSec=10
StandardOutput=append:${DATA_DIR}/boson.log
StandardError=append:${DATA_DIR}/boson.log

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  
  print_success "Service created"
}

start_service() {
  print_header "Starting Supernode"
  
  print_step "Starting PC2 Boson service..."
  sudo systemctl start pc2-boson
  
  print_step "Enabling auto-start on boot..."
  sudo systemctl enable pc2-boson
  
  # Wait for startup
  sleep 5
  
  if sudo systemctl is-active --quiet pc2-boson; then
    print_success "Supernode is running!"
  else
    print_error "Failed to start. Check logs: journalctl -u pc2-boson -f"
    exit 1
  fi
}

extract_node_id() {
  print_header "Node Information"
  
  # Wait for node ID to be generated
  print_step "Waiting for node ID generation..."
  sleep 10
  
  NODE_ID=$(grep "Boson Kademlia node:" "$DATA_DIR/boson.log" 2>/dev/null | tail -1 | awk '{print $NF}' || echo "")
  
  if [ -n "$NODE_ID" ]; then
    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Your Supernode is Ready!${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Node ID:     ${BLUE}${NODE_ID}${NC}"
    echo -e "  Public IP:   ${BLUE}${PUBLIC_IP}${NC}"
    echo -e "  DHT Port:    ${BLUE}${DHT_PORT}/UDP${NC}"
    echo -e "  Proxy Port:  ${BLUE}${PROXY_PORT}/TCP${NC}"
    echo ""
    echo "  To register as a bootstrap node, share these details with the PC2 team."
    echo ""
  else
    print_warning "Could not extract node ID yet. Check logs:"
    echo "  tail -f $DATA_DIR/boson.log"
  fi
}

verify_installation() {
  print_header "Verifying Installation"
  
  # Check service
  print_step "Service status:"
  if sudo systemctl is-active --quiet pc2-boson; then
    print_success "pc2-boson service is running"
  else
    print_error "pc2-boson service is not running"
  fi
  
  # Check DHT port
  print_step "DHT port (${DHT_PORT}/UDP):"
  if ss -ulnp | grep -q ":${DHT_PORT}"; then
    print_success "Listening"
  else
    print_error "Not listening"
  fi
  
  # Check Proxy port
  print_step "Proxy port (${PROXY_PORT}/TCP):"
  if ss -tlnp | grep -q ":${PROXY_PORT}"; then
    print_success "Listening"
  else
    print_warning "Not listening (may take a few seconds to start)"
  fi
  
  echo ""
  print_step "Useful commands:"
  echo "  View logs:    tail -f $DATA_DIR/boson.log"
  echo "  Stop:         sudo systemctl stop pc2-boson"
  echo "  Start:        sudo systemctl start pc2-boson"
  echo "  Status:       sudo systemctl status pc2-boson"
}

# =============================================================================
# Main
# =============================================================================

print_header "PC2 Supernode Setup"
echo "This script will set up a PC2 Boson Supernode on your server."
echo ""

check_root
detect_public_ip
check_system

echo ""
read -p "Ready to proceed with installation? [Y/n] " confirm
if [[ "$confirm" =~ ^[Nn] ]]; then
  echo "Aborted."
  exit 0
fi

install_dependencies
configure_firewall
clone_and_build
deploy_binaries
create_config
create_systemd_service
start_service
extract_node_id
verify_installation

echo ""
print_success "Setup complete! Your supernode is now part of the PC2 network."
echo ""
