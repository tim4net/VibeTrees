/**
 * Zen MCP Configuration Panel
 * Manages API key configuration for AI model providers
 */

/**
 * MCPConfigPanel class - manages Zen MCP configuration UI
 */
class MCPConfigPanel {
  constructor() {
    // DOM references (initialized in init())
    this.panel = null;
    this.toggle = null;
    this.content = null;
    this.statusSummary = null;

    // Provider configuration - matches zen-mcp-server supported providers
    // See: https://github.com/BeehiveInnovations/zen-mcp-server
    this.providers = {
      gemini: {
        name: 'Google Gemini',
        envKey: 'GEMINI_API_KEY',
        prefix: 'AIza',
        description: 'Gemini Pro, Gemini Ultra, and other Google AI models',
        docsUrl: 'https://makersuite.google.com/app/apikey'
      },
      openai: {
        name: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        prefix: 'sk-',
        description: 'GPT-4o, o1, o3 and other OpenAI models',
        docsUrl: 'https://platform.openai.com/api-keys'
      },
      openrouter: {
        name: 'OpenRouter',
        envKey: 'OPENROUTER_API_KEY',
        prefix: 'sk-or-',
        description: 'Access 200+ AI models through unified API',
        docsUrl: 'https://openrouter.ai/keys'
      },
      azure: {
        name: 'Azure OpenAI',
        envKey: 'AZURE_OPENAI_API_KEY',
        prefix: '',  // Azure keys have various formats
        description: 'Enterprise Azure OpenAI deployments',
        docsUrl: 'https://portal.azure.com'
      },
      xai: {
        name: 'XAI (Grok)',
        envKey: 'XAI_API_KEY',
        prefix: 'xai-',
        description: 'Grok models from X.AI',
        docsUrl: 'https://console.x.ai'
      },
      dial: {
        name: 'DIAL',
        envKey: 'DIAL_API_KEY',
        prefix: '',  // DIAL keys have various formats
        description: 'Vendor-agnostic AI access via DIAL',
        docsUrl: 'https://dialx.ai'
      }
    };

    // State
    this.state = {
      expanded: false,
      configs: {},
      testingProvider: null,
      savingProvider: null
    };
  }

  /**
   * Initialize the MCP config panel
   */
  async init() {
    // Get DOM references
    this.panel = document.getElementById('mcp-config-panel');
    this.toggle = document.getElementById('mcp-panel-toggle');
    this.content = document.getElementById('mcp-panel-content');
    this.statusSummary = document.getElementById('mcp-status-summary');

    if (!this.panel || !this.toggle || !this.content) {
      console.error('[MCPConfigPanel] Required DOM elements not found');
      return;
    }

    // Load current configurations
    await this.loadConfigurations();

    // Bind event listeners
    this.bindEvents();

    console.log('[MCPConfigPanel] Initialized successfully');
  }

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Panel toggle
    this.toggle.addEventListener('click', () => this.togglePanel());

    // Provider header clicks (expand/collapse)
    this.content.querySelectorAll('.mcp-provider-header').forEach(header => {
      header.addEventListener('click', (e) => this.toggleProvider(e));
    });

    // Visibility toggle buttons
    this.content.querySelectorAll('.mcp-toggle-visibility').forEach(btn => {
      btn.addEventListener('click', (e) => this.toggleKeyVisibility(e));
    });

    // Input validation
    this.content.querySelectorAll('.mcp-key-input').forEach(input => {
      input.addEventListener('input', (e) => this.validateInput(e));
    });

    // Test buttons
    this.content.querySelectorAll('.mcp-test-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.testConnection(e));
    });

    // Save buttons
    this.content.querySelectorAll('.mcp-save-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.saveKey(e));
    });

    // Cancel buttons
    this.content.querySelectorAll('.mcp-cancel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.cancelEdit(e));
    });

    // Keyboard shortcuts
    this.content.querySelectorAll('.mcp-key-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        const provider = e.target.dataset.provider;
        if (e.key === 'Enter') {
          e.preventDefault();
          this.saveKey(e);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.cancelEdit(e);
        }
      });
    });

    // Close expanded providers when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target)) {
        this.collapseAllProviders();
      }
    });
  }

  /**
   * Load current configurations from API
   */
  async loadConfigurations() {
    try {
      const response = await fetch('/api/zen-mcp/config');

      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        // API returns 'providers' with 'enabled' field, but UI uses 'configured'
        // Map the response to UI format
        const providers = data.providers || {};
        this.state.configs = {};

        Object.entries(providers).forEach(([provider, config]) => {
          this.state.configs[provider] = {
            configured: Boolean(config.enabled && config.apiKey),
            apiKey: config.apiKey,
            error: null
          };
        });

        // Update UI for each provider
        Object.keys(this.providers).forEach(provider => {
          const config = this.state.configs[provider] || {};
          this.updateProviderStatus(provider, config);
        });

        // Update summary
        this.updateStatusSummary();
      }

      console.log('[MCPConfigPanel] Configurations loaded:', this.state.configs);
    } catch (error) {
      console.error('[MCPConfigPanel] Error loading configurations:', error);
      this.showToast('Failed to load MCP configurations', 'error');
    }
  }

  /**
   * Toggle main panel expand/collapse
   */
  togglePanel() {
    this.state.expanded = !this.state.expanded;

    // Update ARIA attribute
    this.toggle.setAttribute('aria-expanded', this.state.expanded);

    if (this.state.expanded) {
      this.panel.classList.add('expanded');
      this.content.classList.add('expanded');
      this.content.removeAttribute('hidden');
    } else {
      this.panel.classList.remove('expanded');
      this.content.classList.remove('expanded');
      this.content.setAttribute('hidden', '');
      this.collapseAllProviders();
    }
  }

  /**
   * Toggle provider card expand/collapse
   * @param {Event} event - Click event
   */
  toggleProvider(event) {
    event.stopPropagation();

    const header = event.currentTarget;
    const card = header.closest('.mcp-provider');
    const provider = card.dataset.provider;
    const body = card.querySelector('.mcp-provider-config');

    const isExpanded = card.classList.contains('expanded');

    // Collapse all other providers
    this.collapseAllProviders();

    // Toggle this provider
    if (!isExpanded) {
      card.classList.add('expanded');
      body.style.display = 'block';

      // Focus input
      const input = card.querySelector('.mcp-key-input');
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  /**
   * Collapse all provider cards
   */
  collapseAllProviders() {
    this.content.querySelectorAll('.mcp-provider').forEach(card => {
      card.classList.remove('expanded');
      const body = card.querySelector('.mcp-provider-config');
      if (body) {
        body.style.display = 'none';
      }
    });
  }

  /**
   * Toggle API key visibility (show/hide)
   * @param {Event} event - Click event
   */
  toggleKeyVisibility(event) {
    event.stopPropagation();

    const btn = event.currentTarget;
    const input = btn.closest('.mcp-input-group').querySelector('.mcp-key-input');
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
      input.type = 'text';
      icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      icon.setAttribute('data-lucide', 'eye');
    }

    // Refresh Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Validate API key input in real-time
   * @param {Event} event - Input event
   */
  validateInput(event) {
    const input = event.target;
    const provider = input.dataset.provider;
    const providerConfig = this.providers[provider];
    const value = input.value.trim();

    // Clear previous validation state
    input.classList.remove('valid', 'invalid');
    this.clearMessages(provider);

    if (!value) {
      return;
    }

    // Basic format validation - skip prefix check if provider has no required prefix
    if (!providerConfig.prefix) {
      // Providers like Azure and DIAL don't have required prefixes
      input.classList.add('valid');
      return;
    }

    const isValid = value.startsWith(providerConfig.prefix);

    if (isValid) {
      input.classList.add('valid');
    } else {
      input.classList.add('invalid');
      this.showError(provider, `API key should start with "${providerConfig.prefix}"`);
    }
  }

  /**
   * Test connection with provider API
   * @param {Event} event - Click event
   */
  async testConnection(event) {
    event.stopPropagation();

    const btn = event.currentTarget;
    const card = btn.closest('.mcp-provider');
    const provider = card.dataset.provider;
    const input = card.querySelector('.mcp-key-input');
    const apiKey = input.value.trim();

    if (!apiKey) {
      this.showError(provider, 'Please enter an API key');
      return;
    }

    // Set loading state
    this.state.testingProvider = provider;
    card.classList.add('loading');
    btn.disabled = true;
    const originalText = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = 'Testing...';
    this.clearMessages(provider);

    try {
      const response = await fetch('/api/zen-mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });

      const result = await response.json();

      if (result.success) {
        const modelCount = result.modelCount || 0;
        this.showSuccess(provider, `✓ Connected successfully! Found ${modelCount} models.`);
        input.classList.add('valid');
        input.classList.remove('invalid');
      } else {
        this.showError(provider, `✗ Connection failed: ${result.error}`);
        input.classList.remove('valid');
        input.classList.add('invalid');
      }
    } catch (error) {
      console.error('[MCPConfigPanel] Test connection error:', error);
      this.showError(provider, `✗ Test failed: ${error.message}`);
      input.classList.remove('valid');
      input.classList.add('invalid');
    } finally {
      // Clear loading state
      this.state.testingProvider = null;
      card.classList.remove('loading');
      btn.disabled = false;
      btn.querySelector('span').textContent = originalText;
    }
  }

  /**
   * Save API key to server
   * @param {Event} event - Click event
   */
  async saveKey(event) {
    event.stopPropagation();

    const btn = event.currentTarget;
    const card = btn.closest('.mcp-provider');
    const provider = card.dataset.provider;
    const input = card.querySelector('.mcp-key-input');
    const apiKey = input.value.trim();

    if (!apiKey) {
      this.showError(provider, 'Please enter an API key');
      return;
    }

    // Validate format (skip for providers without required prefix)
    const providerConfig = this.providers[provider];
    if (providerConfig.prefix && !apiKey.startsWith(providerConfig.prefix)) {
      this.showError(provider, `API key should start with "${providerConfig.prefix}"`);
      return;
    }

    // Set loading state
    this.state.savingProvider = provider;
    card.classList.add('loading');
    btn.disabled = true;
    const originalText = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = 'Saving...';
    this.clearMessages(provider);

    try {
      const response = await fetch('/api/zen-mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess(provider, '✓ API key saved successfully!');

        // Update state
        this.state.configs[provider] = {
          configured: true,
          lastTested: new Date().toISOString(),
          error: null
        };

        // Update UI
        this.updateProviderStatus(provider, this.state.configs[provider]);
        this.updateStatusSummary();

        // Show toast
        this.showToast(`${providerConfig.name} API key saved`, 'success');

        // Clear input and collapse after success
        setTimeout(() => {
          input.value = '';
          input.type = 'password';
          card.classList.remove('expanded');
          card.querySelector('.mcp-provider-config').style.display = 'none';
          this.clearMessages(provider);
        }, 2000);
      } else {
        this.showError(provider, `✗ Save failed: ${result.error}`);
        this.showToast(`Failed to save ${providerConfig.name} key`, 'error');
      }
    } catch (error) {
      console.error('[MCPConfigPanel] Save key error:', error);
      this.showError(provider, `✗ Save failed: ${error.message}`);
      this.showToast(`Failed to save ${providerConfig.name} key`, 'error');
    } finally {
      // Clear loading state
      this.state.savingProvider = null;
      card.classList.remove('loading');
      btn.disabled = false;
      btn.querySelector('span').textContent = originalText;
    }
  }

  /**
   * Cancel editing and reset form
   * @param {Event} event - Click event
   */
  cancelEdit(event) {
    event.stopPropagation();

    const btn = event.currentTarget;
    const card = btn.closest('.mcp-provider');
    const provider = card.dataset.provider;
    const input = card.querySelector('.mcp-key-input');

    // Reset input
    input.value = '';
    input.type = 'password';
    input.classList.remove('valid', 'invalid');

    // Clear messages
    this.clearMessages(provider);

    // Collapse card
    card.classList.remove('expanded');
    card.querySelector('.mcp-provider-config').style.display = 'none';
  }

  /**
   * Update provider status badge and card state
   * @param {string} provider - Provider name
   * @param {Object} status - Status object
   */
  updateProviderStatus(provider, status) {
    const card = this.content.querySelector(`.mcp-provider[data-provider="${provider}"]`);
    if (!card) return;

    const badge = card.querySelector('.mcp-status-badge');
    const statusDot = badge?.querySelector('.status-dot');
    const statusText = badge?.querySelector('.status-text');
    if (!badge) return;

    const isConfigured = status.configured === true;

    // Update badge content
    if (statusText) {
      statusText.textContent = isConfigured ? 'Configured' : 'Not configured';
    }

    // Update badge and card classes
    if (isConfigured) {
      badge.classList.remove('unconfigured');
      badge.classList.add('configured');
      card.classList.remove('status-unconfigured');
      card.classList.add('status-configured');
    } else {
      badge.classList.remove('configured');
      badge.classList.add('unconfigured');
      card.classList.remove('status-configured');
      card.classList.add('status-unconfigured');
    }

    // Update last tested time if available
    if (status.lastTested) {
      const timeAgo = this.getTimeAgo(new Date(status.lastTested));
      const description = card.querySelector('.mcp-provider-desc');
      if (description) {
        description.setAttribute('title', `Last tested: ${timeAgo}`);
      }
    }
  }

  /**
   * Update status summary (X/6 configured) and status bar
   */
  updateStatusSummary() {
    if (!this.statusSummary) return;

    const configuredCount = Object.values(this.state.configs).filter(c => c.configured).length;
    const totalCount = Object.keys(this.providers).length;

    // Update panel summary
    const statusDot = this.statusSummary.querySelector('.mcp-status-dot');
    const statusText = this.statusSummary.querySelector('.mcp-status-text');

    if (statusText) {
      // Show "X configured" instead of "X/Y configured"
      if (configuredCount === 0) {
        statusText.textContent = 'No providers configured';
      } else if (configuredCount === 1) {
        statusText.textContent = '1 provider configured';
      } else {
        statusText.textContent = `${configuredCount} providers configured`;
      }
    }

    // Update status dot color
    if (statusDot) {
      statusDot.classList.remove('unconfigured', 'partial', 'configured');
      if (configuredCount === 0) {
        statusDot.classList.add('unconfigured');
      } else if (configuredCount < totalCount) {
        statusDot.classList.add('partial');
      } else {
        statusDot.classList.add('configured');
      }
    }

    // Update status bar segment
    const statusBarSegment = document.getElementById('zen-mcp-status');
    if (statusBarSegment) {
      const zenMcpCount = statusBarSegment.querySelector('.zen-mcp-count');
      const fullText = statusBarSegment.querySelector('.text-full');

      if (zenMcpCount) {
        zenMcpCount.textContent = configuredCount.toString();
      }

      // Update full text to be grammatically correct
      if (fullText) {
        if (configuredCount === 1) {
          fullText.textContent = 'AI provider';
        } else {
          fullText.textContent = 'AI providers';
        }
      }

      // Update status bar segment color
      statusBarSegment.classList.remove('unconfigured', 'partial', 'configured');
      if (configuredCount === 0) {
        statusBarSegment.classList.add('unconfigured');
      } else {
        // Show green when any provider is configured (system is functional)
        statusBarSegment.classList.add('configured');
      }

      // Check server status asynchronously (don't await to avoid blocking)
      this.updateServerStatus(statusBarSegment).catch(err => {
        console.error('[MCPConfigPanel] Error updating server status:', err);
      });
    }

    // Update toggle icon if all configured
    if (configuredCount === totalCount) {
      const icon = this.toggle.querySelector('.mcp-toggle-icon');
      if (icon) {
        icon.textContent = '✓';
      }
    }
  }

  /**
   * Update server status in the status bar
   * @param {HTMLElement} statusBarSegment - Status bar element
   */
  async updateServerStatus(statusBarSegment) {
    try {
      console.log('[MCPConfigPanel] Fetching server status...');
      const response = await fetch('/api/zen-mcp/status');
      const data = await response.json();

      console.log('[MCPConfigPanel] Server status received:', {
        hasServer: !!data.server,
        hasVersion: !!data.version,
        running: data.server?.running,
        processCount: data.server?.processCount,
        installed: data.version?.installed,
        latest: data.version?.latest
      });

      if (data.success && data.server) {
        const { running, processCount } = data.server;
        const version = data.version || {};

        // Update tooltip to show server status
        const configuredCount = Object.values(this.state.configs || {})
          .filter(c => c.configured).length;

        let tooltip = `${configuredCount} AI provider${configuredCount !== 1 ? 's' : ''} configured`;

        // Add server status
        if (running) {
          tooltip += `\nServer: ${processCount} process${processCount !== 1 ? 'es' : ''} running`;
        } else {
          tooltip += '\nServer: Not running (starts with Claude Code)';
        }

        // Add version info
        if (version.installed) {
          tooltip += `\nVersion: ${version.installed}`;
          if (version.latest && !version.upToDate) {
            tooltip += ` (${version.latest} available)`;
          } else if (version.upToDate) {
            tooltip += ' (up to date)';
          }
        } else if (version.latest) {
          tooltip += `\nLatest version: ${version.latest}`;
        }

        // Add note about auto-update
        tooltip += '\nuvx auto-updates on restart';

        console.log('[MCPConfigPanel] Setting tooltip:', tooltip);
        statusBarSegment.setAttribute('title', tooltip);
        statusBarSegment.title = tooltip; // Set both ways to ensure it works
      }
    } catch (error) {
      console.error('[MCPConfigPanel] Failed to fetch server status:', error);
      // Set a fallback tooltip on error
      const configuredCount = Object.values(this.state.configs || {})
        .filter(c => c.configured).length;
      statusBarSegment.setAttribute('title',
        `${configuredCount} AI provider${configuredCount !== 1 ? 's' : ''} configured\nClick to configure`);
    }
  }

  /**
   * Show error message for provider
   * @param {string} provider - Provider name
   * @param {string} message - Error message
   */
  showError(provider, message) {
    const card = this.content.querySelector(`.mcp-provider[data-provider="${provider}"]`);
    if (!card) return;

    let messageDiv = card.querySelector('.mcp-message');

    if (!messageDiv) {
      messageDiv = document.createElement('div');
      messageDiv.className = 'mcp-message';
      const body = card.querySelector('.mcp-provider-config');
      if (body) {
        body.appendChild(messageDiv);
      }
    }

    messageDiv.className = 'mcp-message error';
    messageDiv.textContent = this.escapeHtml(message);
    messageDiv.style.display = 'block';
  }

  /**
   * Show success message for provider
   * @param {string} provider - Provider name
   * @param {string} message - Success message
   */
  showSuccess(provider, message) {
    const card = this.content.querySelector(`.mcp-provider[data-provider="${provider}"]`);
    if (!card) return;

    let messageDiv = card.querySelector('.mcp-message');

    if (!messageDiv) {
      messageDiv = document.createElement('div');
      messageDiv.className = 'mcp-message';
      const body = card.querySelector('.mcp-provider-config');
      if (body) {
        body.appendChild(messageDiv);
      }
    }

    messageDiv.className = 'mcp-message success';
    messageDiv.textContent = this.escapeHtml(message);
    messageDiv.style.display = 'block';
  }

  /**
   * Clear messages for provider
   * @param {string} provider - Provider name
   */
  clearMessages(provider) {
    const card = this.content.querySelector(`.mcp-provider[data-provider="${provider}"]`);
    if (!card) return;

    const messageDiv = card.querySelector('.mcp-message');
    if (messageDiv) {
      messageDiv.style.display = 'none';
      messageDiv.textContent = '';
    }
  }

  /**
   * Show toast notification (uses existing toast function if available)
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, info)
   */
  showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
    } else {
      // Fallback to console if toast not available
      console.log(`[MCPConfigPanel] ${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Mask API key for display
   * @param {string} key - API key to mask
   * @returns {string} Masked key
   */
  maskKey(key) {
    if (!key || key.length < 8) {
      return '••••••••';
    }

    const prefix = key.substring(0, 7);
    const suffix = key.substring(key.length - 4);
    return `${prefix}••••${suffix}`;
  }

  /**
   * Get time ago string
   * @param {Date} date - Date to compare
   * @returns {string} Time ago string
   */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    window.mcpConfigPanel = new MCPConfigPanel();
    await window.mcpConfigPanel.init();
  });
} else {
  window.mcpConfigPanel = new MCPConfigPanel();
  window.mcpConfigPanel.init();
}

// Export for use in other modules
window.MCPConfigPanel = MCPConfigPanel;
