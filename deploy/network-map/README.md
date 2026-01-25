# PC2 Network Map

Real-time visualization and statistics for the PC2 decentralized network.

## Features

- **Network Map Visualization** - Interactive force-directed graph showing all PC2 nodes
- **Live Statistics** - Real-time node counts and network health metrics
- **Activity Patterns** - Track always-on, intermittent, and occasional nodes
- **WebSocket Updates** - Real-time updates without page refresh
- **Privacy Protected** - Anonymized node identifiers (usernames/URLs never exposed)

## Privacy & Security

**CRITICAL**: This service protects user privacy through anonymization:

- Node identifiers are SHA-256 hashes (e.g., `node_abc12345`)
- Usernames are NEVER exposed (prevents doxing via `alice` → `alice.ela.city`)
- URLs and endpoints are NEVER exposed (prevents DDoS/hacking)
- Only status and activity type are shown publicly

## Development

```bash
# Install dependencies
npm run install:all

# Start backend (port 3100)
npm run dev

# Start frontend (port 5173)
cd frontend && npm run dev
```

## Deployment

### Quick Deploy (from local machine)

```bash
cd /Users/mtk/Documents/Cursor/pc2.net

# Package and deploy
tar -czf /tmp/network-map.tar.gz deploy/network-map
scp /tmp/network-map.tar.gz root@69.164.241.210:/root/pc2/

# SSH to server and extract
ssh root@69.164.241.210
cd /root/pc2
rm -rf network-map && tar -xzf network-map.tar.gz && mv deploy/network-map . && rm -rf deploy network-map.tar.gz

# Install, build, restart
cd network-map && npm install --production
cd frontend && npm install && npm run build
systemctl restart pc2-network-map
```

### Or use deploy script:
```bash
./deploy.sh
```

### Server Details

| Setting | Value |
|---------|-------|
| Server | InterServer (69.164.241.210) |
| Path | `/root/pc2/network-map/` |
| Service | `pc2-network-map.service` |
| Internal Port | 3100 |
| Public URL | https://map.ela.city |
| Data Source | `/root/pc2/web-gateway/data/registry.json` |

### Service Commands

```bash
# Status
systemctl status pc2-network-map

# Restart
systemctl restart pc2-network-map

# Logs
journalctl -xeu pc2-network-map -f

# Manual run (debugging)
cd /root/pc2/network-map && node server/index.js
```

## API Endpoints

- `GET /api/health` - Service health check
- `GET /api/nodes` - List all nodes (anonymized)
- `GET /api/nodes/:nodeId` - Get specific node
- `GET /api/stats` - Network statistics
- `GET /api/stats/timeline` - Historical data
- `WS /ws` - WebSocket for real-time updates

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    map.ela.city                             │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)           Backend (Express)               │
│  - Network Graph            - Data Collector                │
│  - Stats Dashboard          - Health Checker                │
│  - Node List               - Anonymizer                     │
│                             - SQLite Database               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Web Gateway (/api/users)   PC2 Nodes (/api/health)         │
└─────────────────────────────────────────────────────────────┘
```

## License

Part of PC2 - Personal Cloud Computer
