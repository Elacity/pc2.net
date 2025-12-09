# Pre-Production Testing Checklist

**Date**: 2025-01-09  
**Purpose**: What to test and verify before moving to production PC2 node testing

---

## ✅ FIXED: Terminal & Editor Launch Issue

**Problem**: Terminal and Editor icons in taskbar weren't launching.

**Solution**: 
- Updated `/get-launch-apps` endpoint to include `terminal` and `editor` with correct UUIDs
- Updated `/drivers/call` endpoint to handle `puter.apps.get()` requests
- Added proper app structure with `index_url`, `uuid`, `uid`, `name`, `title`

**Status**: ✅ **FIXED** - Terminal and Editor should now launch correctly.

---

## 🧪 LOCAL TESTING (Mock Server) - Complete These First

### 1. Core Functionality Testing

#### File Operations
- [ ] **Upload Files**: Single file, multiple files, drag & drop
- [ ] **Download Files**: Click to download, verify file integrity
- [ ] **Create Folders**: Right-click → New Folder, verify appears
- [ ] **Delete Files**: Delete to Trash, empty Trash, permanent delete
- [ ] **Move/Rename**: Drag & drop, rename via context menu
- [ ] **File Types**: Test images, videos, PDFs, text files, binary files

#### App Launching
- [ ] **Terminal**: Click terminal icon → Should open terminal window
- [ ] **Editor**: Click editor icon → Should open editor window
- [ ] **File Explorer**: Click folder icon → Should open explorer
- [ ] **Open Files**: Double-click file → Should open in correct app
  - [ ] Images → Viewer
  - [ ] Videos → Player
  - [ ] PDFs → PDF viewer
  - [ ] Text files → Editor

#### Real-time Updates
- [ ] **Multi-tab Sync**: Open 2 browser tabs → Upload in Tab A → Should appear in Tab B
- [ ] **Delete Sync**: Delete file → Should disappear in all tabs
- [ ] **Move Sync**: Move file → Should update in all tabs
- [ ] **No Refresh Needed**: All changes should appear without page refresh

#### Authentication
- [ ] **Login**: Connect wallet → Should authenticate
- [ ] **Session Persistence**: Refresh page → Should auto-reconnect (no re-sign)
- [ ] **Session Expiry**: Wait 7 days → Should require re-authentication
- [ ] **Multiple Wallets**: Connect different wallet → Should show different files

### 2. Edge Cases & Error Handling

- [ ] **Large Files**: Upload 100MB+ file → Should work
- [ ] **Many Files**: Upload 50+ files → Should all appear
- [ ] **Special Characters**: File names with `!@#$%^&*()` → Should work
- [ ] **Long Paths**: Create deeply nested folders → Should work
- [ ] **Duplicate Names**: Upload same file twice → Should add `(1)` suffix
- [ ] **Empty Folders**: Create empty folder → Should work
- [ ] **Network Interruption**: Disconnect network → Should handle gracefully
- [ ] **Server Restart**: Restart mock server → Files should persist (state file)

### 3. UI/UX Verification

- [ ] **Taskbar Icons**: All icons visible and clickable
- [ ] **Context Menus**: Right-click → Should show menu
- [ ] **Drag & Drop**: Drag file to folder → Should move
- [ ] **Keyboard Shortcuts**: Test common shortcuts (if any)
- [ ] **Loading States**: Show loading indicators during operations
- [ ] **Error Messages**: Clear, user-friendly error messages
- [ ] **PC2 Status**: Cloud icon shows correct status (connected/disconnected)

---

## 🐳 DOCKER SETUP (Before Production Testing)

### Prerequisites
- [ ] **Docker Installed**: `docker --version` should work
- [ ] **Docker Compose Installed**: `docker-compose --version` should work
- [ ] **Ports Available**: 4100 (Puter), 4200 (PC2 mock), 5001 (IPFS) not in use

### Docker Setup Steps

1. **Create Docker Compose File**
   ```yaml
   # docker-compose.pc2.yml
   version: '3.8'
   services:
     pc2-node:
       build: .
       ports:
         - "4200:4200"
       environment:
         - NODE_ENV=production
         - PC2_ENABLED=true
       volumes:
         - ./pc2-data:/var/pc2/data
         - ./pc2-config:/etc/pc2
   ```

2. **Create Dockerfile**
   - [ ] Dockerfile created for PC2 node
   - [ ] Base image: Node.js 20+
   - [ ] Dependencies installed
   - [ ] Entry point configured

3. **Environment Variables**
   - [ ] `.env` file created
   - [ ] Database path configured
   - [ ] IPFS node URL configured
   - [ ] Session secret configured

4. **Volume Mounts**
   - [ ] Data directory: `/var/pc2/data`
   - [ ] Config directory: `/etc/pc2`
   - [ ] Logs directory: `/var/pc2/logs`

---

## 🚀 PRODUCTION PC2 NODE - What Needs Implementation

### Critical (Must Have)

1. **IPFS Integration** ❌ **NOT IMPLEMENTED**
   - [ ] IPFS node connection
   - [ ] File upload to IPFS
   - [ ] File retrieval from IPFS
   - [ ] IPFS pinning/unpinning
   - [ ] IPFS CID generation
   - [ ] Metadata storage in SQLite

2. **Real Socket.io** ⚠️ **PARTIALLY IMPLEMENTED**
   - [ ] Replace HTTP polling with WebSocket
   - [ ] Real-time event delivery
   - [ ] Socket reconnection handling
   - [ ] Room-based event filtering

3. **Database (SQLite)** ❌ **NOT IMPLEMENTED**
   - [ ] Database schema creation
   - [ ] Session storage in database
   - [ ] File metadata storage
   - [ ] Wallet whitelist storage
   - [ ] Schema migrations

4. **File Encryption** ❌ **NOT IMPLEMENTED**
   - [ ] Wallet-derived encryption key
   - [ ] AES-256-GCM encryption
   - [ ] File encryption before IPFS
   - [ ] File decryption on retrieval

5. **Security Hardening** ❌ **NOT IMPLEMENTED**
   - [ ] Rate limiting (5 attempts/min)
   - [ ] HTTPS/TLS certificates
   - [ ] Input validation on all endpoints
   - [ ] CORS configuration
   - [ ] Security headers
   - [ ] Setup token hashing

### Important (Should Have)

6. **Process Management** ❌ **NOT IMPLEMENTED**
   - [ ] PM2 or systemd service
   - [ ] Auto-restart on crash
   - [ ] Health check endpoint
   - [ ] Graceful shutdown

7. **Monitoring & Logging** ❌ **NOT IMPLEMENTED**
   - [ ] Structured logging
   - [ ] Error tracking
   - [ ] Performance metrics
   - [ ] Audit logging

8. **Backup & Recovery** ❌ **NOT IMPLEMENTED**
   - [ ] Automated backups
   - [ ] Database backup script
   - [ ] IPFS backup strategy
   - [ ] Restore procedures

---

## 📋 TESTING SEQUENCE

### Phase 1: Mock Server Testing (Current)
1. ✅ Fix app launching (Terminal, Editor)
2. ✅ Test all file operations
3. ✅ Test real-time updates
4. ✅ Test authentication flow
5. ✅ Test edge cases
6. ✅ Verify UI/UX

### Phase 2: Docker Setup
1. Create Dockerfile
2. Create docker-compose.yml
3. Test Docker build
4. Test Docker run
5. Verify ports and volumes

### Phase 3: Production Implementation
1. Implement IPFS integration
2. Implement real socket.io
3. Implement SQLite database
4. Implement file encryption
5. Implement security hardening

### Phase 4: Production Testing
1. Test with real IPFS node
2. Test with real WebSocket
3. Test database persistence
4. Test file encryption
5. Test security features
6. Load testing (10+ users)

---

## 🎯 IMMEDIATE NEXT STEPS

### Before Moving to Production Testing:

1. **Complete Mock Server Testing** (Do this now)
   - [ ] Test Terminal launch
   - [ ] Test Editor launch
   - [ ] Test all file operations
   - [ ] Test real-time updates
   - [ ] Test authentication

2. **Docker Preparation** (Do this next)
   - [ ] Create Dockerfile
   - [ ] Create docker-compose.yml
   - [ ] Test Docker build locally

3. **Production Implementation** (Do this before production testing)
   - [ ] IPFS integration
   - [ ] Real socket.io
   - [ ] SQLite database
   - [ ] File encryption
   - [ ] Security hardening

---

## ⚠️ CRITICAL WARNINGS

1. **Mock Server ≠ Production**
   - Mock server is for UI/UX testing only
   - Production requires full IPFS integration
   - Production requires real socket.io
   - Production requires database

2. **Security First**
   - Never deploy without HTTPS
   - Never deploy without rate limiting
   - Never deploy without input validation
   - Always hash setup tokens

3. **Data Persistence**
   - Mock server uses JSON file (not production-ready)
   - Production must use SQLite database
   - Production must use IPFS for file storage
   - Always backup before deployment

---

## 📝 NOTES

- **Terminal & Editor**: Now fixed in mock server ✅
- **Docker**: You have Docker installed, ready for containerization
- **Production Gap**: Significant work needed for IPFS, database, encryption
- **Testing Priority**: Complete mock server testing first, then implement production features

---

**Last Updated**: 2025-01-09  
**Status**: Mock server ready for testing, production implementation pending

