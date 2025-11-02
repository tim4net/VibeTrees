/**
 * Modal Management Module
 * Handles modal dialogs (create worktree)
 *
 * State Machine: idle → creating → cancelling/success/error → idle
 */

import { showSpinner, hideSpinner } from './spinner.js';

// Initialize branch selector
let branchSelector = null;

// Initialize agent selector
let agentSelector = null;

// Track current modal state for proper lifecycle management
let currentModalState = 'idle';

// Request in-flight guard to prevent duplicate submissions
let createInFlight = false;

/**
 * Set modal state and update UI accordingly
 * @param {string} state - One of: idle, creating, cancelling, success, error
 */
function setModalState(state) {
  const modal = document.getElementById('create-modal');
  const createBtn = document.getElementById('create-button');
  const cancelBtn = document.getElementById('cancel-button');

  currentModalState = state;
  modal.setAttribute('data-state', state);

  // Update button labels and states based on current state
  switch (state) {
    case 'idle':
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
      break;
    case 'creating':
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel and clean up'; // Inform user about cleanup
      break;
    case 'cancelling':
      createBtn.disabled = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cleaning up...';
      break;
    case 'success':
      createBtn.disabled = true;
      createBtn.textContent = 'Created!';
      cancelBtn.disabled = true;
      break;
    case 'error':
      createBtn.disabled = false;
      createBtn.textContent = 'Retry';
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
      break;
  }
}

// Toast timeout tracker for cleanup
let toastTimer = null;

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';

  // Clear previous timeout to prevent flicker
  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
    toastTimer = null;
  }, duration);
}

/**
 * Toggle progress logs visibility
 */
export function toggleProgressLogs() {
  const logPanel = document.getElementById('progress-output');
  const logToggle = document.getElementById('log-toggle');

  if (logPanel.classList.contains('collapsed')) {
    logPanel.classList.remove('collapsed');
    logToggle.querySelector('span').textContent = 'Hide details';
    // Re-initialize Lucide icons for the rotated chevron
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } else {
    logPanel.classList.add('collapsed');
    logToggle.querySelector('span').textContent = 'Show details';
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

/**
 * Auto-expand logs on errors
 */
function autoExpandLogs() {
  const logPanel = document.getElementById('progress-output');
  const logToggle = document.getElementById('log-toggle');

  if (logPanel.classList.contains('collapsed')) {
    logPanel.classList.remove('collapsed');
    logToggle.querySelector('span').textContent = 'Hide details';
  }
}

/**
 * Show create worktree modal
 */
export function showCreateModal() {
  document.getElementById('create-modal').classList.add('active');

  // Initialize branch selector if not already done
  if (!branchSelector && typeof BranchSelector !== 'undefined') {
    branchSelector = new BranchSelector();
    branchSelector.init('branch-selector-container', 'branch-search');

    // Set callback for when branch is selected
    branchSelector.onBranchSelected = (branch) => {
      const worktreeName = BranchSelector.branchToWorktreeName(branch.name);
      document.getElementById('worktree-name').value = worktreeName;
    };
  }

  // Initialize agent selector if not already done
  if (!agentSelector && typeof AgentSelector !== 'undefined') {
    agentSelector = new AgentSelector();
    agentSelector.init('agent-selector-container', {
      defaultAgent: 'claude',
      showHints: true,
      showCapabilities: false
    });

    // Set callback for when agent is selected
    agentSelector.onAgentChange = (agent) => {
      console.log('[showCreateModal] Agent selected:', agent.name);
    };
  }

  // Load branches when opening modal on "Existing Branch" tab
  if (branchSelector && document.getElementById('existing-branch-tab').classList.contains('active')) {
    branchSelector.load();
  }
}

/**
 * Hide create worktree modal and reset state
 */
export function hideCreateModal() {
  // Reset modal state
  setModalState('idle');

  // Clear all form inputs
  document.getElementById('branch-name').value = '';
  document.getElementById('from-branch').value = 'main';
  document.getElementById('worktree-name').value = '';

  // Reset to "New Branch" tab
  switchCreateTab('new-branch');

  // Clear branch selector
  if (branchSelector) {
    branchSelector.clearSelection();
  }

  // Reset agent selector to default
  if (agentSelector) {
    agentSelector.selectAgent('claude');
  }

  // Reset progress container
  document.getElementById('create-progress').classList.remove('active');
  document.getElementById('progress-header-text').textContent = 'Creating worktree...';

  // Reset all progress steps to pending state
  document.querySelectorAll('.progress-step').forEach(step => {
    step.classList.remove('pending', 'active', 'completed', 'error');
    step.classList.add('pending');
  });

  // Clear step status texts
  ['git', 'database', 'ports', 'containers', 'complete'].forEach(step => {
    const statusEl = document.getElementById(`status-${step}`);
    if (statusEl) statusEl.textContent = '';
  });

  // Reset progress output and collapse logs
  const progressOutput = document.getElementById('progress-output');
  progressOutput.innerHTML = '';
  progressOutput.classList.remove('active');
  progressOutput.classList.add('collapsed');

  // Reset log toggle button
  const logToggle = document.getElementById('log-toggle');
  logToggle.querySelector('span').textContent = 'Show details';

  // Close the modal
  document.getElementById('create-modal').classList.remove('active');
}

/**
 * Create a new worktree (with optional force flag)
 */
export async function createWorktree(event, force = false) {
  if (event) {
    event.preventDefault();
  }

  // CRITICAL: Prevent duplicate requests from rapid clicks
  if (createInFlight) {
    console.log('[createWorktree] Request already in flight, ignoring duplicate');
    return;
  }

  // Determine which tab is active
  const isNewBranch = document.getElementById('new-branch-tab').classList.contains('active');

  let branchName, fromBranch, worktreeName;

  if (isNewBranch) {
    // New branch mode
    branchName = document.getElementById('branch-name').value;
    fromBranch = document.getElementById('from-branch').value;
    worktreeName = document.getElementById('worktree-name').value || branchName.replace(/\//g, '-');

    if (!branchName) {
      alert('Please enter a branch name');
      return;
    }
  } else {
    // Existing branch mode
    const selectedBranch = branchSelector?.getSelectedBranch();

    if (!selectedBranch) {
      alert('Please select a branch');
      return;
    }

    branchName = selectedBranch.name;
    fromBranch = null; // Existing branch doesn't need fromBranch
    worktreeName = document.getElementById('worktree-name').value ||
                   BranchSelector.branchToWorktreeName(branchName);
  }

  // Get selected agent
  const selectedAgent = agentSelector?.getSelectedAgentName() || 'claude';

  // Mark request as in-flight before any async operations
  createInFlight = true;

  // Set modal state to creating and show progress
  setModalState('creating');
  document.getElementById('create-progress').classList.add('active');
  document.getElementById('progress-header-text').textContent = 'Starting...';

  // Show spinner overlay
  showSpinner('Creating worktree...');

  try {
    const payload = {
      name: worktreeName, // CRITICAL: Include user-provided name
      branchName,
      agent: selectedAgent
    };
    if (fromBranch) {
      payload.fromBranch = fromBranch;
    }

    const url = force ? '/api/worktrees?force=true' : '/api/worktrees';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status === 409) {
      const data = await response.json();

      // Reset state since we're showing a sync modal
      setModalState('idle');
      document.getElementById('create-progress').classList.remove('active');
      hideSpinner();

      // Check if dirty state
      if (data.hasDirtyState) {
        alert('Cannot sync: main has uncommitted changes. Please commit or stash changes first.');
        return;
      }

      // Show sync prompt
      return new Promise((resolve, reject) => {
        showSyncModal(data, async (action) => {
          if (action === 'yes') {
            // Sync then retry
            try {
              showToast('Checking for updates...');
              await syncWorktree('main');
              showToast('Creating worktree...');
              await createWorktree(null, true);
              resolve();
            } catch (error) {
              reject(error);
            }
          } else if (action === 'no') {
            // Force create
            await createWorktree(null, true);
            resolve();
          } else {
            // Cancel
            reject(new Error('User cancelled'));
          }
        });
      });
    }

    const result = await response.json();

    // Handle 202 Accepted (background creation)
    if (response.status === 202) {
      createInFlight = false; // Reset guard for 202 background path
      hideSpinner(); // CRITICAL: Hide spinner to unblock UI
      showToast(`Creating worktree ${result.name}...`);

      // Close modal immediately - creation happens in background
      window.hideCreateModal?.();

      // Worktree card will be added by WebSocket 'worktree:creating' event
      return;
    }

    if (!result.success) {
      // Handle creation failure
      setModalState('error');
      document.getElementById('create-progress').classList.remove('active');
      hideSpinner();
      alert('Failed to create worktree: ' + result.error);
    } else {
      // Success case - hide spinner when modal closes
      hideSpinner();
    }
    // Success case is handled by WebSocket progress events
  } catch (error) {
    // Handle network/exception errors
    setModalState('error');
    document.getElementById('create-progress').classList.remove('active');
    hideSpinner();
    alert('Failed to create worktree: ' + error.message);
  } finally {
    // Always reset in-flight guard to allow retries
    createInFlight = false;
  }
}

/**
 * Show sync modal and handle user choice
 */
function showSyncModal(data, callback) {
  const modal = document.getElementById('syncModal');
  const message = document.getElementById('syncModalMessage');

  message.textContent = data.message || 'Sync required';
  modal.classList.add('active');

  document.getElementById('syncYesBtn').onclick = () => {
    modal.classList.remove('active');
    callback('yes');
  };

  document.getElementById('syncNoBtn').onclick = () => {
    modal.classList.remove('active');
    callback('no');
  };

  document.getElementById('syncCancelBtn').onclick = () => {
    modal.classList.remove('active');
    callback('cancel');
  };
}

/**
 * Sync a worktree with remote
 */
async function syncWorktree(name) {
  showToast(`Syncing ${name}...`);

  try {
    const response = await fetch(`/api/worktrees/${name}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'merge' })
    });

    const result = await response.json();

    if (response.status === 409) {
      // Conflict that couldn't be auto-resolved
      throw new Error(result.error || 'Sync encountered conflicts that require manual resolution');
    }

    if (!response.ok) {
      throw new Error(result.error || 'Sync failed');
    }

    // Check if AI resolved conflicts
    if (result.resolution) {
      showToast(`${name} synced (conflicts auto-resolved)`, 3000);
    } else {
      showToast(`${name} synced successfully`, 2000);
    }

    return result;

  } catch (error) {
    showToast(`Sync failed: ${error.message}`, 5000);
    throw error;
  }
}

/**
 * Hide close worktree modal and reset state
 */
export function hideCloseModal() {
  document.getElementById('close-modal').classList.remove('active');

  // Reset form
  document.querySelector('input[name="close-action"][value="no"]').checked = true;
  document.getElementById('database-preview').style.display = 'none';
  document.getElementById('update-main-option').style.display = 'none';

  // Reset loading state
  document.getElementById('close-loading').style.display = 'flex';
  document.getElementById('close-content').style.display = 'none';

  // Clear stored worktree name
  window.currentWorktreeToClose = null;
}

/**
 * Open a new Claude tab with instructions to update main from GitHub
 */
export function openUpdateMainInstructions() {
  // Get the main worktree name
  const worktrees = window.appState?.getWorktrees?.() || [];
  const mainWorktree = worktrees.find(w => w.isMain);

  if (!mainWorktree) {
    alert('Could not find main worktree');
    return;
  }

  // Open Claude terminal for main worktree
  if (window.openTerminal) {
    window.openTerminal(mainWorktree.name, 'claude');

    // Show a message to the user about what to do
    setTimeout(() => {
      alert(`Claude tab opened for main worktree!

Please tell Claude to:
"Update this worktree from GitHub by running:
  git fetch origin
  git pull origin main
  git status"`);
    }, 500);
  } else {
    alert('Could not open Claude terminal. Please open it manually from the main worktree.');
  }
}

/**
 * Show new tab menu
 */
export function showNewTabMenu(event) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('new-tab-menu');
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();

  // Position menu below the button
  menu.style.left = rect.left + 'px';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.classList.add('active');

  // Re-initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * New tab menu action handler
 */
export function newTabMenuAction(tabType) {
  const { hideAllContextMenus } = window.contextMenusModule || {};
  if (hideAllContextMenus) hideAllContextMenus();

  // Get the selected worktree from appState
  const selectedWorktree = window.appState?.getSelectedWorktree?.();

  if (!selectedWorktree) {
    alert('Please select a worktree first');
    return;
  }

  const worktreeName = selectedWorktree.name;

  switch (tabType) {
    case 'shell':
      if (window.openShell) {
        window.openShell(worktreeName);
      }
      break;

    case 'claude':
      if (window.openTerminal) {
        window.openTerminal(worktreeName, 'claude');
      }
      break;

    case 'codex':
      if (window.openTerminal) {
        window.openTerminal(worktreeName, 'codex');
      }
      break;

    case 'console':
      // Find the console UI port for this worktree
      const worktrees = window.appState?.getWorktrees?.() || [];
      const worktree = worktrees.find(w => w.name === worktreeName);

      if (worktree && worktree.ports && worktree.ports.console && window.openWebUI) {
        window.openWebUI(worktreeName, worktree.ports.console);
      } else {
        alert('Console UI port not found. Make sure services are running.');
      }
      break;
  }
}

/**
 * Tab context menu action handler
 */
export function tabContextMenuAction(action) {
  const { hideAllContextMenus } = window.contextMenusModule || {};
  if (hideAllContextMenus) hideAllContextMenus();

  const data = window.contextMenusModule?.tabContextMenuData;
  if (!data) return;

  const { tabId, worktreeName, uiPort, isWebUI, isLogs, isCombinedLogs, command, serviceName } = data;

  switch (action) {
    case 'refresh':
      // Only for WebUI tabs - reload the iframe
      if (isWebUI) {
        const iframe = document.getElementById(`${tabId}-iframe`);
        if (iframe) {
          iframe.src = iframe.src; // Reload iframe
        }
      }
      break;

    case 'clone':
      // Clone the tab - create a new tab of the same type
      if (isWebUI && window.openWebUI) {
        window.openWebUI(worktreeName, uiPort);
      } else if (isCombinedLogs && window.openCombinedLogs) {
        window.openCombinedLogs(worktreeName);
      } else if (isLogs && window.openLogs) {
        window.openLogs(worktreeName, serviceName);
      } else if (command && window.openTerminal) {
        window.openTerminal(worktreeName, command);
      }
      break;

    case 'reload':
      // Reload terminal - close and reopen
      if (window.closeTerminalTab && tabId) {
        window.closeTerminalTab(tabId);

        // Wait a moment, then reopen
        setTimeout(() => {
          if (isWebUI && window.openWebUI) {
            window.openWebUI(worktreeName, uiPort);
          } else if (isCombinedLogs && window.openCombinedLogs) {
            window.openCombinedLogs(worktreeName);
          } else if (isLogs && window.openLogs) {
            window.openLogs(worktreeName, serviceName);
          } else if (command && window.openTerminal) {
            window.openTerminal(worktreeName, command);
          }
        }, 100);
      }
      break;

    case 'kill':
      // Kill the underlying process (PTY sessions only)
      if (!isWebUI && !isLogs && !isCombinedLogs) {
        if (confirm(`Kill the ${command || 'shell'} process?\n\nThis will forcefully terminate the process. The tab will remain open but the terminal will be disconnected.`)) {
          // Send kill request to server
          fetch('/api/kill-terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ worktreeName, command })
          }).then(response => response.json())
            .then(result => {
              if (result.success) {
                console.log('Terminal process killed');
                // Optionally close the tab after killing
                if (window.closeTerminalTab && tabId) {
                  window.closeTerminalTab(tabId);
                }
              } else {
                alert('Failed to kill process: ' + result.error);
              }
            })
            .catch(error => {
              alert('Failed to kill process: ' + error.message);
            });
        }
      } else {
        alert('Kill is only available for interactive terminal sessions (Claude, Codex, Shell).');
      }
      break;

    case 'close':
      if (window.closeTerminalTab && tabId) {
        window.closeTerminalTab(tabId);
      }
      break;
  }
}

/**
 * Switch between "New Branch" and "Existing Branch" tabs
 */
export function switchCreateTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  if (tab === 'new-branch') {
    document.getElementById('new-branch-tab').classList.add('active');
    // Make branch-name required for new branch
    document.getElementById('branch-name').setAttribute('required', 'required');
  } else if (tab === 'existing-branch') {
    document.getElementById('existing-branch-tab').classList.add('active');
    // Branch-name not required for existing branch
    document.getElementById('branch-name').removeAttribute('required');

    // Load branches when switching to this tab
    if (branchSelector) {
      branchSelector.load();
    }
  }
}

// Export to global scope for onclick handlers
window.showCreateModal = showCreateModal;
window.hideCreateModal = hideCreateModal;
window.createWorktree = createWorktree;
window.switchCreateTab = switchCreateTab;
window.toggleProgressLogs = toggleProgressLogs;
window.setModalState = setModalState;
window.showToast = showToast; // CRITICAL: Export for websockets.js usage
window.hideCloseModal = hideCloseModal;
window.openUpdateMainInstructions = openUpdateMainInstructions;
window.showNewTabMenu = showNewTabMenu;
window.newTabMenuAction = newTabMenuAction;
window.tabContextMenuAction = tabContextMenuAction;
