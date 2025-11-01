/**
 * Claude Agent - Anthropic's Claude Code CLI
 *
 * Official CLI for Claude Code with integrated MCP support.
 */

import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export class ClaudeAgent extends AgentInterface {
  constructor(config = {}) {
    super('claude', config);
  }

  async spawn(worktreePath, options = {}) {
    // Update Claude before launching
    try {
      console.log('[Claude Agent] Updating Claude Code...');
      execSync('claude update', {
        stdio: 'ignore',
        timeout: 30000
      });
    } catch (error) {
      console.warn('[Claude Agent] Update failed, continuing with existing version:', error.message);
    }

    const env = {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    };

    return pty.spawn('claude', [], {
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
      const output = execSync('claude --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000
      });
      return output.trim();
    } catch (error) {
      throw new Error('Claude Code CLI not installed (run: npm install -g @anthropic-ai/claude-code)');
    }
  }

  async isInstalled() {
    // Check if claude command is available globally
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
    // Claude should be installed globally
    try {
      execSync('npm install -g @anthropic-ai/claude-code', {
        stdio: 'inherit',
        timeout: 60000
      });
      return {
        success: true,
        message: 'Claude Code installed globally'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install Claude Code: ${error.message}`
      };
    }
  }

  async update() {
    // Use claude update command
    try {
      execSync('claude update', {
        stdio: 'inherit',
        timeout: 30000
      });
      return {
        success: true,
        message: 'Claude Code updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update Claude Code: ${error.message}`
      };
    }
  }
}
