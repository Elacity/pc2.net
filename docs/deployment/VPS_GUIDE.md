# VPS Deployment Guide

Deploy your PC2 personal cloud on a Virtual Private Server for always-on access.

## Recommended VPS Providers

| Provider | Monthly Cost | RAM | Disk | Notes |
|----------|-------------|-----|------|-------|
| **Contabo** | $5.99 | 4GB | 50GB | Best value, EU/US locations |
| DigitalOcean | $6 | 1GB | 25GB | Easy setup, good docs |
| Vultr | $6 | 1GB | 25GB | Fast provisioning |
| Hetzner | €4.15 | 2GB | 20GB | European provider |
| Linode | $5 | 1GB | 25GB | Reliable, good support |

**Minimum Requirements:**
- 1GB RAM (2GB+ recommended)
- 20GB disk
- Ubuntu 22.04 LTS

---

## Step-by-Step Setup (Contabo Example)

### 1. Create a VPS

1. Go to [contabo.com](https://contabo.com/en/vps/)
2. Select "Cloud VPS S" ($5.99/month)
3. Choose Ubuntu 22.04
4. Set a root password
5. Wait for provisioning (usually 15 minutes)

### 2. Connect via SSH

```bash
ssh root@YOUR_SERVER_IP
```

First time? Accept the fingerprint by typing `yes`.

### 3. Update System (Optional but Recommended)

```bash
apt update && apt upgrade -y
```

### 4. Install PC2

**Option A: Docker (Recommended)**

```bash
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-pc2.sh | bash
```

This will:
- Install Docker if not present
- Pull the PC2 image
- Start PC2 on port 4100

**Option B: Native Install**

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git build-essential

# Clone and build
git clone https://github.com/Elacity/pc2.net.git ~/pc2
cd ~/pc2/pc2-node
npm install
npm run build

# Create systemd service
cat > /etc/systemd/system/pc2.service << EOF
[Unit]
Description=PC2 Personal Cloud
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/pc2/pc2-node
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl enable pc2
systemctl start pc2
```

### 5. Configure Firewall

```bash
# Allow PC2 ports
ufw allow 4100
ufw allow 4200

# Enable firewall
ufw enable
```

### 6. Access Your PC2

Open in browser: `http://YOUR_SERVER_IP:4100`

---

## Domain Setup (Optional)

### Option A: Use ela.city Subdomain (Easiest)

1. Open your PC2 in browser
2. Login with wallet
3. Go to Settings → PC2
4. Enter a username (e.g., "mycloud")
5. Click "Register"

Your PC2 is now at: `https://mycloud.ela.city`

### Option B: Custom Domain

1. Point your domain's A record to your server IP
2. Install Caddy for automatic HTTPS:

```bash
apt install -y caddy

cat > /etc/caddy/Caddyfile << EOF
your-domain.com {
    reverse_proxy localhost:4100
}
EOF

systemctl restart caddy
```

---

## SSL/HTTPS Setup

### With ela.city (Automatic)

SSL is automatic when using `username.ela.city`.

### With Custom Domain (Caddy)

Caddy handles SSL automatically. Just point your domain and restart Caddy.

### Manual Let's Encrypt

```bash
apt install certbot
certbot certonly --standalone -d your-domain.com
```

---

## Maintenance

### View Logs

**Docker:**
```bash
cd ~/pc2 && docker compose logs -f
```

**Native:**
```bash
journalctl -u pc2 -f
```

### Update PC2

**Docker:**
```bash
cd ~/pc2
docker compose pull
docker compose up -d
```

**Native:**
```bash
cd ~/pc2
git pull
cd pc2-node
npm install
npm run build
systemctl restart pc2
```

### Backup

```bash
# Create backup
cd ~/pc2/pc2-node
npm run backup

# Backups stored in data/backups/
ls data/backups/
```

### Restore

```bash
npm run restore data/backups/backup-2026-01-27.tar.gz
```

---

## Security Recommendations

1. **Change SSH port:**
   ```bash
   # Edit /etc/ssh/sshd_config
   # Change Port 22 to Port 2222
   systemctl restart sshd
   ```

2. **Disable root password login:**
   ```bash
   # Add SSH key first!
   ssh-copy-id -i ~/.ssh/id_rsa.pub root@YOUR_SERVER_IP
   
   # Then disable password login
   # Edit /etc/ssh/sshd_config
   # Set PasswordAuthentication no
   ```

3. **Enable fail2ban:**
   ```bash
   apt install fail2ban
   systemctl enable fail2ban
   ```

4. **Regular updates:**
   ```bash
   apt update && apt upgrade -y
   ```

---

## Troubleshooting

### Can't Connect to Server

1. Check if server is running: `systemctl status pc2`
2. Check firewall: `ufw status`
3. Check ports: `ss -tlnp | grep 4100`

### Out of Memory

PC2 needs at least 512MB free. Check with:
```bash
free -h
```

Add swap if needed:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Docker Won't Start

```bash
# Check Docker status
systemctl status docker

# Restart Docker
systemctl restart docker

# Check PC2 container
docker ps -a
docker logs pc2-node
```

---

## Cost Optimization

- **Contabo** offers the best value for RAM
- **Hetzner** is cheapest for EU users
- Consider annual plans for 10-20% discount
- PC2 runs fine on 1GB RAM but 2GB is more comfortable
