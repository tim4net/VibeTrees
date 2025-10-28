import { Profiler } from './profiler.mjs';

export class PerformanceOptimizer {
  constructor(options = {}) {
    this.profiler = options.profiler || new Profiler();
  }

  /**
   * Run tasks in parallel
   * @param {Array} tasks - Array of { name, fn }
   * @returns {Promise<Array>} Results from all tasks
   */
  async runParallel(tasks) {
    const promises = tasks.map(async (task) => {
      const id = this.profiler.start(task.name);
      try {
        const result = await task.fn();
        this.profiler.end(id);
        return result;
      } catch (error) {
        this.profiler.end(id);
        throw error;
      }
    });

    return Promise.all(promises);
  }

  /**
   * Run tasks with dependency graph
   * @param {Array} tasks - Array of { name, fn, dependencies }
   * @returns {Promise<Map>} Results by task name
   */
  async runWithDependencies(tasks) {
    const results = new Map();
    const completed = new Set();
    const taskMap = new Map(tasks.map(t => [t.name, t]));

    // Helper to check if dependencies are met
    const canRun = (task) => {
      return task.dependencies.every(dep => completed.has(dep));
    };

    // Execute tasks in stages
    while (completed.size < tasks.length) {
      // Find tasks that can run now
      const readyTasks = tasks.filter(task =>
        !completed.has(task.name) && canRun(task)
      );

      if (readyTasks.length === 0) {
        throw new Error('Circular dependency detected or no tasks ready');
      }

      // Run ready tasks in parallel
      const stageResults = await this.runParallel(
        readyTasks.map(task => ({
          name: task.name,
          fn: async () => {
            // Pass dependency results to task
            const deps = Object.fromEntries(
              task.dependencies.map(dep => [dep, results.get(dep)])
            );
            return task.fn(deps);
          }
        }))
      );

      // Mark tasks as completed
      readyTasks.forEach((task, index) => {
        completed.add(task.name);
        results.set(task.name, stageResults[index]);
      });
    }

    return results;
  }
}
