/**
 * WorktreeManager - Manages git worktrees, Docker containers, and services
 *
 * Extracted from server.mjs for better modularity and maintainability.
 * This class handles the full lifecycle of worktrees: creation, deletion,
 * service management, git operations, and database management.
 */

import { execSync, spawn } from 'child_process';
import { Worker } from 'worker_threads';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

// Get __dirname equivalent in ESM
const __dirname = dirname(fileURLToPath(import.meta.url));

export class WorktreeManager {
  /**
   * @param {Object} deps - Dependencies
   * @param {string} deps.rootDir - Project root directory
   * @param {Object} deps.config - ConfigManager instance
   * @param {Object} deps.runtime - ContainerRuntime instance
   * @param {Object} deps.mcpManager - McpManager instance
   * @param {string} deps.worktreeBase - Base directory for worktrees
   * @param {Object} deps.modules - Imported module classes
   */
  constructor({ rootDir, config, runtime, mcpManager, worktreeBase, modules, projectManager = null }) {
    this.rootDir = rootDir;
    this.config = config;
    this.runtime = runtime;
    this.mcpManager = mcpManager;
    this.worktreeBase = worktreeBase;
    this.projectManager = projectManager;

    // Import required classes from modules
    const {
      PortRegistry,
      PTYSessionManager,
      Profiler,
      PerformanceOptimizer,
      CacheManager,
      WorktreeImporter,
      DiagnosticRunner,
      InitializationManager,
      ComposeInspector,
      ServiceConfig,
      GitSyncManager,
      SmartReloadManager,
      AIConflictResolver
    } = modules;

    // Store class references for later use
    this.ComposeInspector = ComposeInspector;
    this.ServiceConfig = ServiceConfig;
    this.GitSyncManager = GitSyncManager;
    this.SmartReloadManager = SmartReloadManager;
    this.AIConflictResolver = AIConflictResolver;

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
    this.initializationManager = new InitializationManager();

    // Sync port registry with existing worktrees on startup
    this._syncPortRegistry();
  }

  /**
   * Get the current project root directory
   * Returns the current project's path if projectManager is available, otherwise returns configured rootDir
   * @returns {string} Current project root path
   */
  getProjectRoot() {
    if (this.projectManager) {
      const currentProject = this.projectManager.getCurrentProject();
      if (currentProject) {
        return currentProject.path;
      }
    }
    return this.rootDir;
  }

  /**
   * Get the worktrees directory for the current project
   * @returns {string} Path to .worktrees directory
   */
  getWorktreeBase() {
    return join(this.getProjectRoot(), '.worktrees');
  }

  /**
   * Run a git command in the project's root directory
   * @private
   */
  _runGitCommand(command, options = {}) {
    return execSync(command, {
      encoding: 'utf-8',
      ...options,
      cwd: options.cwd || this.getProjectRoot()  // Always default to project root
    });
  }

  /**
   * Update the root directory for worktree operations
   * @param {string} newRootDir - New root directory path
   */
  setProjectRoot(newRootDir) {
    if (newRootDir && existsSync(newRootDir)) {
      this.rootDir = newRootDir;
      console.log(`[WorktreeManager] Project root updated to: ${newRootDir}`);
    } else {
      console.warn(`[WorktreeManager] Invalid project root: ${newRootDir}`);
    }
  }

  /**
   * Sync port registry with existing worktrees
   * This ensures the registry knows about ports used by existing worktrees
   */
  _syncPortRegistry() {
    try {
      const worktrees = this.listWorktrees();
      this.portRegistry.syncFromWorktrees(worktrees);
    } catch (error) {
      console.warn(`[WorktreeManager] Failed to sync port registry: ${error.message}`);
    }
  }

  /**
   * Dynamically discover services and allocate ports
   * @param {string} worktreeName - Name of the worktree
   * @param {string} worktreePath - Path to the worktree
   * @returns {Object} Port allocations { serviceName: port }
   */
  discoverAndAllocatePorts(worktreeName, worktreePath) {
    const composeFile = this.config.get('container.composeFile') || 'docker-compose.yml';
    // Try worktree path first (file exists after git worktree add), fallback to root
    let composeFilePath = join(worktreePath, composeFile);
    console.log(`[PORTS] Checking for compose file at: ${composeFilePath}`);
    if (!existsSync(composeFilePath)) {
      composeFilePath = join(this.rootDir, composeFile);
      console.log(`[PORTS] Not found in worktree, trying root: ${composeFilePath}`);
    }

    // Check if compose file exists
    if (!existsSync(composeFilePath)) {
      console.warn(`[PORTS] Compose file not found: ${composeFilePath}, using defaults`);
      return this._allocateDefaultPorts(worktreeName);
    }

    console.log(`[PORTS] Using compose file: ${composeFilePath}`);

    try {
      // Use ComposeInspector to discover services
      const inspector = new this.ComposeInspector(composeFilePath, this.runtime);
      const services = inspector.getServices();

      console.log(`[PORTS] Discovered ${services.length} services: ${services.map(s => s.name).join(', ')}`);

      const ports = {};

      // Allocate ports for each service that exposes ports
      for (const service of services) {
        if (service.ports.length === 0) continue;

        if (service.ports.length === 1) {
          // Single port: use service name directly
          const basePort = service.ports[0];
          const allocatedPort = this.portRegistry.allocate(worktreeName, service.name, basePort);
          ports[service.name] = allocatedPort;
          console.log(`[PORTS] Allocated ${service.name}: ${basePort} → ${allocatedPort}`);
        } else {
          // Multiple ports: use suffixes based on known port conventions
          for (let i = 0; i < service.ports.length; i++) {
            const basePort = service.ports[i];
            const suffix = this._getPortSuffix(service.name, basePort, i);
            const portKey = suffix ? `${service.name}-${suffix}` : service.name;
            const allocatedPort = this.portRegistry.allocate(worktreeName, portKey, basePort);
            ports[portKey] = allocatedPort;
            console.log(`[PORTS] Allocated ${portKey}: ${basePort} → ${allocatedPort}`);
          }
        }
      }

      console.log(`[PORTS] All ports allocated for ${worktreeName}:`, JSON.stringify(ports, null, 2));
      return ports;
    } catch (error) {
      console.warn(`[PORTS] Failed to inspect compose file: ${error.message}, using defaults`);
      return this._allocateDefaultPorts(worktreeName);
    }
  }

  /**
   * Get a descriptive suffix for additional ports in a multi-port service
   * @private
   * @param {string} serviceName - Name of the service
   * @param {number} port - The port number (not used, kept for API compatibility)
   * @param {number} index - Index in the ports array
   * @returns {string} Suffix to append to service name, or empty string for first port
   */
  _getPortSuffix(serviceName, port, index) {
    // First port doesn't need a suffix (use service name directly)
    if (index === 0) return '';

    // Known service suffix mappings based on index
    // These must match the order of ports in docker-compose.yml
    const serviceSuffixes = {
      temporal: ['', 'ui'],        // ports[0] = main, ports[1] = ui
      minio: ['', 'console'],      // ports[0] = main, ports[1] = console
    };

    if (serviceSuffixes[serviceName] && serviceSuffixes[serviceName][index]) {
      return serviceSuffixes[serviceName][index];
    }

    // Fallback: use index-based suffix for unknown ports
    return `port${index + 1}`;
  }

  /**
   * Convert service name to environment variable name
   * Handles special cases where service names don't match expected env var names
   * @private
   * @param {string} serviceName - Docker service name
   * @returns {string} Environment variable name (without _PORT suffix)
   */
  _serviceNameToEnvVar(serviceName) {
    return this.ServiceConfig.getEnvVar(serviceName).replace('_PORT', '');
  }

  /**
   * Fallback to default port allocation for standard services
   * @private
   */
  _allocateDefaultPorts(worktreeName) {
    const defaultServices = ['postgres', 'api', 'console', 'temporal', 'temporal-ui', 'minio', 'minio-console'];
    const ports = {};

    for (const serviceName of defaultServices) {
      const basePort = this.ServiceConfig.getBasePort(serviceName);
      ports[serviceName] = this.portRegistry.allocate(worktreeName, serviceName, basePort);
    }

    return ports;
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

  /**
   * List worktrees asynchronously using worker thread (non-blocking)
   * @returns {Promise<Array>} Array of worktree objects
   */
  async listWorktreesAsync() {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, '..', 'worktree-list-worker.mjs'));

      const timeout = setTimeout(() => {
        worker.terminate();
        console.warn('[listWorktreesAsync] Worker timeout - falling back to sync');
        resolve(this.listWorktrees());
      }, 5000);

      worker.on('message', (result) => {
        clearTimeout(timeout);
        worker.terminate();
        if (result.success) {
          resolve(result.worktrees);
        } else {
          console.error('[listWorktreesAsync] Worker error:', result.error);
          resolve(this.listWorktrees());
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();
        console.error('[listWorktreesAsync] Worker error:', error);
        resolve(this.listWorktrees());
      });

      // Send port registry data to worker
      // Get all worktree names from synchronous call first
      const syncWorktrees = this._runGitCommand('git worktree list --porcelain');
      const portRegistryData = {};
      const lines = syncWorktrees.split('\n');
      for (const line of lines) {
        if (line.startsWith('branch ')) {
          const branch = line.substring('branch '.length).replace('refs/heads/', '');
          portRegistryData[branch] = this.portRegistry.getWorktreePorts(branch);
        }
      }

      worker.postMessage({
        portRegistry: portRegistryData,
        rootDir: this.getProjectRoot()
      });
    });
  }

  /**
   * List worktrees synchronously (blocking - use listWorktreesAsync for API calls)
   * @returns {Array} Array of worktree objects
   */
  listWorktrees() {
    try {
      const output = this._runGitCommand('git worktree list --porcelain');
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
            // Use 'main' for root worktree or main branch, otherwise use directory name
            const isRootWorktree = !current.path.includes('.worktrees');
            current.name = (isRootWorktree || current.branch === 'main') ? 'main' : basename(current.path);
            current.ports = this.portRegistry.getWorktreePorts(current.name);
            current.dockerStatus = this.getDockerStatus(current.path, current.name);

            // Fallback: If port registry is empty, extract ports from running containers
            if (Object.keys(current.ports).length === 0 && current.dockerStatus.length > 0) {
              current.ports = this.extractPortsFromDockerStatus(current.dockerStatus);
            }

            current.gitStatus = this.getGitStatus(current.path);
            current.githubUrl = this.getGitHubUrl(current.path);
            current.commitCount = this.getCommitCount(current.path, current.branch);

            // Add status bar fields
            const aheadBehind = this.getAheadBehind(current.path, current.branch);
            current.ahead = aheadBehind.ahead;
            current.behind = aheadBehind.behind;

            const fileChanges = this.getFileChanges(current.path);
            current.modifiedFiles = fileChanges.modifiedFiles;
            current.untrackedFiles = fileChanges.untrackedFiles;

            current.lastCommit = this.getLastCommit(current.path);

            worktrees.push(current);
            current = {};
          }
        }
      }

      if (current.path) {
        // Use 'main' for root worktree or main branch, otherwise use directory name
        const isRootWorktree = !current.path.includes('.worktrees');
        current.name = (isRootWorktree || current.branch === 'main') ? 'main' : basename(current.path);
        current.ports = this.portRegistry.getWorktreePorts(current.name);
        current.dockerStatus = this.getDockerStatus(current.path, current.name);

        // Fallback: If port registry is empty, extract ports from running containers
        if (Object.keys(current.ports).length === 0 && current.dockerStatus.length > 0) {
          current.ports = this.extractPortsFromDockerStatus(current.dockerStatus);
        }

        current.gitStatus = this.getGitStatus(current.path);
        current.githubUrl = this.getGitHubUrl(current.path);
        current.commitCount = this.getCommitCount(current.path, current.branch);

        // Add status bar fields
        const aheadBehind = this.getAheadBehind(current.path, current.branch);
        current.ahead = aheadBehind.ahead;
        current.behind = aheadBehind.behind;

        const fileChanges = this.getFileChanges(current.path);
        current.modifiedFiles = fileChanges.modifiedFiles;
        current.untrackedFiles = fileChanges.untrackedFiles;

        current.lastCommit = this.getLastCommit(current.path);

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
        return count;
      }

      // For other branches, count commits that aren't in main
      // This tells us if the branch has unique work
      const output = execSync('git rev-list --count HEAD ^main', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();
      const count = parseInt(output, 10) || 0;
      return count;
    } catch (error) {
      // If the comparison fails (e.g., main doesn't exist), return 0
      return 0;
    }
  }

  getDockerStatus(worktreePath, worktreeName) {
    const statuses = [];

    // Check if docker-compose.yml exists in this worktree
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    const hasComposeFile = composeFiles.some(file =>
      fs.existsSync(path.join(worktreePath, file))
    );

    if (!hasComposeFile) {
      return statuses; // No compose file, no containers
    }

    // Get Docker container statuses using label-based filtering
    // This works even if COMPOSE_PROJECT_NAME has changed since containers were started
    try {
      // Use docker ps with label filter to find containers by working directory
      const output = this.runtime.exec(`ps -a --filter "label=com.docker.compose.project.working_dir=${worktreePath}" --format json`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const containers = output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .filter(c => c.Names); // Basic filter - check Names exists

      // Map containers to service objects with extracted service names
      const mapped = containers.map(c => {
        // Extract service name from Labels string (Docker returns labels as comma-separated string)
        let serviceName = null;

        if (c.Labels && typeof c.Labels === 'string') {
          const serviceMatch = c.Labels.match(/com\.docker\.compose\.service=([^,]+)/);
          serviceName = serviceMatch ? serviceMatch[1] : null;
        }

        // Fallback: parse from container name if label extraction failed
        if (!serviceName && c.Names) {
          const parts = c.Names.split('-');
          serviceName = parts.length > 1 ? parts.slice(0, -1).join('-') : parts[0];
        }

        // Last resort: use container ID
        if (!serviceName) {
          serviceName = c.ID ? c.ID.substring(0, 12) : 'unknown';
        }

        return {
          name: serviceName,
          state: c.State || 'unknown',
          status: c.Status || '',
          ports: c.Ports ? c.Ports.split(',').map(p => p.trim()) : [],
          createdAt: c.CreatedAt || '' // Keep creation time for deduplication
        };
      }).filter(c => !c.name.includes('init')); // Filter out init containers

      // Deduplicate by service name - prioritize running containers
      // This handles cases where COMPOSE_PROJECT_NAME changed but working_dir stayed the same
      const serviceMap = new Map();
      for (const container of mapped) {
        const existing = serviceMap.get(container.name);

        if (!existing) {
          // No existing container for this service, add it
          serviceMap.set(container.name, container);
        } else {
          // Priority: running > created/exited, then most recent createdAt
          const existingRunning = existing.state === 'running';
          const currentRunning = container.state === 'running';

          if (currentRunning && !existingRunning) {
            // Current is running, existing is not - prefer current
            serviceMap.set(container.name, container);
          } else if (currentRunning === existingRunning && container.createdAt > existing.createdAt) {
            // Same state, prefer more recent
            serviceMap.set(container.name, container);
          }
          // Otherwise keep existing
        }
      }

      // Remove createdAt from final output and push deduplicated containers
      const deduplicated = Array.from(serviceMap.values()).map(c => {
        const { createdAt, ...rest } = c;
        return rest;
      });

      statuses.push(...deduplicated);
    } catch {
      // Docker services might not be running or docker not available
    }

    return statuses;
  }

  /**
   * Extract port mappings from Docker container status
   * Used as fallback when port registry lookup fails
   * @param {Array} dockerStatus - Array of container status objects
   * @returns {Object} Port mappings keyed by service name
   */
  extractPortsFromDockerStatus(dockerStatus) {
    const ports = {};

    for (const container of dockerStatus) {
      // Only process running containers
      if (container.state !== 'running') continue;

      // Extract the first published port for each container
      if (container.ports && container.ports.length > 0) {
        const firstPort = container.ports[0];
        const match = firstPort.match(/^(\d+)→/);
        if (match) {
          const publishedPort = parseInt(match[1], 10);
          ports[container.name] = publishedPort;
        }
      }
    }

    return ports;
  }

  /**
   * Get ahead/behind counts relative to main branch
   */
  getAheadBehind(worktreePath, branchName) {
    try {
      // Skip if this is the main branch
      if (branchName === 'main') {
        return { ahead: 0, behind: 0 };
      }

      // Fetch latest from origin to ensure accurate comparison
      try {
        execSync('git fetch origin main', {
          cwd: worktreePath,
          stdio: 'pipe'
        });
      } catch {
        // Ignore fetch errors
      }

      // Get ahead count (commits in current branch not in main)
      const aheadOutput = execSync('git rev-list --count HEAD ^origin/main', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      const ahead = parseInt(aheadOutput, 10) || 0;

      // Get behind count (commits in main not in current branch)
      const behindOutput = execSync('git rev-list --count origin/main ^HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      const behind = parseInt(behindOutput, 10) || 0;

      return { ahead, behind };
    } catch (error) {
      console.warn(`[getAheadBehind] Error for ${branchName}:`, error.message);
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * Get file change counts (modified and untracked)
   */
  getFileChanges(worktreePath) {
    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      if (!statusOutput) {
        return { modifiedFiles: 0, untrackedFiles: 0 };
      }

      const lines = statusOutput.split('\n');
      let modifiedFiles = 0;
      let untrackedFiles = 0;

      for (const line of lines) {
        const status = line.substring(0, 2);

        // Modified files: M, A, D, R, C, U (in either column)
        if (status[0] !== '?' && status[0] !== ' ' && status[0] !== '!') {
          modifiedFiles++;
        } else if (status[1] !== ' ' && status[1] !== '?' && status[1] !== '!') {
          modifiedFiles++;
        }

        // Untracked files: ??
        if (status === '??') {
          untrackedFiles++;
        }
      }

      return { modifiedFiles, untrackedFiles };
    } catch (error) {
      console.warn(`[getFileChanges] Error:`, error.message);
      return { modifiedFiles: 0, untrackedFiles: 0 };
    }
  }

  /**
   * Get detailed list of changed files with their status
   * Note: git status --porcelain automatically respects .gitignore
   */
  getDetailedFileChanges(worktreePath) {
    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      if (!statusOutput) {
        return { modified: [], untracked: [] };
      }

      const lines = statusOutput.split('\n');
      const modified = [];
      const untracked = [];

      // Map of git status codes to readable names
      const statusMap = {
        'M ': 'Modified',
        ' M': 'Modified',
        'MM': 'Modified',
        'A ': 'Added',
        ' A': 'Added',
        'D ': 'Deleted',
        ' D': 'Deleted',
        'R ': 'Renamed',
        ' R': 'Renamed',
        'C ': 'Copied',
        ' C': 'Copied',
        'U ': 'Unmerged',
        ' U': 'Unmerged',
        'UU': 'Unmerged',
        '??': 'Untracked'
      };

      for (const line of lines) {
        if (!line) continue;

        const status = line.substring(0, 2);
        const filePath = line.substring(3); // Skip status and space

        // Untracked files
        if (status === '??') {
          untracked.push({
            path: filePath,
            status: 'Untracked',
            statusCode: status
          });
        } else if (status[0] !== ' ' || status[1] !== ' ') {
          // Modified/Added/Deleted files (anything that's not untracked or ignored)
          const statusLabel = statusMap[status] || 'Modified';
          modified.push({
            path: filePath,
            status: statusLabel,
            statusCode: status
          });
        }
      }

      return { modified, untracked };
    } catch (error) {
      console.warn(`[getDetailedFileChanges] Error:`, error.message);
      return { modified: [], untracked: [] };
    }
  }

  /**
   * Get last commit information
   */
  getLastCommit(worktreePath) {
    try {
      // Get commit hash
      const hash = execSync('git rev-parse --short HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // Get commit message (first line only)
      const message = execSync('git log -1 --pretty=format:%s', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // Get author name
      const author = execSync('git log -1 --pretty=format:%an', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // Get timestamp (ISO format)
      const timestamp = execSync('git log -1 --pretty=format:%cI', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // Get relative time (e.g., "2 hours ago")
      const relativeTime = execSync('git log -1 --pretty=format:%cr', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      return {
        hash,
        message,
        author,
        timestamp,
        relativeTime
      };
    } catch (error) {
      console.warn(`[getLastCommit] Error:`, error.message);
      return {
        hash: '',
        message: '',
        author: '',
        timestamp: '',
        relativeTime: ''
      };
    }
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
    const worktreeBase = this.getWorktreeBase();
    const worktreePath = join(worktreeBase, worktreeName);

    console.log(`\n========================================`);
    console.log(`[CREATE] Starting worktree creation`);
    console.log(`[CREATE] Branch: ${branchName} (from ${fromBranch})`);
    console.log(`[CREATE] Name: ${worktreeName}`);
    console.log(`[CREATE] Path: ${worktreePath}`);
    console.log(`========================================\n`);


    if (!existsSync(worktreeBase)) {
      mkdirSync(worktreeBase, { recursive: true });
    }

    try {
      // PRE-FLIGHT: Clean up any stale git worktree registrations before checking state
      console.log(`[PRE-FLIGHT] Running git worktree prune to clean stale registrations...`);
      try {
        this._runGitCommand('git worktree prune', { stdio: 'pipe' });
        this._runGitCommand('git worktree repair', { stdio: 'pipe' });
        console.log(`[PRE-FLIGHT] ✓ Git worktree state cleaned`);
      } catch (preflightError) {
        console.warn(`[PRE-FLIGHT] Cleanup warning (non-critical): ${preflightError.message}`);
      }

      // IDEMPOTENCY CHECK 1: Does the branch already exist?
      console.log(`[CREATE] Checking if branch exists: ${slugifiedBranch}`);
      const branchExists = this._runGitCommand(`git branch --list "${slugifiedBranch}"`).trim().length > 0;
      console.log(`[CREATE] Branch exists: ${branchExists}`);

      // IDEMPOTENCY CHECK 2: Does the worktree directory already exist?
      console.log(`[CREATE] Checking if directory exists: ${worktreePath}`);
      const dirExists = existsSync(worktreePath);
      console.log(`[CREATE] Directory exists: ${dirExists}`);

      // IDEMPOTENCY CHECK 3: Is there a worktree registration?
      console.log(`[CREATE] Checking if worktree is registered`);
      const worktrees = this.listWorktrees();
      const worktreeRegistered = worktrees.some(wt => wt.name === worktreeName);
      console.log(`[CREATE] Worktree registered: ${worktreeRegistered}`);

      // IDEMPOTENT LOGIC: If everything exists, return success
      if (branchExists && dirExists && worktreeRegistered) {
        console.log(`[CREATE] Worktree already exists, returning early`);
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
        console.log(`[CREATE] Orphaned registration found for ${worktreeName}`);
        console.log(`[CREATE] Running aggressive cleanup: prune + repair + remove registration...`);
        try {
          // Step 1: Prune stale worktrees
          this._runGitCommand('git worktree prune', { stdio: 'pipe' });
          console.log(`[CREATE] ✓ Pruned stale registrations`);

          // Step 2: Repair any remaining issues
          this._runGitCommand('git worktree repair', { stdio: 'pipe' });
          console.log(`[CREATE] ✓ Repaired git worktree state`);

          // Step 3: Force remove the specific registration if still present
          try {
            this._runGitCommand(`git worktree remove --force "${worktreePath}"`, { stdio: 'pipe' });
            console.log(`[CREATE] ✓ Force removed registration for ${worktreePath}`);
          } catch (removeError) {
            // Already cleaned up, ignore
            console.log(`[CREATE] Registration already cleaned (expected)`);
          }
        } catch (cleanupError) {
          console.warn(`[CREATE] Cleanup warning: ${cleanupError.message}`);
        }
      }

      // Handle orphaned directory (directory exists but not registered)
      if (dirExists && !worktreeRegistered) {
        console.log(`[CREATE] Orphaned directory found at ${worktreePath}`);
        console.log(`[CREATE] Removing directory and cleaning git state...`);
        execSync(`rm -rf "${worktreePath}"`, { stdio: 'pipe' });
        console.log(`[CREATE] ✓ Removed orphaned directory`);

        // Also prune git's internal worktree state to ensure clean slate
        this._runGitCommand('git worktree prune', { stdio: 'pipe' });
        this._runGitCommand('git worktree repair', { stdio: 'pipe' });
        console.log(`[CREATE] ✓ Git worktree state cleaned`);
      }

      // Progress: Creating git worktree
      const gitId = this.profiler.start('git-worktree-add', totalId);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: 'Creating git worktree...'
      });

      // Use correct git command based on whether branch exists
      const createCmd = branchExists
        ? `git worktree add "${worktreePath}" "${slugifiedBranch}"`  // Branch exists, just check it out
        : `git worktree add -b "${slugifiedBranch}" "${worktreePath}" "${fromBranch}"`; // Create new branch

      console.log(`[GIT] Executing: ${createCmd} (in ${this.getProjectRoot()})`);
      try {
        this._runGitCommand(createCmd, { stdio: 'pipe' });
        console.log(`[GIT] Worktree created successfully at: ${worktreePath}`);
      } catch (gitError) {
        // If git says worktree is already registered but our checks said it wasn't,
        // this indicates corrupted git state. Use --force to override.
        if (gitError.message.includes('already registered worktree')) {
          console.log(`[GIT] Detected corrupted git state, retrying with --force`);
          const forceCmd = branchExists
            ? `git worktree add --force "${worktreePath}" "${slugifiedBranch}"`
            : `git worktree add --force -b "${slugifiedBranch}" "${worktreePath}" "${fromBranch}"`;
          console.log(`[GIT] Executing: ${forceCmd} (in ${this.getProjectRoot()})`);
          this._runGitCommand(forceCmd, { stdio: 'pipe' });
          console.log(`[GIT] Worktree created successfully (with --force) at: ${worktreePath}`);
        } else {
          throw gitError;
        }
      }


      // Add worktree-specific files to .gitignore to prevent git conflicts
      const gitignorePath = join(worktreePath, '.gitignore');
      const worktreeIgnoreEntries = [
        '',
        '# Worktree-specific files (managed by VibeTrees)',
        '.env',
      ].join('\n');

      try {
        // Append to existing .gitignore or create new one
        if (existsSync(gitignorePath)) {
          const existingContent = readFileSync(gitignorePath, 'utf-8');
          // Only add if not already present
          if (!existingContent.includes('# Worktree-specific files')) {
            writeFileSync(gitignorePath, existingContent + '\n' + worktreeIgnoreEntries);
          }
        } else {
          writeFileSync(gitignorePath, worktreeIgnoreEntries);
        }
      } catch (gitignoreError) {
        console.warn(`[CREATE] Failed to update .gitignore (non-critical):`, gitignoreError.message);
      }

      this.profiler.end(gitId);

      // Push the new branch to GitHub to create it remotely
      const pushId = this.profiler.start('git-push-branch', totalId);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: 'Pushing branch to GitHub...'
      });

      try {
        execSync(`git push -u origin "${slugifiedBranch}"`, {
          cwd: worktreePath,
          stdio: 'pipe',
          timeout: 10000 // 10 second timeout
        });
      } catch (pushError) {
        console.warn(`[CREATE] Failed to push branch to GitHub: ${pushError.message}`);
        // Don't fail the whole operation if push fails (timeout, network, auth, etc.)
      }
      this.profiler.end(pushId);

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'git',
        message: '✓ Git worktree created'
      });

      // Progress: Allocating ports (quick, do before slow operations)
      const portsId = this.profiler.start('allocate-ports', totalId);
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
      // Only write if .env doesn't already exist (preserve user customizations)
      const envFilePath = join(worktreePath, '.env');
      if (!existsSync(envFilePath)) {
        console.log(`[ENV] Generating .env file at: ${envFilePath}`);
        const projectName = `vibe_${worktreeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Extract port env var names from docker-compose.yml
        // Try worktree path first (already cloned), fallback to root
        const composeFile = this.config.get('container.composeFile') || 'docker-compose.yml';
        let composeFilePathForEnv = join(worktreePath, composeFile);
        if (!existsSync(composeFilePathForEnv)) {
          composeFilePathForEnv = join(this.rootDir, composeFile);
        }
        console.log(`[ENV] Extracting port env vars from: ${composeFilePathForEnv}`);
        const inspector = new this.ComposeInspector(composeFilePathForEnv, this.runtime);
        const portEnvVars = inspector.getPortEnvVars();
        console.log(`[ENV] Extracted port env vars:`, portEnvVars);

        // Generate env content dynamically from discovered ports
        let envContent = `COMPOSE_PROJECT_NAME=${projectName}\n`;
        for (const [serviceName, port] of Object.entries(ports)) {
          // Use exact env var name from docker-compose.yml if available
          const envVarName = portEnvVars[serviceName] || this._serviceNameToEnvVar(serviceName) + '_PORT';
          envContent += `${envVarName}=${port}\n`;
          console.log(`[ENV] ${envVarName}=${port}`);
        }

        writeFileSync(envFilePath, envContent);
        console.log(`[ENV] .env file created successfully`);
      } else {
        console.log(`[ENV] .env file already exists at: ${envFilePath}, preserving user customizations`);
      }

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

        const mcpResult = this.mcpManager.generateClaudeSettings(worktreePath, null, { serverEnv });
      } catch (error) {
        console.warn(`[CREATE] MCP configuration failed (non-critical):`, error.message);
      }
      this.profiler.end(mcpId);

      // Run bootstrap (containers must start before database copy)

      const bootstrapId = this.profiler.start('npm-bootstrap', totalId);
      const bootstrapPromise = new Promise((resolve, reject) => {
        try {
          // Check if bootstrap script exists in package.json
          const packageJsonPath = join(worktreePath, 'package.json');
          const nodeModulesPath = join(worktreePath, 'node_modules');
          let installCommand = 'npm install';

          // IDEMPOTENCY CHECK: Skip if node_modules exists and is fresh
          if (existsSync(nodeModulesPath) && existsSync(packageJsonPath)) {
            console.log(`[BOOTSTRAP] Checking if dependencies are already installed...`);
            try {
              const nodeModulesStat = statSync(nodeModulesPath);
              const packageJsonStat = statSync(packageJsonPath);

              if (nodeModulesStat.mtime > packageJsonStat.mtime) {
                console.log(`[BOOTSTRAP] Dependencies already installed (node_modules newer than package.json), skipping (idempotent)`);
                this.broadcast('worktree:progress', {
                  name: worktreeName,
                  step: 'bootstrap',
                  message: '✓ Dependencies already installed'
                });
                this.profiler.end(bootstrapId);
                resolve();
                return;
              } else {
                console.log(`[BOOTSTRAP] package.json is newer than node_modules, reinstalling`);
              }
            } catch (statError) {
              console.warn(`[BOOTSTRAP] Could not check timestamps: ${statError.message}, proceeding with install`);
            }
          }

          if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            if (packageJson.scripts && packageJson.scripts.bootstrap) {
              installCommand = 'npm run bootstrap';
              console.log(`[BOOTSTRAP] Found bootstrap script in package.json`);
              this.broadcast('worktree:progress', {
                name: worktreeName,
                step: 'bootstrap',
                message: 'Building packages (bootstrap)...'
              });
            } else {
              console.log(`[BOOTSTRAP] No bootstrap script found, using npm install`);
              this.broadcast('worktree:progress', {
                name: worktreeName,
                step: 'install',
                message: 'Installing dependencies...'
              });
            }
          }

          console.log(`[BOOTSTRAP] Executing: ${installCommand} in ${worktreePath}`);
          const startTime = Date.now();
          execSync(installCommand, {
            cwd: worktreePath,
            stdio: 'pipe',
            encoding: 'utf-8'
          });
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[BOOTSTRAP] Completed in ${duration}s`);

          this.broadcast('worktree:progress', {
            name: worktreeName,
            step: installCommand.includes('bootstrap') ? 'bootstrap' : 'install',
            message: '✓ Dependencies ready'
          });
          this.profiler.end(bootstrapId);
          resolve();
        } catch (err) {
          console.error(`[BOOTSTRAP] Failed to install dependencies:`, err.message);
          this.profiler.end(bootstrapId);
          reject(new Error(`Failed to install dependencies: ${err.message}`));
        }
      });

      // Wait for bootstrap to complete
      await bootstrapPromise;

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'bootstrap',
        message: '✓ Packages ready'
      });

      // Copy database BEFORE starting containers (database files must be copied while containers are stopped)
      const dbCopyId = this.profiler.start('database-copy', totalId);
      try {
        console.log(`[CREATE] Copying database before starting containers...`);
        await this.copyDatabase(worktreeName, worktreePath);
        console.log(`[CREATE] ✓ Database copied successfully`);
      } catch (err) {
        console.error(`[CREATE] Database copy failed (non-critical):`, err.message);
        // Don't fail worktree creation if database copy fails
      }
      this.profiler.end(dbCopyId);

      // Start containers AFTER database is copied
      const dockerId = this.profiler.start('docker-compose-up', totalId);
      console.log(`[CREATE] Starting containers with copied database...`);
      await this.startContainersForWorktree(worktreeName, worktreePath);
      console.log(`[CREATE] ✓ Containers started successfully`);
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

      console.log(`\n========================================`);
      console.log(`[CREATE] Worktree creation completed successfully!`);
      console.log(`[CREATE] Name: ${worktreeName}`);
      console.log(`[CREATE] Branch: ${slugifiedBranch}`);
      console.log(`[CREATE] Path: ${worktreePath}`);
      console.log(`[CREATE] Ports:`, JSON.stringify(ports, null, 2));
      console.log(`========================================\n`);

      this.broadcast('worktree:created', worktree);
      return { success: true, worktree };
    } catch (error) {
      this.profiler.end(totalId);
      console.log(`\n========================================`);
      console.log(`[CREATE] Worktree creation FAILED`);
      console.log(`[CREATE] Name: ${worktreeName}`);
      console.log(`[CREATE] Error: ${error.message}`);
      console.log(`[CREATE] Stack: ${error.stack}`);
      console.log(`========================================\n`);
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

      return result;
    } catch (error) {
      this.profiler.end(totalId);
      throw error;
    }
  }

  async copyDatabase(targetWorktreeName, targetWorktreePath) {
    try {
      console.log(`[DATABASE] Starting database copy for ${targetWorktreeName}`);
      this.broadcast('worktree:progress', {
        name: targetWorktreeName,
        step: 'database',
        message: 'Copying database files...'
      });

      // File-based copy using docker cp - simpler and faster since all worktrees use same PostgreSQL version
      // This copies the PostgreSQL data directory from source container to target container

      // Find the main worktree's postgres container
      const worktrees = this.listWorktrees();
      const mainWorktree = worktrees.find(wt => !wt.path.includes('.worktrees'));

      if (!mainWorktree) {
        console.log(`[DATABASE] No main worktree found, starting with fresh database`);
        this.broadcast('worktree:progress', {
          name: targetWorktreeName,
          step: 'database',
          message: 'Starting with fresh database'
        });
        return;
      }

      // Get container names from COMPOSE_PROJECT_NAME
      const sourceProjectName = `vibe_${mainWorktree.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const targetProjectName = `vibe_${targetWorktreeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Docker Compose v2 uses hyphens, not underscores: project-service-1
      const sourceContainer = `${sourceProjectName}-postgres-1`;
      const targetContainer = `${targetProjectName}-postgres-1`;

      console.log(`[DATABASE] Source container: ${sourceContainer}`);
      console.log(`[DATABASE] Target container: ${targetContainer}`);

      // Check if source container exists and is running
      try {
        const sourceStatus = this.runtime.exec(`ps -a --filter "name=${sourceContainer}" --format "{{.State}}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        if (!sourceStatus || sourceStatus !== 'running') {
          console.log(`[DATABASE] Source database container not running (status: ${sourceStatus}), starting with fresh database`);
          this.broadcast('worktree:progress', {
            name: targetWorktreeName,
            step: 'database',
            message: 'Starting with fresh database (source DB not running)'
          });
          return;
        }
        console.log(`[DATABASE] Source container is running`);
      } catch (e) {
        console.log(`[DATABASE] Source database container not found, starting with fresh database`);
        this.broadcast('worktree:progress', {
          name: targetWorktreeName,
          step: 'database',
          message: 'Starting with fresh database (source DB not found)'
        });
        return;
      }

      // Wait for target container to be ready (max 30 seconds)
      console.log(`[DATABASE] Waiting for target container to start...`);
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        try {
          const targetStatus = this.runtime.exec(`ps -a --filter "name=${targetContainer}" --format "{{.State}}"`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          if (targetStatus === 'running') {
            console.log(`[DATABASE] Target container is running (attempt ${attempts + 1})`);
            break;
          }
        } catch (e) {
          // Container not found yet
        }

        attempts++;
        if (attempts >= maxAttempts) {
          console.log(`[DATABASE] Timeout waiting for target container after ${maxAttempts}s`);
          this.broadcast('worktree:progress', {
            name: targetWorktreeName,
            step: 'database',
            message: 'Starting with fresh database (timeout waiting for container)'
          });
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // IDEMPOTENCY CHECK: Check if target database already has data
      console.log(`[DATABASE] Checking if target database already has data...`);
      try {
        const checkCmd = `exec ${targetContainer} psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM pg_database WHERE datname = 'app'"`;
        const dbExists = this.runtime.exec(checkCmd, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        if (parseInt(dbExists) > 0) {
          // Check if app database has tables
          const tableCheckCmd = `exec ${targetContainer} psql -U postgres -d app -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"`;
          const tableCount = this.runtime.exec(tableCheckCmd, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();

          const numTables = parseInt(tableCount);
          if (numTables > 0) {
            console.log(`[DATABASE] Target database already has ${numTables} tables, skipping copy (idempotent)`);
            this.broadcast('worktree:progress', {
              name: targetWorktreeName,
              step: 'database',
              message: `✓ Database already populated (${numTables} tables)`
            });
            return;
          }
        }
        console.log(`[DATABASE] Target database is empty, proceeding with copy`);
      } catch (checkError) {
        console.warn(`[DATABASE] Could not check for existing data: ${checkError.message}, proceeding with copy`);
        // Continue with copy if check fails
      }

      // Stop target container before copying files
      console.log(`[DATABASE] Stopping target container for file copy...`);
      this.runtime.exec(`stop ${targetContainer}`, {
        stdio: 'pipe'
      });

      // Wait for container to stop
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Copy PostgreSQL data directory from source to target
      console.log(`[DATABASE] Copying database files from ${sourceContainer} to ${targetContainer}...`);
      const dbStartTime = Date.now();

      // Create a temporary archive of the source database
      const tempArchive = `/tmp/postgres-data-${Date.now()}.tar`;
      console.log(`[DATABASE] Creating archive: ${tempArchive}`);

      // Archive the source data directory
      this.runtime.exec(`exec ${sourceContainer} tar -czf /tmp/pgdata.tar.gz -C /var/lib/postgresql/data .`, {
        stdio: 'pipe'
      });

      // Copy archive from source container to host
      this.runtime.exec(`cp ${sourceContainer}:/tmp/pgdata.tar.gz ${tempArchive}`, {
        stdio: 'pipe'
      });

      // Copy archive from host to target container
      this.runtime.exec(`cp ${tempArchive} ${targetContainer}:/tmp/pgdata.tar.gz`, {
        stdio: 'pipe'
      });

      // Extract archive in target container
      this.runtime.exec(`exec ${targetContainer} tar -xzf /tmp/pgdata.tar.gz -C /var/lib/postgresql/data`, {
        stdio: 'pipe'
      });

      // Clean up temporary files
      try {
        fs.unlinkSync(tempArchive);
        this.runtime.exec(`exec ${sourceContainer} rm /tmp/pgdata.tar.gz`, { stdio: 'pipe' });
        this.runtime.exec(`exec ${targetContainer} rm /tmp/pgdata.tar.gz`, { stdio: 'pipe' });
      } catch (cleanupError) {
        console.warn(`[DATABASE] Cleanup warning: ${cleanupError.message}`);
      }

      // Restart target container
      console.log(`[DATABASE] Restarting target container...`);
      this.runtime.exec(`start ${targetContainer}`, {
        stdio: 'pipe'
      });

      // Wait for database to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));

      const dbDuration = ((Date.now() - dbStartTime) / 1000).toFixed(1);
      console.log(`[DATABASE] Database copied successfully in ${dbDuration}s`);
      this.broadcast('worktree:progress', {
        name: targetWorktreeName,
        step: 'database',
        message: '✓ Database copied successfully'
      });
      return;
    } catch (error) {
      console.error(`[DATABASE] Failed to copy database:`, error.message);
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
    console.log(`[CONTAINERS] Starting containers for ${worktreeName} in ${worktreePath}`);
    this.broadcast('worktree:progress', {
      name: worktreeName,
      step: 'containers',
      message: 'Starting Docker containers...'
    });

    try {
      // Build the compose command - runtime handles sudo automatically
      const composeCmd = `${this.runtime.getComposeCommand()} --env-file .env up -d`;
      const fullCmd = this.runtime.needsElevation() ? `sudo ${composeCmd}` : composeCmd;

      console.log(`[CONTAINERS] Executing: ${fullCmd}`);
      const startTime = Date.now();

      // Start containers with docker-compose up -d
      await this._runCommandWithProgress(
        fullCmd,
        worktreeName,
        'containers',
        { cwd: worktreePath }
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[CONTAINERS] All containers started successfully in ${duration}s`);

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'containers',
        message: '✓ All containers started'
      });
    } catch (error) {
      console.error(`[CONTAINERS] Failed to start containers:`, error.message);
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
        this._runGitCommand('git fetch origin', { stdio: 'pipe' });
      } catch (fetchError) {
        console.warn('Warning: Could not fetch from origin:', fetchError.message);
      }

      // Check if branch is merged to main
      const mergedBranches = this._runGitCommand('git branch -r --merged origin/main');

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

      const result = this.runtime.execCompose(
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
      const statusOutput = this._runGitCommand('git status --porcelain').trim();

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

    if (!worktree) {
      return { success: false, error: `Worktree '${worktreeName}' not found` };
    }

    // Check if this is the main worktree by seeing if it's in the .worktrees directory
    // Use startsWith to ensure we're checking the directory structure, not just substring match
    const worktreeBase = this.getWorktreeBase();
    const isInWorktreesDir = worktree.path.startsWith(worktreeBase + path.sep);

    if (!isInWorktreesDir) {
      return { success: false, error: 'Cannot delete main worktree' };
    }

    try {
      // Stop services and clean up images (only if directory exists)
      if (existsSync(worktree.path)) {
        try {
          this.runtime.execCompose('--env-file .env down -v --rmi local', {
            cwd: worktree.path,
            stdio: 'pipe'
          });
        } catch (dockerError) {
          // Docker cleanup failed, but continue with worktree removal
          console.warn(`[DELETE] Docker cleanup failed for ${worktreeName}:`, dockerError.message);
        }
      }

      // Remove worktree (works for both existing and prunable worktrees)
      try {
        this._runGitCommand(`git worktree remove "${worktree.path}" --force`, { stdio: 'pipe' });
      } catch (removeError) {
        // If directory doesn't exist, try prune instead
        if (!existsSync(worktree.path)) {
          console.log(`[DELETE] Directory doesn't exist, pruning stale registration for ${worktreeName}`);
          this._runGitCommand('git worktree prune', { stdio: 'pipe' });
        } else {
          throw removeError;
        }
      }

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
      // Only write .env file if it doesn't exist (preserve user customizations)
      const envFilePath = join(worktree.path, '.env');
      if (!existsSync(envFilePath)) {
        // Use a unique project name to avoid container name conflicts
        const projectName = `vibe_${worktreeName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Generate env content dynamically from discovered ports
        let envContent = `COMPOSE_PROJECT_NAME=${projectName}\n`;
        for (const [serviceName, port] of Object.entries(ports)) {
          // Convert service name to env var format: api-gateway -> API_PORT
          const envVarBase = this._serviceNameToEnvVar(serviceName);
          const envVarName = `${envVarBase}_PORT`;
          envContent += `${envVarName}=${port}\n`;
        }

        writeFileSync(envFilePath, envContent);
      } else {
      }

      // Start Docker services
      const output = this.runtime.execCompose('--env-file .env up -d', {
        cwd: worktree.path,
        encoding: 'utf-8',
        stdio: 'pipe'
      });


      this.broadcast('services:started', { worktree: worktreeName, ports });
      return { success: true, ports };
    } catch (error) {
      const errorMsg = error.stderr?.toString() || error.stdout?.toString() || error.message;

      // Only log verbose errors if it's not just a "no compose file" situation
      if (!errorMsg.includes('no configuration file provided')) {
        console.error(`Failed to start services for ${worktreeName}:`, error.message);
        console.error('stderr:', error.stderr?.toString());
        console.error('stdout:', error.stdout?.toString());
      }

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
      this.runtime.execCompose('down', {
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
   * Install dependencies for a worktree
   * Supports bootstrap script or falls back to npm install
   */
  async installDependencies(worktreeName, worktreePath) {
    try {
      // Check if bootstrap script exists in package.json
      const packageJsonPath = join(worktreePath, 'package.json');
      let installCommand = 'npm install';
      let scriptType = 'install';

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.scripts && packageJson.scripts.bootstrap) {
          installCommand = 'npm run bootstrap';
          scriptType = 'bootstrap';
        }
      }

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'install',
        message: `Installing dependencies (${scriptType})...`
      });

      const output = execSync(installCommand, {
        cwd: worktreePath,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'install',
        message: '✓ Dependencies installed'
      });

      return {
        success: true,
        command: installCommand,
        scriptType,
        output
      };
    } catch (error) {
      console.error(`[INSTALL] Failed to install dependencies for ${worktreeName}:`, error.message);
      this.broadcast('worktree:progress', {
        name: worktreeName,
        step: 'install',
        message: `✗ Installation failed: ${error.message}`
      });

      return {
        success: false,
        error: error.message,
        stderr: error.stderr || error.stdout || ''
      };
    }
  }

  /**
   * Check for updates from main branch (Phase 2.9)
   */
  async checkUpdates(worktreeName, worktreePath) {
    const syncManager = new this.GitSyncManager(worktreePath);
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
    const syncManager = new this.GitSyncManager(worktreePath);
    const result = await syncManager.syncWithMain(options.strategy, options);

    // If sync succeeded and smartReload is enabled, perform smart reload
    if (result.success && options.smartReload) {
      // Get commits that were merged
      const commits = result.output?.match(/[0-9a-f]{7,40}/g) || [];

      // Analyze changes
      const analysis = await syncManager.analyzeChanges(commits);

      // Perform smart reload
      const reloadManager = new this.SmartReloadManager(worktreePath, this.runtime);
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
    const syncManager = new this.GitSyncManager(worktreePath);
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
    const syncManager = new this.GitSyncManager(worktreePath);
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
    const syncManager = new this.GitSyncManager(worktreePath);
    const analysis = await syncManager.analyzeChanges(commits);

    const reloadManager = new this.SmartReloadManager(worktreePath, this.runtime);
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
    const resolver = new this.AIConflictResolver(worktreePath);
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
    const resolver = new this.AIConflictResolver(worktreePath);
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
    const resolver = new this.AIConflictResolver(worktreePath);
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
    const resolver = new this.AIConflictResolver(worktreePath);
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
