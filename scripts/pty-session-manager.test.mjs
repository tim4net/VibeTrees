import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-pty before importing PTYSessionManager
vi.mock('node-pty', () => ({
  default: {
    spawn: vi.fn()
  }
}));

// Mock @xterm/headless for terminal restoration tests
// These are module-level variables that tests can set
globalThis.mockTerminal = undefined;
globalThis.mockSerializeAddon = undefined;
globalThis.mockTerminalConstructor = undefined;
globalThis.mockSerializeConstructor = undefined;

vi.mock('@xterm/headless', () => {
  // Use Proxy to intercept constructor calls and return exact objects
  const Terminal = new Proxy(function() {}, {
    construct(target, args) {
      const [options] = args;
      const result = globalThis.mockTerminalConstructor
        ? globalThis.mockTerminalConstructor(options)
        : (globalThis.mockTerminal || {
            write: vi.fn(),
            cols: options?.cols || 80,
            rows: options?.rows || 24,
            loadAddon: vi.fn()
          });
      return result;
    }
  });

  const SerializeAddon = new Proxy(function() {}, {
    construct(target, args) {
      const result = globalThis.mockSerializeConstructor
        ? globalThis.mockSerializeConstructor()
        : (globalThis.mockSerializeAddon || {});
      return result;
    }
  });

  return {
    Terminal,
    SerializeAddon
  };
});

// Create local aliases for convenience
let mockTerminal, mockSerializeAddon, mockTerminalConstructor, mockSerializeConstructor;

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

  describe('auto-save functionality', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start auto-save timer on construction', () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn()
      };

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      expect(manager._autoSaveTimer).toBeDefined();
    });

    it('should call captureState for sessions with xterm on timer tick', async () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn().mockReturnValue({ buffer: ['test'], dimensions: { cols: 80, rows: 24 } }),
        saveState: vi.fn().mockResolvedValue(undefined)
      };

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockXterm = { cols: 80, rows: 24 };
      const mockSerializeAddon = {};
      manager._sessions.get(sessionId).xterm = mockXterm;
      manager._sessions.get(sessionId).serializeAddon = mockSerializeAddon;

      await vi.advanceTimersByTimeAsync(5000);

      const session = manager._sessions.get(sessionId);
      expect(mockSerializer.captureState).toHaveBeenCalledWith(sessionId, session);
    });

    it('should call saveState with captured state', async () => {
      vi.useFakeTimers();
      const capturedState = { buffer: ['test'], dimensions: { cols: 80, rows: 24 } };
      const mockSerializer = {
        captureState: vi.fn().mockReturnValue(capturedState),
        saveState: vi.fn().mockResolvedValue(undefined)
      };

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockXterm = { cols: 80, rows: 24 };
      const mockSerializeAddon = {};
      manager._sessions.get(sessionId).xterm = mockXterm;
      manager._sessions.get(sessionId).serializeAddon = mockSerializeAddon;

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSerializer.saveState).toHaveBeenCalledWith(capturedState);
    });

    it('should skip sessions without xterm', async () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn().mockResolvedValue(undefined)
      };

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      // Don't set xterm on session

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSerializer.captureState).not.toHaveBeenCalled();
      expect(mockSerializer.saveState).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn().mockImplementation(() => {
          throw new Error('Capture failed');
        }),
        saveState: vi.fn()
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      const mockXterm = { cols: 80, rows: 24 };
      const mockSerializeAddon = {};
      manager._sessions.get(sessionId).xterm = mockXterm;
      manager._sessions.get(sessionId).serializeAddon = mockSerializeAddon;

      await vi.advanceTimersByTimeAsync(5000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-save failed'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should clear timer on destroy', async () => {
      vi.useFakeTimers();
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        deleteState: vi.fn().mockResolvedValue(undefined)
      };

      const manager = new PTYSessionManager({
        serializer: mockSerializer,
        autoSaveInterval: 5000
      });

      const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
      manager._sessions.get(sessionId).pty = mockPty;

      await manager.destroySession(sessionId);

      expect(manager._autoSaveTimer).toBeUndefined();
    });
  });

  describe('session recovery with xterm', () => {
    beforeEach(() => {
      // Reset module-level mocks before each test
      globalThis.mockTerminal = undefined;
      globalThis.mockSerializeAddon = undefined;
      globalThis.mockTerminalConstructor = undefined;
      globalThis.mockSerializeConstructor = undefined;
    });

    it('should restore terminal from serialized state', async () => {
      const savedState = {
        sessionId: 'test-session-123',
        buffer: ['line1\r\n', 'line2\r\n'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(savedState)
      };

      // Set up module-level mocks
      globalThis.mockTerminal = {
        write: vi.fn(),
        cols: 80,
        rows: 24,
        loadAddon: vi.fn()
      };

      globalThis.mockSerializeAddon = {};

      globalThis.mockTerminalConstructor = vi.fn(() => globalThis.mockTerminal);
      globalThis.mockSerializeConstructor = vi.fn(() => globalThis.mockSerializeAddon);

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const result = await manager.restoreTerminal('test-session-123');

      expect(result).toBeDefined();
      expect(result.terminal).toBe(globalThis.mockTerminal);
      // Note: Using toEqual instead of toBe because vitest's mock system
      // wraps the SerializeAddon constructor return value, preventing exact reference equality
      expect(result.serializeAddon).toEqual(globalThis.mockSerializeAddon);
    });

    it('should create Terminal with saved dimensions', async () => {
      const savedState = {
        sessionId: 'test-session-123',
        buffer: ['line1\r\n'],
        dimensions: { cols: 100, rows: 30 },
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(savedState)
      };

      // Set up module-level mocks
      globalThis.mockTerminal = {
        write: vi.fn(),
        cols: 100,
        rows: 30,
        loadAddon: vi.fn()
      };

      globalThis.mockSerializeAddon = {};

      globalThis.mockTerminalConstructor = vi.fn(() => globalThis.mockTerminal);
      globalThis.mockSerializeConstructor = vi.fn(() => globalThis.mockSerializeAddon);

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      await manager.restoreTerminal('test-session-123');

      expect(globalThis.mockTerminalConstructor).toHaveBeenCalledWith({
        cols: 100,
        rows: 30,
        allowProposedApi: true
      });
    });

    it('should write serialized data to terminal', async () => {
      const savedState = {
        sessionId: 'test-session-123',
        buffer: ['line1\r\n', 'line2\r\n', 'line3\r\n'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(savedState)
      };

      // Set up module-level mocks
      globalThis.mockTerminal = {
        write: vi.fn(),
        cols: 80,
        rows: 24,
        loadAddon: vi.fn()
      };

      globalThis.mockSerializeAddon = {};

      globalThis.mockTerminalConstructor = vi.fn(() => globalThis.mockTerminal);
      globalThis.mockSerializeConstructor = vi.fn(() => globalThis.mockSerializeAddon);

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      await manager.restoreTerminal('test-session-123');

      savedState.buffer.forEach(line => {
        expect(globalThis.mockTerminal.write).toHaveBeenCalledWith(line);
      });
    });

    it('should return terminal + serializeAddon', async () => {
      const savedState = {
        sessionId: 'test-session-123',
        buffer: ['test\r\n'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(savedState)
      };

      // Set up module-level mocks
      globalThis.mockTerminal = {
        write: vi.fn(),
        cols: 80,
        rows: 24,
        loadAddon: vi.fn()
      };

      globalThis.mockSerializeAddon = {};

      globalThis.mockTerminalConstructor = vi.fn(() => globalThis.mockTerminal);
      globalThis.mockSerializeConstructor = vi.fn(() => globalThis.mockSerializeAddon);

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const result = await manager.restoreTerminal('test-session-123');

      expect(result).toEqual({
        terminal: globalThis.mockTerminal,
        serializeAddon: globalThis.mockSerializeAddon
      });
    });

    it('should return null for missing state', async () => {
      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(null)
      };

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const result = await manager.restoreTerminal('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle corrupt state', async () => {
      const corruptState = {
        sessionId: 'test-session-123',
        // Missing buffer and dimensions
        timestamp: Date.now()
      };

      const mockSerializer = {
        captureState: vi.fn(),
        saveState: vi.fn(),
        loadState: vi.fn().mockResolvedValue(corruptState)
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const manager = new PTYSessionManager({ serializer: mockSerializer });

      const result = await manager.restoreTerminal('test-session-123');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore terminal'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
