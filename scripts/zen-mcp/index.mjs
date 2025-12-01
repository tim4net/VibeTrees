/**
 * ZenMcpFacade - Unified interface for Zen MCP integration
 *
 * Composes three core components:
 * - ZenMcpConfig: Configuration and API key management
 * - ZenMcpInstaller: uvx/Python availability checking
 * - ZenMcpConnection: Provider API connection testing
 *
 * Provides lazy initialization, status aggregation, and simplified API.
 *
 * Usage:
 *   const facade = new ZenMcpFacade();
 *   await facade.ensureReady();  // Check uvx is available
 *   await facade.saveApiKey('openai', 'sk-...');  // Test then save key
 *   const status = await facade.getStatus();  // Get full status
 */

import { ZenMcpConfig, PROVIDERS, SUPPORTED_PROVIDERS } from './zen-mcp-config.mjs';
import { ZenMcpInstaller } from './zen-mcp-installer.mjs';
import { ZenMcpConnection } from './zen-mcp-connection.mjs';

/**
 * Unified facade for Zen MCP configuration, installation, and connection management
 * Implements lazy initialization, dependency injection, and status aggregation
 */
export class ZenMcpFacade {
  /**
   * Create a new ZenMcpFacade instance
   * @param {Object} options - Configuration options
   * @param {ZenMcpConfig} options.config - Config instance (created if not provided)
   * @param {ZenMcpInstaller} options.installer - Installer instance (created if not provided)
   * @param {ZenMcpConnection} options.connection - Connection instance (created if not provided)
   * @param {*} options.* - Other options passed to default constructors
   */
  constructor(options = {}) {
    // Initialize dependencies - use provided instances or create defaults
    this.config = options.config || new ZenMcpConfig(options);
    this.installer = options.installer || new ZenMcpInstaller(options);
    this.connection = options.connection || new ZenMcpConnection(options);

    // Cache for lazy initialization
    this._installPromise = null;
  }

  /**
   * Ensure uvx is available (lazy initialization)
   * Checks on first call, then returns cached result on subsequent calls
   * @returns {Promise<Object>} Result with success status, uvxPath, and pythonVersion
   */
  async ensureReady() {
    // Cache the promise to ensure single check
    if (!this._installPromise) {
      this._installPromise = this.installer.ensureInstalled();
    }
    return this._installPromise;
  }

  /**
   * Check if at least one provider is configured
   * @returns {boolean} true if configuration is ready to use
   */
  isConfigured() {
    return this.config.isConfigured();
  }

  /**
   * Get environment variables for all configured providers
   * @returns {Object} Key-value pairs of environment variable names and API keys
   */
  getEnvVars() {
    return this.config.getEnvVars();
  }

  /**
   * Get configuration with masked keys for API response
   * @returns {Object} Configuration with masked API keys for safe sharing
   */
  getConfigForApi() {
    return this.config.getConfigForApi();
  }

  /**
   * Get the MCP server configuration for worktree settings
   * Returns the command and environment variables needed for .claude/settings.json
   * @returns {Object} MCP server configuration with command, args, and env
   */
  getMcpServerConfig() {
    const command = this.installer.getCommand();
    const env = this.config.getEnvVars();

    return {
      command: 'bash',
      args: command,
      env
    };
  }

  /**
   * Test a provider's API key
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key to test
   * @returns {Promise<Object>} Result with success status and error/model info
   */
  async testProvider(provider, apiKey) {
    return this.connection.testProvider(provider, apiKey);
  }

  /**
   * Test and save an API key for a provider
   * Tests connection first, only saves if test passes
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key to save
   * @returns {Promise<Object>} Result with success status and model count or error
   */
  async saveApiKey(provider, apiKey) {
    // Test the key first
    const testResult = await this.connection.testProvider(provider, apiKey);

    // If test fails, return failure result
    if (!testResult.success) {
      return testResult;
    }

    // Test passed - save the key
    this.config.setApiKey(provider, apiKey);

    // Return success with model count
    return {
      success: true,
      provider,
      modelCount: testResult.modelCount
    };
  }

  /**
   * Remove an API key for a provider
   * @param {string} provider - Provider name
   * @returns {Object} Result with success status
   */
  removeApiKey(provider) {
    this.config.removeApiKey(provider);
    return { success: true, provider };
  }

  /**
   * Get zen-mcp-server version information
   * @returns {Promise<Object>} { installed: string|null, latest: string|null, upToDate: boolean }
   */
  async getVersionInfo() {
    try {
      const { execSync } = require('child_process');

      // Try to get installed version from pyproject.toml
      let installedVersion = null;
      try {
        const homedir = require('os').homedir();
        const pyproject = execSync(`find ${homedir}/.local -name "pyproject.toml" -path "*/zen-mcp-server/*" -exec grep "version = " {} \\; 2>/dev/null | head -1`, {
          encoding: 'utf8',
          timeout: 5000
        }).trim();

        const match = pyproject.match(/version\s*=\s*"([^"]+)"/);
        if (match) {
          installedVersion = match[1];
        }
      } catch (error) {
        // Could not find installed version
      }

      // Get latest version from GitHub
      let latestVersion = null;
      try {
        const response = await fetch('https://raw.githubusercontent.com/BeehiveInnovations/zen-mcp-server/main/pyproject.toml');
        if (response.ok) {
          const text = await response.text();
          const match = text.match(/version\s*=\s*"([^"]+)"/);
          if (match) {
            latestVersion = match[1];
          }
        }
      } catch (error) {
        // Could not fetch latest version
      }

      return {
        installed: installedVersion,
        latest: latestVersion,
        upToDate: installedVersion && latestVersion && installedVersion === latestVersion
      };
    } catch (error) {
      return {
        installed: null,
        latest: null,
        upToDate: null
      };
    }
  }

  /**
   * Check if zen-mcp-server processes are running
   * @returns {Object} { running: boolean, processCount: number, processes: Array }
   */
  checkServerProcesses() {
    try {
      const { execSync } = require('child_process');
      // Look for zen-mcp-server processes - they run as Python with server.py
      const output = execSync('ps aux', { encoding: 'utf8' });

      // Filter for zen-mcp-server processes
      const lines = output.split('\n').filter(line =>
        line.includes('zen-mcp-server') && !line.includes('grep')
      );

      return {
        running: lines.length > 0,
        processCount: lines.length,
        processes: lines.map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            pid: parts[1],
            cpu: parts[2],
            mem: parts[3],
            command: parts.slice(10).join(' ')
          };
        })
      };
    } catch (error) {
      // Error getting process list
      console.error('Error checking zen-mcp-server processes:', error.message);
      return {
        running: false,
        processCount: 0,
        processes: []
      };
    }
  }

  /**
   * Get full system status
   * Combines installation status, configuration status, provider config, running processes, and version info
   * @returns {Promise<Object>} Status object with ready, pythonVersion, uvxPath, configured, providers, server, version
   */
  async getStatus() {
    // Check uvx/Python availability
    const installResult = await this.ensureReady();

    // Check if server processes are running
    const serverStatus = this.checkServerProcesses();

    // Get version information (don't await to avoid blocking)
    const versionPromise = this.getVersionInfo();

    // Combine all status info
    const status = {
      ready: installResult.success,
      uvxAvailable: installResult.success,
      uvxPath: installResult.uvxPath,
      pythonVersion: installResult.pythonVersion,
      installError: installResult.error,
      installMessage: installResult.message,
      configured: this.isConfigured(),
      providers: this.getConfigForApi().providers,
      supportedProviders: SUPPORTED_PROVIDERS.map(key => ({
        key,
        ...PROVIDERS[key]
      })),
      server: serverStatus
    };

    // Add version info (wait for it)
    try {
      status.version = await versionPromise;
    } catch (error) {
      status.version = { installed: null, latest: null, upToDate: null };
    }

    return status;
  }

  /**
   * Update is a no-op for uvx-based installation
   * uvx always fetches the latest from the repository
   * @returns {Promise<Object>} Result indicating auto-update behavior
   */
  async update() {
    return this.installer.update();
  }
}

// Export individual classes for direct use if needed
export { ZenMcpConfig, ZenMcpInstaller, ZenMcpConnection, PROVIDERS, SUPPORTED_PROVIDERS };
