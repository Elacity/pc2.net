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
- https://test7.ela.city - Test7 PC2 node (Contabo)
- https://sash.ela.city - Sash's node
- https://*.ela.city - Any registered subdomain (wildcard SSL)

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
| SSL Wildcard | *.ela.city | ✅ Let's Encrypt (auto-renew) |
| HTTP→HTTPS Redirect | 80→443 | ✅ Enabled |
| Registered Users | - | 14 nodes |

## Phases

- [x] **Phase 1**: Boson DHT Super Node deployment
- [x] **Phase 2**: Active Proxy porting and deployment
- [x] **Phase 3**: PC2 client integration (identity, connectivity)
- [x] **Phase 4**: Web Gateway with subdomain routing
- [x] **Phase 5**: NAT traversal implementation (completed)

## Phase 5 Testing Results

| Test | Status | Notes |
|------|--------|-------|
| Web Gateway health | ✅ Pass | `/api/health` returns 200 |
| Username registration | ✅ Pass | Users can register via POST |
| Username lookup | ✅ Pass | `/api/lookup/{username}` works |
| HTTPS routing | ✅ Pass | SSL certificates valid |
| Wildcard DNS | ✅ Pass | `*.ela.city` resolves correctly |
| HTTP proxying (direct) | ✅ Pass | Requests forwarded to nodes |
| WebSocket proxying | ✅ Pass | Upgrade headers handled |
| Active Proxy port | ✅ Pass | Port 8090 listening |
| ProxyProtocol encoding | ✅ Pass | Compiles without errors |
| ActiveProxyClient | ✅ Pass | Compiles without errors |
| Web Gateway proxy:// | ✅ Pass | Deployed and running |

### Known Limitations (MVP)

| Limitation | Resolution |
|------------|------------|
| Local registry only | DHT registry in Sprint 6 |
| No rate limiting | Security hardening in v1.1.0 |
| ~~Manual SSL expansion~~ | ✅ **RESOLVED**: Wildcard SSL implemented |
| WebSocket via proxy:// | Not yet supported |

## Infrastructure Details

**Super Node Location**: InterServer VPS
- **IP**: 69.164.241.210
- **OS**: Ubuntu 24.04 LTS
- **Node ID**: `J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E`

**Domain**: ela.city (GoDaddy)
- **Wildcard**: `*.ela.city` → 69.164.241.210
- **Root**: `ela.city` → 35.205.174.216 (existing website)

## MVP Progress (v1.0.0) - ALL COMPLETE

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Infrastructure (docs, IP detection, SSL) | ✅ Complete |
| Sprint 2 | Docker packaging | ✅ Complete |
| Sprint 3 | First-run setup wizard | ✅ Complete |
| Sprint 4 | Update system | ✅ Complete |
| Sprint 5 | NAT traversal via Active Proxy | ✅ Complete |
| Sprint 6 | Testing, CI/CD, DHT registry, Failover | ✅ Complete |

### Sprint 3-4 Highlights (Recently Completed)

**Setup Wizard:**
- Multi-step wizard (welcome → username → complete)
- Username validation and availability checking
- Copy recovery phrase button on completion screen
- Particle-style dark theme branding

**Settings Integration:**
- Node Identity section in Account tab
- Recovery phrase encryption with wallet signature
- Manual mnemonic entry for late encryption

**Update System:**
- UpdateService for version checking
- Update API endpoints
- Frontend notification banner

### Sprint 5 Highlights (Just Completed)

**NAT Traversal Implementation:**
- `ProxyProtocol.ts` - Binary packet encoder/decoder
- `ActiveProxyClient.ts` - TCP client for Active Proxy
- `ConnectivityService` - Updated for proxy:// endpoints
- Web Gateway deployed with Active Proxy relay support

### Sprint 6 Highlights (Just Completed)

**Testing & CI/CD:**
- E2E testing of setup wizard, identity, and connectivity
- GitHub Actions workflow for PC2 node Docker builds
- Multi-platform support: linux/amd64, linux/arm64

**DHT Registry:**
- Created `boson-http-api` Java service for DHT operations
- REST API endpoints for username registration/lookup
- Enables decentralized username resolution

**Super Node Failover:**
- Round-robin failover between super nodes
- Failed node tracking with automatic retry
- Manual `failover()` method for force switching

### Completed (January 2026)

1. ✅ **Wildcard SSL Certificate** - `*.ela.city` via acme.sh + GoDaddy DNS-01
2. ✅ **HTTP→HTTPS Redirect** - Automatic redirect on port 80
3. ✅ **Local AI Setup UX** - Single-button Ollama + DeepSeek installation
4. ✅ **Mixed Content Fix** - `getBaseUrl()` for reverse proxy compatibility

### Next Steps (v1.1.0)

1. Deploy and test DHT HTTP API service
2. Integrate Web Gateway with DHT API
3. Add more super nodes for production failover
4. Rate limiting and security hardening

---

*Last Updated: January 22, 2026*
