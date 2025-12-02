/**
 * Service Actions Module
 * Handles service operations (start, stop, restart, rebuild, delete)
 */

import { getTerminals } from './terminals.js';

/**
 * Restart service from context menu
 */
export async function restartServiceFromContext(worktreeName, serviceName) {
  if (!confirm(`Restart ${serviceName} in ${worktreeName}?`)) return;

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/${serviceName}/restart`, {
      method: 'POST'
    });
    const result = await response.json();

    if (result.success) {
      window.refreshWorktrees?.();
    } else {
      alert('Failed to restart service: ' + result.error);
    }
  } catch (error) {
    alert('Failed to restart service: ' + error.message);
  }
}

/**
 * Rebuild service from context menu
 */
export async function rebuildServiceFromContext(worktreeName, serviceName) {
  if (!confirm(`Rebuild ${serviceName} in ${worktreeName}? This will stop, rebuild, and restart the service.`)) return;

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/${serviceName}/rebuild`, {
      method: 'POST'
    });
    const result = await response.json();

    if (result.success) {
      window.refreshWorktrees?.();
    } else {
      alert('Failed to rebuild service: ' + result.error);
    }
  } catch (error) {
    alert('Failed to rebuild service: ' + error.message);
  }
}

/**
 * Close a worktree (shows modal with options)
 */
export async function closeWorktree(name) {
  // Show modal with loading state
  const modal = document.getElementById('close-modal');
  const loading = document.getElementById('close-loading');
  const content = document.getElementById('close-content');

  modal.classList.add('active');
  loading.style.display = 'flex';
  content.style.display = 'none';

  // Store worktree name for executeClose
  window.currentWorktreeToClose = name;

  try {
    // Fetch close info
    const response = await fetch(`/api/worktrees/${name}/close-info`);
    const info = await response.json();

    if (!info.success) {
      alert('Failed to get worktree info: ' + info.error);
      window.hideCloseModal();
      return;
    }

    // Populate modal with info
    showCloseModalWithInfo(name, info);

  } catch (error) {
    alert('Failed to check worktree status: ' + error.message);
    window.hideCloseModal();
  }
}

/**
 * Fetch and display branch status for deletion
 */
async function fetchAndDisplayBranchStatus(worktreeName, branchName) {
  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/branch-status`);
    const branchStatus = await response.json();

    if (!branchStatus) {
      // No branch associated, hide branch deletion section
      document.getElementById('branch-deletion-section').style.display = 'none';
      return;
    }

    // Show branch deletion section
    document.getElementById('branch-deletion-section').style.display = 'block';

    // Populate branch status box
    const statusBox = document.getElementById('branch-status-box');
    if (branchStatus.isBaseBranch) {
      statusBox.className = 'info-box info';
      statusBox.innerHTML = `
        <strong>ℹ️ Base branch (${branchStatus.branchName})</strong>
        <p>This branch will be preserved.</p>
      `;
      // Disable deletion checkbox for base branch
      document.getElementById('delete-branch-checkbox').disabled = true;
    } else if (branchStatus.isMerged) {
      statusBox.className = 'info-box success';
      statusBox.innerHTML = `
        <strong>✅ Branch is merged into main</strong>
        <p>Safe to delete.</p>
      `;
      // Pre-check for merged branches
      document.getElementById('delete-branch-checkbox').checked = true;
      document.getElementById('delete-branch-checkbox').disabled = false;
      toggleBranchDeletionOptions();
    } else {
      statusBox.className = 'info-box warning';
      statusBox.innerHTML = `
        <strong>⚠️ Branch is NOT merged</strong>
        <p>This branch has ${branchStatus.unmergedCommits} unmerged commit(s).</p>
      `;
      // Don't pre-check for unmerged branches
      document.getElementById('delete-branch-checkbox').checked = false;
      document.getElementById('delete-branch-checkbox').disabled = false;
    }

    // Show/hide remote checkbox based on existence
    const deleteRemoteCheckbox = document.getElementById('delete-remote-checkbox');
    const deleteRemoteLabel = document.getElementById('delete-remote-label');
    if (branchStatus.existsOnRemote) {
      deleteRemoteCheckbox.disabled = false;
      deleteRemoteLabel.textContent = 'Delete on GitHub';
    } else {
      deleteRemoteCheckbox.disabled = true;
      deleteRemoteCheckbox.checked = false;
      deleteRemoteLabel.textContent = 'Delete on GitHub (not on remote)';
    }

  } catch (error) {
    console.error('Failed to fetch branch status:', error);
    document.getElementById('branch-deletion-section').style.display = 'none';
  }
}

/**
 * Toggle branch deletion options visibility
 */
window.toggleBranchDeletionOptions = function() {
  const checkbox = document.getElementById('delete-branch-checkbox');
  const options = document.getElementById('branch-deletion-options');

  if (checkbox.checked) {
    options.style.display = 'block';
  } else {
    options.style.display = 'none';
  }
};

/**
 * Populate close modal with worktree info
 */
async function showCloseModalWithInfo(name, info) {
  // Hide loading, show content
  document.getElementById('close-loading').style.display = 'none';
  document.getElementById('close-content').style.display = 'block';

  // Set names
  document.getElementById('close-worktree-name').textContent = name;
  document.getElementById('close-branch-name').textContent = info.branch;

  // Fetch branch status
  await fetchAndDisplayBranchStatus(name, info.branch);

  // Set merge status
  const mergeStatus = document.getElementById('merge-status');
  const workflowMergeStep = document.getElementById('workflow-merge');
  const notMergedWarning = document.getElementById('not-merged-warning');

  if (info.isMerged) {
    mergeStatus.innerHTML = '✅ PR Merged - Ready to import data';
    mergeStatus.className = 'status-badge status-success';
    workflowMergeStep.innerHTML = '✓ Merge PR → migrations run on main';
    notMergedWarning.style.display = 'none';
  } else {
    mergeStatus.innerHTML = '⚠️ PR Not Merged Yet';
    mergeStatus.className = 'status-badge status-warning';
    workflowMergeStep.innerHTML = '⚠️ Merge PR → migrations run on main';
    notMergedWarning.style.display = 'block';
  }

  // Populate database stats
  const tableStatsList = document.getElementById('table-stats-list');
  if (info.databaseTables && info.databaseTables.length > 0) {
    tableStatsList.innerHTML = info.databaseTables
      .map(t => `
        <div class="table-stat">
          <span class="table-name">${t.name}:</span>
          <span class="table-count">${t.count} rows</span>
        </div>
      `)
      .join('');
  } else {
    tableStatsList.innerHTML = '<div class="table-stat">No data found</div>';
  }

  // Show/hide main status warning
  const mainStatusWarning = document.getElementById('main-status-warning');
  if (!info.mainIsClean) {
    mainStatusWarning.style.display = 'block';
  } else {
    mainStatusWarning.style.display = 'none';
  }

  // Set up radio button listeners
  const radioButtons = document.querySelectorAll('input[name="close-action"]');
  const databasePreview = document.getElementById('database-preview');
  const updateMainOption = document.getElementById('update-main-option');

  radioButtons.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'yes') {
        databasePreview.style.display = 'block';
        updateMainOption.style.display = 'block';
      } else {
        databasePreview.style.display = 'none';
        updateMainOption.style.display = 'none';
      }
    });
  });
}

/**
 * Execute close worktree (called when user confirms)
 */
window.executeClose = async function() {
  const name = window.currentWorktreeToClose;
  if (!name) return;

  const action = document.querySelector('input[name="close-action"]:checked').value;

  // Get branch deletion options
  const deleteBranch = document.getElementById('delete-branch-checkbox')?.checked || false;
  const deleteLocal = document.getElementById('delete-local-checkbox')?.checked || false;
  const deleteRemote = document.getElementById('delete-remote-checkbox')?.checked || false;

  // Check if branch is unmerged
  const statusBox = document.getElementById('branch-status-box');
  const isUnmerged = statusBox?.classList.contains('warning');

  // Double confirmation for unmerged branches
  if (deleteBranch && isUnmerged) {
    const confirmDelete = confirm(
      'Are you sure? This branch has unmerged commits. ' +
      'Deleting it will permanently lose your work.'
    );
    if (!confirmDelete) {
      return;
    }
  }

  // For now, just use simple delete
  // TODO: Implement data import functionality
  if (!confirm(`Close worktree "${name}"?\n\nThis will:\n- Stop all services\n- Delete all volumes and data (databases, uploads, etc.)\n- Remove the worktree\n\nThis cannot be undone.`)) {
    return;
  }

  try {
    const payload = {};
    if (deleteBranch) {
      payload.deleteBranch = true;
      payload.deleteLocal = deleteLocal;
      payload.deleteRemote = deleteRemote;
      payload.force = isUnmerged; // Force delete if unmerged
    }

    const response = await fetch(`/api/worktrees/${name}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      // Show success message with branch deletion results
      let message = 'Worktree closed successfully.';
      if (result.branchDeletion) {
        const messages = [];
        if (result.branchDeletion.local === 'deleted') {
          messages.push('Local branch deleted');
        }
        if (result.branchDeletion.remote === 'deleted') {
          messages.push('Remote branch deleted');
        }
        if (messages.length > 0) {
          message += ' ' + messages.join('. ') + '.';
        }
      }
      alert(message);

      window.hideCloseModal();
      window.refreshWorktrees?.();
    } else {
      alert('Failed to close worktree: ' + result.error);
    }
  } catch (error) {
    alert('Failed to close worktree: ' + error.message);
  }
};

/**
 * Delete a worktree (legacy name, now calls closeWorktree)
 */
export async function deleteWorktree(name) {
  return closeWorktree(name);
}

/**
 * Start all services for a worktree
 */
export async function startServices(name) {
  try {
    // Get worktree data to find ports
    const worktree = window.appState?.worktrees?.find(w => w.name === name);
    if (!worktree) {
      alert('Worktree not found');
      return;
    }

    // Get ports for this worktree (or use common default services)
    const ports = worktree.ports || {
      'postgres': 5432,
      'api': 3000,
      'console': 4200,
      'temporal': 7233,
      'temporal-ui': 8080,
      'minio': 9000,
      'minio-console': 9001
    };

    // Show the service startup modal
    if (window.showServiceStartupModal) {
      window.showServiceStartupModal(name, ports);
    } else {
      // Fallback to simple loading if modal not loaded yet
      const button = event?.target?.closest('button');
      const originalText = button?.innerHTML;
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader-2" class="lucide-sm animate-spin"></i> Starting...';
        if (window.lucide) window.lucide.createIcons();
      }

      const response = await fetch(`/api/worktrees/${name}/services/start`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        if (button) {
          button.innerHTML = '<i data-lucide="check" class="lucide-sm"></i> Started!';
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => {
            button.disabled = false;
            if (originalText) button.innerHTML = originalText;
            if (window.lucide) window.lucide.createIcons();
          }, 2000);
        }
        window.refreshWorktrees?.();
      } else {
        if (button) {
          button.disabled = false;
          if (originalText) button.innerHTML = originalText;
          if (window.lucide) window.lucide.createIcons();
        }
        alert('Failed to start services: ' + result.error);
      }
    }
  } catch (error) {
    alert('Failed to start services: ' + error.message);
  }
}

/**
 * Stop all services for a worktree
 */
export async function stopServices(name) {
  // Update badge to show stopping
  updateStatusBadge(name, 'stopping');

  // Show toast feedback
  if (window.showToast) {
    window.showToast(`Stopping services for ${name}...`, 5000);
  }

  try {
    const response = await fetch(`/api/worktrees/${name}/services/stop`, {
      method: 'POST'
    });

    const result = await response.json();

    // Clear pending state
    updateStatusBadge(name, null);

    if (result.success) {
      if (window.showToast) {
        window.showToast(`Services stopped for ${name}`, 3000);
      }
      window.refreshWorktrees?.();
    } else {
      if (window.showToast) {
        window.showToast(`Failed to stop services: ${result.error}`, 5000);
      }
      window.refreshWorktrees?.();
    }
  } catch (error) {
    updateStatusBadge(name, null);
    if (window.showToast) {
      window.showToast(`Failed to stop services: ${error.message}`, 5000);
    }
    window.refreshWorktrees?.();
  }
}

/**
 * Update the status badge for a worktree
 * @param {string} worktreeName - Name of the worktree
 * @param {string} status - 'starting', 'stopping', 'restarting', or null to clear
 */
function updateStatusBadge(worktreeName, status) {
  const card = document.querySelector(`.worktree-card[data-name="${worktreeName}"]`);
  if (!card) return;

  const badge = card.querySelector('.status-badge');
  if (!badge) return;

  if (status) {
    badge.classList.remove('status-running', 'status-stopped', 'status-mixed');
    badge.classList.add('status-creating'); // Reuse creating style for animation
    const textMap = { starting: 'Starting', stopping: 'Stopping', restarting: 'Restarting' };
    const text = textMap[status] || status;
    badge.innerHTML = `${text} <i data-lucide="loader-2" class="status-badge-chevron spin"></i>`;
    // Re-init lucide for the new icon
    if (window.lucide) window.lucide.createIcons();
  }
  // Badge will be restored on next refresh when status is null
}

/**
 * Restart all services for a worktree
 */
export async function restartServices(name) {
  // Update badge to show restarting
  updateStatusBadge(name, 'restarting');

  // Show toast feedback
  if (window.showToast) {
    window.showToast(`Restarting services for ${name}...`, 5000);
  }

  try {
    const response = await fetch(`/api/worktrees/${name}/services/restart`, {
      method: 'POST'
    });

    const result = await response.json();

    // Clear pending state
    updateStatusBadge(name, null);

    if (result.success) {
      if (window.showToast) {
        window.showToast(`Services restarted for ${name}`, 3000);
      }
      window.refreshWorktrees?.();
    } else {
      if (window.showToast) {
        window.showToast(`Failed to restart services: ${result.error}`, 5000);
      }
      window.refreshWorktrees?.();
    }
  } catch (error) {
    updateStatusBadge(name, null);
    if (window.showToast) {
      window.showToast(`Failed to restart services: ${error.message}`, 5000);
    }
    window.refreshWorktrees?.();
  }
}

/**
 * Rebuild a single service (called from logs toolbar)
 */
export async function rebuildService(worktreeName, serviceName, tabId) {
  const terminals = getTerminals();
  const terminalData = terminals.get(tabId);
  if (terminalData && terminalData.terminal) {
    terminalData.terminal.write(`\r\n\x1b[33m🔨 Rebuilding ${serviceName}...\x1b[0m\r\n`);
  }

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/${serviceName}/rebuild`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      if (terminalData && terminalData.terminal) {
        terminalData.terminal.write(`\x1b[32m✓ Rebuild complete\x1b[0m\r\n\r\n`);
      }
      window.refreshWorktrees?.();
    } else {
      if (terminalData && terminalData.terminal) {
        terminalData.terminal.write(`\x1b[31m✗ Rebuild failed: ${result.error}\x1b[0m\r\n\r\n`);
      }
      alert('Failed to rebuild service: ' + result.error);
    }
  } catch (error) {
    if (terminalData && terminalData.terminal) {
      terminalData.terminal.write(`\x1b[31m✗ Rebuild failed: ${error.message}\x1b[0m\r\n\r\n`);
    }
    alert('Failed to rebuild service: ' + error.message);
  }
}

/**
 * Restart a single service (called from logs toolbar)
 */
export async function restartSingleService(worktreeName, serviceName, tabId) {
  const terminals = getTerminals();
  const terminalData = terminals.get(tabId);
  if (terminalData && terminalData.terminal) {
    terminalData.terminal.write(`\r\n\x1b[33m🔄 Restarting ${serviceName}...\x1b[0m\r\n`);
  }

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/${serviceName}/restart`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      if (terminalData && terminalData.terminal) {
        terminalData.terminal.write(`\x1b[32m✓ Restart complete\x1b[0m\r\n\r\n`);
      }
      window.refreshWorktrees?.();
    } else {
      if (terminalData && terminalData.terminal) {
        terminalData.terminal.write(`\x1b[31m✗ Restart failed: ${result.error}\x1b[0m\r\n\r\n`);
      }
      alert('Failed to restart service: ' + result.error);
    }
  } catch (error) {
    if (terminalData && terminalData.terminal) {
      terminalData.terminal.write(`\x1b[31m✗ Restart failed: ${error.message}\x1b[0m\r\n\r\n`);
    }
    alert('Failed to restart service: ' + error.message);
  }
}

// Export to global scope for onclick handlers
window.closeWorktree = closeWorktree;
window.deleteWorktree = deleteWorktree;
window.startServices = startServices;
window.stopServices = stopServices;
window.restartServices = restartServices;
window.rebuildService = rebuildService;
window.restartSingleService = restartSingleService;
