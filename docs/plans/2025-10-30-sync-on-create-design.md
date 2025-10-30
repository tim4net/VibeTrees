# Sync-on-Create Feature Design

**Date:** 2025-10-30
**Status:** Approved for implementation

## Problem

Users create worktrees from an outdated 'main' branch, leading to working with stale code and potential merge conflicts later.

## Solution

Implement automatic staleness detection when creating worktrees, with user prompts to sync before creation.

## Requirements

- **Sync behavior**: Prompt user with option to sync or skip
- **Dirty state**: Block worktree creation if main has uncommitted changes
- **Conflict handling**: Use AIConflictResolver for simple conflicts, abort for complex ones
- **Branch scope**: Only check 'main' branch (not feature branches)
- **UX feedback**: Show progress updates during sync

## Architecture

**Approach**: API-layer check in POST /api/worktrees endpoint

Simple two-step flow:
1. First POST attempt → returns 409 if sync needed
2. User chooses action → sync then retry, or force create
3. Reuses existing `/api/worktrees/:name/sync` endpoint

## Implementation

### Backend (scripts/worktree-web/server.mjs)

**POST /api/worktrees endpoint modification:**

1. Before creating worktree, if baseBranch === 'main':
   - Check for uncommitted changes in main worktree
   - Run: `git fetch origin main`
   - Run: `git rev-list --count main..origin/main`

2. If commits behind > 0 and `?force=true` not present:
   - Return HTTP 409: `{ needsSync: true, commitsBehind: X, hasDirtyState: boolean }`

3. If `?force=true` present or commits behind === 0:
   - Proceed with normal worktree creation

**Dirty state check:**
- Run: `git status --porcelain` in main worktree path
- If output not empty → set `hasDirtyState: true` and block sync

**Sync flow (reusing existing):**
- Call existing GitSyncManager.sync('main')
- If conflicts → try AIConflictResolver.resolve()
- If AI resolve fails → return conflict details to user

### Frontend (scripts/worktree-web/public/)

**Worktree creation flow:**

1. User submits create worktree form
2. POST to /api/worktrees with branch='main'
3. Handle response:
   - **200 OK**: Worktree created successfully
   - **409 Conflict**: Parse response body
     - If `hasDirtyState: true`: Show error modal "Cannot sync: main has uncommitted changes. Please commit or stash changes first."
     - Else: Show modal "main is X commits behind origin/main. Sync before creating worktree? [Yes] [No] [Cancel]"
4. User choice:
   - **Yes**: Call POST /api/worktrees/main/sync, show progress, then retry POST /api/worktrees
   - **No**: Retry POST /api/worktrees with ?force=true
   - **Cancel**: Abort operation

**Progress feedback:**
- Show toast notifications: "Checking for updates...", "Syncing main (X commits behind)...", "Worktree created"
- Reuse existing sync progress UI if available

### Error Handling

**Sync failures:**
- Network error: "Failed to sync: network error. Try again?"
- Merge conflict: "Sync encountered conflicts. Attempting auto-resolve..."
- AI resolve failure: "Could not auto-resolve conflicts. Manual intervention required." (show conflict details)

**Dirty state:**
- Clear error message with actionable guidance
- Link to main worktree terminal/UI for resolution

## Testing

**Unit tests:**
- Mock git commands (fetch, rev-list, status)
- Test staleness detection logic
- Test dirty state detection
- Test 409 response formatting

**Integration tests:**
- Test full create workflow with behind main
- Test force=true bypasses check
- Test dirty state blocks sync
- Test conflict resolution flow

**Edge cases:**
- Main is ahead of origin (no sync needed)
- Main is up-to-date (no sync needed)
- Network failure during fetch
- Conflict during sync

## Future Enhancements

- Dashboard banner: "main is 2 days old, X commits behind [Sync Now]"
- Configurable: apply to other branches (develop, staging)
- Background staleness check (non-blocking, just shows indicator)

## Success Criteria

- Users never create worktrees from stale main (unless explicitly skipped)
- No unexpected failures or surprises
- Clear feedback at every step
- Existing workflows not disrupted
