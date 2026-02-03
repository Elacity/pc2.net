#!/bin/bash
#
# PC2 Safe Update Script
# This script safely updates PC2 without causing orphaned processes or port conflicts
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PC2_DIR="$(dirname "$SCRIPT_DIR")"
PC2_NODE_DIR="$PC2_DIR/pc2-node"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  PC2 Safe Update                                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Stop PC2 completely
echo "📛 Step 1: Stopping PC2..."
pm2 stop pc2 2>/dev/null || true
sleep 2

# Step 2: Kill any orphaned processes
echo "🔪 Step 2: Killing orphaned processes..."
pm2 delete pc2 2>/dev/null || true
pkill -9 -f "node.*pc2-node.*dist/index" 2>/dev/null || true
pkill -9 -f "node.*dist/index.js" 2>/dev/null || true
sleep 3

# Step 3: Verify ports are free
echo "🔍 Step 3: Verifying ports are free..."
for port in 4200 4001 4002; do
    if lsof -i :$port >/dev/null 2>&1; then
        echo "   ⚠️  Port $port still in use, force killing..."
        fuser -k $port/tcp 2>/dev/null || true
        sleep 2
    fi
done

# Final port check
if lsof -i :4200 >/dev/null 2>&1; then
    echo "❌ ERROR: Port 4200 still in use after cleanup. Please manually kill the process:"
    lsof -i :4200
    exit 1
fi
echo "   ✅ All ports free"

# Step 4: Pull latest code
echo "📥 Step 4: Pulling latest code..."
cd "$PC2_DIR"
git fetch origin main
git reset --hard origin/main

# Step 5: Rebuild
echo "🔨 Step 5: Rebuilding..."
cd "$PC2_NODE_DIR"
npm install --legacy-peer-deps 2>/dev/null || npm install
npm run build

# Step 6: Wait for Telegram session to expire (if previously connected)
echo "⏳ Step 6: Waiting for stale sessions to expire (15 seconds)..."
sleep 15

# Step 7: Start with PM2 using safe settings
echo "🚀 Step 7: Starting PC2..."
cd "$PC2_DIR"
if [ -f "ecosystem.config.cjs" ]; then
    pm2 start ecosystem.config.cjs
else
    pm2 start "$PC2_NODE_DIR/dist/index.js" \
        --name pc2 \
        --cwd "$PC2_NODE_DIR" \
        --restart-delay 10000 \
        --max-restarts 5
fi

# Step 8: Save PM2 config
pm2 save

# Step 9: Verify startup
echo "🔍 Step 9: Verifying startup..."
sleep 10
if pm2 show pc2 | grep -q "online"; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  ✅ PC2 Updated Successfully!                                ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    pm2 status
    echo ""
    curl -s http://localhost:4200/health | head -1
else
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  ⚠️  PC2 may have issues. Check logs:                        ║"
    echo "║     pm2 logs pc2                                             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    pm2 status
fi
