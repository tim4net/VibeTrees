/**
 * Diagnostic Runner
 *
 * Comprehensive health checks for worktrees, containers, ports, and services.
 * Provides auto-fix capabilities for common issues.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createConnection } from 'net';

export class DiagnosticRunner {
  /**
   * @param {string} repoRoot - Root directory of the git repository
   * @param {Object} portRegistry - PortRegistry instance
   * @param {Object} runtime - ContainerRuntime instance
   */
  constructor(repoRoot, portRegistry, runtime) {
    this.repoRoot = repoRoot;
    this.portRegistry = portRegistry;
    this.runtime = runtime;
    this.worktreeBase = join(repoRoot, '.worktrees');
  }

  /**
   * Run all diagnostic checks
   * @param {string} worktreeName - Optional: check specific worktree
   * @returns {Object} Diagnostic report with all checks
   */
  async runAll(worktreeName = null) {
    const checks = [];

    if (worktreeName) {
      // Run checks for specific worktree
      checks.push(await this.checkGitWorktree(worktreeName));
      checks.push(await this.checkContainers(worktreeName));
      checks.push(await this.checkPorts(worktreeName));
      checks.push(await this.checkVolumes(worktreeName));
      checks.push(await this.checkServices(worktreeName));
    } else {
      // Run system-wide checks
      checks.push(await this.checkPortRegistry());
      checks.push(await this.checkGitConsistency());
      checks.push(await this.checkOrphanedContainers());
      checks.push(await this.checkPortConflicts());
      checks.push(await this.checkDiskSpace());
    }

    // Categorize results
    const passed = checks.filter(c => c.status === 'ok');
    const warnings = checks.filter(c => c.status === 'warning');
    const errors = checks.filter(c => c.status === 'error');

    return {
      timestamp: new Date().toISOString(),
      worktree: worktreeName,
      summary: {
        total: checks.length,
        passed: passed.length,
        warnings: warnings.length,
        errors: errors.length,
        health: this._calculateHealth(passed.length, warnings.length, errors.length)
      },
      checks
    };
  }

  /**
   * Check git worktree consistency
   */
  async checkGitWorktree(worktreeName) {
    const check = {
      name: 'git_worktree',
      description: 'Git worktree consistency',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const worktreePath = join(this.worktreeBase, worktreeName);

      // Check if path exists
      if (!existsSync(worktreePath)) {
        check.status = 'error';
        check.issues.push('Worktree path does not exist');
        check.fixable = true;
        check.fix = 'remove_from_git';
        return check;
      }

      // Check .git file
      const gitFile = join(worktreePath, '.git');
      if (!existsSync(gitFile)) {
        check.status = 'error';
        check.issues.push('Missing .git file');
        check.fixable = true;
        check.fix = 'repair_git_file';
        return check;
      }

      // Verify .git file content
      const gitFileContent = readFileSync(gitFile, 'utf-8');
      if (!gitFileContent.startsWith('gitdir:')) {
        check.status = 'error';
        check.issues.push('Invalid .git file format');
        check.fixable = true;
        check.fix = 'repair_git_file';
        return check;
      }

      // Check if branch exists
      try {
        execSync(`git rev-parse --verify HEAD`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });
      } catch {
        check.status = 'error';
        check.issues.push('Branch does not exist or HEAD is detached');
        check.fixable = false;
      }

      // Check for uncommitted changes
      try {
        const status = execSync('git status --porcelain', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });

        if (status.trim()) {
          check.status = 'warning';
          check.issues.push('Uncommitted changes detected');
          check.fixable = false;
        }
      } catch {
        // Ignore errors
      }
    } catch (error) {
      check.status = 'error';
      check.issues.push(error.message);
      check.fixable = false;
    }

    return check;
  }

  /**
   * Check container health for a worktree
   */
  async checkContainers(worktreeName) {
    const check = {
      name: 'containers',
      description: 'Container health',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const worktreePath = join(this.worktreeBase, worktreeName);
      const cmd = this.runtime.getComposeCommand();

      const output = execSync(`${cmd} ps -a --format json`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (!output.trim()) {
        check.status = 'warning';
        check.issues.push('No containers found');
        return check;
      }

      // Parse containers
      const containers = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      // Check each container state
      for (const container of containers) {
        const state = container.State || container.state;
        const service = container.Service || container.service;

        if (state === 'exited' || state === 'stopped') {
          check.status = 'warning';
          check.issues.push(`Service "${service}" is not running (${state})`);
          check.fixable = true;
          check.fix = 'restart_services';
        } else if (state !== 'running') {
          check.status = 'error';
          check.issues.push(`Service "${service}" is in unexpected state: ${state}`);
          check.fixable = true;
          check.fix = 'restart_services';
        }
      }
    } catch (error) {
      check.status = 'warning';
      check.issues.push('Cannot read container status (compose file may not exist)');
      check.fixable = false;
    }

    return check;
  }

  /**
   * Check port allocations and conflicts
   */
  async checkPorts(worktreeName) {
    const check = {
      name: 'ports',
      description: 'Port allocations',
      status: 'ok',
      issues: [],
      fixable: false
    };

    const ports = this.portRegistry.getWorktreePorts(worktreeName);

    if (Object.keys(ports).length === 0) {
      check.status = 'warning';
      check.issues.push('No ports allocated');
      return check;
    }

    // Check if ports are actually in use
    for (const [service, port] of Object.entries(ports)) {
      const isListening = await this._isPortListening(port);

      if (!isListening) {
        check.status = 'warning';
        check.issues.push(`Port ${port} (${service}) is not listening`);
        check.fixable = true;
        check.fix = 'restart_services';
      }
    }

    return check;
  }

  /**
   * Check volume mounts
   */
  async checkVolumes(worktreeName) {
    const check = {
      name: 'volumes',
      description: 'Volume mounts',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const worktreePath = join(this.worktreeBase, worktreeName);
      const cmd = this.runtime.getComposeCommand();

      // Get volume info
      const output = execSync(`${cmd} config --volumes`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const volumes = output.trim().split('\n').filter(v => v.trim());

      if (volumes.length === 0) {
        check.status = 'info';
        check.issues.push('No volumes defined');
        return check;
      }

      // Check for potential volume name conflicts
      for (const volume of volumes) {
        if (!volume.includes(worktreeName)) {
          check.status = 'warning';
          check.issues.push(`Volume "${volume}" not namespaced with worktree name`);
          check.fixable = false;
        }
      }
    } catch (error) {
      check.status = 'info';
      check.issues.push('Cannot read volume configuration');
      check.fixable = false;
    }

    return check;
  }

  /**
   * Check service definitions
   */
  async checkServices(worktreeName) {
    const check = {
      name: 'services',
      description: 'Service configuration',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const worktreePath = join(this.worktreeBase, worktreeName);
      const composeFile = join(worktreePath, 'docker-compose.yml');

      if (!existsSync(composeFile)) {
        check.status = 'warning';
        check.issues.push('No docker-compose.yml found');
        return check;
      }

      // Validate compose file syntax
      try {
        execSync(`${this.runtime.getComposeCommand()} config -q`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });
      } catch (error) {
        check.status = 'error';
        check.issues.push('Invalid docker-compose.yml syntax');
        check.fixable = false;
        return check;
      }

      // Check environment variables are set correctly
      const ports = this.portRegistry.getWorktreePorts(worktreeName);
      const envFile = join(worktreePath, '.env');

      if (!existsSync(envFile)) {
        check.status = 'warning';
        check.issues.push('No .env file found');
        check.fixable = true;
        check.fix = 'regenerate_env';
      } else {
        const envContent = readFileSync(envFile, 'utf-8');

        // Check if ports match
        for (const [service, port] of Object.entries(ports)) {
          const varName = `${service.toUpperCase()}_PORT`;
          if (!envContent.includes(`${varName}=${port}`)) {
            check.status = 'warning';
            check.issues.push(`Port mismatch for ${service}: .env may be outdated`);
            check.fixable = true;
            check.fix = 'regenerate_env';
          }
        }
      }
    } catch (error) {
      check.status = 'error';
      check.issues.push(error.message);
      check.fixable = false;
    }

    return check;
  }

  /**
   * Check port registry consistency
   */
  async checkPortRegistry() {
    const check = {
      name: 'port_registry',
      description: 'Port registry consistency',
      status: 'ok',
      issues: [],
      fixable: false
    };

    const ports = this.portRegistry.ports || {};
    const worktreeNames = new Set();

    // Get all worktrees from port registry
    for (const key of Object.keys(ports)) {
      const [worktreeName] = key.split(':');
      worktreeNames.add(worktreeName);
    }

    // Check if each worktree actually exists
    for (const worktreeName of worktreeNames) {
      const worktreePath = join(this.worktreeBase, worktreeName);

      if (!existsSync(worktreePath)) {
        check.status = 'warning';
        check.issues.push(`Orphaned port allocation for "${worktreeName}" (worktree doesn't exist)`);
        check.fixable = true;
        check.fix = 'cleanup_orphaned_ports';
      }
    }

    // Check for duplicate port allocations
    const portCounts = new Map();
    for (const port of Object.values(ports)) {
      portCounts.set(port, (portCounts.get(port) || 0) + 1);
    }

    for (const [port, count] of portCounts) {
      if (count > 1) {
        check.status = 'error';
        check.issues.push(`Port ${port} allocated ${count} times (conflict)`);
        check.fixable = false;
      }
    }

    return check;
  }

  /**
   * Check git worktree list consistency
   */
  async checkGitConsistency() {
    const check = {
      name: 'git_consistency',
      description: 'Git worktree list consistency',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.repoRoot,
        encoding: 'utf-8'
      });

      const lines = output.split('\n');
      const worktrees = [];

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktrees.push(line.substring(9).trim());
        }
      }

      // Check if paths exist
      for (const path of worktrees) {
        if (!existsSync(path)) {
          check.status = 'warning';
          check.issues.push(`Git worktree points to missing path: ${path}`);
          check.fixable = true;
          check.fix = 'prune_git_worktrees';
        }
      }
    } catch (error) {
      check.status = 'error';
      check.issues.push(error.message);
      check.fixable = false;
    }

    return check;
  }

  /**
   * Check for orphaned containers
   */
  async checkOrphanedContainers() {
    const check = {
      name: 'orphaned_containers',
      description: 'Orphaned containers',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      // List all containers with VibeTrees label or in .worktrees path
      const cmd = this.runtime.getRuntime();
      const output = execSync(`${cmd} ps -a --format '{{.Names}}'`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const containers = output.trim().split('\n').filter(c => c.trim());
      const activeWorktrees = readdirSync(this.worktreeBase).filter(name => {
        const fullPath = join(this.worktreeBase, name);
        return existsSync(join(fullPath, '.git'));
      });

      // Check if container's worktree still exists
      for (const container of containers) {
        const worktreeName = this._extractWorktreeNameFromContainer(container);

        if (worktreeName && !activeWorktrees.includes(worktreeName)) {
          check.status = 'warning';
          check.issues.push(`Orphaned container: ${container}`);
          check.fixable = true;
          check.fix = 'remove_orphaned_containers';
        }
      }
    } catch (error) {
      // Ignore errors (docker might not be running)
    }

    return check;
  }

  /**
   * Check for port conflicts
   */
  async checkPortConflicts() {
    const check = {
      name: 'port_conflicts',
      description: 'Port conflicts',
      status: 'ok',
      issues: [],
      fixable: false
    };

    const ports = this.portRegistry.ports || {};
    const allocatedPorts = Object.values(ports);

    for (const port of allocatedPorts) {
      const processes = await this._getProcessesOnPort(port);

      if (processes.length > 1) {
        check.status = 'error';
        check.issues.push(`Port ${port} has ${processes.length} processes listening`);
        check.fixable = false;
      }
    }

    return check;
  }

  /**
   * Check disk space
   */
  async checkDiskSpace() {
    const check = {
      name: 'disk_space',
      description: 'Disk space',
      status: 'ok',
      issues: [],
      fixable: false
    };

    try {
      const output = execSync('df -h .', {
        cwd: this.repoRoot,
        encoding: 'utf-8'
      });

      const lines = output.split('\n');
      if (lines.length > 1) {
        const match = lines[1].match(/(\d+)%/);
        if (match) {
          const usage = parseInt(match[1], 10);

          if (usage > 90) {
            check.status = 'error';
            check.issues.push(`Disk usage critically high: ${usage}%`);
            check.fixable = false;
          } else if (usage > 80) {
            check.status = 'warning';
            check.issues.push(`Disk usage high: ${usage}%`);
            check.fixable = false;
          }
        }
      }
    } catch (error) {
      check.status = 'warning';
      check.issues.push('Cannot check disk space');
      check.fixable = false;
    }

    return check;
  }

  /**
   * Auto-fix an issue
   */
  async autoFix(fixType, context = {}) {
    const results = {
      success: false,
      message: '',
      details: []
    };

    try {
      switch (fixType) {
        case 'cleanup_orphaned_ports':
          results.details = await this._cleanupOrphanedPorts();
          results.success = true;
          results.message = `Cleaned up ${results.details.length} orphaned port allocations`;
          break;

        case 'prune_git_worktrees':
          execSync('git worktree prune', {
            cwd: this.repoRoot,
            stdio: 'pipe'
          });
          results.success = true;
          results.message = 'Pruned stale git worktree references';
          break;

        case 'remove_orphaned_containers':
          results.details = await this._removeOrphanedContainers();
          results.success = true;
          results.message = `Removed ${results.details.length} orphaned containers`;
          break;

        case 'restart_services':
          if (!context.worktreeName) {
            throw new Error('Worktree name required for restart_services');
          }
          await this._restartServices(context.worktreeName);
          results.success = true;
          results.message = `Restarted services for ${context.worktreeName}`;
          break;

        case 'regenerate_env':
          if (!context.worktreeName) {
            throw new Error('Worktree name required for regenerate_env');
          }
          await this._regenerateEnvFile(context.worktreeName);
          results.success = true;
          results.message = `Regenerated .env file for ${context.worktreeName}`;
          break;

        default:
          throw new Error(`Unknown fix type: ${fixType}`);
      }
    } catch (error) {
      results.success = false;
      results.message = error.message;
    }

    return results;
  }

  /**
   * Calculate overall health score
   * @private
   */
  _calculateHealth(passed, warnings, errors) {
    const total = passed + warnings + errors;
    if (total === 0) return 'unknown';

    if (errors > 0) return 'critical';
    if (warnings > 0) return 'warning';
    return 'healthy';
  }

  /**
   * Check if port is listening
   * @private
   */
  async _isPortListening(port) {
    return new Promise((resolve) => {
      const socket = createConnection({ port, host: 'localhost' });

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
    });
  }

  /**
   * Get processes listening on a port
   * @private
   */
  async _getProcessesOnPort(port) {
    try {
      const output = execSync(`lsof -i :${port} -t`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      return output.trim().split('\n').filter(p => p.trim());
    } catch {
      return [];
    }
  }

  /**
   * Extract worktree name from container name
   * @private
   */
  _extractWorktreeNameFromContainer(containerName) {
    // Container names typically follow pattern: worktreename_service_1
    const parts = containerName.split('_');
    if (parts.length >= 2) {
      return parts[0];
    }
    return null;
  }

  /**
   * Clean up orphaned port allocations
   * @private
   */
  async _cleanupOrphanedPorts() {
    const ports = this.portRegistry.ports || {};
    const removed = [];

    for (const key of Object.keys(ports)) {
      const [worktreeName] = key.split(':');
      const worktreePath = join(this.worktreeBase, worktreeName);

      if (!existsSync(worktreePath)) {
        delete ports[key];
        removed.push(key);
      }
    }

    this.portRegistry.save();
    return removed;
  }

  /**
   * Remove orphaned containers
   * @private
   */
  async _removeOrphanedContainers() {
    const cmd = this.runtime.getRuntime();
    const removed = [];

    try {
      const output = execSync(`${cmd} ps -a --format '{{.Names}}'`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const containers = output.trim().split('\n').filter(c => c.trim());
      const activeWorktrees = readdirSync(this.worktreeBase).filter(name => {
        return existsSync(join(this.worktreeBase, name, '.git'));
      });

      for (const container of containers) {
        const worktreeName = this._extractWorktreeNameFromContainer(container);

        if (worktreeName && !activeWorktrees.includes(worktreeName)) {
          execSync(`${cmd} rm -f ${container}`, { stdio: 'pipe' });
          removed.push(container);
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return removed;
  }

  /**
   * Restart services for a worktree
   * @private
   */
  async _restartServices(worktreeName) {
    const worktreePath = join(this.worktreeBase, worktreeName);
    const cmd = this.runtime.getComposeCommand();

    execSync(`${cmd} restart`, {
      cwd: worktreePath,
      stdio: 'pipe'
    });
  }

  /**
   * Regenerate .env file for a worktree
   * Only creates if missing - preserves existing files
   * @private
   */
  async _regenerateEnvFile(worktreeName) {
    const worktreePath = join(this.worktreeBase, worktreeName);
    const envFile = join(worktreePath, '.env');
    const fs = require('fs');

    // SAFETY: Only create .env if it doesn't exist (preserve user customizations)
    if (fs.existsSync(envFile)) {
      console.log(`[Diagnostic] Skipping .env regeneration - file exists for ${worktreeName}`);
      return;
    }

    const ports = this.portRegistry.getWorktreePorts(worktreeName);

    const envLines = [];
    for (const [service, port] of Object.entries(ports)) {
      const varName = `${service.toUpperCase()}_PORT`;
      envLines.push(`${varName}=${port}`);
    }

    fs.writeFileSync(envFile, envLines.join('\n') + '\n');
    console.log(`[Diagnostic] Created .env file for ${worktreeName}`);
  }
}
