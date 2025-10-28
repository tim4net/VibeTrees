# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VibeTrees** is a web-based application for orchestrating multiple git worktrees with AI agents (Claude Code, Codex, Gemini) and isolated Docker/Podman services. It enables parallel development across feature branches with each worktree having its own AI assistant, browser-based terminal, and unique service ports.

**Current Status**: v1.0 - Interactive development mode (web-only interface, git sync, smart reload, AI conflict resolution)
**Development Approach**: Interactive, human-driven development (no autonomous orchestration)

## Core Values

This project adheres to clean coding standards as core values:
- **TDD (Test-Driven Development)**: Write tests first, watch them fail, implement minimal code to pass
- **DRY (Don't Repeat Yourself)**: Extract shared logic into reusable modules
- **SOLID Principles**: Single responsibility, proper separation of concerns
- **Comprehensive test coverage**: 486 tests covering all major code paths
- **Interactive Development**: Human-driven, collaborative approach (no autonomous orchestration)

## Common Commands

### Development Workflow

```bash
# Start web UI on localhost:3335 (localhost only, secure default)
npm run web

# Or allow network access (listen on all interfaces)
npm run web -- --listen

# First-run wizard automatically creates ~/.vibetrees/config.json
# Edit config manually: ~/.vibetrees/config.json
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
├── git-sync-manager.mjs        # Git sync and change detection (Phase 5.1)
├── git-sync-manager.test.mjs   # Git sync test suite (80 tests)
├── smart-reload-manager.mjs    # Smart reload orchestration (Phase 5.2)
├── smart-reload-manager.test.mjs  # Smart reload test suite (46 tests)
├── ai-conflict-resolver.mjs    # AI conflict resolution (Phase 5.3)
├── ai-conflict-resolver.test.mjs  # Conflict resolution test suite (47 tests)
└── worktree-web/
    ├── server.mjs              # Web server with WebSocket
    └── public/                 # Browser UI (HTML, CSS, JS)
        ├── index.html
        ├── css/
        ├── js/
        └── manifest.json       # PWA support
```

## MCP Integration

**Model Context Protocol (MCP)** servers provide AI agents with access to external tools and data. Vibe automatically discovers, configures, and manages MCP servers for each worktree.

### Automatic Configuration

When a worktree is created, Vibe:
1. **Discovers** installed MCP servers (npm packages, local servers, global installs)
2. **Generates** `.claude/settings.json` with MCP server configurations
3. **Injects** environment variables (e.g., database URLs with allocated ports)
4. **Adds** `vibe-bridge` server for cross-worktree communication

### MCP Manager (`scripts/mcp-manager.mjs`)

**Purpose**: Automatic MCP server discovery and configuration management

**Key Features**:
- Discovers MCP servers from 3 sources (priority: local > npm-project > npm-global)
- Generates `.claude/settings.json` per worktree
- Deduplicates servers across sources
- Supports custom environment variables per server

**Discovery Priority**:
1. **Local** (`./mcp-servers/`) - Highest priority, project-specific servers
2. **npm project** (`package.json` dependencies) - Package-managed servers
3. **npm global** (`npm list -g`) - Lowest priority, shared servers

**Usage**:
```javascript
const mcpManager = new McpManager(projectRoot, runtime);

// Discover all MCP servers
const servers = mcpManager.discoverServers();

// Generate configuration for worktree
mcpManager.generateClaudeSettings(worktreePath, servers, {
  serverEnv: {
    postgres: {
      DATABASE_URL: `postgresql://localhost:${ports.postgres}/vibe`
    }
  }
});
```

### Vibe Bridge Server (`scripts/mcp-bridge-server.mjs`)

**Purpose**: Enable cross-worktree communication for AI agents

**Tools Provided**:
- `list_worktrees` - List all active worktrees
- `read_file_from_worktree` - Read files from other worktrees
- `get_worktree_git_status` - Get git status for any worktree
- `search_across_worktrees` - Search patterns across all worktrees

**Security**:
- Read-only access (cannot modify other worktrees)
- Path traversal protection
- 1MB file size limit
- Sandbox isolation per worktree

**Use Cases**:
- Compare implementations across branches
- Sync knowledge between agents
- Cross-branch refactoring analysis
- Conflict prevention

### Official MCP Servers

**Recommended**:
- `@modelcontextprotocol/server-filesystem` - File read/write operations
- `@modelcontextprotocol/server-git` - Git history and diffs

**Optional**:
- `@modelcontextprotocol/server-github` - GitHub API access
- `@modelcontextprotocol/server-postgres` - PostgreSQL querying
- `@modelcontextprotocol/server-sqlite` - SQLite querying

**Installation**:
```bash
npm install --save-dev @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git
```

### Custom MCP Servers

Create custom servers in `mcp-servers/` directory:

```
mcp-servers/
  my-server/
    package.json
    index.js
```

Vibe will automatically discover and configure them. See [docs/mcp-integration.md](docs/mcp-integration.md) for details.

## Agent System

**Pluggable AI agent support** enables users to choose their preferred AI assistant per worktree. Vibe supports multiple agent CLIs with a unified interface.

### Agent Abstraction Layer (`scripts/agents/`)

**Purpose**: Generic interface for AI agent integrations

**Components**:
- `agent-interface.mjs` - Abstract base class defining agent contract
- `claude-agent.mjs` - Anthropic's Claude Code implementation
- `codex-agent.mjs` - OpenAI Codex implementation (hypothetical)
- `gemini-agent.mjs` - Google Gemini implementation (hypothetical)
- `shell-agent.mjs` - Plain shell (no AI)
- `index.mjs` - Agent registry and factory

### AgentInterface API

**Required Methods**:
- `async spawn(worktreePath, options)` - Spawn agent CLI as PTY
- `getDefaultArgs()` - Get CLI arguments
- `getConfigPath(worktreePath)` - Get config directory path

**Optional Methods**:
- `needsCacheClear()` - Cache clearing requirement
- `getDisplayName()` - Human-readable name
- `getIcon()` - UI icon/emoji
- `async isInstalled()` - Installation check
- `async checkVersion()` - Version detection
- `getEnvironmentVariables(worktreePath)` - Environment setup
- `getCapabilities()` - Agent capability list
- `validateConfig()` - Config validation
- `async installDependencies()` - CLI installation
- `async cleanup(worktreePath)` - Cleanup on deletion

### Agent Registry

**Purpose**: Central management of available agents

**Usage**:
```javascript
import { agentRegistry } from './agents/index.mjs';

// List agents
const agents = agentRegistry.list(); // ['claude', 'codex', 'gemini', 'shell']

// Create instance
const agent = agentRegistry.create('claude', { worktreePath: '/path' });

// Get metadata
const metadata = await agentRegistry.getMetadata('claude');
// { name, displayName, icon, capabilities, installed, available }

// Check availability
const availability = await agentRegistry.checkAvailability();
// { claude: true, codex: false, gemini: false, shell: true }
```

### Built-in Agents

| Agent | Package | Icon | Status |
|-------|---------|------|--------|
| **Claude Code** | `@anthropic-ai/claude-code` | 🤖 | ✅ Fully supported |
| **Codex** | `@openai/codex-cli` | 🔮 | 🚧 Hypothetical CLI |
| **Gemini** | `gemini-cli` | ✨ | 🚧 Hypothetical CLI |
| **Shell** | System shell | 💻 | ✅ Always available |

### Adding Custom Agents

Create agent class extending `AgentInterface`:

```javascript
// scripts/agents/my-agent.mjs
import { AgentInterface } from './agent-interface.mjs';
import pty from 'node-pty';

export class MyAgent extends AgentInterface {
  constructor(config = {}) {
    super('my-agent', config);
  }

  async spawn(worktreePath, options = {}) {
    return pty.spawn('npx', ['-y', 'my-agent-cli@latest'], {
      cwd: worktreePath,
      env: { ...process.env, ...options.env },
      cols: options.cols || 80,
      rows: options.rows || 30
    });
  }

  getDefaultArgs() {
    return ['-y', 'my-agent-cli@latest'];
  }

  getConfigPath(worktreePath) {
    return join(worktreePath, '.my-agent');
  }
}
```

Register in `scripts/agents/index.mjs`:

```javascript
import { MyAgent } from './my-agent.mjs';

_registerBuiltInAgents() {
  // ... existing agents
  this.register('my-agent', MyAgent);
}
```

See [docs/adding-agents.md](docs/adding-agents.md) for complete guide.

### API Endpoints

**GET `/api/agents`** - List all agents with metadata
```json
[
  {
    "name": "claude",
    "displayName": "Claude Code",
    "icon": "🤖",
    "capabilities": ["MCP Support", "Code Generation", "..."],
    "installed": true,
    "available": true
  }
]
```

**GET `/api/agents/:name`** - Get specific agent metadata

**GET `/api/agents/availability`** - Check agent availability
```json
{
  "claude": true,
  "codex": false,
  "gemini": false,
  "shell": true
}
```

## Git Sync & Smart Reload (Phase 5)

**Intelligent git synchronization** with automatic change detection, service management, and AI-assisted conflict resolution. Phase 5 eliminates manual steps after git syncs by automatically detecting what changed and taking appropriate actions.

### Overview

When you sync a worktree with the main branch, Vibe:
1. **Fetches updates** from origin and detects commits behind
2. **Analyzes changes** to identify impacts (services, dependencies, migrations)
3. **Automatically reinstalls** dependencies when package files change
4. **Runs migrations** when migration files are detected
5. **Restarts affected services** in correct dependency order
6. **Resolves simple conflicts** automatically (whitespace, version bumps)
7. **Notifies AI agents** of important changes via terminal

### Git Sync Manager (`scripts/git-sync-manager.mjs`)

**Purpose**: Handles git sync operations and intelligent change detection

**Key Classes**:

#### **GitSyncManager**
Manages git sync operations (fetch, merge, rebase, rollback)

```javascript
const syncManager = new GitSyncManager(worktreePath, 'main');

// Check for updates from main
const updates = await syncManager.fetchUpstream();
// { hasUpdates: true, commitCount: 5, commits: [...], baseBranch: 'main' }

// Sync with main branch
const result = await syncManager.syncWithMain('merge', { force: false });
// { success: true, output: '...', previousCommit: 'abc123' }

// Rollback if needed
await syncManager.rollback('abc123');
```

**Methods**:
- `fetchUpstream()` - Fetch from origin and count commits behind
- `hasUncommittedChanges()` - Check for uncommitted changes
- `syncWithMain(strategy, options)` - Merge or rebase with main
- `rollback(commitSha)` - Reset to previous commit
- `analyzeChanges(commitShas)` - Analyze commit impacts

#### **ChangeDetector**
Analyzes git changes to determine impacts on services and dependencies

```javascript
const detector = new ChangeDetector(worktreePath);

// Analyze changes from commits
const analysis = await detector.analyzeChanges(['abc123', 'def456']);
// {
//   needsServiceRestart: true,
//   needsDependencyInstall: true,
//   needsMigration: { hasMigrations: true, count: 2, files: [...] },
//   affectedServices: ['api', 'worker'],
//   changedFiles: [...],
//   summary: { total: 15, services: [...], dependencies: [...] }
// }

// Build service dependency graph
const graph = detector.buildServiceDependencyGraph();
// Map<'api', ['postgres', 'redis']>

// Get restart order (topological sort)
const order = detector.getRestartOrder(['api', 'worker']);
// [['postgres', 'redis'], ['api', 'worker']]
```

**Detection Capabilities**:
- **Service changes**: docker-compose.yml, Dockerfile, .env files
- **Dependencies**: package.json, requirements.txt, Gemfile, go.mod, Cargo.toml, composer.json
- **Migrations**: Prisma, Sequelize, TypeORM, Django, Flask, Rails, Laravel, golang-migrate
- **Affected services**: Maps files to services using docker-compose.yml context

### Smart Reload Manager (`scripts/smart-reload-manager.mjs`)

**Purpose**: Automatically reinstall dependencies, run migrations, and restart services

**Key Class**: **SmartReloadManager**

```javascript
const reloadManager = new SmartReloadManager(worktreePath, runtime);

// Perform smart reload based on analysis
const result = await reloadManager.performSmartReload(analysis, {
  skipDependencies: false,
  skipMigrations: false,
  skipRestart: false,
  continueOnError: false
});
// {
//   success: true,
//   actions: [
//     { action: 'reinstall_dependencies', success: true, installed: [...] },
//     { action: 'run_migrations', success: true, migrations: [...] },
//     { action: 'restart_services', success: true, services: ['api', 'worker'] }
//   ],
//   errors: []
// }
```

**Supported Package Managers**:
- **npm** (Node.js) - `npm install`
- **pip** (Python) - `pip install -r requirements.txt`
- **pipenv** (Python) - `pipenv install`
- **poetry** (Python) - `poetry install`
- **bundle** (Ruby) - `bundle install`
- **go mod** (Go) - `go mod download`
- **cargo** (Rust) - `cargo build`
- **composer** (PHP) - `composer install`

**Supported Migration Frameworks**:
- **Prisma** (Node.js) - `npx prisma migrate deploy`
- **Sequelize** (Node.js) - `npx sequelize-cli db:migrate`
- **TypeORM** (Node.js) - `npx typeorm migration:run`
- **Django** (Python) - `python manage.py migrate`
- **Flask/Alembic** (Python) - `flask db upgrade`
- **Rails** (Ruby) - `bundle exec rake db:migrate`
- **Laravel** (PHP) - `php artisan migrate`
- **golang-migrate** (Go) - `migrate -path ./migrations up`

**Methods**:
- `performSmartReload(analysis, options)` - Orchestrate full reload
- `restartServices(analysis)` - Restart only affected services
- `reinstallDependencies(analysis)` - Auto-detect and run package managers
- `runMigrations(analysis)` - Auto-detect framework and run migrations
- `notifyAgent(analysis, ptyManager, worktreeName)` - Send colored notifications to AI agent

### AI Conflict Resolver (`scripts/ai-conflict-resolver.mjs`)

**Purpose**: Intelligent conflict resolution with AI integration

**Key Class**: **AIConflictResolver**

```javascript
const resolver = new AIConflictResolver(worktreePath);

// Get all conflicts
const conflicts = resolver.getConflicts();
// [
//   {
//     file: 'package.json',
//     category: 'dependency',
//     content: { fullContent: '...', conflicts: [...], conflictCount: 1 },
//     resolvable: 'dependency_version'
//   }
// ]

// Analyze conflicts with suggestions
const analysis = await resolver.analyzeConflicts();
// {
//   total: 3,
//   autoResolvable: 1,
//   manual: 2,
//   byCategory: { code: 2, dependency: 1 },
//   conflicts: [...]
// }

// Auto-resolve simple conflicts
await resolver.autoResolve('package.json', 'theirs');

// Request AI assistance for complex conflicts
await resolver.requestAIAssistance(conflict, ptyManager, worktreeName);
```

**Conflict Categories**:
- **code** - .js, .ts, .py, .go, .rb, .php, .rs files
- **config** - .yml, .yaml, .json, .toml files
- **dependency** - package.json, requirements.txt, etc.
- **documentation** - .md, .txt, .html, .css files

**Auto-Resolution Strategies**:
- **whitespace** - Conflicts with only whitespace differences
- **dependency_version** - Dependency version bumps (prefer newer)
- **config_merge** - Non-overlapping config changes (planned)

**AI Integration**:
- Sends formatted conflict info to AI agent's terminal
- Provides resolution suggestions based on conflict type
- Generates comprehensive prompts for complex conflicts

### API Endpoints

#### Git Sync API

**GET `/api/worktrees/:name/check-updates`** - Check for updates from main
```json
{
  "hasUpdates": true,
  "commitCount": 5,
  "commits": [
    { "sha": "abc123", "message": "Add feature X" }
  ],
  "baseBranch": "main"
}
```

**POST `/api/worktrees/:name/sync`** - Sync with main branch
```javascript
// Request
{
  "strategy": "merge",  // or "rebase"
  "smartReload": true,  // Enable smart reload
  "force": false,       // Force sync with uncommitted changes
  "skipDependencies": false,
  "skipMigrations": false,
  "skipRestart": false
}

// Response (success)
{
  "success": true,
  "output": "...",
  "previousCommit": "abc123",
  "smartReload": {
    "success": true,
    "actions": [
      { "action": "reinstall_dependencies", "success": true, ... },
      { "action": "run_migrations", "success": true, ... },
      { "action": "restart_services", "success": true, "services": ["api"] }
    ]
  }
}

// Response (conflicts)
{
  "success": false,
  "conflicts": ["package.json", "src/auth.js"],
  "rollbackCommit": "abc123",
  "message": "2 file(s) have conflicts"
}
```

**GET `/api/worktrees/:name/analyze-changes?commits=abc123,def456`** - Analyze commit changes
```json
{
  "needsServiceRestart": true,
  "needsDependencyInstall": true,
  "needsMigration": { "hasMigrations": true, "count": 2, "files": [...] },
  "affectedServices": ["api", "worker"],
  "changedFiles": [...],
  "summary": {
    "total": 15,
    "services": ["docker-compose.yml"],
    "dependencies": ["package.json"],
    "migrations": ["prisma/migrations/..."]
  }
}
```

**POST `/api/worktrees/:name/rollback`** - Rollback to previous commit
```javascript
// Request
{ "commitSha": "abc123" }

// Response
{ "success": true, "message": "Rolled back to abc123" }
```

**POST `/api/worktrees/:name/smart-reload`** - Manually trigger smart reload
```javascript
// Request
{
  "commits": ["abc123"],
  "skipDependencies": false,
  "skipMigrations": false,
  "skipRestart": false
}

// Response
{
  "success": true,
  "actions": [...]
}
```

#### Conflict Resolution API

**GET `/api/worktrees/:name/conflicts`** - Get all conflicts
```json
[
  {
    "file": "package.json",
    "category": "dependency",
    "content": { "conflictCount": 1, ... },
    "resolvable": "dependency_version"
  }
]
```

**GET `/api/worktrees/:name/conflicts/analyze`** - Analyze conflicts with suggestions
```json
{
  "total": 3,
  "autoResolvable": 1,
  "manual": 2,
  "byCategory": { "code": 2, "dependency": 1 },
  "conflicts": [
    {
      "file": "package.json",
      "resolvable": "dependency_version",
      "suggestion": "Auto-resolve: Accept newer dependency versions"
    }
  ]
}
```

**POST `/api/worktrees/:name/conflicts/resolve`** - Auto-resolve conflict
```javascript
// Request
{ "file": "package.json", "strategy": "theirs" }

// Response
{
  "success": true,
  "file": "package.json",
  "strategy": "dependency_theirs",
  "message": "Dependency conflict resolved (using theirs)"
}
```

**POST `/api/worktrees/:name/conflicts/ai-assist`** - Request AI assistance
```javascript
// Request
{ "file": "src/auth.js" }

// Response
{
  "success": true,
  "message": "Conflict information sent to AI agent"
}
```

### Usage Examples

#### Basic Sync with Smart Reload

```javascript
// Check for updates
const updates = await fetch(`/api/worktrees/${name}/check-updates`).then(r => r.json());

if (updates.hasUpdates) {
  // Sync with smart reload enabled
  const result = await fetch(`/api/worktrees/${name}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: 'merge',
      smartReload: true
    })
  }).then(r => r.json());

  if (result.success) {
    console.log('Sync complete!');
    console.log('Actions taken:', result.smartReload.actions);
  }
}
```

#### Analyze Before Syncing

```javascript
// Check what will change
const updates = await fetch(`/api/worktrees/${name}/check-updates`).then(r => r.json());

if (updates.hasUpdates) {
  // Analyze the changes first
  const commits = updates.commits.map(c => c.sha).join(',');
  const analysis = await fetch(
    `/api/worktrees/${name}/analyze-changes?commits=${commits}`
  ).then(r => r.json());

  // Show user what will happen
  console.log(`Changes detected:
    - ${analysis.affectedServices.length} services will restart
    - Dependencies: ${analysis.needsDependencyInstall ? 'Yes' : 'No'}
    - Migrations: ${analysis.needsMigration.count || 0}
  `);

  // Proceed with sync
  await fetch(`/api/worktrees/${name}/sync`, {
    method: 'POST',
    body: JSON.stringify({ strategy: 'merge', smartReload: true })
  });
}
```

#### Handle Conflicts with AI

```javascript
// Sync returns conflicts
const syncResult = await fetch(`/api/worktrees/${name}/sync`, {
  method: 'POST',
  body: JSON.stringify({ strategy: 'merge' })
}).then(r => r.json());

if (!syncResult.success && syncResult.conflicts) {
  // Analyze conflicts
  const analysis = await fetch(`/api/worktrees/${name}/conflicts/analyze`).then(r => r.json());

  // Auto-resolve simple conflicts
  for (const conflict of analysis.conflicts) {
    if (conflict.resolvable) {
      await fetch(`/api/worktrees/${name}/conflicts/resolve`, {
        method: 'POST',
        body: JSON.stringify({ file: conflict.file, strategy: 'auto' })
      });
    }
  }

  // Request AI help for complex conflicts
  for (const conflict of analysis.conflicts) {
    if (!conflict.resolvable && conflict.category === 'code') {
      await fetch(`/api/worktrees/${name}/conflicts/ai-assist`, {
        method: 'POST',
        body: JSON.stringify({ file: conflict.file })
      });
    }
  }
}
```

### Architecture Flow

```
Git Sync Flow (Phase 2.9 + Phase 5):

┌─────────────────────────────────────────────────────────────┐
│ User triggers sync via API                                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ GitSyncManager.syncWithMain()                               │
│ - Fetch from origin                                         │
│ - Merge or rebase                                           │
│ - Detect conflicts                                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
            ┌─────────▼──────────┐
            │ Success?           │
            └─┬──────────────┬───┘
              │ No (conflict)│ Yes (smartReload enabled)
              │              │
    ┌─────────▼────────┐    ┌▼─────────────────────────────────┐
    │ AIConflictResolver│    │ ChangeDetector.analyzeChanges()  │
    │ - Get conflicts   │    │ - Parse changed files            │
    │ - Categorize      │    │ - Detect services, deps, migrations│
    │ - Auto-resolve    │    └──────────────┬───────────────────┘
    │ - Request AI help │                   │
    └───────────────────┘     ┌─────────────▼───────────────────┐
                              │ SmartReloadManager.performSmartReload()│
                              │ 1. Reinstall dependencies       │
                              │ 2. Run migrations              │
                              │ 3. Restart services            │
                              │ 4. Notify AI agent             │
                              └─────────────────────────────────┘
```

### Configuration Options

Smart reload can be configured per-sync:

```javascript
{
  strategy: 'merge',        // or 'rebase'
  smartReload: true,        // Enable smart reload
  force: false,             // Force sync even with uncommitted changes
  skipDependencies: false,  // Skip dependency reinstall
  skipMigrations: false,    // Skip migration execution
  skipRestart: false,       // Skip service restart
  continueOnError: false    // Continue even if step fails
}
```

### Known Limitations

1. **Migration Detection**: Only supports common frameworks. Custom migration tools need manual handling.
2. **Conflict Resolution**: Auto-resolution is conservative. Only handles very simple cases.
3. **AI Integration**: Notifications are visual only. AI agent must manually resolve conflicts.
4. **Service Mapping**: File-to-service mapping uses heuristics. May not work for complex monorepos.

### Future Enhancements

- Frontend UI for sync/reload controls
- Background polling for updates (every 5 minutes)
- Toast notifications for updates
- Real-time progress tracking
- Visual diff viewer for conflicts
- Custom migration command support
- Service impact preview before syncing

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
- DO NOT KILL PROCESSES YOU DID NOT SPAWN