/**
 * Cluster pin forward (SUPERNODE-CLUSTER-SETUP / Phase 5)
 *
 * Replaces (longer-term) the per-node SUPERNODE_PIN_MIRRORS fan-out and the
 * single-node ELACITY_PIN_FORWARD_URL/TOKEN forward with a single call against
 * IPFS Cluster's Pinning Services API (https://ipfs.io/blog/2020-09-pinning-services/).
 *
 * One Cluster API call → CRDT-replicated pin across ALL configured supernodes,
 * with replication factor enforced at the Cluster layer rather than per-node.
 *
 * Default OFF. When ops have:
 *   1. Stood up an IPFS Cluster mesh on the supernodes (see
 *      `.cursor/tasks/SUPERNODE-CLUSTER-SETUP/SUPERNODE-CLUSTER-SETUP.md`)
 *   2. Exposed the Pinning Services API (default port 9097) publicly via
 *      nginx with bearer-token auth
 *   3. Set both SUPERNODE_CLUSTER_PIN_URL and SUPERNODE_CLUSTER_PIN_TOKEN
 * …pc2-node automatically starts mirroring every successful local pin
 * through the cluster too. Until then this module is a no-op.
 *
 * Backwards-compatible: this runs ALONGSIDE the older
 * SUPERNODE_PIN_MIRRORS / ELACITY_PIN_FORWARD_URL paths. Once cluster
 * pinning is proven in production, the older paths can be deprecated.
 */

import { createLogger } from '../utils/logger.js';
import { recordMetricCounter, recordMetricHistogram } from '../utils/metrics.js';

const log = createLogger('clusterPin');

// ---------------------------------------------------------------------------
// Config + types
// ---------------------------------------------------------------------------

interface ClusterPinConfig {
  url: string;
  token: string;
  replicationMin: number;
  replicationMax: number;
}

interface ClusterPinProbeResult {
  url: string;
  lastCid: string;
  lastStatus: number | 'error';
  lastRequestId?: string;
  lastError?: string;
  lastDurationMs: number;
  lastAt: number;
}

interface ClusterPinRetryState {
  cid: string;
  attempts: number;
  firstQueuedAt: number;
  nextAttemptAt: number;
  lastError: string;
}

// Mirrors ELACITY_PIN_FORWARD's retry semantics so operators don't have to
// learn a new mental model: 5 attempts, exponential backoff, hard age cap.
const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS: readonly number[] = [60_000, 120_000, 240_000, 480_000, 960_000];
const RETRY_MAX_QUEUE = 1000;
const RETRY_MAX_AGE_MS = 3_600_000;
const RETRY_TICK_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

let probeState: ClusterPinProbeResult | null = null;
const retryQueue = new Map<string, ClusterPinRetryState>();
let retrySchedulerStarted = false;

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

// Default cluster — Elacity supernode mesh on Contabo + InterServer.
//
// Every community pc2-node auto-replicates pins here on first install with
// ZERO operator action ("install and works"). The token is shared across
// the public community pool; abuse is bounded by per-IP rate limiting at
// the supernode (30 r/m + burst 20 → returns 429 on overflow). Per-node
// tokens with rotatable scopes are slated for v1.2.8 — see SUPERNODE-RPC-PROXY
// task for the same migration pattern.
//
// IP-based HTTPS URL is intentional: the cert is self-signed (no DNS for
// `cluster.ela.city` pointing here yet — gated on Thailand DNS round-trip).
// pc2-node already runs with NODE_TLS_REJECT_UNAUTHORIZED=0 globally
// (UsernameService.ts:17), so the IP-literal cert is accepted.
//
// Override: set SUPERNODE_CLUSTER_PIN_URL and/or _TOKEN in shell env or
//           pc2-node/.env to use a different cluster (e.g. self-hosted).
// Disable:  set SUPERNODE_CLUSTER_PIN_URL= (empty) in shell or .env to
//           opt out of cluster pinning entirely (legacy ELACITY_PIN_FORWARD_URL
//           and SUPERNODE_PIN_MIRRORS still fire if configured).
const DEFAULT_CLUSTER_PIN_URL = 'https://38.242.211.112/cluster-pin/';
const DEFAULT_CLUSTER_PIN_TOKEN = 'BA6kH1kG91o74zlrcQOX3ccr0nGzxEPM';

export function getClusterPinConfig(): ClusterPinConfig | null {
  // ?? (nullish coalescing) instead of || so that an EXPLICITLY EMPTY
  // value (operator opting out) doesn't silently fall back to the default.
  const rawUrl = process.env.SUPERNODE_CLUSTER_PIN_URL ?? DEFAULT_CLUSTER_PIN_URL;
  const token = process.env.SUPERNODE_CLUSTER_PIN_TOKEN ?? DEFAULT_CLUSTER_PIN_TOKEN;
  if (!rawUrl || !token) return null;
  const url = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) return null;
  const replicationMin = parseIntEnv('SUPERNODE_CLUSTER_PIN_REPLICATION_MIN', 2);
  const replicationMax = parseIntEnv('SUPERNODE_CLUSTER_PIN_REPLICATION_MAX', 2);
  return { url, token: token.trim(), replicationMin, replicationMax };
}

export function getClusterPinProbeState(): ClusterPinProbeResult | null {
  return probeState;
}

export function getClusterPinRetryQueueSnapshot(): {
  size: number;
  maxAttempts: number;
  maxQueueSize: number;
  maxAgeMs: number;
  schedulerStarted: boolean;
  pending: Array<{ cid: string; attempts: number; nextAttemptInMs: number; firstQueuedAgoMs: number; lastError: string }>;
} {
  const now = Date.now();
  const pending = Array.from(retryQueue.values())
    .slice(0, 20)
    .map((s) => ({
      cid: s.cid,
      attempts: s.attempts,
      nextAttemptInMs: Math.max(0, s.nextAttemptAt - now),
      firstQueuedAgoMs: now - s.firstQueuedAt,
      lastError: s.lastError,
    }));
  return {
    size: retryQueue.size,
    maxAttempts: RETRY_MAX_ATTEMPTS,
    maxQueueSize: RETRY_MAX_QUEUE,
    maxAgeMs: RETRY_MAX_AGE_MS,
    schedulerStarted: retrySchedulerStarted,
    pending,
  };
}

/**
 * Fire a pin request to the cluster. No-op when not configured.
 * Fire-and-forget — the caller is never blocked on the cluster call.
 * On failure, the cid is queued for exponential-backoff retry.
 */
export function forwardPinToCluster(rawCid: string, name?: string): void {
  const config = getClusterPinConfig();
  if (!config) return;
  const cid = normalizeCid(rawCid);
  if (!cid) return;

  ensureRetrySchedulerStarted();

  const target = `${config.url}/pins`;
  const start = Date.now();

  const body = JSON.stringify({
    cid,
    name: name ?? `pc2-node-${cid.slice(0, 8)}`,
    meta: {
      'replication-min': String(config.replicationMin),
      'replication-max': String(config.replicationMax),
    },
  });

  void fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).then(
    async (response) => {
      const durationMs = Date.now() - start;
      const requestId = await safeExtractRequestId(response);
      probeState = {
        url: config.url,
        lastCid: cid,
        lastStatus: response.status,
        lastRequestId: requestId,
        lastDurationMs: durationMs,
        lastAt: Date.now(),
      };

      // T-1C Phase 2: classify outcome into a low-cardinality tag set.
      // status_class buckets the HTTP status ('2xx', '4xx', '5xx') instead
      // of leaking the exact status — keeps tag cardinality bounded.
      recordMetricHistogram(undefined, 'cluster_pin.forward_ms', durationMs, {
        status_class: classifyHttpStatus(response.status),
      });

      if (response.ok) {
        retryQueue.delete(cid);
        log.info(`[ClusterPin] ok cid=${cid} requestId=${requestId ?? 'n/a'} (${durationMs}ms)`);
        recordMetricCounter(undefined, 'cluster_pin.forward', 1, { outcome: 'ok' });
        return;
      }

      // 4xx = caller's fault (auth/bad cid/conflict). Don't retry.
      // 5xx and gateway timeouts = transient. Retry.
      if (response.status >= 500) {
        log.warn(`[ClusterPin] 5xx cid=${cid} status=${response.status} (${durationMs}ms) — scheduling retry`);
        queueRetry(cid, `status=${response.status}`);
        recordMetricCounter(undefined, 'cluster_pin.forward', 1, { outcome: 'retryable', status_class: '5xx' });
      } else {
        log.warn(`[ClusterPin] non-retryable cid=${cid} status=${response.status} (${durationMs}ms)`);
        recordMetricCounter(undefined, 'cluster_pin.forward', 1, { outcome: 'non_retryable', status_class: classifyHttpStatus(response.status) });
      }
    },
    (err: unknown) => {
      const durationMs = Date.now() - start;
      const message = errMessage(err);
      probeState = {
        url: config.url,
        lastCid: cid,
        lastStatus: 'error',
        lastError: message,
        lastDurationMs: durationMs,
        lastAt: Date.now(),
      };
      log.debug(`[ClusterPin] failed cid=${cid} (${durationMs}ms): ${message} — scheduling retry`);
      queueRetry(cid, message);
      recordMetricHistogram(undefined, 'cluster_pin.forward_ms', durationMs, { status_class: 'error' });
      recordMetricCounter(undefined, 'cluster_pin.forward', 1, { outcome: 'error', reason: classifyNetworkError(message) });
    },
  );
}

/**
 * Bucket a numeric HTTP status into a low-cardinality tag value.
 * Lets the cluster_pin metric's `status_class` tag stay bounded
 * (5 possible values) instead of one tag value per distinct status.
 */
function classifyHttpStatus (status: number): string {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'unknown';
}

/**
 * Bucket a network error message into a low-cardinality reason tag.
 * Same privacy rationale as `classifyChipotleError` in chipotle-client.ts.
 */
function classifyNetworkError (msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (m.includes('aborted') || m.includes('abort')) return 'aborted';
  if (m.includes('econnrefused') || m.includes('refused')) return 'conn_refused';
  if (m.includes('enotfound') || m.includes('dns')) return 'dns';
  if (m.includes('certificate') || m.includes('tls') || m.includes('ssl')) return 'tls';
  return 'other';
}

/**
 * Query the cluster for the pin status of a single CID.
 * Returns null when not configured or not found.
 *
 * Used by the availability badge endpoint.
 */
export async function queryClusterPinStatus(rawCid: string): Promise<{
  cid: string;
  status: 'pinned' | 'pinning' | 'queued' | 'failed' | 'unpinned' | 'unknown';
  delegates: string[];
  raw: unknown;
} | null> {
  const config = getClusterPinConfig();
  if (!config) return null;
  const cid = normalizeCid(rawCid);
  if (!cid) return null;

  const __metricStart = Date.now();
  const target = `${config.url}/pins?cid=${encodeURIComponent(cid)}`;
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - __metricStart;
    recordMetricHistogram(undefined, 'cluster_pin.query_ms', durationMs, { status_class: classifyHttpStatus(response.status) });
    if (!response.ok) {
      log.debug(`[ClusterPin] queryStatus non-ok cid=${cid} status=${response.status}`);
      recordMetricCounter(undefined, 'cluster_pin.query', 1, { outcome: 'non_ok', status_class: classifyHttpStatus(response.status) });
      return null;
    }
    const data: unknown = await response.json();
    const result = parseStatusResponse(cid, data);
    recordMetricCounter(undefined, 'cluster_pin.query', 1, { outcome: 'ok', pin_status: result.status });
    return result;
  } catch (err) {
    const durationMs = Date.now() - __metricStart;
    recordMetricHistogram(undefined, 'cluster_pin.query_ms', durationMs, { status_class: 'error' });
    recordMetricCounter(undefined, 'cluster_pin.query', 1, { outcome: 'error', reason: classifyNetworkError(errMessage(err)) });
    log.debug(`[ClusterPin] queryStatus failed cid=${cid}: ${errMessage(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

function normalizeCid(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let cid = raw.trim();
  if (cid.startsWith('ipfs://')) cid = cid.slice(7);
  if (cid.startsWith('/ipfs/')) cid = cid.slice(6);
  const slashIdx = cid.indexOf('/');
  if (slashIdx > 0) cid = cid.slice(0, slashIdx);
  return cid.length > 0 ? cid : null;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'unknown error';
}

async function safeExtractRequestId(response: Response): Promise<string | undefined> {
  try {
    const cloned = response.clone();
    const data = (await cloned.json()) as { requestid?: string };
    return data?.requestid;
  } catch {
    return undefined;
  }
}

function queueRetry(cid: string, error: string): void {
  const existing = retryQueue.get(cid);
  const attempts = (existing?.attempts ?? 0) + 1;

  if (attempts > RETRY_MAX_ATTEMPTS) {
    log.error(`[ClusterPin] giving up after ${RETRY_MAX_ATTEMPTS} attempts cid=${cid} lastError=${error}`);
    retryQueue.delete(cid);
    return;
  }

  const now = Date.now();
  const firstQueuedAt = existing?.firstQueuedAt ?? now;
  if (now - firstQueuedAt > RETRY_MAX_AGE_MS) {
    log.error(`[ClusterPin] aged out (>${Math.round(RETRY_MAX_AGE_MS / 60000)}min) cid=${cid} lastError=${error}`);
    retryQueue.delete(cid);
    return;
  }

  if (!existing && retryQueue.size >= RETRY_MAX_QUEUE) {
    log.warn(`[ClusterPin] retry queue full (${RETRY_MAX_QUEUE}), dropping cid=${cid}`);
    return;
  }

  const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
  retryQueue.set(cid, {
    cid,
    attempts,
    firstQueuedAt,
    nextAttemptAt: now + backoff,
    lastError: error,
  });
  log.debug(`[ClusterPin] retry queued cid=${cid} attempt=${attempts}/${RETRY_MAX_ATTEMPTS} backoffMs=${backoff}`);
}

function ensureRetrySchedulerStarted(): void {
  if (retrySchedulerStarted) return;
  if (!getClusterPinConfig()) return;
  retrySchedulerStarted = true;

  const tick = (): void => {
    const now = Date.now();
    for (const [, state] of retryQueue) {
      if (state.nextAttemptAt <= now) {
        forwardPinToCluster(state.cid);
      }
    }
  };
  const timer = setInterval(tick, RETRY_TICK_MS);
  timer.unref?.();
  log.info(`[ClusterPin] retry scheduler started (interval=${RETRY_TICK_MS}ms, maxAttempts=${RETRY_MAX_ATTEMPTS})`);
}

function parseStatusResponse(
  cid: string,
  data: unknown,
): { cid: string; status: 'pinned' | 'pinning' | 'queued' | 'failed' | 'unpinned' | 'unknown'; delegates: string[]; raw: unknown } {
  // Pinning Services API spec: { count, results: [{ requestid, status, pin, delegates, ... }] }
  if (data && typeof data === 'object' && 'results' in data) {
    const results = (data as { results?: Array<{ status?: string; delegates?: string[] }> }).results;
    if (Array.isArray(results) && results.length > 0) {
      const first = results[0];
      const status = normalizeStatus(first?.status);
      const delegates = Array.isArray(first?.delegates) ? first.delegates : [];
      return { cid, status, delegates, raw: data };
    }
    return { cid, status: 'unpinned', delegates: [], raw: data };
  }
  return { cid, status: 'unknown', delegates: [], raw: data };
}

function normalizeStatus(raw: string | undefined): 'pinned' | 'pinning' | 'queued' | 'failed' | 'unpinned' | 'unknown' {
  switch (raw) {
    case 'pinned':
    case 'pinning':
    case 'queued':
    case 'failed':
      return raw;
    default:
      return 'unknown';
  }
}

// Boot-time info line so operators can confirm cluster state from logs.
(() => {
  const config = getClusterPinConfig();
  if (config) {
    const isDefault = config.url === DEFAULT_CLUSTER_PIN_URL.replace(/\/+$/, '');
    const tag = isDefault ? '(Elacity default)' : '(custom override)';
    log.info(`[ClusterPin] enabled -> ${config.url} ${tag} (replication=${config.replicationMin}/${config.replicationMax})`);
    ensureRetrySchedulerStarted();
    return;
  }
  // Reaching here means operator explicitly opted out by setting
  // SUPERNODE_CLUSTER_PIN_URL= or _TOKEN= to empty. Quiet no-op log.
  log.info('[ClusterPin] disabled (operator opt-out via empty SUPERNODE_CLUSTER_PIN_URL or _TOKEN)');
})();
