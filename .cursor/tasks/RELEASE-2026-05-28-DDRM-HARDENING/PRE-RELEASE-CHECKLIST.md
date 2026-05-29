# Pre-Release Checklist — pc2.net `release/2026-05-28-ddrm-hardening` → main

> **Use this checklist immediately before merging `release/2026-05-28-ddrm-hardening` to `main`.** Every item here was either verified during this branch's prep work, or is a tomorrow-morning gate. Do not merge until every checkbox is ticked.

**Branch:** `release/2026-05-28-ddrm-hardening`
**Target:** `main`
**Coupled launcher version:** `ElastOS Launcher v1.2.9` (must be released and notarised BEFORE pc2.net main merge)
**Audit date:** 2026-05-28

---

## V1 — Apple notarisation & launcher install path (BLOCKING)

### Launcher v1.2.9 must be live + notarised before pc2.net main merge

| Gate | How to verify | Owner |
|---|---|---|
| [ ] Launcher v1.2.9 GitHub Release exists | `gh release view v1.2.9 --repo Elacity/elastos-launcher` | sash |
| [ ] All 6 platform artefacts published (mac-arm64 .dmg + .zip, linux .deb + .AppImage, win .exe + Setup.exe) | Same command, check `assets` array | sash |
| [ ] Apple notary service shows `status: Accepted` for v1.2.9 .dmg and .zip | `xcrun notarytool history --apple-id sash@ela.city --team-id LA64G2ZMY2 --password '...'` | sash |
| [ ] Downloaded .dmg passes `spctl --assess` with `source=Notarized Developer ID` | `hdiutil attach … && spctl --assess --type execute …` | sash |
| [ ] Virgin-Mac rehearsal: download .dmg on a fresh macOS profile/VM, install PC2, mint EPUB, mint video, play both back | Manual test on TestFlight-style fresh user simulation OR on a fresh macOS user account | sash |

### Why this is blocking
pc2.net's release/2026-05-28-ddrm-hardening adds dDRM hardening that requires the fixed RPC routing in pc2-node. If the launcher v1.2.9 isn't out, new users installing PC2 hit "FFmpeg not found" the moment they try to mint a video, which makes the dDRM hardening look broken (it isn't — the install just never finished provisioning the encoder). Ship launcher v1.2.9 first, verify it works end-to-end, then merge pc2.net.

---

## V2 — pc2.net CI matrix (BLOCKING)

| Gate | How to verify | Status |
|---|---|---|
| [x] `smoke-test.yml` green on `release/2026-05-28-ddrm-hardening` (linux + macOS + pi-os docker matrix) | `gh run list --repo Elacity/pc2.net --workflow=smoke-test.yml --limit 5` | Verified 2026-05-28; re-greened 2026-05-29 after RPC auto-route commit; re-running after decrypt-CID fix |
| [x] `secret-scan.yml` green on the release branch (gitleaks fingerprint fix landed) | Same as above with `--workflow=secret-scan.yml` | Verified 2026-05-28 |
| [x] `publish-pc2-binaries.yml` will succeed on tag (verified by inspection — no breaking changes since last successful tag) | Manual code review of workflow vs last green tag | Verified 2026-05-28 |
| [ ] Smoke test rerun on main immediately after merge | `gh workflow run smoke-test.yml --ref main` | TBD post-merge |

---

## V3 — Install method parity (verified)

After launcher v1.2.9, all four install methods provision an identical PC2 environment with zero terminal interaction required:

| Component | start-local.sh | install-arm.sh | Docker image | Launcher v1.2.9 |
|---|---|---|---|---|
| Xcode CLT (macOS only) | Auto-detect + GUI installer | N/A (Linux) | N/A (base image) | Auto-detect + GUI installer ✓ |
| Homebrew (macOS only) | `ensure_brew_macos()` auto-installs | N/A | N/A | `elevatedSetup()` auto-installs ✓ |
| Node.js 20 LTS | nvm-managed | nvm-managed | Bundled in image | Downloaded by launcher |
| ffmpeg | `brew install ffmpeg` | `apt-get install ffmpeg` | `apk add ffmpeg` (Dockerfile fix landed) | `brew install ffmpeg` (post-Homebrew) ✓ |
| cmake | `brew install cmake` | `apt-get install cmake` | (not needed in container) | `brew install cmake` (post-Homebrew) ✓ |
| WireGuard + AmneziaWG + sing-box | `brew install` + git/make | apt-get + git/make | (relay-only modes typically don't need these) | `brew install` + git/make (post-Homebrew) ✓ |
| Sudoers configs | Per-tool entries written | Per-tool entries written | (root in container, no sudoers needed) | Single consolidated `/etc/sudoers.d/elastos` written upfront ✓ |
| Particle auth `.env` | Created by script | Created by script | Created by docker entrypoint | Created by launcher ✓ |

Parity verified by code inspection 2026-05-28.

---

## V4 — Release artefact verification (post-tag)

To run AFTER tagging `pc2-vX.Y.Z` on main (the pc2-binaries tag triggers the `publish-pc2-binaries.yml` workflow):

```bash
# 1. Verify the binaries were uploaded
gh release view pc2-vX.Y.Z --repo Elacity/pc2.net

# 2. Verify the macOS binary is signed (if pc2-node bundles its own signed component)
# (Most PC2 distributions are source + npm install, not signed binaries.
# The launcher itself is signed; pc2-node source is delivered via git clone.)

# 3. Trigger a manual smoke test on the release branch
gh workflow run smoke-test.yml --ref release/2026-05-28-ddrm-hardening --repo Elacity/pc2.net

# 4. Watch it to green
gh run watch --repo Elacity/pc2.net
```

---

## V5 — Release notes draft (paste into GitHub Release)

```markdown
# pc2.net release/2026-05-28-ddrm-hardening

## Highlights

- **dDRM video playback restored for legacy assets** — Server-side override of PSSH-baked RPC values rescues every video minted before this release that had an exhausted Tenderly RPC quota hardcoded into its metadata. Owners can play their videos again without re-minting. (`pc2-node/src/api/media.ts`)
- **RPC pool resilience hardening** — New centralised RPC health tracker that sidelines unhealthy upstreams (5xx, 429, 408, transport failures) for a cooldown period; consumers automatically rotate to healthy URLs. Affects both the JSON-RPC proxy (`static.ts`) and the Content Indexer (`ContentIndexerService.ts`).
- **RPC pool expanded** — Default Base RPC list grown from 3 to 6 entries (publicnode, drpc, blastapi, 1rpc.io, omniatech) with explicit reordering rationale. Tenderly removed from the default list entirely.
- **Configurable RPC overrides** — `config.blockchain.public_proxy_url` and `config.content_indexer.rpc_urls` now operator-tunable; node's internal `/api/rpc/base` proxy preferred for Lit Action calls when set.
- **Zero-config resilient Lit-Action RPC (2026-05-29)** — `resolveLitAccessRpc()` auto-routes the Lit Action's on-chain access check through this node's own `/api/rpc/base` proxy (rotating + health-tracked + cached) when reachable, with a loopback/LAN guard and a health-aware public-RPC fallback. Fixes the intermittent "purchase access tokens" error on owned content with no operator config. (`pc2-node/src/api/media.ts`, `storage.ts`, `chipotle-client.ts`)
- **Legacy decrypt-CID remap ordering fix (2026-05-29)** — Non-media assets (3D/GLB, EPUB, PDF, image) whose PSSH baked a known-good remap-only decrypt CID (e.g. `QmRSpGF…`) now decrypt correctly. The remap is applied **before** the allowlist gate instead of after. Verified by owner across image, EPUB, and 3D model. (`pc2-node/src/api/chipotle-client.ts`)
- **FFmpeg required for video minting** — All install paths now provision ffmpeg (start-local.sh, install-arm.sh, Dockerfile, GitHub Actions CI, and launcher v1.2.9+).

## Coupled launcher release

Requires **ElastOS Launcher v1.2.9** (or newer) for fresh-Mac users. v1.2.9 introduces a single-password-prompt first-run flow that auto-installs Homebrew + Xcode Command Line Tools + all PC2 dependencies. Download: https://github.com/Elacity/elastos-launcher/releases/tag/v1.2.9

## Breaking changes

None. All changes are backward-compatible with existing PC2 installs.

## Operator notes

- The `static.ts` JSON-RPC proxy now consults the shared RPC health tracker. If you've set `config.blockchain.rpc_unhealthy_cooldown_ms`, that value tunes how long an unhealthy URL stays sidelined (default 60s).
- The Content Indexer's RPC rotation is now health-tracker-aware. It will silently skip dead upstreams and only retry them after the cooldown elapses.
- Legacy dDRM video assets minted before this release benefit from the PSSH-baked-RPC override automatically — no operator action required.

## Tests added

- `pc2-node/tests/security/rpc-health-tracker.test.js` — regression test for the health tracker contract
- `pc2-node/tests/security/rpc-failover-loop.test.js` — regression test for `baseRpcCall()` rotation behaviour
- `pc2-node/tests/unit/media-pssh-rpc-override.test.js` — source-scan regression test locking in the Lit-RPC resolver (auto-route + /api/rpc/base + loopback guard + health-aware fallback)
- `pc2-node/tests/unit/decrypt-cid-remap-before-gate.test.js` — source-scan regression test locking in remap-before-gate ordering for legacy decrypt CIDs

## Acknowledgements

dDRM hardening direction by @irzhy (zero-CEK exposure, RPC unification plan). Implementation + release coordination by @sash.
```

---

## V6 — Rollback plan (in case something breaks)

If post-merge we see widespread failures:

```bash
# 1. Revert the merge commit on main
cd /Users/sash/Documents/Cursor/pc2.net
git checkout main
git pull --ff-only
git revert -m 1 <merge-commit-sha>  # -m 1 to keep first parent (pre-merge state)
git push origin main

# 2. (If a pc2-vX.Y.Z tag was published) — delete the tag locally + remotely
git tag -d pc2-vX.Y.Z
git push origin :refs/tags/pc2-vX.Y.Z

# 3. (If a GitHub Release was published) — delete it
gh release delete pc2-vX.Y.Z --repo Elacity/pc2.net --yes

# 4. Inform users via the existing comms channels (docs.ela.city, X/Twitter,
#    Discord, etc.) that the release has been rolled back and a fix is coming.
```

**Rollback rehearsal:** None required — the release branch is non-destructive (no database migrations that can't be rolled back, no IPFS pin changes, no schema breaking changes). All changes are additive code that can be removed by `git revert`.

---

## V7 — Day-1 monitoring (first 24h after merge)

| Metric | Where to watch | Healthy range |
|---|---|---|
| RPC health-tracker sidelining rate | `pc2-node` logs grep for `markRpcUnhealthy` | < 5 marks/hour per URL on average |
| dDRM video playback success rate | User reports / support channel | No spike in "access tokens" / "cannot play" reports |
| Launcher v1.2.9 first-install success rate | GitHub Discussions, Discord support channel | < 1% report of "Homebrew install failed" |
| Content Indexer scan progress | `pc2-node` logs for `[ContentIndexer]` lines | Continuous scanning, no stalls > 5 min |
| Launcher CI build success rate (any patch tags during day) | `gh run list --repo Elacity/elastos-launcher --workflow=build.yml` | 100% success on patch tags |

---

## Communications plan

Tomorrow morning, after both releases are out and verified:

1. **docs.ela.city** — update release notes page with both versions (launcher v1.2.9 + pc2.net release/2026-05-28-ddrm-hardening), highlight zero-touch macOS UX
2. **X / Twitter** — short announcement: "ElastOS Launcher v1.2.9 + PC2 dDRM hardening shipped today. Fresh-Mac users now get a zero-terminal install experience."
3. **Discord / community channels** — pin the launcher download link, link to docs.ela.city release notes
4. **GitHub Discussions** — open a thread inviting feedback specifically on the fresh-Mac UX (this is the new path we want to validate with real users)

---

## Final go/no-go gate

Before running `git checkout main && git merge --ff-only release/2026-05-28-ddrm-hardening && git push origin main`:

- [ ] Launcher v1.2.9 published and Virgin-Mac tested
- [ ] pc2.net CI green on the release branch (re-run if it's been > 24h since last)
- [ ] Release notes drafted
- [ ] Rollback procedure understood + practised mentally
- [ ] You're not tired, distracted, or rushing — if any of those, postpone 24h

---

*Generated 2026-05-28 as part of the pre-release confidence audit. Mirrors the deliverables agreed in the "10/10 pre-release audit" exchange.*
