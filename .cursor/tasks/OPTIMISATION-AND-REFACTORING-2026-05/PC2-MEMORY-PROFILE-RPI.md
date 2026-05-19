# Task: PC2-MEMORY-PROFILE-RPI — investigate init-time heap working set

**Task ID**: `PC2-MEMORY-PROFILE-RPI`
**Created**: 2026-05-19
**Status**: **Proposed** — not yet agreed
**Priority**: Low (pre-launcher), Medium (post-launcher if RPi 2 GB SKU is a strategic audience)
**Origin**: Spun out from `CI-HARDENING-RELIABILITY-V2` after the memory-ceiling CI gate proved non-actionable

---

## Background

CI work in `CI-HARDENING-RELIABILITY-V2` attempted to add a memory-ceiling smoke gate (`NODE_OPTIONS=--max-old-space-size=512`) as a CI proxy for RPi 4 2 GB minimum-spec viability.

Two CI runs (`26099087869` at 512 MB, `26099928086` at 1024 MB) showed:

1. **No OOM crash** at either threshold — pc2-node boots cleanly without `JavaScript heap out of memory` errors.
2. **Slow init under heap pressure** — at 512 MB, pc2-node's IPFS init proceeds normally (peer-dialing logs continue) but `/api/health` doesn't come up within 120 s. At 1024 MB on a back-to-back boot (after a fresh boot succeeded in 8 s), the second instance went silent after ~30 s, likely due to stale `~/.pc2/` state.
3. **Intrinsic, not a regression** — IPFS daemon + WASM runtime + service bootstrap collectively use a heap working set somewhere between 512 MB and ??? at init.

This is a real characteristic of the current pc2-node architecture, but it's the kind of finding that needs **source-code investigation**, not CI gating. CI gating produces noisy signal because it conflates memory pressure with stale-state, port collisions, and back-to-back boot dynamics.

## Why this matters

**RPi 4 SKU distribution** (Raspberry Pi Foundation 2025 estimates):
- 2 GB SKU: ~25% of contemporary RPi 4 sales
- 4 GB SKU: ~50%
- 8 GB SKU: ~25%

If pc2-node's init heap working set is genuinely > 1 GB, the **2 GB RPi 4 audience is unsupported** without source-code work. Even the 4 GB audience is borderline because IPFS swarm + JS/Helia heap + Node runtime + WASM modules + frontend cache compete for the ~3 GB available after OS overhead.

This is **not a v1.2.8.x release blocker**. The Mac launcher ships first; RPi is a "could deploy" target, not a "must deploy" target for this release.

## Scope

### Phase 1: measurement (~2-3 hours)
- [ ] Boot pc2-node locally and capture peak RSS via `/usr/bin/time -v` or similar
- [ ] Capture peak V8 heap via `--inspect` + Chrome DevTools heap snapshot at init complete
- [ ] Identify the 5 largest allocators at init time
- [ ] Document findings in this ticket

### Phase 2: optimization candidates (effort scaling with measurement findings)
Likely targets (to be confirmed by measurement):
- **IPFS swarm peer cache** — currently dials 40+ bootstrap peers. Could be lazier.
- **WASM module preloads** — `mp4-split.wasm`, `cenc-decrypt.wasm`, `cenc-encrypt.wasm`, `ddrm-renderer.wasm` may be loaded at boot when they could be loaded on-demand.
- **Service bootstrap chain** — orchestrator services may instantiate even when their feature is disabled.
- **Database in-memory caches** — SQLite + better-sqlite3 may have aggressive page-cache settings.
- **Frontend asset cache** — initial bundle may be parsed-and-held in memory.

### Phase 3: re-evaluation
- [ ] Re-attempt the memory-ceiling CI gate with realistic threshold (e.g., 768 MB, 600 MB) once we've measured what the actual achievable floor is
- [ ] Promote to required gate only if it produces stable signal across 5+ runs

## What this is NOT

- NOT a v1.2.8.x release blocker
- NOT pre-Mac-launcher work (deferred to OPTIMISATION-AND-REFACTORING-2026-05 Phase 3)
- NOT a guarantee we'll support 2 GB RPi 4. May conclude that the integrated-daemon architecture has a hard floor that requires architectural changes (e.g., splitting IPFS into a sidecar process).

## Acceptance criteria

- [ ] Phase 1 measurement complete with documented heap composition
- [ ] Top 3 optimization candidates identified with effort/payoff estimates
- [ ] User decision on whether to invest in optimization vs accept current floor
- [ ] If optimization green-lit: Phase 2 work in dedicated child tickets

## References

- `CI-HARDENING-RELIABILITY-V2.md` — origin, calibration evidence
- CI run `26099087869` — 512 MB attempt
- CI run `26099928086` — 1024 MB attempt
- `pc2-node/src/services/wasm/WASMRuntime.ts` — WASM module loader
- `pc2-node/src/storage/ipfs.ts` — IPFS swarm config
