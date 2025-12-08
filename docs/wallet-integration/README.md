# Wallet Integration Documentation

> **For DePin Team Handoff**  
> Last Updated: December 2025

## Overview

This document describes the Particle Network wallet integration in PuterOS, enabling users to authenticate with blockchain wallets and manage digital assets across multiple chains.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PUTER MAIN WINDOW                           │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │ UIAccountSidebar│  │UIWindowAccountSend│  │UIWindowAccountReceive│
│  │  (Wallet Panel) │  │  (Send Modal)    │  │   (Receive Modal)  │ │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬─────────┘ │
│           │                    │                       │            │
│           └────────────────────┼───────────────────────┘            │
│                                ▼                                    │
│                    ┌─────────────────────┐                          │
│                    │   WalletService.js  │   ◄── Central Manager    │
│                    │  • Mode switching   │                          │
│                    │  • Token fetching   │                          │
│                    │  • Transaction send │                          │
│                    │  • History fetch    │                          │
│                    └──────────┬──────────┘                          │
│                               │                                     │
│         ┌─────────────────────┼─────────────────────┐               │
│         │                     │                     │               │
│         ▼                     ▼                     ▼               │
│  ┌─────────────────┐   ┌────────────┐   ┌────────────────────┐     │
│  │ Hidden Particle │   │ MetaMask   │   │ Elastos Proxy      │     │
│  │ Iframe          │   │ (EOA)      │   │ (Backend)          │     │
│  │ (Universal Acct)│   │            │   │                    │     │
│  └─────────────────┘   └────────────┘   └────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/gui/src/services/WalletService.js` | Central wallet management | ~1,500 |
| `src/gui/src/UI/UIAccountSidebar.js` | Slide-out wallet panel | ~1,200 |
| `src/gui/src/UI/UIWindowAccountSend.js` | Send tokens modal | ~1,050 |
| `src/gui/src/UI/UIWindowAccountReceive.js` | Receive tokens modal | ~650 |
| `src/gui/src/helpers/particle-constants.js` | Chain & token constants | ~360 |
| `src/gui/src/helpers/logger.js` | Production-safe logging | ~100 |
| `src/gui/src/helpers/ethereum-provider.js` | Safe provider accessor | ~150 |
| `src/gui/src/types/wallet.js` | JSDoc type definitions | ~120 |
| `src/backend/src/routers/elastos-proxy.js` | CORS proxy for Elastos | ~40 |

---

## Wallet Modes

### Universal Mode (Default)
- **Account Type**: Smart Account (ERC-4337)
- **Chains**: Base, Ethereum, Polygon, Arbitrum, Solana, etc.
- **Tokens**: USDC, USDT, ETH, BTC, SOL, BNB
- **Features**: 
  - Aggregated multi-chain balances
  - Cross-chain transaction routing
  - Gasless transactions (sponsored)

### Elastos Mode
- **Account Type**: EOA (Externally Owned Account)
- **Chains**: Elastos Smart Chain only
- **Tokens**: ELA only
- **Features**:
  - Direct MetaMask transactions
  - Native ELA transfers
  - Elastos explorer integration

---

## WalletService API

### Initialization
```javascript
import walletService from '../services/WalletService.js';

// Check if user has wallet
if (walletService.isConnected()) {
    walletService.initialize();
}
```

### Mode Switching
```javascript
// Switch to Elastos EOA mode
await walletService.setMode('elastos');

// Switch back to Universal Account
await walletService.setMode('universal');

// Get current mode
const mode = walletService.getMode(); // 'universal' | 'elastos'
```

### Data Access
```javascript
// Get tokens for current mode
const tokens = walletService.getTokens();

// Get total USD balance
const balance = walletService.getTotalBalance();

// Get transactions
const transactions = walletService.getTransactions();

// Get addresses
const smartAddress = walletService.getSmartAccountAddress();
const eoaAddress = walletService.getEOAAddress();
const solanaAddress = walletService.getSolanaAddress();
```

### Subscriptions
```javascript
// Subscribe to wallet updates
const unsubscribe = walletService.subscribe((data) => {
    console.log('Wallet updated:', data);
    // data.tokens, data.totalBalance, data.mode, etc.
});

// Cleanup when done
unsubscribe();
```

### Transactions
```javascript
// Send tokens
const result = await walletService.sendTokens({
    to: '0xRecipient...',
    amount: '10.5',
    tokenAddress: null, // null for native token
    chainId: 8453, // Base
    decimals: 18,
});

// Estimate fees
const fee = await walletService.estimateFee({
    to: '0xRecipient...',
    amount: '10.5',
    tokenAddress: null,
    chainId: 8453,
    decimals: 18,
});
```

---

## Communication Flow

### Particle Iframe (Universal Mode)
```
Main Window                    Hidden Iframe
    │                              │
    │  particle-wallet.get-tokens  │
    │ ─────────────────────────────>│
    │                              │
    │      (Calls Particle API)    │
    │                              │
    │  particle-wallet.tokens      │
    │ <─────────────────────────────│
    │                              │
```

### Direct MetaMask (Elastos Mode)
```
Main Window                    MetaMask
    │                              │
    │  wallet_switchEthereumChain  │
    │ ─────────────────────────────>│
    │                              │
    │  eth_sendTransaction         │
    │ ─────────────────────────────>│
    │                              │
    │  (User approves in MetaMask) │
    │                              │
    │  Transaction Hash            │
    │ <─────────────────────────────│
```

---

## Type Definitions

See `src/gui/src/types/wallet.js` for complete types:

```javascript
/**
 * @typedef {Object} Token
 * @property {string} symbol - Token symbol (e.g., "USDC")
 * @property {string} name - Human-readable name
 * @property {string} balance - Token balance as decimal string
 * @property {number} decimals - Token decimals
 * @property {string} network - Network name
 * @property {number} chainId - Chain ID
 * @property {string} [contractAddress] - ERC-20 address
 * @property {string} [usdValue] - USD value
 */

/**
 * @typedef {Object} Transaction
 * @property {string} transactionId - Internal ID
 * @property {string} [txHash] - On-chain hash
 * @property {string} tag - Transaction type
 * @property {string} status - Status
 * @property {string} createdAt - ISO timestamp
 */
```

---

## Constants

### Supported Chains (Universal Mode)
```javascript
import { CHAIN_INFO } from '../helpers/particle-constants.js';

// CHAIN_INFO[chainId] = { name, icon, explorer, color }
CHAIN_INFO[8453]   // Base
CHAIN_INFO[1]      // Ethereum
CHAIN_INFO[137]    // Polygon
CHAIN_INFO[42161]  // Arbitrum
CHAIN_INFO[10]     // Optimism
CHAIN_INFO[56]     // BSC
CHAIN_INFO[20]     // Elastos
```

### Token Addresses
```javascript
import { getTokenAddress } from '../helpers/particle-constants.js';

const usdcOnBase = getTokenAddress('USDC', 'Base');
// '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
```

---

## Backend Proxy

The Elastos explorer API has CORS issues. We proxy through our backend:

```javascript
// Frontend call
const response = await fetch(`${window.api_origin}/api/elastos/transactions?address=${address}`);

// Backend route (src/backend/src/routers/elastos-proxy.js)
router.get('/api/elastos/transactions', async (req, res) => {
    const response = await fetch(`https://esc.elastos.io/api?...`);
    res.json(await response.json());
});
```

---

## Error Handling

```javascript
try {
    await walletService.sendTokens({ ... });
} catch (error) {
    if (error.code === 4001) {
        // User rejected in wallet
    } else if (error.message.includes('insufficient funds')) {
        // Not enough balance
    } else {
        // Generic error
    }
}
```

---

## Security Considerations

1. **Origin Verification**: All postMessage communication verifies `event.origin`
2. **Address Validation**: Uses `isValidAddressForChain()` for EVM/Solana
3. **Provider Abstraction**: Never access `window.ethereum` directly - use helpers
4. **Session Mismatch**: Auto-reinitializes if Particle session doesn't match expected address

---

## DePin Integration Points

For connecting personal hardware boxes:

1. **Authentication**: Use `window.user.wallet_address` as device identity
2. **Mode Selection**: Elastos mode for native ELA, Universal for stablecoins
3. **Transaction Signing**: Use `WalletService.sendTokens()` for payments
4. **Balance Checking**: Subscribe to wallet updates for real-time balances

---

## Testing

Run tests:
```bash
cd src/gui
npm test -- --grep="WalletService"
```

Test file: `src/gui/src/services/__tests__/WalletService.test.js`

---

## Logging

Production logging is disabled by default. Enable for debugging:

```javascript
window.DEBUG_MODE = true; // Enables verbose logging
```

Logs only appear in development (localhost:4100).

---

## Contact

For questions about this integration, refer to:
- `.cursor/tasks/UNIVERSALX-PUTER-INTEGRATION/AUDIT-REPORT.md`
- Particle Network documentation: https://docs.particle.network/

