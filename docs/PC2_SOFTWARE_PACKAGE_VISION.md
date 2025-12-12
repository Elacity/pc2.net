# PC2 Software Package Vision

**Date:** 2025-01-11  
**Context:** Clarification of PC2 as a self-contained software package  
**Status:** Architecture Confirmation

---

## 🎯 Your Understanding (100% Correct!)

> "The whole service is like software? I run the software on my Raspberry Pi or my VPS server or just on my Mac as a software package? I initially add the wallet address that owns it, I can then login with my wallet address and I enter ElastOS which runs all as one package with front + backend and I also have a unique URL when I can access it from anywhere in the world via browser and login with my decentralized identity?"

**YES! This is exactly the vision.** ✅

---

## 📦 PC2 as a Software Package

### What PC2 Is

PC2 is a **self-contained software package** that you install and run on your hardware:

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR HARDWARE                              │
│  (Raspberry Pi / VPS / Mac / Linux Server / etc.)            │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │         PC2 SOFTWARE PACKAGE                            │ │
│  │                                                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  ElastOS Frontend (Puter UI)                     │  │ │
│  │  │  - Served by PC2                                 │  │ │
│  │  │  - Built into package                            │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                         │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  PC2 Backend                                      │  │ │
│  │  │  - API endpoints                                  │  │ │
│  │  │  - IPFS storage                                   │  │ │
│  │  │  - File system                                    │  │ │
│  │  │  - Authentication                                 │  │ │
│  │  │  - Wallet-based identity                          │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                         │ │
│  │  ✅ Single executable/package                          │ │
│  │  ✅ Frontend + Backend together                        │ │
│  │  ✅ No external dependencies                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  🌐 Accessible via: your-pc2.example.com (unique URL)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Installation & Setup Flow

### Step 1: Install PC2 Software

**On Raspberry Pi:**
```bash
# Download PC2 package
wget https://pc2.net/releases/pc2-latest-arm64.deb
sudo dpkg -i pc2-latest-arm64.deb

# Or using Docker
docker pull pc2/pc2-node:latest
docker run -d -p 4200:4200 pc2/pc2-node:latest
```

**On VPS (Ubuntu/Debian):**
```bash
# Same as Raspberry Pi
wget https://pc2.net/releases/pc2-latest-amd64.deb
sudo dpkg -i pc2-latest-amd64.deb
```

**On Mac:**
```bash
# Homebrew
brew install pc2

# Or download .dmg
# Or Docker
docker run -d -p 4200:4200 pc2/pc2-node:latest
```

### Step 2: Initial Setup (One-Time Configuration)

**First Run:**
```bash
pc2 setup
```

**Setup Wizard:**
1. **Enter Owner Wallet Address**
   ```
   Enter the wallet address that owns this PC2 node:
   > 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3
   ```

2. **Configure Network Access**
   ```
   Do you want to make this PC2 accessible from the internet? (y/n)
   > y
   
   Enter your domain (or leave blank for IP access):
   > my-pc2.example.com
   ```

3. **Generate Setup Token**
   ```
   Setup token generated: PC2-SETUP-abc123...
   Keep this token secure - you'll need it for initial authentication.
   ```

4. **Start PC2**
   ```
   Starting PC2 node...
   ✅ PC2 is running on http://localhost:4200
   ✅ Accessible at: https://my-pc2.example.com
   ```

### Step 3: Access from Anywhere

**From Browser:**
1. Navigate to: `https://my-pc2.example.com`
2. **ElastOS UI loads automatically** (no connection step needed!)
3. Click "Connect Wallet"
4. Sign message with MetaMask/wallet
5. **You're in!** ✅

**What You See:**
- ElastOS desktop (Puter UI)
- Your files and folders
- Apps (Terminal, Editor, Viewer, etc.)
- Everything running on YOUR hardware

---

## 🔐 Authentication Flow

### Initial Authentication (First Time)

```
1. User visits: https://my-pc2.example.com
2. ElastOS UI loads (served by PC2)
3. User clicks "Connect Wallet"
4. MetaMask/wallet prompts for signature
5. PC2 verifies signature matches owner wallet
6. PC2 creates session token (7-day expiry)
7. User is authenticated ✅
```

### Subsequent Logins

```
1. User visits: https://my-pc2.example.com
2. ElastOS UI loads
3. PC2 checks for valid session token (cookie/localStorage)
4. If valid → Auto-login ✅
5. If expired → Re-prompt for wallet signature
```

### Multi-Wallet Support (Future)

```
Owner Wallet: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3 (full access)
Guest Wallet: 0x1234...5678 (read-only access)
Guest Wallet: 0xABCD...EFGH (read-write access)
```

---

## 🌐 Unique URL / Domain Access

### How It Works

**Option 1: Custom Domain**
```
1. User owns domain: my-pc2.example.com
2. Point DNS A record to PC2 node's IP
3. PC2 serves HTTPS (Let's Encrypt auto-cert)
4. Access: https://my-pc2.example.com
```

**Option 2: Dynamic DNS**
```
1. PC2 registers with dynamic DNS service
2. Gets subdomain: user123.pc2.net
3. Access: https://user123.pc2.net
```

**Option 3: IP Access (Local Network)**
```
1. PC2 runs on local network
2. Access: http://192.168.1.100:4200
3. (No HTTPS, local only)
```

**Option 4: VPN/Tailscale (Private Network)**
```
1. PC2 on Tailscale network
2. Access: https://my-pc2.tailnet.ts.net
3. (Private, encrypted)
```

### Network Configuration

**PC2 automatically:**
- ✅ Sets up port forwarding (if router supports UPnP)
- ✅ Configures firewall rules
- ✅ Obtains SSL certificate (Let's Encrypt)
- ✅ Sets up reverse proxy (if needed)

---

## 📋 Complete User Journey

### Scenario: User Sets Up PC2 on Raspberry Pi

**Day 1: Installation**
```bash
# 1. Install PC2
ssh pi@raspberrypi.local
wget https://pc2.net/releases/pc2-latest-arm64.deb
sudo dpkg -i pc2-latest-arm64.deb

# 2. Run setup
pc2 setup
# Enter wallet: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3
# Enter domain: my-home-pc2.example.com

# 3. Start PC2
sudo systemctl start pc2
sudo systemctl enable pc2  # Auto-start on boot
```

**Day 1: First Access**
```
1. Open browser: https://my-home-pc2.example.com
2. ElastOS UI loads (served by Raspberry Pi)
3. Click "Connect Wallet"
4. Sign message with MetaMask
5. ✅ Authenticated! See desktop, files, apps
```

**Day 2-7: Daily Use**
```
1. Open browser: https://my-home-pc2.example.com
2. Auto-login (session still valid)
3. Use ElastOS: upload files, edit documents, run apps
4. Everything stored on Raspberry Pi
```

**Day 8: Session Expired**
```
1. Open browser: https://my-home-pc2.example.com
2. Session expired → Re-prompt for wallet signature
3. Sign message → New session created
4. ✅ Continue using ElastOS
```

---

## 🏗️ Technical Architecture

### Package Structure

```
pc2-node/
├── bin/
│   └── pc2                    # CLI executable
├── lib/
│   ├── server.js              # HTTP server
│   ├── static.js              # Static file serving (ElastOS frontend)
│   ├── api/                   # API endpoints
│   ├── storage/               # IPFS integration
│   ├── auth/                  # Wallet authentication
│   └── ...
├── frontend/                  # ElastOS frontend (built)
│   ├── index.html
│   ├── bundle.min.js
│   ├── bundle.min.css
│   └── ...
├── config/
│   └── default.json           # Default configuration
└── package.json
```

### Runtime Behavior

**When PC2 starts:**
1. Loads configuration (`config/default.json`)
2. Initializes IPFS node
3. Starts HTTP server (port 4200)
4. Serves ElastOS frontend at `/`
5. Handles API requests at `/api/*`
6. Listens for wallet authentication

**When user accesses URL:**
1. Browser requests: `https://my-pc2.example.com/`
2. PC2 serves: `frontend/index.html` (ElastOS UI)
3. Browser loads: `bundle.min.js`, `bundle.min.css`
4. ElastOS initializes, detects same-origin API
5. User authenticates with wallet
6. ElastOS makes API calls to same origin (no CORS!)

---

## 🔄 Multi-Node Support

### User Owns Multiple PC2 Nodes

**Home PC2 (Raspberry Pi):**
```
URL: https://home-pc2.example.com
Hardware: Raspberry Pi 4
Location: Home office
Owner: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3
```

**VPS PC2 (Cloud Server):**
```
URL: https://vps-pc2.example.com
Hardware: DigitalOcean Droplet
Location: US East
Owner: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3
```

**Work PC2 (Mac Mini):**
```
URL: https://work-pc2.example.com
Hardware: Mac Mini
Location: Office
Owner: 0x34DAF31B99B5A59cEB18E424Dbc112FA6e5f3Dc3
```

**User Experience:**
- Bookmark each URL
- Access each independently
- Each has its own files, apps, settings
- Same wallet authenticates to all (if owner)

---

## ✅ Key Benefits

### 1. **Self-Contained**
- ✅ One software package
- ✅ No external dependencies
- ✅ Everything included (frontend + backend)

### 2. **Self-Hosted**
- ✅ Run on your hardware
- ✅ Your data stays on your hardware
- ✅ No third-party cloud dependency

### 3. **Decentralized Identity**
- ✅ Wallet-based authentication
- ✅ No usernames/passwords
- ✅ True ownership

### 4. **Global Access**
- ✅ Unique URL
- ✅ Access from anywhere
- ✅ Secure (HTTPS)

### 5. **Full Control**
- ✅ You control the software
- ✅ You control the data
- ✅ You control the hardware

---

## 🎯 Summary

**YES, your understanding is 100% correct!**

PC2 is:
- ✅ A software package you install
- ✅ Runs on your hardware (Raspberry Pi, VPS, Mac, etc.)
- ✅ One-time setup: Enter owner wallet address
- ✅ Login with wallet → Enter ElastOS
- ✅ Frontend + Backend in one package
- ✅ Unique URL to access from anywhere
- ✅ Decentralized identity (wallet-based)

**This is exactly what the CTO envisioned!** 🎉

---

## 📝 Next Steps

1. **Confirm with CTO:** This matches their vision ✅
2. **Implement:** Add static file serving to PC2 node
3. **Package:** Create installable package (deb, dmg, Docker)
4. **Documentation:** User setup guide
5. **Deploy:** Test on Raspberry Pi, VPS, Mac

**Status:** Ready to implement! 🚀

