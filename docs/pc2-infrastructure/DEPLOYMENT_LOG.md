# PC2 Infrastructure Deployment Log

> Chronological record of deployment decisions and actions

## Deployment Summary

**Date**: January 21, 2026
**Target**: InterServer VPS (69.164.241.210)
**Operator**: Sash (Elacity)
**Branch**: `feature/mvp-production-release`

## Phase 1: Boson DHT Super Node

**Completed**: 2026-01-21

### Actions Taken

1. **Created Isolated Directory Structure**
   ```bash
   mkdir -p ~/pc2
   ```
   Rationale: Keep PC2 infrastructure separate from existing Elastos council nodes

2. **Installed OpenJDK 17**
   ```bash
   apt install openjdk-17-jdk-headless
   ```

3. **Configured Firewall**
   ```bash
   ufw allow 39001/udp comment 'PC2 Boson DHT'
   ufw allow 8090/tcp comment 'PC2 Active Proxy'
   ufw allow 25000:30000/tcp comment 'PC2 Port Mapping'
   ```

4. **Cloned Repositories**
   - `bosonnetwork/Boson.Parent`
   - `bosonnetwork/Boson.Dependencies`
   - `bosonnetwork/Boson.Core` (tag: release-v2.0.7)

5. **Built from Source**
   ```bash
   cd Boson.Parent && ./mvnw install -DskipTests -Dgpg.skip=true
   cd Boson.Dependencies && ./mvnw install -DskipTests -Dgpg.skip=true
   cd Boson.Core && ./mvnw package -DskipTests -Dgpg.skip=true
   ```

6. **Deployed Artifacts**
   ```bash
   mkdir -p ~/pc2/boson/{bin,lib,config,data}
   cp Boson.Core/cmds/target/lib/*.jar ~/pc2/boson/lib/
   ```

7. **Created Configuration**
   - File: `/root/pc2/boson/config/default.conf`
   - Bootstrap nodes: 155.138.245.211, 45.32.138.246
   - Port: 39001/UDP

8. **Created Systemd Service**
   - File: `/etc/systemd/system/pc2-boson.service`
   - Auto-start enabled

### Result
- Node ID: `J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E`
- Status: Running
- Elastos nodes: Unaffected

---

## Phase 2: Active Proxy

**Completed**: 2026-01-21

### Actions Taken

1. **Cloned Elastos.Carrier.Java**
   ```bash
   git clone https://github.com/elastos/Elastos.Carrier.Java.git
   ```
   Contains the Active Proxy service (~1,900 lines)

2. **Ported to Boson.Core**
   - Created: `services/active-proxy/` module
   - Updated package names: `elastos.carrier.*` → `io.bosonnetwork.*`
   - Updated service interface: `CarrierService` → `BosonService`

3. **Files Ported**
   | File | Lines | Purpose |
   |------|-------|---------|
   | ActiveProxy.java | 87 | Service entry point |
   | Configuration.java | 111 | Config handling |
   | PacketType.java | 93 | Protocol packets |
   | ProxyConnection.java | 831 | Connection handling |
   | ProxyServer.java | 337 | TCP server |
   | ProxySession.java | 435 | Session management |
   | **Total** | **1,894** | |

4. **Built Active Proxy**
   ```bash
   cd services/active-proxy
   ./mvnw package -DskipTests -Dgpg.skip=true
   ```

5. **Deployed JAR**
   ```bash
   cp target/lib/boson-active-proxy-*.jar ~/pc2/boson/lib/
   ```

6. **Added Vert.x Dependencies**
   ```bash
   curl -O .../vertx-web-client-4.5.0.jar
   curl -O .../vertx-web-common-4.5.0.jar
   curl -O .../vertx-uri-template-4.5.0.jar
   ```

7. **Updated Configuration**
   Added services section to `default.conf`:
   ```json
   "services": [{
     "class": "io.bosonnetwork.service.activeproxy.ActiveProxy",
     "configuration": {
       "host": "69.164.241.210",
       "port": 8090,
       "portMappingRange": "25000-30000"
     }
   }]
   ```

### Result
- Port: 8090/TCP listening
- Port mapping: 25000-30000/TCP
- Status: Running

---

## DNS Configuration

**Completed**: 2026-01-21

### Actions Taken

1. **GoDaddy DNS Records**
   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | @ | 35.205.174.216 | 1 hour |
   | A | * | 69.164.241.210 | 10 min |

2. **Verified Resolution**
   ```bash
   dig demo.ela.city A   # → 69.164.241.210 ✓
   dig test.ela.city A   # → 69.164.241.210 ✓
   dig ela.city A        # → 35.205.174.216 ✓ (website)
   ```

### Result
- Wildcard: All subdomains route to super node
- Root: Preserved for existing website

---

## Phase 4: Web Gateway

**Completed**: 2026-01-21

### Actions Taken

1. **Installed Node.js 20**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install nodejs
   ```

2. **Created Gateway Project**
   ```bash
   mkdir ~/pc2/web-gateway
   cd ~/pc2/web-gateway
   npm init -y
   npm install http-proxy ws
   ```

3. **Implemented Features**
   - Subdomain extraction
   - Username registry (persistent JSON)
   - HTTP/HTTPS servers
   - Proxy forwarding
   - WebSocket support
   - REST API

4. **Added Firewall Rules**
   ```bash
   ufw allow 80/tcp comment 'HTTP'
   ufw allow 443/tcp comment 'HTTPS'
   ```

5. **Generated SSL Certificates**
   ```bash
   certbot certonly --standalone \
     -d demo.ela.city \
     -d test.ela.city \
     -d sash.ela.city
   ```

6. **Created Systemd Service**
   - File: `/etc/systemd/system/pc2-gateway.service`

7. **Created Test Node**
   - File: `/root/pc2/test-node.js`
   - Port: 4200
   - Shows demo HTML page

### Result
- HTTP: Port 80 listening
- HTTPS: Port 443 listening (Let's Encrypt)
- Proxying: Working

---

## Issues Encountered & Solutions

### Issue 1: Maven Parent POM Not Found
**Error**: `Non-resolvable parent POM`
**Solution**: Clone and install `Boson.Parent` first

### Issue 2: Missing Dependencies
**Error**: `dependencies.dependency.version is missing`
**Solution**: Clone and install `Boson.Dependencies`

### Issue 3: Vert.x API Mismatch
**Error**: Compilation errors in main branch
**Solution**: Checkout stable tag `release-v2.0.7`

### Issue 4: Access Control Directories
**Error**: `NoSuchFileException: accesscontrol/defaults`
**Solution**: `mkdir -p data/accesscontrol/{defaults,acls}`

### Issue 5: http-proxy ESM Import
**Error**: `Named export 'createProxyServer' not found`
**Solution**: Use default import:
```javascript
import httpProxy from "http-proxy";
const { createProxyServer } = httpProxy;
```

### Issue 6: Port 80 Blocked
**Error**: Let's Encrypt verification timeout
**Solution**: `ufw allow 80/tcp`

---

## Verification Commands

### Check All Services
```bash
# Boson DHT + Active Proxy
systemctl status pc2-boson
ss -ulnp | grep 39001
ss -tlnp | grep 8090

# Web Gateway
systemctl status pc2-gateway
ss -tlnp | grep -E ':80|:443'

# Test Node
systemctl status pc2-test-node
ss -tlnp | grep 4200

# Elastos Nodes
~/node/node.sh status
```

### Test Proxying
```bash
curl https://demo.ela.city
curl https://test.ela.city
curl -s https://sash.ela.city?status
```

---

## Configuration Files Created

| File | Purpose |
|------|---------|
| `/root/pc2/boson/config/default.conf` | Boson DHT + Active Proxy config |
| `/root/pc2/web-gateway/index.js` | Web Gateway code |
| `/root/pc2/web-gateway/package.json` | Node.js dependencies |
| `/root/pc2/test-node.js` | Demo PC2 node |
| `/etc/systemd/system/pc2-boson.service` | Boson service |
| `/etc/systemd/system/pc2-gateway.service` | Gateway service |
| `/etc/systemd/system/pc2-test-node.service` | Test node service |

---

## Next Steps

1. **Phase 3**: PC2 client integration
   - Identity generation from wallet
   - Automatic registration on startup
   - Active Proxy connectivity

2. **Phase 5**: End-to-end testing
   - Real PC2 node connection
   - NAT traversal verification
   - Load testing

---

*Deployment performed via SSH from Cursor IDE*
