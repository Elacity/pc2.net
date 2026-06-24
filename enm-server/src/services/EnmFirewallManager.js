/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmFirewallManager — beta.3.30. Auto-open the host firewall for
 * chain P2P ports at start time.
 *
 * Why this exists:
 *   On a fresh Ubuntu cloud install (Hostinger, DigitalOcean, et al.)
 *   `ufw` ships preinstalled but inactive by default. Some operator
 *   tooling (or a security-hardened image) enables `ufw` with default-
 *   deny inbound + a narrow allow list (typically just SSH). When ENM
 *   then runs ela bound to 0.0.0.0:20338, the socket is up but
 *   inbound TCP SYN packets are silently dropped at UFW INPUT — so
 *   the chain has outbound peers but zero inbound, accumulates missed
 *   votes if registered as BPoS, and the operator has no idea why.
 *
 *   Diagnosed on a Hostinger Ubuntu VPS 2026-05-15: UFW active with
 *   only 22/4100/4180/4202 allowed. Manual `ufw allow 20338/tcp +
 *   20339/tcp` restored inbound peers within ~10 min.
 *
 *   This module makes that fix automatic. Called by ElaMainChainAdapter
 *   right before spawning ela.
 *
 * What it does:
 *   1. Detect UFW: `ufw status verbose` exit 0 + "Status: active"
 *      → eligible for management. Otherwise → no-op (other firewalls
 *      out of scope; if there's no UFW or it's inactive, we don't
 *      touch the host).
 *   2. Parse the allow list for each chain port (defaults: 20338 P2P,
 *      20339 DPoS p2p). RPC port (20336) intentionally stays closed —
 *      ela's RpcConfiguration.WhiteIPList=["127.0.0.1"] keeps it
 *      loopback-only inside ela, and ENM's own config never opens it
 *      to the network either.
 *   3. For any missing port, run `ufw allow <port>/tcp comment '...'`.
 *      Idempotent — UFW silently no-ops on duplicates anyway.
 *   4. Return a structured report so the caller can log + notify.
 *
 * Architectural notes:
 *   - We never call `ufw enable` (turning UFW on/off is an operator
 *     decision). We only ADD allow rules to an already-active firewall.
 *   - We never remove rules. Operator who wants to revoke can run
 *     `ufw delete allow 20338/tcp` themselves.
 *   - We only manage UFW. firewalld / nftables / raw iptables are out
 *     of scope. If the operator's host uses one of those, they'll see
 *     F18 fire as before and follow the alert's remediation copy.
 *   - We run as root (PC2 boots as root; verified on a test node). If
 *     somehow we're not root, the `ufw allow` exec fails and we
 *     surface the error in the report — caller (chain start) treats
 *     it as warn-not-fail since ela can still run; the operator just
 *     won't get inbound peers.
 *
 * 0.2.0-beta.3.30.
 */

'use strict';

const { spawn } = require('node:child_process');
const os = require('node:os');

const { ENM_LOG_PREFIX } = require('./EnmConstants');

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Run a command, capture stdout/stderr/exit. Doesn't throw on
 * non-zero exit — that's information the caller wants.
 *
 * @returns {Promise<{stdout: string, stderr: string, code: number|null}>}
 */
function execCapture(cmd, args, timeoutMs) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        const child = spawn(cmd, args || [], {
            stdio: ['ignore', 'pipe', 'pipe'],
            // 0.5.108 audit Session 108 — LC_ALL=C forces UFW's
            // gettext output to fall back to English. UFW localizes
            // its status lines via gettext; on a host with
            // LC_ALL=de_DE.UTF-8 (or similar) it emits "Status: aktiv"
            // / "ZULASSEN" / etc, which our /Status:\s*active/i +
            // /ALLOW IN/ regexes don't match. Pre-0.5.108 a localized
            // host silently reported active=false → ensureAllowed was
            // a no-op → no firewall holes opened → BPoS supernode
            // accumulated vote-misses with no inbound peers. Most
            // cloud deploys use C.UTF-8 or en_US.UTF-8 so the bug is
            // rare, but the fix is defensive: setting LC_ALL=C
            // guarantees the regex parses regardless of operator
            // locale settings.
            env: {
                PATH: process.env.PATH || '/usr/sbin:/usr/bin:/sbin:/bin',
                LC_ALL: 'C',
            },
        });
        const t = setTimeout(() => {
            if (settled) { return; }
            settled = true;
            try { child.kill('SIGKILL'); } catch (_) { /* idempotent */ }
            resolve({ stdout, stderr: stderr + '\n[timeout]', code: null });
        }, Number.isInteger(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
        child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
        child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
        child.on('error', () => {
            if (settled) { return; }
            settled = true;
            clearTimeout(t);
            resolve({ stdout, stderr, code: null });
        });
        child.on('close', (code) => {
            if (settled) { return; }
            settled = true;
            clearTimeout(t);
            resolve({ stdout, stderr, code });
        });
    });
}

/**
 * P1 (v0.5.183) — when UFW isn't usable (not installed / inactive / no perms),
 * best-effort probe for ANOTHER active host firewall. We don't manage these
 * (firewalld/nftables/raw iptables stay out of scope per this module's header),
 * but knowing one is active lets the CALLER surface an actionable start-time
 * warning ("a non-UFW firewall is active — open ports 20338/20339 yourself")
 * instead of silently skipping and leaving the operator at 0 inbound peers.
 *
 * Detection is intentionally conservative + never throws:
 *   - firewalld: `firewall-cmd --state` exits 0 and prints "running".
 *   - iptables:  `iptables -L INPUT -n` shows a default-DROP/REJECT INPUT policy
 *     (a default-ACCEPT INPUT chain isn't blocking inbound P2P, so we don't warn).
 *
 * @returns {Promise<{active: boolean, alt: 'firewalld'|'iptables'|null}>}
 */
async function _detectOtherFirewall() {
    // firewalld — authoritative + cheap when present.
    const fw = await execCapture('firewall-cmd', ['--state']);
    if (fw.code === 0 && /running/i.test(`${fw.stdout} ${fw.stderr}`)) {
        return { active: true, alt: 'firewalld' };
    }
    // Raw iptables — only treat as "active firewall" when the INPUT chain
    // defaults to DROP/REJECT (i.e. it actually blocks unmatched inbound).
    const ipt = await execCapture('iptables', ['-L', 'INPUT', '-n']);
    if (ipt.code === 0 && /^Chain INPUT \(policy (DROP|REJECT)\)/im.test(ipt.stdout || '')) {
        return { active: true, alt: 'iptables' };
    }
    return { active: false, alt: null };
}

/**
 * Detect UFW state on this host.
 *
 * @returns {Promise<{
 *   tool: 'ufw'|null,
 *   active: boolean,
 *   allowedTcp: Set<number>,  // ports with an `ALLOW IN  ... tcp` rule
 *   otherFirewallActive?: boolean,  // P1 (v0.5.183) — a non-UFW firewall is up
 *   alt?: 'firewalld'|'iptables',   // which one, when otherFirewallActive
 *   raw?: string
 * }>}
 */
async function detect() {
    if (os.platform() !== 'linux') {
        return { tool: null, active: false, allowedTcp: new Set(), allowedUdp: new Set() };
    }
    const probe = await execCapture('ufw', ['status', 'verbose']);
    // exit 0 only when UFW is installed AND the user has perms to read state.
    // exit 1 / EACCES → we can't determine. Treat as "not eligible".
    if (probe.code !== 0) {
        // P1 (v0.5.183) — UFW unusable; see if a different firewall is blocking.
        const other = await _detectOtherFirewall();
        return {
            tool: null, active: false, allowedTcp: new Set(), allowedUdp: new Set(),
            otherFirewallActive: other.active, alt: other.alt || undefined,
            raw: probe.stderr,
        };
    }
    const out = probe.stdout || '';
    const active = /Status:\s*active/i.test(out);
    if (!active) {
        // P1 (v0.5.183) — UFW present but off; another firewall may still be on.
        const other = await _detectOtherFirewall();
        return {
            tool: 'ufw', active: false, allowedTcp: new Set(), allowedUdp: new Set(),
            otherFirewallActive: other.active, alt: other.alt || undefined,
            raw: out,
        };
    }
    // Parse allowed TCP ports. Match lines like:
    //   22/tcp                     ALLOW IN    Anywhere
    //   20338/tcp                  ALLOW IN    Anywhere                   # ela P2P
    //   80,443/tcp                 ALLOW IN    Anywhere
    // We ignore (v6) duplicates — UFW emits a v4 line and a v6 line per rule.
    // P0-15 (v0.5.178) — parse BOTH tcp and udp allow lines. The EVM geth fork
    // shares its --port for the TCP listener AND UDP discv4 discovery, so the P2P
    // port needs a /udp rule too or discovery is silently dropped on a default-deny
    // UFW host (the "stuck at 0 peers" symptom this whole module exists to prevent).
    const allowedTcp = new Set();
    const allowedUdp = new Set();
    const lineRe = /^([\d,\s]+)\/(tcp|udp)(?:\s*\([\w]+\))?\s+ALLOW IN\b/i;
    out.split(/\r?\n/).forEach((line) => {
        const m = lineRe.exec(line.trim());
        if (!m) { return; }
        const set = m[2].toLowerCase() === 'udp' ? allowedUdp : allowedTcp;
        m[1].split(',').forEach((p) => {
            const n = parseInt(p.trim(), 10);
            if (Number.isInteger(n) && n > 0 && n < 65536) { set.add(n); }
        });
    });
    return { tool: 'ufw', active: true, allowedTcp, allowedUdp, raw: out };
}

/**
 * Ensure the given TCP ports are allowed inbound. Only acts when UFW
 * is active. No-op otherwise.
 *
 * Requires root: `ufw allow` writes to /etc/ufw and reloads the kernel
 * netfilter chain — both kernel + write operations need CAP_NET_ADMIN.
 * pc2-node runs as root by design, so this isn't normally a concern.
 * If the host runs pc2-node non-root the spawn fails with exit 1 /
 * "ERROR: You need to be root", and the call returns with errors[]
 * populated rather than silently no-opping.
 *
 * @param {number[]} ports     TCP ports to ensure are allowed
 * @param {object} [opts]
 * @param {string} [opts.comment]  comment to attach to added rules
 * @param {object} [opts.logger]   logger with info/warn/error methods
 * @returns {Promise<{
 *   tool: 'ufw'|null,
 *   active: boolean,
 *   alreadyAllowed: number[],
 *   added: number[],
 *   errors: Array<{port: number, message: string}>,
 *   skipped: boolean,                // true when no-op (no UFW / inactive)
 *   reason?: string,
 * }>}
 */
/** Normalize a ports input to a deduped list of valid port numbers. */
function _normalizePorts(ports) {
    const seen = new Set();
    (Array.isArray(ports) ? ports : [])
        .map((p) => parseInt(p, 10))
        .filter((p) => Number.isInteger(p) && p > 0 && p < 65536)
        .forEach((p) => seen.add(p));
    return Array.from(seen);
}

/**
 * Ensure the given ports of ONE protocol are allowed inbound. Adds a
 * `ufw allow <port>/<proto>` rule for each missing port. Returns the per-proto
 * add/already/error breakdown. Internal helper for ensureAllowed.
 */
async function _ensureProto(allowedSet, ports, proto, comment, logger) {
    const alreadyAllowed = ports.filter((p) => allowedSet.has(p));
    const missing = ports.filter((p) => !allowedSet.has(p));
    const added = [];
    const errors = [];
    for (const port of missing) {
        // argv via spawn — the shell is never involved, so no quoting hazard.
        const args = ['allow', `${port}/${proto}`, 'comment', `${comment} (port ${port}/${proto})`];
        const r = await execCapture('ufw', args, 8_000);
        if (r.code === 0) {
            added.push(port);
            logger.info(`${ENM_LOG_PREFIX} ufw allow ${port}/${proto} added (${comment})`);
        } else {
            errors.push({
                port, proto,
                message: (r.stderr || r.stdout || `exit ${r.code}`).trim().split('\n')[0],
            });
            logger.warn(
                `${ENM_LOG_PREFIX} ufw allow ${port}/${proto} failed: `
                + ((r.stderr || r.stdout || `exit ${r.code}`).trim()),
            );
        }
    }
    return { alreadyAllowed, added, errors };
}

async function ensureAllowed(ports, opts) {
    const logger = (opts && opts.logger) || { info() {}, warn() {}, error() {} };
    const comment = (opts && opts.comment) || 'ENM auto';
    const tcpPorts = _normalizePorts(ports);
    // P0-15 — opts.udpPorts ALSO get a /udp allow rule. EVM sidechains pass their
    // p2p port here because geth's discv4 discovery is UDP on the same --port.
    const udpPorts = _normalizePorts(opts && opts.udpPorts);

    const state = await detect();
    if (!state.tool) {
        return {
            tool: null, active: false,
            alreadyAllowed: [], added: [], alreadyAllowedUdp: [], addedUdp: [], errors: [],
            skipped: true, reason: 'ufw not installed / not detectable',
        };
    }
    if (!state.active) {
        return {
            tool: 'ufw', active: false,
            alreadyAllowed: [], added: [], alreadyAllowedUdp: [], addedUdp: [], errors: [],
            skipped: true, reason: 'ufw installed but inactive',
        };
    }

    const tcp = await _ensureProto(state.allowedTcp, tcpPorts, 'tcp', comment, logger);
    const udp = await _ensureProto(state.allowedUdp, udpPorts, 'udp', comment, logger);

    return {
        tool: 'ufw', active: true,
        alreadyAllowed: tcp.alreadyAllowed, added: tcp.added,
        alreadyAllowedUdp: udp.alreadyAllowed, addedUdp: udp.added,
        errors: tcp.errors.concat(udp.errors),
        skipped: false,
    };
}

/**
 * Remove the `allow <port>/tcp` rule if present. Only acts when UFW is
 * active. No-op when the rule doesn't exist (so callers can flip a
 * toggle off-then-off safely) or when UFW isn't managed.
 *
 * Used by the Settings → Access RPC toggle (beta.3.31): turning the
 * external-RPC switch off closes the UFW hole that turning it on opened.
 * Without this, an operator who enables RPC, exposes 20336, then changes
 * their mind would still have the firewall hole sitting open even
 * though ela has been told to re-bind WhiteIPList=['127.0.0.1'].
 *
 * Note on UFW's `delete` semantics: `ufw delete allow 20336/tcp`
 * deletes the IPv4 + IPv6 lines that match the rule spec. If the
 * operator added the rule manually via a different spec (e.g.
 * `from 1.2.3.4 to any port 20336`), THAT rule survives — we only
 * remove the simple allow-all-source form. That's the safer
 * default: we won't surprise an operator by deleting an ACL they
 * built by hand.
 *
 * Requires root, same as ensureAllowed.
 *
 * @param {number} port
 * @param {object} [opts]
 * @param {object} [opts.logger]
 * @returns {Promise<{
 *   tool: 'ufw'|null,
 *   active: boolean,
 *   removed: boolean,
 *   skipped: boolean,
 *   reason?: string,
 *   error?: string,
 * }>}
 */
async function removeRule(port, opts) {
    const logger = (opts && opts.logger) || { info() {}, warn() {}, error() {} };
    const p = parseInt(port, 10);
    if (!Number.isInteger(p) || p <= 0 || p >= 65536) {
        return {
            tool: null, active: false, removed: false,
            skipped: true, reason: 'invalid port',
        };
    }
    const state = await detect();
    if (!state.tool) {
        return {
            tool: null, active: false, removed: false,
            skipped: true, reason: 'ufw not installed / not detectable',
        };
    }
    if (!state.active) {
        return {
            tool: 'ufw', active: false, removed: false,
            skipped: true, reason: 'ufw installed but inactive',
        };
    }
    if (!state.allowedTcp.has(p)) {
        // Rule wasn't there. Treat as success — the desired end state
        // (no allow rule) is satisfied.
        return {
            tool: 'ufw', active: true, removed: false,
            skipped: false, reason: 'rule already absent',
        };
    }
    const r = await execCapture('ufw', ['delete', 'allow', `${p}/tcp`], 8_000);
    if (r.code === 0) {
        logger.info(`${ENM_LOG_PREFIX} ufw delete allow ${p}/tcp ok`);
        return { tool: 'ufw', active: true, removed: true, skipped: false };
    }
    const msg = (r.stderr || r.stdout || `exit ${r.code}`).trim().split('\n')[0];
    logger.warn(`${ENM_LOG_PREFIX} ufw delete allow ${p}/tcp failed: ${msg}`);
    return {
        tool: 'ufw', active: true, removed: false,
        skipped: false, error: msg,
    };
}

/**
 * Reconcile per-SOURCE-IP allow rules for one TCP port to exactly `ipList`.
 * Adds `ufw allow from <ip> to any port <port> proto tcp` for each desired IP
 * not already present, and deletes any per-source rule on that port that's no
 * longer desired (so removing an IP from the whitelist closes its hole, and an
 * empty list tears the port's per-source rules down entirely). Loopback IPs are
 * never firewalled (dropped from the desired set). Only acts when UFW is
 * active; no-ops otherwise (the caller's in-process gate is the primary
 * control, so this is defense-in-depth).
 *
 * This is for ENM-DEDICATED ports (e.g. the monitor status port): it deletes
 * non-desired per-source rules on the port, which is safe precisely because no
 * one hand-builds rules for an ENM-owned port. (Contrast removeRule, which only
 * touches the allow-all-source form so it won't clobber operator ACLs.)
 *
 * @param {number} port
 * @param {string[]} ipList  desired source IPs/CIDRs (127.0.0.1 ignored)
 * @param {object} [opts] { comment, logger }
 * @returns {Promise<{tool:'ufw'|null, active:boolean, added:string[], removed:string[], errors:Array, skipped:boolean, reason?:string}>}
 */
async function reconcileSourceRules(port, ipList, opts) {
    const logger = (opts && opts.logger) || { info() {}, warn() {}, error() {} };
    const comment = (opts && opts.comment) || 'ENM policy';
    const p = parseInt(port, 10);
    if (!Number.isInteger(p) || p <= 0 || p >= 65536) {
        return { tool: null, active: false, added: [], removed: [], errors: [], skipped: true, reason: 'invalid port' };
    }
    const desired = Array.isArray(ipList)
        ? Array.from(new Set(ipList.map((s) => String(s).trim())
            .filter((ip) => ip && ip !== '127.0.0.1' && ip !== '::1')))
        : [];
    const state = await detect();
    if (!state.tool) {
        return { tool: null, active: false, added: [], removed: [], errors: [], skipped: true, reason: 'ufw not installed / not detectable' };
    }
    if (!state.active) {
        return { tool: 'ufw', active: false, added: [], removed: [], errors: [], skipped: true, reason: 'ufw installed but inactive' };
    }
    // Parse current per-source rules for this port: "<p>/tcp [(v6)] ALLOW IN <src>"
    const probe = await execCapture('ufw', ['status'], DEFAULT_TIMEOUT_MS);
    const current = new Set();
    const srcRe = new RegExp('^' + p + '/tcp(?:\\s*\\(v6\\))?\\s+ALLOW IN\\s+(\\S+)', 'i');
    (probe.stdout || '').split(/\r?\n/).forEach((line) => {
        const m = srcRe.exec(line.trim());
        if (!m) { return; }
        const src = m[1];
        if (src && src.toLowerCase() !== 'anywhere') { current.add(src); }
    });
    const added = [];
    const removed = [];
    const errors = [];
    for (const ip of desired) {
        if (current.has(ip)) { continue; }
        const r = await execCapture('ufw',
            ['allow', 'from', ip, 'to', 'any', 'port', String(p), 'proto', 'tcp', 'comment', `${comment} (port ${p})`],
            DEFAULT_TIMEOUT_MS);
        if (r.code === 0) {
            added.push(ip);
            logger.info(`${ENM_LOG_PREFIX} ufw allow from ${ip} to any port ${p}/tcp added (${comment})`);
        } else {
            const msg = (r.stderr || r.stdout || `exit ${r.code}`).trim().split('\n')[0];
            errors.push({ ip, message: msg });
            logger.warn(`${ENM_LOG_PREFIX} ufw allow from ${ip} port ${p}/tcp failed: ${msg}`);
        }
    }
    for (const src of current) {
        if (desired.includes(src)) { continue; }
        const r = await execCapture('ufw',
            ['delete', 'allow', 'from', src, 'to', 'any', 'port', String(p), 'proto', 'tcp'],
            DEFAULT_TIMEOUT_MS);
        if (r.code === 0) {
            removed.push(src);
            logger.info(`${ENM_LOG_PREFIX} ufw delete allow from ${src} port ${p}/tcp ok`);
        } else {
            const msg = (r.stderr || r.stdout || `exit ${r.code}`).trim().split('\n')[0];
            errors.push({ ip: src, message: msg });
            logger.warn(`${ENM_LOG_PREFIX} ufw delete allow from ${src} port ${p}/tcp failed: ${msg}`);
        }
    }
    return { tool: 'ufw', active: true, added, removed, errors, skipped: false };
}

module.exports = {
    detect,
    ensureAllowed,
    removeRule,
    reconcileSourceRules,
    DEFAULT_TIMEOUT_MS,
    // exported for tests
    _execCapture: execCapture,
};
