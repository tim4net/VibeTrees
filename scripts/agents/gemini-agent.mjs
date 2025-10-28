/**
 * Gemini Agent - Google's Gemini CLI
 *
 * Note: This assumes a hypothetical Gemini CLI. Adjust package name
 * when official CLI is available.
 */

import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

export class GeminiAgent extends AgentInterface {
  constructor(config = {}) {
    super('gemini', config);
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
    return ['-y', 'gemini-cli@latest'];
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.gemini');
  }

  needsCacheClear() {
    return false;
  }

  getDisplayName() {
    return 'Google Gemini';
  }

  getIcon() {
    return '✨';
  }

  async checkVersion() {
    try {
      const output = execSync('npx -y gemini-cli@latest --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 10000
      });
      return output.trim();
    } catch (error) {
      throw new Error('Gemini CLI not accessible');
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

    // Check if .gemini/settings.json exists
    const settingsPath = join(worktreePath, '.gemini', 'settings.json');
    if (existsSync(settingsPath)) {
      env.GEMINI_SETTINGS_PATH = settingsPath;
    }

    // Gemini requires Google API key
    if (process.env.GOOGLE_API_KEY) {
      env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    }

    return env;
  }

  getCapabilities() {
    return [
      'Code Generation',
      'Multi-modal Analysis',
      'Code Explanation',
      'Refactoring',
      'Testing',
      'Documentation'
    ];
  }

  validateConfig() {
    const errors = [];

    // Check for API key
    if (!process.env.GOOGLE_API_KEY) {
      errors.push('GOOGLE_API_KEY environment variable not set');
    }

    // Check if .gemini directory exists
    if (this.config.worktreePath) {
      const geminiDir = this.getConfigPath(this.config.worktreePath);
      if (!existsSync(geminiDir)) {
        errors.push('.gemini directory not found (will be created on first run)');
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
      message: 'Gemini is installed via npx (no action needed)'
    };
  }

  async update() {
    return {
      success: true,
      message: 'Gemini auto-updates via npx @latest'
    };
  }
}
