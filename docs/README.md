# PC2 Documentation Index

> Personal Cloud Computer - Sovereign cloud computing on Elastos

---

## Start Here

| Document | Description |
|----------|-------------|
| [Agent Handover](core/AGENT_HANDOVER.md) | **START HERE** - Complete context for AI agents and new developers |

---

## Core Documentation

Essential reading for understanding PC2's vision, architecture, and strategy.

| Document | Description |
|----------|-------------|
| [The Big Picture](core/THE_BIG_PICTURE.md) | ElastOS + Elacity dDRM vision, three-layer model |
| [Architecture Convergence](core/ARCHITECTURE_CONVERGENCE.md) | PC2 v1 → ElastOS Runtime v2 technical path |
| [Strategic Roadmap](core/ROADMAP.md) | Keystone Fund milestones M1–M13, monthly releases |
| [Architecture Overview](core/PC2_ARCHITECTURE_OVERVIEW.md) | High-level system architecture |
| [Strategic Implementation Plan](core/STRATEGIC_IMPLEMENTATION_PLAN.md) | Project phases and key learnings |
| [PC2 Narrative](core/PC2_NARRATIVE.md) | Vision and storytelling |
| [Session Handover](core/SESSION_HANDOVER.md) | AI agent session context |
| [Agent Handover](core/AGENT_HANDOVER.md) | Complete context for AI agents and new developers |

### Plans & Roadmaps

| Plan | Description |
|------|-------------|
| [Decentralized Network Architecture](core/plans/decentralized_network_architecture.plan.md) | Scaling supernodes, multi-domain support, P2P communication |

### Strategy

| Document | Description |
|----------|-------------|
| [Elastos Strategy](core/IMPORTANT/ELASTOS_STRATEGY.md) | Elastos ecosystem strategy |
| [Why Elastos Matters](core/IMPORTANT/WHY_ELASTOS_MATTERS.md) | The case for Elastos |

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

## Deployment

| Guide | Description |
|-------|-------------|
| [ARM Devices](deployment/ARM_DEVICES.md) | Raspberry Pi, Jetson, and other ARM devices |
| [VPS Guide](deployment/VPS_GUIDE.md) | Deploy on Contabo, Hetzner, etc. |
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

*Last updated: March 2026*
