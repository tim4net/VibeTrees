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
import './modals.js'; // Import for side effects (global exports)
import './context-menu-actions.js'; // Import for side effects (global exports)
import './service-actions.js'; // Import for side effects (global exports)

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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
