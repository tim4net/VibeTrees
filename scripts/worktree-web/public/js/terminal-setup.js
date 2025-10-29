/**
 * Terminal Setup Module
 * Handles xterm.js initialization for different terminal types
 */

// Check WebGL availability
if (typeof WebglAddon === 'undefined') {
  console.error('[Terminal] WebglAddon not loaded! Check CDN link.');
} else {
  console.log('[Terminal] WebglAddon available, version:', WebglAddon.WebglAddon.name);
}

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


/**
 * Clipboard notification helper
 * Shows a temporary notification for clipboard operations
 */
function showClipboardNotification(message) {
  // Create temporary notification
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  // Remove after 2 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * Context menu helper
 * Shows a simple context menu for copy/paste
 */
function showContextMenu(x, y, items) {
  // Remove existing menu if any
  const existingMenu = document.querySelector('.terminal-context-menu');
  if (existingMenu) existingMenu.remove();

  const menu = document.createElement('div');
  menu.className = 'terminal-context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: #2d2d2d;
    border: 1px solid #454545;
    border-radius: 4px;
    padding: 4px 0;
    z-index: 10000;
    min-width: 120px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  items.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      color: #d4d4d4;
      font-size: 13px;
    `;
    menuItem.addEventListener('mouseenter', () => {
      menuItem.style.background = '#3d3d3d';
    });
    menuItem.addEventListener('mouseleave', () => {
      menuItem.style.background = 'transparent';
    });
    menuItem.addEventListener('click', () => {
      item.action();
      menu.remove();
    });
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  // Remove menu on click outside
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

// Add CSS animations for notifications
if (!document.getElementById('terminal-clipboard-styles')) {
  const style = document.createElement('style');
  style.id = 'terminal-clipboard-styles';
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
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
      foreground: '#c9d1d9',
      cursor: '#c9d1d9',
      cursorAccent: '#0d1117'
    },
    allowProposedApi: true,
    scrollback: 50000, // Increase for logs
    fastScrollModifier: 'shift', // Shift+scroll for fast scrolling
    windowOptions: {
      setWinSizePixels: false
    }
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  // Enable WebGL rendering with fallback
  try {
    const webglAddon = new WebglAddon.WebglAddon();
    terminal.loadAddon(webglAddon);
    console.log('[Terminal] WebGL renderer enabled for logs');
  } catch (e) {
    console.warn('[Terminal] WebGL not available, using canvas:', e.message);
  }

  terminal.open(panel.querySelector('.terminal-wrapper'));

  // Copy/Paste keyboard shortcuts
  terminal.attachCustomKeyEventHandler((event) => {
    // Copy: Cmd+C (Mac) or Ctrl+Shift+C (Linux/Windows)
    const isCopy = (
      (event.metaKey && event.key === 'c' && !event.shiftKey && !event.ctrlKey) || // Mac: Cmd+C
      (event.ctrlKey && event.shiftKey && event.key === 'C') // Linux/Win: Ctrl+Shift+C
    );

    if (isCopy && terminal.hasSelection()) {
      // Copy selection to clipboard
      const selection = terminal.getSelection();
      navigator.clipboard.writeText(selection).then(() => {
        console.log('[Terminal] Copied to clipboard:', selection.substring(0, 50) + (selection.length > 50 ? '...' : ''));
        showClipboardNotification('Copied to clipboard');
      }).catch(err => {
        console.error('[Terminal] Copy failed:', err);
        terminal.write('\r\n\x1b[31mCopy failed: clipboard access denied\x1b[0m\r\n');
      });

      // Clear selection after copy (matches native terminal behavior)
      terminal.clearSelection();

      return false; // Prevent default
    }

    // Paste: Cmd+V (Mac) or Ctrl+Shift+V (Linux/Windows)
    const isPaste = (
      (event.metaKey && event.key === 'v' && !event.shiftKey && !event.ctrlKey) || // Mac: Cmd+V
      (event.ctrlKey && event.shiftKey && event.key === 'V') // Linux/Win: Ctrl+Shift+V
    );

    if (isPaste) {
      event.preventDefault(); // Prevent default paste behavior

      navigator.clipboard.readText().then(text => {
        if (text) {
          // Send pasted text through onData handler (will be sent to PTY)
          terminal.paste(text);
          console.log(`[Terminal] Pasted ${text.length} characters`);
          showClipboardNotification(`Pasted ${text.length} character${text.length === 1 ? '' : 's'}`);
        }
      }).catch(err => {
        console.error('[Terminal] Paste failed:', err);
        terminal.write('\r\n\x1b[31mPaste failed: clipboard access denied\x1b[0m\r\n');
      });

      return false; // Prevent default
    }

    // Let all other keys pass through (including Ctrl+C for SIGINT)
    return true;
  });

  // Right-click context menu for copy/paste
  const terminalElement = terminal.element;

  terminalElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    // Check if there's a selection
    if (terminal.hasSelection()) {
      // Create context menu with Copy option
      showContextMenu(event.clientX, event.clientY, [
        {
          label: 'Copy',
          action: () => {
            const selection = terminal.getSelection();
            navigator.clipboard.writeText(selection).then(() => {
              console.log('[Terminal] Copied via context menu');
              showClipboardNotification('Copied to clipboard');
              terminal.clearSelection();
            }).catch(err => {
              console.error('[Terminal] Copy failed:', err);
            });
          }
        }
      ]);
    } else {
      // Create context menu with Paste option
      showContextMenu(event.clientX, event.clientY, [
        {
          label: 'Paste',
          action: () => {
            navigator.clipboard.readText().then(text => {
              if (text) {
                terminal.paste(text);
                console.log('[Terminal] Pasted via context menu');
                showClipboardNotification('Pasted from clipboard');
              }
            }).catch(err => {
              console.error('[Terminal] Paste failed:', err);
            });
          }
        }
      ]);
    }
  });

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
      const data = event.data;

      // Fast path: Check for JSON only if starts with '{'
      // Most messages are log data, not JSON control messages
      if (data.length > 0 && data[0] === '{') {
        try {
          const msg = JSON.parse(data);

          if (msg.type === 'clear') {
            terminal.clear();
            return;
          }

          // Fall through if JSON but unknown type
        } catch (e) {
          // Not valid JSON, fall through to write
        }
      }

      // Write log data to terminal
      terminal.write(data);
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
    cursorBlink: true, // Enable for PTY terminals
    fontSize: 13,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      selection: 'rgba(255, 255, 255, 0.3)'
    },
    allowProposedApi: true,
    scrollback: 10000, // Reasonable for PTY
    fastScrollModifier: 'shift',
    windowOptions: {
      setWinSizePixels: false
    },
    convertEol: false, // Let shell handle line endings
    windowsMode: false // Set to true on Windows
  });

  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  // Enable WebGL rendering with fallback
  try {
    const webglAddon = new WebglAddon.WebglAddon();
    terminal.loadAddon(webglAddon);
    console.log(`[Terminal] WebGL renderer enabled for ${worktreeName}`);
  } catch (e) {
    console.warn(`[Terminal] WebGL not available for ${worktreeName}, using canvas:`, e.message);
  }

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

  // Performance tracking for local echo (outer scope for access by getStats)
  let echoTimes = [];
  let lastKeyTime = 0;

  function connectPtyWebSocket() {
    // If we have a session ID from previous connection, try to reconnect to it
    const url = reconnectState.sessionId
      ? `${wsUrl}&sessionId=${reconnectState.sessionId}`
      : wsUrl;

    const terminalSocket = new WebSocket(url);

    // Local echo configuration
    const LOCAL_ECHO_ENABLED = false; // DISABLED: Causing ghosting/duplication issues
    const LOCAL_ECHO_DIM = '\x1b[2m'; // ANSI dim
    const LOCAL_ECHO_RESET = '\x1b[0m'; // ANSI reset
    let pendingEcho = []; // Track pending echoed characters
    let serverEchoTimeout = null;
    const SERVER_ECHO_TIMEOUT = 100; // 100ms

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
      const data = event.data;

      // Fast path: Quick check if message looks like JSON
      // Most messages are terminal data (don't start with '{')
      if (data.length > 0 && data[0] === '{') {
        try {
          const msg = JSON.parse(data);

          // Handle session ID
          if (msg.type === 'session' && msg.sessionId) {
            reconnectState.sessionId = msg.sessionId;
            // Save session ID to sessionStorage for persistence across page refreshes
            saveTerminalSession(worktreeName, command, msg.sessionId);
            console.log(`PTY session ID: ${msg.sessionId}`);

            // Enable profiling if server has it enabled
            if (msg.profiling) {
              profilingEnabled = true;
              console.log(`[Profiling] Enabled - latency stats will be reported`);
            }

            // Show takeover warning if applicable
            if (msg.tookOver) {
              console.warn(`[TAKEOVER] This session was taken over from another client`);
            }
            return; // Don't write to terminal
          }

          // Handle takeover notification (this client was displaced)
          if (msg.type === 'takeover') {
            console.warn(`[TAKEOVER] ${msg.message}`);
            terminal.write(`\r\n\x1b[31m⚠ ${msg.message}\x1b[0m\r\n`);
            terminal.write(`\x1b[90mConnection closed. Refresh the page to reconnect.\x1b[0m\r\n`);
            // Close the socket - this client has been replaced
            terminalSocket.close();
            return;
          }

          // Handle status messages
          if (msg.type === 'status') {
            // Handle backpressure status messages
            if (msg.paused) {
              console.warn(`[BACKPRESSURE] Terminal output paused: ${msg.message}`);
              terminal.write(`\r\n\x1b[33m${msg.message}\x1b[0m\r\n`);
            } else if (msg.message === '') {
              console.log(`[BACKPRESSURE] Terminal output resumed`);
              terminal.write(`\r\n\x1b[32mOutput resumed\x1b[0m\r\n`);
            }
            return; // Don't write to terminal
          }

          // If parsed but not handled, fall through to write
        } catch (e) {
          // JSON-like but invalid, treat as terminal data
          // Fall through to write
        }
      }

      // Track latency for performance measurement (only if profiling enabled)
      if (profilingEnabled && lastKeyTime > 0) {
        const latency = performance.now() - lastKeyTime;
        echoTimes.push(latency);
        latencyMeasurements.push(latency);

        if (echoTimes.length >= 10) {
          const avg = echoTimes.reduce((a, b) => a + b) / echoTimes.length;
          console.log(`[Latency] Avg server echo: ${avg.toFixed(1)}ms`);
          echoTimes = [];
        }
        lastKeyTime = 0;
      }

      // Report detailed latency stats every 10 seconds (only if profiling enabled)
      if (profilingEnabled && Date.now() - lastLatencyReport > 10000 && latencyMeasurements.length > 0) {
        const sorted = [...latencyMeasurements].sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b) / sorted.length;
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const max = sorted[sorted.length - 1];

        console.log(`[Latency Stats] n=${sorted.length} avg=${avg.toFixed(1)}ms p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms max=${max.toFixed(1)}ms`);

        latencyMeasurements = [];
        lastLatencyReport = Date.now();
      }

      // Check if this is echo confirmation
      if (pendingEcho.length > 0 && data === pendingEcho[0]) {
        // Server echoed back our character - don't display again
        pendingEcho.shift();
        return;
      }

      // If pending echo doesn't match, clear it (out of sync)
      if (pendingEcho.length > 0 && data.length > 0) {
        // Clear pending echo if we receive something unexpected
        // This handles cases where server doesn't echo (raw mode, etc.)
        pendingEcho = [];
      }

      // Default: Write to terminal
      terminal.write(data);
    };

    terminalSocket.onerror = (error) => {
      console.error('Terminal WebSocket error:', error);
      if (!reconnectState.isReconnecting) {
        terminal.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
      }
    };

    terminalSocket.onclose = () => {
      console.log(`Terminal WebSocket closed: ${tabId}`);

      // Clear pending echo
      pendingEcho = [];

      const terminalInfo = terminals.get(tabId);

      // Clear any pending batched input
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
        inputBuffer = '';
      }

      // Only attempt reconnection if terminal still exists (not manually closed)
      if (terminalInfo && !reconnectState.isReconnecting) {
        if (!reconnectState.isReconnecting) {
          terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
        }
        attemptReconnect();
      }
    };

    // Message batching configuration
    const BATCH_INTERVAL_MS = 16; // One frame at 60fps
    let inputBuffer = '';
    let batchTimeout = null;

    // Performance tracking (enabled by server via session message)
    let profilingEnabled = false;
    let inputTimestamps = new Map(); // Track when each character was typed
    let latencyMeasurements = [];
    let lastLatencyReport = Date.now();

    // Send terminal input to PTY with batching
    terminal.onData((data) => {
      // Track key timing for performance measurement
      lastKeyTime = performance.now();

      // Store timestamp for this input with unique ID
      const inputId = `${Date.now()}-${Math.random()}`;
      inputTimestamps.set(inputId, performance.now());

      // Check for control characters that should clear pending echo
      if (data === '\x03' || // Ctrl+C
          data === '\x04' || // Ctrl+D
          data === '\r' ||   // Enter
          data === '\n') {   // Line feed
        // Clear pending echo on command submission
        pendingEcho = [];
      }

      // Local echo: Display immediately in dim color
      if (LOCAL_ECHO_ENABLED && terminalSocket?.readyState === WebSocket.OPEN) {
        // Don't echo control characters visually (except printable ones)
        const shouldEcho =
          data.length === 1 &&
          data.charCodeAt(0) >= 32 &&
          data.charCodeAt(0) < 127 &&
          data !== '\x7f'; // Not DEL

        if (shouldEcho) {
          // Display dimmed version immediately
          terminal.write(LOCAL_ECHO_DIM + data + LOCAL_ECHO_RESET);
          pendingEcho.push(data);

          // Set timeout to clear if server doesn't echo back
          // (Handles raw mode terminals)
          clearTimeout(serverEchoTimeout);
          serverEchoTimeout = setTimeout(() => {
            if (pendingEcho.length > 0) {
              // Server didn't echo - probably in raw mode
              // Clear pending echo to avoid confusion
              pendingEcho = [];
            }
          }, SERVER_ECHO_TIMEOUT);
        }
      }

      inputBuffer += data;

      // Flush immediately for control characters for better responsiveness
      const shouldFlushImmediately =
        data.includes('\r') || // Enter key
        data.includes('\n') || // Line feed
        data.includes('\x03') || // Ctrl+C
        data.includes('\x04'); // Ctrl+D

      if (shouldFlushImmediately && batchTimeout) {
        // Cancel batch timeout and flush immediately
        clearTimeout(batchTimeout);
        batchTimeout = null;

        if (inputBuffer && terminalSocket?.readyState === WebSocket.OPEN) {
          terminalSocket.send(inputBuffer);
          inputBuffer = '';
        }
      } else if (!batchTimeout) {
        batchTimeout = setTimeout(() => {
          if (inputBuffer && terminalSocket?.readyState === WebSocket.OPEN) {
            terminalSocket.send(inputBuffer);
            inputBuffer = '';
          }
          batchTimeout = null;
        }, BATCH_INTERVAL_MS);
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

  // Expose local echo controls for debugging
  const localEchoControls = {
    setEnabled: (enabled) => {
      // Note: LOCAL_ECHO_ENABLED is in the closure, we need to track this differently
      // For now, log the setting change
      console.log(`[Terminal] Local echo ${enabled ? 'enabled' : 'disabled'} for ${worktreeName}`);
      // Would need refactoring to make this truly dynamic
    },
    getStats: () => {
      if (echoTimes.length === 0) return null;
      const avg = echoTimes.reduce((a, b) => a + b) / echoTimes.length;
      const min = Math.min(...echoTimes);
      const max = Math.max(...echoTimes);
      return {
        avg: avg.toFixed(1),
        min: min.toFixed(1),
        max: max.toFixed(1),
        samples: echoTimes.length
      };
    }
  };

  terminals.set(tabId, {
    terminal,
    socket: terminalSocket,
    worktree: worktreeName,
    command,
    fitAddon,
    resizeHandler,
    reconnectState,
    localEchoControls
  });

  // Expose to window for debugging
  if (!window.terminalDebug) {
    window.terminalDebug = {};
  }
  window.terminalDebug[tabId] = localEchoControls;

  switchToTab(tabId);
}
