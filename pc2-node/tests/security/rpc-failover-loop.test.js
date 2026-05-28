/**
 * REGRESSION TEST: baseRpcCall failover loop (RPC-PROXY-UNIFICATION-2026-05)
 *
 * Why this test exists
 * --------------------
 * `baseRpcCall()` is the single chokepoint for every server-initiated
 * Base RPC call. The 2026-05-27 dDRM video bug surfaced because the
 * encode-time PSSH hardcoded a single Tenderly URL — there was no
 * pool-level failover at the call site. The fix:
 *   1. Always go through `baseRpcCall()` (which iterates the pool).
 *   2. On 5xx / 429 / 408 / transport failure, mark the URL unhealthy
 *      so subsequent rotations skip it for the cooldown period.
 *   3. On every error, rotate so we never retry the same URL twice.
 *
 * If the rotation OR the unhealthy-marking regress, we revert to the
 * "one bad RPC takes down the whole node" failure mode that broke
 * dDRM playback for owners. Lock both in here.
 *
 * Strategy
 * --------
 * Stub `globalThis.fetch` with a programmable mock that returns
 * deterministic responses per call. Run `baseRpcCall()`, assert which
 * URLs were tried in which order and whether each one was marked
 * unhealthy. No real network, no flakiness, sub-millisecond runtime.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  initBaseRpcPool,
  baseRpcCall,
  resetRpcHealth,
  isRpcHealthy,
} = await import('../../src/utils/rpc.ts');

const URLS = [
  'https://a.example/',
  'https://b.example/',
  'https://c.example/',
];

const originalFetch = globalThis.fetch;
let calls = [];

/** Build a Response-shaped object that satisfies what baseRpcCall reads. */
function jsonResponse({ status = 200, body = { result: 'ok' } } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** Install a queue-driven fetch mock. Each call shifts one entry. */
function installMockFetch(queue) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const next = queue.shift();
    if (typeof next === 'function') return next(url);
    if (next instanceof Error) throw next;
    return jsonResponse(next ?? {});
  };
}

beforeEach(() => {
  initBaseRpcPool(URLS, undefined, '', 60_000);
  resetRpcHealth();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('5xx on first URL → rotate to next; second URL 200 → success', async () => {
  installMockFetch([
    { status: 503, body: { error: 'server overloaded' } }, // URL A
    { status: 200, body: { result: '0x1' } },              // URL B
  ]);

  const result = await baseRpcCall('eth_chainId', []);
  assert.equal(result, '0x1', 'must return the second URL\'s result');
  assert.equal(calls.length, 2, 'must have rotated exactly once');
  assert.equal(calls[0], URLS[0]);
  assert.equal(calls[1], URLS[1]);
  assert.equal(isRpcHealthy(URLS[0]), false, '5xx URL must be sidelined');
  assert.equal(isRpcHealthy(URLS[1]), true, '200 URL must remain healthy');
});

test('429 (rate limit) on first URL → mark unhealthy + rotate', async () => {
  installMockFetch([
    { status: 429, body: { error: 'too many requests' } },
    { status: 200, body: { result: '0x2' } },
  ]);

  const result = await baseRpcCall('eth_chainId', []);
  assert.equal(result, '0x2');
  assert.equal(isRpcHealthy(URLS[0]), false, '429 must mark unhealthy');
});

test('408 (request timeout) on first URL → mark unhealthy', async () => {
  installMockFetch([
    { status: 408, body: { error: 'request timeout' } },
    { status: 200, body: { result: '0x3' } },
  ]);

  await baseRpcCall('eth_chainId', []);
  assert.equal(isRpcHealthy(URLS[0]), false, '408 must mark unhealthy');
});

test('200 with json.error body → throws but does NOT sideline (RPC is up)', async () => {
  // This is the subtle case: a 200 response carrying a JSON-RPC error
  // (e.g. "method not found" because of a malformed request) means the
  // operator sent bad input, not that the RPC is unhealthy. The current
  // code intentionally does NOT call markRpcUnhealthy in this branch
  // (see rpc.ts lines 280-287). Lock that in.
  installMockFetch([
    { status: 200, body: { error: { message: 'method not found' } } },
    { status: 200, body: { result: '0x4' } },
  ]);

  await baseRpcCall('eth_chainId', []);
  assert.equal(
    isRpcHealthy(URLS[0]),
    true,
    'A 200 + json.error response means the RPC is alive — must NOT be sidelined',
  );
});

test('transport-level fetch rejection (DNS / TLS) → mark unhealthy', async () => {
  installMockFetch([
    new TypeError('fetch failed: getaddrinfo ENOTFOUND a.example'),
    { status: 200, body: { result: '0x5' } },
  ]);

  const result = await baseRpcCall('eth_chainId', []);
  assert.equal(result, '0x5');
  assert.equal(
    isRpcHealthy(URLS[0]),
    false,
    'A transport failure (no httpStatus) must mark unhealthy',
  );
});

test('every URL fails → throws after exhausting pool (no infinite loop)', async () => {
  installMockFetch([
    { status: 503, body: { error: 'down' } },
    { status: 503, body: { error: 'down' } },
    { status: 503, body: { error: 'down' } },
  ]);

  await assert.rejects(
    baseRpcCall('eth_chainId', []),
    /HTTP 503|All \d+ RPC endpoints failed/,
    'must surface the last error rather than hang',
  );
  assert.equal(calls.length, 3, 'must try each URL in the pool exactly once');
});

test('fully-sidelined pool still attempts requests (fallback behavior)', async () => {
  // Pre-mark every URL as unhealthy. baseRpcCall should still try one
  // (the loop falls through after skipping == pool size), so a recovering
  // RPC can come back. This matches getHealthyBaseRpcUrls' fallback.
  // We use ONE 200 response — the loop should call exactly once.
  globalThis.fetch = async (url) => {
    calls.push(url);
    return jsonResponse({ status: 200, body: { result: '0x6' } });
  };
  calls = [];

  // Sideline all URLs
  const { markRpcUnhealthy } = await import('../../src/utils/rpc.ts');
  for (const u of URLS) markRpcUnhealthy(u);

  const result = await baseRpcCall('eth_chainId', []);
  assert.equal(result, '0x6', 'must succeed via fallback try-anyway path');
  assert.ok(calls.length >= 1, 'must attempt at least one URL even when all sidelined');
});
