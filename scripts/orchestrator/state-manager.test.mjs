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
});
