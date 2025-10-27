import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.mjs';
import fs from 'fs';

describe('StateManager', () => {
  const testDbPath = './test-state.db';
  let stateManager;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    stateManager = new StateManager(testDbPath);
  });

  afterEach(() => {
    stateManager?.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize database with correct schema', () => {
    const tables = stateManager.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();

    expect(tables.map(t => t.name)).toContain('phases');
    expect(tables.map(t => t.name)).toContain('tasks');
    expect(tables.map(t => t.name)).toContain('sessions');
  });

  it('should create a new session', () => {
    const sessionId = stateManager.createSession({
      model: 'gpt-5',
      startPhase: 1
    });

    expect(sessionId).toBeTruthy();

    const session = stateManager.getSession(sessionId);
    expect(session.model).toBe('gpt-5');
    expect(session.start_phase).toBe(1);
    expect(session.status).toBe('pending');
  });

  it('should track phase progress', () => {
    const sessionId = stateManager.createSession({ model: 'gpt-5' });

    stateManager.startPhase(sessionId, 1, 'Phase 1: Cleanup');
    const phase = stateManager.getCurrentPhase(sessionId);

    expect(phase.phase_number).toBe(1);
    expect(phase.status).toBe('in_progress');
    expect(phase.started_at).toBeTruthy();
  });

  describe('Idempotency', () => {
    it('should generate consistent idempotency keys', () => {
      const key1 = stateManager.generateIdempotencyKey(1, 1, 'Test task');
      const key2 = stateManager.generateIdempotencyKey(1, 1, 'Test task');
      const key3 = stateManager.generateIdempotencyKey(1, 2, 'Test task');

      expect(key1).toBe(key2); // Same inputs = same key
      expect(key1).not.toBe(key3); // Different task number = different key
      expect(key1).toHaveLength(16); // 16-char hash
    });

    it('should create tasks with idempotency keys', () => {
      const sessionId = stateManager.createSession({ model: 'gpt-5' });
      const phaseId = stateManager.startPhase(sessionId, 1, 'Test Phase');
      const taskId = stateManager.createTask(phaseId, 1, 'Test task', 1);

      const task = stateManager.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      expect(task.idempotency_key).toBeTruthy();
      expect(task.idempotency_key).toHaveLength(16);
    });

    it('should find tasks by idempotency key', () => {
      const sessionId = stateManager.createSession({ model: 'gpt-5' });
      const phaseId = stateManager.startPhase(sessionId, 1, 'Test Phase');
      const taskId = stateManager.createTask(phaseId, 1, 'Test task', 1);

      const idempotencyKey = stateManager.generateIdempotencyKey(1, 1, 'Test task');
      const foundTask = stateManager.findTaskByIdempotencyKey(idempotencyKey);

      expect(foundTask).toBeTruthy();
      expect(foundTask.id).toBe(taskId);
    });

    it('should prevent duplicate tasks with same idempotency key', () => {
      const sessionId = stateManager.createSession({ model: 'gpt-5' });
      const phaseId = stateManager.startPhase(sessionId, 1, 'Test Phase');

      stateManager.createTask(phaseId, 1, 'Test task', 1);

      expect(() => {
        stateManager.createTask(phaseId, 1, 'Test task', 1);
      }).toThrow();
    });
  });

  describe('Session Resumption', () => {
    it('should retrieve active sessions', () => {
      const sessionId1 = stateManager.createSession({ model: 'gpt-5', startPhase: 1 });
      const sessionId2 = stateManager.createSession({ model: 'opus', startPhase: 2 });

      stateManager.db.prepare("UPDATE sessions SET status = 'active' WHERE id = ?").run(sessionId1);
      stateManager.db.prepare("UPDATE sessions SET status = 'active' WHERE id = ?").run(sessionId2);

      const activeSessions = stateManager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.every(s => ['active', 'paused'].includes(s.status))).toBe(true);
    });

    it('should not return completed sessions', () => {
      const sessionId = stateManager.createSession({ model: 'gpt-5' });
      stateManager.db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(sessionId);

      const activeSessions = stateManager.getActiveSessions();
      expect(activeSessions).toHaveLength(0);
    });

    it('should get incomplete phases', () => {
      const sessionId = stateManager.createSession({ model: 'gpt-5' });
      const phaseId1 = stateManager.startPhase(sessionId, 1, 'Phase 1');
      const phaseId2 = stateManager.startPhase(sessionId, 2, 'Phase 2');

      stateManager.completePhase(phaseId1);

      const incompletePhases = stateManager.getIncompletePhases(sessionId);
      expect(incompletePhases).toHaveLength(1);
      expect(incompletePhases[0].phase_number).toBe(2);
      expect(incompletePhases[0].status).toBe('in_progress');
    });
  });
});
