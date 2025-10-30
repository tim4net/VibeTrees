import EventEmitter from 'events';

/**
 * Manages server initialization tasks and tracks their progress
 * Allows the server to become responsive immediately while heavy operations run in background
 */
export class InitializationManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.startTime = Date.now();
    this.initialized = false;
  }

  /**
   * Register a new initialization task
   * @param {string} id - Unique task identifier
   * @param {string} description - Human-readable description
   * @param {number} estimatedTime - Estimated time in ms (for progress calculation)
   */
  registerTask(id, description, estimatedTime = 1000) {
    this.tasks.set(id, {
      id,
      description,
      status: 'pending',
      progress: 0,
      estimatedTime,
      startTime: null,
      endTime: null,
      error: null,
      result: null
    });
    this.emit('task:registered', { id, description });
  }

  /**
   * Mark a task as started
   * @param {string} id - Task identifier
   */
  startTask(id) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }
    task.status = 'running';
    task.startTime = Date.now();
    task.progress = 10; // Show immediate progress
    this.emit('task:started', { id, description: task.description });
  }

  /**
   * Update task progress
   * @param {string} id - Task identifier
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Optional progress message
   */
  updateProgress(id, progress, message = null) {
    const task = this.tasks.get(id);
    if (!task) return;

    task.progress = Math.min(100, Math.max(0, progress));
    if (message) {
      task.progressMessage = message;
    }
    this.emit('task:progress', { id, progress: task.progress, message });
  }

  /**
   * Mark a task as completed
   * @param {string} id - Task identifier
   * @param {any} result - Optional result data
   */
  completeTask(id, result = null) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }
    task.status = 'completed';
    task.progress = 100;
    task.endTime = Date.now();
    task.result = result;
    this.emit('task:completed', {
      id,
      description: task.description,
      duration: task.endTime - task.startTime
    });

    // Check if all tasks are complete
    this.checkInitialization();
  }

  /**
   * Mark a task as failed
   * @param {string} id - Task identifier
   * @param {Error} error - The error that occurred
   */
  failTask(id, error) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }
    task.status = 'failed';
    task.endTime = Date.now();
    task.error = error.message || error;
    this.emit('task:failed', {
      id,
      description: task.description,
      error: task.error
    });

    // Continue initialization even if some tasks fail
    this.checkInitialization();
  }

  /**
   * Check if all tasks are complete and emit initialized event
   */
  checkInitialization() {
    const allTasks = Array.from(this.tasks.values());
    const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'running');

    if (pendingTasks.length === 0 && !this.initialized) {
      this.initialized = true;
      const totalTime = Date.now() - this.startTime;
      const failedTasks = allTasks.filter(t => t.status === 'failed');

      this.emit('initialized', {
        totalTime,
        totalTasks: allTasks.length,
        successfulTasks: allTasks.filter(t => t.status === 'completed').length,
        failedTasks: failedTasks.length,
        failures: failedTasks.map(t => ({ id: t.id, error: t.error }))
      });
    }
  }

  /**
   * Get current initialization status
   * @returns {Object} Status object
   */
  getStatus() {
    const allTasks = Array.from(this.tasks.values());
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const failedTasks = allTasks.filter(t => t.status === 'failed');
    const runningTasks = allTasks.filter(t => t.status === 'running');
    const pendingTasks = allTasks.filter(t => t.status === 'pending');

    // Calculate overall progress
    let totalProgress = 0;
    allTasks.forEach(task => {
      totalProgress += task.progress;
    });
    const overallProgress = allTasks.length > 0 ? totalProgress / allTasks.length : 0;

    return {
      initialized: this.initialized,
      overallProgress: Math.round(overallProgress),
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      runningTasks: runningTasks.length,
      pendingTasks: pendingTasks.length,
      tasks: allTasks.map(t => ({
        id: t.id,
        description: t.description,
        status: t.status,
        progress: t.progress,
        progressMessage: t.progressMessage,
        error: t.error,
        duration: t.endTime ? t.endTime - t.startTime : null
      })),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Execute a task with automatic tracking
   * @param {string} id - Task identifier
   * @param {string} description - Task description
   * @param {Function} taskFn - Async function to execute
   * @param {number} estimatedTime - Estimated time in ms
   * @returns {Promise<any>} Task result
   */
  async executeTask(id, description, taskFn, estimatedTime = 1000) {
    this.registerTask(id, description, estimatedTime);
    this.startTask(id);

    try {
      // Create a progress updater for long-running tasks
      const progressInterval = setInterval(() => {
        const task = this.tasks.get(id);
        if (task && task.status === 'running') {
          // Gradually increase progress based on estimated time
          const elapsed = Date.now() - task.startTime;
          const estimatedProgress = Math.min(90, (elapsed / estimatedTime) * 90);
          this.updateProgress(id, estimatedProgress);
        } else {
          clearInterval(progressInterval);
        }
      }, 500);

      const result = await taskFn((progress, message) => {
        this.updateProgress(id, progress, message);
      });

      clearInterval(progressInterval);
      this.completeTask(id, result);
      return result;
    } catch (error) {
      this.failTask(id, error);
      // Don't throw - let initialization continue
      console.error(`[InitializationManager] Task ${id} failed:`, error.message);
      return null;
    }
  }
}