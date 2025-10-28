/**
 * Git Sync UI Module
 * Handles update checking, sync dialog, progress tracking, and results display
 */

// State management
const syncState = {
  updateChecks: {}, // worktreeName -> { hasUpdates, commitCount, commits, lastCheck }
  pollInterval: 5 * 60 * 1000, // 5 minutes
  pollTimer: null,
  activeSyncs: {} // worktreeName -> { inProgress: boolean }
};

/**
 * Initialize sync UI
 */
export function initSyncUI() {
  console.log('[sync-ui] Initializing sync UI');

  // Start background polling
  startBackgroundPolling();

  // Listen for worktree updates to refresh update checks
  if (window.appState) {
    window.appState.on('worktrees:updated', () => {
      checkAllWorktreesForUpdates();
    });

    // Listen for worktree selection changes to update the button
    window.appState.on('worktree:selected', (worktreeName) => {
      updateButtonForSelectedWorktree(worktreeName);
    });
  }

  // Initial check
  setTimeout(() => checkAllWorktreesForUpdates(), 2000);
}

/**
 * Update button display for the currently selected worktree
 */
function updateButtonForSelectedWorktree(worktreeName) {
  if (!worktreeName) {
    // Hide button if no worktree selected
    const syncButton = document.getElementById('sync-button');
    if (syncButton) {
      syncButton.style.display = 'none';
    }
    return;
  }

  // Check if we have update info for this worktree
  const updateData = syncState.updateChecks[worktreeName];
  if (updateData) {
    updateWorktreeUpdateBadge(worktreeName, updateData);
  } else {
    // Trigger a check for this worktree
    checkWorktreeForUpdates(worktreeName);
  }
}

/**
 * Start background polling for updates
 */
function startBackgroundPolling() {
  console.log('[sync-ui] Starting background polling every 5 minutes');

  // Clear existing timer
  if (syncState.pollTimer) {
    clearInterval(syncState.pollTimer);
  }

  // Set up new timer
  syncState.pollTimer = setInterval(() => {
    console.log('[sync-ui] Polling for updates...');
    checkAllWorktreesForUpdates();
  }, syncState.pollInterval);
}

/**
 * Check all worktrees for updates
 */
async function checkAllWorktreesForUpdates() {
  const worktrees = window.appState?.getWorktrees?.() || [];

  for (const worktree of worktrees) {
    // Skip main worktree
    if (worktree.isMain || !worktree.path.includes('.worktrees')) {
      continue;
    }

    await checkWorktreeForUpdates(worktree.name);
  }
}

/**
 * Check a specific worktree for updates
 */
async function checkWorktreeForUpdates(worktreeName) {
  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/check-updates`);
    const data = await response.json();

    // Store update info
    syncState.updateChecks[worktreeName] = {
      ...data,
      lastCheck: Date.now()
    };

    // Update UI badge
    updateWorktreeUpdateBadge(worktreeName, data);

    // Show toast notification if updates found (only if not first check)
    const isFirstCheck = !syncState.updateChecks[worktreeName]?.notifiedCommitCount;
    if (data.hasUpdates && data.commitCount > 0 && !isFirstCheck) {
      const previousCount = syncState.updateChecks[worktreeName]?.notifiedCommitCount || 0;
      if (data.commitCount > previousCount) {
        window.updateNotifications?.showUpdateNotification(worktreeName, data.commitCount);
        syncState.updateChecks[worktreeName].notifiedCommitCount = data.commitCount;
      }
    } else if (data.hasUpdates && data.commitCount > 0) {
      // Store initial count without showing notification
      syncState.updateChecks[worktreeName].notifiedCommitCount = data.commitCount;
    }

    return data;
  } catch (error) {
    console.error(`[sync-ui] Error checking updates for ${worktreeName}:`, error);
    return null;
  }
}

/**
 * Update the sync button in the sidebar
 */
function updateWorktreeUpdateBadge(worktreeName, updateData) {
  // Only update button for currently selected worktree
  const selectedWorktree = window.appState?.selectedWorktreeId;
  if (selectedWorktree !== worktreeName) {
    return;
  }

  const syncButton = document.getElementById('sync-button');
  if (!syncButton) return;

  if (updateData.hasUpdates && updateData.commitCount > 0) {
    // Show button with badge indicator
    syncButton.style.display = 'inline-flex';
    syncButton.setAttribute('data-worktree', worktreeName);
    syncButton.classList.add('has-updates');
    syncButton.title = `Sync worktree with remote (${updateData.commitCount} commit${updateData.commitCount !== 1 ? 's' : ''})`;

    // Re-initialize lucide icons
    if (window.lucide) window.lucide.createIcons();
  } else {
    // Hide button when no updates
    syncButton.style.display = 'none';
    syncButton.classList.remove('has-updates');
  }
}

/**
 * Handle sync button click - show sync dialog for selected worktree
 */
window.handleSyncButtonClick = function(event) {
  event.preventDefault();
  event.stopPropagation();

  const selectedWorktree = window.appState?.selectedWorktreeId;
  if (selectedWorktree) {
    window.syncUI?.showSyncDialog(selectedWorktree);
  }
};

/**
 * Show sync dialog
 */
export async function showSyncDialog(worktreeName) {
  console.log('[sync-ui] Showing sync dialog for', worktreeName);

  // Get or create modal
  let modal = document.getElementById('sync-modal');
  if (!modal) {
    modal = createSyncModal();
    document.body.appendChild(modal);
  }

  // Show loading state
  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Update Worktree: ${worktreeName}</div>
    <div class="loading-state">
      <div class="spinner"></div>
      <div>Loading updates...</div>
    </div>
  `;
  modal.classList.add('active');

  // Fetch update info
  const updateData = await checkWorktreeForUpdates(worktreeName);

  if (!updateData || !updateData.hasUpdates) {
    modal.querySelector('.sync-modal-content').innerHTML = `
      <div class="modal-title">Update Worktree: ${worktreeName}</div>
      <div style="padding: 20px; text-align: center; color: #8b949e;">
        <i data-lucide="check-circle" style="width: 48px; height: 48px; margin-bottom: 12px;"></i>
        <p>No updates available. This worktree is up to date!</p>
      </div>
      <div class="modal-actions">
        <button onclick="window.syncUI.hideSyncDialog()">Close</button>
      </div>
    `;

    // Reinit icons
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Check for uncommitted changes
  const worktrees = window.appState?.getWorktrees?.() || [];
  const worktree = worktrees.find(w => w.name === worktreeName);
  const hasUncommittedChanges = worktree?.gitStatus === 'uncommitted';

  // Render sync dialog
  renderSyncDialog(worktreeName, updateData, hasUncommittedChanges);
}

/**
 * Render sync dialog content
 */
function renderSyncDialog(worktreeName, updateData, hasUncommittedChanges) {
  const modal = document.getElementById('sync-modal');

  const warningHtml = hasUncommittedChanges ? `
    <div class="warning-box">
      <i data-lucide="alert-triangle" class="lucide-sm"></i>
      You have uncommitted changes. Consider stashing them before updating.
    </div>
  ` : '';

  const commitListHtml = updateData.commits?.map(commit => `
    <div class="commit-item">
      <div class="commit-header">
        <span class="commit-hash">${commit.hash?.substring(0, 7) || 'unknown'}</span>
        <span class="commit-author">${commit.author || 'Unknown'}</span>
        <span class="commit-time">${formatRelativeTime(commit.timestamp)}</span>
      </div>
      <div class="commit-message">${escapeHtml(commit.message || 'No message')}</div>
    </div>
  `).join('') || '<div style="color: #8b949e; padding: 12px;">No commit details available</div>';

  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Update Worktree: ${worktreeName}</div>

    ${warningHtml}

    <div class="sync-section">
      <h3>${updateData.commitCount} new commit${updateData.commitCount !== 1 ? 's' : ''} available</h3>
      <div class="commit-list">
        ${commitListHtml}
      </div>
    </div>

    <div class="sync-section">
      <h3>Sync Strategy</h3>
      <div class="strategy-options">
        <label class="radio-label">
          <input type="radio" name="sync-strategy" value="merge" checked>
          <div class="radio-content">
            <div class="radio-title">Merge</div>
            <div class="radio-description">Merge changes from the remote branch (recommended)</div>
          </div>
        </label>
        <label class="radio-label">
          <input type="radio" name="sync-strategy" value="rebase">
          <div class="radio-content">
            <div class="radio-title">Rebase</div>
            <div class="radio-description">Rebase your local commits on top of remote changes</div>
          </div>
        </label>
      </div>
    </div>

    <div class="sync-section">
      <h3>Options</h3>
      <label class="checkbox-label">
        <input type="checkbox" id="stash-changes" ${hasUncommittedChanges ? 'checked' : ''}>
        <div class="checkbox-content">
          <div class="checkbox-title">Stash changes before updating</div>
          <div class="checkbox-description">Save uncommitted changes and reapply after update</div>
        </div>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" id="restart-services" checked>
        <div class="checkbox-content">
          <div class="checkbox-title">Restart services after update</div>
          <div class="checkbox-description">Automatically restart Docker services if needed</div>
        </div>
      </label>
    </div>

    <div class="modal-actions">
      <button onclick="window.syncUI.hideSyncDialog()">Cancel</button>
      <button class="primary" onclick="window.syncUI.performSync('${worktreeName}')">Update Now</button>
    </div>
  `;

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hide sync dialog
 */
export function hideSyncDialog() {
  const modal = document.getElementById('sync-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Perform sync operation
 */
export async function performSync(worktreeName) {
  console.log('[sync-ui] Performing sync for', worktreeName);

  // Get selected options
  const strategy = document.querySelector('input[name="sync-strategy"]:checked')?.value || 'merge';
  const restartServices = document.getElementById('restart-services')?.checked ?? true;
  const stashChanges = document.getElementById('stash-changes')?.checked ?? false;

  // Mark as in progress
  syncState.activeSyncs[worktreeName] = { inProgress: true };

  // Show progress modal
  showSyncProgress(worktreeName);

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy,
        restartServices,
        stashChanges
      })
    });

    const result = await response.json();

    if (result.success) {
      // Show success
      showSyncSuccess(worktreeName, result);

      // Clear update check cache
      delete syncState.updateChecks[worktreeName];

      // Refresh worktrees
      if (window.refreshWorktrees) {
        await window.refreshWorktrees();
      }
    } else if (result.conflicts) {
      // Show conflict UI
      showSyncConflicts(worktreeName, result);
    } else {
      // Show error
      showSyncError(worktreeName, result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('[sync-ui] Sync error:', error);
    showSyncError(worktreeName, error.message);
  } finally {
    syncState.activeSyncs[worktreeName] = { inProgress: false };
  }
}

/**
 * Show sync progress
 */
function showSyncProgress(worktreeName) {
  const modal = document.getElementById('sync-modal');

  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Updating: ${worktreeName}</div>

    <div class="sync-progress">
      <div class="progress-spinner"></div>
      <div class="progress-text">Syncing with remote...</div>
      <div class="progress-detail">This may take a moment</div>
    </div>
  `;
}

/**
 * Show sync success
 */
function showSyncSuccess(worktreeName, result) {
  const modal = document.getElementById('sync-modal');

  const details = [];
  if (result.commitCount) {
    details.push(`${result.commitCount} commit${result.commitCount !== 1 ? 's' : ''} merged`);
  }
  if (result.depsInstalled) {
    details.push('Dependencies updated');
  }
  if (result.migrationsRun) {
    details.push('Database migrations applied');
  }
  if (result.servicesRestarted) {
    details.push('Services restarted');
  }

  const detailsHtml = details.length > 0 ? `
    <ul class="success-details">
      ${details.map(d => `<li>${d}</li>`).join('')}
    </ul>
  ` : '';

  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Update Complete</div>

    <div class="success-message">
      <i data-lucide="check-circle" style="width: 64px; height: 64px; color: #2ea043;"></i>
      <h3>Successfully updated ${worktreeName}</h3>
      ${detailsHtml}
    </div>

    <div class="modal-actions">
      <button class="primary" onclick="window.syncUI.hideSyncDialog()">Close</button>
    </div>
  `;

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Show sync error
 */
function showSyncError(worktreeName, errorMessage) {
  const modal = document.getElementById('sync-modal');

  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Update Failed</div>

    <div class="error-message">
      <i data-lucide="x-circle" style="width: 64px; height: 64px; color: #f85149;"></i>
      <h3>Failed to update ${worktreeName}</h3>
      <div class="error-detail">${escapeHtml(errorMessage)}</div>
    </div>

    <div class="modal-actions">
      <button onclick="window.syncUI.hideSyncDialog()">Close</button>
      <button onclick="window.syncUI.openAIHelperForError('${worktreeName}', 'claude', ${JSON.stringify(errorMessage)})" style="background: linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%); border-color: #1f6feb;">
        <i data-lucide="bot" class="lucide-sm"></i> Ask Claude
      </button>
      <button onclick="window.syncUI.openAIHelperForError('${worktreeName}', 'codex', ${JSON.stringify(errorMessage)})" style="background: linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%); border-color: #1f6feb;">
        <i data-lucide="sparkles" class="lucide-sm"></i> Ask Codex
      </button>
      <button class="primary" onclick="window.syncUI.showSyncDialog('${worktreeName}')">Try Again</button>
    </div>
  `;

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Show sync conflicts
 */
function showSyncConflicts(worktreeName, result) {
  const modal = document.getElementById('sync-modal');

  const conflictsHtml = result.conflicts?.map(conflict => `
    <div class="conflict-item">
      <div class="conflict-path">${escapeHtml(conflict.path)}</div>
      <div class="conflict-reason">${escapeHtml(conflict.reason || 'Merge conflict')}</div>
    </div>
  `).join('') || '';

  modal.querySelector('.sync-modal-content').innerHTML = `
    <div class="modal-title">Merge Conflicts Detected</div>

    <div class="conflict-warning">
      <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #d29922;"></i>
      <h3>The update resulted in merge conflicts</h3>
      <p>You need to resolve these conflicts before the update can complete.</p>
    </div>

    <div class="sync-section">
      <h3>Conflicted Files</h3>
      <div class="conflict-list">
        ${conflictsHtml}
      </div>
    </div>

    <div class="modal-actions">
      <button onclick="window.syncUI.rollbackSync('${worktreeName}')">Rollback</button>
      <button onclick="window.syncUI.openAIHelperForConflicts('${worktreeName}', 'claude', ${JSON.stringify(result.conflicts || [])})" style="background: linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%); border-color: #1f6feb;">
        <i data-lucide="bot" class="lucide-sm"></i> Ask Claude
      </button>
      <button onclick="window.syncUI.openAIHelperForConflicts('${worktreeName}', 'codex', ${JSON.stringify(result.conflicts || [])})" style="background: linear-gradient(135deg, #1f6feb 0%, #58a6ff 100%); border-color: #1f6feb;">
        <i data-lucide="sparkles" class="lucide-sm"></i> Ask Codex
      </button>
    </div>
  `;

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Rollback sync
 */
export async function rollbackSync(worktreeName) {
  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/rollback`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      showSyncSuccess(worktreeName, { commitCount: 0 });

      // Refresh
      if (window.refreshWorktrees) {
        await window.refreshWorktrees();
      }
    } else {
      showSyncError(worktreeName, result.message || 'Rollback failed');
    }
  } catch (error) {
    console.error('[sync-ui] Rollback error:', error);
    showSyncError(worktreeName, error.message);
  }
}

/**
 * Open terminal for conflict resolution
 */
export function openTerminalForConflicts(worktreeName) {
  hideSyncDialog();

  // Open shell terminal
  if (window.openShell) {
    window.openShell(worktreeName);
  }

  // Show notification
  setTimeout(() => {
    alert(`Shell opened for ${worktreeName}.\n\nResolve conflicts, then run:\n  git add <files>\n  git commit\n\nRefresh the page when done.`);
  }, 500);
}

/**
 * Open AI helper (Claude or Codex) with pre-generated prompt for general errors
 */
export async function openAIHelperForError(worktreeName, agent, errorMessage) {
  hideSyncDialog();

  // Build the prompt
  const prompt = `I got an error while trying to update/sync my worktree. Please help me fix it.

Worktree: ${worktreeName}
Error: ${errorMessage}

Please:
1. Help me understand what went wrong
2. Show me how to check the current state (git status, git log, etc.)
3. Suggest steps to fix this issue
4. Verify the fix works`;

  // Open the appropriate AI terminal
  if (agent === 'claude' && window.openClaude) {
    await window.openClaude(worktreeName);
  } else if (agent === 'codex' && window.openCodex) {
    await window.openCodex(worktreeName);
  }

  // Copy prompt to clipboard
  try {
    await navigator.clipboard.writeText(prompt);

    // Show notification
    setTimeout(() => {
      const agentName = agent === 'claude' ? 'Claude' : 'Codex';
      alert(`${agentName} terminal opened!\n\nA troubleshooting prompt has been copied to your clipboard.\nPaste it into the terminal to get AI help.`);
    }, 500);
  } catch (error) {
    console.error('[openAIHelperForError] Failed to copy to clipboard:', error);

    // Fallback: show the prompt in an alert
    setTimeout(() => {
      const agentName = agent === 'claude' ? 'Claude' : 'Codex';
      alert(`${agentName} terminal opened!\n\nUse this prompt:\n\n${prompt}`);
    }, 500);
  }
}

/**
 * Open AI helper (Claude or Codex) with pre-generated prompt for conflict resolution
 */
export async function openAIHelperForConflicts(worktreeName, agent, conflicts) {
  hideSyncDialog();

  // Build the prompt
  const conflictFiles = conflicts.map(c => c.path).join('\n  - ');
  const conflictDetails = conflicts.map(c => `File: ${c.path}\nReason: ${c.reason || 'Merge conflict'}`).join('\n\n');

  const prompt = `I have merge conflicts after pulling updates. Please help me resolve them.

Conflicted files:
  - ${conflictFiles}

Details:
${conflictDetails}

Please:
1. Show me the conflicts with git diff
2. Help me understand what changed
3. Guide me through resolving each conflict
4. Verify the resolution is correct`;

  // Open the appropriate AI terminal
  if (agent === 'claude' && window.openClaude) {
    await window.openClaude(worktreeName);
  } else if (agent === 'codex' && window.openCodex) {
    await window.openCodex(worktreeName);
  }

  // Copy prompt to clipboard
  try {
    await navigator.clipboard.writeText(prompt);

    // Show notification
    setTimeout(() => {
      const agentName = agent === 'claude' ? 'Claude' : 'Codex';
      alert(`${agentName} terminal opened!\n\nA conflict resolution prompt has been copied to your clipboard.\nPaste it into the terminal to get AI help.`);
    }, 500);
  } catch (error) {
    console.error('[openAIHelperForConflicts] Failed to copy to clipboard:', error);

    // Fallback: show the prompt in an alert
    setTimeout(() => {
      const agentName = agent === 'claude' ? 'Claude' : 'Codex';
      alert(`${agentName} terminal opened!\n\nUse this prompt:\n\n${prompt}`);
    }, 500);
  }
}

/**
 * Create sync modal element
 */
function createSyncModal() {
  const modal = document.createElement('div');
  modal.id = 'sync-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content sync-modal-content">
      <!-- Content will be inserted dynamically -->
    </div>
  `;
  return modal;
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';

  const now = Date.now();
  const date = new Date(timestamp);
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'just now';
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export to global scope
window.syncUI = {
  initSyncUI,
  showSyncDialog,
  hideSyncDialog,
  performSync,
  rollbackSync,
  openTerminalForConflicts,
  openAIHelperForError,
  openAIHelperForConflicts,
  checkWorktreeForUpdates
};

// Auto-initialize if appState exists
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSyncUI);
} else {
  initSyncUI();
}
