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
 *      blind public RPC. `resolveLitAccessRpc()` resolves, most → least
 *      resilient:
 *        a. operator-pinned config.blockchain.public_proxy_url
 *        b. zero-config auto-route through THIS node's own public
 *           /api/rpc/base proxy (rotating + health-tracked + cached),
 *           derived from the request, guarded against loopback/LAN
 *        c. a currently-HEALTHY public RPC (skips recently-5xx/429
 *           upstreams), never the blind pool head
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

test('resolveLitAccessRpc auto-routes through this node\'s own /api/rpc/base', () => {
  const code = stripComments(readSource());

  assert.ok(
    /getBaseUrl\s*\(\s*req\s*\)/.test(code),
    'resolveLitAccessRpc must derive this node\'s public origin from the ' +
    'request via getBaseUrl(req) so playback that reaches us via our public ' +
    'hostname auto-routes the Lit Action through our own proxy.',
  );

  assert.ok(
    /\/api\/rpc\/base/.test(code),
    'resolveLitAccessRpc must build the `${origin}/api/rpc/base` proxy URL — ' +
    'our rotating, health-tracked, cached RPC proxy. Without this the Lit ' +
    'Action falls back to a single public RPC and playback fails intermittently.',
  );
});

test('auto-route is guarded against loopback / LAN (Lit can\'t reach localhost)', () => {
  const code = stripComments(readSource());

  assert.ok(
    /function\s+isPubliclyReachableHost\s*\(/.test(code),
    'media.ts must define isPubliclyReachableHost(). The Lit network runs ' +
    'OFF this node, so a localhost/192.168.x.x proxy URL is unreachable — we ' +
    'must NOT auto-route to it, and must fall back to a public RPC instead.',
  );

  // Must screen out at least loopback and the common RFC1918 ranges.
  assert.ok(code.includes('127.0.0.1'), 'isPubliclyReachableHost must reject 127.0.0.1');
  assert.ok(code.includes('localhost'), 'isPubliclyReachableHost must reject localhost');
  assert.ok(code.includes('192\\.168') || code.includes('192.168'),
    'isPubliclyReachableHost must reject 192.168.0.0/16');
  assert.ok(code.includes('172\\.(1[6-9]') || code.includes('172.16'),
    'isPubliclyReachableHost must reject the 172.16.0.0/12 range');
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
    'media/init must compute overrideRpc via `await resolveLitAccessRpc(req, ...)`.',
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
