# SSL Certificate Management

> How SSL certificates are managed for PC2 infrastructure

## Current Setup (Wildcard Certificate) ✅

### Certificate Details
- **Provider**: Let's Encrypt (ECDSA P-256)
- **Challenge**: DNS-01 (via GoDaddy API)
- **Tool**: acme.sh (cron-scheduled, daily at 23:40 UTC)
- **Scope**: `*.ela.city` + `ela.city` (wildcard)
- **Current cert**: issued **2026-05-15**, expires **2026-08-13** (90-day Let's Encrypt cycle, acme.sh auto-renews ~60 days in)
- **Next renewal cycle**: tracked by acme.sh at `/root/.acme.sh/*.ela.city_ecc/*.ela.city.conf` (`Le_NextRenewTimeStr`)

### Certificate Files (post-acme.sh path reconciliation, 2026-05-15)

After the deploy-path reconciliation on 2026-05-15 ([§ Operational History](#operational-history-2026-05-15)), acme.sh deploys directly to the path nginx reads from. **No more cabinet mismatch.**

```
/etc/letsencrypt/live/ela.city/   ← acme.sh installs here  ← nginx reads from here
├── cert.pem         # End-entity certificate
├── fullchain.pem    # End-entity + intermediate(s)
└── privkey.pem      # Private key (mode 0600)

/root/.acme.sh/*.ela.city_ecc/    ← acme.sh's internal source of truth (cert generation)
├── *.ela.city.cer
├── *.ela.city.key
├── fullchain.cer
└── *.ela.city.conf  # has Le_RealKeyPath + Le_RealFullChainPath pointing at /etc/letsencrypt/live/ela.city/
```

The pipeline is now fully autonomous: acme.sh's daily cron checks if renewal is due → if yes, issues a fresh cert from Let's Encrypt via the GoDaddy DNS-01 challenge → installs the new cert directly at `/etc/letsencrypt/live/ela.city/` → runs `systemctl reload nginx` to make it live. **No human in the loop.**

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

## Current Status (2026-05-15)

| Item | Status |
|------|--------|
| Wildcard Certificate (`*.ela.city`) | ✅ Active and served by nginx |
| Issuer | Let's Encrypt E8 (ECDSA) |
| Valid From | 2026-05-15 |
| Valid Until | 2026-08-13 (90-day cycle) |
| Auto-Renewal Tool | ✅ acme.sh cron (`40 23 * * *`) |
| Renewal Method | DNS-01 via GoDaddy API (creds in `acme.sh` config) |
| Front-end | nginx (since C-1, 2026-05-15) |
| Read path | `/etc/letsencrypt/live/ela.city/fullchain.pem` |
| Deploy path (acme.sh) | `/etc/letsencrypt/live/ela.city/` ✅ matches read path |
| HTTP→HTTPS Redirect | ✅ nginx-managed (301 from `:80`) |
| ACME challenge location block | ✅ `/.well-known/acme-challenge/` → `/var/www/html` (in `pc2-gateway` site) |
| End-to-end renewal verified | ✅ Forced renewal 2026-05-15 succeeded; nginx serves the fresh cert serial |

## Operational History (2026-05-15)

The cert stack went through three coordinated changes on 2026-05-15, all reversible with on-server scripts:

1. **C-1 nginx fronting** (14:54–14:57 UTC) — InterServer's gateway migrated to live behind nginx. Brought TLS termination under nginx so the cert path could be standardised.
2. **Zombie cleanup** (20:39 UTC) — Two pre-existing certbot renewal configs for unused single-domain certs (`cloud.ela.city`, `demo.ela.city`) were moved aside with `.disabled-<timestamp>` suffix. Both had been failing daily for weeks (port 80 collision); neither cert was actually used. Revert: `/root/revert-cert-zombies-20260515T203915Z.sh`. Snapshot: `/root/cert-zombies-cleanup-20260515T203915Z/`.
3. **acme.sh deploy-path reconciliation** (21:09 UTC) — acme.sh's `Le_RealFullChainPath` and `Le_RealKeyPath` updated to point at `/etc/letsencrypt/live/ela.city/` instead of `/etc/nginx/ssl/wildcard/`. Followed by a forced renewal to validate end-to-end: a fresh cert was issued by Let's Encrypt, installed at the new path, and nginx auto-reloaded to serve it. The serial currently visible on the wire (`05EB0E...`, valid May 15 → Aug 13) confirms the pipeline works. Revert: `/root/revert-acme-paths-20260515T210925Z.sh`. Snapshot: `/root/acme-path-reconcile-20260515T210925Z/`.

Going forward, the wildcard cert auto-renews itself with no human in the loop. Expected cadence: acme.sh checks every day at 23:40 UTC, renews when the cert is ≤30 days from expiry (roughly day 60 of 90), deploys directly to nginx's read path, and reloads nginx — all autonomously.

---

*Last Updated: 2026-05-15 21:15 UTC (post-reconciliation, end-to-end verified)*
