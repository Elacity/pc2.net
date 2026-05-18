# Phase 2-B cheat sheet — what changes vs what doesn't

**Companion to**: [`PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md`](./PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md)
**Audience**: Sasha (sign-off), Anders / Irzhy / Ahmed (informational)
**Read time**: 2 minutes
**Purpose**: keep this open alongside the ticket while reviewing for sign-off.

---

## 30-second version

Many files in pc2-node currently import an **entire class** (like `DatabaseManager`) when they only need it **as a type**. We're going to add the word `type` to those import statements. That tells TypeScript "I don't need the actual class, just its shape". The compiled JavaScript is **byte-for-byte identical**. Nothing about how pc2-node runs changes. 16-18 modules get cleaner audit scores. The largest single Phase 2 mechanical refactor.

**Why second** (after 2-A): even simpler than 2-A. No new files. No moved code. Just one word added to ~38 import statements. TypeScript catches any mistake instantly.

---

## What changes — and what doesn't

| Aspect | Changes? | Notes |
|---|---|---|
| **Installer size on disk** | ❌ No change | `import type` is erased at compile time, same as the types themselves |
| **Compiled JavaScript output** | ❌ **Byte-identical** for the touched files | Empirically verifiable by `diff dist/...js` before/after |
| **Memory / CPU at runtime** | ❌ No change | No new code paths |
| **AI chat behaviour** | ❌ No change | Same models, prompts, responses |
| **dDRM behaviour** | ❌ No change | Not touched at all |
| **Database / schema / queries** | ❌ No change | Same SQL, same migrations, same DatabaseManager class |
| **Gateway / websocket / boson** | ❌ No change | Same wire protocols, same behaviour |
| **API endpoints / payloads** | ❌ No change | Same URLs, same JSON |
| **What end users see** | ❌ Nothing different | They wouldn't notice |
| **What operators see** | ❌ Nothing different | Heartbeat, logs unchanged |
| **Launcher behaviour** | ❌ No change | Not touched |
| **Supernode dDRM surface** | ❌ No change | Hard constraint from v1.2.8.0 plan |
| **Source code organisation** | ✅ Cleaner import boundaries | Modules express dependencies as "this is the shape I need" not "this is the class I'm tied to" |
| **Audit scores on 16-18 modules** | ✅ +22 to +28 points total | Several modules promote B → A- |
| **TypeScript compiler boundaries** | ✅ Tighter | Compiler can now verify type-only consumers don't leak runtime dependencies |
| **Future Phase 2-C / 2-D work** | ✅ Becomes easier | Singleton purge and orchestrator splits can assume type-only deps |

---

## Files involved

**Files modified** (~25 files, single-line edits):
- 12 api/ handlers (whoami, middleware, auth, access-control, other, public, scheduler, versions, audit, telemetry, file, info, filesystem, index)
- 6 services/ai modules (AIChatService, EmbeddingProvider, MemoryConsolidator, ContextRetriever, ToolExecutor, AgentMemoryManager)
- 2 services/gateway modules (ChannelBridge, GatewayService)
- 2 other services (AppInstallService, ContentIntelligenceService)
- 2 storage modules (filesystem.ts, indexer.ts)
- 1 utils module (metrics.ts)
- 2 websocket modules (server.ts, events.ts)

**Files NOT touched** (bootstrap / legitimate value-imports — only 3 files):
- `pc2-node/src/index.ts` (calls `new DatabaseManager`, `new FilesystemManager`, `new IPFSStorage` — these MUST stay value-imports)
- `pc2-node/src/server.ts` (similar)
- `pc2-node/src/storage/index.ts` (re-exports DatabaseManager and uses it in singleton-getter — out-of-scope; will be addressed in Phase 2-C)

**Files NOT touched** (out of scope per ticket):
- Anything in `services/boson/` (Boson, Chipotle Relayer surface)
- Anything in supernode-related paths
- Anything in `launcher/` or heartbeat
- Anything Irzhy is working on in his branch
- `getDatabase()` / `getGatewayService()` etc. singleton call sites (Phase 2-C)
- Sibling-orchestrator concrete-class imports (Phase 2-D)
- Express `Request/Response/NextFunction` types (Runtime work)

---

## The exact change, in one picture

**Before** (today):

```typescript
// pc2-node/src/api/middleware.ts
import { DatabaseManager } from '../storage/database.js';
//     ↑
//   imports the actual class — drags in DatabaseManager's
//   entire transitive dependency tree at compile time

export function authMiddleware(db: DatabaseManager) {
  // ... only uses db as a TYPE, never calls `new DatabaseManager()`
}
```

**After** (Phase 2-B):

```typescript
// pc2-node/src/api/middleware.ts
import type { DatabaseManager } from '../storage/database.js';
//      ↑
//   imports only the SHAPE — erased at compile time,
//   leaves zero runtime trace

export function authMiddleware(db: DatabaseManager) {
  // ... unchanged
}
```

Same pattern applied to `FilesystemManager`, `IPFSStorage` consumers.

---

## Empirical proof of zero runtime change (post-Phase-2-A precedent)

Phase 2-A already proved that `import type` erases completely. The compiled `dist/services/ai/providers/types.js` and `dist/storage/types.js` are just header comments + `export {};`. For Phase 2-B, the compiled output of every modified file will be **byte-for-byte identical** to before (modulo line-number metadata in sourcemaps). We'll spot-check 3 files to confirm.

---

## Risk reality check

| Failure mode | Probability | Caught by | User impact |
|---|---|---|---|
| Accidentally type-convert an import that's used as a value | Low | TypeScript compiler: error message "X cannot be used as a value because it was imported using 'import type'" — instant feedback | None — never ships |
| Missed a file in our grep | Very low | The grep results are comprehensive (28 + 13 + 5 = 46 total import sites enumerated) | None — never ships |
| Subtle behaviour change | **Cannot happen** | Compiled JS is byte-identical | None |
| Smoke test red on one OS | Very low | CI gates merge | None — merge blocked until green |
| User-visible bug on a real Mac | **Cannot happen** | Manual fresh-install verification before merge | None |

**Rollback**: single PR, single revert commit. No state involved. ~5 minutes if needed.

---

## Sign-off questions — with my recommendations

The ticket has 4 open questions. Quick recommendations:

| Question | My recommendation | Why |
|---|---|---|
| **One PR or three?** | One | TypeScript validates all 38 changes in a single compile. Splitting into 3 is more ceremony than benefit. |
| **Mac launcher soak gate** | Confirm 48-72h passed before merge | Hard constraint; non-negotiable for release branch. Coding on feature branch is allowed any time. |
| **Reviewer** | Sasha self-review; flag Irzhy informational | Mechanical, TypeScript-verified. No second-set-of-eyes needed. |
| **Timing — execute on feature branch now?** | Yes — start any time after 2-A is signed off | Productive use of release week. Same shipping-gate-vs-coding-gate logic as 2-A. |

If you agree with all four, the ticket flips from **Proposed** → **Agreed**.

---

## When this would actually execute

Same gate as 2-A — once Mac launcher 48-72h soak passes:

```
Today (May 18) ──── Phase 2-B ticket drafted, signed off (in flight)
This week ────────── Mac launcher prep + release (Sasha)
Wed-Thu May 20-21 ─ Mac launcher tags + soak begins
Fri-Sat May 22-23 ─ Soak passes → Phase 2-A merged to release branch
Mon-Tue May 25-26 ─ Phase 2-B PR opened on feature branch (or executed earlier on feature branch if user wants)
Wed-Thu May 27-28 ─ Phase 2-B merged after smoke + manual verification
Fri May 29 ──────── Re-baseline, prepare Phase 2-C ticket
```

If Mac launcher soak finds an issue, Phase 2-B waits. Hard constraint always wins.

---

## What Phase 2-B is *not*

To be crystal clear, this ticket is **not**:
- New AI features (Phase 2-D might touch AIChatService structurally; this just adds `type` to its imports)
- New monetisation features
- New dDRM logic
- Removing the `DatabaseManager` class (it stays — we're just importing its shape, not its bytes)
- Replacing `getDatabase()` singleton calls (Phase 2-C)
- Splitting up AIChatService or other big orchestrators (Phase 2-D)
- A footprint reduction in user-visible bytes (Cluster 3 does that)
- The Runtime migration itself (years out; Anders' team)

It's **the most mechanical refactor in the Phase 2 plan**. It demonstrates the audit's #1 cross-cutting pattern fix on the largest number of modules in a single coordinated change. It is the proving-ground for "audit pattern → automated mechanical fix" as a development pattern.

---

## Cross-references

- Full ticket: [`PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md`](./PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md)
- Phase 2-A precedent: [`PHASE-2-A-TYPES-EXTRACTION.md`](./PHASE-2-A-TYPES-EXTRACTION.md) (already executed; CI-verified; awaiting Mac soak)
- The in-codebase fix template: `pc2-node/src/services/ContentSeedingService.ts` lines 13-15 (and `ContentIndexerService.ts` lines 17-18)
- Audit findings that justify it: [`CAPSULE_READINESS_REPORT.md`](./CAPSULE_READINESS_REPORT.md) §5.2 Pattern #1
- Calendar context: [`PHASE-2-PLAN.md`](./PHASE-2-PLAN.md) §5
- Mac launcher gate: [`../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md`](../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md)

## Footnote — CI hygiene noise we noticed

The Phase 2-A smoke run surfaced 14 warnings + 1 notice in GitHub Actions annotations:
- 4× Homebrew "already installed" — **by design**, ignore
- 1× `windows-latest` redirect to `windows-2025-vs2026` by June 15 — **auto-handled by GitHub**, ignore
- 5× `git submodule foreach` exit 128 — caused by orphan `submodules/particle-auth` gitlink (no `.gitmodules` entry); ~30 second fix
- 5× Node 20 deprecation warnings — `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` will be forced to Node 24 on June 2; ~10 min fix to bump to v5

Both fixable items will be addressed in a separate small "Phase 2 CI-hygiene" ticket — not on the Phase 2-B critical path, but worth doing before June.
