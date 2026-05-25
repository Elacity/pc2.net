# Wave 6 — Post-Cutover Hardening (SSRF / TLS / Auth-Binding)

**Task ID**: `SEC-2026-04-22-WAVE6-HARDENING`
**Created**: 2026-04-22
**Status**: 🟡 **Part 1 SHIPPED (4/8 + 1 deferred) — Part 2: 3/4 SHIPPED (A7, A11, A16); A8 PARTIALLY UNBLOCKED 2026-05-25 — DNS + cert prereqs landed, but live probe revealed a second prereq: Contabo's nginx routes `elastossmartchain.ela.city` to the wrong upstream (returns 404 "User not found" instead of ESC RPC). Server block needed on Contabo before code patch can ship safely. See §"2026-05-25 PM — A8 live-probe finding" below.**
**Priority**: P1 — close before kill-switches flip to strict (Phase C)
**Findings closed**: A6 (system restart shell), A7 (`curl|sh` install), A8 (TLS verify off), A9 (open path-proxy), A10 (unauth GraphQL/reindex), A11 (DNS-rebind SSRF bypass), A12 (wallet proposal binding), **A16 (`/file` unsigned capability URL)**, A18 (scheduler dangerous-action gate — added 2026-04-22 post-Wave-5 audit)
**Source**: Internal audit performed 2026-04-22. See [`SEC_2026_04_21_AUDIT_DISPOSITION.md`](../../../docs/handover/SEC_2026_04_21_AUDIT_DISPOSITION.md) §"Internal Audit Findings (2026-04-22)". A16 was discovered during the Wave 5 A4 sweep (2026-04-22) and rolled into this wave per Sash's call (`"for a16 i follow your reccomendation"`).

---

## Status snapshot — 2026-04-22

### ✅ Wave 6 part 1 — SHIPPED (commits on `feature/lit-chipotle-migration`)

| Finding | Commit | One-line |
|---|---|---|
| **A12** | `a731206f8` | Wallet proposals bound to originating wallet (approve/reject/execute return 403 on cross-wallet calls). |
| **A18** | `8b0a71fdd` | `requireOwner` gate on dangerous scheduler actions (`terminal_exec`, `terminal_script`, `git_pull`) at create / update. |
| **A10** | `d1c2036e4` | `authenticate` + per-IP rate limit (1/5min) on `/api/catalog/reindex`; per-IP rate limit only (30/min) on the two GraphQL forwarders (`authenticate` would break iframe Authorization-forwarding). |
| **A6**  | `61318414c` | System restart + Jetson commands moved to `execFileSync` argv form; pm2 candidates enumerated in JS via `readdirSync`; no shell, no glob, no env-var interpolation. |
| docs    | `7a971b6d1` | Hard-fixed table extended for the four above; D0 split into D0a (shipped) + D0b (remaining). |

### ✅ Wave 6 part 2 — 3/4 SHIPPED 2026-04-23 (commits on `feature/lit-chipotle-migration`)

| Finding | Commit | One-line |
|---|---|---|
| **A7**  | `01b2ed2dd` | `install-ollama` now downloads via `https.get` to a 0600 tmpfile (no shell pipe), SHA-256-verifies against the pinned constant `OLLAMA_INSTALL_SH_SHA256`, then `spawn('sh', [tmpfile])`. Mismatch → 503 with both expected and actual SHAs. Also gated by `requireOwner`. |
| **A11** | `9887429e7` | `/api/http` and `/api/download` now `dns.lookup({all,verbatim})` once, validate every returned IP against the private/loopback/link-local blocklist, then build a per-request `undici.Agent` with `connect.lookup` overridden to return the pinned IP — closing the rebind window. IPv6 ULA fc00::/7 + link-local fe80::/10 + IPv4-mapped + CGNAT 100.64/10 added to the blocklist. `undici@^7.19.1` pinned as a direct dep. |
| **A16** | `2a9e39386` | New `pc2-node/src/utils/fileUrlSigner.ts` (HMAC-SHA256 sign+verify, 32-byte key at `data/.file-url-signing-key` mode 0600, generated on first call, cached in memory). `handleFile` now verifies the URL on every request. `FILE_URL_SIGNING_REQUIRED` kill-switch defaults OFF for v1.2.1 → log-only window via `[file] legacy-unsigned`. All 3 server-side mint sites (`other.ts` /sign, `other.ts` open_item, `filesystem.ts` copy thumbnail) updated to produce real HMAC signatures with 24h TTL. |

### 🟡 Wave 6 part 2 — A8 PARTIALLY UNBLOCKED 2026-05-25 (one prereq remains)

| Finding | One-line | State |
|---|---|---|
| **A8**  | `/api/esc-rpc` TLS pinning — replace `rejectUnauthorized:false` with hostname + public CA (Option 1, locked-in). | **DNS + cert prereqs landed 2026-05-25 (PM).** (1) `A elastossmartchain.ela.city → 38.242.211.112` edited at GoDaddy; propagated globally (`dig +short elastossmartchain.ela.city` → `38.242.211.112` from multiple resolvers). (2) Contabo `*.ela.city` wildcard cert refreshed (NotAfter `2026-08-13`) — was 3 days expired prior to the session; pushed from InterServer's acme.sh live dir to Contabo, nginx gracefully reloaded, strict-TLS handshake verified externally. (3) InterServer's `/root/pc2/backup-to-contabo.sh` was patched in the same session to (a) refresh `/etc/nginx/ssl/wildcard/` from acme.sh's live dir before rsync, and (b) `systemctl reload nginx` on Contabo after rsync — so future renewals propagate without manual intervention. **NEW BLOCKER discovered 2026-05-25 PM via live probe**: Contabo's nginx routes the new hostname to a **different upstream** than the raw-IP path (the wildcard `*.ela.city` server block proxies `Host: elastossmartchain.ela.city` to a user-profile backend; the default vhost is what proxies `/rpc/esc` correctly). Probe results: `https://elastossmartchain.ela.city/rpc/esc` returns `404 {"error":"User not found","username":"elastossmartchain"}` vs `https://38.242.211.112/rpc/esc` returns `{"result":"0x23253a6"}`. **Resolution**: add an explicit nginx server block on Contabo for `server_name elastossmartchain.ela.city;` with the same `location /rpc/esc { proxy_pass ... }` as the default vhost. ~30–45 min server work + reload. **Then** the code patch can safely ship (~30 min). See §"2026-05-25 PM — A8 live-probe finding" below. |

### 🔁 Deferred to Wave 6.5/7

| Finding | One-line |
|---|---|
| **A9**  | `esc-nft` prefix allowlist — per Sash's decision: enumerate every desktop UI `esc-nft/:path` call against the live UI for an hour first, then ship the allowlist. |

---

### 2026-05-25 PM — A8 live-probe finding

After the morning's DNS + cert work landed, an "are-you-confident-it-doesn't-break-anything?" check by Sash prompted an end-to-end **application-layer** probe (not just TLS handshake). The probe revealed that the DNS + cert prereqs are **necessary but not sufficient** to safely ship the A8 code patch.

#### The probe

```bash
# Path 1: NEW hostname, strict TLS — what A8 code patch would use
$ curl -sS https://elastossmartchain.ela.city/rpc/esc \
    -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
{"error":"User not found","username":"elastossmartchain"}   # ← HTTP 404, WRONG

# Path 2: raw IP, --insecure — what production does today
$ curl -sS --insecure https://38.242.211.112/rpc/esc \
    -X POST -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
{"jsonrpc":"2.0","id":1,"result":"0x23253a6"}               # ← current block, CORRECT
```

Same Contabo box (`38.242.211.112:443`), same cert, same port. Different upstream service depending on `Host:` header. Nginx is doing SNI/server_name routing as designed; we just don't have a server block for `elastossmartchain.ela.city` that exposes the `/rpc/esc` location.

#### What's happening at the nginx layer

Inferred from the response shape (`Server: nginx/1.18.0 (Ubuntu)` header + `{"error":"User not found","username":"elastossmartchain"}` body):

- **Raw-IP request** (`Host: 38.242.211.112`) → no `server_name` match → nginx falls through to the **default vhost**, which has the `/rpc/esc` `location` block proxying to the ESC RPC backend (likely a local Go-ethereum or similar service on Contabo). ✅
- **Hostname request** (`Host: elastossmartchain.ela.city`) → matches a **`*.ela.city` wildcard server block**, which proxies to a user-profile / marketplace backend that treats the first label of the hostname as a username and 404s on unknown handles. ❌

The wildcard catching unknown `*.ela.city` subdomains is intentional and useful (it serves per-user marketplace subdomains correctly), but it now intercepts our new ESC RPC hostname.

#### Why earlier verification missed it

What was verified this morning:
- ✅ DNS propagation (`dig +short` across 5 public resolvers)
- ✅ Cert validity + chain (`openssl s_client` confirmed `*.ela.city` LE cert, NotAfter `2026-08-13`)
- ✅ Strict-TLS handshake from external probe

What was **not** verified until the probe above:
- ❌ Application-layer behaviour when connecting by the new hostname

TLS handshake success only tells you you've reached the right **server**. It does not tell you nginx will route you to the right **upstream service** once inside. Layer-7 verification is its own check.

#### Resolution path

**Required server-side work on Contabo (before A8 code patch can ship safely):**

Add an explicit nginx server block on Contabo (alongside the existing default + wildcard vhosts):

```nginx
server {
    listen 443 ssl http2;
    server_name elastossmartchain.ela.city;
    ssl_certificate     /etc/ssl/elacity/fullchain.pem;
    ssl_certificate_key /etc/ssl/elacity/privkey.pem;

    location /rpc/esc {
        proxy_pass http://127.0.0.1:<port-of-current-esc-rpc-backend>;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # Reject other paths cleanly so we don't accidentally proxy unintended traffic
    location / {
        return 404;
    }
}
```

Pre-deploy checks:
1. SSH to Contabo, `nginx -T 2>&1 | grep -A 30 'server_name.*default\|listen.*default'` to find the existing `location /rpc/esc` block in the default vhost and copy its `proxy_pass` upstream verbatim.
2. Drop the new block into `/etc/nginx/sites-available/`, symlink to `sites-enabled/`, `nginx -t` for syntax, `systemctl reload nginx`.
3. Re-run the strict-TLS probe — expect JSON-RPC response, not "User not found".

Blast radius: low. Nginx server_name matching is exact-first, then wildcard. A new explicit block for `elastossmartchain.ela.city` does not affect the default vhost (raw-IP path still works → existing PC2 v1.2.7.x users keep working) and does not affect the wildcard (other `*.ela.city` subdomains keep routing as before).

**Alternative path (bundle into SUPERNODE-RPC-PROXY Phase 2):**

Since SUPERNODE-RPC-PROXY Phase 2 will already touch Contabo's nginx config (to add the `rpc.ela.city` server block fronting Alchemy), bundle the `elastossmartchain.ela.city` block into the same deploy. One `nginx -t && systemctl reload` for both new blocks. Cleaner; defers A8 by ~2-3h of RPC-proxy work.

**Effort revision for A8:**

| Component | Time | Status |
|---|---|---|
| DNS edit at GoDaddy | done 2026-05-25 | ✅ shipped |
| Contabo cert refresh | done 2026-05-25 | ✅ shipped |
| Auto-propagation pipeline patch on InterServer | done 2026-05-25 | ✅ shipped |
| Nginx server block on Contabo for `elastossmartchain.ela.city` | **30–45 min** | ⏳ **outstanding** (new) |
| Code patch (3 files, atomic commit) | 30 min | ⏳ outstanding (gated on nginx work above) |
| Verification + smoke + deploy | 15 min | ⏳ outstanding |
| **Total remaining** | **~75–90 min** | (was estimated as 30 min before this finding) |

#### Defence-in-depth note (no production impact today)

Until the nginx block + code patch ship, **existing PC2 v1.2.7.x users are unaffected** — they continue connecting by raw IP, hit the default vhost, get the working ESC RPC. The hostname-based path simply isn't exercised by any in-the-wild code yet. The A8 finding remains a defence-in-depth gap (MITM-able TLS), not an active outage.

### 🧪 Verification done so far

- `npx tsc --noEmit` clean across `pc2-node` after each of A6, A10, A12, A18 (part 1) and A7, A11, A16 (part 2).
- ESLint clean on every modified file.
- Gitleaks pre-commit pass on every commit (8/8 commits on the branch — 5 part 1 + 3 part 2).
- A11 IPv4-private regex: 11/11 unit cases (loopback, RFC1918, link-local, CGNAT, public allow incl. `8.8.8.8` and `38.242.211.112`).
- A16 fileUrlSigner: 12/12 functional cases (key persistence, sign/verify roundtrip, tampered uid/expires/signature rejected, expired URLs rejected, legacy URLs accepted with `legacy: true` when kill-switch off, legacy URLs rejected when kill-switch on, real HMAC continues to work in both kill-switch states).
- Wave 6 smoke-test script (`pc2-node/scripts/wave6-smoke.sh`) — only A8 remains from part 2; the script will land alongside the A8 commit so we can run the full part-2 matrix in one pass.

---

## TL;DR for a 9th grader

These eight items are not RCE — none of them lets an attacker run code on your machine. But each one weakens defence in depth, and a few of them (A8, A11, A12, A16) do real damage if they land in the wrong situation:

1. **A6 — system restart**: the restart command runs `bash` with environment-variable expansion. Today the env vars are server-controlled, so it's safe. But if anything in the future routes user input into `process.env`, it becomes RCE. We're closing it now while it's cheap.
2. **A7 — install-ollama**: `curl https://ollama.com/install.sh | sh`. If ollama.com or its CDN gets hijacked, our nodes execute whatever script the attacker hands back. Pin a SHA-256 hash so a swapped script gets rejected.
3. **A8 — esc-rpc TLS**: we proxy a hard-coded IP and we *intentionally disabled certificate verification* (probably because the IP didn't match the cert). That's a man-in-the-middle hole — anyone on the path between us and Contabo can rewrite the JSON-RPC response and feed our node fake on-chain data.
4. **A9 — esc-nft proxy**: we forward any path the caller asks for to `https://ela.city/api/<their path>`. No allowlist. So `/api/esc-nft/admin/secret` becomes `https://ela.city/api/admin/secret`. Lock to the few endpoints we actually use.
5. **A10 — unauth GraphQL + reindex**: anyone on the network can spam the catalog reindexer or fire heavy GraphQL queries. Add auth + per-IP rate limit.
6. **A11 — SSRF DNS-rebind**: our HTTP-client allowlist checks the hostname's IP at *check time*. If the attacker controls the DNS, they return a public IP at check time and `127.0.0.1` at fetch time. We need to pin the IP we resolved, then connect to *that* IP.
7. **A12 — wallet proposals**: any tethered wallet can approve another wallet's pending transaction proposals in the database. The actual on-chain `eth_signTypedData_v4` is still gated by the wallet that holds the key, so this can't drain funds — but it can falsify our records and confuse the owner.
8. **A16 — `/file` unsigned URL**: the `GET /file?uid=…` endpoint advertises itself in code comments as a "signed URL" for sharing files with iframe apps and previews — but the handler performs **no signature verification at all**. It just parses the wallet address out of the `uid` and returns the matching file. Today that means anyone who can guess or stumble on a `uid` (which contains the file's filename) can fetch the file, no auth needed. Fix: actually verify a signature embedded in `uid` against the owner's session key, with TTL.

These ship as v1.2.1, ideally within 14 days of v1.2. They are **not release-blockers** because (a) none of them are RCE, (b) most can't be abused without already having a session, (c) A16's exposure is bounded by filename unpredictability (the attacker has to guess `0xWALLET-Folder-filename.png`), and (d) the kill-switches in Wave 2/3 don't flip until T+7/T+14 anyway, so v1.2 is no worse than v1.1 on these surfaces during the window.

---

## Why this wave exists

After Wave 5 closed the RCE/cross-user holes, this is the next concentric layer: assume the attacker already cleared `authenticate` (i.e. has *some* valid session, maybe via the legitimate Particle flow on their own wallet) and is now reaching for ways to:

- Get the node to talk to a server they control (SSRF — A8, A9, A11)
- Trick the node into trusting a swapped supply-chain artifact (A7)
- Spam the node into resource exhaustion (A10)
- Falsify records that the owner relies on for decisions (A12)
- Find a future foothold by leaving brittle shell patterns lying around (A6)

These are all "second-order" risks. None of them can take over the node alone, but each one would amplify a future bug or insider misuse.

---

## What this wave does

### Fix A6 — `/api/system/restart` shell-mode polish

**File**: `pc2-node/src/api/system.ts`

**Today**: Lines 112-119 run `execSync(cmd, { shell: '/bin/bash', stdio: 'ignore' })` for a list of *server-derived* restart commands. The strings include `${process.env.HOME}/...` for glob expansion. As written, `process.env.HOME` is set by the OS at boot and not influenced by any HTTP input. Safe today.

**Why fix it**: Anyone reading the file later might assume "shell + env-var expansion" is a normal pattern and copy it into a handler that does take user input. Closing it removes the temptation.

**Fix**:
1. Replace the array of shell-string commands with an array of `[binary, ...args]`:
   ```ts
   const restartCommands = [
     ['systemctl', '--user', 'restart', 'pc2-node'],
     ['pm2',       'restart', 'pc2-node'],
     ['launchctl', 'kickstart', '-k', `gui/${process.getuid?.() ?? ''}/com.elacity.pc2`],
     ['killall',   '-HUP', 'pc2-node'],   // last resort
   ];
   ```
2. Switch to `execFile(cmd[0], cmd.slice(1), { stdio: 'ignore', timeout: 30000 })`.
3. The `${process.env.HOME}` glob was used by one of the dev-mode commands; resolve it in JS with `path.join(os.homedir(), '...')` instead and pass the resolved path as an argv item. No glob expansion needed — restart targets a single known file.

**UX impact**: Zero. Same OSes, same restart behaviour, same fallback chain.

### Fix A7 — `/api/ai/install-ollama` SHA-256 pin

**File**: `pc2-node/src/api/ai.ts`

**Today**: Line ~987 spawns `sh -c 'curl -fsSL https://ollama.com/install.sh | sh'`. This is the standard ollama.com instruction, but it's trust-on-first-use against ollama.com + their CDN.

**Fix** (two-step):
1. Download the script first into a temp file via `https.get` to a *fixed path* (no shell):
   ```ts
   const tmpScript = path.join(os.tmpdir(), `ollama-install-${Date.now()}.sh`);
   await downloadToFile('https://ollama.com/install.sh', tmpScript);
   ```
2. Verify SHA-256 against a constant pinned in the source. If it mismatches, **abort and surface the error**:
   ```ts
   const PINNED_SHA256 = '<pin from manual verification on release day>';
   const actual = await sha256OfFile(tmpScript);
   if (actual !== PINNED_SHA256) {
     return res.status(503).json({
       error: 'Ollama install script SHA mismatch. Refusing to execute.',
       expected: PINNED_SHA256,
       actual,
     });
   }
   ```
3. Then `execFile('sh', [tmpScript], opts)`.
4. Owner-only: this endpoint already needs `requireOwner` if it doesn't have it; verify and add if missing.

**Pin update process**: when ollama upstream updates the script (rare), the v1.2.x patch releaser:
1. Inspects the diff manually (`curl -O ollama.com/install.sh; diff old new`)
2. If safe, updates `PINNED_SHA256` in source
3. Bumps PC2 patch version
4. Releases

**UX impact**: First-time installs work the same. If ollama.com gets hijacked, owners see a clear error instead of a silent compromise.

### Fix A8 — `/api/esc-rpc` TLS pinning

**File**: `pc2-node/src/api/index.ts`

**Today**: Lines 1049-1052 instantiate an HTTPS agent with `rejectUnauthorized: false` and proxy JSON-RPC to a hard-coded Contabo IP. The reason for `rejectUnauthorized: false` is presumably that the IP doesn't match the cert (CN binding), but the cure is worse than the disease.

**Live probe (2026-04-23) — corrects an earlier mistake in this doc:**
- `38.242.211.112:443` already serves a **valid Let's Encrypt wildcard `*.ela.city`** (NotBefore `2026-02-20`, NotAfter `2026-05-21`, auto-renewing). The `// self-signed cert` comment in `index.ts:1089` is wrong.
- `https://38.242.211.112/rpc/esc` returns valid `{"result":"0x22ac22e"}` for `eth_blockNumber` — endpoint is healthy.
- The **only** thing blocking `rejectUnauthorized: true` is that we connect by raw IP, so TLS hostname verification fails. Adding any `*.ela.city` A record pointing at the IP fixes it instantly.

**Fix — Option 1 (locked-in)**:
1. Sash adds DNS record: `A elastossmartchain.ela.city → 38.242.211.112` (TTL 30 min). *(Hostname locked-in: `esc.ela.city` is already taken; `elastossmartchain.ela.city` is descriptive and available. Wildcard cert covers it automatically.)*
2. Agent waits ~5 min, verifies with `dig +short elastossmartchain.ela.city`.
3. Switch the proxy from `hostname: '38.242.211.112', port: 443, path: '/rpc/esc'` → `hostname: 'elastossmartchain.ela.city', port: 443, path: '/rpc/esc'`.
4. Drop the custom `https.Agent({ rejectUnauthorized: false })` — use the default agent. Standard public-CA verification works.
5. Migrate the **other 4 call sites** that hit the same IP with `rejectUnauthorized: false` to the same hostname:
   - `pc2-node/src/api/chipotle-client.ts:48` (DDRM provisioning URL list)
   - `pc2-node/src/services/boson/ConnectivityService.ts:68,71,79` (supernode failover)
   - (libp2p multiaddrs in `pc2-node/src/storage/ipfs.ts:54-55` are not HTTPS — leave alone.)
6. Remove the wrong code comment (`// self-signed cert`).

**Blocker (2026-04-23)**: Sash is travelling. His DNS provider requires SMS 2FA on a number he can't reach. Parked until he's back at his usual SIM. **No SSH, no Contabo console, no cert provisioning required** — everything is already in place; this is one DNS record.

**Option 2 (cert pinning) — rejected**: Now that we know the cert is real public-CA, pinning would be strictly worse (annual rotation burden vs. zero ongoing maintenance with Option 1).

**Plus**: rate-limit `/api/esc-rpc` per IP to 60 req/min. Today it has no limit, so it can be used to amplify outbound traffic to Contabo from a compromised tethered wallet.

**UX impact**: None for the owner. The on-chain query path now has authenticated TLS — chain data we trust is actually the chain.

### Fix A9 — `/api/esc-nft/:path(*)` allowlist

**File**: `pc2-node/src/api/index.ts`

**Today**: Lines 1082-1098 forward any subpath under `/api/esc-nft/` to `https://ela.city/api/<that path>`. Open proxy.

**Fix**:
1. Allowlist the specific endpoints the desktop UI uses:
   ```ts
   const ESC_NFT_ALLOWED = new Set([
     'tokens/byOwner',
     'collections/byOwner',
     'metadata/refresh',
     // …add the actual list after grepping the desktop UI
   ]);
   ```
2. Reject anything not on the list with `404`.
3. Add an integration test that exercises every entry in the allowlist (so we know what's actually used and removing one breaks visibly).
4. Add `requireOwner` if the proxy is for owner-only data; otherwise leave unauthenticated but rate-limit.

**UX impact**: Zero — every legitimate UI call survives. Attacker probes for `/api/esc-nft/admin/...` get clean 404.

### Fix A10 — Unauth catalog reindex + GraphQL proxies

**File**: `pc2-node/src/api/index.ts`

**Today**: Three endpoints have no auth:
- `POST /api/catalog/reindex` (line ~470) — kicks off a heavy DB scan
- `POST /api/elacity/graphql` (line ~1009) — proxies arbitrary GraphQL queries to ela.city
- `POST /api/esc-nft/graphql` (line ~1029) — proxies to esc-nft

Any unauthenticated caller on the LAN (or via mDNS hostname guess on a roaming Mac) can spam these.

**Fix**:
1. Add `authenticate` to all three. None of them serves a public-facing purpose — they're all called from the desktop UI or the iframe apps.
2. Add per-IP rate limit: 30 req/min for `/api/elacity/graphql`, 30 req/min for `/api/esc-nft/graphql`, **1 req/5min** for `/api/catalog/reindex` (the indexer is heavy — re-indexing more than once per 5min is a DoS even by an honest user).
3. Use the existing `expressRateLimit` middleware; no new dependency.

**UX impact**:
- Tethered/owner: nothing changes — they have a session, they pass `authenticate`, the rate limits are far above normal use.
- An iframe app that hits these directly without a session token: gets 401 and must use the scoped-session token flow (which it should already be using post-Wave 1).

### Fix A11 — `/api/http` SSRF DNS-rebind protection

**File**: `pc2-node/src/api/http-client.ts`

**Today**: `isBlockedHost(url)` parses the hostname, checks it against a hostname blocklist + private-IP regex. The check is at *URL parse time*, but the actual `fetch()` call later resolves the hostname **again** when the connection is made. An attacker who controls the DNS for `evil.com` can:

1. Set `evil.com`'s A-record to `1.2.3.4` (a public IP) with TTL=0
2. Wait for our check to pass (`1.2.3.4` is not in the blocklist)
3. Flip the A-record to `127.0.0.1` between our check and our fetch
4. Our `fetch('https://evil.com/...')` now hits the loopback API surface

**Fix**:
1. Replace `isBlockedHost(url)` with `resolveAndValidate(url)` that:
   - Calls `dns.lookup(hostname, { all: false })` to get the resolved IPv4/IPv6
   - Checks the **resolved IP** against private/loopback/link-local ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, IPv6 ::1, fc00::/7, fe80::/10)
   - Returns the resolved IP for the caller to use
2. Then construct the actual fetch with `lookup` overridden to a custom function that returns the **already-resolved IP** — preventing the second DNS lookup from returning a different value:
   ```ts
   const resolvedIp = await resolveAndValidate(parsedUrl.hostname);
   const agent = new http.Agent({
     lookup: (host, opts, cb) => cb(null, resolvedIp, isV6 ? 6 : 4),
   });
   await fetch(url, { agent, ... });
   ```
3. Extend the blocklist to cover IPv6 ULA/link-local that the current regex misses.
4. Add an integration test using a stub DNS server (Node's `dgram`-based) that flips the answer between the validation lookup and the fetch lookup, and confirms the fetch hits the validated IP not the flipped one.

**UX impact**: Owner-facing and AI-agent-facing HTTP calls work the same. Attackers using DNS rebinding from a malicious agent prompt get a clean error.

### Fix A12 — Wallet proposal handler binding

**File**: `pc2-node/src/api/wallet.ts`

**Today**: Lines 99-103 (approve), 160-… (reject), 199-… (execute) authenticate the request and look up the proposal by id, but never check that `proposal.walletAddress === req.user.wallet_address`. Any tethered wallet can approve, reject, or attempt to execute another wallet's proposal in the database.

The on-chain side is still safe — actual signing happens in the wallet that holds the key — but `execute` does flip the proposal record to `executed`, and `approve`/`reject` flip status. The owner relies on these records when reviewing AI-proposed transactions.

**Fix**: One-line check at the top of each of the three handlers:

```ts
const proposal = await proposalsDb.get(id);
if (!proposal) return res.status(404).json({ error: 'proposal not found' });

if (proposal.walletAddress.toLowerCase() !== req.user.wallet_address.toLowerCase()) {
  return res.status(403).json({ error: 'this proposal belongs to a different wallet' });
}
```

Apply to `/proposals/:id/approve`, `/proposals/:id/reject`, `/proposals/:id/execute`. Same shape; copy-paste the guard.

**UX impact**: Zero for normal use. AI agents that propose on behalf of the owner already use the owner's wallet. An attacker (tethered wallet) trying to approve the owner's pending proposal gets a clean 403 toast.

### Fix A16 — `/file` signed URL must actually be signed

**File**: `pc2-node/src/api/file.ts` (`handleFile`), mounted at `app.get('/file', handleFile)` in `pc2-node/src/api/index.ts`. Note: **no auth middleware is wired**, by design — this is supposed to be a "capability URL" that the desktop and iframe apps can hand to a `<video>` / `<img>` tag without dragging the session token into the markup.

**Today**: The handler header documents the route as serving "signed file access" with the comment `// signature verified in query`. In practice no signature is parsed and no crypto is performed. The flow is:

1. Caller hits `/file?uid=<random-uuid>--0xWALLET-Desktop-foo.png`
2. Handler regex-extracts the wallet (`0xWALLET`) and the path tail (`Desktop-foo.png` → `Desktop/foo.png`)
3. Handler returns the file from `data/files/0xWALLET/Desktop/foo.png`

The only thing standing between an attacker and another user's file is the unpredictability of the filename. Filenames are not secrets — they leak via thumbnails, NFT metadata, share links, screenshots, etc.

**Fix** (signed token in URL — same shape as S3 pre-signed URLs):

1. **Mint side** (wherever the desktop/iframe code currently builds a `/file?uid=…` URL): build a payload `{ wallet, path, exp, nonce }`, HMAC it with a server-side key (`config.security.fileUrlSigningKey` — generated at first boot, persisted in `config.json` mode 0600), base64url the payload + sig, and append as `?uid=<payload>.<sig>`.
   - TTL: 10 minutes default; 1 hour for owner-initiated downloads.
   - Owner's session is the implicit signer — the URL embeds the wallet that owns the file, never the requesting wallet's session token.

2. **Verify side** (`handleFile`):
   ```ts
   const { uid } = req.query;
   const verified = verifyFileUrlToken(uid as string, fileUrlSigningKey);
   if (!verified) {
     logger.warn('[file] invalid or expired uid', { uid: redact(uid) });
     return res.status(403).json({ error: 'invalid_or_expired_url' });
   }
   const { wallet, path, exp } = verified;
   if (Date.now() > exp) return res.status(403).json({ error: 'expired_url' });
   // existing path-resolve + send-file logic, scoped to the verified wallet+path
   ```

3. **Backwards compatibility**: existing v1.1 nodes that hand out the old un-signed `uid` format must keep working through the v1.2.0 → v1.2.1 window. Implement a `siweRequired`-style kill-switch:
   - `config.security.fileUrlSigningRequired` — defaults to `false` for v1.2.1 ship. When `false`, an unsigned uid logs `[file] legacy-unsigned uid=…` but is still served.
   - When `true` (flip at T+7d after v1.2.1), unsigned uids return 403.
   - This mirrors the SIWE / GW_AUTH_REQUIRED rollout pattern — same ops playbook, no surprises.

4. **Generation site sweep**: grep the desktop UI + iframe SDK for places that build `/file?uid=` URLs and convert them to call the new minter helper. Likely sites: thumbnail components, file viewer, AI agent file-attachment payloads. List enumerated at CP-2 of Wave 6 implementation.

**UX impact during log-only (default in v1.2.1)**:
- Owners and tethered wallets: zero. Existing UI keeps working with old uids. Logs surface every legacy call so we can confirm the desktop UI has been updated before flipping strict.
- Attackers: zero in v1.2.1 (kill-switch off). Same posture as v1.2.0.

**UX impact after kill-switch flip (T+7d into v1.2.1)**:
- Owners and tethered wallets: still zero (UI now mints signed urls).
- Attackers guessing filenames: 403, no file served.
- Old desktop builds: get 403 on file previews until they upgrade. This is the entire reason for the kill-switch lag.

---

## Telemetry log format

Every Wave 6 fix produces structured deny/anomaly logs:

```
[ssrf] denied url=… resolved=… reason=loopback
[ssrf] denied url=… resolved=… reason=private
[ssrf] dns-mismatch url=… check-ip=… connect-ip=…   (hard-deny — would-be DNS rebind)
[supplychain] sha-mismatch script=ollama-install expected=… actual=…
[proxy] denied path=… reason=not-in-allowlist     (esc-nft)
[wallet] proposal-mismatch req-wallet=… proposal-wallet=…
[ratelimit] /api/catalog/reindex ip=… retry-after=…
[file] legacy-unsigned uid=…   (log-only window, A16 kill-switch off)
[file] invalid-signature uid=… reason=bad-mac
[file] expired-signature uid=… age-ms=…
```

Same `journalctl | rg` pattern as Wave 3.

---

## Smoke matrix to execute at CP-5

| # | Test | Expected |
|---|------|----------|
| 1 | `POST /api/system/restart` as owner | 200, node restarts via `execFile` (no shell) |
| 2 | `POST /api/ai/install-ollama` with SHA matching pin | 200, install proceeds |
| 3 | Pin SHA tampered to wrong value, retry #2 | 503 with explicit "SHA mismatch" message |
| 4 | `POST /api/esc-rpc` to a known JSON-RPC method | 200 + valid response, TLS verified |
| 5 | `tcpdump` during #4 | Cert validation observed against correct hostname |
| 6 | `GET /api/esc-nft/tokens/byOwner` | 200 (allowlisted) |
| 7 | `GET /api/esc-nft/admin/secret` | 404 (not allowlisted) |
| 8 | Unauth: `POST /api/catalog/reindex` | 401 |
| 9 | Unauth: `POST /api/elacity/graphql` | 401 |
| 10 | 31 reqs in 1min to `/api/elacity/graphql` from one IP | 429 on req 31 |
| 11 | 2 reqs in 5min to `/api/catalog/reindex` | 429 on req 2 |
| 12 | `/api/http` to `https://localhost.example.com` (DNS resolves to 127.0.0.1) | denied=ssrf reason=loopback |
| 13 | `/api/http` to `https://[::1]/foo` (IPv6 loopback) | denied=ssrf |
| 14 | `/api/http` with rebound DNS (test harness) | denied=dns-mismatch (or fetch hits validated IP) |
| 15 | Wallet A: `/proposals/<wallet-B-proposal>/approve` | 403 proposal-mismatch |
| 16 | Wallet A: `/proposals/<wallet-A-proposal>/approve` | 200 (own proposal) |
| 17 | `/file?uid=<freshly-minted signed uid for owner's file>` | 200, file body |
| 18 | `/file?uid=<expired signed uid>` | 403 expired_url |
| 19 | `/file?uid=<signed uid with mac flipped>` | 403 invalid_or_expired_url |
| 20 | `/file?uid=<unsigned legacy format>` with kill-switch OFF | 200 + `[file] legacy-unsigned` log line |
| 21 | `/file?uid=<unsigned legacy format>` with kill-switch ON | 403 invalid_or_expired_url |
| 22 | `/file?uid=<signed uid for wallet A>` requested with no auth | 200 (capability URL is the auth) |

Test harness lives at `pc2-node/tests/security/wave6-smoke.sh`.

---

## Files

### Modified

- `pc2-node/src/api/system.ts` — restartCommands → argv, `execFile` only
- `pc2-node/src/api/ai.ts` — `install-ollama` SHA-pin + `requireOwner`
- `pc2-node/src/api/index.ts` — `/api/esc-rpc` TLS hardening, `/api/esc-nft/:path(*)` allowlist, `authenticate` + rate-limit on catalog/reindex + GraphQL proxies
- `pc2-node/src/api/http-client.ts` — DNS-rebind-safe SSRF protection (resolve once + pin agent lookup)
- `pc2-node/src/api/wallet.ts` — owner-binding guard on approve / reject / execute
- `pc2-node/src/api/file.ts` — `handleFile` HMAC verification + TTL on `?uid=…` (A16) + `fileUrlSigningRequired` kill-switch
- Frontend `/file?uid=` mint sites — replace direct concatenation with new `mintFileUrlToken()` helper (full list enumerated at CP-2)

### Created

- `.cursor/tasks/SEC-2026-04-22-WAVE6-HARDENING/SEC-2026-04-22-WAVE6-HARDENING.md` (this file)
- `pc2-node/tests/security/wave6-smoke.sh` — 22-case smoke matrix (16 from A6-A12, 6 from A16)
- `pc2-node/tests/security/dns-rebind-stub.js` — Node DNS test stub that flips answers between two requests
- `pc2-node/src/utils/fileUrlSigner.ts` — `mintFileUrlToken()` + `verifyFileUrlToken()` HMAC helper for A16

### Possibly created (Sash to choose for A8)

- ~~`pc2-node/src/services/elastos/pinned-ca.pem`~~ — **N/A**. Decision locked-in 2026-04-23: Option 1 (hostname `elastossmartchain.ela.city`). No new file needed.

---

## Deploy plan

1. **Bundle as `v1.2.1`** — patch release within 14 days of v1.2 cutover. Each fix in its own commit.
2. **Quality gates** — `npm run test:security` + `wave5-smoke.sh` + `wave6-smoke.sh` all green.
3. **Roll out via the standard PC2 update channel** — owners get `/api/update/install` notification (which itself is now owner-gated thanks to Wave 1). This is normal patch behaviour; no special steps.
4. **Monitor**: any `[ssrf] dns-mismatch` log line is a real attack signal — alert on it.

---

## Rollback

Each fix is independently revertable; none have schema changes:

| Fix | Reverts to |
|---|---|
| A6 | Brittle shell pattern returns; not exploitable today |
| A7 | TOFU on ollama.com returns; medium risk |
| A8 | TLS verification disabled; medium MITM risk |
| A9 | Open proxy returns; low — but path-injection re-opens |
| A10 | Unauth GraphQL/reindex returns; DoS risk |
| A11 | DNS-rebind bypass returns; medium SSRF risk |
| A12 | Cross-wallet proposal manipulation returns; low (signing still safe) |
| A16 | Toggle `fileUrlSigningRequired` back to `false` (already the default) — restores log-only behaviour without redeploy |

Standard rule: fix forward, don't revert.

---

## Acceptance criteria

- [ ] `rg "shell:.*bash" pc2-node/src/api/system.ts` returns 0
- [ ] `rg "rejectUnauthorized.*false" pc2-node/src` returns 0 outside test harnesses
- [ ] `rg "curl.*\|.*sh" pc2-node/src` returns 0 outside Wave 6 SHA-pinned helper
- [ ] `/api/esc-nft/<not-in-allowlist>` returns 404 (verified by smoke test)
- [ ] `/api/catalog/reindex` requires auth + 429s on 2nd call within 5min
- [ ] `/api/http` to a DNS-rebind harness fetches the validated IP, not the flipped IP
- [ ] `/api/wallet/proposals/:id/approve` returns 403 when caller's wallet ≠ proposal wallet
- [ ] `/file?uid=<unsigned>` is logged as `[file] legacy-unsigned` while `fileUrlSigningRequired=false`; returns 403 when flipped to `true`
- [ ] `/file?uid=<signed-and-fresh>` returns 200 regardless of switch state
- [ ] `/file?uid=<signed-but-mac-tampered>` returns 403 regardless of switch state
- [ ] `mintFileUrlToken()` is the only place the desktop UI builds `?uid=…` (verified by `rg "/file\?uid=" src/` returning 0 outside the helper)
- [ ] All 22 wave6-smoke cases pass
- [ ] `npm run test:security` clean

---

## UX notes

| User type | Before Wave 6 | After Wave 6 |
|---|---|---|
| **Owner** | Everything works (with quiet vulns underneath) | Everything works; on-chain RPC now actually verified; ollama install fails-loud if upstream tampered |
| **AI agent** (running as owner) | Can be coerced into SSRF by malicious prompt | DNS-rebind blocked; private IPs still blocked; same legitimate URLs work |
| **Tethered wallet** | Could mess with owner's wallet proposal records | Sees their own proposals only |
| **Unauth LAN attacker** | Could spam reindex/graphql; could probe esc-nft path-injection | All blocked at 401 / 404 |
| **Unauth attacker guessing `/file?uid=` filenames** | Could fetch any file whose name they guessed (no crypto check) | After kill-switch flip: 403. During log-only window: same as today, but every legacy hit is logged. |

No UI changes needed. All Wave 6 fixes are server-side and transparent to legitimate flows.

---

## Known follow-ups (Wave 7)

- **A13** — CORS allowlist `.includes('.ela.city')` matches `evil-ela.city`. Tighten to suffix match.
- **A14** — `auditMiddleware` logs full session token at INFO. Redact.
- **A15** — Capsule-unsigned app installs warn-only. Already on v2 roadmap; Wave 7 records the decision.

---

## Open questions for Sash before kickoff

1. **A7 SHA pinning** — are we OK with a manual SHA bump in PC2 patch release whenever ollama updates upstream? Alternative is to mirror our own copy of `install.sh` and have it be a Wave-7 ongoing task.
2. ~~**A8 — Option 1 vs Option 2**~~ — **Resolved 2026-04-23**: Option 1, hostname `elastossmartchain.ela.city`. Awaiting Sash's DNS record once he's back at his usual SIM (DNS provider 2FA).
3. **A9 — esc-nft allowlist** — I'll grep the desktop UI for the actual paths used and propose the list; please confirm before merge.
4. **A16 TTL** — proposal: 10 minutes for embedded thumbnails / iframe previews, 1 hour for owner-initiated downloads. Acceptable, or do you want shorter / longer?
5. **A16 kill-switch** — same `T+7d into v1.2.1` schedule as SIWE / GW_AUTH? Or do you want to flip immediately on v1.2.1 ship since the desktop will ship the minter in the same release?
