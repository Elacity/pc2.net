#!/bin/bash
#
# Boson HTTP API Service Deployment Script
#
# This script builds and deploys the HTTP API service to the super node.
# The service exposes DHT operations via REST API for the Web Gateway.
#
# Usage: ./deploy.sh [VPS_IP]
#

set -e

VPS_IP="${1:-69.164.241.210}"
VPS_USER="root"
REMOTE_DIR="/root/pc2/boson/lib"
SERVICE_JAR="boson-http-api-1.0.0.jar"

echo "🔧 Building Boson HTTP API Service..."

# Build the JAR (requires Maven)
if command -v mvn &> /dev/null; then
    mvn clean package -DskipTests
else
    echo "⚠️  Maven not found. Please install Maven or build manually."
    echo "   brew install maven  (macOS)"
    echo "   apt install maven   (Ubuntu)"
    exit 1
fi

echo "📦 Deploying to ${VPS_IP}..."

# Copy JAR to VPS
scp target/${SERVICE_JAR} "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/"

# Update Boson config to include the HTTP API service
echo "📝 Updating Boson configuration..."
ssh "${VPS_USER}@${VPS_IP}" << 'REMOTE_SCRIPT'
# Backup current config
cp /root/pc2/boson/config/default.conf /root/pc2/boson/config/default.conf.bak

# Check if HttpApiService is already configured
if grep -q "httpapi.HttpApiService" /root/pc2/boson/config/default.conf; then
    echo "HttpApiService already configured"
else
    # Add the HTTP API service to the config
    # Using Python for JSON manipulation
    python3 << 'PYTHON_SCRIPT'
import json

with open('/root/pc2/boson/config/default.conf', 'r') as f:
    config = json.load(f)

# Add HTTP API service
http_api_service = {
    "class": "io.bosonnetwork.service.httpapi.HttpApiService",
    "configuration": {
        "host": "127.0.0.1",
        "port": 8091
    }
}

if 'services' not in config:
    config['services'] = []

# Check if already exists
exists = any(s.get('class', '').endswith('HttpApiService') for s in config['services'])
if not exists:
    config['services'].append(http_api_service)
    
    with open('/root/pc2/boson/config/default.conf', 'w') as f:
        json.dump(config, f, indent=2)
    print("Added HttpApiService to config")
else:
    print("HttpApiService already in config")
PYTHON_SCRIPT
fi

# Restart Boson service
echo "🔄 Restarting Boson service..."
systemctl restart pc2-boson
sleep 5
systemctl status pc2-boson --no-pager | head -10
REMOTE_SCRIPT

echo ""
echo "✅ Deployment complete!"
echo ""
echo "HTTP API is now available at: http://${VPS_IP}:8091/api/health"
echo ""
echo "Endpoints:"
echo "  GET  /api/health           - Health check"
echo "  GET  /api/node             - Node information"
echo "  GET  /api/username/:name   - Lookup username"
echo "  POST /api/username         - Register username"
echo "  GET  /api/dht/find/:id     - Find DHT value"
echo "  POST /api/dht/store        - Store DHT value"
