# Restoring PC2 Node Backup to a New Node

**Date:** 2025-12-19  
**Purpose:** Guide for restoring a backup from one PC2 node to a new/another PC2 node

---

## 🎯 Use Case

You have:
- **Source Node:** PC2 node with data (Raspberry Pi, VPS, etc.)
- **Backup File:** Downloaded backup archive (`.tar.gz`)
- **Target Node:** New PC2 node (fresh installation or different hardware)

**Goal:** Restore all data from backup to the new node.

---

## 📋 Prerequisites

1. ✅ Backup file downloaded from source node
2. ✅ Target node installed and running
3. ✅ Access to target node (SSH or local terminal)

---

## 🔄 Restore Process

### Step 1: Transfer Backup to Target Node

**Option A: Direct Transfer (SSH/SCP)**
```bash
# From your laptop, transfer backup to new node
scp pc2-backup-20251219-120000.tar.gz user@new-node.com:/path/to/pc2-node/backups/
```

**Option B: Download on Target Node**
```bash
# SSH into target node
ssh user@new-node.com

# Download backup (if stored in cloud/external location)
# Or upload via SFTP/FTP client
```

**Option C: USB/External Drive**
```bash
# Copy backup to USB drive from source
# Plug USB into target node
# Copy from USB to target node backups directory
```

### Step 2: Stop Target Node Server

```bash
# SSH into target node
ssh user@new-node.com

# Navigate to PC2 node directory
cd /path/to/pc2-node

# Stop the server
lsof -ti:4200 | xargs kill -9 2>/dev/null || true
# Or if using systemd:
sudo systemctl stop pc2-node
```

### Step 3: Restore Backup

```bash
# On target node
cd /path/to/pc2-node

# Run restore command
npm run restore pc2-backup-20251219-120000.tar.gz
```

**What happens:**
1. ✅ Validates backup file
2. ✅ Backs up current data to `.old-backup/` (if any exists)
3. ✅ Extracts backup archive
4. ✅ Restores database (`data/pc2.db`)
5. ✅ Restores IPFS repository (`data/ipfs/`)
6. ✅ Restores user configuration (`config/config.json`)

### Step 4: Start Target Node

```bash
# Start server
npm start

# Or if using systemd:
sudo systemctl start pc2-node
```

### Step 5: Verify Restore

1. **Access target node:** http://new-node.com:4200
2. **Log in** with your wallet address
3. **Verify data:**
   - Files appear in Desktop/Documents
   - Storage stats match original
   - User accounts restored

---

## ⚠️ Important Notes

### Database Migrations

**Good News:** The restore process preserves database migrations.

**How it works:**
- Target node runs migrations automatically on startup
- If backup has older schema, migrations upgrade it
- If backup has newer schema, migrations handle it gracefully
- **Result:** Data is compatible across versions

**Example:**
```
Source Node: v1.0.0 (schema version 4)
Target Node: v1.1.0 (schema version 5)

Restore Process:
1. Restore backup (schema version 4)
2. Start server
3. Migration runs: 4 → 5 (automatic)
4. Data upgraded, all working ✅
```

### User Accounts

**All user accounts are restored:**
- ✅ Wallet addresses
- ✅ Session tokens (will expire, users re-authenticate)
- ✅ File ownership
- ✅ Access permissions

**Users can log in immediately** after restore with their wallet.

### IPFS Repository

**IPFS content is restored:**
- ✅ All file content (by CID)
- ✅ File metadata links wallet → CID
- ✅ Content-addressed storage ensures integrity

**Note:** If target node is on different network, IPFS will need to sync/replicate content (this happens automatically).

---

## 🔐 Security Considerations

### Wallet Authentication

**After restore:**
- Users must re-authenticate (sessions expire)
- Wallet-based auth ensures only owners can access their data
- No password changes needed (wallet is the identity)

### Data Isolation

**Multi-user nodes:**
- All users' data is restored
- Each user can only access their own data (wallet-based isolation)
- No cross-user data leakage

---

## 🚀 Phase 3 Improvements (Future)

### Current State: ✅ **FUNCTIONAL**

**What works now:**
- ✅ Manual restore via terminal: `npm run restore <backup-file>`
- ✅ Backup download via UI
- ✅ Backup creation via UI (just added)

**What could be improved in Phase 3:**

1. **UI Restore Feature** (Medium Priority)
   - Upload backup file through browser
   - Restore via UI button
   - Progress indicator
   - **Status:** Not implemented (terminal only)

2. **Automated Migration Testing** (Low Priority)
   - Test restore across different schema versions
   - Validate migration compatibility
   - **Status:** Manual testing required

3. **Backup Verification** (Low Priority)
   - Verify backup integrity before restore
   - Check backup compatibility with target node version
   - **Status:** Basic validation only

4. **Network Restore** (Low Priority)
   - Restore directly from source node to target node
   - No manual file transfer needed
   - **Status:** Manual transfer required

---

## 📝 Example: Complete Restore Workflow

### Scenario: Moving from Raspberry Pi to VPS

**Step 1: Create Backup on Raspberry Pi**
```bash
# On Raspberry Pi
cd ~/pc2-node
npm run backup
# Creates: backups/pc2-backup-20251219-120000.tar.gz
```

**Step 2: Download Backup to Laptop**
```bash
# From laptop browser, go to: http://raspberry-pi.local:4200
# Settings → Personal Cloud → Backup & Restore
# Click "Download" on latest backup
# Save to: ~/Downloads/pc2-backup-20251219-120000.tar.gz
```

**Step 3: Transfer to VPS**
```bash
# From laptop
scp ~/Downloads/pc2-backup-20251219-120000.tar.gz user@vps.example.com:/home/user/pc2-node/backups/
```

**Step 4: Restore on VPS**
```bash
# SSH into VPS
ssh user@vps.example.com

# Stop server
cd ~/pc2-node
lsof -ti:4200 | xargs kill -9 2>/dev/null || true

# Restore
npm run restore pc2-backup-20251219-120000.tar.gz

# Start server
npm start
```

**Step 5: Verify**
- Access: http://vps.example.com:4200
- Log in with wallet
- All files and data restored ✅

---

## ✅ Summary

**Current Capabilities:**
- ✅ Create backups (UI + terminal)
- ✅ Download backups (UI)
- ✅ Restore backups (terminal)
- ✅ Works across different nodes/hardware
- ✅ Database migrations handled automatically

**Phase 3 Enhancements (Optional):**
- UI restore feature (upload + restore via browser)
- Network restore (direct node-to-node)
- Backup verification tools

**Bottom Line:** Restore works now via terminal. Phase 3 could add UI convenience features, but core functionality is complete.

---

**Related Documentation:**
- Backup Strategy: `/docs/PC2_NODE_BACKUP_STRATEGY.md`
- Upgrade Guide: `/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md`
