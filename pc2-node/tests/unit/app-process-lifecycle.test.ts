/**
 * AppProcessManager lifecycle integration test (ENM service-app machinery).
 *
 * Drives the real AppProcessManager against a real temp SQLite DB and real
 * spawned stub services — no Linux/ela/IPFS required. Verifies the privileged
 * service-app plumbing introduced by PR #18:
 *   - migration-36 runtime columns exist (pid/port/started_at/crash_count)
 *   - start() spawns, populates the DB runtime row, sets pid/port/started_at
 *   - pc2-node env conventions reach the child (PORT/APP_DATA_DIR/APP_BUNDLE_DIR)
 *   - health-check pings flip lastHealthOk
 *   - stop() SIGTERMs cleanly and clears the runtime row
 *   - repeated crashes trip crash-backoff → quarantine (fail-closed)
 *
 * Run: npx tsx --test tests/unit/app-process-lifecycle.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';

import { DatabaseManager } from '../../src/storage/database.js';
import { AppProcessManager } from '../../src/services/AppProcessManager.js';
import type { AppManifest } from '../../src/services/AppInstallService.js';

// A free-ish high port per app to avoid collisions in CI.
function pickPort(): number {
  return 41000 + Math.floor(Math.random() * 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Poll a predicate until true or timeout — keeps the test robust to spawn jitter.
async function waitFor(pred: () => boolean, timeoutMs = 4000, stepMs = 50): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

let root: string;
let db: DatabaseManager;
let appsDir: string;
let logsDir: string;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'pc2-apm-'));
  appsDir = join(root, 'installed-apps');
  logsDir = join(root, 'logs');
  mkdirSync(appsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  db = new DatabaseManager(join(root, 'pc2.db'));
  db.initialize();
});

after(() => {
  try { db.close(); } catch { /* ignore */ }
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Materialise a service bundle: a node entry script + a registered DB row.
function makeServiceApp(name: string, entrySource: string, port: number, healthCheck?: string): AppManifest {
  const bundleDir = join(appsDir, name);
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(join(bundleDir, 'index.js'), entrySource);

  const manifest: AppManifest = {
    name,
    title: name,
    version: '1.0.0',
    type: 'service',
    entry: 'index.js',
    backend: { entry: 'index.js', port, ...(healthCheck ? { healthCheck } : {}) },
  };
  const now = Date.now();
  db.registerInstalledApp({
    app_name: name,
    title: name,
    version: '1.0.0',
    cid: `local:${name}`,
    size: entrySource.length,
    icon: null,
    description: null,
    author: null,
    permissions_json: '[]',
    requirements_json: '{}',
    manifest_json: JSON.stringify(manifest),
    installed_at: now,
    updated_at: now,
  });
  return manifest;
}

// A long-lived HTTP service that serves /health 200 and records its env so we
// can assert pc2-node's spawn conventions reached the child. Exits 0 on SIGTERM.
function goodServiceSource(envDumpPath: string): string {
  return `
const http = require('node:http');
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(envDumpPath)}, JSON.stringify({
  PORT: process.env.PORT,
  APP_DATA_DIR: process.env.APP_DATA_DIR,
  APP_BUNDLE_DIR: process.env.APP_BUNDLE_DIR,
  cwd: process.cwd(),
}));
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end();
});
server.listen(Number(process.env.PORT), '127.0.0.1');
process.on('SIGTERM', () => { server.close(); process.exit(0); });
`;
}

// A service that exits non-zero immediately — used to trip crash → quarantine.
const crashingServiceSource = `process.exit(1);`;

test('migration-36 added installed_apps runtime columns', () => {
  const raw = db.getDatabase();
  assert.ok(raw, 'db should be initialized');
  // PRAGMA table_info via the enhanced sqlite handle.
  const cols = (raw as any).prepare('PRAGMA table_info(installed_apps)').all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  for (const col of ['pid', 'port', 'started_at', 'crash_count']) {
    assert.ok(names.has(col), `installed_apps must have "${col}" column (migration 36)`);
  }
});

test('start() spawns, persists runtime row, passes pc2-node env conventions', async () => {
  const name = 'svc-good';
  const port = pickPort();
  const bundleDir = join(appsDir, name);
  const envDump = join(root, `${name}.env.json`);
  const manifest = makeServiceApp(name, goodServiceSource(envDump), port, '/healthz');

  const mgr = new AppProcessManager({
    db, appsDir, logsDir,
    nodeCmd: execPath,
    healthCheckIntervalMs: 200,
    crashThreshold: 3,
    restartBaseMs: 50,
  });

  await mgr.start(name, manifest, bundleDir);

  const status = mgr.getStatus(name);
  assert.equal(status.running, true, 'service should be running after start()');
  assert.ok(typeof status.pid === 'number' && status.pid! > 0, 'pid should be set');
  assert.equal(status.port, port, 'reported port should match manifest');

  // DB runtime row reflects the live process.
  const row = db.getInstalledApp(name)!;
  assert.equal(row.port, port, 'DB port column populated');
  assert.ok(row.pid && row.pid > 0, 'DB pid column populated');
  assert.ok(row.started_at && row.started_at > 0, 'DB started_at column populated');

  // The child received pc2-node's spawn conventions.
  assert.ok(await waitFor(() => existsSync(envDump)), 'child should have written its env dump');
  const childEnv = JSON.parse(readFileSync(envDump, 'utf8'));
  assert.equal(childEnv.PORT, String(port), 'PORT passed to child');
  assert.equal(childEnv.APP_BUNDLE_DIR, bundleDir, 'APP_BUNDLE_DIR points at the bundle');
  assert.equal(childEnv.APP_DATA_DIR, join(bundleDir, '.data'), 'APP_DATA_DIR is <bundle>/.data');
  // realpath both sides: macOS canonicalises /var → /private/var in cwd().
  assert.equal(realpathSync(childEnv.cwd), realpathSync(bundleDir), 'cwd is the bundle dir');

  // Health check flips lastHealthOk once a ping succeeds.
  const healthy = await waitFor(() => {
    const s = mgr.getStatus(name);
    return !!(s.lastHealthOk && s.lastHealthOk > 0);
  }, 4000);
  assert.ok(healthy, 'health check should set lastHealthOk');

  // Clean stop: SIGTERM, runtime row cleared, no longer running.
  await mgr.stop(name);
  const after = mgr.getStatus(name);
  assert.equal(after.running, false, 'service should be stopped');
  const rowAfter = db.getInstalledApp(name)!;
  assert.equal(rowAfter.pid, null, 'DB pid cleared after stop');
  assert.equal(rowAfter.port, null, 'DB port cleared after stop');

  await mgr.shutdown();
});

test('repeated crashes trip backoff then quarantine (fail-closed)', async () => {
  const name = 'svc-crash';
  const port = pickPort();
  const bundleDir = join(appsDir, name);
  const manifest = makeServiceApp(name, crashingServiceSource, port);

  const mgr = new AppProcessManager({
    db, appsDir, logsDir,
    nodeCmd: execPath,
    healthCheckIntervalMs: 0,   // no health timer; crashes alone drive the FSM
    crashThreshold: 3,
    restartBaseMs: 30,          // fast backoff so the test completes quickly
  });

  await mgr.start(name, manifest, bundleDir);

  // It crashes immediately and auto-restarts with backoff; after crashThreshold
  // crashes it must quarantine and stop trying.
  const quarantined = await waitFor(() => {
    const s = mgr.getStatus(name);
    return s.running === false && s.crashCount >= 3 && !!s.lastFailureReason;
  }, 6000);

  const s = mgr.getStatus(name);
  assert.ok(quarantined, `service should be quarantined; got ${JSON.stringify(s)}`);
  assert.ok(/quarantine/i.test(s.lastFailureReason ?? ''), 'lastFailureReason mentions quarantine');

  // A start() on a quarantined app must throw (fail-closed, not silently respawn).
  await assert.rejects(
    () => mgr.start(name, manifest, bundleDir),
    /quarantin/i,
    'start() on a quarantined app should reject',
  );

  // Operator clears quarantine → counter resets, app becomes startable again.
  mgr.clearQuarantine(name);
  const cleared = mgr.getStatus(name);
  assert.equal(cleared.crashCount, 0, 'crash count reset after clearQuarantine');

  await mgr.shutdown();
});
