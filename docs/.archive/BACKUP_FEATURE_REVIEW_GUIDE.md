# Backup Feature Review Guide

**Date:** 2025-12-19  
**Server:** http://localhost:4202

---

## 🚀 Quick Access

**Server URL:** http://localhost:4202

---

## 📋 How to Review Backup Feature

### Option 1: Using Browser Developer Tools

1. **Open PC2 Node in browser:**
   - Navigate to: http://localhost:4202
   - Log in with your wallet

2. **Open Developer Console:**
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Go to "Console" tab

3. **Get your auth token:**
   ```javascript
   // In browser console, get your auth token
   const token = localStorage.getItem('auth_token');
   console.log('Auth token:', token);
   ```

4. **List available backups:**
   ```javascript
   // In browser console
   fetch('http://localhost:4202/api/backups', {
     headers: {
       'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
     }
   })
   .then(r => r.json())
   .then(data => console.log('Backups:', data));
   ```

5. **Download a backup:**
   ```javascript
   // Replace BACKUP_FILENAME with actual filename
   const filename = 'pc2-backup-20251219-185457.tar.gz';
   window.open(`http://localhost:4202/api/backups/download/${filename}?token=${localStorage.getItem('auth_token')}`);
   ```

---

### Option 2: Using Terminal/Command Line

1. **Get your auth token:**
   - Open browser console on http://localhost:4202
   - Run: `localStorage.getItem('auth_token')`
   - Copy the token

2. **List backups:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        http://localhost:4202/api/backups
   ```

3. **Download a backup:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        -o backup.tar.gz \
        http://localhost:4202/api/backups/download/pc2-backup-20251219-185457.tar.gz
   ```

---

### Option 3: Create a Test Backup First

1. **SSH/Terminal into server (or use local terminal):**
   ```bash
   cd /Users/mtk/Documents/Cursor/pc2.net/pc2-node/test-fresh-install
   npm run backup
   ```

2. **Then use Option 1 or 2 above to download it**

---

## 🔍 API Endpoints to Test

### 1. List Backups
```http
GET http://localhost:4202/api/backups
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "backups": [
    {
      "filename": "pc2-backup-20251219-185457.tar.gz",
      "size": 225678432,
      "created": "2025-12-19T18:54:57.000Z",
      "modified": "2025-12-19T18:54:57.000Z"
    }
  ]
}
```

### 2. Download Backup
```http
GET http://localhost:4202/api/backups/download/pc2-backup-20251219-185457.tar.gz
Authorization: Bearer YOUR_TOKEN
```

**Expected:** File download starts (tar.gz file)

### 3. Delete Backup
```http
DELETE http://localhost:4202/api/backups/pc2-backup-20251219-185457.tar.gz
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Backup deleted"
}
```

---

## 🧪 Testing Checklist

- [ ] Create a backup: `npm run backup`
- [ ] List backups via API: `GET /api/backups`
- [ ] Download backup via API: `GET /api/backups/download/:filename`
- [ ] Verify backup file downloads correctly
- [ ] Verify backup file is valid tar.gz
- [ ] Delete backup via API: `DELETE /api/backups/:filename`
- [ ] Verify backup is removed from list

---

## 📝 Quick Test Script

Save this as `test-backup-api.js` and run with Node.js:

```javascript
// test-backup-api.js
const AUTH_TOKEN = 'YOUR_TOKEN_HERE'; // Get from browser localStorage
const BASE_URL = 'http://localhost:4202';

async function testBackupAPI() {
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`
  };

  // 1. List backups
  console.log('📋 Listing backups...');
  const listRes = await fetch(`${BASE_URL}/api/backups`, { headers });
  const backups = await listRes.json();
  console.log('Backups:', backups);

  if (backups.backups && backups.backups.length > 0) {
    const latestBackup = backups.backups[0];
    console.log(`\n✅ Found backup: ${latestBackup.filename} (${latestBackup.size} bytes)`);
    
    // 2. Download backup
    console.log(`\n📥 Downloading ${latestBackup.filename}...`);
    const downloadRes = await fetch(`${BASE_URL}/api/backups/download/${latestBackup.filename}`, { headers });
    if (downloadRes.ok) {
      console.log('✅ Download successful!');
      console.log(`   Content-Type: ${downloadRes.headers.get('Content-Type')}`);
      console.log(`   Content-Length: ${downloadRes.headers.get('Content-Length')} bytes`);
    } else {
      console.error('❌ Download failed:', downloadRes.status, downloadRes.statusText);
    }
  } else {
    console.log('ℹ️  No backups found. Create one first with: npm run backup');
  }
}

testBackupAPI().catch(console.error);
```

**Run it:**
```bash
node test-backup-api.js
```

---

## 🎯 What to Verify

1. **Backup Creation:**
   - Run `npm run backup` on server
   - Backup file appears in `backups/` directory
   - Backup contains database, IPFS repo, and config

2. **API Listing:**
   - `GET /api/backups` returns list of backups
   - Response includes filename, size, created date

3. **API Download:**
   - `GET /api/backups/download/:filename` downloads file
   - File is valid tar.gz archive
   - File can be extracted and contains expected data

4. **API Delete:**
   - `DELETE /api/backups/:filename` removes backup
   - Backup no longer appears in list

5. **Security:**
   - All endpoints require authentication
   - Invalid tokens are rejected
   - Directory traversal attempts are blocked

---

## 🔗 Related Documentation

- **Backup Strategy:** `/docs/PC2_NODE_BACKUP_STRATEGY.md`
- **Upgrade Guide:** `/docs/PC2_NODE_UPGRADE_AND_MAINTENANCE_STRATEGY.md`
- **Security Audit:** `/docs/PC2_NODE_SECURITY_AND_PACKAGING_AUDIT.md`

---

**Server is running at:** http://localhost:4202  
**Ready to test!** 🚀
