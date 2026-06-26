#!/usr/bin/env bash
#
# deploy-enm.sh — install OR upgrade ENM on this PC2 host using a tagged release.
#
# Two modes, picked automatically:
#
#   FRESH INSTALL  (no /var/lib/pc2/data/installed-apps/elastos-node-manager)
#     1. Download the tagged .tar.gz + .json from GitHub Releases
#     2. Extract the tarball to a temp test-apps dir
#     3. POST /api/installed-apps/install-local with manifest + temp path —
#        pc2-node copies the bundle into place AND spawns the backend AND
#        records the row in installed_apps.
#
#   UPGRADE  (bundle dir already present) — rewritten 2026-05-11
#     1. Download the tarball
#     2. Diagnostic backup of the current install to /tmp/enm-backup-*.tar.gz
#     3. Extract the new bundle to a temp test-apps dir (not the live dir)
#     4. DELETE /api/installed-apps/elastos-node-manager?purge=false — keeps
#        externalDataDirs (chain data + keystore + audit log live there).
#     5. POST /api/installed-apps/install-local — same call as fresh install.
#     6. Health check. On failure, the operator deploys the previous tag.
#
# Usage:
#   sudo ./deploy-enm.sh                     # latest tagged release
#   sudo ./deploy-enm.sh enm-v0.1.0-alpha.4  # specific tag
#
# Auth (REQUIRED for both fresh install AND upgrade since 2026-05-11):
#   PC2_OWNER_TOKEN   the owner's Bearer token. Grab it from your PC2
#                     desktop URL — the ?puter.auth.token=... query string.
#                     Upgrade used to skip this (file-overlay + PID kill)
#                     but pc2-node's boot sweeper reaps file-overlay
#                     bundles as "stale auto-installed", so both paths
#                     now go through /api/installed-apps/install-local.
#
# Env overrides:
#   GITHUB_REPO   default 4HM3DMD/pc2-testing
#   BUNDLE_DIR    default /var/lib/pc2/data/installed-apps/elastos-node-manager
#   ENM_PORT      default 4180  (used for the post-deploy health check)
#   PC2_PORT      default 4202  (pc2-node HTTP — only used for fresh install)

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-4HM3DMD/pc2-testing}"
BUNDLE_DIR="${BUNDLE_DIR:-/var/lib/pc2/data/installed-apps/elastos-node-manager}"
ENM_PORT="${ENM_PORT:-4180}"
PC2_PORT="${PC2_PORT:-4202}"
TAG="${1:-latest}"

log() { printf '\033[1;36m[deploy-enm]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[deploy-enm] ERROR:\033[0m %s\n' "$*" >&2; exit "${2:-1}"; }

# 0.2.0-alpha.12 — node_modules integrity check. The CI bundle SHOULD have
# every transitive dep, but install-local's copyDirRecursive has been
# observed to silently drop files under load (the operator's 2026-05-12
# trace showed `Cannot find module 'array-flatten'` after install-local
# claimed success). To be resilient, we run `npm install --omit=dev` on
# the staged dir before handing it to install-local. If npm is missing,
# we at least flag the missing key dep so the operator knows.
#
# Cost: ~30-60s of extra deploy time. Worth it to avoid crash-loops that
# end in pc2-node quarantining the app.
verify_node_modules() {
    local stage="$1"
    local backend_dir="$stage/backend"
    if [ ! -d "$backend_dir" ]; then
        log "WARN: $backend_dir not found — skipping node_modules check"
        return 0
    fi

    # Sentinel: array-flatten is Express's narrowest transitive dep. If
    # it's missing, the bundle is incomplete and ENM will ENOENT on the
    # first router.use() call (which Express lazy-loads route.js for,
    # which requires array-flatten). Other sentinels could be picked
    # (body-parser, etc.) — array-flatten is small + load-bearing.
    if [ -d "$backend_dir/node_modules/array-flatten" ] && [ -f "$backend_dir/node_modules/express/index.js" ]; then
        log "node_modules looks complete (express + array-flatten sentinels present)"
        return 0
    fi

    log "WARN: node_modules missing critical deps — bundle from CI was incomplete"
    if command -v npm >/dev/null 2>&1; then
        log "running npm install --omit=dev to heal (this can take ~60s)…"
        if (cd "$backend_dir" && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -8); then
            if [ -d "$backend_dir/node_modules/array-flatten" ] && [ -f "$backend_dir/node_modules/express/index.js" ]; then
                log "node_modules healed via npm install"
            else
                die "npm install completed but critical deps still missing — investigate package-lock.json"
            fi
        else
            die "npm install failed in $backend_dir — ENM cannot start without complete node_modules"
        fi
    else
        die "node_modules incomplete + npm not on PATH. Install Node 20.x first: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    fi
}

# 0.2.0-alpha.14 — pc2-node's `installFromLocal` copyDirRecursive silently
# drops random files during the copy from staged dir into installed-apps/.
# Sometimes array-flatten, sometimes Express itself, sometimes something
# else — non-deterministic. The pre-copy sentinel check (verify_node_modules)
# doesn't help: the staged dir IS complete, the destination is what's broken.
#
# This helper repairs the destination AFTER install-local lands by `cp -a`'ing
# the staged dir on top, restoring any silently-dropped files. We also kill
# any ENM child the supervisor may have spawned in the meantime — it's
# already crash-looping on missing modules, so terminating it cleanly lets
# AppProcessManager respawn with the now-complete bundle.
repair_after_install_local() {
    local stage="$1"
    local dest="$2"

    # Brief settle to let install-local + the supervisor spawn quiesce.
    sleep 2

    local repair_needed=false
    if [ ! -f "$dest/backend/node_modules/express/index.js" ] \
       || [ ! -f "$dest/backend/node_modules/array-flatten/array-flatten.js" ] \
       || [ ! -d "$dest/backend/node_modules/body-parser" ]; then
        repair_needed=true
    fi

    if [ "$repair_needed" = "true" ]; then
        log "install-local dropped critical files (known pc2-node bug). Repairing via cp -a from staged dir…"
        # Stop the crash-looping ENM child so we don't fight it for file
        # handles. AppProcessManager will respawn it after repair.
        pkill -f 'elastos-node-manager.*server.js' 2>/dev/null || true
        sleep 1
        # cp -a preserves attrs and merges; if dest already has a file
        # it gets overwritten; if dest is missing one, it's added.
        cp -a "$stage/backend/." "$dest/backend/" || \
            die "cp -a repair failed; manual intervention required"
        log "repair complete — AppProcessManager will respawn ENM cleanly now"
    else
        log "post-install verification passed (express + array-flatten + body-parser all present)"
    fi
}

command -v wget >/dev/null  || die "wget not installed"
command -v jq >/dev/null    || die "jq not installed (apt install jq)"
command -v curl >/dev/null  || die "curl not installed"

# 1. Resolve tag → release JSON via the GitHub API.
log "resolving release tag '$TAG' from $GITHUB_REPO"
if [ "$TAG" = "latest" ]; then
    RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest") \
        || die "could not fetch latest release (private repo? rate-limited? wrong repo name?)" 2
else
    RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/tags/$TAG") \
        || die "release tag '$TAG' not found" 2
fi

TARBALL_URL=$(echo "$RELEASE_JSON" | jq -r '.assets[] | select(.name | endswith(".tar.gz")) | .browser_download_url' | head -1)
MANIFEST_URL=$(echo "$RELEASE_JSON" | jq -r '.assets[] | select(.name | endswith(".json")) | .browser_download_url' | head -1)
[ -n "$TARBALL_URL" ]  || die "no .tar.gz asset in release '$TAG'" 2
[ -n "$MANIFEST_URL" ] || die "no .json (manifest) asset in release '$TAG'" 2
TARBALL_NAME=$(basename "$TARBALL_URL")
log "tarball:  $TARBALL_URL"
log "manifest: $MANIFEST_URL"

# 2. Download both to temp.
TMP_TARBALL=$(mktemp --suffix=.tar.gz)
TMP_MANIFEST=$(mktemp --suffix=.json)
TMP_EXTRACT=""
trap 'rm -f "$TMP_TARBALL" "$TMP_MANIFEST"; [ -n "$TMP_EXTRACT" ] && rm -rf "$TMP_EXTRACT"' EXIT

log "downloading $TARBALL_NAME..."
wget -q -O "$TMP_TARBALL"  "$TARBALL_URL"  || die "tarball download failed" 2
wget -q -O "$TMP_MANIFEST" "$MANIFEST_URL" || die "manifest download failed" 2

DOWNLOADED_BYTES=$(stat -c '%s' "$TMP_TARBALL")
log "downloaded $DOWNLOADED_BYTES bytes"
[ "$DOWNLOADED_BYTES" -gt 100000 ] || die "tarball suspiciously small (got $DOWNLOADED_BYTES bytes)" 2

# 3. Pick the install mode based on whether the bundle dir already exists.
if [ -d "$BUNDLE_DIR" ]; then
    MODE="upgrade"
else
    MODE="fresh"
fi
log "mode: $MODE"

# =============================================================================
# Fresh install — go through pc2-node so the DB row + process supervision land.
# =============================================================================
if [ "$MODE" = "fresh" ]; then
    [ -n "${PC2_OWNER_TOKEN:-}" ] || die "fresh install needs PC2_OWNER_TOKEN env var (the owner's Bearer token from the PC2 desktop URL: ?puter.auth.token=...)"

    # /install-local restricts localDir to a safe-list — extracting to /tmp
    # gets rejected with "localDir must live inside one of [test-apps, dev-apps]".
    # Use test-apps as the staging root so the path passes the gate.
    PC2_TEST_APPS_DIR="${PC2_TEST_APPS_DIR:-/var/lib/pc2/data/test-apps}"
    mkdir -p "$PC2_TEST_APPS_DIR"
    TMP_EXTRACT=$(mktemp -d -p "$PC2_TEST_APPS_DIR")
    log "extracting tarball into $TMP_EXTRACT"
    tar -C "$TMP_EXTRACT" -xzf "$TMP_TARBALL" || die "extract failed" 3

    verify_node_modules "$TMP_EXTRACT"

    log "calling pc2-node /api/installed-apps/install-local"
    BODY=$(jq -n \
        --slurpfile manifest "$TMP_MANIFEST" \
        --arg localDir "$TMP_EXTRACT" \
        '{ manifest: $manifest[0], localDir: $localDir }')
    RESP=$(curl -sS -X POST "http://127.0.0.1:${PC2_PORT}/api/installed-apps/install-local" \
        -H "Authorization: Bearer ${PC2_OWNER_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "$BODY") || die "install-local request failed (is pc2-node running on :${PC2_PORT}?)" 3

    # pc2-node returns either { app: {...} } on success or { error: "..." } on failure.
    if echo "$RESP" | jq -e '.error' >/dev/null 2>&1; then
        die "install-local rejected: $(echo "$RESP" | jq -r '.error')" 3
    fi
    APP_NAME=$(echo "$RESP" | jq -r '.app.app_name // .app.name // "elastos-node-manager"')
    log "pc2-node installed '$APP_NAME' and started its backend"

    repair_after_install_local "$TMP_EXTRACT" "$BUNDLE_DIR"
fi

# =============================================================================
# Upgrade — DELETE the old install via pc2-node API, then install the new
# bundle via /api/installed-apps/install-local.
#
# The previous upgrade path (kill PID + file-overlay tarball extract over the
# live BUNDLE_DIR) seemed cheap but had a load-bearing bug: pc2-node's boot
# sweeper labels file-overlay installs as "stale auto-installed bundle" and
# uninstalls them, then the next AppProcessManager hydrate tick crashes the
# app to quarantine within ~70ms (count rises to 4 → quarantined; manual
# clearQuarantine required). After alpha.18→alpha.18 trial 2026-05-11 hit
# this on the test server, the path was rewritten to register through the
# supervisor API the same way the fresh install does.
#
# Chain data + keystore + audit log live in externalDataDirs (the
# /var/lib/pc2/data/extensions/elastos-node-manager/ tree) — those survive
# a DELETE ?purge=false because pc2-node only wipes externalDataDirs when
# purge=true. So an upgrade preserves all node state; only the bundle JS +
# the installed_apps row are swapped.
# =============================================================================
if [ "$MODE" = "upgrade" ]; then
    [ -n "${PC2_OWNER_TOKEN:-}" ] || die "upgrade requires PC2_OWNER_TOKEN. pc2-node's boot sweeper reaps file-overlay installs; the new upgrade flow calls /api/installed-apps DELETE + install-local, which need the owner's Bearer token (PC2 desktop URL: ?puter.auth.token=...)."

    BACKUP_PATH="/tmp/enm-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    log "backing up current bundle to $BACKUP_PATH (diagnostic only — rollback uses deploy-enm.sh <prev-tag>)"
    tar czf "$BACKUP_PATH" -C "$BUNDLE_DIR" . || die "backup failed" 3

    # Stage the new bundle in test-apps (install-local's safe-list).
    PC2_TEST_APPS_DIR="${PC2_TEST_APPS_DIR:-/var/lib/pc2/data/test-apps}"
    mkdir -p "$PC2_TEST_APPS_DIR"
    TMP_EXTRACT=$(mktemp -d -p "$PC2_TEST_APPS_DIR")
    log "extracting new bundle into $TMP_EXTRACT"
    tar -C "$TMP_EXTRACT" -xzf "$TMP_TARBALL" || die "extract failed" 3

    verify_node_modules "$TMP_EXTRACT"

    # =========================================================================
    # v0.5.201 — pre-DELETE graceful drain (Phase 1) + deploy marker (Phase 2).
    #
    # Why this exists: the v0.5.200 deploy (2026-05-24) produced an orphan
    # `ela` process (pid 188337) because mainchain went through a 5-iteration
    # respawn storm during the DELETE→install-local window. Trace (ENM log
    # lines 91399→91724): each pc2-node-respawned ENM ran autoStart, spawned
    # a fresh ela, then was killed by the next deploy step before the PID file
    # was flushed. Detached:true kept the final spawn alive as an orphan; the
    # next manual /chains/mainchain/start hit the conflict detector.
    #
    # EVM chains (esc/eid/pg) survived the same deploy with only one PID
    # change because their SIGINT drain is fast (~1s leveldb flush). Mainchain
    # is slow (~30s DPoS state + 156KB peers.json + leveldb close), so it was
    # always mid-shutdown when the next kill arrived. Arbiter died naturally
    # whenever mainchain RPC went away — no orphan there either.
    #
    # Fix:
    #   Phase 1 — stop the slow chains FIRST, BEFORE pc2-node has a chance to
    #     cgroup-kill them mid-shutdown. Both stops are `manual=true` so the
    #     self-heal won't re-spawn them.
    #   Phase 2 — write a marker file so ENM's autoStart skips the boot path
    #     entirely while the deploy is in flight. Belt-and-braces against
    #     pc2-node's app-process supervisor doing an out-of-band restart
    #     between DELETE and install-local (it did exactly that during the
    #     v0.5.200 deploy: journalctl "health check failed: This operation
    #     was aborted" at 16:32:17).
    # =========================================================================
    DEPLOY_MARKER="${PC2_DATA_DIR:-/var/lib/pc2/data}/.enm-deploy-in-progress"
    echo "$(date -u +%FT%TZ) tag=${TAG} pid=$$" > "$DEPLOY_MARKER" 2>/dev/null \
        && log "deploy marker written: $DEPLOY_MARKER (autoStart will skip while present)" \
        || log "WARN: could not write deploy marker (ENM autoStart may re-spawn chains during the bundle swap)"

    log "draining slow chains (arbiter + mainchain) before bundle swap..."
    # Stop in dependency order: arbiter first (it dies on its own when mainchain
    # RPC goes, but explicit stop is cleaner), then mainchain. EVM chains stay
    # running — their fast SIGINT survives a single cgroup-kill cleanly.
    for chain in arbiter mainchain; do
        curl -sS -X POST \
            -H "Authorization: Bearer ${PC2_OWNER_TOKEN}" \
            --max-time 30 \
            "http://127.0.0.1:${ENM_PORT}/api/enm/chains/${chain}/stop" >/dev/null 2>&1 \
            || log "  ${chain}/stop call failed (chain may already be stopped) — continuing"
    done
    # Poll until both report stopped (or 120s timeout — matches the ENM
    # SHUTDOWN_DRAIN_GRACE_MS constant for the EnmConstants /teardown path).
    DRAIN_DEADLINE=$(( $(date +%s) + 120 ))
    while [ "$(date +%s)" -lt "$DRAIN_DEADLINE" ]; do
        STATES=$(curl -sS -H "Authorization: Bearer ${PC2_OWNER_TOKEN}" \
            --max-time 10 \
            "http://127.0.0.1:${ENM_PORT}/api/enm/chains" 2>/dev/null \
            | jq -r '.result.chains[] | select(.chainId == "mainchain" or .chainId == "arbiter") | .state' \
            | sort -u | paste -sd, -)
        if [ "$STATES" = "stopped" ]; then
            log "mainchain + arbiter drained cleanly (state=stopped)"
            break
        fi
        sleep 3
    done
    [ "$STATES" = "stopped" ] || log "WARN: drain timeout — states=$STATES — proceeding anyway (Phase 2 marker still protects the deploy)"

    # Uninstall the old version (purge=false → keeps externalDataDirs so
    # chain data and keystore survive the swap).
    log "uninstalling old version via DELETE /api/installed-apps/elastos-node-manager?purge=false"
    UN_RESP=$(curl -sS -X DELETE \
        "http://127.0.0.1:${PC2_PORT}/api/installed-apps/elastos-node-manager?purge=false" \
        -H "Authorization: Bearer ${PC2_OWNER_TOKEN}" 2>&1)
    # DELETE can legitimately return 404 (sweeper already reaped the row) —
    # don't die. install-local below recovers either way.
    if echo "$UN_RESP" | jq -e '.error' >/dev/null 2>&1; then
        log "DELETE returned: $(echo "$UN_RESP" | jq -r '.error') — continuing with install-local"
    else
        log "old version uninstalled"
    fi

    # Install the new bundle. This is the same call the fresh-install path
    # makes — it registers with the supervisor so the boot sweeper leaves it
    # alone next time pc2-node restarts.
    log "calling pc2-node /api/installed-apps/install-local"
    BODY=$(jq -n \
        --slurpfile manifest "$TMP_MANIFEST" \
        --arg localDir "$TMP_EXTRACT" \
        '{ manifest: $manifest[0], localDir: $localDir }')
    RESP=$(curl -sS -X POST "http://127.0.0.1:${PC2_PORT}/api/installed-apps/install-local" \
        -H "Authorization: Bearer ${PC2_OWNER_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "$BODY") || die "install-local request failed (is pc2-node running on :${PC2_PORT}?)" 3

    if echo "$RESP" | jq -e '.error' >/dev/null 2>&1; then
        die "install-local rejected: $(echo "$RESP" | jq -r '.error')" 3
    fi
    APP_NAME=$(echo "$RESP" | jq -r '.app.app_name // .app.name // "elastos-node-manager"')
    log "pc2-node reinstalled '$APP_NAME' and (re)started the backend"

    repair_after_install_local "$TMP_EXTRACT" "$BUNDLE_DIR"
fi

# =============================================================================
# override_sweep_cid — make the install survive pc2-node's boot sweeper.
#
# pc2-node's boot sweeper (pc2-node/src/api/index.ts) deletes the bundle dir +
# installed_apps row of any app whose cid starts with 'local:' and isn't a
# role:"system" test-apps bundle — on EVERY pc2-node (re)start. install-local
# always sets cid='local:<name>' (AppInstallService.ts), so a plain pc2-node
# restart (it crashes + systemd-restarts periodically — observed NRestarts=7 on
# a test node) reaps ENM and takes ALL chains down until a manual redeploy. We
# rewrite the cid to 'manual:<tag>' after a healthy install so the sweeper
# skips ENM. Chain data lives in externalDataDirs, which the sweeper's
# uninstall() never touches — so this protects only the management layer.
#
# This was verified on an earlier test server but lost in the current
# migration because it was a server-local edit; keeping it in the repo'd
# script makes it migration-proof. Idempotent + non-fatal.
# =============================================================================
override_sweep_cid() {
    local DB="${PC2_DB_PATH:-/var/lib/pc2/data/pc2-node.sqlite}"
    local NAME="${APP_NAME:-elastos-node-manager}"
    if [ ! -f "$DB" ]; then
        log "override_sweep_cid: pc2-node DB not found at $DB — SKIPPED (ENM may be reaped on the next pc2-node restart)"
        return 0
    fi
    if ! command -v sqlite3 >/dev/null 2>&1; then
        log "override_sweep_cid: sqlite3 not installed — SKIPPED (ENM may be reaped on the next pc2-node restart)"
        return 0
    fi
    if sqlite3 "$DB" "UPDATE installed_apps SET cid='manual:${TAG}' WHERE app_name='${NAME}' AND cid LIKE 'local:%';" 2>/dev/null; then
        log "override_sweep_cid: installed_apps.cid set to 'manual:${TAG}' for ${NAME} — survives pc2-node boot sweeper"
    else
        log "override_sweep_cid: UPDATE failed (non-fatal) — ENM may be reaped on the next pc2-node restart"
    fi
}

# =============================================================================
# Smoke test (both modes).
# =============================================================================
log "waiting for ENM to come up on :$ENM_PORT..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 2
    if curl -fsS "http://localhost:${ENM_PORT}/api/enm/health" >/dev/null 2>&1; then
        log "health OK after ${i}x2s"
        # Protect this install from pc2-node's boot sweeper (see fn comment).
        override_sweep_cid
        # v0.5.201 Phase 2 — clear deploy-in-progress marker now that the
        # install is verified healthy. autoStart on the next ENM boot will
        # see no marker and run normally.
        if [ -f "${PC2_DATA_DIR:-/var/lib/pc2/data}/.enm-deploy-in-progress" ]; then
            rm -f "${PC2_DATA_DIR:-/var/lib/pc2/data}/.enm-deploy-in-progress" 2>/dev/null \
                && log "deploy marker cleared — autoStart will run on next boot"
        fi
        log "deployed: $TARBALL_NAME ($MODE mode)"
        if [ "$MODE" = "upgrade" ]; then
            log "rollback: tar -C $BUNDLE_DIR -xzf $BACKUP_PATH && kill \$(pgrep -f 'elastos-node-manager.*server.js')"
        fi
        exit 0
    fi
done

# Health didn't come back. Both modes now go through install-local, so the
# right recovery on failure is "deploy the previous tag" — the old "untar
# the backup over the live dir" trick (used until 2026-05-11) leaves the
# install in a state pc2-node's boot sweeper later reaps as stale.
#
# v0.5.201 Phase 2 — clear the deploy marker on failure too. Leaving it
# stale would make autoStart skip indefinitely on every subsequent ENM
# boot, blocking the operator's recovery. The marker has a 10-minute age
# cutoff on the ENM side, but explicit cleanup is cleaner.
if [ -f "${PC2_DATA_DIR:-/var/lib/pc2/data}/.enm-deploy-in-progress" ]; then
    rm -f "${PC2_DATA_DIR:-/var/lib/pc2/data}/.enm-deploy-in-progress" 2>/dev/null \
        && log "deploy marker cleared (deploy failed — manual recovery)"
fi
die "$MODE failed: ENM never came up on :$ENM_PORT. To restore the previous version, run:
    sudo PC2_OWNER_TOKEN=<token> $0 <previous-tag>
Diagnostic bundle: $BACKUP_PATH (untouched by the failed deploy).
Check 'journalctl -u pc2-node -n 200' and 'tail -200 /var/log/pc2-node.log' for the spawn-time error." 4
