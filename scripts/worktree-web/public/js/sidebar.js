/**
 * Sidebar Component
 * Handles sidebar rendering and worktree selection
 */

import { appState } from './state.js';
import { showContextMenu, showWorktreeContextMenu, showStatusContextMenu } from './context-menus.js';

/**
 * Initialize sidebar
 */
export function initSidebar() {
  // Setup collapse toggle
  const collapseBtn = document.getElementById('collapse-sidebar-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      appState.toggleSidebar();
    });
  }

  // Listen to state changes
  appState.on('sidebar:toggled', (collapsed) => {
    renderSidebarState(collapsed);
  });

  appState.on('worktrees:updated', () => {
    renderWorktrees();

    // Ensure a worktree is selected after rendering
    // Give DOM time to update, then trigger selection if needed
    setTimeout(() => {
      if (!appState.selectedWorktreeId && window.selectionManager) {
        window.selectionManager.selectDefaultWorktree();
      }
    }, 100);
  });

  // Set initial state
  renderSidebarState(appState.sidebarCollapsed);

  // Setup resize functionality
  setupSidebarResize();

  // Setup instant tooltips for sidebar header buttons
  setupInstantTooltips();

}

/**
 * Render sidebar collapsed/expanded state
 */
function renderSidebarState(collapsed) {
  const sidebar = document.getElementById('sidebar');
  const collapseIcon = document.getElementById('collapse-icon');
  const collapseBtn = document.getElementById('collapse-sidebar-btn');

  if (collapsed) {
    sidebar.classList.add('collapsed');
    if (collapseIcon) collapseIcon.setAttribute('data-lucide', 'panel-left-open');
    if (collapseBtn) collapseBtn.setAttribute('title', 'Expand sidebar');
  } else {
    sidebar.classList.remove('collapsed');
    if (collapseIcon) collapseIcon.setAttribute('data-lucide', 'panel-left-close');
    if (collapseBtn) collapseBtn.setAttribute('title', 'Collapse sidebar');
  }

  // Re-render worktrees in the new layout
  renderWorktrees();

  // Reinitialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Trigger terminal resize
  window.dispatchEvent(new Event('resize'));
}

/**
 * Render worktrees
 */
export function renderWorktrees() {
  const worktrees = appState.worktrees;
  const container = document.getElementById('worktrees-container');

  if (!container) return;

  if (worktrees.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #8b949e;">
        <div style="font-size: 48px; margin-bottom: 16px;">🌲</div>
        <h3>No worktrees yet</h3>
        <p>Create your first worktree to get started</p>
      </div>
    `;
    return;
  }

  if (appState.sidebarCollapsed) {
    renderVerticalTabs(worktrees, container);
  } else {
    renderWorktreeCards(worktrees, container);
  }

  // Reinitialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Render worktree cards (expanded view)
 */
function renderWorktreeCards(worktrees, container) {
  container.innerHTML = worktrees.map(wt => {
    // Handle creating worktrees
    if (wt.status === 'creating') {
      const isActive = appState.selectedWorktreeId === wt.name;
      const progressHtml = wt.progressLog && wt.progressLog.length > 0
        ? `
          <div class="progress-log">
            ${wt.progressLog.slice(-10).map(msg => `<div class="progress-line">${msg}</div>`).join('')}
          </div>
        `
        : '<div class="progress-log"><div class="progress-line">Starting creation...</div></div>';

      return `
        <div class="worktree-card creating ${isActive ? 'active selected' : ''}" data-name="${wt.name}" onclick="selectWorktree('${wt.name}')">
          <div class="worktree-header">
            <div>
              <div class="worktree-title">
                <i data-lucide="loader" class="spin" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px; color: #58a6ff;"></i>
                <span>${wt.name}</span>
              </div>
              <div class="worktree-branch" style="font-size: 11px; color: #8b949e; margin-left: 24px; margin-top: 2px;">
                <i data-lucide="git-branch" style="width: 10px; height: 10px; vertical-align: middle;"></i> ${wt.branch}
              </div>
            </div>
            <span class="status-badge status-creating">Creating...</span>
          </div>
          ${progressHtml}
        </div>
      `;
    }

    // Handle error worktrees
    if (wt.status === 'error') {
      const isActive = appState.selectedWorktreeId === wt.name;
      return `
        <div class="worktree-card error ${isActive ? 'active selected' : ''}" data-name="${wt.name}">
          <div class="worktree-header">
            <div>
              <div class="worktree-title">
                <i data-lucide="x-circle" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px; color: #f85149;"></i>
                <span>${wt.name}</span>
              </div>
            </div>
            <span class="status-badge status-error">Failed</span>
          </div>
          <div class="error-message">${wt.error || 'Unknown error'}</div>
        </div>
      `;
    }

    const isMain = !wt.path.includes('.worktrees');
    const isActive = appState.selectedWorktreeId === wt.name;
    const servicesRunning = wt.dockerStatus.filter(s => s.state === 'running').length;
    const servicesTotal = wt.dockerStatus.length;
    const gitStatusClass = wt.gitStatus ? `git-${wt.gitStatus}` : '';

    let statusClass = 'status-stopped';
    let statusText = 'Stopped';

    if (servicesTotal === 0) {
      statusText = 'No Services';
    } else if (servicesRunning === servicesTotal) {
      statusClass = 'status-running';
      statusText = 'Running';
    } else if (servicesRunning > 0) {
      statusClass = 'status-mixed';
      statusText = 'Partial';
    }

    // Hide status badge completely when there are no services
    const statusBadge = servicesTotal > 0
      ? `<span class="status-badge ${statusClass}" onclick="showStatusContextMenu(event, '${wt.name}', ${servicesRunning}, ${servicesTotal})" oncontextmenu="showStatusContextMenu(event, '${wt.name}', ${servicesRunning}, ${servicesTotal})">${statusText} <i data-lucide="chevron-down" class="status-badge-chevron"></i></span>`
      : '';

    // Show ports section for services, or action buttons for containerless worktrees
    const portsHtml = wt.dockerStatus.length > 0
      ? wt.dockerStatus.map(container => {
          const portValue = wt.ports[container.name];
          const portDisplay = portValue ? `: ${portValue}` : '';
          return `
            <div class="port clickable"
                 onclick="window.openLogs('${wt.name}', '${container.name}')"
                 oncontextmenu="showContextMenu(event, '${wt.name}', '${container.name}')"
                 title="Left-click to view logs, Right-click for options">
              <span class="status-indicator ${container.state}"></span>
              <span class="port-label">${container.name}${portDisplay}</span>
            </div>
          `;
        }).join('')
      : `
        <div class="worktree-actions">
          <button class="worktree-action-btn" onclick="event.stopPropagation(); window.openShell('${wt.name}')" title="Open Shell">
            <i data-lucide="terminal" style="width: 14px; height: 14px;"></i>
            <span>Shell</span>
          </button>
          <button class="worktree-action-btn" onclick="event.stopPropagation(); window.openTerminal('${wt.name}', 'claude')" title="Open Claude">
            <img src="/icons/anthropic.svg" style="width: 14px; height: 14px; filter: brightness(0) invert(1);" />
            <span>Claude</span>
          </button>
          <button class="worktree-action-btn" onclick="event.stopPropagation(); window.openTerminal('${wt.name}', 'codex')" title="Open Codex">
            <img src="/icons/openai.svg" style="width: 14px; height: 14px; filter: brightness(0) invert(1);" />
            <span>Codex</span>
          </button>
          <button class="worktree-action-btn danger" onclick="event.stopPropagation(); showWorktreeContextMenu(event, '${wt.name}', ${isMain})" title="More actions">
            <i data-lucide="more-horizontal" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      `;

    // Determine icon based on whether this is the main worktree or has commits
    // Main worktree or worktrees with at least 1 commit get tree-pine
    // New worktrees with no commits get sprout
    const hasCommits = wt.commitCount > 0;
    const icon = (isMain || hasCommits) ? 'tree-pine' : 'sprout';
    console.log(`[sidebar] ${wt.name}: commitCount=${wt.commitCount}, hasCommits=${hasCommits}, isMain=${isMain}, icon=${icon}`);

    // Build GitHub link for the icon if available
    const githubLink = wt.githubUrl && wt.branch
      ? `${wt.githubUrl}/tree/${wt.branch}`
      : null;

    // Determine git status color and tooltip
    const gitStatusColors = {
      'clean': '#2ea043',
      'uncommitted': '#e5a935',
      'unpushed': '#58a6ff'
    };
    const gitStatusLabels = {
      'clean': 'Clean - no changes',
      'uncommitted': 'Uncommitted changes',
      'unpushed': 'Unpushed commits'
    };
    const iconColor = wt.gitStatus ? gitStatusColors[wt.gitStatus] : '';
    const iconTooltip = wt.gitStatus ? gitStatusLabels[wt.gitStatus] : 'Unknown git status';

    const iconHtml = githubLink
      ? `<a href="${githubLink}" target="_blank" onclick="event.stopPropagation();" title="${iconTooltip}\nClick to view branch on GitHub" style="display: inline-flex; align-items: center; text-decoration: none; color: ${iconColor};">
           <i data-lucide="${icon}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;"></i>
         </a>`
      : `<i data-lucide="${icon}" title="${iconTooltip}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px; color: ${iconColor};"></i>`;

    // Render agent badge (default to 'claude' if not set)
    const currentAgent = wt.agent || 'claude';
    const agentIcons = {
      'claude': '🤖',
      'codex': '🔮',
      'gemini': '✨',
      'shell': '💻'
    };
    const agentNames = {
      'claude': 'Claude',
      'codex': 'Codex',
      'gemini': 'Gemini',
      'shell': 'Shell'
    };
    const agentIcon = agentIcons[currentAgent] || '🤖';
    const agentName = agentNames[currentAgent] || currentAgent;

    // Show branch as subheading if it differs from worktree name
    const branchSubheading = wt.branch && wt.branch !== wt.name
      ? `<div class="worktree-branch" style="font-size: 11px; color: #8b949e; margin-left: 24px; margin-top: 2px;">
           <i data-lucide="git-branch" style="width: 10px; height: 10px; vertical-align: middle;"></i> ${wt.branch}
         </div>`
      : '';

    return `
      <div class="worktree-card ${isActive ? 'active selected' : ''} ${gitStatusClass}" data-name="${wt.name}" onclick="selectWorktree('${wt.name}')">
        <div class="worktree-header">
          <div>
            <div class="worktree-title" oncontextmenu="showWorktreeContextMenu(event, '${wt.name}', ${isMain}); event.stopPropagation();" style="cursor: context-menu;">
              ${iconHtml}<span>${wt.name}</span>
            </div>
            ${branchSubheading}
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
            ${statusBadge}
          </div>
        </div>
        <div class="ports">${portsHtml}</div>
      </div>
    `;
  }).join('');
}

/**
 * Render vertical tabs (collapsed view)
 */
function renderVerticalTabs(worktrees, container) {
  container.innerHTML = `
    <div class="vertical-tabs">
      ${worktrees.map(wt => {
        const isActive = appState.selectedWorktreeId === wt.name;
        const servicesRunning = wt.dockerStatus.filter(s => s.state === 'running').length;
        const servicesTotal = wt.dockerStatus.length;

        let statusClass = 'exited';
        if (servicesRunning === servicesTotal && servicesTotal > 0) {
          statusClass = 'running';
        } else if (servicesRunning > 0) {
          statusClass = 'restarting';
        }

        // Hide status indicator when there are no services
        const statusIndicator = servicesTotal > 0
          ? `<span class="status-indicator ${statusClass}"></span>`
          : '';

        // Show branch in tooltip if it differs from worktree name
        const tooltipText = wt.branch && wt.branch !== wt.name
          ? `${wt.name} (${wt.branch})`
          : wt.name;

        return `
          <div class="vertical-tab ${isActive ? 'active' : ''}"
               onclick="selectWorktree('${wt.name}')"
               ondblclick="appState.toggleSidebar()"
               title="${tooltipText}">
            ${statusIndicator}
            <span>${wt.name}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Select a worktree
 * Note: A worktree must ALWAYS be selected - clicking the same one does nothing
 */
window.selectWorktree = function(worktreeName) {
  // Only change selection if clicking a different worktree
  if (appState.selectedWorktreeId !== worktreeName) {
    appState.selectWorktree(worktreeName);

    // Also update the selection manager if it exists
    if (window.selectionManager) {
      window.selectionManager.selectWorktree(worktreeName, { skipNavigation: true });
    }

    renderWorktrees();
  }
  // If clicking the same worktree, do nothing (keep it selected)
};

/**
 * Setup sidebar resize functionality
 */
function setupSidebarResize() {
  const sidebar = document.getElementById('sidebar');
  const resizeHandle = document.getElementById('resize-handle');

  if (!sidebar || !resizeHandle) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  // Load saved width
  const savedWidth = localStorage.getItem('sidebar-width');
  if (savedWidth && !appState.sidebarCollapsed) {
    sidebar.style.width = savedWidth + 'px';
  }

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;

    const minWidth = parseInt(getComputedStyle(sidebar).minWidth);
    const maxWidth = parseInt(getComputedStyle(sidebar).maxWidth);

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      sidebar.style.width = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      localStorage.setItem('sidebar-width', sidebar.offsetWidth);
      window.dispatchEvent(new Event('resize'));
    }
  });

  // Double-click to reset
  resizeHandle.addEventListener('dblclick', () => {
    sidebar.style.width = '320px';
    localStorage.setItem('sidebar-width', '320');
    window.dispatchEvent(new Event('resize'));
  });
}

/**
 * Setup instant tooltips for sidebar buttons
 */
function setupInstantTooltips() {
  const tooltipDiv = document.getElementById('instant-tooltip') || createTooltipDiv();

  document.querySelectorAll('.sidebar-actions button[title]').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => {
      const title = e.currentTarget.getAttribute('title');
      if (!title) return;

      const rect = e.currentTarget.getBoundingClientRect();
      tooltipDiv.textContent = title;

      // Show tooltip off-screen to measure it
      tooltipDiv.style.visibility = 'hidden';
      tooltipDiv.style.display = 'block';
      const tooltipWidth = tooltipDiv.offsetWidth;

      // Calculate tooltip position
      let leftPos = rect.left + rect.width / 2;

      // Check if tooltip would go off-screen left
      if (leftPos - tooltipWidth / 2 < 10) {
        // Align to left edge of button instead of centering
        tooltipDiv.style.left = (rect.left) + 'px';
        tooltipDiv.style.transform = 'translateX(0)';
      } else {
        // Center normally
        tooltipDiv.style.left = leftPos + 'px';
        tooltipDiv.style.transform = 'translateX(-50%)';
      }

      tooltipDiv.style.top = (rect.bottom + 8) + 'px';
      tooltipDiv.style.visibility = 'visible';
    });

    btn.addEventListener('mouseleave', () => {
      tooltipDiv.style.display = 'none';
    });
  });
}

/**
 * Create tooltip div element
 */
function createTooltipDiv() {
  const div = document.createElement('div');
  div.id = 'instant-tooltip';
  div.style.cssText = `
    position: fixed;
    background: #1c2128;
    color: #c9d1d9;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    white-space: nowrap;
    border: 1px solid #30363d;
    z-index: 99999;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    display: none;
    transform: translateX(-50%);
  `;
  document.body.appendChild(div);
  return div;
}
