# PC2 Client Integration (Phase 3)

> Identity, connectivity, and username services for PC2 nodes

## Overview

Phase 3 adds Boson integration to the PC2 node software, enabling:
- **Node Identity**: Ed25519 keypair for cryptographic identity
- **DID**: Decentralized identifier (`did:boson:{nodeId}`)
- **Username Registration**: Human-friendly URLs (`username.ela.city`)
- **Super Node Connectivity**: Connection to relay infrastructure

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PC2 NODE                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  BosonService                        │   │
│  │                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐   │   │
│  │  │  Identity   │ │  Username   │ │ Connectivity │   │   │
│  │  │  Service    │ │  Service    │ │   Service    │   │   │
│  │  └─────────────┘ └─────────────┘ └──────────────┘   │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  PC2 Backend                         │   │
│  │                 (Express + IPFS)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Services

### IdentityService

Manages node identity using Ed25519 keypairs.

**Features:**
- Generates new keypair on first run
- Creates DID: `did:boson:{nodeId}`
- Provides 24-word mnemonic backup (shown once)
- Stores identity securely (mode 0600)

**Files:**
- `src/services/boson/IdentityService.ts`
- `data/identity.json` (runtime)

### UsernameService

Registers usernames with the Web Gateway.

**Features:**
- Validates username format (3-30 chars, alphanumeric)
- Registers with super node gateway
- Persists username locally
- Generates public URL

**Files:**
- `src/services/boson/UsernameService.ts`
- `data/username.json` (runtime)

### ConnectivityService

Manages connection to super nodes.

**Features:**
- Connects to super node gateway
- Heartbeat monitoring
- Auto-reconnection
- Registers endpoint for proxying

**Files:**
- `src/services/boson/ConnectivityService.ts`

## API Endpoints

### Status

```bash
GET /api/boson/status
```

Returns full Boson service status including identity, username, and connectivity.

**Response:**
```json
{
  "initialized": true,
  "identity": {
    "nodeId": "J1h7RHv5iHhT...",
    "did": "did:boson:J1h7RHv5iHhT...",
    "isNew": false
  },
  "username": {
    "registered": true,
    "username": "alice",
    "publicUrl": "https://alice.ela.city"
  },
  "connectivity": {
    "connected": true,
    "superNode": {
      "address": "69.164.241.210"
    },
    "publicEndpoint": "https://alice.ela.city"
  }
}
```

### Register Username

```bash
POST /api/boson/register
Content-Type: application/json

{
  "username": "alice"
}
```

**Response:**
```json
{
  "success": true,
  "username": "alice",
  "publicUrl": "https://alice.ela.city"
}
```

### Check Username Availability

```bash
GET /api/boson/check-available/alice
```

**Response:**
```json
{
  "available": true,
  "username": "alice"
}
```

### Get Identity

```bash
GET /api/boson/identity
```

**Response:**
```json
{
  "nodeId": "J1h7RHv5iHhT...",
  "did": "did:boson:J1h7RHv5iHhT...",
  "createdAt": "2026-01-21T12:00:00.000Z",
  "isNew": false
}
```

### Get Connectivity Status

```bash
GET /api/boson/connectivity
```

**Response:**
```json
{
  "connected": true,
  "superNode": {
    "id": "J1h7RHv5iHhT...",
    "address": "69.164.241.210",
    "port": 39001,
    "gatewayUrl": "https://ela.city"
  },
  "connectedAt": "2026-01-21T12:00:00.000Z",
  "lastHeartbeat": "2026-01-21T12:05:00.000Z",
  "publicEndpoint": "https://alice.ela.city",
  "natType": "direct"
}
```

### Force Reconnect

```bash
POST /api/boson/reconnect
```

**Response:**
```json
{
  "success": true,
  "status": { ... }
}
```

## Configuration

Add to `config/config.json`:

```json
{
  "boson": {
    "enabled": true,
    "gateway_url": "https://ela.city",
    "auto_connect": true
  }
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable Boson services |
| `gateway_url` | `https://ela.city` | Super node gateway URL |
| `auto_connect` | `true` | Auto-connect on startup |

## First Run Experience

On first launch, the node:

1. **Generates Identity**
   ```
   🆕 New node identity created
   🔑 Node identity: J1h7RHv5iHhT...
      DID: did:boson:J1h7RHv5iHhT...
   ```

2. **Shows Recovery Phrase**
   ```
   ╔════════════════════════════════════════════════════════════════╗
   ║  🔐 IMPORTANT: Save your recovery phrase securely!             ║
   ╠════════════════════════════════════════════════════════════════╣
   ║                                                                ║
   ║   1.abandon    2.ability   3.able      4.about                ║
   ║   5.above      6.absent    7.absorb    8.abstract             ║
   ║   ...                                                          ║
   ║                                                                ║
   ║  This phrase is only shown ONCE. Store it safely!              ║
   ╚════════════════════════════════════════════════════════════════╝
   ```

3. **Connects to Super Node**
   ```
   ✅ Connected to super node: 69.164.241.210
   💡 Register a username: POST /api/boson/register { "username": "yourname" }
   ```

4. **After Username Registration**
   ```
   🌐 Public URL: https://alice.ela.city
   ```

## File Structure

```
pc2-node/
├── src/
│   ├── services/
│   │   └── boson/
│   │       ├── index.ts              # Exports
│   │       ├── BosonService.ts       # Main orchestration
│   │       ├── IdentityService.ts    # Identity management
│   │       ├── UsernameService.ts    # Username registration
│   │       └── ConnectivityService.ts # Super node connection
│   ├── api/
│   │   └── boson.ts                  # API routes
│   └── index.ts                      # Integration point
├── config/
│   └── default.json                  # Default config with boson section
└── data/                             # Runtime data (created automatically)
    ├── identity.json                 # Node identity
    └── username.json                 # Username registration
```

## Security Considerations

1. **Private Key Storage**
   - Stored in `data/identity.json` with mode 0600
   - Never transmitted over network
   - Used only for signing

2. **Mnemonic Handling**
   - Shown only once on first run
   - Cleared from memory after display
   - Not stored in identity file

3. **Username Registration**
   - Uses HTTPS for gateway communication
   - Node ID verified on super node
   - Future: DID signature verification

## Future Enhancements

1. **Full Active Proxy Protocol**
   - TCP relay for NAT traversal
   - CryptoBox encryption
   - Port mapping

2. **DHT Integration**
   - Store identity in Boson DHT
   - Resolve other nodes via DHT
   - Peer discovery

3. **DID Document Publishing**
   - Publish DID document to blockchain
   - Include service endpoints
   - Verifiable credentials

4. **Wallet-Derived Identity**
   - Derive node ID from wallet
   - Seamless identity across devices
   - Recovery via wallet

---

*Phase 3 of PC2 Sovereign Node Infrastructure*
