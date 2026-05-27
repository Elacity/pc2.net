/**
 * Metric registry — T-1C Phase 1 (local plumbing only)
 *
 * Two primitives:
 *   - Counter   → monotonic per (name, tags); UPSERT-by-(name, tags) into
 *                 `metrics_counters`. Used for "how many times did X
 *                 happen". Cheap; single UPSERT per call.
 *   - Histogram → append a raw sample per observation into
 *                 `metrics_histogram_samples`. Used for "how long does X
 *                 take". The future daily flusher (T-1C Phase 4) rolls
 *                 these up into p50/p95/p99 + count + sum, posts the
 *                 rolled summary to a supernode (T-1C Phase 5/6), and
 *                 prunes raw samples older than 7 days.
 *
 * Phase 1 deliberately omits: any wire egress, opt-in flow, first-run
 * dialog, Rust instrumentation. Counters/histograms accumulate locally
 * forever (until prune) and are visible only to the operator via the
 * "Aggregate Telemetry" card in the Health & Support test-app.
 *
 * Privacy posture (anonymous-by-design):
 *   - Tags MUST NOT contain wallets, IPs, KIDs, asset titles, channel
 *     names, file paths, or anything else PII-shaped. Allowed tag values
 *     are short, low-cardinality, structural strings: `outcome=success`,
 *     `kind=media`, `tier=1`, `reason=key_invalid`, `crate=cenc-decrypt`,
 *     `status_class=5xx`, etc. Each recorder enforces this convention by
 *     construction.
 *   - Counter/histogram NAMES are namespace-prefixed (`chipotle.*`,
 *     `cluster_pin.*`, `wasm.*`) so the wire schema stays predictable
 *     when Phase 4-6 land.
 *
 * Operational posture (zero risk to live flows):
 *   - Every recorder is wrapped in a try/catch. Failures log a single
 *     `warn` and silently continue. A telemetry write MUST NEVER fail a
 *     user flow.
 *   - `PC2_TELEMETRY_DISABLED=true` env var short-circuits every recorder
 *     (no DB write, no log). Mirrors the kill switch in `telemetry.ts`.
 *   - Tag set is hard-capped at 8 keys. Tag values are coerced to string
 *     and length-clamped at 64 chars (defence-in-depth against an
 *     instrumentation bug shoving a CID or path in by mistake).
 */

import type { DatabaseManager } from '../storage/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('metrics');

const KILL_SWITCH_ENV = 'PC2_TELEMETRY_DISABLED';

// Defence-in-depth bounds. Real instrumentation never approaches these
// limits; they exist to truncate accidental misuse before it lands in the
// DB. Values picked to comfortably accommodate real call sites
// (most tag sets have 1-3 keys; values are short structural strings).
const MAX_TAGS = 8;
const MAX_TAG_VALUE_LEN = 64;
const MAX_NAME_LEN = 80;

// Names must be namespace.identifier with lowercase + dot/underscore.
// Rejecting anything else early prevents typos like accidental colons or
// uppercase from creating sibling counters that look the same in logs but
// hash to different rows.
const NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export type Tags = Record<string, string | number | boolean>;

// Process-wide DB handle. Set once at startup by `setMetricsDb()` so domain
// helpers (e.g. chipotle-client functions, dashPackager) can record metrics
// without threading a DatabaseManager through every signature. Recorders
// that explicitly pass `db` still take precedence over this singleton —
// useful for tests where a mock DB is preferred.
let registryDb: DatabaseManager | null = null;

/**
 * Wire the process-wide metric DB handle. Called once from `index.ts`
 * during boot, after the database is open. Safe to call repeatedly
 * (overwrites the previous value); useful for tests.
 */
export function setMetricsDb (db: DatabaseManager): void {
    registryDb = db;
}

/**
 * True when telemetry is currently disabled by the operator. Other
 * modules can use this to short-circuit before doing any prep work for a
 * recording (e.g. don't `Date.now()` if you're going to throw the value
 * away anyway).
 */
export function isTelemetryDisabled (): boolean {
    return process.env[KILL_SWITCH_ENV] === 'true';
}

/**
 * Canonicalise a tag bag into a sorted-key JSON string. Identical tag
 * sets always produce identical strings so the (name, tags) primary key
 * dedupes correctly. Coerces non-string values, drops keys with empty
 * values, and enforces the cap on count + length.
 */
function canonicaliseTags (tags?: Tags): string {
    if (!tags) return '{}';
    const keys = Object.keys(tags).sort();
    if (keys.length === 0) return '{}';
    const out: Record<string, string> = {};
    let kept = 0;
    for (const k of keys) {
        if (kept >= MAX_TAGS) break;
        const raw = tags[k];
        if (raw === undefined || raw === null) continue;
        let val = String(raw);
        if (val.length === 0) continue;
        if (val.length > MAX_TAG_VALUE_LEN) val = val.slice(0, MAX_TAG_VALUE_LEN);
        out[k] = val;
        kept += 1;
    }
    return JSON.stringify(out);
}

/**
 * Validate a metric name. Returns null on success, an error string on
 * failure. Caller logs + drops the metric.
 */
function validateName (name: string): string | null {
    if (typeof name !== 'string') return 'name_not_string';
    if (name.length === 0 || name.length > MAX_NAME_LEN) return 'name_length_out_of_range';
    if (!NAME_PATTERN.test(name)) return 'name_pattern_mismatch';
    return null;
}

/**
 * Resolve the underlying better-sqlite3 instance from the manager. The
 * existing telemetry module uses the same one-liner — copied here to
 * keep this module self-contained and avoid forcing every consumer to
 * pass the underlying handle.
 */
function getSqlite (db: DatabaseManager): any {
    return (db as any).db ?? (db as any);
}

/**
 * Increment a counter. Defaults to +1. Idempotent on (name, tags) — the
 * UPSERT pattern means concurrent increments from different code paths
 * coalesce correctly without explicit transactions.
 *
 * Fail-soft: never throws; logs and returns on any error.
 */
export function recordMetricCounter (
    db: DatabaseManager | undefined,
    name: string,
    value: number = 1,
    tags?: Tags,
): void {
    try {
        const useDb = db ?? registryDb;
        if (!useDb) return;
        if (isTelemetryDisabled()) return;
        if (!Number.isFinite(value)) return;
        const nameErr = validateName(name);
        if (nameErr) {
            log.warn(`drop_counter name=${name} reason=${nameErr}`);
            return;
        }
        const tagsJson = canonicaliseTags(tags);
        const sqlite = getSqlite(useDb);
        const now = Date.now();
        // ON CONFLICT (name, tags) DO UPDATE — UPSERT pattern (better-sqlite3
        // supports SQLite ≥ 3.24, which we ship on every platform).
        sqlite.prepare(`
            INSERT INTO metrics_counters (name, tags, value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (name, tags)
            DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at
        `).run(name, tagsJson, Math.trunc(value), now);
    } catch (err: any) {
        log.warn(`record_counter_failed name=${name}: ${err?.message || 'unknown'}`);
    }
}

/**
 * Append one observation to a histogram. Value is whatever the caller
 * measures — milliseconds for latency, bytes for sizes, etc. The future
 * daily flusher rolls these up into p50/p95/p99/count/sum and prunes
 * the raw samples after 7 days.
 *
 * Fail-soft: never throws; logs and returns on any error.
 */
export function recordMetricHistogram (
    db: DatabaseManager | undefined,
    name: string,
    value: number,
    tags?: Tags,
): void {
    try {
        const useDb = db ?? registryDb;
        if (!useDb) return;
        if (isTelemetryDisabled()) return;
        if (!Number.isFinite(value)) return;
        if (value < 0) return;
        const nameErr = validateName(name);
        if (nameErr) {
            log.warn(`drop_histogram name=${name} reason=${nameErr}`);
            return;
        }
        const tagsJson = canonicaliseTags(tags);
        const sqlite = getSqlite(useDb);
        sqlite.prepare(`
            INSERT INTO metrics_histogram_samples (name, tags, value, ts)
            VALUES (?, ?, ?, ?)
        `).run(name, tagsJson, value, Date.now());
    } catch (err: any) {
        log.warn(`record_histogram_failed name=${name}: ${err?.message || 'unknown'}`);
    }
}

/**
 * Sugar for the common case of timing an async operation. Returns the
 * promise's resolved value untouched; observes elapsed ms regardless of
 * outcome (success vs throw). Caller controls whether to also bump a
 * counter for outcome bookkeeping. Designed to be a one-line wrap:
 *
 *   const cek = await observeMs(db, 'chipotle.cek_recovery_ms', { kind: 'media' },
 *                               () => recoverCEKEnvelope(...));
 */
export async function observeMs<T> (
    db: DatabaseManager | undefined,
    name: string,
    tags: Tags | undefined,
    fn: () => Promise<T>,
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        recordMetricHistogram(db, name, Date.now() - start, tags);
        return result;
    } catch (err) {
        recordMetricHistogram(db, name, Date.now() - start, { ...(tags || {}), outcome: 'error' });
        throw err;
    }
}

// ── Read APIs (UI / future flusher) ──────────────────────────────────────────

export interface CounterRow {
    name: string;
    tags: Record<string, string>;
    value: number;
    updatedAt: number;
}

export interface HistogramSummary {
    name: string;
    tags: Record<string, string>;
    count: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    sum: number;
    /** Window covered by these samples (ms since epoch). */
    firstTs: number;
    lastTs: number;
}

/**
 * Snapshot of all counters. Returns rows already shaped for JSON
 * serialisation (tags rehydrated from canonicalised JSON string).
 */
export function listCounters (db: DatabaseManager): CounterRow[] {
    try {
        const sqlite = getSqlite(db);
        const rows = sqlite.prepare(`
            SELECT name, tags, value, updated_at FROM metrics_counters ORDER BY name, tags
        `).all() as Array<{ name: string; tags: string; value: number; updated_at: number }>;
        return rows.map((r) => ({
            name: r.name,
            tags: safeParseTags(r.tags),
            value: r.value,
            updatedAt: r.updated_at,
        }));
    } catch (err: any) {
        log.warn(`list_counters_failed: ${err?.message || 'unknown'}`);
        return [];
    }
}

/**
 * Roll up histograms grouped by (name, tags). Computes percentiles in
 * JS — fine at Phase 1 sample volumes (single-digit thousands per node);
 * Phase 4's flusher will move this to a SQL window function once the
 * sample table starts hitting six figures.
 *
 * Optional `windowMs`: only consider samples newer than now − windowMs.
 * Pass `undefined` (default) for "all time".
 */
export function summariseHistograms (
    db: DatabaseManager,
    windowMs?: number,
): HistogramSummary[] {
    try {
        const sqlite = getSqlite(db);
        const cutoff = windowMs && windowMs > 0 ? Date.now() - windowMs : null;
        const rows = (cutoff
            ? sqlite.prepare(`SELECT name, tags, value, ts FROM metrics_histogram_samples WHERE ts >= ? ORDER BY name, tags, value`).all(cutoff)
            : sqlite.prepare(`SELECT name, tags, value, ts FROM metrics_histogram_samples ORDER BY name, tags, value`).all()
        ) as Array<{ name: string; tags: string; value: number; ts: number }>;

        if (rows.length === 0) return [];

        // Group by (name, tags). Rows already sorted by name+tags+value so
        // each bucket's samples are contiguous and value-sorted, which lets
        // us do percentile picks in O(1).
        const buckets = new Map<string, { name: string; tags: string; values: number[]; tsList: number[] }>();
        for (const r of rows) {
            const key = `${r.name}\u0000${r.tags}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { name: r.name, tags: r.tags, values: [], tsList: [] };
                buckets.set(key, bucket);
            }
            bucket.values.push(r.value);
            bucket.tsList.push(r.ts);
        }

        const out: HistogramSummary[] = [];
        for (const b of buckets.values()) {
            const n = b.values.length;
            const pick = (p: number) => b.values[Math.min(n - 1, Math.floor(n * p))];
            let sum = 0;
            for (const v of b.values) sum += v;
            out.push({
                name: b.name,
                tags: safeParseTags(b.tags),
                count: n,
                p50: pick(0.5),
                p95: pick(0.95),
                p99: pick(0.99),
                min: b.values[0],
                max: b.values[n - 1],
                sum,
                firstTs: Math.min(...b.tsList),
                lastTs: Math.max(...b.tsList),
            });
        }

        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    } catch (err: any) {
        log.warn(`summarise_histograms_failed: ${err?.message || 'unknown'}`);
        return [];
    }
}

function safeParseTags (raw: string): Record<string, string> {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, string>;
        }
        return {};
    } catch {
        return {};
    }
}
