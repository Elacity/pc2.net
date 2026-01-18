#!/bin/bash
# ===========================================
# PC2 Development Server Startup Script
# ===========================================
# Starts the full-featured PC2 Node from pc2-node/
# 
# Features included:
# - WASM runtime
# - AI endpoints (Claude, Gemini, Ollama, OpenAI)
# - Backup/Restore system
# - Storage dashboard
# - Elastos integration
# - Search indexing
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PC2_NODE_DIR="$SCRIPT_DIR/pc2-node"

# Default port
PORT="${PORT:-4200}"

echo "============================================"
echo "  PC2 Development Server"
echo "============================================"
echo "Starting from: $PC2_NODE_DIR"
echo "Port: $PORT"
echo "============================================"
echo ""

# Kill any existing processes on the port
if lsof -ti :$PORT > /dev/null 2>&1; then
    echo "⚠️  Port $PORT is in use, killing existing process..."
    lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
    sleep 1
fi

cd "$PC2_NODE_DIR"
PORT=$PORT npm start
