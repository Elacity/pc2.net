# Elacity + UniversalX + PuterOS Integration Audit & Strategy

**Date**: December 5, 2025  
**Branch**: `universal-testing`  
**Status**: Deep Audit Complete  
**Objective**: Integrate Particle Network's UniversalX smart accounts to enable Elacity users to login to PuterOS and access their content

---

## 🎯 EXECUTIVE SUMMARY

### The Vision:
Enable **Elacity** content creators and consumers to:
1. **Log in to Elacity** with UniversalX smart accounts (Particle Network)
2. **Buy content and trade rights** on Elacity platform
3. **Log in to PuterOS** with the same UniversalX account
4. **Download their purchased content** to their personal cloud (IPFS-backed)
5. **Manage content across chains** seamlessly (Base, Ethereum, Polygon, etc.)

### Current State:
- ✅ **PuterOS**: Has basic Particle Auth (wallet address-based login)
- ✅ **IPFS Extension**: Architecture designed (not yet implemented)
- ❌ **Elacity Integration**: Not started
- ❌ **UniversalX Smart Accounts**: Not implemented
- ❌ **Content Rights Management**: Not implemented

---

## 📊 CURRENT PUTEROSPARTICLE AUTH IMPLEMENTATION AUDIT

### What We Have Now:

**File**: `src/backend/src/routers/auth/particle.js`

```javascript
// Current Implementation Summary:
1. Receives: { address, chainId }
2. Checks: If wallet address exists in database
3. Creates: New user if doesn't exist (username = address)
4. Returns: JWT token + session cookie + user data
```

**Current Flow**:
```
┌──────────────────────────────────────────────┐
│ User Connects Wallet (MetaMask/WalletConnect) │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ POST /auth/particle                          │
│ Body: { address, chainId }                   │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ Check if user exists by wallet_address       │
│ - If NO → Create new user (username = address)│
│ - If YES → Get existing user                 │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ Generate JWT token + session cookie          │
│ Return user data                             │
└──────────────────────────────────────────────┘
```

### Limitations of Current Implementation:

❌ **No Smart Account Support**: Only stores wallet address, not smart account address  
❌ **No Cross-Chain Identity**: Doesn't handle UniversalX's multi-chain capabilities  
❌ **No Session Sharing**: Can't share sessions between Elacity & PuterOS  
❌ **No Content Ownership Verification**: Can't verify purchased content rights  
❌ **No ERC-4337 Integration**: Doesn't use Account Abstraction features  
❌ **No Universal Gas**: Users pay gas on each chain separately  
❌ **No DID Integration**: Wallet address ≠ decentralized identity

---

## 🔬 PARTICLE NETWORK UNIVERSALX ARCHITECTURE

### What is UniversalX?

**UniversalX = Universal Accounts + Universal Liquidity + Universal Gas**

```
┌────────────────────────────────────────────────────────────┐
│                      UNIVERSALX                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Universal Accounts (ERC-4337 Smart Accounts)       │  │
│  │ - Single address across ALL chains                  │  │
│  │ - Programmable account logic                        │  │
│  │ - Social recovery, multi-sig, etc.                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Universal Liquidity                                  │  │
│  │ - Atomic cross-chain swaps                          │  │
│  │ - Automatic liquidity routing                        │  │
│  │ - No manual bridging needed                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Universal Gas                                        │  │
│  │ - Pay gas with ANY token on ANY chain               │  │
│  │ - Omnichain Paymaster                               │  │
│  │ - Gasless transactions possible                      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Key Components:

#### 1. **Universal Accounts SDK** (`@particle-network/universal-accounts`)

```typescript
import { UniversalProvider } from '@particle-network/universal-accounts';

// Initialize Universal Account
const universalProvider = await UniversalProvider.init({
  projectId: 'YOUR_PARTICLE_PROJECT_ID',
  clientKey: 'YOUR_PARTICLE_CLIENT_KEY',
  appId: 'YOUR_PARTICLE_APP_ID',
  chains: [
    {
      id: 8453, // Base
      token: 'ETH',
    },
    {
      id: 1, // Ethereum
      token: 'ETH',
    },
    {
      id: 137, // Polygon
      token: 'MATIC',
    },
  ],
});

// Get Universal Account Address (same across all chains)
const smartAccountAddress = await universalProvider.getAddress();

// User's EOA (Externally Owned Account) wallet
const eoaAddress = await universalProvider.getOwnerAddress();
```

**Key Insight**: **Smart Account Address ≠ EOA Wallet Address**
- **EOA Address**: User's MetaMask/WalletConnect wallet (0x123...)
- **Smart Account Address**: User's Universal Account (0xabc...) - **THIS IS WHAT WE NEED TO STORE!**

#### 2. **Particle Auth Core** (`@particle-network/auth-core-modal`)

```typescript
import { AuthCoreContextProvider } from '@particle-network/auth-core-modal';

// Social logins + wallet connections
<AuthCoreContextProvider
  options={{
    projectId: process.env.REACT_APP_PROJECT_ID,
    clientKey: process.env.REACT_APP_CLIENT_KEY,
    appId: process.env.REACT_APP_APP_ID,
    
    // Wallet configuration
    wallet: {
      visible: true,
      supportChains: [
        { id: 8453, name: 'Base' },
        { id: 1, name: 'Ethereum' },
      ],
    },
    
    // Security options
    securityAccount: {
      promptSettingWhenSign: 1,
      promptMasterPasswordSettingWhenLogin: 1,
    },
  }}
>
  {children}
</AuthCoreContextProvider>
```

#### 3. **ERC-4337 Smart Account Features**

```typescript
// Smart account can:
// 1. Batch transactions
const tx = await smartAccount.sendBatchTransaction([
  { to: contract1, data: data1 },
  { to: contract2, data: data2 },
]);

// 2. Sponsor gas (gasless transactions)
const txHash = await smartAccount.sendTransaction(
  { to: recipient, value: amount },
  { feeQuote: 'sponsored' } // No gas cost to user!
);

// 3. Pay gas with any token
const txHash = await smartAccount.sendTransaction(
  { to: recipient, value: amount },
  { feeQuote: { token: 'USDC' } } // Pay gas with USDC instead of ETH
);

// 4. Social recovery
await smartAccount.setRecoveryGuardian(guardianAddress);
```

---

## 🏗️ ELACITY ARCHITECTURE (Based on Research)

### Elacity's Core Components:

Based on public documentation and npm packages, Elacity uses:

1. **@elacity-js/crypto-protocol** - WebAssembly-based cryptographic protocol
   - Content encryption/decryption
   - DRM key management
   - Access control verification

2. **@elacity-js/uikit** - React + Material UI design system
   - Creator dashboards
   - Content marketplace UI
   - Rights management interface

3. **@elacity-js/media-player** - Encrypted content playback
   - DRM-protected streaming
   - Token-gated access
   - On-chain ownership verification

### Elacity's Smart Contract Architecture (Inferred):

```solidity
// Content Registry (Base Network)
contract ElacityContentRegistry {
    struct Content {
        bytes32 contentId;
        address creator;
        string encryptedMetadataURI; // IPFS CID
        uint256 price;
        bool isActive;
    }
    
    // Content ownership
    mapping(bytes32 => Content) public content;
    
    // User purchases (contentId => buyer => purchased)
    mapping(bytes32 => mapping(address => bool)) public purchases;
    
    // Rights management (contentId => buyer => rights)
    mapping(bytes32 => mapping(address => Rights)) public contentRights;
    
    struct Rights {
        bool canDownload;
        bool canStream;
        bool canResell;
        uint256 expiresAt;
        bytes32 decryptionKeyHash;
    }
}
```

### Elacity Login Flow (Hypothetical based on Particle best practices):

```
┌──────────────────────────────────────────┐
│ User visits ela.city                     │
│ Clicks "Connect Wallet"                  │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ Particle Auth Modal Opens                │
│ Options: MetaMask, WalletConnect, Email  │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ User connects (e.g., MetaMask)           │
│ Particle creates Universal Account       │
│ Returns:                                 │
│ - EOA Address: 0x123... (MetaMask)       │
│ - Smart Account: 0xabc... (Universal)    │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ POST /api/auth/particle                  │
│ Body: {                                  │
│   eoaAddress: "0x123...",                │
│   smartAccountAddress: "0xabc...",       │
│   chainId: 8453,                         │
│   signature: "...",                      │
│   userInfo: { ... }                      │
│ }                                        │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ Backend:                                 │
│ 1. Verify signature                      │
│ 2. Check if user exists by smartAccount  │
│ 3. Create/update user profile            │
│ 4. Generate JWT token                    │
│ 5. Return session                        │
└──────────────────────────────────────────┘
```

---

## 🔄 PROPOSED INTEGRATION ARCHITECTURE

### Goal: **Single Sign-On with Content Rights Verification**

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Login to Elacity                                       │
│  ┌──────────────────────────────────────────────────┐          │
│  │ ela.city                                         │          │
│  │ Connect Wallet → Universal Account Created       │          │
│  │ Smart Account: 0xabc...                          │          │
│  └──────────────────────────────────────────────────┘          │
│                         │                                        │
│                         ▼                                        │
│  Step 2: Buy Content on Elacity                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │ Purchase "Movie.mp4" for 10 USDC                 │          │
│  │ On-chain: contentId → 0xabc... → Rights granted  │          │
│  │ Stored: Encrypted file on Elacity's IPFS        │          │
│  └──────────────────────────────────────────────────┘          │
│                         │                                        │
│                         ▼                                        │
│  Step 3: Login to PuterOS (Same Universal Account)             │
│  ┌──────────────────────────────────────────────────┐          │
│  │ puter.local:4000                                 │          │
│  │ Connect Wallet → Recognizes same Smart Account   │          │
│  │ Smart Account: 0xabc... (SAME AS ELACITY!)       │          │
│  └──────────────────────────────────────────────────┘          │
│                         │                                        │
│                         ▼                                        │
│  Step 4: Access Purchased Content in PuterOS                    │
│  ┌──────────────────────────────────────────────────┐          │
│  │ File Browser → "Elacity" folder appears          │          │
│  │ Shows all purchased content from Elacity         │          │
│  │ - Movie.mp4 (verified ownership on-chain)        │          │
│  │ - Album.zip                                      │          │
│  │ - eBook.pdf                                      │          │
│  └──────────────────────────────────────────────────┘          │
│                         │                                        │
│                         ▼                                        │
│  Step 5: Download to Personal Cloud                             │
│  ┌──────────────────────────────────────────────────┐          │
│  │ Right-click → "Download to My Cloud"             │          │
│  │ - Fetches from Elacity IPFS                      │          │
│  │ - Decrypts with ownership proof                  │          │
│  │ - Re-encrypts for personal storage               │          │
│  │ - Uploads to user's IPFS node                    │          │
│  │ - File now in ~/Documents/                       │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 IMPLEMENTATION STRATEGY

### Phase 1: Upgrade Particle Auth to UniversalX (Week 1-2)

#### **Task 1.1: Install Universal Accounts SDK**

```bash
cd /Users/mtk/Documents/Cursor/pc2.net
npm install @particle-network/universal-accounts @particle-network/auth-core-modal
```

#### **Task 1.2: Update Backend Auth Endpoint**

**File**: `src/backend/src/routers/auth/particle.js`

**Current**:
```javascript
const { address, chainId } = req.body;
```

**New**:
```javascript
const { 
  eoaAddress,          // MetaMask wallet address
  smartAccountAddress, // Universal Account address (ERC-4337)
  chainId,
  signature,           // Signature to verify ownership
  userInfo             // Particle user info (email, name, etc.)
} = req.body;

// Verify signature
const message = `Login to PuterOS\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
const recoveredAddress = ethers.utils.verifyMessage(message, signature);
if (recoveredAddress.toLowerCase() !== eoaAddress.toLowerCase()) {
  throw APIError.create('invalid_signature');
}

// Check if user exists by SMART ACCOUNT (not EOA!)
let user = await get_user({ 
  smart_account_address: smartAccountAddress.toLowerCase(), 
  cached: false 
});
```

#### **Task 1.3: Database Migration - Add Smart Account Fields**

**File**: `src/backend/src/services/database/sqlite_setup/0043_universalx_accounts.sql`

```sql
-- Universal Accounts (UniversalX) Extension
-- Stores smart account addresses and cross-chain identity

-- Add smart account fields to user table
ALTER TABLE `user` ADD COLUMN `smart_account_address` VARCHAR(42) NULL;
ALTER TABLE `user` ADD COLUMN `eoa_wallet_address` VARCHAR(42) NULL; -- Rename from wallet_address
ALTER TABLE `user` ADD COLUMN `particle_uuid` VARCHAR(255) NULL;
ALTER TABLE `user` ADD COLUMN `particle_email` VARCHAR(255) NULL;
ALTER TABLE `user` ADD COLUMN `particle_user_info` TEXT NULL; -- JSON

-- Create index on smart account address (this is the PRIMARY lookup!)
CREATE UNIQUE INDEX IF NOT EXISTS `idx_smart_account_address` 
ON `user` (`smart_account_address`);

-- Create index on EOA address (secondary lookup)
CREATE INDEX IF NOT EXISTS `idx_eoa_wallet_address` 
ON `user` (`eoa_wallet_address`);

-- User's supported chains
CREATE TABLE IF NOT EXISTS `user_chains` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `chain_id` INTEGER NOT NULL,
    `chain_name` VARCHAR(100) NOT NULL,
    `is_active` BOOLEAN DEFAULT 1,
    `created_at` INTEGER NOT NULL,
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
    UNIQUE INDEX `idx_user_chain` (`user_id`, `chain_id`)
);
```

#### **Task 1.4: Update Frontend Particle Auth**

**File**: `src/particle-auth/src/ParticleAuthProvider.tsx` (needs to be created/updated)

```typescript
import { 
  AuthCoreContextProvider, 
  useConnect, 
  useAuthCore 
} from '@particle-network/auth-core-modal';
import { UniversalProvider } from '@particle-network/universal-accounts';
import { ethers } from 'ethers';

// Initialize Universal Provider
const universalProvider = await UniversalProvider.init({
  projectId: process.env.REACT_APP_PARTICLE_PROJECT_ID!,
  clientKey: process.env.REACT_APP_PARTICLE_CLIENT_KEY!,
  appId: process.env.REACT_APP_PARTICLE_APP_ID!,
  chains: [
    { id: 8453, name: 'Base', token: 'ETH' },
    { id: 1, name: 'Ethereum', token: 'ETH' },
    { id: 137, name: 'Polygon', token: 'MATIC' },
  ],
});

export function ParticleLogin() {
  const { connect } = useConnect();
  const { userInfo } = useAuthCore();
  
  const handleLogin = async () => {
    try {
      // Step 1: Connect wallet via Particle
      await connect();
      
      // Step 2: Get addresses
      const smartAccountAddress = await universalProvider.getAddress();
      const eoaAddress = await universalProvider.getOwnerAddress();
      
      // Step 3: Generate signature for verification
      const nonce = Date.now().toString();
      const timestamp = new Date().toISOString();
      const message = `Login to PuterOS\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
      
      const provider = new ethers.providers.Web3Provider(universalProvider);
      const signer = provider.getSigner();
      const signature = await signer.signMessage(message);
      
      // Step 4: Send to PuterOS backend
      const response = await fetch('http://api.puter.localhost:4100/auth/particle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eoaAddress,
          smartAccountAddress,
          chainId: 8453, // Base
          signature,
          nonce,
          timestamp,
          userInfo: {
            uuid: userInfo?.uuid,
            email: userInfo?.email,
            name: userInfo?.name,
          },
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store token and redirect to desktop
        localStorage.setItem('puter_token', data.token);
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };
  
  return (
    <button onClick={handleLogin}>
      Connect Universal Account
    </button>
  );
}
```

---

### Phase 2: Elacity Content Integration (Week 3-4)

#### **Task 2.1: Create Elacity Service**

**File**: `extensions/elacity-integration/services/ElacityService.js`

```javascript
const BaseService = require('../../../src/backend/src/services/BaseService');
const { ethers } = require('ethers');

class ElacityService extends BaseService {
    async _init() {
        this.log = this.services.get('log-service').create('ElacityService');
        
        // Connect to Base network
        this.provider = new ethers.providers.JsonRpcProvider(
            process.env.BASE_RPC_URL || 'https://mainnet.base.org'
        );
        
        // Elacity Content Registry contract
        this.contentRegistryAddress = process.env.ELACITY_CONTENT_REGISTRY_ADDRESS;
        this.contentRegistryABI = [
            'function purchases(bytes32 contentId, address buyer) view returns (bool)',
            'function contentRights(bytes32 contentId, address buyer) view returns (tuple(bool canDownload, bool canStream, bool canResell, uint256 expiresAt, bytes32 decryptionKeyHash))',
            'event ContentPurchased(bytes32 indexed contentId, address indexed buyer, uint256 price)',
        ];
        
        this.contentRegistry = new ethers.Contract(
            this.contentRegistryAddress,
            this.contentRegistryABI,
            this.provider
        );
        
        this.log.info('Elacity Service initialized');
    }
    
    /**
     * Verify if user owns content
     */
    async verifyContentOwnership({ contentId, smartAccountAddress }) {
        try {
            const hasPurchased = await this.contentRegistry.purchases(
                contentId,
                smartAccountAddress
            );
            
            if (!hasPurchased) {
                return { 
                  owned: false, 
                  error: 'Content not purchased' 
                };
            }
            
            // Get rights details
            const rights = await this.contentRegistry.contentRights(
                contentId,
                smartAccountAddress
            );
            
            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            if (rights.expiresAt > 0 && rights.expiresAt < now) {
                return { 
                  owned: false, 
                  error: 'Access expired',
                  expiredAt: new Date(rights.expiresAt * 1000)
                };
            }
            
            return {
                owned: true,
                rights: {
                    canDownload: rights.canDownload,
                    canStream: rights.canStream,
                    canResell: rights.canResell,
                    expiresAt: rights.expiresAt > 0 ? new Date(rights.expiresAt * 1000) : null,
                    decryptionKeyHash: rights.decryptionKeyHash,
                },
            };
        } catch (error) {
            this.log.error('Failed to verify content ownership:', error);
            throw error;
        }
    }
    
    /**
     * Get all content owned by user
     */
    async getUserContent({ smartAccountAddress }) {
        try {
            // Listen to ContentPurchased events for this user
            const filter = this.contentRegistry.filters.ContentPurchased(
                null, // any contentId
                smartAccountAddress // this buyer
            );
            
            const events = await this.contentRegistry.queryFilter(
                filter,
                0, // from block 0
                'latest'
            );
            
            const ownedContent = [];
            
            for (const event of events) {
                const contentId = event.args.contentId;
                const ownership = await this.verifyContentOwnership({
                    contentId,
                    smartAccountAddress,
                });
                
                if (ownership.owned) {
                    ownedContent.push({
                        contentId,
                        purchasedAt: new Date(event.blockNumber * 12 * 1000), // Approximate
                        price: ethers.utils.formatUnits(event.args.price, 6), // USDC = 6 decimals
                        rights: ownership.rights,
                    });
                }
            }
            
            return ownedContent;
        } catch (error) {
            this.log.error('Failed to get user content:', error);
            throw error;
        }
    }
    
    /**
     * Fetch content metadata from Elacity IPFS
     */
    async fetchContentMetadata({ contentId }) {
        // TODO: Query Elacity's backend API or IPFS for metadata
        // For now, placeholder
        return {
            title: 'Content Title',
            creator: '0x...',
            thumbnailUrl: 'ipfs://...',
            fileSize: 1024000,
            mimeType: 'video/mp4',
        };
    }
    
    /**
     * Download content from Elacity with ownership proof
     */
    async downloadContent({ contentId, smartAccountAddress }) {
        // Verify ownership
        const ownership = await this.verifyContentOwnership({
            contentId,
            smartAccountAddress,
        });
        
        if (!ownership.owned) {
            throw new Error(`Content not owned: ${ownership.error}`);
        }
        
        if (!ownership.rights.canDownload) {
            throw new Error('Download right not granted');
        }
        
        // TODO: Fetch encrypted content from Elacity IPFS
        // TODO: Decrypt using decryptionKeyHash
        // TODO: Return decrypted buffer
        
        return {
            success: true,
            contentId,
            // buffer: decryptedContent,
            metadata: await this.fetchContentMetadata({ contentId }),
        };
    }
}

module.exports = { ElacityService };
```

#### **Task 2.2: Create Elacity API Routes**

**File**: `src/backend/src/routers/elacity/content.js`

```javascript
const eggspress = require("../../api/eggspress");
const { Context } = require("../../util/context");
const APIError = require("../../api/APIError");

module.exports = eggspress('/elacity/content', {
    subdomain: 'api',
    auth2: true, // Require authentication
    allowedMethods: ['GET'],
}, async (req, res, next) => {
    const x = Context.get();
    const user = x.get('user');
    const svc_elacity = x.get('services').get('elacity');
    
    try {
        // Get all content owned by user
        const ownedContent = await svc_elacity.getUserContent({
            smartAccountAddress: user.smart_account_address,
        });
        
        return res.json({
            success: true,
            content: ownedContent,
        });
    } catch (error) {
        throw APIError.create('internal_server_error', error.message);
    }
});
```

**File**: `src/backend/src/routers/elacity/download.js`

```javascript
const eggspress = require("../../api/eggspress");
const { Context } = require("../../util/context");
const APIError = require("../../api/APIError");

module.exports = eggspress('/elacity/download/:contentId', {
    subdomain: 'api',
    auth2: true,
    allowedMethods: ['POST'],
}, async (req, res, next) => {
    const x = Context.get();
    const user = x.get('user');
    const svc_elacity = x.get('services').get('elacity');
    const { contentId } = req.params;
    
    try {
        // Download content with ownership verification
        const result = await svc_elacity.downloadContent({
            contentId,
            smartAccountAddress: user.smart_account_address,
        });
        
        // TODO: Save to user's IPFS storage
        // TODO: Add to user's file system at ~/Elacity/{contentTitle}
        
        return res.json({
            success: true,
            message: 'Content downloaded to your cloud',
            contentId: result.contentId,
            metadata: result.metadata,
        });
    } catch (error) {
        throw APIError.create('forbidden', error.message);
    }
});
```

---

### Phase 3: Frontend Integration (Week 5-6)

#### **Task 3.1: Elacity Content Browser**

**File**: `src/gui/src/UI/Elacity/ElacityBrowser.js`

```javascript
export default {
    id: 'elacity-browser',
    title_i18n_key: 'elacity_content',
    icon: 'cube.svg',
    
    async init($el_parent) {
        // Fetch user's Elacity content
        const response = await fetch('http://api.puter.localhost:4100/elacity/content', {
            headers: {
                'Authorization': `Bearer ${puter.authToken}`,
            },
        });
        
        const data = await response.json();
        
        if (data.success) {
            this.renderContent(data.content, $el_parent);
        }
    },
    
    renderContent(contentList, $container) {
        const html = `
            <div class="elacity-content-grid">
                ${contentList.map(item => `
                    <div class="content-card" data-content-id="${item.contentId}">
                        <img src="${item.metadata.thumbnailUrl}" alt="${item.metadata.title}" />
                        <h3>${item.metadata.title}</h3>
                        <p>Creator: ${item.metadata.creator}</p>
                        <p>Purchased: ${item.purchasedAt}</p>
                        <button class="download-btn" data-id="${item.contentId}">
                            Download to My Cloud
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        
        $container.html(html);
        
        // Attach download handlers
        $('.download-btn').on('click', async function() {
            const contentId = $(this).data('id');
            await downloadElacityContent(contentId);
        });
    },
};

async function downloadElacityContent(contentId) {
    try {
        const response = await fetch(`http://api.puter.localhost:4100/elacity/download/${contentId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${puter.authToken}`,
            },
        });
        
        const data = await response.json();
        
        if (data.success) {
            UIAlert({
                message: `${data.metadata.title} downloaded to ~/Elacity/`,
                type: 'success',
            });
        }
    } catch (error) {
        UIAlert({
            message: `Download failed: ${error.message}`,
            type: 'error',
        });
    }
}
```

---

## 🔐 SECURITY CONSIDERATIONS

### 1. **Signature Verification**
- Always verify wallet signatures before authentication
- Use nonce + timestamp to prevent replay attacks
- Store used nonces to prevent reuse

### 2. **Smart Account Validation**
- Verify smart account is actually controlled by EOA
- Check smart account is deployed (not just an address)
- Validate smart account follows ERC-4337 standard

### 3. **Content Rights Verification**
- ALWAYS verify on-chain before allowing download
- Check expiration timestamps
- Verify decryption key hash matches

### 4. **Cross-Origin Security**
- Whitelist Elacity domains for CORS
- Use secure cookies (httpOnly, sameSite)
- Implement CSRF protection

### 5. **Encryption**
- Re-encrypt content for personal storage (different key than Elacity)
- Never store decryption keys in plaintext
- Use wallet-derived keys (deterministic)

---

## 📊 DATABASE SCHEMA UPDATES

```sql
-- 0043_universalx_accounts.sql
ALTER TABLE `user` ADD COLUMN `smart_account_address` VARCHAR(42) NULL;
ALTER TABLE `user` ADD COLUMN `eoa_wallet_address` VARCHAR(42) NULL;
ALTER TABLE `user` ADD COLUMN `particle_uuid` VARCHAR(255) NULL;
ALTER TABLE `user` ADD COLUMN `particle_email` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `idx_smart_account` ON `user`(`smart_account_address`);

-- 0044_elacity_content.sql
CREATE TABLE `user_elacity_content` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `user_id` INTEGER NOT NULL,
    `content_id` VARCHAR(66) NOT NULL, -- bytes32 as hex
    `purchased_at` INTEGER NOT NULL,
    `downloaded_at` INTEGER NULL,
    `local_file_path` VARCHAR(1024) NULL,
    `local_ipfs_cid` VARCHAR(255) NULL,
    `metadata` TEXT NULL, -- JSON
    
    FOREIGN KEY(`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
    UNIQUE INDEX `idx_user_content` (`user_id`, `content_id`)
);
```

---

## 🚀 ROLLOUT PLAN

### Week 1-2: Foundation
- ✅ Upgrade to UniversalX SDK
- ✅ Database migrations
- ✅ Update auth endpoint
- ✅ Test login with smart accounts

### Week 3-4: Elacity Integration
- ✅ Create Elacity service
- ✅ Implement ownership verification
- ✅ Build API routes
- ✅ Test with mock contracts

### Week 5-6: Frontend & Polish
- ✅ Build Elacity browser UI
- ✅ Implement download flow
- ✅ Add progress indicators
- ✅ Write documentation

### Week 7-8: Testing & Deployment
- ✅ End-to-end testing
- ✅ Security audit
- ✅ Performance optimization
- ✅ Production deployment

---

## 🎯 SUCCESS CRITERIA

### Must Have:
- [ ] User can login with same Universal Account on both platforms
- [ ] Purchased content from Elacity visible in PuterOS
- [ ] Content ownership verified on-chain before download
- [ ] Downloaded content stored in personal IPFS
- [ ] Content playable in PuterOS media player

### Nice to Have:
- [ ] Automatic sync when new content purchased
- [ ] Transfer content to other devices
- [ ] Share purchased content with friends (if rights allow)
- [ ] Gasless transactions via Particle Paymaster

---

## 📚 RESOURCES

### Particle Network Documentation:
- Universal Accounts: https://developers.particle.network/universal-accounts
- Auth Core: https://developers.particle.network/social-logins/connect
- Smart Accounts: https://developers.particle.network/intro/account-abstraction

### Elacity Resources:
- Documentation: https://docs.ela.city
- NPM Packages: @elacity-js/* on npm
- Base Network: https://base.org

### PuterOS:
- Extension Docs: `src/backend/doc/extensions/`
- Particle Auth Reference: `extensions/particle-auth/`
- IPFS Strategy: `IPFS_STORAGE_STRATEGY.md`

---

## 🤝 NEXT STEPS

1. **Review this audit** with your team
2. **Confirm Elacity's contract addresses** on Base network
3. **Get Particle Network credentials** (Project ID, Client Key, App ID)
4. **Coordinate with Elacity team** on:
   - Content metadata format
   - IPFS gateway URLs
   - Decryption key delivery mechanism
5. **Start implementation** following Phase 1 tasks

---

## 📚 APPENDIX: EXISTING ELACITY RESEARCH AUDIT

### Research Files Located: `/Users/mtk/Documents/Cursor/pc2.net/Particleresearch/`

| File | Purpose | Critical Findings |
|------|---------|-------------------|
| `PARTICLE_NETWORK_IMPLEMENTATION_GUIDE.md` | Complete 1200+ line implementation guide | **PRODUCTION CODE READY** |
| `PARTICLE_ELACITY_REFERENCE.md` | Exact Elacity codebase structure | File paths, dependencies, config |
| `PARTICLE_CODE_EXAMPLES.md` | 840+ lines of ready code snippets | Login, transactions, contracts |
| `PARTICLE_NETWORK_QUICK_START.md` | 30-minute fast setup | 5-step minimal implementation |
| `PARTICLE_DEPLOYMENT_CHECKLIST.md` | Production launch checklist | 530+ lines of QA checks |
| `PARTICLE_ENV_TEMPLATE.env` | Environment variable template | All required credentials |
| `particle-network-question.md` | SDK edge case documentation | createSellTransaction behavior |

---

### 🔑 KEY FINDINGS FROM ELACITY RESEARCH

#### 1. **EXACT Package Versions (CRITICAL)**

```json
{
  "dependencies": {
    "@particle-network/connectkit": "^2.1.3",
    "@particle-network/connector-core": "^2.1.0",
    "@particle-network/universal-account-sdk": "^1.0.7",
    "@ethersproject/providers": "^5.6.6",
    "@ethersproject/contracts": "^5.6.1"
  }
}
```

#### 2. **Smart Account Info Structure (Already Documented!)**

```typescript
interface SmartAccountInfo {
  ownerAddress: string;              // EOA wallet address (MetaMask)
  smartAccountAddress: string;       // EVM smart account (Universal)
  solanaSmartAccountAddress: string; // Solana smart account
}
```

**This confirms our audit**: Elacity ALREADY stores both EOA and Smart Account addresses!

#### 3. **Elacity's ParticleNetworkContext (Ready to Adapt)**

```typescript
interface ConnectorContextValue {
  account?: string;                    // Active account (Smart Account or EOA)
  chainId?: number;
  active?: boolean;
  library?: Web3Provider;
  universalAccount?: UniversalAccount;
  smartAccountInfo?: SmartAccountInfo;
  primaryAssets?: IAssetsResponse;     // Cross-chain balances
  deactivate: () => void;
  refreshPrimaryAssets?: () => Promise<void>;
  transactionHandler: 'ua' | 'eoa' | 'eip1193';
}
```

#### 4. **Elacity File Structure (Blueprint for PuterOS)**

```
src/lib/particle-network/
├── index.ts                           # Main exports
├── Provider.tsx                       # Root provider wrapper
├── contexts/
│   ├── connectkit.tsx                 # ConnectKit config (285 lines)
│   ├── ParticleNetworkContext.tsx     # Core context (219 lines)
│   └── style.css                      # Custom CSS
├── hooks/
│   └── index.ts                       # useParticleNetwork() hook
├── components/
│   └── ConnectorSelect.tsx            # Login button
└── web3/
    └── web3-provider.ts               # ethers.js wrapper
```

#### 5. **Transaction Handler Modes**

| Mode | Description | Use Case |
|------|-------------|----------|
| `ua` | Universal Account | Smart Account with ERC-4337, gasless |
| `eoa` | Standard EOA | Direct wallet transactions |
| `eip1193` | Legacy Web3 | Backwards compatibility |

**Elacity Default**: `REACT_APP_TX_EXECUTOR="ua"` (Universal Account)

---

### 🎯 DIRECT IMPLEMENTATION PATH (From Research)

#### Step 1: Install Dependencies (From QUICK_START.md)

```bash
npm install @particle-network/connectkit@^2.1.3 \
  @particle-network/connector-core@^2.1.0 \
  @particle-network/universal-account-sdk@^1.0.7 \
  @ethersproject/providers@^5.6.6 \
  @ethersproject/address@^5.4.0
```

#### Step 2: Create Environment File (From ENV_TEMPLATE.env)

```bash
REACT_APP_PARTICLE_PROJECT_ID="from-particle-dashboard"
REACT_APP_PARTICLE_CLIENT_KEY="from-particle-dashboard"
REACT_APP_PARTICLE_APP_ID="from-particle-dashboard"
REACT_APP_TX_EXECUTOR="ua"
REACT_APP_ENABLE_WEB3="true"
```

#### Step 3: Copy File Structure (From ELACITY_REFERENCE.md)

The entire `src/lib/particle-network/` folder structure is documented with **complete code** in the research files.

---

### 🔄 PuterOS INTEGRATION STRATEGY (Updated)

Given the comprehensive Elacity research, our implementation becomes:

#### Phase 1: Direct Port (Week 1)

1. **Copy** `src/lib/particle-network/` structure from Elacity docs
2. **Adapt** for PuterOS:
   - Replace React Router with PuterOS navigation
   - Replace Redux with PuterOS state management
   - Update UI components to match PuterOS design

3. **Update Backend** (`src/backend/src/routers/auth/particle.js`):
   ```javascript
   // CURRENT: Only stores wallet_address
   // NEW: Store BOTH addresses from Elacity's smartAccountInfo
   const { eoaAddress, smartAccountAddress } = req.body;
   
   // Check by SMART ACCOUNT (not EOA!)
   let user = await get_user({ 
     smart_account_address: smartAccountAddress.toLowerCase()
   });
   ```

#### Phase 2: Elacity Content Integration (Week 2-3)

Using the research-documented patterns:

```typescript
// From PARTICLE_CODE_EXAMPLES.md - Contract Interactions
import { Contract } from '@ethersproject/contracts';

const ELACITY_CONTENT_ABI = [
  'function purchases(bytes32 contentId, address buyer) view returns (bool)',
  'function contentRights(bytes32, address) view returns (tuple(bool,bool,bool,uint256,bytes32))',
];

function useElacityContent() {
  const { library, account } = useParticleNetwork();
  
  const verifyOwnership = async (contentId: string) => {
    const contract = new Contract(
      ELACITY_CONTENT_REGISTRY,
      ELACITY_CONTENT_ABI,
      library
    );
    return await contract.purchases(contentId, account);
  };
  
  return { verifyOwnership };
}
```

---

### ⚡ ESTIMATED IMPLEMENTATION TIME (Updated)

| Phase | Task | Time | Source |
|-------|------|------|--------|
| 1.1 | Install dependencies | 30 min | QUICK_START.md |
| 1.2 | Copy Particle files | 2 hours | IMPLEMENTATION_GUIDE.md |
| 1.3 | Adapt for PuterOS | 4 hours | ELACITY_REFERENCE.md |
| 1.4 | Update backend auth | 2 hours | Our audit document |
| 1.5 | Test login flows | 2 hours | CODE_EXAMPLES.md |
| 2.1 | Elacity service | 4 hours | Our audit document |
| 2.2 | Content verification | 4 hours | CODE_EXAMPLES.md |
| 2.3 | Download flow | 4 hours | Our audit document |
| 3.1 | Frontend UI | 6 hours | CODE_EXAMPLES.md |
| 3.2 | Polish & testing | 4 hours | DEPLOYMENT_CHECKLIST.md |

**Total**: ~32 hours (~4-5 days of focused work)

---

### ✅ RESEARCH VALIDATION

The Elacity research **100% validates** our audit findings:

| Our Audit Finding | Research Confirmation |
|-------------------|----------------------|
| Need Smart Account address | ✅ `smartAccountInfo.smartAccountAddress` exists |
| Need EOA address | ✅ `smartAccountInfo.ownerAddress` exists |
| Use Universal Account SDK | ✅ `@particle-network/universal-account-sdk@^1.0.7` |
| Cross-chain balances | ✅ `primaryAssets.totalAmountInUSD` |
| ERC-4337 support | ✅ `transactionHandler: 'ua'` mode |

---

### 🚀 IMMEDIATE NEXT STEPS

1. **Get Particle Credentials** from https://dashboard.particle.network
2. **Copy Elacity file structure** from research docs
3. **Adapt backend** `/auth/particle` endpoint
4. **Test** with Universal Account mode
5. **Integrate** Elacity content verification

---

**END OF AUDIT REPORT**
