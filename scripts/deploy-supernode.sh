#!/bin/bash
# =============================================================================
# PC2 Supernode Deploy Script  (SEC-2026-05-15 / Phase 3 Stage D)
#
# Pushes the current `main` branch's `deploy/web-gateway/` to one or both
# Elacity supernodes, with backup-before-change and smoke-tested rollback.
#
# This script exists because today's RCE incident root cause was:
#   - SEC-2 patch landed on `main` 2026-04-22
#   - Supernodes were deployed 2026-04-27/28 from a STALE local checkout
#   - 23-day window where the fix was in source but not in production
#   - Researcher discovered the still-exploitable RCE on 2026-05-14
#
# This script makes the deploy path repeatable and self-verifying.
#
# Usage:
#   ./scripts/deploy-supernode.sh [--dry-run] [--no-restart] [--ref REF] TARGET
#
# TARGET:
#   interserver   Deploy to InterServer  (69.164.241.210 / demo.ela.city)
#   contabo       Deploy to Contabo      (38.242.211.112)
#   all           Deploy to both, Contabo first (nginx-fronted = lower risk)
#
# Flags:
#   --dry-run     Show what would change, no execution
#   --no-restart  Stage files but don't restart the gateway (manual cutover)
#   --ref REF     Deploy a specific git ref instead of `main` HEAD (e.g. a tag)
#
# Auth:
#   Prefers SSH key auth (configure ~/.ssh/config). Falls back to `sshpass`
#   with SUPERNODE_INTERSERVER_PASSWORD / SUPERNODE_CONTABO_PASSWORD env vars
#   if set. Passwords are passed via `sshpass -e` (env var only), never on the
#   command line, never echoed, never persisted. NEVER commit passwords to git.
#
# Security notes for password mode:
#   - Run with a leading space (` ./scripts/...`) to skip shell history on
#     bash/zsh with HISTCONTROL=ignorespace
#   - Do NOT run with `bash -x` or `set -x` while password env vars are set
#     (the script `set +x`s defensively but the env-var assignment itself
#     could still be logged before the script starts)
#   - SSH key auth is strictly better; see docs/handover for setup notes
#
# Smoke-test contract (deploy fails + auto-reverts if ANY of these fail):
#   1. `/api/health` returns HTTP 200 with valid JSON
#   2. `/api/supernodes` returns HTTP 200 with `supernodes[]`
#   3. The researcher's exploit returns 400 "Invalid username"
#      (NOT 503, NOT "uid=0(root)")
# =============================================================================

set -euo pipefail

# ---- Colors ----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()      { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} ${GREEN}OK${NC}    $*"; }
warn()    { echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} ${YELLOW}WARN${NC}  $*"; }
fail()    { echo -e "${RED}[$(date +%H:%M:%S)]${NC} ${RED}FAIL${NC}  $*"; }
section() { echo -e "\n${BOLD}=== $* ===${NC}"; }

# ---- Configuration ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Per-host config (host name, public test URL, gateway service name, deploy dir)
INTERSERVER_HOST="${SUPERNODE_INTERSERVER_HOST:-69.164.241.210}"
INTERSERVER_USER="${SUPERNODE_INTERSERVER_USER:-root}"
INTERSERVER_TEST_URL="${SUPERNODE_INTERSERVER_TEST_URL:-https://demo.ela.city}"
INTERSERVER_GATEWAY_SVC="${SUPERNODE_INTERSERVER_GATEWAY_SVC:-pc2-gateway}"
INTERSERVER_DEPLOY_DIR="${SUPERNODE_INTERSERVER_DEPLOY_DIR:-/root/pc2/web-gateway}"

CONTABO_HOST="${SUPERNODE_CONTABO_HOST:-38.242.211.112}"
CONTABO_USER="${SUPERNODE_CONTABO_USER:-root}"
# Contabo doesn't have a public DNS for the gateway; smoke-test via direct IP + Host header.
CONTABO_TEST_URL="${SUPERNODE_CONTABO_TEST_URL:-https://38.242.211.112}"
CONTABO_TEST_HOST_HEADER="${SUPERNODE_CONTABO_TEST_HOST:-ela.city}"
CONTABO_GATEWAY_SVC="${SUPERNODE_CONTABO_GATEWAY_SVC:-pc2-web-gateway}"
CONTABO_DEPLOY_DIR="${SUPERNODE_CONTABO_DEPLOY_DIR:-/root/pc2/web-gateway}"

BACKUPS_TO_KEEP="${SUPERNODE_BACKUPS_TO_KEEP:-10}"

# ---- Parse args ------------------------------------------------------------
DRY_RUN=0
NO_RESTART=0
GIT_REF="main"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --no-restart) NO_RESTART=1; shift ;;
    --ref)       GIT_REF="$2"; shift 2 ;;
    -h|--help)
      sed -n '3,40p' "$0"
      exit 0 ;;
    interserver|contabo|all)
      TARGET="$1"; shift ;;
    *) fail "Unknown argument: $1"; exit 2 ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  fail "Missing TARGET. Use: interserver | contabo | all"
  exit 2
fi

# ---- Source-tree prep ------------------------------------------------------
cd "$PROJECT_ROOT"

section "Source tree"
log "Resolving git ref: $GIT_REF"
if ! git rev-parse --verify "$GIT_REF^{commit}" >/dev/null 2>&1; then
  fail "Git ref '$GIT_REF' not found. Did you 'git fetch'?"
  exit 1
fi
RESOLVED_SHA="$(git rev-parse --short "$GIT_REF")"
log "Resolved $GIT_REF -> $RESOLVED_SHA"

# Materialise the deploy/web-gateway tree from that ref into a staging dir.
STAGING_DIR="$(mktemp -d "/tmp/pc2-deploy-${RESOLVED_SHA}.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT

log "Materialising deploy/web-gateway/ at $RESOLVED_SHA into $STAGING_DIR"
git archive "$GIT_REF" deploy/web-gateway/ | tar -x -C "$STAGING_DIR"
mv "$STAGING_DIR/deploy/web-gateway"/* "$STAGING_DIR/"
rm -rf "$STAGING_DIR/deploy"

# Local syntax check before we touch any production host.
log "Local syntax-check of index.js + lib/"
for f in "$STAGING_DIR/index.js" "$STAGING_DIR"/lib/*.js; do
  [ -e "$f" ] || continue
  # node --check requires .js extension; the staged files already have it
  if ! node --check "$f" 2>&1; then
    fail "Syntax check failed: $f"
    exit 1
  fi
done
ok "All staged files pass local syntax check"

# ---- SSH helpers -----------------------------------------------------------
# Common SSH options.
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile=/tmp/.pc2-known-hosts
  -o ConnectTimeout=15
  -o LogLevel=ERROR
)

# Run a remote command. Args: host user passvar -- remote_command...
# Password (if any) is passed via SSHPASS env var to `sshpass -e` so it never
# appears on the command line or in process listings.
run_ssh() {
  { set +x; } 2>/dev/null   # never echo subsequent commands (paranoia for `bash -x`)
  local host="$1" user="$2" passvar="$3"
  shift 3
  local pw="${!passvar:-}"
  if [ -n "$pw" ]; then
    if ! command -v sshpass >/dev/null 2>&1; then
      fail "$passvar is set but sshpass is not installed. brew install hudochenkov/sshpass/sshpass"
      exit 1
    fi
    SSHPASS="$pw" sshpass -e ssh "${SSH_OPTS[@]}" "${user}@${host}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${user}@${host}" "$@"
  fi
}

# scp a local file to the remote host. Args: host user passvar local_path remote_path
run_scp() {
  { set +x; } 2>/dev/null
  local host="$1" user="$2" passvar="$3" local_path="$4" remote_path="$5"
  local pw="${!passvar:-}"
  if [ -n "$pw" ]; then
    SSHPASS="$pw" sshpass -e scp "${SSH_OPTS[@]}" "$local_path" "${user}@${host}:${remote_path}"
  else
    scp "${SSH_OPTS[@]}" "$local_path" "${user}@${host}:${remote_path}"
  fi
}

# ---- Smoke tests -----------------------------------------------------------
# All three must pass post-deploy or we auto-revert.
smoke_test() {
  local label="$1" base_url="$2" host_header="${3:-}"
  local host_arg=""
  [ -n "$host_header" ] && host_arg="-H Host:$host_header --resolve $host_header:443:${base_url#https://}"

  log "Smoke-testing $label ($base_url)"

  # Test 1: /api/health
  local h
  # shellcheck disable=SC2086
  h=$(curl -sk --max-time 8 $host_arg "$base_url/api/health" -w '\n__HTTP__%{http_code}' || true)
  local code="${h##*__HTTP__}"
  if [ "$code" != "200" ]; then
    fail "$label: /api/health returned $code (expected 200)"
    return 1
  fi
  if ! echo "${h%__HTTP__*}" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("status")=="ok"' 2>/dev/null; then
    fail "$label: /api/health JSON did not contain status=ok"
    return 1
  fi
  ok "$label: /api/health = 200, status=ok"

  # Test 2: /api/supernodes
  # shellcheck disable=SC2086
  h=$(curl -sk --max-time 8 $host_arg "$base_url/api/supernodes" -w '\n__HTTP__%{http_code}' || true)
  code="${h##*__HTTP__}"
  if [ "$code" != "200" ]; then
    fail "$label: /api/supernodes returned $code (expected 200)"
    return 1
  fi
  if ! echo "${h%__HTTP__*}" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d.get("supernodes"), list)' 2>/dev/null; then
    fail "$label: /api/supernodes JSON did not contain supernodes[]"
    return 1
  fi
  ok "$label: /api/supernodes = 200, supernodes[] present"

  # Test 3: SEC-2 exploit MUST return 400 "Invalid username" (NOT 503, NOT root output)
  # shellcheck disable=SC2086
  h=$(curl -sk --max-time 8 -X POST $host_arg "$base_url/api/vless/register" \
       -H 'Content-Type: application/json' \
       --data-raw '{"username":"x\"; id ; echo \""}' \
       -w '\n__HTTP__%{http_code}' || true)
  code="${h##*__HTTP__}"
  local body="${h%__HTTP__*}"
  if [ "$code" != "400" ]; then
    fail "$label: SEC-2 exploit returned $code (expected 400). RAW: $body"
    return 1
  fi
  if echo "$body" | grep -qE 'uid=0|root|gid=0'; then
    fail "$label: SEC-2 exploit response contains root command output. CRITICAL."
    return 1
  fi
  if ! echo "$body" | grep -qE 'Invalid username|invalid|sanitiz'; then
    warn "$label: SEC-2 exploit returned 400 but body unexpected: $body"
  fi
  ok "$label: SEC-2 exploit returns 400 (allowlist enforced, no shell injection)"

  return 0
}

# ---- Per-host deploy -------------------------------------------------------
deploy_host() {
  local label="$1" host="$2" user="$3" passvar="$4" base_url="$5" host_header="$6" gateway_svc="$7" deploy_dir="$8"

  section "Deploying to $label ($host)"

  # 1. Connectivity probe
  log "[$label] SSH connectivity probe"
  if ! run_ssh "$host" "$user" "$passvar" 'echo CONNECTED' >/dev/null; then
    fail "[$label] SSH connect failed"
    return 1
  fi
  ok "[$label] SSH OK"

  # 2. Pre-deploy smoke test (record baseline)
  log "[$label] Pre-deploy baseline smoke test"
  if ! smoke_test "$label (pre)" "$base_url" "$host_header"; then
    fail "[$label] Baseline smoke test failed. ABORTING (the supernode is unhealthy BEFORE we touched it)."
    return 1
  fi

  # 3. Diff: what's actually changing?
  log "[$label] Computing diff between staged vs deployed"
  local remote_md5_index local_md5_index
  remote_md5_index=$(run_ssh "$host" "$user" "$passvar" "md5sum $deploy_dir/index.js | cut -d' ' -f1" 2>/dev/null || echo "missing")
  local_md5_index=$(md5sum "$STAGING_DIR/index.js" | cut -d' ' -f1)
  if [ "$remote_md5_index" = "$local_md5_index" ]; then
    ok "[$label] index.js already up-to-date (md5 $local_md5_index). Skipping."
    return 0
  fi
  log "[$label] index.js will update: $remote_md5_index -> $local_md5_index"

  if [ "$DRY_RUN" = "1" ]; then
    warn "[$label] DRY-RUN — would deploy, restart, and smoke-test. Stopping here."
    return 0
  fi

  # 4. Backup current state
  local TS BACKUP_DIR
  TS=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="$deploy_dir.backup.$TS"
  log "[$label] Backing up to $BACKUP_DIR"
  run_ssh "$host" "$user" "$passvar" "cp -r $deploy_dir $BACKUP_DIR" || { fail "[$label] backup failed"; return 1; }
  ok "[$label] Backup: $BACKUP_DIR"

  # 5. Upload staged files into .deploy-staging/, then atomic-move
  log "[$label] Uploading staged files"
  run_ssh "$host" "$user" "$passvar" "rm -rf $deploy_dir/.deploy-staging && mkdir -p $deploy_dir/.deploy-staging/lib"
  run_scp "$host" "$user" "$passvar" "$STAGING_DIR/index.js" "$deploy_dir/.deploy-staging/index.js" >/dev/null
  if [ -d "$STAGING_DIR/lib" ] && [ "$(ls -A "$STAGING_DIR/lib" 2>/dev/null)" ]; then
    local lib_file
    for lib_file in "$STAGING_DIR"/lib/*.js; do
      [ -e "$lib_file" ] || continue
      run_scp "$host" "$user" "$passvar" "$lib_file" "$deploy_dir/.deploy-staging/lib/$(basename "$lib_file")" >/dev/null
    done
  fi
  ok "[$label] Uploaded"

  # 6. Remote syntax check (defense in depth)
  log "[$label] Remote node --check"
  if ! run_ssh "$host" "$user" "$passvar" "cd $deploy_dir/.deploy-staging && cp index.js /tmp/_pc2_chk_$$.js && node --check /tmp/_pc2_chk_$$.js && rm /tmp/_pc2_chk_$$.js" >/dev/null; then
    fail "[$label] Remote syntax check failed. Aborting (backup preserved at $BACKUP_DIR, no changes made to live)."
    run_ssh "$host" "$user" "$passvar" "rm -rf $deploy_dir/.deploy-staging" || true
    return 1
  fi
  ok "[$label] Remote syntax OK"

  # 7. Atomic swap: lib first (so the new index.js's imports resolve), then index.js
  log "[$label] Atomic swap"
  run_ssh "$host" "$user" "$passvar" "mkdir -p $deploy_dir/lib && cp $deploy_dir/.deploy-staging/lib/*.js $deploy_dir/lib/ 2>/dev/null; mv $deploy_dir/.deploy-staging/index.js $deploy_dir/index.js && rm -rf $deploy_dir/.deploy-staging" \
    || { fail "[$label] atomic swap failed"; return 1; }
  ok "[$label] Swapped"

  # 8. Restart
  if [ "$NO_RESTART" = "1" ]; then
    warn "[$label] --no-restart set; files in place but service NOT restarted. Run: systemctl restart $gateway_svc"
    return 0
  fi
  log "[$label] systemctl restart $gateway_svc"
  run_ssh "$host" "$user" "$passvar" "systemctl restart $gateway_svc" || { fail "[$label] restart failed"; revert_host "$label" "$host" "$user" "$passvar" "$gateway_svc" "$deploy_dir" "$BACKUP_DIR"; return 1; }
  sleep 5
  local svc_state
  svc_state=$(run_ssh "$host" "$user" "$passvar" "systemctl is-active $gateway_svc" 2>/dev/null || echo "unknown")
  if [ "$svc_state" != "active" ]; then
    fail "[$label] $gateway_svc is $svc_state after restart. Reverting."
    revert_host "$label" "$host" "$user" "$passvar" "$gateway_svc" "$deploy_dir" "$BACKUP_DIR"
    return 1
  fi
  ok "[$label] $gateway_svc active"

  # 9. Post-deploy smoke test
  log "[$label] Post-deploy smoke test"
  if ! smoke_test "$label (post)" "$base_url" "$host_header"; then
    fail "[$label] POST-DEPLOY SMOKE TEST FAILED. Reverting from $BACKUP_DIR."
    revert_host "$label" "$host" "$user" "$passvar" "$gateway_svc" "$deploy_dir" "$BACKUP_DIR"
    return 1
  fi
  ok "[$label] Post-deploy smoke test PASSED"

  # 10. Trim old backups (keep most recent N)
  log "[$label] Trimming old backups (keeping $BACKUPS_TO_KEEP most recent)"
  run_ssh "$host" "$user" "$passvar" "ls -dt $deploy_dir.backup.* 2>/dev/null | tail -n +$((BACKUPS_TO_KEEP + 1)) | xargs -r rm -rf" || true

  ok "[$label] Deploy complete. Backup: $BACKUP_DIR"
  return 0
}

# Revert from a backup directory.
revert_host() {
  local label="$1" host="$2" user="$3" passvar="$4" gateway_svc="$5" deploy_dir="$6" backup_dir="$7"
  warn "[$label] REVERT — restoring from $backup_dir"
  run_ssh "$host" "$user" "$passvar" "rm -rf $deploy_dir && cp -r $backup_dir $deploy_dir && systemctl restart $gateway_svc && sleep 4 && systemctl is-active $gateway_svc" \
    || { fail "[$label] REVERT FAILED — manual intervention required"; return 2; }
  warn "[$label] Reverted to backup at $backup_dir. Investigate before retrying."
}

# ---- Dispatch --------------------------------------------------------------
section "PC2 Supernode Deploy — ref=$GIT_REF ($RESOLVED_SHA), target=$TARGET, dry_run=$DRY_RUN"

EXIT=0

case "$TARGET" in
  contabo)
    deploy_host "Contabo" "$CONTABO_HOST" "$CONTABO_USER" SUPERNODE_CONTABO_PASSWORD \
      "$CONTABO_TEST_URL" "$CONTABO_TEST_HOST_HEADER" "$CONTABO_GATEWAY_SVC" "$CONTABO_DEPLOY_DIR" || EXIT=1
    ;;
  interserver)
    deploy_host "InterServer" "$INTERSERVER_HOST" "$INTERSERVER_USER" SUPERNODE_INTERSERVER_PASSWORD \
      "$INTERSERVER_TEST_URL" "" "$INTERSERVER_GATEWAY_SVC" "$INTERSERVER_DEPLOY_DIR" || EXIT=1
    ;;
  all)
    # Contabo first (nginx-fronted = lower risk). If Contabo fails, abort InterServer.
    deploy_host "Contabo" "$CONTABO_HOST" "$CONTABO_USER" SUPERNODE_CONTABO_PASSWORD \
      "$CONTABO_TEST_URL" "$CONTABO_TEST_HOST_HEADER" "$CONTABO_GATEWAY_SVC" "$CONTABO_DEPLOY_DIR" || { EXIT=1; fail "Contabo failed — aborting InterServer to avoid double-blast"; exit $EXIT; }
    log "Pausing 30s for Contabo stability observation before InterServer"
    sleep 30
    deploy_host "InterServer" "$INTERSERVER_HOST" "$INTERSERVER_USER" SUPERNODE_INTERSERVER_PASSWORD \
      "$INTERSERVER_TEST_URL" "" "$INTERSERVER_GATEWAY_SVC" "$INTERSERVER_DEPLOY_DIR" || EXIT=1
    ;;
esac

section "Done"
if [ $EXIT -eq 0 ]; then
  ok "Deploy succeeded. Ref: $GIT_REF ($RESOLVED_SHA). Target: $TARGET."
else
  fail "Deploy failed for one or more hosts. See logs above."
fi
exit $EXIT
