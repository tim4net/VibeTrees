# Architecture Guide

**System design, component relationships, and implementation patterns**

---

## Overview

Vibe Worktrees is built with a **three-layer architecture** emphasizing modularity, testability, and clean separation of concerns.

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                     │
│               (Web UI + WebSocket API)                   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Business Logic Layer                   │
│    (Worktree Management + Git Sync + Agent Control)     │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   Infrastructure Layer                   │
│       (Git + Docker/Podman + PTY + File System)          │
└─────────────────────────────────────────────────────────┘
```

**Code Statistics**:
- **Total**: ~11,900 lines of code
- **Tests**: 346 tests, 80%+ coverage
- **Modules**: 15 core modules + 5 agent implementations

---

## System Architecture

### High-Level Design

```
                            ┌──────────────┐
                            │   Browser    │
                            │  (Web UI)    │
                            └──────┬───────┘
                                   │ HTTP/WebSocket
                    ┌──────────────▼───────────────┐
                    │    Express Web Server        │
                    │    Port: 3335                │
                    │  - Static file serving       │
                    │  - REST API endpoints        │
                    │  - WebSocket handler         │
                    └──────────────┬───────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
   ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
   │ WorktreeManager │   │ GitSyncManager  │   │   PTYManager    │
   │  - Create       │   │  - Fetch/Merge  │   │  - Spawn terms  │
   │  - Delete       │   │  - Detect       │   │  - I/O routing  │
   │  - List         │   │  - Reload       │   │  - Resize       │
   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
            │                     │                      │
            │                     │                      │
   ┌────────▼────────┬───────────▼────────┬────────────▼────────┐
   │  PortRegistry   │  ChangeDetector    │  AgentRegistry      │
   │  - Allocate     │  - Service changes │  - List agents      │
   │  - Release      │  - Dependency      │  - Create instance  │
   │  - Persist      │  - Migrations      │  - Check available  │
   └────────┬────────┴───────────┬────────┴────────────┬────────┘
            │                    │                     │
   ┌────────▼─────────────────── ▼─────────────────────▼────────┐
   │              Infrastructure Services                        │
   │  - Git (worktree operations)                               │
   │  - Docker/Podman (container management)                    │
   │  - node-pty (pseudo-terminals)                             │
   │  - File system (config, logs, ports)                       │
   └────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Worktree Manager (674 lines)

**Purpose**: Orchestrates git worktree lifecycle

**Responsibilities**:
- Create/delete git worktrees
- Manage worktree metadata
- Coordinate with other components
- Safety checks (prevent main deletion)

**Key Methods**:
```javascript
class WorktreeManager {
  createWorktree(branch, fromBranch, agent)
  deleteWorktree(name)
  listWorktrees()
  getWorktreeInfo(name)
  startServices(name)
  stopServices(name)
}
```

**Dependencies**:
- PortRegistry - Allocate/release ports
- GitSyncManager - Git operations
- ContainerRuntime - Service management
- AgentRegistry - Agent spawning

**Design Pattern**: **Facade Pattern** - Simplifies complex subsystem interactions

---

### 2. Git Sync Manager (578 lines)

**Purpose**: Git synchronization and change detection

**Components**:

#### GitSyncManager
Handles git operations (fetch, merge, rebase, rollback)

```javascript
class GitSyncManager {
  async fetchUpstream()
  async syncWithMain(strategy, options)
  async rollback(commitSha)
  hasUncommittedChanges()
}
```

#### ChangeDetector
Analyzes changes to determine impacts

```javascript
class ChangeDetector {
  async analyzeChanges(commits)
  detectServiceChanges(files)
  detectDependencyChanges(files)
  detectMigrations(files)
  getAffectedServices(files)
  buildServiceDependencyGraph()
  getRestartOrder(services)
}
```

**Design Patterns**:
- **Strategy Pattern** - Different sync strategies (merge/rebase)
- **Observer Pattern** - Change detection and notification

---

### 3. Smart Reload Manager (424 lines)

**Purpose**: Automatic post-sync actions

**Responsibilities**:
- Reinstall dependencies (auto-detect package manager)
- Run database migrations (auto-detect framework)
- Restart affected services (dependency-aware)
- Notify AI agents

**Key Methods**:
```javascript
class SmartReloadManager {
  async performSmartReload(analysis, options)
  async reinstallDependencies(analysis)
  async runMigrations(analysis)
  async restartServices(analysis)
  notifyAgent(analysis, ptyManager, worktreeName)
}
```

**Supported Package Managers**:
- npm, yarn, pnpm (Node.js)
- pip, pipenv, poetry (Python)
- bundle (Ruby)
- cargo (Rust)
- go mod (Go)
- composer (PHP)

**Supported Migration Frameworks**:
- Prisma, Sequelize, TypeORM (Node.js)
- Django, Flask/Alembic (Python)
- Rails (Ruby)
- Laravel (PHP)
- golang-migrate (Go)

**Design Pattern**: **Template Method** - Standard reload flow with pluggable steps

---

### 4. AI Conflict Resolver (538 lines)

**Purpose**: Intelligent conflict resolution

**Responsibilities**:
- Detect git conflicts
- Categorize conflicts (code, config, dependency, docs)
- Auto-resolve simple conflicts
- Generate AI assistance prompts

**Key Methods**:
```javascript
class AIConflictResolver {
  getConflicts()
  async analyzeConflicts()
  async autoResolve(file, strategy)
  async requestAIAssistance(conflict, ptyManager, worktreeName)
  generateAIPrompt(conflict)
}
```

**Auto-Resolution Strategies**:
- Whitespace-only conflicts
- Dependency version bumps (prefer newer)
- Non-overlapping config changes

**Design Pattern**: **Strategy Pattern** - Different resolution strategies per conflict type

---

### 5. Port Registry (82 lines)

**Purpose**: Centralized port allocation

**Responsibilities**:
- Allocate unique ports per worktree/service
- Persist allocations to disk
- Release ports on worktree deletion
- Handle port conflicts (auto-increment)

**Key Methods**:
```javascript
class PortRegistry {
  allocate(worktree, service, basePort)
  release(worktree)
  isPortAvailable(port)
  getAllocations()
}
```

**Storage**: `~/.vibetrees/ports.json`

**Design Pattern**: **Singleton** - One registry instance

---

### 6. MCP Manager (350 lines)

**Purpose**: MCP server discovery and configuration

**Responsibilities**:
- Discover MCP servers (local, npm-project, npm-global)
- Generate `.claude/settings.json` per worktree
- Inject environment variables (database URLs, etc.)
- Add vibe-bridge server

**Key Methods**:
```javascript
class McpManager {
  discoverServers()
  generateClaudeSettings(worktreePath, servers, options)
  getOfficialServers()
  isServerInstalled(serverName)
}
```

**Discovery Priority**:
1. Local (`./mcp-servers/`) - Highest
2. npm project (`package.json`)
3. npm global - Lowest

**Design Pattern**: **Factory Pattern** - Creates MCP server configurations

---

### 7. Agent System (800 lines)

**Purpose**: Pluggable AI agent support

**Components**:

#### AgentInterface (Abstract Base Class)
```javascript
class AgentInterface {
  // Required
  async spawn(worktreePath, options)
  getDefaultArgs()
  getConfigPath(worktreePath)

  // Optional
  needsCacheClear()
  getDisplayName()
  getIcon()
  async isInstalled()
  async checkVersion()
  getEnvironmentVariables(worktreePath)
  getCapabilities()
  validateConfig()
  async cleanup(worktreePath)
}
```

#### Built-in Agents
- **ClaudeAgent** - Anthropic Claude Code
- **CodexAgent** - OpenAI Codex (hypothetical)
- **GeminiAgent** - Google Gemini (hypothetical)
- **ShellAgent** - Plain shell

#### AgentRegistry
```javascript
class AgentRegistry {
  register(name, AgentClass)
  create(name, config)
  list()
  async getMetadata(name)
  async checkAvailability()
}
```

**Design Patterns**:
- **Abstract Factory** - Agent creation
- **Registry Pattern** - Agent management
- **Strategy Pattern** - Different agent behaviors

---

### 8. PTY Manager (200 lines, embedded in server.mjs)

**Purpose**: Terminal session management

**Responsibilities**:
- Spawn pseudo-terminals (PTY processes)
- Route I/O between WebSocket and PTY
- Handle resize events
- Clean up on disconnect

**Key Methods**:
```javascript
class PTYManager {
  spawn(worktreeName, command, options)
  write(worktreeName, data)
  resize(worktreeName, cols, rows)
  kill(worktreeName)
  isRunning(worktreeName)
}
```

**Design Pattern**: **Proxy Pattern** - Mediates PTY access

---

### 9. Web Server (1,445 lines)

**Purpose**: HTTP + WebSocket API

**Components**:

#### Express Server
- Static file serving (`/public`)
- REST API endpoints (`/api/*`)
- Error handling middleware

#### WebSocket Handler
- Real-time bidirectional communication
- Event routing
- Connection management

**Key Routes**:
```javascript
// Worktrees
GET    /api/worktrees
POST   /api/worktrees
DELETE /api/worktrees/:name
GET    /api/worktrees/:name/services

// Git Sync
GET    /api/worktrees/:name/check-updates
POST   /api/worktrees/:name/sync
POST   /api/worktrees/:name/rollback
GET    /api/worktrees/:name/analyze-changes

// Conflicts
GET    /api/worktrees/:name/conflicts
GET    /api/worktrees/:name/conflicts/analyze
POST   /api/worktrees/:name/conflicts/resolve
POST   /api/worktrees/:name/conflicts/ai-assist

// Agents
GET    /api/agents
GET    /api/agents/:name
GET    /api/agents/availability
```

**Design Patterns**:
- **MVC Pattern** - Separation of concerns
- **Middleware Pattern** - Request processing pipeline

---

## Data Flow

### Worktree Creation Flow

```
1. User submits form (branch name, agent)
   │
   ▼
2. Browser sends WebSocket event
   { event: 'create-worktree', data: { branch, agent } }
   │
   ▼
3. Server validates input
   - Branch name valid?
   - Agent available?
   - No duplicate worktree?
   │
   ▼
4. WorktreeManager.createWorktree()
   │
   ├─→ Git: Create worktree
   │   └─→ git worktree add .worktrees/branch-name branch
   │
   ├─→ PortRegistry: Allocate ports
   │   └─→ api:3000, db:5432, console:5173, ...
   │
   ├─→ McpManager: Generate MCP config
   │   └─→ .worktrees/branch-name/.claude/settings.json
   │
   ├─→ ContainerRuntime: Start services
   │   └─→ docker compose up -d (with env vars)
   │
   └─→ PTYManager: Spawn agent
       └─→ npx @anthropic-ai/claude-code
   │
   ▼
5. Server sends success event
   { event: 'worktree-created', data: { name, path, ports } }
   │
   ▼
6. Browser updates UI
   - Add worktree card
   - Enable terminal connection
```

### Git Sync Flow

```
1. User clicks "Sync" button
   │
   ▼
2. Browser requests update check
   GET /api/worktrees/feature-auth/check-updates
   │
   ▼
3. GitSyncManager.fetchUpstream()
   ├─→ git fetch origin main
   └─→ git rev-list HEAD..origin/main
   │
   ▼
4. Returns update info
   { hasUpdates: true, commitCount: 5, commits: [...] }
   │
   ▼
5. Browser analyzes changes (optional)
   GET /api/worktrees/feature-auth/analyze-changes?commits=...
   │
   ▼
6. ChangeDetector.analyzeChanges()
   ├─→ git diff --name-only <commits>
   ├─→ Detect service changes
   ├─→ Detect dependency changes
   ├─→ Detect migrations
   └─→ Map to affected services
   │
   ▼
7. Browser requests sync
   POST /api/worktrees/feature-auth/sync
   { strategy: 'merge', smartReload: true }
   │
   ▼
8. GitSyncManager.syncWithMain()
   ├─→ git merge origin/main (or git rebase)
   └─→ Check for conflicts
   │
   ├─→ Success? → Continue to Step 9
   └─→ Conflicts? → Return conflict list
   │
   ▼
9. SmartReloadManager.performSmartReload()
   │
   ├─→ Reinstall dependencies
   │   ├─→ Detect package manager (npm/pip/bundle/...)
   │   └─→ Run install command
   │
   ├─→ Run migrations
   │   ├─→ Detect framework (Prisma/Django/Rails/...)
   │   └─→ Run migration command
   │
   ├─→ Restart services
   │   ├─→ Build dependency graph
   │   ├─→ Stop in reverse order
   │   ├─→ Start in dependency order
   │   └─→ Health check each service
   │
   └─→ Notify agent
       └─→ Send colored message to PTY
   │
   ▼
10. Return success with action log
    { success: true, smartReload: { actions: [...] } }
```

---

## Design Patterns

### Architectural Patterns

#### 1. Layered Architecture

**Layers**:
- **Presentation** - Web UI, WebSocket, API
- **Business Logic** - Managers, orchestration
- **Infrastructure** - Git, Docker, PTY, filesystem

**Benefits**:
- Clear separation of concerns
- Easy to test (mock infrastructure)
- Flexibility (swap infrastructure)

#### 2. Dependency Injection

**Example**:
```javascript
class WorktreeManager {
  constructor(projectRoot, runtime, portRegistry) {
    this.projectRoot = projectRoot;
    this.runtime = runtime;          // Injected
    this.portRegistry = portRegistry; // Injected
  }
}
```

**Benefits**:
- Testability (inject mocks)
- Flexibility (inject different implementations)
- Loose coupling

#### 3. Repository Pattern

**Example**: PortRegistry as repository for port allocations

```javascript
class PortRegistry {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.allocations = this._load();
  }

  allocate(worktree, service, basePort) {
    // Business logic
    this._save();
  }

  _load() { /* filesystem */ }
  _save() { /* filesystem */ }
}
```

**Benefits**:
- Abstracts storage details
- Easy to swap storage (file → database)
- Centralized persistence logic

### Behavioral Patterns

#### 4. Strategy Pattern

**Example**: Sync strategies (merge vs rebase)

```javascript
class GitSyncManager {
  async syncWithMain(strategy, options) {
    if (strategy === 'merge') {
      return this._merge(options);
    } else if (strategy === 'rebase') {
      return this._rebase(options);
    }
  }
}
```

**Benefits**:
- Multiple algorithms for same task
- Easy to add new strategies
- Runtime selection

#### 5. Observer Pattern

**Example**: Change detection notifications

```javascript
class ChangeDetector {
  async analyzeChanges(commits) {
    const changes = await this._detectChanges(commits);

    // Notify observers
    if (changes.needsServiceRestart) {
      this.emit('service-restart-needed', changes.affectedServices);
    }

    return changes;
  }
}
```

**Benefits**:
- Loose coupling
- Multiple listeners
- Event-driven architecture

#### 6. Template Method

**Example**: Smart reload flow

```javascript
class SmartReloadManager {
  async performSmartReload(analysis, options) {
    const actions = [];

    // Template method defines algorithm
    if (!options.skipDependencies) {
      actions.push(await this.reinstallDependencies(analysis));
    }

    if (!options.skipMigrations) {
      actions.push(await this.runMigrations(analysis));
    }

    if (!options.skipRestart) {
      actions.push(await this.restartServices(analysis));
    }

    return { success: true, actions };
  }

  // Concrete methods (can be overridden)
  async reinstallDependencies(analysis) { /* ... */ }
  async runMigrations(analysis) { /* ... */ }
  async restartServices(analysis) { /* ... */ }
}
```

**Benefits**:
- Standard algorithm with pluggable steps
- Easy to customize behavior
- Reduces code duplication

### Creational Patterns

#### 7. Factory Pattern

**Example**: Agent creation

```javascript
class AgentRegistry {
  create(agentName, config) {
    const AgentClass = this.agents.get(agentName);
    if (!AgentClass) {
      throw new Error(`Unknown agent: ${agentName}`);
    }
    return new AgentClass(config);
  }
}
```

**Benefits**:
- Centralized object creation
- Abstracts instantiation
- Easy to add new types

#### 8. Singleton Pattern

**Example**: PortRegistry (one instance)

```javascript
let instance = null;

class PortRegistry {
  static getInstance() {
    if (!instance) {
      instance = new PortRegistry();
    }
    return instance;
  }
}
```

**Benefits**:
- Single source of truth
- Shared state
- Controlled access

---

## Technology Stack

### Backend

| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime environment | 18+ |
| **Express** | Web framework | 4.18+ |
| **WebSocket (ws)** | Real-time communication | 8.14+ |
| **node-pty** | Pseudo-terminal | 1.0+ |
| **js-yaml** | YAML parsing | 2.8+ |

### Frontend

| Technology | Purpose | Version |
|------------|---------|---------|
| **Vanilla JavaScript** | UI logic | ES2020+ |
| **xterm.js** | Terminal emulator | 5.0+ |
| **WebSocket API** | Server communication | Native |
| **CSS3** | Styling | Modern |

### Infrastructure

| Technology | Purpose | Version |
|------------|---------|---------|
| **Git** | Version control | 2.35+ |
| **Docker** | Container runtime | 20.10+ |
| **Podman** | Container runtime (alt) | 4.0+ |
| **Docker Compose** | Service orchestration | 2.0+ |

### Testing

| Technology | Purpose | Version |
|------------|---------|---------|
| **Vitest** | Test framework | 1.0+ |
| **Node.js assert** | Assertions | Native |
| **Mock modules** | Mocking | Custom |

---

## Security Architecture

### Threat Model

**Assets**:
- Git repository code
- Service containers and data
- AI agent conversations
- Configuration files
- Port allocations

**Threats**:
1. **Path traversal** - Access files outside worktree
2. **Command injection** - Malicious git branch names
3. **Port conflicts** - Bind to privileged ports
4. **Container escape** - Break out of containers
5. **Data leakage** - Expose sensitive config

### Security Measures

#### 1. Input Validation

**Branch names**:
```javascript
function validateBranchName(branch) {
  // No path traversal
  if (branch.includes('..') || branch.includes('/')) {
    throw new Error('Invalid branch name');
  }

  // No shell metacharacters
  if (/[;&|`$()<>]/.test(branch)) {
    throw new Error('Invalid characters in branch name');
  }

  return true;
}
```

#### 2. Path Sanitization

**Worktree paths**:
```javascript
function getWorktreePath(name) {
  const base = path.resolve(projectRoot, '.worktrees');
  const worktreePath = path.resolve(base, name);

  // Ensure path is within .worktrees/
  if (!worktreePath.startsWith(base)) {
    throw new Error('Path traversal detected');
  }

  return worktreePath;
}
```

#### 3. Port Range Restriction

**Port allocation**:
```javascript
function allocatePort(service, basePort) {
  // Never allocate privileged ports (< 1024)
  if (basePort < 1024) {
    throw new Error('Cannot allocate privileged port');
  }

  // Stay within configured range
  if (basePort > config.portRange.max) {
    throw new Error('Port out of range');
  }

  return basePort;
}
```

#### 4. Container Isolation

**Docker/Podman**:
- Services run in isolated containers
- No privileged mode
- Network isolation per worktree (future)
- Volume mounts restricted to worktree directory

#### 5. File Permissions

**Config files**:
```bash
# Port registry (user-only access)
chmod 600 ~/.vibetrees/ports.json

# Config file (user-only access)
chmod 600 ~/.vibetrees/config.json
```

#### 6. WebSocket Authentication

**Future**: Add token-based authentication
```javascript
ws.on('connection', (socket, request) => {
  const token = request.headers['authorization'];
  if (!validateToken(token)) {
    socket.close(1008, 'Unauthorized');
  }
});
```

---

## Performance Considerations

### Optimization Strategies

#### 1. Lazy Loading

**Example**: Only load worktree info when requested
```javascript
async listWorktrees() {
  const worktrees = await this._getWorktreeNames();
  // Return basic info only
  // Full info loaded on-demand
  return worktrees.map(name => ({ name }));
}
```

#### 2. Caching

**Example**: Cache docker-compose.yml parsing
```javascript
class ChangeDetector {
  constructor(worktreePath) {
    this._dockerComposeCache = null;
  }

  buildServiceDependencyGraph() {
    if (this._dockerComposeCache) {
      return this._dockerComposeCache;
    }

    // Parse and cache
    this._dockerComposeCache = this._parseDockerCompose();
    return this._dockerComposeCache;
  }
}
```

#### 3. Parallel Operations

**Example**: Restart services in parallel groups
```javascript
async restartServices(analysis) {
  const order = this._getRestartOrder(analysis.affectedServices);

  // Restart each group in parallel
  for (const group of order) {
    await Promise.all(group.map(service => this._restartService(service)));
  }
}
```

#### 4. Incremental Updates

**Example**: Only sync changed files
```javascript
async syncWithMain() {
  // Fetch only new commits
  await execSync('git fetch origin main');

  // Get changed files since last sync
  const changed = await this._getChangedFiles();

  // Only process changed files
  return this._processChanges(changed);
}
```

### Performance Metrics

**Target**:
- Worktree creation: < 10 seconds
- Git sync: < 5 seconds (no smart reload)
- Git sync + smart reload: < 30 seconds
- WebSocket latency: < 100ms
- API response time: < 1 second

---

## Scalability

### Current Limitations

- **Single machine**: No distributed support
- **Sequential operations**: One worktree operation at a time
- **In-memory state**: PTY sessions not persistent

### Future Scalability

#### 1. Distributed Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Vibe Node  │────▶│  Shared DB  │◀────│  Vibe Node  │
│  (Machine1) │     │  (Postgres) │     │  (Machine2) │
└─────────────┘     └─────────────┘     └─────────────┘
```

#### 2. State Persistence

**Terminal persistence**:
- Store PTY state to database
- Replay on reconnect
- Survive server restarts

#### 3. Horizontal Scaling

**Load balancer**:
```
                  ┌─────────────┐
User ────────────▶│Load Balancer│
                  └──────┬──────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐      ┌────▼────┐     ┌────▼────┐
   │ Vibe 1  │      │ Vibe 2  │     │ Vibe 3  │
   └─────────┘      └─────────┘     └─────────┘
```

---

## Testing Architecture

### Test Structure

```
scripts/
├── worktree-manager.test.mjs     (59 tests)
├── git-sync-manager.test.mjs     (80 tests)
├── smart-reload-manager.test.mjs (46 tests)
├── ai-conflict-resolver.test.mjs (47 tests)
├── mcp-manager.test.mjs          (45 tests)
├── port-registry.test.mjs        (23 tests)
├── config-manager.test.mjs       (20 tests)
└── agents/*.test.mjs              (26 tests)

Total: 346 tests
```

### Test Patterns

#### 1. Mocking External Dependencies

```javascript
import { vi } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));
```

#### 2. Test Isolation

```javascript
describe('PortRegistry', () => {
  let registry;

  beforeEach(() => {
    // Fresh instance per test
    registry = new PortRegistry('/tmp/test-ports.json');
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });
});
```

#### 3. Integration Tests

```javascript
describe('Git Sync Integration', () => {
  it('should sync and reload', async () => {
    const syncManager = new GitSyncManager(worktreePath, 'main');
    const reloadManager = new SmartReloadManager(worktreePath, 'docker');

    // Sync
    const syncResult = await syncManager.syncWithMain('merge');
    expect(syncResult.success).toBe(true);

    // Analyze changes
    const detector = new ChangeDetector(worktreePath);
    const analysis = await detector.analyzeChanges(syncResult.commits);

    // Reload
    const reloadResult = await reloadManager.performSmartReload(analysis);
    expect(reloadResult.success).toBe(true);
  });
});
```

---

## Deployment Architecture

### Development

```
Developer Machine
├── Node.js 18+
├── Docker Desktop / Podman
├── Git
└── Vibe Worktrees (local)
    └── npm run web (localhost:3335)
```

### Production (Future)

```
Cloud VM / Container
├── Node.js 18+
├── Docker / Podman
├── Nginx (reverse proxy)
│   └── HTTPS termination
│   └── Static file caching
├── Vibe Worktrees
│   └── systemd service
└── PostgreSQL (state persistence)
```

---

## References

- [Configuration Guide](configuration.md) - Runtime configuration
- [Git Sync Guide](git-sync.md) - Sync architecture
- [API Reference](api.md) - API design
- [MCP Integration](mcp-integration.md) - MCP architecture
- [Adding Agents](adding-agents.md) - Agent design patterns

---

**Last Updated**: 2025-10-28
**Version**: 1.0
