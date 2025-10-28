/**
 * Performance Metrics Module
 * Fetches and displays performance metrics
 */

/**
 * Fetch and display performance metrics
 */
export async function refreshMetrics() {
  try {
    const response = await fetch('/api/performance/metrics');
    const data = await response.json();

    // Update average worktree creation time
    const avgCreationElement = document.getElementById('avgCreation');
    if (avgCreationElement) {
      avgCreationElement.textContent = data.avgWorktreeCreation
        ? `${(data.avgWorktreeCreation / 1000).toFixed(2)}s`
        : 'N/A';
    }

    // Update operations table
    const tbody = document.querySelector('#operationsTable tbody');
    if (tbody) {
      tbody.innerHTML = '';

      data.operations.forEach(op => {
        const row = tbody.insertRow();
        row.style.borderBottom = '1px solid var(--border)';

        const nameCell = row.insertCell(0);
        nameCell.textContent = op.name;
        nameCell.style.padding = '0.25rem';

        const avgCell = row.insertCell(1);
        avgCell.textContent = op.avg.toFixed(2);
        avgCell.style.padding = '0.25rem';

        const countCell = row.insertCell(2);
        countCell.textContent = op.count;
        countCell.style.padding = '0.25rem';
      });
    }
  } catch (error) {
    console.error('[performance-metrics] Error fetching metrics:', error);
  }
}

/**
 * Initialize performance metrics
 */
export function initPerformanceMetrics() {
  const refreshBtn = document.getElementById('refreshMetricsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshMetrics);
  }

  // Initial load
  refreshMetrics();
}
