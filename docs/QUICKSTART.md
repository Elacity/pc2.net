# PC2 Quick Start Guide

> Your sovereign personal cloud in minutes.

## Choose Your Path

| Path | Time | Best For |
|------|------|----------|
| [Local Testing](#local-testing) | 2 min | Trying PC2 on your computer |
| [VPS Deployment](#vps-deployment) | 15 min | Always-on cloud server |
| [ARM Devices](#arm-devices) | 20 min | Raspberry Pi, Jetson Nano |

---

## Local Testing

**Perfect for:** Developers, curious users, quick evaluation

### Prerequisites
- Node.js 20+ ([download](https://nodejs.org/))
- Git

### One-Liner Start

```bash
git clone https://github.com/Elacity/pc2.net.git && cd pc2.net && npm run start:local
```

### What Happens

1. Dependencies install (first run only)
2. PC2 builds (first run only)
3. Server starts on `http://localhost:4200`

### Next Steps

1. Open `http://localhost:4200` in your browser
2. Login with your wallet (MetaMask, WalletConnect, etc.)
3. Start using your personal cloud!

### Useful Commands

```bash
# Stop PC2
Ctrl+C

# Restart
npm run start:local

# Development mode (hot reload)
cd pc2-node && npm run dev
```

---

## VPS Deployment

**Perfect for:** Always-on access, production use

### Recommended VPS Providers

| Provider | Price | RAM | Link |
|----------|-------|-----|------|
| Contabo | $5.99/mo | 4GB | [contabo.com](https://contabo.com) |
| DigitalOcean | $6/mo | 1GB | [digitalocean.com](https://digitalocean.com) |
| Vultr | $6/mo | 1GB | [vultr.com](https://vultr.com) |
| Hetzner | €4.15/mo | 2GB | [hetzner.com](https://hetzner.com) |

**Requirements:** Ubuntu 22.04, 2GB RAM, 20GB disk

### Step 1: Connect to Your VPS

```bash
ssh root@your-server-ip
```

### Step 2: Install PC2 (Docker)

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-pc2.sh | bash
```

### Step 3: Access Your PC2

Open in browser: `http://your-server-ip:4100`

### Step 4: (Optional) Set Up Domain

Register a username for `username.ela.city` access:

1. Open Settings → PC2
2. Enter a username
3. Click "Register"

Now accessible at: `https://username.ela.city`

### Useful Commands

```bash
# View logs
cd ~/pc2 && docker compose logs -f

# Stop PC2
docker compose down

# Restart PC2
docker compose restart

# Update PC2
docker compose pull && docker compose up -d
```

---

## ARM Devices

**Perfect for:** Raspberry Pi 4/5, Jetson Nano, home servers

### Prerequisites

- Raspberry Pi 4/5 (4GB+ RAM) or Jetson Nano
- Raspberry Pi OS or Ubuntu 22.04
- Internet connection

### One-Liner Install

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

### What Gets Installed

1. Node.js 20
2. Build tools
3. PC2 from source
4. systemd service for auto-start

### Access Your PC2

```
Local:   http://localhost:4200
Network: http://192.168.x.x:4200  (shown after install)
```

### Enable Remote Access

For access outside your home network:

1. Open Settings → PC2
2. Enable "Active Proxy"
3. Register a username
4. Access via `https://username.ela.city`

### Useful Commands

```bash
# View logs
sudo journalctl -u pc2 -f

# Stop PC2
sudo systemctl stop pc2

# Start PC2
sudo systemctl start pc2

# Restart PC2
sudo systemctl restart pc2

# Check status
sudo systemctl status pc2
```

---

## After Setup

### First Login

1. Click "Login with Wallet"
2. Connect MetaMask, WalletConnect, or 50+ other methods
3. You're now the **owner** of this PC2 node

### Explore Features

- **Files:** Upload, organize, and access your files
- **AI Assistant:** Chat with AI (Settings → AI to configure)
- **Apps:** Run web apps in your personal cloud
- **Settings:** Customize your experience

### Get Help

- **GitHub:** [github.com/Elacity/pc2.net/issues](https://github.com/Elacity/pc2.net/issues)
- **Documentation:** [docs.ela.city](https://docs.ela.city)

---

## Troubleshooting

### "Port 4200 already in use"

```bash
# Find and kill the process
lsof -ti:4200 | xargs kill -9
```

### "Node.js version too old"

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

### "Build failed"

```bash
# Clean and rebuild
cd pc2-node
npm run clean
npm run build
```

### "Can't access from other devices"

1. Check firewall: `sudo ufw allow 4200`
2. Use your local IP, not `localhost`
3. For remote access, enable Active Proxy in Settings

---

## Updates

PC2 checks for updates automatically. When available:

1. Go to Settings → About
2. Click "Install Update"
3. PC2 restarts with new version

Your data is **always safe** during updates.
