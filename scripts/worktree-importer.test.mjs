/**
 * Tests for WorktreeImporter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorktreeImporter } from './worktree-importer.mjs';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

vi.mock('child_process');
vi.mock('fs');

describe('WorktreeImporter', () => {
  let importer;
  let mockPortRegistry;
  let mockRuntime;

  beforeEach(() => {
    mockPortRegistry = {
      ports: {},
      allocate: vi.fn((wt, svc, port) => port),
      getWorktreePorts: vi.fn(() => ({}))
    };

    mockRuntime = {
      getComposeCommand: vi.fn(() => 'docker compose'),
      getRuntime: vi.fn(() => 'docker')
    };

    importer = new WorktreeImporter('/repo', mockPortRegistry, mockRuntime);
  });

  describe('discoverUnmanaged', () => {
    it('should discover unmanaged worktrees', () => {
      // Mock git worktree list output
      execSync.mockReturnValue(`
worktree /repo
branch refs/heads/main

worktree /repo/.worktrees/feature-auth
branch refs/heads/feature/auth

worktree /repo/.worktrees/bugfix-login
branch refs/heads/bugfix/login
`);

      // Mock managed worktrees (only feature-auth is managed)
      mockPortRegistry.ports = {
        'feature-auth:api': 3000
      };

      // Mock file system
      existsSync.mockImplementation((path) => {
        return path.includes('feature-auth') || path.includes('bugfix-login');
      });

      readFileSync.mockReturnValue('gitdir: /repo/.git/worktrees/bugfix-login');

      const unmanaged = importer.discoverUnmanaged();

      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0].name).toBe('bugfix-login');
      expect(unmanaged[0].branch).toBe('bugfix/login');
    });

    it('should detect running containers', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git worktree list')) {
          return `
worktree /repo/.worktrees/feature-db
branch refs/heads/feature/db
`;
        }

        if (cmd.includes('ps -a --format json')) {
          return JSON.stringify({
            Name: 'feature-db_postgres_1',
            Service: 'postgres',
            State: 'running',
            Ports: '0.0.0.0:5432->5432/tcp'
          });
        }

        return '';
      });

      mockPortRegistry.ports = {};
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: /repo/.git/worktrees/feature-db');

      const unmanaged = importer.discoverUnmanaged();

      expect(unmanaged[0].runningContainers).toHaveLength(1);
      expect(unmanaged[0].runningContainers[0].service).toBe('postgres');
      expect(unmanaged[0].runningContainers[0].port).toBe(5432);
    });

    it('should mark worktrees with issues as not importable', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git worktree list')) {
          return `
worktree /repo/.worktrees/broken
branch refs/heads/broken-branch
`;
        }

        if (cmd.includes('git rev-parse --verify')) {
          throw new Error('Branch does not exist');
        }

        return '';
      });

      mockPortRegistry.ports = {};
      existsSync.mockReturnValue(false); // Path doesn't exist

      const unmanaged = importer.discoverUnmanaged();

      expect(unmanaged[0].canImport).toBe(false);
      expect(unmanaged[0].issues).toContain('Path does not exist');
    });
  });

  describe('importWorktree', () => {
    it('should import worktree and allocate ports for running containers', async () => {
      // Setup unmanaged worktree
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git worktree list')) {
          return `
worktree /repo/.worktrees/feature-api
branch refs/heads/feature/api
`;
        }

        if (cmd.includes('ps -a --format json')) {
          return JSON.stringify({
            Name: 'feature-api_api_1',
            Service: 'api',
            State: 'running',
            Ports: '0.0.0.0:3000->3000/tcp'
          }) + '\n' + JSON.stringify({
            Name: 'feature-api_postgres_1',
            Service: 'postgres',
            State: 'running',
            Ports: '0.0.0.0:5432->5432/tcp'
          });
        }

        return '';
      });

      mockPortRegistry.ports = {};
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: /repo/.git/worktrees/feature-api');

      const result = await importer.importWorktree('feature-api');

      expect(result.name).toBe('feature-api');
      expect(result.branch).toBe('feature/api');
      expect(result.ports).toHaveProperty('api', 3000);
      expect(result.ports).toHaveProperty('postgres', 5432);
      expect(result.containers).toHaveLength(2);
    });

    it('should throw error if worktree not found', async () => {
      execSync.mockReturnValue('');
      mockPortRegistry.ports = {};

      await expect(importer.importWorktree('nonexistent'))
        .rejects
        .toThrow('Worktree "nonexistent" not found or already managed');
    });

    it('should throw error if worktree cannot be imported', async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('git worktree list')) {
          return `
worktree /repo/.worktrees/broken
branch refs/heads/broken
`;
        }
        return '';
      });

      mockPortRegistry.ports = {};
      existsSync.mockReturnValue(false); // Path doesn't exist

      await expect(importer.importWorktree('broken'))
        .rejects
        .toThrow('Cannot import worktree "broken"');
    });
  });

  describe('getAllWorktrees', () => {
    it('should categorize worktrees as managed and unmanaged', () => {
      execSync.mockReturnValue(`
worktree /repo
branch refs/heads/main

worktree /repo/.worktrees/feature-1
branch refs/heads/feature-1

worktree /repo/.worktrees/feature-2
branch refs/heads/feature-2
`);

      mockPortRegistry.ports = {
        'feature-1:api': 3000
      };

      mockPortRegistry.getWorktreePorts.mockReturnValue({ api: 3000 });

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('gitdir: ...');

      const result = importer.getAllWorktrees();

      expect(result.total).toBe(2);
      expect(result.managed).toHaveLength(1);
      expect(result.unmanaged).toHaveLength(1);
      expect(result.managed[0].name).toBe('feature-1');
      expect(result.unmanaged[0].name).toBe('feature-2');
    });
  });
});
