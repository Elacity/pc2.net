# Changelog

## PC2 - Personal Cloud Computer

> PC2 is a sovereign fork of Puter, focused on self-hosted decentralized computing with blockchain authentication.

---

## [v1.2.8.0] - 2026-05-DD - Operator self-observability (Health & Support app + local telemetry) + resource-limit bug fix + release-engineering hardening

> **Scope (DRAFT — pending tag)**: A focused operator-observability release. Ships a new built-in **Health & Support** app that lets operators run a one-click self-test on their PC2 node, view local telemetry (p50/p95/p99 latencies of critical paths), and compose a sanitised support report they can choose to send manually. Fixes a latent bug where resource-limit settings configured via API (`storage_limit`, `max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`) were silently ignored on read. Plus a substantial under-the-hood investment in CI reliability and code structure to make future releases safer — none of which changes user-facing behaviour but all of which catches a class of bugs before they reach users. **No new outbound telemetry of any kind** — all observability is local-only; operators see their own data, nothing leaves the machine without an explicit user-initiated send. Branch: [`feat/t-1-telemetry-and-support`](https://github.com/Elacity/pc2.net/tree/feat/t-1-telemetry-and-support). 56 commits since v1.2.7.14; full pre-tag checklist at [`.cursor/tasks/RELEASE-ENGINEERING-V1280/PRE-TAG-CHECKLIST.md`](.cursor/tasks/RELEASE-ENGINEERING-V1280/PRE-TAG-CHECKLIST.md).

### New built-in app — Health & Support (`elacity-health`)

A new system-role app that auto-installs on first launch after upgrade. Users can find it in the start menu under "Health & Support". Three things in one window:

1. **One-click health check** — runs the full `/api/diagnose` battery (database, transports, IPFS cluster, Lit/Chipotle config, supernode reachability, WASM runtimes, update channel) and shows green/yellow/red per system. Useful when something feels off — and useful to attach to a support thread when reporting a bug. Implemented in [`pc2-node/data/test-apps/elacity-health/`](pc2-node/data/test-apps/elacity-health/).
2. **Live aggregate telemetry** — local p50/p95/p99 latencies of critical operations (currently: Chipotle CEK recovery, IPFS cluster pin forward, IPFS cluster pin query) computed from a JS-side aggregator over a local samples table. Shows operators where their node is slow without needing a stopwatch.
3. **Support report composer** — preview / copy / download a structured JSON bundle describing the operator's environment (PC2 version, OS, hardware class, last diagnose result, recent telemetry summary). **Wallet addresses are hashed (SHA-256, 16-hex-char truncated), home paths are stripped, no IPs or content keys ever included.** The report is never sent automatically — operators copy or download it themselves and attach to a support thread. A persistent consent banner at the top of the app reinforces this.

### T-1A — Self-Diagnostic probes (extended)

Four new live probes added to [`pc2-node/src/api/diagnose.ts`](pc2-node/src/api/diagnose.ts):

- **`probeLitConfig`** — reads the Lit network config and does a HEAD-only check (no quota burn against the Lit relay).
- **`probeAllSupernodes`** — checks reachability of both supernodes' Kubo + Gateway endpoints in parallel.
- **`probeWasmCrates`** — static `WebAssembly.compile()` on the 7 bundled WASM crates (no instantiate, no execute) so a corrupted crate is surfaced fast.
- **`probeUpdateChannel`** — queries the GitHub releases API to verify the auto-updater can see the channel.

All probes hard-bounded by `SHELL_TIMEOUT_MS`, fail-soft (any single probe failure doesn't crash the diagnose run), and sanitised through the shared redactor. Also adds an ESM `__dirname` polyfill that caught a latent runtime `ReferenceError` the type-checker had missed. The `resolvePc2Version()` helper now walks several `package.json` paths so desktop installs (which start PC2 via `node dist/index.js`, not `npm`) report the real version instead of `"unknown"`.

### T-1B — Local-only support report API

Two new authenticated endpoints in [`pc2-node/src/api/support.ts`](pc2-node/src/api/support.ts):

- **`POST /api/support/report/preview`** — builds + returns the report bundle the operator would send. Zero network egress; the response IS the report. Operator decides what to do with it.
- **`GET /api/support/report/policy`** — returns the policy document the report-bundle builder applies: which fields are always included, which are togglable, which are never included.

Backed by a curated pure function in [`pc2-node/src/services/support/buildReportBundle.ts`](pc2-node/src/services/support/buildReportBundle.ts) with schema-versioned output. The shared redactor lives in [`pc2-node/src/utils/redact.ts`](pc2-node/src/utils/redact.ts) and is also reused by the diagnose endpoint.

### T-1C — Local metric registry (instrumented hot paths)

A local Counter/Histogram primitive in [`pc2-node/src/utils/metrics.ts`](pc2-node/src/utils/metrics.ts), backed by two new SQLite tables (migration 33 in [`pc2-node/src/storage/schema.sql`](pc2-node/src/storage/schema.sql)). Defence-in-depth bounds on every recorder: max 8 tags per metric, 64-char tag values, 80-char metric names, name-pattern enforcement, kill-switch via `PC2_TELEMETRY_DISABLED=true` environment variable, and **fail-soft** on every recording path (a metrics failure can never affect the operation being measured).

Two high-value paths instrumented out of the gate:

- **Chipotle CEK recovery** ([`pc2-node/src/api/chipotle-client.ts`](pc2-node/src/api/chipotle-client.ts)) — `chipotle.cek_recovery` counter + `chipotle.cek_recovery_ms` histogram on `recoverNonMediaCEK`, `recoverMediaCEKEnvelope`, `encryptWithLitAction`. Allow-listed error reason tags keep cardinality bounded.
- **IPFS cluster pin forwarding** ([`pc2-node/src/services/clusterPin.ts`](pc2-node/src/services/clusterPin.ts)) — `cluster_pin.forward` and `cluster_pin.query` counters + `_ms` histograms. `classifyHttpStatus()` + `classifyNetworkError()` bucket response codes and error messages into low-cardinality reason tags.

A new authenticated `GET /api/metrics/snapshot` endpoint in [`pc2-node/src/api/metrics.ts`](pc2-node/src/api/metrics.ts) returns the current counter/histogram state; the Health & Support app polls this to render the aggregate telemetry card.

**Privacy posture (anonymous-by-design)**: tags MUST NOT contain wallets, IPs, KIDs, asset titles, channel names, or filesystem paths. Allowed tag values are short structural strings only: `outcome=success`, `kind=media`, `tier=1`, `reason=key_invalid`, etc. The `sanitise()` redactor catches wallets, DIDs, bearer tokens, mnemonics, and PEM blocks at multiple layers; `redactHomePath` strips `$HOME`; `hashWallet` returns SHA-256 truncated to the first 16 hex chars (never raw).

### Bug fix — resource-limit settings now correctly applied

PC2 has had API endpoints for several releases allowing operators to configure their node's resource limits:

- `storage_limit` (e.g. `"auto"`, `"100GB"`, `"unlimited"`) — `POST /api/storage/limit` and `POST /api/resources/limits`
- `max_concurrent_wasm` (1-32 parallel WASM executions) — `POST /api/resources/limits`
- `max_memory_mb` (auto, 256, 512, 1024, 2048, 4096, 8192, or custom ≥128) — `POST /api/resources/limits`
- `wasm_timeout_ms` (1000-300000 ms) — `POST /api/resources/limits`

**The bug**: writes to these endpoints persisted to the local database correctly, but on every subsequent read (e.g. `GET /api/info`, `GET /api/resources`), the values were silently ignored — the system fell back to `config.json` defaults or hardcoded defaults. The "Database settings override config file" comment in [`pc2-node/src/api/resources.ts`](pc2-node/src/api/resources.ts) and [`pc2-node/src/api/supernode.ts`](pc2-node/src/api/supernode.ts) was inaccurate.

**Root cause**: a pre-existing latent bug where the helper used to obtain the database handle (`getDb()`) returned `(global as any).db`, which was never set anywhere in the codebase. All `db?.getSetting(...)` calls in those files returned `undefined`, masked by the optional-chaining fallthrough.

**Fix**: the broken helpers were removed and replaced with explicit `req.app.locals.db` lookups (the established Express pattern already used elsewhere in pc2-node).

**What this means for existing users**:
- If you've never used these endpoints to set non-default values: **no change in behaviour**. Defaults continue to apply.
- If you previously set a non-default value via the API and were surprised it didn't seem to take effect — that wasn't your imagination; the fix makes your saved setting work correctly on the next request.
- One caveat: WASM compute settings (`max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`) are read at WASM-runtime initialisation, which happens once at PC2 startup. To apply newly-set compute limits after upgrade, **restart PC2 once**. Storage settings take effect on the next API request, no restart required.

### Operator — automated supernode deploy script

New [`scripts/deploy-supernode.sh`](scripts/deploy-supernode.sh) — single command to deploy a supernode (Kubo + IPFS relay + web gateway), with built-in smoke tests that abort the deploy if any of the three services fails to come up healthy. Replaces the previous manual `scp` + `ssh` + `systemctl restart` sequence. Operator-facing only.

### Architecture — `(global as any).X` ambient-state cleanup

As preparation for capsule-based deployment on the ElastOS Runtime, the few `(global as any).X` properties pc2-node used to share state across modules were audited and cleaned up:

- `(global as any).pc2Config` — vestigial mutable cache. Removed entirely; readers now use the canonical `req.app.locals.config` and `req.app.locals.db`.
- `(global as any).db` — latent bug, fixed (see above).
- `(global as any).__filesystem` — retained as a deliberate defensive fallback for the Drivers tool-execution critical path; both sites are now explicitly commented to document the intent.
- `(global as any).ipfsStorage` — consumer purged from `api/supernode.ts`; the single-write at bootstrap ([`pc2-node/src/index.ts`](pc2-node/src/index.ts)) is preserved as a legitimate startup-time exposure for non-Express callers.

These are internal refactors with no API contract change. They reduce architectural coupling and prepare pc2-node modules for eventual migration into the Runtime's capsule architecture.

### Under-the-hood — release engineering & CI reliability

A meaningful investment in test infrastructure and code quality, all invisible to users but high leverage for everyone who develops or operates PC2:

- **Cross-platform CI matrix** now spans **6 required gates**: build-and-typecheck on linux-x64 / linux-arm64 / darwin-arm64 / windows-x64, plus release-assets-integrity (catches the v1.2.7.8-class bug where the wrong asset count was published), plus docker-smoke (builds + runs the production Dockerfile, hits `/api/health` through a mapped port). Workflow: [`.github/workflows/smoke-test.yml`](.github/workflows/smoke-test.yml).
- **Three V2 reliability gates** added on top: binary execution smoke (catches corrupted/wrong-arch published wireguard / amneziawg / wg / awg binaries — one level deeper than the asset-count gate); boot-time SLA assertion (warns at >60 s cold boot, fails at >90 s); and a third memory-ceiling gate that was attempted, calibrated twice, and dropped because the signal was too fragile to ship as a required gate — that work was spun out to [`PC2-MEMORY-PROFILE-RPI`](.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PC2-MEMORY-PROFILE-RPI.md) for proper source-code memory profiling. Tracker: [`CI-HARDENING-RELIABILITY-V2.md`](.cursor/tasks/RELEASE-ENGINEERING-V1280/CI-HARDENING-RELIABILITY-V2.md).
- **Dockerfile rehabilitation**: the docker-smoke gate immediately surfaced **6 critical bugs** in [`pc2-node/Dockerfile`](pc2-node/Dockerfile) — old Go version, missing config copy, missing WASM apps, two missing native bindings (sharp + @napi-rs/canvas), missing deployment templates. All fixed; docker-smoke now stays green run-after-run. Tracker: [`DOCKERFILE-REHAB-V1280.md`](.cursor/tasks/RELEASE-ENGINEERING-V1280/DOCKERFILE-REHAB-V1280.md).
- **Capsule-readiness audit**: walked [`pc2-node/src`](pc2-node/src/) module-by-module, scored 160 / 163 functional modules (98.2%) for capsule-runtime portability. Found two mechanical-pattern blockers (concrete-class imports, ambient global singletons) which then drove the Phase 2-A through 2-D-helpers refactors. Reports: [`CAPSULE_READINESS_REPORT.md`](.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/CAPSULE_READINESS_REPORT.md), [`AUDIT_EXECUTIVE_SUMMARY.md`](.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/AUDIT_EXECUTIVE_SUMMARY.md).
- **Phase 2 refactors** (six waves: types extraction, concrete-class → `import type`, route-layer singleton purge, sibling-orchestrator type-only imports, ambient `global.*` cleanup, deep WASM consumer threading) — together they eliminated the audit's mechanical blockers and surfaced the latent db-settings bug above as a side effect. None changes any API contract.
- **Pre-tag checklist + rollback procedure**: [`PRE-TAG-CHECKLIST.md`](.cursor/tasks/RELEASE-ENGINEERING-V1280/PRE-TAG-CHECKLIST.md) and [`ROLLBACK-PROCEDURE.md`](.cursor/tasks/RELEASE-ENGINEERING-V1280/ROLLBACK-PROCEDURE.md), the latter validated with a real dry-run.

### What this release does NOT do

Honest about what's deferred so operators aren't surprised:

- **No outbound telemetry of any kind.** The Health & Support app shows the operator their own data; nothing leaves the machine without the operator explicitly choosing to copy or download a support report and attach it manually.
- **No opt-in dialog and no daily flusher.** Both deferred to v1.2.9.0. The metrics primitives + report API exist in v1.2.8.0 so the UX and infrastructure can shake out without committing to a fleet-wide ingest model yet.
- **No supernode ingest endpoint.** Also v1.2.9.0.
- **No Rust / WASM crate-internal panic capture.** Deferred to v1.2.9.0 Phase R.
- **No new dDRM / playback / marketplace features.** This release is intentionally focused on observability + reliability; user-facing dDRM and AI feature work resumes in v1.2.9.x.

### Operator-validated

T-1 instrumentation was validated end-to-end on Sasha's local node 2026-05-07 ~13:09 ET — first real telemetry datum captured: `chipotle.cek_recovery{kind=non_media, outcome=success}=1, p50=2362ms`. The metrics primitive, the SQLite schema, the snapshot endpoint, and the live aggregate telemetry card all confirmed working on a real PC2 install.

### Compatibility

- No API contract changes.
- No config file changes required.
- No data migration required beyond the automatic SQLite migration 33 (creates `metrics_counters` + `metrics_histogram_samples` tables; takes <100 ms on first run after upgrade).
- The Health & Support app auto-installs via the system-role manifest path on first launch after upgrade.
- The resource-limit bug fix begins applying immediately on upgrade — saved settings start taking effect on the next request (storage) or next restart (compute).

---

## [v1.2.7.14] - 2026-05-07 - dDRM viewer + market UX patches (PDF DPR, zoom, 3D feed, creator label, channel icon)

> **Scope**: Five user-visible bug fixes surfaced from testing feedback. Pure patch release — no protocol or schema changes, no companion launcher version required. Full release notes at [GitHub releases v1.2.7.14](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.14).

### dDRM viewer

- **PDFs sharp on 4K / HiDPI displays** — [`pc2-node/data/test-apps/ddrm-viewer/viewer.js`](pc2-node/data/test-apps/ddrm-viewer/viewer.js). Render bitmap at `scale × devicePixelRatio` (capped 3× for memory bounds) instead of a fixed 1.5×; CSS keeps `width: 100%` with an explicit `aspect-ratio` so the canvas doesn't cause layout jumps while loading.
- **Zoom-in no longer scrolls the page downward** — `setZoom()` now recenters the viewport on every level change (`oldLevel > 0`) instead of only when `oldLevel !== 1`, so zooming in from 100% behaves the same as zooming in from any other level.

### Elacity Market

- **3D tab no longer flickers under narrow filters** — [`pc2-node/data/test-apps/elacity-market/app.js`](pc2-node/data/test-apps/elacity-market/app.js). When the API returns an empty page, mark the feed exhausted (`browseTotal = browseOffset`) so `IntersectionObserver` doesn't keep re-firing through `setupFeedObserver` recreations and showing skeleton loaders in a loop.
- **"Creator" label no longer appears under every channel name** — [`pc2-node/data/test-apps/elacity-market/api.js`](pc2-node/data/test-apps/elacity-market/api.js). Removed `props.labelType` as a fallback for `channelName` in `catalogItemToNft` — `labelType` is a metadata role tag (always literal "Creator" for assets minted via elacity-creator) and was leaking into the channel-name slot for any channel without a cached display name. The downstream `GENERIC_NAMES` handler resolves the real channel name on-chain via `fetchChannelName`.
- **Channel icons now render on feed cards** — cards now enrich missing channel info via `getOwnerAvatar(ch)` (the same resolver the channels directory has used successfully) instead of a brittle ad-hoc `imageURL || image` pattern that produced unresolvable URLs for some channels.

### Compatibility

Full backward compat. Patch-level app version bumps: `ddrm-viewer` 0.1.0 → 0.1.1, `elacity-market` 0.2.0 → 0.2.1. pc2-node service binary and launcher unchanged from v1.2.7.13. Diffstat: 7 files / +111 / −12 (commit `52682c4fb`).

---

## [v1.2.7.13] - 2026-05-06 - Launcher status indicator stays in sync after restart/update/respawn

> **Scope**: Closes the launcher↔pc2-node status indicator desync that hit users every time pc2-node respawned without the launcher's `spawn()` call — macOS in-app update, macOS manual restart, Linux/Jetson terminal `pm2 restart pc2`, or crash + pm2/systemd auto-restart. In all four scenarios the launcher's tracked PID was dead but pc2-node was happily running — status was stuck on "Stopped" until the user manually quit + relaunched the launcher. Replaces PID-tracking with a heartbeat-file protocol. Full release notes at [GitHub releases v1.2.7.13](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.13).

### How it works

pc2-node writes `<pc2NodeDir>/data/runtime/heartbeat.json` every 2 s with `{ schema, pid, version, port, healthy, startedAt, lastUpdated, lastRestartReason }`. The launcher polls this file (1 s interval) as its single source of truth for "is pc2-node alive?" instead of tracking the child PID.

| Heartbeat state | Launcher status |
|---|---|
| File missing | `stopped` (clean exit) |
| File >5 s stale | `error` (likely crashed) |
| File fresh, `healthy: false` | `stopping` |
| File fresh, `healthy: true` | `running` |

### Bonus: out-of-band restart trigger

Anyone with write access to `<pc2NodeDir>/data/runtime/restart-requested.flag` can request a clean respawn — Web GUI, `scripts/update.sh`, external supervisor, or a one-off shell. pc2-node's flag watcher (`fs.watch` + 5 s polling fallback) consumes the flag, optionally honours a `reason: <tag>` line, calls `spawnDetachedRespawn`, and exits. The new pc2-node writes a fresh heartbeat with the new PID + version within ~2 s.

```bash
echo "reason: my-trigger" > ~/.pc2/pc2-node/data/runtime/restart-requested.flag
```

### Files

- [`pc2-node/src/utils/runtime-heartbeat.ts`](pc2-node/src/utils/runtime-heartbeat.ts) (NEW, 333 LOC) — `RuntimeHeartbeat` class with heartbeat writer + flag watcher
- [`pc2-node/src/index.ts`](pc2-node/src/index.ts) (+60 LOC) — wires heartbeat into `server.listen` + graceful shutdown
- [`docs/wiki/Technical/RUNTIME_HEARTBEAT_PROTOCOL.md`](docs/wiki/Technical/RUNTIME_HEARTBEAT_PROTOCOL.md) (NEW, 303 LOC) — protocol contract for launcher integrators

### Companion launcher release

Requires `Elacity/elastos-launcher` **v1.2.7+** to see the desync fix in the launcher UI. Schema-versioned (`pc2.heartbeat.v1`): new launcher + old pc2-node falls through to existing `/health` polling; old launcher + new pc2-node ignores the file. No coordinated rollout required.

---

## [v1.2.7.12] - 2026-05-06 - Stealth mode actually works (sudoers marker + awg-quick subcmd rewrite)

> **Scope**: Two regressions fixed from v1.2.7.11. The launcher sudoers re-prompt loop on every relaunch + AmneziaWG still failing at `wg setconf` with `Line unrecognized: 'Jc=5'`. Full release notes at [GitHub releases v1.2.7.12](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.12).

### 1. Sudoers re-prompt loop on every launcher restart

- **Root cause**: `checkWireGuardPermissions` was using `sudo -n -l <wg-quick> up <args>` as the primary "is sudo configured?" probe. On macOS this returns non-zero for non-root users in some keychain / sudoers configurations even when NOPASSWD rules match. Every startup logged `Passwordless sudo not configured` and re-fired the install path.
- **Fix** — [`pc2-node/src/services/wireguard/setupPermissions.ts`](pc2-node/src/services/wireguard/setupPermissions.ts): SHA-256 marker file at `<wgDir>/sudoers-marker.json` written on successful install. Primary probe now reads the marker, hashes the entry we'd write today, compares — if equal AND the sudoers file still exists, trust without invoking sudo. `sudo -n -l` probe is now the secondary fallback (kept for first-install + sudoers-upgrade flows).

### 2. AmneziaWG `wg setconf` rejecting Jc=5 etc.

- **Root cause**: `amnezia-vpn/amneziawg-tools/src/wg-quick/darwin.bash` (master, Jan 2026) was rebased from upstream wireguard-tools but the maintainer forgot to swap `wg` → `awg`. So `awg-quick` on macOS literally called `wg setconf` / `wg show` / `wg showconf` at 7 sites — and plain `wg` rejects the AmneziaWG obfuscation keys (Jc, Jmin, Jmax, S1-S4, H1-H4). Only darwin was broken; `linux.bash` was already correct.
- **Fix**: rewrite `wg <subcmd>` → `awg <subcmd>` for `setconf|show|showconf|syncconf|addconf` in the on-disk `awg-quick`. Build-time: [`pc2-node/scripts/fetch-binaries.sh`](pc2-node/scripts/fetch-binaries.sh) `inject_awg_subcommand_patches` (sed -E with `(^|[^a-zA-Z])wg <subcmd>` anchor so we never clobber `wg-quick`, `awg`, `wireguard-go`). Runtime: [`pc2-node/src/utils/binary-manager.ts`](pc2-node/src/utils/binary-manager.ts) `patchAwgQuickSubcommands` — same regex shape, idempotent via `# PC2_AWG_SUBCMD_PATCHED_v1` marker. Critical because `BinaryManager` skips re-download when the file exists, so the new build alone wouldn't reach existing v1.2.7.10/.11 installs.

### Backward compat

Pre-v1.2.7.12 sudoers files: existing entry content unchanged (paths/rules/SETENV all match), so v1.2.7.11 → v1.2.7.12 upgrade should NOT trigger a new password prompt for users with a working v1.2.7.11 install. Pre-v1.2.7.12 unpatched `awg-quick` scripts get the runtime patch on first launch under v1.2.7.12 (logged `awg-quick patched: wg <subcmd> → awg <subcmd>`). Linux kernel-mode users untouched (linux.bash already used `awg`). Windows untouched.

### `pc2-binaries-v1` release assets unchanged

The runtime patcher fixes existing users in-place, so `publish-pc2-binaries.yml` was NOT re-run. The 22 release assets from v1.2.7.11 still apply.

---

## [v1.2.7.11] - 2026-05-06 - Stealth mode end-to-end (AmneziaWG + VLESS Reality finally work)

> **Scope**: Closes three intertwined bugs that were keeping AmneziaWG (stealth mode) and VLESS Reality from working on fresh-Mac installs even after v1.2.7.10. Also closes two leftover `setupPermissions.ts` bugs from v1.2.7.10. Full release notes at [GitHub releases v1.2.7.11](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.11).

### The three intertwined bugs

1. **`AmneziaWGService.ensureKeypair` searched the wrong directories** — used the older `findTool()` helper which only checked `/usr/local/bin`, `/opt/homebrew/bin`, and `which`. Never the bundled `~/.pc2/pc2-node/bin/<platform>-<arch>/` dir where v1.2.7.10's `wg` actually lives. Production logs showed `wg genkey` crashing with `wg: command not found` even with `wg` present in the bundled dir. Fixed by routing `findTool` through `findBinary` (which always checks bundled dir first). [`pc2-node/src/services/wireguard/AmneziaWGService.ts`](pc2-node/src/services/wireguard/AmneziaWGService.ts).

2. **`awg` (the AmneziaWG fork of `wg`) was never bundled** — `awg-quick.darwin/linux` invokes `awg setconf` to install AmneziaWG obfuscation parameters (Jc/Jmin/Jmax/S1-S4/H1-H4/optional I1) — plain `wg` rejects those keys. Fixed by building `awg` from `amnezia-vpn/amneziawg-tools` alongside `wg` in `fetch-binaries.sh` and `.github/workflows/publish-pc2-binaries.yml`. Asset count: `pc2-binaries-v1` 18 → 22 (added `awg-darwin-arm64`, `awg-darwin-x64`, `awg-linux-x64`, `awg-linux-arm64`).

3. **Bundled bin dir wasn't on `$PATH` inside the sudo'd script** — even with bundled `awg` shipped, sudo's `env_reset` + `secure_path` strips the bundled dir, so `awg-quick`'s internal `awg setconf` lookup fails. Fixed by injecting a self-locating PATH export right after the shebang in `wg-quick` and `awg-quick`:
   ```bash
   # PC2_PATH_SELF_LOCATION_v1
   export PATH="$(cd "$(dirname "$0")" && pwd):$PATH"
   ```
   This runs *inside* the script's bash process, after sudo has dropped env_reset, so `secure_path` no longer applies. Patched at build time in `fetch-binaries.sh` and at runtime in `BinaryManager.patchTransportScriptPathSelfLocation()` — idempotent, so existing v1.2.7.10 installs upgrade in-place without needing a new bundle download.

### Two leftover setupPermissions.ts bugs from v1.2.7.10

- **osascript install dialog never appeared** on apostrophe-rich sudoers comment text. Previous code interpolated entry directly into `osascript -e 'do shell script "echo \"...\" > ..."'` and any embedded `'` terminated the outer single-quoted shell argument before osascript could run. Fix: write entry to `mktemp` file as the user (mode 0600), then have osascript run a fixed-shape `cp + chmod + rm` against known paths — no user-controlled string in the shell command anymore. Regression test: [`pc2-node/tests/unit/setup-permissions-osascript.test.js`](pc2-node/tests/unit/setup-permissions-osascript.test.js).
- **`sudo -n <wg-quick> --version` probe always returned non-zero** because `wg-quick` has no `--version` flag. Probe always reported "not configured" → spurious osascript install attempts and misleading WARN logs on every relaunch. Fix: `sudo -n -l <wg-quick> up <args>` — exits 0 silently when a NOPASSWD rule matches and prints the matched rule (parseable for the SETENV flag).

### Diffstat

7 files / +455 / −99. Files: `AmneziaWGService.ts`, `setupPermissions.ts`, `binary-manager.ts`, `fetch-binaries.sh`, `.github/workflows/publish-pc2-binaries.yml`, two `package.json` version bumps.

---

## [v1.2.7.10] - 2026-05-05 - Fresh-Mac WireGuard fix (bundled bash + sudo env-var)

> **Scope**: Closes the last two gaps stopping fresh-Mac (no Homebrew) users from getting working WireGuard / AmneziaWG. Linux + Windows users untouched. Full release notes at [GitHub releases v1.2.7.10](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.10).

### 1. Bundled bash 5.2.21 (macOS only)

Apple's `/bin/bash` is frozen at 3.2 (2007) for GPL3 licensing reasons. `wg-quick` and `awg-quick` refuse to run on bash <4 (`BASH_VERSINFO[0] >= 4` is a hard precondition). Until v1.2.7.10, every fresh Mac without Homebrew silently fell back to ActiveProxy because the WG cascade died on `wg-quick: Version mismatch: bash 3 detected, when bash 4+ required`.

Bundled bash is built from upstream source (statically against libSystem only, no Homebrew or third-party deps), code-signed + notarised in CI alongside the other transport binaries, and downloaded by `BinaryManager` into `~/.pc2/pc2-node/bin/<platform>-<arch>/`. After download, [`patchMacOSScriptShebangs()`](pc2-node/src/utils/binary-manager.ts) rewrites the `#!` line of bundled `wg-quick`/`awg-quick` to point at it. GPL3 source: <https://ftp.gnu.org/gnu/bash/bash-5.2.21.tar.gz>.

### 2. `WG_QUICK_USERSPACE_IMPLEMENTATION` env var via `sudo -E`

`wg-quick.darwin` and `awg-quick` internally invoke `${WG_QUICK_USERSPACE_IMPLEMENTATION:-wireguard-go}` to find the userspace VPN engine. Under sudo, `secure_path=/usr/bin:/bin:/usr/sbin:/sbin` and our bundled `wireguard-go` / `amneziawg-go` becomes invisible. Even with bash fixed, the next line of wg-quick was failing with `wireguard-go: command not found`.

Fix: [`WireGuardService.detectMode()`](pc2-node/src/services/wireguard/WireGuardService.ts) macOS branch now resolves `wgGoBinPath`. `wgQuickCmd()` / `awgQuickCmd()` pass it via env var with `sudo -E`. Sudoers rules upgraded from `NOPASSWD:` to `NOPASSWD:SETENV:` so the env var survives.

### Cross-platform impact

| Platform | What changes |
|---|---|
| **Fresh Mac (no Homebrew)** | Full fix. WireGuard cascade now reaches WG instead of stopping at ActiveProxy. |
| **Mac with Homebrew** | `validateFound` resolves `/opt/homebrew/bin/bash`, no bundled-bash download. One osascript popup to upgrade pre-v1.2.7.10 sudoers entry to SETENV form. After that, identical UX. |
| **Linux VPS (kernel WG)** | One terminal sudo prompt during `update.sh` to upgrade sudoers entry. Plain `sudo wg-quick up` works on both old and new rule forms — functionally identical runtime behaviour. |
| **Linux Jetson (userspace fallback)** | One terminal prompt; gets fixed (was arguably broken on v1.2.7.9 because `sudo -E` rejects without setenv permission). |
| **Windows** | Zero changes. Bash spec gated to `platforms: ['darwin']`; sudoers logic skipped. WireGuard runs as SYSTEM service. |

### Upgrade notes

Anyone on v1.2.7.9 sees the macOS osascript "Allow PC2 to install transport permissions?" dialog one more time on first connect — the new sudoers entry has the `SETENV:` flag the v1.2.7.9 entry was missing. After this one-time upgrade, the dialog never appears again. If declined, pc2 falls back to ActiveProxy (same as today). Full commit: `6467475ed`. Binaries: <https://github.com/Elacity/pc2.net/releases/tag/pc2-binaries-v1> (18 assets).

---

## [v1.2.7.9] - 2026-05-05 - Auto-install macOS + Linux WireGuard/AmneziaWG permissions

> **Scope**: Hot-patch closing the silent-fallback-to-ActiveProxy issue Mac users hit on v1.2.7.0–v1.2.7.8 even after the binary distribution fix in v1.2.7.8 landed. Linux gets the same treatment via `update.sh`. Full release notes at [GitHub releases v1.2.7.9](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.9).

### Root cause

`wg-quick` (and `awg-quick`) on macOS+Linux need root to create the `utun` device and write routes. Both services call `sudo wg-quick up <conf>` / `sudo awg-quick up <conf>` internally. Since pc2-node runs headless under pm2 there's no TTY and no askpass program, so sudo failed immediately with "a terminal is required to read the password". The cascade silently fell to ActiveProxy, and the only visible signal was the orange "Active Proxy" badge in the cloud dropdown. The binaries were just half the story; the auth path was the other half.

### Fix — two complementary paths

**Path A: Runtime auto-prompt (macOS only)** — fires on first WireGuard connect attempt when sudoers is missing. Uses `osascript ... with administrator privileges` to show a native macOS auth dialog (Touch ID supported, system-modal). Covers launcher users who never run `update.sh` directly.

**Path B: Update-time install (macOS + Linux)** — [`scripts/update.sh`](scripts/update.sh) Step 11 invokes the new [`scripts/setup-transport-permissions.sh`](scripts/setup-transport-permissions.sh) helper after the backend compile, before pm2 restart. Runs from the user's terminal where sudo can prompt cleanly. Idempotent, visudo-validated, skips when headless. Covers terminal-update users on both platforms (Mac, Ubuntu, Jetson, Debian-based VPS).

Both paths install the SAME sudoers entry — single auth = both WireGuard AND AmneziaWG unlocked. VLESS Reality unblocks transitively because sing-box runs userspace and just tunnels through AWG. The grant is **scoped to ONLY the bundled binaries**, not general sudo. Removing `/etc/sudoers.d/pc2-wireguard` revokes the grant cleanly; pc2 will re-prompt on next launch.

### Behaviour matrix

| Update path | Platform | What happens |
|---|---|---|
| `bash scripts/update.sh` | macOS | Step 11 prompts in terminal during update. One password entry. |
| `bash scripts/update.sh` | Linux (Jetson, VPS, Ubuntu) | Step 11 prompts in terminal during update. One password entry. |
| Elastos Launcher | macOS | Update completes silently. On next pc2-node start, runtime osascript dialog appears (~5s after launcher closes). One password entry. |
| Elastos Launcher | Linux | Rare path. Runtime fallback logs a hint pointing to manual `bash scripts/setup-transport-permissions.sh`. |
| Headless server (no TTY, no GUI) | both | Skipped with hint. ActiveProxy fallback continues to work. No regression. |

### Backward compat

Existing `/etc/sudoers.d/pc2-wireguard` files from v1.2.7.0–v1.2.7.8 are detected as incomplete by `checkWireGuardPermissions()` and overwritten in-place to add `awg-quick`. Same filename — no orphan files left behind. If user dismisses the auth dialog OR the update-time install fails, `wg-quick up` fails the same way it did pre-v1.2.7.9 and the cascade falls to ActiveProxy. No regression on the failure path.

---

## [v1.2.7.8] - 2026-05-05 - Mac transport binaries + post-update endpoint recovery + build OOM fix

> **Scope**: Community feedback hot-patch addressing three issues reported on the v1.2.7.5/v1.2.7.7 update path — silent update-script OOM on low-memory machines, post-update endpoint recovery (502 on `alm.ela.city`), and the "6/6 connected" misleading indicator that masked fallback to ActiveProxy. This is the release that first published `pc2-binaries-v1` properly — every prior fresh-Mac install since v1.2.7.0 had silently fallen to ActiveProxy because the GitHub release `BinaryManager` pointed at had never been populated. Full release notes at [GitHub releases v1.2.7.8](https://github.com/Elacity/pc2.net/releases/tag/v1.2.7.8).

### Issue 1 — Update script silently fails on low-memory machines

Webpack/rollup hit Node's default 4 GB heap during the GUI bundle build, then `npm run build:frontend || echo "skip"` swallowed the OOM as a "step skipped" message. Step 9 (`build:gui`) then died with a misleading "build failed".

- [`src/gui/package.json`](src/gui/package.json): `--max-old-space-size=4096` on `build` and `build:only`
- [`scripts/update.sh`](scripts/update.sh): presence-check on `build:frontend` script before running, so OOMs abort loudly under `set -e` instead of being conflated with "script not defined" on older revisions.

### Issue 2 — Node offline / 502 on alm.ela.city after update

`ConnectivityService.start()` was running before `UsernameService` had loaded its persisted username, so the connectivity cascade succeeded but `publicEndpoint` was never registered with the supernode. `alm.ela.city` couldn't route the request and returned 502.

- [`pc2-node/src/services/boson/ConnectivityService.ts`](pc2-node/src/services/boson/ConnectivityService.ts): 60s post-cascade endpoint freshness retry. Polls every 5s for up to 60s after `start()`. Once `UsernameService.hasUsername()` becomes true and we're connected without a public endpoint, triggers `reconnect()` to register.

### Issue 3 — macOS "6/6 connected" misleading; nodes silently fall to ActiveProxy

**Root cause**: `BinaryManager` had been pointing at a `pc2-binaries-v1` GitHub release that was **never actually published** since v1.2.7.0. Every fresh-Mac install fell to ActiveProxy because `wg`/`wg-quick`/`wireguard-go`/`amneziawg-go` couldn't be downloaded. The "6/6 connected" indicator was reporting binary detection (which optimistically counted unavailable binaries as installable later), not the active transport.

End-to-end fix:
- [`pc2-node/src/utils/binary-manager.ts`](pc2-node/src/utils/binary-manager.ts): `wg` and `wg-quick` added to `TRANSPORT_BINARIES`. SHA-256 verification against `SHASUMS256.txt` (fail-closed for hash mismatch + missing-from-manifest). `stripDarwinQuarantine()` after install so notarised binaries spawn via sudo without first-run Gatekeeper prompts.
- [`.github/workflows/publish-pc2-binaries.yml`](.github/workflows/publish-pc2-binaries.yml) (NEW): 5-job workflow that builds, signs + notarises 16 binaries (6 macOS-native get codesign + `xcrun notarytool`), generates `SHASUMS256.txt`, uploads to release. Already run 2026-05-05; all 17 assets live at <https://github.com/Elacity/pc2.net/releases/tag/pc2-binaries-v1>.
- [`pc2-node/src/api/index.ts`](pc2-node/src/api/index.ts): `/api/system-readiness` now returns `transport={active,label,degraded,preferred}` alongside the X/Y components count. `overall` demotes from `"ready"` to `"degraded"` when components are all installed but routing falls to ActiveProxy.
- [`src/gui/src/UI/UIWindowParticleLogin.js`](src/gui/src/UI/UIWindowParticleLogin.js): GUI login panel shows "Active transport: WireGuard" or "Active transport: ActiveProxy (fallback)" as a separate row. Badge dot demotes to amber when on a fallback transport.

Commit `0dfc1b592` — see `git log v1.2.7.7..v1.2.7.8` for the full diff.

---

## [v1.2.7.7] - 2026-05-04 - Launcher auto-restart + dark UI modals + channel management batch + on-chain plans/gates + name-sync architecture

> **Scope**: Combined release covering the v1.2.7.6 launcher work (auto-respawn, dark UpdateModal, diagnostic-script polish) PLUS the v1.2.7.7 channel/playback/UX/on-chain batch, PLUS the cross-app name-sync architecture and stale-signer fixes that surfaced during testing. Single tag, single GitHub release. Eight discrete bugs (A-H), three on-chain V3 contract integrations (`bulkUpdatePlans`, `configureTokenOwnershipAccess`, `subscribePlan`), and a complete data-consistency layer between `elacity-creator`, `elacity-market`, and PC2's local catalog. Hot-deployed to Sasha's PC2 across multiple iterations 2026-05-04 morning → ~21:00 UTC-4; full handover at [`docs/handover/HANDOVER_2026-05-04_V1277_TESTING_NEXT_V1280_RELAYER.md`](docs/handover/HANDOVER_2026-05-04_V1277_TESTING_NEXT_V1280_RELAYER.md).

### Launcher / system (was earmarked v1.2.7.6, folded into this release)

- **Auto-respawn after update / restart** — [`pc2-node/src/services/UpdateService.ts`](pc2-node/src/services/UpdateService.ts) + [`pc2-node/src/api/system.ts`](pc2-node/src/api/system.ts) + new [`pc2-node/src/utils/respawner.ts`](pc2-node/src/utils/respawner.ts). PC2 used to `process.exit(0)` after an in-app update and rely on the macOS Launcher's `pm2` config to relaunch — but `pm2` doesn't always pick the dead PID up cleanly on Mac, leaving users staring at "PC2 stopped" indefinitely. New `spawnDetachedRespawn(...)` writes a tiny shell script that `sleep 2 && exec node …` then exits — guaranteed restart even when the launcher misbehaves. macOS-only fast path; Linux/Windows still rely on launcher.
- **Dark mode for UpdateModal** — [`src/gui/src/UI/UIUpdateModal.js`](src/gui/src/UI/UIUpdateModal.js). Hard-coded `#fff` / `#000` everywhere → re-themed to `--bg-elevated`, `--text`, `--border`, `--primary`. All buttons now have explicit `display:inline-flex; align-items:center; line-height:1; font-family:inherit` per the [`codequality.mdc`](.cursor/rules/codequality.mdc) §17 button rule (was producing the extra-top-padding glitch in dark mode).
- **Diagnostic-script tarball** — [`scripts/pc2-diagnose.sh`](scripts/pc2-diagnose.sh) now captures launcher / pm2 state, UpdateService telemetry, recent restart attempts, IPFS cluster / Lit / Chipotle reachability, and the launcher's dark/light theme. Single tarball operators can attach to support threads.

### Bug A — DDRM file size in properties dialog

- [`src/gui/src/UI/UIWindowItemProperties.js`](src/gui/src/UI/UIWindowItemProperties.js): `.ddrm` files (the JSON descriptor pointing at the IPFS CID) were showing as `~1 KB` even when the underlying media was hundreds of MB. Reads the descriptor via `/read`, pulls `pinnedSizeBytes` (or `estimatedSizeBytes` fallback), and renders `193.5 MB (descriptor 1.2 KB)` — same enrichment `UIItem.js` already does in the file-list view. Cached per `(path, modified)` on a window-level Map. Falls back to the raw descriptor size if the read fails.

### Bug B — Video timeline "growing" during playback

- [`pc2-node/src/services/media/mpdGenerator.ts`](pc2-node/src/services/media/mpdGenerator.ts): MPD `mediaPresentationDuration` was emitted from the asset's nominal length (computed from the source MP4 header) but the SegmentTimeline was authoritative for what was actually addressable. When a slow IPFS fetch made segment N show up later than expected, the player would extend the timeline. New `computeEffectiveDuration(tracks, fallback)` sums every track's `(sumUnits / timescale)` from its actual SegmentTimeline and emits the longest seen. MPD `mediaPresentationDuration` and SegmentTimeline now agree byte-for-byte. Also removed a redundant `Math.round()` from per-segment duration that was off-by-1-ms on long videos.

### Bug C — Channel management in elacity-creator (3-part)

1. **Ownership warning banner** — `renderOwnershipBanner(channelData)` in [`pc2-node/data/test-apps/elacity-creator/app.js`](pc2-node/data/test-apps/elacity-creator/app.js) compares `channelData.creator.address` to the connected EOA + SA. Reads "Read-only — you are not the channel owner" up-front instead of letting the user fill in changes that will silently 403 on Save. Handles `creator: null` (`Channel owner unknown — saves will likely fail`).
2. **Channel images section** — merged into Profile per Bug H below; profile + cover pickers, IPFS pin (local + Elacity gateway), single Save button.
3. **Token-gating with decimals (now on-chain)** — was originally an off-chain GraphQL update; Irzhy clarified `configureTokenOwnershipAccess` is on-chain in V3. Re-implemented to call the V3 contract directly. See "On-chain plans + token-gates" below.

### Bug D — File manager defaults to list view

- [`src/gui/src/UI/UIWindow.js`](src/gui/src/UI/UIWindow.js): one-liner `options.layout = options.layout ?? window.get_explorer_layout_preference?.() ?? 'details';` (was `'icons'`). Existing user preferences still respected (the `??` chain only falls through to `'details'` when no preference exists yet).

### Bug E — Elacity Market edit-channel modal cut off

- [`pc2-node/data/test-apps/elacity-market/styles.css`](pc2-node/data/test-apps/elacity-market/styles.css): `.modal-dialog { max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }` + flexbox child sizing on header/body/footer so the body absorbs available height with `overflow-y: auto`. Tall channel-edit forms now scroll inside the modal instead of clipping at the viewport.

### Bug F — Elacity Market image upload not globally visible

- [`pc2-node/data/test-apps/elacity-market/api.js`](pc2-node/data/test-apps/elacity-market/api.js) `uploadToIpfs`: belt-and-braces upload — pin to local PC2 IPFS daemon (always reachable through user's own gateway) AND mirror to `https://ipfs.elacity.io` (Elacity gateway) so the CID is announced to the public DHT. Returns the Elacity CID when both succeed; falls back to local CID if Elacity mirror fails. Returns `ipfs://<cid>`.

### Bug G — "Update channel: not allowed to edit this channel"

- **Two-level root cause**: (1) `getElacityAuthToken` always sent `sa: smartAccountAddress` to the Elacity backend's `userLogin` mutation when one was present — the official `elacity-web/src/state/api/privateBaseQuery.ts` never sends `sa`. When we send it, the backend issues a JWT for the SA principal instead of the EOA principal. (2) `populateManageChannelSelector()` was stripping the `data-owner` attribute when copying channel options from the mint selector, so the manage flow had no idea which wallet owns each channel. Net effect: for an EOA-created channel, the JWT principal was the SA address → backend's per-mutation owner check failed → "not allowed to edit this channel".
- **Fix** in [`pc2-node/data/test-apps/elacity-creator/app.js`](pc2-node/data/test-apps/elacity-creator/app.js): new `authModeForChannelData(channelData)` helper compares `channelData.creator.address` against connected EOA / SA → returns `'eoa' | 'sa' | null`. `getElacityAuthToken(walletAddress, { authMode })` caches one JWT per mode and only includes `sa` in `userLogin` when `authMode === 'sa'`. `authedGraphQLRequest`, `updateChannelInfoOnBackend`, `updateSubscriptionPlanOnBackend` all thread `authMode` through. `saveChannelProfile` and `registerChannelWithBackend` derive the mode from the channel itself before calling. `populateManageChannelSelector` now copies `data-owner`. Every successful login prints `[Creator] Elacity auth token obtained (eoa-mode, principal=0x…)` so future regressions are obvious.

### Bug G2 — Plan/Gate save reverts with cryptic MetaMask `gasLimit` error

- **Symptom**: clicking Save on a subscription plan or token gate threw `MetaMask - RPC Error: Cannot destructure property 'gasLimit' of '(intermediate value)' as it is null` instead of opening the wallet. MetaMask masks on-chain reverts during gas estimation as exactly that error.
- **Root cause**: wallet routing in the manage flow defaulted to SA when the user has a smart account, regardless of which wallet owns the channel. `saveAddPlan` / `saveEditPlan` / `removePlan` / `saveTokenGates` all read `getChannelOwnerType(dom.assetChannel) || (hasSmartAccount() ? 'sa' : 'eoa')` — but `dom.assetChannel` is the **mint** dropdown (wrong for the manage flow), so it returned null and the fallback unconditionally picked SA. SA isn't the channel admin → contract reverts → MetaMask masks the revert.
- **Fix**: new `manageWalletChoiceOrThrow()` derives the wallet choice from `authModeForChannelData(managedChannelData)`. New `preflightOrSurfaceRevert(to, data, from, opName)` runs an `eth_call` simulation BEFORE handing the tx to MetaMask. Decodes `0x4888d31b` (`Unauthorized(channel, caller)`) into "this wallet is not authorized to modify this channel". All four save handlers wired through both helpers. Defensive: even if wallet routing was correct, pre-flight surfaces clean errors for any other revert (price=0, duration=0, malformed args).

### Bug G3 — Channel-name dropdown shows stale local-catalog name after rename

- **Symptom**: rename a channel → save succeeds → backend persists. But the channel dropdown still reads the old name, even after closing + reopening the modal.
- **Root cause**: PC2's local catalog is the data source for the channels dropdown. Local catalog is a periodic mirror of the Elacity backend — there's no patch path that pushes our save into local catalog immediately. The original `saveChannelProfile` did update the dropdown text in-memory but only when *this* save changed the name (`if (opt && nameChanged)`). If the user renamed in a previous session, then later edited only the description, the rewrite was skipped.
- **Fix**: new `syncChannelOptionLabel(channelAddress, canonicalName)` walks both `asset-channel` and `manage-channel-select` dropdowns, case-insensitively matches the option value against the address, and rewrites the label preserving the trailing `(0xabcd…)` truncation pattern. Called at the end of `showChannelManagement` (reconcile against canonical Elacity-backend name when the user opens the channel) AND at the end of `saveChannelProfile` (always runs after successful save, no `nameChanged` guard).

### Bug H — Single Save Profile button (UX rework)

- Channel Details (name, description) had its own Save Changes button; Channel Images had its own Upload & Save Images button. Two clicks for one logical record. Sasha picked option 1 of 4: merge Channel Details + Channel Images into a single **Profile** section with one **Save Profile** button. Plans + Token Gating stay per-row because each is its own on-chain transaction. Files: [`pc2-node/data/test-apps/elacity-creator/index.html`](pc2-node/data/test-apps/elacity-creator/index.html) (replaced `manage-details-section` + `manage-images-section` with single `manage-profile-section`), [`pc2-node/data/test-apps/elacity-creator/app.js`](pc2-node/data/test-apps/elacity-creator/app.js) (`saveChannelProfile` computes diffs, pins pending images to IPFS first, makes ONE `updateChannelInformation` GraphQL call with `name`, `description`, `image`, `coverImage` batched together).

### On-chain plans + token-gates (V3 contracts on Base)

- Subscription plans and token-gating rules are now written **on-chain** via the channel's `SubscriptionModule` (V3). Off-chain GraphQL mutations (`updateSubscriptionPlan`, `tokenAccess` on `updateChannelInformation`) are deprecated for these. Per Irzhy 2026-05-04: *"On-chain data are only focusing on duration and price; metadata (off-chain) are more related labels and description."*
- **ABI shape (V3, from `elacity-web/base-network-updates`)**: `bulkUpdatePlans(tuple(uint8 actionType, bytes args)[] actions)` with `PLAN_ACTION = { ADD: 1, UPDATE: 2, REMOVE: 3 }`; `configureTokenOwnershipAccess(tuple(address, uint256)[] thresholds)`; `subscribePlan(uint8 planId, bytes args)` (V3 — legacy bool recurring overload is gone); `tokenURI(uint256 tokenId)` (V3 — for plan metadata merges).
- **Plan metadata** lives off-chain on IPFS — pin a JSON `{ version, schema, name, description, attributes:[{trait_type:'Duration', value:N}], properties:{ creator } }` and pass the resulting `planURI` as the last field of the encoded `args`. Indexer reads the URI on event ingest.
- **Files**: [`pc2-node/data/test-apps/elacity-market/wallet.js`](pc2-node/data/test-apps/elacity-market/wallet.js) — V3 ABI, real `bulkUpdatePlans()` + `configureTokenAccess()` (replacing stubs), helpers `maskPlanTokenId` / `uploadJsonToIpfs` / `fetchChannelImage` / `fetchPlanMetadata` / `buildPlanMetadata` / `durationToSeconds` / `getTokenDecimals` / `encodeBulkUpdatePlans` / `prepareAction`. [`pc2-node/data/test-apps/elacity-market/app-features.js`](pc2-node/data/test-apps/elacity-market/app-features.js) — `walletChoiceForChannel` helper, plan-row Remove + edit + add wired through to `Wallet.bulkUpdatePlans`. [`pc2-node/data/test-apps/elacity-creator/app.js`](pc2-node/data/test-apps/elacity-creator/app.js) — same pattern, `saveAddPlan` / `saveEditPlan` / `removePlan` / `saveTokenGates` rewritten.
- **Legacy plan IDs**: existing plans use string IDs like `plan_1777921474969` from the old off-chain system. New `isOnChainPlanId(planId)` guard rejects these for UPDATE / REMOVE with the message *"This plan was created in legacy off-chain storage and cannot be edited on-chain. Use '+ Add Plan' to create a fresh on-chain plan instead."*

### Bug-G mirror — silent local-catalog fallback removed in elacity-market

- Same root cause as Bug G but on the elacity-market side, where the silent fallback to PC2's local catalog hid every backend rejection. Editing channel info "looked successful" but never propagated to `base.ela.city`.
- **`api.js`**: per-mode JWT cache (`tokens.eoa`, `tokens.sa`) + per-mode `signerAddresses`. `gql(query, vars, requiresAuth, opts)` accepts `opts.authMode`. `login(address, signature, sa)` derives mode from whether `sa` was passed and stores in the right slot. `isAuthenticated(mode)` is mode-aware. `updateChannelInformation` now distinguishes **auth-class errors (401/403, "not allowed to edit", "Unauthor…") which throw** from network/5xx errors which still fall back to local catalog (per the original constraint: don't drop the local-catalog fallback, just make the GraphQL path actually succeed first).
- **`wallet.js`**: `siweLogin({ authMode })` is mode-aware. Per-mode promise cache so duplicate concurrent calls coalesce. `'eoa'` omits `sa` from `userLogin` (forces EOA principal), `'sa'` requires + sends it, legacy preserves old behaviour for callers not yet wired.
- **`app-features.js`**: channel-edit save handler computes `authMode = walletChoiceForChannel(channelData)` BEFORE prompting any signature, threads through `siweLogin({ authMode })` and `updateChannelInformation(addr, input, fetchFn, { authMode })`. Throws clear "this wallet is not the creator" up-front from `walletChoiceForChannel`. Amber **Backend-vs-local divergence banner** added to Edit Channel modal — fetches canonical backend snapshot in parallel with form hydration; if any field diverges from local catalog, surfaces "Backend has X, local has Y" with prompt to save. Save handler diffs against the BACKEND snapshot (not local form values), recovering from any pre-fix corruption.

### Name-sync architecture — cross-app data consistency for renames

- Symptom Sasha hit immediately after Bug-G mirror landed: rename in market saved correctly to backend, but creator still showed the old name. PC2 local catalog (per-PC2 mirror) was shadowing canonical backend forever once it had any entry for the channel.
- **Read path (parallel + backend-prefer + lazy self-heal)**: `api.js#retrieveChannel` (channel detail page) AND `api.js#fetchChannels` / `fetchManagedChannels` (global channels grid + creator profile lists) now fire local + backend in parallel and prefer backend when both succeed. When backend differs from local on any mutable field (name / description / image / coverImage), local mirror is overwritten via `PUT /api/catalog/channel/:addr`. List paths use shared `mergeChannelLists(local, backend)` helper that preserves local-only entries (newly-created, not-yet-indexed channels) while overlaying backend's mutable fields onto entries that exist in both, plus appending backend-only entries for global discoverability.
- **Write path (write-through)**: after a successful backend save, both apps mirror canonical response to PC2's local catalog. Creator: new `mirrorChannelToLocalCatalog(addr, requestedInput, serverResponse)` helper called from `saveChannelProfile`. Market: write-through inline in `api.js#updateChannelInformation`'s success path. Every other dApp on the same PC2 sees the new value on its NEXT local-catalog read — no need to wait for the lazy self-heal.
- **Cross-PC2 propagation**: canonical Elacity backend is the global rendezvous. Other PC2 nodes that upgrade to v1.2.7.7 self-heal automatically on first read of any divergent channel. Older PC2 nodes' local mirrors keep stale names until they upgrade — but this is a per-PC2 cache issue, NEVER a backend issue. New installs always see canonical data on first read.

### Stale per-mode JWT — final blocker (verified end-to-end with Sasha)

- After the Bug-G mirror went live and the silent fallback was gone, the genuine "not allowed to edit this channel" rejection finally surfaced for what looked like a perfectly-owned channel. Root cause: tokens are cached by **mode** (`tokens.eoa`, `tokens.sa`) and rehydrated from `sessionStorage` on every page load — but they're NOT keyed by signer address. If the user previously SIWE-signed with EOA `0xAAA…` and is now connected as creator EOA `0xBBB…`, `isAuthenticated('eoa')` returns true because *some* EOA token exists, the save handler skips fresh login, and `0xAAA…`'s JWT goes to the backend.
- **Fix**: `api.js` adds `isAuthenticatedAs(mode, expectedSigner)` (true only when cached token's signer matches expected) and `getCachedSigner(mode)` (diagnostics). `wallet.js` adds `siweLogin({ authMode, force: true })` to skip the "already authenticated" short-circuit when callers detected staleness. `app-features.js` channel-edit save handler computes `expectedSigner = channelData.creator.address` and uses `isAuthenticatedAs` to gate the SIWE skip. On staleness: `siweLogin({ authMode, force: true })` → fresh JWT bound to currently-connected wallet. Logs `expectedSigner` and `cachedSigner` so future divergence is immediately diagnosable. Sasha confirmed end-to-end working 2026-05-04 20:38 UTC-4.

### Batched plan management — market parity with creator

- Market's manage-plans UX was the OLD per-row, per-transaction model (one MetaMask popup per change). Creator already had the batched model. Made market match. `openManagePlansModal` rewritten as a single inline modal with a footer-pinned "Save changes (1 transaction) / Discard" bar. Per-row Edit / Remove buttons mark rows as pending; Add Plan inserts a new pending row. Commit collects all pending actions into a single `bulkUpdatePlans([…])` call.
- Removed: `openAddPlanModal` + `openEditPlanModal` (replaced by inline pending-row editing).
- Polish: indexer-poll after commit (`pollChannelForPlanCount`); pre-flight `eth_call` on `bulkUpdatePlans` (clean errors instead of MetaMask `gasLimit` riddle); responsive CSS (column headers + `data-label` row labels for narrow viewports, lighter footer background per Sasha's UX feedback).

### Channel-image preview reliability (creator)

- Profile + cover image previews in the Channel Edit modal showed "Image unreachable" or stayed blank, while the same images rendered fine in market. Three layered root causes: (1) backend's `imageURL` field returned malformed `https://ipfs.ela.city/ipfs/ipfs://bafk…` — doubled `ipfs://` 404'd. (2) CID-recognition regex required `bafy…` prefix; modern raw-leaves `bafk…` CIDs were rejected. (3) preview `<img>` was inside a flexbox container that collapsed it to 0×0 even when the network fetch succeeded.
- **Fix**: `resolveIpfsCandidates(url)` extracts CID (Qm / bafy / bafk) from anywhere in the input string and emits ordered candidates `[localPC2Gateway, publicElacityGateway, malformedURLPassthrough]`. `setManageImagePreview(slotId, urlOrDataUrl)` builds an `<img>` with `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:2` (forces real rendered size regardless of parent layout). `<img>.onerror` walks the candidate list. If all fail, renders diagnostic block listing every URL tried so future failures are debuggable from a screenshot. `loadManageImages` flips field priority — prefers `channelData.image` (canonical CID) over `channelData.imageURL` (potentially malformed gateway URL).

### Plans-disappearing-after-save (creator)

- After a successful `bulkUpdatePlans` transaction, creator's manage-plans UI showed an empty list and prompted "+ Add Plan", as if no plans existed. Market's subscribe modal correctly showed all the new plans. Creator was reading plans solely from the Elacity backend's `channel.plans` field, which lags the indexer 5–15s and sometimes returns empty immediately after a write. Market always read directly from the contract.
- **Fix**: ported the on-chain read pattern. New `fetchPlansFromContract(channelAddr)` uses `getNumberOfPlans()` + `getPlan(planId)` against the channel's `SubscriptionModule`. New `mergePlansWithMetadata(onChainPlans, offChainPlans)` overlays the backend's label/description metadata onto the on-chain plan list (on-chain authoritative for planId / price / duration; off-chain authoritative for human labels). `openManageChannel` and `commitPendingPlans` both use this merged view.

### Build / lint / version

- `package.json` and `pc2-node/package.json` bumped to `1.2.7.7`.
- `pc2-node/frontend/index.html` — `bundle.min.js?v=1.2.6` cache-buster bumped to `?v=1.2.7.7` so existing browsers fetch the rebuilt GUI bundle (the dark UpdateModal fix lives in there). Without this, in-app update users would have continued seeing the old white-on-white modal.
- `pc2-node/frontend/bundle.min.js` — rebuilt with the GUI changes (UIUpdateModal, UIWindow, UIWindowItemProperties).
- All hot-deployed test-app cache-busters bumped to their final values (creator `app.js?v=3.3.5-catalog-mirror`; market `api.js?v=41-stale-signer`, `wallet.js?v=26-force-siwe`, `app.js?v=62-sub-modal`, `app-features.js?v=51-stale-signer`).
- New file: `pc2-node/src/utils/respawner.ts`. New task dirs (kept untracked until their respective releases): `.cursor/tasks/V1.2.7.8-ON-CHAIN-PLANS-AND-GATES/` (status: Merged into v1.2.7.7), `.cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/` (status: Proposed, Irzhy-approved).
- No schema changes, no migration bump (still at `CURRENT_VERSION = 32` from v1.2.7.2).
- Existing v1.2.7.5 launchers will pick this up via the in-app `Update PC2` button (UpdateService 4-segment compareVersions handles `1.2.7.7 > 1.2.7.5` correctly).

### Roadmap (v1.2.8.0+)

- **v1.2.8.0 — Chipotle supernode relayer** — supernode-side authenticated relayer for Lit Action requests; tightens the trust boundary so PC2 nodes no longer hold credentials directly. Design approved by Irzhy 2026-05-04.
- **DRY consolidation of inline V3 ABIs** — across `wallet.js` / `app.js` / `app-features.js`. Cross-app static-route blocks `_shared/abis` module today; deferred to v1.3.
- **Wire `authMode` through market's manage-plans flow** — currently only the channel-edit modal is mode-aware. Manage-plans path uses legacy default and works correctly because plans are on-chain (backend JWT only matters for off-chain metadata). Tighten in v1.3.
- **Demote diagnostic `console.log` lines** added during the v1.2.7.7 auth/sync work to `if (DEBUG)` once the architecture has been live for a release cycle.

---

## [v1.2.7.5] - 2026-05-04 - Log hygiene + Earnings RPC discipline + Firefox/VPS reach + WireGuard readiness fix

> **Scope**: seven targeted fixes triaged from a community feedback batch (Sasha, EverlastingOS, Brave/Firefox testers) plus one new operator-facing doc. Zero behavioural change to the happy path; every fix is either a noise reduction, a wasted-RPC removal, a misleading-status correction, or a friendlier error in a previously cryptic edge-case. Goal is to make `tail -F ~/Library/Logs/ElastOS/main.log` actually scannable and stop fresh-Mac users seeing the readiness panel report transports as "missing" when they're installed-and-ready.

### Fix 1 — Throttle "no relay-circuit addresses" warning (1× per 5 min)

- The bootstrap healthcheck in [`pc2-node/src/storage/ipfs.ts`](pc2-node/src/storage/ipfs.ts) runs every 30 s. On NATed nodes that never get a libp2p relay reservation, it was emitting `[WARN] [ipfs] Connected peers exist but no relay circuit addresses are advertised` ~720 times per day, drowning real signal in `Library/Logs/ElastOS/main.log`. Added a `lastRelayWarnAt: number = 0` instance field; warn fires at most once per 5 min while the relay-circuit count remains zero. On recovery (count > 0), the throttle resets and the next degradation re-warns immediately. Suppressed cycles emit a `log.debug` so anyone running with `LOG_LEVEL=debug` still sees the per-30s heartbeat.
- Net effect: ~0.99% reduction in steady-state warn volume for NATed nodes (288 warns/day → 1-2 warns/day) without losing the signal that a configuration change is needed.

### Fix 2 — Skip `0x0` operatives upfront in Earnings (no RPC, no log)

- Both Earnings loops in [`pc2-node/src/api/index.ts`](pc2-node/src/api/index.ts) iterate over operative addresses pulled from the catalog. Some catalog rows have `operative_address = 0x0000000000000000000000000000000000000000` — these represent assets where on-chain operative deployment failed or is still pending. Every call to `balanceOf(0x0, 2)` reverts at the contract level and burns 4 RPC calls (3 retries + initial), 800 ms of wall-clock, and 4 lines of warn output per skipped operative per Earnings poll.
- Added a top-of-route `ZERO_ADDRESS` constant. Filter it out in both the multi-channel `chAssets` filter (line ~1043) and the single-channel `operativeSet` map construction (line ~1115). Pre-RPC skip → zero retries, zero rotation, zero log noise.
- Verified against Sasha's `[Earnings] balanceOf failed for 0x0000000000000000000000000000000000000000 after retries, skipping` log spam — that exact line is now impossible to emit.

### Fix 3 — Earnings: per-operative warn → debug, soft-TTL partial cache (5 s)

- Real-operative RPC failures are still possible (public Base RPC has flaky periods). Previously the per-operative warn was fired on every miss and the partial response wasn't cached at all — so the next 30s poll re-ran the full operativeSet against the same flaky RPC. Two-line fix:
  1. Demoted per-operative warn at line ~1187 to `log.debug` (still visible at `LOG_LEVEL=debug`).
  2. Added `EARNINGS_PARTIAL_TTL = 5_000` next to the existing `EARNINGS_CACHE_TTL = 30_000`. Cache entries now carry a `partial: boolean` flag; the cache-hit check picks the appropriate TTL based on that flag. Single summary warn at end of route (`N operative(s) skipped due to RPC failures — caching partial result for 5s`) instead of N+1 warns.
- Net effect: at worst one warn per Earnings poll instead of one per failed operative; on flaky RPC the next 5 s of polls hit the cache instead of re-hammering. Rolling forward is safe: complete results still get the 30 s TTL.

### Fix 4 — CIDv1 → CIDv0 codec pre-check (no expected exception)

- [`pc2-node/src/api/storage.ts`](pc2-node/src/api/storage.ts) at lines ~3835 and ~3915 was calling `cidV1.toV0().toString()` inside a try/catch and warning on every miss. CIDv0 only supports the dag-pb codec (`0x70`); for raw blocks (`0x55`, common for small files like JSON metadata uploads) the conversion always throws by design. Pre-check `cidV1.code === 0x70` and demote the non-dag-pb branch to `log.debug` with a contextual message. Genuinely unexpected dag-pb conversion failures (which would indicate a real bug) still warn with the actual error text — no silent failure.
- Verified against Sasha's `[WARN] [IPFS-Elacity] CIDv1→CIDv0 conversion failed (codec=85), using v1` log line — codec 85 = `0x55` = raw, expected behaviour, no longer warns.

### Fix 5 — DHT announce: AbortError → warn (transient, with explanation)

- [`pc2-node/src/storage/ipfs.ts`](pc2-node/src/storage/ipfs.ts) `announceCID` and `announceMultipleCIDs` were emitting full `log.error('[IPFS] Failed to announce CID …', error)` for every kad-dht `provide()` timeout. Aborts are bounded by an internal libp2p timeout — they mean the DHT walk didn't finish in time, but the CID is still pinned locally and the next pin-touch / peer want-have will retry. Differentiated handling: `error.name === 'AbortError'` (or `error.code === 'ABORT_ERR'`) → `log.warn` with an explicit "transient — will retry on next pin / fetch" suffix. All other failure modes still log at error.
- Net effect: operators stop seeing scary stack-trace ERRORs for what is benign behaviour, while genuine bugs (e.g. a malformed CID or a subsystem crash) remain at error level and are easy to spot.

### Fix 6 — Secure-context detection in Elacity Player (Firefox / VPS friendly)

- The community report (EverlastingOS via Firefox, plus the implicit Brave-on-VPS scenario) was: open the player → blank screen → JS console says `crypto.subtle is undefined` and that's it. Browsers gate the Web Crypto API behind a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — `https://`, `http://localhost`, or `http://127.0.0.1`. Plain HTTP over a public IP / domain (typical when accessing PC2 on a VPS) does not qualify, regardless of browser.
- Added an inline `<script>` to [`pc2-node/data/test-apps/elacity-player/index.html`](pc2-node/data/test-apps/elacity-player/index.html) that runs **before** the React bundle. If `!window.isSecureContext` or `!window.crypto?.subtle`, it removes the `#root` div entirely (so React can't clobber the message on mount) and reveals a `#secure-context-warning` panel with three sections:
  1. "If you're on the same machine as PC2" → use `http://localhost:4200`.
  2. "If PC2 is on a remote server / VPS" → set up HTTPS via Caddy / Cloudflare Tunnel / nginx + certbot, with a link to the new doc.
  3. "Things that won't fix this" → switching browsers, updating PC2, disabling extensions (all common but useless first guesses).
- Diagnostic footer renders `isSecureContext`, `crypto.subtle` availability, and current origin so operators can paste a single line into a support thread instead of describing symptoms.
- Defence-in-depth: the detection itself is wrapped in try/catch — if it ever throws (e.g. on an unknown browser engine), it falls through to the original React bundle so we don't block users in untested environments. They get the original cryptic error, which is no worse than today.

### Fix 6b — New doc: HTTPS for self-hosted PC2

- [`docs/wiki/Technical/HTTPS_for_self_hosted.md`](docs/wiki/Technical/HTTPS_for_self_hosted.md): explains the secure-context requirement, identifies who needs to act (anyone reaching PC2 over an IP / domain that isn't localhost), and walks through three setup options end-to-end:
  - **Caddy** — auto Let's Encrypt, ~3 minutes.
  - **Cloudflare Tunnel** — no inbound ports, no certs, ideal for residential / Jetson behind NAT.
  - **nginx + certbot** — classic stack for ops who already run nginx.
- Linked from the in-app warning panel so users hit it the moment they discover the problem. Also flags the v1.2.7.6 roadmap item ("built-in HTTPS in PC2 itself") so anyone reading the doc knows the manual setup is a stop-gap, not the long-term answer.

### Fix 7 — WireGuard readiness: report installed-but-inactive as OK

- Diagnosed from Sasha's live `/api/system-readiness` output on her fresh Mac: `wireguard-go` was reported as `status: "missing"`, `detail: "No tunnel transport detected"`, with a spurious `installHint: "macOS: brew install wireguard-tools"` — even though `~/.pc2/pc2-node/bin/darwin-arm64/wireguard-go` was present and the BinaryManager log line for the boot read `[BinaryManager] All 4 transport binaries present`.
- Root cause in [`pc2-node/src/api/index.ts`](pc2-node/src/api/index.ts) at lines 279-285: the readiness check shape was `wgOk = wgStatus ? wgStatus.mode !== 'none' : !!wgBinary?.found`. When BosonService had selected an alternative transport (in this case Stealth → forced amnezia-wireguard), `wgStatus.mode` was `'none'` (correctly — no WG tunnel was active) and the binary-found path was completely ignored. Result: a healthy-and-ready WireGuard install was misreported as missing.
- New shape: `wgBinaryFound = !!wgBinary?.found`, `wgActive = !!(wgStatus && wgStatus.mode !== 'none')`, `wgOk = wgActive || wgBinaryFound`. Detail now reads `'Active (kernel mode)'` / `'Active (userspace fallback)'` when running, `'Installed (inactive — alternative transport in use)'` when present-but-idle, `'Not installed'` only when truly missing. The `brew install` hint is now only shown in the true-missing case, not the inactive case.
- Verified against Sasha's diagnostic: same input data now yields `status: "ok"`, `detail: "Installed (inactive — alternative transport in use)"`, no spurious install hint. Identical bug pattern exists for AmneziaWG (`awgStatus.available === true` shortcut ignores binary path) but Sasha's report had AWG showing healthy so the fix is scoped to WG; AWG can be addressed in a future release if anyone reports it.

### Build / lint / version

- `package.json` and `pc2-node/package.json` bumped to `1.2.7.5`.
- `npm run build:backend` clean, `npm run lint` clean.
- No schema changes, no migration bump (still at `CURRENT_VERSION = 32` from v1.2.7.2).
- Existing v1.2.6 / v1.2.7.x launchers will pick this up via the in-app `Update PC2` button (clones `origin/main` at runtime — no launcher rebuild needed).

### Roadmap (v1.2.7.6+)

- **Built-in HTTPS in PC2** — self-signed cert on first boot, optional ACME HTTP-01 when a domain is configured. Collapses the three-option reverse-proxy setup into one config flag.
- **sing-box VLESS daemon** — investigate why the Reality tunnel exits code 0 every health-probe instead of staying alive.
- **AmneziaWG readiness parity** — apply the Fix 7 logic shape to AWG if anyone reports the inverse scenario (active WG, idle AWG).
- **EverlastingOS video playback UX** — re-investigate the "took ages, said it downloaded but was still downloading" report once we have fresh playback logs from a streaming session (current logs are from a different time window).

---

## [v1.2.7.4] - 2026-05-04 - AV1 codec string + supernode dDRM hardening + build-fix for in-app updates

> **Scope**: Three independent hot-fixes folded into one ship to give Sasha's other-MacBook fresh-install test the cleanest possible target. (1) Browsers couldn't play any 10-bit AV1 video PC2 transcoded — wrong byte mask in the AV1 codec-string parser. (2) Both supernodes had been signing-and-serving a known-bad `nonMediaDecrypt` CID in their dDRM provision blob — invisible today (latent footgun), would break every PC2 the moment any future refactor unified on `chipotle-client.getActionCid()`. (3) Two untracked gitignored SDK scratch files (`src/sdk/{index,config}.ts`) were breaking `tsc` exit-code, which in turn would brick `set -e` in `scripts/update.sh` step 10 → in-app updates would silently fail for every existing PC2 node trying to roll forward.

### AV1 codec string (10-bit videos rejected by every browser)

- "Playback Error: Video codec 'av01.0.05M.14' is not supported by this browser" on every video transcoded by PC2's SVT-AV1 encoder path. The bit-depth field in the AV1 codec string was computed from the wrong 3 bits of the AV1 sequence header, producing values like 14 that no browser/MSE implementation accepts (there is no 14-bit AV1 profile). The codec string is recomputed from the init segment on every `/api/media/init`, so existing minted assets auto-heal on the next playback attempt — no re-mint needed.
- **[`pc2-node/src/services/media/mp4split.ts`](pc2-node/src/services/media/mp4split.ts)** (the hot path used by `refineCodecsFromInitSegment` at `/api/media/init`): replaced `bitDepth = ((buf[p+2] >> 1) & 0x7) + 8` with the correct extraction per the [AV1 ISOBMFF spec](https://aomediacodec.github.io/av1-isobmff/#av1codecconfigurationbox-syntax) — `high_bitdepth = (byte2 >> 6) & 0x1`, `twelve_bit = (byte2 >> 5) & 0x1`, then `bitDepth = twelveBit ? 12 : (highBitdepth ? 10 : 8)`. The previous mask was reading `chroma_subsampling_x | chroma_subsampling_y | (high bit of chroma_sample_position)` instead of bit depth — for normal 10-bit yuv420p10le encodes that's `0b110 + 8 = 14`.
- **[`pc2-node/crates/mp4-split/src/main.rs`](pc2-node/crates/mp4-split/src/main.rs)** had the identical bug in the WASM source path. Fixed for parity. Even though the JS `refineCodecsFromInitSegment` is what wins at runtime today (it overrides any WASM-emitted codec string that has a dot in it — see [`mp4split.ts:197`](pc2-node/src/services/media/mp4split.ts)), keeping the Rust source diverged from the binary would have rotted any future change that disables JS refinement. Aligned with the long-term WASM-first runtime direction.
- **WASM binary rebuilt** via [`bash pc2-node/scripts/build-wasm.sh mp4-split`](pc2-node/scripts/build-wasm.sh). New artefact at [`pc2-node/wasm-apps/mp4-split/mp4-split.wasm`](pc2-node/wasm-apps/mp4-split/mp4-split.wasm) — 121,935 bytes (was 121,927; +8 bytes from wasm-opt rounding). Capsule [`version`](pc2-node/wasm-apps/mp4-split/capsule.json) bumped `1.1.0 → 1.1.1` (patch — bugfix only, no API change). Capsule `sha256` automatically updated by the build script: `36cf790c… → 0ef9355a…`. Built with `rustc 1.94.0-nightly`, `wasm-opt -Oz` from binaryen, target `wasm32-wasip1`. Rollback path if a regression surfaces post-ship: `git checkout HEAD~1 -- pc2-node/wasm-apps/mp4-split/{mp4-split.wasm,capsule.json}` then restart PC2. Belt-and-braces: [`mp4split.ts:462`](pc2-node/src/services/media/mp4split.ts) falls back to the pure-JS parser if the WASM fails to load — and the JS parser is also correct after this release.
- Verified by Sasha: re-minted AV1 video plays cleanly on her Mac after the source patch (pre-rebuild).

### Supernode dDRM provision-config fix (`QmX5Jxc…r5uk` → `bafkreihvm4z…tkk4`)

- Both supernodes were signing-and-serving `actions.nonMediaDecrypt = QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk` — a Wave-8 re-pin that was registered with Chipotle but never became production-active. Replaced with the canonical V1.2 sigauth CID `bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4` (registered in Chipotle group 1, pinned ≥2 IPFS providers).
- Edited `/root/pc2/web-gateway/ddrm-config.json` on both InterServer (`69.164.241.210`, `pc2-gateway.service`) and Contabo (`38.242.211.112`, `pc2-web-gateway.service`). Backups left as `ddrm-config.json.pre-cid-fix.<epoch>` per Wave-8 convention. No service restart needed — the Wave-8-patched handler reads the file fresh per request and re-signs with `/etc/pc2/elacity-provision.ed25519` automatically. Live-curl verified both endpoints now serve the corrected CID inside a freshly-signed envelope (`v: 1`, `domain: elacity.pc2.chipotle-provision.v1`, signature verifies against the pinned `ELACITY_LABS_PROVISION_PUBKEY_HEX`).
- Why it wasn't breaking decryption today: real decrypt traffic flows through `storage.ts:NON_MEDIA_ACTION_CID` which has its own 4-tier resolution chain (env → file → hardcoded `bafkreihvm4z…`) and never consults the supernode-provisioned config. Only `chipotle-client.getActionCid()` does, and today only the diagnostics endpoint calls that. So this was a textbook latent footgun, not a current outage. Now retired.

### PC2 defensive — reject known-bad CIDs in `chipotle-client.getActionCid()`

- Tracked as `CHIPOTLE-REJECT-KNOWN-BAD-CID`. New `KNOWN_BAD_NON_MEDIA_DECRYPT_CIDS` set in [`pc2-node/src/api/chipotle-client.ts`](pc2-node/src/api/chipotle-client.ts). At Tier 3 (the supernode-provisioned config), if the cached `provision.actions.nonMediaDecrypt` matches a known-bad CID, log a warn and fall through to Tier 4 (the trusted hardcoded default) instead of returning it. Belt-and-braces against:
  1. Existing PC2 nodes whose `data/.chipotle-provision.json` was cached before today's supernode fix (the cache is never time-invalidated; without this defence they'd keep using the bad CID until the file is manually deleted).
  2. Any future supernode rotation that briefly serves a bad value.
  3. Any future code path that migrates from `storage.ts:NON_MEDIA_ACTION_CID` to `chipotle-client.getActionCid()`.
- Set is extensible for future rotations; just add the offending CID to the set in the same release that ships the rotation. Warn message tells the operator exactly how to recover (`Delete data/.chipotle-provision.json to re-fetch from supernode`).

### `tsc` build-fix (un-bricks in-app updates)

- [`pc2-node/tsconfig.json`](pc2-node/tsconfig.json) `exclude` extended to skip `src/sdk/index.ts` and `src/sdk/config.ts`. Both files are untracked-and-gitignored scratch (the parent `.gitignore` rule `sdk/` matches any directory named `sdk/` at any depth, so neither is in any commit) and they import types — `MetadataEnvelope`, `CurrencyInfo`, `MediaDescriptor`, etc. — that the tracked `src/sdk/types.ts` no longer exports. They produce 44 `TS2305` errors on every clean build. Because `scripts/update.sh:20` sets `set -e` and step 10 runs `npm run build:backend`, every existing PC2 node in the wild trying to roll forward to v1.2.7.4 would have aborted at the build step. Excluded specifically (not the whole `src/sdk/` directory) because `src/sdk/types.ts` IS used by [`fingerprint.ts`](pc2-node/src/services/media/fingerprint.ts) and [`ContentIntelligenceService.ts`](pc2-node/src/services/ContentIntelligenceService.ts).
- Net effect: `npm run build:backend` now exits 0 cleanly. Verified: dist artefacts regenerate, defensive `KNOWN_BAD_NON_MEDIA_DECRYPT_CIDS` logic compiles into `dist/api/chipotle-client.js`, no other behavioural change.
- Followup for the operator (NOT in this release): decide whether to re-add `MetadataEnvelope` etc. to `src/sdk/types.ts` and force-track `index.ts`/`config.ts`, or delete them. Either way it's a separate task.

### Migration / rebuild notes

- Existing PC2 nodes: `cd pc2-node && npm run build` then restart PC2. The defensive fix kicks in immediately on next call to `getActionCid()` even with a stale `data/.chipotle-provision.json`. AV1 videos play correctly on next `/api/media/init` (no re-mint needed).
- Fresh PC2 nodes: bootstrap from the (now-corrected) supernode provision endpoint and never see the bad CID at all.
- Operator follow-up worth doing in a later patch: also default to `libx264` when neither NVENC nor SVT-AV1 hardware accel is available AND the asset is destined for general distribution — AV1 is great for Chromium/Electron but Safari < 17.4 and many mobile browsers still can't decode it. Track as a separate task; not required for Sasha's launcher case (Electron supports AV1 natively).

---

## [v1.2.7.3] - 2026-05-03 - Indexer observability + market UX during warmup

> **Scope**: Two follow-up improvements after v1.2.7.2 root-caused both the fresh-Mac crash AND the empty-market-cards symptom to the same migration bug. (1) Make the indexer LOUD when it can't write to the catalog — the pre-32 silent-failure-mode hid the bug for an entire release cycle. (2) Give fresh-install users visible feedback during the 15-minute initial backfill window so they don't think their node is broken.

### Indexer: surface swallowed errors during scans

- **`scanChannelCreated`, `scanDigitalAssetRegistered`, `scanAssetCreated`** in [`pc2-node/src/services/ContentIndexerService.ts`](pc2-node/src/services/ContentIndexerService.ts) all used to swallow per-event errors into `log.debug(...)`. That's how the missing-`channel_metadata` table on fresh installs hid for an entire release: every `INSERT` threw, every catch silently moved on, and the function returned "0 channels found" while the backfill stamped itself complete. v1.2.7.3 changes the return type from `Promise<number>` to `Promise<{ inserted: number; errors: number }>`. First error per scan promotes to `log.warn` with full context (block number, message). End-of-scan summary if `errors > 0`: `scanChannelCreated [v3]: 8 inserted, 12 failed (first error: …). Likely missing tables, schema drift, or DB write contention. Check /api/diagnose.` Same pattern applied to all three scan methods.
- **Backfill stamping gated on actual success**. [`backfillChannelsIfNeeded`](pc2-node/src/services/ContentIndexerService.ts) used to ALWAYS write `indexer_channels_backfilled_${version} = 1` after the loop, even if 0 channels actually inserted. Now: if `totalInserted === 0 && totalErrors > 0`, log loudly and **do not stamp**. The next scan cycle (5 minutes later, or earlier via `/api/catalog/reindex`) retries the backfill. So once the underlying cause is fixed (e.g. user runs the migration that creates the table), the catalog auto-recovers without manual intervention.

### `GET /api/catalog/indexer-status` (new endpoint)

- New public-read endpoint in [`pc2-node/src/api/index.ts`](pc2-node/src/api/index.ts) returning live indexer state for the market UI:
  ```json
  {
    "success": true,
    "ready": false,
    "scanning": true,
    "isInitialBackfill": true,
    "lastChainBlock": 45538200,
    "lastScanCompletedAt": null,
    "estimatedSecondsRemaining": 415,
    "versions": {
      "v3": {
        "fromBlock": 43892000,
        "lastScannedBlock": 44850000,
        "blocksRemaining": 688200,
        "progressPct": 58.3,
        "isBackfilled": false,
        "lastScanInserted": 8,
        "lastScanErrors": 0
      }
    },
    "catalog": { "total": 0, "resolved": 0, "pending": 0, "failed": 0, "channels": 0 }
  }
  ```
  - `estimatedSecondsRemaining` assumes ~110k blocks/min throughput (observed on Mac during v1.2.7.2 smoke test, intentionally conservative so we never under-promise).
  - `ready` is true when `!isInitialBackfill && resolved > 0`.
  - Backed by a new `getIndexerStatus()` snapshot method on `ContentIndexerService` that reads `indexer_last_block_${version}` + `indexer_channels_backfilled_${version}` settings + cached `lastChainBlock` from the most recent scan cycle.

### Elacity Market: catalog-indexing progress banner

- **New "Building local catalog…" banner** at the top of the Feed view in [`pc2-node/data/test-apps/elacity-market/index.html`](pc2-node/data/test-apps/elacity-market/index.html) + [`app.js`](pc2-node/data/test-apps/elacity-market/app.js) + [`styles.css`](pc2-node/data/test-apps/elacity-market/styles.css). Polls `/api/catalog/indexer-status` every 10 seconds, shows progress percentage, eta, and live counts (channels/items). Hides automatically once `ready === true`. Spinner + accent-tinted strip + thin progress bar — informational, not blocking. User can dismiss for the session via the × button.
  - Detail line example: `Indexed 58.3% of Base mainnet · ~7 min remaining · 4 channel(s), 12 item(s) so far`.
  - Cards continue to render via the existing supernode GraphQL fallback during this window — banner only adds context, never blocks content.
  - `styles.css?v=37 → v=38` cache-bust.

### Notes for review

- Net diff: 5 files modified (1 service, 1 API handler, 1 HTML, 1 CSS, 1 JS).  No new dependencies, no breaking interface changes (the scan methods' new `{inserted, errors}` return type is internal — only `scanContractVersion` and `backfillChannelsIfNeeded` consume it).
- Indexer changes are defensive: if no errors occur, behaviour is identical to pre-32. If errors DO occur, they now surface in launcher logs / `pc2-diagnose.sh` / `/api/diagnose` instead of being silent.
- Banner is opt-out per session via the × button (state stored in JS closure, not localStorage — re-shows on next page load if still indexing). Conscious choice: someone troubleshooting a stuck node shouldn't have to remember they dismissed the banner yesterday.

---

## [v1.2.7.2] - 2026-05-03 - Fresh-Mac install hot-patch

> **Scope**: A completely fresh Mac install via the ElastOS Launcher silently exited PC2 with code 1 the first time the user opened Elacity Creator. Root cause: the migration runner returned early on fresh installs and stamped the DB at `CURRENT_VERSION` immediately, meaning migrations 14, 20, 21, 22, 23, 25-28 NEVER ran. Six tables (most importantly `publish_drafts`) were absent on every fresh install since the original `runInitialSchema` was written, and the first time a tenant app queried one of them PC2 crashed without a breadcrumb. This release fixes the migration runner, self-heals broken existing installs, surfaces actionable install hints when transports are missing, and hardens the crash logging so a future silent exit will leave a usable trail.

### Critical fix

- **Fresh-install migration drift fixed**. [`runMigrations`](pc2-node/src/storage/migrations.ts) used to early-return after `runInitialSchema` for `currentVersion === 0` AND stamp the DB at `CURRENT_VERSION` (then `31`), meaning every migration that came AFTER the original schema.sql snapshot never executed on fresh installs. Result: 6 tables (`publish_drafts`, `agent_proposals`, `content_hashes`, `agent_audit_log`, `installed_skills`, `channel_metadata`) were missing on every fresh install, and `elacity-creator`'s first hit to `/api/drafts` produced `no such table: publish_drafts` → 500 → silent `process.exit(1)`. Two-pronged fix:
  1. [`pc2-node/src/storage/schema.sql`](pc2-node/src/storage/schema.sql) bumped from "Version 16" header to a real Version 32 snapshot with all 6 missing tables + their indexes appended (idempotent `CREATE … IF NOT EXISTS`). Fresh installs now get the full v32 shape from `runInitialSchema()` directly.
  2. [`pc2-node/src/storage/migrations.ts`](pc2-node/src/storage/migrations.ts) bumped `CURRENT_VERSION` `31 → 32` and added migration 32 ("Self-heal migration-only tables") that reapplies the same `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` blocks idempotently. Existing v1.2.7.0/.1 installs that booted broken (stamped at 31, missing tables) heal automatically on next start.
  - Smoke-tested on Sasha's Mac: `[migrations] ✅ Migration 32 complete: migration-only tables healed` log line; `schema_migrations` row at version 32 immediately on relaunch; `elacity-creator` opens with no PC2 exit.

### Crash diagnostics

- **Final-exit breadcrumb in [`pc2-node/src/index.ts`](pc2-node/src/index.ts)**. The pre-32 `unhandledRejection` / `uncaughtException` handlers logged a one-liner via `console.error` only when `code === 'EADDRINUSE'`. Every other silent `process.exit(1)` left no trail and the launcher log just showed `PC2 exited with code 1`. v1.2.7.2 captures the last error in a module-level `lastErrorCapture` and adds `process.on('exit', code => { ... })` + `process.on('beforeExit', ...)` handlers that synchronously dump exit code + last error source + message + stack to stderr. Synchronous-only writes via `console.error` (NOT the buffered `logger`) so they survive a forced exit. The `[PC2] exit code=…` line is the breadcrumb the migration crash should have produced; future silent exits will have it.

### BinaryManager (fresh-Mac transports without Homebrew)

- **No more 4×404 storm in launcher logs**. [`pc2-node/src/utils/binary-manager.ts`](pc2-node/src/utils/binary-manager.ts) `ensureTransportBinaries()` previously made one HTTP request per missing binary against the `pc2-binaries-v1` GitHub release. That release was planned but never published, so every fresh-Mac boot logged 4 separate `HTTP 404` warnings (one per missing transport). v1.2.7.2 adds a one-shot `pc2BinariesReleaseUnavailable` flag — first 404 against `GITHUB_RELEASE_BASE` short-circuits subsequent attempts with a single `pc2-binaries-v1 GitHub release not published — relying on bundled/system binaries only` warning. sing-box (different release host: SagerNet) is unaffected and still attempts download.
- **One-shot install hint per missing binary**. New `INSTALL_HINTS` catalogue + `getInstallHint(name)` helper (exported) that produces platform-specific advice — e.g. `wireguard-go` missing on macOS → `macOS: brew install wireguard-tools (provides wireguard-go)`. Logged once per process via `[BinaryManager]   wireguard-go install hint → …`. Previously fresh-Mac users had to grep launcher logs and guess.
- **Hint surfaced through `/api/system-readiness`**. [`pc2-node/src/api/index.ts`](pc2-node/src/api/index.ts) handler now includes an `installHint` field on each missing-binary check, so the launcher UI can show the same `brew install …` command directly without duplicating the hint catalogue.
- **`pc2-binaries-v1` GitHub release published** with full 4-platform coverage. After v1.2.7.2 was already complete, the binaries `BinaryManager` was supposed to download were still missing, so we cross-compiled and shipped them: 10 assets covering `wireguard-go`, `amneziawg-go`, and `awg-quick` for `darwin-arm64` / `darwin-x64` / `linux-arm64` / `linux-x64` (Go binaries statically linked, ~5 MB each; `awg-quick` is one portable bash script per OS). Reproducible via `bash pc2-node/scripts/fetch-binaries.sh all`. `BinaryManager` now succeeds end-to-end on every supported platform: a fresh-Mac install with no Homebrew, or a vanilla Linux server / Jetson, gets full WireGuard + AmneziaWG transports auto-provisioned on first boot. Verified all 10 download URLs return HTTP 200 and bytes match the expected `Mach-O / ELF arm64|x86_64` architecture. `sing-box` continues to come from SagerNet's own release. Tag deliberately not marked as `latest` so it doesn't shadow user-facing `v1.x.y` releases. URLs follow the existing `BinaryManager` pattern: `https://github.com/Elacity/pc2.net/releases/download/pc2-binaries-v1/{name}-{platform}-{arch}` (or `awg-quick-{platform}` no arch).

### Restart / process management

- **macOS launcher-aware restart in [`pc2-node/src/services/UpdateService.ts`](pc2-node/src/services/UpdateService.ts)**. Previous restart ladder tried `pm2 startOrRestart`, `systemctl restart pc2-node`, `systemctl restart pc2`, `pm2 restart pc2`, `pm2 restart all`, `pm2` via nvm path, `pm2` via /usr/local — none of which exist on a Mac launcher install (Electron spawns PC2 directly via `child_process`). The whole ladder failed loudly in the launcher log, then we exited(0) anyway. v1.2.7.2 short-circuits on `process.platform === 'darwin'` with a single `[UpdateService] macOS detected — skipping pm2/systemctl, exiting cleanly for launcher restart` log line and `process.exit(0)`. Linux / sysadmin / Jetson installs unchanged.
- **`ecosystem.config.cjs` path doubling fixed**. Previous relative paths (`cwd: "./pc2-node"`, `script: "dist/index.js"`) caused PM2 to resolve `~/.pc2/pc2-node/pc2-node/dist/index.js` when `UpdateService` invoked `pm2 startOrRestart` from inside `pc2-node/`. Replaced with absolute paths derived from `__dirname`. Affects PM2-managed installs (Jetson production); cosmetic on Mac launcher path.

### Indexer race-condition guards

- **`[content-indexer] Scan cycle failed: Database not initialized`** silenced. [`pc2-node/src/services/ContentIndexerService.ts`](pc2-node/src/services/ContentIndexerService.ts) `runScanCycle` catch block now demotes "database not initialized | database is closed | database connection is closed" to `log.debug` (treats them as benign shutdown races); real errors still log loud. Same defensive pattern in [`pc2-node/src/storage/indexer.ts`](pc2-node/src/storage/indexer.ts) `IndexingWorker.scanForUnindexedFiles` (file-FTS background worker), which produced the same noisy line during PC2 shutdown.

### Diagnostic script

- **`scripts/pc2-diagnose.sh` portability + correctness**. (1) `${BASH_SOURCE[0]}` → `${BASH_SOURCE[0]:-}` so the `set -u` mode no longer aborts when the script is piped from `curl | bash` (BASH_SOURCE is unset in that mode). (2) Candidate fallback order inverted: `~/.pc2` (launcher install) is now tried BEFORE `~/pc2.net` (developer clone) so diagnostics on a runtime install describe the right tree.

### Notes for the launcher team

- **Transport binary problem fixed at the PC2 level**: with the `pc2-binaries-v1` GitHub release now live (see BinaryManager section above), every fresh-Mac PC2 boot auto-downloads its own `wireguard-go`, `amneziawg-go`, and `awg-quick` on first run regardless of whether Homebrew is installed. The launcher's existing `brew install` / `git clone && make` runtime-install logic is no longer required for transports. Bundling the binaries as `extraResources` in the Electron app is still nicer (saves the 10 MB first-run download) but is now a polish item, not a blocker. `bash pc2-node/scripts/fetch-binaries.sh all` produces a complete `pc2-node/bin/{platform}-{arch}/` tree if you want to bundle.
- Launcher does NOT auto-restart PC2 on crash — manual click of "Start" is required after `process.exit(1)`. Recommend adding restart-on-exit logic in `pc2Manager.startPC2` so a future silent exit doesn't strand users at a stopped node.
- Fresh-launcher Mac apparently re-installs apps on every PC2 restart (e.g. `elacity-creator` uninstalled and re-installed within 70ms during boot). Worth investigating — looks like persistence of the `installed_apps` table is being reset per boot somewhere upstream of PC2.

### Bonus fix discovered post-deploy: empty Elacity Market cards

- **The empty market cards problem on fresh installs was the SAME migration bug.** Initial diagnosis blamed public Base RPC rate-limiting on `eth_getLogs`, but post-deploy verification showed the real cause: when the indexer picked up a `ChannelCreated` event it called [`db.upsertChannelFromFactory()`](pc2-node/src/storage/database.ts) which does `INSERT INTO channel_metadata`. With `channel_metadata` missing on fresh installs the INSERT threw, the indexer's catch swallowed it, and [`scanChannelCreated`](pc2-node/src/services/ContentIndexerService.ts) returned "indexed 0 channels" while still stamping `indexer_channels_backfilled_v3 = 1` so the backfill never retried. Catalog stayed empty forever. The moment the table existed (Migration 32 or manual create), the next scan picked up the same on-chain events and populated the catalog with the 8 channels + 28 assets that had been on-chain all along. Sasha's Mac went from 0 → 28 catalog items in ~15 minutes once `channel_metadata` was healed, on the same public RPCs we'd suspected of throttling. **No RPC changes, no GraphQL fallback, no UX retry logic needed** — Migration 32 fixes both the Creator crash AND the empty-market-cards symptom for every existing broken install on next boot.

---

## [v1.2.7.1] - 2026-05-03 - Community parity hot-patch

> **Scope**: Community operators (EverlastingOS on Jetson, anonymous WSL user) hit two install/update parity bugs within hours of v1.2.7 going live. This is the targeted fix-set so their nodes behave the same as Sasha's canary Jetson.

### Fixes

- **`/api/system-readiness` no longer reports false-alarm "WireGuard Missing"** on kernel-mode WireGuard nodes. Previously the readiness check probed only for the `wireguard-go` userspace binary and ignored kernel mode entirely — community Jetson user (running kernel WireGuard) saw a misleading 5/6 badge despite his tunnel working perfectly. Now consults the live `WireGuardService.getStatus().mode` (`'kernel' | 'userspace' | 'none'`) via `BosonService.getStatus()` so kernel WireGuard counts as OK with detail "Active (kernel mode)". Same fix for AmneziaWG (now uses `AmneziaWGService.getStatus()`). Falls back to the binary probe only when BosonService is not yet initialised (early-boot window). Smoke-tested on macOS dev: 6/6 with detail `"Active (userspace fallback)"` for WireGuard and `"Active (connected)"` for AmneziaWG.
  - Files: [pc2-node/src/api/index.ts](pc2-node/src/api/index.ts) (`/api/system-readiness` handler).
  - `POST /api/system-readiness/fix` unchanged — operators can still trigger auto-download from `pc2-binaries-v1` GitHub release.

- **`scripts/update.sh` auto-discard widened to all `package.json` files**. The WSL community user's `git pull` aborted because npm version mismatches had drifted four files (`package.json`, `package-lock.json`, `packages/particle-auth/package.json`, `pc2-node/package-lock.json`). Previously only the two `package-lock.json` files were on the safe-discard list. Now all five known files are discarded automatically, plus a `git ls-files`-based glob fallback catches any future `packages/**/package.json` additions without requiring a code update. `PC2_UPDATE_FORCE=1` override unchanged. Smoke-tested locally: simulated WSL drift on all four files, confirmed `update.sh` auto-discard now cleans them all.
  - Files: [scripts/update.sh:99](scripts/update.sh).
  - One-liner unblock for operators who hit this before updating: `cd ~/pc2.net && git checkout -- package.json package-lock.json packages/particle-auth/package.json pc2-node/package-lock.json && bash scripts/update.sh`.

### New (opt-in pull diagnostic)

- **`scripts/pc2-diagnose.sh`** — self-contained operator-side diagnostic that bundles `/api/health` + `/api/system-readiness` + `wg show` + transport-binary `which` probes + `ipfs swarm peers` count + cluster-pin reachability probe + last 80 relevant `pm2` log lines + disk/memory pressure + git state + `.env` keys (values stripped) into a single sanitised text file written to `~/pc2-diagnose-<timestamp>.txt` and stdout. Sanitiser redacts wallets, DIDs, bearer tokens, `?api_key=…` URL params, BEGIN/END PEM markers, and 24-word lowercase mnemonics. **No network upload** — the operator pastes manually. Portable: works on macOS BSD `sed` and GNU `sed`.
  - One-liner: `curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/pc2-diagnose.sh | bash`.
  - Sanitiser test coverage: 6/6 cases (wallet / DID / Bearer / api_key / 24-word mnemonic / PEM block).

- **`GET /api/diagnose`** (auth-gated) — server-side equivalent returning structured JSON for future GUI consumption. Same data + same sanitisation as the bash script. Every shell-out hard-capped at 5s so a hung tool can't wedge the request. Probes the public Elacity supernode cluster endpoint without any token (a 401 means cluster is up; a connection failure means this node can't reach it). Auth-gated because the response includes recent log lines and binary paths.
  - File: [pc2-node/src/api/diagnose.ts](pc2-node/src/api/diagnose.ts).
  - Mounted at `/api/diagnose` from [pc2-node/src/api/index.ts](pc2-node/src/api/index.ts).
  - GUI button surface ("Copy diagnostic to clipboard" on the readiness panel) deferred to v1.2.8 — endpoint lands now so the bash script and any future GUI agree on the data shape.

### What's deliberately NOT in v1.2.7.1

- Push/heartbeat telemetry to a Contabo collector — explicitly rejected. Opt-in pull only, in line with the personal-cloud promise.
- "Share diagnostic" GUI button — needs design pass, queued for v1.2.8.
- Webpack `bundle.min.js may be missing` root-cause investigation — needs EverlastingOS's diagnose output first; most likely Jetson memory pressure during install build but unconfirmed.
- Install-script convergence audit (`install-arm.sh` vs `install-wsl.sh` vs `start-local.sh` vs `setup-node.sh` ending at the same final state) — separate work, tracked as `INSTALL-SCRIPT-PARITY` for v1.2.8.

### Communications shipped

- **EverlastingOS (Jetson community user)**: "5/6 badge is a false alarm — fixed in v1.2.7.1. Run the diagnose one-liner so we can see why your player is stuck on 'Pin failed on server'."
- **WSL community user**: "Don't `git pull` directly — use `bash scripts/update.sh`. Quick unblock: `cd ~/pc2.net && git checkout -- package.json package-lock.json packages/particle-auth/package.json pc2-node/package-lock.json && bash scripts/update.sh`."

---

## [v1.2.7] - 2026-05-02 - SQLite migration + Supernode IPFS Cluster + playback fixes

> **Scope**: v1.2.7 combines three workstreams:
> 1. **SQLite migration** (`better-sqlite3` → `@photostructure/sqlite`) — primary motivation, unblocks Mac users running pc2-node from the Elastos launcher (no native compile / Xcode CLT needed).
> 2. **IPFS Cluster availability tier** — pc2-nodes auto-forward pins to a hosted Cluster mesh so content remains reachable even when the originating node is offline / behind NAT.
> 3. **Playback fixes A–D** — auto-retry failed pins, clear stale failed flags, faster MPD timeout, clear stale player UI errors.
>
> Validated end-to-end on Jetson (production canary, aarch64-linux): SQLite migration applied cleanly, 61 pinned_cids preserved, cluster integration firing, playback fixes serving real users.

### Infrastructure (LIVE on supernodes 2026-05-02)

- **2-node IPFS Cluster mesh deployed** between Contabo (38.242.211.112) and InterServer (69.164.241.210) using `ipfs-cluster-service` v1.1.4 with CRDT consensus. Smoke-tested: pin issued from Contabo replicates to both nodes' Kubo blockstores within 5 seconds. `pc2-cluster.service` systemd unit installed and enabled for boot survival.
- **Kubo `StorageMax` raised** from 8 GB → Contabo 300 GB / InterServer 1 TB. With replication factor 2 this unlocks ~650 GB of guaranteed marketplace pin capacity (was 0 — the existing supernode Kubos were running at default 8 GB cap with 3+ TB free disk).
- **Mutual `Peering.Peers`** added to both Kubo configs so they hold direct connections to each other.
- **UFW** allows port 9096 only from the specific peer IP (defense in depth — cluster swarm secret is the primary security boundary).
- **nginx reverse proxy** on Contabo (`/etc/nginx/sites-enabled/pc2-gateway`, additive single-`location` change) exposes Cluster Pinning Services API publicly at `https://38.242.211.112/cluster-pin/` with bearer-token gating. `nginx -t` + `systemctl reload nginx` (no restart) — verified zero regression on PC2 frontend, dDRM provision, RPC, and `*.ela.city` marketplace routes.
- **Multi-token map + per-IP rate limiting** added to the nginx vhost (2026-05-02 evening, additive `/etc/nginx/conf.d/cluster-pin.conf`). Replaces the single inline `if` bearer check with a `map` directive that whitelists multiple bearer tokens (currently 2: legacy Jetson personal + new community shared). `limit_req_zone` enforces 30 req/min per source IP with burst 20 — all overflow returns 429. This is the abuse mitigation that lets the community shared token be public-by-design (baked into pc2-node) without inviting unbounded spam-pinning. `nginx -t` + `nginx -s reload` (no restart) — verified all 4 auth paths and rate-limit threshold from external IP before considering the change live.
- **Two bearer tokens authorized** in the cluster-pin map: (1) the legacy Jetson personal token (recorded in user's password manager, slated for rotation in v1.2.8 once per-node tokens land), (2) the new community shared token baked into `clusterPin.ts` defaults so every fresh community node gets cluster pinning out-of-the-box.
- **End-to-end write path verified externally**: POST `/cluster-pin/pins` with bearer → 200 → CRDT replicates to both peers in <5 seconds (confirmed via `ipfs-cluster-ctl status` on InterServer).

Full survey + change log: [`SUPERNODE-CLUSTER-SETUP.md`](.cursor/tasks/SUPERNODE-CLUSTER-SETUP/SUPERNODE-CLUSTER-SETUP.md).

### pc2-node integration (DEPLOYED + VERIFIED on Jetson 2026-05-02)

- **New `pc2-node/src/services/clusterPin.ts` service module** — wraps the IPFS Pinning Services API spec. Mirrors the existing `ELACITY_PIN_FORWARD` pattern: fire-and-forget, exponential-backoff retry queue, hard age cap. **Default ON** in v1.2.7+ — every fresh community node auto-replicates pins to the Elacity supernode mesh on first install with zero operator action. Defaults baked into `clusterPin.ts` (URL + shared community token); abuse bounded by per-IP rate limiting at the supernode (30 req/min + burst 20). Operators who want a different cluster set `SUPERNODE_CLUSTER_PIN_URL` + `_TOKEN` in `pc2-node/.env`; operators who want to disable cluster pinning entirely set them to empty strings.
- **Wired into 4 pin call sites** in `pc2-node/src/api/storage.ts` alongside (not replacing) the existing `fanOutSupernodePinMirrors` and `forwardPinToElacityKubo` calls. Strictly additive; existing behaviour unchanged.
- **New diagnostic endpoint** `GET /api/storage/ipfs/cluster-pin` (owner-guarded) — reports whether cluster pinning is configured + last probe + retry queue state.
- **New availability badge endpoint** `GET /api/storage/ipfs/cluster-availability/:cid` (public) — queries the cluster for a CID's pin status; returns delegate multiaddrs callers can use to direct-dial.
- **Hot-deployed to Jetson** (production node) with `ecosystem.config.cjs` env update + `pm2 reload`. Boot log confirmed:
  ```
  [ClusterPin] enabled -> https://38.242.211.112/cluster-pin (replication=2/2)
  [ClusterPin] retry scheduler started (interval=30000ms, maxAttempts=5)
  ```
- **Backfill script** `pc2-node/scripts/cluster-backfill.mjs` queries `pinned_cids` for `pin_status='failed'` (and stuck `queued`/`pinning`) rows, pushes each into the cluster via the public Pinning Services API, and updates DB to mark them as `complete`. Detects either SQLite adapter (`@photostructure/sqlite` for v1.2.7+, `better-sqlite3` for v1.2.6). DRY_RUN supported.
- **First production backfill (Jetson, 2026-05-02)**: 1 unique CID rescued (`bafybeidrmrsohnva4asvqptsspwvrtwluldkui7fyvcbpmpfcq7gdgo5p4`, minted 2026-05-01). Confirmed `PINNING` on both supernodes within seconds — directly addresses today's "buyer can't reach minter's content" pain.

### Strategy / Roadmap

- **New task ticket `CAPSULE-RUNTIME-WASM`** filed for v1.4+ work — sketches a Rust/WASM-based capsule runtime giving 3rd-party creators capability-bounded sandboxed execution, mapping directly to Anders' "runtime grants viewer capability" concept.

### Operator notes (must-read before broader rollout)

- **TLS caveat**: cluster URL uses self-signed cert for IP. `NODE_TLS_REJECT_UNAUTHORIZED=0` is set in pc2-node env on Jetson. v1.3.x will introduce a proper-cert subdomain (`cluster.ela.city` or similar) and per-request TLS agent so this global toggle goes away.
- **Log rotation**: Jetson `pm2-out.log` was 945 MB at deploy time — pm2 logrotate not configured. Add as v1.3.x maintenance item.

### SQLite migration (DEPLOYED + VERIFIED on Jetson 2026-05-02)

- **`@photostructure/sqlite@^1.2.1`** replaces `better-sqlite3`. Ships prebuilt binaries for darwin-arm64, darwin-x64, linux-arm64 (glibc + musl), linux-x64, win32-arm64, win32-x64 — **zero native compile** required on any of these platforms. This unblocks Mac/Elastos-launcher first-run experience (was broken without Xcode CLT).
- **`enhance()` wrapper** (in `pc2-node/src/storage/database.ts`) makes the new adapter API-identical to better-sqlite3 — call sites unchanged.
- **Schema-compatible**: SQLite file format identical between adapters; existing `pc2.db` reads cleanly under the new adapter (verified live: 61 pinned_cids + 3 users + 3 sessions preserved on Jetson).
- **Self-rollback deploy**: hot-deployed to Jetson via self-contained `nohup` script with built-in EXIT trap + watchdog. ~6-second user-visible downtime window. Backup at `/home/orin_nano/pc2.net/.backup-20260503-072358/` for instant rollback if ever needed.

### Polish (release-readiness for community nodes)

- **`SUPERNODE_CLUSTER_PIN_*` env vars now sourced from `process.env`** in root `ecosystem.config.cjs` — community nodes can opt in by setting env vars (or a `pc2-node/.env` file) without needing to edit the tracked config file. Existing Jetson token migrates from `ecosystem.config.cjs` → `pc2-node/.env` to survive future `git reset --hard origin/main` in `update.sh`.
- **`pm2-logrotate` config** added to root `ecosystem.config.cjs` — Jetson `pm2-out.log` had grown to 945 MB before this; now caps at 50 MB × 7 files per app. Applies to all community nodes on update.
- **`pc2-node/.env.example`** created — documents all opt-in env vars for cluster pinning, replication, TLS handling, AI providers, comms gateways. Single source of truth for fresh installs.
- **`/api/health` extended** with `cluster.pinning` summary block — shows whether cluster forwarding is configured + last probe state + retry queue depth. No new endpoint, no auth bloat — folds into existing public health response.
- **`dotenv/config` loaded** at top of `pc2-node/src/index.ts` so `pc2-node/.env` is honoured (was a dep but never wired in).
- **Conditional-spread env block in `ecosystem.config.cjs`** — opt-in credential vars (cluster pin URL/token, RPC pool, AI keys, comms tokens, Lit overrides, legacy supernode mirrors) now use `...(process.env.X ? { X: process.env.X } : {})` instead of `X: process.env.X || ""`. This was a critical bug fix: with the old pattern, pm2 would set unset opt-in vars to `""`, then `dotenv` (default `override: false`) would refuse to overwrite empty strings → operator's `pc2-node/.env` was silently ignored. With the new pattern: shell wins if set, else `.env` populates the gap, else feature gracefully off. **Verified all three permutations end-to-end** before landing. Always-set keys (NODE_ENV, PORT, PATH, LIT_BACKEND, REPLICATION_MIN/MAX, NODE_TLS_REJECT_UNAUTHORIZED) keep their hardcoded-default pattern — they're either system controls or safe defaults, no secrets.

### Update flow hardening (v1.2.7, promoted from "v1.2.8+ flagged")

These were originally on the "noticed but didn't change" list. The user surfaced them as release-blockers because the v1.2.7 ecosystem.config.cjs gained new opt-in env vars (cluster pinning, AI keys, Lit, RPC pool) and "in-app update on a Mac via the Elastos launcher should Just Work, no terminal commands" is a hard requirement for the release.

- **`UpdateService` restart now uses `pm2 startOrRestart ecosystem.config.cjs --only pc2 --update-env`** as the first attempt in the existing fallback chain. The previous `pm2 restart pc2` preserved pm2's frozen-at-`pm2-start`-time env, which meant any new env defaults shipped via ecosystem.config.cjs (e.g. the v1.2.7 cluster pinning vars) silently never applied on in-app updates. Existing fallbacks (systemctl, plain pm2 restart, nvm-paths, /usr/local/bin) kept verbatim — the new step only affects the success path on standard installs.
- **`update.sh` migrates inline secrets** out of `ecosystem.config.cjs` into `pc2-node/.env` BEFORE `git reset --hard origin/main` runs (new step 3b). Allowlist-scoped to known credential vars (cluster pinning, AI keys, Lit, RPC pool, TLS toggle). Skips empty values + post-v1.2.7 `process.env.X || ""` forms. Won't overwrite an already-set .env entry. This is the safety net that prevents the Jetson (the only known node with hardcoded cluster credentials) from losing its token on first v1.2.7 update.
- **`start-local.sh` + `install-wsl.sh` now register pm2 via `ecosystem.config.cjs`** instead of the legacy `pm2 start npm --name "pc2" -- start`. Three wins:
  1. The desktop UpdateService's new `pm2 startOrRestart ecosystem.config.cjs --only pc2 --update-env` finds a matching app on its first call (was named "pc2" both ways, but the registration metadata was different — npm-wrapped vs direct script).
  2. pm2 directly tracks the node process instead of an npm wrapper, so kill signals reach the actual server (eliminates the orphaned-node-after-restart class of bug).
  3. The env block in `ecosystem.config.cjs` (NODE_ENV, PORT, PATH, restart_delay, kill_timeout, log paths, optional cluster vars) is now the source of truth on every install path — Mac launcher, WSL, ARM Linux, x86 Linux, Jetson all run on the same registration.

### Not yet done (sequenced for v1.2.8+)

- Cut v1.2.7 git tag + GitHub release (pending ElastOS Launcher v1.2.6 release + user smoke-test on Jetson). Token distribution policy for community nodes settled 2026-05-02 evening: shared community token baked into pc2-node code, per-IP rate limiting at supernode, per-node rotatable tokens deferred to v1.2.8.
- **ElastOS Launcher v1.2.6 release** — BLOCKING for Mac/Linux/Windows GUI users. Launcher v1.2.5's `pc2Manager.ts` still references `better-sqlite3`, which v1.2.7 of pc2.net removed. Without a launcher update first, in-app "Update PC2" on a Mac will trip the launcher's native-module verification gauntlet. ~30 LOC PR to swap the SQLite probe + drop the force-rebuild step. Tracked in `.cursor/tasks/SUPERNODE-CLUSTER-SETUP/SUPERNODE-CLUSTER-SETUP.md` open follow-up #9.
- InterServer nginx exposure (failover endpoint when Contabo is unreachable).
- GCloud (`ipfs.ela.city`) joins as third Cluster peer (Phase 4 of `SUPERNODE-CLUSTER-SETUP`).
- Per-pc2-node bearer token issuance (replace shared community token) — slated for v1.2.8. Path: small admin endpoint on a supernode → wizard flow in pc2-node UI → operator clicks "rotate to my own token" → fresh token issued + saved to `.env`. Default falls back to shared community token until operator opts in.
- **TLS hygiene** (multi-step, v1.2.8+): (a) `cluster.ela.city` DNS A record pointing at Contabo (operator action — User is travelling, ela.city DNS provider needs SMS verification on Thailand-only number); (b) certbot Let's Encrypt cert on Contabo for cluster.ela.city; (c) update `DEFAULT_CLUSTER_PIN_URL` in `clusterPin.ts` from IP literal to hostname; (d) refactor `UsernameService.ts:17` global `NODE_TLS_REJECT_UNAUTHORIZED=0` to per-request `https.Agent({ rejectUnauthorized: false })` ONLY for known self-signed endpoints. Currently TLS verification is OFF for ALL pc2-node outbound HTTPS — practical risk is low for home/datacentre nodes but real on public Wi-Fi or adversarial networks. Tracked separately as `TLS-PER-REQUEST-AGENT` for v1.2.8.
- **Supernode RPC proxy Phase 2** (P0, surfaced 2026-05-02 during v1.2.7 smoke test, decision 2026-05-02 evening: ship v1.2.7 WITHOUT supernode default, document operator opt-in via Alchemy/Infura): public Base RPC fallback chain rate-limits during Particle Auth's `getPrimaryAssets()` burst. User hit it during the v1.2.7 mint smoke-test on Jetson; tactical unstuck was Alchemy free-tier key inline in Jetson's `ecosystem.config.cjs`, mint succeeded, cluster pin propagated 2/2 in 730ms, full v1.2.7 acceptance test passed on Jetson canary. Strategic decision: do NOT bundle a shared API key (security + shared rate-limit pooling). Community nodes get the opt-in path documented above (`SUPERNODE_RPC_URLS=<your-alchemy-url>` in `pc2-node/.env`, now actually works thanks to the conditional-spread fix). **v1.2.8** will deploy supernode-backed `https://rpc.ela.city/base` default so opt-in becomes unnecessary — gated on Thailand-DNS round-trip when User is back from USA. Full diagnosis + Phase 2 plan in `.cursor/tasks/SUPERNODE-RPC-PROXY/SUPERNODE-RPC-PROXY.md`.
### What community node operators should expect on first mint after v1.2.7 update

This section is BLUNT and should be quoted in release-notes / community announcements verbatim.

**Cluster pinning (new in v1.2.7)**: **Works out-of-the-box on every fresh install with zero operator action.** Defaults bake the Elacity supernode cluster URL + a shared community token into `pc2-node/src/services/clusterPin.ts`. Boot log will show `[ClusterPin] enabled -> https://38.242.211.112/cluster-pin (Elacity default) (replication=2/2)`. Per-IP rate limiting at the supernode (30 req/min + burst 20) bounds abuse exposure even though the token is public. Operators who want to use their OWN cluster set both env vars in `pc2-node/.env`; operators who want to disable cluster pinning entirely set them to empty strings (legacy `ELACITY_PIN_FORWARD_URL` and `SUPERNODE_PIN_MIRRORS` still fire if configured).

**Web3 RPC for minting (NOT new in v1.2.7, but more likely to surface)**: pc2-node ships with a default chain of 5 public Base RPC providers (`mainnet.base.org`, `llamarpc`, `publicnode`, `ankr`, `blockpi`). These providers tightened rate limits in 2026, and Particle Auth's `getPrimaryAssets()` makes 15-25 RPC calls per refresh during the mint flow. **If you mint while all 5 providers are simultaneously rate-limited, you will see**:

- `getPrimaryAssets() timed out after 15s` errors in the browser console
- The Particle wallet sign dialog never appears
- Or, if you proceed past the sign step, `MetaMask - RPC Error: RPC endpoint returned too many errors, retrying in N minutes`

**Workaround until v1.2.8 supernode RPC proxy ships** (see `SUPERNODE-RPC-PROXY` task — gated on `rpc.ela.city` DNS round-trip):

1. Sign up for a free [Alchemy](https://alchemy.com) account (5 minutes)
2. Create an app → Base Mainnet → copy the HTTPS endpoint URL (looks like `https://base-mainnet.g.alchemy.com/v2/<key>`)
3. Edit your `pc2-node/.env` (copy from `.env.example` if you don't have one yet):

   ```
   SUPERNODE_RPC_URLS=https://base-mainnet.g.alchemy.com/v2/<your-key>
   ```

4. Reload pc2: `cd ~/pc2.net && pm2 reload ecosystem.config.cjs --only pc2 --update-env`
5. Confirm in pm2 logs: `[rpc] RPC pool initialized with 6 endpoints (1 supernode first): https://base-mainnet.g.alchemy.com/...`
6. Try the mint again — token list loads, sign dialog appears, transaction goes through

Alchemy's free tier (300M compute units / month, ~25-30 req/sec) is way more than a single home node needs. Your key never leaves your machine. Same approach works for Infura or any other authenticated Base RPC.

**v1.2.8 will eliminate this opt-in step**: when the User's travel constraints clear, we'll deploy a shared RPC proxy on the supernodes and bake `https://rpc.ela.city/base` into the default `BASE_RPC_URLS`. Every community node will then get supernode-backed RPC for free, with no per-operator setup. Tracked in `.cursor/tasks/SUPERNODE-RPC-PROXY/SUPERNODE-RPC-PROXY.md`.

---

## [1.2.6] - 2026-05-01 (no-Xcode-CLT-needed + arm64-video-uploads + freshly-minted-content-shows-up)

> ## TL;DR
>
> v1.2.6 makes brand-new Mac installs work for users who have never touched a terminal — no Xcode Command Line Tools required. It also fixes video uploads on arm64 Linux (Jetson, Pi, Graviton) which previously crashed at the "Fragment" step, fixes freshly-minted content not showing up in the marketplace, fixes 500-erroring thumbnails for non-locally-pinned content, plus three other ways v1.2.5 could leave a user stuck on update.

### What v1.2.6 fixes

#### 1. Zero-compiler installs on macOS (Sasha's case)

`better-sqlite3` was pinned to `^9.2.2`, which has NO Node 22 (MODULE_VERSION 127) prebuilt binary for darwin-arm64. The launcher bundles Node 22, so on every fresh install the launcher had to fall back to compiling `better-sqlite3` from C++ source — which requires Xcode Command Line Tools. Users without Xcode CLT (i.e. most non-developers) saw the install report "success" but got a broken state.

**Fix**: bumped `better-sqlite3` from `^9.2.2` → `^11.10.0`. v11 ships Node 22 darwin-arm64 prebuilds. `npm install` now downloads the matching binary directly when the toolchain matches.

Verified all other native modules (`bcrypt`, `node-pty`, `sharp`, `node-datachannel`) already use NAPI or platform-specific prebuilt subpackages — they don't need any compiler either.

> **⚠️ Postscript (discovered 2026-05-01 evening, fresh Mac install via ElastOS Launcher):** the `^11.10.0` bump on its own is NOT sufficient to deliver a true zero-compiler install. On a fresh macOS without Xcode Command Line Tools, the launcher's install pipeline still ends up with a wrong-ABI `better_sqlite3.node` binary (`NODE_MODULE_VERSION 115` vs Node 22's required `127`) and PC2 crashes at `DatabaseManager.initialize`. Root cause: better-sqlite3 uses V8-specific ABI prebuilds (not Node-API), the launcher's `npm rebuild` step depends on a C++ toolchain to recover from any prebuild mismatch, and `--build-from-source` in our scripts hard-requires Xcode CLT. The launcher's verification gauntlet correctly detects the failure but starts PC2 anyway (separate launcher-repo bug). **Genuine zero-friction install will be delivered in v1.2.7 by migrating from `better-sqlite3` to `@photostructure/sqlite`** — Node-API based, prebuilds bundled inside the npm tarball, single binary per platform works across Node major versions, no postinstall download. See `.cursor/tasks/SQLITE-NO-COMPILE-MIGRATION/` for the full task plan.

#### 2. Resilient launcher install when previous attempt failed (Sasha's case, part 2)

Sasha's launcher install crashed on `git clone` because `~/.pc2` was already half-populated from a previous failed attempt. The launcher then called `startPC2` anyway, which spawned a doomed process against the broken state.

**Fix**: launcher now detects three states cleanly:
- `~/.pc2` doesn't exist → fresh install (clone)
- `~/.pc2` exists with our `package.json` from `Elacity/pc2.net` → repair install (skip clone, run `npm install` + build to fix the broken state)
- `~/.pc2` exists but isn't our repo → back up to `~/.pc2_backup_<timestamp>` and clone fresh

Plus: `startPC2` now does a pre-flight load test of `better-sqlite3` before spawning the PC2 process. If it fails to load (broken install state), it surfaces an actionable error instead of crash-looping the user.

#### 3. `update.sh` no longer blocks on benign build artifacts

v1.2.5's `update.sh` safety guard refused to run if `package-lock.json` or `frontend/` had any drift, even though both are regenerated on every update anyway. Users had to manually `git checkout -- ...` or set `PC2_UPDATE_FORCE=1`, with the latter showing a typo'd hint (`bash bash`) when run via `curl | bash`.

**Fix**: `update.sh` now auto-discards known-safe build artifact drift (`package-lock.json`, `pc2-node/package-lock.json`, `pc2-node/frontend/`, `pc2-node/dist/`, `src/particle-auth/assets/`) before checking for real source-code drift. Only **genuine source changes** trigger the safety guard. The `bash bash` typo is also fixed — the recovery hint now detects whether you ran the script via `curl | bash` or from the repo and prints the right command.

#### 4. GUI auto-updater verifies native modules before restart

`UpdateService.ts` (the in-process auto-updater) had no native-module verification step. If a `better-sqlite3` prebuild failed to download for some reason (network glitch, npm cache issue), the update would silently succeed and PC2 would crash-loop on the next restart.

**Fix**: added a load test for `better-sqlite3` between the build step and the restart step. If it fails, the update is aborted with a clear "run scripts/update.sh from terminal" message — no crash loop.

#### 5. Video uploads work on arm64 Linux (Jetson / Pi / Graviton)

Encoder pipeline crashed at the "Fragment" step on arm64 Linux because PC2 tried to download a Bento4 prebuild binary from `bok.net/Bento4/binaries/Bento4-SDK-1-6-0-641.aarch64-unknown-linux.zip`, which returns HTTP 404 — bok.net never published an arm64 Linux build of Bento4. macOS and x86_64 Linux URLs work fine; arm64 Linux was the only affected platform.

Symptom (Creator app on Jetson):
```
✓ Analyze
✓ Transcode
✗ Fragment — Download failed: HTTP 404
```

**Fix**: PC2 now detects when no Bento4 prebuild is available for the platform (or when bok.net download fails for any reason) and falls back to ffmpeg-based fragmentation. ffmpeg's `-movflags +frag_keyframe+empty_moov+default_base_moof+dash` produces fragmented MP4 (fMP4) with the same `moof` / `traf` / `tfhd` / `trun` / `mdat` box structure that mp4fragment produces — fully DASH/CMAF-compliant. ffmpeg is already a hard dependency for the transcode step, so it's guaranteed to be available on any node that can encode video at all.

x86_64 Linux and macOS continue to use Bento4's mp4fragment (the proven path). Only platforms without a Bento4 prebuild (currently linux-arm64) use the ffmpeg fallback.

#### 6. Freshly-minted content shows up in the marketplace immediately

After a successful upload + on-chain mint, the indexer would detect the new TransferSingle event but mark the catalog row `metadata_status: 'failed'` and leave `name`, `asset_type`, `content_cid` all `null`. The marketplace UI then filtered the row out as malformed. Two compounding bugs:

1. The current Elacity Creator (since 2026-04-17) uploads metadata as a **UnixFS directory** (`{cid}/metadata.json`, `{cid}/content.json`, …) rather than a flat JSON file. The indexer's local-IPFS fast path called `getFile(cid)` on the bare directory CID, which throws `"is not a file (type: directory)"`. The catch block correctly fell through to the HTTP gateway list — but the configured remote gateways (`ipfs.ela.city`, `dweb.link`) hadn't yet replicated the freshly-pinned content (typical lag: 30s–5min for a brand-new mint). So all gateway URLs failed and the row stayed `failed` until the 1-hour retry window — terrible UX for "I just uploaded, why isn't it there?".

2. When the indexer DID hit a working gateway (specifically PC2's own local gateway), it parsed the gateway's directory-listing JSON (`{ "cid": ..., "isDirectory": true, "entries": [...] }`) **as if it were the metadata** itself. The row was then marked `resolved` but with all fields null because the parsed JSON had no `name` / `media` / `schema` keys.

**Fixes**:
- `ContentIndexerService.fetchMetadata()` now prepends the local PC2 gateway URL (`http://127.0.0.1:PORT/ipfs/`) to the gateway candidate list. The local gateway serves freshly-pinned content immediately and handles UnixFS directory CIDs via its `/ipfs/:cid/*` route.
- Same function now rejects responses that are directory-listing JSON (`isDirectory: true`) and requires the parsed body to have at least one of `schema | name | media | properties | asset` before accepting it as metadata.
- `getCatalogItemsPendingMetadata()` retry-after window: 1 hour → 5 minutes. Combined with the local-gateway fix, this rarely fires — but if it does, users self-heal in 5 min instead of an hour.

#### 7. Public IPFS gateway no longer 500s on non-locally-pinned content

PC2's `/ipfs/:cid` gateway was returning HTTP 500 instantly (~5ms) for any CID not already in the local blockstore — even though the gateway has an auto-pin path that fetches from peers / the configured prefetch URL on demand. Symptom: the marketplace showed broken thumbnails for any content uploaded by other creators that this node hadn't yet seen.

Root cause: `isContentMissingError()` looked for phrases like `"not found"`, `"missing block"`, `"no link named"`, etc., to decide whether to trigger auto-pin. But Helia's FsBlockstore throws Node.js's `ENOENT: no such file or directory, open '...ipfs/blocks/XX/....data'` — which doesn't match any of those substrings. So the gateway treated "block missing locally" as a generic 500 error.

**Fix**: added `'enoent'` and `'no such file'` to the missing-content classifier. Verified on Jetson: thumbnails that previously 500'd now return HTTP 200 (auto-fetched 105 KB–134 KB each in ~12s the first time, then cached).

#### 8. Marketplace asset detail page — correct UX for free content

Two related bugs on the asset detail page when viewing a **free** (opType === 0) asset:

1. **No way to play or download free content.** The play / download / open-in-viewer buttons were guarded by `if (isOwned)`, where `isOwned` resolves to "this user holds the access NFT for this asset". The publisher of a freshly-minted free asset doesn't auto-receive the access NFT, so they had no way to play their own asset on its detail page. Worse, since free content is cleartext on IPFS and doesn't require an access NFT at all, ANY visitor of a free-asset detail page should be able to play / download it — but that path didn't exist.

2. **Misleading "Publisher Actions" strip on free assets.** The strip rendered three buttons for the publisher: **Edit Price**, **Delist**, **Earnings**. None of them apply to free content: there is no listing price to edit, no marketplace listing to delist, and no on-chain earnings to view. Clicking Edit Price would even show a misleading toast "This content is not resellable (buy-once only)" — wrong category entirely.

**Fixes**:
- `app.js`: play / download / viewer buttons now reveal when `isOwned || isFree`. `isFree` is derived from `nft.operative.opType === 0`.
- `app-features.js`: `renderAssetOwnerActions()` early-returns on free assets, so the Publisher Actions strip is suppressed entirely. The "Asset is published" toggle (rendered separately by `renderPublishToggle`) remains visible — it's the only meaningful publisher control for free content.
- `index.html`: cache-buster bumped (`app.js?v=54`, `app-features.js?v=40`) so users get the fix on next page load without a hard reload.

#### 9. Play button works for free / cleartext content

Clicking **Play** on a free asset showed `Playback Error: Failed to fetch MPD from both gateways (local: 404, public: 404)`. Root cause: `handlePlay()` always launched the player through the encrypted-DASH flow, which:

1. Triggers a Lit Protocol auth round-trip (signing a SIWE message)
2. POSTs `/api/media/init`, which fetches `<mediaUri>/stream.mpd` from local + public IPFS gateways

But free assets are stored as a **single MP4 file** at the bare CID — there's no `stream.mpd` because the content was never DASH-fragmented + CENC-encrypted on the server side (`asset.cleartext: true`, `asset.directPlayback: true`). So the MPD fetch always 404'd.

**Fix**: `handlePlay()` now detects cleartext / direct-playback assets (`opType === 0`, or explicit `cleartext: true` / `directPlayback: true` in metadata) and launches the player in cleartext mode with a direct file URL (`/ipfs/<cid>`). No Lit auth, no DASH MPD fetch, no `/api/media/init` round-trip — just an HTML5 `<video src=...>`. The encrypted-DASH path is preserved verbatim for paid content (opType 1/2 + CENC).

#### 10. Marketplace UX cleanup (small)

- **Download/Save-to-Cloud button height**: was visually misaligned with sibling action buttons because `.download-node-btn` (and `.open-viewer-btn`) had a leftover `margin-bottom: 12px` from a previous stacked layout. Removed — the buttons now sit cleanly in the flex row.
- **Share button hidden**: `Share` (copy-link) was an unused half-feature; hidden via `class="hidden"` rather than removed, so the JS handler wiring still resolves and we can bring it back later by deleting the class.

#### 11. Royalty / Make Offer / Royalty Market hidden on free assets

The asset detail page rendered three royalty-share-related sections regardless of asset type: **Royalty Share Offers** with a **Make Offer** button (calling the TradeGateway "make offer for royalty shares" flow), and a **Royalty Market** collapsible section listing royalty-share orders. None of these apply to free content (`opType === 0`) — there's no on-chain revenue to distribute, so royalty shares are meaningless and the buttons either no-op or surface confusing errors when clicked.

**Fix**: `app-features.js` — both `renderOfferSection()` and `renderOrderBook()` now early-return when `nft.operative.opType === 0`, removing/hiding their respective DOM nodes so the entire royalty-shares column disappears for free assets. Cache-buster bumped (`app-features.js?v=40` → `?v=41`). The encrypted-DASH path (paid content) is unchanged.

#### 16. Revenue & Earnings page mislabeled USDC values as ETH

The Revenue & Earnings page showed unclaimed rewards as `0.08 ETH`, `0.03 ETH`, etc. when the actual on-chain values were USDC. The misleading labels could lead a publisher to wildly miscalculate their accrued earnings (0.08 ETH ≈ $200, 0.08 USDC = $0.08 — three orders of magnitude apart).

**Root cause**: backend `/api/catalog/earnings/:address` (`src/api/index.ts`) explicitly queries `rewardsOf(wallet, USDC)` on each operative contract and returns values already decimal-converted with USDC's 6-decimal scale (e.g., `0.05` means `$0.05 USDC`). Frontend `app.js:loadEarningsData` and `renderEarningsList` then called `formatPrice(unclaimed)` *without a `paymentToken` argument*, which made `getTokenSymbol(undefined)` fall back to its `'ETH'` default.

**Fix**: pass an explicit payment token to both `formatPrice` calls on the earnings page. The total-unclaimed dashboard tile uses `USDC_ADDRESS` directly (since the backend currently only aggregates USDC rewards). The per-row unclaimed value uses the row's own `distributions[0].paymentToken`, falling back to `USDC_ADDRESS` if the distributions array is missing — so future per-row support for other payment tokens (ETH, etc.) Just Works without further frontend changes.

Result: `0.08 ETH` → `0.08 USDC`, `0.03 ETH` → `0.03 USDC`, etc. — accurate labelling everywhere on the Revenue & Earnings page.

Files: `pc2-node/data/test-apps/elacity-market/app.js` (`loadEarningsData()`, `renderEarningsList()`). Cache-buster bumped (`app.js?v=57` → `?v=58`).

#### 17. "Network: This node only" badge no longer lies about replication

The asset detail page's `Network` row claimed "This node only" for almost every indexed asset on a typical Jetson catalog — even when the content was clearly mirrored on `ipfs.ela.city` and reachable to anyone on the public web. This led the user to (correctly) ask whether the badge was lying — and yes, it was.

**Root cause**: the backend endpoint `/api/catalog/providers/:cid` was a thin wrapper around `IPFSStorage.countProviders()`, which only consulted libp2p's DHT via `findProviders()` with an 8s timeout. Two issues compounded:

1. Elacity's IPFS gateway (Kubo) doesn't always re-announce CIDs on the public DHT in a window libp2p can observe within 8s — so the DHT walk frequently returns 0 PROVIDER events even when the content is fully pinned and HTTP-reachable on `ipfs.ela.city`.
2. The PC2 indexer auto-pins every indexed asset locally (which is the intended behaviour — that's how the marketplace catalog gets seeded). So `is_local: true` is true for every catalog row on a node that's done its first scan. Combined with `providers === 0`, the frontend then renders "This node only" — which is the **worst possible** answer because it implies the asset is in danger of disappearing if your node goes down.

The truth on a typical Jetson catalog: 22 of 24 assets ARE replicated on `ipfs.ela.city` (verified via direct HEAD probe). Only 2 are genuinely local-only.

**Fix**: `/api/catalog/providers/:cid` now runs the DHT lookup and an HTTP HEAD probe of two known public IPFS gateways (`ipfs.ela.city`, `dweb.link`) in parallel via `Promise.all`. The DHT timeout was also reduced from 8s to 5s for snappier UX (the parallel gateway probe is bounded at 3s, so the total endpoint latency is ~5s worst case instead of ~8s).

New response shape:
```json
{
  "success": true,
  "cid": "Qm...",
  "providers": 0,
  "gateways": [
    { "name": "ipfs.ela.city", "reachable": true },
    { "name": "dweb.link", "reachable": false }
  ],
  "publiclyReachable": true
}
```

Frontend badge logic in `app.js` updated to interpret this:

| DHT count | Public gateway reachable | `_isLocal` | New badge |
|---|---|---|---|
| > 0 | any | any | `N nodes seeding` (+ optional `on ipfs.ela.city`) |
| 0 | yes | true | `Replicated on ipfs.ela.city + this node` (green) |
| 0 | yes | false | `Replicated on ipfs.ela.city` (green) |
| 0 | no | true | `This node only` (amber — now actually accurate) |
| 0 | no | false | `Discovering peers…` (grey) |

Result: assets that are publicly available now correctly say so, and the amber `This node only` warning is now reserved for assets that genuinely have no public gateway mirror — making it actionable (e.g. "you should ask the publisher to peer with `ipfs.ela.city`" rather than "this is normal, ignore it").

Note: `dweb.link` (Protocol Labs' public gateway) frequently returns false on Elacity-ecosystem CIDs because dweb.link relies on its own DHT crawl which doesn't see Kubo announcements from `ipfs.ela.city` either. We probe it anyway as a secondary signal — useful for content uploaded directly to other IPFS-pinning services (Pinata, Filebase, etc.) that DO announce widely.

Files: `pc2-node/src/api/index.ts` (`/api/catalog/providers/:cid` endpoint — added parallel HTTP HEAD probe), `pc2-node/data/test-apps/elacity-market/app.js` (badge interpretation logic in the seeding-row update path), `pc2-node/data/test-apps/elacity-market/styles.css` (new `.seeding-badge.public` rule — green pill for the replicated-on-public-gateway case). Cache-busters bumped (`app.js?v=58` → `?v=59`, `styles.css?v=34` → `?v=35`).

**Follow-up polish (same session):** the first iteration's badge text — "Replicated on ipfs.ela.city + this node" — was visually correct but too long for the property row's column width and got truncated mid-word ("…this nod"). Replaced with a compact "**N sources**" pill that opens a hover/focus dropdown listing each source with its role:

```
2 sources ▾
┌─ Sources ──────────────┐
│ This node              │
│   pinned locally       │
│ ipfs.ela.city          │
│   public IPFS gateway  │
└────────────────────────┘
```

Source list construction (de-duplicated):
- `_isLocal === true` → adds `"This node"` row (pinned locally)
- Each reachable gateway → adds `"<gateway-name>"` row
- DHT count > 0 → adds `"N DHT peer(s)"` row (counted as one bucket so we don't claim "1000 peers" when libp2p happened to walk a chatty area)

Edge cases: 0 sources → `"Discovering peers…"` (grey). Exactly 1 source which is `This node` → `"This node only"` (amber, unchanged behaviour). Otherwise green.

The dropdown is keyboard-accessible (`tabindex=0`, `role=button`, `aria-haspopup=true`) and works on hover via `:hover` AND on touch/keyboard via `:focus-within`. Closes when the user moves focus or clicks elsewhere.

Files: `pc2-node/data/test-apps/elacity-market/app.js` (rewrote the seeding-row render to build a structured source list + dropdown markup), `pc2-node/data/test-apps/elacity-market/styles.css` (new `.seeding-badge.has-dropdown`, `.seeding-caret`, `.seeding-dropdown`, `.seeding-source-detail` rules — uses theme tokens for dark/light mode support). Cache-busters bumped (`app.js?v=59` → `?v=60`, `styles.css?v=35` → `?v=36`).

#### 18. Encrypted-DASH playback fixed: codec strings now include profile/level

A paid (encrypted) video upload completed all 10 pipeline steps (Analyze → Transcode → Fragment → Encrypt → Upload → Finalize IPFS → Upload Metadata → Verify on Network → Mint on-chain → Set Marketplace Approval), but the player rejected playback with:

```
Playback Error
Video codec "avc1" is not supported by this browser.
Please update your browser or contact the creator.
```

The same source video played fine when uploaded as a free (cleartext) asset, because cleartext playback uses progressive `<video src="…">` (browser does its own codec sniffing) while encrypted-DASH uses MediaSource Extensions (MSE) which is **strict** about codec strings: `MediaSource.isTypeSupported('video/mp4; codecs="avc1"')` returns `false` because the browser needs the profile/compat/level suffix (e.g. `avc1.640028` for H.264 High Profile Level 4.0).

**Root cause**: the JS fMP4 parser (`mp4split.ts → parseCodecString`) searched for the `avcC` sub-box starting **immediately after** the `avc1` sample-entry's box header — but ISO/IEC 14496-12 § 8.5.2 puts 78 bytes of fixed `VisualSampleEntry` fields (6 reserved + 2 data_reference_index + 16 pre_defined + 4 width + 4 height + 8 resolution + 4 reserved + 2 frame_count + 32 compressorname + 2 depth + 2 pre_defined) BETWEEN the entry header and any contained boxes. The parser's scan from offset 0 of those fixed bytes hits 8 zero bytes which `readBoxHeader` interprets as a `{size: 0, type: '\0\0\0\0'}` pseudo-box — and `size === 0` means "extends to end of buffer", so `findBox` skips everything in one giant stride and returns null for `avcC`. The parser then falls back to returning the bare fourcc `'avc1'` (no profile/level), which gets baked into the DASH MPD's `codecs="…"` attribute, and the player can't validate it.

This bug has been latent in the JS parser. It bit us **now** because:
1. v1.2.6 added an ffmpeg-based fragmentation fallback for arm64 Linux (Bento4 has no arm64 prebuild).
2. The JS parser only kicks in via `splitFragmentedMP4FromBuffer`, which the WASM split path falls back to on errors.
3. ffmpeg's output is fully ISO-compliant — `avc1` sample entries DO have the 78-byte VisualSampleEntry header — so the parser's incorrect search start exposes the bug.
4. We don't have a Bento4 baseline on the Jetson to A/B against, but the WASM parser (separately compiled, source not in this repo) appears to have a similar issue: it returned `codec: "avc1"` for the Jetson's encrypted upload too.

**Fixes** (`mp4split.ts`):

1. **Defensive constant + correct child-box scan start.** Added `VISUAL_SAMPLE_ENTRY_FIXED_BYTES = 78` and `AUDIO_SAMPLE_ENTRY_FIXED_BYTES = 28`. `parseCodecString` now starts the `findBox(avcC|esds|av1C)` scan at `entry.start + entry.headerSize + 78` for visual entries (`avc1`/`avc3`/`hev1`/`hvc1`/`av01`) and `+ 28` for audio entries (`mp4a`/`Opus`/`fLaC`). This is the right behaviour per ISO/IEC 14496-12 § 8.5.2.

2. **WASM-path safety net.** Added `refineCodecsFromInitSegment(initSegment, tracks)` which re-runs the fixed JS parser on the init segment after `splitFragmentedMP4WASM` returns and overrides any track's `codec` field with a more-specific string (e.g. replaces bare `"avc1"` with `"avc1.640028"`). Tracks are matched by `trackId`. Init segments are tiny (~KB), so the extra parse is free. This protects against future WASM regressions and the case where the WASM parser is correct on some inputs and wrong on others.

Result: encrypted-DASH playback now works for the paid upload. The MPD's `codecs="…"` attribute carries the full profile/compat/level, MSE accepts the type, and the player loads init + segments cleanly.

Note: paid assets that were **already minted** with the broken codec string in their on-chain metadata + IPFS-pinned MPD will still fail — they need to be **re-encoded** (re-mint, new tokenId). For the first pre-fix paid upload on the Jetson, the simplest recovery is to re-upload as a fresh paid asset; the bad one can stay listed but won't play. (A delist on the bad token is harmless — frees up that listing slot.)

Files: `pc2-node/src/services/media/mp4split.ts` (added 78/28 byte constants + correct child-box scan + new `refineCodecsFromInitSegment` post-pass on the WASM split path).

#### 19. Encrypted-DASH playback fixed (part 2): ffmpeg fragmenter now matches Bento4 topology

The codec-string fix in #18 unblocked MSE codec validation, but the same paid upload then failed at the next step with:

```
[player] sourceended fired, readyState: ended
[player] <video> error event: code=3 message=PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED:
        RunSegmentParserLoop: stream parsing failed.
```

The init segment appended cleanly; the **first media segment** failed. Mac-fragmented assets (Bento4) play fine on the Jetson, so the issue is specific to the Jetson's ffmpeg-fallback fragmentation introduced in v1.2.6.

**Root cause** — `mp4dump` of equivalent fragments shows the structural divergence:

| Property | Bento4 `mp4fragment` | ffmpeg default |
|---|---|---|
| Moof topology | **1 traf per moof** (alternating V / A / V / A …) | **1 moof with 2 trafs** (V + A muxed) |
| Per-asset moof count (~3 min video, 4 s frag) | 87 moofs | 85 moofs |

The cenc-encrypt WASM (`pc2-node/crates/cenc-encrypt/src/mp4box.rs:156-166`) walks the boxes inside each moof, takes the **first** `[traf]` it encounters, and breaks out of the loop. With Bento4-shaped fragments that's correct — there's only ever one traf per moof. With ffmpeg's default multi-traf moof, the WASM only encrypts the first track and silently drops senc/saio entries for the second; the resulting segment is malformed and Chrome's demuxer rejects it.

**Fix** (`pc2-node/src/services/media/encoder.ts`): added `+separate_moof` to the ffmpeg `-movflags`. This forces one-traf-per-moof, matching the Bento4 topology the WASMs were written against. The flag string is now `+frag_keyframe+empty_moov+default_base_moof+separate_moof`. Verified locally with `mp4dump`: ffmpeg now emits 170 moofs for the same input (~85 video + 85 audio, alternating), each with exactly 1 traf — structurally equivalent to Bento4's output.

The remaining tfhd/trun **flag-bit** differences between Bento4 and ffmpeg are mathematically equivalent (Bento4 lists per-sample duration+size+flags explicitly in trun; ffmpeg uses tfhd defaults where samples are uniform). Both layouts carry complete per-sample information — a spec-compliant parser reads both correctly, and the WASM does.

**No changes to**: any Rust crate, any WASM binary, the Bento4 path (Mac / x86 Linux), or any cleartext-playback path. The change is isolated to the ffmpeg fallback used only when no Bento4 prebuild exists for the platform (currently arm64 Linux only).

Files: `pc2-node/src/services/media/encoder.ts` (added `+separate_moof` to the ffmpeg `-movflags`, updated comments to document the structural parity requirement).

#### 20. Buy modal now shows wallet balances so the user can pick informedly

When buying a paid asset, the "Choose Wallet for Purchase" modal listed both wallets (Agent Account / EOA) with addresses but **no balance**, so the user had to guess which wallet had enough USDC for the purchase. If they picked wrong, the on-chain transaction would revert and they'd burn gas + a confusing error.

**Fix** (`pc2-node/data/test-apps/elacity-market/`): the modal now fetches the **payment-token balance** of each wallet (USDC for paid assets, ETH for native-priced assets) and shows it under the address as `0.05 USDC available`. When the wallet's balance is below the asset's price, the line turns red and prefixes a `⚠` so insufficient balance is visually obvious before submission. Balances load asynchronously and don't block the user from picking — they can still proceed and let the on-chain tx revert if they want to.

Implementation: `showWalletChoiceModal(payToken, priceWei)` now takes the listing's payment token + price, calls `Wallet.getERC20Balance` (or `getNativeBalance`) per wallet, formats with `Wallet.getTokenDecimals`, and applies an `.insufficient` class when raw balance < required. The same balance-fetch pattern was already in use by the subscription modal — extracted just enough to share the visual treatment.

Files: `pc2-node/data/test-apps/elacity-market/index.html` (added `<span class="wallet-choice-balance">` to each option), `app.js` (extended `showWalletChoiceModal` + threaded `listing.payToken`/`listing.price` through `handleBuy`), `styles.css` (`.wallet-choice-balance` + `.wallet-choice-balance.insufficient`). Cache-busters bumped (`app.js?v=60 → ?v=61`, `styles.css?v=36 → ?v=37`).

#### 21. Email-login signature prompt no longer hidden behind "Verifying wallet ownership" overlay

The full-screen "Verifying wallet ownership" overlay was added in v1.2.5 for **external-wallet** sign-in (MetaMask, WalletConnect, Coinbase) — there the signature prompt happens in a browser-extension popup or mobile-app push, OUTSIDE this page, so a fullscreen blocker is fine and even helpful: it tells the user "stop, look at your wallet, not the page".

**The bug**: when email login was enabled, the same overlay was used. But Particle's email-flow signature prompt happens **inside the Particle iframe** on this page. The fullscreen overlay (`position: fixed; inset: 0; z-index: 2147483646`) covered the iframe, hiding Particle's confirm dialog. The user could see the overlay's "Check your wallet" message but had no wallet to check — the dialog they needed to click was sitting underneath the overlay, unclickable. Stuck.

**Fix** (`src/gui/src/UI/UIWindowParticleLogin.js`): added a `position` option to `showLoginStatusOverlay` with two modes:

- `'fullscreen'` (default, used for `metamask` / `walletconnect` / `coinbase`): centered modal with backdrop, current behavior.
- `'corner'` (used for everything else, including `email`): compact bottom-right panel, no backdrop, **doesn't cover the iframe**. Visual language matches `buildWalletConnectPanel` in `UIWindowParticleSigning.js` so the corner-toast pattern is consistent across PC2 (already used for WC sign requests for the same reason: don't cover the dApp the user is interacting with).

The SIWE-pending handler picks the position based on `payload.loginMethod` from the Particle iframe — known external-wallet methods get the fullscreen overlay, everything else gets the corner toast. The corner toast still shows the spinner, the title, the address-prefix message, and the same escalating hint timers (8s + 12s).

Files: `src/gui/src/UI/UIWindowParticleLogin.js` (extended `showLoginStatusOverlay` + branched the SIWE-pending handler on `loginMethod`), `pc2-node/frontend/index.html` + `pc2-node/scripts/build-frontend.js` (cache-buster bumped from `bundle.min.js?v=1.2.5` → `?v=1.2.6` so existing browsers fetch the updated bundle).

#### 22. Playback no longer bounces users with "ask publisher to peer" while their own pin is still in flight

Reported by a v1.2.5 community tester on a different Jetson: bought a paid video → clicked Play → got *"Content not yet reachable on IPFS. This asset was published from another node and has not propagated to the public gateway yet. Retry shortly, or ask the publisher to peer with ipfs.ela.city."* Despite the asset detail page below the player still showing the user's own download in progress (`Downloaded (193.5 MB) — you own this offline`).

The user's local pin job — kicked off at buy time by `ContentSeedingService` — was simply still running when they clicked Play. Local Helia gateway 404s for blocks not yet fetched, public gateway 404s for an asset just minted on a peer node, both timeout, the `/api/media/init` handler concluded "the asset is unreachable on IPFS" and gave the user the wrong action ("ask publisher to peer") when the right action was "wait 30 seconds for the download you already started to finish".

**Fix** (`pc2-node/src/api/media.ts:248-273`): before returning the legacy "ask publisher" 502, query `db.getPinnedCIDDetail(mediaUri)` to see if there's an active pin job for the media CID:

- `pin_status === 'pinning' | 'queued'` → return HTTP 503 with `code: 'pin_in_progress'`, `progressPercent`, `bytesDownloaded`, `sizeBytes`. Player consumes this and shows *"Downloading content to your node — 47% (90.5 / 193.5 MB)…"* on the loading screen, auto-retrying every 5s up to a 5-minute ceiling.
- `pin_status === 'failed'` → return `code: 'pin_failed'` with a message pointing the user to retry the download from the asset page.
- No pin record → keep the existing "ask publisher" error (genuinely unreachable, the user never started a download).

Frontend (`pc2-node/data/test-apps/pc2-media-runtime/player.js:937-985`): the init-failure path now loops on `code: 'pin_in_progress'`, repaints the loading screen with current progress, and re-tries `/init` every 5 seconds. When the pin completes, the next retry succeeds and playback proceeds normally — no error screen flashed in between. Bounded by `MAX_PIN_WAIT_RETRIES = 60` (5 min) so a wedged pin eventually surfaces a real error.

What this is NOT (and the boundary matters):
- This is NOT auto-pinning on `/init`. The pin job already exists from the buy flow. We're only checking its status to avoid lying to the user about why playback isn't working.
- This is NOT changing IPFS gateway logic, peer discovery, or the 10s per-gateway timeout.
- For users who never bought (no pin job) the existing behavior is preserved — they still see "Content not yet reachable on IPFS".

Files: `pc2-node/src/api/media.ts` (added pin-status check before the 502 fall-through, returns `code: 'pin_in_progress'` / `'pin_failed'`), `pc2-node/data/test-apps/pc2-media-runtime/player.js` (auto-retry loop on `pin_in_progress`), `pc2-node/data/test-apps/pc2-media-runtime/index.html` (cache-buster bumped `player.js?v=6-pipelined → ?v=7-pin-progress`).

#### 23. External-wallet secure-view delegation now has a forced-attention overlay (closes EverlastingOS bundle-required class)

Reported by a v1.2.5 community tester: bought their first paid asset, clicked Open on the ebook viewer, got `session_bundle_required` from the server. Their install was fine — the secure-view module had not changed between v1.2.5 and v1.2.6 — and the bundle WOULD have built if they had signed the one-time `personal_sign` request that authorises the 24h session-key delegation. They simply never noticed the prompt: their wallet popup was blocked / sat in another window / never propagated to their attention. The page itself gave them zero indication that anything was waiting on them.

Root cause is a UX asymmetry between login methods, not a security bug:

- **Embedded login (Particle email / social):** `walletPersonalSign` routes via `pc2RouteRpcToParticle('personal_sign', …)` → `WalletService.routeRpcToParticle` → `UIWindowParticleSigning`, which already throws a fullscreen backdrop + centered Particle iframe + cancel button. Forced-attention UX, you can't miss it.
- **External wallet (MetaMask / WalletConnect / Coinbase):** `walletPersonalSign` calls `window.ethereum.request({ method: 'personal_sign', … })` directly. **No PC2 parent-side UI at all.** The only cue is the wallet's own popup, which is exactly the thing that fails reliably (extension popup blockers, mobile push delays, alt-tab confusion, etc).

Fix is asymmetric and minimal: add a parent-frame **bottom-right corner toast** (same visual pattern as `buildWalletConnectPanel` in `UIWindowParticleSigning.js`, used elsewhere in PC2 for "your wallet is waiting on you" cues) on the external-wallet path only, deliberately leaving the embedded path untouched because `UIWindowParticleSigning` already handles it. Why corner-toast over fullscreen-backdrop? For external wallets the signature popup lives outside the page (browser-extension popup OR a separate mobile WC app), so a fullscreen backdrop adds visual takeover without adding visibility — the user can already see/click the wallet popup either way. The corner toast just adds a "we're waiting on you, here's why" cue without dimming the whole page.

Implementation:

- `src/gui/src/UI/UIWindowParticleLogin.js`: expose the existing `showLoginStatusOverlay({ position: 'fullscreen' | 'corner' })` helper as `window.pc2ShowLoginStatusOverlay` so non-bundled top-frame scripts can use it (`pc2-secure-view.js` is loaded as a `<script src>`, not bundled).
- `pc2-node/src/wallet-bridge/pc2-secure-view.js → runDelegationFlow()`: wrap the `walletPersonalSign(canonical, signerAddr)` call **strictly** with overlay setup before (`position: 'corner'`) and `clearOverlay()` on both `.then` (success) and `.catch` (cancel/reject/timeout). Wallet-label text is derived from `globalScope.user.login_method` (`MetaMask` / `your wallet app` / `Coinbase Wallet` / fallback `your wallet`).

Two carefully scoped guards verified during code review:

1. **Overlay must NEVER appear when not needed.** `runDelegationFlow` is only entered when (a) no IndexedDB delegation exists, OR (b) the cached delegation is expired/invalid. `ensureSession`'s fast path returns the cached state directly without calling `runDelegationFlow`. So once a user signs once, the overlay never shows again until either the 24h delegation expires or the user explicitly logs out (which calls `revoke()`). Verified by trace: every paid-asset open in cached state goes `signRequest → ensureSession (cache hit) → SVS.signRequest(kp, …)` — no `walletPersonalSign`, no overlay.

2. **Both viewer runtimes are covered by ONE fix point.** Ebook/image/PDF viewers (`pc2-node/data/test-apps/ddrm-viewer/`) and the video/audio player (`pc2-node/data/test-apps/pc2-media-runtime/`) both call `pc2_secureView_sign` via `pc2-wallet-bridge.js`, which in turn invokes `window.pc2SecureView.signRequest({ kid, … })` on the parent frame — i.e. the same `pc2-secure-view.js` module. The overlay fix lives at the choke-point of that module, so both runtimes get the fix automatically without per-runtime patches.

Hint escalation matches existing PC2 conventions (corner-toast text is concise to fit the 320px-wide panel):
- 0s: *"Approve secure-view session — Check MetaMask — one signature unlocks paid content for 24h."*
- +8s: *"Still waiting — open MetaMask to approve."*
- +20s: *"If your wallet didn't prompt, the popup may have been blocked."*

The overlay clears the moment the wallet returns a signature (so the user sees an instant transition), or the moment they hit cancel / the wallet rejects (so they're not stuck behind a frozen modal while the error propagates back through `ensureSession` → `signRequest` → the iframe).

Files: `src/gui/src/UI/UIWindowParticleLogin.js` (3-line global export at module bottom), `pc2-node/src/wallet-bridge/pc2-secure-view.js` (overlay wrap + cleanup in both `.then` and `.catch` paths inside `runDelegationFlow`). Cache-busters bumped: `pc2-secure-view.js?v=20260501a → ?v=20260501b` (in both `pc2-node/scripts/build-frontend.js` template and the regenerated `pc2-node/frontend/index.html`). GUI bundle (`pc2-node/frontend/bundle.min.js`) rebuilt to include the new `window.pc2ShowLoginStatusOverlay` export.

#### 15. Marketplace polish round (after live testing on Jetson)

Four small, user-reported bugs fixed in one round after testing the v1.2.6 indexer-listing-fetch on the Jetson. None block functionality, but each makes the difference between "looks rough" and "looks ready".

**a. Edit Price modal: balance text was invisible (dark on dark).** The "List Access Token for Resale" modal's wallet-balance summary box used `background: var(--card-bg, #1a1a2e)` (a dark theme token) inside a light-theme modal — the inherited dark text rendered nearly invisible on the dark box. Replaced with explicit light theme colors (`background: #f3f4f6; color: #111827; border: 1px solid #e5e7eb`) so the box matches the rest of the modal regardless of theme.

**b. Royalty sections squished against each other.** "Royalty Share Offers / Make Offer" (an inline `.offer-section`) had `margin-top: 12px` but no `margin-bottom`, so it touched the next "Royalty Market" collapsible directly. Symmetric `margin-bottom: 12px` added so all three royalty-related sections (Royalty Shares, Royalty Share Offers, Royalty Market) have consistent spacing.

**c. Search bar didn't actually search the local catalog.** `fetchItems(query, filters)` passed `filters.searchBy` along but `fetchFromCatalog` only honored `offset` / `limit`, and `applyClientSideFilters` only handled `filterby` / `contentType` chips. The remote GraphQL fallback path DID honor the search term, but it only kicked in when the local catalog returned 0 items — so on every PC2 node running on its own catalog, typing in the search bar returned the entire catalog regardless of query. New `applySearchTerm()` filters the local-catalog batch case-insensitively against `name`, `description`, `channel.name`, and `creator.address`. Future enhancement: push this into a SQL `LIKE` in the backend so we don't have to filter client-side after fetching everything.

**d. Indexer image fallback to `media.previewURL` when `metadata.image` is empty.** Several older assets (5 of 24 in a typical Jetson catalog) shipped with `metadata.image = ""` and only a `media.previewURL` field. The indexer's previous `image_url: metadata.image || null` rule stored `null`, so feed cards fell through to the type-icon placeholder (`◻`) instead of showing a real preview. Updated to `image_url: metadata.image || metadata.media?.previewURL || null`. Recovered 2 of the 5 thumbnail-less rows immediately on a Jetson backfill (Purple Rain Cover audio, Video). The remaining 3 (Elacity image, Naval Ravikant ebook, alice-in-wonderland ebook) genuinely have no thumbnail field anywhere in their on-chain metadata — those will continue to show the type-icon placeholder until republished.

Files: `pc2-node/src/services/ContentIndexerService.ts` (previewURL fallback), `pc2-node/data/test-apps/elacity-market/api.js` (`applySearchTerm()`), `pc2-node/data/test-apps/elacity-market/app-features.js` (light-theme balance box), `pc2-node/data/test-apps/elacity-market/styles.css` (`.offer-section { margin-bottom: 12px }`). Cache-busters bumped (`api.js?v=36 → ?v=37`, `app-features.js?v=41 → ?v=42`, `styles.css?v=33 → ?v=34`).

#### 14. Indexer fetches live listing prices so feed cards show real prices

Phase A of #13 unblocked the feed display by surfacing on-chain `op_type` correctly — but a paid asset still had no price to render until someone visited its detail page (which queried `getActiveAccessSellers` + `getAccessListing` on the AuthorityGateway client-side). On the home feed, paid assets fell back to a tier label (`Buy & Resell` / `Buy Once`).

**Phase B: indexer-level listing fetch.** `ContentIndexerService` now queries the AuthorityGateway directly during every scan cycle:

1. After metadata resolution, iterate every catalog row with `op_type > 0` and a non-zero `operative_address` (skips free assets — they have no listings — and rows with no business-model contract).
2. Per row: call `sellersOf(operative, TOKEN_ID_ACCESS=1)` → returns the addresses currently listing the access token.
3. Per seller: call `listings(operative, 1, seller)` → returns `(quantity, pricePerToken, payToken)`. Skip listings with `quantity === 0` (sold out / withdrawn).
4. Pick the **lowest `pricePerToken`** with `payToken` among active listings, store both in the catalog row (`price` + `payment_token` columns).
5. Rows with no active listings get `price = NULL` (paid-but-unlisted is still a meaningful state — keeps the tier-label fallback path correct).

`api.js → catalogItemToNft()` now also surfaces `nft.price` (decimal-converted, e.g. `0.01` for 10000 wei USDC) and `nft.paymentToken` at the top level so the existing `formatPrice(item.price, item.paymentToken)` call in the card render path works without changes. USDC = 6 decimals, ETH/native = 18.

**Result on a typical Jetson catalog**: 22 paid assets now show real prices like `0.01 USDC` on their feed cards. The 1 unlisted paid asset still shows the `Buy & Resell` tier badge (correct — there's no listing). The 1 free asset shows the green `Free` badge (unchanged).

**RPC budget**: 1 `sellersOf` + N `listings` per paid row per scan cycle. With 23 paid rows averaging ~1 seller each, that's ~46 RPC calls per cycle (every 30 minutes by default) — negligible. Concurrency-limited via `metadataFetchConcurrency` to be polite to the RPC endpoint.

Files: `pc2-node/src/services/ContentIndexerService.ts` (`fetchLowestListing()`, `refreshListingsForPaidAssets()`, ABI helpers), `pc2-node/src/storage/database.ts` (`getPaidCatalogItemsForListingRefresh()`), `pc2-node/data/test-apps/elacity-market/api.js` (`catalogResolveTopLevelPrice()`, `nft.price` / `nft.paymentToken` surfaced). Cache-buster bumped (`api.js?v=35` → `?v=36`).

#### 13. Feed cards correctly identify paid vs free assets

The home-feed card render was incorrectly tagging **every asset** as `Free`, regardless of its actual on-chain pricing model. With 23 of 24 indexed assets actually `op_type=2` (Buy & Resell) on a typical PC2 node, this made the feed look like the marketplace was giving everything away.

Two compounding root causes:

1. **Frontend adapter ignored on-chain truth.** `api.js → catalogItemToNft()` resolved opType from `metadata.pricing.accessMethod` (a legacy v1.0 schema field) and ignored the catalog row's `op_type` / `price` / `payment_token` columns — which the indexer DOES populate from the operative contract's `AssetCreated` event. New asset metadata schemas (v1.1+) no longer embed pricing inline, so every paid asset fell through to the metadata-pricing fallback and was labeled `Free`.
2. **Local catalog endpoint had no server-side filtering.** Chip selection (`Buy Now`, `Free`, `Video`, etc.) sent `filterby` / `contentType` query hints, but `/api/catalog` returned the full unfiltered batch and only the remote GraphQL fallback honored them — meaning chips were essentially decorative on every PC2 node running on its own catalog.

**Fixes**:

- `api.js`: New `catalogResolveOpType()` and `catalogResolveListings()` helpers prefer the indexer's `item.op_type` / `item.price` / `item.payment_token` columns over metadata inference. Falls back to `metadata.pricing` only when the indexer hasn't yet captured on-chain values (transitional case for not-yet-indexed assets).
- `api.js`: New `applyClientSideFilters()` runs in `fetchItems()` after the catalog batch returns. Filters by `filterby: ['buyNow' | 'free']` and `contentType: ['video' | 'audio' | 'image' | 'ebook' | '3d']` on the already-resolved opType. Chip selection now actually narrows the visible set.
- `api.js`: New `free` preset (`filterby: ['free']`); dropped `popular` chip (which sorted by view count — meaningless for empty/local catalogs).
- `app.js` card render: When opType is `1` (Buy Once) or `2` (Buy & Resell) but no listing price has been captured yet, the card shows a tier label (`Buy Once` / `Buy & Resell`) on a yellow `.tier-badge` instead of nothing or `Free`. Free items keep the green `Free` badge unchanged. (Phase B follow-up: indexer should also populate the `price` column from current listings so cards show actual prices instead of tier labels — tracked separately.)
- `index.html` chip layout: `All | Buy Now | Free  │  Video | Audio | Image | Ebook | 3D  │  18+`. Default selection: `All` (was `Buy Now`).
- `app.js` state default: `activeCategory: 'all'` (was `'buyNow'`).
- `styles.css`: New `.tier-badge` (yellow `#fbbf24` on dark) for the paid-but-unlisted case.

Result: a freshly-loaded feed correctly identifies each card's pricing model. The 23 paid + 1 free assets in a typical Jetson catalog now show 23 `Buy & Resell` badges and 1 `Free` badge instead of 24 misleading `Free` badges. Chip selection actually filters.

**Renamed**: "NFT Asset" → "Asset Token Contract" in the on-chain identity rows on the asset detail page, per UX feedback ("NFT" carries speculative-asset baggage that doesn't fit free / utility content). Pairs cleanly with the existing "Operative Contract" label.

#### 12. On-chain identity surfaced on every asset detail page (free + paid)

The asset detail page's **Properties** block (which contains all the on-chain provenance info — Contract, Authority, Blockchain) was being completely hidden for free assets by a stale early-return guard:

```js
if (!totalSupply && opType === 0) {
  dom.detailSupplyInfo.classList.add('hidden');
  return;
}
```

Free assets typically have no access-NFT supply (anyone can stream them straight from IPFS), so they hit this guard and lost ALL on-chain info — even though the asset is fully indexed by the catalog with a verifiable NFT contract, token ID, and IPFS content CID. Users had no way to verify what they were looking at on-chain.

A second related gap: even when the Properties block WAS visible (paid assets), it only surfaced the **operative contract** (the business-model contract — TradeGateway / Reseller / etc.) labeled simply as "Contract". The actual **NFT contract** (the ERC-1155 access-token contract — i.e. the asset itself) was not shown anywhere, nor was the **token ID**, nor the **IPFS content CID**. So even on paid assets users couldn't independently verify on-chain provenance through Basescan + IPFS gateways.

**Fix**: `renderSupplyInfo()` reworked to:

1. Replace the hard hide-on-free guard with a `showSupplyBar = (opType !== 0) && (totalSupply > 0)` gate. Free assets now render the props-grid (their on-chain identity) without the supply-bar UI (which is meaningless without listings).
2. Also conditionally render the `Total Supply` and `Available` rows only when `totalSupply > 0` — same reason.
3. Add a new on-chain identity block (visible on every indexed asset, free + paid) with four rows:
   - **NFT Asset** — `nft.contractAddress` → clickable Basescan link with copy-to-clipboard
   - **Token ID** — `nft.tokenId.hexTokenID` (or numeric) → mono-formatted, truncated, copy-to-clipboard
   - **IPFS Content** — `nft._contentCid` → two links: local `/ipfs/<cid>` (loads via this PC2 node, auto-pins) + small `verify` link to public `ipfs.ela.city` gateway, plus copy-to-clipboard
   - **Operative Contract** — `operative.address` → clickable Basescan link with copy-to-clipboard. **Renamed from "Contract"** for clarity (it's the business-model contract, not the NFT itself).

Result: any visitor of a detail page can verify on-chain provenance independently — works the same for free and paid content. Free assets get the same accountability as paid ones.

Files: `app.js` (`renderSupplyInfo()`), `styles.css` (`.onchain-mono`, `.onchain-public-link`, `.onchain-copy-btn`). Cache-busters bumped (`app.js?v=55` → `?v=56`, `styles.css?v=31` → `?v=32`).

### Files changed

- `pc2-node/package.json` — `better-sqlite3` ^9.2.2 → ^11.10.0
- `pc2-node/package-lock.json` — regenerated
- `pc2-node/src/services/UpdateService.ts` — native module verification step before restart
- `pc2-node/src/services/media/bento4.ts` — ffmpeg fallback for platforms with no Bento4 prebuild
- `pc2-node/src/services/media/encoder.ts` — `fragmentMedia()` dispatches between mp4fragment and ffmpeg
- `pc2-node/src/api/media.ts` — passes `useFfmpegFallback` flag through to `fragmentMedia()`
- `pc2-node/src/services/ContentIndexerService.ts` — `fetchMetadata()` uses local PC2 gateway first, rejects directory-listing JSON, requires real metadata-shape fields; new `refreshListingsForPaidAssets()` + `fetchLowestListing()` query AuthorityGateway `sellersOf` + `listings` after metadata resolution to populate `price` / `payment_token` columns from live listings (paid assets only; concurrency-limited); thumbnail fallback `metadata.image || metadata.media.previewURL`
- `pc2-node/src/storage/database.ts` — `getCatalogItemsPendingMetadata()` retry-after 1h → 5min; new `getPaidCatalogItemsForListingRefresh()` returns paid resolved rows for the listing-refresh pass
- `pc2-node/src/api/public.ts` — `isContentMissingError()` classifies ENOENT / "no such file" as auto-pinnable
- `pc2-node/src/api/index.ts` — `/api/catalog/providers/:cid` now runs DHT findProviders (5s) and parallel HTTP HEAD probes of `ipfs.ela.city` + `dweb.link` (3s) so the asset detail page's `Network` row can accurately distinguish "publicly replicated" from "this node only"
- `pc2-node/src/services/media/mp4split.ts` — `parseCodecString` now correctly skips the 78-byte `VisualSampleEntry` / 28-byte `AudioSampleEntry` fixed-field region per ISO/IEC 14496-12 § 8.5.2 before scanning for `avcC` / `esds` / `av1C` sub-boxes, so codec strings include profile/compat/level (e.g. `avc1.640028` instead of bare `avc1`); new `refineCodecsFromInitSegment` post-pass on the WASM split path overrides any incomplete codec string returned by `mp4-split.wasm`. Fixes "Video codec 'avc1' is not supported by this browser" on encrypted-DASH playback
- `pc2-node/data/test-apps/elacity-market/api.js` — `catalogResolveOpType()` + `catalogResolveListings()` prefer indexed on-chain `op_type` / `price` / `payment_token` over metadata-inferred values; new `catalogResolveTopLevelPrice()` exposes decimal-converted `nft.price` + `nft.paymentToken` so feed cards display real prices from the indexer's live-listing fetch; new `free` PRESET; dropped `popular` PRESET; new `applyClientSideFilters()` honors chip selection on local-catalog path; new `applySearchTerm()` filters local-catalog batch by name/description/channel/creator (search bar was previously a no-op for the local catalog path); passes `_rawAssetType` through for content-type matching
- `pc2-node/data/test-apps/elacity-market/app.js` — play/download buttons reveal on `isOwned || isFree`; `handlePlay()` cleartext path for free / direct-playback assets; `renderSupplyInfo()` reworked to keep Properties visible on free assets and add Asset Token Contract / Token ID / IPFS Content rows + rename Contract → Operative Contract; card render now shows tier label (`Buy Once` / `Buy & Resell`) for paid-but-unlisted assets instead of misleading `Free`; `activeCategory` default `buyNow` → `all`; Revenue & Earnings `formatPrice` calls now pass USDC payment-token so amounts label correctly as `USDC` instead of defaulting to `ETH`; seeding-row badge rewritten to show a compact "N sources" pill with a keyboard-accessible hover/focus dropdown listing each source (this node, public gateways, DHT peer count) — replaces the truncating "Replicated on ipfs.ela.city + this node" string and gives the user expandable detail on demand
- `pc2-node/data/test-apps/elacity-market/app-features.js` — `renderAssetOwnerActions()`, `renderOfferSection()`, `renderOrderBook()` all early-return on free assets (suppresses Publisher Actions, Royalty Share Offers / Make Offer, and Royalty Market sections); "List Access Token for Resale" balance box switched to explicit light-theme colors (no more invisible dark-on-dark text)
- `pc2-node/data/test-apps/elacity-market/index.html` — cache-buster bumps (api.js v34→v37, app.js v53→v60, app-features.js v39→v42, styles.css v30→v36); Share button hidden via `class="hidden"`; filter chips reordered to `All | Buy Now | Free  │  Video | Audio | Image | Ebook | 3D  │  18+` (drops `Popular`, adds `Free` / `Ebook` / `3D`)
- `pc2-node/data/test-apps/elacity-market/styles.css` — removed leftover `margin-bottom: 12px` from `.download-node-btn` and `.open-viewer-btn`; added `.onchain-mono`, `.onchain-public-link`, `.onchain-copy-btn` styles for the on-chain identity rows; added `.tier-badge` for paid-but-unlisted card state; added `margin-bottom: 12px` to `.offer-section` so Royalty Share Offers no longer touches Royalty Market; added `.seeding-badge.public` (green pill) for the replicated-on-public-gateway state plus `.seeding-badge.has-dropdown`, `.seeding-caret`, `.seeding-dropdown`, `.seeding-source-detail` for the compact "N sources" pill with hover/focus dropdown
- `scripts/update.sh` — smarter safety guard, fix `bash bash` typo
- `elastos-launcher/src/main/pc2Manager.ts`:
  - `installPC2` — handle existing `~/.pc2` directory gracefully (repair vs backup)
  - `startPC2` — pre-flight native module load test
  - removed `--build-from-source` from install and update flows (v11 prebuilts work)

### Compatibility

- **better-sqlite3 v9 → v11**: same JavaScript API. Verified existing v9 databases (26 tables) open and read cleanly with v11 (SQLite 3.49.2). No data migration required.
- **Existing v1.2.5 nodes**: GUI auto-update or `update.sh` will pull v1.2.6 cleanly. No manual steps needed.
- **Existing v1.2.0–v1.2.4 nodes**: same as above.

### What's NOT changed in v1.2.6

- VLESS Reality / sing-box / AmneziaWG — same as v1.2.5
- Frontend — same as v1.2.5
- Database schema — same as v1.2.5
- Networking architecture — same as v1.2.5

This is a pure install/update reliability release. No new features, no breaking changes.

### Known issues carried into v1.2.7

1. **Fresh-Mac install still requires Xcode CLT in some launcher paths.** §1 above shipped the right *intent* (no compiler needed) but `better-sqlite3`'s V8-specific ABI prebuilds + the launcher's force-rebuild pipeline mean a Mac without Xcode CLT can still end up with a wrong-ABI binary at `Database.initialize` time. **Fix path**: migrate to `@photostructure/sqlite` (drop-in, Node-API, prebuilds bundled inside npm tarball — eliminates the entire class of NODE_MODULE_VERSION mismatch bugs). Tracked in `.cursor/tasks/SQLITE-NO-COMPILE-MIGRATION/SQLITE-NO-COMPILE-MIGRATION.md` (Status: Proposed, awaiting approval).

2. **Launcher continues installation after gauntlet failure.** The launcher's verification gauntlet correctly detects an ABI mismatch and tells the user to `xcode-select --install`, but then continues to `Starting PC2 from …` instead of aborting. PC2 then crashes at `DatabaseManager.initialize`. This is a launcher-repo bug (separate codebase from `pc2.net`) — the gauntlet's failure path needs a hard `process.exit(1)` so the user sees the actionable error without a confusing crash log overwriting it.

3. **Bento4 path on linux-arm64**: still uses the ffmpeg fallback path introduced in §5. Not a bug — works correctly — but if/when bok.net publishes an arm64-Linux Bento4 build, we should switch back to mp4fragment for parity with x86_64 Linux and macOS.

4. **Paid-content playback fails inside MetaMask Mobile's in-app browser** (discovered 2026-05-02). When `zzz.ela.city` is opened inside MetaMask Mobile → Browser, login + general transactions (EOA → smart wallet transfer, signature requests) all work correctly — but tapping **Play** on a paid asset fails synchronously: the secure-view delegation toast flickers and disappears within ~200ms, no `personal_sign` prompt is shown to the user, and the runtime reports `Initialization failed: Invalid parameters: must provide an Ethereum address.`. The error originates in **Particle Auth's provider wrapper** (the bundled minified file `src/particle-auth/assets/index-CLS56Zo3.js` contains that exact validation string), which intercepts `window.ethereum` in the dapp iframe and pre-validates `personal_sign` parameters before they reach MetaMask Mobile. Login + send-transaction work because they go through different code paths that don't trigger the wrapper's validation in the same way. A full evening of remote diagnostic patches (hex-encoded message, lower-cased signer address, EIP-6963 provider discovery with RDNS whitelist, fresh `eth_accounts` re-fetch) all reproduced the same symptom — and were further hampered by aggressive in-app-browser caching that prevented later patches from loading on the user's phone, making remote debugging unproductive. **Fix path**: needs hands-on local debugging in MetaMask Mobile (USB / WebKit Inspector) against a controlled `pc2-secure-view.js` build to confirm whether (a) Particle's wrapper is the actual blocker and we need to bypass it more aggressively, or (b) MM Mobile itself has a stricter validation we're not yet matching, or (c) the issue is elsewhere entirely (e.g. iframe `sandbox` attributes, `window.ethereum` shadowing by `pc2-wallet-provider.js`). Tracked in `.cursor/tasks/SECURE-VIEW-MM-MOBILE-INAPP-BROWSER/SECURE-VIEW-MM-MOBILE-INAPP-BROWSER.md` (Status: Proposed, full diagnostic record + hypothesis tree included). Tonight's experimental patches were reverted so v1.2.6 ships clean — the bug only affects MM Mobile in-app browser; desktop browsers, Brave, Firefox, Safari, Chrome on iOS/Android, and even MM Mobile when used via WalletConnect from an external browser all work correctly.

These four are the only known issues. Everything in v1.2.6's headline list (§1–§23) is verified working on the Jetson at the v1.2.6 tag (commit `124823dd1`).

---

## [1.2.5] - 2026-05-01 (hotfix-on-hotfix)

> ## ⚠️ For users who installed v1.2.4 and got stuck
>
> If you installed v1.2.4 today and saw either:
>
> - **`OMG CMake executable is not found`** at the "Building native modules" step (Sasha's case), OR
> - **`Cannot find module '../../../build/Release/node_datachannel.node'`** in pm2 logs after install completed (Ahmed's case)
>
> Both are the same root cause: `node-datachannel` (a libp2p WebRTC transitive dep) tried to do a cmake-js source build because no prebuild exists for your Node ABI, and cmake wasn't installed. v1.2.4 didn't catch this and either crashed loudly (Sasha) or silently shipped a broken module (Ahmed).
>
> **Fix without re-installing everything:**
> ```bash
> # macOS
> brew install cmake
> cd ~/.pc2/pc2-node    # or ~/pc2.net/pc2-node depending on install
> npm rebuild node-datachannel
> pm2 restart pc2
>
> # Linux
> sudo apt install cmake
> cd ~/.pc2/pc2-node    # or ~/pc2.net/pc2-node depending on install
> npm rebuild node-datachannel
> pm2 restart pc2
> ```
>
> **Or (cleaner) re-run the v1.2.5 installer/updater** which now installs cmake up front and verifies node-datachannel loads before declaring success:
> ```bash
> # Update existing install:
> curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh | bash
> ```

### What v1.2.5 actually fixes

This is a hotfix for v1.2.4. The v1.2.4 release shipped two related regressions:

1. **`npm rebuild --build-from-source` for ALL native modules** (instead of just `better-sqlite3` like v1.2.3 did). This was over-aggressive paranoia. It exposed `node-datachannel`'s cmake-js source-build path on Macs without cmake installed. v1.2.5 reverts to the proven v1.2.3 strategy — only `better-sqlite3` gets force-built, everything else uses prebuilds when available.
2. **Per-module rebuild fallback didn't include `node-datachannel`**. When the bulk rebuild failed, the script silently skipped node-datachannel and declared success. The server then crash-looped on boot. v1.2.5 adds an explicit verification gauntlet that fails LOUDLY before pm2 ever starts the server.

### The verification gauntlet (Ahmed's contribution)

Both `start-local.sh` and `update.sh` now run a three-attempt verification for each critical native module (`better-sqlite3` and `node-datachannel`):

1. **Plain load** — works when prebuild-install resolved cleanly at install time.
2. **Rebuild** — covers ABI drift from a prior install (already done up-front).
3. **Clean reinstall** — `rm -rf node_modules/MOD && npm install MOD`. The nuclear option that forces `prebuild-install` to query fresh against the **current** Node ABI.

Why step 3 matters: Ahmed (Apr 30 2026) discovered that `npm rebuild` reuses the install-time prebuild metadata in `node_modules/MOD/`. If your Node binary changed since install (Homebrew auto-upgraded Node, you switched nvm versions, etc.), `npm rebuild` can succeed without actually fetching the right binary for your current Node. Only **clean reinstall** queries fresh. This is now baked into the scripts so users don't have to discover it themselves.

If all three steps fail for a critical module, the script exits with module-specific fix instructions (`brew install cmake` for node-datachannel, `xcode-select --install` for better-sqlite3, etc.) instead of letting pm2 silently crash-loop.

### Other v1.2.5 fixes

- **`update.sh` now sources nvm + probes common pm2 install paths** before running. v1.2.4's `update.sh` failed for users with nvm-installed pm2 (4HM3D's case) because the curl|bash invocation didn't have `~/.nvm/versions/node/*/bin` on PATH and `pm2 stop pc2` reported "command not found". Now it sources `~/.nvm/nvm.sh`, falls back to probing standard install locations, and exits with a clear "install pm2 first" error if it's genuinely missing.
- **`cmake` is now in the system-deps install list** for both macOS (Homebrew) and Debian/Ubuntu (apt-get). Belt-and-braces in case any current or future native module falls back to source build.
- **Cache-busters bumped** — `bundle.min.{js,css}?v=1.2.5`.
- **Launcher (Elastos Launcher v1.2.5)** updated with the same rebuild-strategy revert; download `ElastOS-1.2.5-arm64.dmg` (signed + notarized + stapled) from the launcher repo.

### Credits

Thanks to **Ahmed (4HM3D)** and **Sasha** for finding both the silent-shipping bug and the recovery pattern within hours of v1.2.4. Ahmed's "rm -rf + clean reinstall" insight (vs `npm rebuild`) is what made the verification gauntlet actually robust against Node-version drift.

### Update path notes

- **v1.2.4 → v1.2.5**: GUI auto-update works cleanly because v1.2.4's `UpdateService` is unchanged in this release. **HOWEVER**, if your v1.2.4 install crash-loops on boot (Ahmed's case), the GUI won't even open to let you click Update — use the terminal `update.sh` instead.
- **v1.2.3 → v1.2.5**: GUI auto-update works fine.
- **v1.0/v1.1/v1.2.0/v1.2.1/v1.2.2 → v1.2.5**: still terminal-only, same rules as v1.2.4 release notes.

---

## [1.2.4] - 2026-04-30 (hotfix)

> ## ⚠️ How to upgrade — read this first
>
> **If your node is on v1.2.3:** click "Update" in the GUI. Clean
> auto-update, no terminal needed.
>
> **If your node is on v1.0.x / v1.1.x / v1.2.0 / v1.2.1 / v1.2.2:**
> **do NOT use the GUI updater for this jump**. The in-app updater
> on those versions is missing fixes that v1.2.4 needs to settle
> cleanly (root-level `npm install`, `HUSKY=0` env override,
> `npm rebuild --build-from-source`, wallet-bridge sync). It can
> appear to succeed and then leave the backend crashing on missing
> deps, or hang forever on `Installing dependencies…` with the
> `husky` 127 error.
>
> Run this in a terminal on the node instead:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh | bash
> ```
>
> This is `scripts/update.sh` from this release — idempotent, fail-loud,
> self-checking. Once you're on v1.2.4 the GUI updater is the right
> tool again for everything from v1.2.4 onwards.

This release closes the last class of "playback works on the publishing
node but fails everywhere behind the gateway" bugs, eliminates a
self-inflicted local-IPFS round-trip that was silently bleeding
bandwidth and adding seconds of latency to every encrypted-media
session, and ships a self-healing path so users with stale Lit
delegations cached in their browser auto-recover instead of being
locked out for months.

It also hardens the macOS / Mac-mini installation path — every fresh
install on Node 22 was crashing at startup with the cryptic
`ERR_DLOPEN_FAILED / NODE_MODULE_VERSION 115 vs 127` error because the
launcher never re-built `better-sqlite3` against its own bundled Node
ABI.

### 🐛 Critical #7: encrypted-media playback fails behind the ela.city gateway with `ERR_SSL_WRONG_VERSION_NUMBER`

`/api/media/init` and `/api/media/segment` build the gateway base URL
with a *local* `getBaseUrl()` that ignored the `x-forwarded-host`
header from the public reverse proxy (`zzz.ela.city`, `test7.ela.city`,
…). When a viewer hit the player through the gateway, the proxy set
`x-forwarded-proto: https` but the upstream `Host` header was the
internal IP (`10.100.0.4:4200`). The local helper combined them into:

```
https://10.100.0.4:4200/ipfs/<CID>/stream.mpd
```

Port 4200 only speaks HTTP, so every fetch for the MPD and init
segment died with `ERR_SSL_WRONG_VERSION_NUMBER` (a TLS handshake
hitting an HTTP listener). End result: every media open after gateway
ingestion threw `Failed to fetch` and the player gave up before the
public-IPFS fallback ever triggered.

**Fix**: deleted the rogue helper, switched to the shared
`utils/urlUtils.getBaseUrl` that already honours `x-forwarded-host` /
`x-forwarded-proto` correctly. This is the same helper every other
endpoint in `storage.ts` was already using; `media.ts` had simply
shadowed it with a broken copy. The same audit caught two more
shadows in `filesystem.ts` and `other.ts` (thumbnail URLs broadcast
via WebSocket); both now route through the shared helper.

### 🐛 Critical #8: every "local" IPFS fetch was round-tripping through the public gateway

Once Critical #7 was fixed, the new symptom became visible: the
backend was happily building MPD URLs as
`https://zzz.ela.city/ipfs/...` and *fetching them itself*. The
request left the Jetson over WireGuard, hit the public Nginx,
came back through WireGuard, and was served by the same Helia
instance the request originated on. Per segment.

Cost per playback: **2–4 wasted external HTTPS round-trips** (MPD
+ init + first segments) and **200ms–2s of avoidable latency**
before the player saw its first byte. When the gateway was
slightly congested, the local fetch would hit the 10s timeout and
fall back to `ipfs.ela.city` — now serving the *same* CID it just
asked the local node for. Worst-case behaviour: a perfectly
healthy local node felt slower than streaming from the public
internet, and a gateway hiccup could break a session that had no
business depending on the gateway at all.

**Fix**: introduced `utils/urlUtils.getInternalIPFSGateway()`, which
returns `http://127.0.0.1:${PORT}/ipfs/` (overrideable via
`LOCAL_IPFS_GATEWAY` for users running a separate Kubo daemon).
`media.ts` now uses this loopback URL for every backend-internal
IPFS fetch (MPD parse, PSSH-extraction init, every segment) while
leaving the *public* `getBaseUrl` reserved for URLs that go to the
browser. URLs the player consumes are unchanged — segments are
proxied through `/api/media/segment` regardless — so this is a
pure server-side optimisation with no client surface change.

Verified on the live Jetson:

```
[media/init] Fetching MPD: http://127.0.0.1:4200/ipfs/<CID>/stream.mpd
[media/init] Local MPD failed (404), trying fallback: https://ipfs.ela.city/...
```

Both legs now resolve in milliseconds; the previously-unreachable
"local" leg is genuinely local.

While in the area, `fetchBytesFromIPFS()` and `fetchSegmentBytes()`
were both wrapped in try/catch so a thrown `fetch()` (TLS error,
DNS failure, timeout) actually triggers the public-gateway fallback
instead of propagating. Previously only non-OK *responses* fell
back; *exceptions* killed the request.

### 🐛 Critical #11: wallet-bridge fixes can never reach users via auto-update

A foot-gun discovered while fixing Critical #9 — the auto-update
flow could in principle pull the new
`src/wallet-bridge/pc2-secure-view.js`, but the server actually
serves `frontend/pc2-secure-view.js`, and **nothing in the update
pipeline copied source → frontend**:

- `build:gui` (root): rebuilds the desktop bundle, copies
  `bundle.min.js`/`bundle.min.css` to `frontend/`. Does not touch
  wallet-bridge files.
- `build:backend` (pc2-node): runs `tsc` only.
- `build:frontend` (pc2-node): the actual script that copies
  wallet-bridge files. **Was never invoked by `UpdateService`.**

In practice, every wallet-bridge JS fix to date has reached users
only because we manually ran `build:frontend` locally before
committing — i.e. the frontend copies in `git` happened to already
be in sync with `src/`. Nothing enforced that. A single forgotten
`npm run build:frontend` and any wallet-bridge fix would land in
source but never reach the browser.

**Fix**: `UpdateService.performUpdate()` now runs
`npm run build:frontend` as an explicit step before `build:gui`,
wrapped in a try/catch so older nodes that don't have the script
don't break the update. Combined with bumping the
`pc2-secure-view.js?v=…` cache-buster, this guarantees that future
fixes to any wallet-bridge file are picked up by the browser
within one update cycle.

This change takes effect for v1.2.4 → v1.2.5+ updates. The v1.2.3
→ v1.2.4 transition is covered by manually committing both the
`src/` and `frontend/` copies of `pc2-secure-view.js`, plus the
cache-buster bump.

### 🐛 Critical #9: rotated Lit Action CID locks users out for months until cached delegations expire

Phase-5 sigauth Lit Actions self-check `del.actionIpfsId ===
jsParams.actionIpfsId` inside the TEE. When v1.2.2 rotated the
hardcoded fallback non-media action CID
(`QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk` →
`bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4`),
every browser holding a delegation signed against the old CID
started failing every secure-view call with `Lit Action denied`.

`SecureViewSession` only purges cached delegations on `expiresAt`,
so users with a 90-day delegation were locked out of all DDRM
content for up to 90 days unless they manually wiped IndexedDB.

**Fix**: in `pc2-secure-view.js → tryRestoreSession()`, we now
fetch `GET /api/storage/lit/server-info` (existing endpoint, no
new surface) to learn the server's *current* expected
`actionIpfsId`, compare against the cached delegation's
`actionIpfsId`, and purge the cache on mismatch — exactly the
same pattern as the existing wallet-mismatch gate one block
above. The wipe is silent, the next file-open re-bootstraps a
fresh delegation against the current CID, and the user sees one
extra `personal_sign` prompt instead of an infinite loop.

Fail-open: if `/server-info` is unreachable for any reason we keep
the cache and let the server be the final authority — never break
existing sessions just because we couldn't reach our own
endpoint.

### 🐛 Critical #10: macOS launcher fresh install crashes with `NODE_MODULE_VERSION 115 vs 127`

The Elastos Launcher bundles its own Node 22.13.1 (MODULE_VERSION
127) but the launcher install flow only ran `npm install
--legacy-peer-deps`. `better-sqlite3@^9.2.2` was published before
Node 22 existed, so `prebuild-install` on a fresh box pulled the
Node 20 prebuild (MODULE_VERSION 115). At runtime, the bundled
Node 22 refused to load the .node binary and the database
initialiser crashed with `ERR_DLOPEN_FAILED`, which the launcher
surfaced to the user as the unhelpful "Timeout waiting for server
to start".

The same trap is going to bite again the next time any native
dependency adds a Node 24 prebuild before our deps catch up.

**Fix**: in `elastos-launcher/src/main/pc2Manager.ts`, both
`installPC2()` and the auto-update flow now run

```sh
HUSKY=0 npm rebuild --build-from-source
```

immediately after `npm install`. This forces *every* native module
(better-sqlite3, sharp, bcrypt, node-gyp-built shims) to recompile
against the actually-bundled Node ABI, regardless of which
prebuilds happened to be cached on npm. The update flow also
gained the previously-missing root `npm install` so the GUI
build dependencies stay in sync.

`HUSKY=0` is forced inline as defence-in-depth alongside the
`package.json` `prepare` script fix from v1.2.3 — covers any user
running an old launcher build that pulls a newer pc2-node tree.

(For users already in the broken state from a v1.2.2 / v1.2.3
launcher install, manual recovery is one command:
`cd ~/.pc2/pc2-node && ~/.elastos/node/node-v22.13.1-darwin-arm64/bin/npm rebuild better-sqlite3 --build-from-source`,
then re-launch ElastOS. PC2 boots cleanly afterwards.)

### 🐛 Critical #12: `start-local.sh` (CLI installer) silently fails on every fresh Mac

The terminal-based installer
(`curl -fsSL …/start-local.sh | bash`) was a minefield of false
successes on a fresh Mac:

1. **Git stub gives false positive.** macOS ships
   `/usr/bin/git` as a stub that exists in `PATH` solely to
   trigger the Xcode CLT installer when invoked. The script's
   `command -v git` test passed on the stub, so Xcode CLT was
   never installed; later `nvm install` (which compiles things)
   bombed with "you may need to install the Xcode Command Line
   Developer Tools" and the user got stuck.
2. **`curl | bash` detaches stdin.** Homebrew's installer needs
   sudo; without a TTY it printed "Need sudo access" and bailed.
   Every subsequent step that depended on brew (ffmpeg, cairo,
   pango, …) was missing, but the script kept printing
   `✓ Native modules built` regardless.
3. **`npm rebuild 2>&1 || true`** swallowed every native-module
   compile error. `canvas` failing because `pkg-config` wasn't
   installed printed nothing, but PDF/text thumbnails were
   silently disabled.
4. **No macOS equivalent of `install_build_deps`.** The script
   had a Debian/Ubuntu branch installing `cairo`, `pango`,
   `libpng`, `librsvg`, `ffmpeg`, etc. — but on macOS, the
   equivalent `brew install` was never wired up.

**Fix** (`scripts/start-local.sh`):

- Detect pipe-to-bash mode (`[ ! -t 0 ]`) on macOS and refuse to
  run with a clear `bash -c "$(curl ...)"` recommendation.
- Replace `command -v git` with `xcode-select -p` on macOS — the
  honest test for a usable toolchain.
- New `ensure_brew_macos` step runs the Homebrew installer with a
  real TTY, persists the `brew shellenv` to `~/.zprofile` so the
  user doesn't have to source it manually next time.
- New `install_macos_brew_libs` installs every native-module
  system dependency (`ffmpeg`, `pkg-config`, `cairo`, `pango`,
  `libpng`, `jpeg`, `giflib`, `librsvg`, `wireguard-tools`) in a
  single `brew install` — matches the apt-get list.
- Replaced silent `npm rebuild 2>&1 || true` with a fail-loud
  three-tier strategy: bulk rebuild first, then per-module
  retries that distinguish required (better-sqlite3) from
  optional (canvas, sharp) failures. better-sqlite3 failure now
  exits 1 with a remediation hint; canvas failure prints a
  warning and continues.
- New post-rebuild sanity check: `node -e
  "require('better-sqlite3')(':memory:')…"` actually loads the
  binary against the running Node ABI before claiming success.
  Catches the ABI-mismatch class of bugs at install time, not at
  first server boot.

### Other changes

- **Frontend cache-busters bumped 1.2.1 → 1.2.4** in
  `pc2-node/scripts/build-frontend.js` (and `frontend/index.html`)
  so browsers fetch the rebuilt `bundle.min.js` / `bundle.min.css`
  instead of serving the stale v1.2.1 cached copy after update.

### Update path notes

- **v1.2.3 → v1.2.4**: GUI auto-update is the recommended path. Clean,
  no manual steps.
- **v1.2.1 / v1.2.2 → v1.2.4**: GUI auto-update *works* (the v1.2.4
  `package.json` husky fix carries through `git reset --hard`), but
  the resulting node will be missing the v1.2.4 `UpdateService`
  improvements (build:frontend sync, root install) until the next
  release. **Recommended: run `update.sh` from a terminal** so the
  node lands on v1.2.4 with everything in sync from the start.
- **v1.0.x / v1.1.x / v1.2.0 → v1.2.4**: **Do not use the GUI updater.**
  Their in-app `UpdateService` only runs `npm install` inside
  `pc2-node`, not at the repo root. If v1.2.4's root `package.json`
  has gained any new transitive dep (it has — see the loopback
  IPFS / wallet-bridge work above), the auto-update will appear
  to "succeed" but the backend will crash on the next boot with
  `Cannot find module 'X'`. v1.0/v1.1 also predate the husky
  `prepare`-script fix, so the auto-update may simply hang forever
  on `Installing dependencies…` with the silent `husky` 127 error.
  **Use the terminal command in the box at the top of these notes.**
- **Browser cache**: viewers using the GUI will pick up the new
  bundle via the `?v=1.2.4` cache-buster — no hard-refresh needed.
- **Stale Lit delegations**: any browser that signed a delegation
  against the pre-v1.2.2 action CID (`QmX5Jx...`) self-recovers on
  next page load — one extra `personal_sign` prompt, no
  user-visible error.

### Manual recovery / forced upgrade

If your GUI auto-updater hangs, fails, or you're on an older
release that the in-app updater can't carry forward (notably
v1.2.0), the canonical recovery is the hardened
`scripts/update.sh`. It does, in order:

1. PM2 stop + orphan kill + port-free check
2. `git fetch + git reset --hard origin/main`
3. `npm install` at **both** root and `pc2-node` (with
   `HUSKY=0` belt-and-braces)
4. `npm rebuild --build-from-source` (bulk, then per-module
   retry — better-sqlite3 fatal, canvas/sharp non-fatal)
5. `build:frontend` + `build:gui` + `build:backend`
6. better-sqlite3 ABI sanity check (`require()` it before PM2
   starts)
7. `pm2 start` + 10s health-check verification

**One-liner from anywhere on a Jetson / Linux box:**

```bash
curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/update.sh | bash
```

**From inside an existing checkout:**

```bash
cd ~/pc2.net && bash scripts/update.sh
```

**On macOS launcher install (path is `~/.pc2`):**

```bash
cd ~/.pc2 && bash scripts/update.sh
```

The script is idempotent — running it twice is safe and a
reasonable thing to do if the first run reported any module
warning. It exits 1 with a remediation hint (not a silent
"success") on every fatal step, which is the opposite of how
most install scripts in this codebase used to behave.

### Files changed

- `pc2-node/src/utils/urlUtils.ts` — added `getInternalIPFSGateway()`
- `pc2-node/src/api/media.ts` — loopback gateway, hardened fetch fallback
- `pc2-node/src/api/filesystem.ts` — shared `getBaseUrl` for thumbnail URLs
- `pc2-node/src/api/other.ts` — shared `getBaseUrl` for thumbnail URLs
- `pc2-node/src/wallet-bridge/pc2-secure-view.js` + `pc2-node/frontend/pc2-secure-view.js` — stale-CID self-heal (synced)
- `pc2-node/src/services/UpdateService.ts` — runs `build:frontend` so wallet-bridge fixes actually reach users
- `pc2-node/scripts/build-frontend.js` + `pc2-node/frontend/index.html` — bundle + secure-view cache-buster bump
- `scripts/start-local.sh` — Xcode CLT detection, Homebrew bootstrap with TTY, macOS native libs, fail-loud npm rebuild, better-sqlite3 sanity check
- `scripts/update.sh` — hardened canonical recovery script (root + pc2-node install, build:frontend, fail-loud rebuild, ABI verify)
- `package.json` + `pc2-node/package.json` — version 1.2.4
- `elastos-launcher/src/main/pc2Manager.ts` — `npm rebuild --build-from-source` on install + update
- `elastos-launcher/package.json` — version 1.2.4

---

## [1.2.3] - 2026-04-30 (hotfix)

### 🐛 Critical #6: GUI updater silently hangs on every Jetson update (`sh: husky: not found`)

The v1.2.2 GUI auto-updater could not actually install v1.2.2 on any
production node. The root cause was a single line in the repo-root
`package.json`:

```jsonc
"prepare": "husky"
```

`husky` is a developer-side git-hooks installer with **no purpose on a
production node**. When the updater ran `npm install --legacy-peer-deps`
during a v1.2.1 → v1.2.2 upgrade, npm executed the `prepare` lifecycle
script **before** the dev-dependency that provides the `husky` binary
was installed. With `husky` not yet on `PATH`, the script exited 127:

```
sh: 1: husky: not found
npm error code 127
npm error path /home/orin_nano/pc2.net
npm error command failed
npm error command sh -c husky
```

`npm install` therefore failed at the very first step. The
`UpdateService.performUpdate()` flow used `execAsync` (which
`await`s the entire child to exit), so the rejection bubbled up,
the backend logged the failure, and the GUI modal — which only
polled the `updateProgress` *string* — was left stuck on
`Installing dependencies…` indefinitely. From the user's
perspective, every Jetson update silently hung at the second step
and never recovered.

The same pattern would have broken every future release for every
node, regardless of arch. This had to ship before any further
release attempts.

**Fix**: three layers, defence-in-depth.

1. **Root `package.json`** → wrap the husky lifecycle so it can never
   fail a production install:
   ```jsonc
   "prepare": "husky 2>/dev/null || true"
   ```
   In dev, husky is in `node_modules/.bin` and the script succeeds
   exactly as before. In prod (and CI), it fails silently, the
   `|| true` swallows the non-zero exit, and `npm install` proceeds.

2. **`UpdateService.execStreamed()`** → every update sub-command now
   runs with `HUSKY=0` and `CI=true` injected into the env, regardless
   of the `package.json` prepare script. Even nodes that somehow pull a
   future broken `package.json` cannot reproduce the failure.

3. **Idle watchdog** (`STREAM_IDLE_TIMEOUT_MS = 8 min`) — if any update
   sub-command produces zero stdout/stderr for 8 minutes, the parent
   `SIGKILL`s the child and surfaces a real error. No more silent
   `await`s on dead npm children.

### ✨ "View detailed logs" — live update output, no more flying blind

Even with the husky fix, the v1.2.2 update modal showed only a single
high-level step label (`Installing dependencies…`) with no insight into
what `npm install` was actually doing. On a Jetson where the install
legitimately takes 10-15 minutes, this is genuinely nerve-wracking —
users had no way to distinguish "compiling sharp from C++ source" from
"hung on a dead promise". Reported verbatim:

> *"i hoped to get live updates here too so i know exactly whats running
> if i wanted even if in a drop down, this still makes me feel blind and
> nervous"*

**Fix**:

- **Backend** (`pc2-node/src/services/UpdateService.ts`):
  - Replaced `execAsync` with a `spawn`-based `execStreamed()` runner
    that pipes child stdout/stderr line-by-line into a rolling
    `logBuffer` (capped at `LOG_BUFFER_MAX_LINES = 400`). Each entry
    is prefixed with `[HH:MM:SS] [source]` (e.g. `[npm-root]`,
    `[build-gui]`) so the UI can colour-code by stage.
  - Added a monotonic `logSeq` counter so the GUI's poll loop can
    request only new lines (`?sinceSeq=<n>`) instead of re-shipping
    the entire buffer every 1.5 s.
  - `getStatus()` and `/api/update/progress` both now return
    `log: string[]` and `logSeq: number`. Backwards-compatible —
    older clients ignore the new fields.

- **Frontend** (`src/gui/src/UI/UIUpdateModal.js`):
  - Added a collapsible **"View detailed logs"** button under the
    step list. Expands a dark, terminal-style panel rendering the
    last 400 lines of streamed output.
  - Sticky-bottom auto-scroll: new lines auto-scroll only when the
    user is sitting at the bottom of the panel (within 32 px), so
    scrolling up to read older output won't keep getting yanked
    back down.
  - Source tag (`[git]`, `[npm-root]`, `[npm-node]`, `[build-gui]`,
    `[build-backend]`, `[update]`) is colour-coded so the user can
    visually scan the active stage at a glance.
  - Diff polling uses the new `?sinceSeq=` param — only new lines
    are sent, keeping the poll payload tiny even for a full 400-line
    install.
  - "Taking longer than expected" hint now points at the dropdown
    (*"Expand View detailed logs above to see live output"*) instead
    of telling users to SSH in and run `pm2 logs`.

### 🐛 Bug fix: `UPDATE_HARD_TIMEOUT_MS` bumped from 12 min → 20 min

The 12-minute "taking longer than expected" warning was an over-
optimistic guess that fired during normal Jetson updates (where
native dep compile of `better-sqlite3` + `node-pty` + `sharp`
totals 8-12 min on its own, before `npm install` even reaches the
Helia/libp2p tree). Bumped to 20 min, which covers Jetson cold-
install worst case + build + restart with comfortable headroom.
Hitting the timeout still doesn't claim failure — it just surfaces
the dropdown / log-tail next steps.

### Files touched

```
package.json                                        # prepare script
pc2-node/package.json                               # version bump
pc2-node/src/services/UpdateService.ts              # spawn + log buffer + watchdog + HUSKY=0
pc2-node/src/api/update.ts                          # /progress returns log + logSeq + sinceSeq
src/gui/src/UI/UIUpdateModal.js                     # log dropdown + 20-min timeout
CHANGELOG.md                                        # this entry
```

---

## [1.2.2] - 2026-04-30 (hotfix)

### 🐛 Critical #5: Fresh installs hit `Lit Action denied: access_denied` on every asset open

The v1.2.1 hotfix introduced a hardcoded fallback Lit Action CID
(`QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk`) so that fresh nodes
without a `.env` file would still resolve a CID at startup. The CID
came from `SEC_2026_04_21_AUDIT_DISPOSITION.md` (Wave 8 Pinata re-pin)
and was confused with the production-active sigauth action. It is
registered with Chipotle but **not bound to any of the AccessTokens
currently on-chain** — so every fresh install (Jetson, Pi, anyone
running the installer without a `.env` file) saw the Lit Action
return `access_denied` for every asset they legitimately owned.

The canonical V1.2 sigauth Lit Action — pinned to ≥2 IPFS providers,
end-to-end verified across PDF/PNG/MP4/MP3 on 2026-04-21, documented
in `V12_SIGAUTH_HANDOVER.md` and `IRZHY_LIT_ACTION_FIX_V12.md`, and
present in `pc2-node/.env` for every dev environment that has ever
worked — is `bafkreihvm4zkyuefnuptlbdins6cmd2mbslj2xgnyzz3ssdg2ggg3jtkk4`.

The same CID covers both code paths (per the V12 handover §3.2,
media-decrypt routes through `recoverNonMediaCEK` on the Chipotle
backend), so this single fix unblocks PDF / PNG / EPUB / CBZ / MP4 /
MP3 playback in one shot.

**Fix**:

- `pc2-node/src/api/storage.ts` →
  `DEFAULT_NON_MEDIA_ACTION_CID` rotated from `QmX5JxcF…r5uk` to
  `bafkreihvm4…tkk4`.
- `pc2-node/src/api/chipotle-client.ts` → matching `getActionCid()`
  fallback rotated to the same value, plus a new **Tier 3 supernode
  provision lookup** added to the resolution chain
  (env → file → `loadCachedProvision().actions.nonMediaDecrypt` →
  hardcoded). The `/api/ddrm/provision` payload from Wave 8+ supernodes
  already carries `actions.nonMediaDecrypt`; honouring it here means
  Elacity Labs can rotate the action in the future by updating only
  the signed supernode payload — no PC2 redeploy required on every
  node in the world.
- Comments in both files updated to point future maintainers at the
  V12 handover docs and to record why the v1.2.1 CID was wrong, so
  this regression cannot repeat.

**Compatibility**:

- Existing assets minted from any node that ever had the correct
  `bafkreihvm4…` CID (i.e. all Mac dev environments, all production
  nodes prior to v1.2.1) decrypt cleanly under v1.2.2 — same CID
  before and after.
- Per `V12_SIGAUTH_HANDOVER.md` §3.5, the Lit Action CID is
  server-authoritative, never asset-authoritative — the server
  overrides the PSSH-recorded CID at `/api/media/init`. So no asset
  re-mint is required.
- The only theoretically-affected assets are those minted on a fresh
  v1.2.1 install in the ~24 h window between v1.2.1 ship and v1.2.2
  hotfix. Those assets would be encrypted under `QmX5JxcF…`. Realistic
  blast radius: zero (fresh installs don't typically mint).

---

## [1.2.1] - 2026-04-30 (hotfix)

### 🐛 Critical #4: WalletConnect/Essentials transactions stop hitting MetaMask

`v1.2.0` made WalletConnect logins functional for SIWE auth, but every
subsequent signing request (Glide swap, Elacity Market buy, ESC token
transfers, …) still went to whatever extension wallet happened to own
`window.ethereum` in the parent frame — almost always **MetaMask**, with
a different account, on the wrong chain. The user got a confusing
"approve in MetaMask" prompt for a wallet they had never selected, and
the transaction failed with *"unauthorized account"* or silently signed
from the wrong address.

Root cause: three `WalletService` methods and the parent-side
`pc2-wallet-bridge.js` all checked `isEmbeddedLogin()` only. Embedded
(email/social) users were correctly routed through the hidden Particle
Auth iframe; everything else fell through to `window.ethereum`. But
WalletConnect's actual provider doesn't live in the parent frame — it
lives in the same iframe origin, restored on demand by ConnectKit's
`reconnectOnMount` from the `wc@*` localStorage keys created during
login. So the iframe path that worked perfectly for embedded users would
also have worked for WC users — we just never routed them through it.

**Fix**:

- `WalletService.sendTransactionViaParticleIframe`,
  `WalletService.sendSmartAccountBatch` (Phase 2), and
  `WalletService._sendEOATransaction` (external-wallet branch) all gain
  an `isWalletConnectLogin()` branch that routes through
  `UIWindowParticleSigning` (the same visible overlay used by embedded
  signing) instead of `window.ethereum`.
- `pc2-wallet-bridge.js handleRpc` and `handleReady` now route via
  `routeToParticle()` for both embedded **and** WalletConnect users (new
  `shouldRouteViaIframe()` helper). The WC path enters
  `window.pc2RouteRpcToParticle` → `WalletService.routeRpcToParticle` →
  `UIWindowParticleSigning` → wallet iframe → restored WC connector →
  user's mobile wallet. Existing `prefillGasForTx` /
  `LEGACY_ONLY_CHAINS=[20]` MetaMask path is untouched (it's wrapped by
  the same `!shouldRouteViaIframe()` gate).
- `pc2-wallet-bridge.js wallet_switchEthereumChain` no longer
  double-forwards chain switches to `window.ethereum` for WC users (the
  iframe handler already issues the switch on its restored connector
  before each signing call). MetaMask/Coinbase users still get the
  forward as before.
- `packages/particle-auth/.../ParticleNetworkContext.tsx` —
  `particle-wallet.eoa-send` retries `connector.getProvider()` for up to
  ~9 s (was 4.5 s) so ConnectKit's WC reconnect has time to attach on
  cold-boot, and the failure message now names the connector ID so
  operators can tell "WC session expired on phone" apart from "user is
  not logged in".

**Same-shipment side-fix — wallet bridge sources are tracked again**:

- `pc2-node/.gitignore` line 11 (`src/**/*.js`) was excluding the four
  hand-authored ES5 wallet-bridge sources (`pc2-wallet-bridge.js`,
  `pc2-wallet-provider.js`, `pc2-secure-view.js`,
  `pc2-secure-view-session.js`), so a clean checkout had no source for
  the build to copy. `pc2-node/scripts/build-frontend.js` wipes the
  target dir as the first step, so on a fresh node the served frontend
  ended up with **zero** wallet-bridge files. dApps then fell back to
  `window.ethereum` (MetaMask), which is the upstream of the WC bug
  above. **Fix**: added `!src/wallet-bridge/` exception, force-tracked
  the four source files, and made `build-frontend.js` *throw* (not
  silently skip) when any wallet-bridge source is missing.

### Verified locally

- WC login → Glide ELA→USDC swap on ESC: prompt opens in **Essentials
  on phone** (was MetaMask). RLP type-0 fix from v1.1.x still applies
  (LEGACY_ONLY_CHAINS branch unaffected).
- WC login → Elacity Market buy V3 asset on Base: approve + buy both
  prompt in Essentials. Smart-account batch rootHash signs correctly.
- WC login → hard-refresh `zzz.ela.city`: ConnectKit auto-restores the
  WC session in the wallet iframe within ~2 s; first signing request
  works without re-scanning a QR.
- MetaMask login → Glide swap, Creator mint: identical prompts and flow
  as before (MM/Coinbase path is gated by `!shouldRouteViaIframe()` so
  zero behavior change).
- Email login → Wallet Send tokens: identical to v1.2.0.

---

### 🐛 Critical #5: All playback + non-media packaging broken on fresh nodes

Every fresh PC2 install (`v1.2.0` Jetson at `zzz.ela.city` was the canary)
returned **HTTP 503** from `POST /api/storage/lit/begin-session` and
**HTTP 500** from `POST /api/media/init`, breaking:

- Non-media playback (DDRM viewer, ePub reader, image viewer) — secure-view
  bootstrap fails immediately, and the legacy fallback also 401s because no
  delegation was issued.
- Media playback (video player) — `/api/media/init` calls
  `getNonMediaActionCid()` to override the legacy PSSH `actionIpfsId` with
  the server-controlled sigauth CID before invoking the Lit Action; with
  no CID configured the route returned `Server NON_MEDIA_ACTION_CID is not
  configured`.
- Creator → non-media packaging (e.g. ebook → Market mint) — the
  `/api/storage/lit/encrypt` route returned `400 No Lit Action CID
  configured` so the Creator could not seal new assets.

DASH packaging (Creator → video → Market) was unaffected — `dashPackager.ts`
embeds the action CID as a hardcoded constant.

Root cause: `pc2-node/src/api/storage.ts` resolved the Lit Action CID from
`process.env.LIT_ACTION_CID` first, then `data/.lit-action-cid` on disk,
then **gave up**. The on-disk file is only written when the operator runs
`POST /api/storage/lit/deploy-action` once at first boot — long-lived dev
machines have it from months ago, but fresh installs never had it. The
sibling `pc2-node/src/api/chipotle-client.ts` already used the exact same
CID (`QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk`) as a hardcoded
fallback for its own internal `getActionCid()` — `storage.ts` simply never
mirrored that final fallback, so every code path that touched
`NON_MEDIA_ACTION_CID` (begin-session, secure-view, complete-session,
encrypt, getNonMediaActionCid, info) silently failed on fresh nodes.

**Fix**: `storage.ts` now defines `DEFAULT_NON_MEDIA_ACTION_CID =
'QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk'` and applies it as the
final resolution step (env → file → hardcoded). This is the same value
that `chipotle-client.ts → getActionCid()` has used as its fallback for
months — both modules now return the same identifier so a fresh node's
`delegation.actionIpfsId` matches what the chipotle TEE actually executes,
no `bad_action_cid` mismatch.

The choice of CID matches what is **actually running** in production today:
existing dDRM assets (including the canary on `zzz.ela.city`) embed this
exact `Qm…` in their PSSH `actionIpfsId` at mint time, every chipotle path
on every fresh node has been falling through to this same fallback already,
and `pc2-node/.env`'s `bafkrei…` value is dead documentation (pc2-node
never calls `dotenv.config()` so the file is never loaded). Reconciling
the dotenv loading + rotating to the new sigauth CID is tracked
separately as a post-1.2.1 cleanup so the hotfix carries zero behaviour
change for existing assets.

From v1.2.1 onwards, every fresh node is playback-ready out of the box
without needing to run `deploy-action` or hand-write `data/.lit-action-cid`.

**Same-shipment companion fix — Creator video packaging (`dashPackager.ts`)**
read `process.env.DDRM_AUTHORITY` with a non-null assertion (`!`), but
because `pc2-node` never calls `dotenv.config()`, the env var was always
`undefined` at runtime. Every video packaged by the Creator therefore
embedded `authority: undefined` into its PSSH JSON. Playback only
survived because `media.ts` falls back to the URL-param `clientAuthority`
at decryption time — but if any link / share / archive ever lost that
URL param, playback would `bad_authority` against the Lit Action. Fix:
hardcode the same `0x09dBe796f40ECEffEAccf243c3d758C4c1d8D87D` (V3
AuthorityGateway) constant that `storage.ts` and `chipotle-client.ts`
already used, with the env var preserved as an operator override for
future per-deploy authority swaps. All three modules are now in lock-step
per `.cursor/tasks/V1.3-RELEASE/V1.3-RELEASE.md` checklist.

### Manual recovery on existing v1.2.0 nodes (until they self-update)

```bash
echo -n "QmX5JxcFhyasptCWMA6unFPm3TRYjPSkJb5HhN8289r5uk" \
  > ~/pc2.net/pc2-node/data/.lit-action-cid
pm2 restart pc2     # or: systemctl restart pc2-node
```

After v1.2.1 ships, the file is no longer required.

---

### 🐛 Critical #1-3: In-app updater is fixed for v1.2.0 → v1.2.1+

The v1.2.0 in-app updater silently fails on every node. Three release
defects, each independently sufficient to break the upgrade:

- **`git pull` halts on divergent history**: `UpdateService.performUpdate`
  ran `git pull origin main`, which aborts the moment the local branch
  has any commits not present on upstream (whether genuine local commits,
  a stale fork remote, or an upstream history rewrite). Once a node hit
  this state — e.g. the long-lived Jetson at `zzz.ela.city` showed a
  5,079-commit divergence — every future in-app update silently failed at
  the first step, but the UI cheerfully reported "update complete"
  because the failing step ran in a fire-and-forget background timer.
  **Fix**: `performUpdate` now uses `git fetch origin main` followed by
  `git reset --hard origin/main`. The hard reset replaces local HEAD,
  restores the entire working tree (subsuming the previous `git checkout
  -- .` step, and recovering any tracked files an earlier broken update
  half-deleted — e.g. `pc2-node/frontend/pc2-wallet-bridge.js` and the
  three sibling secure-view scripts), and never attempts a merge.
- **Missing source file**: `pc2-node/src/sdk/types.ts` is the type module
  consumed by `ContentIntelligenceService` and `services/media/fingerprint`,
  but `.gitignore` line 51 (`sdk/`, intended for an unrelated local SDK
  clone) excludes it. Sibling files in the same directory (`config.ts`,
  `index.ts`, `types.js`) were force-added, but `types.ts` was missed.
  Result: every fresh clone has a missing module, `tsc` fails, the new
  `dist/` is never produced, and the restart serves stale code.
  **Fix**: force-tracked `pc2-node/src/sdk/types.ts` (8 production-facing
  type exports — `ContentIntelligenceReport`, `ContentClassification`,
  `QualityAssessment`, `SafetyAssessment`, `ContentProvenance`,
  `ContentAnalysisParams`, `PerceptualHashResult`, `HashAlgorithm`).
- **Hoisted dependencies never installed**: v1.2.0 added dynamic
  `await import('ethers' | 'siwe' | '@lit-protocol/*')` calls inside
  pc2-node, but those packages live in **root** `node_modules/` (hoisted
  from the root `package.json`). `UpdateService.performUpdate` only ran
  `npm install` in `pc2-node/`, so the hoisted deps were missing on every
  updated node and the dynamic imports failed at runtime.
  **Fix**: `UpdateService.performUpdate` now runs `npm install
  --legacy-peer-deps` at the **project root** before the pc2-node install,
  and bumps `maxBuffer` to 50 MB on every update step so npm output on
  slow ARM devices can no longer truncate the install silently.

### Symptom catalog (so operators can self-diagnose)

If a v1.2.0 node was hit by these bugs you may see any of:

- Settings → About still reports `1.2.0` after pressing Update.
- Browser console inside any dApp window shows
  `pc2-wallet-bridge.js: 404`, `pc2-wallet-provider.js: 404`,
  `pc2-secure-view*.js: 404`, followed by *"Refused to execute script
  …MIME type 'text/html' is not executable"*. With the wallet bridge
  missing, every dApp falls back to `window.ethereum` (i.e. MetaMask),
  causing signing prompts from the wrong wallet, blank Elacity Market,
  and `MetaMask - RPC Error: The method "pc2_getSmartAccountAddress"
  does not exist / is not available`.
- pm2 / systemctl shows the node restarting onto an old `dist/index.js`
  (`stat -c %y dist/index.js` predates the update attempt).
- Backend log contains `Cannot find module 'ethers'` or
  `Cannot find module '../sdk/types.js'`.

### Manual recovery on existing v1.2.0 nodes

Any node already running v1.2.0 (or stuck mid-update) can self-repair with:

```bash
cd ~/pc2.net
git fetch origin main && git reset --hard origin/main      # force upstream
npm install --legacy-peer-deps                             # hoisted deps
cd pc2-node && npm install --legacy-peer-deps --include=dev
npm run build:backend && cd .. && npm run build:gui
pm2 restart pc2     # or: systemctl restart pc2-node
```

After v1.2.1 is installed, the in-app updater performs these steps
automatically on every subsequent update.

### Verified

- 2026-04-30: Jetson Orin Nano `zzz.ela.city` recovered from a stuck
  v1.1.0 (5,079-commit divergent fork on local main, last `dist/` build
  March 3) → clean v1.2.0 → same hotfix sequence applied manually, pm2
  reports `version: 1.2.0` (now serving 1.2.1 once this release lands),
  IPFS redials 30+ peers within 10 s, dApp Centre HTML serves on `/`,
  all four wallet-bridge scripts return `HTTP 200` with content-type
  `application/javascript`.

---

## [1.2.0] - 2026-04-21 (in development — `feature/lit-chipotle-migration`)

### 🔒 Security (P0) — Lit Action Session-Key Delegation

dDRM decryption now uses cryptographically-verified session-key delegation
inside every Lit Action call. The previous V1.1 authorization path trusted
a client-supplied `userAddress` parameter; because Lit Action source is
public and immutable on IPFS, any caller could supply *any* known
authorized buyer's address and receive the CEK. **This is closed in V1.2.**

- **Session-key delegation (Option C)**: at wallet connect the buyer signs
  *one* `SecureViewDelegation` authorizing a non-extractable, device-bound
  P-256 key (Web Crypto, `extractable: false`) to decrypt dDRM content
  for up to 24 hours across their EOA + smart-account addresses. Every
  subsequent asset open is signed silently by the ephemeral key — zero
  wallet popups, "double-click to open" UX preserved.
- **Lit Actions** (`non-media-decrypt-chipotle.js`,
  `media-decrypt-chipotle.js`) now verify the EIP-191 (or EIP-1271 for
  smart wallets) delegation signature, the per-request P-256 signature,
  the `actionIpfsId` binding, request freshness, replay protection, and
  delegation expiry/revocation before reaching the on-chain
  `AuthorityGateway.hasAccessByContentId` check.
- **`userAddress` removed** from `jsParams` in all paths
  (`recoverNonMediaCEK`, `recoverMediaCEKEnvelope`, Datil fallback). The
  effective user is derived from the cryptographically verified
  `delegation.coveredAddresses`.
- **Server-authoritative action CID**: `/api/media/init` overrides the
  PSSH-recorded CID with the server-configured `LIT_ACTION_CID` so legacy
  assets (minted with the v0 CID baked into their MPD) work with the new
  sigauth action without re-minting.
- **Two-phase `/api/media/init`**: returns `412 Precondition Failed` with
  `{ kid, actionIpfsId }` so the player can produce a signed bundle bound
  to the correct `actionIpfsId` before the second call. MPD is cached
  server-side for 60 s so the retry is free.
- **Hard cutover**: `/lit/secure-view` now returns
  `401 session_bundle_required` for any request without a signed bundle.
  Legacy `*-chipotle.js` Lit Action files deleted; `LIT_ACTION_CID_LEGACY`
  removed from `.env.example` and code paths. The legacy IPFS CID stays
  pinned for a 14-day rollback window then is unpinned by ops (~2026-05-03).
- **Verified end-to-end on 2026-04-21**: PDF · PNG · MP4 (AV1+AAC) ·
  MP3 (AAC) — all four open with one wallet popup at session start,
  zero popups on subsequent opens, exploit regression spike (14 checks)
  passes against the canonical sigauth Lit Actions.

References:
- [`docs/handover/V12_SIGAUTH_HANDOVER.md`](docs/handover/V12_SIGAUTH_HANDOVER.md) — comprehensive cutover handover
- [`docs/handover/IRZHY_LIT_ACTION_FIX_V12.md`](docs/handover/IRZHY_LIT_ACTION_FIX_V12.md) — public-safe engineer brief
- [`.cursor/tasks/LIT-ACTION-SIGNATURE-AUTH/`](.cursor/tasks/LIT-ACTION-SIGNATURE-AUTH/) — DESIGN, SECURITY, TESTING

### 🔒 Security (P0) — jhond0e Audit Triage (`SEC-2026-04-21`)

Closes 7 of 11 vulnerabilities reported by external researcher jhond0e
(2026-04-18). The 4 smart-contract findings (SEC-1, 4, 5, 6) are owned by
a separate engineer. SEC-11 (DID JWT verify) is explicitly deferred to
Wave 5 with documented mitigation. Authoritative disposition lives in
[`docs/handover/SEC_2026_04_21_AUDIT_DISPOSITION.md`](docs/handover/SEC_2026_04_21_AUDIT_DISPOSITION.md).

**Wave 1 — `mock-token` removal + `/api/update/install` lockdown**
- **SEC-3c** Removed `mock-token-*` and `token-0x{wallet}-*` branches
  from `middleware.ts` (~88 LOC of dangerous wallet-inference code) +
  `whoami.ts` + `info.ts:getLaunchApps`. Replaced one legitimate
  consumer (file-viewer iframe app) with **scoped session tokens** —
  short-lived, single-use, file-bound — via new `scope-check` helper
  and DB migration #29 (`sessions.scope`/`scope_data`).
- **SEC-10** `authenticate + requireOwner` applied to every
  `/api/update/*` route (`/install`, `/check`, `/check-github`,
  `/status`, `/version`). Added 60 s throttle on `/install`, 30 s
  throttle on `/check-github`. Owner wallet logged for audit trail.

**Wave 2 — SIWE + `/api/setup/*` lockdown + transport hardening**
- **SEC-3a** New `GET /auth/challenge` issues SIWE (EIP-4361) nonces.
  `POST /auth/particle` and `POST /api/access/claim-ownership` now
  require a verified signature when `siweRequired=true`. EIP-1271
  (smart-contract sigs) and Solana SIWS (ed25519) supported. Particle
  Auth SDK wired to the new flow in
  `packages/particle-auth/src/particle/contexts/ParticleNetworkContext.tsx`.
  Kill-switch defaults to `false` for safe rollout.
- **SEC-7** New `requireSetupAuth` middleware on
  `/api/setup/{mnemonic, info, mnemonic-sign-message,
  acknowledge-mnemonic}`. First-run token (64-hex chars) printed once
  to stdout/journalctl on initial boot for remote VPS installs.
  Single-use, TTL-bound. Loopback always allowed.
- **SEC-trust-proxy** Tightened `app.set('trust proxy', …)` from
  `true` to `'loopback, linklocal, uniquelocal'`. Security decisions
  fall back to `req.socket.remoteAddress` so LAN attackers cannot
  spoof `req.ip` via `X-Forwarded-For`.
- **SEC-cors** CORS allowlist extended to `*.ela.city` + `*.ela.local`
  for the SIWE flow.

**Wave 3 — Web-gateway lockdown (RCE + WireGuard hijack)**
- **SEC-2** `POST /api/vless/register` shell injection closed:
  `execSync` template literal replaced with `execFileSync` (argv
  form, no shell). Added `/^[a-z0-9][a-z0-9_-]{2,29}$/` allowlist
  regex. **All 9 `execSync` call sites in
  `deploy/web-gateway/index.js` converted to `execFileSync`** —
  `rg 'execSync\(' deploy/web-gateway` now returns 0 results.
- **SEC-INFRA-GW-AUTH** New per-node provisioning tokens minted by
  `POST /api/register` and stored on PC2 nodes at
  `data/.gateway-tokens.json` (mode 0600). All mutating gateway
  endpoints (`/api/wg/register`, `/api/wg/peer/<u>` DELETE,
  `/api/awg/register`, `/api/awg/peer/<u>` DELETE,
  `/api/vless/register`) require `X-Provisioning-Token` matching
  the username's record. Cross-account binding enforced.
- **SEC-8** WG re-key by an unauthorised caller now rejected — token
  must match the registered node.
- **SEC-9** WG peer DELETE token-gated + per-username throttle
  (3/min). Symmetric `DELETE /api/awg/peer/<u>` added with same
  gating to keep AWG cleanup on the audited path.
- Kill-switch `GW_AUTH_REQUIRED=false` (default) → log-only mode.
  Telemetry-driven flip to `true` once ≥99 % of inbound calls
  carry tokens.

**Wave 4 — CI / secret hygiene (`SEC-CI-SECRETSCAN`)**
- Three-tier `gitleaks` gate: pre-commit hook (`.husky/pre-commit`,
  staged-diff scan), GitHub Action on `pull_request` (diff scan),
  GitHub Action on `push` to long-lived branches (full working-tree
  scan).
- `.gitleaks.toml` extends defaults with extensive path exclusions
  (build artefacts, vendored bundles, `pc2-node/data/`, log files)
  + stopwords + regexes for public-by-design IDs (IPFS CIDs, EVM
  and Solana addresses).
- `.gitleaksignore` documents 4 triaged historical findings
  (TRIAGE-1 to TRIAGE-4), each with rationale and follow-up link.
- Baseline reduced from 426 raw matches → 0 detected leaks.
- Surfaced **TRIAGE-1**: real Ed25519 private key in
  `data/identity.json` committed at `4b10bad94` (2026-03-06)
  before the matching `.gitignore` rule. Already on 4 origin
  branches. Allowlisted with explicit follow-up scaffolded as
  [`SEC-2026-04-22-BOSON-DID-ROTATION`](.cursor/tasks/SEC-2026-04-22-BOSON-DID-ROTATION/SEC-2026-04-22-BOSON-DID-ROTATION.md).
- Contributor runbook: [`docs/wiki/Technical/SECRET_SCANNING.md`](docs/wiki/Technical/SECRET_SCANNING.md).

**Test coverage**: `pc2-node/tests/security/*.test.js` — 79 cases
across 5 spec files (SIWE EOA + EIP-1271 + Solana ed25519, scoped
session tokens, provisioning tokens, first-run tokens, DID JWT
contract). All pass on `feature/lit-chipotle-migration`.

References:
- [`docs/handover/SEC_2026_04_21_AUDIT_DISPOSITION.md`](docs/handover/SEC_2026_04_21_AUDIT_DISPOSITION.md) — **authoritative researcher → fix mapping**
- [`.cursor/tasks/SEC-2026-04-21-PC2-AUDIT/`](.cursor/tasks/SEC-2026-04-21-PC2-AUDIT/) — Wave 1-4 detail tasks
- [`.cursor/tasks/SEC-2026-04-22-BOSON-DID-ROTATION/`](.cursor/tasks/SEC-2026-04-22-BOSON-DID-ROTATION/) — DID rotation follow-up

---

## [1.1.0] - 2026-03-03

> 133 commits since v1.0.0 — squash merged from `feature/jetson-gpu-acceleration`

### 🎉 New Features (v1.1.0)

#### Ubuntu/macOS-Style Desktop UI (2026-02-27)
- **Top Bar**: System bar with clock, status indicators, and profile menu
- **Dock/Taskbar**: macOS-style dock with app icons, responsive on mobile
- **Window Chrome**: Refined window title bars, rounded corners, proper shadows
- **File Explorer**: Path bar, list view with Modified column, proper light/dark styling
- **Search Modal**: Even padding, icon aligned with text

#### Virtual Desktops / Spaces (2026-02-27)
- **Multiple Workspaces**: Create, switch, and delete virtual desktops
- **Mission Control**: Overview of all workspaces with live window previews
- **Keyboard Shortcuts**: Navigate between workspaces with keyboard
- **Taskbar Integration**: Workspace indicator dots in the taskbar

#### Voice AI Pipeline (2026-02-26)
- **Whisper STT**: Local speech-to-text via whisper.cpp server
- **Piper TTS**: Local text-to-speech for voice responses
- **Voice Button**: Mic button in AI chat with waveform visualizer
- **Settings UI**: Single-row Voice AI control with Install button or Enable toggle
- **Opt-in on ARM**: Voice AI tools not auto-installed on Jetson (saves ~500MB GPU memory)

#### VLESS Reality TCP Stealth Transport (2026-03-02)
- **TCP Stealth Layer**: VLESS Reality (via sing-box 1.13.0+) wraps AWG traffic in TLS 1.3 mimicry when all UDP is blocked
- **Chaining Architecture**: AWG provides the tunnel, VLESS Reality provides the stealth TCP transport — double obfuscation
- **TLS Mimicry**: Connections appear as HTTPS to www.microsoft.com with Chrome JA3/JA4 fingerprint
- **XUDP Encapsulation**: AWG UDP packets carried transparently inside the VLESS tunnel with h2mux multiplexing
- **Four-Tier Cascade**: WireGuard > AmneziaWG > VLESS Reality + AWG > ActiveProxy
- **Supernode Setup**: sing-box server on port 8443, systemd service, watchdog cron, peer management
- **Provisioning API**: `/api/vless/register` and `/api/vless/status` gateway endpoints
- **Auto-install**: sing-box installed by `start-local.sh` (brew/binary) and `install-arm.sh` with auto-upgrade
- **UI**: Transport label updates dynamically — "VLESS Reality" in blue when active, "Switching..." / "Reconnecting..." feedback during transport changes
- **Stealth sub-toggle**: VLESS Reality appears as a sub-toggle under Stealth Mode, synced between dropdown and Settings

#### AmneziaWG Stealth Transport (2026-03-02)
- **DPI-Resistant Tunnel**: AmneziaWG (WireGuard fork) as a stealth fallback for censored networks
- **DPI Detection**: Automatic detection of DPI blocks (WireGuard connects but traffic is dropped)
- **Stealth Mode**: Toggle in Settings to force AmneziaWG, bypassing standard WireGuard
- **Supernode Support**: Separate AWG interface (awg0) on port 51821 with 10.101.0.0/16 subnet
- **Provisioning API**: `/api/awg/register` and `/api/awg/status` endpoints with obfuscation params
- **Install Scripts**: Both `start-local.sh` and `install-arm.sh` build `amneziawg-go` from source
- **Cloud Dropdown**: Transport indicator shows "AmneziaWG (Stealth)" in purple when active
- **Documentation**: New `docs/deployment/STEALTH_MODE.md` guide for users behind DPI

#### WireGuard macOS Support (2026-03-01)
- **Cross-platform WireGuard**: Full support for macOS alongside Linux
- **Auto-install**: `start-local.sh` automatically installs Homebrew + WireGuard tools on macOS
- **Passwordless sudo**: Configures `/etc/sudoers.d/wireguard` for non-interactive `wg-quick`
- **Network Change Detection**: Detects gateway changes (laptop mobility) and triggers reconnect
- **Branch Support**: `PC2_BRANCH` env var lets users install a specific branch

#### AI Improvements (2026-02-26)
- **Ollama Tool Fallback**: Models that reject tool definitions automatically retry without tools
- **Thinking Block Scroll**: AI reasoning/thinking section is scrollable with auto-scroll
- **Community Models**: Added gemma3, qwen3, phi4-mini, llama3.2, and custom model pull input
- **Model Download Progress**: Fixed SSE streaming for real-time download progress

### 🔧 Bug Fixes (v1.1.0)

- **VLESS Reality sing-box version**: Pinned to 1.13.0+ — older 1.11.x versions have critical XUDP/multiplex bugs that cause tunnel to connect but silently drop all packets
- **VLESS Reality sniffing conflict**: Disabled sing-box protocol sniffing on direct inbound — AWG 2.0's I1 QUIC signature was triggering misdetection, overriding packet destinations
- **VLESS Reality multiplex**: Added h2mux protocol with padding to XUDP multiplexing for reliable UDP-over-TCP encapsulation
- **ARM install sudo fix**: `install-arm.sh` now detects `$SUDO_USER` and installs to the real user's home directory instead of `/root`, preventing duplicate PC2 installations and PM2 conflicts
- **ARM install rogue cleanup**: Auto-detects and removes previous faulty `/root/pc2.net` installations from `sudo` runs
- **sing-box auto-upgrade**: Install scripts detect older sing-box versions and upgrade to 1.13.0 automatically
- **Mobile Taskbar Z-index**: Full-screen windows (Settings, Explorer, Apps) no longer hidden behind mobile taskbar
- **Sidebar Icon Hover**: Light mode sidebar icons now tint dark on hover instead of white
- **WireGuard Retry**: Reduced retry interval from 60s to 15s with exponential backoff
- **WireGuard PATH**: Detection works under PM2/systemd restricted PATH environments
- **Large File Upload**: Progress bar no longer doubles total size; IPFS size verification added
- **AV1/Firefox**: Proper error handling and format support for video playback
- **IPFS DHT**: Client mode with connection limits to prevent bandwidth saturation
- **Gateway Keep-alive**: Hardened keep-alive for persistent ActiveProxy connections
- **Particle Auth Build**: Removed compiled .js artifacts that broke Vite 6.x strict mode
- **Canvas Build**: Resilient native dependency build for ARM devices
- **Startup Performance**: Parallelized AI/Gateway/Boson initialization for faster cold start

### 📝 Documentation (v1.1.0)

- Strategic roadmap aligned with DAO proposal and Rong Chen's vision
- Architecture convergence plan (PC2 v1 → ElastOS Runtime v2)
- ARM devices deployment guide (Jetson + Raspberry Pi)
- Network hardening roadmap for supernode decentralization
- Weekly shipping report template and cadence established

---

## [RELEASED] PC2 v1.0.0

### 🎉 Major Features

#### Setup Wizard & Login Flow Improvements (2026-02-02)
- **Always Show Welcome Screen**: Setup wizard now always starts on the Welcome step, ensuring users see the onboarding context before proceeding
- **Smart Domain Redirect**: After completing setup, users on IP addresses (VPS/hardware deployments) are automatically redirected to their `*.ela.city` domain for WalletConnect compatibility
- **Seamless WalletConnect Experience**: 
  - Localhost users: Stay on localhost (WalletConnect works natively)
  - VPS/Hardware users: Redirect to ela.city domain (instant DNS + Active Proxy routing)
- **Wallet-Only Authentication**: Removed email/phone login options from Particle ConnectKit for v1 (social login planned post-launch)

#### Mobile/Tablet UI Refinements (2026-02-02)
- **Access Control Layout**: Add Wallet Account input field now full-width on mobile with stacked dropdown/button
- **Setup Local AI Layout**: Model dropdown full-width on mobile with Install button below
- **Create Agent Window**: Now behaves like Settings on mobile - full-screen scrollable modal
- **Settings Sidebar**: No longer extends full screen when opened on mobile (now 240px with max-width: 80%)
- **Node Identity**: Added Local Access IP display alongside Public URL in Settings

#### Theme System Refinements (2026-02-01)
- **Comprehensive Dark Mode**: All UI components properly themed including modals, sidebars, popovers
- **Light Mode**: Full light theme implementation based on Puter's official theme
- **Wallet Components**: Send/Receive modals, transaction confirmations properly themed
- **Search Popups**: Fixed dark containers in dark mode, corrected icon colors in light mode
- **AI Agent Sidebar**: Fixed white background in dark mode

### 🎉 Previous Major Features

#### Blockchain Authentication (Particle Network)
- **Wallet Login**: Login with MetaMask, WalletConnect, Coinbase Wallet, or social login
- **Session Persistence**: Wallet sessions persist across page refreshes and device switches
- **Particle Auth Integration**: Full Particle Network Connect SDK integration as an extension
- **Wallet-Scoped Storage**: Each wallet address gets isolated, encrypted storage

#### WASM Runtime (Phase 2.6 - 60% Complete)
- **Server-side WASM Execution**: Run WebAssembly binaries on YOUR node, not in the browser
- **WASI Support**: WebAssembly System Interface for file I/O (in progress)
- **MemFS Integration**: In-memory filesystem for WASM modules
- **Calculator Demo App**: Proof-of-concept showing computation on YOUR hardware

#### IPFS Storage
- **Decentralized File Storage**: Files stored on IPFS via Helia
- **Node-local IPFS**: Your files stay on YOUR hardware
- **Persistence Layer**: SQLite-backed file metadata

#### AI Integration
- **Local AI via Ollama**: Connect to local AI models (default, sovereign)
- **Cloud AI Providers**: Claude API supported (OpenAI, Gemini, xAI coming soon)
- **AI Filesystem Tools**: AI can read, write, and manage files
- **WebSocket Broadcasting**: Real-time AI events across sessions

#### AI Agents (Clawdbot Integration)
- **Per-Agent Memory**: Each agent has isolated MEMORY.md for persistent knowledge
- **Agent Editor**: Full configuration UI with identity, permissions, response mode
- **Agent Selector**: Quick-switch agents from AI chat panel
- **Custom SOUL.md**: Define agent personality and custom instructions
- **Thinking Levels**: Fast/Balanced/Deep modes (maps to temperature)
- **Agent Permissions**: Granular control (file read/write, wallet access)
- **Memory Editor**: View and edit agent memory directly in settings
- **Delete Agent**: Remove agents with confirmation dialog
- **Path Traversal Protection**: Security hardening for agent IDs

#### Backup & Restore
- **One-click Backup**: Export your entire node to a zip file
- **Restore to Any Node**: Import backup to any PC2 instance
- **Database + Files**: Complete state preservation

### 🏗️ Architecture Changes
- **Extension System**: Particle Auth, PC2 Node, and IPFS as extensions
- **Submodule Structure**: Particle Auth as a Git submodule for clean separation
- **Config-driven Features**: `pc2_enabled` flag for PC2-specific functionality

### 📋 Technical Details
- Built on Puter v2.5.1 as upstream
- Node.js 20+ required (23+ recommended)
- SQLite for local persistence
- Socket.io for real-time communication

### 🔒 Security
- **Wallet-scoped isolation**: Each wallet address has separate storage
- **Agent path traversal protection**: Agent IDs sanitized at API and storage layers
- **Session token validation**: Proper expiration and refresh handling
- **Local-first by default**: All data stays on your node (Ollama, SQLite, IPFS)

### 🐛 Known Issues
- Preamble worker build warning (non-critical)
- Some filesystem provider errors under WASM branch (non-critical)
- WASI file I/O still in progress

### 🔜 Coming Next (v1.2+)
- Apple code-signed macOS launcher (no `xattr` required)
- Windows `.exe` installer via Electron
- Pre-built Raspberry Pi / Jetson images (zero-terminal install)
- Linux `.deb` package
- ActiveProxy auto-connect in Desktop Launcher
- P2P messaging between PC2 nodes
- dDRM marketplace integration
- Mobile companion app (iOS/Android)

---

## Puter Upstream Changelog

> The following is the changelog from the upstream Puter project.

---

## v2.5.1 (2025-02-13)

### Puter

#### Bug Fixes

- phoenix changelog ([0bcbc8f](https://github.com/HeyPuter/puter/commit/0bcbc8f7845de99305f53c6da2bb1f365b87ac50))
- update package.json ([c2c5d88](https://github.com/HeyPuter/puter/commit/c2c5d883365ae33749709d11e0c2de9050ca144e))
- oops, no export (putility.libs.event) ([fa4b38c](https://github.com/HeyPuter/puter/commit/fa4b38cd028be4b19ec98bcf588227e0fc92af9d))
- broken test in putility ([a803d55](https://github.com/HeyPuter/puter/commit/a803d55cfbdd5b15e7fe48df3f4363c1658f0930))
- parse body before auth for /down ([70fde95](https://github.com/HeyPuter/puter/commit/70fde95255532a7fe0d99c64a4efb1ae625776a4))
- fix previous fix ([e5c3769](https://github.com/HeyPuter/puter/commit/e5c3769bd813b1510dd0429e1e4eca8e277af7c7))
- potential fix for /down auth ([390230c](https://github.com/HeyPuter/puter/commit/390230c5a07b1774f84a1b3505f7531ce81dc2cc))
- allow command provider to not implement complete method ([2000b89](https://github.com/HeyPuter/puter/commit/2000b8909f08d91147b86fce22fe006e0c3152d2))
- unfixed fix from earlier ([e6fc773](https://github.com/HeyPuter/puter/commit/e6fc7737066d09509f0c7b38e4c51f25e86e12d0))
- parser error for empty json buffer ([484bb5c](https://github.com/HeyPuter/puter/commit/484bb5c201e17bf45e1a1d97b1e9b2d61d6087dc))
- fix name and id for openai tool calls ([d2358d2](https://github.com/HeyPuter/puter/commit/d2358d234b45d719a2cc4e92582ed89d2d1832ab))
- let messages with tool_calls have content=null ([29c0241](https://github.com/HeyPuter/puter/commit/29c024111943267b741b1b4a8933e1ea1a35a65e))
- repair stream end ([8f27742](https://github.com/HeyPuter/puter/commit/8f277420380e9c6fa8a9925a3e9651f48b8734e6))
- add type=text ([e2797c3](https://github.com/HeyPuter/puter/commit/e2797c38d0754930033780d5270cc64cbba2c94e))
- various issues with Mail module ([55d052c](https://github.com/HeyPuter/puter/commit/55d052cfc2549bfdf72f3a8b27cdc7dc4294bc54))
- buffer incomplete JSON objects from AI stream ([60eef2f](https://github.com/HeyPuter/puter/commit/60eef2fc6734f88df06e2f85db9b9368cc8c227f))
- mistake in 0c42613 ([8ffd000](https://github.com/HeyPuter/puter/commit/8ffd0004b3b7b34cd6a9c43c6ca960c7a1cbbe15))
- fix microcents to USD conversion in AIChatService ([dcd47bc](https://github.com/HeyPuter/puter/commit/dcd47bc4cfc5f8a67ea86e0485d08c2417f899ed))
- claude duplicate messages in stream ([0fac03a](https://github.com/HeyPuter/puter/commit/0fac03a05a4f597f7ed531651c830e44012b646b))
- skip request-count usage check via AIChatService ([6083e3a](https://github.com/HeyPuter/puter/commit/6083e3ac52fcde7f598c838bc49085e6b3de7162))
- remove log from InternetModule ([c7f3e0b](https://github.com/HeyPuter/puter/commit/c7f3e0b937f5d72d6f30dba25d7c351e2e14f289))
- small workaround for duplicate close ([06452f5](https://github.com/HeyPuter/puter/commit/06452f5283085b18266ee7fb89136b9c23879243))
- race condition and buffer issue in puter.http ([36dc966](https://github.com/HeyPuter/puter/commit/36dc9664ad5520b21c07a1b5c85c8aff7cbe423b))
- missing some buffer contents in no-keepalive ([3f5b34c](https://github.com/HeyPuter/puter/commit/3f5b34cd341b9063d01baba72e708a9ebb16485b))
- new edge cases with function calls / tools ([9cbb741](https://github.com/HeyPuter/puter/commit/9cbb741a8ae8ea6b869b6ccf64cd3152b28c2b8c))
- oops, we're passing negative values; let's just remove this ([cf7aa27](https://github.com/HeyPuter/puter/commit/cf7aa27543700d6268ee709f127e73f7cfe12a5a))
- oops we still need that ([61824ea](https://github.com/HeyPuter/puter/commit/61824ea04b0cb7611d2acdf45e0a1ecc2856901a))
- remove hard-coded token limit for OpenAI ([8143e57](https://github.com/HeyPuter/puter/commit/8143e5700f53279a5a18d21b7c5466f3b9bb6ce6))
- wisp relay authentication ([6f39365](https://github.com/HeyPuter/puter/commit/6f39365b24cda53a6cac7e203b9d8cbc09bb0ba3))
- reduce code paths for querystrings ([e8f5450](https://github.com/HeyPuter/puter/commit/e8f5450cb05213c3c06802442103f5c414eee5cc))
- icons ([d03952b](https://github.com/HeyPuter/puter/commit/d03952b23712ae8a61c7f2c7582d297691e0ecc1))
- subdomains to deleted files tried to deref fs node ([38ccc82](https://github.com/HeyPuter/puter/commit/38ccc82c8e95636ee4b7c5ca2f761098f12affa2))
- app icon empty string should be skipped ([37ca892](https://github.com/HeyPuter/puter/commit/37ca89228cc2f978602098ee4aae1ecb3d333526))
- save_account case for disable_user_signup ([766c235](https://github.com/HeyPuter/puter/commit/766c235cc738051588a67ff5ab4230e76b64173c))
- use .get() for Map lookup. fix: correctly set url and url_paths. fix: null check to throw error. ([78ac033](https://github.com/HeyPuter/puter/commit/78ac033a1ca4f51b71c2bcb185b305903f7be495))
- ensure puter.signup emit resolves ([113ed31](https://github.com/HeyPuter/puter/commit/113ed31336c494a3f7a9e744a34de35b3785c033))
- --onlycase param broke cartesian tests ([d9822a4](https://github.com/HeyPuter/puter/commit/d9822a4f09e3e0c5fbed8c655435f534af949290))
- empty response when mkdir is a no-op ([f359ae1](https://github.com/HeyPuter/puter/commit/f359ae193e87552b3a2e2aafa3fda389478fca38))
- mkdir with create_missing when some parents exist ([807c3ba](https://github.com/HeyPuter/puter/commit/807c3ba5eca02f69b5e6ce547420312b68c7993f))
- possible out-or-order response objects from batch ([fb70251](https://github.com/HeyPuter/puter/commit/fb7025164e3f42cae1365ec65960019b24f4360d))
- app data check error in write ([5ef75e5](https://github.com/HeyPuter/puter/commit/5ef75e5df35ae95242da97235512495b7585bd0d))
- missing parent dirs created in move ([9d9d97f](https://github.com/HeyPuter/puter/commit/9d9d97fd0074058506b0506d5027b0c6b8a26845))
- missing changes to run-selfhosted.js ([6f4b1bf](https://github.com/HeyPuter/puter/commit/6f4b1bf94a031b3324f5ecd51557b1298a1c3175))
- appease mocha's import requirements ([d6bbba7](https://github.com/HeyPuter/puter/commit/d6bbba7bf064991d59fbfe74db5221e0118a781c))
- error msg for invalid puter-ocr urls ([6a6bfa0](https://github.com/HeyPuter/puter/commit/6a6bfa034fe16dba7172ab5adbf23f00df38301d))
- improper 500 in wisp token verify ([75aaaa6](https://github.com/HeyPuter/puter/commit/75aaaa66a8c7df00e1fb80c353d890269296839c))
- actor param in legacy /write ([7aa886d](https://github.com/HeyPuter/puter/commit/7aa886d573362e6739bd99bbed02f4831557ccb4))
- new desktop height calculation when resizing browser window ([a295420](https://github.com/HeyPuter/puter/commit/a295420f58326b04c976cf92bd2d582d2eafa71b))
- circular imports ([8fabf01](https://github.com/HeyPuter/puter/commit/8fabf014a9eb783183e87489ae2b6c6bbc42c99a))
- test and improve boolify ([44ad3c5](https://github.com/HeyPuter/puter/commit/44ad3c578106d2b01007240188db57760c15af96))
- skip test files in mod lib loading ([f60c008](https://github.com/HeyPuter/puter/commit/f60c008158127458e02e3bb92287617d9f1f9514))
- shortcut issue ([6d196d5](https://github.com/HeyPuter/puter/commit/6d196d59f026bec4acb0296d8f0f38c7cee2e8c2))
- test for get-launch-apps ([740fdb5](https://github.com/HeyPuter/puter/commit/740fdb592e494bf5b197493774cef6559bfb50b9))
- add package-lock.json ([3097b86](https://github.com/HeyPuter/puter/commit/3097b86597218de9e59b450b70185634a94be210))
- try redundant npm install after build stage ([8963eb0](https://github.com/HeyPuter/puter/commit/8963eb0c4f1220dd515ac6ed7a2a8f1de26655ae))
- I'ma buy GitHub a coffee and spill it on their servers if this works ([686d3de](https://github.com/HeyPuter/puter/commit/686d3de518e6e090d683294ad3dd856db26856a0))
- oh, right; there's two of them ([a13af7e](https://github.com/HeyPuter/puter/commit/a13af7e31aa4cd36457a90a7d75878b6d39ba73b))

## v2.5.0 (2025-01-07)

### Puter

#### Features

- hash-based distributed cache inval ([d386096](https://github.com/HeyPuter/puter/commit/d38609646793a5a14b8af96964fc7176725a0531))
- add Escape key functionality to UIPrompt for closing the prompt ([e1b6c83](https://github.com/HeyPuter/puter/commit/e1b6c83813d03809aba0abdecbf6de5529728031))
- set max token to 8096 ([b2ea8a3](https://github.com/HeyPuter/puter/commit/b2ea8a3888c5496858d257018071ba54abd6f4a8))
- added tagify in Filetype-Association input in dev center ([0cd1f15](https://github.com/HeyPuter/puter/commit/0cd1f151b5986ede431f1792139fa1a5471ae059))
- add reset edit changes button to dev-center ([55ffd80](https://github.com/HeyPuter/puter/commit/55ffd801e007723758eacc17ec732ee5a336123e))
- enable/disable save button in dev-center iff changes made ([63a0053](https://github.com/HeyPuter/puter/commit/63a0053da8c76bf4ac175c7f17353225443dd342))
- record signup metadata for abuse prevention ([66016b9](https://github.com/HeyPuter/puter/commit/66016b9db602ca85e8f0ddc846865d4641e64190))
- add support for categories in the Dev Center ([7cf215a](https://github.com/HeyPuter/puter/commit/7cf215ab677e3fc912a3bd1ac52795c1e8860c32))
- puter.js's showSpinner() will keep the spinner active for at least 1200ms ([fc5aca1](https://github.com/HeyPuter/puter/commit/fc5aca1f72de22c1530054272b55a59021ba9caa))
- allow developers to set social media images for their apps ([be36d31](https://github.com/HeyPuter/puter/commit/be36d31509280340e2a62a8c478b1e64617792a4))
- automatically open the browser when starting Puter ([2d43129](https://github.com/HeyPuter/puter/commit/2d4312972a1377a64732694811fe889f59573432))
- spinner for the `showWorking()` overlay in puter.js ([1062363](https://github.com/HeyPuter/puter/commit/1062363096418f164a6d00ed8872770ff64237b5))
- show profile pics in sharing notifications ([0e45132](https://github.com/HeyPuter/puter/commit/0e45132c05aa1106503fef02b7e4c97ecc675e10))
- Implement profile pictures ([0885937](https://github.com/HeyPuter/puter/commit/0885937f033caf35503eeb9e65bb390952992faf))
- allow `launchApp` to open explorer at a specific path ([8fefd4a](https://github.com/HeyPuter/puter/commit/8fefd4a61f0005d4f3ec2e43f7249f3edd91c837))
- Require email confirmation before sharing ([cdd1a8c](https://github.com/HeyPuter/puter/commit/cdd1a8c4e379b885ff48a874ae5577d2f0efae06))
- show unread notification count in the browser tab's title ([045259c](https://github.com/HeyPuter/puter/commit/045259cefbe24e3f52fe3840e4975d3243e99957))
- in Share window, display access level next to recipient ([cf4b6aa](https://github.com/HeyPuter/puter/commit/cf4b6aa1c24d936f9a42ca1e2945eea40939c970))
- when sharing, users can choose between 'viewer' and 'editor' for permissions ([0cbe013](https://github.com/HeyPuter/puter/commit/0cbe0139d7f306ce62992f1eda94d99e09b32df8))
- handle `notif.ack` in desktop ([a6650ee](https://github.com/HeyPuter/puter/commit/a6650ee2d8074aeb7c476e5572334853f1b6d7e8))
- add error handling to the share flow ([b5bb95e](https://github.com/HeyPuter/puter/commit/b5bb95e2d7f6021a6341e26cf15d5449ada48830))
- search ([55d2af1](https://github.com/HeyPuter/puter/commit/55d2af189e9479fb5980ce149ce74e890b325014))
- search endpoint ([b589512](https://github.com/HeyPuter/puter/commit/b589512c9dedec22fd41b92cbba2570042149873))
- the `socialLink` UI component ([1adfe5c](https://github.com/HeyPuter/puter/commit/1adfe5c70947d9de008c9d601f91b1ee14128d5d))
- Reaload App option in the window title bar context menu ([27c01c9](https://github.com/HeyPuter/puter/commit/27c01c9bd991ef871153eb5931f78fec265a62e4))
- add puter.auth.whoami() ([da0022a](https://github.com/HeyPuter/puter/commit/da0022abf0f880c7b52d2cd937ef9d1298fc09cc))
- add puter.log ([755736e](https://github.com/HeyPuter/puter/commit/755736edee9baa783be9b7d96083d908a2f2f750))
- collapsible sidebar menu in Dev Center ([1056231](https://github.com/HeyPuter/puter/commit/1056231004a629f3f76f2525ec7d83b67d3d7fa5))
- customize the order of Explorer sidebar items ([ff30de1](https://github.com/HeyPuter/puter/commit/ff30de1d6947e4692b5cf0da2e19ab37aacf1ec8))
- add extension API for modules ([14d45a2](https://github.com/HeyPuter/puter/commit/14d45a27edb99f63b4f6e010221e3a0880ae246d))
- first extension that implements a custom user options menu ([fc5e15f](https://github.com/HeyPuter/puter/commit/fc5e15f2a6d4eb5e5847fa7f2dd87b1fa382fc7c))
- add support for extensions ([b018571](https://github.com/HeyPuter/puter/commit/b018571a86f4114eab9b5edde4ecd87e343d22a7))
- add an 'Upload' button at the bottom of `OpenFilePicker` ([54ae69b](https://github.com/HeyPuter/puter/commit/54ae69b7b76016307c3b92437ca06dc2aa1eddb9))
- Allow apps to toggle `credentialless` via Dev Center ([af511c0](https://github.com/HeyPuter/puter/commit/af511c05e3ddddcce661c5406d5c831a21689608))
- add config for blocked email domains ([955b087](https://github.com/HeyPuter/puter/commit/955b087297f829b11b82dc9bd79a0e03721c5f33))
- add support for `fadeIn` effect for `UIWindow` ([13248a9](https://github.com/HeyPuter/puter/commit/13248a99bfa318e84cb99e2954a5f46805eda34f))
- welcome screen to quickly explain what Puter is ([564ff65](https://github.com/HeyPuter/puter/commit/564ff65363258cab4196b967dd556105e424d48c))
- v86 9p server support ([b145e30](https://github.com/HeyPuter/puter/commit/b145e30a90ff2f0d44d89f83dbda4de1bf2991d4))
- support readdir for directory symlinks ([7f1b870](https://github.com/HeyPuter/puter/commit/7f1b870d302421972c4f6221ae6d93b5979d51dd))
- allow passing cli args via url ([5317adf](https://github.com/HeyPuter/puter/commit/5317adf8a4961be3f0ca2a8c403c922633f934fa))
- add -c flag for phoenix ([b6c0cb6](https://github.com/HeyPuter/puter/commit/b6c0cb6abc1c29846b4b7e696812476bea24bbc7))
- progress indicator for emulator ([08601ae](https://github.com/HeyPuter/puter/commit/08601ae2af7b1f564690e6a9cae7e689cb7ba48a))
- translate README.md to Dutch ([31e2773](https://github.com/HeyPuter/puter/commit/31e2773743c336630c917e893b0148441f5fc515))
- add connectToInstance method to puter.ui ([62634b0](https://github.com/HeyPuter/puter/commit/62634b0afe4d33da08768975322d4deb23041442))
- add method to list models ([fd86934](https://github.com/HeyPuter/puter/commit/fd86934bc9021541810447cf7e2a5f33b3e283b3))
- add streaming to XHR driver client ([7600d9b](https://github.com/HeyPuter/puter/commit/7600d9b07c5b719d529f8a48c38d9178efefa266))
- add writable attribute to fs items ([2386d87](https://github.com/HeyPuter/puter/commit/2386d87229aa6205ef8ced6563371ab40a0def62))
- report feature flags in /whoami ([4561b89](https://github.com/HeyPuter/puter/commit/4561b8937de025471c2dfb1771465d779cefab5d))
- make public folders a config opt-in ([209555c](https://github.com/HeyPuter/puter/commit/209555c1d93845fa129bea450f9c25d595a3c60f))
- add feature flag for /share ([461ea3e](https://github.com/HeyPuter/puter/commit/461ea3eae6ad32bf34c43a822de7a06f08efb556))
- add message encryption between Puter peers ([cea2964](https://github.com/HeyPuter/puter/commit/cea29645fec493020a4f66e378b087fa17ae03d4))
- add test_mode flag ([9a9bd5e](https://github.com/HeyPuter/puter/commit/9a9bd5eaf0aca8fd1cc57455db03dba55801d5a0))
- add tts driver to puterai module ([78fa77d](https://github.com/HeyPuter/puter/commit/78fa77d9200e0b9fafc4014f8d0cb08c74cd16cb))
- add image generation driver to puterai module ([fb26fdb](https://github.com/HeyPuter/puter/commit/fb26fdbc561d5545d28352427553695cd3237ad5))
- add chat completions driver to puterai module ([4e3bd18](https://github.com/HeyPuter/puter/commit/4e3bd1831e92e83ce9b4e30a16afd562b0221dd8))
- add --overwrite-config and configurable uuid masking ([ef6671d](https://github.com/HeyPuter/puter/commit/ef6671da18f6841cb2143808fe21586ac3505942))
- add textract driver to puterai module ([f924d48](https://github.com/HeyPuter/puter/commit/f924d48b02f39884931db45a05dd61b65f2cee4a))
- add password reset from server console ([984ae9e](https://github.com/HeyPuter/puter/commit/984ae9e6a23da17414e43d58fc0e861827031269))
- add server command to scan permissions ([54471fa](https://github.com/HeyPuter/puter/commit/54471fada946a70eaa0df6bfceae995bc4e5848c))
- grant user driver perms from admin ([c9ded89](https://github.com/HeyPuter/puter/commit/c9ded89b22bb822c20aea379a17a8bdf74a658de))
- replace default_user with admin ([f0c36a1](https://github.com/HeyPuter/puter/commit/f0c36a1cdf16f11765c29360a5c38140008b90c7))
- add system user ([ab15629](https://github.com/HeyPuter/puter/commit/ab156297a746c0754145c2abdb2c99bb1b30651a))
- add options to disable winston and devwatch ([5d5f566](https://github.com/HeyPuter/puter/commit/5d5f5660b4020650b68b79ccf3860d3fb0bf98a9))
- add new file templates ([1f7f094](https://github.com/HeyPuter/puter/commit/1f7f094282fae915a2436701cfb756444cd3f781))
- add cross_origin_isolation option ([e539932](https://github.com/HeyPuter/puter/commit/e53993207077aecd2c01712519251993bb2562bc))
- add option to disable temporary users ([f9333b3](https://github.com/HeyPuter/puter/commit/f9333b3d1e05bd0dffaecd2e29afd08ea61559fc))
- add some default groups ([ba50d0f](https://github.com/HeyPuter/puter/commit/ba50d0f96d58075abec067d24e6532bd874093f0))
- Add support for dropping multiple Puter items onto Dev Center (close #311) ([8e7306c](https://github.com/HeyPuter/puter/commit/8e7306c23be01ee6c31cdb4c99f2fb1f71a2247f))

#### Translations


- complete Hungarian translation of Puter #972 ([7d2787d](https://github.com/HeyPuter/puter/commit/7d2787d26b3a64cbc128fb2cb3871b43b41912fe))
- add missing Igbo translations for billing-related terms ([f0f19e7](https://github.com/HeyPuter/puter/commit/f0f19e727e574a8558fcbbf27ba501f434db69f8))
- Complete the Vietnamese translation of Puter #954 ([56489c3](https://github.com/HeyPuter/puter/commit/56489c33f611fc053096b455e4cb7b3d8f20852c))
- Complete the  French (Français) translation of Puter #975 ([c840bc8](https://github.com/HeyPuter/puter/commit/c840bc8161055b90e040bdae3196817e0791ecf5))
- Complete the German (Deutsch) translation of Puter ([05fef67](https://github.com/HeyPuter/puter/commit/05fef6749e8d80f13ab94a4e0ea49ce4972a0961))
- (#954) Add Vietnamese translations for billing-related terms ([267a55a](https://github.com/HeyPuter/puter/commit/267a55aae50f87edb483abb375029ff79e736112))
- add vietnamese translations for billing in vi.js ([3e26dbe](https://github.com/HeyPuter/puter/commit/3e26dbe6a0411fe75c36cf2866d34f28a2dcb553))
- added a few Korean translatations ([b23e800](https://github.com/HeyPuter/puter/commit/b23e800f4e70f162b52cc15053d03961a37033bb))
- add brazillian translations for billing-related terms in br.js (revision) ([fdfc90a](https://github.com/HeyPuter/puter/commit/fdfc90a9317a19d45a0b2b3ad283be9a10a92732))
- add brazillian translations for billing-related terms in br.js ([e66df14](https://github.com/HeyPuter/puter/commit/e66df14862e6dd7278623279e43e2189e7ddafe5))
- Add Indonesian Translation for i18n ([033643b](https://github.com/HeyPuter/puter/commit/033643b0e757b51ea0be90e2198bbec65d31cfc5))
- add Polish translations for billing-related terms ([15f9ade](https://github.com/HeyPuter/puter/commit/15f9aded26eaa4c630fe948350d3a53cdb0278a3))
- update Urdu localization with missing translations ([0c4b994](https://github.com/HeyPuter/puter/commit/0c4b9946442ad92549522fcd91ea6aefbb9f19d6))
- Update ig.js ([382fb24](https://github.com/HeyPuter/puter/commit/382fb24dbb1737a8a54ed2491f80b2e2276cde61))
- feat: add vietnamese localization-a ([c2d3d69](https://github.com/HeyPuter/puter/commit/c2d3d69dbe33f36fcae13bcbc8e2a31a86025af9))
- Update zhtw.js, Complete Traditional Chinese translation based on English file #550 ([b9e73b7](https://github.com/HeyPuter/puter/commit/b9e73b7288aebb14e6bbf1915743e9157fc950b1))
- update zhtw.js to match en.js ([37fd666](https://github.com/HeyPuter/puter/commit/37fd666a9a6788d5f0c59311499f29896b48bc82))
- Add Tamil translation to translations.js ([8a3d043](https://github.com/HeyPuter/puter/commit/8a3d0430f39f872b8a460c344cce652c340b700b))
- Move Tamil translation to the rest of translations ([333d6e3](https://github.com/HeyPuter/puter/commit/333d6e3b651e460caca04a896cbc8c175555b79b))
- Translation improvements, mainly style and context-based ([8bece96](https://github.com/HeyPuter/puter/commit/8bece96f6224a060d5b408e08c58865fadb8b79c))
- update translation file es.js to be up to date with the file en.js ([1515278](https://github.com/HeyPuter/puter/commit/151527825f1eb4b060aaf97feb7d18af4fcddbf2))
- Translate en.js as of 2024-07-10 ([8e297cd](https://github.com/HeyPuter/puter/commit/8e297cd7e30757073e2f96593c363a273b639466))
- Create hu.js hungarian language ([69a80ab](https://github.com/HeyPuter/puter/commit/69a80ab3d2c94ee43d96021c3bcbdab04a4b5dc6))
- Update translations.js to Hungarian lang ([56820cf](https://github.com/HeyPuter/puter/commit/56820cf6ee56ff810a6b495a281ccbb2e7f9d8fb))
- Tamil translation ([81781f8](https://github.com/HeyPuter/puter/commit/81781f80afc07cd1e6278906cdc68c8092fbfedf))
- Update it.js ([84e31ef](https://github.com/HeyPuter/puter/commit/84e31eff2f58584d8fab7dd10606f2f6ced933a2))
- Update Armenian translation file ([3b8af7c](https://github.com/HeyPuter/puter/commit/3b8af7cc5c1be8ed67be827360bbfe0f0b5027e9))
- correct Igbo translation for "Free" in billing terms ([6f4d57a](https://github.com/HeyPuter/puter/commit/6f4d57a3c6da607038f4fbe49c691478f47933be))

#### Bug Fixes

- missing ll_copy import ([8a9164d](https://github.com/HeyPuter/puter/commit/8a9164d7c5380aafb864b56ca1a3ee59f24daf38))
- bad uuid reference to resourceService ([13003c4](https://github.com/HeyPuter/puter/commit/13003c486fbebad0f26dd1b569f5fd5f2cefc9e7))
- allow localhost for development ([ad8a397](https://github.com/HeyPuter/puter/commit/ad8a3978c07e44f7a534981ddd65bc131c9aac6b))
- rewrite confusing log message ([dacbbf0](https://github.com/HeyPuter/puter/commit/dacbbf033dcc0f4506198761eab3bfb6ef915336))
- AppInformationService initialization ([2332602](https://github.com/HeyPuter/puter/commit/233260233c4e52399541aedbf8b13800de80d3fd))
- dev center app icon SVG issue ([47a4313](https://github.com/HeyPuter/puter/commit/47a4313d92152b9e5b4036715ac4f19431be8940))
- app icon double-encode bug ([23eab63](https://github.com/HeyPuter/puter/commit/23eab63776a146a78b10e973518158fc07b13653))
- first read of recommended apps ([a6b9d33](https://github.com/HeyPuter/puter/commit/a6b9d33d27909ead3d14eff4446062d62aad4651))
- prefix peer addresses with protocol ([efd4730](https://github.com/HeyPuter/puter/commit/efd4730f757471c3eac2d5e396dd69b619ad2999))
- clone message object ([728ecbf](https://github.com/HeyPuter/puter/commit/728ecbfb033082186ca9480f2ab2d1607b57ca5a))
- timing for PrefixLogger call to /whoami ([2dc6c47](https://github.com/HeyPuter/puter/commit/2dc6c4737b9ec9db281b4b32ed4bd20ac490e47d))
- try catching icon read errors before stream ([e56a62c](https://github.com/HeyPuter/puter/commit/e56a62c5390958e585f299751bafd13becc1c9b6))
- try catching on stream_to_buffer ([ada051b](https://github.com/HeyPuter/puter/commit/ada051b9b87e945b4a80c1fae99b8c5644b82dc0))
- check if row.timestamp is Date ([5d049e8](https://github.com/HeyPuter/puter/commit/5d049e8f06dafe2e499ccfea66ef013a9b595396))
- AppES PD alert ([f14e1fe](https://github.com/HeyPuter/puter/commit/f14e1fefcf18438bd59eb86d625b8c5a6fb3ffc5))
- fix for previous fix ([648d6e0](https://github.com/HeyPuter/puter/commit/648d6e036d6f8040a1e440c1e76dc9dcc746156f))
- fix fallback icon behavior in get_icon_stream ([4f3a161](https://github.com/HeyPuter/puter/commit/4f3a1618b10dd393f5c94c0967beb228a593b214))
- revert test change ([9c86614](https://github.com/HeyPuter/puter/commit/9c86614df5d58ca0385450e1edb5adb5b6d72300))
- acl check for subdomain on access ([c69006e](https://github.com/HeyPuter/puter/commit/c69006e1852befa93f94a7c45651025214941a4e))
- attempt fix for prod issue with app icons ([925ebd5](https://github.com/HeyPuter/puter/commit/925ebd531013e36ee5c05d53ef229d314fb89435))
- remove redundant notification query ([f87769b](https://github.com/HeyPuter/puter/commit/f87769b445d53e6322a55a788e26d38629299ae9))
- share only emails email_confirmed recipients ([2336a62](https://github.com/HeyPuter/puter/commit/2336a62b4f635c025b02bb7efe91b5ddf58bae25))
- database issue with KBKV update ([7ba1b76](https://github.com/HeyPuter/puter/commit/7ba1b7656b5e24375cad639b9a8e37577b526c09))
- taskbar items of apps should always appear before Trash ([94e7f5d](https://github.com/HeyPuter/puter/commit/94e7f5deb4330a844a680c22f55b8753225a1a7e))
- fullpage mode ([65d9188](https://github.com/HeyPuter/puter/commit/65d918866ea0ee981bc26151332b730abccb7be8))
- bug in writeFile rename ([298609c](https://github.com/HeyPuter/puter/commit/298609c6e9080e00c90b66c673e104d90f9d3ed0))
- remove unnecessary `item_path` definition in `delete` fs api ([c792f4a](https://github.com/HeyPuter/puter/commit/c792f4a345b307d024f73ff2817ae473b2620913))
- add missing permissions ([69e9df1](https://github.com/HeyPuter/puter/commit/69e9df1ae21cf906dfcc3d9d7a23455e5274271c))
- logic from previous commit ([6ca7011](https://github.com/HeyPuter/puter/commit/6ca701139a07a0d20071cf1532cc6e95639a01da))
- add fallback moderation in case openai goes down ([c6e814d](https://github.com/HeyPuter/puter/commit/c6e814daa80eec01c10f319ebebcb84c42cd26e1))
- permission strings for ES services ([4d9cc9b](https://github.com/HeyPuter/puter/commit/4d9cc9bd830d0c73024f2bc5a91ab226aedefded))
- resolve issue #983 - Stuck on Creating new app loading screen ([c75c9d0](https://github.com/HeyPuter/puter/commit/c75c9d03833af52730cac89a8fee5f5c317f0f78))
- provide actor context to ws event ([1b57801](https://github.com/HeyPuter/puter/commit/1b578019f915918e51185f5705d7fa6e0328b9ae))
- context error in user connected event ([9600823](https://github.com/HeyPuter/puter/commit/96008233ba4935e789cd092c07aa8b351cb44d45))
- signup 500 for temp user ([01395f3](https://github.com/HeyPuter/puter/commit/01395f302e763cdad022c0e5a995869fcd805d86))
- bad import for TeePromise ([acf8ae3](https://github.com/HeyPuter/puter/commit/acf8ae302ec4ee79c11c2b0e810edd53f21446c5))
- sorting bug in AIChatService ([7acb096](https://github.com/HeyPuter/puter/commit/7acb096addd58113cc8d4338ba941cd14ac81f4f))
- test issues from contextlink removal ([545e7db](https://github.com/HeyPuter/puter/commit/545e7db5bdac6e39962390469767667bc62857fd))
- add missing import ([e279dc6](https://github.com/HeyPuter/puter/commit/e279dc6e5f4095550f41aadd194ea94e1e2a2271))
- fake_chat default model and usage errors ([13a895b](https://github.com/HeyPuter/puter/commit/13a895b76b1e5a677c2eeeb0a07be6ce9fd02a99))
- update test kernel ([a1c2226](https://github.com/HeyPuter/puter/commit/a1c2226561655e091cbc0d014ada62bfc7881f2a))
- correct AI comment faults ([b40d453](https://github.com/HeyPuter/puter/commit/b40d4534a71565a7f2d0ae278c98d7326c5aa963))
- update package-lock.json ([8577185](https://github.com/HeyPuter/puter/commit/857718538b8a7bf27dc036f4eeb3728cb6ea96e7))
- ignore two calls with undefined origin ([ab4ba76](https://github.com/HeyPuter/puter/commit/ab4ba76433ac623abaa17c0e5dd024e95b9fef3f))
- undefined APIOrigin ([340c7a8](https://github.com/HeyPuter/puter/commit/340c7a821fb91e2d106c2b3febf8182de7b21f7d))
- add id to the setting menu item in user option menu ([67ca4cc](https://github.com/HeyPuter/puter/commit/67ca4ccf20fd714848121192d5ae7c41f3763da4))
- add an id to `My Websites` content menu item ([e662c78](https://github.com/HeyPuter/puter/commit/e662c782b745f4f98024d1353a6a162d5fe58c44))
- remove unnecessary `integrity` and `crossorigin` attributes in dev center when linking to jquery ([8dec78b](https://github.com/HeyPuter/puter/commit/8dec78b090ec4434ad77003d6f3c25de98779864))
- remove inactive links in README ([f3d270c](https://github.com/HeyPuter/puter/commit/f3d270ccbcd8990270cf968a3638b7affa2df6ba))
- improve backend mod error handling ([fe1a4cf](https://github.com/HeyPuter/puter/commit/fe1a4cfd4d5dd1eddbb2d50ef3f5ebf78a81656d))
- app query should return app metadata ([3cedd17](https://github.com/HeyPuter/puter/commit/3cedd17b8ed4acb1099bc2e87aba0137339c8a17))
- safe parsing of app metadata ([a2c7b37](https://github.com/HeyPuter/puter/commit/a2c7b379f8181b373b0513d9166f75adc147aafa))
- configuration for browser launch ([791f774](https://github.com/HeyPuter/puter/commit/791f7748c7c1959f63327a73a7e24e41b574a910))
- previous fix ([ee7bedd](https://github.com/HeyPuter/puter/commit/ee7bedd5586d69ce74f32c1400f377d6a8971eaa))
- always adapt model for ClaudeEnough ([56710e1](https://github.com/HeyPuter/puter/commit/56710e17f3b06eef07e54c243f6b725fcc4a4583))
- automatically open browser when starting only if in dev env ([f500fb4](https://github.com/HeyPuter/puter/commit/f500fb47061f8f3a3dc7d871cb529f5c0b058185))
- image generation supports test mode ([f533dca](https://github.com/HeyPuter/puter/commit/f533dca1a6d88ca7a14bd69f15d0a151e24c58e1))
- share issue with prefix usernames ([d30d62f](https://github.com/HeyPuter/puter/commit/d30d62f558ca5f8c74090900aa39c13ca3ca1d2e))
- permission grants in open_item ([16257a7](https://github.com/HeyPuter/puter/commit/16257a7b5459550ee3782cf32c87a8241325878d))
- sharing notification click opening directories ([bfacfc2](https://github.com/HeyPuter/puter/commit/bfacfc2a4e4b50c9e0842f9f2d56de67a598b959))
- add placeholders ([2c86240](https://github.com/HeyPuter/puter/commit/2c862403994ff6385144841db07dcc94c5c2fc2e))
- capitalize `Hindi` in i18n ([35fd158](https://github.com/HeyPuter/puter/commit/35fd15854ad3cc92924c4ded752e337f467a7125))
- give camera and recorder write permission to Desktop ([65e6d6c](https://github.com/HeyPuter/puter/commit/65e6d6c09fd464b3fea979689fab5f26a2647c4a))
- potential null-or-undefined in DriverService ([01725ff](https://github.com/HeyPuter/puter/commit/01725ffebf86ed332087c877956e59570ea700ed))
- usage bug ([0fd3b1e](https://github.com/HeyPuter/puter/commit/0fd3b1e61157d989d55e6dacba2add0e03d260e7))
- update share email ([7e7234b](https://github.com/HeyPuter/puter/commit/7e7234b2f3fb89560108447cfd7fa87499ec6f38))
- allow scrolling of user list in share window ([905b5d8](https://github.com/HeyPuter/puter/commit/905b5d851ef68d923d8f7fbaddbe214cb812bae6))
- mobile detection ([b11016d](https://github.com/HeyPuter/puter/commit/b11016dab321717f2c367e985167a4689fc02814))
- mobile-friendly taskbar ([7a7c14f](https://github.com/HeyPuter/puter/commit/7a7c14fb040b28ef769abdba41b50d88c856fb20))
- prevent permission cycles ([e0128aa](https://github.com/HeyPuter/puter/commit/e0128aa88c54548304532282e5ed1b4a2d36ff3e))
- `launchApp` on explorer supports `~` now ([e482b00](https://github.com/HeyPuter/puter/commit/e482b00a303ca7ec0230be1924334d59adc00f8e))
- only allow UserActorType for ShareService ([69bfa60](https://github.com/HeyPuter/puter/commit/69bfa601993eb6c47c3555b92559878d76ba749e))
- new sessions miss notifications ([b1ffb8e](https://github.com/HeyPuter/puter/commit/b1ffb8eca13520fa41833f5361ff6a6505a80a2c))
- don't allow sharing with recipient just shared with ([d0f16c8](https://github.com/HeyPuter/puter/commit/d0f16c810509c7e4e8acba3408c71655664cfad2))
- add username to comments ([085d808](https://github.com/HeyPuter/puter/commit/085d808817e985f2bc52b7a91a31991ca3b2e89f))
- occasional db error from notics ([9e303a2](https://github.com/HeyPuter/puter/commit/9e303a2f7c7bf6ac9032e6c9b87bffd3126baa86))
- un-awked notif check in wrong place ([3f3f4e6](https://github.com/HeyPuter/puter/commit/3f3f4e6cb9fd3faad2e87fbf9ea1f09b934151ca))
- disabled sortable on sharing section in the sidebar ([9d7987f](https://github.com/HeyPuter/puter/commit/9d7987fae50b510f1836e306d5f6f497a560de08))
- add mixxing context to BroadcastService ([665471f](https://github.com/HeyPuter/puter/commit/665471f9f02b1f1163edb47932a31f52577ee7df))
- attempt at fixing broadcast ([22dd42e](https://github.com/HeyPuter/puter/commit/22dd42ef7f64d32ada0c776287f53a80a4470315))
- replace ll_readshares with better approach ([cd22425](https://github.com/HeyPuter/puter/commit/cd22425a3d363f6008b3d07f40a082769ee22a14))
- only add enabled_logs when not empty ([34836e3](https://github.com/HeyPuter/puter/commit/34836e374fccac297a6f0fa5f323f3609d0c9179))
- don't check share permission anymore ([249dc06](https://github.com/HeyPuter/puter/commit/249dc062014947c32bee8a8238b2c8acf86188bb))
- files shared array in notification ([27cc07e](https://github.com/HeyPuter/puter/commit/27cc07e985a799fae791d6edf61b7e656e0e182e))
- report path for broken files as /-void/ ([5725bd8](https://github.com/HeyPuter/puter/commit/5725bd8c66539564e7f58f96c6e81044a3751f97))
- issue with popover closing when clicked ([ac3317a](https://github.com/HeyPuter/puter/commit/ac3317aea918953358947638ca11822baa38e23f))
- groups manager location ([a08e975](https://github.com/HeyPuter/puter/commit/a08e9758fe7625d31279b8947a4e5ca6471578ff))
- don't show kvstore in usages ([402ffb0](https://github.com/HeyPuter/puter/commit/402ffb0fd1e812a8db8ea90ac53ed613fdd30a4b))
- add missing id for task_manager menu item ([4f9d9a5](https://github.com/HeyPuter/puter/commit/4f9d9a54efb3c5177125904a1c9ddec66ca089dc))
- Update security.txt canonical URL ([6c44032](https://github.com/HeyPuter/puter/commit/6c44032293836871a27fb3c857a0ff3b80462702))
- update apps cache by reading from primary db ([e8f67da](https://github.com/HeyPuter/puter/commit/e8f67da9a3d81273f59d136c8383f00d9dc8ca5a))
- logging in AppConnection ([5caa2c0](https://github.com/HeyPuter/puter/commit/5caa2c0e3a152d1fc947b86329778db462139db0))
- persist clock visibility change ([1a6d648](https://github.com/HeyPuter/puter/commit/1a6d648a6ecdda07b23da9e6f4ef49b70b54cce1))
- don't access `metadata.credentialless` if it doesn't exist ([9590bbd](https://github.com/HeyPuter/puter/commit/9590bbdad1099cf75d6073663a9fcec5f3136482))
- reinitialize settings tabs for DOM events ([16b9f09](https://github.com/HeyPuter/puter/commit/16b9f09e66ffe1584f925cb1a9f261bc159c8dda))
- use correct cursor when hovering over sidebar items ([c44b9ab](https://github.com/HeyPuter/puter/commit/c44b9ab8d5f575393bf864fd30235287f845a4e8))
- issue with context menu divider item stealing the event from previous item ([121043d](https://github.com/HeyPuter/puter/commit/121043d312577a6e048497108309cd08b73df4d0))
- issue with non-scrollable window body and document Context Menu ([0315cb3](https://github.com/HeyPuter/puter/commit/0315cb333719b08c6581b556c69a14cbe671b7bd))
- temporary fix because .on can't call ensure_service ([f836ac3](https://github.com/HeyPuter/puter/commit/f836ac30a901a7b3258399a54eab5c7c8cc47463))
- issues in kdmod ([0a47daa](https://github.com/HeyPuter/puter/commit/0a47daa2896d97c318aec2e2288f61ade5f4ea48))
- Collector bug on undefined body ([14f477a](https://github.com/HeyPuter/puter/commit/14f477a6330c9169145a7f8b2721d02e7517513b))
- hyphenize_confirm_code bug ([463c96c](https://github.com/HeyPuter/puter/commit/463c96c69a915ea75db66fd449e83a61ca036f6f))
- app close issue in phoenix ([38adb57](https://github.com/HeyPuter/puter/commit/38adb5741b241081dd3f30de2f9afdd708cc9fa5))
- reading JSON string from service_usage_monthly ([b30de5b](https://github.com/HeyPuter/puter/commit/b30de5bf786ae8f28f3248277c5b2df2f0e5ebf4))
- recently broke counting service sql ([7ba16d1](https://github.com/HeyPuter/puter/commit/7ba16d1c21d07e58cefebf967e5ca2b74502e841))
- ignore invalid entries from service_usage_monthly ([f108795](https://github.com/HeyPuter/puter/commit/f1087953b57297a1e066ea68563e8a273a1af4c0))
- service usage screen ([193da63](https://github.com/HeyPuter/puter/commit/193da633044f463ec1ed60eca4608761fc40b1d7))
- continue work on blocked_email_domains (2) ([4dc1e01](https://github.com/HeyPuter/puter/commit/4dc1e01682571f16a25eebb2e9c7918587ca89ae))
- continue work on blocked_email_domains ([515051d](https://github.com/HeyPuter/puter/commit/515051dabf9f2a145ae2d090f829df7188e9fd28))
- errors thrown by launch_app ([c22a69f](https://github.com/HeyPuter/puter/commit/c22a69ffb1809ad7959f8a8fe934052369b5d44f))
- notepad save issue ([bc51d4b](https://github.com/HeyPuter/puter/commit/bc51d4bd52b5d0a7bb4feddea7bb9d73e449f7d8))
- height 100% on flexer and step view ([c6bc42f](https://github.com/HeyPuter/puter/commit/c6bc42f551a46919b4b70a9ae3dfec85086b0233))
- wait no ([12e0cec](https://github.com/HeyPuter/puter/commit/12e0cecf02f4d906035a6f0059557416475db106))
- phoenix incorrect lookup order ([c8f913d](https://github.com/HeyPuter/puter/commit/c8f913d710454d0ab3da2147309b442a78965720))
- turns out we don't support `utm_source` I learn something new about Puter every day! ([99ce3bd](https://github.com/HeyPuter/puter/commit/99ce3bde199de729c4796a681c188c4a0da9165e))
- issue with service scripts that use TestView ([e0b9072](https://github.com/HeyPuter/puter/commit/e0b90721299fa3013f66c866ba637c52efe9df1d))
- 1954f8-related issue #2 ([143cfb5](https://github.com/HeyPuter/puter/commit/143cfb5654eca8b50fb7ff434f47db24d7bdf3aa))
- 1954f8-related issue ([f5865da](https://github.com/HeyPuter/puter/commit/f5865daede2b32682d0472926bc5db65c9ef37ab))
- small issue in Service.js ([3c5d2af](https://github.com/HeyPuter/puter/commit/3c5d2af8c8341ef78236ef38153ed0b4f20c5cac))
- prevent code from breaking just because it was bundled ([fb1216d](https://github.com/HeyPuter/puter/commit/fb1216d488bed8ee8d88c7c71e4a6f1054e3a01c))
- don't display all apps for extensionless files ([010282e](https://github.com/HeyPuter/puter/commit/010282edf299c2a39e53de7441b8850d0b8011b8))
- creating app shortcut in self-hosted ([38dcb60](https://github.com/HeyPuter/puter/commit/38dcb60d3f407dd185999d01d8e14355b47df0b8))
- disable thumbnails for AppData uploads ([37e7b6a](https://github.com/HeyPuter/puter/commit/37e7b6ad70f197db3be8712315446079caa23892))
- thumbnail service updates ([c2a9506](https://github.com/HeyPuter/puter/commit/c2a9506b4855f67d320eb479a67800098d73e8ec))
- remove redundant openai model fallback ([9db55fc](https://github.com/HeyPuter/puter/commit/9db55fc5f7a975ab301c88bbac493b7a5b1933bb))
- app pseudonym in wrong conditional block ([9985996](https://github.com/HeyPuter/puter/commit/99859966866ebce005f88e3a916c68dc04ba97bf))
- properly add owner object to fsentries ([04c05a5](https://github.com/HeyPuter/puter/commit/04c05a5bb8b73dda21093a2bf563f5cd6faaa356))
- add progress bar fix ([a70d0dd](https://github.com/HeyPuter/puter/commit/a70d0dd0881b0a07cea404fe13515a5e10321e3e))
- allow ETX to propagate to bash ([259877b](https://github.com/HeyPuter/puter/commit/259877b677a7bfc8e5b377c8852d687978c9bc24))
- error deleting entry from My Websites window ([fff8993](https://github.com/HeyPuter/puter/commit/fff89932002d67bf0f121532709c871263e33473))
- second half of connectToInstance ([4311b48](https://github.com/HeyPuter/puter/commit/4311b482fd629c6d1f65956eb711c8e890453179))
- error in process.handle_connection ([cb324cc](https://github.com/HeyPuter/puter/commit/cb324cc125285b5cd6a6b0cebf444a6cd873ded9))
- quick patch to avoid columnify error ([4396534](https://github.com/HeyPuter/puter/commit/439653458eab38e622cf215ae96b6af34d1db7d4))
- upsert subdomain check to insert only ([f2acd83](https://github.com/HeyPuter/puter/commit/f2acd83b72c388939233fd7145f2dcf78d8ad39e))
- simplify callback listener and fix async bug ([db3e0b5](https://github.com/HeyPuter/puter/commit/db3e0b5ce84e4b0b35550f380da97b5d6fcb394b))
- email change on account with unverified email ([33de981](https://github.com/HeyPuter/puter/commit/33de98107f6e3284acb180b1a44bb02ae082642f))
- html-webpack-plugin dev dep ([cc4ab1c](https://github.com/HeyPuter/puter/commit/cc4ab1cb36a002929f26a39f252a262fc1f1aab4))
- double-echo in phoenix ([6bdcae7](https://github.com/HeyPuter/puter/commit/6bdcae769d311b5deb82136d5e35d7ad986bca28))
- webpack error reporting + unintentional whitespace changes ([4910838](https://github.com/HeyPuter/puter/commit/4910838ab1a72738b44f948cbf65feea848e5271))
- dist ([ed7d6dc](https://github.com/HeyPuter/puter/commit/ed7d6dcbfbf432ae90d9e379dbf47de5587a57a2))
- use jq el for focus ([d350264](https://github.com/HeyPuter/puter/commit/d35026467eb9a5f67d6ec0c99f2a24d418b8e3a5))
- fix sourcemap ([cd39bb5](https://github.com/HeyPuter/puter/commit/cd39bb5aa073286baa053f8458f0af54a4b7313a))
- remove now-redundant loadScript call ([c9d09a7](https://github.com/HeyPuter/puter/commit/c9d09a78b6f4bc9682d13d2f982f9a2b7f77dd66))
- env for dev build ([46a0f71](https://github.com/HeyPuter/puter/commit/46a0f714d10c2fa99ee9436f453176d54cc161f8))
- mistakes ([3092300](https://github.com/HeyPuter/puter/commit/3092300a0144791b25816b39845a3d85968e9059))
- add env to EmitPlugin config ([4b89101](https://github.com/HeyPuter/puter/commit/4b8910169a26f85489135cd84b27fe8f91b37bc6))
- remove accidentally left-over code ([72946f9](https://github.com/HeyPuter/puter/commit/72946f920c9f27f4c9de3156aa9144d290699222))
- don't var when no var ([5f7d1f5](https://github.com/HeyPuter/puter/commit/5f7d1f589a56b3d3ea2026dcbd5f9c48b8dc9e6d))
- fallback to read access in /sign ([813ee95](https://github.com/HeyPuter/puter/commit/813ee95cee6f1fca79a886b12d8fe4603ca0d213))
- typo in a default file ([aa61c30](https://github.com/HeyPuter/puter/commit/aa61c3009c624099e7bd518870b18b02c008530c))
- fix 500 when check-app has bad url ([9a62200](https://github.com/HeyPuter/puter/commit/9a622004ea488783127abd83f3f4caf779a5aabb))
- ll_write ([a7cdb70](https://github.com/HeyPuter/puter/commit/a7cdb70251ae86f883257de3596838d20196c62d))
- don't try to sanitize null owners ([cb4cab5](https://github.com/HeyPuter/puter/commit/cb4cab529affa5c28ddb32b90328ad47f21de8d4))
- missing key for feature flag perm check ([1482048](https://github.com/HeyPuter/puter/commit/14820481b9700a5c61c6d9a156944f42f9879008))
- implicit app permissions bug ([6b4a19e](https://github.com/HeyPuter/puter/commit/6b4a19e12a115be2c0e323d17340ab2ce2b6b025))
- share services and features with apps ([48fea77](https://github.com/HeyPuter/puter/commit/48fea77a20a0938fc2272483c798b817ca1c9848))
- admin user public folder ([3819584](https://github.com/HeyPuter/puter/commit/3819584d119076658c9d4be2b2b941c58d122ad4))
- add anti-csrf token for /revoke-session ([b6b64d3](https://github.com/HeyPuter/puter/commit/b6b64d3bccb6e17240a245c956ead2ae5a87c8dd))
- only show 2fa when available ([9fa12d4](https://github.com/HeyPuter/puter/commit/9fa12d43fc782d7e4d2584b1cf74dca13b7ced25))
- requirement for email_confirmed in backend ([6e325fa](https://github.com/HeyPuter/puter/commit/6e325fa000f19b8f20d79829ab2bd78edce80425))
- do primary read of user after setting email_confirmed ([ef245b7](https://github.com/HeyPuter/puter/commit/ef245b70df482ff470877459fcb28e1f490fe42d))
- require confirmed email for public folder ([0519b4a](https://github.com/HeyPuter/puter/commit/0519b4a71b236e464c9d1136065e8f5ba15def8e))
- sqlite condition in MonthlyUsageService ([d4319ea](https://github.com/HeyPuter/puter/commit/d4319ea072e0793a32dbddb1d456227cf481e42c))
- add context to event listener aiife ([3f07ead](https://github.com/HeyPuter/puter/commit/3f07ead1b9940ee133c142f4c34d19884bbb3cd2))
- missing method in SLink ([5b74b4a](https://github.com/HeyPuter/puter/commit/5b74b4affae5473029e887542717c76c7b32f562))
- disable unconfigured ai services ([476acae](https://github.com/HeyPuter/puter/commit/476acae0e0d07c7b025cdbcfd86aacfedd7831a5))
- add missing driver parameter to /call endpoint ([b520783](https://github.com/HeyPuter/puter/commit/b520783bf4a543c71eaef73277f42d5918ac4469))
- sqlite migrations error ([d0e461e](https://github.com/HeyPuter/puter/commit/d0e461e206300e7fe3f9bc7f54eaa3a25bb762d8))
- prevent large logs from service events (2) ([e514dfc](https://github.com/HeyPuter/puter/commit/e514dfcf5049771af3901334e37b1a7c53e05452))
- prevent large logs from service events (1) ([fa9cc8e](https://github.com/HeyPuter/puter/commit/fa9cc8efcfda5e573c73841ae49c423879e5fcd8))
- fix templates ([5d2a6fc](https://github.com/HeyPuter/puter/commit/5d2a6fce305a3dcd4857f52ebb75f529dffe4790))
- popup login in co isolation mode ([8f87770](https://github.com/HeyPuter/puter/commit/8f87770cebab32c00cb10133979d426306685292))
- add necessary iframe attributes for co isolation ([2a5cec7](https://github.com/HeyPuter/puter/commit/2a5cec7ee914c9c97ae90b85464f9fc5332ad2fb))
- chore: fix confirm for type_confirm_to_delete_account ([02e1b1e](https://github.com/HeyPuter/puter/commit/02e1b1e8f5f8e22d7ab39ebff99f7dd8e08a4221))
- syntax error and formatting issue ([3a09e84](https://github.com/HeyPuter/puter/commit/3a09e84838fe8b74bd050641620eec87d9f59dfc))
- #432 ([f897e84](https://github.com/HeyPuter/puter/commit/f897e844989083b0b369ba0ce4d2c5a9f3db5ad8))
- `launch_app` not considering `explorer` as a special case ([98e6964](https://github.com/HeyPuter/puter/commit/98e69642d027a83975a0b2b825317213098bb689))
- well kinda (HOSTNAME in phoenix) ([7043b94](https://github.com/HeyPuter/puter/commit/7043b9400c63842c4c54d82724167666708d3119))
- it was github actions the entire time ([602a198](https://github.com/HeyPuter/puter/commit/602a19895c05b45a7d283470e7af3ae786be1bf2))
- run mocha within packages in monorepo ([58c199c](https://github.com/HeyPuter/puter/commit/58c199c15356ac087a04b16dd18e8fe0f1aea359))
- make webpack output not look like errors ([ad3d318](https://github.com/HeyPuter/puter/commit/ad3d318d07377c78c0429247225655e489b68be4))
- No scrollbar for session list ([45f131f](https://github.com/HeyPuter/puter/commit/45f131f8eaf94cf3951ca7ffeb6f311590233b8a))
- fix path issues under win32 platform ([d80f2fa](https://github.com/HeyPuter/puter/commit/d80f2fa847bfaef98dc8d482898f5c15f268e4bd))
- remove abnoxious debug file ([5c636d4](https://github.com/HeyPuter/puter/commit/5c636d4fd25e14ba3813f7fca3b70ff7bd6860e7))
- read_only fields in ES ([e8f4c32](https://github.com/HeyPuter/puter/commit/e8f4c328bff5c36b95fe460b80803e12e619f8ee))
### Security


#### Bug Fixes

- verify dest_node uid matches signature ([e208b99](https://github.com/HeyPuter/puter/commit/e208b99d211e98cd88e0a8b2917bbe6b2f2423a0))
- always use actor ([1954f86](https://github.com/HeyPuter/puter/commit/1954f86680be642e1af03f648d6b587fe67dfaa8))
- signing in public folders ([937528f](https://github.com/HeyPuter/puter/commit/937528f7676e8ace7287141e1f5057842a2b5eb7))
- remove unconfirmed_email from /whoami for apps ([a002ad0](https://github.com/HeyPuter/puter/commit/a002ad08e5622a349b5d24ed2c7c5f61215146b8))
- hoist acl check in ll_read ([6a2fbc1](https://github.com/HeyPuter/puter/commit/6a2fbc1925952ecceed741afe138270d1eeda7b7))
### Backend


#### Features

- add comments for fsentries ([db79a72](https://github.com/HeyPuter/puter/commit/db79a72daab5460bc8e24f6e16c6280291b2f6fe))
### AI


#### Features

- add xAI grok-beta ([28adcf5](https://github.com/HeyPuter/puter/commit/28adcf533fd867dfdf3bda0007753e65c91ff5e5))
- add groq ([53e7a91](https://github.com/HeyPuter/puter/commit/53e7a91f1800b60b48575a6e41d96d2ccbd6d362))
- add mistral ([055c628](https://github.com/HeyPuter/puter/commit/055c628afd2e33589d3dc66c52934505143eafd4))
- add togetherai ([bdfdf23](https://github.com/HeyPuter/puter/commit/bdfdf2331b37680b95ac56b31026d3bdab4c173b))
- add claude ([d009cd0](https://github.com/HeyPuter/puter/commit/d009cd0aaff645a24d37085ed41c55fe296a5722))
- add streaming ([9d5963c](https://github.com/HeyPuter/puter/commit/9d5963cdf5fe63a4f7970d2d03bc307f4d4fa3ab))

#### Bug Fixes

- close streams ([eb18550](https://github.com/HeyPuter/puter/commit/eb18550f411947a0d8ccaf283701596b1386cfe6))
- adapt message role for claude ([c08b897](https://github.com/HeyPuter/puter/commit/c08b897d4a6a77c54a7e8d2e705e2048ab4797ba))
### GUI

### Putility


#### Features

- trait method override support ([43c5402](https://github.com/HeyPuter/puter/commit/43c5402b7cb92e604cbe59badc8f735131d2c349))
### Docker


#### Bug Fixes

- ensure temp admin pass shows ([d2c7477](https://github.com/HeyPuter/puter/commit/d2c7477b3bf170be492a6d5387330645cdf9c33a))
### Puter JS


#### Features

- add drivers module ([439f52b](https://github.com/HeyPuter/puter/commit/439f52b5a3f1a94e6d15ddacc315ae797f4709c2))

#### Bug Fixes

- fix settings object check ([5a616f6](https://github.com/HeyPuter/puter/commit/5a616f67dd22a0dcbb8a380bbbd2347a0029ce31))
### API


#### Features

- add /lsmod ([32f0edb](https://github.com/HeyPuter/puter/commit/32f0edb93a8fb0c33b0614b99c7fc439c8f6afc9))



## v2.4.2 (2024-07-22)

### Puter

#### Features

- add new file templates ([1f7f094](https://github.com/HeyPuter/puter/commit/1f7f094282fae915a2436701cfb756444cd3f781))
- add cross_origin_isolation option ([e539932](https://github.com/HeyPuter/puter/commit/e53993207077aecd2c01712519251993bb2562bc))
- add option to disable temporary users ([f9333b3](https://github.com/HeyPuter/puter/commit/f9333b3d1e05bd0dffaecd2e29afd08ea61559fc))
- add some default groups ([ba50d0f](https://github.com/HeyPuter/puter/commit/ba50d0f96d58075abec067d24e6532bd874093f0))
- Add support for dropping multiple Puter items onto Dev Center (close #311) ([8e7306c](https://github.com/HeyPuter/puter/commit/8e7306c23be01ee6c31cdb4c99f2fb1f71a2247f))

#### Translations

- Update ig.js ([382fb24](https://github.com/HeyPuter/puter/commit/382fb24dbb1737a8a54ed2491f80b2e2276cde61))
- feat: add vietnamese localization-a ([c2d3d69](https://github.com/HeyPuter/puter/commit/c2d3d69dbe33f36fcae13bcbc8e2a31a86025af9))
- Update zhtw.js, Complete Traditional Chinese translation based on English file #550 ([b9e73b7](https://github.com/HeyPuter/puter/commit/b9e73b7288aebb14e6bbf1915743e9157fc950b1))
- update zhtw.js to match en.js ([37fd666](https://github.com/HeyPuter/puter/commit/37fd666a9a6788d5f0c59311499f29896b48bc82))
- Add Tamil translation to translations.js ([8a3d043](https://github.com/HeyPuter/puter/commit/8a3d0430f39f872b8a460c344cce652c340b700b))
- Move Tamil translation to the rest of translations ([333d6e3](https://github.com/HeyPuter/puter/commit/333d6e3b651e460caca04a896cbc8c175555b79b))
- Translation improvements, mainly style and context-based ([8bece96](https://github.com/HeyPuter/puter/commit/8bece96f6224a060d5b408e08c58865fadb8b79c))
- update translation file es.js to be up to date with the file en.js ([1515278](https://github.com/HeyPuter/puter/commit/151527825f1eb4b060aaf97feb7d18af4fcddbf2))
- Translate en.js as of 2024-07-10 ([8e297cd](https://github.com/HeyPuter/puter/commit/8e297cd7e30757073e2f96593c363a273b639466))
- Create hu.js hungarian language ([69a80ab](https://github.com/HeyPuter/puter/commit/69a80ab3d2c94ee43d96021c3bcbdab04a4b5dc6))
- Update translations.js to Hungarian lang ([56820cf](https://github.com/HeyPuter/puter/commit/56820cf6ee56ff810a6b495a281ccbb2e7f9d8fb))
- Tamil translation ([81781f8](https://github.com/HeyPuter/puter/commit/81781f80afc07cd1e6278906cdc68c8092fbfedf))
- Update it.js ([84e31ef](https://github.com/HeyPuter/puter/commit/84e31eff2f58584d8fab7dd10606f2f6ced933a2))
- Update Armenian translation file ([3b8af7c](https://github.com/HeyPuter/puter/commit/3b8af7cc5c1be8ed67be827360bbfe0f0b5027e9))

#### Bug Fixes

- fix templates ([5d2a6fc](https://github.com/HeyPuter/puter/commit/5d2a6fce305a3dcd4857f52ebb75f529dffe4790))
- popup login in co isolation mode ([8f87770](https://github.com/HeyPuter/puter/commit/8f87770cebab32c00cb10133979d426306685292))
- add necessary iframe attributes for co isolation ([2a5cec7](https://github.com/HeyPuter/puter/commit/2a5cec7ee914c9c97ae90b85464f9fc5332ad2fb))
- chore: fix confirm for type_confirm_to_delete_account ([02e1b1e](https://github.com/HeyPuter/puter/commit/02e1b1e8f5f8e22d7ab39ebff99f7dd8e08a4221))
- syntax error and formatting issue ([3a09e84](https://github.com/HeyPuter/puter/commit/3a09e84838fe8b74bd050641620eec87d9f59dfc))
- #432 ([f897e84](https://github.com/HeyPuter/puter/commit/f897e844989083b0b369ba0ce4d2c5a9f3db5ad8))
- `launch_app` not considering `explorer` as a special case ([98e6964](https://github.com/HeyPuter/puter/commit/98e69642d027a83975a0b2b825317213098bb689))
- well kinda (HOSTNAME in phoenix) ([7043b94](https://github.com/HeyPuter/puter/commit/7043b9400c63842c4c54d82724167666708d3119))
- it was github actions the entire time ([602a198](https://github.com/HeyPuter/puter/commit/602a19895c05b45a7d283470e7af3ae786be1bf2))
- fix CI attempt #7 ([614f2c5](https://github.com/HeyPuter/puter/commit/614f2c5061525f230ccd879bfb047434ac46a9ba))
- fix CI attempt #6 ([9d549b1](https://github.com/HeyPuter/puter/commit/9d549b192d149eac96c316ded645bf7c2e96153d))
- fix CI attempt #5 ([74adcdd](https://github.com/HeyPuter/puter/commit/74adcddc1d60e0a513408a0716ed2b301126225d))
- fix CI attempt #4 ([84b993b](https://github.com/HeyPuter/puter/commit/84b993bce913c3ad99127063bcfaae19331b199c))
- fix CI attempt #3 ([3bca973](https://github.com/HeyPuter/puter/commit/3bca973f5f4e65a2bd24c634c347fbd681a7458b))
- fix CI attempt #2 ([aebe89a](https://github.com/HeyPuter/puter/commit/aebe89a1acb070764551e8e89e325325ffbed8f9))
- run mocha within packages in monorepo ([58c199c](https://github.com/HeyPuter/puter/commit/58c199c15356ac087a04b16dd18e8fe0f1aea359))
- make webpack output not look like errors ([ad3d318](https://github.com/HeyPuter/puter/commit/ad3d318d07377c78c0429247225655e489b68be4))
- No scrollbar for session list ([45f131f](https://github.com/HeyPuter/puter/commit/45f131f8eaf94cf3951ca7ffeb6f311590233b8a))
- fix path issues under win32 platform ([d80f2fa](https://github.com/HeyPuter/puter/commit/d80f2fa847bfaef98dc8d482898f5c15f268e4bd))
- remove abnoxious debug file ([5c636d4](https://github.com/HeyPuter/puter/commit/5c636d4fd25e14ba3813f7fca3b70ff7bd6860e7))
- read_only fields in ES ([e8f4c32](https://github.com/HeyPuter/puter/commit/e8f4c328bff5c36b95fe460b80803e12e619f8ee))

### Security

#### Bug Fixes

- hoist acl check in ll_read ([6a2fbc1](https://github.com/HeyPuter/puter/commit/6a2fbc1925952ecceed741afe138270d1eeda7b7))

## v2.4.1 (2024-07-11)

### Puter


#### Features

- update BR translation ([42a6b39](https://github.com/HeyPuter/puter/commit/42a6b3938a588b8b4d1bd976c37e9c6e58408c75))
- JSON support for kv driver ([3ed7916](https://github.com/HeyPuter/puter/commit/3ed7916856f03eafbe0891f2ab39c34d20d2bd24))

#### Translations

- Update bn.js file formatting ([cff488f](https://github.com/HeyPuter/puter/commit/cff488f4f4378ca6c7568a585a665f2a3b87b89c))
- Issue#530 - Update bengali translations ([92abc99](https://github.com/HeyPuter/puter/commit/92abc9947f811f94f17a5ee5a4b73ee2b210900a))
- Added missing Romanian translations. ([8440f56](https://github.com/HeyPuter/puter/commit/8440f566b91c9eb4f01addcb850061e3fbe3afc7))
- Add 2FA Romanian translations ([473b651](https://github.com/HeyPuter/puter/commit/473b6512c697854e3f3badae1eb7b87742954da5))
- Add Japanese Translation ([47ec74f](https://github.com/HeyPuter/puter/commit/47ec74f0aa6adb3952e6460909029a4acb0c3039))
- Completing Italian translation based on English file ([f5a8ee1](https://github.com/HeyPuter/puter/commit/f5a8ee1c6ab950d62c90b6257791f026a508b4e4))
- Completing Italian translation based on English file. ([a96abb5](https://github.com/HeyPuter/puter/commit/a96abb5793528d0dc56d75f95d771e1dcf5960d1))
- Completing Arabic translation based on English file ([78a0ace](https://github.com/HeyPuter/puter/commit/78a0acea6980b6d491da4874edbd98e17c0d9577))
- Update Arabic translations in src/gui/src/i18n/translations/ar.js to match English version in src/gui/src/i18n/translations/en.js ([fe5be7f](https://github.com/HeyPuter/puter/commit/fe5be7f3cf7f336730137293ba86a637e8d8591d))
- Update Arabic translations in src/gui/src/i18n/translations/ar.js to match English version in src/gui/src/i18n/translations/en.js ([bffa192](https://github.com/HeyPuter/puter/commit/bffa192805216fc17045cd8d629f34784dca7f3f))
- Ukrainian updated ([e61039f](https://github.com/HeyPuter/puter/commit/e61039faf409b0ad85c7513b0123f3f2e92ebe32))
- Update ru.js issue #547 ([17145d0](https://github.com/HeyPuter/puter/commit/17145d0be6a9a1445947cc0c4bec8f16a475144c))
- Russian translation fixed ([8836011](https://github.com/HeyPuter/puter/commit/883601142873f10d69c84874499065a7d29af054))

#### Bug Fixes

- remove flag that breaks puter-js webpack ([7aadae5](https://github.com/HeyPuter/puter/commit/7aadae58ce1a51f925bf64c3d65ac1fa6971b164))
- Improve `getMimeType` to remove trailing dot in the extension if preset ([535475b](https://github.com/HeyPuter/puter/commit/535475b3c36a37e3319ed067a24fb671790dcda3))


## 2.4.0 (2024-07-08)


### Features

* add (pt-br) translation for system settings. ([77211c4](https://github.com/HeyPuter/puter/commit/77211c4f71b0285fb3060f7e5c8d493b4d7c4f0c))
* add /group/list endpoint ([d55f38c](https://github.com/HeyPuter/puter/commit/d55f38ca68899c3574cfe328d2b206b1143ff0d4))
* add /share/file-by-username endpoint ([5d214c7](https://github.com/HeyPuter/puter/commit/5d214c7b52887b594af6be497f1892baf7d77679))
* add /sharelink/request endpoint ([742f625](https://github.com/HeyPuter/puter/commit/742f625309f9f4cfa70cf7d2fe5b03fd164913ea))
* add /show urls ([079e25a](https://github.com/HeyPuter/puter/commit/079e25a9fe8e179f26d72378856058eb656e2314))
* add app metadata ([f7216b9](https://github.com/HeyPuter/puter/commit/f7216b95672b38802b288ef5b022e947017ff311))
* add appdata permission (if applicable) on app share ([9751fd9](https://github.com/HeyPuter/puter/commit/9751fd92a50e75385cffed0ca847d5076ba98c92))
* add cookie for site token ([a813fbb](https://github.com/HeyPuter/puter/commit/a813fbbb88bcfb8b9a61976e2a4fc4aab943fc88))
* add cross-server event broadcasting ([1207a15](https://github.com/HeyPuter/puter/commit/1207a158bdc88a90b14d31d03387ce353c176a9c))
* add debug mod ([16b1649](https://github.com/HeyPuter/puter/commit/16b1649ff62fd87a4dda5d2e1c68941c864c5da4))
* add endpoints for share tokens ([301ffaf](https://github.com/HeyPuter/puter/commit/301ffaf61dbb4fca1a855650ab80707ae6d9f602))
* Add exit status code to apps ([7674da4](https://github.com/HeyPuter/puter/commit/7674da4cd225bcad34079251c5600fc32e32248b))
* add external mod loading ([eb05fbd](https://github.com/HeyPuter/puter/commit/eb05fbd2dc4877553b5118a069a9afdc32bea137))
* add group management endpoints ([4216346](https://github.com/HeyPuter/puter/commit/4216346384d90dcba429dbcb175e6f86482d19f4))
* add group permission endpoints ([c374b0c](https://github.com/HeyPuter/puter/commit/c374b0cbca761e7c8a47d56a09551f2e9378066a))
* add mark-read endpoint ([0101f42](https://github.com/HeyPuter/puter/commit/0101f425d480705c20df4919a76f66e987f5790f))
* add permission rewriter for app by name ([16c4907](https://github.com/HeyPuter/puter/commit/16c4907be592dae31ed3c1aa3fac3b9655255d6f))
* add protected apps ([f2f3d6f](https://github.com/HeyPuter/puter/commit/f2f3d6ff460932698fb8da7309fbce3e96132950))
* add protected subdomains ([86fca17](https://github.com/HeyPuter/puter/commit/86fca17fb17c0c24397c29b49b133deadea1de8b))
* add querystring-informed errors ([e7c0b83](https://github.com/HeyPuter/puter/commit/e7c0b8320a6829315d9154d6d513bab4491c47ea))
* add readdir delegate for shares in a user directory ([8424d44](https://github.com/HeyPuter/puter/commit/8424d446099ac30ccf829c57d43eef1f235618e4))
* add readdir delegate for sharing user homedirs ([19a5eb0](https://github.com/HeyPuter/puter/commit/19a5eb00763f3ac31df8483fb59cb7a96c448745))
* add service for notifications ([a1e6887](https://github.com/HeyPuter/puter/commit/a1e6887bf93da21b9482040b3e30ee083fb23477))
* add service to test file share logic ([332371f](https://github.com/HeyPuter/puter/commit/332371fccb198462948a440419adc7a26d671a23))
* add share list to stat ([8c49ba2](https://github.com/HeyPuter/puter/commit/8c49ba2553ce6bee20eb5b6f2721bc80f639e98a))
* add share service and share-by-email to /share ([db5990a](https://github.com/HeyPuter/puter/commit/db5990a98935817c0e16d30e921bb99c57a98fc8))
* add subdomain permission (if applicable) on app share ([13e2f72](https://github.com/HeyPuter/puter/commit/13e2f72c9f33f485570f13f45341246b1a05879f))
* add user-group permission check ([0014940](https://github.com/HeyPuter/puter/commit/00149402e041443aa3ac571fbe97a9a85f95564b))
* **backend:** add script service ([30550fc](https://github.com/HeyPuter/puter/commit/30550fcddda18469735499546de502d29b85e2ad))
* **backend:** Add tab completion to server console command arguments ([fa81dca](https://github.com/HeyPuter/puter/commit/fa81dca9507b7fa0f82099b75f2ab89c865626ac))
* **backend:** Add tab-completion to server console command names ([e1e76c6](https://github.com/HeyPuter/puter/commit/e1e76c6be71fdeb3b6246307b626734d8dc26f86))
* **backend:** add tip of day ([2d8e624](https://github.com/HeyPuter/puter/commit/2d8e6240c61dc6301f49cbdcd1c3b04736f9ca93))
* **backend:** allow services to provide user properties ([522664d](https://github.com/HeyPuter/puter/commit/522664d415c33342500defec309c2ff15bc94804))
* **backend:** allow services to provide whoami values ([fccabf1](https://github.com/HeyPuter/puter/commit/fccabf1bc0c4418f3599222616dd63bf98c14fe1))
* **backend:** improve logger and reduce logs ([4bdad75](https://github.com/HeyPuter/puter/commit/4bdad75766d0617a164024b39b79bf5373c495a6))
* Display app icon and description in embeds ([ef298ce](https://github.com/HeyPuter/puter/commit/ef298ce3aa3ce90224e883fb0ba33f9cd3a3da44))
* get first test working on share-test service ([88d6bee](https://github.com/HeyPuter/puter/commit/88d6bee9546f36d689c53ec7fe95f01f772f5211))
* **git:** Add --color and --no-color options ([d6dd1a5](https://github.com/HeyPuter/puter/commit/d6dd1a5bb0a2b2bba2cfe86d2e51ff2a6e42841c))
* **git:** Add a --debug option, which sets the DEBUG global ([fa3df72](https://github.com/HeyPuter/puter/commit/fa3df72f6ed2d45a440ebc2aacbbae67bf042478))
* **git:** Add authentication to clone, fetch, and pull. ([364d580](https://github.com/HeyPuter/puter/commit/364d580ff896691ee70d3735f495c720651a9f41))
* **git:** Add diff display to `show` and `log` subcommands ([3cad1ec](https://github.com/HeyPuter/puter/commit/3cad1ec436f99a78f782ab9576325d4341284964))
* **git:** Add start-revision and file arguments to `git log` ([49c2f16](https://github.com/HeyPuter/puter/commit/49c2f163515d2130c17a6f6a6a16bc27ea69336a))
* **git:** Allow checking out a commit instead of a branch ([057b3ac](https://github.com/HeyPuter/puter/commit/057b3acf00af49c005b9bf7069c5d22983a32e1e))
* **git:** Color output for `git status` files ([bab5204](https://github.com/HeyPuter/puter/commit/bab5204209aa2efc0c053643677a78db6ede0929))
* **git:** Display file contents as a string for `git show FILE_OID` ([a680371](https://github.com/HeyPuter/puter/commit/a68037111a04580cfa2688694a68ef6ac7a495fa))
* **git:** Display ref names in `git log` and `git show` ([45cdfcb](https://github.com/HeyPuter/puter/commit/45cdfcb5bfa66937b33054a127e0b17001f3faa4))
* **git:** Format output closer to canonical git ([60976b1](https://github.com/HeyPuter/puter/commit/60976b1ed61984d9d290f3a0ae99dd97632e9909))
* **git:** Handle detached HEAD in `git status` and `git branch --list` ([2c9b1a3](https://github.com/HeyPuter/puter/commit/2c9b1a3ffc3d5e282ffe5b83a86314e99445bbc6))
* **git:** Implement `git branch` ([ad4f132](https://github.com/HeyPuter/puter/commit/ad4f13255d52f8226f22800c16b388cf0e6384d7))
* **git:** Implement `git checkout` ([35e4453](https://github.com/HeyPuter/puter/commit/35e4453930bc4e151887f83c97efec19cc15da70))
* **git:** Implement `git cherry-pick` ([2e4259d](https://github.com/HeyPuter/puter/commit/2e4259d267b3cfafd5cefc57a02643c6432fec4d))
* **git:** Implement `git clone` ([95c8235](https://github.com/HeyPuter/puter/commit/95c8235a4a1fea39a46c40df04cb1004a2fe7b23))
* **git:** Implement `git diff` ([622b6a9](https://github.com/HeyPuter/puter/commit/622b6a9b921c3c03efc0b519c9a26c6701d80e50))
* **git:** Implement `git fetch` ([98a4b9e](https://github.com/HeyPuter/puter/commit/98a4b9ede39b94c0c6b6b8345d7551359961186a))
* **git:** Implement `git pull` ([eb2b6a0](https://github.com/HeyPuter/puter/commit/eb2b6a08b03cee0612885412cd4b03c9564044e3))
* **git:** Implement `git push` ([8c70229](https://github.com/HeyPuter/puter/commit/8c70229a188b743220db076a740a992fd7971301))
* **git:** Implement `git remote` ([43ce0d5](https://github.com/HeyPuter/puter/commit/43ce0d5b45d4eb4f296afcaaa1ecadc125c53e89))
* **git:** Implement `git restore` ([4ba8a32](https://github.com/HeyPuter/puter/commit/4ba8a32b45d395f28433572db5644d630776789e))
* **git:** Make `git add` work for deleted files ([9551544](https://github.com/HeyPuter/puter/commit/955154468f48e45028dad2e916708d6a763affad))
* **git:** Make shorten_hash() guaranteed to produce a unique hash ([dd10a37](https://github.com/HeyPuter/puter/commit/dd10a377493c0d8f10a1ac8779dc27f3f3bf6c37))
* **git:** Resolve more forms of commit reference ([b6906bb](https://github.com/HeyPuter/puter/commit/b6906bbcaaa50fc8a8c60beb6d2d38bcb7dda758))
* **git:** Understand references like `HEAD^` and `main~3` ([711dbc0](https://github.com/HeyPuter/puter/commit/711dbc0d2fde9c2ddc6c86f64fb4caa7837c9dcb))
* implicit access from apps to shared appdata dirs ([31d4eb0](https://github.com/HeyPuter/puter/commit/31d4eb090efb340fdfb7cb6b751145e859624eeb))
* introduce notification selection via driver ([c5334b0](https://github.com/HeyPuter/puter/commit/c5334b0e19cf9762f536ec482c3ff872e9c12399))
* multi-recipient multi-file share endpoint ([846fdc2](https://github.com/HeyPuter/puter/commit/846fdc20d4a887a1f8a4f3bda4fafe41efab2733))
* **parsely:** Add a fail() parser ([5656d9d](https://github.com/HeyPuter/puter/commit/5656d9d42f76202a534ad640d3a4e287e0e40418))
* **parsely:** Add stringUntil() parser ([d46b043](https://github.com/HeyPuter/puter/commit/d46b043c5d16f1205d61de3f3ba43ed8ad7bff93))
* **phoenix:** Add --dump and --file options to sed ([f250f86](https://github.com/HeyPuter/puter/commit/f250f86446a506f24fa2ad396328e3a2212a68d0))
* **phoenix:** Add more commands to sed, including labels and branching ([306014a](https://github.com/HeyPuter/puter/commit/306014adc77a7ca155feb95d1146cb46ee075b52))
* **phoenix:** Expose parsed arg tokens to apps that request them ([4067c82](https://github.com/HeyPuter/puter/commit/4067c82486c99cad20f41927ad39ebea438b717f))
* **phoenix:** Implement an `exit` builtin ([3184d34](https://github.com/HeyPuter/puter/commit/3184d3482c7b95c0fd1fc0745555ff82fc9a8c99))
* **phoenix:** Implement parsing of sed scripts ([0d4f907](https://github.com/HeyPuter/puter/commit/0d4f907b6675b15bd50a55f50aa28f0803b18b7b))
* **phoenix:** Make `clear` clear scrollback unless `-x` is given ([75a989a](https://github.com/HeyPuter/puter/commit/75a989a7b69bfdfdf69e5f0365027c5b27d8bfc6))
* **Phoenix:** Pass command line arguments and ENV when launching apps ([8f1c4fc](https://github.com/HeyPuter/puter/commit/8f1c4fcda98e72a7b970e8c6fc2fe39a5e012264))
* **phoenix:** Respond to exit status codes ([5de3052](https://github.com/HeyPuter/puter/commit/5de305202656a172b187dac87543d6c1c69a2958))
* **phoenix:** Show actual host name in prompt and neofetch ([4539408](https://github.com/HeyPuter/puter/commit/4539408a218a50244dc615cf7de56c29dcac53e6))
* rate-limit for excessive groups ([4af279a](https://github.com/HeyPuter/puter/commit/4af279a72fc9de89ddc3ba51806ca3760a36265d))
* re-send unreads on login ([02fc4d8](https://github.com/HeyPuter/puter/commit/02fc4d86b7166fb4803be5d28e2a593d6b7d9785))
* register dev center to apps ([10f4d7d](https://github.com/HeyPuter/puter/commit/10f4d7d50ce9314f9c3888c74cb17c8ebbecee98))
* send notification when file gets shared ([2f6c428](https://github.com/HeyPuter/puter/commit/2f6c428a403a006f7878861d2f0356c3294519be))
* start directory index frame ([fb1e2f2](https://github.com/HeyPuter/puter/commit/fb1e2f21fb67aefe0602f6c978199c7cd019bbf7))
* support canonical puter.js url in dev ([fd41ae2](https://github.com/HeyPuter/puter/commit/fd41ae217c7a9f7229326f62a829471580a744bd))
* **ui:** add new components ([577bd59](https://github.com/HeyPuter/puter/commit/577bd59b6cc94810e851ad544f8234e25a4e6e27))
* **ui:** add new components ([38ba425](https://github.com/HeyPuter/puter/commit/38ba42575ce9f3506f8ce219b9580202b3ed9993))
* **ui:** allow component-based settings tabs ([1245960](https://github.com/HeyPuter/puter/commit/124596058a286241b51dd87ce2fc1a68478cb5b8))
* update share endpoint to support more things ([dd5fde5](https://github.com/HeyPuter/puter/commit/dd5fde5130c1840ab598e6622766ae835142e58a))


### Bug Fixes

* add app_uid param to kv interface ([f7a0549](https://github.com/HeyPuter/puter/commit/f7a054956b8739a3bc305a49faee929ea0da1e15))
* add missing columns for public directory update ([b10302a](https://github.com/HeyPuter/puter/commit/b10302ad744fd9c58f9735743e075815183c772c))
* Add missing file extension to 0009_app-prefix-fix.sql in DB init ([a8160a8](https://github.com/HeyPuter/puter/commit/a8160a8cdcdd6aff98728a6f1643d93386e6bb5a))
* add permission implicator for file modes ([e63ab3a](https://github.com/HeyPuter/puter/commit/e63ab3a67f6555eb13d6af477a8da9f1b54d6608))
* add stream limit ([ceba309](https://github.com/HeyPuter/puter/commit/ceba309dbd4df89f310d1a530f939a5b7991f4c7))
* **backend:** remove a bad thing that really doesn't work ([8d22276](https://github.com/HeyPuter/puter/commit/8d22276f13106f7642d11da30b1500817a20ad43))
* bug introduced when refactoring /share to Sequence ([ecb9978](https://github.com/HeyPuter/puter/commit/ecb997885c1efb766827c84d2ffb8dc6ddabe992))
* check subdomain earlier for /apps ([4e3a24e](https://github.com/HeyPuter/puter/commit/4e3a24e6093e279e210765e07e436f4e63b74072))
* column nullability blunder ([1429d6f](https://github.com/HeyPuter/puter/commit/1429d6f57c67dff51fc41ca0c2868f8d000845f1))
* Correct APIError imports ([062e23b](https://github.com/HeyPuter/puter/commit/062e23b5c9673db1f8b0ff0469289d52dd1e3f99))
* correct shown flag behavior ([632c536](https://github.com/HeyPuter/puter/commit/632c5366161ff8fbbd4d60c61dfbe52dad488a2c))
* database migration ([9b39309](https://github.com/HeyPuter/puter/commit/9b39309e18a2927d25fe794d91da4e4d068c4bca))
* do not delegate to select on read like ever that is really dumb ([a2a10b9](https://github.com/HeyPuter/puter/commit/a2a10b94be59403e03fb08bec5d7c056ce5b554f))
* docker runtime fail because stdout columns ([94c0449](https://github.com/HeyPuter/puter/commit/94c0449437ce4cb26d00a15a3f277bc7b09367b4))
* fix issues with apps in /share endpoint ([0cf90ee](https://github.com/HeyPuter/puter/commit/0cf90ee39af6548d271dec45ed8ee9e6df1cd14d))
* fix owner ids for default apps ([283f409](https://github.com/HeyPuter/puter/commit/283f409a662d126e7f3ce811f1467ac6fab9a522))
* fix permission cascade properly this time ([de58866](https://github.com/HeyPuter/puter/commit/de5886698e1eae2b250baac174b57029f3244e96))
* Fix phoenix app prefix and TokenService test ([afb9d86](https://github.com/HeyPuter/puter/commit/afb9d866b5091058711db931cde904947e661c15))
* fix that fix ([b126b67](https://github.com/HeyPuter/puter/commit/b126b670940a0e20cfe7bd0eba3db891bab5c142))
* fix typo ([ce328b7](https://github.com/HeyPuter/puter/commit/ce328b7245ad741b64c5885f64f806fc98a55d84))
* **git:** Make git commit display detached HEAD correctly ([73d0f5a](https://github.com/HeyPuter/puter/commit/73d0f5a90cb5dcbadfc6d0fd22f14e8bc0e61f86))
* group permission audit table ([7d2f6d2](https://github.com/HeyPuter/puter/commit/7d2f6d256f56e30d752e9999c6e8bde68f9d9637))
* handle subpaths under another user ([d128cee](https://github.com/HeyPuter/puter/commit/d128ceed6f4928fa0793815feb2e2715cd273ff8))
* handling of batch requests with zero files ([c0063a8](https://github.com/HeyPuter/puter/commit/c0063a871fd891a1774f1bee00e86170fed249fa))
* i forgot to test reloading ([7eabb43](https://github.com/HeyPuter/puter/commit/7eabb43bd4257b4129d67eaeda2aa27e8268dc78))
* improve console experience on mac ([15465bf](https://github.com/HeyPuter/puter/commit/15465bfc5035a64762f7c86a3d38af8be6be5b59))
* incorrect error from suggested_apps ([b648817](https://github.com/HeyPuter/puter/commit/b648817f2743c2b6214ebe4177d921c9b9027594))
* Make polyfilled import.meta.filename getter a valid function ([85c6798](https://github.com/HeyPuter/puter/commit/85c679844869b6b05fcbda231d8dc7026a66da97))
* null email in request to /share ([bf63144](https://github.com/HeyPuter/puter/commit/bf63144f7a79c48bd650ae851ddd0c8a10d748c3))
* Only run Component initialization functions once ([5b43358](https://github.com/HeyPuter/puter/commit/5b43358219402bee3eadf4a0f184a4b924d3293b))
* oops ([a136ee5](https://github.com/HeyPuter/puter/commit/a136ee5edd3149798a0d82f494f423f503b65f00))
* **parsely:** Make Repeat parser work when no separator is given ([9b4d16f](https://github.com/HeyPuter/puter/commit/9b4d16fbe9d5698c57f9da725a22b528a7d7cac2))
* peers array assumption ([10cbf08](https://github.com/HeyPuter/puter/commit/10cbf08233620440aa39f5302deaac4f59f02247))
* **phoenix:** Add missing newlines to sed command output ([e047b0b](https://github.com/HeyPuter/puter/commit/e047b0bf302284da61e677432e4cc25b531b24f2))
* **phoenix:** Gracefully handle completing a non-existent path ([d76e713](https://github.com/HeyPuter/puter/commit/d76e7130cba9f0ca05940abafe4fd1a41464aa83))
* property validation on some permission endpoints ([0855f2b](https://github.com/HeyPuter/puter/commit/0855f2b36eca3bbdaa8429cbde3aa1242e8e96ee))
* readdir on file ([a72ec97](https://github.com/HeyPuter/puter/commit/a72ec9799ac3bd76ceafa22cce149e373a13f3b9))
* remove last component when share URL is file ([1166e69](https://github.com/HeyPuter/puter/commit/1166e69c76688d1811701c56cd4df9d38e286793))
* remove legacy permission check in stat ([f2c6e01](https://github.com/HeyPuter/puter/commit/f2c6e01296e4214336e63bc2d69bcbf17f59890f))
* Remove null or duplicate app entries from suggest_app_for_fsentry() ([6900233](https://github.com/HeyPuter/puter/commit/6900233c5aaa2d1a49f495e9f9a060796757a91e))
* **security:** Move token for socket.io to request body ([49b257e](https://github.com/HeyPuter/puter/commit/49b257ecffbb1e12090b86a67528a5ad09da69db))
* switch share notif username to sender ([cd65217](https://github.com/HeyPuter/puter/commit/cd65217f5cda1c986ee231e2eeeef5abefa36ecb))
* **Terminal:** Accept input from Chrome on Android ([4ef3e53](https://github.com/HeyPuter/puter/commit/4ef3e53de34f0097950a7e707ca2483863beafb5))
* Throw an error when readdir is called on a non-directory ([46eb4ed](https://github.com/HeyPuter/puter/commit/46eb4ed2b96c235e10e15645a30d2f192a1af0de))
* type error in puter-site ([d96f924](https://github.com/HeyPuter/puter/commit/d96f924cad7a13ea6e9084bb0ebb79ecc5fcb8a3))
* ui color input attributes ([d9c4fbb](https://github.com/HeyPuter/puter/commit/d9c4fbbd1dcce12ee05ee33652a5fa518196463d))
* **ui:** improve Component base class ([f8780d0](https://github.com/HeyPuter/puter/commit/f8780d032b10138851c22af53b8610c578139acc))
* update email share object ([9033f6f](https://github.com/HeyPuter/puter/commit/9033f6f8c74ef8739294d640ac1c7eba95519bbd))
* update PD alert custom details ([2f16322](https://github.com/HeyPuter/puter/commit/2f163221bdde09425cae11ef7f8e4eb0b10c7103))
* update test kernel ([55c609b](https://github.com/HeyPuter/puter/commit/55c609b3fec4ef018febc6e88c44a6277960d728))
* validate size metadata ([2008db0](https://github.com/HeyPuter/puter/commit/2008db08524259264a0c8186a34fc75d7a133f5f))

## 2.3.0 (2024-05-22)


### Features

* add /healthcheck endpoint ([c166560](https://github.com/HeyPuter/puter/commit/c166560ff4ab5a453d3ec4f97326c995deb7f522))
* Add command names to phoenix tab-completion ([cf0eee1](https://github.com/HeyPuter/puter/commit/cf0eee1fa35328e05aefc8a425b5977efe5f4ec9))
* add option to change desktop background to default ([03f05f3](https://github.com/HeyPuter/puter/commit/03f05f316f11e8afe5fcee40b2b80a0de5e6826f))
* allow apps to add a menubar via puter.js ([331d9e7](https://github.com/HeyPuter/puter/commit/331d9e75428ec7609394f59b1755374c7340f83e))
* Allow querying puter-apps driver by partial app names ([dc5b010](https://github.com/HeyPuter/puter/commit/dc5b010d0913d2151b4851f8da5df72d2c8f42e7))
* Display upload errors in UIWindowProgress dialog ([edebbee](https://github.com/HeyPuter/puter/commit/edebbee9e7e9efbb33bf709b637c103be40d15a8))
* Implement 'Like' predicate in entity storage ([a854a0d](https://github.com/HeyPuter/puter/commit/a854a0dc0aa79a31695db833184c5ca3698632a9))
* improve password recovery experience ([04432df](https://github.com/HeyPuter/puter/commit/04432df5540811710ce1cc47ce6c136e5453bccb))
* **security:** add ip rate limiting ([ccf1afc](https://github.com/HeyPuter/puter/commit/ccf1afc93c24ee7f9a126216209a185d6b4d9fe4))
* Show "Deleting /foo" in progress window when deleting files ([f07c13a](https://github.com/HeyPuter/puter/commit/f07c13a50cee790eec44bce2f6e56fbcbf73f9b0))


### Bug Fixes

* Add missing file extension to 0009_app-prefix-fix.sql in DB init ([a8160a8](https://github.com/HeyPuter/puter/commit/a8160a8cdcdd6aff98728a6f1643d93386e6bb5a))
* Add missing TextEncoder to PTT ([8d4a1e0](https://github.com/HeyPuter/puter/commit/8d4a1e0ed3872e2c82b9e4be9b6d8b359e9cea09))
* Correct APIError imports ([062e23b](https://github.com/HeyPuter/puter/commit/062e23b5c9673db1f8b0ff0469289d52dd1e3f99))
* Correct grep output when asking for line numbers ([c8a20ca](https://github.com/HeyPuter/puter/commit/c8a20cadbfd539d185d32f4558916825fcf265ba))
* Correct inverted instanceof check in SignalReader.read() ([d4c2b49](https://github.com/HeyPuter/puter/commit/d4c2b492ef4864804776d3cb7d24797fdc536886))
* Correct variables used in errors in sign.js ([fa7c6be](https://github.com/HeyPuter/puter/commit/fa7c6bee9699527028be0ae9759155bc67c52324))
* Eliminates duplicate translation keys ([5800350](https://github.com/HeyPuter/puter/commit/5800350b253994dea410afff64e3df2a171e7775))
* fix error handling for outdated node versions ([4c1d5a4](https://github.com/HeyPuter/puter/commit/4c1d5a4b6d009ce075897d499d3517219bd745a4))
* Fix phoenix app prefix and TokenService test ([afb9d86](https://github.com/HeyPuter/puter/commit/afb9d866b5091058711db931cde904947e661c15))
* increase QR code size ([d2de46e](https://github.com/HeyPuter/puter/commit/d2de46edfbc05d132d5c929f6935b82515fbbda0))
* Make PathCommandProvider reject queries with path separators ([d733119](https://github.com/HeyPuter/puter/commit/d73311945610417a1ebc7bb0723ced0a599594b4))
* Make url variable accessible to all users of it ([2f30ae7](https://github.com/HeyPuter/puter/commit/2f30ae7a825adcd8da95888c38fe39c34acee0ff))
* Only run Component initialization functions once ([5b43358](https://github.com/HeyPuter/puter/commit/5b43358219402bee3eadf4a0f184a4b924d3293b))
* Parse octal echo escapes ([6ad8f5e](https://github.com/HeyPuter/puter/commit/6ad8f5e06abd050d319271f818d72debf5bc8e44))
* reduce token lengths ([5a76bad](https://github.com/HeyPuter/puter/commit/5a76bad28dfd8ec89a309941e410a54927fae22d))
* reliability issue :bug: ([1d546d9](https://github.com/HeyPuter/puter/commit/1d546d9ef70ef9066ad5838e9782ae330d289f29))
* Remove null or duplicate app entries from suggest_app_for_fsentry() ([6900233](https://github.com/HeyPuter/puter/commit/6900233c5aaa2d1a49f495e9f9a060796757a91e))
* **security:** always use application/octet-stream ([74e213a](https://github.com/HeyPuter/puter/commit/74e213a534dbf2844c8cebeee7eb59ec70de306e))
* **security:** Fix session revocation ([eb166a6](https://github.com/HeyPuter/puter/commit/eb166a67a9f0caf4fd77f9e27dc8209c2fc51f4c))
* **security:** Move token for socket.io to request body ([49b257e](https://github.com/HeyPuter/puter/commit/49b257ecffbb1e12090b86a67528a5ad09da69db))
* **security:** Prevent email enumeration ([ed70314](https://github.com/HeyPuter/puter/commit/ed703146863f896df76c98fad7127c6748c0ef9b))
* **security:** skip cache when checking old passwd ([7800ef6](https://github.com/HeyPuter/puter/commit/7800ef61029c8d1ba47491b4028a0cb972298725))
* **Terminal:** Accept input from Chrome on Android ([4ef3e53](https://github.com/HeyPuter/puter/commit/4ef3e53de34f0097950a7e707ca2483863beafb5))
* test release-please action [#3](https://github.com/HeyPuter/puter/issues/3) ([8fb0a66](https://github.com/HeyPuter/puter/commit/8fb0a66ef21921990e564e5f61c0e80e7f929dc7))
* test release-please action [#4](https://github.com/HeyPuter/puter/issues/4) ([f392de7](https://github.com/HeyPuter/puter/commit/f392de722a5232b622ed91b656a31cdc443c2e84))
* typographical error :bug: ([2949f71](https://github.com/HeyPuter/puter/commit/2949f71691eb0a258888c5d2a5bb496d2fe64a23))
* typographical errors :bug: ([4d30740](https://github.com/HeyPuter/puter/commit/4d30740198402cd1cc61b9ea4c45e006b69ec87e))
* Use correct variable for version number ([52d5299](https://github.com/HeyPuter/puter/commit/52d52993744dffa9f7f59a232da5df9077560731))
* use primary read in signup ([30f17ad](https://github.com/HeyPuter/puter/commit/30f17ade3a893d2283316e581836607e2029f9b9))

## [2.2.0](https://github.com/HeyPuter/puter/compare/v2.1.1...v2.2.0) (2024-04-23)


### Features

* add /healthcheck endpoint ([c166560](https://github.com/HeyPuter/puter/commit/c166560ff4ab5a453d3ec4f97326c995deb7f522))
* allow apps to add a menubar via puter.js ([331d9e7](https://github.com/HeyPuter/puter/commit/331d9e75428ec7609394f59b1755374c7340f83e))

## [2.1.1](https://github.com/HeyPuter/puter/compare/v2.1.0...v2.1.1) (2024-04-22)


### Bug Fixes

* test release-please action [#3](https://github.com/HeyPuter/puter/issues/3) ([8fb0a66](https://github.com/HeyPuter/puter/commit/8fb0a66ef21921990e564e5f61c0e80e7f929dc7))
* test release-please action [#4](https://github.com/HeyPuter/puter/issues/4) ([f392de7](https://github.com/HeyPuter/puter/commit/f392de722a5232b622ed91b656a31cdc443c2e84))
