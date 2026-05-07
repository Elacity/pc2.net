/**
 * Diagnose API
 *
 * GET /api/diagnose — authenticated structured snapshot of node state.
 *
 * Server-side equivalent of `scripts/pc2-diagnose.sh`. Returns the same
 * data as JSON so a future GUI surface can render a "Copy diagnostic"
 * panel without operators having to SSH in. Auth-gated: contains
 * recent log lines and binary paths, which we don't expose anonymously.
 *
 * Every shell-out is hard-capped at 5 s to avoid wedging the request
 * if a tool (e.g. `pm2 logs`) hangs on a starving node. All string
 * output passes through the same sanitiser as the bash script
 * (wallets, DIDs, bearer tokens, BEGIN…END blocks, 24-word mnemonics).
 *
 * v1.2.7.1: shipped to give Sasha a way to debug remote community
 * nodes without asking operators for terminal access. Pull-based,
 * opt-in, no phone-home — operator clicks the future button, gets
 * a JSON blob, pastes the relevant slice in Telegram.
 */

import { Router, Response } from 'express';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, statSync } from 'fs';
import { authenticate, AuthenticatedRequest } from './middleware.js';
import { logger } from '../utils/logger.js';
import { getClusterPinConfig, getClusterPinProbeState } from '../services/clusterPin.js';
import { sanitise } from '../utils/redact.js';

const router = Router();

// ESM-compatible __dirname. The package is `"type": "module"` so the
// CommonJS magic globals don't exist — mirroring the polyfill in
// `src/index.ts:94`. Required for `resolvePc2Version()` below to walk to
// the right `package.json`. T-1A v1: previous build shipped without this
// and crashed every diagnose call with `ReferenceError: __dirname is not
// defined`. Surfaces as HTTP 500 in the Health & Support test-app.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHELL_TIMEOUT_MS = 5_000;

// Cache the resolved pc2-node version so we don't re-walk the filesystem on
// every diagnose call. Resolved lazily on first use; immutable for the
// process lifetime.
let cachedVersion: string | null = null;

/**
 * Resolve the running pc2-node version. Mirrors the resolver in
 * `src/index.ts` and `UpdateService.ts` — duplicated intentionally to keep
 * the diagnose router self-contained and avoid pulling in either the boot
 * sequence or the update service for what is meant to be a read-only probe.
 *
 * Strategy:
 *   1. PC2_VERSION env var (set by Electron launcher in production builds)
 *   2. Walk a few candidate paths looking for package.json
 *   3. Fall back to "unknown" so the UI renders a clean badge instead of a
 *      misleading version string.
 *
 * Why this matters: when pc2-node is launched via `node dist/index.js`
 * (every desktop install does this), `process.env.npm_package_version` is
 * NOT populated — that var is only set by `npm` when it spawns the process.
 * The previous code read that env var directly and silently fell back to
 * "unknown" on every desktop install. T-1A surfaced this as
 * `Current version: unknown` in the Health & Support panel.
 */
function resolvePc2Version (): string {
    if (cachedVersion) return cachedVersion;
    const fromEnv = process.env.PC2_VERSION;
    if (fromEnv && fromEnv.length > 0) {
        cachedVersion = fromEnv;
        return fromEnv;
    }
    const candidates = [
        path.join(__dirname, '..', '..', 'package.json'),
        path.join(__dirname, '..', '..', '..', 'package.json'),
        path.join(process.cwd(), 'package.json'),
        path.join(process.cwd(), '..', 'package.json'),
    ];
    for (const p of candidates) {
        if (existsSync(p)) {
            try {
                const pkg = JSON.parse(readFileSync(p, 'utf-8'));
                if (pkg && typeof pkg.version === 'string' && pkg.version.length > 0) {
                    cachedVersion = pkg.version;
                    return pkg.version;
                }
            } catch {
                // Try next candidate
            }
        }
    }
    const fallback = process.env.npm_package_version || 'unknown';
    cachedVersion = fallback;
    return fallback;
}

/**
 * Run a shell command with a hard timeout and return stdout/stderr as
 * a single sanitised string. Never throws — failures become the string
 * `(error: <message>)` so the rest of the report still renders.
 */
function safeRun (cmd: string): string {
    try {
        const out = execSync(cmd, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: SHELL_TIMEOUT_MS,
            shell: '/bin/sh',
            encoding: 'utf8',
            maxBuffer: 1 * 1024 * 1024,
        });
        return sanitise(out.trim());
    } catch (err: any) {
        const msg = (err?.stderr?.toString() || err?.message || 'unknown').trim();
        return `(error: ${sanitise(msg)})`;
    }
}

// `sanitise()` was previously inline here. Extracted to
// `pc2-node/src/utils/redact.ts` (T-1B) so both diagnose.ts and the new
// support-report builder reuse the same patterns without drift.

/**
 * Read pc2-node/.env and return only the KEY names (values stripped).
 * Used to confirm operator-side env config without ever leaking secrets.
 * Returns empty array if .env is missing or unreadable.
 */
function readEnvKeys (dataDir: string): string[] {
    try {
        // pc2-node/.env lives in the pc2-node/ root, not data dir
        const envPath = path.resolve(dataDir, '..', '.env');
        if (!existsSync(envPath)) return [];
        const text = readFileSync(envPath, 'utf8');
        const keys = new Set<string>();
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
            if (m) keys.add(m[1]);
        }
        return Array.from(keys).sort();
    } catch {
        return [];
    }
}

/**
 * Probe each transport binary on PATH. Returns absolute path or null.
 * Hard-capped per-binary so a hung filesystem can't stall the response.
 */
function probeBinaries (): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const bin of ['wg', 'wg-quick', 'wireguard-go', 'amneziawg-go', 'awg-quick', 'sing-box']) {
        try {
            const p = execSync(`command -v ${bin} 2>/dev/null`, {
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 1_500,
                shell: '/bin/sh',
                encoding: 'utf8',
            }).trim();
            out[bin] = p || null;
        } catch {
            out[bin] = null;
        }
    }
    return out;
}

/**
 * Tail recent pm2 logs for pc2 and filter to lines that mention
 * the subsystems most relevant to the bugs we're triaging
 * (pin / cluster / ipfs / wireguard / errors). Bounded to the most
 * recent 80 matches to keep the JSON response small.
 */
function tailRelevantLogs (): string[] {
    try {
        const out = execSync(
            'pm2 logs pc2 --lines 200 --nostream 2>&1 | '
                + "grep -iE 'pin|cluster|ipfs|helia|wireguard|amnezia|error|warn' | tail -80",
            {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: SHELL_TIMEOUT_MS,
                shell: '/bin/sh',
                encoding: 'utf8',
                maxBuffer: 2 * 1024 * 1024,
            },
        );
        return out
            .split(/\r?\n/)
            .filter(Boolean)
            .map(sanitise);
    } catch {
        return [];
    }
}

/**
 * Best-effort disk usage for the pc2-node data dir. Returns null if
 * statfs/df is unavailable (e.g. unusual platform).
 */
function diskUsage (dataDir: string): { path: string; total: number | null; free: number | null } | null {
    try {
        if (!existsSync(dataDir)) return null;
        // Node 18+ has statfs but it's experimental — fall back to df.
        const out = execSync(`df -P -k ${JSON.stringify(dataDir)} | tail -1`, {
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 2_000,
            shell: '/bin/sh',
            encoding: 'utf8',
        }).trim();
        // df -P columns: Filesystem  1024-blocks  Used  Available  Capacity  Mounted-on
        const parts = out.split(/\s+/);
        if (parts.length < 4) return { path: dataDir, total: null, free: null };
        return {
            path: dataDir,
            total: Number(parts[1]) * 1024,
            free: Number(parts[3]) * 1024,
        };
    } catch {
        return null;
    }
}

/**
 * Connectivity probe to the public Elacity supernode cluster pinning
 * endpoint. We don't include any token — a 401 means the cluster is
 * up and gating correctly; a connection failure means this node can't
 * reach the supernodes and explains why pins fail downstream.
 *
 * Uses the same 5 s timeout as the rest of the diagnose pipeline.
 */
async function probeClusterEndpoint (): Promise<{ url: string | null; reachable: boolean; httpStatus: number | null; latencyMs: number | null; error: string | null }> {
    const cfg = getClusterPinConfig();
    const url = cfg ? `${cfg.url.replace(/\/+$/, '')}/pins` : 'https://38.242.211.112/cluster-pin/pins';
    const start = Date.now();
    try {
        // Reuse Node's global fetch (Node 18+). Force keep-alive off so a
        // hung supernode can't pin the connection in the agent pool.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), SHELL_TIMEOUT_MS);
        // SECURITY: NO Authorization header here — we only want to know
        // if the endpoint is reachable. Token redacted by sanitise()
        // anyway, but defence in depth.
        const res = await fetch(url, {
            method: 'GET',
            signal: ctrl.signal,
            keepalive: false,
        });
        clearTimeout(timer);
        return {
            url: cfg?.url || null,
            reachable: true,
            httpStatus: res.status,
            latencyMs: Date.now() - start,
            error: null,
        };
    } catch (err: any) {
        return {
            url: cfg?.url || null,
            reachable: false,
            httpStatus: null,
            latencyMs: Date.now() - start,
            error: sanitise(err?.message || 'unknown'),
        };
    }
}

// ── liveProbes (T-1A) ────────────────────────────────────────────────────────
// User-initiated diagnostic probes. Each is independent, fail-soft, and
// hard-capped on latency. Results land under snapshot.liveProbes — existing
// snapshot keys are unchanged so any consumer of GET /api/diagnose stays
// compatible. SECURITY: every probe runs through `sanitise()` on errors and
// avoids reading any secret values (existence + size only).

const PROBE_TIMEOUT_MS = SHELL_TIMEOUT_MS;

// Hardcoded supernode list mirrors chipotle-client.ts SUPERNODE_PROVISION_URLS
// and ConnectivityService.ts SUPERNODE_HEALTH_URLS. Kept in sync deliberately
// (no shared module yet — duplication tax until we extract a
// `pc2-node/src/config/supernodes.ts` in T-1B Phase B).
const KNOWN_SUPERNODES: ReadonlyArray<{ name: string; baseUrl: string }> = [
    { name: 'interserver', baseUrl: 'https://69.164.241.210' },
    { name: 'contabo',     baseUrl: 'https://38.242.211.112' },
];

const SUPERNODE_PROBE_PATHS = ['/api/health', '/api/ddrm/provision'] as const;

// Lit Action API host (matches DEFAULT_API_URL in chipotle-client.ts).
const LIT_API_HOST = 'https://api.chipotle.litprotocol.com';

// WASM crates produced by Elacity's Rust workspace + ports. Paths are relative
// to the workspace root (parent of `pc2-node/`). Resolved at probe time.
const KNOWN_WASM_CRATES: ReadonlyArray<{ name: string; relPath: string }> = [
    { name: 'cenc-encrypt',   relPath: 'pc2-node/wasm-apps/cenc-encrypt/cenc-encrypt.wasm' },
    { name: 'cenc-decrypt',   relPath: 'pc2-node/wasm-apps/cenc-decrypt/cenc-decrypt.wasm' },
    { name: 'mp4-split',      relPath: 'pc2-node/wasm-apps/mp4-split/mp4-split.wasm' },
    { name: 'ipfs-assemble',  relPath: 'pc2-node/wasm-apps/ipfs-assemble/ipfs-assemble.wasm' },
    { name: 'ddrm-renderer',  relPath: 'pc2-node/wasm-apps/ddrm-renderer/ddrm-renderer.wasm' },
    { name: 'evm-multicall',  relPath: 'pc2-node/wasm-apps/evm-multicall/evm-multicall.wasm' },
    { name: 'amm-engine',     relPath: 'pc2-node/wasm-apps/amm-engine/amm-engine.wasm' },
];

// GitHub repo for release checks (matches UpdateService.ts default).
const UPDATE_CHANNEL_URL = 'https://api.github.com/repos/Elacity/pc2.net/releases/latest';

interface LitConfigProbe {
    apiKeyConfigured: boolean;
    userKeyConfigured: boolean;
    litActionCidConfigured: boolean;
    provisionCached: boolean;
    apiHostReachable: boolean;
    apiLatencyMs: number | null;
    error: string | null;
}

/**
 * Lit Protocol / Chipotle health probe. Config-only — does NOT call any
 * Lit Action and therefore burns ZERO Lit Protocol quota. Verifies that:
 *   - the four chipotle-client.ts state files exist on disk and are non-empty
 *   - the Lit API host is reachable (HEAD request, no auth, no JSON body)
 *
 * Why HEAD-only: a real round-trip would require a SIWE-signed delegation +
 * burn one Lit Action call against the leaked usageKey. Both are hostile to a
 * "click me to check things" diagnostic surface. Real round-trip moves to T-1B
 * once SIWE-gated relayer endpoints exist (the relayer, not the user, owns
 * the quota cost).
 */
async function probeLitConfig (dataDir: string): Promise<LitConfigProbe> {
    const result: LitConfigProbe = {
        apiKeyConfigured: false,
        userKeyConfigured: false,
        litActionCidConfigured: false,
        provisionCached: false,
        apiHostReachable: false,
        apiLatencyMs: null,
        error: null,
    };

    // File-existence checks. We never read the values — only check size > 0.
    // Path layout mirrors chipotle-client.ts DATA_DIR resolution.
    try {
        const apiKeyPath     = path.join(dataDir, '.chipotle-api-key');
        const userKeyPath    = path.join(dataDir, '.chipotle-user-key');
        const cidPath        = path.join(dataDir, '.lit-action-cid');
        const provisionPath  = path.join(dataDir, '.chipotle-provision.json');
        result.apiKeyConfigured       = existsSync(apiKeyPath)    && statSync(apiKeyPath).size    > 0;
        result.userKeyConfigured      = existsSync(userKeyPath)   && statSync(userKeyPath).size   > 0;
        result.litActionCidConfigured = existsSync(cidPath)       && statSync(cidPath).size       > 0;
        result.provisionCached        = existsSync(provisionPath) && statSync(provisionPath).size > 0;
    } catch (err: any) {
        result.error = sanitise(err?.message || 'config_check_failed');
    }

    const start = Date.now();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const res = await fetch(LIT_API_HOST, {
            method: 'HEAD',
            signal: ctrl.signal,
            keepalive: false,
        });
        clearTimeout(timer);
        // We don't care about res.status — even a 404/405 means TLS handshake
        // succeeded and the host is alive. A network-level fail would have
        // thrown before reaching here.
        result.apiHostReachable = true;
        result.apiLatencyMs = Date.now() - start;
        // Reference res so a future linter doesn't flag it unused without
        // changing the no-burn semantics of this probe.
        void res;
    } catch (err: any) {
        result.apiHostReachable = false;
        result.apiLatencyMs = Date.now() - start;
        if (!result.error) {
            result.error = sanitise(err?.message || 'lit_host_unreachable');
        }
    }

    return result;
}

interface SupernodeProbe {
    name: string;
    url: string;
    endpoint: string;
    reachable: boolean;
    httpStatus: number | null;
    latencyMs: number | null;
    error: string | null;
}

/**
 * Multi-supernode reachability matrix. Probes (supernode × endpoint) in
 * parallel; each probe is bounded by PROBE_TIMEOUT_MS, so total wall time
 * stays < PROBE_TIMEOUT_MS regardless of how many supernodes are listed.
 *
 * NO Authorization header — we want raw connect+TLS+HTTP-status. A 401 from
 * `/api/ddrm/provision` against an un-authed probe means "alive + gating
 * correctly" (same shape as `probeClusterEndpoint()`).
 */
async function probeAllSupernodes (): Promise<SupernodeProbe[]> {
    const probes = KNOWN_SUPERNODES.flatMap((sn) =>
        SUPERNODE_PROBE_PATHS.map(async (epPath): Promise<SupernodeProbe> => {
            const url = `${sn.baseUrl}${epPath}`;
            const start = Date.now();
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
                const res = await fetch(url, {
                    method: 'GET',
                    signal: ctrl.signal,
                    keepalive: false,
                });
                clearTimeout(timer);
                return {
                    name: sn.name,
                    url,
                    endpoint: epPath,
                    reachable: true,
                    httpStatus: res.status,
                    latencyMs: Date.now() - start,
                    error: null,
                };
            } catch (err: any) {
                return {
                    name: sn.name,
                    url,
                    endpoint: epPath,
                    reachable: false,
                    httpStatus: null,
                    latencyMs: Date.now() - start,
                    error: sanitise(err?.message || 'unknown'),
                };
            }
        }),
    );
    return Promise.all(probes);
}

interface WasmProbe {
    name: string;
    path: string;
    exists: boolean;
    sizeBytes: number | null;
    magicValid: boolean;
    compileOk: boolean;
    error: string | null;
}

/**
 * Walks the known WASM crate list and validates each binary. Three checks:
 *   1. file exists on disk
 *   2. WASM magic bytes (`\0asm`) are present
 *   3. `WebAssembly.compile()` parses without error
 *
 * SECURITY: `WebAssembly.compile()` is a STATIC validation — it parses the
 * module structure and verifies it's well-formed but does NOT instantiate it,
 * does NOT call any function, does NOT allocate per-instance memory, and
 * does NOT run start sections. Memory cost is bounded by module size (each
 * crate is ~hundreds of KB → tens of MB worst case for all 7 in parallel).
 */
async function probeWasmCrates (workspaceRoot: string): Promise<WasmProbe[]> {
    const probes = KNOWN_WASM_CRATES.map(async (crate): Promise<WasmProbe> => {
        const fullPath = path.resolve(workspaceRoot, crate.relPath);
        const probe: WasmProbe = {
            name: crate.name,
            path: crate.relPath,
            exists: false,
            sizeBytes: null,
            magicValid: false,
            compileOk: false,
            error: null,
        };
        try {
            if (!existsSync(fullPath)) {
                return probe;
            }
            probe.exists = true;
            const buf = readFileSync(fullPath);
            probe.sizeBytes = buf.length;
            probe.magicValid = buf.length >= 4
                && buf[0] === 0x00 && buf[1] === 0x61
                && buf[2] === 0x73 && buf[3] === 0x6D;
            if (probe.magicValid) {
                // Static parse only — no instantiate, no run.
                await WebAssembly.compile(buf);
                probe.compileOk = true;
            }
        } catch (err: any) {
            probe.error = sanitise(err?.message || 'wasm_probe_failed');
        }
        return probe;
    });
    return Promise.all(probes);
}

interface UpdateChannelProbe {
    reachable: boolean;
    httpStatus: number | null;
    latestVersion: string | null;
    currentVersion: string;
    latencyMs: number | null;
    error: string | null;
}

/**
 * GitHub Releases reachability probe. Mirrors UpdateService.ts's call to
 * confirm the auto-updater can reach its source of truth. Unauthenticated —
 * GitHub allows 60 r/h per IP for unauth'd /repos/.../releases/latest, which
 * is fine for a manually-triggered diagnostic.
 */
async function probeUpdateChannel (): Promise<UpdateChannelProbe> {
    const currentVersion = resolvePc2Version();
    const start = Date.now();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const res = await fetch(UPDATE_CHANNEL_URL, {
            method: 'GET',
            headers: {
                'User-Agent': `PC2-Node/${currentVersion}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            signal: ctrl.signal,
            keepalive: false,
        });
        clearTimeout(timer);
        let latestVersion: string | null = null;
        if (res.ok) {
            try {
                const json = await res.json() as { tag_name?: string };
                latestVersion = json.tag_name?.replace(/^v/, '') || null;
            } catch {
                // Body parse failure is non-fatal — reachability is what we asked.
            }
        }
        return {
            reachable: true,
            httpStatus: res.status,
            latestVersion,
            currentVersion,
            latencyMs: Date.now() - start,
            error: null,
        };
    } catch (err: any) {
        return {
            reachable: false,
            httpStatus: null,
            latestVersion: null,
            currentVersion,
            latencyMs: Date.now() - start,
            error: sanitise(err?.message || 'update_channel_unreachable'),
        };
    }
}

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const bosonService = req.app.locals.bosonService;
        const db = req.app.locals.db;
        const filesystem = req.app.locals.filesystem;
        const dataDir = process.env.PC2_DATA_DIR || path.join(process.cwd(), 'data');

        // Live transport status via BosonService (catches kernel-mode WireGuard)
        let bosonStatus: any = null;
        if (bosonService && typeof bosonService.getStatus === 'function') {
            try { bosonStatus = bosonService.getStatus(); } catch { /* leave null */ }
        }

        const clusterCfg = getClusterPinConfig();
        const clusterProbe = getClusterPinProbeState();

        // Run all five reachability/health probes in parallel — total wall
        // time stays bounded by PROBE_TIMEOUT_MS (~5s) regardless of how many
        // probes we add. The workspace root is two levels above dataDir
        // (`pc2-node/data/..` → `pc2-node/..` → repo root) which is where
        // `pc2-node/wasm-apps/...` resolves from.
        const workspaceRoot = path.resolve(dataDir, '..', '..');
        const [
            clusterReachability,
            litConfigProbe,
            supernodeProbes,
            wasmProbes,
            updateChannelProbe,
        ] = await Promise.all([
            probeClusterEndpoint(),
            probeLitConfig(dataDir),
            probeAllSupernodes(),
            probeWasmCrates(workspaceRoot),
            probeUpdateChannel(),
        ]);

        // Memory + load
        const totalMem = os.totalmem();
        const freeMem = os.freemem();

        const snapshot = {
            generatedAt: new Date().toISOString(),
            pc2: {
                version: resolvePc2Version(),
                uptimeSec: Math.round(process.uptime()),
                pid: process.pid,
                nodeVersion: process.version,
                cwd: process.cwd(),
                dataDir,
            },
            host: {
                platform: os.platform(),
                release: os.release(),
                arch: os.arch(),
                cpuCount: os.cpus().length,
                loadAvg: os.loadavg(),
                totalMemBytes: totalMem,
                freeMemBytes: freeMem,
                memUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
            },
            disk: diskUsage(dataDir),
            services: {
                database: db ? 'ok' : 'missing',
                filesystem: filesystem ? 'ok' : 'missing',
                bosonInitialised: bosonStatus?.initialized ?? null,
                wireguard: bosonStatus?.wireguard ?? null,
                amneziaWG: bosonStatus?.amneziaWG ?? null,
                vlessReality: bosonStatus?.vlessReality ?? null,
                connectivity: bosonStatus?.connectivity ?? null,
            },
            transportBinariesOnPath: probeBinaries(),
            cluster: {
                configured: !!clusterCfg,
                url: clusterCfg?.url ?? null,
                replicationMin: clusterCfg?.replicationMin ?? null,
                replicationMax: clusterCfg?.replicationMax ?? null,
                lastProbe: clusterProbe,
                reachability: clusterReachability,
            },
            envKeysPresent: readEnvKeys(dataDir),
            git: {
                head: safeRun('git -C ' + JSON.stringify(path.resolve(dataDir, '..', '..')) + ' rev-parse HEAD'),
                describe: safeRun('git -C ' + JSON.stringify(path.resolve(dataDir, '..', '..')) + ' describe --tags --always'),
                statusShort: safeRun('git -C ' + JSON.stringify(path.resolve(dataDir, '..', '..')) + ' status --short'),
            },
            wgRaw: safeRun('wg show 2>&1 | head -40'),
            ipfsSwarmCount: (() => {
                const raw = safeRun('ipfs swarm peers 2>/dev/null | wc -l');
                const n = Number(raw.trim());
                return Number.isFinite(n) ? n : null;
            })(),
            recentLogs: tailRelevantLogs(),
            // T-1A liveProbes: user-initiated health checks. Run in parallel,
            // bounded by PROBE_TIMEOUT_MS each. None mutate state, none burn
            // Lit Action quota, none require auth headers (every endpoint
            // probed is either public or expected to 401 cleanly).
            liveProbes: {
                litConfig: litConfigProbe,
                supernodes: supernodeProbes,
                wasm: wasmProbes,
                updateChannel: updateChannelProbe,
            },
            warnings: [
                'Sanitisation is best-effort. Eyeball before pasting publicly.',
                'No data is uploaded by this endpoint. The response is yours alone.',
            ],
        };

        // Note dataDir age so we know whether the install is fresh or aged.
        try {
            const st = statSync(dataDir);
            (snapshot.pc2 as any).dataDirCreatedAt = st.birthtime?.toISOString?.() || null;
        } catch { /* ignore */ }

        res.json(snapshot);
    } catch (err: any) {
        logger.error('[Diagnose] Snapshot generation failed:', err);
        res.status(500).json({ error: 'diagnose_failed', message: sanitise(err?.message || 'unknown') });
    }
});

export default router;
