# PC2 Network Specification: Decentralized Access & Self-Updating

**Version:** 1.0  
**Date:** 2025-01-18  
**Status:** Design Specification

---

## 🎯 Vision

A PC2 node should:
1. **Start with one command** - zero configuration required
2. **Get a URL automatically** - accessible from anywhere
3. **Be truly decentralized** - no single point of failure
4. **Update itself** - through its own UI
5. **Be free forever** - no subscriptions, no accounts

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PC2 NETWORK ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        USER'S DEVICE                             │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                     PC2 NODE                             │    │    │
│  │  │                                                          │    │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │    │
│  │  │  │ Express  │  │   Tor    │  │  P2P     │              │    │    │
│  │  │  │ Server   │  │ Service  │  │ Discovery│              │    │    │
│  │  │  │ :4200    │  │ (hidden) │  │ (DHT)    │              │    │    │
│  │  │  └──────────┘  └──────────┘  └──────────┘              │    │    │
│  │  │                                                          │    │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │    │
│  │  │  │ Update   │  │ Gateway  │  │ Identity │              │    │    │
│  │  │  │ Manager  │  │ Client   │  │ (DID)    │              │    │    │
│  │  │  └──────────┘  └──────────┘  └──────────┘              │    │    │
│  │  │                                                          │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                      │
│                                    │ P2P + Tor                            │
│                                    ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      ACCESS METHODS                              │    │
│  │                                                                   │    │
│  │  1. LOCAL         http://localhost:4200                          │    │
│  │                                                                   │    │
│  │  2. TOR (P2P)     http://abc123...xyz.onion                      │    │
│  │                   └─ Fully decentralized, no servers             │    │
│  │                                                                   │    │
│  │  3. GATEWAY       https://abc123.pc2.network                     │    │
│  │                   └─ Federated, multiple operators               │    │
│  │                                                                   │    │
│  │  4. CUSTOM        https://mycloud.mydomain.com                   │    │
│  │                   └─ User's own domain                           │    │
│  │                                                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🧅 Part 1: Tor Hidden Service (Fully Decentralized)

### How It Works

When PC2 starts, it automatically:
1. Starts an embedded Tor process
2. Creates a hidden service pointing to port 4200
3. Generates a persistent `.onion` address
4. Stores the keys in `data/tor/`

### Implementation

```typescript
// src/services/tor/TorService.ts

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

export class TorService {
  private torProcess: ChildProcess | null = null;
  private onionAddress: string | null = null;
  private torDir: string;
  private hiddenServiceDir: string;

  constructor(dataDir: string) {
    this.torDir = path.join(dataDir, 'tor');
    this.hiddenServiceDir = path.join(this.torDir, 'hidden_service');
  }

  async start(localPort: number = 4200): Promise<string> {
    // Ensure directories exist
    if (!existsSync(this.torDir)) {
      mkdirSync(this.torDir, { recursive: true });
    }

    // Write torrc configuration
    const torrc = `
DataDirectory ${this.torDir}
HiddenServiceDir ${this.hiddenServiceDir}
HiddenServicePort 80 127.0.0.1:${localPort}
SocksPort 0
    `.trim();

    const torrcPath = path.join(this.torDir, 'torrc');
    writeFileSync(torrcPath, torrc);

    // Start Tor process
    this.torProcess = spawn('tor', ['-f', torrcPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for Tor to be ready and read onion address
    await this.waitForReady();
    
    const hostnamePath = path.join(this.hiddenServiceDir, 'hostname');
    this.onionAddress = readFileSync(hostnamePath, 'utf-8').trim();
    
    return this.onionAddress;
  }

  getOnionAddress(): string | null {
    return this.onionAddress;
  }

  async stop(): Promise<void> {
    if (this.torProcess) {
      this.torProcess.kill();
      this.torProcess = null;
    }
  }
}
```

### Tor Binary Distribution

For each platform, we include a pre-built Tor binary:

```
pc2-node/
├── bin/
│   ├── tor-linux-x64
│   ├── tor-linux-arm64      # Raspberry Pi
│   ├── tor-darwin-x64
│   ├── tor-darwin-arm64     # Apple Silicon
│   └── tor-win-x64.exe
```

**Size:** ~10-15MB per platform (can be downloaded on first run to keep initial package small)

---

## 🌐 Part 2: Federated Gateway Network

### Gateway Architecture

Gateways are simple HTTPS→Tor bridges. Anyone can run one.

```
┌─────────────────────────────────────────────────────────────────┐
│                     GATEWAY SERVER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Browser Request                                                  │
│  https://abc123.pc2.network/files                                │
│           │                                                       │
│           ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  1. Extract node ID from subdomain (abc123)             │    │
│  │  2. Look up .onion address in registry                  │    │
│  │  3. Proxy request to abc123...xyz.onion via Tor         │    │
│  │  4. Return response with HTTPS                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Gateway Server Implementation

```typescript
// gateway-server/src/index.ts

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { SocksProxyAgent } from 'socks-proxy-agent';

const app = express();
const registry = new NodeRegistry(); // Stores nodeId → onionAddress mapping

// Wildcard subdomain routing
app.use('*', async (req, res, next) => {
  const host = req.hostname; // e.g., "abc123.pc2.network"
  const nodeId = host.split('.')[0];
  
  // Look up the onion address
  const onionAddress = await registry.getOnionAddress(nodeId);
  if (!onionAddress) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  // Proxy through Tor
  const torAgent = new SocksProxyAgent('socks5h://127.0.0.1:9050');
  const proxy = createProxyMiddleware({
    target: `http://${onionAddress}`,
    agent: torAgent,
    changeOrigin: true,
  });
  
  return proxy(req, res, next);
});

app.listen(443);
```

### Gateway Federation

Multiple gateways can exist:
- `*.pc2.network` (Elacity-operated, default)
- `*.gateway.elacity.com` (Elacity backup)
- `*.pc2gateway.community.org` (Community-operated)
- Anyone can run their own!

**Node Registration:**
```typescript
// PC2 Node registers with all known gateways
async function registerWithGateways() {
  const gateways = [
    'https://registry.pc2.network',
    'https://registry.gateway.elacity.com',
    // Community gateways discovered via DHT
  ];
  
  for (const gateway of gateways) {
    await fetch(`${gateway}/register`, {
      method: 'POST',
      body: JSON.stringify({
        nodeId: this.nodeId,
        onionAddress: this.onionAddress,
        publicKey: this.publicKey,
        version: this.version,
      })
    });
  }
}
```

---

## 🔄 Part 3: Self-Updating System

### Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PC2 SELF-UPDATE FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. CHECK FOR UPDATES (automatic, every 24h or manual)           │
│     └─ Fetch from: https://releases.pc2.network/latest.json     │
│     └─ Or via DHT for decentralized discovery                   │
│                                                                   │
│  2. NOTIFY USER (in PC2 desktop UI)                              │
│     ┌─────────────────────────────────────────────────────┐     │
│     │  🔔 PC2 Update Available                            │     │
│     │  Version 1.2.0 → 1.3.0                              │     │
│     │  [View Changes] [Update Now] [Later]                │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                   │
│  3. DOWNLOAD UPDATE                                               │
│     └─ Download to: ~/Downloads/pc2-update-1.3.0.tar.gz         │
│     └─ Verify signature (signed by Elacity key)                 │
│     └─ Show progress in PC2 UI                                  │
│                                                                   │
│  4. APPLY UPDATE                                                  │
│     └─ Extract to temp directory                                │
│     └─ Run migration scripts if needed                          │
│     └─ Swap binaries                                            │
│     └─ Restart PC2 service                                      │
│                                                                   │
│  5. VERIFY                                                        │
│     └─ Health check after restart                               │
│     └─ Rollback if failed                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Update Manager Implementation

```typescript
// src/services/updates/UpdateManager.ts

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  changelog: string;
  downloadUrl: string;
  signature: string;
  size: number;
  checksum: string;
}

export class UpdateManager {
  private currentVersion: string;
  private updateSources: string[] = [
    'https://releases.pc2.network',
    'https://github.com/puter/pc2.net/releases',
    // IPFS gateway for decentralized distribution
    'https://ipfs.io/ipns/releases.pc2.network',
  ];

  async checkForUpdates(): Promise<UpdateInfo | null> {
    for (const source of this.updateSources) {
      try {
        const response = await fetch(`${source}/latest.json`);
        const latest: UpdateInfo = await response.json();
        
        if (this.isNewerVersion(latest.version)) {
          return latest;
        }
        return null;
      } catch (e) {
        // Try next source
        continue;
      }
    }
    return null;
  }

  async downloadUpdate(update: UpdateInfo, onProgress: (pct: number) => void): Promise<string> {
    // Download to user's Downloads folder (visible in PC2 UI)
    const downloadPath = path.join(this.userDataDir, 'Downloads', `pc2-update-${update.version}.tar.gz`);
    
    const response = await fetch(update.downloadUrl);
    const reader = response.body.getReader();
    const writer = createWriteStream(downloadPath);
    
    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
      downloaded += value.length;
      onProgress(downloaded / update.size * 100);
    }
    
    // Verify checksum
    const hash = await this.computeChecksum(downloadPath);
    if (hash !== update.checksum) {
      throw new Error('Checksum mismatch - download corrupted');
    }
    
    // Verify signature
    const valid = await this.verifySignature(downloadPath, update.signature);
    if (!valid) {
      throw new Error('Signature verification failed');
    }
    
    return downloadPath;
  }

  async applyUpdate(updatePath: string): Promise<void> {
    // 1. Extract update
    const extractDir = path.join(this.tempDir, 'update');
    await tar.extract({ file: updatePath, cwd: extractDir });
    
    // 2. Run pre-update migrations
    const migrationScript = path.join(extractDir, 'migrations', 'pre-update.js');
    if (existsSync(migrationScript)) {
      await import(migrationScript);
    }
    
    // 3. Backup current version
    const backupDir = path.join(this.dataDir, 'backups', `v${this.currentVersion}`);
    await this.backupCurrentVersion(backupDir);
    
    // 4. Copy new files
    await this.copyNewFiles(extractDir);
    
    // 5. Run post-update migrations
    const postMigration = path.join(extractDir, 'migrations', 'post-update.js');
    if (existsSync(postMigration)) {
      await import(postMigration);
    }
    
    // 6. Restart service
    await this.restartService();
  }

  private async restartService(): Promise<void> {
    // Signal the process manager to restart
    // This depends on how PC2 is run (systemd, pm2, etc.)
    
    if (process.env.PM2_HOME) {
      // Running under PM2
      exec('pm2 restart pc2');
    } else if (existsSync('/run/systemd/system')) {
      // Running under systemd
      exec('systemctl restart pc2');
    } else {
      // Direct execution - spawn new process and exit
      spawn(process.argv[0], process.argv.slice(1), {
        detached: true,
        stdio: 'ignore'
      }).unref();
      process.exit(0);
    }
  }
}
```

### Update UI in PC2 Desktop

```typescript
// src/gui/src/UI/UIUpdateNotification.js

export function showUpdateNotification(updateInfo) {
  const notification = document.createElement('div');
  notification.className = 'pc2-update-notification';
  notification.innerHTML = `
    <div class="update-icon">🔄</div>
    <div class="update-content">
      <h4>PC2 Update Available</h4>
      <p>Version ${updateInfo.version} is ready to install</p>
      <div class="update-changelog">${updateInfo.changelog}</div>
    </div>
    <div class="update-actions">
      <button class="update-btn primary" onclick="pc2.applyUpdate()">
        Update Now
      </button>
      <button class="update-btn secondary" onclick="pc2.dismissUpdate()">
        Later
      </button>
    </div>
  `;
  
  document.body.appendChild(notification);
}
```

### Settings Panel for Updates

In the PC2 Settings app:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ PC2 Settings                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📦 System                                                        │
│  ├─ Current Version: 1.2.0                                       │
│  ├─ Node ID: abc123def456                                        │
│  └─ Uptime: 14 days, 3 hours                                     │
│                                                                   │
│  🔄 Updates                                                       │
│  ├─ Auto-check for updates: [✓]                                  │
│  ├─ Auto-install updates: [ ]                                    │
│  ├─ Update channel: [Stable ▼]                                   │
│  │   └─ Stable / Beta / Nightly                                  │
│  └─ [Check Now]                                                  │
│                                                                   │
│  🌐 Network Access                                                │
│  ├─ Local: http://localhost:4200                                 │
│  ├─ Tor: http://abc123...xyz.onion                               │
│  ├─ Gateway: https://abc123.pc2.network                          │
│  └─ Custom Domain: [Configure...]                                │
│                                                                   │
│  🔐 Security                                                      │
│  ├─ Require wallet signature for updates: [✓]                   │
│  └─ Trusted update signers: [Manage...]                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Part 4: Security Considerations

### Update Signing

All updates are signed with Elacity's key:

```typescript
// Update packages are signed
{
  "version": "1.3.0",
  "checksum": "sha256:abc123...",
  "signature": "0x1234...abcd",  // Signed by Elacity's Ethereum key
  "signerAddress": "0xElacityOfficial..."
}

// Verification
const message = `PC2 Update v${version} checksum:${checksum}`;
const recoveredAddress = ethers.verifyMessage(message, signature);
if (recoveredAddress !== ELACITY_SIGNER_ADDRESS) {
  throw new Error('Invalid signature');
}
```

### Optional: User-Controlled Updates

For maximum sovereignty, users can:
1. Disable auto-updates entirely
2. Require their own wallet signature to apply updates
3. Add additional trusted signers
4. Build from source and self-sign

---

## 📦 Part 5: Distribution Channels

### Update Sources (Federated)

| Source | Type | Notes |
|--------|------|-------|
| `releases.pc2.network` | HTTPS | Primary, Elacity-operated |
| `github.com/puter/pc2.net/releases` | HTTPS | Backup, GitHub-hosted |
| `ipfs.io/ipns/releases.pc2.network` | IPFS | Decentralized mirror |
| DHT announcement | P2P | Fully decentralized discovery |

### Release Artifacts

```
pc2-v1.3.0/
├── pc2-linux-x64.tar.gz
├── pc2-linux-arm64.tar.gz      # Raspberry Pi
├── pc2-darwin-x64.tar.gz
├── pc2-darwin-arm64.tar.gz     # Apple Silicon
├── pc2-win-x64.zip
├── checksums.txt
├── checksums.txt.sig           # Signed checksums
└── latest.json                 # Version metadata
```

---

## 🚀 Part 6: User Experience

### First Run

```bash
$ pc2 start

   ____   ____ ____  
  |  _ \ / ___|___ \ 
  | |_) | |     __) |
  |  __/| |___ / __/ 
  |_|    \____|_____|
  
  Personal Cloud 2 - Your Sovereign Cloud
  
✓ Starting PC2 Node...
✓ Database initialized
✓ Starting Tor hidden service...
✓ Tor ready: abc123...xyz.onion
✓ Registering with gateways...
✓ Gateway ready: https://abc123.pc2.network

🚀 PC2 is running!

📍 Access your cloud:
   Local:   http://localhost:4200
   Tor:     http://abc123xyz789def.onion
   Web:     https://abc123.pc2.network

💡 Tip: Customize your URL with: pc2 config set subdomain mycloud
```

### Subsequent Runs

```bash
$ pc2 start

🚀 PC2 is running!

📍 Your cloud: https://mycloud.pc2.network
   (or http://localhost:4200)

🔔 Update available: v1.3.0 → Open PC2 to install
```

---

## 📋 Implementation Roadmap

### Phase 1: Tor Integration (1-2 weeks)
- [ ] Embed Tor binaries for all platforms
- [ ] TorService implementation
- [ ] Auto-start hidden service
- [ ] Persist onion address

### Phase 2: Gateway Network (2-3 weeks)
- [ ] Gateway server implementation
- [ ] Node registry service
- [ ] Subdomain registration API
- [ ] Deploy initial gateways

### Phase 3: Self-Update System (1-2 weeks)
- [ ] UpdateManager implementation
- [ ] Update notification UI
- [ ] Signature verification
- [ ] Settings panel

### Phase 4: Polish (1 week)
- [ ] First-run experience
- [ ] CLI commands
- [ ] Documentation
- [ ] Testing on all platforms

---

## 🎯 Success Criteria

A user should be able to:
1. Download PC2 (single file/installer)
2. Run `pc2 start`
3. Get a URL immediately (no signup, no config)
4. Access from any browser, anywhere
5. Receive and install updates through PC2 UI
6. Never touch a config file unless they want to customize

---

**End of Specification**
