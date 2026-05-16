# Footprint + Refactor Baseline (Phase 1)

**Captured**: 2026-05-16, on `feat/t-1-telemetry-and-support` @ commit `cd737bec7`, working tree clean for measurement purposes.

**Scope**: pure measurement. No code changes. This document is the as-of-today snapshot we'll measure improvements against in Phase 2 (post-Mac launcher release).

**Methodology**:
- Disk sizes via `du -sh`.
- Dependency tree depth via `npm ls <pkg>`.
- Unused deps via `depcheck` (devDep, version pinned in root).
- Code duplication via `jscpd` (devDep, version pinned in root).
- Measurement run on Mac (Node 20.19.0, npm 10.x, fresh `npm install` not forced — measured against the current on-disk state).

**A note on interpretation**: depcheck and jscpd produce raw findings. Each "unused" dependency must be manually verified before removal because depcheck can't see dynamic `require()`, npm scripts referencing tools, or runtime feature flags that gate imports. Each duplicate must be evaluated for whether DRY-ing it actually improves the codebase. Treat the numbers below as a starting point for investigation, not a removal checklist.

---

## 1. Top-level footprint

| Path | Size | Notes |
|---|---|---|
| **Repo total** (`.`) | **20 GB** | Includes `node_modules`, `pc2-node/data` (local user data), `.git`, all build artefacts. **What ships to users is a small fraction of this** — see §5. |
| `node_modules` (root) | 2.0 GB | Build/runtime deps for the launcher GUI + backend |
| `pc2-node/node_modules` | 609 MB | Build/runtime deps for the PC2 node Node.js server |
| `pc2-node/data` | 2.4 GB | **Local user data only — never shipped** (caches, IPFS blockstore, downloaded apps, etc.) |
| `pc2-node/bin` | 249 MB | Bundled transport binaries (wg, awg, wireguard-go, bash, for ARM64/x86_64 × Linux/macOS) — these DO ship |
| `packages/` | 79 MB | `particle-auth` and similar workspace sub-packages |
| `pc2-node/frontend` | 46 MB | Built frontend bundle that pc2-node serves |
| `src/gui/dist` | 18 MB | Launcher GUI build output |
| `pc2-node/dist` | 7.3 MB | pc2-node TypeScript→JS build output |

**Headline**: the *development* footprint is ~3 GB once you exclude `pc2-node/data` and `.git`. The *shipped* footprint is much smaller and is what we care about for users — see §5.

## 2. Top dependencies by disk size — root `node_modules`

Ordered descending. Most are direct or transitive Web3 / wallet / UI dependencies.

| Package | Size | Direct or transitive? | Used by |
|---|---|---|---|
| `@lit-protocol` | 281 MB | Direct | Lit Action signing for dDRM |
| `@opentelemetry` | 279 MB | Mostly transitive | OTel auto-instrumentation pulled in by some dep — **worth investigating** if 279 MB of telemetry SDK is justified |
| `@reown` | 235 MB | Transitive via wallet stack | WalletConnect / Reown |
| `@walletconnect` | 80 MB | Transitive | Same stack |
| `antd` | 58 MB | Direct | Launcher GUI component library |
| `viem` | 51 MB | Direct | Ethereum RPC client |
| `@ant-design` | 42 MB | Companion to antd | Icons, charts, etc. |
| `pdfjs-dist` | 37 MB | Direct (suspect — only used in a few places?) | PDF rendering — investigate if used outside one feature |
| `@particle-network` | 33 MB | Direct (via packages/particle-auth) | Particle Network social auth |
| `@aws-sdk` | 29 MB | Transitive | Particle Network's `auth-core` pulls in `@aws-sdk/credential-providers` |
| `lottie-web` | 25 MB | Direct | Animations |
| `@napi-rs` | 25 MB | Transitive (image processing) | Sharp / canvas alternatives |
| `dprint-node` | 24 MB | Direct | Formatter (dev/lint use only) |
| `date-fns` | 24 MB | Direct | Date utilities — likely we use 5-10 functions out of 200+ |
| `typescript` | 23 MB | devDep | Compiler — dev only |

**Trace verified for `@aws-sdk`**:
```
elastos-desktop@1.2.7.14
└─┬ demo-lite-particle-ee@0.0.0 -> ./packages/particle-auth
  └─┬ @particle-network/connectkit@2.1.3
    └─┬ @particle-network/auth-connectors@2.1.1
      └─┬ @particle-network/authkit@2.1.1
        └─┬ @particle-network/auth-core@2.1.1
          └── @aws-sdk/credential-providers@3.971.0
```
We cannot directly remove `@aws-sdk/credential-providers` because it's pulled by a Particle Network package. Phase 2 options: vendor a patch via `pnpm overrides` / `npm overrides` if it's actually a soft optional, or upstream a PR to Particle Network if it's a real dependency that could be made optional.

## 3. Top dependencies by disk size — `pc2-node/node_modules`

Ordered descending. pc2-node is a Node.js server — most surprising findings are **here**, not in the GUI.

| Package | Size | Direct or transitive? | Notes |
|---|---|---|---|
| `react-native` | **83 MB** | **Transitive — pulled in via WebRTC IPFS transport** | We are a Node.js server. We do not use React Native. **High-priority Phase 2 investigation.** Trace: `helia → @libp2p/webrtc → react-native-webrtc → react-native`. If we don't use the WebRTC IPFS transport (we use TCP), we can disable it and drop ~85 MB + significantly speed up CI install. |
| `viem` | 52 MB | Direct | Ethereum RPC, used. Duplicated with root's viem 51 MB (different installs, same package) — workspace hoisting could de-duplicate but our monorepo doesn't currently. |
| `pdfjs-dist` | 37 MB | Direct | Duplicated with root's pdfjs-dist 37 MB |
| `@libp2p` | 35 MB | Direct | IPFS / libp2p stack, used |
| `@photostructure` | 28 MB | Direct | EXIF reader (for uploaded media metadata) |
| `@napi-rs` | 25 MB | Direct | Native image processing |
| `typescript` | 23 MB | devDep | Dev only |
| `@react-native` | 19 MB | Transitive (with react-native) | Companion bloat |
| `react-devtools-core` | 16 MB | Transitive | Should ideally be devDep — pulled in via react-native |
| `@img` | 15 MB | Direct | Image processing |
| `ox` | 14 MB | Transitive | viem's lower-level deps |
| `openai` | 12 MB | Direct | AI provider SDK, used |
| `@babel` | 12 MB | Transitive | Build tooling |
| `ipfs-webui` | 11 MB | Direct | **Flagged as unused by depcheck** — needs manual verification |
| `@google` | 11 MB | Direct | Likely `@google/generative-ai` for Gemini |

**Headline**: ~120 MB of bloat in pc2-node coming from a transitive React Native dependency we don't use, and possibly an unused `ipfs-webui` (11 MB) flagged by depcheck.

## 4. Unused dependencies (depcheck output)

`depcheck` produces these as best-effort static analysis. False positives are common — each must be manually verified before removal. **Listed for investigation, not for immediate action.**

### Root `package.json`

**dependencies** flagged unused:
- `@aws-sdk/client-secrets-manager` — directly declared at root level (separate from the transitive @aws-sdk noted above). Why?
- `@aws-sdk/client-sns` — same question.
- `@google/genai` — possibly an older Gemini binding; we may have migrated to a different package name.
- `@heyputer/putility`
- `@paralleldrive/cuid2`
- `@stylistic/eslint-plugin-js`
- `express-xml-bodyparser`
- `ioredis` — Redis client. Do we use Redis anywhere?
- `javascript-time-ago`
- `json-colorizer`
- `open` — common false positive (used for opening URLs from CLI)
- `string-template`

**devDependencies** flagged unused:
- `chalk`
- `clean-css`
- `cross-env` — **false positive** (we just added this, it's used inside npm scripts which depcheck doesn't scan)
- `html-entities`
- `html-webpack-plugin`

### `pc2-node/package.json`

**dependencies** flagged unused:
- `@helia/strings`
- `@libp2p/mplex`
- `@libp2p/noise`
- `@wasmer/wasmfs`
- `cors` — likely used at the framework level somewhere depcheck can't see
- `ipfs-webui` — **11 MB; if confirmed unused, easy win for Phase 2**
- `tweetnacl-util`

**devDependencies** flagged unused:
- `@types/cors` — false positive (companion to `cors` which itself is suspect)

## 5. Shipped vs developed footprint

What developers see vs what users install are very different. Approximation:

| Artefact (shipped to users) | Size |
|---|---|
| `pc2-node/dist` (compiled JS) | 7.3 MB |
| `pc2-node/frontend` (built UI bundle) | 46 MB |
| `pc2-node/bin` (transport binaries) | 249 MB |
| Launcher app bundle (signed .dmg) | TBD — pull from latest `Elacity/elastos-launcher` release |
| **Estimated total user install size** (before downloaded `node_modules` + downloaded transport binaries — those come post-install) | ~300 MB launcher + grows with use |

**Phase 2 question to answer**: what is the actual size of the latest signed `.dmg` users download? Pull from the most recent launcher release. Compare against the launcher's CHANGELOG entries — has it grown linearly with releases? That's the real "footprint trajectory" measurement.

## 6. Code duplication (jscpd output)

Scanned `pc2-node/src` (272 files, 82,580 LOC).

| Metric | Value |
|---|---|
| Exact clones | 214 |
| Duplicated lines | 2,700 |
| Duplication % | 3.27% |
| Healthy benchmark | <5% is good, <10% acceptable, >15% problematic |

**Verdict**: pc2-node/src duplication is well within healthy bounds. No major DRY refactor is needed.

**Notable individual duplicates** (top by lines):

| Lines | Files | Action |
|---|---|---|
| 75 | `OpenAIProvider.ts` (internal repetition) | Single file likely has copy-pasted retry / streaming logic. Worth a small refactor. |
| 74 | `mp4split.ts` (internal repetition) | Same observation — internal copy-paste. |
| 51 | `OpenAIProvider.js` ↔ `XAIProvider.js` | **Cross-file duplication** — XAI is OpenAI-compatible, so providers share a lot. Phase 2: extract a base class / shared utility (~10% LOC saving). |
| 45 | `OpenAIProvider.ts` ↔ `XAIProvider.ts` | Same as above, TypeScript half. |
| 36 | `AgentMemoryManager.ts` ↔ `VectorMemoryStore.ts` | Shared memory abstraction — could extract common interface. |

**Estimated effort to bring duplication from 3.27% → <2%**: 1 day (extract OpenAI/XAI base provider + AgentMemory/VectorMemory shared interface). Low priority given the absolute number is already small.

## 7. Specific Phase 2 candidates (for the post-Mac release roadmap)

Listed in rough order of return-on-effort. **All require manual verification before action.**

1. **Drop react-native transitive bloat** (~85 MB pc2-node footprint reduction). Pin/disable `@libp2p/webrtc` if we're not using the WebRTC IPFS transport, OR override `react-native-webrtc` to a lighter shim. Verification: check whether anywhere in pc2-node actively constructs a WebRTC `Libp2p` transport.
2. **canvas@2.x → @napi-rs/canvas migration** (already on the existing Phase 2 todo list). Drops 12 MB per install + the CI Cairo/Pango system-libs install step. Tied to A-8 fix from yesterday.
3. **`ipfs-webui` removal if confirmed unused** (~11 MB pc2-node).
4. **Investigate `@aws-sdk/client-secrets-manager` + `@aws-sdk/client-sns`** in root deps (depcheck flagged unused). If genuinely unused, remove (saves part of the 29 MB AWS SDK footprint — the transitive `credential-providers` would still remain via Particle).
5. **Investigate `@opentelemetry` 279 MB** in root. We don't (yet) emit OTel traces from production code — possibly pulled in by a tool we use. Worth a `npm ls @opentelemetry/api` to find the source.
6. **Audit `date-fns` usage** — if we use <20 of its 200+ functions, switch to tree-shakable imports or replace with bespoke utilities (~15-20 MB potential).
7. **Extract OpenAI/XAI provider base class** (1 day of work, ~100 LOC of duplication removed, makes adding new providers easier).
8. **Consolidate viem + pdfjs-dist between root and pc2-node** via workspace hoisting. Currently each has its own copy. Effect on shipped size is small (pc2-node still ships pc2-node's copy) but improves dev install time.

## 8. Phase 2 timing + sequencing

Per the constraint set by the user:
- Mac launcher releases Wed/Thu next week (v1.2.8.0 + launcher).
- **Phase 2 cannot start until that release ships and is stable**.
- Phase 2 work must NOT regress the Mac release. Each Phase 2 change should be on its own commit, with the smoke test green, ideally tested on a fresh Mac VM before merging.

Recommended Phase 2 order:
1. canvas migration (low risk, well-scoped, removes a CI step that's slowing every run).
2. react-native transitive bloat investigation (single npm tree change once we confirm we don't use the transport).
3. Verify + remove the depcheck-flagged unused deps one at a time, each behind its own PR.
4. The duplication refactors (lowest urgency, do alongside other feature work).

The depcheck + jscpd run should be re-measured after each Phase 2 step so we can show the trajectory in the next baseline doc (Phase 2 close-out).

---

## Document metadata

- **Source of truth**: this file.
- **Tied to**: `.cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/OPTIMISATION-AND-REFACTORING-2026-05.md`
- **Re-measurement schedule**: after each Phase 2 step, write a delta block at the bottom of this file (don't replace the baseline).
- **Tools used (devDeps, pinned in root `package.json`)**: `depcheck@^1.4.7`, `jscpd@^4.2.2`.
