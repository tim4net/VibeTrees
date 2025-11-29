/**
 * ZenMcpInstaller
 *
 * Manages installation verification for the Zen MCP server.
 * The BeehiveInnovations zen-mcp-server is a Python package that runs via uvx.
 *
 * Installation is handled automatically by uvx at runtime - this class
 * just verifies that uvx is available and can run the server.
 *
 * Usage:
 *   const installer = new ZenMcpInstaller();
 *   const result = await installer.ensureReady();
 *   if (!result.success) {
 *     console.error('uvx not available:', result.error);
 *   }
 *
 * Result types:
 *   - success=true: uvx is available, zen-mcp can be launched
 *   - success=false, error='UVX_NOT_FOUND': uvx not installed
 *   - success=false, error='PYTHON_NOT_FOUND': Python not available
 */

import { execSync as defaultExecSync } from 'child_process';

export class ZenMcpInstaller {
  /**
   * Create a new ZenMcpInstaller
   * @param {Object} options - Configuration options
   * @param {string} options.repoUrl - GitHub repository URL (default: BeehiveInnovations)
   * @param {Function} options.execSync - Custom execSync function for dependency injection
   */
  constructor(options = {}) {
    this.repoUrl = options.repoUrl || 'git+https://github.com/BeehiveInnovations/zen-mcp-server.git';
    this.execSync = options.execSync || defaultExecSync;
  }

  /**
   * Find uvx executable path
   * Searches common locations for uvx
   * @returns {string|null} Path to uvx or null if not found
   */
  findUvx() {
    // Common uvx locations
    const searchPaths = [
      'uvx',                           // In PATH
      `${process.env.HOME}/.local/bin/uvx`,
      '/opt/homebrew/bin/uvx',         // macOS Homebrew
      '/usr/local/bin/uvx',
      '/usr/bin/uvx'
    ];

    for (const path of searchPaths) {
      try {
        // Test if uvx exists and is executable
        this.execSync(`${path} --version`, { encoding: 'utf8', stdio: 'pipe' });
        return path;
      } catch {
        // Not found at this path, continue searching
      }
    }

    return null;
  }

  /**
   * Check if Python 3.10+ is available
   * @returns {Object} { available: boolean, version?: string }
   */
  checkPython() {
    try {
      const output = this.execSync('python3 --version', { encoding: 'utf8', stdio: 'pipe' });
      const match = output.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major >= 3 && minor >= 10) {
          return { available: true, version: `${major}.${minor}` };
        }
        return { available: false, version: `${major}.${minor}`, error: 'Python 3.10+ required' };
      }
      return { available: false, error: 'Could not parse Python version' };
    } catch {
      return { available: false, error: 'Python not found' };
    }
  }

  /**
   * Get the uvx command for launching zen-mcp-server
   * Returns the bash command used in MCP settings
   * @returns {string[]} Command args for MCP configuration
   */
  getCommand() {
    return [
      '-c',
      `for p in $(which uvx 2>/dev/null) $HOME/.local/bin/uvx /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do [ -x "$p" ] && exec "$p" --from ${this.repoUrl} zen-mcp-server; done; echo 'uvx not found' >&2; exit 1`
    ];
  }

  /**
   * Ensure uvx is available and zen-mcp can be launched
   * @returns {Promise<Object>} Result object with structure:
   *   { success: true, uvxPath: '/path/to/uvx', pythonVersion: '3.12' }
   *   { success: false, error: 'UVX_NOT_FOUND'|'PYTHON_NOT_FOUND', message: string }
   */
  async ensureInstalled() {
    // Check Python first
    const pythonCheck = this.checkPython();
    if (!pythonCheck.available) {
      return {
        success: false,
        error: 'PYTHON_NOT_FOUND',
        message: pythonCheck.error || 'Python 3.10+ is required for zen-mcp-server',
        recoverable: false
      };
    }

    // Find uvx
    const uvxPath = this.findUvx();
    if (!uvxPath) {
      return {
        success: false,
        error: 'UVX_NOT_FOUND',
        message: 'uvx not found. Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
        recoverable: false
      };
    }

    return {
      success: true,
      uvxPath,
      pythonVersion: pythonCheck.version,
      command: this.getCommand()
    };
  }

  /**
   * Alias for ensureInstalled for facade compatibility
   */
  async ensureReady() {
    return this.ensureInstalled();
  }

  /**
   * Check installation status without attempting to fix
   * @returns {Promise<Object>} Status object
   */
  async getStatus() {
    const pythonCheck = this.checkPython();
    const uvxPath = this.findUvx();

    return {
      pythonAvailable: pythonCheck.available,
      pythonVersion: pythonCheck.version,
      uvxAvailable: uvxPath !== null,
      uvxPath,
      ready: pythonCheck.available && uvxPath !== null
    };
  }

  /**
   * Update is a no-op for uvx-based installation
   * uvx always fetches the latest from the repository
   * @returns {Promise<Object>} Result indicating auto-update behavior
   */
  async update() {
    return {
      success: true,
      message: 'zen-mcp-server auto-updates via uvx on each launch'
    };
  }
}
