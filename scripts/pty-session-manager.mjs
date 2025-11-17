import { randomUUID } from 'crypto';
import pty from 'node-pty';
import { PTYStateSerializer } from './pty-state-serializer.mjs';

export class PTYSessionManager {
  constructor(options = {}) {
    this._sessions = new Map();
    this.serializer = options.serializer || new PTYStateSerializer();
    this.autoSaveInterval = options.autoSaveInterval || 5000; // 5 seconds default
    this.orphanTimeout = options.orphanTimeout || 1 * 60 * 60 * 1000; // 1 hour (not 24!)

    // Start cleanup check every 5 minutes (not 1 hour!)
    this._cleanupTimer = setInterval(() => {
      this._cleanupOrphanedSessions();
    }, 5 * 60 * 1000);

    // Start auto-save timer
    this._autoSaveTimer = setInterval(() => {
      this._autoSaveAllSessions();
    }, this.autoSaveInterval);
  }

  /**
   * Auto-save all sessions with xterm terminals
   * @private
   */
  async _autoSaveAllSessions() {
    for (const [sessionId, session] of this._sessions) {
      if (session.xterm && session.serializeAddon) {
        try {
          const state = this.serializer.captureState(sessionId, session);
          if (state) {
            await this.serializer.saveState(state);
          }
        } catch (error) {
          console.error(`Auto-save failed for session ${sessionId}:`, error);
        }
      }
    }
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
      ws: null, // WebSocket reference for takeover notifications
      pty: null,
      activeListener: null, // Track active data listener
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
   * @param {object} ws - WebSocket connection (optional)
   * @returns {object|null} Previous WebSocket if session was taken over, null otherwise
   */
  attachClient(sessionId, clientId, ws = null) {
    const session = this._sessions.get(sessionId);
    if (session) {
      const previousWs = session.ws;
      const wasTakeover = session.connected && previousWs;

      session.connected = true;
      session.clientId = clientId;
      session.ws = ws;
      session.disconnectedAt = null;

      // Return previous WebSocket if this was a takeover
      return wasTakeover ? previousWs : null;
    }
    return null;
  }

  /**
   * Detach WebSocket client from session
   * @param {string} sessionId - Session ID
   */
  detachClient(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.connected = false;
      session.ws = null;
      session.disconnectedAt = new Date();
    }
  }

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

  /**
   * Destroy session and kill PTY process
   * @param {string} sessionId - Session ID
   */
  async destroySession(sessionId) {
    const session = this._sessions.get(sessionId);
    if (session) {
      // Remove active listener if exists
      if (session.pty && session.activeListener) {
        session.pty.removeListener('data', session.activeListener);
        session.activeListener = null;
      }

      if (session.pty) {
        session.pty.kill();
      }

      // DELETE THE SESSION FILES!
      await this.serializer.deleteState(sessionId);

      this._sessions.delete(sessionId);
    }

    // If this is the last session, clean up timers
    if (this._sessions.size === 0) {
      this.destroy();
    }
  }

  /**
   * Recover session state from disk
   * @param {string} sessionId - Session ID
   * @returns {Promise<object|null>} Saved state or null
   */
  async recoverSession(sessionId) {
    return await this.serializer.loadState(sessionId);
  }

  /**
   * Restore terminal from saved state
   * @param {string} sessionId - Session ID
   * @returns {Promise<object|null>} Terminal restoration result with terminal and serializeAddon
   */
  async restoreTerminal(sessionId) {
    const savedState = await this.serializer.loadState(sessionId);

    if (!savedState || !savedState.buffer || !savedState.dimensions) {
      if (savedState) {
        console.error(`Failed to restore terminal:`, new Error('Invalid state structure'));
      }
      return null;
    }

    try {
      const { Terminal } = await import('@xterm/headless');
      const { SerializeAddon } = await import('@xterm/addon-serialize');

      const terminal = new Terminal({
        cols: savedState.dimensions.cols,
        rows: savedState.dimensions.rows,
        allowProposedApi: true
      });
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(serializeAddon);

      // Restore buffer
      for (const line of savedState.buffer) {
        terminal.write(line);
      }

      return {
        terminal,
        serializeAddon
      };
    } catch (error) {
      console.error(`Failed to restore terminal:`, error);
      return null;
    }
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
  async _cleanupOrphanedSessions() {
    const orphans = this.getOrphanedSessions();
    for (const sessionId of orphans) {
      console.log(`Cleaning up orphaned session: ${sessionId}`);
      await this.destroySession(sessionId);
    }
  }

  /**
   * Destroy the session manager and clear all timers
   */
  destroy() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = undefined;
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = undefined;
    }
  }
}
