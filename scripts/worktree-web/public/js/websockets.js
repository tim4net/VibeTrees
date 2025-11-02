/**
 * WebSocket Module
 * Handles WebSocket connection and event routing
 */

import { appState } from './state.js';

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const INITIAL_RECONNECT_DELAY = 1000; // Start with 1 second

/**
 * Connect to WebSocket server
 */
export function connectWebSocket() {
  // Prevent multiple concurrent connection attempts
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    console.log('WebSocket already connecting or connected');
    return;
  }

  // Update status to connecting
  updateConnectionStatus('connecting');

  // CRITICAL: Use wss:// on HTTPS to avoid mixed content blocking
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${scheme}://${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0; // Reset counter on successful connection
    updateConnectionStatus('connected');
  };

  ws.onmessage = (event) => {
    const { event: eventType, data } = JSON.parse(event.data);
    console.log('WebSocket event:', eventType, data);

    // Route events
    switch (eventType) {
      case 'worktree:creating':
        handleWorktreeCreating(data);
        break;
      case 'worktree:progress':
        handleProgressUpdate(data);
        break;
      case 'worktree:created':
        handleWorktreeCreated(data);
        break;
      case 'worktree:error':
        handleWorktreeError(data);
        break;
      case 'worktree:deleted':
      case 'services:started':
      case 'services:stopped':
        // Trigger worktree refresh
        window.refreshWorktrees?.();
        break;
    }
  };

  ws.onclose = () => {
    // Calculate exponential backoff delay
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    reconnectAttempts++;
    console.log(`WebSocket closed, reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);

    // Update status to reconnecting
    updateConnectionStatus('reconnecting');

    setTimeout(connectWebSocket, delay);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateConnectionStatus('error');
    // onclose will handle reconnection
  };
}

/**
 * Update WebSocket connection status indicator
 */
function updateConnectionStatus(state) {
  const wsConnection = document.getElementById('ws-connection');
  const wsIndicator = wsConnection?.querySelector('.ws-indicator');

  if (!wsConnection || !wsIndicator) {
    console.warn('[websockets] Connection status element not found');
    return;
  }

  // Update indicator state
  wsIndicator.setAttribute('data-state', state);

  // Update tooltip
  const statusMessages = {
    connecting: 'WebSocket: Connecting...',
    connected: 'WebSocket: Connected',
    reconnecting: `WebSocket: Reconnecting... (attempt ${reconnectAttempts})`,
    disconnected: 'WebSocket: Disconnected',
    error: 'WebSocket: Connection error'
  };

  wsConnection.title = statusMessages[state] || 'WebSocket: Unknown state';

  console.log(`[websockets] Connection status updated: ${state}`);
}

/**
 * Update progress UI based on step completion
 * Extracted common progress UI logic for reusability
 */
function updateProgressUI(data) {
  const progressContainer = document.getElementById('create-progress');
  const progressOutput = document.getElementById('progress-output');
  const progressHeaderText = document.getElementById('progress-header-text');

  if (!progressContainer || !progressOutput || !progressHeaderText) return;

  // Show progress container
  progressContainer.classList.add('active');

  // Update header based on step
  const stepLabels = {
    git: 'Creating git worktree',
    database: 'Copying database',
    ports: 'Configuring environment',
    containers: 'Starting containers',
    complete: 'Worktree ready',
    error: 'Error occurred'
  };
  progressHeaderText.textContent = stepLabels[data.step] || 'Processing...';

  // Update step status
  const allSteps = ['git', 'database', 'ports', 'containers', 'complete'];
  const currentIndex = allSteps.indexOf(data.step);

  // Update all steps - mark completed, active, error, or pending
  document.querySelectorAll('.progress-step').forEach((stepEl) => {
    const stepName = stepEl.getAttribute('data-step');
    const stepIndex = allSteps.indexOf(stepName);

    stepEl.classList.remove('pending', 'active', 'completed', 'error');

    if (data.step === 'error' && stepIndex === currentIndex) {
      stepEl.classList.add('error');
    } else if (stepIndex < currentIndex) {
      stepEl.classList.add('completed');
    } else if (stepIndex === currentIndex) {
      stepEl.classList.add('active');
    } else {
      stepEl.classList.add('pending');
    }
  });

  // Update step status text (short messages only)
  const statusEl = document.getElementById(`status-${data.step}`);
  if (statusEl && data.message && data.message.length < 50 && !data.message.includes('\n')) {
    statusEl.textContent = data.message;
  }

  // Append to output log
  if (data.message && data.message.length > 0) {
    progressOutput.classList.add('active');
    const line = document.createElement('div');
    line.className = 'progress-output-line';
    line.textContent = data.message;
    progressOutput.appendChild(line);

    // Auto-scroll to bottom
    progressOutput.scrollTop = progressOutput.scrollHeight;

    // Limit to last 150 lines to prevent memory bloat
    while (progressOutput.children.length > 150) {
      progressOutput.removeChild(progressOutput.firstChild);
    }
  }
}

/**
 * Handle progress update event
 */
function handleProgressUpdate(data) {
  // Store progress in worktree progressLog
  if (data.name && data.message && window.appState && window.appState.appendWorktreeProgress) {
    window.appState.appendWorktreeProgress(data.name, data.message);
  }

  // Update UI with progress
  updateProgressUI(data);

  // If error, auto-expand logs and set error state
  if (data.step === 'error') {
    window.setModalState?.('error');
    window.autoExpandLogs?.();
  }
}

/**
 * Handle worktree creating event (202 response)
 */
function handleWorktreeCreating(data) {
  console.log('[handleWorktreeCreating] Called with data:', data);

  // Add worktree to app state in "creating" status
  if (window.appState && window.appState.addCreatingWorktree) {
    window.appState.addCreatingWorktree({
      name: data.name,
      branch: data.branch,
      agent: data.agent || 'claude',
      status: 'creating',
      progressLog: []
    });
  }

  // Trigger UI update
  window.refreshWorktrees?.();
}

/**
 * Handle worktree created event - auto-close modal and select the new worktree
 */
function handleWorktreeCreated(data) {
  console.log('[handleWorktreeCreated] Called with data:', data);

  // Update worktree status to 'ready'
  if (window.appState && window.appState.updateWorktreeStatus) {
    window.appState.updateWorktreeStatus(data.name, 'ready');
  }

  // Refresh to show final state
  window.refreshWorktrees?.();

  // Set modal state to success
  window.setModalState?.('success');

  // Auto-close modal after 1s to show success state
  setTimeout(() => {
    window.hideCreateModal?.();

    // Show success toast notification (3-5 seconds)
    const message = `Created worktree '${data.name}' successfully!`;
    if (window.showToast) {
      window.showToast(message, 4000);
    }

    // Auto-select the newly created worktree
    if (window.appState && window.appState.selectWorktree) {
      window.appState.selectWorktree(data.name);
    }
  }, 1000);
}

/**
 * Handle worktree error event - set error state and expand logs
 */
function handleWorktreeError(data) {
  console.error('[handleWorktreeError] Error creating worktree:', data);

  // Update worktree status to 'error'
  if (window.appState && window.appState.updateWorktreeStatus) {
    window.appState.updateWorktreeStatus(data.name, 'error', data.error);
  }

  // Refresh to show error state
  window.refreshWorktrees?.();

  // Set modal state to error and auto-expand logs
  window.setModalState?.('error');
  window.autoExpandLogs?.();

  // Show error notification - informative but not blocking
  console.error(`Failed to create worktree ${data.name}: ${data.error}`);
  if (window.showToast) {
    window.showToast(`Error creating ${data.name}: ${data.error}`, 5000);
  }
}

/**
 * Get WebSocket instance (for other modules)
 */
export function getWebSocket() {
  return ws;
}

/**
 * Auto-expand logs on errors - exported for global use
 */
export function autoExpandLogs() {
  const logPanel = document.getElementById('progress-output');
  const logToggle = document.getElementById('log-toggle');

  if (logPanel && logPanel.classList.contains('collapsed')) {
    logPanel.classList.remove('collapsed');
  }

  if (logToggle) {
    const spanEl = logToggle.querySelector('span');
    if (spanEl) spanEl.textContent = 'Hide details';
  }
}

// Make functions available globally
window.autoExpandLogs = autoExpandLogs;
