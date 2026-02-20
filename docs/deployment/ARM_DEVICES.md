# ARM Devices Guide

Run PC2 on Raspberry Pi, Jetson Nano, and other ARM devices.

## Supported Devices

| Device | RAM | Status | Notes |
|--------|-----|--------|-------|
| **Raspberry Pi 5** | 4GB/8GB | ✅ Recommended | Best performance |
| **Raspberry Pi 4** | 4GB/8GB | ✅ Recommended | Great performance |
| Raspberry Pi 4 | 2GB | ⚠️ Works | May need swap |
| **Jetson Nano** | 4GB | ✅ Supported | Good for AI workloads |
| Orange Pi 5 | 4GB+ | ✅ Supported | Community tested |
| Other ARM64 | 4GB+ | ⚠️ May work | Try it! |

**Minimum Requirements:**
- 4GB RAM recommended (2GB minimum with swap)
- 16GB+ SD card or SSD
- Network connection

---

## Raspberry Pi Setup

### Prerequisites

1. Raspberry Pi 4 or 5 with 4GB+ RAM
2. SD card with Raspberry Pi OS (64-bit recommended)
3. Power supply
4. Network connection (Ethernet or WiFi)

### Step 1: Prepare Your Pi

**Option A: Headless Setup (Recommended)**

1. Flash Raspberry Pi OS Lite (64-bit) using Raspberry Pi Imager
2. Enable SSH in Imager settings
3. Configure WiFi in Imager settings
4. Boot the Pi and connect via SSH:
   ```bash
   ssh pi@raspberrypi.local
   # or
   ssh pi@YOUR_PI_IP
   ```

**Option B: Desktop Setup**

1. Flash Raspberry Pi OS (64-bit) with desktop
2. Connect keyboard, mouse, monitor
3. Open Terminal

### Step 2: Install PC2

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

This will:
1. Install Node.js 20
2. Install build tools
3. Clone and build PC2
4. Create systemd service for auto-start

**Installation takes 10-15 minutes on Pi 4/5.**

### Step 3: Access Your PC2

After installation, you'll see:
```
Access your PC2:
   Local:   http://localhost:4200
   Network: http://192.168.1.42:4200
```

Open the Network URL from any device on your local network.

---

## Jetson Nano Setup

### Prerequisites

1. Jetson Nano Developer Kit (4GB)
2. SD card with JetPack OS
3. Power supply (barrel jack recommended for stability)
4. Network connection

### Installation

Same as Raspberry Pi:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

### Notes for Jetson

- GPU is not utilized by PC2 (future feature)
- Works great for AI agent workloads with Ollama
- Use barrel jack power for stability
- **Important:** Use the install script above - it creates a systemd service that keeps PC2 running even when you close SSH. If you run manually (`npm start`), PC2 will stop when you disconnect.

---

## Remote Access

By default, PC2 is only accessible on your local network. To access from anywhere:

### Option A: WireGuard Tunnel (Recommended - Fastest)

WireGuard provides near-localhost performance for home hardware behind NAT. Page loads take ~1.5 seconds instead of minutes.

**One-Time System Setup** (run once as root):

```bash
sudo bash scripts/setup-node.sh
```

This installs WireGuard tools and configures permissions so the PC2 node can manage tunnels automatically.

**Then start your PC2 node:**

```bash
pm2 start ecosystem.config.cjs
# or: sudo systemctl start pc2
```

Open `http://localhost:4200`, complete the setup wizard (choose your username), and your domain is live automatically at `https://username.ela.city` via WireGuard.

**That's it!** No manual tunnel setup needed. The node provisions and activates WireGuard automatically after the setup wizard.

**Verify it's working:**

```bash
# Check WireGuard tunnel status
sudo wg show wg0

# Should show:
#   interface: wg0
#   peer: <server-public-key>
#   endpoint: 69.164.241.210:51820
#   latest handshake: X seconds ago
#   transfer: X received, X sent
```

**Useful commands:**

```bash
sudo wg show wg0                      # Tunnel status
ping 10.100.0.1                       # Test tunnel connectivity
sudo systemctl status pc2-wireguard   # WireGuard service status
pm2 logs pc2                          # Node logs (look for "[WireGuard]")
```

### Option B: Active Proxy (Fallback)

If WireGuard is not available (older kernels, restricted environments), the node automatically falls back to Boson Active Proxy relay. This is slower (serial relay) but works everywhere.

1. Start the node normally
2. Complete the setup wizard
3. The node connects via Active Proxy automatically
4. Access via `https://username.ela.city` (slower page loads)

### Option C: Port Forwarding

1. Log into your router
2. Forward port 4200 to your Pi's local IP
3. Find your public IP: `curl ifconfig.me`
4. Access via `http://YOUR_PUBLIC_IP:4200`

**Note:** Your public IP may change. Consider using a dynamic DNS service.

---

## Performance Optimization

### Use an SSD

SD cards are slow. For better performance:

1. Get a USB 3.0 SSD
2. Flash Raspberry Pi OS to SSD
3. Boot from SSD (Pi 4/5 support this natively)

### Add Swap (For 2GB Pi)

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### Optimize Node.js Memory

Add to systemd service:
```bash
sudo nano /etc/systemd/system/pc2.service
```

Add under `[Service]`:
```
Environment=NODE_OPTIONS="--max-old-space-size=512"
```

Reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart pc2
```

---

## Auto-Start on Boot

The install script creates a systemd service automatically. Verify:

```bash
sudo systemctl status pc2
```

If not enabled:
```bash
sudo systemctl enable pc2
```

---

## Updating PC2

### Manual Update

```bash
cd ~/pc2
git pull origin main
cd pc2-node
npm install
npm run build
sudo systemctl restart pc2
```

### From Web UI

1. Open Settings → About
2. Click "Check for Updates"
3. Click "Install Update" if available

---

## Backup & Restore

### Create Backup

```bash
cd ~/pc2/pc2-node
npm run backup
```

Backups are in `data/backups/`. **Copy to another device!**

### Restore

```bash
npm run restore data/backups/backup-YYYY-MM-DD.tar.gz
sudo systemctl restart pc2
```

---

## Troubleshooting

### PC2 Dies When Closing SSH/Terminal

**Problem:** PC2 stops when you close the terminal or disconnect SSH.

**Cause:** You're running PC2 manually (`npm start`) instead of via systemd service.

**Solution 1: Use Our Official Install Script (Recommended)**

Our install script creates a systemd service that keeps PC2 running:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

**Solution 2: Manually Create systemd Service**

If you already installed manually, create the service:

```bash
sudo tee /etc/systemd/system/pc2.service > /dev/null << EOF
[Unit]
Description=PC2 Personal Cloud Computer
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/pc2.net/pc2-node
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pc2
sudo systemctl start pc2
```

**Solution 3: Use screen (Quick Workaround)**

If you can't use systemd:

```bash
# Install screen
sudo apt-get install screen

# Start a screen session
screen -S pc2

# Run PC2
cd ~/pc2.net/pc2-node && npm start

# Detach from screen: Press Ctrl+A, then D
# Reattach later: screen -r pc2
```

**Solution 4: Use PM2 (Alternative Process Manager)**

```bash
# Install PM2
npm install -g pm2

# Start PC2 with PM2
cd ~/pc2.net/pc2-node
pm2 start npm --name "pc2" -- start

# Save PM2 process list (survives reboot)
pm2 save
pm2 startup  # Follow the command it outputs
```

### Service Won't Start

```bash
# Check status
sudo systemctl status pc2

# Check logs
sudo journalctl -u pc2 -n 50

# Common fix: rebuild
cd ~/pc2/pc2-node
npm run build
sudo systemctl restart pc2
```

### Out of Memory

```bash
# Check memory
free -h

# Add swap if needed (see Performance Optimization)
```

### Can't Access from Network

```bash
# Check IP address
hostname -I

# Check if PC2 is listening
ss -tlnp | grep 4200

# Check firewall
sudo ufw status
sudo ufw allow 4200
```

### Slow Performance

1. Use SSD instead of SD card
2. Add swap if low memory
3. Close other applications
4. Reduce AI model size (use smaller Ollama models)

### Native Module Build Errors

```bash
# Install build dependencies
sudo apt-get install -y build-essential python3

# Rebuild native modules
cd ~/pc2/pc2-node
npm rebuild
```

---

## Hardware Recommendations

### For Raspberry Pi

- **SSD:** Samsung T7 or SanDisk Extreme
- **Case:** Argon ONE M.2 (includes SSD slot)
- **Power:** Official Raspberry Pi power supply

### For Jetson Nano

- **Power:** 5V 4A barrel jack adapter
- **Storage:** NVMe SSD with enclosure
- **Cooling:** Noctua NF-A4x20 fan

---

## Power Consumption

| Device | Idle | Load |
|--------|------|------|
| Raspberry Pi 4 | 3W | 6W |
| Raspberry Pi 5 | 4W | 8W |
| Jetson Nano | 5W | 10W |

Annual cost at $0.12/kWh: ~$5-10

Your personal cloud costs less than a cup of coffee per month to run!
