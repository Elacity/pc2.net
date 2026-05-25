# Task: CI — Raspberry Pi OS distro coverage (experimental gate)

**Task ID**: CI-RASPBERRY-PI-COVERAGE-2026-05
**Created**: 2026-05-25
**Status**: InProgress *(verbally approved by Sasha 2026-05-25 22:11 +07; "ok lets do this … right now i want us to do github actions and get working so we can confirm its all correct, then we can tell eric what to do from a place of confidence")*
**Priority**: Medium (release-adjacent, explicitly NOT a release blocker for end-of-week tag)
**Owner**: Agent (CI workflow author) + Sasha (review + push approval)

## Description

Add a new `smoke-test.yml` job that builds pc2-node inside a Raspberry Pi OS-equivalent Docker container (`arm64v8/debian:bookworm-slim`) running on the existing `ubuntu-24.04-arm` GitHub-hosted runner. Marked **experimental** for the first 5 runs (mirrors the established `windows-x64` promotion pattern); after 5 consecutive green runs, promote to required gate by adding to the `summary` job's `needs:` list.

Once green, the recipe inside this job becomes the **validated install path** we can confidently share with Pi community members.

## Background

A Pi 5 community member (Eric) hit a build-from-source failure on 2026-05-25 reporting 20 TypeScript `TS2307: Cannot find module` errors across `ethers`, `siwe`, `@lit-protocol/*`, and `canvas`. Root cause: Raspberry Pi OS Bookworm 64-bit doesn't ship the C development headers (Cairo, Pango, libjpeg, etc.) that `canvas` (in `optionalDependencies`) needs to compile during `npm install`. The optional-dep silently fails, which causes TypeScript to lose its `.d.ts` resolution for a chain of dependent modules.

The existing `linux-arm64` matrix entry on `ubuntu-24.04-arm` doesn't catch this because Ubuntu's CI runner already has the required system libs pre-installed (or installs them via the workflow's `apt-get install` step). Raspberry Pi OS — which is what real Pi users actually run — starts from a bare-OS baseline.

The "linux-arm64 promoted 2026-05-16 after 5 consecutive green runs" comment at `.github/workflows/smoke-test.yml:105` documents the existing promotion path; this task follows the same pattern for a new distro-specific gate.

## Requirements

### Must

1. New top-level job in `.github/workflows/smoke-test.yml` called `build-pi-os`.
2. Runs on `ubuntu-24.04-arm` (existing GitHub-hosted ARM runner) inside a `container:` directive using `arm64v8/debian:bookworm-slim`.
3. Marked experimental: `continue-on-error: true` at the job level, **NOT** added to the `summary` job's `needs:` list (so a red Pi-OS gate does not block release tagging).
4. Job steps must mirror what a fresh Pi user would do:
   - `apt-get update && apt-get install -y` for the canvas system-libs list + Node 20 prerequisites
   - Install Node 20.x via NodeSource (the documented Debian install path)
   - `npm ci` in pc2-node + `npm install --legacy-peer-deps` in root (mirrors the existing matrix's install order — see A-7 comment block at `smoke-test.yml:251`)
   - `npm run build:backend` inside `pc2-node/` — **this is the exact step Eric is failing at**
   - Verify `pc2-node/dist/index.js` exists (cheap structural assertion)
5. Diagnostic-friendly output: print Node version, npm version, `uname -m`, and apt-installed libs at the top of the run so failure analysis is fast.
6. Promotion criterion documented inline (5 consecutive green runs without revert).

### Must not

1. Do NOT add to `summary.needs` until promoted — keep release-tagging path unaffected.
2. Do NOT touch any application code (`pc2-node/src/**`, root `src/**`). This is workflow-only.
3. Do NOT modify the existing `build-and-typecheck` matrix — Pi-OS is a separate job, not a 5th matrix entry, because the container directive is incompatible with the matrix's runner-native step assumptions.
4. Do NOT push to `feat/t-1-telemetry-and-support` or `main`. New work goes to a fresh branch (`ci/pi-os-coverage-2026-05`).

### Should (defer if blocking)

- Boot smoke (`node dist/index.js` + poll `/api/health`) inside the Pi-OS container. **Deferred to follow-up** if the build path lights up green first; the failure Eric reported is at `npm run build:backend`, well before boot.

## Implementation Plan

- [x] Create task directory + this README
- [ ] Apply the new `build-pi-os` job to `smoke-test.yml` locally (no commit yet)
- [ ] Show diff to Sasha + confirm push approval
- [ ] Create branch `ci/pi-os-coverage-2026-05` off local `feat/t-1-telemetry-and-support`
- [ ] Commit (single atomic commit, conventional-commits style)
- [ ] Push to `origin/ci/pi-os-coverage-2026-05` to trigger CI
- [ ] Watch first run; iterate locally → push → re-watch until green
- [ ] Document validated recipe + remaining-step notes in this task's README
- [ ] Prepare Eric's install message from the green recipe
- [ ] Move task to Review status; await Sasha sign-off
- [ ] After 5 consecutive green runs (likely 2-3 follow-up pushes worth), file follow-up task to promote to required gate

## Acceptance Criteria

- [ ] `build-pi-os` job appears in the next smoke-test run on the branch
- [ ] Job's container pulls `arm64v8/debian:bookworm-slim` cleanly
- [ ] `apt-get install` of canvas system libs succeeds inside container
- [ ] `npm ci` completes without `canvas` skip-warning
- [ ] `npm run build:backend` in pc2-node completes with **zero** TS errors (the explicit success signal we need before talking to Eric)
- [ ] `pc2-node/dist/index.js` exists and is non-empty post-build
- [ ] Total job duration ≤ 25 min (timeout-minutes ceiling)
- [ ] Job's red state does NOT block the `summary` job (continue-on-error verified)
- [ ] Inline promotion-criterion comment matches the windows-x64 pattern

## Files to Modify

- `.github/workflows/smoke-test.yml` — add new `build-pi-os` job between existing `docker-smoke` job and `summary` job (~80 lines added; no existing logic changed)
- This task README — append final validated-recipe block once green

## Files to Create

- `.cursor/tasks/CI-RASPBERRY-PI-COVERAGE-2026-05/CI-RASPBERRY-PI-COVERAGE-2026-05.md` (this file)

## Testing Strategy

CI-self-testing. The workflow's first run on the pushed branch is the test. Iteration loop:

1. Push branch → run starts automatically (workflow has `on: [push]`)
2. `gh run watch` (or `gh run view --log` post hoc) to read logs
3. Identify failure → fix locally → amend or push fresh commit → re-run
4. Repeat until green
5. Five greens (across natural pushes to this branch + the eventual PR) → promotion candidate

If first run fails for an unrelated reason (e.g. `ubuntu-24.04-arm` runner unavailable, NodeSource setup script down), document the flake and re-trigger.

## Notes

- The Pi-OS gate is **experimental on purpose this week** because of the end-of-week release. We do NOT want a new gate going red on its first run and creating a "do we ship anyway?" debate. Promotion to required is post-release.
- The job runs on the same `ubuntu-24.04-arm` runner the existing `linux-arm64` matrix entry uses, so there's no new runner-availability dependency.
- `arm64v8/debian:bookworm-slim` is the closest publicly-maintained Docker Hub image to Raspberry Pi OS Bookworm 64-bit. Raspberry Pi OS itself is a Debian Bookworm derivative; the kernel and Pi-specific firmware are not relevant for build/typecheck (only userspace libs are), so the slim Debian image is a faithful proxy at the build-pipeline level.
- Real-Pi hardware coverage (RAM, SD I/O, GPU) is **explicitly out of scope** — that's Option B (self-hosted Pi runner), tracked as a follow-up only if this gate misses bugs that real Pi users still report.
- If the new job exposes an issue with `canvas@2.x` not building on Bookworm despite system libs, the fallback is the already-tracked migration to `@napi-rs/canvas` in `OPTIMISATION-AND-REFACTORING-2026-05` Phase 2. That's a code change, not a CI change, and would be tracked separately.

## Linked Tasks

- [`RELEASE-ENGINEERING-V1280`](../RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md) — adjacent; this task adds a new (experimental) gate without affecting the v1.2.8.0 pre-tag checklist
- [`OPTIMISATION-AND-REFACTORING-2026-05`](../OPTIMISATION-AND-REFACTORING-2026-05/) — Phase 2 canvas migration could be the long-term fix if optional-dep compilation remains fragile
- Future follow-up task: `CI-PI-OS-PROMOTE-REQUIRED-2026-XX` (after 5 consecutive greens)
- Future follow-up task: `CI-PI-OS-BOOT-SMOKE-2026-XX` (add `node dist/index.js` + `/api/health` poll inside the container)
- Future follow-up task: `DOCS-RASPBERRY-PI-INSTALL-2026-XX` (codify the validated recipe as a user-facing install doc)
