/**
 * Tests for BranchManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BranchManager } from './branch-manager.mjs';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('BranchManager', () => {
  let manager;
  const mockRepoPath = '/mock/repo';

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BranchManager(mockRepoPath);
  });

  describe('constructor', () => {
    it('should initialize with repo path', () => {
      expect(manager.repoPath).toBe(mockRepoPath);
      expect(manager.remoteName).toBe('origin');
    });

    it('should accept custom remote name', () => {
      const customManager = new BranchManager(mockRepoPath, { remoteName: 'upstream' });
      expect(customManager.remoteName).toBe('upstream');
    });
  });

  describe('refreshFromRemote', () => {
    it('should execute git fetch with prune', async () => {
      execSync.mockReturnValue('');

      await manager.refreshFromRemote();

      expect(execSync).toHaveBeenCalledWith(
        'git fetch origin --prune',
        expect.objectContaining({
          cwd: mockRepoPath,
          encoding: 'utf-8',
          stdio: 'pipe'
        })
      );
    });

    it('should use custom remote name', async () => {
      const customManager = new BranchManager(mockRepoPath, { remoteName: 'upstream' });
      execSync.mockReturnValue('');

      await customManager.refreshFromRemote();

      expect(execSync).toHaveBeenCalledWith(
        'git fetch upstream --prune',
        expect.any(Object)
      );
    });

    it('should throw error on fetch failure', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      await expect(manager.refreshFromRemote()).rejects.toThrow('Failed to refresh branches from origin');
    });
  });

  describe('getCachedRemoteBranches', () => {
    it('should list cached remote branches', () => {
      execSync.mockReturnValue('origin/feature-a\norigin/feature-b\norigin/main\n');

      const branches = manager.getCachedRemoteBranches();

      expect(branches).toEqual([
        { name: 'origin/feature-a' },
        { name: 'origin/feature-b' },
        { name: 'origin/main' }
      ]);
    });

    it('should filter out HEAD references', () => {
      execSync.mockReturnValue('origin/main\norigin/HEAD -> origin/main\norigin/feature-a\n');

      const branches = manager.getCachedRemoteBranches();

      expect(branches).toEqual([
        { name: 'origin/main' },
        { name: 'origin/feature-a' }
      ]);
    });

    it('should filter out bare remote name entries', () => {
      // git branch -r --format can output just "origin" for origin/HEAD
      execSync.mockReturnValue('origin\norigin/feature-a\norigin/main\n');

      const branches = manager.getCachedRemoteBranches();

      expect(branches).toEqual([
        { name: 'origin/feature-a' },
        { name: 'origin/main' }
      ]);
    });

    it('should filter out entries without slashes', () => {
      execSync.mockReturnValue('invalid\norigin/feature-a\n');

      const branches = manager.getCachedRemoteBranches();

      expect(branches).toEqual([
        { name: 'origin/feature-a' }
      ]);
    });

    it('should return empty array on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const branches = manager.getCachedRemoteBranches();

      expect(branches).toEqual([]);
    });
  });

  describe('getLocalBranches', () => {
    it('should list local branches', () => {
      execSync.mockReturnValue('main\nfeature-a\nfeature-b\n');

      const branches = manager.getLocalBranches();

      expect(branches).toEqual([
        { name: 'main' },
        { name: 'feature-a' },
        { name: 'feature-b' }
      ]);
    });

    it('should handle empty output', () => {
      execSync.mockReturnValue('');

      const branches = manager.getLocalBranches();

      expect(branches).toEqual([]);
    });

    it('should return empty array on error', () => {
      execSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      const branches = manager.getLocalBranches();

      expect(branches).toEqual([]);
    });
  });

  describe('listAvailableBranches', () => {
    beforeEach(() => {
      // Mock worktree list
      execSync.mockImplementation((cmd) => {
        if (cmd === 'git worktree list --porcelain') {
          return 'worktree /repo\nbranch refs/heads/main\n\nworktree /repo/.worktrees/feature-a\nbranch refs/heads/feature-a\n\n';
        }
        if (cmd === 'git branch --format="%(refname:short)"') {
          return 'main\nfeature-a\nfeature-b\n';
        }
        if (cmd === 'git branch -r --format="%(refname:short)"') {
          return 'origin/main\norigin/feature-a\norigin/feature-c\n';
        }
        if (cmd.startsWith('git log -1')) {
          return 'abc123|Test commit|John Doe|2024-01-01 12:00:00\n';
        }
        if (cmd.startsWith('git rev-parse --verify main')) {
          return '';
        }
        if (cmd.startsWith('git config branch.')) {
          return 'refs/heads/feature-a\n';
        }
        return '';
      });
    });

    it('should mark base branch as unavailable', async () => {
      const branches = await manager.listAvailableBranches();

      const mainBranch = branches.local.find(b => b.name === 'main');
      expect(mainBranch).toMatchObject({
        type: 'base',
        available: false,
        reason: 'Base branch'
      });
    });

    it('should mark branches in use by worktrees as unavailable', async () => {
      const branches = await manager.listAvailableBranches();

      const featureA = branches.local.find(b => b.name === 'feature-a');
      expect(featureA).toMatchObject({
        available: false,
        reason: 'In worktree: feature-a'
      });
    });

    it('should mark unused local branches as available', async () => {
      const branches = await manager.listAvailableBranches();

      const featureB = branches.local.find(b => b.name === 'feature-b');
      expect(featureB).toMatchObject({
        available: true,
        reason: null
      });
    });

    it('should mark tracked remote branches as unavailable', async () => {
      const branches = await manager.listAvailableBranches();

      const remoteFeatureA = branches.remote.find(b => b.name === 'origin/feature-a');
      expect(remoteFeatureA).toMatchObject({
        available: false,
        reason: 'Tracked by local branch: feature-a',
        tracked: true
      });
    });

    it('should mark untracked remote branches as available', async () => {
      const branches = await manager.listAvailableBranches();

      const remoteFeatureC = branches.remote.find(b => b.name === 'origin/feature-c');
      expect(remoteFeatureC).toMatchObject({
        available: true,
        tracked: false
      });
    });

    it('should include commit information', async () => {
      const branches = await manager.listAvailableBranches();

      expect(branches.local[0].lastCommit).toMatchObject({
        hash: 'abc123',
        message: 'Test commit',
        author: 'John Doe',
        date: '2024-01-01 12:00:00'
      });
    });
  });

  describe('getBaseBranch', () => {
    it('should return main if it exists', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --verify main') {
          return '';
        }
        throw new Error('Not found');
      });

      const base = manager.getBaseBranch();

      expect(base).toBe('main');
    });

    it('should return master if main does not exist', () => {
      execSync.mockImplementation((cmd) => {
        if (cmd === 'git rev-parse --verify main') {
          throw new Error('Not found');
        }
        if (cmd === 'git rev-parse --verify master') {
          return '';
        }
        throw new Error('Not found');
      });

      const base = manager.getBaseBranch();

      expect(base).toBe('master');
    });

    it('should default to main if neither exists', () => {
      execSync.mockImplementation(() => {
        throw new Error('Not found');
      });

      const base = manager.getBaseBranch();

      expect(base).toBe('main');
    });
  });
});
