/**
 * WebSocket Module
 * Handles WebSocket connection and event routing
 */

import { appState } from './state.js';

let ws = null;

/**
 * Connect to WebSocket server
 */
export function connectWebSocket() {
  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const { event: eventType, data } = JSON.parse(event.data);
    console.log('WebSocket event:', eventType, data);

    // Route events
    switch (eventType) {
      case 'worktree:progress':
        handleProgressUpdate(data);
        break;
      case 'worktree:created':
        handleWorktreeCreated(data);
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
    console.log('WebSocket closed, reconnecting...');
    setTimeout(connectWebSocket, 1000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

/**
 * Handle progress update event
 */
function handleProgressUpdate(data) {
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

  // Update all steps
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

  // Update step status text
  const stepElement = document.querySelector(`.progress-step[data-step="${data.step}"]`);
  if (stepElement) {
    const statusEl = document.getElementById(`status-${data.step}`);
    if (statusEl && data.message && data.message.length < 50 && !data.message.includes('\n')) {
      statusEl.textContent = data.message;
    }
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

    // Limit to last 150 lines
    while (progressOutput.children.length > 150) {
      progressOutput.removeChild(progressOutput.firstChild);
    }
  }

  // If error, re-enable buttons
  if (data.step === 'error') {
    const createButton = document.getElementById('create-button');
    const cancelButton = document.getElementById('cancel-button');
    if (createButton) createButton.disabled = false;
    if (cancelButton) cancelButton.disabled = false;
    setTimeout(() => {
      window.hideCreateModal?.();
    }, 3000);
  }
}

/**
 * Handle worktree created event
 */
function handleWorktreeCreated(data) {
  console.log('[handleWorktreeCreated] Called with data:', data);

  // Give user time to see completion message before closing modal
  setTimeout(() => {
    window.hideCreateModal?.();
    console.log('[handleWorktreeCreated] Modal hidden, calling refreshWorktrees');
    window.refreshWorktrees?.();
    console.log('[handleWorktreeCreated] refreshWorktrees called');
  }, 1500);
}

/**
 * Get WebSocket instance (for other modules)
 */
export function getWebSocket() {
  return ws;
}
