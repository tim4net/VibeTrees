/**
 * PalMcpInstaller
 *
 * Manages installation verification for the PAL MCP server.
 * PAL MCP (Provider Abstraction Layer) was formerly known as Zen MCP.
 * See: https://github.com/BeehiveInnovations/pal-mcp-server
 *
 * Supports multiple installation methods with automatic fallback:
 *   1. uvx (preferred) - auto-updates on each launch
 *   2. pipx - isolated environment, manual updates
 *   3. pip - direct installation, manual updates
 *
 * Usage:
 *   const installer = new PalMcpInstaller();
 *   const result = await installer.ensureReady();
 *   if (!result.success) {
 *     console.error('Installation failed:', result.error);
 *   }
 *
 * Result types:
 *   - success=true: pal-mcp can be launched via detected method
 *   - success=false, error='NO_INSTALLER': no uvx/pipx/pip available
 *   - success=false, error='PYTHON_NOT_FOUND': Python not available
 */

import { execSync as defaultExecSync } from 'child_process';

export class PalMcpInstaller {
  /**
   * Create a new PalMcpInstaller
   * @param {Object} options - Configuration options
   * @param {string} options.repoUrl - GitHub repository URL (default: BeehiveInnovations)
   * @param {Function} options.execSync - Custom execSync function for dependency injection
   */
  constructor(options = {}) {
    this.repoUrl = options.repoUrl || 'git+https://github.com/BeehiveInnovations/pal-mcp-server.git';
    this.execSync = options.execSync || defaultExecSync;
  }

  /**
   * Find an executable in common locations
   * @param {string} name - Executable name (uvx, pipx, pip3, etc.)
   * @returns {string|null} Path to executable or null if not found
   */
  findExecutable(name) {
    const searchPaths = [
      name,                              // In PATH
      `${process.env.HOME}/.local/bin/${name}`,
      `/opt/homebrew/bin/${name}`,       // macOS Homebrew
      `/usr/local/bin/${name}`,
      `/usr/bin/${name}`
    ];

    for (const path of searchPaths) {
      try {
        this.execSync(`${path} --version`, { encoding: 'utf8', stdio: 'pipe' });
        return path;
      } catch {
        // Not found at this path, continue searching
      }
    }

    return null;
  }

  /**
   * Find uvx executable path
   * @returns {string|null} Path to uvx or null if not found
   */
  findUvx() {
    return this.findExecutable('uvx');
  }

  /**
   * Find pipx executable path
   * @returns {string|null} Path to pipx or null if not found
   */
  findPipx() {
    return this.findExecutable('pipx');
  }

  /**
   * Find pip3 executable path
   * @returns {string|null} Path to pip3 or null if not found
   */
  findPip() {
    return this.findExecutable('pip3') || this.findExecutable('pip');
  }

  /**
   * Check if pal-mcp-server is installed via pip
   * @returns {Object} { installed: boolean, version?: string }
   */
  checkPipInstalled() {
    try {
      const output = this.execSync('pip3 show pal-mcp-server', { encoding: 'utf8', stdio: 'pipe' });
      const versionMatch = output.match(/Version:\s*(\S+)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown'
      };
    } catch {
      return { installed: false };
    }
  }

  /**
   * Check if pal-mcp-server is installed via pipx
   * @returns {Object} { installed: boolean, version?: string }
   */
  checkPipxInstalled() {
    try {
      const output = this.execSync('pipx list', { encoding: 'utf8', stdio: 'pipe' });
      if (output.includes('pal-mcp-server')) {
        const versionMatch = output.match(/pal-mcp-server\s+(\S+)/);
        return {
          installed: true,
          version: versionMatch ? versionMatch[1] : 'unknown'
        };
      }
      return { installed: false };
    } catch {
      return { installed: false };
    }
  }

  /**
   * Detect the best available installation method
   * Priority: uvx > pipx (if installed) > pip (if installed) > pipx > pip
   * @returns {Object} { method: string, path: string, installed: boolean, version?: string }
   */
  detectMethod() {
    // 1. Check uvx (preferred - auto-updates)
    const uvxPath = this.findUvx();
    if (uvxPath) {
      return { method: 'uvx', path: uvxPath, installed: true, autoUpdates: true };
    }

    // 2. Check pipx with existing installation
    const pipxPath = this.findPipx();
    if (pipxPath) {
      const pipxStatus = this.checkPipxInstalled();
      if (pipxStatus.installed) {
        return { method: 'pipx', path: pipxPath, installed: true, version: pipxStatus.version };
      }
    }

    // 3. Check pip with existing installation
    const pipPath = this.findPip();
    if (pipPath) {
      const pipStatus = this.checkPipInstalled();
      if (pipStatus.installed) {
        return { method: 'pip', path: pipPath, installed: true, version: pipStatus.version };
      }
    }

    // 4. pipx available but not installed - can install
    if (pipxPath) {
      return { method: 'pipx', path: pipxPath, installed: false };
    }

    // 5. pip available but not installed - can install
    if (pipPath) {
      return { method: 'pip', path: pipPath, installed: false };
    }

    return { method: null, path: null, installed: false };
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
   * Get the command for launching pal-mcp-server based on detected method
   * Returns the bash command used in MCP settings
   * @param {string} method - Installation method (uvx, pipx, pip)
   * @returns {string[]} Command args for MCP configuration
   */
  getCommand(method = null) {
    // If no method specified, detect it
    if (!method) {
      const detected = this.detectMethod();
      method = detected.method;
    }

    switch (method) {
      case 'uvx':
        // uvx auto-fetches from git on each run
        return [
          '-c',
          `for p in $(which uvx 2>/dev/null) $HOME/.local/bin/uvx /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do [ -x "$p" ] && exec "$p" --from ${this.repoUrl} pal-mcp-server; done; echo 'uvx not found' >&2; exit 1`
        ];

      case 'pipx':
        // pipx runs from isolated environment
        return [
          '-c',
          'pal-mcp-server'
        ];

      case 'pip':
        // pip installs to user site-packages, run via python -m
        return [
          '-c',
          'python3 -m pal_mcp_server'
        ];

      default:
        // Fallback: try all methods in order
        return [
          '-c',
          `command -v pal-mcp-server >/dev/null && exec pal-mcp-server; python3 -m pal_mcp_server 2>/dev/null && exit 0; echo 'pal-mcp-server not found' >&2; exit 1`
        ];
    }
  }

  /**
   * Install pal-mcp-server using the specified method
   * @param {string} method - Installation method (pipx or pip)
   * @param {string} path - Path to the installer executable
   * @returns {Object} { success: boolean, version?: string, error?: string }
   */
  install(method, path) {
    try {
      if (method === 'pipx') {
        this.execSync(`${path} install ${this.repoUrl}`, { encoding: 'utf8', stdio: 'pipe' });
      } else if (method === 'pip') {
        this.execSync(`${path} install --user ${this.repoUrl}`, { encoding: 'utf8', stdio: 'pipe' });
      } else {
        return { success: false, error: `Unknown method: ${method}` };
      }

      // Verify installation
      const status = method === 'pipx' ? this.checkPipxInstalled() : this.checkPipInstalled();
      if (status.installed) {
        return { success: true, version: status.version };
      }
      return { success: false, error: 'Installation completed but verification failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure pal-mcp-server is available via any supported method
   * Will auto-install if a method is available but not yet installed
   * @param {boolean} autoInstall - Whether to auto-install if not present (default: true)
   * @returns {Promise<Object>} Result object with structure:
   *   { success: true, method: 'uvx'|'pipx'|'pip', pythonVersion: '3.12', ... }
   *   { success: false, error: 'NO_INSTALLER'|'PYTHON_NOT_FOUND', message: string }
   */
  async ensureInstalled(autoInstall = true) {
    // Check Python first
    const pythonCheck = this.checkPython();
    if (!pythonCheck.available) {
      return {
        success: false,
        error: 'PYTHON_NOT_FOUND',
        message: pythonCheck.error || 'Python 3.10+ is required for pal-mcp-server',
        recoverable: false
      };
    }

    // Detect best available method
    const detected = this.detectMethod();

    // No method available at all
    if (!detected.method) {
      return {
        success: false,
        error: 'NO_INSTALLER',
        message: 'No package manager found (uvx, pipx, or pip). Install Python pip or uv.',
        recoverable: false
      };
    }

    // Already installed or uvx (which auto-installs)
    if (detected.installed || detected.method === 'uvx') {
      return {
        success: true,
        method: detected.method,
        path: detected.path,
        pythonVersion: pythonCheck.version,
        version: detected.version,
        autoUpdates: detected.autoUpdates || false,
        command: this.getCommand(detected.method)
      };
    }

    // Not installed but installer available - auto-install if requested
    if (autoInstall) {
      const installResult = this.install(detected.method, detected.path);
      if (installResult.success) {
        return {
          success: true,
          method: detected.method,
          path: detected.path,
          pythonVersion: pythonCheck.version,
          version: installResult.version,
          justInstalled: true,
          command: this.getCommand(detected.method)
        };
      }
      return {
        success: false,
        error: 'INSTALL_FAILED',
        message: `Failed to install via ${detected.method}: ${installResult.error}`,
        recoverable: true
      };
    }

    // Not installed and auto-install disabled
    return {
      success: false,
      error: 'NOT_INSTALLED',
      message: `pal-mcp-server not installed. Run: ${detected.path} install ${this.repoUrl}`,
      method: detected.method,
      path: detected.path,
      recoverable: true
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
    const detected = this.detectMethod();

    return {
      pythonAvailable: pythonCheck.available,
      pythonVersion: pythonCheck.version,
      method: detected.method,
      methodPath: detected.path,
      installed: detected.installed,
      version: detected.version,
      autoUpdates: detected.autoUpdates || false,
      // Legacy fields for backward compatibility
      uvxAvailable: detected.method === 'uvx',
      uvxPath: detected.method === 'uvx' ? detected.path : null,
      ready: pythonCheck.available && (detected.installed || detected.method === 'uvx')
    };
  }

  /**
   * Update pal-mcp-server to latest version
   * @returns {Promise<Object>} Result of update operation
   */
  async update() {
    const detected = this.detectMethod();

    if (!detected.method) {
      return {
        success: false,
        error: 'NOT_INSTALLED',
        message: 'pal-mcp-server is not installed'
      };
    }

    if (detected.method === 'uvx') {
      return {
        success: true,
        message: 'pal-mcp-server auto-updates via uvx on each launch'
      };
    }

    try {
      if (detected.method === 'pipx') {
        this.execSync(`${detected.path} upgrade pal-mcp-server`, { encoding: 'utf8', stdio: 'pipe' });
      } else if (detected.method === 'pip') {
        this.execSync(`${detected.path} install --user --upgrade ${this.repoUrl}`, { encoding: 'utf8', stdio: 'pipe' });
      }

      const newStatus = detected.method === 'pipx' ? this.checkPipxInstalled() : this.checkPipInstalled();
      return {
        success: true,
        message: `Updated to version ${newStatus.version || 'latest'}`,
        version: newStatus.version
      };
    } catch (error) {
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }
}
