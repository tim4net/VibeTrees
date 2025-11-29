/**
 * ZenMcpConnection - API connection testing for Zen MCP providers
 *
 * Handles:
 * - Connection testing with latency measurement
 * - Model listing from provider APIs
 * - Timeout management with AbortController
 * - Error mapping to user-friendly messages
 *
 * Supports all BeehiveInnovations zen-mcp-server providers:
 * - Gemini (Google AI)
 * - OpenAI
 * - OpenRouter (200+ models)
 * - Azure OpenAI (Enterprise)
 * - XAI (Grok)
 * - DIAL (vendor-agnostic)
 */

const PROVIDER_ENDPOINTS = {
  gemini: 'https://generativelanguage.googleapis.com/v1/models',
  openai: 'https://api.openai.com/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  azure: null, // Azure requires deployment-specific endpoint
  xai: 'https://api.x.ai/v1/models',
  dial: null, // DIAL requires custom endpoint
};

/**
 * Auth header generators for each provider
 * Each returns an object to spread into fetch headers
 */
const PROVIDER_AUTH_HEADERS = {
  gemini: (apiKey) => ({
    'x-goog-api-key': apiKey,
  }),
  openai: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),
  openrouter: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),
  azure: (apiKey) => ({
    'api-key': apiKey,
  }),
  xai: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),
  dial: (apiKey) => ({
    Authorization: `Bearer ${apiKey}`,
  }),
};

export class ZenMcpConnection {
  /**
   * Create a new ZenMcpConnection instance
   * @param {Object} options - Configuration options
   * @param {Function} options.fetch - Fetch function to use (defaults to globalThis.fetch)
   * @param {number} options.timeout - Request timeout in ms (default: 10000)
   */
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch;
    this.timeout = options.timeout || 10000;
  }

  /**
   * Get the test endpoint for a provider
   * @param {string} provider - Provider name
   * @param {Object} options - Optional configuration for Azure/DIAL
   * @returns {string} API endpoint URL
   * @throws {Error} If provider is unknown or requires custom endpoint
   */
  _getTestEndpoint(provider, options = {}) {
    // Azure and DIAL require custom endpoints
    if (provider === 'azure') {
      if (options.endpoint) {
        return `${options.endpoint}/openai/models?api-version=2024-02-15-preview`;
      }
      // For testing without custom endpoint, use a validation-friendly approach
      throw new Error('Azure OpenAI requires an endpoint URL');
    }

    if (provider === 'dial') {
      if (options.endpoint) {
        return `${options.endpoint}/v1/models`;
      }
      throw new Error('DIAL requires an endpoint URL');
    }

    const endpoint = PROVIDER_ENDPOINTS[provider];
    if (!endpoint) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return endpoint;
  }

  /**
   * Get the auth header for a provider
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key
   * @returns {Object} Auth header object
   * @throws {Error} If provider is unknown
   */
  _getAuthHeader(provider, apiKey) {
    if (!PROVIDER_AUTH_HEADERS[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return PROVIDER_AUTH_HEADERS[provider](apiKey);
  }

  /**
   * Map HTTP status code to user-friendly error message
   * @param {number} statusCode - HTTP status code
   * @returns {string} User-friendly error message
   */
  _getErrorMessage(statusCode) {
    switch (statusCode) {
      case 401:
        return 'Invalid API key';
      case 403:
        return 'API key lacks required permissions';
      case 429:
        return 'Rate limited - try again later';
      case 500:
      case 503:
        return 'Provider service error';
      default:
        return `HTTP ${statusCode}: Request failed`;
    }
  }

  /**
   * Test connection to a provider
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key
   * @param {Object} options - Optional configuration (endpoint for Azure/DIAL)
   * @returns {Promise<Object>} Result object with success/failure info
   */
  async testProvider(provider, apiKey, options = {}) {
    const startTime = Date.now();

    // Handle providers that require custom endpoints without a test
    if ((provider === 'azure' || provider === 'dial') && !options.endpoint) {
      // Can't test without an endpoint, but we can validate the key format
      return {
        success: true,
        provider,
        latencyMs: 0,
        modelCount: 0,
        note: `${provider === 'azure' ? 'Azure OpenAI' : 'DIAL'} key saved - endpoint required for model list`,
      };
    }

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const endpoint = this._getTestEndpoint(provider, options);
        const authHeader = this._getAuthHeader(provider, apiKey);

        const response = await this.fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          signal: controller.signal,
        });

        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          const errorMessage = this._getErrorMessage(response.status);
          return {
            success: false,
            provider,
            error: errorMessage,
            statusCode: response.status,
          };
        }

        const data = await response.json();
        const modelCount = this._getModelCount(data, provider);

        return {
          success: true,
          provider,
          latencyMs,
          modelCount,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Handle abort error (timeout)
      if (error.name === 'AbortError') {
        return {
          success: false,
          provider,
          error: `Request timeout after ${this.timeout}ms`,
        };
      }

      // Handle network errors
      if (
        error.message.includes('fetch') ||
        error.message.toLowerCase().includes('network') ||
        error.message.includes('Connection') ||
        error.message === 'Network error' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND'
      ) {
        return {
          success: false,
          provider,
          error: 'Network error - check connection',
        };
      }

      // Handle JSON parse errors
      if (error.message.includes('JSON')) {
        return {
          success: false,
          provider,
          error: `Failed to parse response: ${error.message}`,
        };
      }

      // Handle custom endpoint requirements
      if (error.message.includes('requires an endpoint')) {
        return {
          success: true,
          provider,
          latencyMs: 0,
          modelCount: 0,
          note: error.message,
        };
      }

      // Handle other errors
      return {
        success: false,
        provider,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Get model count from response data
   * Handles different response formats for different providers
   * @param {Object} data - Response data
   * @param {string} provider - Provider name
   * @returns {number} Number of models
   */
  _getModelCount(data, provider) {
    if (!data) {
      return 0;
    }

    // OpenRouter, OpenAI, Azure, XAI use 'data' array
    if (data.data && Array.isArray(data.data)) {
      return data.data.length;
    }

    // Gemini and some providers use 'models' array
    if (data.models && Array.isArray(data.models)) {
      return data.models.length;
    }

    // Fallback for unknown response format
    return 0;
  }

  /**
   * List available models from a provider
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key
   * @param {Object} options - Optional configuration (endpoint for Azure/DIAL)
   * @returns {Promise<Object>} Result object with models array or error
   */
  async listModels(provider, apiKey, options = {}) {
    const startTime = Date.now();

    // Handle providers that require custom endpoints
    if ((provider === 'azure' || provider === 'dial') && !options.endpoint) {
      return {
        success: false,
        error: `${provider === 'azure' ? 'Azure OpenAI' : 'DIAL'} requires an endpoint URL to list models`,
      };
    }

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const endpoint = this._getTestEndpoint(provider, options);
        const authHeader = this._getAuthHeader(provider, apiKey);

        const response = await this.fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorMessage = this._getErrorMessage(response.status);
          return {
            success: false,
            error: errorMessage,
            statusCode: response.status,
          };
        }

        const data = await response.json();
        const models = this._extractModels(data, provider);

        return {
          success: true,
          models,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Handle abort error (timeout)
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${this.timeout}ms`,
        };
      }

      // Handle network errors
      if (
        error.message.includes('fetch') ||
        error.message.toLowerCase().includes('network') ||
        error.message.includes('Connection') ||
        error.message === 'Network error' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND'
      ) {
        return {
          success: false,
          error: 'Network error - check connection',
        };
      }

      // Handle JSON parse errors
      if (error.message.includes('JSON')) {
        return {
          success: false,
          error: `Failed to parse response: ${error.message}`,
        };
      }

      // Handle other errors
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Extract models from response data
   * Handles different response formats for different providers
   * @param {Object} data - Response data
   * @param {string} provider - Provider name
   * @returns {Array} Array of model objects
   */
  _extractModels(data, provider) {
    if (!data) {
      return [];
    }

    // OpenRouter, OpenAI, Azure, XAI use 'data' array
    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }

    // Gemini and some providers use 'models' array
    if (data.models && Array.isArray(data.models)) {
      return data.models;
    }

    return [];
  }
}
