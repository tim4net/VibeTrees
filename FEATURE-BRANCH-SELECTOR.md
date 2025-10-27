# Branch Selector Feature

**Feature**: Browse and select existing branches when creating worktrees
**Status**: Design Proposal
**Date**: 2025-10-27
**Phase**: 2 (UI Enhancement) or 3 (alongside other UX improvements)

---

## Problem Statement

Currently, users must manually type branch names when creating worktrees. This requires:
- Knowing the exact branch name
- Remembering which branches exist
- Avoiding branches already checked out in other worktrees
- Switching to terminal to run `git branch -a` to see branches

**User Pain Points**:
- "What branches exist?"
- "Is this branch already in a worktree?"
- "Did I spell the branch name correctly?"
- "Is this a local branch or do I need to specify origin/branch-name?"

---

## Solution: Branch Selector UI

Add a branch browser/selector to the worktree creation dialog that:
1. Lists all available branches (local + remote)
2. **Filters out branches already in worktrees**
3. Shows branch metadata (last commit, author, date)
4. Supports search/filtering
5. One-click selection

---

## User Flows

### Flow 1: Create Worktree from Existing Branch

```
User clicks "New Worktree"
  ↓
Dialog shows:
  [Tab: New Branch] [Tab: Existing Branch] ← User clicks this
  ↓
Branch selector appears:
  ┌────────────────────────────────────────────────┐
  │ 🔍 Search branches...                          │
  ├────────────────────────────────────────────────┤
  │ 📁 Local Branches (5)                          │
  │   ✓ main (base branch)                         │
  │   ✓ develop                                    │
  │   • feature/auth (available)                   │
  │   • bugfix/login (available)                   │
  │   ⊗ feature/ui (in worktree: feature-ui)      │
  ├────────────────────────────────────────────────┤
  │ 🌐 Remote Branches (12)                        │
  │   • origin/feature/payments                    │
  │   • origin/feature/notifications               │
  │   ⊗ origin/feature/ui (tracked by local)      │
  │   ...                                          │
  └────────────────────────────────────────────────┘
  ↓
User clicks "feature/auth"
  ↓
Worktree name auto-filled: "feature-auth"
Agent selector: [Claude ▼]
Profile: [Full ▼]
  ↓
User clicks "Create"
  ↓
Worktree created from existing branch
```

### Flow 2: Quick Filter

```
User types in search: "pay"
  ↓
Only matching branches shown:
  • origin/feature/payments
  • origin/bugfix/payment-api
  ↓
User selects and creates
```

---

## UI Design

### Worktree Creation Dialog (Enhanced)

```html
<!-- Modal: Create New Worktree -->
<div class="modal" id="create-worktree-modal">
  <div class="modal-header">
    <h2>Create Worktree</h2>
  </div>

  <div class="modal-body">
    <!-- Tab Selector -->
    <div class="tabs">
      <button class="tab active" data-tab="new-branch">
        New Branch
      </button>
      <button class="tab" data-tab="existing-branch">
        Existing Branch
      </button>
    </div>

    <!-- Tab 1: New Branch (current behavior) -->
    <div id="tab-new-branch" class="tab-content active">
      <label>Branch Name:</label>
      <input type="text" id="new-branch-name" placeholder="feature/my-feature">

      <label>Base Branch:</label>
      <select id="base-branch">
        <option value="main">main</option>
        <option value="develop">develop</option>
      </select>
    </div>

    <!-- Tab 2: Existing Branch (NEW) -->
    <div id="tab-existing-branch" class="tab-content">
      <!-- Search Box -->
      <div class="search-box">
        <input
          type="text"
          id="branch-search"
          placeholder="🔍 Search branches..."
          autocomplete="off"
        >
      </div>

      <!-- Branch List -->
      <div class="branch-list">
        <!-- Local Branches Section -->
        <div class="branch-section">
          <div class="section-header" onclick="toggleSection('local')">
            <span class="toggle-icon">▼</span>
            📁 Local Branches <span class="count">(5)</span>
          </div>
          <div id="local-branches" class="branch-items">
            <!-- Base branch (not selectable) -->
            <div class="branch-item base-branch" title="Base branch">
              <span class="branch-icon">✓</span>
              <span class="branch-name">main</span>
              <span class="branch-badge">base</span>
            </div>

            <!-- Available branch -->
            <div class="branch-item available" onclick="selectBranch('feature/auth')">
              <span class="branch-icon">•</span>
              <span class="branch-name">feature/auth</span>
              <span class="branch-info">
                <span class="commit-msg">Add JWT authentication</span>
                <span class="commit-meta">by tim, 2 days ago</span>
              </span>
            </div>

            <!-- Branch in worktree (not selectable) -->
            <div class="branch-item in-worktree" title="Already in worktree: feature-ui">
              <span class="branch-icon">⊗</span>
              <span class="branch-name">feature/ui</span>
              <span class="branch-badge">in worktree: feature-ui</span>
            </div>
          </div>
        </div>

        <!-- Remote Branches Section -->
        <div class="branch-section">
          <div class="section-header" onclick="toggleSection('remote')">
            <span class="toggle-icon">▼</span>
            🌐 Remote Branches <span class="count">(12)</span>
          </div>
          <div id="remote-branches" class="branch-items collapsed">
            <div class="branch-item available" onclick="selectBranch('origin/feature/payments')">
              <span class="branch-icon">•</span>
              <span class="branch-name">origin/feature/payments</span>
              <span class="branch-info">
                <span class="commit-msg">Implement Stripe integration</span>
                <span class="commit-meta">by alice, 5 days ago</span>
              </span>
            </div>
            <!-- More remote branches... -->
          </div>
        </div>
      </div>

      <!-- Selected Branch Display -->
      <div class="selected-branch" id="selected-branch-display" style="display:none">
        Selected: <strong id="selected-branch-name"></strong>
        <button class="btn-clear" onclick="clearSelection()">✕</button>
      </div>
    </div>

    <!-- Common Fields (shown for both tabs) -->
    <div class="common-fields">
      <label>Worktree Name:</label>
      <input type="text" id="worktree-name" placeholder="Auto-filled from branch">

      <label>AI Agent:</label>
      <select id="agent-selector">
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
        <option value="gemini">Gemini</option>
        <option value="shell">Shell Only</option>
      </select>

      <label>Profile:</label>
      <select id="profile-selector">
        <option value="full">Full Stack</option>
        <option value="light">Light (API + DB)</option>
        <option value="custom">Custom...</option>
      </select>

      <label>
        <input type="checkbox" id="copy-data" checked>
        Copy data from main worktree
      </label>
    </div>
  </div>

  <div class="modal-footer">
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="createWorktree()" id="create-btn" disabled>
      Create Worktree
    </button>
  </div>
</div>
```

### CSS Styling

```css
/* Branch List */
.branch-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin: 10px 0;
}

.branch-section {
  border-bottom: 1px solid #eee;
}

.section-header {
  padding: 10px;
  background: #f5f5f5;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}

.section-header:hover {
  background: #e9e9e9;
}

.toggle-icon {
  display: inline-block;
  transition: transform 0.2s;
}

.section-header.collapsed .toggle-icon {
  transform: rotate(-90deg);
}

.count {
  color: #888;
  font-size: 0.9em;
}

/* Branch Items */
.branch-items {
  padding: 5px 0;
}

.branch-items.collapsed {
  display: none;
}

.branch-item {
  padding: 8px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: background 0.15s;
}

.branch-item.available:hover {
  background: #f0f8ff;
}

.branch-item.selected {
  background: #e3f2fd;
  border-left: 3px solid #2196F3;
}

.branch-item.in-worktree {
  opacity: 0.5;
  cursor: not-allowed;
}

.branch-item.base-branch {
  opacity: 0.6;
  cursor: not-allowed;
}

.branch-icon {
  font-size: 1.2em;
  width: 20px;
  text-align: center;
}

.branch-name {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 0.95em;
}

.branch-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.85em;
}

.commit-msg {
  color: #666;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit-meta {
  color: #999;
  font-size: 0.9em;
}

.branch-badge {
  background: #ff9800;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}

/* Search Box */
.search-box {
  margin-bottom: 10px;
}

.search-box input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-box input:focus {
  outline: none;
  border-color: #2196F3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
}

/* Selected Branch Display */
.selected-branch {
  padding: 10px;
  background: #e3f2fd;
  border-radius: 4px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-clear {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  color: #666;
}

.btn-clear:hover {
  color: #f44336;
}
```

---

## Backend API

### GET `/api/branches`

Returns all branches with metadata and availability status.

**Response**:
```json
{
  "local": [
    {
      "name": "main",
      "type": "base",
      "available": false,
      "reason": "Base branch",
      "lastCommit": {
        "hash": "abc123",
        "message": "Initial commit",
        "author": "tim",
        "date": "2025-10-20T10:00:00Z"
      }
    },
    {
      "name": "feature/auth",
      "type": "local",
      "available": true,
      "lastCommit": {
        "hash": "def456",
        "message": "Add JWT authentication",
        "author": "tim",
        "date": "2025-10-25T14:30:00Z"
      }
    },
    {
      "name": "feature/ui",
      "type": "local",
      "available": false,
      "reason": "In worktree: feature-ui",
      "worktree": "feature-ui",
      "lastCommit": { ... }
    }
  ],
  "remote": [
    {
      "name": "origin/feature/payments",
      "type": "remote",
      "available": true,
      "tracked": false,
      "lastCommit": { ... }
    },
    {
      "name": "origin/feature/ui",
      "type": "remote",
      "available": false,
      "reason": "Tracked by local branch: feature/ui",
      "tracked": true,
      "localBranch": "feature/ui",
      "lastCommit": { ... }
    }
  ]
}
```

### Implementation

```javascript
// scripts/worktree-web/server.mjs

app.get('/api/branches', async (req, res) => {
  try {
    const branches = await branchManager.listAvailableBranches();
    res.json(branches);
  } catch (error) {
    console.error('Failed to list branches:', error);
    res.status(500).json({ error: error.message });
  }
});
```

```javascript
// scripts/branch-manager.mjs

import { execSync } from 'node:child_process';
import { WorktreeRegistry } from './worktree-registry.mjs';

export class BranchManager {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.registry = new WorktreeRegistry();
  }

  async listAvailableBranches() {
    // Get all worktrees and their branches
    const worktrees = await this.registry.list();
    const usedBranches = new Set(worktrees.map(w => w.branch));

    // Get base branch
    const baseBranch = await this.getBaseBranch();

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

  getLocalBranches() {
    const output = execSync('git branch --format="%(refname:short)"', {
      cwd: this.repoPath,
      encoding: 'utf-8'
    });

    return output
      .split('\n')
      .filter(Boolean)
      .map(name => ({ name: name.trim() }));
  }

  getRemoteBranches() {
    const output = execSync('git branch -r --format="%(refname:short)"', {
      cwd: this.repoPath,
      encoding: 'utf-8'
    });

    return output
      .split('\n')
      .filter(Boolean)
      .filter(name => !name.includes('HEAD'))
      .map(name => ({ name: name.trim() }));
  }

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

  async getBaseBranch() {
    // Check for main first, then master
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

  findWorktreeForBranch(worktrees, branchName) {
    const wt = worktrees.find(w => w.branch === branchName);
    return wt ? wt.name : null;
  }

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
```

---

## Frontend JavaScript

```javascript
// scripts/worktree-web/public/js/branch-selector.js

class BranchSelector {
  constructor() {
    this.branches = { local: [], remote: [] };
    this.selectedBranch = null;
    this.searchTerm = '';
  }

  async load() {
    const response = await fetch('/api/branches');
    this.branches = await response.json();
    this.render();
  }

  render() {
    this.renderLocalBranches();
    this.renderRemoteBranches();
  }

  renderLocalBranches() {
    const container = document.getElementById('local-branches');
    const filtered = this.filterBranches(this.branches.local);

    container.innerHTML = filtered.map(branch => {
      const classes = ['branch-item'];

      if (branch.type === 'base') {
        classes.push('base-branch');
      } else if (!branch.available) {
        classes.push('in-worktree');
      } else {
        classes.push('available');
      }

      if (this.selectedBranch === branch.name) {
        classes.push('selected');
      }

      const icon = branch.type === 'base' ? '✓' :
                   branch.available ? '•' : '⊗';

      const badge = branch.reason ?
        `<span class="branch-badge">${branch.reason}</span>` : '';

      const info = branch.lastCommit ? `
        <span class="branch-info">
          <span class="commit-msg">${branch.lastCommit.message}</span>
          <span class="commit-meta">by ${branch.lastCommit.author}, ${this.formatDate(branch.lastCommit.date)}</span>
        </span>
      ` : '';

      const onclick = branch.available ?
        `onclick="branchSelector.selectBranch('${branch.name}')"` : '';

      return `
        <div class="${classes.join(' ')}" ${onclick} title="${branch.reason || ''}">
          <span class="branch-icon">${icon}</span>
          <span class="branch-name">${branch.name}</span>
          ${info}
          ${badge}
        </div>
      `;
    }).join('');

    // Update count
    document.querySelector('#local-branches').previousElementSibling
      .querySelector('.count').textContent = `(${filtered.length})`;
  }

  renderRemoteBranches() {
    const container = document.getElementById('remote-branches');
    const filtered = this.filterBranches(this.branches.remote);

    container.innerHTML = filtered.map(branch => {
      const classes = ['branch-item'];

      if (!branch.available) {
        classes.push('in-worktree');
      } else {
        classes.push('available');
      }

      if (this.selectedBranch === branch.name) {
        classes.push('selected');
      }

      const icon = branch.available ? '•' : '⊗';
      const badge = branch.reason ?
        `<span class="branch-badge">${branch.reason}</span>` : '';

      const info = branch.lastCommit ? `
        <span class="branch-info">
          <span class="commit-msg">${branch.lastCommit.message}</span>
          <span class="commit-meta">by ${branch.lastCommit.author}, ${this.formatDate(branch.lastCommit.date)}</span>
        </span>
      ` : '';

      const onclick = branch.available ?
        `onclick="branchSelector.selectBranch('${branch.name}')"` : '';

      return `
        <div class="${classes.join(' ')}" ${onclick} title="${branch.reason || ''}">
          <span class="branch-icon">${icon}</span>
          <span class="branch-name">${branch.name}</span>
          ${info}
          ${badge}
        </div>
      `;
    }).join('');

    // Update count
    document.querySelector('#remote-branches').previousElementSibling
      .querySelector('.count').textContent = `(${filtered.length})`;
  }

  filterBranches(branches) {
    if (!this.searchTerm) return branches;

    const term = this.searchTerm.toLowerCase();
    return branches.filter(b =>
      b.name.toLowerCase().includes(term) ||
      (b.lastCommit && b.lastCommit.message.toLowerCase().includes(term))
    );
  }

  selectBranch(branchName) {
    this.selectedBranch = branchName;

    // Update UI
    this.render();

    // Show selected display
    document.getElementById('selected-branch-display').style.display = 'flex';
    document.getElementById('selected-branch-name').textContent = branchName;

    // Auto-fill worktree name
    const worktreeName = branchName.replace(/^origin\//, '').replace(/\//g, '-');
    document.getElementById('worktree-name').value = worktreeName;

    // Enable create button
    document.getElementById('create-btn').disabled = false;
  }

  clearSelection() {
    this.selectedBranch = null;
    this.render();
    document.getElementById('selected-branch-display').style.display = 'none';
    document.getElementById('worktree-name').value = '';
    document.getElementById('create-btn').disabled = true;
  }

  onSearch(event) {
    this.searchTerm = event.target.value;
    this.render();
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString();
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'just now';
    }
  }
}

// Initialize
const branchSelector = new BranchSelector();

// Event listeners
document.getElementById('branch-search').addEventListener('input', (e) => {
  branchSelector.onSearch(e);
});

function toggleSection(sectionId) {
  const section = document.getElementById(`${sectionId}-branches`);
  const header = section.previousElementSibling;

  section.classList.toggle('collapsed');
  header.classList.toggle('collapsed');
}
```

---

## Implementation Checklist

### Phase 1: Backend (2-3 days)
- [ ] Create `scripts/branch-manager.mjs`
- [ ] Implement `listAvailableBranches()` method
- [ ] Add `/api/branches` endpoint
- [ ] Test with various branch configurations
- [ ] Handle edge cases:
  - Detached HEAD
  - Orphan branches
  - Branches with special characters
  - Very long branch names

### Phase 2: Frontend UI (2-3 days)
- [ ] Add tab switcher to create modal
- [ ] Build branch list UI component
- [ ] Implement search/filter functionality
- [ ] Add branch selection logic
- [ ] Style available vs unavailable branches
- [ ] Add keyboard navigation (arrow keys, enter)
- [ ] Add loading states
- [ ] Add empty states ("No branches found")

### Phase 3: Integration (1 day)
- [ ] Wire up branch selection to worktree creation
- [ ] Handle remote branches (create tracking branch)
- [ ] Auto-fill worktree name from branch
- [ ] Update worktree creation API
- [ ] Test end-to-end flow

### Phase 4: Polish (1 day)
- [ ] Add branch refresh button
- [ ] Cache branch list (refresh every 30s)
- [ ] Add tooltips for unavailable branches
- [ ] Responsive design for smaller screens
- [ ] Add success/error notifications
- [ ] Accessibility improvements (ARIA labels)

---

## Testing Strategy

### Unit Tests

```javascript
// tests/branch-manager.test.js

describe('BranchManager', () => {
  it('lists all local branches', async () => {
    const manager = new BranchManager('/test/repo');
    const branches = await manager.getLocalBranches();
    expect(branches).toHaveLength(5);
  });

  it('marks base branch as unavailable', async () => {
    const branches = await manager.listAvailableBranches();
    const main = branches.local.find(b => b.name === 'main');
    expect(main.available).toBe(false);
    expect(main.reason).toBe('Base branch');
  });

  it('marks branches in worktrees as unavailable', async () => {
    const branches = await manager.listAvailableBranches();
    const feature = branches.local.find(b => b.name === 'feature/ui');
    expect(feature.available).toBe(false);
    expect(feature.worktree).toBe('feature-ui');
  });

  it('filters remote branches tracked by local', async () => {
    const branches = await manager.listAvailableBranches();
    const remote = branches.remote.find(b => b.name === 'origin/feature/ui');
    expect(remote.available).toBe(false);
    expect(remote.tracked).toBe(true);
    expect(remote.localBranch).toBe('feature/ui');
  });
});
```

### Integration Tests

```javascript
// tests/branch-selector.integration.test.js

describe('Branch Selector', () => {
  it('creates worktree from existing local branch', async () => {
    await openCreateModal();
    await clickTab('existing-branch');
    await selectBranch('feature/auth');
    await clickCreate();

    expect(worktreeExists('feature-auth')).toBe(true);
  });

  it('creates worktree from remote branch', async () => {
    await selectBranch('origin/feature/payments');
    await clickCreate();

    // Should create tracking branch + worktree
    expect(worktreeExists('feature-payments')).toBe(true);
    expect(branchExists('feature/payments')).toBe(true);
  });

  it('filters branches by search term', async () => {
    await typeSearch('pay');
    const visible = getVisibleBranches();

    expect(visible).toContain('origin/feature/payments');
    expect(visible).not.toContain('feature/auth');
  });
});
```

---

## Success Metrics

- ✅ User can see all available branches without leaving UI
- ✅ Cannot select branches already in worktrees (prevented)
- ✅ Search filters branches in real-time (<100ms)
- ✅ Branch list loads in <500ms
- ✅ Worktree creation works for both local and remote branches
- ✅ Branch metadata (commit msg, author, date) visible
- ✅ Responsive on screens 1024px+

---

## Future Enhancements

### V2 Features
- [ ] **Branch comparison**: Show diff between branch and base
- [ ] **Branch previews**: Show recent commits in tooltip
- [ ] **Favorites**: Pin frequently used branches to top
- [ ] **Grouping**: Group by prefix (feature/, bugfix/, etc.)
- [ ] **Sorting**: Sort by date, name, or author
- [ ] **Stale branch detection**: Highlight branches >30 days old
- [ ] **Branch deletion**: Delete unused branches from UI
- [ ] **Pull before create**: Option to pull latest remote changes

---

## Alternative Designs

### Option 2: Autocomplete Dropdown

Instead of full modal, use autocomplete:

```
Branch Name: [feature/au_________________]
             ┌──────────────────────────┐
             │ feature/auth             │ ← Available
             │ feature/auth-v2          │ ← Available
             └──────────────────────────┘
```

**Pros**: Less UI, faster for power users
**Cons**: Can't show branch metadata, harder to browse

### Option 3: Command Palette Style

GitHub-style command palette (`Cmd+K`):

```
⌘K  Create worktree from...

    🔍 Search branches...
    ────────────────────────
    > feature/auth
      origin/feature/payments
      bugfix/login
```

**Pros**: Keyboard-driven, feels modern
**Cons**: Requires keyboard shortcuts, harder for new users

---

**Recommendation**: Full modal (Option 1) for initial release, add command palette in v2.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Status**: Design Proposal - Awaiting Approval
**Estimated Effort**: 6-7 days
