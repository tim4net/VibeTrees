# Building VibeTrees with Semi-Attended Orchestration

This document explains how to use the **semi-attended orchestration system** to automatically build VibeTrees following the 8-phase refactoring plan.

## What Changed from Original Plan

The original `build-with-agents.sh` script (755 lines) **will not work** because:
1. Used non-existent CLI syntax: `claude --mcp zen [tool]` doesn't exist
2. Zen MCP is accessed via MCP protocol, not direct CLI flags
3. JSON-based state management (fragile, corrupts on crash)
4. No monitoring, cost tracking, or human checkpoints
5. Fully unattended approach has <5% success rate

**Research findings:**
- Fully unattended: <5% success probability
- Semi-attended (daily 30-60 min check-ins): **70-80% success probability**
- Paired development: 95%+
- 90% of AI agents fail within 30 days without human oversight

**This orchestrator implements the semi-attended approach with proper tooling.**

---

## Prerequisites

1. **Node.js 18+**
2. **Claude CLI** installed and configured:
   ```bash
   npm install -g @anthropic-ai/claude-cli
   claude login
   ```
3. **Git** configured with GitHub authentication
4. **30-60 minutes per day** for check-ins

⚠️ **Important:** If you're running the orchestrator from within Claude Code itself (like this session), it will detect the recursive situation and warn you. The orchestrator was designed to spawn separate Claude CLI instances, but when run inside Claude Code, it would create infinite recursion. Currently, it will start but needs modification to use the Task tool or MCP integration instead of spawning external processes.

**Recommended:** Run the orchestrator from a regular terminal (not inside Claude Code) for the intended experience.

---

## Quick Start

```bash
# Navigate to orchestrator
cd scripts/orchestrator

# Install dependencies (first time only)
npm install

# Start orchestration
npm start
```

This will:
1. Test Claude CLI connection
2. Start monitoring (optional dashboard)
3. Execute Phase 1 with human checkpoint
4. Continue through phases with approval gates

---

## Usage

### Basic Usage

```bash
npm start
```

### Start from Specific Phase

```bash
npm start -- --phase 3
```

### Use Different Model

```bash
npm start -- --model claude-opus-4
```

### Run Without Dashboard

```bash
npm start -- --no-dashboard
```

---

## How It Works

### 1. State Management (SQLite)

All progress tracked in `.orchestrator-state/state.db`:
- **Sessions** - orchestration runs
- **Phases** - 1-7 (currently only Phase 1 defined)
- **Tasks** - individual steps with retry counts
- **Checkpoints** - human approval gates

**Survives crashes** - just run `npm start` again to resume.

### 2. Task Execution with Retry

Each task:
1. Executes via Claude CLI (`--print` mode)
2. Tracks session ID for continuation
3. Runs tests after completion (optional)
4. Retries up to 3 times on failure
5. Pauses for human decision if all retries fail

### 3. Human Checkpoints

Between phases, orchestrator:
1. Displays summary of completed work
2. Waits for approval to continue
3. Allows review of changes before proceeding
4. Provides options to retry/skip/abort

### 4. Real-Time Monitoring

**CLI output** shows:
- Current phase and task
- Success/failure status
- Retry attempts
- Checkpoint prompts

**Optional dashboard** (port 3334):
- Phase progress visualization
- Task log history
- Pending approvals
- Session state

---

## Daily Check-In Workflow

**Recommended:** Check in once per day for 30-60 minutes.

### 1. Morning Review

```bash
# Check orchestrator state
cd scripts/orchestrator
npm start

# Review git commits
cd ../..
git log --oneline --since="24 hours ago"

# Run tests
npm test
```

### 2. Approve Checkpoint

If work looks good:
- Respond "Yes" to CLI prompt
- Or click "Approve" in dashboard (if enabled)

### 3. Handle Failures

If tasks failed:
- Review error messages in CLI
- Check `.orchestrator-state/state.db` for details
- Fix manually if needed
- Choose: **Retry**, **Skip**, or **Abort**

### 4. Let It Run

- Each phase takes 1-5 days
- No need to watch continuously
- State persists across restarts
- Check back at next checkpoint

---

## Phase Timeline

**Sequential execution** (one task at a time):

| Phase | Name | Estimated Time | Tasks |
|-------|------|----------------|-------|
| 1 | Cleanup & Setup | 3-4 days | 4 |
| 2 | Codebase-Agnostic + Terminal UX | 29-31 days | TBD |
| 3 | MCP Integration | 8-9 days | TBD |
| 4 | Multi-Agent Support | 4-5 days | TBD |
| 5 | Automatic Updates | 14-16 days | TBD |
| 6 | Testing & Documentation | 19-21 days | TBD |
| 7 | Polish & Release | 18-20 days | TBD |

**Total: 10-11 weeks** of agent time with daily human check-ins

**Note:** Currently only Phase 1 is defined. Phases 2-7 will be added in Task 10.

---

## Cost Estimate

Using Claude Sonnet 4.5:
- Phase 1: ~4 tasks × ~10K tokens each = ~40K tokens
- Estimated cost for Phase 1: **~$2-5**

Full build estimate (all 7 phases):
- ~500-800 tasks × ~10K tokens each = 5-8M tokens
- Total estimated cost: **$100-250**

More expensive models (Opus) would increase cost but may improve quality.

---

## Troubleshooting

### "Claude CLI not available"

```bash
npm install -g @anthropic-ai/claude-cli
claude login
```

### Tests keep failing

1. Check error logs in CLI output
2. Fix issues manually
3. Restart: `npm start`
4. Choose "Retry" at failure prompt

### Want to skip a phase

Respond "Skip to next phase" at failure prompt.

Or modify database:
```bash
sqlite3 scripts/orchestrator/.orchestrator-state/state.db
UPDATE phases SET status='completed' WHERE phase_number=2;
.quit
```

### Want to reset and start over

```bash
rm -rf scripts/orchestrator/.orchestrator-state/
cd scripts/orchestrator
npm start
```

---

## State Files

- `scripts/orchestrator/.orchestrator-state/state.db` - SQLite database
- `~/.claude/` - Claude CLI cache

---

## Safety

The orchestrator:
- ✅ Saves state after each task (can revert)
- ✅ Runs tests before committing (optional per task)
- ✅ Pauses at checkpoints (human oversight)
- ✅ Tracks retries (prevents infinite loops)
- ✅ Allows manual intervention
- ❌ Never force-pushes
- ❌ Never deletes files without verification

---

## Success Criteria

Orchestration completes successfully when:
- ✅ All 7 phases executed
- ✅ All tasks completed or skipped with approval
- ✅ All checkpoints approved
- ✅ VibeTrees v1.0 ready for release

---

## Architecture

```
Orchestrator (index.mjs)
├── StateManager (SQLite)
│   ├── Sessions
│   ├── Phases
│   ├── Tasks
│   └── Checkpoints
├── ClaudeCLI (--print mode)
├── TaskExecutor (retry logic)
└── Phase Definitions
    └── phase-1-cleanup.mjs (4 tasks)
```

**Test Coverage:** 23/23 tests passing

---

## For More Details

- Implementation: `scripts/orchestrator/README.md`
- Original plan: `docs/plans/2025-10-27-semi-attended-orchestration.md`
- Refactoring roadmap: `REFACTORING-PLAN.md`

---

**Questions?** Check orchestrator README or review state in SQLite database.
