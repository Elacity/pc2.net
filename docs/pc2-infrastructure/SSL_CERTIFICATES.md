# SSL Certificate Management

> How SSL certificates are managed for PC2 infrastructure

## Current Setup (MVP v1.0.0)

### Certificate Type
- **Provider**: Let's Encrypt
- **Challenge**: HTTP-01 (per-domain)
- **Location**: `/etc/letsencrypt/live/demo.ela.city/`

### Currently Covered Domains
- demo.ela.city
- test.ela.city
- sash.ela.city
- testlocal.ela.city

### Adding New Subdomains

When a new username is registered, the SSL certificate must be expanded:

```bash
# 1. Stop the Web Gateway temporarily
sudo systemctl stop pc2-gateway

# 2. Expand certificate with new domain
sudo certbot certonly --standalone --expand \
  -d demo.ela.city \
  -d test.ela.city \
  -d sash.ela.city \
  -d testlocal.ela.city \
  -d newuser.ela.city

# 3. Restart Web Gateway
sudo systemctl start pc2-gateway
```

### Automatic Renewal

Certbot auto-renews certificates. Check renewal status:

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## Future: Wildcard Certificate (v1.1.0)

### Requirements
- Cloudflare API access
- DNS-01 challenge (proves domain ownership via DNS TXT record)

### Setup with Cloudflare

1. **Install Cloudflare plugin**
   ```bash
   sudo apt install python3-certbot-dns-cloudflare
   ```

2. **Create API credentials file**
   ```bash
   sudo mkdir -p /root/.secrets/certbot
   sudo nano /root/.secrets/certbot/cloudflare.ini
   ```
   
   Contents:
   ```ini
   dns_cloudflare_api_token = YOUR_API_TOKEN
   ```
   
   ```bash
   sudo chmod 600 /root/.secrets/certbot/cloudflare.ini
   ```

3. **Request wildcard certificate**
   ```bash
   sudo certbot certonly \
     --dns-cloudflare \
     --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
     -d "*.ela.city" \
     -d "ela.city"
   ```

4. **Update Web Gateway to use wildcard cert**
   ```javascript
   const HTTPS_OPTIONS = {
     key: readFileSync('/etc/letsencrypt/live/ela.city/privkey.pem'),
     cert: readFileSync('/etc/letsencrypt/live/ela.city/fullchain.pem'),
   };
   ```

### Benefits of Wildcard
- No certificate expansion needed for new users
- Automatic coverage of all subdomains
- Simpler operations

---

## Cloudflare API Token

To create a Cloudflare API token:

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Custom Token
3. Permissions:
   - Zone → DNS → Edit
   - Zone → Zone → Read
4. Zone Resources: Include → Specific zone → ela.city
5. Create Token and save securely

---

## Troubleshooting

### Certificate Verification Failed
```bash
# Check if port 80 is open
sudo ufw status
sudo ufw allow 80/tcp

# Check if another process is using port 80
sudo ss -tlnp | grep :80
```

### Certificate Not Found
```bash
# List all certificates
sudo certbot certificates

# Check certificate files
ls -la /etc/letsencrypt/live/
```

### Web Gateway Won't Start
```bash
# Check logs
sudo journalctl -u pc2-gateway -f

# Verify certificate permissions
sudo ls -la /etc/letsencrypt/live/demo.ela.city/
```

---

## Current Status

| Domain | SSL Status | Certificate |
|--------|------------|-------------|
| demo.ela.city | ✅ Valid | demo.ela.city |
| test.ela.city | ✅ Valid | demo.ela.city |
| sash.ela.city | ✅ Valid | demo.ela.city |
| testlocal.ela.city | ✅ Valid | demo.ela.city |

---

*Last Updated: January 22, 2026*
