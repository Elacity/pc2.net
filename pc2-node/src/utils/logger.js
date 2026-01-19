/**
 * Logger Utility
 *
 * Simple logging system with levels and optional file output
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
class Logger {
    level;
    isProduction;
    constructor(level = LogLevel.INFO, isProduction = false) {
        this.level = level;
        this.isProduction = isProduction;
    }
    setLevel(level) {
        this.level = level;
    }
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') : '';
        return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
    }
    log(level, levelName, message, ...args) {
        if (level >= this.level) {
            const formatted = this.formatMessage(levelName, message, ...args);
            if (level === LogLevel.ERROR) {
                console.error(formatted);
            }
            else if (level === LogLevel.WARN) {
                console.warn(formatted);
            }
            else {
                console.log(formatted);
            }
        }
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, 'INFO', message, ...args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, 'WARN', message, ...args);
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, 'ERROR', message, ...args);
    }
}
// Create singleton logger instance
const logLevel = process.env.LOG_LEVEL
    ? (LogLevel[process.env.LOG_LEVEL.toUpperCase()] ?? LogLevel.INFO)
    : LogLevel.INFO;
const isProduction = process.env.NODE_ENV === 'production';
export const logger = new Logger(logLevel, isProduction);
//# sourceMappingURL=logger.js.map