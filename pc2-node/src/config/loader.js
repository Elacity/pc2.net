/**
 * Configuration Loader
 *
 * Loads and validates configuration from config files
 * Merges user config (config.json) with defaults (default.json)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_CONFIG_PATH = join(__dirname, '../../config/default.json');
const USER_CONFIG_PATH = join(__dirname, '../../config/config.json');
/**
 * Load default configuration
 */
function loadDefaultConfig() {
    if (!existsSync(DEFAULT_CONFIG_PATH)) {
        throw new Error(`Default config not found: ${DEFAULT_CONFIG_PATH}`);
    }
    const content = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
    return JSON.parse(content);
}
/**
 * Load user configuration (if exists)
 */
function loadUserConfig() {
    if (!existsSync(USER_CONFIG_PATH)) {
        return null;
    }
    try {
        const content = readFileSync(USER_CONFIG_PATH, 'utf8');
        return JSON.parse(content);
    }
    catch (error) {
        console.warn(`⚠️  Failed to load user config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.warn(`   Using default configuration only`);
        return null;
    }
}
/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        }
        else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}
/**
 * Validate configuration
 */
function validateConfig(config) {
    // Validate server config
    if (typeof config.server.port !== 'number' || config.server.port < 1 || config.server.port > 65535) {
        throw new Error('Invalid server.port: must be between 1 and 65535');
    }
    if (typeof config.server.host !== 'string') {
        throw new Error('Invalid server.host: must be a string');
    }
    // Validate owner config
    if (config.owner.wallet_address !== null && typeof config.owner.wallet_address !== 'string') {
        throw new Error('Invalid owner.wallet_address: must be a string or null');
    }
    if (!Array.isArray(config.owner.tethered_wallets)) {
        throw new Error('Invalid owner.tethered_wallets: must be an array');
    }
    // Validate storage config
    if (typeof config.storage.ipfs_repo_path !== 'string') {
        throw new Error('Invalid storage.ipfs_repo_path: must be a string');
    }
    if (typeof config.storage.database_path !== 'string') {
        throw new Error('Invalid storage.database_path: must be a string');
    }
    // Validate security config
    if (typeof config.security.session_duration_days !== 'number' || config.security.session_duration_days < 1) {
        throw new Error('Invalid security.session_duration_days: must be a positive number');
    }
    if (typeof config.security.rate_limit_window_ms !== 'number' || config.security.rate_limit_window_ms < 1) {
        throw new Error('Invalid security.rate_limit_window_ms: must be a positive number');
    }
    if (typeof config.security.rate_limit_max_requests !== 'number' || config.security.rate_limit_max_requests < 1) {
        throw new Error('Invalid security.rate_limit_max_requests: must be a positive number');
    }
}
/**
 * Load and merge configuration
 */
export function loadConfig() {
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
export function saveConfig(config) {
    // Ensure config directory exists
    const configDir = dirname(USER_CONFIG_PATH);
    if (!existsSync(configDir)) {
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
export function getConfigPath() {
    return USER_CONFIG_PATH;
}
//# sourceMappingURL=loader.js.map