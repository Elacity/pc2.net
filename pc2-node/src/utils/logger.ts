/**
 * Logger Utility
 * 
 * Simple logging system with levels and optional file output
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel;
  private isProduction: boolean;

  constructor(level: LogLevel = LogLevel.INFO, isProduction: boolean = false) {
    this.level = level;
    this.isProduction = isProduction;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (level >= this.level) {
      const formatted = this.formatMessage(levelName, message, ...args);
      if (level === LogLevel.ERROR) {
        console.error(formatted);
      } else if (level === LogLevel.WARN) {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', message, ...args);
  }
}

// Create singleton logger instance
const logLevel = process.env.LOG_LEVEL 
  ? (LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO)
  : LogLevel.INFO;

const isProduction = process.env.NODE_ENV === 'production';

export const logger = new Logger(logLevel, isProduction);
