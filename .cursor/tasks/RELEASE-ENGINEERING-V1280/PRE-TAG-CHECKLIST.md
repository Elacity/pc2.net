# Pre-tag Release Checklist (PC2 + ElastOS launcher)

**Purpose.** Every item on this list is a thing that, when skipped, has bitten us in production at least once between v1.2.7.7 and v1.2.7.13. The CI smoke test (`Smoke test (build + boot)` in `.github/workflows/smoke-test.yml`) covers the mechanical build / typecheck / unit-test gates. This document covers the gates a human still needs to run before pressing the tag button.

**Estimated time to run end-to-end:** 60–90 minutes for the tagger, including the manual fresh-Mac install verification. Worth every minute given the recent hot-patch cycle.

**Who runs this.** The person tagging the release — typically Sasha. Read top-to-bottom, do each item in order, do not skip. If anything fails, see the "what to do if it's red" line under that item. Do **not** tag if any required item is red.

---

## Section 0 — Branch + commit hygiene

- [ ] **0.1** Working tree clean against the branch being tagged: `git status --short` shows no `M` entries; only the documented untracked files (`?? .cursor/tasks/V1.2.8.0-*`, `?? docs/handover/*` — these are gitignored / intentionally local).
  - **If red**: commit or stash the work before tagging. Tagging a dirty tree means the tag and the binaries you ship are not what's in the repo.
- [ ] **0.2** Local branch matches `origin/<branch>`: `git fetch origin && git status` reports "Your branch is up to date with 'origin/<branch>'" (no unpushed commits, no behind/ahead drift).
  - **If red**: rebase / pull / push as needed. Tagging a divergent local branch leaves users on a commit nobody can `git checkout`.
- [ ] **0.3** Version bumped in **all three** package.json files: root `package.json`, `pc2-node/package.json`, and the launcher repo's `package.json` (if launcher is part of this release). All three carry the same new version string.
  - **If red**: bump now, commit, push, re-run from §0.1.
- [ ] **0.4** `CHANGELOG.md` has an entry for the new version, dated, with at least three sub-bullets describing the user-facing changes (matches the format of the v1.2.7.x entries).
  - **If red**: write the entry now. Future you, debugging next month, will thank present you.

## Section 1 — CI gates (automated, but verify they ran)

- [ ] **1.1** Latest `Smoke test (build + boot)` run for the release commit is **green overall** (`Smoke test summary` job conclusion = `success`). Visible at `https://github.com/Elacity/pc2.net/actions/workflows/smoke-test.yml?query=branch%3A<branch>`.

  As of 2026-05-19 the workflow has **6 required gates** that must all be green for the summary to pass:
  - **`Build + typecheck (linux-x64)`** — build, typecheck, unit tests, A-4 boot-smoke (with V2 #3 boot-time SLA gate: hard-fails if `/api/health` takes >90 s, warns at >60 s; observed cold-boot is 8-24 s)
  - **`Build + typecheck (linux-arm64)`** — same as linux-x64, including A-4 boot-smoke + SLA gate (RPi-class architectural coverage)
  - **`Build + typecheck (darwin-arm64)`** — same as linux-x64, including A-4 boot-smoke + SLA gate (Mac launcher's native arch)
  - **`Build + typecheck (windows-x64)`** — build, typecheck, unit tests; boot-smoke skipped per A-4 design (process-management semantics differ)
  - **`pc2-binaries-v1 asset integrity`** — asset count check + V2 #1 binary execution smoke (downloads + executes wireguard-go, amneziawg-go, wg, awg for linux-x64; detects corrupted/wrong-arch published binaries)
  - **`Docker-smoke (pc2-node/Dockerfile)`** — required gate as of 2026-05-19; builds the container, waits for HEALTHCHECK + curls `/api/health`. Validates the deployment-target path catches Dockerfile rot before users do.

  - **If red on any required gate**: do not tag. Investigate the failing job, fix on the branch, push, wait for re-run, re-check.
  - **If a `::warning::` is visible in the boot-smoke logs** (boot took 60-90 s): not a release blocker but worth a paragraph in the release notes' "Known issues" — investigate before next release before it crosses the 90 s SLA ceiling.
- [ ] **1.2** `pc2-binaries-v1` GitHub release exists and has the expected asset count:
  ```bash
  gh release view pc2-binaries-v1 -R Elacity/pc2.net --json assets --jq '.assets | length'  # expect 23
  ```
  - **If red (release missing or count wrong)**: this is the v1.2.7.8 bug class. Re-run the publish workflow before tagging:
    ```bash
    gh workflow run publish-pc2-binaries.yml -R Elacity/pc2.net \
      -f release_tag=pc2-binaries-v1 -f replace_existing=true
    ```
    Wait for it to complete (~15-30 min for all platforms), re-check asset count, then proceed.

  Note: §1.1's V2 #1 gate now also verifies that the **linux-x64 binaries actually execute** (file(1) ELF check + `--version` exit code). This catches a subset of the v1.2.7.x bug class earlier than the §1.2 asset-count check alone. **macOS variants are NOT covered by V2 #1** (CI runner is Linux x86-64) — they're still validated only by §2.3 manual transport check on real Mac.
- [ ] **1.3** Asset names spot-check: `gh release view pc2-binaries-v1 -R Elacity/pc2.net --json assets --jq '.assets[].name' | sort` matches the platform / arch matrix the launcher expects to download. Specifically check that `wg-darwin-arm64`, `awg-darwin-arm64`, `wg-quick-darwin`, `awg-quick-darwin`, `wireguard-go-darwin-arm64`, `bash-darwin-arm64` are all present (v1.2.7.10 → v1.2.7.11 lessons; missing any of these silently falls Mac installs back to ActiveProxy).
  - **If any expected asset is missing**: same fix as §1.2 (re-run publish workflow). Don't tag against an incomplete binary set.
- [ ] **1.4** Docker image build is reproducible from clean state (covered by §1.1 docker-smoke, but worth a sanity look at the run log):
  ```bash
  gh run list --workflow smoke-test.yml -R Elacity/pc2.net --branch <branch> --limit 1 --json conclusion,jobs --jq '.[0].jobs[] | select(.name=="Docker-smoke (pc2-node/Dockerfile)") | .conclusion'
  ```
  - Should return `"success"`. If anything else: the Dockerfile-based deployment path is broken; users running pc2-node in containers (Docker Hub, self-hosting communities) will hit failures. See `DOCKERFILE-REHAB-V1280.md` for the 6-bug repair history of 2026-05-19 in case the breakage looks similar.

## Section 2 — Manual fresh-install verification (THE most important gate)

This is the gate that would have caught v1.2.7.7–13 each, one by one. Do not skip.

- [ ] **2.1** Identify a **fresh-state Mac** for verification:
  - Either a clean VM (Tart / Parallels with a snapshot taken right after macOS first-boot setup), or
  - A real machine that has **never** installed PC2 / ElastOS launcher, or
  - A machine where you've manually removed: `~/.pc2/`, `~/Library/Application Support/ElastOS*`, `/etc/sudoers.d/pc2-wireguard`, `/etc/sudoers.d/pc2-amneziawg`, any existing app bundles, and bashed out the launcher's keychain entries.
  - **If you only have your daily-driver Mac**: that's the v1.2.7.x situation — bugs that the dev never sees because their environment is half-installed. Do not tag this way unless you have **also** verified on a real fresh machine via someone else (e.g. Sasha tests on his MacBook for our recent releases). Use the launcher repo's `clean-install-verify.sh` if it exists; otherwise be ruthless about clearing the listed paths.
- [ ] **2.2** Run the full install flow on the fresh-state Mac:
  - Download the launcher `.dmg` from the release the launcher CI just produced.
  - Open + drag to /Applications + launch.
  - Click through any first-run permission dialogs.
  - Sign in / create a new identity.
  - Watch the launcher status indicator transition: `Stopped` → `Starting` → `Running` (this is where v1.2.7.13's heartbeat protocol kicks in; if it gets stuck on `Stopped` after pc2-node is clearly running per `ps`, you've hit the heartbeat regression — do not tag).
- [ ] **2.3** Verify the launcher transitions to `Running` within 60 seconds and shows transport label = `WireGuard` or `AmneziaWG` (not `ActiveProxy`). ActiveProxy is the fallback when WG / AWG fail to set up — the v1.2.7.8 / v1.2.7.10 / v1.2.7.11 hot-patch cycle was entirely about getting fresh Mac installs to land on WG/AWG instead of ActiveProxy.
  - **If transport shows ActiveProxy**: check the launcher's pc2-node log for `[BinaryManager]`, `[WireGuardService]`, `[AmneziaWGService]`, `[setupPermissions]` errors. Common culprits captured by the v1.2.7.x patches: missing binaries (re-check §1.2/1.3), apostrophe-injection in `osascript` (caught by `setup-permissions-osascript.test.js` if the unit test is green per §1.1, but worth double-checking the `/etc/sudoers.d/pc2-wireguard` file got created), bash version mismatch (v1.2.7.10 bundled-bash fix).
- [ ] **2.4** Click around the GUI for ~5 minutes: open the apps shelf, click the AI chat, click one or two apps that need PC2 to be alive. Verify nothing 500s, nothing freezes the launcher.
  - **If something errors**: capture the launcher log + the pc2-node `~/.pc2/pc2-node/logs/*.log` and abort. Hot-patches are easier than rollbacks; better to delay 24h than ship a broken UX.
- [ ] **2.5** Quit + relaunch the launcher: verify the status indicator reaches `Running` again, this time within ~10 seconds (warm path, no re-permissioning).
  - **If a password prompt appears on the second launch**: that's the v1.2.7.12 regression class (`sudoers-marker.json` not being trusted). The fix is in v1.2.7.12 so this should never re-appear, but the v1.2.7.11→v1.2.7.12 lesson was "every relaunch re-prompted Sasha" — verify it stays silent.
- [ ] **2.6** Trigger an in-app update (or run `scripts/update.sh` manually on the fresh Mac) and verify the launcher status indicator does NOT get stuck on `Stopped` after the spawn-detached-respawn. v1.2.7.13's heartbeat protocol is what fixes this; if it regresses, do not tag.

## Section 3 — Supernode + IPFS cluster state

- [ ] **3.1** Both supernodes are healthy. Read-only check:
  ```bash
  ssh root@69.164.241.210 'systemctl is-active pc2-kubo pc2-ipfs-relay pc2-gateway --no-pager'
  ssh root@38.242.211.112 'systemctl is-active pc2-kubo pc2-ipfs-relay pc2-web-gateway --no-pager'
  ```
  All units should report `active`. Note the gateway unit name differs per supernode (`pc2-gateway` on InterServer, `pc2-web-gateway` on Contabo) — both are correct, do not "fix" one to match the other.
  - **If any unit is inactive**: do NOT tag. A degraded supernode + fresh PC2 installs trying to bootstrap = bad day. Restore the unit first, then re-verify.
- [ ] **3.2** `pc2-ipfs-relay` RSS is stable (post-cure state). Should plateau at less than 1 GB; if it's trending toward 4 GB the v1.2.7.x memory leak has returned and the v1.2.8.x release should address it BEFORE shipping:
  ```bash
  ssh root@38.242.211.112 'systemctl show pc2-ipfs-relay -p MemoryCurrent --value'   # < 1000000000
  ssh root@69.164.241.210 'systemctl show pc2-ipfs-relay -p MemoryCurrent --value'   # < 1000000000
  ```
  - **If red**: don't tag. Apply the cure or kill-switch backstop documented in `.cursor/tasks/SUPERNODE-HEALTH-PREFLIGHT-V1280/` first.
- [ ] **3.3** `/api/ddrm/provision` returns HTTP 200 from both supernodes (Chipotle relayer + Wave 8 envelope signature):
  ```bash
  curl -fsS -o /dev/null -w "%{http_code}\n" https://69.164.241.210/api/ddrm/provision
  curl -fsS -o /dev/null -w "%{http_code}\n" https://38.242.211.112/api/ddrm/provision
  ```
  - **If anything else than 200**: the dDRM bootstrap path is broken; fresh installs can't get a usable key. Don't tag.

## Section 4 — Communications + rollback readiness

- [ ] **4.1** Release notes drafted in the GitHub release body. Format: matches recent v1.2.7.x releases — bullet list of user-facing changes, "Known issues" section, "Upgrade instructions" if anything non-trivial is needed, "Rollback" section linking to §A below.
  - **If red**: write them now. The release notes are what users see; treating them as an afterthought is how community trust erodes.
- [ ] **4.2** Community update drafted for `docs/updates/Community_Update_<date_range>.md` (or its successor location) so the next round of "what's been happening at Elacity" goes out without a 2-week scramble.
  - **If red**: at minimum draft a one-paragraph summary that can be expanded later. Don't tag-and-disappear.
- [ ] **4.3** The previous release tag still exists on the remote and the previous binaries are still downloadable. Test:
  ```bash
  PREV=$(gh release list -R Elacity/pc2.net --limit 5 --json tagName --jq '.[] | .tagName' | head -2 | tail -1)
  gh release view "$PREV" -R Elacity/pc2.net --json assets --jq '.assets | length'  # > 0
  ```
  - **If red**: the rollback path is broken. Do not tag the new release until you've confirmed the previous one is still pullable.
- [ ] **4.4** You (the tagger) are within ~4 hours of a phone / Slack you'll actually answer. Releases sometimes need follow-up within minutes of going out (see hot-patch cycle). Don't tag on a Friday evening before a long weekend, don't tag right before you fly, don't tag while in a meeting.
  - **If red**: defer until you have a window where you can fire-fight. v1.2.7.7 → v1.2.7.13 was six releases in two days because the people who could fix things were online; nine times out of ten that's what makes a bumpy release survivable.

## Section 5 — Final go / no-go

If every box above is checked, you have explicit approval:

- [ ] **5.1** From whoever owns the security boundary being changed (for releases touching dDRM / supernodes / signing, this is Irzhy + Sasha together; for purely PC2-side changes, Sasha alone).
- [ ] **5.2** From a second human who has read the diff at least at the summary level (sanity check; catches "the release notes don't match the actual change" mistakes).

Only then:

- [ ] **5.3** Create the tag with the canonical version string, annotated with the same release notes you put in the GitHub release body:
  ```bash
  git tag -a v<x.y.z.w> -m "v<x.y.z.w> — <one-line summary>"
  git push origin v<x.y.z.w>
  ```
- [ ] **5.4** Push to `main` if the release branch is being merged into main as part of the cut (typically yes for our release pattern; verify with whoever decided the cut strategy).
- [ ] **5.5** Watch the launcher publish CI run trigger off the tag. Wait for it to fully complete (signing + notarisation on macOS takes ~10-15 min). Verify the launcher binary appears in the GitHub release that the launcher CI produces.

---

## Appendix A — Rollback procedure (one-pager)

See the full procedure in `ROLLBACK-PROCEDURE.md` next to this file. TL;DR:

1. Identify the previous known-good tag (typically `v<x.y.z.w-1>`).
2. Mark the new GitHub release as "draft" (un-publish without deleting), so the launcher's auto-updater stops offering it to users.
3. Re-publish the previous release to the top of the list (GitHub auto-updater picks the latest non-draft release).
4. Communicate the rollback within ~30 minutes via the same channel(s) used to announce the release.

Hot-patches are usually faster than rollbacks if the broken release has been live <12 h and the bug is well-understood. Use the rollback procedure only when the hot-patch effort would exceed ~4 hours wall-clock or the bug affects user data (e.g. wallet corruption, key leakage).

---

## Appendix B — What we learned from v1.2.7.7 → v1.2.7.13

These are the specific failure modes that this checklist exists to catch. Mostly captured by the smoke test now (`Smoke test (build + boot)` + `setup-permissions-osascript.test.js` regression unit + V2 binary execution smoke + V2 boot-time SLA gate as of 2026-05-19), but the manual gates in §2 are the safety net for everything else.

| Release | What broke | Caught by which checklist item | Now also caught earlier by |
|---|---|---|---|
| v1.2.7.8 | Build OOM, missing `pc2-binaries-v1` release, transport label "ActiveProxy" on fresh Mac | §1.1 (smoke), §1.2-1.3 (assets), §2.3 (manual transport check) | V2 #1 binary execution smoke (catches missing/wrong-arch linux-x64 binaries before any human sees ActiveProxy on a fresh install) |
| v1.2.7.9 | Sudoers entries not auto-installed on fresh Mac | §2.2 (full install flow) | (still manual — privileged install can't be CI-tested) |
| v1.2.7.10 | Bundled bash missing, `WG_QUICK_USERSPACE_IMPLEMENTATION` env var not propagating through sudo | §2.3 (transport check), §2.5 (relaunch silent) | V2 #1 catches missing `bash-darwin-*` if it lands as a missing/corrupt asset; sudo-env propagation still §2.3 manual |
| v1.2.7.11 | `awg` binary never bundled, bundled bin dir not on PATH inside sudo'd script, **osascript apostrophe-injection in setupMacOS** | §1.1 (smoke includes osascript unit test), §2.2 (full install flow) | V2 #1 explicitly verifies `awg-linux-x64` runs (ELF + `--version`); macOS `awg-darwin-arm64` still §2.3 manual |
| v1.2.7.12 | Password prompt on every relaunch (sudoers-marker.json missing), `awg-quick` calling `wg setconf` instead of `awg setconf` | §2.5 (relaunch silent) | (still manual — sudoers state on real Mac) |
| v1.2.7.13 | Launcher status indicator stuck on `Stopped` after pc2-node respawn | §2.6 (in-app update doesn't desync indicator) | V2 #3 boot-time SLA catches init-time regressions that don't crash but make UX awful (warns >60 s, fails >90 s) |

If you find a new failure mode in production that this checklist doesn't catch, add a checklist item for it in the appropriate section **before** tagging the fix. The point of the checklist is that it grows monotonically — every hot-patch cycle teaches us something the checklist didn't ask about.

**CI-coverage philosophy** (added 2026-05-19): cheap automated gates (CI) catch the bug class on the linux-x64 build runner; the macOS-specific bug surface is still validated only by §2 manual install. We do not (and largely cannot) replace §2 with CI — privileged install + real-network behaviour + Apple notarization need a real Mac. CI's job is to fail fast on bugs that don't need a Mac to surface.

---

## Document metadata

- **Source of truth**: this file.
- **Owners**: release engineering (Sasha primary, anyone else can run the checks).
- **Last updated**: see git log on this file.
- **Tied to**: `.cursor/tasks/RELEASE-ENGINEERING-V1280/RELEASE-ENGINEERING-V1280.md` (Phase 6).
- **CI complement**: `.github/workflows/smoke-test.yml` covers §1.1, §1.2, §1.3 mechanically.
