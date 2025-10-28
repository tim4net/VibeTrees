# API Reference

**Complete HTTP and WebSocket API documentation**

---

## Overview

Vibe Worktrees provides two APIs:
- **REST API** - HTTP endpoints for synchronous operations
- **WebSocket API** - Real-time bidirectional communication

**Base URL**: `http://localhost:3335`

**Content Type**: `application/json`

---

## REST API

### Worktree Management

#### List Worktrees

```http
GET /api/worktrees
```

**Response**:
```json
[
  {
    "name": "feature-auth",
    "path": "/project/.worktrees/feature-auth",
    "branch": "feature/auth",
    "ports": {
      "api": 3000,
      "postgres": 5432,
      "console": 5173
    },
    "services": {
      "api": "running",
      "postgres": "running",
      "console": "running"
    },
    "agent": "claude",
    "hasUncommittedChanges": false
  }
]
```

#### Get Worktree Info

```http
GET /api/worktrees/:name
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
{
  "name": "feature-auth",
  "path": "/project/.worktrees/feature-auth",
  "branch": "feature/auth",
  "ports": { "api": 3000, "postgres": 5432 },
  "services": { "api": "running", "postgres": "running" },
  "agent": "claude",
  "hasUncommittedChanges": false,
  "lastSync": "2025-10-28T10:15:00Z",
  "commitsSince": 3
}
```

#### Create Worktree

```http
POST /api/worktrees
```

**Request Body**:
```json
{
  "branch": "feature/auth",
  "fromBranch": "main",
  "agent": "claude"
}
```

**Response**:
```json
{
  "success": true,
  "worktree": {
    "name": "feature-auth",
    "path": "/project/.worktrees/feature-auth",
    "branch": "feature/auth",
    "ports": { "api": 3000, "postgres": 5432 },
    "agent": "claude"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Worktree already exists"
}
```

**Status Codes**:
- `200`: Success
- `400`: Invalid input
- `409`: Worktree already exists
- `500`: Server error

#### Delete Worktree

```http
DELETE /api/worktrees/:name
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
{
  "success": true,
  "message": "Worktree deleted successfully"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Cannot delete main worktree"
}
```

**Status Codes**:
- `200`: Success
- `403`: Cannot delete (main worktree)
- `404`: Worktree not found
- `500`: Server error

---

### Service Management

#### Get Service Status

```http
GET /api/worktrees/:name/services
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
{
  "services": {
    "api": {
      "status": "running",
      "port": 3000,
      "uptime": 3600,
      "health": "healthy"
    },
    "postgres": {
      "status": "running",
      "port": 5432,
      "uptime": 3600,
      "health": "healthy"
    }
  }
}
```

**Service Status Values**:
- `running` - Service is up
- `stopped` - Service is down
- `starting` - Service is starting
- `unhealthy` - Service is up but failing health checks

#### Start Services

```http
POST /api/worktrees/:name/services/start
```

**Parameters**:
- `name` (path): Worktree name

**Request Body** (optional):
```json
{
  "services": ["api", "postgres"]
}
```

If `services` not provided, starts all services.

**Response**:
```json
{
  "success": true,
  "services": {
    "api": "running",
    "postgres": "running"
  }
}
```

#### Stop Services

```http
POST /api/worktrees/:name/services/stop
```

**Parameters**:
- `name` (path): Worktree name

**Request Body** (optional):
```json
{
  "services": ["api"]
}
```

**Response**:
```json
{
  "success": true,
  "services": {
    "api": "stopped"
  }
}
```

#### Restart Services

```http
POST /api/worktrees/:name/services/restart
```

**Parameters**:
- `name` (path): Worktree name

**Request Body** (optional):
```json
{
  "services": ["api"]
}
```

**Response**:
```json
{
  "success": true,
  "services": {
    "api": "running"
  }
}
```

---

### Git Sync & Updates

#### Check for Updates

```http
GET /api/worktrees/:name/check-updates
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
{
  "hasUpdates": true,
  "commitCount": 5,
  "commits": [
    {
      "sha": "abc123",
      "message": "Add authentication feature",
      "author": "John Doe",
      "date": "2025-10-28T10:00:00Z"
    },
    {
      "sha": "def456",
      "message": "Fix login bug",
      "author": "Jane Smith",
      "date": "2025-10-28T09:30:00Z"
    }
  ],
  "baseBranch": "main"
}
```

#### Sync with Main Branch

```http
POST /api/worktrees/:name/sync
```

**Parameters**:
- `name` (path): Worktree name

**Request Body**:
```json
{
  "strategy": "merge",
  "smartReload": true,
  "force": false,
  "skipDependencies": false,
  "skipMigrations": false,
  "skipRestart": false,
  "continueOnError": false
}
```

**Request Body Fields**:
- `strategy` (string, required): `"merge"` or `"rebase"`
- `smartReload` (boolean): Enable smart reload after sync (default: `true`)
- `force` (boolean): Force sync even with uncommitted changes (default: `false`)
- `skipDependencies` (boolean): Skip dependency reinstall (default: `false`)
- `skipMigrations` (boolean): Skip migration execution (default: `false`)
- `skipRestart` (boolean): Skip service restart (default: `false`)
- `continueOnError` (boolean): Continue even if step fails (default: `false`)

**Success Response**:
```json
{
  "success": true,
  "output": "Successfully merged 5 commits from main",
  "previousCommit": "abc123",
  "smartReload": {
    "success": true,
    "actions": [
      {
        "action": "reinstall_dependencies",
        "success": true,
        "installed": ["npm"],
        "output": "added 42 packages in 5.2s",
        "duration": 5234
      },
      {
        "action": "run_migrations",
        "success": true,
        "migrations": [
          {
            "file": "prisma/migrations/20231028_add_users.sql",
            "applied": true
          }
        ],
        "output": "Applied 1 migration",
        "duration": 1523
      },
      {
        "action": "restart_services",
        "success": true,
        "services": ["api", "worker"],
        "restartOrder": [["postgres"], ["api", "worker"]],
        "status": {
          "postgres": "running",
          "api": "running",
          "worker": "running"
        },
        "duration": 15234
      }
    ],
    "errors": []
  }
}
```

**Conflict Response**:
```json
{
  "success": false,
  "conflicts": ["package.json", "src/auth.js"],
  "rollbackCommit": "abc123",
  "message": "2 file(s) have conflicts"
}
```

**Status Codes**:
- `200`: Success or conflicts
- `400`: Invalid input
- `500`: Server error

#### Analyze Changes

```http
GET /api/worktrees/:name/analyze-changes?commits=sha1,sha2,sha3
```

**Parameters**:
- `name` (path): Worktree name
- `commits` (query): Comma-separated commit SHAs

**Response**:
```json
{
  "needsServiceRestart": true,
  "needsDependencyInstall": true,
  "needsMigration": {
    "hasMigrations": true,
    "count": 2,
    "files": [
      "prisma/migrations/20231028_add_users.sql",
      "prisma/migrations/20231028_add_posts.sql"
    ]
  },
  "affectedServices": ["api", "worker"],
  "changedFiles": [
    "package.json",
    "docker-compose.yml",
    "prisma/migrations/20231028_add_users.sql",
    "src/api.js"
  ],
  "summary": {
    "total": 15,
    "services": ["docker-compose.yml"],
    "dependencies": ["package.json"],
    "migrations": ["prisma/migrations/..."],
    "code": ["src/api.js"]
  }
}
```

#### Rollback Sync

```http
POST /api/worktrees/:name/rollback
```

**Parameters**:
- `name` (path): Worktree name

**Request Body**:
```json
{
  "commitSha": "abc123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Rolled back to commit abc123"
}
```

#### Manual Smart Reload

```http
POST /api/worktrees/:name/smart-reload
```

**Parameters**:
- `name` (path): Worktree name

**Request Body**:
```json
{
  "commits": ["abc123", "def456"],
  "skipDependencies": false,
  "skipMigrations": false,
  "skipRestart": false,
  "continueOnError": false
}
```

**Response**:
```json
{
  "success": true,
  "actions": [
    { "action": "reinstall_dependencies", "success": true, ... },
    { "action": "run_migrations", "success": true, ... },
    { "action": "restart_services", "success": true, ... }
  ],
  "errors": []
}
```

---

### Conflict Resolution

#### List Conflicts

```http
GET /api/worktrees/:name/conflicts
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
[
  {
    "file": "package.json",
    "category": "dependency",
    "content": {
      "fullContent": "...",
      "conflicts": [
        {
          "lineStart": 10,
          "lineEnd": 15,
          "ours": "  \"react\": \"^18.2.0\"",
          "theirs": "  \"react\": \"^18.3.0\"",
          "ancestor": "  \"react\": \"^18.1.0\""
        }
      ],
      "conflictCount": 1
    },
    "resolvable": "dependency_version"
  },
  {
    "file": "src/auth.js",
    "category": "code",
    "content": {
      "fullContent": "...",
      "conflicts": [
        {
          "lineStart": 42,
          "lineEnd": 56,
          "ours": "function authenticate(user) {...}",
          "theirs": "function authenticate(user, options = {}) {...}",
          "ancestor": null
        }
      ],
      "conflictCount": 1
    },
    "resolvable": false
  }
]
```

**Conflict Categories**:
- `code` - Code files (`.js`, `.ts`, `.py`, etc.)
- `config` - Configuration files (`.yml`, `.json`, etc.)
- `dependency` - Dependency files (`package.json`, etc.)
- `documentation` - Documentation files (`.md`, `.txt`, etc.)

**Resolvable Values**:
- `false` - Requires manual resolution
- `"whitespace"` - Whitespace-only conflict
- `"dependency_version"` - Version bump conflict
- `"config_merge"` - Non-overlapping config change

#### Analyze Conflicts

```http
GET /api/worktrees/:name/conflicts/analyze
```

**Parameters**:
- `name` (path): Worktree name

**Response**:
```json
{
  "total": 3,
  "autoResolvable": 1,
  "manual": 2,
  "byCategory": {
    "code": 2,
    "dependency": 1
  },
  "conflicts": [
    {
      "file": "package.json",
      "category": "dependency",
      "resolvable": "dependency_version",
      "suggestion": "Auto-resolve: Accept newer dependency versions"
    },
    {
      "file": "src/auth.js",
      "category": "code",
      "resolvable": false,
      "suggestion": "Manual: Review code changes carefully - both sides modified function signature"
    },
    {
      "file": "src/utils.js",
      "category": "code",
      "resolvable": false,
      "suggestion": "Manual: Complex merge conflict - review full context"
    }
  ]
}
```

#### Auto-Resolve Conflict

```http
POST /api/worktrees/:name/conflicts/resolve
```

**Parameters**:
- `name` (path): Worktree name

**Request Body**:
```json
{
  "file": "package.json",
  "strategy": "auto"
}
```

**Strategy Values**:
- `"auto"` - Automatically detect and apply best strategy
- `"ours"` - Keep our changes
- `"theirs"` - Keep their changes
- `"both"` - Merge both (config files only)

**Response**:
```json
{
  "success": true,
  "file": "package.json",
  "strategy": "dependency_theirs",
  "message": "Dependency conflict resolved (using theirs - newer version)"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Cannot auto-resolve conflict in file"
}
```

#### Request AI Assistance

```http
POST /api/worktrees/:name/conflicts/ai-assist
```

**Parameters**:
- `name` (path): Worktree name

**Request Body**:
```json
{
  "file": "src/auth.js"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Conflict information sent to AI agent terminal"
}
```

**What happens**:
- Formatted conflict info sent to AI agent's terminal
- Includes file content, conflict markers, resolution suggestions
- Agent can review and manually resolve

---

### Agent Management

#### List Available Agents

```http
GET /api/agents
```

**Response**:
```json
[
  {
    "name": "claude",
    "displayName": "Claude Code",
    "icon": "🤖",
    "capabilities": [
      "MCP Support",
      "Code Generation",
      "Refactoring",
      "Testing",
      "Documentation"
    ],
    "installed": true,
    "available": true,
    "version": "1.5.0"
  },
  {
    "name": "codex",
    "displayName": "OpenAI Codex",
    "icon": "🔮",
    "capabilities": [
      "Code Generation",
      "Code Completion"
    ],
    "installed": false,
    "available": false,
    "version": null
  },
  {
    "name": "shell",
    "displayName": "Shell",
    "icon": "💻",
    "capabilities": ["Manual Control"],
    "installed": true,
    "available": true,
    "version": "system"
  }
]
```

#### Get Agent Info

```http
GET /api/agents/:name
```

**Parameters**:
- `name` (path): Agent name

**Response**:
```json
{
  "name": "claude",
  "displayName": "Claude Code",
  "icon": "🤖",
  "capabilities": ["MCP Support", "Code Generation", "..."],
  "installed": true,
  "available": true,
  "version": "1.5.0",
  "configPath": ".claude",
  "needsCacheClear": true,
  "environmentVariables": {
    "CLAUDE_CONFIG": ".claude"
  }
}
```

#### Check Agent Availability

```http
GET /api/agents/availability
```

**Response**:
```json
{
  "claude": true,
  "codex": false,
  "gemini": false,
  "shell": true
}
```

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3335');

ws.onopen = () => {
  console.log('Connected to Vibe');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from Vibe');
};
```

### Message Format

**Client → Server**:
```json
{
  "event": "event-name",
  "data": { /* event-specific data */ }
}
```

**Server → Client**:
```json
{
  "event": "event-name",
  "data": { /* event-specific data */ }
}
```

### Events

#### Client → Server Events

##### `list-worktrees`

Request list of worktrees.

**Message**:
```json
{
  "event": "list-worktrees"
}
```

**Response**: `worktrees` event

##### `create-worktree`

Create new worktree.

**Message**:
```json
{
  "event": "create-worktree",
  "data": {
    "branch": "feature/auth",
    "fromBranch": "main",
    "agent": "claude"
  }
}
```

**Response**: `worktree-created` or `error` event

##### `delete-worktree`

Delete worktree.

**Message**:
```json
{
  "event": "delete-worktree",
  "data": {
    "name": "feature-auth"
  }
}
```

**Response**: `worktree-deleted` or `error` event

##### `start-services`

Start worktree services.

**Message**:
```json
{
  "event": "start-services",
  "data": {
    "name": "feature-auth",
    "services": ["api", "postgres"]
  }
}
```

**Response**: `services-started` or `error` event

##### `stop-services`

Stop worktree services.

**Message**:
```json
{
  "event": "stop-services",
  "data": {
    "name": "feature-auth",
    "services": ["api"]
  }
}
```

**Response**: `services-stopped` or `error` event

##### `connect-terminal`

Connect to worktree terminal.

**Message**:
```json
{
  "event": "connect-terminal",
  "data": {
    "name": "feature-auth",
    "command": "claude"
  }
}
```

**Command values**:
- `"claude"` - Claude Code
- `"codex"` - OpenAI Codex
- `"gemini"` - Google Gemini
- `"shell"` - System shell

**Response**: `terminal-ready` or `error` event

##### `terminal-input`

Send input to terminal.

**Message**:
```json
{
  "event": "terminal-input",
  "data": {
    "name": "feature-auth",
    "input": "ls -la\n"
  }
}
```

**Response**: Terminal output via `terminal-output` event

##### `terminal-resize`

Resize terminal.

**Message**:
```json
{
  "event": "terminal-resize",
  "data": {
    "name": "feature-auth",
    "cols": 120,
    "rows": 40
  }
}
```

##### `sync-worktree`

Sync worktree with main branch.

**Message**:
```json
{
  "event": "sync-worktree",
  "data": {
    "name": "feature-auth",
    "strategy": "merge",
    "smartReload": true
  }
}
```

**Response**: `sync-complete`, `sync-conflicts`, or `error` event

#### Server → Client Events

##### `worktrees`

List of worktrees (response to `list-worktrees`).

**Message**:
```json
{
  "event": "worktrees",
  "data": [
    {
      "name": "feature-auth",
      "path": "/project/.worktrees/feature-auth",
      "branch": "feature/auth",
      "ports": { "api": 3000 },
      "services": { "api": "running" },
      "agent": "claude"
    }
  ]
}
```

##### `worktree-created`

Worktree created successfully.

**Message**:
```json
{
  "event": "worktree-created",
  "data": {
    "name": "feature-auth",
    "path": "/project/.worktrees/feature-auth",
    "branch": "feature/auth",
    "ports": { "api": 3000 },
    "agent": "claude"
  }
}
```

##### `worktree-deleted`

Worktree deleted successfully.

**Message**:
```json
{
  "event": "worktree-deleted",
  "data": {
    "name": "feature-auth"
  }
}
```

##### `services-started`

Services started.

**Message**:
```json
{
  "event": "services-started",
  "data": {
    "name": "feature-auth",
    "services": {
      "api": "running",
      "postgres": "running"
    }
  }
}
```

##### `services-stopped`

Services stopped.

**Message**:
```json
{
  "event": "services-stopped",
  "data": {
    "name": "feature-auth",
    "services": {
      "api": "stopped"
    }
  }
}
```

##### `terminal-ready`

Terminal connected and ready.

**Message**:
```json
{
  "event": "terminal-ready",
  "data": {
    "name": "feature-auth",
    "command": "claude"
  }
}
```

##### `terminal-output`

Terminal output data.

**Message**:
```json
{
  "event": "terminal-output",
  "data": {
    "name": "feature-auth",
    "output": "Welcome to Claude Code!\n"
  }
}
```

##### `sync-complete`

Sync completed successfully.

**Message**:
```json
{
  "event": "sync-complete",
  "data": {
    "name": "feature-auth",
    "commitCount": 5,
    "smartReload": {
      "success": true,
      "actions": [...]
    }
  }
}
```

##### `sync-conflicts`

Sync resulted in conflicts.

**Message**:
```json
{
  "event": "sync-conflicts",
  "data": {
    "name": "feature-auth",
    "conflicts": ["package.json", "src/auth.js"]
  }
}
```

##### `sync-progress`

Sync progress update.

**Message**:
```json
{
  "event": "sync-progress",
  "data": {
    "name": "feature-auth",
    "step": "reinstall_dependencies",
    "message": "Installing dependencies...",
    "progress": 50
  }
}
```

##### `error`

Error occurred.

**Message**:
```json
{
  "event": "error",
  "data": {
    "message": "Worktree already exists",
    "code": "WORKTREE_EXISTS"
  }
}
```

**Error Codes**:
- `WORKTREE_EXISTS` - Worktree already exists
- `WORKTREE_NOT_FOUND` - Worktree not found
- `INVALID_BRANCH` - Invalid branch name
- `GIT_ERROR` - Git operation failed
- `CONTAINER_ERROR` - Container operation failed
- `AGENT_NOT_FOUND` - Agent not available

---

## Error Handling

### HTTP Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { /* optional additional info */ }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `WORKTREE_EXISTS` | 409 | Worktree already exists |
| `WORKTREE_NOT_FOUND` | 404 | Worktree not found |
| `INVALID_INPUT` | 400 | Invalid request parameters |
| `GIT_ERROR` | 500 | Git operation failed |
| `CONTAINER_ERROR` | 500 | Container operation failed |
| `AGENT_NOT_FOUND` | 404 | Agent not available |
| `SYNC_CONFLICT` | 200 | Sync resulted in conflicts (not an error) |
| `PERMISSION_DENIED` | 403 | Operation not allowed |

---

## Rate Limiting

**Not implemented yet**. Future versions will include:

- 100 requests per minute per IP
- 10 worktree operations per minute
- WebSocket: 1000 messages per minute

---

## Versioning

API version is included in responses:

```json
{
  "version": "1.0",
  "data": { /* ... */ }
}
```

**Breaking changes** will increment major version (2.0, 3.0, etc.)

**Non-breaking changes** will increment minor version (1.1, 1.2, etc.)

---

## Examples

### Complete Workflow: Create → Sync → Resolve Conflicts

```javascript
// 1. Create worktree
const createResponse = await fetch('http://localhost:3335/api/worktrees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    branch: 'feature/auth',
    fromBranch: 'main',
    agent: 'claude'
  })
});

const createResult = await createResponse.json();
console.log('Worktree created:', createResult.worktree.name);

// 2. Check for updates
const updatesResponse = await fetch(
  'http://localhost:3335/api/worktrees/feature-auth/check-updates'
);
const updates = await updatesResponse.json();

if (updates.hasUpdates) {
  console.log(`${updates.commitCount} commits behind main`);

  // 3. Sync with smart reload
  const syncResponse = await fetch(
    'http://localhost:3335/api/worktrees/feature-auth/sync',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: 'merge',
        smartReload: true
      })
    }
  );

  const syncResult = await syncResponse.json();

  if (syncResult.success) {
    console.log('Sync complete!');
    console.log('Actions:', syncResult.smartReload.actions);
  } else if (syncResult.conflicts) {
    console.log('Conflicts detected:', syncResult.conflicts);

    // 4. Analyze conflicts
    const conflictsResponse = await fetch(
      'http://localhost:3335/api/worktrees/feature-auth/conflicts/analyze'
    );
    const conflicts = await conflictsResponse.json();

    // 5. Auto-resolve what we can
    for (const conflict of conflicts.conflicts) {
      if (conflict.resolvable) {
        await fetch(
          'http://localhost:3335/api/worktrees/feature-auth/conflicts/resolve',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file: conflict.file,
              strategy: 'auto'
            })
          }
        );
        console.log(`Auto-resolved: ${conflict.file}`);
      }
    }

    // 6. Request AI help for complex conflicts
    for (const conflict of conflicts.conflicts) {
      if (!conflict.resolvable && conflict.category === 'code') {
        await fetch(
          'http://localhost:3335/api/worktrees/feature-auth/conflicts/ai-assist',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: conflict.file })
          }
        );
        console.log(`Sent to AI: ${conflict.file}`);
      }
    }
  }
}
```

### WebSocket Terminal Connection

```javascript
const ws = new WebSocket('ws://localhost:3335');

ws.onopen = () => {
  // Connect to terminal
  ws.send(JSON.stringify({
    event: 'connect-terminal',
    data: {
      name: 'feature-auth',
      command: 'claude'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.event === 'terminal-ready') {
    console.log('Terminal connected');
  } else if (message.event === 'terminal-output') {
    console.log('Output:', message.data.output);
  }
};

// Send input to terminal
function sendCommand(cmd) {
  ws.send(JSON.stringify({
    event: 'terminal-input',
    data: {
      name: 'feature-auth',
      input: cmd + '\n'
    }
  }));
}

// Example: Send command
sendCommand('ls -la');
```

---

## References

- [Configuration Guide](configuration.md) - API configuration
- [Git Sync Guide](git-sync.md) - Sync API details
- [Architecture Guide](architecture.md) - API design patterns

---

**Last Updated**: 2025-10-28
**Version**: 1.0
