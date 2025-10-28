/**
 * Shell Agent - Plain shell (no AI)
 *
 * Provides a standard shell environment without AI assistance.
 * Useful for manual operations and debugging.
 */

import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';
import { platform } from 'os';
import { join } from 'path';

export class ShellAgent extends AgentInterface {
  constructor(config = {}) {
    super('shell', config);
  }

  async spawn(worktreePath, options = {}) {
    const shell = this._getShell();
    const env = {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    };

    return pty.spawn(shell, [], {
      cwd: worktreePath,
      env,
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return []; // Shell spawned directly, no args needed
  }

  getConfigPath(worktreePath) {
    // Shell doesn't have a config directory
    return null;
  }

  needsCacheClear() {
    return false;
  }

  getDisplayName() {
    return 'Shell';
  }

  getIcon() {
    return '💻';
  }

  async checkVersion() {
    const shell = this._getShell();
    return `${shell} (system default)`;
  }

  async isInstalled() {
    // Shell is always available
    return true;
  }

  _getShell() {
    // Get user's shell or default based on platform
    if (process.env.SHELL) {
      return process.env.SHELL;
    }

    switch (platform()) {
      case 'win32':
        return process.env.COMSPEC || 'cmd.exe';
      case 'darwin':
      case 'linux':
        return '/bin/bash';
      default:
        return 'sh';
    }
  }

  getEnvironmentVariables(worktreePath) {
    return {
      // Set PS1 prompt to show worktree name
      PS1: `\\[\\033[36m\\][vibe]\\[\\033[0m\\] \\w $ `
    };
  }

  getCapabilities() {
    return [
      'Direct Shell Access',
      'System Commands',
      'File Operations',
      'Git Commands',
      'Docker Commands'
    ];
  }

  validateConfig() {
    return { valid: true, errors: [] };
  }

  async installDependencies() {
    return {
      success: true,
      message: 'Shell is provided by the operating system'
    };
  }

  async update() {
    return {
      success: true,
      message: 'Shell is managed by the operating system'
    };
  }
}
