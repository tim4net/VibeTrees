/**
 * Worktree Selection Manager
 *
 * Handles:
 * - Always-selected worktree pattern (main by default)
 * - Visual selection states
 * - Selection persistence across page refreshes
 * - Navigate to last open tab on selection
 */

class SelectionManager {
  constructor() {
    this.STORAGE_KEY = 'vibe-selected-worktree';
    this.TAB_STORAGE_KEY = 'vibe-last-tab';
    this.selectedWorktree = null;
    this.lastTabs = {}; // worktree -> last tab mapping
    this.init();
  }

  init() {
    // Load saved selection or default to 'main'
    this.loadSelection();

    // Load last tabs for each worktree
    this.loadLastTabs();

    // Listen for worktree card clicks
    this.attachListeners();
  }

  /**
   * Load saved selection from storage
   */
  loadSelection() {
    const saved = localStorage.getItem(this.STORAGE_KEY);

    if (saved) {
      this.selectWorktree(saved, { skipStorage: true, skipNavigation: true });
    } else {
      // Default to 'main' if it exists, otherwise first worktree
      this.selectDefaultWorktree();
    }
  }

  /**
   * Load last tabs for each worktree
   */
  loadLastTabs() {
    try {
      const saved = localStorage.getItem(this.TAB_STORAGE_KEY);
      if (saved) {
        this.lastTabs = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load last tabs:', error);
      this.lastTabs = {};
    }
  }

  /**
   * Save last tabs to storage
   */
  saveLastTabs() {
    try {
      localStorage.setItem(this.TAB_STORAGE_KEY, JSON.stringify(this.lastTabs));
    } catch (error) {
      console.error('Failed to save last tabs:', error);
    }
  }

  /**
   * Select default worktree (main or first available)
   */
  selectDefaultWorktree() {
    // Wait for DOM to be ready
    requestAnimationFrame(() => {
      const mainCard = document.querySelector('.worktree-card[data-name="main"]');
      const firstCard = document.querySelector('.worktree-card');

      if (mainCard) {
        this.selectWorktree('main', { skipNavigation: true });
      } else if (firstCard) {
        const name = firstCard.dataset.name;
        this.selectWorktree(name, { skipNavigation: true });
      }
    });
  }

  /**
   * Select a worktree
   * @param {string} name - Worktree name
   * @param {Object} options - Options
   * @param {boolean} [options.skipStorage] - Don't save to localStorage
   * @param {boolean} [options.skipNavigation] - Don't navigate to last tab
   */
  selectWorktree(name, options = {}) {
    if (this.selectedWorktree === name) {
      return; // Already selected
    }

    // Deselect all cards
    document.querySelectorAll('.worktree-card').forEach(card => {
      card.classList.remove('selected');
      card.setAttribute('aria-selected', 'false');
    });

    // Select the target card
    const targetCard = document.querySelector(`.worktree-card[data-name="${name}"]`);
    if (targetCard) {
      targetCard.classList.add('selected');
      targetCard.setAttribute('aria-selected', 'true');
      this.selectedWorktree = name;

      // Save to storage
      if (!options.skipStorage) {
        localStorage.setItem(this.STORAGE_KEY, name);
      }

      // Navigate to last tab
      if (!options.skipNavigation) {
        this.navigateToLastTab(name);
      }

      // Scroll card into view if needed
      this.scrollCardIntoView(targetCard);

      // Fire custom event
      this.fireSelectionEvent(name);
    }
  }

  /**
   * Navigate to the last open tab for a worktree
   */
  navigateToLastTab(name) {
    const lastTab = this.lastTabs[name] || 'terminal'; // Default to terminal

    // Find and click the tab button
    const card = document.querySelector(`.worktree-card[data-name="${name}"]`);
    if (card) {
      const tabButton = card.querySelector(`button[data-action="${lastTab}"]`);
      if (tabButton) {
        // Simulate click after a brief delay to ensure selection is complete
        setTimeout(() => tabButton.click(), 100);
      }
    }
  }

  /**
   * Remember the last tab opened for a worktree
   */
  rememberTab(name, tab) {
    this.lastTabs[name] = tab;
    this.saveLastTabs();
  }

  /**
   * Scroll card into view smoothly
   */
  scrollCardIntoView(card) {
    card.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  /**
   * Fire custom selection event
   */
  fireSelectionEvent(name) {
    const event = new CustomEvent('worktree:selected', {
      detail: { name }
    });
    window.dispatchEvent(event);
  }

  /**
   * Attach click listeners to worktree cards
   */
  attachListeners() {
    // Use event delegation on document for dynamic cards
    document.addEventListener('click', (e) => {
      // Check if click is on worktree card or its children
      const card = e.target.closest('.worktree-card');
      if (card) {
        const name = card.dataset.name;
        if (name) {
          // Don't select if clicking on a button
          if (!e.target.closest('button')) {
            this.selectWorktree(name);
          }
        }
      }

      // Track tab clicks to remember last tab
      if (e.target.matches('button[data-action]')) {
        const card = e.target.closest('.worktree-card');
        if (card) {
          const name = card.dataset.name;
          const action = e.target.dataset.action;
          if (name && ['terminal', 'logs', 'shell'].includes(action)) {
            this.rememberTab(name, action);
          }
        }
      }
    });

    // Keyboard navigation (arrow keys)
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) {
        return; // Don't interfere with text input
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateWithKeys(e.key === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  /**
   * Navigate between worktrees with arrow keys
   */
  navigateWithKeys(direction) {
    const cards = Array.from(document.querySelectorAll('.worktree-card'));
    if (cards.length === 0) return;

    const currentIndex = cards.findIndex(card =>
      card.classList.contains('selected')
    );

    if (currentIndex === -1) {
      // No selection, select first
      this.selectWorktree(cards[0].dataset.name);
      return;
    }

    // Calculate next index (wrap around)
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = cards.length - 1;
    if (nextIndex >= cards.length) nextIndex = 0;

    this.selectWorktree(cards[nextIndex].dataset.name);
  }

  /**
   * Get currently selected worktree
   */
  getSelected() {
    return this.selectedWorktree;
  }

  /**
   * Handle worktrees being added/removed dynamically
   */
  refreshSelection() {
    if (!this.selectedWorktree) {
      this.selectDefaultWorktree();
      return;
    }

    // Check if currently selected worktree still exists
    const card = document.querySelector(`.worktree-card[data-name="${this.selectedWorktree}"]`);
    if (!card) {
      // Selected worktree was removed, select default
      this.selectDefaultWorktree();
    } else {
      // Re-apply selection class (in case DOM was rebuilt)
      this.selectWorktree(this.selectedWorktree, { skipNavigation: true });
    }
  }
}

// Initialize selection manager
const selectionManager = new SelectionManager();

// Export for use in other scripts
window.selectionManager = selectionManager;

// Re-apply selection when worktrees are updated
window.addEventListener('worktrees:updated', () => {
  selectionManager.refreshSelection();
});
