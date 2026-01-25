#!/bin/bash
# PC2 Network Map - Deployment Script
# Run on InterServer supernode

set -e

DEPLOY_DIR="/root/pc2/network-map"
REPO_DIR="$(dirname "$0")"

echo "=== PC2 Network Map Deployment ==="

# Create deploy directory
mkdir -p $DEPLOY_DIR

# Copy files
echo "Copying files..."
cp -r $REPO_DIR/server $DEPLOY_DIR/
cp -r $REPO_DIR/frontend $DEPLOY_DIR/
cp $REPO_DIR/package.json $DEPLOY_DIR/

# Install dependencies
echo "Installing dependencies..."
cd $DEPLOY_DIR
npm install --production

# Build frontend
echo "Building frontend..."
cd $DEPLOY_DIR/frontend
npm install
npm run build

# Create systemd service
echo "Setting up systemd service..."
cat > /etc/systemd/system/pc2-network-map.service << 'EOF'
[Unit]
Description=PC2 Network Map Service
After=network.target pc2-gateway.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/pc2/network-map
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=WEB_GATEWAY_URL=https://ela.city

[Install]
WantedBy=multi-user.target
EOF

# Reload and start service
systemctl daemon-reload
systemctl enable pc2-network-map
systemctl restart pc2-network-map

echo "=== Deployment complete ==="
echo "Service running on port 3100"
echo "Configure nginx to proxy map.ela.city -> localhost:3100"
