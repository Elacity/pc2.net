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
3. Install Go 1.24+, AmneziaWG, and sing-box 1.13.0 (for stealth transports)
4. Clone and build PC2
5. Start PC2 with PM2 (auto-starts on boot)

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

### Power Mode Optimization (Automatic)

Jetson Orin Nano supports multiple power modes. The install script automatically detects and optimizes this:

| Mode | CPU Max | GPU Max | Use Case |
|------|---------|---------|----------|
| 7W | 729 MHz | 306 MHz | Battery/thermal constrained |
| **15W** | 1497 MHz | 612 MHz | Default on some JetPack versions |
| **25W** | 1728 MHz | 918 MHz | **Recommended for PC2** (auto-set by install script) |
| MAXN_SUPER | Max | Max | No power cap (runs hotter) |

The install script will:
1. Detect the current power mode via `nvpmodel`
2. Switch to **25W** if running at a lower setting (15W or 7W)
3. Run `jetson_clocks` to lock CPU/GPU at maximum frequencies
4. Make the clock settings persistent across reboots

To check or change manually:
```bash
sudo nvpmodel -q                    # Check current mode
sudo nvpmodel -m 1 && sudo jetson_clocks   # Switch to 25W
sudo nvpmodel -m 2 && sudo jetson_clocks   # Switch to MAXN_SUPER (max perf, more heat)
```

### Notes for Jetson

- GPU acceleration available for Ollama AI models (CUDA auto-detected)
- Works great for AI agent workloads with local LLMs
- Use barrel jack power for stability (especially at 25W mode)
- PC2 runs via PM2 process manager -- survives SSH disconnect and reboots automatically
- Voice AI tools (Whisper STT + Piper TTS) are **opt-in** on Jetson — install via Settings > AI > Voice AI
- Voice AI uses ~500MB+ GPU memory; on 8GB Jetson this may prevent larger Ollama models from loading
- For best AI performance on Jetson, close desktop environment (Firefox, GNOME) to free GPU memory
- **AmneziaWG + sing-box** are auto-installed for stealth transport support (Go 1.24+ is installed automatically if system Go is too old)
- **sing-box 1.13.0+** is required for VLESS Reality — the install script auto-detects and upgrades older versions

### Running install-arm.sh with sudo

The install script correctly handles being run via `sudo`:
- Detects `$SUDO_USER` and installs to the real user's home directory (not `/root`)
- PM2 processes run under the real user's context
- If a previous `sudo` run created a rogue `/root/pc2.net`, the script auto-cleans it up

**Important:** Always run as `sudo bash scripts/install-arm.sh` (not `sudo su` first). The script needs `$SUDO_USER` to resolve the correct home directory.

---

## macOS Desktop Setup

PC2 also runs on macOS (Intel and Apple Silicon). The install script handles everything automatically.

### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash
```

This will:
1. Install Homebrew (if not already installed)
2. Install Node.js 20, PM2, build tools
3. Install WireGuard tools (`wireguard-tools` via Homebrew)
4. Configure passwordless sudo for `wg-quick` (required for PM2 background process)
5. Clone and build PC2
6. Start PC2 with PM2

### WireGuard on macOS

macOS uses the native `utun` driver for WireGuard (no kernel module needed). The install script:
- Installs `wireguard-tools` via Homebrew
- Configures `/etc/sudoers.d/wireguard` for passwordless `wg-quick` (PM2 runs non-interactively)
- Network change detection handles laptop mobility (detects gateway changes, triggers reconnect)

### Notes for macOS

- Works on both Intel and Apple Silicon Macs
- PC2 runs via PM2 — survives terminal close
- WireGuard enables remote access via your `username.ela.city` domain
- When laptop sleeps or changes WiFi network, WireGuard auto-reconnects
- Your node is accessible while the laptop is on; goes offline when closed (expected)

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

### Automatic Fallback (Four-Tier Cascade)

PC2 uses a four-tier transport cascade that automatically finds the best connection:

1. **WireGuard** (primary) — fastest, audited, works on most networks
2. **AmneziaWG** (UDP stealth) — DPI-resistant WireGuard fork, for censored networks (China GFW, Russia, Iran)
3. **VLESS Reality + AWG** (TCP stealth) — wraps AWG inside a VLESS Reality tunnel that looks like HTTPS to microsoft.com, for networks blocking all UDP
4. **ActiveProxy** (relay) — TCP relay via Boson supernode, works everywhere

If WireGuard fails (3 consecutive health check failures), the node tries AmneziaWG. If all UDP is blocked, it chains AWG through VLESS Reality over TCP. As a last resort, it falls to ActiveProxy. The system periodically retries higher-tier transports in the background.

For users behind DPI firewalls, enable **Stealth Mode** in Settings → Personal Cloud to skip standard WireGuard entirely. Enable the **VLESS Reality** sub-toggle to force TCP stealth mode. See [STEALTH_MODE.md](STEALTH_MODE.md) and [TRANSPORT_ARCHITECTURE.md](TRANSPORT_ARCHITECTURE.md) for details.

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
export PC2_BRANCH=feature/virtual-workspaces
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash

# Or switch an existing install to a branch
cd ~/pc2.net
git fetch origin
git checkout feature/virtual-workspaces
git pull origin feature/virtual-workspaces
npm run build:pc2
pm2 restart pc2
```

**Note:** Use `export` to set the branch variable -- putting it inline before `curl` only sets it for `curl`, not for the `bash` that runs the script.

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
