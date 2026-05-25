# PLAN — Public Cloud PC2 (`try.pc2.net`)

**Task ID**: `PUBLIC-CLOUD-PC2-2026-05`
**Created**: 2026-05-25
**Status**: Proposed — awaiting Sasha sign-off on §0 decisions
**Companion**: [`README.md`](./README.md) (task ticket header)

> **One-paragraph summary.** Spin up `try.pc2.net` — a single dedicated VPS that hosts a fleet of throwaway per-visitor Docker containers, each running a sandboxed PC2 desktop. A visitor lands on the page, solves a captcha, clicks "Try PC2", and within ~8 seconds sees the PC2 desktop inside their browser. They get 60 minutes of idle time (4 h hard cap) to click through Market / Creator / Player / AI chat, then the container is destroyed. A persistent "Download PC2" CTA in the taskbar is the conversion event we're optimising for. The whole thing rides on **one** small VPS (~€25–35/mo), uses NO production credentials (testnet Lit + testnet contracts + faucet-funded SA), and is rigorously separated from our existing supernodes so a misbehaving demo session cannot dent the production network. The narrative integrity bar is high: every UI panel makes it explicit this is a tourist demo, not a sovereign node.

---

## §0  Decisions for Sasha (Proposed → Agreed gate)

These six decisions must be made before any code is written. Each has a recommended default; the recommendation is what code will assume if Sasha greenlights without explicit override.

| # | Decision | Options | Recommended | Why |
|---|---|---|---|---|
| **D1** | Hosting provider for trial host | (a) Hetzner CCX33 €33/mo, 8 dedicated vCPU, 32 GB RAM, 160 GB NVMe (b) Contabo VPS-XL €25/mo, 10 vCPU shared, 60 GB RAM, 500 GB SSD (c) InterServer Cloud VPS — closest equivalent ~$30/mo (d) Dedicated metal — Hetzner AX41-NVMe €50/mo | **(a) Hetzner CCX33** | Dedicated vCPUs (no noisy-neighbour spikes), best price/perf in EU, the CCX line has battle-tested CPU steal-time numbers, and we get 20 TB egress — plenty for 30 concurrent browser sessions. Contabo is 30 % cheaper but shared vCPU means session UX gets choppy under burst. We already operate Contabo + InterServer for supernodes; the third provider also de-risks "all-eggs-one-basket." |
| **D2** | Isolation model | (a) Per-session Docker container (b) Per-session Firecracker microVM (c) PC2 multi-tenant (one process, many users) | **(a) Docker** | Already supported by `pc2-node/Dockerfile`. Firecracker is the long-term right answer (and aligns with the capsule/Runtime trajectory) but adds 2 weeks of operator complexity for v1 with no visible UX win. Multi-tenant breaks the demo's blast-radius story (one bug → everyone affected) and requires PC2-side rewrites. |
| **D3** | AI provider inside demo | (a) **BYOK (bring-your-own-key)** — visitor pastes their OpenAI / Anthropic / Groq / OpenRouter / xAI / DeepSeek key in Settings → AI; if no key, AI tab shows two paths: "Paste your API key" + "Or get hosted AI from Elacity — coming soon" (waitlist sign-up). NO local Ollama, NO Elacity-paid inference (b) Local Ollama with `deepseek-r1:1.5b` (~1 GB model, free, slower — *previously recommended; rejected because 0.5 vCPU makes it borderline-slow + drifts from the real-PC2 BYOK experience*) (c) Elacity-paid hosted free-tier with per-session $0.05 cap (creates abuse vector + ongoing variable cost; rejected) | **(a) BYOK + future-subscription teaser** | Three wins: (1) **Zero inference cost on the trial host** — Ollama would have hogged ~250 MB RAM and 5–10 tok/s of 0.5 vCPU; BYOK pushes all inference to the visitor's chosen provider so the trial container does nothing. (2) **Honest to real-PC2 experience** — real PC2 is BYOK today; the demo behaves like the real product instead of papering over it. (3) **Future revenue hook** — the "Or get hosted AI from Elacity — coming soon" waitlist button captures revenue-interest signal *during the trial itself*, which is the perfect moment. Subscription tier becomes a clean Phase 1.5 product (see §9.4). The waitlist button is the only new UI element vs current real PC2 — ~30 LOC in `UIAIChat.js` gated on `PC2_TRIAL_MODE=1`. **Side effect**: the trial container's network egress allow-list adds the curated set of LLM provider hostnames — see §3.2 update. |
| **D4** | Auth model in demo | (a) Anonymous-only (no signup) (b) Optional email magic-link (visitors can return) (c) Mandatory signup before launch | **(a) Anonymous-only** | The whole product proposition is "you don't need an account, your hardware is your identity." Asking visitors for email *before* they've seen the product reverses that. v1 is anonymous; if conversion is too low we can A/B-test adding email later. |
| **D5** | Chain access in demo | (a) Base Sepolia testnet (Lit Naga TEST + V3 testnet contracts + faucet-funded SA) (b) No-chain demo (viewer-only, no mint / no buy) (c) Production Base mainnet with operator-funded $0.10 gas pool | **(a) Base Sepolia** | Lets visitors complete the full Creator → mint → Market → buy → Player loop. Mainnet is too risky (real gas, real money trail, real DRM keys leaking). No-chain demo misses the whole point of demonstrating dDRM. Lit Naga TEST exists and is free. |
| **D6** | Domain | (a) `try.pc2.net` (b) `demo.ela.city` (uses supernode wildcard cert) (c) `playground.elacitylabs.com` | **(a) `try.pc2.net`** | We control `pc2.net` DNS directly via Cloudflare today; no supernode coupling; clearest naming for the funnel ("try → download" reads cleanly); separate cert footprint so a trial-host TLS issue can't affect `*.ela.city`. |

**Cost summary at recommended defaults:** ~€33/mo (Hetzner CCX33) + **~€0 LLM credits — visitor pays their own provider via BYOK** + ~€0 testnet credits (faucet-funded SA) + ~€0 SSL (Let's Encrypt) + ~€2/mo hCaptcha free tier = **~€35/mo all-in** for ~30 concurrent sessions / ~500 sessions/day capacity. BYOK design (D3) also unlocks a future revenue tier — Elacity-hosted AI subscription — captured in §9.4.

---

## §1  Mission alignment (why this is on-strategy)

Per [`docs/core/ROADMAP.md`](../../../docs/core/ROADMAP.md) §V1.2_ADOPTION_ROADMAP, the post-v1.2.0 priority is "convert security correctness into adoption." The four nodes on the AARRR funnel for PC2 are:

| AARRR | What | Public-trial impact |
|---|---|---|
| **Acquire** | Strangers visit `pc2.net` | No change — they were already visiting |
| **Activate** | Strangers install + first-boot PC2 | **Huge improvement** — `try.pc2.net` shortcuts the 5-minute install gate; visitor reaches "first useful interaction" in <10 seconds |
| **Retain** | Activated visitors come back | Indirect — the CTA at minute 10 ("Download PC2") is what converts a tourist into a returning user |
| **Refer** | Active users tell friends | Indirect — "you can try it in your browser at try.pc2.net" is a 10-word pitch a friend can act on immediately |
| **Revenue** | Capsule purchases, supernode operators, enterprise | No direct revenue from the demo itself; revenue effect flows downstream from increased Activate |

The mission constraint is **don't dilute "your data on your hardware."** A poorly-framed demo would teach visitors the opposite. The architecture below enforces narrative integrity through:

1. Persistent banner on every UI panel
2. Filesystem shows `/demo/` not `~/`
3. Wallet shows "Demo wallet — testnet only"
4. No real DRM (visitors mint *to testnet* — packaging works end-to-end but the resulting tokenisation is on Base Sepolia)
5. The "Download PC2" CTA is the third item in the taskbar after the start button and the clock

---

## §2  Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│   try.pc2.net  (Cloudflare DNS → Trial Host)                         │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TRIAL HOST  (Hetzner CCX33, 8 vCPU / 32 GB RAM / 160 GB NVMe)       │
│                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  Landing page  (static, served by Caddy)                     │   │
│   │   - "Try PC2 in your browser" CTA                            │   │
│   │   - hCaptcha widget (anti-abuse)                             │   │
│   │   - Visitor solves → POST /api/trial/launch                  │   │
│   └────────────────────────────────────────┬─────────────────────┘   │
│                                            │                          │
│   ┌────────────────────────────────────────▼─────────────────────┐   │
│   │  Trial Orchestrator  (Node service, ~400 LOC)                │   │
│   │   POST /api/trial/launch        → provision container        │   │
│   │   POST /api/trial/<id>/heartbeat → extend idle timer         │   │
│   │   POST /api/trial/<id>/migrate  → bundle + redirect          │   │
│   │   DELETE /api/trial/<id>        → tear down                  │   │
│   │   GET  /api/trial/health        → counts, free slots         │   │
│   │                                                              │   │
│   │   Internal state (SQLite):                                   │   │
│   │     sessions(id, token, container, port, expires_at,         │   │
│   │              created_at, last_seen_at, ip_hash, country)     │   │
│   └────────────────────────────────────────┬─────────────────────┘   │
│                                            │                          │
│       ┌────────────────────────────────────┼────────────────────┐    │
│       │                                    │                    │    │
│       ▼                                    ▼                    ▼    │
│  ┌─────────────┐                      ┌─────────────┐      ┌─────────│
│  │ pc2-trial-1 │  …                   │ pc2-trial-N │      │ Caddy   │
│  │ Docker      │                      │ Docker      │      │ reverse │
│  │ 512 MB/0.5c │                      │ 512 MB/0.5c │      │ proxy   │
│  │ 5 GB tmpfs  │                      │ 5 GB tmpfs  │      │         │
│  │ port 4201   │                      │ port 4230   │      │ wildcard│
│  │             │                      │             │      │ cert    │
│  │ /demo/...   │                      │ /demo/...   │      │ *.try.  │
│  │ pc2-node    │                      │ pc2-node    │      │ pc2.net │
│  └─────────────┘                      └─────────────┘      └────┬────┘
│                                                                 │     │
│                                                                 ▼     │
│       trial-<token>.try.pc2.net → container port 420N                │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌────────────────────────────────────────┐
              │  External services (allow-listed)      │
              │                                        │
              │  - Base Sepolia RPC (Alchemy free)     │
              │  - Lit Naga TEST API                   │
              │  - GitHub raw (capsule template fetch) │
              │  - npm registry (capsule install)      │
              │  - hCaptcha verify                     │
              │                                        │
              │  Everything else: BLOCKED at iptables  │
              └────────────────────────────────────────┘
```

### 2.1 Component responsibilities

| Component | What it does | Where it lives | LOC estimate |
|---|---|---|---|
| **Landing page** | Static HTML with hCaptcha + "Try PC2" CTA. Posts captcha token to orchestrator | `deploy/trial-host/public/index.html` | ~150 |
| **Trial Orchestrator** | Provisions and tears down Docker containers; maps subdomains; tracks session state in SQLite | `deploy/trial-host/orchestrator/` | ~400 |
| **Caddy reverse proxy** | Wildcard `*.try.pc2.net` SSL via Let's Encrypt; subdomain → container port routing via Caddyfile snippet generated by orchestrator | `deploy/trial-host/Caddyfile` | ~80 |
| **`pc2-node:trial` Docker image** | PC2 image with: production credentials stripped, demo banner injected, testnet-only RPC config, telemetry muted | `pc2-node/Dockerfile.trial` | ~50 (diff vs main Dockerfile) |
| **`TrialModeService` (PC2-side)** | Inside the running PC2 container — gates production-credential code paths when `PC2_TRIAL_MODE=1`; serves banner config to the UI | `pc2-node/src/services/setup/TrialModeService.ts` | ~120 |
| **Taskbar Download CTA** | Conditional UI element — when `PC2_TRIAL_MODE=1`, taskbar shows persistent "Download PC2" button | `src/gui/src/UI/UIDesktop.js` | ~40 (diff) |

Total new code surface: **~840 LOC**. None of it touches the production PC2 release path — the `TrialModeService` is the only PC2-side addition, gated by an env var that defaults to off.

### 2.2 Session lifecycle

```
T+0s    Visitor lands on try.pc2.net
T+5s    Solves captcha → POST /api/trial/launch
T+6s    Orchestrator allocates port (4201-4299 pool)
T+6s    Orchestrator: docker run --rm -d \
          --memory=512m --cpus=0.5 \
          --tmpfs /app/data:size=5G \
          --network=trial-net \
          -e PC2_TRIAL_MODE=1 \
          -e PC2_TRIAL_TOKEN=<token> \
          -p 4207:4200 \
          pc2-node:trial
T+8s    Orchestrator writes Caddy snippet:
          trial-abc123.try.pc2.net {
            reverse_proxy localhost:4207
          }
          docker exec caddy caddy reload
T+9s    Orchestrator returns { url: "https://trial-abc123.try.pc2.net" }
T+10s   Browser redirects → visitor sees PC2 desktop
T+0s..60min  Visitor clicks around; heartbeat every 30 s keeps session alive
T+60min      No heartbeat for 60 min → orchestrator destroys container,
             removes Caddy snippet, frees port
T+4h          Hard cap regardless of heartbeat
```

### 2.3 What's in the demo PC2 image

| Feature | In demo? | Notes |
|---|---|---|
| Files app | ✅ | `/demo/` filesystem, ephemeral, ~5 GB |
| Market app | ✅ | Browses Base Sepolia testnet contracts; can simulate purchases |
| Creator app | ⚠️ **Image + PDF + Markdown only** | Full upload → encrypt → IPFS pin → testnet mint flow. Video and audio MIME types are rejected with a "Download PC2 to mint videos and audio" modal — see §3.4 for the data-processing rationale. ~5-LOC validator gate in `Creator/app.js` keyed off `PC2_TRIAL_MODE=1` |
| Player app | ✅ | Plays back any demo-minted asset (image-class assets only by virtue of Creator restriction) |
| dDRM Viewer | ✅ | Renders `.ddrm` files minted in the demo |
| AI chat | ⚠️ **BYOK only** | Visitor pastes their own OpenAI / Anthropic / Groq / OpenRouter / xAI / DeepSeek key in Settings → AI. Without a key, the chat surface shows two paths: (1) "Paste an API key" → standard PC2 BYOK flow, (2) "Or get hosted AI from Elacity — coming soon" → waitlist sign-up button (captures revenue-interest signal — see §9.4). NO local Ollama bundled; NO Elacity-paid inference. ~30 LOC of new UI in `UIAIChat.js` gated on `PC2_TRIAL_MODE=1` |
| Settings → Wallet | ⚠️ Read-only | Visitor sees the wallet UI but cannot export keys; recovery phrase shows "Download PC2 to generate your own" |
| Settings → AI | ⚠️ **BYOK-only mode** | Visitor can paste an API key for any supported provider (same as real PC2). Model-install (Ollama "download model" button) is hidden in trial mode — would consume disk + bandwidth + RAM beyond the trial budget |
| Settings → Backup | ⚠️ Hidden | No backup in demo — clicking it shows the "Download PC2" modal |
| Settings → Updates | ⚠️ Hidden | Auto-update disabled in trial mode |
| Terminal | ⚠️ Disabled | `isolation_mode: disabled` per `docs/DEPLOYMENT.md` Terminal Isolation Modes table |
| Particle Auth | ❌ | Replaced with a faucet-funded throwaway SA per session |
| Lit Chipotle production | ❌ | Replaced with Lit Naga TEST endpoints + a single shared demo PKP |
| Production IPFS cluster | ❌ | Demo Kubo is standalone, not joined to the production CRDT cluster — its pinset never replicates to Contabo/InterServer/ipfs.ela.city |
| Telemetry (T-1) | ❌ | `POST /api/telemetry/onramp` returns 204 immediately, never queues |
| WireGuard | ❌ | Demo PC2 is reachable via Caddy proxy only, no tunnel |
| `secure-view` against production keys | ❌ | The `usageKey` and Chipotle key files don't exist inside the container |

---

## §3  Isolation & security architecture

### 3.1 Container isolation

```bash
docker run --rm -d \
  --name pc2-trial-<token> \
  --memory=512m --memory-swap=512m \
  --cpus=0.5 \
  --pids-limit=512 \
  --read-only \
  --tmpfs /app/data:size=5G,mode=1777 \
  --tmpfs /tmp:size=512m,mode=1777 \
  --network=trial-net \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges \
  --security-opt=seccomp=/etc/docker/trial-seccomp.json \
  -e PC2_TRIAL_MODE=1 \
  -e PC2_TRIAL_TOKEN=<token> \
  -e PC2_ISOLATION_MODE=disabled \
  -p 127.0.0.1:420N:4200 \
  pc2-node:trial
```

Key invariants:

- **Read-only root FS** — only `/app/data` (tmpfs) and `/tmp` (tmpfs) are writable; everything else is read-only
- **No swap** — RAM cap is hard; OOM kills the container, doesn't slow the host
- **All caps dropped except `NET_BIND_SERVICE`** — no ptrace, no mount, no namespace games
- **Custom seccomp profile** — block `mount`, `clone3` (older Docker), `bpf`, `keyctl`, `ioctl(KDSETLED)`, plus the standard hardened list
- **`no-new-privileges`** — `sudo` and setuid binaries can't escalate
- **Network on a dedicated bridge** — `trial-net` is `--internal` *plus* a NAT egress rule that only allows the 5 allow-listed destinations (see §3.2)
- **Port bound to localhost** — Caddy is the only thing that can reach the container; the container's port 4200 is unreachable from the public internet without going through Caddy

### 3.2 Network egress allow-list

`iptables` on the host:

```
# Default-drop on the trial-net bridge
iptables -I DOCKER-USER -i br-trial -j DROP

# Allow DNS
iptables -I DOCKER-USER -i br-trial -p udp --dport 53 -j ACCEPT

# Allow established/related (return traffic for our own outbound)
iptables -I DOCKER-USER -i br-trial -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow-list outbound destinations
# Base Sepolia RPC (Alchemy)
iptables -I DOCKER-USER -i br-trial -p tcp -d base-sepolia.g.alchemy.com --dport 443 -j ACCEPT
# Lit Naga TEST
iptables -I DOCKER-USER -i br-trial -p tcp -d datil-test.litgateway.com --dport 443 -j ACCEPT
# GitHub raw (capsule templates)
iptables -I DOCKER-USER -i br-trial -p tcp -d raw.githubusercontent.com --dport 443 -j ACCEPT
# npm registry mirror
iptables -I DOCKER-USER -i br-trial -p tcp -d registry.npmjs.org --dport 443 -j ACCEPT
# hCaptcha verify (only called from orchestrator, but containers may need it for embedded demos)
iptables -I DOCKER-USER -i br-trial -p tcp -d hcaptcha.com --dport 443 -j ACCEPT
# LLM providers (BYOK — visitor pastes their own API key; we never see it)
iptables -I DOCKER-USER -i br-trial -p tcp -d api.openai.com --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d api.anthropic.com --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d api.groq.com --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d openrouter.ai --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d api.x.ai --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d api.deepseek.com --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d api.together.xyz --dport 443 -j ACCEPT
iptables -I DOCKER-USER -i br-trial -p tcp -d generativelanguage.googleapis.com --dport 443 -j ACCEPT  # Gemini
iptables -I DOCKER-USER -i br-trial -p tcp -d api.mistral.ai --dport 443 -j ACCEPT
```

The BYOK allow-list is the set of LLM providers that PC2's existing `AIChatService` supports (see `pc2-node/src/services/ai/AIChatService.ts`). Mirror that list exactly — if PC2 adds a new provider, add it here in the same PR. **Phase 1.5 alternative** (§9.4): when we ship the Elacity-hosted AI subscription, replace the 9 provider rules above with a single `llm.ela.city` ACCEPT and route everything through the Elacity proxy.

Verification: `scripts/audit-trial-egress.sh` (executes inside a running trial container, attempts curl to 10 non-allow-listed hosts, all must time out).

### 3.3 Credential audit (build-time)

The `pc2-node:trial` image build step runs:

```bash
# In Dockerfile.trial, after COPY
RUN test ! -f /app/data/.chipotle-api-key \
 && test ! -f /app/data/.chipotle-account-key \
 && test ! -f /app/data/.lit-pkp-id \
 && test ! -f /app/.env \
 && ! grep -r 'cloud.ela.city\|chipotle-functions\|sk_live\|sk_prod' /app 2>/dev/null \
 || (echo "PRODUCTION CREDENTIAL DETECTED IN TRIAL IMAGE — BUILD HALTED" && exit 1)
```

This makes it impossible to accidentally ship a production key in the trial image — the build dies.

### 3.4 Data-processing budget — what dDRM packaging costs inside a trial container

The trial container has **0.5 vCPU / 512 MB RAM**. dDRM packaging is the heaviest visitor-triggered workload, and the cost profile splits cleanly into "fine" and "explosive" depending on media type.

#### Non-media packaging (PDF / code / Markdown / models) — cheap

| Step | Cost on 0.5 vCPU |
|---|---|
| Generate CEK (AES-256-GCM) | <1 ms |
| Encrypt input (50 MB PDF reference) | 0.5–1 s |
| Chunk → IPFS local pin | 1–2 s |
| Lit Naga TEST encrypt-CEK round-trip | 2–3 s (network-bound) |
| Sign metadata + emit `.ddrm` capsule | 0.5 s |
| Base Sepolia mint (`opRawData`) | 3–5 s (chain confirmation) |
| **Total end-to-end** | **8–12 s** |

Fits comfortably; **no special handling needed**.

#### Media packaging (audio / video / images) — explosive

ffmpeg transcoding to DASH + per-segment CENC is CPU-bound. On 0.5 vCPU, a 1-minute 1080p source → 480p DASH takes **~60–120 s**. Peak working set: ~300 MB transient disk (within the 5 GB tmpfs), ~150 MB transient RAM (within the 512 MB cap, but tight).

The host-wide blast radius if N concurrent visitors hit "mint video" at the same time on a Hetzner CCX33 (8 host vCPU):

| N concurrent | Host CPU impact | UX outcome |
|---|---|---|
| 1 | ~6 % of host | Mints in ~90 s |
| 5 | ~30 % of host | Fine for everyone |
| 15 | ~95 % of host | **Other sessions feel laggy** |
| 30 | **Host CPU saturated** | **Demo unusable for everyone** |

The 30-session column is a realistic Hacker News / Twitter spike scenario. We don't get to control when visitors arrive.

#### Three options, ordered by complexity

| # | Option | Demo completeness | Host load | UX | Complexity |
|---|---|---|---|---|---|
| **A** | **Image + PDF + Markdown only in trial.** Block video/audio upload in `Creator` with a friendly "Download PC2 to mint videos and audio — full ffmpeg power on your hardware" modal. | High — full dDRM loop demonstrated, just not for video | Very low | Fast — ~10 s per mint | Low — ~5 LOC in `Creator/app.js` validator |
| B | Allow video with hard caps + global queue: max 30 s input, max 50 MB, single-rendition 360p, host-wide max 5 concurrent transcodes, "your turn in 2 min" UI when queue full | Higher | Medium | Slow during busy moments | High — needs queue service + UI states |
| C | Centralised transcoder pool on host: 4 shared ffmpeg workers serve all containers via a Unix socket | Highest | Low (predictable) | Fast for visitor | Very high — breaks "container is self-contained" model; adds privileged egress path |

#### Recommendation — Option A for v1

1. **The exclusion IS the upsell.** "Download PC2 to mint videos" is a stronger Download CTA than "Mint videos here."
2. **The full loop is still demonstrable** with image + PDF + Markdown: encrypt → IPFS pin → Lit Action → on-chain mint → viewer decrypt → playback. Visitors see the magic.
3. **Predictable host load.** No scenario where one visitor's mint degrades another's experience.
4. **~5 LOC of new code** in the Creator app's upload validator, env-gated.

Re-evaluate Option B for v1.1 if conversion is healthy and visitor feedback specifically asks for video. Option C remains overkill until trial is a real production line.

#### Implication for resource sizing — no change

With Option A in effect, 512 MB / 0.5 vCPU per session stays comfortable. If we ever ship Option B, bump packaging-time burst to 768 MB / 1.0 vCPU; idle sessions stay at 512/0.5.

#### Adjacent observation — AI inference has zero host cost in trial

The original draft of this plan recommended local Ollama for the AI chat tab, which would have created the same 0.5 vCPU bottleneck class as ffmpeg (5–10 tokens/sec, ~250 MB RAM, ~1 GB model on disk). **D3 was flipped to BYOK** (bring-your-own-key): the trial container does **zero LLM inference**; visitors paste their own OpenAI / Anthropic / Groq / OpenRouter / xAI / DeepSeek key in Settings → AI, and inference happens at the chosen provider. The trial container only ships the existing PC2 AI chat UI plus a small "Or get hosted AI from Elacity — coming soon" waitlist button rendered when no key is configured. See §9.4 for the future-subscription opportunity this unlocks.

Practical effect on the trial-host data-processing budget: **AI is not a host workload**. We pay nothing for visitor inference (they paid OpenAI / Anthropic / etc.), and there's no RAM/CPU pressure beyond the existing PC2 base load. The only data-processing constraint on the host remains ffmpeg transcoding, which §3.4 above closes via Option A (image/PDF/Markdown only in Creator).

#### Why this doesn't bleed into production

The trial Kubo is **standalone** (not joined to the production CRDT cluster), so trial packaging never replicates to Contabo/InterServer/ipfs.ela.city. Trial mints go to Base Sepolia, which our production indexer doesn't watch. Trial Lit calls use Naga TEST, which doesn't share rate-limit pool with the production Chipotle account. The data-processing concern is **bounded entirely to the trial host's own CPU/RAM/disk** — it cannot cascade into production load anywhere else.

### 3.5 What a malicious visitor can and cannot do

| Attack | Demo's defence |
|---|---|
| Coin-mine inside their session | `--cpus=0.5` + 60-min idle + 4h hard cap → economically uninteresting |
| DDoS from inside their session | Network egress allow-list; outbound packets that aren't to the 5 allow-listed hosts are dropped |
| Escape container → host root | Read-only rootfs + dropped caps + seccomp + no-new-privileges → standard CVE-class container escape needed (we patch host kernel monthly) |
| Steal demo Lit testnet PKP | Even if they extract it, Lit Naga TEST keys cost nothing and have no production value |
| Steal session-funded SA private key | The SA is faucet-funded with ~0.001 testETH, refunded automatically by the orchestrator on session destroy; private key is generated in-container per session, never reused |
| Spam launches to exhaust slots | hCaptcha gate + per-IP-hash rate limit (3 launches per hour) + 30-session cap on the host |
| Pin garbage to our production IPFS cluster | Demo Kubo is standalone, not joined to the cluster — pins die when the container does |
| Mint malicious assets to confuse production Market | Demo mints go to Base Sepolia, never indexed by the production indexer |
| Brute-force the orchestrator API | Orchestrator endpoints require a valid `X-Trial-Token` header (HMAC-SHA256 of session_id + host secret); only obtainable from successful captcha completion |
| Hot-link the demo to embed PC2 in a phishing page | CSP `frame-ancestors 'none'` on every page → demo refuses to load inside an iframe |

---

## §4  Sovereignty narrative integrity

This is the most important section of the plan. The architecture is straightforward; getting the framing right is hard.

### 4.1 The banner

A persistent strip across the top of the PC2 desktop, height 32 px, colour `#fef3c7` (amber-50), text:

> **You're trying PC2 in a sandbox.** Your work here stays on Elacity's demo server and will be deleted in **47 minutes**. [**Download PC2** to keep what you create on your own hardware.]

The banner:
- Cannot be dismissed
- Is rendered server-side in the index HTML by `TrialModeService`, not by client JS — visitors can't hide it with devtools
- Includes a live countdown (heartbeat-driven) so the visitor sees their session expiring in real time
- Has the "Download PC2" link styled as a primary button, not a text link

### 4.2 Filesystem framing

- The Files app shows `/demo/` as the root, not `/`
- The Files app tooltip on the breadcrumb explains: "This is a sandbox folder. Anything you save here is deleted when your session ends."
- Three pre-seeded folders: `/demo/Welcome/`, `/demo/Sample Assets/`, `/demo/Try Minting/` — each contains a Markdown file explaining what the visitor can try

### 4.3 Wallet framing

- Settings → Wallet header: "Demo wallet — Base Sepolia testnet"
- "Recovery phrase" button shows a modal: "Demo wallets have no recovery — when your session ends, this wallet is gone. **Download PC2** to create a real wallet you own."
- The faucet button is enabled and visible: "Get 0.01 testETH" — but it's pre-funded so the visitor doesn't need to click
- The "Send" button works but only to testnet addresses

### 4.4 What the visitor can actually do in 10 minutes

The acceptance bar for "the demo is good enough" is: a curious visitor can walk through this in <10 minutes without help.

1. **Browse the Market** — see real (testnet-deployed) capsules listed; tap "Buy" on a free one → it installs to `/demo/Apps/`
2. **Open a capsule** — `glide-finance` or `elastos-nft` demo capsules pre-installed; click around the UI
3. **Mint something** — drag a JPG (or PDF) into the Creator app → fill the wizard → mint to Base Sepolia → see the tx in BaseScan. Video/audio uploads are intentionally refused in trial — see §3.4 for the data-processing rationale; the rejection modal doubles as a Download-PC2 conversion event
4. **Play it back** — open the minted asset in dDRM Viewer → CEK retrieved from Lit Naga TEST → renders successfully
5. **(Optional) Talk to the AI** — sidebar chat → if the visitor pastes their own OpenAI / Anthropic / Groq / etc. key, they can ask "show me what's on this PC2" and get a real reply via their own provider. Without a key, the chat surfaces a "Get hosted AI from Elacity — coming soon" waitlist CTA — drops them into the future Phase 1.5 subscription funnel (see §9.4). This step is **optional** for the demo — the conversion moment is step 4 (full dDRM loop)

If a visitor completes step 4, they've seen the full dDRM loop. That's the conversion moment.

### 4.5 The Download CTA

Three placements:
- **Taskbar** — persistent "Download PC2" button to the right of the start menu, never dismissable
- **Banner** — primary action on the amber strip at the top
- **Session-end modal** — when the countdown reaches 5 minutes, a modal pops: "Your session ends soon. Download PC2 to keep going." with OS-detected installer link
- **Migration bundle** — clicking Download triggers `GET /api/trial/<id>/migration-bundle` → returns a `.zip` with:
  - `installer-link.html` (one-tap to the right OS installer)
  - `intents.json` (any `publish_intents` rows the visitor created — they can import on real PC2)
  - `bookmarks.json` (capsules they viewed)
  - `README.md` ("Welcome to your real PC2. Here's what you tried in the demo and how to recreate it.")

---

## §5  Sizing & capacity math

### 5.1 Single-session budget

| Resource | Limit per session | Rationale |
|---|---|---|
| RAM | 512 MB | PC2 base load is ~300 MB; 200 MB headroom for Ollama 1.5b (which streams from disk, doesn't preload entirely) + browser bridge |
| vCPU | 0.5 core | PC2 idle uses ~5 %; brief spikes during transcode (which we cap at 480p in trial mode) hit ~80 % of 0.5 = 40 % of one host core |
| Ephemeral disk | 5 GB tmpfs | Holds: capsule installs (~50 MB each, max 10), one demo upload (~500 MB), DASH transcode output (~1.5× source), AI model cache (1 GB) |
| Idle TTL | 60 minutes | Long enough for a thoughtful visitor; short enough to free slots |
| Hard TTL | 4 hours | Catches forgotten tabs |
| Network egress | No hard cap (allow-list does most of the work) | But monitor — if a session pulls >2 GB egress, alert |

### 5.2 Host capacity at recommended hosting

**Hetzner CCX33 (8 dedicated vCPU / 32 GB RAM / 160 GB NVMe / 20 TB egress):**

- RAM ceiling: 32 GB ÷ 0.512 GB = 62 sessions, minus 4 GB for host + orchestrator + Caddy → **~55 sessions**
- vCPU ceiling: 8 ÷ 0.5 = 16 sessions at sustained full-load
- Realistic concurrent: **~30 sessions** (sessions average 10 % CPU; bursts overlap rarely)
- Sessions per day at avg 30 min: 30 × 48 (slots) = **~1,440 sessions/day** (theoretical ceiling)
- Practical sessions per day (with 50 % slot utilisation): **~700/day**

That's a comfortable ceiling for the entire first 6 months of `try.pc2.net`. Below that, we don't need to scale.

**Contabo VPS-XL (10 vCPU shared / 60 GB RAM / 500 GB SSD) — if Sasha picks (b):**

- RAM ceiling: 60 GB ÷ 0.512 = 117 sessions, minus 4 GB host → ~109 sessions
- vCPU is shared, so steal-time can drag effective per-session CPU to ~0.3 cores under contention
- Realistic concurrent: **~25 sessions** with worse UX (perceptible lag during burst)
- Cheaper but less consistent. Acceptable for a beta launch; CCX33 is recommended for steady-state.

### 5.3 Bandwidth math

Per-session expected bandwidth:
- PC2 desktop initial load: ~12 MB (cached after first visit)
- WebSocket overhead during 10-min session: ~2 MB
- One Creator upload: capped at 200 MB by the orchestrator (which sets `MAX_UPLOAD_SIZE_MB=200`)
- DASH transcode output streamed back to player: ~80 MB for a typical 1-min video
- IPFS local pin operations: ephemeral, never cross-host

Per-session total: ~100-300 MB average. At 700 sessions/day: ~150 GB/day = ~4.5 TB/month — well within Hetzner's 20 TB.

---

## §6  Hosting provider comparison

Updated 2026-05-25 with current published prices. EUR-converted via ECB reference rate where relevant.

### 6.1 Shared / Cloud VPS (recommended class for this task)

| Provider / Tier | Price | vCPU | RAM | Disk | Net | Notes |
|---|---|---|---|---|---|---|
| **Hetzner CCX23** | €17/mo | 4 dedicated | 16 GB | 80 GB NVMe | 1 Gbit / 20 TB | Tight — borderline for 30 concurrent sessions; OK for beta with 15-20 cap |
| **Hetzner CCX33** ⭐ | **€33/mo** | **8 dedicated** | **32 GB** | **160 GB NVMe** | **1 Gbit / 20 TB** | **Recommended.** Headroom for steady-state + spike, dedicated vCPU = consistent UX |
| Hetzner CCX43 | €65/mo | 16 dedicated | 64 GB | 240 GB NVMe | 1 Gbit / 20 TB | Overkill for v1; revisit when concurrent sessions consistently >40 |
| **Contabo VPS-L** | €14.50/mo | 8 shared | 30 GB | 400 GB SSD | 1 Gbit / 32 TB | Shared vCPU = inconsistent under burst; OK for cheap beta |
| **Contabo VPS-XL** | €25/mo | 10 shared | 60 GB | 500 GB SSD | 1 Gbit / 32 TB | Cheap, large RAM, the "if we want max bang for buck" option |
| Contabo VPS-XXL | €36/mo | 12 shared | 90 GB | 1.6 TB SSD | 1 Gbit / 32 TB | Disk overkill; shared vCPU still the limit |
| **InterServer Cloud 8 GB** | $24/mo (~€22) | 4 shared | 8 GB | 160 GB SSD | 1 Gbit / 8 TB | RAM-bound; would cap us at ~12 concurrent sessions |
| InterServer Cloud 16 GB | $48/mo (~€44) | 8 shared | 16 GB | 320 GB SSD | 1 Gbit / 16 TB | Pricier than Hetzner CCX33 for less RAM |
| **Vultr High Frequency 8 CPU** | $96/mo (~€88) | 8 dedicated | 32 GB | 512 GB NVMe | 1 Gbit / 6 TB | 2.7× the cost of Hetzner CCX33 for similar specs |
| **DigitalOcean Premium AMD 8c** | $168/mo (~€155) | 8 dedicated | 16 GB | 320 GB NVMe | 1 Gbit / 6 TB | Premium pricing; not justified for a demo workload |
| **Linode Dedicated 32GB** | $192/mo (~€177) | 16 dedicated | 32 GB | 640 GB SSD | 1 Gbit / 12 TB | Premium; consider for production hosted-PC2 in Phase 2 |

### 6.2 Bare-metal (overkill for trial, listed for future Hosted-PC2 phase)

| Provider / Server | Price | CPU | RAM | Disk | Net | Notes |
|---|---|---|---|---|---|---|
| Hetzner AX41-NVMe | €50/mo | Ryzen 5 3600 (6c/12t) | 64 GB | 2 × 512 GB NVMe | 1 Gbit / 20 TB | Single-tenant; great for ~80 concurrent sessions; consider for Phase 2 |
| Hetzner AX52 | €78/mo | Ryzen 7 7700 (8c/16t) | 64 GB | 2 × 1 TB NVMe | 1 Gbit / 20 TB | Newer Zen 4; best-in-class for browser-class workload |
| OVH Advance-2 | €99/mo | Ryzen 9 (16c/32t) | 64 GB | 2 × 960 GB NVMe | 2 Gbit / unlimited | Pricier than Hetzner but unlimited bandwidth |

### 6.3 Recommendation logic

**Pick Hetzner CCX33 unless:**

1. Sasha specifically wants to consolidate on a provider we already use → Contabo VPS-XL is the next pick. Acceptable, slightly worse UX.
2. The trial gets unexpectedly popular and we hit >40 concurrent regularly → graduate to Hetzner AX41-NVMe (€50/mo) for dedicated metal.
3. We want a US presence → InterServer Cloud 16 GB is the only US option in the price band that makes sense; consider for a second host in Phase 2 (a US shard so visitors get sub-100 ms RTT).

### 6.4 What we are NOT picking and why

- **AWS / GCP / Azure**: 4-10× the cost for equivalent compute. Wrong tool for a self-hosted product demo.
- **Cloudflare Workers / Pages**: PC2 is a stateful Node process with disk + IPFS — not a fit for ephemeral edge compute.
- **Replit / Glitch / CodeSandbox-as-host**: We'd be ceding the trial UX to a third party that could change pricing or shut us down.
- **Bare metal at OVH / Hetzner AX-series for v1**: overkill; we'd spend the operator time on bare-metal-specific issues instead of on the demo UX.

---

## §7  Implementation files

Anticipated file inventory (will be confirmed at implementation-ticket gate, post Sasha sign-off on §0):

### 7.1 New files

| File | Purpose | Owner |
|---|---|---|
| `deploy/trial-host/README.md` | Operator-facing setup guide | This task |
| `deploy/trial-host/cloud-init.yml` | One-shot VPS provisioning (Hetzner cloud-init or generic shell) | This task |
| `deploy/trial-host/Caddyfile` | Wildcard SSL + import directive for orchestrator-generated snippets | This task |
| `deploy/trial-host/orchestrator/package.json` | Orchestrator service deps (express, dockerode, better-sqlite3, hcaptcha) | This task |
| `deploy/trial-host/orchestrator/src/index.ts` | Orchestrator entry point | This task |
| `deploy/trial-host/orchestrator/src/lifecycle.ts` | provision / heartbeat / destroy | This task |
| `deploy/trial-host/orchestrator/src/captcha.ts` | hCaptcha verify | This task |
| `deploy/trial-host/orchestrator/src/db.ts` | SQLite session table | This task |
| `deploy/trial-host/orchestrator/systemd/trial-orchestrator.service` | systemd unit | This task |
| `deploy/trial-host/public/index.html` | Landing page with hCaptcha | This task |
| `deploy/trial-host/public/style.css` | Landing page styles | This task |
| `deploy/trial-host/iptables-trial.sh` | Egress allow-list installer | This task |
| `pc2-node/Dockerfile.trial` | Trial-flavoured PC2 image | This task |
| `pc2-node/src/services/setup/TrialModeService.ts` | Trial-mode gating logic | This task |
| `pc2-node/src/api/setup/trialBanner.ts` | Banner config endpoint | This task |
| `scripts/audit-trial-egress.sh` | Verifies allow-list works | This task |
| `scripts/test-trial-soak.sh` | 24h synthetic load test | This task |
| `docs/deployment/PUBLIC_TRIAL_RUNBOOK.md` | Operator runbook | This task |

### 7.2 Existing files modified

| File | Change | Risk |
|---|---|---|
| `src/gui/src/UI/UIDesktop.js` | Add taskbar Download CTA gated by `process.env.PC2_TRIAL_MODE` (delivered via `/api/setup/trial-banner`) | Low — env-gated, defaults to off |
| `src/gui/src/UI/AI/UIAIChat.js` | Add "Or get hosted AI from Elacity — coming soon" waitlist CTA when no API key is configured AND `PC2_TRIAL_MODE=1`. ~30 LOC. POSTs visitor email to `/api/trial/ai-waitlist` which forwards to the chosen signup-collection backend (HubSpot / SendGrid / Plausible — Sasha picks before launch) | Low — env-gated, isolated to AI chat surface |
| `pc2-node/data/test-apps/elacity-creator/app.js` | ~5-LOC validator gate: when `puter.env.PC2_TRIAL_MODE === '1'` and MIME is `video/*` or `audio/*`, surface "Download PC2 to mint videos and audio" modal and abort before ffmpeg. See §3.4 | Low |
| `pc2-node/src/api/index.ts` | Register `trialBanner` route + `ai-waitlist` route | Low |
| `docs/core/ROADMAP.md` | Add Public Cloud PC2 milestone | None — doc |
| `docs/handover/MASTER_HANDOVER.md` | Reference this task in active-tasks list | None — doc |
| `docs/DEPLOYMENT.md` | Cross-link to PUBLIC_TRIAL_RUNBOOK.md | None — doc |

### 7.3 Files explicitly NOT touched

- All `pc2-node/src/services/dDRM/*` — no DRM code path changes; trial just doesn't have the credentials
- All `pc2-node/src/services/wallet/*` — wallet code unchanged; trial config picks Sepolia
- All `pc2-node/src/services/telemetry/*` — T-1 code unchanged; trial sets `PC2_TELEMETRY_DISABLED=1`
- All supernode unit files / supernode configs — trial host is NOT a supernode

---

## §8  Rollout plan

| Step | What | Gating | Eng days |
|---|---|---|---|
| 1 | Sasha greenlights §0 decisions | Sasha sign-off on §0 | — |
| 2 | Provision Hetzner CCX33; DNS `*.try.pc2.net` → A record; SSH key landed | Step 1 | 0.5 |
| 3 | Build `pc2-node:trial` image; credential audit passes; smoke-run a single container locally | Step 1 | 1 |
| 4 | Orchestrator MVP: `POST /launch` provisions one container; `DELETE` tears down | Step 3 | 2 |
| 5 | Caddy wildcard cert; orchestrator writes per-session Caddy snippet | Step 4 | 1 |
| 6 | Landing page with hCaptcha + Launch button | Step 5 | 0.5 |
| 7 | Sovereignty-banner UI shipping inside the trial image; "Download PC2" taskbar CTA | Step 3 | 1.5 |
| 8 | Egress allow-list via iptables; `audit-trial-egress.sh` passes | Step 5 | 1 |
| 9 | 24h synthetic soak test; tune RAM / CPU caps based on observed; document | Step 8 | 1 |
| 10 | Sasha personal walk-through; copy review; soft-launch decision | Step 9 | — |
| 11 | Public launch — post to Discussions, Twitter, Discord | Sasha greenlight | 0.5 |
| 12 | Phase 2 — multi-host pool, optional US shard | Triggered if >40 concurrent regularly observed | — |

**Engineering total**: ~8.5 days (1.7 weeks for one engineer). Realistic calendar time including PR review + Sasha review cycles: ~2.5 weeks from sign-off to public launch.

---

## §9  Phase 2 / Phase 3 — what comes after `try.pc2.net`

Out of scope for this task, but worth knowing where it goes:

### 9.1 Phase 2 — Hosted PC2 (paid, per-user dedicated VM)

A real product: pay €5/mo, get a Hetzner Cloud CX22 (€4/mo to us, €1 margin) provisioned in your name with PC2 pre-installed, your wallet, your data. Like managed WordPress but for PC2.

- We provision via Hetzner Cloud API + cloud-init
- User gets root SSH (their key)
- We never touch it after handover
- DNS: `username.host.pc2.net` (we keep DNS; alternatively user points their own domain)
- Sovereignty narrative: "you own the VM, we just billed your card." Honest because they have root and can `terraform destroy` us out of the picture any time.
- **The §3.4 data-processing constraint naturally disappears here**: each paying user has a full dedicated VM (2 vCPU / 4 GB RAM minimum on CX22), so ffmpeg transcoding works at PC2's full quality. The "image + PDF + Markdown only" constraint is a property of the throwaway trial environment, not of hosted PC2.

### 9.2 Phase 3 — DePIN Hosted (community-operated supernodes hosting PC2 instances)

Long-term: any community member with a beefy server can become a "PC2 hosting provider" and earn ELA. Smart-contract-mediated. Lines up directly with the supernode operator economics in [`SUPERNODE_ECONOMICS.md`](../../../docs/core/SUPERNODE_ECONOMICS.md).

### 9.3 Phase 4 — Capsule-runtime hosted (Anders' Runtime v2)

When Runtime v2 ships, hosted-PC2 becomes a per-user capsule running on a Carrier-connected host. The host operator doesn't see your data (capsules are content-addressed + capability-gated). This is the end-state of the sovereign-cloud trajectory.

### 9.4 Phase 1.5 — Elacity-hosted AI subscription (revenue tier unlocked by D3)

The D3 BYOK decision sets up a clean future product. During the trial, when a visitor opens the AI chat tab without a key configured, they see two paths:

1. **Paste your API key** — standard PC2 BYOK flow (already supported, no new code)
2. **"Or get hosted AI from Elacity — coming soon"** — waitlist sign-up button (new, ~30 LOC in `UIAIChat.js`)

The waitlist button captures revenue-interest signal *during the trial itself*, at the exact moment a visitor would otherwise drop off because they don't have an API key handy. Email goes to a separate `ai-waitlist@ela.city` mailbox (or whichever signup-collection tool we use); zero coupling to the trial host's session state.

**The product behind the waitlist** — when we're ready:

- A small Node proxy at `llm.ela.city` (or `llm-proxy.try.pc2.net` for trial-scoped) that accepts the OpenAI-compatible chat-completions API and forwards to whichever backend we've negotiated the best wholesale rate with (OpenRouter, direct OpenAI, Anthropic, etc.)
- Per-subscriber API key issued by us; rate-limited at the proxy
- Pricing examples (illustrative — Sasha decides):
  | Tier | Price | Tokens/month | Notes |
  |---|---|---|---|
  | Tourist | €5/mo | 100k | Roughly 50 chat turns/day at the GPT-4o-mini equivalent |
  | Maker | €15/mo | 500k | For active creator workflows |
  | Studio | €50/mo | 2M | For agent-heavy use (Monetisation Agent S1+) |
- Subscription works **on real PC2 too**, not just the trial — visitor downloads PC2, pastes their Elacity AI key the same way they would an OpenAI key, no per-OS deployment work
- Cost margin: typical LLM wholesale via OpenRouter is ~60–70 % of retail; comfortable margin even at the cheapest tier

**Why this is a clean tier rather than a forced bundle:**

- Sovereignty narrative stays intact — users can always BYOK; subscription is convenience, not lock-in
- Trial users see the tier as the *natural* answer to "I want to keep using AI here but don't have an OpenAI key"
- We don't need to ship it day-one of `try.pc2.net` — the waitlist captures the signal; we stand up the proxy when demand justifies it (probably 200+ waitlist signups)

**Implementation-wise, the trial-host network egress allow-list (§3.2) is forward-compatible**: when we ship the subscription, replace the 9 individual LLM provider rules with a single `llm.ela.city` ACCEPT and route everything through the Elacity proxy. The trial container's PC2 config gets a single env var `PC2_LLM_PROXY=https://llm.ela.city` that overrides every provider's base URL.

**Tracked separately from this task.** When the waitlist hits a threshold worth standing the proxy up, that becomes its own ticket (`ELACITY-AI-SUBSCRIPTION-2026-XX`). Don't build the proxy as part of this trial-host ticket.

---

## §10  Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Demo container escape → host root | Low | High | Hardened seccomp + read-only rootfs + cap-drop; monthly kernel updates on host; CVE monitoring on docker.io/library/* base images |
| R2 | Visitor abuses demo for crypto-mining | High (everyone tries) | Low (we cap CPU) | CPU cap + 60-min idle TTL + economic uninterestingness; one-line audit cron flags any session with >80 % CPU for >5 min |
| R3 | Misbehaving session OOMs all peers | Medium | Medium | Hard `--memory=512m --memory-swap=512m` per container; host has 4 GB headroom; orchestrator monitors RSS |
| R3a | **Transcode storm — 15+ visitors hit "mint video" simultaneously and saturate host CPU** | Medium (during Hacker News / Twitter spikes) | High (whole demo unusable for everyone) | **Closed by §3.4 Option A** — trial Creator refuses video/audio uploads, image/PDF/Markdown only. Validator gates ffmpeg before any work starts. If we relax to Option B in v1.1, add a host-wide transcode queue capped at 5 concurrent jobs |
| R4 | Public IPFS gateway abuse via demo | Low | Low | Demo Kubo is standalone; egress allow-list blocks outbound IPFS swarm dials |
| R5 | Lit testnet credit exhaustion | Low | Medium | Lit Naga TEST is free, but we cap demo-only Lit calls per session at 50 (enough for the full Creator → Player loop ×3) |
| R6 | Sasha's brand integrity worry → "this dilutes sovereignty narrative" | Medium | High (could kill the project) | Every UI panel renders the persistent demo banner; copy reviewed line-by-line; bail-out switch on the orchestrator that takes the whole demo offline in <1 minute if Sasha calls it |
| R7 | Demo is so popular it consumes operator time | Medium | Medium | hCaptcha gate + 30-session cap on the host + alerts if approaching cap; Phase 2 is the answer for sustained demand |
| R8 | Visitor's browser blocks third-party cookies / WebSocket → broken demo | Medium | Medium | Caddy serves the subdomain with same-origin cookies + first-party WebSocket; falling back to polling if WS fails (existing PC2 fallback) |
| R9 | Geographic latency from EU host hurts US visitors | High | Low (we accept it for v1) | Phase 2 second host in InterServer US; round-robin DNS by GeoIP |
| R10 | We forget to renew the Hetzner card → host goes offline | Low | Medium | Alerts wired to PagerDuty (or just email); €33 charged 4 weeks before due |

---

## §11  Risk register signal-checks

Quick-look operational metrics the runbook should monitor:

| Metric | Healthy band | Alert threshold | Action |
|---|---|---|---|
| Host RAM used | < 70 % | > 85 % | Investigate top sessions; possibly reduce host cap |
| Host CPU 5-min load | < 5.0 | > 7.0 | Same as above |
| Concurrent sessions | 0 – 30 | > 28 | Consider raising cap or graduating to CCX43 |
| Sessions/hour | 1 – 50 | > 80 | Check captcha, possible abuse |
| Avg session duration | 5 – 30 min | > 90 min | Idle TTL probably bypassed — investigate |
| Migration-bundle downloads | depends | ≥ 1 % of sessions | This is the conversion event — celebrate, monitor for trend |
| Container OOM kills / day | < 5 | > 30 | Cap is too tight or someone's running heavy workload — investigate |
| Hetzner egress (rolling 7d) | < 4 TB | > 8 TB | We're hitting heavy media transcoding; cap session disk further |

---

## §12  Acceptance tests

Beyond the proposal-stage criteria in `README.md`, these must pass before public launch:

| # | Test | How |
|---|---|---|
| AT-1 | Single trial launch end-to-end | Manual; full Creator → mint → Player loop on Sepolia in <10 min |
| AT-2 | 30 concurrent sessions no OOM | `scripts/test-trial-soak.sh --concurrent 30 --duration 60m` |
| AT-3 | Network egress allow-list enforced | `scripts/audit-trial-egress.sh` from inside a running container; expects 5 ACCEPTs + 10 TIMEOUTs |
| AT-4 | Production credentials absent | `docker run --rm pc2-node:trial grep -r 'cloud.ela.city\|sk_live' /app` returns empty |
| AT-5 | Telemetry muted | `curl trial-test.try.pc2.net/api/telemetry/onramp -d '{}'` returns 204 without queueing |
| AT-6 | Banner renders on every panel | Manual screenshot pass: 7 named UI screens, each shows the amber strip |
| AT-7 | Hard TTL kills lingering sessions | Synthetic session at T+0, no heartbeat, verify container gone by T+4h |
| AT-8 | Captcha required | `curl -X POST /api/trial/launch -H 'Content-Type: application/json' -d '{}'` returns 403 without `captcha_token` |
| AT-9 | hCaptcha verified server-side | Submitting a known-bad token returns 403 even though the form sent one |
| AT-10 | Migration bundle is portable | Download bundle on demo, unzip, install real PC2, confirm intents import into real Creator app |
| AT-11 | Iframe embedding refused | `<iframe src="https://trial-xxx.try.pc2.net">` from another origin shows the browser's CSP block message |
| AT-12 | TLS valid + HSTS set | `curl -vI https://trial-test.try.pc2.net` shows `strict-transport-security: max-age=...` |
| AT-13 | Sasha walk-through subjective pass | Sasha demos to one non-engineer friend without coaching; friend reaches "mint" within 10 min |
| AT-14 | Video/audio upload rejected in trial Creator | Programmatic: `curl -F file=@sample.mp4 https://trial-xxx.try.pc2.net/api/.../upload` returns 4xx with the "Download PC2" modal payload. Manual: drag a 30 s MP4 into the Creator wizard, confirm the modal renders and ffmpeg is **not** invoked (`docker exec pc2-trial-<id> pgrep ffmpeg` returns empty) |
| AT-15 | BYOK AI chat works end-to-end | Manual: open AI chat tab → paste a working OpenAI / Anthropic / Groq key → send "what is PC2?" → confirm reply renders within 5 s. Programmatic: confirm the curated allow-list (§3.2) lets the call through and that no other LLM hostname is reachable from inside the container |
| AT-15a | "Hosted AI from Elacity — coming soon" waitlist button visible when no key configured | Manual: open AI chat tab on a fresh container (no key pasted) → confirm the waitlist sign-up CTA renders. Programmatic: `GET /api/setup/trial-banner` returns `aiWaitlistEnabled: true` |
| AT-15b | No local Ollama in trial image | Build-time: `docker run --rm pc2-node:trial which ollama` returns non-zero; `docker run --rm pc2-node:trial ls /root/.ollama` returns ENOENT. Runtime: the Settings → AI "Install model" button is hidden when `PC2_TRIAL_MODE=1` |
| AT-16 | Non-media mint full loop completes within budget | Programmatic mint of a 5 MB PDF on a fresh container; assert wall-clock < 15 s end-to-end (encrypt → IPFS pin → Lit Naga TEST → Base Sepolia mint → BaseScan-visible tx) |

---

## §13  Glossary of new terms introduced by this plan

- **Trial host** — the dedicated VPS hosting `try.pc2.net`. NOT a supernode, NOT a PC2 node.
- **Trial container** — one Docker container running `pc2-node:trial`. One per session.
- **Trial token** — HMAC-derived session identifier; serves as both the subdomain prefix and the bearer token for orchestrator API calls.
- **Trial-net** — the Docker bridge network the trial containers attach to; carries the egress allow-list.
- **Migration bundle** — the `.zip` a visitor downloads at session end (or on demand) containing their intents + installer link.
- **Demo PKP** — the shared Lit Naga TEST PKP all demo sessions use. Distinct from any production PKP.
- **Demo banner** — the persistent amber strip on every UI panel.
- **Sovereignty narrative** — the marketing promise that PC2 is your data on your hardware. The demo must honour it, not contradict it.

---

## §14  Open questions (parking lot — not blocking sign-off)

These are real questions that will surface during implementation; capturing them now so they're not forgotten.

1. **GeoIP routing for Phase 2** — when we add a US shard, do we route by latency probe or by simple GeoIP? Latency probe is fairer but harder to operate.
2. **Migration-bundle on PC2 side** — when a downloaded user imports the `migration-bundle.zip` into real PC2, what's the UI for that import? Probably a Settings → Import flow; design at Phase 2.
3. **Conversion-tracking ethics** — do we set a cookie to correlate "watched demo" with "downloaded installer"? Easier to measure, but cookie-trail conflicts with the "no tracking" pitch. Decide before launch: probably do without, accept fuzzy attribution.
4. **Faucet wallet refill cadence** — Base Sepolia faucet has rate limits. If we run dry, sessions can't pre-fund. Set a cron to refill from a master testnet wallet daily; alert if we're burning >10 testETH/day.
5. **Capsule template store in demo** — should demo visitors be able to install arbitrary capsules from `apps.ela.city`, or only a curated subset? Probably curated for v1 — uncontrolled capsule install adds attack surface.
6. **Visitor analytics** — Plausible? Self-hosted Matomo? Or none? Plausible is the lowest-friction privacy-respecting option (€9/mo, GDPR-clean).

---

*End of PLAN.md. See [`README.md`](./README.md) for the task ticket header and [`HANDOVER_2026-05-25_PUBLIC_CLOUD_PC2.md`](../../../docs/handover/HANDOVER_2026-05-25_PUBLIC_CLOUD_PC2.md) for the fresh-agent handover.*
