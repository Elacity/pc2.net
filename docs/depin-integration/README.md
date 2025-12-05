# DePIN Integration Guide - Elastos Personal Cloud OS

## Overview

This document provides the integration interfaces for connecting Elastos Personal Cloud OS to the DePIN hardware box. The goal is to replace Puter's centralized cloud with user-owned IPFS storage on personal hardware.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Elastos Cloud OS (Frontend)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  UI/Desktop │  │   Apps      │  │  File Explorer      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Storage Abstraction Layer                 │  │
│  │   StorageProvider Interface (see interfaces below)     │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   DePIN Hardware Box                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │   IPFS     │  │  ERC20     │  │   Wallet Auth          │  │
│  │  Storage   │  │  Tokens    │  │   (DID/Smart Account)  │  │
│  │  :4001     │  │            │  │                        │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Current Status

### ✅ Completed (Frontend)
- Particle Network authentication (decentralized wallet login)
- Smart Account (ERC-4337) support
- Modern UI with Elastos branding
- Updated icon set

### 🔄 Your Team Implements (Backend)
- IPFS storage provider
- User folder initialization
- File read/write/delete operations
- Key-value storage for preferences

## Integration Interfaces

See the following files for detailed interface specifications:

1. [StorageProvider Interface](./StorageProvider.md) - File system operations
2. [AuthProvider Interface](./AuthProvider.md) - Authentication integration
3. [KVStore Interface](./KVStore.md) - Key-value storage for preferences
4. [API Endpoints](./APIEndpoints.md) - HTTP endpoints to implement

## Quick Start

### 1. Authentication Flow

The frontend uses Particle Network for wallet-based login. After successful authentication:

```javascript
// Frontend sends this data to your backend
{
  "address": "0x1234...",           // EOA wallet address
  "smartAccountAddress": "0x5678...", // ERC-4337 Smart Account
  "chainId": 20,                    // Elastos Smart Chain
  "particleUuid": "uuid-from-particle",
  "email": "user@email.com"         // Optional
}
```

Your backend should:
1. Verify the wallet signature
2. Create/lookup user by wallet address
3. Initialize IPFS folders for the user
4. Return a session token

### 2. Storage Operations

Replace `puter.fs.*` calls with your IPFS implementation:

| Puter Call | Your Implementation |
|------------|---------------------|
| `puter.fs.stat(path)` | Check if IPFS path exists, return metadata |
| `puter.fs.read(path)` | Fetch file content from IPFS |
| `puter.fs.write(path, content)` | Store content to IPFS |
| `puter.fs.mkdir(path)` | Create directory structure in IPFS |
| `puter.fs.readdir(path)` | List directory contents |
| `puter.fs.delete(path)` | Remove file/directory from IPFS |

### 3. User Folder Structure

When a user logs in, initialize these folders in IPFS:

```
/{wallet_address}/
├── Desktop/
├── Documents/
├── Pictures/
├── Videos/
├── Public/
├── AppData/
└── Trash/
```

## API Endpoints to Implement

Your backend needs to provide these endpoints:

```
POST /auth/wallet          - Authenticate with wallet signature
GET  /whoami               - Get current user info
GET  /stat?path=...        - Get file/folder metadata
GET  /read?path=...        - Read file content
POST /write                - Write file content
POST /mkdir                - Create directory
GET  /readdir?path=...     - List directory
POST /delete               - Delete file/folder
GET  /kv/get?key=...       - Get preference value
POST /kv/set               - Set preference value
```

## Configuration

Update `volatile/config/config.json` to point to your backend:

```json
{
  "api_origin": "http://your-hardware-box:8080",
  "storage_provider": "ipfs",
  "ipfs_gateway": "http://your-hardware-box:8080/ipfs"
}
```

## Contact

For integration questions, please coordinate through the team channels.

---

**Note:** The frontend is ready for integration. Your team implements the storage layer and we connect them together.
