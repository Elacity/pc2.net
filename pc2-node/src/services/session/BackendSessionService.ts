/**
 * BackendSessionService — server-owned P-256 secure-view session lifecycle.
 *
 * The server generates and owns the session keypair. Clients never hold key
 * material; they receive an opaque bearer token after their wallet signs the
 * delegation that binds `ownerAddress` to `sessionPublicKey`.
 *
 * Lifecycle:
 *   1. `createSession`  — generate P-256 keypair; return canonical delegation JSON.
 *   2. Client wallet `personal_sign(delegationCanonical)` → `delegationSig`.
 *   3. `confirmSession` — verify `ecrecover(delegationSig) === ownerAddress`; issue bearer token.
 *   4. `getSessionByToken` — bearer-token lookup for subsequent content requests.
 *   5. `renewSession` — same keypair, fresh delegation; client wallet re-signs.
 *
 * `StoredSession` is held in process heap by default. Callers that need
 * durability (cross-restart, multi-process) inject an `ISessionStore`.
 * `curve + privateKeyRaw` are language-agnostic — any P-256 implementation
 * can reconstruct the keypair from the persisted record.
 */

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import {
  canonicalize,
  DELEGATION_DOMAIN,
  MAX_DELEGATION_TTL_SECONDS,
} from '../../api/chipotle-client.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('BackendSessionService');

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CHAIN_ID = 8453; // Base mainnet — matches chipotle-client.ts DEFAULT_CHAIN_ID

// ── Storage interface ─────────────────────────────────────────────────────────

/**
 * Pluggable session store. The default implementation is `InMemorySessionStore`.
 * Implement this to persist sessions to a database, Redis, or the filesystem.
 *
 * Implementations must keep the token→id index in sync with `set()` calls so
 * `getByToken` runs in O(1). Returning a session whose token has been rotated
 * is a bug.
 */
export interface ISessionStore {
  get(id: string): StoredSession | null;
  set(session: StoredSession): void;
  /** Return an active (confirmed + not expired) session for the given token, or null. */
  getByToken(token: string): StoredSession | null;
  /** Return all stored sessions — used for bulk export / persistence. */
  all(): StoredSession[];
}

/**
 * Default in-memory store. Two Maps: sessions by ID and a token→ID index for
 * O(1) token lookup. Private key material lives only in process heap.
 */
export class InMemorySessionStore implements ISessionStore {
  private readonly _sessions = new Map<string, StoredSession>();
  private readonly _tokenIdx = new Map<string, string>();

  get(id: string): StoredSession | null {
    return this._sessions.get(id) ?? null;
  }

  set(session: StoredSession): void {
    const prev = this._sessions.get(session.id);
    if (prev?.token && prev.token !== session.token) {
      this._tokenIdx.delete(prev.token);
    }
    this._sessions.set(session.id, session);
    if (session.token) this._tokenIdx.set(session.token, session.id);
  }

  getByToken(token: string): StoredSession | null {
    const id = this._tokenIdx.get(token);
    if (!id) return null;
    const s = this._sessions.get(id);
    if (!s || !s.delegationSig || s.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return s;
  }

  all(): StoredSession[] {
    return Array.from(this._sessions.values());
  }
}

/**
 * Filesystem-backed session store. Wraps `InMemorySessionStore` for the hot
 * lookup paths and mirrors every mutation to `<dir>/<publicKeyHex>.json` so
 * sessions survive process restarts.
 *
 * On construction the directory is scanned and active records are loaded into
 * memory; expired records are deleted from disk to keep the directory bounded.
 */
export class FileSessionStore implements ISessionStore {
  private readonly mem = new InMemorySessionStore();
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    this.ensureDir();
    this.loadAll();
  }

  get(id: string): StoredSession | null {
    return this.mem.get(id);
  }

  set(session: StoredSession): void {
    this.mem.set(session);
    this.persist(session);
  }

  getByToken(token: string): StoredSession | null {
    return this.mem.getByToken(token);
  }

  all(): StoredSession[] {
    return this.mem.all();
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(id: string): string {
    // `id` is `0x04…` hex — safe for filenames as-is.
    return join(this.dir, id + '.json');
  }

  private persist(session: StoredSession): void {
    try {
      writeFileSync(this.filePath(session.id), JSON.stringify(session), { mode: 0o600 });
    } catch (err: any) {
      logger.warn(`Failed to persist session ${session.id.substring(0, 14)}…: ${err?.message}`);
    }
  }

  private loadAll(): void {
    let files: string[];
    try {
      files = readdirSync(this.dir);
    } catch {
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    let restored = 0;
    let expired = 0;
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      const path = join(this.dir, name);
      try {
        const raw = readFileSync(path, 'utf8');
        const session = JSON.parse(raw) as StoredSession;
        if (!session || typeof session.id !== 'string' || session.expiresAt <= nowSec) {
          rmSync(path, { force: true });
          expired++;
          continue;
        }
        this.mem.set(session);
        restored++;
      } catch (err: any) {
        logger.warn(`Skipping corrupt session file ${name}: ${err?.message}`);
        try { rmSync(path, { force: true }); } catch { /* ignore */ }
      }
    }
    if (restored || expired) {
      logger.info(`Loaded ${restored} session(s); pruned ${expired} expired`);
    }
  }
}

// ── StoredSession ─────────────────────────────────────────────────────────────

/**
 * Serializable session record. `curve + privateKeyRaw` is the portable
 * resurrection format — any P-256 implementation can reconstruct the
 * keypair. `privateKeyJwk` is the Node WebCrypto convenience format.
 */
export interface StoredSession {
  /** Equals `publicKeyHex` (P-256 uncompressed `0x04||X||Y`, 65 bytes). */
  id: string;
  /** Explicit curve identifier — always `'P-256'` for now. */
  curve: 'P-256';
  /** 65-byte uncompressed point hex (`0x04||X||Y`). */
  publicKeyHex: string;
  /** Node.js WebCrypto convenience format. */
  privateKeyJwk: JsonWebKey;
  /** 32-byte big-endian private scalar, hex (no `0x` prefix) — language-agnostic. */
  privateKeyRaw: string;
  /** Checksummed — from PC2 auth context, never from request body. */
  ownerAddress: string;
  /** Opaque bearer token (32 random bytes hex); `''` until confirmed. */
  token: string;
  /** Canonical delegation JSON; set at `createSession`. */
  delegationCanonical: string;
  /** Wallet `personal_sign` over `delegationCanonical`; `''` until confirmed. */
  delegationSig: string;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds — matches `delegation.expiresAt`. */
  expiresAt: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BackendSessionService {
  private readonly store: ISessionStore;

  /**
   * @param store Storage backend. Defaults to `InMemorySessionStore` (process heap).
   *              Pass a custom `ISessionStore` for filesystem, Redis, or DB persistence.
   */
  constructor(store: ISessionStore = new InMemorySessionStore()) {
    this.store = store;
  }

  /**
   * Step 1 — generate P-256 keypair + delegation payload.
   *
   * The returned `delegationCanonical` must be signed by the user's wallet
   * (personal_sign) and the sig submitted to `confirmSession()`. The wallet
   * signature is the cryptographic proof that `ownerAddress` authorises
   * `sessionPublicKey` — the same check the Lit Action runs.
   *
   * `ownerAddress` comes from the authenticated request context (PC2 auth
   * middleware), not from the request body. The server knows who is asking.
   */
  async createSession(params: {
    ownerAddress: string;
    chainId?: number;
    ttlSeconds?: number;
  }): Promise<{ sessionId: string; delegationCanonical: string; expiresAt: number }> {
    const { subtle } = globalThis.crypto;

    const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    const publicKeyHex = '0x' + Buffer.from(rawPub).toString('hex');
    const privateKeyJwk = await subtle.exportKey('jwk', kp.privateKey);
    if (typeof privateKeyJwk.d !== 'string') {
      throw new Error('BackendSessionService.createSession: generated JWK is missing private scalar `d`');
    }
    // `d` is base64url big-endian 32-byte scalar — hex for language-agnostic portability.
    const privateKeyRaw = Buffer.from(privateKeyJwk.d, 'base64url').toString('hex');

    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = Math.min(params.ttlSeconds ?? MAX_DELEGATION_TTL_SECONDS, MAX_DELEGATION_TTL_SECONDS);
    const delegation = {
      chainId: params.chainId ?? DEFAULT_CHAIN_ID,
      domain: DELEGATION_DOMAIN,
      expiresAt: nowSec + ttl,
      issuedAt: nowSec,
      nonce: '0x' + randomBytes(16).toString('hex'),
      ownerAddress: ethers.getAddress(params.ownerAddress),
      sessionPublicKey: publicKeyHex,
    };
    const delegationCanonical = canonicalize(delegation);

    this.store.set({
      id: publicKeyHex,
      curve: 'P-256',
      publicKeyHex,
      privateKeyJwk,
      privateKeyRaw,
      ownerAddress: delegation.ownerAddress,
      token: '',
      delegationCanonical,
      delegationSig: '',
      createdAt: nowSec,
      expiresAt: delegation.expiresAt,
    });
    return { sessionId: publicKeyHex, delegationCanonical, expiresAt: delegation.expiresAt };
  }

  /**
   * Step 2 — verify wallet signature, issue opaque bearer token.
   *
   * `ecrecover(delegationSig, delegationCanonical) === session.ownerAddress`
   * mirrors the Lit Action's own check — only the wallet that signed the
   * delegation can activate it.
   */
  confirmSession(params: {
    sessionId: string;
    delegationSig: string;
  }): { token: string; expiresAt: number; sessionId: string } {
    const session = this.store.get(params.sessionId);
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });

    const recovered = ethers.verifyMessage(session.delegationCanonical, params.delegationSig);
    if (recovered.toLowerCase() !== session.ownerAddress.toLowerCase()) {
      throw Object.assign(
        new Error('delegationSig signer does not match ownerAddress'),
        { statusCode: 403 },
      );
    }
    const token = randomBytes(32).toString('hex');
    this.store.set({ ...session, token, delegationSig: params.delegationSig });
    return { token, expiresAt: session.expiresAt, sessionId: session.id };
  }

  /**
   * Renew — same P-256 keypair, fresh delegation (new timestamps + nonce),
   * new wallet sig required. Call after delegation expiry; avoids generating
   * a new keypair and keeps session continuity.
   */
  async renewSession(params: {
    sessionId: string;
    ownerAddress: string;
    chainId?: number;
    ttlSeconds?: number;
  }): Promise<{ delegationCanonical: string; expiresAt: number }> {
    const session = this.store.get(params.sessionId);
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    if (session.ownerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()) {
      throw Object.assign(
        new Error('ownerAddress mismatch — only the original wallet can renew'),
        { statusCode: 403 },
      );
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = Math.min(params.ttlSeconds ?? MAX_DELEGATION_TTL_SECONDS, MAX_DELEGATION_TTL_SECONDS);
    const delegation = {
      chainId: params.chainId ?? DEFAULT_CHAIN_ID,
      domain: DELEGATION_DOMAIN,
      expiresAt: nowSec + ttl,
      issuedAt: nowSec,
      nonce: '0x' + randomBytes(16).toString('hex'),
      ownerAddress: session.ownerAddress,
      sessionPublicKey: session.publicKeyHex,
    };
    const delegationCanonical = canonicalize(delegation);

    // Reset token and sig — caller must confirmSession() with the new wallet sig.
    this.store.set({
      ...session,
      delegationCanonical,
      delegationSig: '',
      token: '',
      expiresAt: delegation.expiresAt,
    });
    return { delegationCanonical, expiresAt: delegation.expiresAt };
  }

  /** Return an active (confirmed + not expired) session for the given bearer token. */
  getSessionByToken(token: string): StoredSession | null {
    return this.store.getByToken(token);
  }

  getSessionById(id: string): StoredSession | null {
    return this.store.get(id);
  }

  /**
   * Import a previously exported `StoredSession`. Use on startup to restore
   * sessions from an external persistence layer. Callers are responsible for
   * validating expiry before importing.
   */
  importSession(session: StoredSession): void {
    this.store.set(session);
  }

  /**
   * Export all sessions as plain serializable objects. Snapshot the store to
   * an external persistence layer (database, filesystem, Redis); re-import
   * via `importSession()` on the next startup.
   */
  exportAll(): StoredSession[] {
    return this.store.all();
  }
}

/**
 * Default singleton — filesystem-backed so sessions survive process restarts.
 * Records live at `<repo>/pc2-node/data/sessions/<publicKeyHex>.json`.
 *
 * Replace with `new BackendSessionService(customStore)` where a different
 * persistence layer (Redis, DB) is required.
 */
const __sessionFilename = fileURLToPath(import.meta.url);
const __sessionDir = dirname(__sessionFilename);
const SESSION_STORE_DIR = join(__sessionDir, '../../../data/sessions');

export const sessionService = new BackendSessionService(
  new FileSessionStore(SESSION_STORE_DIR),
);
