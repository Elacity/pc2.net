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
1. Install Node.js 20, PM2, build tools
2. Install WireGuard (kernel module on Pi, wireguard-go on Jetson)
3. Clone and build PC2
4. Start PC2 with PM2 (auto-starts on boot)

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

## Jetson Orin Nano Setup

### Prerequisites

1. Jetson Orin Nano Developer Kit (8GB)
2. SD card / NVMe with JetPack OS
3. Power supply (barrel jack recommended for stability)
4. Network connection

### Installation

Same one-liner as Raspberry Pi:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

### WireGuard on Jetson (Automatic)

NVIDIA Jetson ships a custom kernel that **does not include the WireGuard kernel module**. The install script handles this automatically:

1. Detects Jetson via `/etc/nv_tegra_release`
2. Installs `wireguard-tools` (wg, wg-quick)
3. Attempts to load kernel module -- **fails** on Jetson (expected)
4. Automatically installs `wireguard-go` (userspace WireGuard) -- builds from source with Go
5. Configures `SETENV` sudoers rule so the PC2 node can pass `WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go` through `sudo -E`

**No kernel rebuild required.** wireguard-go provides good performance (150-300 Mbps on ARM, ~2ms extra latency). For home internet (10-50 Mbps upload), this is indistinguishable from kernel WireGuard.

For maximum performance, power users can optionally build the kernel module:
https://docs.kinesis.network/blog/enable-wireguard-on-nvidia-jetson

### Notes for Jetson

- GPU acceleration available for Ollama AI models (CUDA auto-detected)
- Works great for AI agent workloads with local LLMs
- Use barrel jack power for stability
- PC2 runs via PM2 process manager -- survives SSH disconnect and reboots automatically
- Voice AI tools (Whisper STT + Piper TTS) are auto-installed on Jetson

---

## Remote Access

The install script sets up WireGuard automatically. No separate steps needed.

### How It Works

After running `install-arm.sh`, WireGuard is already installed and configured. When you complete the setup wizard and choose your domain name:

1. PC2 detects WireGuard is available (kernel module on Pi, wireguard-go on Jetson)
2. Provisions a tunnel to the supernode (gets assigned a 10.100.x.x IP)
3. Registers your domain with the gateway
4. Your node is live at `https://yourname.ela.city` -- page loads ~1.5 seconds from anywhere

**This is fully automatic. No manual WireGuard commands needed.**

### Verify it's working

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
pm2 logs pc2                          # Node logs (look for "[WireGuard]")
```

### Automatic Fallback

If WireGuard is blocked (e.g. restrictive network, DPI firewall) or fails (3 consecutive health check failures), the node automatically falls back to Boson Active Proxy relay. This is slower (TCP relay) but works everywhere, including networks that block VPN traffic. No user action needed -- the `ConnectivityService` handles failover transparently.

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

The install script configures PM2 to start on boot automatically. Verify:

```bash
pm2 status
```

If PC2 doesn't start after reboot:
```bash
cd ~/pc2.net
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # follow the command it outputs
```

---

## Updating PC2

### Manual Update

```bash
cd ~/pc2.net
git pull origin main
cd pc2-node
npm install --legacy-peer-deps
cd .. && npm run build:pc2
pm2 restart pc2
```

### Testing a Development Branch

To install or switch to a specific branch (e.g. for testing pre-release features):

```bash
# Fresh install with a specific branch
PC2_BRANCH=feature/virtual-workspaces curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash

# Or switch an existing install to a branch
cd ~/pc2.net
git fetch origin
git checkout feature/virtual-workspaces
git pull origin feature/virtual-workspaces
npm run build:pc2
pm2 restart pc2
```

### From Web UI

1. Open Settings → About
2. Click "Check for Updates"
3. Click "Install Update" if available

---

## Backup & Restore

### Create Backup

```bash
cd ~/pc2.net/pc2-node
npm run backup
```

Backups are in `data/backups/`. **Copy to another device!**

### Restore

```bash
npm run restore data/backups/backup-YYYY-MM-DD.tar.gz
pm2 restart pc2
```

---

## Troubleshooting

### PC2 Dies When Closing SSH/Terminal

**Problem:** PC2 stops when you close the terminal or disconnect SSH.

**Cause:** You're running PC2 manually (`npm start`) instead of via PM2.

**Solution 1: Use Our Official Install Script (Recommended)**

Our install script sets up PM2 with auto-start on boot:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

**Solution 2: Set Up PM2 Manually**

If you already installed manually:

```bash
# Install PM2
npm install -g pm2

# Start PC2 with PM2
cd ~/pc2.net
pm2 start ecosystem.config.cjs

# Save process list and enable boot startup
pm2 save
pm2 startup  # follow the sudo command it outputs
```

**Solution 3: Use screen (Quick Workaround)**

If you can't use PM2:

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
# Check PM2 status
pm2 status

# Check logs
pm2 logs pc2 --lines 50

# Common fix: rebuild
cd ~/pc2.net
npm run build:pc2
pm2 restart pc2
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
cd ~/pc2.net/pc2-node
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
