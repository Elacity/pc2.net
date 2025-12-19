# Phase 2.4 Priority 1: Advanced Search & Indexing - Implementation Strategy

**Date:** 2025-01-19  
**Status:** Strategic Planning  
**Mission:** Self-hosted, self-contained personal cloud solution that gives users complete control over their data, accessible from anywhere, with decentralized wallet-based identity.

---

## 🎯 Mission Reminder

**PC2 is a self-hosted, self-contained personal cloud solution:**
- ✅ **Self-Contained:** Frontend + Backend in one package (running on user's hardware)
- ✅ **Self-Hosted:** User controls hardware, data, and software (Raspberry Pi, VPS, Mac, etc.)
- ✅ **Decentralized Identity:** Wallet-based authentication (Particle Auth)
- ✅ **Global Access:** Unique URL accessible from anywhere
- ✅ **No External Dependencies:** No reliance on public Puter service
- ✅ **Complete Data Control:** All data stored locally in user's SQLite database and IPFS
- ✅ **Privacy-First:** All indexing and search happens locally, no data leaves the node

**Everything is local to the user's PC2 node - no external services, no cloud dependencies.**

---

## 📊 Current State Analysis

### ✅ What's Already Implemented

#### 1. **Basic Search UI (Frontend)**
- ✅ `UIWindowSearch.js` - Search window component exists
- ✅ Global search trigger (Cmd+K / Ctrl+K) - **Just implemented in Quick Win 3**
- ✅ Search input with debouncing (300ms)
- ✅ Search results display with file icons
- ✅ Click to open files from search results
- ✅ Context menu for search results

#### 2. **Backend Search Endpoint**
- ❌ **MISSING:** No `/search` endpoint in `src/api/index.ts`
- ❌ **MISSING:** Frontend calls `/search` but backend doesn't handle it
- ⚠️ **Current:** Search functionality is broken (404 error)

#### 3. **Database Structure**
- ✅ SQLite database with `files` table
- ✅ Basic indexes: `idx_files_wallet`, `idx_files_path`
- ❌ **MISSING:** No FTS5 (Full-Text Search) tables
- ❌ **MISSING:** No content indexing tables
- ❌ **MISSING:** No file content storage/extraction

#### 4. **File Metadata**
- ✅ File paths, sizes, MIME types stored
- ✅ IPFS CIDs stored (`ipfs_hash` column)
- ✅ Created/updated timestamps
- ❌ **MISSING:** No file content extraction
- ❌ **MISSING:** No text content indexing

#### 5. **Bulk Operations (Quick Win 4)**
- ✅ `multiselectable` flag exists in UI components
- ✅ `selectable_body` option in `UIWindow.js`
- ✅ Multiple file selection UI exists
- ⚠️ **PARTIAL:** Need to verify batch delete/move operations work with multiple selections
- **Status:** Likely already implemented, needs verification

#### 6. **Recent Files (Quick Win 5)**
- ❌ **MISSING:** No `last_accessed` column in `files` table
- ❌ **MISSING:** No tracking of file access times
- ❌ **MISSING:** No recent files UI component
- **Status:** Not implemented

---

## 🚀 Implementation Strategy: Advanced Search & Indexing

### Phase 1: Foundation (Backend Search Endpoint)

**Goal:** Get basic filename search working first

#### 1.1 Create Basic Search Endpoint
**File:** `pc2-node/test-fresh-install/src/api/search.ts`

```typescript
// Basic filename/path search using SQL LIKE
// Search by:
// - Filename (case-insensitive)
// - Path (partial matches)
// - MIME type
// - IPFS CID (if provided)
```

**Implementation:**
- Create `/search` POST endpoint
- Query `files` table with `LIKE` for filename matching
- Filter by `wallet_address` (user isolation)
- Return file metadata (path, name, type, size, CID, etc.)
- Support basic filters (file type, size range)

**Time:** 2-3 hours

---

### Phase 2: SQLite FTS5 Full-Text Search

**Goal:** Enable full-text search of file contents

#### 2.1 Create FTS5 Virtual Table
**File:** `pc2-node/test-fresh-install/src/storage/migrations.ts`

```sql
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  path,
  name,
  content,  -- Extracted text content
  mime_type,
  content='files',  -- Source table
  content_rowid='rowid'
);

-- Triggers to keep FTS5 in sync with files table
CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, path, name, content, mime_type)
  VALUES (new.rowid, new.path, new.name, '', new.mime_type);
END;

CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
  UPDATE files_fts SET
    path = new.path,
    name = new.name,
    mime_type = new.mime_type
  WHERE rowid = new.rowid;
END;
```

**Time:** 1-2 hours

#### 2.2 Add Content Column to Files Table
**Migration:** Add `content_text` column to store extracted text

```sql
ALTER TABLE files ADD COLUMN content_text TEXT;
```

**Time:** 30 minutes

---

### Phase 3: Content Extraction & Indexing

**Goal:** Extract and index text from files

#### 3.1 Text File Extraction
**File:** `pc2-node/test-fresh-install/src/storage/indexer.ts`

```typescript
// Extract text from:
// - Plain text files (.txt, .md, .log, etc.)
// - Code files (.js, .ts, .py, .java, etc.)
// - JSON, XML, CSV files
// - HTML files (strip tags)
```

**Implementation:**
- Read file from IPFS or local storage
- Extract text based on MIME type
- Store in `content_text` column
- Update FTS5 index

**Time:** 2-3 hours

#### 3.2 PDF Text Extraction
**Dependency:** `pdfjs-dist` (already in dependencies)

```typescript
// Use pdfjs-dist to extract text from PDFs
// Store extracted text in content_text column
// Index in FTS5
```

**Implementation:**
- Install/verify `pdfjs-dist` package
- Extract text from PDF files
- Handle multi-page PDFs
- Store extracted text

**Time:** 2-3 hours

#### 3.3 Background Indexing Worker
**File:** `pc2-node/test-fresh-install/src/storage/indexer.ts`

```typescript
// Background process that:
// 1. Scans files table for unindexed files
// 2. Extracts content from files
// 3. Updates content_text and FTS5 index
// 4. Handles errors gracefully
// 5. Resumes after server restart
```

**Features:**
- Priority queue (index recently accessed files first)
- Incremental indexing (only new/changed files)
- Progress tracking
- Error handling and retry logic
- Resume capability after restart

**Time:** 3-4 hours

---

### Phase 4: Enhanced Search Endpoint

**Goal:** Full-featured search with content search

#### 4.1 FTS5 Search Integration
**File:** `pc2-node/test-fresh-install/src/api/search.ts`

```typescript
// Enhanced search endpoint:
// - Filename search (LIKE)
// - Full-text content search (FTS5)
// - IPFS CID search
// - Metadata search (size, date, type)
// - Combined queries
// - Ranking and relevance
```

**Search Modes:**
1. **Filename Search:** `LIKE '%query%'` on `name` column
2. **Content Search:** `MATCH` query on FTS5 `content` column
3. **CID Search:** Exact match on `ipfs_hash` column
4. **Metadata Search:** Filter by size, date range, MIME type
5. **Combined:** Mix of above with AND/OR logic

**Time:** 3-4 hours

#### 4.2 Search Result Ranking
- Relevance scoring based on:
  - Match in filename (higher weight)
  - Match in content (lower weight)
  - Recency (recently accessed files)
  - File type preferences

**Time:** 1-2 hours

---

### Phase 5: Advanced Search UI

**Goal:** Enhanced search experience

#### 5.1 Search Filters
**File:** `src/gui/src/UI/UIWindowSearch.js`

```javascript
// Add filter UI:
// - File type dropdown (All, Images, Videos, Documents, etc.)
// - Size range slider
// - Date range picker
// - Search mode toggle (Filename vs Content)
```

**Time:** 2-3 hours

#### 5.2 Search Result Preview
- Show preview snippets for content matches
- Highlight matching text
- Show file metadata (size, date, type)
- Show IPFS CID if available

**Time:** 2-3 hours

#### 5.3 Search History & Saved Searches
- Store recent searches
- Save common searches
- Quick access to saved searches

**Time:** 1-2 hours

---

### Phase 6: IPFS CID Search (Unique Feature)

**Goal:** Leverage IPFS content-addressing

#### 6.1 CID-Based Search
```typescript
// Search by IPFS CID:
// - Exact CID match
// - Partial CID search (first/last characters)
// - Find files with same content (same CID)
// - Content-addressed file discovery
```

**Use Cases:**
- Find file by CID (content-addressed lookup)
- Find duplicate files (same CID = same content)
- Verify file integrity (CID matches content)

**Time:** 1-2 hours

---

## 📋 Implementation Checklist

### Backend (TypeScript/Node.js)

- [ ] **Phase 1:** Create basic `/search` endpoint (filename search)
- [ ] **Phase 2:** Add FTS5 virtual table and triggers
- [ ] **Phase 2:** Add `content_text` column to `files` table
- [ ] **Phase 3:** Implement text file content extraction
- [ ] **Phase 3:** Implement PDF text extraction (pdfjs-dist)
- [ ] **Phase 3:** Create background indexing worker
- [ ] **Phase 4:** Integrate FTS5 search into endpoint
- [ ] **Phase 4:** Add search result ranking
- [ ] **Phase 6:** Implement IPFS CID search

### Frontend (JavaScript)

- [ ] **Phase 5:** Add search filters UI
- [ ] **Phase 5:** Add search result preview with snippets
- [ ] **Phase 5:** Implement search history
- [ ] **Phase 5:** Implement saved searches
- [ ] **Phase 5:** Add search mode toggle (Filename vs Content)

### Database Migrations

- [ ] Create FTS5 virtual table
- [ ] Add FTS5 sync triggers
- [ ] Add `content_text` column
- [ ] Add indexes for search performance

---

## 🔒 Privacy & Security Considerations

### All Local Processing
- ✅ All indexing happens on user's PC2 node
- ✅ No data sent to external services
- ✅ No cloud dependencies
- ✅ Complete user control

### User Isolation
- ✅ All searches filtered by `wallet_address`
- ✅ Users can only search their own files
- ✅ No cross-user data leakage

### Performance
- ✅ SQLite FTS5 is optimized for local search
- ✅ Background indexing doesn't block user operations
- ✅ Incremental indexing (only new files)

---

## 📊 Estimated Timeline

**Total Time:** 2-3 days (16-24 hours)

### Day 1: Foundation & Basic Search
- Phase 1: Basic search endpoint (2-3 hours)
- Phase 2: FTS5 setup (1-2 hours)
- Phase 3: Text extraction (2-3 hours)
- **Total:** 5-8 hours

### Day 2: Content Indexing & Enhanced Search
- Phase 3: PDF extraction (2-3 hours)
- Phase 3: Background worker (3-4 hours)
- Phase 4: Enhanced search endpoint (3-4 hours)
- **Total:** 8-11 hours

### Day 3: UI Enhancements & Polish
- Phase 5: Search filters & previews (4-6 hours)
- Phase 6: IPFS CID search (1-2 hours)
- Testing & bug fixes (2-3 hours)
- **Total:** 7-11 hours

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ Search by filename (working)
- ✅ Search by file content (full-text)
- ✅ Search by IPFS CID
- ✅ Filter by file type, size, date
- ✅ Background indexing of new files
- ✅ Search result ranking and relevance

### Performance Requirements
- ✅ Search results in < 500ms for typical queries
- ✅ Indexing doesn't block file operations
- ✅ Handles 10,000+ files efficiently

### User Experience
- ✅ Intuitive search interface
- ✅ Clear search results with previews
- ✅ Fast, responsive search

---

## 🔄 Verification: Quick Win 4 & 5 Status

### Quick Win 4: Bulk Operations
**Status Check Needed:**
- Verify if multi-select UI fully works
- Test batch delete with multiple files
- Test batch move/copy with multiple files
- If missing, implement checkbox selection and batch operations

### Quick Win 5: Recent Files
**Status:** Not implemented
**Required:**
- Add `last_accessed` column to `files` table
- Track file access in `/read` endpoint
- Create recent files UI component
- Add to desktop or sidebar

---

## 🚀 Next Steps

1. **Verify Quick Win 4 & 5 status** (30 minutes)
2. **Start Phase 1:** Create basic search endpoint (2-3 hours)
3. **Test basic search** with existing UI
4. **Proceed with Phase 2-6** incrementally

---

**Remember:** Everything is local to the user's PC2 node. No external services, complete privacy, full user control. This is what makes PC2 special - a truly self-hosted, self-contained personal cloud solution.

