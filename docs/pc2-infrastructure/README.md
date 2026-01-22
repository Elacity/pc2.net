# PC2 Sovereign Node Infrastructure

> Decentralized personal cloud infrastructure for the Elastos ecosystem

## Overview

This documentation covers the PC2 (Personal Cloud Computer) infrastructure that enables users to run sovereign nodes accessible via friendly URLs like `username.ela.city`.

## Architecture

```
                                    Internet
                                        │
                                        ▼
                              ┌─────────────────┐
                              │   DNS Wildcard  │
                              │  *.ela.city     │
                              └────────┬────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SUPER NODE (VPS)                          │
│                      69.164.241.210                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Web Gateway  │  │  Boson DHT   │  │  Active Proxy    │  │  │
│  │  │  :80/:443    │  │   :39001     │  │     :8090        │  │  │
│  │  │  (Node.js)   │  │   (Java)     │  │     (Java)       │  │  │
│  │  └──────┬───────┘  └──────────────┘  └────────┬─────────┘  │  │
│  │         │                                      │            │  │
│  │         │         Username Registry            │            │  │
│  │         │     ┌─────────────────────┐          │            │  │
│  │         └────►│  demo → :4200       │◄─────────┘            │  │
│  │               │  alice → proxy:xxx  │                       │  │
│  │               │  bob → proxy:yyy    │                       │  │
│  │               └─────────────────────┘                       │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Active Proxy Connection
                                       ▼
                    ┌─────────────────────────────────────┐
                    │         PC2 NODES (Users)           │
                    │                                     │
                    │  ┌─────────┐  ┌─────────┐          │
                    │  │ Alice's │  │  Bob's  │  ...     │
                    │  │  Node   │  │  Node   │          │
                    │  │ (home)  │  │ (VPS)   │          │
                    │  └─────────┘  └─────────┘          │
                    │                                     │
                    └─────────────────────────────────────┘
```

## Components

### 1. Boson DHT Node
- **Purpose**: Decentralized peer discovery and identity resolution
- **Technology**: Kademlia DHT (Java)
- **Port**: 39001/UDP
- **Status**: Running

### 2. Active Proxy
- **Purpose**: NAT traversal for nodes behind firewalls
- **Technology**: TCP relay with CryptoBox encryption (Java)
- **Port**: 8090/TCP, 25000-30000/TCP (mapping range)
- **Status**: Running

### 3. Web Gateway
- **Purpose**: Route `*.ela.city` subdomains to PC2 nodes
- **Technology**: Node.js with http-proxy
- **Port**: 80/TCP (HTTP), 443/TCP (HTTPS with Let's Encrypt)
- **Status**: Running

## Documentation Index

| Document | Description |
|----------|-------------|
| [README.md](README.md) | This overview document |
| [SUPERNODE_OPERATOR_GUIDE.md](SUPERNODE_OPERATOR_GUIDE.md) | How to run a super node |
| [WEB_GATEWAY.md](WEB_GATEWAY.md) | Web Gateway API and configuration |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Detailed technical architecture |
| [PC2_CLIENT_INTEGRATION.md](PC2_CLIENT_INTEGRATION.md) | PC2 node identity & connectivity |
| [DEPLOYMENT_LOG.md](DEPLOYMENT_LOG.md) | Deployment history and decisions |
| [SSL_CERTIFICATES.md](SSL_CERTIFICATES.md) | SSL certificate management |

## Quick Links

### Live URLs
- https://demo.ela.city - Demo PC2 node
- https://test.ela.city - Test PC2 node
- https://sash.ela.city - Sash's node

### API Endpoints
- `POST /api/register` - Register a username
- `GET /api/lookup/{username}` - Look up a user
- `GET /api/users` - List all users
- `GET /api/health` - Health check

## Current Status

| Component | Port | Status |
|-----------|------|--------|
| Boson DHT | 39001/UDP | ✅ Running |
| Active Proxy | 8090/TCP | ✅ Running |
| Web Gateway | 80, 443/TCP | ✅ Running |
| DNS Wildcard | *.ela.city | ✅ Configured |
| SSL Certificates | Let's Encrypt | ✅ Valid |

## Phases

- [x] **Phase 1**: Boson DHT Super Node deployment
- [x] **Phase 2**: Active Proxy porting and deployment
- [x] **Phase 3**: PC2 client integration (identity, connectivity)
- [x] **Phase 4**: Web Gateway with subdomain routing
- [x] **Phase 5**: End-to-end testing (completed)

## Phase 5 Testing Results

| Test | Status | Notes |
|------|--------|-------|
| Web Gateway health | ✅ Pass | `/api/health` returns 200 |
| Username registration | ✅ Pass | Users can register via POST |
| Username lookup | ✅ Pass | `/api/lookup/{username}` works |
| HTTPS routing | ✅ Pass | SSL certificates valid |
| Wildcard DNS | ✅ Pass | `*.ela.city` resolves correctly |
| HTTP proxying | ✅ Pass | Requests forwarded to nodes |
| WebSocket proxying | ✅ Pass | Upgrade headers handled |

### Known Limitations (MVP)

| Limitation | Resolution |
|------------|------------|
| Local registry only | DHT registry in Sprint 5 |
| No rate limiting | Security hardening in v1.1.0 |
| Manual SSL expansion | Automate in Sprint 1 |

## Infrastructure Details

**Super Node Location**: InterServer VPS
- **IP**: 69.164.241.210
- **OS**: Ubuntu 24.04 LTS
- **Node ID**: `J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E`

**Domain**: ela.city (GoDaddy)
- **Wildcard**: `*.ela.city` → 69.164.241.210
- **Root**: `ela.city` → 35.205.174.216 (existing website)

## Next Steps (MVP v1.0.0)

See the unified plan for full roadmap. Key next steps:

1. **Sprint 1**: NetworkDetector, SSL automation
2. **Sprint 2**: Docker packaging
3. **Sprint 3**: Setup wizard
4. **Sprint 4**: Update system
5. **Sprint 5**: NAT traversal, DHT registry
6. **Sprint 6**: Testing, CI/CD

---

*Last Updated: January 22, 2026*
