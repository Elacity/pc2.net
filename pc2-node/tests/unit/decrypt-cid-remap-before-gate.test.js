/**
 * REGRESSION TEST: decrypt actionCid remap MUST precede the allowlist gate
 * (RELEASE-2026-05-28-DDRM-HARDENING)
 *
 * The bug this locks in
 * ---------------------
 * chipotle-client.ts maintains two structures for legacy decrypt Lit Action
 * CIDs:
 *   - LEGACY_DECRYPT_ACTION_CIDS  (Set)  — consulted by assertAllowedDecryptCid
 *   - LEGACY_DECRYPT_ACTION_REMAP (map)  — normalizes known-good legacy CIDs
 *                                          (e.g. QmRSpGF…) to UNIVERSAL_DECRYPT_CID
 *
 * Several remap keys are NOT in the allowlist Set (they're trusted *because*
 * the remap declares them so). The hardening branch originally called the
 * gate BEFORE applying the remap:
 *
 *     assertAllowedDecryptCid(effectiveCid);                 // ❌ sees raw legacy CID
 *     effectiveCid = LEGACY_DECRYPT_ACTION_REMAP[...] || …;  // remap too late
 *
 * Result: every NON-MEDIA asset (3D/GLB, EPUB, PDF, image) whose PSSH baked a
 * remap-only CID threw "Rejected non-allowlisted decrypt actionCid" — even
 * though the asset was perfectly legitimate. (Media/video was unaffected
 * because media.ts overrides the baked CID to the server's current CID.)
 *
 * The fix is to remap FIRST, then gate. This is still secure: known-good
 * legacy CIDs normalize to the trusted universal action and pass; any unknown
 * CID stays unchanged and is still rejected, preserving the kid↔ciphertext
 * binding guarantee.
 *
 * If a future refactor reorders these two lines, all non-media legacy-CID
 * assets break again. Source-scan lock-in (same pattern as
 * media-pssh-rpc-override.test.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, '..', '..', 'src', 'api', 'chipotle-client.ts');

function readSource() {
  return readFileSync(SRC, 'utf-8').replace(/\r\n/g, '\n');
}

/** Strip TS comments so prose mentioning the patterns doesn't false-positive. */
function stripComments(source) {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return s;
}

test('chipotle-client defines both the remap map and the allowlist gate', () => {
  const code = stripComments(readSource());
  assert.ok(
    /LEGACY_DECRYPT_ACTION_REMAP\s*[:=]/.test(code),
    'chipotle-client.ts must define LEGACY_DECRYPT_ACTION_REMAP (legacy → universal).',
  );
  assert.ok(
    /function\s+assertAllowedDecryptCid\s*\(/.test(code),
    'chipotle-client.ts must define assertAllowedDecryptCid (the security gate).',
  );
});

test('the remap is applied BEFORE the allowlist gate, not after', () => {
  const code = stripComments(readSource());

  const remapIdx = code.search(/effectiveCid\s*=\s*LEGACY_DECRYPT_ACTION_REMAP\s*\[\s*effectiveCid\s*\]/);
  const gateIdx = code.search(/assertAllowedDecryptCid\s*\(\s*effectiveCid\s*\)/);

  assert.ok(remapIdx !== -1, 'Expected `effectiveCid = LEGACY_DECRYPT_ACTION_REMAP[effectiveCid] …` in the decrypt path.');
  assert.ok(gateIdx !== -1, 'Expected `assertAllowedDecryptCid(effectiveCid)` in the decrypt path.');

  assert.ok(
    remapIdx < gateIdx,
    'CRITICAL: LEGACY_DECRYPT_ACTION_REMAP must be applied BEFORE assertAllowedDecryptCid. ' +
    'Gating first rejects legitimate non-media assets (3D/EPUB/PDF/image) whose PSSH baked ' +
    'a known-good remap-only CID (e.g. QmRSpGF…). Remap-first normalizes them to the ' +
    'universal action so they pass, while unknown CIDs are still rejected.',
  );
});
