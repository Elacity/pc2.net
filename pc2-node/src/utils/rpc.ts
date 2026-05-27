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

const DEFAULT_BASE_RPC_URLS = [
  'https://base.gateway.tenderly.co/3qh3pdc6nLsJ7QdAOn3mNb',
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.meowrpc.com',
];

const DEFAULT_TIMEOUT_MS = 15_000;

let rpcUrls: string[] = [...DEFAULT_BASE_RPC_URLS];
let currentIndex = 0;
let supernodePrependCount = 0;

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
 */
export function initBaseRpcPool(urls?: string[], supernodeUrls?: string[]): void {
  const baseList = urls && urls.length > 0 ? urls : DEFAULT_BASE_RPC_URLS.slice();
  const prepend = (supernodeUrls ?? []).filter((u) => typeof u === 'string' && u.length > 0);
  rpcUrls = [...prepend, ...baseList];
  supernodePrependCount = prepend.length;
  currentIndex = 0;
  const supernodeNote = prepend.length > 0 ? ` (${prepend.length} supernode first)` : '';
  log.info(`RPC pool initialized with ${rpcUrls.length} endpoints${supernodeNote}: ${rpcUrls[0]}...`);
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

export async function baseRpcCall(method: string, params: any[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < rpcUrls.length; attempt++) {
    const url = getBaseRpcUrl();
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);

      const json = await resp.json() as { result?: any; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

      return json.result;
    } catch (err: any) {
      lastError = err;
      log.debug(`RPC call ${method} failed on ${url}: ${err.message}`);
      rotateBaseRpc();
    }
  }

  throw lastError || new Error(`All ${rpcUrls.length} RPC endpoints failed for ${method}`);
}
