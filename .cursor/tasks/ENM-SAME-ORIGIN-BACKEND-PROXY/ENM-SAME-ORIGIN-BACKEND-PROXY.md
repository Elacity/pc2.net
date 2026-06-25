# Task: Same-origin reverse-proxy for service-app backends (ENM remote access fix)

**Task ID**: ENM-SAME-ORIGIN-BACKEND-PROXY
**Created**: 2026-06-25
**Status**: InProgress
**Priority**: High

## Description
Make PC2 service-app backends (starting with Elastos Node Manager / `enm-server`) reachable
from a browser that loads the GUI through a supernode domain (e.g. `https://zzz.ela.city`),
not only when the browser is on the same host as the node.

## Background
ENM ships a sidecar backend (`enm-server`) that listens on port `4180`. The ENM frontend
builds its API base as `<window.location.host>:4180/api/enm` (see
`src/backend/apps/elastos-node-manager/js/services/api.js` → `deriveBackendBase()`).

This works only when the browser shares a host with the node (`localhost:4180` reachable).
When the GUI is reached through the supernode domain, PC2's relay forwards **only the main
PC2 GUI port** — port `4180` is not forwarded and `zzz.ela.city:4180` is refused. Every ENM
request then hits the frontend's 10s timeout → "ENM backend unavailable / Request timed out".

Verified on the Jetson (2026-06-25):
- `enm-server` healthy on loopback: `GET 127.0.0.1:4180/api/enm/health` → `{"ok":true}`.
- `zzz.ela.city:4180` → connection refused from outside.
- GUI on `4200`, backend on `4180`; no Caddy/nginx block and no cloudflared tunnel — the
  domain reaches the Jetson via PC2's own relay, which forwards only the main port.

This affects every dApp Store user who reaches their node via a supernode domain, and the
same `host:port` pattern is shared with other service apps (e.g. dao-dashboard). It is a
release blocker for remote service-app access.

## Requirements
1. Add a same-origin reverse-proxy in pc2-node that forwards
   `/api/app-backend/:appName/*` → `http://127.0.0.1:<backendPort>/*`, where `<backendPort>`
   is the running service app's port (from `AppProcessManager.getStatus`).
2. Proxy must be transparent: forward method, `Authorization`/`Content-Type`/`Accept`,
   request body, and **stream** the response (must not buffer — ENM uses SSE for live data).
3. Only proxy installed service apps that are currently running; validate `appName`.
4. Target is loopback only (`127.0.0.1`); never an arbitrary host.
5. Change ENM `deriveBackendBase()` to use the same-origin proxy path so it rides the relay.
6. No new npm dependency (use Node's built-in `http`).

## Implementation Plan
- [ ] pc2-node: import `http`; add `handleAppBackendProxy` + register `app.all('/api/app-backend/:appName/*', …)` in `static.ts` before the static wrapper.
- [ ] ENM frontend: `deriveBackendBase()` → `location.origin + '/api/app-backend/elastos-node-manager/api/enm'` (with `root.ENM_BACKEND_BASE` override hook).
- [ ] Build pc2-node (tsc) and deploy to Jetson; patch the installed bundle's `api.js`; restart pc2.
- [ ] Verify ENM startup diagnostic passes and live data loads via `zzz.ela.city`.
- [ ] Document the repackage + re-sign + re-pin of the ENM bundle (frontend fix) as the final pre-release step.

## Acceptance Criteria
- Opening ENM from the dApp Centre via `https://zzz.ela.city` completes the startup
  diagnostic (no "backend unavailable") and shows live node data.
- `GET https://zzz.ela.city/api/app-backend/elastos-node-manager/api/enm/health` → `{"ok":true}`.
- SSE/live updates still stream (response not buffered).
- No direct dependency on port `4180` reachability from the browser.

## Files to Modify
- `pc2-node/src/static.ts` — add same-origin app-backend proxy.
- `src/backend/apps/elastos-node-manager/js/services/api.js` — same-origin base.

## Files to Create
- This task doc.

## Testing Strategy
- Manual: reload ENM via `zzz.ela.city` on the Jetson, confirm diag passes + data loads.
- curl the proxied health endpoint through the public domain.
- Confirm an SSE endpoint stays open (live peer/height updates tick).

## Second bug found during testing — ENM session DB path (fixed)
After the proxy fix, authenticated ENM calls 401'd ("Authentication required"). Root cause:
`AppProcessManager` injected `PC2_NODE_DB_PATH`/`PC2_NODE_CONFIG_PATH` using a hard-coded
`/data` default and the wrong filename (`pc2-node.sqlite`), and even when derived from
config the path was **relative** (`./data/pc2.db`) — spawned services run with
`cwd=bundleDir`, so the relative path resolved against the wrong dir and ENM's
`OwnerCheckMiddleware.getDb()` threw "DB not found", silently returning null → 401.

Fix:
- `DatabaseManager.getDbPath()` getter added.
- `AppProcessManager` now injects `PC2_NODE_DB_PATH = resolvePath(db.getDbPath())` (absolute)
  and `PC2_NODE_CONFIG_PATH = <dbDir>/node-config.json`. Verified: `whoami` → 200,
  `isOwner: true` for the node owner through the proxy.

Files: `pc2-node/src/storage/database.ts`, `pc2-node/src/services/AppProcessManager.ts`.

## Notes
- Scope: branch only. Do NOT push to `main`.
- The proxy is generic (`:appName`) so it also fixes other same-pattern service apps.
- Security: app routing only (not in the dDRM/session security checklist). Loopback target,
  appName-validated, running-service-only. ENM enforces its own owner auth behind the proxy.
