# Terminal Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable terminal sessions to survive browser refresh/disconnect, preserving history, cursor position, and running processes.

**Architecture:** Extract PTY management from server.mjs into dedicated session manager. Implement state serialization that captures terminal buffer every 5 seconds. Add reconnection protocol that reattaches browser to existing PTY process.

**Tech Stack:** node-pty, WebSocket, filesystem-based persistence, xterm.js (client-side)

---

## Task 1: Extract PTY Session Manager (Foundation)

**Files:**
- Create: `scripts/pty-session-manager.mjs`
- Create: `scripts/pty-session-manager.test.mjs`
- Modify: `worktree-web/server.mjs` (extract existing PTYManager logic)

**Step 1: Write the failing test**

Create `scripts/pty-session-manager.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PTYSessionManager } from './pty-session-manager.mjs';

describe('PTYSessionManager', () => {
  let manager;
  let mockPty;

  beforeEach(() => {
    manager = new PTYSessionManager();
    mockPty = {
      pid: 12345,
      write: vi.fn(),
      kill: vi.fn(),
      on: vi.fn(),
      resize: vi.fn()
    };
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: FAIL with "Cannot find module './pty-session-manager.mjs'"

**Step 3: Write minimal implementation**

Create `scripts/pty-session-manager.mjs`:

```javascript
import { randomUUID } from 'crypto';

export class PTYSessionManager {
  constructor() {
    this._sessions = new Map();
  }

  /**
   * Create a new PTY session
   * @param {string} worktreeName - Name of the worktree
   * @param {string} agent - Agent type (claude, codex, shell, etc.)
   * @param {string} cwd - Working directory
   * @returns {string} Session ID
   */
  createSession(worktreeName, agent, cwd) {
    const sessionId = randomUUID();

    this._sessions.set(sessionId, {
      id: sessionId,
      worktreeName,
      agent,
      cwd,
      connected: false,
      clientId: null,
      pty: null,
      createdAt: new Date(),
      disconnectedAt: null
    });

    return sessionId;
  }

  /**
   * Check if session exists
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  hasSession(sessionId) {
    return this._sessions.has(sessionId);
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {object|undefined} Session object
   */
  getSession(sessionId) {
    return this._sessions.get(sessionId);
  }

  /**
   * Attach WebSocket client to session
   * @param {string} sessionId - Session ID
   * @param {string} clientId - WebSocket client ID
   */
  attachClient(sessionId, clientId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.connected = true;
      session.clientId = clientId;
      session.disconnectedAt = null;
    }
  }

  /**
   * Detach WebSocket client from session
   * @param {string} sessionId - Session ID
   */
  detachClient(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.connected = false;
      session.disconnectedAt = new Date();
    }
  }

  /**
   * Destroy session and kill PTY process
   * @param {string} sessionId - Session ID
   */
  destroySession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      if (session.pty) {
        session.pty.kill();
      }
      this._sessions.delete(sessionId);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add scripts/pty-session-manager.mjs scripts/pty-session-manager.test.mjs
git commit -m "feat: add PTY session manager foundation

- Create session lifecycle management
- Support attach/detach for reconnection
- Handle session cleanup

🤖 Generated with Claude Code"
```

---

## Task 2: PTY State Serialization

**Files:**
- Create: `scripts/pty-state-serializer.mjs`
- Create: `scripts/pty-state-serializer.test.mjs`

**Step 1: Write the failing test**

Create `scripts/pty-state-serializer.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PTYStateSerializer } from './pty-state-serializer.mjs';

vi.mock('fs');
vi.mock('os');

describe('PTYStateSerializer', () => {
  let serializer;
  const sessionId = 'test-session-123';
  const sessionDir = '/mock/home/.vibetrees/sessions/test-session-123';

  beforeEach(() => {
    vi.clearAllMocks();
    os.homedir.mockReturnValue('/mock/home');
    serializer = new PTYStateSerializer();
  });

  describe('State Capture', () => {
    it('should capture terminal buffer state', () => {
      const mockPty = {
        _terminal: {
          buffer: {
            active: {
              length: 24,
              getLine: vi.fn((i) => ({
                translateToString: () => `Line ${i}`
              }))
            }
          },
          cols: 80,
          rows: 24
        }
      };

      const state = serializer.captureState(sessionId, mockPty);

      expect(state.sessionId).toBe(sessionId);
      expect(state.buffer).toHaveLength(24);
      expect(state.dimensions).toEqual({ cols: 80, rows: 24 });
      expect(state.timestamp).toBeDefined();
    });

    it('should handle PTY without internal terminal buffer', () => {
      const mockPty = {};

      const state = serializer.captureState(sessionId, mockPty);

      expect(state.sessionId).toBe(sessionId);
      expect(state.buffer).toEqual([]);
    });
  });

  describe('State Persistence', () => {
    it('should save state to filesystem', async () => {
      const state = {
        sessionId,
        buffer: ['line1', 'line2'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.writeFileSync.mockReturnValue(undefined);

      await serializer.saveState(state);

      expect(fs.mkdirSync).toHaveBeenCalledWith(sessionDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    });

    it('should not create directory if it already exists', async () => {
      const state = {
        sessionId,
        buffer: ['line1'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      fs.existsSync.mockReturnValue(true);
      fs.writeFileSync.mockReturnValue(undefined);

      await serializer.saveState(state);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('State Recovery', () => {
    it('should load state from filesystem', async () => {
      const savedState = {
        sessionId,
        buffer: ['line1', 'line2'],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(savedState));

      const state = await serializer.loadState(sessionId);

      expect(state).toEqual(savedState);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(sessionDir, 'pty-state.json'),
        'utf-8'
      );
    });

    it('should return null if state file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const state = await serializer.loadState(sessionId);

      expect(state).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-state-serializer.test.mjs`

Expected: FAIL with "Cannot find module './pty-state-serializer.mjs'"

**Step 3: Write minimal implementation**

Create `scripts/pty-state-serializer.mjs`:

```javascript
import fs from 'fs';
import path from 'path';
import os from 'os';

export class PTYStateSerializer {
  constructor() {
    this.baseDir = path.join(os.homedir(), '.vibetrees', 'sessions');
  }

  /**
   * Capture current PTY terminal state
   * @param {string} sessionId - Session ID
   * @param {object} pty - PTY instance
   * @returns {object} Terminal state
   */
  captureState(sessionId, pty) {
    const state = {
      sessionId,
      buffer: [],
      dimensions: { cols: 80, rows: 24 },
      timestamp: Date.now()
    };

    // Access internal xterm.js terminal if available (node-pty integration)
    if (pty._terminal) {
      const terminal = pty._terminal;
      const buffer = terminal.buffer.active;

      state.dimensions = {
        cols: terminal.cols,
        rows: terminal.rows
      };

      // Capture all lines in active buffer
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          state.buffer.push(line.translateToString());
        }
      }
    }

    return state;
  }

  /**
   * Save state to filesystem
   * @param {object} state - Terminal state
   */
  async saveState(state) {
    const sessionDir = path.join(this.baseDir, state.sessionId);

    // Create directory if needed
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Write state file
    const statePath = path.join(sessionDir, 'pty-state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Load state from filesystem
   * @param {string} sessionId - Session ID
   * @returns {object|null} Terminal state or null if not found
   */
  async loadState(sessionId) {
    const statePath = path.join(this.baseDir, sessionId, 'pty-state.json');

    if (!fs.existsSync(statePath)) {
      return null;
    }

    const data = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(data);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-state-serializer.test.mjs`

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add scripts/pty-state-serializer.mjs scripts/pty-state-serializer.test.mjs
git commit -m "feat: add PTY state serialization

- Capture terminal buffer and dimensions
- Save/load state from filesystem
- Support session recovery

🤖 Generated with Claude Code"
```

---

## Task 3: Integrate Session Manager with Server

**Files:**
- Modify: `worktree-web/server.mjs` (replace inline PTYManager with PTYSessionManager)

**Step 1: Write integration test**

Add to `scripts/pty-session-manager.test.mjs`:

```javascript
describe('PTY Integration', () => {
  it('should spawn PTY and attach to session', async () => {
    vi.mock('node-pty', () => ({
      spawn: vi.fn(() => mockPty)
    }));

    const pty = await import('node-pty');
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
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: FAIL with "manager.spawnPTY is not a function"

**Step 3: Add spawnPTY method**

Add to `scripts/pty-session-manager.mjs`:

```javascript
import pty from 'node-pty';

// Add to PTYSessionManager class:

/**
 * Spawn PTY process for session
 * @param {string} sessionId - Session ID
 * @param {object} options - PTY spawn options
 * @param {string} options.command - Command to run
 * @param {string[]} options.args - Command arguments
 * @param {number} options.cols - Terminal columns
 * @param {number} options.rows - Terminal rows
 */
spawnPTY(sessionId, options) {
  const session = this._sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  const ptyProcess = pty.spawn(options.command || shell, options.args || [], {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd: session.cwd,
    env: process.env
  });

  session.pty = ptyProcess;
  return ptyProcess;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: PASS

**Step 5: Update server.mjs to use PTYSessionManager**

In `worktree-web/server.mjs`, find the existing `PTYManager` class and replace with import:

```javascript
import { PTYSessionManager } from '../scripts/pty-session-manager.mjs';

// Replace: const ptyManager = new PTYManager();
const ptyManager = new PTYSessionManager();

// Update WebSocket handlers to use session-based API:
// OLD: ptyManager.create(worktreeName, agent, ...)
// NEW:
//   const sessionId = ptyManager.createSession(worktreeName, agent, cwd);
//   ptyManager.spawnPTY(sessionId, { command, args, cols, rows });
//   ptyManager.attachClient(sessionId, ws.id);
```

**Step 6: Commit**

```bash
git add scripts/pty-session-manager.mjs scripts/pty-session-manager.test.mjs worktree-web/server.mjs
git commit -m "feat: integrate session manager with server

- Replace inline PTYManager with PTYSessionManager
- Update WebSocket handlers for session-based API
- Maintain backward compatibility

🤖 Generated with Claude Code"
```

---

## Task 4: Periodic State Capture

**Files:**
- Modify: `scripts/pty-session-manager.mjs` (add auto-save interval)

**Step 1: Write test for auto-save**

Add to `scripts/pty-session-manager.test.mjs`:

```javascript
import { PTYStateSerializer } from './pty-state-serializer.mjs';

describe('Periodic State Capture', () => {
  it('should start auto-save interval when session created', () => {
    vi.useFakeTimers();
    const serializer = new PTYStateSerializer();
    const manager = new PTYSessionManager({ serializer, autoSaveInterval: 5000 });

    const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
    manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });

    const session = manager.getSession(sessionId);
    expect(session.autoSaveTimer).toBeDefined();

    vi.useRealTimers();
  });

  it('should clear auto-save interval when session destroyed', () => {
    const serializer = new PTYStateSerializer();
    const manager = new PTYSessionManager({ serializer, autoSaveInterval: 5000 });

    const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
    manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });
    manager.destroySession(sessionId);

    expect(manager.hasSession(sessionId)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: FAIL with "session.autoSaveTimer is not defined"

**Step 3: Implement auto-save**

Update `scripts/pty-session-manager.mjs`:

```javascript
import { PTYStateSerializer } from './pty-state-serializer.mjs';

export class PTYSessionManager {
  constructor(options = {}) {
    this._sessions = new Map();
    this.serializer = options.serializer || new PTYStateSerializer();
    this.autoSaveInterval = options.autoSaveInterval || 5000; // 5 seconds default
  }

  // Update spawnPTY to start auto-save:
  spawnPTY(sessionId, options) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

    const ptyProcess = pty.spawn(options.command || shell, options.args || [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: session.cwd,
      env: process.env
    });

    session.pty = ptyProcess;

    // Start auto-save interval
    session.autoSaveTimer = setInterval(() => {
      this._autoSaveSession(sessionId);
    }, this.autoSaveInterval);

    return ptyProcess;
  }

  // Update destroySession to clear interval:
  destroySession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      // Clear auto-save timer
      if (session.autoSaveTimer) {
        clearInterval(session.autoSaveTimer);
      }

      if (session.pty) {
        session.pty.kill();
      }
      this._sessions.delete(sessionId);
    }
  }

  // Add private auto-save method:
  async _autoSaveSession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session && session.pty) {
      const state = this.serializer.captureState(sessionId, session.pty);
      await this.serializer.saveState(state);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/pty-session-manager.mjs scripts/pty-session-manager.test.mjs
git commit -m "feat: add periodic state auto-save

- Capture state every 5 seconds
- Clear interval on session destroy
- Use PTYStateSerializer for persistence

🤖 Generated with Claude Code"
```

---

## Task 5: Session Recovery on Reconnection

**Files:**
- Modify: `worktree-web/server.mjs` (add reconnection handler)
- Modify: `worktree-web/public/js/terminal.js` (client reconnection logic)

**Step 1: Add recovery test**

Add to `scripts/pty-session-manager.test.mjs`:

```javascript
describe('Session Recovery', () => {
  it('should recover session from saved state', async () => {
    const serializer = new PTYStateSerializer();
    const manager = new PTYSessionManager({ serializer });

    const savedState = {
      sessionId: 'test-session-123',
      buffer: ['line1', 'line2'],
      dimensions: { cols: 80, rows: 24 },
      timestamp: Date.now()
    };

    vi.spyOn(serializer, 'loadState').mockResolvedValue(savedState);

    const state = await manager.recoverSession('test-session-123');

    expect(state).toEqual(savedState);
    expect(serializer.loadState).toHaveBeenCalledWith('test-session-123');
  });

  it('should return null if no saved state exists', async () => {
    const serializer = new PTYStateSerializer();
    const manager = new PTYSessionManager({ serializer });

    vi.spyOn(serializer, 'loadState').mockResolvedValue(null);

    const state = await manager.recoverSession('nonexistent');

    expect(state).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: FAIL with "manager.recoverSession is not a function"

**Step 3: Implement recovery method**

Add to `scripts/pty-session-manager.mjs`:

```javascript
/**
 * Recover session state from disk
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Saved state or null
 */
async recoverSession(sessionId) {
  return await this.serializer.loadState(sessionId);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: PASS

**Step 5: Update server WebSocket handler**

In `worktree-web/server.mjs`, update the `connect-terminal` event handler:

```javascript
ws.on('message', async (message) => {
  const data = JSON.parse(message);

  if (data.event === 'connect-terminal') {
    const { name, command, sessionId: existingSessionId } = data.data;

    // Check for existing session (reconnection)
    if (existingSessionId && ptyManager.hasSession(existingSessionId)) {
      // Reconnect to existing session
      ptyManager.attachClient(existingSessionId, ws.id);

      // Load saved state and send to client
      const savedState = await ptyManager.recoverSession(existingSessionId);
      if (savedState) {
        ws.send(JSON.stringify({
          event: 'terminal-restore',
          data: {
            sessionId: existingSessionId,
            buffer: savedState.buffer,
            dimensions: savedState.dimensions
          }
        }));
      }

      // Continue streaming from existing PTY
      const session = ptyManager.getSession(existingSessionId);
      session.pty.onData((data) => {
        ws.send(JSON.stringify({ event: 'terminal-data', data: { sessionId: existingSessionId, data } }));
      });

      return;
    }

    // Create new session (first connection)
    const sessionId = ptyManager.createSession(name, command, worktreePath);
    const pty = ptyManager.spawnPTY(sessionId, { command, args: [], cols: 80, rows: 24 });
    ptyManager.attachClient(sessionId, ws.id);

    // Send session ID to client
    ws.send(JSON.stringify({
      event: 'terminal-connected',
      data: { sessionId }
    }));

    // Stream PTY output
    pty.onData((data) => {
      ws.send(JSON.stringify({ event: 'terminal-data', data: { sessionId, data } }));
    });
  }
});
```

**Step 6: Update client reconnection logic**

In `worktree-web/public/js/terminal.js`, add reconnection handling:

```javascript
// Store session ID in sessionStorage
let currentSessionId = sessionStorage.getItem('pty-session-id');

function connectTerminal(worktreeName, agent) {
  const ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    // Include existing session ID if available
    ws.send(JSON.stringify({
      event: 'connect-terminal',
      data: {
        name: worktreeName,
        command: agent,
        sessionId: currentSessionId
      }
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.event === 'terminal-connected') {
      // Store new session ID
      currentSessionId = message.data.sessionId;
      sessionStorage.setItem('pty-session-id', currentSessionId);
    }

    if (message.event === 'terminal-restore') {
      // Restore terminal buffer
      term.clear();
      message.data.buffer.forEach(line => {
        term.write(line + '\r\n');
      });
      term.resize(message.data.dimensions.cols, message.data.dimensions.rows);
    }

    if (message.event === 'terminal-data') {
      term.write(message.data.data);
    }
  };

  ws.onclose = () => {
    // Attempt reconnection after 2 seconds
    setTimeout(() => connectTerminal(worktreeName, agent), 2000);
  };
}
```

**Step 7: Commit**

```bash
git add scripts/pty-session-manager.mjs scripts/pty-session-manager.test.mjs worktree-web/server.mjs worktree-web/public/js/terminal.js
git commit -m "feat: add session recovery on reconnection

- Server checks for existing session ID
- Restore terminal buffer from saved state
- Client stores session ID in sessionStorage
- Auto-reconnect on WebSocket close

🤖 Generated with Claude Code"
```

---

## Task 6: Orphaned Session Cleanup

**Files:**
- Modify: `scripts/pty-session-manager.mjs` (add cleanup timer)

**Step 1: Write cleanup test**

Add to `scripts/pty-session-manager.test.mjs`:

```javascript
describe('Orphaned Session Cleanup', () => {
  it('should mark sessions for cleanup after 24 hours disconnected', () => {
    vi.useFakeTimers();
    const manager = new PTYSessionManager({ orphanTimeout: 24 * 60 * 60 * 1000 });

    const sessionId = manager.createSession('feature-test', 'claude', '/path/to/worktree');
    manager.spawnPTY(sessionId, { command: 'bash', args: [], cols: 80, rows: 24 });
    manager.attachClient(sessionId, 'ws-1');
    manager.detachClient(sessionId);

    // Fast-forward 24 hours
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

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
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: FAIL with "manager.getOrphanedSessions is not a function"

**Step 3: Implement cleanup logic**

Update `scripts/pty-session-manager.mjs`:

```javascript
export class PTYSessionManager {
  constructor(options = {}) {
    this._sessions = new Map();
    this.serializer = options.serializer || new PTYStateSerializer();
    this.autoSaveInterval = options.autoSaveInterval || 5000;
    this.orphanTimeout = options.orphanTimeout || 24 * 60 * 60 * 1000; // 24 hours

    // Start cleanup check every hour
    this._cleanupTimer = setInterval(() => {
      this._cleanupOrphanedSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Get list of orphaned session IDs
   * @returns {string[]} Orphaned session IDs
   */
  getOrphanedSessions() {
    const now = Date.now();
    const orphans = [];

    for (const [sessionId, session] of this._sessions) {
      if (!session.connected && session.disconnectedAt) {
        const disconnectedDuration = now - session.disconnectedAt.getTime();
        if (disconnectedDuration > this.orphanTimeout) {
          orphans.push(sessionId);
        }
      }
    }

    return orphans;
  }

  /**
   * Clean up orphaned sessions (private)
   */
  _cleanupOrphanedSessions() {
    const orphans = this.getOrphanedSessions();
    orphans.forEach(sessionId => {
      console.log(`Cleaning up orphaned session: ${sessionId}`);
      this.destroySession(sessionId);
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/pty-session-manager.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/pty-session-manager.mjs scripts/pty-session-manager.test.mjs
git commit -m "feat: add orphaned session cleanup

- Mark sessions orphaned after 24 hours disconnected
- Auto-cleanup every hour
- Configurable timeout

🤖 Generated with Claude Code"
```

---

## Task 7: Integration Testing & Documentation

**Files:**
- Create: `docs/terminal-persistence.md`
- Modify: `README.md` or `CLAUDE.md` (add feature documentation)

**Step 1: Run full test suite**

Run: `npm test`

Expected: ALL TESTS PASS (including new PTY tests)

**Step 2: Manual testing checklist**

1. Start web server: `npm run web`
2. Create worktree and open terminal
3. Run long command: `npm install`
4. Refresh browser → Terminal history preserved ✓
5. Close browser tab
6. Reopen within 30s → Reconnects automatically ✓
7. Check process still running: `ps aux | grep npm` ✓

**Step 3: Write feature documentation**

Create `docs/terminal-persistence.md`:

```markdown
# Terminal Persistence

Terminal sessions now survive browser refresh and network disconnections.

## Features

- **Session Recovery**: Browser refresh preserves terminal history
- **Process Continuity**: Running commands continue executing server-side
- **Auto-Reconnection**: WebSocket reconnects within 30 seconds
- **State Serialization**: Terminal buffer saved every 5 seconds
- **Orphan Cleanup**: Inactive sessions cleaned up after 24 hours

## Architecture

- `PTYSessionManager`: Session lifecycle management
- `PTYStateSerializer`: Terminal state capture/restore
- Storage: `~/.vibetrees/sessions/{session-id}/pty-state.json`

## Usage

No user action required - persistence is automatic.

Session ID stored in browser sessionStorage for reconnection.

## Limitations

- Large terminal buffers (>10k lines) may cause slow restoration
- WebSocket disconnect >30s requires manual reconnect
- Sessions killed after 24 hours of inactivity
```

**Step 4: Update CLAUDE.md**

Add to `CLAUDE.md` under Features section:

```markdown
### Terminal Persistence (Phase 5)

Terminal sessions survive browser refresh and network disconnections:
- Session state serialized every 5 seconds
- Automatic reconnection within 30 seconds
- Running processes continue server-side
- Sessions cleaned up after 24 hours of inactivity

See [docs/terminal-persistence.md](docs/terminal-persistence.md) for details.
```

**Step 5: Final commit**

```bash
git add docs/terminal-persistence.md CLAUDE.md
git commit -m "docs: add terminal persistence documentation

- Feature overview and architecture
- Usage notes and limitations
- Update CLAUDE.md with feature summary

🤖 Generated with Claude Code"
```

---

## Verification Checklist

Before marking this feature complete, verify:

- [ ] All tests pass: `npm test`
- [ ] Browser refresh preserves terminal history
- [ ] WebSocket reconnects automatically
- [ ] Running commands continue executing
- [ ] Sessions cleaned up after 24 hours
- [ ] Documentation complete and accurate
- [ ] No regression in existing functionality

---

## Implementation Complete

**Next Steps:**
1. Push branch: `git push origin feature-terminal-persist`
2. Request integration review
3. Merge to main after approval

**Estimated Time:** 3-4 hours (assuming TDD workflow with 2-5 minute tasks)
