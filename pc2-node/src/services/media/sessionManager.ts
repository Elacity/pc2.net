/**
 * Media Session Manager for PC2 Media Runtime.
 *
 * Stores active playback sessions with CEK + segment map in memory.
 * Sessions have a TTL and are tied to the auth token that created them.
 * CEK is held server-side only — never sent to the frontend.
 */

import * as crypto from 'crypto';
import { type ParsedMPD } from './mpdParser.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface MediaSession {
  id: string;
  /**
   * Base64 CEK for the JS-backed session view path. The /segment handler
   * passes this to `cenc-decrypt` WASM with the segment bytes. Mutually
   * exclusive with `wasmRequestHandle`.
   */
  cekBase64?: string;
  /**
   * `ddrm-decrypt` WASM L2 request handle for the WASM-backed session view
   * path. The /segment handler calls
   * `WasmDdrmDecryptRuntime.requestDecryptSegment(handle, init, seg)`
   * directly. The CEK lives only in WASM linear memory; this handle is
   * the opaque key into the L2 registry. Mutually exclusive with
   * `cekBase64`.
   */
  wasmRequestHandle?: number;
  mpd: ParsedMPD;
  mpdBaseUrl: string;
  channel: string;
  tokenId: string;
  createdAt: number;
  lastAccessedAt: number;
  authTokenHash: string;
  initSegments: Map<number, Buffer>;
}

class MediaSessionManager {
  private sessions = new Map<string, MediaSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  create(params: {
    /** Set for JS-backed sessions; the /segment handler passes this to cenc-decrypt. */
    cekBase64?: string;
    /** Set for WASM-backed sessions; the /segment handler passes this to ddrm-decrypt. */
    wasmRequestHandle?: number;
    mpd: ParsedMPD;
    mpdBaseUrl: string;
    channel: string;
    tokenId: string;
    authToken: string;
  }): MediaSession {
    if (!params.cekBase64 && params.wasmRequestHandle === undefined) {
      throw new Error('MediaSession.create: one of `cekBase64` or `wasmRequestHandle` must be provided');
    }
    const id = crypto.randomUUID();
    const session: MediaSession = {
      id,
      cekBase64: params.cekBase64,
      wasmRequestHandle: params.wasmRequestHandle,
      mpd: params.mpd,
      mpdBaseUrl: params.mpdBaseUrl,
      channel: params.channel,
      tokenId: params.tokenId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      authTokenHash: this.hashToken(params.authToken),
      initSegments: new Map(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string, authToken: string): MediaSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Idle timeout: expire if no segment fetch for SESSION_TTL_MS
    if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return null;
    }

    if (session.authTokenHash !== this.hashToken(authToken)) {
      return null;
    }

    session.lastAccessedAt = Date.now();
    return session;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];
    this.sessions.forEach((session, id) => {
      if (now - session.lastAccessedAt > SESSION_TTL_MS) expired.push(id);
    });
    expired.forEach(id => this.sessions.delete(id));
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }
}

export const mediaSessionManager = new MediaSessionManager();
