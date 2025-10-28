#!/usr/bin/env node
/**
 * Worktree Manager Web Server
 *
 * Provides a web UI for managing git worktrees, docker containers, and Claude Code sessions
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { basename, join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createServer as createNetServer } from 'net';
import { Profiler } from '../profiler.mjs';
import { PerformanceOptimizer } from '../performance-optimizer.mjs';
import { CacheManager } from '../cache-manager.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use current working directory as project root (supports multiple instances)
const rootDir = process.cwd();

// Parse command-line arguments
const args = process.argv.slice(2);
const listenAll = args.includes('--listen');
const HOST = listenAll ? '0.0.0.0' : '127.0.0.1';

// Port configuration
const portArg = args.find(arg => arg.startsWith('--port='));
const requestedPort = portArg ? parseInt(portArg.split('=')[1], 10) : 3335;
const PORT_RANGE_START = requestedPort;
const PORT_RANGE_END = requestedPort + 10; // Try 10 ports

/**
 * Check if a port is available
 */
function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = createNetServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port in the range
 */
async function findAvailablePort(startPort, endPort, host = '127.0.0.1') {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${endPort}`);
}

/**
 * Check if required dependencies are installed
 */
function checkDependencies() {
  const requiredDeps = ['express', 'ws', 'node-pty'];
  const nodeModulesPath = join(rootDir, 'node_modules');

  for (const dep of requiredDeps) {
    const depPath = join(nodeModulesPath, dep);
    if (!existsSync(depPath)) {
      return false;
    }
  }
  return true;
}

/**
 * Install dependencies if missing
 */
function ensureDependencies() {
  if (!checkDependencies()) {
    console.log('📦 Installing web server dependencies...');
    try {
      execSync('npm install', {
        cwd: rootDir,
        stdio: 'inherit',
        encoding: 'utf-8'
      });
      console.log('✓ Dependencies installed\n');
    } catch (error) {
      console.error('Failed to install dependencies:', error.message);
      process.exit(1);
    }
  }
}

// Ensure dependencies before importing modules
ensureDependencies();

// Dynamic imports after ensuring dependencies
const express = (await import('express')).default;
const multer = (await import('multer')).default;
const { createServer } = await import('http');
const { WebSocketServer } = await import('ws');
const pty = await import('node-pty');
const { PortRegistry } = await import('../port-registry.mjs');
const { FirstRunWizard } = await import('../first-run-wizard.mjs');
const { ContainerRuntime } = await import('../container-runtime.mjs');
const { ComposeInspector } = await import('../compose-inspector.mjs');
const { ConfigManager } = await import('../config-manager.mjs');
const { DataSync } = await import('../data-sync.mjs');
const { McpManager } = await import('../mcp-manager.mjs');
const { agentRegistry } = await import('../agents/index.mjs');
const { GitSyncManager } = await import('../git-sync-manager.mjs');
const { SmartReloadManager } = await import('../smart-reload-manager.mjs');
const { AIConflictResolver } = await import('../ai-conflict-resolver.mjs');
const { DatabaseManager} = await import('../database-manager.mjs');
const { DatabaseValidator } = await import('../database-validator.mjs');
const { BranchManager } = await import('../branch-manager.mjs');
const { BranchCleanupManager } = await import('../branch-cleanup-manager.mjs');
const { WorktreeImporter } = await import('../worktree-importer.mjs');
const { DiagnosticRunner } = await import('../diagnostic-runner.mjs');
const { PTYSessionManager } = await import('../pty-session-manager.mjs');

const WORKTREE_BASE = join(process.cwd(), '.worktrees');

// Initialize global instances
const runtime = new ContainerRuntime();
const config = new ConfigManager(process.cwd());
config.load(); // Load or create default config
const mcpManager = new McpManager(process.cwd(), runtime);

console.log(`🐳 Container runtime: ${runtime.getRuntime()} (${runtime.getComposeCommand()})`);
console.log(`🔌 MCP servers discovered: ${mcpManager.discoverServers().length}`);
console.log(`🤖 AI agents available: ${agentRegistry.list().join(', ')}`);

/**
 * Worktree Manager
 */
class WorktreeManager {
  constructor() {
    this.portRegistry = new PortRegistry(rootDir);
    this.clients = new Set();
    this.ptyManager = new PTYSessionManager({
      autoSaveInterval: 5000, // Save state every 5 seconds
      orphanTimeout: 24 * 60 * 60 * 1000 // Clean up sessions after 24 hours
    });
    this.profiler = new Profiler();
    this.optimizer = new PerformanceOptimizer({ profiler: this.profiler });
    this.cacheManager = new CacheManager();
    this.importer = new WorktreeImporter(rootDir, this.portRegistry, runtime);
    this.diagnostics = new DiagnosticRunner(rootDir, this.portRegistry, runtime);
  }

  /**
   * Dynamically discover services and allocate ports
   * @param {string} worktreeName - Name of the worktree
   * @param {string} worktreePath - Path to the worktree
   * @returns {Object} Port allocations { serviceName: port }
   */
  discoverAndAllocatePorts(worktreeName, worktreePath) {
    const composeFile = config.get('container.composeFile') || 'docker-compose.yml';
    const composeFilePath = join(worktreePath, composeFile);

    // Check if compose file exists
    if (!existsSync(composeFilePath)) {
      console.warn(`[PORTS] Compose file not found: ${composeFilePath}, using defaults`);
      return this._allocateDefaultPorts(worktreeName);
    }

    try {
      // Use ComposeInspector to discover services
      const inspector = new ComposeInspector(composeFilePath, runtime);
      const services = inspector.getServices();

      const ports = {};

      // Allocate ports for each service that exposes ports
      for (const service of services) {
        if (service.ports.length > 0) {
          // Use the first exposed port as the base port
          const basePort = service.ports[0];
          ports[service.name] = this.portRegistry.allocate(worktreeName, service.name, basePort);
        }
      }

      console.log(`[PORTS] Discovered ${services.length} services, allocated ${Object.keys(ports).length} ports`);
      return ports;
    } catch (error) {
      console.warn(`[PORTS] Failed to inspect compose file: ${error.message}, using defaults`);
      return this._allocateDefaultPorts(worktreeName);
    }
  }

  /**
   * Fallback to default port allocation for project-riftwing compatibility
   * @private
   */
  _allocateDefaultPorts(worktreeName) {
    console.log(`[PORTS] Using default port allocation`);
    return {
      postgres: this.portRegistry.allocate(worktreeName, 'postgres', 5432),
      api: this.portRegistry.allocate(worktreeName, 'api', 3000),
      console: this.portRegistry.allocate(worktreeName, 'console', 5173),
      temporal: this.portRegistry.allocate(worktreeName, 'temporal', 7233),
      temporalui: this.portRegistry.allocate(worktreeName, 'temporalui', 8233),
      minio: this.portRegistry.allocate(worktreeName, 'minio', 9000),
      minioconsole: this.portRegistry.allocate(worktreeName, 'minioconsole', 9001),
    };
  }

  /**
   * Find database service port from allocated ports
   * Looks for common database service names
   * @param {Object} ports - Allocated ports object
   * @returns {number|null} Database port or null if not found
   */
  _findDatabasePort(ports) {
    // Common database service names
    const dbServices = ['postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'db', 'database'];

    for (const serviceName of dbServices) {
      if (ports[serviceName]) {
        return ports[serviceName];
      }
    }

    return null;
  }

  broadcast(event, data) {
    const message = JSON.stringify({ event, data });
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  listWorktrees() {
    try {
      const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
      const worktrees = [];
      const lines = output.split('\n');
      let current = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch '.length).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path) {
            // Use branch name as worktree name (not directory name)
            current.name = current.branch || basename(current.path);
            current.ports = this.portRegistry.getWorktreePorts(current.name);
            current.dockerStatus = this.getDockerStatus(current.path, current.name);
            current.gitStatus = this.getGitStatus(current.path);
            current.githubUrl = this.getGitHubUrl(current.path);
            current.commitCount = this.getCommitCount(current.path, current.branch);
            worktrees.push(current);
            current = {};
          }
        }
      }

      if (current.path) {
        // Use branch name as worktree name (not directory name)
        current.name = current.branch || basename(current.path);
        current.ports = this.portRegistry.getWorktreePorts(current.name);
        current.dockerStatus = this.getDockerStatus(current.path, current.name);
        current.gitStatus = this.getGitStatus(current.path);
        current.githubUrl = this.getGitHubUrl(current.path);
        current.commitCount = this.getCommitCount(current.path, current.branch);
        worktrees.push(current);
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to list worktrees:', error.message);
      return [];
    }
  }

  getGitHubUrl(worktreePath) {
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();

      // Convert SSH or HTTPS Git URLs to GitHub web URLs
      // SSH: git@github.com:user/repo.git
      // HTTPS: https://github.com/user/repo.git
      let githubUrl = remoteUrl;

      if (remoteUrl.startsWith('git@github.com:')) {
        // Convert SSH to HTTPS
        githubUrl = remoteUrl
          .replace('git@github.com:', 'https://github.com/')
          .replace(/\.git$/, '');
      } else if (remoteUrl.startsWith('https://github.com/')) {
        // Remove .git suffix
        githubUrl = remoteUrl.replace(/\.git$/, '');
      } else {
        // Not a GitHub URL, return null
        return null;
      }

      return githubUrl;
    } catch (error) {
      // No remote or git command failed
      return null;
    }
  }

  getCommitCount(worktreePath, branchName) {
    try {
      // For main branch, always return a positive count (it has commits by definition)
      if (branchName === 'main') {
        const output = execSync('git rev-list --count HEAD', {
          cwd: worktreePath,
          encoding: 'utf-8'
        }).trim();
        const count = parseInt(output, 10) || 0;
        console.log(`[getCommitCount] ${branchName}: ${count} commits (main branch)`);
        return count;
      }

      // For other branches, count commits that aren't in main
      // This tells us if the branch has unique work
      const output = execSync('git rev-list --count HEAD ^main', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();
      const count = parseInt(output, 10) || 0;
      console.log(`[getCommitCount] ${branchName}: ${count} commits unique to branch`);
      return count;
    } catch (error) {
      console.log(`[getCommitCount] ${branchName}: Error with ^main comparison (${error.message}), returning 0`);
      // If the comparison fails (e.g., main doesn't exist), return 0
      return 0;
    }
  }

  getDockerStatus(worktreePath, worktreeName) {
    const statuses = [];

    // Get Docker container statuses
    try {
      const output = runtime.execCompose('ps -a --format json', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const services = output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .filter(svc => !svc.Service.endsWith('-init')); // Filter out init containers

      statuses.push(...services.map(svc => ({
        name: svc.Service,
        state: svc.State,
        status: svc.Status,
        ports: svc.Publishers?.map(p => `${p.PublishedPort}→${p.TargetPort}`) || []
      })));
    } catch {
      // Docker services might not be running
    }

    return statuses;
  }

  getGitStatus(worktreePath) {
    try {
      // Check for uncommitted changes
      const statusOutput = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      if (statusOutput) {
        return 'uncommitted'; // Has uncommitted changes
      }

      // Check for unpushed commits
      try {
        const unpushedOutput = execSync('git log @{u}.. --oneline 2>/dev/null || echo ""', {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        if (unpushedOutput) {
          return 'unpushed'; // Has unpushed commits
        }
      } catch {
        // No upstream branch or other error, consider clean
      }

      return 'clean'; // Clean working tree
    } catch {
      return 'unknown';
    }
  }

  async createWorktree(branchName, fromBranch = 'main') {
    const totalId = this.profiler.start('create-worktree-total');

    // Slugify branch name for git (replace invalid characters)
    const slugifiedBranch = branchName
      .toLowerCase()
      .replace(/[^a-z0-9\/._-]/g, '-')  // Replace invalid chars with dash
      .replace(/--+/g, '-')              // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, '')           // Remove leading/trailing dashes
      .replace(/\//g, '-');              // Replace slashes with dashes for worktree name

    const worktreeName = slugifiedBranch;
    const worktreePath = join(WORKTREE_BASE, worktreeName);

    console.log(`[CREATE] Starting createWorktree(${branchName} -> ${slugifiedBranch}, ${fromBranch})`);

    if (!existsSync(WORKTREE_BASE)) {
      console.log(`[CREATE] Creating base directory: ${WORKTREE_BASE}`);
      mkdirSync(WORKTREE_BASE, { recursive: true });
    }

    try {
      // IDEMPOTENCY CHECK 1: Does the branch already exist?
      const branchExists = execSync(`git branch --list "${slugifiedBranch}"`, {
        encoding: 'utf-8'
      }).trim().length > 0;
      console.log(`[CREATE] Branch ${slugifiedBranch} exists: ${branchExists}`);

      // IDEMPOTENCY CHECK 2: Does the worktree directory already exist?
      const dirExists = existsSync(worktreePath);
      console.log(`[CREATE] Directory ${worktreePath} exists: ${dirExists}`);

      // IDEMPOTENCY CHECK 3: Is there a worktree registration?
      const worktrees = this.listWorktrees();
      const worktreeRegistered = worktrees.some(wt => wt.name === worktreeName);
      console.log(`[CREATE] Worktree ${worktreeName} registered: ${worktreeRegistered}`);

      // IDEMPOTENT LOGIC: If everything exists, return success
      if (branchExists && dirExists && worktreeRegistered) {
        console.log(`[CREATE] Worktree ${worktreeName} already exists, skipping creation`);
        this.profiler.end(totalId);
        return {
          success: true,
          name: worktreeName,
          path: worktreePath,
          branch: slugifiedBranch,
          existed: true,
          message: 'Worktree already exists'
        };
      }

      // Handle orphaned worktree registration (directory deleted but registration remains)
      if (worktreeRegistered && !dirExists) {
        console.log(`[CREATE] Found orphaned registration for ${worktreeName}, pruning...`);
        execSync('git worktree prune', { stdio: 'pipe' });
      }

      // Handle orphaned directory (directory exists but not registered)
      if (dirExists && !worktreeRegistered) {
        console.log(`[CREATE] Found orphaned directory ${worktreePath}, removing...`);
        execSync(`rm -rf "${worktreePath}"`, { stdio: 'pipe' });
      }

      // Progress: Creating git worktree
      const gitId = this.profiler.start('git-worktree-add', totalId);
      console.log(`[CREATE] Broadcasting git progress...`);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: 'Creating git worktree...'
      });

      // Use correct git command based on whether branch exists
      const createCmd = branchExists
        ? `git worktree add "${worktreePath}" "${slugifiedBranch}"`  // Branch exists, just check it out
        : `git worktree add -b "${slugifiedBranch}" "${worktreePath}" "${fromBranch}"`; // Create new branch

      console.log(`[CREATE] Running: ${createCmd}`);
      execSync(createCmd, { stdio: 'pipe' });

      console.log(`[CREATE] Git worktree created successfully`);
      this.profiler.end(gitId);

      // Push the new branch to GitHub to create it remotely
      const pushId = this.profiler.start('git-push-branch', totalId);
      console.log(`[CREATE] Pushing branch to GitHub...`);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: 'Pushing branch to GitHub...'
      });

      try {
        execSync(`git push -u origin "${slugifiedBranch}"`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });
        console.log(`[CREATE] Branch pushed to GitHub successfully`);
      } catch (pushError) {
        console.warn(`[CREATE] Failed to push branch to GitHub: ${pushError.message}`);
        // Don't fail the whole operation if push fails
      }
      this.profiler.end(pushId);

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: '✓ Git worktree created'
      });

      // Progress: Allocating ports (quick, do before slow operations)
      const portsId = this.profiler.start('allocate-ports', totalId);
      console.log(`[CREATE] Allocating ports...`);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'ports',
        message: 'Discovering services and allocating ports...'
      });

      // Dynamically discover services and allocate ports
      const ports = this.discoverAndAllocatePorts(worktreeName, worktreePath);

      const portSummary = Object.entries(ports)
        .slice(0, 3)
        .map(([svc, port]) => `${svc}:${port}`)
        .join(', ');

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'ports',
        message: `✓ Ports allocated: ${portSummary}${Object.keys(ports).length > 3 ? '...' : ''}`
      });
      this.profiler.end(portsId);

      // Write .env file for docker-compose (quick, do before slow operations)
      const envFilePath = join(worktreePath, '.env');
      const projectName = `vibe_${worktreeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Generate env content dynamically from discovered ports
      let envContent = `COMPOSE_PROJECT_NAME=${projectName}\n`;
      for (const [serviceName, port] of Object.entries(ports)) {
        // Convert service name to env var format: postgres -> POSTGRES_PORT
        const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;
        envContent += `${envVarName}=${port}\n`;
      }

      writeFileSync(envFilePath, envContent);

      // Generate MCP server configuration for this worktree
      const mcpId = this.profiler.start('mcp-discovery', totalId);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'mcp',
        message: 'Configuring MCP servers...'
      });

      try {
        // Configure MCP servers with database URL if postgres service exists
        const serverEnv = {};
        if (ports.postgres) {
          serverEnv.postgres = {
            DATABASE_URL: `postgresql://localhost:${ports.postgres}/vibe`
          };
        }

        const mcpResult = mcpManager.generateClaudeSettings(worktreePath, null, { serverEnv });
        console.log(`[CREATE] MCP configuration generated: ${mcpResult.count} servers configured`);
      } catch (error) {
        console.warn(`[CREATE] MCP configuration failed (non-critical):`, error.message);
      }
      this.profiler.end(mcpId);

      // Run database copy and bootstrap in parallel (both are slow)
      console.log(`[CREATE] Starting parallel operations: database copy + bootstrap...`);

      const databaseCopyPromise = this.copyDatabase(worktreeName, worktreePath)
        .then(() => console.log(`[CREATE] Database copy completed`))
        .catch(err => {
          console.error(`[CREATE] Database copy failed:`, err.message);
          throw err;
        });

      const bootstrapId = this.profiler.start('npm-bootstrap', totalId);
      const bootstrapPromise = new Promise((resolve, reject) => {
        console.log(`[CREATE] Running bootstrap to build packages...`);
        this.broadcast('worktree:progress', {
          name: worktreeName,
          step: 'bootstrap',
          message: 'Building packages (bootstrap)...'
        });

        try {
          execSync('npm run bootstrap', {
            cwd: worktreePath,
            stdio: 'pipe',
            encoding: 'utf-8'
          });
          console.log(`[CREATE] Bootstrap completed successfully`);
          this.broadcast('worktree:progress', {
            name: worktreeName,
            step: 'bootstrap',
            message: '✓ Bootstrap complete'
          });
          this.profiler.end(bootstrapId);
          resolve();
        } catch (err) {
          console.error(`[CREATE] Failed to bootstrap packages:`, err.message);
          this.profiler.end(bootstrapId);
          reject(new Error(`Failed to bootstrap packages: ${err.message}`));
        }
      });

      // Wait for both parallel operations to complete
      await Promise.all([databaseCopyPromise, bootstrapPromise]);
      console.log(`[CREATE] All parallel operations completed`);

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'parallel',
        message: '✓ Database and packages ready'
      });

      // Start containers
      const dockerId = this.profiler.start('docker-compose-up', totalId);
      console.log(`[CREATE] Starting containers...`);
      await this.startContainersForWorktree(worktreeName, worktreePath);
      console.log(`[CREATE] Containers started`);
      this.profiler.end(dockerId);

      const worktree = {
        name: worktreeName,
        path: worktreePath,
        branch: slugifiedBranch,
        ports,
        dockerStatus: []
      };

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'complete',
        message: '✓ Worktree ready!'
      });

      this.profiler.end(totalId);

      // Log performance report
      const report = this.profiler.generateReport();
      console.log('[PERFORMANCE] Worktree creation report:', JSON.stringify(report, null, 2));

      this.broadcast('worktree:created', worktree);
      return { success: true, worktree };
    } catch (error) {
      this.profiler.end(totalId);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'error',
        message: `✗ Error: ${error.message}`
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Optimized worktree creation using parallel operations and caching
   * @param {string} branchName - Branch name
   * @param {string} fromBranch - Source branch (default: 'main')
   * @returns {Promise<object>} Result with success status
   *
   * NOTE: This is a foundation for optimization. Currently delegates to createWorktree.
   * Full optimization implementation (parallel tasks, caching) will be added in future iterations.
   */
  async createWorktreeOptimized(branchName, fromBranch = 'main') {
    const totalId = this.profiler.start('create-worktree-optimized');

    try {
      // For now, use the profiled baseline implementation
      // Future: Use this.optimizer.runWithDependencies() for parallel execution
      // Future: Use this.cacheManager for node_modules caching
      const result = await this.createWorktree(branchName, fromBranch);

      this.profiler.end(totalId);

      const report = this.profiler.generateReport();
      console.log('[PERFORMANCE] Optimized worktree creation report:', JSON.stringify(report, null, 2));

      return result;
    } catch (error) {
      this.profiler.end(totalId);
      throw error;
    }
  }

  async copyDatabase(targetWorktreeName, targetWorktreePath) {
    try {
      this.broadcast('worktree:progress', {
        name: targetWorktreeName,
        step: 'database',
        message: 'Copying database...'
      });
      console.log(`Copying database for ${targetWorktreeName}...`);

      // Use pg_dump/pg_restore instead of file copy to avoid checkpoint corruption
      // This is safer because it works with a running database and creates a consistent snapshot

      // Find the main worktree's postgres port
      const worktrees = this.listWorktrees();
      const mainWorktree = worktrees.find(wt => !wt.path.includes('.worktrees'));

      const mainDbPort = mainWorktree ? this._findDatabasePort(mainWorktree.ports || {}) : null;

      if (!mainDbPort) {
        console.log(`No main worktree database found to copy`);
        this.broadcast('worktree:progress', {
          name: targetWorktreeName,
          step: 'database',
          message: 'Starting with fresh database'
        });
        return;
      }

      const sourcePort = mainDbPort;
      console.log(`Found main worktree database on port ${sourcePort}`);

      // Check if source database is accessible
      try {
        execSync(`docker exec ${mainWorktree.name.replace(/[^a-zA-Z0-9]/g, '_')}_postgres_1 pg_isready -U vibe`, {
          stdio: 'pipe'
        });
      } catch (e) {
        console.log(`Source database not running, skipping copy`);
        this.broadcast('worktree:progress', {
          name: targetWorktreeName,
          step: 'database',
          message: 'Starting with fresh database (source DB not running)'
        });
        return;
      }

      // Database copy is intentionally skipped to avoid checkpoint corruption
      // Each worktree will start with a fresh database
      // TODO: Implement proper database copy using pg_dump when containers are running
      console.log(`Skipping database copy to avoid checkpoint corruption`);
      this.broadcast('worktree:progress', {
        name: targetWorktreeName,
        step: 'database',
        message: 'Starting with fresh database'
      });
      return;
    } catch (error) {
      console.error(`Warning: Failed to copy database:`, error.message);
      this.broadcast('worktree:progress', {
        name: targetWorktreeName,
        step: 'database',
        message: `⚠ Database copy failed: ${error.message}`
      });
      // Don't fail worktree creation if database copy fails
    }
  }

  /**
   * Start containers for a worktree
   * @private
   */
  async startContainersForWorktree(worktreeName, worktreePath) {
    this.broadcast('worktree:progress', {
      name: worktreeName,
      step: 'containers',
      message: 'Starting Docker containers...'
    });

    try {
      // Build the compose command - runtime handles sudo automatically
      const composeCmd = `${runtime.getComposeCommand()} --env-file .env up -d`;
      const fullCmd = runtime.needsElevation() ? `sudo ${composeCmd}` : composeCmd;

      // Start containers with docker-compose up -d
      await this._runCommandWithProgress(
        fullCmd,
        worktreeName,
        'containers',
        { cwd: worktreePath }
      );

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'containers',
        message: '✓ All containers started'
      });
    } catch (error) {
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'containers',
        message: `⚠ Container startup: ${error.message}`
      });
      // Don't fail worktree creation if containers fail to start
    }
  }

  /**
   * Run a command and stream its output to WebSocket clients
   * @private
   */
  async _runCommandWithProgress(command, worktreeName, step, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        cwd: options.cwd || process.cwd(),
        stdio: ['inherit', 'pipe', 'pipe']  // inherit stdin for sudo password prompts
      });

      let hasOutput = false;

      // Add timeout to prevent infinite hangs
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Command timed out after 5 minutes'));
      }, 300000);  // 5 minute timeout

      child.stdout.on('data', (data) => {
        hasOutput = true;
        const output = data.toString();
        // Broadcast each line of output
        output.split('\n').filter(line => line.trim()).forEach(line => {
          this.broadcast('worktree:progress', {
            name: worktreeName,
            step,
            message: line.trim()
          });
        });
        console.log(output);
      });

      child.stderr.on('data', (data) => {
        hasOutput = true;
        const output = data.toString();
        // Also broadcast stderr (often contains progress info)
        output.split('\n').filter(line => line.trim()).forEach(line => {
          this.broadcast('worktree:progress', {
            name: worktreeName,
            step,
            message: line.trim()
          });
        });
        console.error(output);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Check if a worktree's branch has been merged to main
   */
  async checkPRMergeStatus(worktreeName, worktreePath) {
    try {
      // Get branch name
      const branch = execSync('git branch --show-current', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();

      if (!branch) {
        return {
          success: false,
          error: 'Could not determine branch name',
          isMerged: false
        };
      }

      // Fetch latest from remote
      try {
        execSync('git fetch origin', {
          cwd: process.cwd(),
          stdio: 'pipe'
        });
      } catch (fetchError) {
        console.warn('Warning: Could not fetch from origin:', fetchError.message);
      }

      // Check if branch is merged to main
      const mergedBranches = execSync('git branch -r --merged origin/main', {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });

      const isMerged = mergedBranches.includes(`origin/${branch}`);

      return {
        success: true,
        branch,
        isMerged,
        message: isMerged
          ? `Branch "${branch}" is merged to main`
          : `Branch "${branch}" is not yet merged to main`
      };
    } catch (error) {
      console.error('Error checking PR merge status:', error.message);
      return {
        success: false,
        error: error.message,
        isMerged: false, // Fail safe
        branch: 'unknown'
      };
    }
  }

  /**
   * Get database statistics (table names and row counts) for a worktree
   */
  async getWorktreeDatabaseStats(worktreePath) {
    try {
      // Query for row counts of main tables
      const query = `
        SELECT
          tablename as table_name,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND n_live_tup > 0
        ORDER BY n_live_tup DESC
        LIMIT 20;
      `;

      const result = runtime.execCompose(
        `exec -T postgres psql -U app app -t -A -F'|' -c "${query.replace(/\n/g, ' ')}"`,
        {
          cwd: worktreePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      // Parse results
      const tables = result.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [name, count] = line.split('|');
          return { name: name?.trim(), count: parseInt(count) || 0 };
        })
        .filter(t => t.name && t.count > 0);

      return { success: true, tables };
    } catch (error) {
      console.error('Error getting database stats:', error.message);
      return { success: false, error: error.message, tables: [] };
    }
  }

  /**
   * Check if main worktree has uncommitted changes
   */
  async checkMainWorktreeClean() {
    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }).trim();

      const isClean = !statusOutput;

      return {
        success: true,
        clean: isClean,
        status: isClean ? 'clean' : 'has uncommitted changes',
        details: statusOutput
      };
    } catch (error) {
      console.error('Error checking main worktree status:', error.message);
      return {
        success: false,
        clean: false,
        error: error.message
      };
    }
  }

  async deleteWorktree(worktreeName) {
    const worktrees = this.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);

    if (!worktree || !worktree.path.includes(WORKTREE_BASE)) {
      return { success: false, error: 'Cannot delete main worktree' };
    }

    try {
      // Stop services
      try {
        runtime.execCompose('--env-file .env down -v', {
          cwd: worktree.path,
          stdio: 'pipe'
        });
      } catch {}

      // Remove worktree
      execSync(`git worktree remove "${worktree.path}" --force`, { stdio: 'pipe' });

      // Release ports
      this.portRegistry.release(worktreeName);

      this.broadcast('worktree:deleted', { name: worktreeName });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async startServices(worktreeName) {
    const worktrees = this.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);

    if (!worktree) {
      return { success: false, error: 'Worktree not found' };
    }

    // Dynamically discover services and allocate ports
    const ports = this.discoverAndAllocatePorts(worktreeName, worktree.path);

    try {
      // Write .env file for docker-compose to use
      const envFilePath = join(worktree.path, '.env');
      // Use a unique project name to avoid container name conflicts
      const projectName = `vibe_${worktreeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Generate env content dynamically from discovered ports
      let envContent = `COMPOSE_PROJECT_NAME=${projectName}\n`;
      for (const [serviceName, port] of Object.entries(ports)) {
        // Convert service name to env var format: postgres -> POSTGRES_PORT
        const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_PORT`;
        envContent += `${envVarName}=${port}\n`;
      }

      writeFileSync(envFilePath, envContent);
      console.log(`✓ Wrote .env file for ${worktreeName}`);

      // Start Docker services
      const output = runtime.execCompose('--env-file .env up -d', {
        cwd: worktree.path,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      console.log(`✓ Started Docker services for ${worktreeName}`);

      this.broadcast('services:started', { worktree: worktreeName, ports });
      return { success: true, ports };
    } catch (error) {
      console.error(`Failed to start services for ${worktreeName}:`, error.message);
      console.error('stderr:', error.stderr?.toString());
      console.error('stdout:', error.stdout?.toString());
      const errorMsg = error.stderr?.toString() || error.stdout?.toString() || error.message;
      return { success: false, error: errorMsg };
    }
  }

  async stopServices(worktreeName) {
    const worktrees = this.listWorktrees();
    const worktree = worktrees.find(w => w.name === worktreeName);

    if (!worktree) {
      return { success: false, error: 'Worktree not found' };
    }

    try {
      // Stop Docker services
      runtime.execCompose('down', {
        cwd: worktree.path,
        stdio: 'pipe'
      });

      this.broadcast('services:stopped', { worktree: worktreeName });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check for updates from main branch (Phase 2.9)
   */
  async checkUpdates(worktreeName, worktreePath) {
    const syncManager = new GitSyncManager(worktreePath);
    const updateInfo = await syncManager.fetchUpstream();

    this.broadcast('updates:checked', {
      worktree: worktreeName,
      ...updateInfo
    });

    return updateInfo;
  }

  /**
   * Sync worktree with main branch (Phase 2.9 + 5.2)
   */
  async syncWorktree(worktreeName, worktreePath, options = {}) {
    const syncManager = new GitSyncManager(worktreePath);
    const result = await syncManager.syncWithMain(options.strategy, options);

    // If sync succeeded and smartReload is enabled, perform smart reload
    if (result.success && options.smartReload) {
      // Get commits that were merged
      const commits = result.output?.match(/[0-9a-f]{7,40}/g) || [];

      // Analyze changes
      const analysis = await syncManager.analyzeChanges(commits);

      // Perform smart reload
      const reloadManager = new SmartReloadManager(worktreePath, runtime);
      const reloadResult = await reloadManager.performSmartReload(analysis, options);

      // Notify agent
      await reloadManager.notifyAgent(analysis, this.ptyManager, worktreeName);

      result.smartReload = reloadResult;
    }

    this.broadcast('worktree:synced', {
      worktree: worktreeName,
      ...result
    });

    return result;
  }

  /**
   * Analyze changes from commits (Phase 5.1)
   */
  async analyzeChanges(worktreeName, worktreePath, commits) {
    const syncManager = new GitSyncManager(worktreePath);
    const analysis = await syncManager.analyzeChanges(commits);

    return {
      success: true,
      worktree: worktreeName,
      ...analysis
    };
  }

  /**
   * Rollback worktree to previous commit (Phase 2.9)
   */
  async rollbackWorktree(worktreeName, worktreePath, commitSha) {
    const syncManager = new GitSyncManager(worktreePath);
    const result = await syncManager.rollback(commitSha);

    this.broadcast('worktree:rolled-back', {
      worktree: worktreeName,
      ...result
    });

    return result;
  }

  /**
   * Perform smart reload (Phase 5.2)
   */
  async performSmartReload(worktreeName, worktreePath, commits, options = {}) {
    const syncManager = new GitSyncManager(worktreePath);
    const analysis = await syncManager.analyzeChanges(commits);

    const reloadManager = new SmartReloadManager(worktreePath, runtime);
    const result = await reloadManager.performSmartReload(analysis, options);

    // Notify agent
    await reloadManager.notifyAgent(analysis, this.ptyManager, worktreeName);

    this.broadcast('worktree:smart-reload', {
      worktree: worktreeName,
      ...result
    });

    return {
      success: result.success,
      analysis,
      reload: result
    };
  }

  /**
   * Get all conflicts (Phase 5.3)
   */
  async getConflicts(worktreeName, worktreePath) {
    const resolver = new AIConflictResolver(worktreePath);
    const conflicts = resolver.getConflicts();

    return {
      success: true,
      worktree: worktreeName,
      count: conflicts.length,
      conflicts
    };
  }

  /**
   * Analyze conflicts with AI suggestions (Phase 5.3)
   */
  async analyzeConflicts(worktreeName, worktreePath) {
    const resolver = new AIConflictResolver(worktreePath);
    const analysis = await resolver.analyzeConflicts();

    return {
      success: true,
      worktree: worktreeName,
      ...analysis
    };
  }

  /**
   * Resolve a specific conflict (Phase 5.3)
   */
  async resolveConflict(worktreeName, worktreePath, file, strategy) {
    const resolver = new AIConflictResolver(worktreePath);
    const result = await resolver.autoResolve(file, strategy);

    this.broadcast('conflict:resolved', {
      worktree: worktreeName,
      file,
      ...result
    });

    return result;
  }

  /**
   * Request AI assistance for conflict (Phase 5.3)
   */
  async requestAIAssistance(worktreeName, worktreePath, file) {
    const resolver = new AIConflictResolver(worktreePath);
    const conflicts = resolver.getConflicts();
    const conflict = conflicts.find(c => c.file === file);

    if (!conflict) {
      return {
        success: false,
        message: 'Conflict not found for file: ' + file
      };
    }

    const result = await resolver.requestAIAssistance(
      conflict,
      this.ptyManager,
      worktreeName
    );

    return result;
  }

  /**
   * Discover unmanaged worktrees (Phase 2.5)
   */
  discoverUnmanagedWorktrees() {
    return this.importer.discoverUnmanaged();
  }

  /**
   * Import an existing worktree (Phase 2.5)
   */
  async importWorktree(worktreeName) {
    return await this.importer.importWorktree(worktreeName);
  }

  /**
   * Run diagnostic checks (Phase 2.5)
   */
  async runDiagnostics(worktreeName = null) {
    return await this.diagnostics.runAll(worktreeName);
  }

  /**
   * Auto-fix an issue (Phase 2.5)
   */
  async autoFixIssue(fixType, context = {}) {
    return await this.diagnostics.autoFix(fixType, context);
  }
}

/**
 * Format log line by adding color and structure
 */
function formatLogLine(line, serviceName) {
  // Remove docker-compose prefix (e.g., "api-1  | ")
  const cleanLine = line.replace(/^[\w-]+-\d+\s+\|\s+/, '');

  // Parse timestamp if present
  const timestampMatch = cleanLine.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const message = cleanLine.substring(timestamp.length).trim();

    // Color code based on log level
    let color = '37'; // default white
    if (message.match(/\b(ERROR|FATAL|CRITICAL)\b/i)) {
      color = '31'; // red
    } else if (message.match(/\b(WARN|WARNING)\b/i)) {
      color = '33'; // yellow
    } else if (message.match(/\b(INFO)\b/i)) {
      color = '36'; // cyan
    } else if (message.match(/\b(DEBUG|TRACE)\b/i)) {
      color = '90'; // gray
    }

    return `\x1b[90m${timestamp}\x1b[0m \x1b[${color}m${message}\x1b[0m`;
  }

  return cleanLine;
}

/**
 * Handle logs WebSocket connection
 */
function handleLogsConnection(ws, worktreeName, serviceName, manager) {
  console.log(`\x1b[36mLogs connection opened for ${worktreeName}/${serviceName}\x1b[0m`);

  // Find worktree
  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  // Spawn docker compose logs with --no-log-prefix for cleaner output
  const composeCmd = runtime.getComposeCommand().split(' ');
  const args = [...composeCmd.slice(1), 'logs', '-f', '--tail=100', '--no-log-prefix', serviceName];
  const cmd = runtime.needsElevation() ? 'sudo' : composeCmd[0];
  const fullArgs = runtime.needsElevation() ? [composeCmd[0], ...args] : args;

  const logsProcess = spawn(cmd, fullArgs, {
    cwd: worktree.path,
    env: process.env
  });

  let buffer = '';

  // Forward logs to WebSocket with formatting
  logsProcess.stdout.on('data', (data) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          ws.send(formatLogLine(line, serviceName) + '\r\n');
        }
      }
    }
  });

  logsProcess.stderr.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
    }
  });

  logsProcess.on('error', (error) => {
    console.error(`\x1b[31mLogs process error for ${serviceName}: ${error.message}\x1b[0m`);
    if (ws.readyState === 1) {
      ws.send(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    console.log(`\x1b[90mLogs connection closed for ${worktreeName}/${serviceName}\x1b[0m`);
    logsProcess.kill();
  });

  // Send initial message
  ws.send(`\x1b[1;36m╔═══ Logs for ${serviceName} (${worktreeName}) ═══╗\x1b[0m\r\n\r\n`);
}

/**
 * Handle combined logs WebSocket connection (all services)
 */
function handleCombinedLogsConnection(ws, worktreeName, manager) {
  console.log(`\x1b[36mCombined logs connection opened for ${worktreeName}\x1b[0m`);

  // Find worktree
  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  // Spawn docker compose logs for all services
  const composeCmd = runtime.getComposeCommand().split(' ');
  const args = [...composeCmd.slice(1), 'logs', '-f', '--tail=100'];
  const cmd = runtime.needsElevation() ? 'sudo' : composeCmd[0];
  const fullArgs = runtime.needsElevation() ? [composeCmd[0], ...args] : args;

  const logsProcess = spawn(cmd, fullArgs, {
    cwd: worktree.path,
    env: process.env
  });

  let buffer = '';

  // Forward logs to WebSocket
  logsProcess.stdout.on('data', (data) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          // For combined logs, don't strip service prefix - it's useful to see which service
          ws.send(line + '\r\n');
        }
      }
    }
  });

  logsProcess.stderr.on('data', (data) => {
    if (ws.readyState === 1) {
      ws.send(`\x1b[31m${data.toString()}\x1b[0m`);
    }
  });

  logsProcess.on('error', (error) => {
    console.error(`\x1b[31mCombined logs process error: ${error.message}\x1b[0m`);
    if (ws.readyState === 1) {
      ws.send(`\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    console.log(`\x1b[90mCombined logs connection closed for ${worktreeName}\x1b[0m`);
    logsProcess.kill();
  });

  // Send initial message
  ws.send(`\x1b[1;36m╔═══ Combined Logs for All Services (${worktreeName}) ═══╗\x1b[0m\r\n\r\n`);
}

/**
 * Handle terminal WebSocket connection
 */
function handleTerminalConnection(ws, worktreeName, command, manager) {
  console.log(`Terminal connection opened for worktree: ${worktreeName} (${command})`);

  // Find worktree
  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === worktreeName);

  if (!worktree) {
    ws.send('\r\n\x1b[31mError: Worktree not found\x1b[0m\r\n');
    ws.close();
    return;
  }

  // Create or retrieve session ID based on worktree:command key
  const sessionKey = `${worktreeName}:${command}`;
  let sessionId;
  let session;

  // Try to find existing session
  for (const [sid, sess] of manager.ptyManager._sessions) {
    if (sess.worktreeName === worktreeName && sess.agent === command) {
      sessionId = sid;
      session = sess;
      break;
    }
  }

  // Create new session if not found
  if (!sessionId) {
    sessionId = manager.ptyManager.createSession(worktreeName, command, worktree.path);
    session = manager.ptyManager.getSession(sessionId);
  }

  // Generate unique client ID for this WebSocket connection
  const clientId = `${sessionId}-${Date.now()}`;

  // Attach client to session
  manager.ptyManager.attachClient(sessionId, clientId);

  // Spawn PTY if not already spawned
  let terminal;
  if (!session.pty) {
    // Determine command and args based on agent type
    let commandStr, args;
    if (command === 'shell') {
      console.log(`Spawning shell for ${worktreeName}...`);
      commandStr = process.env.SHELL || '/bin/bash';
      args = [];
    } else if (command === 'codex') {
      console.log(`Spawning codex for ${worktreeName}...`);
      commandStr = 'npx';
      args = ['-y', '@openai/codex@latest', '--dangerously-bypass-approvals-and-sandbox'];
    } else {
      console.log(`Spawning Claude Code for ${worktreeName}...`);
      // Clear npx cache for @anthropic-ai/claude-code to ensure latest version
      try {
        execSync('npm cache clean --force', { stdio: 'pipe' });
        console.log(`✓ Cache cleared for Claude Code`);
      } catch (error) {
        console.error('Failed to clear cache:', error.message);
      }
      commandStr = 'npx';
      args = ['-y', '@anthropic-ai/claude-code@latest', '--dangerously-skip-permissions'];
    }

    terminal = manager.ptyManager.spawnPTY(sessionId, {
      command: commandStr,
      args,
      cols: 120,
      rows: 30
    });

    console.log(`✓ PTY spawned for ${worktreeName} (session: ${sessionId})`);
  } else {
    terminal = session.pty;
    console.log(`✓ Reusing existing PTY for ${worktreeName} (session: ${sessionId})`);
  }

  // Forward PTY output to WebSocket
  const onData = (data) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  };
  terminal.onData(onData);

  // Handle WebSocket messages (both terminal input and control messages)
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Only treat as control message if it's an object with a type field
      if (typeof msg === 'object' && msg !== null && msg.type === 'resize' && msg.cols && msg.rows) {
        terminal.resize(msg.cols, msg.rows);
        console.log(`Resized PTY for ${worktreeName} to ${msg.cols}x${msg.rows}`);
      } else {
        // Valid JSON but not a control message (e.g., single digits "1", "2")
        // Treat as terminal input
        terminal.write(data.toString());
      }
    } catch (e) {
      // Not JSON, treat as terminal input
      terminal.write(data.toString());
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    console.log(`Terminal connection closed for worktree: ${worktreeName} (session: ${sessionId})`);
    terminal.removeListener('data', onData);
    // Detach client but keep session alive for reconnection
    manager.ptyManager.detachClient(sessionId);
  });

  // Send initial connection message with session ID
  const sessionName = command === 'codex' ? 'Codex' : command === 'shell' ? 'Shell' : 'Claude Code';
  ws.send(`\r\n\x1b[32mConnected to ${sessionName} session (ID: ${sessionId.slice(0, 8)})\x1b[0m\r\n`);
}

/**
 * Setup Express app
 */
function createApp() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const manager = new WorktreeManager();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  // Multer configuration for file uploads
  const upload = multer({ dest: join(homedir(), '.vibetrees', 'uploads') });

  // WebSocket for UI updates
  wss.on('connection', (ws, req) => {
    // Check if this is a terminal connection
    // Format: /terminal/{worktreeName}?command={claude|codex}
    const terminalMatch = req.url.match(/^\/terminal\/([^?]+)(\?(.+))?$/);
    if (terminalMatch) {
      const worktreeName = decodeURIComponent(terminalMatch[1]);
      const queryString = terminalMatch[3] || '';
      const params = new URLSearchParams(queryString);
      const command = params.get('command') || 'claude';

      handleTerminalConnection(ws, worktreeName, command, manager);
      return;
    }

    // Check if this is a combined logs connection (all services)
    // Format: /logs/{worktreeName}
    const combinedLogsMatch = req.url.match(/^\/logs\/([^/]+)$/);
    if (combinedLogsMatch) {
      const worktreeName = decodeURIComponent(combinedLogsMatch[1]);

      handleCombinedLogsConnection(ws, worktreeName, manager);
      return;
    }

    // Check if this is a single service logs connection
    // Format: /logs/{worktreeName}/{service}
    const logsMatch = req.url.match(/^\/logs\/([^/]+)\/([^/]+)$/);
    if (logsMatch) {
      const worktreeName = decodeURIComponent(logsMatch[1]);
      const serviceName = decodeURIComponent(logsMatch[2]);

      handleLogsConnection(ws, worktreeName, serviceName, manager);
      return;
    }

    // Regular UI WebSocket
    manager.clients.add(ws);
    ws.on('close', () => manager.clients.delete(ws));
  });

  // API Routes
  app.get('/api/worktrees', (req, res) => {
    res.json(manager.listWorktrees());
  });

  app.post('/api/worktrees', async (req, res) => {
    const { branchName, fromBranch } = req.body;
    const result = await manager.createWorktree(branchName, fromBranch || 'main');
    res.json(result);
  });

  app.delete('/api/worktrees/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const { deleteBranch, deleteLocal, deleteRemote, force } = req.body || {};

      // Get worktree info before deletion
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      // Delete worktree (existing logic)
      const result = await manager.deleteWorktree(name);

      // Optionally delete branch
      let branchDeletion = null;
      if (deleteBranch && worktree.branch) {
        const branchManager = new BranchCleanupManager(process.cwd());
        branchDeletion = await branchManager.deleteBranch(worktree.branch, {
          deleteLocal: deleteLocal !== false, // Default true
          deleteRemote: deleteRemote !== false, // Default true
          force: force || false
        });
      }

      res.json({
        ...result,
        branchDeletion
      });
    } catch (error) {
      console.error('Failed to delete worktree:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get branch status before deletion (Phase 2.8)
  app.get('/api/worktrees/:name/branch-status', async (req, res) => {
    try {
      const { name } = req.params;
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      if (!worktree.branch) {
        return res.status(400).json({ error: 'Worktree has no associated branch' });
      }

      const branchManager = new BranchCleanupManager(process.cwd());
      const status = await branchManager.getBranchStatus(worktree.branch);

      res.json(status);
    } catch (error) {
      console.error('Failed to get branch status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List all available branches (Phase 2.7)
  app.get('/api/branches', async (req, res) => {
    try {
      const branchManager = new BranchManager(process.cwd());
      const branches = await branchManager.listAvailableBranches();
      res.json(branches);
    } catch (error) {
      console.error('Failed to list branches:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/worktrees/:name/close-info', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.json({ success: false, error: 'Worktree not found' });
    }

    try {
      // Check PR merge status
      const mergeStatus = await manager.checkPRMergeStatus(
        req.params.name,
        worktree.path
      );

      // Get database stats
      const dbStats = await manager.getWorktreeDatabaseStats(worktree.path);

      // Check if main is clean
      const mainStatus = await manager.checkMainWorktreeClean();

      res.json({
        success: true,
        worktree: req.params.name,
        branch: mergeStatus.branch || 'unknown',
        isMerged: mergeStatus.isMerged || false,
        mergeMessage: mergeStatus.message || mergeStatus.error || 'Unknown status',
        mainIsClean: mainStatus.clean || false,
        mainStatus: mainStatus.status || mainStatus.error || 'Unknown',
        databaseTables: dbStats.tables || []
      });
    } catch (error) {
      console.error('Error getting close info:', error);
      res.json({
        success: false,
        error: error.message
      });
    }
  });

  // Git Sync API Routes (Phase 2.9 + Phase 5)
  app.get('/api/worktrees/:name/check-updates', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const result = await manager.checkUpdates(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error checking updates:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/sync', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { strategy = 'merge', force = false } = req.body;
      const result = await manager.syncWorktree(
        req.params.name,
        worktree.path,
        { strategy, force }
      );
      res.json(result);
    } catch (error) {
      console.error('Error syncing worktree:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/worktrees/:name/analyze-changes', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { commits } = req.query;
      const commitList = commits ? commits.split(',') : [];

      const result = await manager.analyzeChanges(
        req.params.name,
        worktree.path,
        commitList
      );
      res.json(result);
    } catch (error) {
      console.error('Error analyzing changes:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/rollback', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { commitSha } = req.body;
      if (!commitSha) {
        return res.status(400).json({
          success: false,
          error: 'commitSha is required'
        });
      }

      const result = await manager.rollbackWorktree(
        req.params.name,
        worktree.path,
        commitSha
      );
      res.json(result);
    } catch (error) {
      console.error('Error rolling back worktree:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/smart-reload', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { commits, options = {} } = req.body;
      if (!commits || !Array.isArray(commits)) {
        return res.status(400).json({
          success: false,
          error: 'commits array is required'
        });
      }

      const result = await manager.performSmartReload(
        req.params.name,
        worktree.path,
        commits,
        options
      );
      res.json(result);
    } catch (error) {
      console.error('Error performing smart reload:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Conflict Resolution API Routes (Phase 5.3)
  app.get('/api/worktrees/:name/conflicts', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const result = await manager.getConflicts(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error getting conflicts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/worktrees/:name/conflicts/analyze', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const result = await manager.analyzeConflicts(req.params.name, worktree.path);
      res.json(result);
    } catch (error) {
      console.error('Error analyzing conflicts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/conflicts/resolve', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { file, strategy = 'auto' } = req.body;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'file is required'
        });
      }

      const result = await manager.resolveConflict(
        req.params.name,
        worktree.path,
        file,
        strategy
      );
      res.json(result);
    } catch (error) {
      console.error('Error resolving conflict:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/worktrees/:name/conflicts/ai-assist', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { file } = req.body;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'file is required'
        });
      }

      const result = await manager.requestAIAssistance(
        req.params.name,
        worktree.path,
        file
      );
      res.json(result);
    } catch (error) {
      console.error('Error requesting AI assistance:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Disk space check endpoint
  app.get('/api/disk-space', async (req, res) => {
    const { path: checkPath, requiredBytes } = req.query;

    if (!checkPath || !requiredBytes) {
      return res.status(400).json({
        success: false,
        error: 'path and requiredBytes query parameters are required'
      });
    }

    try {
      const { SafetyChecks } = await import('../safety-checks.mjs');
      const result = await SafetyChecks.checkDiskSpace(
        checkPath,
        parseInt(requiredBytes, 10)
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error checking disk space:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database dry-run export endpoint
  app.post('/api/worktrees/:name/database/dry-run-export', async (req, res) => {
    const { name } = req.params;
    const { type = 'full' } = req.body;

    try {
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const tempOutputPath = `/tmp/vibe-export-${name}-${Date.now()}.sql`;

      let result;
      if (type === 'schema') {
        result = await dbManager.exportSchema(tempOutputPath, { dryRun: true });
      } else if (type === 'data') {
        result = await dbManager.exportData(tempOutputPath, { dryRun: true });
      } else {
        result = await dbManager.exportFull(tempOutputPath, { dryRun: true });
      }

      res.json(result);
    } catch (error) {
      console.error('Error performing dry-run export:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database dry-run import endpoint
  app.post('/api/worktrees/:name/database/dry-run-import', upload.single('file'), async (req, res) => {
    const { name } = req.params;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const result = await dbManager.importWithTransaction(req.file.path, { dryRun: true });

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      res.json(result);
    } catch (error) {
      console.error('Error performing dry-run import:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Database export endpoint
  app.post('/api/worktrees/:name/database/export', async (req, res) => {
    const { name } = req.params;
    const { type = 'full', format = 'sql' } = req.body;

    try {
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const dbManager = new DatabaseManager(dbConfig);
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `${name}-${type}-${timestamp}.sql`;
      const outputPath = join(homedir(), '.vibetrees', 'exports', filename);

      // Ensure export directory exists
      const exportDir = dirname(outputPath);
      if (!existsSync(exportDir)) {
        mkdirSync(exportDir, { recursive: true });
      }

      let result;
      if (type === 'schema') {
        result = await dbManager.exportSchema(outputPath);
      } else if (type === 'data') {
        result = await dbManager.exportData(outputPath);
      } else {
        result = await dbManager.exportFull(outputPath);
      }

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.download(outputPath, filename, (err) => {
        // Clean up temp file after download
        if (existsSync(outputPath)) {
          try {
            execSync(`rm -f "${outputPath}"`);
          } catch (cleanupError) {
            console.error('Error cleaning up export file:', cleanupError);
          }
        }
      });
    } catch (error) {
      console.error('Database export error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Database import endpoint
  app.post('/api/worktrees/:name/database/import', upload.single('file'), async (req, res) => {
    const { name } = req.params;
    const { validate = 'true', mode = 'replace' } = req.body;

    try {
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      // Validate schema compatibility if requested
      if (validate === 'true') {
        const validator = new DatabaseValidator(dbConfig);
        // TODO: Parse SQL file to extract schema
        // const importSchema = parseSQLSchema(req.file.path);
        // const validation = await validator.validateCompatibility(importSchema);
        // if (!validation.compatible) {
        //   return res.status(400).json({ error: 'Incompatible schema', issues: validation.issues });
        // }
      }

      const dbManager = new DatabaseManager(dbConfig);
      const result = await dbManager.importWithTransaction(req.file.path);

      // Clean up uploaded file
      if (existsSync(req.file.path)) {
        try {
          execSync(`rm -f "${req.file.path}"`);
        } catch (cleanupError) {
          console.error('Error cleaning up upload file:', cleanupError);
        }
      }

      if (!result.success) {
        return res.status(500).json({
          error: result.error,
          rollback: result.rollback
        });
      }

      res.json({ success: true, message: 'Import complete' });
    } catch (error) {
      console.error('Database import error:', error);
      // Clean up uploaded file on error
      if (req.file && existsSync(req.file.path)) {
        try {
          execSync(`rm -f "${req.file.path}"`);
        } catch (cleanupError) {
          console.error('Error cleaning up upload file:', cleanupError);
        }
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Database schema endpoint
  app.get('/api/worktrees/:name/database/schema', async (req, res) => {
    const { name } = req.params;

    try {
      const worktrees = manager.listWorktrees();
      const worktree = worktrees.find(w => w.name === name);

      if (!worktree) {
        return res.status(404).json({ error: 'Worktree not found' });
      }

      const ports = manager.portRegistry.getWorktreePorts(name);
      const dbPort = manager._findDatabasePort(ports);

      if (!dbPort) {
        return res.status(400).json({ error: 'No database service found for this worktree' });
      }

      const dbConfig = {
        host: 'localhost',
        port: dbPort,
        database: 'vibe',
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      };

      const validator = new DatabaseValidator(dbConfig);
      const tables = await validator.getTables();

      const schema = {};
      for (const table of tables) {
        schema[table] = await validator.getTableSchema(table);
      }

      res.json({ tables, schema });
    } catch (error) {
      console.error('Database schema error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/worktrees/:name/services/start', async (req, res) => {
    const result = await manager.startServices(req.params.name);
    res.json(result);
  });

  app.post('/api/worktrees/:name/services/stop', async (req, res) => {
    const result = await manager.stopServices(req.params.name);
    res.json(result);
  });

  app.post('/api/worktrees/:name/services/restart', async (req, res) => {
    const stopResult = await manager.stopServices(req.params.name);
    if (!stopResult.success) {
      res.json(stopResult);
      return;
    }
    const startResult = await manager.startServices(req.params.name);
    res.json(startResult);
  });

  app.post('/api/worktrees/:name/services/:service/restart', async (req, res) => {
    const { name, service } = req.params;
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === name);

    if (!worktree) {
      res.json({ success: false, error: 'Worktree not found' });
      return;
    }

    try {
      console.log(`Restarting service ${service} in worktree ${name}...`);

      // All services managed by docker compose
      runtime.execCompose(`restart ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      res.json({ success: true });
    } catch (error) {
      console.error(`Failed to restart service ${service}:`, error.message);
      res.json({ success: false, error: error.message });
    }
  });

  app.post('/api/worktrees/:name/services/:service/rebuild', async (req, res) => {
    const { name, service } = req.params;
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === name);

    if (!worktree) {
      res.json({ success: false, error: 'Worktree not found' });
      return;
    }

    try {
      console.log(`Rebuilding service ${service} in worktree ${name}...`);

      // All services managed by docker compose
      // Stop the service
      runtime.execCompose(`stop ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      // Rebuild and start
      runtime.execCompose(`up -d --build ${service}`, {
        cwd: worktree.path,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      res.json({ success: true });
    } catch (error) {
      console.error(`Failed to rebuild service ${service}:`, error.message);
      res.json({ success: false, error: error.message });
    }
  });

  // Kill Terminal API Route
  app.post('/api/kill-terminal', async (req, res) => {
    const { worktreeName, command } = req.body;

    if (!worktreeName || !command) {
      res.json({ success: false, error: 'worktreeName and command are required' });
      return;
    }

    try {
      // Find session matching worktreeName and command
      let sessionId = null;
      for (const [sid, session] of manager.ptyManager._sessions) {
        if (session.worktreeName === worktreeName && session.agent === command) {
          sessionId = sid;
          break;
        }
      }

      if (!sessionId) {
        res.json({ success: false, error: 'Terminal not found' });
        return;
      }

      // Destroy the session
      manager.ptyManager.destroySession(sessionId);
      console.log(`Successfully killed terminal session: ${sessionId} (${worktreeName}:${command})`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error killing terminal:', error.message);
      res.json({ success: false, error: error.message });
    }
  });

  // Agent API Routes
  app.get('/api/agents', async (req, res) => {
    try {
      const agents = await agentRegistry.getAll();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/agents/:name', async (req, res) => {
    try {
      const { name } = req.params;

      if (!agentRegistry.has(name)) {
        res.status(404).json({ error: `Agent not found: ${name}` });
        return;
      }

      const metadata = await agentRegistry.getMetadata(name);
      res.json(metadata);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/agents/availability', async (req, res) => {
    try {
      const availability = await agentRegistry.checkAvailability();
      res.json(availability);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Worktree discovery and import endpoints
  app.get('/api/worktrees/discover', async (req, res) => {
    try {
      const unmanaged = manager.discoverUnmanagedWorktrees();
      res.json(unmanaged);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/worktrees/import', async (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Worktree name required' });
      }

      const result = await manager.importWorktree(name);
      res.json(result);

      // Broadcast update to all clients
      manager.broadcast('worktree:imported', result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Diagnostic endpoints
  app.get('/api/diagnostics', async (req, res) => {
    try {
      const report = await manager.runDiagnostics();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/diagnostics/:worktreeName', async (req, res) => {
    try {
      const { worktreeName } = req.params;
      const report = await manager.runDiagnostics(worktreeName);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/diagnostics/fix/:fixType', async (req, res) => {
    try {
      const { fixType } = req.params;
      const context = req.body || {};

      const result = await manager.autoFixIssue(fixType, context);
      res.json(result);

      // Broadcast update to all clients if fix was successful
      if (result.success) {
        manager.broadcast('diagnostics:fixed', { fixType, result });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Performance metrics endpoint
  app.get('/api/performance/metrics', (req, res) => {
    try {
      const report = manager.profiler.generateReport();

      res.json({
        operations: report.operations,
        totalTime: report.totalDuration,
        avgWorktreeCreation: report.operations.find(op => op.name === 'create-worktree-total')?.avg || null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return { server, manager };
}

/**
 * Check all worktrees and create missing GitHub branches on startup
 */
async function syncGitHubBranches(manager) {
  console.log('🔍 Checking for missing GitHub branches...\n');

  const worktrees = manager.listWorktrees();
  let pushedCount = 0;

  for (const worktree of worktrees) {
    // Skip main branch (always exists remotely)
    if (worktree.branch === 'main') {
      continue;
    }

    try {
      // Check if remote branch exists
      const remoteBranches = execSync('git branch -r', {
        cwd: worktree.path,
        encoding: 'utf-8'
      });

      const remoteBranchExists = remoteBranches.includes(`origin/${worktree.branch}`);

      if (!remoteBranchExists) {
        console.log(`📤 ${worktree.name}: Pushing missing branch to GitHub...`);

        // Push branch to GitHub
        execSync(`git push -u origin "${worktree.branch}"`, {
          cwd: worktree.path,
          stdio: 'pipe'
        });

        console.log(`✓ ${worktree.name}: Branch pushed to GitHub`);
        pushedCount++;
      } else {
        console.log(`✓ ${worktree.name}: Branch exists on GitHub`);
      }
    } catch (error) {
      console.warn(`⚠ ${worktree.name}: Failed to push branch: ${error.message}`);
      // Continue with other worktrees even if one fails
    }
  }

  if (pushedCount > 0) {
    console.log(`\n✓ Pushed ${pushedCount} missing branch(es) to GitHub\n`);
  } else {
    console.log('\n✓ All branches synced with GitHub\n');
  }
}

/**
 * Auto-start containers for all worktrees on server startup
 */
async function autoStartContainers(manager) {
  const worktrees = manager.listWorktrees();

  for (const worktree of worktrees) {
    const servicesRunning = worktree.dockerStatus.filter(s => s.state === 'running').length;
    const servicesTotal = worktree.dockerStatus.length;

    // Skip if all services are running
    if (servicesRunning === servicesTotal && servicesTotal > 0) {
      console.log(`✓ ${worktree.name}: All services already running (${servicesRunning}/${servicesTotal})`);
      continue;
    }

    // Skip if no services have been configured (no ports allocated)
    if (Object.keys(worktree.ports).length === 0) {
      console.log(`⊘ ${worktree.name}: No services configured (skipping)`);
      continue;
    }

    // Try to start services
    console.log(`🔄 ${worktree.name}: Starting services (${servicesRunning}/${servicesTotal} running)...`);

    try {
      const result = await manager.startServices(worktree.name);

      if (result.success) {
        console.log(`✓ ${worktree.name}: Services started successfully`);
      } else {
        console.error(`✗ ${worktree.name}: Failed to start services`);
        console.error(`  Reason: ${result.error}`);

        // Provide diagnostics based on error message
        if (result.error.includes('has neither an image nor a build context')) {
          console.error(`  💡 Diagnosis: Invalid docker-compose.override.yml detected`);
          console.error(`     This is likely a leftover from the old service selection system`);
          console.error(`     Deleting: ${worktree.path}/docker-compose.override.yml`);

          // Try to delete the override file and retry
          try {
            const overridePath = join(worktree.path, 'docker-compose.override.yml');
            if (existsSync(overridePath)) {
              execSync(`rm "${overridePath}"`, { stdio: 'pipe' });
              console.error(`     ✓ Deleted override file, retrying...`);

              // Retry starting services
              const retryResult = await manager.startServices(worktree.name);
              if (retryResult.success) {
                console.log(`✓ ${worktree.name}: Services started successfully after cleanup`);
              } else {
                console.error(`✗ ${worktree.name}: Still failed after cleanup: ${retryResult.error}`);
              }
            }
          } catch (cleanupError) {
            console.error(`     ✗ Failed to delete override file: ${cleanupError.message}`);
          }
        } else if (result.error.includes('address already in use')) {
          console.error(`  💡 Diagnosis: Port conflict detected`);
          console.error(`     Another service is using one of the allocated ports`);
          console.error(`     Ports: ${JSON.stringify(worktree.ports)}`);
        } else if (result.error.includes('Cannot connect to the Docker daemon')) {
          console.error(`  💡 Diagnosis: Docker daemon not running`);
          console.error(`     Run: sudo systemctl start docker (Linux)`);
          console.error(`     Or start Docker Desktop (Mac/Windows)`);
        } else if (result.error.includes('permission denied')) {
          console.error(`  💡 Diagnosis: Permission issue`);
          console.error(`     Ensure your user is in the docker group`);
          console.error(`     Or use sudo to run this script`);
        } else if (result.error.includes('network') || result.error.includes('driver')) {
          console.error(`  💡 Diagnosis: Docker network issue`);
          console.error(`     Try: sudo docker network prune`);
        } else if (result.error.includes('volume')) {
          console.error(`  💡 Diagnosis: Docker volume issue`);
          console.error(`     The database volume may be corrupted or missing`);
          console.error(`     Volume name should be: ${worktree.name}_postgres_data`);
        } else {
          console.error(`  💡 Check docker-compose.yml in: ${worktree.path}`);
        }
        console.error('');
      }
    } catch (error) {
      console.error(`✗ ${worktree.name}: Exception occurred`);
      console.error(`  Error: ${error.message}`);
      console.error('');
    }
  }

  console.log(''); // Extra newline for readability
}

/**
 * Start server
 */
async function startServer() {
  try {
    // Find an available port
    console.log(`🔍 Finding available port...`);
    const PORT = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_END, HOST);
    console.log(`✓ Port ${PORT} is available\n`);

    const { server, manager } = createApp();

    server.on('error', (error) => {
      console.error('\n❌ Server error:', error.message);
      process.exit(1);
    });

    server.listen(PORT, HOST, async () => {
      const address = HOST === '0.0.0.0' ? `http://<your-ip>:${PORT}` : `http://localhost:${PORT}`;

      // Check for first run
      const wizard = new FirstRunWizard();
      if (wizard.isFirstRun()) {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 Welcome to VibeTrees!');
        console.log('='.repeat(60));
        console.log('\nThis appears to be your first time running VibeTrees.');
        console.log('\nDefault configuration:');
        console.log('  • Repository root: Current directory');
        console.log('  • AI agent: Claude Code');
        console.log('  • Container runtime: Docker');
        console.log('  • Network interface: localhost only\n');
        console.log('You can change these settings later in ~/.vibetrees/config.json');
        console.log('='.repeat(60) + '\n');

        // Save default config
        const defaultConfig = {
          repositoryRoot: process.cwd(),
          aiAgent: 'claude',
          containerRuntime: 'docker',
          defaultNetworkInterface: 'localhost',
          initialized: true
        };
        wizard.saveConfig(defaultConfig);
      }

      console.log(`\n🚀 Worktree Manager running at ${address}`);
      if (HOST === '0.0.0.0') {
        console.log(`   Listening on all network interfaces (--listen mode)`);
      } else {
        console.log(`   Listening on localhost only (use --listen to allow network access)`);
      }
      console.log('\nOpen this URL in your browser to manage worktrees\n');

      // Sync GitHub branches for all worktrees
      await syncGitHubBranches(manager);

      // Auto-start containers for all worktrees
      console.log('🔍 Checking for stopped containers...\n');
      await autoStartContainers(manager);

      // Auto-open browser
      const url = `http://localhost:${PORT}`;
      const start = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';

      try {
        execSync(`${start} ${url}`, { stdio: 'ignore' });
      } catch (err) {
        console.log('Could not auto-open browser. Please visit the URL manually.');
      }
    });
  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start
startServer();
