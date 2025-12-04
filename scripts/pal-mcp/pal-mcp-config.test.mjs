/**
 * Tests for PalMcpConfig - Configuration management for PAL MCP integration
 * Updated for BeehiveInnovations pal-mcp-server with all providers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PalMcpConfig, PROVIDERS, SUPPORTED_PROVIDERS, PAL_OPTIONS } from './pal-mcp-config.mjs';

// Mock filesystem
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

// Mock os.homedir
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser')
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

describe('PalMcpConfig', () => {
  let config;
  let mockFs;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    writeFileSync.mockImplementation(() => {});
    mkdirSync.mockImplementation(() => {});

    mockFs = { existsSync, readFileSync, writeFileSync, mkdirSync };
    config = new PalMcpConfig({ fs: mockFs });
  });

  describe('exports', () => {
    it('should export PROVIDERS with all provider configurations', () => {
      expect(PROVIDERS).toHaveProperty('gemini');
      expect(PROVIDERS).toHaveProperty('openai');
      expect(PROVIDERS).toHaveProperty('openrouter');
      expect(PROVIDERS).toHaveProperty('azure');
      expect(PROVIDERS).toHaveProperty('xai');
      expect(PROVIDERS).toHaveProperty('dial');
    });

    it('should have correct environment key names for providers', () => {
      expect(PROVIDERS.gemini.envKey).toBe('GEMINI_API_KEY');
      expect(PROVIDERS.openai.envKey).toBe('OPENAI_API_KEY');
      expect(PROVIDERS.openrouter.envKey).toBe('OPENROUTER_API_KEY');
      expect(PROVIDERS.azure.envKey).toBe('AZURE_OPENAI_API_KEY');
      expect(PROVIDERS.xai.envKey).toBe('XAI_API_KEY');
      expect(PROVIDERS.dial.envKey).toBe('DIAL_API_KEY');
    });

    it('should export SUPPORTED_PROVIDERS array', () => {
      expect(SUPPORTED_PROVIDERS).toContain('gemini');
      expect(SUPPORTED_PROVIDERS).toContain('openai');
      expect(SUPPORTED_PROVIDERS).toContain('openrouter');
      expect(SUPPORTED_PROVIDERS).toContain('azure');
      expect(SUPPORTED_PROVIDERS).toContain('xai');
      expect(SUPPORTED_PROVIDERS).toContain('dial');
      expect(SUPPORTED_PROVIDERS).toHaveLength(6);
    });

    it('should export PAL_OPTIONS with configuration options', () => {
      expect(PAL_OPTIONS).toHaveProperty('DISABLED_TOOLS');
      expect(PAL_OPTIONS).toHaveProperty('DEFAULT_MODEL');
      expect(PAL_OPTIONS).toHaveProperty('LOG_LEVEL');
    });
  });

  describe('static methods', () => {
    it('getSupportedProviders should return provider list', () => {
      const providers = PalMcpConfig.getSupportedProviders();

      expect(providers).toEqual(SUPPORTED_PROVIDERS);
    });

    it('getProviderInfo should return provider metadata', () => {
      const info = PalMcpConfig.getProviderInfo('gemini');

      expect(info.name).toBe('Google Gemini');
      expect(info.envKey).toBe('GEMINI_API_KEY');
      expect(info.docsUrl).toBeTruthy();
    });

    it('getProviderInfo should return null for unknown provider', () => {
      const info = PalMcpConfig.getProviderInfo('unknown');

      expect(info).toBeNull();
    });
  });

  describe('constructor', () => {
    it('should initialize with default configDir from homedir', () => {
      expect(config.configDir).toBe('/home/testuser/.vibetrees');
      expect(config.configFile).toBe('pal-mcp-config.json');
    });

    it('should accept custom configDir', () => {
      config = new PalMcpConfig({ configDir: '/custom/path', fs: mockFs });

      expect(config.configDir).toBe('/custom/path');
    });

    it('should use provided fs implementation', () => {
      config = new PalMcpConfig({ fs: mockFs });

      expect(config.fs).toBe(mockFs);
    });

    it('should not create directory in constructor', () => {
      new PalMcpConfig({ fs: mockFs });

      expect(mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('should create default config if file does not exist', () => {
      existsSync.mockReturnValue(false);

      const result = config.load();

      expect(result).toMatchObject({
        version: '2.0',
        providers: {},
        options: {},
        lastUpdated: expect.any(String)
      });
    });

    it('should create config directory when loading for first time', () => {
      existsSync.mockReturnValue(false);

      config.load();

      expect(mkdirSync).toHaveBeenCalledWith('/home/testuser/.vibetrees', {
        recursive: true,
        mode: 0o700
      });
    });

    it('should parse existing config file', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test123', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const result = config.load();

      expect(result.providers.openai).toMatchObject({
        apiKey: 'sk-test123',
        enabled: true
      });
    });

    it('should handle invalid JSON gracefully', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid json{');

      const result = config.load();

      // Should return default config on parse error
      expect(result).toMatchObject({
        version: '2.0',
        providers: {}
      });
    });

    it('should cache loaded config', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: { openai: { apiKey: 'sk-test', enabled: true } },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const result1 = config.load();
      const result2 = config.load();

      // Should return same object (cached)
      expect(result1).toBe(result2);
    });

    it('should read config with utf-8 encoding', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{}');

      config.load();

      expect(readFileSync).toHaveBeenCalledWith(
        '/home/testuser/.vibetrees/pal-mcp-config.json',
        'utf-8'
      );
    });
  });

  describe('save', () => {
    it('should write config to file with proper formatting', () => {
      const testConfig = {
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      };

      config.save(testConfig);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/home/testuser/.vibetrees/pal-mcp-config.json',
        JSON.stringify(testConfig, null, 2),
        { mode: 0o600 }
      );
    });

    it('should ensure config directory exists before saving', () => {
      existsSync.mockReturnValue(false);
      const testConfig = { version: '2.0', providers: {} };

      config.save(testConfig);

      expect(mkdirSync).toHaveBeenCalledWith('/home/testuser/.vibetrees', {
        recursive: true,
        mode: 0o700
      });
    });

    it('should set file permissions to 0o600 for security', () => {
      const testConfig = { version: '2.0', providers: {} };

      config.save(testConfig);

      const callArgs = writeFileSync.mock.calls[0];
      expect(callArgs[2]).toHaveProperty('mode', 0o600);
    });

    it('should update cache after saving', () => {
      const testConfig = { version: '2.0', providers: {} };

      config.save(testConfig);
      const loaded = config.load();

      expect(loaded).toEqual(testConfig);
    });
  });

  describe('getApiKey', () => {
    it('should return API key for configured provider', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test123', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const key = config.getApiKey('openai');

      expect(key).toBe('sk-test123');
    });

    it('should return null if provider not configured', () => {
      existsSync.mockReturnValue(false);

      const key = config.getApiKey('openai');

      expect(key).toBeNull();
    });

    it('should return null if provider is disabled', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test123', enabled: false }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const key = config.getApiKey('openai');

      expect(key).toBeNull();
    });

    it('should work with all supported providers', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          gemini: { apiKey: 'AIza-gemini', enabled: true },
          openai: { apiKey: 'sk-openai', enabled: true },
          openrouter: { apiKey: 'sk-or-router', enabled: true },
          azure: { apiKey: 'azure-key', enabled: true },
          xai: { apiKey: 'xai-grok', enabled: true },
          dial: { apiKey: 'dial-key', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      expect(config.getApiKey('gemini')).toBe('AIza-gemini');
      expect(config.getApiKey('openai')).toBe('sk-openai');
      expect(config.getApiKey('openrouter')).toBe('sk-or-router');
      expect(config.getApiKey('azure')).toBe('azure-key');
      expect(config.getApiKey('xai')).toBe('xai-grok');
      expect(config.getApiKey('dial')).toBe('dial-key');
    });
  });

  describe('setApiKey', () => {
    it('should set API key for provider', () => {
      existsSync.mockReturnValue(false);

      config.setApiKey('openai', 'sk-new-key');

      const callArgs = writeFileSync.mock.calls[0];
      const written = JSON.parse(callArgs[1]);

      expect(written.providers.openai).toMatchObject({
        apiKey: 'sk-new-key',
        enabled: true
      });
    });

    it('should enable provider when setting key', () => {
      existsSync.mockReturnValue(false);

      config.setApiKey('openai', 'sk-new-key');

      const callArgs = writeFileSync.mock.calls[0];
      const written = JSON.parse(callArgs[1]);

      expect(written.providers.openai.enabled).toBe(true);
    });

    it('should throw error on invalid provider name', () => {
      expect(() => {
        config.setApiKey('invalid-provider', 'sk-test');
      }).toThrow('Invalid provider: invalid-provider');
    });

    it('should accept all supported providers', () => {
      existsSync.mockReturnValue(false);

      // Should not throw for any supported provider
      expect(() => config.setApiKey('gemini', 'key')).not.toThrow();
      expect(() => config.setApiKey('openai', 'key')).not.toThrow();
      expect(() => config.setApiKey('openrouter', 'key')).not.toThrow();
      expect(() => config.setApiKey('azure', 'key')).not.toThrow();
      expect(() => config.setApiKey('xai', 'key')).not.toThrow();
      expect(() => config.setApiKey('dial', 'key')).not.toThrow();
    });
  });

  describe('removeApiKey', () => {
    it('should remove API key for provider', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true },
          gemini: { apiKey: 'AIza-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      config.removeApiKey('openai');

      const callArgs = writeFileSync.mock.calls[0];
      const written = JSON.parse(callArgs[1]);

      expect(written.providers).not.toHaveProperty('openai');
      expect(written.providers.gemini).toBeTruthy();
    });
  });

  describe('options', () => {
    it('should set and get options', () => {
      existsSync.mockReturnValue(false);

      config.setOption('DISABLED_TOOLS', 'analyze,refactor');

      // Since we're mocking writes, check what was written
      const callArgs = writeFileSync.mock.calls[0];
      const written = JSON.parse(callArgs[1]);

      expect(written.options.DISABLED_TOOLS).toBe('analyze,refactor');
    });

    it('should return null for unset options', () => {
      existsSync.mockReturnValue(false);

      const value = config.getOption('DISABLED_TOOLS');

      expect(value).toBeNull();
    });

    it('should return option value when set', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {},
        options: { DEFAULT_MODEL: 'gemini-2.5-pro' },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const value = config.getOption('DEFAULT_MODEL');

      expect(value).toBe('gemini-2.5-pro');
    });
  });

  describe('getEnvVars', () => {
    it('should return environment variables for configured providers', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true },
          gemini: { apiKey: 'AIza-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const env = config.getEnvVars();

      expect(env.OPENAI_API_KEY).toBe('sk-test');
      expect(env.GEMINI_API_KEY).toBe('AIza-test');
    });

    it('should include PATH for uvx', () => {
      existsSync.mockReturnValue(false);

      const env = config.getEnvVars();

      expect(env.PATH).toContain('/usr/local/bin');
      expect(env.PATH).toContain('.local/bin');
    });

    it('should use provider-specific environment variable names', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openrouter: { apiKey: 'sk-or-test', enabled: true },
          azure: { apiKey: 'azure-test', enabled: true },
          xai: { apiKey: 'xai-test', enabled: true },
          dial: { apiKey: 'dial-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const env = config.getEnvVars();

      expect(env.OPENROUTER_API_KEY).toBe('sk-or-test');
      expect(env.AZURE_OPENAI_API_KEY).toBe('azure-test');
      expect(env.XAI_API_KEY).toBe('xai-test');
      expect(env.DIAL_API_KEY).toBe('dial-test');
    });

    it('should skip disabled providers', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true },
          gemini: { apiKey: 'AIza-test', enabled: false }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const env = config.getEnvVars();

      expect(env.OPENAI_API_KEY).toBe('sk-test');
      expect(env).not.toHaveProperty('GEMINI_API_KEY');
    });

    it('should include configured options', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {},
        options: {
          DISABLED_TOOLS: 'analyze,refactor',
          DEFAULT_MODEL: 'auto'
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const env = config.getEnvVars();

      expect(env.DISABLED_TOOLS).toBe('analyze,refactor');
      expect(env.DEFAULT_MODEL).toBe('auto');
    });
  });

  describe('isConfigured', () => {
    it('should return true if at least one provider is configured and enabled', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      expect(config.isConfigured()).toBe(true);
    });

    it('should return false if no providers configured', () => {
      existsSync.mockReturnValue(false);

      expect(config.isConfigured()).toBe(false);
    });

    it('should return false if all providers are disabled', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: false },
          gemini: { apiKey: 'AIza-test', enabled: false }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      expect(config.isConfigured()).toBe(false);
    });
  });

  describe('getConfigForApi', () => {
    it('should return config with masked API keys', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-1234567890abcdef', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const result = config.getConfigForApi();

      expect(result.providers.openai.apiKey).not.toContain('1234567890');
      expect(result.providers.openai.apiKey).toContain('*');
    });

    it('should include success flag', () => {
      existsSync.mockReturnValue(false);

      const result = config.getConfigForApi();

      expect(result.success).toBe(true);
    });

    it('should include supportedProviders metadata', () => {
      existsSync.mockReturnValue(false);

      const result = config.getConfigForApi();

      expect(result.supportedProviders).toHaveLength(6);
      expect(result.supportedProviders[0]).toHaveProperty('key');
      expect(result.supportedProviders[0]).toHaveProperty('name');
      expect(result.supportedProviders[0]).toHaveProperty('envKey');
    });

    it('should include all providers (configured or not)', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-test', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const result = config.getConfigForApi();

      // Should include all 6 providers
      expect(Object.keys(result.providers)).toHaveLength(6);
      expect(result.providers.openai.enabled).toBe(true);
      expect(result.providers.gemini.enabled).toBe(false);
    });

    it('should include options in response', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {},
        options: { DEFAULT_MODEL: 'auto' },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      const result = config.getConfigForApi();

      expect(result.options.DEFAULT_MODEL).toBe('auto');
    });
  });

  describe('maskApiKey', () => {
    it('should mask API keys in standard format', () => {
      const masked = config.maskApiKey('sk-1234567890abcdef');

      expect(masked).toMatch(/^sk-1\*+[a-z0-9]{4,}$/);
      expect(masked).toContain('*');
    });

    it('should mask OpenRouter keys', () => {
      const masked = config.maskApiKey('sk-or-abcdefghij1234');

      expect(masked).toMatch(/^sk-or-\*+[a-z0-9]{4}$/);
    });

    it('should mask Google/Gemini API keys', () => {
      const masked = config.maskApiKey('AIzaSyD1234567890abcdefghij');

      expect(masked).toMatch(/^AIza\*+[a-z0-9]{4}$/);
    });

    it('should mask XAI keys', () => {
      const masked = config.maskApiKey('xai-abcdef1234567890');

      expect(masked).toMatch(/^xai-\*+[a-z0-9]{4}$/);
    });

    it('should handle empty key', () => {
      const masked = config.maskApiKey('');

      expect(masked).toBe('');
    });

    it('should handle null/undefined key', () => {
      expect(config.maskApiKey(null)).toBe('');
      expect(config.maskApiKey(undefined)).toBe('');
    });

    it('should handle short keys gracefully', () => {
      const masked = config.maskApiKey('short');

      expect(masked).toContain('*');
      expect(masked.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('clearCache', () => {
    it('should clear the in-memory cache', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: { openai: { apiKey: 'sk-test', enabled: true } },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      config.load();
      config.clearCache();

      // Update the mock to return different data
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: { gemini: { apiKey: 'AIza-test', enabled: true } },
        lastUpdated: '2025-11-29T12:00:00Z'
      }));

      const result = config.load();

      // Should now load the new data since cache was cleared
      expect(result.providers.gemini).toBeTruthy();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple provider configuration', () => {
      existsSync.mockReturnValue(false);

      config.setApiKey('gemini', 'AIza-gemini-key');
      config.setApiKey('openai', 'sk-openai-key');
      config.setApiKey('openrouter', 'sk-or-router-key');

      const env = config.getEnvVars();

      expect(env.GEMINI_API_KEY).toBe('AIza-gemini-key');
      expect(env.OPENAI_API_KEY).toBe('sk-openai-key');
      expect(env.OPENROUTER_API_KEY).toBe('sk-or-router-key');
    });

    it('should handle remove and reconfigure', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-old-key', enabled: true }
        },
        lastUpdated: '2025-11-29T10:00:00Z'
      }));

      config.removeApiKey('openai');
      expect(config.getApiKey('openai')).toBeNull();

      config.setApiKey('openai', 'sk-new-key');
      expect(config.getApiKey('openai')).toBe('sk-new-key');
    });
  });
});
