# Task: Release Validation — dDRM Hardening (Phase 1 + Phase 2)

**Task ID**: RELEASE-2026-05-28-DDRM-HARDENING
**Created**: 2026-05-28
**Status**: InProgress
**Priority**: High
**Branch**: `release/2026-05-28-ddrm-hardening`
**Tip**: `e80a5579f` (Irzhy's WASM-contained decrypt runtime)

## Description

Validate that the integrated release branch — combining the chore-branch
release-prep work with Irzhy's two-phase dDRM security hardening — boots,
runs, and preserves the security invariants documented in
`.cursor/rules/security.mdc` before any merge to `main`.

## Background

Two security-hardening commits were rebased onto `chore/2026-05-25-roadmap-and-pi-ci`
on the branch `feat/ddrm-zero-cek-exposure`:

- `0ae8bcae4` **Phase 1** — server-owned secure-view session (P-256 keypair owned
  by the server, wallet-signed delegation, opaque bearer token).
- `e80a5579f` **Phase 2** — WASM-contained decrypt runtime (`ddrm-decrypt` crate)
  with end-to-end CEK containment.

Companion documents (read first if unfamiliar):
- `docs/core/DDRM_SESSION_ARCHITECTURE.md`
- `docs/core/DDRM_DECRYPT_RUNTIME.md`
- `.cursor/rules/security.mdc`

The release branch was cut from Irzhy's tip exactly. There are zero conflicts
with prior local work (AI chat / frontend tweaks / test-app deletions are
parked on `snapshot/local-pre-merge-2026-05-28`).

## Pre-flight: confirm the branch is clean

```bash
git fetch origin
git checkout release/2026-05-28-ddrm-hardening
git log --oneline -5
# Expected:
#   e80a5579f feat(ddrm): WASM-contained decrypt runtime ...
#   0ae8bcae4 feat: harden dDRM decrypt + server-owned secure-view session
#   e6ef2c69e docs(task): record bonus install-UX commit on Pi CI ticket
```

CI smoke test status: <https://github.com/Elacity/pc2.net/actions?query=branch%3Arelease%2F2026-05-28-ddrm-hardening>

## Test plan (mapped to security invariants)

Time budget: ~45 minutes for full pass. ~15 minutes for fast pass (Phase 1 + Phase 2 happy paths only).

### A. Build & boot — happy path (WASM backend, the new default)

Maps to: §9 build/deploy invariants, §1 CEK containment.

| # | Step | Expected | Pass |
|---|---|---|---|
| A1 | `npm ci` from repo root | Completes without errors | ☐ |
| A2 | `cd pc2-node && npm ci` | Completes without errors | ☐ |
| A3 | `npm run build` (or follow `install-arm.sh` if on Pi) | TypeScript clean, no `TS2307` cascades, `bundle.min.js` produced | ☐ |
| A4 | Start `pc2-node` (default, no env override) | Boots; `Loaded WASM ddrm-decrypt sha256 ...` appears in logs; sha matches `pc2-node/wasm-apps/ddrm-decrypt/capsule.json` | ☐ |
| A5 | Open browser → PC2 URL | Login flow works; bearer token issued via `/lit/complete-session` | ☐ |
| A6 | Open a video asset you own (kid present in catalogue) | Video plays; **no `cekBase64` field anywhere in network responses** (search DevTools → Network for "cekBase64") | ☐ |
| A7 | Open a PDF/EPUB asset you own | Renders correctly; multi-page navigation reuses cache (only one Lit Action call per asset) | ☐ |
| A8 | Install a paid skill from the registry | Install completes; encrypted resources decrypt | ☐ |

**Failure modes to look for:**
- `req_sig_invalid` from Lit Action → P1363/DER signature regression (§3.1)
- `access_denied` from Lit Action → wallet/owner mismatch (§2.6)
- `session_token_invalid` 401 loop → `refresh` flag dropped at some hop (§7.1)

### B. Backend rollback — JS fallback

Maps to: §1.2 (locality table, JS column), §2.3 (signed backend selector).

| # | Step | Expected | Pass |
|---|---|---|---|
| B1 | Stop `pc2-node` | Process exits cleanly | ☐ |
| B2 | Set `PC2_DDRM_BACKEND=js` and start `pc2-node` | Boots; logs indicate JS backend selected | ☐ |
| B3 | Repeat A6 (video) | Plays; this is the legacy path that uses `cekSessionCache` (5-min TTL) | ☐ |
| B4 | Repeat A7 (PDF/EPUB) | Renders | ☐ |
| B5 | `curl POST /api/storage/lit/flush-cek-cache` (admin) | Returns success; subsequent first request re-runs Lit Action | ☐ |
| B6 | Stop `pc2-node`, unset `PC2_DDRM_BACKEND`, restart | Falls back to WASM default; A6 works again | ☐ |

### C. Session lifecycle — restart semantics

Maps to: §2.7 (WASM-backed sessions don't survive Node restart).

| # | Step | Expected | Pass |
|---|---|---|---|
| C1 | On WASM backend (default), open an asset (creates session) | Session created in WASM linear memory + bearer token in browser IndexedDB | ☐ |
| C2 | Restart `pc2-node` (same process) without clearing browser state | On next request: browser detects 401, prompts wallet for one fresh signature, completes new session, content loads | ☐ |
| C3 | Confirm `FileSessionStore.loadAll` dropped the WASM-backed records on startup | Server logs show stored sessions filtered (or, equivalently, no "session served from disk after restart" log appears) | ☐ |

### D. CEK containment audit (read-only — no code changes)

Maps to: §1.1 (no new CEK exit points), §1.3 (Zeroizing invariant).

This is a manual audit pass to confirm no regressions slipped in.

| # | Step | Expected | Pass |
|---|---|---|---|
| D1 | DevTools → Network → filter by `kid` for the active asset | No response body contains a base64 string of the right shape for a CEK (32–64 char b64) on the wire | ☐ |
| D2 | Server logs (`tail -f`) during a decrypt | No `cekBase64`, `cek=`, or 32+ byte hex/b64 payloads logged | ☐ |
| D3 | `node -e "console.log(require('./pc2-node/crates/ddrm-decrypt/.../api'))"` (or check the crate's exported symbols) | **No `get_cek` export** | ☐ |
| D4 | If you have a memory analyzer (e.g. `lldb` attach) — optional | CEK is in `Zeroizing<Vec<u8>>` inside WASM linear memory, not in the V8 heap as a string | ☐ |

D4 is optional; D1–D3 are sufficient for sign-off.

### E. CI gate sign-off

| # | Check | Where | Pass |
|---|---|---|---|
| E1 | Smoke test (build + boot) — green on `release/2026-05-28-ddrm-hardening` | <https://github.com/Elacity/pc2.net/actions?query=branch%3Arelease%2F2026-05-28-ddrm-hardening> | ☐ |
| E2 | Pi CI experimental gate — green (or expected-yellow if not promoted yet) | Same actions page | ☐ |
| E3 | Secret scan — green | Same | ☐ |

### F. Documentation review

| # | Check | Pass |
|---|---|---|
| F1 | `docs/core/DDRM_SESSION_ARCHITECTURE.md` opens, file map lines up with current code | ☐ |
| F2 | `docs/core/DDRM_DECRYPT_RUNTIME.md` opens, retry chain matches observed behaviour in tests A–C | ☐ |
| F3 | `.cursor/rules/security.mdc` is present and `alwaysApply: true` | ☐ |

## Acceptance criteria

Release branch is sign-off ready when:

- [ ] All A-series tests pass (build & boot, default WASM backend)
- [ ] All B-series tests pass (JS rollback works)
- [ ] All C-series tests pass (restart semantics correct)
- [ ] D1, D2, D3 pass (CEK containment audit)
- [ ] E1, E2, E3 pass (CI gates green)
- [ ] F1, F2, F3 pass (docs in place)
- [ ] No new `console.log` of CEK / token / sessionId in any commit on the branch
- [ ] User has performed at least one full A-series happy-path manually

## Failure escalation

| Symptom | First suspect | Where to look |
|---|---|---|
| Build fails (`TS2307`) | Out-of-order build step | `install-arm.sh` order, `tsconfig.json` paths |
| `Loaded WASM ... sha256 mismatch` on boot | Manifest stale | `pc2-node/wasm-apps/ddrm-decrypt/capsule.json` vs binary |
| `req_sig_invalid` from Lit Action | Signature format regression | §3.1 (P1363 vs DER) |
| `access_denied` from Lit Action | Owner address mismatch | §2.6 — `req.user.wallet_address` plumbing |
| Endless 401 loop | `refresh` flag dropped | §7.1 — trace iframe → bridge → secure-view |
| Decrypt works in dev, fails in prod | Debug WASM in prod | §9.2 — verify release build |

## Files in this task

- `RELEASE-2026-05-28-DDRM-HARDENING.md` — this document
- `RUN_LOG.md` — append-only log as you execute the plan (created on first run)

## Notes

- **Do not push to `main`** until every box above is checked, and the User has
  given explicit approval.
- The tag `pc2-binaries-v1` workflow is `workflow_dispatch` only — binary
  publish requires manual trigger after merge.
- The 2 PRDs (`ELACITY_DDRM_PRD.md`, `ELACITY_INVESTOR_PRD.md`) live on
  `snapshot/local-pre-merge-2026-05-28` (locally) and on the User's external
  backup. They are intentionally not on this release branch.
- AI chat WIP, frontend secure-view local mods, and the `docs/legal/` folder
  also live on `snapshot/local-pre-merge-2026-05-28` only.

## Sequencing

1. Wait for current smoke test (run `26554923524`) to complete.
2. Run A-series locally on the User's primary dev machine.
3. Run B-series (rollback) on the same machine.
4. Run C-series (restart semantics).
5. Run D-series (containment audit).
6. Confirm E-series CI gates green.
7. Confirm F-series docs in place.
8. User decides: merge to `main` or iterate.
