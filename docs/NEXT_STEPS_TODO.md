# PC2 Next Steps & Priority To-Do List

**Last Updated:** January 27, 2025  
**Current Phase:** Phase 2.6 (WASM Integration) - 60% Complete  
**Branch:** `WASM`

---

## 🎯 Immediate Priorities (This Week)

### Priority 1: Complete Phase 2.6 - WASM Integration (Target: 80% Complete)

#### 1.1 Fix WASI File I/O ⚠️ **BLOCKING**
**Status:** In Progress  
**Priority:** HIGH  
**Estimated Time:** 2-3 days

**Problem:**
- MemFS is in-memory only, doesn't access real filesystem
- File Processor app can't read/write real files
- WASI modules need filesystem access for full functionality

**Solution:**
- Map MemFS to real filesystem paths
- Create bridge between WASI's MemFS and host filesystem
- Allow WASI modules to read/write files in user's data directory

**Files to Modify:**
- `pc2-node/test-fresh-install/src/services/wasm/WASMRuntime.ts`
- Create filesystem mapping utility

**Acceptance Criteria:**
- ✅ File Processor app can read files from user's directory
- ✅ WASI modules can write files to user's directory
- ✅ File operations are wallet-scoped (security)
- ✅ Proper error handling for file access

**Impact:**
- Unblocks File Processor app
- Enables full WASI functionality
- Critical for Phase 2.6 completion

---

#### 1.2 Create Environment Reader WASI App 🚧 **IN PROGRESS**
**Status:** Ready for Testing  
**Priority:** MEDIUM  
**Estimated Time:** 1 day

**Goal:**
- Simple WASI app that reads environment variables
- Demonstrates WASI functionality without file I/O complexity
- Validates WASI instantiation and execution

**Tasks:**
- [ ] Create frontend UI for env-reader app
- [ ] Register app in launcher
- [ ] Test environment variable reading
- [ ] Document usage

**Files to Create:**
- `pc2-node/test-fresh-install/frontend/apps/env-reader/index.html`
- Update `src/api/info.ts` to register app

**Acceptance Criteria:**
- ✅ App appears in launcher
- ✅ Can read and display environment variables
- ✅ WASI instantiation works correctly
- ✅ UI displays results properly

---

#### 1.3 Create More WASM Demo Apps 📋 **PLANNED**
**Status:** Planned  
**Priority:** MEDIUM  
**Estimated Time:** 2-3 days

**Goal:**
- Showcase WASM capabilities with diverse apps
- Demonstrate different use cases
- Build library of example apps

**Suggested Apps:**
1. **Image Processor** (WASI)
   - Resize, crop, filter images
   - Demonstrates file I/O with binary data
   - Shows WASM performance for image processing

2. **Text Analyzer** (WASI)
   - Word count, character count, readability score
   - File I/O for text processing
   - Simple but useful

3. **JSON Formatter** (Non-WASI)
   - Format/validate JSON
   - Pure computation, no file I/O needed
   - Fast and simple

4. **Markdown Parser** (Non-WASI)
   - Convert markdown to HTML
   - Pure computation
   - Useful for documentation

**Tasks:**
- [ ] Choose 2-3 apps to build
- [ ] Write Rust source code
- [ ] Compile to WASM
- [ ] Create frontend UIs
- [ ] Register in app launcher
- [ ] Test and document

**Acceptance Criteria:**
- ✅ At least 2 new WASM apps functional
- ✅ Apps demonstrate different WASM capabilities
- ✅ All apps appear in launcher
- ✅ Documentation for each app

---

#### 1.4 WASM Development Documentation 📋 **PLANNED**
**Status:** Planned  
**Priority:** MEDIUM  
**Estimated Time:** 1-2 days

**Goal:**
- Create comprehensive guide for WASM app development
- Enable community to build custom WASM apps
- Document best practices and patterns

**Content to Include:**
1. **Getting Started Guide**
   - Setting up Rust/WASM toolchain
   - Creating first WASM app
   - Compiling and testing

2. **WASM vs WASI Guide**
   - When to use WASI vs non-WASI
   - WASI capabilities and limitations
   - Best practices for each

3. **PC2 Integration Guide**
   - How to register apps in launcher
   - Frontend integration patterns
   - API usage examples

4. **Example Apps**
   - Calculator (non-WASI) - complete example
   - File Processor (WASI) - file I/O example
   - Code snippets and templates

**Files to Create:**
- `docs/WASM_DEVELOPMENT_GUIDE.md`
- `docs/WASM_EXAMPLES.md`
- Update `data/wasm-apps/README.md`

**Acceptance Criteria:**
- ✅ Complete development guide
- ✅ Code examples and templates
- ✅ Clear instructions for beginners
- ✅ Advanced patterns for experienced developers

---

## 🔧 Technical Debt & Fixes

### Priority 2: Fix Known Issues

#### 2.1 Terminal/Phoenix App Issue ⚠️ **KNOWN BUG**
**Status:** Known Issue  
**Priority:** MEDIUM  
**Estimated Time:** 1-2 days

**Problem:**
- Terminal app launches but shows black/blank screen
- Phoenix app windows are blank/white
- Terminal doesn't accept input
- Phoenix may be exiting immediately

**Investigation Needed:**
- [ ] Verify phoenix receives correct `parent_instance_id` in URL params
- [ ] Check if `puter.parentInstanceID` is set correctly by SDK
- [ ] Debug IPC communication between terminal and phoenix
- [ ] Check iframe sandbox attributes

**Files to Check:**
- `src/gui/src/UI/UIWindow.js` (iframe sandbox)
- `pc2-node/test-fresh-install/src/static.ts` (SDK injection)
- Phoenix app HTML files

**Acceptance Criteria:**
- ✅ Terminal accepts input and displays output
- ✅ Phoenix app runs correctly inside terminal
- ✅ IPC communication works properly

---

## 📈 Phase 3: Backup & Restore Completion

### Priority 3: Complete Backup Automation (40% → 100%)

#### 3.1 Automated Backup Scheduling 📋 **PLANNED**
**Status:** Planned  
**Priority:** LOW (Phase 2.6 takes precedence)  
**Estimated Time:** 2-3 days

**Goal:**
- Automate backup creation on schedule
- Configurable backup frequency
- Background job system

**Tasks:**
- [ ] Design backup scheduler
- [ ] Implement cron-like job system
- [ ] Add UI for backup schedule configuration
- [ ] Test automated backups

**Acceptance Criteria:**
- ✅ Backups created automatically on schedule
- ✅ Users can configure backup frequency
- ✅ Backup jobs run in background
- ✅ Error handling and notifications

---

#### 3.2 Backup Verification Tools 📋 **PLANNED**
**Status:** Planned  
**Priority:** LOW  
**Estimated Time:** 1-2 days

**Goal:**
- Verify backup integrity
- Test restore process
- Validate backup completeness

**Tasks:**
- [ ] Create backup verification utility
- [ ] Add integrity checks
- [ ] Test restore validation
- [ ] Add UI for verification

**Acceptance Criteria:**
- ✅ Backups can be verified for integrity
- ✅ Restore process validated
- ✅ Users can verify backups before restore

---

## 🚀 Phase 6.5: Full WASMER Runtime (Future)

### Priority 4: Prepare for Phase 6.5

#### 4.1 Research & Planning 📋 **PLANNED**
**Status:** Future  
**Priority:** LOW (After Phase 2.6 complete)  
**Estimated Time:** 1 week

**Goal:**
- Research WASMER runtime options
- Design dDRM integration
- Plan binary format
- Design blockchain integration

**Tasks:**
- [ ] Evaluate Wasmer.io vs custom runtime
- [ ] Design WASMER binary format
- [ ] Plan dDRM system architecture
- [ ] Research blockchain integration (Access Tokens)
- [ ] Create Phase 6.5 implementation plan

**Acceptance Criteria:**
- ✅ Clear decision on runtime approach
- ✅ Binary format designed
- ✅ dDRM architecture planned
- ✅ Implementation roadmap created

---

## 📊 Priority Summary

### This Week (Jan 27 - Feb 3)
1. **Fix WASI File I/O** (Priority 1.1) - 2-3 days
2. **Environment Reader App** (Priority 1.2) - 1 day
3. **Start WASM Development Guide** (Priority 1.4) - 1 day

**Goal:** Reach 80% completion of Phase 2.6

### Next Week (Feb 3 - Feb 10)
1. **More WASM Demo Apps** (Priority 1.3) - 2-3 days
2. **Complete WASM Development Guide** (Priority 1.4) - 1 day
3. **Fix Terminal/Phoenix** (Priority 2.1) - 1-2 days (if time permits)

**Goal:** Complete Phase 2.6 (100%)

### Future (After Phase 2.6)
1. **Phase 3 Completion** (Backup automation)
2. **Phase 6.5 Planning** (WASMER runtime with dDRM)

---

## 🎯 Success Metrics

### Phase 2.6 Completion Criteria
- ✅ WASMRuntime service - **DONE**
- ✅ WASM API endpoints - **DONE**
- ✅ Calculator app - **DONE**
- ✅ App registration - **DONE**
- 🚧 WASI file I/O - **IN PROGRESS**
- 📋 More demo apps - **PLANNED**
- 📋 Development guide - **PLANNED**

**Target:** 80% by end of this week, 100% by end of next week

---

## 📝 Notes

### Current Blockers
- **WASI File I/O**: MemFS mapping is the main blocker for full WASI support
- **Terminal/Phoenix**: Known issue but not blocking WASM work

### Quick Wins Available
- Environment Reader app (simple, validates WASI)
- JSON Formatter app (non-WASI, quick to build)
- WASM Development Guide (documentation, high value)

### Long-Term Vision
- Phase 6.5: Full WASMER runtime with dDRM
- Binary marketplace
- AI agent economy
- Knowledge extraction system

---

**End of To-Do List**

