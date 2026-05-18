# PC2 Node - Personal Cloud Computer
# Self-contained Docker image for sovereign personal computing
#
# Quick Start:
#   curl -fsSL https://ela.city/install.sh | bash
#
# Manual Build:
#   docker build -t ghcr.io/elacity/pc2-node:latest -f pc2-node/Dockerfile .
#
# Manual Run:
#   docker run -d --name pc2 \
#     -p 4200:4200 \
#     -v pc2-data:/app/data \
#     -e PC2_USERNAME=yourname \
#     ghcr.io/elacity/pc2-node:latest
#
# Your node will be accessible at: https://yourname.ela.city
#
# Version: 1.0.0

# ---------------------------------------------------------------------------
# Stage 1: Compile transport binaries (wireguard-go, amneziawg-go, sing-box)
# Runs in parallel with the Node.js builder stage for faster builds.
#
# Go version note (caught 2026-05-18 by docker-smoke CI):
# wireguard-go upstream go.mod now requires Go >= 1.23.1. We pin to 1.24
# to give a small buffer for the next upstream bump without breaking
# rebuilds. If this Dockerfile fails again with "go: go.mod requires go
# >= X" check the wireguard-go and amneziawg-go upstream go.mod files
# and bump accordingly. See CI-HARDENING-A4-D1.md "Bug 1 fix" for context.
# ---------------------------------------------------------------------------
FROM golang:1.24-alpine AS transport-builder

RUN apk add --no-cache git

ARG TARGETARCH=amd64

WORKDIR /build

RUN mkdir -p /binaries

# wireguard-go: userspace WireGuard implementation
RUN git clone --depth 1 https://git.zx2c4.com/wireguard-go && \
    cd wireguard-go && \
    CGO_ENABLED=0 go build -o /binaries/wireguard-go

# amneziawg-go: DPI-resistant WireGuard fork
RUN git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go && \
    cd amneziawg-go && \
    CGO_ENABLED=0 go build -o /binaries/amneziawg-go

# awg-quick: AmneziaWG interface management script
RUN git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-tools && \
    cp amneziawg-tools/src/wg-quick/linux.bash /binaries/awg-quick && \
    sed -i 's|/var/run/wireguard/|/var/run/amneziawg/|g' /binaries/awg-quick && \
    sed -i 's|PROGRAM="${0##*/}"|PROGRAM="awg-quick"|g' /binaries/awg-quick

# sing-box: VLESS Reality transport (pre-built release)
RUN SINGBOX_ARCH=$(if [ "$TARGETARCH" = "amd64" ]; then echo "amd64"; else echo "$TARGETARCH"; fi) && \
    wget -q "https://github.com/SagerNet/sing-box/releases/download/v1.13.0/sing-box-1.13.0-linux-${SINGBOX_ARCH}.tar.gz" -O /tmp/singbox.tar.gz && \
    tar -xzf /tmp/singbox.tar.gz -C /tmp && \
    find /tmp -name "sing-box" -type f -exec cp {} /binaries/sing-box \;

RUN chmod +x /binaries/*

# ---------------------------------------------------------------------------
# Stage 2: Build the Node.js application
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY pc2-node/package*.json ./pc2-node/

# Install dependencies
RUN cd pc2-node && npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN cd pc2-node && npm run build:backend || true

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:20-alpine

# Install runtime dependencies
# - bubblewrap: namespace isolation (multi-user security)
# - tini: proper init system for containers
# - ca-certificates: HTTPS
# - wireguard-tools: wg and wg-quick CLI (C binary, installed via OS package)
# - bash: required by wg-quick and awg-quick scripts
# - iproute2: required by wg-quick for ip link/route management
# - iptables: required by wg-quick for NAT/firewall rules
RUN apk add --no-cache \
    bubblewrap \
    tini \
    ca-certificates \
    wireguard-tools \
    bash \
    iproute2 \
    iptables \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S pc2 && \
    adduser -u 1001 -S pc2 -G pc2

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/pc2-node/node_modules ./node_modules
COPY --from=builder /app/pc2-node/src ./src
COPY --from=builder /app/pc2-node/frontend ./frontend
COPY --from=builder /app/pc2-node/package.json ./
COPY --from=builder /app/pc2-node/tsconfig.json ./

# Copy configuration templates
COPY --from=builder /app/config ./config

# Copy entrypoint script
COPY --from=builder /app/pc2-node/scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Copy pre-built transport binaries into the bundled dir that binary-manager checks first.
# Node.js arch naming: amd64 -> x64, arm64 -> arm64
ARG TARGETARCH=amd64
RUN NODE_ARCH=$(if [ "$TARGETARCH" = "amd64" ]; then echo "x64"; else echo "$TARGETARCH"; fi) && \
    mkdir -p /app/bin/linux-${NODE_ARCH}
COPY --from=transport-builder /binaries/ /tmp/transport-binaries/
RUN NODE_ARCH=$(if [ "$TARGETARCH" = "amd64" ]; then echo "x64"; else echo "$TARGETARCH"; fi) && \
    cp /tmp/transport-binaries/* /app/bin/linux-${NODE_ARCH}/ && \
    rm -rf /tmp/transport-binaries

# Create data directory with proper permissions
RUN mkdir -p /app/data /app/certs && \
    chown -R pc2:pc2 /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=4200
ENV PC2_DATA_DIR=/app/data
ENV PC2_ISOLATION_MODE=namespace
ENV HTTPS_ENABLED=false
ENV PC2_VERSION=1.0.0

# Boson connectivity (super node gateway)
ENV BOSON_GATEWAY_URL=https://demo.ela.city
ENV BOSON_PUBLIC_DOMAIN=ela.city
ENV BOSON_PRIVACY_MODE=false

# Expose ports
# 4200: HTTP/HTTPS
# 4001: IPFS swarm
# 4002: IPFS websocket
EXPOSE 4200 4001 4002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4200/api/health || exit 1

# Use tini as init system with our entrypoint
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]

# Run as non-root user (but we need root for bubblewrap namespaces)
# USER pc2

# Default command (can be overridden)
CMD []
