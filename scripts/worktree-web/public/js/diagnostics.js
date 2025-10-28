/**
 * Diagnostics Module
 * Handles health checks and diagnostics UI
 */

/**
 * Show diagnostics modal for a specific worktree
 */
export async function showDiagnosticsModal(worktreeName = null) {
  const modal = document.getElementById('diagnostics-modal');
  modal.classList.add('active');

  // Store worktree name for later use
  modal.dataset.worktreeName = worktreeName || '';

  // Update modal title
  const title = modal.querySelector('.modal-title');
  if (title) {
    title.textContent = worktreeName
      ? `Diagnostics: ${worktreeName}`
      : 'System Diagnostics';
  }

  // Run diagnostics
  await runDiagnostics(worktreeName);
}

/**
 * Hide diagnostics modal
 */
export function hideDiagnosticsModal() {
  const modal = document.getElementById('diagnostics-modal');
  modal.classList.remove('active');
  modal.dataset.worktreeName = '';
}

/**
 * Run diagnostic checks
 */
async function runDiagnostics(worktreeName = null) {
  const resultsContainer = document.getElementById('diagnostics-results');
  const loadingEl = document.getElementById('diagnostics-loading');
  const errorEl = document.getElementById('diagnostics-error');
  const summaryEl = document.getElementById('diagnostics-summary');

  // Show loading
  if (loadingEl) loadingEl.style.display = 'flex';
  if (errorEl) errorEl.style.display = 'none';
  if (summaryEl) summaryEl.style.display = 'none';
  if (resultsContainer) resultsContainer.innerHTML = '';

  try {
    const url = worktreeName
      ? `/api/diagnostics/${worktreeName}`
      : '/api/diagnostics';

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to run diagnostics');
    }

    const report = await response.json();

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    // Show summary
    if (summaryEl) {
      summaryEl.style.display = 'block';
      renderSummary(report.summary, summaryEl);
    }

    // Render check results
    if (resultsContainer) {
      resultsContainer.innerHTML = report.checks.map(check => renderCheck(check)).join('');

      // Initialize Lucide icons
      if (window.lucide) window.lucide.createIcons();
    }
  } catch (error) {
    console.error('Failed to run diagnostics:', error);

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
 * Render diagnostics summary
 */
function renderSummary(summary, container) {
  const healthIcon = {
    healthy: 'check-circle',
    warning: 'alert-circle',
    critical: 'x-circle',
    unknown: 'help-circle'
  }[summary.health] || 'help-circle';

  const healthColor = {
    healthy: '#22c55e',
    warning: '#eab308',
    critical: '#ef4444',
    unknown: '#6b7280'
  }[summary.health] || '#6b7280';

  container.innerHTML = `
    <div class="diagnostic-summary-header">
      <i data-lucide="${healthIcon}" style="color: ${healthColor}"></i>
      <h3 style="text-transform: capitalize">${summary.health}</h3>
    </div>
    <div class="diagnostic-summary-stats">
      <div class="stat">
        <span class="stat-value">${summary.passed}</span>
        <span class="stat-label">Passed</span>
      </div>
      <div class="stat">
        <span class="stat-value">${summary.warnings}</span>
        <span class="stat-label">Warnings</span>
      </div>
      <div class="stat">
        <span class="stat-value">${summary.errors}</span>
        <span class="stat-label">Errors</span>
      </div>
      <div class="stat">
        <span class="stat-value">${summary.total}</span>
        <span class="stat-label">Total</span>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render a single diagnostic check
 */
function renderCheck(check) {
  const statusIcon = {
    ok: 'check-circle',
    warning: 'alert-triangle',
    error: 'x-circle',
    info: 'info'
  }[check.status] || 'help-circle';

  const statusColor = {
    ok: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#3b82f6'
  }[check.status] || '#6b7280';

  const issuesHTML = check.issues.length > 0 ? `
    <div class="check-issues">
      <ul>
        ${check.issues.map(issue => `<li>${issue}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const fixButton = check.fixable && check.fix ? `
    <button class="btn btn-primary btn-sm"
            onclick="window.diagnosticsModule.autoFix('${check.fix}', '${check.name}')">
      <i data-lucide="wrench"></i>
      Auto-Fix
    </button>
  ` : '';

  return `
    <div class="diagnostic-check" data-status="${check.status}">
      <div class="check-header">
        <div class="check-title">
          <i data-lucide="${statusIcon}" style="color: ${statusColor}"></i>
          <strong>${check.description}</strong>
        </div>
        ${fixButton}
      </div>
      ${issuesHTML}
    </div>
  `;
}

/**
 * Auto-fix an issue
 */
export async function autoFix(fixType, checkName) {
  const modal = document.getElementById('diagnostics-modal');
  const worktreeName = modal.dataset.worktreeName || null;

  const button = event.target.closest('button');
  const originalHTML = button.innerHTML;

  try {
    // Disable button and show loading
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Fixing...';
    if (window.lucide) window.lucide.createIcons();

    const response = await fetch(`/api/diagnostics/fix/${fixType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktreeName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fix failed');
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Fix failed');
    }

    // Show success
    button.innerHTML = '<i data-lucide="check"></i> Fixed';
    button.classList.remove('btn-primary');
    button.classList.add('btn-success');
    if (window.lucide) window.lucide.createIcons();

    // Show toast notification
    if (window.showToast) {
      window.showToast(result.message, 'success');
    }

    // Re-run diagnostics after a delay
    setTimeout(() => {
      runDiagnostics(worktreeName);
    }, 1500);
  } catch (error) {
    console.error('Failed to auto-fix:', error);

    // Restore button
    button.disabled = false;
    button.innerHTML = originalHTML;
    if (window.lucide) window.lucide.createIcons();

    // Show error
    if (window.showToast) {
      window.showToast(`Failed to fix: ${error.message}`, 'error');
    } else {
      alert(`Failed to fix: ${error.message}`);
    }
  }
}

/**
 * Retry diagnostics
 */
export function retryDiagnostics() {
  const modal = document.getElementById('diagnostics-modal');
  const worktreeName = modal.dataset.worktreeName || null;
  runDiagnostics(worktreeName);
}

/**
 * Show health indicator in sidebar
 */
export function updateHealthIndicator(worktreeName, health) {
  const indicator = document.querySelector(
    `.worktree-item[data-name="${worktreeName}"] .health-indicator`
  );

  if (!indicator) return;

  const colors = {
    healthy: '#22c55e',
    warning: '#eab308',
    critical: '#ef4444',
    unknown: '#6b7280'
  };

  indicator.style.backgroundColor = colors[health] || colors.unknown;
  indicator.title = `Health: ${health}`;
}

// Export to global scope
window.diagnosticsModule = {
  showDiagnosticsModal,
  hideDiagnosticsModal,
  autoFix,
  retryDiagnostics,
  updateHealthIndicator
};
