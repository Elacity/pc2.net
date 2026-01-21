# PC2 Infrastructure Architecture

> Technical deep-dive into the PC2 sovereign node infrastructure

## System Overview

The PC2 infrastructure enables users to run personal cloud nodes that are accessible from anywhere via friendly URLs, without relying on central servers or traditional hosting.

## Core Principles

1. **Sovereignty**: Users own and control their nodes
2. **Decentralization**: No single point of failure
3. **Accessibility**: Global access via simple URLs
4. **Privacy**: End-to-end encrypted connections
5. **Interoperability**: Built on Elastos ecosystem standards

## Component Architecture

### 1. Boson DHT (Distributed Hash Table)

**Purpose**: Decentralized identity resolution and peer discovery

**Technology Stack**:
- Language: Java 17
- Protocol: Kademlia DHT
- Encryption: libsodium (NaCl)
- Storage: SQLite

**Key Features**:
- Node identity via Ed25519 keypairs
- DHT-based value storage and retrieval
- Peer announcement and discovery
- Bootstrap node network

**Data Stored in DHT**:
```
Key: did:boson:{node_id}
Value: {
  "id": "did:boson:J1h7RHv5iHhT...",
  "service": [{
    "type": "PC2Node",
    "endpoint": "proxy://supernode:8090/session_id"
  }]
}
```

**Network Topology**:
```
        Bootstrap Nodes
       /       |       \
      /        |        \
   Node A   Node B    Node C
     \        |        /
      \       |       /
       \      |      /
        Regular Nodes
```

### 2. Active Proxy

**Purpose**: NAT traversal for nodes behind firewalls

**Technology Stack**:
- Language: Java 17
- Framework: Vert.x (async I/O)
- Encryption: CryptoBox (NaCl)
- Protocol: Custom TCP with packet framing

**Protocol Flow**:
```
PC2 Node                    Super Node                    Client
   │                            │                            │
   │──── AUTH + Public Key ────►│                            │
   │◄─── AUTH_ACK + Challenge ──│                            │
   │                            │                            │
   │──── Session Established ───│                            │
   │                            │                            │
   │                            │◄── Client Request ─────────│
   │                            │                            │
   │◄─── CONNECT + Data ────────│                            │
   │                            │                            │
   │──── DATA Response ────────►│                            │
   │                            │                            │
   │                            │──── Response to Client ───►│
```

**Packet Types**:
| Type | Code | Description |
|------|------|-------------|
| AUTH | 0x00-0x07 | Initial authentication |
| ATTACH | 0x08-0x0F | Attach to existing session |
| PING | 0x10-0x1F | Keep-alive |
| CONNECT | 0x20-0x2F | Establish connection |
| DISCONNECT | 0x30-0x3F | Close connection |
| DATA | 0x40-0x6F | Data transfer |
| ERROR | 0x70-0x7F | Error notification |

**Port Mapping**:
- Each authenticated node gets a port from the mapping range (25000-30000)
- External clients can connect to this mapped port
- Traffic is relayed through the encrypted session

### 3. Web Gateway

**Purpose**: HTTP/HTTPS routing for subdomain access

**Technology Stack**:
- Language: Node.js 20
- Proxy: http-proxy
- SSL: Let's Encrypt
- Protocol: HTTP/1.1, WebSocket

**Request Flow**:
```
                    ┌─────────────────────────────────┐
                    │           Web Gateway           │
                    │                                 │
   HTTPS Request    │  1. Extract subdomain           │
  ─────────────────►│  2. Lookup in registry          │
                    │  3. Proxy to endpoint           │
                    │  4. Return response             │
   HTTPS Response   │                                 │
  ◄─────────────────│                                 │
                    └─────────────────────────────────┘
```

**Registry Structure**:
```json
{
  "alice": {
    "nodeId": "alice-node-abc123",
    "endpoint": "http://127.0.0.1:4200",
    "registered": "2026-01-21T15:30:00.000Z"
  },
  "bob": {
    "nodeId": "bob-node-xyz789",
    "endpoint": "proxy://active-proxy:8090/session123",
    "registered": "2026-01-21T16:00:00.000Z"
  }
}
```

## Integration Architecture

### Current State (Phase 4 Complete)

```
┌─────────────────────────────────────────────────────────────┐
│                      SUPER NODE                             │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Web Gateway │    │  Boson DHT  │    │Active Proxy │     │
│  │   :80/443   │    │   :39001    │    │   :8090     │     │
│  └──────┬──────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│         │ Proxy                                             │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │  Test Node  │                                            │
│  │   :4200     │                                            │
│  └─────────────┘                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Target State (Phase 5)

```
┌──────────────────────────────────────────────────────────────────────┐
│                           SUPER NODE                                  │
│                                                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │ Web Gateway │◄──►│  Boson DHT  │◄──►│Active Proxy │              │
│  │   :80/443   │    │   :39001    │    │   :8090     │              │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘              │
│         │                  │                   │                     │
│         │                  │ DHT Lookup        │ Session Relay       │
│         │                  │                   │                     │
└─────────┼──────────────────┼───────────────────┼─────────────────────┘
          │                  │                   │
          │                  ▼                   │
          │           ┌─────────────┐            │
          │           │ DHT Network │            │
          │           │ (Other      │            │
          │           │  Super      │            │
          │           │  Nodes)     │            │
          │           └─────────────┘            │
          │                                      │
          └───────────────────┬──────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   PC2 User Nodes    │
                    │                     │
                    │  ┌─────┐  ┌─────┐   │
                    │  │Alice│  │ Bob │   │
                    │  │(NAT)│  │(VPS)│   │
                    │  └─────┘  └─────┘   │
                    │                     │
                    └─────────────────────┘
```

## Data Flow Examples

### Example 1: User Accesses alice.ela.city

```
1. Browser → DNS: Resolve alice.ela.city
   DNS → Browser: 69.164.241.210

2. Browser → Gateway: GET https://alice.ela.city/
   
3. Gateway: Extract "alice" from hostname
   Gateway: Lookup "alice" in registry
   Gateway: Found endpoint "http://127.0.0.1:4200"

4. Gateway → PC2 Node: Proxy GET /
   
5. PC2 Node → Gateway: 200 OK + HTML content

6. Gateway → Browser: 200 OK + HTML content
```

### Example 2: Node Behind NAT Registers

```
1. Alice's Node → Super Node:
   Active Proxy AUTH packet
   
2. Super Node → Alice's Node:
   AUTH_ACK + allocated port 25001
   
3. Alice's Node → Gateway API:
   POST /api/register {
     username: "alice",
     nodeId: "alice-did",
     endpoint: "proxy://127.0.0.1:8090/session_alice"
   }

4. Gateway: Store in registry

5. External Request → alice.ela.city:
   Gateway proxies to Active Proxy session
   Active Proxy relays to Alice's node
```

## Security Architecture

### Encryption Layers

1. **Transport Layer**: TLS 1.3 (HTTPS)
2. **Session Layer**: CryptoBox (Active Proxy)
3. **Identity Layer**: Ed25519 signatures (DID)

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication                           │
│                                                             │
│  1. Node generates Ed25519 keypair                          │
│  2. Node ID = Base58(PublicKey)                             │
│  3. Node connects to Super Node                             │
│  4. Super Node sends challenge                              │
│  5. Node signs challenge with private key                   │
│  6. Super Node verifies signature                           │
│  7. Session established with CryptoBox                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Trust Model

- **Super Nodes**: Trusted relays (run by council members)
- **DHT**: Byzantine fault tolerant (requires 51% honest)
- **User Nodes**: Self-sovereign (user controls keys)

## Scalability Considerations

### Horizontal Scaling

```
                    DNS Load Balancing
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         SuperNode1   SuperNode2   SuperNode3
              │            │            │
              └────────────┼────────────┘
                           │
                      DHT Network
                    (All connected)
```

### Capacity Estimates

| Component | Per Super Node |
|-----------|----------------|
| Active Proxy Sessions | ~10,000 concurrent |
| Web Gateway RPS | ~5,000 requests/sec |
| DHT Entries | ~1,000,000 records |
| Bandwidth | ~1 Gbps |

## File Locations

### On Super Node (69.164.241.210)

```
/root/pc2/
├── boson/                    # Boson DHT + Active Proxy
│   ├── lib/                  # Java JARs
│   ├── config/               # Configuration
│   └── data/                 # Runtime data
├── web-gateway/              # Web Gateway
│   ├── index.js              # Main code
│   ├── data/                 # Registry
│   └── gateway.log           # Logs
├── Boson.Core/               # Source code
├── Boson.Parent/             # Maven parent
├── Boson.Dependencies/       # Maven deps
└── Elastos.Carrier.Java/     # Active Proxy source
```

### Systemd Services

```
/etc/systemd/system/
├── pc2-boson.service         # Boson DHT + Active Proxy
├── pc2-gateway.service       # Web Gateway
└── pc2-test-node.service     # Demo node
```

---

*This architecture supports the vision of sovereign personal cloud computing where users own their data and identity.*
