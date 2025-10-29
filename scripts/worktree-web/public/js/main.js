/**
 * Main Application Module
 * Initializes all modules and wires them together
 */

import { appState } from './state.js';
import { connectWebSocket } from './websockets.js';
import { initSidebar, renderWorktrees } from './sidebar.js';
import { initContextMenus } from './context-menus.js';
import { initTabFiltering } from './tabs.js';
import { initTerminals } from './terminals.js';
import { initPerformanceMetrics } from './performance-metrics.js';
import { pollingManager } from './polling.js';
import { initStatusBar } from './status-bar.js';
import './modals.js'; // Import for side effects (global exports)
import './context-menu-actions.js'; // Import for side effects (global exports)
import './service-actions.js'; // Import for side effects (global exports)
import './update-notifications.js'; // Import for side effects (toast notifications)
import './conflict-ui.js'; // Import for side effects (conflict resolution)
import './sync-ui.js'; // Import for side effects (sync UI)

// Make appState globally available for synchronization
window.appState = appState;

/**
 * Fetch worktrees from API and update state
 */
export async function refreshWorktrees() {
  console.log('[refreshWorktrees] Starting...');
  try {
    const response = await fetch('/api/worktrees');
    console.log('[refreshWorktrees] Fetch response status:', response.status);
    const worktrees = await response.json();
    console.log('[refreshWorktrees] Received worktrees:', worktrees.length, 'items');

    // Update state which triggers sidebar re-render via events
    appState.updateWorktrees(worktrees);

    console.log('[refreshWorktrees] State updated, sidebar will re-render');
  } catch (error) {
    console.error('[refreshWorktrees] Error:', error);
  }
}

/**
 * Initialize application
 */
function initApp() {
  console.log('[main] Initializing application...');

  // Initialize all modules
  initContextMenus();
  initSidebar();
  initTabFiltering();
  initTerminals();
  initPerformanceMetrics();
  initStatusBar();

  // Update browser title when worktree selection changes
  appState.on('worktree:selected', (worktreeId) => {
    if (worktreeId) {
      document.title = `${worktreeId} VibeTrees`;
    } else {
      document.title = 'VibeTrees';
    }
  });

  console.log('[main] All modules initialized');

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
    console.log('[main] Lucide icons initialized');
  }

  // Wrap refreshWorktrees to reinitialize icons after updates
  const originalRefreshWorktrees = refreshWorktrees;
  window.refreshWorktrees = async function() {
    await originalRefreshWorktrees();
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 100);
    }
  };

  // Connect WebSocket for real-time updates
  connectWebSocket();
  console.log('[main] WebSocket connected');

  // Initial data load
  window.refreshWorktrees();
  console.log('[main] Initial data load complete');

  // Start automatic polling
  pollingManager.start();
  console.log('[main] Automatic polling started');
}

// Helper functions for agent launch buttons
window.openShellForSelected = function() {
  const selected = window.selectionManager?.getSelected() || appState.selectedWorktreeId;
  if (selected) {
    window.openShell(selected);
  } else {
    console.error('[openShellForSelected] No worktree selected');
    alert('Please select a worktree first');
  }
};

window.openClaudeForSelected = function() {
  const selected = window.selectionManager?.getSelected() || appState.selectedWorktreeId;
  if (selected) {
    window.openTerminal(selected, 'claude');
  } else {
    console.error('[openClaudeForSelected] No worktree selected');
    alert('Please select a worktree first');
  }
};

window.openCodexForSelected = function() {
  const selected = window.selectionManager?.getSelected() || appState.selectedWorktreeId;
  if (selected) {
    window.openTerminal(selected, 'codex');
  } else {
    console.error('[openCodexForSelected] No worktree selected');
    alert('Please select a worktree first');
  }
};

window.openWebUIForSelected = function() {
  const selected = window.selectionManager?.getSelected() || appState.selectedWorktreeId;
  if (selected) {
    // Get the worktree data to find console port
    const worktrees = appState.worktrees;
    const worktree = worktrees.find(wt => wt.name === selected);
    if (worktree && worktree.ports && worktree.ports.console) {
      window.openWebUI(selected, worktree.ports.console);
    } else {
      alert('Console port not available for this worktree');
    }
  } else {
    console.error('[openWebUIForSelected] No worktree selected');
    alert('Please select a worktree first');
  }
};

window.openLogsForSelected = function() {
  const selected = window.selectionManager?.getSelected() || appState.selectedWorktreeId;
  if (selected) {
    window.openCombinedLogs(selected);
  } else {
    console.error('[openLogsForSelected] No worktree selected');
    alert('Please select a worktree first');
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
