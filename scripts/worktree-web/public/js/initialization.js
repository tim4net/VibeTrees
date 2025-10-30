/**
 * Initialization progress tracker for the UI
 * Shows background initialization status and progress
 */

export class InitializationTracker {
  constructor() {
    this.initialized = false;
    this.statusElement = null;
    this.pollInterval = null;
    this.overlayElement = null;
  }

  /**
   * Create and show the initialization overlay
   */
  createOverlay() {
    // Don't create if already exists
    if (this.overlayElement) return;

    const overlay = document.createElement('div');
    overlay.id = 'initialization-overlay';
    overlay.className = 'initialization-overlay';
    overlay.innerHTML = `
      <div class="initialization-content">
        <div class="initialization-header">
          <div class="spinner"></div>
          <h3>Initializing VibeTrees...</h3>
        </div>
        <div class="initialization-tasks" id="initialization-tasks">
        </div>
        <div class="initialization-progress">
          <div class="progress-bar">
            <div class="progress-fill" id="initialization-progress-bar" style="width: 0%"></div>
          </div>
          <div class="progress-text" id="initialization-progress-text">0%</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayElement = overlay;
  }

  /**
   * Start tracking initialization progress
   */
  async start() {
    // Check initial status
    const status = await this.fetchStatus();

    if (status.initialized) {
      // Already initialized, don't show overlay
      this.initialized = true;
      return;
    }

    // Create overlay and start polling
    this.createOverlay();
    this.updateDisplay(status);

    // Poll for updates
    this.pollInterval = setInterval(async () => {
      const status = await this.fetchStatus();
      this.updateDisplay(status);

      if (status.initialized) {
        this.onInitialized();
      }
    }, 500); // Poll every 500ms for smooth progress

    // Also listen for WebSocket updates
    this.listenForWebSocketUpdates();
  }

  /**
   * Fetch current initialization status from server
   */
  async fetchStatus() {
    try {
      const response = await fetch('/api/initialization/status');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('[InitializationTracker] Failed to fetch status:', error);
    }

    // Return default status if fetch fails
    return {
      initialized: true,
      overallProgress: 100,
      tasks: []
    };
  }

  /**
   * Update the display with current status
   */
  updateDisplay(status) {
    if (!this.overlayElement) return;

    // Update progress bar
    const progressBar = document.getElementById('initialization-progress-bar');
    const progressText = document.getElementById('initialization-progress-text');

    if (progressBar) {
      progressBar.style.width = `${status.overallProgress}%`;
    }
    if (progressText) {
      progressText.textContent = `${status.overallProgress}%`;
    }

    // Update task list
    const tasksContainer = document.getElementById('initialization-tasks');
    if (tasksContainer && status.tasks) {
      tasksContainer.innerHTML = status.tasks.map(task => {
        const icon = this.getTaskIcon(task.status);
        const statusClass = `task-${task.status}`;
        const progressMessage = task.progressMessage ?
          `<span class="task-progress-message">${task.progressMessage}</span>` : '';

        return `
          <div class="initialization-task ${statusClass}">
            <span class="task-icon">${icon}</span>
            <span class="task-description">${task.description}</span>
            ${progressMessage}
            ${task.status === 'running' ? `
              <div class="task-progress">
                <div class="task-progress-bar" style="width: ${task.progress}%"></div>
              </div>
            ` : ''}
            ${task.error ? `<span class="task-error">${task.error}</span>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  /**
   * Get icon for task status
   */
  getTaskIcon(status) {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '•';
    }
  }

  /**
   * Listen for WebSocket updates
   */
  listenForWebSocketUpdates() {
    // Hook into existing WebSocket connection
    if (window.ws) {
      const originalOnMessage = window.ws.onmessage;
      window.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'initialization:complete') {
            this.updateDisplay(data.status);
            this.onInitialized();
          }
        } catch (error) {
          // Not JSON or not our message
        }

        // Call original handler
        if (originalOnMessage) {
          originalOnMessage.call(window.ws, event);
        }
      };
    }
  }

  /**
   * Handle initialization complete
   */
  onInitialized() {
    this.initialized = true;

    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Fade out and remove overlay
    if (this.overlayElement) {
      this.overlayElement.classList.add('fade-out');

      // Add completion message
      const header = this.overlayElement.querySelector('h3');
      if (header) {
        header.textContent = 'Initialization Complete!';
      }

      // Remove after animation
      setTimeout(() => {
        if (this.overlayElement) {
          this.overlayElement.remove();
          this.overlayElement = null;
        }
      }, 1000);
    }

    // Refresh worktrees to show updated status
    if (window.refreshWorktrees) {
      window.refreshWorktrees();
    }
  }

  /**
   * Create a minimal status indicator for the status bar
   */
  createStatusIndicator() {
    const statusBar = document.querySelector('.status-bar');
    if (!statusBar) return;

    const indicator = document.createElement('div');
    indicator.className = 'status-segment initialization-status';
    indicator.id = 'initialization-status';
    indicator.innerHTML = `
      <span class="status-icon">🔄</span>
      <span class="status-text">Initializing...</span>
    `;

    // Insert at the beginning of status bar
    statusBar.insertBefore(indicator, statusBar.firstChild);
    this.statusElement = indicator;

    // Start minimal tracking
    this.trackMinimal();
  }

  /**
   * Track initialization with minimal UI (just status bar)
   */
  async trackMinimal() {
    const update = async () => {
      const status = await this.fetchStatus();

      if (this.statusElement) {
        const text = this.statusElement.querySelector('.status-text');
        if (text) {
          if (status.initialized) {
            // Remove the indicator when done
            this.statusElement.remove();
            this.statusElement = null;
          } else {
            text.textContent = `Initializing (${status.overallProgress}%)...`;
          }
        }
      }

      // Continue if not initialized
      if (!status.initialized && this.statusElement) {
        setTimeout(update, 1000);
      }
    };

    update();
  }
}

// CSS for the initialization overlay
const style = document.createElement('style');
style.textContent = `
  .initialization-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(10px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  }

  .initialization-overlay.fade-out {
    animation: fadeOut 1s ease-out forwards;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  .initialization-content {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .initialization-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .initialization-header h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .initialization-tasks {
    margin-bottom: 1.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .initialization-task {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-radius: 6px;
    background: var(--bg-primary);
    font-size: 0.9rem;
  }

  .task-icon {
    width: 20px;
    text-align: center;
  }

  .task-description {
    flex: 1;
    color: var(--text-secondary);
  }

  .task-progress-message {
    color: var(--text-tertiary);
    font-size: 0.85rem;
    margin-left: auto;
  }

  .task-pending {
    opacity: 0.5;
  }

  .task-running {
    background: var(--bg-hover);
  }

  .task-running .task-description {
    color: var(--accent);
  }

  .task-completed .task-description {
    color: var(--success);
  }

  .task-failed .task-description {
    color: var(--error);
  }

  .task-error {
    color: var(--error);
    font-size: 0.8rem;
    margin-left: 1rem;
  }

  .task-progress {
    width: 100%;
    height: 2px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    margin-top: 0.25rem;
    overflow: hidden;
  }

  .task-progress-bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .initialization-progress {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--success));
    transition: width 0.5s ease;
  }

  .progress-text {
    color: var(--text-secondary);
    font-size: 0.9rem;
    min-width: 40px;
    text-align: right;
  }

  .initialization-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: var(--bg-hover);
    border-radius: 4px;
  }

  .initialization-status .status-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Export for use in main.js
export default InitializationTracker;