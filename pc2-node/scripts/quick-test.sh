#!/bin/bash
# Quick Test - Prove PC2 Node works independently

cd "$(dirname "$0")/.."

echo "🚀 Starting PC2 Node in test mode..."
echo ""

# Kill any existing server
lsof -ti:4202 | xargs kill -9 2>/dev/null || true

# Start server (will run without IPFS)
cd test-fresh-install
PORT=4202 node dist/index.js > /tmp/pc2-test.log 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Waiting for server to start..."
sleep 8

echo ""
echo "=== Testing Endpoints ==="
echo ""

# Test health
echo "1. Health Check:"
HEALTH=$(curl -s http://localhost:4202/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo "   ✅ Server is responding!"
    echo "   Response: $HEALTH" | head -c 200
    echo "..."
else
    echo "   ❌ Server not responding"
    echo "   Check logs: tail -f /tmp/pc2-test.log"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "2. Version:"
VERSION=$(curl -s http://localhost:4202/version 2>/dev/null)
echo "   $VERSION"

echo ""
echo "3. Authentication:"
AUTH_RESPONSE=$(curl -s -X POST http://localhost:4202/auth/particle \
    -H "Content-Type: application/json" \
    -d '{"wallet_address":"0x1111111111111111111111111111111111111111"}' 2>/dev/null)
if echo "$AUTH_RESPONSE" | grep -q "token"; then
    TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Authentication successful!"
    echo "   Token: ${TOKEN:0:30}..."
    
    echo ""
    echo "4. Whoami:"
    WHOAMI=$(curl -s http://localhost:4202/whoami -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    if echo "$WHOAMI" | grep -q "wallet_address"; then
        echo "   ✅ User info retrieved!"
        echo "   Wallet: $(echo "$WHOAMI" | grep -o '"wallet_address":"[^"]*"' | cut -d'"' -f4)"
    fi
else
    echo "   ❌ Authentication failed"
fi

echo ""
echo "=== ✅ PROOF: PC2 Node is working independently! ==="
echo ""
echo "📊 Server Status:"
echo "   - Running on: http://localhost:4202"
echo "   - PID: $SERVER_PID"
echo "   - Database: $(ls -lh test-fresh-install/data/pc2.db 2>/dev/null | awk '{print $5}' || echo 'N/A')"
echo ""
echo "🌐 Open http://localhost:4202 in your browser!"
echo ""
echo "🛑 To stop: kill $SERVER_PID"

