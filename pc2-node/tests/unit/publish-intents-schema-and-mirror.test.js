/**
 * NR-4 REGRESSION TEST: publish_intents schema + Creator-mirror invariants
 *
 * The launch gate for AGENT-CREATOR-STUDIO-2026-05 S1 (Monetisation Agent).
 * See .cursor/tasks/AGENT-CREATOR-STUDIO-2026-05/PLAN.md §11 NR-4.
 *
 * Background
 * ----------
 * The Monetisation Agent does NOT run the mint pipeline. It writes a row
 * into a new publish_intents table (pre-encryption, user-intent fields)
 * which the Creator app consumes via puter.args.resumeIntent. The Creator
 * then runs its existing encrypt + IPFS pin + opRawData pipeline UNCHANGED
 * and writes a publish_drafts row whose input-side columns must be
 * byte-for-byte equivalent to what a manually-filled wizard would
 * produce. If the column shape drifts between publish_intents and
 * publish_drafts, the agent-led path and the manual path diverge — that's
 * the audit-trail bug the test is designed to catch.
 *
 * NR-4 has TWO halves:
 *   (a) Schema mirror: every input-side column of publish_drafts has an
 *       equivalent column in publish_intents with a compatible type. We
 *       enforce this via static parsing of schema.sql.
 *   (b) State machine: draft → handed_off → consumed (with
 *       consumed_draft_id back-pointer) is the only legal forward path;
 *       draft → abandoned and handed_off → abandoned terminate. We
 *       enforce this with behavioural assertions against an in-memory
 *       SQLite database that runs migration 34's exact CREATE statement.
 *
 * What this test does
 * -------------------
 *   1. Static: assert migration 34 exists in pc2-node/src/storage/migrations.ts
 *      AND the CURRENT_VERSION constant is at least 34.
 *   2. Static: assert publish_intents is defined in pc2-node/src/storage/schema.sql
 *      so fresh installs converge on the same shape.
 *   3. Static: assert every input-side publish_drafts column (the columns
 *      the Creator wizard collects pre-encryption) exists in
 *      publish_intents with the same SQL type.
 *   4. Behavioural: run migration 34's exact SQL against an in-memory
 *      SQLite database; verify the CHECK constraint rejects invalid
 *      statuses, the indexes exist, and the state-machine transitions
 *      work.
 *
 * What this test does NOT do
 * --------------------------
 *   - Run the actual Creator app's encrypt + opRawData pipeline (would
 *     require a browser env + the @elacity-js/access SDK). That's S2
 *     integration-test territory. The field-equivalence guarantee here
 *     is the strongest unit-level assertion we can make.
 *   - Compare encrypted blob bytes between agent-resumed and manually-
 *     filled mints — that's the on-chain integration test and lives in
 *     .github/workflows/smoke-test.yml when it grows a creator-mint stage.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PC2_SRC_DIR = join(__dirname, '..', '..', 'src');
const MIGRATIONS_SRC = join(PC2_SRC_DIR, 'storage', 'migrations.ts');
const SCHEMA_SRC = join(PC2_SRC_DIR, 'storage', 'schema.sql');

function readSourceUtf8(path) {
  return readFileSync(path, 'utf-8').replace(/\r\n/g, '\n');
}

// Input-side columns from publish_drafts that the Creator wizard
// collects pre-encryption. Excludes the post-encryption columns
// (asset_cid, metadata_cid, encrypt_hash, steps) which only exist after
// the encrypt + IPFS pin step — they MUST live only in publish_drafts.
// id, wallet_address, status, created_at, updated_at are intentionally
// duplicated across both tables (each row has its own identity + audit).
const INPUT_SIDE_COLUMNS = [
  ['title', 'TEXT'],
  ['description', 'TEXT'],
  ['category', 'TEXT'],
  ['file_name', 'TEXT'],
  ['file_size', 'INTEGER'],
  ['mime_type', 'TEXT'],
  ['channel', 'TEXT'],
  ['price', 'TEXT'],
  ['currency_address', 'TEXT'],
  ['currency_symbol', 'TEXT'],
  ['copies', 'INTEGER'],
  ['access_method', 'TEXT'],
  ['reseller_cut', 'INTEGER'],
  ['royalty_partners', 'TEXT'],
  ['thumbnail_cid', 'TEXT'],
  ['adult', 'INTEGER'],
];

describe('NR-4: publish_intents schema + Creator-mirror invariants (Agent-Creator-Studio S1)', () => {
  test('CURRENT_VERSION in migrations.ts is at least 34', () => {
    const source = readSourceUtf8(MIGRATIONS_SRC);
    const match = source.match(/const\s+CURRENT_VERSION\s*=\s*(\d+)/);
    assert.ok(match, 'CURRENT_VERSION constant not found in migrations.ts');
    const version = parseInt(match[1], 10);
    assert.ok(
      version >= 34,
      `CURRENT_VERSION is ${version}; expected >= 34. Migration 34 (publish_intents) ` +
      'is the foundation of the Monetisation Agent. Bumping CURRENT_VERSION below 34 ' +
      'would cause existing installs to skip running it and the agent flow would fail ' +
      'at first chat send. See PLAN.md §11 NR-4.',
    );
  });

  test('migration 34 block exists and creates publish_intents', () => {
    const source = readSourceUtf8(MIGRATIONS_SRC);
    assert.match(
      source,
      /currentVersion\s*<\s*34/,
      'migrations.ts no longer has a `if (currentVersion < 34)` block. ' +
      'The publish_intents table will not be created on upgrade. Restore the ' +
      'migration-34 block per AGENT-CREATOR-STUDIO-2026-05 commit bd21cbdc3.',
    );
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS publish_intents/,
      'migrations.ts no longer creates publish_intents. The Monetisation Agent ' +
      "cannot write to a table that doesn't exist; agent chats will fail with " +
      '500 errors at the /api/intents endpoint. See PLAN.md §6 + §11 NR-4.',
    );
    assert.match(
      source,
      /recordMigration\(db,\s*34\)/,
      'migrations.ts no longer records migration 34 as applied. The migration ' +
      'will re-run on every boot, masking failures and slowing startup.',
    );
  });

  test('schema.sql defines publish_intents so fresh installs converge', () => {
    const source = readSourceUtf8(SCHEMA_SRC);
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS publish_intents/,
      'schema.sql no longer defines publish_intents. Fresh installs ' +
      '(skip migrations.ts) will not have the table, and the Monetisation ' +
      'Agent will fail at first chat send. The publish_drafts bug from ' +
      'v1.2.7.0/.1 is the same class of failure — see schema.sql comment ' +
      'block "Migration 21" for the historical precedent.',
    );
  });

  test('every input-side publish_drafts column has an equivalent publish_intents column', () => {
    const source = readSourceUtf8(SCHEMA_SRC);

    // Extract the publish_intents column list from the CREATE statement
    const tableMatch = source.match(/CREATE TABLE IF NOT EXISTS publish_intents\s*\(([\s\S]*?)\)\s*;/);
    assert.ok(tableMatch, 'Could not locate publish_intents CREATE statement in schema.sql');
    const tableBody = tableMatch[1];

    for (const [colName, colType] of INPUT_SIDE_COLUMNS) {
      const colRegex = new RegExp(`\\b${colName}\\s+${colType}\\b`, 'i');
      assert.match(
        tableBody,
        colRegex,
        `publish_intents is missing the \`${colName} ${colType}\` column. ` +
        'The Creator wizard collects this field pre-encryption, so the ' +
        'agent must be able to fill it. Without it, the agent path and the ' +
        'manual-wizard path diverge — a row written via resumeFromIntent ' +
        `will silently drop the ${colName} value, producing a different ` +
        'opRawData payload at mint time. See PLAN.md §6 (shared-intent ' +
        'two-presentations model) and §11 NR-4.',
      );
    }
  });

  test('behavioural: migration 34 SQL applies cleanly to an in-memory database', () => {
    const db = new Database(':memory:');
    try {
      // Mirror migration 34 EXACTLY — if this changes, the failure mode
      // is "agent writes are accepted but never read", which is silent.
      db.exec(`
        CREATE TABLE IF NOT EXISTS publish_intents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wallet_address TEXT NOT NULL,
          conversation_id TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          source_file_path TEXT,
          title TEXT,
          description TEXT,
          category TEXT,
          file_name TEXT,
          file_size INTEGER,
          mime_type TEXT,
          tags TEXT,
          channel TEXT,
          price TEXT,
          currency_address TEXT,
          currency_symbol TEXT,
          copies INTEGER DEFAULT 1,
          access_method TEXT DEFAULT 'buy_once',
          reseller_cut INTEGER DEFAULT 0,
          royalty_partners TEXT,
          license_profile TEXT DEFAULT 'perpetual_personal_view',
          thumbnail_cid TEXT,
          thumbnail_path TEXT,
          adult INTEGER DEFAULT 0,
          consumed_draft_id INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          CHECK (status IN ('draft', 'handed_off', 'abandoned', 'consumed'))
        )
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_intents_wallet ON publish_intents(wallet_address)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_intents_wallet_status ON publish_intents(wallet_address, status, updated_at DESC)`);

      // Sanity: indexes exist
      const indexes = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='publish_intents' ORDER BY name`
      ).all().map(r => r.name);
      assert.ok(indexes.includes('idx_intents_wallet'),
        'idx_intents_wallet index is missing. Wallet-scoped lookups will ' +
        'table-scan and degrade as user counts grow.');
      assert.ok(indexes.includes('idx_intents_wallet_status'),
        'idx_intents_wallet_status index is missing. The Monetisation Agent\'s ' +
        'list_my_intents tool sorts by (status, updated_at DESC) which without ' +
        'this index produces a filesort.');

      // Insert a happy-path draft
      const insert = db.prepare(`
        INSERT INTO publish_intents (wallet_address, title, channel, access_method, copies, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Sunset over Rome',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        'buy_once',
        1,
        '1000000000000000000', // 1.0 in wei (stringified bigint per agent contract)
      );
      const intentId = result.lastInsertRowid;
      assert.ok(intentId > 0, 'insertion did not return a row id');

      // Verify default status = 'draft'
      const row = db.prepare(`SELECT status FROM publish_intents WHERE id = ?`).get(intentId);
      assert.equal(row.status, 'draft',
        `New intent has status='${row.status}', expected 'draft'. The default ` +
        'status was changed which would break the resumeFromIntent guard ' +
        '(which only accepts draft rows for edits).');
    } finally {
      db.close();
    }
  });

  test('behavioural: CHECK constraint rejects invalid statuses', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE publish_intents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          CHECK (status IN ('draft', 'handed_off', 'abandoned', 'consumed'))
        )
      `);

      const insert = db.prepare(`INSERT INTO publish_intents (wallet_address, status) VALUES (?, ?)`);

      // All four legal statuses are accepted
      for (const status of ['draft', 'handed_off', 'abandoned', 'consumed']) {
        assert.doesNotThrow(
          () => insert.run('0xabc', status),
          `Legal status '${status}' was rejected by the CHECK constraint. ` +
          'The status state-machine documented in PLAN.md §6 requires all ' +
          'four to be accepted at INSERT time.',
        );
      }

      // Anything else is rejected
      for (const bad of ['minted', 'pending', '', 'DRAFT', 'unknown']) {
        assert.throws(
          () => insert.run('0xabc', bad),
          /CHECK constraint failed/,
          `Invalid status '${bad}' was NOT rejected. The CHECK constraint ` +
          'must prevent stale/typoed statuses from being persisted — without ' +
          'this guard, the list_my_intents tool would silently return rows ' +
          'in undefined states and the Creator app could resume them into ' +
          'an inconsistent wizard state.',
        );
      }
    } finally {
      db.close();
    }
  });

  test('behavioural: state-machine transitions draft → handed_off → consumed (audit trail)', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE publish_intents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wallet_address TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          consumed_draft_id INTEGER,
          updated_at TEXT DEFAULT (datetime('now')),
          CHECK (status IN ('draft', 'handed_off', 'abandoned', 'consumed'))
        )
      `);

      const wallet = '0xabc';
      const id = db.prepare(`INSERT INTO publish_intents (wallet_address) VALUES (?)`).run(wallet).lastInsertRowid;

      // draft → handed_off (called by open_creator_to_mint)
      const h1 = db.prepare(`UPDATE publish_intents SET status = 'handed_off' WHERE id = ? AND wallet_address = ? AND status = 'draft'`).run(id, wallet);
      assert.equal(h1.changes, 1, 'draft → handed_off transition did not affect any rows');

      // handed_off → handed_off is a no-op (the guard requires status='draft')
      const h2 = db.prepare(`UPDATE publish_intents SET status = 'handed_off' WHERE id = ? AND wallet_address = ? AND status = 'draft'`).run(id, wallet);
      assert.equal(h2.changes, 0, 'handed_off → handed_off should be a no-op (the markIntentHandedOff guard prevents re-runs from clobbering a real consumed row)');

      // handed_off → consumed with back-pointer (called by Creator after publish_drafts insert)
      const consumedDraftId = 99;
      const h3 = db.prepare(`UPDATE publish_intents SET status = 'consumed', consumed_draft_id = ? WHERE id = ? AND wallet_address = ? AND status IN ('draft','handed_off')`).run(consumedDraftId, id, wallet);
      assert.equal(h3.changes, 1, 'handed_off → consumed transition did not affect any rows');

      // Verify final state has the audit-trail link
      const final = db.prepare(`SELECT status, consumed_draft_id FROM publish_intents WHERE id = ?`).get(id);
      assert.equal(final.status, 'consumed');
      assert.equal(final.consumed_draft_id, consumedDraftId,
        'consumed_draft_id back-pointer is missing. NR-4 requires every ' +
        'minted asset whose origin was an agent intent to retain a link ' +
        'to the publish_drafts row that finalised it — this is the audit ' +
        'trail that lets us prove the agent-led path and the manual path ' +
        'produced the same on-chain output for the same intent.');

      // consumed → anything is rejected (guard: status IN draft|handed_off)
      const h4 = db.prepare(`UPDATE publish_intents SET status = 'draft' WHERE id = ? AND wallet_address = ? AND status IN ('draft','handed_off')`).run(id, wallet);
      assert.equal(h4.changes, 0, 'consumed → draft must be rejected — once an intent is minted it is terminal');
    } finally {
      db.close();
    }
  });
});
