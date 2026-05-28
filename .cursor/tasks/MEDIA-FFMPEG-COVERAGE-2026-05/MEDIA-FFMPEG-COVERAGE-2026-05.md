# Task: FFmpeg Coverage — Install Scripts, CI, and Preflight Check

**Task ID**: MEDIA-FFMPEG-COVERAGE-2026-05
**Created**: 2026-05-28
**Status**: Proposed
**Priority**: High (release-readiness blocker for v1.3 / public cloud rollout)

## Description

Close the FFmpeg installation gap across all install paths and CI jobs so that
no user — Mac, Windows, Linux, Pi, or developer-from-source — ever hits the
`503: FFmpeg not found` error mid-flow during video minting.

## Background

Discovered during release validation of `release/2026-05-28-ddrm-hardening`
(2026-05-28 PHT):

- A test video mint hit `POST /api/media/encode → 503 Service Unavailable`
  with `error: "FFmpeg not found. Install FFmpeg to enable media encoding."`
- Root cause: FFmpeg (`/opt/homebrew/bin/ffmpeg`) was not installed on the
  Mac dev machine; users on macOS must install it manually.
- This is a **pre-existing** issue (introduced by commit `76aafbddd` "feat:
  local media encoding pipeline" months ago) and is **NOT** a regression
  caused by Irzhy's dDRM hardening commits. The release branch can ship
  without this fix; it just shouldn't ship without a follow-up plan.

## Audit findings (state on 2026-05-28)

| Path | FFmpeg installed? | Owner |
|---|---|---|
| `scripts/install-arm.sh` (Linux/Pi one-liner) | ✅ Yes (`apt-get install ffmpeg`) | Already shipping |
| `scripts/install-wsl.sh` (Windows WSL) | ✅ Yes (`apt-get install ffmpeg`) | Already shipping |
| `.github/workflows/smoke-test.yml` Linux job | ❌ No | This task |
| `.github/workflows/smoke-test.yml` Mac job | ❌ No | This task |
| `.github/workflows/smoke-test.yml` Pi-OS Docker job | ❌ No | This task |
| README "From Source" Mac dev path | ❌ No mention of `brew install ffmpeg` | This task |
| ElastOS Launcher (signed Mac/Win desktop app) | ❓ Unknown | Out-of-repo — flag to that team |

FFmpeg sizes for context: Mac brew = 53.5 MB; Linux/WSL apt = ~80 MB on disk.

## Requirements

1. **CI coverage** — every `smoke-test.yml` job must install FFmpeg and verify
   it's on PATH. This catches regressions in the media encoder code path
   that today only manifest in production.
2. **Preflight check** — `pc2-node` should log a single, prominent warning
   line at boot when FFmpeg is missing on a platform that needs it, instead
   of failing silently until the first mint attempt.
3. **README — Mac source-code path** — mention `brew install ffmpeg` as a
   prerequisite for cloning-and-building from source.
4. **ElastOS Launcher coordination** — confirm with the Launcher team whether
   the Mac/Windows desktop install bundles or auto-installs FFmpeg. If not,
   add it. (Out-of-repo; tracked here for visibility.)

## Implementation Plan

### Step 1 — CI smoke test coverage (scope: this repo, 30 min)

- [ ] Add `ffmpeg` to the `apt-get install` line in the Linux smoke-test job
- [ ] Add `ffmpeg` to the `brew install` line in the Mac smoke-test job
- [ ] Add `ffmpeg` to the `apt-get install` line in the Pi-OS Docker job
- [ ] Add a CI step that runs `ffmpeg -version | head -1 && ffmpeg -encoders | grep -E "libx264|libsvtav1"` to fail-fast if a runner-image change drops the codec
- [ ] (Optional, follow-up) Add an integration test that hits `/api/media/encode`
  with a tiny test fixture so any regression in the encoder pipeline is caught

### Step 2 — Boot-time preflight check (scope: this repo, 20 min)

- [ ] Add a check in `pc2-node` startup (alongside the existing `BinaryManager`
  check that detects WireGuard/sing-box) that probes `which ffmpeg` and logs:
  - `[Encoder] ✅ FFmpeg detected: <version> (codecs: H.264, H.265, AV1, …)` on success
  - `[Encoder] ⚠️  FFmpeg not found — video minting will fail. Install:`
    - macOS: `brew install ffmpeg`
    - Debian/Ubuntu/Pi: `sudo apt-get install ffmpeg`
    - Windows (WSL): same as Debian
- [ ] Surface this status on `/health` and the dashboard so users can see it
  without grepping the log

### Step 3 — Documentation (scope: this repo, 10 min)

- [ ] Update `README.md` "From Source" section to list `brew install ffmpeg` /
  `sudo apt-get install ffmpeg` as a prerequisite (users who don't run the
  install scripts and instead build from source)
- [ ] Update `docs/QUICKSTART.md` with the same

### Step 4 — ElastOS Launcher coordination (scope: out-of-repo, 1 day)

- [ ] Confirm with Launcher team whether the signed Mac/Windows desktop app
  bundles FFmpeg or auto-installs it during first-run wizard
- [ ] If not: track a Launcher-side issue to add it. Bundle (~50 MB) or
  prompt-and-install during wizard
- [ ] Document the Launcher-side outcome in this task as a comment

## Acceptance Criteria

- [ ] CI smoke test for every platform installs and verifies FFmpeg
- [ ] CI smoke test fails fast (under 1 minute) if FFmpeg is missing on the runner
- [ ] `pc2-node` boot log shows a clear ✅/⚠️ line about FFmpeg status
- [ ] `/health` endpoint includes `media.encoder.ready: true|false` (or equivalent)
- [ ] README and QUICKSTART mention FFmpeg as a prerequisite for source builds
- [ ] ElastOS Launcher confirmed to either bundle or auto-install FFmpeg, OR a
  follow-up Launcher-side issue is filed and linked here

## Files to Modify

- `.github/workflows/smoke-test.yml`
- `pc2-node/src/services/BinaryManager.ts` (or wherever the boot-time tool detection lives — same place WireGuard / sing-box are detected)
- `pc2-node/src/api/health.ts` (or wherever `/health` is defined) — add encoder readiness
- `pc2-node/src/api/media.ts` — possibly improve the 503 message to point to the install command
- `README.md`
- `docs/QUICKSTART.md`

## Files to Create

- None (no new files needed)

## Testing Strategy

- CI: green run of smoke-test.yml on Linux + Mac + Pi-OS shows `ffmpeg -version` output
- Manual: stop FFmpeg in PATH, restart pc2-node, confirm boot log shows the warning
- Manual: with FFmpeg present, restart pc2-node, confirm boot log shows the success line
- Manual: video mint succeeds end-to-end after FFmpeg install (the original failure case)

## Notes

- This task is **release-readiness for v1.3 / public cloud**, not for the
  current `release/2026-05-28-ddrm-hardening` branch. That branch is dDRM-only
  and should ship without this fix.
- License note: FFmpeg with `--enable-gpl` (the brew default) brings in GPL'd
  libx264/libx265. Bundling FFmpeg into the desktop app forces GPL/LGPL
  compatibility. PC2's AGPL-3.0 is GPL-compatible, but the Launcher project's
  license must be checked before bundling.
- FFmpeg's H.264 patent licensing is technically a separate concern for
  distributors, though Homebrew, Debian, and most major OSes redistribute
  GPL FFmpeg builds with libx264 and the practice is well-established.
