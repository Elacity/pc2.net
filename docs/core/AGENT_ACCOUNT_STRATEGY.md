# Agent Account Strategy: AgentKit Integration for PC2

> Strategic analysis and implementation plan for integrating Coinbase AgentKit with PC2's Universal Smart Wallet to create AI-powered "Agent Accounts" on the sovereign cloud.

**Status**: Planning  
**Created**: 2026-01-25  
**Last Updated**: 2026-01-25

---

## North Star: Robots as Customers

> *"Autonomous AI agents negotiate, price, and trade your assets 24/7. Your inventory becomes machine-readable capital for the automated workforce."* — Elacity Labs

### The Vision

PC2 + Agent Account + Elacity = **Your Personal AI That Creates, Trades, and Earns**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THE COMPLETE VISION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     1. CREATE VALUE                                 │   │
│  │                                                                     │   │
│  │   User drags files to PC2 (music, video, data, software, AI model) │   │
│  │                              ↓                                      │   │
│  │   Agent understands content (via local Ollama)                      │   │
│  │                              ↓                                      │   │
│  │   Agent helps package into Elacity Capsule                          │   │
│  │   • Encrypt content                                                 │   │
│  │   • Define access rights (buy, rent, subscribe)                     │   │
│  │   • Set royalty terms (95% to creator)                              │   │
│  │   • Mint Access Tokens + Royalty Tokens                             │   │
│  │                              ↓                                      │   │
│  │   Capsule stored on IPFS (via PC2 node)                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     2. TRADE VALUE                                  │   │
│  │                                                                     │   │
│  │   Agent lists on Elacity Exchange                                   │   │
│  │                              ↓                                      │   │
│  │   Agent operates 24/7:                                              │   │
│  │   • Monitors market prices                                          │   │
│  │   • Negotiates with buyer agents                                    │   │
│  │   • Adjusts pricing dynamically                                     │   │
│  │   • Executes trades autonomously (within limits)                    │   │
│  │                              ↓                                      │   │
│  │   Buyer (human or AI agent) purchases access                        │   │
│  │   • Instant payment via smart contract                              │   │
│  │   • Royalties distributed automatically                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     3. CONSUME VALUE                                │   │
│  │                                                                     │   │
│  │   Buyer's Agent downloads capsule to THEIR PC2 node (via IPFS)      │   │
│  │                              ↓                                      │   │
│  │   dDRM Runtime verifies access rights on-chain                      │   │
│  │                              ↓                                      │   │
│  │   Content decrypts locally on buyer's sovereign hardware            │   │
│  │                              ↓                                      │   │
│  │   Buyer can resell (with royalties flowing back to creator)         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     4. AGGREGATE INTELLIGENCE (Future)              │   │
│  │                                                                     │   │
│  │   Agent with many capsules becomes a knowledge aggregator           │   │
│  │   • Cross-references content                                        │   │
│  │   • Provides intelligence-as-a-service                              │   │
│  │   • Sells insights (not raw data)                                   │   │
│  │   • AI-to-AI knowledge marketplace                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why AgentKit is Essential

| Capability | Why Needed | AgentKit Provides |
|------------|------------|-------------------|
| **Minting Capsules** | Package and publish to Elacity | Smart contract interactions |
| **Trading Assets** | Buy/sell access tokens | ERC-721/1155 operations |
| **Collecting Royalties** | Claim and manage earnings | Wallet + token transfers |
| **Dynamic Pricing** | Adjust prices based on demand | Read market + execute txs |
| **Agent-to-Agent Commerce** | Negotiate with buyer agents | Autonomous tx execution |
| **Cross-Chain Settlement** | Trade on any chain | Multi-chain wallet support |
| **Streaming Revenue** | Subscription income | Superfluid integration |

### The Token Stack

```
┌─────────────────────────────────────────────────────────────┐
│                   ELACITY TOKEN SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │ OWNERSHIP TOKEN │  ERC-721                               │
│  │ (1 per capsule) │  • Proves you created the capsule      │
│  │                 │  • Receives royalty distributions      │
│  └─────────────────┘                                        │
│                                                             │
│  ┌─────────────────┐                                        │
│  │  ACCESS TOKEN   │  ERC-1155                              │
│  │ (scarce supply) │  • Grants right to decrypt content     │
│  │                 │  • Tradeable on secondary market       │
│  │                 │  • Creator sets supply + price         │
│  └─────────────────┘                                        │
│                                                             │
│  ┌─────────────────┐                                        │
│  │  ROYALTY TOKEN  │  ERC-20/1155                           │
│  │ (fractional)    │  • % of future revenue                 │
│  │                 │  • Tradeable (sell future earnings)    │
│  │                 │  • Auto-distributes on each sale       │
│  └─────────────────┘                                        │
│                                                             │
│  ┌─────────────────┐                                        │
│  │ DISTRIBUTION    │  ERC-1155                              │
│  │ RIGHTS TOKEN    │  • Right to resell                     │
│  │                 │  • Affiliate commissions               │
│  │                 │  • Territory/platform rights           │
│  └─────────────────┘                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Agent Actions for Elacity

These are the NEW tools the AI agent needs to interact with Elacity:

| Tool | Purpose | AgentKit Action |
|------|---------|-----------------|
| `elacity_create_capsule` | Package content into encrypted capsule | Custom action provider |
| `elacity_set_pricing` | Define access token price/supply | Smart contract call |
| `elacity_mint_access` | Mint access tokens for sale | ERC-1155 mint |
| `elacity_list_asset` | List on Elacity marketplace | Contract interaction |
| `elacity_update_price` | Adjust pricing dynamically | Contract interaction |
| `elacity_accept_offer` | Accept a buyer's offer | ERC-1155 transfer |
| `elacity_claim_royalties` | Withdraw accumulated royalties | Token transfer |
| `elacity_check_market` | Get market data for asset | Read contract/API |
| `elacity_negotiate` | Counter-offer to buyer agent | Agent-to-agent msg |
| `elacity_download_capsule` | Download purchased capsule | IPFS fetch |
| `elacity_verify_access` | Check if user owns access token | Contract read |
| `elacity_decrypt_content` | Decrypt with dDRM runtime | Local WASM execution |

### The User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER STORY: ALICE THE CREATOR                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Alice opens her PC2 node and drags her new music album to the desktop  │
│                                                                             │
│  2. Her AI Agent says:                                                      │
│     "I see you've added 12 audio files (~45 minutes of music).              │
│      Would you like me to package this as an Elacity Capsule?               │
│      I can set it up for:                                                   │
│      • 100 Access Tokens at $5 each (you keep 95%)                          │
│      • Royalty tokens: 10% to you on every resale                           │
│      Want me to proceed?"                                                   │
│                                                                             │
│  3. Alice: "Yes, but price it at $8 and only 50 tokens"                     │
│                                                                             │
│  4. Agent: "Done. Your capsule 'Summer Vibes EP' is now live on Elacity.    │
│             I'll monitor the market and notify you of offers.               │
│             Want me to auto-accept offers above $7?"                        │
│                                                                             │
│  5. Alice: "Yes, auto-accept anything $7 or above"                          │
│                                                                             │
│  6. [3 days later - Alice is sleeping]                                      │
│     Buyer Agent: "Offer: $7.50 for 1 Access Token"                          │
│     Alice's Agent: "Accepted. Transaction complete."                        │
│     → $7.12 deposited to Alice's Agent Account (95% after fees)             │
│                                                                             │
│  7. Alice wakes up:                                                         │
│     Agent: "Good morning! You sold 3 access tokens while you slept.         │
│             Total earnings: $21.36. Current inventory: 47/50 tokens."       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Changes Everything

| Traditional Model | Elacity + PC2 + Agent |
|-------------------|----------------------|
| Upload to YouTube, Spotify | Store on YOUR node |
| Platform takes 30-55% | You keep 95% |
| Monthly payouts | Instant settlement |
| Platform controls access | YOU control access |
| Can't resell digital goods | Buyers can resell (you earn royalties) |
| No price control | Dynamic AI pricing |
| You work 9-5 | Agent works 24/7 |
| Human negotiations | Agent-to-agent commerce |
| Centralized servers | Decentralized IPFS |
| Platform can ban you | Censorship resistant |

### The Bigger Picture

This is the **Access Economy** powered by **Autonomous Agents**:

1. **Creators** package value into capsules
2. **Agents** trade capsules 24/7
3. **Buyers** (human or AI) acquire access rights
4. **Rights flow** through smart contracts
5. **Revenue flows** instantly to creators
6. **Resales** generate ongoing royalties
7. **Intelligence aggregates** as agents collect capsules

**PC2 is the sovereign infrastructure. Agent Account is the financial brain. Elacity is the marketplace.**

Together: **Your Personal AI Business**

---

## API/SDK Architecture Map

### Current State: What the AI Uses Today

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PC2 AI TOOL SYSTEM (Current)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      FRONTEND (Browser)                             │   │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐   │   │
│  │  │ UIAIChat.js   │───▶│ AIToolService │───▶│ Puter SDK Apps    │   │   │
│  │  │ (Chat UI)     │    │ (Tool Router) │    │ (via postMessage) │   │   │
│  │  └───────────────┘    └───────┬───────┘    └───────────────────┘   │   │
│  │                               │                                     │   │
│  │                   ┌───────────┴───────────┐                        │   │
│  │                   ▼                       ▼                        │   │
│  │           Backend Tools              App Tools                     │   │
│  │           (via /drivers/call)        (via IPC)                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      BACKEND (PC2 Node)                             │   │
│  │                                                                     │   │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐   │   │
│  │  │ AIChatService │───▶│ ToolExecutor  │───▶│ FilesystemManager │   │   │
│  │  │ (AI Provider) │    │ (21 Tools)    │    │ (IPFS Storage)    │   │   │
│  │  └───────────────┘    └───────────────┘    └───────────────────┘   │   │
│  │                               │                                     │   │
│  │                               ▼                                     │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │                    CURRENT TOOLS (21)                         │ │   │
│  │  ├───────────────────────────────────────────────────────────────┤ │   │
│  │  │ FILESYSTEM (15)          WALLET (3)         SETTINGS (3)      │ │   │
│  │  │ • create_folder          • get_wallet_info  • get_settings    │ │   │
│  │  │ • list_files             • get_wallet_balance • update_setting│ │   │
│  │  │ • read_file              • get_system_info  • get_file_info   │ │   │
│  │  │ • write_file                                                  │ │   │
│  │  │ • delete_file            READ-ONLY!                           │ │   │
│  │  │ • move_file              No transactions                      │ │   │
│  │  │ • copy_file              No transfers                         │ │   │
│  │  │ • stat, rename           No DeFi                              │ │   │
│  │  │ • grep_file, etc.                                             │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Current Tool Registry

| Category | Tool Name | What It Does | API Used |
|----------|-----------|--------------|----------|
| **Filesystem** | `create_folder` | Create directories | `FilesystemManager.createDirectory()` |
| | `list_files` | List directory contents | `FilesystemManager.listDirectory()` |
| | `read_file` | Read file content | `FilesystemManager.readFile()` |
| | `write_file` | Create/overwrite files | `FilesystemManager.writeFile()` |
| | `delete_file` | Delete files/folders | `FilesystemManager.deleteFile()` |
| | `move_file` | Move/rename files | `FilesystemManager.moveFile()` |
| | `copy_file` | Copy files | `FilesystemManager.copyFile()` |
| | `stat` | Get file metadata | `FilesystemManager.stat()` |
| | `rename` | Rename files | `FilesystemManager.rename()` |
| | `grep_file` | Search patterns in files | Direct file read + regex |
| | `read_file_lines` | Read specific lines | Direct file read |
| | `count_file` | Count words/lines/chars | Direct file read |
| | `get_filename` | Extract filename | String parsing |
| | `get_directory` | Extract directory path | String parsing |
| | `touch_file` | Create empty/update timestamp | `FilesystemManager.touch()` |
| **Wallet** | `get_wallet_info` | Get EOA + Smart Account addresses | Direct property access |
| | `get_wallet_balance` | Get ELA/token balances | Elastos RPC `eth_getBalance` |
| | `get_system_info` | CPU, memory, storage stats | Node.js `os` module |
| **Settings** | `get_settings` | Read user settings | `db.getSetting()` |
| | `update_setting` | Modify allowed settings | `db.setSetting()` |
| | `get_file_info` | File metadata + IPFS CID | `FilesystemManager.stat()` |

---

### Future State: Agent Account APIs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT ACCOUNT SYSTEM (Future)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      FRONTEND (Browser)                             │   │
│  │                                                                     │   │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐   │   │
│  │  │ UIAIChat.js   │───▶│ AIToolService │───▶│ Puter SDK Apps    │   │   │
│  │  └───────────────┘    └───────┬───────┘    └───────────────────┘   │   │
│  │                               │                                     │   │
│  │  ┌───────────────┐    ┌───────┴───────┐    ┌───────────────────┐   │   │
│  │  │ Confirmation  │◀───│ Transaction   │───▶│ WalletService     │   │   │
│  │  │ Modal (NEW)   │    │ Presenter     │    │ (Particle SDK)    │   │   │
│  │  └───────────────┘    └───────────────┘    └───────────────────┘   │   │
│  │         │                                           │               │   │
│  │         ▼                                           ▼               │   │
│  │  [Approve/Reject]                          Particle Universal       │   │
│  │                                            Account (iframe)         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                               │                                             │
│                               ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      BACKEND (PC2 Node)                             │   │
│  │                                                                     │   │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────┐   │   │
│  │  │ AIChatService │───▶│ ToolExecutor  │───▶│ AgentKitBridge    │   │   │
│  │  │               │    │ (Extended)    │    │ (NEW)             │   │   │
│  │  └───────────────┘    └───────────────┘    └─────────┬─────────┘   │   │
│  │                                                       │             │   │
│  │                              ┌────────────────────────┼─────────┐   │   │
│  │                              ▼                        ▼         │   │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │   │
│  │  │                    NEW TOOLS (~30+)                       │ │   │   │
│  │  ├───────────────────────────────────────────────────────────┤ │   │   │
│  │  │ AGENTKIT (NEW)           SESSION (NEW)      MEMORY (NEW)  │ │   │   │
│  │  │ • transfer_tokens        • create_session   • remember    │ │   │   │
│  │  │ • swap_tokens           • revoke_session   • recall       │ │   │   │
│  │  │ • bridge_tokens         • list_sessions    • forget       │ │   │   │
│  │  │ • get_balances          • check_limits     • preferences  │ │   │   │
│  │  │ • approve_token                                           │ │   │   │
│  │  │ • estimate_gas          STREAMING (NEW)    PROACTIVE(NEW) │ │   │   │
│  │  │ • get_token_price       • create_stream    • set_alert    │ │   │   │
│  │  │ • get_portfolio         • update_stream    • get_alerts   │ │   │   │
│  │  │ • defi_deposit          • cancel_stream    • clear_alert  │ │   │   │
│  │  │ • defi_withdraw         • list_streams                    │ │   │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │   │
│  │                                                                 │   │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │   │
│  │  │                 EXTERNAL INTEGRATIONS                     │ │   │   │
│  │  ├───────────────────────────────────────────────────────────┤ │   │   │
│  │  │                                                           │ │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │ │   │   │
│  │  │  │ AgentKit    │  │ Particle    │  │ Superfluid      │   │ │   │   │
│  │  │  │ (Coinbase)  │  │ Universal   │  │ (Streaming)     │   │ │   │   │
│  │  │  │             │  │ Account SDK │  │                 │   │ │   │   │
│  │  │  │ 50+ Actions │  │ ERC-4337    │  │ create_flow     │   │ │   │   │
│  │  │  │ ERC20, NFT  │  │ Gas Abstrac │  │ update_flow     │   │ │   │   │
│  │  │  │ DeFi, DEX   │  │ Session Keys│  │ delete_flow     │   │ │   │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────┘   │ │   │   │
│  │  │                                                           │ │   │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │   │
│  └─────────────────────────────────────────────────────────────────┘   │   │
│                                                                         │   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MCP SERVER (External Agents)                   │   │
│  │  Exposes all tools to: Claude Desktop, Cursor, custom agents        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### New APIs/SDKs Required

#### 1. ParticleWalletProvider (NEW - Bridge to AgentKit)

**Purpose**: Implement AgentKit's `WalletProvider` interface using Particle Universal Account

**Location**: `packages/agentkit-particle/src/particleWalletProvider.ts`

```typescript
// Interface to implement (from @coinbase/agentkit)
interface WalletProvider {
  getAddress(): Promise<string>;
  getNetwork(): Network;
  getBalance(): Promise<bigint>;
  nativeTransfer(to: string, amount: bigint): Promise<string>;
  getName(): string;
}

// Our implementation
class ParticleWalletProvider extends EvmWalletProvider {
  constructor(particleUA: UniversalAccount);
  
  // Calls Particle SDK
  async getAddress(): Promise<string>;
  async nativeTransfer(to: string, amount: bigint): Promise<string>;
  async signMessage(message: string): Promise<string>;
  async sendTransaction(tx: Transaction): Promise<string>;
}
```

**Connects To**: 
- Particle Universal Account SDK (frontend)
- AgentKit action providers

---

#### 2. AgentKitBridge (NEW - Backend Integration)

**Purpose**: Bridge between PC2 ToolExecutor and AgentKit actions

**Location**: `pc2-node/src/services/ai/tools/AgentKitBridge.ts`

```typescript
class AgentKitBridge {
  private agentKit: AgentKit;
  
  constructor(walletProvider: ParticleWalletProvider) {
    this.agentKit = AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        erc20ActionProvider(),
        wethActionProvider(),
        // ... more providers
      ]
    });
  }
  
  // Convert AgentKit actions to PC2 tool format
  getTools(): NormalizedTool[] {
    return this.agentKit.getActions().map(action => ({
      type: 'function',
      function: {
        name: `agent_${action.name}`,
        description: action.description,
        parameters: zodToJsonSchema(action.schema)
      }
    }));
  }
  
  // Execute with user confirmation flow
  async execute(toolName: string, args: any): Promise<ToolResult> {
    // 1. Validate args
    // 2. Request user approval (via WebSocket)
    // 3. Wait for approval
    // 4. Execute via AgentKit
    // 5. Return result
  }
}
```

**Connects To**:
- AgentKit (`@coinbase/agentkit`)
- ToolExecutor (existing)
- WebSocket for approval flow

---

#### 3. Transaction Confirmation API (NEW)

**Purpose**: User approval flow for AI-proposed transactions

**Location**: `pc2-node/src/api/transactions.ts`

```typescript
// New API endpoints
POST /api/transactions/propose     // AI proposes a transaction
GET  /api/transactions/pending     // Get pending proposals
POST /api/transactions/approve/:id // User approves
POST /api/transactions/reject/:id  // User rejects
GET  /api/transactions/history     // Execution history

// WebSocket events
'transaction:proposed'   // Notify UI of new proposal
'transaction:approved'   // Notify backend of approval
'transaction:rejected'   // Notify backend of rejection
'transaction:executed'   // Notify UI of completion
```

**Frontend Component**: `src/gui/src/UI/TransactionConfirmModal.js`

```javascript
// Shows transaction details for approval
{
  action: "transfer_tokens",
  from: "0xYourAgent...",
  to: "0xRecipient...",
  amount: "50 USDC",
  network: "Base",
  estimatedGas: "$0.02",
  sponsoredGas: true
}

[Reject]  [Approve ✓]
```

---

#### 4. Session Key Management API (NEW)

**Purpose**: Create/revoke session keys for autonomous agent actions

**Location**: `pc2-node/src/api/sessions.ts`

```typescript
// New API endpoints
POST /api/sessions/create    // Create session key with limits
GET  /api/sessions           // List active sessions
DELETE /api/sessions/:id     // Revoke session
GET  /api/sessions/:id/usage // Check session spending

// Session configuration
interface SessionConfig {
  maxSpendPerTx: string;      // "50 USDC"
  maxDailySpend: string;      // "200 USDC"
  allowedActions: string[];   // ["transfer", "swap"]
  allowedTokens: string[];    // ["USDC", "ETH"]
  allowedRecipients?: string[]; // Whitelist (optional)
  expiresIn: string;          // "7 days"
}
```

**New Tools**:
- `create_session` - AI requests session key setup
- `check_session_limits` - AI checks remaining limits
- `revoke_session` - AI/user revokes session

---

#### 5. Personal Memory API (NEW)

**Purpose**: Persistent AI memory for preferences and context

**Location**: `pc2-node/src/api/memory.ts`

```typescript
// New API endpoints
POST /api/memory/remember    // Store memory
GET  /api/memory/recall      // Retrieve memories
DELETE /api/memory/forget    // Remove memory
GET  /api/memory/preferences // Get all preferences

// Memory structure
interface Memory {
  key: string;           // "contact:alice"
  value: any;            // "0x1234..."
  category: string;      // "contacts" | "preferences" | "financial"
  encrypted: boolean;    // Sensitive data
  createdAt: Date;
  lastAccessed: Date;
}

// Database table: ai_memory
CREATE TABLE ai_memory (
  id INTEGER PRIMARY KEY,
  wallet_address TEXT,
  key TEXT,
  value TEXT,
  category TEXT,
  encrypted INTEGER,
  created_at TEXT,
  last_accessed TEXT
);
```

**New Tools**:
- `remember` - Store information for later
- `recall` - Retrieve stored information
- `forget` - Delete stored information
- `get_preferences` - Get user preferences
- `update_preference` - Update a preference

---

#### 6. Streaming Payments API (NEW)

**Purpose**: Superfluid integration for continuous payments

**Location**: `pc2-node/src/api/streaming.ts`

```typescript
// Wraps Superfluid SDK
import { superfluidActionProvider } from '@coinbase/agentkit';

// New API endpoints
POST /api/streams/create    // Start streaming payment
PUT  /api/streams/:id       // Update flow rate
DELETE /api/streams/:id     // Cancel stream
GET  /api/streams           // List active streams
GET  /api/streams/incoming  // Streams paying you
GET  /api/streams/outgoing  // Streams you're paying
```

**New Tools**:
- `create_stream` - Start streaming payment
- `update_stream` - Modify flow rate
- `cancel_stream` - Stop streaming
- `list_streams` - Show active streams
- `get_stream_balance` - Real-time stream balance

---

#### 7. MCP Server (NEW)

**Purpose**: Expose PC2 wallet to external AI tools (Claude Desktop, Cursor)

**Location**: `pc2-node/src/mcp/server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk';
import { getMcpTools } from '@coinbase/agentkit-model-context-protocol';

// Exposes all AgentKit actions + PC2 tools via MCP
const server = new Server({
  name: 'pc2-agent-account',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
});

// Tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...agentKitTools, ...filesystemTools, ...memoryTools]
}));

// Tool execution (with approval flow)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Route to appropriate executor
  // Financial tools require approval
});
```

**Config for Claude Desktop**: `~/.config/claude/mcp.json`
```json
{
  "servers": {
    "pc2": {
      "command": "ssh",
      "args": ["user@my-pc2-node", "node", "/path/to/mcp-server.js"]
    }
  }
}
```

---

### Complete Tool Registry (Current + New)

| Category | Tool | Status | API/SDK |
|----------|------|--------|---------|
| **Filesystem** | 15 tools | ✅ Exists | `FilesystemManager` |
| **Wallet (Read)** | 3 tools | ✅ Exists | Elastos RPC |
| **Settings** | 3 tools | ✅ Exists | SQLite |
| **AgentKit - Wallet** | `agent_get_balance` | 🆕 New | AgentKit |
| | `agent_transfer` | 🆕 New | AgentKit + Particle |
| | `agent_get_address` | 🆕 New | AgentKit |
| **AgentKit - Tokens** | `agent_erc20_transfer` | 🆕 New | AgentKit |
| | `agent_erc20_approve` | 🆕 New | AgentKit |
| | `agent_erc20_balance` | 🆕 New | AgentKit |
| **AgentKit - DeFi** | `agent_swap` | 🆕 New | AgentKit (0x/Sushi) |
| | `agent_bridge` | 🆕 New | AgentKit (Across) |
| | `agent_wrap_eth` | 🆕 New | AgentKit (WETH) |
| **Session Keys** | `create_session` | 🆕 New | Particle/ZeroDev |
| | `revoke_session` | 🆕 New | Particle/ZeroDev |
| | `check_limits` | 🆕 New | Local DB |
| **Memory** | `remember` | 🆕 New | SQLite |
| | `recall` | 🆕 New | SQLite |
| | `forget` | 🆕 New | SQLite |
| | `get_preferences` | 🆕 New | SQLite |
| **Streaming** | `create_stream` | 🆕 New | Superfluid |
| | `update_stream` | 🆕 New | Superfluid |
| | `cancel_stream` | 🆕 New | Superfluid |
| **Proactive** | `set_alert` | 🆕 New | Local scheduler |
| | `get_alerts` | 🆕 New | Local scheduler |

| **Elacity** | `elacity_create_capsule` | 🆕 New | Elacity SDK |
| | `elacity_mint_access` | 🆕 New | ERC-1155 |
| | `elacity_list_asset` | 🆕 New | Elacity Contract |
| | `elacity_update_price` | 🆕 New | Elacity Contract |
| | `elacity_accept_offer` | 🆕 New | ERC-1155 Transfer |
| | `elacity_claim_royalties` | 🆕 New | Token Transfer |
| | `elacity_check_market` | 🆕 New | Elacity API |
| | `elacity_download_capsule` | 🆕 New | IPFS |
| | `elacity_decrypt_content` | 🆕 New | dDRM Runtime |

**Total**: 21 existing + ~35 new = **~56 tools**

---

### Integration Flow: How It All Connects

```
User: "Send 50 USDC to alice"
                │
                ▼
┌───────────────────────────────────┐
│         UIAIChat.js               │
│  Sends to /drivers/call           │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│         AIChatService             │
│  Includes AgentKit tools          │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│         AI Provider               │
│  (Ollama/OpenAI/Claude)           │
│                                   │
│  Returns:                         │
│  tool_call: agent_erc20_transfer  │
│  args: { to: "alice", ... }       │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│         ToolExecutor              │
│                                   │
│  case 'agent_erc20_transfer':     │
│    → AgentKitBridge.execute()     │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│         AgentKitBridge            │
│                                   │
│  1. Resolve "alice" → 0x...       │
│     (via Memory API)              │
│  2. Check session key limits      │
│  3. If within limits: auto-execute│
│     Else: request approval        │
└───────────────┬───────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────────┐
│ Auto-Execute  │ │ Request Approval  │
│ (Session Key) │ │ (WebSocket event) │
└───────┬───────┘ └─────────┬─────────┘
        │                   │
        │                   ▼
        │         ┌───────────────────┐
        │         │ TransactionModal  │
        │         │ User: [Approve]   │
        │         └─────────┬─────────┘
        │                   │
        └─────────┬─────────┘
                  ▼
┌───────────────────────────────────┐
│    ParticleWalletProvider         │
│                                   │
│    Calls Particle Universal SDK   │
│    → Transaction signed & sent    │
└───────────────┬───────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│         Blockchain                │
│    Transaction confirmed          │
└───────────────────────────────────┘
                │
                ▼
        "Sent 50 USDC to alice ✓"
```

---

## Implementation Checklist

### Phase 1: Agent Account Foundation
- [ ] Design Agent Account architecture (EOA + Universal/Agent Account wallet model)
- [ ] Create ParticleWalletProvider that implements AgentKit WalletProvider interface
- [ ] Integrate AgentKit actions as PC2 AI tools with user confirmation
- [ ] Build transaction confirmation modal UI

### Phase 2: Autonomy & Memory
- [ ] Implement session keys for autonomous agent actions with spending limits
- [ ] Build persistent AI memory system for personal context and preferences
- [ ] Implement spending limits, action whitelist, and audit logging

### Phase 3: Monetization & External Access
- [ ] Integrate Superfluid for node monetization and P2P commerce
- [ ] Create MCP server for PC2 nodes to expose wallet actions

### Phase 4: Elacity Integration (North Star)
- [ ] Create ElacityActionProvider for capsule operations
- [ ] Implement capsule creation workflow (encrypt, mint, list)
- [ ] Build market monitoring and dynamic pricing tools
- [ ] Enable agent-to-agent negotiation protocol
- [ ] Integrate dDRM runtime for content decryption
- [ ] Connect IPFS storage with capsule system

---

## Executive Summary

This analysis identifies **high-value opportunities** to integrate Coinbase AgentKit patterns and capabilities with PC2's existing infrastructure. The goal is to enable AI agents on PC2 nodes to perform on-chain actions autonomously using the user's Universal Smart Wallet.

**Key Insight**: The Universal Account becomes an "Agent Account" when paired with AI capabilities - creating a new paradigm where users talk to their wallet in natural language.

---

## Agent Account Architecture (NEW)

### The Dual-Account Model

```
┌─────────────────────────────────────────────────────────────┐
│                    PC2 Wallet System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   EOA Account       │    │      Agent Account          │ │
│  │   (Owner Key)       │    │  (Universal + AgentKit)     │ │
│  ├─────────────────────┤    ├─────────────────────────────┤ │
│  │ • Direct control    │    │ • AI-powered operations     │ │
│  │ • Manual signing    │    │ • Natural language commands │ │
│  │ • Elastos chains    │    │ • User approves, AI executes│ │
│  │ • Full custody      │    │ • Gas abstraction           │ │
│  │ • No AI access      │    │ • Multi-chain (Base, ETH)   │ │
│  │                     │    │ • Session keys for autonomy │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Matters

- **EOA** = Elastos ecosystem + direct control (Particle doesn't support ESC)
- **Agent Account** = Universal Account + AgentKit = AI-powered multi-chain wallet
- User talks naturally → AI plans transaction → User approves → Execution
- Gas abstraction means users never need to understand blockchain complexity

---

## Systems Thinking Analysis

### Simulation 1: Financial Sovereignty Feedback Loop

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FINANCIAL SOVEREIGNTY LOOP                        │
│                                                                      │
│   ┌─────────────┐    Earns    ┌─────────────┐    Enables    ┌──────┐│
│   │ PC2 Node    │────────────▶│ Agent Acct  │──────────────▶│ More ││
│   │ Services    │             │ (Income)    │               │Invest││
│   └─────────────┘             └─────────────┘               └──────┘│
│         ▲                                                       │   │
│         │                                                       │   │
│         └───────────────────────────────────────────────────────┘   │
│                         Reinvestment                                │
│                                                                      │
│   EMERGENT: The node becomes a self-sustaining revenue asset        │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: PC2 node + Agent Account = income-generating sovereign asset

### Simulation 2: Personal AI Context Loop

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PERSONAL CONTEXT LOOP                             │
│                                                                      │
│   ┌─────────────┐   Learns    ┌─────────────┐   Improves  ┌────────┐│
│   │ User Data   │────────────▶│ AI Agent    │────────────▶│ Better ││
│   │ (Sovereign) │             │ (Personal)  │             │ Service││
│   └─────────────┘             └─────────────┘             └────────┘│
│         ▲                                                       │   │
│         │                                                       │   │
│         └───────────────────────────────────────────────────────┘   │
│                      Generates More Data                            │
│                                                                      │
│   EMERGENT: AI that truly knows you but YOUR data never leaves      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Personal AI + sovereign storage = unmatched personalization without privacy sacrifice

### Simulation 3: P2P Commerce Without Middlemen

```
┌──────────────────────────────────────────────────────────────────────┐
│                    P2P COMMERCE FLOW                                 │
│                                                                      │
│   ┌─────────────┐              ┌─────────────┐                      │
│   │ Alice's PC2 │◀────────────▶│  Bob's PC2  │                      │
│   │   Agent     │  Discovery   │   Agent     │                      │
│   └──────┬──────┘  (Boson)     └──────┬──────┘                      │
│          │                            │                              │
│          │ Negotiate                  │ Negotiate                    │
│          ▼                            ▼                              │
│   ┌─────────────┐              ┌─────────────┐                      │
│   │   Propose   │              │   Accept    │                      │
│   │   Trade     │──────────────│   Terms     │                      │
│   └──────┬──────┘              └──────┬──────┘                      │
│          │                            │                              │
│          └──────────┬─────────────────┘                              │
│                     ▼                                                │
│              ┌─────────────┐                                         │
│              │ Superfluid  │ Streaming payment                       │
│              │  Payment    │ or atomic swap                          │
│              └─────────────┘                                         │
│                                                                      │
│   EMERGENT: Decentralized marketplace with ZERO platform fees       │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Agent-to-agent commerce eliminates rent-seeking intermediaries

### Simulation 4: The Digital Twin

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DIGITAL TWIN CAPABILITIES                         │
│                                                                      │
│                        ┌─────────────┐                               │
│                        │  PC2 Node   │                               │
│                        │  + Agent    │                               │
│                        └──────┬──────┘                               │
│                               │                                      │
│      ┌────────────────────────┼────────────────────────┐             │
│      │                        │                        │             │
│      ▼                        ▼                        ▼             │
│ ┌─────────┐            ┌─────────────┐          ┌───────────┐       │
│ │Identity │            │  Financial  │          │  Social   │       │
│ │  (DID)  │            │  (Wallet)   │          │ (Actions) │       │
│ └─────────┘            └─────────────┘          └───────────┘       │
│                                                                      │
│   Can prove          Can pay and              Can post, vote,       │
│   who you are        receive money            interact              │
│                                                                      │
│   EMERGENT: AI agent that can represent you in the digital economy  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: DID + Wallet + AI = a digital agent that can act on your behalf

---

## High-Value Features for Sovereign Cloud Users

### FEATURE 1: Session Keys for Autonomous Actions (CRITICAL)

**Problem**: Approving every AI action is friction-heavy.

**Solution**: ERC-4337 session keys with programmable limits.

```typescript
// Session Key Configuration
{
  permissions: {
    maxSpendPerTx: "50 USDC",
    maxDailySpend: "200 USDC",
    allowedActions: ["transfer", "swap"],
    allowedTokens: ["USDC", "ETH"],
    expiresIn: "7 days"
  }
}
```

**User Experience**:

```
User: "Handle my recurring bills"

AI: "I'll set up session keys for bill payments:
     - Max $200/day for utility payments
     - Only to verified payee addresses
     - Auto-expires in 30 days
     
     Approve session key?"
     
[Approve] [Customize] [Decline]
```

**Benefits**:

- True autonomy within safe limits
- User sets the boundaries once
- AI operates freely within them
- One-time approval, ongoing automation

### FEATURE 2: Personal AI Memory System (HIGH VALUE)

**Problem**: AI forgets context between sessions.

**Solution**: Sovereign memory store on PC2 node.

```typescript
// Memory System Architecture
{
  shortTerm: {
    // Current conversation context
    conversation: [...],
    recentActions: [...]
  },
  longTerm: {
    // Persistent knowledge
    preferences: {
      riskTolerance: "moderate",
      preferredChains: ["Base", "Arbitrum"],
      maxGasWilling: "20 USDC"
    },
    financialPatterns: {
      avgMonthlySpend: "450 USDC",
      savingsGoal: "1000 USDC/month"
    },
    contacts: {
      "alice": "0x...",
      "bob": "0x..."
    }
  },
  encrypted: {
    // Highly sensitive
    seedPhraseBackup: "encrypted...",
    privateNotes: "encrypted..."
  }
}
```

**Benefits**:

- AI knows your preferences
- "Send Bob $20" just works
- Financial advice based on YOUR data
- All stored on YOUR node, encrypted

### FEATURE 3: Node Monetization via Streaming Payments (HIGH VALUE)

**Problem**: Running a node costs money but generates nothing.

**Solution**: Monetize node resources via Superfluid streams.

```
┌─────────────────────────────────────────────────────────────┐
│                NODE MONETIZATION OPTIONS                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  💾 Storage Hosting                                         │
│     Pin other users' IPFS content → $0.001/GB/hour stream  │
│                                                             │
│  🤖 AI Inference                                            │
│     Run Ollama for others → $0.0001/token stream           │
│                                                             │
│  🌐 Gateway Services                                        │
│     Serve as Boson relay → $0.10/day stream                │
│                                                             │
│  📄 Content Access                                          │
│     Paywalled content → $X per view or stream              │
│                                                             │
│  💻 Compute                                                 │
│     Run jobs for others → $0.001/CPU-minute stream         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

```typescript
// AI can manage monetization
User: "Set up my node to earn passive income"

AI: "I'll configure monetization:
     - Storage hosting: You have 50GB free → ~$36/month potential
     - AI inference: Ollama running → ~$15/month potential
     - Boson relay: Always-on → ~$3/month potential
     
     Set up streaming payment receivers?"
```

### FEATURE 4: Proactive Financial Guardian (HIGH VALUE)

**Problem**: Users miss opportunities and risks.

**Solution**: AI monitors and alerts proactively.

```
┌─────────────────────────────────────────────────────────────┐
│                PROACTIVE AGENT SCENARIOS                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔔 Price Alerts                                            │
│     "ETH hit your target of $4000. Swap now?"              │
│                                                             │
│  ⚠️ Position Health                                         │
│     "Your Aave position is 85% to liquidation. Add $200?"  │
│                                                             │
│  💰 Yield Optimization                                      │
│     "Found 2% higher yield for your USDC. Migrate?"        │
│                                                             │
│  📊 Portfolio Rebalance                                     │
│     "You're 70% ETH. Rebalance to your 60/40 target?"      │
│                                                             │
│  🎯 Goal Tracking                                           │
│     "You're 80% to your savings goal. Keep it up!"         │
│                                                             │
│  🚨 Security Alerts                                         │
│     "Unusual activity detected. Review transactions?"       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### FEATURE 5: Cross-Chain Intelligence (HIGH VALUE)

**Problem**: Users don't know where their assets are or the cheapest path.

**Solution**: AI knows everything across all chains.

```
User: "I want to buy 1 ETH"

AI: "I found your funds across chains:
     
     Option 1: Use Base USDC (cheapest)
     - 2000 USDC available
     - Gas: ~$0.02
     - Slippage: 0.05%
     
     Option 2: Use Ethereum USDC
     - 1500 USDC available  
     - Gas: ~$15
     - Slippage: 0.03%
     
     Option 3: Bridge from Arbitrum + swap
     - 3000 USDC available
     - Total cost: ~$0.50
     - Time: ~15 minutes
     
     Recommend Option 1. Proceed?"
```

### FEATURE 6: Agent-to-Agent Communication (FUTURE)

**Problem**: Your agent can only help you, not interact with others.

**Solution**: Agents discover and negotiate with each other.

```
┌─────────────────────────────────────────────────────────────┐
│                AGENT NETWORK SCENARIOS                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🤝 Peer Discovery                                          │
│     Your agent finds other agents on Boson network         │
│                                                             │
│  🛒 Autonomous Shopping                                     │
│     "Buy me a domain" → Agent negotiates with registrar    │
│                                                             │
│  📦 Service Procurement                                     │
│     Agent finds cheapest storage provider, negotiates rate │
│                                                             │
│  💼 Freelance Matching                                      │
│     "Find someone to design a logo" → Agent posts job,     │
│     receives bids, shortlists based on your preferences    │
│                                                             │
│  🔄 Automated Trading                                       │
│     Agents form temporary trading pools for better rates   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## What Makes This Truly Valuable for Sovereign Cloud Users

### The Sovereignty Stack

| Layer | Current | With Agent Account |

|-------|---------|-------------------|

| Identity | Boson DID | AI can prove and use identity |

| Storage | IPFS on PC2 | AI has full context access |

| Compute | Local Ollama | AI runs on YOUR hardware |

| Network | Boson P2P | AI discovers other agents |

| Wallet | Particle | AI manages finances |

| Interface | Chat UI | Natural language everything |

### The Value Propositions

1. **Financial Autopilot**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Set goals, AI handles the rest
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - No apps, no dashboards, just outcomes
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Make me money while I sleep"

2. **Zero Platform Fees**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - P2P commerce without middlemen
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Agent-to-agent transactions
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Keep 100% of your earnings

3. **Privacy + Personalization**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - AI knows you deeply
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - But YOUR data stays on YOUR node
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Best of both worlds

4. **Passive Income**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Node resources earn money
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - AI optimizes earnings
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Self-sustaining infrastructure

5. **Financial Inclusion**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - No bank account needed
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - No credit history required
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Wallet is your bank

6. **Complexity Abstraction**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - No chains, no gas, no addresses
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Just "send alice $20"
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Blockchain becomes invisible

---

## Current PC2 Architecture Overview

### 1. Universal Smart Wallet (Particle Network)

- **Provider**: Particle Network Universal Account (ERC-4337)
- **Features**: Multi-chain, gas abstraction, batched transactions
- **Supported Chains**: Ethereum, Base, Arbitrum, Optimism, Polygon, BNB, Solana
- **Limitation**: Elastos Smart Chain not supported in Universal mode
- **Key Files**: `src/gui/src/services/WalletService.js`, `packages/particle-auth/`

### 2. AI Agent System

- **Providers**: Ollama (local), OpenAI, Claude, Gemini, xAI
- **Tool System**: 40+ tools for filesystem, terminal, wallet queries
- **Architecture**: Decorator-based tool registration, streaming responses
- **External API**: API keys with scoped permissions (read/write/execute/admin)
- **Key Files**: `pc2-node/src/services/ai/`, `pc2-node/src/api/tools.ts`

### 3. API/SDK Architecture

- **Wallet APIs**: Balance queries, wallet info (read-only currently)
- **Tool Registry**: OpenAPI schema at `/api/tools/openapi`
- **External Agent Support**: API key authentication for Claude Code, Cursor, etc.
- **Key Files**: `pc2-node/src/api/`, `pc2-node/src/services/ai/tools/`

---

## Coinbase AgentKit Architecture

### Core Components

1. **Action Providers**: 50+ blockchain actions (ERC20, ERC721, DeFi, DEX, NFT, etc.)
2. **Wallet Providers**: CDP, Privy, Viem, ZeroDev abstraction layers
3. **Framework Extensions**: LangChain, Vercel AI SDK, Model Context Protocol (MCP)
4. **Design Pattern**: Decorator-based action registration with Zod schemas

### Key Patterns

- Actions return strings (for LLM consumption)
- Network filtering via `supportsNetwork()`
- Wallet provider injection into action methods
- Framework adapters convert actions to tool format

---

## Integration Opportunities

### OPPORTUNITY 1: Particle Wallet Provider for AgentKit (HIGH VALUE)

**Problem**: AgentKit supports CDP, Privy, Viem, ZeroDev but NOT Particle Network.

**Solution**: Create a `ParticleWalletProvider` that implements AgentKit's `WalletProvider` interface.

**Implementation**:

```typescript
// New file: packages/agentkit-particle/src/particleWalletProvider.ts
export class ParticleWalletProvider extends EvmWalletProvider {
  constructor(private particleUA: UniversalAccount) {}
  
  async getAddress(): Promise<string> {
    return this.particleUA.getSmartAccountAddress();
  }
  
  async nativeTransfer(to: string, amount: bigint): Promise<string> {
    const tx = await this.particleUA.sendTransaction({
      to, value: amount.toString()
    });
    return tx.hash;
  }
  
  supportsNetwork(network: Network): boolean {
    return PARTICLE_SUPPORTED_CHAINS.includes(network.chainId);
  }
}
```

**Benefits**:

- Use existing Particle auth (no additional wallet setup)
- Leverage gas abstraction automatically
- Multi-chain transactions via single interface
- Compatible with all AgentKit action providers

**Effort**: Medium (2-3 days)

---

### OPPORTUNITY 2: AgentKit Actions for PC2 AI Agent (HIGH VALUE)

**Problem**: PC2's AI can only query wallet balances, not execute transactions.

**Solution**: Integrate AgentKit action providers as PC2 AI tools.

**Implementation**:

```typescript
// New file: pc2-node/src/services/ai/tools/AgentKitTools.ts
import { erc20ActionProvider, walletActionProvider } from '@coinbase/agentkit';

export class AgentKitToolProvider {
  private agentKit: AgentKit;
  
  constructor(walletProvider: ParticleWalletProvider) {
    this.agentKit = AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        erc20ActionProvider(),
        wethActionProvider(),
      ]
    });
  }
  
  // Convert to PC2 tool format
  getTools(): AITool[] {
    return this.agentKit.getActions().map(action => ({
      name: action.name,
      description: action.description,
      parameters: zodToJsonSchema(action.schema),
      execute: async (args) => {
        // User confirmation required
        await this.requestUserApproval(action.name, args);
        return action.invoke(args);
      }
    }));
  }
}
```

**New AI Capabilities**:

- Send ERC20 tokens: "Send 10 USDC to 0x..."
- Swap tokens: "Swap 0.1 ETH for USDC on Base"
- Check balances: "What's my USDC balance across all chains?"
- DeFi actions: "Deposit 100 USDC into Compound"
- NFT operations: "Transfer my NFT to..."

**Security Considerations**:

- Transaction confirmation modal (required)
- Daily/per-tx spending limits
- Whitelist of allowed actions
- Audit logging

**Effort**: High (1-2 weeks)

---

### OPPORTUNITY 3: MCP Server for PC2 Nodes (MEDIUM VALUE)

**Problem**: External AI tools (Claude Desktop, Cursor) can't interact with PC2 wallets.

**Solution**: Expose PC2 wallet actions via Model Context Protocol.

**Implementation**:

```typescript
// New file: pc2-node/src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk';
import { getMcpTools } from './agentkit-adapter';

export async function startMcpServer(walletProvider: ParticleWalletProvider) {
  const agentKit = await AgentKit.from({ walletProvider, actionProviders });
  const { tools, toolHandler } = await getMcpTools(agentKit);
  
  const server = new Server({ name: 'pc2-wallet', version: '1.0.0' });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    return toolHandler(req.params.name, req.params.arguments);
  });
  
  return server;
}
```

**Benefits**:

- Claude Desktop can manage PC2 wallet
- Cursor agents can execute transactions
- Any MCP-compatible AI can use PC2 wallet
- Decentralized wallet-as-a-service

**Effort**: Medium (3-5 days)

---

### OPPORTUNITY 4: Streaming Payments via Superfluid (HIGH VALUE)

**Problem**: PC2 nodes could monetize compute/storage via streaming payments.

**Solution**: Integrate Superfluid action provider for pay-per-use services.

**Use Cases**:

- AI inference streaming payment (pay per token)
- Storage streaming payment (pay per GB/hour)
- Compute streaming payment (pay per CPU-second)
- Content access streaming (pay per view)

**Implementation**:

```typescript
// Use existing Superfluid action provider
import { superfluidActionProvider } from '@coinbase/agentkit';

// Enable streaming payments for PC2 services
const actions = superfluidActionProvider();
// create_flow, update_flow, delete_flow, get_flow_rate
```

**Effort**: Medium (1 week)

---

### OPPORTUNITY 5: Cross-Chain Swaps & Bridges (MEDIUM VALUE)

**Problem**: Users want to swap/bridge tokens across chains from PC2.

**Solution**: Integrate AgentKit's DEX and bridge action providers.

**Available Providers**:

- `jupiterActionProvider()` - Solana DEX
- `sushiActionProvider()` - Multi-chain DEX
- `zeroXActionProvider()` - DEX aggregator
- `acrossActionProvider()` - Cross-chain bridge
- `ensoActionProvider()` - DeFi aggregator

**AI Commands**:

- "Swap 0.5 ETH for USDC on Base"
- "Bridge 100 USDC from Ethereum to Base"
- "Find the best swap rate for ETH to USDC"

**Effort**: Low (existing providers, just integration)

---

## Comparison: AgentKit vs Alternatives

| Feature | AgentKit | PC2 Current | Alternatives |

|---------|----------|-------------|--------------|

| Wallet Abstraction | Excellent | Good (Particle) | Web3Modal, RainbowKit |

| AI Integration | Excellent | Good | None built-in |

| Action Library | 50+ actions | 5 wallet tools | Build from scratch |

| Framework Support | LangChain, MCP, Vercel | Custom | Varies |

| Smart Wallets | CDP, ZeroDev | Particle | Account abstraction |

| Network Support | EVM + Solana | EVM + Solana | Varies |

| Open Source | Yes (Apache 2.0) | Yes | Varies |

**Recommendation**: AgentKit is the best option for AI-blockchain integration. Create a Particle wallet provider to bridge the gap.

---

---

## Revised Implementation Roadmap

### Phase 1: Agent Account Foundation (Week 1-2)

**Goal**: Basic AI-controlled transactions with user approval

1. Design Agent Account architecture and UI
2. Create `ParticleWalletProvider` for AgentKit
3. Integrate basic wallet actions (transfer, balance)
4. Build transaction confirmation modal UI
5. Security: basic spending limits per transaction

**Deliverable**: User can say "Send 10 USDC to 0x..." and approve

### Phase 2: Intelligent Multi-Chain (Week 3-4)

**Goal**: AI knows balances everywhere and optimizes

6. Multi-chain balance aggregation in AI context
7. Cross-chain path optimization ("cheapest way to...")
8. DeFi actions: swap, bridge integration
9. Transaction simulation before proposal
10. AI explains gas costs and timing

**Deliverable**: AI recommends optimal execution paths

### Phase 3: Session Keys & Autonomy (Week 5-6)

**Goal**: Trusted AI actions without per-tx approval

11. Implement ERC-4337 session key support
12. Session key configuration UI
13. Spending limits (per-tx, daily, monthly)
14. Action whitelist/blacklist
15. Session key revocation

**Deliverable**: "Handle my recurring payments" with one-time approval

### Phase 4: Personal AI Memory (Week 7-8)

**Goal**: AI that remembers and learns

16. Persistent memory store design
17. Preferences learning (contacts, chains, limits)
18. Financial pattern recognition
19. Proactive alerts and suggestions
20. Encrypted sensitive memory vault

**Deliverable**: "Send Bob $20" works because AI knows Bob

### Phase 5: Node Monetization (Week 9-10)

**Goal**: Passive income from PC2 node

21. Superfluid streaming payment integration
22. Storage hosting payment setup
23. AI inference pricing
24. Boson relay payments
25. Earnings dashboard

**Deliverable**: Node earns passive income from services

### Phase 6: External Agent Access (Week 11-12)

**Goal**: Claude Desktop, Cursor can use your wallet

26. MCP server implementation
27. API key scoping for external agents
28. Audit logging
29. Rate limiting
30. Documentation for developers

**Deliverable**: Any MCP-compatible AI can use PC2 wallet

---

## Risk Mitigation

| Risk | Impact | Mitigation |

|------|--------|------------|

| AI proposes bad transaction | High | Simulation, limits, confirmation UI |

| Session key abuse | Critical | Tight limits, easy revocation, alerts |

| External agent misuse | High | Scoped API keys, audit logs |

| Particle API changes | Medium | Abstraction layer, version pinning |

| Memory data exposure | High | Encryption at rest, access controls |

| Node downtime = no wallet | Medium | Backup keys, recovery phrase |

---

## Success Metrics

| Metric | Target | Why It Matters |

|--------|--------|----------------|

| AI transaction success rate | >95% | Trust requires reliability |

| Time to first AI transaction | <5 min | Onboarding friction |

| Session key adoption | >50% users | Validates autonomous value |

| Monthly node earnings | >$10 avg | Sustainability signal |

| Zero unauthorized transactions | 100% | Security is non-negotiable |

| AI-initiated vs manual | >70% AI | Shows AI value to user |

---

## Conclusion

### The Vision

PC2 + Agent Account + Elacity = **Your Personal AI Business**

- Runs on YOUR hardware (sovereign)
- Knows YOUR context (personal)  
- Manages YOUR money (powerful)
- Trades YOUR assets 24/7 (autonomous)
- Earns YOU income (valuable)
- Talks YOUR language (accessible)

### The Unique Value Proposition

> "The first decentralized personal cloud where your AI agent can create, trade, and monetize digital assets autonomously - becoming your 24/7 business partner in the Access Economy."

### Why This Matters

1. **For Creators**: Package and sell anything, keep 95%
2. **For Users**: AI handles the complexity, you enjoy the income
3. **For PC2**: The killer app - sovereign cloud + AI business
4. **For Elastos**: The Access Economy comes alive
5. **For Web3**: Finally, real utility beyond speculation
6. **For AI**: Agents become economic actors, not just assistants

### Immediate Next Steps

1. **Week 1**: Prototype Agent Account UI in wallet slide-out
2. **Week 1**: Create ParticleWalletProvider skeleton
3. **Week 2**: Basic ERC20 transfer via AI chat
4. **Week 2**: Transaction confirmation modal
5. **Week 3**: Multi-chain balance in AI context

### Key Dependencies

- Particle Network Universal Account SDK
- Coinbase AgentKit (Apache 2.0)
- Superfluid Protocol (for streaming)
- ERC-4337 session keys (via Particle or ZeroDev)
- Elacity dDRM SDK (for capsules)
- Elacity Smart Contracts (for marketplace)
- IPFS/Helia (already in PC2)

### Milestones

| Milestone | Weeks | Deliverable |
|-----------|-------|-------------|
| **MVP 1** | 1-4 | "Talk to your wallet" - basic transfers |
| **MVP 2** | 5-8 | "Autonomous agent" - session keys + memory |
| **MVP 3** | 9-12 | "Monetize your node" - streaming payments |
| **North Star** | 13-16 | "Robots as Customers" - Elacity integration |

**Total Estimated Effort**: 16 weeks for full North Star implementation

**Quick Win (MVP 1)**: 4 weeks - "Send 50 USDC to alice" works

**Full Agent Account**: 12 weeks - Session keys, memory, monetization

**North Star Vision**: 16 weeks - AI creates, trades, earns via Elacity

### The End State

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   User: "Package my new album and sell it on Elacity"           │
│                                                                 │
│   Agent: "Done. I've created 'Summer Vibes EP' with:            │
│          • 50 access tokens at $8 each                          │
│          • 10% resale royalty                                   │
│          • Listed on Elacity marketplace                        │
│                                                                 │
│          I'll auto-accept offers above $7.                      │
│          Want me to promote it to potential buyers?"            │
│                                                                 │
│   [3 days later]                                                │
│                                                                 │
│   Agent: "You earned $142 while you slept.                      │
│          - 12 access tokens sold                                │
│          - 3 resales (you earned royalties)                     │
│          - Current inventory: 38/50                             │
│                                                                 │
│          Market demand is high. Shall I raise the price to $10?"│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**This is the future: Your AI runs your digital business while you sleep.**