# Task: ENM release prep (staged — NOT live)

**Task ID**: ENM-RELEASE-PREP
**Created**: 2026-06-26
**Status**: Review (prep complete; flip deferred to version launch)
**Priority**: High

## What this is
Everything needed to make Elastos Node Manager installable in the PRODUCTION
dApp Centre, prepared so launch is a copy-paste — WITHOUT putting a broken app
in front of users before the runtime ships.

## Why ENM can't go live ahead of the version (the coupling)
The catalog entry is just a pointer. ENM's install + run depends on pc2-node
changes that exist ONLY on `feature/elastos-node-manager`, NOT in production:
- same-origin app-backend proxy (`static.ts`)
- service-app Ed25519 install gate + per-arch variant resolver
- `AppProcessManager` absolute DB/config path injection
- doubled-Authorization-header fix
- dApp Centre icon (`iconDataUrl` → `builtInIcon`) + real download progress

Flip the catalog live before deploying this pc2-node and EVERY user gets the
"ENM backend unavailable" error + placeholder icon. So: deploy runtime first,
then flip.

## Done now (safe — nothing served to users)
- [x] Official bundles built FROM CI (run 28216945441, both arches), signed with
      the stable Elacity Labs key via `PC2_ENM_SIGNING_SEED`. Includes the
      api.js proxy fix (postdated the prior main-built artifacts).
- [x] Pinned both tarballs to the supernode IPFS (recursive). Content available.
- [x] Assembled the complete production registry entry → `enm-registry-entry.staged.json`.

## Hard data (verified)
| Field | Value |
|---|---|
| version | 0.5.249 |
| publisher (signedBy) | `1ab060ba7578261355504300c1193c484ed8a46a30499c3fa3cb9065930367eb` |
| x64 CID | `bafybeifxo36g4oylmkv7lq4sppq6vsalyg3honwe367owibktqy6iy22mi` (size 5,817,936) |
| arm64 CID | `bafybeida6gpbbhaq2yd2nektksr6h7grfn3tztbex5mbtqbmbelfrmbbeq` (size 5,793,217) |
| platform gate | os linux; arch x64+arm64; minMemoryMB 4096 (macOS/Windows excluded) |
| trusted-publisher env | host must set `PC2_TRUSTED_SERVICE_PUBLISHERS` to include the publisher hex |

## Flip-to-live procedure (run AT launch, in order)
1. Deploy the new pc2-node (this branch) + new app-center + GUI bundle to the
   supernode and any production hosts. Confirm `version` and that
   `PC2_TRUSTED_SERVICE_PUBLISHERS` includes the publisher hex above.
2. Insert `enm-registry-entry.staged.json` into the production registry source
   served by the `:4500` registry service (primary 69.164.241.210, secondary
   38.242.211.112 — update BOTH).
3. Verify: `curl http://127.0.0.1:4500/api/registry/apps` lists ENM; a PC2 node
   shows it in the dApp Centre with the real purple icon; install on an x64 and
   an arm64 host both succeed and the backend comes up.

## Optional pre-launch teaser (safe)
Add the entry now with `registry.status: "coming_soon"` instead of "available"
— visible but NOT installable. Only do this once you're comfortable showing it.

## Notes
- The staged entry's signatures bind the BUNDLE BYTES (CI manifest `cid` is empty
  by design); the CID is whatever the content pins to. Verified the pinned CIDs
  match the bytes signed by CI.
- Per-app `iconDataUrl` for the OTHER 6 live apps is still a follow-up content
  task so they show real logos once the new app-center is live.
- Temp CI trigger was added and reverted (commits on branch); do not re-add.
