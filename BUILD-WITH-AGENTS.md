# Building VibeTrees with AI Agents

This document explains how to use the automated agent-based build system to implement VibeTrees according to the 8-phase plan.

## Overview

The `build-with-agents.sh` script orchestrates multiple AI agents via Zen MCP to automatically implement the entire VibeTrees project. It:

- Reads the planning documents (PLANNING-SUMMARY-V2.md, TERMINAL-UX.md)
- Breaks down each phase into specific tasks
- Uses different Zen MCP tools for different purposes:
  - **planner** - Create detailed implementation plans
  - **chat** - Implement specific tasks
  - **debug** - Fix test failures
  - **codereview** - Validate phase completion
- Runs tests after each task
- Commits progress automatically
- Resumes from failures

## Prerequisites

1. **Claude CLI** with Zen MCP access:
   ```bash
   npm install -g @anthropic-ai/claude-cli
   ```

2. **Node.js 18+**

3. **Git configured** with GitHub authentication

## Usage

### Start from the beginning

```bash
./build-with-agents.sh
```

This will execute all 7 phases sequentially:
1. Cleanup & Setup (3-4 days)
2. Codebase-Agnostic + Terminal UX (29-31 days)
3. MCP Integration (8-9 days)
4. Multi-Agent Support (4-5 days)
5. Automatic Updates (14-16 days)
6. Testing & Documentation (19-21 days)
7. Polish & Release (18-20 days)

### Start from a specific phase

```bash
./build-with-agents.sh --phase 3
```

### Resume from failure

If the script fails (tests don't pass, etc.), it saves state and you can resume:

```bash
./build-with-agents.sh --resume
```

### Use a different model

```bash
./build-with-agents.sh --model gpt-5-pro
```

Available models via Zen MCP:
- `gpt-5` (default)
- `gpt-5-pro`
- `gpt-5-codex`
- `o3-pro`
- etc. (see `claude --mcp zen listmodels`)

## How It Works

### Phase Execution Flow

For each phase:

1. **Planning** - Uses `planner` tool to create detailed implementation plan
2. **Task Execution** - For each task:
   - Uses `chat` tool to implement
   - Follows TDD (tests first)
   - Runs test suite
   - If tests fail → use `debug` tool
3. **Review** - Uses `codereview` tool to validate completion
4. **Commit** - Commits changes with descriptive message
5. **Push** - Pushes to GitHub

### State Management

The script maintains state in `.agent-builder-state.json`:
```json
{
  "current_phase": 2,
  "status": "in_progress",
  "continuation_id": "abc123...",
  "timestamp": "2025-10-27T15:30:00Z",
  "model": "gpt-5"
}
```

This allows resuming from exactly where it left off.

### Continuation IDs

Zen MCP supports conversation continuity via continuation IDs. The script:
- Saves continuation IDs after each agent interaction
- Reuses them for follow-up tasks
- Maintains context across the entire build process

### Logging

All agent interactions are logged to `.agent-logs/`:
- `phase-N-plan.md` - Detailed plans
- `phase-N-task-M.log` - Implementation logs
- `phase-N-debug.log` - Debug sessions
- `phase-N-review.md` - Code reviews
- `test-TIMESTAMP.log` - Test outputs

## Example Session

```bash
$ ./build-with-agents.sh

[2025-10-27 15:30:00] VibeTrees Agent Builder Starting...
[2025-10-27 15:30:00] Model: gpt-5
[2025-10-27 15:30:01] Installing dependencies...
[2025-10-27 15:30:05] =========================================
[2025-10-27 15:30:05] Starting Phase 1
[2025-10-27 15:30:05] =========================================
[2025-10-27 15:30:05] === Phase 1: Cleanup & Setup ===
[2025-10-27 15:30:06] Creating detailed plan for Phase 1: Cleanup & Setup...
✓ Phase 1 plan created
[2025-10-27 15:30:08] Implementing Phase 1, Task 1: Remove scripts/worktree-manager.mjs...
[2025-10-27 15:32:15] Running test suite...
✓ Tests passed
✓ Task 1 completed
[2025-10-27 15:32:16] Implementing Phase 1, Task 2: Add --listen parameter...
...
```

## What Gets Implemented

### Phase 1: Cleanup & Setup
- Removes tmux CLI interface
- Adds `--listen` parameter
- Creates first-run wizard

### Phase 2: Codebase-Agnostic (Longest!)
- Container runtime abstraction (Docker/Podman)
- Dynamic service discovery
- Configuration system with repoRoot
- Port registry locking
- Single instance lock
- Disk space checks
- Dry-run mode
- Confirmation modals
- Diagnostic mode
- Import existing worktrees
- **Terminal persistence** (8 sub-tasks):
  - Terminal registry
  - Detach vs kill
  - Available terminals panel
  - UI session persistence
  - Session recovery modal
  - TTL warnings
  - Status indicators
  - Testing & polish
- Branch selector UI
- Branch cleanup on delete

### Phase 3: MCP Integration
- MCP auto-discovery
- npx execution (latest)
- Cross-worktree MCP bridge
- Minimal CLI

### Phase 4: Multi-Agent Support
- Agent abstraction
- Claude, Codex, Gemini support
- Agent selection UI

### Phase 5: Automatic Updates
- Sync with main branch
- Smart reload
- Comprehensive undo/rollback
- Snapshot management UI
- AI-assisted conflict resolution

### Phase 6: Testing & Documentation
- WebSocket schema validation
- 80%+ test coverage
- CI matrix (Docker + Podman)
- ESLint + Prettier
- Graceful shutdown
- VS Code integration
- Config export/import
- Comprehensive docs

### Phase 7: Polish & Release
- Performance optimization
- Log backpressure
- Resource dashboard
- Audit log viewer
- Notification system
- Self-update mechanism
- Uninstall tool
- Prometheus metrics

## Monitoring Progress

### Watch logs in real-time

```bash
tail -f .agent-logs/phase-2-task-6.log
```

### Check current state

```bash
cat .agent-builder-state.json
```

### View test results

```bash
npm test
```

### Check commits

```bash
git log --oneline
```

## Handling Failures

### Tests fail

The script automatically:
1. Detects test failure
2. Runs `debug` tool to analyze
3. Implements fixes
4. Re-runs tests
5. If still failing → stops and saves state

Resume with: `./build-with-agents.sh --resume`

### Manual intervention needed

If automated debugging doesn't work:

1. Review logs: `.agent-logs/phase-N-debug.log`
2. Fix issues manually
3. Run tests: `npm test`
4. Commit fixes: `git commit -am "Manual fix for Phase N"`
5. Resume: `./build-with-agents.sh --resume`

### Network issues

The script saves state frequently. Just resume:
```bash
./build-with-agents.sh --resume
```

## Estimated Timeline

**Sequential execution** (one agent at a time):
- Phase 1: ~4 hours
- Phase 2: ~3-4 days (longest, has terminal UX)
- Phase 3: ~1 day
- Phase 4: ~1 day
- Phase 5: ~2 days
- Phase 6: ~2-3 days
- Phase 7: ~2 days

**Total: ~12-14 days of agent time**

(Much faster than 10-11 weeks of human time!)

**Factors affecting speed**:
- Model speed (gpt-5-pro is faster than gpt-5)
- Test execution time
- Network latency
- Complexity of tasks

## Cost Estimate

Using Zen MCP with GPT-5:
- ~500-800 tasks × ~10K tokens each = 5-8M tokens
- Estimated cost: $50-150 (depending on model)

Using gpt-5-pro (faster, more expensive):
- Same tasks, faster execution
- Estimated cost: $150-300

## Tips for Success

1. **Start with a small phase** - Test with `--phase 1` first
2. **Monitor initial progress** - Watch the first few tasks to ensure it's working
3. **Let it run** - Can take hours/days, best to let it run unattended
4. **Check in periodically** - Review commits and logs
5. **Use fast model for speed** - `gpt-5-pro` or `gpt-5-codex`
6. **Resume on failure** - Always use `--resume` if interrupted

## Advanced Usage

### Run specific sub-phase

Edit the script to comment out phases you don't want:

```bash
# Comment out phases 3-7 to only run Phase 1-2
#        "phase_3_mcp"
#        "phase_4_multi_agent"
#        ...
```

### Custom task implementation

Add your own tasks to phase functions:

```bash
phase_1_cleanup() {
    # ... existing tasks ...

    # Custom task
    implement_task 1 99 "Your custom task description" || return 1
}
```

### Change model per phase

```bash
# Use gpt-5-codex for implementation-heavy phases
MODEL=gpt-5-codex ./build-with-agents.sh --phase 2

# Use gpt-5-pro for planning phases
MODEL=gpt-5-pro ./build-with-agents.sh --phase 6
```

## Troubleshooting

### "claude: command not found"

Install Claude CLI:
```bash
npm install -g @anthropic-ai/claude-cli
```

### "Zen MCP not available"

Ensure you have Zen MCP configured:
```bash
claude --mcp zen version
```

### Tests keep failing

1. Check test output: `.agent-logs/test-*.log`
2. Run tests manually: `npm test`
3. Fix manually if needed
4. Resume: `./build-with-agents.sh --resume`

### Out of tokens/quota

1. Wait for quota reset
2. Resume: `./build-with-agents.sh --resume`
3. Or switch model: `./build-with-agents.sh --resume --model gpt-5`

## Safety

The script:
- ✅ Commits frequently (can always revert)
- ✅ Runs tests before committing
- ✅ Saves state (can resume)
- ✅ Creates detailed logs
- ✅ Only modifies files in project directory
- ❌ Doesn't delete files without tests passing
- ❌ Doesn't push if tests fail

## Limitations

- Requires active internet connection
- Requires Claude CLI with Zen MCP access
- Can't handle merge conflicts (would need manual resolution)
- May need manual intervention for complex architecture decisions
- Test suite must be comprehensive (agents rely on tests)

## Success Criteria

The script completes successfully when:
- ✅ All 7 phases executed
- ✅ All tests passing (80%+ coverage)
- ✅ All commits pushed to GitHub
- ✅ Code review validation passed
- ✅ v1.0 ready for release

---

**Happy automated building!** 🤖🌳

For issues or questions, check the logs in `.agent-logs/` or review the state in `.agent-builder-state.json`.
