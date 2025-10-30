# CLAUDE.md

AI guidance for working with **VibeTrees** - a web-based orchestration tool for multiple git worktrees with AI agents and isolated services.

## Quick Start

```bash
npm run web              # Start web UI (localhost:3335)
npm test                 # Run test suite (621 tests)
npm run test:watch       # Watch mode
```

## Core Principles

- **TDD**: Write tests first, implement minimal code to pass
- **DRY**: Extract shared logic into reusable modules
- **SOLID**: Single responsibility, proper separation of concerns
- **621 tests**: Comprehensive coverage maintained

## Architecture

**Three-layer design**:

```
Web UI / CLI → Core Orchestration → Infrastructure
                (WorktreeManager,    (Git, Docker,
                 PortRegistry, etc)   PTY, MCP)
```

**Key components** (`scripts/`):
- `worktree-manager.mjs` - CLI orchestrator (674 lines)
- `worktree-web/server.mjs` - Web server (1445 lines)
- `port-registry.mjs` - Port allocation (82 lines)
- `git-sync-manager.mjs` - Git sync + change detection
- `smart-reload-manager.mjs` - Auto-reload services
- `ai-conflict-resolver.mjs` - AI conflict resolution
- `database-manager.mjs` - Import/export database
- `pty-session-manager.mjs` - Terminal persistence
- `mcp-manager.mjs` - MCP server discovery
- `agents/` - Pluggable AI agent system

## Development Workflow

### Testing (TDD)

**RED-GREEN-REFACTOR**:
1. Write failing test
2. Implement minimal code to pass
3. Refactor while keeping tests green

**Mocking**: Mock fs, child_process, os.homedir for fast, deterministic tests

```javascript
it('should allocate unique ports', () => {
  const registry = new PortRegistry();
  const port1 = registry.allocate('wt1', 'api', 3000);
  const port2 = registry.allocate('wt2', 'api', 3000);
  expect(port1).toBe(3000);
  expect(port2).toBe(3001);
});
```

### Code Organization

**Extract when > 300 lines**: Find ONE cohesive unit to extract

**Recent refactorings**:
- Extracted `PortRegistry` from `worktree-manager.mjs`
- Removed duplicate `PortRegistry` from `server.mjs`

**Single Responsibility**: Each class/function has one clear purpose

### Git Worktree Conventions

**Naming**: `feature/my-feature` → `feature-my-feature`

**Location**: `.worktrees/` directory at repo root

**Safety constraints**:
- Cannot delete main worktree
- Cannot delete worktrees outside `.worktrees/`
- Docker services stopped before deletion
- Ports released after deletion

## Key Features

### PortRegistry
Singleton registry preventing port conflicts. Persists to `~/.claude-worktrees/ports.json`.

```javascript
const registry = new PortRegistry();
const port = registry.allocate('feature-xyz', 'api', 3000);
registry.release('feature-xyz');
```

### MCP Integration
Auto-discovers and configures MCP servers on worktree creation:
1. Discover servers (local → npm project → npm global)
2. Generate `.claude/settings.json`
3. Inject environment variables
4. Add `vibe-bridge` for cross-worktree communication

**Vibe Bridge** provides: `list_worktrees`, `read_file_from_worktree`, `get_worktree_git_status`, `search_across_worktrees`

See [docs/mcp-integration.md](docs/mcp-integration.md) for details.

### Agent System
Pluggable AI agents per worktree. Built-in: Claude Code ✅, Shell ✅, Codex 🚧, Gemini 🚧

```javascript
import { agentRegistry } from './agents/index.mjs';
const agents = agentRegistry.list();
const agent = agentRegistry.create('claude', { worktreePath });
```

API: `GET /api/agents`, `GET /api/agents/:name`, `GET /api/agents/availability`

See [docs/adding-agents.md](docs/adding-agents.md) for custom agents.

### Dependency Management
Automatic dependency installation with smart fallback.

**Automatic installation**:
- **During worktree creation**: Checks for `bootstrap` script in package.json, falls back to `npm install`
- **During git sync**: Auto-detects changes to package files and reinstalls dependencies

**Manual installation**:
- API: `POST /api/worktrees/:name/dependencies/install`
- Supports: npm, pip, pipenv, poetry, bundle, go mod, cargo, composer

**Fallback logic**: If `package.json` has a `bootstrap` script, runs it. Otherwise, runs `npm install`.

### Git Sync & Smart Reload
Intelligent sync with automatic change detection and service management.

**Workflow**: Fetch → Analyze changes → Reinstall deps → Run migrations → Restart services → Notify AI

**Key managers**:
- `GitSyncManager` - Sync operations, rollback
- `ChangeDetector` - Analyze commit impacts
- `SmartReloadManager` - Auto-reload orchestration
- `AIConflictResolver` - Auto-resolve simple conflicts

**Supported**: npm, pip, pipenv, poetry, bundle, go mod, cargo, composer | Prisma, Sequelize, TypeORM, Django, Flask, Rails, Laravel, golang-migrate

**API**:
- `GET /api/worktrees/:name/check-updates`
- `POST /api/worktrees/:name/sync`
- `POST /api/worktrees/:name/rollback`
- `GET /api/worktrees/:name/conflicts`
- `POST /api/worktrees/:name/conflicts/resolve`

### Sync-on-Create

**Automatic staleness detection** when creating worktrees from 'main':
- Checks if main is behind origin before worktree creation
- Prompts user: "main is X commits behind. Sync? [Yes/No/Cancel]"
- Blocks creation if main has uncommitted changes
- Uses AIConflictResolver for simple conflicts during sync

**Workflow**: Check staleness → Prompt user → Sync (if needed) → Create worktree

**API**: POST /api/worktrees returns 409 if sync needed. Include `?force=true` to skip check.

See [docs/sync-on-create.md](docs/sync-on-create.md) for details.

### Database Workflow
Import/export with schema validation (PostgreSQL only).

```javascript
const manager = new DatabaseManager(worktreePath, ports);
await manager.exportFull(outputPath);
await manager.importWithTransaction(inputPath);
```

API: `POST /api/worktrees/:name/database/export`, `POST /api/worktrees/:name/database/import`

See [docs/database-workflow.md](docs/database-workflow.md) for details.

### Terminal Persistence
Sessions survive browser refresh. State saved every 5s to `~/.vibetrees/sessions/{id}/pty-state.json`.

Components: `PTYSessionManager`, `PTYStateSerializer`

See [docs/terminal-persistence.md](docs/terminal-persistence.md) for details.

### Performance Optimization
Target: 30s → 9.2s worktree creation (69% reduction via caching + parallel execution).

Current (v1.1): Profiler, cache manager, optimizer infrastructure, metrics API

Planned: Node modules caching (~8-10s), Docker BuildKit (~5-7s), lazy init (~3-5s)

See [docs/performance-optimization.md](docs/performance-optimization.md) for details.

## Reference

**Docker env vars** per worktree: `POSTGRES_PORT`, `API_PORT`, `CONSOLE_PORT`, `TEMPORAL_PORT`, `TEMPORAL_UI_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`

**Commands**: `sudo docker compose up -d | down -v | logs -f | ps -a --format json`

**Troubleshooting**:
- Port conflicts: Delete `~/.claude-worktrees/ports.json`
- Orphaned containers: `sudo docker compose down -v`
- Stale worktrees: `git worktree prune`
- Stuck tmux: `npm run kill && npm start`
- **Hanging tests** (legacy issue, fixed in vitest.config.mjs):
  - If you encounter orphaned workers: `pkill -9 -f "vitest/dist/workers/forks.js"`
  - Fixed by: `forceExit: true` + proper pool configuration in vitest.config.mjs
  - Config ensures graceful worker cleanup even on test failures/timeouts

**Related docs**:
- `worktree-manager.test.README.md` - Test suite documentation
- `docs/mcp-integration.md` - MCP server details
- `docs/adding-agents.md` - Custom agent guide
- `docs/sync-on-create.md` - Sync-on-create feature
- `docs/database-workflow.md` - Database operations
- `docs/terminal-persistence.md` - Terminal session recovery
- `docs/performance-optimization.md` - Performance profiling

**IMPORTANT**: DO NOT KILL PROCESSES YOU DID NOT SPAWN
