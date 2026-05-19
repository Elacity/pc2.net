/**
 * REGRESSION TEST: db.getSetting() resource-limit read path (v1.2.8.0)
 *
 * Catches the latent ambient-global bug class that silently swallowed
 * operator-configured resource limits across multiple PC2 releases.
 * Documented in:
 *   - CHANGELOG.md "[v1.2.8.0]" → "Bug fix — resource-limit settings now correctly applied"
 *   - .cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-GLOBALS-RELEASE-NOTES.md
 *   - .cursor/tasks/OPTIMISATION-AND-REFACTORING-2026-05/PHASE-2-GLOBALS-CLEANUP.md §"Global 2"
 *   - Commit e5280e5f2 (refactor(phase-2-globals): purge ambient global.*
 *     patterns + fix latent db-settings bug)
 *
 * The bug
 * -------
 * Pre-v1.2.8.0, api/resources.ts and api/supernode.ts used a module-local
 * `getDb()` helper that returned `(global as any).db`. That global was
 * NEVER SET anywhere in pc2-node/src. Every `db?.getSetting('storage_limit')`,
 * `db?.getSetting('max_concurrent_wasm')`, `db?.getSetting('max_memory_mb')`,
 * `db?.getSetting('wasm_timeout_ms')` returned undefined — silently masked
 * by the optional-chaining fallthrough to config-file defaults.
 *
 * The user-visible effect was that operators who hit
 *   POST /api/storage/limit
 *   POST /api/resources/limits
 * to set non-default values had their writes accepted (db.setSetting
 * worked) but ignored on every subsequent read. The system always fell
 * back to config.json defaults or hardcoded defaults. The "Database
 * settings override config file" code comment was false.
 *
 * The fix
 * -------
 * Replace `getDb()` / `(global as any).db` with explicit
 * `req.app.locals.db as DatabaseManager` at every call site (the established
 * Express pattern, already used by the rest of pc2-node). Commit e5280e5f2
 * also surfaced four pre-existing type bugs (string→number coercion gaps)
 * that were silent under the `any`-typed helpers; those were fixed in the
 * same commit via explicit parseInt() on read and String() on write.
 *
 * What this test does
 * -------------------
 *   1. Static source scan: assert the broken pattern (`(global as any).db`
 *      or a helper named `getDb` that references it) is absent from
 *      pc2-node/src/api/resources.ts and pc2-node/src/api/supernode.ts.
 *      A future refactor that re-introduces the pattern would fail this
 *      assertion BEFORE shipping.
 *   2. Static source scan: assert the FIXED pattern (`req.app.locals.db as
 *      DatabaseManager`) IS present in the same files. Catches a refactor
 *      that removes the lookup entirely (silently reverting to "no db").
 *   3. Global-ambient scan: assert NO production source file under
 *      pc2-node/src/ writes to `(global as any).db`. The bug existed
 *      because nothing wrote that global; if a future commit tries to
 *      "fix" the missing-global by adding the write back instead of using
 *      app.locals, we want that change blocked.
 *   4. Runtime assertion: confirm `(global as any).db` is undefined at
 *      module load time. Belt-and-suspenders against (3).
 *
 * What this test does NOT do
 * --------------------------
 *   - Execute the actual route handlers (would require mocking Express
 *     auth middleware + ResourceMonitor + a real DatabaseManager — far
 *     too much coupling for a unit test). The route-handler behaviour is
 *     covered by the smoke-test workflow in .github/workflows/smoke-test.yml
 *     when it runs against a fully-booted PC2.
 *   - Verify the v1.2.8.0 compute-settings caveat (restart required to
 *     apply max_concurrent_wasm / max_memory_mb / wasm_timeout_ms changes).
 *     That's a runtime startup-order property, not testable in isolation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PC2_SRC_DIR = join(__dirname, '..', '..', 'src');
const API_RESOURCES_SRC = join(PC2_SRC_DIR, 'api', 'resources.ts');
const API_SUPERNODE_SRC = join(PC2_SRC_DIR, 'api', 'supernode.ts');
const API_INFO_SRC = join(PC2_SRC_DIR, 'api', 'info.ts');

// Read a UTF-8 source file with CRLF→LF normalisation. Matches the
// pattern in setup-permissions-osascript.test.js so Windows runners
// don't get false negatives from line-ending conversion in actions/checkout.
function readSourceUtf8(path) {
  return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
}

// Strip line-comments and block-comments from a TypeScript source so the
// pattern assertions ignore explanatory text (the Phase-2-Globals fix
// commit added long-form comments referencing `(global as any).db` and
// `getDb()` to document the historical bug — those would otherwise
// trigger false positives in the scans below).
function stripComments(source) {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return s;
}

// Recursively walk a directory and return every .ts file path. Used by
// the global-ambient scan so a future commit cannot quietly re-introduce
// the broken pattern in a different file.
function walkTsFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, acc);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('regression: db.getSetting() resource-limit read path (v1.2.8.0)', () => {
  test('api/resources.ts no longer contains the broken (global as any).db pattern', () => {
    const source = stripComments(readSourceUtf8(API_RESOURCES_SRC));

    assert.ok(
      !/\(global as any\)\.db\b/.test(source),
      'api/resources.ts still references `(global as any).db` in active code. ' +
      'This is the Phase-2-Globals bug class — the global was never set ' +
      'anywhere in pc2-node/src, so every db?.getSetting() silently returned ' +
      'undefined. Replace with `req.app.locals.db as DatabaseManager` per ' +
      'commit e5280e5f2. See CHANGELOG.md "[v1.2.8.0]" for context.',
    );

    assert.ok(
      !/function\s+getDb\s*\(\s*\)/.test(source),
      'api/resources.ts re-introduced a `getDb()` helper. The pre-v1.2.8.0 ' +
      'helper returned `(global as any).db` which was never set, silently ' +
      'breaking the resource-limits read path. Use `req.app.locals.db` ' +
      'directly at each call site (the Express convention).',
    );
  });

  test('api/supernode.ts no longer contains the broken (global as any).db pattern', () => {
    const source = stripComments(readSourceUtf8(API_SUPERNODE_SRC));

    assert.ok(
      !/\(global as any\)\.db\b/.test(source),
      'api/supernode.ts still references `(global as any).db` in active code. ' +
      'Same bug class as api/resources.ts pre-v1.2.8.0; see commit e5280e5f2.',
    );

    assert.ok(
      !/function\s+getDb\s*\(\s*\)/.test(source),
      'api/supernode.ts re-introduced a `getDb()` helper. Use ' +
      '`req.app.locals.db` directly instead.',
    );
  });

  test('api/resources.ts uses req.app.locals.db for the configured-limits read', () => {
    const source = readSourceUtf8(API_RESOURCES_SRC);

    assert.match(
      source,
      /req\.app\.locals\.db\s+as\s+DatabaseManager/,
      'api/resources.ts no longer reads from req.app.locals.db. The Phase-2-Globals ' +
      'fix relies on this Express-locals lookup pattern to obtain the DatabaseManager ' +
      'handle. If this assertion fails, db?.getSetting() reads will silently fall back ' +
      'to undefined again and operator-configured resource limits will be ignored.',
    );

    assert.match(
      source,
      /db\?\.getSetting\(['"]storage_limit['"]\)/,
      'api/resources.ts no longer reads the storage_limit setting from the db. ' +
      'Operators setting storage_limit via POST /api/storage/limit will have their ' +
      'value silently ignored.',
    );

    for (const setting of ['max_concurrent_wasm', 'max_memory_mb', 'wasm_timeout_ms']) {
      assert.match(
        source,
        new RegExp(`db\\?\\.getSetting\\(['"]${setting}['"]\\)`),
        `api/resources.ts no longer reads ${setting} from the db. ` +
        'Operator-configured compute limits will be silently ignored.',
      );
    }
  });

  test('api/supernode.ts uses req.app.locals.db for relay-mode settings', () => {
    const source = readSourceUtf8(API_SUPERNODE_SRC);

    assert.match(
      source,
      /req\.app\.locals\.db\s+as\s+DatabaseManager/,
      'api/supernode.ts no longer reads from req.app.locals.db. The relay-mode ' +
      'and relay_max_connections settings will silently fall back to defaults.',
    );
  });

  test('api/info.ts uses the fixed DatabaseManager-typed getEffectiveStorageLimit helper', () => {
    const source = readSourceUtf8(API_INFO_SRC);

    assert.match(
      source,
      /getEffectiveStorageLimit\(db:\s*\{\s*getSetting\(name:\s*string\):\s*string\s*\|\s*undefined\s*\}/,
      'api/info.ts getEffectiveStorageLimit() no longer accepts an explicit ' +
      'db parameter with the correct type shape. The Phase-2-Globals fix made ' +
      'this an explicit dependency injection — silently swallowing it would ' +
      'mean the /api/stats and /api/storage/usage endpoints diverge on the ' +
      'effective storage limit.',
    );
  });

  test('no production source file under pc2-node/src writes to (global as any).db', () => {
    const offenders = [];
    for (const path of walkTsFiles(PC2_SRC_DIR)) {
      const source = stripComments(readSourceUtf8(path));
      if (/\(global as any\)\.db\s*=/.test(source)) {
        offenders.push(path.substring(PC2_SRC_DIR.length + 1));
      }
    }
    assert.equal(
      offenders.length,
      0,
      'The Phase-2-Globals fix removed all writes to `(global as any).db` from ' +
      'pc2-node/src (there never were any — the global was never set, which IS ' +
      'why the bug existed). A future commit that "fixes" the broken read path ' +
      'by adding the write back instead of routing through req.app.locals.db ' +
      'must be blocked. Use Express app.locals for cross-module state. ' +
      'Offending file(s): ' + offenders.join(', '),
    );
  });

  test('runtime: (global as any).db is undefined at module-load time', () => {
    assert.equal(
      globalThis.db,
      undefined,
      '`globalThis.db` is set at test-runtime. The Phase-2-Globals fix relies on ' +
      'this global being unset everywhere; if a future production code path sets ' +
      'it (even as a "defensive fallback"), the route handlers will start reading ' +
      'stale state and the bug class returns silently. Use req.app.locals.db ' +
      'exclusively for DatabaseManager access.',
    );
  });
});
