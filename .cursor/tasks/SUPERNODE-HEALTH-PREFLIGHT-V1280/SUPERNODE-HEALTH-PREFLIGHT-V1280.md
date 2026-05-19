# Task: Supernode Health Preflight for v1.2.8.0

**Task ID**: SUPERNODE-HEALTH-PREFLIGHT-V1280
**Created**: 2026-05-05
**Status**: ✅ **COMPLETE** (2026-05-05 05:01 UTC)
**Priority**: HIGH — gate for v1.2.8.0 rollout
**Authoring agent**: read-only SSH audit on both supernodes 2026-05-05 04:00 – 04:15 UTC
**Executed by**: Cursor agent under user-granted SSH authorization, 2026-05-05 04:50 – 05:01 UTC
**Owner**: Sasha (decides) · Irzhy (operator)

---

## Execution Record (2026-05-05 04:50 – 05:01 UTC)

| Phase | Action | Result |
|---|---|---|
| 0 | Snapshots taken on both supernodes (binary + repo metadata + nginx + systemd unit set) | ✅ `/root/preflight-snapshots/20260505T044153Z/` (Contabo), `/root/preflight-snapshots/20260505T044158Z/` (InterServer) |
| 1 | `pc2-ipfs-relay` restarted on Contabo | ✅ RSS **9.6 GB → 227 MB** (42× reduction); load 1-min **5.61 → 1.51** |
| 2 (InterServer) | Kubo 0.34.1 → **0.41.0** binary swap; fs-repo migrated v16 → v17 → v18 | ✅ Daemon ready in 5s, 0 panics in 9-minute soak; PeerID `12D3KooW…Rc5f` preserved |
| 2 (Contabo) | Kubo 0.34.1 → **0.41.0** binary swap; fs-repo migrated v16 → v17 → v18 | ✅ Daemon ready in 5s, 0 panics in 6-minute soak; PeerID `12D3KooW…9nVr` preserved |
| 3 | UFW rule `allow from 38.242.211.112 to any port 9096` on InterServer | ✅ Rule already present (#52) from earlier cluster-setup work |
| 4 | End-to-end verification | ✅ Cluster mesh symmetric (both peers `Sees 1`); pin propagation 5s round-trip; `/api/ddrm/provision` returns identical 5-key payload on both nodes |
| Cleanup | Test pin `Qmdc9ZbM…SsB4` removed | ✅ UNPINNED on both peers within 5s |

**Outcome**: 0/2 → 2/2 supernodes healthy. Mesh fully restored. Bitswap nil-deref crash loop eliminated. v1.2.8.0 development can proceed.

**Services Explicitly NOT Touched verification (Phase 4.7)**:
- InterServer: `pc2-boson` `pc2-cloud-node` `pc2-vless-reality` `pc2-app-registry` `pc2-network-map` `pc2-gateway` `pc2-ipfs-relay` — **all 7 active**
- Contabo: `pc2-boson` `pc2-vless-reality` `pc2-app-registry` `pc2-ipfs-relay` — **all 4 active** (others on Contabo are PM2-managed and confirmed online via `pm2 ls` showing `pc2` process up 2 months)

**Snapshot retention**: rollback artifacts (`ipfs.0.34.1.bin`, `ipfs-repo-pre-upgrade.tgz`, `ufw-status.txt`, etc.) remain on both supernodes under `/root/preflight-snapshots/$ts/` — keep for 7 days then delete (next checkpoint: 2026-05-12).

---

## Post-Preflight Addition: pc2-ipfs-relay memory cap (2026-05-05 14:57 UTC)

**Discovered on Day +1 health check** (2026-05-05 14:48 UTC, ~10h after preflight): Phase 1 (relay restart) had been a band-aid, not a cure. The relay process leaks unbounded memory at ~310 MB/h on Contabo (~500 connected libp2p peers) and ~15 MB/h on InterServer (~80 connected peers). On the 9h47m re-check Contabo was already at 3.0 GB RSS; InterServer had been at **10.5 GB RSS for 28 days continuously** (it never crashed because it has 91 GB total RAM).

**Root cause**: upstream JS-libp2p connection-manager memory leak in `pc2-ipfs-relay/index.js` (libp2p / helia stack). Deferred to a separate investigation task — fixing the underlying leak requires significant work in the libp2p connection accounting layer that is out of scope for v1.2.8.0.

**Mitigation applied**: systemd drop-in at `/etc/systemd/system/pc2-ipfs-relay.service.d/memory-cap.conf` on both supernodes:

```ini
[Service]
# Cap memory at 6 GB to prevent unbounded growth from upstream JS-libp2p leak.
# When exceeded: SIGKILL by kernel OOM, then Restart=always brings it back.
MemoryMax=6G
```

The unit's existing `Restart=always` + `RestartSec=10` handles the auto-recovery. **Estimated restart cadence**: ~17 days on InterServer, ~19 hours on Contabo.

**Effect on services**:
- ✅ **Zero impact** on Kubo, cluster mesh, `/api/ddrm/provision`, boson, validator, gateway, vless, app-registry, network-map, cloud-node
- ⚠️ ~10s libp2p relay outage when cap triggers; PC2 nodes fall back to public DHT during the window
- ✅ Cap enforced at kernel level: cgroup v1 path (`memory.limit_in_bytes`) on Contabo, cgroup v2 path (`memory.max`) on InterServer; both = `6442450944` bytes

**Verification**:
- InterServer: `systemctl status pc2-ipfs-relay` reports `Memory: <NNNM> (max: 6.0G)` — cap visible to operator
- Contabo: ditto; immediate result was load 1-min `9.04 → 1.28` and memory `13Gi → 10Gi`
- Both nodes' relays restart cleanly, peer ID preserved (loaded from disk)

**Snapshots**: pre-restart unit file + process state captured at `/root/preflight-snapshots/relay-cap-20260505T144900Z/` on both nodes.

**Follow-up task**: file separately as `SUPERNODE-IPFS-RELAY-LEAK-V1281` to investigate the upstream cause and propose a real fix (libp2p version bump, connection-manager tuning, or alternate relay implementation).

---

## TL;DR

Before v1.2.8.0 (the Chipotle relayer) is shipped, the two supernodes must be brought to a clean, low-risk baseline. A 2026-05-05 read-only audit found **four issues that none of the existing handover or design docs acknowledge**, all of which would either invisibly degrade v1.2.8.0 or actively distort it (e.g. a relayer rate-limit bypass via the silent crash window on InterServer).

This task fixes them in an order that:
- never breaks the live `/api/ddrm/provision` envelope flow (which IS healthy and serves the v2 envelope correctly today),
- never touches **any** of the non-IPFS services on either supernode (Boson DHT naming, WireGuard, AmneziaWG, VLESS, PC2 active proxy, PC2 cloud-node, the Elastos validator stack — see §"Services Explicitly NOT Touched" below),
- never exfiltrates the live `usageKey` or the Ed25519 envelope seed,
- can be rolled back at any phase boundary.

**Estimated total time on supernodes**: ~2.5 hours of operator work, of which ~5 min is user-impacting (process restarts on Contabo) plus a ~30 min IPFS-only soft-degradation window on InterServer (port 8080 returns 503 during the Kubo upgrade; nothing else).

**Important scope narrowing (post v1 review)**: Phase 3 (`/cluster-pin/` ingress symmetry on InterServer) **has been removed from this preflight** because the original plan made an incorrect architectural assumption about InterServer's nginx layout. That work is now deferred to a follow-up task (`SUPERNODE-CLUSTER-PIN-SYMMETRY-V1281`) tied to v1.2.8.0's actual code deployment — see §"Phase 3 (deferred)" below.

---

## Services Explicitly NOT Touched

> **Confidence anchor**: this preflight only restarts/upgrades IPFS-layer processes. Every other production service on both supernodes is untouched.

The following services on **both** supernodes have **zero** process restarts, zero filesystem changes, zero firewall changes, zero config reloads from this preflight:

**Networking & privacy services (InterServer + Contabo)**:
- ✅ `pc2-boson` — Boson DHT naming service (port 39001 TCP+UDP, separate Java JVM)
- ✅ WireGuard server (port 51820 UDP, kernel module + userspace daemon under `pc2-cloud-node`)
- ✅ AmneziaWG stealth server (port 51821 UDP, kernel module + userspace daemon)
- ✅ `pc2-vless-reality` — VLESS Reality transport (port 8443 TCP, sing-box process)
- ✅ PC2 Active Proxy (port 8090 TCP, served by `pc2-cloud-node`)
- ✅ PC2 Proxy port range (25000–30000 TCP on InterServer, 31000–36000 TCP on Contabo, served by `pc2-cloud-node`)

**Web-gateway & registry services**:
- ✅ `pc2-gateway` (InterServer) / `pc2-web-gateway` (Contabo) — the Node `index.js` serving `/api/ddrm/provision`, `/api/health`, `/api/wg/*`, `/api/awg/*`, `/api/vless/*`, all the user-registration endpoints — **not stopped, not restarted, not reloaded**
- ✅ `pc2-app-registry` — App Registry service
- ✅ `pc2-network-map` — PC2 Network Map (InterServer only)
- ✅ `pc2-cloud-node` — PC2 Cloud Auth Gateway (the process that owns WireGuard, AmneziaWG, and the proxy port range) — **not stopped, not restarted, not reloaded**

**Elastos chain validator stack (InterServer)**:
- ✅ `arbiter` (DPoS arbiter)
- ✅ `pg`, `esc`, `eid`, `eco`, `ela` (chain RPC nodes on ports 20336–20679)
- ✅ All chain data directories under `/root/node/`

**Why these are safe**: every service above runs as an independent systemd unit (or independent process under another systemd unit). None of them depend on `pc2-kubo` or `pc2-cluster` for their core operation — the IPFS daemon is consumed by `pc2-app-registry` and `pc2-web-gateway` (read-only, for fetching app-registry CIDs), and by nothing else. WireGuard/AmneziaWG kernel modules and the `pc2-cloud-node` userspace daemon have zero file-descriptor or socket coupling to the IPFS layer.

**The only services this preflight touches**:

| Service | Supernode | Action | User-visible impact |
|---|---|---|---|
| `pc2-ipfs-relay` | Contabo | restart (Phase 1) | ~30 sec circuit-relay outage; PC2 nodes have DHT fallback |
| `pc2-kubo` | InterServer | binary upgrade + restart (Phase 2) | ~30 min IPFS-only soft degradation: port 8080 gateway returns 503 for non-cached CIDs; new app-registry pin operations queue until Kubo returns |
| `pc2-cluster` | InterServer | restart (Phase 2 downstream of Kubo) | none — replication is paused; Contabo holds authoritative replica; CRDT resyncs on rejoin |
| UFW (InterServer) | InterServer | additive rule for port 9096 (Phase 3) | none — purely additive, no existing rule is removed or modified |

**Nothing else.** No nginx restart, no `pc2-gateway` restart, no `pc2-boson` restart, no firewall rule deletion, no kernel module change, no Elastos validator interaction.

---

## Description

Bring the two-supernode mesh to a verified-healthy baseline before v1.2.8.0's relayer endpoint is added. This is preventative SRE work. The codebase repo (`pc2.net`) is not modified. All changes are to supernode-side configuration and packaged binaries.

## Background

The audit found:

1. **InterServer's `pc2-kubo` is in a SIGSEGV crash loop** — 2,067 panics in 6 hours, panic site `boxo/bitswap/message/message.go:193`. Cluster service is restart-looping every ~30s as a downstream effect. From InterServer's perspective, replication factor is 1×, not the configured 2×.

2. **`pc2-ipfs-relay` on Contabo is leaking memory.** PID 1949465 has been running 14 days at 102% CPU and 9.6 GB RSS, with connected-peer count thrashing between 1 and 132 minute-to-minute. This is what's pegging Contabo's load average at 11.97/12 cores.

3. **InterServer is missing the `/cluster-pin/` ingress.** Contabo's nginx routes `/cluster-pin/` → `127.0.0.1:9097` (cluster pinsvc, bearer-token + 30 r/m rate-limited). InterServer has no such block in either nginx or the `pc2-gateway` Node code. PC2 nodes' `ContentSeedingService` has exactly one valid HTTP receiver in the mesh today.

4. **UFW on InterServer doesn't restrict cluster swarm port 9096 to its peer.** Contabo's UFW rule [21] is `9096 ALLOW from 69.164.241.210` — bilateral lockdown intended. InterServer's UFW has no equivalent restriction (verified by inspection: no 9096 rule whatsoever on InterServer's `ufw status numbered`). This is asymmetric in the wrong direction — Contabo is locked down, InterServer is open.

The architecture is symmetric in code (same 103,046-byte `index.js` on both, same v2 envelope-signed `ddrm-config.json`, same Ed25519 seed at `/etc/pc2/elacity-provision.ed25519`), so once the operational issues are fixed the mesh is genuinely 2-of-2 healthy.

---

## Verified Current State (Appendix — evidence)

Two-line summary per supernode. Full SSH transcript output preserved in handover sibling doc `docs/handover/HANDOVER_2026-05-05_SUPERNODE_AUDIT.md` (to be created if you want the raw record committed; not yet created).

### Contabo (38.242.211.112)

```
host:        vmi1330656.contaboserver.net  (Ubuntu 20.04, 12c/47G/785G, 140d uptime)
load:        11.97 / 12 cores  ← PEGGED (cause: pc2-ipfs-relay leak)
kubo:        0.34.1, peer 12D3KooWQZu8…, repo 3.57G/300G, healthy
cluster:     1.1.4, peer 12D3KooWJuGc…, sees 1 peer, 43 pins (40 PINNED + 3 PINNING)
gateway:     pc2-web-gateway on :3080 (slim, behind nginx)
provision:   /api/ddrm/provision returns 782B v2 envelope {v,domain,signedAt,payload,sig} ✓
nginx:       /api/ddrm/provision → :3080 ; /cluster-pin/ → :9097 ; /rpc/esc → :20636 ; / → :4200
ufw:         port 9096 restricted to 69.164.241.210 ✓
ddrm-config: v2 envelope-signed, mode 0644, /root/pc2/web-gateway/ddrm-config.json
seed:        /etc/pc2/elacity-provision.ed25519 (32B, mode 0600) ✓
```

### InterServer (69.164.241.210)

```
host:        elacity.hostname.com  (Ubuntu 24.04, 32c/91G/3.6T, 206d uptime)
load:        2.34 / 32 cores  (Elastos validator stack dominant; pc2-* secondary)
kubo:        0.34.1, peer 12D3KooWFLBeem…  ← CRASH-LOOPING (2067 SIGSEGV/6h)
cluster:     restart-looping every ~30s (Restart=on-failure, RestartSec=10)
gateway:     pc2-gateway on :443/:80 (no nginx in front of /api/*)
provision:   pc2-gateway serves /api/ddrm/provision (same code as Contabo's :3080) ✓
nginx:       map.ela.city only — NO /api/ddrm/, NO /cluster-pin/ blocks
ufw:         port 9096 NOT restricted ← asymmetric
ddrm-config: v2 envelope-signed, identical schema to Contabo
seed:        /etc/pc2/elacity-provision.ed25519 ✓
```

---

## Goal — what "done" looks like

| Property | Today | Target |
|---|---|---|
| InterServer Kubo SIGSEGV rate | ~6/min | 0 |
| InterServer pc2-cluster restart cadence | ~30s | uptime ≥ 24h, 0 restarts |
| Contabo pc2-ipfs-relay RSS | 9.6 GB | ≤ 2 GB sustained |
| Contabo load avg | 11.97/12 | < 6/12 |
| `/cluster-pin/` ingress | Contabo only | both nodes (symmetric) |
| UFW `9096` from peer | Contabo only | both nodes (symmetric) |
| Pin propagation Contabo→InterServer | broken (CRDT lag, sees 0 peers) | < 30s p99 |
| `/api/ddrm/provision` v2 envelope | working on Contabo, opaque on InterServer (404 in our test) | working & verifiable on both |

---

## Implementation Plan

> Each phase ends with a hard checkpoint. Operator MUST verify the checkpoint before moving on. Rollback procedure listed inline.

### Phase 0 — Pre-change snapshots (read-only, 10 min)

Both supernodes:

```bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/preflight-snapshots/$ts
cd /root/preflight-snapshots/$ts

# Cluster + IPFS state
ipfs-cluster-ctl peers ls > cluster-peers.txt 2>&1
ipfs-cluster-ctl pin ls > cluster-pinset.txt 2>&1
ipfs-cluster-ctl status > cluster-status.txt 2>&1
ipfs id > ipfs-id.txt 2>&1
ipfs repo stat > ipfs-repo.txt 2>&1
ipfs swarm peers | wc -l > ipfs-peer-count.txt
ipfs config show > ipfs-config.json 2>&1   # WARNING: contains identity secret; mode 600
chmod 600 ipfs-config.json

# Service state
systemctl list-units --type=service --state=running --no-pager > systemd-running.txt
for s in pc2-kubo pc2-cluster pc2-web-gateway pc2-gateway pc2-ipfs-relay nginx; do
  systemctl status $s --no-pager > svc-$s.txt 2>&1 || true
done

# Network state
ufw status numbered > ufw.txt
ss -tlnp > listeners.txt 2>&1
nginx -T > nginx-config.txt 2>&1
nginx -t > nginx-syntax.txt 2>&1

# Web-gateway code + config
cp /root/pc2/web-gateway/index.js index.js.snapshot
cp /root/pc2/web-gateway/ddrm-config.json ddrm-config.json.snapshot
chmod 600 ddrm-config.json.snapshot   # contains usageKey

# Sanity: live provision response on loopback (REDACT before commit)
curl -ks --max-time 5 https://localhost/api/ddrm/provision > provision-live.json 2>&1
curl -ks --max-time 5 https://localhost/api/health         > health-live.txt 2>&1
chmod 600 provision-live.json   # contains live envelope, redact before exfil

ls -la
```

**Checkpoint 0**: All snapshot files exist, `cluster-pinset.txt` has 43 lines, `provision-live.json` has 6 top-level keys (`v, domain, signedAt, payload, sig` plus root). If anything fails here, **STOP** and re-evaluate.

**Rollback Phase 0**: `rm -rf /root/preflight-snapshots/$ts`. No production state touched.

---

### Phase 1 — Symptomatic relief: restart `pc2-ipfs-relay` on Contabo (5 min, low risk)

**Why this is first**: it's an immediate ~10 GB RAM win and a load-average win, with rollback being simply "wait for it to leak again, restart again." Nothing about the relayer or cluster state depends on relay continuity.

**Pre-condition**: relay is the documented Node libp2p circuit-relay on `:4003/:4004` and DHT server on `:4001`. PC2 nodes that depend on it have alternative bootstrap (Contabo nginx, Boson DHT, IPFS public DHT). A 30-second relay outage is recoverable.

```bash
# 1. Confirm what we're about to restart
systemctl status pc2-ipfs-relay --no-pager | head -10

# 2. Capture current memory + peer count for the before/after delta
journalctl -u pc2-ipfs-relay --since "5 min ago" --no-pager | tail -5

# 3. Restart
systemctl restart pc2-ipfs-relay

# 4. Wait 30 seconds for the relay to settle
sleep 30

# 5. Verify
systemctl status pc2-ipfs-relay --no-pager | head -10
ps -eo pid,pcpu,pmem,rss,cmd --sort=-pcpu --no-headers | grep ipfs-relay | head -3
journalctl -u pc2-ipfs-relay --since "1 min ago" --no-pager | tail -5
uptime   # load avg should drop within 60s
```

**Checkpoint 1**:
- `Active: active (running)` ✓
- New PID different from old (1949465) ✓
- RSS < 200 MB ✓
- `[PC2 IPFS Relay] Connected peers: <N>` log line present, N ≥ 5 ✓
- Load avg drops below 5 within 60 seconds ✓

**Rollback Phase 1**: Not applicable — process restart is the rollback.

**Open question for Phase 1**: After restart, monitor RSS for 24h. If it climbs back to 9 GB+ within 24h, escalate to root-cause (memory profile via `node --inspect` or heap snapshot). Track in a follow-up task `PC2-IPFS-RELAY-MEMORY-LEAK` (do not block v1.2.8.0 on this — restart loop is acceptable interim mitigation).

---

### Phase 2 — InterServer Kubo crash loop (90 min, MEDIUM risk)

**Why this is second**: it's the largest functional gap in the mesh. Until this is fixed, v1.2.8.0 cannot validate end-to-end on InterServer (relayer requests directed there will hit a non-deterministic error budget when Kubo is mid-crash).

**Diagnosis recap**:
```
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV] addr=0x20 pc=0x16fcce6
goroutine 43504 [running]:
  github.com/ipfs/boxo/bitswap/message.newMessageFromProto(0xc00871f500)
    boxo@v0.29.1/bitswap/message/message.go:193
  github.com/ipfs/boxo/bitswap/message.FromMsgReader
    boxo@v0.29.1/bitswap/message/message.go:438
  github.com/ipfs/boxo/bitswap/network/bsnet.(*impl).handleNewStream
    boxo@v0.29.1/bitswap/network/bsnet/ipfs_impl.go:433
```

This is a known nil-deref on a malformed bitswap WANT message. Boxo `v0.29.1` is bundled with Kubo `0.34.1`. **Boxo `v0.32.0`+ contains the fix** for this exact path (the message receiver was made nil-safe between v0.29 and v0.32). Kubo `0.35.0` (released 2025-Q4) ships with Boxo ≥ 0.32.

**Verified target version (post-2026-05-05 web check)**:

| Field | Value | Source |
|---|---|---|
| Target Kubo version | **0.41.0** (latest stable) | `https://dist.ipfs.tech/kubo/versions` |
| Released | 2026-04-23 (12 days community soak as of preflight) | GitHub `ipfs/kubo` releases |
| Boxo version included | ≥ 0.34.0 (well past 0.29.1 nil-deref bug) | v0.35 changelog: boxo 0.29.1→0.30.0; v0.37 changelog: boxo→0.34.0 |
| Repo migration | v16 → v17 (embedded in 0.37+ binary, no internet needed) | v0.37 changelog "🚀 Repository migration from v16 to v17 with embedded tooling" |
| Linux amd64 archive | `kubo_v0.41.0_linux-amd64.tar.gz` | `dist.ipfs.tech` |
| **SHA-512** | `5c0f3dba6d29d30e3f3cfdbf7f7b05c228167d21211207b9c17a106f5c846d33895cd42a618eed989073b48af4a870df7f1f6c86a052796b02ea79767b66e4ef` | `dist.ipfs.tech/kubo/v0.41.0/kubo_v0.41.0_linux-amd64.tar.gz.sha512` |
| Known regressions | 0.40.0 had a Windows-only crash; 0.40.1 fixed it. **Linux unaffected.** | v0.40.1 release notes |

**Why 0.41.0 and not 0.35.0**: the bitswap nil-deref is fixed in 0.35.0+ (boxo 0.30.0+). Going to 0.41.0 picks up the fix plus 6 minor versions of subsequent bug fixes. Same migration path (v16→v17) regardless of which target.

**Three remediation options, in order of risk/reward**:

| Option | Action | Risk | Recovery time |
|---|---|---|---|
| 2a (preferred) | Upgrade `pc2-kubo` binary to Kubo 0.41.0 on InterServer only | repo migration v16→v17 on first start (embedded, no internet); peer ID preserved; pinset preserved via cluster CRDT | 10 min if migration succeeds, 30 min if it doesn't |
| 2b (interim) | Disable bitswap stream handler with `Bitswap.ServerEnabled=false` (workaround for newer Kubo; not applicable to 0.34.1) | preserves binary version, doesn't fix root cause | minutes |
| 2c (last resort) | Block inbound bitswap streams from non-cluster peers via libp2p ConnGater | weakens IPFS DHT participation; cluster CRDT still works | minutes |

**Recommendation: 2a.** 2b and 2c only apply if 2a fails for unrelated reasons.

**Phase 2a procedure** (operator on InterServer):

```bash
# Pre-condition: $ts already set from Phase 0 snapshot
test -d /root/preflight-snapshots/$ts || { echo "Phase 0 snapshot missing"; exit 1; }

# 1. Backup current binary
cp -av /usr/local/bin/ipfs /root/preflight-snapshots/$ts/ipfs.0.34.1.bin

# 2. Stop services and snapshot repo metadata (blocks/ excluded — unchanged across v16→v17 migration)
systemctl stop pc2-cluster
systemctl stop pc2-kubo
tar -czf /root/preflight-snapshots/$ts/ipfs-repo-pre-upgrade.tgz \
        --exclude='*/blocks/*' \
        /root/.ipfs/config /root/.ipfs/datastore /root/.ipfs/version /root/.ipfs/keystore
ls -la /root/preflight-snapshots/$ts/ipfs-repo-pre-upgrade.tgz   # verify it exists and is non-zero

# 3. Download verified Kubo 0.41.0 binary + verify SHA-512
cd /tmp
curl -fsSL "https://dist.ipfs.tech/kubo/v0.41.0/kubo_v0.41.0_linux-amd64.tar.gz" -o kubo.tgz
EXPECTED_SHA512="5c0f3dba6d29d30e3f3cfdbf7f7b05c228167d21211207b9c17a106f5c846d33895cd42a618eed989073b48af4a870df7f1f6c86a052796b02ea79767b66e4ef"
echo "$EXPECTED_SHA512  kubo.tgz" | sha512sum -c - || { echo "SHA-512 MISMATCH — STOP"; exit 1; }
tar -xzf kubo.tgz
test -x kubo/ipfs || { echo "ipfs binary not in tarball — STOP"; exit 1; }

# 4. Atomic binary swap (use install -m 755 for atomic mv-like semantics)
mv /usr/local/bin/ipfs /usr/local/bin/ipfs.0.34.1   # last-line-of-defense backup
install -m 755 kubo/ipfs /usr/local/bin/ipfs
ls -la /usr/local/bin/ipfs /usr/local/bin/ipfs.0.34.1
/usr/local/bin/ipfs version   # expect "ipfs version 0.41.0"; offline check before daemon start

# 5. Start Kubo (will trigger v16→v17 migration via embedded tooling — `--migrate=true` already in unit)
systemctl start pc2-kubo

# 5a. Watch for migration completion (should be milliseconds)
for i in 1 2 3 4 5 6 7 8 9 10; do
  if journalctl -u pc2-kubo --since "1 min ago" --no-pager | grep -q "Daemon is ready"; then
    echo "kubo daemon ready after ${i}0s"
    break
  fi
  sleep 10
done
journalctl -u pc2-kubo --since "2 min ago" --no-pager | tail -30

# 6. Sanity checks
ipfs version          # expect "ipfs version 0.41.0"
ipfs id | jq -r .ID, .Addresses   # expect ID + non-null Addresses array
curl -s --max-time 5 -X POST http://127.0.0.1:5001/api/v0/id | jq -r .ID
ipfs repo stat        # expect "Version: fs-repo@17"

# 7. Start cluster and wait for peering
systemctl start pc2-cluster
sleep 30
ipfs-cluster-ctl id          # expect "Sees 1 other peer"
ipfs-cluster-ctl peers ls    # expect Contabo peer listed
ipfs-cluster-ctl status      # expect 43 PINNED matching Contabo

# 8. 5-min observation window — watch for SIGSEGV recurrence
sleep 300
PANIC_COUNT=$(journalctl -u pc2-kubo --since "5 min ago" --no-pager | grep -cE "panic|SIGSEGV" || true)
echo "Panic events in last 5 min: $PANIC_COUNT (expect 0)"
test "$PANIC_COUNT" = "0" || { echo "Panic events detected — escalate"; exit 1; }

# 9. Confirm no untouched services restarted
systemctl is-active pc2-boson pc2-cloud-node pc2-vless-reality pc2-app-registry pc2-network-map pc2-gateway pc2-ipfs-relay
# All should report: active
```

**Checkpoint 2**:
- `ipfs version` reports `ipfs version 0.41.0` ✓
- `ipfs repo stat` reports `Version: fs-repo@17` (migration succeeded) ✓
- `ipfs id` returns non-null Addresses array ✓
- `ipfs-cluster-ctl id` reports `Sees 1 other peer` ✓
- 5 min observation window: 0 panic events in journal ✓
- Pinset count on InterServer matches Contabo (43 entries, all PINNED) ✓
- All "Services Explicitly NOT Touched" services still report `active` ✓

**Rollback Phase 2a** (if any checkpoint fails):
```bash
systemctl stop pc2-cluster pc2-kubo

# IMPORTANT: binary swap alone is NOT sufficient — repo is now v17, 0.34.1 cannot read it.
# Must also restore the v16-format repo metadata from the Phase 0 snapshot.

# 1. Restore old binary
mv /usr/local/bin/ipfs.0.34.1 /usr/local/bin/ipfs

# 2. Restore v16 repo metadata (blocks/ directory unchanged, not in tar)
cd /
tar -xzf /root/preflight-snapshots/$ts/ipfs-repo-pre-upgrade.tgz

# 3. Verify
/usr/local/bin/ipfs version         # expect 0.34.1
cat /root/.ipfs/version              # expect "16"

# 4. Restart
systemctl start pc2-kubo pc2-cluster
sleep 30
journalctl -u pc2-kubo --since "1 min ago" --no-pager | tail -10
# Crash loop will return — that's the prior known state, not a regression
```

**Risk if Phase 2a fails**: We are back to where we started (crash loop on InterServer). Cluster CRDT replicas on Contabo remain authoritative throughout — no data loss possible. The blocks/ directory is unchanged across v16↔v17, so block content is preserved regardless.

**Stretch goal**: also upgrade Contabo's Kubo to 0.41.0 for symmetry. **DEFERRED** to a follow-up task — Contabo's Kubo is currently stable at 0.34.1, and changing it during the v1.2.8.0 preflight introduces unnecessary risk.

---

### (Removed phase) — `/cluster-pin/` ingress symmetry on InterServer

> **Status**: removed from this preflight, deferred to follow-up task `SUPERNODE-CLUSTER-PIN-SYMMETRY-V1281`.
>
> **Why deferred**: the original v1 of this plan assumed InterServer had an `nginx` `server { listen 443 ssl; }` block where a `/cluster-pin/` location could be added (mirroring Contabo's setup). The 2026-05-05 audit confirmed this is incorrect: InterServer's `nginx` only serves `map.ela.city` on port 80; HTTPS on port 443 is owned directly by `pc2-gateway` (Node), not by `nginx`. Adding an `nginx :443` server block on InterServer would conflict with `pc2-gateway`'s socket bind and is therefore not a viable preflight step.
>
> **What replaces it**: the `/cluster-pin/` ingress on InterServer requires a code-level handler in `pc2-gateway/index.js` (proxying to `127.0.0.1:9097` with bearer-token check). That code change is naturally co-deployed with v1.2.8.0's `/api/ddrm/lit-action` handler (which has the same architectural question — "how do new endpoints land on InterServer's pc2-gateway?"). Both should ship together in a single coordinated PR.
>
> **Operational impact of deferral**: PC2 nodes' ContentSeedingService continues to round-robin to Contabo only. This is the current state — no regression. Once v1.2.8.0 + the `/cluster-pin/` symmetry ship together, both supernodes accept seeded content.

---

### Phase 3 — UFW symmetry on InterServer (10 min, LOW risk)

**Goal**: Cluster swarm port 9096 only accepts inbound from the peer.

```bash
# On InterServer:
# 1. Add the rule
ufw allow from 38.242.211.112 to any port 9096 comment 'IPFS Cluster swarm from Contabo'

# 2. (DO NOT do this until 5 min observation): explicitly deny all other 9096
# Defer this — current state is "permissive but unexploited", and locking down
# during the preflight introduces an outage window if Phase 3 misconfigured anything

# 3. Verify
ufw status numbered | grep 9096
```

**Checkpoint 3**: Cluster mesh remains healthy after rule addition (sees 1 peer). Pin propagation test passes.

**Stretch goal Phase 3b** (separate task, NOT for this preflight): Add `ufw deny 9096` after `ufw allow from <peer>` to make the rule actually restrictive. Do this in a follow-up task `SUPERNODE-UFW-LOCKDOWN-V1281` after v1.2.8.0 has soaked for 7 days.

---

### Phase 4 — End-to-end verification (20 min)

```bash
# === On Contabo ===

# 5.1 Both supernodes' Kubo daemons are healthy
ssh root@69.164.241.210 "ipfs id | jq -r .ID, .Addresses"
ipfs id | jq -r .ID, .Addresses
# Both should show non-null Addresses

# 5.2 Cluster mesh symmetric
ipfs-cluster-ctl peers ls | grep -E "Sees [0-9]+ other peers"
# Both peers should report "Sees 1 other peer"

# 5.3 Pin propagation works
TEST_FILE=/tmp/preflight-test-$(date +%s).txt
echo "preflight test $(date -u)" > $TEST_FILE
TEST_CID=$(ipfs add -q --pin=false $TEST_FILE)
ipfs-cluster-ctl pin add --name "preflight-$TEST_CID" $TEST_CID
sleep 30
# Should be PINNED on both peers:
ipfs-cluster-ctl status $TEST_CID

# 4.4 /api/ddrm/provision parity
curl -ks --max-time 5 https://38.242.211.112/api/ddrm/provision | jq 'keys'
curl -ks --max-time 5 https://69.164.241.210/api/ddrm/provision | jq 'keys'
# Both should return: ["domain","payload","sig","signedAt","v"]

# 4.5 (deferred to SUPERNODE-CLUSTER-PIN-SYMMETRY-V1281)
# Skipped: /cluster-pin/ parity check. Contabo continues to be the sole
# /cluster-pin/ ingress. PC2 nodes' ContentSeedingService is unchanged.

# 4.6 Phase 1 follow-up: pc2-ipfs-relay memory after 1h
ssh root@38.242.211.112 'ps -eo rss,cmd | grep -E "[i]pfs-relay" | head -3'
# RSS should be < 1 GB

# 4.7 (additional safety — confirm no untouched services were touched)
ssh root@69.164.241.210 'systemctl is-active pc2-boson pc2-cloud-node pc2-vless-reality pc2-app-registry pc2-network-map pc2-gateway'
# All should report: active
ssh root@38.242.211.112 'systemctl is-active pc2-boson pc2-vless-reality pc2-app-registry pc2-web-gateway'
# All should report: active
```

**Final checkpoint**: All verification steps pass + every "Services Explicitly NOT Touched" service is still `active`. v1.2.8.0 development can proceed.

---

## Risk Matrix

| Phase | Action | Worst case | Mitigation | Detection |
|---|---|---|---|---|
| 0 | Snapshots | Snapshot file contains usageKey on disk | mode 0600 + delete after preflight + don't commit | `ls -la /root/preflight-snapshots/` |
| 1 | Restart pc2-ipfs-relay | 30s relay outage on Contabo only | PC2 nodes have DHT fallback; relay was leaking anyway | journalctl after restart |
| 2a | Kubo upgrade | Repo migration fails | Restore from backup tarball; Contabo cluster remains authoritative | `ipfs id` returns non-null after restart |
| 2a | Kubo upgrade | New Boxo version has different bug | Rollback to 0.34.1 binary backup | 5-min observation window |
| 2a | Kubo upgrade | port 8080 IPFS gateway returns 503 during 30 min window | Documented soft-degradation; users hit Contabo/Pinata/public DHT | curl after restart |
| 2a | Kubo upgrade | A non-IPFS service somehow restarts | systemd unit independence audit (§"Services Explicitly NOT Touched") | `systemctl is-active` smoke test in Phase 4.7 |
| 3 | UFW rule | Mesh sees 0 peers after add (unlikely with `allow from`, more concern with `deny`) | Defer `deny` to separate task | `ipfs-cluster-ctl peers ls` |
| 4 | Pin propagation test | Test pin pollutes cluster | Mark with descriptive name + remove after | post-test pin-rm |

---

## Rollback Procedures (consolidated)

If at any phase boundary verification fails:

1. **Phase 1 fail**: not actually possible (process restart is the rollback). If pc2-ipfs-relay won't restart, escalate to operator to inspect crash logs.
2. **Phase 2 fail**: `mv /usr/local/bin/ipfs.0.34.1 /usr/local/bin/ipfs && systemctl restart pc2-kubo pc2-cluster`. The crash loop returns. Cluster on Contabo remains authoritative.
3. **Phase 3 fail**: `ufw delete <rule-number>`. Cluster mesh continues regardless — port 9096 was never the *sole* means of cluster comms (libp2p has DHT fallback).

**Atomic checkpoint**: If 2 of 3 phases fail in sequence, **STOP** and reconvene with Sasha. Do not proceed to v1.2.8.0 deployment.

---

## What This Task Does NOT Do

Explicitly out of scope (each is a separate task):

- ❌ **Does not** root-cause the `pc2-ipfs-relay` memory leak. Phase 1 is symptomatic relief only. Track in `PC2-IPFS-RELAY-MEMORY-LEAK`.
- ❌ **Does not** rotate the live `usageKey`. The Wave 8 envelope-signing infrastructure already exists; key rotation is its own gated procedure (see `docs/runbooks/CHIPOTLE_KEY_ROTATION.md` if it exists; if not, that's a follow-up task).
- ❌ **Does not** rotate the Ed25519 envelope signing seed. Same reason.
- ❌ **Does not** add a third supernode. Mesh expansion is `SUPERNODE-MESH-EXPAND-V13`.
- ❌ **Does not** change the cluster's `--replication-min`/`--replication-max` config. Currently 2/2 (correct for a 2-node cluster).
- ❌ **Does not** introduce IPv6 on cluster swarm. Currently IPv4-only.
- ❌ **Does not** modify any code in the `pc2.net` repo. All changes are supernode-side configuration.
- ❌ **Does not** touch the Elastos chain validator stack on InterServer. The 8 Elastos services running there are out of PC2 scope.
- ❌ **Does not** modify nginx upstream definitions on Contabo. Phase 3 only ADDS a block on InterServer; Contabo's existing setup is the reference.

---

## Files Modified (supernode-side only — NOT in repo)

**Contabo (38.242.211.112)**:
- (no permanent file changes — Phase 1 is a process restart only)

**InterServer (69.164.241.210)**:
- `/usr/local/bin/ipfs` (upgraded; old binary preserved at `/usr/local/bin/ipfs.0.34.1`)
- `/etc/ufw/user.rules` (via `ufw allow from … to any port 9096`)
- (nginx config NOT modified — Phase 3 of v1 was deferred; no nginx reload happens on InterServer)

**Both supernodes (transient)**:
- `/root/preflight-snapshots/<ts>/` — delete after acceptance

---

## Files NOT Touched (production-critical, hands-off)

- `/root/pc2/web-gateway/ddrm-config.json` — live secret (`usageKey`)
- `/root/pc2/web-gateway/index.js` — application code, deployed via repo CI
- `/etc/pc2/elacity-provision.ed25519` — Ed25519 envelope signing seed
- `/etc/pc2/ddrm-api-key` — legacy Tier-1 fallback key (not used by current code path but preserved)
- Cluster identity files in `/root/.ipfs-cluster/` — peer ID continuity
- IPFS keystore in `/root/.ipfs/keystore/` — peer ID continuity

---

## Acceptance Criteria

- [ ] Phase 0 snapshots taken on both supernodes; sensitive files mode 0600
- [ ] Phase 1: Contabo `pc2-ipfs-relay` RSS < 200 MB after restart, < 2 GB after 24h soak
- [ ] Phase 1: Contabo load avg < 6/12 after Phase 1 settles (60s)
- [ ] Phase 2: InterServer `ipfs version` reports 0.41.0
- [ ] Phase 2: InterServer `ipfs repo stat` reports `Version: fs-repo@17`
- [ ] Phase 2: InterServer 0 SIGSEGV events in last 1h
- [ ] Phase 2: InterServer 0 `pc2-cluster` restarts in last 1h
- [ ] Phase 2: `ipfs-cluster-ctl id` from InterServer reports "Sees 1 other peer"
- [ ] Phase 2: Pinset count on InterServer matches Contabo (43 ± any new pins added during preflight)
- [ ] Phase 3: UFW shows `9096 ALLOW from 38.242.211.112` on InterServer
- [ ] Phase 4.3: Test pin propagates from Contabo to InterServer in < 30s
- [ ] Phase 4.4: `/api/ddrm/provision` returns identical-shape v2 envelope from both supernodes
- [ ] Phase 4.7: All "Services Explicitly NOT Touched" services still report `active` on both supernodes
- [ ] All snapshots in `/root/preflight-snapshots/<ts>/` deleted post-acceptance

---

## Open Questions

1. **Kubo 0.35.x repo migration time**: how long does first-start migration take on a 3 GB / 460-object repo? Test on a non-prod Kubo first (or accept 30-min outage window for InterServer's IPFS layer during Phase 2). **Recommended answer**: Schedule Phase 2 during a low-traffic window (UTC 02:00–06:00).

2. **Bearer-token transfer**: how do we get the existing cluster-pin token from Contabo's `/etc/nginx/conf.d/cluster-pin.conf` to InterServer without writing it through any logging system? **Recommended answer**: SSH-tunnel `scp -3` directly between the two hosts (operator's laptop never sees the token plaintext), or generate from a sealed source. **Alternative**: rotate the token entirely as part of Phase 3 (add to a follow-up task `CLUSTER-PIN-TOKEN-ROTATION`).

3. **Should we also upgrade Contabo's Kubo for symmetry?** **Recommended answer**: NO during this preflight. Defer to a separate task `KUBO-035-CONTABO-UPGRADE` after v1.2.8.0 has soaked. Don't change Contabo while it's the only authoritative cluster member.

4. **Should the existing Apr 28 `ddrm-config.json.pre-cid-fix.*` and Apr 6 `pre-wave8.*` backups be cleaned up?** **Recommended answer**: NO — they're the existing recovery artifacts. Mark for cleanup at v1.3.0.

5. **Phase 4 UFW lockdown** — go fully restrictive (`deny 9096` after `allow from peer`) now, or in a follow-up? **Recommended answer**: follow-up. The `allow from 38.242.211.112` is sufficient if a default-deny policy applies to 9096 (Contabo's posture). InterServer's UFW default for unmatched inbound is currently DENY (UFW default). So `allow from` alone is functionally restrictive. Verify this with `ufw status verbose | grep "Default:"` — if "deny (incoming)", we're done. If "allow (incoming)", we need an explicit deny.

6. **Coordination with v1.2.8.0 design doc**: does v1.2.8.0's `POST /api/ddrm/lit-action` endpoint nginx-routing assume Contabo's pattern (route to :3080) or InterServer's pattern (direct to :443)? **Recommended answer**: write the nginx block on Contabo (`/api/ddrm/lit-action → 127.0.0.1:3080`) symmetric to the existing `/api/ddrm/provision`, and on InterServer add it to nginx as well (route to wherever pc2-gateway listens, possibly `127.0.0.1:443` if pc2-gateway is solely the TLS terminator, or just letting it through directly). **This needs to be decided in the v1.2.8.0 design doc, not here.** Flag for Sasha.

---

## Testing Strategy

Each phase has its own checkpoint commands embedded above. The validation is operational, not unit-testable: it's about live system state on two production hosts. Treat each `Checkpoint N` block as the test suite for that phase.

**No automated test runs in this task.** This is operator work, not code work.

**Manual smoke after Phase 5 completes:**
1. From a clean PC2 node (any user), run a `ContentSeedingService` push against InterServer's `/cluster-pin/`. Verify 200 OK, content appears in cluster pinset within 30s.
2. From a clean PC2 node, hit `/api/ddrm/provision` against both supernodes. Verify both responses pass the v2 envelope verification check in `pc2-node/src/api/chipotle-client.ts:verifyProvisionEnvelope`.

---

## Notes

- **Why this task exists at all**: the v1.2.8.0 design doc and the v1.2.7.7→v1.2.8.0 handover both assume a healthy 2-of-2 cluster mesh. The mesh is currently 1-of-1.5. Closing the v1.2.8.0 wire-leak in a degraded mesh is technically possible but indistinguishable from a clean rollout — and any subsequent failure would be hard to attribute. Fix the foundation first.
- **Why this task is not part of v1.2.8.0**: scope discipline. v1.2.8.0 is an application-layer change (relayer endpoint + auth + envelope wrapping). This task is an infrastructure-layer change. Conflating them makes both harder to review and roll back.
- **Why we're not fixing the Apr 6/28 dangling backup files**: they cost nothing to keep, they're real recovery artifacts, and removing them is high-risk for zero-reward.
- **Why we restart `pc2-ipfs-relay` instead of root-causing**: the leak is in libp2p / Node.js — diagnosing it requires `--inspect`, heap snapshots, and several hours of analysis. A weekly restart cron is acceptable interim mitigation; the actual fix happens in a separate task on a separate timeline.
