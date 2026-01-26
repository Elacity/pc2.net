# Agent Account Architecture

## Overview

This document defines the architecture for integrating Coinbase AgentKit with PC2's wallet system to create AI-powered "Agent Accounts" that can execute blockchain transactions with user approval.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PC2 Wallet System (Current)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frontend (WalletService.js)                                           │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │   Universal Mode    │    │    Elastos Mode     │                    │
│  │   (walletMode)      │    │    (walletMode)     │                    │
│  ├─────────────────────┤    ├─────────────────────┤                    │
│  │ • Smart Account     │    │ • EOA Address       │                    │
│  │ • Particle iframe   │    │ • Direct RPC        │                    │
│  │ • Multi-chain       │    │ • Elastos only      │                    │
│  │ • Gas abstraction   │    │ • User signs direct │                    │
│  └─────────────────────┘    └─────────────────────┘                    │
│                                                                         │
│  Backend (ToolExecutor.ts)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ AI Tools (Read-Only)                                                ││
│  │ • get_wallet_info      - Returns addresses                          ││
│  │ • get_wallet_balance   - Returns ELA balances                       ││
│  │ • get_system_info      - Returns node stats                         ││
│  │                                                                     ││
│  │ NO TRANSACTION CAPABILITY                                           ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PC2 Agent Account Architecture                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Wallet Modes (Frontend)                       │  │
│  ├────────────────────────┬──────────────────────────────────────────┤  │
│  │                        │                                          │  │
│  │   EOA Account          │         Agent Account                    │  │
│  │   (Owner Key)          │    (Universal + AgentKit)                │  │
│  │                        │                                          │  │
│  │ • Direct control       │  • AI-powered operations                 │  │
│  │ • Manual signing       │  • Natural language commands             │  │
│  │ • Elastos chains       │  • User approves, AI executes            │  │
│  │ • Full custody         │  • Gas abstraction (Particle)            │  │
│  │ • No AI access         │  • Multi-chain (Base, ETH, etc.)         │  │
│  │                        │  • Session keys for autonomy             │  │
│  │                        │                                          │  │
│  └────────────────────────┴──────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   Backend AI Tools (Extended)                     │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  Existing (Read-Only)          │  New (Transaction Capable)       │  │
│  │  ─────────────────────         │  ─────────────────────────────   │  │
│  │  • get_wallet_info             │  • transfer_tokens               │  │
│  │  • get_wallet_balance          │  • swap_tokens                   │  │
│  │  • get_system_info             │  • get_multi_chain_balances      │  │
│  │                                │  • estimate_transaction_fee      │  │
│  │                                │  • approve_token_spending        │  │
│  │                                │  • get_transaction_status        │  │
│  │                                │                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Transaction Confirmation Flow                    │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │   1. User: "Send 50 USDC to bob.eth"                             │  │
│  │   2. AI: Parses intent, calls transfer_tokens tool                │  │
│  │   3. Backend: Creates transaction proposal, returns to AI         │  │
│  │   4. AI: Presents proposal to user in chat                        │  │
│  │   5. Frontend: Shows confirmation modal                           │  │
│  │   6. User: Approves transaction                                   │  │
│  │   7. Backend: Executes via ParticleWalletProvider                 │  │
│  │   8. AI: Reports success/failure                                  │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. ParticleWalletProvider

**Location**: `pc2-node/src/services/wallet/ParticleWalletProvider.ts`

Implements AgentKit's `WalletProvider` interface to bridge Particle Universal Account with AgentKit actions.

```typescript
interface ParticleWalletProvider {
  // Core wallet operations
  getAddress(): Promise<string>;
  getChainId(): Promise<number>;
  
  // Transaction operations
  sendTransaction(tx: TransactionRequest): Promise<string>;
  signMessage(message: string): Promise<string>;
  
  // Token operations
  getBalance(address?: string): Promise<bigint>;
  getTokenBalance(tokenAddress: string): Promise<bigint>;
  
  // Network support
  supportsNetwork(chainId: number): boolean;
}
```

### 2. AgentKit Integration

**Location**: `pc2-node/src/services/ai/tools/AgentKitTools.ts`

New tool definitions that wrap AgentKit actions:

```typescript
const agentKitTools: NormalizedTool[] = [
  {
    type: 'function',
    function: {
      name: 'transfer_tokens',
      description: 'Transfer tokens to another address. Returns a transaction proposal for user approval.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient address or ENS name' },
          amount: { type: 'string', description: 'Amount to send (e.g., "50")' },
          token: { type: 'string', description: 'Token symbol (e.g., "USDC", "ETH")' },
          chain: { type: 'string', description: 'Chain name (e.g., "base", "ethereum")' }
        },
        required: ['to', 'amount', 'token']
      }
    }
  },
  // ... more tools
];
```

### 3. Transaction Proposal System

**Location**: `pc2-node/src/services/wallet/TransactionProposal.ts`

Manages pending transactions that require user approval:

```typescript
interface TransactionProposal {
  id: string;
  type: 'transfer' | 'swap' | 'approve' | 'contract_call';
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'failed';
  
  // Transaction details
  from: string;
  to: string;
  value?: string;
  data?: string;
  chainId: number;
  
  // Human-readable summary
  summary: {
    action: string;        // "Send 50 USDC to bob.eth"
    estimatedGas: string;  // "$0.02"
    isSponsored: boolean;  // Gas abstraction
  };
  
  // Timestamps
  createdAt: number;
  expiresAt: number;
  
  // Result (after execution)
  txHash?: string;
  error?: string;
}
```

### 4. Session Key Management (Phase 3)

**Location**: `pc2-node/src/services/wallet/SessionKeyManager.ts`

Manages ERC-4337 session keys for autonomous agent actions:

```typescript
interface SessionKey {
  id: string;
  publicKey: string;
  
  // Permissions
  permissions: {
    maxSpendPerTx: string;      // "50 USDC"
    maxDailySpend: string;      // "200 USDC"
    allowedActions: string[];   // ["transfer", "swap"]
    allowedTokens: string[];    // ["USDC", "ETH"]
    allowedRecipients?: string[]; // Whitelist (optional)
  };
  
  // Lifecycle
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  
  // Usage tracking
  spentToday: string;
  lastUsed?: number;
}
```

## File Structure

```
pc2-node/src/
├── services/
│   ├── ai/
│   │   ├── tools/
│   │   │   ├── AgentKitTools.ts      # NEW: AgentKit tool definitions
│   │   │   ├── AgentKitExecutor.ts   # NEW: AgentKit tool execution
│   │   │   ├── WalletTools.ts        # EXISTING: Read-only wallet tools
│   │   │   ├── FilesystemTools.ts    # EXISTING
│   │   │   └── ToolExecutor.ts       # EXTEND: Add AgentKit tool routing
│   │   └── ...
│   └── wallet/
│       ├── ParticleWalletProvider.ts # NEW: AgentKit wallet adapter
│       ├── TransactionProposal.ts    # NEW: Pending tx management
│       ├── SessionKeyManager.ts      # NEW: Session key management (Phase 3)
│       └── index.ts                  # NEW: Wallet service exports
├── api/
│   ├── wallet-agent.ts               # NEW: API routes for tx approval
│   └── ...
└── types/
    └── wallet-agent.ts               # NEW: AgentKit-related types
```

## API Endpoints

### Transaction Approval

```
POST /api/wallet-agent/propose
  Request:  { type, to, amount, token, chain }
  Response: { proposalId, summary, expiresAt }

POST /api/wallet-agent/approve/:proposalId
  Request:  { signature? } (optional for session key txs)
  Response: { txHash, status }

POST /api/wallet-agent/reject/:proposalId
  Response: { success }

GET /api/wallet-agent/pending
  Response: { proposals: TransactionProposal[] }
```

### Session Keys (Phase 3)

```
POST /api/wallet-agent/session/create
  Request:  { permissions, expiresIn }
  Response: { sessionKeyId, publicKey }

DELETE /api/wallet-agent/session/:id
  Response: { success }

GET /api/wallet-agent/session/list
  Response: { sessions: SessionKey[] }
```

## WebSocket Events

```typescript
// Transaction proposal created (backend → frontend)
'wallet-agent:proposal' → { proposal: TransactionProposal }

// Transaction executed (backend → frontend)
'wallet-agent:executed' → { proposalId, txHash, status }

// Session key usage (backend → frontend)
'wallet-agent:session-used' → { sessionKeyId, action, spentToday }
```

## Security Considerations

### 1. Transaction Approval Required

All transactions require explicit user approval unless:
- A valid session key covers the action
- The action is within session key limits

### 2. Rate Limiting

- Max 10 pending proposals per user
- Proposals expire after 5 minutes
- Session key actions rate limited to 100/hour

### 3. Audit Logging

All wallet operations are logged:

```typescript
interface WalletAuditLog {
  timestamp: number;
  action: string;
  proposalId?: string;
  sessionKeyId?: string;
  success: boolean;
  details: any;
}
```

### 4. Amount Validation

- Maximum single transaction: $10,000 (configurable)
- Daily limit: $50,000 (configurable)
- Session key limits enforced on-chain

## Implementation Phases

### Phase 1: Agent Account Foundation (Current)
1. ✅ Design Agent Account architecture
2. 🔲 Create ParticleWalletProvider
3. 🔲 Add transfer_tokens tool
4. 🔲 Build transaction proposal system
5. 🔲 Frontend confirmation modal

### Phase 2: Intelligent Multi-Chain
6. 🔲 Multi-chain balance aggregation
7. 🔲 Cross-chain path optimization
8. 🔲 DEX swap integration
9. 🔲 Transaction simulation

### Phase 3: Session Keys & Autonomy
10. 🔲 Session key implementation
11. 🔲 Session key UI
12. 🔲 Spending limits enforcement
13. 🔲 Action whitelist/blacklist

### Phase 4: Elacity Integration
14. 🔲 Elacity SDK integration
15. 🔲 Capsule creation tools
16. 🔲 Trading/negotiation tools
17. 🔲 Royalty management

## Dependencies

- `@coinbase/agentkit` - AgentKit core
- `@particle-network/aa` - Particle Account Abstraction
- `viem` - Ethereum utilities
- `zod` - Schema validation

## Next Steps

1. **Implement ParticleWalletProvider** - Bridge Particle to AgentKit
2. **Add transfer_tokens tool** - First transaction-capable tool
3. **Build confirmation modal** - Frontend approval UI
4. **Test end-to-end flow** - User says "send" → tx executes
