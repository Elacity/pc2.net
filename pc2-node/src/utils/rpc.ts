/**
 * Shared Base RPC utility
 *
 * Provides round-robin RPC endpoint selection with automatic failover.
 * Initialized from config.content_indexer.rpc_urls (the node-wide RPC pool).
 *
 * Future: supernodes could offer cached/load-balanced Base RPC as a Tier 2
 * service, reducing public RPC dependency for the entire PC2 network.
 */

import { createLogger } from './logger.js';

const log = createLogger('rpc');

// IMPORTANT: ordering matters beyond just rotation.
// The media-encode pipeline (and Lit-Action access checks for any asset
// minted on this node) bakes `getBaseRpcUrl()` — i.e. the URL at index 0
// — into the encrypted PSSH metadata as a fixed `rpc` field. The Lit
// Action receives that single URL with no fallback, so if index 0 ever
// returns HTTP 4xx/5xx, the action's `gateway.hasAccessByContentId(...)`
// silently resolves to `false` (the action does `.catch(() => false)`)
// and the user gets a misleading `access_denied` even though they are
// the on-chain holder.
//
// Therefore index 0 MUST be a key-less, rate-tolerant public RPC. Keyed
// providers (Tenderly, Alchemy, Infura) belong at the back of the list:
// they're useful as `baseRpcCall` failovers but must not become the
// PSSH-embedded default. See the May 2026 video-playback incident for
// the failure mode.
//
// Pool composition (smoke-tested 2026-05-28):
//   1. publicnode      — key-less, rate-tolerant, fast (~270 ms)
//   2. drpc.org        — key-less, fastest (~144 ms), good failover
//   3. mainnet.base.org — Coinbase official, sometimes 429s under burst
//   4. blastapi public — key-less, mid-tier (~340 ms)
//   5. meowrpc         — key-less, occasionally flaky
//   6. 1rpc.io/base    — key-less, slower (~600 ms), privacy-friendly
//
// Removed: Tenderly endpoint (keyed, exhausted quota → HTTP 403,
// caused the May 2026 video-playback incident).
const DEFAULT_BASE_RPC_URLS = [
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://mainnet.base.org',
  'https://base-mainnet.public.blastapi.io',
  'https://base.meowrpc.com',
  'https://1rpc.io/base',
];

const DEFAULT_TIMEOUT_MS = 15_000;

let rpcUrls: string[] = [...DEFAULT_BASE_RPC_URLS];
let currentIndex = 0;
let supernodePrependCount = 0;

// Operator-configured public proxy URL — pointing at THIS node's
// /api/rpc/base when the node is publicly reachable. Embedded into PSSH
// `rpc` field at media-encode time and into non-media Lit-encrypt
// conditions, so the Lit Action's `gateway.hasAccessByContentId(...)`
// flows through our caching + multi-RPC fallback proxy instead of a
// single public RPC. Empty string = unset = self-hosted node behind NAT
// = use the rotation pool's current head as before. See
// `.cursor/tasks/RPC-PROXY-UNIFICATION-2026-05`.
let publicProxyUrl = '';

// ─── RPC health tracking ────────────────────────────────────────────────────
//
// Per-URL "unhealthy until" timestamps. When an RPC keeps returning 5xx
// or quota/rate-limit errors, callers mark it unhealthy via
// `markRpcUnhealthy(url)`. Subsequent attempts skip that URL until the
// cooldown expires — preventing the proxy and `baseRpcCall` from
// wasting their first attempt of every request on a known-failing
// upstream. Per Irzhy's design note (2026-05-28):
//   "ensure auto-rotate when constantly receiving 5xx error family
//    from the rpc"
//
// Cooldown defaults to 60 s — long enough to give a struggling RPC
// breathing room, short enough that a transient blip recovers fast.
// Operators can tune via `config.blockchain.rpc_unhealthy_cooldown_ms`.
//
// Safety net: if every URL gets marked unhealthy at once (e.g. all
// upstreams hit a coordinated burst), `getHealthyBaseRpcUrls()` falls
// back to returning the full pool — better to retry a recovering RPC
// than fail every request.
const DEFAULT_UNHEALTHY_COOLDOWN_MS = 60_000;
let unhealthyCooldownMs = DEFAULT_UNHEALTHY_COOLDOWN_MS;
const unhealthyUntil = new Map<string, number>();

/**
 * Mark an RPC URL as unhealthy. The URL is skipped by
 * `getHealthyBaseRpcUrls()` and any rotation logic that consults it,
 * until the cooldown elapses.
 *
 * @param url           The RPC URL that just failed.
 * @param cooldownMs    Optional override; defaults to the operator-
 *                      configured cooldown (or 60 s).
 */
export function markRpcUnhealthy(url: string, cooldownMs?: number): void {
  if (!url) return;
  const ttl = typeof cooldownMs === 'number' && cooldownMs > 0 ? cooldownMs : unhealthyCooldownMs;
  const expiry = Date.now() + ttl;
  unhealthyUntil.set(url, expiry);
  log.info(`[health] RPC marked unhealthy for ${ttl}ms: ${url}`);
}

/** True when `url` has no live unhealthy mark. */
export function isRpcHealthy(url: string): boolean {
  const expiry = unhealthyUntil.get(url);
  if (!expiry) return true;
  if (Date.now() >= expiry) {
    unhealthyUntil.delete(url);
    return true;
  }
  return false;
}

/**
 * The pool, with currently-unhealthy URLs removed. If filtering would
 * leave the pool empty (every upstream is sidelined simultaneously),
 * returns the full pool unchanged — better to retry recovering RPCs
 * than fail every request. Order matches `getBaseRpcUrls()`.
 */
export function getHealthyBaseRpcUrls(): string[] {
  const all = [...rpcUrls];
  const healthy = all.filter((u) => isRpcHealthy(u));
  return healthy.length > 0 ? healthy : all;
}

/** Test-only: clear all unhealthy marks. */
export function resetRpcHealth(): void {
  unhealthyUntil.clear();
}

/**
 * Initialize the shared Base RPC pool.
 *
 * @param urls          Base list of RPC URLs (from config). Falls back to the
 *                      hardcoded `DEFAULT_BASE_RPC_URLS` when empty/undefined.
 * @param supernodeUrls Authoritative supernode-backed RPC endpoints. When
 *                      provided (typically via the `SUPERNODE_RPC_URLS`
 *                      env var), these are **prepended** to the effective
 *                      pool so they are tried first. The existing public
 *                      fallbacks remain as a safety net — if a supernode
 *                      URL 404s / 503s / rate-limits, the rotation logic
 *                      falls through exactly as before.
 *
 *                      Empty array or undefined = no supernodes configured;
 *                      the pool behaves identically to the pre-supernode
 *                      implementation. This is the default for user nodes
 *                      that have not opted in.
 *
 * @param proxyUrl      Optional publicly-reachable URL pointing at this
 *                      node's own `/api/rpc/base` proxy. Used by the
 *                      media-encode pipeline and the non-media Lit path
 *                      to embed a controlled, caching, multi-RPC-fallback
 *                      RPC into PSSH / Lit access conditions instead of a
 *                      single public RPC. NOT added to the rotation pool
 *                      itself — this is a separate plumb-through used
 *                      only at PSSH/Lit-call sites. Empty/undefined =
 *                      preserve pre-task behavior (use pool head).
 *
 * @param healthCooldownMs Optional override for how long an RPC URL is
 *                      sidelined after a 5xx / quota error. Defaults to
 *                      60 s. Lower = faster retry of a recovering RPC.
 *                      Higher = less load on a struggling RPC. Operators
 *                      tune via `config.blockchain.rpc_unhealthy_cooldown_ms`.
 */
export function initBaseRpcPool(
  urls?: string[],
  supernodeUrls?: string[],
  proxyUrl?: string,
  healthCooldownMs?: number,
): void {
  const baseList = urls && urls.length > 0 ? urls : DEFAULT_BASE_RPC_URLS.slice();
  const prepend = (supernodeUrls ?? []).filter((u) => typeof u === 'string' && u.length > 0);
  rpcUrls = [...prepend, ...baseList];
  supernodePrependCount = prepend.length;
  currentIndex = 0;
  publicProxyUrl = (proxyUrl ?? '').trim();
  unhealthyCooldownMs =
    typeof healthCooldownMs === 'number' && healthCooldownMs > 0
      ? healthCooldownMs
      : DEFAULT_UNHEALTHY_COOLDOWN_MS;
  unhealthyUntil.clear();

  const supernodeNote = prepend.length > 0 ? ` (${prepend.length} supernode first)` : '';
  log.info(`RPC pool initialized with ${rpcUrls.length} endpoints${supernodeNote}: ${rpcUrls[0]}...`);
  if (publicProxyUrl) {
    log.info(`Public proxy URL configured for PSSH / Lit embed: ${publicProxyUrl}`);
  }
  if (unhealthyCooldownMs !== DEFAULT_UNHEALTHY_COOLDOWN_MS) {
    log.info(`RPC unhealthy cooldown: ${unhealthyCooldownMs}ms (default ${DEFAULT_UNHEALTHY_COOLDOWN_MS}ms)`);
  }
}

/**
 * Return the operator-configured public proxy URL (this node's own
 * `/api/rpc/base`, exposed to the public internet) or the empty string
 * when unset. Callers that bake an `rpc` value into PSSH or Lit access
 * conditions should prefer this over `getBaseRpcUrl()` so the Lit Action
 * benefits from our cache + fallback layer.
 */
export function getPublicProxyUrl(): string {
  return publicProxyUrl;
}

/** Read-only view of pool state for diagnostics and logging. */
export function getBaseRpcPoolInfo(): {
  urls: string[];
  currentIndex: number;
  supernodeCount: number;
} {
  return {
    urls: [...rpcUrls],
    currentIndex,
    supernodeCount: supernodePrependCount,
  };
}

export function getBaseRpcUrl(): string {
  return rpcUrls[currentIndex % rpcUrls.length];
}

export function rotateBaseRpc(): string {
  currentIndex = (currentIndex + 1) % rpcUrls.length;
  log.debug(`Rotated to RPC: ${rpcUrls[currentIndex]}`);
  return rpcUrls[currentIndex];
}

export function getBaseRpcUrls(): string[] {
  return [...rpcUrls];
}

/**
 * True when an HTTP status is in the 5xx error family.
 * Pulled out so callers (and the static.ts proxy) share a single
 * definition of "this RPC is sick, mark it unhealthy".
 */
export function isHttp5xx(status: number | undefined | null): boolean {
  return typeof status === 'number' && status >= 500 && status < 600;
}

export async function baseRpcCall(method: string, params: any[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  let lastError: Error | null = null;

  // Skip up to N attempts equal to pool size. We rotate on every error
  // so we never retry the same URL twice. If the current head is
  // unhealthy at start, advance until we find a healthy one (or fall
  // through to "try anyway" when every URL is sidelined).
  for (let attempt = 0; attempt < rpcUrls.length; attempt++) {
    let url = getBaseRpcUrl();
    let skipped = 0;
    while (!isRpcHealthy(url) && skipped < rpcUrls.length) {
      rotateBaseRpc();
      url = getBaseRpcUrl();
      skipped++;
    }
    // skipped === rpcUrls.length means everything is unhealthy — fall
    // through and try anyway (the cooldown might be over for someone).

    let httpStatus: number | undefined;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = resp.status;

      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);

      const json = await resp.json() as { result?: any; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

      return json.result;
    } catch (err: any) {
      lastError = err;
      log.debug(`RPC call ${method} failed on ${url}: ${err.message}`);
      // Mark unhealthy on 5xx or transport-level error so subsequent
      // calls skip this URL until the cooldown elapses. 4xx other than
      // 429/quota errors (e.g. a malformed body the operator sent) are
      // not the RPC's fault — don't sideline for those. AbortError /
      // network failure has no httpStatus and counts as transport.
      if (httpStatus === undefined || isHttp5xx(httpStatus) || httpStatus === 429 || httpStatus === 408) {
        markRpcUnhealthy(url);
      }
      rotateBaseRpc();
    }
  }

  throw lastError || new Error(`All ${rpcUrls.length} RPC endpoints failed for ${method}`);
}
