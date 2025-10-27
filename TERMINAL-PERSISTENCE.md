# Terminal Persistence Design

**Status**: Design Proposal
**Date**: 2025-10-27
**Related**: CRITICAL-FEATURES.md (Pause/Resume), MCP-ARCHITECTURE.md

---

## Problem Statement

Currently, terminal state is ephemeral in vibe-worktrees:
- **Browser refresh** → Lost terminal scrollback, command history
- **Server restart** → Disconnected AI agent sessions
- **Worktree pause** → No way to resume terminal state
- **Process crash** → Lost long-running AI conversations

### User Impact

**Developer Workflow**:
- Accidentally refresh browser → Lose 30-minute Claude conversation
- Server update → All AI agents need to restart from scratch
- Pause/resume worktree → Can't continue where you left off

**AI Agent Continuity**:
- Long-running debugging sessions lost
- Context accumulation interrupted
- MCP tool state reset

---

## Requirements

### Must Have
- ✅ Persist command history across reconnections
- ✅ Restore terminal scrollback buffer (last N lines)
- ✅ Maintain working directory state
- ✅ Resume AI agent sessions after disconnect
- ✅ Work with pause/resume worktrees

### Should Have
- ✅ Preserve environment variables
- ✅ Reconnect to running processes
- ✅ Save AI conversation context
- ✅ Automatic session recovery

### Nice to Have
- ✅ Session replay/time-travel debugging
- ✅ Share terminal sessions between browsers
- ✅ Terminal session export (for bug reports)

---

## Option 1: tmux Integration

### Architecture

```
┌─────────────────────────────────────────────┐
│         Web Browser (xterm.js)              │
└─────────────┬───────────────────────────────┘
              │ WebSocket
┌─────────────▼───────────────────────────────┐
│     WebSocket Server (Express + ws)         │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │     tmux-pty-bridge.mjs              │  │
│  │  - Attaches to tmux sessions         │  │
│  │  - Proxies input/output              │  │
│  │  - Handles reconnection              │  │
│  └──────────┬───────────────────────────┘  │
└─────────────┼───────────────────────────────┘
              │ Control Socket
┌─────────────▼───────────────────────────────┐
│           tmux Server                        │
│                                             │
│  Session: worktree-feature-auth-shell       │
│  Session: worktree-feature-auth-claude      │
│  Session: worktree-bugfix-login-codex       │
└─────────────────────────────────────────────┘
```

### Implementation

```javascript
// scripts/worktree-web/tmux-pty-bridge.mjs

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class TmuxPtyBridge extends EventEmitter {
  constructor(sessionName, worktreePath) {
    super();
    this.sessionName = sessionName;
    this.worktreePath = worktreePath;
    this.attached = false;
  }

  async attach() {
    // Check if session exists
    const exists = await this.sessionExists();

    if (!exists) {
      // Create new tmux session
      await this.createSession();
    }

    // Attach to session using tmux control mode
    this.process = spawn('tmux', [
      '-CC',                    // Control mode (parseable output)
      'attach-session',
      '-t', this.sessionName
    ], {
      cwd: this.worktreePath,
      env: {
        ...process.env,
        TERM: 'xterm-256color'
      }
    });

    this.process.stdout.on('data', (data) => {
      this.emit('data', data);
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
    });

    this.attached = true;
  }

  async createSession() {
    return new Promise((resolve, reject) => {
      const proc = spawn('tmux', [
        'new-session',
        '-d',                   // Detached
        '-s', this.sessionName,
        '-c', this.worktreePath // Working directory
      ]);

      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tmux session creation failed: ${code}`));
      });
    });
  }

  async sessionExists() {
    return new Promise((resolve) => {
      const proc = spawn('tmux', ['has-session', '-t', this.sessionName]);
      proc.on('exit', (code) => resolve(code === 0));
    });
  }

  write(data) {
    if (this.process && this.attached) {
      this.process.stdin.write(data);
    }
  }

  async detach() {
    if (this.process) {
      this.process.kill();
      this.attached = false;
    }
  }

  async destroy() {
    await this.detach();
    // Kill tmux session
    spawn('tmux', ['kill-session', '-t', this.sessionName]);
  }
}
```

### Integration with WorktreeManager

```javascript
// scripts/worktree-web/server.mjs

import { TmuxPtyBridge } from './tmux-pty-bridge.mjs';

class WorktreeTerminalManager {
  async createOrAttachTerminal(worktreeName, type = 'shell') {
    const sessionName = `${worktreeName}-${type}`;
    const worktreePath = this.getWorktreePath(worktreeName);

    // Check if we already have a bridge for this session
    if (this.terminals.has(sessionName)) {
      return this.terminals.get(sessionName);
    }

    // Create new bridge (will attach to existing session if it exists)
    const bridge = new TmuxPtyBridge(sessionName, worktreePath);
    await bridge.attach();

    this.terminals.set(sessionName, bridge);
    return bridge;
  }

  async pauseWorktree(worktreeName) {
    // Detach from tmux sessions (but don't kill them)
    const shells = ['shell', 'claude', 'codex', 'gemini'];
    for (const type of shells) {
      const sessionName = `${worktreeName}-${type}`;
      const bridge = this.terminals.get(sessionName);
      if (bridge) {
        await bridge.detach();
        this.terminals.delete(sessionName);
      }
    }
    // tmux sessions remain alive in background
  }

  async resumeWorktree(worktreeName) {
    // Reattach to existing tmux sessions
    const shells = ['shell', 'claude'];
    for (const type of shells) {
      await this.createOrAttachTerminal(worktreeName, type);
    }
  }
}
```

### Pros
- ✅ **Battle-tested**: tmux is production-grade software
- ✅ **Full persistence**: Survives server restarts, browser disconnects
- ✅ **Process continuity**: Running processes stay alive
- ✅ **Session sharing**: Multiple browsers can attach to same session
- ✅ **Works today**: No custom state management needed

### Cons
- ❌ **Dependency**: Requires tmux installed on host
- ❌ **Control mode complexity**: Parsing tmux control protocol
- ❌ **No Windows support**: tmux is Unix-only (WSL required)
- ❌ **Contradicts earlier decision**: User wanted to remove tmux CLI

### Resource Impact
- **Memory**: +5MB per tmux session (negligible)
- **CPU**: +0.1% per session (negligible)

---

## Option 2: Terminal State Serialization

### Architecture

```
┌─────────────────────────────────────────────┐
│         Web Browser (xterm.js)              │
│  - Serialize on disconnect                  │
│  - Restore on reconnect                     │
└─────────────┬───────────────────────────────┘
              │ WebSocket + State Transfer
┌─────────────▼───────────────────────────────┐
│     WebSocket Server (Express + ws)         │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  PersistentPtyManager                │  │
│  │  - Save state on disconnect          │  │
│  │  - Replay history on reconnect       │  │
│  └──────────┬───────────────────────────┘  │
└─────────────┼───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  .vibe/sessions/{worktree}/                 │
│    shell.json                               │
│    claude.json                              │
│    codex.json                               │
└─────────────────────────────────────────────┘
```

### Session State Schema

```javascript
// .vibe/sessions/feature-auth/shell.json
{
  "version": 1,
  "worktree": "feature-auth",
  "type": "shell",
  "pid": null,  // Process not persisted
  "cwd": "/Users/tim/code/project/.worktrees/feature-auth",
  "env": {
    "COMPOSE_PROJECT_NAME": "vibe-feature-auth",
    "PATH": "/usr/local/bin:/usr/bin:/bin"
  },
  "history": [
    "git status",
    "npm test",
    "docker compose ps"
  ],
  "scrollback": [
    "On branch feature/auth",
    "Your branch is up to date with 'origin/feature/auth'.",
    "",
    "nothing to commit, working tree clean",
    "$ npm test",
    "  ✓ port-registry.test.js (3 tests)",
    "  ✓ worktree-manager.test.js (12 tests)",
    "",
    "Test Files  2 passed (2)",
    "     Tests  15 passed (15)",
    "  Start at  10:23:14",
    "  Duration  1.23s"
  ],
  "lastActivity": "2025-10-27T10:25:30.123Z"
}
```

### Implementation

```javascript
// scripts/worktree-web/persistent-pty-manager.mjs

import { spawn } from 'node-pty';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class PersistentPtyManager {
  constructor() {
    this.ptys = new Map();
    this.stateDir = join(process.cwd(), '.vibe', 'sessions');
  }

  async createOrRestorePty(worktreeName, type, worktreePath) {
    const sessionId = `${worktreeName}-${type}`;

    // Check for existing state
    const state = await this.loadState(sessionId);

    // Create new PTY
    const shell = process.env.SHELL || '/bin/bash';
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: state?.cwd || worktreePath,
      env: {
        ...process.env,
        ...state?.env,
        HISTFILE: join(this.stateDir, sessionId, '.bash_history')
      }
    });

    // Restore command history (if shell supports it)
    if (state?.history) {
      await this.restoreHistory(sessionId, state.history);
    }

    // Track PTY state
    const ptyState = {
      sessionId,
      pty,
      worktreeName,
      type,
      scrollback: state?.scrollback || [],
      history: state?.history || [],
      cwd: state?.cwd || worktreePath
    };

    // Listen for output to capture scrollback
    pty.onData((data) => {
      ptyState.scrollback.push(data);
      // Keep only last 1000 lines
      if (ptyState.scrollback.length > 1000) {
        ptyState.scrollback.shift();
      }
    });

    // Track CWD changes (if possible)
    this.trackWorkingDirectory(pty, ptyState);

    this.ptys.set(sessionId, ptyState);

    return {
      pty,
      state: ptyState,
      // Send scrollback to client on connect
      restoredScrollback: state?.scrollback || []
    };
  }

  async saveState(sessionId) {
    const state = this.ptys.get(sessionId);
    if (!state) return;

    const sessionPath = join(this.stateDir, sessionId);
    await mkdir(sessionPath, { recursive: true });

    const stateData = {
      version: 1,
      worktree: state.worktreeName,
      type: state.type,
      cwd: state.cwd,
      env: {
        COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME
      },
      history: state.history.slice(-100), // Last 100 commands
      scrollback: state.scrollback.slice(-500), // Last 500 lines
      lastActivity: new Date().toISOString()
    };

    await writeFile(
      join(sessionPath, 'state.json'),
      JSON.stringify(stateData, null, 2)
    );
  }

  async loadState(sessionId) {
    try {
      const sessionPath = join(this.stateDir, sessionId, 'state.json');
      const data = await readFile(sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async restoreHistory(sessionId, history) {
    const historyPath = join(this.stateDir, sessionId, '.bash_history');
    await writeFile(historyPath, history.join('\n'));
  }

  trackWorkingDirectory(pty, state) {
    // Inject PWD tracking into shell
    // This is shell-specific and hacky, but works
    pty.write('export PROMPT_COMMAND="pwd > /tmp/.vibe_cwd_$$; $PROMPT_COMMAND"\n');

    // Periodically read CWD file
    setInterval(async () => {
      try {
        const cwdFile = `/tmp/.vibe_cwd_${pty.pid}`;
        const cwd = await readFile(cwdFile, 'utf-8');
        state.cwd = cwd.trim();
      } catch {}
    }, 5000);
  }

  async closePty(sessionId, { save = true } = {}) {
    const state = this.ptys.get(sessionId);
    if (!state) return;

    if (save) {
      await this.saveState(sessionId);
    }

    state.pty.kill();
    this.ptys.delete(sessionId);
  }
}
```

### WebSocket Integration

```javascript
// scripts/worktree-web/server.mjs

wss.on('connection', async (ws, req) => {
  const { worktree, type } = parseQuery(req.url);

  // Create or restore PTY with scrollback
  const { pty, restoredScrollback } = await ptyManager.createOrRestorePty(
    worktree,
    type,
    getWorktreePath(worktree)
  );

  // Send restored scrollback to client
  if (restoredScrollback.length > 0) {
    ws.send(JSON.stringify({
      type: 'restore',
      scrollback: restoredScrollback
    }));
  }

  // Forward PTY output to WebSocket
  pty.onData((data) => {
    ws.send(data);
  });

  // Forward WebSocket input to PTY
  ws.on('message', (data) => {
    pty.write(data);
  });

  // Save state on disconnect
  ws.on('close', async () => {
    await ptyManager.saveState(`${worktree}-${type}`);
  });
});
```

### Client-Side Restoration

```javascript
// scripts/worktree-web/public/terminal.js

const terminal = new Terminal({
  scrollback: 10000,
  theme: { ... }
});

const ws = new WebSocket(`ws://localhost:3001/terminal?worktree=${name}&type=${type}`);

ws.onmessage = (event) => {
  const data = event.data;

  // Check if this is a restore message
  if (typeof data === 'string' && data.startsWith('{')) {
    const msg = JSON.parse(data);
    if (msg.type === 'restore') {
      // Clear terminal
      terminal.clear();
      // Write restored scrollback
      msg.scrollback.forEach(line => terminal.write(line));
      return;
    }
  }

  // Normal terminal output
  terminal.write(data);
};
```

### Pros
- ✅ **No external dependencies**: Pure Node.js
- ✅ **Cross-platform**: Works on Windows, macOS, Linux
- ✅ **Lightweight**: Only stores state, not running processes
- ✅ **Configurable**: Control what gets persisted
- ✅ **Aligns with current architecture**: Extends existing node-pty approach

### Cons
- ❌ **No process continuity**: Running commands are killed
- ❌ **Limited history tracking**: Shell-dependent, not perfect
- ❌ **Custom implementation**: More code to maintain
- ❌ **CWD tracking is hacky**: Relies on shell hooks

### Resource Impact
- **Memory**: +10MB per worktree (state storage)
- **Disk**: ~100KB per session
- **CPU**: Negligible (only on connect/disconnect)

---

## Option 3: Process Supervision + Reconnection

### Architecture

```
┌─────────────────────────────────────────────┐
│         Web Browser (xterm.js)              │
└─────────────┬───────────────────────────────┘
              │ WebSocket (reconnectable)
┌─────────────▼───────────────────────────────┐
│     WebSocket Server (Express + ws)         │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  PtyPool (keeps PTYs alive)          │  │
│  │  - PTYs never killed on disconnect   │  │
│  │  - WebSocket reconnects to same PTY  │  │
│  └──────────┬───────────────────────────┘  │
└─────────────┼───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│     Long-lived PTY Processes                │
│  - feature-auth-shell (PID 12345)           │
│  - feature-auth-claude (PID 12346)          │
│  - bugfix-login-codex (PID 12347)           │
└─────────────────────────────────────────────┘
```

### Implementation

```javascript
// scripts/worktree-web/pty-pool.mjs

import { spawn } from 'node-pty';
import { EventEmitter } from 'node:events';

export class PtyPool extends EventEmitter {
  constructor() {
    super();
    this.ptys = new Map(); // sessionId -> { pty, buffer, clients }
    this.maxBufferLines = 1000;
  }

  getOrCreatePty(sessionId, options) {
    let entry = this.ptys.get(sessionId);

    if (!entry) {
      // Create new PTY
      const pty = spawn(options.shell || process.env.SHELL, [], {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 30,
        cwd: options.cwd,
        env: options.env
      });

      // Buffer output for late joiners
      const buffer = [];
      pty.onData((data) => {
        buffer.push(data);
        if (buffer.length > this.maxBufferLines) {
          buffer.shift();
        }

        // Broadcast to all connected clients
        entry.clients.forEach(ws => {
          if (ws.readyState === 1) { // OPEN
            ws.send(data);
          }
        });
      });

      entry = {
        pty,
        buffer,
        clients: new Set(),
        created: Date.now(),
        lastActivity: Date.now()
      };

      this.ptys.set(sessionId, entry);

      // Handle PTY exit
      pty.onExit(({ exitCode, signal }) => {
        this.emit('pty-exit', sessionId, exitCode, signal);
        this.ptys.delete(sessionId);
      });
    }

    return entry;
  }

  attachClient(sessionId, ws) {
    const entry = this.ptys.get(sessionId);
    if (!entry) {
      throw new Error(`PTY ${sessionId} not found`);
    }

    // Send buffered output to new client
    entry.buffer.forEach(data => ws.send(data));

    // Add to client set
    entry.clients.add(ws);
    entry.lastActivity = Date.now();

    // Forward input from this client to PTY
    const inputHandler = (data) => {
      entry.pty.write(data);
      entry.lastActivity = Date.now();
    };

    ws.on('message', inputHandler);

    // Remove client on disconnect
    ws.on('close', () => {
      entry.clients.delete(ws);
      ws.off('message', inputHandler);
    });

    return {
      sessionId,
      bufferedLines: entry.buffer.length,
      clients: entry.clients.size
    };
  }

  detachClient(sessionId, ws) {
    const entry = this.ptys.get(sessionId);
    if (entry) {
      entry.clients.delete(ws);
    }
  }

  killPty(sessionId) {
    const entry = this.ptys.get(sessionId);
    if (entry) {
      entry.pty.kill();
      entry.clients.forEach(ws => ws.close());
      this.ptys.delete(sessionId);
    }
  }

  // Clean up idle PTYs
  startIdleCleanup(idleTimeoutMs = 3600000) { // 1 hour
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, entry] of this.ptys.entries()) {
        const idle = now - entry.lastActivity;
        if (entry.clients.size === 0 && idle > idleTimeoutMs) {
          console.log(`Killing idle PTY: ${sessionId} (idle for ${idle}ms)`);
          this.killPty(sessionId);
        }
      }
    }, 60000); // Check every minute
  }

  getStats() {
    return Array.from(this.ptys.entries()).map(([sessionId, entry]) => ({
      sessionId,
      clients: entry.clients.size,
      bufferLines: entry.buffer.length,
      uptime: Date.now() - entry.created,
      lastActivity: Date.now() - entry.lastActivity
    }));
  }
}
```

### WebSocket Server Integration

```javascript
// scripts/worktree-web/server.mjs

import { PtyPool } from './pty-pool.mjs';

const ptyPool = new PtyPool();
ptyPool.startIdleCleanup(3600000); // Kill idle PTYs after 1 hour

wss.on('connection', (ws, req) => {
  const { worktree, type } = parseQuery(req.url);
  const sessionId = `${worktree}-${type}`;
  const worktreePath = getWorktreePath(worktree);

  // Get or create PTY
  const entry = ptyPool.getOrCreatePty(sessionId, {
    cwd: worktreePath,
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: `vibe-${worktree}`
    }
  });

  // Attach this WebSocket client
  const attachInfo = ptyPool.attachClient(sessionId, ws);

  console.log(`Client connected to ${sessionId}`, attachInfo);

  ws.on('close', () => {
    console.log(`Client disconnected from ${sessionId}`);
  });
});

// API endpoint to see PTY stats
app.get('/api/pty-stats', (req, res) => {
  res.json(ptyPool.getStats());
});
```

### Pause/Resume Integration

```javascript
class WorktreeManager {
  async pauseWorktree(worktreeName) {
    // Stop containers
    await this.stopContainers(worktreeName);

    // PTYs remain alive in ptyPool
    // Clients can still reconnect

    // Mark as paused
    this.registry.setPaused(worktreeName, true);
  }

  async resumeWorktree(worktreeName) {
    // Start containers
    await this.startContainers(worktreeName);

    // PTYs are already running, no action needed

    // Mark as active
    this.registry.setPaused(worktreeName, false);
  }

  async deleteWorktree(worktreeName) {
    // Kill all PTYs for this worktree
    const types = ['shell', 'claude', 'codex', 'gemini'];
    for (const type of types) {
      const sessionId = `${worktreeName}-${type}`;
      ptyPool.killPty(sessionId);
    }

    // Continue with normal deletion
    await this.gitWorktree.remove(worktreeName);
    await this.stopContainers(worktreeName);
  }
}
```

### Pros
- ✅ **Process continuity**: Long-running processes stay alive
- ✅ **Simple reconnection**: Browser refresh = instant reconnect
- ✅ **Multiple clients**: Multiple browsers can connect to same PTY
- ✅ **No external dependencies**: Pure Node.js
- ✅ **Perfect for AI agents**: Long conversations preserved

### Cons
- ❌ **No persistence across server restart**: PTYs die when Node.js exits
- ❌ **Resource usage**: PTYs consume memory even when disconnected
- ❌ **Idle cleanup needed**: Must kill abandoned PTYs
- ❌ **Not true persistence**: Doesn't survive machine reboot

### Resource Impact
- **Memory**: +30MB per active PTY
- **CPU**: +0.5% per PTY
- **Risk**: Resource leak if cleanup fails

---

## Option 4: Hybrid Approach (RECOMMENDED)

Combine **Process Supervision** (Option 3) with **State Serialization** (Option 2) for best of both worlds.

### Architecture

```
┌─────────────────────────────────────────────┐
│         Web Browser (xterm.js)              │
└─────────────┬───────────────────────────────┘
              │ WebSocket
┌─────────────▼───────────────────────────────┐
│     PtyPool (keeps PTYs alive)              │
│  - Buffers output for reconnections         │
│  - Periodically saves state to disk         │
│  - Restores state on server restart         │
└─────────────┬───────────────────────────────┘
              │
      ┌───────┴────────┐
      │                │
┌─────▼─────┐   ┌──────▼──────┐
│ Live PTYs │   │ Disk State  │
│ (runtime) │   │ (fallback)  │
└───────────┘   └─────────────┘
```

### Implementation

```javascript
// scripts/worktree-web/hybrid-pty-manager.mjs

import { PtyPool } from './pty-pool.mjs';
import { PersistentPtyManager } from './persistent-pty-manager.mjs';

export class HybridPtyManager {
  constructor() {
    this.pool = new PtyPool();
    this.persistence = new PersistentPtyManager();
    this.saveIntervalMs = 60000; // Save state every minute

    // Auto-save state periodically
    this.startAutoSave();

    // Restore state on startup
    this.restoreAllSessions();

    // Save state on graceful shutdown
    this.setupGracefulShutdown();
  }

  async getOrCreatePty(worktreeName, type, worktreePath) {
    const sessionId = `${worktreeName}-${type}`;

    // Try to get live PTY first
    let entry = this.pool.ptys.get(sessionId);

    if (!entry) {
      // No live PTY, check for saved state
      const state = await this.persistence.loadState(sessionId);

      // Create new PTY
      entry = this.pool.getOrCreatePty(sessionId, {
        cwd: state?.cwd || worktreePath,
        env: {
          ...process.env,
          ...state?.env,
          COMPOSE_PROJECT_NAME: `vibe-${worktreeName}`
        }
      });

      // If we had saved state, restore it
      if (state) {
        // Send scrollback to buffer so clients get history
        state.scrollback.forEach(line => {
          entry.buffer.push(line);
        });

        // Restore command history
        await this.persistence.restoreHistory(sessionId, state.history);
      }
    }

    return entry;
  }

  attachClient(worktreeName, type, ws) {
    const sessionId = `${worktreeName}-${type}`;
    return this.pool.attachClient(sessionId, ws);
  }

  startAutoSave() {
    setInterval(async () => {
      for (const [sessionId, entry] of this.pool.ptys.entries()) {
        // Only save if has activity
        if (entry.clients.size > 0 || entry.buffer.length > 0) {
          await this.saveSession(sessionId, entry);
        }
      }
    }, this.saveIntervalMs);
  }

  async saveSession(sessionId, entry) {
    const [worktreeName, type] = sessionId.split('-');

    const state = {
      version: 1,
      worktree: worktreeName,
      type,
      cwd: entry.cwd || process.cwd(), // Would need to track this
      env: {
        COMPOSE_PROJECT_NAME: `vibe-${worktreeName}`
      },
      scrollback: entry.buffer.slice(-500), // Last 500 lines
      lastActivity: new Date().toISOString()
    };

    await this.persistence.saveStateData(sessionId, state);
  }

  async restoreAllSessions() {
    // On server startup, check for saved sessions
    const sessions = await this.persistence.listSessions();

    console.log(`Found ${sessions.length} saved terminal sessions`);

    // Don't recreate PTYs yet - wait for client to connect
    // But we have the state ready to restore
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Received ${signal}, saving terminal state...`);

      // Save all active sessions
      for (const [sessionId, entry] of this.pool.ptys.entries()) {
        await this.saveSession(sessionId, entry);
      }

      console.log('Terminal state saved. Exiting.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async pauseWorktree(worktreeName) {
    // Save state for all terminals in this worktree
    const types = ['shell', 'claude', 'codex', 'gemini'];
    for (const type of types) {
      const sessionId = `${worktreeName}-${type}`;
      const entry = this.pool.ptys.get(sessionId);
      if (entry) {
        await this.saveSession(sessionId, entry);
      }
    }

    // Kill PTYs to free resources (state is saved)
    for (const type of types) {
      const sessionId = `${worktreeName}-${type}`;
      this.pool.killPty(sessionId);
    }
  }

  async resumeWorktree(worktreeName) {
    // PTYs will be recreated when client connects
    // State will be restored from disk automatically
  }
}
```

### Behavior Matrix

| Event | Live PTY? | Saved State? | Result |
|-------|-----------|--------------|--------|
| Browser refresh | ✅ Yes | N/A | Instant reconnect with full history |
| Server restart | ❌ No | ✅ Yes | New PTY, scrollback restored |
| Worktree pause | ❌ No | ✅ Yes | PTY killed, state saved |
| Worktree resume | ❌ No | ✅ Yes | New PTY, state restored |
| Idle timeout | ❌ No | ✅ Yes | PTY killed, state saved |
| Machine reboot | ❌ No | ✅ Yes | State persists on disk |

### Pros
- ✅ **Best of both worlds**: Process continuity + persistent state
- ✅ **Resilient**: Survives server restarts and reboots
- ✅ **Resource efficient**: Can kill idle PTYs without losing state
- ✅ **Transparent**: Clients don't know if PTY is live or restored
- ✅ **Production-ready**: Handles edge cases gracefully

### Cons
- ❌ **Most complex**: Two systems to maintain
- ❌ **State drift**: Running process state may differ from saved state
- ❌ **Disk I/O**: Periodic writes (mitigated with batching)

### Resource Impact
- **Memory**: +30MB per live PTY, +10MB state overhead
- **Disk**: ~100KB per session
- **CPU**: +0.5% per live PTY, negligible for state saves

---

## Comparison Matrix

| Feature | tmux | State Serialization | Process Supervision | Hybrid |
|---------|------|---------------------|---------------------|--------|
| **Survives browser refresh** | ✅ | ⚠️ With setup | ✅ | ✅ |
| **Survives server restart** | ✅ | ⚠️ Partial | ❌ | ✅ |
| **Survives reboot** | ❌ | ✅ | ❌ | ✅ |
| **Process continuity** | ✅ | ❌ | ✅ | ✅ |
| **No external deps** | ❌ | ✅ | ✅ | ✅ |
| **Cross-platform** | ⚠️ Unix only | ✅ | ✅ | ✅ |
| **Resource efficient** | ✅ | ✅ | ⚠️ Leak risk | ✅ |
| **Implementation complexity** | Medium | Medium | Low | High |
| **Aligns with architecture** | ❌ | ✅ | ✅ | ✅ |

---

## Recommendation: Hybrid Approach

### Why Hybrid?

1. **Matches user requirements**:
   - ✅ No tmux (user wanted to remove CLI interface)
   - ✅ Survives browser refreshes (most common case)
   - ✅ Survives server restarts (deployment scenario)
   - ✅ Survives reboots (machine crashes)
   - ✅ Process continuity for AI agents

2. **Resource efficient**:
   - Kill idle PTYs without losing state
   - Pause/resume worktrees frees resources
   - Auto-cleanup prevents leaks

3. **Production-ready**:
   - Graceful shutdown handling
   - Error recovery
   - Multiple client support
   - Audit trail (saved state = logs)

### Implementation Timeline

**Phase 1** (Week 1): Process Supervision
- Implement PtyPool
- WebSocket reconnection
- Test browser refresh scenarios

**Phase 2** (Week 2): State Serialization
- Implement PersistentPtyManager
- Schema design
- Save/restore logic

**Phase 3** (Week 3): Integration
- Combine into HybridPtyManager
- Graceful shutdown
- Pause/resume support

**Phase 4** (Week 4): Polish
- Idle cleanup
- Resource monitoring
- Error handling
- UI indicators (restored vs live)

---

## UI Considerations

### Connection States

Show user what's happening:

```
┌─────────────────────────────────────────┐
│ feature-auth › shell                    │
│ ● Connected (live)                      │
│ ├─ Uptime: 2h 15m                       │
│ ├─ Activity: 30s ago                    │
│ └─ 2 clients connected                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ feature-auth › claude                   │
│ ↻ Reconnecting...                       │
│ └─ Restoring session from 5m ago       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ bugfix-login › shell                    │
│ ⏸ Paused                                │
│ └─ Resume to restore session            │
└─────────────────────────────────────────┘
```

### Session Management UI

Add to worktree card:

```javascript
// Terminal session info
<div class="terminal-sessions">
  <button onclick="viewTerminal('feature-auth', 'shell')">
    Shell (● live, 2h uptime)
  </button>
  <button onclick="viewTerminal('feature-auth', 'claude')">
    Claude (↻ restored 5m ago)
  </button>
</div>
```

---

## Security Considerations

### Saved State Contains Sensitive Data

**Risk**: Scrollback may contain secrets, API keys, passwords

**Mitigation**:
```javascript
const SENSITIVE_PATTERNS = [
  /password[=:]\s*\S+/gi,
  /api[_-]?key[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
  /secret[=:]\s*\S+/gi
];

function sanitizeScrollback(lines) {
  return lines.map(line => {
    let sanitized = line;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, (match) => {
        return match.replace(/\S+$/, '***REDACTED***');
      });
    }
    return sanitized;
  });
}
```

### State File Permissions

```javascript
await writeFile(statePath, data, {
  mode: 0o600  // Owner read/write only
});
```

### Cleanup on Worktree Delete

```javascript
async deleteWorktree(worktreeName) {
  // Delete all terminal state
  const sessionDir = join('.vibe/sessions', worktreeName);
  await rm(sessionDir, { recursive: true, force: true });

  // Kill live PTYs
  for (const type of ['shell', 'claude', 'codex']) {
    this.ptyManager.pool.killPty(`${worktreeName}-${type}`);
  }
}
```

---

## Testing Strategy

### Unit Tests

```javascript
// tests/pty-pool.test.js
describe('PtyPool', () => {
  it('reuses PTY for reconnections', async () => {
    const pool = new PtyPool();
    const entry1 = pool.getOrCreatePty('test', { cwd: '/tmp' });
    const entry2 = pool.getOrCreatePty('test', { cwd: '/tmp' });
    expect(entry1.pty).toBe(entry2.pty);
  });

  it('buffers output for late joiners', async () => {
    const pool = new PtyPool();
    const entry = pool.getOrCreatePty('test', { cwd: '/tmp' });

    // Simulate output
    entry.pty.write('echo hello\n');
    await sleep(100);

    // New client should get buffer
    const ws = new MockWebSocket();
    pool.attachClient('test', ws);

    expect(ws.received).toContain('hello');
  });
});
```

### Integration Tests

```javascript
// tests/terminal-persistence.integration.test.js
describe('Terminal Persistence', () => {
  it('survives server restart', async () => {
    const server1 = await startServer();
    const client1 = new WebSocket(`ws://localhost:3001/terminal?worktree=test`);

    // Send command
    client1.send('echo "persistence test"\n');
    await sleep(100);

    // Shutdown server (gracefully)
    await server1.shutdown();

    // Start new server
    const server2 = await startServer();
    const client2 = new WebSocket(`ws://localhost:3001/terminal?worktree=test`);

    // Wait for restore
    const messages = [];
    client2.on('message', msg => messages.push(msg));
    await sleep(500);

    // Should see "persistence test" in scrollback
    expect(messages.join('')).toContain('persistence test');
  });
});
```

---

## Migration Path

### Phase 0: Current State (No Persistence)
```javascript
// Existing code - PTYs die on disconnect
const pty = spawn(shell, [], { ... });
ws.on('close', () => pty.kill());
```

### Phase 1: Add Process Supervision
```javascript
// PTYs stay alive, clients reconnect
const ptyPool = new PtyPool();
const entry = ptyPool.getOrCreatePty(sessionId, options);
ptyPool.attachClient(sessionId, ws);
```

### Phase 2: Add State Serialization
```javascript
// Save state periodically
setInterval(() => {
  ptyPool.saveAllStates();
}, 60000);
```

### Phase 3: Integrate Hybrid
```javascript
// Final architecture
const hybridManager = new HybridPtyManager();
const entry = await hybridManager.getOrCreatePty(worktree, type, path);
hybridManager.attachClient(worktree, type, ws);
```

---

## Open Questions for User

1. **Idle timeout**: How long should PTYs stay alive with no clients? (Recommended: 1 hour)

2. **Scrollback size**: How much history to keep? (Recommended: 1000 lines = ~100KB)

3. **State save frequency**: How often to save to disk? (Recommended: 60 seconds)

4. **AI conversation persistence**: Should we add special handling for AI agent state? (e.g., conversation history, MCP tool state)

5. **Session sharing**: Should multiple users be able to connect to same terminal? (Affects multi-user support decision)

---

## Next Steps

1. **Get user approval** on Hybrid approach
2. **Update REFACTORING-PLAN.md** to include terminal persistence
   - Add to Phase 2 (after container runtime abstraction)
   - Estimated: 1 week of development + testing
3. **Create tests** before implementation (TDD)
4. **Implement in phases** (supervision → serialization → hybrid)
5. **Document behavior** in CLAUDE.md for future AI agents

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Status**: Design Proposal - Awaiting User Approval
**Recommended**: Option 4 (Hybrid Approach)
