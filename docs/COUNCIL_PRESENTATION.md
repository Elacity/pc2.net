# ElastOS PC2 Network Architecture
## Council Presentation Guide

---

## What is PC2?

**Personal Cloud Compute** - A decentralized cloud OS where users own their data, servers, and identity.

Think of it like: **"Your own personal AWS/Google Cloud, but YOU control it."**

---

## The Three-Layer Architecture

### Layer 1: SUPERNODES (Council Infrastructure)

Supernodes are the backbone of the network. They provide three critical services:

| Service | Purpose | Port |
|---------|---------|------|
| **Boson DHT** | Decentralized identity lookup & peer discovery | 39001/UDP |
| **Active Proxy** | NAT traversal for nodes behind firewalls | 8090/TCP |
| **Web Gateway** | Routes friendly URLs to nodes | 80/443 |

**Current Supernodes:**
- `69.164.241.210` → `*.ela.city`
- `38.242.211.112` → `*.pc2.net`

**Why Council Members Should Run Supernodes:**
1. **Network Resilience** - More supernodes = no single point of failure
2. **Geographic Distribution** - Faster access for users worldwide
3. **Domain Expansion** - Each supernode can serve its own domain (e.g., `*.ela.net`)
4. **Revenue Potential** - Future: charge for premium gateway services

---

### Layer 2: CONNECTION TYPES

**How Personal Nodes Connect to the Network:**

#### Direct Access (VPS/Public IP)
```
User → Gateway → Your Server (Direct HTTP)
```
- Fastest performance
- Requires public IP address
- Best for: VPS deployments

#### NAT Traversal (Home/Raspberry Pi)
```
User → Gateway → Active Proxy → Your Server (Encrypted Tunnel)
```
- Works behind any firewall
- Uses supernode as relay
- Best for: Home servers, Raspberry Pi, mobile setups

---

### Layer 3: PERSONAL NODES (End Users)

Users run their own PC2 node on:
- **VPS** (Contabo, DigitalOcean, etc.) - Direct connection
- **Home Server** - NAT traversal via Active Proxy
- **Raspberry Pi** - NAT traversal, ultra low cost
- **Local Machine** - Testing at localhost:4200

Each node gets:
- **Unique Identity**: `did:boson:{NodeId}`
- **24-word Recovery Phrase** (like crypto wallets)
- **Friendly URL**: `username.ela.city`

---

## How the Boson DHT Works

```
┌─────────────────────────────────────────────────────────────┐
│                    BOSON DHT MESH                           │
│                                                             │
│   Supernode A ←───────→ Supernode B ←───────→ Supernode C   │
│       │                     │                     │         │
│   Stores DIDs           Stores DIDs          Stores DIDs    │
│   for nodes             for nodes            for nodes      │
│   in region             in region            in region      │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
1. Each supernode maintains part of the distributed hash table
2. Node identities are replicated across the mesh
3. Any supernode can resolve any DID
4. No central database - fully decentralized

---

## User Access Flow

```
1. User types: alice.ela.city
                    ↓
2. DNS resolves *.ela.city → Supernode A (69.164.241.210)
                    ↓
3. Web Gateway extracts "alice" from URL
                    ↓
4. Gateway looks up "alice" in registry
                    ↓
5a. IF Direct: Gateway proxies to http://alice-ip:4200
5b. IF NAT: Gateway relays through Active Proxy tunnel
                    ↓
6. Response flows back to user's browser
```

---

## Scaling the Network

### Current State (2 Supernodes)
```
    ┌──────────────┐              ┌──────────────┐
    │ Supernode A  │◄────────────►│ Supernode B  │
    │ *.ela.city   │    DHT Mesh  │ *.pc2.net    │
    └──────────────┘              └──────────────┘
           │                             │
           └──────────┬──────────────────┘
                      │
              Personal Nodes
```

### Future State (Council Supernodes)
```
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Supernode A  │◄─►│ Supernode B  │◄─►│ Supernode C  │
    │ *.ela.city   │   │ *.pc2.net    │   │ *.ela.net    │
    └──────────────┘   └──────────────┘   └──────────────┘
           │                   │                   │
           │           ┌──────────────┐           │
           └──────────►│ Supernode D  │◄──────────┘
                       │ *.council.io │
                       └──────────────┘
                              │
                  More Personal Nodes!
```

**Benefits of More Supernodes:**
- Load distribution
- Reduced latency (regional nodes)
- Network redundancy
- Domain flexibility

---

## Domain Strategy

| Domain | Status | Purpose |
|--------|--------|---------|
| `*.ela.city` | Active | Primary user gateway |
| `*.pc2.net` | Active | Alternative gateway |
| `*.ela.net` | Planned | Council expansion |
| `*.your-domain.com` | Future | Custom domains |

**Requirements for New Gateway Domain:**
1. Wildcard DNS pointing to supernode IP
2. Wildcard SSL certificate (Let's Encrypt)
3. Web Gateway configuration update

---

## What Council Members Need to Run a Supernode

### Hardware Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB+
- **Storage**: 50GB+
- **Bandwidth**: 1Gbps recommended
- **IP**: Static public IP required

### Software Stack
```
/root/pc2/
├── boson/              # Boson DHT + Active Proxy (Java 17)
├── web-gateway/        # Web Gateway (Node.js)
└── pc2.net/            # Optional: Your own PC2 node
```

### Estimated Costs
- **VPS**: $10-30/month (Contabo, Hetzner, etc.)
- **Domain**: $10-15/year (optional)
- **SSL**: Free (Let's Encrypt)

---

## Key Takeaways for Council

1. **Supernodes are infrastructure** - They don't store user data, just route traffic
2. **More is better** - Each supernode increases network resilience
3. **Low barrier** - A $10/month VPS can run a supernode
4. **Revenue potential** - Gateway operators can offer premium services
5. **No single point of failure** - If one supernode goes down, others continue

---

## Next Steps

1. **Council members interested in running supernodes**: Contact Elacity Labs
2. **Documentation**: See `docs/pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md`
3. **Testing**: Try setting up a personal node first

---

## Questions?

**Diagram Location**: `docs/pc2-network-architecture.svg`

**Contact**: Elacity Labs Team
