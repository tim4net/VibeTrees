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
    const args = this.getDefaultArgs();
    const env = {
      ...process.env,
      ...this.getEnvironmentVariables(worktreePath),
      ...options.env
    };

    return pty.spawn('npx', args, {
      cwd: worktreePath,
      env,
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return ['-y', '@anthropic-ai/claude-code@latest'];
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
      const output = execSync('npx -y @anthropic-ai/claude-code@latest --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000
      });
      return output.trim();
    } catch (error) {
      throw new Error('Claude Code CLI not accessible');
    }
  }

  async isInstalled() {
    // Claude is installed via npx, so it's always "available"
    // but we can check if it runs
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
    // Claude is installed via npx, no explicit install needed
    return {
      success: true,
      message: 'Claude Code is installed via npx (no action needed)'
    };
  }

  async update() {
    // npx always fetches latest, so no explicit update needed
    return {
      success: true,
      message: 'Claude Code auto-updates via npx @latest'
    };
  }
}
