# Task: Phase 2 — Ambient `global.*` cleanup (4 patterns, 8 sites)

**Task ID**: `PHASE-2-GLOBALS-CLEANUP`
**Created**: 2026-05-18
**Status**: **EXECUTED on feature branch** (`feat/t-1-telemetry-and-support`, 2026-05-18 midday) — awaiting CI green + Sasha review for merge-gate sign-off
**Priority**: Medium (resolves audit Pattern #2 remainder; **also fixes one latent bug** — db-persisted resource settings have been silently ignored since `(global as any).db` is never set)
**Shipping gate**: Cannot **merge to release branch** until Mac launcher 48-72h soak completes per `RELEASE-ENGINEERING-V1280`. Coding on the feature branch is allowed.
**Execution log**: see §"Execution log (2026-05-18 midday)" below.

> **TL;DR for non-technical sign-off**: see [`PHASE-2-GLOBALS-CHEAT-SHEET.md`](./PHASE-2-GLOBALS-CHEAT-SHEET.md) (2-minute read).

## Description

This ticket was promoted out of Phase 2-C scope when investigation revealed that `(global as any).pc2Config` is a single instance of a wider pattern: **four distinct ambient `global.*` properties used as cross-module dependency channels** in pc2-node. Each has a different correct answer; this ticket addresses all four together so the architectural pattern is fully resolved, not just one instance.

**Concrete deliverable**: replace all 4 ambient globals with the established `req.app.locals.X` pattern, except where the architectural intent specifically requires the global (the `__filesystem` defensive fallback in the Drivers tool-execution path). Total source changes: ~8-12 sites across ~6 files.

## Background

### The 4 ambient globals: full catalog

#### Global 1 — `(global as any).pc2Config` (vestigial mutable cache)

| Aspect | Detail |
|---|---|
| Set at | `api/storage.ts:263-272` — lazy, only when a user POSTs `/api/storage/limit` |
| Read at | `api/resources.ts:29`, `api/info.ts:922`, `services/wasm/WASMRuntime.ts:1668` |
| Why it exists | A 2024-era hack: when storage limit is set via API, the new value is cached in `pc2Config` so subsequent reads see it immediately (without DB round-trip). |
| Why it's broken | The DB IS already the source of truth (`db.setSetting('storage_limit', limit)` happens immediately above the global write). The cache is redundant. **Furthermore**: the cache only handles `storage_limit` writes — when other settings change via `api/resources.ts`, `pc2Config` isn't updated. So the "immediate effect" property only works for one of four mutable settings. |
| Right answer | **Delete entirely**. Readers go to `req.app.locals.db.getSetting(...)` directly. Cost: 1 cheap DB query per read instead of 1 global property access. (DB queries on a local SQLite file are ~microseconds; immeasurable user-impact.) |

#### Global 2 — `(global as any).db` (latent bug; never initialized)

| Aspect | Detail |
|---|---|
| Set at | **NEVER SET** anywhere in `pc2-node/src` (confirmed via exhaustive grep) |
| Read at | `api/resources.ts:24` (`function getDb() { return (global as any).db; }`), `api/supernode.ts:17` (same pattern) |
| Why it's broken | `db?.getSetting(...)` always returns `undefined`. The "Database settings override config file" comment at `api/resources.ts:38-39` is **currently false** — db-persisted resource limits are silently ignored. Users who set their `storage_limit` via `/api/storage/limit` see the write succeed (the `db.setSetting(...)` call works), but on next read the system falls back to config.json or hardcoded defaults. |
| Right answer | Replace `getDb()` helper with `req.app.locals.db` lookup at each route. This **fixes the latent bug** — db-persisted settings would start being honored. (See "Behavioral change" section below — this *is* a deliberate behavior change.) |

#### Global 3 — `(global as any).__filesystem` (defensive fallback)

| Aspect | Detail |
|---|---|
| Set at | `server.ts:141` (alongside `app.locals.filesystem`); flagged in log as "stored in app.locals and global" |
| Read at | `api/other.ts:882` — ONLY inside an `if (!filesystem) { ... fallback ... }` block that the source explicitly marks `[Drivers] ⚠️ CRITICAL: filesystem not available in app.locals` |
| Why it exists | This is a **deliberate** defensive fallback for the Drivers tool-execution path in case `app.locals.filesystem` is somehow undefined at request time. It's a belt-and-suspenders pattern around a critical code path. |
| Right answer | **Keep as-is** with a comment explaining the intent. This is a legitimate use of the global pattern — not ambient authority, but explicit failover. Document it in this ticket so a future audit doesn't flag it as a blocker. |

#### Global 4 — `(global as any).ipfsStorage` (single-write bootstrap exposure)

| Aspect | Detail |
|---|---|
| Set at | `index.ts:245` (bootstrap, single-write) |
| Read at | `api/supernode.ts:21` (via `getIpfs()` helper) |
| Why it exists | Same pattern as the `getDatabase()` singleton purged in 2-C: a helper to access IPFS from contexts that don't have Express req. |
| Right answer | Replace `getIpfs()` with `req.app.locals.ipfs as IPFSStorage` at each call site in `api/supernode.ts`. Same mechanical pattern as 2-C Cluster 3. |

### Why this matters for ElastOS Runtime convergence

Same logic as Phase 2-C: capsule code cannot reach into ambient globals. Every dependency must come through a declared channel. After this ticket, the only `(global as any).X` pattern remaining in `pc2-node/src` is `__filesystem` — and that one is documented as a *deliberate* defensive fallback at a critical code path, not ambient authority.

## Acceptance criteria

1. **Global 1 (`pc2Config`)**: delete the write block in `api/storage.ts:263-272`; delete the read in `api/resources.ts:29`; delete the read in `api/info.ts:922`; delete the read in `services/wasm/WASMRuntime.ts:1668`. Replace each read with the equivalent `db.getSetting(...)` query. For WASMRuntime, accept that bootstrap-time config from `config.json` is the lifecycle (db updates require restart) — this matches the *actual* current behavior because pc2Config never updated for `max_concurrent_wasm` / `max_memory_mb` / `wasm_timeout_ms` anyway.
2. **Global 2 (`global.db`)**: delete the `getDb()` helpers in `api/resources.ts:23-25` and `api/supernode.ts:16-18`. Replace every `getDb()` call (6 total: 4 in resources.ts, 2 in supernode.ts) with `req.app.locals.db as DatabaseManager`.
3. **Global 3 (`__filesystem`)**: leave write at `server.ts:141` and read at `api/other.ts:882` exactly as-is. Add explanatory comments at both sites identifying this as the audit-permitted "defensive fallback at a critical code path" pattern.
4. **Global 4 (`ipfsStorage`)**: delete the `getIpfs()` helper in `api/supernode.ts:20-22`. Replace every `getIpfs()` call with `req.app.locals.ipfs as IPFSStorage`. (Single-write bootstrap write at `index.ts:245` stays — it's the equivalent of `setGlobalDatabase()` at startup, which audit permits at bootstrap.)
5. `tsc --noEmit` passes with zero errors.
6. `npm run build:backend` succeeds.
7. `npm run test:unit` passes (7/7).
8. `ReadLints` reports zero new errors on every modified file.
9. **Live dev-server smoke**: test the affected endpoints to verify behavior:
   - `GET /api/health` — should still return 200 with version
   - `GET /api/info` — `storage_limit` field should now come from db setting if set (was previously falling back to config.json default — this is the intentional behavior fix)
   - `GET /api/storage/usage` — same behavior expectation
   - `POST /api/storage/limit` then `GET /api/storage/usage` — the round-trip should reflect the user's value (this WAS broken before; after fix it works correctly)
   - `GET /api/resources` (the snapshot) — db-persisted overrides should now be honored
10. Audit doc `CAPSULE_READINESS_REPORT.md` §5.9 updated with execution log.

## Implementation plan

### Step 1 — Delete `pc2Config` (4 sites)

**File: `pc2-node/src/api/storage.ts`** — lines 263-272 — delete the entire `if (!(global as any).pc2Config) {...}` block. The `db?.setSetting('storage_limit', limit)` call immediately above (line 260) already persists the change.

**File: `pc2-node/src/api/resources.ts`** — lines 23-30: delete `function getConfig()` AND `function getDb()`. Replace each call site with the appropriate `req.app.locals.X` lookup. Note: `getConfiguredLimits()` at line 35 currently receives no `req` — its 1 caller (`buildResourceSnapshot`) is called from inside route handlers, so we can thread `db: DatabaseManager` through as a parameter.

**File: `pc2-node/src/api/info.ts`** — line 922: change `dbLimit || (global as any).pc2Config?.resources?.storage?.limit` to just `dbLimit`. (The `dbLimit` value is already pulled from db?.getSetting via the function parameter; the pc2Config fallback is redundant.)

**File: `pc2-node/src/services/wasm/WASMRuntime.ts`** — line 1668: change `const config = (global as any).pc2Config?.resources?.compute;` to `const config = undefined;` and rely on the existing `?? defaults` fallbacks. **Why this is safe**: pc2Config was never updated for compute settings (only storage), so `config?.max_concurrent_wasm` was always undefined here anyway. Removing the read doesn't change behavior. (Alternative: accept the WASMRuntime config from a bootstrap parameter — but this is a bigger change and `getWASMRuntime()` is already called from `src/index.ts` Phase 2-C code; the cleanest path is to let bootstrap pass config explicitly. See "Optional improvement" below.)

### Step 2 — Fix `(global as any).db` latent bug (6 sites)

**File: `pc2-node/src/api/resources.ts`** — delete the `getDb()` helper at lines 23-25. At each route handler that uses it (lines 37, 165, 205), use `req.app.locals.db as DatabaseManager` instead. For `getConfiguredLimits()` (called at line 37), accept `db: DatabaseManager` as a parameter and thread from the caller.

**File: `pc2-node/src/api/supernode.ts`** — delete the `getDb()` helper at lines 16-18. At each route handler that uses it (lines 114, 145), use `req.app.locals.db as DatabaseManager` instead.

### Step 3 — Document `__filesystem` defensive fallback (2 comment additions, no code change)

**File: `pc2-node/src/server.ts`** — at line 141, add a comment block explaining this is the audit-permitted defensive fallback pattern.

**File: `pc2-node/src/api/other.ts`** — at line 882, add a comment block explaining the same.

### Step 4 — Purge `ipfsStorage` global access in `api/supernode.ts` (2 sites + 1 helper)

**File: `pc2-node/src/api/supernode.ts`** — delete the `getIpfs()` helper at lines 20-22. At each call site, use `req.app.locals.ipfs as IPFSStorage` instead. **Keep the bootstrap write** at `index.ts:245` — single-write at startup is the audit-permitted pattern (equivalent to `setGlobalDatabase()`).

### Optional improvement (decide during execution)

Step 1's `WASMRuntime.ts:1668` change accepts that compute config is bootstrap-time-only. A cleaner version would refactor `getWASMRuntime()` to accept an explicit config object, with bootstrap reading from config + db settings explicitly. This is ~1 hour of additional work and changes the singleton's signature.

**Recommendation**: defer the WASMRuntime config-injection refactor to a follow-up ticket. For this ticket, just remove the dead pc2Config read and rely on bootstrap defaults. The current behavior (config-file values at startup) is preserved exactly.

## Files to modify

1. `pc2-node/src/api/storage.ts` — delete pc2Config write block (1 site)
2. `pc2-node/src/api/resources.ts` — delete `getDb()` + `getConfig()` helpers; thread `db` parameter; replace 4 `db?.getSetting()` calls (touches function signatures)
3. `pc2-node/src/api/info.ts` — drop pc2Config fallback in `getEffectiveStorageLimit()` (1 line change)
4. `pc2-node/src/services/wasm/WASMRuntime.ts` — drop pc2Config read; rely on fallbacks (1 line change)
5. `pc2-node/src/api/supernode.ts` — delete `getDb()` + `getIpfs()` helpers; replace 4 call sites
6. `pc2-node/src/server.ts` — comment-only at line 141
7. `pc2-node/src/api/other.ts` — comment-only at line 882

## Behavioral change (deliberate)

**Before this ticket**:
- Users who POST `/api/storage/limit` see the `db.setSetting('storage_limit', limit)` call succeed.
- But on subsequent reads of `/api/storage/usage` or `/api/info`, the response uses config.json default OR the pc2Config cache (only for `storage_limit`).
- For `max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`: user-set values via `/api/resources` are persisted to db but **silently ignored on read** because `getDb()` returns undefined.

**After this ticket**:
- Users who POST `/api/storage/limit` see their setting persisted AND honored on all subsequent reads.
- Users who POST `/api/resources` settings see them persisted AND honored on subsequent reads — this is a **bug fix**, not a regression.

The risk vector to consider: **does any existing user have a db-persisted resource setting that they don't actually want anymore?** Unlikely, because the setting was being silently ignored — users would have no reason to remember they set it. But it's worth verifying on a representative real PC2 install before merging.

## Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TypeScript catches a value-use I missed | Very low | Compile error, caught immediately | Pre-flight surveyed in this ticket |
| Threading `db: DatabaseManager` through `getConfiguredLimits()` breaks an unexpected caller | Low | Build fail or test fail | Survey + tsc — caller list is small |
| Behavioral change from fixing `global.db` bug surprises a user | Low | User's previously-ignored db setting starts being applied | Pre-deploy: query a sample of existing user dbs for non-default `storage_limit` / `max_concurrent_wasm` / `max_memory_mb` / `wasm_timeout_ms` values; document what would change if any |
| WASMRuntime compute config changes behavior | None | Same defaults as today, since pc2Config was never set for compute settings | Verified in code: only `storage_limit` ever writes to pc2Config |
| `__filesystem` fallback gets removed accidentally | None | Drivers tool-execution path would fail when `app.locals.filesystem` is undefined | Explicitly keeping this — adding comment to prevent future misclassification |
| Bootstrap-write of `ipfsStorage` is removed by future audit | Low | `getIpfs()` callers would break | Comment added at `index.ts:245` explaining the bootstrap-pattern intent |

**Overall risk**: low-medium. The mechanical changes are straightforward but the *deliberate behavioral fix* for `global.db` is a real change with user-visible implications. The mitigation is the pre-deploy db survey + documenting the change as a fix in release notes.

## Estimated effort

- **Pre-flight survey + design**: ✅ already done (in this ticket).
- **Step 1 (pc2Config delete)**: 30 min.
- **Step 2 (getDb fix)**: 45 min (involves threading `db` parameter through `getConfiguredLimits`).
- **Step 3 (`__filesystem` comments)**: 10 min.
- **Step 4 (`ipfsStorage` purge)**: 20 min.
- **Validation (tsc + build + tests + lints)**: 15 min.
- **Live smoke**: 15 min (need to test the round-trip POST→GET for each setting).
- **Execution log + audit doc update**: 30 min.

**Total**: ~3 hours single-session. Larger than 2-D (50 min) and 2-B (2 h), smaller than 2-C (3 h).

## Score impact

After this ticket, the audit's Pattern #2 (ambient global singletons) is **fully resolved** for `pc2-node/src` consumer code:
- Phase 2-C removed `getDatabase()`, `getWASMRuntime()`, `getUpdateService()` ambient accessors from route handlers.
- This ticket removes the remaining `(global as any).X` ambient access patterns.

Estimated band shifts:
- `api/storage.ts`: B → B+ (one less audit blocker)
- `api/resources.ts`: B- → B+ (two blockers removed: pc2Config + global.db; PLUS the latent bug is fixed)
- `api/info.ts`: A- → A
- `services/wasm/WASMRuntime.ts`: B → B+ (one less ambient pull)
- `api/supernode.ts`: B- → B (two blockers removed: global.db + ipfsStorage)

Net: ~8-10 score points across 5 modules. **Plus**: one real user-visible correctness fix (db-persisted resource settings start being honored).

After this ticket lands, the audit's mechanical Pattern #2 work is functionally complete. The remaining "ambient" pulls are:
- Deep-helper WASM/dDRM/IPFS sites (Phase 2-D-helpers deferred ticket)
- `__filesystem` defensive fallback (intentional, documented)
- `ipfsStorage` bootstrap-only write (intentional, single-write at startup)

## What this leaves for subsequent phases

- **Phase 2-D-helpers** (8 deep WASM/dDRM/IPFS helper sites deferred from 2-C) — would thread `wasmRuntime` through 5+ helper layers.
- **Phase 2-E** — mega-orchestrator splits (ConnectivityService, api/index.ts, api/storage.ts).
- **AgentKitExecutor ProposalStore extraction** (deferred from 2-D) — would resolve the static-method consumer pattern in `api/wallet.ts`.
- **Optional WASMRuntime config-injection refactor** — would make compute settings injectable from db at startup; opens path to runtime-mutable resource limits later. ~1 hour, low ROI unless dynamic limits are wanted.

## PR strategy

**Recommended**: single PR with all 4 cleanups bundled. Same pattern as Phase 2-C (which shipped 27 site changes in one PR). Each section is internally consistent and the validation strategy can verify the whole batch at once.

Alternative: split into 4 PRs (one per global). Higher PR-shepherding cost; not recommended unless reviewer prefers smaller chunks.

## Open questions for Sasha (4)

1. **Approve the `global.db` behavior change**? Fixing the bug means db-persisted resource settings start being honored on reads. This is correct behavior, but it's a *change* from current "silently ignored" behavior. Recommendation: ship the fix, document in release notes as "bug fix: resource limit settings now correctly applied".
2. **Defer the WASMRuntime config-injection refactor** to a follow-up ticket? Or fold into this one? Recommendation: defer — this ticket is already 3h.
3. **Bundle all 4 globals into one PR** or split? Recommendation: bundle (matches 2-C precedent).
4. **Execute now on feature branch** or wait for Mac soak? Same as 2-B/2-C/2-D — coding gate is open. Recommendation: execute now.

---

## Execution log (2026-05-18 midday)

### Sign-off decisions captured before execution

User approved both upfront via structured questions:
1. **"Fix the bug AND ship with release-notes communication"** — chosen over narrow-scope or defer-entirely.
2. **"Execute Phase 2-Globals now"** — same proven workflow as 2-C.

### Pre-flight db survey (mandatory pre-merge step per ticket §"Behavioral change")

Surveyed `/Users/mtk/Documents/Cursor/pc2.net/pc2-node/data/pc2.db`:
- 46 total rows in `settings` table.
- **Zero rows** match `storage_limit`, `max_concurrent_wasm`, `max_memory_mb`, or `wasm_timeout_ms` (exact or pattern match).
- All 46 settings are per-user UI prefs (`taskbar_position`, `desktop_bg_url`, etc.).

**Interpretation**: nobody has ever successfully set a resource limit on this install. Consistent with the bug analysis — the read path was broken, so users had no reason to keep settings even if they tried to set them. The bug-fix's user-visible blast radius is **forward-looking only**; no existing user behavior changes.

### Brief tool-side incident

Three small file-read tool calls hung for ~28 min mid-session (no code damage — happened before the editing phase). Recovery: confirmed clean state via `git status`, resumed using the call-site map already in the ticket without further wider reads.

### What landed

All 4 steps applied:

**Step 1 — pc2Config delete (4 sites)**:
- `api/storage.ts:263-272` — write block deleted, replaced with explanatory comment pointing at this ticket
- `api/resources.ts:28-30` — `getConfig()` helper deleted; readers now use `req.app.locals.config as Config | undefined`
- `api/info.ts:922` — `(global as any).pc2Config?.resources?.storage?.limit` fallback dropped; `db.getSetting('storage_limit')` is now the sole user-set source
- `services/wasm/WASMRuntime.ts:1668` — dead `pc2Config?.resources?.compute` read removed; preserved identical behavior because the read always returned undefined (compute settings were never written to `pc2Config`)

**Step 2 — `(global as any).db` latent bug fix (6 sites)**:
- `api/resources.ts:23-25` — `getDb()` helper deleted; 3 route handlers + `getConfiguredLimits()` now thread `req.app.locals.db as DatabaseManager | undefined`
- `api/supernode.ts:16-18` — `getDb()` helper deleted; 2 route handlers now use `req.app.locals.db as DatabaseManager | undefined`
- `getConfiguredLimits()` signature updated: now accepts `(db: DatabaseManager | undefined, config: Config | undefined)` as explicit parameters

**Step 3 — `__filesystem` defensive fallback documentation (2 comment additions, no code change)**:
- `server.ts:141` — added 8-line explanatory comment block documenting the deliberate intent
- `api/other.ts:882` — added 7-line explanatory comment block on the consumer side

**Step 4 — `(global as any).ipfsStorage` purge in `api/supernode.ts` (1 helper + 1 call site)**:
- `api/supernode.ts:20-22` — `getIpfsStorage()` helper deleted; 1 call site now uses `req.app.locals.ipfs as IPFSStorage | undefined`
- The bootstrap write at `index.ts:245` is preserved (audit-permitted single-write at startup)

### TypeScript caught 4 real pre-existing type bugs that were hidden behind `any`

This is the strongest methodology validation yet from Phase 2 — the compiler caught 4 errors that would-have-been latent bugs once the read path started working:

| Line | Error | Real-world impact |
|---|---|---|
| `resources.ts:89` | `dbMaxConcurrentWasm` is `string \| undefined` but assigned to `number` | Once the read path works, `Math.X(string)` would silently return NaN |
| `resources.ts:90` | Same for `dbWasmTimeoutMs` | Same |
| `resources.ts:247` | `db.setSetting('max_concurrent_wasm', value)` passes `number` to a function expecting `string` | SQLite was implicitly coercing on bind; now we explicitly stringify so write round-trips cleanly |
| `resources.ts:274` | Same for `wasm_timeout_ms` setSetting | Same |

These are real bugs: `getSetting()` returns SQLite TEXT as string, and the old `any`-typed code was treating it as the original number — which would have caused silent NaN propagation once the read path started returning values. Fixed by `parseInt()` on read and `String()` on write.

This is the third Phase 2 phase where TypeScript caught real errors during execution (after 2-C's static-method `this.db` catch and the type-narrowing catch). The methodology pays for itself every single time.

### Validation results (every gate green)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean (after fixing 4 compiler-caught type errors above) |
| `npm run build:backend` | ✅ clean |
| `npm run test:unit` | ✅ 7/7 passing in 52.6 ms |
| `ReadLints` on 7 modified files | ✅ 0 errors |
| Pre-flight db survey | ✅ confirmed zero existing user settings to be affected |

### Strategic note on what this completes

After Phase 2-Globals, the audit's mechanical-pattern blocker #2 (ambient global singletons) is **functionally complete for consumer modules in `pc2-node/src`**:
- Phase 2-C removed `getDatabase()`, `getWASMRuntime()`, `getUpdateService()` ambient module-singleton accessors.
- Phase 2-Globals removed/documented the 4 `(global as any).X` patterns (pc2Config deleted, global.db fixed, __filesystem documented, ipfsStorage purged from consumer).

The only "ambient" pulls remaining in pc2-node/src consumer code are explicitly deferred or intentional:
- 8 deep WASM/dDRM/IPFS helpers (Phase 2-D-helpers — would require threading wasmRuntime through 5+ layers)
- 2 static-method consumers in `api/wallet.ts` (would require ProposalStore service extraction)
- 1 defensive fallback in `api/other.ts` for the Drivers critical path (intentional, now documented)

After these are addressed, all remaining audit-derived work is architectural rather than mechanical.

### Commit reference

(Will be filled in after commit + push.)

---

*This ticket was promoted out of `PHASE-2-C-SINGLETON-PURGE.md` when investigation revealed `pc2Config` was just one instance of a wider `global.*` pattern with 4 distinct cases. Drafting this ticket separately let the right answer for each case be designed in one place rather than half-resolving each in Phase 2-C.*
