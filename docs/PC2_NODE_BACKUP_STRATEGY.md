# PC2 Node Backup Strategy for Remote Servers

**Date:** 2025-12-19  
**Purpose:** Guide for backing up PC2 Node data on Raspberry Pi, VPS, or remote servers

---

## ⚠️ Critical: Off-Server Backup Storage

**Problem:** If backups are stored on the same server as your PC2 Node, and the server fails, you lose both your data AND your backups.

**Solution:** Always download backups to a separate device (laptop, desktop, external drive, or another server).

---

## 🎯 Backup Strategy Options

### Option 1: Download to Local Device (Recommended)

**Best for:** Raspberry Pi, personal VPS, single-node deployments

**How it works:**
1. Create backup on server: `npm run backup`
2. Download backup to your laptop/desktop via API
3. Store backup on local device or external drive
4. If server fails, restore from local backup

**Steps:**

1. **Create backup on server:**
   ```bash
   # SSH into your server
   ssh user@your-server.com
   cd /path/to/pc2-node
   npm run backup
   ```

2. **Download backup to local device:**
   ```bash
   # From your laptop/desktop
   # Option A: Using curl
   curl -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
        -o pc2-backup-20251219-120000.tar.gz \
        http://your-server.com:4200/api/backups/download/pc2-backup-20251219-120000.tar.gz
   
   # Option B: Using browser
   # Visit: http://your-server.com:4200/api/backups/download/pc2-backup-20251219-120000.tar.gz
   # (Browser will download the file)
   ```

3. **Store backup safely:**
   - External hard drive
   - Cloud storage (Dropbox, Google Drive, etc.)
   - Another server
   - Local computer

---

### Option 2: Automated Cloud Upload

**Best for:** Production deployments, automated backups

**How it works:**
1. Create backup on server
2. Automatically upload to cloud storage (S3, Dropbox, etc.)
3. Schedule regular backups via cron

**Example: S3 Upload Script**

```bash
#!/bin/bash
# scripts/backup-and-upload.sh

# Create backup
npm run backup

# Get latest backup
LATEST_BACKUP=$(ls -t backups/*.tar.gz | head -1)

# Upload to S3
aws s3 cp "$LATEST_BACKUP" s3://your-backup-bucket/pc2-backups/

# Clean up old backups (keep last 7 days)
find backups/ -name "*.tar.gz" -mtime +7 -delete
```

**Cron Job:**
```bash
# Run daily at 2 AM
0 2 * * * /path/to/pc2-node/scripts/backup-and-upload.sh
```

---

### Option 3: Network Storage (NAS)

**Best for:** Home networks, multiple devices

**How it works:**
1. Create backup on server
2. Copy to NAS via SCP/rsync
3. NAS provides centralized backup storage

**Example: rsync to NAS**

```bash
#!/bin/bash
# scripts/backup-to-nas.sh

# Create backup
npm run backup

# Get latest backup
LATEST_BACKUP=$(ls -t backups/*.tar.gz | head -1)

# Copy to NAS
rsync -avz "$LATEST_BACKUP" user@nas.local:/backups/pc2-node/
```

---

### Option 4: Another Server (Remote Backup)

**Best for:** Production deployments, redundancy

**How it works:**
1. Create backup on primary server
2. Transfer to backup server via SCP/rsync
3. Backup server stores backups separately

**Example: SCP to Backup Server**

```bash
#!/bin/bash
# scripts/backup-to-remote.sh

# Create backup
npm run backup

# Get latest backup
LATEST_BACKUP=$(ls -t backups/*.tar.gz | head -1)

# Copy to backup server
scp "$LATEST_BACKUP" user@backup-server.com:/backups/pc2-node/
```

---

## 📋 API Endpoints for Backup Management

### List Backups
```http
GET /api/backups
Authorization: Bearer YOUR_AUTH_TOKEN
```

**Response:**
```json
{
  "backups": [
    {
      "filename": "pc2-backup-20251219-120000.tar.gz",
      "size": 225678432,
      "created": "2025-12-19T12:00:00.000Z",
      "modified": "2025-12-19T12:00:00.000Z"
    }
  ]
}
```

### Download Backup
```http
GET /api/backups/download/:filename
Authorization: Bearer YOUR_AUTH_TOKEN
```

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -o backup.tar.gz \
     http://your-server.com:4200/api/backups/download/pc2-backup-20251219-120000.tar.gz
```

### Delete Backup
```http
DELETE /api/backups/:filename
Authorization: Bearer YOUR_AUTH_TOKEN
```

---

## 🔄 Complete Backup Workflow

### For Raspberry Pi / Personal VPS:

**Step 1: Create Backup on Server**
```bash
ssh pi@raspberrypi.local
cd ~/pc2-node
npm run backup
```

**Step 2: List Available Backups**
```bash
# Get auth token from browser (localStorage.getItem('auth_token'))
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://raspberrypi.local:4200/api/backups
```

**Step 3: Download to Local Device**
```bash
# From your laptop
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -o ~/Downloads/pc2-backup.tar.gz \
     http://raspberrypi.local:4200/api/backups/download/pc2-backup-20251219-120000.tar.gz
```

**Step 4: Store Safely**
- Move to external drive
- Upload to cloud storage
- Keep multiple copies

---

## 🛡️ Best Practices

### 1. **3-2-1 Backup Rule**
- **3 copies** of your data
- **2 different media types** (server + external drive)
- **1 off-site backup** (cloud or another location)

### 2. **Regular Backups**
- **Daily:** For active users
- **Weekly:** For occasional users
- **Before updates:** Always backup before updating PC2 Node

### 3. **Test Restores**
- Periodically test restoring from backups
- Verify data integrity after restore
- Ensure backup process works correctly

### 4. **Backup Retention**
- Keep daily backups for 7 days
- Keep weekly backups for 4 weeks
- Keep monthly backups for 12 months

### 5. **Automation**
- Use cron jobs for scheduled backups
- Automate upload to cloud storage
- Set up alerts for backup failures

---

## 📊 Backup Size Considerations

**Typical Backup Sizes:**
- **Small deployment** (few users, <10GB files): 50-200MB
- **Medium deployment** (multiple users, 10-100GB files): 200MB-2GB
- **Large deployment** (many users, >100GB files): 2GB+

**Storage Requirements:**
- Plan for 2-3x your data size (multiple backups)
- External drive: 500GB-2TB recommended
- Cloud storage: 100GB-1TB recommended

---

## 🔐 Security Considerations

### Backup File Security:
- Backups contain all user data (encrypted at rest if using encryption)
- Store backups securely (encrypted external drives, secure cloud storage)
- Limit access to backup files
- Use strong authentication for API endpoints

### API Authentication:
- All backup endpoints require authentication
- Use HTTPS in production
- Rotate auth tokens regularly

---

## 🚨 Disaster Recovery

### If Server Fails:

**Scenario 1: Server Hardware Failure**
1. Set up new server (Raspberry Pi, VPS, etc.)
2. Install PC2 Node
3. Download backup from local device/cloud
4. Restore: `npm run restore pc2-backup-YYYYMMDD-HHMMSS.tar.gz`
5. Start server: `npm start`

**Scenario 2: Data Corruption**
1. Stop server
2. Restore from most recent backup
3. Verify data integrity
4. Start server

**Scenario 3: Accidental Deletion**
1. Stop server
2. Restore from backup before deletion
3. Start server

---

## 📝 Example: Complete Raspberry Pi Backup Setup

### 1. Create Backup Script with Upload
```bash
#!/bin/bash
# scripts/backup-and-sync.sh

cd /home/pi/pc2-node

# Create backup
npm run backup

# Get latest backup
LATEST_BACKUP=$(ls -t backups/*.tar.gz | head -1)
BACKUP_NAME=$(basename "$LATEST_BACKUP")

# Copy to external drive (mounted at /mnt/backup)
if [ -d /mnt/backup ]; then
  cp "$LATEST_BACKUP" "/mnt/backup/$BACKUP_NAME"
  echo "✅ Backup copied to external drive"
fi

# Upload to Dropbox (using rclone)
if command -v rclone &> /dev/null; then
  rclone copy "$LATEST_BACKUP" dropbox:pc2-backups/
  echo "✅ Backup uploaded to Dropbox"
fi

# Clean up old backups (keep last 7)
ls -t backups/*.tar.gz | tail -n +8 | xargs rm -f
echo "✅ Old backups cleaned up"
```

### 2. Schedule with Cron
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/pi/pc2-node/scripts/backup-and-sync.sh >> /var/log/pc2-backup.log 2>&1
```

### 3. Manual Download (When Needed)
```bash
# From your laptop, download latest backup
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -o ~/Downloads/pc2-backup.tar.gz \
     http://raspberrypi.local:4200/api/backups/download/pc2-backup-20251219-020000.tar.gz
```

---

## ✅ Summary

**Key Points:**
1. ✅ **Never store backups only on the same server** - always download to separate device
2. ✅ **Use API endpoints** to download backups remotely
3. ✅ **Automate backups** with cron jobs and cloud uploads
4. ✅ **Follow 3-2-1 rule** - multiple copies, different media, off-site
5. ✅ **Test restores** periodically to ensure backups work

**For Raspberry Pi / VPS Users:**
- Create backup: `npm run backup`
- Download via API: `GET /api/backups/download/:filename`
- Store on laptop/external drive/cloud
- Restore when needed: `npm run restore <backup-file>`

**This ensures your backups survive server failures!** 🛡️
