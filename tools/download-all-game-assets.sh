#!/bin/bash
# Download all game assets for fully offline use

GAME_DIR="src/backend/apps/solitaire-frvr"
BASE_URL="https://solitaire.frvr.com"

cd "$(dirname "$0")/.."

echo "📦 Downloading all Solitaire FRVR assets for offline use..."

cd "$GAME_DIR"

# Download all referenced assets
echo "📥 Downloading SDK files..."
curl -s "${BASE_URL}/frvr-sdk.min.js" -o js/frvr-sdk.min.js
curl -s "${BASE_URL}/frvr-channel-web.min.js" -o js/frvr-channel-web.min.js

echo "📥 Downloading manifest files..."
curl -s "${BASE_URL}/assets/manifest.3b0d52c5.json" -o assets/manifest.json
curl -s "${BASE_URL}/assets/manifest.3b0d52c5.js" -o assets/manifest.js

echo "📥 Downloading icons..."
curl -s "${BASE_URL}/assets/favicon.894962e6.png" -o assets/favicon.png
curl -s "${BASE_URL}/assets/icon60x60.7c199270.png" -o assets/icon60x60.png
curl -s "${BASE_URL}/assets/icon76x76.d2e07f7a.png" -o assets/icon76x76.png
curl -s "${BASE_URL}/assets/icon120x120.d7922a71.png" -o assets/icon120x120.png
curl -s "${BASE_URL}/assets/icon196x196.220187d7.png" -o assets/icon196x196.png
curl -s "${BASE_URL}/assets/icon256x256.cb791562.png" -o assets/icon256x256.png
curl -s "${BASE_URL}/assets/icon1024x1024.ff2fe9d9.png" -o assets/icon1024x1024.png

echo "✅ Assets downloaded!"
echo "💡 Note: Games use external SDKs - full offline may require additional assets"
echo "   Current: ~400KB of core assets downloaded"
