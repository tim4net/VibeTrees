/**
 * Terminal Openers Module
 * Functions to open different types of terminal tabs
 */

import { createTerminalTab, switchToTab } from './terminals.js';

/**
 * Open a terminal tab (claude or codex)
 */
export function openTerminal(worktreeName, command, terminals) {
  // Check if tab already exists
  for (const [tabId, terminalInfo] of terminals.entries()) {
    if (!terminalInfo.isLogs &&
        !terminalInfo.isWebUI &&
        terminalInfo.worktree === worktreeName &&
        terminalInfo.command === command) {
      switchToTab(tabId);
      return;
    }
  }

  // Create new tab
  createTerminalTab(worktreeName, command);
}

/**
 * Open a shell tab
 */
export function openShell(worktreeName, terminals) {
  // Check if shell tab already exists
  for (const [tabId, terminalInfo] of terminals.entries()) {
    if (!terminalInfo.isLogs &&
        !terminalInfo.isWebUI &&
        terminalInfo.worktree === worktreeName &&
        terminalInfo.command === 'shell') {
      switchToTab(tabId);
      return;
    }
  }

  // Create new shell tab
  createTerminalTab(worktreeName, 'shell');
}

/**
 * Open a web UI tab
 */
export function openWebUI(worktreeName, uiPort, terminals) {
  // Check if UI tab already exists
  for (const [tabId, terminalInfo] of terminals.entries()) {
    if (terminalInfo.isWebUI &&
        terminalInfo.worktree === worktreeName) {
      switchToTab(tabId);
      return;
    }
  }

  // Check if UI is accessible
  fetch(`http://localhost:${uiPort}`)
    .then(() => {
      createTerminalTab(worktreeName, null, true, uiPort);
    })
    .catch(() => {
      alert(`Console UI is not running on port ${uiPort}. Start the services first.`);
    });
}

/**
 * Open logs for a specific service
 */
export function openLogs(worktreeName, serviceName, terminals) {
  // Check if logs tab already exists
  for (const [tabId, terminalInfo] of terminals.entries()) {
    if (terminalInfo.isLogs &&
        !terminalInfo.isCombinedLogs &&
        terminalInfo.worktree === worktreeName &&
        terminalInfo.service === serviceName) {
      switchToTab(tabId);
      return;
    }
  }

  // Create new logs tab
  createTerminalTab(worktreeName, null, false, null, true, serviceName, false);
}

/**
 * Open combined logs for all services
 */
export function openCombinedLogs(worktreeName, terminals) {
  // Check if combined logs tab already exists
  for (const [tabId, terminalInfo] of terminals.entries()) {
    if (terminalInfo.isCombinedLogs &&
        terminalInfo.worktree === worktreeName) {
      switchToTab(tabId);
      return;
    }
  }

  // Create new combined logs tab
  createTerminalTab(worktreeName, null, false, null, false, null, true);
}
