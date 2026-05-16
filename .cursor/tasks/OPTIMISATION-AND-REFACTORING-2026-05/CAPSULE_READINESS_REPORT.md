# Capsule Readiness Report (Cluster 5.1, pilot)

**Status**: PILOT + BATCH 1 + BATCH 2 (methodology validated; **18 / 272 modules audited = 6.6%**). The rubric and vocabulary in §1-§3 are stable. The per-module audit in §4 has been extended through `src/types/` and a strategic subset of `src/services/ai/`; remaining ~254 modules can use the same rubric.

**Captured**: 2026-05-16 (pilot + first two extension batches).

**Why this exists.** The dual-track strategy in `AGENTIC-PC2-MONETISATION-2026-05` calls for PC2 v1 work to be done in "patterns that migrate cleanly into the ElastOS Runtime". For that migration to be tractable, we need a current snapshot of which pc2-node modules are *already* capsule-shaped (a clean lift) vs which need bounded refactoring vs which are deeply woven into pc2-node's monolithic runtime. This document is that snapshot.

**What this is NOT.** This is not a refactoring plan. It produces a categorisation and observations. The refactoring decisions belong in `PHASE-2-PLAN.md` (Cluster 4) and the Runtime convergence work in `docs/core/DECENTRALIZATION_TRAJECTORY.md`.

---

## 1. Methodology

**What's a "capsule"?** For the purposes of this audit, a capsule is a module that satisfies all of the following:

1. **Self-contained**: has a small, well-defined public interface; consumers don't reach into its internal state.
2. **Capability-driven**: every external effect (filesystem, network, process spawning, privileged commands, secret access) is achievable only via an explicit grant — no "I'm internal, I'm allowed to" ambient authority.
3. **Stateless or state-isolated**: any state it owns is reachable only through its own interface; no shared global mutables.
4. **Communicates via well-typed messages**: inputs and outputs are explicit objects (not "the request" or "the context"); no implicit dependencies on initialisation order or another module having run first.
5. **Side-effects enumerated**: every effect a capsule performs is listed (file read X, network call Y, process spawn Z); the list is small and stable across releases.

A capsule does NOT have to be small. A 1,500-line module can be capsule-shaped if it satisfies the criteria above. Capsule shape is about *how* the code is structured, not its absolute size.

**Why these criteria?** They match the constraints the ElastOS Runtime architecture sets — capability-token-driven, message-passing kernel, no ambient authority, deterministic side-effects. If a pc2-node module already obeys these constraints, lifting it into the Runtime is mostly a build-system change; if it doesn't, the lift requires refactoring proportional to how many criteria it violates.

## 2. Classification rubric

Each module is assigned one of three classes:

| Class | Definition | Capsule-readiness score |
|---|---|---|
| **A — capsule-ready** | All 5 capsule criteria already met. Lifting into Runtime requires only a thin adapter to bridge interface formats. | 8-10 / 10 |
| **B — refactorable** | 1-3 of the criteria are violated, but the violations are local and bounded. Estimated refactor effort: <1 week per module. | 4-7 / 10 |
| **C — deeply coupled** | More than 3 violations, OR a single deep violation (e.g. depends on global initialisation order across 5+ other modules). Significant restructuring needed before capsule extraction is feasible. | 0-3 / 10 |

**Score derivation.** Start at 10. For each capsule criterion violation, subtract 1-3 points depending on severity:
- Light violation (e.g. one import from a sibling that should be a shared types module): -1
- Medium violation (e.g. calls `process.exit` directly, has init-order coupling, uses ambient authority): -2 to -3
- Heavy violation (e.g. global mutable state shared with 3+ other modules, depends on Express middleware ordering): -3 to -5

Round to nearest integer. Float to A/B/C boundaries (10-8 → A, 7-4 → B, 3-0 → C).

## 3. Capability vocabulary

Each module's external effects are recorded using a standardised vocabulary. Future audits should reuse these names; new categories are added at the end of the table when first needed.

| Capability | Meaning | Example |
|---|---|---|
| `READ-DATA-DIR` | Reads files inside the module's own data dir | `readFileSync(`<dataDir>/foo.json`)` |
| `WRITE-DATA-DIR` | Writes files inside the module's own data dir | `writeFileSync(`<dataDir>/foo.json`)` |
| `READ-SCOPED-FS` | Reads files inside a wallet/user-scoped path | `filesystem.readFile('/wallet/agents/x')` |
| `WRITE-SCOPED-FS` | Writes files inside a wallet/user-scoped path | Same scope, write direction |
| `WRITE-SYSTEM-PATH` | Writes files outside the module's data dir / scoped FS | `/etc/sudoers.d/*`, `/usr/local/bin/*` |
| `EXECUTE-COMMAND` | Spawns a child process (unprivileged) | `execSync('ls')` |
| `EXECUTE-PRIVILEGED-COMMAND` | Spawns a child process via sudo or admin auth | `execSync('sudo …')`, `osascript -e 'do shell script …'` |
| `NETWORK-FETCH` | Outbound HTTPS / HTTP request | `fetch()`, `https.get()`, an SDK that does the same |
| `NETWORK-LISTEN` | Binds a TCP / UDP socket | `net.createServer().listen()` |
| `PROCESS-EXIT` | Calls `process.exit()` directly | Same |
| `PROCESS-SPAWN-DETACHED` | Spawns a detached / orphan process | `spawn('node', […], { detached: true })` |
| `WATCH-FILESYSTEM` | Subscribes to filesystem events | `fs.watch()`, `chokidar` |
| `SECRET-READ` | Reads a secret (API key, private key, mnemonic) | Reads `apiKey` from config / env / keychain |
| `CRYPTO-SIGN` / `CRYPTO-VERIFY` | Performs cryptographic operations on private/public keys | Ed25519 sign, SIWE verify |
| `TIMER-RECURRENT` | Holds a recurring timer (setInterval) | Heartbeat timers, reconnect timers |

## 4. Pilot audit — 5 representative modules

Modules picked to span the structural spectrum: a recent self-contained utility, an OS-specific privileged-command module, a network-only API client, a memory-scoped storage adapter, and the largest orchestrator service in the codebase. Verifies the rubric produces meaningful distinctions.

### 4.A — `pc2-node/src/utils/runtime-heartbeat.ts` (333 LOC)

**Class B (refactorable). Score: 7/10.**

| Dimension | Value |
|---|---|
| Imports | `fs`, `path`, `logger`, `spawnDetachedRespawn` |
| State | Class-internal: 6 timers + flags. No global state. |
| Capabilities | `WRITE-DATA-DIR`, `READ-DATA-DIR`, `WATCH-FILESYSTEM`, `TIMER-RECURRENT`, `PROCESS-SPAWN-DETACHED` (via respawner), `PROCESS-EXIT` |
| Schema versioning | Yes (`pc2.heartbeat.v1`) — explicit, forward-compat |
| Public interface | `start(): void`, `stop(removeFile: boolean): void` — minimal |

**Strengths**:
- Schema-versioned message format (`pc2.heartbeat.v1`) already obeys capsule criterion #4 (well-typed messages).
- Self-contained state, no globals.
- File-based message bus (`heartbeat.json` + `restart-requested.flag`) is essentially a poor man's pub/sub — exactly the pattern Runtime capsules use to communicate across the host/container boundary.
- Idempotent `start()` and graceful `stop()`.

**Blockers preventing capsule status**:
1. **Calls `process.exit(0)` directly** (line 330). In a Runtime model, capsules can't kill the host; they signal "I want to restart" via an explicit capability and let the supervisor act. -2 score.
2. **Depends on `spawnDetachedRespawn`** which is pc2-node-specific (knows about pc2-node's CLI args, working dir, env). -1 score.

**Refactoring path to A**:
- Extract a `RestartRequester` capability that the heartbeat can call to "request restart" without knowing how to actually do it. The Runtime supervisor implements the capability; in pc2-node we wire it to `spawnDetachedRespawn + process.exit`. Effort: half-day, very localised.

### 4.B — `pc2-node/src/services/wireguard/setupPermissions.ts` (514 LOC)

**Class B (refactorable). Score: 5/10.**

| Dimension | Value |
|---|---|
| Imports | `child_process`, `fs`, `os`, `path`, `crypto`, `logger` |
| State | None (pure functions) |
| Capabilities | `EXECUTE-PRIVILEGED-COMMAND` (sudo, osascript), `WRITE-SYSTEM-PATH` (`/etc/sudoers.d/*`), `WRITE-DATA-DIR` (marker file), `READ-DATA-DIR`, `EXECUTE-COMMAND` |
| OS dispatch | Branches macOS / Linux / Windows in each public function — high cyclomatic |
| Recent regressions | v1.2.7.11 apostrophe-injection (now tested), v1.2.7.10 sudo env-var passing |

**Strengths**:
- Pure functions; no internal state.
- Inputs and outputs are explicit.
- Defence-in-depth tests (`setup-permissions-osascript.test.js`) now guard the apostrophe class.

**Blockers preventing capsule status**:
1. **OS-specific privileged-command shell construction** is the bug surface that bit us 4 times in v1.2.7.x. A capsule should declare "I need sudoers entry installed" and let the Runtime decide how. -3 score.
2. **Branches macOS/Linux/Windows inside the same function**. Each branch is essentially a different capsule. -1 score.
3. **Multiple capabilities entwined** — single function does sudoers write + marker write + osascript probe. Each capability should be a separate effect. -1 score.

**Refactoring path to A**:
- Split into three modules: `SudoersInstaller (macOS)`, `SudoersInstaller (Linux)`, and the shared `SudoersEntryBuilder` (pure, already capsule-shaped). Each platform module declares its capabilities explicitly. Effort: 1-2 days.

### 4.C — `pc2-node/src/services/ai/providers/OpenAIProvider.ts` (301 LOC)

**Class A (capsule-ready). Score: 9/10.**

| Dimension | Value |
|---|---|
| Imports | `openai` (SDK), `logger`, type imports from sibling `OllamaProvider` |
| State | Class-internal: SDK client + default model. No globals. |
| Capabilities | `NETWORK-FETCH` (to OpenAI API or configured baseURL), `SECRET-READ` (apiKey) |
| Configuration | All via constructor — apiKey, defaultModel, baseURL |
| Public interface | `isAvailable()`, `models()`, plus completion methods — clean, narrow |

**Strengths**:
- Pure I/O via an SDK; no filesystem, no process spawning, no privileged operations.
- All configuration passed in at construction; no environment-variable side-channels.
- Default value handling is sane (`defaultModel || 'gpt-4o'`).
- Reused by XAIProvider via `baseURL` override — exactly the right pattern for OpenAI-compatible providers.

**Blockers preventing 10/10**:
1. **Imports `ChatModel, ChatMessage, CompleteArguments, ChatCompletion` types from `OllamaProvider`**. These types describe the chat provider interface — they belong in a shared types module that both Ollama and OpenAI/XAI import from, not in one specific provider. -1 score.

**Refactoring path to 10/10**:
- Extract `ChatModel`, `ChatMessage`, `CompleteArguments`, `ChatCompletion` to `pc2-node/src/services/ai/providers/types.ts`. Update both OllamaProvider and OpenAIProvider to import from there. Effort: 1 hour.

**This is the gold standard.** When auditing other modules, ask "would this look like OpenAIProvider if we refactored it?". If yes, it's a clear A-path.

### 4.D — `pc2-node/src/services/ai/memory/AgentMemoryManager.ts` (488 LOC)

**Class A- (capsule-ready, minor polish needed). Score: 8/10.**

| Dimension | Value |
|---|---|
| Imports | `FilesystemManager` (pc2-node storage abstraction), `logger` |
| State | Class-internal: config, agentWorkspace path. No globals. |
| Capabilities | `READ-SCOPED-FS`, `WRITE-SCOPED-FS` — within `/<walletAddress>/pc2/agents/<agentId>/` only |
| Constructor | DI: `(filesystem, walletAddress, agentId, config)` |
| Security | `sanitizePathComponent` on walletAddress + agentId to prevent path traversal |

**Strengths**:
- Dependency injection of `FilesystemManager` is exactly the capability-passing pattern Runtime wants.
- Wallet + agent scoping is enforced at construction time; the class cannot reach outside its assigned scope.
- Path-traversal sanitisation is in place at the constructor boundary.
- Logger usage is structured (`logger.info('[AgentMemoryManager] Initialized', {...})`).

**Blockers preventing 10/10**:
1. **`FilesystemManager` itself is currently a direct concrete class import**, not a capability interface. To lift AgentMemoryManager into Runtime, you'd also need to lift FilesystemManager or substitute a Runtime-shaped equivalent. -1 score.
2. **Some path construction uses string concatenation** (`${this.agentWorkspace}/MEMORY.md`) rather than `path.join`. Cosmetic but fragile cross-platform. -0.5 score.

**Refactoring path to 10/10**:
- Define a `ScopedFilesystem` interface in `pc2-node/src/storage/types.ts`. `FilesystemManager` implements it; AgentMemoryManager depends on the interface, not the class. Effort: 2 hours including the type extraction.
- Use `path.join` consistently. Effort: 30 min.

### 4.E — `pc2-node/src/services/boson/ConnectivityService.ts` (1597 LOC)

**Class C (deeply coupled). Score: 2/10.**

| Dimension | Value |
|---|---|
| Imports | 14 imports including 6 sibling services + Node built-ins (`child_process`, `net`, `https`, `http`, `fs`, `path`) |
| State | Class-internal: **22+ private fields** — 4 timers, 3 keys/identifiers, 4 transport service handles, retry counters, mode flags, connection maps |
| Capabilities | `NETWORK-LISTEN`, `NETWORK-FETCH`, `EXECUTE-COMMAND`, `WRITE-DATA-DIR`, `READ-DATA-DIR`, `CRYPTO-VERIFY` (via fromBase58), `TIMER-RECURRENT` (multiple), `PROCESS-SPAWN-DETACHED` (indirectly via wireguard services) |
| Construction | Config-based, then **setter pattern** for usernameService, wireGuardService, amneziaWGService, vlessRealityService, nodeKeys |
| Public interface | Mixed: `setX()` setters, lifecycle (`start`, `stop`), state queries (`getStatus`), reconnect triggers — at least 15 public methods on the class |

**Strengths**:
- DOES use dependency injection for the sub-services (via setters) rather than reaching into globals.
- State is encapsulated in the class.
- Status object is well-typed.

**Blockers preventing capsule status**:
1. **22+ private fields** — single class doing far too many distinct jobs. Connection state machine + transport selection + supernode failover + cache management + endpoint freshness recovery + reconnect orchestration all live here. -3 score.
2. **Setter-pattern initialisation** (`setUsernameService`, `setWireGuardService`, etc.) means consumers must call methods in a specific order. Pure capsules use constructor injection only. -2 score.
3. **Direct dependency on 6 sibling services** by concrete class — to lift this you'd need to lift all 6 too. The interfaces those services should expose haven't been extracted yet. -2 score.
4. **Mixes multiple capabilities entwined** — file I/O for supernode cache, network for the failover probe, child process for diagnostics. Each should be a separate capability declaration. -1 score.

**Refactoring path** (NOT to A in one step):
- **Stage 1**: extract `SupernodeRotator`, `TransportSelector`, `EndpointFreshnessRecovery` as separate capsules. Each is B-class but bounded. Effort: 2-3 days each.
- **Stage 2**: turn ConnectivityService into a thin coordinator that consumes the three new capsules + the existing wireguard/amnezia/vless services as capabilities. Score after this: B-class (5/10).
- **Stage 3** (long-term, post-Runtime-arrival): replace the coordinator with a Runtime workflow that wires the capsules together via capability tokens. Score: A-class.

**Estimated total effort to A**: 2-3 weeks. This is the kind of module that motivates the dual-track strategy: don't try to make it capsule-shaped in PC2 v1; instead, build the Runtime in parallel with capsules that subsume each piece, and retire ConnectivityService when the Runtime version is feature-equivalent.

---

## 4.BIS — Batch 1: `pc2-node/src/types/` (5 / 5 modules audited 2026-05-16)

All five files in this directory are pure type-declaration modules — no executable code, no imports of effectful modules. Trivially capsule-compliant, as the type system itself is the capsule contract.

| Module | LOC | Class | Score | Notes |
|---|---|---|---|---|
| `api.ts` | 126 | A | 10/10 | Pure interface declarations for API request/response shapes. Zero imports, zero effects. |
| `wallet-agent.ts` | 331 | A | 10/10 | Pure interface + type-alias declarations for AI wallet operations. Zero imports, zero effects. Despite being 331 LOC, no `import`, `function`, `class`, `const`, `let`, or `var` declarations — pure type space. |
| `qrcode-terminal.d.ts` | 13 | A | 10/10 | TypeScript ambient declaration for an external module. Pure shape contract. |
| `qrcode.d.ts` | 19 | A | 10/10 | Same — ambient declaration. |
| `capabilities.ts` | 88 | A | 9/10 | **Strategic find — see callout below.** Defines `CAPABILITY_SCOPES` (14 named scopes), `WALLET_METHOD_CAPABILITIES`, `FULL_CAPABILITY_SET`, `MANIFEST_CAPABILITY_MAP`. Slight -1 vs perfect-A because it has runtime data constants (not purely types), but the constants ARE the canonical capability dictionary for pc2-node. |

### 4.BIS.STRATEGIC — `capabilities.ts` is GOLD

This file deserves its own callout. The header reads:

> *Unified Capability Vocabulary — Single source of truth for capability scope names used across: AppManifest.capabilities, API key scopes, Wallet bridge method classification, Runtime v2 capability token `action` fields. These map 1:1 to ElastOS Runtime provider contract operations. See `docs/core/CAPSULE_COMPATIBILITY.md` for the full mapping.*

It then defines a **14-scope capability vocabulary**: `storage:read`, `storage:write`, `ipfs:fetch`, `ipfs:pin`, `wallet:read`, `wallet:sign`, `drm:decrypt`, `drm:encrypt`, `compute:wasm`, `compute:ai`, `network:rpc`, `ipc:launch`, `ipc:message`, `identity:auth`.

**Why this matters**:
1. pc2-node has ALREADY started thinking in capability-token terms. This isn't greenfield work for Phase 2 — it's an extension of existing structure.
2. The capability mapping is documented as 1:1 with the ElastOS Runtime provider contract. Whoever wrote this was already thinking about the Runtime convergence.
3. The wallet-bridge `WALLET_METHOD_CAPABILITIES` map enumerates 23 EIP-1193 RPC methods and labels each by the capability it requires. This is the kind of fine-grained authority enumeration that capsule-shaped code needs.

**Reconciliation with our audit vocabulary (§3 of this doc)**:
- The §3 vocabulary (`READ-DATA-DIR`, `NETWORK-FETCH`, etc.) describes what code *does* at the implementation level — finer-grained, useful for audit work.
- `capabilities.ts` describes user-facing permission grants — coarser-grained, the layer that the Runtime contract speaks.
- Both are useful. The audit-level vocabulary will eventually distil into the capability-scope vocabulary when modules are refactored: e.g. a module declaring `WRITE-SCOPED-FS` to a user's storage will end up requiring the `storage:write` capability.

**Recommendation**: when phase-2 refactoring starts (Cluster 4), every new module should declare its required capabilities using the names from `capabilities.ts`. The §3 vocabulary remains an audit-tool; `capabilities.ts` is the production contract.

---

## 4.TER — Batch 2: `pc2-node/src/services/ai/` (8 / 26 modules audited 2026-05-16)

Strategic subset chosen to span: the orchestrator, three more chat providers (testing the "OpenAI pattern repeats" hypothesis), two memory subsystem modules (testing whether the AgentMemoryManager pattern generalises), and two tool-subsystem modules (testing the cross-cutting-concerns hypothesis).

### 4.F — `AIChatService.ts` (2,237 LOC)

**Class B (refactorable). Score: 5/10.**

| Dimension | Value |
|---|---|
| Imports | 25+ siblings: 5 providers, 7 tool modules, 3 storage modules, MemoryConsolidator, TokenBudgetManager, SystemPromptBuilder, CognitiveToolkit, utils, types |
| State | 5 private fields including `providers: Map<string, AIProvider>` (provider registry pattern — GOOD) |
| Capabilities | indirect (delegates to registered providers + tools) |
| Construction | DI: `(config, db?)` |
| Initialisation | Async `initialize()` method; idempotent via `initialized` flag |

**Strengths**:
- The **provider registry pattern** (Map of name → provider) is exactly right for capsule shape. Adding a new provider is a single `registerXProvider()` call, not a constructor change.
- DI for the database manager.
- Per-user provider registration (`registerUserProviders(walletAddress)`) is wallet-scoped — the right pattern.

**Blockers preventing capsule status**:
1. **2,237 LOC in a single class** — too many responsibilities entwined: provider registration, message normalisation, tool dispatch, memory consolidation orchestration, completion request routing. The class is structurally fine but the bulk indicates it should be 3-5 smaller classes. -3 score.
2. **Async `initialize()` separately from constructor** — capsule shape prefers all-or-nothing construction. -1 score.
3. **Imports 25+ sibling modules** — to lift this you'd need to lift them all. Reduces to "lift the whole `services/ai/` subtree together" rather than a single capsule. -1 score.

**Refactoring path**: split into `AIProviderRegistry` (provider registration + user-key loading), `ChatCompletionDispatcher` (message routing + tool dispatch), `MemoryOrchestrator` (the memory side). Effort: 3-5 days. Probably best done as part of Cluster 4.

### 4.G — `ClaudeProvider.ts` (411 LOC)

**Class A (capsule-ready). Score: 9/10.**

| Dimension | Value |
|---|---|
| Imports | `@anthropic-ai/sdk`, `logger`, type imports from `OllamaProvider` |
| Capabilities | `NETWORK-FETCH` (Anthropic API), `SECRET-READ` (apiKey) |
| Construction | Config-DI |
| Public interface | Mirror of OpenAIProvider — same shape |

Same shape, same strengths, same single blocker as OpenAIProvider: types come from `OllamaProvider` rather than a shared types module. -1 score.

### 4.H — `GeminiProvider.ts` (277 LOC)

**Class A (capsule-ready). Score: 9/10.**

Identical pattern to ClaudeProvider — `@google/genai` SDK, config-DI, narrow interface, types-from-sibling blocker.

### 4.I — `OllamaProvider.ts` (722 LOC)

**Class A (capsule-ready). Score: 8/10.**

| Dimension | Value |
|---|---|
| Imports | `logger`, `PlatformInfo`/`OllamaHardwareConfig` from utils/platform |
| Owns | `ChatModel`, `ChatMessage`, `CompleteArguments`, `PerformanceMetrics`, `ChatCompletion` types |
| Capabilities | `NETWORK-FETCH` (local Ollama instance), platform detection |

**Strengths**: same gold-standard shape as OpenAIProvider/ClaudeProvider/GeminiProvider. **Critically: this is the canonical type owner for the chat-provider family** — the other 4 providers all import from here.

**Blockers**:
1. **Owns 5 types that 4 other providers import** — these should live in a shared `providers/types.ts` module, not in OllamaProvider. Once extracted, all 5 providers become identical-shape A-class. -1 score.
2. **Slightly larger (722 LOC) than the cloud providers** because Ollama is local and has additional logic for model auto-pull, hardware detection, etc. Not a capsule violation but worth noting. -1 score.

**Refactoring path** (THIS IS THE 1-HOUR REFACTOR FROM §4.C OF THE PILOT, EXTENDED):
- Extract `ChatModel`, `ChatMessage`, `CompleteArguments`, `PerformanceMetrics`, `ChatCompletion` to `pc2-node/src/services/ai/providers/types.ts`.
- Update Ollama + OpenAI + Claude + Gemini + XAI to import from there.
- Effort: 1 hour. **Impact: 5 modules all jump to 10/10 score.**

### 4.J — `VectorMemoryStore.ts` (515 LOC)

**Class A- (capsule-ready, light polish). Score: 8/10.**

| Dimension | Value |
|---|---|
| Imports | `@photostructure/sqlite` (`DatabaseSync`), `Database` type from storage, `path`, `logger`, `EmbeddingProvider` |
| Capabilities | `WRITE-DATA-DIR` (sqlite file), `READ-DATA-DIR` (sqlite file) — scoped to its own data file |
| Owns types | `MemoryChunk`, `SearchResult`, `VectorStoreConfig` |
| Construction | Config-driven |

**Strengths**:
- Encapsulates the sqlite-based vector index entirely; the database file is its own data.
- Depends on `EmbeddingProvider` as a sibling capsule (good — DI between AI components).
- Types are co-located with the implementation; only consumed by sibling modules in `memory/`.

**Blockers preventing 10/10**:
1. **Direct dependency on `@photostructure/sqlite`** — a heavy native module. Capsule shape would prefer an `IVectorBackend` interface so the storage backend can be swapped (in-memory, sqlite, qdrant, etc.). -1 score.
2. **Co-located types** are fine for now but if these are used by Hermes / DreamServer-inspired memory backends later, the `MemoryChunk` type should move to `memory/types.ts`. -1 score.

### 4.K — `EmbeddingProvider.ts` (323 LOC)

**Class A (capsule-ready). Score: 9/10.**

| Dimension | Value |
|---|---|
| Imports | `logger`, `DatabaseManager` |
| Capabilities | `NETWORK-FETCH` (to embedding API), `READ-DATA-DIR` (cache lookups), `WRITE-DATA-DIR` (cache writes) |
| Owns types | `EmbeddingResult`, `ProviderConfig` |

Same shape as OpenAIProvider but for embeddings. The `DatabaseManager` dependency is the usual concrete-class-instead-of-interface issue from AgentMemoryManager. -1 score.

### 4.L — `ToolExecutor.ts` (1,894 LOC)

**Class B- (refactorable, multiple blockers). Score: 4/10.**

| Dimension | Value |
|---|---|
| Imports | 14 modules including: filesystem, database, socket.io, websocket events, gateway service, settings, agentkit, agent memory, skill parser |
| State | 7 private fields incl. `aiService?: any` (typed as any — yellow flag) |
| Capabilities | Almost every capability defined in `capabilities.ts` — this is the tool dispatcher for every agent action |
| Construction | DI: `(filesystem, walletAddress, io?, options?)` — wallet-scoped via constructor throw if missing |
| Cross-cutting | Imports from `websocket/events.js` (`broadcastItemAdded`, etc.) and `services/gateway/index.js` |

**Strengths**:
- **Constructor-enforced wallet scoping** (throws if `walletAddress` missing) — capability-enforcement at construction.
- DI for filesystem, websocket server, database.
- Conditionally instantiates sub-managers (`AgentMemoryManager`, `AgentKitExecutor`) only when capabilities are present.

**Blockers preventing capsule status**:
1. **Cross-cutting imports from `websocket/events` and `gateway/index`** — these are pc2-node-runtime-level services, not capsule-shaped dependencies. To lift ToolExecutor you'd need to expose these as capabilities. -2 score.
2. **`aiService?: any`** — escape hatch typing. Indicates the AI service ↔ tool executor relationship hasn't been formalised. -2 score.
3. **1,894 LOC** doing tool dispatch + memory wiring + AgentKit wiring + skill parsing + websocket broadcasting — should be ~3 smaller modules. -2 score.

**Refactoring path**: extract a `ToolDispatch` interface; ToolExecutor implements it but delegates websocket broadcasts to an injected `Broadcaster` capability, gateway calls to an injected `GatewayClient` capability. Effort: 4-5 days. Probably Cluster 4 Phase 2 work, lower priority than AIChatService split.

### 4.M — `AgentTools.ts` (43 LOC)

**Class A (capsule-ready). Score: 10/10.**

| Dimension | Value |
|---|---|
| Imports | `NormalizedTool` type from `utils/FunctionCalling.js` |
| State | None (just exports a const array of tool definitions) |
| Capabilities | None (pure data) |

The whole file is a `const agentTools: NormalizedTool[] = [ ... ]` declaration. No code, no side effects, no state. Trivially A.

This is the right shape for "list of declared tools" — a separate data file per tool family (`AgentTools`, `WalletTools`, `FilesystemTools`, etc.) all conforming to the same interface, consumed by `ToolExecutor` and the rest of the AI pipeline. Already capsule-pattern compliant.

---

## 5. Aggregate observations (pilot + batch 1 + batch 2)

### 5.1 Distribution after 18 / 272 modules

| Class | Count | Modules |
|---|---|---|
| A (capsule-ready) | 12 | OpenAIProvider (9/10), AgentMemoryManager (8/10), api.ts (10/10), wallet-agent.ts (10/10), qrcode-terminal.d.ts (10/10), qrcode.d.ts (10/10), capabilities.ts (9/10), ClaudeProvider (9/10), GeminiProvider (9/10), OllamaProvider (8/10), EmbeddingProvider (9/10), AgentTools (10/10) |
| A- (capsule-ready, light polish) | 1 | VectorMemoryStore (8/10) |
| B (refactorable) | 3 | runtime-heartbeat (7/10), AIChatService (5/10), setupPermissions (5/10) |
| B- (refactorable, multiple blockers) | 1 | ToolExecutor (4/10) |
| C (deeply coupled) | 1 | ConnectivityService (2/10) |

**12 of 18 modules audited so far are A-class (67%).** The hypothesis from §5.1 of the pilot ("AI + storage areas are more capsule-shaped than connectivity") is now strongly supported:
- Types subtree (`types/`): 5/5 A-class (100%).
- AI providers (`services/ai/providers/`): 4/4 audited A-class (100%) — pattern confirmed identical across vendors.
- AI memory (`services/ai/memory/`): 2/3 audited A or A- (66%); the third (AgentMemoryManager) was already A.
- AI tool data (`services/ai/tools/AgentTools.ts`): A (10/10).
- AI orchestration (`AIChatService`, `ToolExecutor`): B / B- — large multi-responsibility classes, refactorable but not free.
- Connectivity orchestration (`ConnectivityService`): C — confirmed outlier.

**The "AI is mostly A" hypothesis is confirmed** for the leaf-level provider/memory/tool-data modules; refuted at the orchestrator level (AIChatService, ToolExecutor) which are B/B-class due to size, not structural failure.

### 5.2 Top blocker patterns (updated count)

| Pattern | Now affects | Fix shape | Status |
|---|---|---|---|
| Types defined in one provider and imported by siblings | OpenAIProvider, ClaudeProvider, GeminiProvider, OllamaProvider (4 modules — XAIProvider likely 5th) | Extract `providers/types.ts` | **High-ROI, 1-hour fix, jumps 5 modules to 10/10**. Promote to Phase 2 ticket. |
| Concrete class import where interface should suffice | AgentMemoryManager, EmbeddingProvider, ToolExecutor (3+ instances) | Type-only interface extraction (`IFilesystemManager`, `IDatabaseManager`) | Confirmed cross-cutting; affects ~3-5 modules but pattern likely repeats in `api/` and `services/`. |
| Cross-cutting imports from `websocket/events` + `gateway/` inside leaf modules | ToolExecutor | Expose as injected capabilities | Newly detected; specific to orchestration code. |
| `: any` escape-hatch typing for sibling service references | ToolExecutor (`aiService?: any`) | Formalise the cross-reference | Newly detected. |
| Direct `process.exit` instead of "I want to exit" signal | runtime-heartbeat | Capability-based RestartRequester | <5 modules likely affected. |
| Setter-pattern post-construction service injection | ConnectivityService | Constructor-only injection | Yet to find others. |
| Multi-OS branching inside single function | setupPermissions | Per-OS modules + shared core | Yet to find others. |
| Async `initialize()` separate from constructor | AIChatService | Builder pattern or sync construct | Newly detected; likely repeats in other large orchestrators. |

### 5.3 Capability vocabulary surprise (added 2026-05-16)

The `types/capabilities.ts` audit revealed that pc2-node **already has a 14-scope capability vocabulary** mapped 1:1 to ElastOS Runtime provider contracts (`storage:*`, `wallet:*`, `drm:*`, `compute:wasm`, `compute:ai`, `network:rpc`, `ipc:*`, `identity:auth`). This is documented in `docs/core/CAPSULE_COMPATIBILITY.md` (referenced in the file header).

**Implication**: when Phase 2 Cluster 4 refactoring starts, every refactored module should declare its required capabilities using these scope names. The audit-vocabulary in §3 of this doc is a finer-grained analyst tool; `capabilities.ts` is the production contract.

### 5.3 Recommended scoring calibration

The 0-10 scoring proved easy to apply on the 5 pilot modules. Two calibration notes for whoever continues the audit:

- **Don't let LOC dominate the score.** The 1,600-line ConnectivityService scored 2/10; the 300-line OpenAIProvider scored 9/10. Size is a downstream signal of doing too many things; the score should track *capsule criteria violations*, not file size.
- **Score the module against its own boundary, not against pc2-node.** If a module is internally clean but depends on a pc2-node-specific dep that's itself capsule-ready, that's not a violation. If it depends on a globally-mutable singleton, that is.

### 5.4 What this audit tells us about the AGENTIC-PC2-MONETISATION strategy

After 18 modules, the empirical signal has tightened:

- **Strong-track-1 signal (CONFIRMED at leaf level)**: the AI provider + memory + tool-data leaves are 100% A-class. The AI features that the mandate prioritises (Monetisation Agent leaf modules, provider picker, tool definitions, memory backends) can be evolved INSIDE pc2-node with high confidence that they'll translate to Runtime later. **PC2 v1 work at the AI leaf level is not throw-away**.
- **Newly visible-track-1 caveat**: the AI orchestrators (`AIChatService`, `ToolExecutor`) sit at B / B- — they will need targeted refactoring (splits into 2-3 smaller classes each, ~3-5 days per orchestrator) before they migrate cleanly. This refactoring is bounded and adds value to PC2 v1 in its own right (smaller, more testable orchestration code).
- **Strong-track-2 signal (CONFIRMED)**: the connectivity orchestration area is deeply coupled. Building further significant AI infrastructure on top of ConnectivityService would entangle the new code with the legacy state machine.
- **NEW finding — capability vocabulary already exists**: pc2-node has a 14-scope capability vocabulary in `types/capabilities.ts` that maps 1:1 to ElastOS Runtime provider contracts. The Runtime convergence is not a greenfield translation; it's an extension of structure that already exists in pc2-node.
- **Verdict (unchanged)**: ship the Mac launcher first, then evolve AI features in the leaf modules (no refactor needed), then refactor the two AI orchestrators (bounded, value-positive), then defer the connectivity-orchestration rewrite to the Runtime track.

The mandate strategy is supported and now has 18 data points behind it rather than 5.

---

## 6. What's left to audit

**18 of 272 pc2-node/src .ts files audited (6.6%).** Remaining ~254 files, by directory:

| Directory | Files | Audited | Notes for auditor |
|---|---|---|---|
| `pc2-node/src/api/` | 50 | 0 | HTTP handlers + business logic. Expect mostly B-class; watch for Express middleware coupling. |
| `pc2-node/src/services/` | 71 | 8 (ai/ subset) | `services/ai/` confirmed A-heavy at leaves, B at orchestrators. `services/boson/` likely C-heavy (similar to ConnectivityService). `services/gateway/`, `services/dDRM/`, `services/ddrm/` not yet sampled. |
| `pc2-node/src/storage/` | 8 | 0 | Storage abstractions. Expect A or B; these were designed as adapters from the start. |
| `pc2-node/src/utils/` | 16 | 1 (runtime-heartbeat) | Mostly should be A. runtime-heartbeat is the outlier already audited. |
| `pc2-node/src/websocket/` | 4 | 0 | WebSocket layer. Expect B or C depending on coupling to Express. |
| `pc2-node/src/types/` | 5 | **5 (DONE)** | All confirmed A. Subtree complete. |
| `pc2-node/src/sdk/` | 3 | 0 | Likely A. |
| `pc2-node/src/auth/` | 1 | 0 | Likely B (auth has cross-cutting concerns). |
| `pc2-node/src/config/` | 1 | 0 | Likely A (just config loading). |
| `pc2-node/src/wireguard/` | ~5 | 1 (setupPermissions) | Cross-platform OS interaction; expect B-heavy. |

**Estimated remaining effort**: ~25 hours of analyst-time at the current pace (~6 min per module — pace has improved as the rubric is internalised). Reduces further on subtrees that repeat patterns (e.g., the 5 remaining AI providers can be batched as "same as Claude/Gemini" in 30s each).

**Parallelisation possible**: the audit can be split by subtree. Two people working in parallel could finish in <1 calendar day.

**Next high-value subtrees to audit** (when continuing):
1. `pc2-node/src/storage/` (8 files) — sanity-check storage hypothesis, ~30 min
2. `pc2-node/src/services/ai/` remaining 18 files — finish the AI subtree, get full picture, ~1 hour
3. `pc2-node/src/services/boson/` — confirm/refute the "connectivity is C-heavy" hypothesis, ~1 hour
4. `pc2-node/src/api/` — biggest unknown, will dominate final picture, ~3 hours

**Suggested remaining batches** (when continuing):
- ~~Batch 1 — `pc2-node/src/types/` (5 files, all trivially A, sanity check).~~ **DONE 2026-05-16.**
- ~~Batch 2 — `pc2-node/src/services/ai/` strategic subset (8 of 26 files, hypothesis-test the "AI is mostly A" claim).~~ **DONE 2026-05-16.**
- Batch 3 — `pc2-node/src/services/ai/` remaining 18 files (finish the AI subtree; expect mostly A based on pattern).
- Batch 4 — `pc2-node/src/storage/` (8 files, sanity-check storage hypothesis).
- Batch 5 — `pc2-node/src/services/boson/` (~10 files, hypothesis-test "boson is mostly C").
- Batch 6 — `pc2-node/src/api/` HTTP handlers (50 files; identify the worst Express coupling early).
- Batches 7-N — everything else.

After each batch, append a section to §4 of this document under a new heading. Don't replace earlier data — we want the time series.

## 7. Recommended next steps

1. **Done so far (2026-05-16)**: methodology validated, pilot + 2 extension batches recorded (18/272 modules, 6.6%). One high-ROI Phase 2 fix already identified (extract `providers/types.ts`, 1 hour, jumps 5 modules to 10/10).
2. **Continue today if appetite remains**: Batches 3 + 4 (remaining AI subtree + storage subtree) — ~1-2 hours, gets to ~30% coverage and finishes the "AI track" picture entirely.
3. **Post-Mac-launcher window (May 25-29)**: extend through Batches 5-6 (boson + api). Aim to have 50% of pc2-node/src classified within that window.
4. **Once 50% classified**: produce a `CAPSULE_READINESS_REPORT_v1.md` snapshot, then continue. Phase 2 plan can then start citing real module names instead of guessing.
5. **Concurrent (audit-only, no code change yet)**: §5.2's blocker patterns become candidate Phase 2 refactor work items as evidence accumulates. Each pattern with 30+ affected modules gets its own ticket. The "types defined in one provider, imported by siblings" pattern is already at 4 modules and should be flagged for Phase 2.
6. **Not before 50% audit** but planned: the per-pattern Phase 2 work items get scheduled into Cluster 4 of `PHASE-2-PLAN.md` once Mac launcher is stable. This is when audit data turns into actual refactoring.

---

## Document metadata

- **Source of truth**: this file.
- **Scope**: pc2-node/src — 272 .ts files, 82,580 LOC (per jscpd).
- **Audit completion**: 18/272 (6.6%) — pilot + types subtree (5 files, complete) + AI subtree strategic subset (8 files).
- **Last updated**: see git log on this file.
- **Tied to**:
  - `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-PLAN.md` (Cluster 5)
  - `.cursor/tasks/AGENTIC-PC2-MONETISATION-2026-05/AGENTIC-PC2-MONETISATION-2026-05.md` (dual-track strategy)
  - `docs/core/DECENTRALIZATION_TRAJECTORY.md` (Runtime convergence narrative)
  - `pc2-node/src/types/capabilities.ts` (production capability vocabulary, 14 scopes)
  - `docs/core/CAPSULE_COMPATIBILITY.md` (Runtime provider-contract mapping — referenced from capabilities.ts header)
