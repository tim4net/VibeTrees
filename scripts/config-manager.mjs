/**
 * Configuration Manager
 *
 * Manages .vibe/config.json for project-specific settings.
 * Provides validation, defaults, and environment variable overrides.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { execSync } from 'child_process';

/**
 * Default configuration template
 */
const DEFAULT_CONFIG = {
  version: '1.0',
  project: {
    name: null, // Will be auto-detected from directory name
    description: ''
  },
  container: {
    runtime: 'auto', // 'auto', 'docker', or 'podman'
    composeFile: 'docker-compose.yml',
    servicesToLog: [], // Auto-detect if empty
    dataVolumes: [], // Auto-detect if empty
    sudo: 'auto' // 'auto', 'always', or 'never'
  },
  agents: {
    default: 'claude',
    available: ['claude', 'codex', 'gemini', 'shell']
  },
  mcp: {
    autoInstall: true,
    servers: [] // Discovered automatically
  },
  sync: {
    enabled: true,
    baseBranch: 'main', // Auto-detect from git
    autoUpdate: false,
    checkInterval: 300000 // 5 minutes
  }
};

/**
 * Configuration schema validator
 */
const CONFIG_SCHEMA = {
  version: { type: 'string', required: true },
  project: {
    type: 'object',
    required: true,
    properties: {
      name: { type: ['string', 'null'] },
      description: { type: 'string' }
    }
  },
  container: {
    type: 'object',
    required: true,
    properties: {
      runtime: { type: 'string', enum: ['auto', 'docker', 'podman'] },
      composeFile: { type: 'string' },
      servicesToLog: { type: 'array' },
      dataVolumes: { type: 'array' },
      sudo: { type: 'string', enum: ['auto', 'always', 'never'] }
    }
  },
  agents: {
    type: 'object',
    required: true,
    properties: {
      default: { type: 'string' },
      available: { type: 'array' }
    }
  },
  mcp: {
    type: 'object',
    required: true,
    properties: {
      autoInstall: { type: 'boolean' },
      servers: { type: 'array' }
    }
  },
  sync: {
    type: 'object',
    required: true,
    properties: {
      enabled: { type: 'boolean' },
      baseBranch: { type: 'string' },
      autoUpdate: { type: 'boolean' },
      checkInterval: { type: 'number' }
    }
  }
};

export class ConfigManager {
  /**
   * @param {string} projectRoot - Root directory of the project
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.configDir = join(projectRoot, '.vibe');
    this.configPath = join(this.configDir, 'config.json');
    this._config = null;
  }

  /**
   * Load configuration from file or create default
   * @returns {Object} Configuration object
   */
  load() {
    if (this._config) {
      return this._config;
    }

    // Check if config exists
    if (!existsSync(this.configPath)) {
      // Create default config
      this._config = this._createDefaultConfig();

      // Apply environment variable overrides
      this._applyEnvOverrides();

      this.save();
      return this._config;
    }

    // Load existing config
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      this._config = JSON.parse(content);

      // Apply environment variable overrides
      this._applyEnvOverrides();

      // Validate config
      this._validate();

      return this._config;
    } catch (error) {
      throw new Error(
        `Failed to load config from ${this.configPath}:\n${error.message}\n\n` +
        'Try deleting the config file to regenerate it.'
      );
    }
  }

  /**
   * Save configuration to file
   */
  save() {
    // Ensure .vibe directory exists
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    try {
      const content = JSON.stringify(this._config, null, 2);
      writeFileSync(this.configPath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save config to ${this.configPath}: ${error.message}`);
    }
  }

  /**
   * Check if config file exists
   * @returns {boolean}
   */
  exists() {
    return existsSync(this.configPath);
  }

  /**
   * Get a config value by path (e.g., 'container.runtime')
   * @param {string} path - Dot-separated path to config value
   * @returns {any} Config value
   */
  get(path) {
    const config = this.load();
    const parts = path.split('.');
    let value = config;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Set a config value by path (e.g., 'container.runtime', 'docker')
   * @param {string} path - Dot-separated path to config value
   * @param {any} value - Value to set
   */
  set(path, value) {
    const config = this.load();
    const parts = path.split('.');
    const lastPart = parts.pop();
    let target = config;

    for (const part of parts) {
      if (!(part in target)) {
        target[part] = {};
      }
      target = target[part];
    }

    target[lastPart] = value;
    this._config = config;
  }

  /**
   * Update multiple config values at once
   * @param {Object} updates - Object with paths and values
   */
  update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      this.set(path, value);
    }
  }

  /**
   * Create default configuration
   * @private
   * @returns {Object} Default config
   */
  _createDefaultConfig() {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep clone

    // Auto-detect project name from directory
    config.project.name = this._detectProjectName();

    // Auto-detect base branch from git
    config.sync.baseBranch = this._detectBaseBranch();

    return config;
  }

  /**
   * Detect project name from directory
   * @private
   * @returns {string} Project name
   */
  _detectProjectName() {
    return basename(this.projectRoot) || 'my-project';
  }

  /**
   * Detect base branch from git
   * @private
   * @returns {string} Base branch name
   */
  _detectBaseBranch() {
    try {
      // Try to detect default branch
      const output = execSync('git rev-parse --abbrev-ref origin/HEAD', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return output.trim().replace('origin/', '');
    } catch (error) {
      // Fallback to 'main'
      return 'main';
    }
  }

  /**
   * Apply environment variable overrides
   * @private
   */
  _applyEnvOverrides() {
    const env = process.env;

    // VIBE_RUNTIME=docker|podman
    if (env.VIBE_RUNTIME) {
      this._config.container.runtime = env.VIBE_RUNTIME;
    }

    // VIBE_COMPOSE_FILE=custom-compose.yml
    if (env.VIBE_COMPOSE_FILE) {
      this._config.container.composeFile = env.VIBE_COMPOSE_FILE;
    }

    // VIBE_SUDO=always|never
    if (env.VIBE_SUDO) {
      this._config.container.sudo = env.VIBE_SUDO;
    }

    // VIBE_DEFAULT_AGENT=claude|codex|gemini
    if (env.VIBE_DEFAULT_AGENT) {
      this._config.agents.default = env.VIBE_DEFAULT_AGENT;
    }

    // VIBE_BASE_BRANCH=main|master
    if (env.VIBE_BASE_BRANCH) {
      this._config.sync.baseBranch = env.VIBE_BASE_BRANCH;
    }
  }

  /**
   * Validate configuration against schema
   * @private
   */
  _validate() {
    const errors = [];

    // Check version
    if (this._config.version !== DEFAULT_CONFIG.version) {
      errors.push(`Config version mismatch: expected ${DEFAULT_CONFIG.version}, got ${this._config.version}`);
    }

    // Validate container.runtime
    const validRuntimes = CONFIG_SCHEMA.container.properties.runtime.enum;
    if (!validRuntimes.includes(this._config.container.runtime)) {
      errors.push(`Invalid container.runtime: must be one of ${validRuntimes.join(', ')}`);
    }

    // Validate container.sudo
    const validSudo = CONFIG_SCHEMA.container.properties.sudo.enum;
    if (!validSudo.includes(this._config.container.sudo)) {
      errors.push(`Invalid container.sudo: must be one of ${validSudo.join(', ')}`);
    }

    // Validate agents.available is array
    if (!Array.isArray(this._config.agents.available)) {
      errors.push('agents.available must be an array');
    }

    // Validate agents.default is in available list
    if (!this._config.agents.available.includes(this._config.agents.default)) {
      errors.push(`agents.default "${this._config.agents.default}" is not in agents.available list`);
    }

    if (errors.length > 0) {
      throw new Error(
        `Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n\n` +
        `Config file: ${this.configPath}\n` +
        'Fix these errors or delete the config file to regenerate it.'
      );
    }
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this._config = this._createDefaultConfig();
    this.save();
  }

  /**
   * Get configuration summary for display
   * @returns {Object} Formatted summary
   */
  getSummary() {
    const config = this.load();

    return {
      project: config.project.name,
      runtime: config.container.runtime,
      composeFile: config.container.composeFile,
      defaultAgent: config.agents.default,
      baseBranch: config.sync.baseBranch,
      autoUpdate: config.sync.autoUpdate,
      configPath: this.configPath
    };
  }
}
