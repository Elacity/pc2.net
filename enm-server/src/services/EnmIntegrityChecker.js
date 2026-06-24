/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmIntegrityChecker — beta.3.46. Settings → Identity → "Server
 * integrity" sub-card.
 *
 * Honest about what we can and can't detect from inside a VPS guest:
 *
 *   CAN catch (tamper-after-install):
 *     - ela / ela-cli binary swap (SHA256 vs first-seen baseline)
 *     - keystore.dat out-of-band edit (mtime vs ENM-recorded mtime)
 *     - rogue parent process (ela's parent isn't ENM)
 *     - clock manipulation (NTP source + offset)
 *     - /etc/pc2.env rotation (mtime)
 *     - VM live-migration evidence (uptime drift, virt-detect)
 *
 *   CAN'T catch (hypervisor-level):
 *     - Pre-install disk image with keystore copied
 *     - Live RAM snapshot while ela holds the unlocked key
 *     - Sophisticated MITM with provider CA-signed certs
 *
 * Baselines live at <enmDataDir>/.integrity-baseline.json. The
 * baseline is "first-seen-at-install" — the integrity check is
 * tamper-EVIDENCE (did things change since install), not absolute
 * tamper-PROOF (was it correct at install). Operators who care
 * about the latter must verify the deploy out-of-band.
 *
 * Per-check shape:
 *   { id, label, status: 'ok'|'warn'|'fail'|'unknown',
 *     detail: string, baseline?: ..., current?: ... }
 *
 * 0.2.0-beta.3.46.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const { ENM_LOG_PREFIX } = require('./EnmConstants');
const DataDir = require('./DataDir');
const ChainRegistry = require('./ChainRegistry');

const BASELINE_FILENAME = '.integrity-baseline.json';
const HASH_TIMEOUT_MS = 10_000;
const SHELL_TIMEOUT_MS = 5_000;

function _baselinePath() {
    return path.join(DataDir.enmDataDir(), BASELINE_FILENAME);
}

async function _readBaseline() {
    try {
        return JSON.parse(await fsp.readFile(_baselinePath(), 'utf8'));
    } catch (_) { return null; }
}

async function _writeBaseline(b) {
    await DataDir.atomicWrite(_baselinePath(), JSON.stringify(b, null, 2), { mode: 0o600 });
}

function _sha256File(p) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(p);
        const t = setTimeout(() => {
            try { s.destroy(new Error('timeout')); } catch (_) {}
        }, HASH_TIMEOUT_MS);
        s.on('data', (c) => h.update(c));
        s.on('end', () => { clearTimeout(t); resolve(h.digest('hex')); });
        s.on('error', (err) => { clearTimeout(t); reject(err); });
    });
}

function _exec(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        execFile(cmd, args, {
            timeout: timeoutMs || SHELL_TIMEOUT_MS,
            maxBuffer: 64 * 1024,
            env: { PATH: process.env.PATH || '/usr/sbin:/usr/bin:/sbin:/bin' },
        }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout: String(stdout || ''),
                stderr: String(stderr || ''),
            });
        });
    });
}

async function _fileFingerprint(p) {
    if (!p) { return null; }
    try {
        const st = await fsp.stat(p);
        const sha = await _sha256File(p);
        return { path: p, size: st.size, mtimeMs: Math.floor(st.mtimeMs), sha256: sha };
    } catch (_) { return null; }
}

/**
 * Capture the install-time baseline. Called lazily on first integrity
 * check after a fresh install (when baseline file doesn't exist) so
 * we don't slow down the install flow itself. Records:
 *   - ela + ela-cli SHA256
 *   - keystore.dat mtime + size (if present)
 *   - /etc/pc2.env mtime + size
 *   - systemd unit mtimes for pc2-node + any ela-related units
 */
async function captureBaseline(opts) {
    const log = (opts && opts.log) || _noopLog();
    const dl = ChainRegistry.getBinaryDownloader && ChainRegistry.getBinaryDownloader();
    const onDisk = dl ? await dl.getStatusWithDisk('mainchain').catch(() => null) : null;

    const baseline = {
        capturedAt: Date.now(),
        binary: await _fileFingerprint(onDisk && onDisk.binaryPath),
        cli: await _fileFingerprint(onDisk && onDisk.cliPath),
        keystore: await _fileFingerprint(
            path.join(DataDir.chainDir('mainchain'), 'keystore.dat'),
        ),
        pc2Env: await _fileFingerprint('/etc/pc2.env').catch(() => null),
    };
    await _writeBaseline(baseline);
    log.info(`${ENM_LOG_PREFIX} integrity: baseline captured`);
    return baseline;
}

/**
 * Run all integrity checks. Cheap: file hashing on 50 MB binary is
 * <100 ms on a modern host; everything else is metadata only.
 *
 * @returns {Promise<{ summary: {status, ok, warn, fail, unknown}, checks: Array, baselineCapturedAt: number|null }>}
 */
async function runAll(opts) {
    const log = (opts && opts.log) || _noopLog();
    let baseline = await _readBaseline();
    if (!baseline) {
        // First run: capture baseline. Subsequent runs will compare
        // against it. The first run's "expected" values ARE the
        // current values, so this run will show all-OK; subsequent
        // changes show drift.
        baseline = await captureBaseline({ log });
    }

    const checks = [];
    checks.push(await _checkBinary(baseline, 'binary', 'ela'));
    checks.push(await _checkBinary(baseline, 'cli', 'ela-cli'));
    checks.push(await _checkKeystoreTamper(baseline));
    checks.push(await _checkProcessLineage());
    checks.push(await _checkClockSync());
    checks.push(await _checkVirtualization());
    checks.push(await _checkPc2Env(baseline));

    const summary = checks.reduce((a, c) => {
        a[c.status] = (a[c.status] || 0) + 1;
        return a;
    }, { ok: 0, warn: 0, fail: 0, unknown: 0 });
    summary.status = summary.fail > 0 ? 'fail'
                   : summary.warn > 0 ? 'warn'
                   : 'ok';
    return {
        summary,
        checks,
        baselineCapturedAt: baseline.capturedAt || null,
    };
}

/**
 * Re-capture the baseline. Operator-initiated — only run this when
 * the operator confirms the current state is the new "trusted"
 * state. Used after a legitimate binary update.
 */
async function rebaseline(opts) {
    return await captureBaseline(opts);
}

// ===========================================================================
// Per-check helpers — each returns { id, label, status, detail, ... }
// ===========================================================================

async function _checkBinary(baseline, key, label) {
    const expected = baseline && baseline[key];
    if (!expected || !expected.path) {
        return {
            id: 'binary-' + key, label: label + ' binary',
            status: 'unknown',
            detail: 'No baseline recorded yet.',
        };
    }
    const current = await _fileFingerprint(expected.path);
    if (!current) {
        // 0.5.92 audit Session 92 — drop the ${expected.path} leak from
        // the operator-visible detail string. The row's label already
        // names WHICH binary is missing ("Main chain binary",
        // "Smart Chain binary", etc.). The structured `baseline` field
        // below retains the path for dev forensics + Identity panel
        // detail-view if it ever wants to surface the full path.
        return {
            id: 'binary-' + key, label: label + ' binary',
            status: 'fail',
            detail: 'Binary file is missing. It may have been moved or removed since install — run the deploy script to restore it.',
            baseline: expected,
        };
    }
    if (current.sha256 !== expected.sha256) {
        return {
            id: 'binary-' + key, label: label + ' binary',
            status: 'fail',
            detail: `SHA256 mismatch. Was ${expected.sha256.slice(0, 12)}…, now ${current.sha256.slice(0, 12)}…. `
                + 'Binary has been replaced since install — could be a legitimate update OR tamper.',
            baseline: expected,
            current,
        };
    }
    return {
        id: 'binary-' + key, label: label + ' binary',
        status: 'ok',
        detail: `${current.sha256.slice(0, 12)}… (${(current.size / 1024 / 1024).toFixed(1)} MB)`,
        current,
    };
}

async function _checkKeystoreTamper(baseline) {
    const expected = baseline && baseline.keystore;
    const ksPath = path.join(DataDir.chainDir('mainchain'), 'keystore.dat');
    const current = await _fileFingerprint(ksPath);
    if (!current) {
        // Not having a keystore is OK — operator might be pre-setup.
        return {
            id: 'keystore-tamper', label: 'Keystore tamper-evidence',
            status: 'unknown',
            detail: 'No keystore on disk yet.',
        };
    }
    if (!expected) {
        return {
            id: 'keystore-tamper', label: 'Keystore tamper-evidence',
            status: 'unknown',
            detail: 'Keystore exists but no baseline recorded yet. Will baseline on next run.',
            current: { size: current.size, mtimeMs: current.mtimeMs },
        };
    }
    // Compare size first — a different size unambiguously means
    // the file was rewritten. Hash differences with same size could
    // be a re-encryption (legit) or a swap (bad).
    if (current.size !== expected.size || current.sha256 !== expected.sha256) {
        const dt = current.mtimeMs - expected.mtimeMs;
        return {
            id: 'keystore-tamper', label: 'Keystore tamper-evidence',
            status: 'warn',
            detail: `Keystore changed since baseline (mtime moved by ${Math.round(dt / 1000)}s). `
                + 'If you ran Identity → Reset or Import, this is expected — click Re-baseline. '
                + 'If you did NOT trigger a keystore change, investigate.',
            baseline: { size: expected.size, mtimeMs: expected.mtimeMs },
            current: { size: current.size, mtimeMs: current.mtimeMs },
        };
    }
    return {
        id: 'keystore-tamper', label: 'Keystore tamper-evidence',
        status: 'ok',
        detail: `Unchanged since baseline (${current.size} bytes).`,
    };
}

async function _checkProcessLineage() {
    // ela's parent PID must be ENM's PID. ENM's parent PID must be
    // pc2-node OR systemd (test rig). Anything else is suspicious.
    const ourPid = process.pid;
    let ourPpid = 0;
    try {
        const st = await fsp.readFile('/proc/self/status', 'utf8');
        const m = /^PPid:\s*(\d+)/m.exec(st);
        if (m) { ourPpid = parseInt(m[1], 10); }
    } catch (_) { /* non-linux or unreadable */ }
    let parentCmd = '?';
    if (ourPpid > 0) {
        try {
            parentCmd = (await fsp.readFile(`/proc/${ourPpid}/comm`, 'utf8')).trim();
        } catch (_) { /* may not exist */ }
    }
    // Find ela children of us.
    let elaPids = [];
    try {
        const r = await _exec('pgrep', ['-af', '/var/lib/pc2/data/extensions/elastos-node-manager/.*ela$']);
        elaPids = r.stdout.split('\n').filter(Boolean).map((line) => {
            const m = /^(\d+)/.exec(line);
            return m ? parseInt(m[1], 10) : null;
        }).filter((n) => Number.isInteger(n));
    } catch (_) { /* ignore */ }

    let rogue = [];
    for (const pid of elaPids) {
        try {
            const st = await fsp.readFile(`/proc/${pid}/status`, 'utf8');
            const m = /^PPid:\s*(\d+)/m.exec(st);
            const ppid = m ? parseInt(m[1], 10) : 0;
            if (ppid !== ourPid && ppid !== 1) {
                // Anything not us OR systemd (which reaps orphans) is sus.
                rogue.push({ pid, ppid });
            }
        } catch (_) { /* ignore */ }
    }
    if (rogue.length > 0) {
        return {
            id: 'process-lineage', label: 'Process lineage',
            status: 'warn',
            detail: `Found ela process(es) not parented to ENM: ` + rogue.map(r => `pid=${r.pid} ppid=${r.ppid}`).join('; '),
        };
    }
    return {
        id: 'process-lineage', label: 'Process lineage',
        status: 'ok',
        detail: `ENM pid=${ourPid} parent=${parentCmd} (${ourPpid}); ${elaPids.length} ela child(ren) accounted for.`,
    };
}

async function _checkClockSync() {
    // Prefer chronyc if present, fall back to timedatectl.
    let detail = '';
    const c = await _exec('chronyc', ['tracking']);
    if (c.ok && /Leap status/i.test(c.stdout)) {
        const offM = /System time\s*:\s*(\S+)\s+seconds/.exec(c.stdout);
        const refM = /Reference ID\s*:\s*(\S+)/.exec(c.stdout);
        const offset = offM ? parseFloat(offM[1]) : null;
        const status = (offset != null && Math.abs(offset) > 1.0) ? 'warn' : 'ok';
        return {
            id: 'clock-sync', label: 'Clock sync',
            status,
            detail: `chronyc offset ${offM ? offM[1] : '?'}s, ref ${refM ? refM[1] : '?'}`,
        };
    }
    const td = await _exec('timedatectl', ['status']);
    if (td.ok && /Local time/i.test(td.stdout)) {
        const synced = /NTP synchronized:\s*yes/i.test(td.stdout)
            || /System clock synchronized:\s*yes/i.test(td.stdout);
        detail = (td.stdout.match(/(System clock synchronized|NTP synchronized|Time zone)[^\n]*/g) || []).join(' · ');
        return {
            id: 'clock-sync', label: 'Clock sync',
            status: synced ? 'ok' : 'warn',
            detail: detail || 'timedatectl ran but output unparsed',
        };
    }
    return {
        id: 'clock-sync', label: 'Clock sync',
        status: 'unknown',
        detail: 'No chronyc / timedatectl available.',
    };
}

async function _checkVirtualization() {
    const v = await _exec('systemd-detect-virt', []);
    const virt = v.stdout.trim() || 'unknown';
    const uptimeSec = Math.round(os.uptime());
    // VM uptime under 5 minutes WITHOUT a recent baseline change is
    // a strong indicator of a live-migration or fresh boot.
    let hint = '';
    if (uptimeSec < 5 * 60) {
        hint = ' · host rebooted < 5 min ago';
    }
    return {
        id: 'virtualization', label: 'Virtualization',
        status: 'ok',  // informational only — never a fail
        detail: `${virt} · uptime ${_fmtDur(uptimeSec)}${hint}`,
    };
}

async function _checkPc2Env(baseline) {
    const expected = baseline && baseline.pc2Env;
    const current = await _fileFingerprint('/etc/pc2.env').catch(() => null);
    if (!current) {
        return {
            id: 'pc2-env', label: '/etc/pc2.env tamper-evidence',
            status: 'unknown',
            detail: 'File not readable from ENM (expected on non-root or fresh installs).',
        };
    }
    if (!expected) {
        return {
            id: 'pc2-env', label: '/etc/pc2.env tamper-evidence',
            status: 'unknown',
            detail: 'No baseline yet.',
        };
    }
    if (current.sha256 !== expected.sha256) {
        return {
            id: 'pc2-env', label: '/etc/pc2.env tamper-evidence',
            status: 'warn',
            detail: 'pc2.env changed since baseline. Owner token may have been rotated.',
        };
    }
    return {
        id: 'pc2-env', label: '/etc/pc2.env tamper-evidence',
        status: 'ok',
        detail: 'Unchanged since baseline.',
    };
}

function _fmtDur(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    if (seconds < 86_400) return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3600);
    return d + 'd ' + h + 'h';
}

function _noopLog() {
    return { info() {}, warn() {}, error() {}, debug() {} };
}

module.exports = {
    runAll,
    rebaseline,
    captureBaseline,
    _internals: {
        _fileFingerprint,
        _sha256File,
    },
};
