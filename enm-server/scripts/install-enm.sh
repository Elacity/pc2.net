#!/bin/bash
#
# enm-server — one-line installer.
#
# Adds the Elastos Node Manager sidecar to an existing PC2 install. Pulls the
# prebuilt enm-server image from GitHub Container Registry, edits the
# operator's `~/pc2/docker-compose.yml` to add an `enm-server` service that
# read-only-mounts pc2-node's data dir, brings the stack up, opens UFW.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/4HM3DMD/pc2-testing/main/enm-server/scripts/install-enm.sh | bash
#
# With overrides:
#   curl -sSL .../install-enm.sh | bash -s -- --port 4180 --pc2-dir /opt/pc2

set -euo pipefail

PC2_DIR="${PC2_DIR:-$HOME/pc2}"
ENM_PORT="${ENM_PORT:-4180}"
ENM_IMAGE="${ENM_IMAGE:-ghcr.io/4hm3dmd/enm-server:latest}"
EXPOSE_BPOS="${EXPOSE_BPOS:-1}"   # 1 = expose 20338+20339 publicly (BPoS); 0 = loopback only
RESET_MODE=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)     ENM_PORT="$2"; shift 2 ;;
        --pc2-dir)  PC2_DIR="$2"; shift 2 ;;
        --image)    ENM_IMAGE="$2"; shift 2 ;;
        --no-bpos)  EXPOSE_BPOS=0; shift ;;
        --reset)    RESET_MODE=1; shift ;;
        --help|-h)
            cat <<EOF
ENM (Elastos Node Manager) sidecar installer

Adds an enm-server container to your existing PC2 install.

Options:
  --port N          ENM API port (default: 4180)
  --pc2-dir PATH    Existing PC2 install dir (default: \$HOME/pc2)
  --image NAME      Override image (default: ghcr.io/4hm3dmd/enm-server:latest)
  --no-bpos         Bind ela P2P/DPoS ports (20338, 20339) to loopback only.
                    Use for full-node mode. Default exposes them publicly so
                    BPoS supernode peers can dial in.
  --reset           Stop the container, archive /data/enm to /data/enm.bak.<ts>/,
                    remove the container, then exit. Re-run without --reset for
                    a clean install. Use this to recover from a botched setup.

Pre-reqs:
  - PC2 already installed (\$PC2_DIR/docker-compose.yml exists)
  - PC2 owner already claimed (you've completed wallet-claim on dashboard)
EOF
            exit 0
            ;;
        *) echo "Unknown flag: $1" >&2; exit 1 ;;
    esac
done

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'
say()  { printf "${CYAN}==> %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}\xe2\x9c\x93 %s${NC}\n" "$*"; }
warn() { printf "${YELLOW}! %s${NC}\n" "$*"; }
die()  { printf "${RED}\xe2\x9c\x97 %s${NC}\n" "$*" >&2; exit 1; }

# --- Pre-reqs ---------------------------------------------------------------

[[ -d "$PC2_DIR" && -f "$PC2_DIR/docker-compose.yml" ]] \
    || die "PC2 not installed at $PC2_DIR. Install PC2 first: scripts/install.sh"

command -v docker >/dev/null 2>&1 \
    || die "docker not installed (PC2 install would have done this — re-run scripts/install.sh first)"

# Detect whether to use `docker compose` (v2 plugin) or `docker-compose` (v1
# standalone). v2 is the modern path; v1 still ships on older Ubuntu LTS.
# Picking once means later commands don't have to re-detect.
if docker compose version >/dev/null 2>&1; then
    COMPOSE='docker compose'
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE='docker-compose'
else
    die "Neither 'docker compose' nor 'docker-compose' is available. Install Docker Compose v2."
fi

# --- --reset (early exit) ---------------------------------------------------
#
# Recover from a botched setup: stop + remove the container, archive enm-data,
# print next steps. Doesn't touch pc2 or its data. The operator can then
# re-run this script (without --reset) for a clean install.
if [[ "$RESET_MODE" == "1" ]]; then
    cd "$PC2_DIR"
    say "Reset mode — stopping enm-server and archiving state..."
    if docker ps -a --format '{{.Names}}' | grep -q '^enm-server$'; then
        $COMPOSE stop enm-server >/dev/null 2>&1 || true
        $COMPOSE rm -f enm-server >/dev/null 2>&1 || true
        ok "Container stopped and removed"
    else
        warn "No enm-server container found"
    fi
    if [[ -d "$PC2_DIR/enm-data" ]]; then
        ARCHIVE="$PC2_DIR/enm-data.bak.$(date +%Y%m%d%H%M%S)"
        mv "$PC2_DIR/enm-data" "$ARCHIVE"
        ok "Archived enm-data → $ARCHIVE"
    fi
    cat <<EOF

Reset complete. To reinstall, re-run this script without --reset:
  bash <(curl -sSL .../install-enm.sh)

Your PC2 install is unchanged. The archived enm-data/ above can be deleted
once you've confirmed the clean install works.
EOF
    exit 0
fi

# --- Pre-flight: chain port availability ------------------------------------
#
# ela inside enm-server binds 20336/20338/20339/20333-20335. If anything OTHER
# than docker-proxy already holds them on the host, the container can come up
# but ela won't bind, and HostConflictScanner fires F19 forever. Catch it now
# with a clear error.
say "Pre-flight: checking chain port availability..."
PORT_CONFLICTS=()
for p in 20336 20338 20339 20333 20334 20335; do
    holder=$(ss -ltnpH "( sport = :$p )" 2>/dev/null | awk 'NR==1{print $6}')
    if [[ -n "$holder" && "$holder" != *docker-proxy* ]]; then
        PORT_CONFLICTS+=("  port $p — held by: $holder")
    fi
done
if (( ${#PORT_CONFLICTS[@]} > 0 )); then
    warn "Port conflicts detected (something other than docker-proxy is bound):"
    for c in "${PORT_CONFLICTS[@]}"; do printf '%s\n' "$c" >&2; done
    warn "Stop the conflicting service(s) before continuing, or pick a different host."
    warn "Continuing anyway — ela may fail to bind. Use --reset later if you need to roll back."
else
    ok "All chain ports available"
fi

# --- Migrate legacy compose: strip chain ports from pc2 ---------------------
#
# Pre-pivot installs (when the ENM extension lived inside PC2's image) had
# pc2 mapping the chain ports (20336, 20338, 20339, 20333-20335). After the
# split into a separate enm-server container, those mappings belong here, on
# enm-server, not on pc2 — pc2 doesn't run ela. Leaving them on pc2 means
# docker-proxy squats on host:20336 and ela inside enm-server can't bind it,
# and the HostConflictScanner fires F19 every healing tick.
#
# Strip them safely: the regex matches only the exact ela port mappings, so
# pc2's 4100/4200 stay, and any non-ela mapping survives.

cd "$PC2_DIR"

CHAIN_PORTS_RE='^[[:space:]]*-[[:space:]]*"(127\.0\.0\.1:)?(20336|20338|20339|20333|20334|20335):(20336|20338|20339|20333|20334|20335)"[[:space:]]*$'
if grep -qE "$CHAIN_PORTS_RE" docker-compose.yml; then
    say "Migrating legacy pc2 compose: chain ports are moving from pc2 to enm-server"
    cp docker-compose.yml "docker-compose.yml.bak.$(date +%Y%m%d%H%M%S)"
    sed -i.tmp -E "/$CHAIN_PORTS_RE/d" docker-compose.yml
    # Also drop the comment lines that introduced them (best-effort).
    sed -i -E "/^[[:space:]]*#.*ela.*(JSON-RPC stays on loopback|read-only ports — loopback)/d" docker-compose.yml
    rm -f docker-compose.yml.tmp
    ok "Legacy chain ports stripped from pc2 (backup at docker-compose.yml.bak.*)"
fi

# --- Add enm-server service to compose --------------------------------------

# Decide port-binding strategy. BPoS supernodes need 20338 + 20339 publicly
# reachable so peers can dial in. Full-node operators don't (they can stay
# fully outbound). Toggle with --no-bpos.
if [[ "$EXPOSE_BPOS" == "1" ]]; then
    BPOS_PORTS=$'      - "20338:20338"\n      - "20339:20339"'
else
    BPOS_PORTS=$'      - "127.0.0.1:20338:20338"\n      - "127.0.0.1:20339:20339"'
fi

if grep -q "^  enm-server:" docker-compose.yml; then
    # Already-installed operator: maybe their enm-server block predates the
    # post-pivot port move. If it lacks the chain ports, patch them in.
    # We don't touch any other field — image, env, volumes all stay as-is.
    if grep -qE '20336:20336|20338:20338' docker-compose.yml; then
        warn "enm-server service already in docker-compose.yml (with chain ports) — leaving as-is"
    else
        say "Patching existing enm-server block: adding chain ports..."
        cp docker-compose.yml "docker-compose.yml.bak.$(date +%Y%m%d%H%M%S).enm-ports"
        python3 - <<'PYEOF' "$EXPOSE_BPOS"
import re, sys
mode = sys.argv[1]
with open('docker-compose.yml', 'r') as f:
    src = f.read()
m = re.search(r'(\n  enm-server:[\s\S]*?)(?=\n  \w[\w-]*:|\Z)', '\n' + src)
if not m:
    raise SystemExit('enm-server block not found — refusing to patch')
block = m.group(1)
chain = (
    '      # ela JSON-RPC stays on loopback by default — operator widens via the\n'
    "      # ENM dashboard's Settings → Mainchain Advanced → WhiteIPList.\n"
    '      - "127.0.0.1:20336:20336"\n'
)
if mode == '1':
    chain += '      - "20338:20338"\n      - "20339:20339"\n'
else:
    chain += '      - "127.0.0.1:20338:20338"\n      - "127.0.0.1:20339:20339"\n'
chain += (
    '      # ela read-only ports — loopback only.\n'
    '      - "127.0.0.1:20333:20333"\n'
    '      - "127.0.0.1:20334:20334"\n'
    '      - "127.0.0.1:20335:20335"\n'
)
# Insert right after the existing 4180 mapping inside the block.
new_block = re.sub(r'(      - "[^"]*:4180"\n)', r'\1' + chain, block, count=1)
if new_block == block:
    raise SystemExit('could not locate `- "...:4180"` line in enm-server block')
src = src.replace(block.lstrip('\n'), new_block.lstrip('\n'), 1)
with open('docker-compose.yml', 'w') as f:
    f.write(src)
print('chain ports inserted')
PYEOF
        ok "Existing enm-server block patched (BPoS ports: $([ "$EXPOSE_BPOS" = "1" ] && echo public || echo loopback))"
    fi
else
    say "Adding enm-server service to $PC2_DIR/docker-compose.yml..."
    cat >> docker-compose.yml <<COMPOSE

  enm-server:
    image: ${ENM_IMAGE}
    container_name: enm-server
    restart: unless-stopped
    depends_on:
      - pc2
    ports:
      - "${ENM_PORT}:4180"
      # ela JSON-RPC stays on loopback by default — operator widens via the
      # ENM dashboard's Settings → Mainchain Advanced → WhiteIPList.
      - "127.0.0.1:20336:20336"
${BPOS_PORTS}
      # ela read-only ports — loopback only.
      - "127.0.0.1:20333:20333"
      - "127.0.0.1:20334:20334"
      - "127.0.0.1:20335:20335"
    volumes:
      # PC2 session DB + node-config (read-only) — auth resolves Bearer
      # tokens against pc2-node's sessions table and reads the owner wallet
      # from pc2-node's node-config.json. We mount the host's pc2-node/
      # subdir directly (NOT the parent ./data) so the inner path inside
      # the enm-server container is /data/pc2-node/pc2.db — what
      # PC2_NODE_DB_PATH defaults to. Mounting ./data here would shadow
      # the path with a nested ./data/pc2-node/pc2-node/ structure.
      - ./data/pc2-node:/data/pc2-node:ro
      # ENM state — own SQLite DB, ela build cache, audit logs
      - ./enm-data:/data/enm
    environment:
      - NODE_ENV=production
      - PORT=4180
      - ENM_DATA_DIR=/data/enm
      - PC2_NODE_DB_PATH=/data/pc2-node/pc2.db
      - PC2_NODE_CONFIG_PATH=/data/pc2-node/node-config.json
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:4180/api/enm/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
COMPOSE
    ok "enm-server service appended (BPoS ports: $([ "$EXPOSE_BPOS" = "1" ] && echo public || echo loopback))"
fi

mkdir -p "$PC2_DIR/enm-data"

# --- Pull + start -----------------------------------------------------------

# Read the image the compose file ACTUALLY uses for enm-server — operators who
# build locally end up with `image: pc2-local:enm-server` (or similar) which
# isn't on any registry. Skip the pull in that case so the script doesn't die
# trying to fetch a non-existent registry image.
COMPOSE_IMAGE=$(awk '/^  enm-server:/{f=1} f && /^    image:/{print $2; exit}' docker-compose.yml)
if [[ "$COMPOSE_IMAGE" == pc2-local:* || "$COMPOSE_IMAGE" == localhost/* || -z "$COMPOSE_IMAGE" ]]; then
    say "Skipping pull (compose uses local image: ${COMPOSE_IMAGE:-unknown})"
else
    say "Pulling ${COMPOSE_IMAGE}..."
    $COMPOSE pull enm-server
    ok "Image pulled"
fi

say "Starting / recreating enm-server..."
$COMPOSE up -d --force-recreate enm-server
ok "Container started"

# --- Post-up health check ---------------------------------------------------
#
# Container "started" doesn't mean Express is listening. Poll /api/enm/health
# for up to 60s. If the API never comes up, the operator gets logs+remediation
# rather than a green checkmark masking a broken sidecar.
say "Waiting for ENM API to respond..."
HEALTH_URL="http://localhost:${ENM_PORT}/api/enm/health"
HEALTH_OK=0
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 \
       || wget -qO- --tries=1 --timeout=2 "$HEALTH_URL" >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
    sleep 2
done
if [[ "$HEALTH_OK" == "1" ]]; then
    ok "ENM API responding at $HEALTH_URL"
else
    warn "ENM API not responding after 60s — last 30 lines of container logs:"
    $COMPOSE logs --tail=30 enm-server || true
    warn "Investigate with: cd $PC2_DIR && $COMPOSE logs -f enm-server"
    warn "If unrecoverable, run: bash $0 --reset (archives state for clean reinstall)"
fi

# --- UFW --------------------------------------------------------------------

if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    say "UFW is active — opening port $ENM_PORT..."
    sudo ufw allow "$ENM_PORT/tcp" >/dev/null
    ok "Opened $ENM_PORT in UFW"
fi

# --- Result -----------------------------------------------------------------

HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$HOST_IP" ]] && HOST_IP="<server-ip>"

cat <<EOF

${GREEN}\xe2\x95\x94\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x97
\xe2\x95\x91                ENM (chain manager) ready                  \xe2\x95\x91
\xe2\x95\x9a\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x90\xe2\x95\x9d${NC}

  PC2 dashboard:  http://${HOST_IP}:4100
  ENM API:        http://${HOST_IP}:${ENM_PORT}/api/enm/health

  Logs:    cd $PC2_DIR && $COMPOSE logs -f enm-server
  Stop:    cd $PC2_DIR && $COMPOSE stop enm-server
  Update:  cd $PC2_DIR && $COMPOSE pull enm-server && $COMPOSE up -d enm-server
  Reset:   bash $0 --reset    (archive state, force clean reinstall)

Next steps:
  1. Open http://${HOST_IP}:4100 in your browser
  2. Make sure you're logged in (wallet-claim flow on the desktop)
  3. Click the Elastos Node Manager icon in the launcher
  4. Walk the wizard \xe2\x86\x92 "Install ela for me"

EOF
