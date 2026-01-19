#!/bin/sh
# PC2 Node Docker Entrypoint
# Handles initial setup and configuration

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     PC2 Node Starting                         ║"
echo "║              Personal Cloud Computer v0.1.0                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"

# Create data directories if they don't exist
mkdir -p /app/data/config
mkdir -p /app/data/db
mkdir -p /app/data/ipfs
mkdir -p /app/data/user-homes

# Copy production config if no config exists
if [ ! -f /app/data/config/pc2.json ]; then
    echo "[PC2] Creating default production configuration..."
    cp /app/config/pc2.production.json /app/data/config/pc2.json
fi

# Update config based on environment variables
if [ "$PC2_ISOLATION_MODE" != "" ]; then
    echo "[PC2] Terminal isolation mode: $PC2_ISOLATION_MODE"
fi

# Check if bubblewrap is available for namespace isolation
if [ "$PC2_ISOLATION_MODE" = "namespace" ]; then
    if command -v bwrap >/dev/null 2>&1; then
        echo "[PC2] ✓ Bubblewrap available - namespace isolation enabled"
    else
        echo "[PC2] ✗ WARNING: Bubblewrap not found - namespace isolation will fail!"
        echo "[PC2]   Install with: apk add bubblewrap"
    fi
fi

# Check HTTPS configuration
if [ "$HTTPS_ENABLED" = "true" ]; then
    echo "[PC2] HTTPS enabled for domain: $DOMAIN"
    
    if [ -z "$DOMAIN" ]; then
        echo "[PC2] ✗ ERROR: HTTPS_ENABLED=true but DOMAIN not set!"
        exit 1
    fi
    
    if [ -z "$LETSENCRYPT_EMAIL" ]; then
        echo "[PC2] ⚠ WARNING: LETSENCRYPT_EMAIL not set - using staging certificates"
    fi
fi

echo "[PC2] Data directory: /app/data"
echo "[PC2] Port: ${PORT:-4200}"
echo ""

# Start the Node.js application
exec node --import tsx src/index.ts "$@"
