# Legacy artifacts

This directory holds files preserved for **audit trail purposes only**. Nothing in `legacy/` is referenced by any active build, test, or release process.

## `Dockerfile.upstream-puter`

**Origin**: This was the root `Dockerfile` in this repository from the upstream Puter fork through 2026-02-03. It was last meaningfully touched in December 2025 and has been progressively diverging from how Elacity actually builds and ships PC2.

**Why retired (2026-05-18)**:

1. **Outdated identity** — the file's own labels still point at `LABEL repo="https://github.com/WAUIO/pc2.net"` (pre-fork upstream) and `LABEL version="1.2.47-elastos-1"` (a versioning scheme we abandoned long before v1.2.7.x).
2. **Wrong Node version** — uses `node:23.9-alpine`. Elacity standardized on Node 20.x months ago (see `pc2-node/package.json` `engines.node: ">=20.18.0"` and `.github/workflows/smoke-test.yml` `node-version: '20.x'`).
3. **Wrong build target** — invokes `npm run build` at repo root, which is the original Puter build command. Elacity's build chain is `npm run build:pc2` (particle-auth → src/gui → pc2-node backend). The two produce different outputs.
4. **Self-documenting status** — line 4 of the file itself reads: *"Many of the developers DO NOT USE the Dockerfile or image."*
5. **CI failed repeatedly** — the `docker-image.yaml` workflow that referenced this file failed all 3 of its last 3 runs in February 2026 before being disabled.

**Canonical replacement**: `pc2-node/Dockerfile`. That file is a properly engineered multi-stage build maintained alongside the rest of pc2-node, currently CI-tested by `.github/workflows/smoke-test.yml` (`docker-smoke` job).

**If you need to reproduce the upstream Puter container**: clone the original upstream at `https://github.com/HeyPuter/puter` and use its Dockerfile there. The version this file targeted (`1.2.47-elastos-1`) is essentially a snapshot of upstream Puter ~1.2.47 with minor Elacity-specific patches that have long since been superseded.

**Decision audit trail**: see `.cursor/tasks/RELEASE-ENGINEERING-V1280/CI-HARDENING-A4-D1.md` for the full context behind retiring this file and the broader CI-hardening sprint that triggered the cleanup.
