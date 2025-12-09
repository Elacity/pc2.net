# Apps to Install from Puter Repository

## Overview

Based on investigation of the [Puter GitHub repository](https://github.com/HeyPuter/puter), the following apps are referenced but **not included** in the main repository. They are currently hosted on Puter's servers and need to be obtained separately.

## Required Apps List

### Core Apps (Required for PC2)

1. **viewer** (`app-7870be61-8dff-4a99-af64-e9ae6811e367`)
   - **Purpose**: View images (JPG, PNG, WebP, SVG, BMP, JPEG)
   - **Current URL**: `https://viewer.puter.com/index.html`
   - **Target URL**: `http://viewer.localhost:4200/index.html` (mock) → `http://viewer.{pc2-node}/index.html` (production)
   - **Status**: ⚠️ Not in main repo

2. **player** (`app-11edfba2-1ed3-4e22-8573-47e88fb87d70`)
   - **Purpose**: Play videos and audio (MP4, WebM, MPG, MPV, MP3, M4A, OGG, MOV, AVI)
   - **Current URL**: `https://player.puter.com/index.html`
   - **Target URL**: `http://player.localhost:4200/index.html` (mock) → `http://player.{pc2-node}/index.html` (production)
   - **Status**: ⚠️ Not in main repo

3. **pdf** (`app-3920851d-bda8-479b-9407-8517293c7d44`)
   - **Purpose**: View PDF files
   - **Current URL**: `https://pdf.puter.com/index.html`
   - **Target URL**: `http://pdf.localhost:4200/index.html` (mock) → `http://pdf.{pc2-node}/index.html` (production)
   - **Status**: ⚠️ Not in main repo (uses PDF.js v2.10.377)

4. **editor** (`app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58`)
   - **Purpose**: Edit text files
   - **Current URL**: `https://editor.puter.com/index.html`
   - **Target URL**: `http://editor.localhost:4200/index.html` (mock) → `http://editor.{pc2-node}/index.html` (production)
   - **Status**: ⚠️ Not in main repo

5. **terminal** (`app-3fea7529-266e-47d9-8776-31649cd06557`)
   - **Purpose**: Terminal/shell access
   - **Current URL**: `https://terminal.puter.com/index.html`
   - **Target URL**: `http://terminal.localhost:4200/index.html` (mock) → `http://terminal.{pc2-node}/index.html` (production)
   - **Status**: ✅ **Already in repo** at `src/terminal/` (served via `/builtin/terminal`)

### Additional Apps (Optional)

6. **code** - Code editor (advanced)
7. **markus** - Markdown editor
8. **draw** - Drawing app
9. **camera** - Camera app
10. **recorder** - Screen recorder
11. **dev-center** - Developer center
12. **about** - About page
13. **docs** - Documentation viewer

## Where to Get the Apps

### Option 1: Check Puter's GitHub Organization

The apps might be in separate repositories under the `HeyPuter` organization:

```bash
# Check these potential repositories:
https://github.com/HeyPuter/puter-viewer
https://github.com/HeyPuter/puter-player
https://github.com/HeyPuter/puter-pdf
https://github.com/HeyPuter/puter-editor
https://github.com/HeyPuter/puter-terminal  # (we already have this)
```

### Option 2: Download from Puter's Hosted Servers

If the apps are not open-sourced, you may need to:

1. **Inspect the hosted apps** to understand their structure
2. **Download the built files** from `viewer.puter.com`, `player.puter.com`, etc.
3. **Recreate the apps** based on Puter's app development framework

### Option 3: Contact Puter Team

Reach out to the Puter team:
- **Discord**: https://discord.com/invite/PQcx7Teh8u
- **Email**: hi@puter.com
- **GitHub Issues**: https://github.com/HeyPuter/puter/issues

Ask if:
- The apps are available as separate repositories
- They can be included in the main repository
- There's documentation on building these apps

## Installation Strategy

### Step 1: Create Apps Directory Structure

```bash
cd /Users/mtk/Documents/Cursor/pc2.net
mkdir -p src/backend/apps/{viewer,player,pdf,editor}
```

### Step 2: Get Each App

For each app (viewer, player, pdf, editor):

```bash
# If separate repos exist:
git clone https://github.com/HeyPuter/puter-viewer.git src/backend/apps/viewer
git clone https://github.com/HeyPuter/puter-player.git src/backend/apps/player
git clone https://github.com/HeyPuter/puter-pdf.git src/backend/apps/pdf
git clone https://github.com/HeyPuter/puter-editor.git src/backend/apps/editor
```

### Step 3: Build Apps (if needed)

```bash
cd src/backend/apps/viewer
npm install
npm run build  # Check package.json for build command
# Repeat for each app
```

### Step 4: Test with Mock Server

The mock server is already configured to serve apps from `src/backend/apps/{subdomain}/`:

```bash
# Start mock server
node tools/mock-pc2-server.cjs

# Test apps:
# http://viewer.localhost:4200/
# http://player.localhost:4200/
# http://pdf.localhost:4200/
# http://editor.localhost:4200/
```

### Step 5: Update Production PC2 Extension

For production, the PC2 extension should:
1. Serve apps from `src/backend/apps/` directory
2. Use the user's PC2 node URL instead of `localhost:4200`
3. Update app URLs dynamically based on the connected PC2 node

## Current Status

- ✅ **Mock server configured** to serve apps locally
- ✅ **App URLs updated** to point to localhost (for mock) and PC2 node (for production)
- ✅ **Terminal app** already exists in repo
- ⚠️ **viewer, player, pdf, editor** need to be obtained
- ⚠️ **Apps directory** needs to be created and populated

## Next Steps

1. **Check Puter's GitHub organization** for separate app repositories
2. **Contact Puter team** if apps aren't open-sourced
3. **Download/inspect hosted apps** if needed
4. **Create apps directory structure** in PC2
5. **Copy/build apps** into `src/backend/apps/`
6. **Test with mock server**
7. **Update production PC2 extension** to serve apps

## Notes

- **PDF.js**: The PDF app uses PDF.js v2.10.377. Make sure this dependency is included.
- **Subdomains**: Apps are served via subdomains. For production, configure DNS or use path-based routing.
- **CORS**: Apps may need CORS headers when making requests to the PC2 API.
- **Dependencies**: Some apps might have external dependencies that need to be bundled.

