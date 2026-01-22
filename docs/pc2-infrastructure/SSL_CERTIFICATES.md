# SSL Certificate Management

> How SSL certificates are managed for PC2 infrastructure

## Current Setup (Wildcard Certificate) ✅

### Certificate Details
- **Provider**: Let's Encrypt
- **Challenge**: DNS-01 (via GoDaddy API)
- **Tool**: acme.sh
- **Scope**: `*.ela.city` + `ela.city` (wildcard)
- **Location**: `/etc/nginx/ssl/wildcard/`

### Certificate Files
```
/etc/nginx/ssl/wildcard/
├── ela.city.crt    # Full chain certificate
└── ela.city.key    # Private key
```

### Coverage
**ALL** `*.ela.city` subdomains are automatically covered:
- ✅ demo.ela.city
- ✅ test.ela.city
- ✅ test7.ela.city
- ✅ sash.ela.city
- ✅ yourname.ela.city (any subdomain!)

**No manual certificate expansion needed for new users!**

### Verification

```bash
# Check certificate details
echo | openssl s_client -connect test7.ela.city:443 -servername test7.ela.city 2>/dev/null | openssl x509 -noout -subject -issuer

# Expected output:
subject=CN=*.ela.city
issuer=C=US, O=Let's Encrypt, CN=E7
```

---

## Automatic Renewal

The certificate auto-renews via acme.sh cron job. To check or force renewal:

```bash
# Check certificate expiry
/root/.acme.sh/acme.sh --list

# Force renewal (if needed)
export GD_Key='<godaddy_api_key>'
export GD_Secret='<godaddy_api_secret>'
/root/.acme.sh/acme.sh --renew -d '*.ela.city' -d 'ela.city' --force

# Reinstall to Nginx location
/root/.acme.sh/acme.sh --install-cert -d '*.ela.city' \
  --key-file /etc/nginx/ssl/wildcard/ela.city.key \
  --fullchain-file /etc/nginx/ssl/wildcard/ela.city.crt

# Restart Web Gateway
systemctl restart pc2-gateway
```

---

## How It Was Set Up

### 1. Install acme.sh

```bash
curl https://get.acme.sh | sh -s email=admin@ela.city
```

### 2. Set Default CA to Let's Encrypt

```bash
/root/.acme.sh/acme.sh --set-default-ca --server letsencrypt
```

### 3. Issue Wildcard Certificate with GoDaddy DNS

```bash
export GD_Key='<godaddy_api_key>'
export GD_Secret='<godaddy_api_secret>'

/root/.acme.sh/acme.sh --issue \
  -d '*.ela.city' \
  -d 'ela.city' \
  --dns dns_gd
```

### 4. Install Certificate

```bash
mkdir -p /etc/nginx/ssl/wildcard

/root/.acme.sh/acme.sh --install-cert -d '*.ela.city' \
  --key-file /etc/nginx/ssl/wildcard/ela.city.key \
  --fullchain-file /etc/nginx/ssl/wildcard/ela.city.crt
```

### 5. Update Web Gateway SSL Config

Updated `/root/pc2/web-gateway/index.js` to load from wildcard location:

```javascript
const sslDir = "/etc/nginx/ssl/wildcard";
// ...
key: fs.readFileSync(path.join(sslDir, "ela.city.key")),
cert: fs.readFileSync(path.join(sslDir, "ela.city.crt")),
```

---

## GoDaddy API Credentials

The DNS is managed by GoDaddy. API credentials are stored in acme.sh config.

### To Get New API Credentials

1. Go to https://developer.godaddy.com/keys
2. Select "Production" environment
3. Create new API Key
4. Save Key and Secret securely

### Credential Location

acme.sh stores credentials in: `~/.acme.sh/account.conf`

---

## HTTP to HTTPS Redirect

The Web Gateway automatically redirects HTTP to HTTPS:

```javascript
function handleHttpRedirect(req, res) {
  const host = req.headers.host || 'ela.city';
  const redirectUrl = 'https://' + host + req.url;
  res.writeHead(301, { 'Location': redirectUrl });
  res.end();
}
```

Test:
```bash
curl -sI http://test7.ela.city/
# HTTP/1.1 301 Moved Permanently
# Location: https://test7.ela.city/
```

---

## Troubleshooting

### Certificate Not Loading

```bash
# Check certificate files exist
ls -la /etc/nginx/ssl/wildcard/

# Check file permissions
sudo chmod 644 /etc/nginx/ssl/wildcard/ela.city.crt
sudo chmod 600 /etc/nginx/ssl/wildcard/ela.city.key
```

### Web Gateway Won't Start

```bash
# Check logs
sudo journalctl -u pc2-gateway -f

# Check if certificate is valid
openssl x509 -in /etc/nginx/ssl/wildcard/ela.city.crt -noout -dates
```

### Browser Shows "Not Secure"

1. **Clear browser cache** - Old self-signed cert may be cached
2. **Try incognito window** - Bypasses cache
3. **Hard refresh** - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

### Renewal Failed

```bash
# Check acme.sh logs
cat ~/.acme.sh/acme.sh.log

# Verify GoDaddy credentials
export GD_Key='<key>'
export GD_Secret='<secret>'
/root/.acme.sh/acme.sh --renew -d '*.ela.city' --debug
```

---

## Current Status

| Item | Status |
|------|--------|
| Wildcard Certificate | ✅ Active (`*.ela.city`) |
| Issuer | Let's Encrypt E7 |
| Valid From | Jan 22, 2026 |
| Valid Until | Apr 22, 2026 |
| Auto-Renewal | ✅ Configured (acme.sh cron) |
| HTTP→HTTPS Redirect | ✅ Enabled |

---

*Last Updated: January 22, 2026*
