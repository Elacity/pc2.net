# PC2 Web Gateway

> Routes `*.ela.city` subdomains to PC2 nodes

## Overview

The Web Gateway is a Node.js service that handles incoming HTTPS requests for `*.ela.city` subdomains and proxies them to the appropriate PC2 node.

## Features

- **Subdomain Routing**: Maps `username.ela.city` to registered PC2 nodes
- **HTTPS/SSL**: Let's Encrypt certificates for trusted HTTPS
- **WebSocket Support**: Proxies WebSocket connections for real-time apps
- **Registration API**: RESTful API for node registration
- **Persistence**: Registry survives restarts (JSON file storage)

## How It Works

```
1. User visits https://alice.ela.city
                    │
                    ▼
2. DNS resolves to super node (69.164.241.210)
                    │
                    ▼
3. Web Gateway receives request
                    │
                    ▼
4. Extracts "alice" from hostname
                    │
                    ▼
5. Looks up "alice" in registry
                    │
                    ▼
6. Finds endpoint: http://127.0.0.1:4200
                    │
                    ▼
7. Proxies request to Alice's PC2 node
                    │
                    ▼
8. Returns response to user
```

## API Reference

### Register a Username

```bash
POST /api/register
Content-Type: application/json

{
  "username": "alice",
  "nodeId": "alice-node-abc123",
  "endpoint": "http://127.0.0.1:4200"
}
```

**Response:**
```json
{
  "success": true,
  "username": "alice"
}
```

### Look Up a User

```bash
GET /api/lookup/{username}
```

**Response:**
```json
{
  "username": "alice",
  "nodeId": "alice-node-abc123",
  "endpoint": "http://127.0.0.1:4200",
  "registered": "2026-01-21T15:30:00.000Z"
}
```

### List All Users

```bash
GET /api/users
```

**Response:**
```json
{
  "users": [
    {
      "username": "demo",
      "nodeId": "demo-node-id",
      "endpoint": "http://127.0.0.1:4200",
      "registered": "2026-01-21T15:30:00.000Z"
    },
    {
      "username": "alice",
      "nodeId": "alice-node-abc123",
      "endpoint": "http://127.0.0.1:4200",
      "registered": "2026-01-21T15:35:00.000Z"
    }
  ]
}
```

### Health Check

```bash
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600.5
}
```

### Get Node Status (without proxying)

Add `?status` to any subdomain URL:

```bash
GET https://alice.ela.city?status
```

**Response:**
```json
{
  "gateway": "PC2 Web Gateway",
  "username": "alice",
  "nodeInfo": {
    "nodeId": "alice-node-abc123",
    "endpoint": "http://127.0.0.1:4200",
    "registered": "2026-01-21T15:35:00.000Z"
  },
  "status": "Ready to proxy"
}
```

## Configuration

The gateway is configured via constants in `index.js`:

```javascript
const CONFIG = {
  httpPort: 80,
  httpsPort: 443,
  domain: "ela.city",
  dataDir: "./data",
  registryFile: "./data/registry.json",
};
```

## SSL Certificates

The gateway uses Let's Encrypt certificates located at:
- `/etc/letsencrypt/live/demo.ela.city/fullchain.pem`
- `/etc/letsencrypt/live/demo.ela.city/privkey.pem`

**Renewal**: Certbot automatically renews certificates.

**Current Coverage**:
- demo.ela.city
- test.ela.city
- sash.ela.city

**Adding New Subdomains**:
```bash
sudo certbot certonly --standalone -d newuser.ela.city \
  --non-interactive --agree-tos --email admin@ela.city
```

Or use a wildcard certificate with DNS validation.

## Systemd Service

**Service File**: `/etc/systemd/system/pc2-gateway.service`

```ini
[Unit]
Description=PC2 Web Gateway
After=network.target pc2-boson.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/pc2/web-gateway
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=append:/root/pc2/web-gateway/gateway.log
StandardError=append:/root/pc2/web-gateway/gateway.log

[Install]
WantedBy=multi-user.target
```

**Commands**:
```bash
# Start
sudo systemctl start pc2-gateway

# Stop
sudo systemctl stop pc2-gateway

# Restart
sudo systemctl restart pc2-gateway

# Status
sudo systemctl status pc2-gateway

# Logs
tail -f /root/pc2/web-gateway/gateway.log
```

## File Structure

```
/root/pc2/web-gateway/
├── index.js           # Main gateway code
├── package.json       # Node.js dependencies
├── node_modules/      # Installed packages
├── data/
│   └── registry.json  # Persisted username registry
├── certs/             # Self-signed certs (fallback)
│   ├── server.key
│   └── server.crt
└── gateway.log        # Application logs
```

## Proxying Details

The gateway uses `http-proxy` for request proxying:

```javascript
const proxy = createProxyServer({
  changeOrigin: true,  // Update Host header
  ws: true,            // Enable WebSocket proxying
  xfwd: true,          // Add X-Forwarded-* headers
});
```

### HTTP Proxying
All HTTP/HTTPS requests are proxied transparently to the target endpoint.

### WebSocket Proxying
WebSocket connections are upgraded and proxied:

```javascript
server.on("upgrade", (req, socket, head) => {
  const username = extractUsername(req.headers.host);
  const nodeInfo = registry.get(username);
  if (nodeInfo) {
    proxy.ws(req, socket, head, { target: nodeInfo.endpoint });
  }
});
```

## Error Handling

| Error | Response |
|-------|----------|
| User not found | 404 with JSON error message |
| Target unreachable | 502 Bad Gateway |
| Invalid registration | 400 Bad Request |

## Security Considerations

1. **HTTPS Only**: Production should redirect HTTP to HTTPS
2. **Rate Limiting**: Consider adding rate limiting for registration API
3. **Authentication**: Future: Require DID signature for registration
4. **Validation**: Validate endpoint URLs before registration

## Active Proxy Support (Sprint 5)

The gateway now supports `proxy://` endpoints for NAT traversal:

### Endpoint Formats

| Format | Description |
|--------|-------------|
| `http://ip:port` | Direct HTTP proxy (VPS/public IP) |
| `proxy://host:port/sessionId` | Relay via Active Proxy (NAT) |

### How proxy:// Works

```
1. PC2 Node (behind NAT) connects to Active Proxy
                    │
                    ▼
2. Active Proxy assigns session ID
                    │
                    ▼
3. PC2 Node registers: proxy://supernode:8090/sessionId
                    │
                    ▼
4. Browser requests https://alice.ela.city
                    │
                    ▼
5. Web Gateway looks up "alice" → proxy://...
                    │
                    ▼
6. Gateway ATTACHes to Active Proxy session
                    │
                    ▼
7. Gateway sends HTTP request through tunnel
                    │
                    ▼
8. Active Proxy relays to PC2 Node
                    │
                    ▼
9. Response flows back through tunnel
```

### Limitations

- WebSocket proxying via Active Proxy not yet supported
- Request body proxying requires buffering (in progress)

## Future Enhancements

1. **DHT Integration**: Store registrations in Boson DHT (in progress)
2. **WebSocket via Active Proxy**: Full WebSocket support through tunnel
3. **Health Checks**: Periodically verify registered endpoints are alive
4. **Analytics**: Track request counts per user
5. **Caching**: Cache DNS lookups and node info

---

*Location: `/root/pc2/web-gateway/` on super node*

*Updated Version: `deploy/web-gateway/` (local) - supports proxy:// endpoints*
