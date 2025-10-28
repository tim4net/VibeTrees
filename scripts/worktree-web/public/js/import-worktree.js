/**
 * Worktree Import Module
 * Handles discovery and import of existing worktrees
 */

/**
 * Show import worktree modal
 */
export async function showImportModal() {
  const modal = document.getElementById('import-modal');
  modal.classList.add('active');

  // Load unmanaged worktrees
  await loadUnmanagedWorktrees();
}

/**
 * Hide import worktree modal
 */
export function hideImportModal() {
  const modal = document.getElementById('import-modal');
  modal.classList.remove('active');

  // Clear selection
  const worktreeList = document.getElementById('unmanaged-worktree-list');
  if (worktreeList) {
    worktreeList.innerHTML = '';
  }
}

/**
 * Load unmanaged worktrees from API
 */
async function loadUnmanagedWorktrees() {
  const listContainer = document.getElementById('unmanaged-worktree-list');
  const loadingEl = document.getElementById('import-loading');
  const errorEl = document.getElementById('import-error');

  // Show loading
  if (loadingEl) loadingEl.style.display = 'flex';
  if (errorEl) errorEl.style.display = 'none';
  if (listContainer) listContainer.innerHTML = '';

  try {
    const response = await fetch('/api/worktrees/discover');

    if (!response.ok) {
      throw new Error('Failed to discover worktrees');
    }

    const worktrees = await response.json();

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    if (worktrees.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="folder-x"></i>
          <p>No unmanaged worktrees found</p>
          <p class="text-muted">All existing worktrees are already managed by VibeTrees</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Render worktree list
    listContainer.innerHTML = worktrees.map(wt => `
      <div class="import-worktree-item ${!wt.canImport ? 'disabled' : ''}"
           data-name="${wt.name}">
        <div class="worktree-info">
          <div class="worktree-header">
            <strong>${wt.name}</strong>
            ${wt.canImport ? '' : '<span class="badge badge-error">Cannot Import</span>'}
          </div>
          <div class="worktree-details">
            <span><i data-lucide="git-branch"></i> ${wt.branch}</span>
            <span><i data-lucide="folder"></i> ${wt.path}</span>
          </div>
          ${wt.hasComposeFile ? '<div class="worktree-feature"><i data-lucide="box"></i> Docker Compose</div>' : ''}
          ${wt.runningContainers.length > 0 ? `<div class="worktree-feature"><i data-lucide="play"></i> ${wt.runningContainers.length} running containers</div>` : ''}
          ${wt.issues.length > 0 ? `
            <div class="worktree-issues">
              <strong>Issues:</strong>
              <ul>
                ${wt.issues.map(issue => `<li>${issue}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        <button class="btn btn-primary btn-sm"
                onclick="window.importWorktreeModule.importWorktree('${wt.name}')"
                ${!wt.canImport ? 'disabled' : ''}>
          <i data-lucide="download"></i>
          Import
        </button>
      </div>
    `).join('');

    // Initialize Lucide icons
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.error('Failed to load unmanaged worktrees:', error);

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    // Show error
    if (errorEl) {
      errorEl.style.display = 'flex';
      errorEl.querySelector('.error-message').textContent = error.message;
    }
  }
}

/**
 * Import a specific worktree
 */
export async function importWorktree(worktreeName) {
  const button = event.target.closest('button');
  const originalHTML = button.innerHTML;

  try {
    // Disable button and show loading
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Importing...';
    if (window.lucide) window.lucide.createIcons();

    const response = await fetch('/api/worktrees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: worktreeName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Import failed');
    }

    const result = await response.json();

    // Show success message
    button.innerHTML = '<i data-lucide="check"></i> Imported';
    button.classList.remove('btn-primary');
    button.classList.add('btn-success');
    if (window.lucide) window.lucide.createIcons();

    // Remove item from list after a delay
    setTimeout(() => {
      const item = button.closest('.import-worktree-item');
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 300);
    }, 1000);

    // Show toast notification
    if (window.showToast) {
      window.showToast(`Worktree "${worktreeName}" imported successfully!`, 'success');
    }

    // Reload unmanaged list if no items remain
    setTimeout(async () => {
      const listContainer = document.getElementById('unmanaged-worktree-list');
      if (listContainer && listContainer.children.length === 0) {
        await loadUnmanagedWorktrees();
      }
    }, 1500);
  } catch (error) {
    console.error('Failed to import worktree:', error);

    // Restore button
    button.disabled = false;
    button.innerHTML = originalHTML;
    if (window.lucide) window.lucide.createIcons();

    // Show error
    if (window.showToast) {
      window.showToast(`Failed to import: ${error.message}`, 'error');
    } else {
      alert(`Failed to import: ${error.message}`);
    }
  }
}

/**
 * Retry loading unmanaged worktrees
 */
export function retryLoadUnmanaged() {
  loadUnmanagedWorktrees();
}

// Export to global scope
window.importWorktreeModule = {
  showImportModal,
  hideImportModal,
  importWorktree,
  retryLoadUnmanaged
};
