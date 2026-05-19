/**
 * Chipotle Lit-Action Relayer (supernode-side) — SCAFFOLD
 *
 * STATUS: pre-flight scaffold for v1.2.8.0. NOT WIRED INTO index.js YET.
 *         Production write is gated on C-1 (live `usageKey` rotation).
 *
 * When promoted, this file lives at:
 *   deploy/web-gateway/lib/lit-relay.js
 * and is imported from `deploy/web-gateway/index.js` next to
 * `provisioning-token.js`. The two `if (url.pathname === ...)` branches
 * shown at the bottom of this file get pasted into the existing dispatch
 * chain in index.js (search for `/api/ddrm/provision`).
 *
 * Design refs:
 *   .cursor/tasks/V1.2.8.0-CHIPOTLE-RELAYER/V1.2.8.0-CHIPOTLE-RELAYER.md
 *   docs/handover/V12_SIGAUTH_HANDOVER.md   (existing SIWE in PC2)
 *   pc2-node/data/test-apps/elacity-market/wallet.js#siweLogin
 *
 * What this module owns:
 *   1. Nonce challenge issuance + single-use consumption (in-memory LRU)
 *   2. SIWE-style signature verification (personal_sign over a fixed message)
 *   3. Optional wallet allowlist (Mode B; default Mode A is open + rate-limited)
 *   4. Per-wallet token bucket for the Lit-Action call
 *   5. Server-side `X-Api-Key` injection + verbatim proxy to Chipotle
 *
 * What this module deliberately does NOT do (yet):
 *   - The actual fetch() to api.chipotle.litprotocol.com is STUBBED so this
 *     file cannot accidentally consume the live `usageKey` until C-1
 *     rotates and C-2 unblocks. Look for `THROW_STUB` below.
 *   - Loading the usageKey from /etc/pc2/ddrm-config.json — also stubbed.
 *
 * No third-party dependencies beyond Node stdlib + the same `viem`-free
 * recover that the gateway already uses for other signature checks. We
 * inline the minimal `personal_sign` recover via Node `crypto` + a
 * known-good `secp256k1` recover (added at promote-time; for now the
 * recover function is a placeholder that the verifier calls).
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Config (overrideable via env on the supernode; defaults match the task spec)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Nonce TTL — long enough for a slow PC2 client round-trip, short enough
  // that a captured challenge is useless to a passive observer.
  nonceTtlMs: 120_000,
  nonceStoreMax: 10_000,

  // Per-IP challenge issuance bucket.
  challengeRateLimit: { windowMs: 60_000, max: 30 },

  // Per-wallet Lit-Action bucket — 100/hour, refill 1 token / 36s.
  walletBucketCapacity: 100,
  walletBucketRefillMs: 36_000,

  // Per-IP secondary bucket — 600/hour, anti-distributed-abuse.
  ipBucketCapacity: 600,
  ipBucketRefillMs: 6_000,

  // Mode A (open + rate-limited) is the default. Mode B reads
  // /etc/pc2/relayer-wallets.allow (one lowercased 0x… per line). Empty file
  // or missing file => Mode A behaviour preserved.
  allowlistPath: "/etc/pc2/relayer-wallets.allow",

  // Path to the supernode's ddrm-config.json. The relayer reads ONLY the
  // `usageKey` field at request time (not at module-load) so a rotation
  // does not require a service restart.
  ddrmConfigPath: "/etc/pc2/ddrm-config.json",

  // Upstream Chipotle endpoint. Default matches the value already served
  // by /api/ddrm/provision; override in tests.
  chipotleApiUrl: "https://api.chipotle.litprotocol.com",

  // SIWE-equivalent statement burned into the signed message. Changing
  // this is a breaking change for clients — bump the version suffix.
  statement: "PC2 \u2192 Chipotle relayer auth (v1)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Nonce store — single-use, TTL-bounded, capped to nonceStoreMax entries.
// Mirrors the in-memory LRU shape from the task spec (Phase 1, lines 207–209).
// ─────────────────────────────────────────────────────────────────────────────

class NonceStore {
  constructor({ ttlMs, max }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.entries = new Map(); // nonce -> { wallet, issuedAt }
  }

  issue(wallet) {
    this._sweep();
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    const nonce = randomBytes(24).toString("base64url");
    const issuedAt = Date.now();
    this.entries.set(nonce, { wallet: wallet.toLowerCase(), issuedAt });
    return { nonce, issuedAt, expiresAt: issuedAt + this.ttlMs };
  }

  consume(nonce, wallet) {
    this._sweep();
    const entry = this.entries.get(nonce);
    if (!entry) return { ok: false, reason: "unknown_or_expired_nonce" };
    if (entry.wallet !== wallet.toLowerCase()) {
      return { ok: false, reason: "nonce_wallet_mismatch" };
    }
    if (Date.now() - entry.issuedAt > this.ttlMs) {
      this.entries.delete(nonce);
      return { ok: false, reason: "nonce_expired" };
    }
    this.entries.delete(nonce);
    return { ok: true, issuedAt: entry.issuedAt };
  }

  _sweep() {
    const now = Date.now();
    for (const [nonce, entry] of this.entries) {
      if (now - entry.issuedAt > this.ttlMs) this.entries.delete(nonce);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token-bucket rate limiter (per-key — used for both wallet and IP buckets)
// ─────────────────────────────────────────────────────────────────────────────

class TokenBucketRegistry {
  constructor({ capacity, refillMs, max }) {
    this.capacity = capacity;
    this.refillMs = refillMs;
    this.max = max ?? 100_000;
    this.buckets = new Map();
  }

  consume(key) {
    if (this.buckets.size >= this.max) {
      const oldest = this.buckets.keys().next().value;
      if (oldest) this.buckets.delete(oldest);
    }
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, b);
    }
    const elapsed = now - b.lastRefill;
    const refill = Math.floor(elapsed / this.refillMs);
    if (refill > 0) {
      b.tokens = Math.min(this.capacity, b.tokens + refill);
      b.lastRefill = b.lastRefill + refill * this.refillMs;
    }
    if (b.tokens <= 0) {
      const retryAfterMs = this.refillMs - (now - b.lastRefill);
      return { ok: false, retryAfterMs: Math.max(retryAfterMs, 1_000) };
    }
    b.tokens -= 1;
    return { ok: true, remaining: b.tokens };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIWE-style message construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the canonical message that the PC2 client signs. Both sides must
 * produce byte-for-byte identical output for `recoverAddress` to succeed,
 * so this lives in one place and gets re-used by chipotle-client-tier0
 * (see ../scaffold/relayer-signer.ts.fragment for the symmetric client copy).
 */
export function buildRelayerAuthMessage({ wallet, nonce, issuedAt }) {
  return [
    CONFIG.statement,
    `wallet: ${wallet.toLowerCase()}`,
    `nonce: ${nonce}`,
    `issuedAt: ${Math.floor(issuedAt / 1000)}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature recovery — STUBBED for the scaffold.
//
// At promote-time we either:
//   (a) inline a tiny secp256k1 + keccak256 personal_sign recover (preferred —
//       zero new dep), OR
//   (b) add `viem` to deploy/web-gateway/package.json (one extra dep, but the
//       existing pc2-node code already uses it elsewhere).
//
// We pick (a) at promote-time. The shape below is what the production
// implementation must satisfy.
// ─────────────────────────────────────────────────────────────────────────────

function recoverPersonalSign(_message, _hexSignature) {
  // STUB — see promote-time TODO above.
  throw new Error(
    "[lit-relay] recoverPersonalSign() stub — implement at promote-time before wiring routes",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist (Mode B). Mode A returns true for any address that signed correctly.
// ─────────────────────────────────────────────────────────────────────────────

let _cachedAllowlist = null;
let _cachedAllowlistMtimeMs = 0;

function loadAllowlist(_fs) {
  // Re-read the allowlist file at most every 30s (cheap cache).
  // Stub returns null = Mode A. Promote-time wires fs.statSync + readFileSync.
  return _cachedAllowlist;
}

function walletAllowed(wallet, fs) {
  const list = loadAllowlist(fs);
  if (!list) return true; // Mode A
  return list.has(wallet.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — what index.js wires into the dispatch chain
// ─────────────────────────────────────────────────────────────────────────────

export class LitRelayer {
  /**
   * @param {object} deps
   * @param {object} deps.fs               Node fs module (injectable for tests)
   * @param {(key: string, ip: string) => boolean} [deps.checkRateLimit]
   *        Optional — if the surrounding gateway already has a per-IP limiter
   *        (it does — see index.js:719 `checkRateLimit('register', clientIP)`),
   *        we delegate to it for the challenge endpoint instead of running our
   *        own. Falls back to internal limiter when not provided.
   */
  constructor({ fs, checkRateLimit } = {}) {
    this.fs = fs;
    this.checkRateLimit = checkRateLimit;
    this.nonces = new NonceStore({
      ttlMs: CONFIG.nonceTtlMs,
      max: CONFIG.nonceStoreMax,
    });
    this.walletBuckets = new TokenBucketRegistry({
      capacity: CONFIG.walletBucketCapacity,
      refillMs: CONFIG.walletBucketRefillMs,
    });
    this.ipBuckets = new TokenBucketRegistry({
      capacity: CONFIG.ipBucketCapacity,
      refillMs: CONFIG.ipBucketRefillMs,
    });
  }

  /**
   * Handle POST /api/ddrm/auth-challenge
   * Body: { wallet: '0x…' }
   * Reply: { nonce, expiresAt, statement }
   */
  async handleChallenge(req, res, body, clientIP) {
    if (this.checkRateLimit && !this.checkRateLimit("relayer-challenge", clientIP)) {
      return reply(res, 429, { error: "rate_limit", retryAfter: 60 });
    }

    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      return reply(res, 400, { error: "invalid_json" });
    }
    const wallet = typeof parsed.wallet === "string" ? parsed.wallet.trim() : "";
    if (!isEvmAddress(wallet)) {
      return reply(res, 400, { error: "invalid_wallet" });
    }

    const challenge = this.nonces.issue(wallet);
    return reply(res, 200, {
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      statement: CONFIG.statement,
    });
  }

  /**
   * Handle POST /api/ddrm/lit-action
   * Headers: X-PC2-Wallet, X-PC2-Sig, X-PC2-Nonce
   * Body:    { code: string, js_params: object }
   * Reply:   verbatim Chipotle response (or 4xx surfaced unchanged)
   */
  async handleLitAction(req, res, body, clientIP) {
    const wallet = String(req.headers["x-pc2-wallet"] || "").trim().toLowerCase();
    const signature = String(req.headers["x-pc2-sig"] || "").trim();
    const nonce = String(req.headers["x-pc2-nonce"] || "").trim();

    // ── 1. Header sanity ─────────────────────────────────────────────────
    if (!isEvmAddress(wallet) || !signature || !nonce) {
      return reply(res, 401, { error: "missing_auth_headers" });
    }

    // ── 2. Per-IP and per-wallet rate limit (cheap; runs before crypto) ──
    const ipBucket = this.ipBuckets.consume(clientIP);
    if (!ipBucket.ok) {
      res.setHeader("Retry-After", Math.ceil(ipBucket.retryAfterMs / 1000));
      return reply(res, 429, { error: "ip_rate_limit" });
    }
    const walletBucket = this.walletBuckets.consume(wallet);
    if (!walletBucket.ok) {
      res.setHeader("Retry-After", Math.ceil(walletBucket.retryAfterMs / 1000));
      return reply(res, 429, { error: "wallet_rate_limit" });
    }

    // ── 3. Consume the nonce (single-use) ────────────────────────────────
    const nonceCheck = this.nonces.consume(nonce, wallet);
    if (!nonceCheck.ok) {
      return reply(res, 401, { error: nonceCheck.reason });
    }

    // ── 4. Recover signer and constant-time-compare with claimed wallet ──
    const message = buildRelayerAuthMessage({
      wallet,
      nonce,
      issuedAt: nonceCheck.issuedAt,
    });
    let recovered;
    try {
      recovered = recoverPersonalSign(message, signature);
    } catch (err) {
      // The recover function is intentionally a stub at scaffold-time — see
      // top of file. At promote-time this becomes the real recover.
      return reply(res, 500, {
        error: "recover_not_implemented",
        hint: "scaffold-only; promote recoverPersonalSign() before wiring routes",
      });
    }
    if (!constantTimeEqualHex(recovered, wallet)) {
      return reply(res, 401, { error: "signature_mismatch" });
    }

    // ── 5. Allowlist check (Mode B; Mode A returns true) ────────────────
    if (!walletAllowed(wallet, this.fs)) {
      return reply(res, 403, { error: "wallet_not_allowed" });
    }

    // ── 6. Forward to Chipotle (STUB — gated on C-1 + C-2 promote) ──────
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      return reply(res, 400, { error: "invalid_json_body" });
    }
    const code = typeof parsed.code === "string" ? parsed.code : null;
    const jsParams =
      parsed.js_params && typeof parsed.js_params === "object"
        ? parsed.js_params
        : {};
    if (!code) {
      return reply(res, 400, { error: "missing_code" });
    }

    let upstream;
    try {
      upstream = await this._forwardToChipotle({ code, jsParams });
    } catch (err) {
      // THROW_STUB: hard 503 keeps the pc2-node Tier-0 fallback path clean
      // — it sees 503 and falls through to Tier 1–4 just like the design.
      console.warn("[lit-relay] forward stubbed:", err.message);
      return reply(res, 503, { error: "relayer_not_yet_implemented" });
    }

    // ── 7. Audit log + verbatim response ─────────────────────────────────
    console.log(
      `[relayer] wallet=${wallet} ip=${clientIP} ` +
        `action_chars=${code.length} status=${upstream.status} ` +
        `elapsed_ms=${upstream.elapsedMs}`,
    );

    res.writeHead(upstream.status, {
      "Content-Type": upstream.contentType || "application/json",
    });
    res.end(upstream.body);
  }

  /**
   * Handle GET /api/ddrm/relayer/health
   * Returns { relayer: 'up', chipotle_reachable, key_loaded } — no secret material.
   */
  async handleHealth(req, res) {
    let keyLoaded = false;
    try {
      // Read & parse but do not echo. Just confirm `usageKey` exists.
      const raw = this.fs.readFileSync(CONFIG.ddrmConfigPath, "utf8");
      const cfg = JSON.parse(raw);
      keyLoaded =
        typeof cfg.usageKey === "string" && cfg.usageKey.length >= 16;
    } catch {
      keyLoaded = false;
    }
    return reply(res, 200, {
      relayer: "up",
      chipotle_reachable: null, // probe added at promote-time
      key_loaded: keyLoaded,
      mode: _cachedAllowlist ? "B" : "A",
    });
  }

  // ── Private ───────────────────────────────────────────────────────────

  async _forwardToChipotle({ code, jsParams }) {
    // THROW_STUB — production write is gated on C-1 (key rotation).
    // When C-2 lands, this body becomes:
    //
    //   const cfg = JSON.parse(this.fs.readFileSync(CONFIG.ddrmConfigPath, 'utf8'));
    //   const apiKey = cfg.usageKey;
    //   const apiUrl = cfg.apiUrl || CONFIG.chipotleApiUrl;
    //   const t0 = Date.now();
    //   const resp = await fetch(`${apiUrl}/core/v1/lit_action`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    //     body: JSON.stringify({ code, js_params: jsParams }),
    //   });
    //   const text = await resp.text();
    //   return {
    //     status: resp.status,
    //     contentType: resp.headers.get('content-type'),
    //     body: text,
    //     elapsedMs: Date.now() - t0,
    //   };
    throw new Error(
      "[lit-relay] _forwardToChipotle is intentionally stubbed in scaffold; promote at v1.2.8.0 deploy",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (small, pure, testable)
// ─────────────────────────────────────────────────────────────────────────────

function isEvmAddress(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function constantTimeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a).toLowerCase().replace(/^0x/, ""), "hex");
  const bBuf = Buffer.from(String(b).toLowerCase().replace(/^0x/, ""), "hex");
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function reply(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire-in snippet — paste into deploy/web-gateway/index.js next to the
// existing `if (url.pathname === "/api/ddrm/provision" && req.method === "GET")`
// branches. (Two of those exist today — at lines 2139 and 2985 in index.js.
// The relayer routes go in the same dispatcher block as the line-2985 one.)
// ─────────────────────────────────────────────────────────────────────────────
//
// import { LitRelayer } from "./lib/lit-relay.js";
//
// const litRelayer = new LitRelayer({ fs, checkRateLimit });
//
// // … inside the request dispatcher …
//
// if (url.pathname === "/api/ddrm/auth-challenge" && req.method === "POST") {
//   const body = await readBody(req);
//   return litRelayer.handleChallenge(req, res, body, clientIP);
// }
//
// if (url.pathname === "/api/ddrm/lit-action" && req.method === "POST") {
//   const body = await readBody(req);
//   return litRelayer.handleLitAction(req, res, body, clientIP);
// }
//
// if (url.pathname === "/api/ddrm/relayer/health" && req.method === "GET") {
//   return litRelayer.handleHealth(req, res);
// }
//
// (`readBody` already exists in index.js as the same async-collect helper used
// by the other POST endpoints — confirm at promote-time.)
