# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vibe Worktrees** is a standalone application for orchestrating multiple git worktrees with AI agents (Claude Code, Codex), tmux multiplexing, and isolated Docker services. It enables parallel development across feature branches with each worktree having its own AI assistant, terminal environment, and service ports.

## Core Values

This project adheres to clean coding standards as core values:
- **TDD (Test-Driven Development)**: Write tests first, watch them fail, implement minimal code to pass
- **DRY (Don't Repeat Yourself)**: Extract shared logic into reusable modules
- **SOLID Principles**: Single responsibility, proper separation of concerns
- **Comprehensive test coverage**: 59 tests covering all major code paths

## Common Commands

### Development Workflow

```bash
# Start/create tmux session with all worktrees
npm start

# Attach to existing session
npm attach

# Interactive management menu (create/delete worktrees, add/remove from session)
npm run manage

# Start web UI on localhost:3333
npm run web

# Kill the entire session
npm run kill
```

### Testing

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run specific test file
npx vitest run scripts/worktree-manager.test.mjs
```

## Architecture

### High-Level Design

The application follows a **three-layer architecture**:

1. **Core Layer** (`scripts/`)
   - Port registry for service isolation
   - Worktree manager orchestrating git, tmux, and Docker
   - Shared modules following DRY principles

2. **CLI Interface** (`worktree-manager.mjs`)
   - Interactive menu system
   - Direct command execution (start, attach, manage, kill)
   - Tmux session management with multi-pane layouts

3. **Web Interface** (`worktree-web/`)
   - Express server with WebSocket support
   - Browser-based UI for worktree management
   - Real-time terminal access via node-pty

### Key Components

#### `port-registry.mjs` (82 lines)
**Purpose**: Centralized port allocation to prevent conflicts between worktrees

**Responsibilities**:
- Persists port assignments to `~/.claude-worktrees/ports.json`
- Allocates unique ports for each service (postgres, api, console, temporal, minio)
- Releases ports when worktrees are deleted
- Handles port conflicts by incrementing until finding available port

**Key Pattern**: Singleton-style registry with file-based persistence

```javascript
// Usage example
const registry = new PortRegistry();
const port = registry.allocate('feature-xyz', 'api', 3000); // Returns 3000 or next available
registry.release('feature-xyz'); // Frees all ports for this worktree
```

#### `worktree-manager.mjs` (674 lines)
**Purpose**: Orchestrates the lifecycle of git worktrees with tmux and Docker

**Architecture**:
- **WorktreeManager** class with single responsibility methods
- Integrates: Git worktrees, tmux sessions, Docker Compose, port registry
- Follows **Command Pattern** for operations (create, delete, add, remove)

**Key Workflows**:

1. **Worktree Creation**:
   ```
   Create git worktree → Allocate ports → Start Docker services →
   Create tmux window → Split panes (Claude | Logs | Shell) →
   Launch Claude Code in left pane
   ```

2. **Tmux Layout** (3 panes per worktree):
   - **Pane 0** (70% left): Claude Code or Codex AI assistant
   - **Pane 1** (30% top-right): Docker logs (`docker compose logs -f`)
   - **Pane 2** (30% bottom-right): Shell for manual commands

3. **Session Management**:
   - **Window 0**: Manager menu (interactive control)
   - **Windows 1+**: One per worktree with 3-pane layout
   - Hot-add/remove worktrees without restarting session

**Docker Integration**:
- Each worktree gets isolated services with unique ports
- Services: postgres, api, console, temporal, temporal-ui, minio, minio-console
- Environment variables passed explicitly (sudo doesn't preserve env)
- Orphaned containers cleaned up before starting new services

#### `worktree-web/server.mjs` (1445 lines)
**Purpose**: Web-based alternative to CLI with real-time terminal access

**Architecture**:
- **Express** server for HTTP routes and static file serving
- **WebSocket** for bidirectional communication with browser
- **node-pty** for spawning pseudo-terminals (Claude, Codex, shell)
- **PTYManager** class for terminal session lifecycle

**Key Features**:
- Browser-based xterm.js terminals with full interactivity
- Real-time worktree status updates (git, Docker, ports)
- Create/delete worktrees from web UI
- Launch different AI assistants per worktree (Claude, Codex, shell)

**API Design** (WebSocket events):
```javascript
// Client → Server
{ event: 'list-worktrees' }
{ event: 'create-worktree', data: { branch, fromBranch } }
{ event: 'delete-worktree', data: { name } }
{ event: 'start-services', data: { name } }
{ event: 'connect-terminal', data: { name, command } }

// Server → Client
{ event: 'worktrees', data: [...] }
{ event: 'worktree-created', data: {...} }
{ event: 'error', data: { message } }
```

### Data Flow

```
User Action (CLI/Web)
    ↓
WorktreeManager
    ↓
├─→ Git Worktree (create/delete branches in .worktrees/)
├─→ PortRegistry (allocate/release ports)
├─→ Docker Compose (start/stop services with env vars)
└─→ Tmux/PTY (create windows/terminals, launch AI agents)
```

### File Structure

```
scripts/
├── port-registry.mjs           # Shared port allocation logic
├── worktree-manager.mjs        # CLI orchestrator
├── worktree-manager.test.mjs   # Comprehensive test suite (59 tests)
├── worktree-manager.test.README.md  # Test documentation
└── worktree-web/
    ├── server.mjs              # Web server with WebSocket
    └── public/                 # Browser UI (HTML, CSS, JS)
        ├── index.html
        ├── css/
        ├── js/
        └── manifest.json       # PWA support
```

## Development Patterns

### Testing Strategy (TDD)

**RED-GREEN-REFACTOR cycle**:
1. Write failing test for new functionality
2. Implement minimal code to pass
3. Refactor while keeping tests green

**Mocking approach**:
- Filesystem operations (`fs` module)
- Child processes (`child_process.execSync`, `spawn`)
- System utilities (`os.homedir`)

This ensures:
- Fast test execution (no actual I/O)
- No external dependencies (tmux, docker, git)
- Deterministic and repeatable tests

**Example test structure**:
```javascript
it('should allocate unique ports for different services', () => {
  // Arrange: Setup mocks and initial state
  const registry = new PortRegistry();

  // Act: Execute the operation
  const apiPort = registry.allocate('worktree1', 'api', 3000);
  const dbPort = registry.allocate('worktree1', 'postgres', 5432);

  // Assert: Verify behavior
  expect(apiPort).toBe(3000);
  expect(dbPort).toBe(5432);
});
```

### Code Organization Principles

**Extract when over 300 lines**: If a file exceeds 300 lines, find ONE cohesive unit to extract into a separate module. Recent refactorings:
- Extracted `PortRegistry` from `worktree-manager.mjs` → `port-registry.mjs`
- Removed duplicate `PortRegistry` from `worktree-web/server.mjs`

**Shared modules**: Common logic lives in dedicated files and is imported where needed. No code duplication across CLI and web interfaces.

**Single Responsibility**: Each class/function has one clear purpose:
- `PortRegistry`: Only manages port allocation
- `PTYManager`: Only manages terminal sessions
- `WorktreeManager`: Orchestrates, but delegates to specialized components

### Git Worktree Conventions

**Worktree naming**: Branch names with slashes are converted to hyphens
```bash
feature/my-feature → feature-my-feature
```

**Location**: All worktrees created in `.worktrees/` directory at repo root
```
project/
├── .git/
├── .worktrees/
│   ├── feature-auth/
│   ├── bugfix-login/
│   └── experiment-perf/
└── ... (main worktree files)
```

**Safety constraints**:
- Cannot delete main worktree
- Cannot delete worktrees outside `.worktrees/`
- Docker services stopped before deletion
- Ports released after successful deletion

## Tmux Keybindings

When attached to session (`npm attach`):

| Key | Action |
|-----|--------|
| `Ctrl+b n` | Next window |
| `Ctrl+b p` | Previous window |
| `Ctrl+b 0` | Jump to manager window |
| `Ctrl+b 1-9` | Jump to worktree window |
| `Ctrl+b w` | List all windows (interactive) |
| `Ctrl+b o` | Cycle through panes in current window |
| `Ctrl+b d` | Detach (session keeps running) |
| `Ctrl+b x` | Kill current pane/window |

## Port Allocation Scheme

Each worktree gets a unique port for each service, starting from base port and incrementing:

| Service | Base Port | Worktree 1 | Worktree 2 | Worktree 3 |
|---------|-----------|------------|------------|------------|
| API | 3000 | 3000 | 3001 | 3002 |
| Console | 5173 | 5173 | 5174 | 5175 |
| Postgres | 5432 | 5432 | 5433 | 5434 |
| Temporal | 7233 | 7233 | 7234 | 7235 |
| Temporal UI | 8233 | 8233 | 8234 | 8235 |
| Minio | 9000 | 9000 | 9001 | 9002 |
| Minio Console | 9001 | 9001 | 9003 | 9005 |

Port assignments persist in `~/.claude-worktrees/ports.json` and survive session restarts.

## Docker Compose Integration

**Environment variables** passed to each worktree's `docker-compose.yml`:
```bash
POSTGRES_PORT=5432
API_PORT=3000
CONSOLE_PORT=5173
TEMPORAL_PORT=7233
TEMPORAL_UI_PORT=8233
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
```

**Service management**:
- `sudo docker compose up -d`: Start services in detached mode
- `sudo docker compose down -v`: Stop and remove volumes (clean slate)
- `sudo docker compose logs -f`: Stream logs (displayed in tmux pane 1)
- `sudo docker compose ps -a --format json`: Check service health

**Health checking**: Services start in background, UI doesn't block waiting. Monitor logs in tmux pane 1 or check with `docker compose ps`.

## Known Design Decisions

1. **Why sudo for Docker commands?**
   - Ensures consistent behavior across systems where Docker requires elevated privileges
   - Environment variables passed explicitly since sudo doesn't preserve them

2. **Why not restart services on session creation?**
   - Services may already be running from previous session
   - Starting/stopping is expensive (~30s startup time)
   - User can manually restart from manager menu if needed

3. **Why tmux instead of VS Code workspaces?**
   - Terminal-first workflow for AI agents
   - Lightweight and scriptable
   - SSH-friendly for remote development
   - Easy to detach/reattach without losing state

4. **Why separate CLI and web interfaces?**
   - CLI for power users and automation
   - Web for teams without tmux experience
   - Both use same core logic (DRY principle)

## Troubleshooting

**Port conflicts**: If services fail to start, check `~/.claude-worktrees/ports.json` for conflicts. Delete the file to reset all allocations.

**Orphaned containers**: The manager automatically cleans up orphaned containers before starting services. If Docker is in a bad state, run:
```bash
sudo docker compose down -v
```

**Stale worktrees**: If git worktree list shows worktrees that don't exist, clean up with:
```bash
git worktree prune
```

**Tmux session stuck**: Kill and restart:
```bash
npm run kill
npm start
```

## Related Files

- `worktree-manager.test.README.md`: Detailed test suite documentation
- `package.json`: Scripts and dependencies
- `.worktrees/`: Git worktree storage (created automatically)
- `~/.claude-worktrees/ports.json`: Port registry (created automatically)
