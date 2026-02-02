# Pre-Release Plan: v1.0.0 Public Launch

> **Target: Wednesday Public Release**
> 
> Complete these tasks before the public community launch.

---

## Execution Order (Tomorrow)

### Phase 1: Version Reset (30 min)

1. **Mark all 2.x releases as pre-release on GitHub**
   - Go to https://github.com/Elacity/pc2.net/releases
   - Edit each 2.x release → Check "Set as a pre-release"
   - This keeps history but signals they're old/internal

2. **Update package.json files to 0.1.1**
   - `/package.json` → `"version": "0.1.1"`
   - `/pc2-node/package.json` → `"version": "0.1.1"`

3. **Create v0.1.1 release**
   ```bash
   git add -A
   git commit -m "chore: reset version to 0.1.1 for public launch"
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   gh release create v0.1.1 --title "v0.1.1 - Pre-release" --notes "Initial public pre-release"
   ```

4. **Test fresh install works with new version**
   ```bash
   rm -rf ~/pc2.net
   curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash
   ```

---

### Phase 2: Documentation Portal (1-2 hours)

**Portal:** docs.ela.city

**Pages to Create:**

1. **Getting Started**
   - Overview of ElastOS Personal Cloud
   - What you can do with PC2

2. **Installation Guides**
   - Local Installation (Mac/Windows/Linux)
   - VPS Deployment (Contabo, DigitalOcean, etc.)
   - ARM Devices (Raspberry Pi, Jetson)

3. **User Guide**
   - First Login & Wallet Connection
   - File Management
   - AI Assistant Setup
   - Settings Overview

4. **Managing Your PC2**
   - Starting & Stopping (PM2 commands)
   - Viewing Logs
   - Updating PC2
   - Troubleshooting

5. **For Developers**
   - Architecture Overview
   - Contributing Guide
   - API Reference (if applicable)

**Content source:** Pull from existing `docs/QUICKSTART.md` and expand

---

### Phase 3: Electron Desktop Launcher (2-4 hours)

**Goal:** Create a simple "ElastOS Personal Cloud" desktop app that users can download and run without terminal knowledge.

#### 3a. Project Setup

```bash
mkdir -p packages/elastos-launcher
cd packages/elastos-launcher
npm init -y
npm install electron electron-builder --save-dev
```

#### 3b. Project Structure

```
packages/elastos-launcher/
├── package.json
├── electron-builder.yml
├── src/
│   ├── main.js           # Main process
│   ├── preload.js        # Bridge
│   └── renderer/
│       ├── index.html    # UI
│       ├── styles.css    # Hardware box styling
│       └── app.js        # UI logic
└── resources/
    ├── icon.icns         # macOS
    ├── icon.ico          # Windows
    └── icon.png          # Linux
```

#### 3c. Core Features

| Feature | Description |
|---------|-------------|
| Power On/Off | Start/stop PC2 via PM2 |
| Status LED | Green=running, Red=stopped, Yellow=starting |
| Open Cloud | Opens browser to localhost:4200 |
| View Logs | Shows PM2 logs in panel |
| Auto-Install | Installs PC2 if not found |

#### 3d. Build for All Platforms

```bash
npm run build:mac    # Creates .dmg
npm run build:win    # Creates .exe
npm run build:linux  # Creates .AppImage
```

#### 3e. Distribution

- Upload built files to GitHub Release
- No app store needed
- Users download directly and run

**Note:** macOS shows "unidentified developer" warning (users right-click > Open to bypass). Windows SmartScreen may warn (click "Run anyway"). This is normal for unsigned apps.

---

### Phase 4: Final v1.0.0 Release (Wednesday)

1. **Bump version to 1.0.0**
   ```bash
   npm version minor --no-git-tag-version  # or manually edit
   # Update both package.json files to 1.0.0
   ```

2. **Create GitHub Release with Launcher**
   ```bash
   gh release create v1.0.0 \
     --title "v1.0.0 - ElastOS Personal Cloud" \
     --notes "## First Public Release
     
   Your sovereign personal cloud is here.
   
   ### Downloads
   - [ElastOS Launcher (macOS)](link)
   - [ElastOS Launcher (Windows)](link)
   - [ElastOS Launcher (Linux)](link)
   
   Or install via terminal:
   \`\`\`bash
   curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash
   \`\`\`
   "
   ```

3. **Announce to Community**

---

## Checklist

### Phase 1: Version Reset
- [ ] Mark 2.x releases as pre-release on GitHub
- [ ] Update package.json to 0.1.1
- [ ] Create and push v0.1.1 tag
- [ ] Create GitHub release v0.1.1
- [ ] Test fresh install

### Phase 2: Documentation
- [ ] Access docs.ela.city portal
- [ ] Create Getting Started page
- [ ] Create Installation Guides
- [ ] Create User Guide
- [ ] Create Managing Your PC2 page
- [ ] Review and publish

### Phase 3: Electron Launcher
- [ ] Create project structure
- [ ] Implement main process (PM2 integration)
- [ ] Build UI (hardware box design)
- [ ] Test on macOS
- [ ] Build for Windows
- [ ] Build for Linux
- [ ] Upload to GitHub

### Phase 4: v1.0.0 Release (Wednesday)
- [ ] Bump version to 1.0.0
- [ ] Create GitHub release with launcher downloads
- [ ] Update docs with launcher download links
- [ ] Announce to community

---

## Summary of Today's Work (2026-02-02)

### Releases Created
| Version | Changes |
|---------|---------|
| v2.6.3 | Telegram badge dark mode styling |
| v2.6.4 | Improved restart logging |
| v2.6.5 | Fixed auto-update (--include=dev for TypeScript) |
| v2.6.6 | Test release |
| v2.6.7 | Added missing pdf.js library for PDF viewer |
| v2.6.8 | PM2 restart fallback for non-systemd users |

### Key Fixes
- Auto-update now works on PM2 installations (start-local.sh users)
- PDF viewer works on fresh installs
- TypeScript build includes @types packages
- Restart tries multiple methods (systemctl, pm2, etc.)

### Documentation Updated
- `docs/RELEASE_PROCESS.md` - Updated with auto-update fix notes
- `docs/PRE_RELEASE_PLAN.md` - This file (tomorrow's plan)

### Tested
- Fresh install via `start-local.sh` works
- Login works (after clearing stale localStorage)
- PDF viewer works
- PM2 stop/start/restart commands work
