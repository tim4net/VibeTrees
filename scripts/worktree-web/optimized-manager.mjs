/**
 * Optimized Worktree Manager
 *
 * Performance optimizations:
 * - Caches Docker status for 2-3 seconds
 * - Batches WebSocket broadcasts
 * - Debounces progress updates
 * - Records performance metrics
 */

import { execSync } from 'child_process';
import { basename } from 'path';
import {
  TTLCache,
  MessageBatcher,
  Debouncer,
  RateLimiter,
  PerformanceMetrics,
  Timer
} from '../performance-utils.mjs';

export class OptimizedWorktreeManager {
  constructor(baseManager) {
    // Wrap existing manager
    this.baseManager = baseManager;

    // Performance utilities
    this.dockerStatusCache = new TTLCache(2000, 100); // 2s TTL
    this.gitStatusCache = new TTLCache(3000, 100); // 3s TTL
    this.messageBatcher = new MessageBatcher(100); // 100ms batching
    this.progressDebouncer = new Debouncer(200); // 200ms debounce
    this.broadcastLimiter = new RateLimiter(10); // 10/sec per worktree
    this.metrics = new PerformanceMetrics();

    // Start batch flushing
    this._startBatchFlush();
  }

  /**
   * Start periodic batch flushing
   * @private
   */
  _startBatchFlush() {
    this.flushInterval = setInterval(() => {
      const batch = this.messageBatcher.flush();
      if (batch && batch.length > 0) {
        this._broadcastBatch(batch);
      }
    }, 100);
  }

  /**
   * Broadcast a batch of messages
   * @private
   */
  _broadcastBatch(batch) {
    // Group by client for efficiency
    const clientMessages = new Map();

    for (const { event, data } of batch) {
      this.baseManager.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          if (!clientMessages.has(client)) {
            clientMessages.set(client, []);
          }
          clientMessages.get(client).push({ event, data });
        }
      });
    }

    // Send batched messages
    clientMessages.forEach((messages, client) => {
      try {
        client.send(JSON.stringify({ type: 'batch', messages }));
      } catch (error) {
        console.error('Failed to send batch:', error.message);
      }
    });
  }

  /**
   * Optimized broadcast with batching
   */
  broadcast(event, data) {
    // Add to batch instead of sending immediately
    this.messageBatcher.add({ event, data });
  }

  /**
   * Debounced progress broadcast
   */
  broadcastProgress(worktreeName, event, data) {
    const key = `${worktreeName}:${event}`;

    // Rate limit per worktree
    if (!this.broadcastLimiter.tryAcquire()) {
      // Queued for next batch
      return;
    }

    // Debounce to avoid overwhelming WebSocket
    this.progressDebouncer.debounce(key, () => {
      this.broadcast(event, data);
    });
  }

  /**
   * Get Docker status with caching
   */
  getDockerStatus(worktreePath, worktreeName) {
    const timer = new Timer(this.metrics, 'getDockerStatus');

    const cacheKey = `docker:${worktreePath}`;

    // Check cache first
    const cached = this.dockerStatusCache.get(cacheKey);
    if (cached) {
      timer.stop();
      return cached;
    }

    // Cache miss: fetch status
    const status = this.baseManager.getDockerStatus(worktreePath, worktreeName);

    // Cache result
    this.dockerStatusCache.set(cacheKey, status);

    timer.stop();
    return status;
  }

  /**
   * Get Git status with caching
   */
  getGitStatus(worktreePath) {
    const timer = new Timer(this.metrics, 'getGitStatus');

    const cacheKey = `git:${worktreePath}`;

    // Check cache first
    const cached = this.gitStatusCache.get(cacheKey);
    if (cached) {
      timer.stop();
      return cached;
    }

    // Cache miss: fetch status
    const status = this.baseManager.getGitStatus(worktreePath);

    // Cache result
    this.gitStatusCache.set(cacheKey, status);

    timer.stop();
    return status;
  }

  /**
   * Invalidate caches for a worktree
   */
  invalidateCache(worktreePath) {
    this.dockerStatusCache.invalidate(`docker:${worktreePath}`);
    this.gitStatusCache.invalidate(`git:${worktreePath}`);
  }

  /**
   * Optimized listWorktrees with caching
   */
  listWorktrees() {
    const timer = new Timer(this.metrics, 'listWorktrees');

    try {
      const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
      const worktrees = [];
      const lines = output.split('\n');
      let current = {};

      // Parse git output
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch '.length).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path) {
            current.name = basename(current.path);
            current.ports = this.baseManager.portRegistry.getWorktreePorts(current.name);

            // Use cached status getters
            current.dockerStatus = this.getDockerStatus(current.path, current.name);
            current.gitStatus = this.getGitStatus(current.path);

            worktrees.push(current);
            current = {};
          }
        }
      }

      // Handle last worktree
      if (current.path) {
        current.name = basename(current.path);
        current.ports = this.baseManager.portRegistry.getWorktreePorts(current.name);
        current.dockerStatus = this.getDockerStatus(current.path, current.name);
        current.gitStatus = this.getGitStatus(current.path);
        worktrees.push(current);
      }

      timer.stop();
      return worktrees;
    } catch (error) {
      console.error('Failed to list worktrees:', error.message);
      timer.stop();
      return [];
    }
  }

  /**
   * Wrap service operations to invalidate cache
   */
  async startServices(worktreeName) {
    const timer = new Timer(this.metrics, 'startServices');

    const result = await this.baseManager.startServices(worktreeName);

    // Invalidate docker status cache
    const worktrees = this.baseManager.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);
    if (worktree) {
      this.invalidateCache(worktree.path);
    }

    timer.stop();
    return result;
  }

  async stopServices(worktreeName) {
    const timer = new Timer(this.metrics, 'stopServices');

    const result = await this.baseManager.stopServices(worktreeName);

    // Invalidate docker status cache
    const worktrees = this.baseManager.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);
    if (worktree) {
      this.invalidateCache(worktree.path);
    }

    timer.stop();
    return result;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.metrics.getAllMetrics();
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.progressDebouncer.cancelAll();
  }

  // Proxy all other methods to base manager
  createWorktree(...args) {
    return this.baseManager.createWorktree(...args);
  }

  deleteWorktree(...args) {
    return this.baseManager.deleteWorktree(...args);
  }

  checkUpdates(...args) {
    return this.baseManager.checkUpdates(...args);
  }

  syncWorktree(...args) {
    return this.baseManager.syncWorktree(...args);
  }

  analyzeChanges(...args) {
    return this.baseManager.analyzeChanges(...args);
  }

  rollbackWorktree(...args) {
    return this.baseManager.rollbackWorktree(...args);
  }

  performSmartReload(...args) {
    return this.baseManager.performSmartReload(...args);
  }

  getConflicts(...args) {
    return this.baseManager.getConflicts(...args);
  }

  analyzeConflicts(...args) {
    return this.baseManager.analyzeConflicts(...args);
  }

  resolveConflict(...args) {
    return this.baseManager.resolveConflict(...args);
  }

  requestAIAssistance(...args) {
    return this.baseManager.requestAIAssistance(...args);
  }

  checkPRMergeStatus(...args) {
    return this.baseManager.checkPRMergeStatus(...args);
  }

  getWorktreeDatabaseStats(...args) {
    return this.baseManager.getWorktreeDatabaseStats(...args);
  }

  checkMainWorktreeClean(...args) {
    return this.baseManager.checkMainWorktreeClean(...args);
  }

  copyDatabase(...args) {
    return this.baseManager.copyDatabase(...args);
  }

  // Expose properties
  get clients() {
    return this.baseManager.clients;
  }

  get portRegistry() {
    return this.baseManager.portRegistry;
  }

  get ptyManager() {
    return this.baseManager.ptyManager;
  }
}
