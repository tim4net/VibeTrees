import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-pty before importing PTYSessionManager
vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn()
  }
}));

import { PTYSessionManager } from './pty-session-manager.mjs';
import pty from 'node-pty';

describe('PTYSessionManager', () => {
  let manager;
  let mockPty;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PTYSessionManager();
    mockPty = {
      pid: 12345,
      write: vi.fn(),
      kill: vi.fn(),
      on: vi.fn(),
      onData: vi.fn(),
      resize: vi.fn()
    };
    // Setup default mock implementation
    pty.spawn.mockReturnValue(mockPty);
  });

  describe('Session Creation', () => {
    it('should create new PTY session with unique ID', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');

      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(manager.hasSession(sessionId)).toBe(true);
    });

    it('should store session metadata', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const session = manager.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session.worktreeName).toBe('feature-test');
      expect(session.agent).toBe('claude');
      expect(session.cwd).toBe('/path/to/worktree');
    });
  });

  describe('Session Lifecycle', () => {
    it('should mark session as connected when client attaches', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');

      manager.attachClient(sessionId, 'ws-client-1');

      const session = manager.getSession(sessionId);
      expect(session.connected).toBe(true);
      expect(session.clientId).toBe('ws-client-1');
    });

    it('should mark session as disconnected when client detaches', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.attachClient(sessionId, 'ws-client-1');

      manager.detachClient(sessionId);

      const session = manager.getSession(sessionId);
      expect(session.connected).toBe(false);
      expect(session.disconnectedAt).toBeDefined();
    });

    it('should allow reconnection to existing session', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.attachClient(sessionId, 'ws-client-1');
      manager.detachClient(sessionId);

      manager.attachClient(sessionId, 'ws-client-2');

      const session = manager.getSession(sessionId);
      expect(session.connected).toBe(true);
      expect(session.clientId).toBe('ws-client-2');
    });
  });

  describe('Session Cleanup', () => {
    it('should destroy session and kill PTY process', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager._sessions.get(sessionId).pty = mockPty;

      manager.destroySession(sessionId);

      expect(mockPty.kill).toHaveBeenCalled();
      expect(manager.hasSession(sessionId)).toBe(false);
    });
  });

  describe('PTY Integration', () => {
    it('should spawn PTY and attach to session', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');

      manager.spawnPTY(sessionId, {
        command: 'npx',
        args: ['-y', '@anthropic-ai/claude-code'],
        cols: 80,
        rows: 24
      });

      const session = manager.getSession(sessionId);
      expect(session.pty).toBeDefined();
      expect(pty.spawn).toHaveBeenCalledWith('npx', ['-y', '@anthropic-ai/claude-code'], expect.any(Object));
    });
  });

  describe('Periodic State Capture', () => {
    it('should start auto-save interval when session created', () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn()
      };
      const manager = new PTYSessionManager({ serializer: mockSerializer, autoSaveInterval: 5000 });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });

      const session = manager.getSession(sessionId);
      expect(session.autoSaveTimer).toBeDefined();

      vi.useRealTimers();
    });

    it('should clear auto-save interval when session destroyed', () => {
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn()
      };
      const manager = new PTYSessionManager({ serializer: mockSerializer, autoSaveInterval: 5000 });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });
      manager.destroySession(sessionId);

      expect(manager.hasSession(sessionId)).toBe(false);
    });
  });

  describe('Session Recovery', () => {
    it('should recover session from saved state', async () => {
      const savedState = {
        sessionId: 'test-session-123',
        buffer: ['line1', 'line2'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(savedState)
      };
      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const state = await manager.recoverSession('test-session-123');

      expect(state).toEqual(savedState);
      expect(mockSerializer.loadState).toHaveBeenCalledWith('test-session-123');
    });

    it('should return null if no saved state exists', async () => {
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(null)
      };
      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const state = await manager.recoverSession('nonexistent');

      expect(state).toBeNull();
    });
  });
});
