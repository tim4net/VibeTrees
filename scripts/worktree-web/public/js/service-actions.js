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
 * Populate close modal with worktree info
 */
function showCloseModalWithInfo(name, info) {
  // Hide loading, show content
  document.getElementById('close-loading').style.display = 'none';
  document.getElementById('close-content').style.display = 'block';

  // Set names
  document.getElementById('close-worktree-name').textContent = name;
  document.getElementById('close-branch-name').textContent = info.branch;

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

  // For now, just use simple delete
  // TODO: Implement data import functionality
  if (!confirm(`Close worktree "${name}"? This will stop services and remove the worktree.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/worktrees/${name}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
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
    const response = await fetch(`/api/worktrees/${name}/services/start`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      window.refreshWorktrees?.();
    } else {
      alert('Failed to start services: ' + result.error);
    }
  } catch (error) {
    alert('Failed to start services: ' + error.message);
  }
}

/**
 * Stop all services for a worktree
 */
export async function stopServices(name) {
  try {
    const response = await fetch(`/api/worktrees/${name}/services/stop`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      window.refreshWorktrees?.();
    } else {
      alert('Failed to stop services: ' + result.error);
    }
  } catch (error) {
    alert('Failed to stop services: ' + error.message);
  }
}

/**
 * Restart all services for a worktree
 */
export async function restartServices(name) {
  try {
    const response = await fetch(`/api/worktrees/${name}/services/restart`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      window.refreshWorktrees?.();
    } else {
      alert('Failed to restart services: ' + result.error);
    }
  } catch (error) {
    alert('Failed to restart services: ' + error.message);
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
