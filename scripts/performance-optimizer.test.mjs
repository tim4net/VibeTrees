import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceOptimizer } from './performance-optimizer.mjs';
import { Profiler } from './profiler.mjs';

describe('PerformanceOptimizer', () => {
  let optimizer;
  let profiler;

  beforeEach(() => {
    profiler = new Profiler();
    optimizer = new PerformanceOptimizer({ profiler });
  });

  describe('Parallel Execution', () => {
    it('should execute independent operations in parallel', async () => {
      const task1 = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'task1';
      });

      const task2 = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'task2';
      });

      const startTime = Date.now();
      const results = await optimizer.runParallel([
        { name: 'task1', fn: task1 },
        { name: 'task2', fn: task2 }
      ]);
      const duration = Date.now() - startTime;

      // Should complete in ~100ms (parallel), not 200ms (sequential)
      expect(duration).toBeLessThan(150);
      expect(results).toEqual(['task1', 'task2']);
    });

    it('should handle errors in parallel tasks', async () => {
      const task1 = vi.fn(async () => 'success');
      const task2 = vi.fn(async () => {
        throw new Error('Task failed');
      });

      await expect(
        optimizer.runParallel([
          { name: 'task1', fn: task1 },
          { name: 'task2', fn: task2 }
        ])
      ).rejects.toThrow('Task failed');
    });
  });

  describe('Dependency Graph Execution', () => {
    it('should execute tasks respecting dependencies', async () => {
      const executionOrder = [];

      const tasks = [
        {
          name: 'allocate-ports',
          fn: async () => {
            executionOrder.push('allocate-ports');
            return { postgres: 5432, api: 3000 };
          },
          dependencies: []
        },
        {
          name: 'start-postgres',
          fn: async (deps) => {
            executionOrder.push('start-postgres');
            return 'postgres-started';
          },
          dependencies: ['allocate-ports']
        },
        {
          name: 'start-api',
          fn: async (deps) => {
            executionOrder.push('start-api');
            return 'api-started';
          },
          dependencies: ['allocate-ports', 'start-postgres']
        }
      ];

      await optimizer.runWithDependencies(tasks);

      // Verify execution order
      expect(executionOrder).toEqual([
        'allocate-ports',
        'start-postgres',
        'start-api'
      ]);
    });

    it('should run independent tasks in parallel stages', async () => {
      const tasks = [
        {
          name: 'git-worktree',
          fn: async () => {
            await new Promise(r => setTimeout(r, 50));
            return 'git-done';
          },
          dependencies: []
        },
        {
          name: 'docker-pull',
          fn: async () => {
            await new Promise(r => setTimeout(r, 50));
            return 'docker-done';
          },
          dependencies: []
        }
      ];

      const startTime = Date.now();
      await optimizer.runWithDependencies(tasks);
      const duration = Date.now() - startTime;

      // Should complete in ~50ms (parallel), not 100ms (sequential)
      expect(duration).toBeLessThan(80);
    });
  });
});
