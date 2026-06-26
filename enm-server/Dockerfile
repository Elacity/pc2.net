# syntax=docker/dockerfile:1.4
#
# enm-server — Elastos Node Manager standalone sidecar.
#
# Runs alongside pc2-node (Elacity PC2). Provides the chain-management API
# used by the ENM frontend that ships in PC2's apps catalog. Bind-mounts:
#   - /data/pc2-node:ro   — read-only access to PC2's session DB + node-config
#                           (auth: resolve Bearer → wallet, owner check)
#   - /data/enm           — ENM's own state (SQLite, ela-build cache, logs)
#
# What's in the image:
#   - Node 20 (matches PC2's runtime)
#   - Toolchain to build ela on first run (git, make, gcc, build-essential,
#     python3, pkg-config, wget, curl, ca-certificates)
#   - Diagnostics tools (iproute2, procps, lsof) for HostConflictScanner
#
# What's NOT in the image:
#   - The Go toolchain. EnmAutoBuilder downloads the official portable Go
#     release into /data/enm/cache/go-* on first ela build (no system Go).
#   - The `ela` binary. Built on demand by the operator via the wizard.

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        git make tar gzip wget curl ca-certificates \
        python3 build-essential pkg-config \
        iproute2 procps lsof \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund --omit=dev

COPY src ./src

# Persistent state lives under /data/enm. PC2's session DB is mounted
# read-only at /data/pc2-node by docker-compose.
VOLUME ["/data/enm"]

# 4180 = ENM HTTP API + frontend's fetch target. Must be reachable from
# the operator's browser when they have the PC2 desktop open.
EXPOSE 4180

ENV NODE_ENV=production
ENV PORT=4180
ENV ENM_DATA_DIR=/data/enm
ENV PC2_NODE_DB_PATH=/data/pc2-node/pc2.db
ENV PC2_NODE_CONFIG_PATH=/data/pc2-node/node-config.json

CMD ["node", "src/server.js"]
