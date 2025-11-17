import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleTerminalConnection } from './websocket-handlers.mjs';

const {
  xtermInstances,
  serializeAddonInstances,
  TerminalConstructor,
  SerializeAddonConstructor
} = vi.hoisted(() => {
  const xtermInstances = [];
  const serializeAddonInstances = [];

  const createXtermMockInstance = () => {
    const instance = {
      write: vi.fn(),
      loadAddon: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn((handler) => {
        instance.__onDataHandler = handler;
      }),
      emitData: (payload) => {
        if (instance.__onDataHandler) {
          instance.__onDataHandler(payload);
        }
      }
    };
    return instance;
  };

  const createSerializeAddonMock = () => ({
    dispose: vi.fn(),
    serialize: vi.fn(() => 'mock-state')
  });

  return {
    xtermInstances,
    serializeAddonInstances,
    TerminalConstructor: vi.fn(function () {
      const instance = createXtermMockInstance();
      xtermInstances.push(instance);
      return instance;
    }),
    SerializeAddonConstructor: vi.fn(function () {
      const addon = createSerializeAddonMock();
      serializeAddonInstances.push(addon);
      return addon;
    })
  };
});

vi.mock('@xterm/headless', () => ({
  default: { Terminal: TerminalConstructor }
}));

vi.mock('@xterm/addon-serialize', () => ({
  default: { SerializeAddon: SerializeAddonConstructor }
}));

const WORKTREE_NAME = 'demo-worktree';
const WORKTREE_PATH = '/tmp/demo-worktree';
const COMMAND = 'shell';

describe('xterm-headless integration', () => {
  let ws;
  let manager;
  let fakePty;

  beforeEach(() => {
    vi.clearAllMocks();
    xtermInstances.length = 0;
    serializeAddonInstances.length = 0;
    fakePty = createMockPty();
    manager = createMockManager(fakePty);
    ws = createMockWebSocket();
  });

  afterEach(() => {
    ws.removeAllListeners();
  });

  const openTerminal = () => {
    handleTerminalConnection(ws, WORKTREE_NAME, COMMAND, manager);
  };

  describe('Terminal creation', () => {
    it('should create xterm-headless Terminal when spawning PTY', () => {
      openTerminal();

      expect(TerminalConstructor).toHaveBeenCalledTimes(1);
      expect(xtermInstances[0]).toBeDefined();
    });

    it('should load SerializeAddon on terminal', () => {
      openTerminal();

      const xterm = xtermInstances[0];
      const serializeAddon = serializeAddonInstances[0];

      expect(SerializeAddonConstructor).toHaveBeenCalledTimes(1);
      expect(xterm).toBeDefined();
      expect(serializeAddon).toBeDefined();
      expect(xterm?.loadAddon).toHaveBeenCalledWith(serializeAddon);
    });

    it('should store terminal reference in session', () => {
      openTerminal();

      const { session } = getSessionContext(manager);
      expect(session).toBeDefined();
      expect(xtermInstances[0]).toBeDefined();
      expect(session?.xterm).toBe(xtermInstances[0]);
    });

    it('should store serializeAddon reference in session', () => {
      openTerminal();

      const { session } = getSessionContext(manager);
      expect(session).toBeDefined();
      expect(serializeAddonInstances[0]).toBeDefined();
      expect(session?.serializeAddon).toBe(serializeAddonInstances[0]);
    });
  });

  describe('Data flow - PTY to xterm', () => {
    it('should pipe PTY output through xterm-headless write()', () => {
      openTerminal();

      const xterm = xtermInstances[0];
      expect(xterm).toBeDefined();

      fakePty.emitData('hello');
      expect(xterm?.write).toHaveBeenCalledWith('hello');
    });

    it('should handle PTY data events correctly', () => {
      openTerminal();

      const xterm = xtermInstances[0];
      expect(xterm).toBeDefined();

      const bufferChunk = Buffer.from('\x1b[35mcolored\x1b[0m');
      fakePty.emitData(bufferChunk);

      // Buffer payloads should pass through unchanged
      expect(xterm?.write).toHaveBeenCalledWith(bufferChunk);
    });
  });

  describe('Data flow - PTY to both xterm and WebSocket', () => {
    it('should send PTY output to both xterm buffer and WebSocket', () => {
      openTerminal();

      const xterm = xtermInstances[0];
      expect(xterm).toBeDefined();

      // Emit data from PTY
      fakePty.emitData('hello from pty');

      // Should update xterm buffer (for serialization)
      expect(xterm?.write).toHaveBeenCalledWith('hello from pty');

      // Should also send to WebSocket (for display)
      expect(ws.send).toHaveBeenCalledWith('hello from pty');
    });

    it('should preserve ANSI escape codes in both paths', () => {
      openTerminal();

      const xterm = xtermInstances[0];
      expect(xterm).toBeDefined();

      const ansiPayload = '\x1b[32mREADY\x1b[0m';
      fakePty.emitData(ansiPayload);

      // Should write to xterm buffer
      expect(xterm?.write).toHaveBeenCalledWith(ansiPayload);

      // Should also send to WebSocket with ANSI codes intact
      expect(ws.send).toHaveBeenCalledWith(ansiPayload);
    });
  });

  describe('Session management', () => {
    it('should initialize cols/rows from options', () => {
      openTerminal();

      expect(TerminalConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ cols: 120, rows: 30 })
      );

      const { session } = getSessionContext(manager);
      expect(session?.spawnOptions).toMatchObject({ cols: 120, rows: 30 });
    });

    it('should cleanup terminal on session destroy', () => {
      openTerminal();

      const { session } = getSessionContext(manager);
      const xterm = xtermInstances[0];
      const serializeAddon = serializeAddonInstances[0];

      expect(session).toBeDefined();
      expect(xterm).toBeDefined();
      expect(session?.xterm).toBe(xterm);
      expect(session?.serializeAddon).toBe(serializeAddon);

      ws.emit('close');

      expect(xterm?.dispose).toHaveBeenCalledTimes(1);
      expect(session?.xterm).toBeNull();
      expect(session?.serializeAddon).toBeNull();
    });
  });
});

function createMockWebSocket() {
  const socket = new EventEmitter();
  socket.readyState = 1;
  socket.bufferedAmount = 0;
  socket.send = vi.fn();
  socket.close = vi.fn();
  socket.off = socket.removeListener.bind(socket);
  return socket;
}

function createMockPty() {
  const pty = {
    onData: vi.fn((handler) => {
      pty.__onDataHandler = handler;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    write: vi.fn(),
    removeListener: vi.fn(),
    resize: vi.fn(),
    emitData(chunk) {
      if (pty.__onDataHandler) {
        pty.__onDataHandler(chunk);
      }
    }
  };
  return pty;
}

function createMockManager(fakePty) {
  const sessions = new Map();

  return {
    listWorktrees: vi.fn(() => [
      { name: WORKTREE_NAME, path: WORKTREE_PATH }
    ]),
    ptyManager: {
      _sessions: sessions,
      createSession: vi.fn((worktreeName, agent, path) => {
        const id = `session-${sessions.size + 1}`;
        sessions.set(id, { worktreeName, agent, path });
        return id;
      }),
      getSession: vi.fn((sessionId) => sessions.get(sessionId)),
      spawnPTY: vi.fn((sessionId, options) => {
        const session = sessions.get(sessionId);
        if (session) {
          session.spawnOptions = options;
          session.pty = fakePty;
        }
        return fakePty;
      }),
      attachClient: vi.fn(() => null),
      detachClient: vi.fn()
    }
  };
}

function getSessionContext(manager) {
  const attachCalls = manager.ptyManager.attachClient.mock.calls;
  const sessionId = attachCalls.length ? attachCalls[0][0] : undefined;
  return {
    sessionId,
    session: sessionId ? manager.ptyManager._sessions.get(sessionId) : undefined
  };
}
