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
 * Update quick action buttons (for collapsed sidebar)
 * DISABLED: Quick actions removed to avoid duplicate buttons - using terminal-launch-buttons instead
 */
function updateQuickActions() {
  // Quick actions feature disabled - terminal-launch-buttons provide the same functionality
  const tabBar = document.getElementById('terminal-tabs');
  if (!tabBar) return;

  // Remove any existing quick actions
  const quickActions = tabBar.querySelector('.quick-actions');
  if (quickActions) {
    quickActions.remove();
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

/**
 * Setup instant tooltips for quick action buttons
 */
function setupInstantTooltips() {
  const tooltipDiv = document.getElementById('instant-tooltip') || createTooltipDiv();

  document.querySelectorAll('.quick-action-btn[title]').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => {
      const title = e.currentTarget.getAttribute('title');
      if (!title) return;

      const rect = e.currentTarget.getBoundingClientRect();
      tooltipDiv.textContent = title;
      tooltipDiv.style.display = 'block';
      tooltipDiv.style.left = (rect.left + rect.width / 2) + 'px';
      tooltipDiv.style.top = (rect.bottom + 8) + 'px';
    });

    btn.addEventListener('mouseleave', () => {
      tooltipDiv.style.display = 'none';
    });
  });
}

/**
 * Create tooltip div element
 */
function createTooltipDiv() {
  const div = document.createElement('div');
  div.id = 'instant-tooltip';
  div.style.cssText = `
    position: fixed;
    background: #1c2128;
    color: #c9d1d9;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    white-space: nowrap;
    border: 1px solid #30363d;
    z-index: 99999;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    display: none;
    transform: translateX(-50%);
  `;
  document.body.appendChild(div);
  return div;
}
