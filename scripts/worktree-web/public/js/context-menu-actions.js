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
    case 'backupDatabase':
      if (window.dbUI && window.dbUI.handleBackup) {
        window.dbUI.handleBackup(worktreeName);
      }
      break;
    case 'database':
      if (window.openDatabaseModal) {
        window.openDatabaseModal(worktreeName);
      }
      break;
    case 'diagnostics':
      if (window.diagnosticsModule) {
        window.diagnosticsModule.showDiagnosticsModal(worktreeName);
      }
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
  const { tabId, worktreeName, uiPort, isWebUI, isLogs, isCombinedLogs, command, serviceName } = tabContextMenuData;
  hideAllContextMenus();

  switch (action) {
    case 'refresh':
      refreshWebUI(tabId);
      break;
    case 'clone':
      cloneTab(worktreeName, { isWebUI, isLogs, isCombinedLogs, command, serviceName, uiPort });
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
 * Clone a tab based on its type
 */
function cloneTab(worktreeName, context) {
  const { isWebUI, isLogs, isCombinedLogs, command, serviceName, uiPort } = context;

  if (isWebUI) {
    // Clone WebUI tab
    createTerminalTab(worktreeName, null, true, uiPort);
  } else if (isCombinedLogs) {
    // Clone combined logs tab
    createTerminalTab(worktreeName, null, false, null, false, null, true);
  } else if (isLogs) {
    // Clone service logs tab
    createTerminalTab(worktreeName, null, false, null, true, serviceName, false);
  } else if (command) {
    // Clone terminal tab (shell, claude, codex)
    createTerminalTab(worktreeName, command);
  } else {
    // Fallback: create a shell tab
    console.warn('Could not determine tab type for cloning, defaulting to shell');
    createTerminalTab(worktreeName, 'shell');
  }
}

// Export to global scope for onclick handlers
window.contextMenuAction = contextMenuAction;
window.worktreeContextMenuAction = worktreeContextMenuAction;
window.statusContextMenuAction = statusContextMenuAction;
window.tabContextMenuAction = tabContextMenuAction;
