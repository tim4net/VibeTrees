import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpManager } from './mcp-manager.mjs';

// Mock filesystem
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn()
}));

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser')
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

describe('McpManager', () => {
  let mcpManager;
  let mockRuntime;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    existsSync.mockReturnValue(false);
    mkdirSync.mockReturnValue(undefined);

    mockRuntime = {
      exec: vi.fn(),
      getComposeCommand: vi.fn(() => 'docker compose')
    };

    mcpManager = new McpManager('/test/project', mockRuntime);
  });

  describe('constructor', () => {
    it('should initialize with project root and runtime', () => {
      expect(mcpManager.projectRoot).toBe('/test/project');
      expect(mcpManager.runtime).toBe(mockRuntime);
    });

    it('should create MCP cache directory', () => {
      expect(mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.vibe-worktrees/mcp-cache',
        { recursive: true }
      );
    });
  });

  describe('discoverServers', () => {
    it('should discover npm MCP servers from package.json', () => {
      existsSync.mockImplementation((path) => path === '/test/project/package.json');
      readFileSync.mockReturnValue(JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/server-filesystem': '^1.0.0',
          '@modelcontextprotocol/server-git': '^1.0.0',
          'other-package': '^2.0.0'
        }
      }));

      const servers = mcpManager.discoverServers();

      expect(servers).toHaveLength(2);
      expect(servers[0]).toMatchObject({
        id: 'filesystem',
        name: 'filesystem',
        package: '@modelcontextprotocol/server-filesystem',
        source: 'npm-project'
      });
      expect(servers[1]).toMatchObject({
        id: 'git',
        name: 'git',
        package: '@modelcontextprotocol/server-git',
        source: 'npm-project'
      });
    });

    it('should discover local MCP servers in mcp-servers directory', () => {
      existsSync.mockImplementation((path) => {
        if (path === '/test/project/package.json') return false;
        if (path === '/test/project/mcp-servers') return true;
        if (path === '/test/project/mcp-servers/custom-server/index.js') return true;
        return false;
      });

      readdirSync.mockReturnValue([
        { name: 'custom-server', isDirectory: () => true }
      ]);

      const servers = mcpManager.discoverServers();

      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        id: 'custom-server',
        name: 'custom-server',
        source: 'local',
        command: 'node',
        args: ['/test/project/mcp-servers/custom-server/index.js']
      });
    });

    it('should discover globally installed MCP servers', () => {
      existsSync.mockReturnValue(false);
      readdirSync.mockReturnValue([]);

      execSync.mockReturnValue(JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/server-postgres': { version: '1.0.0' }
        }
      }));

      const servers = mcpManager.discoverServers();

      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        id: 'postgres',
        name: 'postgres',
        package: '@modelcontextprotocol/server-postgres',
        source: 'npm-global'
      });
    });

    it('should deduplicate servers with priority: local > npm-project > npm-global', () => {
      // Setup: filesystem exists in all three locations
      existsSync.mockImplementation((path) => {
        if (path === '/test/project/package.json') return true;
        if (path === '/test/project/mcp-servers') return true;
        if (path === '/test/project/mcp-servers/filesystem/index.js') return true;
        return false;
      });

      readFileSync.mockReturnValue(JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/server-filesystem': '^1.0.0'
        }
      }));

      readdirSync.mockReturnValue([
        { name: 'filesystem', isDirectory: () => true }
      ]);

      execSync.mockReturnValue(JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/server-filesystem': { version: '1.0.0' }
        }
      }));

      const servers = mcpManager.discoverServers();

      // Should only have one 'filesystem' server (local has highest priority)
      expect(servers).toHaveLength(1);
      expect(servers[0].source).toBe('local');
    });

    it('should return empty array if no servers found', () => {
      existsSync.mockReturnValue(false);
      readdirSync.mockReturnValue([]);
      execSync.mockImplementation(() => {
        throw new Error('npm list failed');
      });

      const servers = mcpManager.discoverServers();

      expect(servers).toEqual([]);
    });
  });

  describe('generateClaudeSettings', () => {
    it('should create .claude directory if it does not exist', () => {
      existsSync.mockReturnValue(false);

      mcpManager.generateClaudeSettings('/test/worktree', []);

      expect(mkdirSync).toHaveBeenCalledWith('/test/worktree/.claude', { recursive: true });
    });

    it('should include Zen MCP when configured', () => {
      existsSync.mockReturnValue(false);

      // Mock Zen MCP as configured
      const mockZenMcp = {
        isConfigured: vi.fn(() => true),
        getEnvVars: vi.fn(() => ({
          OPENROUTER_API_KEY: 'sk-or-test-key',
          OPENAI_API_KEY: 'sk-test-key'
        })),
        installer: {
          getCommand: vi.fn(() => [
            '-c',
            'for p in $(which uvx 2>/dev/null) $HOME/.local/bin/uvx /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do [ -x "$p" ] && exec "$p" --from git+https://github.com/BeehiveInnovations/zen-mcp-server.git zen-mcp-server; done; echo \'uvx not found\' >&2; exit 1'
          ])
        }
      };

      mcpManager.zenMcp = mockZenMcp;

      const servers = [
        {
          id: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        }
      ];

      mcpManager.generateClaudeSettings('/test/worktree', servers);

      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.mcpServers).toHaveProperty('zen');
      expect(writtenContent.mcpServers.zen.command).toBe('bash');
      expect(writtenContent.mcpServers.zen.args[0]).toBe('-c');
      expect(writtenContent.mcpServers.zen.args[1]).toContain('BeehiveInnovations/zen-mcp-server');
      expect(writtenContent.mcpServers.zen.env).toEqual({
        OPENROUTER_API_KEY: 'sk-or-test-key',
        OPENAI_API_KEY: 'sk-test-key'
      });
    });

    it('should not include Zen MCP when not configured', () => {
      existsSync.mockReturnValue(false);

      // Mock Zen MCP as not configured
      const mockZenMcp = {
        isConfigured: vi.fn(() => false),
        getEnvVars: vi.fn(() => ({}))
      };

      mcpManager.zenMcp = mockZenMcp;

      const servers = [
        {
          id: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        }
      ];

      mcpManager.generateClaudeSettings('/test/worktree', servers);

      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.mcpServers).not.toHaveProperty('zen');
      expect(mockZenMcp.isConfigured).toHaveBeenCalled();
      expect(mockZenMcp.getEnvVars).not.toHaveBeenCalled();
    });

    it('should generate settings.json with discovered MCP servers', () => {
      existsSync.mockReturnValue(false);

      const servers = [
        {
          id: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        },
        {
          id: 'git',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-git']
        }
      ];

      const result = mcpManager.generateClaudeSettings('/test/worktree', servers);

      expect(writeFileSync).toHaveBeenCalled();
      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.mcpServers).toHaveProperty('filesystem');
      expect(writtenContent.mcpServers).toHaveProperty('git');
      expect(writtenContent.mcpServers).toHaveProperty('vibe-bridge');

      expect(result).toMatchObject({
        path: '/test/worktree/.claude/settings.json',
        count: 3 // filesystem + git + vibe-bridge
      });
    });

    it('should include environment variables for servers', () => {
      existsSync.mockReturnValue(false);

      const servers = [
        {
          id: 'postgres',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres']
        }
      ];

      const options = {
        serverEnv: {
          postgres: {
            DATABASE_URL: 'postgresql://localhost:5432/mydb'
          }
        }
      };

      mcpManager.generateClaudeSettings('/test/worktree', servers, options);

      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.mcpServers.postgres.env).toEqual({
        DATABASE_URL: 'postgresql://localhost:5432/mydb'
      });
    });

    it('should merge with existing settings.json', () => {
      existsSync.mockImplementation((path) => {
        return path === '/test/worktree/.claude/settings.json';
      });

      readFileSync.mockReturnValue(JSON.stringify({
        customSetting: 'value',
        mcpServers: {
          'existing-server': {
            command: 'node',
            args: ['server.js']
          }
        }
      }));

      const servers = [
        {
          id: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        }
      ];

      mcpManager.generateClaudeSettings('/test/worktree', servers);

      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.customSetting).toBe('value');
      expect(writtenContent.mcpServers).toHaveProperty('existing-server');
      expect(writtenContent.mcpServers).toHaveProperty('filesystem');
    });

    it('should skip vibe-bridge if enableBridge is false', () => {
      existsSync.mockReturnValue(false);

      const servers = [
        {
          id: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        }
      ];

      const result = mcpManager.generateClaudeSettings('/test/worktree', servers, {
        enableBridge: false
      });

      const writtenContent = JSON.parse(writeFileSync.mock.calls[0][1]);

      expect(writtenContent.mcpServers).not.toHaveProperty('vibe-bridge');
      expect(result.count).toBe(1);
    });
  });

  describe('getOfficialServers', () => {
    it('should return list of official MCP servers', () => {
      const servers = mcpManager.getOfficialServers();

      expect(servers).toBeInstanceOf(Array);
      expect(servers.length).toBeGreaterThan(0);

      const filesystemServer = servers.find(s => s.id === 'filesystem');
      expect(filesystemServer).toMatchObject({
        id: 'filesystem',
        name: 'Filesystem',
        package: '@modelcontextprotocol/server-filesystem',
        recommended: true
      });
    });
  });

  describe('isServerInstalled', () => {
    it('should return true if server is discovered', () => {
      existsSync.mockImplementation((path) => path === '/test/project/package.json');
      readFileSync.mockReturnValue(JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/server-filesystem': '^1.0.0'
        }
      }));

      const isInstalled = mcpManager.isServerInstalled('filesystem');

      expect(isInstalled).toBe(true);
    });

    it('should return false if server is not discovered', () => {
      existsSync.mockReturnValue(false);

      const isInstalled = mcpManager.isServerInstalled('filesystem');

      expect(isInstalled).toBe(false);
    });
  });

  describe('updateAllWorktrees', () => {
    it('should update settings for all worktrees', () => {
      existsSync.mockReturnValue(false);

      const worktreePaths = [
        '/test/worktree1',
        '/test/worktree2'
      ];

      const results = mcpManager.updateAllWorktrees(worktreePaths);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        worktree: '/test/worktree1',
        success: true
      });
      expect(results[1]).toMatchObject({
        worktree: '/test/worktree2',
        success: true
      });

      expect(writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', () => {
      writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const worktreePaths = ['/test/worktree1'];

      const results = mcpManager.updateAllWorktrees(worktreePaths);

      expect(results[0]).toMatchObject({
        worktree: '/test/worktree1',
        success: false,
        error: 'Permission denied'
      });
    });
  });

  describe('_findMainFile', () => {
    it('should find index.js if it exists', () => {
      existsSync.mockImplementation((path) => path === '/server/index.js');

      const mainFile = mcpManager._findMainFile('/server');

      expect(mainFile).toBe('/server/index.js');
    });

    it('should try multiple file names in order', () => {
      existsSync.mockImplementation((path) => path === '/server/server.js');

      const mainFile = mcpManager._findMainFile('/server');

      expect(mainFile).toBe('/server/server.js');
    });

    it('should check package.json main field', () => {
      existsSync.mockImplementation((path) => {
        if (path === '/server/package.json') return true;
        return false;
      });

      readFileSync.mockReturnValue(JSON.stringify({
        main: 'src/index.js'
      }));

      const mainFile = mcpManager._findMainFile('/server');

      expect(mainFile).toBe('/server/src/index.js');
    });

    it('should return null if no main file found', () => {
      existsSync.mockReturnValue(false);

      const mainFile = mcpManager._findMainFile('/server');

      expect(mainFile).toBeNull();
    });
  });
});
