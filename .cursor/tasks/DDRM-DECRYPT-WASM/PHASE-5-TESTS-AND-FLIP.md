# Phase 5 — Tests + Flip Default to `'wasm'`

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Depends on**: Phases 0–4
**Status**: Planned

## Objective

Establish parity + safety tests for the WASM backend, then flip the default to `'wasm'` once green.

## Steps

### 5.1 — Rust unit tests (already in Phase 0; tighten coverage)

Add fuzz-style negative tests:
- Truncated envelopes → `BadEnvelope`.
- Envelope with wrong signature → `BadSignature`.
- `request_decrypt_chunk` past TTL → `RequestExpired`.
- `session_lookup` with unknown id → returns 0 (not found).
- 1024 sessions created in sequence — no handle collisions; memory growth bounded.

### 5.2 — TS unit tests (`pc2-node/src/services/wasm/__tests__/WasmDdrmDecryptRuntime.test.ts`)

Use `vitest` or whatever is configured (check `package.json`):

```ts
describe('WasmDdrmDecryptRuntime', () => {
  it('loads once and caches the instance', async () => {
    const rt = WasmDdrmDecryptRuntime.get();
    await rt.ensureLoaded();
    const first = (rt as any).exports;
    await rt.ensureLoaded();
    expect((rt as any).exports).toBe(first);
  });

  it('rejects sha256 mismatch', async () => {
    // mock capsule.json with wrong sha
    await expect(rt.ensureLoaded()).rejects.toThrow(/sha256 mismatch/);
  });

  it('serialises concurrent calls', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rt.sessionCreate()));
    const ids = new Set(results.map(r => r.sessionId));
    expect(ids.size).toBe(8);
  });

  it('decryptChunk produces the same plaintext as the JS backend', async () => {
    // shared CEK + IV + ciphertext fixture, run through both backends
    const [jsOut, wasmOut] = await Promise.all([
      jsView.decryptChunk(kid, iv, ct),
      wasmView.decryptChunk(kid, iv, ct),
    ]);
    expect(jsOut.equals(wasmOut)).toBe(true);
  });
});
```

### 5.3 — Integration test: PDF render (both backends)

`pc2-node/test/integration/ddrm-decrypt.pdf.test.ts`:

1. Spin up the server with an in-memory `InMemorySessionStore`.
2. Bootstrap a session with `backend: 'js'`, request a known fixture PDF, verify the rendered output hash.
3. Bootstrap a session with `backend: 'wasm'`, same fixture, verify identical rendered output hash.
4. Verify `grep cekBase64 /proc/<pid>/maps` style heuristic via a debug endpoint that introspects the JS heap for a known CEK string — assert absence on the WASM path. (Soft assertion; V8 GC is non-deterministic, so it can flake. Mark as advisory.)

### 5.4 — Integration test: media playback (both backends)

Same shape as 5.3 but for fMP4: init segment + 3 media segments. Compare decrypted segment hashes between backends.

### 5.5 — Soak test

Run 1000 sequential bootstrap → init → decrypt → dispose cycles on the WASM backend. Memory metric: WASM `memory.buffer.byteLength` must not grow unbounded. If `instance.exports.memory` grows past N MB, fail.

### 5.6 — Flip default

Once 5.3–5.5 are green:
1. Change `/lit/begin-session` default from `'js'` to `'wasm'` (when `backend` field is absent in request, default to `'wasm'`).
2. Update `pc2-secure-view.js` to default `backend = 'wasm'`.
3. Document the rollback procedure: set `PC2_DDRM_BACKEND=js` env override on the server, which forces all new sessions to `'js'` regardless of client request.

### 5.7 — Deprecation note for `cenc-decrypt`

Add a `DEPRECATED.md` to `pc2-node/crates/cenc-decrypt/` pointing at `ddrm-decrypt` and noting the sunset date is TBD pending one full release cycle of `'wasm'` as default.

### 5.8 — Docs update

Update `docs/core/DDRM_SESSION_ARCHITECTURE.md`:
- Soften the prior "CEK lives only inside `BackendSessionView._cekBase64`" claim, link to this task.
- Add a section on the two-backend model and selection.
- Document the WASM containment guarantee precisely (CEK never crosses FFI boundary; zeroed via `Zeroizing`; instance reload on trap).

## Verification

- All Rust + TS tests pass in CI.
- Soak test stays under WASM memory budget (~16 MB after 1000 cycles).
- After flip, fresh dev environment produces sessions with `backend=wasm` by default.

## Exit criteria

- Default backend is `'wasm'`.
- `cenc-decrypt` carries a deprecation note pointing at `ddrm-decrypt`.
- Architecture doc reflects reality.
- Rollback procedure documented and tested once (set env, restart, observe `backend=js` in new sessions).

## History

- 2026-05-28 — Phase planned alongside other phases.
