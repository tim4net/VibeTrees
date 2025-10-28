/**
 * Context Menus Module
 * Handles all context menu interactions
 */

// Context menu state
export let contextMenuData = { worktreeName: null, serviceName: null };
export let worktreeContextMenuData = { worktreeName: null };
export let statusContextMenuData = { worktreeName: null, servicesRunning: 0, servicesTotal: 0 };
export let tabContextMenuData = { tabId: null, worktreeName: null, uiPort: null };

/**
 * Initialize context menus
 */
export function initContextMenus() {
  // Setup click handler to close context menus
  document.addEventListener('click', hideAllContextMenus);
}

/**
 * Hide all context menus
 */
export function hideAllContextMenus() {
  document.querySelectorAll('.context-menu').forEach(menu => {
    menu.classList.remove('active');
  });
}

/**
 * Show service context menu
 */
export function showContextMenu(event, worktreeName, serviceName) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('context-menu');
  contextMenuData = { worktreeName, serviceName };

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  menu.classList.add('active');
}

/**
 * Show worktree context menu
 */
export function showWorktreeContextMenu(event, worktreeName, isMain) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('worktree-context-menu');
  worktreeContextMenuData = { worktreeName, isMain };

  const deleteItem = menu.querySelector('.context-menu-item.danger');
  const divider = menu.querySelector('.context-menu-divider');
  if (deleteItem && divider) {
    deleteItem.style.display = isMain ? 'none' : 'flex';
    divider.style.display = isMain ? 'none' : 'block';
  }

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  menu.classList.add('active');
}

/**
 * Show status context menu
 */
export function showStatusContextMenu(event, worktreeName, servicesRunning, servicesTotal) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('status-context-menu');
  statusContextMenuData = { worktreeName, servicesRunning, servicesTotal };

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  menu.classList.add('active');
}

/**
 * Show tab context menu
 */
export function showTabContextMenu(event, tabId, worktreeName, uiPort, context = {}) {
  event.preventDefault();
  event.stopPropagation();

  const menu = document.getElementById('tab-context-menu');
  tabContextMenuData = {
    tabId,
    worktreeName,
    uiPort,
    isWebUI: context.isWebUI || false,
    isLogs: context.isLogs || false,
    isCombinedLogs: context.isCombinedLogs || false,
    command: context.command || null,
    serviceName: context.serviceName || null
  };

  // Update menu items based on tab type
  const refreshItem = menu.querySelector('[onclick*="refresh"]');
  const cloneItem = menu.querySelector('[onclick*="clone"]');

  // Only show refresh for WebUI tabs
  if (refreshItem) {
    refreshItem.style.display = tabContextMenuData.isWebUI ? 'flex' : 'none';
  }

  // Show clone for all tabs
  if (cloneItem) {
    const icon = cloneItem.querySelector('i');
    const text = cloneItem.querySelector('span:last-child');

    if (tabContextMenuData.isWebUI) {
      if (icon) icon.setAttribute('data-lucide', 'copy');
      if (text) text.textContent = 'Clone Tab';
    } else if (tabContextMenuData.isLogs || tabContextMenuData.isCombinedLogs) {
      if (icon) icon.setAttribute('data-lucide', 'copy');
      if (text) text.textContent = 'Clone Logs Tab';
    } else {
      if (icon) icon.setAttribute('data-lucide', 'copy');
      if (text) text.textContent = 'Clone Terminal';
    }

    // Re-initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  menu.classList.add('active');
}

// Export to global scope for onclick handlers
window.showContextMenu = showContextMenu;
window.showWorktreeContextMenu = showWorktreeContextMenu;
window.showStatusContextMenu = showStatusContextMenu;
window.showTabContextMenu = showTabContextMenu;

// Export module data for access from other modules
window.contextMenusModule = {
  hideAllContextMenus,
  tabContextMenuData,
  contextMenuData,
  worktreeContextMenuData,
  statusContextMenuData
};
