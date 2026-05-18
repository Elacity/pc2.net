# Phase 2-C — Cheat Sheet (2-minute companion)

> Plain-English summary of [`PHASE-2-C-SINGLETON-PURGE.md`](./PHASE-2-C-SINGLETON-PURGE.md). Read this first for sign-off; read the full ticket only if you want the file-by-file detail.

---

## What is Phase 2-C in one sentence

**Stop the route handlers from "reaching into a magic drawer" to grab the database / WASM runtime / update service — make each handler accept its dependencies through the front door (already-used Express `req.app.locals`) or through a service constructor.**

---

## Why does this matter

Today, ~36 places in pc2-node do something like this:

```ts
function handleSomething(req, res) {
  const db = getDatabase();   // ← "magic drawer" — ambient global
  db.query(...);
}
```

This works *now* because there's a single shared SQLite database for the whole process, set up at startup. But:

1. **It's the audit's #2 blocker for ElastOS Runtime convergence.** A capsule in the Runtime is required to accept its dependencies explicitly via a capability token; reaching into ambient globals is fundamentally not allowed.
2. **It hides the dependency.** A reader of `handleSomething()` cannot tell that it needs a database until they read deep into the function body.
3. **It makes testing harder.** To test the handler, you have to mock the global; you cannot just pass a fake database in.

The fix is to thread the dependency explicitly. **And here's the kicker**: the destination pattern (`req.app.locals.db`) is **already used in 200+ places across pc2-node**. We are not introducing a new architecture — we are completing one that already exists. The singleton callers are technical debt that crept in over time.

---

## What changes vs. what doesn't

| Aspect | Changes? | Notes |
|---|---|---|
| **Installer size** | No | Same compiled bundle (a tiny bit smaller — a few hundred bytes — because we delete some `import { getDatabase }` lines and the lazy-init code paths become unused) |
| **Runtime behavior** | No (functional) | Same SQLite database, same WASM runtime, same update service, called the same way. Just accessed through a different reference. |
| **Runtime behavior** | Yes (trace) | The compiled JS for the touched files **will** change. A stack trace might look slightly different. The byte-identical proof from Phase 2-B does NOT apply here — and we don't pretend it does. |
| **User-visible features** | No | Nothing changes in the UI, in the wallet, in the AI chat, in the file management, in anything users touch. |
| **Web3 functionality** | No | Particle Auth, BOSON, wallet, identity — all untouched. |
| **API contracts** | No | Every endpoint accepts the same query/body and returns the same response. |
| **Database schema** | No | Zero migrations touched. |
| **Bootstrap sequence** | Yes (small) | `src/index.ts` gets 3-5 new lines to set `app.locals.db`, `app.locals.wasmRuntime`, `app.locals.updateService`. Mechanical addition; no logic change. |
| **Service class signatures** | Yes (2 classes) | `AgentKitExecutor` and `ContentIndexerService` get a new constructor parameter. Their single instantiation sites are updated accordingly. |
| **CI matrix** | Required | This is the first Phase 2 ticket where the compiled JS changes. Must be green on Mac AS + Linux x64 + Linux ARM64 + Windows x64 before merge. |

---

## What does this look like in code? (one example)

**BEFORE** (`api/wallet.ts:30`):

```ts
import { getDatabase } from '../storage/index.js';

router.get('/balance', (req, res) => {
  const db = getDatabase();                         // ← ambient pull
  const balance = db.getWalletBalance(req.userId);
  res.json({ balance });
});
```

**AFTER**:

```ts
import type { DatabaseManager } from '../storage/database.js';
// (no more value-import of getDatabase)

router.get('/balance', (req, res) => {
  const db = req.app.locals.db as DatabaseManager;  // ← explicit, same pattern as 200+ siblings
  const balance = db.getWalletBalance(req.userId);
  res.json({ balance });
});
```

That's it. Same SQLite connection. Same query. Same response. The only thing that changed is *where the reference came from*. And the destination pattern (`req.app.locals.db`) was already used everywhere — we're just completing the migration.

For service classes (like `AgentKitExecutor`), the pattern is constructor injection:

**BEFORE**:
```ts
class AgentKitExecutor {
  someMethod() {
    const db = getDatabase();  // ← ambient
    return db.query(...);
  }
}

const executor = new AgentKitExecutor();
```

**AFTER**:
```ts
class AgentKitExecutor {
  constructor(private readonly db: DatabaseManager) {}
  
  someMethod() {
    return this.db.query(...);  // ← explicit, type-checked
  }
}

const executor = new AgentKitExecutor(db);  // ← the caller already has db
```

---

## Files involved

- **Modified**: ~14 source files (`api/drafts.ts`, `api/wallet.ts`, `api/wasm.ts`, `api/media.ts`, `api/storage.ts`, `api/update.ts`, `api/index.ts`, `services/ai/tools/AgentKitExecutor.ts`, `services/media/dashPackager.ts`, `services/media/mp4split.ts`, `services/ContentIndexerService.ts`, `services/wasm/WASMRuntime.ts`, `storage/ipfs.ts`, `src/index.ts`)
- **Created**: none
- **Removed**: none

Net diff size: ~80-120 line changes (an `import` line removed/changed + each call site getting a 1-2 line update + bootstrap adding 3-5 lines).

---

## Risk vs Phase 2-B

| Dimension | Phase 2-B (just shipped) | Phase 2-C (this) |
|---|---|---|
| Compiled JS changes? | No — **byte-identical** (SHA-256 verified) | Yes (small) |
| Runtime semantics change? | No | No |
| Compiler safety net? | Yes — caught 1 mistake in 30s | Yes — same |
| Touched files | 29 | ~14 |
| Touched LOC | 40 single-token insertions | ~80-120 surgical changes |
| Mac launcher impact | None | None (still gated by soak) |
| Tests needed | unit suite + ReadLints | unit suite + ReadLints + CI matrix |
| Estimated effort | Done in 1.5 hours | Estimated 6-7 hours |

**Phase 2-C is the first ticket where we accept that compiled JS changes.** The byte-identical proof from 2-B doesn't apply. Instead we rely on:
- TypeScript catching every signature mismatch
- The unit test suite passing
- The full 4-platform CI smoke matrix going green
- The fact that the destination pattern (`req.app.locals.X`) is already in 200+ places — we're completing an established migration, not inventing one

---

## The 4 sign-off questions

(Same structure as 2-B for consistency.)

### 1. PR strategy: single PR or split into 5?

**Recommendation: single PR.**

- Same mechanical pattern repeated 36 times → easier review
- The bootstrap update (`app.locals.X = ...`) is co-dependent with the route updates; splitting them creates a CI-broken intermediate state
- 14 files × ~5-8 line diff per file = ~80-120 LOC of diff — still well within "easy to review in one sitting"
- Single execution log instead of 5 partial ones

If you'd rather have 5 small PRs (one for bootstrap, one per cluster), it's doable but costs ~1 extra hour of overhead. I do not recommend it.

### 2. Mac soak gate confirmation

**Recommendation: yes, hold behind Mac launcher soak.**

Same gate as 2-A and 2-B. Coding proceeds on `feat/t-1-telemetry-and-support` now (productive use of release-week dead time). Merge to release branch only after Mac launcher v1.2.8.0 has soaked for 48-72h with no field reports.

If you say "ship it whenever 2-C is green" instead, I'd push back gently — Phase 2-C is the first ticket where compiled JS changes, so it's the first one that *could* surface a real runtime issue. Best to land it on the same release as 2-A and 2-B once the soak is clean.

### 3. Reviewer

**Recommendation: Sasha self-review.**

Same as 2-A and 2-B. Irzhy is told informationally (so he knows it landed on the integration branch) but is not blocked on the review. The audit doc + ticket execution log give him the context he needs.

### 4. Should we also remove `getGlobalIO()` and `getEventQueue()`?

**Recommendation: no, keep them.**

These are acceptable globals — there is genuinely a single Socket.IO server for the process and a single pre-connection FIFO queue. Treating them like stdout (a process-global resource) is the right model. I'd annotate them with a deprecation comment for the future Runtime conversion, but no code change in this ticket.

If you'd rather purge them for completeness, it adds ~30 min of work and removes ~3 call sites. I do not recommend it because it muddies the "this is a clean refactor" message — and the ambient-IO design is actually correct for the current architecture.

---

## What this leaves for after Phase 2-C

- **Phase 2-D** — extract small interfaces from sibling-orchestrator classes (`AIChatService`, `BosonService`, etc.) so consumers can depend on the interface instead of the concrete class. Same mechanical pattern as 2-B but at the orchestrator boundary.
- **Phase 2-E** — split the 3 C-class mega-orchestrators (`ConnectivityService`, `api/index.ts`, `api/storage.ts`). This is the only Phase 2 step with real architectural decisions; defer until post-Mac-soak when there's headroom.
- **CI-hygiene queue** — orphan submodule cleanup + Node 24 actions bump. Independent of code work.
- **Canvas migration** — `canvas@2.x` → `@napi-rs/canvas`. Post-Mac-soak.

---

## Bottom line

Phase 2-C is the third audit-derived refactor in the Phase 2 program. It is **the first one with non-trivial compiled-JS changes**, so it costs a CI matrix run (already routine since 2-B). The pattern it migrates to is **already in use in 200+ places across pc2-node** — we are completing a migration, not inventing one.

ROI: resolves the audit's #2 blocker (ambient-authority singletons) for the route layer, promoting ~14-18 module score points and unlocking the Runtime-convergence story for those modules.

Risk: low-to-moderate (vs 2-A/2-B's very-low). Mitigated by TypeScript signature checks, unit tests, 4-platform CI matrix, and a clean rollback path (single PR commit revert).

Recommended decision: **agree → execute on feature branch → land alongside 2-A and 2-B once Mac launcher soak confirms v1.2.8.0 stability.**
