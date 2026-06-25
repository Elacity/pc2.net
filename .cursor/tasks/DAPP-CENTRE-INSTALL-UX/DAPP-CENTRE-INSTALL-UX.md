# Task: dApp Centre install UX — pre-install icons + real download progress

**Task ID**: DAPP-CENTRE-INSTALL-UX
**Created**: 2026-06-25
**Status**: Review
**Priority**: Medium

## Description
Two platform-wide dApp Centre UX gaps surfaced while testing the ENM install on
the Jetson:

1. **No real app icon before install.** Store cards render a `gradient + category
   glyph` placeholder; the real bundle logo only appears after install. Every
   installable app is affected.
2. **Install progress feels stuck.** The progress bar jumps 5% → (stuck for the
   whole download) → 100%, with no sense of where it's at.

## Background / root cause (from code reading)
- **Icon**: `registryAppToCatalog` (`src/backend/apps/app-center/index.html`)
  only sets `icon` (a glyph key) + `gradient`. The renderer (`getCardIconHtml`,
  `getStaffPickIconHtml`) already renders a real image via `app.builtInIcon`
  (a `data:` / `https:` / `/…` URL) with the `.has-img` treatment — that's how
  INSTALLED apps show their logo. Registry entries simply never carry an image.
- **Progress**: the whole pipeline already exists and is deployed —
  `AppInstallService.install(manifest, cid, onProgress)` emits stage events,
  the install route bridges them to Socket.io `install:progress`, `UIDesktop.js`
  forwards them to iframes as `apps:installProgress`, and app-center already
  consumes them via `updateInstallProgress`. THE GAP: `install()` calls
  `fetchFromIPFS(effectiveCid)` **without** an `onProgress`, so during the
  download (the long part) nothing is emitted — the bar holds at 5% until the
  fetch completes and it jumps to `verifying, 55`. `IpfsService.pinRemoteCID`
  already supports `{ onProgress }` (used by ContentSeedingService).

## Requirements
- Store cards + staff-pick + install modal show the real app logo BEFORE install
  when the catalog entry provides one (`iconDataUrl`).
- The install bar moves during the download, showing a real % and MB counter.
- No regression for apps without an icon (fall back to gradient+glyph).
- Backend change limited to threading progress; no change to the security gates
  (signature verify, platform gate, owner gate) — out of scope per security.mdc.

## Implementation Plan
- [ ] Backend: `AppInstallService.fetchFromIPFS(cid, onProgress?)` → pass
      `onProgress` to `pinRemoteCID`. In `install()`, compute `totalBytes` from
      the resolved variant/`manifest.distribution.size` and emit
      `('fetching', 5..55 scaled, { bytesReceived, totalBytes })`.
- [ ] Frontend: `registryAppToCatalog` sets `builtInIcon` from
      `app.iconDataUrl` (or `app.icon` when it's already a URL). Verify
      `mergeApps` preserves it for not-installed apps.
- [ ] ENM private catalog (Jetson test): embed `iconDataUrl` (data-URI of
      `assets/icon.svg`) on the ENM entry.
- [ ] Deploy app-center + rebuilt backend to Jetson; user verifies icon shows
      pre-install and the bar fills during download.

## Files to Modify
- `pc2-node/src/services/AppInstallService.ts` (thread onProgress)
- `src/backend/apps/app-center/index.html` (builtInIcon from iconDataUrl)
- Jetson private `jetson-catalog.json` (ENM iconDataUrl) — test-only

## Out of scope / follow-up
- Adding `iconDataUrl` to every app in the PRODUCTION `_index.json` (content
  task at release time so all apps show real icons in the live catalog).
- Byte progress only streams on the gateway fetch path; pure bitswap discovery
  latency stays coarse (acceptable — small bundles, and the stage text is
  honest).

## Notes
- All changes deploy to the Jetson via the established loop (app-center copy +
  `npm run build:backend` + `pm2 restart pc2`). app-center is NOT part of the
  heavy GUI webpack bundle, so it deploys cleanly.
- Nothing pushed to `main` or the production registry.
