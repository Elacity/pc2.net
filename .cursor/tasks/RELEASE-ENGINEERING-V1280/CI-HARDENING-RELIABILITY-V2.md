# Task: CI-HARDENING-RELIABILITY-V2 — binary execution + memory ceiling + boot SLA

**Task ID**: `CI-HARDENING-RELIABILITY-V2`
**Created**: 2026-05-19
**Status**: **InProgress** — executing now
**Priority**: Medium (release-engineering reliability layer 2; pure CI work, zero source-code touch)
**Predecessors**: `CI-HARDENING-A4-D1`, `DOCKERFILE-REHAB-V1280`
**Shipping gate**: None — `.github/workflows/` only

---

## Why this exists

After `CI-HARDENING-A4-D1` and `DOCKERFILE-REHAB-V1280` shipped, the smoke-test workflow now has 3 required gates (build-and-typecheck × 4 platforms, release-assets-integrity, docker-smoke). Honest gap analysis shows 3 reliability bug classes still uncovered:

1. **Published binary corruption / wrong-arch uploads** — `release-assets-integrity` confirms the 23 expected assets *exist*, but never proves they actually *execute*. This is the v1.2.7.8 bug class one level deeper.

2. **Memory-ceiling regression on RPi-class hardware** — boot-smoke proves pc2-node starts on runners with 7-16GB RAM. RPi 4 has 2-4-8GB total (and ~1-1.5GB available after OS + sidecars). An init-time memory regression that's invisible to current CI would silently break the RPi audience.

3. **Boot-time regression (slow but eventually responds)** — current boot-smoke allows up to 120s for `/api/health` to respond. Observed cold-boot is 50-70s. A regression that pushes boot to 110s would still pass — but real-world cold-start (slower disk, less RAM, busier system) could take 3-5 min, which is a real UX problem.

---

## Scope

### #1 — Binary execution smoke

Extend the `release-assets-integrity` job. After the asset-count check, download the linux-x64 variants of `wireguard-go`, `amneziawg-go`, and `sing-box` from the `pc2-binaries-v1` GitHub release, chmod +x them, and execute `--version` (or `version` for sing-box). If any binary fails to execute, the job fails.

**What this catches**: corrupted uploads, wrong-arch binaries silently shipped, dynamic linker mismatches in published artifacts.

**Cost**: ~30 s per binary download + execution. Total ~2 min added to `release-assets-integrity`.

**Why linux-x64 only**: the CI runner architecture. Testing macOS-arm64 would require a separate macOS job (~5 min runner time). Diminishing returns — if the linux variant works, the macOS variant is much more likely to also work, and the macOS launcher is end-to-end tested via 48-72h soak anyway.

### #2 — Memory-ceiling smoke

Add a new step to `build-and-typecheck` job, gated to `matrix.label == 'linux-x64'`. After the standard boot-smoke succeeds, run boot-smoke a second time with `NODE_OPTIONS='--max-old-space-size=512'` (limits V8 heap to 512MB — leaves room within RPi 4's 2GB minimum after OS + IPFS + sidecars).

If `/api/health` responds successfully under 512MB heap, we have CI proof that pc2-node is RPi-4-viable.

**What this catches**: V8 heap regressions, init-time allocation spikes, memory-leak-on-startup bugs.

**Cost**: ~60-90 s (second boot + poll on linux-x64 only). Total ~90 s added to one matrix entry.

**Why linux-x64 only**: same arch family as RPi (linux-arm64 would be more authentic but ARM runners are slower; the memory-ceiling regression is arch-independent so x64 is sufficient signal).

**Why 512MB**: pragmatic floor. RPi 4 has 2GB minimum, ~1.5GB available after OS overhead, ~1GB available after IPFS daemon. 512MB heap leaves headroom for the rest of the Node process (stack, code, native modules). Tightening to 256MB would create false alarms; loosening to 1024MB would lose RPi signal.

### #3 — Boot-time SLA gate

Modify the existing boot-smoke step to track elapsed time at success. After the successful curl breaks the poll loop, evaluate:

- `BOOT_TIME_S > 90`: emit `::error::` and exit 1 (SLA violation, fails the gate)
- `60 < BOOT_TIME_S <= 90`: emit `::warning::` (approaching SLA ceiling)
- `BOOT_TIME_S <= 60`: silent success

**What this catches**: init-time regressions that don't crash but make UX awful; gradual creep of "boot got 5s slower per release".

**Cost**: zero additional runtime — pure assertion logic on already-measured data.

**Why 90s**: observed cold-boot 50-70s on warm GHA runners. 90s = 28% safety margin above observed worst case. Real-world devices (slower disk, busier system, RPi-class) could take 1.3-1.5× CI time → 90s in CI ≈ 120-135s in field. Anything beyond that is a UX cliff.

**Why warn at 60s**: gives early signal of a creeping regression before it crosses the hard SLA.

---

## What this is NOT

- NOT testing on a real RPi (separate decision; field validation, not CI)
- NOT adding macOS or Windows variants of binary execution check (diminishing return; macOS soak covers it)
- NOT adding GUI / frontend smoke (already covered by manual pre-tag soak; adding CI doubles surface for marginal gain)
- NOT touching source code (CI-only changes)

## Acceptance criteria

- [ ] `.github/workflows/smoke-test.yml` adds 3 gates per implementation plan
- [ ] All 3 new gates green on first run (or triaged + fixed if not)
- [ ] `pre-existing` required gates remain green (no regression)
- [ ] CI runtime increase < 3 min total
- [ ] Inline doc on each new gate explaining bug class + thresholds

---

## Execution log

(To be filled during execution.)
