/**
 * MCP Manager - Model Context Protocol Server Management
 *
 * Handles:
 * - Discovery of installed MCP servers
 * - Generation of .claude/settings.json per worktree
 * - MCP server installation and configuration
 * - Cross-worktree MCP communication
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { ZenMcpConfig } from './zen-mcp/zen-mcp-config.mjs';

export class McpManager {
  constructor(projectRoot, runtime, options = {}) {
    this.projectRoot = projectRoot;
    this.runtime = runtime;
    this.mcpCacheDir = join(homedir(), '.vibe-worktrees', 'mcp-cache');
    this.zenMcp = options.zenMcp || new ZenMcpConfig();
    this._ensureCacheDir();
  }

  _ensureCacheDir() {
    if (!existsSync(this.mcpCacheDir)) {
      mkdirSync(this.mcpCacheDir, { recursive: true });
    }
  }

  /**
   * Discover MCP servers from multiple sources
   * @returns {Array<Object>} List of discovered MCP servers
   */
  discoverServers() {
    const servers = [];

    // 1. Check for npm MCP packages in project
    const npmServers = this._discoverNpmServers();
    servers.push(...npmServers);

    // 2. Check for local MCP server directories
    const localServers = this._discoverLocalServers();
    servers.push(...localServers);

    // 3. Check for globally installed MCP packages
    const globalServers = this._discoverGlobalServers();
    servers.push(...globalServers);

    // Remove duplicates based on server ID
    const uniqueServers = this._deduplicateServers(servers);

    return uniqueServers;
  }

  /**
   * Discover npm MCP packages in project
   */
  _discoverNpmServers() {
    const servers = [];
    const packageJsonPath = join(this.projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return servers;
    }

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Look for @modelcontextprotocol/server-* packages
      for (const [name, version] of Object.entries(allDeps)) {
        if (name.startsWith('@modelcontextprotocol/server-')) {
          const serverName = name.replace('@modelcontextprotocol/server-', '');
          servers.push({
            id: serverName,
            name: serverName,
            package: name,
            version,
            source: 'npm-project',
            command: 'npx',
            args: ['-y', name]
          });
        }
      }
    } catch (error) {
      console.warn('Failed to parse package.json:', error.message);
    }

    return servers;
  }

  /**
   * Discover local MCP server directories
   */
  _discoverLocalServers() {
    const servers = [];
    const mcpServersDir = join(this.projectRoot, 'mcp-servers');

    if (!existsSync(mcpServersDir)) {
      return servers;
    }

    try {
      const entries = readdirSync(mcpServersDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const serverPath = join(mcpServersDir, entry.name);
          const mainFile = this._findMainFile(serverPath);

          if (mainFile) {
            servers.push({
              id: entry.name,
              name: entry.name,
              source: 'local',
              command: 'node',
              args: [mainFile],
              path: serverPath
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to scan mcp-servers directory:', error.message);
    }

    return servers;
  }

  /**
   * Find main entry file for local MCP server
   */
  _findMainFile(serverPath) {
    const candidates = ['index.js', 'server.js', 'main.js', 'index.mjs', 'server.mjs'];

    for (const candidate of candidates) {
      const filePath = join(serverPath, candidate);
      if (existsSync(filePath)) {
        return filePath;
      }
    }

    // Check package.json for main field
    const packageJsonPath = join(serverPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.main) {
          return join(serverPath, packageJson.main);
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    return null;
  }

  /**
   * Discover globally installed MCP packages
   */
  _discoverGlobalServers() {
    const servers = [];

    try {
      // List global npm packages
      const output = execSync('npm list -g --depth=0 --json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const globalPackages = JSON.parse(output);
      const deps = globalPackages.dependencies || {};

      for (const [name, info] of Object.entries(deps)) {
        if (name.startsWith('@modelcontextprotocol/server-')) {
          const serverName = name.replace('@modelcontextprotocol/server-', '');
          servers.push({
            id: serverName,
            name: serverName,
            package: name,
            version: info.version,
            source: 'npm-global',
            command: name,
            args: []
          });
        }
      }
    } catch (error) {
      // Global npm list failed, ignore
    }

    return servers;
  }

  /**
   * Remove duplicate servers, preferring local > npm-project > npm-global
   */
  _deduplicateServers(servers) {
    const serverMap = new Map();

    // Priority order: local > npm-project > npm-global
    const priorityOrder = { local: 3, 'npm-project': 2, 'npm-global': 1 };

    for (const server of servers) {
      const existing = serverMap.get(server.id);

      if (!existing || priorityOrder[server.source] > priorityOrder[existing.source]) {
        serverMap.set(server.id, server);
      }
    }

    return Array.from(serverMap.values());
  }

  /**
   * Generate .claude/settings.json for a worktree
   * @param {string} worktreePath - Path to worktree
   * @param {Array<Object>} servers - MCP servers to configure
   * @param {Object} options - Additional options
   */
  generateClaudeSettings(worktreePath, servers = null, options = {}) {
    const discoveredServers = servers || this.discoverServers();
    const claudeDir = join(worktreePath, '.claude');
    const settingsPath = join(claudeDir, 'settings.json');

    // Ensure .claude directory exists
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing settings if present
    let existingSettings = {};
    if (existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch (error) {
        console.warn('Failed to parse existing settings.json:', error.message);
      }
    }

    // Build MCP server configurations
    const mcpServers = {};

    for (const server of discoveredServers) {
      const config = {
        command: server.command,
        args: server.args
      };

      // Add environment variables if specified
      if (server.env || options.serverEnv?.[server.id]) {
        config.env = {
          ...server.env,
          ...options.serverEnv?.[server.id]
        };
      }

      mcpServers[server.id] = config;
    }

    // Add vibe-bridge server (cross-worktree communication)
    if (options.enableBridge !== false) {
      mcpServers['vibe-bridge'] = {
        command: 'node',
        args: [join(dirname(new URL(import.meta.url).pathname), 'mcp-bridge-server.mjs')],
        env: {
          VIBE_PROJECT_ROOT: this.projectRoot,
          VIBE_WORKTREE_PATH: worktreePath
        }
      };
    }

    // Add Zen MCP if configured
    if (this.zenMcp.isConfigured()) {
      mcpServers['zen'] = {
        command: 'bash',
        args: this.zenMcp.installer.getCommand(),
        env: this.zenMcp.getEnvVars()
      };
    }

    // Merge with existing settings
    const settings = {
      ...existingSettings,
      mcpServers: {
        ...existingSettings.mcpServers,
        ...mcpServers
      }
    };

    // Write settings file
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    return {
      path: settingsPath,
      servers: Object.keys(mcpServers),
      count: Object.keys(mcpServers).length
    };
  }

  /**
   * Install MCP server from npm
   * @param {string} packageName - npm package name
   * @param {Object} options - Installation options
   */
  async installServer(packageName, options = {}) {
    const installGlobal = options.global !== false;
    const target = installGlobal ? this.mcpCacheDir : this.projectRoot;

    try {
      console.log(`Installing ${packageName}${installGlobal ? ' (globally)' : ''}...`);

      const installCommand = installGlobal
        ? `npm install -g ${packageName}`
        : `npm install --save-dev ${packageName}`;

      execSync(installCommand, {
        cwd: target,
        stdio: 'inherit'
      });

      return {
        success: true,
        package: packageName,
        location: installGlobal ? 'global' : 'project'
      };
    } catch (error) {
      return {
        success: false,
        package: packageName,
        error: error.message
      };
    }
  }

  /**
   * Get standard MCP servers from official registry
   */
  getOfficialServers() {
    return [
      {
        id: 'filesystem',
        name: 'Filesystem',
        package: '@modelcontextprotocol/server-filesystem',
        description: 'Read and write files within allowed directories',
        recommended: true
      },
      {
        id: 'git',
        name: 'Git',
        package: '@modelcontextprotocol/server-git',
        description: 'Read git repository information, diffs, and commits',
        recommended: true
      },
      {
        id: 'github',
        name: 'GitHub',
        package: '@modelcontextprotocol/server-github',
        description: 'Access GitHub API for issues, PRs, and repositories',
        recommended: false
      },
      {
        id: 'postgres',
        name: 'PostgreSQL',
        package: '@modelcontextprotocol/server-postgres',
        description: 'Query PostgreSQL databases',
        recommended: false
      },
      {
        id: 'sqlite',
        name: 'SQLite',
        package: '@modelcontextprotocol/server-sqlite',
        description: 'Query SQLite databases',
        recommended: false
      }
    ];
  }

  /**
   * Check if a server is already installed
   */
  isServerInstalled(serverId) {
    const discovered = this.discoverServers();
    return discovered.some(s => s.id === serverId);
  }

  /**
   * Update all MCP servers in worktrees
   * @param {Array<string>} worktreePaths - Paths to worktrees to update
   */
  updateAllWorktrees(worktreePaths) {
    const results = [];

    for (const worktreePath of worktreePaths) {
      try {
        const result = this.generateClaudeSettings(worktreePath);
        results.push({
          worktree: worktreePath,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          worktree: worktreePath,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}
