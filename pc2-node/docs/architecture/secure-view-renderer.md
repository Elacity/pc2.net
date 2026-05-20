# Secure-View Renderer — Architecture

> Covers the non-media decryption and rendering workflow behind
> `POST /api/storage/lit/secure-view`.

---

## Background

The secure-view endpoint decrypts an encrypted asset server-side and returns
only a locked, watermarked representation — never raw plaintext.  
The handler was originally a single ~585-line function in `src/api/storage.ts`
that inlined all rendering pipelines (WASM, Sharp, PDF.js, Canvas, passthrough)
as a flat chain of `if (mime === …)` blocks, making it hard to reason about one
content type without reading the entire function.

---

## Refactored structure

```
src/api/renderer/
  types.ts                         ← shared contracts (no internal deps)
  secure-view/
    utils.ts                       ← buildWasmHeaders, wasmSuccess, watermarkText
    registry.ts                    ← resolveRenderer(mime) — ordered list
    ImageRenderer.ts               ← image/* (WASM → Sharp fallback)
    PdfRenderer.ts                 ← application/pdf (WASM → PDF.js + Canvas fallback)
    TextRenderer.ts                ← text/* (WASM → Canvas fallback)
    EpubRenderer.ts                ← epub (WASM-only, handles fixed-layout 409)
    CbzRenderer.ts                 ← cbz (WASM-only)
    CodeRenderer.ts                ← application/json, /xml, /javascript, etc. (WASM-only, 415 on failure)
    AudioRenderer.ts               ← audio/* (decrypt + passthrough)
    PassthroughRenderer.ts         ← model/, font/, archives (decrypt + passthrough)
```

---

## Pattern: Strategy

Each content type is handled by a `ContentRenderer` class that implements two
methods:

```typescript
interface ContentRenderer {
  canHandle(mime: string): boolean;
  render(ctx: RenderContext, deps: RenderDeps): Promise<RenderOutput>;
}
```

`registry.ts` holds an ordered list of renderer instances.
`resolveRenderer(mime)` returns the first match, or `null` (→ 415).

The handler in `storage.ts` reduces to:

```typescript
const renderer = resolveRenderer(mime);
if (!renderer) { res.status(415).json(…); return; }

const output = await renderer.render(renderCtx, { renderViaWASM, decryptAssetTwoLayer });

for (const [key, value] of Object.entries(output.headers)) res.set(key, value);

if (output.status !== 200) { res.status(output.status).json(output.errorBody); return; }

res.set('Content-Type', output.contentType!);
res.set('Content-Length', String(output.body!.length));
res.send(output.body);
```

---

## Dependency injection instead of imports

Each renderer receives `renderViaWASM` and `decryptAssetTwoLayer` as a typed
`RenderDeps` argument rather than importing them from `storage.ts`.

**Why:** `storage.ts` imports from `registry.ts`, which imports the renderers.
If the renderers imported back from `storage.ts`, the chain would be circular.
`renderViaWASM` and `decryptAssetTwoLayer` depend on deeply embedded
module-level state in `storage.ts` (CEK cache, Lit backend selection,
coalescing map, WASM binary cache), so moving them to a shared utilities file
would require moving all that state too — a much larger change for little gain.
Injection keeps the renderers stateless and testable without touching
`storage.ts`'s internals.

---

## Uniform output contract

```typescript
interface RenderOutput {
  status: number;           // HTTP status
  contentType?: string;     // for 2xx
  body?: Buffer;            // for 2xx
  errorBody?: unknown;      // for non-2xx JSON
  headers: Record<string, string>;  // X-Renderer, X-Asset-Pages, CSP, …
}
```

Special cases are fully encapsulated. The EPUB 409 fixed-layout response, for
instance, is returned by `EpubRenderer` as a `RenderOutput` with
`status: 409` — the handler has no knowledge of it.

---

## WASM / Node.js tier ownership

In the original code one WASM block ran first for all supported types, then the
handler fell into a chain of Node.js `if` blocks. With Strategy each renderer
owns its own tier decision:

| Renderer | Primary | Fallback |
|---|---|---|
| `ImageRenderer` | WASM | Sharp (JPEG out) |
| `PdfRenderer` | WASM | PDF.js + Canvas (JPEG out) |
| `TextRenderer` | WASM | Canvas (JPEG out) |
| `EpubRenderer` | WASM | — (500 on failure) |
| `CbzRenderer` | WASM | — (500 on failure) |
| `CodeRenderer` | WASM | — (415 on failure) |
| `AudioRenderer` | — | Decrypt + passthrough |
| `PassthroughRenderer` | — | Decrypt + passthrough |

---

## Extending with a new content type

1. Create `src/api/renderer/secure-view/XyzRenderer.ts` implementing
   `ContentRenderer`.
2. Add one entry to the `RENDERERS` array in `registry.ts` at the appropriate
   priority position.

No other file needs to change.

---

## Unchanged scope

Steps 1–3 of the handler — session bundle verification, on-chain preflight
access check, security headers, and rate-limiting — are identical to before.
The `renderViaWASM`, `decryptAssetTwoLayer`, and `recoverCEKAndFetchData`
functions remain in `storage.ts` alongside the CEK cache and Lit backend state
they depend on.

---

## Shared types

`src/api/renderer/types.ts` is the canonical home for:

| Type | Purpose |
|---|---|
| `LitBackend` | `'chipotle' \| 'datil'` |
| `DecryptParams` | Full set of fields needed by the Lit + IPFS decrypt pipeline |
| `CEKRecoveryResult` | `{ cekBase64, encryptedBytes }` from `recoverCEKAndFetchData` |
| `WASMRenderResult` | Output shape of the WASM renderer |
| `RenderContext` | All inputs a renderer can read |
| `RenderOutput` | Uniform response envelope |
| `RenderDeps` | Injected function signatures |
| `ContentRenderer` | The Strategy interface |

`storage.ts` re-exports `DecryptParams` for backward compatibility.
`gateway.ts` imports it directly from `renderer/types.ts`.
