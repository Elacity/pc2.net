# Task: Public Cloud PC2 — Try-Before-You-Download

**Task ID**: `PUBLIC-CLOUD-PC2-2026-05`
**Created**: 2026-05-25
**Status**: **Proposed** — awaiting Sasha sign-off on §0 decisions in [`PLAN.md`](./PLAN.md)
**Priority**: Medium (post v1.2.8.0 tag) — adoption-loop work, not release-blocker
**Branch**: TBD — recommend a new `feat/public-cloud-trial` after Sasha greenlight; doc-only PR first
**Companion**: [`PLAN.md`](./PLAN.md) — full design, hosting comparison, sizing, rollout plan

---

## Description

Stand up `try.pc2.net` — a public-cloud hosted PC2 instance where a new visitor can launch a sandboxed PC2 desktop in their browser, click around the Market / Creator / Player / AI chat, and decide to download the real binary for their own hardware. Sessions are throwaway, time-limited, resource-capped, and clearly labelled as a tourist demo — never a sovereign node.

The goal is to shorten the funnel from "interested" → "running PC2" by removing the install-first friction. The narrative wins **only** if the demo is honest: it must not pretend to be a real PC2, must not hold real keys, must not pin to the production IPFS cluster, and must not feed the T-1 telemetry pipeline.

## Background

### Why this is needed

The current install path (download installer → wait for first-boot → set up wallet → see UI) is the single biggest drop-off in the funnel. Friends who say "I'd love to try it" don't actually try it because the install is a 5-minute commitment for a product they've never seen. Every other crypto/web3 / Linux-on-the-web project that took off had a `try.xxx.com` button: Replit, GitPod, JSFiddle, CodeSandbox, even Vercel's framework playgrounds.

PC2 is uniquely well-suited for a browser-based trial because it **already** renders entirely as a web app over a Node backend (Puter desktop). We don't need to re-architect anything to put it behind a public URL — we need to put **isolation, lifecycle, and honesty** around it.

### Why this is risky

PC2 is fundamentally a *sovereign personal node*. The marketing claim is "your data on your hardware." A poorly-framed public-cloud PC2 actively contradicts that claim. We have to be more careful with the messaging than with the engineering.

The two failure modes we must not hit:

1. **Sovereignty narrative dilution**: a visitor concludes "PC2 = a website Elacity hosts." Mitigation: every panel of the demo desktop carries a persistent banner — "Demo mode — your data lives on Elacity's server. [Download for real]". The Files app shows only a `/demo/` root, not `~/`.
2. **Operational blast-radius**: a misbehaving demo session crashes our supernodes, leaks a Lit API key, or poisons our cluster pinset. Mitigation: dedicated host (not on the existing supernodes), no production credentials inside containers, no write access to the production IPFS cluster, network egress allow-list.

## Requirements

See [`PLAN.md`](./PLAN.md) for the full design document. Headline at this proposal stage:

- **Single dedicated VPS host** (recommendation: Hetzner CCX33 €33/mo OR Contabo VPS-XL €25/mo — see [`PLAN.md`](./PLAN.md) §6 hosting comparison). NOT colocated with existing Contabo/InterServer supernodes
- **Per-session Docker container** model (existing PC2 `Dockerfile` reused; 512 MB RAM / 0.5 vCPU / 5 GB ephemeral disk per session)
- **Stateless reverse-proxy router** (Caddy or Nginx) maps `trial-<token>.try.pc2.net` → container port — wildcard SSL via Let's Encrypt
- **Session lifecycle service** — ~300-LOC Node service: provisions container on visit, destroys on idle (60-min default) or hard cap (4h)
- **Sandboxed credentials profile** — no production Lit API key, no production Chipotle key, no real Particle project; testnet RPCs only, faucet-funded ephemeral smart accounts
- **Creator restricted to image + PDF + Markdown** — video and audio uploads refused with a friendly "Download PC2 to mint videos and audio — full ffmpeg power on your hardware" modal. Decision rationale + alternatives in [`PLAN.md`](./PLAN.md) §3.4. The exclusion doubles as a Download-PC2 conversion event
- **AI chat is BYOK** — visitor pastes their own OpenAI / Anthropic / Groq / OpenRouter / xAI / DeepSeek key; trial container does ZERO LLM inference. When no key is configured, the chat tab surfaces an "Or get hosted AI from Elacity — coming soon" waitlist sign-up button — captures revenue-interest signal during the trial. No local Ollama bundled. See [`PLAN.md`](./PLAN.md) §9.4 for the Phase 1.5 hosted-AI subscription tier this design unlocks
- **Persistent "Download PC2" CTA** in the taskbar + a download-bundle export (`migration-bundle.zip` containing intent records + installer link for the visitor's OS)
- **Telemetry isolation** — demo sessions tag `is_demo: true` and are routed to a separate channel (or dropped) so they never pollute T-1 operator metrics
- **One-click captcha** at trial launch (hCaptcha or Turnstile) to keep miners and scrapers out
- **Operations runbook** — what to do when the trial host wedges, how to rotate the testnet faucet wallet, how to bounce a stuck session

## Open decisions for Sasha (Proposed → Agreed gate)

See [`PLAN.md`](./PLAN.md) §0 for the full decision table. Headline:

- **D1 — Hosting provider:** Hetzner CCX33 (€33/mo, dedicated vCPUs, best price/perf) vs Contabo VPS-XL (€25/mo, cheaper, already in our toolkit). Recommend Hetzner CCX33 for the dedicated-vCPU guarantee under burst load.
- **D2 — Multi-tenant vs per-session container:** per-session Docker. Recommended unconditionally — multi-tenant requires PC2-side rewrites we don't need for a demo.
- **D3 — AI provider in demo:** BYOK (visitor pastes their own OpenAI / Anthropic / Groq / OpenRouter / xAI / DeepSeek key; no Elacity-paid inference) with a "Get hosted AI from Elacity — coming soon" waitlist button when no key is configured. *Previously recommended local Ollama; flipped to BYOK because it's faster, has zero host inference cost, mirrors the real-PC2 BYOK experience honestly, and the waitlist button captures revenue-interest signal during the trial itself — see [`PLAN.md`](./PLAN.md) §9.4 for the future Elacity-hosted AI subscription tier this unlocks.*
- **D4 — Auth model in demo:** anonymous-only (no signup) vs optional email magic-link (lets visitors come back). Recommend anonymous-only for v1 — adding auth doubles the surface area and the demo is meant to be a 10-minute experience anyway.
- **D5 — Chain access:** Base Sepolia testnet only (Lit Naga TEST, V3 testnet contracts, faucet-funded SA) vs no-chain demo (no minting, no buying, viewer-only). Recommend Base Sepolia for end-to-end Creator+Market story.
- **D6 — Domain:** `try.pc2.net` (most direct) vs `demo.ela.city` (uses our supernode's wildcard cert). Recommend `try.pc2.net` — clearer naming, separate SSL footprint, and we control DNS via Cloudflare today.

## Acceptance criteria

Planning (this PR):

- [x] Task folder created with `README.md` + `PLAN.md`
- [x] `PLAN.md` covers architecture, hosting comparison, sizing, lifecycle, isolation, telemetry, rollout, risks
- [x] Roadmap snapshot updated to reference this task as a post-v1.2.8.0 Tier-1 adoption item
- [x] Standalone handover doc written so a fresh agent can pick up implementation without re-reading the whole repo
- [ ] **Sasha sign-off on D1–D6** (Proposed → Agreed gate)

Execution (after Agreed):

- [ ] Hetzner CCX33 (or Contabo VPS-XL) provisioned; SSH key + Ansible/cloud-init script in repo (`deploy/trial-host/`)
- [ ] DNS record `*.try.pc2.net` created; wildcard cert issued
- [ ] `trial-host` Node orchestrator service deployed (`deploy/trial-host/orchestrator/`)
- [ ] PC2 image variant `pc2-node:trial` built and pushed (no production credentials, demo banner injected, `/api/telemetry/onramp` muted)
- [ ] hCaptcha integration on `try.pc2.net` landing page
- [ ] Per-session Docker provisioning verified end-to-end on a single test session
- [ ] Soak test: 24 h of synthetic sessions (10/h, 60-min cap) without OOM or runaway IPFS bandwidth
- [ ] Public soft-launch announcement drafted (not posted) — copy reviewed by Sasha for narrative integrity
- [ ] Runbook published at `docs/deployment/PUBLIC_TRIAL_RUNBOOK.md`

## Files in this task folder

- [`README.md`](./README.md) — this file (task ticket)
- [`PLAN.md`](./PLAN.md) — full architecture, hosting comparison, sizing, rollout plan

## Files this task will touch (post-Agreed)

Will be enumerated precisely in `PLAN.md` §7. Anticipated areas:

- `deploy/trial-host/` (NEW) — Ansible/cloud-init scripts, orchestrator Node service, Caddy config
- `pc2-node/Dockerfile.trial` (NEW) — trial-flavoured PC2 image
- `pc2-node/src/services/setup/TrialModeService.ts` (NEW) — guards production-credential paths in trial mode
- `src/gui/src/UI/UIDesktop.js` — taskbar "Download PC2" CTA (conditional on `process.env.PC2_TRIAL_MODE === '1'`)
- `src/gui/src/UI/AI/UIAIChat.js` — "Or get hosted AI from Elacity — coming soon" waitlist CTA when no API key is configured AND `PC2_TRIAL_MODE=1`. ~30 LOC. POSTs visitor email to `/api/trial/ai-waitlist`. Captures revenue-interest signal during the trial; see `PLAN.md` §9.4 for the Phase 1.5 subscription tier
- `pc2-node/src/api/setup/trialBanner.ts` (NEW) — serves the demo-mode banner config to the UI (now also includes `aiWaitlistEnabled: true` flag for the waitlist CTA)
- `pc2-node/src/api/trial/aiWaitlist.ts` (NEW) — POST endpoint accepts visitor email + optional referral context, forwards to whichever signup-collection backend is configured (Plausible / SendGrid / HubSpot — Sasha picks before launch)
- `pc2-node/data/test-apps/elacity-creator/app.js` — ~5-LOC upload-validator gate: when `puter.env.PC2_TRIAL_MODE === '1'` and MIME type starts with `video/` or `audio/`, surface the "Download PC2 to mint videos and audio" modal and abort the upload before any ffmpeg invocation. See `PLAN.md` §3.4 for the data-processing rationale
- `docs/deployment/PUBLIC_TRIAL_RUNBOOK.md` (NEW)
- `docs/core/ROADMAP.md` — already updated in this PR
- `docs/handover/MASTER_HANDOVER.md` — already updated in this PR

## Testing strategy

- **Synthetic load** — `scripts/test-trial-soak.sh`: spawn N parallel sessions via the orchestrator API, walk through a scripted UX (open Market → open Player → upload sample → mint to testnet → fetch result), measure RAM/CPU/network per session
- **Egress allow-list verification** — `iptables -L OUTPUT` audit on the host; confirm only allowed hosts (testnet RPCs, GitHub raw, npm registry mirror, Ollama model registry) are reachable from inside a trial container
- **Credential audit** — `grep -r 'lit-protocol.com\|chipotle-functions\|cloud.ela.city' /app/data` inside a trial container must be empty
- **Telemetry isolation** — confirm `POST /api/telemetry/onramp` is muted or routed to a separate `is_demo: true` channel; spot-check 24 h of supernode telemetry logs for absence of demo session IDs
- **Brand check** — every UI panel renders the persistent "Demo mode" banner (loaded via `/api/setup/trial-banner` config); banner cannot be dismissed; "Download PC2" link works on every OS
- **Data-processing gate** — Creator upload validator rejects video/audio MIME types in trial mode; ffmpeg is never invoked inside a trial container (see `PLAN.md` §3.4 + AT-14)
- **BYOK AI check** — Settings → AI accepts the visitor's API key; AI chat tab renders the "hosted AI coming soon" waitlist when no key is configured; no local Ollama present in trial image (see `PLAN.md` §9.4 + AT-15 / AT-15a / AT-15b)
- **Live walk-through** — Sasha personally clicks through Market, Creator, Player, AI chat on a fresh `try.pc2.net` session before announcement

## Notes

- This task is intentionally **scoped narrow**. It is NOT "PC2-as-a-service" or "hosted PC2 for real users." It is "10-minute browser demo so visitors can decide whether to download." Real hosted PC2 (where a paying customer gets a persistent VM) is a much larger task — see `PLAN.md` §9 for the Phase 2 / Phase 3 sketch where this could go later.
- Don't colocate the trial host with our existing supernodes. Cross-contamination risk is real, the supernodes already run nine production services each, and the trial workload spikes are unpredictable.
- The "Download PC2" CTA is the conversion event we're optimising for. Every other product decision should be evaluated against "does this make the visitor more likely to click Download by minute 10?"
- Pre-existing trial buttons we've seen visitors click on Replit / CodeSandbox / Vercel playgrounds typically convert ~3-8 % to signup. PC2 demo → install conversion will be lower because it's a real-binary install (more friction). Anything ≥ 1 % is a strong result.
- Cross-references: [`HANDOVER_2026-05-25_PUBLIC_CLOUD_PC2.md`](../../../docs/handover/HANDOVER_2026-05-25_PUBLIC_CLOUD_PC2.md) is the standalone handover for a fresh agent picking this up.
