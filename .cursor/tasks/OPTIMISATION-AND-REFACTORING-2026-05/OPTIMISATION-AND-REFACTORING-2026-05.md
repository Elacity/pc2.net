# Task: PC2 Footprint + Refactor Baseline (Phase 1 only)

**Task ID**: OPTIMISATION-AND-REFACTORING-2026-05
**Created**: 2026-05-15
**Status**: InProgress
**Priority**: Medium (P1 — runs parallel to RELEASE-ENGINEERING-V1280, ships AFTER Mac launcher)
**Branch**: `feat/t-1-telemetry-and-support`
**Owner**: Sasha (AI assistant)

---

## Description

Produce a **measurement-only baseline** of PC2's footprint, dependencies, hot files, and refactor candidates. **No product-code changes.** The output is a single markdown report — `FOOTPRINT_AND_REFACTOR_BASELINE.md` — that informs Phase 2 (safe wins) and Phase 3 (architectural refactors), which are SEPARATE follow-on tasks opened only after the Mac launcher ships and Sasha approves the priorities.

This task exists to answer the user's request: *"consider how to optimise and decrease our footprint with all the same if not more features and considered security and anything else."* Without numbers, that question is unanswerable. This task produces the numbers.

---

## Background

Sasha (user) has stated:

1. **PC2 v1 feels "monolithic"** compared to Anders' Runtime model (small core + capsules).
2. **Install/update has been stressful** through v1.2.7.x — wants the system to feel smaller and more reliable, not bigger.
3. **Open-source AI models keep getting better** — opportunity to do more with less.
4. **Runtime convergence is the long-term goal** — cleaner, more modular PC2 code = easier migration to capsules later.

Today we don't have authoritative numbers for:
- Installer / build artifact size per platform
- `node_modules` weight (root + pc2-node + frontend)
- Largest bundled binaries and whether any are unused per platform
- Source files large enough to be refactor candidates (per `codequality.mdc`: ≥300 LOC for components, ≥500 LOC for utility modules)
- Duplicated code patterns across the workspace
- Unused npm dependencies
- Cold-start time + idle RSS

Phase 1 fills that gap with **observational data only**. No PRs, no refactors, no dependency removals — just numbers and a ranked opportunity list.

---

## Requirements

### Functional

A single output document at `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/FOOTPRINT_AND_REFACTOR_BASELINE.md` containing:

1. **Installer / build artifact sizes**
   - `pc2-binaries-v1` release total + per-asset breakdown
   - `pc2-node` after `npm run build:backend` (the `dist/` directory)
   - `src/gui` after `npm run build:gui` (the `dist/` bundles)
   - Combined "user download" footprint per platform (rough estimate, assuming the Electron launcher binary + this repo's bundled assets)
   - Comparison to "minimum viable" — e.g. what % of bundled binaries are actually loaded by the typical user

2. **Dependency weight**
   - Top 30 heaviest `node_modules` packages by size (root + `pc2-node`)
   - Top 10 most-dependent-upon packages (i.e. removing any one would cascade)
   - Unused dependencies per `depcheck` (false-positive-checked manually)
   - Dependencies with known smaller alternatives (e.g. `moment` → `date-fns` style trades)

3. **Source code hotspots**
   - All `.ts` / `.js` files ≥500 LOC (excluding generated, vendor, tests)
   - Top 20 longest functions (by LOC)
   - Duplicated code patterns per `jscpd` (set to find ≥30-token clones)
   - Cross-file pattern duplication (e.g. inline constants defined in multiple components — the kind of thing `codequality.mdc` calls out)

4. **Bundled binary inventory**
   - Each entry in `pc2-node/src/utils/binary-manager.ts` `TRANSPORT_BINARIES` + size per platform
   - Cross-platform reachability: does every platform load every binary, or are some platform-specific? (E.g. is `awg-quick` ever loaded on Windows? If no, why bundle?)
   - Compression opportunity (UPX for native binaries — only suggested, not applied; needs notarisation impact check)

5. **Runtime characteristics**
   - Cold start: time from `node dist/index.js` to first heartbeat write — measured 5× on macOS + Linux, report median + p95
   - Idle: RSS after 60s of no traffic — measured on macOS + Linux
   - Module load: which modules contribute most to cold-start delay (Node `--cpu-prof`)

6. **Ranked opportunity list**
   - Each opportunity: title, current state, proposed state, estimated savings (MB / ms), estimated effort (S/M/L), risk (low / med / high), Runtime-migration impact (helps / neutral / hurts)
   - Sorted by leverage (savings ÷ effort, with risk applied)
   - Top 10 highlighted as "do these in Phase 2"
   - Top 3 architectural refactors highlighted as "do these in Phase 3"

### Non-functional

- **Measurement-only — no product-code changes**. Verified by `git diff --stat src/ pc2-node/src/ extensions/` returning empty.
- **Reproducible**: every number in the report has an exact command line that produces it.
- **Honest**: include things we *can't* easily measure (e.g. RAM use under load without a load generator) and call them out explicitly rather than guessing.

### Out of scope (deferred to Phase 2 / Phase 3)

- Any actual dependency removal, binary repackaging, or code refactor
- Any PR to `main` from this task other than the report itself + tooling devDeps
- AI-specific work (`OllamaService` polish, model picker) — separate task (`AI-CHAT-MODEL-PICKER-2026-05`)
- Windows-platform-specific deep-dive — same general approach but separate report for clarity

---

## Implementation Plan

- [ ] **Phase 1.0: Tooling setup** (~1 hour)
  - [ ] Add devDeps: `depcheck`, `jscpd`, `size-limit` (with `@size-limit/preset-app`), `source-map-explorer` if needed
  - [ ] Verify all install cleanly on current Node version
  - [ ] Document the command-line for each in the report

- [ ] **Phase 1.1: Build-artifact sizing** (~1 hour)
  - [ ] Run `pc2-binaries-v1` size audit via `gh release view`
  - [ ] Run `npm run build:pc2` end-to-end, sum `dist/` outputs
  - [ ] Capture into report Section 1

- [ ] **Phase 1.2: Dependency weight** (~2 hours)
  - [ ] Run `du -sh node_modules/*` after fresh install, sort, top 30
  - [ ] Run `depcheck` (root + pc2-node), curate against false positives
  - [ ] Manual review: are there obvious lighter alternatives for the top 10?
  - [ ] Capture into report Section 2

- [ ] **Phase 1.3: Source code hotspots** (~2 hours)
  - [ ] Run `find . -name '*.ts' -o -name '*.js' | xargs wc -l | sort -rn` excluding noise
  - [ ] Run `jscpd` configured for the workspace
  - [ ] Manual review: known anti-pattern hotspots (UIAIChat.js mentioned earlier as 4,145 LOC — verify)
  - [ ] Capture into report Section 3

- [ ] **Phase 1.4: Binary inventory** (~1 hour)
  - [ ] Read `TRANSPORT_BINARIES` map, cross-reference with `fetch-binaries.sh` output sizes
  - [ ] Per-platform load matrix (which platform loads which binary)
  - [ ] Capture into report Section 4

- [ ] **Phase 1.5: Runtime characteristics** (~2 hours)
  - [ ] Cold-start measurement script: `time node dist/index.js` × 5, parse for heartbeat-write timestamp
  - [ ] Idle RSS: start, wait 60s, sample, sample again 60s later (assert plateau)
  - [ ] Module load profiling: `node --cpu-prof dist/index.js`, surface top consumers
  - [ ] Capture into report Section 5

- [ ] **Phase 1.6: Ranked opportunity list + report write-up** (~3 hours)
  - [ ] Synthesize Sections 1–5 into the opportunity list
  - [ ] Apply effort × savings × risk weighting
  - [ ] Tag each with Runtime-migration impact
  - [ ] Draft the full report, review for honesty + reproducibility
  - [ ] Capture into report Section 6

**Time budget**: ~12 hours, runs alongside RELEASE-ENGINEERING-V1280, no critical path on the Mac launcher release.

---

## Acceptance Criteria

- [ ] `FOOTPRINT_AND_REFACTOR_BASELINE.md` exists in this task folder
- [ ] All 6 sections populated with real measurements + the command line that produced them
- [ ] Top 10 opportunities ranked with effort, savings, risk, Runtime impact
- [ ] Zero product-code changes (`git diff --stat src/ pc2-node/src/ extensions/` is empty)
- [ ] DevDeps additions (depcheck, jscpd, size-limit) are isolated to root `package.json` `devDependencies` only
- [ ] Sasha reviews the report and decides which opportunities open Phase 2 / Phase 3 follow-on tasks for

---

## Files to Create

- `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/FOOTPRINT_AND_REFACTOR_BASELINE.md`
- `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/scripts/measure-cold-start.mjs`
- `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/scripts/measure-idle-rss.mjs`
- `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/jscpd.config.json`

## Files to Modify

- `package.json` (root) — add devDependencies: `depcheck`, `jscpd`, `size-limit`, `@size-limit/preset-app` (or equivalent)
- `package.json` (root) — add scripts: `measure:cold-start`, `measure:idle-rss`, `audit:deps`, `audit:duplication`

**No source-code modifications.**

---

## Testing Strategy

- Each measurement command must produce the same number ±5% when re-run (i.e. measurements are reproducible)
- DevDeps additions must not change CI build time meaningfully (≤30s impact on `npm install`)
- The report is reviewed by Sasha before being treated as authoritative

---

## Hard Constraints

- **No product-code changes** in this task. Phase 1 is measurement-only.
- **No dependency removals** in this task. Even obvious ones — they go in Phase 2 with proper PR review.
- **No changes to `pc2-node/src/`, `src/`, `extensions/`, `deploy/`**. The exception is `package.json` for devDeps + scripts, which is unavoidable.
- **Do NOT** introduce performance benchmarks that require new bundled tools. We measure with what's already in `node`, `du`, `time`, plus the small set of devDeps listed above.

---

## Notes

- **Why parallel to release engineering?** Pure observational, zero product-code risk, doesn't compete for review attention with the Mac launcher.
- **Why a baseline first, not direct optimisation?** Optimising without numbers is guesswork. The first 10 hours of measurement save the next 100 hours of unfocused refactoring.
- **Runtime migration alignment:** every opportunity in the ranked list is tagged with "helps / neutral / hurts" the ElastOS Runtime migration. The intent is that Phase 2 / 3 work double-counts as Runtime preparation. If something would help PC2 v1 but harm Runtime migration, we flag it explicitly and let Sasha decide.
- **What I'm NOT going to do**: speculate about what the report will show before measuring. We'll have real data in the report; let it speak.

---

## Open Questions for Sasha (do not block on these — code conservative answers)

1. **Phase 2 / 3 trigger**: should I open Phase 2 (safe wins) as a new task immediately after the report is reviewed, or batch them based on Sasha's priorities for the next release cycle?
2. **Cross-platform measurements**: only Linux + macOS in Phase 1, or also Windows? (Windows adds ~3h.)
3. **Public sharing**: is the baseline report something we'd publish (transparency) or keep internal? (Affects how detailed we go on infrastructure specifics.)

---

## Status History

| Date | Status | Note |
|---|---|---|
| 2026-05-15 | Proposed | Initial draft, awaiting Sasha's `Agreed` |
| 2026-05-15 23:55 BST | Agreed → InProgress | Sasha approved with "ok go". Tooling setup starts in parallel with RELEASE-ENGINEERING-V1280 Phase 1. |
