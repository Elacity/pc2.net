# Lightweight DHT Participation for PC2 Nodes

## Overview

This document outlines how PC2 nodes could participate in the DHT network beyond being clients, contributing to network resilience and decentralization while respecting device constraints.

## Boson's Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│  Active Proxy  │  Federated Messaging  │  Content Storage (Future)  │
├─────────────────────────────────────────────────────────────────────┤
│                     Kademlia DHT Network                             │
│        (Distributed Hash Table for Identity & Discovery)            │
└─────────────────────────────────────────────────────────────────────┘
```

Current Status:
- **Active Proxy**: ✅ Implemented (NAT traversal)
- **Federated Messaging**: 📋 TODO (Carrier V2 messaging)
- **Content Storage**: 📋 TODO (P2P file sharing)

## Node Types & Capabilities

### 1. Full Supernode (Current)
**Requirements**: VPS with public IP, 8GB+ RAM, always-on
**Role**: Bootstrap node, DHT storage, Active Proxy relay

```
Capabilities:
├─ DHT routing table (full)
├─ Store records for key range
├─ Serve DHT queries
├─ Active Proxy service
├─ Port mapping (25000-30000)
└─ Gateway integration
```

### 2. Lightweight DHT Node (Proposed)
**Requirements**: Raspberry Pi, NAS, always-on home device
**Role**: Contribute to DHT routing, reduce supernode load

```
Capabilities:
├─ DHT routing table (partial)
├─ Store records for nearby key range
├─ Serve DHT queries
├─ Forward to supernodes for distant keys
└─ No Active Proxy (behind NAT)
```

### 3. Client-Only Node (Current PC2 Nodes)
**Requirements**: Any device, intermittent connectivity
**Role**: Consumer of DHT services

```
Capabilities:
├─ Query DHT via supernodes
├─ Connect via Active Proxy
└─ No storage or routing
```

## Lightweight DHT Implementation

### Key Design Principles

1. **Optional**: Nodes can choose to participate based on resources
2. **Graceful**: Nodes can go offline without disrupting network
3. **Bounded**: Limit storage and bandwidth per node
4. **Efficient**: Use existing libp2p/IPFS DHT where possible

### Configuration

```typescript
interface LightweightDHTConfig {
  // Enable DHT participation
  enableDHT: boolean;
  
  // DHT participation mode
  mode: 'client' | 'participant' | 'full';
  
  // Storage limits
  maxRecords: number;        // Default: 1000
  maxStorageMB: number;      // Default: 100
  
  // Bandwidth limits
  maxQueriesPerSecond: number;  // Default: 10
  maxBandwidthMbps: number;     // Default: 1
  
  // Availability
  minUptimeHours: number;    // Minimum before participating
}
```

### Implementation Path

#### Phase A: IPFS DHT Integration (Existing)
PC2 already uses libp2p/IPFS. Enable DHT server mode for always-on nodes:

```typescript
// In pc2-node/src/storage/ipfs.ts
const ipfsConfig = {
  libp2p: {
    dht: {
      // Client mode (current): only queries
      clientMode: !config.enableDHT,
      
      // Server mode (new): also stores & serves
      enabled: config.enableDHT,
    }
  }
};
```

#### Phase B: Boson DHT Integration (Future)
When Boson releases TypeScript/WASM DHT client:

```typescript
// Conceptual - depends on Boson releasing a JS client
import { BosonDHT } from '@bosonnetwork/dht';

class LightweightDHTNode {
  private dht: BosonDHT;
  private config: LightweightDHTConfig;
  
  async start() {
    this.dht = new BosonDHT({
      mode: 'lightweight',
      bootstraps: await fetchSuperNodes(),
      storage: {
        maxRecords: this.config.maxRecords,
        path: './data/dht',
      },
    });
    
    await this.dht.start();
    
    // Announce our presence
    await this.dht.announce(this.nodeId);
  }
  
  async lookup(key: string): Promise<any> {
    return this.dht.get(key);
  }
  
  async store(key: string, value: any): Promise<void> {
    // Only store if key is in our range
    if (this.isInOurRange(key)) {
      await this.dht.put(key, value);
    }
  }
}
```

## Benefits of PC2 Nodes Participating in DHT

### For the Network
| Benefit | Description |
|---------|-------------|
| **Resilience** | More nodes = harder to disrupt |
| **Latency** | Queries served by nearby nodes |
| **Scalability** | Distribute load across many nodes |
| **Decentralization** | Reduce supernode dependency |

### For Node Operators
| Benefit | Description |
|---------|-------------|
| **Contribution** | Give back to the network |
| **Reputation** | Build trust score over time |
| **Future Incentives** | Potential token rewards |
| **Self-Hosting** | Less reliance on third parties |

## Device Suitability Matrix

| Device | DHT Mode | Rationale |
|--------|----------|-----------|
| Raspberry Pi | Participant | Always-on, low power |
| Jetson Nano | Participant | Always-on, more resources |
| NAS | Participant | Always-on, storage |
| Home PC | Client | Intermittent, variable |
| Laptop | Client | Mobile, battery |
| Mobile | Client | Network changes, battery |
| VPS | Full | Public IP, always-on |

## Implementation Roadmap

### Now: Enable IPFS DHT Server Mode
```typescript
// Already possible - just enable in config
{
  "ipfs": {
    "enable_dht": true,
    "dht_mode": "server"  // vs "client"
  }
}
```

### Short-term: Track Boson's JS Client Development
- Monitor https://github.com/bosonnetwork for JS/WASM releases
- Boson V2 is Java-first, but Node.js bindings are planned

### Medium-term: Implement Lightweight DHT Node
1. Create `LightweightDHTService` in pc2-node
2. Add configuration options
3. Implement storage bounds
4. Add health monitoring

### Long-term: Full Boson Services
As Boson releases:
- **Federated Messaging**: Add to PC2 for secure chat
- **Content Storage**: P2P file sharing integration

## Privacy Considerations

All DHT participation respects PC2's privacy principles:

1. **No User Data in DHT**: Only public keys and endpoints stored
2. **Encrypted Payloads**: Actual data always E2E encrypted
3. **Optional Participation**: User chooses to contribute
4. **Bounded Resources**: Won't overwhelm devices

## Example: Raspberry Pi DHT Node

```yaml
# config/raspberry-pi-dht.yaml
node:
  type: pc2-node
  mode: participant  # Enable DHT participation
  
dht:
  enabled: true
  mode: lightweight
  storage:
    max_records: 5000
    max_size_mb: 200
    ttl_hours: 24
  bandwidth:
    max_queries_per_second: 20
    max_mbps: 5
  
# Still use Active Proxy for incoming connections (behind NAT)
active_proxy:
  enabled: true
  supernode: auto  # Use discovered supernode
```

## Conclusion

PC2 nodes can contribute to the DHT network in a lightweight capacity, especially always-on devices like Raspberry Pi. This aligns with Boson's vision of a decentralized network while respecting device constraints.

The immediate path is enabling IPFS DHT server mode for suitable devices. Deeper Boson DHT integration depends on their release of JavaScript bindings.

---

*Related Documents:*
- [PC2 Architecture](./PC2_ARCHITECTURE.md)
- [Supernode Operator Guide](./pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md)
- [Council Presentation](./COUNCIL_PRESENTATION.md)
