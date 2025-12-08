# PC2 Phase 1: Security Architecture

## Overview

This document describes the secure architecture for PC2 personal cloud connectivity, ensuring that only authorized wallet owners can access their personal cloud nodes.

## Security Threat Model

### Threats Addressed

1. **Unauthorized Tethering**: Someone discovering your PC2 URL and trying to claim it
2. **Man-in-the-Middle**: Intercepting connections between browser and PC2
3. **Replay Attacks**: Reusing old authentication messages
4. **Data Theft**: Accessing files without authorization
5. **Impersonation**: Pretending to be the owner

### Security Layers

| Layer | Protection | Implementation |
|-------|------------|----------------|
| Setup Token | Prevents unauthorized first-tether | 256-bit random token, one-time use |
| Owner Wallet | Only owner controls node | First wallet with valid token = owner |
| Wallet Signature | Proves wallet ownership | EIP-191 message signing |
| Tethered Whitelist | Explicit access control | Owner-managed wallet list |
| TLS/HTTPS | Encryption in transit | Industry-standard TLS 1.3 |
| IPFS Encryption | Encryption at rest | AES-256-GCM with wallet-derived key |

## Secure Setup Flow

### Step 1: PC2 Installation

When PC2 software is first installed, it:

1. Generates a cryptographically secure setup token
2. Stores a hash of this token in the database
3. Displays the token ONCE on the console
4. Sets node status to "AWAITING_OWNER"

```javascript
// Generated at first install
const setupToken = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');

console.log('='.repeat(60));
console.log('PC2 SETUP TOKEN (SAVE THIS - SHOWN ONLY ONCE)');
console.log('='.repeat(60));
console.log(`PC2-SETUP-${setupToken}`);
console.log('='.repeat(60));
console.log('Use this token to claim ownership via the browser.');
console.log('');
```

### Step 2: Owner Claims Node

From the browser, the user:

1. Enters their PC2 node URL
2. Enters the setup token
3. Signs a message with their wallet
4. Becomes the owner

```javascript
// Owner claim request
POST /api/pc2/claim-ownership
{
    "walletAddress": "0x1234...",
    "setupToken": "PC2-SETUP-xxxx...",
    "signature": "0xabc...",
    "message": {
        "action": "claim-ownership",
        "nodeUrl": "https://my-pc2.example.com",
        "timestamp": 1702000000000
    }
}
```

The server:
1. Verifies the setup token hash matches
2. Verifies the wallet signature
3. Sets the wallet as owner
4. **INVALIDATES the setup token** (can never be used again)
5. Sets node status to "OWNED"

### Step 3: Subsequent Connections

After ownership is established:

1. User connects with their wallet
2. Server checks if wallet is in tethered whitelist
3. User signs a timestamped message
4. Server verifies signature
5. WebSocket tunnel established

```javascript
// Connection request
GET /pc2/tunnel?wallet=0x1234...&signature=0xabc...&message={...}

// Server verification
1. Is wallet in pc2_tethered_wallets? → YES: proceed, NO: reject
2. Is signature valid? → YES: proceed, NO: reject
3. Is message timestamp within 5 minutes? → YES: proceed, NO: reject (replay protection)
4. Establish secure WebSocket tunnel
```

## Database Schema

```sql
-- PC2 Node Configuration
CREATE TABLE pc2_config (
    id INTEGER PRIMARY KEY,
    node_name VARCHAR(255) DEFAULT 'My PC2',
    setup_token_hash VARCHAR(64),        -- SHA-256 hash of setup token
    setup_token_used BOOLEAN DEFAULT 0,  -- TRUE after owner claims
    owner_wallet_address VARCHAR(42),    -- Owner's wallet (NULL until claimed)
    node_status VARCHAR(20) DEFAULT 'AWAITING_OWNER',  -- AWAITING_OWNER | OWNED
    created_at INTEGER,
    updated_at INTEGER
);

-- Tethered Wallets (whitelist)
CREATE TABLE pc2_tethered_wallets (
    id INTEGER PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    label VARCHAR(255),
    permissions TEXT DEFAULT '["full"]',
    is_owner BOOLEAN DEFAULT 0,
    invited_by VARCHAR(42),              -- Owner who invited this wallet
    created_at INTEGER,
    last_connected_at INTEGER
);

-- Active Sessions
CREATE TABLE pc2_sessions (
    id INTEGER PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    session_token VARCHAR(255) UNIQUE,
    ip_address VARCHAR(45),
    created_at INTEGER,
    expires_at INTEGER,
    
    FOREIGN KEY(wallet_address) REFERENCES pc2_tethered_wallets(wallet_address)
);
```

## Attack Scenarios & Mitigations

### Scenario 1: Attacker Knows Your PC2 URL

**Attack**: Attacker discovers `https://your-pc2.example.com` and tries to tether their wallet.

**Protection**: 
- Without the setup token, they cannot claim ownership
- POST to `/api/pc2/claim-ownership` will fail
- No connection possible without being in whitelist

### Scenario 2: Attacker Tries Brute-Force Setup Token

**Attack**: Attacker tries random setup tokens.

**Protection**:
- Token is 256-bit (2^256 possibilities)
- Rate limiting: 5 attempts per minute
- After 10 failed attempts: 1 hour lockout
- After owner claims: token invalidated permanently

### Scenario 3: Attacker Intercepts Setup Token

**Attack**: Attacker gains access to your server console.

**Protection**:
- If they have console access, they already own the server
- Token is only displayed once at first boot
- Consider: display token in a separate secure channel (e.g., encrypted file)

### Scenario 4: Attacker Connects After You

**Attack**: Attacker tries to tether after you've already claimed ownership.

**Protection**:
- Setup token is invalidated after first use
- Only owner can add new wallets
- All new wallets must be explicitly approved by owner

### Scenario 5: Man-in-the-Middle Attack

**Attack**: Attacker intercepts traffic between browser and PC2.

**Protection**:
- All connections use TLS/HTTPS
- Wallet signatures cannot be forged
- Session tokens are cryptographically random

## Encryption Key Derivation

Files are encrypted using a key derived from the wallet:

```javascript
// User signs a deterministic message
const keyDerivationMessage = `PC2 Encryption Key for ${nodeUrl}`;
const signature = await signer.signMessage(keyDerivationMessage);

// Derive encryption key from signature
const encryptionKey = crypto.createHash('sha256')
    .update(signature)
    .digest(); // 32-byte key for AES-256
```

**Why this is secure:**
1. Only the wallet owner can produce this signature
2. The key is deterministic (same message = same key)
3. The key never leaves the client
4. Even if someone gets the encrypted files, they cannot decrypt without the wallet

## Implementation Checklist

- [ ] Setup token generation at first install
- [ ] Setup token hash storage (never store plaintext)
- [ ] One-time token invalidation
- [ ] Owner claim endpoint with signature verification
- [ ] Tethered wallet whitelist
- [ ] Wallet invitation system (owner only)
- [ ] Rate limiting on authentication endpoints
- [ ] Session management with expiry
- [ ] Audit logging for all access
- [ ] TLS certificate setup guide
- [ ] IPFS encryption with wallet-derived key

## User Flow Summary

```
INSTALL PC2 (on your hardware)
       │
       ├─► Console displays: PC2-SETUP-xxxxx (SAVE THIS!)
       │
       ▼
OPEN ELASTOS (in browser)
       │
       ├─► Connect wallet (MetaMask/Essentials)
       ├─► Enter PC2 URL + Setup Token
       ├─► Sign message to claim ownership
       │
       ▼
YOU ARE NOW THE OWNER
       │
       ├─► Only your wallet can connect
       ├─► You can invite trusted wallets
       ├─► All files encrypted with your key
       │
       ▼
CONNECT FROM ANYWHERE
       │
       ├─► Login with your wallet
       ├─► Auto-connect to your PC2
       └─► Full access to your personal cloud
```

---

**This architecture ensures that only YOU can access your PC2 node, even if someone discovers your node URL.**


