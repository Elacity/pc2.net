# PC2 Apps Integration Guide

## Current Status

The apps (`viewer`, `player`, `pdf`, `editor`, `terminal`) are currently pointing to Puter's hosted servers:
- `https://viewer.puter.com/index.html`
- `https://player.puter.com/index.html`
- `https://pdf.puter.com/index.html`
- `https://editor.puter.com/index.html`
- `https://terminal.puter.com/index.html`

## Problem

For PC2 to be fully decentralized, these apps must run on the user's PC2 node, not on Puter's servers.

## Solution: Bundle Apps with PC2

### Step 1: Get Apps from Puter Repository

The apps should be located at:
```
/path/to/puter/
  apps/
    viewer/
    player/
    pdf/
    editor/
    terminal/
```

**Check Puter's GitHub repository:**
```bash
# Clone Puter's main repository
git clone https://github.com/HeyPuter/puter.git puter-original
cd puter-original

# Check if apps directory exists
ls -la apps/

# If it exists, copy to PC2
cp -r apps/ /path/to/pc2.net/src/backend/apps/
```

### Step 2: Update PC2 to Serve Apps Locally

The backend router (`src/backend/src/routers/_default.js`) already handles serving apps from:
```
config.defaultjs_asset_path + 'apps/' + subdomain
```

Which resolves to: `src/backend/apps/{subdomain}/`

**For production PC2, update app URLs to point to local PC2 node:**

In `tools/mock-pc2-server.cjs` (and later in production PC2 extension):

```javascript
// Instead of:
index_url: 'https://viewer.puter.com/index.html'

// Use:
index_url: `http://${nodeUrl}/apps/viewer/index.html`
// Or if using subdomains:
index_url: `http://viewer.${nodeDomain}/index.html`
```

### Step 3: Docker Integration

When building the PC2 Docker image, ensure apps are included:

```dockerfile
# In docker/pc2/Dockerfile
COPY src/backend/apps/ /app/src/backend/apps/
```

### Step 4: Alternative: Use Built-in Apps

Some apps might be served from `/builtin/` prefix (see `SelfHostedModule.js`):
- Terminal: `/builtin/terminal`
- Phoenix (Shell): `/builtin/phoenix`
- Git: `/builtin/git`
- Dev Center: `/builtin/dev-center`

Check if viewer/player/pdf can be moved to `/builtin/` or if they need to stay in `/apps/`.

## Current Mock Server Behavior

The mock server (`tools/mock-pc2-server.cjs`) currently:
1. Returns app definitions in `/get-launch-apps` and `/drivers/call`
2. Points to Puter's hosted URLs (temporary for testing)
3. Does NOT serve the actual app files (no `/apps/` directory)

## Production Requirements

For production PC2 node:

1. **Apps must be bundled** in the PC2 software package
2. **Apps must be served** from the PC2 node (not external URLs)
3. **Apps must work offline** (no external dependencies)
4. **Apps must be branded** for ElastOS (if needed)

## Next Steps

1. ✅ Check if `apps/` directory exists in Puter's GitHub repo
2. ⏳ Clone/copy apps to `src/backend/apps/` in PC2
3. ⏳ Update mock server to serve apps from local path
4. ⏳ Update production PC2 extension to serve apps locally
5. ⏳ Test apps work when served from PC2 node
6. ⏳ Update Docker build to include apps
7. ⏳ Document app deployment in PC2 installation guide

## Notes

- The apps are likely separate repositories or submodules in Puter's original repo
- Check `.gitmodules` for submodule references
- Apps might need to be built (npm install, npm build) before serving
- Some apps might have dependencies that need to be included

