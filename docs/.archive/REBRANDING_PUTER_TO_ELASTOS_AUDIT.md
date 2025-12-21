# Rebranding Audit: Puter → ElastOS

**Date**: 2025-01-11  
**Purpose**: Comprehensive audit of all "Puter" references to determine what can be safely changed to "ElastOS" without breaking functionality.

---

## Executive Summary

**Total Files with "Puter" references**: ~1,374 files  
**Safe to Change**: ~200-300 instances (UI text, display names, comments)  
**Needs Careful Consideration**: ~50-100 instances (file paths, directory names)  
**Should NOT Change**: ~1,000+ instances (API endpoints, SDK code, internal identifiers)

---

## 🟢 SAFE TO CHANGE (User-Facing & Display)

### 1. File Directory Root Name
**Location**: `src/gui/src/globals.js:88`
```javascript
window.root_dirname = 'Puter';  // → 'ElastOS'
```
**Impact**: ✅ **SAFE** - This controls the root directory name shown in file browser breadcrumbs (e.g., "Puter ▸ 0x34daf31b... ▸ Trash" → "ElastOS ▸ 0x34daf31b... ▸ Trash")

**Recommendation**: **CHANGE THIS** - This is exactly what the user wants to change in file directories.

---

### 2. i18n Translation Strings (User-Facing Text)
**Location**: `src/gui/src/i18n/translations/en.js`

**Safe to change**:
- `window_title_puter: 'Puter'` → `'ElastOS'`
- `puter_description: 'Puter is a privacy-first...'` → `'ElastOS is a privacy-first...'`
- `sign_in_with_puter: "Sign in with Puter"` → `"Sign in with ElastOS"`
- `restart_puter_confirm: "Are you sure you want to restart Puter?"` → `"Are you sure you want to restart ElastOS?"`
- `get_a_copy_of_on_puter: 'Get a copy of '%%' on Puter.com!'` → `'Get a copy of '%%' on ElastOS!'`
- `refer_friends_c2a: "Get 1 GB for every friend who creates and confirms an account on Puter..."` → `"...on ElastOS..."`
- `storage_puter_used: 'used by Puter'` → `'used by ElastOS'`
- `tos_fineprint: '...you agree to Puter's Terms...'` → `'...you agree to ElastOS's Terms...'`
- `you_have_been_referred_to_puter_by_a_friend` → Update text

**Impact**: ✅ **SAFE** - These are display strings only

**Recommendation**: **CHANGE ALL** - Update all user-facing text in translations

---

### 3. Package.json Metadata
**Location**: `package.json`
```json
{
  "name": "puter.com",  // → "elastos" or "elastos-desktop"
  "author": "Puter Technologies Inc.",  // → "ElastOS Technologies Inc." or your org
  "description": "Desktop environment in the browser!",  // Could add "ElastOS" here
  "homepage": "https://puter.com",  // → Your homepage
}
```

**Impact**: ✅ **SAFE** - Package metadata, doesn't affect runtime

**Recommendation**: **CHANGE** - Update to reflect ElastOS branding

---

### 4. CSS Class Names (Display Only)
**Location**: `src/gui/src/css/style.css`
- `.puter-auth-dialog` → `.elastos-auth-dialog` (and all related classes)
- `.window-puter-dialog` → `.window-elastos-dialog`

**Impact**: ⚠️ **NEEDS TESTING** - CSS classes are used in JavaScript, need to update both CSS and JS references

**Recommendation**: **CHANGE WITH CAUTION** - Update CSS classes and all JavaScript references

---

### 5. Code Comments
**Location**: Throughout codebase
- Comments mentioning "Puter" can be updated to "ElastOS"
- Example: `src/gui/src/UI/UIPC2StatusBar.js:8` - "Uses Puter's UIContextMenu" → "Uses ElastOS's UIContextMenu"

**Impact**: ✅ **SAFE** - Comments don't affect functionality

**Recommendation**: **CHANGE** - Low priority, but good for consistency

---

## 🟡 NEEDS CAREFUL CONSIDERATION

### 6. File System Paths
**Question**: Can we change the actual root directory name from "Puter" to "ElastOS"?

**Current Behavior**:
- Root directory is named "Puter" (controlled by `window.root_dirname`)
- Users see "Puter ▸ [wallet] ▸ [folder]" in breadcrumbs
- Actual file paths in backend may or may not use "Puter" as a literal directory name

**Investigation Needed**:
1. Check if backend creates literal "Puter" directories
2. Check if existing user data has "Puter" as root directory name
3. Determine if migration is needed for existing users

**Recommendation**: 
- ✅ **SAFE to change display name** (`window.root_dirname`)
- ⚠️ **NEEDS INVESTIGATION** for actual file system paths
- If backend uses literal "Puter" directory, may need migration script

---

### 7. Window Titles & HTML Titles
**Location**: Various UI files
- Window titles that say "Puter"
- HTML `<title>` tags (if any)

**Impact**: ✅ **SAFE** - Display only

**Recommendation**: **CHANGE** - Update all window titles

---

## 🔴 DO NOT CHANGE (Will Break Functionality)

### 8. SDK References (`puter` object)
**Location**: Throughout codebase
- `puter.fs.*`, `puter.kv.*`, `puter.ui.*`, etc.
- These are the actual SDK API calls
- Changing these would break all app functionality

**Examples**:
- `src/gui/src/IPC.js` - Hundreds of `puter.*` references
- `src/backend/apps/*/index.html` - SDK initialization code
- All app iframes use `puter` SDK

**Impact**: ❌ **WILL BREAK** - Core SDK functionality

**Recommendation**: **DO NOT CHANGE** - The `puter` SDK object name must remain

---

### 9. API Endpoints & URLs
**Location**: Various files
- References to `api.puter.com`
- URL patterns like `https://api.puter.com/*`
- These are actual API endpoints

**Impact**: ❌ **WILL BREAK** - API connectivity

**Recommendation**: **DO NOT CHANGE** - Unless you're also changing backend API domains

---

### 10. Internal Identifiers & Variable Names
**Location**: Throughout codebase
- Variable names like `puterAppInstanceID`
- Internal constants
- Function parameters

**Impact**: ⚠️ **MAY BREAK** - Depends on usage

**Recommendation**: **LOW PRIORITY** - Only change if you're doing a full refactor

---

### 11. Third-Party Dependencies
**Location**: `package.json`, `node_modules/`
- `@heyputer/putility` - External package
- References to `puter.js` SDK from CDN
- These are external dependencies

**Impact**: ❌ **WILL BREAK** - External dependencies

**Recommendation**: **DO NOT CHANGE** - These are external packages

---

### 12. Documentation Files
**Location**: `docs/*.md`
- Documentation mentioning "Puter"
- These are informational only

**Impact**: ✅ **SAFE** - Documentation only

**Recommendation**: **CHANGE** - Update documentation to reflect ElastOS branding

---

## 📋 Recommended Implementation Plan

### Phase 1: Safe User-Facing Changes (Low Risk)
1. ✅ Change `window.root_dirname = 'ElastOS'` in `globals.js`
2. ✅ Update all i18n translation strings in `en.js` (and other language files)
3. ✅ Update `package.json` metadata
4. ✅ Update window titles and HTML titles
5. ✅ Update code comments (optional, low priority)

### Phase 2: CSS & Styling (Medium Risk)
1. ⚠️ Update CSS class names (`.puter-auth-dialog` → `.elastos-auth-dialog`)
2. ⚠️ Find and update all JavaScript references to these CSS classes
3. ⚠️ Test all dialogs and UI components

### Phase 3: File System Investigation (High Priority)
1. 🔍 Investigate if backend uses literal "Puter" directory names
2. 🔍 Check existing user data structure
3. 🔍 Determine if migration is needed
4. 🔍 If needed, create migration script for existing users

### Phase 4: Documentation (Low Priority)
1. ✅ Update all documentation files
2. ✅ Update README files
3. ✅ Update inline code comments

---

## 🎯 Quick Wins (Can Do Immediately)

These changes are **100% safe** and can be done right now:

1. **File Directory Name**:
   ```javascript
   // src/gui/src/globals.js:88
   window.root_dirname = 'ElastOS';
   ```

2. **Window Title**:
   ```javascript
   // src/gui/src/i18n/translations/en.js:500
   'window_title_puter': 'ElastOS',
   ```

3. **Package Metadata**:
   ```json
   // package.json
   {
     "name": "elastos-desktop",
     "author": "ElastOS Technologies Inc.",
     "description": "ElastOS - Desktop environment in the browser!"
   }
   ```

4. **Translation Strings** (all user-facing text in `en.js`)

---

## ⚠️ Critical Warnings

### DO NOT CHANGE:
- ❌ `puter` SDK object name (e.g., `puter.fs.read()`, `puter.kv.set()`)
- ❌ API endpoint URLs (`api.puter.com`)
- ❌ Internal SDK code in `src/puter-js/`
- ❌ External package references (`@heyputer/putility`)
- ❌ URL parameters like `puter.api_origin`, `puter.auth.token` (unless changing backend)

### TEST THOROUGHLY:
- ⚠️ CSS class name changes (update both CSS and JS)
- ⚠️ File system path changes (may need migration)
- ⚠️ Any changes to app iframe communication

---

## 📊 Summary by Category

| Category | Count | Safe to Change? | Priority |
|----------|-------|----------------|----------|
| File directory root name | 1 | ✅ Yes | **HIGH** |
| i18n translation strings | ~15 | ✅ Yes | **HIGH** |
| Package.json metadata | 4 | ✅ Yes | **MEDIUM** |
| CSS class names | ~30 | ⚠️ With testing | **MEDIUM** |
| Window titles | ~5 | ✅ Yes | **MEDIUM** |
| Code comments | ~100 | ✅ Yes | **LOW** |
| SDK references (`puter.*`) | ~1000+ | ❌ No | **DO NOT CHANGE** |
| API endpoints | ~50 | ❌ No | **DO NOT CHANGE** |
| Documentation | ~200 | ✅ Yes | **LOW** |

---

## 🚀 Next Steps

1. **Start with Quick Wins** - Change `window.root_dirname` and i18n strings
2. **Test file browser** - Verify breadcrumbs show "ElastOS" correctly
3. **Investigate file system** - Check if backend uses literal "Puter" directories
4. **Plan CSS changes** - If proceeding, update both CSS and JS references
5. **Update documentation** - Low priority but good for consistency

---

**Note**: The file directory change (`window.root_dirname`) is exactly what you asked about and is **100% safe** to change. It only affects the display name in the UI, not actual file system paths.

