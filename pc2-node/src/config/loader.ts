/**
 * Configuration Loader
 *
 * Loads and validates configuration from config files
 * Merges user config (config.json) with defaults (default.json)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('config');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Config {
    server: {
        port: number;
        host: string;
    };
    owner: {
        wallet_address: string | null;
        tethered_wallets: string[];
    };
    storage: {
        ipfs_repo_path: string;
        database_path: string;
    };
    security: {
        session_duration_days: number;
        rate_limit_window_ms: number;
        rate_limit_max_requests: number;
        /**
     * SEC-3a (2026-04 audit): kill-switch for SIWE wallet-control proof on
     * /auth/particle and /api/access/claim-ownership. Default false for
     * zero-risk rollout — when false the server still issues challenges
     * and accepts signatures (so client can be deployed first), but does
     * NOT reject requests that lack them. Flip to true after the GUI
     * change is deployed and verified.
     */
        siweRequired?: boolean;
    };
    boson?: {
        enabled?: boolean;
        gateway_url?: string;
        public_domain?: string;
        auto_connect?: boolean;
        privacy_mode?: boolean;
        stealth_mode?: boolean;
        amnezia_wg?: {
            enabled?: boolean;
            auto_fallback?: boolean;
        };
        vless_reality?: {
            enabled?: boolean;
            auto_fallback?: boolean;
        };
        supernodes?: Array<{
            id: string;
            address: string;
            port: number;
            proxyPort: number;
            gatewayUrl: string;
        }>;
    };
    ai?: {
        enabled?: boolean;
        defaultProvider?: string;
        providers?: {
            ollama?: {
                enabled?: boolean;
                baseUrl?: string;
                defaultModel?: string;
            };
            openai?: {
                enabled?: boolean;
                apiKey?: string;
            };
            claude?: {
                enabled?: boolean;
                apiKey?: string;
            };
        };
    };
    resources?: {
        storage?: {
            limit?: string | number; // "auto", "10GB", "100GB", "unlimited", or bytes
            reserve_free_space?: string; // "10GB" - space to keep free
        };
        compute?: {
            max_cpu_percent?: number; // 0-100, default 80
            max_memory_mb?: string | number; // "auto" or MB value
            max_concurrent_wasm?: number; // Max parallel WASM executions
            wasm_timeout_ms?: number; // WASM execution timeout
        };
        network?: {
            max_upload_mbps?: string | number; // "unlimited" or Mbps
            max_download_mbps?: string | number;
            max_connections?: number;
        };
    };
    seeding?: {
        enabled?: boolean; // Master toggle (default: true)
        auto_pin_purchases?: boolean; // Auto-pin after marketplace buy (default: true)
        disk_quota_percent?: number; // Hard cap on disk used-% (default: 95)
        min_free_bytes?: number; // Absolute free-byte floor before pausing pins (default: 2 GB)
        max_concurrent_pins?: number; // Parallel pin downloads (default: 3)
        max_upload_mbps?: number; // Bandwidth cap for serving, 0 = unlimited (default: 0)
        announce_hot_interval_hours?: number; // Re-announce cadence for hot content (default: 2)
        announce_warm_interval_hours?: number; // Re-announce cadence for warm content (default: 6)
        announce_cold_interval_hours?: number; // Re-announce cadence for cold content (default: 12)
    };
    blockchain?: {
        chain_id?: number; // Base chain ID (default: 8453)
        chain_name?: string; // Chain name for Lit/wallet operations (default: "base")
        rpc_urls?: string[]; // Shared Base RPC pool with failover
        // Optional: a publicly-reachable URL that points at THIS node's
        // `/api/rpc/base` proxy. When set, the media-encode pipeline and
        // the non-media Lit-encrypt path embed this URL into PSSH/access
        // metadata so the Lit Action's on-chain access check goes through
        // our caching, multi-RPC failover proxy instead of a single
        // public RPC. Leave unset for nodes behind NAT — the existing
        // public-RPC fallback continues to work in that case.
        // Example for a public node: "https://try.pc2.net/api/rpc/base".
        // See `.cursor/tasks/RPC-PROXY-UNIFICATION-2026-05` for the
        // full design rationale and the incident that motivated it.
        public_proxy_url?: string;
        // Optional: how long (ms) an RPC URL is sidelined after a 5xx
        // / quota / rate-limit error. While sidelined, both the
        // `/api/rpc/base` proxy and the server-side `baseRpcCall` skip
        // it on subsequent requests instead of wasting their first
        // attempt on a known-failing upstream. Default: 60000 (60 s).
        // Lower = faster retry of a recovering RPC. Higher = less load
        // on a struggling RPC. Per Irzhy's design note: "ensure
        // auto-rotate when constantly receiving 5xx error family".
        rpc_unhealthy_cooldown_ms?: number;
    };
    content_indexer?: {
        enabled?: boolean; // Master toggle (default: true)
        scan_interval_minutes?: number; // How often to scan for new content (default: 30)
        rpc_urls?: string[]; // Base RPC endpoints with fallback
        max_blocks_per_scan?: number; // Block range per eth_getLogs call (default: 10000)
        metadata_fetch_concurrency?: number; // Parallel IPFS metadata fetches (default: 3)
        metadata_gateway_urls?: string[]; // IPFS gateways for metadata resolution
        contracts?: Record<string, { // Versioned contract config (key = version e.g. "v3")
            channel_factory?: string;
            central_storage?: string;
            authority_gateway?: string;
            event_hub?: string;
            from_block?: number;
            channel_core?: string; // V2 compat alias for channel_factory
            core_storage?: string; // V2 compat alias for central_storage
        }>;
    };
}

const DEFAULT_CONFIG_PATH = join(__dirname, '../../config/default.json');
const USER_CONFIG_PATH = join(__dirname, '../../config/config.json');

/**
 * Load default configuration
 */
function loadDefaultConfig (): Config {
    if ( ! existsSync(DEFAULT_CONFIG_PATH) ) {
        throw new Error(`Default config not found: ${DEFAULT_CONFIG_PATH}`);
    }

    const content = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
    return JSON.parse(content) as Config;
}

/**
 * Load user configuration (if exists)
 */
function loadUserConfig (): Partial<Config> | null {
    if ( ! existsSync(USER_CONFIG_PATH) ) {
        return null;
    }

    try {
        const content = readFileSync(USER_CONFIG_PATH, 'utf8');
        return JSON.parse(content) as Partial<Config>;
    } catch ( error ) {
        log.warn(`Failed to load user config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        log.warn('Using default configuration only');
        return null;
    }
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>> (target: T, source: Partial<T>): T {
    const result = { ...target };

    for ( const key in source ) {
        if ( source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ) {
            result[key] = deepMerge(result[key] || {} as any, source[key] as any);
        } else if ( source[key] !== undefined ) {
            result[key] = source[key] as T[Extract<keyof T, string>];
        }
    }

    return result;
}

/**
 * Validate configuration
 */
function validateConfig (config: Config): void {
    // Validate server config
    if ( typeof config.server.port !== 'number' || config.server.port < 1 || config.server.port > 65535 ) {
        throw new Error('Invalid server.port: must be between 1 and 65535');
    }

    if ( typeof config.server.host !== 'string' ) {
        throw new Error('Invalid server.host: must be a string');
    }

    // Validate owner config
    if ( config.owner.wallet_address !== null && typeof config.owner.wallet_address !== 'string' ) {
        throw new Error('Invalid owner.wallet_address: must be a string or null');
    }

    if ( ! Array.isArray(config.owner.tethered_wallets) ) {
        throw new Error('Invalid owner.tethered_wallets: must be an array');
    }

    // Validate storage config
    if ( typeof config.storage.ipfs_repo_path !== 'string' ) {
        throw new Error('Invalid storage.ipfs_repo_path: must be a string');
    }

    if ( typeof config.storage.database_path !== 'string' ) {
        throw new Error('Invalid storage.database_path: must be a string');
    }

    // Validate security config
    if ( typeof config.security.session_duration_days !== 'number' || config.security.session_duration_days < 1 ) {
        throw new Error('Invalid security.session_duration_days: must be a positive number');
    }

    if ( typeof config.security.rate_limit_window_ms !== 'number' || config.security.rate_limit_window_ms < 1 ) {
        throw new Error('Invalid security.rate_limit_window_ms: must be a positive number');
    }

    if ( typeof config.security.rate_limit_max_requests !== 'number' || config.security.rate_limit_max_requests < 1 ) {
        throw new Error('Invalid security.rate_limit_max_requests: must be a positive number');
    }
}

/**
 * Load and merge configuration
 */
export function loadConfig (): Config {
    // Load default config
    const defaultConfig = loadDefaultConfig();

    // Load user config (if exists)
    const userConfig = loadUserConfig();

    // Merge configs (user config overrides defaults)
    const mergedConfig = userConfig
        ? deepMerge(defaultConfig, userConfig)
        : defaultConfig;

    // Validate merged config
    validateConfig(mergedConfig);

    return mergedConfig;
}

/**
 * Save configuration to user config file
 */
export function saveConfig (config: Partial<Config>): void {
    // Ensure config directory exists
    const configDir = dirname(USER_CONFIG_PATH);
    if ( ! existsSync(configDir) ) {
        mkdirSync(configDir, { recursive: true });
    }

    // Load existing user config (if any)
    const existingConfig = loadUserConfig() || {};

    // Merge with new config
    const mergedConfig = deepMerge(existingConfig, config);

    // Write to file
    writeFileSync(USER_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf8');
}

/**
 * Get configuration path
 */
export function getConfigPath (): string {
    return USER_CONFIG_PATH;
}
