# ElastOS PC2 - Personal Cloud Compute

**Your data. Your servers. Your identity.**

PC2 is a decentralized personal cloud that you own and control. Deploy it on your personal hardware or a VPS, and access your data from anywhere in the world using your wallet as your identity.

## Quick Start

### One-Line Install (Linux/Mac)

```bash
curl -sSL https://elastos.pc2.net/install.sh | bash
```

### Manual Install with Docker

```bash
# Clone the repository
git clone https://github.com/elastos/pc2.net.git
cd pc2.net/docker/pc2

# Start PC2
docker-compose up -d

# View logs to get your setup token
docker-compose logs -f pc2
```

## First-Time Setup

1. **Get Your Setup Token**
   
   When PC2 starts for the first time, it displays a one-time setup token:
   
   ```
   ═══════════════════════════════════════════════════════════════════════
   ║                                                                     ║
   ║   🔐 PC2 SETUP TOKEN - SAVE THIS! SHOWN ONLY ONCE!                  ║
   ║                                                                     ║
   ═══════════════════════════════════════════════════════════════════════
   ║                                                                     ║
   ║   PC2-SETUP-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0...             ║
   ║                                                                     ║
   ═══════════════════════════════════════════════════════════════════════
   ```
   
   **⚠️ SAVE THIS TOKEN!** It will never be shown again.

2. **Open the Web Interface**
   
   Navigate to `http://localhost:4100` (or your server's IP)

3. **Connect Your Wallet**
   
   - Click "Connect Wallet"
   - Choose MetaMask or Essentials
   - Approve the connection

4. **Claim Ownership**
   
   - Click the PC2 status icon in the taskbar
   - Select "Connect to PC2"
   - Enter your PC2 URL: `http://localhost:4100`
   - Enter your setup token
   - Sign the message in your wallet
   
   **You are now the owner!** 🎉

## Security

### How PC2 Protects Your Data

| Security Layer | What It Does |
|----------------|--------------|
| **Setup Token** | One-time token prevents unauthorized ownership claims |
| **Wallet Signature** | Every connection requires proving wallet ownership |
| **Whitelist** | Only wallets you approve can access your PC2 |
| **TLS Encryption** | All connections are encrypted in transit |
| **IPFS Encryption** | Files are encrypted with your wallet's key |

### Can Someone Else Access My PC2?

**No.** Even if someone discovers your PC2 URL, they cannot:
- Claim ownership (needs the one-time setup token)
- Connect (needs wallet signature + whitelist approval)
- Read your files (encrypted with your wallet key)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PC2_PORT` | 4100 | Web interface port |
| `PC2_WS_PORT` | 4200 | WebSocket tunnel port |
| `PC2_NODE_NAME` | "My Personal Cloud" | Display name for your PC2 |
| `PC2_PUBLIC_URL` | - | Public URL (for remote access) |

### Custom Ports

```bash
# Edit .env file
PC2_PORT=8080
PC2_WS_PORT=8081

# Restart
docker-compose down && docker-compose up -d
```

### Using a Custom Domain

1. Point your domain to your server
2. Set up a reverse proxy (nginx/Caddy)
3. Configure SSL certificate
4. Update `PC2_PUBLIC_URL` in .env

Example nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name pc2.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pc2.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pc2.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Management Commands

```bash
# View logs
docker-compose logs -f pc2

# Stop PC2
docker-compose down

# Restart PC2
docker-compose restart

# Update to latest version
docker-compose pull && docker-compose up -d

# View resource usage
docker stats pc2-node

# Backup data
tar -czf pc2-backup-$(date +%Y%m%d).tar.gz ./data
```

## Troubleshooting

### "Cannot connect to PC2"

1. Check if PC2 is running: `docker-compose ps`
2. Check logs: `docker-compose logs pc2`
3. Verify ports are open: `curl http://localhost:4100/api/health`

### "Setup token not working"

- Setup tokens can only be used once
- If you've already claimed ownership, you don't need the token
- If you need to reset, delete `./data/config/.setup_token.hash` and restart

### "Wallet signature failed"

- Make sure you're signing with the same wallet that claimed ownership
- Check that your wallet is on the correct network (Elastos Smart Chain)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Browser                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ElastOS (Puter Frontend)                                 │  │
│  └─────────────────────────────┬─────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────┘
                                 │ HTTPS/WSS
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Your PC2 Node                               │
│  ┌───────────────┬───────────────┬───────────────────────────┐  │
│  │  Web Server   │  WS Gateway   │  IPFS Node                │  │
│  │  (Port 4100)  │  (Port 4200)  │  (Ports 4001, 5001)       │  │
│  └───────────────┴───────────────┴───────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  PC2 Backend (Puter + Extensions)                         │  │
│  │  - Wallet Auth Extension                                   │  │
│  │  - IPFS Storage Extension                                  │  │
│  │  - PC2 Gateway Extension                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Persistent Data (/data)                                   │  │
│  │  - /data/db (SQLite database)                              │  │
│  │  - /data/storage (File storage)                            │  │
│  │  - /data/ipfs (IPFS repository)                            │  │
│  │  - /data/config (Configuration)                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## License

AGPL-3.0 - See [LICENSE](../../LICENSE) for details.

## Support

- GitHub Issues: [github.com/elastos/pc2.net/issues](https://github.com/elastos/pc2.net/issues)
- Discord: [discord.gg/elastos](https://discord.gg/elastos)
- Documentation: [docs.elastos.org/pc2](https://docs.elastos.org/pc2)

