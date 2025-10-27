# Branch Cleanup on Worktree Deletion

**Feature**: Option to delete branch when closing/deleting worktree
**Status**: Design Proposal
**Date**: 2025-10-27
**Phase**: 2 or 3 (UI Enhancement)

---

## Problem Statement

When users finish working on a feature and delete the worktree, the branch remains:
- Local branch still exists
- Remote branch (on GitHub) still exists
- Clutters branch list over time
- Manual cleanup required

**Current Workflow**:
1. Merge PR on GitHub
2. Delete worktree in vibe-worktrees
3. Manually run `git branch -d feature/my-feature`
4. Manually run `git push origin --delete feature/my-feature`
5. Or delete on GitHub web UI

**Pain Points**:
- 4 separate steps (should be 2)
- Easy to forget branch cleanup
- Branches accumulate over time
- Have to switch to terminal or GitHub

---

## Solution: Integrated Branch Cleanup

Add checkbox to worktree deletion dialog: **"Also delete branch"**

### Smart Behavior

**If branch is merged**:
```
┌─────────────────────────────────────────────┐
│ Delete Worktree: feature-auth               │
├─────────────────────────────────────────────┤
│ ⚠️  This will permanently delete:           │
│   • Worktree directory                      │
│   • Running containers                      │
│   • Uncommitted changes (if any)           │
│                                             │
│ ✅ Branch is merged into main               │
│                                             │
│ [✓] Also delete branch                     │
│     ├─ [✓] Delete local branch             │
│     └─ [✓] Delete on GitHub                │
│                                             │
│ [ Cancel ]  [ Delete Worktree ]            │
└─────────────────────────────────────────────┘
```

**If branch is NOT merged**:
```
┌─────────────────────────────────────────────┐
│ Delete Worktree: feature-auth               │
├─────────────────────────────────────────────┤
│ ⚠️  This will permanently delete:           │
│   • Worktree directory                      │
│   • Running containers                      │
│   • Uncommitted changes (if any)           │
│                                             │
│ ⚠️  Branch is NOT merged yet                │
│                                             │
│ [ ] Also delete branch (dangerous!)        │
│     ⚠️  You will lose unmerged work        │
│     ├─ [ ] Delete local branch             │
│     └─ [ ] Delete on GitHub                │
│                                             │
│ [ Cancel ]  [ Delete Worktree ]            │
└─────────────────────────────────────────────┘
```

**If branch doesn't exist on GitHub** (local only):
```
┌─────────────────────────────────────────────┐
│ Delete Worktree: feature-auth               │
├─────────────────────────────────────────────┤
│ ⚠️  This will permanently delete:           │
│   • Worktree directory                      │
│   • Running containers                      │
│                                             │
│ [✓] Also delete local branch               │
│     (Branch not pushed to GitHub)           │
│                                             │
│ [ Cancel ]  [ Delete Worktree ]            │
└─────────────────────────────────────────────┘
```

---

## User Flows

### Flow 1: Happy Path (Branch Merged)

```
User clicks "Delete" on worktree card
  ↓
Modal opens with branch status check
  ↓
System detects: "Branch merged into main"
  ↓
Checkbox pre-checked: "Also delete branch"
  ↓
User clicks "Delete Worktree"
  ↓
System executes:
  1. Stop containers
  2. Delete worktree directory
  3. Delete local branch: git branch -d feature/auth
  4. Delete remote branch: gh api DELETE /repos/{owner}/{repo}/git/refs/heads/feature/auth
  ↓
Success message: "Worktree and branch deleted"
```

### Flow 2: Unmerged Branch (User Insists)

```
User clicks "Delete" on worktree card
  ↓
Modal opens with warning: "Branch NOT merged"
  ↓
Checkbox unchecked by default
  ↓
User checks "Also delete branch"
  ↓
Warning appears: "You will lose unmerged work"
  ↓
User clicks "Delete Worktree"
  ↓
Additional confirmation: "Are you sure? This branch has unmerged commits."
  ↓
User confirms
  ↓
System uses force delete: git branch -D feature/auth
```

### Flow 3: Main Branch (Prevent Deletion)

```
User tries to delete worktree on main branch
  ↓
Modal shows error: "Cannot delete base branch"
  ↓
Checkbox disabled and grayed out
  ↓
Only option: Delete worktree, keep branch
```

---

## Implementation

### Backend: Branch Deletion Manager

```javascript
// scripts/branch-cleanup-manager.mjs

import { execSync } from 'node:child_process';

export class BranchCleanupManager {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * Check if branch is safe to delete
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

  async isBaseBranch(branchName) {
    const baseBranch = await this.getBaseBranch();
    return branchName === baseBranch;
  }

  async getBaseBranch() {
    try {
      execSync('git rev-parse --verify main', {
        cwd: this.repoPath,
        stdio: 'ignore'
      });
      return 'main';
    } catch {
      return 'master';
    }
  }

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
```

### API Endpoint

```javascript
// scripts/worktree-web/server.mjs

// Get branch status before deletion
app.get('/api/worktrees/:name/branch-status', async (req, res) => {
  try {
    const { name } = req.params;
    const worktree = await worktreeRegistry.get(name);

    if (!worktree) {
      return res.status(404).json({ error: 'Worktree not found' });
    }

    const branchManager = new BranchCleanupManager(worktree.path);
    const status = await branchManager.getBranchStatus(worktree.branch);

    res.json(status);
  } catch (error) {
    console.error('Failed to get branch status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete worktree with optional branch deletion
app.delete('/api/worktrees/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { deleteBranch, deleteLocal, deleteRemote, force } = req.body;

    const worktree = await worktreeRegistry.get(name);

    if (!worktree) {
      return res.status(404).json({ error: 'Worktree not found' });
    }

    // Stop containers
    await containerManager.stop(worktree);

    // Delete worktree directory
    await worktreeManager.delete(name);

    // Optionally delete branch
    let branchDeletion = null;
    if (deleteBranch) {
      const branchManager = new BranchCleanupManager(worktree.path);
      branchDeletion = await branchManager.deleteBranch(worktree.branch, {
        deleteLocal,
        deleteRemote,
        force
      });
    }

    res.json({
      success: true,
      worktree: name,
      branchDeletion
    });
  } catch (error) {
    console.error('Failed to delete worktree:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Frontend UI

```javascript
// scripts/worktree-web/public/js/worktree-actions.js

async function confirmDeleteWorktree(worktreeName) {
  // Fetch branch status
  const response = await fetch(`/api/worktrees/${worktreeName}/branch-status`);
  const branchStatus = await response.json();

  // Build modal content based on status
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Delete Worktree: ${worktreeName}</h2>
      </div>

      <div class="modal-body">
        <div class="warning-box">
          <strong>⚠️  This will permanently delete:</strong>
          <ul>
            <li>Worktree directory</li>
            <li>Running containers</li>
            <li>Uncommitted changes (if any)</li>
          </ul>
        </div>

        ${renderBranchStatus(branchStatus)}

        ${renderBranchDeletionOptions(branchStatus)}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-danger" onclick="executeDelete('${worktreeName}')">
          Delete Worktree
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function renderBranchStatus(status) {
  if (status.isBaseBranch) {
    return `
      <div class="info-box info">
        <strong>ℹ️  Base branch (${status.branchName})</strong>
        <p>This branch will be preserved.</p>
      </div>
    `;
  }

  if (status.isMerged) {
    return `
      <div class="info-box success">
        <strong>✅ Branch is merged into ${status.baseBranch || 'main'}</strong>
        <p>Safe to delete.</p>
      </div>
    `;
  }

  return `
    <div class="info-box warning">
      <strong>⚠️  Branch is NOT merged</strong>
      <p>This branch has ${status.unmergedCommits} unmerged commit(s).</p>
    </div>
  `;
}

function renderBranchDeletionOptions(status) {
  // Base branch - no deletion options
  if (status.isBaseBranch) {
    return '';
  }

  // Merged branch - pre-checked
  const checked = status.isMerged ? 'checked' : '';
  const warningClass = status.isMerged ? '' : 'warning';

  return `
    <div class="branch-deletion-options ${warningClass}">
      <label>
        <input
          type="checkbox"
          id="delete-branch-checkbox"
          ${checked}
          onchange="toggleBranchDeletionDetails()"
        >
        Also delete branch
        ${!status.isMerged ? '<span class="badge-danger">dangerous!</span>' : ''}
      </label>

      <div id="branch-deletion-details" style="display: ${checked ? 'block' : 'none'}; margin-left: 25px;">
        ${!status.isMerged ? `
          <div class="warning-text">
            ⚠️  You will lose unmerged work
          </div>
        ` : ''}

        <label>
          <input type="checkbox" id="delete-local" checked>
          Delete local branch
        </label>

        ${status.existsOnRemote ? `
          <label>
            <input type="checkbox" id="delete-remote" checked>
            Delete on GitHub
          </label>
        ` : `
          <p class="info-text">(Branch not pushed to GitHub)</p>
        `}
      </div>
    </div>
  `;
}

function toggleBranchDeletionDetails() {
  const checkbox = document.getElementById('delete-branch-checkbox');
  const details = document.getElementById('branch-deletion-details');
  details.style.display = checkbox.checked ? 'block' : 'none';
}

async function executeDelete(worktreeName) {
  const deleteBranch = document.getElementById('delete-branch-checkbox')?.checked || false;
  const deleteLocal = document.getElementById('delete-local')?.checked || false;
  const deleteRemote = document.getElementById('delete-remote')?.checked || false;

  // Additional confirmation for unmerged branches
  if (deleteBranch && !branchStatus.isMerged) {
    const confirmed = confirm(
      'Are you sure? This branch has unmerged commits. ' +
      'Deleting it will permanently lose your work.'
    );
    if (!confirmed) return;
  }

  try {
    const response = await fetch(`/api/worktrees/${worktreeName}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleteBranch,
        deleteLocal,
        deleteRemote,
        force: !branchStatus.isMerged
      })
    });

    if (!response.ok) {
      throw new Error('Failed to delete worktree');
    }

    const result = await response.json();

    // Show success message
    if (result.branchDeletion) {
      const messages = [];
      if (result.branchDeletion.local === 'deleted') {
        messages.push('Local branch deleted');
      }
      if (result.branchDeletion.remote === 'deleted') {
        messages.push('Remote branch deleted');
      }
      if (result.branchDeletion.errors.length > 0) {
        messages.push('Errors: ' + result.branchDeletion.errors.join(', '));
      }

      showNotification('Worktree deleted. ' + messages.join('. '), 'success');
    } else {
      showNotification('Worktree deleted', 'success');
    }

    // Refresh worktree list
    await refreshWorktrees();

    closeModal();
  } catch (error) {
    console.error('Delete failed:', error);
    showNotification('Failed to delete worktree: ' + error.message, 'error');
  }
}
```

### CSS Styling

```css
/* Branch deletion options */
.branch-deletion-options {
  margin: 15px 0;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f9f9f9;
}

.branch-deletion-options.warning {
  background: #fff3cd;
  border-color: #ffc107;
}

.branch-deletion-options label {
  display: block;
  margin: 8px 0;
  cursor: pointer;
}

.branch-deletion-options input[type="checkbox"] {
  margin-right: 8px;
}

.badge-danger {
  background: #f44336;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85em;
  margin-left: 5px;
}

.warning-text {
  color: #d32f2f;
  font-weight: 600;
  margin: 10px 0;
}

.info-text {
  color: #666;
  font-size: 0.9em;
  font-style: italic;
}

/* Info boxes */
.info-box {
  padding: 12px;
  border-radius: 4px;
  margin: 15px 0;
  border-left: 4px solid;
}

.info-box.success {
  background: #e8f5e9;
  border-color: #4caf50;
}

.info-box.warning {
  background: #fff3cd;
  border-color: #ffc107;
}

.info-box.info {
  background: #e3f2fd;
  border-color: #2196f3;
}

.info-box strong {
  display: block;
  margin-bottom: 5px;
}

.info-box p {
  margin: 5px 0 0 0;
  font-size: 0.95em;
}
```

---

## Safety Features

### 1. Base Branch Protection
```javascript
if (status.isBaseBranch) {
  // Disable branch deletion checkbox
  // Show info: "Base branch will be preserved"
  // Only allow worktree deletion
}
```

### 2. Unmerged Commit Warning
```javascript
if (!status.isMerged && status.unmergedCommits > 0) {
  // Uncheck checkbox by default
  // Show warning badge
  // Require additional confirmation
}
```

### 3. Double Confirmation for Dangerous Deletes
```javascript
if (deleteBranch && !isMerged) {
  const confirmed = confirm(
    'Are you sure? This branch has 5 unmerged commits. ' +
    'Deleting it will permanently lose your work.'
  );
  if (!confirmed) return;
}
```

### 4. Graceful Degradation
```javascript
// If gh CLI not available, fallback to git commands
// If GitHub API fails, still delete local branch
// Show partial success messages
```

---

## Testing Strategy

### Unit Tests

```javascript
// tests/branch-cleanup-manager.test.js

describe('BranchCleanupManager', () => {
  it('detects merged branches', async () => {
    const manager = new BranchCleanupManager('/test/repo');
    const status = await manager.getBranchStatus('feature/completed');
    expect(status.isMerged).toBe(true);
  });

  it('detects unmerged branches', async () => {
    const status = await manager.getBranchStatus('feature/wip');
    expect(status.isMerged).toBe(false);
    expect(status.unmergedCommits).toBeGreaterThan(0);
  });

  it('prevents base branch deletion', async () => {
    const status = await manager.getBranchStatus('main');
    expect(status.isBaseBranch).toBe(true);
    expect(status.safeToDelete).toBe(false);
  });

  it('deletes branch locally', async () => {
    const result = await manager.deleteBranch('feature/test', {
      deleteLocal: true,
      deleteRemote: false
    });
    expect(result.local).toBe('deleted');
  });

  it('deletes branch on GitHub', async () => {
    const result = await manager.deleteBranch('feature/test', {
      deleteLocal: false,
      deleteRemote: true
    });
    expect(result.remote).toBe('deleted');
  });
});
```

### Integration Tests

```javascript
// tests/worktree-deletion.integration.test.js

describe('Worktree Deletion with Branch Cleanup', () => {
  it('deletes worktree and branch (merged)', async () => {
    // Create worktree
    await createWorktree('feature-test', 'feature/test');

    // Merge branch
    await mergeBranch('feature/test');

    // Delete with branch cleanup
    const result = await deleteWorktree('feature-test', {
      deleteBranch: true
    });

    expect(result.success).toBe(true);
    expect(result.branchDeletion.local).toBe('deleted');
    expect(result.branchDeletion.remote).toBe('deleted');

    // Verify branch is gone
    expect(branchExists('feature/test')).toBe(false);
  });

  it('requires force for unmerged branch', async () => {
    await createWorktree('feature-test', 'feature/test');

    // Don't merge, just delete
    const result = await deleteWorktree('feature-test', {
      deleteBranch: true,
      force: false
    });

    // Should fail without force
    expect(result.branchDeletion.errors.length).toBeGreaterThan(0);
  });
});
```

---

## Configuration

Add to `.vibe/config.json`:

```json
{
  "deletion": {
    "defaultDeleteBranch": false,  // Auto-check checkbox?
    "requireConfirmation": true,   // Always confirm dangerous deletes
    "deleteMethod": "gh",          // "gh", "git", or "auto"
    "preserveBaseBranch": true     // Never allow base branch deletion
  }
}
```

---

## Success Metrics

- ✅ Users can delete branch in one action (not 4 steps)
- ✅ Base branches protected from accidental deletion
- ✅ Unmerged branches require extra confirmation
- ✅ Works with both GitHub and GitLab (via fallback)
- ✅ Clear status indicators (merged/unmerged)
- ✅ Graceful degradation if GitHub API unavailable

---

## Future Enhancements

### V2 Features
- [ ] **Batch deletion**: Delete multiple worktrees + branches at once
- [ ] **Archive instead of delete**: Keep branch in archive for 30 days
- [ ] **GitLab support**: Use GitLab API for branch deletion
- [ ] **Bitbucket support**: Use Bitbucket API
- [ ] **Undo deletion**: Restore branch from reflog within 30 days
- [ ] **Branch analytics**: Show branch age, last activity before deletion
- [ ] **Auto-cleanup**: Automatically delete merged branches after N days

---

## Alternative Designs

### Option 2: Separate "Cleanup" Button

Instead of checkbox in delete dialog, add separate button:

```
┌────────────────────────────────────┐
│ feature-auth                       │
│ ✅ Branch merged                   │
│ [ Delete ] [ Cleanup Branch ]     │
└────────────────────────────────────┘
```

**Pros**: Clear separation of concerns
**Cons**: Extra click, less intuitive

### Option 3: Auto-cleanup Merged Branches

Automatically delete merged branches after worktree deletion:

**Pros**: Zero configuration, always clean
**Cons**: No user control, might delete wanted branches

---

**Recommendation**: Option 1 (Checkbox in delete dialog) provides best balance of control and convenience.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Status**: Design Proposal - Awaiting Approval
**Estimated Effort**: 3-4 days
