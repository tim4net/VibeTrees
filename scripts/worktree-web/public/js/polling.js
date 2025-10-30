/**
 * Polling Manager
 * Handles automatic worktree data refresh with smart visibility detection
 */

class PollingManager {
  constructor() {
    this.VISIBLE_INTERVAL = 60000;    // 60 seconds when tab is visible (reduced load)
    this.HIDDEN_INTERVAL = 300000;    // 5 minutes when tab is hidden
    this.intervalId = null;
    this.isPolling = false;
    this.currentInterval = this.VISIBLE_INTERVAL;
    this.terminalFocused = false;

    // Bind methods to maintain 'this' context
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * Start polling with smart visibility detection
   */
  start() {
    if (this.isPolling) {
      console.log('[PollingManager] Already polling');
      return;
    }

    console.log('[PollingManager] Starting polling');
    this.isPolling = true;

    // Set up visibility change listener
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Start initial polling based on current visibility
    this.adjustPollingRate();
  }

  /**
   * Stop polling
   */
  stop() {
    console.log('[PollingManager] Stopping polling');
    this.isPolling = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Handle visibility change events
   */
  handleVisibilityChange() {
    if (document.hidden) {
      console.log('[PollingManager] Tab hidden, switching to slow polling (2min)');
      this.currentInterval = this.HIDDEN_INTERVAL;
    } else {
      console.log('[PollingManager] Tab visible, switching to fast polling (15s) + immediate refresh');
      this.currentInterval = this.VISIBLE_INTERVAL;

      // Immediate refresh when tab becomes visible
      this.forceRefresh();
    }

    // Restart polling with new interval
    this.restartPolling();
  }

  /**
   * Restart polling with current interval
   */
  restartPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.refresh();
    }, this.currentInterval);
  }

  /**
   * Adjust polling rate based on current visibility
   */
  adjustPollingRate() {
    if (document.hidden) {
      this.currentInterval = this.HIDDEN_INTERVAL;
      console.log('[PollingManager] Starting with slow polling (tab hidden)');
    } else {
      this.currentInterval = this.VISIBLE_INTERVAL;
      console.log('[PollingManager] Starting with fast polling (tab visible)');
    }

    this.restartPolling();
  }

  /**
   * Pause polling when terminal is focused (prevents interruptions during typing)
   */
  pauseForTerminal() {
    this.terminalFocused = true;
  }

  /**
   * Resume polling when terminal loses focus
   */
  resumeFromTerminal() {
    this.terminalFocused = false;
  }

  /**
   * Refresh worktree data
   */
  refresh() {
    if (!this.isPolling) return;

    // Skip refresh if terminal is focused (prevents interrupting typing)
    if (this.terminalFocused) {
      console.log('[PollingManager] Skipping refresh - terminal is focused');
      return;
    }

    console.log('[PollingManager] Refreshing worktree data...');

    if (window.refreshWorktrees) {
      window.refreshWorktrees();
    } else {
      console.warn('[PollingManager] refreshWorktrees not available');
    }
  }

  /**
   * Force immediate refresh (exported for manual use)
   */
  forceRefresh() {
    console.log('[PollingManager] Force refresh');
    this.refresh();
  }
}

// Create and export singleton instance
const pollingManager = new PollingManager();
export { pollingManager };
