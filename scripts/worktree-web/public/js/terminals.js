/**
 * Terminal Management Module
 * Handles terminal creation, xterm.js integration, and PTY connections
 */

import { appState } from './state.js';
import { showTabContextMenu } from './context-menus.js';
import { setupLogsTerminal, setupPtyTerminal } from './terminal-setup.js';
import { setupEmptyState } from './terminal-empty-state.js';
import {
  openTerminal as _openTerminal,
  openShell as _openShell,
  openWebUI as _openWebUI,
  openLogs as _openLogs,
  openCombinedLogs as _openCombinedLogs
} from './terminal-openers.js';

// Terminal state
const terminals = new Map();
let nextTabId = 1;
let activeTabId = null;

/**
 * Get terminals Map (for other modules)
 */
export function getTerminals() {
  return terminals;
}

/**
 * Get active tab ID
 */
export function getActiveTabId() {
  return activeTabId;
}

/**
 * Initialize terminal management
 */
export function initTerminals() {
  // Listen to tab visibility changes
  appState.on('worktree:selected', () => {
    // Fit active terminal when filter changes
    if (activeTabId) {
      const terminalInfo = terminals.get(activeTabId);
      if (terminalInfo && terminalInfo.fitAddon) {
        setTimeout(() => terminalInfo.fitAddon.fit(), 50);
      }
    }
  });

  // Setup empty state with options
  setupEmptyState();
}

/**
 * Create a new terminal tab
 */
export function createTerminalTab(worktreeName, command, isWebUI = false, uiPort = null, isLogs = false, serviceName = null, isCombinedLogs = false) {
  const tabId = `tab-${nextTabId++}`;
  let commandLabel;

  // Determine label based on tab type
  if (isWebUI) {
    commandLabel = '<i data-lucide="globe" class="lucide-sm"></i> Console UI';
  } else if (isCombinedLogs) {
    commandLabel = '<i data-lucide="file-text" class="lucide-sm"></i> All Services logs';
  } else if (isLogs) {
    commandLabel = `<i data-lucide="file-text" class="lucide-sm"></i> ${serviceName} logs`;
  } else if (command === 'shell') {
    commandLabel = '<i data-lucide="terminal" class="lucide-sm"></i> Shell';
  } else if (command === 'codex') {
    commandLabel = '<img src="/icons/openai.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);" /> Codex';
  } else {
    commandLabel = '<img src="/icons/anthropic.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; filter: brightness(0) invert(1);" /> Claude';
  }

  // Create tab element
  const tab = document.createElement('button');
  tab.className = 'terminal-tab';
  tab.id = tabId;
  tab.innerHTML = `
    <span>${commandLabel} - ${worktreeName}</span>
    <span class="terminal-tab-close" onclick="closeTerminalTab('${tabId}', event)">×</span>
  `;
  tab.onclick = (e) => {
    if (!e.target.classList.contains('terminal-tab-close')) {
      switchToTab(tabId);
    }
  };

  // Add right-click context menu for ALL tab types
  tab.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTabContextMenu(e, tabId, worktreeName, uiPort, {
      isWebUI,
      isLogs,
      isCombinedLogs,
      command,
      serviceName
    });
  };

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'terminal-panel';
  panel.id = `${tabId}-panel`;

  // Panel content based on tab type
  if (isWebUI) {
    panel.innerHTML = `
      <iframe id="${tabId}-iframe" src="http://localhost:${uiPort}" style="width: 100%; height: 100%; border: none;"></iframe>
    `;
  } else if (isCombinedLogs) {
    panel.innerHTML = '<div class="terminal-wrapper"></div>';
  } else if (isLogs) {
    panel.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%;">
        <div style="background: #161b22; border-bottom: 1px solid #30363d; padding: 8px; display: flex; gap: 8px; flex-shrink: 0;">
          <button class="small" onclick="rebuildService('${worktreeName}', '${serviceName}', '${tabId}')" title="Rebuild and restart this service"><i data-lucide="hammer" class="lucide-sm"></i> Rebuild</button>
          <button class="small" onclick="restartSingleService('${worktreeName}', '${serviceName}', '${tabId}')" title="Restart this service"><i data-lucide="rotate-cw" class="lucide-sm"></i> Restart</button>
        </div>
        <div class="terminal-wrapper" style="flex: 1;"></div>
      </div>
    `;
  } else {
    panel.innerHTML = '<div class="terminal-wrapper"></div>';
  }

  // Add to DOM
  document.getElementById('terminal-tabs').appendChild(tab);
  document.getElementById('terminal-panels').appendChild(panel);

  // Hide empty state
  const emptyState = document.querySelector('.empty-terminal');
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  // Register tab with appState
  appState.addTab(tabId, {
    worktree: worktreeName,
    command,
    isWebUI,
    isLogs: isLogs || isCombinedLogs,
    isCombinedLogs,
    serviceName,
    uiPort
  });

  // Web UI tabs don't need terminal initialization
  if (isWebUI) {
    terminals.set(tabId, { isWebUI: true, worktree: worktreeName, uiPort });
    switchToTab(tabId);
    return;
  }

  // Initialize terminal for logs or PTY tabs
  if (isLogs || isCombinedLogs) {
    setupLogsTerminal(tabId, panel, worktreeName, serviceName, isCombinedLogs, terminals, activeTabId, switchToTab);
  } else {
    setupPtyTerminal(tabId, panel, worktreeName, command, terminals, activeTabId, switchToTab);
  }

  // Initialize Lucide icons in newly created tab
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Switch to a specific tab
 */
export function switchToTab(tabId) {
  // Update active tab
  document.querySelectorAll('.terminal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.getElementById(tabId)?.classList.add('active');

  // Update active panel
  document.querySelectorAll('.terminal-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`${tabId}-panel`)?.classList.add('active');

  activeTabId = tabId;

  // Fit the terminal
  const terminalInfo = terminals.get(tabId);
  if (terminalInfo && terminalInfo.fitAddon) {
    const delay = terminalInfo.isLogs ? 50 : 10;
    setTimeout(() => terminalInfo.fitAddon.fit(), delay);
  }
}

/**
 * Close a terminal tab
 */
export function closeTerminalTab(tabId, event) {
  if (event) {
    event.stopPropagation();
  }

  const terminalInfo = terminals.get(tabId);
  if (terminalInfo) {
    // Skip cleanup for web UI tabs
    if (!terminalInfo.isWebUI) {
      // Close WebSocket
      if (terminalInfo.socket) {
        terminalInfo.socket.close();
      }

      // Dispose terminal
      if (terminalInfo.terminal) {
        terminalInfo.terminal.dispose();
      }

      // Remove resize handler
      if (terminalInfo.resizeHandler) {
        window.removeEventListener('resize', terminalInfo.resizeHandler);
      }
    }

    terminals.delete(tabId);
  }

  // Remove from appState
  appState.removeTab(tabId);

  // Remove DOM elements
  document.getElementById(tabId)?.remove();
  document.getElementById(`${tabId}-panel`)?.remove();

  // Switch to another tab or show empty state
  if (activeTabId === tabId) {
    const remainingTabs = Array.from(terminals.keys());
    if (remainingTabs.length > 0) {
      switchToTab(remainingTabs[0]);
    } else {
      activeTabId = null;
      const emptyState = document.querySelector('.empty-terminal');
      if (emptyState) {
        emptyState.style.display = 'flex';
      }
    }
  }
}

/**
 * Wrapper functions for terminal openers (pass terminals Map)
 */
export function openTerminal(worktreeName, command) {
  _openTerminal(worktreeName, command, terminals);
}

export function openShell(worktreeName) {
  _openShell(worktreeName, terminals);
}

export function openWebUI(worktreeName, uiPort) {
  _openWebUI(worktreeName, uiPort, terminals);
}

export function openLogs(worktreeName, serviceName) {
  _openLogs(worktreeName, serviceName, terminals);
}

export function openCombinedLogs(worktreeName) {
  _openCombinedLogs(worktreeName, terminals);
}

// Export to global scope for onclick handlers
window.openTerminal = openTerminal;
window.openShell = openShell;
window.openWebUI = openWebUI;
window.openLogs = openLogs;
window.openCombinedLogs = openCombinedLogs;
window.closeTerminalTab = closeTerminalTab;
window.switchToTab = switchToTab;
