/**
 * REGRESSION TESTS — Security audit 2026-05-29 (dDRM hardening release).
 *
 * Source-scan locks for the fixes shipped with the release security audit.
 * These are deliberately structural (same approach as
 * media-pssh-rpc-override.test.js): the real attack paths need a live node,
 * a wallet, and on-chain state, so we pin the code shape that closes each
 * hole and fail loudly if a refactor reopens it.
 *
 * Findings covered:
 *   H1  media.ts            — access-check RPC never derived from request (see
 *                             media-pssh-rpc-override.test.js for the H1 lock).
 *   #3  gateway.ts          — skills/install buyer = authenticated session owner.
 *   #2  secureViewSession   — revoked delegation rejected at the live gate.
 *   #2  storage.ts          — revoke is owner-bound + flushes the CEK cache.
 *   #1  fileUrlSigner.ts    — signed /file URLs required by default.
 *   #4  ToolExecutor.ts     — update_intent runs the shared field validator.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, '..', '..', 'src');

function read(rel) {
  return readFileSync(join(SRC, rel), 'utf-8').replace(/\r\n/g, '\n');
}

/** Strip comments so prose doesn't false-positive a code assertion. */
function stripComments(source) {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return s;
}

// ── #3 — skills/install must bind the buyer to the session owner ────────────

test('#3 gateway skills/install derives the buyer from the secure-view session, not the body', () => {
  const code = stripComments(read('api/gateway.ts'));

  assert.ok(
    /const\s+ownerAddress\s*=\s*req\.secureViewSession!\.stored\.ownerAddress/.test(code),
    'skills/install must read the buyer from req.secureViewSession.stored.ownerAddress ' +
    '(proven by requireSecureViewSession), never trust body.buyerAddress.',
  );
  assert.ok(
    /buyerAddress:\s*ownerAddress/.test(code),
    'the Lit decrypt call must pass buyerAddress: ownerAddress (the session owner).',
  );
  assert.ok(
    /walletAddress:\s*ownerAddress/.test(code),
    'insertInstalledSkill must record walletAddress: ownerAddress so a decrypted ' +
    'skill cannot be written into another wallet\'s installed_skills row.',
  );
  // The body value, if present, must be rejected on mismatch — not used.
  assert.ok(
    /buyerAddress\s*&&[^\n]*ownerAddress\.toLowerCase\(\)/.test(code),
    'a body buyerAddress that differs from the session owner must be rejected (403).',
  );
  assert.ok(
    !/walletAddress:\s*buyerAddress/.test(code) && !/buyerAddress:\s*buyerAddress/.test(code),
    'the install handler must not feed the body buyerAddress into the filesystem ' +
    'write or DB row (IDOR — SEC audit #3).',
  );
});

// ── #2 — a revoked delegation must be rejected by the LIVE middleware ────────

test('#2 requireSecureViewSession consults isDelegationRevoked at the live gate', () => {
  const code = stripComments(read('api/middleware/secureViewSession.ts'));

  assert.ok(
    /import\s*\{[^}]*isDelegationRevoked[^}]*\}\s*from\s*'\.\.\/\.\.\/utils\/secureViewSession\.js'/.test(code),
    'the middleware must import isDelegationRevoked from utils/secureViewSession.',
  );
  assert.ok(
    /isDelegationRevoked\s*\(/.test(code),
    'the middleware must CALL isDelegationRevoked — otherwise revoke-session is a ' +
    'no-op and a revoked bearer token keeps decrypting (SEC audit #2).',
  );
  assert.ok(
    /session_revoked/.test(code),
    'a revoked delegation must surface as session_revoked so the client re-auths.',
  );
  assert.ok(
    /stored\.delegationCanonical/.test(code),
    'the revoked nonce is read back from stored.delegationCanonical (the signed payload).',
  );
});

// ── #2 — revoke-session must be owner-bound and flush cached CEKs ────────────

test('#2 revoke-session is owner-bound and force-flushes the CEK cache', () => {
  const code = stripComments(read('api/storage.ts'));
  const start = code.indexOf("'/lit/revoke-session'");
  assert.ok(start >= 0, 'revoke-session route must exist');
  const slice = code.slice(start, start + 2000);

  assert.ok(
    /exportAll\s*\(\s*\)/.test(slice),
    'revoke-session must look up the caller\'s own sessions (exportAll) to bind the ' +
    'revoke to ownership — preventing griefing-revoke of another owner\'s nonce.',
  );
  assert.ok(
    /flushCEKCache\s*\(\s*\{\s*buyerAddress:/.test(slice),
    'revoke-session must flushCEKCache({ buyerAddress }) so a cached CEK / WASM ' +
    'handle stops serving immediately rather than lingering for the cache TTL.',
  );
  assert.ok(
    /res\.status\(403\)/.test(slice),
    'revoke-session must 403 when the nonce is not owned by the caller.',
  );
});

// ── #1 — signed /file URLs are required by default ──────────────────────────

test('#1 isFileUrlSigningRequired is secure-by-default (opt-OUT, not opt-IN)', () => {
  const code = stripComments(read('utils/fileUrlSigner.ts'));
  const start = code.indexOf('function isFileUrlSigningRequired');
  assert.ok(start >= 0, 'isFileUrlSigningRequired must exist');
  const slice = code.slice(start, start + 600);

  assert.ok(
    /FILE_URL_SIGNING_ALLOW_LEGACY/.test(slice),
    'signing must default to REQUIRED, with an explicit opt-out env ' +
    'FILE_URL_SIGNING_ALLOW_LEGACY for nodes with genuinely legacy links.',
  );
  assert.ok(
    /return\s*!allowLegacy/.test(slice),
    'the function must return !allowLegacy — i.e. required unless legacy is opted in. ' +
    'A plain `=== \'true\'` default-OFF form reopens the unsigned-URL hole (SEC #1).',
  );
});

// ── #4 — update_intent tool shares the REST validator ───────────────────────

test('#4 update_intent runs the shared validateIntentFields before writing', () => {
  const tool = stripComments(read('services/ai/tools/ToolExecutor.ts'));

  assert.ok(
    /import\s*\{[^}]*validateIntentFields[^}]*\}\s*from\s*'[^']*intentValidation\.js'/.test(tool),
    'ToolExecutor must import validateIntentFields from the shared utils/intentValidation.',
  );
  const start = tool.indexOf("case 'update_intent'");
  assert.ok(start >= 0, 'update_intent case must exist');
  const slice = tool.slice(start, start + 1500);
  assert.ok(
    /validateIntentFields\s*\(/.test(slice),
    'update_intent must call validateIntentFields so the AI write path enforces the ' +
    'same bounds as REST (copies ≤ 10000, price > 0, royalty sum-to-100, etc.).',
  );

  // The REST surface must use the same shared validator (single source of truth).
  const rest = stripComments(read('api/intents.ts'));
  assert.ok(
    /import\s*\{[^}]*validateIntentFields[^}]*\}\s*from\s*'[^']*intentValidation\.js'/.test(rest),
    'api/intents.ts must import the shared validateIntentFields (no duplicated copy).',
  );
  assert.ok(
    !/function\s+validateIntentFields\s*\(/.test(rest),
    'api/intents.ts must NOT define its own validateIntentFields — it was moved to ' +
    'utils/intentValidation.ts to keep one source of truth (codequality.mdc).',
  );
});
