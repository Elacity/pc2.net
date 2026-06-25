# ENM dApp Release Playbook (multi-arch)

> STATUS: STAGED / HELD. Everything here is prepared on the integration branch.
> Nothing is pushed to `main`, IPFS, or the supernodes until the other release
> tie-ups are done and you give the go-ahead. This document is the exact,
> ordered command sequence for when that happens.

The Elastos Node Manager (ENM) ships as a `type: service` dApp. Because its
backend bundles the native module `better-sqlite3`, it is distributed as **two
per-arch capsules** (`linux-x64`, `linux-arm64`) folded into a single registry
entry via `distribution.variants`. The installer picks the capsule matching the
host's own architecture, so:

- Linux x64 VPS supernodes -> `linux-x64`
- Jetson / Raspberry Pi (arm64) -> `linux-arm64`
- macOS / Windows -> blocked in the dApp Centre ("Not compatible with this device")

---

## Release notes draft (ENM v0.5.x)

New:
- Elastos Node Manager available in the dApp Centre for Linux PC2 hosts.
  Run and self-heal an Elastos mainchain node for BPoS supernode / CR Council
  operators, with guided setup, identity management, and live health.
- Multi-architecture: native builds for x64 and arm64. Jetson and Raspberry Pi
  (64-bit) are first-class targets alongside x64 servers.
- Device-compatibility gating: apps can declare `requirements.platform`; the
  dApp Centre shows "Not compatible with this device" instead of letting an
  install fail, and pc2-node enforces the same check at install time.

Hardening (shipped earlier on this branch):
- Service-type installs now fail closed unless the bundle's Ed25519 signature
  verifies against a trusted publisher (was warn-only).

---

## One-time prerequisites

1. CI signing secret (GitHub repo settings -> Secrets -> Actions):
   - `PC2_ENM_SIGNING_SEED` = the 64-hex Ed25519 seed, i.e. the contents of
     `~/.elastos/keys/elacity-labs.ed25519`. This is the Elacity Labs publisher
     key; its public half is `1ab060ba7578261355504300c1193c484ed8a46a30499c3fa3cb9065930367eb`,
     which is the trusted publisher in `pc2-node/registry/v1.2/_index.json` and
     must be in `PC2_TRUSTED_SERVICE_PUBLISHERS` on each PC2 host.
   - NEVER commit the seed. The CI workflow writes it to a `0600` file and
     passes it via `PC2_SIGNING_SEED_FILE`.

2. PC2 hosts that should offer ENM must have the publisher trusted:
   ```
   PC2_TRUSTED_SERVICE_PUBLISHERS=1ab060ba7578261355504300c1193c484ed8a46a30499c3fa3cb9065930367eb
   # then restart pc2-node
   ```

---

## Build the two capsules (CI)

The build is per-arch and MUST run on a host of that arch (native better-sqlite3).
`.github/workflows/build-enm-bundle.yml` already does this via a matrix:

- Push tag `enm-v<version>` (or run the workflow manually). It builds on
  `ubuntu-latest` (x64) and `ubuntu-24.04-arm` (arm64), signs both with the
  seed secret, and uploads two artifacts:
  - `elastos-node-manager-<ver>-linux-x64`  -> `.tar.gz` + `.json`
  - `elastos-node-manager-<ver>-linux-arm64` -> `.tar.gz` + `.json`

Local alternative (only if you have a real Linux host of each arch — a macOS
build would bake a darwin binary and is refused by the packager):
```
PC2_SIGNING_SEED_FILE=~/.elastos/keys/elacity-labs.ed25519 \
  node pc2-node/scripts/package-app.mjs --arch x64     # on a linux-x64 host
PC2_SIGNING_SEED_FILE=~/.elastos/keys/elacity-labs.ed25519 \
  node pc2-node/scripts/package-app.mjs --arch arm64   # on a linux-arm64 host
```

---

## Pin + assemble + publish (when released)

Download both artifacts (the two `.tar.gz` + their `.json` fragments) to your
laptop, then:

1. Pin each tarball to IPFS and capture the per-arch CIDs. The supernode kubo
   daemon is the pinning home; doing `ipfs add` ON the supernode makes the bytes
   local and pins them in one step:
   ```
   # on EACH supernode (InterServer + Contabo — pin sets are per-daemon):
   X64_CID=$(ipfs add -Q --cid-version=1 elastos-node-manager-<ver>-linux-x64.tar.gz)
   ARM_CID=$(ipfs add -Q --cid-version=1 elastos-node-manager-<ver>-linux-arm64.tar.gz)
   ```
   (Capture the CIDs from the primary; they are content-addressed so identical
   on both supernodes.)

2. Fold the two fragments + CIDs into one `_index.json` entry with variants:
   ```
   node deploy/app-registry/scripts/assemble-enm-entry.mjs \
     --x64-manifest   elastos-node-manager-<ver>-linux-x64.json   --x64-cid   "$X64_CID" \
     --arm64-manifest elastos-node-manager-<ver>-linux-arm64.json --arm64-cid "$ARM_CID" \
     --dry-run     # inspect first; drop --dry-run to write _index.json
   ```

3. Sync into the supernode catalog and deploy:
   ```
   node deploy/app-registry/scripts/sync-from-pc2.mjs        # _index.json -> registry.json
   bash deploy/app-registry/scripts/deploy.sh                # push registry.json to supernodes
   ```

4. Make the bytes durable: append BOTH ENM CIDs to the `V12_CIDS` array in
   `deploy/app-registry/scripts/install-pinning.sh` and re-run it on each
   supernode (idempotent), OR rely on the `ipfs add` in step 1 having pinned
   them locally already:
   ```
   ssh root@<supernode> 'bash -s' < deploy/app-registry/scripts/install-pinning.sh
   ```

5. Verify end-to-end: open the dApp Centre on an x64 PC2 and on the Jetson; ENM
   should show Install on both (each pulling its own arch's capsule) and "Not
   compatible" on a Mac.

---

## Rollback

- Each supernode keeps `registry.json.bak-<ts>` (deploy.sh). To revert the
  catalog, restore the backup and re-run the mirror sync.
- Unpinning is safe: `ipfs pin rm <cid>` on each supernode, then `ipfs repo gc`.
- The signed capsules are immutable (content-addressed); rolling back is purely
  a catalog operation.
