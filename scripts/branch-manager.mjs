/**
 * Branch Manager
 *
 * Manages git branches for worktree creation
 * Provides branch discovery, filtering, and availability status
 */

import { execSync } from 'child_process';

export class BranchManager {
  /**
   * @param {string} repoPath - Path to git repository
   */
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * List all available branches with metadata and availability status
   * @returns {Promise<Object>} { local: [...], remote: [...] }
   */
  async listAvailableBranches() {
    // Get all worktrees and their branches
    const worktrees = this.listWorktrees();
    const usedBranches = new Set(worktrees.map(w => w.branch).filter(Boolean));

    // Get base branch
    const baseBranch = this.getBaseBranch();

    // List local branches
    const localBranches = this.getLocalBranches();
    const local = localBranches.map(branch => {
      const isBase = branch.name === baseBranch;
      const isUsed = usedBranches.has(branch.name);
      const worktree = isUsed ? this.findWorktreeForBranch(worktrees, branch.name) : null;

      return {
        name: branch.name,
        type: isBase ? 'base' : 'local',
        available: !isBase && !isUsed,
        reason: isBase ? 'Base branch' : (isUsed ? `In worktree: ${worktree}` : null),
        worktree: isUsed ? worktree : null,
        lastCommit: this.getLastCommit(branch.name)
      };
    });

    // List remote branches
    const remoteBranches = this.getRemoteBranches();
    const remote = remoteBranches.map(branch => {
      const localTracking = this.findLocalTrackingBranch(branch.name, localBranches);
      const isTracked = localTracking !== null;
      const isUsed = isTracked && usedBranches.has(localTracking);

      return {
        name: branch.name,
        type: 'remote',
        available: !isTracked,
        reason: isTracked ? `Tracked by local branch: ${localTracking}` : null,
        tracked: isTracked,
        localBranch: localTracking,
        lastCommit: this.getLastCommit(branch.name)
      };
    });

    return { local, remote };
  }

  /**
   * Get all worktrees
   * @private
   * @returns {Array<{path: string, branch: string, name: string}>}
   */
  listWorktrees() {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      });

      const worktrees = [];
      const lines = output.split('\n');
      let current = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring('branch '.length).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path) {
            current.name = current.branch || 'main';
            worktrees.push(current);
            current = {};
          }
        }
      }

      if (current.path) {
        current.name = current.branch || 'main';
        worktrees.push(current);
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to list worktrees:', error.message);
      return [];
    }
  }

  /**
   * Get all local branches
   * @private
   */
  getLocalBranches() {
    try {
      const output = execSync('git branch --format="%(refname:short)"', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      });

      return output
        .split('\n')
        .filter(Boolean)
        .map(name => ({ name: name.trim() }));
    } catch (error) {
      console.error('Failed to list local branches:', error.message);
      return [];
    }
  }

  /**
   * Get all remote branches
   * @private
   */
  getRemoteBranches() {
    try {
      const output = execSync('git branch -r --format="%(refname:short)"', {
        cwd: this.repoPath,
        encoding: 'utf-8'
      });

      return output
        .split('\n')
        .filter(Boolean)
        .filter(name => !name.includes('HEAD'))
        .map(name => ({ name: name.trim() }));
    } catch (error) {
      console.error('Failed to list remote branches:', error.message);
      return [];
    }
  }

  /**
   * Get last commit info for a branch
   * @private
   */
  getLastCommit(branch) {
    try {
      const output = execSync(
        `git log -1 --format="%H|%s|%an|%ai" ${branch}`,
        { cwd: this.repoPath, encoding: 'utf-8' }
      );

      const [hash, message, author, date] = output.trim().split('|');
      return { hash, message, author, date };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get base branch (main or master)
   * @private
   */
  getBaseBranch() {
    try {
      execSync('git rev-parse --verify main', {
        cwd: this.repoPath,
        stdio: 'ignore'
      });
      return 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', {
          cwd: this.repoPath,
          stdio: 'ignore'
        });
        return 'master';
      } catch {
        return 'main'; // Default fallback
      }
    }
  }

  /**
   * Find worktree name for a given branch
   * @private
   */
  findWorktreeForBranch(worktrees, branchName) {
    const wt = worktrees.find(w => w.branch === branchName);
    return wt ? wt.name : null;
  }

  /**
   * Find local branch tracking a remote branch
   * @private
   */
  findLocalTrackingBranch(remoteBranch, localBranches) {
    // Remove origin/ prefix
    const remoteName = remoteBranch.replace(/^origin\//, '');

    // Check if local branch exists with same name
    const local = localBranches.find(b => b.name === remoteName);
    if (!local) return null;

    // Verify it tracks this remote branch
    try {
      const upstream = execSync(
        `git config branch.${remoteName}.merge`,
        { cwd: this.repoPath, encoding: 'utf-8', stdio: 'pipe' }
      ).trim();

      if (upstream === `refs/heads/${remoteName}`) {
        return remoteName;
      }
    } catch {
      // No tracking relationship
    }

    return null;
  }
}
