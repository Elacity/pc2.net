#!/bin/bash
set -e

# ElastOS PC2 Entrypoint Script
# Handles first-run setup, IPFS initialization, and server startup

echo "═══════════════════════════════════════════════════════════════════════"
echo "║                                                                     ║"
echo "║   🌐 ElastOS PC2 - Personal Cloud Compute                           ║"
echo "║                                                                     ║"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Configuration
DATA_DIR="${PC2_DATA_DIR:-/data}"
CONFIG_DIR="${PC2_CONFIG_DIR:-$DATA_DIR/config}"
DB_DIR="${PC2_DB_DIR:-$DATA_DIR/db}"
STORAGE_DIR="${PC2_STORAGE_DIR:-$DATA_DIR/storage}"
IPFS_DIR="${PC2_IPFS_DIR:-$DATA_DIR/ipfs}"
SETUP_TOKEN_FILE="$CONFIG_DIR/.setup_token"

# Create directories if they don't exist
mkdir -p "$CONFIG_DIR" "$DB_DIR" "$STORAGE_DIR" "$IPFS_DIR"

# Check if this is first run (no setup token exists)
if [ ! -f "$SETUP_TOKEN_FILE" ]; then
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🔐 FIRST RUN DETECTED - GENERATING SETUP TOKEN                    ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Generate cryptographically secure setup token
    SETUP_TOKEN=$(openssl rand -hex 32)
    
    # Save hash of token (never store plaintext)
    echo "$SETUP_TOKEN" | openssl dgst -sha256 | awk '{print $2}' > "$SETUP_TOKEN_FILE.hash"
    
    # Display token prominently
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   🔐 PC2 SETUP TOKEN - SAVE THIS! SHOWN ONLY ONCE!                  ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   PC2-SETUP-$SETUP_TOKEN"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "║                                                                     ║"
    echo "║   To claim ownership of this PC2 node:                              ║"
    echo "║   1. Open your browser to this PC2's address                        ║"
    echo "║   2. Connect your wallet (MetaMask/Essentials)                      ║"
    echo "║   3. Enter your PC2 URL and this setup token                        ║"
    echo "║   4. Sign the message to become the owner                           ║"
    echo "║                                                                     ║"
    echo "║   ⚠️  This token will NOT be shown again!                           ║"
    echo "║   ⚠️  Without this token, you cannot claim ownership!               ║"
    echo "║                                                                     ║"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Mark setup as pending
    touch "$SETUP_TOKEN_FILE"
    echo "AWAITING_OWNER" > "$CONFIG_DIR/.node_status"
else
    NODE_STATUS=$(cat "$CONFIG_DIR/.node_status" 2>/dev/null || echo "UNKNOWN")
    echo "Node status: $NODE_STATUS"
fi

# Initialize IPFS if needed
if [ ! -f "$IPFS_DIR/config" ]; then
    echo ""
    echo "Initializing IPFS node..."
    export IPFS_PATH="$IPFS_DIR"
    
    # Check if ipfs is available
    if command -v ipfs &> /dev/null; then
        ipfs init --profile server 2>/dev/null || true
        
        # Configure IPFS for PC2 usage
        ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001 2>/dev/null || true
        ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080 2>/dev/null || true
        ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]' 2>/dev/null || true
        
        echo "IPFS initialized successfully"
    else
        echo "IPFS not installed - skipping initialization"
    fi
fi

# Start IPFS daemon in background if available
if command -v ipfs &> /dev/null; then
    echo ""
    echo "Starting IPFS daemon..."
    export IPFS_PATH="$IPFS_DIR"
    ipfs daemon --migrate=true &
    IPFS_PID=$!
    echo "IPFS daemon started (PID: $IPFS_PID)"
fi

# Display startup info
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "║                                                                     ║"
echo "║   🚀 Starting ElastOS PC2 Server                                    ║"
echo "║                                                                     ║"
echo "║   Web Interface:  http://0.0.0.0:${PC2_PORT:-4100}                  ║"
echo "║   WebSocket:      ws://0.0.0.0:${PC2_WS_PORT:-4200}                 ║"
echo "║   IPFS API:       http://127.0.0.1:5001                             ║"
echo "║                                                                     ║"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# Execute the main command
exec "$@"

