# Task: DOCKERFILE-REHAB-V1280 — fix 4 Dockerfile bugs caught by docker-smoke

**Task ID**: `DOCKERFILE-REHAB-V1280`
**Created**: 2026-05-18
**Status**: **InProgress** — executing in same session as CI-HARDENING-A4-D1
**Priority**: Medium (Docker deployment shape only; does not block Mac launcher)
**Predecessor**: `CI-HARDENING-A4-D1` (added the docker-smoke job that surfaced these bugs)

---

## Why this exists

The docker-smoke CI job introduced 2026-05-18 by `CI-HARDENING-A4-D1` caught 4 Dockerfile bugs that would hit every supernode operator running `docker build -t pc2-node . -f pc2-node/Dockerfile && docker run pc2-node` from current `main`. Bug 1 was fixed in `CI-HARDENING-A4-D1` (Go 1.22→1.24). This ticket addresses bugs 2-5.

## Bug catalog with diagnoses

### Bug 2: Config file copy path is wrong (BOOT-BLOCKING)

**Symptom** (from CI log):
```
[ERROR] ❌ Failed to load configuration: Error: Default config not found: /app/config/default.json
    at loadDefaultConfig (/app/src/config/loader.ts:147:15)
[PC2] exit code=1
```

**Root cause**: 
- `pc2-node/src/config/loader.ts:139` defines `DEFAULT_CONFIG_PATH = join(__dirname, '../../config/default.json')`, so at runtime with `__dirname = /app/src/config`, the loader expects `/app/config/default.json`.
- The Dockerfile line 119 copies from the WRONG location: `COPY --from=builder /app/config ./config` — this is the BUILDER's `/app/config/`, which after `COPY . .` (line 77) is the host's repo-root `/config/` directory. That directory only contains `pc2.json.example` and `pc2.production.json` — NO `default.json`.
- The actual `default.json` file lives at `pc2-node/config/default.json` (host) → `/app/pc2-node/config/default.json` (builder).

**Fix**: Change `COPY --from=builder /app/config ./config` → `COPY --from=builder /app/pc2-node/config ./config`.

**Severity**: Boot-blocking. This is why every docker-smoke run was failing to reach healthy.

---

### Bug 3: WASM apps not copied to production image

**Symptom** (from CI log):
```
[WARN] [DASHPackager] WASM preload skipped: cenc-encrypt WASM not found
[WARN] [media-api] mp4-split WASM preload skipped
[WARN] [media-api] WASM preload skipped: CENC decrypt WASM not found
```

**Root cause**: 
- The 7 `.wasm` binaries ARE committed to git at `pc2-node/wasm-apps/*/*.wasm` (8MB total across cenc-decrypt, cenc-encrypt, ddrm-renderer, mp4-split, ipfs-assemble, evm-multicall, amm-engine).
- The Dockerfile never copies them to the production image. Net result: dDRM features (encrypt/decrypt), media segmentation (mp4-split), and AMM operations all fall back to inferior paths or fail.

**Fix**: Add `COPY --from=builder /app/pc2-node/wasm-apps ./wasm-apps` in the production stage.

**Severity**: Functional degradation (warnings + fallback paths used). Not boot-blocking — server still starts.

**Note**: We do NOT run `pc2-node/scripts/build-wasm.sh` in the Dockerfile because that requires Rust toolchain + cargo + wasm-opt (binaryen) which would add ~200MB to the build stage. Since `.wasm` files are committed to the repo as pre-built artifacts, copying is the right pattern.

---

### Bug 4: `sharp` native binding not found in production stage

**Symptom** (from CI log):
```
[ERROR] [Thumbnail] ❌ Sharp failed to load - image thumbnails will be disabled
[ERROR] [Thumbnail] This is a required dependency. Please reinstall: npm install
```

**Root cause**: classic `npm/cli#4828`. The `pc2-node/package-lock.json` was generated on macOS-arm64 (Sasha's dev machine), so it ONLY contains:
- `@img/sharp-darwin-arm64`
- `@img/sharp-libvips-darwin-arm64`

NO linux/musl variants are recorded in the lockfile. When `npm ci` runs on alpine/linux in the Dockerfile builder stage, it strictly follows the lockfile and silently skips the linux variants. Sharp's runtime probe then fails to find a native binding for the current platform.

This is a well-known npm bug: https://github.com/npm/cli/issues/4828

**Fix**: After `npm ci`, force-install platform-specific variants with `--include=optional`:
```dockerfile
RUN cd pc2-node && npm install --no-save --include=optional sharp
```

`--no-save` means don't modify `package.json` or `package-lock.json`. The install runs sharp's `install/check.js` post-install hook which detects the current platform (alpine/linux/musl/x64) and downloads the right `@img/sharp-linuxmusl-x64` + `@img/sharp-libvips-linuxmusl-x64` prebuilt binaries.

**Severity**: Functional degradation (image thumbnails disabled). Not boot-blocking — fallback paths exist.

---

### Bug 5: `@napi-rs/canvas` native binding not found

**Symptom** (from CI log):
```
Warning: Cannot load "@napi-rs/canvas" package: "Error: Cannot find native binding..."
Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
[WARN] [Thumbnail] ⚠️  Canvas not available - PDF/text thumbnails will be disabled
```

**Root cause**: Same `npm/cli#4828` bug as #4. Lockfile only has `@napi-rs/canvas-darwin-arm64`, no `@napi-rs/canvas-linux-x64-musl` variant.

**Fix**: Same pattern — force-install with `--include=optional`:
```dockerfile
RUN cd pc2-node && npm install --no-save --include=optional @napi-rs/canvas
```

**Severity**: Functional degradation (PDF/text thumbnails disabled). Not boot-blocking.

**Note**: Legacy `canvas@2.x` is also a fallback target listed in `optionalDependencies`. It needs Cairo/Pango system deps for alpine build-from-source, which would add ~50MB to the image. Since `@napi-rs/canvas` (prebuilt-only) supersedes it, we DO NOT add Cairo/Pango. The Thumbnail service already has graceful degradation when neither canvas variant loads — log shows "PDF.js loaded ✅" as primary path.

---

## Implementation plan

Three Dockerfile changes, all in `pc2-node/Dockerfile`:

1. **After `RUN cd pc2-node && npm ci --include=dev`** (around line 74): Add new RUN step that force-installs sharp + @napi-rs/canvas with `--include=optional` to fix bugs 4 + 5 (npm/cli#4828 workaround).

2. **Replace `COPY --from=builder /app/config ./config`** (line 119) with `COPY --from=builder /app/pc2-node/config ./config` to fix bug 2.

3. **Add new COPY** for `wasm-apps` to fix bug 3.

All changes are inline-documented with the specific bug class and CI evidence.

## Acceptance criteria

- [ ] `pc2-node/Dockerfile` modified per implementation plan
- [ ] CI docker-smoke job reaches `healthy` HEALTHCHECK state
- [ ] No `[ERROR]` lines in the container boot log (warnings about legacy `canvas@2.x` are acceptable)
- [ ] `/api/health` responds with `status: "ok"` from outside the container via port mapping
- [ ] Updated `.cursor/tasks/RELEASE-ENGINEERING-V1280/CI-HARDENING-A4-D1.md` to mark bugs 2-5 as RESOLVED with reference to this ticket

## What this is NOT

- NOT promoting docker-smoke to a required gate. That requires 3 consecutive green runs and is tracked separately.
- NOT re-enabling `pc2-node-docker.yml` publish-to-GHCR workflow. That's a deferred decision pending supernode operator audience growth.
- NOT migrating canvas@2.x → @napi-rs/canvas in source code. That's Phase 2 work tracked in OPTIMISATION-AND-REFACTORING-2026-05.

## Execution log

(To be filled in during execution.)
