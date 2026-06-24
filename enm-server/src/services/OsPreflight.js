/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * OsPreflight — host OS capability check.
 *
 * v0.5.181 (P0-10): supports ANY glibc Linux. The only hard block is musl libc
 * (Alpine), because the Elastos chain binaries + the Node runtime tarball are
 * glibc-built. Non-Debian glibc distros (RHEL/Fedora/Rocky/Alma/Amazon/Arch/…)
 * are allowed with a non-blocking `warning` (less-tested path). The previous
 * Debian-family-only gate false-blocked most capable hosts.
 *
 * Reads ID and ID_LIKE from /etc/os-release per
 * https://www.freedesktop.org/software/systemd/man/os-release.html
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');

const SUPPORTED_DISTROS = Object.freeze(['ubuntu', 'debian']);
const SUPPORTED_LIKE = Object.freeze(['debian']); // covers Ubuntu derivatives

/**
 * @typedef {object} OsPreflightResult
 * @property {boolean} ok
 * @property {'linux'|'darwin'|'win32'|'other'} platform
 * @property {string} [distroId]   from os-release ID
 * @property {string} [distroLike] from os-release ID_LIKE
 * @property {string} [version]    from os-release VERSION_ID
 * @property {string} [reason]     human-readable explanation
 */

/**
 * Inspect the host OS. Always synchronous, never throws — returns ok=false
 * with a reason instead.
 *
 * @returns {OsPreflightResult}
 */
function check() {
    const platform = os.platform();
    if (platform !== 'linux') {
        return {
            ok: false,
            platform: mapPlatform(platform),
            reason: `Elastos Node Manager runs on Linux only. Detected ${platform}.`,
        };
    }

    const release = readOsRelease();
    const distroId = (release && release.ID || '').toLowerCase().trim();
    const distroLike = (release && release.ID_LIKE || '').toLowerCase().trim();
    const version = release && release.VERSION_ID;

    // P0-10 (v0.5.181) — the ONLY hard OS incompatibility is the C library: the
    // Elastos chain binaries AND the Node runtime tarball are glibc-built and will
    // not run on musl (Alpine). Every other glibc distro (RHEL/Fedora/Rocky/Alma/
    // Amazon Linux/Arch/openSUSE/…) runs the same binaries fine. The old
    // Debian-family-only gate hard-blocked the majority of "hundreds of operators"
    // on perfectly capable hosts. Now we block only musl and let any glibc Linux
    // proceed (with a non-blocking warning for non-Debian, less-tested distros).
    if (_isMuslSystem(distroId, distroLike)) {
        return {
            ok: false,
            platform: 'linux',
            distroId,
            distroLike,
            version,
            reason: 'This host uses musl libc (Alpine). The Elastos chain binaries and '
                + 'the Node runtime are glibc-built and will not run here. Use a glibc '
                + 'distro (Ubuntu, Debian, RHEL, Fedora, Rocky, Alma, etc.).',
        };
    }

    const debianFamily = SUPPORTED_DISTROS.includes(distroId)
        || (distroLike && SUPPORTED_LIKE.some((s) => distroLike.includes(s)));
    const result = { ok: true, platform: 'linux', distroId, distroLike, version };
    if (!release) {
        result.warning = 'Could not read /etc/os-release; proceeding on the assumption this '
            + 'is a glibc Linux.';
    } else if (!debianFamily) {
        result.warning = `Detected ${distroId || 'an unknown distro'} (not Debian-family). `
            + 'ENM is most tested on Ubuntu/Debian but runs on any glibc Linux — proceeding.';
    }
    return result;
}

/**
 * Detect a musl-libc system (Alpine + variants). musl is the one glibc-binary
 * incompatibility we must hard-block. Best-effort + never throws.
 *
 * @param {string} distroId
 * @param {string} distroLike
 * @returns {boolean}
 */
function _isMuslSystem(distroId, distroLike) {
    if (distroId === 'alpine' || (distroLike && distroLike.includes('alpine'))) {
        return true;
    }
    try {
        if (fs.existsSync('/etc/alpine-release')) { return true; }
    } catch { /* ignore */ }
    // The musl dynamic loader lives at /lib/ld-musl-<arch>.so.1 on musl systems.
    try {
        if (fs.readdirSync('/lib').some((f) => f.startsWith('ld-musl-'))) { return true; }
    } catch { /* /lib unreadable — assume glibc */ }
    return false;
}

/**
 * Parse /etc/os-release into a flat object. Returns null if the file is missing
 * or malformed.
 *
 * @returns {Object<string,string>|null}
 */
function readOsRelease() {
    let raw;
    try {
        raw = fs.readFileSync('/etc/os-release', 'utf8');
    } catch {
        return null;
    }
    const out = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq <= 0) {
            continue;
        }
        const key = trimmed.slice(0, eq);
        let value = trimmed.slice(eq + 1);
        // Values may be quoted: KEY="value with spaces"
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
 * @param {string} p
 * @returns {'linux'|'darwin'|'win32'|'other'}
 */
function mapPlatform(p) {
    if (p === 'linux' || p === 'darwin' || p === 'win32') {
        return p;
    }
    return 'other';
}

module.exports = {
    check,
    SUPPORTED_DISTROS,
};
