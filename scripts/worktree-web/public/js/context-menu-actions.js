/**
 * Context Menu Actions Module
 * Handles context menu action routing
 */

import {
  contextMenuData,
  worktreeContextMenuData,
  statusContextMenuData,
  tabContextMenuData,
  hideAllContextMenus
} from './context-menus.js';
import { openLogs, openCombinedLogs, closeTerminalTab, createTerminalTab } from './terminals.js';
import {
  restartServiceFromContext,
  rebuildServiceFromContext,
  closeWorktree,
  deleteWorktree,
  startServices,
  stopServices,
  restartServices
} from './service-actions.js';

/**
 * Service context menu action handler
 */
export function contextMenuAction(action) {
  const { worktreeName, serviceName } = contextMenuData;
  hideAllContextMenus();

  switch (action) {
    case 'viewLogs':
      openLogs(worktreeName, serviceName);
      break;
    case 'restart':
      restartServiceFromContext(worktreeName, serviceName);
      break;
    case 'rebuild':
      rebuildServiceFromContext(worktreeName, serviceName);
      break;
  }
}

/**
 * Worktree context menu action handler
 */
export function worktreeContextMenuAction(action) {
  const { worktreeName } = worktreeContextMenuData;
  hideAllContextMenus();

  switch (action) {
    case 'viewAllLogs':
      openCombinedLogs(worktreeName);
      break;
    case 'close':
      closeWorktree(worktreeName);
      break;
    case 'delete': // Legacy support
      closeWorktree(worktreeName);
      break;
  }
}

/**
 * Status badge context menu action handler
 */
export function statusContextMenuAction(action) {
  const { worktreeName } = statusContextMenuData;
  hideAllContextMenus();

  switch (action) {
    case 'start':
      startServices(worktreeName);
      break;
    case 'stop':
      stopServices(worktreeName);
      break;
    case 'restart':
      restartServices(worktreeName);
      break;
    case 'viewAllLogs':
      openCombinedLogs(worktreeName);
      break;
    case 'close':
      closeWorktree(worktreeName);
      break;
    case 'delete': // Legacy support
      closeWorktree(worktreeName);
      break;
  }
}

/**
 * Tab context menu action handler
 */
export function tabContextMenuAction(action) {
  const { tabId, worktreeName, uiPort } = tabContextMenuData;
  hideAllContextMenus();

  switch (action) {
    case 'refresh':
      refreshWebUI(tabId);
      break;
    case 'clone':
      cloneWebUITab(tabId, worktreeName, uiPort);
      break;
    case 'close':
      closeTerminalTab(tabId);
      break;
  }
}

/**
 * Refresh a WebUI iframe
 */
function refreshWebUI(tabId) {
  const iframe = document.getElementById(`${tabId}-iframe`);
  if (iframe) {
    iframe.src = iframe.src; // Reload iframe
  }
}

/**
 * Clone a WebUI tab
 */
function cloneWebUITab(tabId, worktreeName, uiPort) {
  createTerminalTab(worktreeName, null, true, uiPort);
}

// Export to global scope for onclick handlers
window.contextMenuAction = contextMenuAction;
window.worktreeContextMenuAction = worktreeContextMenuAction;
window.statusContextMenuAction = statusContextMenuAction;
window.tabContextMenuAction = tabContextMenuAction;
