import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from './index.mjs';
import fs from 'fs';

describe('Orchestrator Integration', () => {
  const testDbPath = './test-orchestrator.db';
  let orchestrator;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    orchestrator?.cleanup();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize with configuration', () => {
    orchestrator = new Orchestrator({
      workingDir: '/Users/tim/code/vibe-worktrees',
      model: 'claude-sonnet-4.5',
      dbPath: testDbPath,
      enableDashboard: false
    });

    expect(orchestrator.config.model).toBe('claude-sonnet-4.5');
    expect(orchestrator.stateManager).toBeTruthy();
    expect(orchestrator.cli).toBeTruthy();
    expect(orchestrator.executor).toBeTruthy();
  });

  it('should create new session', () => {
    orchestrator = new Orchestrator({
      workingDir: '/test',
      model: 'gpt-5',
      dbPath: testDbPath,
      enableDashboard: false
    });

    const sessionId = orchestrator.createSession({ startPhase: 1 });
    expect(sessionId).toBeTruthy();

    const session = orchestrator.stateManager.getSession(sessionId);
    expect(session.model).toBe('gpt-5');
    expect(session.start_phase).toBe(1);
  });

  it('should get session summary', () => {
    orchestrator = new Orchestrator({
      workingDir: '/test',
      model: 'gpt-5',
      dbPath: testDbPath,
      enableDashboard: false
    });

    const sessionId = orchestrator.createSession({ startPhase: 1 });
    const phaseId = orchestrator.stateManager.startPhase(sessionId, 1, 'Test Phase');
    orchestrator.stateManager.createTask(phaseId, 1, 'Test Task');

    const summary = orchestrator.getSessionSummary(sessionId);
    expect(summary.session).toBeTruthy();
    expect(summary.phases).toHaveLength(1);
    expect(summary.phases[0].tasks).toHaveLength(1);
  });

  it('should cleanup resources', () => {
    orchestrator = new Orchestrator({
      workingDir: '/test',
      model: 'gpt-5',
      dbPath: testDbPath,
      enableDashboard: false
    });

    const sessionId = orchestrator.createSession({ startPhase: 1 });
    expect(sessionId).toBeTruthy();

    // Should not throw
    expect(() => orchestrator.cleanup()).not.toThrow();
  });
});
