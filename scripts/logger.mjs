/**
 * Structured logging system for VibeTrees
 *
 * Features:
 * - Standard log levels (DEBUG, INFO, WARN, ERROR, FATAL)
 * - JSON and text output formats
 * - Multiple output destinations (console, file)
 * - Log rotation (keep last 7 days, max 100MB)
 * - Contextual metadata (timestamp, worktree, operation, user)
 * - Separate log files (app.log, error.log, access.log)
 */

import { writeFile, appendFile, mkdir, readdir, stat, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

export class Logger {
  constructor(config = {}) {
    this.level = LOG_LEVELS[config.level?.toUpperCase()] ?? LOG_LEVELS.INFO;
    this.format = config.format || 'json'; // 'json' or 'text'
    this.outputs = config.outputs || ['console']; // ['console', 'file']
    this.logDir = config.logDir || join(homedir(), '.vibetrees', 'logs');
    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB
    this.maxAge = config.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.context = config.context || {}; // Global context (e.g., { service: 'web-server' })

    // Ensure log directory exists
    this._ensureLogDir();
  }

  /**
   * Ensure log directory exists
   */
  async _ensureLogDir() {
    if (!existsSync(this.logDir)) {
      await mkdir(this.logDir, { recursive: true });
    }
  }

  /**
   * Get log file path by type
   */
  _getLogPath(type = 'app') {
    return join(this.logDir, `${type}.log`);
  }

  /**
   * Format log entry
   */
  _format(level, message, metadata = {}) {
    const levelName = LOG_LEVEL_NAMES[level];
    const entry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message,
      ...this.context,
      ...metadata
    };

    if (this.format === 'json') {
      return JSON.stringify(entry);
    }

    // Text format: [2025-10-28T10:30:45.123Z] INFO: message {metadata}
    const metaStr = Object.keys(metadata).length > 0
      ? ` ${JSON.stringify(metadata)}`
      : '';
    return `[${entry.timestamp}] ${levelName}: ${message}${metaStr}`;
  }

  /**
   * Write to console
   */
  _writeConsole(level, formatted) {
    const levelName = LOG_LEVEL_NAMES[level];

    if (level >= LOG_LEVELS.ERROR) {
      console.error(formatted);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Write to file
   */
  async _writeFile(formatted, type = 'app') {
    try {
      await this._ensureLogDir();
      const logPath = this._getLogPath(type);
      await appendFile(logPath, formatted + '\n', 'utf8');

      // Check for rotation
      await this._rotateIfNeeded(type);
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log files if needed
   */
  async _rotateIfNeeded(type = 'app') {
    try {
      const logPath = this._getLogPath(type);

      if (!existsSync(logPath)) {
        return;
      }

      const stats = await stat(logPath);

      // Rotate by size
      if (stats.size > this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = join(this.logDir, `${type}.${timestamp}.log`);
        await writeFile(rotatedPath, await readFile(logPath));
        await writeFile(logPath, ''); // Clear current log
      }

      // Clean old logs
      await this._cleanOldLogs(type);
    } catch (error) {
      console.error('Failed to rotate log:', error);
    }
  }

  /**
   * Clean old log files
   */
  async _cleanOldLogs(type = 'app') {
    try {
      const files = await readdir(this.logDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith(`${type}.`) || !file.endsWith('.log')) {
          continue;
        }

        const filePath = join(this.logDir, file);
        const stats = await stat(filePath);

        if (now - stats.mtime.getTime() > this.maxAge) {
          await unlink(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to clean old logs:', error);
    }
  }

  /**
   * Log a message at specified level
   */
  async log(level, message, metadata = {}) {
    if (level < this.level) {
      return; // Skip if below configured level
    }

    const formatted = this._format(level, message, metadata);

    // Write to configured outputs
    for (const output of this.outputs) {
      if (output === 'console') {
        this._writeConsole(level, formatted);
      } else if (output === 'file') {
        // Write errors to separate error.log
        const logType = level >= LOG_LEVELS.ERROR ? 'error' : 'app';
        await this._writeFile(formatted, logType);
      }
    }
  }

  /**
   * Convenience methods for each log level
   */
  async debug(message, metadata = {}) {
    return this.log(LOG_LEVELS.DEBUG, message, metadata);
  }

  async info(message, metadata = {}) {
    return this.log(LOG_LEVELS.INFO, message, metadata);
  }

  async warn(message, metadata = {}) {
    return this.log(LOG_LEVELS.WARN, message, metadata);
  }

  async error(message, metadata = {}) {
    return this.log(LOG_LEVELS.ERROR, message, metadata);
  }

  async fatal(message, metadata = {}) {
    return this.log(LOG_LEVELS.FATAL, message, metadata);
  }

  /**
   * Log HTTP access (for access.log)
   */
  async access(req, res, duration) {
    const entry = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    const formatted = this._format(LOG_LEVELS.INFO, 'HTTP Request', entry);

    if (this.outputs.includes('console')) {
      this._writeConsole(LOG_LEVELS.INFO, formatted);
    }

    if (this.outputs.includes('file')) {
      await this._writeFile(formatted, 'access');
    }
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext = {}) {
    return new Logger({
      level: LOG_LEVEL_NAMES[this.level],
      format: this.format,
      outputs: this.outputs,
      logDir: this.logDir,
      maxFileSize: this.maxFileSize,
      maxAge: this.maxAge,
      context: {
        ...this.context,
        ...additionalContext
      }
    });
  }

  /**
   * Flush all logs (for graceful shutdown)
   */
  async flush() {
    // In a real implementation with buffering, this would flush buffers
    // For now, it's a no-op since we write immediately
    return Promise.resolve();
  }
}

// Default logger instance
let defaultLogger = null;

/**
 * Get or create default logger instance
 */
export function getLogger(config = {}) {
  if (!defaultLogger) {
    // Load config from environment or use defaults
    const logLevel = process.env.LOG_LEVEL || 'INFO';
    const logFormat = process.env.LOG_FORMAT || 'json';
    const logOutputs = process.env.LOG_OUTPUTS
      ? process.env.LOG_OUTPUTS.split(',')
      : ['console', 'file'];

    defaultLogger = new Logger({
      level: logLevel,
      format: logFormat,
      outputs: logOutputs,
      ...config
    });
  }
  return defaultLogger;
}

/**
 * Reset default logger (useful for testing)
 */
export function resetLogger() {
  defaultLogger = null;
}

export default Logger;
