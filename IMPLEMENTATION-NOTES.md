# Phase 2.7 & 2.8 Implementation Notes

**Status**: Backend Complete ✅ | Frontend Pending
**Date**: 2025-10-28
**Completed By**: Claude Code

---

## What's Been Completed

### ✅ Backend (100% Complete)

1. **branch-manager.mjs** (scripts/branch-manager.mjs)
   - `listAvailableBranches()` - Returns local/remote branches with metadata
   - Filters out branches already in worktrees
   - Detects base branches
   - Gets last commit info for each branch
   - Identifies local branches tracking remote branches

2. **branch-cleanup-manager.mjs** (scripts/branch-cleanup-manager.mjs)
   - `getBranchStatus()` - Checks if branch is merged, safe to delete
   - `deleteBranch()` - Deletes local and/or remote branches
   - `isBranchMerged()` - Checks merge status
   - `getUnmergedCommitCount()` - Counts unmerged commits
   - Falls back from `gh` CLI to `git push` for remote deletion

3. **API Endpoints** (scripts/worktree-web/server.mjs:1614-1696)
   - `GET /api/branches` - List all branches with availability status
   - `GET /api/worktrees/:name/branch-status` - Get branch status before deletion
   - `DELETE /api/worktrees/:name` - Enhanced to support optional branch deletion

### ✅ Integration Testing

Server starts without errors. Syntax validated.

---

## What Needs to Be Done (Frontend)

### 1. Branch Selector UI (Phase 2.7)

**Files to Create**:
- `scripts/worktree-web/public/js/branch-selector.js`
- `scripts/worktree-web/public/css/branch-selector.css`

**Files to Modify**:
- `scripts/worktree-web/public/index.html` - Add tabs to create modal
- `scripts/worktree-web/public/js/main.js` - Wire up branch selector

**Implementation Steps**:

1. **Update Create Worktree Modal** (index.html)
   - Add tab switcher: "New Branch" | "Existing Branch"
   - Add tab content areas
   - Add branch search input
   - Add branch list container with sections (local/remote)
   - Keep existing fields (worktree name, agent, profile)

2. **Create BranchSelector Class** (branch-selector.js)
   ```javascript
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

     selectBranch(branchName) {
       // Set selected branch
       // Auto-fill worktree name
       // Enable create button
     }

     filterBranches(branches) {
       // Filter by search term
     }

     formatDate(dateStr) {
       // Convert to "X days ago" format
     }
   }
   ```

3. **Branch List Rendering**
   - Loop through `branches.local` and `branches.remote`
   - Show icon based on status: ✓ (base), • (available), ⊗ (in worktree)
   - Show branch metadata: commit message, author, date
   - Make available branches clickable
   - Disable base branches and branches in worktrees

4. **Search Functionality**
   - Filter branches by name or commit message
   - Update counts dynamically
   - Debounce search input (150ms)

5. **Tab Switching**
   - Toggle between "New Branch" and "Existing Branch" tabs
   - Show/hide appropriate content
   - Clear selection when switching tabs

6. **Worktree Creation Integration**
   - When branch selected, populate worktree name field
   - Convert branch name: `feature/auth` → `feature-auth`
   - Strip `origin/` prefix from remote branches
   - Update create worktree API call to use selected branch

**CSS Requirements** (branch-selector.css):
- Branch list container with scroll
- Branch items with hover states
- Disabled state for unavailable branches
- Selected state highlighting
- Search box styling
- Collapsible sections (local/remote)
- Badge styles for status indicators

**Reference**: See FEATURE-BRANCH-SELECTOR.md lines 237-394 for complete CSS

---

### 2. Branch Cleanup on Deletion (Phase 2.8)

**Files to Modify**:
- `scripts/worktree-web/public/js/main.js` - Update `deleteWorktree()` function
- `scripts/worktree-web/public/index.html` - Update delete confirmation modal
- `scripts/worktree-web/public/css/main.css` - Add branch deletion option styles

**Implementation Steps**:

1. **Fetch Branch Status Before Showing Modal**
   ```javascript
   async function confirmDeleteWorktree(worktreeName) {
     // Fetch branch status
     const response = await fetch(`/api/worktrees/${worktreeName}/branch-status`);
     const branchStatus = await response.json();

     // Build modal with branch info
     showDeleteModal(worktreeName, branchStatus);
   }
   ```

2. **Update Delete Modal** (index.html)
   - Add warning box for what will be deleted
   - Add branch status indicator:
     - ✅ "Branch is merged" (green box)
     - ⚠️ "Branch is NOT merged" (yellow box)
     - ℹ️ "Base branch" (blue box)
   - Add checkbox: "Also delete branch"
   - Add sub-options:
     - "Delete local branch" (checkbox)
     - "Delete on GitHub" (checkbox, disabled if not on remote)
   - Pre-check checkboxes if branch is merged
   - Disable if base branch

3. **Enhanced Delete Function**
   ```javascript
   async function executeDelete(worktreeName, branchStatus) {
     const deleteBranch = document.getElementById('delete-branch-checkbox')?.checked;
     const deleteLocal = document.getElementById('delete-local')?.checked;
     const deleteRemote = document.getElementById('delete-remote')?.checked;

     // Double confirmation for unmerged branches
     if (deleteBranch && !branchStatus.isMerged) {
       const confirmed = confirm(
         'Are you sure? This branch has unmerged commits. ' +
         'Deleting it will permanently lose your work.'
       );
       if (!confirmed) return;
     }

     // Call DELETE API with branch deletion options
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

     const result = await response.json();

     // Show success/error message with branch deletion results
     if (result.branchDeletion) {
       const messages = [];
       if (result.branchDeletion.local === 'deleted') {
         messages.push('Local branch deleted');
       }
       if (result.branchDeletion.remote === 'deleted') {
         messages.push('Remote branch deleted');
       }
       showNotification('Worktree deleted. ' + messages.join('. '), 'success');
     }
   }
   ```

4. **Modal Content Rendering**
   ```javascript
   function renderBranchStatus(status) {
     if (status.isBaseBranch) {
       return `<div class="info-box info">
         <strong>ℹ️ Base branch (${status.branchName})</strong>
         <p>This branch will be preserved.</p>
       </div>`;
     }

     if (status.isMerged) {
       return `<div class="info-box success">
         <strong>✅ Branch is merged into main</strong>
         <p>Safe to delete.</p>
       </div>`;
     }

     return `<div class="info-box warning">
       <strong>⚠️ Branch is NOT merged</strong>
       <p>This branch has ${status.unmergedCommits} unmerged commit(s).</p>
     </div>`;
   }
   ```

5. **CSS Styles**
   - `.branch-deletion-options` - Container for checkboxes
   - `.info-box.success` - Green background for merged
   - `.info-box.warning` - Yellow background for unmerged
   - `.info-box.info` - Blue background for base branch
   - `.badge-danger` - Red badge for "dangerous!" label
   - Indented sub-options

**Reference**: See FEATURE-BRANCH-CLEANUP.md lines 609-687 for complete CSS

---

## Testing Checklist

### Backend Testing (Already Done ✅)
- [x] Server starts without errors
- [x] Syntax validation passes
- [x] API endpoints added correctly

### Frontend Testing (TODO)

**Branch Selector**:
- [ ] Branches load from `/api/branches`
- [ ] Local branches display with correct icons
- [ ] Remote branches display with correct icons
- [ ] Base branch shows as unavailable
- [ ] Branches in worktrees show as unavailable
- [ ] Search filters branches correctly
- [ ] Clicking branch selects it
- [ ] Worktree name auto-fills from branch
- [ ] Create worktree uses selected branch
- [ ] Tab switching works correctly

**Branch Cleanup**:
- [ ] Delete modal shows branch status
- [ ] Merged branches pre-check "delete branch"
- [ ] Unmerged branches don't pre-check
- [ ] Base branches disable checkbox
- [ ] Remote checkbox hidden if branch not on GitHub
- [ ] Double confirmation for unmerged branches
- [ ] Local branch deletion works
- [ ] Remote branch deletion works (with gh CLI)
- [ ] Success messages show deletion results
- [ ] Error messages show gracefully

---

## API Documentation

### GET /api/branches

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
        "date": "2025-10-27T10:00:00Z"
      }
    },
    {
      "name": "feature/auth",
      "type": "local",
      "available": true,
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
    }
  ]
}
```

### GET /api/worktrees/:name/branch-status

**Response**:
```json
{
  "branchName": "feature/auth",
  "isMerged": true,
  "existsOnRemote": true,
  "isBaseBranch": false,
  "unmergedCommits": 0,
  "safeToDelete": true
}
```

### DELETE /api/worktrees/:name

**Request Body**:
```json
{
  "deleteBranch": true,
  "deleteLocal": true,
  "deleteRemote": true,
  "force": false
}
```

**Response**:
```json
{
  "success": true,
  "branchDeletion": {
    "local": "deleted",
    "remote": "deleted",
    "errors": []
  }
}
```

---

## Next Steps

1. **Start with Branch Selector UI**
   - Create `branch-selector.js` and `branch-selector.css`
   - Update create modal HTML
   - Test branch selection flow

2. **Then Branch Cleanup**
   - Update delete modal HTML
   - Add branch status fetching
   - Test deletion with various scenarios

3. **Polish**
   - Add loading states
   - Add error handling
   - Add keyboard navigation (optional)
   - Responsive design tweaks

---

## Estimated Effort

**Frontend Implementation**: 4-6 hours
- Branch Selector: 2-3 hours
- Branch Cleanup: 1.5-2 hours
- Testing & Polish: 0.5-1 hour

**Total Phase 2.7 + 2.8**: ~1 day of focused frontend work

---

## References

- Full design specs: FEATURE-BRANCH-SELECTOR.md
- Full design specs: FEATURE-BRANCH-CLEANUP.md
- Backend code: scripts/branch-manager.mjs, scripts/branch-cleanup-manager.mjs
- API endpoints: scripts/worktree-web/server.mjs:1614-1696

---

**Status**: Ready for frontend implementation
**Blocker**: None - all backend work complete
**Next Action**: Create `scripts/worktree-web/public/js/branch-selector.js`
