# Task: Release Engineering Hardening for v1.2.7.14 / v1.2.8.0 Mac Launcher

**Task ID**: RELEASE-ENGINEERING-V1280
**Created**: 2026-05-15
**Status**: InProgress
**Priority**: High (P0 — blocks/enables flawless Mac launcher ship next week Wed/Thu)
**Branch**: `feat/t-1-telemetry-and-support`
**Owner**: Sasha (AI assistant) — does NOT touch v1.2.8.0 Chipotle Relayer code or supernode dDRM surface

---

## Description

Break the v1.2.7.7 → v1.2.7.13 hot-patch cycle by adding:

1. A **CI smoke-test workflow** that runs on real Apple Silicon Mac, Linux x64, Linux ARM64, and Windows runners on every push to `main` and on `workflow_dispatch`.
2. A **pre-tag release checklist** that gates every release through the same gates we identified during the v1.2.7.x hot-patch cycle.
3. A **documented + tested rollback procedure** so a bad release can be reverted in minutes, not hours.

The lesson from v1.2.7.7 → v1.2.7.13 is **not** "stop adding features." It is **dev → Mac-prod parity is too loose**. This task closes the gap.

---

## Background

In 2 days (2026-05-04 → 2026-05-06) we shipped 6 hot-patch releases chasing macOS-specific edge cases:

| Release | Bug class caught (in prod, by users) |
|---|---|
| v1.2.7.8 | Transient build OOM during `update.sh`; node offline / 502 on `alm.ela.city`; `pc2-binaries-v1` never published |
| v1.2.7.9 | macOS+Linux sudoers entries not auto-installed |
| v1.2.7.10 | Apple's `/bin/bash` 3.2 rejects `wg-quick`; `sudo -E` `WG_QUICK_USERSPACE_IMPLEMENTATION` missing |
| v1.2.7.11 | `amneziawg-tools` `awg` not bundled; sudo `env_reset` + `secure_path` strips bundled `$PATH`; `setupPermissions` osascript apostrophe-injection bug |
| v1.2.7.12 | Password prompt fired on every launcher restart; `awg-quick` calls `wg setconf` (upstream rebase regression) |
| v1.2.7.13 | Launcher status indicator desyncs on pc2-node respawn |

Every one of these bugs would have been catchable by **running the actual install path on a real Apple Silicon Mac in CI before tag**. GitHub Actions has free `macos-latest` (Apple Silicon M-series), `ubuntu-latest` (x64), `ubuntu-24.04-arm` (ARM Linux), and `windows-latest` runners for public repos. We are not using any of them for E2E smoke testing today — only for the `publish-pc2-binaries.yml` build job.

The cost of adding this CI matrix is **$0** (public repo, standard runners). The cost of not having it was 6 releases in 2 days and a stressful weekend.

---

## Requirements

### Functional

1. **Smoke-test workflow** at `.github/workflows/smoke-test.yml`:
   - Triggers: `push` to `main`, `pull_request`, `workflow_dispatch`.
   - Matrix: `macos-latest` (Apple Silicon), `ubuntu-latest` (x64), `ubuntu-24.04-arm`, `windows-latest`.
     - **Optional `macos-13-large` (paid Intel Mac)** — gated behind a `workflow_dispatch` boolean input (default off) so we don't burn paid minutes per push. Used pre-release.
   - For each matrix entry, run these gates IN ORDER:
     - **Build gate**: `npm install` (root + `pc2-node`), `npm run build:pc2`. Catches the v1.2.7.8 OOM class.
     - **Binary gate**: `bash pc2-node/scripts/fetch-binaries.sh <target>` (or download from `pc2-binaries-v1` release; both paths). Catches the v1.2.7.8 "release never published" class.
     - **Permissions gate** (macOS only): pre-install sudoers entries via passwordless `sudo` (runners have it), then call `setupPermissions::checkWireGuardPermissions` and assert it reports "configured" without re-prompting. Catches the v1.2.7.12 marker-file regression and the v1.2.7.11 SETENV detection.
     - **Heartbeat gate**: start `pc2-node` in background, poll `<dataDir>/runtime/heartbeat.json` for ≤10s, assert it appears with `schema=pc2.heartbeat.v1`, `healthy=true`, `pid` matches process, `lastUpdated` within 5s. Catches the v1.2.7.13 desync class.
     - **Restart gate**: write `<dataDir>/runtime/restart-requested.flag` with `reason: smoke-test`, wait ≤10s, assert new heartbeat with new PID. Catches the v1.2.7.13 respawn class.
     - **Clean shutdown gate**: SIGTERM the process, assert heartbeat is removed (or stale per protocol). Catches dirty-shutdown class.

2. **osascript command-string unit test** at `pc2-node/tests/unit/setup-permissions-osascript.test.ts`:
   - Constructs the exact command string PC2 would pass to `osascript -e 'do shell script "..." with administrator privileges'` for each macOS sudoers install scenario.
   - Asserts the string contains no unescaped apostrophes inside the shell-script argument.
   - Asserts the string survives a shell-tokeniser round-trip without parse errors.
   - **Reproduces the v1.2.7.11 apostrophe-injection bug** as a failing test on the pre-v1.2.7.11 code path (kept as a regression test).

3. **Pre-tag release checklist** at `.cursor/tasks/RELEASE-ENGINEERING-V1280/PRE_TAG_CHECKLIST.md`:
   - Markdown checklist that release engineer (Sasha) ticks through manually before tagging.
   - Includes: CI smoke matrix all green, `pc2-binaries-v1` asset count correct, launcher repo tag matches, manual smoke on Sasha's MacBook, rollback procedure rehearsed, post-release monitoring plan in place.
   - Lives in the task folder; copied/referenced from `docs/handover/MASTER_HANDOVER.md` after task completes.

4. **Rollback procedure** at `.cursor/tasks/RELEASE-ENGINEERING-V1280/ROLLBACK_PROCEDURE.md`:
   - Step-by-step git revert + tag re-issue + binary release rebuild for a bad release.
   - Includes the user-facing announcement template ("rollback to v1.2.7.13 — instructions here").
   - Dry-run tested at least once (against a synthetic "bad release" tag) before counting as done.

### Non-functional

- Workflow must complete in ≤25 minutes wall-clock per matrix entry (so the full matrix is ≤25 minutes parallel; Mac and Windows are usually the long pole).
- Workflow must produce useful failure output — line-numbered logs, heartbeat file dump on failure, sudoers state dump on failure.
- All new test code must follow `.cursor/rules/codequality.mdc` (no hooks in JSX style, but for test code: no duplication, descriptive names, no `any`).
- The smoke test must NOT touch any production network — pc2-node runs in offline mode if possible, or against `localhost` only.

### Out of scope (deferred)

- Windows-specific transport (sing-box / VLESS / Reality) smoke tests — Windows transport stack is different; we'll cover it after Mac launcher.
- Jetson-specific smoke tests — needs self-hosted runner; not blocking the Mac release.
- Performance regression detection (cold-start time delta-checking) — that's the OPTIMISATION-AND-REFACTORING task.
- Refactoring product code to make it more testable — separate work, after Mac release.

---

## Implementation Plan

Sequenced so each step is independently shippable / reviewable. Phase 1+2 are the MVP that catches the most v1.2.7.x bug classes; later phases add depth.

- [ ] **Phase 1: Smoke-test workflow MVP** (~3 hours)
  - [ ] Create `.github/workflows/smoke-test.yml` with `macos-latest` + `ubuntu-latest` matrix entries
  - [ ] Implement build + binary gates (the easy two)
  - [ ] Run via `workflow_dispatch`, get to green
  - [ ] Commit on branch, push, verify green in CI

- [ ] **Phase 2: Heartbeat + restart gates** (~4 hours)
  - [ ] Write a small `pc2-node/tests/smoke/heartbeat-probe.mjs` helper that starts pc2-node, polls heartbeat, asserts shape + freshness
  - [ ] Wire it into the workflow
  - [ ] Add restart-flag test
  - [ ] Add clean-shutdown test
  - [ ] Verify green on both matrix entries

- [ ] **Phase 3: macOS permissions gate** (~3 hours)
  - [ ] Pre-install sudoers in CI step (runner has passwordless sudo)
  - [ ] Call into pc2-node's `setupPermissions::checkWireGuardPermissions` via a small node script
  - [ ] Assert it reports configured without re-prompting (no osascript fires)
  - [ ] Assert the marker file is created correctly

- [ ] **Phase 4: osascript unit test** (~2 hours)
  - [ ] Add `pc2-node/tests/unit/setup-permissions-osascript.test.ts`
  - [ ] Reproduce v1.2.7.11 apostrophe bug as a regression test (use git history to find the bad string format)
  - [ ] Wire into `npm test`

- [ ] **Phase 5: Matrix expansion** (~2 hours)
  - [ ] Add `ubuntu-24.04-arm` entry
  - [ ] Add `windows-latest` entry (build + binary gate only; transport tests deferred)
  - [ ] Verify green across all 4 matrix entries

- [ ] **Phase 6: Pre-tag checklist + rollback runbook** (~3 hours)
  - [ ] Author `PRE_TAG_CHECKLIST.md` based on the v1.2.7.x learnings
  - [ ] Author `ROLLBACK_PROCEDURE.md` based on existing `gh release` patterns + git tag operations
  - [ ] Dry-run the rollback against a synthetic test tag
  - [ ] Cross-link from `docs/handover/MASTER_HANDOVER.md` (one-line pointer)

- [ ] **Phase 7: First live use** (release day, ~Wed/Thu next week)
  - [ ] Use the checklist for the actual Mac launcher tag
  - [ ] Note any gaps in a `LESSONS_FROM_FIRST_USE.md` post-release
  - [ ] Refine checklist for v1.2.8.x

**Time budget**: ~17 hours of focused work across 5 calendar days. Realistic; Phases 1–4 must land by Mon end-of-day to be useful for the release.

---

## Acceptance Criteria

- [ ] `.github/workflows/smoke-test.yml` exists, triggers on push to `main` + PR + dispatch, runs full matrix
- [ ] All 4 matrix entries (macos-latest, ubuntu-latest, ubuntu-24.04-arm, windows-latest) reach green on the branch before merge
- [ ] osascript unit test passes; same test fails when applied to the pre-v1.2.7.11 code (proves it would have caught the bug)
- [ ] Pre-tag checklist is checked-in markdown and used for the next tag
- [ ] Rollback procedure is checked-in markdown and dry-run-tested
- [ ] No new production-code changes from this task (test infra + workflows + docs only) — verified by `git diff --stat` excluding `.github/`, `pc2-node/tests/`, `.cursor/tasks/`
- [ ] Sasha (user) approves the v1.2.8.0 (or v1.2.7.14) Mac launcher tag using the new checklist

---

## Files to Create

- `.github/workflows/smoke-test.yml`
- `pc2-node/tests/smoke/heartbeat-probe.mjs`
- `pc2-node/tests/smoke/permissions-probe.mjs`
- `pc2-node/tests/unit/setup-permissions-osascript.test.ts`
- `.cursor/tasks/RELEASE-ENGINEERING-V1280/PRE_TAG_CHECKLIST.md`
- `.cursor/tasks/RELEASE-ENGINEERING-V1280/ROLLBACK_PROCEDURE.md`
- `.cursor/tasks/RELEASE-ENGINEERING-V1280/LESSONS_FROM_FIRST_USE.md` (post-release)

## Files to Modify

- `pc2-node/package.json` — add `test:smoke` script (one line)
- `package.json` (root) — add `test:smoke` script (one line)
- `docs/handover/MASTER_HANDOVER.md` — add one-line pointer to checklist + rollback procedure

**No product-code modifications.** If we discover a bug while writing tests, we open a separate task for the fix.

---

## Testing Strategy

- **The workflow IS the test.** Every commit to the branch re-runs it.
- **Local sanity** before push: `act` (the local GitHub Actions runner) for the Linux matrix entry, when available.
- **Pre-release rehearsal**: run the workflow against a synthetic "bad heartbeat" branch (mutate `runtime-heartbeat.ts` to write stale timestamps, assert workflow fails). Proves the test catches what it claims to catch.
- **Unit tests** for the osascript class run as part of `npm test:smoke`.

---

## Hard Constraints

- **Do NOT** touch v1.2.8.0 Chipotle Relayer code (`.cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/`, `deploy/web-gateway/index.js`, `pc2-node/src/api/chipotle-client.ts`, `pc2-node/src/runtime/relayer-signer.ts`). Per handover doc.
- **Do NOT** touch supernode dDRM surface (`/api/ddrm/*`, `usageKey` rotation files). Per handover doc.
- **Do NOT** push to `main` without Sasha's explicit OK.
- **Do NOT** modify product code from this task — test infrastructure only.
- **Do NOT** introduce any new bundled binary, Docker image, or install-time dependency (footprint discipline).

---

## Notes

- **Why now?** Mac launcher ships Wed/Thu next week. Phases 1–4 must land by Mon EOD to provide ≥48 hours of green-run signal before tag.
- **Why this matrix?** Apple Silicon catches the macOS bug class (the bulk of v1.2.7.x). Linux x64 catches the build/heartbeat path. Linux ARM64 catches Jetson-adjacent ARM-specific issues. Windows is included for Phase 5 — build gate only — to keep parity even though Windows transport tests come later.
- **Why no Intel Mac in standard matrix?** GitHub deprecated the free `macos-13` Intel runner. `macos-13-large` exists but costs minutes. Proposed mitigation: keep it as a `workflow_dispatch` opt-in (run pre-release on the manually-fired matrix) + add an Intel Mac to the community-tester pool. **Reconsider if Sasha wants paid Intel coverage.**
- **What this enables next:** the same gates work for v1.2.8.0, v1.2.8.x, and beyond. It's not Mac-launcher-specific.
- **Runtime convergence angle:** the heartbeat protocol, permission probes, and smoke gates are all testable patterns that translate cleanly to capsule manifests + capability tokens when ElastOS Runtime migration happens. We're not throwing this work away — we're paying for it once and re-using it.

---

## Open Questions for Sasha (do not block on these — code conservative answers)

1. **Intel Mac coverage**: free Apple Silicon only (with community-tester checkpoint), or pay for `macos-13-large` runner minutes on workflow_dispatch?
2. **Mac launcher target version**: is the next release v1.2.7.14 (bugfix continuation) or v1.2.8.0 (Chipotle Relayer + heartbeat fixes + earlier work)? Both `package.json` show `1.2.7.14` already — assume v1.2.7.14 unless told otherwise.
3. **Pre-release manual smoke**: who runs it? Sasha's MacBook only, or also Irzhy? (Affects pre-tag checklist wording.)
4. **Workflow secrets**: smoke tests don't need Apple signing secrets (we're not codesigning the test binaries). Confirm we should NOT inject signing secrets into the smoke workflow — keep blast radius minimal.

---

## Status History

| Date | Status | Note |
|---|---|---|
| 2026-05-15 | Proposed | Initial draft, awaiting Sasha's `Agreed` |
| 2026-05-15 23:55 BST | Agreed → InProgress | Sasha approved with "ok go". Starting Phase 1 (smoke-test workflow MVP). |
