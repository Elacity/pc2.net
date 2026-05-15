# Task: GoDaddy DNS Backlog — When Back From Travel

**Task ID**: GODADDY-DNS-BACKLOG-2026-05
**Created**: 2026-05-15
**Status**: Agreed (blocked on travel return)
**Priority**: **HIGH** — items here are unblocking multiple downstream work streams
**Owner**: Sasha (DNS access portion) + Agent (server-side portion)
**Trigger to start**: Sasha back from current travel cycle with access to Thailand SIM for GoDaddy SMS 2FA

## Description

This task consolidates **all DNS-related work currently blocked** on GoDaddy access. GoDaddy is the DNS provider for `ela.city`, and SMS 2FA is tied to a Thailand-only phone number that's unreachable while Sasha is travelling internationally. Multiple in-flight workstreams are paused waiting on a single short DNS-management session.

This document is **the consolidated execution checklist** for when Sasha is back. Linked tasks remain authoritative for the deeper context of each item; this doc gives one place to look at the queue.

## Background

During the supernode RCE remediation (2026-05-15) and related infrastructure audit, two independent items were identified that share the same blocker — they need DNS changes at GoDaddy:

1. **TLS pinning fix** (security gap, SEC-2026-04-22-WAVE6 item A8) — switch 5 `rejectUnauthorized: false` call sites to proper TLS verification by introducing a named hostname instead of a raw IP.
2. **Supernode RPC proxy** (decentralisation milestone, SUPERNODE-RPC-PROXY) — ship a hostname-fronted RPC endpoint so v1.2.8 PC2 nodes can stop depending on public Alchemy/Infura RPC.

A third item — reconciliation of acme.sh's deploy path with nginx's read path — was originally listed here but was **completed server-side on 2026-05-15** (no GoDaddy access was needed for it). See [§ Completed Items](#completed-items) below.

## Items In This Backlog

### 1. DNS: `elastossmartchain.ela.city` → `38.242.211.112`

| Field | Value |
|---|---|
| **Action** | Add A record at GoDaddy: `elastossmartchain.ela.city` → `38.242.211.112` (TTL 30 min) |
| **Why** | Contabo serves a valid `*.ela.city` wildcard cert from this IP, but PC2 code currently connects by raw IP and therefore can't do TLS hostname verification. Adding any `*.ela.city` A record pointing at the IP enables hostname-based TLS. |
| **Unblocks** | [SEC-2026-04-22-WAVE6-HARDENING](../SEC-2026-04-22-WAVE6-HARDENING/SEC-2026-04-22-WAVE6-HARDENING.md) Item A8 — switch 5 `rejectUnauthorized: false` call sites to verified TLS |
| **Verify** | `dig +short elastossmartchain.ela.city` returns `38.242.211.112` after ~5 min |
| **Post-action** | Agent runs the A8 code change: switches `hostname: '38.242.211.112'` → `hostname: 'elastossmartchain.ela.city'` in 5 places, removes 5 `rejectUnauthorized: false` flags, atomic commit, deploy via `scripts/deploy-supernode.sh` |

### 2. DNS: `rpc.ela.city` → `38.242.211.112`

| Field | Value |
|---|---|
| **Action** | Add A record at GoDaddy: `rpc.ela.city` → `38.242.211.112` (TTL 30 min) |
| **Why** | Need a stable, branded hostname for the supernode-fronted Alchemy/Infura proxy so PC2 nodes can default to it rather than public RPC providers. |
| **Unblocks** | [SUPERNODE-RPC-PROXY](../SUPERNODE-RPC-PROXY/SUPERNODE-RPC-PROXY.md) — deploy nginx → Alchemy/Infura proxy on Contabo, with cert via certbot DNS-01 |
| **Verify** | `dig +short rpc.ela.city` returns `38.242.211.112` after ~5 min |
| **Post-action** | Agent deploys `pc2-rpc-base.service` on Contabo, issues cert via certbot DNS-01 or extends wildcard coverage, updates `pc2-node/src/static.ts` to bake `https://rpc.ela.city/base` into default `BASE_RPC_URLS`. Ships in v1.2.8. |

### 3. (Optional) Verify / rotate GoDaddy API credentials

| Field | Value |
|---|---|
| **Action** | While in the GoDaddy dashboard already: review the Production API key. Confirm last-used date is recent (matching acme.sh renewals). Optionally rotate (issue new key, update `~/.acme.sh/account.conf`, revoke old). |
| **Why** | Credential hygiene. API keys silent-fail on use don't always alert; periodic rotation reduces blast radius if leaked. |
| **Verify** | After rotation: `/root/.acme.sh/acme.sh --renew -d '*.ela.city' --force` succeeds end-to-end (uses one of the 5/week Let's Encrypt rate-limit slots). |
| **Optional** | This is "nice to have" not blocking. Skip if short on time during the visit. |

## Completed Items

### ✅ Cert deploy-path reconciliation (completed 2026-05-15)

Originally listed as Item 3 in this backlog. Did not require GoDaddy access. Completed server-side on 2026-05-15 21:09 UTC.

| Field | Value |
|---|---|
| **Action taken** | On InterServer: ran `acme.sh --install-cert -d '*.ela.city' --ecc --key-file /etc/letsencrypt/live/ela.city/privkey.pem --fullchain-file /etc/letsencrypt/live/ela.city/fullchain.pem --reloadcmd "systemctl reload nginx"` to update install paths. Then ran `acme.sh --renew -d '*.ela.city' -d 'ela.city' --force --ecc` to validate the end-to-end pipeline. |
| **Outcome** | acme.sh now deploys to `/etc/letsencrypt/live/ela.city/` (same path nginx reads from). Forced renewal succeeded: fresh cert issued (serial `05EB0E...`), installed at the new path, nginx reloaded, external probe confirmed the new cert is served. Cert validity extended to **2026-08-13** (was 2026-07-27 before). |
| **Snapshot** | `/root/acme-path-reconcile-20260515T210925Z/` on InterServer |
| **Revert** | `/root/revert-acme-paths-20260515T210925Z.sh` (one-shot rollback if ever needed) |
| **Verified** | Live HTTPS probes on `demo.ela.city`, `map.ela.city`, `sash.ela.city` all healthy post-change. All 4 critical services (pc2-gateway, pc2-cluster, pc2-network-map, nginx) active. |

## Suggested execution order when back

1. **Item 1** — add A record `elastossmartchain.ela.city`. Agent waits for propagation, then ships the A8 code change. ~15 min including code change + deploy.
2. **Item 2** — add A record `rpc.ela.city`. Agent deploys `pc2-rpc-base.service`. ~30 min including config + cert + smoke.
3. (Optional) **Item 3** — credential rotation. ~5 min.

**Total**: ~45–50 min including buffer for DNS propagation between items.

## Acceptance Criteria

- [ ] `dig +short elastossmartchain.ela.city` resolves to `38.242.211.112`
- [ ] `dig +short rpc.ela.city` resolves to `38.242.211.112`
- [ ] 5 `rejectUnauthorized: false` flags removed from PC2 codebase
- [ ] `https://rpc.ela.city/base` serves valid JSON-RPC and is the default `BASE_RPC_URLS[0]` in `pc2-node/src/static.ts`
- [x] **Forced acme.sh renewal lands in `/etc/letsencrypt/live/ela.city/` and nginx serves the new cert serial** _(done 2026-05-15)_
- [ ] All affected services smoke-tested: `pc2-gateway`, `pc2-cluster`, `pc2-network-map`, `pc2-rpc-base` (Contabo), plus external HTTPS probes for `demo.ela.city`, `map.ela.city`, `elastossmartchain.ela.city`, `rpc.ela.city`

## Files Affected (anticipated)

- DNS records at GoDaddy (no repo file)
- `pc2-node/src/static.ts` (Item 1, Item 2)
- 4 additional call sites identified in SEC-2026-04-22-WAVE6 A8 (Item 1)
- `pc2-node/src/index.ts` if RPC proxy default routing changes (Item 2)
- `/etc/nginx/sites-available/pc2-rpc-base` on Contabo (Item 2) — server-side only
- `/etc/systemd/system/pc2-rpc-base.service` on Contabo (Item 2) — server-side only
- `/root/.acme.sh/*.ela.city_ecc/*.ela.city.conf` on InterServer (Item 3) — server-side only

## Testing Strategy

Each item has its own smoke tests; the consolidated suite for "all items complete" is:

```bash
# Item 1 verification
dig +short elastossmartchain.ela.city  # → 38.242.211.112
curl -fsS https://elastossmartchain.ela.city/rpc/esc -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | head

# Item 2 verification
dig +short rpc.ela.city  # → 38.242.211.112
curl -fsS https://rpc.ela.city/base -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | head

# Item 3 verification
echo | openssl s_client -servername demo.ela.city -connect demo.ela.city:443 2>/dev/null \
  | openssl x509 -noout -serial -dates  # Fresh serial + new notBefore date
```

## Linked Tasks

- [`SEC-2026-04-22-WAVE6-HARDENING`](../SEC-2026-04-22-WAVE6-HARDENING/SEC-2026-04-22-WAVE6-HARDENING.md) — A8 TLS pinning (Item 1 unblocks this)
- [`SUPERNODE-RPC-PROXY`](../SUPERNODE-RPC-PROXY/SUPERNODE-RPC-PROXY.md) — Alchemy/Infura proxy (Item 2 unblocks this)
- [`docs/pc2-infrastructure/SSL_CERTIFICATES.md`](../../../docs/pc2-infrastructure/SSL_CERTIFICATES.md) — current state of cert stack (Item 3 fixes the deploy-path mismatch flagged in §"Known Issues")

## Notes

- The acme.sh wildcard auto-renewal pipeline **is functioning** day-to-day (last successful renewal 2026-04-28); the deploy-path mismatch is a latent issue, not an active failure.
- Two zombie certbot renewal configs (`cloud.ela.city`, `demo.ela.city`) were cleaned up on 2026-05-15. Revert script on InterServer at `/root/revert-cert-zombies-20260515T203915Z.sh` if ever needed.
- GoDaddy API access is currently working (acme.sh credentials in `~/.acme.sh/account.conf`). No need to fetch new credentials unless rotating per Item 4.
- Items 1 and 2 are independent — either order works. Item 3 has no DNS dependency and can be done first or in parallel.
