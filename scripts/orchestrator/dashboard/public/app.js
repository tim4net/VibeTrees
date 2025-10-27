// Dashboard state
let ws = null;
let sessionData = null;
let phasesData = [];
let checkpointsData = [];
const logEntries = [];

// Initialize dashboard
async function init() {
  connectWebSocket();
  await loadInitialData();
  render();

  // Poll for updates every 5 seconds
  setInterval(async () => {
    await loadInitialData();
    render();
  }, 5000);
}

// WebSocket connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    addLogEntry('system', 'Connected to orchestrator');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    addLogEntry('system', 'Disconnected from orchestrator');

    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
  addLogEntry(message.event, JSON.stringify(message.data, null, 2));

  switch (message.event) {
    case 'phase_started':
    case 'phase_completed':
    case 'phase_failed':
    case 'task_started':
    case 'task_completed':
    case 'task_failed':
    case 'checkpoint_created':
    case 'checkpoint_approved':
      // Reload data and re-render
      loadInitialData().then(render);
      break;
  }
}

// Load initial data from API
async function loadInitialData() {
  try {
    const [sessionRes, phasesRes, checkpointsRes] = await Promise.all([
      fetch('/api/session'),
      fetch('/api/phases'),
      fetch('/api/checkpoints')
    ]);

    const sessionJson = await sessionRes.json();
    const phasesJson = await phasesRes.json();
    const checkpointsJson = await checkpointsRes.json();

    sessionData = sessionJson.session;
    phasesData = phasesJson.phases;
    checkpointsData = checkpointsJson.checkpoints;
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Render dashboard
function render() {
  renderStatus();
  renderSessionInfo();
  renderPhases();
  renderCheckpoints();
  renderLog();
}

// Render status header
function renderStatus() {
  const statusEl = document.getElementById('status');

  if (!sessionData) {
    statusEl.textContent = 'No session';
    statusEl.className = 'status';
    return;
  }

  statusEl.textContent = sessionData.status || 'Unknown';
  statusEl.className = `status ${sessionData.status}`;
}

// Render session info
function renderSessionInfo() {
  const container = document.getElementById('session-info');

  if (!sessionData) {
    container.innerHTML = '<p class="empty-state">No active session</p>';
    return;
  }

  const created = new Date(sessionData.created_at * 1000).toLocaleString();

  container.innerHTML = `
    <p><strong>Session ID:</strong> ${sessionData.id}</p>
    <p><strong>Model:</strong> ${sessionData.model}</p>
    <p><strong>Status:</strong> ${sessionData.status}</p>
    <p><strong>Current Phase:</strong> ${sessionData.current_phase}</p>
    <p><strong>Started:</strong> ${created}</p>
  `;
}

// Render phases
function renderPhases() {
  const container = document.getElementById('phases-container');

  if (phasesData.length === 0) {
    container.innerHTML = '<p class="empty-state">No phases yet</p>';
    return;
  }

  container.innerHTML = phasesData.map(phase => {
    const tasksHtml = (phase.tasks || []).map(task => {
      const icon = getTaskIcon(task.status);
      return `
        <div class="task">
          <span class="task-icon">${icon}</span>
          <span>Task ${task.task_number}: ${task.description}</span>
          ${task.retry_count > 0 ? `<span style="color: #f59e0b; margin-left: 0.5rem;">(${task.retry_count} retries)</span>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="phase">
        <div class="phase-header">
          <div class="phase-title">Phase ${phase.phase_number}: ${phase.name}</div>
          <div class="phase-status ${phase.status}">${phase.status.replace('_', ' ')}</div>
        </div>
        <div class="phase-tasks">
          ${tasksHtml || '<p class="empty-state">No tasks</p>'}
        </div>
      </div>
    `;
  }).join('');
}

// Render checkpoints
function renderCheckpoints() {
  const container = document.getElementById('checkpoints-container');

  if (checkpointsData.length === 0) {
    container.innerHTML = '<p class="empty-state">No pending approvals</p>';
    return;
  }

  container.innerHTML = checkpointsData.map(checkpoint => `
    <div class="checkpoint">
      <div class="checkpoint-message">${checkpoint.message}</div>
      <div class="checkpoint-actions">
        <button class="approve" onclick="approveCheckpoint('${checkpoint.id}')">
          Approve & Continue
        </button>
        <button class="reject" disabled>
          Reject (CLI only)
        </button>
      </div>
    </div>
  `).join('');
}

// Render log
function renderLog() {
  const container = document.getElementById('log-container');

  if (logEntries.length === 0) {
    container.innerHTML = '<p class="empty-state">No events yet</p>';
    return;
  }

  // Show last 50 entries
  const recentEntries = logEntries.slice(-50).reverse();

  container.innerHTML = recentEntries.map(entry => `
    <div class="log-entry">
      <span class="log-timestamp">${entry.timestamp}</span>
      <span class="log-event">${entry.event}</span>
      <span>${entry.message}</span>
    </div>
  `).join('');
}

// Helper: Get task icon
function getTaskIcon(status) {
  switch (status) {
    case 'completed': return '✓';
    case 'in_progress': return '⏳';
    case 'failed': return '✗';
    default: return '○';
  }
}

// Add log entry
function addLogEntry(event, message) {
  logEntries.push({
    timestamp: new Date().toLocaleTimeString(),
    event,
    message
  });

  // Keep only last 100 entries
  if (logEntries.length > 100) {
    logEntries.shift();
  }
}

// Approve checkpoint
async function approveCheckpoint(checkpointId) {
  try {
    const response = await fetch(`/api/checkpoints/${checkpointId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      addLogEntry('checkpoint', 'Approved checkpoint ' + checkpointId);
      await loadInitialData();
      render();
    } else {
      const error = await response.json();
      alert('Error approving checkpoint: ' + error.error);
    }
  } catch (error) {
    console.error('Error approving checkpoint:', error);
    alert('Error approving checkpoint: ' + error.message);
  }
}

// Start dashboard
init();
