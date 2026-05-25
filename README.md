<h1 align="center">☁️ PC2.NET</h1>
<h3 align="center">Your Sovereign Cloud. Your Hardware. Your Rules.</h3>

<p align="center">
  <strong>A Web3 desktop operating system that runs entirely on YOUR hardware.</strong><br/>
  Login with your blockchain wallet. Own your data. Control your computation.
</p>

<p align="center">
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-the-vision"><strong>Vision</strong></a> ·
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-installation"><strong>Installation</strong></a> ·
  <a href="#-roadmap"><strong>Roadmap</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Node.js-20.x-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/Status-Alpha-orange.svg" alt="Status">
</p>

---

## 🌍 The Vision

**"Stop renting your digital life. Start owning it."**

Every file you upload, every calculation you run, every AI conversation you have—it all lives on someone else's server. You're paying rent for your own digital life. You're trusting strangers with your most private data.

**PC2 changes that.**

PC2 is **the cloud that lives in YOUR house**. Not a subscription. Not a service. **Ownership.**

- 🏠 **Your Hardware** - Runs on Raspberry Pi, Mac, Linux, or VPS
- 🔐 **Your Identity** - Login with your blockchain wallet, no passwords
- 📁 **Your Files** - Stored on IPFS, encrypted with your keys
- 🧮 **Your Computation** - WASM binaries execute on YOUR node, not the browser
- 🌐 **Access Anywhere** - Open any browser, connect your wallet, see your desktop

> **Built on [Puter](https://github.com/HeyPuter/puter)** - The beautiful, Puter-compatible interface you know, with sovereign infrastructure you own.

---

## ⚡ Quick Start

Pick the path that matches your hardware. All three end the same way: open a browser, connect a wallet, your PC2 desktop is live.

### 🖥️ Desktop App — Mac · Windows · Linux

Zero-code install. The **ElastOS Launcher** is a signed, notarised desktop app that handles install, updates, and the first-run wizard for you.

📥 **[Download ElastOS Launcher → docs.ela.city](https://docs.ela.city)**

- **Mac**: `ElastOS-X.Y.Z.dmg` — drag to Applications, open
- **Windows**: `ElastOS.Setup.X.Y.Z.exe` — runs PC2 under WSL2 (the installer will prompt to enable WSL2 if needed)
- **Linux**: `ElastOS-X.Y.Z.AppImage` — `chmod +x` then double-click

> 💡 The Mac build is Apple-notarised, so it opens with no "unidentified developer" warning.

### 🍓 Raspberry Pi (4 / 5) or any headless ARM Linux device

One command. Takes ~15–20 min on a Pi 5:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-arm.sh | bash
```

Installs Node 20, system libraries, WireGuard, builds PC2, and starts it as a background service under PM2 (so it auto-restarts on boot). When it finishes it prints a URL like `http://<your-pi-ip>:4200` — open that in any browser on your network.

### 🐧 Headless Linux x64 (Docker)

One command for any Linux server / VPS / x86 box without a desktop:

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-pc2.sh | bash
```

Installs Docker if needed, pulls the latest PC2 image, and starts it on port 4100. Print-out at the end has the setup token and URL.

---

## ✨ Features

### Core Platform
- ✅ **Beautiful Desktop UI** - Full-featured desktop environment in the browser
- ✅ **Wallet Authentication** - Login with MetaMask, WalletConnect, or social login via Particle Network
- ✅ **IPFS Storage** - Decentralized file storage on your node
- ✅ **Real-time Sync** - WebSocket-powered live updates across tabs and devices
- ✅ **Built-in Apps** - File manager, text editor, image viewer, video player, and more

### Privacy & Sovereignty
- ✅ **Self-Hosted** - Everything runs on YOUR hardware
- ✅ **No External Dependencies** - 100% offline-capable after initial setup
- ✅ **Wallet-Scoped Data** - Each wallet has isolated, encrypted storage
- ✅ **Session Persistence** - Your session survives page refreshes and device switches

### Advanced Capabilities
- ✅ **WASM Execution** - Run WebAssembly binaries directly on your node (not in browser!)
- ✅ **AI Chat Integration** - Local AI via Ollama, or cloud providers (OpenAI, Claude, Gemini, xAI)
- ✅ **Backup & Restore** - One-click backup to external storage, restore to any node
- ✅ **Auto-Update System** - macOS-style one-click updates with progress UI
- ✅ **Access Control** - Wallet-based permissions for multi-user nodes
- ✅ **Extension System** - Add custom functionality via Puter-compatible extensions

---

## 🎯 Why PC2?

| Traditional Cloud | PC2 |
|-------------------|-----|
| ❌ Data stored on company servers | ✅ Data stored on YOUR hardware |
| ❌ Pay monthly subscriptions forever | ✅ Buy hardware once, own forever |
| ❌ Companies can read/scan your files | ✅ Files encrypted with YOUR keys |
| ❌ Can be locked out at any time | ✅ Your keys = your access, always |
| ❌ Computation happens in their cloud | ✅ WASM runs on YOUR node |
| ❌ Identity tied to email/password | ✅ Wallet IS your identity |

### Cost Comparison

| Service | Year 1 | Year 2+ |
|---------|--------|---------|
| Google Drive (2TB) | $120 | $120/year forever |
| Dropbox Plus | $144 | $144/year forever |
| **PC2 (Raspberry Pi)** | **$130** (one-time hardware) | **$24/year** (electricity only) |

**ROI: Break even at 15 months, save $96/year thereafter.**

---

## 🖥️ Installation

> The [Quick Start](#-quick-start) above is the recommended path for most users (desktop app, one-line server install, or one-line Pi install). The section below is for **developers** who want to clone the repo, modify the code, or run PC2 on hardware/configurations the install scripts don't cover yet.

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Linux, macOS, Windows | Linux (Raspberry Pi OS, Ubuntu) |
| **Node.js** | 20.19+ | 22.15+ LTS |
| **RAM** | 2GB | 4GB |
| **Storage** | 10GB | 128GB+ |

### Local Development Setup (Step-by-Step)

This is the recommended way to run PC2 locally for development.

#### Prerequisites

1. **Git**
2. **Node.js 22.15+** (recommended via `nvm`)
3. **npm** (bundled with Node)
4. **Native build tools** (required by native modules such as `better-sqlite3` and `node-datachannel`)
   - macOS: install Xcode Command Line Tools (`xcode-select --install`)
   - Ubuntu/Debian: install `build-essential python3 make g++`
5. **Optional:** `canvas` system dependencies, if you need PDF/text thumbnails

#### 1) Clone repository

```bash
git clone https://github.com/Elacity/pc2.net
cd pc2.net
```

#### 2) Select Node.js version

```bash
# If using nvm
nvm install 22.15.0
nvm use 22.15.0

# Verify
node -v
npm -v
```

#### 3) Install dependencies (root + pc2-node)

```bash
# Root dependencies
npm install

# pc2-node dependencies
cd pc2-node
npm install
cd ..
```

#### 4) Build pc2-node

```bash
cd pc2-node
npm run build
cd ..
```

#### 5) Start PC2 locally

```bash
npm run start:pc2
```

Open: `http://localhost:4200`

#### 6) Development run modes

```bash
# Starts pc2-node (PORT=4200)
npm run dev:pc2

# Backend TS watch mode (from pc2-node/)
cd pc2-node
npm run dev
```

#### Native module troubleshooting

If startup fails with errors like:
- `Cannot find module .../node_datachannel.node`
- `Could not locate the bindings file ... better_sqlite3.node`

rebuild native dependencies using the same Node version you run:

```bash
cd pc2-node
npm rebuild node-datachannel better-sqlite3
```

### Method 2: Docker

```bash
mkdir -p pc2/config pc2/data
docker run -d \
  --name pc2 \
  -p 4202:4202 \
  -v $(pwd)/pc2/config:/etc/pc2 \
  -v $(pwd)/pc2/data:/var/pc2 \
  ghcr.io/elacity/pc2:latest
```

### Method 3: Raspberry Pi

1. Download PC2 OS image (coming soon)
2. Flash to SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
3. Insert SD card and boot
4. Open browser to `http://pc2.local`
5. Connect wallet and done!

---

## 🔧 Configuration

Configuration is stored in `volatile/config/config.json`:

```json
{
  "env": "dev",
  "http_port": 4202,
  "domain": "localhost",
  "pc2_enabled": true
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | 4100 |
| `CONFIG_PATH` | Path to config directory | `./volatile/config` |

---

## 🛣️ Roadmap

### ✅ Phase 1: Foundation (Complete)
- Desktop UI with file operations
- Wallet-based authentication
- IPFS storage integration
- Real-time WebSocket sync

### ✅ Phase 2: Core Platform (Complete)
- SQLite persistence
- Session management
- App ecosystem (viewer, editor, player)
- Backup & restore system

### ✅ Phase 2.6: WASM Integration (Complete)
- WASM runtime service
- Calculator demo app (runs on YOUR node!)
- File processor demo app
- WASI file I/O support

### ✅ Phase 3: Packaging & Distribution (Complete)
- Docker image with multi-platform builds
- First-run setup wizard
- Node identity generation (DID)
- Auto-update system (macOS-style)

### ✅ Phase 4: Network & Security (Complete)
- NAT traversal via Boson Active Proxy
- Super Node infrastructure
- Web gateway with wildcard SSL (*.ela.city)
- Access control (wallet-based permissions)

### 🚧 Phase 5: Production Hardening (In Progress)
- End-to-end testing
- DHT-based username registry
- Super node failover
- Performance optimization

### 📋 Phase 6: dDRM & Marketplace (Future)
- Decentralized Digital Rights Management
- WASMER runtime for encrypted binaries
- P2P content marketplace
- AI agent economy

---

## 🤝 Contributing

We welcome contributions! PC2 is built on [Puter](https://github.com/HeyPuter/puter) and extends it with sovereign, self-hosted capabilities.

```bash
# Fork the repository
git clone https://github.com/YOUR_USERNAME/pc2.net
cd pc2.net

# Create a feature branch
git checkout -b feature/your-feature

# Make changes and commit
git commit -m "Add your feature"

# Push and create a Pull Request
git push origin feature/your-feature
```

---

## 📚 Documentation

- [Strategic Implementation Plan](./docs/STRATEGIC_IMPLEMENTATION_PLAN.md)
- [Architecture Overview](./docs/PC2_ARCHITECTURE_OVERVIEW.md)
- [PC2 Narrative](./docs/PC2_NARRATIVE.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Quick Start](./docs/QUICKSTART.md)
- [Infrastructure Docs](./docs/pc2-infrastructure/)

---

## 🏗️ Built With

- **[Puter](https://github.com/HeyPuter/puter)** - The Internet OS foundation
- **[Particle Network](https://particle.network)** - Web3 wallet authentication
- **[IPFS/Helia](https://github.com/ipfs/helia)** - Decentralized file storage
- **[Wasmer](https://wasmer.io)** - WebAssembly runtime
- **[SQLite](https://sqlite.org)** - Local database
- **[Socket.io](https://socket.io)** - Real-time communication

---

## 🔗 Links

- **Website:** [pc2.net](https://pc2.net) (coming soon)
- **GitHub:** [github.com/Elacity/pc2.net](https://github.com/Elacity/pc2.net)
- **Elastos:** [elastos.info](https://elastos.info)
- **Elacity:** [elacity.io](https://elacity.io)

---

## 📄 License

This project is licensed under [AGPL-3.0](./LICENSE.txt).

Built with ❤️ by the Elacity team for the Elastos ecosystem.

---

<p align="center">
  <strong>"You're not renting your digital life. You're owning it."</strong><br/>
  <em>PC2 - The cloud that lives in your house.</em>
</p>
