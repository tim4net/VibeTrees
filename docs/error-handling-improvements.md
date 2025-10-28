# Error Handling Improvements - Prioritized Recommendations

**Date**: 2025-10-28
**Status**: Proposed
**Priority Levels**: P0 (Critical) → P1 (High) → P2 (Medium) → P3 (Low)

---

## P0: Critical Fixes (Must implement immediately)

### 1. Docker Daemon Detection Enhancement

**Problem**: Generic error when Docker is not running - most common error for new users.

**Current Behavior**:
```javascript
// Generic error from execSync
Error: spawn docker ENOENT
```

**Proposed Fix**:
```javascript
// In ContainerRuntime._detectRuntime()
try {
  execSync('docker ps', { stdio: 'ignore' });
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error(
      'Docker is not installed or not in PATH.\n\n' +
      'Install Docker:\n' +
      '  macOS: https://docs.docker.com/desktop/install/mac-install/\n' +
      '  Windows: https://docs.docker.com/desktop/install/windows-install/\n' +
      '  Linux: https://docs.docker.com/engine/install/'
    );
  }

  if (error.message.includes('Cannot connect to the Docker daemon')) {
    const startInstructions = {
      darwin: 'Start Docker Desktop from Applications',
      linux: 'Run: sudo systemctl start docker',
      win32: 'Start Docker Desktop from Start Menu'
    };

    throw new Error(
      'Docker daemon is not running.\n\n' +
      `To start Docker:\n  ${startInstructions[process.platform] || startInstructions.linux}\n\n` +
      'Then retry this operation.'
    );
  }

  throw error;
}
```

**Files to modify**:
- `/scripts/container-runtime.mjs` (lines 109-124)

---

### 2. Disk Space Validation

**Problem**: No validation before starting space-intensive operations (worktree creation, database copy).

**Proposed Implementation**:
```javascript
// New utility: /scripts/utils/disk-space.mjs
export class DiskSpaceValidator {
  /**
   * Check if sufficient disk space is available
   * @param {string} path - Path to check
   * @param {number} requiredMB - Required space in MB
   * @returns {Object} { hasSpace, available, required }
   */
  static async checkSpace(path, requiredMB) {
    try {
      const output = execSync(`df -m "${path}" | tail -1`, { encoding: 'utf-8' });
      const parts = output.split(/\s+/);
      const availableMB = parseInt(parts[3], 10);

      return {
        hasSpace: availableMB >= requiredMB,
        availableMB,
        requiredMB,
        message: availableMB < requiredMB
          ? `Insufficient disk space: ${availableMB}MB available, ${requiredMB}MB required`
          : null
      };
    } catch (error) {
      // If df fails, assume space is available (don't block operation)
      return { hasSpace: true, availableMB: -1, requiredMB };
    }
  }

  /**
   * Estimate space needed for worktree creation
   */
  static async estimateWorktreeSpace() {
    // Rough estimate: main worktree size + 2GB buffer for DB/volumes
    const mainSize = await this.getDirectorySize(process.cwd());
    return Math.ceil(mainSize / (1024 * 1024)) + 2048; // MB
  }

  static async getDirectorySize(path) {
    try {
      const output = execSync(`du -sb "${path}" 2>/dev/null || echo 0`, { encoding: 'utf-8' });
      return parseInt(output.split('\t')[0], 10);
    } catch {
      return 0;
    }
  }
}
```

**Integration Points**:
```javascript
// In WorktreeManager.createWorktree() - before line 312
const requiredSpace = await DiskSpaceValidator.estimateWorktreeSpace();
const spaceCheck = await DiskSpaceValidator.checkSpace(WORKTREE_BASE, requiredSpace);

if (!spaceCheck.hasSpace) {
  this.broadcast('worktree:progress', {
    name: worktreeName,
    step: 'error',
    message: `✗ ${spaceCheck.message}`
  });
  return {
    success: false,
    error: 'insufficient_disk_space',
    message: spaceCheck.message,
    details: {
      available: spaceCheck.availableMB,
      required: spaceCheck.requiredMB,
      path: WORKTREE_BASE
    },
    suggestion: 'Free up disk space or choose a different location for worktrees'
  };
}
```

**Files to create**:
- `/scripts/utils/disk-space.mjs` (new file)

**Files to modify**:
- `/scripts/worktree-web/server.mjs` (add check in createWorktree, line 298)
- `/scripts/data-sync.mjs` (add check before copyVolumes, line 33)

---

### 3. Standardized Error Response Format

**Problem**: 4 different error response formats across API endpoints.

**Proposed Standard**:
```javascript
// /scripts/utils/error-response.mjs
export class ErrorResponse {
  /**
   * Create standardized error response
   */
  static create(options) {
    const {
      code,           // Machine-readable error code (e.g., 'DOCKER_NOT_RUNNING')
      message,        // Human-readable message
      details = {},   // Additional context (optional)
      suggestion,     // Actionable suggestion (optional)
      documentation,  // Link to docs (optional)
      data = null     // Additional data (e.g., conflicts array)
    } = options;

    return {
      success: false,
      error: {
        code,
        message,
        details,
        suggestion,
        documentation,
        timestamp: new Date().toISOString()
      },
      data
    };
  }

  /**
   * Create success response
   */
  static success(data = {}) {
    return {
      success: true,
      data
    };
  }
}

// Error code registry
export const ErrorCodes = {
  // Git errors (1000-1999)
  GIT_UNCOMMITTED_CHANGES: 'GIT_UNCOMMITTED_CHANGES',
  GIT_MERGE_CONFLICT: 'GIT_MERGE_CONFLICT',
  GIT_NETWORK_ERROR: 'GIT_NETWORK_ERROR',
  GIT_BRANCH_NOT_FOUND: 'GIT_BRANCH_NOT_FOUND',

  // Docker errors (2000-2999)
  DOCKER_NOT_INSTALLED: 'DOCKER_NOT_INSTALLED',
  DOCKER_NOT_RUNNING: 'DOCKER_NOT_RUNNING',
  DOCKER_PERMISSION_DENIED: 'DOCKER_PERMISSION_DENIED',
  DOCKER_PORT_IN_USE: 'DOCKER_PORT_IN_USE',
  DOCKER_COMPOSE_INVALID: 'DOCKER_COMPOSE_INVALID',
  DOCKER_SERVICE_FAILED: 'DOCKER_SERVICE_FAILED',

  // Filesystem errors (3000-3999)
  FS_DISK_FULL: 'FS_DISK_FULL',
  FS_PERMISSION_DENIED: 'FS_PERMISSION_DENIED',
  FS_NOT_FOUND: 'FS_NOT_FOUND',
  FS_ALREADY_EXISTS: 'FS_ALREADY_EXISTS',

  // Network errors (4000-4999)
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_DNS_ERROR: 'NETWORK_DNS_ERROR',
  NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',

  // Dependency errors (5000-5999)
  DEPS_INSTALL_FAILED: 'DEPS_INSTALL_FAILED',
  DEPS_PACKAGE_NOT_FOUND: 'DEPS_PACKAGE_NOT_FOUND',
  DEPS_VERSION_CONFLICT: 'DEPS_VERSION_CONFLICT',

  // Worktree errors (6000-6999)
  WORKTREE_CREATE_FAILED: 'WORKTREE_CREATE_FAILED',
  WORKTREE_NOT_FOUND: 'WORKTREE_NOT_FOUND',
  WORKTREE_MAIN_PROTECTED: 'WORKTREE_MAIN_PROTECTED',

  // Generic errors (9000-9999)
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT'
};
```

**Usage Example**:
```javascript
// Before
return { success: false, error: error.message };

// After
return ErrorResponse.create({
  code: ErrorCodes.DOCKER_NOT_RUNNING,
  message: 'Docker daemon is not running',
  details: { originalError: error.message },
  suggestion: 'Start Docker Desktop or run: sudo systemctl start docker',
  documentation: 'https://docs.docker.com/config/daemon/start/'
});
```

**Files to create**:
- `/scripts/utils/error-response.mjs` (new file)

**Files to modify** (apply ErrorResponse to all error returns):
- `/scripts/worktree-web/server.mjs` (all catch blocks)
- `/scripts/git-sync-manager.mjs` (all error returns)
- `/scripts/smart-reload-manager.mjs` (all error returns)
- `/scripts/ai-conflict-resolver.mjs` (all error returns)
- All other modules with error handling

---

### 4. Service Restart Loading State

**Problem**: No visual feedback when restarting services (users click multiple times).

**Proposed Implementation**:

**Backend** (server.mjs):
```javascript
// Add progress events to restart operations
app.post('/api/worktrees/:name/services/:service/restart', async (req, res) => {
  const { name, service } = req.params;
  const worktrees = manager.listWorktrees();
  const worktree = worktrees.find(w => w.name === name);

  if (!worktree) {
    return res.json(ErrorResponse.create({
      code: ErrorCodes.WORKTREE_NOT_FOUND,
      message: `Worktree "${name}" not found`
    }));
  }

  try {
    console.log(`Restarting service ${service} in worktree ${name}...`);

    // Broadcast start
    manager.broadcast('service:restarting', {
      worktree: name,
      service,
      status: 'stopping'
    });

    // Restart with progress
    runtime.execCompose(`restart ${service}`, {
      cwd: worktree.path,
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    // Wait for health check
    await manager._waitForServiceHealth(worktree.path, service, 30000);

    // Broadcast success
    manager.broadcast('service:restarted', {
      worktree: name,
      service,
      status: 'running'
    });

    res.json(ErrorResponse.success({ service, status: 'running' }));
  } catch (error) {
    console.error(`Failed to restart service ${service}:`, error.message);

    // Broadcast failure
    manager.broadcast('service:restart-failed', {
      worktree: name,
      service,
      error: error.message
    });

    res.json(ErrorResponse.create({
      code: ErrorCodes.DOCKER_SERVICE_FAILED,
      message: `Failed to restart service "${service}"`,
      details: { service, worktree: name, originalError: error.message },
      suggestion: `Check service logs: docker compose -f ${worktree.path}/docker-compose.yml logs ${service}`
    }));
  }
});
```

**Frontend** (service-actions.js):
```javascript
// Add to existing restartService function
async function restartService(worktreeName, serviceName) {
  const button = event.target.closest('.restart-btn');
  const originalText = button.textContent;

  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Restarting...';

    const response = await fetch(
      `/api/worktrees/${worktreeName}/services/${serviceName}/restart`,
      { method: 'POST' }
    );

    const result = await response.json();

    if (result.success) {
      // Show success briefly
      button.innerHTML = '✓ Restarted';
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
      }, 2000);
    } else {
      throw new Error(result.error.message);
    }
  } catch (error) {
    // Show error
    button.innerHTML = '✗ Failed';
    button.classList.add('error');

    // Show error modal with details
    showErrorModal({
      title: `Failed to restart ${serviceName}`,
      message: error.message,
      suggestion: error.suggestion,
      documentation: error.documentation
    });

    setTimeout(() => {
      button.innerHTML = originalText;
      button.classList.remove('error');
      button.disabled = false;
    }, 3000);
  }
}
```

**Files to modify**:
- `/scripts/worktree-web/server.mjs` (lines 1717-1742)
- `/scripts/worktree-web/public/js/service-actions.js` (add loading states)

---

## P1: High Priority (Implement within 2 weeks)

### 5. Progress Tracking for Database Copy

**Problem**: Database copy can take 2+ minutes with no progress indication.

**Proposed Implementation**:
```javascript
// In WorktreeManager.copyDatabase() - replace lines 518-530
try {
  // Use rsync with progress
  const rsyncProcess = spawn('rsync', [
    '-a',
    '--info=progress2',  // Show overall progress
    `${mainDataPath}/`,
    `${targetDataPath}/`
  ], { cwd: process.cwd() });

  let lastProgress = 0;

  rsyncProcess.stdout.on('data', (data) => {
    const output = data.toString();

    // Parse rsync progress: "  1.23G  45%  123.45MB/s    0:00:15"
    const match = output.match(/(\d+)%/);
    if (match) {
      const progress = parseInt(match[1], 10);

      // Only broadcast when progress changes by 5% to avoid spam
      if (progress - lastProgress >= 5) {
        this.broadcast('worktree:progress', {
          name: targetWorktreeName,
          step: 'database',
          message: `Copying database files... ${progress}%`,
          progress: {
            percentage: progress,
            current: progress,
            total: 100
          }
        });
        lastProgress = progress;
      }
    }
  });

  await new Promise((resolve, reject) => {
    rsyncProcess.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`rsync exited with code ${code}`));
    });
    rsyncProcess.on('error', reject);
  });

} catch {
  // Fallback to cp without progress
  execSync(`cp -a "${mainDataPath}/." "${targetDataPath}/"`, { stdio: 'pipe' });
}
```

**Files to modify**:
- `/scripts/worktree-web/server.mjs` (lines 516-530)

---

### 6. Network Error Detection & Retry Logic

**Problem**: Network errors not distinguished from other failures, no retry mechanism.

**Proposed Implementation**:
```javascript
// /scripts/utils/network-retry.mjs
export class NetworkRetry {
  /**
   * Execute command with retry on network errors
   */
  static async execWithRetry(command, options = {}) {
    const maxRetries = options.retries || 3;
    const retryDelay = options.retryDelay || 2000; // 2s
    const timeout = options.timeout || 30000; // 30s

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return execSync(command, {
          ...options,
          timeout,
          encoding: 'utf-8'
        });
      } catch (error) {
        const isNetworkError = this.isNetworkError(error);
        const isLastAttempt = attempt === maxRetries;

        if (!isNetworkError || isLastAttempt) {
          throw this.enhanceError(error, attempt, maxRetries);
        }

        console.log(`Network error, retrying (${attempt}/${maxRetries})...`);
        await this.sleep(retryDelay * attempt); // Exponential backoff
      }
    }
  }

  /**
   * Check if error is network-related
   */
  static isNetworkError(error) {
    const networkIndicators = [
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'Could not resolve host',
      'Connection timed out',
      'Connection refused',
      'Network is unreachable'
    ];

    const errorString = error.message + error.code;
    return networkIndicators.some(indicator =>
      errorString.includes(indicator)
    );
  }

  /**
   * Enhance error with retry information
   */
  static enhanceError(error, attempts, maxAttempts) {
    const enhanced = new Error(error.message);
    enhanced.originalError = error;
    enhanced.attempts = attempts;
    enhanced.maxAttempts = maxAttempts;
    enhanced.isNetworkError = this.isNetworkError(error);

    if (enhanced.isNetworkError) {
      enhanced.message = `Network error after ${attempts} attempts: ${error.message}`;
      enhanced.suggestion = 'Check your internet connection and try again';
    }

    return enhanced;
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Usage in git-sync-manager.mjs**:
```javascript
// Replace line 361
const output = await NetworkRetry.execWithRetry('git fetch origin', {
  cwd: this.worktreePath,
  retries: 3,
  timeout: 30000
});
```

**Files to create**:
- `/scripts/utils/network-retry.mjs` (new file)

**Files to modify**:
- `/scripts/git-sync-manager.mjs` (wrap git fetch, lines 361, 455-466)
- `/scripts/mcp-manager.mjs` (wrap npm commands, lines 170, 308-315)

---

### 7. Success Notifications for Silent Operations

**Problem**: No confirmation for operations that complete successfully (service start/stop, agent switch).

**Proposed Implementation**:

**Toast notification system** (new file):
```javascript
// /scripts/worktree-web/public/js/notifications.js
class NotificationManager {
  constructor() {
    this.container = this.createContainer();
  }

  createContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
  }

  show(message, options = {}) {
    const {
      type = 'info', // 'success', 'error', 'warning', 'info'
      duration = 5000,
      action = null // { label: 'Undo', handler: () => {} }
    } = options;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const icon = this.getIcon(type);
    const actionHtml = action
      ? `<button class="notification-action">${action.label}</button>`
      : '';

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-message">${message}</span>
      ${actionHtml}
      <button class="notification-close">×</button>
    `;

    this.container.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(notification), duration);
    }

    // Click handlers
    notification.querySelector('.notification-close').addEventListener('click', () => {
      this.dismiss(notification);
    });

    if (action) {
      notification.querySelector('.notification-action').addEventListener('click', () => {
        action.handler();
        this.dismiss(notification);
      });
    }

    return notification;
  }

  dismiss(notification) {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  success(message, options = {}) {
    return this.show(message, { ...options, type: 'success' });
  }

  error(message, options = {}) {
    return this.show(message, { ...options, type: 'error', duration: 10000 });
  }

  warning(message, options = {}) {
    return this.show(message, { ...options, type: 'warning' });
  }

  info(message, options = {}) {
    return this.show(message, { ...options, type: 'info' });
  }
}

// Global instance
window.notifications = new NotificationManager();
```

**CSS** (add to components.css):
```css
.notification-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

.notification {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateX(450px);
  opacity: 0;
  transition: all 0.3s ease;
}

.notification.show {
  transform: translateX(0);
  opacity: 1;
}

.notification-success {
  border-left: 4px solid var(--success-color);
}

.notification-error {
  border-left: 4px solid var(--error-color);
}

.notification-warning {
  border-left: 4px solid var(--warning-color);
}

.notification-info {
  border-left: 4px solid var(--info-color);
}
```

**Usage**:
```javascript
// After successful service start
notifications.success('Services started successfully');

// After service stop
notifications.success('Services stopped');

// After agent switch
notifications.success('Switched to Codex agent');

// After worktree deleted
notifications.success('Worktree deleted', {
  action: {
    label: 'Undo',
    handler: () => recreateWorktree()
  }
});
```

**Files to create**:
- `/scripts/worktree-web/public/js/notifications.js` (new file)

**Files to modify**:
- `/scripts/worktree-web/public/index.html` (add script tag)
- `/scripts/worktree-web/public/css/components.css` (add styles)
- All service action handlers (add success notifications)

---

### 8. npm Error Output Parsing

**Problem**: npm install errors show raw npm output which is difficult to parse.

**Proposed Implementation**:
```javascript
// /scripts/utils/npm-error-parser.mjs
export class NpmErrorParser {
  /**
   * Parse npm error output and extract useful information
   */
  static parse(error) {
    const output = error.stderr || error.stdout || error.message;

    // Check for common npm errors
    const patterns = {
      packageNotFound: /404.*'([^']+)' is not in the npm registry/,
      networkError: /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ERR_SOCKET_TIMEOUT/,
      permissionDenied: /EACCES|permission denied/i,
      diskFull: /ENOSPC|no space left on device/i,
      versionConflict: /Could not resolve dependency|conflicting peer dependency/i,
      integrityCheckFailed: /integrity checksum failed/i,
      unsupportedEngine: /Unsupported engine|requires node/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = output.match(pattern);
      if (match) {
        return this.createErrorInfo(type, match, output);
      }
    }

    // Unknown npm error
    return {
      type: 'unknown',
      message: 'npm install failed',
      details: this.extractRelevantLines(output),
      suggestion: 'Check npm logs for details: npm config get cache'
    };
  }

  static createErrorInfo(type, match, fullOutput) {
    const errorInfo = {
      packageNotFound: {
        message: `Package '${match[1]}' not found in npm registry`,
        suggestion: 'Check package name spelling or specify a version'
      },
      networkError: {
        message: 'Network error while downloading packages',
        suggestion: 'Check your internet connection and retry'
      },
      permissionDenied: {
        message: 'Permission denied while installing packages',
        suggestion: 'Run with sudo or fix npm permissions: npm config set prefix ~/.npm-global'
      },
      diskFull: {
        message: 'Not enough disk space to install packages',
        suggestion: 'Free up disk space or change npm cache location'
      },
      versionConflict: {
        message: 'Package version conflict detected',
        suggestion: 'Update package.json to resolve dependency conflicts'
      },
      integrityCheckFailed: {
        message: 'Package integrity check failed',
        suggestion: 'Clear npm cache: npm cache clean --force'
      },
      unsupportedEngine: {
        message: 'Node version incompatible with package requirements',
        suggestion: 'Update Node.js or check package.json engines field'
      }
    };

    const info = errorInfo[type];
    return {
      type,
      message: info.message,
      details: this.extractRelevantLines(fullOutput),
      suggestion: info.suggestion
    };
  }

  /**
   * Extract most relevant error lines from npm output
   */
  static extractRelevantLines(output) {
    const lines = output.split('\n');
    const relevantLines = [];

    // Look for error messages (lines starting with npm ERR!)
    const errorLines = lines.filter(line => line.includes('npm ERR!'));

    if (errorLines.length > 0) {
      // Get first 5 error lines
      relevantLines.push(...errorLines.slice(0, 5));
    } else {
      // Get last 10 lines of output
      relevantLines.push(...lines.slice(-10));
    }

    return relevantLines.join('\n');
  }
}
```

**Usage in smart-reload-manager.mjs**:
```javascript
// Replace line 232
} catch (error) {
  result.success = false;

  // Parse npm error for better messaging
  const npmError = NpmErrorParser.parse(error);

  result.error = npmError.message;
  result.details = npmError.details;
  result.suggestion = npmError.suggestion;
  result.output = error.stderr || error.stdout || '';

  return result;
}
```

**Files to create**:
- `/scripts/utils/npm-error-parser.mjs` (new file)

**Files to modify**:
- `/scripts/smart-reload-manager.mjs` (line 232)
- `/scripts/mcp-manager.mjs` (line 322)

---

## P2: Medium Priority (Implement within 1 month)

### 9. Operation Validation

**Problem**: No verification that operations actually succeeded (silent failures).

**Examples to implement**:

```javascript
// Validate service restart actually worked
async _waitForServiceHealth(worktreePath, serviceName, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const output = this.runtime.execCompose(`ps --format json`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const services = output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      const service = services.find(s => s.Service === serviceName);

      if (service && service.State === 'running' && service.Health === 'healthy') {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Service ${serviceName} failed health check after ${timeout}ms`);
}

// Validate npm install actually installed packages
async _validateDependencies(packageFile, worktreePath) {
  if (packageFile !== 'package.json') return true;

  try {
    // Check if node_modules exists and has content
    const nodeModulesPath = join(worktreePath, 'node_modules');
    const stats = statSync(nodeModulesPath);

    if (!stats.isDirectory()) {
      throw new Error('node_modules is not a directory');
    }

    // Count installed packages
    const packages = readdirSync(nodeModulesPath);
    const realPackages = packages.filter(p => !p.startsWith('.'));

    if (realPackages.length === 0) {
      throw new Error('No packages installed in node_modules');
    }

    return true;
  } catch (error) {
    throw new Error(`Dependency validation failed: ${error.message}`);
  }
}
```

---

### 10. Centralized Error Logging

**Problem**: No structured logging, errors only logged to console.

**Proposed Implementation**:
```javascript
// /scripts/utils/error-logger.mjs
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class ErrorLogger {
  constructor() {
    this.logDir = join(homedir(), '.vibe-worktrees', 'logs');
    this.logFile = join(this.logDir, 'errors.log');
    this._ensureLogDir();
  }

  _ensureLogDir() {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log error with context
   */
  log(error, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      error: {
        code: error.code,
        message: error.message,
        stack: error.stack
      },
      context: {
        operation: context.operation,
        worktree: context.worktree,
        user: process.env.USER,
        platform: process.platform,
        nodeVersion: process.version,
        ...context
      }
    };

    // Write to log file
    const logLine = JSON.stringify(entry) + '\n';
    appendFileSync(this.logFile, logLine);

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorLogger]', entry);
    }

    // Send to monitoring service (future enhancement)
    this._sendToMonitoring(entry);
  }

  _sendToMonitoring(entry) {
    // Future: Send to Sentry, LogRocket, etc.
  }

  /**
   * Get recent errors
   */
  getRecent(limit = 100) {
    if (!existsSync(this.logFile)) return [];

    try {
      const content = readFileSync(this.logFile, 'utf-8');
      const lines = content.trim().split('\n');
      const recent = lines.slice(-limit);

      return recent.map(line => JSON.parse(line));
    } catch (error) {
      console.error('Failed to read error log:', error);
      return [];
    }
  }
}

// Global instance
export const errorLogger = new ErrorLogger();
```

**Usage**:
```javascript
// In catch blocks
catch (error) {
  errorLogger.log(error, {
    operation: 'create_worktree',
    worktree: worktreeName,
    branch: branchName
  });

  return ErrorResponse.create({ ... });
}
```

---

## P3: Low Priority (Future enhancements)

### 11. Cancellation Support

**Implementation**: Add AbortController support for long operations.

### 12. Error Rate Monitoring

**Implementation**: Track error rates, alert on spikes.

### 13. Automatic Error Reporting

**Implementation**: Opt-in crash reporting to Sentry.

### 14. Error Knowledge Base

**Implementation**: Built-in error search with solutions.

### 15. Rollback Support

**Implementation**: Undo operations that partially failed.

---

## Implementation Plan

### Week 1: P0 Critical Fixes
- [ ] Docker daemon detection (#1)
- [ ] Disk space validation (#2)
- [ ] Standardized error responses (#3)
- [ ] Service restart loading (#4)

### Week 2: P1 High Priority
- [ ] Database copy progress (#5)
- [ ] Network retry logic (#6)
- [ ] Success notifications (#7)
- [ ] npm error parsing (#8)

### Week 3-4: P2 Medium Priority
- [ ] Operation validation (#9)
- [ ] Error logging (#10)

### Future: P3 Low Priority
- Cancellation, monitoring, reporting, knowledge base, rollbacks

---

## Testing Strategy

Each improvement should include:

1. **Unit tests** for new utility functions
2. **Integration tests** for error scenarios
3. **Manual testing** checklist for UI changes
4. **Error message review** by non-technical users

---

## Success Metrics

- **Reduce support tickets** related to confusing errors by 70%
- **Improve first-run success rate** from 60% to 95%
- **Reduce average time to diagnose errors** from 15min to 2min
- **Zero silent failures** in error logs
- **100% API endpoints** return standardized error format
