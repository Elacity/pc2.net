/**
 * WasmDdrmDecryptRuntime — long-lived instance of the `ddrm-decrypt` WASM.
 *
 * Unlike `WASMRuntime` (which instantiates fresh per call for WASI command-style
 * crates), this runtime loads the binary **once per Node process** and keeps the
 * instance alive so the in-WASM L1 (sessions) / L2 (request CEKs) state persists
 * across calls. All access is serialized via an async lock because WASM linear
 * memory is not thread-safe.
 *
 * The CEK never crosses this boundary. The only way to use it is by holding a
 * `requestHandle` and calling `requestDecrypt*` — plaintext is the only thing
 * that ever exits the WASM side.
 */
import { init as wasiInit, WASI } from "@wasmer/wasi";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** From src/services/wasm/ (or dist/services/wasm/) up to pc2-node/, into wasm-apps/. */
const WASM_DIR = path.resolve(__dirname, "../../../wasm-apps/ddrm-decrypt");
const WASM_PATH = path.join(WASM_DIR, "ddrm-decrypt.wasm");
const CAPSULE_PATH = path.join(WASM_DIR, "capsule.json");

/** Matches `ErrorCode` in `pc2-node/crates/ddrm-decrypt/src/error.rs`. */
export enum DdrmDecryptErrorCode {
  UnknownSession = -1,
  UnknownRequest = -2,
  BadEnvelope = -3,
  BadSignature = -4,
  DecryptFailed = -5,
  RequestExpired = -6,
  BufferTooSmall = -7,
  InvalidArg = -8,
  InvalidHandle = -9,
  HandleCollision = -10,
  Internal = -99,
}

export class DdrmDecryptError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "DdrmDecryptError";
  }
  static fromCode(code: number, op: string): DdrmDecryptError {
    const name = DdrmDecryptErrorCode[code] ?? `code=${code}`;
    return new DdrmDecryptError(code, `${op} failed: ${name}`);
  }
}

/** Minimal typed view of `@wasmer/wasi`'s WASI we actually use. */
interface WasiStartable {
  start(instance: WebAssembly.Instance): void;
}

/** Typed view of the WASM exports table. */
interface DdrmDecryptExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  session_create(): number;
  session_get_session_id(
    handle: number,
    outPtr: number,
    outCap: number,
  ): number;
  session_get_public_key(
    handle: number,
    outPtr: number,
    outCap: number,
  ): number;
  session_sign(
    handle: number,
    payloadPtr: number,
    payloadLen: number,
    outPtr: number,
    outCap: number,
  ): number;
  session_unwrap_envelope(
    handle: number,
    envPtr: number,
    envLen: number,
  ): number;
  session_lookup(idPtr: number, idLen: number): number;
  session_drop(handle: number): number;
  request_decrypt_chunk(
    reqHandle: number,
    kidPtr: number,
    kidLen: number,
    ivPtr: number,
    ivLen: number,
    ctPtr: number,
    ctLen: number,
    outPtr: number,
    outCap: number,
  ): number;
  request_decrypt_segment(
    reqHandle: number,
    initPtr: number,
    initLen: number,
    segPtr: number,
    segLen: number,
    stripMetadata: number,
    outPtr: number,
    outCap: number,
  ): number;
  request_decrypt_asset(
    reqHandle: number,
    ivPtr: number,
    ivLen: number,
    ctPtr: number,
    ctLen: number,
    outPtr: number,
    outCap: number,
  ): number;
  request_drop(reqHandle: number): number;
  debug_session_count(): number;
  debug_request_count(): number;
}

export class WasmDdrmDecryptRuntime {
  private static _instance: WasmDdrmDecryptRuntime | null = null;
  static get(): WasmDdrmDecryptRuntime {
    if (!this._instance) this._instance = new WasmDdrmDecryptRuntime();
    return this._instance;
  }

  private exports: DdrmDecryptExports | null = null;
  private loading: Promise<void> | null = null;
  private lock: Promise<unknown> = Promise.resolve();
  private reloadAttempted = false;

  /** Lazy load — first call triggers compile + instantiate. */
  async ensureLoaded(): Promise<void> {
    if (this.exports) return;
    if (!this.loading) {
      this.loading = this._load().catch((err) => {
        // Drop the in-flight promise on failure so the next call retries.
        this.loading = null;
        throw err;
      });
    }
    await this.loading;
  }

  private async _load(): Promise<void> {
    const [bin, capsuleRaw] = await Promise.all([
      fs.readFile(WASM_PATH),
      fs.readFile(CAPSULE_PATH, "utf8"),
    ]);
    const capsule = JSON.parse(capsuleRaw) as { sha256: string };
    if (!capsule.sha256) {
      throw new Error(
        "ddrm-decrypt capsule.json missing sha256 — rebuild via scripts/build-wasm.sh",
      );
    }
    const actual = createHash("sha256").update(bin).digest("hex");
    if (actual !== capsule.sha256) {
      throw new Error(
        `ddrm-decrypt sha256 mismatch: expected ${capsule.sha256}, got ${actual} — binary on disk does not match capsule manifest`,
      );
    }

    await wasiInit();
    const wasi = new WASI({ env: {}, args: [], preopens: { "/": "/" } });
    const module = await WebAssembly.compile(
      new Uint8Array(bin).buffer as ArrayBuffer,
    );

    const imports = (wasi as any).getImports(module);
    const instantiated = await WebAssembly.instantiate(module, imports);
    const instance: WebAssembly.Instance =
      (instantiated as any).instance ?? (instantiated as WebAssembly.Instance);

    // Run `_start` once to initialize Rust's std (heap pointer, FDs, env).
    // Rust's wasm32-wasip1 cdylib does NOT emit a `_initialize` reactor entry —
    // the path that works is: ship a no-op `main()` in the crate, call
    // `wasi.start()` here, which runs `_start` (initializes std, runs main,
    // calls `__wasi_proc_exit(0)`). wasmer's WASI catches the exit and the
    // instance remains usable. Skipping this step traps the first time any
    // export touches std (HashMap, thread_local, SystemTime, etc.) with
    // `unreachable`.
    try {
      (wasi as unknown as WasiStartable).start(instance);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: unknown })?.code;
      const isExitOk =
        (typeof code === "number" && code === 0) ||
        /WASI Exit code: 0|exit code: 0|proc_exit\(0\)|^Exit$/i.test(message);
      if (!isExitOk) {
        throw new Error(`ddrm-decrypt: wasi.start failed: ${message}`);
      }
    }
    this.exports = instance.exports as unknown as DdrmDecryptExports;

    logger.info(
      `[WasmDdrmDecryptRuntime] loaded ddrm-decrypt sha256=${actual.slice(0, 12)}… size=${bin.length}B`,
    );
  }

  // ── Concurrency + error boundary ─────────────────────────────────────

  /** Serialize all WASM access. Each call is microseconds; the queue is fine. */
  private withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prior = this.lock;
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lock = prior.then(() => released);
    return prior.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }

  /**
   * Run a synchronous WASM operation under the lock. On `WebAssembly.RuntimeError`
   * (a trap), discard the instance and reload exactly once. A second trap exits
   * the process so the supervisor can restart.
   */
  private async run<T>(
    op: string,
    fn: (e: DdrmDecryptExports) => T,
  ): Promise<T> {
    await this.ensureLoaded();
    return this.withLock(async () => {
      try {
        return fn(this.exports!);
      } catch (err) {
        if (err instanceof WebAssembly.RuntimeError && !this.reloadAttempted) {
          logger.error(
            `[WasmDdrmDecryptRuntime] WASM trap during ${op}, reloading once`,
            { err },
          );
          this.reloadAttempted = true;
          this.exports = null;
          this.loading = null;
          await this.ensureLoaded();
          // Re-attempt the operation on the fresh instance.
          const result = fn(this.exports!);
          // Successful re-run: clear the flag so future traps are recoverable.
          this.reloadAttempted = false;
          return result;
        }
        if (err instanceof WebAssembly.RuntimeError) {
          logger.error(`[WasmDdrmDecryptRuntime] FATAL: WASM trap after reload during ${op} — exiting`);
          // eslint-disable-next-line n/no-process-exit
          process.exit(70);
        }
        throw err;
      }
    });
  }

  // ── Memory marshaling ────────────────────────────────────────────────

  private writeBytes(
    e: DdrmDecryptExports,
    data: Uint8Array,
  ): { ptr: number; len: number } {
    if (data.length === 0) return { ptr: 0, len: 0 };
    const ptr = e.alloc(data.length);
    if (ptr === 0) throw new Error("WASM alloc returned null");
    new Uint8Array(e.memory.buffer, ptr, data.length).set(data);
    return { ptr, len: data.length };
  }

  private allocOutput(
    e: DdrmDecryptExports,
    capacity: number,
  ): { ptr: number; cap: number } {
    if (capacity === 0) return { ptr: 0, cap: 0 };
    const ptr = e.alloc(capacity);
    if (ptr === 0) throw new Error("WASM alloc returned null");
    return { ptr, cap: capacity };
  }

  private readBytes(e: DdrmDecryptExports, ptr: number, len: number): Buffer {
    if (len === 0) return Buffer.alloc(0);
    // Copy out so we don't alias WASM memory across subsequent allocations.
    return Buffer.from(new Uint8Array(e.memory.buffer, ptr, len));
  }

  private freeBuffers(
    e: DdrmDecryptExports,
    ...bufs: Array<{ ptr: number; len?: number; cap?: number }>
  ) {
    for (const b of bufs) {
      const size = b.cap ?? b.len ?? 0;
      if (b.ptr !== 0 && size > 0) e.dealloc(b.ptr, size);
    }
  }

  // ── Typed public API ─────────────────────────────────────────────────

  /** Create a new P-256 session inside WASM. Returns handle + id + 33-byte compressed pubkey. */
  async sessionCreate(): Promise<{
    handle: number;
    sessionId: string;
    publicKey: Buffer;
  }> {
    return this.run("sessionCreate", (e) => {
      const handle = e.session_create();
      if (handle <= 0)
        throw DdrmDecryptError.fromCode(handle, "session_create");

      const idBuf = this.allocOutput(e, 64);
      const pkBuf = this.allocOutput(e, 33);
      try {
        const idLen = e.session_get_session_id(handle, idBuf.ptr, idBuf.cap);
        if (idLen < 0)
          throw DdrmDecryptError.fromCode(idLen, "session_get_session_id");
        const pkLen = e.session_get_public_key(handle, pkBuf.ptr, pkBuf.cap);
        if (pkLen < 0)
          throw DdrmDecryptError.fromCode(pkLen, "session_get_public_key");

        const sessionId = this.readBytes(e, idBuf.ptr, idLen).toString("utf8");
        const publicKey = this.readBytes(e, pkBuf.ptr, pkLen);
        return { handle, sessionId, publicKey };
      } finally {
        this.freeBuffers(e, idBuf, pkBuf);
      }
    });
  }

  /** Look up a session handle by sessionId. Returns null if not found (e.g. after process restart). */
  async sessionLookup(sessionId: string): Promise<number | null> {
    return this.run("sessionLookup", (e) => {
      const id = Buffer.from(sessionId, "utf8");
      const in_ = this.writeBytes(e, id);
      try {
        const result = e.session_lookup(in_.ptr, in_.len);
        if (result < 0)
          throw DdrmDecryptError.fromCode(result, "session_lookup");
        return result === 0 ? null : result;
      } finally {
        this.freeBuffers(e, in_);
      }
    });
  }

  /** P-256 ECDSA sign. Returns the DER-encoded signature. */
  async sessionSign(handle: number, payload: Uint8Array): Promise<Buffer> {
    return this.run("sessionSign", (e) => {
      const in_ = this.writeBytes(e, payload);
      const out = this.allocOutput(e, 80); // ECDSA-P256 DER sig is ≤72 bytes
      try {
        const len = e.session_sign(handle, in_.ptr, in_.len, out.ptr, out.cap);
        if (len < 0) throw DdrmDecryptError.fromCode(len, "session_sign");
        return this.readBytes(e, out.ptr, len);
      } finally {
        this.freeBuffers(e, in_, out);
      }
    });
  }

  /** ECDH-unwrap the envelope and store the CEK in L2. Returns the request handle. */
  async sessionUnwrapEnvelope(
    handle: number,
    envelope: Uint8Array,
  ): Promise<number> {
    return this.run("sessionUnwrapEnvelope", (e) => {
      const in_ = this.writeBytes(e, envelope);
      try {
        const req = e.session_unwrap_envelope(handle, in_.ptr, in_.len);
        if (req <= 0)
          throw DdrmDecryptError.fromCode(req, "session_unwrap_envelope");
        return req;
      } finally {
        this.freeBuffers(e, in_);
      }
    });
  }

  async sessionDrop(handle: number): Promise<void> {
    return this.run("sessionDrop", (e) => {
      const r = e.session_drop(handle);
      if (r < 0) throw DdrmDecryptError.fromCode(r, "session_drop");
    });
  }

  /** Decrypt a single AES-CTR chunk. `kid` is informational and may be empty. */
  async requestDecryptChunk(
    req: number,
    kid: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Buffer> {
    return this.run("requestDecryptChunk", (e) => {
      const k = this.writeBytes(e, kid);
      const i = this.writeBytes(e, iv);
      const c = this.writeBytes(e, ciphertext);
      const out = this.allocOutput(e, ciphertext.length);
      try {
        const n = e.request_decrypt_chunk(
          req,
          k.ptr,
          k.len,
          i.ptr,
          i.len,
          c.ptr,
          c.len,
          out.ptr,
          out.cap,
        );
        if (n < 0) throw DdrmDecryptError.fromCode(n, "request_decrypt_chunk");
        return this.readBytes(e, out.ptr, n);
      } finally {
        this.freeBuffers(e, k, i, c, out);
      }
    });
  }

  async requestDecryptSegment(
    req: number,
    initSegment: Uint8Array | null,
    segment: Uint8Array,
    stripMetadata = true,
  ): Promise<Buffer> {
    return this.run("requestDecryptSegment", (e) => {
      const init = initSegment
        ? this.writeBytes(e, initSegment)
        : { ptr: 0, len: 0 };
      const seg = this.writeBytes(e, segment);
      // Worst case the output is the same size as input (stripping only shrinks).
      const out = this.allocOutput(e, segment.length);
      try {
        const n = e.request_decrypt_segment(
          req,
          init.ptr,
          init.len,
          seg.ptr,
          seg.len,
          stripMetadata ? 1 : 0,
          out.ptr,
          out.cap,
        );
        if (n < 0)
          throw DdrmDecryptError.fromCode(n, "request_decrypt_segment");
        return this.readBytes(e, out.ptr, n);
      } finally {
        this.freeBuffers(e, init, seg, out);
      }
    });
  }

  async requestDecryptAsset(
    req: number,
    iv: Uint8Array,
    ciphertext: Uint8Array,
  ): Promise<Buffer> {
    return this.run("requestDecryptAsset", (e) => {
      const i = this.writeBytes(e, iv);
      const c = this.writeBytes(e, ciphertext);
      const out = this.allocOutput(e, ciphertext.length);
      try {
        const n = e.request_decrypt_asset(
          req,
          i.ptr,
          i.len,
          c.ptr,
          c.len,
          out.ptr,
          out.cap,
        );
        if (n < 0) throw DdrmDecryptError.fromCode(n, "request_decrypt_asset");
        return this.readBytes(e, out.ptr, n);
      } finally {
        this.freeBuffers(e, i, c, out);
      }
    });
  }

  async requestDrop(req: number): Promise<void> {
    return this.run("requestDrop", (e) => {
      const r = e.request_drop(req);
      if (r < 0) throw DdrmDecryptError.fromCode(r, "request_drop");
    });
  }

  // ── Diagnostics ──────────────────────────────────────────────────────

  async sessionCount(): Promise<number> {
    return this.run("sessionCount", (e) => e.debug_session_count());
  }

  async requestCount(): Promise<number> {
    return this.run("requestCount", (e) => e.debug_request_count());
  }
}
