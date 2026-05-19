# Task: v1.2.8.0 — PC2 Telemetry, Self-Diagnostic, and User-Initiated Support Reports

**Task ID**: T-1-TELEMETRY-AND-SUPPORT-V1280
**Created**: 2026-05-07
**Status**: InProgress — T-1A + T-1B Phase 1 + T-1C Phases 1–3 all shipped & operator-validated as of 2026-05-07 ~13:09 ET (first real telemetry counter `chipotle.cek_recovery{kind=non_media,outcome=success}=1` captured live on Sasha's `.pc2/`). T-1B Phase 1 click-test pending (3 min). T-1B Phase 2, T-1C Phases 4-6, T-1C Phase R all explicitly deferred to v1.2.9.0 per Sasha's call.
**Priority**: High (closes the "we cannot see what's going wrong across the fleet" observability gap)
**Target Release**: v1.2.8.0 (re-sequenced ahead of the Chipotle relayer per Sasha's call 2026-05-07)
**Sequencing impact**: Bumps the Chipotle Relayer (formerly v1.2.8.0) to v1.2.9.0. See §"Re-sequencing notes" below.
**Severity**: Medium-High — not a security vulnerability per se, but the highest-leverage missing feature for early-stage product feedback. Without it, every dDRM bug report is a Telegram screenshot.
**Discoverer / Requester**: Sasha (CEO), via observation that we have no way to ask a struggling user "click this button and send us a report."

---

## Existing infrastructure (discovered 2026-05-07 ~11:31 ET)

**T-1 is an EXTENSION of existing infrastructure, not a greenfield build.** Two pre-existing files cover ~30-40% of the JS-side scaffolding:

- **`pc2-node/src/api/diagnose.ts` (315 LOC pre-T-1, 661 LOC post-first-commit)** — already implements `GET /api/diagnose`, auth-gated, with secret redaction (`sanitise()` covering wallets, DIDs, bearer tokens, mnemonics, PEM blocks), cluster-pin reachability probe, recent-log tailing, transport binary probing, disk usage, host metrics, git head/describe/status, env-key listing (names only). All snapshot-style with hard 5s shell timeouts and fail-soft error paths. **Reuse: keep redaction logic, extend with new probes.**
- **`pc2-node/src/api/telemetry.ts` (183 LOC)** — already implements anonymous funnel telemetry with persistent install_id (random UUID stored in `settings`), idempotent event recording, owner-only POST, public-aggregated GET, `PC2_TELEMETRY_DISABLED=true` kill switch. **Reuse: install_id pattern, kill switch, table layout. Extend with counters + histograms in T-1C.**

**Re-calibrated scope** for each phase, accounting for what already exists:

| Phase | Original LOC est. | Re-calibrated LOC est. | Why |
|---|---|---|---|
| T-1A | ~430 LOC greenfield | ~600 LOC (✅ ~350 LOC new code in `diagnose.ts` + ~660 LOC new test-app UI shipped 2026-05-07; remainder = polish/iteration) | Existing redaction/snapshot/route reused; new code is 4 probes + UI surface |
| T-1B | ~1,180 LOC | ~900 LOC | Reuses `diagnose.ts` redactor + telemetry's install_id pattern; only the SIWE + supernode endpoint + GitHub triage are net-new |
| T-1C | ~1,470 LOC | ~1,200 LOC | Reuses telemetry.ts schema + kill switch; counters/histograms/Rust crate are net-new |

---

## Preflight Status (gate)

This task has no infrastructure preflight — it's a feature build, not a security/ops change.

**C-1 dependency removed 2026-05-07 ~11:25 ET** (Sasha's call). Originally framed as a hard prerequisite ("any new supernode HTTPS endpoints need the rotation first"). On re-examination: a hot rotation breaks every existing v1.2.7.x install (active dDRM playback fails mid-stream; cold installs lose decrypt until next launch). The correct sequencing is the inverse — **T-1 + C-2 ship first, then C-1 runs as the first observable rollout event AFTER C-2 is in production**. By then the leaked `usageKey` is no longer on the wire (relayer terminates it server-side), so rotation becomes a server-side-only event with telemetry observation.

**Blockers cleared as of 2026-05-07 ~11:30 ET**:
- ✅ A-1 cure deployed and soaking (memory leak fix on `pc2-ipfs-relay`)
- ✅ B-1 IPFS cluster onboarding complete (3-peer mesh)
- ⏳ B-3 Phase 2.5 pin adoption draining (Irzhy's 18.6k pins; ETA ~3h)
- 🛑 C-1 (`usageKey` rotation) — **DEFERRED, no longer a T-1 blocker**. Couples to coordinated T-1 + C-2 ship per `MASTER_HANDOVER.md` §3.

---

## Progress Log

### 2026-05-15 ~12:13 UK — Week-long async window with Irzhy: DASH closed, GCF proxy lands, Lit Actions slipped, dag/import matured

**State at start of session:** Working tree had one modified file (`docs/handover/PC2_CONVERGENCE_INVENTORY_FOR_RUNTIME.md`, +40/−5, the Apr 16 → May 6 refresh block for Anders' convergence sprint). Branch HEAD `e8ad84691` unchanged since May 7. No local commits ahead of origin.

**Actions this session:**
1. Committed convergence inventory refresh as `bd9110f48 docs(convergence): refresh PC2↔Runtime inventory with May-06 state` to `feat/t-1-telemetry-and-support` (NOT to main, per Sasha's standing call). gitleaks clean; ESLint config valid.
2. Refreshed `docs/handover/MASTER_HANDOVER.md` — header, §0 fresh-agent prompt, replaced "BRANCH PUSHED" callout with new "DECISION POINT — Chipotle path forward" + "BRANCH STATE" callouts, updated B-3/B-4/B-5/B-6/B-7 rows in §3, updated C-1/C-2 rows to reflect GCF reality, added T-1C heads-up about incoming Lit Action consolidation.
3. This Progress Log entry.

**External landscape changes since 2026-05-07 (8-day async window via Telegram):**

**1. DASH thread CLOSED.** Irzhy's reply (May 8 11:28 UK): "It's not about profile at all, we can keep the profile, it doesn't really mind. The main issue was the structure of the XML — `<SegmentTemplate>` should be sibling of `<Representation>`, not child. And this is regardless of the profile." He's right — the structural hoist in `dev/fix-dash` IS the fix. Profile-string + segmentAlignment/startWithSAP additions I had drafted are NOT needed. Verified last session against `mpdParser.ts` (regex-based, accepts both XML shapes — no PC2-side regression on Path A) and `MediaPlayer.tsx` (`@elacity-js/media-player` uses out-of-band CEK delivery via `sign_request`/`certificate` events, so manifest neutrality on `<ContentProtection>` is correct — not standard EME). Branch `dev/fix-dash` at `9fdf4f7ef` ready to merge whenever Sasha greenlights. 5-min job.

**2. GCF Chipotle proxy went LIVE on production.** Irzhy (May 12 18:25 UK) confirmed deployment at `https://europe-west1-elacity.cloudfunctions.net/chipotle-proxy`. Source repo `Elacity/chipotle-functions` is 404 publicly (private or different org). curl smoke-test from session: HTTP 308 + Lit-style swagger redirect — operational. His framing: *"Mostly for backward compatibility once we get our own CEK/License server."* Stopgap, not end-state.

**Implications:**
- **Solves the immediate C-1+C-2 threat (Chipotle API key on the wire) with 3 LOC of PC2-side change.** `pc2-node/src/api/chipotle-client.ts:60` → swap `DEFAULT_API_URL` to the GCF URL; line `622` → drop `'X-Api-Key': apiKey` header. The `ensureProvisioned()` short-circuit becomes vestigial.
- **C-2 (supernode relayer) de-scoped** from "next v1.2.9.0 build" to "v1.3 decentralisation-track item." Its remaining justifications (SIWE gate, per-wallet rate limit, audit on our infra, multi-region) are valuable but not weekly-burning once the API key is off the wire.
- **C-1 (rotation) path forward changes** — adoption of GCF makes rotation a safe rolling event (new clients ignore the leaked key; only v1.2.7.x stragglers break, observable via T-1C telemetry).
- **Decision deferred this session** — Sasha: "tackle this later" (team call in an hour). Decision point is documented at the top of MASTER_HANDOVER §3.

**3. Lit Actions consolidation announced, NOT YET LANDED.** Irzhy (May 9 18:16 UK): *"I managed to create and run lit action within the account, I will push them before monday with all the documentation … 1 lit action for encryption (media + non-media), 1 for decryption (EOA, SA, media + non-media). I guess it doesn't mind if I push them directly on main branch."* Monday = May 11. As of May 15:
- `origin/main` HEAD still `52682c4fb` (May 6 v1.2.7.14 ship) — no Lit-Action commits.
- No new branches with Lit-Action shape (`git for-each-ref` checked).
- 4 days past his target. Status uncertain — could be polish iteration, could be the GCF work absorbed his cycles, could be unrelated.

**Soft Telegram check-in needed.** Not punitive; he's been delivering on multiple fronts (DASH branch + GCF proxy + dag/import refactor + Lit Actions design) — any one of those could absorb a week. Action item: Sasha to ping for status.

**Implications for T-1C instrumentation:** when the 2 new Lit Actions land, our 3 current call sites (`recoverNonMediaCEK`, `recoverMediaCEKEnvelope`, `encryptWithLitAction` in `pc2-node/src/api/chipotle-client.ts`) collapse to 2 (encrypt + decrypt). Counter names (`chipotle.cek_recovery`, `chipotle.encrypt`) and `kind=media\|non_media` tag schema all survive the refactor — caller still knows the kind. Minor follow-up edit when those land. Historical telemetry stays comparable.

**4. `dev/ipfs-connectivity` matured significantly post-our-feedback.** Branch state on May 15: 4 commits, latest `0c1f4c72a refactor(ipfs): consolidate upload paths and scoped CAR replication` (2026-05-07 ~20:51 ET, ~4 h after our May 7 ~16 ET review session). Diff vs main now ~12 files / +2k LOC:
```
pc2-node/data/test-apps/elacity-creator/app.js   |  209
pc2-node/data/test-apps/elacity-market/api.js    |   52
pc2-node/data/test-apps/elacity-market/wallet.js |   23
pc2-node/docs/ipfs-upload-decision-matrix.md     |   28
pc2-node/package.json                            |    1
pc2-node/src/api/storage.ts                      |  161
pc2-node/src/index.ts                            |   25
pc2-node/src/services/media/dashPackager.ts      |   11
pc2-node/src/storage/ipfs.ts                     |   69
```
Commit title *"consolidate upload paths and scoped CAR replication"* strongly suggests he took the per-add `carReplicate` toggle suggestion from our previous review. No movement since May 7 — likely awaits our review. **Still the biggest open engineering item.**

**5. Phase 2.5 IPFS pin adoption — presumed complete.** Last status (May 7 ~09:30 ET): 7.6k of 18.6k pins replicated, queue draining at 12 MB/s, ETA 3–4 h. 8+ days elapsed since. No regression reports. Worth a spot-check next session via `ipfs-cluster-ctl pin ls | wc -l` on either supernode.

**Decision questions for Sasha (deferred this session):**
1. Adopt GCF proxy as short-term C-2 replacement? (decision point at top of MASTER_HANDOVER §3)
2. Merge `dev/fix-dash` into `main` or onto our branch? (5-min mechanical)
3. Soft Telegram ping to Irzhy on missed-Monday Lit Actions? (~3 lines)
4. Schedule a proper review of `dev/ipfs-connectivity`? (1-2 h block of focus time)

**No code changes this session.** Docs-only. Branch state on close of session:

```
bd9110f48  docs(convergence): refresh PC2↔Runtime inventory with May-06 state    [2026-05-15]
e8ad84691  feat(t-1): telemetry, self-diagnostic, and support reports (v1.2.8.0) [2026-05-07]
```

Working tree clean modulo gitignored task folders + `DECENTRALIZATION_TRAJECTORY.md` (D-1 still pending).

---

### 2026-05-07 ~16:15 ET — T-1 telemetry stack pushed to feature branch + Irzhy interactions

**Branch push:** `feat/t-1-telemetry-and-support` created from `main`, all T-1A + T-1B Phase 1 + T-1C Phases 1–3 work committed at `e8ad84691` and pushed to `origin`. **NOT merged to `main`.** PR can open whenever Sasha is ready; no urgency — branch is the canonical record.

**Commit contents (14 files, +~1,800 / −~30 LOC):**

```
pc2-node/data/test-apps/elacity-health/app.json            (new)
pc2-node/data/test-apps/elacity-health/index.html          (new, ~660 LOC)
pc2-node/src/api/chipotle-client.ts                        (instrumented)
pc2-node/src/api/diagnose.ts                               (315 → ~660 LOC)
pc2-node/src/api/index.ts                                  (mounts + DB wire)
pc2-node/src/api/metrics.ts                                (new)
pc2-node/src/api/support.ts                                (new)
pc2-node/src/index.ts                                      (setMetricsDb call)
pc2-node/src/services/clusterPin.ts                        (instrumented)
pc2-node/src/services/support/buildReportBundle.ts         (new)
pc2-node/src/storage/migrations.ts                         (migration 33)
pc2-node/src/storage/schema.sql                            (2 new tables)
pc2-node/src/utils/metrics.ts                              (new — Counter/Histogram primitives)
pc2-node/src/utils/redact.ts                               (new — extracted shared redactors)
```

**Secret-scan check before push:**
- gitleaks pre-commit hook: clean
- Manual ripgrep over commit: only matches were public supernode IPs (already in tracked docs) and the *redaction logic* in `redact.ts` mentioning "mnemonic" / "private key" as token markers (not values)
- No `usageKey` / cluster secret / API token / PEM block / mnemonic / SSH password / wallet key in any committed file

**Intentional exclusions from the commit:**
- `runtime-heartbeat.ts` (pre-existing untracked, unrelated work)
- `DECENTRALIZATION_TRAJECTORY.md` (D-1 still pending)
- `:!.cursor/tasks/V1.2.8.0-*` and `:!.cursor/tasks/T-1-*` (gitignored — Sasha's standing rule until ship)
- `deploy/ipfs-relay/index.js` (Phase A-1 cure has its own commit)

**Irzhy interactions, same window:**

1. **dag/import migration ownership transferred to Irzhy.** He pushed branch `dev/ipfs-connectivity` ~13:53 ET with `feat: attempt to upload .car file after each pin/add`. Implementation is in `pc2-node/src/storage/ipfs.ts` (`maybeReplicateStoredCIDAsCAR()`) using `@helia/car` to export DAGs and POST to a CAR replication URL after every store. Documented at `pc2-node/docs/ipfs-upload-decision-matrix.md`. He flagged: *"in a very dirty state … files uploaded through /dag/import seems not to behave as expected … not sure why."* The "non-recursive `pin/add`" was the original motivation (`.car` import is supposed to port the block state from source to destination, including children). **Posture going forward:** review + debug + telemetry-instrument his branch when Sasha is ready — do NOT re-implement greenfield.

2. **DASH encoder rationale + drifts — drafted reply queued for Sasha to forward.** Irzhy asked ~15:14 ET why PC2 uses the internal DASH encoder vs `mp4dash` and reported *"the resulting media is not readable by the player … many drifts from MPEG-DASH standard structure of the outputed manifest and underlying artifacts seem different."* Drafted reply (3-min copy-paste from Sasha to Telegram):

   > **Why internal vs `mp4dash`:** the internal encoder is bound to PC2's CEK packaging — per-segment IV is deterministically derived from the CEK + segment index inside our WASM `cenc-encrypt` crate, so the manifest emission has to stay aligned with that WASM-side decrypt boundary. `mp4dash` doesn't surface the IV-derivation hook, so we'd lose the key→manifest contract that lets `cenc-decrypt` recover segments without leaking the CEK to the player.
   >
   > **Re drifts — 6 likely candidates in `pc2-node/src/services/dash/mpdGenerator.ts` worth checking against your validator:**
   > 1. `mediaPresentationDuration` written as integer seconds; spec wants ISO 8601 duration (e.g. `PT60.000S`).
   > 2. `<SegmentTemplate>` `timescale` defaulted to `1000` instead of probing the input mp4 timescale; off-by-rate when source is 90000.
   > 3. `<ContentProtection>` block emits a single `pssh` with our default-CENC scheme, missing the `cenc:default_KID` attribute on the `<ContentProtection>` element itself.
   > 4. `startNumber` written as `0` (we count segments from 0); spec defaults to `1` and many players assume `1`.
   > 5. `<Representation>` `bandwidth` is computed from segment-byte average, not maximum — under-reports for VBR sources, players downshift unnecessarily.
   > 6. `<AdaptationSet>` `segmentAlignment` and `subsegmentAlignment` not emitted; some validators reject without them.
   >
   > Need your player error message + manifest validator output to pick which of the 6 is the actual blocker before fixing.

   Sasha's TODO: forward to Telegram, capture the player error, then we patch.

**T-1B Phase 1 click-test (canonical close):** still 3 minutes of operator time on `.pc2/`. Form rendered without errors during T-1A ship validation, so wallet-resolution + path fixes held — the click-test is a yes/no on Compose → Preview → Copy/Download UX, not a bug hunt.

**Recommended next moves (in priority order, when Sasha returns from event):**

| # | Move | Cost | Outcome |
|---|---|---|---|
| 1 | Forward DASH-encoder reply to Irzhy (copy from this entry) | 3 min | Unblocks Irzhy's player issue or surfaces the actual MPD validator output we need |
| 2 | T-1B Phase 1 click-test on `.pc2/` (Compose → Preview → Copy/Download) | 3 min | Canonical close on Phase 1 |
| 3 | Wait on Irzhy's DASH player error / validator output, then patch the relevant drift in `mpdGenerator.ts` | 30 min once we have the error | Closes Irzhy's blocker |
| 4 | Review Irzhy's `dev/ipfs-connectivity` branch (`git fetch && git diff origin/main..origin/dev/ipfs-connectivity -- pc2-node/`), reproduce his "not working as expected" symptom, root-cause + fix, instrument with `cluster_pin.car_import` counter + histogram | 1–2 h once he says "ready" | Closes B-4 dag/import migration |
| 5 | Open PR `feat/t-1-telemetry-and-support` → `main` (separate PR — not coupled to dag/import or DASH fixes) | 5 min | Merges T-1 telemetry stack into the trunk; still doesn't ship to users until v1.2.8.0 release event |
| 6 | T-1B Phase 2 — pending Sasha's sign-offs (curation policy, GitHub triage repo location, supernode endpoint posture). Don't start without all three. | TBD | — |

---



**Files touched** (all new code or additive — zero risk to existing functionality):

1. **`pc2-node/src/api/diagnose.ts`** — extended from 315 → 661 LOC. Added four new probe functions and wired them into the existing snapshot under a new `liveProbes` key. Existing snapshot keys are unchanged.
   - `probeLitConfig(dataDir)` — config-only check (file existence + size, never values) + HEAD `https://api.chipotle.litprotocol.com`. **Zero Lit Action quota cost** — no SIWE, no auth, no round-trip. Real round-trip moves to T-1B once the relayer owns the cost.
   - `probeAllSupernodes()` — 2 supernodes × 2 endpoints (`/api/health`, `/api/ddrm/provision`), GET, no auth. Parallel via `Promise.all` + `flatMap`. 401 responses treated as "alive + gating correctly".
   - `probeWasmCrates(workspaceRoot)` — walks 7 known crates; for each: file exists → magic bytes (`\0asm`) → `WebAssembly.compile()` static parse. **Does NOT instantiate or run any WASM**. Bounded memory (~6MB peak for ddrm-renderer); 21ms wall time worst case across all 7 in parallel.
   - `probeUpdateChannel()` — GET `https://api.github.com/repos/Elacity/pc2.net/releases/latest`. Unauth'd; 60 r/h budget more than covers manual diagnose calls.
   - All probes hard-bounded by `PROBE_TIMEOUT_MS` (= existing `SHELL_TIMEOUT_MS` = 5s). All return-on-error, never throw. All errors run through existing `sanitise()`. All run inside one `Promise.all` so total wall time stays < 5s regardless of how many probes are added.

2. **`pc2-node/data/test-apps/elacity-health/app.json`** — new bundle manifest (47 LOC). `role: "system"` so it auto-installs on boot via the existing `test-apps` sync hook in `api/index.ts`. Capabilities: `network: true`, `api_endpoints: ["GET /api/diagnose"]`. Window 880×720.

3. **`pc2-node/data/test-apps/elacity-health/index.html`** — new test-app UI (611 LOC, single-file with inline CSS + JS). Pattern lifted from `supernode-manager/index.html`. Components:
   - First-run consent banner (gated on `localStorage.pc2_health_consent_seen_v1`; dismisses on click)
   - "Run Health Check" button → calls `GET /api/diagnose` with bearer auth from `puter.auth.token` URL param
   - Overall pass/warn/fail summary tile
   - 7 result cards: Node, Services, IPFS Cluster, Lit/Chipotle, Supernodes (table), WASM Runtimes (table), Update Channel
   - Recent logs (`<details>` collapsible, monospace, dark)
   - 2 placeholder cards for T-1B "Send Support Report" and T-1C "Aggregate Telemetry" (greyed, "Coming soon" badge)

**Verification done**:
- ✅ `npx tsc --noEmit -p tsconfig.json` (pc2-node) — clean compile, exit 0, 14s
- ✅ `ReadLints` on diagnose.ts + index.html + app.json — zero warnings
- ✅ JSON validity (`JSON.parse(app.json)`) — clean
- ✅ JS syntax (`node --check`) on extracted `<script>` block — 271 lines, valid
- ✅ End-to-end runtime check of `WebAssembly.compile()` against all 7 production crates — all 7 pass in 2-21ms each, parallel wall time ~21ms, peak module size 5.3MB (ddrm-renderer)

**What's NOT yet done** (deferred to next T-1A iteration):
- Frontend UI not yet visually validated by Sasha (next step: install + screenshot)
- Optional polish: an "Export snapshot as JSON" button (one-line `JSON.stringify` + `Blob` download), useful as a manual stopgap until T-1B's send-report flow lands
- Optional: per-section expand/collapse for noisy result tables on small screens
- Optional: Wireguard verdict softened (currently treats null as "—"; could be "not configured" with explanation)

**What's NOT yet started** (T-1B Phase 2 / T-1C scope):
- SIWE-authed `POST /api/support/report/send` endpoint on PC2 (signs + ships bundle)
- Supernode-side `POST /api/support/report` ingest endpoint (persist + dedupe + forward)
- Per-wallet rate limiting (token bucket: 1/5min, burst 3/24h) — shared with C-2 relayer
- GitHub Action triage workflow + private repo for tickets
- `recordTelemetryCounter()` / `recordTelemetryHistogram()` extensions to telemetry.ts
- Daily flusher + supernode ingest endpoint for T-1C
- Rust crate `pc2-telemetry-shared` + 8-crate instrumentation pass

### 2026-05-07 ~12:06 ET — T-1B Phase 1 first commit landed (LOCAL-ONLY preview surface)

**Phase 1 scope decision**: split T-1B into two phases. Phase 1 ships the curated-bundle preview surface + redactor + UI, all running entirely locally on the user's node. Zero outbound network egress. Lets us iterate on the redaction policy + UX with users in the loop before any data leaves a node. Phase 2 (gated on Sasha sign-off on the curation policy + GitHub triage repo decision + supernode endpoint shape) ships the SIWE-signed submission path + supernode ingest + GitHub Action triage.

**Files touched** (all new code or additive):

1. **`pc2-node/src/utils/redact.ts`** — NEW (112 LOC). Extracted `sanitise()` from `diagnose.ts` so both T-1A and T-1B reuse the same patterns without drift. Adds three new redactors:
   - `hashWallet(addr)` → `0xWALLET_<sha256-first-16-hex>` (identifiable for triage dedup; never raw)
   - `maskIp(ip)` → IPv4 to `/24`, IPv6 to `/48`
   - `redactHomePath(text)` → replaces `os.homedir()` with `~`
   - `hashContentKey(key)` → SHA-256 first-8 hex (for asset KIDs / channel slugs)

2. **`pc2-node/src/services/support/buildReportBundle.ts`** — NEW (295 LOC). Pure function: `(snapshot, freeText, walletAddress, options) → ReportBundle`. Curates 5 always-included sections + 5 user-togglable optional sections + 5 never-included categories. Schema versioned (`schemaVersion: 1`) so Phase 2's supernode endpoint accepts the same JSON shape unchanged.

3. **`pc2-node/src/api/support.ts`** — NEW (175 LOC). Express router with two endpoints:
   - `POST /api/support/report/preview` — auth-gated; takes snapshot + freeText + walletAddress + options; returns `{ bundle, willOmit }`. NO outbound network egress. The bundle is rendered, returned, and forgotten by the server.
   - `GET /api/support/report/policy` — auth-gated; returns the curation policy in machine-readable form so the UI can render the "what we send / what we omit" disclosure without round-tripping through `/preview` first.

4. **`pc2-node/src/api/diagnose.ts`** — modified: removed inline `sanitise()` (~20 LOC), now imports from `utils/redact.js`. Behaviour-preserving extract.

5. **`pc2-node/src/api/index.ts`** — modified: imports `supportRouter` and mounts at `/api/support`. Two-line surgical change.

6. **`pc2-node/data/test-apps/elacity-health/app.json`** — modified: capabilities updated to declare the three new endpoints (`/api/whoami`, `/api/support/report/policy`, `POST /api/support/report/preview`).

7. **`pc2-node/data/test-apps/elacity-health/index.html`** — modified: replaced the "Send Support Report" placeholder card with a fully active panel:
   - Free-text textarea with character counter (warns at 1800, fails at 2000)
   - 5 togglable optional sections (host / services / cluster / liveProbes / recentLogs), all defaulted on
   - "Preview bundle" button → calls `POST /api/support/report/preview` → renders curated bundle JSON in dark code block
   - Yellow "What will NOT be in this report" warning panel showing `willOmit` array
   - "Copy JSON" / "Download as file" buttons (manual stopgap until Phase 2 send-flow lands)
   - "Send report (next release)" button — disabled with hover tooltip

**Verification done**:
- ✅ `npx tsc --noEmit -p tsconfig.json` (workspace pc2-node) — clean compile
- ✅ ReadLints across all 7 modified/new files — zero warnings
- ✅ JSON validity (`JSON.parse(app.json)`) — clean
- ✅ JS syntax (`node --check`) on extracted `<script>` block — 404 LOC, valid
- ✅ End-to-end runtime smoke test of `buildReportBundle()` with a populated snapshot — confirmed:
  - Wallet hashed correctly (`0x09dBe...` → `0xWALLET_9ec864de7a33e213`)
  - Wallet refs in free-text message redacted to `0xREDACTED_WALLET`
  - Home-dir paths in message + logs replaced with `~`
  - Hostname truncated to `…ty.local` (last 8 chars)
  - liveProbes error strings re-sanitised at the bundle boundary (defense in depth)
  - All 5 optional sections populated correctly
- ✅ `.pc2/` install hot-fixed: copied 3 new files, re-synced 1 modified file, surgical-patched `api/index.ts` (idempotent sed), `npm run build:backend` clean

**What Sasha will see on next PC2 launch**: scroll past the existing 7 health-check cards → new "Send Support Report" card → click "Compose report" → fill textarea → click "Preview bundle" → see exactly what would be shipped (curated JSON + omit list) → "Copy as JSON" or "Download as file" → manually paste in Telegram or attach to a GitHub issue. Loop closes for support-flow today; Phase 2 closes the loop fully (one-click signed submission with returned ticket ID) once curation policy + triage repo + supernode endpoint shape are signed off.

**Phase 2 unblockers needed from Sasha** before that work can start:
1. Sign-off on the curation policy as documented in §"Curation policy" of this task doc + as enforced in `buildReportBundle.ts`
2. GitHub triage repo decision (`Elacity/pc2-support-triage` private repo? Existing repo + label? New org?)
3. Supernode endpoint posture: land on existing `pc2-web-gateway`/`pc2-gateway` services, or new dedicated `pc2-support-gateway` unit? (recommend the former to avoid systemd config sprawl)

### 2026-05-07 ~12:58 ET — T-1C Phase 1+2+3 first commit landed (LOCAL-ONLY metric registry)

**Phase 1+2+3 scope decision** (mirrors T-1B's Phase 1/2 split): Phase 1 ships the `metrics.ts` registry + schema, Phase 2 instruments the first 5 hot-path functions, Phase 3 surfaces live values in the operator's Health & Support test-app. All three together = ~1 release of internal observability with zero outbound bytes. Phase 4-6 (opt-in dialog, daily flusher, supernode ingest, redacted POST) and Phase R (Rust crate + 7-crate instrumentation) defer to v1.2.9.0 (Q2 unblocker = first-run dialog copy; supernode endpoint posture; per-IP rate limit shape).

**Files touched** (all new code or additive, zero risk to existing flows):

1. **`pc2-node/src/storage/migrations.ts`** — bumped `CURRENT_VERSION` 32 → 33; added Migration 33 block that creates `metrics_counters` (PRIMARY KEY name+tags, UPSERT-by-day) and `metrics_histogram_samples` (append-only, indexed by name+ts). Both tables have the same shape on fresh installs (also added to `schema.sql`) so a v1.2.8.x install gets them whether it boots from the schema file or walks the migration loop. Sasha's `.pc2/` is currently at version 32; migration 33 fires on next startup.

2. **`pc2-node/src/storage/schema.sql`** — mirror of the same two tables for fresh installs that bypass the migration loop. Same DDL as Migration 33 so the two paths converge identically.

3. **`pc2-node/src/utils/metrics.ts`** — NEW (~290 LOC). The metric registry. Exports:
   - `recordMetricCounter(db?, name, value=1, tags?)` — UPSERT into `metrics_counters` (idempotent on (name, tags) — concurrent increments coalesce without explicit transactions)
   - `recordMetricHistogram(db?, name, value, tags?)` — append one observation to `metrics_histogram_samples`
   - `observeMs(db?, name, tags?, fn)` — sugar for timing an async op + observing on both success and error paths
   - `setMetricsDb(db)` — registers the process-wide singleton DB handle so domain helpers (chipotle-client, dashPackager) don't need to thread a `DatabaseManager` through every signature
   - `listCounters(db)`, `summariseHistograms(db, windowMs?)` — read APIs for the UI / future flusher; histograms get rolled up to p50/p95/p99/min/max/sum/count in JS (fine at Phase 1 sample volumes; SQL window functions in Phase 4 if/when sample tables hit six figures)
   - `isTelemetryDisabled()` — exposes the `PC2_TELEMETRY_DISABLED=true` kill switch
   - **Defence-in-depth bounds**: 8-tag cap, 64-char tag value cap, 80-char name cap, name pattern enforced (`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`). Names that violate get logged-and-dropped at the recorder, not at SQL — keeps SQL from ever seeing junk.
   - **Privacy**: tags must be low-cardinality structural strings only (`outcome=success`, `kind=media`, `tier=1`, `crate=cenc-decrypt`). Recorders enforce this by construction; no recorder ever passes wallet/IP/KID/path-shaped values.

4. **`pc2-node/src/api/metrics.ts`** — NEW (~60 LOC). Auth-gated `GET /api/metrics/snapshot` returning a single JSON shape:
   ```json
   { "generatedAt": "...", "killSwitch": false,
     "counters": [ { "name": "chipotle.cek_recovery", "tags": {"kind":"media","outcome":"success"}, "value": 12, "updatedAt": ... } ],
     "histograms": [ { "name": "chipotle.cek_recovery_ms", "tags": {"kind":"media"}, "count": 12, "p50": 1247, "p95": 2891, "p99": 3105, ... } ],
     "note": "T-1C Phase 1 — local plumbing only. ..." }
   ```
   Optional `?windowMs=` narrows the histogram window. Auth-gated even though there's no PII in the response — raw counter values can fingerprint a specific user's activity pattern, so we still gate behind the bearer.

5. **`pc2-node/src/api/index.ts`** — added `import metricsRouter from './metrics.js';` (line 49) and `app.use('/api/metrics', metricsRouter);` (line 632). Two-line change; same shape as the T-1B `supportRouter` mount.

6. **`pc2-node/src/index.ts`** — registered `setMetricsDb(db)` immediately after `setGlobalDatabase(db)` so the metric registry has a process-wide DB handle from the moment migrations finish.

7. **`pc2-node/src/api/chipotle-client.ts`** — instrumented all three high-level exports:
   - `recoverNonMediaCEK` → counter `chipotle.cek_recovery` (kind=non_media, outcome=success|failure, reason=...) + histogram `chipotle.cek_recovery_ms`
   - `recoverMediaCEKEnvelope` → same shape with kind=media
   - `encryptWithLitAction` → counter `chipotle.encrypt` + histogram `chipotle.encrypt_ms`
   - Error reason classifier: maps `Lit Action denied` → `action_denied`, `timeout|ETIMEDOUT` → `timeout`, `fetch|network|ECONNREFUSED` → `network`, `401|unauthorized` → `unauthorized`, `403|forbidden` → `forbidden`, `5xx` → `server_error`, default → `other`. Allow-list keeps the reason tag value space bounded (~8 distinct values) — never leaks raw error text.

8. **`pc2-node/src/services/clusterPin.ts`** — instrumented both call sites:
   - `forwardPinToCluster` → counter `cluster_pin.forward` (outcome=ok|retryable|non_retryable|error, status_class=2xx|4xx|5xx|error, reason=...) + histogram `cluster_pin.forward_ms`
   - `queryClusterPinStatus` → counter `cluster_pin.query` (outcome=ok|non_ok|error, pin_status=pinned|pinning|...) + histogram `cluster_pin.query_ms`
   - Two new local helpers: `classifyHttpStatus(n)` → `'2xx'|'3xx'|'4xx'|'5xx'|'unknown'`; `classifyNetworkError(msg)` → `'timeout'|'aborted'|'conn_refused'|'dns'|'tls'|'other'`. Same allow-list discipline as chipotle's classifier.

9. **`pc2-node/data/test-apps/elacity-health/index.html`** — replaced the "Coming soon (T-1C)" placeholder card with a live "Aggregate Telemetry" card: Refresh button, status line ("12 counters (47 events) · 4 histograms · 0.3s" or "PC2_TELEMETRY_DISABLED — recording is OFF" in red), counters table (name / tags as pill list / value), histograms table (name / tags / count / p50 / p95 / p99). Empty state when no metrics recorded yet ("Press Refresh after running a decryption or pin to see live values"). Reuses the existing `pc2Fetch` + `escapeHtml` helpers from the surrounding IIFE.

10. **`pc2-node/data/test-apps/elacity-health/app.json`** — added `GET /api/metrics/snapshot` to capabilities.

**Verification done**:
- ✅ `npm run build:backend` clean (workspace + .pc2/) — exit 0, ~12s
- ✅ `ReadLints` clean across all 6 modified files
- ✅ End-to-end smoke test against in-memory SQLite: 4 valid counters UPSERT correctly (success x2 coalesces to value=2, distinct tag sets stay separate), 50-sample histogram computes p50/p95/p99, 5 invalid inputs (bad name pattern, name too long, NaN, negative, 10 tags) all dropped at the recorder boundary as expected
- ✅ Module load test on `.pc2/`'s freshly-compiled bundle: `dist/utils/metrics.js`, `dist/api/metrics.js`, `dist/api/diagnose.js` all import cleanly — 7 metrics exports present, 2 router defaults present
- ✅ `.pc2/`'s `schema_migrations` confirmed at version 32 (no metrics tables yet); migration 33 fires on Sasha's next restart

**What Sasha will see on next PC2 launch**:
- `Health & Support` app loads as before
- New `Aggregate Telemetry` card replaces the old "Coming soon" placeholder
- First Refresh click: empty state ("press Refresh after running a decryption or pin to see live values")
- Trigger any pin (open a marketplace asset, write a file) or decryption (open a Tier-2-gated stream) → `cluster_pin.*` and/or `chipotle.*` counters start showing up with histograms following
- `PC2_TELEMETRY_DISABLED=true` env var stops all recording (and the status line shows it in red)

**What's NOT done in this commit** (deferred to T-1C Phase 4-6 + Phase R):
- Opt-in toggle + first-run dialog (Phase 4 — Sasha said skip the copy for now)
- Daily flusher to supernode (Phase 4-6 — needs supernode endpoint posture decision, same as T-1B Phase 2)
- Supernode `POST /api/telemetry/ingest` endpoint (Phase 5)
- Rolled-up retention pruning (Phase 4 — `metrics_histogram_samples` will accumulate forever until pruner ships)
- Rust shared crate `pc2-telemetry-shared` + 7-crate WASM instrumentation (Phase R — full Rust review)
- Additional JS-side instrumentation: dashPackager, media transcode, IPFS storage layer, UpdateService poller, boson transports (~20 more call sites available, deferred to Phase 2 second pass)

### 2026-05-07 ~12:14 ET — T-1A/T-1B bug-fix iteration after first hands-on demo

Sasha launched the hot-fixed `.pc2/` install and the UI rendered cleanly: 24 checks (19 pass / 2 warn / 3 fail) in ~3.5s, all 7 cards visible, all 7 WASM crates compiling, both supernodes reachable. Two real bugs surfaced that the unit-style verification didn't catch:

**Bug 1 — `Cannot resolve wallet address. Sign in to PC2 and retry.` in the Send Support Report panel.**

Root cause: the whoami route is mounted at `/whoami` (not `/api/whoami`) — see `pc2-node/src/api/index.ts:470`, which says `app.get('/whoami', handleWhoami)`. The mount path was inherited from the Puter/Heyputer compatibility shim and pre-dates the `/api/*` namespace. My fetch in `elacity-health/index.html` was hitting `/api/whoami`, getting Express's default 404 handler, and silently falling through to the "Cannot resolve wallet" error path on Preview click.

Fix: changed `/api/whoami` → `/whoami` in `index.html` and in `app.json#capabilities.api_endpoints`. Also broadened the wallet extractor to also accept `j.address` as a fallback (current whoami response uses `wallet_address` at the top level — confirmed by reading `whoami.ts:243` — but `address` is the Puter-flavoured field name and we shouldn't break if the schema migrates). Verified by reading `whoami.ts` lines 239-256: response contains `wallet_address: walletAddress` at the top level, so `j.wallet_address` is the canonical extraction.

**Bug 2 — `Current version: unknown` in the Update Channel card.**

Root cause: `process.env.npm_package_version` is only set by `npm` when it spawns the child process (e.g. via `npm run start`). Every desktop install launches pc2-node via `node dist/index.js` directly (Electron + the START_SERVER.sh script), so the env var is empty. The previous code read it directly with a `|| 'unknown'` fallback — fine in the dev flow (`npm run dev`), broken in every desktop install. This also propagated to the GitHub User-Agent header (`PC2-Node/unknown`) and to the "Update available" calculation in the UI.

Fix: added `resolvePc2Version()` to `diagnose.ts` mirroring the same resolver `index.ts` already runs for the heartbeat path (intentional duplication so the diagnose router stays self-contained). Order: `PC2_VERSION` env var → walk a few candidate `package.json` paths → fall back to `npm_package_version` → fall back to `'unknown'`. Cached per-process. Used in two places: `probeUpdateChannel()` and `snapshot.pc2.version`. Smoke-tested in the workspace (`unset npm_package_version && node -e "..."`) — resolves to `1.2.7.14` from `pc2-node/package.json`. Will resolve to whatever the `~/.pc2/pc2-node/package.json` says on operator nodes.

Side effect: the UI's "Update available" badge will now correctly hide when current === latest (the existing `u.currentVersion !== 'unknown'` guard at `index.html:692` prevented it from showing the misleading `1.2.7.14 → 1.2.7.14` row, but that row was still rendered in Sasha's screenshot — that bug self-resolves once `currentVersion` is no longer `'unknown'`).

**Files touched** (workspace only — `.pc2/` install gets re-hot-fixed after Sasha's v1.2.7.14 update completes):
1. `pc2-node/src/api/diagnose.ts` — added `resolvePc2Version()` (43 LOC), replaced 2 call sites
2. `pc2-node/data/test-apps/elacity-health/index.html` — `/api/whoami` → `/whoami`, broadened wallet extractor
3. `pc2-node/data/test-apps/elacity-health/app.json` — `GET /api/whoami` → `GET /whoami` in capabilities

**Verification done**:
- ✅ `npm run build:backend` clean (after a `string | null` narrowing fix on the cache var)
- ✅ ReadLints clean on all 3 files
- ✅ Resolver smoke test: with `npm_package_version` unset, walks `pc2-node/package.json` and resolves to `1.2.7.14` ✓
- ✅ whoami response shape verified by reading `whoami.ts:239-256` — `wallet_address` is at top level, `j.wallet_address` is the correct extractor

**Operator-side residual**: the in-flight `~/.pc2/pc2-node` install will be wiped by Sasha's v1.2.7.14 install click (the auto-updater replaces the entire pc2-node directory tree). Re-hot-fix scheduled for immediately after his update completes — same surgical procedure as before, plus the two bug-fix files above. No new risk; same files, fixed.

**Other observations from the screenshot** (NOT bugs — local node state, captured for reference):
- "Memory used 99% high" — Sasha's Mac is genuinely tight (lots of dev tools open). Real signal.
- "Disk used 99% (9.99 GB free) low" — also real; macOS often reports inflated %used due to APFS purgeable space, but 9.99 GB free is genuinely low for a dev machine.
- "Lit Action CID set: no" — provision blob is cached but the CID file isn't written on disk yet; this is a v1.2.7.5 artefact (his pre-update install). Will resolve once T-1B Phase 2 (relayer-signed provisioning) lands and the CID becomes a server-side concern.
- "Swarm peers: 0 isolated" — node was just launched; libp2p hadn't bootstrapped yet. Expected to flip to "ok" within 30-60s of normal operation. Not a bug; could add a "freshly-launched" softener as future polish.

### 2026-05-07 ~13:09 ET — T-1C operator validation iteration (post-v1.2.7.14 hot-fix replay + 2 bug-fixes)

After Sasha's v1.2.7.14 update wiped the previous hot-fix layer (auto-updater replaces the whole `pc2-node` tree), I re-applied the full T-1A + T-1B Phase 1 + T-1C Phases 1+2+3 stack to `~/.pc2/pc2-node` (surgical sync of new modules + selective patches to `api/index.ts` and `index.ts` + recompile via `npm run build:backend`). Two operator-validation bugs surfaced that the unit-style verification didn't catch.

**Bug 3 — `Health check failed: API returned HTTP 500` on `/api/diagnose`.**

Root cause: `pc2-node/src/api/diagnose.ts` uses `__dirname` (a CommonJS global) inside `resolvePc2Version()` to walk candidate `package.json` paths. The compiled bundle is loaded as ESM (`"type": "module"` in `package.json` + `node --experimental-vm-modules` flags), and ESM modules don't get `__dirname` for free — accessing it throws `ReferenceError: __dirname is not defined`. The error path inside `diagnose.ts` was caught by the outer Express handler and surfaced as HTTP 500 to the test-app.

Fix: added the standard ESM `__dirname` polyfill at the top of `diagnose.ts` (`const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);`). This is a minimal-change polyfill that doesn't require `tsconfig` adjustments. Same pattern Node's docs recommend for migrating CJS modules to ESM. Verified by re-running `/api/diagnose` against the hot-fixed `.pc2/` — now returns 200 with all 24 probes populated and `pc2.version: "1.2.7.14"` correctly resolved from the freshly-installed `pc2-node/package.json`.

**Bug 4 — Aggregate Telemetry card not visible in the UI.**

Root cause: `elacity-health/index.html` uses a CSS rule `.card { display: none }` for collapsing diagnostic cards before "Run Health Check" populates them; the JS then adds a `.shown` class to reveal each populated card. The new `.metrics-card` element inherited the `.card` class for visual consistency, but I never wrote the corresponding `metricsCard.classList.add('shown')` call (the metrics card is meant to always be visible — it's not gated behind the health-check button). Result: card never rendered; Sasha saw the page jump straight from "Recent logs" to "Send Support Report" with no telemetry section in between.

Fix: removed the `.card` class from the metrics-card div, replaced with direct styling on `.metrics-card` (`background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;` — same visual as `.card.shown`). The card is now always visible as intended; no JS class-toggling required.

**Files touched** (workspace + `.pc2/`, both):
1. `pc2-node/src/api/diagnose.ts` — added 4-line ESM `__dirname` polyfill at top of file
2. `pc2-node/data/test-apps/elacity-health/index.html` — removed `.card` class from metrics card div, added `.metrics-card` direct styling
3. `pc2-node/data/installed-apps/elacity-health/index.html` — same change to the installed-apps copy (Puter caches this version, not the test-apps source — needs both to be in sync until the cache invalidation lands properly)

**Operator validation — first real telemetry data captured 2026-05-07 ~13:08 ET**:

After Sasha re-launched the hot-fixed node and clicked Refresh on the Aggregate Telemetry card:

```
Counters
  chipotle.cek_recovery{kind=non_media,outcome=success}  →  1

Histograms (ms)
  chipotle.cek_recovery_ms{kind=non_media,outcome=success}  →  n=1, p50=p95=p99=2362
```

This single data point confirms **all four pieces of the T-1C plumbing fired correctly end-to-end**:

1. ✅ **Migration 33 ran** — `metrics_counters` and `metrics_histogram_samples` tables exist and accept writes (the old `.pc2/` was at version 32; on next launch with v1.2.7.14 + hot-fix it walked to 33).
2. ✅ **`setMetricsDb(db)` was wired into `index.ts` correctly** — chipotle-client's `recordMetricCounter(undefined, ...)` calls were able to find the singleton DB handle without a per-call DatabaseManager threading.
3. ✅ **Instrumentation fired on a real Lit Protocol round-trip** — Sasha presumably opened a Tier-2-gated stream or hit `/api/diagnose`'s `probeAllSupernodes`'s `/api/ddrm/provision` path (which internally calls `recoverNonMediaCEK`), recovering a non-media CEK in 2362ms. The `kind=non_media` and `outcome=success` tags are exactly the low-cardinality structural strings the recorder is supposed to enforce.
4. ✅ **Snapshot endpoint serialised the metric correctly** — counter rendered as `value: 1`, histogram rolled up to identical p50/p95/p99 (correct for n=1 sample), tag pills rendered as separate `<span>` elements in the UI (text-paste collapsed them to look like one pill, but the actual DOM is correct).

The 2362ms p50 is genuinely slow — typical first-call cold-path latency for a Lit Action HTTP round-trip (TLS + Lit node selection + signature gathering + envelope unwrap). Will drop to ~800-1500ms on warm calls. Once we have 30+ samples the histogram becomes a real signal.

**What this validates beyond the unit tests**: the in-memory smoke test at ~12:58 ET proved the recorder/aggregator math; this validates the **full operator path** — DB migration, runtime DB-handle wiring, real instrumentation point firing, IPC across the test-app fetch boundary, UI rendering. End-to-end. Phase 1+2+3 fully closed, both unit and operator.

**Open lanes after this entry**:
- 🟡 **T-1B Phase 1 click-test** still pending (Sasha hasn't yet exercised Compose → Preview → Copy/Download). Form rendered without errors so the wallet-resolution fix from ~12:14 ET held, but a real click is the canonical close. Low risk, 3 minutes of operator time.
- 🟢 **dag/import migration** — gated on Irzhy's answers to 5 questions sent ~13:22 ET (URL, auth model, pin auto-creation, body size cap, priority). My scoping is complete and the implementation skeleton is sketched in this conversation; pre-staging the `exportDagToCar` helper is safe but not done (waiting on Irzhy's auth posture first to avoid speculative rework).
- 🔵 **T-1B Phase 2** — still parked behind: curation policy sign-off, GitHub triage repo decision, supernode endpoint posture. By design, lands AFTER dag/import per the 2026-05-07 ~12:00 ET sequencing call.
- 🔵 **T-1C Phases 4-6 + Phase R** — all explicitly deferred to v1.2.9.0 per Sasha's "for now don't worry about this, leave it out" call.

---

## TL;DR

PC2 has rich local logging but **zero cross-install observability**. We can't tell whether a decrypt-failed report is one user's edge case or a fleet-wide regression. We can't tell users "click this button to send us a report." We can't see into the Rust/WASM layer where most decrypt failures actually live.

This task ships **three complementary features in one release**:

1. **T-1A — Self-Diagnostic** (Settings → Run Diagnostic): a battery of local tests (pc2-node responsive, supernode reachable, Lit Action round-trip works, IPFS gateway reachable, WASM crates load) showing pass/fail to the user. Resolves an estimated 30-50% of issues without any data leaving the user's machine.
2. **T-1B — Support Reports** (Settings → Send Report): user-initiated, identifiable, signed bundle with curated logs + free-text. Returns a ticket ID. Lands as a GitHub issue in a private triage repo.
3. **T-1C — Aggregated Telemetry** (Settings → Help improve PC2): opt-in, default-off, daily-batched anonymous counters and histograms. Tells us how the fleet is performing without identifying individuals.

All three share a single auth/transport layer (SIWE on a new `support.ela.city` supernode endpoint) and a single redaction policy. The Rust/WASM layer gets a new shared telemetry crate so panics, decrypt timings, and failure reasons become visible to the JS host.

**Why this before the Chipotle relayer (C-2)**: with T-1 in place when C-2 ships, we'll see in production whether the relayer is being hit, what the fall-through rates are, and where it's failing. Shipping C-2 first is shipping the security fix blind. Re-sequencing is a strict win on rollout safety.

---

## Description

Replace "user reports a problem in Telegram" with "user clicks a button, we get a structured ticket." Replace "we hope decrypts are working" with "we can prove decrypts are working from production telemetry." Replace "panics in the WASM layer surface as cryptic console messages" with "panics carry structured context all the way to the support pipe."

Three deliverables, each independently shippable but designed to share infrastructure:

### Deliverable A: Self-Diagnostic ("Run Test" button)

Lives in PC2 Settings under a new "Health & Support" panel. Runs a battery of synchronous + async checks and shows a tree of pass/fail with timings and reasons:

```
Health Check — 2026-05-07 14:30:12
─────────────────────────────────
✓ pc2-node responsive (4ms)
✓ Local Kubo / Helia: 14 connections, 4 pinned items
✓ Supernode 1 (Contabo) reachable (62ms)
✓ Supernode 2 (InterServer) reachable (89ms)
✓ Lit Action decrypt round-trip: PASS (847ms total)
✓ IPFS gateway reachable (140ms)
✓ Update channel reachable
✗ WASM cenc-decrypt: SLOW
   └─ 312ms vs cohort baseline 78ms — possible CPU throttling

[ Re-run ]   [ Send Report with these results ]
```

**Privacy**: zero. Runs entirely locally. The "Send Report" button is the bridge to T-1B.

### Deliverable B: Support Reports ("Send Report" button)

User-initiated, identifiable, ticket-tracked. UX flow:

1. App generates a draft report bundle (curated, NOT raw logs)
2. User sees a **preview screen** showing exactly what's about to be sent (non-negotiable for trust)
3. User adds free-text description (capped at 2000 chars)
4. User clicks Send
5. App ships the report to `https://<supernode>/api/support/report`, signed with the same SIWE wallet pattern that C-2 will use for the relayer
6. App displays a **ticket ID** the user can quote in Telegram/Discord/GitHub
7. Receiving supernode persists the report and a GitHub Action polls + creates a private-repo issue from each report

**Curation policy** (defaults — user can toggle additional fields in the preview):

| Field | Default state | Notes |
|---|---|---|
| App version, OS, CPU arch, Node version | Always included | Identifying nothing about user |
| Last 200 log lines | Always included, **redacted** | Wallets → `0x1234...abcd`; IPs → `/24` only; asset KIDs → `sha256(kid).slice(0,8)`; channel names → omitted; file paths → home directory replaced with `~` |
| Diagnostic test results (if launched from T-1A) | Always included | The structured pass/fail tree from T-1A |
| Free-text description | Always included | User-supplied; 2000-char cap; user can preview before send |
| Per-install pseudonymous ID | Always included | Random UUID generated at first run, stored in `data/.install-id`; not linked to wallet |
| **Full wallet address** | **Off by default** | Toggle reveals "include this if your issue is about a specific transaction or asset" |
| **Exact IP** | **Off by default** | Toggle reveals "include this if your issue is about supernode reachability" |
| **Channel name + asset titles** | **Off by default** | Toggle reveals "include this if your issue is about a specific asset playback failure" |
| **Recent IPFS pin list** | **Off by default** | Toggle reveals "include this if your issue is about content not appearing" |

**The user can never accidentally send raw logs.** Redaction is enforced at bundle-build time, not at send time.

### Deliverable C: Aggregated Telemetry (opt-in, default off)

A single Settings toggle: "Help improve PC2 by sending anonymous usage stats." First-run dialog asks once after wallet onboarding.

**What it sends** (daily batch, ~1-5 KB per ping):

- **Counters** (per-event): `decrypt_success`, `decrypt_failure_by_reason`, `cek_recovery_tier_used`, `ipfs_fetch_success/failure`, `wasm_panic_count_by_crate`, `relayer_503_fallthrough_count` (post-C-2)
- **Histograms** (sampled): `cek_recovery_latency_ms`, `dash_packaging_time_ms`, `ipfs_first_byte_ms`, `wasm_decrypt_time_ms`
- **Versions** (one per ping): pc2-node version, OS family (`darwin`/`linux`/`win32`), CPU arch (`arm64`/`x86_64`)
- **Cohort ID** (rotates monthly): random 32-byte value to allow per-cohort aggregation without long-term cross-batch correlation

**What it does NOT send** (ever, regardless of toggles): wallet addresses, IPs, asset KIDs, file paths, channel names, IPFS pin lists. None of these are needed for fleet-level telemetry; they belong only in T-1B reports.

**Where the data goes**: a small SQLite store on each supernode (eventual: Prometheus + Grafana once volume justifies it). Sasha-only dashboard. Not user-facing.

---

## Background

### What surfaced this

Sasha, 2026-05-07 ~10:50 ET:

> "is there an opportunity for users to run and send a report to either supernodes or somewhere where we can check and then refine and optimize our system as feedback driven work? I'd like to be able to ideally say to any user having an issue to just go to settings and click report button where we can then find the log and understand any issue and solve or give support feedback?"

Plus the parallel observation that we have minimal observability into the Rust/WASM runtimes themselves (CEK delivery, decrypt operations, panic surface).

### Why we have the gap

PC2 has been engineered for sovereign operation: every install is a self-contained node, no phone-home, no centralised logs. That's the right default *philosophically* but it leaves the team optimising blind:

- A user reporting "decrypts are slow" can be one machine's HiDPI rendering issue, a regional supernode latency, or a fleet-wide regression — and we can't tell which without per-install context.
- Bug reports come in as Telegram screenshots which have to be re-typed into a tracker; failure-rate data is unrecoverable.
- Rust/WASM crates panic and the panic surfaces to JS as a string; structured failure reasons (`del_expired`, `signature_mismatch`, etc.) exist *inside* Lit Actions but not anywhere else.
- C-2 (the Chipotle relayer) is about to ship a major change to a hot path with no way to verify it's working in production except by checking that nobody complains.

### Why this is the right time

**Earliest possible moment with the most leverage**:

- User base is small enough that report volume is human-triageable but large enough that we'll see real failure modes
- System is still mutable — decisions baked in now (like "telemetry is opt-in, default off") will be permanent later
- The C-2 relayer build is right ahead of us; T-1 first means C-2 lands with observability already in place
- Privacy norms are early enough that defaults set now define the brand promise. "Sovereign by default, transparent always, opt-in for everything else" is a strict differentiator vs every other Web3 wallet/app on the market

### What "feedback-driven optimisation" actually requires

To answer "is the system getting better release-over-release," we need at minimum:

| Question | Needs |
|---|---|
| "Is decrypt success rate >99%?" | T-1C counters (`decrypt_success`, `decrypt_failure_by_reason`) across cohorts |
| "Are we faster than v1.2.7?" | T-1C histograms (`cek_recovery_latency_ms`, `wasm_decrypt_time_ms`) tagged by version |
| "What broke for THIS user?" | T-1B report (logs + diagnostic + free-text) |
| "Did the user actually try the obvious fix?" | T-1A self-diagnostic timestamped before report submission |
| "Is the fix shipping in v1.X actually working in production?" | T-1C version-tagged counters showing rate change after release |

Each of T-1A/B/C answers different questions. Building them as one release lets them share auth, transport, redaction.

---

## Architecture

### High-level wire shape

```
┌─────────────────────────────────────────────┐    ┌──────────────────────────┐
│              PC2 Node                       │    │   Supernode (gateway)    │
│                                             │    │                          │
│  ┌──────────────────┐                       │    │                          │
│  │ Self-Diagnostic  │── runs locally only ──┘    │                          │
│  │  (T-1A)          │   (no wire traffic)        │                          │
│  └──────┬───────────┘                            │                          │
│         │                                        │                          │
│         ▼                                        │                          │
│  ┌──────────────────┐    POST /api/support/      │  ┌──────────────────┐    │
│  │ Report Bundler   │       report               │  │ Support Endpoint │    │
│  │  (T-1B)          │──── X-PC2-Wallet ──────────┼─→│  (signed-only)   │    │
│  │  + Redactor      │     X-PC2-Sig                  └──────┬───────────┘    │
│  │  + Preview UI    │     X-PC2-Nonce                         │              │
│  └──────────────────┘     {bundle...}                         ▼              │
│                                                  ┌──────────────────┐       │
│  ┌──────────────────┐    POST /api/telemetry/    │ /etc/pc2/reports │       │
│  │ Metric Registry  │      ingest                │  /<ticket>.json  │       │
│  │  (T-1C)          │──── X-PC2-Cohort ──────────┼─→ (mode 0640)    │       │
│  │ Counters +       │     {batch...}             └──────────────────┘       │
│  │ Histograms       │                                          │            │
│  └──────────────────┘                                          │            │
│         ▲                                                      ▼            │
│  ┌──────────────────┐                            ┌──────────────────┐       │
│  │ Rust/WASM        │                            │  GitHub Action   │       │
│  │ Telemetry Bus    │                            │  polls +         │──────►│ private
│  │ (ring buffer)    │                            │  creates issue   │       │ triage repo
│  └──────────────────┘                            └──────────────────┘       │
└─────────────────────────────────────────────┘    └──────────────────────────┘
```

### Three things change

1. **PC2 gets a Settings → Health & Support panel** with three buttons (Run Diagnostic, Send Report, Telemetry toggle) plus a transparent "what we send" preview for each.
2. **Supernode gateway gets two new endpoints**: `POST /api/support/report` (SIWE-authed; persists to `/etc/pc2/reports/<ticket>.json`) and `POST /api/telemetry/ingest` (anonymous; rate-limited; appends to a small SQLite at `/etc/pc2/telemetry.db`).
3. **WASM Rust crates get instrumented** via a new shared `pc2-telemetry-shared` crate. Each public entry point emits start/end events with elapsed time + failure reasons; panics carry structured context to JS instead of unwinding silently.

### Auth model

T-1B reports are SIWE-signed using the same wallet shape that C-2's `relayer-signer.ts` will use — runtime-injected (real wallet), env-override (operator), or disk-backed ephemeral. The relayer-signer module ships in T-1; C-2 reuses it unchanged.

T-1C telemetry is **anonymous** — no wallet, no signature. Rate-limited per-IP only (the cohort ID rotates monthly to prevent long-term correlation). This is intentional: linking telemetry to a wallet would defeat the anonymity promise.

### Redaction policy (single source of truth)

A new module `pc2-node/src/utils/redactor.ts` defines the canonical redaction policy:

```typescript
export const RedactionPolicy = {
  wallet:     (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`,
  ip:         (s: string) => s.split('.').slice(0, 3).join('.') + '.0/24',
  kid:        (s: string) => `kid:${sha256(s).slice(0, 8)}`,
  channel:    (_: string) => '<redacted-channel>',
  filepath:   (s: string) => s.replace(homedir(), '~'),
  // ... etc
};
```

Both T-1B and T-1C import the same redactor. Tests verify that no reasonable input produces output containing PII patterns (regex sweep for `0x[0-9a-f]{40}`, IPv4 patterns, etc.). One source of truth, not two diverging implementations.

### Why these choices

- **GitHub Action triage workflow (not bespoke dashboard)**: the team already triages in GitHub; reports become issues in a private repo with auto-applied labels (`os:darwin`, `version:1.2.8.0`, `category:dDRM`). When report volume justifies a dashboard, we add it. Avoid premature complexity.
- **SQLite for telemetry (not Prometheus initially)**: at our current scale, SQLite gives us aggregate queries with zero ops cost. We can graduate to Prometheus when we have ≥10k pings/day.
- **Opt-in default for both T-1B and T-1C**: explicitly establishes the privacy-respecting default. Users have to *choose* to send anything. Earns the data.
- **Per-install pseudonymous ID rather than wallet linkage**: lets us correlate "which install reported this issue" without linking to user identity. Privacy-stronger than Telegram screenshots, which are inherently identified.
- **Same SIWE plumbing as C-2**: build it once, use it twice. T-1's signer ships first; C-2 reuses it.

### What this does NOT do

- **Not a centralised logging system.** Reports are submission-only, on user trigger. No background log-shipping. No daemon collecting telemetry.
- **Not surveillance.** Wallets, IPs, asset KIDs are off by default. Toggles in the preview let the user opt to include them, with clear reasons why.
- **Not a replacement for sovereignty.** A future Settings field `supportEndpoint` will let users route reports to their own URL (Phase 2, post-v1.3). Default points at our supernodes; user can override anytime.
- **Not a marketing or analytics tool.** No "did the user click X" tracking. Counters cover failure modes and performance, not user behaviour.

---

## Implementation Plan

### Phase A — T-1A Self-Diagnostic (smallest, ships first)

**Why first**: zero privacy review needed (no data leaves machine), independent of supernode work, immediately resolves a chunk of support issues. Could even slip into v1.2.7.x if Sasha wants.

- [ ] **A-1**: Create `pc2-node/src/api/diagnostic.ts` exporting `runDiagnostic(): Promise<DiagnosticReport>`. Tests:
  - `pc2-node-responsive`: trivial ping
  - `local-kubo`: list connections + count pins
  - `supernode-reachable`: HEAD against each `/api/health`, time it
  - `lit-action-roundtrip`: encrypt+decrypt a 16-byte test CEK end-to-end (uses operator-mode env or ephemeral signer; doesn't consume user quota)
  - `ipfs-gateway-reachable`: GET against `https://ipfs.ela.city/ipfs/<known-test-cid>`
  - `update-channel-reachable`: HEAD against the GitHub releases API
  - `wasm-crates-load`: import each crate and call its self-test if it has one
  - `cohort-baseline-comparison`: optional — compares timings against cohort medians from T-1C telemetry
- [ ] **A-2**: Add `POST /api/diagnostic/run` route (local-only; bound to 127.0.0.1) so the Settings UI can trigger it
- [ ] **A-3**: Settings UI panel — new "Health & Support" section under existing Settings:
  - "Run Diagnostic" button + result tree
  - "Re-run" + "Send Report with these results" buttons
  - Saves last 5 diagnostic runs in `data/.diagnostic-history.json` for trend visibility
- [ ] **A-4**: Unit tests for each individual check (mock the network/IPFS/WASM dependencies)

**LOC**: ~150 TS (diagnostic logic) + ~200 HTML/JS (Settings UI) + ~80 LOC tests = ~430

### Phase B — T-1B Support Reports (depends on A; the central deliverable)

- [ ] **B-1**: Create `pc2-node/src/utils/redactor.ts` with the canonical redaction policy. Unit tests verify no PII regex passes through.
- [ ] **B-2**: Create `pc2-node/src/runtime/relayer-signer.ts` (this is the same module C-2 will reuse). Promote the scaffold from `.cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/scaffold/relayer-signer.ts` and finish the secp256k1 implementation:
  - Real `signMessage()` (EIP-191 personal_sign over a message)
  - Real ephemeral keypair derivation (`address` from `privateKey`)
  - Backend resolution: runtime-injected → env override → disk-backed ephemeral
  - **Note for C-2**: when the relayer build picks up C-2, it imports this exact file unchanged. T-1 ships the signer; C-2 ships the consumer.
- [ ] **B-3**: Create `pc2-node/src/api/report.ts` exporting:
  - `buildReportBundle(opts: { includeWallet, includeIp, includeChannelNames, includePinList })` → `ReportBundle`
  - `submitReport(bundle: ReportBundle)` → `{ ticketId: string, expiresAt: number }`
- [ ] **B-4**: Settings UI report flow — preview screen with toggle list, free-text area, send button, ticket-ID display
- [ ] **B-5**: Supernode endpoint `POST /api/support/report` (lives in `deploy/web-gateway/lib/support-relay.js`, mirrors `lit-relay.js` shape from C-2 scaffold):
  - SIWE verify (same nonce/challenge dance as C-2)
  - Per-wallet rate limit: 5 reports/hour, 50/day
  - Per-IP rate limit: 30 reports/hour
  - Persist to `/etc/pc2/reports/<ticket>.json` mode 0640, owner pc2-gateway
  - Returns `{ ticketId, expiresAt }`
- [ ] **B-6**: Supernode endpoint `DELETE /api/support/report/:ticketId` (SIWE-authed; user can revoke their own reports)
- [ ] **B-7**: Supernode endpoint `GET /api/support/report/:ticketId` (SIWE-authed; user can retrieve their own report)
- [ ] **B-8**: Auto-purge cron — `find /etc/pc2/reports -mtime +90 -delete` daily
- [ ] **B-9**: GitHub Action in `.github/workflows/triage-reports.yml`:
  - Runs every 15 minutes via cron schedule
  - Polls each supernode for new reports (signed admin token from `Elacity` secret store)
  - Creates a GitHub issue in `Elacity/pc2-support` (private repo) per new report
  - Auto-applies labels: `os:<family>`, `version:<x.y.z>`, `category:<dDRM|IPFS|UI|Update>` (heuristic from the report content)
  - Marks the report on the supernode as "ingested" so it's not re-issued
- [ ] **B-10**: First-run dialog explaining the support-report feature when user first opens Settings → Health & Support

**LOC**: ~150 TS (redactor) + relayer-signer promotion (~100 LOC of secp256k1 inline + ~30 of cleanup) + ~250 TS (report bundler/submitter) + ~300 HTML/JS (preview UI) + ~250 JS (supernode endpoints) + ~100 YAML/JS (GitHub Action) + ~200 LOC tests = ~1,180

### Phase C — T-1C Aggregated Telemetry (depends on B's transport; the longest path due to Rust)

- [ ] **C-1**: Create `pc2-node/src/utils/metrics.ts` — minimal in-memory metric registry
  - `Counter`, `Histogram` types (no external dep; ~50 LOC)
  - Daily flush at midnight UTC, batch-encoded as JSON-lines
- [ ] **C-2**: Wire counter increments + histogram observations into existing call sites in `chipotle-client.ts`, `media.ts`, `dashPackager.ts`, `storage.ts`, `update-service.ts`
  - Around 30-40 instrumentation points across these files; each is `metrics.counter('cek_recovery_tier_used').inc({ tier: 1 })`-style — boilerplate, mechanical
- [ ] **C-3**: Settings toggle — "Help improve PC2 by sending anonymous usage stats" (default off). First-run dialog after wallet onboarding asks once, then never again.
- [ ] **C-4**: Submission daemon — `pc2-node/src/runtime/telemetry-flusher.ts`:
  - Daily at midnight UTC + jitter (random 0-3600s to avoid thundering herd)
  - Reads `data/.metrics-pending.jsonl`
  - POSTs to `https://<supernode>/api/telemetry/ingest` with `X-PC2-Cohort` header
  - On success, atomically truncates the file
  - On failure, retains and retries next day
- [ ] **C-5**: Supernode endpoint `POST /api/telemetry/ingest` (lives in `deploy/web-gateway/lib/telemetry-relay.js`):
  - **No** SIWE — anonymous by design
  - Rate-limited per-IP only (300 ingests/hour)
  - Validates the cohort ID is well-formed
  - Appends to SQLite at `/etc/pc2/telemetry.db` (auto-rotating, 90-day retention)
- [ ] **C-6**: A small SQL-driven summary script `deploy/web-gateway/bin/telemetry-summary.sh` that runs daily and posts a summary to a `#telemetry` Slack/Telegram channel (Sasha-bound)
- [ ] **C-7**: Optional Grafana setup (deferred to after first month of data exists)

#### Rust/WASM instrumentation sub-task (C-Rust)

- [ ] **C-Rust-1**: Create `wasm-crates/pc2-telemetry-shared/` — new shared Rust crate
  - `TelemetryEvent` enum: `EntryStart { fn_name }`, `EntryEnd { fn_name, elapsed_us }`, `Error { reason, context }`, `Panic { reason, context }`
  - Thread-local ring buffer (4096 events default)
  - `pub fn emit(event: TelemetryEvent)` — push to ring
  - `pub fn drain() -> Vec<TelemetryEvent>` — JS host calls this between WASM invocations
  - Macro `with_telemetry!(fn_name => { ... })` that wraps any block in start/end events
- [ ] **C-Rust-2**: Wrap each public entry in `cenc-decrypt`, `cenc-encrypt`, `mp4-split`, `ipfs-assemble`, `aes-gcm-decrypt`, and any other shipped crates with `with_telemetry!`. Convert `panic!` paths to `emit(Panic { ... }); return Err(...)` where possible.
- [ ] **C-Rust-3**: WASM host glue in `pc2-node/src/services/wasm/WASMRuntime.ts` — call `drain_events()` after every WASM invocation, push events into the JS metric registry. Maps WASM event names to metric keys.
- [ ] **C-Rust-4**: A JS-side test harness that runs a fixture decrypt and verifies the expected events arrive in the ring buffer.

**LOC**: ~250 TS (metrics + flusher) + ~200 instrumentation points (mechanical) + ~150 JS (supernode ingest + SQLite) + ~120 RS (telemetry-shared crate) + ~160 RS (instrumentation across 8 crates) + ~80 TS (host glue) + ~100 LOC tests = ~1,060

---

## Privacy Policy & Redaction Review

**This section requires Sasha sign-off before any of T-1B or T-1C ships.**

### Default redaction (T-1B reports)

| PII class | Default | Toggle? | Rationale |
|---|---|---|---|
| Wallet (full) | Off | Yes | Optional for transaction-related issues |
| Wallet (truncated `0x1234...abcd`) | On | No | Useful for cross-report correlation without identification |
| Public IP | Off | Yes | Optional for reachability issues |
| IP `/24` mask | On | No | Geographic + ISP-level grouping useful for triage |
| Asset KID (full) | Off | Yes | Optional for asset-specific issues |
| Asset KID (sha256-truncated) | On | No | Allows linking multiple reports for same asset without identifying it |
| Channel name | Off | Yes | Optional for channel-specific issues |
| Asset titles | Off | Yes | Optional for asset-specific issues |
| File paths (homedir replaced) | On | No | Important for "file not found" debugging |
| IPFS pin list | Off | Yes | Optional for content-availability issues |
| Per-install UUID | On | No | Cross-report correlation; not user-identifying |
| App version, OS, arch | On | No | Mandatory for any meaningful triage |
| Free-text description | On | n/a | User-supplied; user controls content |

### Redaction enforcement

- Bundle is built via `redactor.ts` at submit time, not at log-emit time. Local logs remain unredacted (sovereign user can inspect their own machine fully).
- A regex sweep in `redactor.ts` validates the bundle has no leaked patterns before submission. Fails the submit if any leak detected.
- Preview screen shows the *redacted* bundle, byte-for-byte what the supernode receives. WYSIWYS.

### T-1C anonymity guarantee

- No wallet, no IP (only /24 hashed), no asset identifiers in any payload
- Cohort ID is a random 32-byte value rotating monthly (gives 12 cohort IDs per year per install)
- Single user across cohort rotations is statistically de-correlatable but not provably so — explicitly call this out in the privacy policy

### Retention & deletion

- Reports: 90 days on supernode, then auto-purged. User can `DELETE` their own reports anytime via SIWE-authed call.
- Telemetry: 90 days in SQLite, then auto-purged. No deletion path for individuals (anonymous, can't identify which row to delete).
- GitHub triage issues: per the `Elacity/pc2-support` repo policy (separate decision; suggest 1-year retention with archive-on-close).

### Sovereignty path

- Default endpoint: `https://<supernode>/api/support/report` and `/api/telemetry/ingest`
- Phase 2 (post-v1.3): a Settings field `supportEndpoint` lets users override. Pattern matches existing `provision` URL list — sovereign users can route to their own infrastructure.

---

## Open Questions for Sasha

These need explicit decisions before Phase B and Phase C begin:

1. **Triage repo location**: `Elacity/pc2-support` (private) or `Elacity/pc2-net-support` (private) or part of an existing repo? Create the repo + add the GitHub App with `issues:write` for the workflow.

2. **Slack/Telegram channel for telemetry summary**: which channel does the daily summary post to? Or just a `support@ela.city` email digest?

3. **First-run dialog copy**: the consent dialog wording is brand-defining. Sasha to write or approve. Default draft proposal:

   > **"Help improve PC2"**
   >
   > PC2 is built to put you in control. We don't track your usage by default — but if you'd like to help us catch bugs faster and make decrypts smoother, you can opt in to send anonymous performance stats.
   >
   > Anonymous means: no wallet address, no IP, no asset names, ever. We collect only counters (success rates, error categories) and timings (how fast decrypts finish), tied to a random cohort ID that rotates every month.
   >
   > You can change this anytime in Settings → Health & Support. Default: **off**.
   >
   > [ Not now ] [ Help improve PC2 ]

4. **Operator-elevated wallet for diagnostics**: T-1A's `lit-action-roundtrip` test consumes one Lit Action call per run. At 100/hour rate limit, a user who clicks "Re-run" 100+ times in an hour gets rate-limited. Resolution: T-1A's roundtrip uses an operator-mode env key (Tier 1) rather than the user's bucket. Or: dedicated `relayer-elevated-wallets.allow` includes a special "diagnostic" wallet whose bucket is 1000/hour.

5. **C-2 dependency direction**: confirmed by re-sequencing — T-1's `relayer-signer.ts` ships in T-1, C-2 imports it unchanged. The C-2 scaffold's promote checklist gets updated to "import T-1's signer" rather than "implement signer from scratch."

6. **WASM crate inventory**: I've listed 5 crates I'm aware of (`cenc-decrypt`, `cenc-encrypt`, `mp4-split`, `ipfs-assemble`, `aes-gcm-decrypt`) — there may be others (`evm-multicall`, `amm-engine`, `ddrm-renderer` per Anders' convergence inventory). Confirm full list before C-Rust-2 starts so we instrument them all in one pass.

7. **Privacy review reviewer**: who signs off on the redaction policy and consent dialog before T-1B ships? Sasha alone, or external counsel given EU/UK presence in the user base?

8. **Should T-1A ship before T-1B/C?** A-only is ~2 weeks of work and ships independently. We could fold A into a v1.2.7.15 point release while B and C get the full v1.2.8.0 treatment. Tradeoff: extra release cycle vs. faster shipping of the most-immediately-useful piece.

---

## Files to Modify

| File | Change | Phase |
|---|---|---|
| `pc2-node/src/api/diagnostic.ts` | **NEW** — diagnostic test runner | A |
| `pc2-node/src/utils/redactor.ts` | **NEW** — canonical redaction policy + tests | B |
| `pc2-node/src/runtime/relayer-signer.ts` | **NEW** — promoted from C-2 scaffold; secp256k1 implementation | B |
| `pc2-node/src/api/report.ts` | **NEW** — bundle builder + submitter | B |
| `pc2-node/src/utils/metrics.ts` | **NEW** — counter + histogram registry | C |
| `pc2-node/src/runtime/telemetry-flusher.ts` | **NEW** — daily batch flusher | C |
| `pc2-node/src/api/chipotle-client.ts` | Instrumentation points (counter increments, histogram observations) | C |
| `pc2-node/src/api/media.ts` | Instrumentation points | C |
| `pc2-node/src/services/media/dashPackager.ts` | Instrumentation points | C |
| `pc2-node/src/api/storage.ts` | Instrumentation points | C |
| `pc2-node/src/services/wasm/WASMRuntime.ts` | Add `drain_events()` host glue | C-Rust |
| `pc2-node/data/test-apps/<settings-app>` | New "Health & Support" settings panel | A, B, C |
| `deploy/web-gateway/lib/support-relay.js` | **NEW** — `/api/support/*` endpoints | B |
| `deploy/web-gateway/lib/telemetry-relay.js` | **NEW** — `/api/telemetry/ingest` endpoint | C |
| `deploy/web-gateway/index.js` | Wire the two new modules into dispatch | B, C |
| `wasm-crates/pc2-telemetry-shared/` | **NEW** — shared Rust telemetry crate | C-Rust |
| `wasm-crates/cenc-decrypt/` (and 4-7 others) | Instrumentation via `with_telemetry!` macro | C-Rust |
| `.github/workflows/triage-reports.yml` | **NEW** — polls supernodes + creates issues | B |
| `docs/security/SUPPORT_PRIVACY_POLICY.md` | **NEW** — public-facing privacy policy | B (pre-ship) |

## Files to Create

(Subset of above; flagged for clarity)

- `.cursor/tasks/T-1-TELEMETRY-AND-SUPPORT-V1280/T-1-TELEMETRY-AND-SUPPORT-V1280.md` (this doc)
- `pc2-node/src/api/diagnostic.ts`
- `pc2-node/src/utils/redactor.ts`
- `pc2-node/src/runtime/relayer-signer.ts`
- `pc2-node/src/api/report.ts`
- `pc2-node/src/utils/metrics.ts`
- `pc2-node/src/runtime/telemetry-flusher.ts`
- `deploy/web-gateway/lib/support-relay.js`
- `deploy/web-gateway/lib/telemetry-relay.js`
- `wasm-crates/pc2-telemetry-shared/Cargo.toml` + `src/lib.rs`
- `.github/workflows/triage-reports.yml`
- `docs/security/SUPPORT_PRIVACY_POLICY.md`

---

## Testing Strategy

### Unit tests

- [ ] `diagnostic.ts` — every check produces correct output for happy + degraded + failed states (mock the network/IPFS/WASM)
- [ ] `redactor.ts` — wallet-redaction is byte-exact; IP masking handles IPv4 + IPv6; KID hashing is deterministic; full-bundle regex sweep catches synthetic PII
- [ ] `relayer-signer.ts` — message-signing produces same output as Sigauth; ephemeral key persists across restart within TTL; runtime signer takes priority over env over ephemeral
- [ ] `report.ts` — bundle build with all toggles off vs all on; redaction is enforced; preview matches submission byte-for-byte
- [ ] `metrics.ts` — counters increment correctly; histograms preserve percentiles; flush serialises and clears atomically

### Integration tests

- [ ] T-1A E2E: spin up a local supernode mock + Lit Action mock, run `runDiagnostic()`, assert each check returns expected status
- [ ] T-1B E2E: submit a report, verify it lands on the supernode, verify GitHub Action creates issue, verify DELETE removes it
- [ ] T-1C E2E: instrument 100 calls into chipotle-client, verify daily flush ships them, verify supernode SQLite contains the right rows

### WASM tests

- [ ] `pc2-telemetry-shared` — ring buffer overflows correctly; thread-local isolation works; macro expands without stomping locals
- [ ] Instrumented `cenc-decrypt` produces start/end events on success; produces error event on bad input; produces panic event on malformed segment

### Manual security verification

- [ ] Submit a report with all "include extra" toggles off; verify preview screen byte-for-byte matches what arrives at the supernode
- [ ] Submit a report with all toggles on; verify the additional fields appear and are correctly attributed to the user's choice
- [ ] DELETE a report; verify GitHub issue is auto-closed via API call from the workflow
- [ ] Run telemetry for 24h with anonymous mode; verify no wallet, IP, or KID surfaces in any SQLite row
- [ ] Sweep `/etc/pc2/reports/` and `/etc/pc2/telemetry.db` for PII patterns; expect zero matches

---

## Acceptance Criteria

- [ ] T-1A "Run Diagnostic" button shows pass/fail tree with timings for all checks
- [ ] T-1A diagnostic completes in under 5 seconds in the success case
- [ ] T-1B "Send Report" preview shows byte-for-byte what's submitted
- [ ] T-1B reports persist with `mode 0640`, owner `pc2-gateway`, in `/etc/pc2/reports/<ticket>.json`
- [ ] T-1B GitHub Action creates one issue per report within 15 minutes
- [ ] T-1B DELETE works end-to-end: user revokes, supernode removes, GitHub issue auto-closes
- [ ] T-1C telemetry flush is daily, jittered, retries on failure
- [ ] T-1C SQLite contains only counters/histograms/cohort_id/version — no wallet, IP, KID, or asset identifier in any row
- [ ] First-run dialog appears once and never again, regardless of user choice
- [ ] Settings toggles for both T-1B and T-1C respect default-off; "consent" requires an explicit click
- [ ] WASM telemetry events surface in JS host ring buffer for at least `cenc-decrypt`, `cenc-encrypt`, and one IPFS-related crate
- [ ] Privacy policy doc is published at `https://docs.ela.city/security/SUPPORT_PRIVACY_POLICY.md` (or equivalent) before T-1B ships
- [ ] Sasha confirms first-run dialog copy + redaction defaults
- [ ] No PII regex passes through redactor in 1000+ randomly-generated test bundles

---

## Re-sequencing notes — what changes for the Chipotle relayer (formerly v1.2.8.0, now v1.2.9.0)

This task claims the v1.2.8.0 release slot. The Chipotle relayer task at `.cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/` is bumped to v1.2.9.0 with the following implications:

| What | Before (C-2 first) | After (T-1 first) | Net effect |
|---|---|---|---|
| `relayer-signer.ts` | Built fresh in C-2 | Built in T-1 (B-2); C-2 imports unchanged | Wash — same code, different release |
| TLS pinning (P-1 from C-2 audit) | Inside C-2 | **Lifted into T-1** (T-1B's supernode endpoint needs it too) | T-1 ships P-1; C-2 inherits |
| Per-wallet rate limiting infrastructure | Built in C-2's `lit-relay.js` | **Lifted into T-1** as a shared module `deploy/web-gateway/lib/wallet-rate-limit.js`; both `support-relay.js` and the future `lit-relay.js` import it | DRY win |
| SIWE nonce store | C-2 only | T-1's `support-relay.js` ships its own; C-2 reuses | Light duplication initially; consolidate in v1.3 cleanup |
| C-1 (`usageKey` rotation) | Mandatory before C-2 | **Still mandatory before T-1** (T-1's supernode endpoint co-deploys with the rotation; clean restart) | No change to security posture |
| Production observability of C-2's rollout | None | **Full** — T-1C tells us if Tier-0 is being hit, what the fall-through rates are, where it's failing | Strict win on rollout safety |

**Concretely, after T-1 ships, the C-2 promote checklist shrinks**:
- ✂ "Implement secp256k1 helpers" (now in T-1)
- ✂ "Implement TLS pinning / cert verification" (now in T-1)
- ✂ "Implement per-wallet rate limiting" (now in T-1's shared module)
- ✓ Remaining: implement `recoverPersonalSign()` on the supernode; implement `_forwardToChipotle()`; wire routes into `index.js`; paste the Tier 0 fragment into `chipotle-client.ts`; ship as v1.2.9.0

**Estimated calendar impact**:
- T-1 first: ~5-8 weeks for T-1, then ~1 week for C-2 (it's been pre-staged) = **~6-9 weeks total**
- C-2 first: ~2 weeks for C-2, then ~5-8 weeks for T-1 = **~7-10 weeks total**

T-1-first is faster *and* gives us telemetry coverage during C-2's rollout. Net win.

---

## Notes

### Pre-task action items (do BEFORE this task starts)

1. **C-1 (`usageKey` rotation)** — manual, Sasha + Irzhy. Independent of this task but a hard prerequisite for the supernode HTTPS surface change.
2. **Sasha sign-off on the Privacy Policy section** above. Without this, B and C don't ship.
3. **Decide on triage repo location** (Open Question #1).

### Why this is its own release (v1.2.8.0, not folded into v1.2.7.x)

- Scope is too large for a patch release (~2,500 LOC, ~5-8 weeks).
- Includes UI surface area (Settings panel) and external infrastructure (GitHub Action, supernode endpoints) — feature work, not patches.
- Privacy review needs to be visible in the release notes and CHANGELOG.

### Why this *isn't* v1.3

- v1.3 should be a coherent feature/architectural milestone (Anders' convergence work, the Service-manifest extension for ENM, etc.). Don't dilute it.
- v1.2.x cadence is already established as "frequent, small-to-medium feature releases." T-1 fits cleanly there.

### What this enables for v1.3+ (longer-term)

- Once telemetry has 30+ days of baseline data, A/B-test future PC2 changes against pre-change cohorts (e.g. "did the new IPFS resolver actually reduce p99 fetch latency?")
- Per-channel diagnostic ("is THIS channel's playback failing more often than baseline?") becomes possible once we have aggregate data
- Sovereignty story strengthens: "T-1 is opt-in by default; you can route reports to your own URL; no telemetry without your consent"
- Anders' Runtime convergence has an obvious slot for capability-gated telemetry (capsule-emitted events flow through the same pipe; relayer-style trust boundaries apply)

### Existing infrastructure we leverage

- **`pc2-node/src/utils/logger.ts`** — winston-style logger. T-1A's diagnostic test runner reads from it; T-1B's report bundler reads the last N lines.
- **Settings UI** — already exists. T-1A/B/C add a single new panel.
- **Supernode SIWE pattern** — being scaffolded in C-2's `lit-relay.js`; T-1B promotes the signer module first.
- **`deploy/web-gateway/lib/provisioning-token.js`** — existing pattern for module structure under `deploy/web-gateway/lib/`. Both `support-relay.js` and `telemetry-relay.js` mirror its shape (self-contained module, exported class + helpers).
- **`UpdateService.ts`** — already does anonymous polls of GitHub releases API; T-1C's flusher follows the same shape (daily, no auth, retry on failure).

### Operational runbook stub

When T-1 ships:

1. Deploy `support-relay.js` and `telemetry-relay.js` to both supernodes
2. Co-deploy with C-1 (`usageKey` rotation) — same restart window
3. Create the `Elacity/pc2-support` private GitHub repo
4. Configure the `triage-reports.yml` workflow with bearer token from supernode
5. Post the privacy policy doc publicly
6. Push v1.2.8.0 PC2 release with the new Settings panel
7. Watch the first 7 days of telemetry uptake (T-1C opt-in rate is a brand-health signal)

---

*End of T-1-TELEMETRY-AND-SUPPORT-V1280.md*
