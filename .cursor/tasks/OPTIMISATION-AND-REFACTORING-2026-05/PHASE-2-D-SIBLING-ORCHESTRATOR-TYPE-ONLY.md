# Task: Phase 2-D — Sibling-orchestrator type-only imports (mechanical)

**Task ID**: `PHASE-2-D-SIBLING-ORCHESTRATOR-TYPE-ONLY`
**Created**: 2026-05-18
**Status**: **EXECUTED on feature branch** (`feat/t-1-telemetry-and-support`, 2026-05-18 morning) — awaiting CI green + Sasha review for merge-gate sign-off
**Priority**: Low-medium (extends Phase 2-B pattern to sibling-orchestrator classes; small absolute size, high audit-score leverage per line changed)
**Shipping gate**: Cannot **merge to release branch** until Mac launcher 48-72h soak completes per `RELEASE-ENGINEERING-V1280`. Coding on the feature branch is allowed.
**Execution log**: see §"Execution log (2026-05-18 morning)" below.

> **TL;DR for non-technical sign-off**: see [`PHASE-2-D-CHEAT-SHEET.md`](./PHASE-2-D-CHEAT-SHEET.md) (2-minute read). It explains in plain English what changes, what doesn't, and the 3 sign-off questions Sasha needs to answer.

## Description

Phase 2-D applies the **same proven mechanical pattern from Phase 2-B** (concrete-class → type-only imports) to the next batch of widely-imported classes — the sibling-orchestrator services (`AIChatService`, `BosonService`). Where a consumer module imports an orchestrator class **purely for type annotation** (field type, function parameter type, cast target), the import is converted from `import { X }` to `import type { X }`.

**Concrete deliverable**: 6 mechanical `import` → `import type` conversions across 6 files. No behavioral change. Compiled JS must be byte-identical for every file we touch (same validation methodology as Phase 2-B's SHA-256 proof).

This is a **much narrower scope** than the original audit framing ("extract interfaces from sibling orchestrators") because the survey conducted 2026-05-18 found that **most consumer sites already use the orchestrator class as a type annotation, not as a value**. TypeScript's structural typing means `import type { AIChatService }` IS the interface — no nominal `IAIChatService` extraction needed. The audit's blocker is resolved by the keyword change alone.

## Background

### Why this matters for ElastOS Runtime convergence

A capsule in the Runtime must not have a **compile-time dependency** on the implementation of services it doesn't own. Today, six consumer modules `import { AIChatService }` (the implementation), which makes their compiled JS contain a `require('./services/ai/AIChatService.js')` even when they only use the symbol as a type. After Phase 2-D:

- Type-only imports compile out to nothing (TypeScript erases them).
- Consumer modules' compiled JS no longer contains the orchestrator-import statement.
- Each consumer becomes free to swap the orchestrator implementation behind the same structural shape — which is exactly what capsule-aware code needs.

### Why this is small

Phase 2-A extracted shared types. Phase 2-B converted concrete storage-class imports (DatabaseManager, FilesystemManager, IPFSStorage). Phase 2-C purged ambient singletons (getDatabase, getWASMRuntime, getUpdateService). After those three phases:
- 5 of 6 AIChatService imports turn out to be already-type-only-in-spirit (just missing the `type` keyword).
- 1 of 2 non-bootstrap BosonService imports is type-only.
- The 4-5 remaining value-use sites are either bootstrap (acceptable per audit rules) or tightly-coupled internal sibling instantiation (architecturally correct, not a blocker).

So the audit's framing of "Phase 2-D" was front-loaded based on pre-2-C state. After 2-C, the actual remaining sibling-orchestrator surface area is **6 lines of changes**.

## Acceptance criteria

1. The 6 listed import sites in §"Files to modify" use `import type { ... }` instead of `import { ... }`.
2. `tsc --noEmit` passes with zero errors.
3. `npm run build:backend` succeeds.
4. `npm run test:unit` passes (7/7).
5. `ReadLints` reports zero new errors on every modified file.
6. **Empirical proof of zero runtime change**: SHA-256 of the compiled `dist/*.js` for at least 3 spot-checked modified files is byte-identical pre- vs post-conversion (same methodology as Phase 2-B). Compiled files must lose the `require('./services/ai/AIChatService.js')` statement (since the type-only import erases) — this is the *only* runtime-bytecode difference expected, and is the actual audit-resolution evidence.
7. Live dev server smoke: `/api/health`, `/api/ai/chat`, `/api/boson/status` all continue to behave identically (same response shape, same timings).
8. Audit `CAPSULE_READINESS_REPORT.md` §5.7 updated with execution log.

## Implementation plan (file-by-file)

### Convert to `import type` (6 sites)

| # | File | Current import | New import | Verified type-only usage |
|---|---|---|---|---|
| 1 | `pc2-node/src/server.ts:11` | `import { AIChatService } from './services/ai/AIChatService.js';` | `import type { AIChatService } from './services/ai/AIChatService.js';` | `aiService?: AIChatService` in `ServerOptions` interface (line 25) |
| 2 | `pc2-node/src/api/ai.ts:12` | `import { AIChatService } from '../services/ai/AIChatService.js';` | `import type { AIChatService } from '../services/ai/AIChatService.js';` | Used in 3 sites: `req.app.locals.aiService as AIChatService \| undefined` (lines 183, 300, 335) — all casts |
| 3 | `pc2-node/src/api/other.ts:17` | `import { AIChatService } from '../services/ai/AIChatService.js';` | `import type { AIChatService } from '../services/ai/AIChatService.js';` | Used at line 716: `(req.app.locals.aiService as AIChatService \| undefined)` — cast only |
| 4 | `pc2-node/src/services/gateway/ChannelBridge.ts:17` | `import { AIChatService, CompleteRequest } from '../ai/AIChatService.js';` | `import type { AIChatService, CompleteRequest } from '../ai/AIChatService.js';` | `private aiService: AIChatService` field (line 109); ctor param (line 130); function param (line 850); `const request: CompleteRequest = {...}` (line 327). Both symbols are type-only used. |
| 5 | `pc2-node/src/services/ContentIntelligenceService.ts:21` | `import { AIChatService } from './ai/AIChatService.js';` | `import type { AIChatService } from './ai/AIChatService.js';` | `private aiService: AIChatService` field (line 41); ctor param (line 44). |
| 6 | `pc2-node/src/api/boson.ts:8` | `import { BosonService } from '../services/boson/index.js';` | `import type { BosonService } from '../services/boson/index.js';` | `function getBosonService(req: Request): BosonService \| null` return-type annotation only |

### Keep as concrete (value-use; acceptable architectural boundaries)

These import sites are documented as **intentional** value-use because they sit at architectural boundaries where concrete instantiation is correct:

| File | Symbol | Why concrete is correct |
|---|---|---|
| `pc2-node/src/index.ts:82` | `AIChatService` | Bootstrap instantiation: `new AIChatService(...)`. Per audit rules, the bootstrap is permitted to know concrete implementations. |
| `pc2-node/src/index.ts:83` | `BosonService` | Same — bootstrap instantiation. |
| `pc2-node/src/services/boson/BosonService.ts:11` | `IdentityService, IdentityConfig` | Internal sibling: `BosonService` owns `IdentityService` lifecycle; both live in `boson/` subtree and are coupled by design. The `IdentityConfig` co-import is a type and already correct. |
| `pc2-node/src/services/ai/tools/AgentKitExecutor.ts:15` | `ParticleWalletProvider, createParticleWalletProvider` | Internal sibling: `AgentKitExecutor` owns `ParticleWalletProvider` lifecycle; both live under `services/ai/tools/` and `services/wallet/` with established coupling. |
| `pc2-node/src/services/ai/tools/ToolExecutor.ts:19` | `AgentKitExecutor, isAgentKitTool` | Internal sibling: `ToolExecutor` instantiates `AgentKitExecutor` and uses the `isAgentKitTool` helper function (value-use). |
| `pc2-node/src/api/wallet.ts:11` | `pendingProposals, AgentKitExecutor` | Static-method consumption: `AgentKitExecutor.updateProposalStatus(...)` × 4 + `pendingProposals` Map value-use. Already documented in Phase 2-C deferral comment. Resolving this would require a separate "ProposalStore service extraction" ticket — out of scope for 2-D. |

The above 6 "keep concrete" sites are not blockers in the audit's strict reading because they're either at the architectural bootstrap or at tightly-coupled internal-sibling boundaries where the concrete-class dependency is **expressing real architectural intent**, not accidental coupling.

### Optional: `api/setup.ts:19` and `ConnectivityService.ts:18`

These two files import `toBase58` / `fromBase58` / `deriveFromMnemonic` from `IdentityService.js` — these are **standalone exported functions**, not the class itself. They are already pure-function imports and don't carry the "consumer imports orchestrator implementation" pattern. **No change needed.**

## Files to modify (6)

1. `pc2-node/src/server.ts`
2. `pc2-node/src/api/ai.ts`
3. `pc2-node/src/api/other.ts`
4. `pc2-node/src/services/gateway/ChannelBridge.ts`
5. `pc2-node/src/services/ContentIntelligenceService.ts`
6. `pc2-node/src/api/boson.ts`

## Files NOT to modify (documented)

See §"Keep as concrete" above for the 6 sites that stay as `import` (value).

## Testing strategy

Same as Phase 2-B: the compiler is the safety net.

1. **Pre-flight survey** (already done in this ticket): grep for `<ClassName>.` static-member access in all files about to be changed. None found in any of the 6 mechanical sites.
2. **Per-file conversion**: change `import` to `import type` for the class symbol; preserve any value-imports on the same line as separate `import` statements (none required for these 6 sites — every modification is keyword-only).
3. **Type-check after each file**: `tsc --noEmit` — must stay clean.
4. **Build after all files**: `npm run build:backend`.
5. **Diff compiled output**: `sha256sum dist/api/ai.js dist/api/other.js dist/api/boson.js dist/services/ContentIntelligenceService.js dist/services/gateway/ChannelBridge.js` pre- and post-change. The bytes for each file must change in exactly one expected way: the `require('...')` line at the top of the compiled module is removed because `import type` erases. No other byte-difference is acceptable.
6. **Unit tests**: `npm run test:unit` (7/7 expected).
7. **Lint**: `ReadLints` on each modified file (zero new errors).
8. **Live smoke**: dev server hot-reloads through each conversion; `/api/health`, `/api/ai/chat`, `/api/boson/status` continue identical behavior.

## Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TypeScript misses a value-use I didn't survey | Very low | Build fails immediately (caught at `tsc --noEmit`) | Pre-flight survey above, plus compiler error handles it in seconds |
| Compiled JS changes in unexpected ways | Very low | Detected by SHA-256 diff | Same proof methodology as 2-B |
| A consumer relied on the runtime import side-effect | Negligible | Would manifest as runtime failure on first request | Live dev-server smoke catches it; AIChatService and BosonService modules have no module-load side effects |
| Re-imports through barrel files leak the concrete class | None | Audit-relevant but not behavioral | `services/wallet/index.ts` barrel re-exports `ParticleWalletProvider` as both class and `type` — already follows correct dual-export pattern |
| AIChatService is instantiated elsewhere I missed | Very low | Build fails | Survey confirmed only `src/index.ts:82` instantiates it; bootstrap is acceptable |

**Overall risk: ≤ Phase 2-B level** (which was the lowest-risk Phase 2 ticket and shipped without incident). Phase 2-D has fewer files and a smaller blast radius than 2-B.

## Estimated effort

- **Pre-flight survey**: ✅ already done (in this ticket §"Implementation plan").
- **6 mechanical conversions**: 10 min.
- **Validation (tsc + build + tests + lints)**: 15 min.
- **SHA-256 diff proof**: 5 min.
- **Live smoke (3 endpoints)**: 5 min.
- **Execution log + audit doc update**: 15 min.

**Total**: ~50 min single-session. Smaller than 2-B (~2 hours) and 2-C (~3 hours).

## Score impact (post-Phase-2-D)

Audit Pattern #1 (concrete-class imports) is **further resolved** for the sibling-orchestrator boundary. After 2-B (storage classes done) and 2-D (sibling-orchestrator classes done), the audit's concrete-class blocker is functionally complete for consumer modules.

Estimated band shifts:
- `api/ai.ts`: B → A- (was 1 concrete-import penalty)
- `api/other.ts`: B → A-
- `services/gateway/ChannelBridge.ts`: B → A- (had 2 concrete-imports: AIChatService + CompleteRequest, both type-only)
- `services/ContentIntelligenceService.ts`: B → A- (was 1 concrete-import)
- `api/boson.ts`: A- → A
- `server.ts`: A- → A (was already A-class)

Net: ~6 score points across pc2-node. Smaller absolute number than 2-C, but **completes the consumer-import audit pattern** — after 2-D, no audit-flagged concrete-class consumer imports remain in pc2-node/src (modulo the documented bootstrap and internal-sibling exceptions, which the audit explicitly permits).

## What this leaves for subsequent phases

After Phase 2-D completes, the audit's two main mechanical-pattern blockers (concrete-class consumer imports + ambient global singletons) are both substantially resolved for the route + service layer. Remaining audit-derived work:

- **Phase 2-E** — split the 3 C-class mega-orchestrators (`ConnectivityService`, `api/index.ts`, `api/storage.ts`) into smaller modules. Structural decisions; defer until post-Mac-soak.
- **`pc2Config` mutable-global ticket** (promoted out of Phase 2-C) — 4-file pattern with runtime mutation; design needed before execution.
- **AgentKitExecutor ProposalStore extraction** (deferred from 2-D scope) — would resolve the static-method-consumer pattern in `api/wallet.ts`; nice-to-have, not urgent.
- **Phase 2-D deferred WASM helpers** (8 sites) — would thread `wasmRuntime` through 5+ layers of media/dDRM/IPFS helpers; significant effort, modest audit-readiness benefit.

After all of the above, the audit's mechanical patterns are exhausted and any remaining work moves into architectural design (capsule-boundary definition, runtime capability tokens).

## PR strategy

**Recommended**: single PR with all 6 conversions. Same pattern as Phase 2-B (which shipped 40 changes in a single PR). The byte-identical-JS proof per-file makes the PR self-validating.

The "1 PR per Phase 2 item" rule in `PHASE-2-PLAN.md` is interpreted at the Phase-letter granularity here: Phase 2-D is one ticket, one PR.

## Open questions for Sasha (3)

1. **Approve scope shrink?** The original audit framing suggested "extract interfaces" (a structural ~3-hour change). The survey shows the *actual* remaining work is 6 mechanical conversions (~50 min). Should we ship the mechanical version now (this ticket) and revisit nominal-interface extraction only if a future capsule-boundary requirement demands it — or do you want nominal `IAIChatService` / `IBosonService` interfaces extracted regardless?
2. **Bundle with Phase 2-D-deferred WASM helpers?** Phase 2-C left 8 deep-helper sites marked `Phase 2-D (deferred)` for `getWASMRuntime()` ambient calls. Should we (a) keep them as a separate Phase 2-D.2 ticket since they're a different pattern (singleton purge, not import-keyword change), (b) fold them into this ticket since the marker says "Phase 2-D", or (c) defer to a dedicated "deep-helper threading" ticket? Recommendation: (a) — they're architecturally distinct; just relabel them `Phase 2-D-helpers (deferred)` if (a) is chosen.
3. **Execute immediately on feature branch (coding gate open)** or **wait for Mac soak completion**? Same considerations as 2-B and 2-C — coding on the feature branch doesn't ship to users until merged to release. Recommendation: execute now to keep the audit-fix pipeline moving; merge after Mac soak.

## Estimated effort

- **Pre-flight survey**: ✅ already done.
- **Mechanical conversions**: 10 min.
- **Validation + SHA-256 proof**: 20 min.
- **Live smoke**: 5 min.
- **Execution log + audit doc updates**: 15 min.

**Total**: ~50 min single-session.

---

## Execution log (2026-05-18 morning)

### Sign-off decisions captured before execution

User approved both upfront decisions via structured questions (`AskQuestion`):
1. **"Execute 2-D immediately"** — chosen over draft-only / bundle-with-helpers / pause-for-review.
2. **"Approve the scope shrink"** (mechanical 6-line keyword change vs. nominal `IAIChatService` interface extraction) — chosen.

This pre-cleared the 2 main open questions, so execution proceeded directly.

### What landed

All 6 mechanical conversions applied as planned:

| # | File | Conversion |
|---|---|---|
| 1 | `pc2-node/src/server.ts` | `import { AIChatService }` → `import type { AIChatService }` |
| 2 | `pc2-node/src/api/ai.ts` | `import { AIChatService }` → `import type { AIChatService }` |
| 3 | `pc2-node/src/api/other.ts` | `import { AIChatService }` → `import type { AIChatService }` |
| 4 | `pc2-node/src/services/gateway/ChannelBridge.ts` | `import { AIChatService, CompleteRequest }` → `import type { AIChatService, CompleteRequest }` (both symbols are type-only used) |
| 5 | `pc2-node/src/services/ContentIntelligenceService.ts` | `import { AIChatService }` → `import type { AIChatService }` |
| 6 | `pc2-node/src/api/boson.ts` | `import { BosonService }` → `import type { BosonService }` |

Total source diff: 6 lines changed, 6 insertions, 6 deletions.

### Strongest validation outcome possible: BYTE-IDENTICAL compiled JS for all 6 files

This is the result we most hoped for. The pre/post SHA-256 hashes for every modified file are **literally identical**:

| File | SHA-256 (pre = post) |
|---|---|
| `dist/server.js` | `1b795581fcf1385aa7ede5dbd18f361f488786210da7ecce0834f4d72c1836a8` |
| `dist/api/ai.js` | `27a03874a4ecd5359f4565629194370492d6b1fd4c41c48b2212ef41f27e6918` |
| `dist/api/other.js` | `356c60e6e85783c911fc12262152c35c2a5932c9c4eed4055848dd8b01ec47e8` |
| `dist/services/gateway/ChannelBridge.js` | `14b31c57d029fdf7124aa8844c1ffbe0bf47267d660451c1bfe1505e47ed51ba` |
| `dist/services/ContentIntelligenceService.js` | `070f4e6c7c7a673ad80730c3e1f80a38ad4e2678831bb66cea04be6422ff1b2f` |
| `dist/api/boson.js` | `cbc6fdc462244e36f97844c9dbcfde1b427a1f246b440feec57b891e566138bc` |

**Why this is stronger than Phase 2-B's proof**: in 2-B, we only spot-checked 5 files for byte-identical-JS. In 2-D, **every single modified file** is byte-identical pre vs post.

### Why the JS came out fully identical (not just "minus a require line")

The original ticket prediction was that compiled JS would differ by exactly one erased `require('...')` line per file. The actual result is more interesting: **TypeScript was already eliding the unused-as-value imports** — the compiled JS already had no `require` statement for AIChatService or BosonService in any of these 6 consumers, because TypeScript's default emitter (`importsNotUsedAsValues: 'remove'`, the default) detects that the symbol is only used as a type and erases the import.

So at the runtime level, Phase 2-D is a **zero-bytes-changed change**. So why do it?
- **Explicit intent in source**: `import type` declares "I depend on this only as a type" *in the source code*, where reviewers, future audits, and the capsule-readiness analysis can see it. Without the keyword, the type-only nature is implicit and could become incorrect if a future code change adds a value-use without the author noticing.
- **Resilience to future tsconfig changes**: if `verbatimModuleSyntax: true` is ever enabled (a stricter modern flag that the TypeScript team recommends and that's likely in 5.x defaults eventually), only `import type` would erase. Plain `import` would NOT be auto-elided. The conversion future-proofs against that.
- **Audit machine-readability**: the audit's "concrete-class consumer import" pattern is detected by grep'ing for `^import {.*ClassName}` patterns. After 2-D, these 6 sites no longer match — the audit blocker is gone in the source code, not just in the compiled output.

### Validation results (every gate green)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `npm run build:backend` | ✅ clean |
| `npm run test:unit` | ✅ 7/7 passing in 53.8 ms |
| `ReadLints` on 6 modified files | ✅ 0 errors |
| **SHA-256 byte-identical proof for ALL 6 modified `dist/*.js` files** | ✅ literally identical |
| Live dev-server smoke | skipped (dev server died overnight from unrelated cause — IDE close / OS sleep — but byte-identical compiled JS is strictly stronger than any runtime test) |

### Strategic note on what this completes

After 2-D, the audit's two main mechanical-pattern blockers are functionally exhausted for **consumer modules in `pc2-node/src`**:
- Pattern #1 (concrete-class consumer imports): storage classes done by 2-B; sibling-orchestrator classes done by 2-D.
- Pattern #2 (ambient global singletons): route layer done by 2-C; remaining sites all explicitly marked (deep helpers `Phase 2-D-helpers`, static methods `Phase 2-C-statics`, mutable globals `pc2Config-promoted-out`).

The remaining audit-derived work is no longer mechanical — it's architectural (mega-orchestrator splits, mutable-global lifecycle redesign, structural sibling decoupling at the static-method boundary). Those are Phase 2-E and beyond, requiring real design decisions rather than keyword changes.

### Commit reference

(Will be filled in after commit + push.)

---

*This ticket is the natural successor to `PHASE-2-C-SINGLETON-PURGE.md`. The methodology (pre-flight grep for static-member access, compiler as harness, SHA-256 byte-identical JS proof for type-only imports) carries over directly from Phases 2-B and 2-C.*
