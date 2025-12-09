#!/bin/bash
# Download Puter Apps from Hosted Servers
# This script downloads the built apps from Puter's hosted servers
# and places them in src/backend/apps/

set -e

APPS_DIR="src/backend/apps"
BASE_URL="https://viewer.puter.com"

APPS=(
    "viewer:https://viewer.puter.com"
    "player:https://player.puter.com"
    "pdf:https://pdf.puter.com"
    "editor:https://editor.puter.com"
)

echo "📦 Downloading Puter Apps..."
echo ""

# Create apps directory if it doesn't exist
mkdir -p "$APPS_DIR"

for app_info in "${APPS[@]}"; do
    IFS=':' read -r app_name app_url <<< "$app_info"
    APP_DIR="$APPS_DIR/$app_name"
    
    echo "📥 Downloading $app_name from $app_url..."
    mkdir -p "$APP_DIR"
    
    # Download index.html
    if curl -s -f -o "$APP_DIR/index.html" "$app_url/index.html"; then
        echo "   ✅ Downloaded index.html"
    else
        echo "   ❌ Failed to download index.html"
        continue
    fi
    
    # Extract and download assets (JS, CSS, images, etc.)
    echo "   🔍 Extracting asset URLs from index.html..."
    
    # Download common assets
    ASSETS=$(grep -oE '(src|href)="[^"]*\.(js|css|png|jpg|jpeg|svg|woff|woff2|ttf|wasm)"' "$APP_DIR/index.html" | sed 's/.*="\([^"]*\)".*/\1/' | sort -u)
    
    for asset in $ASSETS; do
        # Handle relative URLs
        if [[ $asset == /* ]]; then
            asset_url="$app_url$asset"
            asset_path="$APP_DIR$asset"
        elif [[ $asset == http* ]]; then
            asset_url="$asset"
            asset_path="$APP_DIR/$(basename $asset)"
        else
            asset_url="$app_url/$asset"
            asset_path="$APP_DIR/$asset"
        fi
        
        # Create directory structure
        mkdir -p "$(dirname "$asset_path")"
        
        # Download asset
        if curl -s -f -o "$asset_path" "$asset_url" 2>/dev/null; then
            echo "   ✅ Downloaded: $asset"
        else
            echo "   ⚠️  Failed to download: $asset"
        fi
    done
    
    echo "   ✅ $app_name download complete"
    echo ""
done

echo "🎉 All apps downloaded!"
echo ""
echo "Next steps:"
echo "1. Review the downloaded files in $APPS_DIR"
echo "2. Fix any broken asset paths"
echo "3. Test with mock server: node tools/mock-pc2-server.cjs"
echo "4. Visit: http://viewer.localhost:4200/"

