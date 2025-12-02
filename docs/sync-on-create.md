# Git Sync

Worktree creation is never blocked. Create first, sync later if needed.

## How it works

Click the sync button on any worktree card to pull remote changes. VibeTrees will:
1. Fetch and merge from remote
2. Try to auto-resolve conflicts
3. Reinstall dependencies if package files changed
4. Restart services if needed

## API

```bash
# Sync a worktree
POST /api/worktrees/:name/sync

# Check how far behind
GET /api/worktrees/:name/check-updates
# Returns: { "behind": 5, "ahead": 2 }
```

If auto-resolve fails, you'll need to manually fix conflicts in the worktree directory.
