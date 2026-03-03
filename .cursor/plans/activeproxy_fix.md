---
name: ActiveProxy NAT Traversal Fix
overview: Complete rewrite of the ActiveProxy protocol implementation to match the Java Boson server, enabling username.ela.city domains for PC2 nodes behind NAT.
status: testing
branch: feature/jetson-gpu-acceleration
todos:
  - id: protocol-rewrite
    content: Rewrite ActiveProxyClient.ts to match Java server protocol (decompiled from boson-active-proxy-2.0.8-SNAPSHOT.jar)
    status: completed
  - id: key-format-fix
    content: Fix Ed25519 key format conversion (PKCS8 DER 48 bytes → raw 64 bytes)
    status: completed
  - id: port-registration
    content: Use allocatedPort from AUTH_ACK instead of static proxyPort 8090
    status: completed
  - id: connected-event
    content: Register 'connected' handler BEFORE connect() to prevent event being missed
    status: completed
  - id: gateway-proxy
    content: Replace gateway's custom ActiveProxy protocol with http-proxy to Java allocated port
    status: completed
  - id: domain-removal
    content: Remove domain from AUTH (Java helper service not configured, crashes connection)
    status: completed
  - id: senddata-chunking
    content: Chunk sendData payloads to prevent RangeError when relay data exceeds 65535 bytes
    status: completed
  - id: community-testing
    content: Verify fix on Jetson device with community member (EverlastingOS)
    status: in_progress
  - id: merge-to-main
    content: Merge feature/jetson-gpu-acceleration to main once ActiveProxy is confirmed working
    status: pending
isProject: false
---

# ActiveProxy NAT Traversal Fix

## Problem Statement

PC2 nodes behind NAT (e.g., Jetson devices on home networks) could not be reached via their `username.ela.city` domains. The ActiveProxy connection to the Boson Java supernode was failing due to multiple protocol mismatches between the PC2 Node.js client and the Java server.

## Branch

`feature/jetson-gpu-acceleration` — all ActiveProxy fixes are on this branch.

**Latest commit:** `91ec216b` — fix: chunk sendData to prevent RangeError on large relay payloads

## Architecture

```
User's Browser
    → elastos.ela.city (DNS → Supernode)
    → Nginx (TLS termination)
    → web-gateway (Node.js, port 80)
        → Checks registered endpoints for "elastos" username
        → If proxy://host:port/sessionId → http-proxy to Java allocated port
    → Java Boson Server (allocated port, e.g., 25010)
        → Encrypted tunnel relay
    → PC2 Node (behind NAT, connected via ActiveProxy on port 8090)
        → Decrypts DATA → forwards to localhost:4200
        → localhost:4200 response → encrypts → sends back as DATA
    → User sees the PC2 dashboard
```

## Root Causes Found & Fixed

### 1. Ed25519 Key Format Mismatch (Fixed)

**File:** `pc2-node/src/services/boson/IdentityService.ts` (on main)

The PC2 node stored keys in PKCS8 DER format (48 bytes) but the CryptoBox expected raw Ed25519 (64 bytes). Fixed by converting PKCS8 DER → raw Ed25519 in `getKeypair()`.

**Error:** `Invalid Ed25519 private key length: 48, expected 64`

### 2. Protocol Rewrite (Fixed)

**File:** `pc2-node/src/services/boson/ActiveProxyClient.ts`

The entire ActiveProxy client was rewritten based on decompiled Java server source (`boson-active-proxy-2.0.8-SNAPSHOT.jar`). Key changes:

- **Packet format:** Correct 2-byte length prefix + 1-byte type = 3-byte header (was using wrong sizes)
- **PacketType mapping:** Matches Java's `PacketType.valueOf()` exactly:
  - AUTH = 0x00, AUTH_ACK = 0x80-0x87
  - ATTACH = 0x08, ATTACH_ACK = 0x88
  - PING = 0x10, PING_ACK = 0x90
  - CONNECT = 0x20, CONNECT_ACK = 0xA0
  - DATA = 0x30+
  - DISCONNECT = 0x40, DISCONNECT_ACK = 0xC0
  - ERROR = 0x50+
- **PING packets:** Unencrypted 3-byte `[len=3][type=0x10]` (was sending 43-byte encrypted packets that the server misinterpreted)
- **AUTH flow:** Challenge signing, session keypair, connection nonce, encrypted payload with identity keys
- **Session encryption:** `DH(clientSessionSk, serverSessionPk)` via `nacl.box.before` with fixed connection nonce
- **No domain in AUTH:** Java server's helper service is not configured, sending domain crashes the connection (commit `bf3cf033`)

### 3. Port Registration (Fixed)

**File:** `pc2-node/src/services/boson/ConnectivityService.ts`

Was registering `proxy://host:8090/sessionId` (the AUTH port). Fixed to use `allocatedPort` from AUTH_ACK (e.g., `proxy://host:25010/sessionId`). The allocated port is where the Java server relays traffic.

### 4. Connected Event Timing (Fixed)

**File:** `pc2-node/src/services/boson/ConnectivityService.ts`

The `connected` event was emitted during `connect()` (inside AUTH_ACK processing). If the handler was registered after `connect()` resolved, it was missed. Fixed by registering the handler BEFORE calling `connect()`.

### 5. Gateway Protocol Mismatch (Fixed)

**File:** `deploy/web-gateway/index.js`

The gateway had a custom `ActiveProxySession` class that tried to speak the ActiveProxy protocol to the Java server's allocated port. But the allocated port is a transparent TCP relay — it just forwards bytes. Replaced with `http-proxy` library for plain HTTP/WebSocket forwarding.

### 6. sendData Overflow (Fixed — Latest)

**File:** `pc2-node/src/services/boson/ActiveProxyClient.ts`

When relaying HTTP responses back through the tunnel, data larger than ~65KB caused `RangeError: value 65555 > 65535` because the 2-byte packet length field maxes at 65535, and NaCl encryption adds 16 bytes. Fixed by chunking payloads into segments of max 65516 bytes (65535 - 3 header - 16 MAC).

**Error:** `RangeError [ERR_OUT_OF_RANGE]: The value of "value" is out of range. It must be >= 0 and <= 65535. Received 65555`

This crash also caused subsequent reconnect failures ("Socket closed" after AUTH) because the Java server still had a stale session for the nodeId.

## Current Status

**Testing in progress** with community member EverlastingOS on a Jetson device.

Latest test results (Feb 8, 2026):
- AUTH succeeds, AUTH_ACK received, port allocated (25010)
- Endpoint registered at `elastos.ela.city`
- CONNECT received from browser (someone accessed elastos.ela.city)
- **Crashed on DATA relay** due to sendData overflow → Fixed in `91ec216b`
- Community member needs to pull latest and rebuild

### What Community Member Needs to Run

```bash
pm2 delete all && cd ~/pc2.net && git stash && git pull origin feature/jetson-gpu-acceleration && cd pc2-node && npm run build && pm2 start npm --name pc2 -- start && sleep 10 && pm2 logs pc2 --lines 50
```

### Expected Success Indicators in Logs

```
[ActiveProxy] TCP connection established, waiting for ServerHello...
[ActiveProxy] Received server challenge: XX bytes
[ActiveProxy] Building AUTH packet...
[ActiveProxy] Sending AUTH packet: 172 bytes
[ActiveProxy] AUTH_ACK received!
[ActiveProxy] Allocated port: XXXXX
[ActiveProxy] Sent initial PING (keepalive)
✅ Active Proxy connected! Session: XXXX, Allocated Port: XXXXX
✅ Endpoint updated for elastos
📍 Registered proxy endpoint: https://elastos.ela.city
```

Then when someone accesses `elastos.ela.city`:
```
[ActiveProxy] 🔗 CONNECT from X.X.X.X:XXXXX
🔌 New proxied connection 0 from X.X.X.X:XXXXX
```

### Known Non-Critical Warnings

- `[Connectivity] Invalid supernode ID 'CONTABO_NODE_01', skipping` — harmless, second supernode in config has placeholder ID
- `wasm streaming compile failed` — ed25519-to-x25519.wasm falls back to ArrayBuffer, works fine
- `⚠️ No owner wallet set` — expected until user authenticates

## Files Modified (vs main)

| File | Change |
|------|--------|
| `pc2-node/src/services/boson/ActiveProxyClient.ts` | Complete protocol rewrite (~900 lines changed) |
| `pc2-node/src/services/boson/ProxyProtocol.ts` | Rewritten to match Java PacketType enum |
| `pc2-node/src/services/boson/ConnectivityService.ts` | Port registration + event timing fixes |
| `pc2-node/src/services/boson/index.ts` | Updated exports |
| `deploy/web-gateway/index.js` | http-proxy for ActiveProxy relay endpoints |
| `pc2-node/src/utils/platform.ts` | NEW — Jetson platform detection |
| `pc2-node/src/api/system.ts` | NEW — System info API |
| `pc2-node/src/api/ai.ts` | Ollama GPU status |
| `pc2-node/src/services/ai/providers/OllamaProvider.ts` | Jetson optimizations |
| `pc2-node/src/services/ai/AIChatService.ts` | AI service enhancements |
| `pc2-node/config/default.json` | Config updates |

## After Merge: What Needs to Happen

1. **Confirm ActiveProxy works** on the Jetson (community testing)
2. **Update web-gateway on supernode** — the `deploy/web-gateway/index.js` changes need to be deployed to the live supernode at `69.164.241.210`
3. **Merge to main** — once confirmed working
4. **All PC2 nodes update** — users run their update commands to get the new ActiveProxy code
5. **Test with multiple concurrent nodes** — verify the Java server handles multiple ActiveProxy sessions

## Related Documentation

- [Roadmap](./Roadmap.md) — Post-launch roadmap
- [Jetson SDK Optimization](./jetson_sdk_optimization_3c7e940c.plan.md) — GPU acceleration plan
- [Flint AI Agent Upgrade](./upgrade_flint_ai_agent_4946c79b.plan.md) — Agent knowledge base
