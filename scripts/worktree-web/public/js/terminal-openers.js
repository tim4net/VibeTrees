/**
 * Terminal Openers Module
 * Functions to open different types of terminal tabs
 */

import { createTerminalTab, switchToTab } from './terminals.js';

/**
 * Open a terminal tab (claude or codex)
 * Always creates a new tab to allow multiple instances
 */
export function openTerminal(worktreeName, command, terminals) {
  // Always create new tab (removed duplicate tab check to allow multiple tabs)
  createTerminalTab(worktreeName, command);
}

/**
 * Open a shell tab
 * Always creates a new tab to allow multiple instances
 */
export function openShell(worktreeName, terminals) {
  // Always create new tab (removed duplicate tab check to allow multiple tabs)
  createTerminalTab(worktreeName, 'shell');
}

/**
 * Open a web UI tab
 * Always creates a new tab to allow multiple instances
 */
export function openWebUI(worktreeName, uiPort, terminals) {
  // Check if UI is accessible
  fetch(`http://localhost:${uiPort}`)
    .then(() => {
      // Always create new tab (removed duplicate tab check to allow multiple tabs)
      createTerminalTab(worktreeName, null, true, uiPort);
    })
    .catch(() => {
      alert(`Console UI is not running on port ${uiPort}. Start the services first.`);
    });
}

/**
 * Open logs for a specific service
 * Always creates a new tab to allow multiple instances
 */
export function openLogs(worktreeName, serviceName, terminals) {
  // Always create new logs tab (removed duplicate tab check to allow multiple tabs)
  createTerminalTab(worktreeName, null, false, null, true, serviceName, false);
}

/**
 * Open combined logs for all services
 * Always creates a new tab to allow multiple instances
 */
export function openCombinedLogs(worktreeName, terminals) {
  // Always create new combined logs tab (removed duplicate tab check to allow multiple tabs)
  createTerminalTab(worktreeName, null, false, null, false, null, true);
}
