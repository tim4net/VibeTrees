/**
 * Service Startup - Toast-based feedback with status badge updates
 * Shows toast notifications when starting/stopping Docker services
 */

/**
 * Update the status badge for a worktree
 * @param {string} worktreeName - Name of the worktree
 * @param {string} status - 'starting', 'stopping', or null to clear
 */
function updateStatusBadge(worktreeName, status) {
  const card = document.querySelector(`.worktree-card[data-name="${worktreeName}"]`);
  if (!card) return;

  const badge = card.querySelector('.status-badge');
  if (!badge) return;

  if (status) {
    badge.classList.remove('status-running', 'status-stopped', 'status-mixed');
    badge.classList.add('status-creating'); // Reuse creating style for animation
    const text = status === 'starting' ? 'Starting' : 'Stopping';
    badge.innerHTML = `${text} <i data-lucide="loader-2" class="status-badge-chevron spin"></i>`;
    // Re-init lucide for the new icon
    if (window.lucide) window.lucide.createIcons();
  }
  // Badge will be restored on next refresh when status is null
}

/**
 * Start services for a worktree with toast feedback
 * @param {string} worktreeName - Name of the worktree
 * @param {Object} ports - Discovered ports for services (unused, kept for API compatibility)
 */
export async function showServiceStartupModal(worktreeName, ports) {
  // Update badge to show starting
  updateStatusBadge(worktreeName, 'starting');

  // Show immediate feedback
  if (window.showToast) {
    window.showToast(`Starting services for ${worktreeName}...`, 5000);
  }

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/start`, {
      method: 'POST'
    });

    const result = await response.json();

    // Clear pending state
    updateStatusBadge(worktreeName, null);

    if (result.success) {
      // Success toast
      if (window.showToast) {
        window.showToast(`Services started for ${worktreeName}`, 3000);
      }

      // Refresh worktree list to show updated status
      if (window.refreshWorktrees) {
        window.refreshWorktrees();
      }
    } else {
      // Error toast
      if (window.showToast) {
        window.showToast(`Failed to start services: ${result.error}`, 5000);
      }
      // Refresh to restore correct state
      if (window.refreshWorktrees) {
        window.refreshWorktrees();
      }
    }

  } catch (error) {
    updateStatusBadge(worktreeName, null);
    if (window.showToast) {
      window.showToast(`Error starting services: ${error.message}`, 5000);
    }
    if (window.refreshWorktrees) {
      window.refreshWorktrees();
    }
  }
}

/**
 * Hide the service startup modal (no-op for backwards compatibility)
 */
window.hideServiceStartupModal = function() {
  // No-op - kept for backwards compatibility
};

// Export to global scope
window.showServiceStartupModal = showServiceStartupModal;
