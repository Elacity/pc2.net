#!/usr/bin/env node
/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * smoke-v0.4.7.js — pre-ship smoke battery for the v0.4.7 release.
 *
 * Covers each shipped service in isolation (no real network or FS for
 * destructive ops); fails fast on shape/contract regressions.
 *
 * Run: `node enm-server/scripts/smoke-v0.4.7.js`
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const PASS_TAG = '[32m✓[0m';
const FAIL_TAG = '[31m✗[0m';

let totalPass = 0;
let totalFail = 0;

function group(name, fn) {
    console.log(`\n--- ${name} ---`);
    const before = { pass: totalPass, fail: totalFail };
    try { fn(); }
    catch (err) {
        console.log(`${FAIL_TAG} group "${name}" threw: ${err.message}`);
        totalFail++;
    }
    const groupPass = totalPass - before.pass;
    const groupFail = totalFail - before.fail;
    console.log(`  → ${groupPass} pass, ${groupFail} fail`);
}

function ok(cond, msg) {
    if (cond) { console.log(`  ${PASS_TAG} ${msg}`); totalPass++; }
    else      { console.log(`  ${FAIL_TAG} ${msg}`); totalFail++; }
}

// ---------- EnmSystemCheck ----------
group('EnmSystemCheck', () => {
    const sc = require('../src/services/EnmSystemCheck');
    ok(sc.runSystemCheck && typeof sc.runSystemCheck === 'function', 'runSystemCheck exported');
    ok(sc.addSwap && typeof sc.addSwap === 'function', 'addSwap exported');
    ok(sc.THRESHOLDS && sc.THRESHOLDS.council && sc.THRESHOLDS.bpos, 'THRESHOLDS map per path');
    ok(sc.THRESHOLDS.council.diskFreeGbMin >= 1000, 'Council disk threshold ≥1000 GB');
    ok(sc.THRESHOLDS.council.ramMinGb >= 42, 'Council RAM threshold ≥42 GB');
    ok(sc.THRESHOLDS.bpos.ramMinGb >= 8, 'BPoS RAM threshold ≥8 GB');
    ok(sc.THRESHOLDS.bpos.diskFreeGbMin >= 150, 'BPoS disk threshold ≥150 GB');
    ok(sc.THRESHOLDS.bpos.ramRemediableExactGb === 8, 'BPoS auto-swap remediation at exactly 8 GB');
    ok(typeof sc.checkOs === 'function', 'checkOs helper exported');
    ok(typeof sc.checkCpu === 'function', 'checkCpu helper exported');
});

// ---------- EnmSnapshotDownloader ----------
group('EnmSnapshotDownloader', () => {
    const sd = require('../src/services/EnmSnapshotDownloader');
    ok(sd.SNAPSHOT_SOURCES, 'SNAPSHOT_SOURCES exported');
    const ids = Object.keys(sd.SNAPSHOT_SOURCES).sort();
    ok(JSON.stringify(ids) === JSON.stringify(['eid', 'esc', 'mainchain', 'pg']),
        '4 chains in catalog (mainchain/esc/eid/pg) — no ECO per H3');
    Object.entries(sd.SNAPSHOT_SOURCES).forEach(([cid, src]) => {
        ok(src.url && src.url.startsWith('https://node-data.elastos.io/'),
            `${cid} URL points at node-data.elastos.io`);
    });
    ok(sd.SNAPSHOT_SOURCES.mainchain.url.includes('/ela/'),
        'mainchain URL uses /ela/ path');
    ok(sd.SNAPSHOT_SOURCES.pg.url.includes('/pgp/'),
        'PG URL uses /pgp/ path (operator-verified convention)');
    ok(typeof sd.downloadAndExtract === 'function', 'downloadAndExtract exported');
    ok(typeof sd.downloadAll === 'function', 'downloadAll exported');
    ok(typeof sd.isSnapshotApplied === 'function', 'isSnapshotApplied exported');
    ok(sd.DOWNLOAD_TIMEOUT_MS >= 60_000, 'Reasonable download timeout');
});

// ---------- OracleScriptDownloader (rewrite) ----------
group('OracleScriptDownloader (rewrite)', () => {
    const o = require('../src/services/OracleScriptDownloader');
    ok(o.ORACLE_SOURCES, 'ORACLE_SOURCES exported');
    const ids = Object.keys(o.ORACLE_SOURCES).sort();
    ok(JSON.stringify(ids) === JSON.stringify(['eid-oracle', 'esc-oracle', 'pg-oracle']),
        '3 oracles in catalog');
    Object.entries(o.ORACLE_SOURCES).forEach(([cid, src]) => {
        ok(src.scriptName && src.chainName && src.fallbackVersion,
            `${cid} has scriptName, chainName, fallbackVersion`);
        ok(!('url' in src), `${cid} no hardcoded url (canonical URL is computed)`);
        ok(!('autoDownloadable' in src), `${cid} no autoDownloadable flag (all are auto-downloadable now)`);
    });
    ok(typeof o.scriptDirFor === 'function', 'scriptDirFor exported (new in v0.4.7)');
    ok(typeof o.scriptPathFor === 'function', 'scriptPathFor exported');
    ok(typeof o.downloadOne === 'function', 'downloadOne exported');
    ok(typeof o.downloadAll === 'function', 'downloadAll exported');
    ok(typeof o.verify === 'function', 'verify exported (new in v0.4.7)');
    ok(o.DOWNLOAD_TIMEOUT_MS >= 300_000, 'Timeout bumped for .tgz bundles');
    const pgDir = o.scriptDirFor('pg-oracle');
    ok(pgDir.endsWith('/pg-oracle'), 'scriptDirFor returns per-oracle subdir');
});

// ---------- EnmConfigSchema (master password) ----------
group('EnmConfigSchema masterPasswordEncrypted', () => {
    const { defaultConfig, validate } = require('../src/services/EnmConfigSchema');
    const { encrypt } = require('../src/services/EnmEncryption');
    const envelope = encrypt('master-password-test');
    const c = defaultConfig();
    c.global = c.global || {};
    c.global.council = c.global.council || {};
    c.global.council.masterPasswordEncrypted = envelope;
    let validationError = null;
    try { validate(c); } catch (e) { validationError = e; }
    ok(!validationError, 'masterPasswordEncrypted accepts real EnmEncryption envelope');

    // Empty string still validates (back-compat)
    c.global.council.masterPasswordEncrypted = '';
    validationError = null;
    try { validate(c); } catch (e) { validationError = e; }
    ok(!validationError, 'Empty masterPasswordEncrypted validates (back-compat)');

    // Verify Ubuntu-only constraint via package.json
    const pkg = require('../package.json');
    ok(pkg.enm && Array.isArray(pkg.enm.supportedOs)
        && pkg.enm.supportedOs.length === 1
        && pkg.enm.supportedOs[0] === 'ubuntu',
        'supportedOs is exactly ["ubuntu"] (debian dropped per directive)');
});

// ---------- routes/setup.js shape ----------
group('routes/setup.js v0.4.7 surface', () => {
    const s = require('../src/routes/setup');
    ok(s._internal, '_internal exported');
    ok(typeof s._internal.runCouncilPreflight === 'function', 'runCouncilPreflight exported');
    ok(typeof s._internal.runCouncilInstall === 'function', 'runCouncilInstall exported');

    const setupSrc = fs.readFileSync(path.join(__dirname, '..', 'src/routes/setup.js'), 'utf8');
    ok(/install-council\/preflight/.test(setupSrc), 'preflight endpoint present');
    ok(/setup\/system-check/.test(setupSrc), 'NEW system-check endpoint registered');
    ok(/system\/add-swap/.test(setupSrc), 'NEW add-swap endpoint registered');
    ok(/download-snapshots-parallel/.test(setupSrc), 'NEW snapshot-parallel step in orchestrator');
    ok(/masterPasswordEncrypted/.test(setupSrc), 'master password write path present');
    ok(/node-data-reachable/.test(setupSrc), 'preflight probes node-data.elastos.io');
    // includePg is REMOVED from the PLAN (PG always installs per directive)
    // The orchestrator may still accept includePg in the body for transition,
    // but the PLAN itself should not be conditional on it.
    const planMatch = setupSrc.match(/const PLAN = \[[^\]]+\]/);
    ok(planMatch, 'PLAN array found');
    if (planMatch) {
        ok(!/includePg/.test(planMatch[0]), 'PLAN array no longer conditional on includePg');
    }
    ok(/250/.test(setupSrc), 'Disk threshold bumped (250 GB)');
});

// ---------- Summary ----------
console.log(`\n=== v0.4.7 smoke battery: ${totalPass} pass, ${totalFail} fail ===\n`);
process.exit(totalFail === 0 ? 0 : 1);
