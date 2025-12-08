# PC2 Personal Cloud Node Extension

**Status**: 🚧 In Development (Phase 1)

## Overview

The PC2 Node extension enables secure, decentralized personal cloud connectivity. Users can:

1. Run PC2 software on their hardware box or VPS
2. Tether their wallet identity to their PC2 node
3. Access their personal cloud from anywhere in the world
4. Be certain no one else can access their data

## Security Model

### The Problem
If someone discovers your PC2 node URL, can they tether their wallet and access your data?

### The Solution: Owner-First + Setup Token

**No.** Here's why:

1. **Setup Token**: When PC2 is first installed, it generates a one-time setup token that's only displayed on the server console
2. **Owner Claim**: The first wallet to tether must provide this token
3. **Token Invalidation**: After the owner claims, the token is permanently invalidated
4. **Whitelist**: Only wallets explicitly invited by the owner can connect

```
INSTALL PC2
    │
    ├─► Console shows: PC2-SETUP-xxxxx (SAVE THIS!)
    │
    ▼
CLAIM OWNERSHIP (browser)
    │
    ├─► Enter PC2 URL + Setup Token
    ├─► Sign with wallet
    │
    ▼
SETUP TOKEN INVALIDATED
    │
    ├─► No one else can claim
    ├─► Only you can invite others
    └─► Your data is secure
```

## Security Layers

| Layer | What It Protects Against |
|-------|-------------------------|
| Setup Token | Unauthorized first-tether |
| Owner Wallet | Only owner controls node |
| Wallet Signature | Impersonation attacks |
| Tethered Whitelist | Unauthorized access |
| TLS/HTTPS | Man-in-the-middle |
| IPFS Encryption | Data theft at rest |
| Rate Limiting | Brute-force attacks |
| Audit Logging | Security monitoring |

## Directory Structure

```
extensions/pc2-node/
├── main.js                     # Extension entry point
├── package.json                # Dependencies
├── README.md                   # This file
├── services/
│   └── PC2GatewayService.js    # WebSocket gateway + auth
├── routes/
│   └── pc2.js                  # HTTP endpoints
└── database/
    └── 0001_pc2_tables.sql     # Database schema
```

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pc2/status` | Node status (no auth) |
| POST | `/pc2/claim-ownership` | Claim ownership (setup token) |

### Authenticated Endpoints (requires session)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pc2/invite` | Invite wallet (owner only) |
| POST | `/pc2/revoke` | Revoke wallet (owner only) |
| GET | `/pc2/wallets` | List wallets (owner only) |
| GET | `/pc2/audit` | Audit log (owner only) |

### WebSocket Tunnel

| Path | Description |
|------|-------------|
| `/pc2/tunnel` | Secure WebSocket for API proxying |

## Usage

### Step 1: Install PC2

```bash
# Using Docker
docker-compose up -d

# Or directly
npm install
npm start
```

On first run, the console will display:

```
══════════════════════════════════════════════════════════════════════
║                                                                    ║
║  🔐 PC2 SETUP TOKEN - SAVE THIS! SHOWN ONLY ONCE!                  ║
║                                                                    ║
══════════════════════════════════════════════════════════════════════
║                                                                    ║
║  PC2-SETUP-a1b2c3d4e5f6g7h8i9j0...                                 ║
║                                                                    ║
══════════════════════════════════════════════════════════════════════
```

**SAVE THIS TOKEN!** It's only shown once.

### Step 2: Claim Ownership (Browser)

1. Open ElastOS in your browser
2. Connect your wallet (MetaMask/Essentials)
3. Enter your PC2 node URL
4. Enter the setup token
5. Sign the message
6. You're now the owner!

### Step 3: Connect From Anywhere

After ownership is claimed:
1. Login with your wallet
2. ElastOS automatically connects to your PC2
3. Full access to your personal cloud

### Step 4: Invite Others (Optional)

As the owner, you can invite trusted wallets:
1. Go to PC2 Settings
2. Add wallet address
3. Set permissions
4. Sign to confirm

## Database Tables

| Table | Purpose |
|-------|---------|
| `pc2_config` | Node configuration & ownership |
| `pc2_tethered_wallets` | Authorized wallet whitelist |
| `pc2_sessions` | Active connections |
| `pc2_audit_log` | Security audit trail |
| `pc2_failed_auth` | Failed attempts (rate limiting) |

## Configuration

Add to your config:

```json
{
  "extensions": {
    "@elastos/pc2-node": {
      "node_name": "My Personal Cloud",
      "ws_port": 4200,
      "max_tethered_wallets": 10
    }
  }
}
```

## Attack Scenarios

| Attack | Result |
|--------|--------|
| Attacker knows PC2 URL | ❌ Blocked - No setup token |
| Brute-force setup token | ❌ Blocked - 256-bit random, rate limited |
| Replay old messages | ❌ Blocked - 5-minute timestamp window |
| MITM connection | ❌ Blocked - TLS + wallet signatures |
| Access after owner claims | ❌ Blocked - Token invalidated |
| Read encrypted files | ❌ Blocked - Need wallet signature to decrypt |

## Development

```bash
# Run in development
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Next Steps (Phase 1 Roadmap)

- [x] Security architecture design
- [x] Database schema
- [x] Gateway service skeleton
- [x] Routes skeleton
- [ ] Complete WebSocket implementation
- [ ] Frontend connection manager
- [ ] First-time setup UI
- [ ] Complete IPFS integration
- [ ] Docker packaging
- [ ] Testing & security audit

## License

AGPL-3.0 - See LICENSE file


