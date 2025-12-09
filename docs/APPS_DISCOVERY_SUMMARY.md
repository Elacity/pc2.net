# Apps Discovery Summary

## Key Finding

After investigating both our repository and Puter's original repository:

**The apps (viewer, player, pdf, editor) are NOT in the Puter repository.** They are hosted externally on Puter's servers:
- `https://viewer.puter.com`
- `https://player.puter.com`
- `https://pdf.puter.com`
- `https://editor.puter.com`

## Where Apps Are Located

### In Our Repository:
- ✅ **terminal**: `src/terminal/` (served via `/builtin/terminal`)
- ⚠️ **editor**: `src/backend/apps/editor/` (directory exists but empty)

### In Puter's Original Repository:
- ✅ **terminal**: `src/terminal/` (same as ours)
- ❌ **viewer, player, pdf, editor**: Not in repository

## How Apps Are Served

Puter has two ways to serve apps:

1. **Built-in Apps** (like terminal):
   - Location: `src/{app}/dist/`
   - URL: `/builtin/{app}`
   - Example: Terminal is at `src/terminal/dist/` served via `/builtin/terminal`

2. **Subdomain Apps** (like viewer, player, pdf, editor):
   - Expected location: `src/backend/apps/{app}/`
   - URL: `{app}.domain.com`
   - Example: Viewer should be at `src/backend/apps/viewer/` served via `viewer.domain.com`

## Database Registration

The apps ARE registered in the database (`0002_add-default-apps.sql`):
- `viewer` - `app-7870be61-8dff-4a99-af64-e9ae6811e367`
- `player` - `app-11edfba2-1ed3-4e22-8573-47e88fb87d70`
- `pdf` - `app-3920851d-bda8-479b-9407-8517293c7d44`
- `editor` - `app-838dfbc4-bf8b-48c2-b47b-c4adc77fab58`

But the actual app files are hosted externally.

## Solution: Download from Hosted Servers

Since the apps aren't in the repository, we need to download them from Puter's hosted servers:

### Option 1: Use Download Script

```bash
# Run the download script
./tools/download-puter-apps.sh
```

This will:
1. Download `index.html` from each app's hosted URL
2. Extract asset URLs (JS, CSS, images, etc.)
3. Download all assets
4. Place them in `src/backend/apps/{app}/`

### Option 2: Manual Download

1. Visit each app's URL in browser
2. Use browser dev tools to inspect network requests
3. Download all assets manually
4. Place in `src/backend/apps/{app}/`

### Option 3: Contact Puter Team

Ask if:
- The apps are available as separate repositories
- They can provide the source code
- There's documentation on building these apps

## Next Steps

1. **Download apps** using the script or manually
2. **Fix asset paths** - Update any hardcoded URLs to point to local PC2 node
3. **Test with mock server** - Ensure apps load correctly
4. **Update for production** - Ensure apps work when served from PC2 node

## Current Status

- ✅ Apps directory structure created: `src/backend/apps/{viewer,player,pdf,editor}/`
- ✅ Mock server configured to serve apps from these directories
- ✅ App URLs updated to point to localhost (mock) and PC2 node (production)
- ⚠️ App files need to be downloaded from hosted servers

