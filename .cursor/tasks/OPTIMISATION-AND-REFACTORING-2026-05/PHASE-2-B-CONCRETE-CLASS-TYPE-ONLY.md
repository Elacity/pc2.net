# Phase 2-B: Concrete-class imports → `import type` (mechanical)

**Task ID**: PHASE-2-B
**Parent**: `OPTIMISATION-AND-REFACTORING-2026-05` / Phase 2 / Cluster 5 / 5.4
**Created**: 2026-05-18
**Status**: **Proposed** — awaiting Sasha sign-off
**Priority**: Medium (second audit-derived Phase 2 ticket — picks up from 2-A)
**Shipping gate**: Cannot **merge to release branch** until Mac launcher 48-72h soak completes per `RELEASE-ENGINEERING-V1280`. Coding on the feature branch is allowed.

> **TL;DR for sign-off**: see [cheat sheet](./PHASE-2-B-CHEAT-SHEET.md) — 2-minute read, full "what changes vs what doesn't" table, my recommendations on the open questions.

---

## Plain-English summary

In Phase 2-A we moved type *labels* (data shape descriptions) into dedicated files. Phase 2-B addresses a related but different blocker: many files in pc2-node **import an entire class** (like `DatabaseManager`) when they only need it **as a type**, never as a runtime value.

Importing a class costs more than importing a type:
- The compiler treats it as a runtime dependency that has to be loaded at startup
- It creates a tight coupling: "this file cares about the concrete `DatabaseManager` class", not "this file cares about the *shape* of a database manager"
- When the time comes to lift this module into a Runtime capsule, the capsule will pull in `DatabaseManager`'s entire transitive dependency tree — much harder to extract cleanly

The fix in TypeScript is one character per import statement. `import { X }` becomes `import type { X }`. The class becomes a type-only reference. The compiler erases it from the JS output. Zero runtime change.

**The in-codebase fix template already exists**: `ContentSeedingService.ts` and `ContentIndexerService.ts` use this exact pattern today. They receive `DatabaseManager`, `IPFSStorage`, etc. instances via constructor injection and import only their types.

**Why this is the right second ticket** (after 2-A):
- Even more mechanical than 2-A (1 character per line, vs creating new files)
- TypeScript is the safety net: compile error if you accidentally use a type-only import as a value
- Quantified scope: ~45 import statements across ~25 files (down to ~38 import statements once we exclude the legitimate value-imports at the 2 bootstrap sites)
- The compiled JS output is identical to before (just like 2-A — `import type` is erased at compile time)
- Improves audit scores on 16+ modules by +1 to +3 each (audit Pattern #1 — the **strongest single blocker pattern**, identified across 6 subtrees)
- Closes the largest single Phase 2 ticket on the books

---

## Scope — the three classes (and what's explicitly NOT in scope)

### IN SCOPE (3 concrete classes, 38 mechanical type-only conversions)

| Class | Total import sites | Sites that legitimately need value-import (keep as-is) | Sites to convert to `import type` |
|---|---|---|---|
| `DatabaseManager` | 28 | 2 (bootstrap: `index.ts:77` (`new` site), `storage/index.ts:7` (re-export)) | **26** |
| `FilesystemManager` | 13 | 2 (`server.ts:8`, `index.ts:77`) | **11** |
| `IPFSStorage` | 5 | 2 (`server.ts:8`, `index.ts:77`) | **3 net (some overlap)** |

Net new `import type` conversions: ~38-40 import statements. Each is a one-character change.

### EXPLICITLY NOT IN SCOPE (deferred to other tickets)

| Out-of-scope item | Why deferred | Goes to |
|---|---|---|
| Replace `getDatabase()` / `getGatewayService()` / `getTerminalService()` etc. singleton calls with constructor DI | Larger refactor: changes call signatures, not just imports. Touches 13+ call sites. Different blast radius. | **Phase 2-C** (global singleton purge) |
| Extract `IFilesystemManager` / `IDatabaseManager` / `IIPFSStorage` interfaces as separate type files | The in-codebase fix template (`ContentSeedingService.ts`) shows that `import type { DatabaseManager }` (using the class itself as its structural type) captures 90% of the audit-score value. Interface extraction is premature optimisation; pull it forward later only if/when Runtime crate translation specifically needs it. | **Phase 2-D** or later, on demand |
| Concrete-class imports of *sibling services* (e.g. `BosonService` imports 7 sibling services, `ChannelBridge` imports 5) | These are orchestrator modules that need a bigger structural rethink, not just an import-type change. Their concrete-class imports often involve lifecycle ordering, not just type usage. | **Phase 2-D** (orchestrator splits) |
| Concrete-class imports of `AIChatService`, `AgentKitExecutor`, `ParticleWalletProvider`, `IdentityService` in B-class API handlers | Same as above — these have lifecycle dependencies that warrant a separate look | **Phase 2-D** (orchestrator splits) |
| Express type coupling (`Request`, `Response`, `NextFunction` types in all api/ handlers) | This is a framework choice, not a refactor. Capsule architecture will eliminate it entirely (capsules don't use Express). | **Runtime convergence**, not pc2-node |
| `actions/checkout` etc. Node 24 bump for CI | Unrelated to product code; CI-only change | **Phase 2 CI-hygiene ticket** (separate, ~10 min, before June 2 cutoff) |
| Orphan `submodules/particle-auth` gitlink causing CI warnings | Unrelated to product code | **Phase 2 CI-hygiene ticket** (same as above) |

---

## Requirements

### Part 1 — `DatabaseManager` (26 conversion sites)

Convert each of the following `import { DatabaseManager, ... } from '...'` statements to `import type { DatabaseManager, ... } from '...'`. If the import already includes other symbols that ARE used as values (e.g. enums), split the line into a runtime import + a type-only import.

**Files to change**:

| File | Current import | After |
|---|---|---|
| `pc2-node/src/api/whoami.ts:8` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/api/middleware.ts:8` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/api/auth.ts:8` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/api/access-control.ts:15` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/api/other.ts:11` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/api/public.ts:15` | `import { DatabaseManager, FileMetadata }` | `import type { DatabaseManager, FileMetadata }` (both already type-only-used) |
| `pc2-node/src/api/scheduler.ts:9` | `import { DatabaseManager }` (from storage/index.js) | `import type { DatabaseManager }` |
| `pc2-node/src/api/versions.ts:9` | `import { DatabaseManager, FilesystemManager }` (from storage/index.js) | `import type { DatabaseManager, FilesystemManager }` |
| `pc2-node/src/api/audit.ts:9` | `import { DatabaseManager }` (from storage/index.js) | `import type { DatabaseManager }` |
| `pc2-node/src/api/telemetry.ts:22` | `import { DatabaseManager }` (from storage/index.js) | `import type { DatabaseManager }` |
| `pc2-node/src/api/index.ts:9` | `import { DatabaseManager, FilesystemManager }` (from storage/index.js) | `import type { DatabaseManager, FilesystemManager }` |
| `pc2-node/src/services/AppInstallService.ts:16` | `import { DatabaseManager, InstalledApp }` | `import type { DatabaseManager, InstalledApp }` |
| `pc2-node/src/services/ContentIntelligenceService.ts:23` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/gateway/ChannelBridge.ts:19` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/gateway/GatewayService.ts:19` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/ai/AIChatService.ts:26` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/ai/memory/EmbeddingProvider.ts:14` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/ai/memory/MemoryConsolidator.ts:18` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/ai/retrieval/ContextRetriever.ts:17` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/services/ai/tools/ToolExecutor.ts:12` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/storage/filesystem.ts:9` | `import { DatabaseManager, FileMetadata }` | `import type { DatabaseManager, FileMetadata }` |
| `pc2-node/src/storage/indexer.ts:7` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/utils/metrics.ts:42` | `import { DatabaseManager }` (from storage/index.js) | `import type { DatabaseManager }` |
| `pc2-node/src/websocket/server.ts:10` | `import { DatabaseManager }` | `import type { DatabaseManager }` |
| `pc2-node/src/websocket/events.ts:8` | `import { DatabaseManager }` | `import type { DatabaseManager }` |

**Files NOT changed** (legitimate value-use):
- `pc2-node/src/index.ts:77` — actually calls `new DatabaseManager(DB_PATH)` at line 178; keeps value-import
- `pc2-node/src/storage/index.ts:7` — re-exports `DatabaseManager` and uses it as value in singleton-getter; out-of-scope (will be addressed in Phase 2-C)

### Part 2 — `FilesystemManager` (11 conversion sites)

Same mechanical conversion for `FilesystemManager`. Files to convert:

| File | Line | Current → After |
|---|---|---|
| `pc2-node/src/api/file.ts` | 9 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/api/info.ts` | 9 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/api/auth.ts` | 13 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/api/filesystem.ts` | 9 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/api/other.ts` | 10 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/api/public.ts` | 16 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/services/ai/AIChatService.ts` | 25 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/services/ai/memory/AgentMemoryManager.ts` | 13 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/services/ai/retrieval/ContextRetriever.ts` | 18 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/services/ai/tools/ToolExecutor.ts` | 11 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/services/gateway/ChannelBridge.ts` | 18 | `import { FilesystemManager }` → `import type` |
| `pc2-node/src/storage/indexer.ts` | 8 | `import { FilesystemManager }` → `import type` |

**Files NOT changed** (legitimate value-use):
- `pc2-node/src/index.ts:77`, `pc2-node/src/server.ts:8` — bootstrap, instantiate `new FilesystemManager(...)`

### Part 3 — `IPFSStorage` (3 conversion sites)

Same conversion for `IPFSStorage`. Files to convert:

| File | Line | Current → After |
|---|---|---|
| `pc2-node/src/api/public.ts` | 17 | `import { IPFSStorage }` → `import type` |
| `pc2-node/src/api/index.ts` | 36 | `import { IPFSStorage }` → `import type` |
| `pc2-node/src/services/AppInstallService.ts` | 17 | `import { IPFSStorage }` → `import type` |
| `pc2-node/src/storage/filesystem.ts` | 8 | `import { IPFSStorage }` → `import type` |

**Files NOT changed** (legitimate value-use):
- `pc2-node/src/index.ts:77`, `pc2-node/src/server.ts:8` — bootstrap, instantiate `new IPFSStorage(...)`
- `pc2-node/src/ipfs-dev.ts:8` — dev tool, may instantiate; verify and leave as-is unless clearly type-only

---

## Acceptance criteria

- [ ] All 38-40 mechanical conversions applied (DatabaseManager × 26, FilesystemManager × 11, IPFSStorage × 3).
- [ ] No file that currently calls `new X()` or `instanceof X` for any of the 3 classes has its import converted.
- [ ] **TypeScript compiles**: `cd pc2-node && npx tsc --noEmit` exits 0.
- [ ] **Backend build succeeds**: `npm run build:backend` succeeds.
- [ ] **Unit tests pass**: `npm run test:unit` green (currently 7/7).
- [ ] **Smoke test matrix green**: macOS, Linux x64, Linux ARM64, Windows x64 + asset integrity (same gates as 2-A).
- [ ] **No runtime behaviour change**: AI chat works identically; storage works identically; gateway works identically; websocket works identically. (These are belt-and-braces verifications — TypeScript already guarantees this for type-only changes.)
- [ ] **Compiled `dist/**/*.js` is structurally identical** to pre-PR for the converted files (the `import type` statements are erased at compile time). Spot-check 3 files (e.g. `dist/api/middleware.js`, `dist/services/ai/AIChatService.js`, `dist/services/gateway/ChannelBridge.js`) to confirm.
- [ ] **PR template filled in** (per `PHASE-2-PLAN.md`):
  - Before/after audit-score delta for the 16+ affected modules
  - Smoke test green link
  - Manual fresh-Mac install verified (or "not affected — type-only change")
  - Append delta to `FOOTPRINT_AND_REFACTOR_BASELINE.md`

---

## Risk analysis

**Risk level**: **Very low** — slightly lower than Phase 2-A because no new files are created, no exports change, and the in-codebase fix template already proves the pattern works.

| Risk | Likelihood | Mitigation |
|---|---|---|
| Accidentally type-convert an import that is used as a value | Low | TypeScript compiler immediately flags it: `'X' cannot be used as a value because it was imported using 'import type'`. Run `tsc --noEmit` before pushing. |
| Misclassify a file as type-only when it's actually using `instanceof X` somewhere deep | Very low | The grep results in this ticket are comprehensive. We grepped for `new <Class>` and `instanceof <Class>` — only 1 value-use site found per class (the bootstrap). |
| A consumer changes meaning subtly due to type-erasure | **Cannot happen** | `import type` produces structurally identical JS. The compiled output is a literal byte-for-byte match for the converted file (modulo line-number metadata in sourcemaps). |
| Smoke test catches something we didn't anticipate | Very low | If any flake, narrow the PR (e.g. drop the IPFSStorage portion) and re-run. |

**Rollback shape**: revert the PR. Single commit, single revert. Zero state involved. ~5 minutes if needed.

---

## PR strategy — sign-off question

Two viable strategies — recommendation in bold:

**Option A: Single PR (~3 hours focused work, ~5 hours wall-clock with smoke + verification)** ← recommended

- One PR, one smoke run, one review surface
- 38-40 mechanical conversions, all caught by `tsc --noEmit`
- Matches the Phase 2-A precedent — keeps the per-PR template simple
- Smaller blast radius than Phase 2-A because each individual change is shorter
- Rollback = single revert

**Option B: Three small PRs (~1-2 days wall-clock total, ~3.5 hours focused work split across them)**

- PR 1: DatabaseManager (~3 hours)
- PR 2: FilesystemManager (~30 min)
- PR 3: IPFSStorage (~15 min)
- Smaller surface per PR; slower wall-clock; more CI minutes
- Useful if you want to demonstrate the per-PR template thrice over before moving to Phase 2-C/2-D (which will be bigger)

I recommend Option A because the changes are mechanically identical and TypeScript validates all of them in one pass. Splitting into 3 PRs is more ceremony than benefit for changes this small. If you want Phase 2-B to feel like 3 separate sign-off-able items, Option B works fine — it's just slower.

---

## Estimated effort

- Source code changes: ~3 hours (40 import lines to convert, file-by-file, run `tsc --noEmit` after each cluster)
- Validation (typecheck + build + unit tests + linter on changed files): ~30 min
- PR description + smoke-test wait: ~30 min
- **Total**: ~4 hours of focused work, ~5 hours wall-clock (Option A); ~6 hours wall-clock (Option B)

---

## Score impact (audit-derived)

Pre-Phase-2-B vs Post-Phase-2-B, for the modules where the concrete-class import was the primary blocker:

| Module | Concrete-class deps removed | Pre-2-B | Post-2-B | Delta |
|---|---|---|---|---|
| `EmbeddingProvider.ts` | DatabaseManager | A 9/10 (with -1) | A 10/10 | +1 |
| `MemoryConsolidator.ts` | DatabaseManager | A- 8/10 (post-2-A) | A 9/10 | +1 |
| `ContextRetriever.ts` | DatabaseManager + FilesystemManager | A- 7/10 | A 9/10 | +2 |
| `metrics.ts` | DatabaseManager | A- 7/10 | A 9/10 | +2 |
| `websocket/events.ts` | DatabaseManager | A- 7/10 | A 8/10 | +1 |
| `AgentMemoryManager.ts` | FilesystemManager | A- 7/10 | A- 8/10 | +1 (still has other blockers) |
| `filesystem.ts` | IPFSStorage + DatabaseManager | B 6/10 | A- 8/10 | +2 (promoted out of B-band) |
| `indexer.ts` | DatabaseManager + FilesystemManager | B 6/10 | A- 8/10 | +2 (promoted out of B-band) |
| `api/middleware.ts` | DatabaseManager | B 6/10 | B 7/10 | +1 (still has Express coupling — that's Runtime-level work) |
| `api/auth.ts`, `api/whoami.ts`, `api/access-control.ts`, `api/other.ts`, `api/public.ts` | DatabaseManager + FilesystemManager + IPFSStorage where applicable | B 5-6/10 | B 6-7/10 | +1 each |
| `AppInstallService.ts` | DatabaseManager + IPFSStorage | B 5/10 | B 6/10 | +1 |
| `ToolExecutor.ts` | DatabaseManager + FilesystemManager | B 5/10 | B 6/10 | +1 (still has socket.io blocker) |
| `ContentIntelligenceService.ts` | DatabaseManager | A- 7/10 | A 8/10 | +1 (still has AIChatService concrete — that's Phase 2-D) |
| `AIChatService.ts` | DatabaseManager + FilesystemManager | B 5/10 | B 6/10 | +1 (still a mega-orchestrator — that's Phase 2-D) |
| `ChannelBridge.ts` | DatabaseManager + FilesystemManager | B- 4/10 | B 5/10 | +1 (still has 3 other concrete-class deps and singleton usage) |
| `GatewayService.ts` | DatabaseManager | B 5/10 | B 6/10 | +1 |
| `storage/filesystem.ts` (the implementation) | DatabaseManager + IPFSStorage | B 6/10 | A- 8/10 | +2 (promoted out of B-band) |
| `storage/indexer.ts` | DatabaseManager + FilesystemManager | B 6/10 | A- 8/10 | +2 (promoted out of B-band) |

**Net**: roughly **+22 to +28 audit score points across ~18 modules**. Several modules move up a class (B → A-) which materially changes the distribution.

**Net distribution change** (across full 165-module pc2-node post-2-A):
- A class: 77 → ~80 (+3 modules promoted from A- to A)
- A- class: 40 → ~43 (+3 from B; -3 from A-)
- B class: 39 → ~33 (-6: filesystem.ts, indexer.ts, storage/filesystem.ts, storage/indexer.ts, ContentIntelligenceService.ts all promoted; ContextRetriever from A-)
- B- class: unchanged
- C class: unchanged

---

## What this leaves for Phase 2-C, 2-D, 2-E

After Phase 2-B ships, the remaining audit blockers are:

| Blocker | Modules still affected | Phase |
|---|---|---|
| `getDatabase()` / `getGatewayService()` etc. singleton calls | 13+ call sites | **Phase 2-C** |
| Concrete-class imports of sibling orchestrators (AIChatService, AgentKitExecutor, ParticleWalletProvider, IdentityService, etc.) | 8-10 modules | **Phase 2-D** |
| Express type coupling at api/ boundary | 40+ files | **Runtime-convergence-only** (capsules don't use Express) |
| BosonService / ConnectivityService / api/index.ts / api/storage.ts mega-orchestrators | 4 files | **Phase 2-D** (orchestrator splits) or redesign |

Phase 2-B is the **biggest single mechanical refactor in the Phase 2 plan**. After 2-B ships, the remaining work shifts from "mechanical conversions" to "actual structural decisions" (singleton purge, orchestrator splits, framework choices). Those are bigger, slower, riskier — but the audit has paved the path for each.

---

## Open questions for Sasha sign-off

1. **PR strategy**: Option A (one PR) or Option B (three small PRs)? My recommendation: **A**.
2. **Mac launcher status**: confirm 48-72h soak passed before merging to release branch. (Coding can start on feature branch any time.)
3. **Reviewer**: Sasha self-review (changes are mechanical and TypeScript-verified)? Recommendation: yes; informational ping to Irzhy.
4. **Timing**: execute on feature branch this week (productive use of Mac launcher window) or wait? Recommendation: execute on feature branch any time after Phase 2-A is signed off / shipped.

---

## Cross-references

- Audit findings that justify it: [`CAPSULE_READINESS_REPORT.md`](./CAPSULE_READINESS_REPORT.md) §5.2 Pattern #1 (the strongest single blocker)
- The in-codebase fix template: `pc2-node/src/services/ContentSeedingService.ts` lines 13-15
- The Phase 2-A precedent (set the per-PR template): [`PHASE-2-A-TYPES-EXTRACTION.md`](./PHASE-2-A-TYPES-EXTRACTION.md)
- Calendar context: [`PHASE-2-PLAN.md`](./PHASE-2-PLAN.md) §5
- Mac launcher gate: [`../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md`](../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md)

## Related CI-hygiene work (separate, parallel)

Two CI-only items surfaced from the Phase 2-A smoke test run (`gh run 26006041952`) that should be tracked as a separate small ticket:

1. **Orphan `submodules/particle-auth` gitlink** — directory tracked at commit `857468694c` but has no entry in `.gitmodules`. Causes `fatal: No url found for submodule` warning + git exit 128 in every CI run. Fix: `git rm submodules/particle-auth` (the real particle-auth lives at `packages/particle-auth` as a workspace). ~30 second fix.

2. **Node 20 deprecation cutoff** — GitHub will force `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` to Node 24 on **June 2, 2026**. Bump to v5 versions before then. ~10 min fix + days of green CI history before the cutoff.

These do not affect product code and are not on the Phase 2-B critical path. Will be folded into a tiny standalone "Phase 2 CI-hygiene" ticket.
