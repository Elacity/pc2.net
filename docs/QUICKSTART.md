# PC2 Quick Start Guide

**Get your sovereign cloud running in under 5 minutes.**

---

## 🚀 Option 1: From Source (Developers)

### Prerequisites
- Node.js 20+ (23+ recommended)
- npm or yarn
- Git

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Elacity/pc2.net
cd pc2.net

# 2. Install dependencies
npm install

# 3. Initialize submodules (for Particle Auth)
git submodule update --init --recursive

# 4. Build Particle Auth (optional, for wallet login)
npm run build:particle-auth

# 5. Start the server
npm start
```

### Access

Open your browser to: **http://localhost:4202**

You should see the PC2 desktop. Click "Connect Wallet" to login!

---

## 🐳 Option 2: Docker

### Quick Run

```bash
# Create directories for persistent storage
mkdir -p pc2/config pc2/data

# Run PC2 container
docker run -d \
  --name pc2 \
  -p 4202:4202 \
  -v $(pwd)/pc2/config:/etc/pc2 \
  -v $(pwd)/pc2/data:/var/pc2 \
  ghcr.io/elacity/pc2:latest
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  pc2:
    image: ghcr.io/elacity/pc2:latest
    ports:
      - "4202:4202"
    volumes:
      - ./pc2/config:/etc/pc2
      - ./pc2/data:/var/pc2
    restart: unless-stopped
```

Then run:
```bash
docker compose up -d
```

---

## 🍓 Option 3: Raspberry Pi

### Hardware Requirements
- Raspberry Pi 4 (4GB) or Pi 5
- 64GB+ microSD card
- Power supply (3A recommended)
- Ethernet cable (or WiFi)

### Installation

1. **Download PC2 OS Image** (coming soon)
   ```
   https://pc2.net/downloads/pc2-raspberrypi.img.gz
   ```

2. **Flash to SD Card**
   - Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
   - Select "Use custom" and choose the PC2 image
   - Flash to your SD card

3. **Boot and Configure**
   - Insert SD card into Pi
   - Connect to network (Ethernet recommended)
   - Plug in power
   - Wait 2-3 minutes for first boot

4. **Access Your Cloud**
   - Open browser to `http://pc2.local` or check your router for the Pi's IP
   - Connect your wallet
   - Done!

---

## ☁️ Option 4: VPS Deployment

### Recommended Providers
- DigitalOcean: $12/month (4GB RAM, 80GB SSD)
- Linode: $12/month
- Hetzner: €4.51/month (Europe)
- Vultr: $12/month
- Contabo: €5.99/month (great value)

### Setup

```bash
# 1. Create VPS with Ubuntu 22.04

# 2. SSH into your server
ssh root@your-server-ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Clone and install PC2
git clone https://github.com/Elacity/pc2.net
cd pc2.net
npm install

# 5. Start with PM2 (for production)
npm install -g pm2
pm2 start npm --name pc2 -- start
pm2 save
pm2 startup
```

### Configure HTTPS

#### Option A: *.ela.city Subdomain (Easiest - Recommended!)

Get instant HTTPS without any certificate setup:

```bash
# Register your node with the Super Node
curl -X POST https://cloud.ela.city/api/gateway/register \
  -H "Content-Type: application/json" \
  -d '{"subdomain": "yourname", "endpoint": "http://YOUR_SERVER_IP:4200"}'
```

Now access your node at: **https://yourname.ela.city** ✅

The Super Node handles SSL automatically with a wildcard certificate.

#### Option B: Custom Domain (Manual SSL)

```bash
# Install Caddy for HTTPS
sudo apt install -y caddy

# Configure reverse proxy
echo 'your-domain.com {
  reverse_proxy localhost:4202
}' | sudo tee /etc/caddy/Caddyfile

sudo systemctl reload caddy
```

---

## 🔑 Wallet Login Setup

PC2 uses Particle Network for wallet authentication.

### Supported Wallets
- MetaMask
- WalletConnect
- Coinbase Wallet
- Social Login (Google, Twitter, Email)

### First Login

1. Click "Connect Wallet" on the login screen
2. Choose your wallet type
3. Approve the connection
4. Sign the authentication message
5. You're in!

Your session persists across page refreshes and devices.

---

## 🧪 Testing Your Installation

### Checklist

- [ ] **Desktop loads** - You see the PC2 desktop UI
- [ ] **Wallet login works** - Can connect and authenticate
- [ ] **Files persist** - Upload a file, refresh, file is still there
- [ ] **Apps work** - Open File Manager, Text Editor, Image Viewer
- [ ] **Real-time updates** - Delete a file, it disappears immediately

### WASM Demo (Proof of Private Computation)

1. Open the Calculator app from the desktop
2. Perform a calculation (e.g., 5 + 3)
3. Check the server terminal - you'll see the calculation happening on YOUR node!

This proves that computation runs on YOUR hardware, not in the browser or cloud.

---

## ⚙️ Configuration

### Config File Location

Development: `volatile/config/config.json`

### Basic Configuration

```json
{
  "env": "dev",
  "http_port": 4202,
  "domain": "localhost",
  "pc2_enabled": true
}
```

### Common Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `http_port` | Server port | `auto` (4100) |
| `domain` | Domain name | `puter.localhost` |
| `env` | Environment | `dev` |
| `pc2_enabled` | Enable PC2 extensions | `false` |

---

## 🆘 Troubleshooting

### "Cannot connect to server"

```bash
# Check if server is running
lsof -i :4202

# Restart server
npm start
```

### "Wallet login fails"

1. Ensure Particle Auth is built: `npm run build:particle-auth`
2. Check browser console for errors
3. Try a different wallet (MetaMask recommended)

### "Files not persisting"

1. Check SQLite database exists: `ls volatile/runtime/`
2. Verify user directory: `ls volatile/runtime/users/`
3. Check server logs for errors

### "WASM apps not working"

1. Ensure WASM files exist: `ls pc2-node/test-fresh-install/data/wasm-apps/`
2. Check server logs for WASM errors
3. Verify Node.js version: `node --version` (need 20+)

---

## 📞 Support

- **Issues:** [github.com/Elacity/pc2.net/issues](https://github.com/Elacity/pc2.net/issues)
- **Docs:** [github.com/Elacity/pc2.net/docs](https://github.com/Elacity/pc2.net/tree/main/docs)
- **Community:** Elastos Discord / Telegram

---

## 🎯 Next Steps

After installation:

1. **Explore the desktop** - Try all the built-in apps
2. **Upload files** - Test IPFS storage
3. **Try the WASM Calculator** - See private computation in action
4. **Check AI Chat** - If you have Ollama running locally
5. **Backup your data** - Go to Settings → PC2 → Create Backup

---

**Welcome to your sovereign cloud!** 🏠☁️
