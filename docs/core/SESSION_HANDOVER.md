# Session Handover — Feb 26, 2026

> **Read this first when starting a new agent session.**

---

## Where We Are

**Branch:** `feature/jetson-gpu-acceleration` — 60+ commits ahead of main
**v1.1.0 release:** Blocked on Sash testing on own Jetson hardware (hasn't arrived yet)

### Validated

- One-command Jetson install works end-to-end on 2 independent Jetsons
- EverlastingOS (`elastos.ela.city`) — WireGuard, uploads, video streaming all working
- Anders (`alm.ela.city`) — fresh install, WireGuard via wireguard-go, domain live
- Upload bug was a display issue (progress bar doubling), files always uploaded correctly
- Gateway under systemd on supernode — auto-restarts, self-healing deployed
- Weekly shipping reports on GitHub Discussions (#1, #2, #3)

### Waiting On

1. **Sash's own Jetson** — hardware hasn't arrived. Once it does: run one-command install, validate, merge to main, tag v1.1.0
2. **Anders — WalletConnect/Essentials** — connection failed when scanning QR with Essentials wallet. MetaMask works. Low priority.
3. **Anders — Ollama model download** — "download complete immediately." Likely Ollama not installed/running. Told him to check `systemctl status ollama`
4. **EverlastingOS — pull latest** — needs to pull the progress bar fix (total_size*2 removed)

### DAO Proposal

- Keystone Fund proposal #356 live at https://elastos.com/suggestion/699c045de3bb57006e75463e
- Community discussion ongoing. Phantze raised concerns (addressed). EverlastingOS supportive.
- Council call upcoming — talking points prepared (see previous chat)
- WCI v1 audit passed. Expenditure portal live.

---

## Key Documents

| Document | Path | What It's For |
|----------|------|---------------|
| **This file** | `docs/core/SESSION_HANDOVER.md` | Start here |
| **Roadmap** | `docs/core/ROADMAP.md` | All milestones with checkboxes |
| **Strategy** | `docs/core/ELASTOS_STRATEGY.md` | Non-technical 3-phase overview |
| **Why It Matters** | `docs/core/WHY_ELASTOS_MATTERS.md` | Historical parallels, storytelling |
| **Architecture** | `docs/core/ARCHITECTURE_CONVERGENCE.md` | PC2 v1 → capsule runtime v2 technical path |
| **Network Hardening** | `docs/pc2-infrastructure/NETWORK_HARDENING.md` | Supernode scale-up requirements |
| **Agent Handover** | `docs/core/AGENT_HANDOVER.md` | Coding patterns, infrastructure details |
| **Weekly Report Template** | `docs/templates/WEEKLY_SHIPPING_REPORT.md` | How to generate weekly reports + HTML blog articles |

---

## What to Work On Next

From the roadmap (Milestone 2), items that don't need hardware:

1. **Mobile-responsive UI** — test in browser, fix layout issues
2. **WireGuard retry interval** — reduce from 60s to 15s with exponential backoff (quick code change in `ConnectivityService.ts`)
3. **Basic supernode uptime monitoring** — `/health` endpoint with dashboard
4. **Automated SSL renewal monitoring** on supernode
5. **AV1 server-side remuxing** — auto-convert MKV→MP4 for Firefox users

---

## Supernode Access

```
SSH: root@69.164.241.210
Password: [ROTATED -- stored in password manager, not in git]
```

- Gateway runs under systemd (`pc2-gateway.service`)
- Registry: `/root/pc2/web-gateway/data/registry.json` (66 registered nodes)
- WireGuard: `wg show wg0` (2 peers: EverlastingOS 10.100.0.2, Anders 10.100.0.3)
- Restart gateway: `systemctl restart pc2-gateway.service`
- Gateway logs: `/root/pc2/web-gateway/gateway.log`

---

## Important Boundaries

- **"Elacity dDRM"** — always use this full name. It's Elacity Labs' commercial protocol, NOT an ELA demand mechanism. Elacity's fees belong to Elacity.
- **ELA value** comes from native mechanisms: Carrier staking, blockchain gas, routing fees, in-OS protocol fees
- **ElastOS** = open infrastructure (community). **Elacity** = private company operating on it (own stakeholders)
- Never reference Anders Alm by name in public docs — refer to "the V2 runtime" or "the capsule architecture"

---

## Commands for Community Testers

**EverlastingOS (existing install, pull updates):**
```
cd ~/pc2.net && git pull origin feature/jetson-gpu-acceleration && cd pc2-node && npm run build && pm2 restart pc2 && pm2 save
```

**Anders / new Jetson installs:**
```
export PC2_BRANCH=feature/jetson-gpu-acceleration
curl -sSL https://raw.githubusercontent.com/Elacity/pc2.net/feature/jetson-gpu-acceleration/scripts/install-arm.sh | bash
```

---

## When Asked "Give Me My Weekly Report"

Follow `docs/templates/WEEKLY_SHIPPING_REPORT.md` — audit every commit, write GitHub report + blog HTML, post to GitHub Discussions automatically, include Yoast SEO block.
