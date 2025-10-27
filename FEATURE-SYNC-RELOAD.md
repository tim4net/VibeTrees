# Feature: Sync & Reload

**Feature ID**: F-SYNC-001
**Priority**: High
**Phase**: 5 (Automatic Updates)
**Status**: Planning

---

## Overview

Add a one-click "Sync & Reload" button that:
1. Fetches latest changes from main/master branch
2. Merges changes into worktree
3. Detects what changed (docker-compose, dependencies, code)
4. Intelligently reloads only affected services
5. Shows progress and results to user

---

## User Story

**As a developer**, I want to sync my worktree with the latest main branch and automatically reload affected services, so that I can stay up-to-date without manual intervention.

**Acceptance Criteria**:
- ✓ Button visible on each worktree card
- ✓ Shows sync status (up-to-date, behind, ahead, diverged)
- ✓ One-click sync + reload operation
- ✓ Detects changes requiring service restart
- ✓ Minimal downtime (only restart affected services)
- ✓ Shows progress with detailed steps
- ✓ Handles merge conflicts gracefully
- ✓ Rollback on failure

---

## UI Design

### Worktree Card Updates

```
┌─────────────────────────────────────────────────┐
│ feature-auth (feature/authentication)           │
│                                                  │
│ Branch: 3 commits behind main ⚠️                │
│ Services: ✓ Running (api:3000, db:5432)         │
│ Agent: Claude Code ✓                            │
│                                                  │
│ [🔄 Sync & Reload]  [▶️ Open]  [⚙️ Config]      │
└─────────────────────────────────────────────────┘
```

**Status Badges**:
- `✓ Up to date` (green) - No sync needed
- `3 commits behind` (yellow) - Sync available
- `2 commits ahead` (blue) - Local changes not pushed
- `Diverged` (orange) - Both ahead and behind
- `Merge conflict` (red) - Manual intervention needed

### Sync Progress Modal

```
┌──────────────────────────────────────────────┐
│  Syncing feature-auth with main              │
├──────────────────────────────────────────────┤
│                                               │
│  ✓ Fetching latest from origin/main          │
│  ✓ Merging 3 commits                         │
│  ✓ Analyzing changes                         │
│  → Detected changes:                          │
│     • docker-compose.yml modified            │
│     • package.json updated                   │
│     • 15 code files changed                  │
│                                               │
│  → Reloading affected services...            │
│     ✓ Stopping api service                   │
│     ✓ Stopping worker service                │
│     ⏳ Running npm install (15s remaining)    │
│     ⏳ Starting api service                   │
│     ⏳ Starting worker service                │
│                                               │
│  [Cancel] (only before restart phase)        │
└──────────────────────────────────────────────┘
```

### Conflict Resolution Dialog

```
┌──────────────────────────────────────────────┐
│  ⚠️  Merge Conflict Detected                  │
├──────────────────────────────────────────────┤
│                                               │
│  Cannot auto-merge the following files:      │
│                                               │
│  • src/api/routes.ts                         │
│  • docker-compose.yml                        │
│  • package.json                              │
│                                               │
│  What would you like to do?                  │
│                                               │
│  [Open in Agent]  - Let AI resolve conflicts │
│  [Manual Resolve] - Open terminal in worktree│
│  [Abort Sync]     - Rollback all changes     │
│                                               │
└──────────────────────────────────────────────┘
```

---

## Backend Architecture

### New Module: `scripts/sync-reload.mjs`

```javascript
/**
 * Handles synchronization with base branch and intelligent service reloading
 */
export class SyncReloadManager {
  constructor(runtime, gitSync, worktreeManager) {
    this.runtime = runtime;         // ContainerRuntime instance
    this.gitSync = gitSync;         // GitSync instance
    this.worktreeManager = worktreeManager;
    this.changeDetector = new ChangeDetector();
  }

  /**
   * Main sync & reload operation
   */
  async syncAndReload(worktreeName, options = {}) {
    const worktree = this.worktreeManager.getWorktree(worktreeName);

    try {
      // Phase 1: Git sync
      this.emit('progress', { phase: 'fetch', message: 'Fetching latest...' });
      await this.gitSync.fetchUpstream(worktree);

      this.emit('progress', { phase: 'merge', message: 'Merging changes...' });
      const mergeResult = await this.gitSync.mergeUpstream(worktree, options.strategy);

      if (mergeResult.conflicts) {
        return this.handleConflicts(worktree, mergeResult);
      }

      // Phase 2: Analyze changes
      this.emit('progress', { phase: 'analyze', message: 'Analyzing changes...' });
      const changes = await this.changeDetector.analyze(worktree, mergeResult.commits);

      // Phase 3: Reload affected components
      await this.reloadAffected(worktree, changes);

      this.emit('complete', { worktree: worktreeName, changes });
      return { success: true, changes };

    } catch (error) {
      this.emit('error', { message: error.message });
      await this.rollback(worktree);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect what changed and what needs reloading
   */
  async analyzeChanges(worktree, commits) {
    const changedFiles = await this.gitSync.getChangedFiles(worktree, commits);

    return {
      dockerCompose: changedFiles.some(f => f.includes('docker-compose')),
      dependencies: changedFiles.some(f => f === 'package.json' || f === 'package-lock.json'),
      envFiles: changedFiles.some(f => f.includes('.env')),
      migrations: changedFiles.some(f => f.includes('/migrations/')),
      code: changedFiles.filter(f => !this.isConfigFile(f)),

      // What needs to happen
      needsServiceRestart: false,  // Set by logic below
      needsNpmInstall: false,
      needsMigrations: false
    };
  }

  /**
   * Intelligently reload only what's needed
   */
  async reloadAffected(worktree, changes) {
    // 1. Dependencies changed → npm install
    if (changes.dependencies) {
      this.emit('progress', { phase: 'npm', message: 'Installing dependencies...' });
      await this.runNpmInstall(worktree);
      changes.needsServiceRestart = true;
    }

    // 2. Docker compose changed → restart all services
    if (changes.dockerCompose) {
      this.emit('progress', { phase: 'docker', message: 'Restarting all services...' });
      await this.restartAllServices(worktree);
      return;
    }

    // 3. Env files changed → restart services that use them
    if (changes.envFiles) {
      changes.needsServiceRestart = true;
    }

    // 4. Migrations detected → offer to run
    if (changes.migrations) {
      const shouldRun = await this.promptMigrations(worktree);
      if (shouldRun) {
        await this.runMigrations(worktree);
      }
    }

    // 5. Code only → hot reload if supported, else restart
    if (changes.needsServiceRestart) {
      await this.restartAffectedServices(worktree, changes);
    } else {
      this.emit('progress', { phase: 'complete', message: 'Code updated (hot reload)' });
    }
  }

  /**
   * Restart only services affected by changes
   */
  async restartAffectedServices(worktree, changes) {
    const services = await this.detectAffectedServices(worktree, changes);

    for (const service of services) {
      this.emit('progress', {
        phase: 'restart',
        message: `Restarting ${service}...`,
        service
      });

      await this.runtime.exec(
        `${this.runtime.getComposeCommand()} restart ${service}`,
        { cwd: worktree.path }
      );
    }
  }

  /**
   * Detect which services need restart based on changed files
   */
  async detectAffectedServices(worktree, changes) {
    // Strategy: Map code files to services via heuristics
    const serviceMap = {
      'apps/api': 'api',
      'apps/worker': 'worker',
      'packages/shared': ['api', 'worker'],  // Restart all consumers
      'apps/console': 'console'
    };

    const affectedServices = new Set();

    for (const file of changes.code) {
      for (const [pattern, services] of Object.entries(serviceMap)) {
        if (file.startsWith(pattern)) {
          if (Array.isArray(services)) {
            services.forEach(s => affectedServices.add(s));
          } else {
            affectedServices.add(services);
          }
        }
      }
    }

    // If we can't determine, restart all
    if (affectedServices.size === 0 && changes.code.length > 0) {
      return this.getAllServices(worktree);
    }

    return Array.from(affectedServices);
  }

  /**
   * Handle merge conflicts
   */
  async handleConflicts(worktree, mergeResult) {
    return {
      success: false,
      conflicts: true,
      files: mergeResult.conflictFiles,
      actions: [
        { type: 'agent', label: 'Open in Agent' },
        { type: 'manual', label: 'Manual Resolve' },
        { type: 'abort', label: 'Abort Sync' }
      ]
    };
  }

  /**
   * Rollback on failure
   */
  async rollback(worktree) {
    this.emit('progress', { phase: 'rollback', message: 'Rolling back changes...' });
    await this.gitSync.abort(worktree);
  }
}

/**
 * Detects what changed between commits
 */
class ChangeDetector {
  async analyze(worktree, commits) {
    // Git diff to get changed files
    const changedFiles = await this.getChangedFiles(worktree, commits);

    // Categorize changes
    return {
      dockerCompose: this.hasDockerComposeChanges(changedFiles),
      dependencies: this.hasDependencyChanges(changedFiles),
      envFiles: this.hasEnvChanges(changedFiles),
      migrations: this.hasMigrations(changedFiles),
      code: this.getCodeFiles(changedFiles)
    };
  }

  async getChangedFiles(worktree, commits) {
    const output = execSync(
      `git diff --name-only ${commits.base}...${commits.head}`,
      { cwd: worktree.path, encoding: 'utf-8' }
    );
    return output.trim().split('\n').filter(Boolean);
  }

  hasDockerComposeChanges(files) {
    return files.some(f =>
      f === 'docker-compose.yml' ||
      f === 'docker-compose.yaml' ||
      f.startsWith('docker-compose.')
    );
  }

  hasDependencyChanges(files) {
    return files.some(f =>
      f === 'package.json' ||
      f === 'package-lock.json' ||
      f === 'yarn.lock' ||
      f === 'pnpm-lock.yaml'
    );
  }

  hasEnvChanges(files) {
    return files.some(f => f.endsWith('.env') || f.includes('.env.'));
  }

  hasMigrations(files) {
    return files.some(f =>
      f.includes('/migrations/') ||
      f.includes('/migrate/')
    );
  }

  getCodeFiles(files) {
    return files.filter(f =>
      !this.isConfigFile(f) &&
      (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx'))
    );
  }

  isConfigFile(file) {
    const configFiles = [
      'package.json', 'package-lock.json',
      'docker-compose.yml', 'docker-compose.yaml',
      '.env', '.env.local', '.env.production',
      'tsconfig.json', 'vitest.config.js'
    ];
    return configFiles.some(cf => file === cf || file.endsWith(`/${cf}`));
  }
}
```

---

## WebSocket API Updates

### New Events

**Client → Server**:
```javascript
// Check sync status for worktree
{
  event: 'sync:status',
  data: { name: 'feature-auth' }
}

// Start sync & reload
{
  event: 'sync:start',
  data: {
    name: 'feature-auth',
    strategy: 'merge',  // 'merge', 'rebase', or 'reset'
    autoRestart: true   // Auto-restart services without prompt
  }
}

// Handle conflict resolution
{
  event: 'sync:resolve-conflict',
  data: {
    name: 'feature-auth',
    action: 'agent'  // 'agent', 'manual', or 'abort'
  }
}

// Cancel sync operation
{
  event: 'sync:cancel',
  data: { name: 'feature-auth' }
}
```

**Server → Client**:
```javascript
// Sync status response
{
  event: 'sync:status',
  data: {
    name: 'feature-auth',
    status: 'behind',  // 'up-to-date', 'behind', 'ahead', 'diverged'
    behindBy: 3,
    aheadBy: 0,
    lastSync: '2025-10-26T10:30:00Z',
    lastCheck: '2025-10-26T11:00:00Z'
  }
}

// Progress updates
{
  event: 'sync:progress',
  data: {
    name: 'feature-auth',
    phase: 'merge',  // 'fetch', 'merge', 'analyze', 'npm', 'docker', 'restart'
    message: 'Merging 3 commits...',
    progress: 30  // Percentage (0-100)
  }
}

// Conflict detected
{
  event: 'sync:conflict',
  data: {
    name: 'feature-auth',
    files: ['src/api/routes.ts', 'docker-compose.yml'],
    actions: [
      { type: 'agent', label: 'Open in Agent' },
      { type: 'manual', label: 'Manual Resolve' },
      { type: 'abort', label: 'Abort Sync' }
    ]
  }
}

// Sync complete
{
  event: 'sync:complete',
  data: {
    name: 'feature-auth',
    changes: {
      commits: 3,
      filesChanged: 15,
      dockerCompose: true,
      dependencies: true,
      servicesRestarted: ['api', 'worker']
    },
    duration: 45  // seconds
  }
}

// Sync error
{
  event: 'sync:error',
  data: {
    name: 'feature-auth',
    error: 'Merge conflict requires manual resolution',
    rollback: true
  }
}
```

---

## Implementation Steps (TDD Approach)

### Step 1: Backend Tests

**File**: `scripts/sync-reload.test.mjs`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncReloadManager } from './sync-reload.mjs';
import { ChangeDetector } from './sync-reload.mjs';

describe('ChangeDetector', () => {
  it('should detect docker-compose changes', () => {
    const detector = new ChangeDetector();
    const files = ['docker-compose.yml', 'src/api.ts'];

    expect(detector.hasDockerComposeChanges(files)).toBe(true);
  });

  it('should detect dependency changes', () => {
    const detector = new ChangeDetector();
    const files = ['package.json', 'src/api.ts'];

    expect(detector.hasDependencyChanges(files)).toBe(true);
  });

  it('should detect migration files', () => {
    const detector = new ChangeDetector();
    const files = ['db/migrations/001_add_users.sql'];

    expect(detector.hasMigrations(files)).toBe(true);
  });

  it('should categorize code files correctly', () => {
    const detector = new ChangeDetector();
    const files = ['src/api.ts', 'package.json', 'README.md'];

    const codeFiles = detector.getCodeFiles(files);
    expect(codeFiles).toEqual(['src/api.ts']);
  });
});

describe('SyncReloadManager', () => {
  let manager;
  let mockRuntime;
  let mockGitSync;
  let mockWorktreeManager;

  beforeEach(() => {
    mockRuntime = {
      exec: vi.fn(),
      getComposeCommand: vi.fn(() => 'docker compose')
    };

    mockGitSync = {
      fetchUpstream: vi.fn(),
      mergeUpstream: vi.fn(),
      getChangedFiles: vi.fn(),
      abort: vi.fn()
    };

    mockWorktreeManager = {
      getWorktree: vi.fn(() => ({
        name: 'test-worktree',
        path: '/path/to/worktree'
      }))
    };

    manager = new SyncReloadManager(mockRuntime, mockGitSync, mockWorktreeManager);
  });

  it('should sync and reload successfully', async () => {
    mockGitSync.mergeUpstream.mockResolvedValue({
      success: true,
      commits: { base: 'abc123', head: 'def456' }
    });

    mockGitSync.getChangedFiles.mockResolvedValue(['src/api.ts']);

    const result = await manager.syncAndReload('test-worktree');

    expect(result.success).toBe(true);
    expect(mockGitSync.fetchUpstream).toHaveBeenCalled();
    expect(mockGitSync.mergeUpstream).toHaveBeenCalled();
  });

  it('should handle merge conflicts', async () => {
    mockGitSync.mergeUpstream.mockResolvedValue({
      conflicts: true,
      conflictFiles: ['src/api.ts', 'docker-compose.yml']
    });

    const result = await manager.syncAndReload('test-worktree');

    expect(result.success).toBe(false);
    expect(result.conflicts).toBe(true);
    expect(result.files).toHaveLength(2);
  });

  it('should restart services when dependencies change', async () => {
    mockGitSync.mergeUpstream.mockResolvedValue({
      success: true,
      commits: { base: 'abc', head: 'def' }
    });

    mockGitSync.getChangedFiles.mockResolvedValue(['package.json']);

    await manager.syncAndReload('test-worktree');

    expect(mockRuntime.exec).toHaveBeenCalledWith(
      expect.stringContaining('npm install'),
      expect.anything()
    );
  });

  it('should rollback on failure', async () => {
    mockGitSync.mergeUpstream.mockRejectedValue(new Error('Merge failed'));

    await manager.syncAndReload('test-worktree');

    expect(mockGitSync.abort).toHaveBeenCalled();
  });
});
```

### Step 2: Backend Implementation

Create `scripts/sync-reload.mjs` with the code above.

### Step 3: Integrate into Web Server

**File**: `scripts/worktree-web/server.mjs`

```javascript
import { SyncReloadManager } from '../sync-reload.mjs';

// In WorktreeManager constructor
this.syncReloadManager = new SyncReloadManager(
  this.runtime,
  this.gitSync,
  this
);

// Setup event forwarding
this.syncReloadManager.on('progress', (data) => {
  this.broadcast('sync:progress', data);
});

this.syncReloadManager.on('complete', (data) => {
  this.broadcast('sync:complete', data);
});

this.syncReloadManager.on('error', (data) => {
  this.broadcast('sync:error', data);
});

// WebSocket message handlers
async handleSyncStatus(data) {
  const status = await this.gitSync.checkForUpdates(data.name);
  ws.send(JSON.stringify({ event: 'sync:status', data: status }));
}

async handleSyncStart(data) {
  const result = await this.syncReloadManager.syncAndReload(
    data.name,
    { strategy: data.strategy }
  );

  if (result.conflicts) {
    this.broadcast('sync:conflict', result);
  }
}

async handleSyncResolveConflict(data) {
  if (data.action === 'agent') {
    // Open conflict files in agent terminal
    await this.openConflictsInAgent(data.name);
  } else if (data.action === 'manual') {
    // Just notify user to resolve manually
    this.broadcast('sync:manual-resolve', data);
  } else if (data.action === 'abort') {
    await this.syncReloadManager.rollback(data.name);
  }
}
```

### Step 4: Frontend UI Components

**File**: `scripts/worktree-web/public/js/sync-reload.js`

```javascript
class SyncReloadUI {
  constructor(worktreeName) {
    this.worktreeName = worktreeName;
    this.ws = getWebSocket();
    this.setupListeners();
  }

  setupListeners() {
    this.ws.on('sync:status', (data) => this.updateStatusBadge(data));
    this.ws.on('sync:progress', (data) => this.showProgress(data));
    this.ws.on('sync:conflict', (data) => this.showConflictDialog(data));
    this.ws.on('sync:complete', (data) => this.showSuccess(data));
    this.ws.on('sync:error', (data) => this.showError(data));
  }

  async checkStatus() {
    this.ws.send({
      event: 'sync:status',
      data: { name: this.worktreeName }
    });
  }

  async startSync(strategy = 'merge') {
    this.ws.send({
      event: 'sync:start',
      data: {
        name: this.worktreeName,
        strategy,
        autoRestart: true
      }
    });
  }

  updateStatusBadge(data) {
    const badge = document.querySelector(`#${this.worktreeName} .sync-badge`);

    if (data.status === 'up-to-date') {
      badge.innerHTML = '✓ Up to date';
      badge.className = 'sync-badge status-uptodate';
    } else if (data.status === 'behind') {
      badge.innerHTML = `${data.behindBy} commits behind`;
      badge.className = 'sync-badge status-behind';
    } else if (data.status === 'diverged') {
      badge.innerHTML = 'Diverged';
      badge.className = 'sync-badge status-diverged';
    }
  }

  showProgress(data) {
    const modal = document.getElementById('sync-modal');
    const phase = modal.querySelector('.phase');
    const message = modal.querySelector('.message');
    const progressBar = modal.querySelector('.progress-bar');

    phase.textContent = data.phase;
    message.textContent = data.message;
    progressBar.style.width = `${data.progress}%`;

    modal.style.display = 'block';
  }

  showConflictDialog(data) {
    const dialog = createConflictDialog(data);
    document.body.appendChild(dialog);

    dialog.querySelector('.action-agent').onclick = () => {
      this.ws.send({
        event: 'sync:resolve-conflict',
        data: { name: this.worktreeName, action: 'agent' }
      });
      dialog.remove();
    };

    dialog.querySelector('.action-abort').onclick = () => {
      this.ws.send({
        event: 'sync:resolve-conflict',
        data: { name: this.worktreeName, action: 'abort' }
      });
      dialog.remove();
    };
  }

  showSuccess(data) {
    const modal = document.getElementById('sync-modal');
    modal.querySelector('.message').textContent =
      `✓ Synced ${data.changes.commits} commits, restarted ${data.changes.servicesRestarted.length} services`;

    setTimeout(() => modal.style.display = 'none', 3000);
  }

  showError(data) {
    alert(`Sync failed: ${data.error}`);
    document.getElementById('sync-modal').style.display = 'none';
  }
}

// Add button to worktree card
function addSyncButton(worktreeCard, worktreeName) {
  const syncUI = new SyncReloadUI(worktreeName);

  const button = document.createElement('button');
  button.innerHTML = '🔄 Sync & Reload';
  button.className = 'btn-sync';
  button.onclick = () => syncUI.startSync();

  worktreeCard.querySelector('.actions').appendChild(button);

  // Check status periodically
  setInterval(() => syncUI.checkStatus(), 60000);  // Every minute
  syncUI.checkStatus();  // Initial check
}
```

### Step 5: CSS Styling

**File**: `scripts/worktree-web/public/css/sync-reload.css`

```css
.sync-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}

.status-uptodate {
  background: #22c55e;
  color: white;
}

.status-behind {
  background: #eab308;
  color: white;
}

.status-ahead {
  background: #3b82f6;
  color: white;
}

.status-diverged {
  background: #f97316;
  color: white;
}

.btn-sync {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-sync:hover {
  background: #4f46e5;
}

.btn-sync:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

#sync-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  min-width: 400px;
  max-width: 600px;
  z-index: 1000;
}

.progress-bar {
  height: 4px;
  background: #6366f1;
  transition: width 0.3s;
  border-radius: 2px;
}

.conflict-dialog {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 16px;
  margin: 16px 0;
}

.conflict-files {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}

.conflict-files li {
  padding: 4px 0;
  font-family: monospace;
  color: #dc2626;
}

.conflict-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
```

---

## Configuration

Add to `.vibe/config.json`:

```json
{
  "sync": {
    "enabled": true,
    "baseBranch": "main",
    "autoUpdate": false,
    "checkInterval": 60,  // seconds
    "strategy": "merge",  // "merge", "rebase", or "reset"
    "autoRestart": true,
    "notifications": true
  }
}
```

---

## Testing Checklist

- [ ] Unit tests for ChangeDetector
- [ ] Unit tests for SyncReloadManager
- [ ] Integration test: Sync with clean merge
- [ ] Integration test: Sync with conflicts
- [ ] Integration test: Docker compose changes trigger restart
- [ ] Integration test: Dependency changes trigger npm install
- [ ] Integration test: Code-only changes (no restart)
- [ ] UI test: Button appears on worktree card
- [ ] UI test: Status badge updates correctly
- [ ] UI test: Progress modal shows steps
- [ ] UI test: Conflict dialog appears on conflicts
- [ ] UI test: Success notification appears
- [ ] E2E test: Full sync & reload workflow
- [ ] Performance test: Large codebase sync time

---

## Success Metrics

- ✓ Sync & reload completes in < 60 seconds for typical changes
- ✓ Minimal downtime (< 10 seconds service restart)
- ✓ 95% of syncs complete without user intervention
- ✓ Clear progress indication at all times
- ✓ Zero data loss on rollback
- ✓ Handles conflicts gracefully

---

## Future Enhancements

1. **Smart Service Detection**: Learn which files affect which services
2. **Incremental Restart**: Rolling restart for zero-downtime deploys
3. **Dry Run Mode**: Preview changes before applying
4. **Scheduled Syncs**: Auto-sync at specified times
5. **Sync Profiles**: Different strategies per worktree
6. **Conflict AI Assistant**: Auto-resolve simple conflicts
7. **Sync History**: Track past syncs and changes
8. **Branch Switching**: Switch base branch dynamically

---

**Document Version**: 1.0
**Last Updated**: 2025-10-26
**Status**: Ready for Implementation
