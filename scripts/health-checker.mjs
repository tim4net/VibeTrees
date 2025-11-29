/**
 * Health check system for VibeTrees
 *
 * Provides comprehensive health status for:
 * - Container runtime (Docker/Podman)
 * - Git repository
 * - Disk space
 * - Service status
 */

import { execSync } from 'child_process';
import { statfs } from 'fs';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';

const statfsAsync = promisify(statfs);

export class HealthChecker {
  constructor(config = {}) {
    this.runtime = config.runtime; // ContainerRuntime instance
    this.projectRoot = config.projectRoot || process.cwd();
    this.vibeDir = config.vibeDir || join(homedir(), '.vibetrees');
    this.thresholds = {
      diskSpaceWarning: config.diskSpaceWarning || 1024 * 1024 * 1024, // 1GB
      diskSpaceCritical: config.diskSpaceCritical || 512 * 1024 * 1024, // 512MB
      ...config.thresholds
    };
  }

  /**
   * Check container runtime status
   */
  async checkContainerRuntime() {
    try {
      if (!this.runtime) {
        return {
          status: 'unknown',
          message: 'Container runtime not configured'
        };
      }

      // Try to run a simple command
      const version = execSync(`${this.runtime.runtime} --version`, {
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      // Check if daemon is running
      try {
        execSync(`${this.runtime.runtime} info`, { encoding: 'utf8', timeout: 5000 });
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `${this.runtime.runtime} daemon is not running`,
          version
        };
      }

      return {
        status: 'healthy',
        message: `${this.runtime.runtime} is running`,
        version,
        runtime: this.runtime.runtime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.toString()
      };
    }
  }

  /**
   * Check git repository status
   */
  async checkGit() {
    try {
      // Check if git is installed
      const version = execSync('git --version', {
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      // Check if current directory is a git repo
      try {
        const topLevel = execSync('git rev-parse --show-toplevel', {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 5000
        }).trim();

        // Get current branch
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 5000
        }).trim();

        // Count worktrees
        const worktrees = execSync('git worktree list --porcelain', {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 5000
        });

        const worktreeCount = (worktrees.match(/^worktree /gm) || []).length;

        return {
          status: 'healthy',
          message: 'Git repository is accessible',
          version,
          repository: topLevel,
          branch,
          worktreeCount
        };
      } catch (error) {
        return {
          status: 'warning',
          message: 'Not a git repository',
          version
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Git is not installed or not accessible',
        error: error.toString()
      };
    }
  }

  /**
   * Check disk space
   */
  async checkDiskSpace() {
    try {
      // Check space for VibeTrees directory
      const stats = await statfsAsync(this.vibeDir);
      const availableBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      const usedBytes = totalBytes - availableBytes;
      const usedPercent = Math.round((usedBytes / totalBytes) * 100);

      let status = 'healthy';
      let message = `${this._formatBytes(availableBytes)} available`;

      if (availableBytes < this.thresholds.diskSpaceCritical) {
        status = 'unhealthy';
        message = `Critical: Only ${this._formatBytes(availableBytes)} available`;
      } else if (availableBytes < this.thresholds.diskSpaceWarning) {
        status = 'warning';
        message = `Warning: Only ${this._formatBytes(availableBytes)} available`;
      }

      return {
        status,
        message,
        available: availableBytes,
        total: totalBytes,
        used: usedBytes,
        usedPercent,
        path: this.vibeDir
      };
    } catch (error) {
      return {
        status: 'unknown',
        message: 'Could not check disk space',
        error: error.toString()
      };
    }
  }

  /**
   * Check service health (Docker/Podman containers)
   */
  async checkServices() {
    try {
      if (!this.runtime) {
        return {
          status: 'unknown',
          message: 'Container runtime not configured'
        };
      }

      // List running containers using the runtime abstraction
      const output = this.runtime.exec('ps --format "{{.Names}}" --filter "label=vibe.worktree"', {
        encoding: 'utf8',
        timeout: 5000
      }).toString().trim();

      const containers = output ? output.split('\n').filter(Boolean) : [];

      return {
        status: 'healthy',
        message: `${containers.length} containers running`,
        containers,
        count: containers.length
      };
    } catch (error) {
      return {
        status: 'warning',
        message: 'Could not check services',
        error: error.toString()
      };
    }
  }

  /**
   * Check overall system health
   */
  async check() {
    const startTime = Date.now();

    const [runtime, git, disk, services] = await Promise.all([
      this.checkContainerRuntime(),
      this.checkGit(),
      this.checkDiskSpace(),
      this.checkServices()
    ]);

    // Determine overall status
    let overallStatus = 'healthy';
    const checks = { runtime, git, disk, services };

    for (const check of Object.values(checks)) {
      if (check.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        break;
      } else if (check.status === 'warning' && overallStatus !== 'unhealthy') {
        overallStatus = 'warning';
      }
    }

    return {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    };
  }

  /**
   * Format bytes to human-readable string
   */
  _formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get simple health status (for quick checks)
   */
  async isHealthy() {
    const health = await this.check();
    return health.status === 'healthy';
  }
}

export default HealthChecker;
