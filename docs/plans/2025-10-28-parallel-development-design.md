# Parallel Development Design
**Date:** 2025-10-28
**Status:** Approved
**Approach:** Three independent worktrees with specialized AI agents

## Overview

This design implements true parallel development for VibeTrees using three isolated git worktrees, each managed by a specialized AI agent working autonomously on distinct features.

### Features & Agent Assignments

1. **Terminal Persistence** - Claude Code
   - Survive browser refresh/disconnect
   - Preserve terminal history and running processes

2. **Database Workflow** - Codex
   - Complete import/export functionality
   - Schema migration and validation

3. **Performance Optimization** - GPT-5 Pro
   - Reduce worktree creation time (30s → <15s target)
   - Parallel operations and intelligent caching

## Architecture

### Core Design Principles

- **Zero shared code during development** - Features evolve independently in separate files
- **Agent autonomy** - Each agent owns their domain completely, no cross-communication
- **Merge conflict isolation** - Development in non-overlapping files
- **Asynchronous integration** - Manual review/merge at weekly checkpoints
- **TDD compliance** - All agents follow RED-GREEN-REFACTOR cycle

### Worktree Structure

```
.worktrees/
├── feature-terminal-persist/    # Claude Code's workspace
├── feature-database-workflow/   # Codex's workspace
└── feature-performance/          # GPT-5 Pro's workspace
```

## Feature 1: Terminal Persistence (Claude Code)

### Problem Statement
Browser refresh or network disconnect destroys PTY sessions, losing all terminal history, running processes, and agent conversation context.

### Solution Components

#### 1. PTY State Serialization
- **Capture:** Terminal buffer, cursor position, scroll state, dimensions
- **Storage:** Server-side at `~/.vibetrees/sessions/{worktree-name}/pty-state.json`
- **Update frequency:** Every 5 seconds + on disconnect event

#### 2. Session Recovery Protocol
- Browser reconnects → Check for existing session ID
- Restore terminal buffer to xterm.js → Resume PTY connection
- Handle race condition during reconnection window

#### 3. Process Preservation
- PTY processes continue running server-side when browser disconnects
- WebSocket reconnection reattaches to same PTY instance
- Timeout: Kill orphaned PTYs after 24 hours of inactivity

### File Changes (Isolated)
- Extract `PTYManager` from `worktree-web/server.mjs` → `scripts/pty-session-manager.mjs`
- **New:** `scripts/pty-state-serializer.mjs` (state capture/restore logic)
- **New:** `scripts/pty-session-manager.test.mjs` (TDD test suite)
- **Update:** `worktree-web/public/js/terminal.js` (reconnection logic)

### Success Criteria
- ✅ Browser refresh preserves terminal history
- ✅ Network disconnect <30s automatically reconnects
- ✅ Running commands (npm, docker) continue executing
- ✅ Agent conversation context preserved

## Feature 2: Database Workflow (Codex)

### Problem Statement
System lacks database import/export functionality needed for data migration, backups, and environment cloning.

### Solution Components

#### 1. Export Workflow
- **Schema export:** `pg_dump --schema-only` for DDL
- **Data export:** `pg_dump --data-only --inserts` for portability
- **Format options:** SQL, JSON, CSV per-table
- **Compression:** gzip for datasets >100MB

#### 2. Import Workflow
- **Pre-validation:** Schema compatibility check, version mismatch detection
- **Transaction safety:** Wrap in BEGIN/COMMIT, auto-rollback on error
- **Conflict resolution:** Skip existing, replace, or fail-fast modes
- **Progress tracking:** Stream progress via WebSocket (rows processed/total)

#### 3. Migration Support
- Auto-detect Prisma/Sequelize/TypeORM schemas
- Generate migration scripts from schema diffs
- Apply migrations with dry-run preview
- Track migration history in `~/.vibetrees/migrations/{worktree-name}/`

### File Changes (Isolated)
- **New:** `scripts/database-manager.mjs` (export/import orchestration)
- **New:** `scripts/database-validator.mjs` (schema compatibility checks)
- **New:** `scripts/database-manager.test.mjs` (TDD with mocked pg_dump/psql)
- **Update:** `worktree-web/server.mjs` (add `/api/database/*` endpoints)
- **Update:** `worktree-web/public/index.html` (database UI section)

### API Endpoints
- `POST /api/worktrees/:name/database/export` → Returns download link
- `POST /api/worktrees/:name/database/import` → Upload file + apply
- `GET /api/worktrees/:name/database/schema` → Current schema info
- `POST /api/worktrees/:name/database/migrate` → Run pending migrations

### Success Criteria
- ✅ Export database from any worktree to portable format
- ✅ Import database into fresh worktree with validation
- ✅ Detect and prevent incompatible schema imports
- ✅ Progress feedback during operations >10s

## Feature 3: Performance Optimization (GPT-5 Pro)

### Problem Statement
Worktree creation takes ~30 seconds due to sequential operations. Target: <15s (flexible).

### Solution Components

#### 1. Parallel Operation Pipeline
- **Stage 1 (parallel):** Git worktree creation + Docker image pre-pull
- **Stage 2 (parallel):** npm install + MCP discovery + port allocation
- **Stage 3 (sequential):** Docker compose up (requires ports from Stage 2)

#### 2. Intelligent Caching
- **Node modules:** Hardlink from `~/.vibetrees/cache/node_modules/` (saves ~8s)
- **Docker layers:** Reuse images across worktrees (saves ~5s)
- **MCP servers:** Cache discovery results, invalidate on package.json change

#### 3. Lazy Initialization
- **Critical services first:** Start postgres immediately
- **Defer non-critical:** Delay minio/temporal startup
- **Background completion:** Return "ready" when terminal available, finish services in background

#### 4. Profiling Infrastructure
- Instrument operation timing
- Bottleneck detection per worktree creation
- Performance metrics dashboard in web UI

### File Changes (Isolated)
- **New:** `scripts/performance-optimizer.mjs` (parallel orchestration)
- **New:** `scripts/cache-manager.mjs` (node_modules + docker caching)
- **New:** `scripts/performance-optimizer.test.mjs` (timing verification)
- **Update:** `scripts/worktree-manager.mjs` (use optimizer instead of sequential logic)
- **New:** `scripts/profiler.mjs` (timing instrumentation)

### Optimization Targets
| Operation | Current | Target | Method |
|-----------|---------|--------|--------|
| Git worktree add | 2s | 2s | (baseline) |
| npm install | 12s | 3s | Hardlink cache |
| Docker compose up | 15s | 4s | Layer cache + lazy init |
| MCP discovery | 1s | 0.2s | Result cache |
| **Total** | **30s** | **9.2s** | **(flexible: 10-15s acceptable)** |

### Success Criteria
- ✅ Worktree creation completes in <15s (significant improvement)
- ✅ Cache invalidation works correctly (no stale dependencies)
- ✅ Parallel operations don't introduce race conditions
- ✅ Performance metrics visible in web UI

## Coordination & Integration Strategy

### File Boundary Enforcement

Each feature develops in isolated files to prevent conflicts:

- **Terminal Persistence:** `scripts/pty-*.mjs`, `worktree-web/public/js/terminal.js`
- **Database Workflow:** `scripts/database-*.mjs`, API endpoints `/api/database/*`
- **Performance:** `scripts/performance-*.mjs`, `scripts/cache-manager.mjs`
- **Shared touchpoint:** `scripts/worktree-manager.mjs` (expect coordination conflicts)

### Integration Checkpoints (Manual Merge Events)

| Checkpoint | Timing | Feature | Action |
|------------|--------|---------|--------|
| 1 | Week 2 | Terminal Persistence | Merge to main, human review |
| 2 | Week 3 | Database Workflow | Merge to main, human review |
| 3 | Week 4 | Performance | Merge to main, human review |

### Conflict Resolution Strategy

- **worktree-manager.mjs conflicts:** Expected, resolve with git-sync + AI assistance
- **Test conflicts:** Merge test files, run full suite to verify
- **Documentation conflicts:** Human review and merge

### Communication Protocol

- **Agent independence:** No cross-worktree messaging during development
- **Human coordinator:** Reviews progress in each worktree weekly
- **Status checks:** Visit each worktree, ask agent for progress report
- **Conflict resolution:** Use existing AI Conflict Resolver for merge issues

### Shared Resources (Read-Only)

- Test infrastructure: `vitest.config.js`, existing test utilities
- Core classes: `PortRegistry`, existing managers (no modifications allowed)
- Documentation: Each agent adds their own docs, no conflicts expected

### Risk Mitigation

- **Daily backups:** Human runs `git push` on all three worktrees
- **Rollback plan:** Each feature branch can be abandoned if blocked
- **Sequential fallback:** If parallel causes issues, finish features one-by-one

## Testing Strategy

### TDD Approach
All three agents follow RED-GREEN-REFACTOR cycle:
1. Write failing test for new functionality
2. Implement minimal code to pass
3. Refactor while keeping tests green

### Test Organization
```
scripts/
  pty-session-manager.test.mjs          # Terminal Persistence (Claude)
  pty-state-serializer.test.mjs
  database-manager.test.mjs             # Database Workflow (Codex)
  database-validator.test.mjs
  performance-optimizer.test.mjs        # Performance (GPT-5 Pro)
  cache-manager.test.mjs
  worktree-manager.test.mjs             # Integration tests (all features)
```

### Mocking Strategy
- **Filesystem:** Mock `fs.readFileSync`, `fs.writeFileSync`
- **Child processes:** Mock `execSync`, `spawn`
- **PTY:** Mock `node-pty` for terminal tests
- **Database:** Mock `pg_dump`, `psql` commands
- **Docker:** Mock `docker compose` commands

### Coverage Goals
- **Unit tests:** 90%+ per feature module
- **Integration tests:** Critical paths (create worktree → use feature)
- **E2E tests:** Add post-merge (not during parallel development)

## Success Metrics & Timeline

### Feature Completion Metrics

| Feature | Agent | Target | Success Indicator |
|---------|-------|--------|-------------------|
| Terminal Persistence | Claude Code | Week 2 | Browser refresh preserves session |
| Database Workflow | Codex | Week 3 | Export/import works with validation |
| Performance | GPT-5 Pro | Week 4 | <15s worktree creation |

### Development Timeline

- **Week 1:** Parallel development kickoff (all 3 features in progress)
- **Week 2:** Integration checkpoint 1 (merge terminal persistence)
- **Week 3:** Integration checkpoint 2 (merge database workflow)
- **Week 4:** Integration checkpoint 3 (merge performance)
- **Week 5:** Polish, documentation, final testing

### Risk Tolerance

- **Performance target flexible:** 10-15s acceptable, 15-20s still valuable
- **Quality over speed:** Better to take extra time than ship broken code
- **Sequential fallback:** If conflicts block progress, finish one feature at a time

## Implementation Notes

### Agent Configuration

Each worktree will be configured with its assigned agent:

```bash
# Terminal Persistence
cd .worktrees/feature-terminal-persist
# Claude Code (default) - no configuration needed

# Database Workflow
cd .worktrees/feature-database-workflow
# Configure for Codex via web UI agent selector

# Performance
cd .worktrees/feature-performance
# Configure for GPT-5 Pro via web UI agent selector
```

### Coordination Touchpoints

Human coordinator should:
1. **Daily:** Check each worktree for progress/blockers
2. **Weekly:** Run integration checkpoint, resolve conflicts
3. **On merge:** Review diffs, run full test suite, verify features
4. **Continuous:** Monitor for shared file modifications (alert on conflict risk)

## Conclusion

This parallel development approach maximizes throughput by enabling three specialized AI agents to work simultaneously on isolated features. The asynchronous integration strategy minimizes blocking while ensuring eventual coherence through manual review checkpoints.

**Key Success Factors:**
- File isolation prevents most merge conflicts
- Agent specialization matches features to AI strengths
- Flexible targets accommodate real-world development constraints
- TDD ensures quality throughout parallel development
