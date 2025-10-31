/**
 * State Management Module
 * Centralized state with event emission for UI updates
 */

class AppState {
  constructor() {
    // Core state
    this.selectedWorktreeId = null;
    this.sidebarCollapsed = this.loadSidebarState();
    this.worktrees = [];
    this.tabs = new Map(); // tabId -> { worktree, command, isWebUI, isLogs, etc. }
    this.lastActiveTabPerWorktree = new Map(); // worktreeName -> tabId

    // Event listeners
    this.listeners = new Map(); // eventType -> Set of callbacks

    // Load persisted state
    this.loadPersistedState();
  }

  /**
   * Subscribe to state changes
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Unsubscribe from state changes
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to all listeners
   * @param {string} event - Event type
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  /**
   * Select a worktree
   * @param {string|null} worktreeId - Worktree name or null to deselect
   */
  selectWorktree(worktreeId) {
    if (this.selectedWorktreeId !== worktreeId) {
      this.selectedWorktreeId = worktreeId;
      this.emit('worktree:selected', worktreeId);
      this.persistState();
    }
  }

  /**
   * Toggle sidebar collapsed state
   */
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.emit('sidebar:toggled', this.sidebarCollapsed);
    this.persistSidebarState();
  }

  /**
   * Update worktrees list
   * @param {Array} worktrees - New worktrees array
   */
  updateWorktrees(worktrees) {
    this.worktrees = worktrees;
    this.emit('worktrees:updated', worktrees);
  }

  /**
   * Add a tab
   * @param {string} tabId - Tab ID
   * @param {Object} tabInfo - Tab information
   */
  addTab(tabId, tabInfo) {
    this.tabs.set(tabId, tabInfo);
    this.emit('tab:added', { tabId, tabInfo });
  }

  /**
   * Remove a tab
   * @param {string} tabId - Tab ID
   */
  removeTab(tabId) {
    const tabInfo = this.tabs.get(tabId);
    if (tabInfo) {
      this.tabs.delete(tabId);
      this.emit('tab:removed', { tabId, tabInfo });
    }
  }

  /**
   * Get tabs for a specific worktree
   * @param {string} worktreeName - Worktree name
   * @returns {Array} Array of [tabId, tabInfo] pairs
   */
  getWorktreeTabs(worktreeName) {
    const result = [];
    for (const [tabId, tabInfo] of this.tabs.entries()) {
      if (tabInfo.worktree === worktreeName) {
        result.push([tabId, tabInfo]);
      }
    }
    return result;
  }

  /**
   * Get currently filtered tabs (based on selected worktree)
   * @returns {Array} Array of [tabId, tabInfo] pairs
   */
  getFilteredTabs() {
    if (!this.selectedWorktreeId) {
      // No filter, return all tabs
      return Array.from(this.tabs.entries());
    }
    return this.getWorktreeTabs(this.selectedWorktreeId);
  }

  /**
   * Set the last active tab for a worktree
   * @param {string} worktreeName - Worktree name
   * @param {string} tabId - Tab ID
   */
  setLastActiveTab(worktreeName, tabId) {
    this.lastActiveTabPerWorktree.set(worktreeName, tabId);
    this.persistLastActiveTabs();
  }

  /**
   * Get the last active tab for a worktree
   * @param {string} worktreeName - Worktree name
   * @returns {string|null} Tab ID or null
   */
  getLastActiveTab(worktreeName) {
    return this.lastActiveTabPerWorktree.get(worktreeName) || null;
  }

  /**
   * Load persisted state from localStorage
   */
  loadPersistedState() {
    try {
      const saved = localStorage.getItem('worktree-manager-state');
      if (saved) {
        const state = JSON.parse(saved);
        this.selectedWorktreeId = state.selectedWorktreeId || null;
      }

      // Load last active tabs
      const savedTabs = localStorage.getItem('last-active-tabs');
      if (savedTabs) {
        const tabsObj = JSON.parse(savedTabs);
        this.lastActiveTabPerWorktree = new Map(Object.entries(tabsObj));
      }
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
    }
  }

  /**
   * Persist state to localStorage
   */
  persistState() {
    try {
      const state = {
        selectedWorktreeId: this.selectedWorktreeId
      };
      localStorage.setItem('worktree-manager-state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist state:', e);
    }
  }

  /**
   * Persist last active tabs to localStorage
   */
  persistLastActiveTabs() {
    try {
      const tabsObj = Object.fromEntries(this.lastActiveTabPerWorktree);
      localStorage.setItem('last-active-tabs', JSON.stringify(tabsObj));
    } catch (e) {
      console.warn('Failed to persist last active tabs:', e);
    }
  }

  /**
   * Load sidebar collapsed state
   */
  loadSidebarState() {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  }

  /**
   * Persist sidebar state
   */
  persistSidebarState() {
    localStorage.setItem('sidebar-collapsed', String(this.sidebarCollapsed));
  }
}

// Export singleton instance
export const appState = new AppState();
