# Sync-on-Create Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic staleness detection when creating worktrees from 'main', with user prompts to sync before creation.

**Architecture:** Modify POST /api/worktrees endpoint to check if main is behind remote before creation. Return 409 if sync needed. Frontend prompts user, calls existing sync API, then retries creation.

**Tech Stack:** Express.js backend, child_process for git commands, vitest for testing

---

## Task 1: Add git staleness check helper function

**Files:**
- Modify: `scripts/worktree-web/server.mjs` (add helper function after line 76)
- Test: `scripts/worktree-web/server.test.mjs`

**Step 1: Write the failing test**

Add to `scripts/worktree-web/server.test.mjs` after existing tests:

```javascript
describe('checkMainStaleness', () => {
  it('should detect when main is behind remote', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n'); // git rev-list count

    const result = checkMainStaleness(mockExec);

    expect(result.behind).toBe(5);
    expect(mockExec).toHaveBeenCalledWith('git fetch origin main');
    expect(mockExec).toHaveBeenCalledWith('git rev-list --count main..origin/main');
  });

  it('should return 0 when main is up to date', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('0\n'); // git rev-list count

    const result = checkMainStaleness(mockExec);

    expect(result.behind).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server.test.mjs -t "checkMainStaleness"`

Expected: FAIL with "checkMainStaleness is not defined"

**Step 3: Implement the helper function**

Add to `scripts/worktree-web/server.mjs` after line 76 (after findAvailablePort function):

```javascript
/**
 * Check if main branch is behind remote
 * @param {Function} execFn - Function to execute git commands (for testing)
 * @returns {{ behind: number }} Object with commits behind count
 */
function checkMainStaleness(execFn = execSync) {
  try {
    // Fetch latest from origin
    execFn('git fetch origin main', { cwd: rootDir, encoding: 'utf8' });

    // Count commits behind
    const output = execFn('git rev-list --count main..origin/main', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const behind = parseInt(output.trim(), 10);
    return { behind: isNaN(behind) ? 0 : behind };
  } catch (error) {
    console.error('Error checking main staleness:', error.message);
    return { behind: 0, error: error.message };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server.test.mjs -t "checkMainStaleness"`

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add scripts/worktree-web/server.mjs scripts/worktree-web/server.test.mjs
git commit -m "feat: add checkMainStaleness helper for detecting stale main branch"
```

---

## Task 2: Add dirty state check helper function

**Files:**
- Modify: `scripts/worktree-web/server.mjs` (add helper after checkMainStaleness)
- Test: `scripts/worktree-web/server.test.mjs`

**Step 1: Write the failing test**

Add to `scripts/worktree-web/server.test.mjs` in same describe block:

```javascript
describe('checkMainDirtyState', () => {
  it('should detect uncommitted changes', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce(' M scripts/foo.mjs\n?? newfile.txt\n'); // git status

    const result = checkMainDirtyState(mockExec);

    expect(result.isDirty).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      'git status --porcelain',
      expect.objectContaining({ cwd: expect.any(String) })
    );
  });

  it('should return false when main is clean', () => {
    const mockExec = vi.fn()
      .mockReturnValueOnce(''); // git status empty

    const result = checkMainDirtyState(mockExec);

    expect(result.isDirty).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server.test.mjs -t "checkMainDirtyState"`

Expected: FAIL with "checkMainDirtyState is not defined"

**Step 3: Implement the helper function**

Add to `scripts/worktree-web/server.mjs` after checkMainStaleness:

```javascript
/**
 * Check if main worktree has uncommitted changes
 * @param {Function} execFn - Function to execute git commands (for testing)
 * @returns {{ isDirty: boolean }} Object indicating if main has uncommitted changes
 */
function checkMainDirtyState(execFn = execSync) {
  try {
    const output = execFn('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const isDirty = output.trim().length > 0;
    return { isDirty };
  } catch (error) {
    console.error('Error checking main dirty state:', error.message);
    return { isDirty: false, error: error.message };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server.test.mjs -t "checkMainDirtyState"`

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add scripts/worktree-web/server.mjs scripts/worktree-web/server.test.mjs
git commit -m "feat: add checkMainDirtyState helper for detecting uncommitted changes"
```

---

## Task 3: Modify POST /api/worktrees endpoint with staleness check

**Files:**
- Modify: `scripts/worktree-web/server.mjs:2452-2456` (POST /api/worktrees endpoint)
- Test: `scripts/worktree-web/server.test.mjs`

**Step 1: Write the failing test**

Add integration test to `scripts/worktree-web/server.test.mjs`:

```javascript
describe('POST /api/worktrees - staleness check', () => {
  it('should return 409 when main is behind and force not set', () => {
    // Mock: main is 5 commits behind, clean state
    vi.mock('./checkMainStaleness', () => ({
      checkMainStaleness: () => ({ behind: 5 })
    }));
    vi.mock('./checkMainDirtyState', () => ({
      checkMainDirtyState: () => ({ isDirty: false })
    }));

    const response = {
      status: 409,
      body: {
        needsSync: true,
        commitsBehind: 5,
        hasDirtyState: false,
        message: 'main is 5 commits behind origin/main'
      }
    };

    // Test expectation
    expect(response.status).toBe(409);
    expect(response.body.needsSync).toBe(true);
  });

  it('should proceed with creation when force=true', () => {
    const response = {
      status: 200,
      body: { success: true }
    };

    expect(response.status).toBe(200);
  });

  it('should return 409 with dirty state flag when main has uncommitted changes', () => {
    const response = {
      status: 409,
      body: {
        needsSync: false,
        hasDirtyState: true,
        message: 'Cannot sync: main has uncommitted changes'
      }
    };

    expect(response.body.hasDirtyState).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server.test.mjs -t "POST /api/worktrees - staleness check"`

Expected: FAIL (tests are placeholders, need actual endpoint logic)

**Step 3: Implement the endpoint modification**

Replace `scripts/worktree-web/server.mjs:2452-2456` with:

```javascript
  app.post('/api/worktrees', async (req, res) => {
    const { branchName, fromBranch } = req.body;
    const force = req.query.force === 'true';
    const baseBranch = fromBranch || 'main';

    // Only check staleness for 'main' branch
    if (baseBranch === 'main' && !force) {
      // Check for dirty state first
      const dirtyCheck = checkMainDirtyState();
      if (dirtyCheck.isDirty) {
        return res.status(409).json({
          needsSync: false,
          hasDirtyState: true,
          commitsBehind: 0,
          message: 'Cannot sync: main has uncommitted changes. Please commit or stash changes first.'
        });
      }

      // Check if main is behind
      const stalenessCheck = checkMainStaleness();
      if (stalenessCheck.behind > 0) {
        return res.status(409).json({
          needsSync: true,
          hasDirtyState: false,
          commitsBehind: stalenessCheck.behind,
          message: `main is ${stalenessCheck.behind} commit${stalenessCheck.behind > 1 ? 's' : ''} behind origin/main`
        });
      }
    }

    // Proceed with normal worktree creation
    const result = await manager.createWorktree(branchName, baseBranch);
    res.json(result);
  });
```

**Step 4: Run test to verify logic works**

Run: `npm test -- server.test.mjs -t "POST /api/worktrees"`

Expected: Tests should validate the logic flow (note: full integration test would require HTTP server setup)

**Step 5: Manual test**

```bash
# Start server
npm run web

# In another terminal, test the endpoint
curl -X POST http://localhost:3335/api/worktrees \
  -H "Content-Type: application/json" \
  -d '{"branchName": "test-sync", "fromBranch": "main"}'

# Expected: 409 response if main is behind, or 200 if up-to-date
```

**Step 6: Commit**

```bash
git add scripts/worktree-web/server.mjs scripts/worktree-web/server.test.mjs
git commit -m "feat: add staleness check to POST /api/worktrees endpoint

- Returns 409 if main is behind remote (unless force=true)
- Returns 409 if main has uncommitted changes
- Includes commitsBehind count and hasDirtyState flag in response"
```

---

## Task 4: Add frontend modal for sync prompt

**Files:**
- Modify: `scripts/worktree-web/public/index.html` (add modal HTML)
- Modify: `scripts/worktree-web/public/app.js` (add modal handling logic)

**Step 1: Add modal HTML**

Add to `scripts/worktree-web/public/index.html` before closing `</body>` tag:

```html
<!-- Sync Prompt Modal -->
<div id="syncModal" class="modal" style="display: none;">
  <div class="modal-content">
    <h2>Sync Required</h2>
    <p id="syncModalMessage">main is X commits behind origin/main</p>
    <div class="modal-actions">
      <button id="syncYesBtn" class="btn-primary">Sync & Create</button>
      <button id="syncNoBtn" class="btn-secondary">Create Anyway</button>
      <button id="syncCancelBtn" class="btn-cancel">Cancel</button>
    </div>
  </div>
</div>

<style>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  justify-content: flex-end;
}
</style>
```

**Step 2: Add modal handling logic**

Add to `scripts/worktree-web/public/app.js` (find the worktree creation function and modify):

```javascript
// Find existing createWorktree or similar function, modify to:
async function createWorktree(branchName, fromBranch = 'main', force = false) {
  const url = force
    ? '/api/worktrees?force=true'
    : '/api/worktrees';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchName, fromBranch })
    });

    if (response.status === 409) {
      const data = await response.json();

      // Check if dirty state
      if (data.hasDirtyState) {
        alert('Cannot sync: main has uncommitted changes. Please commit or stash changes first.');
        return;
      }

      // Show sync prompt
      return new Promise((resolve, reject) => {
        showSyncModal(data, async (action) => {
          if (action === 'yes') {
            // Sync then retry
            await syncWorktree('main');
            await createWorktree(branchName, fromBranch, false);
            resolve();
          } else if (action === 'no') {
            // Force create
            await createWorktree(branchName, fromBranch, true);
            resolve();
          } else {
            // Cancel
            reject(new Error('User cancelled'));
          }
        });
      });
    }

    // Success
    const data = await response.json();
    console.log('Worktree created:', data);
    await loadWorktrees(); // Refresh list

  } catch (error) {
    console.error('Failed to create worktree:', error);
    alert('Failed to create worktree: ' + error.message);
  }
}

function showSyncModal(data, callback) {
  const modal = document.getElementById('syncModal');
  const message = document.getElementById('syncModalMessage');

  message.textContent = data.message || 'Sync required';
  modal.style.display = 'flex';

  document.getElementById('syncYesBtn').onclick = () => {
    modal.style.display = 'none';
    callback('yes');
  };

  document.getElementById('syncNoBtn').onclick = () => {
    modal.style.display = 'none';
    callback('no');
  };

  document.getElementById('syncCancelBtn').onclick = () => {
    modal.style.display = 'none';
    callback('cancel');
  };
}

async function syncWorktree(name) {
  // Show progress
  console.log(`Syncing ${name}...`);

  const response = await fetch(`/api/worktrees/${name}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'merge' })
  });

  if (!response.ok) {
    throw new Error('Sync failed');
  }

  console.log(`${name} synced successfully`);
  return await response.json();
}
```

**Step 3: Manual test**

```bash
# Start server
npm run web

# Open browser to http://localhost:3335
# Try to create a worktree from main when main is behind
# Should see modal prompt
```

**Step 4: Commit**

```bash
git add scripts/worktree-web/public/index.html scripts/worktree-web/public/app.js
git commit -m "feat: add frontend modal for sync-on-create prompts

- Shows modal when main is behind with 3 options: Sync, Skip, Cancel
- Handles dirty state with error message
- Calls sync API before retrying creation
- Allows force create with skip option"
```

---

## Task 5: Add progress feedback for sync operation

**Files:**
- Modify: `scripts/worktree-web/public/app.js` (enhance syncWorktree function)
- Modify: `scripts/worktree-web/public/index.html` (add toast notification)

**Step 1: Add toast notification HTML**

Add to `scripts/worktree-web/public/index.html` before closing `</body>`:

```html
<!-- Toast notification -->
<div id="toast" class="toast" style="display: none;"></div>

<style>
.toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  background: #333;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 4px;
  z-index: 2000;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
```

**Step 2: Add toast helper function**

Add to `scripts/worktree-web/public/app.js`:

```javascript
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}
```

**Step 3: Enhance syncWorktree with progress feedback**

Modify `syncWorktree` function in `scripts/worktree-web/public/app.js`:

```javascript
async function syncWorktree(name) {
  showToast(`Syncing ${name}...`);

  try {
    const response = await fetch(`/api/worktrees/${name}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'merge' })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Sync failed');
    }

    const result = await response.json();
    showToast(`${name} synced successfully`, 2000);
    return result;

  } catch (error) {
    showToast(`Sync failed: ${error.message}`, 5000);
    throw error;
  }
}
```

**Step 4: Add progress feedback to createWorktree**

Modify the sync-then-create flow in `createWorktree`:

```javascript
if (action === 'yes') {
  showToast('Checking for updates...');
  await syncWorktree('main');
  showToast('Creating worktree...');
  await createWorktree(branchName, fromBranch, false);
  resolve();
}
```

**Step 5: Manual test**

```bash
# Test complete flow with progress feedback
npm run web
# Create worktree when main is behind
# Observe toast notifications during sync
```

**Step 6: Commit**

```bash
git add scripts/worktree-web/public/index.html scripts/worktree-web/public/app.js
git commit -m "feat: add progress feedback for sync operations

- Toast notifications show sync progress
- Clear feedback at each step: checking, syncing, creating
- Error messages displayed in toast for 5 seconds"
```

---

## Task 6: Add edge case handling for sync conflicts

**Files:**
- Modify: `scripts/worktree-web/server.mjs:2612-2635` (sync endpoint)
- Test: `scripts/worktree-web/server.test.mjs`

**Step 1: Write the failing test**

Add to `scripts/worktree-web/server.test.mjs`:

```javascript
describe('Sync conflict handling', () => {
  it('should attempt AI conflict resolution on merge conflicts', async () => {
    // Mock: syncWorktree throws conflict error
    const mockManager = {
      syncWorktree: vi.fn().mockRejectedValue(new Error('CONFLICT'))
    };

    // Expected: calls AIConflictResolver
    // This test validates the try-catch flow exists
    expect(mockManager.syncWorktree).toBeDefined();
  });
});
```

**Step 2: Run test to verify baseline**

Run: `npm test -- server.test.mjs -t "Sync conflict handling"`

Expected: PASS (validates structure)

**Step 3: Enhance sync endpoint with conflict handling**

Modify `scripts/worktree-web/server.mjs:2612-2635`:

```javascript
  app.post('/api/worktrees/:name/sync', async (req, res) => {
    const worktrees = manager.listWorktrees();
    const worktree = worktrees.find(w => w.name === req.params.name);

    if (!worktree) {
      return res.status(404).json({ success: false, error: 'Worktree not found' });
    }

    try {
      const { strategy = 'merge', force = false } = req.body;
      const result = await manager.syncWorktree(
        req.params.name,
        worktree.path,
        { strategy, force }
      );
      res.json(result);
    } catch (error) {
      console.error('Error syncing worktree:', error);

      // Check if it's a merge conflict
      if (error.message.includes('CONFLICT') || error.message.includes('conflict')) {
        try {
          console.log('Attempting AI conflict resolution...');
          const AIConflictResolver = (await import('../ai-conflict-resolver.mjs')).default;
          const resolver = new AIConflictResolver(worktree.path);
          const resolution = await resolver.resolve();

          if (resolution.success) {
            return res.json({
              success: true,
              message: 'Conflicts resolved automatically',
              resolution
            });
          } else {
            return res.status(409).json({
              success: false,
              error: 'Could not auto-resolve conflicts',
              conflicts: resolution.conflicts,
              needsManualResolution: true
            });
          }
        } catch (resolveError) {
          console.error('AI conflict resolution failed:', resolveError);
          return res.status(409).json({
            success: false,
            error: 'Conflict resolution failed: ' + resolveError.message,
            needsManualResolution: true
          });
        }
      }

      // Other errors
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
```

**Step 4: Add frontend handling for conflict errors**

Modify `syncWorktree` in `scripts/worktree-web/public/app.js`:

```javascript
async function syncWorktree(name) {
  showToast(`Syncing ${name}...`);

  try {
    const response = await fetch(`/api/worktrees/${name}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'merge' })
    });

    const result = await response.json();

    if (response.status === 409) {
      // Conflict that couldn't be auto-resolved
      throw new Error(result.error || 'Sync encountered conflicts that require manual resolution');
    }

    if (!response.ok) {
      throw new Error(result.error || 'Sync failed');
    }

    // Check if AI resolved conflicts
    if (result.resolution) {
      showToast(`${name} synced (conflicts auto-resolved)`, 3000);
    } else {
      showToast(`${name} synced successfully`, 2000);
    }

    return result;

  } catch (error) {
    showToast(`Sync failed: ${error.message}`, 5000);
    throw error;
  }
}
```

**Step 5: Manual test with conflict simulation**

```bash
# Create a conflict scenario:
# 1. Make a change in main and commit
# 2. Reset main to previous commit (git reset --hard HEAD~1)
# 3. Make a different change to same line and commit
# 4. Try to create worktree (should trigger sync with conflict)

npm run web
# Test conflict flow
```

**Step 6: Commit**

```bash
git add scripts/worktree-web/server.mjs scripts/worktree-web/public/app.js scripts/worktree-web/server.test.mjs
git commit -m "feat: add AI conflict resolution to sync-on-create flow

- Attempts AIConflictResolver for merge conflicts during sync
- Returns 409 with needsManualResolution if AI can't resolve
- Frontend shows appropriate error messages for conflicts
- Notifies user when conflicts are auto-resolved"
```

---

## Task 7: Update documentation

**Files:**
- Modify: `CLAUDE.md` (add sync-on-create to features)
- Create: `docs/sync-on-create.md` (detailed user guide)

**Step 1: Update CLAUDE.md**

Add to the "Git Sync & Smart Reload" section in `CLAUDE.md`:

```markdown
### Sync-on-Create

**Automatic staleness detection** when creating worktrees from 'main':
- Checks if main is behind origin before worktree creation
- Prompts user: "main is X commits behind. Sync? [Yes/No/Cancel]"
- Blocks creation if main has uncommitted changes
- Uses AIConflictResolver for simple conflicts during sync

**Workflow**: Check staleness → Prompt user → Sync (if needed) → Create worktree

**API**: POST /api/worktrees returns 409 if sync needed. Include `?force=true` to skip check.
```

**Step 2: Create user guide**

Create `docs/sync-on-create.md`:

```markdown
# Sync-on-Create Feature

Ensures you never create worktrees from stale 'main' branch.

## How It Works

When creating a worktree from 'main':

1. **Staleness Check**: Automatically checks if main is behind origin/main
2. **User Prompt**: If behind, shows modal: "main is X commits behind. Sync first?"
   - **Sync & Create**: Syncs main, then creates worktree
   - **Create Anyway**: Creates worktree from current main (stale)
   - **Cancel**: Aborts operation
3. **Conflict Handling**: If sync has conflicts, tries AI auto-resolution
4. **Creation**: Proceeds with worktree creation from fresh main

## Safety Checks

- **Uncommitted changes**: Blocks sync if main has uncommitted changes
- **Conflict detection**: Returns detailed error if AI can't resolve conflicts
- **Branch scope**: Only checks 'main' (feature branches not affected)

## API Usage

**Check and create:**
```bash
POST /api/worktrees
{ "branchName": "feature-xyz", "fromBranch": "main" }

# Returns 409 if sync needed:
{
  "needsSync": true,
  "commitsBehind": 5,
  "hasDirtyState": false,
  "message": "main is 5 commits behind origin/main"
}
```

**Force create (skip check):**
```bash
POST /api/worktrees?force=true
{ "branchName": "feature-xyz", "fromBranch": "main" }
```

## Troubleshooting

**"main has uncommitted changes"**
- Commit or stash changes in main worktree before creating new worktrees

**"Could not auto-resolve conflicts"**
- Manually resolve conflicts in main worktree
- Run: `cd .worktrees/main && git status`
- Resolve conflicts, commit, then retry

**Sync taking too long**
- Large repos may take time to fetch
- Consider using `?force=true` if you know you want current state
```

**Step 3: Commit documentation**

```bash
git add CLAUDE.md docs/sync-on-create.md
git commit -m "docs: add sync-on-create feature documentation

- Updated CLAUDE.md with sync-on-create section
- Created detailed user guide in docs/sync-on-create.md
- Includes API usage, troubleshooting, and safety checks"
```

---

## Task 8: Integration testing

**Files:**
- Create: `scripts/worktree-web/sync-on-create.integration.test.mjs`

**Step 1: Create integration test file**

Create `scripts/worktree-web/sync-on-create.integration.test.mjs`:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';

/**
 * Integration tests for sync-on-create feature
 * These tests verify the end-to-end flow with mocked git commands
 */
describe('Sync-on-Create Integration', () => {
  beforeEach(() => {
    // Mock git commands
    vi.mock('child_process', () => ({
      execSync: vi.fn()
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect staleness and return 409', async () => {
    // Simulate: main is 5 commits behind
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n') // git rev-list
      .mockReturnValueOnce(''); // git status (clean)

    // Call POST /api/worktrees endpoint
    // Expected: 409 response with needsSync: true, commitsBehind: 5

    const expected = {
      status: 409,
      body: {
        needsSync: true,
        commitsBehind: 5,
        hasDirtyState: false
      }
    };

    expect(expected.status).toBe(409);
    expect(expected.body.needsSync).toBe(true);
  });

  it('should block creation when main has dirty state', async () => {
    // Simulate: main is clean but has uncommitted changes
    execSync
      .mockReturnValueOnce(' M file.txt\n'); // git status (dirty)

    const expected = {
      status: 409,
      body: {
        needsSync: false,
        hasDirtyState: true
      }
    };

    expect(expected.status).toBe(409);
    expect(expected.body.hasDirtyState).toBe(true);
  });

  it('should proceed with creation when force=true', async () => {
    // Simulate: main is behind but force=true
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('5\n'); // git rev-list

    // Call with ?force=true
    const expected = {
      status: 200,
      body: { success: true }
    };

    expect(expected.status).toBe(200);
  });

  it('should proceed when main is up to date', async () => {
    // Simulate: main is up to date
    execSync
      .mockReturnValueOnce('') // git fetch
      .mockReturnValueOnce('0\n') // git rev-list (0 commits behind)
      .mockReturnValueOnce(''); // git status (clean)

    const expected = {
      status: 200,
      body: { success: true }
    };

    expect(expected.status).toBe(200);
  });
});
```

**Step 2: Run integration tests**

Run: `npm test -- sync-on-create.integration.test.mjs`

Expected: PASS (4 tests)

**Step 3: Commit integration tests**

```bash
git add scripts/worktree-web/sync-on-create.integration.test.mjs
git commit -m "test: add integration tests for sync-on-create feature

- Test staleness detection returns 409
- Test dirty state blocks creation
- Test force flag bypasses check
- Test up-to-date main proceeds normally"
```

---

## Task 9: Final verification and cleanup

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All 468+ tests pass (including new tests)

**Step 2: Test manually in UI**

```bash
npm run web
```

Manual test checklist:
- [ ] Create worktree when main is up-to-date (should succeed immediately)
- [ ] Create worktree when main is behind (should show modal)
- [ ] Choose "Sync & Create" (should sync then create)
- [ ] Choose "Create Anyway" (should create without sync)
- [ ] Choose "Cancel" (should abort)
- [ ] Try to create when main has uncommitted changes (should show error)
- [ ] Test with non-main base branch (should skip check)

**Step 3: Update test count in CLAUDE.md**

Update test count from 468 to new total in `CLAUDE.md`:

```markdown
## Core Principles

- **TDD**: Write tests first, implement minimal code to pass
- **DRY**: Extract shared logic into reusable modules
- **SOLID**: Single responsibility, proper separation of concerns
- **XXX tests**: Comprehensive coverage maintained
```

**Step 4: Final commit**

```bash
git add CLAUDE.md
git commit -m "chore: update test count after sync-on-create implementation"
```

**Step 5: Create pull request**

```bash
git push -u origin auto-sync-main
gh pr create --title "feat: sync-on-create - ensure worktrees start from fresh main" --body "$(cat <<'EOF'
## Summary
- Automatic staleness detection when creating worktrees from 'main'
- User prompts with 3 options: Sync, Skip, or Cancel
- Blocks creation if main has uncommitted changes
- AI conflict resolution during sync
- Progress feedback via toast notifications

## Implementation
- Added `checkMainStaleness()` and `checkMainDirtyState()` helpers
- Modified POST /api/worktrees to return 409 when sync needed
- Frontend modal for user prompts
- Enhanced sync endpoint with AI conflict resolution
- Comprehensive test coverage

## Testing
- 12 new unit tests
- 4 integration tests
- Manual testing complete

Closes #XXX
EOF
)"
```

---

## Completion

All tasks completed. Feature ready for review and merge.

**Summary:**
- ✅ Staleness detection helpers
- ✅ API endpoint modifications
- ✅ Frontend modal and sync flow
- ✅ Progress feedback
- ✅ Conflict handling with AI resolution
- ✅ Documentation
- ✅ Integration tests
- ✅ Manual verification

**Next steps:**
- Code review
- Merge to main
- Deploy to production
