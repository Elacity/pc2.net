# Task: Backup/Restore Functionality

**Task ID**: backup-restore
**Created**: 2025-12-19
**Status**: Review
**Priority**: High

## Description
Implement backup and restore functionality for PC2 Node to enable users to create full backups of their data (database, IPFS repo, config) and restore from backups. This is critical for data safety and enables seamless updates.

## Background
From audit: Backup/restore is **NOT IMPLEMENTED** - this is a critical gap before Phase 3 packaging. Users need the ability to:
1. Create backups before updates
2. Restore from backups if something goes wrong
3. Migrate data to new hardware/servers

## Requirements
1. **Backup Script:**
   - Creates timestamped archive (tar.gz) containing:
     - Database file (`data/pc2.db`)
     - IPFS repository (`data/ipfs/`)
     - User config (`config/config.json` if exists)
   - Stores backups in `backups/` directory
   - Provides clear success/failure feedback
   - Validates data exists before backing up

2. **Restore Script:**
   - Accepts backup file path as argument
   - Validates backup file exists and is valid
   - Stops server if running (warns user)
   - Extracts backup to temporary location
   - Validates extracted data
   - Replaces current data with backup data
   - Provides clear success/failure feedback

3. **NPM Scripts:**
   - `npm run backup` - Create backup
   - `npm run restore <backup-file>` - Restore from backup

4. **Error Handling:**
   - Graceful failure with clear error messages
   - Validation of paths and files
   - Prevents overwriting data without confirmation (for restore)

## Implementation Plan
- [x] Create task document
- [x] Create backup script (`scripts/backup.js`)
- [x] Create restore script (`scripts/restore.js`)
- [x] Add npm scripts to `package.json`
- [x] Install tar dependency
- [x] Test backup creation
- [x] Test restore functionality
- [x] Verify data integrity after restore

## Acceptance Criteria
- [ ] `npm run backup` creates timestamped backup archive
- [ ] Backup contains database, IPFS repo, and config
- [ ] `npm run restore <file>` restores data from backup
- [ ] Restored data is identical to original
- [ ] Scripts provide clear feedback
- [ ] Error handling works correctly
- [ ] Works with existing data

## Files to Modify
- `pc2-node/test-fresh-install/package.json` - Add backup/restore scripts

## Files to Create
- `pc2-node/test-fresh-install/scripts/backup.js` - Backup script
- `pc2-node/test-fresh-install/scripts/restore.js` - Restore script

## Testing Strategy
1. Create test data (files, users, sessions)
2. Run backup
3. Verify backup file exists and contains expected data
4. Modify/delete original data
5. Run restore
6. Verify restored data matches original
7. Test error cases (invalid backup, missing files, etc.)

## Notes
- Use Node.js built-in modules (fs, path, zlib) + tar npm package
- Backup format: tar.gz (standard, portable)
- Backup location: `backups/pc2-backup-YYYYMMDD-HHMMSS.tar.gz`
- Restore validates backup before overwriting data
- Current data is backed up to `.old-backup/` before restore
- Consider adding backup cleanup (keep last N backups) - future enhancement

## Implementation Summary

**Files Created:**
- `pc2-node/test-fresh-install/scripts/backup.js` - Creates timestamped tar.gz backups
- `pc2-node/test-fresh-install/scripts/restore.js` - Restores from backup archives

**Files Modified:**
- `pc2-node/test-fresh-install/package.json` - Added `backup` and `restore` npm scripts
- Added `tar` dependency for archive creation/extraction

**Test Results:**
- ✅ Backup creates timestamped archives successfully (tested: 215MB backup)
- ✅ Restore extracts and restores data correctly
- ✅ Database, IPFS repo, and config all backed up and restored
- ✅ Server detection and warnings work correctly
- ✅ Error handling provides clear feedback

**Usage:**
```bash
# Create backup
npm run backup

# Restore from backup
npm run restore pc2-backup-20251219-185457.tar.gz
```
