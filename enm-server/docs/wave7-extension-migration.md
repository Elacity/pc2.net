# Wave 7 — Hybrid capsule migration plan

**Status:** v0.3, post-critique. Replaces the original "collapse `enm-server`
into PC2 image" plan after a 20-agent review surfaced fatal architectural
issues with that approach (in-process capability enforcement is theatre;
forcing ENM on every PC2 operator is the wrong default; one-consumer
infrastructure is bad cost ratio). The new plan ships ENM as a publishable
**hybrid capsule** through the dApp Centre — opt-in install, publisher-
signature trust, `ela` binary fetched post-install. The ENM port plan
itself (services + routes migration, auth swap, frontend URL flip) is
unchanged from the original Wave 7 — only the deployment shape differs.

**Owner:** ElacityLabs (publisher key, dApp Centre UI, revocation transport).
**First consumer:** ENM v0.5+. Format generalises to any future PC2 app
that needs a privileged backend (Bitcoin node manager, storage daemon, etc.).

---

## Background

PC2 today distinguishes two app shapes that don't compose:

- **Apps** (`type: "web" | "wasm" | "data" | "microvm" | "agent"`):
  sandboxed iframes, installable through dApp Centre, distributed as
  tar.gz on IPFS by CID, signed Ed25519. Cannot spawn processes, hold
  long-lived state, or run privileged code. Manifest validated by
  `pc2-node/src/services/AppInstallService.ts`.
- **Extensions:** privileged Node code that runs in PC2's main process.
  Loaded only at boot from the `extensions/` directory. **No package
  format, no version field, no registry, no install API, no consent
  flow, no signature.**

ENM needs both halves: a UI (`src/backend/apps/elastos-node-manager/`)
and a privileged backend (`enm-server/`, ~50 files spawning the `ela`
binary, holding a keystore, running an RPC client). Today the backend
ships as an external Docker container.

The **original Wave 7** plan moved that backend into PC2's `extensions/`
directory inside the PC2 container image. That solved the "lone
snowflake" problem but forced node-manager code on every operator
regardless of whether they'd use it. **This v0.3 plan instead packages
the same code as a publishable hybrid capsule** distributed through the
dApp Centre — operators who want ENM install it; operators who don't,
don't carry the bytes.

---

## Trust model — stated honestly upfront

Hybrid capsules ship with **publisher-signature trust, not in-process
capability enforcement.** The Ed25519 signature on the bundle is the
security boundary. Once a capsule is installed, its backend half runs
as trusted PC2 code with full host privileges. Capabilities declared in
the manifest are **disclosure**, not enforcement — they tell the
operator what the publisher *says* the code does, surfaced at consent
time. The operator's decision to install is a decision to trust the
publisher.

Why this is acceptable for v1: Node has no robust in-process capability
primitives. PC2 loads extensions via `require()` in its main process —
shared V8 isolate, shared module cache, shared globals. Wrapping
`child_process.spawn` or `fs.write` is bypassable in seconds
(`process.binding`, fresh `import()` after cache deletion,
`process.dlopen` to load arbitrary native code, etc.). Pretending
otherwise would *manufacture trust* the platform can't deliver — worse
than no enforcement.

What this requires:

- ElacityLabs as the sole publisher in v1. The registry binds
  `(name → ElacityLabs-controlled key set)`. Third-party publishers are
  deferred until per-extension subprocess isolation lands (v2).
- Real revocation infrastructure — see Lifecycle § Revocation.
- Honest consent UI that doesn't promise enforcement (see below).

The consent screen reads:

> **Elastos Node Manager** is published by **ElacityLabs** (key `7f3a…`).
>
> Once installed, this app runs as trusted code on your PC2 with full
> host privileges. The publisher states it will:
> - run `ela` and `ela-cli` to operate a node
> - read and write inside `data/installed-apps/elastos-node-manager/state/`
> - listen on TCP ports 20336, 20338
> - download an `ela` binary (~40 MB) from `download.elastos.io` after install
>
> Installing means trusting ElacityLabs. PC2 will not prevent this code
> from doing more than it claims; revoking the publisher's signature is
> the only way to block future updates.
>
> [Cancel] [Install]

No wallet signing — the existing PC2 owner-session via `requireOwner`
middleware authorises (per the wallet-identity-only invariant in
`enm-server/src/auth/OwnerCheckMiddleware.js:30-43`).

---

## Naming

PC2 already standardises on "capsule" (V1.2 roadmap, `create-elacity-capsule`,
`apps.ela.city`). Adopting that vocabulary:

- **capsule** — the package (tar.gz on IPFS by CID, signed Ed25519)
- **hybrid** — new `kind` value for capsules with both frontend + backend
- **frontend** / **backend** — the two halves (`app/`, `backend/`)
- **capabilities** — declared advisory disclosure, not enforced allow-list
- **publisher** — the Ed25519 identity in `signedBy`

---

## Manifest schema

```json
{
  "name":    "elastos-node-manager",
  "version": "0.5.0",
  "kind":    "hybrid",
  "channel": "stable",
  "engines": {
    "node": ">=20 <23",
    "pc2":  "^1.2"
  },
  "frontend": {
    "entry": "app/index.html"
  },
  "backend": {
    "path":          "backend/",
    "needsRestart":  false,
    "schemaVersion": 1,
    "dataDir":       "data/installed-apps/elastos-node-manager/state/",
    "shutdownTimeoutMs": 30000,
    "capabilities": {
      "spawnProcesses": ["ela", "ela-cli"],
      "filesystem": {
        "read":  ["data/installed-apps/elastos-node-manager/state/**"],
        "write": ["data/installed-apps/elastos-node-manager/state/**"]
      },
      "ports":   { "tcp": [20336, 20338], "publish": true },
      "env":     ["PATH", "HOME", "LANG"],
      "imports": ["service:database", "service:audit"]
    }
  },
  "assets": [
    {
      "id":        "ela-binary",
      "url":       "https://download.elastos.io/ela/0.9.9.5/ela-0.9.9.5-linux-x64.tgz",
      "mirrors":   ["ipfs://bafy…"],
      "sha256":    "abc123…",
      "signature": "<ed25519 sig over sha256>",
      "arch":      "linux-x64",
      "sizeBytes": 41943040,
      "fetchOn":   "install",
      "extractTo": "data/installed-apps/elastos-node-manager/bin/"
    }
  ],
  "distribution": {
    "cid":             "bafy…",
    "mirrors":         ["https://download.elastos.io/ext/0.5.0.tar.gz"],
    "manifestDigest":  "<sha256 of canonicalised manifest>",
    "signature":       "<ed25519 sig over manifestDigest>",
    "signedBy":        "<32-byte ed25519 publisher pubkey>"
  }
}
```

The signature commits to a canonicalised hash that includes `name`,
`version`, `kind`, `capabilities`, `assets[].sha256`, `cid`, and
`signedBy`. Capabilities cannot be swapped post-sign.

Capsule contents:

```
elastos-node-manager-0.5.0.tar.gz
├── app.json
├── app/         ← iframe frontend
└── backend/     ← Node.js backend, vendored node_modules/
```

---

## Hard rules for v1

Per `child_process.spawn`/postinstall/native-module attack-surface
findings:

- **No `postinstall` / `preinstall` lifecycle scripts** in
  `backend/package.json`. Publish-time linter rejects the bundle.
- **No native `.node` modules.** Pure JS only. (Avoids ABI fragility
  across Node versions and avoids the `dlopen` arbitrary-code path.)
- **No remote code execution.** `eval`, `Function()`, dynamic
  `import()` of remote URLs all banned.
- **Vendored `node_modules/` only** — no `npm install` on first boot.
  Network failure mid-install would violate atomicity.
- **Bundle size cap stays 100 MB.** Large binaries fetch separately
  via `assets[]`.

---

## Lifecycle

### Install (no PC2 restart)

The key UX win: **install is a pure file operation.** No restart, no
interruption to other apps. Achieved via lazy-load: PC2 records the
route registry entry on install, but the backend's `require()` doesn't
fire until the first request hits one of its routes.

1. Operator clicks **Install** in dApp Centre.
2. PC2 fetches the manifest, verifies `manifestDigest` signature
   against `signedBy`. Cross-checks `signedBy` against the registry-
   bound `(name → ElacityLabs-controlled key set)`. Rejects unknown
   publishers.
3. PC2 fetches the bundle from `cid`, with HTTP `mirrors` fallback.
   Streams to disk with `Range` retry. Verifies CID matches.
4. PC2 runs preflight:
   - `HostConflictScanner.scan({ ports: capabilities.ports.tcp })` —
     refuses install on collision (reuses
     `enm-server/src/services/HostConflictScanner.js`)
   - Reserved-ports denylist (22, 80, 443, 5353, etc.)
   - Reserved-paths denylist (`data/wallets/`,
     `data/installed-apps/<other>/`, …) and `dataDir` canonicalised +
     macOS-normalised
   - `engines.pc2` and `engines.node` range checks
   - Bare `docker run` / dev-mode detection: emits warning if no
     supervisor present; install proceeds because
     `needsRestart: false`
5. **Consent screen** (text above) renders the disclosure.
6. Atomic two-target extraction: `app/` →
   `data/installed-apps/<name>/`, `backend/` → `extensions/<name>/`.
   Either both land or neither does.
7. If `assets[].fetchOn === "install"`, fetch + verify those next.
   Per-asset signature chained from manifest signature. Streaming-to-
   disk with `Range` retry. Show progress in dApp Centre UI.
8. **Pre-load probe**: PC2 forks a child process, requires the new
   `extensions/<name>/`, runs its `init` hook with a 30s timeout. If
   the probe throws or times out, install rolls back (delete files,
   no registry entry, surface error).
9. PC2 writes the route registry entry: routes under `/api/<name>/*`
   are now mapped to this extension, **but the extension itself isn't
   loaded yet**. First matching request triggers `require()` + `init`
   in the main process, with a one-time ~500ms-2s latency. All
   subsequent requests dispatch normally.
10. dApp Centre shows the capsule in the launcher. Done. Other apps
    unaffected throughout.

### Update (brief restart window in v1)

Updates do require a restart in v1 — hot-reloading already-loaded
backend code reliably needs the per-extension subprocess model
deferred to v2. Updates are operator-initiated and infrequent, so the
cost is bounded.

1. Same fetch + verify flow as install.
2. **Capability diff: cumulative against first-installed version**,
   not previous. Defends against salami-slice attacks where each
   release adds one capability hoping operators click through.
3. If new capability set ⊄ first-installed set, queue notification
   "Update needs new permissions — review" instead of auto-installing.
4. **24-hour cooling-off**: capability expansions can't auto-update;
   operator must approve.
5. `schemaVersion` change triggers extension's `migrate(oldVersion,
   newVersion)` hook before the new code loads.
6. Restart sequence:
   - Broadcast `pc2:restarting { etaSeconds: N, cause: "update:..." }`
     over SSE + WS to every connected client (5s grace window)
   - Stop accepting new HTTP connections
   - 10s drain window for in-flight requests; after that, 503 +
     `Retry-After`
   - SSE: PC2's hub persists a 200-event ring buffer per topic,
     indexed by monotonic `Last-Event-ID`. Browsers reconnect after
     restart with the header set; missed events replay
   - WebSocket sessions: typed close frame `(1012, "service-restart")`.
     Client libraries reconnect
   - `process.exit(0)`. Supervisor (compose `restart: unless-stopped`
     or pm2) brings PC2 back
7. After three crash-on-boot loops, supervisor flips a safe-mode flag
   (`PC2_DISABLE_EXTENSIONS=1`) and surfaces the broken capsule in
   dApp Centre for manual quarantine.

### Uninstall (no PC2 restart if extension cooperates)

1. Stop the backend's lifecycle hooks; call its `shutdown()` hook
   with a `shutdownTimeoutMs` (default 30s) deadline.
2. If the extension didn't declare a `shutdown()` hook or it hangs,
   force-terminate after timeout. Resources may leak until next
   restart but the extension is gone.
3. Remove `extensions/<name>/`, `data/installed-apps/<name>/`, fetched
   `assets/`.
4. **Default = keep `dataDir`.** Operator opts in to delete via a
   clear prompt: "Delete saved state? This will erase your encryption
   keys, keystore, and ~80 GB of chain data. ENM cannot recover them
   after deletion."
5. No restart needed. Other apps unaffected.

### Revocation

Revocation transport: **signed JSON manifest hosted at a well-known
supernode URL** (`https://registry.ela.city/revocations.json`) with
ETag polling hourly. Format:

```json
{
  "version": 7,
  "updatedAt": "2026-05-10T12:00:00Z",
  "revocations": [
    {
      "publisherKey": "<32-byte ed25519 hex>",
      "reason": "key compromised",
      "revokedAt": "2026-05-10T11:42:00Z"
    }
  ],
  "signature": "<ed25519 sig over canonical (revocations[], version, updatedAt)>",
  "signedBy": "<revocation-root pubkey>"
}
```

- PC2 fetches this on every install + once per hour
- Signed by a separate **revocation root key** (ElacityLabs cold-stored,
  one-of-N multisig recommended for production)
- If a `signedBy` for an installed capsule is revoked, dApp Centre
  shows a red banner ("Publisher key revoked — uninstall recommended"),
  refuses any update from that publisher, but does **not**
  auto-uninstall (operator decision)

Simpler than IPNS or transparency-log infrastructure for v1, since
ElacityLabs is the sole publisher. Migrate to a transparency log if
and when third parties join.

---

## Distribution + assets

`assets[]` is the answer to the 100 MB cap problem — the bundle stays
small, large binaries fetch separately:

- Each asset is independently signed by the publisher key (chained
  from the manifest signature)
- Per-arch entries; install picks the matching `arch` from
  `os.arch() + os.platform()`
- `fetchOn: "install"` blocks install completion; `"first-run"` defers
  to first launch (with a UI loading state)
- IPFS mirrors supplement HTTP — same CID verification
- PC2 announces fetched bundles on its own DHT after install (so the
  capsule survives the publisher's seeder going down)
- Helia private-mode operators get the HTTPS path; Helia is not a
  hard install dependency

---

## ENM as the first consumer — port plan

The mechanical port from `enm-server/` to a publishable hybrid capsule
is the original Wave 7 work, mostly preserved.

### Capsule directory layout

```
elastos-node-manager-0.5.0/
├── app.json                 ← manifest (above)
├── app/                     ← src/backend/apps/elastos-node-manager/, copy as-is
│   ├── index.html
│   ├── css/
│   └── js/
└── backend/                 ← was enm-server/src/, restructured
    ├── package.json         { name, main: 'main.js', type: 'commonjs' }
    ├── main.js              extension entry (skeleton below)
    ├── node_modules/        vendored
    ├── services/            cp-only from enm-server/src/services/
    │   ├── ChainState.js, ChainRegistry.js, ElaMainChainAdapter.js
    │   ├── EnmBinaryDownloader.js, EnmBinaryLocator.js, EnmKeystoreService.js
    │   ├── EnmBposService.js, EnmConfigSchema.js, EnmConfigRedact.js
    │   ├── EnmDb.js, EnmEncryption.js, EnmAuditLog.js, EnmAuditMiddleware.js
    │   ├── EnmConstants.js, EnmRateLimit.js, EnmRpcClient.js
    │   ├── EnmSetupHelpers.js, EnmFormat.js, EnmProposalStore.js
    │   ├── ConfigStore.js, DataDir.js, Diagnostics.js
    │   ├── DiskPreflight.js, OsPreflight.js, ExtIpResolver.js
    │   ├── HealthChecker.js, HealthRules.js, HostConflictScanner.js
    │   ├── LogCompactor.js, NativeProcessService.js, ProcessLogStreamer.js
    │   ├── SelfHealingEngine.js, SseHub.js, SyncTracker.js
    │   ├── ClockSkewChecker.js, ChainAdapter.js, processUtils.js
    │   └── withChainLock.js
    └── routes/              adapted from enm-server/src/routes/
        ├── audit.js, chains.js, config.js, events.js
        ├── evm.js, healing.js, logs.js, setup.js
        └── system.js
```

`enm-server/scripts/install-enm.sh`, `enm-server/Dockerfile`,
`enm-server/src/server.js`, and `enm-server/src/auth/OwnerCheckMiddleware.js`
are deleted at cutover.

### main.js skeleton

```javascript
'use strict';

let chainRegistry = null;
let healthChecker = null;
let conflictScanner = null;
let logCompactor = null;
let auditLog = null;

extension.on('init', async () => {
    // 1. Initialise ENM's data dir + DB
    process.env.ENM_DATA_DIR = process.env.ENM_DATA_DIR
        || extension.dataDir();   // PC2-provided

    // 2. Boot ENM services in order (matches enm-server/src/server.js)
    const ChainRegistry = require('./services/ChainRegistry');
    const HealthChecker = require('./services/HealthChecker');
    const HostConflictScanner = require('./services/HostConflictScanner');
    const LogCompactor = require('./services/LogCompactor');
    const EnmAuditLog = require('./services/EnmAuditLog');

    auditLog = new EnmAuditLog({ logger: console });
    await auditLog.init();

    chainRegistry = ChainRegistry;
    await chainRegistry.init({ log: console, auditLog });

    healthChecker = new HealthChecker({ log: console, auditLog });
    healthChecker.start();

    conflictScanner = new HostConflictScanner({ log: console });
    conflictScanner.start();

    logCompactor = LogCompactor;
    logCompactor.startCron({ log: console });

    // 3. Process-level safety net
    process.on('uncaughtException', (err) => {
        console.error('[ENM] uncaughtException — swallowing:', err);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('[ENM] unhandledRejection — swallowing:', reason);
    });
});

extension.on('shutdown', async () => {
    if (healthChecker)   healthChecker.stop();
    if (conflictScanner) conflictScanner.stop();
    if (logCompactor)    logCompactor.stopCron();
    if (chainRegistry)   await chainRegistry.shutdown();
    if (auditLog)        await auditLog.close();
});

// Route registration — lazy-load triggers this on first matching request
require('./routes/health')(extension);
require('./routes/setup')(extension);
require('./routes/chains')(extension);
require('./routes/healing')(extension);
require('./routes/audit')(extension);
require('./routes/config')(extension);
require('./routes/logs')(extension);
require('./routes/system')(extension);
require('./routes/evm')(extension);
require('./routes/events')(extension);  // SSE
```

### Per-file migration

**Services (low touch — mostly cp).** Pure logic, no Express
dependency. 37 files copy as-is.

**Auth — replaced.** `OwnerCheckMiddleware.js` deleted. PC2's existing
`req.actor` / `req.user.wallet_address` populates the actor; routes
inline a check:

```javascript
extension.post('/api/enm/chains/:chainId/start', { subdomain: 'api' },
    async (req, res) => {
        if (req.user.wallet_address !== getOperatorWallet()) {
            return res.status(403).json({ error: 'owner_only' });
        }
        // ...handler...
    }
);
```

**Routes (medium touch).** Each route file's `function build(extensionHandle) { return router; }` becomes
`module.exports = function (extension) { extension.get(...) }`.
Three substantive changes per file:

1. `router.get/post(...)` → `extension.get/post('/api/enm/...', ...)`
2. `requireOwner` → inline operator check
3. `extensionHandle.log` → `console`

**server.js — DELETED.** Express bootstrap, `app.listen(4180)`, CORS,
DB schema init all gone. Schema init + cron start move into the
`init` lifecycle hook.

**SSE — needs adaptation.** `SseHub.js` writes SSE frames via Express's
`res` directly; that continues to work inside the extension. Set
`X-Accel-Buffering: no` explicitly to defeat any reverse-proxy
buffering. Frontend's `EventSource` URL changes from
`:4180/api/enm/events` to relative `/api/enm/events`.

### Frontend changes

- `js/services/api.js`: API base flips from
  `http://host:4180/api/enm` to relative `/api/enm`
- `js/services/sse.js`: same — relative EventSource URL
- `js/services/wallet.js`: drop the `:4180` fallback; use PC2's
  `/api/whoami`

That's it. No HTML/CSS/widget changes.

---

## PC2 platform work needed

Separate team. The capsule format is most of the work; the ENM port
is mechanical.

| Bucket | Days | Files |
|--------|------|-------|
| `app.json` schema extension (hybrid kind, capabilities, assets, engines) | 1 | `pc2-node/src/services/AppInstallService.ts` |
| Manifest-digest signing (vs bundle-bytes today) | 1 | same |
| Atomic two-target extraction | 2 | same |
| **Lazy-load extension loader** (route registry → on-demand `require`) | 3 | new `pc2-node/src/services/ExtensionLoader.ts` |
| Pre-load probe + crash-loop quarantine | 3 | new `pc2-node/src/services/ExtensionProbe.ts` |
| Asset fetch + per-asset verification | 2 | new `pc2-node/src/services/AssetFetcher.ts` |
| HostConflictScanner integration | 1 | reuse `enm-server/src/services/HostConflictScanner.js` |
| Reserved-paths + macOS canonicalisation | 1 | new path validator |
| Drain endpoint: SSE replay buffer + WS close-frame | 4 | `pc2-node/src/api/system.ts`, SSE hub, WS server |
| Publisher-key registry + revocation list + heartbeat | 4 | new infrastructure |
| Consent UI generated from capabilities + assets | 3 | dApp Centre |
| Update-time capability diff + cooling-off | 2 | |
| Schema-version migration hook | 1 | |
| Tests + docs | 3 | |
| **Subtotal** | **31 d** | |

---

## ENM port work

| Bucket | Days |
|--------|------|
| Mechanical port (server.js delete, route adapter, auth swap, frontend URL flip) | 2 |
| Bundle assembly + signing scripts (minimal test signing utility) | 0.5 |
| `app.json` + capabilities declaration | 0.5 |
| In-process test harness (fake `extension` global) | 2 |
| `shutdown()` hook implementation | 0.5 |
| Docs (architecture, operator runbook, install guide) | 1 |
| Buffer for SSE-through-proxy / lazy-load edge cases | 1.5 |
| **Subtotal** | **8 d** |

---

## Combined estimate

**~39 dev-days ≈ 8 calendar weeks with 2 engineers.**

Excludes production CI/release infrastructure (HSM, multi-sig
revocation root, GitHub Actions workflow, schema validator, build
pipeline) — deferred until the platform itself is proven prod-ready.
That's an additional ~4 days when the time comes.

---

## What v0.3 explicitly does NOT promise

- **Real capability enforcement.** Capabilities are disclosure for the
  operator, not a runtime guard. A malicious or compromised publisher's
  code can do anything PC2 can do. Revocation is the only mitigation.
- **Crash isolation between capsules.** A capsule crash that
  propagates to PC2's main process will take everything down. Pre-load
  probe + crash-loop quarantine bound the damage; per-extension
  subprocess is v2 work.
- **Hot-reload of updates.** Install is restart-free via lazy-load.
  Updates require a brief restart window (10-60s with drain logic).
  v2 subprocess model would allow rolling updates.
- **Multi-tenancy.** Capsules see one operator. Multi-wallet PC2
  deferred to v2.
- **Cross-platform.** Linux only at v1. macOS / Windows-via-WSL
  deferred.
- **Third-party publishers.** ElacityLabs only in v1. Opening up to
  third parties needs the subprocess isolation work first.

---

## Open items deferred until platform is proven prod-ready

These will come up before launch but don't block development:

1. **Production signing key infrastructure.** Where does the
   ElacityLabs publisher key live? HSM? AWS KMS? 1Password Connect?
   Must not be on a developer laptop. Cold storage for the revocation
   root key.
2. **CI/release pipeline.** Capsule build script + signing flow +
   IPFS publish + registry submission + GitHub Actions workflow.
3. **Capsule schema validator** as a standalone publish-time tool
   (catches malformed manifests before they ship).
4. **Multi-sig threshold for revocation root.** 2-of-3? Who holds
   the keys?
5. **dApp Centre UX details.** Asset-fetch progress bar, capability
   re-consent prompt, revocation banner styling.

For development phase, a minimal `make-test-capsule.sh` (~50 lines,
ElacityLabs dev key inline) is enough to exercise the install flow
end-to-end.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| `ela` child process crash takes down PC2 | Same as today (Node `child_process` doesn't bubble crashes). Plus `uncaughtException` + `unhandledRejection` handlers in main.js. |
| Memory leak in ENM logic accumulates inside PC2's heap | Clean up listeners on `extension.on('shutdown', ...)`. Set `NODE_OPTIONS=--max-old-space-size` if needed. |
| `better-sqlite3` ABI mismatch | v1 hard rule forbids native modules. ENM uses `better-sqlite3` today (`enm-server/src/services/EnmDb.js`). Decided during implementation: either switch to pure-JS SQLite (`sql.js` etc.) accepting a perf hit, or carve a narrow allow-list exception for widely-audited native modules. Not a blocker on the proposal. |
| SSE blocked by PC2's reverse proxy buffering | Set `X-Accel-Buffering: no` header on SSE responses. |
| First request after install is slow (lazy-load) | One-time ~500ms-2s. Acceptable. dApp Centre can pre-warm by hitting `/api/<name>/health` right after install. |
| Publisher key compromise | Revocation list + heartbeat + dApp Centre red banner. Real-world response time depends on how fast ElacityLabs notices and signs the revocation. |
| Bad capsule bricks PC2 boot loop | Pre-load probe in child process before files swap into place. Safe-mode boot flag. Auto-quarantine after 3 failures. |
| Operator on bare `docker run` (no supervisor) | `needsRestart: false` on hybrid capsules means install doesn't need restart at all. Updates emit warning "no supervisor detected — manual restart required after this update." |
| Healing engine fires F1 spuriously during install | Install doesn't restart PC2, so existing `ela` (if any) keeps running. F1 default-on; F2-F19 default-off (Wave 1 invariant) preserved. |

### Known platform-side gaps (must close before launch)

The 20-agent critique surfaced these as real issues PC2 doesn't solve
today; closing them is part of the 31-day platform budget:

- PC2's `POST /api/system/restart` has zero connection drain
- SSE has no replay buffer (Last-Event-ID generated, never honoured)
- WebSocket sessions get TCP-closed without `io.close()` or goodbye
- Helia DHT runs in client mode only; content never announced
- No publisher-key registry; current signature flow is self-attesting
- No revocation infrastructure of any kind

---

## Out of scope

Same as the original Wave 7 list, all v0.6+:

- node.sh BPoS commands beyond activate/update/compress (vote/stake/
  unstake/claim need user-supplied tx amounts; deferred to wallet-aware
  UI)
- CR member registration / activation
- Sidechain support (esc/eid/eco/pgp/pg/arbiter — adapter classes
  missing)
- Returning the friendly home view
