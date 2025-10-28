/**
 * Branch Selector
 *
 * Handles branch selection UI for creating worktrees from existing branches
 */

class BranchSelector {
  constructor() {
    this.branches = { local: [], remote: [] };
    this.selectedBranch = null;
    this.searchTerm = '';
    this.container = null;
    this.searchInput = null;
    this.onBranchSelected = null; // Callback function
  }

  /**
   * Initialize the branch selector with DOM elements
   */
  init(containerId, searchInputId) {
    this.container = document.getElementById(containerId);
    this.searchInput = document.getElementById(searchInputId);

    if (!this.container) {
      console.error('Branch selector container not found:', containerId);
      return;
    }

    if (this.searchInput) {
      // Debounced search
      let searchTimeout;
      this.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchTerm = e.target.value.toLowerCase();
          this.render();
        }, 150);
      });
    }
  }

  /**
   * Load branches from API
   */
  async load() {
    try {
      const response = await fetch('/api/branches');
      if (!response.ok) {
        throw new Error('Failed to fetch branches');
      }
      this.branches = await response.json();
      this.render();
    } catch (error) {
      console.error('Error loading branches:', error);
      this.renderError('Failed to load branches. Please try again.');
    }
  }

  /**
   * Render branch list
   */
  render() {
    if (!this.container) return;

    const filteredLocal = this.filterBranches(this.branches.local);
    const filteredRemote = this.filterBranches(this.branches.remote);

    this.container.innerHTML = `
      <div class="branch-list">
        ${this.renderSection('Local Branches', filteredLocal, this.branches.local.length)}
        ${this.renderSection('Remote Branches', filteredRemote, this.branches.remote.length)}
      </div>
    `;

    // Attach click handlers
    this.attachClickHandlers();
  }

  /**
   * Render a branch section (local or remote)
   */
  renderSection(title, branches, totalCount) {
    const isEmpty = branches.length === 0;
    const filteredCount = branches.length;

    return `
      <div class="branch-section">
        <div class="branch-section-header">
          <h4>${title}</h4>
          <span class="branch-count">${filteredCount}${this.searchTerm ? ` / ${totalCount}` : ''}</span>
        </div>
        <div class="branch-section-content">
          ${isEmpty ? this.renderEmptyState() : branches.map(b => this.renderBranch(b)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single branch item
   */
  renderBranch(branch) {
    const isSelected = this.selectedBranch?.name === branch.name;
    const isAvailable = branch.available;
    const icon = this.getBranchIcon(branch);
    const statusClass = isAvailable ? 'available' : 'unavailable';
    const selectedClass = isSelected ? 'selected' : '';
    const disabledAttr = isAvailable ? '' : 'disabled';

    const lastCommit = branch.lastCommit;
    const commitInfo = lastCommit ? `
      <div class="branch-commit-info">
        <span class="branch-commit-message">${this.escapeHtml(lastCommit.message)}</span>
        <span class="branch-commit-meta">
          ${this.escapeHtml(lastCommit.author)} · ${this.formatDate(lastCommit.date)}
        </span>
      </div>
    ` : '';

    return `
      <div class="branch-item ${statusClass} ${selectedClass}"
           data-branch-name="${this.escapeHtml(branch.name)}"
           data-branch-type="${branch.type}"
           ${disabledAttr}>
        <div class="branch-header">
          <span class="branch-icon">${icon}</span>
          <span class="branch-name">${this.escapeHtml(branch.name)}</span>
        </div>
        ${commitInfo}
        ${branch.reason ? `<div class="branch-reason">${this.escapeHtml(branch.reason)}</div>` : ''}
      </div>
    `;
  }

  /**
   * Get icon for branch based on status
   */
  getBranchIcon(branch) {
    if (branch.type === 'base') return '✓';
    if (!branch.available) return '⊗';
    return '•';
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="branch-empty-state">
        ${this.searchTerm
          ? 'No branches match your search'
          : 'No branches available'}
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="branch-error">
        <span class="error-icon">⚠️</span>
        <span class="error-message">${this.escapeHtml(message)}</span>
      </div>
    `;
  }

  /**
   * Filter branches by search term
   */
  filterBranches(branches) {
    if (!this.searchTerm) return branches;

    return branches.filter(branch => {
      const nameMatch = branch.name.toLowerCase().includes(this.searchTerm);
      const messageMatch = branch.lastCommit?.message.toLowerCase().includes(this.searchTerm);
      return nameMatch || messageMatch;
    });
  }

  /**
   * Format date to relative time
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Attach click handlers to branch items
   */
  attachClickHandlers() {
    if (!this.container) return;

    const branchItems = this.container.querySelectorAll('.branch-item:not([disabled])');
    branchItems.forEach(item => {
      item.addEventListener('click', () => {
        const branchName = item.dataset.branchName;
        const branchType = item.dataset.branchType;
        this.selectBranch(branchName, branchType);
      });
    });
  }

  /**
   * Select a branch
   */
  selectBranch(branchName, branchType) {
    // Find the branch object
    const allBranches = [...this.branches.local, ...this.branches.remote];
    const branch = allBranches.find(b => b.name === branchName);

    if (!branch || !branch.available) {
      return;
    }

    this.selectedBranch = branch;
    this.render(); // Re-render to show selection

    // Call callback if provided
    if (this.onBranchSelected) {
      this.onBranchSelected(branch);
    }
  }

  /**
   * Get selected branch
   */
  getSelectedBranch() {
    return this.selectedBranch;
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectedBranch = null;
    this.searchTerm = '';
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.render();
  }

  /**
   * Convert branch name to worktree name
   * Example: feature/auth -> feature-auth
   *          origin/feature/auth -> feature-auth
   */
  static branchToWorktreeName(branchName) {
    return branchName
      .replace(/^origin\//, '') // Strip origin/ prefix
      .replace(/\//g, '-');      // Replace slashes with hyphens
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BranchSelector;
}
