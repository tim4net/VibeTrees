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
