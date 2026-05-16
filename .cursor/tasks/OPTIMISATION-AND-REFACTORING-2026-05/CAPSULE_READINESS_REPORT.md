# Capsule Readiness Report (Cluster 5.1, pilot)

**Status**: PILOT + 4 BATCHES (methodology validated; **31 / 272 modules audited = 11.4%**). The rubric and vocabulary in §1-§3 are stable. The per-module audit in §4 has covered `src/types/` (complete) + strategic AI subset + `src/storage/` (complete) + 5-module `services/boson/` sample. Remaining ~241 modules can use the same rubric.

**Major strategic finding** (Batch 4, §4.QUINT.MAJOR-FINDING): capsule readiness is **role-based, not subtree-based**. The original pilot's "AI is A, connectivity is C" framing was sampling artefact. Leaves are A across all subtrees; orchestrators are B; only ConnectivityService is truly C. Migration order changes accordingly.

**Captured**: 2026-05-16 (pilot + four extension batches).

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

## 4.QUAT — Batch 3: `pc2-node/src/storage/` (8 / 8 modules audited 2026-05-16)

Storage subtree complete (8/8). Tests the §6 prediction that "storage abstractions were designed as adapters from the start, expect A or B".

| Module | LOC | Class | Score | Verdict |
|---|---|---|---|---|
| `context.ts` | 176 | A | 9/10 | Imports only `Database` type. `ContextStore` class. Constructor-DI. Owns its types. Clean capsule. |
| `database.ts` | 2,836 | A- | 7/10 | DatabaseManager — large but well-shaped. Constructor takes only `dbPath`. Separate idempotent `initialize()`. WAL pragmas, foreign keys, calls `runMigrations()` as pure function dependency. -2 for size (2,836 LOC, owns 9 type interfaces — types should move to `storage/types.ts`); -1 for async-init-vs-construct pattern. Capabilities: `WRITE-DATA-DIR`, `READ-DATA-DIR` (scoped to dbPath). |
| `filesystem.ts` | 855 | B | 6/10 | Imports `IPFSStorage` AND `DatabaseManager` as concrete classes (not interfaces). Same concrete-class blocker as AgentMemoryManager — repeated pattern. -2 for concrete-class imports; -1 for owning `FileContent` type that belongs in `storage/types.ts`; -1 for cross-cutting `generateThumbnail` import (process spawn through a sibling). Capabilities: `WRITE-DATA-DIR`, `READ-DATA-DIR`, `NETWORK-FETCH` (via IPFSStorage). |
| `index.ts` | 33 | B | 4/10 | **Global singleton pattern**: `let globalDatabase: DatabaseManager \| null = null`, with `setGlobalDatabase()` / `getDatabase()`. This is the exact "ambient authority" pattern §1 calls out as a capsule violation. Tiny file but structurally problematic. -6 score because the singleton can be reached from anywhere in pc2-node, bypassing capability checks. Fix: remove the singleton, require all consumers to receive a DatabaseManager by injection. |
| `indexer.ts` | 355 | B | 6/10 | `IndexingWorker` class. Imports `DatabaseManager`, `FilesystemManager` as concrete classes (same blocker pattern). -2 for concrete-class imports; -2 for being a worker pattern that probably needs lifecycle management (start/stop) not yet enumerated. Capabilities: `READ-DATA-DIR`, `WRITE-DATA-DIR`. |
| `ipfs.ts` | 2,373 | A- | 7/10 | `IPFSStorage` class — encapsulates the entire Helia + libp2p stack (28 imports from `@libp2p/*`, `@helia/*`, `@chainsafe/*`). Owns `IPFSOptions` and `IPFSNetworkMode`. Self-contained — the libp2p surface area IS its job. -2 for owning types that should be in `storage/types.ts`; -1 for direct `existsSync`/`mkdirSync`/`readFileSync`/`writeFileSync` calls (should be capability-driven). Capabilities: `NETWORK-LISTEN`, `NETWORK-FETCH`, `WRITE-DATA-DIR`, `READ-DATA-DIR`, peer-id key generation (`SECRET-WRITE`). |
| `migrations.ts` | 1,438 | A | 9/10 | **Best-shape storage module.** Pure function `runMigrations(db: Database)`. Side-effects fully enumerated as explicit migration steps. -1 only for size (each migration step is explicit, which is the *right* pattern — size is a feature here, not a blocker). Capabilities: `WRITE-DATA-DIR` (DDL ops on the db file). |
| `thumbnail.ts` | 392 | A- | 7/10 | Pure-function module (`supportsThumbnails`, `generateThumbnail`). Spawns external thumbnailer via `execFile`. -2 for `PROCESS-SPAWN` capability not yet abstracted; -1 for owning own tmpfile management instead of receiving a `Tempfs` capability. Capabilities: `PROCESS-SPAWN`, `WRITE-DATA-DIR` (tmpdir). |

### 4.QUAT.FINDINGS — `storage/` subtree analysis

**Prediction in §6 was**: "Expect A or B; these were designed as adapters from the start."

**Result**: 2 A, 2 A-, 4 B. Distribution leans toward A/A- as predicted, but the 4 B-class entries reveal **two repeated blocker patterns** that affect this subtree distinctly from the AI subtree:

1. **Concrete-class import instead of interface** (filesystem.ts, indexer.ts) — same pattern as AgentMemoryManager. **Now 4 modules confirmed**: AgentMemoryManager, EmbeddingProvider, filesystem, indexer. This is shaping up as the #1 cross-cutting refactor pattern. Fix shape: extract `IFilesystemManager`, `IDatabaseManager`, `IIPFSStorage` interfaces; concrete classes implement them; consumers depend on interfaces.

2. **Global singleton with setter** (index.ts) — first sighting of this exact pattern. The `globalDatabase` setter/getter is an explicit ambient-authority capsule violation. Fix: remove the singleton; if a "default db" is needed, pass it through DI from the entry point.

**`storage/types.ts` is missing.** Same blocker as `providers/types.ts`: types are co-located with the implementation that produces them, and consumed by sibling files. Lifting any one storage module requires lifting its type-defining sibling. **Extract `storage/types.ts`** — likely a 2-hour fix that improves the score of 4-6 modules in this subtree.

---

## 4.QUINT — Batch 4: `pc2-node/src/services/boson/` sample (5 / 9 modules audited 2026-05-16)

Targeted hypothesis test: §6 predicted "`services/boson/` likely C-heavy (similar to ConnectivityService)." The original pilot found ConnectivityService = C (2/10), and we extrapolated that prediction to the whole subtree. This batch tests it on 5 sibling modules.

| Module | LOC | Class | Score | Verdict |
|---|---|---|---|---|
| `ProxyProtocol.ts` | 395 | A | 10/10 | **Best-shape boson module.** Pure protocol library: parsers, encoders, type-checkers (parsePacketType, getPacketTypeName, parseConnectPayload, encodeAuthPayload, etc.) + `PacketBuffer` class. Zero imports from siblings; pure function family. Should lift directly into the Runtime as `boson-protocol` crate. |
| `CryptoBox.ts` | 655 | A | 9/10 | Pure cryptographic library on top of `tweetnacl` + `ed25519-to-x25519.wasm`. Exports ~14 pure functions (signEd25519, verifyEd25519, generateKeyPair, computeSharedSecret, deriveNonceFromX25519Keys, encrypt, decrypt). Owns its 3 types. Side effects: none beyond logger. -1 only because types co-located with implementation. |
| `NetworkDetector.ts` | 281 | A | 8/10 | Small detection class. Imports only logger. Config-DI'd constructor. Owns `NetworkInfo` + `NetworkDetectorConfig` types. -2 for using `os.networkInterfaces()` directly (capability would be `OS-METADATA-READ`). |
| `IdentityService.ts` | 630 | A- | 7/10 | Imports `crypto` stdlib, `fs`, `path`, `tweetnacl`. Exports pure functions (toBase58, fromBase58, deriveFromMnemonic) + IdentityService class. Direct fs read/write/mkdir for identity-on-disk. -2 for direct fs (should be capability-driven `WRITE-DATA-DIR`); -1 for types-with-impl. |
| `UsernameService.ts` | 364 | A- | 8/10 | Imports fs, path, logger, **`type` import** of GatewayTokenStore (✓ correct pattern — type-only import is the capsule-clean way to express a sibling dependency). Direct fs calls for username persistence. -2 for direct fs. |
| `ActiveProxyClient.ts` | 1,134 | B | 6/10 | Imports `net` (raw TCP), `tweetnacl`, `EventEmitter`, logger. Extends EventEmitter. Implements the actual proxy client over raw TCP. -2 for direct `net.Socket` usage instead of capability-driven networking; -2 for EventEmitter pattern that exposes implicit lifecycle. Otherwise self-contained, well-bounded. |
| `BosonService.ts` | 458 | B | 5/10 | Orchestrator class. Imports 7 sibling services as **concrete classes** (IdentityService, UsernameService, ConnectivityService, WireGuardService, AmneziaWGService, VLESSRealityService, GatewayTokenStore) + binary-manager. Same concrete-class pattern as #1 cross-cutting blocker. -3 for concrete-class imports; -2 for being an orchestrator with implicit ordering. |

(`ConnectivityService` already audited in pilot — C, 2/10. `index.ts` not audited; likely B due to potential singleton patterns based on storage/index.ts precedent.)

### 4.QUINT.MAJOR-FINDING — **the "subtree is C-heavy" hypothesis is REFUTED**

Of 6 boson modules audited (including the pilot's ConnectivityService): 3 A, 2 A-, 2 B, 1 C. **Only ConnectivityService is C.** The rest of the boson subtree is no worse than the storage subtree, and the pure-utility modules (ProxyProtocol, CryptoBox, NetworkDetector) are some of the cleanest A-class modules in pc2-node.

**This means**:
1. **The "AI is mostly A, connectivity is mostly C" framing in the pilot was incorrect** — it was an artefact of which 5 modules were sampled. The strategic conclusion in §5.4 still stands (lift AI features in pc2-node, defer connectivity rewrite) but the **reason** is different: the issue is concentrated in ConnectivityService specifically, not the whole boson subtree.
2. **Capsule readiness is role-based, not subtree-based.** Across all subtrees audited:
   - **Pure utility / protocol leaves** → A-class (10/10 or 9/10): CryptoBox, ProxyProtocol, NetworkDetector, OpenAIProvider, ClaudeProvider, GeminiProvider, OllamaProvider, EmbeddingProvider, AgentTools, migrations.ts, context.ts.
   - **File-backed services with light direct-fs use** → A- (7-8/10): IdentityService, UsernameService, VectorMemoryStore, database.ts, ipfs.ts, thumbnail.ts, AgentMemoryManager.
   - **Medium orchestrators / clients with EventEmitter or direct OS APIs** → B (4-6/10): ActiveProxyClient, BosonService, AIChatService, ToolExecutor, filesystem.ts, indexer.ts, runtime-heartbeat, setupPermissions.
   - **Mega-orchestrator with state machine and setter-injected services** → C (2/10): ConnectivityService.
3. **The migration strategy shifts slightly**:
   - **Old**: lift the AI subtree to Runtime first; defer the connectivity subtree.
   - **New**: lift A-class **leaves** first **across all subtrees** (CryptoBox + ProxyProtocol can go to Runtime as `boson-crypto` and `boson-protocol` crates *alongside* OpenAIProvider+ClaudeProvider going as `ai-providers`). Refactor B-class orchestrators in bounded chunks per-subtree (BosonService, AIChatService, ToolExecutor — all 3-5 days each). Treat ConnectivityService as a special case requiring redesign.

This is the most important strategic finding so far. It un-couples the migration order from the subtree boundaries and re-couples it to the role/shape of each module.

---

## 5. Aggregate observations (pilot + 4 extension batches, 31 / 272 modules)

### 5.1 Distribution after 31 / 272 modules

| Class | Count | Modules |
|---|---|---|
| A (capsule-ready) | 17 | OpenAIProvider (9/10), AgentMemoryManager (8/10), api.ts (10/10), wallet-agent.ts (10/10), qrcode-terminal.d.ts (10/10), qrcode.d.ts (10/10), capabilities.ts (9/10), ClaudeProvider (9/10), GeminiProvider (9/10), OllamaProvider (8/10), EmbeddingProvider (9/10), AgentTools (10/10), context.ts (9/10), migrations.ts (9/10), ProxyProtocol (10/10), CryptoBox (9/10), NetworkDetector (8/10) |
| A- (capsule-ready, light polish) | 6 | VectorMemoryStore (8/10), database.ts (7/10), ipfs.ts (7/10), thumbnail.ts (7/10), IdentityService (7/10), UsernameService (8/10) |
| B (refactorable) | 7 | runtime-heartbeat (7/10), AIChatService (5/10), setupPermissions (5/10), filesystem.ts (6/10), indexer.ts (6/10), storage/index.ts (4/10), ActiveProxyClient (6/10), BosonService (5/10) |
| B- (refactorable, multiple blockers) | 1 | ToolExecutor (4/10) |
| C (deeply coupled) | 1 | ConnectivityService (2/10) |

**23 of 31 modules audited so far are A or A- class (74%).** The hypothesis structure has now refined considerably:

- **Confirmed: A-class clusters at the leaf level across all subtrees.**
  - Types subtree: 5/5 A (100%)
  - AI providers: 4/4 A (100%)
  - Boson pure utilities (CryptoBox, ProxyProtocol, NetworkDetector): 3/3 A (100%)
  - AI tool data: 1/1 A (100%)
  - Storage utilities (migrations, context): 2/2 A (100%)
- **Confirmed: A- (lightly-coupled service) clusters around file-backed components.** Database/file-backed services tend to land in A- territory due to direct fs usage rather than capability-driven I/O. Affects ~6 modules.
- **Confirmed: B-class clusters at the orchestrator level — across all subtrees, not subtree-specific.** BosonService (boson) ≈ AIChatService (AI) ≈ filesystem.ts (storage). Same shape: wires together concrete-class siblings.
- **The C-class outlier remains 1**: ConnectivityService. The original "boson is mostly C" prediction was wrong — only this one module is C.

**The strongest cross-cutting blocker pattern is now unambiguously**: **concrete-class imports where interfaces should suffice**. Confirmed in 7 modules so far across 3 subtrees. The fix is a single coordinated refactoring (extract ~5 interfaces, update imports) that improves the score of 7+ modules in one Phase 2 ticket.

### 5.2 Top blocker patterns (updated after 26 modules)

| Pattern | Now affects | Fix shape | Status |
|---|---|---|---|
| **Concrete class import where interface should suffice** | AgentMemoryManager, EmbeddingProvider, ToolExecutor, filesystem.ts, indexer.ts (**5 confirmed**, pattern very likely repeats in `api/`) | Extract `IFilesystemManager`, `IDatabaseManager`, `IIPFSStorage` interfaces; concrete classes implement them | **#1 cross-cutting refactor pattern**. Promote to dedicated Phase 2 ticket. |
| **Types co-located with implementation, imported by siblings** | `providers/` (OllamaProvider exports types to 4 siblings), `storage/` (database.ts owns 9 types used everywhere) — **2 subtrees confirmed**, applies to ~10-15 modules | Extract `<subtree>/types.ts` files | **High-ROI: ~3 hours total fixes ~10-15 module scores by +1 each**. Two Phase 2 tickets (one per subtree). |
| Async `initialize()` separate from constructor | AIChatService, database.ts (**2 confirmed**) | Either builder pattern or sync construct + lazy connect | Pattern continues; expect 5-10 modules total. |
| Cross-cutting imports from `websocket/events` + `gateway/` inside leaf modules | ToolExecutor | Expose as injected capabilities | Specific to orchestration code; expect 2-3 modules. |
| `: any` escape-hatch typing for sibling service references | ToolExecutor (`aiService?: any`) | Formalise the cross-reference | Newly detected. |
| **Global singleton with setter/getter (ambient authority)** | `storage/index.ts` (globalDatabase) — **1 confirmed, but the canonical capsule violation** | Remove singleton, use constructor DI throughout | Dedicated ticket: search for `let global*` and `set*` setter patterns in remaining audit. |
| Direct `process.exit` instead of "I want to exit" signal | runtime-heartbeat | Capability-based RestartRequester | <5 modules likely affected. |
| Setter-pattern post-construction service injection | ConnectivityService | Constructor-only injection | Yet to find others. |
| Multi-OS branching inside single function | setupPermissions | Per-OS modules + shared core | Yet to find others. |
| `PROCESS-SPAWN` capability not abstracted | thumbnail.ts | Capability injection | Expect 3-5 modules. |

### 5.3 Capability vocabulary surprise (added 2026-05-16)

The `types/capabilities.ts` audit revealed that pc2-node **already has a 14-scope capability vocabulary** mapped 1:1 to ElastOS Runtime provider contracts (`storage:*`, `wallet:*`, `drm:*`, `compute:wasm`, `compute:ai`, `network:rpc`, `ipc:*`, `identity:auth`). This is documented in `docs/core/CAPSULE_COMPATIBILITY.md` (referenced in the file header).

**Implication**: when Phase 2 Cluster 4 refactoring starts, every refactored module should declare its required capabilities using these scope names. The audit-vocabulary in §3 of this doc is a finer-grained analyst tool; `capabilities.ts` is the production contract.

### 5.3 Recommended scoring calibration

The 0-10 scoring proved easy to apply on the 5 pilot modules. Two calibration notes for whoever continues the audit:

- **Don't let LOC dominate the score.** The 1,600-line ConnectivityService scored 2/10; the 300-line OpenAIProvider scored 9/10. Size is a downstream signal of doing too many things; the score should track *capsule criteria violations*, not file size.
- **Score the module against its own boundary, not against pc2-node.** If a module is internally clean but depends on a pc2-node-specific dep that's itself capsule-ready, that's not a violation. If it depends on a globally-mutable singleton, that is.

### 5.4 What this audit tells us about the AGENTIC-PC2-MONETISATION strategy

After 31 modules, the strategic picture has refined significantly from the 5-module pilot:

- **Strong-track-1 signal (CONFIRMED + broadened)**: A-class leaves cluster everywhere, not just in AI. The Monetisation Agent's required components can be sourced from A-class leaves across multiple subtrees:
  - AI provider + memory + tool-data leaves (100% A)
  - **Boson crypto + protocol leaves (100% A)** — CryptoBox (9/10) and ProxyProtocol (10/10) are some of the cleanest A-class modules in pc2-node; these are migration-ready as Runtime crates (`boson-crypto`, `boson-protocol`)
  - Types vocabulary (100% A; already 1:1 mapped to Runtime provider contracts)
  - Pure storage utilities (context, migrations) (100% A)
- **Newly visible track-1 caveat**: orchestrators are B-class **across all subtrees**, not just AI. Refactoring scope (Phase 2 Cluster 4):
  - `AIChatService` (B, 2,237 LOC) — split into 3 (~3-5 days)
  - `ToolExecutor` (B-, 1,894 LOC) — split into 3 + capability injection (~4-5 days)
  - `BosonService` (B, 458 LOC) — interface extraction (~1-2 days)
  - `filesystem.ts` (B, 855 LOC) — interface extraction (~1 day)
  - Total: ~10-15 days of bounded refactor work, value-positive for PC2 v1 in its own right.
- **Strong-track-2 signal (REFINED)**: only ConnectivityService is truly C. The original "connectivity subtree is C-heavy" framing was an artefact of pilot sampling. The actual statement is: **ConnectivityService specifically needs redesign**; the rest of the boson subtree migrates cleanly.
- **NEW: capability vocabulary already exists** in `types/capabilities.ts`, 1:1-mapped to Runtime provider contracts. Runtime convergence is an extension of structure that exists, not greenfield work.
- **NEW: migration order changes**: lift A-class leaves first **across all subtrees** (CryptoBox + ProxyProtocol + AI providers can go to Runtime in parallel as their own crates). Then refactor B-class orchestrators in bounded chunks. Treat ConnectivityService as a special-case redesign.
- **Verdict (refined)**: ship the Mac launcher first. Then, in parallel: (a) Runtime team can begin lifting A-class leaves as crates immediately (low coordination cost; the leaves don't change); (b) PC2 team can refactor B-class orchestrators (4 of them, ~10-15 days total, value-positive); (c) ConnectivityService redesign waits for the Runtime track to provide a clean substrate.

The 31-module sample reduces variance on the strategy significantly compared to the 5-module pilot — the migration is no longer subtree-scoped, it's role-scoped.

---

## 6. What's left to audit

**31 of 272 pc2-node/src .ts files audited (11.4%).** Remaining ~241 files, by directory:

| Directory | Files | Audited | Notes for auditor |
|---|---|---|---|
| `pc2-node/src/api/` | 50 | 0 | HTTP handlers + business logic. Now expect mostly A/A- at leaf (handler) level with isolated B-class orchestrators (per the role-based finding). Watch for Express middleware coupling. |
| `pc2-node/src/services/` | 71 | 13 (ai/ subset + boson/ sample) | `services/ai/`: A-heavy at leaves, B at orchestrators. `services/boson/`: 6 audited (3 A, 2 A-, 1 B-orchestrator, 1 C). Not yet sampled: `services/gateway/`, `services/dDRM/`, `services/ddrm/`, plus 4 more boson files (`ActiveProxyClient` ✓, `IdentityService` ✓, `UsernameService` ✓; `BosonService` ✓; remaining: `index.ts`, others as found). |
| `pc2-node/src/storage/` | 8 | **8 (DONE)** | 2 A, 2 A-, 4 B. No C-class. Storage hypothesis confirmed. |
| `pc2-node/src/utils/` | 16 | 1 (runtime-heartbeat) | Mostly should be A based on role-based finding. |
| `pc2-node/src/websocket/` | 4 | 0 | WebSocket layer. Expect B for the dispatcher, A for helpers/event types. |
| `pc2-node/src/types/` | 5 | **5 (DONE)** | All confirmed A. Subtree complete. |
| `pc2-node/src/sdk/` | 3 | 0 | Likely A. |
| `pc2-node/src/auth/` | 1 | 0 | Likely B (auth has cross-cutting concerns). |
| `pc2-node/src/config/` | 1 | 0 | Likely A (just config loading). |
| `pc2-node/src/wireguard/` | ~5 | 1 (setupPermissions) | Cross-platform OS interaction; expect mix of A (per-OS helpers) and B (the cross-OS dispatcher). |

**Estimated remaining effort**: ~22 hours of analyst-time. Pace continues to improve as patterns repeat (the storage batch took ~25 min for 8 modules vs ~50 min for the pilot's 5).

**Parallelisation possible**: the audit can be split by subtree. Two people working in parallel could finish in <1 calendar day.

**Next high-value subtrees to audit** (when continuing):
1. `services/boson/` sample (3-5 modules) — test the "connectivity is C-heavy" hypothesis, ~20 min
2. `pc2-node/src/services/ai/` remaining 18 files — finish the AI subtree, get full picture, ~1 hour
3. `pc2-node/src/utils/` remaining 15 files — small, fast, likely all A, ~30 min
4. `pc2-node/src/api/` — biggest unknown, will dominate final picture, ~3 hours

**Suggested remaining batches** (when continuing):
- ~~Batch 1 — `pc2-node/src/types/` (5 files, all trivially A, sanity check).~~ **DONE 2026-05-16.**
- ~~Batch 2 — `pc2-node/src/services/ai/` strategic subset (8 of 26 files, hypothesis-test the "AI is mostly A" claim).~~ **DONE 2026-05-16.**
- ~~Batch 3 — `pc2-node/src/storage/` (8 files, sanity-check storage hypothesis).~~ **DONE 2026-05-16.**
- ~~Batch 4 — `services/boson/` sample (5 modules; refuted "boson is mostly C").~~ **DONE 2026-05-16.**
- Batch 5 — `services/ai/` remaining 18 files (finish AI subtree).
- Batch 6 — `pc2-node/src/utils/` remaining 15 files (small, fast).
- Batch 7 — `pc2-node/src/api/` HTTP handlers (50 files; identify the worst Express coupling early).
- Batches 8-N — everything else.

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
- **Audit completion**: 31/272 (11.4%) — pilot (5) + types subtree (5, complete) + AI subtree strategic subset (8) + storage subtree (8, complete) + boson subtree sample (5).
- **Last updated**: see git log on this file.
- **Tied to**:
  - `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-PLAN.md` (Cluster 5)
  - `.cursor/tasks/AGENTIC-PC2-MONETISATION-2026-05/AGENTIC-PC2-MONETISATION-2026-05.md` (dual-track strategy)
  - `docs/core/DECENTRALIZATION_TRAJECTORY.md` (Runtime convergence narrative)
  - `pc2-node/src/types/capabilities.ts` (production capability vocabulary, 14 scopes)
  - `docs/core/CAPSULE_COMPATIBILITY.md` (Runtime provider-contract mapping — referenced from capabilities.ts header)
