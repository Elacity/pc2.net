# PC2 Node Deployment Guide

This guide covers deploying PC2 Node to a VPS or cloud server for multi-user access.

## Quick Start (Docker)

### Prerequisites
- Linux VPS (Ubuntu 22.04+ recommended)
- Docker installed
- Domain name pointing to your server (for HTTPS)

### 1. Clone and Build

```bash
git clone https://github.com/elastos/pc2.net.git
cd pc2.net/pc2-node
docker build -t elastos/pc2-node -f Dockerfile ..
```

### 2. Run with Docker Compose

```bash
# Basic (HTTP only - development)
docker-compose up -d

# Production with HTTPS
DOMAIN=your-domain.com \
LETSENCRYPT_EMAIL=you@email.com \
HTTPS_ENABLED=true \
docker-compose up -d
```

### 3. Access Your Node

- HTTP: `http://your-server-ip:4200`
- HTTPS: `https://your-domain.com`

---

## Production Deployment (VPS)

### Step 1: Server Setup (Ubuntu/Debian)

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install bubblewrap (for namespace isolation)
apt install -y bubblewrap

# Verify bubblewrap
bwrap --version
```

### Step 2: Configure Firewall

```bash
# Allow required ports
ufw allow 22      # SSH
ufw allow 80      # HTTP (for Let's Encrypt)
ufw allow 443     # HTTPS
ufw allow 4200    # PC2 (if not using reverse proxy)
ufw enable
```

### Step 3: Deploy PC2

```bash
# Create deployment directory
mkdir -p /opt/pc2
cd /opt/pc2

# Clone repository
git clone https://github.com/elastos/pc2.net.git .

# Build Docker image
cd pc2-node
docker build -t elastos/pc2-node -f Dockerfile ..

# Create data volume
docker volume create pc2-data

# Run with production settings
docker run -d \
  --name pc2-node \
  --restart unless-stopped \
  -p 4200:4200 \
  -v pc2-data:/app/data \
  --security-opt seccomp=unconfined \
  --cap-add SYS_ADMIN \
  --cap-add NET_ADMIN \
  -e PC2_ISOLATION_MODE=namespace \
  elastos/pc2-node
```

### Step 4: Set Up HTTPS (Nginx Reverse Proxy)

```bash
# Install Nginx and Certbot
apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
cat > /etc/nginx/sites-available/pc2 << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/pc2 /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d your-domain.com
```

---

## Configuration

### Terminal Isolation Modes

Edit `/app/data/config/pc2.json` inside the container or mount a config file:

```json
{
  "terminal": {
    "isolation_mode": "namespace",
    "allow_insecure_fallback": false,
    "max_terminals_per_user": 3,
    "idle_timeout_minutes": 15
  }
}
```

| Mode | Description | Use Case |
|------|-------------|----------|
| `namespace` | Linux namespace isolation | Multi-user servers (default for production) |
| `none` | Direct shell access | Single-user personal nodes |
| `disabled` | Terminal disabled | High-security environments |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4200 | HTTP port |
| `PC2_DATA_DIR` | /app/data | Data directory path |
| `PC2_ISOLATION_MODE` | namespace | Terminal isolation mode |
| `HTTPS_ENABLED` | false | Enable built-in HTTPS |
| `DOMAIN` | - | Domain for HTTPS |
| `LETSENCRYPT_EMAIL` | - | Email for Let's Encrypt |

---

## Monitoring

### Health Check

```bash
curl http://localhost:4200/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "0.1.0",
  "uptime": 3600,
  "database": "connected",
  "ipfs": "available",
  "websocket": "active",
  "terminal": {
    "status": "available",
    "isolationMode": "namespace"
  }
}
```

### View Logs

```bash
docker logs -f pc2-node
```

### Terminal Status

```bash
curl http://localhost:4200/api/terminal/status
```

---

## Security Checklist

Before going live:

- [ ] **HTTPS configured** - Required for Particle Auth
- [ ] **Terminal isolation** - Set to `namespace` for multi-user
- [ ] **Firewall configured** - Only expose necessary ports
- [ ] **Updates applied** - Latest security patches
- [ ] **Backups configured** - Regular data backups
- [ ] **Monitoring** - Health check and logging enabled

---

## Troubleshooting

### Terminal not working

1. Check if bubblewrap is installed:
   ```bash
   docker exec pc2-node bwrap --version
   ```

2. Check terminal status:
   ```bash
   curl http://localhost:4200/api/terminal/status
   ```

3. View logs:
   ```bash
   docker logs pc2-node | grep -i terminal
   ```

### WebSocket connection issues

1. Ensure Nginx is configured for WebSocket upgrades
2. Check browser console for connection errors
3. Verify firewall allows WebSocket connections

### Permission denied errors

The container needs special capabilities for namespace isolation:
```bash
docker run ... --security-opt seccomp=unconfined --cap-add SYS_ADMIN ...
```

---

## Recommended VPS Providers

| Provider | Min Specs | Cost | Notes |
|----------|-----------|------|-------|
| InterServer | 1 vCPU, 2GB RAM | ~$6/mo | Good value |
| DigitalOcean | 1 vCPU, 2GB RAM | ~$12/mo | Easy setup |
| Hetzner | 2 vCPU, 4GB RAM | ~$5/mo | EU-based |
| Vultr | 1 vCPU, 2GB RAM | ~$10/mo | Global locations |

**Minimum Requirements:**
- 1 vCPU
- 2GB RAM
- 20GB SSD
- Linux (Ubuntu 22.04+ recommended)
