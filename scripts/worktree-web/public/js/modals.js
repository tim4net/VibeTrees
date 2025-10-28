/**
 * Modal Management Module
 * Handles modal dialogs (create worktree)
 */

/**
 * Show create worktree modal
 */
export function showCreateModal() {
  document.getElementById('create-modal').classList.add('active');
}

/**
 * Hide create worktree modal and reset state
 */
export function hideCreateModal() {
  document.getElementById('create-modal').classList.remove('active');
  document.getElementById('branch-name').value = '';
  document.getElementById('from-branch').value = 'main';

  // Reset progress bar
  document.getElementById('create-progress').classList.remove('active');
  document.getElementById('progress-header-text').textContent = 'Creating worktree...';

  document.querySelectorAll('.progress-step').forEach(step => {
    step.classList.remove('pending', 'active', 'completed', 'error');
    step.classList.add('pending');
  });

  // Clear step status texts
  ['git', 'database', 'ports', 'containers', 'complete'].forEach(step => {
    const statusEl = document.getElementById(`status-${step}`);
    if (statusEl) statusEl.textContent = '';
  });

  document.getElementById('create-button').disabled = false;
  document.getElementById('cancel-button').disabled = false;

  // Clear progress output
  const progressOutput = document.getElementById('progress-output');
  progressOutput.innerHTML = '';
  progressOutput.classList.remove('active');
}

/**
 * Create a new worktree
 */
export async function createWorktree(event) {
  event.preventDefault();

  const branchName = document.getElementById('branch-name').value;
  const fromBranch = document.getElementById('from-branch').value;

  // Disable buttons and show progress
  document.getElementById('create-button').disabled = true;
  document.getElementById('cancel-button').disabled = true;
  document.getElementById('create-progress').classList.add('active');
  document.getElementById('progress-header-text').textContent = 'Starting...';

  try {
    const response = await fetch('/api/worktrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchName, fromBranch })
    });

    const result = await response.json();

    if (!result.success) {
      alert('Failed to create worktree: ' + result.error);
      document.getElementById('create-button').disabled = false;
      document.getElementById('cancel-button').disabled = false;
      document.getElementById('create-progress').classList.remove('active');
    }
    // Success case is handled by WebSocket progress events
  } catch (error) {
    alert('Failed to create worktree: ' + error.message);
    document.getElementById('create-button').disabled = false;
    document.getElementById('cancel-button').disabled = false;
    document.getElementById('create-progress').classList.remove('active');
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

// Export to global scope for onclick handlers
window.showCreateModal = showCreateModal;
window.hideCreateModal = hideCreateModal;
window.createWorktree = createWorktree;
window.hideCloseModal = hideCloseModal;
window.openUpdateMainInstructions = openUpdateMainInstructions;
window.showNewTabMenu = showNewTabMenu;
window.newTabMenuAction = newTabMenuAction;
window.tabContextMenuAction = tabContextMenuAction;
