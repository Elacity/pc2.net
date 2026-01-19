/**
 * Configuration Loader
 *
 * Loads and validates configuration from config files
 * Merges user config (config.json) with defaults (default.json)
 */
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
}
/**
 * Load and merge configuration
 */
export declare function loadConfig(): Config;
/**
 * Save configuration to user config file
 */
export declare function saveConfig(config: Partial<Config>): void;
/**
 * Get configuration path
 */
export declare function getConfigPath(): string;
//# sourceMappingURL=loader.d.ts.map