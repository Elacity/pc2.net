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

### Step 4: Set Up HTTPS

You have two options for HTTPS:

#### Option A: Use *.ela.city Subdomain (Recommended - Zero Config)

The easiest approach is to use a subdomain under `ela.city`. The Super Node provides a **wildcard SSL certificate** for all `*.ela.city` subdomains.

1. **Choose a subdomain** (e.g., `mynode.ela.city`)

2. **Register with the Super Node:**
   ```bash
   curl -X POST https://cloud.ela.city/api/gateway/register \
     -H "Content-Type: application/json" \
     -d '{"subdomain": "mynode", "endpoint": "http://YOUR_SERVER_IP:4200"}'
   ```

3. **Access your node:**
   - `https://mynode.ela.city` - Valid HTTPS, no configuration needed!

**How it works:**
```
User → https://mynode.ela.city → Super Node (SSL termination) → Your PC2 Node
```

The Super Node:
- Handles SSL with Let's Encrypt wildcard certificate
- Routes traffic to your node
- Provides automatic HTTP→HTTPS redirect

#### Option B: Custom Domain (Manual SSL Setup)

If you want to use your own domain:

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

**Important:** The `X-Forwarded-Proto $scheme` header is critical for preventing mixed content errors.

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

---

## Super Node Architecture

The PC2 network uses a Super Node architecture for easy deployment:

```
                    ┌─────────────────────────────────────┐
                    │  Super Node (69.164.241.210)        │
                    │  ├── Web Gateway                    │
                    │  │   └── Wildcard SSL: *.ela.city   │
                    │  └── User Registry                  │
                    └─────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │ alice.ela.city  │   │ bob.ela.city    │   │ test7.ela.city  │
    │ (User Node 1)   │   │ (User Node 2)   │   │ (User Node 3)   │
    └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Wildcard SSL** | All `*.ela.city` subdomains have valid HTTPS |
| **Zero Config** | No Nginx/Certbot setup needed on user nodes |
| **NAT Traversal** | Supports nodes behind firewalls via Active Proxy |
| **Auto Discovery** | Register once, accessible immediately |

### Super Node Endpoints

| Endpoint | Purpose |
|----------|---------|
| `https://cloud.ela.city` | Main Super Node access |
| `https://*.ela.city` | Routes to registered user nodes |

### Registration API

```bash
# Register your node
curl -X POST https://cloud.ela.city/api/gateway/register \
  -H "Content-Type: application/json" \
  -d '{
    "subdomain": "yourname",
    "endpoint": "http://YOUR_IP:4200"
  }'

# Check registration
curl https://cloud.ela.city/api/gateway/status/yourname
```

---

## Local AI Setup (Optional)

PC2 includes integrated local AI support using Ollama and DeepSeek models.

### Quick Setup

1. Open PC2 in browser
2. Go to **Settings → AI**
3. Select model size from dropdown (1.5B to 32B)
4. Click **Install & Download**
5. Wait for installation to complete

### Model Sizes

| Model | Size | RAM Required | Use Case |
|-------|------|--------------|----------|
| DeepSeek R1 1.5B | ~1GB | 4GB | Quick responses |
| DeepSeek R1 7B | ~4.5GB | 8GB | Balanced (default) |
| DeepSeek R1 8B | ~5GB | 10GB | Better quality |
| DeepSeek R1 14B | ~9GB | 16GB | High quality |
| DeepSeek R1 32B | ~20GB | 32GB | Best quality |

### Manual Installation

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull DeepSeek model
ollama pull deepseek-r1:7b

# Verify
ollama list
```
