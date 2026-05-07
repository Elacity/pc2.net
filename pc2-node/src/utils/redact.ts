/**
 * Shared redaction utilities for diagnostic + support report flows.
 *
 * All functions here are best-effort — they catch the common leak shapes
 * (wallets, DIDs, bearer tokens, mnemonics, PEM blocks, home-dir paths)
 * but the operator must still eyeball the output before sharing publicly.
 * Defence in depth, not a security boundary.
 *
 * Originally extracted from `pc2-node/src/api/diagnose.ts` so both
 * `diagnose.ts` (T-1A) and `support.ts` (T-1B) can reuse the same
 * patterns without drift. Keep these in sync with the redaction policy
 * documented in `.cursor/tasks/T-1-TELEMETRY-AND-SUPPORT-V1280/`.
 */

import { createHash } from 'crypto';
import os from 'os';

/**
 * Best-effort secret redaction. Mirrors the sed pipeline in
 * `scripts/pc2-diagnose.sh` and the original inline redactor in
 * `diagnose.ts`. Catches:
 *
 *   - Ethereum wallets (0x + 40 hex chars)
 *   - DIDs (`did:elastos:...`, `did:web:...`, etc.)
 *   - Bearer / authorization tokens
 *   - Query-string + body secrets (`?token=…`, `api_key=…`, `secret="…"`)
 *   - PEM blocks (`-----BEGIN ... -----END`)
 *   - 24-word lowercase mnemonics on a single line (loose match — better
 *     to over-redact than miss a recovery phrase)
 */
export function sanitise (text: string): string {
    if (!text) return text;
    return text
        .replace(/0x[a-fA-F0-9]{40}/g, '0xREDACTED_WALLET')
        .replace(/did:[a-z]+:[A-Za-z0-9_.-]{8,}/g, 'did:REDACTED')
        .replace(/(Bearer|bearer)\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer REDACTED')
        .replace(/\b(token|api_key|apikey|secret|password|signature)=[A-Za-z0-9._~+/=-]+/gi, '$1=REDACTED')
        .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, 'REDACTED-PEM-BLOCK')
        .replace(/(?:\b[a-z]{3,8}\b ){23}\b[a-z]{3,8}\b/g, 'REDACTED-MNEMONIC');
}

/**
 * Wallet hash for support reports. We need to identify which wallet a
 * report came from (ticket lookup, dedup, abuse mitigation) but we don't
 * want to log raw addresses in the triage repo. SHA-256 truncated to the
 * first 16 hex chars is enough for practical uniqueness across the fleet
 * (~10^19 keyspace) without being a raw wallet leak.
 *
 * Returns `'0xWALLET_<hash16>'` so it's still recognisable in logs as a
 * wallet placeholder rather than just an opaque hex string.
 */
export function hashWallet (address: string): string {
    if (!address || typeof address !== 'string') return '0xWALLET_REDACTED';
    const normalised = address.toLowerCase().trim();
    const hash = createHash('sha256').update(normalised).digest('hex').slice(0, 16);
    return `0xWALLET_${hash}`;
}

/**
 * Mask an IP address to /24 (IPv4) or /48 (IPv6). Drops the last octet
 * for v4, last 80 bits for v6. Net effect: triage can see "this many
 * unique networks" but cannot pin a report to a specific home or device.
 *
 * Returns the input unchanged if it doesn't parse as an IP — defensive
 * against unexpected input shapes (e.g. hostnames, IPv4-mapped-IPv6).
 */
export function maskIp (ip: string): string {
    if (!ip || typeof ip !== 'string') return ip;
    const trimmed = ip.trim();
    // IPv4: a.b.c.d → a.b.c.0/24
    const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
    if (v4) {
        return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
    }
    // IPv6: very loose — keep the first 3 groups, drop the rest.
    if (trimmed.includes(':')) {
        const groups = trimmed.split(':');
        if (groups.length >= 3) {
            return `${groups.slice(0, 3).join(':')}::/48`;
        }
    }
    return trimmed;
}

/**
 * Replace the operator's home directory with `~` in arbitrary path
 * strings, and strip any leading absolute prefix that contains the
 * username. Useful for log lines and paths that would otherwise leak
 * "I'm `mtk` running PC2 on macOS" inadvertently.
 *
 * Cached `os.homedir()` because the result is process-scoped and
 * stable; no need to syscall on every invocation.
 */
const HOME_DIR = os.homedir();
const HOME_DIR_RE = HOME_DIR ? new RegExp(HOME_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : null;

export function redactHomePath (text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (!HOME_DIR_RE) return text;
    return text.replace(HOME_DIR_RE, '~');
}

/**
 * Hash a content key (KID, asset CID, channel slug) to a short stable
 * fingerprint for telemetry / triage. Uses SHA-256 truncated to 8 hex
 * chars (~4.3 billion keyspace — enough for "did this user hit asset X"
 * dedup without being able to look up the original content).
 */
export function hashContentKey (key: string): string {
    if (!key || typeof key !== 'string') return 'KEY_REDACTED';
    return createHash('sha256').update(key).digest('hex').slice(0, 8);
}
