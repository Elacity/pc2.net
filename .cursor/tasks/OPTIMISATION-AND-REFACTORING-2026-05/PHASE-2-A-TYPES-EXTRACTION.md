# Phase 2-A: Types extraction (`providers/types.ts` + `storage/types.ts`)

**Task ID**: PHASE-2-A
**Parent**: `OPTIMISATION-AND-REFACTORING-2026-05` / Phase 2 / Cluster 5 / 5.4
**Created**: 2026-05-16
**Status**: **Agreed** (signed off by Sasha 2026-05-17 ~00:25 UTC+1) — **IN PROGRESS** on feature branch
**Priority**: High (smallest, lowest-risk audit-derived ticket — first one to ship after Mac launcher soak)
**Shipping gate**: Cannot **merge to release branch** until Mac launcher 48-72h soak completes per `RELEASE-ENGINEERING-V1280`. Coding on the feature branch is allowed.

---

> **TL;DR for sign-off**: see the [cheat sheet](./PHASE-2-A-CHEAT-SHEET.md) — 2-minute read, full "what changes vs what doesn't" table, my recommendations on the 4 open questions.

## Plain-English summary

Right now, several files in pc2-node depend on **type definitions that live inside an unrelated implementation file**. Specifically:

1. **`OllamaProvider.ts`** owns 4 types (`ChatModel`, `ChatMessage`, `CompleteArguments`, `ChatCompletion`) that are used by **4 sibling AI providers** (Claude, Gemini, XAI, OpenAI) **and 1 memory module** (MemoryConsolidator). Every one of those 5 files has to import from `OllamaProvider.js` just to get the type — even though those files have nothing to do with Ollama specifically.

2. **`storage/database.ts`** owns several types (`FileMetadata`, `ContentCatalogItem`, `InstalledApp`, plus 6 more) that are imported by **13 other files** across api/, services/, websocket/. Every one of those files pulls in the entire `database.ts` module (with its concrete `DatabaseManager` class) just to read a few type definitions.

This is the **types-co-located-with-implementation** anti-pattern that the capsule audit identified as a high-ROI fix (Pattern #2 in `CAPSULE_READINESS_REPORT.md §5.2`).

The fix is to **move the type definitions into dedicated `types.ts` files**. Implementation files re-import their own types from `types.ts` (zero change for them). Consumers import only types, not implementations.

**Why this is the right first ticket**:
- Pure type-only refactor — zero runtime behaviour changes
- Touches 18 files in total but each edit is mechanical and one-line
- Improves audit scores on 9-10 modules by +1 each
- Validates the Phase 2 refactor process (PR template, smoke-test green, fresh-Mac install verified) on a low-risk change
- Shippable in a single PR

---

## Background — what the audit found

From `CAPSULE_READINESS_REPORT.md`:

> *Pattern #2: Types co-located with implementation, imported by siblings — `providers/` (OllamaProvider exports types to 4 siblings), `storage/` (database.ts owns 9 types used everywhere) — **2 subtrees confirmed**, applies to ~10-15 modules. Fix: extract `<subtree>/types.ts` files. **High-ROI: ~3 hours total fixes ~10-15 module scores by +1 each.***

Confirmed import sites (full grep results in this doc's Appendix A):
- 5 sites importing types from `OllamaProvider.js`
- 13 sites importing from `storage/database.js`, of which 4 import only types (`FileMetadata` / `ContentCatalogItem` / `InstalledApp`) and 9 import the `DatabaseManager` class (those 9 are out of scope for this ticket — they need the class refactor in Phase 2-B).

---

## Requirements

### Part 1 — `pc2-node/src/services/ai/providers/types.ts`

1. Create new file `pc2-node/src/services/ai/providers/types.ts` containing:
   - `ChatModel` interface (currently lines ~10-21 of `OllamaProvider.ts`)
   - `ChatMessage` interface (currently lines ~22-26)
   - `CompleteArguments` interface (currently lines ~27-35)
   - `PerformanceMetrics` interface (currently lines ~36-42)
   - `ChatCompletion` interface (currently lines ~43-63)
2. Remove those interface definitions from `OllamaProvider.ts`.
3. Add `import type { ChatModel, ChatMessage, CompleteArguments, PerformanceMetrics, ChatCompletion } from './types.js';` at the top of `OllamaProvider.ts`.
4. Update the 4 sibling providers + MemoryConsolidator to import types from `./types.js` (or `'../providers/types.js'` for MemoryConsolidator) instead of from `OllamaProvider.js`. Use `import type { ... }` syntax (not `import { ... }`) since these are type-only imports.

**Files modified** (5):
- `pc2-node/src/services/ai/providers/OllamaProvider.ts` (remove type definitions, add import)
- `pc2-node/src/services/ai/providers/ClaudeProvider.ts` (change import path)
- `pc2-node/src/services/ai/providers/GeminiProvider.ts` (change import path)
- `pc2-node/src/services/ai/providers/XAIProvider.ts` (change import path)
- `pc2-node/src/services/ai/providers/OpenAIProvider.ts` (change import path)
- `pc2-node/src/services/ai/memory/MemoryConsolidator.ts` (change import path)

**Files created** (1):
- `pc2-node/src/services/ai/providers/types.ts`

### Part 2 — `pc2-node/src/storage/types.ts`

1. Create new file `pc2-node/src/storage/types.ts` containing all 9 type exports currently in `database.ts`:
   - `Database`, `User`, `Session`, `FileMetadata`, `Setting`, `FileVersion`, `AIConfig`, `AIConversation`, `ContentCatalogItem`, `InstalledApp`
2. Remove those type definitions from `database.ts`.
3. Add `import type { ... } from './types.js';` at the top of `database.ts`.
4. Also re-export types from `database.ts` (so existing imports keep working): `export type { FileMetadata, InstalledApp, ContentCatalogItem, ... } from './types.js';`
5. (Optional, defer to Phase 2-B): change the 4 type-only consumer files to import from `storage/types.js` directly. Not strictly required — the re-export from `database.ts` means existing imports still work.

**Files modified** (1):
- `pc2-node/src/storage/database.ts` (remove type definitions, add import + re-export)

**Files created** (1):
- `pc2-node/src/storage/types.ts`

**Optional follow-on** (deferred to 2-B for the 4 type-only-consumer files):
- `pc2-node/src/api/public.ts`, `pc2-node/src/api/filesystem.ts`, `pc2-node/src/services/AppInstallService.ts`, `pc2-node/src/services/ContentIndexerService.ts` could each switch their imports to `from '../storage/types.js'` instead of `from '../storage/database.js'` — gains +1 score for each. But this is a follow-on optimisation; the main ticket is complete without it.

---

## Acceptance criteria

- [ ] `pc2-node/src/services/ai/providers/types.ts` exists with the 5 interfaces.
- [ ] `pc2-node/src/storage/types.ts` exists with the 9 type exports.
- [ ] `OllamaProvider.ts` no longer defines those 5 interfaces inline.
- [ ] `database.ts` no longer defines those 9 type exports inline; it re-exports them from `types.ts`.
- [ ] All 5 import sites in `services/ai/providers/` + `services/ai/memory/` use `import type { ... } from './types.js'` syntax.
- [ ] **TypeScript compiles**: `npm --prefix pc2-node run typecheck` passes.
- [ ] **Unit tests pass**: `npm --prefix pc2-node test` green.
- [ ] **Smoke test matrix green**: macOS, Linux x64, Linux ARM64, Windows x64 (per `RELEASE-ENGINEERING-V1280` matrix).
- [ ] **No runtime behaviour change**: AI chat works identically; database queries work identically (these refactor types only).
- [ ] **PR template filled in** (per `PHASE-2-PLAN.md` per-PR template):
  - Before/after audit-score delta (recompute affected module scores after the change)
  - Smoke test run URL
  - Manual fresh-Mac install verified (or "not affected — type-only change")
  - Append delta to `FOOTPRINT_AND_REFACTOR_BASELINE.md`

---

## Risk analysis

**Risk level**: **Very low**. Type-only refactor, zero runtime semantics change.

| Risk | Likelihood | Mitigation |
|---|---|---|
| TypeScript compilation breaks (import path typo) | Medium | `tsc --noEmit` will catch immediately. Run before pushing. |
| Some consumer file imports from a path we don't expect | Low | Grep results in Appendix A enumerate every import site. |
| Re-export pattern in `database.ts` causes circular import | Very low | Types files have no imports (just type defs); cannot create a cycle. |
| Smoke test catches something subtle | Low | If any flake, retry; if persistent, narrow PR to one of the two parts. |

**Rollback shape**: revert the PR. Single commit, single revert. Zero state involved.

---

## Estimated effort

- Part 1 (providers/types.ts): ~1 hour (read OllamaProvider, copy 5 interfaces, update 5 import sites)
- Part 2 (storage/types.ts): ~2 hours (more types, more re-exports needed for backward compat; verify all 13 consumer files still compile)
- Testing + PR: ~30 minutes
- **Total**: ~3.5 hours of focused work

---

## Score impact (audit-derived)

Before → After:

| Module | Before | After | Delta |
|---|---|---|---|
| OllamaProvider.ts | A 8/10 | A 10/10 | +2 (no longer owns sibling types) |
| ClaudeProvider.ts | A 9/10 | A 10/10 | +1 |
| GeminiProvider.ts | A 9/10 | A 10/10 | +1 |
| XAIProvider.ts | A 9/10 | A 10/10 | +1 |
| OpenAIProvider.ts | A 9/10 | A 10/10 | +1 |
| MemoryConsolidator.ts | A- 7/10 | A- 8/10 | +1 |
| database.ts | A- 7/10 | A 8/10 | +1 (still has DatabaseManager class; that's Phase 2-B) |

**Net**: +8 score points across 7 modules. 6 modules become perfect-10. Audit data updated post-ship.

---

## How this connects to the bigger picture

This ticket is the **proving ground** for the entire Phase 2 process. Once it ships green and we've validated the PR template, smoke-test matrix, and the audit-data-update step, the next tickets (Phase 2-B, 2-C, 2-D) can execute against the same template at higher confidence.

It also unlocks **two of the Runtime crate candidates** identified in `AUDIT_EXECUTIVE_SUMMARY.md`:
- The `ai-providers` Rust crate now has clean type contracts to inherit from
- The `storage-migrations` crate has its types isolated from the `DatabaseManager` class

Anders' team can begin scaffolding those crates against the new `types.ts` files in parallel with our Phase 2-B work.

---

## Open questions for User sign-off

1. **Do you want this to ship as one PR (both parts together) or two PRs (split for safety)?** Recommendation: one PR. The two parts are independent type-only changes; rolling back either is trivial. One PR keeps the review surface tight.
2. **Do you want the optional follow-on** (switching the 4 type-only consumer files in `api/` + `services/` to import from `storage/types.js`) **in scope, or deferred to Phase 2-B**? Recommendation: defer to 2-B; it overlaps with the concrete-class refactor work anyway.
3. **Mac launcher status**: confirm Mac launcher has reached 48-72h soak before we start. (No earlier.)
4. **Reviewer**: Sasha self-review, or pair with Irzhy when he's back from his branch work? Recommendation: Sasha self-review for type-only changes; flag to Irzhy as informational.

---

## Appendix A — Confirmed import sites (grep output)

### `OllamaProvider.ts` exports — currently 5 types defined inline (lines 10-63):
```
export interface ChatModel {        line 10
export interface ChatMessage {      line 22
export interface CompleteArguments  line 27
export interface PerformanceMetrics line 36
export interface ChatCompletion {   line 43
```

### Files importing types from `providers/OllamaProvider.js`:
```
pc2-node/src/services/ai/providers/GeminiProvider.ts:9
pc2-node/src/services/ai/providers/XAIProvider.ts:9
pc2-node/src/services/ai/providers/ClaudeProvider.ts:9
pc2-node/src/services/ai/providers/OpenAIProvider.ts:9
pc2-node/src/services/ai/memory/MemoryConsolidator.ts:19  (ChatMessage only)
```

### Files importing types from `storage/database.js`:
```
pc2-node/src/api/public.ts:15            (DatabaseManager + FileMetadata)
pc2-node/src/api/other.ts:11             (DatabaseManager)
pc2-node/src/services/ContentIntelligenceService.ts:23  (DatabaseManager)
pc2-node/src/websocket/events.ts:8       (DatabaseManager)
pc2-node/src/services/AppInstallService.ts:16  (DatabaseManager + InstalledApp)
pc2-node/src/api/access-control.ts:15    (DatabaseManager)
pc2-node/src/api/filesystem.ts:13        (FileMetadata only — type-only candidate)
pc2-node/src/services/ContentIndexerService.ts:17  (type-only already; uses import type)
pc2-node/src/websocket/server.ts:10      (DatabaseManager)
pc2-node/src/services/ContentSeedingService.ts:14  (type-only already; uses import type)
pc2-node/src/api/auth.ts:8               (DatabaseManager)
pc2-node/src/api/middleware.ts:8         (DatabaseManager)
pc2-node/src/api/whoami.ts:8             (DatabaseManager)
```

Of the 13 storage/database consumers: 4 import types only (good Phase 2-A candidates); 9 import the `DatabaseManager` class (out of scope; will be addressed in Phase 2-B's concrete-class → interface refactor).

---

## Why this is "Proposed" not "Agreed"

Per `taskmanagement.mdc`, code work cannot start until Sasha signs the task off as Agreed. Sign-off needed on the four open questions above. Once signed, the ticket flips to Agreed and waits in the queue until the Mac launcher soak completes.
