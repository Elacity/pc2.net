/**
 * @fileoverview Production-safe logging utility for wallet operations.
 * Logs are only output in development mode to prevent console pollution.
 * 
 * @module helpers/logger
 */

/**
 * Check if we're in development mode
 * @returns {boolean}
 */
const isDev = () => {
    // Check various indicators of development mode
    return (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.localhost') ||
        window.location.port === '4100' ||
        window.DEBUG_MODE === true
    );
};

/**
 * Format log prefix with timestamp
 * @param {string} module - Module name
 * @returns {string}
 */
const formatPrefix = (module) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    return `[${timestamp}] [${module}]`;
};

/**
 * Create a scoped logger for a specific module
 * @param {string} moduleName - Name of the module (e.g., 'WalletService', 'UIAccountSidebar')
 * @returns {Object} Logger instance with log, warn, error, debug methods
 */
export const createLogger = (moduleName) => {
    const prefix = `[${moduleName}]`;
    
    return {
        /**
         * Log informational message (dev only)
         * @param {...any} args - Arguments to log
         */
        log: (...args) => {
            if (isDev()) {
                console.log(prefix, ...args);
            }
        },
        
        /**
         * Log warning message (dev only)
         * @param {...any} args - Arguments to log
         */
        warn: (...args) => {
            if (isDev()) {
                console.warn(prefix, ...args);
            }
        },
        
        /**
         * Log error message (always logged - errors are important)
         * @param {...any} args - Arguments to log
         */
        error: (...args) => {
            // Always log errors, even in production
            console.error(prefix, ...args);
        },
        
        /**
         * Log debug message (dev only, more verbose)
         * @param {...any} args - Arguments to log
         */
        debug: (...args) => {
            if (isDev() && window.DEBUG_MODE) {
                console.debug(prefix, ...args);
            }
        },
        
        /**
         * Log with custom formatting (dev only)
         * @param {string} label - Label for the group
         * @param {Object} data - Data to log
         */
        table: (label, data) => {
            if (isDev()) {
                console.group(prefix + ' ' + label);
                console.table(data);
                console.groupEnd();
            }
        },
        
        /**
         * Time a operation (dev only)
         * @param {string} label - Label for the timer
         * @returns {Function} Function to call when operation completes
         */
        time: (label) => {
            if (isDev()) {
                const timerLabel = `${prefix} ${label}`;
                console.time(timerLabel);
                return () => console.timeEnd(timerLabel);
            }
            return () => {}; // No-op in production
        }
    };
};

/**
 * Default wallet logger instance
 * @type {Object}
 */
export const walletLogger = createLogger('Wallet');

/**
 * Default UI logger instance  
 * @type {Object}
 */
export const uiLogger = createLogger('UI');

export default createLogger;

