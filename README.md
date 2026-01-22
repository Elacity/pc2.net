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

### From Source (Recommended for Developers)

```bash
# Clone the repository
git clone https://github.com/Elacity/pc2.net
cd pc2.net

# Install dependencies
npm install

# Start the server
npm start
```

**→ Open your browser at `http://localhost:4202`**

### Docker

```bash
docker run -p 4202:4202 ghcr.io/elacity/pc2:latest
```

### Raspberry Pi Image (Coming Soon)

Download the pre-built image, flash to SD card, and boot.

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

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Linux, macOS, Windows | Linux (Raspberry Pi OS, Ubuntu) |
| **Node.js** | 20.x | 23.x |
| **RAM** | 2GB | 4GB |
| **Storage** | 10GB | 128GB+ |

### Method 1: Development Setup

```bash
# Clone and install
git clone https://github.com/Elacity/pc2.net
cd pc2.net
npm install

# Build the frontend (if needed)
cd src/gui && npm run build && cd ../..

# Start
npm start
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
