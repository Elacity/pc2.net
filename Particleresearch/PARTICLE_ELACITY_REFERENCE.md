# Elacity's Particle Network Implementation - Technical Reference

**Exact implementation details from Elacity codebase**

---

## Overview

This document describes **exactly how** Elacity implements Particle Network, serving as a reference for replicating the system in PuterOS.

---

## File Structure in Elacity

### Complete Directory Tree

```
src/lib/particle-network/
├── index.ts                              # Main exports
├── Provider.tsx                          # Root provider wrapper
├── service.ts                            # Enhanced RPC service
├── contexts/
│   ├── connectkit.tsx                    # ConnectKit configuration (285 lines)
│   ├── ParticleNetworkContext.tsx        # Core context (219 lines)
│   └── style.css                         # Custom CSS overrides
├── hooks/
│   └── index.ts                          # useParticleNetwork() hook
├── components/
│   ├── ConnectorSelect.tsx               # Login button component
│   └── EmbeddedWallet.tsx                # Embedded wallet UI
├── connectors/                           # Custom wallet connectors
│   ├── injected.ts                       # Custom injected connector
│   ├── customMetamask.ts                 # MetaMask customization
│   ├── customWalletConnect.ts            # WalletConnect customization
│   ├── walletconnect.ts                  # WalletConnect config
│   ├── injectedWalletConnect.ts          # Injected WC connector
│   └── connectorInterfaces.ts            # Connector type definitions
└── web3/
    └── web3-provider.ts                  # ethers.js Web3Provider wrapper
```

---

## Elacity Configuration

### 1. Dependencies (from package.json)

```json
{
  "dependencies": {
    "@particle-network/connectkit": "^2.1.3",
    "@particle-network/connector-core": "^2.1.0",
    "@particle-network/universal-account-sdk": "^1.0.7",
    
    // Ethereum libraries
    "@ethersproject/abi": "^5.6.0",
    "@ethersproject/address": "^5.4.0",
    "@ethersproject/bignumber": "^5.4.2",
    "@ethersproject/bytes": "^5.5.0",
    "@ethersproject/constants": "^5.6.0",
    "@ethersproject/contracts": "^5.6.1",
    "@ethersproject/hash": "^5.4.0",
    "@ethersproject/providers": "^5.6.6",
    "@ethersproject/sha2": "^5.4.0",
    "@ethersproject/strings": "^5.5.0",
    "@ethersproject/units": "^5.6.0",
    "@ethersproject/wallet": "^5.6.1",
    
    // State management
    "@reduxjs/toolkit": "^2.9.0",
    "react-redux": "^9.1.2",
    
    // WalletConnect
    "@walletconnect/ethereum-provider": "^2.21",
    "@walletconnect/modal": "^2.7.0",
    
    // UI
    "@mui/material": "^5.0.0",
    "@mui/icons-material": "^5.0.1",
    
    // React
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

### 2. Environment Variables (from .env.example)

```bash
# Particle Network Credentials
REACT_APP_PARTICLE_PROJECT_ID=""
REACT_APP_PARTICLE_CLIENT_KEY=""
REACT_APP_PARTICLE_APP_ID=""
REACT_APP_PARTICLE_PUBLIC_UA_PROJECT_ID=""

# WalletConnect
REACT_APP_WALLETCONNECT_ID=""

# Transaction Executor Mode
# Options: "ua" (Universal Account), "eoa" (EOA), "eip1193" (Standard)
REACT_APP_TX_EXECUTOR="eip1193"

# Enable Web3 Wallets
REACT_APP_ENABLE_WEB3="false"
```

### 3. Build Configuration (vite.config.js)

**Key Configurations:**

```javascript
// WASM plugin for Particle Network
const particleWasmPlugin = {
  name: 'particle-wasm',
  apply: (_, env) => env.mode === 'development',
  buildStart: () => {
    // Copy WASM files for development
    const copiedPath = path.join(
      __dirname,
      'node_modules/@particle-network/thresh-sig/wasm/thresh_sig_wasm_bg.wasm'
    );
    const dir = path.join(__dirname, 'node_modules/.vite/wasm');
    const resultPath = path.join(dir, 'thresh_sig_wasm_bg.wasm');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    copyFileSync(copiedPath, resultPath);
  },
};

// Node polyfills for production
if (env.NODE_ENV === 'production') {
  plugins.push(
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  );
}

// Development server headers (required for WASM)
server: {
  headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
}

// Bundle optimization
rollupOptions: {
  output: {
    manualChunks: {
      'feature-web3': [
        '@particle-network/connectkit',
        '@particle-network/connector-core'
      ],
    },
  },
}
```

---

## Provider Hierarchy in Elacity

### Application Root Setup (src/provider/index.tsx)

```typescript
<BrowserRouter>
  <ReduxProvider store={store}>
    <SnackbarProvider>
      <GracefulDegradationProvider />
      
      {/* PARTICLE NETWORK PROVIDER */}
      <ParticleNetworkProvider 
        transactionHandler={process.env.REACT_APP_TX_EXECUTOR as TransactionType}
      >
        <FayeProvider>
          <EcosystemProvider defaultChainId={8453}>
            <Web3ApplicationProvider>
              <NetworkProvisioner networks={[base]} preferedNetwork={8453}>
                <ConnectorProvider>
                  <ProfileProvider>
                    <CurrencyProfileProvider>
                      <BackgroundJobManagerProvider>
                        <ConditionalXMTPProvider>
                          <UserAgreementProvider>
                            <NftApprovalProvider>
                              <ModalProvider>
                                <MediaPlayerProvider>
                                  <GalleryProvider>
                                    <FullscreenProvider>
                                      <AppBarUIProvider>
                                        <MobileUIProvider>
                                          {children}
                                        </MobileUIProvider>
                                      </AppBarUIProvider>
                                    </FullscreenProvider>
                                  </GalleryProvider>
                                </MediaPlayerProvider>
                              </ModalProvider>
                            </NftApprovalProvider>
                          </UserAgreementProvider>
                        </ConditionalXMTPProvider>
                      </BackgroundJobManagerProvider>
                    </CurrencyProfileProvider>
                  </ProfileProvider>
                </ConnectorProvider>
              </NetworkProvisioner>
            </Web3ApplicationProvider>
          </EcosystemProvider>
        </FayeProvider>
      </ParticleNetworkProvider>
    </SnackbarProvider>
  </ReduxProvider>
</BrowserRouter>
```

**Note for PuterOS:** You only need the essential providers:
```typescript
<BrowserRouter>
  <ParticleNetworkProvider transactionHandler="ua">
    {/* Your app */}
  </ParticleNetworkProvider>
</BrowserRouter>
```

---

## ConnectKit Configuration

### Chains Configured

**Elacity currently uses:**
```typescript
import { base } from '@particle-network/connectkit/chains';

const chains: ConnectKitOptions['chains'] = [
  base, // Base mainnet (chainId: 8453)
];
```

**Available chains for PuterOS:**
```typescript
import {
  ethereum,
  base,
  polygon,
  arbitrum,
  optimism,
  bsc,
  avalanche,
} from '@particle-network/connectkit/chains';

// Add the chains you need
const chains = [base, ethereum, polygon];
```

### Wallet Connectors Enabled

**Elacity configuration:**

1. **Social/Email Login (always enabled)**
   ```typescript
   authWalletConnectors({
     fiatCoin: 'USD',
     promptSettingConfig: {
       promptMasterPasswordSettingWhenLogin: 1,
       promptPaymentPasswordSettingWhenSign: 1,
     },
   })
   ```

2. **Web3 Wallets (conditional - based on REACT_APP_ENABLE_WEB3)**
   ```typescript
   ...(process.env.REACT_APP_ENABLE_WEB3 === 'true' ? [
     evmWalletConnectors({
       metadata: { name: 'Elacity' },
       connectorFns: [
         injected({ target: 'metaMask' }),
         injected({ target: 'phantom' }),
         injected({ target: 'coinbaseWallet' }),
         // Custom Elastos Essentials connector
         ...(window.elastos ? [customInjector({ target: 'essentialWallet' })] : []),
         walletConnect({ projectId: process.env.REACT_APP_WALLETCONNECT_ID }),
       ],
     })
   ] : [])
   ```

### UI Theme Customization

**Elacity's theme:**
```typescript
appearance: {
  splitEmailAndPhone: false,
  collapseWalletList: false,
  hideContinueButton: true,
  connectorsOrder: ['email', 'phone', 'social'],
  logo: '/static/elacity/waving.png',
  language: 'en-US',
  theme: {
    '--pcm-font-family': '-apple-system,"Proxima Nova",Arial,sans-serif',
    '--pcm-rounded-sm': '4px',
    '--pcm-rounded-md': '8px',
    '--pcm-rounded-lg': '11px',
    '--pcm-rounded-xl': '22px',
    '--pcm-focus-color': colors.primary, // Elacity brand color
    '--pcm-accent-color': colors.primary,
  },
  mode: 'light', // or 'dark'
}
```

---

## Context Implementation

### ParticleNetworkContext Value

**What Elacity exposes:**

```typescript
interface ConnectorContextValue {
  // Core wallet data
  account?: string;                    // Active account (Smart Account or EOA)
  chainId?: number;                    // Current chain ID
  active?: boolean;                    // Is wallet connected?
  isConnected?: boolean;               // Connection status
  
  // Providers
  library?: Web3Provider;              // ethers.js provider
  connector?: Connector;               // Active connector
  
  // Universal Account (if TX_EXECUTOR=ua)
  universalAccount?: UniversalAccount; // UA instance
  smartAccountInfo?: SmartAccountInfo; // Smart account addresses
  primaryAssets?: IAssetsResponse;     // Cross-chain balances
  
  // Actions
  deactivate: () => void;              // Disconnect
  refreshPrimaryAssets?: () => Promise<void>; // Refresh balances
  
  // Configuration
  transactionHandler: TransactionType; // "ua" | "eoa" | "eip1193"
}

interface SmartAccountInfo {
  ownerAddress: string;              // EOA address
  smartAccountAddress: string;       // EVM smart account
  solanaSmartAccountAddress: string; // Solana smart account
}
```

### State Management

**Elacity uses:**

1. **React Context** for Particle Network state
2. **Redux Toolkit** for global app state
3. **RTK Query** for API data

**For PuterOS, you only need:**
- React Context (Particle Network state)
- Your preferred state management (optional)

---

## Usage Patterns in Elacity

### 1. Login Button Component

**Location:** `src/components/mainLayout/AccountSidebar/components/AccountSidebarHeader.tsx`

```typescript
import { useModal } from '@particle-network/connectkit';
import { useParticleNetwork } from 'src/lib/particle-network';

function LoginButton() {
  const { account, deactivate } = useParticleNetwork();
  const { setOpen } = useModal();

  if (account) {
    return (
      <Button onClick={deactivate}>
        Logout ({account.slice(0, 6)}...{account.slice(-4)})
      </Button>
    );
  }

  return (
    <Button onClick={() => setOpen(true)}>
      Log In
    </Button>
  );
}
```

### 2. User Profile Display

**Location:** `src/components/mainLayout/AccountSidebar/components/AccountSidebarHeader.tsx`

```typescript
function UserProfile() {
  const {
    account,
    primaryAssets,
    smartAccountInfo,
    refreshPrimaryAssets,
  } = useParticleNetwork();

  const totalBalance = Number(primaryAssets?.totalAmountInUSD || 0);

  return (
    <div>
      <div>Account: {account}</div>
      <div>EOA: {smartAccountInfo?.ownerAddress}</div>
      <div>Smart Account: {smartAccountInfo?.smartAccountAddress}</div>
      <div>Balance: ${totalBalance.toFixed(2)}</div>
      <button onClick={refreshPrimaryAssets}>Refresh</button>
    </div>
  );
}
```

### 3. Transaction Sending

**Location:** `src/components/mainLayout/AccountSidebar/components/SendModal.tsx`

```typescript
import { parseEther } from '@ethersproject/units';

function SendTransaction() {
  const { library, universalAccount, transactionHandler } = useParticleNetwork();

  const sendETH = async (recipient: string, amount: string) => {
    try {
      if (transactionHandler === 'ua' && universalAccount) {
        // Universal Account (gasless)
        const tx = await universalAccount.sendTransaction({
          to: recipient,
          value: parseEther(amount).toString(),
        });
        console.log('UA Transaction:', tx);
      } else if (library) {
        // Standard EOA
        const signer = library.getSigner();
        const tx = await signer.sendTransaction({
          to: recipient,
          value: parseEther(amount),
        });
        await tx.wait();
        console.log('EOA Transaction:', tx.hash);
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  };

  return <div>{/* UI */}</div>;
}
```

### 4. Contract Interaction

**Location:** `src/lib/web3/` (various files)

```typescript
import { Contract } from '@ethersproject/contracts';

function useContract() {
  const { library, account } = useParticleNetwork();

  const readContract = async (address: string, abi: any, method: string, ...args: any[]) => {
    const contract = new Contract(address, abi, library);
    return await contract[method](...args);
  };

  const writeContract = async (address: string, abi: any, method: string, ...args: any[]) => {
    const signer = library.getSigner();
    const contract = new Contract(address, abi, signer);
    const tx = await contract[method](...args);
    return await tx.wait();
  };

  return { readContract, writeContract };
}
```

---

## Enhanced RPC Service

**Location:** `src/lib/particle-network/service.ts`

Elacity uses Particle's Enhanced RPC to fetch token balances:

```typescript
/**
 * Fetch tokens and NFTs using Particle Enhanced RPC
 */
export async function fetchParticleTokensAndNFTs(
  address: string,
  chainId: number
): Promise<ParticleTokensAndNFTsResponse | null> {
  const auth = btoa(`${PARTICLE_PROJECT_ID}:${PARTICLE_SERVER_KEY}`);

  const response = await fetch('https://rpc.particle.network/evm-chain', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      chainId,
      jsonrpc: '2.0',
      id: 1,
      method: 'particle_getTokensAndNFTs',
      params: [address],
    }),
  });

  const data = await response.json();
  return data.result;
}
```

**Note:** This is optional - primarily used for fetching non-primary tokens.

---

## Special Features in Elacity

### 1. Z-Index Management

Elacity implements custom z-index management to ensure Particle modals appear above Material-UI components:

```typescript
// In connectkit.tsx
function useRaiseParticleModalZIndex(): void {
  const theme = useTheme();

  React.useEffect(() => {
    // Dynamically adjust z-index of Particle modals
    // to appear above MUI components
    // (Implementation details in connectkit.tsx)
  }, [theme]);
}
```

**For PuterOS:** Only needed if you have z-index conflicts with your UI library.

### 2. Custom Elastos Essentials Connector

Elacity has a custom connector for Elastos Essentials wallet:

```typescript
// Only used if window.elastos exists
...(window.elastos ? [
  customInjector({ target: 'essentialWallet' })
] : [])
```

**For PuterOS:** Skip this unless you need Elastos support.

### 3. Non-Primary Token Tracking

Elacity tracks tokens not included in Particle's primary assets:

**Implementation:** Uses Enhanced RPC to query all chains for token balances.

**For PuterOS:** Start with primary assets only, add this later if needed.

---

## Testing Strategy in Elacity

### Manual Testing Checklist

- [x] Email login
- [x] Google login
- [x] MetaMask connection
- [x] WalletConnect (mobile)
- [x] Account display
- [x] Balance loading
- [x] Transaction sending
- [x] Network switching
- [x] Logout
- [x] Session persistence

### Automated Tests

**Location:** Various `*.test.tsx` files

```typescript
// Mock Particle Network for tests
jest.mock('src/lib/particle-network', () => ({
  useParticleNetwork: () => ({
    account: '0xTestAddress',
    active: true,
    chainId: 8453,
    library: mockWeb3Provider,
    primaryAssets: { totalAmountInUSD: '100.50' },
    deactivate: jest.fn(),
  }),
}));
```

---

## Production Configuration

### Environment Variable Values

**Development:**
```bash
REACT_APP_TX_EXECUTOR="eip1193"  # Standard mode
REACT_APP_ENABLE_WEB3="false"    # Email/social only
```

**Production:**
```bash
REACT_APP_TX_EXECUTOR="ua"       # Universal Account
REACT_APP_ENABLE_WEB3="true"     # All wallet types
```

### Performance Optimizations

1. **Code Splitting:**
   - Particle Network in separate chunk: `feature-web3`
   - Lazy loading for providers

2. **Bundle Size:**
   - Main chunk: ~200KB (gzipped)
   - Web3 chunk: ~150KB (gzipped)

3. **Caching:**
   - Service worker for offline support
   - Asset caching via Vite

---

## Comparison: Elacity vs PuterOS Needs

| Feature | Elacity | PuterOS Minimum | Notes |
|---------|---------|-----------------|-------|
| **Social Login** | ✅ Email, Google, Twitter | ✅ Email, Google | Essential |
| **Web3 Wallets** | ✅ MetaMask, WC, Phantom | ⚠️ Optional | Enable via env var |
| **Universal Account** | ✅ Enabled (UA mode) | ✅ Recommended | For best UX |
| **Smart Accounts** | ✅ Full support | ✅ Full support | ERC-4337 |
| **Multi-Chain** | ✅ Base only | ✅ Base + others | Add as needed |
| **Enhanced RPC** | ✅ Used for tokens | ⚠️ Optional | For non-primary tokens |
| **Custom Connectors** | ✅ Elastos Essentials | ❌ Not needed | Skip for PuterOS |
| **Z-Index Management** | ✅ Custom logic | ⚠️ If UI conflicts | MUI-specific |
| **Redux Integration** | ✅ Full integration | ❌ Not required | Use your state mgmt |
| **Material-UI** | ✅ Full theming | ❌ Not required | Use your UI library |

**Legend:**
- ✅ = Implemented/Recommended
- ⚠️ = Optional
- ❌ = Not needed

---

## Key Takeaways for PuterOS

### Must Have (Core Functionality)

1. ✅ **ParticleNetworkProvider** - Core context
2. ✅ **ConnectKit Configuration** - Wallet UI
3. ✅ **useParticleNetwork Hook** - Access wallet data
4. ✅ **ConnectorSelect Component** - Login button
5. ✅ **Environment Variables** - Credentials
6. ✅ **Vite Configuration** - WASM support

### Nice to Have (Enhanced Features)

1. ⚠️ **Universal Account** - Cross-chain balances
2. ⚠️ **Enhanced RPC** - Additional token queries
3. ⚠️ **WalletConnect** - Mobile wallet support
4. ⚠️ **Multiple Chains** - Beyond Base

### Skip for PuterOS

1. ❌ **Elastos Essentials** - Elacity-specific
2. ❌ **Redux Integration** - Use your state management
3. ❌ **Material-UI Theming** - Use your UI library
4. ❌ **Custom Z-Index Management** - Only if conflicts

---

## Implementation Timeline

### Phase 1: Core (Day 1)
- Install dependencies
- Set up environment
- Implement provider hierarchy
- Test basic login

**Estimated Time:** 2-3 hours

### Phase 2: Features (Day 2)
- Add user profile display
- Implement balance queries
- Test transaction sending
- Add error handling

**Estimated Time:** 3-4 hours

### Phase 3: Polish (Day 3)
- Add loading states
- Improve error messages
- Test all auth methods
- Optimize performance

**Estimated Time:** 2-3 hours

**Total:** ~10 hours for complete implementation

---

## Support & References

### Elacity Source Files

**Essential files to reference:**
1. `src/lib/particle-network/contexts/connectkit.tsx`
2. `src/lib/particle-network/contexts/ParticleNetworkContext.tsx`
3. `src/lib/particle-network/Provider.tsx`
4. `src/provider/index.tsx`
5. `vite.config.js`

### Documentation

1. **Elacity Internal:** `docs/wiki/Technical/Particle-Network.md`
2. **Particle Official:** https://docs.particle.network
3. **ConnectKit Guide:** https://docs.particle.network/developers/connectkit
4. **Universal Account:** https://docs.particle.network/developers/universal-account

---

## Conclusion

Elacity's Particle Network implementation is **production-ready and battle-tested**. By following the patterns documented here, PuterOS can replicate the exact same authentication experience with:

✅ **Same login methods** (Email, Social, Web3)  
✅ **Same UX** (ConnectKit UI)  
✅ **Same features** (Universal Account, Smart Accounts)  
✅ **Same reliability** (Proven in production)  

**Next Steps:**
1. Review this document
2. Follow Implementation Guide
3. Reference Code Examples
4. Test thoroughly
5. Deploy to production

**Questions?** See the main Implementation Guide for detailed troubleshooting.

---

**Document Version:** 1.0  
**Last Updated:** December 5, 2025  
**Source:** Elacity v4.1.1 Codebase
