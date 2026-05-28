# Phase 1 — JS Runtime Bridge for `ddrm-decrypt`

**Parent**: [DDRM-DECRYPT-WASM.md](DDRM-DECRYPT-WASM.md)
**Depends on**: Phase 0
**Status**: Planned

## Objective

Add a singleton `WasmDdrmDecryptRuntime` to the Node side that loads the `ddrm-decrypt` WASM binary **once per process** and exposes typed methods mapping to the C ABI. Includes:

- Lazy initialization (loads on first call, not at server boot).
- Async serialization lock (single-instance, multi-request safety).
- Trap-and-reload error boundary.
- SHA-256 pin verification against `capsule.json`.
- Memory marshaling helpers (`alloc` / `writeBytes` / `readBytes` / `dealloc`).

## File layout

```
pc2-node/src/services/wasm/
  WASMRuntime.ts                         # existing — leave alone
  WasmDdrmDecryptRuntime.ts              # NEW — this phase
  WasmDdrmDecryptRuntime.exports.d.ts    # typed view of the WASM exports table
```

## Steps

### 1.1 — Typed exports interface

```ts
// WasmDdrmDecryptRuntime.exports.d.ts
export interface DdrmDecryptExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  session_create(idOutPtr: number, idCap: number, jwkOutPtr: number, jwkCap: number): number;
  session_get_session_id(handle: number, outPtr: number, outCap: number): number;
  session_get_public_key_jwk(handle: number, outPtr: number, outCap: number): number;
  session_sign(handle: number, payloadPtr: number, payloadLen: number, outPtr: number, outCap: number): number;
  session_unwrap_envelope(handle: number, envPtr: number, envLen: number): number;
  session_lookup(idPtr: number, idLen: number): number;
  session_drop(handle: number): number;
  request_decrypt_chunk(reqHandle: number, kidPtr: number, kidLen: number, ivPtr: number, ivLen: number,
                         ctPtr: number, ctLen: number, outPtr: number, outCap: number): number;
  request_drop(reqHandle: number): number;
}
```

### 1.2 — Singleton runtime

```ts
// WasmDdrmDecryptRuntime.ts
import { logger } from '../../utils/logger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { init as wasiInit, WASI } from '@wasmer/wasi';
import type { DdrmDecryptExports } from './WasmDdrmDecryptRuntime.exports.js';

const WASM_DIR = path.resolve(process.cwd(), 'pc2-node/wasm-apps/ddrm-decrypt');
const WASM_PATH = path.join(WASM_DIR, 'ddrm_decrypt.wasm');   // note: cargo replaces - with _
const CAPSULE_PATH = path.join(WASM_DIR, 'capsule.json');

export class DdrmDecryptError extends Error {
  constructor(public code: number, message: string) { super(message); }
}

export class WasmDdrmDecryptRuntime {
  private static _instance: WasmDdrmDecryptRuntime | null = null;
  static get(): WasmDdrmDecryptRuntime {
    if (!this._instance) this._instance = new WasmDdrmDecryptRuntime();
    return this._instance;
  }

  private exports: DdrmDecryptExports | null = null;
  private loading: Promise<void> | null = null;
  private lock: Promise<void> = Promise.resolve();
  private reloadAttempted = false;

  async ensureLoaded(): Promise<void> {
    if (this.exports) return;
    if (!this.loading) this.loading = this._load();
    await this.loading;
  }

  private async _load(): Promise<void> {
    const [bin, capsuleRaw] = await Promise.all([
      fs.readFile(WASM_PATH),
      fs.readFile(CAPSULE_PATH, 'utf8'),
    ]);
    const capsule = JSON.parse(capsuleRaw) as { sha256: string };
    const actual = createHash('sha256').update(bin).digest('hex');
    if (actual !== capsule.sha256) {
      throw new Error(`ddrm-decrypt sha256 mismatch: expected ${capsule.sha256}, got ${actual}`);
    }
    await wasiInit();
    const wasi = new WASI({ args: [], env: {}, preopens: {} });
    const module = await WebAssembly.compile(bin);
    const imports = (wasi as any).getImports(module);
    const instance = await WebAssembly.instantiate(module, imports);
    // Do NOT call wasi.start(instance) — we don't have main() and don't want _start invoked
    this.exports = instance.exports as unknown as DdrmDecryptExports;
    logger.info('[WasmDdrmDecryptRuntime] loaded ddrm-decrypt (sha256 verified)');
  }

  /** Serialize all WASM access. WASM linear memory is single-thread; concurrent requests must queue. */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prior = this.lock;
    let release!: () => void;
    this.lock = new Promise((resolve) => { release = resolve; });
    await prior;
    try { return await fn(); } finally { release(); }
  }

  /** Wrap a call so a WASM trap triggers one reload attempt. */
  private async call<T>(fn: (e: DdrmDecryptExports) => T): Promise<T> {
    await this.ensureLoaded();
    return this.withLock(async () => {
      try {
        return fn(this.exports!);
      } catch (err) {
        if (err instanceof WebAssembly.RuntimeError && !this.reloadAttempted) {
          logger.error('[WasmDdrmDecryptRuntime] WASM trap, reloading once', { err });
          this.reloadAttempted = true;
          this.exports = null;
          this.loading = null;
          await this.ensureLoaded();
          this.reloadAttempted = false;
          return fn(this.exports!);
        }
        if (err instanceof WebAssembly.RuntimeError) {
          logger.fatal('[WasmDdrmDecryptRuntime] WASM trap after reload — exiting');
          process.exit(70);
        }
        throw err;
      }
    });
  }

  // ── Memory helpers ────────────────────────────────────────────────────

  private writeBytes(e: DdrmDecryptExports, bytes: Uint8Array): { ptr: number; len: number } {
    const ptr = e.alloc(bytes.length);
    new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
    return { ptr, len: bytes.length };
  }

  private readBytes(e: DdrmDecryptExports, ptr: number, len: number): Uint8Array {
    return new Uint8Array(e.memory.buffer, ptr, len).slice();   // copy out
  }

  // ── Typed public API ──────────────────────────────────────────────────

  async sessionCreate(): Promise<{ handle: number; sessionId: string; publicKeyJwk: any }> {
    return this.call((e) => {
      const idCap = 64, jwkCap = 512;
      const idPtr = e.alloc(idCap), jwkPtr = e.alloc(jwkCap);
      try {
        const handle = e.session_create(idPtr, idCap, jwkPtr, jwkCap);
        if (handle <= 0) throw new DdrmDecryptError(handle, 'session_create failed');
        const sessionId = new TextDecoder().decode(this.readBytes(e, idPtr,
          e.session_get_session_id(handle, idPtr, idCap)));
        const jwkLen = e.session_get_public_key_jwk(handle, jwkPtr, jwkCap);
        const publicKeyJwk = JSON.parse(new TextDecoder().decode(this.readBytes(e, jwkPtr, jwkLen)));
        return { handle, sessionId, publicKeyJwk };
      } finally {
        e.dealloc(idPtr, idCap); e.dealloc(jwkPtr, jwkCap);
      }
    });
  }

  async sessionLookup(sessionId: string): Promise<number | null> { /* ... */ }
  async sessionSign(handle: number, payload: Uint8Array): Promise<Uint8Array> { /* ... */ }
  async sessionUnwrapEnvelope(handle: number, env: Uint8Array): Promise<number /* req handle */> { /* ... */ }
  async requestDecryptChunk(req: number, kid: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Buffer> { /* ... */ }
  async requestDrop(req: number): Promise<void> { /* ... */ }
  async sessionDrop(handle: number): Promise<void> { /* ... */ }
}
```

### 1.3 — Wasmer instance reuse spike

Before committing to the above pattern, run a one-file spike that:
1. Loads ddrm-decrypt with wasmer-WASI.
2. Calls `session_create` twice without re-instantiating.
3. Confirms the second `session_id` is different (proves state persists across calls).

If wasmer requires `start()` to be called and that consumes the instance, fall back to native `WebAssembly.instantiate` with hand-stubbed WASI imports (we only need `random_get`, `clock_time_get`, `proc_exit` for panics, `fd_write` for any unexpected output). Document the chosen path in this file's "Decisions" section after the spike.

### 1.4 — Concurrency note

The async `withLock` chain queues every WASM call. Each call is microseconds (envelope unwrap < 1ms, chunk decrypt depends on chunk size). For media playback with many small chunks, this could become a bottleneck. **Defer optimization**: if measurements after Phase 5 show queue depth issues, introduce a worker-thread pool with one WASM instance per worker and stable session sharding by `sessionId`. Out of scope for v1.

## Verification

- `WasmDdrmDecryptRuntime.get().ensureLoaded()` succeeds without error on a node with the built binary present.
- SHA-256 mismatch in `capsule.json` causes load to throw.
- Two parallel `sessionCreate()` calls return distinct sessionIds (lock works).
- Inducing a panic in WASM (test-only export `force_trap`) triggers exactly one reload, second trap exits the process.

## Exit criteria

- Singleton loads and survives multiple sequential and concurrent calls.
- Spike documented; one of the two instantiation paths chosen.
- No callers yet — Phase 2/3 wire consumers.
