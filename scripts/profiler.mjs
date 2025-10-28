import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

export class Profiler {
  constructor() {
    this._operations = new Map();
    this._results = new Map();
    this._aggregates = new Map();
  }

  /**
   * Start timing an operation
   * @param {string} name - Operation name
   * @param {string} parentId - Optional parent operation ID
   * @returns {string} Operation ID
   */
  start(name, parentId = null) {
    const id = randomUUID();

    this._operations.set(id, {
      id,
      name,
      parentId,
      startTime: performance.now(),
      children: []
    });

    // Add to parent's children if specified
    if (parentId && this._operations.has(parentId)) {
      this._operations.get(parentId).children.push(id);
    }

    return id;
  }

  /**
   * Check if operation is currently running
   * @param {string} operationId - Operation ID
   * @returns {boolean}
   */
  isRunning(operationId) {
    return this._operations.has(operationId);
  }

  /**
   * End timing an operation
   * @param {string} operationId - Operation ID
   * @returns {object} Operation result
   */
  end(operationId) {
    const operation = this._operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    const endTime = performance.now();
    const duration = endTime - operation.startTime;

    const result = {
      id: operation.id,
      name: operation.name,
      duration,
      startTime: operation.startTime,
      endTime,
      children: operation.children.map(childId => this._results.get(childId)).filter(Boolean)
    };

    this._results.set(operationId, result);
    this._operations.delete(operationId);

    // Update aggregates
    if (!this._aggregates.has(operation.name)) {
      this._aggregates.set(operation.name, []);
    }
    this._aggregates.get(operation.name).push(duration);

    return result;
  }

  /**
   * Get result for completed operation
   * @param {string} operationId - Operation ID
   * @returns {object|undefined} Operation result
   */
  getResult(operationId) {
    return this._results.get(operationId);
  }

  /**
   * Get aggregated statistics for operation name
   * @param {string} name - Operation name
   * @returns {object} Statistics
   */
  getStats(name) {
    const durations = this._aggregates.get(name) || [];

    if (durations.length === 0) {
      return null;
    }

    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    return {
      name,
      count: durations.length,
      avg,
      min,
      max,
      total: sum
    };
  }

  /**
   * Generate summary report
   * @returns {object} Report with all operations
   */
  generateReport() {
    const operations = [];
    let totalDuration = 0;

    for (const [name, durations] of this._aggregates) {
      const stats = this.getStats(name);
      operations.push(stats);
      totalDuration += stats.total;
    }

    return {
      operations: operations.sort((a, b) => b.total - a.total),
      totalDuration
    };
  }
}
