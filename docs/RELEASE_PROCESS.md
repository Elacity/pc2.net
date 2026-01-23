# PC2 Release Process

> **For AI Agents**: Follow this guide exactly when asked to "publish a release" or "create a new version".

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
