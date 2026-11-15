import { mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import type { WriteStream } from 'fs';
import path from 'path';
import morgan from 'morgan';

import __dirname from '../utils/dirname.ts';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  args: any[];
}

class LoggerService {
  private logDir: string;
  private currentLogFile: string | null = null;
  private writeStream: WriteStream | null = null;
  private isInitialized = false;

  constructor() {
    this.logDir = path.join(__dirname, '../../../logs');
    this.init();
  }

  private async init() {
    try {
      await mkdir(this.logDir, { recursive: true });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      throw error;
    }
  }

  private getFormattedDateTime(): string {
    return new Date().toISOString();
  }

  private getLogFileName(): string {
    const date = new Date();
    return `${date.toISOString().split('T')[0]}.log`;
  }

  private async ensureWriteStream() {
    if (!this.isInitialized) {
      await this.init();
    }

    const logFileName = this.getLogFileName();

    if (this.currentLogFile !== logFileName) {
      if (this.writeStream) {
        this.writeStream.end();
      }

      this.currentLogFile = logFileName;
      const logPath = path.join(this.logDir, logFileName);
      this.writeStream = createWriteStream(logPath, { flags: 'a' });
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const baseLog = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
    if (entry.args.length > 0) {
      return `${baseLog} ${entry.args.map((arg) => JSON.stringify(arg)).join(' ')}`;
    }
    return baseLog;
  }

  private async writeToFile(entry: LogEntry) {
    try {
      await this.ensureWriteStream();
      if (this.writeStream) {
        this.writeStream.write(this.formatLogEntry(entry) + '\n');
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  // Public logging methods
  async info(message: string, ...rest: any[]) {
    const entry: LogEntry = {
      timestamp: this.getFormattedDateTime(),
      level: 'INFO',
      message,
      args: rest,
    };
    console.log(`[${entry.timestamp}] [INFO] ${message}`);
    await this.writeToFile(entry);
  }

  async warn(message: string, ...rest: any[]) {
    const entry: LogEntry = {
      timestamp: this.getFormattedDateTime(),
      level: 'WARN',
      message,
      args: rest,
    };
    console.warn(`[${entry.timestamp}] \x1b[33m[WARN]\x1b[0m ${message}`);
    await this.writeToFile(entry);
  }

  async error(message: string, ...rest: any[]) {
    const entry: LogEntry = {
      timestamp: this.getFormattedDateTime(),
      level: 'ERROR',
      message,
      args: rest,
    };
    console.error(`[${entry.timestamp}] \x1b[31m[ERROR]\x1b[0m ${message}`, ...rest);
    await this.writeToFile(entry);
  }

  async debug(message: string, ...rest: any[]) {
    const entry: LogEntry = {
      timestamp: this.getFormattedDateTime(),
      level: 'DEBUG',
      message,
      args: rest,
    };
    console.debug(`[${entry.timestamp}] \x1b[32m[DEBUG]\x1b[0m ${message}`, ...rest);
    await this.writeToFile(entry);
  }

  // Cleanup method
  async cleanup() {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

// Create singleton instance
const loggerService = new LoggerService();

// HTTP request logger middleware
export const httpLogger = morgan((tokens, req, res) => {
  const userId = req.session?.user?.id ? `[User:${req.session.user.id}]` : '[Unauthenticated]';
  const organizationId = req.session?.organizationId ? `[Organization:${req.session.organizationId}]` : '';
  const logMessage = [tokens.method(req, res), tokens.url(req, res), tokens.status(req, res), tokens['response-time'](req, res), 'ms'].join(
    ' '
  );

  loggerService.info(`HTTP ${userId}${organizationId} ${logMessage}`);
  return logMessage;
});

// Export the logger instance
export default loggerService;
