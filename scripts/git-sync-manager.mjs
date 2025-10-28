/**
 * Git Sync Manager - Phase 2.9 (Basic) + Phase 5.1 (Smart Detection)
 *
 * Handles git updates from main branch with:
 * - Basic sync: fetch, merge, conflict detection, rollback
 * - Smart detection: analyze changed files for service/dependency impacts
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export class ChangeDetector {
  constructor(worktreePath) {
    this.worktreePath = worktreePath;
  }

  /**
   * Analyze changes between current state and commits
   * @param {string[]} commits - Array of commit SHAs to analyze
   * @returns {Object} Analysis results
   */
  async analyzeChanges(commits) {
    const changedFiles = await this.getChangedFiles(commits);

    return {
      needsServiceRestart: this.detectServiceChanges(changedFiles),
      needsDependencyInstall: this.detectDependencyChanges(changedFiles),
      needsMigration: this.detectMigrations(changedFiles),
      affectedServices: this.getAffectedServices(changedFiles),
      changedFiles,
      summary: this._buildSummary(changedFiles)
    };
  }

  /**
   * Get list of files changed in commits
   * @param {string[]} commits - Array of commit SHAs
   * @returns {string[]} List of changed file paths
   */
  async getChangedFiles(commits) {
    if (commits.length === 0) return [];

    try {
      const range = commits.length === 1
        ? commits[0]
        : `${commits[commits.length - 1]}..${commits[0]}`;

      const output = execSync(
        `git diff --name-only ${range}`,
        { cwd: this.worktreePath, encoding: 'utf-8' }
      );

      return output.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      console.error('Error getting changed files:', error);
      return [];
    }
  }

  /**
   * Detect if service configuration changed
   * @param {string[]} files - Changed file paths
   * @returns {boolean}
   */
  detectServiceChanges(files) {
    return files.some(f =>
      f === 'docker-compose.yml' ||
      f === 'compose.yml' ||
      f === 'podman-compose.yml' ||
      f.match(/^docker-compose\..+\.yml$/) ||
      f === 'Dockerfile' ||
      f.startsWith('.env') ||
      f === '.env.local' ||
      f === '.env.production'
    );
  }

  /**
   * Detect if dependencies changed
   * @param {string[]} files - Changed file paths
   * @returns {Object} Changed dependency files by type
   */
  detectDependencyChanges(files) {
    const changes = {
      npm: files.includes('package.json') || files.includes('package-lock.json'),
      python: files.includes('requirements.txt') || files.includes('Pipfile') || files.includes('poetry.lock'),
      ruby: files.includes('Gemfile') || files.includes('Gemfile.lock'),
      go: files.includes('go.mod') || files.includes('go.sum'),
      rust: files.includes('Cargo.toml') || files.includes('Cargo.lock'),
      php: files.includes('composer.json') || files.includes('composer.lock')
    };

    // Return true if any dependency file changed
    return Object.values(changes).some(changed => changed);
  }

  /**
   * Detect if database migrations exist
   * @param {string[]} files - Changed file paths
   * @returns {Object} Migration info
   */
  detectMigrations(files) {
    const migrationPatterns = [
      /migrations?\//,
      /db\/migrate\//,
      /database\/migrations\//,
      /prisma\/migrations\//,
      /\.migration\./,
      /alembic\/versions\//
    ];

    const migrationFiles = files.filter(f =>
      migrationPatterns.some(pattern => pattern.test(f))
    );

    return {
      hasMigrations: migrationFiles.length > 0,
      files: migrationFiles,
      count: migrationFiles.length
    };
  }

  /**
   * Map changed files to affected services
   * @param {string[]} files - Changed file paths
   * @returns {string[]} List of service names that may be affected
   */
  getAffectedServices(files) {
    const services = new Set();

    // Try to parse docker-compose.yml to understand service structure
    const composeServices = this._parseComposeServices();

    for (const file of files) {
      // Direct service config changes
      if (this.detectServiceChanges([file])) {
        services.add('_all_'); // All services affected
        continue;
      }

      // Map file paths to services based on common patterns
      if (file.startsWith('services/')) {
        const serviceName = file.split('/')[1];
        services.add(serviceName);
      } else if (file.startsWith('apps/')) {
        const appName = file.split('/')[1];
        services.add(appName);
      } else if (file.startsWith('packages/')) {
        // Shared package changes may affect multiple services
        services.add('_all_');
      }

      // Match against docker-compose service names
      for (const [serviceName, serviceConfig] of Object.entries(composeServices)) {
        // Check if file is in service's context directory
        if (serviceConfig.build && serviceConfig.build.context) {
          const context = serviceConfig.build.context;
          if (file.startsWith(context)) {
            services.add(serviceName);
          }
        }

        // Check if file matches service's working directory
        if (serviceConfig.working_dir && file.startsWith(serviceConfig.working_dir)) {
          services.add(serviceName);
        }
      }
    }

    return Array.from(services);
  }

  /**
   * Parse docker-compose.yml to get service definitions
   * @private
   */
  _parseComposeServices() {
    const composePaths = [
      'docker-compose.yml',
      'compose.yml',
      'podman-compose.yml'
    ];

    for (const composePath of composePaths) {
      const fullPath = join(this.worktreePath, composePath);
      if (existsSync(fullPath)) {
        try {
          const composeContent = readFileSync(fullPath, 'utf-8');
          const composeData = yaml.load(composeContent);
          return composeData.services || {};
        } catch (error) {
          console.error(`Error parsing ${composePath}:`, error);
        }
      }
    }

    return {};
  }

  /**
   * Build dependency graph from docker-compose.yml
   * @returns {Map<string, string[]>} Service dependency map
   */
  buildServiceDependencyGraph() {
    const services = this._parseComposeServices();
    const graph = new Map();

    for (const [serviceName, config] of Object.entries(services)) {
      const dependencies = [];

      // Add explicit dependencies
      if (config.depends_on) {
        if (Array.isArray(config.depends_on)) {
          dependencies.push(...config.depends_on);
        } else if (typeof config.depends_on === 'object') {
          dependencies.push(...Object.keys(config.depends_on));
        }
      }

      // Add implicit dependencies from links
      if (config.links) {
        dependencies.push(...config.links.map(link => link.split(':')[0]));
      }

      graph.set(serviceName, dependencies);
    }

    return graph;
  }

  /**
   * Get restart order based on dependency graph
   * @param {string[]} servicesToRestart - Services that need restart
   * @returns {string[][]} Batches of services to restart (order matters)
   */
  getRestartOrder(servicesToRestart) {
    if (servicesToRestart.includes('_all_')) {
      // All services need restart - use dependency order
      const graph = this.buildServiceDependencyGraph();
      return this._topologicalSort(graph);
    }

    // For specific services, restart in dependency order
    const graph = this.buildServiceDependencyGraph();
    const filteredGraph = new Map();

    for (const service of servicesToRestart) {
      if (graph.has(service)) {
        filteredGraph.set(service, graph.get(service));
      }
    }

    return this._topologicalSort(filteredGraph);
  }

  /**
   * Topological sort for dependency graph
   * @private
   */
  _topologicalSort(graph) {
    const visited = new Set();
    const batches = [];
    const inDegree = new Map();

    // Calculate in-degrees
    for (const [node, deps] of graph) {
      if (!inDegree.has(node)) inDegree.set(node, 0);
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Process nodes with no dependencies first
    while (visited.size < graph.size) {
      const batch = [];

      for (const [node, deps] of graph) {
        if (visited.has(node)) continue;

        // Check if all dependencies are satisfied
        const allDepsVisited = deps.every(dep => visited.has(dep));
        if (allDepsVisited) {
          batch.push(node);
        }
      }

      if (batch.length === 0) {
        // Circular dependency or no nodes left - add remaining
        for (const [node] of graph) {
          if (!visited.has(node)) {
            batch.push(node);
          }
        }
      }

      for (const node of batch) {
        visited.add(node);
      }

      if (batch.length > 0) {
        batches.push(batch);
      }
    }

    return batches;
  }

  /**
   * Build human-readable summary of changes
   * @private
   */
  _buildSummary(files) {
    const categories = {
      services: [],
      dependencies: [],
      migrations: [],
      source: [],
      config: [],
      other: []
    };

    for (const file of files) {
      if (this.detectServiceChanges([file])) {
        categories.services.push(file);
      } else if (this.detectDependencyChanges([file])) {
        categories.dependencies.push(file);
      } else if (this.detectMigrations([file]).hasMigrations) {
        categories.migrations.push(file);
      } else if (file.match(/\.(js|ts|jsx|tsx|py|go|rb|php|rs)$/)) {
        categories.source.push(file);
      } else if (file.match(/\.(json|yml|yaml|toml|ini|conf)$/)) {
        categories.config.push(file);
      } else {
        categories.other.push(file);
      }
    }

    return {
      total: files.length,
      ...categories
    };
  }
}

export class GitSyncManager {
  constructor(worktreePath, baseBranch = 'main') {
    this.worktreePath = worktreePath;
    this.baseBranch = baseBranch;
    this.changeDetector = new ChangeDetector(worktreePath);
  }

  /**
   * Fetch updates from remote
   * @returns {Object} Update info
   */
  async fetchUpstream() {
    try {
      // Fetch from origin
      execSync('git fetch origin', {
        cwd: this.worktreePath,
        stdio: 'pipe'
      });

      // Get base branch
      const baseBranch = this._getBaseBranch();

      // Count commits behind
      const output = execSync(
        `git rev-list --count HEAD..origin/${baseBranch}`,
        { cwd: this.worktreePath, encoding: 'utf-8' }
      );

      const commitCount = parseInt(output.trim(), 10);

      // Get commit details
      let commits = [];
      if (commitCount > 0) {
        const logOutput = execSync(
          `git log --oneline HEAD..origin/${baseBranch} -n 10`,
          { cwd: this.worktreePath, encoding: 'utf-8' }
        );

        commits = logOutput.trim().split('\n').map(line => {
          const [sha, ...messageParts] = line.split(' ');
          return {
            sha,
            message: messageParts.join(' ')
          };
        });
      }

      return {
        hasUpdates: commitCount > 0,
        commitCount,
        commits,
        baseBranch
      };
    } catch (error) {
      console.error('Error fetching upstream:', error);
      return {
        hasUpdates: false,
        commitCount: 0,
        commits: [],
        error: error.message
      };
    }
  }

  /**
   * Check if worktree has uncommitted changes
   * @returns {boolean}
   */
  hasUncommittedChanges() {
    try {
      const output = execSync('git status --porcelain', {
        cwd: this.worktreePath,
        encoding: 'utf-8'
      });

      return output.trim().length > 0;
    } catch (error) {
      console.error('Error checking git status:', error);
      return false;
    }
  }

  /**
   * Sync with main branch
   * @param {'merge'|'rebase'} strategy - Sync strategy
   * @param {Object} options - Additional options
   * @returns {Object} Sync result
   */
  async syncWithMain(strategy = 'merge', options = {}) {
    try {
      // Store current commit for rollback
      const currentCommit = this._getCurrentCommit();

      // Warn if uncommitted changes
      if (this.hasUncommittedChanges() && !options.force) {
        return {
          success: false,
          error: 'uncommitted_changes',
          message: 'Worktree has uncommitted changes. Commit or stash them first.'
        };
      }

      // Get base branch
      const baseBranch = this._getBaseBranch();

      // Perform sync
      let output;
      if (strategy === 'rebase') {
        output = execSync(`git rebase origin/${baseBranch}`, {
          cwd: this.worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      } else {
        output = execSync(`git merge origin/${baseBranch}`, {
          cwd: this.worktreePath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      }

      // Check for conflicts
      const conflicts = this._getConflicts();
      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          output,
          rollbackCommit: currentCommit,
          message: `${conflicts.length} file(s) have conflicts`
        };
      }

      return {
        success: true,
        output,
        previousCommit: currentCommit,
        message: 'Sync completed successfully'
      };
    } catch (error) {
      // Check if it's a conflict error
      const conflicts = this._getConflicts();
      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          output: error.message,
          rollbackCommit: this._getCurrentCommit(),
          message: `${conflicts.length} file(s) have conflicts`
        };
      }

      return {
        success: false,
        error: 'sync_failed',
        message: error.message,
        output: error.stderr || error.message
      };
    }
  }

  /**
   * Rollback to previous commit
   * @param {string} commitSha - Commit to rollback to
   * @returns {Object} Rollback result
   */
  async rollback(commitSha) {
    try {
      execSync(`git reset --hard ${commitSha}`, {
        cwd: this.worktreePath,
        stdio: 'pipe'
      });

      return {
        success: true,
        message: `Rolled back to ${commitSha}`
      };
    } catch (error) {
      return {
        success: false,
        error: 'rollback_failed',
        message: error.message
      };
    }
  }

  /**
   * Get current git conflicts
   * @private
   */
  _getConflicts() {
    try {
      const output = execSync('git diff --name-only --diff-filter=U', {
        cwd: this.worktreePath,
        encoding: 'utf-8'
      });

      return output.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get current commit SHA
   * @private
   */
  _getCurrentCommit() {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.worktreePath,
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      return null;
    }
  }

  /**
   * Get base branch (main or master)
   * @private
   */
  _getBaseBranch() {
    if (this.baseBranch) return this.baseBranch;

    try {
      // Try to detect from git
      const branches = execSync('git branch -r', {
        cwd: this.worktreePath,
        encoding: 'utf-8'
      });

      if (branches.includes('origin/main')) {
        return 'main';
      } else if (branches.includes('origin/master')) {
        return 'master';
      }
    } catch (error) {
      console.error('Error detecting base branch:', error);
    }

    return 'main'; // Default fallback
  }

  /**
   * Analyze changes from sync (Phase 5.1 Smart Detection)
   * @param {string[]} commitShas - Commits to analyze
   * @returns {Object} Analysis results
   */
  async analyzeChanges(commitShas) {
    return await this.changeDetector.analyzeChanges(commitShas);
  }
}
