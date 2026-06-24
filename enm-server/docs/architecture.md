# ENM Architecture (v0.3 backend, v0.4 UI)

This document explains the architectural decisions behind Elastos Node
Manager. It is not a tutorial; it is the "why" reference. For a
walkthrough of how to install and operate ENM, see
[operator-runbook.md](operator-runbook.md). For the v0.3→v0.4 path
translation (what changed in the UI, what stayed the same), see
[v0.4-upgrade-guide.md](v0.4-upgrade-guide.md).

> **Versioning.** v0.3 is the backend (this document). v0.4 is the
> "Welcome Home" frontend rebuild that sits on top — same APIs, same
> invariants, friendlier shell. The seven invariants below apply to
> both; v0.4 just changes how the operator sees them.

---

## Components

```
                ┌────────────────────────────────────────┐
                │  PC2 dashboard (browser, port 4100)    │
                │                                        │
                │   ┌──────────────────────────────┐     │
                │   │  ENM frontend (iframe)       │     │
                │   │  src/backend/apps/elastos-   │     │
                │   │  node-manager/ — static HTML │     │
                │   │  + JS, no build step         │     │
                │   └──────────────┬───────────────┘     │
                └──────────────────┼─────────────────────┘
                                   │  XHR/SSE → /api/enm/*
                                   ▼
                ┌────────────────────────────────────────┐
                │  enm-server sidecar (port 4180)        │
                │  Node.js + Express + better-sqlite3    │
                │                                        │
                │   • routes/{health, setup, chains,     │
                │     healing, audit, evm}.js            │
                │   • services/{ChainState, ChainRegistry│
                │     ElaMainChainAdapter, …}            │
                │   • auth/OwnerCheckMiddleware (reads   │
                │     pc2-node session DB read-only)     │
                └─────┬───────────────────────────────┬──┘
                      │                               │
                      │  spawns + monitors            │  read-only mount
                      ▼                               ▼
                ┌──────────────┐              ┌──────────────┐
                │  ela binary  │              │  pc2-node    │
                │  (mainchain) │              │  session DB  │
                │  port 20336+ │              │  pc2.db      │
                └──────────────┘              └──────────────┘
                      │
                      ▼
                ┌──────────────┐
                │  /data/enm   │  ENM's own state:
                │              │  - SQLite (audit + proposals + identity cache)
                │              │  - bin/mainchain/ela
                │              │  - chains/mainchain/{config.json,keystore.dat,
                │              │    pid,logs/}
                └──────────────┘
```

ENM runs as a separate container next to pc2 in the operator's existing
Docker Compose stack. The split (introduced in v0.2) keeps PC2's image
generic and lets ENM ship/upgrade on its own cadence.

### v0.4 frontend layer (Welcome Home)

The frontend in `src/backend/apps/elastos-node-manager/` ships two
overlapping UIs that share the same backend:

```
                ┌─────────────────────────────────────────────────┐
                │  ENM frontend (iframe inside PC2)               │
                │                                                  │
                │  ┌─────────── v0.4 friendly layer ──────────┐   │
                │  │  welcome-screen → setup-conversation →   │   │
                │  │  hero-card + stat-strip + producer-id +  │   │
                │  │  milestone-toast                         │   │
                │  │                                           │   │
                │  │  Settings drawer (gear icon top-right)   │   │
                │  │   ├ When to tell me (notif toggles)      │   │
                │  │   ├ How my ElastOS behaves (auto toggles)│   │
                │  │   ├ Appearance (theme switch)            │   │
                │  │   └ For the technically curious          │   │
                │  │       └ Show technical details ─────────┐│   │
                │  └────────────────────────────────────────┐││   │
                │                                            ▼▼▼   │
                │  ┌─────────── v0.3 dashboard (still ────────┐    │
                │  │  here, just nested) — chain-card,        │    │
                │  │  log-viewer, settings-tab, audit-tab,    │    │
                │  │  evm-tab, system-status                  │    │
                │  └──────────────────────────────────────────┘    │
                └──────────────────────────────────────────────────┘
                                   │  XHR/SSE → /api/enm/* (unchanged)
                                   ▼
                          [ enm-server sidecar ]
```

Both layers POST/GET the same v0.3 endpoints. The friendly layer adds
no new backend dependencies — it's purely a UX surface over the
existing API. The "Show technical details" disclosure lazy-mounts the
v0.3 components on first tap, so casual operators never pay for the
weight they don't use.

---

## Architectural invariants (non-negotiable)

These seven rules govern every code change. Code that violates them gets
refactored or deleted, not patched.

### 1. Disk is the source of truth

Chain state is derived from disk on every read — binary present, config
present, keystore present, PID alive. The `enm.db` SQLite database holds
audit log + in-flight progress only.

**Why:** v0.2 stored a `completed=true` flag in `enm_setup_state` that
diverged from disk reality after container kill -9 / DB loss / wizard
abandonment. The dashboard would show "configured" while no binary
existed, leading to the operator-facing "Mainchain installed but it's
bugged it's not" report from real-world testing.

**How it's enforced:** [services/ChainState.js](../src/services/ChainState.js)
returns a fresh disk-derived snapshot on every call. Routes
([routes/chains.js](../src/routes/chains.js),
[routes/setup.js](../src/routes/setup.js)) consume the snapshot — no
route reads a `completed` column. The `enm_setup_state` table was dropped.

### 2. Operator wallet = identity, never signs

ENM never invokes a browser wallet for chain operations. The wallet
badge in the title bar is for display + audit attribution only.

**Why:** ELA mainchain is UTXO-native, not EVM. Coupling ENM to a
WalletConnect / Particle Auth signer pulls in WC reconnect storms and
Particle iframe errors that have nothing to do with running a node. The
operator's claim "ela main chain is not EVM so should not connect to
main chain" was not just preference — it's the architecturally correct
boundary.

**How it's enforced:** [auth/OwnerCheckMiddleware.js](../src/auth/OwnerCheckMiddleware.js)
resolves identity by reading pc2-node's session DB and node-config.json.
There is no transaction-signing code path inside enm-server. Producer
registration happens externally via Essentials mobile or `ela-cli`
(see [components/producer-identity.js](../../src/backend/apps/elastos-node-manager/js/components/producer-identity.js)).

### 3. Native ELA only in v0.3

Mainchain is the only first-class chain. Sidechain catalog (ESC, EID,
ECO) is hidden until adapter classes ship in v0.4.

**Why:** v0.2 listed sidechains in the catalog but had no adapter
implementations. The UI offered "register" buttons that succeeded then
failed at start-time — a dead-end the operator couldn't recover from.

**How it's enforced:** [routes/setup.js](../src/routes/setup.js) returns
only mainchain from `/setup/chains`. The wizard's chain selector shows
mainchain only.

### 4. EVM is a future 5th tab inside ENM

The ENM layout reserves an EVM tab placeholder in the frontend and an
`/api/enm/evm/*` route namespace in the backend. v0.3 ships the
placeholder returning 501; v0.5 fills it with wallet-connect, contract
interaction, and bridge UI.

**Why:** Locking in the namespace + nav slot now avoids a disruptive
layout change later. The EVM tab will share ENM's auth context, so
operators don't sign in twice.

**How it's enforced:** [routes/evm.js](../src/routes/evm.js) returns 501
for everything under `/api/enm/evm/*`. The frontend
[components/evm-tab.js](../../src/backend/apps/elastos-node-manager/js/components/evm-tab.js)
renders a v0.5 placeholder card.

### 5. No silent UI text masquerading as live state

Every visible message reflects an actual state value. Static "Resolving
latest version..." text is banned.

**Why:** v0.2's install card displayed "Resolving latest version..." as
a static string. Operators read it as "install in progress" and waited
indefinitely while nothing was happening — there was no install
running. Trust collapsed when they finally hit DevTools and realized
the click never fired anything.

**How it's enforced:** [components/setup-wizard.js](../../src/backend/apps/elastos-node-manager/js/components/setup-wizard.js)'s
install card starts blank with "Click 'Install' to begin", then drives
all subsequent text from the live SSE/install-status feed.

### 6. Self-heal on startup

Container boot scans disk + reconciles the in-memory ChainRegistry. No
human intervention to recover from container kill -9.

**Why:** Eliminates the "completed=true with no binary" scenario the
operator hit. If the container is killed mid-install, the next boot
sees a partial install and routes the operator back to the wizard at
the right step.

**How it's enforced:** [services/ChainRegistry.js](../src/services/ChainRegistry.js)
calls `ChainState.reconcileOnBoot()` in `init()`. Stale PID files
pointing to dead processes get unlinked. Re-attached running processes
get registered.

### 7. Healing engine opt-in, F1 only by default

Auto-restart on unexpected exit (rule F1) is on. F2-F19 (sync-stall,
fork-detection, missed-rounds, etc.) are off until the operator opts
in via `POST /api/enm/healing/rules/:id/enable`.

**Why:** v0.2 had every healing rule enabled by default. F4 and F19
fired every 5 minutes for 8+ hours during normal operation, drowning
the audit log in spam and producing false-positive "host conflict"
alerts (docker-proxy holding ports as expected).

**How it's enforced:** [services/HealthRules.js](../src/services/HealthRules.js)'s
`DEFAULT_ENABLED` map only includes F1. `runAll()` gates execution on
`isRuleEnabled(ruleId)`. See [healing-rules.md](healing-rules.md) for
the full rule catalog and how to enable F2-F19 selectively.

---

## Data model

ENM owns three persistent surfaces:

### `/data/enm/` — disk truth

```
/data/enm/
├── enm.db                  ← SQLite: audit log, healing proposals, identity cache
├── bin/
│   └── mainchain/
│       ├── ela             ← official mainnet binary
│       └── ela-cli
└── chains/
    └── mainchain/
        ├── config.json     ← generated by EnmConfigGenerator
        ├── keystore.dat    ← created by EnmKeystoreService (BPoS only)
        ├── pid             ← live process pid (NativeProcessService)
        └── logs/
            └── ela.log
```

ChainState derives `coarseState` from this layout:

| installed | configured | keystorePresent | running | coarseState |
|-----------|-----------|-----------------|---------|-------------|
| ✗         | —         | —               | —       | unconfigured |
| ✓         | ✗         | —               | —       | unconfigured |
| ✓         | ✓         | —               | ✗       | stopped (full-node) |
| ✓         | ✓         | ✓               | ✗       | stopped (BPoS) |
| ✓         | ✓         | —               | ✓       | running |

### `enm.db` — runtime state

| Table | Purpose |
|---|---|
| `audit_events` | append-only log of every healing decision, operator action, restart |
| `healing_proposals` | in-flight CRITICAL-tier proposals awaiting operator confirm/reject |
| `operator_identity_cache` | last-known wallet → display-name mapping (cached from pc2-node) |

The `enm_setup_state` table was **dropped in v0.3**. Setup state is
derived from disk via `ChainState.snapshot('mainchain').setupStep`.

### pc2-node session DB (read-only mount)

ENM mounts `~/pc2/data/pc2-node/pc2.db` read-only at `/data/pc2-node/pc2.db`
inside the container. `OwnerCheckMiddleware` reads bearer tokens from this
DB and resolves them to wallet addresses via the `sessions` table. ENM
never writes to it.

---

## v0.3 vs v0.5 scope split

| Capability | v0.3 (today) | v0.5 (planned) |
|---|---|---|
| Mainchain install + run | ✓ | ✓ |
| BPoS keystore generation | ✓ | ✓ |
| Producer registration | external (Essentials / ela-cli) | server-side (sign + broadcast) |
| ESC sidechain | hidden | first-class adapter |
| EID sidechain | hidden | first-class adapter |
| ECO sidechain | hidden | first-class adapter |
| EVM tab | placeholder (501) | wallet-connect + contracts + bridges |
| Healing F1 (auto-restart) | on | on |
| Healing F2-F19 | opt-in | selectively on by default |
| Multi-operator | not supported | not supported (by design) |

v0.4 is reserved for **sidechain adapter classes** (ESC/EID/ECO).
v0.5 is reserved for **EVM tab implementation** + **server-side
producer registration**.

---

## What's deliberately NOT here

- **Web3 / ethers.js / wallet-connect bundle.** Inspecting the bundle
  with `grep -E 'web3|ethers|metamask|walletconnect' js/*.js` returns
  nothing. The EVM tab placeholder is plain HTML; it makes no network
  calls.
- **Source build path.** `EnmAutoBuilder` (the build-from-Go-source
  service) was deleted in Wave 1. v0.3 only installs prebuilt binaries
  from `download.elastos.io`.
- **Multi-operator UI.** A single PC2 node has a single owner. Every
  ENM action is attributed to that owner's wallet. We will not add a
  permissions matrix.
