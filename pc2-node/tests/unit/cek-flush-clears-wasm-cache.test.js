/**
 * REGRESSION TEST: admin CEK flush MUST also clear the WASM handle cache
 * (RELEASE-2026-05-28-DDRM-HARDENING)
 *
 * The policy this locks in (security.mdc §6.4)
 * --------------------------------------------
 * storage.ts maintains two in-process structures that can each return a
 * decrypt result WITHOUT re-running a fresh access check:
 *   - cekSessionCache   — caches recovered CEKs (kid:addr)
 *   - wasmRequestCache  — caches live WASM decrypt handles (sessionId:kid:addr)
 *
 * The admin endpoint `POST /api/storage/admin/cek-cache/flush` is the operator's
 * "revoke everything now" lever. If it clears only cekSessionCache, a flushed
 * buyer could still be served bytes from a cached WASM handle for up to the
 * handle TTL — defeating the purpose of the flush.
 *
 * Policy (security.mdc §6.4): "If future code introduces a new CEK / handle
 * cache, that endpoint MUST be updated to flush it as well."
 *
 * This is a source-scan lock-in (same pattern as
 * decrypt-cid-remap-before-gate.test.js): if a refactor reintroduces a flush
 * path that forgets wasmRequestCache, this fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, '..', '..', 'src', 'api', 'storage.ts');

function readSource() {
  return readFileSync(SRC, 'utf-8').replace(/\r\n/g, '\n');
}

/** Isolate the flushCEKCache function body so unrelated code can't satisfy the assertions. */
function flushCEKCacheBody(source) {
  const start = source.search(/export\s+function\s+flushCEKCache\s*\(/);
  assert.ok(start !== -1, 'storage.ts must define exported flushCEKCache().');

  // The signature itself contains braces (`opts: { kid?… } = {}`), so we must
  // first paren-match the parameter list, then find the body's opening brace
  // AFTER the return-type annotation — not the first '{' overall.
  const paramOpen = source.indexOf('(', start);
  let pDepth = 0;
  let paramClose = -1;
  for (let i = paramOpen; i < source.length; i++) {
    if (source[i] === '(') pDepth++;
    else if (source[i] === ')') {
      pDepth--;
      if (pDepth === 0) { paramClose = i; break; }
    }
  }
  assert.ok(paramClose !== -1, 'Could not bound flushCEKCache() parameter list.');

  const open = source.indexOf('{', paramClose);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('Could not bound flushCEKCache() body.');
}

test('storage.ts defines both decrypt-handle caches', () => {
  const code = readSource();
  assert.ok(/const\s+cekSessionCache\s*=/.test(code), 'expected cekSessionCache definition.');
  assert.ok(/const\s+wasmRequestCache\s*=/.test(code), 'expected wasmRequestCache definition.');
});

test('flushCEKCache clears wasmRequestCache, not just cekSessionCache', () => {
  const body = flushCEKCacheBody(readSource());

  assert.ok(
    /cekSessionCache\.clear\s*\(\s*\)/.test(body),
    'flushCEKCache must clear cekSessionCache on a full flush.',
  );

  assert.ok(
    /wasmRequestCache\.(clear\s*\(\s*\)|delete\s*\()/.test(body),
    'CRITICAL (security.mdc §6.4): flushCEKCache MUST also flush wasmRequestCache. ' +
    'A flush that clears only cekSessionCache leaves live WASM decrypt handles ' +
    'serving a revoked buyer for up to the handle TTL.',
  );
});
