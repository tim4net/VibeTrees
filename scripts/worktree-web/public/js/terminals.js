/**
 * Terminal Management Module
 * Handles terminal creation, xterm.js integration, and PTY connections
 */

import { appState } from './state.js';
import { showTabContextMenu } from './context-menus.js';
import { setupLogsTerminal, setupPtyTerminal, clearTerminalSession } from './terminal-setup.js';
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
    // ResizeObserver will handle most cases, but do one fit for immediate feedback
    if (activeTabId) {
      const terminalInfo = terminals.get(activeTabId);
      if (terminalInfo) {
        requestAnimationFrame(() => {
          if (terminalInfo.fitAddon) {
            terminalInfo.fitAddon.fit();
          }
          // Refocus terminal after filter change
          if (terminalInfo.terminal && !terminalInfo.isWebUI) {
            terminalInfo.terminal.focus();
          }
        });
      }
    }
  });

  // Setup empty state with options
  setupEmptyState();

  // Restore terminal tabs from previous session
  restoreTerminalTabs();
}

/**
 * Save terminal session to sessionStorage
 */
function saveTerminalSession(tabId, worktreeName, command, isWebUI, isLogs, isCombinedLogs, serviceName, uiPort) {
  try {
    const sessions = JSON.parse(sessionStorage.getItem('terminal-sessions') || '[]');

    // Check if session already exists
    const existingIndex = sessions.findIndex(s => s.tabId === tabId);
    const sessionData = {
      tabId,
      worktreeName,
      command,
      isWebUI,
      isLogs,
      isCombinedLogs,
      serviceName,
      uiPort,
      timestamp: Date.now()
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = sessionData;
    } else {
      sessions.push(sessionData);
    }

    sessionStorage.setItem('terminal-sessions', JSON.stringify(sessions));
  } catch (error) {
    console.error('Failed to save terminal session:', error);
  }
}

/**
 * Remove terminal session from sessionStorage
 */
function removeTerminalSession(tabId) {
  try {
    const sessions = JSON.parse(sessionStorage.getItem('terminal-sessions') || '[]');
    const filtered = sessions.filter(s => s.tabId !== tabId);
    sessionStorage.setItem('terminal-sessions', JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove terminal session:', error);
  }
}

/**
 * Save active tab to sessionStorage
 */
function saveActiveTab(tabId) {
  try {
    sessionStorage.setItem('active-terminal-tab', tabId);
  } catch (error) {
    console.error('Failed to save active tab:', error);
  }
}

/**
 * Restore terminal tabs from sessionStorage
 */
async function restoreTerminalTabs() {
  try {
    const sessionsJson = sessionStorage.getItem('terminal-sessions');
    if (!sessionsJson) {
      console.log('[restoreTerminalTabs] No saved sessions found');
      return;
    }

    const sessions = JSON.parse(sessionsJson);
    const activeTabId = sessionStorage.getItem('active-terminal-tab');
    const now = Date.now();
    const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

    console.log(`[restoreTerminalTabs] Found ${sessions.length} saved sessions`);

    // Fetch current worktrees to validate sessions
    const response = await fetch('/api/worktrees');
    const worktrees = await response.json();
    const worktreeNames = new Set(worktrees.map(wt => wt.name));

    const validSessions = [];
    const invalidSessions = [];

    // Validate and restore each session
    for (const session of sessions) {
      // Check if session is expired
      if (now - session.timestamp > SESSION_EXPIRY) {
        console.log(`[restoreTerminalTabs] Session expired: ${session.tabId}`);
        invalidSessions.push(session.tabId);
        continue;
      }

      // Check if worktree still exists
      if (!worktreeNames.has(session.worktreeName)) {
        console.log(`[restoreTerminalTabs] Worktree no longer exists: ${session.worktreeName}`);
        invalidSessions.push(session.tabId);
        continue;
      }

      // For WebUI tabs, verify port is available
      if (session.isWebUI && !session.uiPort) {
        console.log(`[restoreTerminalTabs] WebUI session missing port: ${session.tabId}`);
        invalidSessions.push(session.tabId);
        continue;
      }

      validSessions.push(session);
    }

    // Restore valid sessions and track new tab IDs
    const tabIdMapping = new Map(); // old -> new
    const restoredTabs = [];

    for (const session of validSessions) {
      try {
        console.log(`[restoreTerminalTabs] Restoring session: ${session.tabId} (${session.worktreeName})`);

        const newTabId = `tab-${nextTabId}`;
        tabIdMapping.set(session.tabId, newTabId);

        createTerminalTab(
          session.worktreeName,
          session.command || 'claude',
          session.isWebUI || false,
          session.uiPort || null,
          session.isLogs || false,
          session.serviceName || null,
          session.isCombinedLogs || false
        );

        restoredTabs.push(newTabId);
        console.log(`[restoreTerminalTabs] ✓ Restored: ${session.tabId} -> ${newTabId}`);
      } catch (error) {
        console.error(`[restoreTerminalTabs] Failed to restore ${session.tabId}:`, error);
        invalidSessions.push(session.tabId);
      }
    }

    // Clean up invalid sessions
    if (invalidSessions.length > 0) {
      const validSessionData = validSessions.filter(s =>
        !invalidSessions.includes(s.tabId)
      ).map(s => ({
        tabId: s.tabId,
        worktreeName: s.worktreeName,
        command: s.command,
        isWebUI: s.isWebUI,
        isLogs: s.isLogs,
        isCombinedLogs: s.isCombinedLogs,
        serviceName: s.serviceName,
        uiPort: s.uiPort,
        timestamp: s.timestamp
      }));
      sessionStorage.setItem('terminal-sessions', JSON.stringify(validSessionData));
      console.log(`[restoreTerminalTabs] Cleaned up ${invalidSessions.length} invalid sessions`);
    }

    // Restore active tab if it was restored
    const savedActiveTabId = sessionStorage.getItem('active-terminal-tab');
    const newActiveTabId = tabIdMapping.get(savedActiveTabId);

    if (newActiveTabId && terminals.has(newActiveTabId)) {
      console.log(`[restoreTerminalTabs] Restoring active tab: ${savedActiveTabId} -> ${newActiveTabId}`);
      switchToTab(newActiveTabId);
    } else if (restoredTabs.length > 0) {
      // Switch to first restored tab
      const firstTabId = restoredTabs[0];
      if (terminals.has(firstTabId)) {
        switchToTab(firstTabId);
      }
    }

    console.log(`[restoreTerminalTabs] Restoration complete: ${validSessions.length} tabs restored`);
  } catch (error) {
    console.error('[restoreTerminalTabs] Error:', error);
    // Clear corrupted session data
    sessionStorage.removeItem('terminal-sessions');
    sessionStorage.removeItem('active-terminal-tab');
  }
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
  tab.draggable = true;
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

  // Add drag-and-drop reordering
  tab.ondragstart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    tab.classList.add('dragging');
  };

  tab.ondragend = (e) => {
    tab.classList.remove('dragging');
    // Remove all drag-over classes
    document.querySelectorAll('.terminal-tab').forEach(t => t.classList.remove('drag-over'));
  };

  tab.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draggingTab = document.querySelector('.terminal-tab.dragging');
    if (draggingTab && draggingTab !== tab) {
      tab.classList.add('drag-over');
    }
  };

  tab.ondragleave = (e) => {
    tab.classList.remove('drag-over');
  };

  tab.ondrop = (e) => {
    e.preventDefault();
    tab.classList.remove('drag-over');

    const draggedTabId = e.dataTransfer.getData('text/plain');
    const draggedTab = document.getElementById(draggedTabId);

    if (draggedTab && draggedTab !== tab) {
      const tabsContainer = document.getElementById('terminal-tabs');
      const allTabs = Array.from(tabsContainer.children);
      const draggedIndex = allTabs.indexOf(draggedTab);
      const targetIndex = allTabs.indexOf(tab);

      // Reorder DOM
      if (draggedIndex < targetIndex) {
        tabsContainer.insertBefore(draggedTab, tab.nextSibling);
      } else {
        tabsContainer.insertBefore(draggedTab, tab);
      }

      // Also reorder panels to match
      const panelsContainer = document.getElementById('terminal-panels');
      const draggedPanel = document.getElementById(`${draggedTabId}-panel`);
      const targetPanel = document.getElementById(`${tabId}-panel`);

      if (draggedPanel && targetPanel) {
        if (draggedIndex < targetIndex) {
          panelsContainer.insertBefore(draggedPanel, targetPanel.nextSibling);
        } else {
          panelsContainer.insertBefore(draggedPanel, targetPanel);
        }
      }
    }
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

    // Update tab title when iframe loads
    const iframe = document.getElementById(`${tabId}-iframe`);
    if (iframe) {
      iframe.addEventListener('load', () => {
        try {
          const iframeTitle = iframe.contentDocument?.title || iframe.contentWindow?.document?.title;
          if (iframeTitle && iframeTitle.trim()) {
            const tabElement = document.getElementById(tabId);
            if (tabElement) {
              const tabLabel = tabElement.querySelector('span:first-child');
              if (tabLabel) {
                tabLabel.innerHTML = `<i data-lucide="globe" class="lucide-sm"></i> ${iframeTitle}`;
                // Reinitialize Lucide icons
                if (window.lucide) {
                  window.lucide.createIcons();
                }
              }
            }
          }
        } catch (e) {
          // CORS prevents access to iframe title - keep default label
          console.log(`[WebUI] Could not access iframe title (CORS): ${e.message}`);
        }
      });
    }

    switchToTab(tabId);
    saveTerminalSession(tabId, worktreeName, command, isWebUI, isLogs, isCombinedLogs, serviceName, uiPort);
    return;
  }

  // Initialize terminal for logs or PTY tabs
  if (isLogs || isCombinedLogs) {
    setupLogsTerminal(tabId, panel, worktreeName, serviceName, isCombinedLogs, terminals, activeTabId, switchToTab);
  } else {
    setupPtyTerminal(tabId, panel, worktreeName, command, terminals, activeTabId, switchToTab);
  }

  // Save terminal session to sessionStorage
  saveTerminalSession(tabId, worktreeName, command, isWebUI, isLogs, isCombinedLogs, serviceName, uiPort);

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

  // Save active tab to sessionStorage
  saveActiveTab(tabId);

  // Remember last active tab for this worktree
  const tabInfo = appState.tabs.get(tabId);
  if (tabInfo && tabInfo.worktree) {
    appState.setLastActiveTab(tabInfo.worktree, tabId);
  }

  // Fit the terminal and give it focus
  const terminalInfo = terminals.get(tabId);
  if (terminalInfo) {
    // ResizeObserver will handle the fit automatically when panel becomes visible
    // But do one immediate fit to ensure sizing happens quickly
    requestAnimationFrame(() => {
      if (terminalInfo.fitAddon) {
        terminalInfo.fitAddon.fit();
      }
      // Focus terminal so cursor appears and keyboard input works
      if (terminalInfo.terminal && !terminalInfo.isWebUI) {
        terminalInfo.terminal.focus();
      }
    });
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
      // Clear any pending reconnection timeouts
      if (terminalInfo.reconnectState && terminalInfo.reconnectState.timeoutId) {
        clearTimeout(terminalInfo.reconnectState.timeoutId);
      }

      // Close WebSocket
      if (terminalInfo.socket) {
        terminalInfo.socket.close();
      }

      // Dispose terminal
      if (terminalInfo.terminal) {
        terminalInfo.terminal.dispose();
      }

      // Cleanup ResizeObserver
      if (terminalInfo.resizeHandler) {
        // resizeHandler is now the cleanup function, not an event listener
        terminalInfo.resizeHandler();
      }

      // Clear session ID from sessionStorage for PTY terminals (not logs)
      // This ensures explicitly closed terminals don't reconnect on page refresh
      if (!terminalInfo.isLogs && terminalInfo.command) {
        clearTerminalSession(tabId);
      }
    }

    terminals.delete(tabId);
  }

  // Remove from appState
  appState.removeTab(tabId);

  // Remove from sessionStorage
  removeTerminalSession(tabId);

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
      sessionStorage.removeItem('active-terminal-tab');
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
