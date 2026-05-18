# Task: Phase 2-C — Global-singleton purge (ambient-authority removal)

**Task ID**: `PHASE-2-C-SINGLETON-PURGE`
**Created**: 2026-05-18
**Status**: **Proposed** — awaiting Sasha sign-off
**Priority**: Medium-high (third audit-derived Phase 2 ticket; resolves the audit's #2 blocker pattern)
**Shipping gate**: Cannot **merge to release branch** until Mac launcher 48-72h soak completes per `RELEASE-ENGINEERING-V1280`. Coding on the feature branch is allowed.

> **TL;DR for non-technical sign-off**: see [`PHASE-2-C-CHEAT-SHEET.md`](./PHASE-2-C-CHEAT-SHEET.md) (2-minute read). It explains in plain English what changes, what doesn't, and the four sign-off questions Sasha needs to answer.

## Description

Phase 2-C purges the four remaining global-singleton accessors in `pc2-node/src` and replaces each call site with explicit dependency passing via the pattern *already in use elsewhere in the codebase* (`req.app.locals.X` for Express route handlers; constructor injection for service classes).

**Concrete deliverable**: every `getDatabase()`, `getWASMRuntime()`, `getUpdateService()`, `getGlobalIO()` / `getEventQueue()` call in app code is replaced by an explicit reference that came through either Express request context, a service constructor, or a function argument.

The singleton *accessors themselves* (in `storage/index.ts`, `services/wasm/WASMRuntime.ts`, `services/UpdateService.ts`, `websocket/server.ts`, `websocket/events.ts`) are not deleted in this ticket — they remain in place for bootstrap code (`src/index.ts`, `src/server.ts`) and for the `setMetricsDb()` helper. They become *legitimate single-write accessors* used only at app startup, not ambient-authority pulls.

This is the audit's #2 blocker (10+ call sites of `getDatabase()`, 9+ call sites of `getWASMRuntime()`, etc., scattered across the codebase). Phase 2-A removed ownership-of-shared-types as a blocker. Phase 2-B removed concrete-class imports as a blocker. **Phase 2-C removes ambient-authority as a blocker** for the route layer.

## Background

### Why this matters for ElastOS Runtime convergence

A capsule in the Runtime is *not allowed* to reach into ambient globals. Every dependency must come through:
1. The capability token granted at instantiation (the "object capability" pattern)
2. A message from another capsule via Carrier
3. A constructor argument (for in-capsule sub-modules)

Today, ~36 places in pc2-node "reach for the database" via `getDatabase()`. In the Runtime model, that's a violation: the capsule wouldn't know which database, owned by which capability token, with which access bounds. The fix is to thread the reference explicitly.

The good news: the Express `app.locals.db` pattern is **already used in 200+ places across pc2-node** (40 sites in `api/storage.ts` alone, 37 in `api/index.ts`). Phase 2-C just migrates the remaining stragglers onto the established pattern. We are not introducing a new architecture — we are completing one that's already in place.

### Why this is more work than Phase 2-B

Phase 2-B was 40 single-token insertions (`type`). Phase 2-C requires:
1. Adding a parameter (or already-present `req` argument) to call sites
2. For service classes: adding a constructor parameter and threading the dependency from the instantiation site
3. Confirming the SQLite handle (`db`) is the same instance for ambient and `app.locals` callers (it is — `src/index.ts` does both)
4. Confirming the WASM runtime and update service have identical lifecycles when accessed via the two paths (they do — they're lazy-init singletons that survive the entire process)

The compiled JS *will* change. The runtime semantics will not (modulo the elimination of one lazy-init branch per service, which becomes a no-op because bootstrap already initialises everything before the first request).

### Where this fits in the Phase 2 roadmap

```
Phase 2-A (DONE)  →  Types extraction — risk: very low (types-only, byte-identical or empty .js)
Phase 2-B (DONE)  →  Concrete-class → import type — risk: very low (40 single-token diff, byte-identical .js)
Phase 2-C (THIS)  →  Singleton purge — risk: low-to-moderate (call-site signature changes; compiled .js changes; tests required)
Phase 2-D (next)  →  Sibling-orchestrator import refactor — risk: moderate (extracts interfaces from large service classes)
Phase 2-E (post-Mac)  →  C-class mega-orchestrator structural splits — risk: moderate-to-high (real architectural work)
```

Each phase is strictly less risky than the next; the user gets to see compound proof of methodology success before each step.

## Scope (precise, file-by-file)

### Cluster 1: `getDatabase()` purge — 17 call sites across 4 files

| File | Line(s) | Current call | Replacement pattern |
|---|---|---|---|
| `api/drafts.ts` | 35, 77, 104, 124, 155, 178 | `const db = getDatabase();` (inside Express route handler) | `const db = req.app.locals.db as DatabaseManager;` (pattern already used in same file's siblings) |
| `api/wallet.ts` | 30, 76, 109, 189, 212, 252, 275 | same | same |
| `services/ai/tools/AgentKitExecutor.ts` | 393, 521, 759, 778 | `const db = getDatabase();` (inside instance method) | Add `private readonly db: DatabaseManager` to constructor; thread from `AIChatService` (which already has a `db` reference); inside methods use `this.db` |

**Bootstrap site that stays** (legitimate):
- `src/index.ts` line 182: `setGlobalDatabase(db);` — this remains. It serves the **`utils/metrics.ts` `setMetricsDb()` helper** which has no Express request context (called from domain helpers like `chipotle-client`, `dashPackager`). The metric helper is the only legitimate consumer of the global; everything else must thread the dep.

### Cluster 2: `getWASMRuntime()` purge — 12 call sites across 8 files

| File | Line(s) | Current call | Replacement pattern |
|---|---|---|---|
| `api/wasm.ts` | 21 | `const wasmRuntime = getWASMRuntime();` (top-level module load) | Move into route handler: `const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;` |
| `api/media.ts` | 889, 1123, 1151 | same (inside route handler) | `const wasmRuntime = req.app.locals.wasmRuntime as WASMRuntime;` |
| `api/storage.ts` | 2218, 2512, 2653, 2713 | same | same |
| `services/media/dashPackager.ts` | 272 | `const wasmRuntime = getWASMRuntime();` (inside async helper called from chipotle-client) | Accept `wasmRuntime` as function argument; thread from caller |
| `services/media/mp4split.ts` | 457 | same | same |
| `services/ContentIndexerService.ts` | 202 | `this.wasmRuntime = getWASMRuntime();` (inside `initialize()`) | Accept `wasmRuntime` as constructor argument; remove the lazy pull |
| `storage/ipfs.ts` | 917 | `const runtime = getWASMRuntime();` (inside method) | Already accepts a `wasmRuntime` field elsewhere — convert this method to use `this.wasmRuntime` |

**Bootstrap site that stays**:
- `src/index.ts` should be updated to instantiate `getWASMRuntime()` early (or directly `new WASMRuntime({...})`) and stash it on `app.locals.wasmRuntime` before any route is mounted. This is a one-line addition.

### Cluster 3: `getUpdateService()` purge — 7 call sites across 2 files

| File | Line(s) | Current call | Replacement pattern |
|---|---|---|---|
| `api/index.ts` | 153 | `pc2Version = getUpdateService().getCurrentVersion();` (inside info handler) | `const us = req.app.locals.updateService as UpdateService; pc2Version = us.getCurrentVersion();` |
| `api/update.ts` | 62, 81, 104, 122, 152, 200 | `const updateService = getUpdateService();` (inside route handlers) | `const updateService = req.app.locals.updateService as UpdateService;` |

**Bootstrap site that stays**:
- `src/index.ts` should instantiate `getUpdateService()` (or `initUpdateService(config)`) at bootstrap and stash on `app.locals.updateService`.

### Cluster 4: `getGlobalIO()` / `getEventQueue()` purge — small surface

| File | Sites | Action |
|---|---|---|
| `websocket/server.ts` | `getGlobalIO()` declaration | Keep accessor for legacy callers; mark with deprecation comment |
| `websocket/events.ts` | `getEventQueue()` declaration | Keep accessor for legacy callers; mark with deprecation comment |

**Decision**: do NOT purge these in Phase 2-C. They have ≤3 call sites total and the IO/event-queue lifecycle is genuinely process-global (single Socket.IO server, single FIFO for pre-connection events). They are **acceptable globals** — the same way a process's stdout is. Document them as such; do not refactor.

### Cluster 5: `(global as any).pc2Config` purge — 1 site

| File | Line | Action |
|---|---|---|
| `services/wasm/WASMRuntime.ts` | 1668 | `const config = (global as any).pc2Config?.resources?.compute;` — change `getWASMRuntime()` to require config at first call, OR move the read to bootstrap (`src/index.ts`) and pass the resolved values into `new WASMRuntime({...})`. |

Recommendation: move the read to bootstrap. `src/index.ts` already has the config object loaded by `loadConfig()` — pass it explicitly.

## Out of scope (explicit)

- **Interface extraction from `DatabaseManager`** — not needed for this ticket; the type-only import from Phase 2-B is sufficient. Interface extraction is Phase 2-D / on-demand-for-Runtime.
- **Sibling-orchestrator imports** (`AIChatService`, `BosonService`, `IdentityService`, `AgentKitExecutor`, `ParticleWalletProvider`) — Phase 2-D.
- **C-class mega-orchestrator structural splits** (`ConnectivityService`, `api/index.ts`, `api/storage.ts`) — Phase 2-E.
- **Express coupling removal** — the route handlers still depend on Express; threading deps via `req.app.locals` keeps the existing pattern, it doesn't remove it. Removing Express coupling is Runtime-conversion work, not a Phase 2 task.
- **`getGlobalIO()` / `getEventQueue()`** — kept as acceptable globals (see Cluster 4 decision above).
- **`setMetricsDb()` ambient handle** — kept; it serves the `recordMetricCounter()` helper, which has no Express context.

## Requirements / Implementation Plan

### Pre-flight (read-only, ~30 min)

- [ ] Re-verify the 36 call sites listed in Cluster 1-3 are still accurate (a `grep` rerun before starting; in case any commit landed between ticket-write and execution).
- [ ] Confirm `req.app.locals.db`, `req.app.locals.wasmRuntime`, and `req.app.locals.updateService` would be set up correctly by reading `src/index.ts` and `src/server.ts` bootstrap.
- [ ] Identify the single instantiation site for `AgentKitExecutor` (so we can thread `db` from there).

### Bootstrap updates (~30 min, 1 file)

- [ ] In `src/index.ts`, after `setGlobalDatabase(db)`, add the following before the Express app is mounted:
  ```ts
  const wasmRuntime = getWASMRuntime();
  const updateService = initUpdateService(config.updates ?? {});
  app.locals.db = db;
  app.locals.wasmRuntime = wasmRuntime;
  app.locals.updateService = updateService;
  ```
- [ ] Confirm `src/server.ts` already does `app.locals.db = db` (likely — check); if not, add it.
- [ ] Verify the `app.locals.io` is set after `setGlobalIO(io)` for future migration.

### Per-cluster execution

**Cluster 1 — getDatabase()** (~1.5 hours):
- [ ] Update `api/drafts.ts` 6 call sites: replace `getDatabase()` with `req.app.locals.db as DatabaseManager`. Remove the now-unused `getDatabase` import.
- [ ] Update `api/wallet.ts` 7 call sites: same.
- [ ] Update `AgentKitExecutor.ts`: add `private readonly db: DatabaseManager` constructor param; replace 4 `getDatabase()` calls with `this.db`. Update the single instantiation site to pass `db`.
- [ ] Run `tsc --noEmit` after each file to catch missed call sites. Build, test, lints.

**Cluster 2 — getWASMRuntime()** (~2 hours):
- [ ] Update `api/wasm.ts` top-level: move to per-request (`req.app.locals.wasmRuntime`).
- [ ] Update `api/media.ts` 3 call sites: same.
- [ ] Update `api/storage.ts` 4 call sites: same.
- [ ] Update `services/media/dashPackager.ts`: add `wasmRuntime` as function argument. Find the caller (chipotle-client or similar) and thread the runtime through.
- [ ] Update `services/media/mp4split.ts`: same.
- [ ] Update `services/ContentIndexerService.ts`: add `wasmRuntime` to constructor; remove the `getWASMRuntime()` inside `initialize()`. Update instantiation site in `src/index.ts`.
- [ ] Update `storage/ipfs.ts`: replace 1 ambient call with `this.wasmRuntime` (the class already has a reference per its constructor).
- [ ] Run validation after each file.

**Cluster 3 — getUpdateService()** (~30 min):
- [ ] Update `api/index.ts` 1 site, `api/update.ts` 6 sites: replace with `req.app.locals.updateService`.
- [ ] Validation.

**Cluster 5 — `(global as any).pc2Config`** (~15 min):
- [ ] Move the config read out of `getWASMRuntime()` and into the bootstrap call: `const wasmRuntime = new WASMRuntime({ maxConcurrent: config.resources.compute.max_concurrent_wasm ?? 4, ... });`
- [ ] Delete the `(global as any).pc2Config` read.
- [ ] Validation.

### Final validation (~30 min)

- [ ] `tsc --noEmit` clean across the whole `pc2-node` workspace
- [ ] `npm run build:backend` succeeds
- [ ] `npm run test:unit` all tests pass
- [ ] `ReadLints` clean on all touched files
- [ ] **Empirical proof of correctness** (analogous to Phase 2-B's byte-identical proof):
  - The compiled JS will NOT be byte-identical (this is the expected and accepted cost of Phase 2-C).
  - Instead: capture the call-site count for each accessor before and after. Pre-PR: `getDatabase` appears ~25 times across pc2-node. Post-PR: should be ≤2 (the declaration in `storage/index.ts` + the bootstrap call in `src/index.ts`). Same for `getWASMRuntime` (~13 → ≤2) and `getUpdateService` (~7 → ≤2).
  - Capture compiled `dist/*.js` SHA-256 hashes for the 10 most-touched files; record them in the execution log. They will differ from pre-PR; that is expected. Spot-check ONE compiled file by hand to confirm the difference is only the dependency-passing change (no other regression).

### Smoke test (CI green required before merge)

- [ ] Push to feature branch; wait for full CI matrix (Mac AS, Linux x64, Linux ARM64, Windows x64) to go green.
- [ ] If any platform fails, root-cause and fix before merging. Phase 2-C is the first ticket where CI might catch a real runtime change — that's the point of the matrix.

## Acceptance Criteria

1. ✅ All 17 `getDatabase()` consumer call sites (Clusters 1) replaced with `req.app.locals.db` or `this.db`
2. ✅ All 12 `getWASMRuntime()` consumer call sites (Cluster 2) replaced with `req.app.locals.wasmRuntime`, `this.wasmRuntime`, or function-argument injection
3. ✅ All 7 `getUpdateService()` consumer call sites (Cluster 3) replaced with `req.app.locals.updateService`
4. ✅ The single `(global as any).pc2Config` read in `WASMRuntime.ts` (Cluster 5) eliminated; replaced with explicit constructor argument
5. ✅ `setGlobalDatabase()` remains in `storage/index.ts`; `getDatabase()` remains, but is called only by `utils/metrics.ts setMetricsDb()` and the bootstrap site in `src/index.ts`. No other consumer.
6. ✅ Same for `getUpdateService`, `getWASMRuntime` (declarations stay for bootstrap; no consumer calls remain)
7. ✅ `tsc --noEmit`, `build:backend`, `test:unit`, ReadLints all clean
8. ✅ Full CI smoke matrix (4 platforms) green on the feature branch
9. ✅ Phase 2-C execution log appended to this ticket file documenting:
   - Actual call sites touched per cluster (in case the survey was off by 1-2)
   - Any signature changes to service classes
   - Empirical proof of correctness (call-site counts before/after)
   - Any surprises uncovered (e.g., a singleton call site that requires a non-trivial refactor)
10. ✅ `CAPSULE_READINESS_REPORT.md` §5.6 updated with execution log and revised module scores (the 11 modules with singleton-pull penalty should each lose that −2)

## Risk analysis

**Risk level**: low-to-moderate (vs Phase 2-A/B which were very low).

**Why higher than 2-B**:
- Compiled JS *will* change. We are not just relabeling imports; we are restructuring how dependencies travel. The runtime semantics should be unchanged but the runtime *trace* will differ.
- Service-class constructor signatures change (`AgentKitExecutor`, `ContentIndexerService`). Anywhere they're instantiated must be updated. There appears to be only one instantiation site per class, but a missed site would fail `tsc`.
- The `dashPackager.ts` and `mp4split.ts` callers might span multiple chipotle-client functions; threading `wasmRuntime` through all of them requires care.

**Why still low**:
- The destination pattern (`req.app.locals.X`) is **already in 200+ places across pc2-node**. We are completing a migration, not inventing one.
- `tsc --noEmit` catches all signature mismatches at compile time. Just like Phase 2-B, the compiler is the safety net.
- Unit tests cover the touched files; CI matrix covers integration smoke.
- The actual SQLite handle, WASM runtime instance, and update service instance are unchanged at runtime — they're still the same lazy-initialized singletons, just accessed via a different path.

**Specific things to watch for**:
- **Top-level module-load side effect in `api/wasm.ts`** (line 21: `const wasmRuntime = getWASMRuntime();` runs at import). When moving this into the route handler, confirm no other code in the module relies on the top-level binding.
- **`AIChatService.ts` line 753**: `this.db.getDatabase()` — this is calling the inner `DatabaseManager.getDatabase()` method (returns the raw SQLite handle), NOT the singleton accessor. Do not touch this site.
- **Race condition concern**: if a route handler is somehow called before `app.locals.X` is set, it will see `undefined`. Bootstrap order matters; the `app.locals.X = ...` assignments must happen before `app.use(routes)`. Verify in `src/index.ts` / `src/server.ts`.

**Rollback plan**: revert the single PR commit; `setGlobalDatabase()` etc. are still in place, so reverting is one click. Phase 2-A and 2-B are unaffected because they live in earlier commits.

## PR strategy

**Recommended**: **single PR** for all 36 conversions across the 3 clusters + bootstrap update + Cluster 5 fix.

**Why**: 
- They're all the same mechanical pattern (singleton → request-context lookup or constructor injection)
- They share the same risk profile and the same compiler safety net
- A single PR allows the reviewer to mentally hold the full "before/after" pattern; multiple PRs would force re-explaining the pattern each time
- The bootstrap update (adding 3 lines to `src/index.ts`) is co-dependent with the route changes — splitting them creates a CI-broken intermediate state

**Alternative (if Sasha prefers smaller PRs)**: split into:
- PR-1: bootstrap update only (`src/index.ts` sets `app.locals.db/wasmRuntime/updateService`) — proves the bootstrap works without breaking anything
- PR-2: Cluster 1 (`getDatabase()` → `req.app.locals.db`) — 17 call sites
- PR-3: Cluster 2 (`getWASMRuntime()` → `req.app.locals.wasmRuntime` + constructor injection) — 12 call sites
- PR-4: Cluster 3 (`getUpdateService()` → `req.app.locals.updateService`) — 7 call sites
- PR-5: Cluster 5 (`(global as any).pc2Config` → constructor injection) — 1 site

Single-PR estimated effort: **~6-8 hours focused work** (including validation + execution log). Split estimate: same total + ~1 hour of PR-shepherding overhead.

## Estimated effort

- **Pre-flight survey**: 30 min
- **Bootstrap update**: 30 min
- **Cluster 1 (getDatabase)**: 1.5 hours
- **Cluster 2 (getWASMRuntime)**: 2 hours
- **Cluster 3 (getUpdateService)**: 30 min
- **Cluster 5 (global config)**: 15 min
- **Validation + CI**: 30 min
- **Execution log + audit doc update**: 45 min

**Total**: ~6-7 hours single-session, or 2-3 calendar days if interleaved with other work.

## Score impact (post-Phase-2-C)

Audit Pattern #2 (ambient global singletons) is substantially resolved for the route layer. Each of the ~11 modules with a `getDatabase()` or `getWASMRuntime()` or `getUpdateService()` consumer call previously had a −2 score penalty for ambient authority. With those calls gone, the penalty drops.

**Estimated band shifts**:
- 5-7 B-class modules promoted to A- (e.g., `api/drafts.ts`, `api/wallet.ts`, `api/update.ts`, `api/wasm.ts`, `services/media/dashPackager.ts`)
- 3-4 A- modules promoted to A
- 1-2 C-class modules may move up to B if singleton was their largest blocker (less likely for the mega-orchestrators, which have many other issues)
- Net: ~14-18 score points moved across pc2-node

The audit's "concrete-class import" and "global singleton" patterns will both be substantially resolved after Phase 2-C. The remaining blockers will be:
- Sibling-orchestrator imports → Phase 2-D
- Mega-orchestrator structural issues → Phase 2-E (post-Mac-soak)
- Other audit-flagged patterns (logging, error handling, etc.) → on-demand

## What this leaves for subsequent phases

After Phase 2-C completes:
- **Phase 2-D** — extract small interfaces from sibling-orchestrator classes (`AIChatService`, `BosonService`, `IdentityService`, `AgentKitExecutor`, `ParticleWalletProvider`) so their consumers can depend on the interface instead of the concrete class. Similar mechanical pattern to 2-B but at the orchestrator boundary.
- **Phase 2-E** — split the 3 C-class mega-orchestrators (`ConnectivityService`, `api/index.ts`, `api/storage.ts`) into smaller well-defined modules. This is the only Phase 2 step that involves real architectural decisions; defer until post-Mac-soak.
- **Phase 2 CI-hygiene queue** — small standalone ticket for orphan submodule cleanup + Node 24 actions bump. Independent of any code work.
- **Phase 2 canvas migration** — `canvas@2.x` → `@napi-rs/canvas`, drops ~12MB per install + CI system-libs step. Post-Mac-soak.

## Open questions for Sasha (4)

1. **PR strategy**: single PR or split into 5 sub-PRs? Recommendation: **single PR** — same pattern repeated, easier review, no intermediate-broken state.
2. **Bootstrap diff acceptable?**: We will add 3-5 lines to `src/index.ts` for the `app.locals.X` setup, plus possibly a small constructor change to `WASMRuntime` to accept explicit config. Confirm this is in-scope for a refactor ticket (it is — it's the entry point of the migration).
3. **Mac-soak confirmation**: Phase 2-C will not ship to release branch until the Mac launcher soak gate clears. Confirm this stays gated; coding can proceed on `feat/t-1-telemetry-and-support` anytime.
4. **Should we also remove the deprecated `getGlobalIO()` / `getEventQueue()`?**: Recommend **no, keep them** — they are acceptable globals for the single Socket.IO server and pre-connection FIFO. Annotate with a deprecation comment for the long-term Runtime conversion, but no code change in this ticket.

## CI-hygiene notes

The Phase 2 CI runs (since 2026-05-17) have been flagging:
1. **Orphan `submodules/particle-auth` gitlink** — fix: `git rm submodules/particle-auth`. ~30 second fix.
2. **Node 20 deprecation cutoff** — bump `actions/checkout`, `actions/setup-node`, `actions/cache` to v5 before **June 2, 2026**. ~10 min fix.

These do not affect Phase 2-C critical path. Will be folded into the same "Phase 2 CI-hygiene" ticket queued during Phase 2-B execution.

---

*This ticket is the natural successor to `PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md`. The methodology lesson from 2-B (grep for `<ClassName>.` static-member access) is baked into the pre-flight checks above.*
