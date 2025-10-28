/**
 * Performance Utilities
 *
 * Provides caching, batching, and instrumentation utilities for performance optimization
 */

/**
 * Simple TTL cache with LRU eviction
 */
export class TTLCache {
  constructor(ttlMs = 3000, maxSize = 100) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value) {
    const entry = {
      value,
      timestamp: Date.now()
    };

    // LRU: delete oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, entry);
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

/**
 * Batches multiple calls into a single execution
 * Useful for batching WebSocket broadcasts
 */
export class MessageBatcher {
  constructor(flushIntervalMs = 100) {
    this.flushIntervalMs = flushIntervalMs;
    this.queue = [];
    this.timer = null;
  }

  add(message) {
    this.queue.push(message);

    // Start flush timer if not already running
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  flush() {
    if (this.queue.length === 0) {
      this.timer = null;
      return;
    }

    const batch = [...this.queue];
    this.queue = [];
    this.timer = null;

    return batch;
  }

  size() {
    return this.queue.length;
  }
}

/**
 * Debounces function calls to limit execution frequency
 */
export class Debouncer {
  constructor(delayMs = 200) {
    this.delayMs = delayMs;
    this.timers = new Map();
  }

  debounce(key, fn) {
    // Clear existing timer for this key
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, this.delayMs);

    this.timers.set(key, timer);
  }

  cancel(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  cancelAll() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  constructor(maxPerSecond = 5) {
    this.maxPerSecond = maxPerSecond;
    this.tokens = maxPerSecond;
    this.lastRefill = Date.now();
  }

  tryAcquire() {
    this._refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  _refillTokens() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = (timePassed / 1000) * this.maxPerSecond;

    this.tokens = Math.min(this.maxPerSecond, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  reset() {
    this.tokens = this.maxPerSecond;
    this.lastRefill = Date.now();
  }
}

/**
 * Performance metrics collector
 */
export class PerformanceMetrics {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a timing metric
   */
  recordTiming(operation, durationMs) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalMs: 0,
        minMs: Infinity,
        maxMs: -Infinity,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        samples: []
      });
    }

    const metric = this.metrics.get(operation);
    metric.count++;
    metric.totalMs += durationMs;
    metric.minMs = Math.min(metric.minMs, durationMs);
    metric.maxMs = Math.max(metric.maxMs, durationMs);

    // Keep last 1000 samples for percentile calculation
    metric.samples.push(durationMs);
    if (metric.samples.length > 1000) {
      metric.samples.shift();
    }

    // Update percentiles
    const sorted = [...metric.samples].sort((a, b) => a - b);
    metric.p50Ms = sorted[Math.floor(sorted.length * 0.5)] || 0;
    metric.p95Ms = sorted[Math.floor(sorted.length * 0.95)] || 0;
    metric.p99Ms = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  /**
   * Get metrics for an operation
   */
  getMetrics(operation) {
    const metric = this.metrics.get(operation);
    if (!metric) {
      return null;
    }

    return {
      operation,
      count: metric.count,
      avgMs: metric.count > 0 ? metric.totalMs / metric.count : 0,
      minMs: metric.minMs === Infinity ? 0 : metric.minMs,
      maxMs: metric.maxMs === -Infinity ? 0 : metric.maxMs,
      p50Ms: metric.p50Ms,
      p95Ms: metric.p95Ms,
      p99Ms: metric.p99Ms
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const results = [];
    for (const operation of this.metrics.keys()) {
      results.push(this.getMetrics(operation));
    }
    return results;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }
}

/**
 * Timer wrapper for easy metric recording
 */
export class Timer {
  constructor(metrics, operation) {
    this.metrics = metrics;
    this.operation = operation;
    this.startTime = performance.now();
  }

  stop() {
    const duration = performance.now() - this.startTime;
    this.metrics.recordTiming(this.operation, duration);
    return duration;
  }
}

/**
 * Async operation with timeout
 */
export async function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
}

/**
 * Memoize async function results
 */
export function memoizeAsync(fn, keyFn = (...args) => JSON.stringify(args), ttlMs = 3000) {
  const cache = new TTLCache(ttlMs);

  return async function(...args) {
    const key = keyFn(...args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}
