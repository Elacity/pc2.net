# PC2 Super Node Operator Guide

> Deploy a PC2 Boson Super Node alongside your existing Elastos infrastructure

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start-experienced-operators)
4. [Step-by-Step Installation](#step-by-step-installation)
5. [Configuration Reference](#configuration-reference)
6. [Joining the Network](#joining-the-network)
7. [Monitoring and Maintenance](#monitoring-and-maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Updating](#updating)

---

## Introduction

### What is a PC2 Super Node?

A PC2 Super Node is a publicly accessible node that provides core infrastructure services for the PC2 (Personal Cloud Computer) network. It runs two main components:

1. **Boson DHT Node**: A Kademlia-based Distributed Hash Table that stores and resolves decentralized identities, enabling peer discovery without central servers.

2. **Active Proxy**: A NAT traversal service that allows PC2 nodes behind firewalls to be reachable from the internet through encrypted relay connections.

### Role in the Network

```
┌─────────────────────────────────────────────────────────────────┐
│                     PC2 Network Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐         ┌──────────────┐                     │
│   │ Super Node 1 │◄───────►│ Super Node 2 │  (DHT Mesh)         │
│   │ (Your Node)  │         │              │                     │
│   └──────┬───────┘         └──────────────┘                     │
│          │                                                       │
│          │ Active Proxy                                          │
│          ▼                                                       │
│   ┌──────────────┐         ┌──────────────┐                     │
│   │  PC2 Node A  │         │  PC2 Node B  │  (Behind NAT)       │
│   │  (Alice)     │         │  (Bob)       │                     │
│   └──────────────┘         └──────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Super Nodes:
- Maintain the DHT network for identity resolution
- Relay traffic for nodes that can't accept direct connections
- Provide bootstrap points for new nodes joining the network
- Enable `username.ela.city` subdomain routing (with Web Gateway)

### Benefits of Running a Super Node

- **Decentralization**: More super nodes = more resilient network
- **Performance**: Geographically distributed nodes improve latency
- **Ecosystem Support**: Help build the Elastos/PC2 infrastructure
- **Council Alignment**: Complements your existing Elastos council role

---

## Prerequisites

### Hardware Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 50 GB SSD | 100+ GB NVMe |
| Network | 100 Mbps | 1 Gbps |

**Note**: If you're already running Elastos council nodes (ela, esc, eid, etc.), your existing hardware is more than sufficient.

### Operating System

- Ubuntu 22.04 LTS or 24.04 LTS (recommended)
- Other Linux distributions may work but are not officially tested

### Network Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 39001 | UDP | Boson DHT (peer discovery) |
| 8090 | TCP | Active Proxy (client connections) |
| 25000-30000 | TCP | Port mapping range (relayed connections) |

**Important**: You need a public IPv4 address. The node must be directly accessible from the internet on these ports.

### Software Requirements

- OpenJDK 17 or later
- Git
- UFW (or equivalent firewall)

---

## Quick Start (Experienced Operators)

For operators who want to get running quickly:

```bash
# 1. Create isolated directory (won't affect existing Elastos nodes)
mkdir -p ~/pc2 && cd ~/pc2

# 2. Install Java 17 if not present
sudo apt update && sudo apt install -y openjdk-17-jdk-headless git

# 3. Clone repositories
git clone https://github.com/bosonnetwork/Boson.Parent.git
git clone https://github.com/bosonnetwork/Boson.Dependencies.git
git clone https://github.com/bosonnetwork/Boson.Core.git
cd Boson.Core && git checkout release-v2.0.7 && cd ..

# 4. Build (install parent and dependencies first)
cd Boson.Parent && ./mvnw install -DskipTests -Dgpg.skip=true && cd ..
cd Boson.Dependencies && ./mvnw install -DskipTests -Dgpg.skip=true && cd ..
cd Boson.Core && ./mvnw package -DskipTests -Dgpg.skip=true && cd ..

# 5. Deploy
mkdir -p ~/pc2/boson/{bin,lib,config,data/accesscontrol/defaults,data/accesscontrol/acls}
cp Boson.Core/cmds/target/lib/*.jar ~/pc2/boson/lib/

# 6. Clone and build Active Proxy (if not included in Boson.Core)
# See Step-by-Step section for Active Proxy setup

# 7. Create config (replace YOUR_IP with your public IP)
cat > ~/pc2/boson/config/default.conf << 'EOF'
{
  "ipv4": true,
  "ipv6": false,
  "address4": "YOUR_PUBLIC_IP",
  "port": 39001,
  "dataDir": "/root/pc2/boson/data",
  "bootstraps": [
    {"id": "HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ", "address": "155.138.245.211", "port": 39001},
    {"id": "6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ", "address": "45.32.138.246", "port": 39001},
    {"id": "J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E", "address": "69.164.241.210", "port": 39001}
  ],
  "services": [
    {
      "class": "io.bosonnetwork.service.activeproxy.ActiveProxy",
      "configuration": {
        "host": "YOUR_PUBLIC_IP",
        "port": 8090,
        "portMappingRange": "25000-30000"
      }
    }
  ]
}
EOF

# 8. Open firewall ports
sudo ufw allow 39001/udp comment 'PC2 Boson DHT'
sudo ufw allow 8090/tcp comment 'PC2 Active Proxy'
sudo ufw allow 25000:30000/tcp comment 'PC2 Port Mapping'

# 9. Start the node
java -cp "~/pc2/boson/lib/*" -Dio.bosonnetwork.environment=production \
  io.bosonnetwork.launcher.Main -c ~/pc2/boson/config/default.conf
```

---

## Step-by-Step Installation

### Step 1: Create Isolated Directory Structure

To avoid any conflicts with your existing Elastos nodes:

```bash
mkdir -p ~/pc2
cd ~/pc2
```

All PC2 components will live in this directory, completely separate from your `~/.elastos/` or `~/node/` directories.

### Step 2: Install Java 17

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk-headless

# Verify installation
java -version
# Should show: openjdk version "17.x.x"
```

### Step 3: Configure Firewall

```bash
# Add rules for PC2 ports
sudo ufw allow 39001/udp comment 'PC2 Boson DHT'
sudo ufw allow 8090/tcp comment 'PC2 Active Proxy'
sudo ufw allow 25000:30000/tcp comment 'PC2 Port Mapping'

# Verify rules
sudo ufw status verbose
```

### Step 4: Clone and Build Boson.Core

```bash
cd ~/pc2

# Clone required repositories
git clone https://github.com/bosonnetwork/Boson.Parent.git
git clone https://github.com/bosonnetwork/Boson.Dependencies.git
git clone https://github.com/bosonnetwork/Boson.Core.git

# Checkout stable release
cd Boson.Core
git checkout release-v2.0.7
cd ..

# Build parent POM first
cd Boson.Parent
./mvnw install -DskipTests -Dgpg.skip=true
cd ..

# Build dependencies
cd Boson.Dependencies
./mvnw install -DskipTests -Dgpg.skip=true
cd ..

# Build Boson.Core
cd Boson.Core
./mvnw package -DskipTests -Dgpg.skip=true
cd ..
```

### Step 5: Clone and Build Active Proxy

The Active Proxy is ported from Elastos.Carrier.Java and integrated into Boson.Core:

```bash
cd ~/pc2

# Clone the Carrier repository (contains Active Proxy source)
git clone https://github.com/elastos/Elastos.Carrier.Java.git

# The Active Proxy module needs to be built and integrated
# For the latest pre-built version, contact the PC2 team
```

**Note**: The Active Proxy service is available in the flagship super node. Contact the PC2 team for the latest `boson-active-proxy-*.jar` if building from source is problematic.

### Step 6: Deploy Binaries

```bash
# Create deployment directory
mkdir -p ~/pc2/boson/{bin,lib,config,data}
mkdir -p ~/pc2/boson/data/accesscontrol/{defaults,acls}

# Copy JAR files
cp ~/pc2/Boson.Core/cmds/target/lib/*.jar ~/pc2/boson/lib/

# If you have the Active Proxy JAR:
cp boson-active-proxy-*.jar ~/pc2/boson/lib/

# Download Vert.x web dependencies (required for Active Proxy)
cd ~/pc2/boson/lib
curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-web-client/4.5.0/vertx-web-client-4.5.0.jar
curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-web-common/4.5.0/vertx-web-common-4.5.0.jar
curl -sLO https://repo1.maven.org/maven2/io/vertx/vertx-uri-template/4.5.0/vertx-uri-template-4.5.0.jar
```

### Step 7: Create Configuration File

Create `~/pc2/boson/config/default.conf`:

```json
{
  "ipv4": true,
  "ipv6": false,
  "address4": "YOUR_PUBLIC_IP_HERE",
  "port": 39001,
  "dataDir": "/home/YOUR_USER/pc2/boson/data",

  "bootstraps": [
    {
      "id": "HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ",
      "address": "155.138.245.211",
      "port": 39001
    },
    {
      "id": "6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ",
      "address": "45.32.138.246",
      "port": 39001
    },
    {
      "id": "J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E",
      "address": "69.164.241.210",
      "port": 39001
    }
  ],

  "services": [
    {
      "class": "io.bosonnetwork.service.activeproxy.ActiveProxy",
      "configuration": {
        "host": "YOUR_PUBLIC_IP_HERE",
        "port": 8090,
        "portMappingRange": "25000-30000"
      }
    }
  ]
}
```

**Replace**:
- `YOUR_PUBLIC_IP_HERE` with your server's public IPv4 address
- `YOUR_USER` with your username (or use absolute path)

### Step 8: Create Systemd Service

Create `/etc/systemd/system/pc2-boson.service`:

```ini
[Unit]
Description=PC2 Boson DHT Super Node
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pc2/boson
ExecStart=/usr/bin/java -cp "/root/pc2/boson/lib/*" -Dio.bosonnetwork.environment=production io.bosonnetwork.launcher.Main -c /root/pc2/boson/config/default.conf
Restart=always
RestartSec=10
StandardOutput=append:/root/pc2/boson/data/boson.log
StandardError=append:/root/pc2/boson/data/boson.log

[Install]
WantedBy=multi-user.target
```

**Note**: Adjust paths if running as non-root user.

### Step 9: Start and Enable Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Start the service
sudo systemctl start pc2-boson

# Enable on boot
sudo systemctl enable pc2-boson

# Check status
sudo systemctl status pc2-boson
```

---

## Configuration Reference

### default.conf Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ipv4` | boolean | true | Enable IPv4 |
| `ipv6` | boolean | false | Enable IPv6 |
| `address4` | string | - | Your public IPv4 address |
| `address6` | string | - | Your public IPv6 address (if ipv6=true) |
| `port` | integer | 39001 | DHT UDP port |
| `dataDir` | string | - | Directory for node data and logs |
| `bootstraps` | array | - | List of bootstrap nodes to connect to |
| `services` | array | - | List of services to load |

### Bootstrap Nodes

Current active bootstrap nodes:

| Node ID | Address | Port | Operator |
|---------|---------|------|----------|
| `HZXXs9LTfNQjrDKvvexRhuMk8TTJhYCfrHwaj3jUzuhZ` | 155.138.245.211 | 39001 | Boson Network |
| `6o6LkHgLyD5sYyW9iN5LNRYnUoX29jiYauQ5cDjhCpWQ` | 45.32.138.246 | 39001 | Boson Network |
| `J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E` | 69.164.241.210 | 39001 | Elacity (Flagship) |

### Active Proxy Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | 0.0.0.0 | Bind address |
| `port` | integer | 8090 | TCP port for client connections |
| `portMappingRange` | string | 25000-30000 | Port range for relayed connections |

---

## Joining the Network

### Announcing Your Node

Once your node is running, it will automatically:
1. Connect to bootstrap nodes
2. Join the DHT network
3. Start accepting connections

Your node ID is generated on first run and stored in `dataDir/node.db`.

### Viewing Your Node ID

```bash
# Check the logs for your node ID
grep "Boson Kademlia node" ~/pc2/boson/data/boson.log | head -1

# Example output:
# Boson Kademlia node: J1h7RHv5iHhT43zsXxMCg7zGmZq6g4Ec2VJeCkSGry2E
```

### Registering as a Bootstrap Node

To have your node added to the official bootstrap list:
1. Ensure your node has been running stably for at least 7 days
2. Verify uptime is >99%
3. Contact the PC2 team with:
   - Your Node ID
   - Your public IP address
   - Your availability commitment

---

## Monitoring and Maintenance

### Checking Node Status

```bash
# Service status
sudo systemctl status pc2-boson

# Check if ports are listening
ss -tlnup | grep -E '39001|8090'

# View recent logs
tail -50 ~/pc2/boson/data/boson.log

# Follow logs in real-time
tail -f ~/pc2/boson/data/boson.log
```

### Health Check Commands

```bash
# Check DHT connectivity
grep "DHT IPv4 bootstraping" ~/pc2/boson/data/boson.log | tail -5

# Check Active Proxy
grep "ActiveProxy" ~/pc2/boson/data/boson.log | tail -10

# Verify no errors
grep -i "error\|exception" ~/pc2/boson/data/boson.log | tail -20
```

### Log Locations

| Log | Location |
|-----|----------|
| Main log | `~/pc2/boson/data/boson.log` |
| Node database | `~/pc2/boson/data/node.db` |
| Routing table | `~/pc2/boson/data/` |

### Resource Monitoring

```bash
# Check memory usage
ps aux | grep boson

# Check disk usage
du -sh ~/pc2/boson/data/

# System resources
htop
```

---

## Troubleshooting

### Port Already in Use

**Error**: `Address already in use`

**Solution**:
```bash
# Find what's using the port
sudo lsof -i :39001
sudo lsof -i :8090

# Kill the process or change your port configuration
```

### Node Won't Start

**Error**: `Another boson instance already running`

**Solution**:
```bash
# Remove stale lock file
rm -f ~/pc2/boson/data/lock

# Kill any running instances
pkill -f 'io.bosonnetwork.launcher'

# Restart
sudo systemctl start pc2-boson
```

### Can't Connect to DHT

**Symptoms**: Node starts but shows repeated "bootstraping" messages

**Solutions**:
1. Check firewall allows UDP 39001:
   ```bash
   sudo ufw status | grep 39001
   ```
2. Verify bootstrap nodes are reachable:
   ```bash
   nc -vzu 155.138.245.211 39001
   ```
3. Check your public IP is correctly configured

### Active Proxy Not Starting

**Error**: `Cannot start service: ActiveProxy`

**Solutions**:
1. Verify all JAR files are present:
   ```bash
   ls ~/pc2/boson/lib/ | grep -E 'active-proxy|vertx-web'
   ```
2. Check configuration syntax:
   ```bash
   cat ~/pc2/boson/config/default.conf | python3 -m json.tool
   ```

### Access Control Errors

**Error**: `NoSuchFileException: accesscontrol/defaults`

**Solution**:
```bash
mkdir -p ~/pc2/boson/data/accesscontrol/{defaults,acls}
```

---

## Updating

### Checking for Updates

Monitor the Boson Network repository for new releases:
- https://github.com/bosonnetwork/Boson.Core/releases

### Update Procedure

```bash
# 1. Stop the service
sudo systemctl stop pc2-boson

# 2. Backup current installation
cp -r ~/pc2/boson ~/pc2/boson.backup.$(date +%Y%m%d)

# 3. Pull latest code
cd ~/pc2/Boson.Core
git fetch --tags
git checkout release-vX.Y.Z  # Replace with new version

# 4. Rebuild
./mvnw clean package -DskipTests -Dgpg.skip=true

# 5. Deploy new JARs
cp cmds/target/lib/*.jar ~/pc2/boson/lib/

# 6. Restart service
sudo systemctl start pc2-boson

# 7. Verify
sudo systemctl status pc2-boson
tail -20 ~/pc2/boson/data/boson.log
```

### Rollback Procedure

If something goes wrong:

```bash
# 1. Stop service
sudo systemctl stop pc2-boson

# 2. Restore backup
rm -rf ~/pc2/boson
mv ~/pc2/boson.backup.YYYYMMDD ~/pc2/boson

# 3. Restart
sudo systemctl start pc2-boson
```

---

## Support

- **GitHub Issues**: https://github.com/elastos/Elastos.Carrier.Java/issues
- **Boson Network**: https://github.com/bosonnetwork
- **Elastos Discord**: Council channels
- **PC2 Team**: Contact through ela.city

---

## Appendix: Verifying Your Installation

Run this checklist after installation:

```bash
echo "=== PC2 Super Node Health Check ==="
echo ""
echo "1. Service Status:"
systemctl is-active pc2-boson

echo ""
echo "2. DHT Port (39001/UDP):"
ss -ulnp | grep 39001 && echo "✓ OK" || echo "✗ NOT LISTENING"

echo ""
echo "3. Active Proxy Port (8090/TCP):"
ss -tlnp | grep 8090 && echo "✓ OK" || echo "✗ NOT LISTENING"

echo ""
echo "4. Node ID:"
grep "Boson Kademlia node:" ~/pc2/boson/data/boson.log | tail -1

echo ""
echo "5. Memory Usage:"
ps -o rss= -p $(pgrep -f 'io.bosonnetwork.launcher') | awk '{print $1/1024 " MB"}'

echo ""
echo "6. Uptime:"
systemctl show pc2-boson --property=ActiveEnterTimestamp
```

---

*Last updated: January 2026*
*Boson.Core version: release-v2.0.7*
