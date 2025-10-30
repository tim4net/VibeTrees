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

  describe('Session Takeover', () => {
    it('should return null when attaching to new session', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockWs = { readyState: 1 };

      const previousWs = manager.attachClient(sessionId, 'ws-client-1', mockWs);

      expect(previousWs).toBeNull();
    });

    it('should return previous WebSocket when taking over active session', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockWs1 = { readyState: 1, send: vi.fn() };
      const mockWs2 = { readyState: 1, send: vi.fn() };

      // First client connects
      manager.attachClient(sessionId, 'ws-client-1', mockWs1);

      // Second client takes over
      const previousWs = manager.attachClient(sessionId, 'ws-client-2', mockWs2);

      expect(previousWs).toBe(mockWs1);

      const session = manager.getSession(sessionId);
      expect(session.ws).toBe(mockWs2);
      expect(session.clientId).toBe('ws-client-2');
    });

    it('should not return previous WebSocket for disconnected session', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockWs1 = { readyState: 1 };
      const mockWs2 = { readyState: 1 };

      // First client connects then disconnects
      manager.attachClient(sessionId, 'ws-client-1', mockWs1);
      manager.detachClient(sessionId);

      // Second client reconnects (not a takeover)
      const previousWs = manager.attachClient(sessionId, 'ws-client-2', mockWs2);

      expect(previousWs).toBeNull();
    });

    it('should clear WebSocket reference on detach', () => {
      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockWs = { readyState: 1 };

      manager.attachClient(sessionId, 'ws-client-1', mockWs);
      manager.detachClient(sessionId);

      const session = manager.getSession(sessionId);
      expect(session.ws).toBeNull();
    });
  });

  describe('Session Cleanup', () => {
    it('should destroy session and kill PTY process', async () => {
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        deleteState: vi.fn().mockResolvedValue(undefined)
      };
      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager._sessions.get(sessionId).pty = mockPty;

      await manager.destroySession(sessionId);

      expect(mockPty.kill).toHaveBeenCalled();
      expect(mockSerializer.deleteState).toHaveBeenCalledWith(sessionId);
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

  // Note: Auto-save feature was removed for performance reasons
  // (was causing 10-50ms freezes every 5 seconds)

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

  describe('Orphaned Session Cleanup', () => {
    it('should mark sessions for cleanup after 24 hours disconnected', () => {
      vi.useFakeTimers();
      const baseTime = new Date('2025-01-01T00:00:00Z');
      vi.setSystemTime(baseTime);

      const manager = new PTYSessionManager({ orphanTimeout: 24 * 60 * 60 * 1000 });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });
      manager.attachClient(sessionId, 'ws-1');
      manager.detachClient(sessionId);

      // Fast-forward 24 hours + 1 second to ensure we exceed the threshold
      const timeAdvance = 24 * 60 * 60 * 1000 + 1000;
      vi.advanceTimersByTime(timeAdvance);
      vi.setSystemTime(new Date(baseTime.getTime() + timeAdvance));

      const orphans = manager.getOrphanedSessions();
      expect(orphans).toContain(sessionId);

      vi.useRealTimers();
    });

    it('should not mark recently disconnected sessions as orphaned', () => {
      const manager = new PTYSessionManager({ orphanTimeout: 24 * 60 * 60 * 1000 });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });
      manager.attachClient(sessionId, 'ws-1');
      manager.detachClient(sessionId);

      const orphans = manager.getOrphanedSessions();
      expect(orphans).not.toContain(sessionId);
    });
  });
});
