/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmBinaryLocator — validate the operator's pre-built ela binary path.
 *
 * v0.1 does NOT download or auto-build (Rev 9). The operator runs `make all`
 * themselves on Elastos.ELA per docs/BUILD-ELA.md and points us at the result.
 *
 * Validation (in order of cost):
 *   1. Path is a string and absolute.
 *   2. Path traversal sanity check (no ".." segments).
 *   3. fs.statSync — must be a regular file.
 *   4. File mode includes the executable bit.
 *   5. (Phase 2 expansion) `./ela --version` smoke test — confirms it runs.
 *
 * NOTE: Phase 1b stops at step 4. The smoke-test runs inside NativeProcessService
 * during Phase 2 because spawning is its responsibility.
 */

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {object} BinaryValidation
 * @property {boolean} ok
 * @property {string} [reason]   human-readable failure
 * @property {string} [resolvedPath] absolute, normalized path
 * @property {number} [sizeBytes]
 */

/**
 * Synchronous static validation. Cheap — does not spawn the binary.
 *
 * @param {string} binaryPath absolute path to ela binary
 * @returns {BinaryValidation}
 */
function validatePath(binaryPath) {
    if (typeof binaryPath !== 'string' || binaryPath.length === 0) {
        return { ok: false, reason: 'Binary path is required.' };
    }
    if (!path.isAbsolute(binaryPath)) {
        return { ok: false, reason: `Binary path must be absolute: "${binaryPath}".` };
    }
    // Reject `..` segments BEFORE normalization. After path.normalize,
    // "/tmp/foo/../etc/passwd" collapses to "/tmp/etc/passwd" — letting a
    // traversal-shaped input through this check. We refuse the raw form so
    // operators see the safety error rather than a confusing "no such file".
    if (binaryPath.split(path.sep).some((seg) => seg === '..')) {
        return { ok: false, reason: 'Binary path contains parent-directory references; refuse for safety.' };
    }
    const normalized = path.normalize(binaryPath);

    let stat;
    try {
        stat = fs.statSync(normalized);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { ok: false, reason: `No file at ${normalized}. Did you run "make all" in the Elastos.ELA repo?` };
        }
        // 0.5.110 audit Session 110 — replaced err.message interpolation
        // with a static fallback. Pre-0.5.110 we surfaced Node fs errno
        // strings verbatim into operator-facing UI; the path is already
        // in the message so the err.message was mostly redundant on top
        // of leaky. Common shape was EACCES/EPERM — operator-fixable.
        // Matches Sessions 64/67/79/81-84 static-fallback pattern.
        if (err.code === 'EACCES' || err.code === 'EPERM') {
            return { ok: false, reason: `Permission denied reading ${normalized}. Fix with: chmod +r "${normalized}" (or check the parent directory's permissions).` };
        }
        return { ok: false, reason: `Could not read ${normalized}. Check the path is correct and the file is accessible.` };
    }

    if (!stat.isFile()) {
        return { ok: false, reason: `Path ${normalized} is not a regular file.` };
    }

    // Check the owner-execute bit at minimum. We're running as the same user PC2 runs as.
    // eslint-disable-next-line no-bitwise
    const isExecutable = (stat.mode & 0o100) !== 0;
    if (!isExecutable) {
        return {
            ok: false,
            reason: `${normalized} is not executable. Run: chmod +x "${normalized}"`,
        };
    }

    return {
        ok: true,
        resolvedPath: normalized,
        sizeBytes: stat.size,
    };
}

const SMOKE_TIMEOUT_MS = 5_000;
// ELA versions are 4-segment (v0.9.9.5). The trailing (\.\d+)* swallows extra
// patch segments so we don't truncate "v0.9.9.5" into "v0.9.9".
const VERSION_REGEX = /v?\d+\.\d+\.\d+(?:\.\d+)*/;

/**
 * Spawn the binary with `--version` to confirm it's a real Elastos binary
 * (not a symlink to /bin/true, not a wrong arch, not subtly corrupted).
 * Phase 1b stopped at static validation; Phase 2 adds this dynamic check.
 *
 * Captures stdout+stderr (ela writes the banner to stdout but we read both
 * for resilience). Returns the parsed version string on success.
 *
 * @param {string} binaryPath  must already pass validatePath()
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]  default 5s
 * @returns {Promise<{ ok: boolean, version?: string, output?: string, reason?: string }>}
 */
function smokeTest(binaryPath, opts) {
    const timeoutMs = (opts && Number.isInteger(opts.timeoutMs)) ? opts.timeoutMs : SMOKE_TIMEOUT_MS;

    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(binaryPath, ['--version'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: timeoutMs, // node ≥ 16: kills the process if it overruns
            });
        } catch (_) {
            // 0.5.110 audit Session 110 — static fallback (audit chain
            // err.message leak sweep). The binary path is already in the
            // message; the spawn errno (ENOENT/EACCES/EPERM/E2BIG) is
            // covered by the same recovery action.
            return resolve({
                ok: false,
                reason: `Could not start ${binaryPath}. The file may have been moved or its execute permission removed since validation. Re-check the path and "chmod +x" status.`,
            });
        }

        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        if (child.stdout) {
            child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
        }
        if (child.stderr) {
            child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
        }
        child.on('error', (_err) => {
            // 0.5.110 audit Session 110 — static fallback (audit chain
            // err.message leak sweep). The child-process 'error' event
            // fires for spawn failures Node could not raise synchronously
            // — same recovery action as the try/catch above.
            finish({
                ok: false,
                reason: `Could not start ${binaryPath}. The file may have been moved or its execute permission removed since validation.`,
            });
        });
        child.on('exit', (code, signal) => {
            const output = (stdout + stderr).trim();
            if (signal) {
                return finish({
                    ok: false,
                    output,
                    reason: `Binary killed by signal ${signal} (timeout?). Output: ${truncate(output)}`,
                });
            }
            // ela --version exits with 0 and prints the version line.
            // Some build configs may exit non-zero but still print a banner;
            // accept either if we can extract a version-shaped string.
            const match = output.match(VERSION_REGEX);
            if (!match) {
                return finish({
                    ok: false,
                    output,
                    reason: `--version did not return a recognizable version string. Output: ${truncate(output) || '(empty)'}`,
                });
            }
            return finish({ ok: true, version: match[0], output });
        });
    });
}

function truncate(s) {
    if (typeof s !== 'string') return '';
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

module.exports = {
    validatePath,
    smokeTest,
};
