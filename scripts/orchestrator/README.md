# VibeTrees Orchestrator

Semi-attended autonomous development system that executes the VibeTrees refactoring plan with daily human check-ins.

## Quick Start

```bash
# Install dependencies (first time only)
npm install

# Start orchestration from Phase 1
npm start

# Start from specific phase
npm start -- --phase 2

# Use different model
npm start -- --model claude-opus-4

# Disable dashboard (if not needed)
npm start -- --no-dashboard
```

## What It Does

The orchestrator:
1. Tests Claude CLI connection
2. Creates SQLite session for state tracking
3. Executes phases sequentially with tasks
4. Retries failed tasks automatically (3 attempts)
5. Pauses at checkpoints for human approval
6. Resumes from last checkpoint on restart

## Architecture

- **State Manager**: SQLite-based persistence (`.orchestrator-state/state.db`)
- **CLI Wrapper**: Correct Claude Code syntax (`--print` mode)
- **Task Executor**: Retry logic, error handling, test integration
- **Phase Definitions**: Task specifications with prompts
- **Human Checkpoints**: Review between phases (70-80% success rate)

## How It Works

### Phase Execution

Each phase contains multiple tasks. For example, Phase 1:
1. Remove tmux CLI interface
2. Add --listen parameter to web server
3. Create first-run wizard
4. Update documentation

After each task:
- Saves state to SQLite
- Optionally runs tests
- Retries on failure
- Continues to next task

After each phase:
- Requires human approval
- Shows checkpoint message
- Allows retry/skip/abort

### State Management

All progress tracked in `.orchestrator-state/state.db`:
- **Sessions**: Orchestration runs
- **Phases**: 1-7 (currently only Phase 1 defined)
- **Tasks**: Individual steps with retry counts
- **Checkpoints**: Human approval gates

**Survives crashes** - just run `npm start` again to resume.

### CLI Arguments

```bash
--model <name>        AI model to use (default: claude-sonnet-4.5)
--phase <number>      Start from specific phase (default: 1)
--no-dashboard        Disable web dashboard (optional feature)
```

## Daily Check-In Workflow

**Recommended:** Check in once per day for 30-60 minutes.

1. **Morning:** Review overnight progress
   ```bash
   # Check current state
   npm start

   # Review git commits
   cd ../..
   git log --oneline

   # Run tests
   npm test
   ```

2. **Approve checkpoint** if work looks good
   - CLI will prompt for approval
   - Or use dashboard (if enabled)

3. **Handle failures** if any
   - Review error messages in CLI output
   - Check `.orchestrator-state/state.db` for details
   - Fix manually if needed
   - Choose: Retry, Skip, or Abort

4. **Let it run** until next checkpoint
   - Phase 1: 3-4 days estimated
   - No need to watch continuously
   - State persists across restarts

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

**Current test coverage: 23 tests, all passing**

## Troubleshooting

### "Claude CLI not available"

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-cli

# Login with API key
claude login
```

### Tests keep failing

1. Check task logs in CLI output
2. Fix issues manually
3. Restart: `npm start`
4. Choose "Retry" at the failure prompt

### Want to reset state

```bash
# Delete state database
rm -rf .orchestrator-state/

# Restart from Phase 1
npm start
```

### Check current state

```bash
# View SQLite database
sqlite3 .orchestrator-state/state.db

# List sessions
SELECT * FROM sessions;

# List phases
SELECT * FROM phases;

# List tasks
SELECT * FROM tasks;

.quit
```

## Files

- `index.mjs` - Main orchestrator entry point
- `state-manager.mjs` - SQLite state management
- `claude-cli.mjs` - Claude Code CLI wrapper
- `task-executor.mjs` - Task execution with retry
- `phases/` - Phase definitions
  - `phase-1-cleanup.mjs` - Phase 1: 4 tasks
  - `index.mjs` - Phase registry

## Safety

The orchestrator:
- ✅ Saves state after every task
- ✅ Runs tests before proceeding (optional per task)
- ✅ Pauses at checkpoints (human oversight)
- ✅ Tracks retries (prevents infinite loops)
- ✅ Allows manual intervention (retry/skip/abort)
- ❌ Never force-pushes to git
- ❌ Never deletes files without verification

## Success Criteria

Orchestration completes successfully when:
- ✅ All phases executed
- ✅ All tasks completed or skipped with approval
- ✅ All checkpoints approved
- ✅ VibeTrees refactoring complete

---

**For implementation details, see the parent plan:**
`docs/plans/2025-10-27-semi-attended-orchestration.md`
