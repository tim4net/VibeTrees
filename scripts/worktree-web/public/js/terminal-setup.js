/**
 * Terminal Setup Module
 * Handles xterm.js initialization for different terminal types
 */

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

  // Connect to logs WebSocket
  const wsUrl = isCombinedLogs
    ? `ws://${window.location.host}/logs/${worktreeName}`
    : `ws://${window.location.host}/logs/${worktreeName}/${serviceName}`;
  const logsSocket = new WebSocket(wsUrl);

  logsSocket.onmessage = (event) => {
    terminal.write(event.data);
  };

  logsSocket.onerror = (error) => {
    console.error('Logs WebSocket error:', error);
    terminal.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
  };

  logsSocket.onclose = () => {
    console.log('Logs WebSocket closed');
    terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
  };

  terminals.set(tabId, {
    isLogs: true,
    isCombinedLogs,
    terminal,
    socket: logsSocket,
    worktree: worktreeName,
    service: serviceName || null,
    fitAddon,
    resizeHandler
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

  // Connect WebSocket for PTY
  const wsUrl = `ws://${window.location.host}/terminal/${worktreeName}?command=${command}`;
  const terminalSocket = new WebSocket(wsUrl);

  // Send resize events to PTY
  terminal.onResize(({ cols, rows }) => {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      terminalSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  // Handle window resize
  const resizeHandler = () => {
    if (activeTabId === tabId) {
      fitAddon.fit();
    }
  };
  window.addEventListener('resize', resizeHandler);

  terminalSocket.onopen = () => {
    console.log(`Terminal WebSocket connected: ${tabId}`);
  };

  terminalSocket.onmessage = (event) => {
    terminal.write(event.data);
  };

  terminalSocket.onerror = (error) => {
    console.error('Terminal WebSocket error:', error);
    terminal.write('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
  };

  terminalSocket.onclose = () => {
    console.log(`Terminal WebSocket closed: ${tabId}`);
    terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
  };

  // Send terminal input to PTY
  terminal.onData(data => {
    if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
      terminalSocket.send(data);
    }
  });

  terminals.set(tabId, {
    terminal,
    socket: terminalSocket,
    worktree: worktreeName,
    command,
    fitAddon,
    resizeHandler
  });

  switchToTab(tabId);
}
