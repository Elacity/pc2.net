#!/bin/bash
# Start PC2 Node Server

cd "$(dirname "$0")"

echo "🚀 Starting PC2 Node..."
echo "   Port: 4202"
echo "   Database: $(pwd)/data/pc2.db"
echo ""
echo "Press Ctrl+C to stop"
echo ""

PORT=4202 node dist/index.js

