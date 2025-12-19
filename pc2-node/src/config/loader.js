import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_CONFIG_PATH = join(__dirname, '../../config/default.json');
const USER_CONFIG_PATH = join(__dirname, '../../config/config.json');
function loadDefaultConfig() {
    if (!existsSync(DEFAULT_CONFIG_PATH)) {
        throw new Error(`Default config not found: ${DEFAULT_CONFIG_PATH}`);
    }
    const content = readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
    return JSON.parse(content);
}
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
function validateConfig(config) {
    if (typeof config.server.port !== 'number' || config.server.port < 1 || config.server.port > 65535) {
        throw new Error('Invalid server.port: must be between 1 and 65535');
    }
    if (typeof config.server.host !== 'string') {
        throw new Error('Invalid server.host: must be a string');
    }
    if (config.owner.wallet_address !== null && typeof config.owner.wallet_address !== 'string') {
        throw new Error('Invalid owner.wallet_address: must be a string or null');
    }
    if (!Array.isArray(config.owner.tethered_wallets)) {
        throw new Error('Invalid owner.tethered_wallets: must be an array');
    }
    if (typeof config.storage.ipfs_repo_path !== 'string') {
        throw new Error('Invalid storage.ipfs_repo_path: must be a string');
    }
    if (typeof config.storage.database_path !== 'string') {
        throw new Error('Invalid storage.database_path: must be a string');
    }
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
export function loadConfig() {
    const defaultConfig = loadDefaultConfig();
    const userConfig = loadUserConfig();
    const mergedConfig = userConfig
        ? deepMerge(defaultConfig, userConfig)
        : defaultConfig;
    validateConfig(mergedConfig);
    return mergedConfig;
}
export function saveConfig(config) {
    const configDir = dirname(USER_CONFIG_PATH);
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }
    const existingConfig = loadUserConfig() || {};
    const mergedConfig = deepMerge(existingConfig, config);
    writeFileSync(USER_CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), 'utf8');
}
export function getConfigPath() {
    return USER_CONFIG_PATH;
}
//# sourceMappingURL=loader.js.map