/**
 * Conflict Resolution UI Module
 * Handles conflict detection and resolution interface
 */

/**
 * Show conflict resolution dialog
 */
export async function showConflictDialog(worktreeName) {
  console.log('[conflict-ui] Showing conflict dialog for', worktreeName);

  // Get or create modal
  let modal = document.getElementById('conflict-modal');
  if (!modal) {
    modal = createConflictModal();
    document.body.appendChild(modal);
  }

  // Show loading state
  modal.querySelector('.conflict-modal-content').innerHTML = `
    <div class="modal-title">Merge Conflicts: ${worktreeName}</div>
    <div class="loading-state">
      <div class="spinner"></div>
      <div>Checking for conflicts...</div>
    </div>
  `;
  modal.classList.add('active');

  try {
    // Fetch conflicts
    const response = await fetch(`/api/worktrees/${worktreeName}/conflicts`);
    const data = await response.json();

    if (!data.conflicts || data.conflicts.length === 0) {
      // No conflicts
      modal.querySelector('.conflict-modal-content').innerHTML = `
        <div class="modal-title">Merge Conflicts: ${worktreeName}</div>
        <div style="padding: 20px; text-align: center; color: #8b949e;">
          <i data-lucide="check-circle" style="width: 48px; height: 48px; margin-bottom: 12px; color: #2ea043;"></i>
          <p>No conflicts detected. All clear!</p>
        </div>
        <div class="modal-actions">
          <button class="primary" onclick="window.conflictUI.hideConflictDialog()">Close</button>
        </div>
      `;
    } else {
      // Render conflicts
      renderConflictDialog(worktreeName, data.conflicts);
    }

    // Reinit icons
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.error('[conflict-ui] Error fetching conflicts:', error);
    modal.querySelector('.conflict-modal-content').innerHTML = `
      <div class="modal-title">Merge Conflicts: ${worktreeName}</div>
      <div class="error-message">
        <i data-lucide="x-circle" style="width: 48px; height: 48px; color: #f85149;"></i>
        <h3>Failed to check conflicts</h3>
        <div class="error-detail">${escapeHtml(error.message)}</div>
      </div>
      <div class="modal-actions">
        <button onclick="window.conflictUI.hideConflictDialog()">Close</button>
      </div>
    `;

    // Reinit icons
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Render conflict dialog content
 */
function renderConflictDialog(worktreeName, conflicts) {
  const modal = document.getElementById('conflict-modal');

  const conflictsHtml = conflicts.map(conflict => `
    <div class="conflict-item">
      <div class="conflict-header">
        <i data-lucide="alert-triangle" class="lucide-sm" style="color: #d29922;"></i>
        <span class="conflict-path">${escapeHtml(conflict.path)}</span>
      </div>
      <div class="conflict-reason">${escapeHtml(conflict.reason || 'Merge conflict')}</div>
    </div>
  `).join('');

  modal.querySelector('.conflict-modal-content').innerHTML = `
    <div class="modal-title">Merge Conflicts: ${worktreeName}</div>

    <div class="conflict-warning">
      <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #d29922;"></i>
      <h3>${conflicts.length} file${conflicts.length !== 1 ? 's' : ''} with conflicts</h3>
      <p>Choose how to resolve these conflicts:</p>
    </div>

    <div class="conflict-section">
      <h3>Conflicted Files</h3>
      <div class="conflict-list">
        ${conflictsHtml}
      </div>
    </div>

    <div class="conflict-actions">
      <div class="conflict-action-card" onclick="window.conflictUI.handleRollback('${worktreeName}')">
        <i data-lucide="undo" class="conflict-action-icon"></i>
        <div class="conflict-action-title">Rollback Changes</div>
        <div class="conflict-action-description">
          Undo the sync and return to previous state
        </div>
      </div>

      <div class="conflict-action-card" onclick="window.conflictUI.handleAIResolve('${worktreeName}')">
        <i data-lucide="sparkles" class="conflict-action-icon"></i>
        <div class="conflict-action-title">AI Assist</div>
        <div class="conflict-action-description">
          Let AI attempt to resolve simple conflicts
        </div>
      </div>

      <div class="conflict-action-card" onclick="window.conflictUI.handleManualResolve('${worktreeName}')">
        <i data-lucide="terminal" class="conflict-action-icon"></i>
        <div class="conflict-action-title">Open Terminal</div>
        <div class="conflict-action-description">
          Manually resolve conflicts in shell
        </div>
      </div>
    </div>

    <div class="modal-actions">
      <button onclick="window.conflictUI.hideConflictDialog()">Close</button>
    </div>
  `;

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hide conflict dialog
 */
export function hideConflictDialog() {
  const modal = document.getElementById('conflict-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Handle rollback action
 */
export async function handleRollback(worktreeName) {
  if (!confirm(`Rollback sync for ${worktreeName}?\n\nThis will undo the sync operation and return to the previous state.`)) {
    return;
  }

  hideConflictDialog();

  // Use sync UI rollback
  if (window.syncUI) {
    window.syncUI.rollbackSync(worktreeName);
  }
}

/**
 * Handle AI resolve action
 */
export async function handleAIResolve(worktreeName) {
  console.log('[conflict-ui] Attempting AI resolution for', worktreeName);

  hideConflictDialog();

  // Show progress
  const modal = document.getElementById('conflict-modal');
  modal.querySelector('.conflict-modal-content').innerHTML = `
    <div class="modal-title">AI Conflict Resolution</div>
    <div class="sync-progress">
      <div class="progress-spinner"></div>
      <div class="progress-text">AI is analyzing conflicts...</div>
      <div class="progress-detail">This may take a moment</div>
    </div>
  `;
  modal.classList.add('active');

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/conflicts/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'ai' })
    });

    const result = await response.json();

    if (result.success) {
      modal.querySelector('.conflict-modal-content').innerHTML = `
        <div class="modal-title">AI Resolution Complete</div>
        <div class="success-message">
          <i data-lucide="check-circle" style="width: 64px; height: 64px; color: #2ea043;"></i>
          <h3>Conflicts resolved successfully!</h3>
          <p>${result.resolvedCount || 0} file${result.resolvedCount !== 1 ? 's' : ''} resolved</p>
        </div>
        <div class="modal-actions">
          <button class="primary" onclick="window.conflictUI.hideConflictDialog()">Close</button>
        </div>
      `;

      // Refresh worktrees
      if (window.refreshWorktrees) {
        await window.refreshWorktrees();
      }
    } else {
      modal.querySelector('.conflict-modal-content').innerHTML = `
        <div class="modal-title">AI Resolution Failed</div>
        <div class="error-message">
          <i data-lucide="x-circle" style="width: 64px; height: 64px; color: #f85149;"></i>
          <h3>Could not resolve all conflicts</h3>
          <div class="error-detail">${escapeHtml(result.error || 'Some conflicts require manual resolution')}</div>
        </div>
        <div class="modal-actions">
          <button onclick="window.conflictUI.hideConflictDialog()">Close</button>
          <button class="primary" onclick="window.conflictUI.handleManualResolve('${worktreeName}')">
            Open Terminal
          </button>
        </div>
      `;
    }

    // Reinit icons
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.error('[conflict-ui] AI resolution error:', error);
    modal.querySelector('.conflict-modal-content').innerHTML = `
      <div class="modal-title">AI Resolution Error</div>
      <div class="error-message">
        <i data-lucide="x-circle" style="width: 64px; height: 64px; color: #f85149;"></i>
        <h3>Failed to resolve conflicts</h3>
        <div class="error-detail">${escapeHtml(error.message)}</div>
      </div>
      <div class="modal-actions">
        <button onclick="window.conflictUI.hideConflictDialog()">Close</button>
      </div>
    `;

    // Reinit icons
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Handle manual resolve action
 */
export function handleManualResolve(worktreeName) {
  hideConflictDialog();

  // Open shell terminal
  if (window.openShell) {
    window.openShell(worktreeName);
  }

  // Show instructions
  setTimeout(() => {
    alert(`Shell opened for ${worktreeName}.\n\nTo resolve conflicts:\n1. Edit conflicted files\n2. git add <files>\n3. git commit\n\nRefresh the page when done.`);
  }, 500);
}

/**
 * Create conflict modal element
 */
function createConflictModal() {
  const modal = document.createElement('div');
  modal.id = 'conflict-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content conflict-modal-content">
      <!-- Content will be inserted dynamically -->
    </div>
  `;
  return modal;
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
window.conflictUI = {
  showConflictDialog,
  hideConflictDialog,
  handleRollback,
  handleAIResolve,
  handleManualResolve
};
