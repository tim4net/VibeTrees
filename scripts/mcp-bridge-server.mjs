#!/usr/bin/env node

/**
 * Vibe MCP Bridge Server
 *
 * Provides cross-worktree communication for AI agents via Model Context Protocol.
 * Allows agents to:
 * - List all worktrees
 * - Read files from other worktrees
 * - Get git status of other worktrees
 * - Search across all worktrees
 *
 * This enables collaboration between agents working in different worktrees.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync } from 'child_process';

// Environment configuration
const PROJECT_ROOT = process.env.VIBE_PROJECT_ROOT || process.cwd();
const WORKTREE_PATH = process.env.VIBE_WORKTREE_PATH;
const WORKTREES_DIR = join(PROJECT_ROOT, '.worktrees');

class VibeBridgeServer {
  constructor() {
    this.server = new Server(
      {
        name: 'vibe-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this._setupHandlers();
  }

  _setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_worktrees',
          description: 'List all active worktrees in the project',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'read_file_from_worktree',
          description: 'Read a file from another worktree',
          inputSchema: {
            type: 'object',
            properties: {
              worktree: {
                type: 'string',
                description: 'Name of the worktree (e.g., "feature-auth")',
              },
              path: {
                type: 'string',
                description: 'Relative path to file within worktree',
              },
            },
            required: ['worktree', 'path'],
          },
        },
        {
          name: 'get_worktree_git_status',
          description: 'Get git status for a worktree',
          inputSchema: {
            type: 'object',
            properties: {
              worktree: {
                type: 'string',
                description: 'Name of the worktree',
              },
            },
            required: ['worktree'],
          },
        },
        {
          name: 'search_across_worktrees',
          description: 'Search for a pattern across all worktrees',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Search pattern (supports regex)',
              },
              filePattern: {
                type: 'string',
                description: 'Optional file pattern (e.g., "*.js")',
              },
            },
            required: ['pattern'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_worktrees':
            return await this._listWorktrees();
          case 'read_file_from_worktree':
            return await this._readFileFromWorktree(args.worktree, args.path);
          case 'get_worktree_git_status':
            return await this._getWorktreeGitStatus(args.worktree);
          case 'search_across_worktrees':
            return await this._searchAcrossWorktrees(args.pattern, args.filePattern);
          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async _listWorktrees() {
    const worktrees = [];

    if (!existsSync(WORKTREES_DIR)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify([], null, 2),
          },
        ],
      };
    }

    const entries = readdirSync(WORKTREES_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const worktreePath = join(WORKTREES_DIR, entry.name);

        try {
          // Get git branch
          const branch = execSync('git branch --show-current', {
            cwd: worktreePath,
            encoding: 'utf-8',
          }).trim();

          // Check if this is the current worktree
          const isCurrent = WORKTREE_PATH && resolve(WORKTREE_PATH) === resolve(worktreePath);

          worktrees.push({
            name: entry.name,
            path: worktreePath,
            branch,
            isCurrent,
          });
        } catch (error) {
          // Skip if not a git worktree
          continue;
        }
      }
    }

    // Also include main worktree
    try {
      const mainBranch = execSync('git branch --show-current', {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }).trim();

      worktrees.unshift({
        name: 'main',
        path: PROJECT_ROOT,
        branch: mainBranch,
        isCurrent: WORKTREE_PATH && resolve(WORKTREE_PATH) === resolve(PROJECT_ROOT),
      });
    } catch (error) {
      // Skip if not a git repo
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(worktrees, null, 2),
        },
      ],
    };
  }

  async _readFileFromWorktree(worktreeName, filePath) {
    // Security: prevent path traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
      throw new Error('Invalid file path: path traversal not allowed');
    }

    const worktreePath = worktreeName === 'main'
      ? PROJECT_ROOT
      : join(WORKTREES_DIR, worktreeName);

    if (!existsSync(worktreePath)) {
      throw new Error(`Worktree not found: ${worktreeName}`);
    }

    const fullPath = join(worktreePath, filePath);

    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath} in worktree ${worktreeName}`);
    }

    // Security: ensure file is within worktree
    const resolvedPath = resolve(fullPath);
    const resolvedWorktree = resolve(worktreePath);
    if (!resolvedPath.startsWith(resolvedWorktree)) {
      throw new Error('Access denied: file is outside worktree');
    }

    const stats = statSync(fullPath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    // Read file with size limit (1MB)
    if (stats.size > 1024 * 1024) {
      throw new Error('File too large (max 1MB)');
    }

    const content = readFileSync(fullPath, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            worktree: worktreeName,
            path: filePath,
            size: stats.size,
            content,
          }, null, 2),
        },
      ],
    };
  }

  async _getWorktreeGitStatus(worktreeName) {
    const worktreePath = worktreeName === 'main'
      ? PROJECT_ROOT
      : join(WORKTREES_DIR, worktreeName);

    if (!existsSync(worktreePath)) {
      throw new Error(`Worktree not found: ${worktreeName}`);
    }

    try {
      const status = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
      });

      const branch = execSync('git branch --show-current', {
        cwd: worktreePath,
        encoding: 'utf-8',
      }).trim();

      const lastCommit = execSync('git log -1 --pretty=format:"%h %s"', {
        cwd: worktreePath,
        encoding: 'utf-8',
      }).trim();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              worktree: worktreeName,
              branch,
              lastCommit,
              status: status.trim(),
              clean: status.trim() === '',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get git status: ${error.message}`);
    }
  }

  async _searchAcrossWorktrees(pattern, filePattern = '*') {
    const results = [];
    const worktrees = [];

    // Collect worktrees
    if (existsSync(WORKTREES_DIR)) {
      const entries = readdirSync(WORKTREES_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          worktrees.push({
            name: entry.name,
            path: join(WORKTREES_DIR, entry.name),
          });
        }
      }
    }

    // Add main worktree
    worktrees.unshift({
      name: 'main',
      path: PROJECT_ROOT,
    });

    // Search each worktree
    for (const worktree of worktrees) {
      try {
        // Use git grep for fast searching (only searches tracked files)
        const output = execSync(
          `git grep -n "${pattern}" -- "${filePattern}"`,
          {
            cwd: worktree.path,
            encoding: 'utf-8',
          }
        );

        const lines = output.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match) {
            results.push({
              worktree: worktree.name,
              file: match[1],
              line: parseInt(match[2], 10),
              content: match[3],
            });
          }
        }
      } catch (error) {
        // git grep returns exit code 1 if no matches found, ignore
        if (error.status !== 1) {
          console.error(`Search failed in ${worktree.name}:`, error.message);
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pattern,
            filePattern,
            totalResults: results.length,
            results: results.slice(0, 100), // Limit to 100 results
          }, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Vibe MCP Bridge Server running on stdio');
  }
}

// Run server
const server = new VibeBridgeServer();
server.run().catch(console.error);
