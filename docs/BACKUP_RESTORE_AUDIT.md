# Backup & Restore Process Audit

## Current State Analysis

### What's in a Backup?
A PC2 backup contains:
- **Database** (`data/pc2.db`): **ALL user accounts** (all wallet addresses that have connected), settings, KV store (desktop backgrounds, profile pictures, etc.), file metadata
- **IPFS Repository** (`data/ipfs/`): **ALL user files** (documents, videos, images, etc.) for all accounts
- **Configuration** (`config/config.json`): Server settings, owner wallet, tethered wallets

**Total Size**: Typically 100MB - several GB depending on user data

**Important**: The backup is a **complete snapshot** of the entire PC2 node, including:
- ✅ All user accounts (all wallet addresses)
- ✅ All files for all users
- ✅ All settings and preferences
- ✅ Server configuration

**Security**: Each wallet can only access their own files after restore. The admin wallet (owner) does NOT have automatic access to other users' files - access is controlled by wallet_address filtering in the database.

### Current Restore Process (Technical)

**Scenario**: User's server dies, they have a backup file on their computer, they get a new VPS/Raspberry Pi

**Current Steps** (Requires Technical Knowledge):
1. Install PC2 Node on new server (Node.js, dependencies, git clone, npm install)
2. Connect to new server via SSH
3. Upload backup file to server (SCP, SFTP, or file manager)
4. Navigate to PC2 installation directory
5. Stop PC2 server if running
6. Run restore command: `npm run restore <backup-file.tar.gz>`
7. Start PC2 server: `npm start`
8. Connect with same admin wallet address
9. Verify data is restored

**Problems**:
- ❌ Requires SSH access
- ❌ Requires terminal/command line knowledge
- ❌ Requires understanding of server setup
- ❌ Multiple manual steps
- ❌ Not accessible to non-technical users

---

## Ideal User Experience (Non-Technical)

### Vision: "Virtual Computer" Model

**User's Mental Model**: 
> "I have a backup file. I should be able to upload it and just log in - like restoring a virtual computer."

### Proposed Solutions

#### Option 1: One-Click Web UI Restore (Recommended - Phase 2.5 Enhancement)

**How it works**:
1. User installs fresh PC2 node on new server (one-time setup, could be automated)
2. User opens PC2 web interface
3. User goes to Settings → PC2 → Backup & Restore
4. User clicks "Restore from Backup"
5. User uploads backup file (drag & drop or file picker)
6. System automatically:
   - Validates backup file
   - Stops server
   - Extracts and restores data
   - Restarts server
   - Shows success message
7. User logs in with same wallet address
8. All data is restored

**Implementation**:
- Add "Restore from Backup" button in UI
- Add file upload endpoint: `POST /api/backups/restore`
- Backend handles all restore logic (stop server, extract, restore, restart)
- Show progress indicator during restore
- Handle errors gracefully

**Pros**:
- ✅ No SSH required
- ✅ No terminal commands
- ✅ Simple drag-and-drop interface
- ✅ Works for non-technical users
- ✅ Can add progress indicators and error messages

**Cons**:
- ⚠️ Requires server to be running (chicken-and-egg for first-time setup)
- ⚠️ Need to handle server restart gracefully

**Technical Requirements**:
- File upload endpoint with multipart/form-data
- Server process management (stop/start)
- Background job processing
- Progress tracking via WebSocket or polling

---

#### Option 2: Full Node Backup (Future - Phase 3)

**How it works**:
1. Backup includes entire PC2 node installation (code + data)
2. User downloads single backup file
3. On new server, user extracts backup file
4. User runs `npm install` (or bundled installer)
5. User runs `npm start`
6. User logs in with same wallet
7. Everything works immediately

**Implementation**:
- Extend backup script to include:
  - `package.json` and `package-lock.json`
  - `node_modules/` (or instructions to install)
  - All source code
  - Data (db, IPFS, config)
- Create self-extracting installer script
- Include restore instructions in backup

**Pros**:
- ✅ Complete portability
- ✅ No need to reinstall PC2 node separately
- ✅ Works even if PC2 codebase changes

**Cons**:
- ⚠️ Much larger backup files (could be 500MB+)
- ⚠️ Still requires some technical knowledge (extract, npm install)
- ⚠️ More complex to maintain

---

#### Option 3: Cloud-Based Restore (Future - Phase 4)

**How it works**:
1. Backups automatically uploaded to IPFS or cloud storage
2. User logs into new PC2 node
3. User sees list of their backups in cloud
4. User clicks "Restore" on desired backup
5. System downloads and restores automatically

**Implementation**:
- Store backups in IPFS (decentralized) or S3/cloud storage
- Encrypt backups with user's wallet key
- List backups via API
- One-click restore from cloud

**Pros**:
- ✅ No manual file management
- ✅ Automatic off-site backup
- ✅ Can restore from anywhere
- ✅ Most user-friendly

**Cons**:
- ⚠️ Requires IPFS/cloud infrastructure
- ⚠️ Storage costs
- ⚠️ Privacy/security considerations
- ⚠️ More complex implementation

---

## Recommended Implementation Plan

### Phase 1: Current State (Done)
- ✅ Manual restore via terminal command
- ✅ Help documentation

### Phase 2: Immediate Improvements (Next - Phase 2.5)
**Goal**: Make restore accessible to semi-technical users

1. **Improve Help Documentation** (In Progress)
   - Clear step-by-step instructions
   - Screenshots/video tutorial
   - Troubleshooting guide

2. **One-Click Web UI Restore** (High Priority)
   - Add "Restore from Backup" button
   - File upload interface
   - Backend restore endpoint
   - Progress indicators
   - Error handling

**Timeline**: 1-2 weeks

### Phase 3: Full Node Backup (Future)
- Include entire installation in backup
- Self-extracting installer
- Complete portability

**Timeline**: 4-6 weeks

### Phase 4: Cloud Restore (Future)
- IPFS/cloud storage integration
- Automatic backup upload
- One-click cloud restore

**Timeline**: 8-12 weeks

---

## Exact Step-by-Step Process (Current)

### For Technical Users (Current)

**Prerequisites**:
- New server (VPS, Raspberry Pi, etc.)
- SSH access to server
- Backup file downloaded to local computer
- Same admin wallet address that created backup

**Steps**:

1. **Install PC2 Node on New Server**
   ```bash
   # SSH into new server
   ssh user@new-server-ip
   
   # Install Node.js (if not installed)
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Clone PC2 repository
   git clone <pc2-repo-url>
   cd pc2-node/test-fresh-install
   
   # Install dependencies
   npm install
   ```

2. **Upload Backup File to Server**
   ```bash
   # From local computer, upload backup file
   scp /path/to/pc2-backup-20251219-120000.tar.gz user@new-server-ip:/path/to/pc2-node/test-fresh-install/backups/
   ```

3. **Stop PC2 Server (if running)**
   ```bash
   # SSH into server
   ssh user@new-server-ip
   cd pc2-node/test-fresh-install
   
   # Stop server (if running)
   npm run stop  # or kill process manually
   ```

4. **Run Restore Command**
   ```bash
   # Navigate to PC2 directory
   cd pc2-node/test-fresh-install
   
   # Run restore
   npm run restore pc2-backup-20251219-120000.tar.gz
   
   # Wait for restore to complete (5-10 minutes depending on backup size)
   ```

5. **Start PC2 Server**
   ```bash
   npm start
   ```

6. **Verify Restore**
   - Open PC2 web interface
   - Connect with same admin wallet address
   - Verify files and settings are restored

---

## Exact Step-by-Step Process (Proposed - One-Click Restore)

### For Non-Technical Users (Future)

**Prerequisites**:
- New server with PC2 node installed (one-time setup, could be automated via installer script)
- Backup file on local computer
- Same admin wallet address that created backup

**Steps**:

1. **Initial Server Setup** (One-time, could be automated)
   - Install PC2 node using installer script
   - Or use pre-configured VPS image
   - Start PC2 server

2. **Restore via Web UI**
   - Open PC2 web interface in browser
   - Go to Settings → PC2 → Backup & Restore
   - Scroll to "Restore from Backup" section
   - Click upload area or drag backup file
   - Select backup file (.tar.gz)
   - Click "Start Restore"
   - Confirm restore (destructive operation warning)
   - Wait for upload and processing
   - See success message with restart instructions

3. **Restart Server** (Required - server stops during restore)
   - Connect to server via SSH (Terminal, PuTTY, or VPS console)
   - Navigate to PC2 directory: `cd pc2-node/test-fresh-install`
   - Start server: `npm start`
   - Wait for "Server listening on port..." message
   - Refresh browser and log in with admin wallet
   - **All accounts restored!** Other users can log in with their wallets

**Total Steps**: 3 (server setup + web UI restore + manual restart)

**Multi-Account Behavior**:
- ✅ **All accounts are restored** - backup contains entire database
- ✅ **All users can log in** - each wallet address can access their own files
- ✅ **Privacy maintained** - each wallet only sees their own files (wallet_address filtering)
- ⚠️ **Admin wallet** - does NOT have automatic access to other users' files

---

## Key Insights

### What Makes It Confusing Now?

1. **Multiple Tools Required**: SSH, terminal, file transfer, command line
2. **Technical Knowledge Needed**: Understanding of servers, file paths, commands
3. **No Visual Feedback**: Terminal output is intimidating
4. **Error Handling**: Errors are cryptic, no guidance

### What Would Make It Simple?

1. **Single Interface**: Everything in the web UI
2. **Visual Progress**: Progress bars, status messages
3. **Error Guidance**: Clear error messages with solutions
4. **Automation**: System handles server stop/start automatically
5. **Validation**: System validates backup before starting

### Admin Wallet Requirement

**Why**: The backup contains encrypted data tied to wallet addresses. The restore process needs to verify you own the wallet that created the backup.

**User Experience**: 
- User must connect with the same wallet address
- System should clearly explain this requirement
- System should validate wallet matches backup before restoring

---

## Recommendations

### Immediate (Phase 2.5)
1. ✅ Improve help documentation (in progress)
2. 🎯 **Implement One-Click Web UI Restore** (highest priority)
   - This solves 80% of the UX problem
   - Makes restore accessible to non-technical users
   - Can be built on existing restore script

### Short-term (Phase 3)
3. Create automated installer script for initial server setup
4. Add backup validation in UI before restore
5. Add progress tracking and better error messages

### Long-term (Phase 4)
6. Cloud-based backup storage
7. Full node backup option
8. Automated backup scheduling

---

## Technical Implementation Notes

### One-Click Restore Endpoint Design

```typescript
// POST /api/backups/restore
// Content-Type: multipart/form-data
// Body: { file: File }

// Response: { jobId: string, status: 'processing' }

// GET /api/backups/restore/status/:jobId
// Response: { 
//   status: 'validating' | 'stopping' | 'extracting' | 'restoring' | 'starting' | 'complete' | 'error',
//   progress: number, // 0-100
//   message: string,
//   error?: string
// }
```

### Server Process Management

- Use `child_process` to manage server lifecycle
- Gracefully stop server before restore
- Restart server after restore
- Handle errors and rollback if needed

### Security Considerations

- Validate backup file before processing
- Verify wallet address matches backup
- Sanitize file paths
- Rate limit restore operations
- Log all restore attempts

---

## Conclusion

**Current State**: Restore requires technical knowledge (SSH, terminal, commands)

**Ideal State**: One-click restore via web UI - user uploads file, clicks button, done.

**Next Step**: Implement One-Click Web UI Restore (Phase 2.5 enhancement)

This will make PC2 backups truly accessible to non-technical users, aligning with the "virtual computer" mental model where users just "log in" to their restored data.
