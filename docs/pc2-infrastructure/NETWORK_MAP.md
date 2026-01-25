# PC2 Network Map

> Real-time visualization of the Personal Cloud (PC2) decentralized network.

**Live URL:** https://map.ela.city

## Overview

The Network Map provides a public-facing visualization of the PC2 network, showing:
- All registered PC2 nodes (online and offline)
- Supernodes (infrastructure nodes)
- Network statistics (total nodes, online count, activity patterns)
- Real-time updates via WebSocket

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     map.ela.city                            │
├─────────────────────────────────────────────────────────────┤
│  Web Gateway (port 80/443)                                  │
│  └── Routes map.ela.city → localhost:3100                   │
├─────────────────────────────────────────────────────────────┤
│  Network Map Service (port 3100)                            │
│  ├── Express.js backend                                     │
│  ├── SQLite database (network-map.db)                       │
│  ├── WebSocket for real-time updates                        │
│  └── React frontend (Vite build)                            │
├─────────────────────────────────────────────────────────────┤
│  Data Sources                                               │
│  ├── Registry file: /root/pc2/web-gateway/data/registry.json│
│  └── Health checks: GET /api/health on each node            │
└─────────────────────────────────────────────────────────────┘
```

## Privacy & Security

**Critical Design Principle:** No identifying information is exposed publicly.

### What IS Exposed
- Anonymized node identifiers (e.g., `node_abc123`)
- Online/offline status
- Node type (supernode, pc2, registered)
- Activity patterns (always-on, intermittent, occasional, inactive)
- Aggregate statistics

### What is NEVER Exposed
- Usernames (e.g., "alice")
- URLs (e.g., "alice.ela.city")
- IP addresses
- Node endpoints
- Any data that could enable:
  - DDoS attacks
  - Targeted hacking attempts
  - User identification/doxing

### Anonymization

Node identifiers are generated using:
```javascript
// server/anonymizer.js
const hash = crypto.createHash('sha256')
  .update(username + SALT)
  .digest('hex')
  .substring(0, 8);
return `node_${hash}`;
```

This is:
- **Consistent:** Same username always produces same ID
- **Non-reversible:** Cannot determine username from ID
- **Collision-resistant:** 8 hex chars = 4 billion possibilities

## File Structure

```
deploy/network-map/
├── server/
│   ├── index.js          # Main Express server
│   ├── database.js       # SQLite operations
│   ├── collector.js      # Data collection from registry
│   ├── anonymizer.js     # Privacy-preserving ID generation
│   └── api/
│       ├── nodes.js      # /api/nodes endpoint
│       └── stats.js      # /api/stats endpoint
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main React component
│   │   ├── styles.css    # All styling
│   │   └── components/
│   │       ├── NetworkGraph.jsx  # Force-directed graph
│   │       └── NodeList.jsx      # Node list table
│   └── public/
│       └── images/
│           └── elacity-labs-logo.svg
├── package.json
├── deploy.sh             # Deployment script
└── README.md
```

## Server Deployment

### Location
- **Server:** InterServer (69.164.241.210)
- **Path:** `/root/pc2/network-map/`
- **Service:** `pc2-network-map.service`
- **Port:** 3100 (internal), routed via web-gateway

### Systemd Service

```bash
# /etc/systemd/system/pc2-network-map.service
[Unit]
Description=PC2 Network Map
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pc2/network-map
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=REGISTRY_FILE=/root/pc2/web-gateway/data/registry.json
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Commands

```bash
# Check status
systemctl status pc2-network-map

# Restart service
systemctl restart pc2-network-map

# View logs
journalctl -xeu pc2-network-map -f

# Manual test
cd /root/pc2/network-map && node server/index.js
```

## Web Gateway Integration

The web-gateway routes `map.ela.city` to the network map service.

### Added to `/root/pc2/web-gateway/index.js`:

```javascript
// Network Map proxy for map.ela.city
const networkMapProxy = createProxyServer({
  target: "http://127.0.0.1:3100",
  ws: true,
});

// In handleRequest():
if (hostname === "map.ela.city" || hostname === "map." + CONFIG.domain) {
  return networkMapProxy.web(req, res);
}

// In handleUpgrade() for WebSocket:
if (hostname === "map.ela.city" || hostname === "map." + CONFIG.domain) {
  return networkMapProxy.ws(req, socket, head);
}
```

## API Endpoints

### GET /api/nodes
Returns list of all nodes with anonymized data.

```json
{
  "nodes": [
    {
      "nodeIdentifier": "node_abc123",
      "status": "online",
      "activityType": "always-on",
      "nodeType": "supernode"
    }
  ]
}
```

### GET /api/stats
Returns aggregate network statistics.

```json
{
  "totalRegistered": 14,
  "totalActivePC2": 2,
  "onlineNow": 2,
  "activityBreakdown": {
    "always-on": 2,
    "intermittent": 0,
    "occasional": 0,
    "inactive": 12
  }
}
```

### WebSocket /ws
Real-time updates for stats and node changes.

```javascript
// Message types
{ type: 'stats_update', data: { ... } }
{ type: 'node_change', data: { nodeIdentifier, status, ... } }
```

## Data Collection

The `DataCollector` runs every 5 minutes:

1. **Read Registry:** Loads `/root/pc2/web-gateway/data/registry.json`
2. **Health Check:** GET `/api/health` on each node's endpoint
3. **Classify Nodes:**
   - `supernode`: Infrastructure nodes (currently: "cloud")
   - `pc2`: Active PC2 nodes (respond to health check)
   - `registered`: Registered but not active
4. **Activity Patterns:** Based on 7-day history
   - `always-on`: >95% uptime
   - `intermittent`: >50% uptime
   - `occasional`: >10% uptime
   - `inactive`: <10% uptime
5. **Update Database:** Store results in SQLite
6. **Broadcast:** Push updates via WebSocket

## Frontend Visualization

### Force-Directed Graph
- Library: `react-force-graph-2d`
- Features:
  - Drag nodes to reposition
  - Scroll to zoom in/out
  - Hover for node info
  - Click to unpin nodes

### Node Styling
| Type | Color | Size |
|------|-------|------|
| Supernode | Gold (#D4AF37) | 12px |
| Online PC2 | Green (#2ECC71) | 8px |
| Offline | Gray (#4a4a4a) | 6px |

### Responsive Design
- Desktop: Full graph with side stats
- Mobile: Stacked layout, simplified controls

## Deployment Process

From local machine:

```bash
cd /Users/mtk/Documents/Cursor/pc2.net

# Package and deploy
tar -czf /tmp/network-map.tar.gz deploy/network-map
scp /tmp/network-map.tar.gz root@69.164.241.210:/root/pc2/

# On server
ssh root@69.164.241.210
cd /root/pc2
rm -rf network-map
tar -xzf network-map.tar.gz
mv deploy/network-map .
rm -rf deploy network-map.tar.gz

# Install and build
cd network-map
npm install --production
cd frontend
npm install
npm run build

# Restart service
systemctl restart pc2-network-map
```

## DNS Configuration

**GoDaddy DNS for ela.city:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | map | 69.164.241.210 | 600 |

## Future Enhancements

### Phase 1: UI/UX Improvements
1. **3D Globe Visualization** - Three.js/react-globe.gl for geographic display
2. **Historical Timeline** - Animated network growth over time
3. **Node Details Modal** - More info on node hover/click
4. **Export Data** - CSV/JSON export of anonymized stats

### Phase 2: Multi-Domain Expansion
Expand network map availability across all Elastos domains:

| Domain | URL | Status |
|--------|-----|--------|
| ela.city | https://map.ela.city | ✅ Live |
| pc2.net | https://map.pc2.net | 🔜 Planned |
| ela.net | https://map.ela.net | 🔜 Planned |

**Implementation:**
1. Configure DNS A records for `map.pc2.net` and `map.ela.net` → 69.164.241.210
2. Update Web Gateway to accept all three hostnames
3. SSL certificates for new domains (via acme.sh)

### Phase 3: Multi-Domain Subdomain Routing
Enable PC2 nodes to be accessible via all three domain variants:

```
username.ela.city  ─┐
username.pc2.net   ─┼─► Same PC2 Node
username.ela.net   ─┘
```

**Example:**
- `sash.ela.city` = `sash.pc2.net` = `sash.ela.net`

**Requirements:**
1. Wildcard DNS for `*.pc2.net` and `*.ela.net`
2. Wildcard SSL certificates for both domains
3. Web Gateway updates to normalize username lookups across domains
4. Registry to track which domains a user has enabled

### Phase 4: Multi-Supernode Network
Expand from single supernode to distributed supernode network:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Supernode US   │────▶│  Supernode EU   │────▶│  Supernode Asia │
│  (InterServer)  │◀────│   (Contabo)     │◀────│   (TBD)         │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    PC2 Nodes              PC2 Nodes               PC2 Nodes
    (Americas)             (Europe)                (Asia-Pacific)
```

**Benefits:**
- Geographic redundancy
- Lower latency for regional users
- DHT replication across supernodes
- Automatic failover

**Network Map Updates for Multi-Supernode:**
- Show all supernodes on the map
- Display inter-supernode connections
- Region-based node grouping
- Supernode health monitoring

### Phase 5: Decentralized Network Map
Move from centralized map service to decentralized:
- Each supernode hosts its own network map instance
- Data synchronized via DHT
- Any `map.*.city/net` returns same data
- No single point of failure

## Troubleshooting

### Service Won't Start
```bash
# Check for missing dependencies
cd /root/pc2/network-map && npm install --production

# Check logs
journalctl -xeu pc2-network-map --no-pager | tail -50
```

### map.ela.city Returns 502
```bash
# Check if network-map service is running
systemctl status pc2-network-map

# Check if port 3100 is listening
ss -tlnp | grep 3100
```

### No Nodes Showing
```bash
# Check registry file exists
cat /root/pc2/web-gateway/data/registry.json

# Check collector logs
journalctl -xeu pc2-network-map | grep -i "collector\|fetch"
```

### WebSocket Not Connecting
```bash
# Check web-gateway is routing WS correctly
systemctl restart pc2-gateway

# Verify WebSocket upgrade handling in web-gateway
grep -n "networkMapProxy" /root/pc2/web-gateway/index.js
```

## Related Documentation

- [Web Gateway](./WEB_GATEWAY.md) - Main routing infrastructure
- [Architecture](./ARCHITECTURE.md) - Overall system design
- [SSL Certificates](./SSL_CERTIFICATES.md) - HTTPS configuration
