/**
 * Codex Agent - OpenAI's Codex CLI (via Context7 MCP)
 *
 * Note: This assumes a hypothetical Codex CLI. Adjust package name
 * when official CLI is available.
 */

import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export class CodexAgent extends AgentInterface {
  constructor(config = {}) {
    super('codex', config);
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
    // Note: Package name is hypothetical - adjust when official CLI exists
    return ['-y', '@openai/codex-cli@latest'];
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.codex');
  }

  needsCacheClear() {
    return false;
  }

  getDisplayName() {
    return 'OpenAI Codex';
  }

  getIcon() {
    return '🔮';
  }

  async checkVersion() {
    try {
      const output = execSync('npx -y @openai/codex-cli@latest --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000
      });
      return output.trim();
    } catch (error) {
      throw new Error('Codex CLI not accessible');
    }
  }

  async isInstalled() {
    try {
      await this.checkVersion();
      return true;
    } catch (error) {
      return false;
    }
  }

  getEnvironmentVariables(worktreePath) {
    const env = {};

    // Check if .codex/settings.json exists
    const settingsPath = join(worktreePath, '.codex', 'settings.json');
    if (existsSync(settingsPath)) {
      env.CODEX_SETTINGS_PATH = settingsPath;
    }

    // Codex requires OpenAI API key
    if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }

    return env;
  }

  getCapabilities() {
    return [
      'Code Generation',
      'Code Completion',
      'Refactoring',
      'Testing',
      'Documentation',
      'Code Explanation'
    ];
  }

  validateConfig() {
    const errors = [];

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY environment variable not set');
    }

    // Check if .codex directory exists
    if (this.config.worktreePath) {
      const codexDir = this.getConfigPath(this.config.worktreePath);
      if (!existsSync(codexDir)) {
        errors.push('.codex directory not found (will be created on first run)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async installDependencies() {
    return {
      success: true,
      message: 'Codex is installed via npx (no action needed)'
    };
  }

  async update() {
    return {
      success: true,
      message: 'Codex auto-updates via npx @latest'
    };
  }
}
