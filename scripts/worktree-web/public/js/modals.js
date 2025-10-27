/**
 * Modal Management Module
 * Handles modal dialogs (create worktree)
 */

/**
 * Show create worktree modal
 */
export function showCreateModal() {
  document.getElementById('create-modal').classList.add('active');
}

/**
 * Hide create worktree modal and reset state
 */
export function hideCreateModal() {
  document.getElementById('create-modal').classList.remove('active');
  document.getElementById('branch-name').value = '';
  document.getElementById('from-branch').value = 'main';

  // Reset progress bar
  document.getElementById('create-progress').classList.remove('active');
  document.getElementById('progress-header-text').textContent = 'Creating worktree...';

  document.querySelectorAll('.progress-step').forEach(step => {
    step.classList.remove('pending', 'active', 'completed', 'error');
    step.classList.add('pending');
  });

  // Clear step status texts
  ['git', 'database', 'ports', 'containers', 'complete'].forEach(step => {
    const statusEl = document.getElementById(`status-${step}`);
    if (statusEl) statusEl.textContent = '';
  });

  document.getElementById('create-button').disabled = false;
  document.getElementById('cancel-button').disabled = false;

  // Clear progress output
  const progressOutput = document.getElementById('progress-output');
  progressOutput.innerHTML = '';
  progressOutput.classList.remove('active');
}

/**
 * Create a new worktree
 */
export async function createWorktree(event) {
  event.preventDefault();

  const branchName = document.getElementById('branch-name').value;
  const fromBranch = document.getElementById('from-branch').value;

  // Disable buttons and show progress
  document.getElementById('create-button').disabled = true;
  document.getElementById('cancel-button').disabled = true;
  document.getElementById('create-progress').classList.add('active');
  document.getElementById('progress-header-text').textContent = 'Starting...';

  try {
    const response = await fetch('/api/worktrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchName, fromBranch })
    });

    const result = await response.json();

    if (!result.success) {
      alert('Failed to create worktree: ' + result.error);
      document.getElementById('create-button').disabled = false;
      document.getElementById('cancel-button').disabled = false;
      document.getElementById('create-progress').classList.remove('active');
    }
    // Success case is handled by WebSocket progress events
  } catch (error) {
    alert('Failed to create worktree: ' + error.message);
    document.getElementById('create-button').disabled = false;
    document.getElementById('cancel-button').disabled = false;
    document.getElementById('create-progress').classList.remove('active');
  }
}

/**
 * Hide close worktree modal and reset state
 */
export function hideCloseModal() {
  document.getElementById('close-modal').classList.remove('active');

  // Reset form
  document.querySelector('input[name="close-action"][value="no"]').checked = true;
  document.getElementById('database-preview').style.display = 'none';
  document.getElementById('update-main-option').style.display = 'none';

  // Reset loading state
  document.getElementById('close-loading').style.display = 'flex';
  document.getElementById('close-content').style.display = 'none';

  // Clear stored worktree name
  window.currentWorktreeToClose = null;
}

// Export to global scope for onclick handlers
window.showCreateModal = showCreateModal;
window.hideCreateModal = hideCreateModal;
window.createWorktree = createWorktree;
window.hideCloseModal = hideCloseModal;
