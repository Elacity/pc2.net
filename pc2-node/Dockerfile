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

# Production image
FROM node:20-alpine

# Install runtime dependencies
# - bubblewrap: Required for namespace isolation (multi-user security)
# - tini: Proper init system for containers
# - ca-certificates: For HTTPS
RUN apk add --no-cache \
    bubblewrap \
    tini \
    ca-certificates \
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
