# ElastOS PC2 - Personal Cloud Compute
# Secure, decentralized personal cloud node
#
# This Dockerfile creates a self-contained PC2 node that users can
# deploy on their personal hardware or VPS.

FROM node:20-alpine

# Labels
LABEL org.opencontainers.image.title="ElastOS PC2"
LABEL org.opencontainers.image.description="Personal Cloud Compute - Your decentralized personal cloud"
LABEL org.opencontainers.image.vendor="Elacity"
LABEL org.opencontainers.image.source="https://github.com/elastos/pc2"
LABEL org.opencontainers.image.licenses="AGPL-3.0"

# Install required system packages
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    curl \
    bash \
    openssl

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -S pc2 && adduser -S pc2 -G pc2

# Copy package files first for better caching
COPY package*.json ./
COPY src/backend/package*.json ./src/backend/
COPY src/gui/package*.json ./src/gui/

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the GUI
RUN npm run build

# Create directories for persistent data
RUN mkdir -p /data/storage /data/db /data/ipfs /data/config \
    && chown -R pc2:pc2 /data /app

# Environment variables
ENV NODE_ENV=production
ENV PC2_DATA_DIR=/data
ENV PC2_STORAGE_DIR=/data/storage
ENV PC2_DB_DIR=/data/db
ENV PC2_IPFS_DIR=/data/ipfs
ENV PC2_CONFIG_DIR=/data/config
ENV PC2_PORT=4100
ENV PC2_WS_PORT=4200

# Expose ports
# 4100 - HTTP/HTTPS (Web interface)
# 4200 - WebSocket (Secure tunnel)
# 5001 - IPFS API (internal)
# 4001 - IPFS Swarm (P2P)
EXPOSE 4100 4200 5001 4001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:4100/api/health || exit 1

# Volume for persistent data
VOLUME ["/data"]

# Switch to non-root user
USER pc2

# Entrypoint script
COPY --chown=pc2:pc2 docker/pc2/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start"]

