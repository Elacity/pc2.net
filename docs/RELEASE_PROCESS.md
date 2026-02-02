# PC2 Release Process

> **For AI Agents**: Follow this guide exactly when asked to "publish a release" or "create a new version".

---

## Complete Developer Workflow

This is the full process from development to production deployment.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT → PRODUCTION FLOW                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DEVELOP (Local)                                                     │
│     └── Create feature branch                                           │
│     └── Make changes, commit                                            │
│     └── Rebuild GUI: npm run build:gui                                  │
│     └── Test on localhost:4200                                          │
│                                                                         │
│  2. PRE-MERGE CHECKLIST                                                 │
│     └── Commit any rebuilt assets (particle-auth, bundles)              │
│     └── Run full test checklist                                         │
│     └── Push branch to origin                                           │
│                                                                         │
│  3. MERGE TO MAIN                                                       │
│     └── Create PR or direct merge                                       │
│     └── Push to origin/main                                             │
│                                                                         │
│  4. CREATE RELEASE                                                      │
│     └── Bump version in package.json files                              │
│     └── Create git tag                                                  │
│     └── Create GitHub Release                                           │
│                                                                         │
│  5. AUTO-DEPLOY TO VPS                                                  │
│     └── VPS checks for updates (every 3 hours, or manual check)         │
│     └── User clicks "Install Update" in Settings → System               │
│     └── Server: git pull → npm install → npm build → restart            │
│     └── Done! New version is live                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1: Development (Local Machine)

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make your changes...

# Rebuild the GUI after frontend changes
npm run build:gui

# Start local server for testing
npm run start:pc2

# Test at http://localhost:4200
```

**Key build commands:**
| Command | What it does |
|---------|--------------|
| `npm run build:gui` | Rebuilds frontend bundle (`pc2-node/frontend/bundle.min.js`) |
| `npm run build:backend` | Compiles TypeScript backend (in `pc2-node/`) |
| `npm run start:pc2` | Starts the PC2 node server on port 4200 |

---

### Step 2: Pre-Merge Checklist

Before merging to main, ensure everything is committed:

#### Check for uncommitted build artifacts
```bash
git status
```

**Common uncommitted files that MUST be committed:**

| File/Folder | When to commit |
|-------------|----------------|
| `pc2-node/frontend/bundle.min.js` | After `npm run build:gui` |
| `pc2-node/frontend/bundle.min.css` | After `npm run build:gui` |
| `src/particle-auth/` | After rebuilding particle-auth |
| `src/gui/src/i18n/translations/*.js` | After adding translations |

#### Commit build artifacts
```bash
# If particle-auth was rebuilt
git add src/particle-auth/
git commit -m "chore: rebuild particle-auth assets"

# If GUI was rebuilt  
git add pc2-node/frontend/
git commit -m "chore: rebuild GUI bundle"

# Push to your branch
git push origin feature/my-feature
```

#### Test Checklist (before merge)

Run through these on localhost:4200:

- [ ] **Login** - No grey screen, wallet connects
- [ ] **Language** - Switching languages persists after reload
- [ ] **Theme** - Dark/light mode persists after reload
- [ ] **Settings tabs** - All tabs load without errors
- [ ] **Wallet sidebar** - Opens, shows balances
- [ ] **Send/Receive** - Windows open correctly
- [ ] **Browser console** - No 404 errors or JS exceptions

---

### Step 3: Merge to Main

**Option A: Via Pull Request (Recommended)**
```bash
# Create PR
gh pr create --base main --head feature/my-feature \
  --title "feat: My feature description" \
  --body "## Summary
- Change 1
- Change 2

## Test Plan
- Tested login flow
- Tested settings
"

# After review, merge via GitHub UI
```

**Option B: Direct Merge**
```bash
git checkout main
git pull origin main
git merge feature/my-feature
git push origin main
```

---

### Step 4: Create GitHub Release

**This step is REQUIRED for VPS auto-updates to work!**

#### 4a. Bump version numbers

> ⚠️ **CRITICAL: DO NOT SKIP THIS STEP!**
> 
> If you create a GitHub release without bumping `package.json`, the VPS will:
> - Download the update successfully
> - But still show the OLD version number in Settings → System
> - Keep showing "Update Available" even after installing
> 
> The `package.json` version is what the server reports as "current version".

```bash
# OPTION 1: Use the automated release script (RECOMMENDED)
npm run release -- patch   # For bug fixes (2.6.0 → 2.6.1)
npm run release -- minor   # For new features (2.6.0 → 2.7.0)
npm run release -- major   # For breaking changes (2.6.0 → 3.0.0)

# OPTION 2: Manual version bump
# Edit both files:
# /package.json → "version": "X.Y.Z"
# /pc2-node/package.json → "version": "X.Y.Z"
```

#### 4b. Commit and tag
```bash
git add package.json pc2-node/package.json
git commit -m "chore: bump version to vX.Y.Z"
git push origin main

git tag -a vX.Y.Z -m "vX.Y.Z - Brief description"
git push origin vX.Y.Z
```

#### 4c. Create GitHub Release
```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z - Release Title" \
  --notes "## What's New

- Feature 1: Description
- Feature 2: Description

## Bug Fixes

- Fixed issue with X

## For Node Operators

Your PC2 node will detect this update within 3 hours.
Click 'Install Update' in Settings → System.
"
```

Or create manually at: https://github.com/Elacity/pc2.net/releases/new

---

### Step 5: Deploy to VPS (Auto-Update)

Once the GitHub Release exists, your VPS will auto-detect it:

1. **Automatic detection**: Checks every 3 hours
2. **Manual check**: Go to **Settings → System** → Click **"Check for Updates"**
3. **Install**: Click **"Install Update"** button
4. **Progress**: Watch the status: Downloading → Installing → Building → Restarting
5. **Done**: Page auto-refreshes with new version

**What happens during install:**
```bash
# The server automatically runs:
git pull origin main      # Download latest code
npm install               # Install any new dependencies
npm run build             # Rebuild backend + frontend
systemctl restart pc2     # Restart the service
```

---

### Rebuilding Particle Auth

If you modify the Particle Auth source code (`packages/particle-auth/`):

```bash
# Navigate to particle-auth package
cd packages/particle-auth

# Install dependencies (if needed)
npm install

# Build
npm run build

# Copy built files to src/particle-auth
rm -rf ../../src/particle-auth
cp -r dist ../../src/particle-auth

# Commit the rebuilt assets
cd ../..
git add src/particle-auth/
git commit -m "chore: rebuild particle-auth"
```

**Important**: The built `src/particle-auth/` folder contains hashed filenames (e.g., `index-DWEcBvd3.js`). Every rebuild creates new hashes. You MUST commit these changes or the login page will 404.

---

### Troubleshooting

#### Grey screen after login
- Check if `src/particle-auth/` was committed after a rebuild
- Check browser console for 404 errors on `/particle-auth/assets/`

#### Changes not appearing after merge
- Ensure you ran `npm run build:gui` and committed `pc2-node/frontend/bundle.min.js`
- Check cache-busting: update the version query param in `pc2-node/frontend/index.html`

#### VPS doesn't see update
- Ensure you created a **GitHub Release** (not just pushed to main)
- Check the release is visible at: https://github.com/Elacity/pc2.net/releases/latest
- Manual check: `curl -s https://api.github.com/repos/Elacity/pc2.net/releases/latest | jq .tag_name`

---

## GitHub Releases URL

**View all releases:** https://github.com/Elacity/pc2.net/releases

**Latest release:** https://github.com/Elacity/pc2.net/releases/latest

---

## How Auto-Updates Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTO-UPDATE FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Developer creates GitHub Release v2.6.0                        │
│       │                                                         │
│       ▼                                                         │
│  GitHub API: /repos/Elacity/pc2.net/releases/latest             │
│       │                                                         │
│       ▼                                                         │
│  Every PC2 Node (checks every 3 hours):                         │
│    1. Fetches latest version from GitHub                        │
│    2. Compares: current < latest?                               │
│    3. Shows "Update Available" toast notification               │
│    4. User clicks "Install Update"                              │
│    5. Node executes: git pull → npm install → npm build         │
│    6. Server restarts automatically                             │
│    7. Page refreshes with new version                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Safety During Updates

**User data is 100% safe during updates.** Here's why:

| What | Location | During Update |
|------|----------|---------------|
| User files | `data/` directory | ✅ Untouched (not in git) |
| Database | `data/pc2.db` | ✅ Untouched (not in git) |
| IPFS data | `data/ipfs/` | ✅ Untouched (not in git) |
| User settings | `data/pc2.db` | ✅ Untouched (not in git) |
| Wallet/keys | `data/` | ✅ Untouched (not in git) |
| Code/frontend | `src/`, `pc2-node/` | 🔄 Updated via git pull |

The `data/` directory is in `.gitignore` and never touched by `git pull`.

---

## Release Checklist

### Step 1: Update Version Numbers

Edit both files to the new version:

```bash
# Root package.json
/package.json → "version": "X.Y.Z"

# PC2 Node package.json  
/pc2-node/package.json → "version": "X.Y.Z"
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Release vX.Y.Z - Brief description"
git push origin main
```

### Step 3: Create Git Tag

```bash
git tag -a vX.Y.Z -m "vX.Y.Z - Brief description"
git push origin vX.Y.Z
```

### Step 4: Create GitHub Release

Use the GitHub API (preferred for automation):

```bash
TOKEN=$(git credential-osxkeychain get <<< $'protocol=https\nhost=github.com' 2>/dev/null | grep password | cut -d= -f2)

curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Elacity/pc2.net/releases \
  -d '{
    "tag_name": "vX.Y.Z",
    "name": "vX.Y.Z - Release Title",
    "body": "## What'\''s New\n\n- Feature 1\n- Feature 2\n- Bug fix 1",
    "draft": false,
    "prerelease": false
  }'
```

Or manually at: https://github.com/Elacity/pc2.net/releases/new

---

## Release Notes Template

```markdown
## What's New

- **Feature Name** - Brief description of what it does
- **Another Feature** - Brief description

## Bug Fixes

- Fixed issue with X
- Resolved problem in Y

## For Node Operators

Your PC2 node will automatically detect this update within 3 hours.
Click "Install Update" when prompted - your data is safe!
```

---

## Verify Release

After creating a release, verify it works:

```bash
# Check GitHub API returns the release
curl -s "https://api.github.com/repos/Elacity/pc2.net/releases/latest" | jq '.tag_name, .name'

# Check a PC2 node can see it
curl -s -X POST http://localhost:4200/api/update/check | jq
```

---

## Key Files

| File | Purpose |
|------|---------|
| `/pc2-node/src/services/UpdateService.ts` | Update check logic |
| `/pc2-node/src/api/update.ts` | Update API endpoints |
| `/src/gui/src/UI/UIUpdateModal.js` | Frontend update UI |
| `/src/gui/src/UI/Settings/UITabAbout.js` | About page with update banner |

---

## Rollback (If Needed)

If a release has issues, node operators can rollback:

```bash
cd /path/to/pc2-node
git checkout vX.Y.Z-1  # Previous version tag
npm install
npm run build
# Restart server
```

---

## Version Numbering

Follow semantic versioning:
- **Major (X.0.0)**: Breaking changes
- **Minor (0.Y.0)**: New features, backwards compatible  
- **Patch (0.0.Z)**: Bug fixes only

Current version: Check `/package.json`
