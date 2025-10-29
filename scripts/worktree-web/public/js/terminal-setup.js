/**
 * Terminal Setup Module
 * Handles xterm.js initialization for different terminal types
 */

/**
 * Session Storage Helpers
 * Store and retrieve terminal session IDs for reconnection after page refresh
 */

/**
 * Save terminal session ID to sessionStorage
 * @param {string} worktreeName - Name of the worktree
 * @param {string} command - Command type (claude, codex, shell)
 * @param {string} sessionId - Session ID from server
 */
export function saveTerminalSession(worktreeName, command, sessionId) {
  const key = `terminal-session-${worktreeName}-${command}`;
  sessionStorage.setItem(key, sessionId);
  console.log(`Saved session ID for ${worktreeName}:${command} -> ${sessionId}`);
}

/**
 * Get terminal session ID from sessionStorage
 * @param {string} worktreeName - Name of the worktree
 * @param {string} command - Command type (claude, codex, shell)
 * @returns {string|null} Session ID or null if not found
 */
export function getTerminalSession(worktreeName, command) {
  const key = `terminal-session-${worktreeName}-${command}`;
  const sessionId = sessionStorage.getItem(key);
  if (sessionId) {
    console.log(`Retrieved session ID for ${worktreeName}:${command} -> ${sessionId}`);
  }
  return sessionId;
}

/**
 * Clear terminal session ID from sessionStorage
 * @param {string} worktreeName - Name of the worktree
 * @param {string} command - Command type (claude, codex, shell)
 */
export function clearTerminalSession(worktreeName, command) {
  const key = `terminal-session-${worktreeName}-${command}`;
  sessionStorage.removeItem(key);
  console.log(`Cleared session ID for ${worktreeName}:${command}`);
}

// Reconnection constants
const RECONNECT_INITIAL_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds
const RECONNECT_MULTIPLIER = 2;
const RECONNECT_MAX_ATTEMPTS = 10;

/**
 * Create reconnection overlay
 */
function createReconnectionOverlay(panel) {
  const overlay = document.createElement('div');
  overlay.className = 'terminal-reconnect-overlay';
  overlay.innerHTML = `
    <div class="reconnect-content">
      <div class="reconnect-spinner"></div>
      <div class="reconnect-message">Reconnecting...</div>
      <div class="reconnect-attempt">Attempt <span class="attempt-number">1</span> of ${RECONNECT_MAX_ATTEMPTS}</div>
    </div>
  `;
  panel.appendChild(overlay);
  return overlay;
}

/**
 * Update reconnection overlay
 */
function updateReconnectionOverlay(overlay, attempt) {
  const attemptNumber = overlay.querySelector('.attempt-number');
  if (attemptNumber) {
    attemptNumber.textContent = attempt;
  }
}

/**
 * Show reconnection error
 */
function showReconnectionError(overlay) {
  overlay.innerHTML = `
    <div class="reconnect-content reconnect-error">
      <div class="reconnect-icon">⚠</div>
      <div class="reconnect-message">Connection Failed</div>
      <div class="reconnect-detail">Unable to reconnect after ${RECONNECT_MAX_ATTEMPTS} attempts</div>
    </div>
  `;
}

/**
 * Remove reconnection overlay
 */
function removeReconnectionOverlay(panel) {
  const overlay = panel.querySelector('.terminal-reconnect-overlay');
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Setup logs terminal (single service or combined)
 */
export function setupLogsTerminal(tabId, panel, worktreeName, serviceName, isCombinedLogs, terminals, activeTabId, switchToTab) {
  const terminal = new Terminal({
    cursorBlink: false,
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9'
    },
    allowProposedApi: true
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(panel.querySelector('.terminal-wrapper'));

  // Fit terminal after delay to ensure toolbar is rendered
  setTimeout(() => fitAddon.fit(), isCombinedLogs ? 100 : 150);

  // Handle window resize
  const resizeHandler = () => {
    if (activeTabId === tabId) {
      fitAddon.fit();
    }
  };
  window.addEventListener('resize', resizeHandler);

  // Reconnection state
  const reconnectState = {
    attempt: 0,
    delay: RECONNECT_INITIAL_DELAY,
    timeoutId: null,
    isReconnecting: false,
    overlay: null
  };

  // Connect to logs WebSocket
  const wsUrl = isCombinedLogs
    ? `ws://${window.location.host}/logs/${worktreeName}`
    : `ws://${window.location.host}/logs/${worktreeName}/${serviceName}`;

  function connectLogsWebSocket() {
    const logsSocket = new WebSocket(wsUrl);

    logsSocket.onopen = () => {
      console.log('Logs WebSocket connected');
      // Clear reconnection state on successful connection
      reconnectState.attempt = 0;
      reconnectState.delay = RECONNECT_INITIAL_DELAY;
      reconnectState.isReconnecting = false;
      if (reconnectState.timeoutId) {
        clearTimeout(reconnectState.timeoutId);
        reconnectState.timeoutId = null;
      }
      // Remove overlay if present
      if (reconnectState.overlay) {
        removeReconnectionOverlay(panel);
        reconnectState.overlay = null;
      }
      // Update terminal info
      const terminalInfo = terminals.get(tabId);
      if (terminalInfo) {
        terminalInfo.socket = logsSocket;
      }
    };

    logsSocket.onmessage = (event) => {
      terminal.write(event.data);
    };

    logsSocket.onerror = (error) => {
      console.error('Logs WebSocket error:', error);
      if (!reconnectState.isReconnecting) {
        terminal.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
      }
    };

    logsSocket.onclose = () => {
      console.log('Logs WebSocket closed');
      const terminalInfo = terminals.get(tabId);
      // Only attempt reconnection if terminal still exists (not manually closed)
      if (terminalInfo && !reconnectState.isReconnecting) {
        if (!reconnectState.isReconnecting) {
          terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
        }
        attemptReconnect();
      }
    };

    return logsSocket;
  }

  function attemptReconnect() {
    if (reconnectState.attempt >= RECONNECT_MAX_ATTEMPTS) {
      console.log('Max reconnection attempts reached');
      terminal.write('\r\n\x1b[31mFailed to reconnect after ' + RECONNECT_MAX_ATTEMPTS + ' attempts\x1b[0m\r\n');
      if (!reconnectState.overlay) {
        reconnectState.overlay = createReconnectionOverlay(panel);
      }
      showReconnectionError(reconnectState.overlay);
      return;
    }

    reconnectState.isReconnecting = true;
    reconnectState.attempt++;

    // Show overlay on first attempt
    if (reconnectState.attempt === 1) {
      reconnectState.overlay = createReconnectionOverlay(panel);
    } else if (reconnectState.overlay) {
      updateReconnectionOverlay(reconnectState.overlay, reconnectState.attempt);
    }

    console.log(`Attempting reconnection ${reconnectState.attempt}/${RECONNECT_MAX_ATTEMPTS} in ${reconnectState.delay}ms`);

    reconnectState.timeoutId = setTimeout(() => {
      connectLogsWebSocket();
      // Exponential backoff
      reconnectState.delay = Math.min(reconnectState.delay * RECONNECT_MULTIPLIER, RECONNECT_MAX_DELAY);
    }, reconnectState.delay);
  }

  const logsSocket = connectLogsWebSocket();

  terminals.set(tabId, {
    isLogs: true,
    isCombinedLogs,
    terminal,
    socket: logsSocket,
    worktree: worktreeName,
    service: serviceName || null,
    fitAddon,
    resizeHandler,
    reconnectState
  });

  switchToTab(tabId);
}

/**
 * Setup PTY terminal (claude, codex, shell)
 */
export function setupPtyTerminal(tabId, panel, worktreeName, command, terminals, activeTabId, switchToTab) {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selection: '#264f78'
    },
    allowProposedApi: true
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(panel.querySelector('.terminal-wrapper'));

  // Fit terminal after delay
  setTimeout(() => fitAddon.fit(), 100);

  // Handle window resize
  const resizeHandler = () => {
    if (activeTabId === tabId) {
      fitAddon.fit();
    }
  };
  window.addEventListener('resize', resizeHandler);

  // Reconnection state
  // Try to retrieve existing session ID from sessionStorage
  const savedSessionId = getTerminalSession(worktreeName, command);
  const reconnectState = {
    attempt: 0,
    delay: RECONNECT_INITIAL_DELAY,
    timeoutId: null,
    isReconnecting: false,
    overlay: null,
    sessionId: savedSessionId
  };

  // Connect WebSocket for PTY
  const wsUrl = `ws://${window.location.host}/terminal/${worktreeName}?command=${command}`;

  function connectPtyWebSocket() {
    // If we have a session ID from previous connection, try to reconnect to it
    const url = reconnectState.sessionId
      ? `${wsUrl}&sessionId=${reconnectState.sessionId}`
      : wsUrl;

    const terminalSocket = new WebSocket(url);

    // Send resize events to PTY
    terminal.onResize(({ cols, rows }) => {
      if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
        terminalSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    terminalSocket.onopen = () => {
      console.log(`Terminal WebSocket connected: ${tabId}`);
      // Clear reconnection state on successful connection
      reconnectState.attempt = 0;
      reconnectState.delay = RECONNECT_INITIAL_DELAY;
      reconnectState.isReconnecting = false;
      if (reconnectState.timeoutId) {
        clearTimeout(reconnectState.timeoutId);
        reconnectState.timeoutId = null;
      }
      // Remove overlay if present
      if (reconnectState.overlay) {
        removeReconnectionOverlay(panel);
        reconnectState.overlay = null;
      }
      // Update terminal info
      const terminalInfo = terminals.get(tabId);
      if (terminalInfo) {
        terminalInfo.socket = terminalSocket;
      }
    };

    terminalSocket.onmessage = (event) => {
      try {
        // Check if message contains session ID or status update
        const data = JSON.parse(event.data);
        if (data.type === 'session' && data.sessionId) {
          reconnectState.sessionId = data.sessionId;
          // Save session ID to sessionStorage for persistence across page refreshes
          saveTerminalSession(worktreeName, command, data.sessionId);
          console.log(`PTY session ID: ${data.sessionId}`);
          return;
        }
        if (data.type === 'status') {
          // Handle backpressure status messages
          if (data.paused) {
            console.warn(`[BACKPRESSURE] Terminal output paused: ${data.message}`);
            terminal.write(`\r\n\x1b[33m${data.message}\x1b[0m\r\n`);
          } else if (data.message === '') {
            console.log(`[BACKPRESSURE] Terminal output resumed`);
            terminal.write(`\r\n\x1b[32mOutput resumed\x1b[0m\r\n`);
          }
          return;
        }
      } catch (e) {
        // Not JSON, treat as regular terminal data
      }
      terminal.write(event.data);
    };

    terminalSocket.onerror = (error) => {
      console.error('Terminal WebSocket error:', error);
      if (!reconnectState.isReconnecting) {
        terminal.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
      }
    };

    terminalSocket.onclose = () => {
      console.log(`Terminal WebSocket closed: ${tabId}`);
      const terminalInfo = terminals.get(tabId);
      // Only attempt reconnection if terminal still exists (not manually closed)
      if (terminalInfo && !reconnectState.isReconnecting) {
        if (!reconnectState.isReconnecting) {
          terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
        }
        attemptReconnect();
      }
    };

    // Send terminal input to PTY
    terminal.onData(data => {
      if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
        terminalSocket.send(data);
      }
    });

    return terminalSocket;
  }

  function attemptReconnect() {
    if (reconnectState.attempt >= RECONNECT_MAX_ATTEMPTS) {
      console.log('Max reconnection attempts reached');
      terminal.write('\r\n\x1b[31mFailed to reconnect after ' + RECONNECT_MAX_ATTEMPTS + ' attempts\x1b[0m\r\n');
      if (!reconnectState.overlay) {
        reconnectState.overlay = createReconnectionOverlay(panel);
      }
      showReconnectionError(reconnectState.overlay);
      return;
    }

    reconnectState.isReconnecting = true;
    reconnectState.attempt++;

    // Show overlay on first attempt
    if (reconnectState.attempt === 1) {
      reconnectState.overlay = createReconnectionOverlay(panel);
    } else if (reconnectState.overlay) {
      updateReconnectionOverlay(reconnectState.overlay, reconnectState.attempt);
    }

    console.log(`Attempting reconnection ${reconnectState.attempt}/${RECONNECT_MAX_ATTEMPTS} in ${reconnectState.delay}ms`);

    reconnectState.timeoutId = setTimeout(() => {
      connectPtyWebSocket();
      // Exponential backoff
      reconnectState.delay = Math.min(reconnectState.delay * RECONNECT_MULTIPLIER, RECONNECT_MAX_DELAY);
    }, reconnectState.delay);
  }

  const terminalSocket = connectPtyWebSocket();

  terminals.set(tabId, {
    terminal,
    socket: terminalSocket,
    worktree: worktreeName,
    command,
    fitAddon,
    resizeHandler,
    reconnectState
  });

  switchToTab(tabId);
}
