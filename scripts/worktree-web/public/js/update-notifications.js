/**
 * Update Notifications Module
 * Toast notifications for worktree updates
 */

import { escapeHtml } from './utils.js';

// State management
const notificationState = {
  shownNotifications: new Set(), // Set of "worktreeName:commitCount" to track shown notifications
  activeToasts: new Map(), // worktreeName -> toast element
  autoDismissDelay: 5000 // 5 seconds
};

/**
 * Initialize notification system
 */
export function initUpdateNotifications() {
  console.log('[update-notifications] Initializing notification system');

  // Create toast container if it doesn't exist
  if (!document.getElementById('toast-container')) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
}

/**
 * Show update notification
 */
export function showUpdateNotification(worktreeName, commitCount) {
  const notificationKey = `${worktreeName}:${commitCount}`;

  // Check if we already showed this notification
  if (notificationState.shownNotifications.has(notificationKey)) {
    console.log('[update-notifications] Notification already shown:', notificationKey);
    return;
  }

  // Mark as shown
  notificationState.shownNotifications.add(notificationKey);

  // Close existing toast for this worktree
  closeToast(worktreeName);

  // Create toast
  const toast = createToast(worktreeName, commitCount);

  // Add to DOM
  const container = document.getElementById('toast-container');
  if (container) {
    container.appendChild(toast);
  }

  // Store reference
  notificationState.activeToasts.set(worktreeName, toast);

  // Animate in
  setTimeout(() => {
    toast.classList.add('visible');
  }, 10);

  // Auto-dismiss after delay
  setTimeout(() => {
    closeToast(worktreeName);
  }, notificationState.autoDismissDelay);

  // Reinit icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Create toast element
 */
function createToast(worktreeName, commitCount) {
  const toast = document.createElement('div');
  toast.className = 'toast update-toast';
  toast.dataset.worktree = worktreeName;

  const pluralCommits = commitCount !== 1 ? 's' : '';

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="download" class="lucide"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(worktreeName)}</div>
      <div class="toast-message">${commitCount} new update${pluralCommits} available</div>
    </div>
    <div class="toast-actions">
      <button class="toast-button toast-button-primary" onclick="window.updateNotifications.handleUpdate('${worktreeName}')">
        Update
      </button>
      <button class="toast-button toast-button-dismiss" onclick="window.updateNotifications.handleDismiss('${worktreeName}')">
        Dismiss
      </button>
    </div>
    <button class="toast-close" onclick="window.updateNotifications.closeToast('${worktreeName}')" title="Close">
      ×
    </button>
  `;

  return toast;
}

/**
 * Close toast
 */
export function closeToast(worktreeName) {
  const toast = notificationState.activeToasts.get(worktreeName);

  if (toast) {
    // Animate out
    toast.classList.remove('visible');

    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
      notificationState.activeToasts.delete(worktreeName);
    }, 300);
  }
}

/**
 * Handle "Update" button click
 */
export function handleUpdate(worktreeName) {
  closeToast(worktreeName);

  // Open sync dialog
  if (window.syncUI) {
    window.syncUI.showSyncDialog(worktreeName);
  }
}

/**
 * Handle "Dismiss" button click
 */
export function handleDismiss(worktreeName) {
  closeToast(worktreeName);
}

/**
 * Clear notification history (for testing)
 */
export function clearNotificationHistory() {
  notificationState.shownNotifications.clear();
  console.log('[update-notifications] Notification history cleared');
}


// Export to global scope
window.updateNotifications = {
  showUpdateNotification,
  closeToast,
  handleUpdate,
  handleDismiss,
  clearNotificationHistory
};

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUpdateNotifications);
} else {
  initUpdateNotifications();
}
