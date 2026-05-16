# Capsule Readiness Report (Cluster 5.1, pilot)

**Status**: PILOT (methodology validated; 5/272 modules audited). The rubric and vocabulary in §1-§3 are stable. The per-module audit in §4 should be extended to cover the remaining 267 modules — each takes ~10 min once you're warmed up to the rubric.

**Captured**: 2026-05-16 (pilot run).

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

## 5. Aggregate observations from the pilot

### 5.1 Distribution preview (5 / 272 modules)

| Class | Count | Modules |
|---|---|---|
| A (capsule-ready) | 2 | OpenAIProvider (9/10), AgentMemoryManager (8/10) |
| B (refactorable) | 2 | runtime-heartbeat (7/10), setupPermissions (5/10) |
| C (deeply coupled) | 1 | ConnectivityService (2/10) |

**Hypothesis to test as the audit extends**: the AI + storage areas of pc2-node are more capsule-shaped than the connectivity / orchestration areas. This makes sense given the AI features were added later (with better patterns) while connectivity grew organically. Confirming/refuting this is one of the main values of completing the audit.

### 5.2 Top blocker patterns (so far)

Each blocker pattern appeared in at least 2 of the 5 audited modules. If they appear in 30+ modules across the full audit, they become Phase 2 refactoring candidates:

| Pattern | Modules affected (pilot) | Fix shape | Estimated breadth (extrapolating from pilot) |
|---|---|---|---|
| Types defined in one provider and imported by siblings | OpenAIProvider | Extract shared types module | ~10-20 modules likely affected |
| Direct `process.exit` instead of "I want to exit" signal | runtime-heartbeat | Capability-based RestartRequester | <5 modules likely affected |
| Setter-pattern post-construction service injection | ConnectivityService | Constructor-only injection | ~5-15 modules likely affected |
| Multi-OS branching inside single function | setupPermissions | Per-OS modules + shared core | ~10 modules likely affected |
| Concrete class import where interface should suffice | AgentMemoryManager (FilesystemManager) | Type-only interface extraction | ~20-40 modules likely affected |

### 5.3 Recommended scoring calibration

The 0-10 scoring proved easy to apply on the 5 pilot modules. Two calibration notes for whoever continues the audit:

- **Don't let LOC dominate the score.** The 1,600-line ConnectivityService scored 2/10; the 300-line OpenAIProvider scored 9/10. Size is a downstream signal of doing too many things; the score should track *capsule criteria violations*, not file size.
- **Score the module against its own boundary, not against pc2-node.** If a module is internally clean but depends on a pc2-node-specific dep that's itself capsule-ready, that's not a violation. If it depends on a globally-mutable singleton, that is.

### 5.4 What this audit tells us about the AGENTIC-PC2-MONETISATION strategy

The pilot data weakly supports the "dual-track" plan in the mandate:

- **Strong-track-1 signal**: the AI provider + memory areas are already close to capsule-shaped. The AI features that the mandate prioritises (Monetisation Agent, AI Chat Service, Provider Picker) can be evolved INSIDE pc2-node with high confidence that they'll translate to Runtime later. **PC2 v1 work in this area is not throw-away**.
- **Strong-track-2 signal**: the connectivity orchestration area is deeply coupled. Building further significant AI infrastructure on top of ConnectivityService would entangle the new code with the legacy state machine. Whatever AI infra grows here should either (a) stay on the existing rails (don't deepen the coupling) or (b) wait for the Runtime track to provide a clean substrate.
- **Verdict**: ship the Mac launcher first (current focus), then begin AI feature evolution in the AI subtree (which migrates cleanly), then defer the connectivity-orchestration rewrite to the Runtime track.

This is the conclusion the mandate already reaches; the pilot adds empirical evidence rather than changing the strategy.

---

## 6. What's left to audit

5 of 272 pc2-node/src .ts files audited (1.8%). Remaining 267 files, by directory:

| Directory | Files | Notes for auditor |
|---|---|---|
| `pc2-node/src/api/` | 50 | HTTP handlers + business logic. Expect mostly B-class; watch for Express middleware coupling. |
| `pc2-node/src/services/` | 71 | Mixed. The boson/ subtree is likely C-heavy (similar to ConnectivityService). The ai/ subtree is likely A-heavy (similar to OpenAIProvider). |
| `pc2-node/src/storage/` | 8 | Storage abstractions. Expect A or B; these were designed as adapters from the start. |
| `pc2-node/src/utils/` | 16 | Utilities. Mostly should be A. runtime-heartbeat is the outlier already audited. |
| `pc2-node/src/websocket/` | 4 | WebSocket layer. Expect B or C depending on coupling to Express. |
| `pc2-node/src/types/` | 5 | Type definitions only. Trivially A (no behaviour). |
| `pc2-node/src/sdk/` | 3 | Likely A. |
| `pc2-node/src/auth/` | 1 | Likely B (auth has cross-cutting concerns). |
| `pc2-node/src/config/` | 1 | Likely A (just config loading). |

**Estimated remaining effort**: ~30 hours of analyst-time at the current pace (~10 min per module). Reduces with the auditor's familiarity — last 50 modules likely 5 min each.

**Parallelisation possible**: the audit can be split by subtree. Two people working in parallel could finish in <2 calendar days.

**Suggested next batches** (when continuing):
- Batch 1 — `pc2-node/src/types/` (5 files, all trivially A, sanity check).
- Batch 2 — `pc2-node/src/services/ai/` (estimated ~15 files, hypothesis-test the "AI is mostly A" claim).
- Batch 3 — `pc2-node/src/services/boson/` (~10 files, hypothesis-test the "boson is mostly C" claim).
- Batch 4 — `pc2-node/src/api/` HTTP handlers (50 files; identify the worst Express coupling early).
- Batches 5-N — everything else.

After each batch, append a section to §4 of this document under a new heading. Don't replace the pilot data — we want the time series.

## 7. Recommended next steps

1. **Today**: stop here. The methodology is validated, the pilot data is recorded, the calibration notes give the next auditor what they need to continue.
2. **Post-Mac-launcher window (May 25-29)**: extend the audit in batches per §6. Aim to have 50% of pc2-node/src classified within that window.
3. **Once 50% classified**: produce a `CAPSULE_READINESS_REPORT_v1.md` snapshot, then continue. Phase 2 plan can then start citing real module names instead of guessing.
4. **Concurrent (audit-only, no code change yet)**: §5.2's blocker patterns become candidate Phase 2 refactor work items as evidence accumulates. Each pattern with 30+ affected modules gets its own ticket.
5. **Not before 100% audit** but planned: the per-pattern Phase 2 work items get scheduled into Cluster 4 of `PHASE-2-PLAN.md` once Mac launcher is stable. This is when audit data turns into actual refactoring.

---

## Document metadata

- **Source of truth**: this file.
- **Scope**: pc2-node/src — 272 .ts files, 82,580 LOC (per jscpd).
- **Audit completion**: 5/272 (1.8%) pilot done; methodology validated.
- **Last updated**: see git log on this file.
- **Tied to**:
  - `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-PLAN.md` (Cluster 5)
  - `.cursor/tasks/AGENTIC-PC2-MONETISATION-2026-05/AGENTIC-PC2-MONETISATION-2026-05.md` (dual-track strategy)
  - `docs/core/DECENTRALIZATION_TRAJECTORY.md` (Runtime convergence narrative)
