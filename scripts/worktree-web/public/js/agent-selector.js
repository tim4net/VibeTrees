/**
 * Agent Selector Component
 * Dropdown component for selecting AI agents with availability checking
 */

/**
 * AgentSelector class - manages agent selection UI
 */
class AgentSelector {
  constructor() {
    this.agents = [];
    this.selectedAgent = null;
    this.onAgentChange = null;
  }

  /**
   * Initialize the agent selector
   * @param {string} containerId - ID of container element
   * @param {Object} options - Configuration options
   */
  async init(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = {
      defaultAgent: options.defaultAgent || 'claude',
      showHints: options.showHints !== false,
      showCapabilities: options.showCapabilities === true,
      ...options
    };

    if (!this.container) {
      console.error(`[AgentSelector] Container not found: ${containerId}`);
      return;
    }

    // Fetch available agents
    await this.loadAgents();

    // Render the selector
    this.render();

    // Set default agent
    this.selectAgent(this.options.defaultAgent);
  }

  /**
   * Load agents from API
   */
  async loadAgents() {
    try {
      const response = await fetch('/api/agents');
      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.statusText}`);
      }
      const data = await response.json();
      // Handle both array response and object with agents key
      this.agents = Array.isArray(data) ? data : (data.agents || []);
      console.log('[AgentSelector] Loaded agents:', this.agents);
    } catch (error) {
      console.error('[AgentSelector] Error loading agents:', error);
      this.agents = [];
    }
  }

  /**
   * Render the agent selector UI
   */
  render() {
    if (!this.container) return;

    const html = `
      <div class="agent-selector">
        <div class="agent-selector-dropdown" id="${this.containerId}-dropdown">
          <button type="button" class="agent-selector-button" id="${this.containerId}-button">
            <span class="agent-icon" id="${this.containerId}-icon">🤖</span>
            <span class="agent-name" id="${this.containerId}-name">Select Agent</span>
            <span class="agent-chevron">▼</span>
          </button>
          <div class="agent-selector-menu" id="${this.containerId}-menu">
            ${this.renderAgentList()}
          </div>
        </div>
        ${this.options.showHints ? `
          <div class="agent-hint" id="${this.containerId}-hint" style="display: none;">
            <div class="agent-hint-content"></div>
          </div>
        ` : ''}
      </div>
    `;

    this.container.innerHTML = html;

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render the agent list items
   */
  renderAgentList() {
    if (!this.agents.length) {
      return '<div class="agent-option disabled">No agents available</div>';
    }

    return this.agents.map(agent => {
      const isAvailable = agent.installed || agent.name === 'shell';
      const statusIcon = isAvailable ? '✓' : '✗';
      const statusClass = isAvailable ? 'available' : 'unavailable';

      return `
        <div class="agent-option ${isAvailable ? '' : 'disabled'}" data-agent="${agent.name}">
          <span class="agent-icon">${agent.icon}</span>
          <div class="agent-info">
            <div class="agent-option-name">${agent.displayName}</div>
            ${this.options.showCapabilities && agent.capabilities.length ? `
              <div class="agent-capabilities">${agent.capabilities.slice(0, 2).join(', ')}</div>
            ` : ''}
          </div>
          <span class="agent-status ${statusClass}">${statusIcon}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const button = document.getElementById(`${this.containerId}-button`);
    const menu = document.getElementById(`${this.containerId}-menu`);

    if (!button || !menu) return;

    // Toggle dropdown on button click
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('active');

      // Close all other dropdowns
      document.querySelectorAll('.agent-selector-menu.active').forEach(m => {
        m.classList.remove('active');
      });

      if (!isOpen) {
        menu.classList.add('active');
      }
    });

    // Handle agent selection
    menu.addEventListener('click', (e) => {
      const option = e.target.closest('.agent-option');
      if (!option || option.classList.contains('disabled')) return;

      const agentName = option.dataset.agent;
      this.selectAgent(agentName);
      menu.classList.remove('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        menu.classList.remove('active');
      }
    });
  }

  /**
   * Select an agent
   * @param {string} agentName - Name of agent to select
   */
  selectAgent(agentName) {
    const agent = this.agents.find(a => a.name === agentName);
    if (!agent) {
      console.warn(`[AgentSelector] Agent not found: ${agentName}`);
      return;
    }

    // Check if agent is available
    if (!agent.installed && agent.name !== 'shell') {
      console.warn(`[AgentSelector] Agent not installed: ${agentName}`);
      return;
    }

    this.selectedAgent = agent;

    // Update UI
    this.updateSelectedDisplay();
    this.updateHint();

    // Trigger callback
    if (this.onAgentChange) {
      this.onAgentChange(agent);
    }
  }

  /**
   * Update the selected agent display
   */
  updateSelectedDisplay() {
    const icon = document.getElementById(`${this.containerId}-icon`);
    const name = document.getElementById(`${this.containerId}-name`);

    if (icon && this.selectedAgent) {
      icon.textContent = this.selectedAgent.icon;
    }

    if (name && this.selectedAgent) {
      name.textContent = this.selectedAgent.displayName;
    }
  }

  /**
   * Update the hint display
   */
  updateHint() {
    if (!this.options.showHints) return;

    const hint = document.getElementById(`${this.containerId}-hint`);
    if (!hint) return;

    if (!this.selectedAgent) {
      hint.style.display = 'none';
      return;
    }

    // Show hint if agent has requirements
    const requirements = this.getAgentRequirements(this.selectedAgent.name);
    if (requirements) {
      hint.style.display = 'block';
      hint.querySelector('.agent-hint-content').innerHTML = `
        <span class="agent-hint-icon">⚠️</span>
        <span>${requirements}</span>
      `;
    } else {
      hint.style.display = 'none';
    }
  }

  /**
   * Get agent requirements message
   * @param {string} agentName - Agent name
   * @returns {string|null} Requirements message or null
   */
  getAgentRequirements(agentName) {
    switch (agentName) {
      case 'codex':
        return 'Codex requires <code>OPENAI_API_KEY</code> environment variable';
      case 'gemini':
        return 'Gemini requires <code>GOOGLE_API_KEY</code> environment variable';
      case 'claude':
      case 'shell':
      default:
        return null;
    }
  }

  /**
   * Get selected agent
   * @returns {Object|null} Selected agent or null
   */
  getSelectedAgent() {
    return this.selectedAgent;
  }

  /**
   * Get selected agent name
   * @returns {string|null} Agent name or null
   */
  getSelectedAgentName() {
    return this.selectedAgent ? this.selectedAgent.name : null;
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.selectedAgent = null;
    this.updateSelectedDisplay();
    this.updateHint();
  }
}

/**
 * AgentBadge class - displays agent badge on worktree cards
 */
class AgentBadge {
  constructor(worktreeName, currentAgent) {
    this.worktreeName = worktreeName;
    this.currentAgent = currentAgent || 'claude';
    this.agents = [];
  }

  /**
   * Load agents from API
   */
  async loadAgents() {
    try {
      const response = await fetch('/api/agents');
      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.statusText}`);
      }
      const data = await response.json();
      // Handle both array response and object with agents key
      this.agents = Array.isArray(data) ? data : (data.agents || []);
    } catch (error) {
      console.error('[AgentBadge] Error loading agents:', error);
      this.agents = [];
    }
  }

  /**
   * Render the agent badge
   * @returns {string} HTML for agent badge
   */
  async render() {
    await this.loadAgents();

    const agent = this.agents.find(a => a.name === this.currentAgent);
    if (!agent) {
      return `<span class="agent-badge">🤖 Unknown</span>`;
    }

    return `
      <div class="agent-badge-container">
        <span class="agent-badge" title="${agent.displayName}">
          ${agent.icon} ${agent.displayName}
        </span>
        <button class="agent-switch-button" onclick="window.showAgentSwitcher('${this.worktreeName}', '${this.currentAgent}')" title="Switch Agent">
          <i data-lucide="refresh-cw" class="lucide-sm"></i>
        </button>
      </div>
    `;
  }
}

/**
 * Show agent switcher dialog
 * @param {string} worktreeName - Name of worktree
 * @param {string} currentAgent - Current agent name
 */
window.showAgentSwitcher = async function(worktreeName, currentAgent) {
  // Fetch agents
  let agents = [];
  try {
    const response = await fetch('/api/agents');
    const data = await response.json();
    // Handle both array response and object with agents key
    agents = Array.isArray(data) ? data : (data.agents || []);
  } catch (error) {
    console.error('[showAgentSwitcher] Error loading agents:', error);
    alert('Failed to load agents');
    return;
  }

  // Build agent options
  const options = agents
    .filter(a => a.installed || a.name === 'shell')
    .map(a => {
      const selected = a.name === currentAgent ? 'selected' : '';
      return `<option value="${a.name}" ${selected}>${a.icon} ${a.displayName}</option>`;
    })
    .join('');

  // Show confirm dialog
  const agent = prompt(
    `Switch agent for ${worktreeName}?\n\nCurrent: ${currentAgent}\n\nEnter new agent name (claude, codex, gemini, shell):`,
    currentAgent
  );

  if (!agent || agent === currentAgent) {
    return;
  }

  // Validate agent exists and is installed
  const agentObj = agents.find(a => a.name === agent);
  if (!agentObj) {
    alert(`Agent "${agent}" not found`);
    return;
  }

  if (!agentObj.installed && agent !== 'shell') {
    alert(`Agent "${agent}" is not installed`);
    return;
  }

  // Confirm terminal will restart
  if (!confirm(`Switch to ${agentObj.displayName}?\n\nThe terminal will restart.`)) {
    return;
  }

  // Call API to switch agent
  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/agent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent })
    });

    if (!response.ok) {
      throw new Error(`Failed to switch agent: ${response.statusText}`);
    }

    // Reload page to refresh terminals
    window.location.reload();
  } catch (error) {
    console.error('[showAgentSwitcher] Error switching agent:', error);
    alert(`Failed to switch agent: ${error.message}`);
  }
};

// Export for use in other modules
window.AgentSelector = AgentSelector;
window.AgentBadge = AgentBadge;
