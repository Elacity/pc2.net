/**
 * REGRESSION TEST: media.ts Lit-Action RPC resolution (RPC-PROXY-UNIFICATION-2026-05)
 *
 * The problem this locks in
 * -------------------------
 * The Lit Action that gates dDRM playback runs OFF this node and does a
 * single on-chain `gateway.hasAccessByContentId(...)` eth_call with ONE
 * RPC URL we hand it. There is no in-action rotation, and the action
 * swallows network errors with `.catch(() => false)`. So if we pass a
 * momentarily rate-limited / quota-exhausted RPC, the legitimate owner
 * gets a misleading `access_denied` → the "purchase access tokens" error
 * on a video they actually own. This is the May 2026 playback incident.
 *
 * Two failure modes are covered:
 *   1. Legacy assets baked a now-degraded RPC (e.g. exhausted Tenderly)
 *      into their PSSH at encode time. We can't rewrite on-disk PSSH, so
 *      we OVERRIDE `litParams.rpc` at the server boundary.
 *   2. The override itself must resolve to a RESILIENT URL, not a single
 *      blind public RPC — AND it must come ONLY from server-side sources.
 *      `resolveLitAccessRpc()` resolves, most → least resilient:
 *        a. operator-pinned config.blockchain.public_proxy_url
 *        b. a currently-HEALTHY public RPC (skips recently-5xx/429
 *           upstreams), never the blind pool head
 *      It must NEVER derive the URL from the inbound request. `Host` /
 *      `X-Forwarded-Host` are client-controllable; deriving from them lets
 *      an authenticated caller point the off-node access-check eth_call at
 *      an attacker RPC that forges on-chain ownership → CEK released for
 *      content they never bought (security.mdc; SEC audit 2026-05-29 H1).
 *
 * If a future refactor flattens this back to a single static RPC, the
 * intermittent "works on the 2nd try" playback failures return. There is
 * no real-world test that catches this without owning a legacy asset and
 * a degraded RPC, so we lock the pattern in via a source-scan — the same
 * approach as setup-permissions-osascript.test.js.
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

test('media.ts defines resolveLitAccessRpc — the single source of Lit RPC truth', () => {
  const code = stripComments(readSource());
  assert.ok(
    /function\s+resolveLitAccessRpc\s*\(/.test(code),
    'media.ts must define resolveLitAccessRpc(). This is the resolver that ' +
    'decides which RPC the Lit Action uses for the on-chain access check. ' +
    'Inlining a single RPC instead reintroduces the intermittent playback bug.',
  );
});

test('resolveLitAccessRpc prefers the operator-pinned public proxy first', () => {
  const code = stripComments(readSource());
  assert.ok(
    /getPublicProxyUrl\s*\(/.test(code),
    'resolveLitAccessRpc must consult getPublicProxyUrl() (config.blockchain.' +
    'public_proxy_url) FIRST so operators can pin a resilient proxy URL.',
  );
});

test('SECURITY: resolveLitAccessRpc must NOT derive the RPC from the request', () => {
  const code = stripComments(readSource());

  // Locate the resolveLitAccessRpc body so we scope the assertions to it.
  const fnStart = code.indexOf('function resolveLitAccessRpc');
  assert.ok(fnStart >= 0, 'resolveLitAccessRpc must exist');
  // Scope to the function's own body: from its signature to the first
  // line-leading `}` (its closing brace — the inline destructure `}` is
  // mid-line so it doesn't match). Avoids bleeding into the next handler,
  // which legitimately references `req`.
  const closeIdx = code.indexOf('\n}', fnStart);
  assert.ok(closeIdx > fnStart, 'resolveLitAccessRpc must have a closing brace');
  const fnSlice = code.slice(fnStart, closeIdx + 2);

  assert.ok(
    !/getBaseUrl\s*\(/.test(fnSlice),
    'resolveLitAccessRpc must NOT call getBaseUrl() — it derives the host from ' +
    'client-controllable Host / X-Forwarded-Host headers. A forged header would ' +
    'point the off-node access-check eth_call at an attacker RPC that forges ' +
    'ownership → CEK released for unowned content (SEC audit H1).',
  );
  assert.ok(
    !/\breq\b/.test(fnSlice),
    'resolveLitAccessRpc must not reference the request object at all — its ' +
    'inputs must be server-side only (pinned proxy + healthy pool).',
  );
  assert.ok(
    !/\/api\/rpc\/base/.test(fnSlice),
    'resolveLitAccessRpc must not synthesise a `${origin}/api/rpc/base` URL from ' +
    'the request. Operators that want the proxy set config.blockchain.public_proxy_url ' +
    '(server-side), which getPublicProxyUrl() returns.',
  );
});

test('SECURITY: the client-host guard helper is gone (no request-derived path to guard)', () => {
  const code = stripComments(readSource());
  assert.ok(
    !/function\s+isPubliclyReachableHost\s*\(/.test(code),
    'isPubliclyReachableHost must no longer exist — it only ever guarded the ' +
    'removed request-derived auto-route. Re-introducing it implies the insecure ' +
    'header-derived RPC path came back (SEC audit H1/M1).',
  );
});

test('resolveLitAccessRpc falls back to a HEALTHY public RPC, not the blind pool head', () => {
  const code = stripComments(readSource());
  assert.ok(
    /getHealthyBaseRpcUrls\s*\(\s*\)/.test(code),
    'resolveLitAccessRpc must use getHealthyBaseRpcUrls() for its last-resort ' +
    'RPC so a recently-rate-limited upstream (5xx/429) is skipped. Using the ' +
    'blind pool head reintroduces the "works on the 2nd try" failure mode.',
  );
});

test('litParams.rpc takes the resolved overrideRpc, not the PSSH-baked encData.rpc', () => {
  const code = stripComments(readSource());

  assert.ok(
    /overrideRpc\s*=\s*await\s+resolveLitAccessRpc\s*\(/.test(code),
    'media/init must compute overrideRpc via `await resolveLitAccessRpc(...)`.',
  );

  // The resolver takes ONLY the PSSH-baked rpc (server-side), never `req`.
  assert.ok(
    !/resolveLitAccessRpc\s*\(\s*req\b/.test(code),
    'resolveLitAccessRpc must NOT be called with the request object — passing ' +
    'req re-opens the client-header-derived RPC vulnerability (SEC audit H1).',
  );

  assert.ok(
    /rpc:\s*overrideRpc\b/.test(code),
    'litParams.rpc must be assigned overrideRpc (the resolved, resilient URL), ' +
    'not encData.rpc directly. The PSSH-baked value is the thing we bypass.',
  );

  const psshFirstAntiPattern = /rpc:\s*encData\.rpc\s*\|\|\s*overrideRpc/.test(code);
  assert.ok(
    !psshFirstAntiPattern,
    'litParams.rpc must NOT prefer encData.rpc over overrideRpc.',
  );
});

test('media.ts logs the override decision (operational visibility)', () => {
  const code = stripComments(readSource());
  assert.ok(
    /Overriding PSSH-baked rpc/i.test(code),
    'media.ts must log "Overriding PSSH-baked rpc" when overrideRpc differs ' +
    'from encData.rpc — the breadcrumb that correlates playback failures with ' +
    'PSSH-baked RPC degradation.',
  );
});
