#!/bin/bash
#
# PC2 Web Gateway Deployment Script
#
# Usage: ./deploy.sh [VPS_IP]
#
# This script deploys the Web Gateway to the specified VPS.
# Default VPS: 69.164.241.210 (Elacity super node)
#

set -e

VPS_IP="${1:-69.164.241.210}"
VPS_USER="root"
REMOTE_DIR="/root/pc2/web-gateway"

echo "🚀 Deploying PC2 Web Gateway to ${VPS_IP}..."

# Sync files
echo "📂 Syncing files..."
scp index.js package.json "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"

# Install dependencies and restart
echo "📦 Installing dependencies..."
ssh "${VPS_USER}@${VPS_IP}" "cd ${REMOTE_DIR} && npm install && systemctl restart pc2-gateway"

# Check status
echo "🔍 Checking status..."
ssh "${VPS_USER}@${VPS_IP}" "systemctl status pc2-gateway --no-pager"

echo "✅ Deployment complete!"
echo ""
echo "Gateway is now running with proxy:// endpoint support."
echo "View logs: ssh ${VPS_USER}@${VPS_IP} 'tail -f /root/pc2/web-gateway/gateway.log'"
