# PC2 Documentation Index

> Personal Cloud Computer - Sovereign cloud computing on Elastos

---

## Core Documentation

Essential reading for understanding PC2's vision, architecture, and strategy.

| Document | Description |
|----------|-------------|
| [Strategic Implementation Plan](core/STRATEGIC_IMPLEMENTATION_PLAN.md) | Project roadmap, phases, and key learnings |
| [Architecture Overview](core/PC2_ARCHITECTURE_OVERVIEW.md) | High-level system architecture |
| [Network Specification](core/PC2_NETWORK_SPECIFICATION.md) | Decentralized access and self-updating design |
| [PC2 Narrative](core/PC2_NARRATIVE.md) | Vision and storytelling |

### Plans & Roadmaps

| Plan | Description |
|------|-------------|
| [Decentralized Network Architecture](core/plans/decentralized_network_architecture.plan.md) | Scaling supernodes, multi-domain support, P2P communication |

---

## Infrastructure

Documentation for running and operating PC2 infrastructure.

| Document | Description |
|----------|-------------|
| [Infrastructure Architecture](pc2-infrastructure/ARCHITECTURE.md) | Technical deep-dive into PC2 sovereign node infrastructure |
| [Supernode Operator Guide](pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md) | How to deploy a PC2 Boson Super Node |
| [Web Gateway](pc2-infrastructure/WEB_GATEWAY.md) | Web Gateway for subdomain routing |
| [SSL Certificates](pc2-infrastructure/SSL_CERTIFICATES.md) | SSL/TLS certificate management |
| [PC2 Client Integration](pc2-infrastructure/PC2_CLIENT_INTEGRATION.md) | Integrating PC2 clients |
| [Deployment Log](pc2-infrastructure/DEPLOYMENT_LOG.md) | Deployment history and notes |

---

## Guides

Step-by-step guides for developers and operators.

| Guide | Description |
|-------|-------------|
| [Quick Start](QUICKSTART.md) | Get PC2 running quickly |
| [Deployment](DEPLOYMENT.md) | Production deployment guide |

---

## Integrations

Integration documentation for connecting PC2 with other systems.

### DePIN Integration

| Document | Description |
|----------|-------------|
| [DePIN Overview](depin-integration/README.md) | Decentralized Physical Infrastructure integration |
| [API Endpoints](depin-integration/APIEndpoints.md) | API reference |
| [Auth Provider](depin-integration/AuthProvider.md) | Authentication provider |
| [Storage Provider](depin-integration/StorageProvider.md) | Storage provider integration |
| [KV Store](depin-integration/KVStore.md) | Key-value store |

### Wallet Integration

| Document | Description |
|----------|-------------|
| [Wallet Integration](wallet-integration/README.md) | Wallet connection and authentication |

---

## Key Concepts

### The Three WebSpaces (Rong's Vision)

| WebSpace | Purpose | Status |
|----------|---------|--------|
| `https://` | Web2 backward compatibility | **Working** - `*.ela.city` |
| `localhost://` | Carrier connecting mobile↔PC2, PC2↔PC2 | **Infrastructure Ready** |
| `elastos://` | Blockchain oracles, smart contract data | **Future** |

### Domain Ownership (CRC DAO)

- `pc2.net` → Personal WebSpaces
- `ela.net` → Personal AppCapsules
- `ela.city` → General purpose (current default)

---

## Quick Links

- **Repository**: [github.com/Elacity/pc2.net](https://github.com/Elacity/pc2.net)
- **Supernode**: `69.164.241.210`
- **Bootstrap Nodes**: See [Supernode Operator Guide](pc2-infrastructure/SUPERNODE_OPERATOR_GUIDE.md)

---

*Last updated: January 2026*
