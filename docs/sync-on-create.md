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
