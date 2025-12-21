# How to Get Apps from Puter Repository

## Overview

The apps (`viewer`, `player`, `pdf`, `editor`, `terminal`) need to be copied from Puter's original repository into PC2 so they run locally on the user's PC2 node instead of on Puter's servers.

## Step 1: Clone Puter's Repository

```bash
# Clone Puter's main repository
git clone https://github.com/HeyPuter/puter.git puter-original
cd puter-original
```

## Step 2: Locate Apps Directory

The apps should be in one of these locations:

### Option A: Root-level `apps/` directory
```bash
ls -la apps/
# Should show: viewer/, player/, pdf/, editor/, terminal/
```

### Option B: `src/backend/apps/` directory
```bash
ls -la src/backend/apps/
# Should show: viewer/, player/, pdf/, editor/, terminal/
```

### Option C: Separate repositories
The apps might be in separate GitHub repositories:
- `https://github.com/HeyPuter/puter-viewer`
- `https://github.com/HeyPuter/puter-player`
- `https://github.com/HeyPuter/puter-pdf`
- `https://github.com/HeyPuter/puter-editor`
- `https://github.com/HeyPuter/puter-terminal`

Check Puter's GitHub organization: https://github.com/HeyPuter

## Step 3: Copy Apps to PC2

Once you find the apps, copy them to PC2:

```bash
# From puter-original directory
# If apps are in root:
cp -r apps/ /path/to/pc2.net/src/backend/apps/

# If apps are in src/backend/apps:
cp -r src/backend/apps/ /path/to/pc2.net/src/backend/apps/

# If apps are separate repos, clone each:
cd /path/to/pc2.net/src/backend/
git clone https://github.com/HeyPuter/puter-viewer.git apps/viewer
git clone https://github.com/HeyPuter/puter-player.git apps/player
git clone https://github.com/HeyPuter/puter-pdf.git apps/pdf
git clone https://github.com/HeyPuter/puter-editor.git apps/editor
git clone https://github.com/HeyPuter/puter-terminal.git apps/terminal
```

## Step 4: Build Apps (if needed)

Some apps might need to be built:

```bash
cd /path/to/pc2.net/src/backend/apps/viewer
npm install
npm run build  # or npm run dist, check package.json

# Repeat for each app: player, pdf, editor, terminal
```

## Step 5: Verify Structure

The final structure should be:

```
pc2.net/
  src/
    backend/
      apps/
        viewer/
          index.html
          (other files)
        player/
          index.html
          (other files)
        pdf/
          index.html
          (other files)
        editor/
          index.html
          (other files)
        terminal/
          index.html
          (other files)
```

## Step 6: Test with Mock Server

The mock server (`tools/mock-pc2-server.cjs`) is now configured to:
1. Serve apps from `src/backend/apps/{subdomain}/`
2. Point app URLs to `http://{subdomain}.localhost:4200/index.html`

Test by:
1. Starting the mock server: `node tools/mock-pc2-server.cjs`
2. Opening `http://viewer.localhost:4200/` in your browser
3. The app should load from your local files

## Step 7: Update Production PC2 Extension

For production, the PC2 extension should:
1. Serve apps from the same `src/backend/apps/` directory
2. Use the user's PC2 node URL instead of `localhost:4200`
3. Update app URLs dynamically based on the connected PC2 node

## Notes

- **PDF.js**: The PDF app likely uses PDF.js library. Make sure all dependencies are included.
- **Subdomains**: Apps are served via subdomains (`viewer.localhost:4200`). For production, you might need to configure DNS or use path-based routing.
- **CORS**: Apps might need CORS headers when making requests to the PC2 API.
- **Dependencies**: Some apps might have external dependencies that need to be bundled or served separately.

## Alternative: Use Built-in Apps

Some apps (like `terminal`) are already in the repo under `src/terminal/` and served via `/builtin/terminal`. Check if viewer/player/pdf can be moved to a similar structure.

