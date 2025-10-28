import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Profiler } from './profiler.mjs';

describe('Profiler', () => {
  let profiler;

  beforeEach(() => {
    profiler = new Profiler();
  });

  describe('Operation Timing', () => {
    it('should start timing operation', () => {
      const operationId = profiler.start('test-operation');

      expect(operationId).toBeTruthy();
      expect(profiler.isRunning(operationId)).toBe(true);
    });

    it('should end timing and record duration', async () => {
      const operationId = profiler.start('test-operation');

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = profiler.end(operationId);

      expect(result.duration).toBeGreaterThan(90);
      expect(result.duration).toBeLessThan(150);
      expect(result.name).toBe('test-operation');
    });

    it('should handle nested operations', () => {
      const parentId = profiler.start('parent');
      const childId = profiler.start('child', parentId);

      profiler.end(childId);
      profiler.end(parentId);

      const parent = profiler.getResult(parentId);
      expect(parent.children).toContainEqual(
        expect.objectContaining({ name: 'child' })
      );
    });
  });

  describe('Aggregation', () => {
    it('should aggregate multiple runs of same operation', () => {
      for (let i = 0; i < 3; i++) {
        const id = profiler.start('repeated-op');
        profiler.end(id);
      }

      const stats = profiler.getStats('repeated-op');

      expect(stats.count).toBe(3);
      expect(stats.avg).toBeGreaterThan(0);
      expect(stats.min).toBeDefined();
      expect(stats.max).toBeDefined();
    });
  });

  describe('Reporting', () => {
    it('should generate summary report', () => {
      const id1 = profiler.start('operation-1');
      profiler.end(id1);

      const id2 = profiler.start('operation-2');
      profiler.end(id2);

      const report = profiler.generateReport();

      expect(report.operations).toHaveLength(2);
      expect(report.totalDuration).toBeGreaterThan(0);
    });
  });
});
