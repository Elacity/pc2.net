# Game Bundling Explanation

## Current Local Apps (for comparison)

**Viewer, Player, PDF:**
- **Viewer**: ~1.1 MB (Puter's own app, fully bundled)
- **Player**: ~412 KB (Puter's own app, fully bundled)  
- **PDF**: ~520 KB (Puter's own app, fully bundled)

These are Puter's own applications that come with all assets pre-bundled.

## Game Sizes (estimated)

**Third-party games:**
- **Solitaire FRVR**: ~5-15 MB (web version, all assets)
- **In Orbit**: ~3-10 MB (web version, all assets)
- **Doodle Jump**: ~2-8 MB (web version, all assets)

**Total estimated**: ~10-33 MB for all three games

## How Bundling Would Work

### Step 1: Download All Assets
```
solitaire-frvr/
├── index.html          (main HTML)
├── js/
│   ├── game.js         (game logic)
│   ├── engine.js       (game engine)
│   └── ...
├── css/
│   ├── styles.css      (game styles)
│   └── ...
├── images/
│   ├── cards.png       (card images)
│   ├── background.jpg  (backgrounds)
│   └── ...
├── fonts/
│   └── game-font.woff  (custom fonts)
└── assets/
    └── ...             (other resources)
```

### Step 2: Process
1. **Crawl the game website** - Download all referenced files
2. **Fix paths** - Update all URLs to be relative/local
3. **Store locally** - Put everything in `src/backend/apps/[game-name]/`
4. **Update HTML** - Change all external URLs to local paths

### Step 3: Result
Games work exactly like viewer/player/pdf:
- ✅ Fully offline (no internet needed)
- ✅ All assets in your package
- ✅ Same structure as other apps

## Technical Approach

**Option A: Manual Download Tool**
```javascript
// tools/download-game-assets.js
1. Fetch game HTML
2. Parse for all asset references (JS, CSS, images)
3. Download each asset
4. Update paths in HTML
5. Save to apps directory
```

**Option B: Use Existing Tools**
- `wget --mirror` or `httrack` to download entire site
- Process and clean up paths
- Store in apps directory

## Comparison

| Approach | Size | Internet Needed | Complexity |
|----------|------|----------------|------------|
| **Iframe (current)** | ~1 KB | ✅ Yes | Simple |
| **Full Bundle** | ~10-33 MB | ❌ No | Medium |

## Recommendation

**For Phase 1:**
- Keep iframe approach (works, simple, small)
- Games are part of package structure
- Requires internet for game content

**For Phase 2 (if needed):**
- Bundle games fully for offline use
- Add ~10-33 MB to package
- Works completely offline like viewer/player/pdf

## Implementation Time

- **Iframe approach**: ✅ Done (current)
- **Full bundling**: ~2-4 hours per game (download, fix paths, test)
