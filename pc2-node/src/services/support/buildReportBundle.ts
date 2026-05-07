/**
 * buildReportBundle — pure function that turns a diagnostic snapshot,
 * free-text user message, and a set of curation toggles into the
 * redacted bundle that will (eventually, T-1B Phase 2) be POST'd to the
 * supernode triage endpoint.
 *
 * Phase 1 scope (this file): the bundle is rendered locally and shown
 * to the user in a preview screen. The user can copy it as JSON or
 * download it as a file. There is NO supernode write surface yet — that
 * lands in Phase 2 with SIWE auth + per-wallet rate limiting + the
 * supernode-side `/api/support/report` ingest endpoint.
 *
 * Curation policy (defaults — UI exposes per-field toggles):
 *
 *   ALWAYS INCLUDED
 *   ─────────────────────────────────────────────────────────
 *   • App version, OS platform/arch, Node.js version          — non-identifying
 *   • Recent log lines (last 80, sanitised + home-dir-stripped)
 *   • Diagnostic test results (the `liveProbes.*` tree from T-1A)
 *   • Free-text user message (capped at 2000 chars)
 *   • Wallet HASH (SHA-256 first 16 hex chars) — never raw
 *
 *   USER-TOGGLABLE (default: included)
 *   ─────────────────────────────────────────────────────────
 *   • Hostname (last 8 chars only — partial fingerprint)
 *   • Local IP (masked to /24)
 *   • Service health (db, filesystem, transports)
 *   • Cluster reachability matrix
 *
 *   NEVER INCLUDED
 *   ─────────────────────────────────────────────────────────
 *   • Raw wallet address
 *   • Mnemonic / private keys / PEM blocks (caught by sanitise() anyway)
 *   • Real home-dir paths (always replaced with `~`)
 *   • Channel display names / creator-set strings (omit)
 *   • Full IP addresses (always masked or omitted)
 *
 * The bundle shape is stable from this Phase 1 onward — Phase 2's
 * supernode endpoint will accept exactly the same JSON shape, so the
 * "Copy as JSON" output a user produces today is the same blob a
 * future "Send Report" button will POST.
 */

import { randomUUID } from 'crypto';
import { hashWallet, maskIp, redactHomePath, sanitise } from '../../utils/redact.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReportBundleOptions {
    /** Default true. Pulls hostname (truncated) and local IP (masked). */
    includeHost?: boolean;
    /** Default true. Pulls service health rows from the snapshot. */
    includeServices?: boolean;
    /** Default true. Pulls cluster reachability + replication settings. */
    includeCluster?: boolean;
    /** Default true. Pulls last 80 sanitised log lines. */
    includeLogs?: boolean;
    /** Default true. Pulls live diagnostic probes (Lit / supernodes / wasm / update channel). */
    includeLiveProbes?: boolean;
}

export interface ReportBundle {
    /** Random UUID stamped at build time. Phase 2 will return this from supernode after persist. */
    ticketId: string;
    /** ISO timestamp at bundle creation. */
    createdAt: string;
    /** Schema version — bump on any breaking change to the bundle shape. */
    schemaVersion: 1;
    /** App / runtime context. Non-identifying. */
    app: {
        version: string;
        nodeVersion: string;
        platform: string;
        arch: string;
        cpuCount: number;
    };
    /** Anonymous-but-stable identifier hashed from the operator wallet. Never raw. */
    wallet: {
        hash: string;
    };
    /** User-supplied free-text. Capped at 2000 chars before bundle creation. */
    message: string;
    /** Optional sections per options flags. Each can be `null` if the user opted it out. */
    optional: {
        host: { hostnameTail: string; localIp: string | null } | null;
        services: Record<string, unknown> | null;
        cluster: Record<string, unknown> | null;
        liveProbes: Record<string, unknown> | null;
        recentLogs: string[] | null;
    };
}

export interface BuildReportInput {
    /** Result of `GET /api/diagnose` — the snapshot the user just ran. */
    snapshot: any;
    /** User's free-text problem description. Will be sanitised + truncated. */
    freeText: string;
    /** Operator wallet address, in any case. Hashed before inclusion. */
    walletAddress: string;
    /** Override the curation defaults. */
    options?: ReportBundleOptions;
}

// ── Constants ────────────────────────────────────────────────────────────────

const FREETEXT_MAX_CHARS = 2000;
const HOSTNAME_TAIL_LEN = 8;

const DEFAULT_OPTIONS: Required<ReportBundleOptions> = {
    includeHost: true,
    includeServices: true,
    includeCluster: true,
    includeLogs: true,
    includeLiveProbes: true,
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Truncate hostname to its last N characters so triage can spot
 * "this user's hostname keeps changing" patterns without learning the
 * full hostname (which often encodes user / org / location).
 */
function truncateHostname (hostname: string | null | undefined): string {
    if (!hostname || typeof hostname !== 'string') return '???';
    const tail = hostname.slice(-HOSTNAME_TAIL_LEN);
    // Keep the leading marker so it's clear this is partial.
    return hostname.length > HOSTNAME_TAIL_LEN ? `…${tail}` : tail;
}

/**
 * Pull a best-effort local IP from the snapshot's services / boson
 * connectivity sub-tree. Returns null if unable to determine — the
 * connectivity tree shape varies depending on which transports are
 * configured, so we defensively probe a few common keys before giving up.
 */
function pickLocalIp (snapshot: any): string | null {
    const candidates: Array<string | undefined> = [
        snapshot?.services?.connectivity?.localIp,
        snapshot?.services?.connectivity?.publicIp,
        snapshot?.services?.wireguard?.address,
        snapshot?.services?.amneziaWG?.address,
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.length > 0) return maskIp(c);
    }
    return null;
}

/**
 * Sanitise the free-text user message. Applies the same redactor used
 * everywhere else in the diagnostic surface, then truncates to the
 * cap. Newlines are preserved so triage can see paragraph breaks.
 */
function curateMessage (raw: string): string {
    const text = typeof raw === 'string' ? raw : '';
    const sanitised = sanitise(redactHomePath(text));
    if (sanitised.length <= FREETEXT_MAX_CHARS) return sanitised;
    return sanitised.slice(0, FREETEXT_MAX_CHARS) + '\n[truncated]';
}

/**
 * Re-walk the snapshot's `recentLogs` array applying the home-dir
 * redactor on top of the existing `sanitise()` pass. Belt-and-braces:
 * `diagnose.ts` already runs sanitise on every line, but we run it
 * AGAIN here in case the bundle is being built from a snapshot from a
 * future (unsanitised) source — keeps the redaction policy enforced
 * at the bundle boundary, not just at the snapshot boundary.
 */
function curateLogs (logs: unknown): string[] {
    if (!Array.isArray(logs)) return [];
    return logs
        .filter((line): line is string => typeof line === 'string')
        .map((line) => sanitise(redactHomePath(line)));
}

/**
 * Lift the snapshot's services sub-tree, dropping anything that names
 * the operator (e.g. boson initialised flag is fine; raw wireguard peer
 * IP is not — strip via maskIp).
 */
function curateServices (snapshot: any): Record<string, unknown> | null {
    const svc = snapshot?.services;
    if (!svc || typeof svc !== 'object') return null;
    const out: Record<string, unknown> = {
        database: svc.database ?? null,
        filesystem: svc.filesystem ?? null,
        bosonInitialised: svc.bosonInitialised ?? null,
        wireguard: svc.wireguard ? { installed: !!svc.wireguard.installed, binary: !!svc.wireguard.binary } : null,
        amneziaWG: svc.amneziaWG ? { installed: !!svc.amneziaWG.installed } : null,
        vlessReality: svc.vlessReality ? { installed: !!svc.vlessReality.installed } : null,
    };
    return out;
}

/**
 * Lift the snapshot's cluster sub-tree, keeping the URL + reachability
 * (which is already public infrastructure) but stripping the lastProbe
 * timestamp + per-CID details that could correlate with specific user
 * activity.
 */
function curateCluster (snapshot: any): Record<string, unknown> | null {
    const c = snapshot?.cluster;
    if (!c || typeof c !== 'object') return null;
    return {
        configured: !!c.configured,
        url: c.url ?? null,
        replicationMin: c.replicationMin ?? null,
        replicationMax: c.replicationMax ?? null,
        reachability: c.reachability
            ? {
                reachable: !!c.reachability.reachable,
                httpStatus: c.reachability.httpStatus ?? null,
                latencyMs: c.reachability.latencyMs ?? null,
            }
            : null,
    };
}

/**
 * Lift the T-1A `liveProbes` sub-tree. These are already designed to be
 * shareable (they don't contain user-identifying state) but we still
 * pass through `sanitise()` on any error strings as a defensive measure.
 */
function curateLiveProbes (snapshot: any): Record<string, unknown> | null {
    const probes = snapshot?.liveProbes;
    if (!probes || typeof probes !== 'object') return null;
    const sanitiseErr = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        const copy: Record<string, unknown> = { ...obj };
        if (typeof copy.error === 'string') copy.error = sanitise(copy.error);
        return copy;
    };
    return {
        litConfig: sanitiseErr(probes.litConfig),
        supernodes: Array.isArray(probes.supernodes) ? probes.supernodes.map(sanitiseErr) : null,
        wasm: Array.isArray(probes.wasm) ? probes.wasm.map(sanitiseErr) : null,
        updateChannel: sanitiseErr(probes.updateChannel),
    };
}

/**
 * Build the curated support-report bundle.
 *
 * Pure function — no I/O, no clock side-effects beyond Date.now/UUID.
 * Safe to call from any route handler or test harness. Throws only on
 * fundamentally malformed input (missing wallet address); any other
 * partial-snapshot defects degrade gracefully with `null` sections.
 */
export function buildReportBundle (input: BuildReportInput): ReportBundle {
    if (!input || typeof input !== 'object') {
        throw new Error('buildReportBundle: missing input');
    }
    if (!input.walletAddress || typeof input.walletAddress !== 'string') {
        throw new Error('buildReportBundle: walletAddress is required');
    }

    const options: Required<ReportBundleOptions> = {
        ...DEFAULT_OPTIONS,
        ...(input.options ?? {}),
    };

    const snapshot = input.snapshot ?? {};
    const pc2 = snapshot.pc2 ?? {};
    const host = snapshot.host ?? {};

    return {
        ticketId: randomUUID(),
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        app: {
            version: typeof pc2.version === 'string' ? pc2.version : 'unknown',
            nodeVersion: typeof pc2.nodeVersion === 'string' ? pc2.nodeVersion : 'unknown',
            platform: typeof host.platform === 'string' ? host.platform : 'unknown',
            arch: typeof host.arch === 'string' ? host.arch : 'unknown',
            cpuCount: typeof host.cpuCount === 'number' ? host.cpuCount : 0,
        },
        wallet: {
            hash: hashWallet(input.walletAddress),
        },
        message: curateMessage(input.freeText ?? ''),
        optional: {
            host: options.includeHost
                ? {
                    hostnameTail: truncateHostname((snapshot as any)?.host?.hostname),
                    localIp: pickLocalIp(snapshot),
                }
                : null,
            services: options.includeServices ? curateServices(snapshot) : null,
            cluster: options.includeCluster ? curateCluster(snapshot) : null,
            liveProbes: options.includeLiveProbes ? curateLiveProbes(snapshot) : null,
            recentLogs: options.includeLogs ? curateLogs(snapshot.recentLogs) : null,
        },
    };
}
