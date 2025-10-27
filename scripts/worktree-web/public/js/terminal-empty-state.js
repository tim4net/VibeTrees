/**
 * Terminal Empty State Module
 * Handles the empty terminal state with clickable terminal options
 */

import { appState } from './state.js';

// Terminal options configuration - abstracted for easy modification
const TERMINAL_OPTIONS = [
  {
    id: 'browser',
    icon: 'globe',
    label: 'Console UI',
    description: 'Web interface',
    action: (worktree) => {
      // Find the worktree and get its console port
      const wt = appState.worktrees.find(w => w.name === worktree);
      if (wt && wt.ports.console) {
        window.openWebUI(worktree, wt.ports.console);
      }
    }
  },
  {
    id: 'shell',
    icon: 'terminal',
    label: 'Shell',
    description: 'Interactive bash shell',
    action: (worktree) => window.openShell(worktree)
  },
  {
    id: 'claude',
    icon: '/icons/anthropic.svg',
    label: 'Claude Code',
    description: 'AI coding assistant',
    action: (worktree) => window.openTerminal(worktree, 'claude')
  },
  {
    id: 'codex',
    icon: '/icons/openai.svg',
    label: 'OpenAI Codex',
    description: 'AI coding assistant',
    action: (worktree) => window.openTerminal(worktree, 'codex')
  },
  {
    id: 'logs',
    icon: 'file-text',
    label: 'All Logs',
    description: 'Combined service logs',
    action: (worktree) => window.openCombinedLogs(worktree)
  }
];

/**
 * Setup the empty terminal state with clickable options
 */
export function setupEmptyState() {
  const emptyState = document.querySelector('.empty-terminal');
  if (!emptyState) return;

  // Render options grid
  const optionsHtml = TERMINAL_OPTIONS.map(option => {
    const isLucideIcon = !option.icon.includes('/');
    const iconHtml = isLucideIcon
      ? `<i data-lucide="${option.icon}" style="width: 48px; height: 48px;"></i>`
      : `<img src="${option.icon}" style="width: 48px; height: 48px; filter: brightness(0) invert(1);" />`;

    return `
      <div class="terminal-option" data-option-id="${option.id}">
        <div class="terminal-option-icon">${iconHtml}</div>
        <div class="terminal-option-label">${option.label}</div>
        <div class="terminal-option-description">${option.description}</div>
      </div>
    `;
  }).join('');

  emptyState.innerHTML = `
    <div class="empty-terminal-header">
      <div class="empty-terminal-icon"><i data-lucide="monitor" style="width: 64px; height: 64px;"></i></div>
      <h3>Open a Terminal</h3>
      <p>Select an option to get started</p>
    </div>
    <div class="terminal-options-grid">
      ${optionsHtml}
    </div>
  `;

  // Add click handlers
  emptyState.querySelectorAll('.terminal-option').forEach(optionEl => {
    optionEl.addEventListener('click', () => {
      const optionId = optionEl.dataset.optionId;
      const option = TERMINAL_OPTIONS.find(opt => opt.id === optionId);
      if (option) {
        handleTerminalOptionClick(option);
      }
    });
  });

  // Initialize Lucide icons in empty state
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Handle clicking a terminal option
 */
function handleTerminalOptionClick(option) {
  // Get the target worktree (selected or main)
  let targetWorktree = appState.selectedWorktreeId;

  if (!targetWorktree) {
    // Use main worktree if none selected
    const worktrees = appState.worktrees;
    const mainWorktree = worktrees.find(wt => !wt.path.includes('.worktrees'));
    targetWorktree = mainWorktree ? mainWorktree.name : (worktrees[0]?.name || null);
  }

  if (targetWorktree) {
    option.action(targetWorktree);
  }
}
