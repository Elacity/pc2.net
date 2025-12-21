# PC2 Node Upgrade & Maintenance Strategy

**Date:** 2025-12-19  
**Purpose:** Long-term maintenance strategy for multi-year project development

---

## 🎯 Core Principle: Code vs Data Separation

**Like iOS Updates:** Code updates don't affect user data. User data persists across versions.

### What Gets Updated (Code):
- ✅ Frontend bundle (`frontend/bundle.min.js`)
- ✅ Backend code (`dist/` directory)
- ✅ Dependencies (`node_modules/`)
- ✅ Configuration defaults (`config/default.json`)

### What Stays Intact (User Data):
- ✅ Database (`data/pc2.db`) - **Preserved across updates**
- ✅ IPFS repository (`data/ipfs/`) - **Preserved across updates**
- ✅ User config (`config/config.json`) - **Preserved across updates**

**Key Insight:** Updates replace code, not data. Database migrations handle schema changes automatically.

---

## 📦 Update Process (Like iOS)

### Scenario: User Updates from v1.0.0 → v1.1.0

**Step 1: Backup (Recommended)**
```bash
npm run backup  # Creates backup archive
```

**Step 2: Update Package**
```bash
# Download new version
git pull origin main
# Or: Download new release package

# Install dependencies
npm install

# Rebuild (if needed)
npm run build
```

**Step 3: Start Server**
```bash
npm start
```

**What Happens:**
1. ✅ Server starts, detects database version
2. ✅ Migration system runs automatically (`runMigrations()`)
3. ✅ Database schema updated if needed (additive changes only)
4. ✅ User data preserved (all files, accounts, sessions intact)
5. ✅ New features available immediately

**Result:** User gets new features, all data intact.

---

## 🔄 Database Migration System (Already Implemented)

### Current Status: ✅ **PRODUCTION-READY**

**How It Works:**
1. **Version Tracking:** `schema_migrations` table tracks current version
2. **Automatic Migration:** Runs on every server start
3. **Additive Changes:** Migrations only add (never remove) columns/tables
4. **Backward Compatible:** Old code works with new schema

**Example Migration Flow:**
```typescript
// migrations.ts
const CURRENT_VERSION = 4;  // Current schema version

// On server start:
const currentVersion = getCurrentVersion(db);  // e.g., 3
if (currentVersion < CURRENT_VERSION) {
  // Run migrations 3 → 4
  // Adds new tables/columns
  // Preserves all existing data
}
```

**Migration History:**
- **Migration 2:** Added `thumbnail` column (backward compatible)
- **Migration 3:** Added `content_text` + FTS5 search (backward compatible)
- **Migration 4:** Added `file_versions` table (backward compatible)

**Future Migrations:**
- **Migration 5:** Add new feature table (e.g., `shares` for file sharing)
- **Migration 6:** Add new column (e.g., `encryption_key` for E2E encryption)
- **Migration N:** Always additive, never destructive

---

## 🏗️ Architecture: Code vs Data Separation

### Directory Structure:
```
pc2-node/
├── frontend/          🔄 UPDATED (code)
├── dist/              🔄 UPDATED (code)
├── src/               🔄 UPDATED (code)
├── node_modules/      🔄 UPDATED (dependencies)
├── config/
│   ├── default.json   🔄 UPDATED (new defaults)
│   └── config.json    ✅ PRESERVED (user config)
└── data/
    ├── pc2.db         ✅ PRESERVED (user data)
    └── ipfs/          ✅ PRESERVED (user data)
```

### Update Strategy:
1. **Code Updates:** Replace `frontend/`, `dist/`, `src/`, `node_modules/`
2. **Data Preservation:** Keep `data/` and `config/config.json` intact
3. **Migration:** Automatic schema updates on startup

---

## ✅ Can We Build Features After Backup/Restore?

**Answer: YES** - Absolutely no problem.

### Why It's Safe:

1. **Database Migrations:** Already handle schema changes
   - New features = new migrations
   - Migrations are additive (never destructive)
   - User data preserved automatically

2. **Code Separation:** Code and data are separate
   - Update code → data stays intact
   - Add features → migrations add new tables/columns
   - Remove features → code removed, data preserved (can restore later)

3. **Backup/Restore:** Provides safety net
   - Before major updates: `npm run backup`
   - If something goes wrong: `npm run restore <backup>`
   - Allows experimentation without fear

### Development Workflow:

```
1. Implement new feature
2. Add database migration (if needed)
3. Test with existing data
4. Deploy update
5. Users get new features, data intact
```

**Example: Adding File Sharing Feature**

```typescript
// Migration 5: Add file sharing
if (currentVersion < 5) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY,
      file_path TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      share_token TEXT UNIQUE,
      expires_at INTEGER,
      FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
    )
  `);
  recordMigration(db, 5);
}
```

**Result:**
- ✅ Existing users: Database updated automatically
- ✅ New users: Get new schema from start
- ✅ All data: Preserved and accessible

---

## 📋 Long-Term Maintenance Best Practices

### 1. Version Numbering Strategy

**Semantic Versioning:**
- **Major (1.x.x):** Breaking changes (rare, avoid if possible)
- **Minor (x.1.x):** New features, backward compatible
- **Patch (x.x.1):** Bug fixes, backward compatible

**Current:** `1.0.0`

**Recommendation:**
- Use minor versions for new features: `1.1.0`, `1.2.0`, etc.
- Migrations handle schema changes automatically
- Users update seamlessly

### 2. Migration Guidelines

**✅ DO:**
- Add new tables/columns
- Create indexes
- Add triggers
- Populate new columns with defaults
- Make changes backward compatible

**❌ DON'T:**
- Drop columns (deprecate instead)
- Rename columns (add new, migrate data, deprecate old)
- Change column types (add new column, migrate, deprecate old)
- Delete user data

**Example: Renaming a Column (Safe Approach)**
```typescript
// Migration: Rename 'old_name' to 'new_name'
// Step 1: Add new column
db.exec('ALTER TABLE files ADD COLUMN new_name TEXT');

// Step 2: Migrate data
db.exec('UPDATE files SET new_name = old_name WHERE new_name IS NULL');

// Step 3: Keep old column for backward compatibility
// (Don't drop it - old code might still reference it)
```

### 3. Update Distribution Strategy

**Option A: Git Pull (Development/Advanced Users)**
```bash
git pull origin main
npm install
npm run build
npm start
```

**Option B: Package Download (End Users)**
```bash
# Download new .tar.gz or .zip
# Extract to new directory
# Copy data/ and config/config.json from old installation
# Run: npm install && npm run build && npm start
```

**Option C: Package Manager (Future)**
```bash
# Debian package
sudo apt update && sudo apt upgrade pc2-node

# macOS package
# Auto-update via installer

# Docker
docker pull pc2-node:latest
docker-compose up -d
```

### 4. Data Backup Strategy

**Before Updates:**
```bash
npm run backup  # Creates timestamped archive
```

**Backup Contents:**
- `data/pc2.db` - All user accounts, files, sessions
- `data/ipfs/` - All file content
- `config/config.json` - User configuration

**Restore if Needed:**
```bash
npm run restore backups/pc2-backup-20251219-120000.tar.gz
```

---

## 🔐 Data Safety Guarantees

### What's Protected:

1. **User Accounts:** ✅ Preserved across updates
   - Wallet addresses
   - Smart account addresses
   - Login history

2. **File Metadata:** ✅ Preserved across updates
   - File paths
   - Sizes, MIME types
   - Thumbnails
   - Creation/modification dates

3. **File Content:** ✅ Preserved across updates
   - IPFS CIDs (immutable)
   - File content (stored in IPFS)
   - Version history

4. **Sessions:** ✅ Preserved (until expiration)
   - Active sessions continue working
   - Expired sessions cleaned up automatically

5. **Settings:** ✅ Preserved
   - User preferences
   - Node configuration

### What Can Change:

1. **Frontend UI:** ✅ Updates (new features, bug fixes)
2. **Backend Logic:** ✅ Updates (new endpoints, features)
3. **Database Schema:** ✅ Updates (additive migrations only)
4. **Dependencies:** ✅ Updates (security patches, new features)

---

## 🚀 Recommended Development Workflow

### For New Features:

1. **Design Feature**
   - Plan database changes (if any)
   - Design migration (additive only)

2. **Implement Feature**
   - Write code
   - Write migration
   - Test with existing data

3. **Deploy Update**
   - Users download/update package
   - Server starts, migration runs
   - Feature available immediately

4. **User Experience:**
   - ✅ All existing data intact
   - ✅ New features available
   - ✅ No data loss
   - ✅ Seamless upgrade

### For Breaking Changes (Avoid If Possible):

If absolutely necessary:
1. **Version Bump:** Major version (1.0.0 → 2.0.0)
2. **Migration Path:** Provide data migration script
3. **Documentation:** Clear upgrade instructions
4. **Backup Required:** Mandatory before upgrade

**Recommendation:** Avoid breaking changes. Use feature flags and deprecation instead.

---

## 📊 Update Compatibility Matrix

| Update Type | Data Affected? | Migration Needed? | User Action Required? |
|------------|---------------|-------------------|---------------------|
| Bug Fix (Patch) | ❌ No | ❌ No | Update package |
| New Feature (Minor) | ❌ No | ✅ Yes (automatic) | Update package |
| Security Update | ❌ No | ❌ Usually no | Update package |
| Breaking Change (Major) | ⚠️ Maybe | ✅ Yes (manual) | Update + migration |

**Current Strategy:** Focus on minor version updates (new features) with automatic migrations.

---

## 🎯 Long-Term Vision

### Year 1-2: Feature Development
- Add new features (search, versioning, sharing, etc.)
- Database migrations handle schema changes
- Users update seamlessly
- Data preserved across all updates

### Year 3-5: Platform Maturity
- Stable API
- Backward compatibility maintained
- Migration system handles all schema changes
- Users can skip versions (update from v1.0 → v1.5 directly)

### Year 5+: Ecosystem Growth
- Plugin system (if needed)
- API stability guarantees
- Long-term data preservation
- Multi-node federation (if desired)

---

## ✅ Summary: Can We Build Features After Backup/Restore?

**YES** - Absolutely. Here's why:

1. **✅ Migration System:** Already handles schema changes automatically
2. **✅ Code/Data Separation:** Updates don't touch user data
3. **✅ Additive Changes:** Migrations only add, never remove
4. **✅ Backup Safety Net:** Users can backup before updates
5. **✅ Proven Pattern:** Same approach as iOS, macOS, Linux package managers

**Workflow:**
```
1. Implement backup/restore (Priority 1) ✅
2. Continue building features ✅
3. Add migrations for new features ✅
4. Users update seamlessly ✅
5. All data preserved ✅
```

**Recommendation:** Implement backup/restore, then continue feature development. The migration system ensures updates are safe and seamless.

---

**Document Status:** Ready for implementation  
**Next Steps:** Implement backup/restore, then proceed with feature development
