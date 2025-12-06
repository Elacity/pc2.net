# Elacity Account Sidebar - Deep Technical Analysis

**Repository:** https://github.com/Elacity/elacity-web  
**Branch:** `base-network-updates`  
**Analysis Date:** December 5, 2025  
**Purpose:** Complete replication guide for PuterOS

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete File Structure](#2-complete-file-structure)
3. [Component Hierarchy Diagram](#3-component-hierarchy-diagram)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Core Components Analysis](#5-core-components-analysis)
6. [Send Modal Deep Dive](#6-send-modal-deep-dive)
7. [Receive Modal Deep Dive](#7-receive-modal-deep-dive)
8. [Token Balance System](#8-token-balance-system)
9. [Transaction History](#9-transaction-history)
10. [Hooks Catalog](#10-hooks-catalog)
11. [Services & APIs](#11-services--apis)
12. [State Management](#12-state-management)
13. [Styling System](#13-styling-system)
14. [Integration Points](#14-integration-points)
15. [Dependencies](#15-dependencies)
16. [Implementation Checklist](#16-implementation-checklist)

---

## 1. Executive Summary

### What This Component Does

The Account Sidebar is a **comprehensive wallet management interface** that provides:

- **Slide-out Drawer** - Right-side panel with mobile-optimized bottom sheet
- **Send Tokens** - Multi-network, multi-token transactions with fee estimation
- **Receive Tokens** - QR codes for EVM and Solana addresses
- **Token Balances** - Primary assets + non-primary ERC-20 tokens
- **Transaction History** - Infinite scroll paginated history
- **Swap Functionality** - Token swaps via LI.FI SDK
- **Profile Management** - User profile, banner, edit capabilities

### Architecture Overview

```
AccountSidebar (Main Entry)
├── Context Providers (3 layers)
│   ├── AccountSidebarTabsProvider (tab state)
│   ├── BalanceRefreshProvider (refresh coordination)
│   └── WalletDataProvider (unified data management)
├── Drawer UI
│   ├── AccountSidebarHeader (profile + balance)
│   ├── AccountSidebarActions (send/receive/bank buttons)
│   └── AccountSidebarTabs (tokens/royalties/swap/history)
└── Modals
    ├── SendModal (token transfers)
    ├── ReceiveModal (QR codes)
    └── BankModal (fiat on/off ramp)
```

### Key Statistics

| Metric | Value |
|--------|-------|
| Total Files | 110 |
| Component Files | 25 |
| Hook Files | 16 |
| Context Files | 2 |
| Service Files | 7 |
| Utility Files | 10 |
| Type Definition Files | 3 |
| Style Files | 3 |
| Test Files | 26 |
| Total Lines of Code | ~8,000+ |

---

## 2. Complete File Structure

```
src/components/mainLayout/AccountSidebar/
├── index.tsx                              # Main entry point (312 lines)
├── index.test.tsx                         # Main component tests
├── integration.test.tsx                   # Integration tests
├── mocks.ts                               # Test mocks
├── fixtures.ts                            # Test fixtures
├── testUtils.tsx                          # Test utilities
├── diagnostic.test.ts                     # Diagnostic tests
│
├── types/
│   ├── index.ts                           # Core types (167 lines)
│   ├── token.ts                           # Token type definitions (89 lines)
│   └── particle.ts                        # Particle SDK types (54 lines)
│
├── constants/
│   ├── chain.ts                           # Chain configs & mappings (260 lines)
│   ├── tokenRegistry.ts                   # Token metadata registry
│   └── lifi.ts                            # LI.FI SDK configuration
│
├── contexts/
│   ├── WalletDataContext.tsx              # Unified data provider (463 lines)
│   ├── WalletDataContext.test.tsx
│   ├── AccountSidebarTabsContext.tsx      # Tab state management (79 lines)
│   └── AccountSidebarTabsContext.test.tsx
│
├── hooks/
│   ├── useAccountSidebar.ts               # Sidebar state (175 lines)
│   ├── useAccountSidebar.test.ts
│   ├── useWalletBalance.ts                # Balance aggregation
│   ├── useWalletBalance.test.ts
│   ├── useNonPrimaryTokens.ts             # Non-primary token fetching (197 lines)
│   ├── useNonPrimaryTokens.test.ts
│   ├── useTransactionHistory.ts           # Transaction pagination (149 lines)
│   ├── useTransactionActions.ts           # Transaction execution
│   ├── useAvailableTokens.ts              # Token list for dropdowns
│   ├── useInfiniteScroll.ts               # Infinite scroll logic
│   ├── useSwapForm.tsx                    # Swap form logic
│   ├── useSwapForm.test.tsx
│   ├── useSwapTransaction.ts              # Swap execution
│   ├── useSwapTransaction.test.ts
│   ├── useSwapEstimation.ts               # Swap quote fetching
│   ├── useSwapEstimation.test.ts
│   ├── useTransactionType.ts              # Transaction type detection
│   ├── useTransactionType.test.ts
│   ├── useAssetManagement.ts              # Asset management
│   ├── useAssetManagement.test.ts
│   └── estimation/
│       ├── useBuyEstimation.ts            # Buy estimation
│       ├── useSellEstimation.ts           # Sell estimation
│       └── useConvertEstimation.ts        # Convert estimation
│
├── components/
│   ├── AccountSidebarHeader.tsx           # Profile header (305 lines)
│   ├── AccountSidebarHeader.test.tsx
│   ├── AccountSidebarActions.tsx          # Action buttons
│   ├── AccountSidebarActions.test.tsx
│   ├── AccountSidebarTabs.tsx             # Tab navigation
│   ├── AccountSidebarTabs.test.tsx
│   ├── TokensList.tsx                     # Token list view (337 lines)
│   ├── TokensList.test.tsx
│   ├── TokenIconSmall.tsx                 # Token icon component
│   ├── TokenIconSmall.test.tsx
│   ├── TokenSearchModal.tsx               # Token search
│   ├── TokenSearchModal.test.tsx
│   ├── SendModal.tsx                      # Send token modal (1122 lines)
│   ├── SendModal.test.tsx
│   ├── ReceiveModal.tsx                   # Receive modal (822 lines)
│   ├── ReceiveModal.test.tsx
│   ├── BankModal.tsx                      # Bank modal
│   ├── BankModal.test.tsx
│   ├── AssetsList.tsx                     # NFT assets list
│   ├── AssetsList.test.tsx
│   ├── RoyaltiesList.tsx                  # Royalties list
│   ├── RoyaltiesList.test.tsx
│   ├── ChannelsList.tsx                   # Channels list
│   ├── ChannelsList.test.tsx
│   ├── TransactionDetailModal.tsx         # Transaction details
│   ├── TransactionDetailModal.test.tsx
│   ├── TransactionIcon.tsx                # Transaction type icon
│   ├── TransactionIcon.test.tsx
│   │
│   ├── history/
│   │   ├── HistoryList.tsx                # Transaction history (128 lines)
│   │   ├── HistoryList.test.tsx
│   │   ├── TransactionItem.tsx            # Single transaction row
│   │   ├── HistoryStates.tsx              # Loading/error/empty states
│   │   └── readme.md                      # History component docs
│   │
│   └── swap/
│       ├── SwapPanel.tsx                  # Main swap interface
│       ├── SwapPanel.test.tsx
│       ├── SwapInputSection.tsx           # Input token selector
│       ├── SwapOutputSection.tsx          # Output token selector
│       ├── SwapButton.tsx                 # Swap execution button
│       ├── SwapEstimationDetails.tsx      # Quote display
│       ├── readme.md                      # Swap component docs
│       └── output/
│           ├── EstimatedAmountDisplay.tsx
│           ├── EstimationMetrics.tsx
│           └── TokenNetworkSelector.tsx
│
├── services/
│   ├── lifiSdkConfig.ts                   # LI.FI SDK setup
│   ├── lifiSdkConfig.test.ts
│   ├── lifiQuoteService.ts                # Quote fetching
│   ├── lifiQuoteService.test.ts
│   ├── lifiTokenSource.ts                 # LI.FI token list
│   ├── lifiTokenSource.test.ts
│   └── tokenSource/
│       ├── index.ts                       # Token source exports
│       ├── ParticleTokenSource.ts         # Particle token fetching
│       ├── ParticleTokenSource.test.ts
│       ├── ManualTokenSource.ts           # Manual token additions
│       └── ManualTokenSource.test.ts
│
├── utils/
│   ├── tokenHelpers.tsx                   # Token formatting (233 lines)
│   ├── tokenHelpers.test.tsx
│   ├── display.tsx                        # Display utilities
│   ├── display.test.tsx
│   ├── chainNames.ts                      # Chain name mappings
│   ├── feeHelpers.ts                      # Gas estimation helpers
│   ├── tokenDecimals.ts                   # Decimal handling
│   ├── tokenDecimals.test.ts
│   ├── transactionProcessing.ts           # Transaction processing
│   ├── bridgeHelpers.ts                   # Bridge transaction helpers
│   ├── bridgeHelpers.test.ts
│   ├── lifiHelpers.ts                     # LI.FI utilities
│   └── routeHelpers.ts                    # Route display helpers
│
└── styles/
    ├── AccountSidebarStyles.ts            # Sidebar styles (212 lines)
    ├── ModalStyles.ts                     # Modal styles (285 lines)
    └── TokenStyles.ts                     # Token display styles
```

---

## 3. Component Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         AccountEntry                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Checks: useParticleNetwork().active                      │   │
│  │  If not active → <ConnectorSelect /> (Login button)       │   │
│  │  If active → <MemoizedAccountSidebar />                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AccountSidebar                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         AccountSidebarTabsProvider (Tab State)            │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │         BalanceRefreshProvider (Refresh)            │   │   │
│  │  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │  │         WalletDataProvider (Data)             │   │   │   │
│  │  │  │                                               │   │   │   │
│  │  │  │  ┌─────────────────────────────────────────┐  │   │   │   │
│  │  │  │  │        Profile Avatar Trigger            │  │   │   │   │
│  │  │  │  │   (IconButton + Avatar)                  │  │   │   │   │
│  │  │  │  └─────────────────────────────────────────┘  │   │   │   │
│  │  │  │                                               │   │   │   │
│  │  │  │  ┌─────────────────────────────────────────┐  │   │   │   │
│  │  │  │  │          StyledDrawer                    │  │   │   │   │
│  │  │  │  │  ┌───────────────────────────────────┐   │  │   │   │   │
│  │  │  │  │  │   AccountSidebarHeader            │   │  │   │   │   │
│  │  │  │  │  │   - Banner image                  │   │  │   │   │   │
│  │  │  │  │  │   - Profile avatar                │   │  │   │   │   │
│  │  │  │  │  │   - User name/address             │   │  │   │   │   │
│  │  │  │  │  │   - Balance display ($X.XX)       │   │  │   │   │   │
│  │  │  │  │  │   - Refresh button                │   │  │   │   │   │
│  │  │  │  │  │   - Theme switcher                │   │  │   │   │   │
│  │  │  │  │  │   - Close button                  │   │  │   │   │   │
│  │  │  │  │  └───────────────────────────────────┘   │  │   │   │   │
│  │  │  │  │                                          │  │   │   │   │
│  │  │  │  │  ┌───────────────────────────────────┐   │  │   │   │   │
│  │  │  │  │  │   AccountSidebarActions           │   │  │   │   │   │
│  │  │  │  │  │   [Send] [Receive] [Bank]         │   │  │   │   │   │
│  │  │  │  │  └───────────────────────────────────┘   │  │   │   │   │
│  │  │  │  │                                          │  │   │   │   │
│  │  │  │  │  ┌───────────────────────────────────┐   │  │   │   │   │
│  │  │  │  │  │   AccountSidebarTabs              │   │  │   │   │   │
│  │  │  │  │  │   [Tokens][Royalties][Swap][Hist] │   │  │   │   │   │
│  │  │  │  │  │   ─────────────────────────────── │   │  │   │   │   │
│  │  │  │  │  │   Tab Content (dynamic):          │   │  │   │   │   │
│  │  │  │  │  │   - TokensList                    │   │  │   │   │   │
│  │  │  │  │  │   - RoyaltiesList                 │   │  │   │   │   │
│  │  │  │  │  │   - SwapPanel                     │   │  │   │   │   │
│  │  │  │  │  │   - HistoryList                   │   │  │   │   │   │
│  │  │  │  │  └───────────────────────────────────┘   │  │   │   │   │
│  │  │  │  │                                          │  │   │   │   │
│  │  │  │  │  ┌───────────────────────────────────┐   │  │   │   │   │
│  │  │  │  │  │   Logout Button (Desktop only)    │   │  │   │   │   │
│  │  │  │  │  └───────────────────────────────────┘   │  │   │   │   │
│  │  │  │  └─────────────────────────────────────────┘  │   │   │   │
│  │  │  │                                               │   │   │   │
│  │  │  │  ┌───── MODALS (Portal) ─────┐                │   │   │   │
│  │  │  │  │  SendModal                 │                │   │   │   │
│  │  │  │  │  ReceiveModal              │                │   │   │   │
│  │  │  │  │  BankModal                 │                │   │   │   │
│  │  │  │  └────────────────────────────┘                │   │   │   │
│  │  │  │                                               │   │   │   │
│  │  │  └──────────────────────────────────────────────┘   │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Architecture

### Primary Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         User Connects Wallet                      │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Particle Network ConnectKit                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  - Handles social login (Email, Google, Twitter)           │  │
│  │  - Handles Web3 wallets (MetaMask, WalletConnect)          │  │
│  │  - Returns EOA address + provider                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                   ParticleNetworkContext                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  1. Creates UniversalAccount instance                       │  │
│  │  2. Fetches smart account addresses (EVM + Solana)          │  │
│  │  3. Fetches primary assets (cross-chain balances)           │  │
│  │  4. Exposes: account, library, universalAccount, etc.       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    WalletDataContext                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Aggregates data from multiple sources:                     │  │
│  │                                                              │  │
│  │  1. PRIMARY ASSETS (from ParticleNetworkContext)            │  │
│  │     └── universalAccount.getPrimaryAssets()                 │  │
│  │         Returns: USDC, USDT, ETH, BTC, SOL, BNB balances    │  │
│  │                                                              │  │
│  │  2. NON-PRIMARY TOKENS (from Particle Enhanced RPC)         │  │
│  │     └── fetchMultiChainParticleTokens(smartAccountAddress)  │  │
│  │         + LI.FI enrichment for metadata                     │  │
│  │         Returns: UNI, COMP, LINK, etc. with USD values      │  │
│  │                                                              │  │
│  │  3. ASSETS & CHANNELS (from RTK Query)                      │  │
│  │     └── useFetchMyRoyaltyItemsQuery()                       │  │
│  │         Returns: NFTs with unclaimed royalties              │  │
│  │                                                              │  │
│  │  COMPUTED VALUES:                                           │  │
│  │  - totalBalanceUSD = primary + nonPrimary                   │  │
│  │  - totalUnclaimedRewards                                    │  │
│  │  - notificationCounts                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    UI Components Consume Data                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AccountSidebarHeader → displays totalBalanceUSD           │  │
│  │  TokensList → displays allTokens (primary + non-primary)   │  │
│  │  SendModal → uses availableTokens for dropdown             │  │
│  │  HistoryList → fetches via useTransactionHistory           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Transaction Flow (Send)

```
┌──────────────────────────────────────────────────────────────────┐
│ User fills SendModal form:                                       │
│   - Amount: "10.5"                                               │
│   - Token: "USDC"                                                │
│   - Network: "Base"                                              │
│   - Recipient: "0x..."                                           │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ Form Validation (Formik + Yup):                                  │
│   - Amount > 0 && Amount <= balance                              │
│   - Valid address (EVM or Solana)                                │
│   - Network supports token                                       │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ Fee Estimation (debounced 800ms):                                │
│   - universalAccount.createTransferTransaction()                 │
│   - Returns feeQuotes with breakdown:                            │
│     - gasFeeUSD                                                  │
│     - serviceFeeUSD                                              │
│     - lpFeeUSD                                                   │
│     - totalFeeUSD                                                │
└──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ User clicks "Send":                                              │
│   1. Determine chainId and tokenAddress based on:                │
│      - Primary token: use network's chainId + PARTICLE_CURRENCY_MAP│
│      - Non-primary: use token's specific chainId + address       │
│   2. Create transaction payload:                                 │
│      { token: { chainId, address }, amount, receiver }           │
│   3. universalAccount.createTransferTransaction(payload)         │
│   4. broadcastTransaction(transaction)                           │
│   5. Show success notification                                   │
│   6. refreshBalances()                                           │
│   7. Close modal                                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Core Components Analysis

### 5.1 Main Entry (`index.tsx`)

**Purpose:** Root component that manages drawer state and renders all sub-components

**Key Features:**
- Profile avatar as trigger button
- Hover-to-open on desktop (10px right edge detection)
- Mobile bottom-sheet variant (95% height)
- Context provider wrapping hierarchy
- Modal management

**Critical Code Patterns:**

```typescript
// Hover detection for right edge (desktop)
React.useEffect(() => {
  if (isMobile) return;
  
  const handleMouseMove = (e: MouseEvent) => {
    const screenWidth = window.innerWidth;
    const rightEdgeThreshold = 10;
    const isNearRightEdge = e.clientX >= (screenWidth - rightEdgeThreshold);
    
    if (isNearRightEdge && !state.open) {
      setHoverTriggerActive(true);
      setTimeout(() => handleOpen(), 100);
    }
  };
  
  document.addEventListener('mousemove', handleMouseMove);
  return () => document.removeEventListener('mousemove', handleMouseMove);
}, [state.open, isMobile]);
```

**Provider Hierarchy:**
```tsx
<AccountSidebarTabsProvider>
  <BalanceRefreshProvider>
    <WalletDataProvider isOpen={state.open}>
      {/* Content */}
    </WalletDataProvider>
  </BalanceRefreshProvider>
</AccountSidebarTabsProvider>
```

### 5.2 AccountSidebarHeader

**Purpose:** Display profile banner, avatar, name, and total balance

**Data Sources:**
- `useProfile()` - Profile data (alias, image, banner)
- `useParticleNetwork()` - Account address, primary assets
- `useNonPrimaryTokens()` - Non-primary token balances
- `useBalanceRefresh()` - Refresh functionality

**Balance Calculation:**
```typescript
const primaryTotalUSD = Number(primaryAssets?.totalAmountInUSD || 0);
const nonPrimaryTotalUSD = nonPrimaryTokens.reduce(
  (sum, token) => sum + token.balanceInUSD, 0
);
const totalBalance = primaryTotalUSD + nonPrimaryTotalUSD;
```

### 5.3 AccountSidebarTabs

**Purpose:** Tab navigation between Tokens, Royalties, Swap, History

**Tab Configuration:**
```typescript
const renderTabContent = useCallback(() => {
  switch (selectedTab) {
    case 0: return <TokensList />;
    case 1: return <RoyaltiesList />;
    case 2: return <SwapPanel />;
    case 3: return <HistoryList />;
    default: return <TokensList />;
  }
}, [selectedTab]);
```

---

## 6. Send Modal Deep Dive

### Component Structure

```
SendModal (1122 lines)
├── StyledSendModal (Dialog wrapper)
│   ├── DialogTitle
│   │   ├── "Send crypto" title
│   │   ├── Help button
│   │   └── Close button
│   │
│   └── DialogContent
│       └── Formik (form wrapper)
│           └── SendModalInnerForm
│               ├── SendAmountContainer
│               │   ├── Amount input (48px font)
│               │   ├── Error message
│               │   └── USD conversion display
│               │
│               ├── SendTokenSelector
│               │   ├── Token icon
│               │   ├── Token symbol + balance
│               │   ├── Max button
│               │   ├── Network selector (dropdown)
│               │   └── Token dropdown (searchable)
│               │
│               ├── SendInputField
│               │   ├── "To" label
│               │   ├── Recipient input
│               │   └── Error message
│               │
│               ├── Fee Display Section
│               │   ├── Network fee (expandable)
│               │   ├── Fee breakdown (gas/service/LP)
│               │   ├── Free fee badges
│               │   └── High fee warning
│               │
│               └── Send Button
```

### Form Validation Schema

```typescript
const createValidationSchema = (availableTokens) => Yup.object().shape({
  sendAmount: Yup.string()
    .required('Amount is required')
    .test('valid-number', 'Invalid amount', (value) => {
      const num = parseFloat(value || '');
      return !Number.isNaN(num) && num > 0;
    })
    .test('sufficient-balance', 'Insufficient balance', function(value) {
      const { selectedToken } = this.options.context;
      const tokenData = availableTokens.find(t => t.symbol === selectedToken);
      const maxAmount = tokenData?.amount || 0;
      return parseFloat(value || '') <= maxAmount;
    })
    .test('min-amount', 'Amount too small', (value) => {
      return parseFloat(value || '') >= 0.000001;
    }),
  
  recipientAddress: Yup.string()
    .required('Recipient address is required')
    .test('valid-address', 'Invalid address format', function(value) {
      const { selectedNetwork } = this.options.context;
      if (selectedNetwork === 'Solana') {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
      }
      return isAddress(value); // EVM validation
    }),
  
  selectedToken: Yup.string().required('Token is required'),
  selectedNetwork: Yup.string().required('Network is required'),
});
```

### Fee Estimation Logic

```typescript
const estimateFeeForTransaction = async (
  sendAmount, recipientAddress, selectedNetwork, selectedToken
) => {
  // 1. Determine token type (primary vs non-primary)
  const tokenData = availableTokens.find(t => t.symbol === selectedToken);
  
  let chainId, tokenAddress;
  
  if (tokenData?.isPrimary) {
    // Primary: use selected network
    const networkData = AVAILABLE_NETWORKS.find(n => n.name === selectedNetwork);
    chainId = networkData.chainId;
    tokenAddress = PARTICLE_CURRENCY_MAP[selectedNetwork][selectedToken.toLowerCase()];
  } else {
    // Non-primary: use token's specific chain
    chainId = tokenData.chainId;
    tokenAddress = tokenData.address;
  }
  
  // 2. Create transfer transaction to get fee quote
  const transaction = await universalAccount.createTransferTransaction({
    token: { chainId, address: tokenAddress },
    amount: sendAmount,
    receiver: recipientAddress,
  });
  
  // 3. Extract fee from feeQuotes (hex values → decimal)
  const feeQuote = transaction.feeQuotes[0];
  const fees = feeQuote.fees.totals;
  
  const totalFeeUSD = Number(BigInt(fees.feeTokenAmountInUSD)) / 1e18;
  const gasFeeUSD = Number(BigInt(fees.gasFeeTokenAmountInUSD)) / 1e18;
  const serviceFeeUSD = Number(BigInt(fees.transactionServiceFeeTokenAmountInUSD)) / 1e18;
  const lpFeeUSD = Number(BigInt(fees.transactionLPFeeTokenAmountInUSD)) / 1e18;
  
  setFeeEstimate({ total, gas, service, lp, freeGasFee, freeServiceFee });
};
```

### Token/Network Selection Logic

```typescript
// When token changes:
const handleTokenSelect = (token) => {
  setFieldValue('selectedToken', token);
  
  const tokenData = availableTokens.find(t => t.symbol === token);
  
  if (tokenData?.isPrimary) {
    // Primary: allow network selection, prefer Base
    const networks = getAvailableNetworksForToken(token);
    const baseNetwork = networks.find(n => n.name === 'Base');
    setFieldValue('selectedNetwork', baseNetwork ? 'Base' : networks[0].name);
  } else {
    // Non-primary: lock to token's chain
    const network = AVAILABLE_NETWORKS.find(n => n.chainId === tokenData.chainId);
    setFieldValue('selectedNetwork', network.name);
  }
};
```

---

## 7. Receive Modal Deep Dive

### Component Structure

```
ReceiveModal (822 lines)
├── StyledReceiveModal
│   ├── DialogTitle
│   │   ├── "Receive crypto" title
│   │   ├── Help button + Close button
│   │   └── Supported tokens list (USDC, USDT, SOL, BTC, ETH, BNB)
│   │
│   └── DialogContent
│       ├── AddressRow (EVM) - with network selector
│       │   ├── EthereumGradientBorder (animated)
│       │   ├── Network dropdown (Base, Polygon, etc.)
│       │   ├── Address display (truncated)
│       │   ├── Copy button
│       │   └── QR code button
│       │
│       ├── AddressRow (Solana)
│       │   ├── SolanaGradientBorder (animated)
│       │   ├── "Solana" label
│       │   ├── Address display
│       │   ├── Copy button
│       │   └── QR code button
│       │
│       ├── "From an account" section
│       │   ├── Coinbase link
│       │   └── Binance link
│       │
│       └── Smart wallet external link
```

### QR Code Generation

```typescript
import { QRCode } from 'react-qrcode-logo';

<QRCode
  value={address}              // Wallet address
  size={240}                   // QR code size
  bgColor="transparent"        // Background
  fgColor={qrColor}            // Dark/light mode aware
  logoImage="/logo.png"        // Center logo
  logoWidth={50}
  logoHeight={50}
  qrStyle="dots"               // Dot style
/>
```

### Address Sources

```typescript
const { smartAccountInfo } = useParticleNetwork();

// EVM address (shared across all EVM chains)
const evmAddress = smartAccountInfo?.smartAccountAddress;

// Solana address (separate smart account)
const solanaAddress = smartAccountInfo?.solanaSmartAccountAddress;
```

### Animated Gradient Border

```typescript
const EthereumGradientBorder = styled(Box)(({ theme }) => ({
  borderRadius: '50%',
  padding: '2px',
  background: `linear-gradient(45deg, 
    #627eeb, #40E0D0, #627eeb, #20B2AA, #627eeb
  )`,
  backgroundSize: '300% 300%',
  animation: 'gradientShift 3s ease-in-out infinite',
  '@keyframes gradientShift': {
    '0%': { backgroundPosition: '0% 50%' },
    '50%': { backgroundPosition: '100% 50%' },
    '100%': { backgroundPosition: '0% 50%' },
  },
}));
```

---

## 8. Token Balance System

### Data Sources

#### 1. Primary Assets (Particle Universal Account)

```typescript
// From ParticleNetworkContext
const assets = await universalAccount.getPrimaryAssets();

// Response structure:
interface IAssetsResponse {
  totalAmountInUSD: string;
  assets: Array<{
    tokenType: string;     // "USDC", "ETH", etc.
    amount: number;        // Formatted balance
    amountInUSD: number;   // USD value
    price: number;         // Token price
    chainAggregation: Array<{
      token: { chainId: number; address: string };
      amount: string;
    }>;
  }>;
}
```

#### 2. Non-Primary Tokens (Particle Enhanced RPC + LI.FI)

```typescript
// Step 1: Fetch from Particle RPC
const balancesMap = await fetchMultiChainParticleTokens(walletAddress);

// Step 2: Enrich with LI.FI metadata
for (const [chainId, data] of balancesMap.entries()) {
  for (const token of data.tokens) {
    const lifiToken = await lifiTokenSource.getToken(token.address, chainId);
    
    enrichedTokens.push({
      symbol: token.symbol,
      name: token.name,
      balance: formatUnits(token.amount, token.decimals),
      balanceInUSD: parseFloat(lifiToken.priceUSD) * balanceNumber,
      chainId,
      address: token.address,
      logoURI: token.image || lifiToken.logoURI,
    });
  }
}
```

### Token Filtering & Sorting

```typescript
// In WalletDataContext
const allTokens = useMemo(() => {
  const combined = [
    ...primaryTokens.map(t => ({ type: 'primary', data: t })),
    ...nonPrimaryTokens.map(t => ({ type: 'non-primary', data: t })),
  ];
  
  // Sort by USD value (highest first)
  return combined.sort((a, b) => {
    const aValue = a.type === 'primary' ? a.data.amountInUSD : a.data.balanceInUSD;
    const bValue = b.type === 'primary' ? b.data.amountInUSD : b.data.balanceInUSD;
    return bValue - aValue;
  });
}, [primaryTokens, nonPrimaryTokens]);
```

### Token Display Component

```typescript
// TokensList.tsx
{allTokens.map((item) => {
  if (item.type === 'primary') {
    const asset = item.data;
    return (
      <TokenItem key={`primary-${asset.tokenType}`}>
        <TokenIcon sx={{ backgroundColor: getTokenBackgroundColor(asset.tokenType) }}>
          {getTokenIcon(asset.tokenType)}
        </TokenIcon>
        <TokenInfo>
          <Typography>{getTokenDisplayName(asset.tokenType)}</Typography>
          <Typography>{formatTokenAmount(asset.amount)} {asset.tokenType}</Typography>
        </TokenInfo>
        <TokenBalance>
          <Typography>${formatUSDValue(asset.amountInUSD)}</Typography>
          <Typography>{asset.percentage.toFixed(1)}%</Typography>
        </TokenBalance>
      </TokenItem>
    );
  }
  
  // Non-primary token rendering...
})}
```

---

## 9. Transaction History

### Hook: useTransactionHistory

```typescript
interface UseTransactionHistoryReturn {
  transactions: Transaction[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
  fetchTransactions: (pageNum: number, isLoadingMore?: boolean) => Promise<void>;
  loadNextPage: () => void;
}

const useTransactionHistory = ({
  universalAccount,
  account,
  transactionsPerPage = 20,
}) => {
  const fetchTransactions = async (pageNum, isLoadingMore = false) => {
    // Fetch from Particle API
    const txResponse = await universalAccount.getTransactions(
      pageNum,
      transactionsPerPage
    );
    
    const newTransactions = txResponse?.data || [];
    
    // Update hasMore flag
    if (newTransactions.length < transactionsPerPage) {
      setHasMore(false);
    }
    
    // Append or replace
    setTransactions(prev => 
      isLoadingMore ? [...prev, ...newTransactions] : newTransactions
    );
  };
  
  const loadNextPage = () => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTransactions(nextPage, true);
    }
  };
  
  return { transactions, loading, loadingMore, error, hasMore, fetchTransactions, loadNextPage };
};
```

### Transaction Interface

```typescript
interface Transaction {
  transactionId: string;
  tag: string;                    // Transaction type identifier
  createdAt: string;              // ISO timestamp
  targetToken: {
    name: string;
    symbol: string;
    image: string;
    type: string;
    price: number;
    chainId: number;
  };
  change: {
    amount: string;
    amountInUSD: string;
    from: string;
    to: string;
  };
  status: number;                 // Transaction status code
  fromChains: number[];
  toChains: number[];
}
```

### Infinite Scroll Implementation

```typescript
const useInfiniteScroll = ({
  onLoadMore,
  isLoading,
  hasMore,
  rootMargin = '100px',
  threshold = 0.1,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { rootMargin, threshold }
    );
    
    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }
    
    return () => observer.disconnect();
  }, [onLoadMore, isLoading, hasMore]);
  
  return sentinelRef;
};
```

---

## 10. Hooks Catalog

### State Management Hooks

| Hook | Purpose | Returns |
|------|---------|---------|
| `useAccountSidebar` | Sidebar open/close + modal states | `{ state, actions }` |
| `useWalletBalance` | Balance aggregation | `{ balance, isLoading, usdValue }` |
| `useAccountSidebarTabs` | Tab selection state | `{ selectedTab, setSelectedTab, renderTabContent }` |

### Data Fetching Hooks

| Hook | Purpose | Data Source |
|------|---------|-------------|
| `useNonPrimaryTokens` | Fetch ERC-20 balances | Particle RPC + LI.FI |
| `useTransactionHistory` | Paginated tx history | UA.getTransactions() |
| `useAvailableTokens` | Token list for dropdowns | Primary + non-primary |
| `useSwapEstimation` | Swap quotes | LI.FI SDK |
| `useAssetManagement` | NFT assets | RTK Query |

### Action Hooks

| Hook | Purpose | Actions |
|------|---------|---------|
| `useTransactionActions` | TX execution | `broadcastTransaction`, `openInExplorer` |
| `useSwapTransaction` | Swap execution | `executeSwap` |

### Utility Hooks

| Hook | Purpose |
|------|---------|
| `useInfiniteScroll` | Intersection Observer for pagination |
| `useTransactionType` | Detect tx type from tag |

---

## 11. Services & APIs

### Particle Enhanced RPC Service

**File:** `src/lib/particle-network/service.ts`

```typescript
const PARTICLE_RPC_ENDPOINT = 'https://rpc.particle.network/evm-chain';

export async function fetchParticleTokensAndNFTs(
  address: string,
  chainId: number
): Promise<ParticleTokensAndNFTsResponse | null> {
  const auth = btoa(`${PARTICLE_PROJECT_ID}:${PARTICLE_SERVER_KEY}`);
  
  const response = await fetch(PARTICLE_RPC_ENDPOINT, {
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
  
  return (await response.json()).result;
}
```

### LI.FI Token Source

**File:** `AccountSidebar/services/lifiTokenSource.ts`

```typescript
export const lifiTokenSource = {
  async getToken(address: string, chainId: number): Promise<TokenSearchResult | null> {
    // Fetch token metadata from LI.FI API
    const response = await fetch(
      `https://li.quest/v1/token?chain=${chainId}&token=${address}`
    );
    return response.json();
  },
  
  async search(query: string, chainId?: number): Promise<TokenSearchResult[]> {
    // Search tokens by symbol or name
  },
  
  async getPopularTokens(chainId: number, limit = 10): Promise<TokenSearchResult[]> {
    // Get popular tokens for a chain
  },
};
```

### Chain ID Mappings

```typescript
// Particle to LI.FI chain ID mapping
export const PARTICLE_TO_LIFI_CHAIN_ID: Record<number, number> = {
  [CHAIN_ID.ETHEREUM_MAINNET]: 1,
  [CHAIN_ID.BSC_MAINNET]: 56,
  [CHAIN_ID.POLYGON_MAINNET]: 137,
  [CHAIN_ID.ARBITRUM_MAINNET_ONE]: 42161,
  [CHAIN_ID.OPTIMISM_MAINNET]: 10,
  [CHAIN_ID.BASE_MAINNET]: 8453,
  [CHAIN_ID.AVALANCHE_MAINNET]: 43114,
  // ...
};
```

---

## 12. State Management

### Context-Based State

#### WalletDataContext

```typescript
interface WalletDataContextValue {
  // Data sections
  primaryAssets: {
    data: IAssetsResponse;
    isLoading: boolean;
    error: string | null;
  };
  nonPrimaryTokens: {
    data: EnrichedToken[];
    isLoading: boolean;
    error: string | null;
  };
  assets: { data: AssetData[]; isLoading: boolean; error: string | null };
  channels: { data: ChannelData[]; isLoading: boolean; error: string | null };
  
  // Computed values
  computed: {
    totalBalanceUSD: number;
    totalUnclaimedRewards: number;
    notificationCounts: NotificationCounts;
  };
  
  // Actions
  actions: {
    refresh: () => Promise<void>;
    refreshPrimaryAssets: () => Promise<void>;
    refreshNonPrimaryTokens: () => Promise<void>;
    refreshRoyalties: () => Promise<void>;
  };
  
  // Meta
  isRefreshing: boolean;
  lastRefreshTime: Date | null;
}
```

#### AccountSidebarTabsContext

```typescript
interface TabsContextValue {
  selectedTab: number;
  setSelectedTab: (tab: number) => void;
  renderTabContent: () => React.ReactNode;
  handleCloseSidebar?: () => void;
}
```

### Local Component State

```typescript
// useAccountSidebar hook state
interface AccountSidebarState {
  open: boolean;
  sendModal: { open: boolean };
  receiveModal: { open: boolean };
  bankModal: { open: boolean };
  hoverTriggerActive: boolean;
}
```

### RTK Query Integration

```typescript
// For assets and royalties
const { data, isLoading, refetch } = useFetchMyRoyaltyItemsQuery({
  address: account,
  category: 'assets',
  filters: { limit: 50, offset: 0 },
}, { skip: !account || !isOpen });
```

---

## 13. Styling System

### Styled Components Pattern

```typescript
// AccountSidebarStyles.ts
export const StyledDrawer = styled(Drawer)(({ theme }) => ({
  zIndex: theme.zIndex.modal + 100,
  '& .MuiDrawer-paper': {
    width: 380,
    background: theme.palette.background.paper,
    boxShadow: theme.shadows[24],
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingBottom: 80,
    
    // Mobile responsive
    [theme.breakpoints.down('md')]: {
      width: '100%',
      height: '95%',
      maxHeight: '95vh',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomLeftRadius: 0,
      bottom: 0,
      top: 'auto',
    },
  },
}));
```

### Theme Integration

```typescript
// Using theme parameter in sx prop
sx={(theme) => ({
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.2),
  },
})}
```

### Z-Index Management

```typescript
// Critical z-index values
const Z_INDEX = {
  accountSidebar: 'theme.zIndex.modal + 100',    // Above bottom nav
  sendModal: 'theme.zIndex.modal + 200',         // Above sidebar
  tokenDropdown: 9999,                            // Above modal
  particlePopup: 10000,                           // Above everything
};
```

---

## 14. Integration Points

### Particle Network Integration

#### Provider Wrapping

```typescript
// App root
<ParticleNetworkProvider transactionHandler="ua">
  <App />
</ParticleNetworkProvider>
```

#### Context Usage

```typescript
const {
  account,              // Active address (smart account or EOA)
  library,              // Web3Provider
  universalAccount,     // UniversalAccount instance
  smartAccountInfo,     // { ownerAddress, smartAccountAddress, solanaSmartAccountAddress }
  primaryAssets,        // Cross-chain balances
  refreshPrimaryAssets, // Refresh function
  deactivate,           // Logout function
  transactionHandler,   // "ua" | "eoa" | "eip1193"
} = useParticleNetwork();
```

#### Transaction Execution

```typescript
// Create and broadcast transaction
const tx = await universalAccount.createTransferTransaction({
  token: { chainId, address: tokenAddress },
  amount: '10.5',
  receiver: '0x...',
});

const result = await broadcastTransaction(tx);
```

### Balance Refresh Coordination

```typescript
// BalanceRefreshContext provides global refresh trigger
const { refreshBalances, isRefreshing, lastRefreshTime } = useBalanceRefresh();

// Components listen to lastRefreshTime changes
useEffect(() => {
  if (lastRefreshTime && isOpen) {
    fetchData();
  }
}, [lastRefreshTime, isOpen]);
```

---

## 15. Dependencies

### Required NPM Packages

```json
{
  "dependencies": {
    // Particle Network
    "@particle-network/connectkit": "^2.1.3",
    "@particle-network/connector-core": "^2.1.0",
    "@particle-network/universal-account-sdk": "^1.0.7",
    
    // Ethereum/Web3
    "@ethersproject/address": "^5.4.0",
    "@ethersproject/bignumber": "^5.4.2",
    "@ethersproject/constants": "^5.6.0",
    "@ethersproject/contracts": "^5.6.1",
    "@ethersproject/providers": "^5.6.6",
    "@ethersproject/units": "^5.6.0",
    
    // UI
    "@mui/material": "^5.0.0",
    "@mui/icons-material": "^5.0.1",
    
    // Form Management
    "formik": "^2.2.9",
    "yup": "^0.32.9",
    
    // QR Code
    "react-qrcode-logo": "^3.0.0",
    
    // Notifications
    "notistack": "^3.0.2",
    
    // Token Swaps (optional)
    "@lifi/sdk": "^3.13.2",
    
    // State Management
    "@reduxjs/toolkit": "^2.9.0",
    "react-redux": "^9.1.2"
  }
}
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.0.0"
  }
}
```

---

## 16. Implementation Checklist

### Phase 1: Foundation (2-3 days)

- [ ] Create directory structure
- [ ] Set up TypeScript types (`types/index.ts`, `types/token.ts`, `types/particle.ts`)
- [ ] Create constants (`constants/chain.ts`, `constants/tokenRegistry.ts`)
- [ ] Implement `useAccountSidebar` hook
- [ ] Create `AccountSidebarStyles.ts`
- [ ] Create main `index.tsx` with drawer

### Phase 2: Context & Data (2-3 days)

- [ ] Implement `WalletDataContext`
- [ ] Implement `AccountSidebarTabsContext`
- [ ] Create `useNonPrimaryTokens` hook
- [ ] Set up Particle Enhanced RPC service
- [ ] Integrate LI.FI token source (optional)

### Phase 3: Header & Actions (1-2 days)

- [ ] Implement `AccountSidebarHeader`
- [ ] Implement `AccountSidebarActions`
- [ ] Implement `AccountSidebarTabs`
- [ ] Create token display utilities (`utils/tokenHelpers.tsx`)

### Phase 4: Token List (1-2 days)

- [ ] Implement `TokensList`
- [ ] Create `TokenStyles.ts`
- [ ] Add skeleton loading states
- [ ] Add empty state

### Phase 5: Send Modal (2-3 days)

- [ ] Create `ModalStyles.ts`
- [ ] Implement `SendModal` with Formik
- [ ] Add validation schema (Yup)
- [ ] Implement fee estimation
- [ ] Add token/network dropdowns
- [ ] Implement transaction execution

### Phase 6: Receive Modal (1-2 days)

- [ ] Implement `ReceiveModal`
- [ ] Add QR code generation
- [ ] Add network selector
- [ ] Add copy-to-clipboard functionality

### Phase 7: Transaction History (2-3 days)

- [ ] Implement `useTransactionHistory` hook
- [ ] Implement `useInfiniteScroll` hook
- [ ] Create `HistoryList` component
- [ ] Create `TransactionItem` component
- [ ] Add loading/error/empty states

### Phase 8: Testing & Polish (2-3 days)

- [ ] Write unit tests for hooks
- [ ] Write component tests
- [ ] Manual testing all flows
- [ ] Performance optimization
- [ ] Documentation

### Total Estimated Time: 14-21 days

---

## Appendix A: Key Code Snippets

### A1. Main Entry Point Pattern

```typescript
const AccountEntry = () => {
  const { active } = useParticleNetwork();
  
  if (!active) {
    return <ConnectorSelect />;  // Login button
  }
  
  return <MemoizedAccountSidebar />;
};

export default React.memo(AccountEntry);
```

### A2. Provider Hierarchy Pattern

```typescript
<AccountSidebarTabsProvider onCloseSidebar={handleClose}>
  <BalanceRefreshProvider>
    <WalletDataProvider isOpen={isOpen}>
      {children}
    </WalletDataProvider>
  </BalanceRefreshProvider>
</AccountSidebarTabsProvider>
```

### A3. Token Selection Handler Pattern

```typescript
const handleTokenSelect = useCallback((token: string) => {
  setFieldValue('selectedToken', token);
  
  const tokenData = availableTokens.find(t => t.symbol === token);
  
  if (tokenData?.isPrimary) {
    const networks = getAvailableNetworksForToken(token);
    setFieldValue('selectedNetwork', networks[0]?.name || 'Base');
  } else if (tokenData?.chainId) {
    const network = AVAILABLE_NETWORKS.find(n => n.chainId === tokenData.chainId);
    setFieldValue('selectedNetwork', network?.name);
  }
}, [availableTokens]);
```

---

**Document Version:** 1.0  
**Last Updated:** December 5, 2025  
**Source:** Elacity v4.1.1 (`base-network-updates` branch)

---

*This analysis was conducted by examining the actual source code in the Elacity repository. All code patterns, interfaces, and implementations reflect the production codebase.*
