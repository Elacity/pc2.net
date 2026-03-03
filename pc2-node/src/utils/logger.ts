/**
 * Logger Utility
 * 
 * Structured logging with levels and module prefixes.
 * Set LOG_LEVEL=DEBUG for verbose output, defaults to INFO.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const logLevel: LogLevel = process.env.LOG_LEVEL
  ? (LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO)
  : (process.env.PC2_DEBUG ? LogLevel.DEBUG : LogLevel.INFO);

function shouldLog(level: LogLevel): boolean {
  return level >= logLevel;
}

function formatPrefix(level: string, module?: string): string {
  const timestamp = new Date().toISOString();
  return module ? `[${timestamp}] [${level}] [${module}]` : `[${timestamp}] [${level}]`;
}

class Logger {
  private module?: string;

  constructor(module?: string) {
    this.module = module;
  }

  debug(...args: unknown[]): void {
    if (shouldLog(LogLevel.DEBUG)) console.log(formatPrefix('DEBUG', this.module), ...args);
  }

  info(...args: unknown[]): void {
    if (shouldLog(LogLevel.INFO)) console.log(formatPrefix('INFO', this.module), ...args);
  }

  warn(...args: unknown[]): void {
    if (shouldLog(LogLevel.WARN)) console.warn(formatPrefix('WARN', this.module), ...args);
  }

  error(...args: unknown[]): void {
    console.error(formatPrefix('ERROR', this.module), ...args);
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}

export const logger = new Logger();
