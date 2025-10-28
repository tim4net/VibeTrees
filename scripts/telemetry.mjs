/**
 * Telemetry system for VibeTrees (opt-in)
 *
 * Features:
 * - Anonymous usage tracking
 * - Error reporting with stack traces
 * - Performance metrics
 * - Usage patterns analysis
 * - Privacy-first design (no PII)
 * - Opt-in/opt-out via config
 */

import { writeFile, appendFile, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform, arch } from 'os';
import { createHash } from 'crypto';

export class Telemetry {
  constructor(config = {}) {
    this.enabled = config.enabled ?? false; // Opt-in by default
    this.telemetryDir = config.telemetryDir || join(homedir(), '.vibetrees', 'telemetry');
    this.sessionId = this._generateSessionId();
    this.installId = null;
    this.events = [];
    this.metrics = new Map();

    // Initialize install ID
    this._loadOrCreateInstallId();
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Load or create anonymous install ID
   */
  async _loadOrCreateInstallId() {
    try {
      await mkdir(this.telemetryDir, { recursive: true });

      const idPath = join(this.telemetryDir, 'install-id');

      if (existsSync(idPath)) {
        this.installId = await readFile(idPath, 'utf8');
      } else {
        // Create new anonymous ID (hash of random data)
        this.installId = createHash('sha256')
          .update(`${Date.now()}-${Math.random()}-${platform()}-${arch()}`)
          .digest('hex');
        await writeFile(idPath, this.installId);
      }
    } catch (error) {
      // Fail silently - telemetry should never break the app
      console.debug('Failed to load/create install ID:', error);
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Enable telemetry
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable telemetry
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Track an event
   */
  async trackEvent(eventName, properties = {}) {
    if (!this.enabled) {
      return;
    }

    const event = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      installId: this.installId,
      eventName,
      properties: this._sanitizeProperties(properties),
      platform: platform(),
      arch: arch(),
      nodeVersion: process.version
    };

    this.events.push(event);

    // Write to disk
    await this._writeEvent(event);
  }

  /**
   * Track an error
   */
  async trackError(error, context = {}) {
    if (!this.enabled) {
      return;
    }

    await this.trackEvent('error', {
      message: error.message,
      stack: this._sanitizeStack(error.stack),
      code: error.code,
      ...context
    });
  }

  /**
   * Track performance metric
   */
  async trackMetric(metricName, value, unit = 'ms') {
    if (!this.enabled) {
      return;
    }

    const metric = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      installId: this.installId,
      metricName,
      value,
      unit
    };

    // Store in memory for aggregation
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, []);
    }
    this.metrics.get(metricName).push(value);

    // Write to disk
    await this._writeMetric(metric);
  }

  /**
   * Start tracking operation duration
   */
  startTimer(operationName) {
    const startTime = Date.now();
    return {
      operationName,
      startTime,
      end: async () => {
        const duration = Date.now() - startTime;
        await this.trackMetric(operationName, duration, 'ms');
        return duration;
      }
    };
  }

  /**
   * Get metric statistics
   */
  getMetricStats(metricName) {
    const values = this.metrics.get(metricName) || [];

    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Get usage summary
   */
  getUsageSummary() {
    const summary = {
      sessionId: this.sessionId,
      installId: this.installId,
      eventCount: this.events.length,
      metrics: {}
    };

    for (const [name, values] of this.metrics) {
      summary.metrics[name] = this.getMetricStats(name);
    }

    return summary;
  }

  /**
   * Sanitize properties to remove PII
   */
  _sanitizeProperties(properties) {
    const sanitized = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip sensitive keys
      if (this._isSensitiveKey(key)) {
        continue;
      }

      // Sanitize values
      if (typeof value === 'string') {
        sanitized[key] = this._sanitizeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.length; // Just count, don't store contents
      } else if (value && typeof value === 'object') {
        sanitized[key] = Object.keys(value).length; // Just count keys
      }
    }

    return sanitized;
  }

  /**
   * Check if key is sensitive
   */
  _isSensitiveKey(key) {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /api[_-]?key/i,
      /auth/i,
      /credential/i,
      /email/i,
      /username/i,
      /user[_-]?id/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  /**
   * Sanitize string to remove potential PII
   */
  _sanitizeString(str) {
    // Remove absolute paths, replace with relative or placeholder
    let sanitized = str;

    // Replace user-specific paths with sanitized versions
    sanitized = sanitized.replace(/\/Users\/[^\/\s]+/g, '/Users/***');
    sanitized = sanitized.replace(/\/home\/[^\/\s]+/g, '/home/***');
    sanitized = sanitized.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\***');

    // After sanitizing user paths, replace .vibetrees and .worktrees paths
    sanitized = sanitized.replace(/\/Users\/\*\*\*\/[^\s]*\.vibetrees/g, '***/project/.vibetrees');
    sanitized = sanitized.replace(/\/Users\/\*\*\*\/[^\s]*\.worktrees/g, '***/project/.worktrees');
    sanitized = sanitized.replace(/\/home\/\*\*\*\/[^\s]*\.vibetrees/g, '***/project/.vibetrees');
    sanitized = sanitized.replace(/\/home\/\*\*\*\/[^\s]*\.worktrees/g, '***/project/.worktrees');

    // Remove potential email addresses
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***');

    // Remove IP addresses
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***.***.***.***');

    return sanitized;
  }

  /**
   * Sanitize stack trace
   */
  _sanitizeStack(stack) {
    if (!stack) {
      return null;
    }

    // Keep only the first 10 lines
    const lines = stack.split('\n').slice(0, 10);

    // Sanitize each line
    return lines.map(line => this._sanitizeString(line)).join('\n');
  }

  /**
   * Write event to disk
   */
  async _writeEvent(event) {
    try {
      await mkdir(this.telemetryDir, { recursive: true });
      const eventPath = join(this.telemetryDir, 'events.jsonl');
      await appendFile(eventPath, JSON.stringify(event) + '\n', 'utf8');
    } catch (error) {
      // Fail silently
      console.debug('Failed to write telemetry event:', error);
    }
  }

  /**
   * Write metric to disk
   */
  async _writeMetric(metric) {
    try {
      await mkdir(this.telemetryDir, { recursive: true });
      const metricPath = join(this.telemetryDir, 'metrics.jsonl');
      await appendFile(metricPath, JSON.stringify(metric) + '\n', 'utf8');
    } catch (error) {
      // Fail silently
      console.debug('Failed to write telemetry metric:', error);
    }
  }

  /**
   * Flush telemetry data (for graceful shutdown)
   */
  async flush() {
    if (!this.enabled) {
      return;
    }

    // Write final summary
    const summary = this.getUsageSummary();

    try {
      await mkdir(this.telemetryDir, { recursive: true });
      const summaryPath = join(this.telemetryDir, `session-${this.sessionId}.json`);
      await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    } catch (error) {
      // Fail silently
      console.debug('Failed to write telemetry summary:', error);
    }
  }
}

// Default telemetry instance
let defaultTelemetry = null;

/**
 * Get or create default telemetry instance
 */
export function getTelemetry(config = {}) {
  if (!defaultTelemetry) {
    // Check if telemetry is enabled via environment
    const enabled = process.env.VIBE_TELEMETRY === 'true' || config.enabled === true;

    defaultTelemetry = new Telemetry({
      enabled,
      ...config
    });
  }
  return defaultTelemetry;
}

/**
 * Reset default telemetry (useful for testing)
 */
export function resetTelemetry() {
  defaultTelemetry = null;
}

export default Telemetry;
