/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmSystemCheck — v0.5.108 — MANDATORY pre-install hardware gate.
 *
 * Why this exists:
 *   Prior to v0.4.7 the install wizard accepted any host that passed
 *   the soft OS/disk preflights, then half-installed on a Raspberry Pi
 *   with 4 GB RAM + spinning USB disk. Sync would crawl, BPoS would
 *   miss votes, the operator would blame ENM. v0.4.7 hard-blocks the
 *   install at Card 0 when the box can't physically run the workload.
 *
 *   Council = full multi-chain operator (ELA + ESC + EID + arbiter,
 *   optionally PG). 8 cores / 42 GB RAM (64 recommended) / 1 TB SSD.
 *
 *   BPoS = mainchain producer only. 4 cores / 8 GB RAM / 150 GB SSD.
 *   The 8 GB minimum is tight (mainchain peaks ~6 GB during sync) so
 *   on exactly-8-GB boxes we offer add-swap remediation.
 *
 * What it returns:
 *   { ts, path, checks[], canProceed, remediation? }
 *   severity:'required' blocks; severity:'recommended' warns only.
 *   `remediation['add-swap']` only present for BPoS with RAM === 8 GB.
 *
 * v0.5.108
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { execFile } = require('node:child_process');

const { enmDataDir } = require('./DataDir');
const { ENM_LOG_PREFIX } = require('./EnmConstants');

const BYTES_PER_GB = 1024 * 1024 * 1024;
const EXEC_TIMEOUT_MS = 10_000;
const SWAPFILE_PATH = '/swapfile';
const SWAPFILE_SIZE_MB = 4096; // 4 GB
const FSTAB_PATH = '/etc/fstab';
const FSTAB_ENTRY = '/swapfile none swap sw 0 0';

/**
 * Per-path thresholds. Frozen so tests can introspect without mutating.
 * `ramRecommendedGb` only triggers a 'recommended' warning when total
 * is in [min, recommended); `ramRemediableExactGb` triggers add-swap
 * (only the exact value — <8 GB is hopeless, >8 GB doesn't need it).
 *
 * beta.0.5.0 — opt-in dev relaxation. Setting
 * `ENM_DEV_RELAX_SYSCHECK=true` swaps the strict thresholds for a
 * relaxed set (council RAM 30 GB / disk 50 GB) so the wizard can run
 * on developer boxes. NOT FOR PRODUCTION — gated by an explicit env
 * flag + a stderr warning so it can't be enabled accidentally. The
 * exported `THRESHOLDS` name stays stable so callers and tests still
 * resolve.
 */
const RELAX = process.env.ENM_DEV_RELAX_SYSCHECK === 'true';
if (RELAX) {
    // Warning log so the operator sees this in journalctl
    // eslint-disable-next-line no-console
    console.warn('[EnmSystemCheck] ENM_DEV_RELAX_SYSCHECK=true — using relaxed thresholds. NOT FOR PRODUCTION.');
}
const THRESHOLDS_STRICT = Object.freeze({
    council: Object.freeze({
        cpuCoresMin: 8,
        ramMinGb: 42,
        ramRecommendedGb: 64,
        // P0-16 (v0.5.181) — was 1024 (1 TB), which false-blocked the majority of
        // standard 500–512 GB NVMe VPS hosts a full Council actually fits on. A
        // full Council (ela + esc/eid/pg + arbiter, with snapshot install headroom)
        // realistically needs a few hundred GB; 400 leaves growth room without
        // rejecting capable hosts. Per-value env override below for edge cases.
        diskFreeGbMin: 400,
        ramRemediableExactGb: null,
    }),
    bpos: Object.freeze({
        cpuCoresMin: 4,
        ramMinGb: 8,
        ramRecommendedGb: 8,
        diskFreeGbMin: 150,
        ramRemediableExactGb: 8,
    }),
});
const THRESHOLDS_RELAXED = Object.freeze({
    council: Object.freeze({
        cpuCoresMin: 8,
        ramMinGb: 30,
        ramRecommendedGb: 32,
        diskFreeGbMin: 50,
        ramRemediableExactGb: null,
    }),
    bpos: Object.freeze({
        cpuCoresMin: 4,
        ramMinGb: 8,
        ramRecommendedGb: 8,
        diskFreeGbMin: 50,
        ramRemediableExactGb: 8,
    }),
});
const THRESHOLDS_BASE = RELAX ? THRESHOLDS_RELAXED : THRESHOLDS_STRICT;

/**
 * P0-16 (v0.5.181) — read a non-negative numeric env override, else fall back.
 * Lets an operator tune ONE threshold for their host without a code patch and
 * without the blunt all-or-nothing RELAX flag (the documented pain point).
 *
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function _envNum(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') { return fallback; }
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0) ? n : fallback;
}

// Final thresholds = base (strict or relaxed) with per-value env overrides
// applied to the gating values (CPU / RAM-min / disk-free). Honored env vars:
//   ENM_COUNCIL_CPU_CORES_MIN, ENM_COUNCIL_RAM_MIN_GB, ENM_COUNCIL_DISK_FREE_GB
//   ENM_BPOS_CPU_CORES_MIN,    ENM_BPOS_RAM_MIN_GB,    ENM_BPOS_DISK_FREE_GB
const THRESHOLDS = Object.freeze({
    council: Object.freeze({
        cpuCoresMin: _envNum('ENM_COUNCIL_CPU_CORES_MIN', THRESHOLDS_BASE.council.cpuCoresMin),
        ramMinGb: _envNum('ENM_COUNCIL_RAM_MIN_GB', THRESHOLDS_BASE.council.ramMinGb),
        ramRecommendedGb: THRESHOLDS_BASE.council.ramRecommendedGb,
        diskFreeGbMin: _envNum('ENM_COUNCIL_DISK_FREE_GB', THRESHOLDS_BASE.council.diskFreeGbMin),
        ramRemediableExactGb: THRESHOLDS_BASE.council.ramRemediableExactGb,
    }),
    bpos: Object.freeze({
        cpuCoresMin: _envNum('ENM_BPOS_CPU_CORES_MIN', THRESHOLDS_BASE.bpos.cpuCoresMin),
        ramMinGb: _envNum('ENM_BPOS_RAM_MIN_GB', THRESHOLDS_BASE.bpos.ramMinGb),
        ramRecommendedGb: THRESHOLDS_BASE.bpos.ramRecommendedGb,
        diskFreeGbMin: _envNum('ENM_BPOS_DISK_FREE_GB', THRESHOLDS_BASE.bpos.diskFreeGbMin),
        ramRemediableExactGb: THRESHOLDS_BASE.bpos.ramRemediableExactGb,
    }),
});

/**
 * Round bytes → whole GB. Truncate (Math.floor) so "31.9 GB" doesn't
 * round up past a 32 GB threshold; better to under-report than to let
 * a borderline box in.
 */
function bytesToGb(bytes) {
    return Math.floor(Number(bytes) / BYTES_PER_GB);
}

/** Capitalize for friendlier copy ("council" → "Council"). */
function ucfirst(s) {
    if (!s) { return ''; }
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Run a command via execFile (no shell interpretation). Never throws —
 * resolves with { stdout, stderr, code } so the caller can inspect
 * even on failure.
 */
function execCapture(cmd, args) {
    return new Promise((resolve) => {
        execFile(cmd, args || [], {
            timeout: EXEC_TIMEOUT_MS,
            maxBuffer: 256 * 1024,
            env: { PATH: process.env.PATH || '/usr/sbin:/usr/bin:/sbin:/bin' },
        }, (err, stdout, stderr) => {
            resolve({
                stdout: String(stdout || ''),
                stderr: String(stderr || ''),
                code: err ? (err.code === undefined ? null : Number(err.code)) : 0,
            });
        });
    });
}

/**
 * Parse /etc/os-release. Inlined rather than calling OsPreflight so
 * the gate stays independent of the soft check.
 *
 * @returns {Object<string,string>|null}
 */
function readOsRelease() {
    let raw;
    try {
        raw = fs.readFileSync('/etc/os-release', 'utf8');
    } catch (_) {
        return null;
    }
    const out = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) { continue; }
        const eq = trimmed.indexOf('=');
        if (eq <= 0) { continue; }
        const key = trimmed.slice(0, eq);
        let value = trimmed.slice(eq + 1);
        if (value.length >= 2
            && (value[0] === '"' || value[0] === "'")
            && value[value.length - 1] === value[0]) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

/**
 * Check #1 — OS must be Ubuntu. Pure: pass a synthetic os-release map
 * from tests.
 *
 * @param {Object<string,string>|null} release
 * @returns {{ok:boolean, message:string}}
 */
function checkOs(release) {
    if (!release) {
        return { ok: false, message: 'Could not read /etc/os-release — Ubuntu required' };
    }
    const id = (release.ID || '').toLowerCase().trim();
    const pretty = release.PRETTY_NAME || release.NAME || id || 'unknown';
    if (id === 'ubuntu') {
        return { ok: true, message: pretty };
    }
    return { ok: false, message: `Detected ${id || 'unknown'} — Ubuntu required` };
}

/** Check #2 — CPU cores (logical, as Go's runtime.GOMAXPROCS would see). */
function checkCpu(actualCores, requiredCores, pathName) {
    if (actualCores >= requiredCores) {
        return { ok: true, message: `${actualCores} cores` };
    }
    return {
        ok: false,
        message: `Only ${actualCores} cores — ${ucfirst(pathName)} needs >=${requiredCores}`,
    };
}

/**
 * Check #3 — RAM. Single merged row carrying min + recommended logic:
 *   - below min:           severity=required, ok=false,
 *                          message="31 GB total — Council needs ≥42 GB (64 GB recommended)"
 *   - between min and rec: severity=recommended, ok=false,
 *                          message="50 GB total — Council recommends 64 GB"
 *   - at/above rec:        severity=required, ok=true,
 *                          message="64 GB total"
 *
 * 0.5.141 audit Session 141 — replaced the previous two-row design
 * (`RAM (minimum)` + `RAM (recommended)`) that emitted both rows for
 * the same fact (operator's GB total) with different threshold
 * comparisons on each row. On a borderline box the operator saw two
 * adjacent ✗/⚠ rows both pointing at their 31 GB RAM, which read as
 * "this is broken in two ways" when really it's the same fact
 * surfaced twice. New shape: one row, one fact, severity drives the
 * gate decision (required blocks, recommended warns).
 */
function checkRam(totalGb, minGb, recommendedGb, pathName) {
    if (totalGb < minGb) {
        let msg = `${totalGb} GB total — ${ucfirst(pathName)} needs >=${minGb} GB`;
        if (recommendedGb > minGb) {
            msg += ` (${recommendedGb} GB recommended)`;
        }
        return { ok: false, message: msg, severity: 'required' };
    }
    if (recommendedGb > minGb && totalGb < recommendedGb) {
        return {
            ok: false,
            message: `${totalGb} GB total — ${ucfirst(pathName)} recommends ${recommendedGb} GB`,
            severity: 'recommended',
        };
    }
    return { ok: true, message: `${totalGb} GB total`, severity: 'required' };
}

/**
 * Check #4 — free disk in enmDataDir(). `bavail` is the conservative
 * "non-root usable" number; we run as root in production but bavail
 * never over-reports, which is what we want at a hard gate.
 */
async function checkDisk(dir, requiredGb, pathName) {
    let stats;
    try {
        stats = await fsp.statfs(dir);
    } catch (err) {
        return { ok: false, message: `Could not stat filesystem at ${dir}: ${err.message}` };
    }
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const freeGb = bytesToGb(freeBytes);
    if (freeGb >= requiredGb) {
        return { ok: true, message: `${freeGb} GB free`, freeGb };
    }
    return {
        ok: false,
        message: `${freeGb} GB free — ${ucfirst(pathName)} needs >=${requiredGb} GB`,
        freeGb,
    };
}

/**
 * Resolve the base block device backing /.
 *   - findmnt → /dev/sda1 | /dev/nvme0n1p1 | ...
 *   - strip /dev/
 *   - nvme<X>n<Y>p<Z> → nvme<X>n<Y>, flag isNvme=true
 *   - otherwise strip trailing partition digits (sda1 → sda)
 *
 * @returns {Promise<{device:string|null, isNvme:boolean, source:string|null}>}
 */
async function resolveRootDevice() {
    const r = await execCapture('findmnt', ['-n', '-o', 'SOURCE', '/']);
    if (r.code !== 0) {
        return { device: null, isNvme: false, source: null };
    }
    const source = r.stdout.trim();
    if (!source) {
        return { device: null, isNvme: false, source: null };
    }
    let name = source;
    if (name.startsWith('/dev/')) {
        name = name.slice('/dev/'.length);
    }
    if (name.startsWith('nvme')) {
        const m = name.match(/^(nvme\d+n\d+)(p\d+)?$/);
        if (m) {
            return { device: m[1], isNvme: true, source };
        }
        // Unrecognised nvme shape — still flag NVMe (avoids false
        // "spinning disk" classification on unusual drives).
        return { device: name, isNvme: true, source };
    }
    const base = name.replace(/\d+$/, '');
    return { device: base || name, isNvme: false, source };
}

/**
 * Check #5 — storage must be SSD/NVMe. Short-circuits:
 *   - device name starts with `nvme` → always NVMe
 *   - cannot resolve device → reject (better than silent pass on a
 *     spinning disk)
 * Otherwise read /sys/block/<dev>/queue/rotational (0=SSD, 1=spinning).
 */
async function checkStorageType() {
    const root = await resolveRootDevice();
    if (root.isNvme) {
        return { ok: true, message: `NVMe (${root.device})` };
    }
    if (!root.device) {
        return { ok: false, message: 'Could not resolve root block device — SSD/NVMe required' };
    }
    const rotPath = `/sys/block/${root.device}/queue/rotational`;
    let rot;
    try {
        rot = fs.readFileSync(rotPath, 'utf8').trim();
    } catch (_) {
        // 0.5.109 audit Session 109 — replaced err.message interpolation
        // with a static fallback. Pre-0.5.109 we surfaced Node fs error
        // text verbatim (e.g. "EACCES: permission denied, open ...");
        // the path is already in this message so the err.message was
        // mostly tautological, but it propagated raw filesystem errno
        // strings into operator-facing UI on a hard preflight gate.
        // Matches the static-fallback pattern from Sessions 64/67/79/
        // 81-84 for routes — a server-side preflight is the same shape.
        return {
            ok: false,
            message: `Could not probe storage type at ${rotPath} — SSD/NVMe required`,
        };
    }
    if (rot === '0') {
        return { ok: true, message: `SSD (${root.device})` };
    }
    if (rot === '1') {
        return {
            ok: false,
            message: `Spinning disk detected (${root.device}) — SSD/NVMe required`,
        };
    }
    return {
        ok: false,
        message: `Unrecognised rotational flag "${rot}" for ${root.device} — SSD/NVMe required`,
    };
}

/**
 * Compose the full report.
 *
 * @param {{path:'council'|'bpos'}} input
 * @returns {Promise<object>}
 */
async function runSystemCheck(input) {
    const pathName = (input && input.path) || 'council';
    if (pathName !== 'council' && pathName !== 'bpos') {
        throw new Error(`EnmSystemCheck.runSystemCheck: unknown path "${pathName}"`);
    }
    // beta.0.5.0 — synthetic pass when setup is already completed.
    // 0.5.2 audit Session 2 — also short-circuit when install is
    // IN PROGRESS (cfg.chains.mainchain present + binaryPath set,
    // setup.completed still false). Pre-0.5.2 a Card 2 back-nav during
    // the snapshot-extraction window measured live disk-free which is
    // depleting by ~50 GB — disk check failed → blocked Continue →
    // operator thought install died. Synthetic "install in progress"
    // pass tells Card 2 to not re-gate during the install.
    // Lazy-require ConfigStore so test harnesses that import THRESHOLDS
    // without a configured data dir don't trip the load() side effect.
    try {
        const ConfigStore = require('./ConfigStore');
        const cfg = await ConfigStore.load();
        if (cfg && cfg.setup && cfg.setup.completed === true) {
            const completedAt = cfg.setup.completedAt || 0;
            // 0.5.2 audit Session 2 — humanise the timestamp. Pre-0.5.2
            // we surfaced toISOString() (e.g. "2026-05-19T03:30:00.000Z")
            // straight to operator-facing copy — hostile and unanchored
            // to local time. toLocaleString() produces e.g.
            // "5/19/2026, 3:30:00 AM" which is human-readable + reflects
            // the host's timezone configuration (good enough; the wizard
            // is operator-only UX so privacy isn't a concern).
            const friendly = completedAt
                ? new Date(completedAt).toLocaleString()
                : 'previously';
            return {
                ts: Date.now(),
                path: pathName,
                previouslyVerified: true,
                checks: [{
                    id: 'setup-completed',
                    label: 'System check previously passed',
                    ok: true,
                    message: `Setup completed ${friendly}`,
                    severity: 'required',
                }],
                canProceed: true,
            };
        }
        // Install-in-progress short-circuit. We detect this by:
        //   (a) cfg.chains.mainchain exists with a binaryPath written
        //       (install-mainchain-cfg step completed), OR
        //   (b) cfg.global.council.masterPasswordEncrypted is set
        //       (council-strategy step ran but install-mainchain-cfg
        //       may not have completed yet — early window).
        // Either signal means hardware was already validated when the
        // operator hit the real Card 2 earlier in this install session.
        const installStarted = (cfg && cfg.chains && cfg.chains.mainchain
            && cfg.chains.mainchain.binaryPath) || (cfg && cfg.global
            && cfg.global.council
            && cfg.global.council.masterPasswordEncrypted);
        if (installStarted) {
            return {
                ts: Date.now(),
                path: pathName,
                installInProgress: true,
                checks: [{
                    id: 'install-in-progress',
                    label: 'Install in progress — system check already passed',
                    ok: true,
                    message: 'Disk free is depleting as snapshots extract; '
                           + 're-checking now would surface a false failure. '
                           + 'Hardware was validated when you first reached Card 2.',
                    severity: 'required',
                }],
                canProceed: true,
            };
        }
    } catch (_) { /* not yet configured — run the real checks */ }
    const t = THRESHOLDS[pathName];

    const release = readOsRelease();
    const cores = os.cpus().length;
    const totalGb = bytesToGb(os.totalmem());
    const dataDir = enmDataDir();

    const [diskResult, storageResult] = await Promise.all([
        checkDisk(dataDir, t.diskFreeGbMin, pathName),
        checkStorageType(),
    ]);

    const osResult = checkOs(release);
    const cpuResult = checkCpu(cores, t.cpuCoresMin, pathName);
    // 0.5.141 audit Session 141 — merged "RAM (minimum)" + "RAM
    // (recommended)" into a single row. checkRam now returns
    // { ok, message, severity } so this site doesn't need to
    // hardcode severity per row.
    const ramResult = checkRam(totalGb, t.ramMinGb, t.ramRecommendedGb, pathName);

    const checks = [
        { id: 'os', label: 'Operating system', ok: osResult.ok, message: osResult.message, severity: 'required' },
        { id: 'cpu', label: 'CPU cores', ok: cpuResult.ok, message: cpuResult.message, severity: 'required' },
        { id: 'ram', label: 'RAM', ok: ramResult.ok, message: ramResult.message, severity: ramResult.severity },
    ];

    checks.push({
        id: 'disk',
        label: 'Free disk',
        ok: diskResult.ok,
        message: diskResult.message,
        severity: 'required',
    });
    checks.push({
        id: 'storage-type',
        label: 'Storage type',
        ok: storageResult.ok,
        message: storageResult.message,
        severity: 'required',
    });

    const canProceed = checks
        .filter((c) => c.severity === 'required')
        .every((c) => c.ok);

    const report = { ts: Date.now(), path: pathName, checks, canProceed };

    // Remediation only when applicable — don't emit an empty object.
    if (
        pathName === 'bpos'
        && t.ramRemediableExactGb
        && totalGb === t.ramRemediableExactGb
        && ramResult.ok
    ) {
        report.remediation = {
            'add-swap': {
                available: true,
                action: 'create 4GB swapfile',
                endpoint: 'POST /api/enm/setup/system/add-swap',
            },
        };
    }

    return report;
}

/**
 * Idempotent fstab check — match the path as the first whitespace
 * field on any non-comment line (more robust than substring search).
 */
function fstabAlreadyHasSwapfile() {
    let raw;
    try {
        raw = fs.readFileSync(FSTAB_PATH, 'utf8');
    } catch (_) {
        return false;
    }
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) { continue; }
        const firstField = trimmed.split(/\s+/)[0];
        if (firstField === SWAPFILE_PATH) { return true; }
    }
    return false;
}

/**
 * 0.5.109 audit Session 109 — kernel-side active-swap check, used by
 * addSwap as a precondition. Reading /proc/swaps is the canonical way
 * to ask Linux "is this path currently mapped as swap" — the file is
 * always present on a running kernel and lists active swap targets,
 * one per line, with the filename in column 1 (the header line is
 * literally "Filename ..." which we skip).
 *
 * Why this matters: addSwap's dd step rewrites /swapfile with zeros.
 * If the kernel currently holds page-table entries pointing into
 * /swapfile (i.e. the file is active swap), dd-ing over it can corrupt
 * swap data — the kernel reads from disk blocks the filesystem hasn't
 * promised it'd preserve. Pre-0.5.109 we only checked /etc/fstab
 * (persistence), not /proc/swaps (active state). Operator could click
 * "Add 4 GB swap" twice and the second call would overwrite live swap.
 */
function swapfileAlreadyActive() {
    let raw;
    try {
        raw = fs.readFileSync('/proc/swaps', 'utf8');
    } catch (_) {
        // /proc/swaps missing → not Linux or unusual environment. Treat
        // as "not active" — addSwap's dd will either work or fail
        // cleanly. Don't block on inability to detect.
        return false;
    }
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) { continue; }
        // Skip the header line that /proc/swaps emits first.
        if (trimmed.startsWith('Filename')) { continue; }
        const firstField = trimmed.split(/\s+/)[0];
        if (firstField === SWAPFILE_PATH) { return true; }
    }
    return false;
}

/**
 * addSwap — create + enable + persist a 4 GB swapfile. Idempotent;
 * safe to call again (dd truncates, fstab append is gated).
 *
 * Steps (each wrapped, structured failure on any step):
 *   1. dd if=/dev/zero of=/swapfile bs=1M count=4096
 *   2. chmod 0600 /swapfile  (mkswap refuses world-readable swap)
 *   3. mkswap /swapfile
 *   4. swapon /swapfile
 *   5. append /swapfile entry to /etc/fstab if not present
 *
 * Requires root. PC2 boots as root in production; otherwise step 1
 * fails and we surface the error.
 *
 * @returns {Promise<{ok:true, freeGbAfter:number} | {ok:false, error:string}>}
 */
async function addSwap() {
    try {
        // 0.5.109 audit Session 109 — kernel-side precheck. If
        // /swapfile is currently active swap, do NOT dd over it (would
        // corrupt active swap pages, see swapfileAlreadyActive's
        // header). The remediation chip on Card 2 keeps appearing for
        // BPoS-with-8GB-RAM even after a successful add-swap because
        // the threshold check still matches (totalmem unchanged), so
        // operator could click it again — or curl the route directly.
        // Persistence guard (fstabAlreadyHasSwapfile) is checked
        // separately below for the fstab append.
        if (swapfileAlreadyActive()) {
            return {
                ok: true,
                freeGbAfter: bytesToGb(os.freemem()),
                alreadyActive: true,
            };
        }

        const dd = await execCapture('dd', [
            'if=/dev/zero',
            `of=${SWAPFILE_PATH}`,
            'bs=1M',
            `count=${SWAPFILE_SIZE_MB}`,
        ]);
        if (dd.code !== 0) {
            return {
                ok: false,
                error: `dd failed (code ${dd.code}): ${(dd.stderr || dd.stdout).trim()}`,
            };
        }

        try {
            await fsp.chmod(SWAPFILE_PATH, 0o600);
        } catch (err) {
            return { ok: false, error: `chmod 0600 ${SWAPFILE_PATH}: ${err.message}` };
        }

        const mkswap = await execCapture('mkswap', [SWAPFILE_PATH]);
        if (mkswap.code !== 0) {
            return {
                ok: false,
                error: `mkswap failed (code ${mkswap.code}): ${(mkswap.stderr || mkswap.stdout).trim()}`,
            };
        }

        const swapon = await execCapture('swapon', [SWAPFILE_PATH]);
        if (swapon.code !== 0) {
            return {
                ok: false,
                error: `swapon failed (code ${swapon.code}): ${(swapon.stderr || swapon.stdout).trim()}`,
            };
        }

        if (!fstabAlreadyHasSwapfile()) {
            try {
                // Leading newline guards against fstab files that
                // don't end with one (rare but real on edited hosts).
                await fsp.appendFile(FSTAB_PATH, `\n${FSTAB_ENTRY}\n`, { mode: 0o644 });
            } catch (err) {
                return { ok: false, error: `append ${FSTAB_PATH}: ${err.message}` };
            }
        }

        const freeGbAfter = bytesToGb(os.freemem());
        // eslint-disable-next-line no-console
        console.log(`${ENM_LOG_PREFIX} addSwap: 4 GB swapfile active at ${SWAPFILE_PATH}`);
        return { ok: true, freeGbAfter };
    } catch (err) {
        return { ok: false, error: `unexpected: ${err && err.message ? err.message : String(err)}` };
    }
}

module.exports = {
    runSystemCheck,
    addSwap,
    // Exported for tests + introspection (frontend wizard reads
    // THRESHOLDS to render "this path requires X" BEFORE the check
    // runs; individual check helpers let unit tests drive them with
    // synthetic inputs without spawning subprocesses).
    THRESHOLDS,
    checkOs,
    checkCpu,
    checkRam,
    checkDisk,
    checkStorageType,
    resolveRootDevice,
    fstabAlreadyHasSwapfile,
    swapfileAlreadyActive,
    bytesToGb,
};

// Inline manual test. Operators can run on the target box:
//   ENM_INLINE_TEST=1 node enm-server/src/services/EnmSystemCheck.js
// Gated on the env var so the module stays import-safe.
if (process.env.ENM_INLINE_TEST === '1' && require.main === module) {
    (async function __test_inline() {
        try {
            const report = await runSystemCheck({ path: 'council' });
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(report, null, 2));
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`${ENM_LOG_PREFIX} inline test failed:`, err);
            process.exit(1);
        }
    })();
}
