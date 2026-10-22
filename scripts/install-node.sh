#!/bin/bash
#
# Ensure a Node.js release with the October 2026 security fixes is the
# `node` on PATH (CVE-2026-111497 Brotli decoder OOB write and friends).
#
# Accepted as already patched: 22.23.4+ on 22.x, 24.22.1+ on 24.x,
# 26.12.1+ on 26.x. Anything else on Linux x64/arm64 gets the
# official nodejs.org build of PC2_NODE_VERSION, checked against
# SHASUMS256.txt, unpacked into /opt (root-owned) and linked into
# /usr/local/bin. NodeSource is not used because its 24.x channel
# lagged behind the security release.
#
# The new binary must run (`node -v`) before anything is linked, so an
# old glibc or an unsupported CPU leaves the existing Node untouched.
# nvm and macOS installs are never modified; the script prints the
# command to run instead.
#
# Exit codes: 0 = patched Node on PATH, 2 = left unchanged (see message).
#
# Rollback: sudo rm /usr/local/bin/{node,npm,npx,corepack}
#
# Usage:
#   bash scripts/install-node.sh
#   PC2_NODE_VERSION=24.22.1 bash scripts/install-node.sh

set -euo pipefail

PC2_NODE_VERSION="${PC2_NODE_VERSION:-24.22.1}"
NODE_DIST_URL="https://nodejs.org/dist/v${PC2_NODE_VERSION}"
LINK_DIR=/usr/local/bin

say()  { echo "   $*"; }
warn() { echo "   ⚠️  $*"; }

# version_ge A B — true when A >= B (dotted numeric versions).
version_ge() {
    [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

node_is_patched() {
    local v="$1" major="${1%%.*}"
    case "$major" in
        22) version_ge "$v" 22.23.4 ;;
        24) version_ge "$v" 24.22.1 ;;
        *)  [ "$major" -ge 26 ] 2>/dev/null && version_ge "$v" 26.12.1 ;;
    esac
}

CURRENT="$(node -v 2>/dev/null | sed 's/^v//' || true)"
if [ -n "$CURRENT" ] && node_is_patched "$CURRENT"; then
    say "Node.js v$CURRENT already has the October 2026 security fixes"
    exit 0
fi
say "Node.js ${CURRENT:+v$CURRENT }needs upgrading to v$PC2_NODE_VERSION"

NODE_PATH_NOW="$(command -v node 2>/dev/null || true)"
if [ "$(uname -s)" != "Linux" ]; then
    warn "Not Linux: install Node.js v$PC2_NODE_VERSION yourself (nodejs.org installer, or: nvm install $PC2_NODE_VERSION)"
    exit 2
fi
case "$NODE_PATH_NOW" in
    */.nvm/*)
        warn "Node is managed by nvm. Run: nvm install $PC2_NODE_VERSION && nvm alias default $PC2_NODE_VERSION && npm install -g pm2"
        exit 2 ;;
esac

case "$(uname -m)" in
    x86_64)  ARCH=x64 ;;
    aarch64) ARCH=arm64 ;;
    *) warn "Node.js 24 has no official build for $(uname -m) (32-bit Pi OS needs a 64-bit OS); leaving Node unchanged"; exit 2 ;;
esac

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif sudo -n true 2>/dev/null || sudo -v; then
    SUDO="sudo"
else
    warn "Need sudo to install into /opt; leaving Node unchanged"
    exit 2
fi

NAME="node-v${PC2_NODE_VERSION}-linux-${ARCH}"
TARGET="/opt/$NAME"

if [ ! -x "$TARGET/bin/node" ]; then
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    say "Downloading $NAME.tar.gz from nodejs.org..."
    curl -fsSL -o "$TMP/$NAME.tar.gz" "$NODE_DIST_URL/$NAME.tar.gz"
    curl -fsSL -o "$TMP/SHASUMS256.txt" "$NODE_DIST_URL/SHASUMS256.txt"
    ACTUAL="$(sha256sum "$TMP/$NAME.tar.gz" | cut -d' ' -f1)"
    if ! grep -qx "$ACTUAL  $NAME.tar.gz" "$TMP/SHASUMS256.txt"; then
        warn "SHA-256 of $NAME.tar.gz does not match nodejs.org SHASUMS256.txt; aborting"
        exit 2
    fi
    say "SHA-256 verified"
    $SUDO tar --no-same-owner -xzf "$TMP/$NAME.tar.gz" -C /opt
    $SUDO chown -R root:root "$TARGET"
fi

if [ "$("$TARGET/bin/node" -v 2>/dev/null)" != "v$PC2_NODE_VERSION" ]; then
    warn "$TARGET/bin/node does not run on this system (glibc too old?); leaving Node unchanged"
    exit 2
fi

# Globals installed with this npm go to /usr/local so `npm i -g pm2`
# lands on PATH instead of inside /opt.
$SUDO "$TARGET/bin/node" "$TARGET/bin/npm" config set prefix /usr/local --location=global >/dev/null

for bin in node npm npx corepack; do
    $SUDO ln -sfn "$TARGET/bin/$bin" "$LINK_DIR/$bin"
done
hash -r

if [ "$(command -v node)" != "$LINK_DIR/node" ]; then
    warn "$LINK_DIR is not ahead of $(dirname "$NODE_PATH_NOW") on PATH; 'node' still resolves to $(command -v node)"
    exit 2
fi
say "✅ Node.js $(node -v) installed ($TARGET); rollback: sudo rm $LINK_DIR/{node,npm,npx,corepack}"
