# PC2 Storage Integration

## Overview

This document describes how IPFS storage is integrated with Puter's file explorer for the PC2 (Personal Cloud Compute) system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Puter File Explorer                      │
│                    (puter.fs.* API calls)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FilesystemService                         │
│              (routes file operations to provider)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MountpointService                         │
│              (manages mounted filesystem providers)          │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   DBFSProvider  │ │  MemoryFSProvider│ │  IPFSProvider   │
│   (database)    │ │   (in-memory)    │ │   (IPFS + DB)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                                                │
                              ┌─────────────────┴─────────────────┐
                              │                                    │
                              ▼                                    ▼
                    ┌─────────────────┐               ┌─────────────────┐
                    │  SQLite DB      │               │   IPFS Node     │
                    │  (metadata)     │               │   (file data)   │
                    │  - ipfs_files   │               │   - CID storage │
                    └─────────────────┘               └─────────────────┘
```

## Key Components

### 1. IPFSProvider (`extensions/ipfs-storage/providers/IPFSProvider.js`)

The IPFSProvider implements Puter's filesystem interface:

- **`stat()`** - Get file/directory metadata
- **`readdir()`** - List directory contents  
- **`read()`** - Read file content from IPFS
- **`write_new()`** - Create new file (upload to IPFS)
- **`write_overwrite()`** - Overwrite existing file
- **`mkdir()`** - Create directory
- **`quick_check()`** - Fast existence check

### 2. Per-User Isolation

Files are isolated by user identity:

```sql
-- Database schema with wallet_address for PC2 mode
CREATE TABLE ipfs_files (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,           -- Fallback for traditional Puter users
    wallet_address VARCHAR(42), -- PC2 decentralized identity (EOA)
    file_path TEXT,
    file_name VARCHAR(255),
    cid VARCHAR(255),          -- IPFS Content ID
    ...
);
```

When a user logs in with their wallet (EOA), all queries are filtered by `wallet_address`:

```javascript
// Example query with wallet isolation
const userWhere = { clause: 'wallet_address = ?', params: ['0x123...'] };
const files = await db.read(
    `SELECT * FROM ipfs_files WHERE file_path = ? AND ${userWhere.clause}`,
    [path, ...userWhere.params]
);
```

### 3. Automatic Encryption

Files are automatically encrypted using AES-256-GCM with wallet-derived keys:

- Files in `/Public/` are NOT encrypted
- All other files ARE encrypted
- Encryption key is derived from wallet address using scrypt

```javascript
// Key derivation
const key = crypto.scryptSync(walletAddress.toLowerCase(), 'elastos-salt', 32);

// Encryption format: [iv(16)][authTag(16)][encrypted data]
```

## Configuration

### Enable IPFS as Root Filesystem

Set environment variable:
```bash
export PUTER_CONFIG_PROFILE=pc2
```

Or use config file `volatile/config/pc2.json`:
```json
{
    "config_name": "PC2 - Personal Cloud Compute",
    "$imports": ["config.json"],
    "services": {
        "mountpoint": {
            "mountpoints": {
                "/": {
                    "mounter": "ipfs",
                    "options": {
                        "nodeUrl": "http://localhost:5001"
                    }
                }
            }
        }
    }
}
```

### IPFS Node Requirements

Ensure an IPFS node is running:
```bash
# Using Docker
docker run -d --name ipfs -p 5001:5001 -p 8080:8080 ipfs/kubo:latest

# Or using Kubo directly  
ipfs daemon
```

## User Flow

1. **User logs in with wallet** (MetaMask/Essentials)
2. **Puter receives wallet address** as identity
3. **IPFSProvider queries with wallet filter**
4. **Auto-creates home directory** if first login:
   - `/0x123.../Desktop`
   - `/0x123.../Documents`
   - `/0x123.../Pictures`
   - `/0x123.../Videos`
   - `/0x123.../Public`
5. **File explorer shows user's files** only
6. **Upload/download uses IPFS** with encryption

## Database Migrations

The following migrations enable this integration:

1. `0042_ipfs_storage.sql` - Base IPFS tables
2. `0043_ipfs_directories.sql` - Directory support  
3. `0044_ipfs_wallet_address.sql` - Wallet-based isolation

## Testing

To verify the integration:

1. Start with PC2 config profile
2. Login with wallet
3. Check file explorer shows empty home folders
4. Upload a file
5. Verify file appears in explorer
6. Check IPFS node for CID
7. Logout, login with different wallet
8. Verify previous user's files are NOT visible

## Deprecated

The `PC2StorageService` (`extensions/pc2-node/services/PC2StorageService.js`) is now **deprecated**. Its functionality has been merged into `IPFSProvider` which integrates directly with Puter's filesystem.

## Future Work

- [ ] File versioning (keep old CIDs)
- [ ] Shared folders between wallets
- [ ] Public link generation
- [ ] IPFS cluster support for redundancy
- [ ] Pinning service integration (Pinata, web3.storage)

