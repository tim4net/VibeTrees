/**
 * PalMcpConfig - Configuration management for PAL MCP integration
 * Handles API key storage, retrieval, and environment variable generation
 *
 * PAL MCP (Provider Abstraction Layer) was formerly known as Zen MCP.
 * See: https://github.com/BeehiveInnovations/pal-mcp-server
 *
 * Supports all providers from BeehiveInnovations pal-mcp-server:
 * - Gemini (Google AI)
 * - OpenAI
 * - OpenRouter (200+ models)
 * - Azure OpenAI (Enterprise)
 * - XAI (Grok)
 * - DIAL (vendor-agnostic)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_CONFIG_DIR = join(homedir(), '.vibetrees');
const DEFAULT_CONFIG_FILE = 'pal-mcp-config.json';

/**
 * Provider configuration with display names, environment keys, and key prefixes
 */
export const PROVIDERS = {
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
    prefix: '',
    description: 'Vendor-agnostic AI access via DIAL',
    docsUrl: 'https://dialx.ai'
  }
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS);

const PROVIDER_ENV_KEYS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([key, config]) => [key, config.envKey])
);

/**
 * Optional configuration options for pal-mcp-server
 */
export const PAL_OPTIONS = {
  DISABLED_TOOLS: {
    default: '',
    description: 'Comma-separated list of tools to disable (e.g., "analyze,refactor,testgen")'
  },
  DEFAULT_MODEL: {
    default: 'auto',
    description: 'Default model to use (e.g., "auto", "gemini-2.5-pro", "gpt-4o")'
  },
  LOG_LEVEL: {
    default: 'INFO',
    description: 'Logging level (DEBUG, INFO, WARNING, ERROR)'
  },
  CONVERSATION_TIMEOUT_HOURS: {
    default: '6',
    description: 'Hours before conversation context expires'
  },
  MAX_CONVERSATION_TURNS: {
    default: '50',
    description: 'Maximum turns in a conversation'
  }
};

/**
 * Configuration management class for PAL MCP integration
 * Handles API key storage with file-based persistence and environment variable generation
 */
export class PalMcpConfig {
  /**
   * Create a new PalMcpConfig instance
   * @param {Object} options - Configuration options
   * @param {string} options.configDir - Directory to store config file (default: ~/.vibetrees)
   * @param {Object} options.fs - Filesystem implementation for testing (default: fs module)
   */
  constructor(options = {}) {
    this.configDir = options.configDir || DEFAULT_CONFIG_DIR;
    this.configFile = DEFAULT_CONFIG_FILE;
    this.fs = options.fs || { existsSync, readFileSync, writeFileSync, mkdirSync };
    this._cache = null;
  }

  /**
   * Get list of supported providers
   * @returns {string[]} Array of provider keys
   */
  static getSupportedProviders() {
    return SUPPORTED_PROVIDERS;
  }

  /**
   * Get provider metadata
   * @param {string} provider - Provider key
   * @returns {Object|null} Provider configuration or null if not found
   */
  static getProviderInfo(provider) {
    return PROVIDERS[provider] || null;
  }

  /**
   * Load configuration from file or create default if missing
   * @returns {Object} Configuration object with version, providers, options, and lastUpdated
   */
  load() {
    // Return cached config if available
    if (this._cache) {
      return this._cache;
    }

    const configPath = join(this.configDir, this.configFile);

    // If config file exists, parse it
    if (this.fs.existsSync(configPath)) {
      try {
        const content = this.fs.readFileSync(configPath, 'utf-8');
        this._cache = JSON.parse(content);
        return this._cache;
      } catch (error) {
        // If parse fails, return default config
      }
    }

    // Create default config
    const defaultConfig = {
      version: '2.0',
      providers: {},
      options: {},
      lastUpdated: new Date().toISOString()
    };

    // Ensure directory exists
    this.fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });

    this._cache = defaultConfig;
    return defaultConfig;
  }

  /**
   * Save configuration to file with secure permissions (0o600)
   * @param {Object} config - Configuration object to save
   */
  save(config) {
    // Ensure directory exists with secure permissions
    this.fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });

    const configPath = join(this.configDir, this.configFile);
    const content = JSON.stringify(config, null, 2);

    this.fs.writeFileSync(configPath, content, { mode: 0o600 });

    // Update cache
    this._cache = config;
  }

  /**
   * Get API key for a provider
   * @param {string} provider - Provider name
   * @returns {string|null} API key or null if not configured/enabled
   */
  getApiKey(provider) {
    const config = this.load();
    const providerConfig = config.providers[provider];

    if (!providerConfig || !providerConfig.enabled) {
      return null;
    }

    return providerConfig.apiKey || null;
  }

  /**
   * Set API key for a provider
   * @param {string} provider - Provider name
   * @param {string} key - API key value
   * @throws {Error} If provider is not supported
   */
  setApiKey(provider, key) {
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`Invalid provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    const config = this.load();

    if (!config.providers[provider]) {
      config.providers[provider] = {};
    }

    config.providers[provider].apiKey = key;
    config.providers[provider].enabled = true;
    config.lastUpdated = new Date().toISOString();

    this.save(config);
  }

  /**
   * Remove API key for a provider
   * @param {string} provider - Provider name
   */
  removeApiKey(provider) {
    const config = this.load();

    if (config.providers[provider]) {
      delete config.providers[provider];
    }

    config.lastUpdated = new Date().toISOString();
    this.save(config);
  }

  /**
   * Set an option value
   * @param {string} option - Option name (e.g., 'DISABLED_TOOLS')
   * @param {string} value - Option value
   */
  setOption(option, value) {
    const config = this.load();
    config.options = config.options || {};
    config.options[option] = value;
    config.lastUpdated = new Date().toISOString();
    this.save(config);
  }

  /**
   * Get an option value
   * @param {string} option - Option name
   * @returns {string|null} Option value or null if not set
   */
  getOption(option) {
    const config = this.load();
    return config.options?.[option] || null;
  }

  /**
   * Get environment variables for all configured providers and options
   * @returns {Object} Key-value pairs of environment variable names and values
   */
  getEnvVars() {
    const config = this.load();
    const env = {
      // Required PATH for uvx to find dependencies
      PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:~/.local/bin'
    };

    // Add provider API keys
    for (const [provider, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.enabled && providerConfig.apiKey) {
        const envKey = PROVIDER_ENV_KEYS[provider];
        if (envKey) {
          env[envKey] = providerConfig.apiKey;
        }
      }
    }

    // Add configured options
    if (config.options) {
      for (const [option, value] of Object.entries(config.options)) {
        if (value) {
          env[option] = value;
        }
      }
    }

    return env;
  }

  /**
   * Check if at least one provider is configured and enabled
   * @returns {boolean} True if configuration is ready to use
   */
  isConfigured() {
    const config = this.load();

    return Object.values(config.providers).some(
      providerConfig => providerConfig.enabled && providerConfig.apiKey
    );
  }

  /**
   * Get configuration for API response with masked keys
   * @returns {Object} Configuration with masked API keys for safe sharing
   */
  getConfigForApi() {
    const config = this.load();
    const apiConfig = {
      success: true,
      version: config.version,
      providers: {},
      options: config.options || {},
      lastUpdated: config.lastUpdated,
      supportedProviders: SUPPORTED_PROVIDERS.map(key => ({
        key,
        ...PROVIDERS[key]
      }))
    };

    // Include all supported providers (configured or not)
    for (const provider of SUPPORTED_PROVIDERS) {
      const providerConfig = config.providers[provider];
      if (providerConfig) {
        apiConfig.providers[provider] = {
          apiKey: this.maskApiKey(providerConfig.apiKey),
          enabled: providerConfig.enabled
        };
      } else {
        apiConfig.providers[provider] = {
          enabled: false
        };
      }
    }

    return apiConfig;
  }

  /**
   * Mask API key for safe display/logging
   * Shows first 4-5 characters and last 2-4 characters with asterisks in between
   * @param {string} key - Full API key to mask
   * @returns {string} Masked API key in format: 'prefix****suffix'
   */
  maskApiKey(key) {
    if (!key) {
      return '';
    }

    if (key.length < 8) {
      // For very short keys, show minimal info
      const prefix = key.substring(0, Math.max(1, key.length - 2));
      const suffix = key.substring(Math.max(1, key.length - 2));
      return prefix + '*'.repeat(Math.max(1, key.length - 3)) + suffix;
    }

    // Find where the prefix ends (after first dash-separated component or at position 4)
    let firstDashPos = key.indexOf('-');
    let prefixEnd;

    if (firstDashPos === -1) {
      // No dash found, use first 4 characters
      prefixEnd = 4;
    } else {
      // Found first dash, look for second dash (e.g., sk-ant- or sk-or-)
      let secondDashPos = key.indexOf('-', firstDashPos + 1);
      if (secondDashPos === -1) {
        // Only one dash found (e.g., 'sk-something'), use first 4 chars
        prefixEnd = 4;
      } else {
        // Two dashes found (e.g., 'sk-ant-...' or 'sk-or-...'), prefix includes up to and after second dash
        prefixEnd = secondDashPos + 1;
      }
    }

    // Determine suffix length: always show last 4 chars, but for shorter keys show 2
    const suffixLength = key.length - prefixEnd <= 6 ? 2 : 4;
    const suffix = key.substring(key.length - suffixLength);

    const prefix = key.substring(0, prefixEnd);
    const maskedMiddleLength = key.length - prefixEnd - suffixLength;
    const masked = prefix + '*'.repeat(Math.max(4, maskedMiddleLength)) + suffix;

    return masked;
  }

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache() {
    this._cache = null;
  }
}
