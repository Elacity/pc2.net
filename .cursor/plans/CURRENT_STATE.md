# PC2 / ElastOS — Current State

**Last Updated:** February 8, 2026
**Current Branch:** `feature/jetson-gpu-acceleration`
**Main Branch:** `main` (v1.0.0 released)

---

## Quick Context

PC2 is a decentralized Personal Cloud node — a web-based OS (forked from Puter) with IPFS storage, local AI (Ollama/Claude), Particle Wallet auth, Boson P2P networking, and a Telegram bot AI agent (Flint). Users install PC2 on a VPS, Raspberry Pi, Jetson, or desktop and get a `username.ela.city` domain routed to their node via ActiveProxy NAT traversal.

**Repository:** https://github.com/Elacity/pc2.net
**Organization:** Elacity Labs (for the Elastos ecosystem)

---

## Branch Status

### `main` — v1.0.0 Production Release
- Stable, released
- All core features working: dashboard, IPFS, AI chat, wallet auth, file management, terminal
- ActiveProxy has the **old** protocol code (key format fix only)
- Does NOT have the full ActiveProxy protocol rewrite

### `feature/jetson-gpu-acceleration` — ACTIVE DEVELOPMENT
- **18 commits ahead of main**
- Contains two major workstreams:
  1. **ActiveProxy Protocol Rewrite** (critical NAT traversal fix)
  2. **Jetson GPU Acceleration** (platform detection, Ollama GPU support)
- **Status:** Testing with community member on Jetson device
- **Blocking merge to main:** Awaiting confirmation that ActiveProxy works end-to-end

---

## Immediate Priority: ActiveProxy Fix

**Full details:** [activeproxy_fix.md](./activeproxy_fix.md)

The ActiveProxy protocol (Boson NAT traversal) was completely rewritten based on decompiled Java server source. Multiple protocol mismatches were fixed:

1. ✅ Ed25519 key format (PKCS8 → raw 64 bytes)
2. ✅ Correct packet format (2-byte len + 1-byte type)
3. ✅ Correct PING packets (3 bytes unencrypted, not 43 bytes encrypted)
4. ✅ Use allocatedPort from AUTH_ACK, not static 8090
5. ✅ Register connected handler before connect()
6. ✅ Remove domain from AUTH (crashes Java helper)
7. ✅ Gateway uses http-proxy for relay
8. ✅ Chunk sendData for payloads >65KB
9. 🔄 Community testing on Jetson

**Latest test (Feb 8):** AUTH succeeds, port allocated, CONNECT received from browser, but crashed relaying large HTTP response (fixed in `91ec216b`). Community member needs to re-pull and test.

---

## What's on the Supernode

**Supernode:** `69.164.241.210` (Linode)
- Java Boson server: port 8090 (AUTH), allocates ports 25000+ for relay
- Node.js web-gateway: port 80, behind Nginx with TLS
- The web-gateway `deploy/web-gateway/index.js` has been manually updated on the server with the http-proxy changes

**Gateway domain routing:**
- `*.ela.city` → Nginx → web-gateway
- web-gateway looks up username → endpoint mapping
- `http://` endpoints → direct proxy
- `proxy://host:port/sessionId` → http-proxy to Java allocated port

---

## Pending Work (Ordered by Priority)

### Critical
1. **Confirm ActiveProxy on Jetson** — waiting on community re-test
2. **Merge feature/jetson-gpu-acceleration → main** — after confirmation
3. **All existing PC2 nodes update** — users pull new code

### High
4. **Fix "Copy & Save" recovery phrase** — mnemonic API returns null after restart
5. **Apple code signing** — remove `xattr -cr` requirement for Mac
6. **Upload updated soul.md to Contabo** — Flint knowledge base is written but not deployed

### Medium
7. **Windows native installer** — currently WSL2 only
8. **Linux .deb package** — currently script-only install
9. **Pre-built Pi/Jetson images** — zero-terminal hardware install
10. **AI settings UI for GPU status** — Jetson detection exists but UI not updated

### Future
11. **Boson V2 integration** — waiting on Boson team
12. **Agent-to-Agent communication**
13. **dDRM marketplace**
14. **DePIN staking tiers**

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `pc2-node/src/services/boson/ActiveProxyClient.ts` | ActiveProxy tunnel client (rewritten) |
| `pc2-node/src/services/boson/ConnectivityService.ts` | Supernode connection management |
| `pc2-node/src/services/boson/ProxyProtocol.ts` | Packet types, parsing, protocol constants |
| `pc2-node/src/services/boson/IdentityService.ts` | Node identity and key management |
| `pc2-node/src/services/boson/UsernameService.ts` | Username registration with gateway |
| `pc2-node/src/services/boson/CryptoBox.ts` | NaCl encryption utilities |
| `deploy/web-gateway/index.js` | Gateway on supernode (routes *.ela.city) |
| `pc2-node/src/utils/platform.ts` | Jetson/GPU detection |
| `pc2-node/src/api/ai.ts` | AI endpoints (Ollama status, GPU info) |
| `pc2-node/src/api/system.ts` | System info API |
| `agents/flint/soul.md` | AI agent knowledge base (1027 lines) |
| `pc2-node/config/default.json` | Default configuration including supernode list |

---

## Documentation Index

### Internal Planning (this repo: pc2.net)

| Document | Path | Content |
|----------|------|---------|
| **This file** | `.cursor/plans/CURRENT_STATE.md` | Quick context for new agents |
| **ActiveProxy Fix** | `.cursor/plans/activeproxy_fix.md` | Detailed ActiveProxy work |
| **Roadmap** | `.cursor/plans/Roadmap.md` | Post-launch roadmap with tracks |
| **Jetson SDK** | `.cursor/plans/jetson_sdk_optimization_3c7e940c.plan.md` | GPU acceleration plan |
| **Flint Upgrade** | `.cursor/plans/upgrade_flint_ai_agent_4946c79b.plan.md` | AI agent knowledge base plan |
| **Work Summary** | `docs/WORK_SUMMARY.md` | Complete development history across all branches |

### Public Documentation Site (docs.ela.city)

> **IMPORTANT:** The public docs site is in a SEPARATE repository:
> **https://github.com/Elacity/document-portal** (deployed via Vercel)
>
> Do NOT edit `Elacity/ElacityLabsWeb` for docs — that repo has a `docs/` subfolder
> but it is NOT the live docs.ela.city site. The Render "elacity-docs" service
> is from ElacityLabsWeb and is a legacy/duplicate.
>
> When updating public documentation, clone and push to `document-portal`.
> Local clone: `/Users/mtk/Documents/Cursor/document-portal`

---

## Community Testing Command

When the Jetson community member needs to update:

```bash
pm2 delete all && cd ~/pc2.net && git stash && git pull origin feature/jetson-gpu-acceleration && cd pc2-node && npm run build && pm2 start npm --name pc2 -- start && sleep 10 && pm2 logs pc2 --lines 50
```

Expected success: AUTH_ACK → port allocated → endpoint registered → CONNECT from browser → DATA relay works → `elastos.ela.city` loads the PC2 dashboard.

---

## Environment Notes

- **Node.js:** v20+ required (v22 LTS preferred for Electron launcher)
- **Java Boson server:** Cannot be modified (binary, runs on supernode)
- **Encryption:** NaCl (tweetnacl) — CryptoBox with precomputed shared keys
- **Config:** `pc2-node/config/default.json` has supernode list (base58 public keys)
- **PM2:** Process manager on VPS/Jetson deployments
- **The `CONTABO_NODE_01` supernode ID** in some configs is a placeholder — it gets skipped with a harmless warning
