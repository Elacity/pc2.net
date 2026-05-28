# Phase 4 — Client-Side Wiring of Backend Selection

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Depends on**: Phase 3
**Status**: Planned

## Objective

Thread the `backend: 'js' | 'wasm'` selector through the two client-side entry points that initiate sessions — `ddrm-viewer` (PDF/EPUB) and `pc2-media-runtime` (video). Gate the WASM choice behind a build flag; default remains `'js'` until Phase 5 flips it.

## Steps

### 4.1 — `pc2-secure-view.js` (frontend + wallet-bridge)

Existing `bootstrap()` calls `/lit/begin-session` with the canonical payload. Extend to accept a `backend` arg:

```js
function bootstrap({ backend = 'js' } = {}) {
  const payload = canonicalize({
    ownerAddress,
    backend,                  // included in signed canonical payload
    ttl: TTL_SECONDS,
    // ...existing fields...
  });
  // wallet personal_sign over payload, POST to /lit/begin-session with { ..., backend, signature }
}
```

`signRequest({ refresh, backend })` and `runSessionFlow(opts)` both accept and forward `backend`. Persist `backend` in the IndexedDB token record alongside `sessionId` so re-bootstraps remember the prior choice.

Update both source-of-truth files:
- `pc2-node/src/wallet-bridge/pc2-secure-view.js`
- `pc2-node/frontend/pc2-secure-view.js`

Bump cache-buster `?v=20260528a`.

### 4.2 — `ddrm-viewer` (PDF/EPUB)

```js
// data/test-apps/ddrm-viewer/viewer.js  AND  the installed-apps copy
const SECURE_VIEW_BACKEND = window.__PC2_DDRM_BACKEND__ ?? 'js';   // build-flag injection
const { token, sessionId } = await pc2_secureView_sign({ backend: SECURE_VIEW_BACKEND });
```

Set `window.__PC2_DDRM_BACKEND__` from a build-time env / query param. For testing, expose as a URL flag: `?ddrm-backend=wasm`.

### 4.3 — `pc2-media-runtime` (video)

Same pattern as 4.2 for `data/test-apps/pc2-media-runtime/player.js` and the installed-apps copy.

### 4.4 — Logging

Server-side: log the backend choice on session creation at info level. Client-side: log the backend in the secure-view init banner. This makes A/B testing legible.

```
[BackendSessionService] created session sess-abc backend=wasm owner=0xdeadbeef…
```

## Verification

- Load PDF with `?ddrm-backend=js` → existing JS flow.
- Load PDF with `?ddrm-backend=wasm` → WASM flow, server log confirms backend=wasm.
- Bootstrapping with `wasm` then page reload → session resurrects through WASM lookup; if Node was restarted, falls back to fresh bootstrap as designed.

## Exit criteria

- Both backends selectable via URL flag in dev.
- Default remains `'js'`.
- Cache-busters bumped; both source-of-truth files in `wallet-bridge/` and `frontend/` synced.
