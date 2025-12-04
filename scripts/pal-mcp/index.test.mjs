/**
 * Tests for PalMcpFacade - Unified interface for PAL MCP integration
 * Composition of PalMcpConfig, PalMcpInstaller, and PalMcpConnection
 *
 * PAL MCP (Provider Abstraction Layer) was formerly known as Zen MCP.
 * Updated for BeehiveInnovations pal-mcp-server with uvx-based installation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PalMcpFacade, PROVIDERS, SUPPORTED_PROVIDERS } from './index.mjs';

describe('PalMcpFacade', () => {
  let facade;
  let mockConfig;
  let mockInstaller;
  let mockConnection;

  beforeEach(() => {
    // Create realistic mock implementations
    mockConfig = {
      isConfigured: vi.fn().mockReturnValue(true),
      getEnvVars: vi.fn().mockReturnValue({
        PATH: '/usr/local/bin:/usr/bin:/bin',
        OPENAI_API_KEY: 'sk-test-123',
        GEMINI_API_KEY: 'AIza-456'
      }),
      getConfigForApi: vi.fn().mockReturnValue({
        success: true,
        version: '2.0',
        providers: {
          openai: { apiKey: 'sk-****23', enabled: true },
          gemini: { apiKey: 'AIza-****6', enabled: true },
          openrouter: { enabled: false },
          azure: { enabled: false },
          xai: { enabled: false },
          dial: { enabled: false }
        },
        lastUpdated: '2025-01-01T00:00:00Z'
      }),
      setApiKey: vi.fn(),
      removeApiKey: vi.fn(),
      load: vi.fn().mockReturnValue({
        version: '2.0',
        providers: {},
        lastUpdated: '2025-01-01T00:00:00Z'
      })
    };

    mockInstaller = {
      ensureInstalled: vi.fn().mockResolvedValue({
        success: true,
        uvxPath: 'uvx',
        pythonVersion: '3.12'
      }),
      getCommand: vi.fn().mockReturnValue([
        '-c',
        'for p in $(which uvx 2>/dev/null) $HOME/.local/bin/uvx /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do [ -x "$p" ] && exec "$p" --from git+https://github.com/BeehiveInnovations/pal-mcp-server.git pal-mcp-server; done; echo \'uvx not found\' >&2; exit 1'
      ]),
      update: vi.fn().mockResolvedValue({
        success: true,
        message: 'pal-mcp-server auto-updates via uvx on each launch'
      })
    };

    mockConnection = {
      testProvider: vi.fn().mockResolvedValue({
        success: true,
        provider: 'openai',
        latencyMs: 150,
        modelCount: 10
      })
    };

    // Create facade with injected dependencies
    facade = new PalMcpFacade({
      config: mockConfig,
      installer: mockInstaller,
      connection: mockConnection
    });
  });

  describe('exports', () => {
    it('should export PROVIDERS constant', () => {
      expect(PROVIDERS).toBeDefined();
      expect(PROVIDERS.gemini).toBeDefined();
      expect(PROVIDERS.openai).toBeDefined();
    });

    it('should export SUPPORTED_PROVIDERS constant', () => {
      expect(SUPPORTED_PROVIDERS).toBeDefined();
      expect(SUPPORTED_PROVIDERS).toContain('gemini');
      expect(SUPPORTED_PROVIDERS).toContain('openai');
    });
  });

  describe('constructor', () => {
    it('should create default instances when no options provided', () => {
      const newFacade = new PalMcpFacade();

      expect(newFacade.config).toBeDefined();
      expect(newFacade.installer).toBeDefined();
      expect(newFacade.connection).toBeDefined();
    });

    it('should accept injected config instance', () => {
      const newFacade = new PalMcpFacade({ config: mockConfig });

      expect(newFacade.config).toBe(mockConfig);
    });

    it('should accept injected installer instance', () => {
      const newFacade = new PalMcpFacade({ installer: mockInstaller });

      expect(newFacade.installer).toBe(mockInstaller);
    });

    it('should accept injected connection instance', () => {
      const newFacade = new PalMcpFacade({ connection: mockConnection });

      expect(newFacade.connection).toBe(mockConnection);
    });

    it('should accept all injected instances', () => {
      const newFacade = new PalMcpFacade({
        config: mockConfig,
        installer: mockInstaller,
        connection: mockConnection
      });

      expect(newFacade.config).toBe(mockConfig);
      expect(newFacade.installer).toBe(mockInstaller);
      expect(newFacade.connection).toBe(mockConnection);
    });

    it('should initialize _installPromise to null', () => {
      expect(facade._installPromise).toBeNull();
    });
  });

  describe('ensureReady', () => {
    it('should call installer.ensureInstalled on first call', async () => {
      await facade.ensureReady();

      expect(mockInstaller.ensureInstalled).toHaveBeenCalledTimes(1);
    });

    it('should return result from installer.ensureInstalled', async () => {
      const result = await facade.ensureReady();

      expect(result).toEqual({
        success: true,
        uvxPath: 'uvx',
        pythonVersion: '3.12'
      });
    });

    it('should cache the install promise (lazy initialization)', async () => {
      const promise1 = facade.ensureReady();
      const promise2 = facade.ensureReady();

      // Both calls return the same promise reference due to caching
      await Promise.all([promise1, promise2]);
      expect(mockInstaller.ensureInstalled).toHaveBeenCalledTimes(1);
    });

    it('should return cached result on subsequent calls', async () => {
      await facade.ensureReady();
      await facade.ensureReady();
      await facade.ensureReady();

      expect(mockInstaller.ensureInstalled).toHaveBeenCalledTimes(1);
    });

    it('should handle failed installation (uvx not found)', async () => {
      mockInstaller.ensureInstalled.mockResolvedValueOnce({
        success: false,
        error: 'UVX_NOT_FOUND',
        message: 'uvx not found. Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh',
        recoverable: false
      });

      const result = await facade.ensureReady();

      expect(result.success).toBe(false);
      expect(result.error).toBe('UVX_NOT_FOUND');
    });

    it('should handle failed installation (Python not found)', async () => {
      mockInstaller.ensureInstalled.mockResolvedValueOnce({
        success: false,
        error: 'PYTHON_NOT_FOUND',
        message: 'Python 3.10+ is required',
        recoverable: false
      });

      const result = await facade.ensureReady();

      expect(result.success).toBe(false);
      expect(result.error).toBe('PYTHON_NOT_FOUND');
    });
  });

  describe('isConfigured', () => {
    it('should delegate to config.isConfigured', () => {
      mockConfig.isConfigured.mockReturnValue(true);

      const result = facade.isConfigured();

      expect(mockConfig.isConfigured).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('should return false when config not set', () => {
      mockConfig.isConfigured.mockReturnValue(false);

      const result = facade.isConfigured();

      expect(result).toBe(false);
    });

    it('should not call other methods', () => {
      facade.isConfigured();

      expect(mockInstaller.ensureInstalled).not.toHaveBeenCalled();
      expect(mockConnection.testProvider).not.toHaveBeenCalled();
    });
  });

  describe('getEnvVars', () => {
    it('should delegate to config.getEnvVars', () => {
      const envVars = {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        OPENAI_API_KEY: 'sk-123',
        GEMINI_API_KEY: 'AIza-456'
      };
      mockConfig.getEnvVars.mockReturnValue(envVars);

      const result = facade.getEnvVars();

      expect(mockConfig.getEnvVars).toHaveBeenCalledTimes(1);
      expect(result).toEqual(envVars);
    });

    it('should include PATH for uvx', () => {
      const result = facade.getEnvVars();

      expect(result.PATH).toBeDefined();
    });
  });

  describe('getConfigForApi', () => {
    it('should delegate to config.getConfigForApi', () => {
      const result = facade.getConfigForApi();

      expect(mockConfig.getConfigForApi).toHaveBeenCalledTimes(1);
      expect(result.providers).toBeDefined();
    });

    it('should return masked API keys', () => {
      const result = facade.getConfigForApi();

      // API keys should be masked
      expect(result.providers.openai.apiKey).toMatch(/\*/);
    });
  });

  describe('getMcpServerConfig', () => {
    it('should return command, args, and env for MCP settings', () => {
      const config = facade.getMcpServerConfig();

      expect(config.command).toBe('bash');
      expect(config.args).toHaveLength(2);
      expect(config.args[0]).toBe('-c');
      expect(config.args[1]).toContain('uvx');
      expect(config.args[1]).toContain('BeehiveInnovations/pal-mcp-server');
      expect(config.env).toBeDefined();
      expect(config.env.PATH).toBeDefined();
    });

    it('should use installer.getCommand for args', () => {
      facade.getMcpServerConfig();

      expect(mockInstaller.getCommand).toHaveBeenCalled();
    });

    it('should use config.getEnvVars for env', () => {
      facade.getMcpServerConfig();

      expect(mockConfig.getEnvVars).toHaveBeenCalled();
    });
  });

  describe('testProvider', () => {
    it('should delegate to connection.testProvider', async () => {
      const result = await facade.testProvider('openai', 'sk-test-123');

      expect(mockConnection.testProvider).toHaveBeenCalledWith('openai', 'sk-test-123');
      expect(result).toEqual({
        success: true,
        provider: 'openai',
        latencyMs: 150,
        modelCount: 10
      });
    });

    it('should return success result', async () => {
      const result = await facade.testProvider('gemini', 'AIza-test');

      expect(result.success).toBe(true);
    });

    it('should return failure result when connection fails', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: false,
        provider: 'openai',
        error: 'Invalid API key'
      });

      const result = await facade.testProvider('openai', 'invalid-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });
  });

  describe('saveApiKey', () => {
    it('should test connection before saving', async () => {
      await facade.saveApiKey('openai', 'sk-test-123');

      expect(mockConnection.testProvider).toHaveBeenCalledWith('openai', 'sk-test-123');
    });

    it('should save API key if test passes', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: true,
        provider: 'openai',
        modelCount: 10,
        latencyMs: 100
      });

      await facade.saveApiKey('openai', 'sk-test-123');

      expect(mockConfig.setApiKey).toHaveBeenCalledWith('openai', 'sk-test-123');
    });

    it('should return success result with model count when test passes', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: true,
        provider: 'openai',
        modelCount: 15,
        latencyMs: 120
      });

      const result = await facade.saveApiKey('openai', 'sk-test-123');

      expect(result).toEqual({
        success: true,
        provider: 'openai',
        modelCount: 15
      });
    });

    it('should not save API key if test fails', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: false,
        provider: 'openai',
        error: 'Invalid API key',
        statusCode: 401
      });

      await facade.saveApiKey('openai', 'invalid-key');

      expect(mockConfig.setApiKey).not.toHaveBeenCalled();
    });

    it('should return failure result when test fails', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: false,
        provider: 'openai',
        error: 'Invalid API key',
        statusCode: 401
      });

      const result = await facade.saveApiKey('openai', 'invalid-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should work for different providers', async () => {
      mockConnection.testProvider.mockResolvedValueOnce({
        success: true,
        provider: 'gemini',
        modelCount: 5,
        latencyMs: 95
      });

      const result = await facade.saveApiKey('gemini', 'AIza-abc');

      expect(mockConfig.setApiKey).toHaveBeenCalledWith('gemini', 'AIza-abc');
      expect(result.provider).toBe('gemini');
    });
  });

  describe('removeApiKey', () => {
    it('should delegate to config.removeApiKey', () => {
      const result = facade.removeApiKey('openai');

      expect(mockConfig.removeApiKey).toHaveBeenCalledWith('openai');
      expect(result).toEqual({ success: true, provider: 'openai' });
    });

    it('should return success result', () => {
      const result = facade.removeApiKey('gemini');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('gemini');
    });

    it('should work for different providers', () => {
      facade.removeApiKey('azure');
      expect(mockConfig.removeApiKey).toHaveBeenCalledWith('azure');

      facade.removeApiKey('openrouter');
      expect(mockConfig.removeApiKey).toHaveBeenCalledWith('openrouter');
    });
  });

  describe('getStatus', () => {
    it('should call ensureReady', async () => {
      await facade.getStatus();

      expect(mockInstaller.ensureInstalled).toHaveBeenCalled();
    });

    it('should combine install and config status', async () => {
      mockInstaller.ensureInstalled.mockResolvedValueOnce({
        success: true,
        uvxPath: '/home/user/.local/bin/uvx',
        pythonVersion: '3.12'
      });
      mockConfig.isConfigured.mockReturnValue(true);
      mockConfig.getConfigForApi.mockReturnValue({
        success: true,
        version: '2.0',
        providers: { openai: { apiKey: 'sk-****23', enabled: true } },
        lastUpdated: '2025-01-01T00:00:00Z'
      });

      const status = await facade.getStatus();

      expect(status.ready).toBe(true);
      expect(status.uvxAvailable).toBe(true);
      expect(status.uvxPath).toBe('/home/user/.local/bin/uvx');
      expect(status.pythonVersion).toBe('3.12');
      expect(status.configured).toBe(true);
      expect(status.providers.openai.enabled).toBe(true);
    });

    it('should reflect failed installation', async () => {
      mockInstaller.ensureInstalled.mockResolvedValueOnce({
        success: false,
        error: 'UVX_NOT_FOUND',
        message: 'uvx not found'
      });
      mockConfig.isConfigured.mockReturnValue(false);

      const status = await facade.getStatus();

      expect(status.ready).toBe(false);
      expect(status.uvxAvailable).toBe(false);
      expect(status.installError).toBe('UVX_NOT_FOUND');
      expect(status.installMessage).toBe('uvx not found');
    });

    it('should include supportedProviders metadata', async () => {
      const status = await facade.getStatus();

      expect(status.supportedProviders).toBeDefined();
      expect(status.supportedProviders.length).toBe(6);
      expect(status.supportedProviders[0]).toHaveProperty('key');
      expect(status.supportedProviders[0]).toHaveProperty('name');
      expect(status.supportedProviders[0]).toHaveProperty('envKey');
    });
  });

  describe('update', () => {
    it('should delegate to installer.update', async () => {
      await facade.update();

      expect(mockInstaller.update).toHaveBeenCalledTimes(1);
    });

    it('should return auto-update message', async () => {
      const result = await facade.update();

      expect(result.success).toBe(true);
      expect(result.message).toContain('auto-updates');
    });
  });

  describe('class availability', () => {
    it('should have PalMcpFacade available', () => {
      expect(PalMcpFacade).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete setup flow: test -> save -> status', async () => {
      // Test provider
      mockConnection.testProvider.mockResolvedValueOnce({
        success: true,
        provider: 'openai',
        modelCount: 10,
        latencyMs: 100
      });

      const saveResult = await facade.saveApiKey('openai', 'sk-test-123');
      expect(saveResult.success).toBe(true);

      // Get status after save
      mockConfig.isConfigured.mockReturnValue(true);
      const status = await facade.getStatus();
      expect(status.configured).toBe(true);
    });

    it('should handle provider swap: remove old, test and save new', async () => {
      // Remove old provider
      facade.removeApiKey('gemini');
      expect(mockConfig.removeApiKey).toHaveBeenCalledWith('gemini');

      // Test new provider
      mockConnection.testProvider.mockResolvedValueOnce({
        success: true,
        provider: 'openrouter',
        modelCount: 50,
        latencyMs: 110
      });

      const saveResult = await facade.saveApiKey('openrouter', 'sk-or-xyz');
      expect(saveResult.success).toBe(true);
      expect(mockConfig.setApiKey).toHaveBeenCalledWith('openrouter', 'sk-or-xyz');
    });

    it('should handle multiple ensureReady calls returning same promise', async () => {
      const promise1 = facade.ensureReady();
      const promise2 = facade.ensureReady();
      const promise3 = facade.ensureReady();

      await Promise.all([promise1, promise2, promise3]);

      expect(mockInstaller.ensureInstalled).toHaveBeenCalledTimes(1);
    });
  });
});
