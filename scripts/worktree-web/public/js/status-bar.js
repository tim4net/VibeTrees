/**
 * Status Bar Module
 * Displays worktree status at bottom of window
 */

import { appState } from './state.js';

/**
 * Initialize status bar
 */
export function initStatusBar() {
  console.log('[status-bar] Initializing status bar');

  // Update on worktree selection change
  if (window.appState) {
    window.appState.on('worktree:selected', (worktreeName) => {
      console.log('[status-bar] Worktree selected:', worktreeName);
      updateStatusBar(worktreeName);
    });

    // Update when worktree data refreshes (piggyback on existing polling)
    window.appState.on('worktrees:updated', () => {
      const selected = window.appState.selectedWorktreeId;
      if (selected) {
        console.log('[status-bar] Worktrees updated, refreshing status bar');
        updateStatusBar(selected);
      }
    });
  }

  // Initial update
  const selected = window.appState?.selectedWorktreeId;
  if (selected) {
    console.log('[status-bar] Initial update for:', selected);
    updateStatusBar(selected);
  } else {
    console.log('[status-bar] No worktree selected, hiding status bar');
    hideStatusBar();
  }
}

/**
 * Update status bar with worktree data
 */
async function updateStatusBar(worktreeName) {
  if (!worktreeName) {
    hideStatusBar();
    return;
  }

  // Get data from existing worktree object (no new API call needed)
  const worktree = window.appState?.worktrees?.find(w => w.name === worktreeName);
  if (!worktree) {
    console.warn('[status-bar] Worktree not found:', worktreeName);
    hideStatusBar();
    return;
  }

  console.log('[status-bar] Updating with data:', worktree);

  // Update each segment
  updateBranchDisplay(worktree);
  updateAheadBehind(worktree);
  updateChanges(worktree);
  updateLastCommit(worktree);
  updateDockerServices(worktree);

  showStatusBar();
}

/**
 * Update branch segment
 */
function updateBranchDisplay(worktree) {
  const segment = document.querySelector('.status-segment.branch');
  if (!segment) return;

  const branch = worktree.branch || 'unknown';
  const baseBranch = worktree.baseBranch || 'main';

  // Determine color based on git status
  let colorClass = 'clean';
  if (worktree.modifiedFiles > 0 || worktree.untrackedFiles > 0) {
    colorClass = 'modified';
  } else if (worktree.ahead > 0) {
    colorClass = 'ahead';
  }

  segment.className = `status-segment clickable branch ${colorClass}`;

  // Update text spans
  const fullText = segment.querySelector('.text-full .branch-name-full');
  const shortText = segment.querySelector('.text-short .branch-name-short');
  const minimalText = segment.querySelector('.text-minimal .branch-name-minimal');

  if (fullText) fullText.textContent = branch;
  if (shortText) shortText.textContent = branch;

  // Create abbreviated version for minimal
  if (minimalText) {
    const abbrev = branch.length > 8 ? branch.substring(0, 6) + '...' : branch;
    minimalText.textContent = abbrev;
  }

  // Update tooltip
  segment.title = `${branch} (based on ${baseBranch})\nClick to copy branch name`;
}

/**
 * Update ahead/behind segment
 */
function updateAheadBehind(worktree) {
  const segment = document.querySelector('.status-segment.ahead-behind-segment');
  if (!segment) return;

  const ahead = worktree.ahead || 0;
  const behind = worktree.behind || 0;
  const baseBranch = worktree.baseBranch || 'main';

  // Determine color
  let colorClass = 'ahead-behind';
  if (ahead > 0 && behind === 0) {
    colorClass = 'ahead';
  } else if (behind > 0 && ahead === 0) {
    colorClass = 'behind';
  } else if (ahead === 0 && behind === 0) {
    colorClass = 'clean';
  }

  segment.className = `status-segment clickable ahead-behind-segment ${colorClass}`;

  // Update counts
  const aheadCount = segment.querySelector('.ahead-count');
  const behindCount = segment.querySelector('.behind-count');
  const fromMain = segment.querySelector('.from-main');

  if (aheadCount) aheadCount.textContent = ahead;
  if (behindCount) behindCount.textContent = behind;
  if (fromMain) fromMain.textContent = baseBranch;

  // Update tooltip
  let tooltip = '';
  if (ahead > 0 && behind > 0) {
    tooltip = `${ahead} commits ahead of ${baseBranch}, ${behind} commits behind\nClick to sync`;
  } else if (ahead > 0) {
    tooltip = `${ahead} commits ahead of ${baseBranch}\nClick to sync`;
  } else if (behind > 0) {
    tooltip = `${behind} commits behind ${baseBranch}\nClick to sync`;
  } else {
    tooltip = `Even with ${baseBranch}`;
  }
  segment.title = tooltip;
}

/**
 * Update uncommitted changes segment
 */
function updateChanges(worktree) {
  const segment = document.querySelector('.status-segment.changes');
  if (!segment) return;

  const modified = worktree.modifiedFiles || 0;
  const untracked = worktree.untrackedFiles || 0;
  const total = modified + untracked;

  // Update color
  if (total > 0) {
    segment.className = 'status-segment clickable changes modified';
  } else {
    segment.className = 'status-segment clickable changes clean';
  }

  // Update icon
  const icon = segment.querySelector('.status-icon');
  if (icon) {
    icon.textContent = total > 0 ? '●' : '✓';
  }

  // Update count
  const count = segment.querySelector('.change-count');
  if (count) {
    count.textContent = total > 0 ? total : '';
    count.style.display = total > 0 ? 'inline' : 'none';
  }

  // Update text for clean state
  const textFull = segment.querySelector('.text-full');
  const textShort = segment.querySelector('.text-short');
  if (total === 0) {
    if (textFull) textFull.textContent = 'Clean';
    if (textShort) textShort.textContent = 'Clean';
  } else {
    if (textFull) textFull.textContent = 'modified files';
    if (textShort) textShort.textContent = 'files';
  }

  // Update tooltip
  let tooltip = '';
  if (total === 0) {
    tooltip = 'Working directory clean';
  } else {
    const parts = [];
    if (modified > 0) parts.push(`${modified} modified`);
    if (untracked > 0) parts.push(`${untracked} untracked`);
    tooltip = parts.join(', ') + '\nClick to view details';
  }
  segment.title = tooltip;
}

/**
 * Update last commit segment
 */
function updateLastCommit(worktree) {
  const segment = document.querySelector('.status-segment.last-commit');
  if (!segment) return;

  const commit = worktree.lastCommit;
  if (!commit) {
    segment.style.display = 'none';
    return;
  }

  segment.style.display = 'flex';

  // Format timestamp
  const timestamp = commit.timestamp || commit.date;
  const timeAgo = formatTimeAgo(timestamp);
  const timeAgoShort = formatTimeAgoShort(timestamp);
  const timeAgoMinimal = formatTimeAgoMinimal(timestamp);

  // Update text spans
  const textFull = segment.querySelector('.text-full');
  const textShort = segment.querySelector('.text-short');
  const textMinimal = segment.querySelector('.text-minimal');

  if (textFull) {
    const author = commit.author || 'Unknown';
    const authorFirst = author.split(' ')[0];
    textFull.textContent = `${timeAgo} by ${authorFirst}`;
  }
  if (textShort) textShort.textContent = timeAgoShort;
  if (textMinimal) textMinimal.textContent = timeAgoMinimal;

  // Update tooltip
  const message = commit.message || 'No message';
  const hash = commit.hash ? commit.hash.substring(0, 7) : 'unknown';
  const author = commit.author || 'Unknown';

  segment.title = `${message}\n${hash} by ${author}\n${timeAgo}\nClick to view on GitHub`;
}

/**
 * Update Docker services segment
 */
function updateDockerServices(worktree) {
  const segment = document.querySelector('.status-segment.docker');
  if (!segment) return;

  const services = worktree.dockerStatus || [];
  const running = services.filter(s => s.state === 'running').length;
  const total = services.length;

  // Update color
  let colorClass = 'none';
  if (total === 0) {
    colorClass = 'none';
  } else if (running === total) {
    colorClass = 'running';
  } else if (running === 0) {
    colorClass = 'stopped';
  } else {
    colorClass = 'partial';
  }

  segment.className = `status-segment clickable docker ${colorClass}`;

  // Update count
  const count = segment.querySelector('.service-count');
  if (count) {
    count.textContent = total > 0 ? `${running}/${total}` : '0';
  }

  // Update tooltip
  let tooltip = '';
  if (total === 0) {
    tooltip = 'No Docker services';
  } else {
    const runningNames = services.filter(s => s.state === 'running').map(s => s.name);
    const stoppedNames = services.filter(s => s.state !== 'running').map(s => s.name);

    const parts = [];
    if (runningNames.length > 0) {
      parts.push(runningNames.map(n => `${n} ✓`).join(', '));
    }
    if (stoppedNames.length > 0) {
      parts.push(stoppedNames.map(n => `${n} ✗`).join(', '));
    }

    tooltip = `${running} of ${total} services running:\n${parts.join('\n')}\nClick to manage services`;
  }
  segment.title = tooltip;
}

/**
 * Show status bar
 */
function showStatusBar() {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.classList.remove('hidden');
  }
}

/**
 * Hide status bar
 */
function hideStatusBar() {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.classList.add('hidden');
  }
}

/**
 * Format timestamp to relative time (full)
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string} - e.g., "2 hours ago"
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return `${Math.floor(seconds / 604800)} weeks ago`;
}

/**
 * Format timestamp to relative time (short)
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string} - e.g., "2h ago"
 */
function formatTimeAgoShort(timestamp) {
  if (!timestamp) return 'unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

/**
 * Format timestamp to relative time (minimal)
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string} - e.g., "2h"
 */
function formatTimeAgoMinimal(timestamp) {
  if (!timestamp) return '?';

  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

// ============================================================================
// Click Handlers
// ============================================================================

/**
 * Copy branch name to clipboard
 */
window.copyBranchName = function() {
  const worktree = window.appState?.worktrees?.find(
    w => w.name === window.appState.selectedWorktreeId
  );

  if (!worktree || !worktree.branch) {
    console.warn('[status-bar] No branch to copy');
    return;
  }

  navigator.clipboard.writeText(worktree.branch)
    .then(() => {
      showToast(`Copied: ${worktree.branch}`);
    })
    .catch(err => {
      console.error('[status-bar] Failed to copy:', err);
      showToast('Failed to copy branch name', 'error');
    });
};

/**
 * Open sync dialog (if sync UI is available)
 */
window.openSyncDialog = function() {
  const worktreeName = window.appState?.selectedWorktreeId;
  if (!worktreeName) {
    console.warn('[status-bar] No worktree selected');
    return;
  }

  // Check if sync UI module is available
  if (window.syncUI && typeof window.syncUI.showSyncDialog === 'function') {
    window.syncUI.showSyncDialog(worktreeName);
  } else {
    // Fallback: just show update button if available
    const syncButton = document.getElementById('sync-button');
    if (syncButton && syncButton.style.display !== 'none') {
      syncButton.click();
    } else {
      showToast('Sync functionality not available', 'info');
    }
  }
};

/**
 * Show modal with list of changed files
 */
window.showChangesModal = function() {
  const worktree = window.appState?.worktrees?.find(
    w => w.name === window.appState.selectedWorktreeId
  );

  if (!worktree) {
    console.warn('[status-bar] No worktree selected');
    return;
  }

  const modified = worktree.modifiedFiles || 0;
  const untracked = worktree.untrackedFiles || 0;

  if (modified === 0 && untracked === 0) {
    showToast('Working directory is clean', 'success');
    return;
  }

  // TODO: Implement proper modal with file list
  // For now, just show a simple alert with counts
  alert(`Changes in ${worktree.name}:\n\n${modified} modified files\n${untracked} untracked files\n\nFile list modal coming soon...`);
};

/**
 * Open commit on GitHub
 */
window.openCommitOnGitHub = function() {
  const worktree = window.appState?.worktrees?.find(
    w => w.name === window.appState.selectedWorktreeId
  );

  if (!worktree || !worktree.lastCommit) {
    console.warn('[status-bar] No commit to view');
    return;
  }

  const commit = worktree.lastCommit;
  const hash = commit.hash;

  if (!hash) {
    console.warn('[status-bar] No commit hash available');
    showToast('Commit hash not available', 'error');
    return;
  }

  // Try to construct GitHub URL
  // This assumes the worktree has a githubUrl or we can derive it
  let githubUrl = worktree.githubUrl;

  if (!githubUrl) {
    // Try to derive from git remote (if available in worktree data)
    console.warn('[status-bar] GitHub URL not available in worktree data');
    showToast('GitHub URL not configured', 'error');
    return;
  }

  // Remove .git suffix if present
  githubUrl = githubUrl.replace(/\.git$/, '');

  const commitUrl = `${githubUrl}/commit/${hash}`;
  window.open(commitUrl, '_blank');
};

/**
 * Show services modal with controls
 */
window.showServicesModal = function() {
  const worktree = window.appState?.worktrees?.find(
    w => w.name === window.appState.selectedWorktreeId
  );

  if (!worktree) {
    console.warn('[status-bar] No worktree selected');
    return;
  }

  const services = worktree.services || [];

  if (services.length === 0) {
    showToast('No Docker services configured', 'info');
    return;
  }

  // TODO: Implement proper modal with service controls
  // For now, just show the worktree card which has service controls
  const card = document.querySelector(`.worktree-card[data-worktree="${worktree.name}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('Service controls available in sidebar', 'info');
  } else {
    alert(`Services in ${worktree.name}:\n\n${services.map(s =>
      `${s.name}: ${s.status}`
    ).join('\n')}\n\nService controls modal coming soon...`);
  }
};

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  // Check if toast function exists (from modals.js or elsewhere)
  if (window.showToast) {
    window.showToast(message, type);
    return;
  }

  // Fallback: simple console log
  console.log(`[Toast ${type}]`, message);

  // Create a simple toast element
  const toast = document.createElement('div');
  toast.className = 'simple-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 40px;
    right: 20px;
    background: ${type === 'error' ? '#f85149' : type === 'info' ? '#58a6ff' : '#2ea043'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-size: 14px;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add simple animation styles
if (!document.getElementById('status-bar-toast-styles')) {
  const style = document.createElement('style');
  style.id = 'status-bar-toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
