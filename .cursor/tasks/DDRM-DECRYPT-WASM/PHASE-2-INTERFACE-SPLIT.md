# Phase 2 — Interface Split: `ICencDecryptor` and consumer migration

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Depends on**: Phase 1 (or independent — can run in parallel; doesn't need WASM)
**Status**: Planned

## Objective

Introduce `ICencDecryptor` and migrate every consumer that currently reads `view.cekBase64` to call `view.decryptChunk(...)` instead. After this phase, the JS backend still uses its existing CEK plumbing internally, but no caller depends on a CEK string being readable from outside the `BackendSessionView`. This unblocks `WasmSessionView` in Phase 3 to satisfy the same interface contract without exposing a CEK.

This phase is **net-zero behaviour-change** for the existing JS backend.

## Steps

### 2.1 — Define `ICencDecryptor` in `chipotle-client.ts`

```ts
/** Decryption surface — separated from session lifecycle so WASM-backed
 *  implementations don't have to expose CEK bytes via cekBase64. */
export interface ICencDecryptor {
  /**
   * Decrypt a single AES-128-CTR (CENC) chunk using the CEK held opaquely
   * by the implementation. `kid`/`iv` are per-sample as in CENC.
   */
  decryptChunk(kid: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Buffer>;

  /**
   * Decrypt a fully-assembled fMP4 segment. The CENC implementation walks
   * the moof/saio/saiz boxes internally. Used by the media segment path.
   * `kid` is sourced from the tenc box in the init segment.
   */
  decryptSegment(initSegment: Buffer | null, segment: Buffer): Promise<Buffer>;

  /**
   * Decrypt a one-shot full asset (non-CENC path). Used by PDF/EPUB renderer.
   * The implementation handles AES-CTR with a zero IV or whatever scheme the
   * two-layer envelope dictates. Returns plaintext bytes.
   */
  decryptAsset(ciphertext: Buffer, iv?: Uint8Array): Promise<Buffer>;

  /** Release any CEK / per-request state held internally. */
  dispose(): Promise<void>;
}
```

Add `ICencDecryptor` as a constraint where callers want decryption capability:

```ts
export type SessionWithDecrypt = ISessionView & ICencDecryptor;
```

### 2.2 — Implement on `BackendSessionView`

Add `decryptChunk` / `decryptSegment` / `decryptAsset` / `dispose` methods. Internally they continue to read `this._cekBase64` and shell out to the existing decrypt paths (`cenc-decrypt` WASM for CENC; the existing AES-CTR helper for full-asset). **No new behaviour**; just relocates the CEK read so consumers no longer touch it directly.

```ts
export class BackendSessionView implements ISessionView, ICencDecryptor {
  // ... existing fields ...
  private _cekBase64: string | null = null;   // keep private

  async decryptChunk(kid: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Buffer> {
    const cek = this._requireCek();
    return cencDecryptChunk(cek, kid, iv, ct);   // existing helper
  }

  async decryptSegment(init: Buffer | null, seg: Buffer): Promise<Buffer> {
    const cek = this._requireCek();
    return runCencDecryptWasm(cek, init, seg);   // existing WASMRuntime invocation
  }

  async decryptAsset(ct: Buffer, iv?: Uint8Array): Promise<Buffer> {
    const cek = this._requireCek();
    return aesCtrDecrypt(cek, iv ?? ZERO_IV, ct);
  }

  async dispose(): Promise<void> {
    this._cekBase64 = null;   // hint to GC; not actual zero
  }

  private _requireCek(): string {
    if (!this._cekBase64) throw new Error('decrypt called before unwrapEnvelope');
    return this._cekBase64;
  }

  // cekBase64 getter STAYS on this class as a class-private property only.
  // Remove the public getter declaration entirely once consumers migrate;
  // anything that still reaches in for it is rewritten.
}
```

### 2.3 — Migrate `gateway.ts decryptAssetTwoLayer / renderViaWASM`

Today (post-prior-refactor):

```ts
async function decryptAssetTwoLayer(..., sessionView: BackendSessionView) {
  // ... fetches blob ...
  const paddedCek = padCek(sessionView.cekBase64);
  // ... passes paddedCek into renderViaWASM ...
}
```

Rewrite to call `sessionView.decryptAsset(blob, iv)` directly. `renderViaWASM` no longer takes a CEK string — it receives plaintext bytes that have already been decrypted by the view. **The WASM renderer call becomes plaintext-in, rendered-output-out.**

This is the most consequential change in the phase. Concretely:
- `RendererCommand.cek_b64` is **deleted**. The renderer crate (`ddrm-renderer`) currently does CEK-aware work; check whether it actually decrypts or whether it just receives an already-padded blob. If the renderer's WASM does the AES-CTR, we either:
  - (a) Move that AES-CTR step into `BackendSessionView.decryptAsset` (and into `WasmSessionView.decryptAsset`), making the renderer plaintext-only. Preferred — narrows the renderer's surface.
  - (b) Leave AES-CTR in the renderer and pass the CEK via `decryptAsset(...)` returning a "pre-decryption capable" handle. Hard to type cleanly, exposes CEK back to JS. **Reject.**

Pick (a). The renderer no longer touches CEK.

Update sites:
- `pc2-node/src/api/gateway.ts` — `decryptAssetTwoLayer`, `renderViaWASM`, `/skills/install`.
- `pc2-node/src/api/renderer/types.ts` — drop `cek_b64` from `RendererCommand`.
- `pc2-node/src/api/renderer/ddrm-renderer` consumers — confirm no other path constructs `RendererCommand` with a CEK.

### 2.4 — Migrate `media.ts recoverMediaCEK` + `MediaSession`

`MediaSession.cekBase64` is the field name today. Consumers of `MediaSession`:
- `/media/init` — currently stores the unwrapped CEK against the session.
- `/media/segment` — currently reads `MediaSession.cekBase64` and passes it to the CENC WASM.

Migration:
- Replace `MediaSession.cekBase64: string` with `MediaSession.decryptor: ICencDecryptor`.
- `recoverMediaCEK` returns the decryptor (the `BackendSessionView` itself), not a CEK string.
- `/media/segment` calls `session.decryptor.decryptSegment(initSegment, segment)`.
- `MediaSession.dispose()` calls `decryptor.dispose()` and clears the reference.

### 2.5 — Remove `cekBase64` from `ISessionView` public surface

After 2.3 and 2.4 there should be no external read of `view.cekBase64`. Search:

```bash
grep -rn "cekBase64" pc2-node/src/
```

Should return only:
- `chipotle-client.ts` (private field declaration and `_requireCek`)
- (possibly) test fixtures

If any production caller remains, fix them before continuing.

### 2.6 — `cekSessionCache` becomes a request-handle cache

`storage.ts:1669` has `cekSessionCache: Map<contentId, { cek, exp }>`. The cache key/value model assumed CEK strings. After this phase, it caches a `BackendSessionView` (or its detached `_cekBase64`) keyed by `contentId + sessionId`. For the WASM backend in Phase 3, the equivalent cache will key on `contentId + sessionId` → `{ requestHandle, exp }`.

For phase 2, keep `cekSessionCache` as-is for the JS backend (still leaks CEK into a Map for ~5 minutes — that's the legacy backend's shape). Note this in the file as a known leftover; closed in Phase 3 for WASM-backed sessions.

## Verification

- Tests: PDF render end-to-end on current dev branch behaves identically before and after this phase.
- Media playback end-to-end — first init + N segments — behaves identically.
- `grep cekBase64 pc2-node/src/` shows no public reads from production code.

## Exit criteria

- `ICencDecryptor` defined; `BackendSessionView` implements it.
- `gateway.ts`, `media.ts`, `renderer/types.ts` updated to call `decrypt*` methods.
- `RendererCommand.cek_b64` deleted.
- Behaviour unchanged for the JS backend (still the only backend after this phase).
