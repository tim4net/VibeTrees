import { describe, it, expect } from 'vitest';
import { phases, getPhase, getAllPhases } from './index.mjs';

describe('Phase Definitions', () => {
  it('should export phase 1', () => {
    expect(phases).toHaveLength(1);
    expect(phases[0].number).toBe(1);
    expect(phases[0].name).toBe('Cleanup & Setup');
  });

  it('should get phase by number', () => {
    const phase1 = getPhase(1);
    expect(phase1).toBeTruthy();
    expect(phase1.number).toBe(1);
    expect(phase1.tasks).toHaveLength(4);
  });

  it('should return all phases', () => {
    const allPhases = getAllPhases();
    expect(allPhases).toHaveLength(1);
  });

  it('should have valid task structure', () => {
    const phase1 = getPhase(1);

    phase1.tasks.forEach(task => {
      expect(task.taskNumber).toBeGreaterThan(0);
      expect(task.description).toBeTruthy();
      expect(task.prompt).toBeTruthy();
      expect(task.maxRetries).toBeGreaterThanOrEqual(0);
      expect(typeof task.runTestsAfter).toBe('boolean');
    });
  });

  it('should have checkpoint with approval requirement', () => {
    const phase1 = getPhase(1);

    expect(phase1.checkpoint).toBeTruthy();
    expect(phase1.checkpoint.message).toBeTruthy();
    expect(phase1.checkpoint.requiresApproval).toBe(true);
  });
});
