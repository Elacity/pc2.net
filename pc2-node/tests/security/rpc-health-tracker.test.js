/**
 * REGRESSION TEST: RPC health tracker (RPC-PROXY-UNIFICATION-2026-05)
 *
 * Why this test exists
 * --------------------
 * The dDRM video playback failure root-caused on 2026-05-27 was triggered
 * by an exhausted Tenderly RPC quota baked into PSSH metadata. The Lit
 * Action's `evmContractConditions` check called that RPC, got back a 5xx /
 * quota-error JSON body, and silently degraded to `access_denied` — so the
 * legitimate owner saw "access tokens" and could not play their own video.
 *
 * The fix introduced a process-wide health tracker in
 * `pc2-node/src/utils/rpc.ts`:
 *   - `markRpcUnhealthy(url, cooldownMs?)` — sideline a URL for a period
 *   - `isRpcHealthy(url)` — true unless live unhealthy mark
 *   - `getHealthyBaseRpcUrls()` — pool filter (with fallback when empty)
 *   - `resetRpcHealth()` — test-only nuke
 *
 * If any of these guarantees regress, the production fix silently breaks
 * and the bug returns. This test locks the contract in place.
 *
 * Coupled fix sites (all in this branch):
 *   - pc2-node/src/utils/rpc.ts            (the tracker itself)
 *   - pc2-node/src/static.ts               (proxy uses getHealthyBaseRpcUrls)
 *   - pc2-node/src/services/ContentIndexerService.ts (indexer skips dead)
 *   - pc2-node/src/api/media.ts            (PSSH override — separate test)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  initBaseRpcPool,
  markRpcUnhealthy,
  isRpcHealthy,
  getHealthyBaseRpcUrls,
  resetRpcHealth,
  getBaseRpcUrls,
} = await import('../../src/utils/rpc.ts');

const TEST_URLS = [
  'https://primary.example/',
  'https://secondary.example/',
  'https://tertiary.example/',
];

function freshPool(cooldownMs) {
  initBaseRpcPool(TEST_URLS, undefined, '', cooldownMs);
  resetRpcHealth();
}

test('markRpcUnhealthy sidelines a URL; isRpcHealthy reports false until cooldown', () => {
  freshPool(60_000);
  const url = TEST_URLS[0];

  assert.equal(isRpcHealthy(url), true, 'fresh URL must be healthy');
  markRpcUnhealthy(url);
  assert.equal(isRpcHealthy(url), false, 'just-marked URL must be unhealthy');
});

test('isRpcHealthy auto-clears expired marks (cooldown elapsed)', () => {
  freshPool(60_000);
  const url = TEST_URLS[0];

  markRpcUnhealthy(url, 1); // 1 ms cooldown — already expired by the next tick
  // Spin until Date.now() has moved past 1 ms. Avoids fake timers.
  const start = Date.now();
  while (Date.now() - start < 3) { /* eslint-disable-line no-empty */ }
  assert.equal(
    isRpcHealthy(url),
    true,
    'URL must recover automatically once cooldown elapses (lazy delete on read)',
  );
});

test('markRpcUnhealthy respects custom cooldown override', () => {
  freshPool(60_000);
  const url = TEST_URLS[0];

  markRpcUnhealthy(url, 5_000);
  assert.equal(isRpcHealthy(url), false, '5s mark still active immediately after');
});

test('markRpcUnhealthy ignores falsy URLs (no crash, no entry)', () => {
  freshPool(60_000);

  // Must not throw — the production code passes user input through here
  // and we never want a bad URL to take down the whole pool.
  markRpcUnhealthy('');
  markRpcUnhealthy(undefined);
  markRpcUnhealthy(null);

  // And the real URLs are still all healthy.
  for (const u of TEST_URLS) assert.equal(isRpcHealthy(u), true);
});

test('getHealthyBaseRpcUrls excludes sidelined URLs in pool order', () => {
  freshPool(60_000);
  markRpcUnhealthy(TEST_URLS[1]);

  const healthy = getHealthyBaseRpcUrls();
  assert.deepEqual(
    healthy,
    [TEST_URLS[0], TEST_URLS[2]],
    'middle URL must be filtered out; order of survivors preserved',
  );
});

test('getHealthyBaseRpcUrls falls back to FULL pool when every URL is unhealthy', () => {
  // This is the production invariant that prevents "all upstreams dead =
  // serve a fake empty list and crash". Better to retry recovering RPCs
  // than fail every request — see rpc.ts line 119-122 for the comment.
  freshPool(60_000);
  for (const u of TEST_URLS) markRpcUnhealthy(u);

  const healthy = getHealthyBaseRpcUrls();
  assert.deepEqual(
    healthy,
    TEST_URLS,
    'fallback must return the unfiltered pool when every URL is sidelined',
  );
});

test('resetRpcHealth clears all marks (test-only escape hatch)', () => {
  freshPool(60_000);
  for (const u of TEST_URLS) markRpcUnhealthy(u);

  resetRpcHealth();
  for (const u of TEST_URLS) {
    assert.equal(isRpcHealthy(u), true, `${u} must be healthy after reset`);
  }
});

test('initBaseRpcPool replaces the pool and resets health state', () => {
  freshPool(60_000);
  markRpcUnhealthy(TEST_URLS[0]);
  assert.equal(isRpcHealthy(TEST_URLS[0]), false);

  // Re-init clears health (this is the documented behavior at rpc.ts line 184)
  initBaseRpcPool(TEST_URLS, undefined, '', 60_000);
  assert.equal(
    isRpcHealthy(TEST_URLS[0]),
    true,
    'initBaseRpcPool must clear the unhealthy map (clean-slate semantics)',
  );

  // And the pool itself was replaced
  const live = getBaseRpcUrls();
  assert.deepEqual(live, TEST_URLS, 'pool must reflect the URLs we passed in');
});
