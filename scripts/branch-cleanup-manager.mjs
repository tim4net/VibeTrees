/**
 * Branch Cleanup Manager
 *
 * Manages branch deletion when worktrees are removed
 * Provides safety checks for merged/unmerged branches
 */

import { execSync } from 'child_process';

export class BranchCleanupManager {
  /**
   * @param {string} repoPath - Path to git repository
   */
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * Check if branch is safe to delete
   * @param {string} branchName - Name of the branch
   * @returns {Promise<Object>} Branch status information
   */
  async getBranchStatus(branchName) {
    // Check if branch is merged
    const isMerged = await this.isBranchMerged(branchName);

    // Check if branch exists on remote
    const existsOnRemote = await this.branchExistsOnRemote(branchName);

    // Check if this is base branch
    const isBaseBranch = await this.isBaseBranch(branchName);

    // Get unmerged commit count
    const unmergedCommits = isMerged ? 0 : await this.getUnmergedCommitCount(branchName);

    return {
      branchName,
      isMerged,
      existsOnRemote,
      isBaseBranch,
      unmergedCommits,
      safeToDelete: isMerged && !isBaseBranch
    };
  }

  /**
   * Check if branch is merged into base branch
   * @param {string} branchName - Name of the branch
   */
  async isBranchMerged(branchName) {
    try {
      // Get base branch
      const baseBranch = await this.getBaseBranch();

      // Check if branch is merged into base
      const result = execSync(
        `git branch --merged ${baseBranch}`,
        { cwd: this.repoPath, encoding: 'utf-8' }
      );

      return result.split('\n').some(line =>
        line.trim() === branchName || line.trim() === `* ${branchName}`
      );
    } catch (error) {
      console.error('Error checking if branch is merged:', error);
      return false;
    }
  }

  /**
   * Check if branch exists on remote
   * @param {string} branchName - Name of the branch
   */
  async branchExistsOnRemote(branchName) {
    try {
      execSync(
        `git ls-remote --heads origin ${branchName}`,
        { cwd: this.repoPath, stdio: 'pipe' }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if this is the base branch
   * @param {string} branchName - Name of the branch
   */
  async isBaseBranch(branchName) {
    const baseBranch = await this.getBaseBranch();
    return branchName === baseBranch;
  }

  /**
   * Get base branch (main or master)
   */
  async getBaseBranch() {
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
   * Get count of unmerged commits
   * @param {string} branchName - Name of the branch
   */
  async getUnmergedCommitCount(branchName) {
    try {
      const baseBranch = await this.getBaseBranch();
      const result = execSync(
        `git rev-list --count ${baseBranch}..${branchName}`,
        { cwd: this.repoPath, encoding: 'utf-8' }
      );
      return parseInt(result.trim(), 10);
    } catch {
      return 0;
    }
  }

  /**
   * Delete branch locally and optionally on remote
   * @param {string} branchName - Name of the branch
   * @param {Object} options - Deletion options
   * @param {boolean} options.deleteLocal - Delete local branch
   * @param {boolean} options.deleteRemote - Delete remote branch
   * @param {boolean} options.force - Force deletion (unmerged branches)
   * @returns {Promise<Object>} Deletion results
   */
  async deleteBranch(branchName, options = {}) {
    const {
      deleteLocal = true,
      deleteRemote = true,
      force = false
    } = options;

    const results = {
      local: null,
      remote: null,
      errors: []
    };

    // Delete local branch
    if (deleteLocal) {
      try {
        const flag = force ? '-D' : '-d';
        execSync(
          `git branch ${flag} ${branchName}`,
          { cwd: this.repoPath, encoding: 'utf-8' }
        );
        results.local = 'deleted';
      } catch (error) {
        results.errors.push(`Failed to delete local branch: ${error.message}`);
        results.local = 'failed';
      }
    }

    // Delete remote branch
    if (deleteRemote) {
      const existsOnRemote = await this.branchExistsOnRemote(branchName);

      if (existsOnRemote) {
        try {
          // Try gh CLI first (preferred for GitHub)
          await this.deleteRemoteBranchViaGH(branchName);
          results.remote = 'deleted';
        } catch (ghError) {
          // Fallback to git push
          try {
            execSync(
              `git push origin --delete ${branchName}`,
              { cwd: this.repoPath, encoding: 'utf-8' }
            );
            results.remote = 'deleted';
          } catch (gitError) {
            results.errors.push(`Failed to delete remote branch: ${gitError.message}`);
            results.remote = 'failed';
          }
        }
      } else {
        results.remote = 'not-found';
      }
    }

    return results;
  }

  /**
   * Delete remote branch via GitHub CLI
   * @private
   * @param {string} branchName - Name of the branch
   */
  async deleteRemoteBranchViaGH(branchName) {
    // Check if gh CLI is available
    try {
      execSync('which gh', { stdio: 'ignore' });
    } catch {
      throw new Error('gh CLI not available');
    }

    // Get repo info
    const remote = execSync('git remote get-url origin', {
      cwd: this.repoPath,
      encoding: 'utf-8'
    }).trim();

    // Parse owner/repo from remote URL
    // e.g., git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (!match) {
      throw new Error('Could not parse GitHub repo from remote');
    }

    const [, owner, repo] = match;

    // Delete via GitHub API
    execSync(
      `gh api -X DELETE /repos/${owner}/${repo}/git/refs/heads/${branchName}`,
      { cwd: this.repoPath, encoding: 'utf-8' }
    );
  }
}
