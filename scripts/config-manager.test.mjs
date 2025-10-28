/**
 * Tests for Configuration Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// Mock fs module
vi.mock('fs');

// Import after mocking
const { ConfigManager } = await import('./config-manager.mjs');

describe('ConfigManager', () => {
  const mockProjectRoot = '/test/project';
  const mockConfigPath = '/test/project/.vibe/config.json';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.env
    delete process.env.VIBE_RUNTIME;
    delete process.env.VIBE_COMPOSE_FILE;
    delete process.env.VIBE_SUDO;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should create default config if none exists', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      const config = manager.load();

      expect(config.version).toBe('1.0');
      expect(config.container.runtime).toBe('auto');
      expect(config.agents.default).toBe('claude');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should load existing config from file', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: 'Test' },
        container: {
          runtime: 'docker',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'auto'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);
      const config = manager.load();

      expect(config.project.name).toBe('test-project');
      expect(config.container.runtime).toBe('docker');
    });

    it('should throw error for invalid JSON', () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('{ invalid json');

      const manager = new ConfigManager(mockProjectRoot);

      expect(() => manager.load()).toThrow('Failed to load config');
    });

    it('should cache loaded config on subsequent calls', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'auto',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'auto'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);

      manager.load();
      manager.load(); // Second call should use cache

      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Configuration Saving', () => {
    it('should create .vibe directory if it does not exist', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load(); // Creates default config
      manager.save();

      expect(mkdirSync).toHaveBeenCalledWith('/test/project/.vibe', { recursive: true });
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should save config to JSON file', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();
      manager.save();

      const savedContent = writeFileSync.mock.calls[0][1];
      const savedConfig = JSON.parse(savedContent);

      expect(savedConfig.version).toBe('1.0');
      expect(savedConfig.container.runtime).toBe('auto');
    });

    it('should format JSON with proper indentation', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();
      manager.save();

      const savedContent = writeFileSync.mock.calls[0][1];

      // Check for indentation (2 spaces)
      expect(savedContent).toContain('  "version"');
    });
  });

  describe('Configuration Get/Set', () => {
    it('should get config value by path', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'docker',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'always'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);

      expect(manager.get('container.runtime')).toBe('docker');
      expect(manager.get('container.sudo')).toBe('always');
      expect(manager.get('agents.default')).toBe('claude');
    });

    it('should return undefined for non-existent path', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();

      expect(manager.get('nonexistent.path')).toBeUndefined();
    });

    it('should set config value by path', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();
      manager.set('container.runtime', 'podman');

      expect(manager.get('container.runtime')).toBe('podman');
    });

    it('should update multiple config values', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();

      manager.update({
        'container.runtime': 'podman',
        'agents.default': 'codex',
        'sync.baseBranch': 'master'
      });

      expect(manager.get('container.runtime')).toBe('podman');
      expect(manager.get('agents.default')).toBe('codex');
      expect(manager.get('sync.baseBranch')).toBe('master');
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should override runtime from VIBE_RUNTIME', () => {
      process.env.VIBE_RUNTIME = 'podman';

      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'docker',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'auto'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);
      const config = manager.load();

      expect(config.container.runtime).toBe('podman');
    });

    it('should override compose file from VIBE_COMPOSE_FILE', () => {
      process.env.VIBE_COMPOSE_FILE = 'custom-compose.yml';

      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      const config = manager.load();

      expect(config.container.composeFile).toBe('custom-compose.yml');
    });

    it('should override sudo from VIBE_SUDO', () => {
      process.env.VIBE_SUDO = 'never';

      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      const config = manager.load();

      expect(config.container.sudo).toBe('never');
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid runtime', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'invalid',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'auto'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);

      expect(() => manager.load()).toThrow('Invalid container.runtime');
    });

    it('should reject invalid sudo setting', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'docker',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'invalid'
        },
        agents: {
          default: 'claude',
          available: ['claude', 'codex', 'gemini', 'shell']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);

      expect(() => manager.load()).toThrow('Invalid container.sudo');
    });

    it('should reject default agent not in available list', () => {
      const mockConfig = {
        version: '1.0',
        project: { name: 'test-project', description: '' },
        container: {
          runtime: 'docker',
          composeFile: 'docker-compose.yml',
          servicesToLog: [],
          dataVolumes: [],
          sudo: 'auto'
        },
        agents: {
          default: 'nonexistent',
          available: ['claude', 'codex']
        },
        mcp: { autoInstall: true, servers: [] },
        sync: {
          enabled: true,
          baseBranch: 'main',
          autoUpdate: false,
          checkInterval: 300000
        }
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const manager = new ConfigManager(mockProjectRoot);

      expect(() => manager.load()).toThrow('agents.default');
    });
  });

  describe('Utility Methods', () => {
    it('should check if config exists', () => {
      existsSync.mockReturnValue(true);

      const manager = new ConfigManager(mockProjectRoot);

      expect(manager.exists()).toBe(true);
    });

    it('should reset config to defaults', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();
      manager.set('container.runtime', 'podman');

      manager.reset();

      expect(manager.get('container.runtime')).toBe('auto');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should provide configuration summary', () => {
      existsSync.mockReturnValue(false);
      mkdirSync.mockReturnValue(undefined);
      writeFileSync.mockReturnValue(undefined);

      const manager = new ConfigManager(mockProjectRoot);
      manager.load();

      const summary = manager.getSummary();

      expect(summary).toHaveProperty('project');
      expect(summary).toHaveProperty('runtime');
      expect(summary).toHaveProperty('composeFile');
      expect(summary).toHaveProperty('defaultAgent');
      expect(summary).toHaveProperty('baseBranch');
      expect(summary).toHaveProperty('configPath');
    });
  });
});
