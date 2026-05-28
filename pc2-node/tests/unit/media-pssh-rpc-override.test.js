/**
 * REGRESSION TEST: media.ts PSSH-baked-RPC override (RPC-PROXY-UNIFICATION-2026-05)
 *
 * The single line that fixes legacy dDRM video assets
 * ---------------------------------------------------
 * Every encrypted media asset minted before this branch shipped has a
 * Tenderly RPC URL baked into its PSSH metadata at encode time. When a
 * viewer plays the asset back, the Lit Action loads PSSH, extracts the
 * `rpc` field, and uses it to evaluate the ERC-1155 ownership check.
 * Tenderly's free tier exhausted on 2026-05-27 → every legacy video
 * silently returned `access_denied`, even for the rightful owner.
 *
 * We can't rewrite already-encoded PSSH on disk. The fix is to override
 * `litParams.rpc` at the SERVER boundary, before forwarding the Lit
 * Action call, using a healthy server-managed RPC instead of whatever
 * was baked in years ago.
 *
 * The override lives in `pc2-node/src/api/media.ts` around line 374:
 *
 *     const overrideRpc = getPublicProxyUrlForLit() || getBaseRpcUrlForLit();
 *     ...
 *     rpc: overrideRpc || encData.rpc || '',
 *
 * If a future refactor accidentally removes that override, EVERY video
 * minted before 2026-05-28 becomes unplayable again the moment any
 * embedded RPC degrades. There is no real-world test that catches this
 * regression without owning a legacy asset, so we lock the pattern in
 * via a source-scan instead.
 *
 * This is the same "lock the fix in literal source" pattern used by
 * setup-permissions-osascript.test.js and db-getsetting-resource-limits.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MEDIA_SRC = join(__dirname, '..', '..', 'src', 'api', 'media.ts');

function readSource() {
  return readFileSync(MEDIA_SRC, 'utf-8').replace(/\r\n/g, '\n');
}

/** Strip TS comments so prose mentioning the patterns doesn't false-positive. */
function stripComments(source) {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return s;
}

test('media.ts imports getPublicProxyUrl and getBaseRpcUrl from utils/rpc', () => {
  const code = stripComments(readSource());

  assert.ok(
    /getPublicProxyUrl[A-Za-z]*\s*[,}=]/.test(code),
    'media.ts must reference getPublicProxyUrl (used to derive overrideRpc). ' +
    'Removing this import means PSSH-baked RPCs will be used as-is, breaking ' +
    'every legacy video asset the moment its baked-in RPC degrades.',
  );

  assert.ok(
    /getBaseRpcUrl[A-Za-z]*\s*[,}=]/.test(code),
    'media.ts must reference getBaseRpcUrl as the fallback when no public proxy ' +
    'is configured. Without it the override resolves to empty string and the ' +
    'Lit Action loses any healthy RPC to call.',
  );
});

test('media.ts computes an overrideRpc value (proxy → pool head fallback)', () => {
  const code = stripComments(readSource());

  // Match either variable name (`overrideRpc`) or the OR-chain that produces it.
  // The intent matters more than the exact identifier.
  const hasOverride =
    /overrideRpc\s*=\s*getPublicProxyUrl/.test(code) ||
    /rpc:\s*getPublicProxyUrl\w*\(\)\s*\|\|\s*getBaseRpcUrl\w*\(\)/.test(code);

  assert.ok(
    hasOverride,
    'media.ts must compute overrideRpc as `getPublicProxyUrl() || getBaseRpcUrl()`. ' +
    'This is the line that retroactively fixes legacy dDRM video assets whose ' +
    'PSSH metadata baked in a now-degraded RPC (e.g. exhausted Tenderly quota).',
  );
});

test('litParams.rpc takes overrideRpc, not the PSSH-baked encData.rpc directly', () => {
  const code = stripComments(readSource());

  // The current production line is:
  //   rpc: overrideRpc || encData.rpc || '',
  // which means "always prefer server-managed RPC; only fall back to the
  // PSSH-baked one if we have no override". If anyone reverses that
  // precedence, legacy assets break again.
  const overridesFirst =
    /rpc:\s*overrideRpc\b/.test(code) ||
    /rpc:\s*getPublicProxyUrl\w*\(\)\s*\|\|\s*getBaseRpcUrl\w*\(\)/.test(code);

  assert.ok(
    overridesFirst,
    'litParams.rpc assignment must prefer the server-side overrideRpc over ' +
    'encData.rpc. Reverse this and the dDRM legacy-asset playback fix is undone.',
  );

  // And the order must NOT be encData.rpc first.
  const psshFirstAntiPattern = /rpc:\s*encData\.rpc\s*\|\|\s*overrideRpc/.test(code);
  assert.ok(
    !psshFirstAntiPattern,
    'litParams.rpc must NOT prefer encData.rpc over overrideRpc. The PSSH-baked ' +
    'value is the very thing we are trying to bypass for legacy assets.',
  );
});

test('media.ts logs the override decision (operational visibility)', () => {
  const code = stripComments(readSource());

  // We want operators to see in logs when a legacy asset was rescued by
  // the override. This is the diagnostic we used to root-cause the bug;
  // without it, future quota exhaustion incidents are harder to triage.
  assert.ok(
    /Overriding PSSH-baked rpc/i.test(code),
    'media.ts must log "Overriding PSSH-baked rpc" when overrideRpc differs from ' +
    'encData.rpc. This is the breadcrumb that lets operators correlate playback ' +
    'failures with PSSH-baked RPC degradation. See media.ts ~line 376.',
  );
});
