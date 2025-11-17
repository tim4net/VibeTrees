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
  captureState(sessionId, session) {
    // Validate session has required xterm components
    if (!session || !session.xterm || !session.serializeAddon) {
      // Fallback for legacy PTY-only sessions
      const state = {
        sessionId,
        buffer: [],
        dimensions: { cols: 80, rows: 24 },
        timestamp: Date.now()
      };

      // Try legacy _terminal access for backward compat
      if (session && session._terminal) {
        const terminal = session._terminal;
        const buffer = terminal.buffer.active;
        state.dimensions = { cols: terminal.cols, rows: terminal.rows };
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) state.buffer.push(line.translateToString());
        }
      }

      return state;
    }

    // New xterm-headless path
    try {
      const DEFAULT_SCROLLBACK = 10000;
      const state = {
        sessionId,
        serialized: session.serializeAddon.serialize({
          scrollback: DEFAULT_SCROLLBACK
        }),
        dimensions: {
          cols: session.xterm.cols,
          rows: session.xterm.rows
        },
        timestamp: Date.now()
      };

      return state;
    } catch (error) {
      console.error(`Failed to capture terminal state:`, error.message);
      return null;
    }
  }

  /**
   * Save state to filesystem
   * @param {object} state - Terminal state
   */
  async saveState(state) {
    const sessionDir = path.join(this.baseDir, state.sessionId);

    // Use async versions - NO BLOCKING
    try {
      await fs.promises.mkdir(sessionDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const statePath = path.join(sessionDir, 'pty-state.json');

    // Async write - NO BLOCKING (remove pretty-print for performance)
    await fs.promises.writeFile(
      statePath,
      JSON.stringify(state),
      'utf-8'
    );
  }

  /**
   * Load state from filesystem
   * @param {string} sessionId - Session ID
   * @returns {object|null} Terminal state or null if not found
   */
  async loadState(sessionId) {
    const statePath = path.join(this.baseDir, sessionId, 'pty-state.json');

    try {
      // Check if exists asynchronously
      await fs.promises.access(statePath, fs.constants.F_OK);
      const data = await fs.promises.readFile(statePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete state from filesystem
   * @param {string} sessionId - Session ID
   */
  async deleteState(sessionId) {
    const sessionDir = path.join(this.baseDir, sessionId);

    try {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
      if (error.code !== 'ENOENT') {
        console.error(`Error deleting session state: ${error.message}`);
      }
    }
  }
}
