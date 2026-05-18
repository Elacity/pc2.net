# Phase 2-D Cheat Sheet (2-minute read)

> Companion to `PHASE-2-D-SIBLING-ORCHESTRATOR-TYPE-ONLY.md`. This is what you need to read to sign off.

## What is it (in one sentence)

Add the word `type` to 6 import statements across 6 files so that consumer modules don't carry a runtime dependency on AIChatService / BosonService just to use them as type annotations.

## What does NOT change

- **Zero UX impact**. Every endpoint behaves identically.
- **Zero API contract change**. No request/response shapes change.
- **Zero config change**. No env vars, no flags.
- **No new code**. We're deleting one keyword worth of "implicit value-import behavior" per file — adding 4 letters (`type `) to 6 lines.
- **No new files**. Just edits to existing imports.

## What does change

For each of the 6 modified files, the compiled JavaScript will lose **exactly one line**: the `require('./services/ai/AIChatService.js')` (or similar) at the top of the file. That `require` exists today only to satisfy a non-existent runtime need — the consumer modules use the symbol only as a TypeScript type, which is erased at compile time. Removing the `require` is the actual audit-resolution we're after.

Everything else in those 6 files compiles identically — same machine code, same execution.

## Why now / why this matters

Same logic as Phase 2-B and 2-C: every `import { ConcreteClass }` in a consumer module is a "compile-time dependency on the implementation" that capsule code in the Runtime can't have. After Phase 2-D, six more files become capsule-ready in their orchestrator dependency declarations. Combined with 2-A, 2-B, 2-C, this completes the mechanical audit-pattern cleanup for consumer modules.

## Comparison to recent phases

| Phase | What it did | Files touched | Risk | Outcome |
|---|---|---|---|---|
| **2-A** | Extracted shared types into `types.ts` modules | ~10 | Very low | ✅ shipped, CI green |
| **2-B** | `import { Storage }` → `import type { Storage }` (DatabaseManager, FilesystemManager, IPFSStorage) | 29 | Very low (byte-identical JS proven) | ✅ shipped, CI green |
| **2-C** | Purged ambient global singletons from route handlers (`getDatabase()`, `getWASMRuntime()`, `getUpdateService()`) | 14 | Low (compiled JS does change; tested via behavior equivalence) | ✅ shipped, CI green |
| **2-D** (this ticket) | `import { Orchestrator }` → `import type { Orchestrator }` (AIChatService, BosonService) | 6 | Very low (byte-identical JS expected, except the erased `require`) | TBD |

Phase 2-D is the **smallest** of the four mechanical Phase 2 tickets and lowest-risk after 2-A. Total scope: 6 lines of source change. Expected execution time: ~50 min including validation.

## Why it's so small (it wasn't supposed to be)

The original audit predicted Phase 2-D would be a 3-hour interface-extraction job (define `IAIChatService`, refactor consumers to depend on the interface, etc.). After Phase 2-C completed and I surveyed the actual import surface, I found that:

- **Most consumer imports are already type-only-in-spirit** — they use `AIChatService` as a field type, function parameter, or cast target, never as a value (no `new AIChatService(...)`, no static method calls).
- **TypeScript's structural typing means `import type { AIChatService }` *is* the interface** — there's no need to extract a nominal `IAIChatService` interface separately. The class declaration itself is the structural contract that consumers depend on.

So the audit's blocker resolves cleanly with a keyword change instead of an architectural refactor. Honest scope shrink, not scope creep.

## Files involved

**Will be modified (6)**:
- `pc2-node/src/server.ts` — `ServerOptions.aiService` type annotation
- `pc2-node/src/api/ai.ts` — 3 cast sites
- `pc2-node/src/api/other.ts` — 1 cast site
- `pc2-node/src/services/gateway/ChannelBridge.ts` — 2 symbols (AIChatService + CompleteRequest), both type-only
- `pc2-node/src/services/ContentIntelligenceService.ts` — field + constructor type
- `pc2-node/src/api/boson.ts` — return-type annotation

**Will NOT be modified (documented in ticket)**:
- `src/index.ts` — bootstrap instantiation is allowed to know concrete classes
- `services/boson/BosonService.ts` — internal sibling instantiation (IdentityService is tightly coupled, lives in same subtree)
- `services/ai/tools/AgentKitExecutor.ts` — internal sibling instantiation (ParticleWalletProvider tightly coupled)
- `services/ai/tools/ToolExecutor.ts` — internal sibling instantiation + function value import
- `api/wallet.ts` — uses `AgentKitExecutor.staticMethod()` and `pendingProposals` Map (value-uses); already documented in Phase 2-C deferral

## Risk in one number

Lines of source code that could possibly behave differently after this PR: **0**.

Lines of compiled JavaScript that change: **6 deleted `require` statements** (one per modified file), exactly matching the audit-resolution intent.

Lines of code that could cause a runtime failure: **0** — TypeScript's `import type` erasure is a well-defined language feature; the failure mode is "compile error", not "wrong runtime behavior".

## The 3 sign-off questions

1. **Approve the scope shrink** from "extract nominal interfaces" (~3 hours) to "6 mechanical keyword changes" (~50 min) — do you want the smaller mechanical version that resolves the same audit blocker, or do you want nominal `IAIChatService` / `IBosonService` interfaces extracted regardless? (Recommendation: ship mechanical now; revisit nominal interfaces only if a future capsule-boundary requirement demands it.)
2. **Bundle with the 2-C-deferred WASM helpers** (8 deep-helper sites marked `Phase 2-D (deferred)` for `getWASMRuntime()`)? They use the `Phase 2-D` label but are a *different pattern* (singleton purge, not import-keyword change). (Recommendation: keep them as a separate `Phase 2-D-helpers` ticket; this ticket is import-keyword-only.)
3. **Execute now on feature branch, ship after Mac soak** — same model as 2-B and 2-C; coding gate is open, shipping gate is closed until Mac launcher is stable. Recommendation: yes.

## Expected outcome of execution

- 6 files modified, ~6 lines source change.
- `tsc --noEmit` clean, `build:backend` clean, `test:unit` 7/7 pass, `ReadLints` zero errors.
- SHA-256 of 3+ spot-checked compiled `dist/*.js` files: each file's compiled JS changes only in losing one `require()` line — every other byte identical.
- Dev server `/api/health`, `/api/ai/chat`, `/api/boson/status` behave identically pre/post.
- CI green on 4-platform matrix in ~10 min.
- 6 consumer modules promoted by ~1 score band each in the audit; mechanical-pattern audit blockers are now functionally exhausted for consumer modules in pc2-node/src.

---

If you say "ok lets do it", I'll execute, validate, commit, push, and post the CI-green confirmation. Same workflow as 2-B, 2-C.
