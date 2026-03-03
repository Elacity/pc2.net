# PC2 v1 -> ElastOS Runtime v2: Architecture Convergence Guide

**Purpose:** Understand exactly how the current shipping PC2 system maps to Anders' ElastOS Runtime vision, where they overlap, where they diverge, and what the convergence path looks like.

**Audience:** Sasha (product/dev lead) -- study this to align on the technical roadmap.

---

## Part 1: The Two Systems Side by Side

### What PC2 v1 Is (Today)

A **Node.js application** that turns any computer into a personal cloud. It serves a Puter desktop, stores files in IPFS, authenticates users via MetaMask, and punches through NATs so you can reach your node from anywhere via `yourname.ela.city`.

```
┌──────────────────────────────────────────────────────────┐
│                     PC2 Node (Node.js)                   │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Express  │ │  Puter   │ │  IPFS    │ │  SQLite    │  │
│  │ HTTP API │ │ Frontend │ │ (Helia)  │ │  Database  │  │
│  │          │ │ (static) │ │          │ │            │  │
│  └────┬─────┘ └──────────┘ └──────────┘ └────────────┘  │
│       │                                                  │
│  ┌────┴─────────────────────────────────────────────┐    │
│  │              API Endpoints                        │    │
│  │  /file, /read, /write, /readdir, /sign, /whoami  │    │
│  │  /apps/*, /ipfs/:cid, /public/:wallet/*          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Connectivity Layer                      │    │
│  │  WireGuard (primary) + Boson ActiveProxy (fallback)│   │
│  │  Registers with Supernode -> yourname.ela.city    │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Security Model: Wallet signature -> session token       │
│  Apps: Run directly in browser (no sandbox)              │
│  Trust: Everything inside the node is trusted            │
└──────────────────────────────────────────────────────────┘
```

**Key characteristics:**
- Single process, single language (TypeScript)
- Apps (PDF viewer, image editor, player) are just HTML/JS served as static files
- No sandboxing -- apps can access any API endpoint with the session token
- Authentication = MetaMask wallet signature
- Files stored in IPFS, metadata in SQLite
- Works today on Jetsons, VPS, laptops

---

### What Anders' ElastOS Runtime Is (Building)

A **Rust binary** that acts as a minimal, secure kernel for personal computing. Everything runs inside sandboxes (WASM or Firecracker VMs). Nothing has access to anything unless it presents a cryptographic capability token. Every action is logged.

```
┌──────────────────────────────────────────────────────────┐
│               ElastOS Runtime (Rust binary)               │
│                    "The Trusted Base"                      │
│                                                          │
│  Only does 4 things:                                     │
│  1. Isolation  (WASM sandbox / Firecracker VM)           │
│  2. Signatures (Ed25519 verify all code before loading)  │
│  3. Capability tokens (issue, validate, revoke)          │
│  4. Content fetch (resolve elastos:// addresses)         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                    Axum HTTP API                    │  │
│  │  /api/capability/*, /api/capsules/*, /api/storage/*│  │
│  └────────────┬───────────────────────────────────────┘  │
│               │                                          │
│  ┌────────────┴───────────────────────────────────────┐  │
│  │              Capsule Sandboxes                      │  │
│  │                                                    │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │  Shell  │  │ local:// │  │   Your App       │  │  │
│  │  │ (Puter) │  │ provider │  │  (WASM binary)   │  │  │
│  │  │ in VM   │  │ (WASM)   │  │  zero access     │  │  │
│  │  └─────────┘  └──────────┘  └──────────────────┘  │  │
│  │                                                    │  │
│  │  Every capsule starts with ZERO permissions.       │  │
│  │  Must request tokens to do anything.               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Security Model: Capability tokens (scoped, signed,      │
│                  expirable, revocable, audited)           │
│  Apps: Sandboxed in WASM or Firecracker VM               │
│  Trust: Only the runtime binary is trusted               │
└──────────────────────────────────────────────────────────┘
```

**Key characteristics:**
- Pure Rust, zero OpenSSL
- Puter runs INSIDE a Firecracker microVM (not served as static files)
- Every app is a "capsule" -- sandboxed, content-addressed, signed
- Capability tokens replace session tokens (much more granular)
- WebAuthn/Passkeys for identity (planned: MetaMask/SIWE too)
- Networking NOT YET BUILT (Phase 10 of 13)

---

## Part 2: The Mental Model Shift

### PC2 v1 thinks like a Web Server

```
Browser ──HTTP──> Node.js Server ──> Files, Apps, APIs

The server trusts itself. Apps trust the server. 
The browser trusts the server via HTTPS.
One session token = access to everything.
```

### ElastOS Runtime thinks like an Operating System

```
User ──> Shell (sandboxed) ──token──> Runtime ──token──> Provider (sandboxed)
                                                    ──token──> App (sandboxed)

Nothing trusts anything. Every action needs a signed token.
Every token is scoped: "read photos/ for 1 hour."
Every action is logged in an append-only audit trail.
```

### Why This Matters

In PC2 v1, if an app has your session token, it can:
- Read ALL your files
- Write to ANY location
- Access ANY API endpoint
- There's no record of what it did

In Anders' system, an app can ONLY:
- Do what its capability token explicitly allows
- For the duration the token specifies
- And every action is recorded in the audit log
- The app literally cannot open a network socket without a token

**This is the fundamental difference.** PC2 v1 is a convenient personal cloud. Anders' system is a secure personal computer where AI agents and apps are untrusted by default.

---

## Part 3: Where They Overlap (Shared DNA)

These are the components that both systems use or plan to use:

```
┌─────────────────────────────────────────────────────────┐
│                    SHARED FOUNDATIONS                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Puter Desktop Shell                              │   │
│  │  PC2: served as static HTML/JS by Express         │   │
│  │  Anders: runs inside a Firecracker microVM        │   │
│  │  SAME Puter codebase, different hosting model     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  IPFS Content Addressing                          │   │
│  │  PC2: Helia (JS) for file storage                 │   │
│  │  Anders: IPFS for capsule distribution + storage  │   │
│  │  SAME CID format, data is portable between them   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Supernode Gateway Concept                        │   │
│  │  PC2: Node.js proxy on 69.164.241.210             │   │
│  │  Anders: "gateway-supernode" capsule (Rust/Rathole)│  │
│  │  SAME idea: public relay -> private node          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  NAT Traversal                                    │   │
│  │  PC2: WireGuard + Boson ActiveProxy (working)     │   │
│  │  Anders: Boson + Rathole + Iroh (planned)         │   │
│  │  SAME problem, PC2 has battle-tested solutions    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  *.ela.city Domains                               │   │
│  │  PC2: DNS + gateway proxy (live)                  │   │
│  │  Anders: "pc2.net" domains (planned, Phase 10)    │   │
│  │  SAME user-facing experience                      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Part 4: Where They Diverge (Incompatible Today)

```
┌─────────────────────────┬──────────────────────────────┐
│       PC2 v1            │     Anders' Runtime          │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  LANGUAGE               │  LANGUAGE                    │
│  TypeScript / Node.js   │  Pure Rust                   │
│  npm ecosystem          │  Cargo/crates ecosystem      │
│  V8 runtime             │  Native binary               │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  APP MODEL              │  APP MODEL                   │
│  HTML/JS in browser     │  WASM binaries or            │
│  iframes, no sandbox    │  Firecracker microVMs        │
│  Full API access        │  Zero access by default      │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  SECURITY               │  SECURITY                    │
│  Session token = all    │  Capability tokens per       │
│  access. No audit.      │  resource, per action,       │
│  Trust the server.      │  time-limited, audited.      │
│                         │  Trust only the runtime.     │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  AUTHENTICATION         │  AUTHENTICATION              │
│  MetaMask wallet sign   │  WebAuthn/Passkeys           │
│  EVM addresses          │  Planned: SIWE + Elastos DID │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  STORAGE                │  STORAGE                     │
│  Built into server      │  Provider capsule            │
│  (filesystem.ts)        │  (local-provider, sandboxed) │
│  Direct IPFS access     │  Accessed via tokens only    │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         │                              │
│  PUTER HOSTING          │  PUTER HOSTING               │
│  Static files served    │  Full Linux VM via           │
│  by Express.js          │  Firecracker (needs KVM)     │
│  Works everywhere       │  Linux-only (no macOS)       │
│                         │                              │
└─────────────────────────┴──────────────────────────────┘
```

---

## Part 5: Anders' Layered Architecture (Explained Simply)

Anders thinks in layers. Each layer only talks to the one below it:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  LAYER 3: APPLICATIONS (untrusted)                       │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │  Chat  │ │  Notes │ │  Photo │ │   AI   │           │
│  │  App   │ │  App   │ │ Editor │ │ Agent  │           │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘           │
│      │          │          │          │                  │
│      │  "I need access to chat://bob"  │                 │
│      │  "I need to read local://photos"│                 │
│      ▼          ▼          ▼          ▼                  │
│                                                          │
│  LAYER 2: PROVIDERS (background services)                │
│  ┌──────────┐ ┌───────────────┐ ┌──────────────────┐   │
│  │ local:// │ │ chat-provider │ │ gateway-client   │   │
│  │ storage  │ │ (Iroh P2P)    │ │ (NAT traversal)  │   │
│  └──────────┘ └───────────────┘ └──────────────────┘   │
│                                                          │
│  These run in sandboxes too. They register protocols     │
│  (local://, chat://) and handle the actual work.         │
│      │                                                   │
│      ▼                                                   │
│                                                          │
│  LAYER 1: THE SHELL (orchestrator)                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Puter Desktop (in Firecracker VM)                │   │
│  │                                                    │   │
│  │  - Shows permission prompts to user                │   │
│  │  - "Chat App wants access to chat://bob. Allow?"   │   │
│  │  - Launches/stops capsules                         │   │
│  │  - Manages the UI you see                          │   │
│  └──────────────────────────────────────────────────┘   │
│      │                                                   │
│      ▼                                                   │
│                                                          │
│  LAYER 0: THE RUNTIME (the only trusted code)            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  elastos binary (Rust)                             │   │
│  │                                                    │   │
│  │  - Runs sandboxes (WASM + Firecracker)             │   │
│  │  - Verifies code signatures before loading         │   │
│  │  - Issues and validates capability tokens          │   │
│  │  - Fetches content by hash (elastos://Qm...)       │   │
│  │  - Writes immutable audit log                      │   │
│  │                                                    │   │
│  │  This is ALL you have to trust. ~5000 lines.       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### The Key Insight: Everything Is a Capsule

In Anders' words: *"Capsules are like DLL files, called when needed by other capsules."*

There is no "server code" like PC2's `file.ts` or `filesystem.ts`. Instead:

- **Storage** is a capsule (`local-provider`) that registers the `local://` protocol
- **Networking** is a capsule (`gateway-client`) that maintains the tunnel
- **The desktop** is a capsule (Puter in a VM) that shows the UI
- **Apps** are capsules that request access to resources

The runtime just routes messages between capsules and enforces token-based access.

### Concrete Example: Playing BELLA_DANCING.MP4

Anders gave this specific walkthrough. It's the clearest way to understand how capsules chain together:

```
The runtime boots and loads the SHELL (first capsule -- Puter desktop).
The shell has special orchestrating abilities (launching/stopping capsules).

   ┌─────────────────────────────────────────────────────────┐
   │  SHELL (Puter Desktop)                                   │
   │                                                          │
   │  Desktop shows an icon: BELLA_DANCING.MP4                │
   │                                                          │
   │  That icon exists because the shell already called:      │
   │  • IPFS capsule (fetched the file metadata)              │
   │  • Identity capsule (verified ownership)                 │
   │  • Elacity SDK capsule (checked DRM rights)              │
   │  • Possibly more capsules behind the scenes              │
   │                                                          │
   │  User double-clicks the icon...                          │
   └─────────────────────┬───────────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Shell starts a NEW CAPSULE: the Media Capsule           │
   │                                                          │
   │  The Media Capsule then calls:                           │
   │  • Media Player capsule (video rendering)                │
   │  • Codec capsule (AV1/H.264 decoding)                   │
   │  • IPFS capsule (streaming bytes)                        │
   │  • Audio capsule (sound output)                          │
   │  • Every other capsule the player needs to function      │
   │                                                          │
   │  A new window opens in the desktop.                      │
   │  That window is either:                                  │
   │  • An iframe (web-based player)                          │
   │  • Pure pixel output from the capsule (native rendering) │
   └─────────────────────────────────────────────────────────┘
```

The critical point: **each capsule is independent**. If you need to fix the IPFS capsule, the shell and runtime are untouched. If you need to update the media player, nothing else changes. Each capsule has its own CID (content hash) and gets upgraded separately.

### Anders' View of PC2 v1

In his words: *"What you built now is like a functional interactive mockup without the long-term security/architecture. Very useful to define the product, get users excited, and actually providing real value from an early stage."*

This is an accurate and fair assessment. PC2 v1 proves the product works and people want it. The runtime provides the architecture to make it secure and maintainable long-term.

---

## Part 5b: Why Capsules Beat Monoliths (Anders' Argument)

This is the core of Anders' philosophy. Understand this and you understand his entire approach.

### The Monolith Problem (PC2 v1 Today)

```
┌──────────────────────────────────────────────────────────┐
│                    PC2 REPO (monolith)                    │
│                                                          │
│  Express API + IPFS storage + Puter frontend +           │
│  WireGuard service + Boson service + file handlers +     │
│  WebSocket + auth + AI chat + terminal + apps +          │
│  updater + backup + ... ALL IN ONE REPO                  │
│                                                          │
│  Any change = new PC2 version                            │
│  Any change COULD affect or break anything else          │
│  Every developer works in the same codebase              │
│  1000s of issues/PRs/forks all in one place              │
│                                                          │
│  Like Windows or macOS: huge monolith codebase that      │
│  is near impossible to fully trust and increasingly      │
│  harder to develop and keep stable.                      │
└──────────────────────────────────────────────────────────┘
```

### The Capsule Solution (ElastOS Runtime)

```
┌────────────────────────────────┐
│  RUNTIME (minimal, ~5000 LOC)  │  ← Like Bitcoin Core:
│                                │    only changes under
│  Isolation + Signatures +      │    long, hard scrutiny
│  Capability tokens + Fetch     │
└───────────────┬────────────────┘
                │ loads capsules on demand
    ┌───────────┼───────────────────────────────┐
    │           │           │           │       │
    ▼           ▼           ▼           ▼       ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Shell  │ │  IPFS  │ │ Player │ │Identity│ │Network │
│capsule │ │capsule │ │capsule │ │capsule │ │capsule │
│        │ │        │ │        │ │        │ │        │
│own repo│ │own repo│ │own repo│ │own repo│ │own repo│
│own CID │ │own CID │ │own CID │ │own CID │ │own CID │
│own devs│ │own devs│ │own devs│ │own devs│ │own devs│
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘

Each capsule:
  • Has its own repo, issues, PRs
  • Is upgraded independently (new CID)
  • Cannot break other capsules
  • A dev working on the player never touches IPFS code
  • The core stays clean and minimal
```

### Anders' Analogy: OpenClaw

*"Look at the OpenClaw repo. The number of issues, pull requests, discussions. How is this manageable compared to a hypothetical minimal OpenClaw core without plugins + 1000s of independent plugins that interface with OpenClaw with their own repos?"*

*"Do we want everyone to work on everything in one place? Or do we distribute so the core stays clean, like a Bitcoin core client, only changing under long and hard scrutiny, and a dev concerned about email capabilities works on the email-plugin without the distractions from 1000s of issues/PRs/forks in the monolith repo?"*

The answer Anders is driving at: **the runtime IS the platform, capsules ARE the ecosystem.** The runtime should be as boring and unchanging as possible. All the innovation happens in capsules.

---

## Part 6: How a File Read Works in Both Systems

### PC2 v1 (Current)

```
1. User clicks file in Puter
2. Browser sends GET /file?uid=uuid-...-test.pdf
   Header: Authorization: Bearer <session-token>
3. Express middleware checks session token (valid? yes)
4. file.ts looks up metadata in SQLite
5. file.ts calls filesystem.readFile() 
6. filesystem.ts calls ipfs.getFile()
7. IPFS returns raw bytes
8. Express sends bytes to browser
9. No record of who read what
```

### Anders' ElastOS Runtime (V2 Vision)

```
1. User clicks file in Puter Shell
2. PDF App requests: "I need read access to local://documents/test.pdf"
3. Shell shows prompt: "PDF Viewer wants to read test.pdf. Allow?"
4. User clicks Allow (with 1-hour expiry)
5. Runtime creates Ed25519 signed token:
   {
     capsule: "pdf-viewer",
     resource: "local://documents/test.pdf",
     action: "read",
     expires: "2026-02-21T11:00:00Z",
     signature: <ed25519>
   }
6. PDF App presents token to Runtime
7. Runtime validates token (signature, expiry, scope, epoch)
8. Runtime routes request to local-provider capsule
9. local-provider reads from IPFS, returns bytes
10. Runtime pipes bytes to PDF App
11. Audit log entry written:
    [09:05:32] pdf-viewer READ local://documents/test.pdf (token: abc123)
```

The difference: in PC2, one token = access to everything forever. In Anders' system, one token = access to one resource for a limited time, with a receipt.

---

## Part 7: The Convergence Roadmap

```
TIMELINE
═══════════════════════════════════════════════════════════════

NOW                     3-6 MONTHS              6-12 MONTHS
v1.x                    v1.5 (bridge)           v2.0 (converged)
─────────────────────── ─────────────────────── ──────────────

PC2 Node.js             PC2 modularized         Anders' Rust Runtime
(shipping today)        (capsule-ready)         (production-ready)
                                                    │
┌─────────────────┐     ┌─────────────────┐     ┌──┴──────────────┐
│                 │     │                 │     │                  │
│  Express API    │────>│  API as modules │────>│  Axum API        │
│  (monolith)     │     │  with clean     │     │  (runtime core)  │
│                 │     │  interfaces     │     │                  │
├─────────────────┤     ├─────────────────┤     ├──────────────────┤
│                 │     │                 │     │                  │
│  filesystem.ts  │────>│  Storage module │────>│  local-provider  │
│  ipfs.ts        │     │  (capsule-like  │     │  capsule (WASM)  │
│  (built-in)     │     │   interface)    │     │                  │
├─────────────────┤     ├─────────────────┤     ├──────────────────┤
│                 │     │                 │     │                  │
│  WireGuard +    │────>│  Gateway module │────>│  gateway-client  │
│  Boson service  │     │  (capsule-like  │     │  capsule (Rust)  │
│  (built-in)     │     │   interface)    │     │                  │
├─────────────────┤     ├─────────────────┤     ├──────────────────┤
│                 │     │                 │     │                  │
│  Puter (static) │────>│  Puter (static  │────>│  Puter (in       │
│                 │     │   + extension)  │     │  Firecracker VM) │
├─────────────────┤     ├─────────────────┤     ├──────────────────┤
│                 │     │                 │     │                  │
│  Session token  │────>│  Session token  │────>│  Capability      │
│  (one key for   │     │  + WebAuthn     │     │  tokens (scoped, │
│   everything)   │     │  (dual auth)    │     │  signed, logged) │
│                 │     │                 │     │                  │
├─────────────────┤     ├─────────────────┤     ├──────────────────┤
│                 │     │                 │     │                  │
│  No sandboxing  │────>│  CSP headers +  │────>│  WASM + Firecrkr │
│                 │     │  iframe sandbox │     │  (full isolation) │
│                 │     │                 │     │                  │
└─────────────────┘     └─────────────────┘     └──────────────────┘

USERS: Jetson owners,    USERS: Same + early     USERS: Everyone.
community testers        adopters, developers    AI agents as
                                                 first-class users.
```

---

## Part 8: What "Capsule-Ready" Means for PC2 v1.5

The bridge version doesn't require rewriting PC2 in Rust. It means:

### 1. Define Clean Interfaces for Storage

Instead of `filesystem.ts` calling `ipfs.ts` directly, define an interface:

```typescript
// This interface maps to what a local-provider capsule will do in v2
interface StorageProvider {
  read(path: string, wallet: string): Promise<Buffer>;
  write(path: string, wallet: string, data: Buffer): Promise<void>;
  list(path: string, wallet: string): Promise<FileMetadata[]>;
  getSize(path: string, wallet: string): Promise<number>;
  readStream(path: string, wallet: string, opts?: RangeOpts): AsyncGenerator<Uint8Array>;
}
```

### 2. Define Clean Interfaces for Connectivity

```typescript
// This interface maps to what a gateway-client capsule will do in v2
interface ConnectivityProvider {
  connect(supernodes: string[]): Promise<Connection>;
  getPublicURL(): string;          // e.g., "https://alice.ela.city"
  getConnectionType(): 'wireguard' | 'boson' | 'direct';
}
```

### 3. Add WebAuthn Alongside MetaMask

```
v1.0: MetaMask only
v1.5: MetaMask + WebAuthn/Passkeys (user chooses)
v2.0: WebAuthn primary, MetaMask via SIWE, Elastos DID
```

### 4. Start Logging What Matters

Even without capability tokens, start recording:
- Which app accessed which file
- When and from where
- This becomes the seed data for v2's audit log

---

## Part 9: The Capability Token Model (Anders' Core Innovation)

This is the most important concept to understand. Everything else follows from it.

### Today's Model (PC2 v1): Ambient Authority

```
Session Token = "You are wallet 0x416d...21b1"

With this token, you can:
  - Read ANY file          (no restriction)
  - Write ANYWHERE         (no restriction)
  - Delete ANYTHING        (no restriction)
  - Access ALL apps        (no restriction)
  - No expiry              (until logout)
  - No audit trail         (no record)
```

### Anders' Model: Capability Tokens

```
Token #1 = {
  holder:   "pdf-viewer-capsule",
  resource: "local://documents/report.pdf",
  action:   "read",
  expires:  "2026-02-21T11:00:00Z",
  uses:     1,
  epoch:    42,
  signature: <ed25519 by runtime>
}

Token #2 = {
  holder:   "photo-editor-capsule",
  resource: "local://photos/*",
  action:   "read,write",
  expires:  "2026-02-21T10:30:00Z",
  uses:     unlimited,
  epoch:    42,
  signature: <ed25519 by runtime>
}

With Token #1, the PDF viewer can:
  - Read report.pdf        (only this file)
  - For 1 hour             (then token expires)
  - Once                   (single use)
  - And it's logged        (audit trail)
  
  It CANNOT:
  - Read other files
  - Write anything
  - Access the network
  - Talk to other apps
```

### Why This Matters for AI Agents

```
WITHOUT capability tokens (PC2 v1):
  AI Agent gets session token -> can read ALL your files
  You just have to trust it won't look at your medical records

WITH capability tokens (v2):
  AI Agent: "I need to read local://documents/meeting-notes.txt"
  Shell: "AI Writing Assistant wants to read meeting-notes.txt. Allow?"
  You: "Yes, for 30 minutes"
  AI Agent gets scoped token -> can ONLY read that one file
  Audit log records exactly what it accessed
```

---

## Part 10: The Protocol Addressing System

Anders introduces a unified way to address ANY resource:

```
local://documents/report.pdf        Your local encrypted storage
localhost://storage/notes/hello      PC2 local storage API
google://drive/photos/vacation       Google Drive (via provider capsule)
peer://alice/shared/music            A friend's node (via P2P)
ai://claude/chat                     An AI model (via provider capsule)
elastos://QmXk8r9vW...              Content by hash (IPFS)
chat://bob/sync                      Chat messages (via chat-provider)
```

The app doesn't know or care WHERE the data lives. It asks for a resource by protocol, and the matching provider capsule handles it.

In PC2 v1, we only have:
```
/file?uid=...                        Local file by signed URL
/read?file=...                       Local file by path
/ipfs/:cid                           IPFS content by hash
/public/:wallet/*                    Public files by wallet
```

The v2 protocol system is a superset. PC2's endpoints would become:
- `/file?uid=...` -> `local://path/to/file` (via local-provider capsule)
- `/ipfs/:cid` -> `elastos://Qm...` (via IPFS content resolution)
- `/public/:wallet/*` -> `peer://wallet/Public/*` (via networking)

---

## Part 11: What You Should Ask Anders

Based on this analysis and Anders' own explanations, these are the conversations that need to happen:

### 1. "Can we define the capsule interfaces NOW?"

Even if the Rust runtime isn't ready, agreeing on what a `StorageProvider` capsule looks like lets PC2 start building toward it. The interface is the contract. Anders said capsules are like DLLs -- what does the "function signature" of a capsule look like? What's the standardized interface format?

### 2. "Phase 10 (networking) should use our WireGuard + Boson code"

We've spent weeks making NAT traversal work reliably. The gateway supernode, WireGuard provisioning, Boson fallback -- this shouldn't be reinvented. Ask how to wrap it as a capsule. Given that each capsule has its own CID, how does the networking capsule get the runtime's host-level access it needs (kernel WireGuard, port binding)?

### 3. "What about Firecracker on Jetson/ARM?"

Firecracker needs KVM. Jetson has ARM64 Linux with KVM support, but has anyone tested Firecracker on Jetson Orin Nano? This is a potential blocker for v2 on edge devices.

### 4. "What about macOS development?"

Firecracker doesn't run on macOS (no KVM). How do developers test locally? WASM-only mode? This affects the development experience.

### 5. "Timeline for Phase 10-11?"

Networking and wallet auth are what make PC2 useful. If Phase 10-11 are 6+ months away, PC2 v1.x needs to keep evolving independently. If they're 2-3 months away, we should start the bridge work now.

### 6. "What does the capsule dev experience look like?"

Anders argues that distributed repos (one per capsule) are better than a monolith. Practically: how does a capsule developer test their capsule locally? Is there a local runtime emulator? Can capsules be hot-reloaded during development? What's the `npm publish` equivalent for shipping a new capsule CID?

### 7. "What's the window model: iframe or pixel?"

Anders mentioned capsules can render as either an iframe or "pure pixel output." What decides which mode is used? Does the capsule declare its rendering preference? How does the shell composite pixel-rendered capsule windows?

---

## Part 12: Summary -- One Page View

```
╔═════════════════════════════════════════════════════════════════╗
║                                                                 ║
║  PC2 v1 (NOW)              ElastOS Runtime (BUILDING)           ║
║  ───────────               ──────────────────────               ║
║  Node.js/TypeScript        Pure Rust                            ║
║  Monolith repo             Minimal runtime + capsules           ║
║  No sandboxing             WASM + Firecracker                   ║
║  Session tokens            Capability tokens                    ║
║  MetaMask auth             WebAuthn + planned SIWE              ║
║  Working networking        No networking yet                    ║
║  Live on Jetsons           Demo/test stage                      ║
║                                                                 ║
║  PC2 = "functional interactive mockup" (Anders' words)          ║
║  Runtime = long-term secure architecture for the same product   ║
║                                                                 ║
║  SHARED: IPFS, Puter, Supernode concept, *.ela.city domains    ║
║                                                                 ║
║  CONVERGENCE PATH:                                              ║
║  v1.x  = Ship PC2, prove the product, grow community           ║
║  v1.5  = Modularize PC2 toward capsule interfaces              ║
║  v2.0  = Anders' Runtime hosts PC2's functionality as capsules  ║
║                                                                 ║
║  KEY INSIGHT: The runtime IS the platform, capsules ARE the     ║
║  ecosystem. Runtime = boring/stable. Innovation = capsules.     ║
║                                                                 ║
║  RISK: Two systems growing apart. MITIGATION: Define capsule   ║
║  interfaces NOW and build toward them from both sides.          ║
║                                                                 ║
╚═════════════════════════════════════════════════════════════════╝
```

---

## Part 13: Latest Architecture Model (Feb 28, 2026)

The architecture discussions this week crystallized the three-layer model and established definitive terminology. This supersedes the four-layer model in Part 5 above — the concepts are the same, but the naming and boundaries are now precise.

### The Three-Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  AppCapsule Runtime (per-capsule execution world)            │
│  ─────────────────────────────────────────────               │
│  Each capsule carries its own world:                         │
│  • MicroVM capsules → full Linux environment (guest OS)      │
│  • WASM capsules → WASI interface + granted capabilities     │
│  • Data capsules → content + declared viewer                 │
│  • Agent capsules → LLM access + memory + tools              │
│                                                              │
│  Shell capsule = the policy brain (grant/deny capabilities,  │
│  orchestrate capsules, evolves from rubber stamp → AI agent) │
│                                                              │
│══════════════════════════════════════════════════════════════│
│                                                              │
│  ElastOS Carrier (trust plane / network OS)                  │
│  ──────────────────────────────────────────                  │
│  The elastos binary (~10 Rust crates). Mechanism, not policy.│
│  • Identity binding and session authority                    │
│  • Capability issue / validate / revoke (12 checks/token)   │
│  • Capsule lifecycle (load, verify signature, isolate, stop) │
│  • Provider routing (elastos://, localhost://)                │
│  • Immutable audit trail                                     │
│  • TLS termination (rustls, zero OpenSSL)                    │
│                                                              │
│  Does NOT make policy decisions — enforces them.             │
│  Policy lives in the shell (an AppCapsule).                  │
│                                                              │
│  Connects AppCapsules, WebSpaces, PC2 hosts, and blockchains.│
│  Like carriers connecting smartphones — ElastOS connects     │
│  all capsule sandboxes peer-to-peer.                         │
│                                                              │
│══════════════════════════════════════════════════════════════│
│                                                              │
│  PC2 OS (host)                                               │
│  ─────────────                                               │
│  Hardware, kernel, hypervisor/KVM, drivers, process/VM       │
│  primitives. Conventional OS terminology applies.            │
│  Does NOT own Elastos trust policy.                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Boundary rule:**
- Hardware primitive → PC2 OS
- Trust enforcement + cross-capsule authority → ElastOS Carrier
- Single-capsule execution + policy decisions → AppCapsule Runtime

This follows microkernel design: the Carrier provides **mechanism**, the shell (a capsule) provides **policy**. The shell can be upgraded from a rubber stamp to an intelligent AI agent without touching the trust base.

### The 10 Crates (Current Implementation)

```
ElastOS Carrier (trust plane):
├── elastos-server      — binary, HTTP API, CLI entry point
├── elastos-runtime     — capabilities, tokens, handlers, messaging
├── elastos-common      — shared types (CapsuleManifest, CapsuleId)
├── elastos-namespace   — content addressing, CID → path resolution
├── elastos-identity    — WebAuthn, credential store
├── elastos-tls         — self-signed CA + certificates
└── elastos-storage     — storage backends (local, IPFS, cache)

Carrier ↔ PC2 bridge (execution adapters):
├── elastos-compute     — WASM sandbox (Wasmtime)
└── elastos-firecracker — MicroVM sandbox (Firecracker/KVM)

AppCapsule contract:
└── elastos-guest       — the SDK capsules use; the "syscall interface"
```

### URI Namespace (Aligned with W3C DID Conventions)

```
elastos://peer/alice/shared     Elastos ecosystem services
elastos://did/key/abc           (we control the namespace)
elastos://ai/llm/query
elastos://cid/QmHash            Content by hash

localhost://storage/photos      Local device
localhost://clipboard            (your PC2 host)
localhost://notify
localhost://service/ollama

https://example.com/page        Backward compatibility with WWW

google.com://drive/photos       Third-party providers
google://drive/photos            (DNS-verified or DAO-approved)
```

Three default WebSpaces:
1. `https://` — backward compatibility with the traditional WWW
2. `localhost://` — the PC2 home server environment
3. `elastos://` — bootstrapping and discovering peer WebSpace providers

### Current Implementation Status (Feb 28, 2026)

**Working P2P chat** built from scratch across 5 capsules:
- `localhost-provider` — encrypted file I/O
- `shell` — policy decisions (currently auto-grant)
- `did-provider` — Ed25519 identity (did://)
- `peer-provider` — P2P networking via Iroh/QUIC
- `chat` — TUI chat application

Each capsule starts with zero permissions. The runtime validates Ed25519 capability tokens with 12 checks per invocation. Every action is audited.

### The Shell Evolution: From Rubber Stamp to Intelligent Agent

The shell capsule today is a 50ms loop that auto-grants everything. Its evolution is the key to the "agentic world computer":

```
Current:  User → dumb shell (auto-grant) → capsules
Future:   User → intelligent shell (understands, decides, orchestrates) → capsules
```

The intelligent shell:
- Permission decisions become conversations, not popups
- Capsule composition becomes natural language
- AI agents operate under the same token/audit/security model as human users
- The runtime stays minimal and timeless; the intelligence lives in the shell

This is the only architecture where AI can operate inside a personal cloud with granular, cryptographic trust — not full access (dangerous) or locked out (useless).

### DAO Proposal

The [Keystone Fund DAO proposal](https://elastos.com/proposals/69a24f49247f130078064edd) is live, covering the three-phase convergence:
- **Phase 1 (Months 1–8):** V1 hardening, DePIN hardware expansion, AI integration
- **Phase 2 (Months 6–18):** Capsule-ready architecture, modular service interfaces, developer SDK
- **Phase 3 (Months 14–36):** Runtime convergence, capability-based security at production scale, agent economy

---

## Part 14: ERC-8004 Agent Registry — Research & Future Integration

> **Research initiated by:** CTO (March 2026)
> **Standard:** [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) — Draft, created Aug 2025
> **Authors:** Marco De Rossi (MetaMask), Davide Crapis (Ethereum Foundation), Jordan Ellis (Google), Erik Reppel (Coinbase)
> **Current state:** ~1,525 agents registered on Sepolia testnet as of March 2026. No mainnet deployment yet.

### What ERC-8004 Is

ERC-8004 defines three lightweight on-chain registries for AI agent discovery, trust, and verification — deployable on any L2 or Mainnet as per-chain singletons:

```
┌──────────────────────────────────────────────────────────────────┐
│                    ERC-8004: Three Registries                      │
│                                                                   │
│  ┌─────────────────────┐                                         │
│  │  Identity Registry  │  ERC-721 NFT per agent                  │
│  │                     │  agentURI → registration file (JSON)     │
│  │                     │  Supports IPFS, HTTPS, or on-chain URI  │
│  │                     │  Transferable, censorship-resistant      │
│  └─────────────────────┘                                         │
│                                                                   │
│  ┌─────────────────────┐                                         │
│  │  Reputation Registry│  Feedback signals from clients           │
│  │                     │  On-chain: value, tags, composability    │
│  │                     │  Off-chain: rich JSON via IPFS            │
│  │                     │  Sybil-resistant via reviewer filtering  │
│  └─────────────────────┘                                         │
│                                                                   │
│  ┌─────────────────────┐                                         │
│  │  Validation Registry│  Independent verification hooks          │
│  │                     │  Stake-secured re-execution              │
│  │                     │  zkML proofs, TEE oracles                │
│  │                     │  Binary or spectrum responses (0-100)    │
│  └─────────────────────┘                                         │
│                                                                   │
│  Trust models are pluggable and tiered — proportional to value   │
│  at risk (ordering pizza vs medical diagnosis).                  │
│  Payments are orthogonal (not covered by the standard).          │
└──────────────────────────────────────────────────────────────────┘
```

The agent registration file is flexible — an agent can advertise MCP endpoints, A2A agent cards, ENS names, DIDs, wallet addresses, and IPFS URIs all in one JSON document:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "zzz.ela.city",
  "description": "Personal cloud running Flint AI agent with media services",
  "services": [
    { "name": "web", "endpoint": "https://zzz.ela.city" },
    { "name": "MCP", "endpoint": "https://zzz.ela.city/mcp" },
    { "name": "A2A", "endpoint": "https://zzz.ela.city/.well-known/agent-card.json" },
    { "name": "DID", "endpoint": "did:elastos:iXyz..." }
  ],
  "active": true,
  "supportedTrust": ["reputation"]
}
```

### How ERC-8004 Maps to PC2 Architecture

```
ERC-8004 Concept               PC2 / ElastOS Equivalent
────────────────────────────    ────────────────────────────────────
Agent Identity (ERC-721)    →   PC2 Node Identity (wallet + DID)
Agent Registration File     →   App/Capsule Manifest (app.json)
  services[].endpoint      →   yourname.ela.city
  services[].name = "MCP"  →   PC2 node exposes MCP tools
  services[].name = "A2A"  →   Flint AI agent
  services[].name = "DID"  →   Elastos DID
Reputation Registry         →   dApp Store app ratings / agent trust
Validation Registry         →   Capsule verification (signed manifests)
agentWallet                 →   Particle Auth wallet (already exists)
```

**Four natural integration points:**

1. **PC2 Nodes as Registered Agents** — Every PC2 node already has a wallet address and a public `ela.city` URL. Registering nodes in the ERC-8004 Identity Registry gives them discoverable, on-chain identities without a centralized directory.

2. **Flint as a Registered Agent** — The PC2 AI agent can be registered with MCP/A2A endpoints. Other agents anywhere on the internet discover Flint by querying the registry, check its reputation, and interact.

3. **dApp Store Apps as Agents** — Apps in the marketplace can have on-chain reputation scores (playback quality, DRM success rate, response time). Users choose apps partly based on reputation.

4. **Content Creators as Agents** — Creators who upload via Elacity SDK register as agents. Buyers check creator reputation before purchasing.

### Relationship to Elacity SDK Contracts

ERC-8004 and the Elacity SDK operate at **different layers** and are complementary:

```
┌─────────────────┬──────────────────────────┬───────────────────────┐
│   Concern        │  Elacity SDK              │  ERC-8004              │
├─────────────────┼──────────────────────────┼───────────────────────┤
│ What it registers│ Content (NFTs, channels)  │ Agents (services, caps)│
│ Token standard   │ ERC-1155 (StandardChannel)│ ERC-721 (Identity)     │
│ Purpose          │ Buy/sell/play content     │ Discover/trust agents  │
│ DRM              │ Lit Protocol + Web3 DRM   │ Not covered            │
│ Marketplace      │ TradeGateway, Authority   │ Not covered            │
│ Reputation       │ Not covered              │ Core feature           │
│ Agent discovery  │ Not covered              │ Core feature           │
└─────────────────┴──────────────────────────┴───────────────────────┘
```

They don't overlap — they stack. Elacity handles "what content exists and who can access it." ERC-8004 handles "what agents exist and can you trust them."

### Market Context: Why This Matters Now

The CTO flagged bankr/BNKR as a market signal. BankrCoin ($BNKR) is an AI agent platform on Solana doing "agentic finance" — natural language trading via social platforms. Key data points as of March 2026:

- Surpassed $100M market cap
- AI agents deploying tokens autonomously on Raydium
- "Agentic Finance" enables conversational trading on Farcaster and X
- Revenue-sharing model: 50% creators, 40% platform, 10% burned

**The relevance:** PC2 nodes with registered AI agents (via ERC-8004) that transact autonomously (via Elacity contracts + Particle UA) follow the same pattern — but running on hardware the user owns, not a centralized platform. The agent has an on-chain identity, reputation, and can execute transactions. Bankr validates the demand; PC2 provides the sovereign infrastructure.

### Why Phase 2-3 Timing (Not Now)

1. **Standard is Draft** — not finalized, still under peer review
2. **Testnet only** — deployed on Sepolia, no mainnet deployments yet
3. **No multi-agent interaction yet** — Flint doesn't talk to other agents
4. **Prerequisites missing** — dApp Store and Media Market need to exist first; ERC-8004 adds discoverability and trust ON TOP of those features
5. **Infrastructure before identity** — building the agent registry for capabilities that don't exist yet would be premature

### Forward-Compatibility: What to Do Now

**Design decisions to make in V1 that avoid rework later:**

1. **App manifest `services` field** — When designing `app.json` for the dApp Store, include a `services` array that mirrors the ERC-8004 registration file format. This is just a JSON structure decision, zero implementation cost.

2. **DID integration** — Ensure the Elastos DID work can serve as the identity layer when ERC-8004 support is added. The registration file supports `"name": "DID"` as a service type.

3. **Rating system data model** — If building app ratings in SQLite for the dApp Store, structure the schema to be exportable to ERC-8004's `giveFeedback()` format (value + valueDecimals + tags).

4. **MCP endpoint** — When/if PC2 exposes MCP tools, the endpoint URL is directly registerable in an ERC-8004 agent registration file.

### Integration Roadmap

```
Phase 1 (M2-M5) — Forward-Compatible Design:
  app.json services[] field aligned with ERC-8004 registration format
  DID integration as identity foundation
  Rating schema compatible with Reputation Registry format

Phase 2 (M5-M7) — Node Identity & Reputation:
  Register PC2 nodes as ERC-8004 agents (ERC-721 NFT)
  Node registration files: ela.city URL + MCP + DID
  dApp Store ratings → on-chain Reputation Registry
  App quality signals: uptime, success rate, response time

Phase 3 (M7+) — Agent Economy:
  Flint registered as agent with A2A/MCP endpoints
  Agent-to-agent discovery via registry queries
  Validation Registry for capsule verification
  Cross-node agent trust via reputation + validation
  Content creators as registered agents with ratings
```

---

*Last updated: 2026-03-03*
*Author: AI Development Assistant for Sasha Mitchell*
