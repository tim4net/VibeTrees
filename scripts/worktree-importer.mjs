/**
 * Worktree Importer
 *
 * Discovers and imports existing git worktrees not managed by VibeTrees.
 * Scans .worktrees/ directory and git worktree list to find unmanaged worktrees.
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, basename } from 'path';

export class WorktreeImporter {
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
   * Discover unmanaged worktrees by comparing git worktree list with port registry
   * @returns {Array} List of unmanaged worktrees with metadata
   */
  discoverUnmanaged() {
    const gitWorktrees = this._getGitWorktrees();
    const managedWorktrees = this._getManagedWorktrees();

    // Filter out worktrees that are already managed
    const unmanagedWorktrees = gitWorktrees.filter(wt => {
      return !managedWorktrees.includes(wt.name);
    });

    // Enrich with additional metadata
    return unmanagedWorktrees.map(wt => ({
      ...wt,
      hasComposeFile: this._hasComposeFile(wt.path),
      runningContainers: this._getRunningContainers(wt.name),
      canImport: this._canImport(wt),
      issues: this._checkIssues(wt)
    }));
  }

  /**
   * Import a specific worktree into VibeTrees
   * @param {string} worktreeName - Name of the worktree to import
   * @returns {Object} Import result with allocated ports and status
   */
  async importWorktree(worktreeName) {
    const worktrees = this.discoverUnmanaged();
    const worktree = worktrees.find(wt => wt.name === worktreeName);

    if (!worktree) {
      throw new Error(`Worktree "${worktreeName}" not found or already managed`);
    }

    if (!worktree.canImport) {
      throw new Error(`Cannot import worktree "${worktreeName}": ${worktree.issues.join(', ')}`);
    }

    const result = {
      name: worktreeName,
      path: worktree.path,
      branch: worktree.branch,
      ports: {},
      containers: [],
      warnings: []
    };

    // Detect and allocate ports for running containers
    const runningContainers = worktree.runningContainers;
    if (runningContainers.length > 0) {
      result.warnings.push(`Found ${runningContainers.length} running containers`);

      for (const container of runningContainers) {
        const serviceName = container.service;
        const containerPort = container.port;

        if (containerPort) {
          // Allocate the port that's already in use
          const allocatedPort = this.portRegistry.allocate(
            worktreeName,
            serviceName,
            containerPort
          );
          result.ports[serviceName] = allocatedPort;

          if (allocatedPort !== containerPort) {
            result.warnings.push(
              `Port conflict: ${serviceName} running on ${containerPort}, allocated ${allocatedPort}`
            );
          }
        }
      }

      result.containers = runningContainers;
    }

    // If no running containers, check compose file for services
    if (worktree.hasComposeFile && Object.keys(result.ports).length === 0) {
      const ports = this._allocatePortsFromCompose(worktreeName, worktree.path);
      result.ports = ports;
    }

    return result;
  }

  /**
   * Get list of git worktrees
   * @private
   */
  _getGitWorktrees() {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.repoRoot,
        encoding: 'utf-8'
      });

      const worktrees = [];
      const lines = output.split('\n');
      let current = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring(9).trim();
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).trim().replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path) {
            // Skip main worktree
            if (current.path !== this.repoRoot) {
              current.name = basename(current.path);
              worktrees.push(current);
            }
            current = {};
          }
        }
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to get git worktrees:', error.message);
      return [];
    }
  }

  /**
   * Get list of managed worktrees from port registry
   * @private
   */
  _getManagedWorktrees() {
    const ports = this.portRegistry.ports || {};
    const worktreeNames = new Set();

    for (const key of Object.keys(ports)) {
      const [worktreeName] = key.split(':');
      worktreeNames.add(worktreeName);
    }

    return Array.from(worktreeNames);
  }

  /**
   * Check if worktree has docker-compose.yml
   * @private
   */
  _hasComposeFile(worktreePath) {
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml'
    ];

    return composeFiles.some(file => existsSync(join(worktreePath, file)));
  }

  /**
   * Get running containers associated with a worktree
   * @private
   */
  _getRunningContainers(worktreeName) {
    try {
      const cmd = this.runtime.getComposeCommand();
      const output = execSync(`${cmd} ps -a --format json`, {
        cwd: join(this.worktreeBase, worktreeName),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (!output.trim()) {
        return [];
      }

      // Parse JSONL output (one JSON object per line)
      const containers = output
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            const container = JSON.parse(line);
            return {
              name: container.Name || container.name,
              service: container.Service || container.service,
              state: container.State || container.state,
              port: this._extractPort(container)
            };
          } catch {
            return null;
          }
        })
        .filter(c => c !== null && c.state === 'running');

      return containers;
    } catch (error) {
      // No containers or compose file doesn't exist
      return [];
    }
  }

  /**
   * Extract port from container info
   * @private
   */
  _extractPort(container) {
    const ports = container.Ports || container.ports || '';

    if (!ports) {
      return null;
    }

    // Parse port mapping like "0.0.0.0:5432->5432/tcp"
    const match = ports.match(/0\.0\.0\.0:(\d+)->/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return null;
  }

  /**
   * Check if worktree can be imported
   * @private
   */
  _canImport(worktree) {
    const issues = this._checkIssues(worktree);
    return issues.length === 0;
  }

  /**
   * Check for issues that would prevent import
   * @private
   */
  _checkIssues(worktree) {
    const issues = [];

    // Check if path exists
    if (!existsSync(worktree.path)) {
      issues.push('Path does not exist');
    }

    // Check if .git file exists (worktree marker)
    const gitFile = join(worktree.path, '.git');
    if (!existsSync(gitFile)) {
      issues.push('Missing .git file');
    } else {
      // Verify .git file points to correct location
      try {
        const gitFileContent = readFileSync(gitFile, 'utf-8');
        if (!gitFileContent.startsWith('gitdir:')) {
          issues.push('Invalid .git file format');
        }
      } catch {
        issues.push('Cannot read .git file');
      }
    }

    // Check if branch exists
    try {
      execSync(`git rev-parse --verify ${worktree.branch}`, {
        cwd: this.repoRoot,
        stdio: 'pipe'
      });
    } catch {
      issues.push(`Branch "${worktree.branch}" does not exist`);
    }

    return issues;
  }

  /**
   * Allocate ports from docker-compose.yml
   * @private
   */
  _allocatePortsFromCompose(worktreeName, worktreePath) {
    try {
      const { ComposeInspector } = require('./compose-inspector.mjs');
      const composeFile = join(worktreePath, 'docker-compose.yml');

      if (!existsSync(composeFile)) {
        return {};
      }

      const inspector = new ComposeInspector(composeFile, this.runtime);
      const services = inspector.getServices();
      const ports = {};

      for (const service of services) {
        if (service.ports.length > 0) {
          const basePort = service.ports[0];
          ports[service.name] = this.portRegistry.allocate(
            worktreeName,
            service.name,
            basePort
          );
        }
      }

      return ports;
    } catch (error) {
      console.warn(`Failed to allocate ports from compose file: ${error.message}`);
      return {};
    }
  }

  /**
   * List all worktrees (managed + unmanaged)
   * @returns {Object} Categorized worktrees
   */
  getAllWorktrees() {
    const gitWorktrees = this._getGitWorktrees();
    const managedNames = this._getManagedWorktrees();
    const unmanaged = this.discoverUnmanaged();

    const managed = gitWorktrees
      .filter(wt => managedNames.includes(wt.name))
      .map(wt => ({
        ...wt,
        ports: this.portRegistry.getWorktreePorts(wt.name)
      }));

    return {
      managed,
      unmanaged,
      total: gitWorktrees.length
    };
  }
}
