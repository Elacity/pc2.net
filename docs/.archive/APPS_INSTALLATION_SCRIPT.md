# Apps Installation Script

## Quick Start

This script will help you install the required apps from Puter's repository.

## Apps to Install

Based on the Puter repository structure, here are the apps we need:

### ✅ Already Available
- **terminal** - Already in `src/terminal/` (served via `/builtin/terminal`)

### ⚠️ Need to Install
1. **viewer** - Image viewer
2. **player** - Video/audio player  
3. **pdf** - PDF viewer (uses PDF.js)
4. **editor** - Text editor

## Installation Methods

### Method 1: Check for Separate Repositories

First, check if Puter has separate repositories for each app:

```bash
# Check these URLs:
https://github.com/HeyPuter/puter-viewer
https://github.com/HeyPuter/puter-player
https://github.com/HeyPuter/puter-pdf
https://github.com/HeyPuter/puter-editor
```

If they exist, clone them:

```bash
cd /Users/mtk/Documents/Cursor/pc2.net/src/backend/apps

# Clone each app (if repositories exist)
git clone https://github.com/HeyPuter/puter-viewer.git viewer
git clone https://github.com/HeyPuter/puter-player.git player
git clone https://github.com/HeyPuter/puter-pdf.git pdf
git clone https://github.com/HeyPuter/puter-editor.git editor
```

### Method 2: Download from Hosted Servers

If the apps aren't open-sourced, you can inspect and download from Puter's hosted servers:

```bash
# Use browser dev tools or curl to download the built files
# Example for viewer:
curl -o src/backend/apps/viewer/index.html https://viewer.puter.com/index.html
# Then download all assets (JS, CSS, etc.)
```

### Method 3: Build from Puter's App Framework

If Puter provides documentation on building apps, follow their guide to recreate these apps.

## After Installation

1. **Build apps** (if needed):
   ```bash
   cd src/backend/apps/viewer && npm install && npm run build
   cd ../player && npm install && npm run build
   cd ../pdf && npm install && npm run build
   cd ../editor && npm install && npm run build
   ```

2. **Test with mock server**:
   ```bash
   node tools/mock-pc2-server.cjs
   # Then visit:
   # http://viewer.localhost:4200/
   # http://player.localhost:4200/
   # http://pdf.localhost:4200/
   # http://editor.localhost:4200/
   ```

3. **Verify in PuterOS**:
   - Upload an image → should open in viewer
   - Upload a video → should open in player
   - Upload a PDF → should open in pdf viewer
   - Upload a text file → should open in editor

## Current Status

- ✅ Apps directory structure created: `src/backend/apps/{viewer,player,pdf,editor}/`
- ✅ Mock server configured to serve apps from these directories
- ✅ App URLs updated to point to localhost (mock) and PC2 node (production)
- ⚠️ App files need to be obtained and placed in the directories

