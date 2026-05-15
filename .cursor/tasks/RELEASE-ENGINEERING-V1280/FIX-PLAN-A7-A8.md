# Fix Plan: A-7 (esbuild) + A-8 (canvas)

**Status**: Plan-only (no code changes). Author this evening 2026-05-15.  
**Target execution**: Saturday morning 2026-05-16 on `feat/t-1-telemetry-and-support`.  
**Hard constraints (carried from RELEASE-ENGINEERING-V1280)**:
- No changes to product source under `pc2-node/src/`, `src/gui/`, `packages/`, `deploy/`
- No new install-time deps for end users (devDeps + CI infra only)
- No touch of `V1.2.8.0` Chipotle Relayer code
- Branch protection target: `Smoke test summary` green before tagging the Mac launcher next Wed/Thu

This doc is the ONLY input the executing session needs. Read it top-to-bottom, pick the option per issue, apply the diffs verbatim, push.

---

## TL;DR

| Issue | Recommended | Why | Diff size |
|---|---|---|---|
| A-7 esbuild hoist mismatch | Reorder installs + `npm rebuild` insurance | Workflow-only, zero lockfile churn, defends against npm's known install-order bug | ~10 lines of YAML |
| A-8 canvas typecheck fail | Install system libs + force-include optional | Workflow-only, makes optional-dep actually optional like the source code already assumes | ~8 lines of YAML per platform |

Both fixes live entirely in `.github/workflows/smoke-test.yml`. Combined diff is ~25 lines. **Risk of breaking anything else: very low** — these changes only affect CI behaviour, not anything users or developers run.

A fallback plan for each issue is included below in case the recommended option doesn't deliver green on the first try.

---

## A-7: esbuild hoist mismatch

### The real symptom

Linux CI fails `pc2-node` install with:

```
npm error path /home/runner/work/pc2.net/pc2.net/pc2-node/node_modules/esbuild
npm error command sh -c node install.js
npm error Error: Expected "0.27.2" but got "0.25.12"
```

### Workspace state (verified tonight)

Three esbuild versions exist across the monorepo lockfiles:

| Pulled by | Locked version | Where it lives |
|---|---|---|
| `vite@7.2.6` (transitive via particle-auth / src/gui / test-apps) | `^0.25.0` → `0.25.12` | root `node_modules/esbuild` |
| `packages/access` direct devDep `esbuild: ^0.24.0` | `0.24.2` | `packages/access/node_modules/esbuild` (nested) |
| `tsx@4.21.0` in pc2-node | `~0.27.0` → `0.27.2` | `pc2-node/node_modules/esbuild` |

Each esbuild has matching `@esbuild/<platform>` optional deps at the same version pinned next to it.

### Local Mac state (verified tonight)

- `node_modules/esbuild@0.25.12` + `node_modules/@esbuild/darwin-arm64@0.25.12` ✓
- `pc2-node/node_modules/esbuild@0.27.2` + `pc2-node/node_modules/@esbuild/darwin-arm64@0.27.2` ✓
- All four packages present on disk with matching versions — typecheck works locally and Mac CI passes the install step too.

### Why Linux CI fails but Mac CI doesn't

This is a known npm quirk where parallel postinstall scripts race the platform-specific binary install:

1. npm starts unpacking many packages in parallel during `npm ci`.
2. `pc2-node/node_modules/esbuild/install.js` (esbuild's postinstall) runs the moment esbuild's own files are extracted, BEFORE its sibling `@esbuild/linux-x64@0.27.2` may have finished unpacking next door.
3. `install.js` does `require.resolve('@esbuild/linux-x64')` from `pc2-node/node_modules/esbuild/install.js`. Node walks up: `pc2-node/node_modules/@esbuild/linux-x64` not there yet → walks further up → finds `node_modules/@esbuild/linux-x64@0.25.12` (from the root install that ran moments earlier).
4. The 0.25.12 binary reports `--version` → 0.25.12. esbuild 0.27.2's install.js was expecting 0.27.2 → throws.

Mac doesn't trip it because either (a) the optional-dep unpack order happens to win the race, or (b) the darwin-arm64 platform tarball is smaller / faster to extract. Pure luck of timing on the runner.

This is **not a lockfile bug**. The lockfiles are correct. It's an npm install-order race that surfaces on slower runners.

### Why this is worth fixing in the smoke test (and not just "rerun")

The exact same race produces silent breakage in real-world fresh installs on:
- Slow developer laptops / spinning-disk Macs
- Container builds (Docker layer caching makes installs even more parallel)
- Linux production hosts running our binaries
This is one of the bug families v1.2.7.x patched in production. CI catching it now means we don't ship it.

### Recommended fix: Option A1 — install order + rebuild insurance

Change `.github/workflows/smoke-test.yml`, "Install root + pc2-node dependencies" step:

```yaml
- name: Install root + pc2-node dependencies
  env:
    NODE_OPTIONS: '--max-old-space-size=4096'
    NPM_CONFIG_LEGACY_PEER_DEPS: 'true'
  run: |
    set -euo pipefail

    # Install pc2-node FIRST so its esbuild + @esbuild/<platform> land
    # together before the root install can plant a different esbuild
    # version higher in the tree. Avoids the npm parallel-postinstall
    # race documented in FIX-PLAN-A7-A8.md.
    echo "::group::pc2-node npm ci"
    (cd pc2-node && npm ci --no-audit --no-fund)
    echo "::endgroup::"

    # Rebuild esbuild in pc2-node defensively. Re-runs install.js once
    # all platform deps are guaranteed to be on disk. Costs ~3 s, kills
    # the race entirely.
    echo "::group::pc2-node npm rebuild esbuild (race-guard)"
    (cd pc2-node && npm rebuild esbuild --no-audit --no-fund)
    echo "::endgroup::"

    echo "::group::Root npm install"
    npm install --no-audit --no-fund --legacy-peer-deps
    echo "::endgroup::"
```

**What changes**: install order flips, plus a `npm rebuild esbuild` belt-and-braces step.

**What stays the same**: no lockfile changes, no package.json changes, no product code changes.

**Risk**:
- Negligible. Both installs are still independent npm operations on independent project roots. Flipping order is supported by npm.
- Worst case: build:pc2 chain (particle-auth → src/gui → pc2-node) needs root deps before pc2-node deps. We verified that's NOT the case — pc2-node only depends on pc2-node/node_modules at install time. The build chain order is `cd packages/particle-auth && build`, `cd src/gui && build`, `cd pc2-node && build` — each runs after BOTH installs complete.

**Validation**: push, watch the smoke run, expect Linux to get past the install step. If it doesn't, fall back to Option A2.

### Fallback: Option A2 — pin esbuild to single version via `overrides`

If A1 doesn't work because the race repeats on another package, add npm `overrides` to root `package.json` to force a single esbuild version everywhere:

```json
{
  "overrides": {
    "esbuild": "0.27.2",
    "@esbuild/aix-ppc64": "0.27.2",
    "@esbuild/android-arm": "0.27.2",
    "@esbuild/android-arm64": "0.27.2",
    "@esbuild/android-x64": "0.27.2",
    "@esbuild/darwin-arm64": "0.27.2",
    "@esbuild/darwin-x64": "0.27.2",
    "@esbuild/freebsd-arm64": "0.27.2",
    "@esbuild/freebsd-x64": "0.27.2",
    "@esbuild/linux-arm": "0.27.2",
    "@esbuild/linux-arm64": "0.27.2",
    "@esbuild/linux-ia32": "0.27.2",
    "@esbuild/linux-loong64": "0.27.2",
    "@esbuild/linux-mips64el": "0.27.2",
    "@esbuild/linux-ppc64": "0.27.2",
    "@esbuild/linux-riscv64": "0.27.2",
    "@esbuild/linux-s390x": "0.27.2",
    "@esbuild/linux-x64": "0.27.2",
    "@esbuild/netbsd-arm64": "0.27.2",
    "@esbuild/netbsd-x64": "0.27.2",
    "@esbuild/openbsd-arm64": "0.27.2",
    "@esbuild/openbsd-x64": "0.27.2",
    "@esbuild/sunos-x64": "0.27.2",
    "@esbuild/win32-arm64": "0.27.2",
    "@esbuild/win32-ia32": "0.27.2",
    "@esbuild/win32-x64": "0.27.2"
  }
}
```

**Risk**: forcing vite@7 to use esbuild 0.27 when its declared range is `^0.25` is technically out-of-range. vite's build behaviour may differ on esbuild 0.27 (it was tested against 0.25 by vite's maintainers). Realistic outcome: vite works fine because esbuild's public API is stable across these versions, but there's a non-zero chance of a vite plugin regression.

**Use only if A1 doesn't fix it.** A1 has zero lockfile/overrides risk; A2 spreads a CI fix into a runtime-affecting change.

### Out of scope for tomorrow (track for the optimisation pass)

- Collapsing the workspace to a single esbuild version would shrink install time by ~15s and drop ~80 MB from node_modules. Worth it. Goes into `OPTIMISATION-AND-REFACTORING-2026-05` Phase 2 once the Mac release is shipped.

---

## A-8: canvas typecheck fails on clean CI install

### The real symptom

Mac CI (after Linux install was fixed) fails the `tsc --noEmit` step with:

```
src/api/storage.ts(3381,34): error TS2307: Cannot find module 'canvas'
                                              or its corresponding type declarations.
src/api/storage.ts(3484,34): error TS2307: Cannot find module 'canvas'
                                              or its corresponding type declarations.
src/storage/thumbnail.ts(35,25): error TS2307: Cannot find module 'canvas'
                                              or its corresponding type declarations.
```

### What's actually happening

`canvas@2.11.2` is declared in `pc2-node/package.json` `optionalDependencies` (line 89-91). The npm lockfile records it as `"optional": true`. When the runner ran `npm ci`, npm tried to install canvas:

1. canvas 2.x has a postinstall (`node-pre-gyp install --fallback-to-build`) that:
   a. Tries to download a prebuilt binary from canvas's GitHub releases for the runner's Node ABI version.
   b. Falls back to building from source (requires Cairo / Pango / libpng / libjpeg / giflib / librsvg2 + a C++ toolchain).
2. CI runners DON'T have the Cairo etc. system libs installed, AND the Node 20.x ABI prebuilts for canvas@2.11.2 may not match the runner's exact Node patch version.
3. canvas's install fails silently (because it's an optional dep, npm doesn't error — just skips).
4. `pc2-node/node_modules/canvas` is never created.
5. TypeScript hits `await import('canvas')` in `storage.ts` and `thumbnail.ts`, can't resolve the module, fails with TS2307.

**The source code uses `await import('canvas')` inside try/catch** — confirmed at:
- `pc2-node/src/storage/thumbnail.ts:35`
- `pc2-node/src/api/storage.ts:3381`
- `pc2-node/src/api/storage.ts:3484`

So at RUNTIME canvas is genuinely optional. Just at COMPILE TIME, TypeScript needs the module to exist on disk to resolve types.

**Locally, canvas IS installed at `pc2-node/node_modules/canvas/` (verified tonight). The package ships its own `types/` directory — no `@types/canvas` needed.** This is why typecheck passes on Mac developers' machines but fails on clean CI: developers have the system libs (typically via Homebrew install of node-canvas's deps over time) or have downloaded a working prebuilt at some point.

### Recommended fix: Option B1 — install canvas system libs in CI

Add a platform-specific system-libs install step to `.github/workflows/smoke-test.yml` BEFORE the npm-install step:

```yaml
# Insert immediately AFTER the "Cache npm + yarn caches" step and
# BEFORE the "Environment baseline" step.
- name: Install canvas system libs (Linux)
  if: runner.os == 'Linux'
  run: |
    set -euo pipefail
    echo "::group::apt-get canvas deps"
    sudo apt-get update
    sudo apt-get install -y \
      build-essential \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      libpixman-1-dev \
      pkg-config
    echo "::endgroup::"

- name: Install canvas system libs (macOS)
  if: runner.os == 'macOS'
  run: |
    set -euo pipefail
    echo "::group::brew canvas deps"
    # macos-latest already ships pkg-config + cairo via the Homebrew
    # default formulae list, but we install explicitly so a runner-image
    # change doesn't silently break us. brew is idempotent.
    brew install pkg-config cairo pango libpng jpeg giflib librsvg
    echo "::endgroup::"
```

This makes canvas's build-from-source path succeed during `npm ci`, populating `pc2-node/node_modules/canvas/` with the types file TypeScript needs.

**What changes**: 2 new steps in the workflow, conditioned on `runner.os`.

**What stays the same**: no product code, no lockfile, no package.json changes. canvas remains an `optionalDependencies` entry — end-users WITHOUT the system libs still get the existing graceful try/catch behaviour at runtime.

**Cost**:
- Linux apt-get adds ~30-45 s
- macOS brew install adds ~60-90 s (slower because brew has more overhead)
- Total smoke-test runtime impact: ~+90 s on Mac job (the longest pole). Still well under 25-min timeout.

**Risk**:
- Negligible. apt-get and brew are stable. The packages we're installing are well-known and don't pin specific versions (we let the package manager pick).
- Worst case: canvas's prebuilt download succeeds anyway and our system libs aren't used. Harmless.

### Fallback: Option B2 — force-include optional and surface failures loudly

If canvas STILL fails to install after B1 (e.g. binding.gyp fails to compile against the runner's Node 20.x headers), force npm to error out instead of silently skipping:

```yaml
(cd pc2-node && npm ci --no-audit --no-fund --include=optional)
# Then after install:
test -d pc2-node/node_modules/canvas \
  || { echo "::error::canvas (optional) failed to install — typecheck will fail. See FIX-PLAN-A7-A8.md A-8 fallback."; exit 1; }
```

The `--include=optional` flag is the npm 7+ replacement for `--no-optional false`. Combined with the post-install check, this turns canvas's silent skip into a loud, explicit CI failure with a pointer to this doc.

**Use only if B1 doesn't fully fix it.** B2 alone (without system libs) just makes the failure noisier — it doesn't solve it.

### Out of scope for tomorrow (track for the optimisation pass)

The codebase has BOTH `canvas@2.11.2` (in optionalDependencies) and `@napi-rs/canvas@0.1.84` (transitive, prebuilt-only). `@napi-rs/canvas` has zero system-lib requirements and ships prebuilds for every platform. **Migrating the three `import('canvas')` sites to `@napi-rs/canvas` would let us:**
- Drop the `canvas@2.11.2` optional dep entirely
- Drop the system-libs install step from CI
- Cut ~12 MB and ~10 s off every install
- Eliminate the future drift-class entirely

**This is a product code change**, so explicitly NOT for tomorrow. Filed as a candidate for `OPTIMISATION-AND-REFACTORING-2026-05` Phase 2. Worth doing before the Linux/Windows launchers ship, but not blocking the Mac launcher next Wed/Thu.

---

## Combined diff sketch for Saturday morning

Single commit, single file (`.github/workflows/smoke-test.yml`), ~25-line net diff. Commit message:

```
ci(smoke-test): fix esbuild hoist race + canvas system libs

A-7 (esbuild): flip pc2-node install before root install + npm rebuild
esbuild insurance. Workflow-only fix; resolves the npm parallel-
postinstall race documented in FIX-PLAN-A7-A8.md. No lockfile changes.

A-8 (canvas): install Cairo/Pango family system libs on Linux + macOS
before npm install. canvas@2.11.2 then builds-from-source successfully
during npm ci, populating its types/ dir so tsc --noEmit can resolve
'canvas' imports. canvas remains optional for end users; system libs
are CI-only. No product code changes.

Closes A-7 + A-8 in RELEASE-ENGINEERING-V1280. Expected CI runtime
impact: ~+90 s on Mac job (still under timeout). Mac job target time
~10-12 min; Linux job ~6-8 min.
```

## Rollout / verification steps (Saturday morning)

1. Apply both diffs in a single commit on `feat/t-1-telemetry-and-support`.
2. Push and watch the smoke run.
3. Expected results:
   - `pc2-binaries-v1 asset integrity` — ✓ pass (already green from yesterday)
   - `Build + typecheck (linux-x64)` — ✓ pass at install (A-1 fix), ✓ pass at typecheck (A-8 fix), then continues through build + unit tests
   - `Build + typecheck (darwin-arm64)` — ✓ pass through end-to-end
   - `Smoke test summary` — ✓ green
4. If linux-x64 or darwin-arm64 still fails:
   - Read the failing step's log carefully — the new failure is informative
   - If esbuild error persists → apply Option A2 (`overrides`)
   - If canvas error persists → apply Option B2 (force-include + assert) and investigate canvas's build log
   - Each fallback ships as a separate commit so the rollback path stays clean

## Open questions to answer Saturday before pushing

- [ ] Has anyone else pushed to `feat/t-1-telemetry-and-support` overnight? If yes, rebase or merge their work first
- [ ] Does the `pc2-binaries-v1` release asset count still equal 23? (Run `gh release view pc2-binaries-v1 -R Elacity/pc2.net --json assets --jq '.assets | length'` before applying)
- [ ] Any Irzhy / Sasha movement on the V1.2.8.0 Chipotle work that would change the build chain? (Read git log on `main` and Irzhy's branch)

## Time budget

| Step | Wall-clock |
|---|---|
| Apply both diffs | 5 min |
| First CI run (expected green) | 10-12 min (Mac is the pole) |
| If fallback needed: investigation + 2nd push | 15-25 min |
| Doc + commit + push | 5 min |
| **Total upper bound** | **45 min** |

This means we can have green smoke CI on the branch by ~10am Saturday with confidence, well in time to fold in A-3 (Windows + Linux ARM matrix expansion) and A-5 (pre-tag checklist) over the weekend, leaving Monday/Tuesday for any actual product issues that surface.
