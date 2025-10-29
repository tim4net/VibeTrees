/**
 * Port registry for managing dynamic port allocation across worktrees
 *
 * Each worktree needs isolated services with unique ports. This registry
 * tracks port assignments and ensures no conflicts between worktrees.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import lockfile from 'proper-lockfile';

const execAsync = promisify(exec);

export class PortRegistry {
  /**
   * @param {string} projectRoot - Project root directory (optional, uses cwd if not provided)
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.registryDir = this._getProjectConfigDir(projectRoot);
    this.registryFile = join(this.registryDir, 'ports.json');
    this.ports = this.load();
  }

  /**
   * Get project-specific config directory in ~/.vibetrees/
   * Uses parent-child naming to avoid collisions
   * @param {string} projectRoot - Project root directory
   * @returns {string} Config directory path
   */
  _getProjectConfigDir(projectRoot) {
    const parts = projectRoot.split(/[\/\\]/).filter(Boolean);

    // Use last two path components: parent-child
    // ~/code/ecommerce-app → code-ecommerce-app
    const projectName = parts.length >= 2
      ? `${parts[parts.length - 2]}-${parts[parts.length - 1]}`
      : parts[parts.length - 1];

    return join(homedir(), '.vibetrees', projectName);
  }

  load() {
    if (!existsSync(this.registryDir)) {
      mkdirSync(this.registryDir, { recursive: true });
    }

    if (!existsSync(this.registryFile)) {
      return {};
    }

    try {
      const data = readFileSync(this.registryFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  save() {
    if (!existsSync(this.registryDir)) {
      mkdirSync(this.registryDir, { recursive: true });
    }
    writeFileSync(this.registryFile, JSON.stringify(this.ports, null, 2));
  }

  /**
   * Check if a port is in use on the system
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} True if port is in use
   */
  async isPortInUse(port) {
    try {
      // Use lsof to check if port is in use (works on macOS and Linux)
      const { stdout } = await execAsync(`lsof -i :${port} -sTCP:LISTEN -t`);
      return stdout.trim().length > 0;
    } catch (error) {
      // lsof returns non-zero exit code when port is not in use
      return false;
    }
  }

  /**
   * Check if a port is in use on the system (synchronous version)
   * Falls back to registry-only check on error
   * @param {number} port - Port number to check
   * @returns {boolean} True if port is in use
   */
  isPortInUseSync(port) {
    try {
      // Use lsof to check if port is in use (works on macOS and Linux)
      const output = execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null || true`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      return output.trim().length > 0;
    } catch (error) {
      // Fallback to false on error (permission issues, lsof not available, etc.)
      return false;
    }
  }

  allocate(worktreeName, service, basePort) {
    const key = `${worktreeName}:${service}`;

    // Return existing port if already allocated
    if (this.ports[key]) {
      return this.ports[key];
    }

    // Find next available port
    let port = basePort;
    const usedPorts = new Set(Object.values(this.ports));

    while (usedPorts.has(port) || this.isPortInUseSync(port)) {
      port++;
    }

    this.ports[key] = port;
    this.save();

    return port;
  }

  release(worktreeName) {
    const keys = Object.keys(this.ports).filter(k => k.startsWith(`${worktreeName}:`));
    for (const key of keys) {
      delete this.ports[key];
    }
    this.save();
  }

  getWorktreePorts(worktreeName) {
    const result = {};
    for (const [key, port] of Object.entries(this.ports)) {
      if (key.startsWith(`${worktreeName}:`)) {
        const service = key.split(':')[1];
        result[service] = port;
      }
    }
    return result;
  }

  /**
   * Sync port registry with existing worktrees by reading their .env files
   * This ensures new projects don't conflict with existing worktree ports
   * @param {Array<{name: string, path: string}>} worktrees - List of worktrees
   */
  syncFromWorktrees(worktrees) {
    let synced = 0;

    for (const worktree of worktrees) {
      const envPath = join(worktree.path, '.env');

      if (!existsSync(envPath)) {
        continue;
      }

      try {
        const envContent = readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');

        for (const line of lines) {
          // Parse PORT environment variables (e.g., POSTGRES_PORT=5432)
          const match = line.match(/^([A-Z_]+)_PORT=(\d+)$/);
          if (match) {
            const [, serviceName, port] = match;
            // Convert env var format back to service name: POSTGRES_PORT -> postgres
            const service = serviceName.toLowerCase().replace(/_/g, '-');
            const key = `${worktree.name}:${service}`;

            // Only sync if not already in registry
            if (!this.ports[key]) {
              this.ports[key] = parseInt(port, 10);
              synced++;
            }
          }
        }
      } catch (error) {
        console.warn(`[PortRegistry] Failed to read .env from ${worktree.name}: ${error.message}`);
      }
    }

    if (synced > 0) {
      this.save();
      console.log(`[PortRegistry] Synced ${synced} port allocations from existing worktrees`);
    }

    return synced;
  }

  /**
   * Execute a function with file locking to ensure atomic operations
   * @param {Function} fn - Function to execute while holding the lock
   * @returns {Promise<any>} Result of the function
   */
  async _withLock(fn) {
    let release;
    try {
      // Ensure registry file exists before locking
      if (!existsSync(this.registryDir)) {
        mkdirSync(this.registryDir, { recursive: true });
      }
      if (!existsSync(this.registryFile)) {
        writeFileSync(this.registryFile, '{}');
      }

      release = await lockfile.lock(this.registryFile, {
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 2000
        }
      });

      // Reload state after acquiring lock
      this.ports = this.load();

      const result = await fn();

      // Save after operation completes
      this.save();

      return result;
    } finally {
      if (release) await release();
    }
  }

  /**
   * Allocate multiple ports atomically for a worktree
   * This prevents race conditions when multiple processes allocate ports simultaneously
   * @param {string} worktreeName - Name of the worktree
   * @param {Object<string, number>} services - Map of service names to base ports
   * @returns {Promise<Object<string, number>>} Map of service names to allocated ports
   */
  async allocateAtomic(worktreeName, services) {
    return this._withLock(async () => {
      const allocated = {};

      for (const [serviceName, basePort] of Object.entries(services)) {
        const key = `${worktreeName}:${serviceName}`;

        // Return existing port if already allocated
        if (this.ports[key]) {
          allocated[serviceName] = this.ports[key];
          continue;
        }

        // Find next available port
        let port = basePort;
        const usedPorts = new Set(Object.values(this.ports));

        while (usedPorts.has(port) || this.isPortInUseSync(port)) {
          port++;
          usedPorts.add(port);
        }

        this.ports[key] = port;
        allocated[serviceName] = port;
      }

      return allocated;
    });
  }

  /**
   * Release all ports for a worktree atomically
   * @param {string} worktreeName - Name of the worktree
   * @returns {Promise<void>}
   */
  async releaseAtomic(worktreeName) {
    return this._withLock(async () => {
      const keys = Object.keys(this.ports).filter(k => k.startsWith(`${worktreeName}:`));
      for (const key of keys) {
        delete this.ports[key];
      }
    });
  }
}
