/**
 * Claude Agent - Anthropic's Claude Code CLI (Native Binary)
 *
 * Official CLI for Claude Code with integrated MCP support.
 * Uses the native binary installation for better performance and auto-updates.
 */

import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export class ClaudeAgent extends AgentInterface {
  constructor(config = {}) {
    super('claude', config);
  }

  getClaudePath() {
    // Prefer native binary, fallback to PATH
    const nativePath = join(homedir(), '.local', 'bin', 'claude');
    if (existsSync(nativePath)) {
      return nativePath;
    }
    return 'claude'; // Fallback to PATH
  }

  async spawn(worktreePath, options = {}) {
    // Native binary auto-updates on startup, no manual update needed
    const claudePath = this.getClaudePath();
    console.log(`[Claude Agent] Using Claude at: ${claudePath}`);

    const env = {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    };

    return pty.spawn(claudePath, [], {
      cwd: worktreePath,
      env,
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return [];
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.claude');
  }

  needsCacheClear() {
    return false; // Claude handles its own state
  }

  getDisplayName() {
    return 'Claude Code';
  }

  getIcon() {
    return '🤖';
  }

  async checkVersion() {
    try {
      const claudePath = this.getClaudePath();
      const output = execSync(`${claudePath} --version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000
      });
      return output.trim();
    } catch (error) {
      throw new Error('Claude Code native binary not installed (run: curl -fsSL https://claude.ai/install.sh | bash)');
    }
  }

  async isInstalled() {
    // Check if native binary exists
    const nativePath = join(homedir(), '.local', 'bin', 'claude');
    if (existsSync(nativePath)) {
      return true;
    }

    // Fallback: check if claude is in PATH
    try {
      await this.checkVersion();
      return true;
    } catch (error) {
      return false;
    }
  }

  getEnvironmentVariables(worktreePath) {
    const env = {};

    // Check if .claude/settings.json exists (MCP config)
    const settingsPath = join(worktreePath, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      env.CLAUDE_SETTINGS_PATH = settingsPath;
    }

    return env;
  }

  getCapabilities() {
    return [
      'MCP Support',
      'Code Generation',
      'Refactoring',
      'Testing',
      'Documentation',
      'Multi-file Editing'
    ];
  }

  validateConfig() {
    const errors = [];

    // Check if .claude directory exists
    if (this.config.worktreePath) {
      const claudeDir = this.getConfigPath(this.config.worktreePath);
      if (!existsSync(claudeDir)) {
        errors.push('.claude directory not found (will be created on first run)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async installDependencies() {
    // Install native binary
    try {
      execSync('curl -fsSL https://claude.ai/install.sh | bash', {
        stdio: 'inherit',
        timeout: 60000,
        shell: '/bin/bash'
      });
      return {
        success: true,
        message: 'Claude Code native binary installed to ~/.local/bin/claude'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install Claude Code: ${error.message}`
      };
    }
  }

  async update() {
    // Native binary auto-updates on startup
    return {
      success: true,
      message: 'Claude Code native binary auto-updates on startup (no manual update needed)'
    };
  }
}
