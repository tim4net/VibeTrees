# UX Improvement Recommendations

**Date**: 2025-10-28
**Scope**: User experience enhancements for VibeTrees web interface
**Priority**: High Impact → Low Effort recommendations

---

## Executive Summary

This document identifies **32 UX improvements** across 5 categories:
1. **Loading States** (11 improvements) - Show progress for long operations
2. **Success Feedback** (8 improvements) - Confirm successful operations
3. **Error Display** (6 improvements) - Make errors more helpful
4. **Progress Tracking** (4 improvements) - Show detailed progress
5. **Undo Capabilities** (3 improvements) - Allow reverting operations

**Quick Wins** (High impact, low effort):
- Service restart loading indicators
- Success toast notifications
- Error modal with suggestions
- Database copy progress bar
- Operation cancellation

---

## 1. Loading States

### Problem Statement

Users don't know when operations are in progress, leading to:
- Multiple clicks on action buttons
- Closing browser tab during long operations
- Uncertainty about system responsiveness
- Poor perceived performance

### Loading State Requirements

| Operation | Duration | Current State | Priority | Recommendation |
|-----------|----------|---------------|----------|----------------|
| Create worktree | 30-120s | Progress events ✅ | **Good** | Add percentage & ETA |
| Service restart | 2-10s | None | **Critical** | Add spinner immediately |
| Service rebuild | 30-300s | None | **High** | Add progress bar |
| Git sync | 5-30s | None | **High** | Add spinner & status |
| Database copy | 10-180s | Events but no % | **High** | Add progress bar |
| Bootstrap/npm install | 30-300s | Events but no % | **High** | Add progress bar |
| Docker compose up | 10-60s | Events ✅ | **Medium** | Add service-by-service status |
| Dependency install | 10-120s | None | **Medium** | Add progress bar |
| Migration run | 1-60s | None | **Medium** | Add spinner |
| Volume copy | 10-600s | Callback unused | **Medium** | Add progress bar |
| Conflict analysis | 1-10s | None | **Low** | Add spinner |
| Check for updates | 2-5s | None | **Low** | Add spinner |

### Implementation: Loading Indicator Component

```javascript
// /scripts/worktree-web/public/js/components/loading.js

class LoadingIndicator {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      type: options.type || 'spinner',  // 'spinner', 'progress', 'dots'
      message: options.message || 'Loading...',
      showPercentage: options.showPercentage || false,
      showETA: options.showETA || false,
      cancellable: options.cancellable || false,
      onCancel: options.onCancel || null
    };

    this.element = null;
    this.startTime = Date.now();
    this.percentage = 0;
  }

  show() {
    this.element = this.createElement();
    this.container.appendChild(this.element);

    // Animate in
    requestAnimationFrame(() => {
      this.element.classList.add('visible');
    });
  }

  hide() {
    if (!this.element) return;

    this.element.classList.remove('visible');
    setTimeout(() => {
      this.element?.remove();
      this.element = null;
    }, 300);
  }

  createElement() {
    const div = document.createElement('div');
    div.className = 'loading-indicator';

    let html = '';

    // Indicator (spinner, progress bar, or dots)
    if (this.options.type === 'spinner') {
      html += '<div class="loading-spinner"></div>';
    } else if (this.options.type === 'progress') {
      html += `
        <div class="loading-progress">
          <div class="loading-progress-bar" style="width: 0%"></div>
        </div>
      `;
    } else if (this.options.type === 'dots') {
      html += '<div class="loading-dots"><span></span><span></span><span></span></div>';
    }

    // Message
    html += `<div class="loading-message">${this.options.message}</div>`;

    // Details (percentage, ETA)
    if (this.options.showPercentage || this.options.showETA) {
      html += '<div class="loading-details">';

      if (this.options.showPercentage) {
        html += '<span class="loading-percentage">0%</span>';
      }

      if (this.options.showETA) {
        html += '<span class="loading-eta">Calculating...</span>';
      }

      html += '</div>';
    }

    // Cancel button
    if (this.options.cancellable) {
      html += '<button class="loading-cancel">Cancel</button>';
    }

    div.innerHTML = html;

    // Attach cancel handler
    if (this.options.cancellable) {
      div.querySelector('.loading-cancel').addEventListener('click', () => {
        this.options.onCancel?.();
        this.hide();
      });
    }

    return div;
  }

  updateProgress(percentage, message) {
    if (!this.element) return;

    this.percentage = percentage;

    // Update progress bar
    if (this.options.type === 'progress') {
      const bar = this.element.querySelector('.loading-progress-bar');
      if (bar) {
        bar.style.width = `${percentage}%`;
      }
    }

    // Update message
    if (message) {
      const messageEl = this.element.querySelector('.loading-message');
      if (messageEl) {
        messageEl.textContent = message;
      }
    }

    // Update percentage
    if (this.options.showPercentage) {
      const percentEl = this.element.querySelector('.loading-percentage');
      if (percentEl) {
        percentEl.textContent = `${Math.round(percentage)}%`;
      }
    }

    // Update ETA
    if (this.options.showETA) {
      const etaEl = this.element.querySelector('.loading-eta');
      if (etaEl) {
        const eta = this.calculateETA(percentage);
        etaEl.textContent = eta ? `${eta}s remaining` : 'Calculating...';
      }
    }
  }

  calculateETA(percentage) {
    if (percentage === 0) return null;

    const elapsed = Date.now() - this.startTime;
    const total = elapsed / (percentage / 100);
    const remaining = total - elapsed;

    return Math.round(remaining / 1000);
  }
}
```

**CSS**:
```css
.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: var(--surface-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.3s, transform 0.3s;
}

.loading-indicator.visible {
  opacity: 1;
  transform: scale(1);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-progress {
  width: 100%;
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.loading-progress-bar {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.3s ease;
}

.loading-message {
  font-weight: 500;
  color: var(--text-color);
}

.loading-details {
  display: flex;
  gap: 16px;
  font-size: 0.9em;
  color: var(--text-secondary);
}

.loading-cancel {
  margin-top: 8px;
  padding: 6px 16px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
}

.loading-cancel:hover {
  background: var(--hover-color);
}
```

**Usage Examples**:

```javascript
// Simple spinner
const loading = new LoadingIndicator(container, {
  type: 'spinner',
  message: 'Restarting service...'
});
loading.show();

// Progress bar with percentage and ETA
const loading = new LoadingIndicator(container, {
  type: 'progress',
  message: 'Copying database...',
  showPercentage: true,
  showETA: true
});
loading.show();

// Update progress
ws.on('message', (data) => {
  if (data.event === 'worktree:progress' && data.data.progress) {
    loading.updateProgress(
      data.data.progress.percentage,
      data.data.message
    );
  }
});

// Cancellable operation
const loading = new LoadingIndicator(container, {
  type: 'progress',
  message: 'Building services...',
  cancellable: true,
  onCancel: () => {
    abortController.abort();
  }
});
```

---

## 2. Success Feedback

### Problem Statement

Many operations complete silently, leaving users uncertain if their action succeeded:
- Service started/stopped
- Agent switched
- Settings saved
- Dependencies installed
- Migrations run

### Success Notification Requirements

| Operation | Current | Priority | Notification Type |
|-----------|---------|----------|-------------------|
| Worktree created | Broadcast ✅ | **Good** | Keep existing |
| Worktree deleted | Broadcast ✅ | **Good** | Add undo option |
| Services started | Silent | **Critical** | Toast with details |
| Services stopped | Silent | **Critical** | Toast |
| Service restarted | Silent | **Critical** | Toast |
| Service rebuilt | Silent | **High** | Toast with duration |
| Agent switched | Silent | **High** | Toast + terminal message |
| Git synced | Broadcast ✅ | **Medium** | Add change summary |
| Conflicts resolved | Broadcast ✅ | **Medium** | Keep existing |
| Dependencies installed | Silent | **Medium** | Toast with count |
| Migrations run | Silent | **Medium** | Toast with count |
| Settings saved | Silent | **Low** | Toast |

### Implementation: Toast Notification System

See [error-handling-improvements.md](/docs/error-handling-improvements.md#7-success-notifications-for-silent-operations) for complete toast notification implementation.

**Additional Success Templates**:

```javascript
// After service operations
notifications.success('API service started', {
  duration: 3000,
  action: {
    label: 'View Logs',
    handler: () => openServiceLogs('api')
  }
});

notifications.success('3 services restarted', {
  duration: 3000
});

// After agent switch
notifications.success('Switched to Codex agent', {
  duration: 3000,
  action: {
    label: 'Open Terminal',
    handler: () => openTerminal(worktreeName)
  }
});

// After sync with change summary
notifications.success('Synced with main: 5 commits, 23 files changed', {
  duration: 5000,
  action: {
    label: 'View Changes',
    handler: () => showChangeDetails()
  }
});

// After dependencies installed
notifications.success('Installed 47 packages in 32s', {
  duration: 4000
});

// After migrations
notifications.success('Ran 3 database migrations', {
  duration: 4000,
  action: {
    label: 'View Details',
    handler: () => showMigrationDetails()
  }
});
```

---

## 3. Error Display Improvements

### Problem Statement

Current error handling issues:
- Errors shown only in console (not visible to users)
- Generic error messages without context
- No suggestions for fixing errors
- Stack traces shown to users
- No way to copy error for support

### Error Modal Implementation

```javascript
// /scripts/worktree-web/public/js/components/error-modal.js

class ErrorModal {
  constructor() {
    this.modal = null;
  }

  show(error) {
    this.hide(); // Close existing modal

    this.modal = this.createElement(error);
    document.body.appendChild(this.modal);

    // Animate in
    requestAnimationFrame(() => {
      this.modal.classList.add('visible');
    });

    // Auto-dismiss for non-critical errors
    if (error.severity !== 'critical') {
      setTimeout(() => this.hide(), 10000);
    }
  }

  hide() {
    if (!this.modal) return;

    this.modal.classList.remove('visible');
    setTimeout(() => {
      this.modal?.remove();
      this.modal = null;
    }, 300);
  }

  createElement(error) {
    const div = document.createElement('div');
    div.className = 'error-modal-overlay';

    const severityClass = error.severity || 'error';
    const icon = this.getIcon(error.severity);

    div.innerHTML = `
      <div class="error-modal ${severityClass}">
        <div class="error-modal-header">
          <span class="error-modal-icon">${icon}</span>
          <h3 class="error-modal-title">${error.title || 'Error'}</h3>
          <button class="error-modal-close">×</button>
        </div>

        <div class="error-modal-body">
          <p class="error-modal-message">${error.message}</p>

          ${error.suggestion ? `
            <div class="error-modal-suggestion">
              <strong>💡 Suggestion:</strong> ${error.suggestion}
            </div>
          ` : ''}

          ${error.code ? `
            <div class="error-modal-code">
              <strong>Error Code:</strong> ${error.code}
            </div>
          ` : ''}

          ${error.details ? `
            <details class="error-modal-details">
              <summary>Technical Details</summary>
              <pre><code>${JSON.stringify(error.details, null, 2)}</code></pre>
            </details>
          ` : ''}
        </div>

        <div class="error-modal-footer">
          ${error.documentation ? `
            <a href="${error.documentation}" target="_blank" class="error-modal-docs">
              📖 Documentation
            </a>
          ` : ''}

          <button class="error-modal-copy">Copy Error</button>

          ${error.retry ? `
            <button class="error-modal-retry primary">Retry</button>
          ` : ''}

          <button class="error-modal-dismiss">Dismiss</button>
        </div>
      </div>
    `;

    // Event handlers
    div.querySelector('.error-modal-close').addEventListener('click', () => this.hide());
    div.querySelector('.error-modal-dismiss').addEventListener('click', () => this.hide());

    div.querySelector('.error-modal-copy')?.addEventListener('click', () => {
      this.copyError(error);
    });

    div.querySelector('.error-modal-retry')?.addEventListener('click', () => {
      error.retry();
      this.hide();
    });

    // Click overlay to close
    div.addEventListener('click', (e) => {
      if (e.target === div) this.hide();
    });

    return div;
  }

  getIcon(severity) {
    const icons = {
      critical: '🚨',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[severity] || icons.error;
  }

  copyError(error) {
    const text = `
Error: ${error.title || 'Unknown Error'}
Message: ${error.message}
Code: ${error.code || 'N/A'}
${error.suggestion ? `Suggestion: ${error.suggestion}` : ''}
${error.details ? `Details:\n${JSON.stringify(error.details, null, 2)}` : ''}
Timestamp: ${new Date().toISOString()}
    `.trim();

    navigator.clipboard.writeText(text);
    notifications.success('Error details copied to clipboard');
  }
}

// Global instance
window.errorModal = new ErrorModal();
```

**Usage**:
```javascript
// Show user-friendly error
errorModal.show({
  title: 'Failed to restart service',
  message: 'The API service could not be restarted',
  suggestion: 'Check if port 3000 is already in use',
  code: 'DOCKER_SERVICE_FAILED',
  severity: 'error',
  documentation: 'https://docs.vibetrees.dev/troubleshooting/services',
  details: {
    service: 'api',
    worktree: 'feature-auth',
    port: 3000
  },
  retry: () => retryServiceRestart()
});
```

---

## 4. Progress Tracking Enhancements

### Current Progress Events

```javascript
// Current format (good structure, needs enhancement)
{
  event: 'worktree:progress',
  data: {
    name: 'feature-auth',
    step: 'database',
    message: 'Copying database files...'
    // Missing: percentage, ETA, total size, current size
  }
}
```

### Enhanced Progress Format

```javascript
{
  event: 'worktree:progress',
  data: {
    name: 'feature-auth',
    operation: 'create_worktree',  // New: operation type
    step: 'database',
    stepNumber: 3,                   // New: current step
    totalSteps: 6,                   // New: total steps
    message: 'Copying database files...',
    progress: {                      // New: detailed progress
      percentage: 45,                // 0-100
      current: 450,                  // Current units
      total: 1000,                   // Total units
      unit: 'MB',                    // 'MB', 'files', 'packages', etc.
      eta: 30,                       // Seconds remaining
      rate: 15,                      // Units per second
      startedAt: '2025-10-28T10:00:00Z'
    },
    cancellable: true,               // New: can this be cancelled?
    cancelToken: 'abc123'            // New: token to cancel with
  }
}
```

### Progress Visualization Component

```javascript
// /scripts/worktree-web/public/js/components/progress-tracker.js

class ProgressTracker {
  constructor(container) {
    this.container = container;
    this.operations = new Map(); // Track multiple operations
  }

  startOperation(operationId, options) {
    const tracker = this.createTracker(operationId, options);
    this.operations.set(operationId, tracker);
    this.container.appendChild(tracker.element);

    return {
      update: (data) => this.updateProgress(operationId, data),
      complete: () => this.completeOperation(operationId),
      fail: (error) => this.failOperation(operationId, error),
      cancel: () => this.cancelOperation(operationId)
    };
  }

  createTracker(operationId, options) {
    const element = document.createElement('div');
    element.className = 'progress-tracker';
    element.dataset.operationId = operationId;

    element.innerHTML = `
      <div class="progress-tracker-header">
        <span class="progress-tracker-title">${options.title}</span>
        <span class="progress-tracker-status">Starting...</span>
      </div>

      <div class="progress-tracker-steps">
        ${options.steps.map((step, i) => `
          <div class="progress-step" data-step="${i}">
            <div class="progress-step-indicator"></div>
            <span class="progress-step-label">${step}</span>
          </div>
        `).join('')}
      </div>

      <div class="progress-tracker-bar">
        <div class="progress-tracker-fill" style="width: 0%"></div>
        <span class="progress-tracker-percentage">0%</span>
      </div>

      <div class="progress-tracker-details">
        <span class="progress-tracker-message"></span>
        <span class="progress-tracker-eta"></span>
      </div>

      ${options.cancellable ? `
        <button class="progress-tracker-cancel">Cancel</button>
      ` : ''}
    `;

    return {
      element,
      options,
      startTime: Date.now()
    };
  }

  updateProgress(operationId, data) {
    const tracker = this.operations.get(operationId);
    if (!tracker) return;

    const { element } = tracker;

    // Update current step
    if (data.stepNumber !== undefined) {
      element.querySelectorAll('.progress-step').forEach((step, i) => {
        if (i < data.stepNumber) {
          step.classList.add('completed');
        } else if (i === data.stepNumber) {
          step.classList.add('active');
        }
      });
    }

    // Update progress bar
    if (data.progress?.percentage !== undefined) {
      const fill = element.querySelector('.progress-tracker-fill');
      const percentage = element.querySelector('.progress-tracker-percentage');

      fill.style.width = `${data.progress.percentage}%`;
      percentage.textContent = `${Math.round(data.progress.percentage)}%`;
    }

    // Update message
    if (data.message) {
      element.querySelector('.progress-tracker-message').textContent = data.message;
    }

    // Update ETA
    if (data.progress?.eta) {
      const eta = this.formatETA(data.progress.eta);
      element.querySelector('.progress-tracker-eta').textContent = eta;
    }

    // Update status
    const status = element.querySelector('.progress-tracker-status');
    status.textContent = this.getStatusText(data);
  }

  getStatusText(data) {
    if (data.progress) {
      const { current, total, unit } = data.progress;
      return `${current} / ${total} ${unit}`;
    }
    return 'In progress...';
  }

  formatETA(seconds) {
    if (seconds < 60) {
      return `${seconds}s remaining`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s remaining`;
  }

  completeOperation(operationId) {
    const tracker = this.operations.get(operationId);
    if (!tracker) return;

    tracker.element.classList.add('completed');
    tracker.element.querySelector('.progress-tracker-status').textContent = 'Completed';

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.removeOperation(operationId);
    }, 3000);
  }

  failOperation(operationId, error) {
    const tracker = this.operations.get(operationId);
    if (!tracker) return;

    tracker.element.classList.add('failed');
    tracker.element.querySelector('.progress-tracker-status').textContent = 'Failed';
    tracker.element.querySelector('.progress-tracker-message').textContent = error.message;
  }

  cancelOperation(operationId) {
    const tracker = this.operations.get(operationId);
    if (!tracker) return;

    tracker.element.classList.add('cancelled');
    this.removeOperation(operationId);
  }

  removeOperation(operationId) {
    const tracker = this.operations.get(operationId);
    if (!tracker) return;

    tracker.element.classList.add('removing');
    setTimeout(() => {
      tracker.element.remove();
      this.operations.delete(operationId);
    }, 300);
  }
}
```

**Usage**:
```javascript
// Start tracking worktree creation
const progress = progressTracker.startOperation('create-feature-auth', {
  title: 'Creating worktree: feature-auth',
  steps: ['Git', 'Ports', 'Database', 'Bootstrap', 'Containers'],
  cancellable: true
});

// Update on WebSocket events
ws.on('message', (data) => {
  if (data.event === 'worktree:progress') {
    progress.update(data.data);
  }
});

// Complete
progress.complete();
```

---

## 5. Undo Capabilities

### Undoable Operations

| Operation | Current | Priority | Undo Implementation |
|-----------|---------|----------|-------------------|
| Worktree deleted | No undo | **High** | Store branch name + ask if push remote |
| Service stopped | No undo | **Medium** | One-click restart with same config |
| Config changed | No undo | **Medium** | Keep previous config, offer revert |
| Agent switched | No undo | **Low** | Remember previous agent per worktree |
| Git sync | Rollback exists ✅ | **Good** | Keep existing rollback feature |

### Implementation: Undo Manager

```javascript
// /scripts/worktree-web/public/js/utils/undo-manager.js

class UndoManager {
  constructor() {
    this.stack = [];
    this.maxSize = 10;
  }

  /**
   * Add undoable action
   */
  push(action) {
    this.stack.push({
      ...action,
      timestamp: Date.now()
    });

    // Limit stack size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }

    // Show undo notification
    notifications.success(action.successMessage, {
      duration: 10000,
      action: {
        label: 'Undo',
        handler: () => this.undo()
      }
    });
  }

  /**
   * Undo last action
   */
  async undo() {
    if (this.stack.length === 0) {
      notifications.warning('Nothing to undo');
      return;
    }

    const action = this.stack.pop();

    try {
      await action.undo();
      notifications.success(action.undoMessage || 'Action undone');
    } catch (error) {
      notifications.error(`Failed to undo: ${error.message}`);
      // Put it back on the stack
      this.stack.push(action);
    }
  }

  /**
   * Clear undo stack
   */
  clear() {
    this.stack = [];
  }
}

// Global instance
window.undoManager = new UndoManager();
```

**Usage Examples**:

```javascript
// After deleting worktree
undoManager.push({
  type: 'delete_worktree',
  successMessage: 'Worktree deleted',
  undoMessage: 'Worktree restored',
  data: {
    name: worktreeName,
    branch: branchName,
    fromBranch: 'main'
  },
  undo: async () => {
    await fetch('/api/worktrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchName: branchName,
        fromBranch: 'main'
      })
    });
  }
});

// After stopping services
undoManager.push({
  type: 'stop_services',
  successMessage: 'Services stopped',
  undoMessage: 'Services restarted',
  data: { worktree: worktreeName },
  undo: async () => {
    await fetch(`/api/worktrees/${worktreeName}/services/start`, {
      method: 'POST'
    });
  }
});

// After config change
undoManager.push({
  type: 'config_change',
  successMessage: 'Settings saved',
  undoMessage: 'Settings restored',
  data: {
    previous: previousConfig,
    current: currentConfig
  },
  undo: async () => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previousConfig)
    });
  }
});
```

---

## 6. Additional UX Improvements

### 6.1 Keyboard Shortcuts

Add common keyboard shortcuts for power users:

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Quick command palette |
| `Ctrl+N` | Create new worktree |
| `Ctrl+,` | Open settings |
| `Ctrl+/` | Show keyboard shortcuts |
| `Esc` | Close modals/dismiss notifications |
| `Tab` | Navigate between worktrees |
| `Ctrl+R` | Refresh worktree list |

### 6.2 Empty States

Improve empty states with helpful guidance:

**No worktrees**:
```html
<div class="empty-state">
  <div class="empty-state-icon">🌲</div>
  <h3>No worktrees yet</h3>
  <p>Create your first worktree to get started with parallel development</p>
  <button class="primary" onclick="showCreateModal()">
    Create Worktree
  </button>
  <a href="/docs/getting-started">Learn more</a>
</div>
```

**No services running**:
```html
<div class="empty-state">
  <div class="empty-state-icon">🐳</div>
  <h3>No services running</h3>
  <p>Start Docker services to enable your development environment</p>
  <button class="primary" onclick="startServices()">
    Start Services
  </button>
</div>
```

### 6.3 Contextual Help

Add help hints throughout the UI:

```javascript
// Tooltip component
<span class="help-hint" data-tooltip="Branch name for the new worktree">
  <input type="text" placeholder="feature-auth">
  <span class="help-icon">?</span>
</span>
```

### 6.4 Operation Queue

Show pending operations in a queue:

```html
<div class="operation-queue">
  <div class="operation-queue-header">
    <span>Operations (2 pending)</span>
    <button onclick="clearQueue()">Clear All</button>
  </div>

  <div class="operation-queue-item active">
    <div class="operation-icon">⏳</div>
    <div class="operation-details">
      <div class="operation-title">Creating worktree: feature-auth</div>
      <div class="operation-progress">45%</div>
    </div>
    <button class="operation-cancel">×</button>
  </div>

  <div class="operation-queue-item">
    <div class="operation-icon">⏸</div>
    <div class="operation-details">
      <div class="operation-title">Rebuilding API service</div>
      <div class="operation-status">Waiting...</div>
    </div>
  </div>
</div>
```

---

## 7. Implementation Priority Matrix

| Improvement | Impact | Effort | Priority | Timeline |
|------------|--------|--------|----------|----------|
| Service restart loading | High | Low | **Critical** | Week 1 |
| Success toast notifications | High | Low | **Critical** | Week 1 |
| Error modal with suggestions | High | Medium | **Critical** | Week 1 |
| Database copy progress | High | Medium | **High** | Week 2 |
| Operation cancellation | Medium | High | **High** | Week 2 |
| Undo for worktree deletion | Medium | Medium | **High** | Week 2 |
| Git sync progress | Medium | Low | **High** | Week 2 |
| Progress tracker component | High | High | **Medium** | Week 3 |
| Keyboard shortcuts | Medium | Medium | **Medium** | Week 3 |
| Empty states | Low | Low | **Low** | Week 4 |
| Contextual help | Low | Medium | **Low** | Future |
| Operation queue | Low | High | **Low** | Future |

---

## 8. Metrics to Track

### User Experience Metrics

- **Task Completion Rate**: % of operations that complete successfully
- **Time to Success**: Average time from starting operation to success
- **Error Recovery Rate**: % of errors that users successfully resolve
- **Feature Discovery**: % of users who find and use key features
- **User Satisfaction**: NPS score or satisfaction rating

### Technical Metrics

- **Loading State Coverage**: % of operations with loading indicators
- **Success Feedback Coverage**: % of operations with success confirmation
- **Error Clarity Score**: User rating of error message helpfulness
- **Undo Usage**: % of users who use undo feature
- **Support Ticket Reduction**: Decrease in UX-related support tickets

---

## 9. Testing Checklist

### Before Implementation

- [ ] Design mockups reviewed and approved
- [ ] Interaction flows documented
- [ ] Accessibility requirements defined (WCAG 2.1 AA)
- [ ] Mobile responsiveness planned
- [ ] Browser compatibility tested (Chrome, Firefox, Safari, Edge)

### During Implementation

- [ ] Loading states tested for all operations >500ms
- [ ] Success notifications shown for all user actions
- [ ] Error modals tested with real error scenarios
- [ ] Progress tracking verified with slow operations
- [ ] Undo tested for reversible operations
- [ ] Keyboard shortcuts work consistently
- [ ] Empty states shown when appropriate

### After Implementation

- [ ] User testing with 5+ users
- [ ] Accessibility audit passed
- [ ] Performance impact measured (< 50ms overhead)
- [ ] Browser testing across all targets
- [ ] Mobile testing on real devices
- [ ] Metrics tracking implemented
- [ ] Documentation updated

---

## 10. Resources

- [Loading Indicator Component](/scripts/worktree-web/public/js/components/loading.js)
- [Toast Notifications](/scripts/worktree-web/public/js/notifications.js)
- [Error Modal Component](/scripts/worktree-web/public/js/components/error-modal.js)
- [Progress Tracker Component](/scripts/worktree-web/public/js/components/progress-tracker.js)
- [Undo Manager](/scripts/worktree-web/public/js/utils/undo-manager.js)
- [Error Handling Guidelines](/docs/error-handling-guidelines.md)
