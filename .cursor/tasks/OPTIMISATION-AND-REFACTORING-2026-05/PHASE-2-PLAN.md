# Phase 2 Plan (post-Mac-launcher release)

**Status**: Proposed. Not yet Agreed. Do not start any item until the Mac launcher release ships and is stable.

**Consolidates Phase 2 items from**:
- `.cursor/tasks/RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md` (carry-overs)
- `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/OPTIMISATION-AND-REFACTORING-2026-05.md` (footprint + refactor)
- `FOOTPRINT_AND_REFACTOR_BASELINE.md` §7 (specific candidates with measurements)
- `ROLLBACK-PROCEDURE.md` §7 of dry-run appendix (doc refinements)

**Hard constraint** (set by Sasha 2026-05-15, clarified 2026-05-17):
- **Shipping gate**: no item in this plan **ships to users** — i.e. gets merged into the release branch, included in a release tag, or otherwise reaches an end-user installer — until v1.2.8.0 (Mac launcher) ships and is observed stable for ≥48 h on real user installs. Confirmation gates: 0 hot-patch reports in the first 48 h, supernode dDRM surface unchanged, IPFS cluster healthy.
- **Coding gate**: work on the current feature branch (`feat/t-1-telemetry-and-support` or successor) can proceed at any time, *provided* the change cannot interfere with v1.2.8.0's release surface. Type-only refactors, internal-module reorganisation, and any change that does not appear in a v1.2.8.0 build are explicitly allowed. The feature branch is **not** the release branch; pushing to it does not affect what ships.
- **Why the distinction matters**: doing low-risk Phase 2 work *now* (on the feature branch, behind the shipping gate) means PRs are smoke-tested, reviewed, and ready-to-merge the instant Mac soak passes — instead of starting fresh that day. This is productive use of release-window time without risking the release.

**Soft constraints** (also set by Sasha):
- Each Phase 2 item is its own PR with its own smoke-test green run. No "while we're at it" bundling.
- Cross-platform parity is non-negotiable: every change must keep Mac + Linux x64 green (the required gates), AND ideally not regress Linux ARM64 + Windows (current experimental gates).
- No new product-code dependencies on infrastructure we don't already operate.

---

## Execution order (calendar view)

Working backwards from "Mac launcher ships Wed/Thu next week (May 20-21)":

| Week | Focus | Items |
|---|---|---|
| **May 18-22** | NO Phase 2 work | Mac launcher release prep, ship window, 48 h soak |
| **May 25-29** | Cluster 1 (docs) + Cluster 2 (CI hardening) | Lowest-risk items first; build muscle before touching deps |
| **June 1-5** | Cluster 3 (dependency footprint) | One PR per item, smoke green per PR |
| **June 8-12** | Cluster 4 (code refactor) | Medium risk; do during a quiet feature week |
| **Beyond** | Cluster 5 (Runtime convergence prep) | Audit-only initially; feeds AGENTIC-PC2-MONETISATION-2026-05 strategy |

If Irzhy's branch lands mid-Phase-2, his work takes priority. Pause Phase 2 cluster work, re-baseline after Irzhy merges, resume from the appropriate cluster.

---

## Cluster 1 — Documentation refinements

Very low risk. Pure markdown edits. Can be done any time, but pinned to Phase 2 so we don't churn docs while the release is in flight.

### 1.1 Refine `ROLLBACK-PROCEDURE.md` with dry-run findings
- **What**: fold the 7 findings from the 2026-05-16 dry-run appendix into the main procedure body. Specifically: add a "common gotchas" subsection warning about the auto-Latest-on-creation behaviour, tighten the 30/60 min targets to 5/20 min, add the "draft hides anonymously in <1 s" note to §1.
- **ROI**: future tagger reads cleaner procedure; less chance of mis-reading the appendix as optional context.
- **Effort**: 30 min.
- **Risk**: none (docs only).
- **Dependencies**: dry-run completed (✅).

### 1.2 Quarterly re-baseline of `FOOTPRINT_AND_REFACTOR_BASELINE.md`
- **What**: re-run depcheck + jscpd + size measurements, append a delta block to the bottom of the existing baseline doc. Don't overwrite the original — we want a time series.
- **ROI**: shows whether each Phase 2 change actually moved the needle.
- **Effort**: 30 min per re-baseline.
- **Risk**: none (measurement only).
- **Dependencies**: each Cluster 3 item completion → trigger one re-baseline so we can attribute the delta to the item.

### 1.3 Author `MASTER_HANDOVER.md` Phase 2 supplement
- **What**: short page in `docs/handover/` (gitignored, local-only per project convention) capturing Phase 2 state for whoever picks up the work next if Sasha is offline.
- **ROI**: continuity if Sasha is unreachable.
- **Effort**: 20 min.
- **Risk**: none.
- **Dependencies**: at least one Phase 2 item shipped so there's something to hand over.

---

## Cluster 2 — CI hardening

Low risk. Only touches `.github/workflows/smoke-test.yml` and adds tests; no product code change. Each item can be its own PR.

### 2.1 Promote `linux-arm64` + `windows-x64` to required gates
- **What**: remove `experimental: true` and `continue-on-error: ${{ matrix.experimental }}` from those two matrix entries. They've been consistently green for the last 3 runs.
- **ROI**: catches platform-specific regressions BEFORE they reach the release. Tightens the safety net.
- **Effort**: 5 min (yaml diff + push + verify green).
- **Risk**: low — if a flaky test on those platforms surfaces, we'll have to revert and investigate. Mitigation: do this on a Saturday with low merge traffic so we have buffer to react.
- **Dependencies**: none.

### 2.2 Heartbeat assertion harness (A-4 from RELEASE-ENGINEERING)
- **What**: new step in `smoke-test.yml` that launches `pc2-node` in the background, waits ≤10 s for `data/runtime/heartbeat.json` to appear, validates schema (`pc2.heartbeat.v1`) + freshness (`lastUpdated` within last 5 s) + cleans up. Tests the v1.2.7.13 heartbeat protocol end-to-end at PR time, before any user sees a bad heartbeat regression.
- **ROI**: protects the launcher↔pc2-node status indicator contract. The v1.2.7.13 fix was added because this exact regression went live; the harness prevents repeat.
- **Effort**: 1-2 h (write harness in `scripts/smoke-heartbeat.mjs`, wire into workflow, test). The harness reads from `pc2-node/src/utils/runtime-heartbeat.ts` for the schema constants so source-of-truth stays single.
- **Risk**: low. The harness boots pc2-node briefly in CI; could be flaky if startup is slow. Mitigation: generous timeout (30 s wall-clock, with `console.log` of intermediate states), skip on Windows initially (`if: runner.os != 'Windows'`) since Windows boot is the slowest.
- **Dependencies**: 2.1 ideally first so we have confidence in the matrix, but not blocking.

### 2.3 (Optional) Bi-weekly Intel Mac run on `macos-13-large`
- **What**: add a separate workflow (`smoke-test-intel-mac.yml`) that runs on `macos-13-large` (paid runner, ~$0.16/min) on a schedule — say, 2 days before the planned release window, gated by manual `workflow_dispatch` trigger.
- **ROI**: catches Intel-Mac-specific regressions before release. Intel Macs are a non-trivial user segment; current matrix only covers Apple Silicon.
- **Effort**: 30 min (copy smoke-test.yml, restrict matrix, document trigger).
- **Risk**: low. Cost is the question — at typical ~10 min per run, that's ~$1.60 every two weeks. Reasonable insurance.
- **Dependencies**: 2.1 + 2.2 ideally first.
- **Open question**: Sasha to confirm budget acceptable. Default: include.

---

## Cluster 3 — Dependency footprint reduction

Low-to-medium risk. Each item is a single dependency change validated by smoke-test green. Strict one-PR-per-item discipline.

Items ordered by ROI (savings per hour of effort).

### 3.1 canvas@2.x → @napi-rs/canvas migration
- **What**: replace 3 `import('canvas')` sites in pc2-node with `@napi-rs/canvas` (compatible `createCanvas` API). Drop `canvas@2.11.2` from `pc2-node/package.json` optionalDependencies. Drop the `Install canvas system libs (Linux)` + `Install canvas system libs (macOS)` steps from `smoke-test.yml`.
- **Savings**: ~12 MB per user install + ~60 s per CI run (Cairo/Pango install step).
- **Effort**: 2 h (verify API compat for the 3 call sites — text rendering, image scaling, dimensions inspection — write quick test that renders a known-good image and diffs against a fixture).
- **Risk**: low. `@napi-rs/canvas` is a drop-in for the subset of API we use. Worst case is a per-platform native bug; mitigation is keep `canvas` in optionalDeps for one release as a fallback.
- **Dependencies**: none. Already on Phase 2 todo from the A-7/A-8 work.

### 3.2 react-native transitive bloat removal
- **What**: investigate whether pc2-node uses the WebRTC IPFS transport (per `npm ls react-native` trace: `helia → @libp2p/webrtc → react-native-webrtc → react-native`). If unused, configure helia to skip WebRTC; if needed, replace `@libp2p/webrtc` with the lighter `@libp2p/webrtc-direct` (server-side only, no React Native peer needed).
- **Savings**: ~85 MB pc2-node footprint (react-native 83 MB + @react-native 19 MB - overlap with deduped node_modules).
- **Effort**: 3-4 h (verification: grep for `webRTC` / `WebRTC` usage in helia config, test IPFS connectivity after removing). Higher uncertainty than 3.1 because helia's WebRTC defaults may matter for certain peer discovery paths.
- **Risk**: medium. Could regress IPFS connectivity for some peer topologies. Mitigation: add an IPFS dial test to the smoke harness BEFORE the change; verify it passes after the change.
- **Dependencies**: 2.2 (heartbeat harness) should land first so we have a pattern for adding runtime tests to the smoke suite.

### 3.3 `ipfs-webui` removal if confirmed unused
- **What**: depcheck flagged `ipfs-webui` (11 MB) as unused in pc2-node. Manually verify by grepping for `ipfs-webui` and `webui` in pc2-node/src; if no real usage, remove from dependencies.
- **Savings**: 11 MB pc2-node install size.
- **Effort**: 30 min (verify + remove + smoke green).
- **Risk**: low if the manual verification is thorough.
- **Dependencies**: none.

### 3.4 `@opentelemetry` investigation (279 MB)
- **What**: trace which dep pulls in `@opentelemetry` (`npm ls @opentelemetry/api` from root). Decide: do we actually emit OTel traces today? If no, pin the transitive parent to a version that doesn't auto-instrument, OR add `npm overrides` to nullify the OTel sub-tree, OR live with it if it's load-bearing for something we don't notice.
- **Savings**: up to 279 MB root install size if removable.
- **Effort**: 2-4 h (investigation + decision + execution + smoke).
- **Risk**: medium-high. OTel auto-instrumentation can be load-bearing for performance monitoring tools we may use without realising. Mitigation: confirm via runtime behaviour that traces are not being generated, and that any service depending on them has been notified.
- **Dependencies**: none.

### 3.5 `@aws-sdk` root deps cleanup
- **What**: `depcheck` flagged `@aws-sdk/client-secrets-manager` + `@aws-sdk/client-sns` as unused in root `package.json`. Verify (search for `secrets-manager` / `client-sns` / `SecretsManager` / `SNS` in src/). If unused, remove from root `package.json`.
- **Savings**: part of the 29 MB AWS SDK (the bigger transitive `@aws-sdk/credential-providers` from Particle is separate and harder).
- **Effort**: 30 min.
- **Risk**: low.
- **Dependencies**: none.

### 3.6 Remaining depcheck-flagged unused deps (verify-and-remove per item)
- **What**: working through the 7+5 remaining depcheck findings (`@google/genai`, `@heyputer/putility`, `@paralleldrive/cuid2`, `@stylistic/eslint-plugin-js`, `express-xml-bodyparser`, `ioredis`, `javascript-time-ago`, `json-colorizer`, `open`, `string-template` in root; `@helia/strings`, `@libp2p/mplex`, `@libp2p/noise`, `@wasmer/wasmfs`, `cors`, `tweetnacl-util` in pc2-node).
- **Savings**: cumulative ~30-50 MB once de-duplicated, plus reduced npm install time.
- **Effort**: 15 min per item × 16 items = ~4 h total, but spread across multiple PRs over several days.
- **Risk**: low individually; cumulative low.
- **Dependencies**: none individually; do these last because each touches a small surface and we want to focus on big-impact items first.

### 3.7 `date-fns` tree-shakable imports audit
- **What**: convert any blanket `import { x, y, z } from 'date-fns'` to `import x from 'date-fns/x'` style. Bundle analyser will show 90%+ of date-fns is dead-code.
- **Savings**: ~15-20 MB shipped frontend bundle once tree-shaking properly kicks in.
- **Effort**: 1 h (grep + sed + verify, plus a re-build to confirm).
- **Risk**: low.
- **Dependencies**: none.

---

## Cluster 4 — Code refactoring

Medium risk. Touches product code. Each item is its own PR with explicit before/after measurement.

### 4.1 OpenAI/XAI provider base class extraction
- **What**: jscpd reports 51 lines of duplication between `OpenAIProvider.ts` and `XAIProvider.ts` — XAI is OpenAI-compatible API-wise. Extract a `BaseChatCompletionProvider` abstract class; both providers inherit, override only the bits that differ (base URL, model list, error code mapping).
- **ROI**: makes adding a new OpenAI-compatible provider (Claude API, Mistral, etc.) a 50-line change instead of a 200-line copy-paste. Maintains the codebase against the AGENTIC-PC2-MONETISATION mandate to expand AI provider choice.
- **Effort**: 1 day (refactor + tests).
- **Risk**: medium — changes provider behaviour in subtle ways if the inheritance is sloppy. Mitigation: keep current test coverage; add a "round-trip" integration test that ensures messages flow identically before/after.
- **Dependencies**: none directly, but conceptually feeds the AI Provider Abstraction Layer work in AGENTIC-PC2-MONETISATION-2026-05.

### 4.2 AgentMemoryManager / VectorMemoryStore shared interface
- **What**: jscpd reports 36 lines of duplication between these two files. Extract a `MemoryStore` interface; both implementations conform. Simplifies hot-swapping memory backends (in-memory ↔ vector DB ↔ Hermes).
- **ROI**: makes the DreamServer-inspired persistent memory upgrade in the AGENTIC-PC2-MONETISATION mandate easier to land.
- **Effort**: half-day.
- **Risk**: low-medium (limited blast radius — these are agent-internal abstractions).
- **Dependencies**: 4.1 ideally first for the refactor pattern.

### 4.3 `mp4split.ts` + `OpenAIProvider.ts` internal repetition cleanup
- **What**: jscpd reports internal repetition WITHIN these single files (74 and 75 lines respectively). Likely copy-pasted retry / streaming logic. Extract internal helpers.
- **ROI**: improved readability; possibly reveals a bug we haven't noticed (copy-pasted retry blocks often diverge subtly).
- **Effort**: 2 h each.
- **Risk**: low.
- **Dependencies**: none.

---

## Cluster 5 — Runtime convergence preparation (audit-only initially)

These items don't touch code in Phase 2. They produce documents that feed into the AGENTIC-PC2-MONETISATION-2026-05 strategy AND the eventual ElastOS Runtime work.

### 5.1 Capsule-shape audit — **IN PROGRESS (51/272 = 18.8% as of 2026-05-16)**

- **What**: walk pc2-node/src module-by-module; classify each module as: (a) capsule-ready (A), (b) refactorable with bounded effort (B), (c) deeply coupled (C).
- **Status**: 51 of 272 modules audited across 6 batches (types/ ✓, AI subset, storage ✓, boson sample, api sample, utils ✓). See [`CAPSULE_READINESS_REPORT.md`](./CAPSULE_READINESS_REPORT.md) for full data; [`AUDIT_EXECUTIVE_SUMMARY.md`](./AUDIT_EXECUTIVE_SUMMARY.md) for the 1-page summary.
- **Distribution so far**: 26 A (51%), 12 A- (24%), 12 B (24%), 1 B- (2%), 2 C (4%).
- **Concrete findings already actionable for Phase 2**:
  1. **#1 cross-cutting blocker**: concrete-class import instead of interface — confirmed in 9+ modules across 5 subtrees. **One Phase 2 ticket** ("extract IFilesystemManager, IDatabaseManager, IIPFSStorage, IAIChatService, IAgentKitExecutor, IIdentityService") fixes 9+ module scores.
  2. **Types co-located with implementation**: `providers/types.ts` extraction is a **1-hour Phase 2 ticket** that improves 5 module scores to 10/10. Similar `storage/types.ts` extraction is ~2 hours.
  3. **Global singleton actively used**: `storage/index.ts` exports `getDatabase()` singleton, used in `api/wallet.ts`. Removal is Phase 2 work; grep audit needed to find all consumers first.
  4. **Two C-class mega-orchestrators identified**: `ConnectivityService` (1,597 LOC) and `api/index.ts` (1,766 LOC) — both retired by Runtime substrate, not refactored.
- **Effort to complete**: ~12-15 hours of analyst-time at current pace (down from initial ~30hr estimate; pace improves as rubric is internalised).
- **Risk**: none (audit only, no code).
- **Dependencies**: none.

### 5.2 Capability-token affordance audit — **PARTIALLY DONE (subsumed by 5.1)**

- **What**: walk pc2-node/src looking for ambient-authority patterns.
- **Status**: §3 of `CAPSULE_READINESS_REPORT.md` defines the 14-term capability vocabulary; every audited module declares its capabilities. The audit doubles as the capability-token affordance audit.
- **Major finding**: pc2-node **already defines and enforces** a 14-scope capability vocabulary (`types/capabilities.ts` + `api/middleware.ts requireCapability(scope)`). Runtime convergence is extension, not invention.
- **Effort**: subsumed; no separate work needed.

### 5.3 ~~Concrete-class → interface extraction~~ → Phase 2-B: type-only import refactor (mechanical) — **SHIPPED TO FEATURE BRANCH 2026-05-18**

- **What**: converted ~40 imports of `DatabaseManager`, `FilesystemManager`, `IPFSStorage` from value-imports (`import { X }`) to type-only imports (`import type { X }`) wherever the consumer uses the class only as a type.
- **ROI**: erased the audit's "concrete-class import" blocker for the 3 highest-frequency cluster classes across 29 modules. Each previously had a −2 penalty for that pattern; the penalty is resolved for those imports.
- **Effort**: ~1.5 hours actual (faster than estimated). Single PR per Option A.
- **Risk**: very low (proven) — TypeScript caught the one classification mistake instantly; compiled JS output is **byte-identical** (SHA-256 verified on 5 spot-checked files).
- **Ticket**: see [`PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md`](./PHASE-2-B-CONCRETE-CLASS-TYPE-ONLY.md) — flipped Proposed → **Agreed** → **EXECUTED**. Includes full execution log at the bottom.
- **Cheat sheet for sign-off**: [`PHASE-2-B-CHEAT-SHEET.md`](./PHASE-2-B-CHEAT-SHEET.md).
- **Status (2026-05-18 ~01:30 UTC+1)**: source code converted; `tsc --noEmit` / `build:backend` / `test:unit` all green; ReadLints clean; SHA-256 byte-identical proof captured. About to commit on `feat/t-1-telemetry-and-support`. Held behind Mac launcher soak gate — awaits soak confirmation before merging to release branch.
- **Methodology lesson captured**: future "import → import type" tickets must grep for `<ClassName>.` (static-member access) in addition to `new` / `instanceof`. The `IPFSStorage.PinErrorType` enum-as-static-class-member usage in `api/public.ts` was the one site that couldn't be converted; reverted in 30 seconds after `tsc` flagged it. Lesson folded into Phase 2-C playbook.

### 5.3.1 Global-singleton purge → Phase 2-C: ambient-authority removal — **EXECUTED 2026-05-18, AWAITING CI GREEN + REVIEW**

- **What**: replace ~36 ambient-global accessor calls (`getDatabase()`, `getWASMRuntime()`, `getUpdateService()`) with explicit dependency passing via the *already widely-used* `req.app.locals.X` pattern (200+ siblings) or constructor injection for service classes. Also removes the one `(global as any).pc2Config` read.
- **ROI**: resolves audit Pattern #2 (ambient singletons) for the route layer; promotes ~14-18 module score points; the audit's "global-singleton blocker" is substantially eliminated for app code (declarations stay for bootstrap; consumer call sites all migrated).
- **Effort**: ~6-7 hours focused work; recommend single PR.
- **Risk**: low-to-moderate — first Phase 2 ticket where compiled JS *does* change (the byte-identical proof from 2-B no longer applies). Mitigated by TypeScript signature checks, unit suite, and full 4-platform CI matrix.
- **Dependencies**: shipping gate is Mac launcher 48-72h soak; coding gate is none (feature branch OK). Built on top of Phase 2-B's type-only DatabaseManager / FilesystemManager / IPFSStorage imports.
- **Ticket**: see [`PHASE-2-C-SINGLETON-PURGE.md`](./PHASE-2-C-SINGLETON-PURGE.md) — full ticket with file-by-file conversion table, bootstrap update plan, risk analysis, and the explicit out-of-scope list (sibling-orchestrator refactor → 2-D; mega-orchestrator splits → 2-E; `getGlobalIO()` / `getEventQueue()` kept as acceptable globals).
- **Cheat sheet for sign-off**: [`PHASE-2-C-CHEAT-SHEET.md`](./PHASE-2-C-CHEAT-SHEET.md).
- **Execution outcome (2026-05-18)**: **27 / 37 audited sites fully purged (73%)**. Cluster 1 (`getDatabase`) 15/17 — 2 static-method sites kept ambient with explicit comment. Cluster 2 (`getWASMRuntime`) 5/13 — route handlers + 1 class injection done; 8 deep WASM/dDRM/IPFS helpers marked `Phase 2-D (deferred)` rather than threaded through 5 layers. Cluster 3 (`getUpdateService`) 7/7 fully purged. Cluster 5 (`pc2Config` global) dropped — turned out to be a wider 4-file pattern with runtime mutation, promoted to its own future ticket. All gates green: `tsc --noEmit` clean, `build:backend` clean, `test:unit` 7/7, ReadLints 0 errors on 14 modified files, dev-server `/api/health` returns identical pre-change `version: "1.2.7.14"` proving `req.app.locals.updateService.getCurrentVersion()` is byte-equivalent behavior to the old ambient pull. **Two TypeScript-catches during execution validated the methodology**: static-method `this.db` error (TS2339) caught immediately and properly handled; type narrowing on optional `req.app.locals.updateService` enforced by compiler. Held behind Mac launcher soak gate before release-branch merge.

### 5.4 Types extraction (providers/types.ts + storage/types.ts) — **PHASE 2-A: SHIPPED TO FEATURE BRANCH 2026-05-17**

- **What**: extract type definitions from the implementation modules that currently own them.
- **ROI**: 5 AI provider modules + 4-6 storage modules improve scores by +1 each.
- **Effort**: ~3 hours total (one PR per subtree, or single PR — see ticket).
- **Risk**: very low (types-only refactor, no runtime change).
- **Dependencies**: shipping gate is Mac launcher 48-72h soak.
- **Ticket**: [`PHASE-2-A-TYPES-EXTRACTION.md`](./PHASE-2-A-TYPES-EXTRACTION.md) — flipped Proposed → **Agreed** → executed.
- **Status (2026-05-17 ~01:00 UTC+1)**: Committed `7cc3e6ff3` on `feat/t-1-telemetry-and-support`. CI green: Mac + Linux x64 + Linux ARM64 + Windows x64 + asset integrity + summary, 9m02s (run `26006041952`). Compiled `dist/services/ai/providers/types.js` and `dist/storage/types.js` are header-comment-only files (empirical proof of zero runtime change). Held behind Mac launcher soak gate — awaits soak confirmation before merging to release branch.

---

## Cross-cluster: per-PR template

Every Phase 2 PR should answer these in the PR description:
1. **Cluster + item ID** (e.g. "Phase 2 / Cluster 3 / 3.1 canvas migration").
2. **Before/after measurement** — exact numbers from the relevant baseline metric (size on disk, depcheck output, jscpd output, smoke test time, etc.). No "should be smaller" — actual diff.
3. **Risk mitigation taken** — what tests were added, what was manually verified, what fallback exists if the change misbehaves in production.
4. **Smoke test green** — link to the smoke-test workflow run that passed for this branch.
5. **Manual fresh-Mac install verified** — if the item could affect the install path (Cluster 3 items can), confirm verified on a real Mac before merging. If not affected, say so.
6. **Re-baseline** — after merge, re-run depcheck/jscpd/du; append delta to `FOOTPRINT_AND_REFACTOR_BASELINE.md` under a dated heading.

---

## Estimated cumulative impact

If all Cluster 3 items complete cleanly:

| Footprint dimension | Today | After Phase 2 | Δ |
|---|---|---|---|
| pc2-node/node_modules | 609 MB | ~520 MB | -89 MB (-15%) |
| Root node_modules (if @opentelemetry removable) | 2.0 GB | ~1.7 GB | -300 MB (-15%) |
| CI step count (canvas system-libs removed) | 14 steps | 12 steps | -2 steps |
| CI run time (canvas install removed) | ~7 min | ~6 min | -60 s |
| User install size delta | n/a | ~12 MB smaller | -12 MB |

Code quality dimension:

| Metric | Today | After Cluster 4 | Δ |
|---|---|---|---|
| pc2-node/src duplication % | 3.27% | ~2.0% | -1.27 pp |
| Avg LOC to add a new chat provider | ~200 | ~50 | -75% |
| Avg LOC to swap memory backend | ~120 | ~30 | -75% |

These are estimates. Each Phase 2 item produces its own actual measurement which goes into the re-baseline.

---

## Open questions for Sasha (before "Agreed")

1. **OK to start Cluster 1 + 2 as soon as Mac launcher hits 48 h soak with 0 hot-patch reports?** Default answer: yes, those are very low risk and don't touch product code.
2. **Cluster 3 ordering** — start with 3.1 canvas (already on the radar), or start with 3.5 / 3.6 (smaller depcheck cleanups to build PR muscle), or 3.2 react-native (biggest absolute win but highest investigation cost)? Recommendation: 3.1 first, 3.5 second (warm-up), 3.2 third (after we have the smoke harness IPFS dial test from 2.2 in place).
3. **Cluster 4 timing** — fold into Phase 2 or defer to a "post-Irzhy-merge" Phase 3 to avoid merge conflicts with feature work? Recommendation: defer until after Irzhy's branch lands.
4. **Cluster 5 timing** — these audits can start IMMEDIATELY (no code change, no merge risk). Recommendation: start as soon as the Mac launcher window closes; outputs feed the AGENTIC-PC2-MONETISATION strategy.
5. **Should we publish the FOOTPRINT_AND_REFACTOR_BASELINE.md to a more discoverable location** (e.g. `docs/` rather than `.cursor/tasks/`) once Phase 2 starts? It's basically engineering-team-public content. Default: keep in `.cursor/tasks/` until Phase 2 completes, then move to `docs/engineering/`.

---

## Document metadata

- **Source of truth**: this file.
- **Owners**: Sasha (decisions + sign-off); whoever picks up implementation in May 25+ window.
- **Last updated**: see git log on this file.
- **Tied to**:
  - `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/OPTIMISATION-AND-REFACTORING-2026-05.md`
  - `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/FOOTPRINT_AND_REFACTOR_BASELINE.md`
  - `.cursor/tasks/RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md`
  - `.cursor/tasks/RELEASE-ENGINEERING-V1280/ROLLBACK-PROCEDURE.md`
  - `.cursor/tasks/AGENTIC-PC2-MONETISATION-2026-05/AGENTIC-PC2-MONETISATION-2026-05.md` (long-term strategy that Phase 2 enables)
