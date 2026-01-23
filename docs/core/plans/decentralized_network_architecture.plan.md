---
name: Decentralized Network Architecture
overview: Comprehensive explanation of the current PC2 decentralized architecture, scaling strategy for supernodes and PC2 nodes, multi-domain support, P2P communication, and alignment with Rong's vision for WebSpaces.
todos:
  - id: multi-domain-dns
    content: Configure DNS records for *.pc2.net and *.ela.net pointing to supernodes
    status: pending
  - id: multi-domain-ssl
    content: Obtain wildcard SSL certificates for pc2.net and ela.net domains
    status: pending
  - id: multi-domain-gateway
    content: Update Web Gateway on supernodes to handle multiple domain suffixes
    status: pending
  - id: scale-supernodes-eu
    content: Deploy additional supernode in EU region for geographic distribution
    status: pending
  - id: scale-supernodes-asia
    content: Deploy additional supernode in Asia region for geographic distribution
    status: pending
  - id: geodns
    content: Configure GeoDNS for *.ela.city to route to nearest supernode
    status: pending
  - id: dht-participant
    content: Enable PC2 nodes to participate in DHT (Level 2 - store/forward DHT entries)
    status: pending
  - id: relay-node
    content: Enable PC2 nodes with public IP to act as relay nodes for NAT'd peers
    status: pending
  - id: p2p-messenger
    content: Implement P2P Messenger Service for PC2-to-PC2 encrypted communication
    status: pending
  - id: p2p-chat-app
    content: Build Chat App for PC2 desktop with contact list and encrypted messaging
    status: pending
  - id: p2p-file-transfer
    content: Implement P2P file transfer between PC2 nodes
    status: pending
  - id: mobile-sdk
    content: Build mobile SDK for Carrier to enable phone-to-PC2 connections
    status: pending
  - id: did-integration
    content: Integrate DID resolution with ESC/EID for elastos:// WebSpace
    status: pending
  - id: desktop-packages
    content: Create .deb, .dmg, and .exe installers for easy consumer deployment
    status: pending
---

# PC2 Decentralized Network Architecture

## Current State: What You Have Today

### Your Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        YOUR CURRENT DEPLOYMENT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   USER BROWSER                                                               │
│        │                                                                     │
│        │ https://test7.ela.city                                              │
│        ▼                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │        SUPER NODE (69.164.241.210) - Flagship                 │          │
│   │                                                               │          │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │          │
│   │  │   Web    │  │  Boson   │  │  Active  │                   │          │
│   │  │ Gateway  │  │   DHT    │  │  Proxy   │                   │          │
│   │  │ :80/443  │  │  :39001  │  │  :8090   │                   │          │
│   │  └────┬─────┘  └──────────┘  └────┬─────┘                   │          │
│   │       │                           │                          │          │
│   │       └───────────────────────────┘                          │          │
│   └──────────────────────┬───────────────────────────────────────┘          │
│                          │ NAT Traversal Relay                               │
│                          ▼                                                   │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │        YOUR VPS (38.242.211.112) - Contabo                    │          │
│   │                                                               │          │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │          │
│   │  │  PC2     │  │  Boson   │  │  Nginx   │                   │          │
│   │  │  Node    │  │ Service  │  │  Proxy   │                   │          │
│   │  │  :4200   │  │  Client  │  │ :80/443  │                   │          │
│   │  └──────────┘  └──────────┘  └──────────┘                   │          │
│   └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Is This Decentralized?

**Current State: Partially Decentralized**

| Component | Decentralized? | Notes |

|-----------|----------------|-------|

| Identity (DID) | Yes | Ed25519 keypair generated locally, stored in `identity.json` |

| DHT Network | Yes | Kademlia DHT with multiple bootstrap nodes |

| Active Proxy | Federated | Multiple supernodes can relay, but you choose one |

| Domain Routing | Centralized (DNS) | `*.ela.city` relies on DNS pointing to supernode |

| Your VPS | Centralized | Single point of failure for YOUR node |

**Your VPS Role**: You are running your PC2 node on a VPS for reliability. The Boson service connects to the supernode to enable NAT traversal and domain access. If your VPS goes down, your node is offline. If the supernode goes down, your domain stops resolving (but your VPS could still work via direct IP).

---

## Scaling Strategy

### 1. Multiple Supernodes (Horizontal Scaling)

```
                         DNS Round-Robin / GeoDNS
                    *.ela.city → 69.164.241.210 OR 45.32.138.246 OR ...
                                        │
               ┌────────────────────────┼────────────────────────┐
               ▼                        ▼                        ▼
         SuperNode-US              SuperNode-EU              SuperNode-Asia
         (69.164.241.210)          (new.eu.ip)              (new.asia.ip)
               │                        │                        │
               └────────────────────────┼────────────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │   DHT MESH        │
                              │   (All nodes      │
                              │    synchronized)  │
                              └─────────┬─────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 ▼                      ▼                      ▼
           PC2 Node A              PC2 Node B              PC2 Node C
           (Alice - US)            (Bob - EU)             (Carol - Asia)
```

**How to Scale Supernodes:**

1. **Add More Bootstrap Nodes**: Edit [`pc2-node/src/services/boson/ConnectivityService.ts`](pc2-node/src/services/boson/ConnectivityService.ts)
2. **Deploy Additional Supernodes**: Use the [SUPERNODE_OPERATOR_GUIDE.md](docs/pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md)
3. **DNS Load Balancing**: Configure GeoDNS for `*.ela.city` to route to nearest supernode

### 2. Multi-Domain Support

**Current**: Only `*.ela.city` works because DNS and Web Gateway are configured for it.

**To Add**: `*.pc2.net`, `*.ela.net`

**Required Changes:**

1. **DNS Configuration** (done at registrar level):
   ```
   *.pc2.net    A    69.164.241.210  (or supernode IPs)
   *.ela.net    A    69.164.241.210
   ```

2. **Web Gateway Update** (on supernodes):

   - Currently hardcoded for `ela.city`
   - Needs to accept `pc2.net` and `ela.net` subdomains
   - SSL certificates for all domains (Let's Encrypt)

3. **PC2 Node Configuration**:

   - User chooses which domain they want: `alice.ela.city` OR `alice.pc2.net` OR `alice.ela.net`
   - Stored in Boson username registration

**File to Modify**: Web Gateway on supernode (not in this repo - it's on the supernode)

---

## PC2 Node Participation Levels

PC2 nodes can contribute to the Boson network at different levels, making the network more resilient:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PC2 NODE PARTICIPATION LEVELS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LEVEL 1: CLIENT ONLY (Current State)                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PC2 Node ──connects to──► Supernode                                │    │
│  │  • Uses DHT for lookups only                                        │    │
│  │  • Uses Active Proxy for NAT traversal                              │    │
│  │  • Does NOT contribute to network                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LEVEL 2: DHT PARTICIPANT (Lightweight)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PC2 Node ◄──stores DHT entries──► DHT Network                      │    │
│  │  • Stores portion of DHT keyspace                                   │    │
│  │  • Answers queries from other nodes                                 │    │
│  │  • Minimal resource usage (~50MB RAM, negligible bandwidth)         │    │
│  │  • Works even behind NAT (UDP hole punching)                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LEVEL 3: RELAY NODE (Medium)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PC2 Node acts as relay for other PC2 nodes                         │    │
│  │  • Requires public IP or UPnP port forwarding                       │    │
│  │  • Relays traffic for nodes behind strict NAT                       │    │
│  │  • ~100-500MB RAM, moderate bandwidth                               │    │
│  │  • VPS operators can enable this easily                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  LEVEL 4: FULL SUPERNODE (Heavy)                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  PC2 Node + DHT + Active Proxy + Web Gateway                        │    │
│  │  • Full DHT node (bootstrap capable)                                │    │
│  │  • Active Proxy server for NAT traversal                            │    │
│  │  • Web Gateway for subdomain routing                                │    │
│  │  • 4+ GB RAM, high bandwidth, public IP required                    │    │
│  │  • Ideal for: VPS operators, Council members, data centers          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Feasibility

| Level | Effort | Impact | Currently Possible? |

|-------|--------|--------|---------------------|

| Level 1 (Client) | Done | None | **Yes - Current state** |

| Level 2 (DHT Participant) | Medium | High | Requires Boson Java SDK integration |

| Level 3 (Relay Node) | Medium | Medium | Requires new relay service |

| Level 4 (Full Supernode) | Low | Very High | **Yes - Use existing guide** |

### How to Enable DHT Participation (Level 2)

The Boson DHT is written in Java. Options for PC2 node participation:

**Option A: Embedded Java (Heavy)**

- Bundle JVM with PC2
- Run Boson DHT as subprocess
- ~200MB additional size

**Option B: Native DHT Client (Ideal)**

- Port Boson DHT protocol to TypeScript/Rust
- Integrate directly into PC2 node
- Lightweight, no JVM needed

**Option C: WebSocket Bridge (Quick)**

- PC2 node connects to a DHT bridge service
- Bridge translates to full DHT participation
- Less decentralized but easy to implement

### Network Effect with Participation

```
Current Network (Few Supernodes):
    SuperNode ◄────► SuperNode
        │                │
        │                │
   PC2 Node A       PC2 Node B
   PC2 Node C       PC2 Node D


Future Network (Every VPS PC2 = Mini Supernode):
    SuperNode ◄────► SuperNode
        │                │
        │                │
   PC2(VPS) ◄──────► PC2(VPS)     ← These help relay
        │                │
        │                │
   PC2(Home)        PC2(Home)     ← These benefit from relays
```

---

## Alignment with Rong's Vision

### The Three WebSpaces

Rong described three specialized WebSpaces that WCI (Web3 Computing Initiative) will build:

| WebSpace | Purpose | PC2 Implementation |

|----------|---------|-------------------|

| `https://` | Web2 backward compatibility | **Implemented** - `test7.ela.city` works now |

| `localhost://` | Carrier connecting mobile→PC2, PC2→PC2 | **In Progress** - Boson DHT + Active Proxy |

| `elastos://` | Blockchain oracles, smart contract data | **Future** - Integration with ESC/EID |

### How PC2 Fits the Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RONG'S WEBSPACE VISION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. https:// WebSpace (Web2 Compatibility)                                   │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Browser → https://alice.ela.city → Supernode → PC2 Node        │     │
│     │  Status: WORKING TODAY                                          │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  2. localhost:// WebSpace (Carrier/P2P)                                      │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Mobile App ←→ Boson Carrier ←→ PC2 (user's own computer)       │     │
│     │  PC2 Node A ←→ Boson DHT ←→ PC2 Node B                          │     │
│     │  Status: INFRASTRUCTURE READY (Boson DHT + Active Proxy)        │     │
│     │  Next: Mobile SDK, Direct P2P without supernode relay           │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  3. elastos:// WebSpace (Blockchain Oracles)                                 │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  Smart Contracts ←→ DID ←→ PC2 (as "drives" for blockchain)     │     │
│     │  elastos://alice.did/files/contract-data.json                   │     │
│     │  Status: FUTURE - Requires DID integration with ESC             │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Domain Ownership (CRC DAO):                                                 │
│     • pc2.net  → Personal WebSpaces (alice.pc2.net)                          │
│     • ela.net  → Personal AppCapsules (myapp.ela.net)                        │
│     • ela.city → General purpose (current default)                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PC2 Peer-to-Peer Communication

The core of the `localhost://` WebSpace is PC2 nodes communicating directly with each other - completely sovereign and decentralized.

### P2P Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PC2 PEER-TO-PEER ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALICE'S PC2                              BOB'S PC2                          │
│  ┌──────────────────────┐                ┌──────────────────────┐           │
│  │  DID: did:boson:alice│                │  DID: did:boson:bob  │           │
│  │  ┌────────────────┐  │                │  ┌────────────────┐  │           │
│  │  │   Chat App     │◄─┼────────────────┼──│   Chat App     │  │           │
│  │  └────────────────┘  │   Encrypted    │  └────────────────┘  │           │
│  │  ┌────────────────┐  │   P2P Channel  │  ┌────────────────┐  │           │
│  │  │  File Share    │◄─┼────────────────┼──│  File Share    │  │           │
│  │  └────────────────┘  │                │  └────────────────┘  │           │
│  │         │            │                │         │            │           │
│  │         ▼            │                │         ▼            │           │
│  │  ┌────────────────┐  │                │  ┌────────────────┐  │           │
│  │  │ P2P Messenger  │  │                │  │ P2P Messenger  │  │           │
│  │  │ Service        │  │                │  │ Service        │  │           │
│  │  └───────┬────────┘  │                │  └───────┬────────┘  │           │
│  │          │           │                │          │           │           │
│  └──────────┼───────────┘                └──────────┼───────────┘           │
│             │                                       │                        │
│             │         ┌─────────────────┐           │                        │
│             │         │   BOSON DHT     │           │                        │
│             └────────►│                 │◄──────────┘                        │
│                       │ 1. Find peer    │                                    │
│                       │ 2. Exchange     │                                    │
│                       │    connection   │                                    │
│                       │    info         │                                    │
│                       │ 3. NAT traverse │                                    │
│                       └─────────────────┘                                    │
│                                                                              │
│  CONNECTION METHODS (Fallback Chain):                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. DIRECT (Both have public IP)                                     │    │
│  │    Alice:4200 ◄─────────────────────────────────► Bob:4200          │    │
│  │                                                                      │    │
│  │ 2. HOLE PUNCH (Both behind NAT, same type)                          │    │
│  │    Alice ◄───── UDP/TCP hole punch ─────► Bob                       │    │
│  │                                                                      │    │
│  │ 3. RELAY (Symmetric NAT, needs help)                                │    │
│  │    Alice ◄──► Relay Node (PC2 or Supernode) ◄──► Bob                │    │
│  │                                                                      │    │
│  │ 4. STORE-AND-FORWARD (One offline)                                  │    │
│  │    Alice ──► DHT Storage ──► (Bob comes online) ──► Bob             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How P2P Connection Works

**1. Identity & Discovery**

```
Alice wants to chat with Bob:

1. Alice knows Bob's DID: did:boson:bob_xyz123
2. Alice queries DHT: "Where is did:boson:bob_xyz123?"
3. DHT returns: { endpoint: "relay://supernode:8090/session_bob", publicKey: "..." }
4. Alice now knows how to reach Bob
```

**2. Connection Establishment**

```
Signaling via DHT (no central server):

Alice                        DHT                         Bob
  │                           │                           │
  │──"I want to connect"─────►│                           │
  │  (signed with Alice key)  │                           │
  │                           │──notify Bob──────────────►│
  │                           │                           │
  │                           │◄──Bob's connection info───│
  │◄──Bob's endpoint + key────│                           │
  │                           │                           │
  │◄════════ Encrypted P2P Channel (E2EE) ═══════════════►│
```

**3. End-to-End Encryption**

```
┌─────────────────────────────────────────────────────────────────┐
│  Alice's Message                                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Plaintext: "Hey Bob, sending you a file!"                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  1. Sign with Alice's private key                         │ │
│  │  2. Encrypt with Bob's public key (from DHT)              │ │
│  │  3. Add nonce for replay protection                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Ciphertext: 0x7f8a9b2c...                                │ │
│  │  Only Bob can decrypt (has matching private key)          │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Technical Components Needed

| Component | Purpose | Exists Today? |

|-----------|---------|---------------|

| Node Identity (DID) | Unique identifier for each PC2 | **Yes** - IdentityService |

| DHT Lookup | Find peer connection info | **Yes** - via Boson supernode |

| P2P Channel | Direct encrypted connection | **Partial** - Active Proxy relay works |

| NAT Traversal | Connect through firewalls | **Yes** - Active Proxy |

| E2E Encryption | Secure messages | **Yes** - Keys exist, need protocol |

| Messenger Service | Handle P2P messages | **No** - Needs implementation |

| Chat App | User interface | **No** - Needs implementation |

| File Transfer App | Send files P2P | **No** - Needs implementation |

---

## Sovereignty Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SOVEREIGNTY GUARANTEES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  YOUR KEYS = YOUR IDENTITY                                                   │
│  • Ed25519 keypair generated locally                                         │
│  • Private key never leaves your device                                      │
│  • Recovery via 12-word mnemonic (user controls)                            │
│  • No central authority can revoke or impersonate                           │
│                                                                              │
│  YOUR DATA = YOUR STORAGE                                                    │
│  • Messages stored on YOUR PC2 filesystem                                    │
│  • Files stored on YOUR PC2 filesystem                                       │
│  • No cloud storage (unless you choose to add)                              │
│  • Export/backup anytime, it's YOUR data                                    │
│                                                                              │
│  YOUR CONNECTIONS = YOUR CHOICE                                              │
│  • Accept/block contacts manually                                            │
│  • No algorithm deciding who you can talk to                                │
│  • No platform reading your messages                                         │
│  • Relay nodes only see encrypted blobs                                     │
│                                                                              │
│  YOUR NETWORK = DECENTRALIZED                                                │
│  • Multiple supernodes (no single point of failure)                          │
│  • PC2 nodes can relay for each other                                        │
│  • Works even if one supernode goes down                                    │
│  • Community can run their own supernodes                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## localhost:// WebSpace Use Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     localhost:// WEBSPACE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USE CASE 1: Mobile ↔ Your PC2                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Your Phone ──── Carrier SDK ──── Your PC2 at Home                  │   │
│  │                                                                      │   │
│  │  • Access your files from phone                                      │   │
│  │  • Run apps on PC2, view on phone                                    │   │
│  │  • Backup phone photos to PC2                                        │   │
│  │  • All encrypted, no cloud                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  USE CASE 2: PC2 ↔ PC2 (Friends)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Alice's PC2 ──── P2P Chat ──── Bob's PC2                           │   │
│  │                                                                      │   │
│  │  • Private messaging                                                 │   │
│  │  • File sharing                                                      │   │
│  │  • Collaborative apps                                                │   │
│  │  • No central server                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  USE CASE 3: PC2 ↔ PC2 (Public Services)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  User's PC2 ──── Request/Response ──── Service PC2                  │   │
│  │                                                                      │   │
│  │  • Decentralized APIs                                                │   │
│  │  • P2P marketplaces                                                  │   │
│  │  • Community services                                                │   │
│  │  • No AWS/Azure needed                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## DHT Network Participation Vision

When every PC2 node participates in the DHT, the network becomes self-sustaining:

```
┌─────────────────────────────────────────────────────────────────┐
│  PC2 Node with DHT Participation                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Your Apps  │  │  Your Files  │  │  Your Data   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│           │                │                │                    │
│           └────────────────┼────────────────┘                    │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PC2 Core Services                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐          │   │
│  │  │ Messenger  │  │ File Sync  │  │ App Store  │          │   │
│  │  └────────────┘  └────────────┘  └────────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    DHT Node (Lightweight)                 │   │
│  │  • Store ~1000 DHT entries for the network                │   │
│  │  • Answer queries from other nodes                        │   │
│  │  • Help route messages                                    │   │
│  │  • ~50MB RAM, minimal bandwidth                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Global DHT Network                     │   │
│  │                                                           │   │
│  │  ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ○ ─── ○             │   │
│  │  │     │     │     │     │     │     │     │             │   │
│  │  ○     ○     ○     ○     ○     ○     ○     ○             │   │
│  │  Every PC2 strengthens the network                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Network Effect**: The more PC2 nodes, the more resilient the network. Unlike centralized services that get slower with more users, a DHT network gets **faster and more reliable** with more participants.

---

## P2P Implementation Roadmap

### Phase 1: P2P Messaging Protocol (Foundation)

- Define message format (protobuf/JSON)
- Implement message encryption/signing
- Add DHT-based peer discovery
- Create MessengerService in PC2 node

### Phase 2: Chat App (MVP)

- Contact list management
- 1:1 encrypted chat
- Message history (stored locally)
- Online/offline status via DHT

### Phase 3: File Transfer

- P2P file streaming
- Resume interrupted transfers
- Large file chunking
- Progress tracking

### Phase 4: Advanced Features

- Group chats (multi-party encryption)
- Voice/video (WebRTC)
- Shared folders
- Real-time collaboration

---

## Immediate Next Steps

### To Support Multiple Domains (pc2.net, ela.net)

**On Supernode (69.164.241.210)**:

1. Update DNS records for `pc2.net` and `ela.net` at registrar
2. Obtain SSL certificates via Let's Encrypt for `*.pc2.net` and `*.ela.net`
3. Update Web Gateway to handle all three domains
4. Update PC2 node Boson service to allow domain selection

### To Scale Supernodes

1. Deploy additional supernodes in EU, Asia using existing guide
2. Add new bootstrap nodes to config
3. Configure GeoDNS for domain load balancing

### To Complete localhost:// WebSpace

1. Implement direct PC2-to-PC2 communication via DHT (no supernode relay)
2. Build mobile SDK (React Native / Flutter) for Carrier
3. Enable "connect to my PC2 from my phone" use case

### To Prepare for elastos:// WebSpace

1. Integrate DID resolution with ESC/EID
2. Design data format for smart contract "drives"
3. Build oracle service that reads/writes PC2 storage via DID

---

## Future Downloads / Setup System

**Current Setup is Correct For:**

- VPS deployments (like your Contabo)
- Docker-based deployments
- Users with public IPs

**Future Improvements Needed:**

- Debian/Ubuntu `.deb` package (apt install pc2)
- macOS `.dmg` installer
- Windows `.exe` installer
- Raspberry Pi image (flash and run)
- One-click installers for home users behind NAT (Tor + Active Proxy)

---

## Summary

| Question | Answer |

|----------|--------|

| Is this decentralized? | Partially - identity is sovereign, network is federated |

| Am I running on my VPS? | Yes - your VPS hosts your PC2 node, supernode provides routing |

| Can we scale supernodes? | Yes - add more nodes, configure DHT mesh, use GeoDNS |

| Can we support multiple domains? | Yes - DNS + SSL + Web Gateway updates needed on supernodes |

| Does this align with Rong's vision? | Yes - `https://` works, `localhost://` infrastructure exists, `elastos://` is future |

| Can PC2 nodes help the network? | Yes - DHT participation, relay nodes, or full supernodes |

| Can PC2 nodes talk to each other? | Yes - P2P via DHT discovery, encrypted channels, relay fallback |

| Is this fully sovereign? | Yes - your keys, your data, your choice of connections |

---

## Key Files Reference

| File | Purpose |

|------|---------|

| `pc2-node/src/services/boson/BosonService.ts` | Main Boson orchestration |

| `pc2-node/src/services/boson/IdentityService.ts` | Node identity (DID, keys) |

| `pc2-node/src/services/boson/ConnectivityService.ts` | Supernode connection, Active Proxy |

| `pc2-node/src/services/boson/ActiveProxyClient.ts` | NAT traversal client |

| `docs/pc2-infrastructure/ARCHITECTURE.md` | Infrastructure documentation |

| `docs/pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md` | How to run a supernode |

| `docs/PC2_NETWORK_SPECIFICATION.md` | Network design specification |