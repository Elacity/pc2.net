# Phase 2-Globals Cheat Sheet (2-minute read)

> Companion to `PHASE-2-GLOBALS-CLEANUP.md`. This is what you need to read to sign off.

## What is it (in one sentence)

Clean up the 4 ambient `(global as any).X` patterns in pc2-node — replace them with the established `req.app.locals.X` pattern (where audit-correct) and document the one exception that should stay (a defensive fallback in a critical code path). **Side benefit**: this fixes one real latent bug.

## The bug we accidentally found

While investigating `(global as any).pc2Config`, the survey discovered that **`(global as any).db` is never set anywhere in the codebase**. Two route files (`api/resources.ts` and `api/supernode.ts`) have a `getDb()` helper that returns this never-set global. The helper always returns `undefined`. Every `db?.getSetting('storage_limit')` (and similar for max_concurrent_wasm / max_memory_mb / wasm_timeout_ms) silently falls back to config.json defaults.

In plain English: **users who set their storage limit via the API see the write succeed, but the new value is ignored on every subsequent read.** The "Database settings override config file" comment in the code is currently false.

Phase 2-Globals fixes this as a side effect of the cleanup.

## What does NOT change

- **Zero UI/UX change for the 99% case** — users who never touched their resource settings see exactly the same behavior as before (defaults applied).
- **No API contract change**. All endpoints return the same shape.
- **No config change**. No env vars, no flags.

## What DOES change

1. **For users who set resource limits via the API**: their settings start being honored (bug fix). This includes `storage_limit`, `max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`.
2. **One less attack surface**: removing `pc2Config` mutable global also removes a mutable-shared-state risk pattern that capsule-aware code in the Runtime cannot have.
3. **Cleaner codebase for the next audit**: every `(global as any).X` pattern in pc2-node is either deleted or has a comment explaining why it's intentional.

## The 4 globals at a glance

| # | Global | What we do | Why |
|---|---|---|---|
| 1 | `pc2Config` | **Delete entirely**. Readers go to db (the real source of truth) directly. | Vestigial cache; only 1 of 4 mutable settings was ever cached; redundant with `db.setSetting()` |
| 2 | `global.db` | **Delete the broken `getDb()` helpers**. Replace with `req.app.locals.db` lookups. | Latent bug — was never set; fixes db-persisted setting reads |
| 3 | `__filesystem` | **Keep as-is + add explanatory comment**. | Deliberate defensive fallback for the Drivers tool-execution critical path. Intentional, not ambient authority. |
| 4 | `ipfsStorage` | **Delete the helper**, replace reads with `req.app.locals.ipfs`. Keep the bootstrap single-write at startup. | Same pattern as 2-C — single-write at bootstrap is audit-permitted; the consumer helpers should use Express context. |

## Files involved

**Will be modified (5 files)**:
- `pc2-node/src/api/storage.ts` — delete pc2Config write block
- `pc2-node/src/api/resources.ts` — delete `getDb()` + `getConfig()` helpers; thread `db` parameter; replace 4 call sites
- `pc2-node/src/api/info.ts` — drop pc2Config fallback (1 line)
- `pc2-node/src/services/wasm/WASMRuntime.ts` — drop pc2Config read (1 line; behavior unchanged because compute settings never wrote to pc2Config anyway)
- `pc2-node/src/api/supernode.ts` — delete `getDb()` + `getIpfs()` helpers; replace 4 call sites

**Comment-only additions (2 files)**:
- `pc2-node/src/server.ts:141` — explain `__filesystem` defensive fallback intent
- `pc2-node/src/api/other.ts:882` — same

## Risk profile

| Concern | Phase 2-C | Phase 2-D | Phase 2-Globals (this ticket) |
|---|---|---|---|
| Compiled JS change | Yes (route handlers now `req.app.locals.X`) | None (byte-identical) | Yes (route handlers + WASMRuntime literal change) |
| Behavior change | None (verified `version: "1.2.7.14"` round-trip) | None (byte-identical) | **Yes — deliberate**: db-persisted settings start being honored |
| New code introduced | Constructor injection at 1 class | None (keyword change only) | Helper deletion + parameter threading in 1 function |
| User-visible effect | None | None | **One bug fix** — for users who used the API to set limits, their settings now work |

This is the first Phase 2 ticket where the source-code change has **deliberate user-visible behavioral implications**. Per ticket §"Behavioral change (deliberate)", this is a **fix**, not a regression — but it warrants careful release-notes communication.

## The 4 sign-off questions

1. **Approve the deliberate `global.db` bug fix?** Recommendation: yes — db-persisted settings being silently ignored is incorrect behavior; fixing it is a correctness improvement. Document in release notes as "Bug fix: resource limit settings (storage_limit, max_concurrent_wasm, max_memory_mb, wasm_timeout_ms) now correctly applied".
2. **Defer the WASMRuntime config-injection refactor** (would make compute settings injectable from db at startup, opening path to runtime-mutable compute limits) — defer to a follow-up ticket, or fold in here? Recommendation: defer — this ticket is already ~3 hours.
3. **Bundle all 4 globals into one PR** or split into 4 PRs? Recommendation: bundle (matches Phase 2-C precedent of one PR per Phase letter).
4. **Execute now on feature branch, ship after Mac soak** — same model as 2-B/2-C/2-D? Recommendation: yes, but include a pre-merge step to check existing user dbs for non-default resource settings (so we know what behavioral changes a real user might see).

## Expected outcome of execution

- 5 files modified (source), 2 files comment-only updates, ~12 sites total changed.
- `tsc --noEmit` clean, `build:backend` clean, `test:unit` 7/7, ReadLints zero errors.
- Compiled JS changes per file (NOT byte-identical, unlike 2-D) — the changes are real behavioral fixes.
- Dev server `/api/health`, `/api/info`, `/api/storage/usage`, `/api/resources` all return correct values.
- **New round-trip test**: POST `/api/storage/limit` with a non-default value → GET `/api/info` → response reflects the user's setting (this currently fails; should pass after).
- CI green on 4-platform matrix in ~10 min.
- Audit's ambient-global Pattern #2 work is now functionally complete.

---

If you say "ok lets do it", I'll execute, validate, commit, push, and post the CI-green confirmation. Same workflow as 2-B, 2-C, 2-D — plus an additional pre-execution step to grep the production user-db schema for any non-default resource settings (to know what behavioral fixes a real user would see).
