/**
 * Tab Filtering Module
 * Handles tab bar filtering based on selected worktree
 */

import { appState } from './state.js';
import { setupEmptyState } from './terminal-empty-state.js';

/**
 * Initialize tab filtering
 */
export function initTabFiltering() {
  // Listen to worktree selection changes
  appState.on('worktree:selected', () => {
    updateTabVisibility();
    updateFilterBadge();
  });

  // Listen to tab changes
  appState.on('tab:added', () => {
    updateTabVisibility();
  });

  appState.on('tab:removed', () => {
    updateTabVisibility();
    updateEmptyState();
  });

  // Initial state
  updateTabVisibility();
  updateFilterBadge();
}

/**
 * Update tab visibility based on selected worktree
 */
function updateTabVisibility() {
  const selectedWorktreeId = appState.selectedWorktreeId;

  // If no worktree selected, show all tabs
  if (!selectedWorktreeId) {
    document.querySelectorAll('.terminal-tab').forEach(tab => {
      tab.classList.remove('hidden');
    });
    updateEmptyState();
    return;
  }

  // Filter tabs to show only selected worktree's tabs
  let visibleCount = 0;
  let firstVisibleTab = null;

  for (const [tabId, tabInfo] of appState.tabs.entries()) {
    const tabElement = document.getElementById(tabId);
    const panelElement = document.getElementById(`${tabId}-panel`);

    if (tabElement) {
      if (tabInfo.worktree === selectedWorktreeId) {
        tabElement.classList.remove('hidden');
        visibleCount++;
        if (!firstVisibleTab) {
          firstVisibleTab = tabId;
        }
      } else {
        tabElement.classList.add('hidden');
        // Also remove active state from hidden tab's panel
        if (panelElement) {
          panelElement.classList.remove('active');
        }
        tabElement.classList.remove('active');
      }
    }
  }

  // If we filtered and there are visible tabs, ensure one is active
  if (visibleCount > 0) {
    const hasActiveVisibleTab = Array.from(document.querySelectorAll('.terminal-tab:not(.hidden).active')).length > 0;
    if (!hasActiveVisibleTab) {
      // Try to restore the last active tab for this worktree
      const lastActiveTabId = appState.getLastActiveTab(selectedWorktreeId);
      const lastTabExists = lastActiveTabId && document.getElementById(lastActiveTabId) && !document.getElementById(lastActiveTabId).classList.contains('hidden');

      if (lastTabExists) {
        // Restore last active tab
        window.switchToTab(lastActiveTabId);
      } else if (firstVisibleTab) {
        // Fall back to first visible tab
        window.switchToTab(firstVisibleTab);
      }
    }
  }

  updateEmptyState();
}

/**
 * Update filter badge in tab bar
 */
function updateFilterBadge() {
  const tabsContainer = document.getElementById('terminal-tabs');
  if (!tabsContainer) return;

  // Remove existing badge
  const existingBadge = tabsContainer.querySelector('.tab-filter-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Badge removed per user request - filtering still works, just no visual indicator
}

/**
 * Update empty state message
 */
function updateEmptyState() {
  const emptyState = document.querySelector('.empty-terminal');
  if (!emptyState) return;

  // Count visible tabs
  const visibleTabs = document.querySelectorAll('.terminal-tab:not(.hidden)');

  if (visibleTabs.length === 0) {
    // Show the full options grid with clickable terminal options
    emptyState.style.display = 'flex';
    setupEmptyState();
  } else {
    emptyState.style.display = 'none';
  }
}

/**
 * Clear tab filter
 */
window.clearTabFilter = function(event) {
  if (event) {
    event.stopPropagation();
  }
  appState.selectWorktree(null);
};

/**
 * Check if a tab should be visible
 */
export function isTabVisible(tabId) {
  if (!appState.selectedWorktreeId) {
    return true; // No filter, all visible
  }

  const tabInfo = appState.tabs.get(tabId);
  if (!tabInfo) {
    return true; // Unknown tab, show it
  }

  return tabInfo.worktree === appState.selectedWorktreeId;
}

/**
 * Get count of visible tabs for a worktree
 */
export function getWorktreeTabCount(worktreeName) {
  return appState.getWorktreeTabs(worktreeName).length;
}

// ============================================================================
// QUICK-ACTIONS FEATURE REMOVED
// ============================================================================
// The quick-actions feature was removed to prevent duplicate terminal launch buttons.
// Previously, icon-only buttons were dynamically added to #terminal-tabs when the
// sidebar was collapsed, but this created UI duplication with .terminal-launch-buttons.
//
// Solution: Use only .terminal-launch-buttons in index.html for all terminal launching.
// If icon-only buttons are needed when sidebar is collapsed, use CSS media queries
// on .terminal-launch-buttons instead of creating a separate button set.
//
// Regression prevention: tests/e2e/terminal-functionality.spec.mjs includes a test
// that fails if duplicate buttons are detected.
// ============================================================================

// ============================================================================
// RESPONSIVE LAUNCHER BUTTONS
// ============================================================================
/**
 * Initialize responsive behavior for launcher buttons
 * Switches to icon-only mode when space is limited
 */
export function initResponsiveLauncher() {
  const terminalHeader = document.querySelector('.terminal-header');
  const launchButtons = document.querySelector('.terminal-launch-buttons');

  if (!terminalHeader || !launchButtons) {
    return;
  }

  // Observe size changes on terminal header
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const headerWidth = entry.contentRect.width;
      const tabs = document.querySelector('.terminal-tabs');
      const tabsCount = tabs ? tabs.querySelectorAll('.terminal-tab:not(.hidden)').length : 0;

      // Calculate space needed for tabs (estimate)
      const estimatedTabsWidth = tabsCount * 140; // Average tab width
      const availableSpace = headerWidth - estimatedTabsWidth;

      // Switch to compact mode if space is tight (< 300px available for buttons)
      if (availableSpace < 300) {
        launchButtons.classList.add('compact');
      } else {
        launchButtons.classList.remove('compact');
      }
    }
  });

  resizeObserver.observe(terminalHeader);

  // Also listen to tab changes to re-evaluate
  appState.on('tab:added', () => {
    // Trigger re-evaluation
    resizeObserver.observe(terminalHeader);
  });

  appState.on('tab:removed', () => {
    // Trigger re-evaluation
    resizeObserver.observe(terminalHeader);
  });
}
