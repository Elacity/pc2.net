# Phase 2-Globals — proposed release-notes copy

> This is the changelog copy for v1.2.8.0 (or whichever release ships Phase 2-Globals). Drop into the appropriate `CHANGELOG.md` section when the release is being assembled — do not paste prematurely; the release-manager owns the full v1.2.8.0 entry assembly.

---

## Bug fix — resource-limit settings now correctly applied

PC2 has had endpoints for several releases allowing operators to configure their node's resource limits via the API or Settings UI:
- `storage_limit` (e.g. `"auto"`, `"100GB"`, `"unlimited"`) — POST `/api/storage/limit` and POST `/api/resources/limits`
- `max_concurrent_wasm` (1-32 parallel WASM executions) — POST `/api/resources/limits`
- `max_memory_mb` (auto, 256, 512, 1024, 2048, 4096, 8192, or custom ≥128) — POST `/api/resources/limits`
- `wasm_timeout_ms` (1000-300000 ms) — POST `/api/resources/limits`

**The bug**: writes to these endpoints persisted to the local database correctly, but on every subsequent read (e.g. `GET /api/info`, `GET /api/resources`), the values were silently ignored — the system fell back to `config.json` defaults or hardcoded defaults. The "Database settings override config file" code comment in the affected files was inaccurate.

**Root cause**: a pre-existing latent bug where the helper used to obtain the database handle in `api/resources.ts` and `api/supernode.ts` (`getDb()`) returned an ambient `(global as any).db` that was never set anywhere in the codebase. All `db?.getSetting(...)` calls in those files returned `undefined`, masked by the optional-chaining fallthrough.

**Fix**: the broken helpers were removed and replaced with explicit `req.app.locals.db` lookups (the established Express pattern already used elsewhere in pc2-node). Db-persisted resource settings are now correctly read on every subsequent request.

**What this means for existing users**:
- If you've never used `/api/storage/limit` or `/api/resources/limits` to set non-default values: **no change in behavior**. Defaults continue to apply.
- If you previously set a non-default value via the API and were surprised it didn't seem to take effect — that wasn't your imagination; the fix makes your saved setting work correctly on next request.
- One caveat: WASM compute settings (`max_concurrent_wasm`, `max_memory_mb`, `wasm_timeout_ms`) are read at WASM-runtime initialization, which happens once at PC2 startup. To apply newly-set compute limits, restart PC2. (Storage settings take effect on the next API request, no restart required.)

## Architecture — `(global as any).X` ambient-state cleanup

PC2's pc2-node Express service has historically used a few `(global as any).X` properties to share state across modules. As preparation for capsule-based deployment on the ElastOS Runtime, these were audited and cleaned up:

- `(global as any).pc2Config` — vestigial mutable cache. Removed entirely; readers now use the canonical `req.app.locals.config` (the loaded `Config` object) and `req.app.locals.db` for user-set overrides.
- `(global as any).db` — latent bug, fixed (see above).
- `(global as any).__filesystem` — retained as a deliberate defensive fallback for the Drivers tool-execution critical path (in case `app.locals.filesystem` is somehow missing); both sites are now explicitly commented to document the intent.
- `(global as any).ipfsStorage` — consumer purged from `api/supernode.ts`; the single-write at bootstrap (`pc2-node/src/index.ts`) is preserved as a legitimate startup-time exposure for non-Express callers.

These changes are internal refactors with no API contract change. They reduce architectural coupling and prepare pc2-node modules for eventual migration into the Runtime's capsule architecture.

## Compatibility

- No API contract changes. All endpoints return the same response shapes as before.
- No config file changes required.
- No data migration required.
- The bug fix begins applying immediately upon upgrade — saved resource-limit settings start taking effect on next request (for storage) or next restart (for compute).
