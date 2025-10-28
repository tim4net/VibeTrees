import { randomUUID } from 'crypto';
import pty from 'node-pty';

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
