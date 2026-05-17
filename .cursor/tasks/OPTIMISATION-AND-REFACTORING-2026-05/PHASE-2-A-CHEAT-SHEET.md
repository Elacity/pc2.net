# Phase 2-A cheat sheet — what changes vs what doesn't

**Companion to**: [`PHASE-2-A-TYPES-EXTRACTION.md`](./PHASE-2-A-TYPES-EXTRACTION.md)
**Audience**: Sasha (sign-off), Anders / Irzhy / Ahmed (informational)
**Read time**: 2 minutes
**Purpose**: keep this open alongside the ticket while reviewing for sign-off.

---

## 30-second version

We are moving **type labels** (data shape descriptions) out of two implementation files (`OllamaProvider.ts`, `database.ts`) and into new dedicated `types.ts` files. The actual code that talks to AI providers, the actual code that talks to the database, and every behaviour pc2-node performs — **none of it is touched**.

**Why first**: it's the smallest possible Phase 2 ticket. We use it to prove the release pipeline (smoke matrix + PR template + rollback) works for refactors, *before* doing any refactor that could actually affect users.

---

## What changes — and what doesn't

| Aspect | Changes? | Notes |
|---|---|---|
| **Installer size on disk** | ❌ No change | Types vanish at compile time; not in shipped JS |
| **Memory / CPU at runtime** | ❌ No change | No new code paths |
| **AI chat behaviour** | ❌ No change | Same models, prompts, responses |
| **dDRM behaviour** | ❌ No change | Not touched at all |
| **Database / schema / queries** | ❌ No change | Same SQL, same migrations |
| **API endpoints / payloads** | ❌ No change | Same URLs, same JSON |
| **What end users see** | ❌ Nothing different | They wouldn't notice |
| **What operators see** | ❌ Nothing different | Heartbeat, logs unchanged |
| **Launcher behaviour** | ❌ No change | Not touched |
| **Supernode dDRM surface** | ❌ No change | Hard constraint from v1.2.8.0 plan |
| **Source code organisation** | ✅ Slight improvement | Types now in predictable place |
| **Audit scores on 7 modules** | ✅ +8 total points | 6 modules become perfect 10/10 |
| **TypeScript compiler happiness** | ✅ Slight improvement | Cleaner type-only imports |
| **Future Phase 2-B work** | ✅ Becomes mechanical | The 16+ concrete-class refactors get easier |

---

## Files involved

**Files created** (2 new files):
- `pc2-node/src/services/ai/providers/types.ts` — holds 5 type definitions moved from `OllamaProvider.ts`
- `pc2-node/src/storage/types.ts` — holds 9 type definitions moved from `database.ts`

**Files modified** (7 total):
- `OllamaProvider.ts` — type defs removed, import added (behaviour unchanged)
- `ClaudeProvider.ts`, `GeminiProvider.ts`, `XAIProvider.ts`, `OpenAIProvider.ts`, `MemoryConsolidator.ts` — import path changed
- `storage/database.ts` — type defs removed, import + re-export added (behaviour unchanged)

**Files NOT touched**:
- Anything in `services/boson/` (Boson, Chipotle Relayer surface)
- Anything in supernode-related paths
- Anything in `launcher/` or heartbeat
- Anything Irzhy is working on in his branch

---

## The exact change, in one picture

**Before** (today):

```
OllamaProvider.ts contains:
  ├── 5 type definitions  ◄── used by 4 sibling files + 1 memory file
  └── 400 lines of Ollama-specific code

ClaudeProvider.ts says:
  "Get my types from OllamaProvider"  ◄── weird; Claude isn't Ollama
```

**After** (Phase 2-A):

```
types.ts (new) contains:
  └── 5 type definitions  ◄── used by everyone who needs them

OllamaProvider.ts contains:
  ├── (no more type defs)
  ├── import type { ... } from './types.js'
  └── 400 lines of Ollama-specific code  ◄── UNCHANGED

ClaudeProvider.ts says:
  import type { ... } from './types.js'  ◄── reads from sensible place
```

Same pattern applied to `storage/database.ts` → `storage/types.ts`.

---

## Risk reality check

| Failure mode | Probability | Caught by | User impact |
|---|---|---|---|
| Typo in new import path | Low | TypeScript compiler before push | None — never ships |
| Missed a file that imports from old location | Low | TypeScript compiler before push | None — never ships |
| Circular import created | Very low | Compiler / smoke test | None — never ships |
| Subtle behaviour change | **Cannot happen** | N/A — no behaviour code touched | None |
| Smoke test red on one OS | Low | CI gates merge | None — merge blocked until green |
| User-visible bug on a real Mac | **Cannot happen** | Manual fresh-install verification before merge | None |

**Rollback**: single PR, single revert commit. No state involved. ~5 minutes if needed.

---

## Why we're not just "letting it ride" without the audit-derived ticket

The original Phase 2 plan listed types extraction generically as "~3 hours, low risk". Without the audit data, that's a vibe. With the ticket:
- We know **exactly** which 18 import sites are affected (Appendix A of the ticket)
- We know **exactly** which 7 modules' audit scores change and by how much
- We know **exactly** which files are out of scope (the 9 storage consumers that need the `DatabaseManager` class — those are Phase 2-B)
- We have a **template** for every Phase 2 ticket that follows

This is the difference between "let's do a refactor" and "let's execute a defined refactor against a measured baseline".

---

## Sign-off questions — with my recommendations

The ticket has 4 open questions for you. Here are quick recommendations:

| Question | My recommendation | Why |
|---|---|---|
| **One PR or two?** | One | Both halves are independent type-only changes. Rolling back either is trivial. One PR keeps review surface tight and proves the pipeline once. |
| **Include the 4 optional follow-on files?** | Defer to Phase 2-B | They overlap with the concrete-class work happening in 2-B anyway. Keeping 2-A minimal is the point. |
| **Mac launcher soak gate** | Confirm 48-72h passed | Hard constraint; non-negotiable. Phase 2-A waits in the queue until soak confirms. |
| **Reviewer** | Sasha self-review; flag Irzhy as informational | Type-only changes don't need second-set-of-eyes; flagging Irzhy lets him plan around it when his branch merges. |

If you agree with all four, the ticket flips from **Proposed** → **Agreed** and waits patiently until next week's Mac launcher proves stable.

---

## When this would actually execute

```
Monday May 18 ─── Mac launcher tag + release
Tuesday May 19 ── 24h soak observation
Wednesday May 20 ─ 48h soak observation; if green → unlock Phase 2
Thursday May 21 ── Phase 2-A PR drafted (3.5h focused work)
Friday May 22 ──── Phase 2-A merged (smoke green + manual install verified)
```

If Mac launcher soak finds an issue, Phase 2-A waits. The hard constraint always wins.

---

## What Phase 2-A is *not*

To be crystal clear, this ticket is **not**:
- New AI features
- New monetisation features
- New dDRM logic
- A footprint reduction (Cluster 3 does that)
- The orchestrator splits (Phase 2-D does that)
- The singleton purge (Phase 2-C does that)
- The Runtime migration itself (years out; Anders' team)

It's a **plumbing tidy-up**. It enables the things in that list to happen safely later.

---

## Cross-references

- Full ticket: [`PHASE-2-A-TYPES-EXTRACTION.md`](./PHASE-2-A-TYPES-EXTRACTION.md)
- Audit findings that justify it: [`CAPSULE_READINESS_REPORT.md`](./CAPSULE_READINESS_REPORT.md) §5.2 Pattern #2
- Executive summary: [`AUDIT_EXECUTIVE_SUMMARY.md`](./AUDIT_EXECUTIVE_SUMMARY.md)
- Calendar context: [`PHASE-2-PLAN.md`](./PHASE-2-PLAN.md) §5.4
- Per-PR template Phase 2-A will follow: [`PHASE-2-PLAN.md`](./PHASE-2-PLAN.md) "Cross-cluster: per-PR template"
- Mac launcher gate: [`../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md`](../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md)
